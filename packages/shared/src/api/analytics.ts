import type { Party, ReasonCode } from '../enums.js';
import type { Id, ISODateTime, Minutes, Pct } from './common.js';
import type { PartyMinutes } from './eta.js';

/** API spec §13 (#36). Every number comes from one filtered set of arrived shipments (arrival-based, L1). */

export const DASHBOARD_PERIODS = ['7d', '30d', '60d'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export interface DashboardQuery {
  /** Default '30d'; the window ends at the current (settled) simulation time. */
  period?: DashboardPeriod;
  laneId?: Id;
  transporterId?: Id;
}

export interface DashboardResponse {
  filter: { period: DashboardPeriod; from: ISODateTime; to: ISODateTime; laneId: Id | null; transporterId: Id | null };
  generatedAtSim: ISODateTime;
  /** Size of the filtered set: shipments whose arrivedAt is in the window. */
  arrivedCount: number;
  kpis: {
    /** Percent with one decimal; null when there is nothing to divide by. */
    onTimePct: Pct;
    lateCount: number;
    medianDelayMinutesOfLate: Minutes | null;
    /** promisedBy − firstAtRiskAt, shipments that reached AT_RISK. */
    medianWarningLeadMinutes: Minutes | null;
    /** Late-or-at-risk with customerNotifiedAt < promisedBy. */
    proactiveNoticeRatePct: Pct;
    /** Reached AT_RISK, action chosen, arrived on time. */
    recoveredPct: Pct;
    renegotiatedCount: number;
  };
  onTimeByLane: { laneId: Id; laneName: string; delivered: number; onTime: number; onTimePct: Pct }[];
  onTimeByTransporter: { transporterId: Id; name: string; isSmall: boolean; delivered: number; onTime: number; onTimePct: Pct }[];
  /** Calendar weeks, Monday 00:00 IST; first/last week may be partial. */
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
    /** On time vs agreed promise. */
    rawOnTimePct: Pct;
    /** Late counts only if the but-for rule says the transporter caused it. */
    fairOnTimePct: Pct;
    /** fair − raw */
    gapPct: Pct;
    medianDelayMinutesOfLate: Minutes | null;
    topCause: { party: Party; reason: ReasonCode | null } | null;
  }[];
  definitions: Record<'onTime' | 'fairOnTime' | 'warningLead' | 'proactiveNotice' | 'recovered', string>;
  dataNote: string;
}
