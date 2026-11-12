/**
 * Enum values shared by the API and the web app.
 *
 * Source of truth: `apps/api/prisma/schema.prisma` (decision D9). These lists MIRROR the Prisma
 * enums so the browser never imports `@prisma/client`. The API asserts at compile time and in a
 * unit test that every list here equals the Prisma enum (see apps/api/src/contract-checks.ts).
 * When you change an enum in schema.prisma, change it here in the same commit.
 */

export const ROLES = ['COORDINATOR', 'CUSTOMER', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

export const MILESTONES = [
  'ORDER_CONFIRMED',
  'TRUCK_ASSIGNED',
  'AT_GATE',
  'LOADING',
  'GATE_OUT',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
] as const;
export type Milestone = (typeof MILESTONES)[number];

export const RISK_LEVELS = ['ON_TRACK', 'WATCH', 'AT_RISK', 'LATE'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const PARTIES = ['PLANT', 'TRANSPORTER', 'CUSTOMER', 'EXTERNAL', 'UNATTRIBUTED'] as const;
export type Party = (typeof PARTIES)[number];

export const FACTOR_CODES = ['GATE', 'HIST', 'DISR', 'RPT', 'WIN'] as const;
export type FactorCode = (typeof FACTOR_CODES)[number];

export const REASON_CODES = [
  'BREAKDOWN',
  'PLANT_GATE_WAIT',
  'TRAFFIC',
  'ROAD_CLOSED',
  'HEAVY_RAIN',
  'DOCUMENTS',
  'UNLOADING_WAIT',
  'OTHER',
  'TRANSPORTER_PACE',
  'RECEIVING_WINDOW',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** Reasons a driver may pick or confirm (spec §5.8). System causes are excluded. */
export const DRIVER_REASON_CODES = [
  'BREAKDOWN',
  'PLANT_GATE_WAIT',
  'TRAFFIC',
  'ROAD_CLOSED',
  'HEAVY_RAIN',
  'DOCUMENTS',
  'UNLOADING_WAIT',
  'OTHER',
] as const satisfies readonly ReasonCode[];
export type DriverReasonCode = (typeof DRIVER_REASON_CODES)[number];

export const EVENT_TYPES = [
  'MILESTONE',
  'DRIVER_REPORT',
  'REPORT_REVIEWED',
  'DISRUPTION_STARTED',
  'DISRUPTION_ENDED',
  'ALERT_OPENED',
  'ALERT_RESOLVED',
  'CUSTOMER_NOTIFIED',
  'CUSTOMER_RESPONDED',
  'RECOVERY_CHOSEN',
  'RECOVERY_APPLIED',
  'ATTRIBUTION_OVERRIDDEN',
  'PHYSICAL_ARRIVAL',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_SOURCES = ['DRIVER', 'COORDINATOR', 'SIMULATION', 'SEED', 'SYSTEM'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const DISRUPTION_KINDS = [
  'WEATHER_SLOWDOWN',
  'ROAD_CLOSURE',
  'GATE_CONGESTION',
  'TRUCK_BREAKDOWN',
] as const;
export type DisruptionKind = (typeof DISRUPTION_KINDS)[number];

export const DISRUPTION_ORIGINS = ['SEED', 'SIMULATOR'] as const;
export type DisruptionOrigin = (typeof DISRUPTION_ORIGINS)[number];

export const REPORT_STATUSES = ['PENDING_REVIEW', 'CONFIRMED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACTION_CHOSEN', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const CUSTOMER_RESPONSES = ['ACCEPT_PROPOSAL', 'PREFER_TO_WAIT', 'REQUEST_CALL'] as const;
export type CustomerResponse = (typeof CUSTOMER_RESPONSES)[number];

export const RECOVERY_KINDS = [
  'REROUTE',
  'SPLIT',
  'REPLACEMENT_TRUCK',
  'NEW_WINDOW',
  'NOTIFY_ONLY',
] as const;
export type RecoveryKind = (typeof RECOVERY_KINDS)[number];

export const OPTION_STATUSES = ['PROPOSED', 'AWAITING_CUSTOMER', 'CHOSEN', 'SUPERSEDED'] as const;
export type OptionStatus = (typeof OPTION_STATUSES)[number];

export const AUDIENCES = ['COORDINATOR', 'CUSTOMER'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const NOTIFICATION_KINDS = [
  'AT_RISK',
  'AT_RISK_CUSTOMER',
  'RECOVERY_CONFIRMED',
  'PLAN_UPDATED',
  'REPORT_NEEDS_REVIEW',
  'CUSTOMER_RESPONDED',
  'BACK_ON_TRACK',
  'DELIVERED',
  'ARRIVED_LATE',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TRUCK_STATUSES = ['AVAILABLE', 'ASSIGNED', 'MAINTENANCE'] as const;
export type TruckStatus = (typeof TRUCK_STATUSES)[number];

export const ATTRIBUTION_STATUSES = ['LIVE', 'FINAL'] as const;
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number];

export const ATTRIBUTION_KINDS = ['TIME_LOST', 'PLAN_CHANGE', 'GAP'] as const;
export type AttributionKind = (typeof ATTRIBUTION_KINDS)[number];

export const SNAPSHOT_TRIGGERS = [
  'STEP',
  'MILESTONE',
  'REPORT',
  'REVIEW',
  'DISRUPTION',
  'RECOVERY',
  'SEED',
] as const;
export type SnapshotTrigger = (typeof SNAPSHOT_TRIGGERS)[number];
