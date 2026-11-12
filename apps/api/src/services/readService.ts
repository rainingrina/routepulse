import {
  PLANT,
  SMALL_FLEET_MAX,
  type AuditResponse,
  type EtaSummaryCustomer,
  type MapLayersResponse,
  type PositionsResponse,
  type ReferenceResponse,
  type RiskLevel,
  type ShipmentDetail,
  type ShipmentListItem,
  type TimelineEvent,
} from '@routepulse/shared';
import { customerScope, shipmentScope } from '../auth/policies.js';
import type { AuthUser } from '../auth/types.js';
import { positionAlong } from '../engines/simRoute.js';
import { simulate } from '../engines/simulate.js';
import { notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isLineString, isSegmentArray } from '../guards/geo.js';
import { ALERT_SELECT, toAlertCustomer } from '../serializers/alert.js';
import {
  SHIPMENT_LIST_SELECT,
  alertSummary,
  milestoneEntries,
  toDetailCoordinator,
  toDetailCustomer,
  toListItemCoordinator,
  toListItemCustomer,
  toTimelineEvent,
  type ShipmentListRow,
} from '../serializers/shipment.js';
import { SIM_CONFIG, loadDisruptions, loadLiveShipments, toS, type Db, type StaticWorld } from '../sim/world.js';
import { computeEtas } from './etaService.js';

/**
 * Read models for the control tower and portals (API §6, §7, §14, §14a). Read-only: nothing here
 * writes, advances the clock or recalculates; ETA/risk values are the pipeline's cached results.
 */

export interface ShipmentListFilter {
  status: 'live' | 'delivered' | 'all';
  riskLevel: RiskLevel[] | undefined;
  laneId: string | undefined;
  transporterId: string | undefined;
  customerId: string | undefined;
  arrivedFrom: Date | undefined;
  arrivedTo: Date | undefined;
  onTime: boolean | undefined;
  q: string | undefined;
  sort: 'risk' | 'eta' | 'promise';
  limit: number;
}

/** "live" = not historical and not delivered (includes ARRIVED, still unloading). */
export function statusWhere(status: ShipmentListFilter['status']): Prisma.ShipmentWhereInput {
  if (status === 'live') return { isHistorical: false, currentMilestone: { not: 'DELIVERED' } };
  if (status === 'delivered') return { currentMilestone: 'DELIVERED' };
  return {};
}

const ORDER_BY: Record<ShipmentListFilter['sort'], Prisma.ShipmentOrderByWithRelationInput[]> = {
  risk: [{ riskScore: { sort: 'desc', nulls: 'last' } }, { promisedBy: 'asc' }, { code: 'asc' }],
  eta: [{ etaAt: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
  promise: [{ promisedBy: 'asc' }, { code: 'asc' }],
};

export async function listShipments(db: Db, user: AuthUser, f: ShipmentListFilter, nowS: number): Promise<ShipmentListItem[]> {
  const where: Prisma.ShipmentWhereInput = {
    AND: [
      shipmentScope(user),
      statusWhere(f.status),
      f.riskLevel ? { riskLevel: { in: f.riskLevel } } : {},
      f.laneId ? { laneId: f.laneId } : {},
      f.transporterId ? { transporterId: f.transporterId } : {},
      f.customerId ? { order: { customerId: f.customerId } } : {},
      f.arrivedFrom || f.arrivedTo ? { arrivedAt: { ...(f.arrivedFrom ? { gte: f.arrivedFrom } : {}), ...(f.arrivedTo ? { lte: f.arrivedTo } : {}) } } : {},
      f.onTime !== undefined ? { onTime: f.onTime } : {},
      f.q ? { code: { contains: f.q, mode: 'insensitive' } } : {},
    ],
  };
  const rows = await db.shipment.findMany({ where, orderBy: ORDER_BY[f.sort], take: f.limit, select: SHIPMENT_LIST_SELECT });
  return rows.map((r) => (user.role === 'COORDINATOR' ? toListItemCoordinator(r) : toListItemCustomer(r, nowS)));
}

export async function actorNames(db: Db, ids: readonly (string | null)[]): Promise<Map<string, { id: string; name: string; role: AuthUser['role'] }>> {
  const unique = [...new Set(ids.filter((x): x is string => x !== null))];
  if (unique.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, role: true } });
  return new Map(users.map((u) => [u.id, u]));
}

