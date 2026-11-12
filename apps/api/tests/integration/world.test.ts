import type {
  AlertDtoCoordinator,
  ApiError,
  AuditResponse,
  CreateDisruptionResponse,
  CustomerAlertDto,
  DisruptionDto,
  ListResponse,
  MapLayersResponse,
  NotificationsResponse,
  PositionsResponse,
  ReferenceResponse,
  ShipmentDetailCoordinator,
  ShipmentDetailCustomer,
  ShipmentListItemCoordinator,
  ShipmentListItemCustomer,
  SyncResponse,
  TimelineEvent,
} from '@routepulse/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import type { SimulationService } from '../../src/services/simulationService.js';
import { getPositions } from '../../src/services/readService.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

const PASSWORD = 'test-demo-password-123';
const MEERA = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const FRI = (h: number, m: number) => new Date(at(h, m).getTime() + 24 * 3600_000);
const RAIN = { kind: 'WEATHER_SLOWDOWN', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, durationMinutes: 480, label: 'Heavy rain on ghat section' } as const;

let prisma: PrismaClient;
let srv: TestServer;
let sim: SimulationService;
let real = 0;
const cookies: Record<'meera' | 'kestrel' | 'osprey' | 'ramesh', string> = { meera: '', kestrel: '', osprey: '', ramesh: '' };

async function call<T>(method: 'GET' | 'POST', path: string, who: keyof typeof cookies | null, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${srv.baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
const get = <T>(path: string, who: keyof typeof cookies | null) => call<T>('GET', path, who);
const post = <T>(path: string, who: keyof typeof cookies | null, body: unknown = {}) => call<T>('POST', path, who, body);
const advance = (h: number, m: number, day = 0) => sim.control({ action: 'ADVANCE_TO', to: new Date(at(h, m).getTime() + day * 86400_000) }, MEERA);
const report = () => post('/api/shipments/shp_1042/driver-reports', 'ramesh', { text: 'tyre puncture near Lonavala', reason: 'BREAKDOWN' });

/** Keys a customer response must never contain (AC-M1.6), at any depth. */
const FORBIDDEN = ['driver', 'phone', 'party', 'factors', 'reporter', 'topFactor', 'topReason', 'transporterId', 'riskScore', 'slackMinutes', 'confidence'];
function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (out.push(k), keysDeep(x, out));
  return out;
}

beforeAll(async () => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
  srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD }, simulation: { timers: false, realNow: () => real } });
  sim = (srv.app.locals as AppLocals).simulation;
  await sim.reset(MEERA);
  cookies.meera = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
  cookies.kestrel = await loginCookie(srv.baseUrl, 'buyer@kestrel.test', PASSWORD);
  cookies.osprey = await loginCookie(srv.baseUrl, 'buyer@osprey.test', PASSWORD);
  cookies.ramesh = await loginCookie(srv.baseUrl, 'driver.ramesh@ghatline.test', PASSWORD);
});
afterAll(async () => {
  await srv.close();
  await prisma.$disconnect();
});

