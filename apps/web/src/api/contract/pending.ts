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
  AlertStatus,
  Confidence,
  CustomerResponse,
  DisruptionKind,
  EventSource,
  EventType,
  FactorCode,
  Milestone,
  NotificationKind,
  OptionStatus,
  Party,
  ReasonCode,
  RecoveryKind,
  ReportStatus,
  RiskLevel,
  Role,
  Id,
  ISODateTime,
  Minutes,
  Pct,
  SimStateDto,
  Segment,
  GeoJSONLineString,
} from '@routepulse/shared';

// ---------- §2.2 Core objects ----------
// Published by Dev A (no longer pending): UserDto, LoginRequest, LoginResponse, MeResponse, HomePath,
// Segment, GeoJSONLineString — imported from @routepulse/shared.

export interface PartyMinutes {
  party: Party;
  minutes: Minutes;
}

export interface Factor {
  code: FactorCode;
  phase: 'INCURRED' | 'PLAN_CHANGE' | 'EXPECTED';
  minutes: Minutes;
  party: Party | null;
  split: PartyMinutes[] | null;
  reason: ReasonCode | null;
  label: string;
  detail: string;
  sourceRef: { type: 'DISRUPTION' | 'DRIVER_REPORT'; id: Id } | null;
  reviewStatus: ReportStatus | null;
}

export interface EtaExplanationCoordinator {
  view: 'coordinator';
  shipmentId: Id;
  simTime: ISODateTime;
  ruleVersion: string;
  plannedArrivalAt: ISODateTime;
  projectedRoadArrivalAt: ISODateTime;
  predictedArrivalAt: ISODateTime;
  etaLowAt: ISODateTime;
  etaHighAt: ISODateTime;
  receivingWindow: { opensAt: ISODateTime; closesAt: ISODateTime; overrideEndAt: ISODateTime | null };
  promisedBy: ISODateTime;
  slackMinutes: Minutes;
  level: RiskLevel;
  score: number;
  confidence: Confidence;
  confidenceReason: string;
  summary: string;
  factors: Factor[];
  totals: { incurredMinutes: Minutes; planChangeMinutes: Minutes; expectedMinutes: Minutes };
  identityHolds: boolean;
  isRuleBased: true;
}

export interface EtaSummaryCustomer {
  view: 'customer';
  shipmentId: Id;
  predictedArrivalAt: ISODateTime;
  etaLowAt: ISODateTime;
  etaHighAt: ISODateTime;
  promisedBy: ISODateTime;
  level: RiskLevel;
  plainReason: string | null;
  isRuleBased: true;
}

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

export interface RecoveryOptionDto {
  id: Id;
  optionSetId: string;
  kind: RecoveryKind;
  title: string;
  feasible: boolean;
  infeasibleReason: string | null;
  newEtaAt: ISODateTime | null;
  etaLowAt: ISODateTime | null;
  etaHighAt: ISODateTime | null;
  meetsPromise: boolean;
  minutesSavedVsNotify: Minutes;
  newWindowEnd: ISODateTime | null;
  extraCostInr: number;
  costNote: string;
  co2eDeltaKg: number | null;
  co2eNote: string;
  isSuggested: boolean;
  constraints: string[];
  status: OptionStatus;
}

export interface AlertDtoCoordinator extends AlertSummary {
  view: 'coordinator';
  shipment: { id: Id; code: string; customerName: string; laneName: string };
  resolvedAt: ISODateTime | null;
  summary: string;
  proposedOption: RecoveryOptionDto | null;
  chosenOption: RecoveryOptionDto | null;
  chosenBy: { id: Id; name: string } | null;
  chosenAt: ISODateTime | null;
  customerResponse: CustomerResponse | null;
  customerRespondedAt: ISODateTime | null;
}

export interface CustomerAlertDto {
  view: 'customer';
  id: Id;
  status: AlertStatus;
  openedAt: ISODateTime;
  shipmentId: Id;
  shipmentCode: string;
  orderCode: string;
  predictedArrivalAt: ISODateTime;
  etaLowAt: ISODateTime;
  etaHighAt: ISODateTime;
  promisedBy: ISODateTime;
  plainReason: string;
  action: { label: 'PROPOSED' | 'CONFIRMED'; kind: RecoveryKind; text: string } | null;
  customerResponse: CustomerResponse | null;
  customerRespondedAt: ISODateTime | null;
  canRespond: boolean;
}

