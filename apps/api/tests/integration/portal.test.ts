import type {
  ApiError,
  ChooseRecoveryResponse,
  DriverTripResponse,
  ListResponse,
  OrderDetail,
  OrderSummary,
  RecordMilestoneResponse,
  RecoveryOptionsResponse,
  ReplayResponse,
} from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import type { SimulationService } from '../../src/services/simulationService.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

/**
 * Milestone 9 portal endpoints: #12/#13 orders, #17 milestone taps and overrides, #19 replay
 * (golden G6, read-only), #21 driver trip and hand-overs. Real Express app + Node fetch.
 */

const PASSWORD = 'test-demo-password-123';
const MEERA = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const RAIN = { kind: 'WEATHER_SLOWDOWN', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, durationMinutes: 480, label: 'Heavy rain on ghat section' } as const;
const DIGEST = ['Shipment', 'ShipmentEvent', 'DelayAttribution', 'RiskSnapshot', 'RecoveryOption', 'Alert', 'Notification', 'Truck', 'AuditLog'] as const;

let prisma: PrismaClient;
let srv: TestServer;
let sim: SimulationService;
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
const tap = (who: keyof typeof cookies, milestone: string, id = 'shp_1042', note?: string) =>
  post<RecordMilestoneResponse & ApiError>(`/api/shipments/${id}/milestones`, who, { milestone, ...(note ? { note } : {}) });

/** Journeys run-sheet: reset → 10:30 rain → 11:10 report → 11:25 replacement truck chosen. */
async function heroWithReplacement() {
  await sim.reset(MEERA);
  await advance(10, 30);
  await post('/api/disruptions', 'meera', RAIN);
  await advance(11, 10);
  await post('/api/shipments/shp_1042/driver-reports', 'ramesh', { text: 'tyre puncture near Lonavala', reason: 'BREAKDOWN' });
  await advance(11, 25);
  const o = (await get<RecoveryOptionsResponse>('/api/shipments/shp_1042/recovery-options', 'meera')).body;
  const rep = o.options.find((x) => x.kind === 'REPLACEMENT_TRUCK')!;
  const r = await post<ChooseRecoveryResponse>(`/api/shipments/shp_1042/recovery-options/${rep.id}/choose`, 'meera', { optionSetId: o.optionSetId, confirm: true });
  expect(r.status).toBe(200);
}

beforeAll(async () => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
  srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD }, simulation: { timers: false, realNow: () => 0 } });
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

