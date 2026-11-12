import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { SEED_START } from '../../src/seed/constants.js';
import { BUSINESS_TABLES, runSeed } from '../../src/seed/seed.js';

const DEMO_PASSWORD = 'test-demo-password-123';
let prisma: PrismaClient;

/** Columns that are intentionally not deterministic (seed.ts header). */
const VOLATILE = ['createdAt', 'updatedAt', 'passwordHash'];

async function tableDigest(table: string): Promise<{ rows: number; hash: string }> {
  const drop = VOLATILE.map((c) => ` - '${c}'`).join('');
  const rows = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT to_jsonb(t)${drop} AS j FROM "${table}" t ORDER BY t."id"`);
  return { rows: rows.length, hash: createHash('sha256').update(JSON.stringify(rows.map((r) => r.j))).digest('hex') };
}

async function databaseDigest(): Promise<Record<string, { rows: number; hash: string }>> {
  const out: Record<string, { rows: number; hash: string }> = {};
  for (const t of BUSINESS_TABLES) out[t] = await tableDigest(t);
  const sim = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT to_jsonb(s) - 'worldVersion' AS j FROM "SimState" s`);
  out['SimState'] = { rows: sim.length, hash: createHash('sha256').update(JSON.stringify(sim)).digest('hex') };
  return out;
}

