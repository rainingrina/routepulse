/**
 * `npm run seed` — re-creates the deterministic demo data in DATABASE_URL.
 * Requires DATABASE_URL and SEED_DEMO_PASSWORD (≥ 12 chars, kept in the gitignored .env).
 * Leaves the simulation clock at Thu 08:00, paused. The 10:25 hero pre-script arrives with the
 * simulation engine (Milestone 4).
 */
import { createPrisma } from '../db/prisma.js';
import { runSeed } from './seed.js';

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  const password = process.env['SEED_DEMO_PASSWORD'];
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!password) throw new Error('SEED_DEMO_PASSWORD is not set (see apps/api/.env.example)');

  const prisma = createPrisma(url);
  const started = Date.now();
  try {
    const summary = await runSeed(prisma, { demoPassword: password });
    process.stdout.write(`${JSON.stringify({ ...summary, durationMs: Date.now() - started }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
