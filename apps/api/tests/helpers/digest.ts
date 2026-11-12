import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../src/db/prisma.js';
import { BUSINESS_TABLES } from '../../src/seed/seed.js';

/** Columns that are intentionally not deterministic (seed.ts header; AuditLog ids are cuid). */
const VOLATILE: Record<string, string[]> = {
  default: ['createdAt', 'updatedAt', 'passwordHash'],
  AuditLog: ['id', 'createdAt'],
};

export async function tableDigest(prisma: PrismaClient, table: string): Promise<{ rows: number; hash: string }> {
  const drop = (VOLATILE[table] ?? VOLATILE['default'] ?? []).map((c) => ` - '${c}'`).join('');
  const order = table === 'AuditLog' ? `t."action", t."entityId", t."simTime"` : `t."id"`;
  const rows = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT to_jsonb(t)${drop} AS j FROM "${table}" t ORDER BY ${order}`);
  return { rows: rows.length, hash: createHash('sha256').update(JSON.stringify(rows.map((r) => r.j))).digest('hex') };
}

/**
 * Digest of every business table plus SimState (always without worldVersion). `simStateIgnore`
 * drops clock settings that legitimately differ between equivalent runs (e.g. speed).
 */
export async function databaseDigest(
  prisma: PrismaClient,
  tables: readonly string[] = BUSINESS_TABLES,
  simStateIgnore: readonly string[] = [],
): Promise<Record<string, { rows: number; hash: string }>> {
  const out: Record<string, { rows: number; hash: string }> = {};
  for (const t of tables) out[t] = await tableDigest(prisma, t);
  const drop = ['worldVersion', ...simStateIgnore].map((c) => ` - '${c}'`).join('');
  const sim = await prisma.$queryRawUnsafe<{ j: unknown }[]>(`SELECT to_jsonb(s)${drop} AS j FROM "SimState" s`);
  out['SimState'] = { rows: sim.length, hash: createHash('sha256').update(JSON.stringify(sim)).digest('hex') };
  return out;
}