export type AlertDto = AlertDtoCoordinator | CustomerAlertDto;

export interface NotificationDto {
  id: Id;
  kind: NotificationKind;
  templateKey: string;
  params: Record<string, string | number>;
  text: string;
  simTime: ISODateTime;
  readAt: ISODateTime | null;
  shipmentId: Id | null;
  shipmentCode: string | null;
  alertId: Id | null;
}

export interface DriverReportDto {
  id: Id;
  shipmentId: Id;
  shipmentCode: string;
  reporter: { id: Id; name: string };
  simTime: ISODateTime;
  chipReason: ReasonCode | null;
  text: string | null;
  suggestedReason: ReasonCode | null;
  matchedKeywords: string[];
  reason: ReasonCode;
  estimatedMinutes: Minutes | null;
  appliedMinutes: Minutes;
  party: Party;
  status: ReportStatus;
  reviewedBy: { id: Id; name: string } | null;
  reviewedAt: ISODateTime | null;
  reviewNote: string | null;
  originalReason: ReasonCode | null;
  originalParty: Party | null;
}

export interface DisruptionDto {
  id: Id;
  kind: DisruptionKind;
  origin: 'SEED' | 'SIMULATOR';
  label: string;
  segmentCodes: string[];
  shipmentId: Id | null;
  slowdownPct: number | null;
  extraMinutesPerTruck: number | null;
  stopMinutes: number | null;
  party: Party;
  reason: ReasonCode;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  endedEarlyAt: ISODateTime | null;
  active: boolean;
}

// ---------- §5 Simulation ----------

export type SimClockRequest =
  | { action: 'PLAY' }
  | { action: 'PAUSE' }
  | { action: 'SET_SPEED'; speed: 1 | 10 | 60 }
  | { action: 'ADVANCE'; minutes: number }
  | { action: 'ADVANCE_TO'; to: ISODateTime };

export type SimClockResponse = SimStateDto & { stepsExecuted: number };
export type SimResetResponse = SimStateDto & { durationMs: number };

export type CreateDisruptionRequest =
  | { kind: 'WEATHER_SLOWDOWN'; label?: string; segmentCodes: string[]; slowdownPct: number; durationMinutes: number }
  | { kind: 'ROAD_CLOSURE'; label?: string; segmentCodes: string[]; durationMinutes: number }
  | { kind: 'GATE_CONGESTION'; label?: string; extraMinutesPerTruck: number; durationMinutes: number }
  | { kind: 'TRUCK_BREAKDOWN'; label?: string; shipmentId: Id; repairMinutes: number };

export interface CreateDisruptionResponse {
  disruption: DisruptionDto;
  impact: {
    affectedShipmentIds: Id[];
    affectedCount: number;
    levelChanges: { shipmentId: Id; code: string; from: RiskLevel | null; to: RiskLevel | null }[];
    nowAtRiskCount: number;
    summary: string;
  };
}

// ---------- §6 Map and tracking ----------

export interface MapLayersResponse {
  plant: { name: string; lat: number; lng: number };
  sites: { customerId: Id; name: string; city: string; lat: number; lng: number; receivingHours: string }[];
  routes: {
    id: Id;
    code: string;
    laneId: Id;
    name: string;
    isPrimary: boolean;
    lengthKm: number;
    geometry: GeoJSONLineString;
    segments: Segment[];
  }[];
  activeDisruptions: { id: Id; kind: DisruptionKind; label: string; segmentCodes: string[] }[];
}

export interface PositionItem {
  shipmentId: Id;
  code: string;
  routeId: Id;
  lat: number;
  lng: number;
  bearing: number;
  progressPct: number;
  currentMilestone: Milestone;
  riskLevel: RiskLevel | null;
  stopped: boolean;
}

export interface PositionsResponse {
  simTime: ISODateTime;
  items: PositionItem[];
}

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

export interface EngineRulesResponse {
  ruleVersion: string;
  statement: string;
  identity: string;
  factors: { code: FactorCode; name: string; rule: string; party: string }[];
  thresholds: { onTrackMinSlack: Minutes; watchMinSlack: Minutes };
  rangeRule: string;
  confidenceRule: string;
  scoreRule: string;
  reasonDefaults: { reason: ReasonCode; party: Party | 'CONDITIONAL'; minutes: Minutes }[];
  suggestionRule: string;
  co2e: { enabled: boolean; method: string | null; source: string | null };
}

