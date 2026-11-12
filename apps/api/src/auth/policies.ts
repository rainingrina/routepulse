import type { PrismaClient } from '../db/prisma.js';
import { notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from './types.js';

/**
 * Row scoping (architecture §7.2, spec §4). Every query for a scoped resource must AND its own
 * filter with the fragment returned here. The fragment is derived from the server-side AuthUser
 * only — never from client input.
 *
 *   COORDINATOR → everything
 *   CUSTOMER    → only rows belonging to their own customer company
 *   DRIVER      → only shipments assigned to them (and their own reports); no orders, alerts,
 *                 notifications or customer records
 *
 * Out-of-scope ids are indistinguishable from missing ids (404 NOT_FOUND, AC-M1.4).
 */

// A filter that matches nothing, typed per model.
const NONE = { id: { in: [] as string[] } };

export function shipmentScope(user: AuthUser): Prisma.ShipmentWhereInput {
  switch (user.role) {
    case 'COORDINATOR':
      return {};
    case 'CUSTOMER':
      return user.customerId ? { order: { customerId: user.customerId } } : NONE;
    case 'DRIVER':
      return { driverUserId: user.id };
  }
}

export function orderScope(user: AuthUser): Prisma.OrderWhereInput {
  switch (user.role) {
    case 'COORDINATOR':
      return {};
    case 'CUSTOMER':
      return user.customerId ? { customerId: user.customerId } : NONE;
    case 'DRIVER':
      return NONE;
  }
}

export function alertScope(user: AuthUser): Prisma.AlertWhereInput {
  switch (user.role) {
    case 'COORDINATOR':
      return {};
    case 'CUSTOMER':
      return user.customerId ? { shipment: { order: { customerId: user.customerId } } } : NONE;
    case 'DRIVER':
      return NONE;
  }
}

export function notificationScope(user: AuthUser): Prisma.NotificationWhereInput {
  switch (user.role) {
    case 'COORDINATOR':
      return { audience: 'COORDINATOR' };
    case 'CUSTOMER':
      return user.customerId ? { audience: 'CUSTOMER', customerId: user.customerId } : NONE;
    case 'DRIVER':
      return NONE;
  }
}

export function customerScope(user: AuthUser): Prisma.CustomerWhereInput {
  switch (user.role) {
    case 'COORDINATOR':
      return {};
    case 'CUSTOMER':
      return user.customerId ? { id: user.customerId } : NONE;
    case 'DRIVER':
      return NONE;
  }
}

export function driverReportScope(user: AuthUser): Prisma.DriverReportWhereInput {
  switch (user.role) {
    case 'COORDINATOR':
      return {};
    case 'CUSTOMER':
      return NONE;
    case 'DRIVER':
      return { reporterUserId: user.id };
  }
}

// ───────────── Guards that turn "not in scope" into 404 ─────────────

export async function assertShipmentInScope(prisma: PrismaClient, user: AuthUser, id: string): Promise<void> {
  const row = await prisma.shipment.findFirst({ where: { AND: [{ id }, shipmentScope(user)] }, select: { id: true } });
  if (!row) throw notFound();
}

export async function assertOrderInScope(prisma: PrismaClient, user: AuthUser, id: string): Promise<void> {
  const row = await prisma.order.findFirst({ where: { AND: [{ id }, orderScope(user)] }, select: { id: true } });
  if (!row) throw notFound();
}

export async function assertAlertInScope(prisma: PrismaClient, user: AuthUser, id: string): Promise<void> {
  const row = await prisma.alert.findFirst({ where: { AND: [{ id }, alertScope(user)] }, select: { id: true } });
  if (!row) throw notFound();
}

export async function assertNotificationInScope(prisma: PrismaClient, user: AuthUser, id: string): Promise<void> {
  const row = await prisma.notification.findFirst({ where: { AND: [{ id }, notificationScope(user)] }, select: { id: true } });
  if (!row) throw notFound();
}
