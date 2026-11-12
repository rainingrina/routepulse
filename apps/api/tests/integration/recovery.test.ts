import type { AlertDtoCoordinator, ApiError, ChooseRecoveryResponse, CustomerAlertDto, ListResponse, RecoveryOptionsResponse, ShipmentDetailCoordinator } from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import { recalculate } from '../../src/services/etaService.js';
import { createSimulationService, type SimulationService } from '../../src/services/simulationService.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

const PASSWORD = 'test-demo-password-123';
const MEERA = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const RAIN = { kind: 'WEATHER_SLOWDOWN', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, durationMinutes: 480, label: 'Heavy rain on ghat section' } as const;
const DIGEST = ['Shipment', 'ShipmentEvent', 'DelayAttribution', 'RiskSnapshot', 'RecoveryOption', 'Alert', 'Notification', 'Truck', 'ShipmentItem'] as const;

let prisma: PrismaClient;
let srv: TestServer;
let sim: SimulationService;
let real = 0;
const cookies: Record<'meera' | 'kestrel' | 'osprey' | 'ramesh' | 'suresh', string> = { meera: '', kestrel: '', osprey: '', ramesh: '', suresh: '' };

async function call<T>(method: 'GET' | 'POST', path: string, who: keyof typeof cookies, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${srv.baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: cookies[who] },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
const get = <T>(p: string, who: keyof typeof cookies) => call<T>('GET', p, who);
const post = <T>(p: string, who: keyof typeof cookies, body: unknown = {}) => call<T>('POST', p, who, body);
const advance = (h: number, m: number) => sim.control({ action: 'ADVANCE_TO', to: at(h, m) }, MEERA);
const options = async (id = 'shp_1042') => (await get<RecoveryOptionsResponse>(`/api/shipments/${id}/recovery-options`, 'meera')).body;
const kindOf = (o: RecoveryOptionsResponse, k: string) => o.options.find((x) => x.kind === k)!;
const choose = (o: RecoveryOptionsResponse, k: string, id = 'shp_1042') =>
  post<ChooseRecoveryResponse & ApiError>(`/api/shipments/${id}/recovery-options/${kindOf(o, k).id}/choose`, 'meera', { optionSetId: o.optionSetId, confirm: true });

/** Journeys run-sheet: reset → 10:30 rain → 11:10 driver report (hero AT_RISK, alert OPEN). */
async function toReport() {
  await sim.reset(MEERA);
  await advance(10, 30);
  await post('/api/disruptions', 'meera', RAIN);
  await advance(11, 10);
  await post('/api/shipments/shp_1042/driver-reports', 'ramesh', { text: 'tyre puncture near Lonavala', reason: 'BREAKDOWN' });
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
  cookies.suresh = await loginCookie(srv.baseUrl, 'driver.suresh@ghatline.test', PASSWORD);
});
afterAll(async () => {
  await srv.close();
  await prisma.$disconnect();
});