describe('Phase A — #14 shipment list', () => {
  beforeEach(async () => {
    await sim.reset(MEERA);
  });

  it('coordinator: 12 live shipments, risk-sorted (score desc), with the cached pipeline values', async () => {
    const r = await get<ListResponse<ShipmentListItemCoordinator>>('/api/shipments', 'meera');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(12);
    const scores = r.body.items.map((x) => x.riskScore ?? -1);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const hero = r.body.items.find((x) => x.id === 'shp_1042');
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
    expect(hero).toMatchObject({
      view: 'coordinator', code: 'SHP-1042', orderCode: 'ORD-7781', customer: { id: 'cus_kestrel', name: 'Kestrel Moulders', city: 'Pune' },
      transporter: { name: 'Ghatline Carriers', isSmall: true }, truckCode: 'TRK-07', currentMilestone: 'IN_TRANSIT',
      etaAt: db.etaAt?.toISOString(), riskLevel: 'ON_TRACK', slackMinutes: 220, hasOpenAlert: false, pendingReportCount: 0, arrivedAt: null,
    });
  });

  it('filters: status, riskLevel (repeated), laneId, q, sort, limit; validation errors are 400', async () => {
    expect((await get<ListResponse<unknown>>('/api/shipments?status=delivered&limit=200', 'meera')).body.items).toHaveLength(177);
    const pune = (await get<ListResponse<ShipmentListItemCoordinator>>('/api/shipments?laneId=lane_pune', 'meera')).body.items;
    expect(pune.map((x) => x.code).sort()).toEqual(['SHP-1039', 'SHP-1041', 'SHP-1042', 'SHP-1046']);
    const levels = (await get<ListResponse<ShipmentListItemCoordinator>>('/api/shipments?riskLevel=ON_TRACK&riskLevel=AT_RISK', 'meera')).body.items;
    expect(levels.every((x) => x.riskLevel === 'ON_TRACK' || x.riskLevel === 'AT_RISK')).toBe(true);
    expect((await get<ListResponse<ShipmentListItemCoordinator>>('/api/shipments?q=1042', 'meera')).body.items.map((x) => x.code)).toEqual(['SHP-1042']);
    const byPromise = (await get<ListResponse<ShipmentListItemCoordinator>>('/api/shipments?sort=promise', 'meera')).body.items.map((x) => x.promisedBy);
    expect([...byPromise].sort()).toEqual(byPromise);
    expect((await get<ListResponse<unknown>>('/api/shipments?limit=3', 'meera')).body.items).toHaveLength(3);
    for (const q of ['status=open', 'riskLevel=BAD', 'sort=name', 'limit=0', 'limit=201', 'foo=1', `q=${'x'.repeat(33)}`, 'onTime=yes', 'arrivedFrom=yesterday']) {
      expect((await get<ApiError>(`/api/shipments?${q}`, 'meera')).status).toBe(400);
    }
  });

  it('customer: own company only, customer view, no internal fields; customerId filter → 400; driver → 403', async () => {
    const r = await get<ListResponse<ShipmentListItemCustomer>>('/api/shipments', 'kestrel');
    expect(r.status).toBe(200);
    expect(r.body.items.map((x) => x.code).sort()).toEqual(['SHP-1039', 'SHP-1041', 'SHP-1042', 'SHP-1046']);
    expect(r.body.items.every((x) => x.view === 'customer')).toBe(true);
    expect(r.body.items.find((x) => x.id === 'shp_1042')?.plainStatus).toBe('On the way · expected 14:20');
    for (const k of FORBIDDEN) expect(keysDeep(r.body)).not.toContain(k);
    expect((await get('/api/shipments?customerId=cus_osprey', 'kestrel')).status).toBe(400);
    expect((await get('/api/shipments', 'ramesh')).status).toBe(403);
    expect((await get('/api/shipments', null)).status).toBe(401);
  });
});