// ---------- §9 Driver and driver reports ----------

export interface DriverTripShipment {
  view: 'driver';
  id: Id;
  code: string;
  customerName: string;
  city: string;
  destination: { lat: number; lng: number };
  currentMilestone: Milestone;
  nextMilestone: Milestone | null;
  canRecordNext: boolean;
  nextBlockedReason: string | null;
  etaAt: ISODateTime | null;
  promisedBy: ISODateTime;
  stopped: boolean;
  instruction: string | null;
  openReports: { id: Id; reason: ReasonCode; status: ReportStatus; simTime: ISODateTime }[];
}

export interface DriverHandover {
  shipmentId: Id;
  shipmentCode: string;
  toTruckCode: string;
  toDriverName: string;
  at: ISODateTime;
}

export interface DriverTripResponse {
  items: DriverTripShipment[];
  recentHandovers: DriverHandover[];
}

export interface ClassifyRequest {
  text: string;
}

export interface ClassifyResponse {
  suggestedReason: ReasonCode | null;
  matchedKeywords: string[];
  strength: 'STRONG' | 'WEAK' | 'NONE';
  defaultMinutes: Minutes | null;
  defaultParty: Party | null;
  method: 'KEYWORD_LIST_V1';
}

export interface CreateDriverReportRequest {
  chipReason?: ReasonCode;
  text?: string;
  reason: ReasonCode;
  estimatedMinutes?: 30 | 60 | 120 | 240;
}

export interface CreateDriverReportResponse {
  report: DriverReportDto;
  trip: DriverTripShipment | null;
}

export interface ReviewDriverReportRequest {
  reason: ReasonCode;
  party: Party;
  note?: string;
}

export interface ReviewDriverReportResponse {
  report: DriverReportDto;
  eta: EtaExplanationCoordinator;
}

// ---------- §10 Alerts and recovery ----------

export interface CustomerResponseRequest {
  response: CustomerResponse;
}

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

export interface NotificationsResponse {
  items: NotificationDto[];
  unreadCount: number;
}

// ---------- §12 Attribution ----------

export interface AttributionRowDto {
  id: Id;
  sourceKey: string;
  factor: FactorCode | null;
  reason: ReasonCode | null;
  kind: 'TIME_LOST' | 'PLAN_CHANGE' | 'GAP';
  label: string;
  party: Party;
  minutes: Minutes;
  status: 'LIVE' | 'FINAL';
  originalParty: Party | null;
  overrideNote: string | null;
  overriddenBy: { id: Id; name: string } | null;
  overriddenAt: ISODateTime | null;
}

export interface AttributionResponse {
  shipmentId: Id;
  status: 'LIVE' | 'FINAL';
  delayMinutes: Minutes | null;
  totalsByParty: Record<Party, Minutes>;
  rows: AttributionRowDto[];
  countsAgainstTransporter: boolean | null;
  ruleText: string;
}

export interface AttributionOverrideRequest {
  attributionId: Id;
  newParty: Party;
  note: string;
}

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

export interface AuditItem {
  id: Id;
  actor: { id: Id; name: string; role: Role } | null;
  action: string;
  entityType: string;
  entityId: Id | null;
  simTime: ISODateTime | null;
  createdAt: ISODateTime;
  data: Record<string, unknown>;
}

export interface AuditResponse {
  items: AuditItem[];
}

export interface AuditQuery {
  shipmentId?: Id;
  entityType?: string;
  entityId?: Id;
  limit?: number;
}

// ---------- §14a Reference data ----------

export interface ReferenceResponse {
  lanes: { id: Id; code: string; name: string; customerId: Id }[];
  routes: { id: Id; code: string; laneId: Id; name: string; isPrimary: boolean; segments: Segment[] }[];
  segments: { segmentCode: string; name: string; routeCodes: string[] }[];
  transporters: { id: Id; code: string; name: string; fleetSize: number; isSmall: boolean }[];
  customers: { id: Id; code: string; name: string; city: string }[];
  trucks: {
    id: Id;
    code: string;
    transporterId: Id;
    status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE';
    locationLabel: string;
    hasDefaultDriver: boolean;
  }[];
}