beforeAll(async () => {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url.includes('test')) throw new Error(`seed tests must run on the test database, got ${url}`);
  prisma = createPrisma(url);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('deterministic seed — two resets give identical business state', () => {
  let first: Record<string, { rows: number; hash: string }>;
  let v1: number;

  it('seeds once', async () => {
    const s = await runSeed(prisma, { demoPassword: DEMO_PASSWORD });
    v1 = s.worldVersion;
    first = await databaseDigest();
    expect(first['Shipment']?.rows).toBeGreaterThan(150);
  });

  it('seeds again: identical digest for every table, no duplicates, worldVersion strictly increased', async () => {
    const s2 = await runSeed(prisma, { demoPassword: DEMO_PASSWORD });
    const second = await databaseDigest();
    expect(second).toEqual(first);
    expect(s2.worldVersion).toBe(v1 + 1);
  });

  it('leaves the clock at Thu 08:00 IST, paused, on the 5-minute grid', async () => {
    const sim = await prisma.simState.findUniqueOrThrow({ where: { id: 1 } });
    expect(sim.simTime.toISOString()).toBe(SEED_START.toISOString());
    expect(sim.lastSettledAt.toISOString()).toBe(SEED_START.toISOString());
    expect(sim).toMatchObject({ running: false, speed: 1, stepMinutes: 5, seedName: 'hero-v1', simError: null });
  });
});

describe('seeded data invariants (database)', () => {
  it('reconciles Σ attribution with arrivedAt − plannedArrivalAt for every arrived shipment', async () => {
    const bad = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Shipment" s
      LEFT JOIN (SELECT "shipmentId", sum("delaySeconds") AS sec FROM "DelayAttribution" GROUP BY 1) a ON a."shipmentId" = s.id
      WHERE s."arrivedAt" IS NOT NULL
        AND coalesce(a.sec, 0) <> extract(epoch FROM (s."arrivedAt" - s."plannedArrivalAt"))::int`;
    expect(Number(bad[0]?.n)).toBe(0);
  });

  it('measures on-time at arrival against the agreed promise (L1)', async () => {
    const bad = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Shipment"
      WHERE "arrivedAt" IS NOT NULL AND ("onTime" <> ("arrivedAt" <= "promisedBy")
        OR "delayMinutes" <> greatest(0, round(extract(epoch FROM ("arrivedAt" - "promisedBy")) / 60))::int)`;
    expect(Number(bad[0]?.n)).toBe(0);
  });

  it('keeps 12 live shipments with no cached ETA (engine not run yet) and unique live trucks', async () => {
    const live = await prisma.shipment.findMany({ where: { isHistorical: false }, select: { code: true, etaAt: true, riskLevel: true, truckId: true } });
    expect(live).toHaveLength(12);
    expect(live.every((s) => s.etaAt === null && s.riskLevel === null)).toBe(true);
    expect(new Set(live.map((s) => s.truckId)).size).toBe(12);
  });

  it('stores lane baselines equal to their primary route baselines', async () => {
    const mismatched = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Lane" l JOIN "Route" r ON r."laneId" = l.id AND r."isPrimary"
      WHERE r."baselineMinutes" <> l."baselineMinutes"`;
    expect(Number(mismatched[0]?.n)).toBe(0);
  });
});

describe('documented constraints exist (schema §5)', () => {
  it('has every raw-SQL CHECK constraint', async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY 1`;
    expect(rows.map((r) => r.conname)).toEqual([
      'Alert_chosen_chk', 'Alert_response_pair_chk',
      'Customer_receiving_hours_chk', 'Customer_unloading_chk',
      'DelayAttribution_disr_source_chk', 'DelayAttribution_gap_key_chk', 'DelayAttribution_gap_party_chk',
      'DelayAttribution_override_pair_chk', 'DelayAttribution_route_source_chk', 'DelayAttribution_rpt_source_chk',
      'DelayAttribution_seconds_chk',
      'Disruption_breakdown_chk', 'Disruption_closure_chk', 'Disruption_gate_chk', 'Disruption_weather_chk', 'Disruption_window_chk',
      'DriverReport_applied_chk', 'DriverReport_change_note_chk', 'DriverReport_input_chk', 'DriverReport_review_chk', 'DriverReport_text_len_chk',
      'Lane_positive_chk', 'Notification_audience_chk', 'OrderLine_quantity_chk',
      'RecoveryOption_co2e_pair_chk', 'RecoveryOption_cost_chk', 'RecoveryOption_infeasible_reason_chk', 'RecoveryOption_suggested_chk',
      'RiskSnapshot_range_chk', 'RiskSnapshot_score_chk',
      'ShipmentEvent_milestone_chk', 'ShipmentItem_quantity_chk',
      'Shipment_arrival_physical_chk', 'Shipment_delay_nonneg_chk', 'Shipment_delivered_after_arrival_chk', 'Shipment_delivered_order_chk',
      'Shipment_outcome_together_chk', 'Shipment_plan_order_chk', 'Shipment_progress_chk', 'Shipment_risk_score_chk', 'Shipment_window_override_chk',
      'SimState_settled_chk', 'SimState_singleton_chk', 'SimState_speed_chk', 'SimState_step_chk',
      'Transporter_fleet_chk', 'Truck_capacity_chk',
      'User_email_lower_chk', 'User_role_scope_chk',
    ]);
  });

  it('has the five partial unique indexes', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '%WHERE%' ORDER BY 1`;
    expect(rows.map((r) => r.indexname)).toEqual([
      'alert_one_open_per_shipment', 'event_milestone_once', 'option_one_suggested_per_set',
      'route_one_primary_per_lane', 'shipment_one_live_per_truck',
    ]);
  });

  it('uses ON DELETE CASCADE only where the design says so', async () => {
    const rows = await prisma.$queryRaw<{ child: string }[]>`
      SELECT conrelid::regclass::text AS child FROM pg_constraint WHERE contype = 'f' AND confdeltype = 'c' ORDER BY 1`;
    expect(rows.map((r) => r.child.replace(/"/g, ''))).toEqual(['DelayAttribution', 'OrderLine', 'RiskSnapshot', 'ShipmentEvent', 'ShipmentItem']);
  });
});

describe('constraints reject bad data (behaviour)', () => {
  const rejects = (p: Promise<unknown>) => expect(p).rejects.toThrow();

  it('User: role scope and lower-case email', async () => {
    await rejects(prisma.user.create({ data: { id: 'x1', email: 'x1@x.test', passwordHash: 'h', name: 'X', role: 'CUSTOMER' } }));
    await rejects(prisma.user.create({ data: { id: 'x2', email: 'Upper@x.test', passwordHash: 'h', name: 'X', role: 'COORDINATOR' } }));
  });

  it('Route: only one primary route per lane', async () => {
    await rejects(prisma.route.create({ data: { id: 'x3', code: 'X3', laneId: 'lane_pune', name: 'x', isPrimary: true, lengthKm: 1, baselineMinutes: 1, geometry: {}, segments: [] } }));
  });

  it('Shipment: a truck carries one live shipment; override needs renegotiation; arrival needs physical arrival', async () => {
    const hero = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
    const { id: _id, code: _code, createdAt: _c, updatedAt: _u, ...rest } = hero;
    await rejects(prisma.shipment.create({ data: { ...rest, id: 'x4', code: 'X4' } }));
    await rejects(prisma.shipment.update({ where: { id: 'shp_1042' }, data: { receivingWindowOverrideEndAt: new Date(hero.promisedBy.getTime() + 3600_000) } }));
    await rejects(prisma.shipment.update({ where: { id: 'shp_1042' }, data: { arrivedAt: hero.promisedBy, delayMinutes: 0, onTime: true } }));
  });

  it('ShipmentEvent: a milestone is recorded at most once per shipment', async () => {
    await rejects(prisma.shipmentEvent.create({ data: { id: 'x5', shipmentId: 'shp_1042', type: 'MILESTONE', milestone: 'ORDER_CONFIRMED', simTime: SEED_START, source: 'SEED' } }));
  });

  it('Alert: at most one active episode per shipment (AC-M4.7)', async () => {
    await prisma.alert.create({ data: { id: 'x6', shipmentId: 'shp_1042', openedAt: SEED_START } });
    try {
      await rejects(prisma.alert.create({ data: { id: 'x7', shipmentId: 'shp_1042', openedAt: SEED_START } }));
    } finally {
      await prisma.alert.delete({ where: { id: 'x6' } });
    }
  });

  it('RecoveryOption: NEW_WINDOW can never be Suggested', async () => {
    await rejects(prisma.recoveryOption.create({ data: { id: 'x8', shipmentId: 'shp_1042', optionSetId: 'xs', createdAtSim: SEED_START, kind: 'NEW_WINDOW', feasible: true, meetsPromise: true, minutesSavedVsNotify: 0, extraCostInr: 0, isSuggested: true, suggestionRule: 'r', constraints: [], params: {} } }));
  });

  it('DelayAttribution: a GAP row must be UNATTRIBUTED', async () => {
    await rejects(prisma.delayAttribution.create({ data: { id: 'x9', shipmentId: 'shp_1042', sourceKey: 'GAP', kind: 'GAP', party: 'PLANT', delaySeconds: 60, updatedAtSim: SEED_START } }));
  });

  it('Disruption: weather slowdown must be 1–90 %', async () => {
    await rejects(prisma.disruption.create({ data: { id: 'x10', kind: 'WEATHER_SLOWDOWN', origin: 'SIMULATOR', label: 'x', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 95, party: 'EXTERNAL', reasonCode: 'HEAVY_RAIN', startsAt: SEED_START, endsAt: new Date(SEED_START.getTime() + 60_000) } }));
  });

  it('left no stray rows behind', async () => {
    const strays = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT (SELECT count(*) FROM "User" WHERE id LIKE 'x%') + (SELECT count(*) FROM "Alert" WHERE id LIKE 'x%') AS n`;
    expect(Number(strays[0]?.n)).toBe(0);
  });
});