describe('Phase A — #15 detail, #16 timeline', () => {
  beforeAll(async () => {
    await sim.reset(MEERA);
  });

  it('coordinator detail: milestones with sources and actors, route, driver, progress, plan', async () => {
    const r = await get<{ shipment: ShipmentDetailCoordinator }>('/api/shipments/shp_1042', 'meera');
    expect(r.status).toBe(200);
    const s = r.body.shipment;
    expect(s).toMatchObject({ view: 'coordinator', route: { code: 'RT-PUNE-A', isPrimary: true, lengthKm: 130 }, driver: { id: 'usr_drv_ramesh', name: 'Ramesh' }, stopped: false, renegotiated: false, openAlert: null, childShipmentIds: [] });
    expect(s.progressKm).toBeCloseTo(25.6, 1);
    expect(s.plannedArrivalAt).toBe(at(13, 20).toISOString());
    expect(s.lastUpdateAt).toBe(at(10, 0).toISOString());
    expect(s.milestones.map((m) => [m.milestone, m.state, m.source, m.actorName])).toEqual([
      ['ORDER_CONFIRMED', 'DONE', 'SEED', null],
      ['TRUCK_ASSIGNED', 'DONE', 'SEED', null],
      ['AT_GATE', 'DONE', 'DRIVER', 'Ramesh'],
      ['LOADING', 'DONE', 'SIMULATION', null],
      ['GATE_OUT', 'DONE', 'DRIVER', 'Ramesh'],
      ['IN_TRANSIT', 'CURRENT', 'SYSTEM', null],
      ['ARRIVED', 'PENDING', null, null],
      ['DELIVERED', 'PENDING', null, null],
    ]);
    expect(s.items.map((i) => [i.gradeCode, i.quantityT, i.isUrgent]).sort()).toEqual([['PX-HD 520', 8, true], ['PX-PP 110', 14, false]]);
  });

  it('customer detail: plain ETA summary, milestones without actors, no driver or internal data; other customer 404; driver 403', async () => {
    const r = await get<{ shipment: ShipmentDetailCustomer }>('/api/shipments/shp_1042', 'kestrel');
    expect(r.status).toBe(200);
    expect(r.body.shipment).toMatchObject({ view: 'customer', eta: { view: 'customer', predictedArrivalAt: at(14, 20).toISOString(), level: 'ON_TRACK', isRuleBased: true }, openAlert: null });
    expect(r.body.shipment.milestones.every((m) => m.actorName === null)).toBe(true);
    for (const k of FORBIDDEN) expect(keysDeep(r.body)).not.toContain(k);
    expect(JSON.stringify(r.body)).not.toContain('Ramesh');
    expect((await get('/api/shipments/shp_1042', 'osprey')).status).toBe(404);
    expect((await get('/api/shipments/shp_1042', 'ramesh')).status).toBe(403);
    expect((await get('/api/shipments/shp_nope', 'meera')).status).toBe(404);
  });

  it('timeline: coordinator sees every event with actors; customer only milestones/notices/recovery, no actors', async () => {
    const c = await get<ListResponse<TimelineEvent>>('/api/shipments/shp_1042/timeline', 'meera');
    expect(c.body.items.map((e) => e.summary)).toContain('At plant gate');
    expect(c.body.items.find((e) => e.milestone === 'AT_GATE')?.actorName).toBe('Ramesh');
    const k = await get<ListResponse<TimelineEvent>>('/api/shipments/shp_1042/timeline', 'kestrel');
    expect(k.body.items.every((e) => ['MILESTONE', 'CUSTOMER_NOTIFIED', 'RECOVERY_CHOSEN'].includes(e.type) && e.actorName === null)).toBe(true);
    const sims = c.body.items.map((e) => e.simTime);
    expect([...sims].sort()).toEqual(sims);
  });
});