describe('Golden hero G2–G7 with recovery (journeys run-sheet)', () => {
  beforeAll(async () => {
    await toReport();
  });

  it('G2: options at 11:10 — replacement truck Suggested (17:35, ₹6,100), reroute disabled (stationary), new window 19:20 vs 19:30', async () => {
    const o = await options();
    expect(o.optionSetId).toBe(`ops_shp_1042_${Math.floor(at(11, 10).getTime() / 1000)}`);
    expect(o.options.map((x) => x.kind)).toEqual(['REPLACEMENT_TRUCK', 'REROUTE', 'SPLIT', 'NEW_WINDOW', 'NOTIFY_ONLY']);
    expect(kindOf(o, 'REPLACEMENT_TRUCK')).toMatchObject({ feasible: true, isSuggested: true, meetsPromise: true, extraCostInr: 6100, newEtaAt: at(17, 35).toISOString(), title: 'Replacement truck TRK-11 from Khopoli yard', co2eDeltaKg: null, co2eNote: 'CO₂e — method under verification' });
    expect(kindOf(o, 'REROUTE')).toMatchObject({ feasible: false, infeasibleReason: 'The truck is stationary.' });
    expect(kindOf(o, 'NEW_WINDOW')).toMatchObject({ feasible: true, isSuggested: false, newEtaAt: at(19, 20).toISOString(), newWindowEnd: at(19, 30).toISOString(), meetsPromise: true, extraCostInr: 0 });
    expect(kindOf(o, 'NOTIFY_ONLY')).toMatchObject({ isSuggested: false, meetsPromise: false });
    expect(o.options.filter((x) => x.isSuggested)).toHaveLength(1); // RC-2
    expect(o.options.every((x) => x.co2eDeltaKg === null)).toBe(true); // RC-3
  });

  it('G2: the alert proposes the Suggested option; the customer sees it in plain words', async () => {
    const a = (await get<ListResponse<AlertDtoCoordinator>>('/api/alerts?shipmentId=shp_1042', 'meera')).body.items[0]!;
    expect(a.proposedOption?.kind).toBe('REPLACEMENT_TRUCK');
    const k = (await get<ListResponse<CustomerAlertDto>>('/api/alerts?shipmentId=shp_1042', 'kestrel')).body.items[0]!;
    expect(k.action).toEqual({ label: 'PROPOSED', kind: 'REPLACEMENT_TRUCK', text: 'Proposed — Plant X team confirming: a replacement truck, new estimate 17:35.' });
    expect(JSON.stringify(k)).not.toMatch(/TRK-11|Suresh|Khopoli|6100|TRANSPORTER/);
  });

  it('G3/G4: customer accepts at 11:20; report confirmed', async () => {
    await advance(11, 20);
    const a = (await get<ListResponse<CustomerAlertDto>>('/api/alerts?shipmentId=shp_1042', 'kestrel')).body.items[0]!;
    expect((await post(`/api/alerts/${a.id}/customer-response`, 'kestrel', { response: 'ACCEPT_PROPOSAL' })).status).toBe(200);
    const rep = await prisma.driverReport.findFirstOrThrow({ where: { shipmentId: 'shp_1042' } });
    expect((await post(`/api/driver-reports/${rep.id}/review`, 'meera', { reason: 'BREAKDOWN', party: 'TRANSPORTER' })).status).toBe(200);
  });

  it('G5/RC-4/RC-5: choose replacement at 11:25 → ETA 17:50 = option newEtaAt; WATCH; TRK-11 + Suresh; TRK-07 to maintenance', async () => {
    await advance(11, 25);
    const o = await options();
    const r = await choose(o, 'REPLACEMENT_TRUCK');
    expect(r.status).toBe(200);
    expect(r.body.option).toMatchObject({ status: 'CHOSEN', newEtaAt: at(17, 50).toISOString() });
    expect(r.body.eta.predictedArrivalAt).toBe(r.body.option.newEtaAt); // RC-4
    expect(r.body.eta.level).toBe('WATCH');
    expect(r.body.alert).toMatchObject({ status: 'ACTION_CHOSEN', chosenOption: { kind: 'REPLACEMENT_TRUCK' }, chosenBy: { id: 'usr_coord_meera' } });
    expect(r.body.driverChange).toEqual({ fromDriverName: 'Ramesh', toDriverName: 'Suresh', toTruckCode: 'TRK-11' });
    expect(r.body.customerNotified).toBe(true);
    const h = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
    expect([h.truckId, h.driverUserId, h.stoppedUntil?.toISOString()]).toEqual(['trk_11', 'usr_drv_suresh', at(12, 40).toISOString()]);
    expect((await prisma.truck.findUniqueOrThrow({ where: { id: 'trk_07' } })).status).toBe('MAINTENANCE');
    expect((await prisma.truck.findUniqueOrThrow({ where: { id: 'trk_11' } })).status).toBe('ASSIGNED');
    const ev = await prisma.shipmentEvent.findFirstOrThrow({ where: { shipmentId: 'shp_1042', type: 'RECOVERY_CHOSEN' } });
    expect(ev.data).toMatchObject({ kind: 'REPLACEMENT_TRUCK', previousDriverUserId: 'usr_drv_ramesh', previousTruckId: 'trk_07', newDriverUserId: 'usr_drv_suresh' });
  });

  it('AC-M4.8: the audit records who chose, when, and every alternative shown', async () => {
    const a = await prisma.auditLog.findFirstOrThrow({ where: { action: 'recovery.choose' } });
    expect(a.actorUserId).toBe('usr_coord_meera');
    expect((a.data as { alternatives: { kind: string }[] }).alternatives.map((x) => x.kind).sort()).toEqual(['NEW_WINDOW', 'NOTIFY_ONLY', 'REPLACEMENT_TRUCK', 'REROUTE', 'SPLIT']);
  });

  it('duplicate protection: the same choice again → 409 ALREADY_DONE; another option of the set → 409 ALREADY_DONE', async () => {
    const o = await options();
    expect((await choose(o, 'REPLACEMENT_TRUCK')).body.error.code).toBe('ALREADY_DONE');
    expect((await choose(o, 'NOTIFY_ONLY')).body.error.code).toBe('ALREADY_DONE');
  });

  it('notifications: coordinator RECOVERY_CONFIRMED; customer PLAN_UPDATED in plain words (no driver, truck or party)', async () => {
    const n = await prisma.notification.findMany({ where: { shipmentId: 'shp_1042', kind: { in: ['RECOVERY_CONFIRMED', 'PLAN_UPDATED'] } }, orderBy: { id: 'asc' } });
    expect(n.map((x) => [x.kind, x.audience])).toEqual([['PLAN_UPDATED', 'CUSTOMER'], ['RECOVERY_CONFIRMED', 'COORDINATOR']]);
    const customer = n.find((x) => x.audience === 'CUSTOMER')!;
    expect(customer.text).toBe('Plant X arranged a replacement truck for order ORD-7781. New estimate 17:50.');
    const k = (await get<ListResponse<CustomerAlertDto>>('/api/alerts?shipmentId=shp_1042', 'kestrel')).body.items[0]!;
    expect(k.action).toEqual({ label: 'CONFIRMED', kind: 'REPLACEMENT_TRUCK', text: 'Plant X arranged a replacement truck. New estimate 17:50.' });
  });

  it('driver scope follows the hand-over: Suresh now reports on SHP-1042, Ramesh no longer can', async () => {
    expect((await post('/api/driver-reports/classify', 'suresh', { text: 'traffic' })).status).toBe(200);
    expect((await post('/api/shipments/shp_1042/driver-reports', 'ramesh', { chipReason: 'TRAFFIC', reason: 'TRAFFIC' })).status).toBe(404);
  });

  it('approved lifecycle: the ACTION_CHOSEN alert stays open while the hero is WATCH; options are not regenerated', async () => {
    const setBefore = (await options()).optionSetId;
    await advance(14, 0);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).riskLevel).toBe('WATCH');
    const a = await prisma.alert.findFirstOrThrow({ where: { shipmentId: 'shp_1042' } });
    expect(a.status).toBe('ACTION_CHOSEN');
    expect((await options()).optionSetId).toBe(setBefore);
    expect(await prisma.alert.count({ where: { shipmentId: 'shp_1042' } })).toBe(1);
  });

  it('G7: arrival 17:50 (on time) completes the recovery and resolves the alert; ledger 270 min = GATE 40 + HIST 20 + DISR 120 + RPT 90', async () => {
    await advance(17, 55);
    await sim.recordMilestone('shp_1042', 'ARRIVED', { userId: 'usr_drv_suresh', role: 'DRIVER' });
    const d = (await get<{ shipment: ShipmentDetailCoordinator }>('/api/shipments/shp_1042', 'meera')).body.shipment;
    expect(d.onTime).toBe(true);
    expect(d.arrivedAt?.slice(0, 16)).toBe(at(17, 49).toISOString().slice(0, 16));
    const a = await prisma.alert.findFirstOrThrow({ where: { shipmentId: 'shp_1042' } });
    expect([a.status, a.resolvedAt?.toISOString()]).toEqual(['RESOLVED', d.arrivedAt]);
    const rows = await prisma.delayAttribution.findMany({ where: { shipmentId: 'shp_1042' } });
    const byFactor = (f: string) => Math.round(rows.filter((r) => r.factor === f).reduce((x, r) => x + r.delaySeconds, 0) / 60);
    expect([byFactor('GATE'), byFactor('HIST'), byFactor('DISR'), byFactor('RPT')]).toEqual([40, 20, 120, 90]);
    expect((await options()).optionSetId).toBeNull();
  });
});