describe('#12 / #13 orders', () => {
  it('coordinator lists open orders across customers; customer sees only own; driver is forbidden', async () => {
    await sim.reset(MEERA);
    const all = await get<ListResponse<OrderSummary>>('/api/orders', 'meera');
    expect(all.status).toBe(200);
    expect(new Set(all.body.items.map((o) => o.customer.id)).size).toBeGreaterThan(1);
    expect(all.body.items.every((o) => o.status === 'OPEN')).toBe(true);
    const hero = all.body.items.find((o) => o.code === 'ORD-7781')!;
    expect(hero).toMatchObject({ customer: { id: 'cus_kestrel' }, shipmentCount: 1, status: 'OPEN', promisedBy: at(18, 0).toISOString() });
    expect(hero.lines).toEqual([{ gradeCode: 'PX-HD 520', quantityT: 8 }, { gradeCode: 'PX-PP 110', quantityT: 14 }]);

    const mine = await get<ListResponse<OrderSummary>>('/api/orders?status=all', 'kestrel');
    expect(mine.status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThan(0);
    expect(mine.body.items.every((o) => o.customer.id === 'cus_kestrel')).toBe(true);

    expect((await get<ApiError>('/api/orders', 'ramesh')).status).toBe(403);
    expect((await get<ApiError>('/api/orders/ord_does_not_matter', 'ramesh')).status).toBe(403);
  });

  it('derives DELIVERED status and filters; validation rejects bad and unknown query values', async () => {
    const delivered = await get<ListResponse<OrderSummary>>('/api/orders?status=delivered&limit=5', 'meera');
    expect(delivered.status).toBe(200);
    expect(delivered.body.items.length).toBe(5);
    expect(delivered.body.items.every((o) => o.status === 'DELIVERED' && o.worstRiskLevel === null)).toBe(true);
    const byCustomer = await get<ListResponse<OrderSummary>>('/api/orders?status=all&customerId=cus_osprey', 'meera');
    expect(byCustomer.body.items.every((o) => o.customer.id === 'cus_osprey')).toBe(true);

    const bad = await get<ApiError>('/api/orders?status=late&limit=0&colour=red', 'meera');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const custFilter = await get<ApiError>('/api/orders?customerId=cus_osprey', 'kestrel');
    expect(custFilter.status).toBe(400);
  });

  it('order detail: own order in the customer view without internal fields; other customers get 404', async () => {
    const list = await get<ListResponse<OrderSummary>>('/api/orders', 'meera');
    const heroOrder = list.body.items.find((o) => o.code === 'ORD-7781')!;
    const ospreyOrder = list.body.items.find((o) => o.customer.id === 'cus_osprey')!;

    const c = await get<OrderDetail>(`/api/orders/${heroOrder.id}`, 'meera');
    expect(c.status).toBe(200);
    expect(c.body.shipments).toHaveLength(1);
    expect(c.body.shipments[0]).toMatchObject({ view: 'coordinator', id: 'shp_1042' });

    const k = await get<OrderDetail>(`/api/orders/${heroOrder.id}`, 'kestrel');
    expect(k.status).toBe(200);
    expect(k.body.shipments[0]).toMatchObject({ view: 'customer', id: 'shp_1042', code: 'SHP-1042' });
    const raw = JSON.stringify(k.body);
    for (const leak of ['Ramesh', 'usr_drv', 'driver', 'party', 'factor', 'truckCode', 'riskScore', 'pendingReportCount']) expect(raw).not.toContain(leak);

    expect((await get<ApiError>(`/api/orders/${ospreyOrder.id}`, 'kestrel')).status).toBe(404);
    expect((await get<ApiError>('/api/orders/ord_missing', 'kestrel')).status).toBe(404);
  });
});

describe('#17 milestones', () => {
  it('rejects wrong roles, other drivers, system milestones, duplicates and early taps with plain reasons', async () => {
    await sim.reset(MEERA); // hero is IN_TRANSIT after the pre-script
    expect((await tap('kestrel', 'ARRIVED')).status).toBe(403);
    expect((await tap('suresh', 'ARRIVED')).status).toBe(404); // not his shipment = missing
    expect((await tap('ramesh', 'ARRIVED', 'shp_missing')).status).toBe(404);

    const loading = await tap('ramesh', 'LOADING');
    expect(loading.status).toBe(403);
    const inTransit = await tap('ramesh', 'IN_TRANSIT');
    expect(inTransit.status).toBe(409);
    expect(inTransit.body.error).toMatchObject({ code: 'INVALID_TRANSITION', message: 'In transit is recorded automatically after gate out.' });

    const dup = await tap('ramesh', 'GATE_OUT');
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_DONE');

    const early = await tap('ramesh', 'ARRIVED');
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('INVALID_TRANSITION');
    expect(early.body.error.message).toMatch(/^Truck is \d+ km from the destination\.$/);

    const unknown = await post<ApiError>('/api/shipments/shp_1042/milestones', 'ramesh', { milestone: 'ARRIVED', speed: 3 });
    expect(unknown.status).toBe(400);
    const badEnum = await post<ApiError>('/api/shipments/shp_1042/milestones', 'ramesh', { milestone: 'PARKED' });
    expect(badEnum.status).toBe(400);
    const noNote = await tap('meera', 'ARRIVED');
    expect(noNote.status).toBe(400);
    expect(JSON.stringify(noNote.body.error.details)).toContain('"path":"note"');
    const autopilot = await tap('meera', 'ARRIVED', 'shp_1043', 'Override for a test');
    expect(autopilot.status).toBe(409);
    expect(autopilot.body.error.message).toBe("This shipment's milestones are recorded by the simulation.");
  });

  it('driver taps ARRIVED then DELIVERED through the pipeline; times are never the tap time', async () => {
    await heroWithReplacement();
    await advance(17, 40);
    // After the replacement Suresh drives SHP-1042; Ramesh no longer can tap it.
    expect((await tap('ramesh', 'ARRIVED')).status).toBe(404);
    await advance(18, 5);
    const arrived = await tap('suresh', 'ARRIVED');
    expect(arrived.status).toBe(200);
    expect(arrived.body.shipment).toMatchObject({ view: 'driver', id: 'shp_1042', currentMilestone: 'ARRIVED', nextMilestone: 'DELIVERED', canRecordNext: false });
    expect((arrived.body.shipment as { nextBlockedReason: string }).nextBlockedReason).toMatch(/^Unloading finishes at \d\d:\d\d$/);
    const arrivedEntry = arrived.body.milestones.find((m) => m.milestone === 'ARRIVED')!;
    expect(arrivedEntry).toMatchObject({ state: 'CURRENT', source: 'DRIVER', actorName: null });
    // arrivedAt = eligible check-in (physical arrival 17:49:xx, window open), never the 18:05 tap (L6).
    expect(arrivedEntry.at?.slice(0, 16)).toBe(at(17, 49).toISOString().slice(0, 16));
    const row = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' }, select: { arrivedAt: true, onTime: true } });
    expect(row.arrivedAt?.toISOString()).toBe(arrivedEntry.at);
    expect(row.onTime).toBe(true);

    expect((await tap('suresh', 'ARRIVED')).body.error.code).toBe('ALREADY_DONE');
    const tooSoon = await tap('suresh', 'DELIVERED');
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.error.message).toMatch(/^Unloading finishes at \d\d:\d\d\.$/);

    await advance(20, 0);
    const delivered = await tap('suresh', 'DELIVERED');
    expect(delivered.status).toBe(200);
    expect(delivered.body.shipment).toMatchObject({ currentMilestone: 'DELIVERED', nextMilestone: null });
    const again = await tap('suresh', 'DELIVERED');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DONE');

    const audit = await prisma.auditLog.findMany({ where: { entityId: 'shp_1042', action: { startsWith: 'milestone.' } }, select: { action: true, actorUserId: true, data: true } });
    expect(audit.filter((a) => a.actorUserId === 'usr_drv_suresh').map((a) => [a.action, (a.data as { milestone: string }).milestone])).toEqual(
      expect.arrayContaining([
        ['milestone.record', 'ARRIVED'],
        ['milestone.record', 'DELIVERED'],
      ]),
    );
  });

  it('coordinator override needs a note, is audited as milestone.override and returns the coordinator shape', async () => {
    await sim.reset(MEERA);
    await advance(17, 30);
    const before = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' }, select: { physicalArrivalAt: true } });
    expect(before.physicalArrivalAt).not.toBeNull();
    const r = await tap('meera', 'ARRIVED', 'shp_1042', 'Driver phone off; gate confirmed by phone');
    expect(r.status).toBe(200);
    expect(r.body.shipment).toMatchObject({ view: 'coordinator', id: 'shp_1042', currentMilestone: 'ARRIVED' });
    expect(r.body.milestones.find((m) => m.milestone === 'ARRIVED')).toMatchObject({ source: 'COORDINATOR', actorName: 'Meera' });
    const audit = await prisma.auditLog.findFirst({ where: { entityId: 'shp_1042', action: 'milestone.override' }, select: { actorUserId: true, data: true } });
    expect(audit).toMatchObject({ actorUserId: 'usr_coord_meera', data: { milestone: 'ARRIVED', note: 'Driver phone off; gate confirmed by phone' } });
    const ev = await prisma.shipmentEvent.findFirst({ where: { shipmentId: 'shp_1042', type: 'MILESTONE', milestone: 'ARRIVED' }, select: { source: true, data: true } });
    expect(ev).toMatchObject({ source: 'COORDINATOR', data: { note: 'Driver phone off; gate confirmed by phone' } });
  });

  it('a rejected tap writes nothing (one transaction)', async () => {
    await sim.reset(MEERA);
    const digest = await databaseDigest(prisma, DIGEST);
    expect((await tap('ramesh', 'ARRIVED')).status).toBe(409);
    expect((await tap('ramesh', 'GATE_OUT')).status).toBe(409);
    expect(await databaseDigest(prisma, DIGEST)).toEqual(digest);
  });
});