describe('Phase A — #10 map layers, #11 positions, #37 audit, #38 reference', () => {
  beforeAll(async () => {
    await sim.reset(MEERA);
  });

  it('map layers: coordinator gets everything, routes keep the HAND_TRACED_DEMO marker; customer own site/lane; driver own route', async () => {
    const c = (await get<MapLayersResponse>('/api/map/layers', 'meera')).body;
    expect(c.plant).toEqual({ name: 'Plant X', lat: 19.0326, lng: 73.1175 });
    expect(c.sites).toHaveLength(6);
    expect(c.routes).toHaveLength(9);
    expect(c.routes.every((r) => r.geometry.x_source === 'HAND_TRACED_DEMO' && r.geometry.coordinates.length >= 2)).toBe(true);
    expect(c.sites.find((s) => s.customerId === 'cus_kestrel')?.receivingHours).toBe('08:00–18:00');
    const k = (await get<MapLayersResponse>('/api/map/layers', 'kestrel')).body;
    expect(k.sites.map((s) => s.customerId)).toEqual(['cus_kestrel']);
    expect(k.routes.map((r) => r.code).sort()).toEqual(['RT-PUNE-A', 'RT-PUNE-B']);
    expect(k.activeDisruptions).toEqual([]);
    const d = (await get<MapLayersResponse>('/api/map/layers', 'ramesh')).body;
    expect(d.routes.map((r) => r.code)).toEqual(['RT-PUNE-A']);
    expect(d.sites.map((s) => s.customerId)).toEqual(['cus_kestrel']);
  });

  it('positions: live shipments in scope; hero ≈ 19.7 % along RT-PUNE-A; customers see only their own', async () => {
    const c = (await get<PositionsResponse>('/api/tracking/positions', 'meera')).body;
    expect(c.simTime).toBe(at(10, 25).toISOString());
    expect(c.items).toHaveLength(12);
    const hero = c.items.find((x) => x.shipmentId === 'shp_1042');
    expect(hero).toMatchObject({ code: 'SHP-1042', currentMilestone: 'IN_TRANSIT', riskLevel: 'ON_TRACK', stopped: false });
    expect(hero?.progressPct).toBeCloseTo(19.7, 1);
    expect(hero?.lat).toBeGreaterThan(18.5);
    const k = (await get<PositionsResponse>('/api/tracking/positions', 'kestrel')).body;
    expect(k.items.map((x) => x.code)).toEqual(['SHP-1039', 'SHP-1041', 'SHP-1042', 'SHP-1046']);
    const d = (await get<PositionsResponse>('/api/tracking/positions', 'ramesh')).body;
    expect(d.items.map((x) => x.code)).toEqual(['SHP-1042']);
  });

  it('positions extrapolate between grid steps with the same engine, without writing anything', async () => {
    await sim.control({ action: 'SET_SPEED', speed: 60 }, MEERA);
    await sim.control({ action: 'PLAY' }, MEERA);
    real += 2_500; // 2.5 sim-minutes: no grid boundary crossed
    await sim.tick();
    await sim.control({ action: 'PAUSE' }, MEERA);
    const digest = await databaseDigest(prisma, ['Shipment']);
    const p = await sim.readNow((db, w, settledS, nowS) => getPositions(db, w, { id: 'usr_coord_meera', role: 'COORDINATOR', name: 'Meera', email: '', customerId: null, transporterId: null }, settledS, nowS));
    expect(p.simTime).toBe(new Date(at(10, 27).getTime() + 30_000).toISOString());
    expect(p.items.find((x) => x.shipmentId === 'shp_1042')?.progressPct).toBeGreaterThan(19.7);
    expect((await databaseDigest(prisma, ['Shipment']))['Shipment']).toEqual(digest['Shipment']);
  });

  it('audit: coordinator only; filters by shipment (incl. its reports and alerts); validated', async () => {
    const a = await get<AuditResponse>('/api/audit?limit=5', 'meera');
    expect(a.status).toBe(200);
    expect(a.body.items.length).toBeLessThanOrEqual(5);
    expect(a.body.items.some((i) => i.action === 'sim.reset')).toBe(true);
    expect((await get('/api/audit', 'kestrel')).status).toBe(403);
    expect((await get('/api/audit', 'ramesh')).status).toBe(403);
    expect((await get('/api/audit?limit=999', 'meera')).status).toBe(400);
    expect((await get('/api/audit?bogus=1', 'meera')).status).toBe(400);
    const hero = (await get<AuditResponse>('/api/audit?shipmentId=shp_1042', 'meera')).body.items.map((i) => i.action);
    expect(hero).toContain('milestone.record');
    expect(hero).not.toContain('sim.reset');
  });

  it('reference: lanes, routes, de-duplicated segments, transporters, trucks; coordinator only', async () => {
    const r = await get<ReferenceResponse>('/api/reference', 'meera');
    expect(r.status).toBe(200);
    expect(r.body.segments.find((s) => s.segmentCode === 'KHP-LNV-GHAT')?.routeCodes).toEqual(['RT-PUNE-A']);
    expect(r.body.segments.find((s) => s.segmentCode === 'PLT-KHP')?.routeCodes.sort()).toEqual(['RT-PUNE-A', 'RT-PUNE-B']);
    expect(r.body.trucks.find((t) => t.code === 'TRK-11')).toMatchObject({ status: 'AVAILABLE', hasDefaultDriver: true });
    expect((await get('/api/reference', 'kestrel')).status).toBe(403);
  });
});

