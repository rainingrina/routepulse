import {
  MILESTONES,
  SMALL_FLEET_MAX,
  type AlertSummary,
  type CustomerAlertDto,
  type EtaSummaryCustomer,
  type MilestoneEntry,
  type ShipmentDetailCoordinator,
  type ShipmentDetailCustomer,
  type ShipmentListItemCoordinator,
  type ShipmentListItemCustomer,
  type TimelineEvent,
} from '@routepulse/shared';
import { hhmm } from '../engines/eta.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toS } from '../sim/world.js';

/**
 * Shipment serializers (API §2.2, §7). Explicit field picks only. Customer views never contain
 * driver identity, parties, factor codes or internal evidence (AC-M1.6).
 */

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const SHIPMENT_LIST_SELECT = {
  id: true,
  code: true,
  orderId: true,
  order: { select: { code: true, customer: { select: { id: true, name: true, city: true } } } },
  lane: { select: { id: true, name: true } },
  transporter: { select: { id: true, name: true, fleetSize: true } },
  truck: { select: { code: true } },
  currentMilestone: true,
  etaAt: true,
  etaLowAt: true,
  etaHighAt: true,
  promisedBy: true,
  slackMinutes: true,
  riskLevel: true,
  riskScore: true,
  confidence: true,
  parentShipmentId: true,
  arrivedAt: true,
  deliveredAt: true,
  onTime: true,
  delayMinutes: true,
  alerts: { where: { status: { in: ['OPEN', 'ACTION_CHOSEN'] } }, select: { id: true } },
  reports: { where: { status: 'PENDING_REVIEW' }, select: { id: true } },
} as const satisfies Prisma.ShipmentSelect;

export type ShipmentListRow = Prisma.ShipmentGetPayload<{ select: typeof SHIPMENT_LIST_SELECT }>;

export function toListItemCoordinator(s: ShipmentListRow): ShipmentListItemCoordinator {
  return {
    view: 'coordinator',
    id: s.id,
    code: s.code,
    orderId: s.orderId,
    orderCode: s.order.code,
    customer: { id: s.order.customer.id, name: s.order.customer.name, city: s.order.customer.city },
    lane: { id: s.lane.id, name: s.lane.name },
    transporter: { id: s.transporter.id, name: s.transporter.name, isSmall: s.transporter.fleetSize <= SMALL_FLEET_MAX },
    truckCode: s.truck?.code ?? null,
    currentMilestone: s.currentMilestone,
    etaAt: iso(s.etaAt),
    etaLowAt: iso(s.etaLowAt),
    etaHighAt: iso(s.etaHighAt),
    promisedBy: s.promisedBy.toISOString(),
    slackMinutes: s.slackMinutes,
    riskLevel: s.riskLevel,
    riskScore: s.riskScore,
    confidence: s.confidence,
    hasOpenAlert: s.alerts.length > 0,
    pendingReportCount: s.reports.length,
    parentShipmentId: s.parentShipmentId,
    arrivedAt: iso(s.arrivedAt),
    deliveredAt: iso(s.deliveredAt),
    onTime: s.onTime,
    delayMinutes: s.delayMinutes,
  };
}

/** "Fri 08:00" when on another day than `nowS`, else "17:50" (display time Asia/Kolkata). */
export function shortTime(atS: number, nowS: number): string {
  const day = (s: number) => Math.floor((s + 330 * 60) / 86400);
  if (day(atS) === day(nowS)) return hhmm(atS);
  const wd = new Date((atS + 330 * 60) * 1000).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return `${wd} ${hhmm(atS)}`;
}

/** Plain customer status line (API §2.2 `plainStatus`), from stored facts only. */
export function plainStatus(s: Pick<ShipmentListRow, 'currentMilestone' | 'etaAt' | 'arrivedAt' | 'deliveredAt'>, nowS: number): string {
  switch (s.currentMilestone) {
    case 'ORDER_CONFIRMED':
      return 'Order confirmed';
    case 'TRUCK_ASSIGNED':
      return 'Truck assigned';
    case 'AT_GATE':
    case 'LOADING':
      return 'Loading at Plant X';
    case 'GATE_OUT':
    case 'IN_TRANSIT':
      return s.etaAt ? `On the way · expected ${shortTime(toS(s.etaAt), nowS)}` : 'On the way';
    case 'ARRIVED':
      return s.arrivedAt ? `Arrived ${shortTime(toS(s.arrivedAt), nowS)} · unloading` : 'Arrived · unloading';
    case 'DELIVERED':
      return s.deliveredAt ? `Delivered ${shortTime(toS(s.deliveredAt), nowS)}` : 'Delivered';
  }
}

export function toListItemCustomer(s: ShipmentListRow, nowS: number): ShipmentListItemCustomer {
  return {
    view: 'customer',
    id: s.id,
    code: s.code,
    orderId: s.orderId,
    orderCode: s.order.code,
    laneName: s.lane.name,
    transporterName: s.transporter.name,
    currentMilestone: s.currentMilestone,
    etaAt: iso(s.etaAt),
    etaLowAt: iso(s.etaLowAt),
    etaHighAt: iso(s.etaHighAt),
    promisedBy: s.promisedBy.toISOString(),
    riskLevel: s.riskLevel,
    plainStatus: plainStatus(s, nowS),
    arrivedAt: iso(s.arrivedAt),
    deliveredAt: iso(s.deliveredAt),
    onTime: s.onTime,
  };
}