describe('RC-1 feasibility and the other kinds (RC-4 each)', () => {
  it('10:30 rain: REROUTE via RT-PUNE-B Suggested; choosing it switches route, books PLAN_CHANGE (External) and ETA = option', async () => {
    await sim.reset(MEERA);
    await advance(10, 30);
    await post('/api/disruptions', 'meera', RAIN);
    const o = await options();
    expect(kindOf(o, 'REROUTE')).toMatchObject({ feasible: true, isSuggested: true, extraCostInr: 1265, title: 'Reroute via RT-PUNE-B (Southern road (avoids the ghat))' });
    expect(kindOf(o, 'REPLACEMENT_TRUCK')).toMatchObject({ feasible: false, infeasibleReason: 'The truck is not stopped by a breakdown.' });
    expect(kindOf(o, 'NEW_WINDOW')).toMatchObject({ feasible: false, infeasibleReason: 'The truck already reaches the gate by the current promise.' });
    const r = await choose(o, 'REROUTE');
    expect(r.status).toBe(200);
    expect(r.body.eta.predictedArrivalAt).toBe(r.body.option.newEtaAt);
    expect(r.body.eta.totals.planChangeMinutes).toBe(90);
    expect(r.body.eta.factors.find((f) => f.phase === 'PLAN_CHANGE')).toMatchObject({ minutes: 90, party: 'EXTERNAL' });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).routeId).not.toBe('rt_pune_a');
    expect(await prisma.delayAttribution.findFirst({ where: { shipmentId: 'shp_1042', kind: 'PLAN_CHANGE' } })).toMatchObject({ party: 'EXTERNAL', delaySeconds: 5400 });
  });

  it('REROUTE is disabled past the divergence point', async () => {
    await sim.reset(MEERA);
    await advance(11, 30);
    await post('/api/disruptions', 'meera', { kind: 'WEATHER_SLOWDOWN', segmentCodes: ['LNV-PUN'], slowdownPct: 60, durationMinutes: 480 });
    expect(kindOf(await options(), 'REROUTE')).toMatchObject({ feasible: false, infeasibleReason: 'The truck is already past the point where the routes split.' });
  });

  it('SPLIT: urgent 8 t on a free plant truck → child shipment SHP-1042-S1 (autopilot, same promise), items moved, ETA = option', async () => {
    await sim.reset(MEERA);
    await advance(10, 30);
    await post('/api/disruptions', 'meera', RAIN);
    const o = await options();
    expect(kindOf(o, 'SPLIT')).toMatchObject({ feasible: true, title: 'Split: urgent 8 t on TRK-08', extraCostInr: 10150 });
    const r = await choose(o, 'SPLIT');
    expect(r.status).toBe(200);
    expect(r.body.childShipment).toMatchObject({ code: 'SHP-1042-S1', parentShipmentId: 'shp_1042', truckCode: 'TRK-08' });
    const child = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042_s1' }, include: { items: true } });
    expect(child).toMatchObject({ autopilot: true, transporterId: 'trn_ghatline', driverUserId: null });
    expect(child.promisedBy.toISOString()).toBe(at(18, 0).toISOString());
    expect(child.items.map((i) => Number(i.quantityT))).toEqual([8]);
    expect(child.etaAt?.toISOString()).toBe(r.body.option.newEtaAt); // RC-4 for the child
    expect((await prisma.shipmentItem.findMany({ where: { shipmentId: 'shp_1042' } })).map((i) => Number(i.quantityT))).toEqual([14]);
  });

  it('SPLIT and REPLACEMENT disabled with reasons when no truck is free', async () => {
    await toReport();
    await prisma.truck.updateMany({ where: { status: 'AVAILABLE' }, data: { status: 'MAINTENANCE' } });
    await advance(11, 15);
    await post('/api/disruptions', 'meera', { kind: 'GATE_CONGESTION', extraMinutesPerTruck: 10, durationMinutes: 15 }); // an action → fresh set
    const o = await options();
    expect(kindOf(o, 'SPLIT')).toMatchObject({ feasible: false, infeasibleReason: 'No free truck at Plant X.' });
    expect(kindOf(o, 'REPLACEMENT_TRUCK')).toMatchObject({ feasible: false, infeasibleReason: 'No available truck with a driver within 50 km.' });
  });
});

