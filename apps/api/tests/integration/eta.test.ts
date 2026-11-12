import type { EngineRulesResponse, EtaExplanationCoordinator, EtaResponse, EtaSummaryCustomer } from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { isFactorArray } from '../../src/guards/factors.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import { recalculate } from '../../src/services/etaService.js';
import { createSimulationService, type RecalcHook, type SimulationService } from '../../src/services/simulationService.js';
import { fromS } from '../../src/sim/world.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

const PASSWORD = 'test-demo-password-123';
const COORD = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const FRI_0800 = new Date(at(8, 0).getTime() + 24 * 3600_000);
const M5_TABLES = ['Shipment', 'ShipmentEvent', 'DelayAttribution', 'RiskSnapshot', 'Disruption'] as const;

let prisma: PrismaClient;
let real = 0;
const service = (opts: { recalc?: RecalcHook } = {}) =>
  createSimulationService({ prisma, demoMode: true, timers: false, realNow: () => real, seedDemoPassword: PASSWORD, ...opts });
const hero = () => prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
const heroSnaps = () => prisma.riskSnapshot.findMany({ where: { shipmentId: 'shp_1042' }, orderBy: [{ simTime: 'asc' }, { id: 'asc' }] });

function rain(id = 'dis_rain'): Parameters<SimulationService['applyChange']>[1] {
  return async (tx: Prisma.TransactionClient, actionS: number) => {
    await tx.disruption.create({
      data: { id, kind: 'WEATHER_SLOWDOWN', origin: 'SIMULATOR', label: 'Heavy rain on ghat section', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, party: 'EXTERNAL', reasonCode: 'HEAVY_RAIN', startsAt: fromS(actionS), endsAt: at(18, 30) },
    });
    return { result: id };
  };
}
function breakdown(id = 'dis_breakdown'): Parameters<SimulationService['applyChange']>[1] {
  return async (tx: Prisma.TransactionClient, actionS: number) => {
    await tx.disruption.create({
      data: { id, kind: 'TRUCK_BREAKDOWN', origin: 'SIMULATOR', label: 'Truck breakdown near Lonavala', segmentCodes: [], shipmentId: 'shp_1042', stopMinutes: 180, party: 'TRANSPORTER', reasonCode: 'BREAKDOWN', startsAt: fromS(actionS), endsAt: fromS(actionS + 180 * 60) },
    });
    return { result: id, shipmentIds: ['shp_1042'] };
  };
}

/** Reset → 10:30 rain → 11:10 breakdown (the hero scenario without the M6/M7 report and recovery). */
async function heroScenario(s: SimulationService, until: Date = at(11, 10)) {
  await s.reset(COORD);
  await s.control({ action: 'ADVANCE_TO', to: at(10, 30) }, COORD);
  await s.applyChange('DISRUPTION', rain());
  await s.control({ action: 'ADVANCE_TO', to: at(11, 10) }, COORD);
  await s.applyChange('DISRUPTION', breakdown());
  if (until.getTime() > at(11, 10).getTime()) await s.control({ action: 'ADVANCE_TO', to: until }, COORD);
}

