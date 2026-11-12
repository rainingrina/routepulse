import type { Confidence, FactorCode, Party, ReasonCode, ReportStatus, RiskLevel } from '../enums.js';
import type { Id, ISODateTime, Minutes } from './common.js';

/** API spec §2 and §8. ETA = predicted arrival at the receiving gate (L1). Rule-based, not learned. */

export const FACTOR_PHASES = ['INCURRED', 'PLAN_CHANGE', 'EXPECTED'] as const;
/** "So far" · "Plan change" (reroute) · "Expected". */
export type FactorPhase = (typeof FACTOR_PHASES)[number];

export interface PartyMinutes {
  party: Party;
  minutes: Minutes;
}

/** One bar of the ETA waterfall. */
export interface Factor {
  code: FactorCode;
  phase: FactorPhase;
  /** Integer, ≥ 0. Bars of one phase sum exactly to that phase's total (largest-remainder rounding). */
  minutes: Minutes;
  /** null only for WIN (see split). */
  party: Party | null;
  /** WIN knock-on split; null otherwise. */
  split: PartyMinutes[] | null;
  reason: ReasonCode | null;
  label: string;
  detail: string;
  sourceRef: { type: 'DISRUPTION' | 'DRIVER_REPORT'; id: Id } | null;
  /** RPT only: 'PENDING_REVIEW' shows "Pending coordinator review". */
  reviewStatus: ReportStatus | null;
}

/** Coordinator view of the ETA (M3, X2). */
export interface EtaExplanationCoordinator {
  view: 'coordinator';
  shipmentId: Id;
  simTime: ISODateTime;
  ruleVersion: string;
  plannedArrivalAt: ISODateTime;
  /** When the truck is projected to reach the customer gate (before any receiving-window wait). */
  projectedRoadArrivalAt: ISODateTime;
  predictedArrivalAt: ISODateTime;
  etaLowAt: ISODateTime;
  etaHighAt: ISODateTime;
  /** Applicable window for the projected arrival day (L4). */
  receivingWindow: { opensAt: ISODateTime; closesAt: ISODateTime; overrideEndAt: ISODateTime | null };
  promisedBy: ISODateTime;
  slackMinutes: Minutes;
  level: RiskLevel;
  score: number;
  confidence: Confidence;
  confidenceReason: string;
  summary: string;
  /** Ordered GATE, HIST, DISR, RPT, WIN; INCURRED before PLAN_CHANGE before EXPECTED. */
  factors: Factor[];
  /** I, P, E (architecture §10.2). */
  totals: { incurredMinutes: Minutes; planChangeMinutes: Minutes; expectedMinutes: Minutes };
  /** plannedArrival + Σ minutes == predictedArrival (AC-M3.2). */
  identityHolds: boolean;
  isRuleBased: true;
}

/** Customer view of the ETA (no parties, no factor codes, no driver identity). */
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

/** GET /api/shipments/:shipmentId/eta (#18). */
export interface EtaResponse {
  eta: EtaExplanationCoordinator | EtaSummaryCustomer;
}

/** GET /api/engine/rules (#20). */
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
