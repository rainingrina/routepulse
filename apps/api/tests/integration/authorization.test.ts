import type { ApiError, Role } from '@routepulse/shared';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireDemoMode, requireRole, sessionMiddleware } from '../../src/auth/middleware.js';
import { RevokedSessions, issueToken } from '../../src/auth/session.js';
import {
  alertScope,
  assertAlertInScope,
  assertNotificationInScope,
  assertOrderInScope,
  assertShipmentInScope,
  customerScope,
  driverReportScope,
  notificationScope,
  orderScope,
  shipmentScope,
} from '../../src/auth/policies.js';
import type { AuthUser } from '../../src/auth/types.js';
import { loadConfig } from '../../src/config/env.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { DomainError } from '../../src/errors/domainError.js';
import { createLogger } from '../../src/logging/logger.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requestId } from '../../src/middleware/requestId.js';
import { runSeed } from '../../src/seed/seed.js';

let prisma: PrismaClient;

const coordinator: AuthUser = { id: 'usr_coord_meera', role: 'COORDINATOR', name: 'Meera', email: 'coordinator@plantx.test', customerId: null, transporterId: null };
const arjun: AuthUser = { id: 'usr_cust_arjun', role: 'CUSTOMER', name: 'Arjun', email: 'buyer@kestrel.test', customerId: 'cus_kestrel', transporterId: null };
const neha: AuthUser = { id: 'usr_cust_osprey', role: 'CUSTOMER', name: 'Neha', email: 'buyer@osprey.test', customerId: 'cus_osprey', transporterId: null };
const ramesh: AuthUser = { id: 'usr_drv_ramesh', role: 'DRIVER', name: 'Ramesh', email: 'driver.ramesh@ghatline.test', customerId: null, transporterId: 'trn_ghatline' };
const deepak: AuthUser = { id: 'usr_drv_deepak', role: 'DRIVER', name: 'Deepak', email: 'driver.deepak@northstar.test', customerId: null, transporterId: 'trn_northstar' };

const notFound = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: 'NOT_FOUND' } satisfies Partial<DomainError>);

beforeAll(async () => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
  await runSeed(prisma, { demoPassword: 'test-demo-password-123' });
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('shipment scope', () => {
  it('coordinator sees every shipment', async () => {
    expect(await prisma.shipment.count({ where: shipmentScope(coordinator) })).toBe(await prisma.shipment.count());
  });

  it('a customer sees exactly their own company\'s shipments and nothing else', async () => {
    const seen = await prisma.shipment.findMany({ where: shipmentScope(arjun), select: { order: { select: { customerId: true } } } });
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen.map((s) => s.order.customerId))).toEqual(new Set(['cus_kestrel']));
    expect(seen.length).toBe(await prisma.shipment.count({ where: { order: { customerId: 'cus_kestrel' } } }));
  });

  it('a driver sees only shipments assigned to them', async () => {
    const seen = await prisma.shipment.findMany({ where: shipmentScope(ramesh), select: { code: true, driverUserId: true } });
    expect(seen.every((s) => s.driverUserId === 'usr_drv_ramesh')).toBe(true);
    expect(seen.map((s) => s.code)).toContain('SHP-1042');
  });

  it('out-of-scope ids are 404 exactly like missing ids (AC-M1.4)', async () => {
    await expect(assertShipmentInScope(prisma, arjun, 'shp_1042')).resolves.toBeUndefined(); // Kestrel's hero
    await notFound(assertShipmentInScope(prisma, neha, 'shp_1042')); // another customer
    await notFound(assertShipmentInScope(prisma, deepak, 'shp_1042')); // another driver
    await expect(assertShipmentInScope(prisma, ramesh, 'shp_1042')).resolves.toBeUndefined();
    await notFound(assertShipmentInScope(prisma, ramesh, 'shp_1041')); // Deepak's shipment
    await notFound(assertShipmentInScope(prisma, coordinator, 'shp_does_not_exist'));
  });
});