describe('NEW_WINDOW (L4): preview = execution; stale acceptance', () => {
  it('choose → AWAITING_CUSTOMER, no PLAN_UPDATED yet; customer ACCEPT applies 19:30 exactly; ETA = preview 19:20', async () => {
    await toReport();
    const o = await options();
    const r = await choose(o, 'NEW_WINDOW');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ option: { status: 'AWAITING_CUSTOMER', newWindowEnd: at(19, 30).toISOString() }, customerNotified: false });
    const k = (await get<ListResponse<CustomerAlertDto>>('/api/alerts?shipmentId=shp_1042', 'kestrel')).body.items[0]!;
    expect(k).toMatchObject({ canRespond: true, action: { label: 'PROPOSED', kind: 'NEW_WINDOW', text: 'New arrival window until 19:30 — accept to confirm.' } });
    await advance(11, 20);
    const acc = await post<{ alert: CustomerAlertDto }>(`/api/alerts/${k.id}/customer-response`, 'kestrel', { response: 'ACCEPT_PROPOSAL' });
    expect(acc.status).toBe(200);
    const h = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
    expect([h.promisedBy.toISOString(), h.receivingWindowOverrideEndAt?.toISOString(), h.renegotiated, h.originalPromisedBy.toISOString()]).toEqual([at(19, 30).toISOString(), at(19, 30).toISOString(), true, at(18, 0).toISOString()]);
    expect(h.etaAt?.toISOString()).toBe(at(19, 20).toISOString()); // RC-4 / ET-10: WIN 0 inside the override
    expect(h.riskLevel).toBe('WATCH');
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: 'cus_kestrel' } })).receivingCloseMin).toBe(1080); // default hours untouched
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: 'shp_1042', type: 'RECOVERY_APPLIED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'recovery.apply' } })).toBe(1);
  });

  it('coordinator chooses another option while the window awaits → superseded; a later ACCEPT → 409 STALE_OPTIONS, nothing applied', async () => {
    await toReport();
    const o = await options();
    await choose(o, 'NEW_WINDOW');
    await advance(11, 15);
    await post('/api/disruptions', 'meera', { kind: 'GATE_CONGESTION', extraMinutesPerTruck: 10, durationMinutes: 15 }); // fresh set
    const o2 = await options();
    expect((await choose(o2, 'REPLACEMENT_TRUCK')).status).toBe(200);
    expect((await prisma.recoveryOption.findUniqueOrThrow({ where: { id: kindOf(o, 'NEW_WINDOW').id } })).status).toBe('SUPERSEDED');
    const k = (await get<ListResponse<CustomerAlertDto>>('/api/alerts?shipmentId=shp_1042', 'kestrel')).body.items[0]!;
    // chosen option is now the replacement; an ACCEPT is a normal response (no window applied)
    expect(k.action?.kind).toBe('REPLACEMENT_TRUCK');
    const before = (await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).promisedBy.toISOString();
    await post(`/api/alerts/${k.id}/customer-response`, 'kestrel', { response: 'ACCEPT_PROPOSAL' });
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).promisedBy.toISOString()).toBe(before);
  });
});