beforeAll(() => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('G0 — after reset (Thu 10:25), computed by the pipeline', () => {
  it('SHP-1042: ETA 14:20, ON_TRACK, slack 220, HIGH (GPS ping at 10:00), cached on the shipment', async () => {
    await service().reset(COORD);
    const h = await hero();
    expect(h.etaAt?.toISOString()).toBe(at(14, 20).toISOString());
    expect(h).toMatchObject({ riskLevel: 'ON_TRACK', slackMinutes: 220, riskScore: 13, confidence: 'HIGH' });
    expect(h.etaLowAt?.toISOString()).toBe(at(14, 10).toISOString());
    expect(h.etaHighAt?.toISOString()).toBe(at(14, 30).toISOString());
    expect(h.lastUpdateAt?.toISOString()).toBe(at(10, 0).toISOString()); // O-14 ping (last driver tap was 09:30)
  });

  it('ledger: 40 min plant gate wait (Plant) and the pace minutes so far (Transporter)', async () => {
    const rows = await prisma.delayAttribution.findMany({ where: { shipmentId: 'shp_1042' }, orderBy: { sourceKey: 'asc' } });
    expect(rows.map((r) => [r.sourceKey, r.party, r.factor, r.reason, r.kind, r.status])).toEqual([
      ['GATE', 'PLANT', 'GATE', 'PLANT_GATE_WAIT', 'TIME_LOST', 'LIVE'],
      ['HIST', 'TRANSPORTER', 'HIST', 'TRANSPORTER_PACE', 'TIME_LOST', 'LIVE'],
    ]);
    expect(rows[0]?.delaySeconds).toBe(2400);
    // I at 10:25 = 95 min − C (55 min × 270/290 = 51.21 min baseline) = 3.79 min of pace
    expect(rows[1]?.delaySeconds).toBeGreaterThanOrEqual(227);
    expect(rows[1]?.delaySeconds).toBeLessThanOrEqual(228);
  });

  it('snapshots: a SEED snapshot at 08:00, the driver/gate actions, and valid factor JSON that satisfies the identity', async () => {
    const snaps = await heroSnaps();
    expect(snaps[0]).toMatchObject({ trigger: 'SEED', ruleVersion: 'eta-rules-v1' });
    expect(snaps[0]?.simTime.toISOString()).toBe(at(8, 0).toISOString());
    const byTime = snaps.map((x) => [x.simTime.toISOString(), x.trigger]);
    expect(byTime).toContainEqual([at(8, 10).toISOString(), 'MILESTONE']); // AT_GATE tap
    expect(byTime).toContainEqual([at(8, 50).toISOString(), 'MILESTONE']); // LOADING by the simulation
    expect(byTime).toContainEqual([at(9, 30).toISOString(), 'MILESTONE']); // GATE_OUT tap
    for (const x of snaps) {
      expect(isFactorArray(x.factors)).toBe(true);
      const sum = (x.factors as { minutes: number }[]).reduce((a, f) => a + f.minutes, 0);
      expect(x.plannedArrivalAt.getTime() + sum * 60_000).toBe(x.predictedArrivalAt.getTime());
      expect(x.etaLowAt.getTime()).toBeLessThanOrEqual(x.predictedArrivalAt.getTime());
      expect(x.predictedArrivalAt.getTime()).toBeLessThanOrEqual(x.etaHighAt.getTime());
    }
  });

  it('every live shipment has an ETA and a level; no historical shipment was touched', async () => {
    const live = await prisma.shipment.findMany({ where: { isHistorical: false } });
    expect(live.length).toBe(12);
    expect(live.every((s) => s.etaAt !== null && s.riskLevel !== null && s.confidence !== null)).toBe(true);
    expect(await prisma.riskSnapshot.count({ where: { shipment: { isHistorical: true } } })).toBe(0);
  });
});

describe('D — recalculation through the single pipeline', () => {
  it('G1: rain at 10:30 → WATCH, ETA 16:20, DISR expected; a DISRUPTION snapshot at 10:30; worldVersion bumped', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'ADVANCE_TO', to: at(10, 30) }, COORD);
    const v0 = (await s.state()).worldVersion;
    const { actionS } = await s.applyChange('DISRUPTION', rain());
    expect(fromS(actionS).toISOString()).toBe(at(10, 30).toISOString());
    expect((await s.state()).worldVersion).toBeGreaterThan(v0);
    const h = await hero();
    expect(h.etaAt?.toISOString()).toBe(at(16, 20).toISOString());
    expect(h).toMatchObject({ riskLevel: 'WATCH', slackMinutes: 100 });
    const last = (await heroSnaps()).at(-1);
    expect(last).toMatchObject({ trigger: 'DISRUPTION', level: 'WATCH' });
    expect(last?.simTime.toISOString()).toBe(at(10, 30).toISOString());
    expect((last?.factors as { code: string; phase: string; minutes: number }[]).filter((f) => f.code === 'DISR')).toEqual([
      expect.objectContaining({ phase: 'EXPECTED', minutes: 120, party: 'EXTERNAL' }),
    ]);
  });

  it('11:10 breakdown (simulator disruption) → AT_RISK, receiving-gate ETA Fri 08:00, slack −840', async () => {
    const s = service();
    await heroScenario(s);
    const h = await hero();
    expect(h.etaAt?.toISOString()).toBe(FRI_0800.toISOString());
    expect(h).toMatchObject({ riskLevel: 'AT_RISK', slackMinutes: -840, riskScore: 100 });
    const last = (await heroSnaps()).at(-1);
    const win = (last?.factors as { code: string; split: { party: string }[] | null }[]).find((f) => f.code === 'WIN');
    expect(win?.split?.map((x) => x.party)).toEqual(['PLANT', 'TRANSPORTER', 'EXTERNAL']);
  });

  it('the promise passing without arrival makes the hero LATE on a plain step (clock-only change)', async () => {
    const s = service();
    await heroScenario(s, at(18, 5));
    expect((await hero()).riskLevel).toBe('LATE');
  });

  it('O-14: in the afternoon the hero still has HIGH confidence from simulated GPS; pings create no events', async () => {
    const s = service();
    await s.reset(COORD);
    const eventsBefore = await prisma.shipmentEvent.count({ where: { shipmentId: 'shp_1042' } });
    await s.control({ action: 'ADVANCE_TO', to: at(13, 0) }, COORD);
    const h = await hero();
    expect(h.confidence).toBe('HIGH');
    expect(h.lastUpdateAt?.toISOString()).toBe(at(13, 0).toISOString());
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: 'shp_1042' } })).toBe(eventsBefore);
  });

  it('snapshot rule: idle steps snapshot every 30 min; never two identical snapshots at one minute; nothing overwritten', async () => {
    const s = service();
    await s.reset(COORD);
    const before = await prisma.riskSnapshot.findMany({ orderBy: { id: 'asc' } });
    await s.control({ action: 'ADVANCE_TO', to: at(12, 0) }, COORD);
    const after = await prisma.riskSnapshot.findMany({ orderBy: { id: 'asc' } });
    // No overwrite: every earlier snapshot is still there, unchanged.
    const byId = new Map(after.map((x) => [x.id, x]));
    for (const b of before) expect(byId.get(b.id)).toEqual(b);
    // Hero idle 10:25 → 12:00 (no new information): one snapshot per 30 simulated minutes.
    const idle = (await heroSnaps()).filter((x) => x.simTime > at(10, 25));
    expect(idle.map((x) => x.trigger)).toEqual(idle.map(() => 'STEP'));
    const gaps = idle.slice(1).map((x, i) => (x.simTime.getTime() - (idle[i] as { simTime: Date }).simTime.getTime()) / 60_000);
    expect(gaps.every((g) => g === 30)).toBe(true);
    const dupes = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "RiskSnapshot" a JOIN "RiskSnapshot" b
        ON a."shipmentId" = b."shipmentId" AND a."simTime" = b."simTime" AND a.id < b.id
       AND a."predictedArrivalAt" = b."predictedArrivalAt" AND a.level = b.level AND a.confidence = b.confidence
       AND a."etaLowAt" = b."etaLowAt" AND a."etaHighAt" = b."etaHighAt" AND a.factors = b.factors`;
    expect(Number(dupes[0]?.n)).toBe(0);
  });

  it('an action that changes nothing for other shipments does not snapshot them', async () => {
    const s = service();
    await s.reset(COORD);
    await s.control({ action: 'ADVANCE_TO', to: at(10, 30) }, COORD);
    const countAt = () => prisma.riskSnapshot.count({ where: { simTime: at(10, 30), trigger: 'DISRUPTION' } });
    await s.applyChange('DISRUPTION', breakdown());
    expect(await countAt()).toBe(1); // only SHP-1042
  });

  it('transactional: a failing recalculation rolls the whole action back (no disruption, no cached change)', async () => {
    const good = service();
    await good.reset(COORD);
    await good.control({ action: 'ADVANCE_TO', to: at(10, 30) }, COORD);
    const digest = await databaseDigest(prisma, M5_TABLES);
    const failing = service({
      recalc: async (tx, ctx) => {
        if (ctx.trigger === 'DISRUPTION') throw new Error('injected failure');
        return recalculate(tx, ctx);
      },
    });
    await expect(failing.applyChange('DISRUPTION', rain())).rejects.toThrow('injected failure');
    expect(await databaseDigest(prisma, M5_TABLES)).toEqual(digest);
  });
});

describe('G — reproducibility with the ETA pipeline', () => {
  const digest = () => databaseDigest(prisma, M5_TABLES);

  it('R1 (hero part): the same scenario twice gives byte-identical shipments, ledger and snapshots', async () => {
    await heroScenario(service(), at(12, 0));
    const first = await digest();
    await heroScenario(service(), at(12, 0));
    expect(await digest()).toEqual(first);
  });

  it('R5: SET_SPEED changes during a run (60× then 10×) = one constant-speed ADVANCE', async () => {
    const a = service();
    await a.reset(COORD);
    await a.control({ action: 'ADVANCE', minutes: 60 }, COORD);
    const constant = await databaseDigest(prisma, M5_TABLES, ['speed', 'running', 'simError']);

    const b = service();
    await b.reset(COORD);
    await b.control({ action: 'SET_SPEED', speed: 60 }, COORD);
    await b.control({ action: 'PLAY' }, COORD);
    real += 30_000; // 30 sim-min at 60×
    await b.tick();
    await b.control({ action: 'SET_SPEED', speed: 10 }, COORD);
    real += 180_000; // 30 sim-min at 10×
    await b.tick();
    await b.control({ action: 'PAUSE' }, COORD);
    expect((await b.state()).simTime).toBe(at(11, 25).toISOString());
    expect(await databaseDigest(prisma, M5_TABLES, ['speed', 'running', 'simError'])).toEqual(constant);
  });

  it('R6: an action at 11:07 gives identical results whether the clock was running or paused', async () => {
    const runTo1107 = async (pause: boolean) => {
      const s = service();
      await s.reset(COORD);
      await s.control({ action: 'SET_SPEED', speed: 60 }, COORD);
      await s.control({ action: 'PLAY' }, COORD);
      real += 42_500; // 10:25 + 42.5 min = 11:07:30
      await s.tick();
      if (pause) await s.control({ action: 'PAUSE' }, COORD);
      const { actionS } = await s.applyChange('DISRUPTION', breakdown());
      expect(fromS(actionS).toISOString()).toBe(at(11, 7).toISOString()); // stamped to the whole minute
      if (!pause) await s.control({ action: 'PAUSE' }, COORD);
      await s.control({ action: 'ADVANCE_TO', to: at(12, 0) }, COORD);
      return databaseDigest(prisma, M5_TABLES, ['speed', 'running', 'simError']);
    };
    const running = await runTo1107(false);
    const paused = await runTo1107(true);
    expect(paused).toEqual(running);
  });
});

describe('HTTP: #18 ETA and #20 engine rules', () => {
  let srv: TestServer;
  let coordinator: string;
  let kestrel: string;
  let osprey: string;
  let driver: string;
  const get = (path: string, cookie: string | null) => fetch(`${srv.baseUrl}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

  beforeAll(async () => {
    srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD }, simulation: { timers: false } });
    const sim = (srv.app.locals as AppLocals).simulation;
    await heroScenario(sim);
    coordinator = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
    kestrel = await loginCookie(srv.baseUrl, 'buyer@kestrel.test', PASSWORD);
    osprey = await loginCookie(srv.baseUrl, 'buyer@osprey.test', PASSWORD);
    driver = await loginCookie(srv.baseUrl, 'driver.ramesh@ghatline.test', PASSWORD);
  });
  afterAll(async () => {
    await srv.close();
  });

  it('coordinator gets the four-term explanation; it equals the cached pipeline result and the identity holds', async () => {
    const res = await get('/api/shipments/shp_1042/eta', coordinator);
    expect(res.status).toBe(200);
    const eta = ((await res.json()) as EtaResponse).eta as EtaExplanationCoordinator;
    const h = await hero();
    expect(eta).toMatchObject({
      view: 'coordinator', shipmentId: 'shp_1042', ruleVersion: 'eta-rules-v1', isRuleBased: true, identityHolds: true,
      predictedArrivalAt: h.etaAt?.toISOString(), etaLowAt: h.etaLowAt?.toISOString(), etaHighAt: h.etaHighAt?.toISOString(),
      slackMinutes: h.slackMinutes, level: h.riskLevel, score: h.riskScore, confidence: h.confidence,
      simTime: at(11, 10).toISOString(), projectedRoadArrivalAt: at(19, 20).toISOString(),
      summary: 'At risk: +180 min breakdown is the largest factor',
    });
    expect(eta.totals).toEqual({ incurredMinutes: 49, planChangeMinutes: 0, expectedMinutes: 1071 });
    expect(eta.receivingWindow).toEqual({ opensAt: FRI_0800.toISOString(), closesAt: new Date(FRI_0800.getTime() + 600 * 60_000).toISOString(), overrideEndAt: null });
    const latest = (await heroSnaps()).at(-1);
    expect(eta.factors).toEqual(latest?.factors);
  });

  it('customer (own order) gets the plain summary: no parties, factor codes, driver or reporter anywhere', async () => {
    const res = await get('/api/shipments/shp_1042/eta', kestrel);
    expect(res.status).toBe(200);
    const body = (await res.json()) as EtaResponse;
    const eta = body.eta as EtaSummaryCustomer;
    expect(eta).toEqual({
      view: 'customer', shipmentId: 'shp_1042', predictedArrivalAt: FRI_0800.toISOString(),
      etaLowAt: expect.any(String), etaHighAt: expect.any(String), promisedBy: at(18, 0).toISOString(),
      level: 'AT_RISK', plainReason: 'Vehicle breakdown on the route', isRuleBased: true,
    });
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.push(k), walk(x));
    };
    walk(body);
    for (const banned of ['party', 'factors', 'driver', 'phone', 'reporter', 'code', 'split', 'summary']) expect(keys).not.toContain(banned);
  });

  it('scoping and roles: other customer → 404, driver → 403, unknown → 404, bad id → 400, delivered → 409, no session → 401', async () => {
    expect((await get('/api/shipments/shp_1042/eta', osprey)).status).toBe(404);
    expect((await get('/api/shipments/shp_1042/eta', driver)).status).toBe(403);
    expect((await get('/api/shipments/shp_nope/eta', coordinator)).status).toBe(404);
    expect((await get('/api/shipments/bad%20id/eta', coordinator)).status).toBe(400);
    const delivered = await prisma.shipment.findFirstOrThrow({ where: { isHistorical: true }, select: { id: true } });
    const res = await get(`/api/shipments/${delivered.id}/eta`, coordinator);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_TRANSITION');
    expect((await get('/api/shipments/shp_1042/eta', null)).status).toBe(401);
  });

  it('reading the ETA writes nothing and does not move the clock', async () => {
    const before = await databaseDigest(prisma);
    await get('/api/shipments/shp_1042/eta', coordinator);
    await get('/api/shipments/shp_1042/eta', kestrel);
    expect(await databaseDigest(prisma)).toEqual(before);
  });

  it('#20 rules: any role; states the rule-based nature, thresholds and rule version', async () => {
    for (const cookie of [coordinator, kestrel, driver]) {
      const res = await get('/api/engine/rules', cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as EngineRulesResponse;
      expect(body.ruleVersion).toBe('eta-rules-v1');
      expect(body.statement).toBe('Rule-based estimate. Not a trained model. Weights are set by hand.');
      expect(body.thresholds).toEqual({ onTrackMinSlack: 120, watchMinSlack: 0 });
      expect(body.factors.map((f) => f.code)).toEqual(['GATE', 'HIST', 'DISR', 'RPT', 'WIN']);
      expect(body.co2e.enabled).toBe(false);
    }
    expect((await get('/api/engine/rules', null)).status).toBe(401);
  });
});