export async function getShipmentDetail(db: Db, world: StaticWorld, user: AuthUser, id: string, settledS: number): Promise<ShipmentDetail> {
  const scoped = await db.shipment.findFirst({ where: { AND: [{ id }, shipmentScope(user)] }, select: SHIPMENT_LIST_SELECT });
  if (!scoped) throw notFound();
  const x = await db.shipment.findUniqueOrThrow({
    where: { id },
    select: {
      route: { select: { id: true, code: true, name: true, isPrimary: true, lengthKm: true } },
      driver: { select: { id: true, name: true, phone: true } },
      items: { select: { orderLineId: true, quantityT: true, orderLine: { select: { gradeCode: true, isUrgent: true } } }, orderBy: { orderLineId: 'asc' } },
      events: { where: { type: 'MILESTONE' }, select: { milestone: true, simTime: true, source: true, actorUserId: true } },
      plannedArrivalAt: true,
      originalPromisedBy: true,
      renegotiated: true,
      receivingWindowOverrideEndAt: true,
      progressM: true,
      stoppedUntil: true,
      lastUpdateAt: true,
      firstAtRiskAt: true,
      customerNotifiedAt: true,
      physicalArrivalAt: true,
      children: { select: { id: true }, orderBy: { id: 'asc' } },
      alerts: { orderBy: [{ openedAt: 'desc' }, { id: 'desc' }], select: ALERT_SELECT },
    },
  });
  const names = await actorNames(db, x.events.map((e) => e.actorUserId));
  const events = x.events.map((e) => ({ milestone: e.milestone, simTime: e.simTime, source: e.source, actor: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null }));
  const active = x.alerts.find((a) => a.status === 'OPEN' || a.status === 'ACTION_CHOSEN') ?? null;
  if (user.role === 'COORDINATOR') {
    const latestResponse = x.alerts.find((a) => a.customerResponse !== null && a.customerRespondedAt !== null);
    return toDetailCoordinator(
      scoped,
      {
        route: { id: x.route.id, code: x.route.code, name: x.route.name, isPrimary: x.route.isPrimary, lengthKm: Number(x.route.lengthKm) },
        driver: x.driver ? { id: x.driver.id, name: x.driver.name, phone: x.driver.phone } : null,
        items: x.items.map((i) => ({ orderLineId: i.orderLineId, gradeCode: i.orderLine.gradeCode, quantityT: Number(i.quantityT), isUrgent: i.orderLine.isUrgent })),
        milestones: milestoneEntries(scoped.currentMilestone, events, true),
        plannedArrivalAt: x.plannedArrivalAt,
        originalPromisedBy: x.originalPromisedBy,
        renegotiated: x.renegotiated,
        receivingWindowOverrideEndAt: x.receivingWindowOverrideEndAt,
        progressM: x.progressM,
        stoppedUntil: x.stoppedUntil,
        lastUpdateAt: x.lastUpdateAt,
        firstAtRiskAt: x.firstAtRiskAt,
        customerNotifiedAt: x.customerNotifiedAt,
        physicalArrivalAt: x.physicalArrivalAt,
        childShipmentIds: x.children.map((c) => c.id),
        openAlert: active ? alertSummary(active) : null,
        latestCustomerResponse: latestResponse ? { response: latestResponse.customerResponse!, at: latestResponse.customerRespondedAt!.toISOString() } : null,
      },
      settledS,
    );
  }
  return toDetailCustomer(
    scoped,
    {
      items: x.items.map((i) => ({ gradeCode: i.orderLine.gradeCode, quantityT: Number(i.quantityT) })),
      milestones: milestoneEntries(scoped.currentMilestone, events, false),
      eta: await customerEta(db, world, scoped, settledS),
      openAlert: active ? toAlertCustomer(active) : null,
    },
    settledS,
  );
}

