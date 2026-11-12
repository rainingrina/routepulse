import type { Confidence, Milestone, RiskLevel } from '../enums.js';
import type { Id, ISODateTime, Minutes } from './common.js';
import type { Factor } from './eta.js';
import type { DriverHandover, DriverTripShipment } from './reports.js';
import type { MilestoneEntry, ShipmentListItem, ShipmentListItemCoordinator, TimelineEvent } from './shipments.js';

/** API spec §7 (#12, #13, #17), §8 (#19) and §9 (#21): orders, milestone taps, replay, driver trip. */

/** GET /api/orders (#12) query. */
export interface OrderListQuery {
  status?: 'open' | 'delivered' | 'all';
  customerId?: Id;
  limit?: number;
}

export interface OrderSummary {
  id: Id;
  code: string;
  customer: { id: Id; name: string };
  promisedBy: ISODateTime;
  lines: { gradeCode: string; quantityT: number }[];
  shipmentCount: number;
  /** Derived: DELIVERED when every shipment of the order is delivered. */
  status: 'OPEN' | 'DELIVERED';
  worstRiskLevel: RiskLevel | null;
}

/** GET /api/orders/:orderId (#13). */
export type OrderDetail = OrderSummary & { shipments: ShipmentListItem[] };

/** POST /api/shipments/:shipmentId/milestones (#17). */
export interface RecordMilestoneRequest {
  milestone: Milestone;
  /** Required for a coordinator override (5–280 characters). */
  note?: string;
}

export interface RecordMilestoneResponse {
  shipment: ShipmentListItemCoordinator | DriverTripShipment;
  milestones: MilestoneEntry[];
}

/** GET /api/shipments/:shipmentId/replay (#19). Read-only history from stored snapshots. */
export interface ReplaySnapshot {
  id: Id;
  simTime: ISODateTime;
  trigger: string;
  predictedArrivalAt: ISODateTime;
  etaLowAt: ISODateTime;
  etaHighAt: ISODateTime;
  slackMinutes: Minutes;
  level: RiskLevel;
  score: number;
  confidence: Confidence;
  position: { lat: number; lng: number };
  factors: Factor[];
}

export interface ReplayResponse {
  shipmentId: Id;
  code: string;
  promisedBy: ISODateTime;
  plannedArrivalAt: ISODateTime;
  firstAtRiskAt: ISODateTime | null;
  /** promisedBy − firstAtRiskAt; null when never at risk. */
  leadTimeMinutes: Minutes | null;
  snapshots: ReplaySnapshot[];
  events: TimelineEvent[];
}

/** GET /api/driver/trip (#21). */
export interface DriverTripResponse {
  items: DriverTripShipment[];
  recentHandovers: DriverHandover[];
}
