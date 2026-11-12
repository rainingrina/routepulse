import type { ApiError, ChooseRecoveryResponse, DashboardResponse, RecoveryOptionsResponse } from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import type { SimulationService } from '../../src/services/simulationService.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

/**
 * #36 analytics dashboard (API §13, AC-M5.1–M5.7) on the real app and the seeded test database.
 * Expected values are recomputed independently with SQL over the same rows, not hard-coded.
 */

const PASSWORD = 'test-demo-password-123';
const MEERA = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const RAIN = { kind: 'WEATHER_SLOWDOWN', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, durationMinutes: 480, label: 'Heavy rain on ghat section' } as const;
const DIGEST = ['Shipment', 'ShipmentEvent', 'DelayAttribution', 'RiskSnapshot', 'RecoveryOption', 'Alert', 'Notification', 'AuditLog'] as const;

let prisma: PrismaClient;
let srv: TestServer;
let sim: SimulationService;
const cookies: Record<'meera' | 'kestrel' | 'ramesh' | 'suresh', string> = { meera: '', kestrel: '', ramesh: '', suresh: '' };

async function call<T>(method: 'GET' | 'POST', path: string, who: keyof typeof cookies | null, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${srv.baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
const dash = (q = '', who: keyof typeof cookies | null = 'meera') => call<DashboardResponse & ApiError>('GET', `/api/analytics/dashboard${q}`, who);
const advance = (h: number, m: number) => sim.control({ action: 'ADVANCE_TO', to: at(h, m) }, MEERA);

/** Independent SQL view of the filtered set. */
async function sqlSet(from: string, to: string, laneId?: string) {
  return prisma.$queryRawUnsafe<{ id: string; laneId: string; transporterId: string; onTime: boolean; minutes: number }[]>(
    `SELECT s.id, s."laneId", s."transporterId", s."onTime",
            COALESCE((SELECT ROUND(SUM(a."delaySeconds") / 60.0) FROM "DelayAttribution" a WHERE a."shipmentId" = s.id), 0)::int AS minutes
       FROM "Shipment" s
      WHERE s."arrivedAt" >= $1::timestamptz AND s."arrivedAt" <= $2::timestamptz ${laneId ? 'AND s."laneId" = $3' : ''}`,
    from,
    to,
    ...(laneId ? [laneId] : []),
  );
}

beforeAll(async () => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
  srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD }, simulation: { timers: false, realNow: () => 0 } });
  sim = (srv.app.locals as AppLocals).simulation;
  await sim.reset(MEERA);
  cookies.meera = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
  cookies.kestrel = await loginCookie(srv.baseUrl, 'buyer@kestrel.test', PASSWORD);
  cookies.ramesh = await loginCookie(srv.baseUrl, 'driver.ramesh@ghatline.test', PASSWORD);
  cookies.suresh = await loginCookie(srv.baseUrl, 'driver.suresh@ghatline.test', PASSWORD);
});

afterAll(async () => {
  await srv.close();
  await prisma.$disconnect();
});

describe('#36 access and validation', () => {
  it('coordinator only: customer and driver 403, anonymous 401', async () => {
    expect((await dash('', 'kestrel')).status).toBe(403);
    expect((await dash('', 'ramesh')).status).toBe(403);
    expect((await dash('', null)).status).toBe(401);
    expect((await dash()).status).toBe(200);
  });

  it('rejects bad period and unknown fields (400); unknown lane / transporter 404', async () => {
    const bad = await dash('?period=90d&colour=red');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect((await dash('?laneId=lane_nowhere')).status).toBe(404);
    expect((await dash('?transporterId=trn_nowhere')).status).toBe(404);
  });
});

