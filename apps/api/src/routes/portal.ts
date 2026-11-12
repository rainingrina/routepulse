import {
  MILESTONES,
  type DriverTripResponse,
  type ListResponse,
  type Milestone,
  type OrderDetail,
  type OrderSummary,
  type RecordMilestoneResponse,
  type ReplayResponse,
} from '@routepulse/shared';
import { Router } from 'express';
import { authUser, requireRole } from '../auth/middleware.js';
import { assertShipmentInScope } from '../auth/policies.js';
import type { PrismaClient } from '../db/prisma.js';
import { DomainError } from '../errors/domainError.js';
import { toDriverTripShipment } from '../serializers/driverReport.js';
import { coordinatorListItem, getDriverTrip, getOrder, getReplay, listOrders, milestonesOf } from '../services/portalService.js';
import { driverTripFacts } from '../services/reportService.js';
import type { SimulationService } from '../services/simulationService.js';
import { Validator } from '../validation/validator.js';

/**
 * Portal endpoints (Milestone 9): #12, #13 orders; #17 milestone taps and overrides; #19 replay;
 * #21 driver trip. Controllers validate shape, check role and scope, call one service, serialize.
 * The milestone write goes through simulationService.recordMilestone (world lock, one transaction,
 * the single recalculation pipeline). Everything else here is read-only.
 */

/** Milestones a driver can tap (API §7.6). IN_TRANSIT is recorded by the system after GATE_OUT. */
const DRIVER_MILESTONES: readonly Milestone[] = ['AT_GATE', 'GATE_OUT', 'ARRIVED', 'DELIVERED'];

export function portalRouter(sim: SimulationService, prisma: PrismaClient): Router {
  const router = Router();

  // ───────── #12 orders list ─────────
  router.get('/orders', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['status', 'customerId', 'limit']);
    const status = v.oneOf(q, 'status', ['open', 'delivered', 'all'] as const, { optional: true }) ?? 'open';
    const customerId = q['customerId'] === undefined ? undefined : v.pathId(q['customerId'], 'customerId');
    let limit = 50;
    if (q['limit'] !== undefined) {
      const n = typeof q['limit'] === 'string' && /^\d+$/.test(q['limit']) ? Number(q['limit']) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 200) v.issues.push({ path: 'limit', message: 'Must be an integer from 1 to 200' });
      else limit = n;
    }
    const user = authUser(req);
    if (customerId !== undefined && user.role !== 'COORDINATOR') v.issues.push({ path: 'customerId', message: 'Only coordinators can filter by customer' });
    v.assertValid();
    const out: ListResponse<OrderSummary> = { items: await listOrders(prisma, user, { status, customerId, limit }) };
    res.json(out);
  });

  // ───────── #13 order detail ─────────
  router.get('/orders/:orderId', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.orderId, 'orderId');
    v.assertValid();
    const user = authUser(req);
    const out: OrderDetail = await sim.readSettled((db, _w, s) => getOrder(db, user, id as string, s));
    res.json(out); // API §7.2: OrderSummary & { shipments } (not wrapped)
  });

  // ───────── #17 record a milestone ─────────
  router.post('/shipments/:shipmentId/milestones', requireRole('DRIVER', 'COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.shipmentId, 'shipmentId');
    const body = v.object(req.body, 'body', ['milestone', 'note']);
    const milestone = v.oneOf(body, 'milestone', MILESTONES);
    const note = v.string(body, 'note', { min: 5, max: 280, trim: true, optional: true });
    const user = authUser(req);
    if (user.role === 'COORDINATOR' && body['note'] === undefined) v.issues.push({ path: 'note', message: 'A note is required for a coordinator override' });
    v.assertValid();
    const m = milestone as Milestone;
    await assertShipmentInScope(prisma, user, id as string); // other drivers' shipments → 404
    if (m === 'IN_TRANSIT') throw new DomainError('INVALID_TRANSITION', 'In transit is recorded automatically after gate out.');
    if (!DRIVER_MILESTONES.includes(m)) {
      if (user.role === 'DRIVER') throw new DomainError('FORBIDDEN', 'Drivers can record: at gate, gate out, arrived, delivered.');
      throw new DomainError('INVALID_TRANSITION', 'This milestone is recorded by the system.');
    }
    await sim.recordMilestone(id as string, m, { userId: user.id, role: user.role }, note);
    const out: RecordMilestoneResponse = await sim.readSettled(async (db, world, s) => ({
      shipment: user.role === 'DRIVER' ? toDriverTripShipment(await driverTripFacts(db, world, s, id as string)) : await coordinatorListItem(db, id as string),
      milestones: await milestonesOf(db, id as string, user.role === 'COORDINATOR'),
    }));
    res.json(out);
  });

  // ───────── #19 replay (read-only) ─────────
  router.get('/shipments/:shipmentId/replay', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.shipmentId, 'shipmentId');
    v.assertValid();
    const out: ReplayResponse = await getReplay(prisma, authUser(req), id as string);
    res.json(out);
  });

  // ───────── #21 driver trip ─────────
  router.get('/driver/trip', requireRole('DRIVER'), async (req, res) => {
    const v = new Validator();
    v.object(req.query, 'query', []);
    v.assertValid();
    const user = authUser(req);
    const out: DriverTripResponse = await sim.readSettled((db, world, s) => getDriverTrip(db, world, user, s));
    res.json(out);
  });

  return router;
}