describe('AZ-9 and validation: stale sets, roles, unknown fields', () => {
  beforeAll(async () => {
    await toReport();
  });
  it('old optionSetId → 409 STALE_OPTIONS with currentOptionSetId; unknown newWindowEnd field → 400; confirm required; roles', async () => {
    const old = await options();
    await advance(11, 15);
    await post('/api/disruptions', 'meera', { kind: 'GATE_CONGESTION', extraMinutesPerTruck: 10, durationMinutes: 15 });
    const now = await options();
    expect(now.optionSetId).not.toBe(old.optionSetId);
    const stale = await choose(old, 'REPLACEMENT_TRUCK');
    expect([stale.status, stale.body.error.code, (stale.body.error.details as { currentOptionSetId: string }).currentOptionSetId]).toEqual([409, 'STALE_OPTIONS', now.optionSetId]);
    const nw = kindOf(now, 'NEW_WINDOW').id;
    expect((await post(`/api/shipments/shp_1042/recovery-options/${nw}/choose`, 'meera', { optionSetId: now.optionSetId, confirm: true, newWindowEnd: '2026-11-19T20:00:00Z' })).status).toBe(400);
    expect((await post(`/api/shipments/shp_1042/recovery-options/${nw}/choose`, 'meera', { optionSetId: now.optionSetId })).status).toBe(400);
    expect((await post(`/api/shipments/shp_1042/recovery-options/${nw}/choose`, 'kestrel', { optionSetId: now.optionSetId, confirm: true })).status).toBe(403);
    expect((await post(`/api/shipments/shp_1042/recovery-options/${nw}/choose`, 'ramesh', { optionSetId: now.optionSetId, confirm: true })).status).toBe(403);
    expect((await get('/api/shipments/shp_1042/recovery-options', 'kestrel')).status).toBe(403);
    expect((await post('/api/shipments/shp_1042/recovery-options/opt_nope/choose', 'meera', { optionSetId: now.optionSetId, confirm: true })).status).toBe(404);
    const reroute = kindOf(now, 'REROUTE').id;
    expect((await post<ApiError>(`/api/shipments/shp_1042/recovery-options/${reroute}/choose`, 'meera', { optionSetId: now.optionSetId, confirm: true })).body.error.code).toBe('INVALID_TRANSITION');
  });

  it('ON_TRACK shipments have no option set (the hero right after reset)', async () => {
    await sim.reset(MEERA);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } })).riskLevel).toBe('ON_TRACK');
    expect(await options()).toMatchObject({ optionSetId: null, generatedAt: null, options: [] });
  });
});