/** Customer ETA summary: the live explanation's plain fields, or the stored outcome once arrived. */
async function customerEta(db: Db, world: StaticWorld, s: ShipmentListRow, settledS: number): Promise<EtaSummaryCustomer> {
  const live = s.arrivedAt === null && s.currentMilestone !== 'DELIVERED' ? (await computeEtas(db, world, settledS)).get(s.id) : undefined;
  if (live) {
    return {
      view: 'customer',
      shipmentId: s.id,
      predictedArrivalAt: new Date(live.predictedArrivalS * 1000).toISOString(),
      etaLowAt: new Date(live.etaLowS * 1000).toISOString(),
      etaHighAt: new Date(live.etaHighS * 1000).toISOString(),
      promisedBy: s.promisedBy.toISOString(),
      level: live.level,
      plainReason: live.plainReason,
      isRuleBased: true,
    };
  }
  const at = (s.arrivedAt ?? s.etaAt ?? s.promisedBy).toISOString();
  return { view: 'customer', shipmentId: s.id, predictedArrivalAt: at, etaLowAt: at, etaHighAt: at, promisedBy: s.promisedBy.toISOString(), level: s.riskLevel ?? 'ON_TRACK', plainReason: null, isRuleBased: true };
}

const CUSTOMER_EVENT_TYPES = ['MILESTONE', 'CUSTOMER_NOTIFIED', 'RECOVERY_CHOSEN'] as const;

