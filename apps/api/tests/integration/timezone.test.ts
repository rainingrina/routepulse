import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { runSeed } from '../../src/seed/seed.js';

/**
 * Regression test for the Milestone 2 time-zone bug: timestamps must be STORED as the intended
 * UTC instant, not only round-trip through Prisma. The check reads the value with SQL in UTC,
 * independent of the database server's default time zone.
 */
let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
  await runSeed(prisma, { demoPassword: 'test-demo-password-123' });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('timestamps are stored as UTC instants', () => {
  it('stores SHP-1042 planned gate 08:10 IST as 02:40 UTC in the database', async () => {
    const rows = await prisma.$queryRaw<{ utc: string; ist: string }[]>`
      SELECT to_char("plannedGateAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS utc,
             to_char("plannedGateAt" AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS ist
      FROM "Shipment" WHERE id = 'shp_1042'`;
    expect(rows[0]).toEqual({ utc: '2026-11-19T02:40', ist: '08:10' });
  });

  it('stores the hero promise as Thu 18:00 IST', async () => {
    const rows = await prisma.$queryRaw<{ ist: string }[]>`
      SELECT to_char("promisedBy" AT TIME ZONE 'Asia/Kolkata', 'Dy HH24:MI') AS ist FROM "Shipment" WHERE id = 'shp_1042'`;
    expect(rows[0]?.ist).toBe('Thu 18:00');
  });
});