describe('Phase B — #7–#9 disruptions through the pipeline', () => {
  beforeEach(async () => {
    await sim.reset(MEERA);
    await advance(10, 30);
  });

  it('rain on the ghat: 201 with impact; the engine (not the endpoint) moves the hero to WATCH 16:20', async () => {
    const r = await post<CreateDisruptionResponse>('/api/disruptions', 'meera', RAIN);
    expect(r.status).toBe(201);
    expect(r.body.disruption).toMatchObject({ kind: 'WEATHER_SLOWDOWN', origin: 'SIMULATOR', party: 'EXTERNAL', reason: 'HEAVY_RAIN', slowdownPct: 65, active: true, startsAt: at(10, 30).toISOString(), endsAt: at(18, 30).toISOString() });
    expect(r.body.impact.affectedShipmentIds).toContain('shp_1042');
    expect(r.body.impact.levelChanges).toContainEqual({ shipmentId: 'shp_1042', code: 'SHP-1042', from: 'ON_TRACK', to: 'WATCH' });
    expect(r.body.impact.summary).toMatch(/^\d+ shipments? affected · \d+ at risk/);
    const h = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
    expect(h.etaAt?.toISOString()).toBe(at(16, 20).toISOString());
    expect(await prisma.shipmentEvent.count({ where: { type: 'DISRUPTION_STARTED', shipmentId: 'shp_1042' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'disruption.create' } })).toBe(1);
    const layers = (await get<MapLayersResponse>('/api/map/layers', 'meera')).body;
    expect(layers.activeDisruptions.map((d) => d.label)).toEqual(['Heavy rain on ghat section']);
    const list = (await get<ListResponse<DisruptionDto>>('/api/disruptions?active=true', 'meera')).body;
    expect(list.items.map((d) => d.id)).toEqual([r.body.disruption.id]);
  });

  it('end early (#9): ETA returns to 14:20; second end → 409 ALREADY_DONE; unknown → 404', async () => {
    const r = await post<CreateDisruptionResponse>('/api/disruptions', 'meera', RAIN);
    await advance(10, 40);
    const e = await post<CreateDisruptionResponse>(`/api/disruptions/${r.body.disruption.id}/end`, 'meera');
    expect(e.status).toBe(200);
    expect(e.body.disruption).toMatchObject({ active: false, endedEarlyAt: at(10, 40).toISOString() });
    expect(e.body.impact.levelChanges).toContainEqual({ shipmentId: 'shp_1042', code: 'SHP-1042', from: 'WATCH', to: 'ON_TRACK' });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).etaAt?.toISOString()).toBe(at(14, 20).toISOString());
    const again = await post<ApiError>(`/api/disruptions/${r.body.disruption.id}/end`, 'meera');
    expect([again.status, again.body.error.code]).toEqual([409, 'ALREADY_DONE']);
    expect((await post('/api/disruptions/dis_nope/end', 'meera')).status).toBe(404);
  });

  it('validation and roles: unknown segment, ranges, fields per kind, breakdown target, customer/driver 403', async () => {
    const bad = [
      { ...RAIN, segmentCodes: ['NOPE-1'] },
      { ...RAIN, slowdownPct: 95 },
      { ...RAIN, durationMinutes: 17 },
      { ...RAIN, extraMinutesPerTruck: 10 },
      { kind: 'GATE_CONGESTION', extraMinutesPerTruck: 300, durationMinutes: 60 },
      { kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1042', repairMinutes: 5 },
      { kind: 'EARTHQUAKE' },
    ];
    for (const b of bad) expect((await post('/api/disruptions', 'meera', b)).status).toBe(400);
    const notMoving = await post<ApiError>('/api/disruptions', 'meera', { kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1047', repairMinutes: 60 });
    expect([notMoving.status, notMoving.body.error.code]).toEqual([409, 'INVALID_TRANSITION']);
    expect((await post('/api/disruptions', 'meera', { kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_nope', repairMinutes: 60 })).status).toBe(404);
    expect((await post('/api/disruptions', 'kestrel', RAIN)).status).toBe(403);
    expect((await post('/api/disruptions', 'ramesh', RAIN)).status).toBe(403);
    expect((await get('/api/disruptions', 'kestrel')).status).toBe(403);
  });

  it('gate congestion applies to trucks still at or before the gate', async () => {
    const r = await post<CreateDisruptionResponse>('/api/disruptions', 'meera', { kind: 'GATE_CONGESTION', extraMinutesPerTruck: 30, durationMinutes: 120 });
    expect(r.status).toBe(201);
    expect(r.body.disruption).toMatchObject({ party: 'PLANT', reason: 'PLANT_GATE_WAIT', label: 'Gate congestion at Plant X' });
    expect(r.body.impact.affectedShipmentIds).not.toContain('shp_1042');
  });
});

describe('Phase C/D/E — G2: alerts and notifications on the hero', () => {
  beforeAll(async () => {
    await sim.reset(MEERA);
    await advance(10, 30);
    await post('/api/disruptions', 'meera', RAIN);
  });

  it('rain alone (WATCH) opens no alert and notifies no one (spec §5.5)', async () => {
    expect(await prisma.alert.count({ where: { shipmentId: 'shp_1042' } })).toBe(0);
    expect(await prisma.notification.count({ where: { shipmentId: 'shp_1042' } })).toBe(0);
  });

  it('G2: 11:10 breakdown report → one OPEN alert, firstAtRiskAt 11:10, coordinator + customer notified in the same recalculation', async () => {
    await advance(11, 10);
    expect((await report()).status).toBe(201);
    const alerts = await prisma.alert.findMany({ where: { shipmentId: 'shp_1042' } });
    expect(alerts.map((a) => [a.status, a.topFactor, a.topReason, a.openedAt.toISOString()])).toEqual([['OPEN', 'RPT', 'BREAKDOWN', at(11, 10).toISOString()]]);
    const h = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
    expect(h.firstAtRiskAt?.toISOString()).toBe(at(11, 10).toISOString());
    expect(h.customerNotifiedAt?.toISOString()).toBe(at(11, 10).toISOString());
    const notes = await prisma.notification.findMany({ where: { shipmentId: 'shp_1042' }, orderBy: { id: 'asc' } });
    expect(notes.map((n) => [n.kind, n.audience, n.customerId])).toEqual([
      ['AT_RISK', 'COORDINATOR', null],
      ['AT_RISK_CUSTOMER', 'CUSTOMER', 'cus_kestrel'],
      ['REPORT_NEEDS_REVIEW', 'COORDINATOR', null],
    ]);
    const customerNote = notes.find((n) => n.kind === 'AT_RISK_CUSTOMER');
    expect(customerNote?.text).toBe('Order ORD-7781 is at risk of missing 18:00. New estimate Fri 08:00. Reason: Vehicle breakdown on the route. Plant X team is reviewing options.');
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: 'shp_1042', type: { in: ['ALERT_OPENED', 'CUSTOMER_NOTIFIED'] } } })).toBe(2);
  });

  it('AC-M4.7: staying at risk across many recalculations never duplicates the alert or its notifications', async () => {
    await advance(12, 30);
    expect(await prisma.alert.count({ where: { shipmentId: 'shp_1042' } })).toBe(1);
    expect(await prisma.notification.count({ where: { shipmentId: 'shp_1042', kind: { in: ['AT_RISK', 'AT_RISK_CUSTOMER'] } } })).toBe(2);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).firstAtRiskAt?.toISOString()).toBe(at(11, 10).toISOString());
  });

  it('#26/#27: coordinator view with summary; customer view in plain words (no codes, parties, driver)', async () => {
    const c = await get<ListResponse<AlertDtoCoordinator>>('/api/alerts', 'meera');
    const a = c.body.items.find((x) => x.shipment.id === 'shp_1042');
    expect(a).toMatchObject({ view: 'coordinator', status: 'OPEN', topFactor: 'RPT', topReason: 'BREAKDOWN', shipment: { code: 'SHP-1042', customerName: 'Kestrel Moulders' }, proposedOption: null });
    expect(a?.summary).toBe('At risk · top factor at opening: breakdown');
    const k = await get<ListResponse<CustomerAlertDto>>('/api/alerts', 'kestrel');
    // The rain also put other Kestrel (Pune) shipments at risk — real engine output; all are Kestrel's own.
    expect(k.body.items.every((x) => ['SHP-1039', 'SHP-1041', 'SHP-1042', 'SHP-1046'].includes(x.shipmentCode))).toBe(true);
    expect(k.body.items.find((x) => x.shipmentId === 'shp_1042')).toMatchObject({ view: 'customer', status: 'OPEN', orderCode: 'ORD-7781', plainReason: 'Vehicle breakdown on the route', action: null, canRespond: true, predictedArrivalAt: FRI(8, 0).toISOString() });
    for (const key of FORBIDDEN) expect(keysDeep(k.body)).not.toContain(key);
    expect((await get<ListResponse<CustomerAlertDto>>('/api/alerts', 'osprey')).body.items).toEqual([]);
    expect((await get(`/api/alerts/${a?.id}`, 'osprey')).status).toBe(404);
    expect((await get(`/api/alerts/${a?.id}`, 'kestrel')).status).toBe(200);
    expect((await get('/api/alerts', 'ramesh')).status).toBe(403);
    const detail = await get<{ shipment: ShipmentDetailCustomer }>('/api/shipments/shp_1042', 'kestrel');
    expect(detail.body.shipment.openAlert?.plainReason).toBe('Vehicle breakdown on the route');
  });

  it('#28 G3-part: the customer responds; coordinator notified; recorded on the alert and the shipment; audit', async () => {
    const a = (await get<ListResponse<CustomerAlertDto>>('/api/alerts?shipmentId=shp_1042', 'kestrel')).body.items[0] as CustomerAlertDto;
    await advance(12, 35);
    const r = await post<{ alert: CustomerAlertDto }>(`/api/alerts/${a.id}/customer-response`, 'kestrel', { response: 'ACCEPT_PROPOSAL' });
    expect(r.status).toBe(200);
    expect(r.body.alert).toMatchObject({ customerResponse: 'ACCEPT_PROPOSAL', customerRespondedAt: at(12, 35).toISOString() });
    expect((await post(`/api/alerts/${a.id}/customer-response`, 'kestrel', { response: 'MAYBE' })).status).toBe(400);
    expect((await post(`/api/alerts/${a.id}/customer-response`, 'osprey', { response: 'REQUEST_CALL' })).status).toBe(404);
    expect((await post(`/api/alerts/${a.id}/customer-response`, 'meera', { response: 'REQUEST_CALL' })).status).toBe(403);
    expect(await prisma.notification.count({ where: { alertId: a.id, kind: 'CUSTOMER_RESPONDED', audience: 'COORDINATOR' } })).toBe(1);
    const coord = await get<{ shipment: ShipmentDetailCoordinator }>('/api/shipments/shp_1042', 'meera');
    expect(coord.body.shipment.latestCustomerResponse).toEqual({ response: 'ACCEPT_PROPOSAL', at: at(12, 35).toISOString() });
    expect(await prisma.auditLog.count({ where: { action: 'alert.customerResponse' } })).toBe(1);
  });

  it('#31–#33: scoped lists, unread counts, read one (idempotent), read all; sync shows the unread count', async () => {
    const c = await get<NotificationsResponse>('/api/notifications', 'meera');
    expect(c.body.items.every((n) => ['AT_RISK', 'REPORT_NEEDS_REVIEW', 'CUSTOMER_RESPONDED'].includes(n.kind) || n.shipmentCode !== 'SHP-1042')).toBe(true);
    const k = await get<NotificationsResponse>('/api/notifications', 'kestrel');
    expect(k.body.items.map((n) => n.kind)).toContain('AT_RISK_CUSTOMER');
    expect(k.body.items.every((n) => n.kind !== 'REPORT_NEEDS_REVIEW')).toBe(true);
    for (const key of FORBIDDEN) expect(keysDeep(k.body)).not.toContain(key);
    expect(JSON.stringify(k.body)).not.toMatch(/Ramesh|RPT|BREAKDOWN|TRANSPORTER/);
    const unread = k.body.unreadCount;
    const first = k.body.items.find((n) => n.readAt === null) as (typeof k.body.items)[number];
    const one = await post<{ notification: { readAt: string | null }; unreadCount: number }>(`/api/notifications/${first.id}/read`, 'kestrel');
    expect(one.status).toBe(200);
    expect(one.body.unreadCount).toBe(unread - 1);
    expect(one.body.notification.readAt).not.toBeNull();
    expect((await post<{ unreadCount: number }>(`/api/notifications/${first.id}/read`, 'kestrel')).body.unreadCount).toBe(unread - 1);
    const coordNote = c.body.items[0] as (typeof c.body.items)[number];
    expect((await post(`/api/notifications/${coordNote.id}/read`, 'kestrel')).status).toBe(404); // another audience
    expect((await get<SyncResponse>('/api/sync', 'meera')).body.unreadNotifications).toBe(c.body.unreadCount);
    const all = await post<{ updated: number; unreadCount: number }>('/api/notifications/read-all', 'meera');
    expect(all.body).toEqual({ updated: c.body.unreadCount, unreadCount: 0 });
    expect((await get<SyncResponse>('/api/sync', 'meera')).body.unreadNotifications).toBe(0);
    expect((await get('/api/notifications', 'ramesh')).status).toBe(403);
    expect((await get('/api/notifications?unreadOnly=maybe', 'meera')).status).toBe(400);
  });

  it('activity feed (#37) shows the alert and the report for the hero', async () => {
    const actions = (await get<AuditResponse>('/api/audit?shipmentId=shp_1042', 'meera')).body.items.map((i) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['alert.open', 'report.create', 'alert.customerResponse']));
  });

  it('arrival resolves the alert at arrivedAt (Fri 08:00) and sends ARRIVED_LATE with the main cause in plain words', async () => {
    await advance(8, 5, 1);
    await sim.recordMilestone('shp_1042', 'ARRIVED', { userId: 'usr_drv_ramesh', role: 'DRIVER' });
    const a = await prisma.alert.findFirstOrThrow({ where: { shipmentId: 'shp_1042' } });
    expect([a.status, a.resolvedAt?.toISOString()]).toEqual(['RESOLVED', FRI(8, 0).toISOString()]);
    const late = await prisma.notification.findMany({ where: { shipmentId: 'shp_1042', kind: 'ARRIVED_LATE' }, orderBy: { id: 'asc' } });
    expect(late.map((n) => [n.audience, n.text])).toEqual([
      ['COORDINATOR', 'SHP-1042 arrived 840 min after the promised time.'],
      ['CUSTOMER', 'Order ORD-7781 arrived 840 min after the promised time. Main cause: Vehicle breakdown on the route.'],
    ]);
    expect(await prisma.notification.count({ where: { shipmentId: 'shp_1042', kind: 'BACK_ON_TRACK' } })).toBe(0);
  });
});

