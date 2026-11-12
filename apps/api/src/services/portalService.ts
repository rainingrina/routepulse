import {
  RISK_LEVELS,
  type DriverHandover,
  type DriverTripResponse,
  type MilestoneEntry,
  type OrderDetail,
  type OrderSummary,
  type ReplayResponse,
  type ReplaySnapshot,
  type RiskLevel,
} from '@routepulse/shared';
import { orderScope, shipmentScope } from '../auth/policies.js';
import type { AuthUser } from '../auth/types.js';
import { hhmm } from '../engines/eta.js';
import { positionAlong } from '../engines/simRoute.js';
import { notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isFactorArray } from '../guards/factors.js';
import { isLineString, isSegmentArray } from '../guards/geo.js';
import { toDriverTripShipment } from '../serializers/driverReport.js';
import { SHIPMENT_LIST_SELECT, milestoneEntries, toListItemCoordinator, toListItemCustomer } from '../serializers/shipment.js';
import { fromS, toS, type Db, type StaticWorld } from '../sim/world.js';
import { actorNames, getTimeline } from './readService.js';
import { driverTripFacts } from './reportService.js';

/**
 * Portal read models for Milestone 9 (API §7.1, §7.2, §7.6 response, §8.2, §9.1). Read-only:
 * nothing here writes, advances the clock or recalculates. Values come from stored rows
 * (cached ETA/risk, RiskSnapshot history, ShipmentEvent) written by the one pipeline.
 */

// ───────────── #12 / #13 orders ─────────────

const ORDER_SELECT = {
  id: true,
  code: true,
  promisedBy: true,
  customer: { select: { id: true, name: true } },
  lines: { select: { gradeCode: true, quantityT: true }, orderBy: { gradeCode: 'asc' } },
  shipments: { select: { id: true, currentMilestone: true, riskLevel: true, isHistorical: true } },
} as const satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

/** Order status is derived: DELIVERED once every shipment of the order is delivered. */
function orderStatus(o: OrderRow): OrderSummary['status'] {
  return o.shipments.length > 0 && o.shipments.every((s) => s.currentMilestone === 'DELIVERED') ? 'DELIVERED' : 'OPEN';
}

/** Worst cached risk level among the order's shipments that are still moving (null if none). */
function worstRisk(o: OrderRow): RiskLevel | null {
  let worst: RiskLevel | null = null;
  for (const s of o.shipments) {
    if (s.isHistorical || s.currentMilestone === 'DELIVERED' || s.riskLevel === null) continue;
    if (worst === null || RISK_LEVELS.indexOf(s.riskLevel) > RISK_LEVELS.indexOf(worst)) worst = s.riskLevel;
  }
  return worst;
}

function toOrderSummary(o: OrderRow): OrderSummary {
  return {
    id: o.id,
    code: o.code,
    customer: { id: o.customer.id, name: o.customer.name },
    promisedBy: o.promisedBy.toISOString(),
    lines: o.lines.map((l) => ({ gradeCode: l.gradeCode, quantityT: Number(l.quantityT) })),
    shipmentCount: o.shipments.length,
    status: orderStatus(o),
    worstRiskLevel: worstRisk(o),
  };
}

export interface OrderListFilter {
  status: 'open' | 'delivered' | 'all';
  customerId: string | undefined;
  limit: number;
}

/** #12: coordinator all orders, customer own. Open first by promise; delivered newest first. */
export async function listOrders(db: Db, user: AuthUser, f: OrderListFilter): Promise<OrderSummary[]> {
  const where: Prisma.OrderWhereInput = {
    AND: [
      orderScope(user),
      f.customerId ? { customerId: f.customerId } : {},
      // Open = at least one shipment not yet delivered; delivered = none left (derived status).
      f.status === 'open' ? { shipments: { some: { currentMilestone: { not: 'DELIVERED' } } } } : {},
      f.status === 'delivered' ? { shipments: { some: {}, every: { currentMilestone: 'DELIVERED' } } } : {},
    ],
  };
  const rows = await db.order.findMany({
    where,
    orderBy: f.status === 'delivered' ? [{ promisedBy: 'desc' }, { code: 'asc' }] : [{ promisedBy: 'asc' }, { code: 'asc' }],
    take: f.limit,
    select: ORDER_SELECT,
  });
  return rows.map(toOrderSummary);
}

