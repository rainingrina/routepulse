import type { ApiError, SimClockResponse, SimResetResponse, SyncResponse } from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import { recalculate } from '../../src/services/etaService.js';
import { createSimulationService, type RecalcHook } from '../../src/services/simulationService.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

const PASSWORD = 'test-demo-password-123';
const SYSTEM = { userId: null, role: null } as const;
const COORD = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const RAMESH = { userId: 'usr_drv_ramesh', role: 'DRIVER' } as const;
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const SIM_TABLES = ['Shipment', 'ShipmentEvent', 'Truck', 'DelayAttribution', 'RiskSnapshot', 'SimState'] as const;

let prisma: PrismaClient;
let real = 0;

function service(opts: { recalc?: RecalcHook } = {}) {
  return createSimulationService({ prisma, demoMode: true, timers: false, realNow: () => real, seedDemoPassword: PASSWORD, ...opts });
}
// Equivalent runs must match in shipments, events, trucks and simTime/lastSettledAt; clock settings may differ.
const simDigest = () => databaseDigest(prisma, SIM_TABLES.filter((t) => t !== 'SimState'), ['speed', 'running', 'simError']);
const hero = () => prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });

beforeAll(async () => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('reset and the SHP-1042 hero morning (L2, through the real engine)', () => {
  it('resets to Thu 10:25 paused in under 5 s', async () => {
    const r = await service().reset(COORD);
    expect(r.simTime).toBe(at(10, 25).toISOString());
    expect(r.running).toBe(false);
    expect(r.speed).toBe(1);
    expect(r.durationMs).toBeLessThan(5000);
    const sim = await prisma.simState.findUniqueOrThrow({ where: { id: 1 } });
    expect(sim.lastSettledAt.toISOString()).toBe(at(10, 25).toISOString());
  });

  it('reproduces the documented hero sequence with the right sources', async () => {
    const h = await hero();
    expect(h).toMatchObject({ currentMilestone: 'IN_TRANSIT', truckId: 'trk_07', driverUserId: 'usr_drv_ramesh', autopilot: false });
    expect(h.gateQueuedAt?.toISOString()).toBe(at(8, 10).toISOString());
    expect(h.loadingStartedAt?.toISOString()).toBe(at(8, 50).toISOString());
    expect(h.gateOutAt?.toISOString()).toBe(at(9, 30).toISOString());
    expect(h.plannedArrivalAt.toISOString()).toBe(at(13, 20).toISOString());
    expect(h.promisedBy.toISOString()).toBe(at(18, 0).toISOString());
    // 40-minute plant gate wait = gate-out − planned departure
    expect((h.gateOutAt!.getTime() - h.plannedDepartureAt.getTime()) / 60_000).toBe(40);
    const events = await prisma.shipmentEvent.findMany({ where: { shipmentId: 'shp_1042', simTime: { gte: at(8, 0) } }, orderBy: [{ simTime: 'asc' }, { id: 'asc' }] });
    expect(events.map((e) => [e.milestone, e.source, e.simTime.toISOString()])).toEqual([
      ['AT_GATE', 'DRIVER', at(8, 10).toISOString()],
      ['LOADING', 'SIMULATION', at(8, 50).toISOString()],
      ['GATE_OUT', 'DRIVER', at(9, 30).toISOString()],
      ['IN_TRANSIT', 'SYSTEM', at(9, 30).toISOString()],
    ]);
  });

  it('has moved the hero 25.603 km by 10:25 (55 min × 270/290 × 30 km/h baseline)', async () => {
    const h = await hero();
    const mm = h.progressM * 1000 + h.progressCarryMm;
    expect(mm).toBeGreaterThanOrEqual(25_603_437);
    expect(mm).toBeLessThanOrEqual(25_603_448);
  });

  it('loaded every queued truck first-come-first-served across 3 bays', async () => {
    const live = await prisma.shipment.findMany({ where: { isHistorical: false }, orderBy: { loadingStartedAt: 'asc' }, select: { code: true, loadingStartedAt: true } });
    const hm = (d: Date | null) => (d ? d.toISOString() : null);
    expect(live.map((s) => [s.code, hm(s.loadingStartedAt)])).toEqual([
      ['SHP-1036', hm(at(7, 30))], ['SHP-1037', hm(at(7, 40))], ['SHP-1038', hm(at(7, 50))],
      ['SHP-1039', hm(at(8, 10))], ['SHP-1040', hm(at(8, 20))], ['SHP-1041', hm(at(8, 30))],
      ['SHP-1042', hm(at(8, 50))], ['SHP-1043', hm(at(9, 0))], ['SHP-1044', hm(at(9, 10))],
      ['SHP-1045', hm(at(9, 30))], ['SHP-1046', hm(at(9, 40))], ['SHP-1047', hm(at(10, 0))],
    ]);
  });

  it('Milestone 5: every live shipment has an ETA, risk, snapshots and ledger rows; still no alerts (later milestone)', async () => {
    const live = await prisma.shipment.findMany({ where: { isHistorical: false }, select: { etaAt: true, riskLevel: true, riskScore: true, confidence: true, slackMinutes: true } });
    expect(live.every((s) => s.etaAt !== null && s.riskLevel !== null && s.riskScore !== null && s.confidence !== null && s.slackMinutes !== null)).toBe(true);
    expect(await prisma.riskSnapshot.count()).toBeGreaterThan(0);
    expect(await prisma.delayAttribution.count({ where: { shipment: { isHistorical: false } } })).toBeGreaterThan(0);
    expect(await prisma.alert.count({ where: { shipment: { isHistorical: false } } })).toBe(0);
  });
});

describe('reproducibility', () => {
  it('R7: two resets give an identical database (except worldVersion, which increases)', async () => {
    const a = await service().reset(COORD);
    const first = await databaseDigest(prisma);
    const b = await service().reset(COORD);
    expect(await databaseDigest(prisma)).toEqual(first);
    expect(b.worldVersion).toBeGreaterThan(a.worldVersion);
  });

  it('R4: ADVANCE 60 = 12 × ADVANCE 5 = the 60× ticker for 60 real seconds', async () => {
    const s1 = service();
    await s1.reset(COORD);
    await s1.control({ action: 'ADVANCE', minutes: 60 }, COORD);
    const one = await simDigest();

    const s2 = service();
    await s2.reset(COORD);
    for (let i = 0; i < 12; i += 1) await s2.control({ action: 'ADVANCE', minutes: 5 }, COORD);
    expect(await simDigest()).toEqual(one);

    const s3 = service();
    await s3.reset(COORD);
    await s3.control({ action: 'SET_SPEED', speed: 60 }, COORD);
    await s3.control({ action: 'PLAY' }, COORD);
    real += 60_000;
    const steps = await s3.tick();
    await s3.control({ action: 'PAUSE' }, COORD);
    expect(steps).toBe(12);
    expect((await s3.state()).simTime).toBe(at(11, 25).toISOString());
    expect(await simDigest()).toEqual(one);
  });

  it('progress carry is persisted: a restart mid-way gives the same result as one run', async () => {
    const a = service();
    await a.reset(COORD);
    await a.control({ action: 'ADVANCE', minutes: 30 }, COORD);
    const uninterrupted = await simDigest();

    const b = service();
    await b.reset(COORD);
    await b.control({ action: 'ADVANCE', minutes: 15 }, COORD);
    const restarted = service(); // fresh process state, loads clock and carry from the database
    await restarted.control({ action: 'ADVANCE', minutes: 15 }, COORD);
    expect(await simDigest()).toEqual(uninterrupted);
  });
});

describe('clock controls and speeds', () => {
  it('PLAY/PAUSE/resume: paused time does not move, resume continues without a jump', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'PLAY' }, COORD); // 1×
    real += 300_000; // 5 real minutes at 1× = one step
    expect(await s.tick()).toBe(1);
    await s.control({ action: 'PAUSE' }, COORD);
    const paused = (await s.state()).simTime;
    real += 3_600_000;
    expect(await s.tick()).toBe(0);
    expect((await s.state()).simTime).toBe(paused);
    await s.control({ action: 'PLAY' }, COORD);
    real += 1_000;
    await s.tick();
    expect(new Date((await s.state()).simTime).getTime() - new Date(paused).getTime()).toBe(1_000);
    await s.control({ action: 'PAUSE' }, COORD);
  });

  it.each([
    [1, 300_000],
    [10, 30_000],
    [60, 5_000],
  ] as const)('speed %s× needs %s real ms for one 5-minute step', async (speed, realMs) => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'SET_SPEED', speed }, COORD);
    await s.control({ action: 'PLAY' }, COORD);
    real += realMs - 1;
    expect(await s.tick()).toBe(0);
    real += 1;
    expect(await s.tick()).toBe(1);
    expect((await s.state()).simTime).toBe(at(10, 30).toISOString());
    await s.control({ action: 'PAUSE' }, COORD);
  });

  it('R8: a long real-time gap processes 12 steps, pauses and reports an error', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'SET_SPEED', speed: 60 }, COORD);
    await s.control({ action: 'PLAY' }, COORD);
    real += 20 * 60_000;
    expect(await s.tick()).toBe(12);
    const st = await s.state();
    expect(st).toMatchObject({ running: false, simError: 'Clock paused after a long gap', simTime: at(11, 25).toISOString() });
  });

  it('ADVANCE/ADVANCE_TO reject non-future and > 24 h targets', async () => {
    const s = service();
    await s.reset(COORD);
    await expect(s.control({ action: 'ADVANCE_TO', to: at(10, 0) }, COORD)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(s.control({ action: 'ADVANCE_TO', to: istAt('2026-11-20', 11 * 60) }, COORD)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('worldVersion: unchanged by reads, increased by every control and by steps with events', async () => {
    const s = service();
    await s.reset(COORD);
    const v0 = (await s.state()).worldVersion;
    expect((await s.state()).worldVersion).toBe(v0);
    const v1 = (await s.control({ action: 'SET_SPEED', speed: 10 }, COORD)).worldVersion;
    expect(v1).toBe(v0 + 1);
    const v2 = (await s.control({ action: 'ADVANCE', minutes: 30 }, COORD)).worldVersion; // SHP-1047 leaves the gate at 10:40
    expect(v2).toBeGreaterThan(v1 + 1);
    const db = await prisma.simState.findUniqueOrThrow({ where: { id: 1 } });
    expect(db.worldVersion).toBe(v2);
  });
});

describe('concurrency and transactions', () => {
  it('concurrent mutations are serialised: 5 parallel ADVANCE 5 = +25 minutes, no duplicate events', async () => {
    const s = service();
    await s.reset(COORD);
    await Promise.all([...Array(5)].map(() => s.control({ action: 'ADVANCE', minutes: 5 }, COORD)));
    expect((await s.state()).simTime).toBe(at(10, 50).toISOString());
    const dupes = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) - count(DISTINCT ("shipmentId", milestone)) AS n FROM "ShipmentEvent" WHERE type = 'MILESTONE'`;
    expect(Number(dupes[0]?.n)).toBe(0);
  });

  it('a reset racing an advance is serialised in call order (reset, then advance)', async () => {
    const s = service();
    const [, adv] = await Promise.all([s.reset(COORD), s.control({ action: 'ADVANCE', minutes: 5 }, COORD)]);
    expect(adv.simTime).toBe(at(10, 30).toISOString());
  });

  it('a failing step rolls back completely: database and in-memory clock stay at the last good boundary', async () => {
    await service().reset(COORD);
    const good = service();
    await good.control({ action: 'ADVANCE', minutes: 10 }, COORD);
    const expected = await simDigest();

    await service().reset(COORD);
    let calls = 0;
    const failing = service({
      recalc: async (tx, ctx) => {
        calls += 1;
        if (calls === 3) throw new Error('injected failure');
        return recalculate(tx, ctx);
      },
    });
    await expect(failing.control({ action: 'ADVANCE', minutes: 30 }, SYSTEM)).rejects.toThrow('injected failure');
    const sim = await prisma.simState.findUniqueOrThrow({ where: { id: 1 } });
    expect(sim.lastSettledAt.toISOString()).toBe(at(10, 35).toISOString());
    expect(await simDigest()).toEqual(expected);
    expect((await failing.state()).simTime).toBe(at(10, 35).toISOString());
  });
});

describe('driver milestones on the manual hero (L6) and autopilot delivery', () => {
  it('rejects early or invalid taps with plain reasons', async () => {
    const s = service();
    await s.reset(COORD);
    await expect(s.recordMilestone('shp_1042', 'ARRIVED', RAMESH)).rejects.toMatchObject({ code: 'INVALID_TRANSITION', message: expect.stringMatching(/km from the destination/) });
    await expect(s.recordMilestone('shp_1042', 'LOADING', RAMESH)).rejects.toMatchObject({ code: 'ALREADY_DONE' }); // M9: a passed milestone is ALREADY_DONE (API §7.6)
    await expect(s.recordMilestone('shp_1043', 'ARRIVED', SYSTEM)).rejects.toMatchObject({ message: "This shipment's milestones are recorded by the simulation." });
    await expect(s.recordMilestone('shp_does_not_exist', 'ARRIVED', RAMESH)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('arrivedAt = physical arrival even when the tap is late; delivery = arrival + 60 min; truck released', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'ADVANCE_TO', to: at(14, 30) }, COORD);
    const physical = (await hero()).physicalArrivalAt;
    expect(physical).not.toBeNull();
    // Tap mid-step at 14:33:30 → stamped 14:33; arrival stays the physical time.
    await s.control({ action: 'SET_SPEED', speed: 60 }, COORD);
    await s.control({ action: 'PLAY' }, COORD);
    real += 3_500;
    await s.tick();
    await s.control({ action: 'PAUSE' }, COORD);
    await s.recordMilestone('shp_1042', 'ARRIVED', RAMESH);
    const arrived = await hero();
    expect(arrived.arrivedAt?.toISOString()).toBe(physical?.toISOString());
    expect(arrived).toMatchObject({ currentMilestone: 'ARRIVED', onTime: true, delayMinutes: 0 });
    await expect(s.recordMilestone('shp_1042', 'DELIVERED', RAMESH)).rejects.toMatchObject({ message: expect.stringMatching(/^Unloading finishes at/) });
    await s.control({ action: 'ADVANCE', minutes: 120 }, COORD);
    await s.recordMilestone('shp_1042', 'DELIVERED', RAMESH);
    const done = await hero();
    expect(done.deliveredAt?.getTime()).toBe((arrived.arrivedAt as Date).getTime() + 3_600_000);
    expect(await prisma.truck.findUniqueOrThrow({ where: { id: 'trk_07' } })).toMatchObject({ status: 'AVAILABLE', locationLabel: 'Kestrel Moulders, Pune' });
  });

  it('autopilot shipments arrive and deliver on their own (SHP-1043, Nashik)', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'ADVANCE_TO', to: at(16, 0) }, COORD);
    const x = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1043' } });
    expect(x.currentMilestone).toBe('DELIVERED');
    expect(x.arrivedAt?.getTime()).toBe(x.physicalArrivalAt?.getTime());
    expect(x.deliveredAt?.getTime()).toBe((x.arrivedAt as Date).getTime() + 3_600_000);
    expect(x.onTime).toBe(x.arrivedAt! <= x.promisedBy);
  });

  it('a weather slowdown on the ghat slows the hero (disruption effect through the service)', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'ADVANCE_TO', to: at(12, 0) }, COORD);
    const free = (await hero()).progressM;
    await s.reset(COORD);
    await prisma.disruption.create({
      data: { id: 'dis_test_rain', kind: 'WEATHER_SLOWDOWN', origin: 'SIMULATOR', label: 'Heavy rain on ghat section', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, party: 'EXTERNAL', reasonCode: 'HEAVY_RAIN', startsAt: at(10, 30), endsAt: at(18, 30) },
    });
    const s2 = service();
    await s2.control({ action: 'ADVANCE_TO', to: at(12, 0) }, COORD);
    expect((await hero()).progressM).toBeLessThan(free);
  });
});

describe('HTTP: #4 sync, #5 clock, #6 reset', () => {
  let srv: TestServer;
  let coordinator: string;
  let customer: string;
  let driver: string;
  const call = (path: string, cookie: string | null, body?: unknown) =>
    fetch(`${srv.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD }, simulation: { timers: false } });
    await (srv.app.locals as AppLocals).simulation.reset(COORD);
    coordinator = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
    customer = await loginCookie(srv.baseUrl, 'buyer@kestrel.test', PASSWORD);
    driver = await loginCookie(srv.baseUrl, 'driver.ramesh@ghatline.test', PASSWORD);
  });
  afterAll(async () => {
    await srv.close();
  });

  it('GET /api/sync works for every role (drivers get 0 unread) and 401 without a session', async () => {
    for (const cookie of [coordinator, customer, driver]) {
      const res = await call('/api/sync', cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as SyncResponse;
      expect(body).toMatchObject({ simTime: at(10, 25).toISOString(), running: false, speed: 1, stepMinutes: 5, demoMode: true });
    }
    expect(((await (await call('/api/sync', driver)).json()) as SyncResponse).unreadNotifications).toBe(0);
    expect((await call('/api/sync', null)).status).toBe(401);
  });

  it('POST /api/sim/clock: coordinator only; validates every field', async () => {
    expect((await call('/api/sim/clock', customer, { action: 'PAUSE' })).status).toBe(403);
    expect((await call('/api/sim/clock', driver, { action: 'PAUSE' })).status).toBe(403);
    expect((await call('/api/sim/clock', null, { action: 'PAUSE' })).status).toBe(401);
    const bad = async (body: unknown) => {
      const r = await call('/api/sim/clock', coordinator, body);
      expect(r.status).toBe(400);
      expect(((await r.json()) as ApiError).error.code).toBe('VALIDATION_ERROR');
    };
    await bad({ action: 'SET_SPEED', speed: 7 });
    await bad({ action: 'ADVANCE', minutes: 7 });
    await bad({ action: 'ADVANCE_TO', to: '2026-11-19T05:01:00Z' });
    await bad({ action: 'PLAY', speed: 60 });
    await bad({ action: 'JUMP' });
    const ok = await call('/api/sim/clock', coordinator, { action: 'ADVANCE', minutes: 5 });
    expect(ok.status).toBe(200);
    expect((await ok.json()) as SimClockResponse).toMatchObject({ simTime: at(10, 30).toISOString(), stepsExecuted: 1 });
  });

  it('POST /api/sim/reset: requires confirm:true and returns Thu 10:25 paused', async () => {
    expect((await call('/api/sim/reset', customer, { confirm: true })).status).toBe(403);
    expect((await call('/api/sim/reset', coordinator, {})).status).toBe(400);
    const res = await call('/api/sim/reset', coordinator, { confirm: true });
    expect(res.status).toBe(200);
    expect((await res.json()) as SimResetResponse).toMatchObject({ simTime: at(10, 25).toISOString(), running: false });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'sim.reset' } });
    expect(audit?.actorUserId).toBe('usr_coord_meera');
  });

  it('403 DEMO_MODE_OFF when demo mode is disabled', async () => {
    const off = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { DEMO_MODE: 'false' }, simulation: { timers: false } });
    try {
      const cookie = await loginCookie(off.baseUrl, 'coordinator@plantx.test', PASSWORD);
      const res = await fetch(`${off.baseUrl}/api/sim/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ action: 'PAUSE' }) });
      expect(res.status).toBe(403);
      expect(((await res.json()) as ApiError).error.code).toBe('DEMO_MODE_OFF');
    } finally {
      await off.close();
    }
  });
});