describe('#19 replay', () => {
  it('G6: SHP-1042 first at risk 11:10, lead time to the promise, a snapshot at every action time', async () => {
    await heroWithReplacement();
    const r = await get<ReplayResponse>('/api/shipments/shp_1042/replay', 'meera');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ shipmentId: 'shp_1042', code: 'SHP-1042', promisedBy: at(18, 0).toISOString(), firstAtRiskAt: at(11, 10).toISOString(), leadTimeMinutes: 410 });
    const times = r.body.snapshots.map((s) => s.simTime);
    expect([...times].sort()).toEqual(times); // ascending
    const byTrigger = (t: string) => r.body.snapshots.filter((s) => s.trigger === t).map((s) => s.simTime);
    expect(byTrigger('DISRUPTION')).toContain(at(10, 30).toISOString());
    expect(byTrigger('REPORT')).toContain(at(11, 10).toISOString());
    expect(byTrigger('RECOVERY')).toContain(at(11, 25).toISOString());
    const s1110 = r.body.snapshots.find((s) => s.trigger === 'REPORT')!;
    expect(s1110.level).toBe('AT_RISK');
    expect(s1110.factors.length).toBeGreaterThan(0);
    const last = r.body.snapshots[r.body.snapshots.length - 1]!;
    expect(last.predictedArrivalAt).toBe(at(17, 50).toISOString());
    for (const s of r.body.snapshots) {
      expect(s.position.lat).toBeGreaterThan(17);
      expect(s.position.lat).toBeLessThan(20);
      expect(s.position.lng).toBeGreaterThan(72);
      expect(s.position.lng).toBeLessThan(75);
    }
    expect(r.body.events.some((e) => e.type === 'RECOVERY_CHOSEN')).toBe(true);
  });

  it('is read-only and coordinator-only', async () => {
    const digest = await databaseDigest(prisma, DIGEST);
    expect((await get('/api/shipments/shp_1042/replay', 'meera')).status).toBe(200);
    expect((await get('/api/shipments/shp_1042/replay', 'meera')).status).toBe(200);
    expect(await databaseDigest(prisma, DIGEST)).toEqual(digest);
    expect((await get<ApiError>('/api/shipments/shp_1042/replay', 'kestrel')).status).toBe(403);
    expect((await get<ApiError>('/api/shipments/shp_1042/replay', 'ramesh')).status).toBe(403);
    expect((await get<ApiError>('/api/shipments/shp_missing/replay', 'meera')).status).toBe(404);
  });

  it('a shipment never at risk has no first-at-risk time and no lead time', async () => {
    await sim.reset(MEERA);
    const r = await get<ReplayResponse>('/api/shipments/shp_1043/replay', 'meera');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ firstAtRiskAt: null, leadTimeMinutes: null });
    expect(r.body.snapshots.length).toBeGreaterThan(0);
  });
});

