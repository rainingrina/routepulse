import type { AlertStatus, Confidence, CustomerResponse, EventSource, EventType, FactorCode, Milestone, ReasonCode, RiskLevel } from '../enums.js';
import type { Id, ISODateTime, Minutes } from './common.js';
import type { EtaSummaryCustomer } from './eta.js';
import type { CustomerAlertDto } from './alerts.js';

/** API spec §2.2 and §7 (#14, #15): shipments. `view` matches the caller's role. */

export interface MilestoneEntry {
  milestone: Milestone;
  state: 'DONE' | 'CURRENT' | 'PENDING';
  at: ISODateTime | null;
  source: EventSource | null;
  actorName: string | null;
}

export interface ShipmentListItemCoordinator {
  view: 'coordinator';
  id: Id;
  code: string;
  orderId: Id;
  orderCode: string;
  customer: { id: Id; name: string; city: string };
  lane: { id: Id; name: string };
  transporter: { id: Id; name: string; isSmall: boolean };
  truckCode: string | null;
  currentMilestone: Milestone;
  etaAt: ISODateTime | null;
  etaLowAt: ISODateTime | null;
  etaHighAt: ISODateTime | null;
  promisedBy: ISODateTime;
  slackMinutes: Minutes | null;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  confidence: Confidence | null;
  hasOpenAlert: boolean;
  pendingReportCount: number;
  parentShipmentId: Id | null;
  arrivedAt: ISODateTime | null;
  deliveredAt: ISODateTime | null;
  onTime: boolean | null;
  delayMinutes: Minutes | null;
}

export interface ShipmentListItemCustomer {
  view: 'customer';
  id: Id;
  code: string;
  orderId: Id;
  orderCode: string;
  laneName: string;
  transporterName: string;
  currentMilestone: Milestone;
  etaAt: ISODateTime | null;
  etaLowAt: ISODateTime | null;
  etaHighAt: ISODateTime | null;
  promisedBy: ISODateTime;
  riskLevel: RiskLevel | null;
  plainStatus: string;
  arrivedAt: ISODateTime | null;
  deliveredAt: ISODateTime | null;
  onTime: boolean | null;
}

export type ShipmentListItem = ShipmentListItemCoordinator | ShipmentListItemCustomer;

export interface AlertSummary {
  id: Id;
  status: AlertStatus;
  openedAt: ISODateTime;
  topFactor: FactorCode | null;
  topReason: ReasonCode | null;
}

export interface ShipmentDetailCoordinator extends ShipmentListItemCoordinator {
  route: { id: Id; code: string; name: string; isPrimary: boolean; lengthKm: number };
  driver: { id: Id; name: string; phone: string | null } | null;
  items: { orderLineId: Id; gradeCode: string; quantityT: number; isUrgent: boolean }[];
  milestones: MilestoneEntry[];
  plannedArrivalAt: ISODateTime;
  originalPromisedBy: ISODateTime;
  renegotiated: boolean;
  receivingWindowOverrideEndAt: ISODateTime | null;
  progressKm: number;
  stopped: boolean;
  stoppedUntil: ISODateTime | null;
  lastUpdateAt: ISODateTime | null;
  firstAtRiskAt: ISODateTime | null;
  customerNotifiedAt: ISODateTime | null;
  physicalArrivalAt: ISODateTime | null;
  childShipmentIds: Id[];
  openAlert: AlertSummary | null;
  latestCustomerResponse: { response: CustomerResponse; at: ISODateTime } | null;
}

export interface ShipmentDetailCustomer extends ShipmentListItemCustomer {
  items: { gradeCode: string; quantityT: number }[];
  milestones: MilestoneEntry[];
  eta: EtaSummaryCustomer;
  openAlert: CustomerAlertDto | null;
}

export type ShipmentDetail = ShipmentDetailCoordinator | ShipmentDetailCustomer;

export interface TimelineEvent {
  id: Id;
  type: EventType;
  milestone: Milestone | null;
  simTime: ISODateTime;
  source: EventSource;
  actorName: string | null;
  summary: string;
}

export interface ShipmentListQuery {
  status?: 'live' | 'delivered' | 'all';
  riskLevel?: RiskLevel[];
  laneId?: Id;
  transporterId?: Id;
  customerId?: Id;
  arrivedFrom?: ISODateTime;
  arrivedTo?: ISODateTime;
  onTime?: 'true' | 'false';
  q?: string;
  sort?: 'risk' | 'eta' | 'promise';
  limit?: number;
}
