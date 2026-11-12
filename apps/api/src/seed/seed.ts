/**
 * Deterministic seed (PROGRESS tasks 4.2–4.5).
 *
 * Idempotent: one transaction truncates every business table and re-inserts the same rows with
 * the same ids, so running it any number of times yields identical business data and never
 * duplicates. SimState is updated, not truncated, so worldVersion stays monotonic (schema §6).
 *
 * Not deterministic by design (excluded from reproducibility digests): bcrypt password hashes
 * (random salt), real-time `createdAt`/`updatedAt` columns, and `SimState.worldVersion`.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { routeProblems } from '../guards/geo.js';
import { SEED_NAME, SEED_START } from './constants.js';
import { addHistory } from './history.js';
import { addLiveShipments } from './live.js';
import { BUILT_ROUTES, CUSTOMERS, CUSTOMER_RECEIVING, LANES, TRANSPORTERS, TRUCKS, USERS, primaryRouteOf } from './referenceData.js';
import { emptyRows, type SeedRows } from './rows.js';

export const MIN_DEMO_PASSWORD_LENGTH = 12;

/** Tables truncated by the seed, children first (schema §6 note 3). SimState is kept. */
export const BUSINESS_TABLES = [
  'AuditLog',
  'Notification',
  'RecoveryOption',
  'Alert',
  'DelayAttribution',
  'DriverReport',
  'Disruption',
  'RiskSnapshot',
  'ShipmentEvent',
  'ShipmentItem',
  'Shipment',
  'OrderLine',
  'Order',
  'Truck',
  'Route',
  'Lane',
  'User',
  'Transporter',
  'Customer',
] as const;

/** Plain-JSON copy for Prisma Json columns (validated by the route guard first). */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Builds every row in memory (pure apart from the password hash supplied by the caller). */
export function buildSeedRows(passwordHash: string): SeedRows {
  const rows = emptyRows();

  for (const c of CUSTOMERS) rows.customers.push({ ...c, ...CUSTOMER_RECEIVING, timezone: 'Asia/Kolkata' });
  for (const t of TRANSPORTERS) rows.transporters.push({ ...t });
  for (const u of USERS) {
    rows.users.push({
      id: u.id,
      email: u.email,
      passwordHash,
      name: u.name,
      phone: u.phone ?? null,
      role: u.role,
      customerId: u.customerId ?? null,
      transporterId: u.transporterId ?? null,
    });
  }
  for (const t of TRUCKS) rows.trucks.push({ ...t, defaultDriverUserId: t.defaultDriverUserId ?? null });

  for (const l of LANES) {
    const primary = primaryRouteOf(l.id);
    rows.lanes.push({ ...l, baselineMinutes: primary.baselineMinutes, distanceKm: primary.lengthKm });
  }
  for (const r of BUILT_ROUTES) {
    const problems = routeProblems(r);
    if (problems.length > 0) throw new Error(`Invalid seed route data:\n- ${problems.join('\n- ')}`);
    rows.routes.push({
      id: r.id,
      code: r.code,
      laneId: r.laneId,
      name: r.name,
      isPrimary: r.isPrimary,
      lengthKm: r.lengthKm,
      baselineMinutes: r.baselineMinutes,
      geometry: toJson(r.geometry),
      segments: toJson(r.segments),
    });
  }

  addHistory(rows);
  addLiveShipments(rows);
  return rows;
}

export interface SeedSummary {
  seedName: string;
  simTime: string;
  worldVersion: number;
  counts: Record<string, number>;
}

export async function runSeed(prisma: PrismaClient, opts: { demoPassword: string }): Promise<SeedSummary> {
  if (opts.demoPassword.length < MIN_DEMO_PASSWORD_LENGTH) {
    throw new Error(`SEED_DEMO_PASSWORD must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters`);
  }
  // One hash for every demo account (they share the demo password); cost 10 (architecture §7.1).
  const passwordHash = await bcrypt.hash(opts.demoPassword, 10);
  const rows = buildSeedRows(passwordHash);

  const worldVersion = await prisma.$transaction(
    async (tx) => {
      const tables = BUSINESS_TABLES.map((t) => `"${t}"`).join(', ');
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);

      await tx.customer.createMany({ data: rows.customers });
      await tx.transporter.createMany({ data: rows.transporters });
      await tx.user.createMany({ data: rows.users });
      await tx.truck.createMany({ data: rows.trucks });
      await tx.lane.createMany({ data: rows.lanes });
      await tx.route.createMany({ data: rows.routes });
      await tx.order.createMany({ data: rows.orders });
      await tx.orderLine.createMany({ data: rows.orderLines });
      await tx.shipment.createMany({ data: rows.shipments });
      await tx.shipmentItem.createMany({ data: rows.shipmentItems });
      await tx.disruption.createMany({ data: rows.disruptions });
      await tx.driverReport.createMany({ data: rows.driverReports });
      await tx.shipmentEvent.createMany({ data: rows.events });
      await tx.alert.createMany({ data: rows.alerts });
      await tx.recoveryOption.createMany({ data: rows.recoveryOptions });
      await tx.notification.createMany({ data: rows.notifications });
      await tx.delayAttribution.createMany({ data: rows.attributions });

      const previous = await tx.simState.findUnique({ where: { id: 1 } });
      const next = (previous?.worldVersion ?? 0) + 1;
      await tx.simState.upsert({
        where: { id: 1 },
        create: { id: 1, simTime: SEED_START, lastSettledAt: SEED_START, running: false, speed: 1, stepMinutes: 5, worldVersion: next, seedName: SEED_NAME },
        update: { simTime: SEED_START, lastSettledAt: SEED_START, running: false, speed: 1, stepMinutes: 5, worldVersion: next, seedName: SEED_NAME, simError: null },
      });
      return next;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, (v as unknown[]).length]));
  return { seedName: SEED_NAME, simTime: SEED_START.toISOString(), worldVersion, counts };
}