/** The 8 milestones with state and source (API §2.2 MilestoneEntry). Customers never see actor names. */
export function milestoneEntries(
  current: (typeof MILESTONES)[number],
  events: readonly { milestone: (typeof MILESTONES)[number] | null; simTime: Date; source: MilestoneEntry['source']; actor: { name: string } | null }[],
  withActors: boolean,
): MilestoneEntry[] {
  const idx = MILESTONES.indexOf(current);
  return MILESTONES.map((m, i) => {
    const e = events.find((x) => x.milestone === m);
    return {
      milestone: m,
      state: i < idx || (i === idx && m === 'DELIVERED') ? 'DONE' : i === idx ? 'CURRENT' : 'PENDING',
      at: e ? e.simTime.toISOString() : null,
      source: e ? e.source : null,
      actorName: withActors && e?.actor ? e.actor.name : null,
    };
  });
}

export function alertSummary(a: { id: string; status: AlertSummary['status']; openedAt: Date; topFactor: AlertSummary['topFactor']; topReason: AlertSummary['topReason'] }): AlertSummary {
  return { id: a.id, status: a.status, openedAt: a.openedAt.toISOString(), topFactor: a.topFactor, topReason: a.topReason };
}

export interface DetailExtras {
  route: { id: string; code: string; name: string; isPrimary: boolean; lengthKm: number };
  driver: { id: string; name: string; phone: string | null } | null;
  items: { orderLineId: string; gradeCode: string; quantityT: number; isUrgent: boolean }[];
  milestones: MilestoneEntry[];
  plannedArrivalAt: Date;
  originalPromisedBy: Date;
  renegotiated: boolean;
  receivingWindowOverrideEndAt: Date | null;
  progressM: number;
  stoppedUntil: Date | null;
  lastUpdateAt: Date | null;
  firstAtRiskAt: Date | null;
  customerNotifiedAt: Date | null;
  physicalArrivalAt: Date | null;
  childShipmentIds: string[];
  openAlert: AlertSummary | null;
  latestCustomerResponse: ShipmentDetailCoordinator['latestCustomerResponse'];
}

export function toDetailCoordinator(row: ShipmentListRow, x: DetailExtras, settledS: number): ShipmentDetailCoordinator {
  return {
    ...toListItemCoordinator(row),
    route: x.route,
    driver: x.driver,
    items: x.items,
    milestones: x.milestones,
    plannedArrivalAt: x.plannedArrivalAt.toISOString(),
    originalPromisedBy: x.originalPromisedBy.toISOString(),
    renegotiated: x.renegotiated,
    receivingWindowOverrideEndAt: iso(x.receivingWindowOverrideEndAt),
    progressKm: Math.round(x.progressM / 10) / 100,
    stopped: x.stoppedUntil !== null && toS(x.stoppedUntil) > settledS,
    stoppedUntil: iso(x.stoppedUntil),
    lastUpdateAt: iso(x.lastUpdateAt),
    firstAtRiskAt: iso(x.firstAtRiskAt),
    customerNotifiedAt: iso(x.customerNotifiedAt),
    physicalArrivalAt: iso(x.physicalArrivalAt),
    childShipmentIds: x.childShipmentIds,
    openAlert: x.openAlert,
    latestCustomerResponse: x.latestCustomerResponse,
  };
}

export function toDetailCustomer(
  row: ShipmentListRow,
  x: { items: { gradeCode: string; quantityT: number }[]; milestones: MilestoneEntry[]; eta: EtaSummaryCustomer; openAlert: CustomerAlertDto | null },
  nowS: number,
): ShipmentDetailCustomer {
  return { ...toListItemCustomer(row, nowS), items: x.items, milestones: x.milestones.map((m) => ({ ...m, actorName: null })), eta: x.eta, openAlert: x.openAlert };
}

const EVENT_TEXT: Record<TimelineEvent['type'], string> = {
  MILESTONE: 'Milestone',
  DRIVER_REPORT: 'Driver reported a problem',
  REPORT_REVIEWED: 'Coordinator reviewed a driver report',
  DISRUPTION_STARTED: 'Disruption started',
  DISRUPTION_ENDED: 'Disruption ended',
  ALERT_OPENED: 'At-risk alert opened',
  ALERT_RESOLVED: 'Alert resolved',
  CUSTOMER_NOTIFIED: 'Customer notified',
  CUSTOMER_RESPONDED: 'Customer responded',
  RECOVERY_CHOSEN: 'Recovery action chosen',
  RECOVERY_APPLIED: 'Recovery applied',
  ATTRIBUTION_OVERRIDDEN: 'Delay attribution changed',
  PHYSICAL_ARRIVAL: 'Truck reached the customer gate',
};

const MILESTONE_TEXT: Record<(typeof MILESTONES)[number], string> = {
  ORDER_CONFIRMED: 'Order confirmed',
  TRUCK_ASSIGNED: 'Truck assigned',
  AT_GATE: 'At plant gate',
  LOADING: 'Loading',
  GATE_OUT: 'Gate out',
  IN_TRANSIT: 'In transit',
  ARRIVED: 'Arrived',
  DELIVERED: 'Delivered',
};

/** Timeline item (API §2.2). Customers get milestones, notifications and recovery only, without actors (API §7.5). */
export function toTimelineEvent(
  e: { id: string; type: TimelineEvent['type']; milestone: TimelineEvent['milestone']; simTime: Date; source: TimelineEvent['source']; actor: { name: string } | null; data: unknown },
  withActors: boolean,
): TimelineEvent {
  let summary = e.milestone ? MILESTONE_TEXT[e.milestone] : EVENT_TEXT[e.type];
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (withActors && e.type === 'DRIVER_REPORT' && typeof d['reason'] === 'string') summary = `Driver reported: ${String(d['reason']).toLowerCase().replace(/_/g, ' ')}`;
  return { id: e.id, type: e.type, milestone: e.milestone, simTime: e.simTime.toISOString(), source: e.source, actorName: withActors && e.actor ? e.actor.name : null, summary };
}
