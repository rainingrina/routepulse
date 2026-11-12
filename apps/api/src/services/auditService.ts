import type { Role } from '@routepulse/shared';
import type { PrismaClient } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  actorUserId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string | null;
  data?: Prisma.InputJsonValue;
}

/**
 * Writes one AuditLog row (spec §5.14). `simTime` is the current simulation time when a clock
 * exists. Never put passwords, tokens or cookies in `data`.
 */
export async function writeAudit(prisma: PrismaClient, entry: AuditEntry): Promise<void> {
  const sim = await prisma.simState.findUnique({ where: { id: 1 }, select: { simTime: true } });
  await prisma.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      simTime: sim?.simTime ?? null,
      data: entry.data ?? {},
    },
  });
}