describe('#21 driver trip', () => {
  it('driver sees only own live shipments with the next step; other roles are forbidden', async () => {
    await sim.reset(MEERA);
    const r = await get<DriverTripResponse>('/api/driver/trip', 'ramesh');
    expect(r.status).toBe(200);
    expect(r.body.items.map((i) => i.id)).toEqual(['shp_1042']);
    expect(r.body.items[0]).toMatchObject({ view: 'driver', currentMilestone: 'IN_TRANSIT', nextMilestone: 'ARRIVED', canRecordNext: false, instruction: null });
    expect(r.body.recentHandovers).toEqual([]);
    expect((await get<DriverTripResponse>('/api/driver/trip', 'suresh')).body.items).toEqual([]);
    expect((await get<ApiError>('/api/driver/trip', 'meera')).status).toBe(403);
    expect((await get<ApiError>('/api/driver/trip', 'kestrel')).status).toBe(403);
    expect((await get<ApiError>('/api/driver/trip?x=1', 'ramesh')).status).toBe(400);
  });

  it('after a replacement truck: the new driver gets a collect instruction, the old driver a hand-over', async () => {
    await heroWithReplacement();
    const suresh = await get<DriverTripResponse>('/api/driver/trip', 'suresh');
    expect(suresh.body.items.map((i) => i.id)).toEqual(['shp_1042']);
    expect(suresh.body.items[0]!.instruction).toMatch(/^Collect load from TRK-07 near .+ — transfer until \d\d:\d\d\.$/);
    expect(suresh.body.items[0]!.stopped).toBe(true);
    expect(suresh.body.recentHandovers).toEqual([]); // only the previous driver sees a hand-over

    const ramesh = await get<DriverTripResponse>('/api/driver/trip', 'ramesh');
    expect(ramesh.body.items).toEqual([]);
    expect(ramesh.body.recentHandovers).toEqual([{ shipmentId: 'shp_1042', shipmentCode: 'SHP-1042', toTruckCode: 'TRK-11', toDriverName: 'Suresh', at: at(11, 25).toISOString() }]);

    // The instruction ends with the transfer; the hand-over drops out after 12 sim-hours.
    await advance(13, 0);
    expect((await get<DriverTripResponse>('/api/driver/trip', 'suresh')).body.items[0]!.instruction).toBeNull();
    await advance(23, 30);
    expect((await get<DriverTripResponse>('/api/driver/trip', 'ramesh')).body.recentHandovers).toEqual([]);
  });
});
