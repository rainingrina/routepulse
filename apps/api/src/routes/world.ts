import {
  ALERT_STATUSES,
  CUSTOMER_RESPONSES,
  RISK_LEVELS,
  type AlertDto,
  type AuditResponse,
  type CreateDisruptionRequest,
  type CreateDisruptionResponse,
  type CustomerAlertDto,
  type ListResponse,
  type DisruptionDto,
  type MapLayersResponse,
  type NotificationDto,
  type NotificationsResponse,
  type PositionsResponse,
  type ReferenceResponse,
  type RiskLevel,
  type ShipmentDetail,
  type ShipmentListItem,
  type TimelineEvent,
} from '@routepulse/shared';
import { Router } from 'express';
import { authUser, requireDemoMode, requireRole } from '../auth/middleware.js';
import { alertScope } from '../auth/policies.js';
import type { AppConfig } from '../config/env.js';
import type { PrismaClient } from '../db/prisma.js';
import { notFound } from '../errors/domainError.js';
import { ALERT_SELECT, toAlertCoordinator, toAlertCustomer } from '../serializers/alert.js';
import { respondToAlert } from '../services/alertService.js';
import { createDisruption, endDisruption, getDisruptionDto, impactOf, listDisruptions } from '../services/disruptionService.js';
import { listNotifications, markAllRead, markRead } from '../services/notificationService.js';
import { getAudit, getMapLayers, getPositions, getReference, getShipmentDetail, getTimeline, listShipments } from '../services/readService.js';
import type { SimulationService } from '../services/simulationService.js';
import { Validator } from '../validation/validator.js';

/**
 * Control-tower and portal endpoints (API §5.4–§7.5, §10.1–§10.3, §11, §14, §14a):
 * #7–#11, #14–#16, #26–#28, #31–#33, #37, #38. Controllers validate shape, check the role, call
 * one service and serialize. All writes go through the simulation service (world lock + one
 * transaction); disruptions through applyChange and the single recalculation pipeline.
 */

/** Parses a repeated or single query value into a list. */
const listParam = (v: unknown): unknown[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

function intParam(v: Validator, q: Record<string, unknown>, key: string, min: number, max: number, fallback: number): number {
  const raw = q[key];
  if (raw === undefined) return fallback;
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    v.issues.push({ path: key, message: `Must be an integer from ${min} to ${max}` });
    return fallback;
  }
  return n;
}