/** #16 timeline (API §7.5): coordinator all events; customer milestones, notices and recovery only, no actors. */
export async function getTimeline(db: Db, user: AuthUser, id: string): Promise<TimelineEvent[]> {
  const s = await db.shipment.findFirst({ where: { AND: [{ id }, shipmentScope(user)] }, select: { id: true } });
  if (!s) throw notFound();
  const coordinator = user.role === 'COORDINATOR';
  const events = await db.shipmentEvent.findMany({
    where: { shipmentId: id, ...(coordinator ? {} : { type: { in: [...CUSTOMER_EVENT_TYPES] } }) },
    orderBy: [{ simTime: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, milestone: true, simTime: true, source: true, actorUserId: true, data: true },
  });
  const names = coordinator ? await actorNames(db, events.map((e) => e.actorUserId)) : new Map();
  return events.map((e) => toTimelineEvent({ ...e, actor: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null }, coordinator));
}

/**
 * #11 positions (API §6.2): live shipments in scope at the CURRENT simulation time. Between grid
 * steps the position is extrapolated by running the same simulation engine on a copy from the last
 * settled boundary — nothing is written. Map coordinates are display only (hand-traced lines).
 */
export async function getPositions(db: Db, world: StaticWorld, user: AuthUser, settledS: number, nowS: number): Promise<PositionsResponse> {
  const scope = await db.shipment.findMany({ where: { AND: [shipmentScope(user), statusWhere('live')] }, select: { id: true, riskLevel: true, stoppedUntil: true } });
  const ids = new Set(scope.map((s) => s.id));
  const facts = new Map(scope.map((s) => [s.id, s]));
  const disruptions = await loadDisruptions(db, settledS);
  let ships = (await loadLiveShipments(db, world, disruptions)).filter((s) => ids.has(s.id));
  const target = Math.max(settledS, Math.floor(nowS));
  if (target > settledS && ships.length > 0) {
    ships = simulate({ shipments: (await loadLiveShipments(db, world, disruptions)), routes: world.routes, disruptions, config: SIM_CONFIG, fromS: settledS, toS: target }).shipments.filter((s) => ids.has(s.id));
  }
  const routes = new Map((await db.route.findMany({ where: { id: { in: ships.map((s) => s.routeId) } }, select: { id: true, geometry: true } })).map((r) => [r.id, r.geometry]));
  const items = ships
    .map((s) => {
      const geometry = routes.get(s.routeId);
      const route = world.routes.get(s.routeId);
      if (!route || !isLineString(geometry)) return null;
      const fraction = Math.min(1, s.progressMm / route.lengthMm);
      const p = positionAlong(geometry, fraction);
      const f = facts.get(s.id);
      return {
        shipmentId: s.id,
        code: s.code,
        routeId: s.routeId,
        lat: p.lat,
        lng: p.lng,
        bearing: Math.round(p.bearing),
        progressPct: Math.round(fraction * 1000) / 10,
        currentMilestone: s.milestone,
        riskLevel: f?.riskLevel ?? null,
        stopped: s.stoppedUntilS !== null && s.stoppedUntilS > target,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  return { simTime: new Date(target * 1000).toISOString(), items };
}

const hhmmOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * #10 map layers (API §6.1). Coordinator: everything incl. active disruptions. Customer: own site
 * and own lane's routes, no disruptions. Driver: own shipments' routes and destinations. Route
 * geometry keeps its `x_source: "HAND_TRACED_DEMO"` marker — illustrative lines, not routing output.
 */
export async function getMapLayers(db: Db, user: AuthUser, settledS: number): Promise<MapLayersResponse> {
  let laneIds: string[] | null = null;
  let customerIds: string[] | null = null;
  let routeIds: string[] | null = null;
  if (user.role === 'CUSTOMER') {
    const lanes = await db.lane.findMany({ where: { customer: customerScope(user) }, select: { id: true, customerId: true } });
    laneIds = lanes.map((l) => l.id);
    customerIds = lanes.map((l) => l.customerId);
  } else if (user.role === 'DRIVER') {
    const own = await db.shipment.findMany({ where: { AND: [shipmentScope(user), statusWhere('live')] }, select: { routeId: true, order: { select: { customerId: true } } } });
    routeIds = [...new Set(own.map((s) => s.routeId))];
    customerIds = [...new Set(own.map((s) => s.order.customerId))];
  }
  const [customers, routes] = await Promise.all([
    db.customer.findMany({ where: customerIds ? { id: { in: customerIds } } : {}, orderBy: { id: 'asc' }, select: { id: true, name: true, city: true, lat: true, lng: true, receivingOpenMin: true, receivingCloseMin: true } }),
    db.route.findMany({
      where: { ...(laneIds ? { laneId: { in: laneIds } } : {}), ...(routeIds ? { id: { in: routeIds } } : {}) },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, laneId: true, name: true, isPrimary: true, lengthKm: true, geometry: true, segments: true },
    }),
  ]);
  const disruptions =
    user.role === 'COORDINATOR'
      ? (await db.disruption.findMany({ where: { startsAt: { lte: new Date(settledS * 1000) } }, orderBy: { id: 'asc' } }))
          .filter((d) => toS(d.endedEarlyAt ?? d.endsAt) > settledS)
          .map((d) => ({ id: d.id, kind: d.kind, label: d.label, segmentCodes: d.segmentCodes }))
      : [];
  return {
    plant: { name: PLANT.name, lat: PLANT.lat, lng: PLANT.lng },
    sites: customers.map((c) => ({ customerId: c.id, name: c.name, city: c.city, lat: c.lat, lng: c.lng, receivingHours: `${hhmmOf(c.receivingOpenMin)}–${hhmmOf(c.receivingCloseMin)}` })),
    routes: routes.map((r) => {
      if (!isLineString(r.geometry) || !isSegmentArray(r.segments)) throw new Error(`route ${r.code} has invalid geometry`);
      const g = r.geometry as typeof r.geometry & { x_source?: unknown };
      return {
        id: r.id,
        code: r.code,
        laneId: r.laneId,
        name: r.name,
        isPrimary: r.isPrimary,
        lengthKm: Number(r.lengthKm),
        geometry: { type: 'LineString', coordinates: g.coordinates, ...(g.x_source === 'HAND_TRACED_DEMO' ? { x_source: 'HAND_TRACED_DEMO' as const } : {}) },
        segments: r.segments,
      };
    }),
    activeDisruptions: disruptions,
  };
}

/** #37 audit (API §14.1): coordinator only. `shipmentId` matches the shipment and its alerts, reports and attribution rows. */
export async function getAudit(db: Db, q: { shipmentId?: string | undefined; entityType?: string | undefined; entityId?: string | undefined; limit: number }): Promise<AuditResponse> {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (q.entityType) and.push({ entityType: q.entityType });
  if (q.entityId) and.push({ entityId: q.entityId });
  if (q.shipmentId) {
    const [alerts, reports, rows] = await Promise.all([
      db.alert.findMany({ where: { shipmentId: q.shipmentId }, select: { id: true } }),
      db.driverReport.findMany({ where: { shipmentId: q.shipmentId }, select: { id: true } }),
      db.delayAttribution.findMany({ where: { shipmentId: q.shipmentId }, select: { id: true } }),
    ]);
    const ids = [q.shipmentId, ...alerts.map((x) => x.id), ...reports.map((x) => x.id), ...rows.map((x) => x.id)];
    and.push({ OR: [{ entityId: { in: ids } }, { data: { path: ['shipmentId'], equals: q.shipmentId } }] });
  }
  const items = await db.auditLog.findMany({ where: { AND: and }, orderBy: [{ simTime: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: q.limit });
  const names = await actorNames(db, items.map((i) => i.actorUserId));
  return {
    items: items.map((i) => {
      const a = i.actorUserId ? names.get(i.actorUserId) : undefined;
      return {
        id: i.id,
        actor: a ? { id: a.id, name: a.name, role: a.role } : null,
        action: i.action,
        entityType: i.entityType,
        entityId: i.entityId,
        simTime: i.simTime ? i.simTime.toISOString() : null,
        createdAt: i.createdAt.toISOString(),
        data: i.data && typeof i.data === 'object' && !Array.isArray(i.data) ? (i.data as Record<string, unknown>) : {},
      };
    }),
  };
}

/** #38 reference lists (API §14a): coordinator only. */
export async function getReference(db: Db): Promise<ReferenceResponse> {
  const [lanes, routes, transporters, customers, trucks] = await Promise.all([
    db.lane.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, customerId: true } }),
    db.route.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, laneId: true, name: true, isPrimary: true, segments: true } }),
    db.transporter.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, fleetSize: true } }),
    db.customer.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, city: true } }),
    db.truck.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, transporterId: true, status: true, locationLabel: true, defaultDriverUserId: true } }),
  ]);
  const segs = new Map<string, { segmentCode: string; name: string; routeCodes: string[] }>();
  const outRoutes = routes.map((r) => {
    if (!isSegmentArray(r.segments)) throw new Error(`route ${r.code} has invalid segments`);
    for (const sg of r.segments) {
      const e = segs.get(sg.segmentCode) ?? { segmentCode: sg.segmentCode, name: sg.name, routeCodes: [] };
      e.routeCodes.push(r.code);
      segs.set(sg.segmentCode, e);
    }
    return { id: r.id, code: r.code, laneId: r.laneId, name: r.name, isPrimary: r.isPrimary, segments: r.segments };
  });
  return {
    lanes,
    routes: outRoutes,
    segments: [...segs.values()].sort((a, b) => (a.segmentCode < b.segmentCode ? -1 : 1)),
    transporters: transporters.map((t) => ({ id: t.id, code: t.code, name: t.name, fleetSize: t.fleetSize, isSmall: t.fleetSize <= SMALL_FLEET_MAX })),
    customers,
    trucks: trucks.map((t) => ({ id: t.id, code: t.code, transporterId: t.transporterId, status: t.status, locationLabel: t.locationLabel, hasDefaultDriver: t.defaultDriverUserId !== null })),
  };
}