describe('#36 numbers from the seeded history (AC-M5.1, AC-M5.6)', () => {
  it('default 30 d window ends at the settled sim time; counts match SQL; weekly buckets add up', async () => {
    const r = await dash();
    expect(r.status).toBe(200);
    const state = await prisma.simState.findFirstOrThrow({ select: { lastSettledAt: true } });
    expect(r.body.filter).toMatchObject({ period: '30d', laneId: null, transporterId: null, to: state.lastSettledAt.toISOString() });
    expect(Date.parse(r.body.filter.to) - Date.parse(r.body.filter.from)).toBe(30 * 86_400_000);
    expect(r.body.generatedAtSim).toBe(r.body.filter.to);
    const rows = await sqlSet(r.body.filter.from, r.body.filter.to);
    expect(r.body.arrivedCount).toBe(rows.length);
    expect(r.body.arrivedCount).toBeGreaterThan(50);
    const onTime = rows.filter((x) => x.onTime).length;
    expect(r.body.kpis.lateCount).toBe(rows.length - onTime);
    expect(r.body.kpis.onTimePct).toBe(Math.floor((onTime * 1000) / rows.length + 0.5) / 10);
    expect(r.body.weeklyTrend.reduce((a, w) => a + w.delivered, 0)).toBe(r.body.arrivedCount);
    for (const w of r.body.weeklyTrend) expect(w.weekStart.endsWith('T18:30:00.000Z') && new Date(w.weekStart).getUTCDay() === 0).toBe(true); // Monday 00:00 IST
    expect(r.body.dataNote).toBe('Fictional seeded data for Plant X.');
    expect(Object.keys(r.body.definitions).sort()).toEqual(['fairOnTime', 'onTime', 'proactiveNotice', 'recovered', 'warningLead']);
  });

  it('per-lane on-time and total cause minutes reconcile with an independent SQL count (60 d)', async () => {
    const r = await dash('?period=60d');
    const rows = await sqlSet(r.body.filter.from, r.body.filter.to);
    for (const lane of r.body.onTimeByLane) {
      const mine = rows.filter((x) => x.laneId === lane.laneId);
      expect([lane.delivered, lane.onTime]).toEqual([mine.length, mine.filter((x) => x.onTime).length]);
    }
    expect(r.body.onTimeByLane.reduce((a, l) => a + l.delivered, 0)).toBe(rows.length);
    const minutes = rows.reduce((a, x) => a + x.minutes, 0);
    expect(r.body.causesByParty.reduce((a, c) => a + c.minutes, 0)).toBe(minutes);
    expect(r.body.causesByParty.map((c) => c.party)).toEqual(['PLANT', 'TRANSPORTER', 'CUSTOMER', 'EXTERNAL', 'UNATTRIBUTED']);
    expect(Math.round(r.body.causesByParty.reduce((a, c) => a + (c.sharePct ?? 0), 0) * 10)).toBe(1000);
    // every transporter: fair ≥ raw (an on-time shipment never counts against), gap = fair − raw within rounding
    for (const t of r.body.transporterTable) {
      expect(t.fairOnTimePct! >= t.rawOnTimePct!).toBe(true);
      expect(Math.abs(t.gapPct! - (t.fairOnTimePct! - t.rawOnTimePct!))).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    // shorter windows are subsets
    const d7 = (await dash('?period=7d')).body.arrivedCount;
    const d30 = (await dash('?period=30d')).body.arrivedCount;
    expect(d7 <= d30 && d30 <= r.body.arrivedCount).toBe(true);
  });

  it('lane and transporter filters narrow every section to the same set (AC-M5.2)', async () => {
    const lane = await dash('?period=60d&laneId=lane_pune');
    const rows = await sqlSet(lane.body.filter.from, lane.body.filter.to, 'lane_pune');
    expect(lane.body.filter.laneId).toBe('lane_pune');
    expect(lane.body.arrivedCount).toBe(rows.length);
    expect(lane.body.onTimeByLane.map((l) => l.laneId)).toEqual(['lane_pune']);
    expect(lane.body.causesByLane.map((l) => l.laneId)).toEqual(['lane_pune']);
    const t = await dash('?period=60d&transporterId=trn_ghatline');
    expect(t.body.onTimeByTransporter.map((x) => x.transporterId)).toEqual(['trn_ghatline']);
    expect(t.body.transporterTable).toHaveLength(1);
    expect(t.body.transporterTable[0]!.delivered).toBe(t.body.arrivedCount);
  });

  it('is read-only: repeated calls change nothing', async () => {
    const before = await databaseDigest(prisma, DIGEST);
    await dash();
    await dash('?period=60d&laneId=lane_pune');
    await dash('?period=7d&transporterId=trn_ghatline');
    expect(await databaseDigest(prisma, DIGEST)).toEqual(before);
  });
});

describe('#36 after a live arrival (AC-M5.7)', () => {
  it('the hero arrives on time after the replacement truck → counted, on time, reached At risk, recovered', async () => {
    await sim.reset(MEERA);
    await advance(10, 30);
    await call('POST', '/api/disruptions', 'meera', RAIN);
    await advance(11, 10);
    await call('POST', '/api/shipments/shp_1042/driver-reports', 'ramesh', { text: 'tyre puncture near Lonavala', reason: 'BREAKDOWN' });
    await advance(11, 25);
    const o = (await call<RecoveryOptionsResponse>('GET', '/api/shipments/shp_1042/recovery-options', 'meera')).body;
    const rep = o.options.find((x) => x.kind === 'REPLACEMENT_TRUCK')!;
    expect((await call<ChooseRecoveryResponse>('POST', `/api/shipments/shp_1042/recovery-options/${rep.id}/choose`, 'meera', { optionSetId: o.optionSetId, confirm: true })).status).toBe(200);
    await advance(18, 5);
    const before = (await dash('?period=7d&laneId=lane_pune&transporterId=trn_ghatline')).body;
    expect((await call('POST', '/api/shipments/shp_1042/milestones', 'suresh', { milestone: 'ARRIVED' })).status).toBe(200);
    const after = (await dash('?period=7d&laneId=lane_pune&transporterId=trn_ghatline')).body;
    expect(after.arrivedCount).toBe(before.arrivedCount + 1);
    expect(after.kpis.lateCount).toBe(before.kpis.lateCount);
    // independent: the hero is in the set and meets the "recovered" definition
    const hero = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' }, select: { onTime: true, firstAtRiskAt: true, options: { where: { status: 'CHOSEN' }, select: { id: true } } } });
    expect(hero.onTime).toBe(true);
    expect(hero.firstAtRiskAt?.toISOString()).toBe(at(11, 10).toISOString());
    expect(hero.options).toHaveLength(1);
    const [k] = await prisma.$queryRawUnsafe<{ reached: number; recovered: number }[]>(
      `SELECT COUNT(*) FILTER (WHERE s."firstAtRiskAt" IS NOT NULL)::int AS reached,
              COUNT(*) FILTER (WHERE s."firstAtRiskAt" IS NOT NULL AND s."onTime"
                               AND EXISTS (SELECT 1 FROM "RecoveryOption" o WHERE o."shipmentId" = s.id AND o.status = 'CHOSEN'))::int AS recovered
         FROM "Shipment" s
        WHERE s."arrivedAt" >= $1::timestamptz AND s."arrivedAt" <= $2::timestamptz AND s."laneId" = 'lane_pune' AND s."transporterId" = 'trn_ghatline'`,
      after.filter.from,
      after.filter.to,
    );
    expect(k!.recovered).toBeGreaterThanOrEqual(1); // the hero
    expect(after.kpis.recoveredPct).toBe(Math.floor((k!.recovered * 1000) / k!.reached + 0.5) / 10);
  });
});
