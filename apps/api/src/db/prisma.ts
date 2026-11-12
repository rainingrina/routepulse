import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * One PrismaClient (one pool) per process (Prisma 7 driver-adapter setup).
 *
 * Every session is forced to `TimeZone=UTC`. Without this, a server whose default time zone is
 * not UTC (e.g. Homebrew PostgreSQL on a machine set to Asia/Kolkata) interprets offset-less
 * timestamps from the adapter as local time and stores them shifted (found in Milestone 2;
 * regression test: tests/integration/timezone.test.ts). Business times are always UTC in the
 * database and are displayed in Asia/Kolkata by the API/UI.
 */
export function createPrisma(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, options: '-c TimeZone=UTC' });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