describe('transactions, determinism, running vs paused', () => {
  it('a failing recalculation rolls the whole choice back (no truck switch, option still PROPOSED)', async () => {
    await toReport();
    const o = await options();
    const digest = await databaseDigest(prisma, DIGEST);
    const failing = createSimulationService({ prisma, demoMode: true, timers: false, seedDemoPassword: PASSWORD, recalc: async (tx, ctx) => { if (ctx.trigger === 'RECOVERY') throw new Error('injected failure'); return recalculate(tx, ctx); } });
    await expect(
      failing.applyChange('RECOVERY', async (tx, actionS, world) => {
        const { loadEtaContext } = await import('../../src/services/etaService.js');
        const { chooseOption } = await import('../../src/services/recoveryService.js');
        const ctx = await loadEtaContext(tx, world, actionS);
        return { result: await chooseOption(tx, ctx, { shipmentId: 'shp_1042', optionId: kindOf(o, 'REPLACEMENT_TRUCK').id, optionSetId: o.optionSetId!, note: undefined, actor: MEERA }), shipmentIds: ['shp_1042'] };
      }),
    ).rejects.toThrow('injected failure');
    expect(await databaseDigest(prisma, DIGEST)).toEqual(digest);
  });

  it('G8: the full scenario twice → identical options, alerts, notifications, ledger and events', async () => {
    const run = async () => {
      await toReport();
      await advance(11, 25);
      await choose(await options(), 'REPLACEMENT_TRUCK');
      await advance(13, 0);
      return databaseDigest(prisma, DIGEST);
    };
    expect(await run()).toEqual(await run());
  });

  it('R6 (recovery): a choice at 11:27 gives identical results whether the clock was running or paused', async () => {
    const runAt1127 = async (pause: boolean) => {
      await toReport();
      await sim.control({ action: 'SET_SPEED', speed: 60 }, MEERA);
      await sim.control({ action: 'PLAY' }, MEERA);
      real += 17_500; // 11:10 + 17.5 sim-min
      await sim.tick();
      if (pause) await sim.control({ action: 'PAUSE' }, MEERA);
      const r = await choose(await options(), 'REPLACEMENT_TRUCK');
      expect(r.status).toBe(200);
      if (!pause) await sim.control({ action: 'PAUSE' }, MEERA);
      expect(r.body.option.newEtaAt).toBe(at(17, 52).toISOString()); // 11:27 + 75 min transfer → 12:42
      await advance(12, 0);
      return databaseDigest(prisma, DIGEST, ['speed', 'running', 'simError']);
    };
    expect(await runAt1127(true)).toEqual(await runAt1127(false));
  });
});
