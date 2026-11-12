import type { NotificationDto } from '@routepulse/shared';
import { notificationScope } from '../auth/policies.js';
import type { AuthUser } from '../auth/types.js';
import { notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { NOTIFICATION_SELECT, toNotificationDto } from '../serializers/alert.js';
import { fromS, type Db } from '../sim/world.js';

/**
 * Notification centre (API §11). Coordinator notifications share one read state (D8); customers see
 * only their own company's CUSTOMER notifications; drivers have none (403 at the route).
 * Notifications are created by the pipeline (alerts), reports and alert responses — never here.
 */
const unreadWhere = (user: AuthUser): Prisma.NotificationWhereInput => ({ AND: [notificationScope(user), { readAt: null }] });

export async function listNotifications(db: Db, user: AuthUser, q: { unreadOnly: boolean; limit: number }): Promise<{ items: NotificationDto[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: q.unreadOnly ? unreadWhere(user) : notificationScope(user),
      orderBy: [{ simTime: 'desc' }, { id: 'desc' }],
      take: q.limit,
      select: NOTIFICATION_SELECT,
    }),
    db.notification.count({ where: unreadWhere(user) }),
  ]);
  return { items: rows.map(toNotificationDto), unreadCount };
}

/** Marks one as read at the current simulation time; idempotent (already read → unchanged). */
export async function markRead(tx: Prisma.TransactionClient, user: AuthUser, id: string, atS: number): Promise<{ notification: NotificationDto; unreadCount: number }> {
  const n = await tx.notification.findFirst({ where: { AND: [{ id }, notificationScope(user)] }, select: { id: true, readAt: true } });
  if (!n) throw notFound();
  if (!n.readAt) await tx.notification.update({ where: { id }, data: { readAt: fromS(atS) } });
  const row = await tx.notification.findUniqueOrThrow({ where: { id }, select: NOTIFICATION_SELECT });
  return { notification: toNotificationDto(row), unreadCount: await tx.notification.count({ where: unreadWhere(user) }) };
}

export async function markAllRead(tx: Prisma.TransactionClient, user: AuthUser, atS: number): Promise<{ updated: number; unreadCount: 0 }> {
  const r = await tx.notification.updateMany({ where: unreadWhere(user), data: { readAt: fromS(atS) } });
  return { updated: r.count, unreadCount: 0 };
}