/** #13: the order and its shipments in the caller's view. Out of scope = 404. */
export async function getOrder(db: Db, user: AuthUser, id: string, nowS: number): Promise<OrderDetail> {
  const o = await db.order.findFirst({ where: { AND: [{ id }, orderScope(user)] }, select: ORDER_SELECT });
  if (!o) throw notFound();
  const ships = await db.shipment.findMany({ where: { AND: [{ orderId: id }, shipmentScope(user)] }, orderBy: { code: 'asc' }, select: SHIPMENT_LIST_SELECT });
  return { ...toOrderSummary(o), shipments: ships.map((s) => (user.role === 'COORDINATOR' ? toListItemCoordinator(s) : toListItemCustomer(s, nowS))) };
}

// ───────────── #17 response ─────────────

/** The 8 milestone entries for one shipment (API §2.2). Actor names for coordinators only. */
export async function milestonesOf(db: Db, shipmentId: string, withActors: boolean): Promise<MilestoneEntry[]> {
  const s = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { currentMilestone: true, events: { where: { type: 'MILESTONE' }, select: { milestone: true, simTime: true, source: true, actorUserId: true } } },
  });
  const names = withActors ? await actorNames(db, s.events.map((e) => e.actorUserId)) : new Map();
  return milestoneEntries(
    s.currentMilestone,
    s.events.map((e) => ({ milestone: e.milestone, simTime: e.simTime, source: e.source, actor: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null })),
    withActors,
  );
}

export async function coordinatorListItem(db: Db, shipmentId: string) {
  return toListItemCoordinator(await db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: SHIPMENT_LIST_SELECT }));
}

// ───────────── #19 replay ─────────────

/**
 * #19 (API §8.2): stored RiskSnapshot history, ascending, with positions on the route the
 * shipment was on at that snapshot (`RiskSnapshot.routeId`, C-2). Display coordinates only.
 */
export async function getReplay(db: Db, user: AuthUser, id: string): Promise<ReplayResponse> {
  const s = await db.shipment.findFirst({
    where: { AND: [{ id }, shipmentScope(user)] },
    select: { id: true, code: true, promisedBy: true, plannedArrivalAt: true, firstAtRiskAt: true },
  });
  if (!s) throw notFound();
  const rows = await db.riskSnapshot.findMany({
    where: { shipmentId: id },
    orderBy: [{ simTime: 'asc' }, { id: 'asc' }],
    select: {
      id: true, simTime: true, trigger: true, predictedArrivalAt: true, etaLowAt: true, etaHighAt: true,
      slackMinutes: true, level: true, score: true, confidence: true, progressKm: true, factors: true,
      route: { select: { geometry: true, lengthKm: true } },
    },
  });
  const snapshots: ReplaySnapshot[] = rows.map((r) => {
    const len = Number(r.route.lengthKm);
    const p = isLineString(r.route.geometry) && len > 0 ? positionAlong(r.route.geometry, Number(r.progressKm) / len) : null;
    return {
      id: r.id,
      simTime: r.simTime.toISOString(),
      trigger: r.trigger,
      predictedArrivalAt: r.predictedArrivalAt.toISOString(),
      etaLowAt: r.etaLowAt.toISOString(),
      etaHighAt: r.etaHighAt.toISOString(),
      slackMinutes: r.slackMinutes,
      level: r.level,
      score: r.score,
      confidence: r.confidence,
      position: p ? { lat: p.lat, lng: p.lng } : { lat: 0, lng: 0 },
      factors: isFactorArray(r.factors) ? r.factors : [],
    };
  });
  const lead = s.firstAtRiskAt ? Math.floor((s.promisedBy.getTime() - s.firstAtRiskAt.getTime()) / 60_000) : null;
  return {
    shipmentId: s.id,
    code: s.code,
    promisedBy: s.promisedBy.toISOString(),
    plannedArrivalAt: s.plannedArrivalAt.toISOString(),
    firstAtRiskAt: s.firstAtRiskAt ? s.firstAtRiskAt.toISOString() : null,
    leadTimeMinutes: lead,
    snapshots,
    events: await getTimeline(db, user, id),
  };
}

