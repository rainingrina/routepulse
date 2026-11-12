/**
 * PENDING CONTRACT — temporary, frontend-local transcription.
 *
 * These DTOs are transcribed verbatim from planning/06_API_SPEC.md v0.3 (§2.2 and §4–§14a).
 * Architecture §8.1 says they belong in `packages/shared/src/api`, and planning/09_BACKEND_HANDOFF.md
 * asks the web app to import them from `@routepulse/shared` rather than copy them. They are not
 * published there yet (PROGRESS 1.7 "endpoint DTOs added per milestone"), and the frontend owner may
 * not edit `packages/shared` without Dev A. Until they are published:
 *
 *   - Nothing in the app imports this file directly; everything imports from `../contract`.
 *   - When Dev A publishes a type in `@routepulse/shared`, delete it here and re-export it from
 *     `./index.ts`. The compiler then shows any drift.
 *   - Do not add fields that are not in 06_API_SPEC.md.
 *
 * Tracked in docs/FRONTEND_BACKEND_HANDOFF.md §3.
 */
import type {
  Confidence,
  Milestone,
  Party,
  ReasonCode,
  RiskLevel,
  Id,
  ISODateTime,
  Minutes,
  Pct,
  Factor,
  PartyMinutes,
  EtaExplanationCoordinator,
  DriverTripShipment,
  DriverHandover,
  ShipmentListItem,
  ShipmentListItemCoordinator,
  MilestoneEntry,
  TimelineEvent,
  RecoveryOptionDto,
  AlertDtoCoordinator,
} from '@routepulse/shared';

// ---------- §2.2 Core objects ----------
// Published by Dev A (no longer pending): UserDto, LoginRequest, LoginResponse, MeResponse, HomePath,
// Segment, GeoJSONLineString (M2–M3); SimClockRequest/Response, SimResetResponse (M4); Factor,
// PartyMinutes, EtaExplanationCoordinator, EtaSummaryCustomer, EngineRulesResponse (M5);
// DriverReportDto, DriverTripShipment, DriverHandover, Classify*, CreateDriverReport*,
// ReviewDriverReport*, AttributionRowDto, AttributionResponse, AttributionOverrideRequest (M6) —
// all imported from @routepulse/shared via ./index.ts.

// ---------- §5 Simulation ----------

// ---------- §6 Map and tracking ----------

// ---------- §7 Orders and shipments ----------

export interface OrderSummary {
  id: Id;
  code: string;
  customer: { id: Id; name: string };
  promisedBy: ISODateTime;
  lines: { gradeCode: string; quantityT: number }[];
  shipmentCount: number;
  status: 'OPEN' | 'DELIVERED';
  worstRiskLevel: RiskLevel | null;
}

export type OrderDetail = OrderSummary & { shipments: ShipmentListItem[] };

export interface OrderListQuery {
  status?: 'open' | 'delivered' | 'all';
  customerId?: Id;
  limit?: number;
}

export interface RecordMilestoneRequest {
  milestone: Milestone;
  note?: string;
}

export interface RecordMilestoneResponse {
  shipment: ShipmentListItemCoordinator | DriverTripShipment;
  milestones: MilestoneEntry[];
}

// ---------- §8 ETA and risk ----------

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
  leadTimeMinutes: Minutes | null;
  snapshots: ReplaySnapshot[];
  events: TimelineEvent[];
}

// ---------- §9 Driver and driver reports ----------

export interface DriverTripResponse {
  items: DriverTripShipment[];
  recentHandovers: DriverHandover[];
}

// ---------- §10 Alerts and recovery ----------

export interface RecoveryOptionsResponse {
  shipmentId: Id;
  optionSetId: string | null;
  generatedAt: ISODateTime | null;
  suggestionRule: string;
  options: RecoveryOptionDto[];
}

export interface ChooseRecoveryRequest {
  optionSetId: string;
  confirm: true;
  note?: string;
}

export interface ChooseRecoveryResponse {
  option: RecoveryOptionDto;
  alert: AlertDtoCoordinator | null;
  shipment: ShipmentListItemCoordinator;
  eta: EtaExplanationCoordinator;
  childShipment: ShipmentListItemCoordinator | null;
  driverChange: { fromDriverName: string; toDriverName: string; toTruckCode: string } | null;
  customerNotified: boolean;
}

// ---------- §11 Notifications ----------

// ---------- §12 Attribution ----------

// ---------- §13 Analytics ----------

export interface DashboardQuery {
  period?: '7d' | '30d' | '60d';
  laneId?: Id;
  transporterId?: Id;
}

export interface DashboardResponse {
  filter: {
    period: '7d' | '30d' | '60d';
    from: ISODateTime;
    to: ISODateTime;
    laneId: Id | null;
    transporterId: Id | null;
  };
  generatedAtSim: ISODateTime;
  arrivedCount: number;
  kpis: {
    onTimePct: Pct;
    lateCount: number;
    medianDelayMinutesOfLate: Minutes | null;
    medianWarningLeadMinutes: Minutes | null;
    proactiveNoticeRatePct: Pct;
    recoveredPct: Pct;
    renegotiatedCount: number;
  };
  onTimeByLane: { laneId: Id; laneName: string; delivered: number; onTime: number; onTimePct: Pct }[];
  onTimeByTransporter: {
    transporterId: Id;
    name: string;
    isSmall: boolean;
    delivered: number;
    onTime: number;
    onTimePct: Pct;
  }[];
  weeklyTrend: { weekStart: ISODateTime; delivered: number; onTimePct: Pct }[];
  causesByParty: { party: Party; minutes: Minutes; sharePct: Pct }[];
  causesByReason: { reason: ReasonCode; party: Party; minutes: Minutes }[];
  causesByLane: { laneId: Id; laneName: string; byParty: PartyMinutes[] }[];
  causesByTransporter: { transporterId: Id; name: string; byParty: PartyMinutes[] }[];
  transporterTable: {
    transporterId: Id;
    name: string;
    fleetSize: number;
    isSmall: boolean;
    delivered: number;
    rawOnTimePct: Pct;
    fairOnTimePct: Pct;
    gapPct: Pct;
    medianDelayMinutesOfLate: Minutes | null;
    topCause: { party: Party; reason: ReasonCode | null } | null;
  }[];
  definitions: Record<'onTime' | 'fairOnTime' | 'warningLead' | 'proactiveNotice' | 'recovered', string>;
  dataNote: string;
}

// ---------- §14 Audit ----------

// ---------- §14a Reference data ----------