describe('order, alert, notification, customer and report scopes', () => {
  it('orders: own company for customers, none for drivers', async () => {
    await expect(assertOrderInScope(prisma, arjun, 'ord_7781')).resolves.toBeUndefined();
    await notFound(assertOrderInScope(prisma, neha, 'ord_7781'));
    await notFound(assertOrderInScope(prisma, ramesh, 'ord_7781'));
    expect(await prisma.order.count({ where: orderScope(ramesh) })).toBe(0);
  });

  it('alerts: customers only see alerts on their own shipments; drivers none', async () => {
    const own = await prisma.alert.findMany({ where: alertScope(arjun), select: { id: true, shipment: { select: { order: { select: { customerId: true } } } } } });
    expect(own.every((a) => a.shipment.order.customerId === 'cus_kestrel')).toBe(true);
    const foreign = await prisma.alert.findFirst({ where: { shipment: { order: { customerId: { not: 'cus_kestrel' } } } }, select: { id: true } });
    if (!foreign) throw new Error('seed should contain alerts for other customers');
    await notFound(assertAlertInScope(prisma, arjun, foreign.id));
    expect(await prisma.alert.count({ where: alertScope(ramesh) })).toBe(0);
  });

  it('notifications: customers only their own CUSTOMER messages; coordinators only COORDINATOR messages; drivers none', async () => {
    const cust = await prisma.notification.findMany({ where: notificationScope(arjun), select: { audience: true, customerId: true } });
    expect(cust.every((n) => n.audience === 'CUSTOMER' && n.customerId === 'cus_kestrel')).toBe(true);
    const coord = await prisma.notification.findMany({ where: notificationScope(coordinator), select: { audience: true } });
    expect(coord.length).toBeGreaterThan(0);
    expect(coord.every((n) => n.audience === 'COORDINATOR')).toBe(true);
    const foreign = await prisma.notification.findFirst({ where: { audience: 'CUSTOMER', customerId: { not: 'cus_kestrel' } }, select: { id: true } });
    if (!foreign) throw new Error('seed should contain other customers\' notifications');
    await notFound(assertNotificationInScope(prisma, arjun, foreign.id));
    expect(await prisma.notification.count({ where: notificationScope(ramesh) })).toBe(0);
  });

  it('customers: own record only; drivers none', async () => {
    expect((await prisma.customer.findMany({ where: customerScope(arjun), select: { id: true } })).map((c) => c.id)).toEqual(['cus_kestrel']);
    expect(await prisma.customer.count({ where: customerScope(ramesh) })).toBe(0);
  });

  it('driver reports: drivers only their own; customers none', async () => {
    const mine = await prisma.driverReport.findMany({ where: driverReportScope(ramesh), select: { reporterUserId: true } });
    expect(mine.every((r) => r.reporterUserId === 'usr_drv_ramesh')).toBe(true);
    expect(await prisma.driverReport.count({ where: driverReportScope(arjun) })).toBe(0);
  });
});

describe('role middleware (requireRole, requireDemoMode)', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    // A tiny app that exercises the real middleware and error handler; principals are injected
    // the way the session middleware would set them.
    const app = express();
    app.use(requestId);
    app.use((req, _res, next) => {
      const as = req.header('x-test-principal');
      const principals: Record<string, AuthUser> = { coordinator, customer: arjun, driver: ramesh };
      if (as && principals[as]) req.auth = { user: principals[as], sessionId: 's', expiresAt: 0 };
      next();
    });
    const demoOff = loadConfig({ ...process.env, SESSION_SECRET: 'x'.repeat(32), DEMO_MODE: 'false' });
    app.get('/coord-only', requireRole('COORDINATOR'), (_req, res) => void res.json({ ok: true }));
    app.get('/coord-or-customer', requireRole('COORDINATOR', 'CUSTOMER'), (_req, res) => void res.json({ ok: true }));
    app.get('/demo', requireRole('COORDINATOR'), requireDemoMode(demoOff), (_req, res) => void res.json({ ok: true }));
    app.use(errorHandler(createLogger('silent')));
    const server = await new Promise<import('node:http').Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => server.close(() => r()));
  });
  afterAll(async () => {
    await close();
  });

  const status = async (path: string, as?: Role | 'coordinator' | 'customer' | 'driver') => {
    const res = await fetch(`${baseUrl}${path}`, as ? { headers: { 'x-test-principal': as } } : {});
    return { status: res.status, code: res.status === 200 ? null : ((await res.json()) as ApiError).error.code };
  };

  it('401 / 403 / 200 by role', async () => {
    expect(await status('/coord-only')).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
    expect(await status('/coord-only', 'customer')).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(await status('/coord-only', 'driver')).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(await status('/coord-only', 'coordinator')).toEqual({ status: 200, code: null });
    expect(await status('/coord-or-customer', 'customer')).toEqual({ status: 200, code: null });
    expect(await status('/coord-or-customer', 'driver')).toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('demo-only endpoints: 403 DEMO_MODE_OFF for a coordinator when DEMO_MODE=false', async () => {
    expect(await status('/demo', 'coordinator')).toEqual({ status: 403, code: 'DEMO_MODE_OFF' });
    expect(await status('/demo', 'customer')).toEqual({ status: 403, code: 'FORBIDDEN' });
  });
});

describe('authorization uses the database role, not the token claim', () => {
  it('a correctly signed token claiming COORDINATOR for a customer account is still FORBIDDEN', async () => {
    const config = loadConfig({ ...process.env, SESSION_SECRET: 'authz-test-secret-at-least-32-characters' });
    const app = express();
    app.use(requestId);
    app.use(sessionMiddleware({ config, prisma, revoked: new RevokedSessions(), now: Date.now }));
    app.get('/coord-only', requireRole('COORDINATOR'), (_req, res) => void res.json({ ok: true }));
    app.use(errorHandler(createLogger('silent')));
    const server = await new Promise<import('node:http').Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/coord-only`;
      const lying = issueToken({ id: 'usr_cust_arjun', role: 'COORDINATOR' }, config.sessionSecret, Date.now());
      const res = await fetch(url, { headers: { Cookie: `rp_session=${lying.token}` } });
      expect(res.status).toBe(403);
      const honest = issueToken({ id: 'usr_coord_meera', role: 'COORDINATOR' }, config.sessionSecret, Date.now());
      expect((await fetch(url, { headers: { Cookie: `rp_session=${honest.token}` } })).status).toBe(200);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