export function worldRouter(sim: SimulationService, prisma: PrismaClient, config: AppConfig): Router {
  const router = Router();

  // ───────── #14 shipments list ─────────
  router.get('/shipments', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['status', 'riskLevel', 'laneId', 'transporterId', 'customerId', 'arrivedFrom', 'arrivedTo', 'onTime', 'q', 'sort', 'limit']);
    const status = v.oneOf(q, 'status', ['live', 'delivered', 'all'] as const, { optional: true }) ?? 'live';
    const levels = listParam(q['riskLevel']);
    if (levels && !levels.every((l) => typeof l === 'string' && (RISK_LEVELS as readonly string[]).includes(l))) v.issues.push({ path: 'riskLevel', message: `Must be one of ${RISK_LEVELS.join(', ')}` });
    const laneId = q['laneId'] === undefined ? undefined : v.pathId(q['laneId'], 'laneId');
    const transporterId = q['transporterId'] === undefined ? undefined : v.pathId(q['transporterId'], 'transporterId');
    const customerId = q['customerId'] === undefined ? undefined : v.pathId(q['customerId'], 'customerId');
    const arrivedFrom = v.isoDateTime(q, 'arrivedFrom', { optional: true });
    const arrivedTo = v.isoDateTime(q, 'arrivedTo', { optional: true });
    const onTime = v.oneOf(q, 'onTime', ['true', 'false'] as const, { optional: true });
    const text = v.string(q, 'q', { min: 1, max: 32, trim: true, optional: true });
    const sort = v.oneOf(q, 'sort', ['risk', 'eta', 'promise'] as const, { optional: true }) ?? 'risk';
    const limit = intParam(v, q, 'limit', 1, 200, 200);
    const user = authUser(req);
    if (customerId !== undefined && user.role !== 'COORDINATOR') v.issues.push({ path: 'customerId', message: 'Only coordinators can filter by customer' });
    v.assertValid();
    const items = await sim.readSettled((db, _w, s) =>
      listShipments(db, user, { status, riskLevel: levels as RiskLevel[] | undefined, laneId, transporterId, customerId, arrivedFrom, arrivedTo, onTime: onTime === undefined ? undefined : onTime === 'true', q: text, sort, limit }, s),
    );
    const out: ListResponse<ShipmentListItem> = { items };
    res.json(out);
  });

  // ───────── #15 shipment detail, #16 timeline ─────────
  router.get('/shipments/:shipmentId', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.shipmentId, 'shipmentId');
    v.assertValid();
    const user = authUser(req);
    const shipment = await sim.readSettled((db, w, s) => getShipmentDetail(db, w, user, id as string, s));
    const out: { shipment: ShipmentDetail } = { shipment };
    res.json(out);
  });

  router.get('/shipments/:shipmentId/timeline', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.shipmentId, 'shipmentId');
    v.assertValid();
    const out: ListResponse<TimelineEvent> = { items: await getTimeline(prisma, authUser(req), id as string) };
    res.json(out);
  });

  // ───────── #10 map layers, #11 positions ─────────
  router.get('/map/layers', async (req, res) => {
    const user = authUser(req);
    const out: MapLayersResponse = await sim.readSettled((db, _w, s) => getMapLayers(db, user, s));
    res.json(out);
  });

  router.get('/tracking/positions', async (req, res) => {
    const user = authUser(req);
    const out: PositionsResponse = await sim.readNow((db, w, settledS, nowS) => getPositions(db, w, user, settledS, nowS));
    res.json(out);
  });

  // ───────── #7–#9 disruptions ─────────
  router.get('/disruptions', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['active']);
    const active = v.oneOf(q, 'active', ['true', 'false'] as const, { optional: true });
    v.assertValid();
    const items = await sim.readSettled((db, _w, s) => listDisruptions(db, s, active === undefined ? undefined : active === 'true'));
    const out: ListResponse<DisruptionDto> = { items };
    res.json(out);
  });

  router.post('/disruptions', requireRole('COORDINATOR'), requireDemoMode(config), async (req, res) => {
    const body = parseCreateDisruption(req.body);
    const user = authUser(req);
    const actor = { userId: user.id, role: user.role };
    const { result } = await sim.applyChange('DISRUPTION', async (tx, actionS) => {
      const r = await createDisruption(tx, actionS, body, actor);
      return { result: r, shipmentIds: r.affected.map((a) => a.id) };
    });
    const out: CreateDisruptionResponse = await sim.readSettled(async (db, _w, s) => ({ disruption: await getDisruptionDto(db, result.id, s), impact: await impactOf(db, result.affected, result.before) }));
    res.status(201).json(out);
  });

  router.post('/disruptions/:disruptionId/end', requireRole('COORDINATOR'), requireDemoMode(config), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.disruptionId, 'disruptionId');
    if (req.body !== undefined && (typeof req.body !== 'object' || req.body === null || Object.keys(req.body as object).length > 0)) v.issues.push({ path: 'body', message: 'Must be empty' });
    v.assertValid();
    const user = authUser(req);
    const { result } = await sim.applyChange('DISRUPTION', async (tx, actionS) => {
      const r = await endDisruption(tx, actionS, id as string, { userId: user.id, role: user.role });
      return { result: r, shipmentIds: r.affected.map((a) => a.id) };
    });
    const out: CreateDisruptionResponse = await sim.readSettled(async (db, _w, s) => ({ disruption: await getDisruptionDto(db, result.id, s), impact: await impactOf(db, result.affected, result.before) }));
    res.json(out);
  });

  // ───────── #26–#28 alerts ─────────
  router.get('/alerts', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['status', 'shipmentId', 'limit']);
    const status = v.oneOf(q, 'status', [...ALERT_STATUSES, 'active'] as const, { optional: true }) ?? 'active';
    const shipmentId = q['shipmentId'] === undefined ? undefined : v.pathId(q['shipmentId'], 'shipmentId');
    const limit = intParam(v, q, 'limit', 1, 200, 50);
    v.assertValid();
    const user = authUser(req);
    const rows = await prisma.alert.findMany({
      where: { AND: [alertScope(user), status === 'active' ? { status: { in: ['OPEN', 'ACTION_CHOSEN'] } } : { status }, shipmentId ? { shipmentId } : {}] },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: ALERT_SELECT,
    });
    const out: ListResponse<AlertDto> = { items: await toAlertDtos(prisma, user.role, rows) };
    res.json(out);
  });

  router.get('/alerts/:alertId', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.alertId, 'alertId');
    v.assertValid();
    const user = authUser(req);
    const row = await prisma.alert.findFirst({ where: { AND: [{ id: id as string }, alertScope(user)] }, select: ALERT_SELECT });
    if (!row) throw notFound();
    const [alert] = await toAlertDtos(prisma, user.role, [row]);
    res.json({ alert } as { alert: AlertDto });
  });

  router.post('/alerts/:alertId/customer-response', requireRole('CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.alertId, 'alertId');
    const body = v.object(req.body, 'body', ['response']);
    const response = v.oneOf(body, 'response', CUSTOMER_RESPONSES);
    v.assertValid();
    const user = authUser(req);
    if (!user.customerId) throw notFound();
    const alertId = await sim.commitAction((tx, atS) =>
      respondToAlert(tx, atS, { alertId: id as string, customerId: user.customerId as string, response: response as (typeof CUSTOMER_RESPONSES)[number], actor: { userId: user.id, role: user.role } }),
    );
    const row = await prisma.alert.findUniqueOrThrow({ where: { id: alertId }, select: ALERT_SELECT });
    const out: { alert: CustomerAlertDto } = { alert: toAlertCustomer(row) };
    res.json(out);
  });

  // ───────── #31–#33 notifications ─────────
  router.get('/notifications', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['unreadOnly', 'limit']);
    const unreadOnly = v.oneOf(q, 'unreadOnly', ['true', 'false'] as const, { optional: true }) === 'true';
    const limit = intParam(v, q, 'limit', 1, 200, 50);
    v.assertValid();
    const out: NotificationsResponse = await listNotifications(prisma, authUser(req), { unreadOnly, limit });
    res.json(out);
  });

  router.post('/notifications/read-all', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const user = authUser(req);
    res.json(await sim.commitAction((tx, atS) => markAllRead(tx, user, atS)));
  });

  router.post('/notifications/:notificationId/read', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.notificationId, 'notificationId');
    v.assertValid();
    const user = authUser(req);
    const out: { notification: NotificationDto; unreadCount: number } = await sim.commitAction((tx, atS) => markRead(tx, user, id as string, atS));
    res.json(out);
  });

  // ───────── #37 audit, #38 reference ─────────
  router.get('/audit', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['shipmentId', 'entityType', 'entityId', 'limit']);
    const shipmentId = q['shipmentId'] === undefined ? undefined : v.pathId(q['shipmentId'], 'shipmentId');
    const entityType = v.string(q, 'entityType', { min: 1, max: 40, optional: true });
    const entityId = q['entityId'] === undefined ? undefined : v.pathId(q['entityId'], 'entityId');
    const limit = intParam(v, q, 'limit', 1, 200, 100);
    v.assertValid();
    const out: AuditResponse = await getAudit(prisma, { shipmentId, entityType, entityId, limit });
    res.json(out);
  });

  router.get('/reference', requireRole('COORDINATOR'), async (_req, res) => {
    const out: ReferenceResponse = await getReference(prisma);
    res.json(out);
  });

  return router;
}