describe('alert lifecycle: resolve when the level drops, new episode keeps firstAtRiskAt', () => {
  it('breakdown → OPEN; ended early → RESOLVED + BACK_ON_TRACK to both; a second breakdown opens a NEW alert', async () => {
    await sim.reset(MEERA);
    await advance(11, 10);
    const bd = await post<CreateDisruptionResponse>('/api/disruptions', 'meera', { kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1042', repairMinutes: 600 });
    expect(bd.status).toBe(201);
    expect(bd.body.impact).toMatchObject({ affectedShipmentIds: ['shp_1042'], nowAtRiskCount: 1 });
    expect(bd.body.impact.levelChanges).toContainEqual({ shipmentId: 'shp_1042', code: 'SHP-1042', from: 'ON_TRACK', to: 'AT_RISK' });
    const first = await prisma.alert.findFirstOrThrow({ where: { shipmentId: 'shp_1042' } });
    expect(first.status).toBe('OPEN');
    await advance(11, 30);
    await post(`/api/disruptions/${bd.body.disruption.id}/end`, 'meera');
    const resolved = await prisma.alert.findUniqueOrThrow({ where: { id: first.id } });
    expect([resolved.status, resolved.resolvedAt?.toISOString()]).toEqual(['RESOLVED', at(11, 30).toISOString()]);
    expect((await prisma.notification.findMany({ where: { alertId: first.id, kind: 'BACK_ON_TRACK' }, orderBy: { id: 'asc' } })).map((n) => n.audience)).toEqual(['COORDINATOR', 'CUSTOMER']);
    await advance(11, 40);
    await post('/api/disruptions', 'meera', { kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1042', repairMinutes: 600 });
    const all = await prisma.alert.findMany({ where: { shipmentId: 'shp_1042' }, orderBy: { openedAt: 'asc' } });
    expect(all.map((x) => [x.status, x.openedAt.toISOString()])).toEqual([['RESOLVED', at(11, 10).toISOString()], ['OPEN', at(11, 40).toISOString()]]);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).firstAtRiskAt?.toISOString()).toBe(at(11, 10).toISOString());
  });

  it('reproducible: the same scenario twice gives identical alerts, notifications and events (R1 extension)', async () => {
    const run = async () => {
      await sim.reset(MEERA);
      await advance(10, 30);
      await post('/api/disruptions', 'meera', RAIN);
      await advance(11, 10);
      await report();
      await advance(12, 0);
      return databaseDigest(prisma, ['Alert', 'Notification', 'ShipmentEvent', 'Disruption', 'DriverReport', 'RiskSnapshot', 'DelayAttribution']);
    };
    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
  });
});

describe('DEMO_MODE off', () => {
  it('disruption injection is refused with 403 DEMO_MODE_OFF', async () => {
    const off = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD, DEMO_MODE: 'false' }, simulation: { timers: false } });
    try {
      const cookie = await loginCookie(off.baseUrl, 'coordinator@plantx.test', PASSWORD);
      const res = await fetch(`${off.baseUrl}/api/disruptions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(RAIN) });
      expect(res.status).toBe(403);
      expect(((await res.json()) as ApiError).error.code).toBe('DEMO_MODE_OFF');
    } finally {
      await off.close();
    }
  });
});