// ───────────── #21 driver trip ─────────────

const HANDOVER_WINDOW_S = 12 * 3600;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const dataOf = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Derived instruction (API §9 DriverTripShipment.instruction, §17.2): the replacement driver of a
 * REPLACEMENT_TRUCK recovery is told where to collect the load until the transfer finishes.
 * "near <segment>" uses the route segment at the shipment's stored progress. null otherwise.
 */
async function tripInstruction(db: Db, shipmentId: string, driverUserId: string, settledS: number): Promise<string | null> {
  const ev = await db.shipmentEvent.findFirst({
    where: { shipmentId, type: 'RECOVERY_CHOSEN', data: { path: ['newDriverUserId'], equals: driverUserId } },
    orderBy: [{ simTime: 'desc' }, { id: 'desc' }],
    select: { data: true },
  });
  if (!ev) return null;
  const d = dataOf(ev.data);
  const stopUntil = str(d['stopUntil']);
  if (!stopUntil || toS(new Date(stopUntil)) <= settledS) return null;
  const prevTruckId = str(d['previousTruckId']);
  const prev = prevTruckId ? await db.truck.findUnique({ where: { id: prevTruckId }, select: { code: true } }) : null;
  const sh = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: { progressM: true, route: { select: { segments: true } } } });
  const km = sh.progressM / 1000;
  const seg = isSegmentArray(sh.route.segments) ? (sh.route.segments.find((x) => km >= x.startKm && km <= x.endKm) ?? null) : null;
  const where = seg ? ` near ${seg.name}` : '';
  return `Collect load from ${prev?.code ?? 'the stopped truck'}${where} — transfer until ${hhmm(toS(new Date(stopUntil)))}.`;
}

/** #21 (API §9.1): the driver's live shipments with next step and instruction, plus recent hand-overs. */
export async function getDriverTrip(db: Db, world: StaticWorld, user: AuthUser, settledS: number): Promise<DriverTripResponse> {
  const mine = await db.shipment.findMany({
    where: { driverUserId: user.id, isHistorical: false, currentMilestone: { not: 'DELIVERED' } },
    orderBy: [{ plannedGateAt: 'asc' }, { code: 'asc' }],
    select: { id: true },
  });
  const items = [];
  for (const { id } of mine) {
    items.push(toDriverTripShipment(await driverTripFacts(db, world, settledS, id), await tripInstruction(db, id, user.id, settledS)));
  }
  const events = await db.shipmentEvent.findMany({
    where: { type: 'RECOVERY_CHOSEN', simTime: { gte: fromS(settledS - HANDOVER_WINDOW_S), lte: fromS(settledS) }, data: { path: ['previousDriverUserId'], equals: user.id } },
    orderBy: [{ simTime: 'desc' }, { id: 'desc' }],
    select: { simTime: true, data: true, shipment: { select: { id: true, code: true } } },
  });
  const recentHandovers: DriverHandover[] = [];
  for (const e of events) {
    const d = dataOf(e.data);
    const truckId = str(d['newTruckId']);
    const driverId = str(d['newDriverUserId']);
    if (!truckId || !driverId) continue;
    const [truck, driver] = await Promise.all([
      db.truck.findUnique({ where: { id: truckId }, select: { code: true } }),
      db.user.findUnique({ where: { id: driverId }, select: { name: true } }),
    ]);
    if (!truck || !driver) continue;
    recentHandovers.push({ shipmentId: e.shipment.id, shipmentCode: e.shipment.code, toTruckCode: truck.code, toDriverName: driver.name, at: e.simTime.toISOString() });
  }
  return { items, recentHandovers };
}