async function toAlertDtos(prisma: PrismaClient, role: string, rows: Parameters<typeof toAlertCustomer>[0][]): Promise<AlertDto[]> {
  if (role !== 'COORDINATOR') return rows.map(toAlertCustomer);
  const ids = [...new Set(rows.map((r) => r.chosenByUserId).filter((x): x is string => x !== null))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u]));
  return rows.map((r) => toAlertCoordinator(r, r.chosenByUserId ? (users.get(r.chosenByUserId) ?? null) : null));
}

/** Hand-written validation of CreateDisruptionRequest (API §5.5). */
function parseCreateDisruption(body: unknown): CreateDisruptionRequest {
  const v = new Validator();
  const raw = v.object(body, 'body', ['kind', 'label', 'segmentCodes', 'slowdownPct', 'durationMinutes', 'extraMinutesPerTruck', 'shipmentId', 'repairMinutes']);
  const kind = v.oneOf(raw, 'kind', ['WEATHER_SLOWDOWN', 'ROAD_CLOSURE', 'GATE_CONGESTION', 'TRUCK_BREAKDOWN'] as const);
  const allowed: Record<string, string[]> = {
    WEATHER_SLOWDOWN: ['kind', 'label', 'segmentCodes', 'slowdownPct', 'durationMinutes'],
    ROAD_CLOSURE: ['kind', 'label', 'segmentCodes', 'durationMinutes'],
    GATE_CONGESTION: ['kind', 'label', 'extraMinutesPerTruck', 'durationMinutes'],
    TRUCK_BREAKDOWN: ['kind', 'label', 'shipmentId', 'repairMinutes'],
  };
  if (kind) v.object(raw, 'body', allowed[kind] as string[]);
  const label = v.string(raw, 'label', { min: 1, max: 80, trim: true, optional: true });
  let segmentCodes: string[] = [];
  if (kind === 'WEATHER_SLOWDOWN' || kind === 'ROAD_CLOSURE') {
    const s = raw['segmentCodes'];
    if (!Array.isArray(s) || s.length < 1 || s.length > 10 || !s.every((x) => typeof x === 'string' && /^[A-Z0-9-]{1,32}$/.test(x))) {
      v.issues.push({ path: 'segmentCodes', message: 'Must be 1–10 segment codes' });
    } else segmentCodes = s as string[];
  }
  const durationMinutes = kind && kind !== 'TRUCK_BREAKDOWN' ? v.integer(raw, 'durationMinutes', { min: 15, max: 1440, multipleOf: 5 }) : undefined;
  const slowdownPct = kind === 'WEATHER_SLOWDOWN' ? v.integer(raw, 'slowdownPct', { min: 10, max: 90 }) : undefined;
  const extra = kind === 'GATE_CONGESTION' ? v.integer(raw, 'extraMinutesPerTruck', { min: 5, max: 240 }) : undefined;
  const repairMinutes = kind === 'TRUCK_BREAKDOWN' ? v.integer(raw, 'repairMinutes', { min: 15, max: 720 }) : undefined;
  const shipmentId = kind === 'TRUCK_BREAKDOWN' ? v.pathId(raw['shipmentId'], 'shipmentId') : undefined;
  v.assertValid();
  const l = label ? { label } : {};
  switch (kind) {
    case 'WEATHER_SLOWDOWN':
      return { kind, ...l, segmentCodes, slowdownPct: slowdownPct as number, durationMinutes: durationMinutes as number };
    case 'ROAD_CLOSURE':
      return { kind, ...l, segmentCodes, durationMinutes: durationMinutes as number };
    case 'GATE_CONGESTION':
      return { kind, ...l, extraMinutesPerTruck: extra as number, durationMinutes: durationMinutes as number };
    default:
      return { kind: 'TRUCK_BREAKDOWN', ...l, shipmentId: shipmentId as string, repairMinutes: repairMinutes as number };
  }
}
