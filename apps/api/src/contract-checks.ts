/**
 * Enum drift check (architecture §8.3, task 2.4).
 *
 * `schema.prisma` is the source of truth; `@routepulse/shared` mirrors its enums for the browser.
 * 1. Compile time: every shared union must equal the Prisma-generated union exactly.
 *    `npm run typecheck` fails on any drift.
 * 2. Run time: `ENUM_PAIRS` lets a unit test compare the shared value arrays with the Prisma
 *    enum objects, including order (tests/unit/enumDrift.test.ts).
 */
import * as shared from '@routepulse/shared';
import * as prisma from './generated/prisma/enums.js';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type EnumDriftChecks = [
  Assert<Equals<shared.Role, prisma.Role>>,
  Assert<Equals<shared.Milestone, prisma.Milestone>>,
  Assert<Equals<shared.RiskLevel, prisma.RiskLevel>>,
  Assert<Equals<shared.Confidence, prisma.Confidence>>,
  Assert<Equals<shared.Party, prisma.Party>>,
  Assert<Equals<shared.FactorCode, prisma.FactorCode>>,
  Assert<Equals<shared.ReasonCode, prisma.ReasonCode>>,
  Assert<Equals<shared.EventType, prisma.EventType>>,
  Assert<Equals<shared.EventSource, prisma.EventSource>>,
  Assert<Equals<shared.DisruptionKind, prisma.DisruptionKind>>,
  Assert<Equals<shared.DisruptionOrigin, prisma.DisruptionOrigin>>,
  Assert<Equals<shared.ReportStatus, prisma.ReportStatus>>,
  Assert<Equals<shared.AlertStatus, prisma.AlertStatus>>,
  Assert<Equals<shared.CustomerResponse, prisma.CustomerResponse>>,
  Assert<Equals<shared.RecoveryKind, prisma.RecoveryKind>>,
  Assert<Equals<shared.OptionStatus, prisma.OptionStatus>>,
  Assert<Equals<shared.Audience, prisma.Audience>>,
  Assert<Equals<shared.NotificationKind, prisma.NotificationKind>>,
  Assert<Equals<shared.TruckStatus, prisma.TruckStatus>>,
  Assert<Equals<shared.AttributionStatus, prisma.AttributionStatus>>,
  Assert<Equals<shared.AttributionKind, prisma.AttributionKind>>,
  Assert<Equals<shared.SnapshotTrigger, prisma.SnapshotTrigger>>,
];

/** Shared value array ↔ Prisma enum object, for the runtime order check. */
export const ENUM_PAIRS: ReadonlyArray<readonly [name: string, sharedValues: readonly string[], prismaEnum: Record<string, string>]> = [
  ['Role', shared.ROLES, prisma.Role],
  ['Milestone', shared.MILESTONES, prisma.Milestone],
  ['RiskLevel', shared.RISK_LEVELS, prisma.RiskLevel],
  ['Confidence', shared.CONFIDENCES, prisma.Confidence],
  ['Party', shared.PARTIES, prisma.Party],
  ['FactorCode', shared.FACTOR_CODES, prisma.FactorCode],
  ['ReasonCode', shared.REASON_CODES, prisma.ReasonCode],
  ['EventType', shared.EVENT_TYPES, prisma.EventType],
  ['EventSource', shared.EVENT_SOURCES, prisma.EventSource],
  ['DisruptionKind', shared.DISRUPTION_KINDS, prisma.DisruptionKind],
  ['DisruptionOrigin', shared.DISRUPTION_ORIGINS, prisma.DisruptionOrigin],
  ['ReportStatus', shared.REPORT_STATUSES, prisma.ReportStatus],
  ['AlertStatus', shared.ALERT_STATUSES, prisma.AlertStatus],
  ['CustomerResponse', shared.CUSTOMER_RESPONSES, prisma.CustomerResponse],
  ['RecoveryKind', shared.RECOVERY_KINDS, prisma.RecoveryKind],
  ['OptionStatus', shared.OPTION_STATUSES, prisma.OptionStatus],
  ['Audience', shared.AUDIENCES, prisma.Audience],
  ['NotificationKind', shared.NOTIFICATION_KINDS, prisma.NotificationKind],
  ['TruckStatus', shared.TRUCK_STATUSES, prisma.TruckStatus],
  ['AttributionStatus', shared.ATTRIBUTION_STATUSES, prisma.AttributionStatus],
  ['AttributionKind', shared.ATTRIBUTION_KINDS, prisma.AttributionKind],
  ['SnapshotTrigger', shared.SNAPSHOT_TRIGGERS, prisma.SnapshotTrigger],
];
