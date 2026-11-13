import type {
  AlertDtoCoordinator,
  AttributionResponse,
  CustomerResponse,
  DriverReportDto,
  EtaExplanationCoordinator,
  Factor,
  Party,
  ReasonCode,
  RecoveryKind,
  RecoveryOptionDto,
  ReplaySnapshot,
  ReportStatus,
  RiskLevel,
  ShipmentDetailCoordinator,
} from '../../api/contract';

/**
 * Shipment Decision Brief (coordinator): what is happening, why, what was decided, and its impact —
 * assembled ONLY from existing API responses (#15 detail, #18 ETA, #34 attribution, #24 driver
 * reports, #26 alerts, #29 options, #19 replay snapshots). Nothing is estimated or recomputed here:
 * every number is a field the backend returned; when a value is not available the section says so.
 */

export interface BriefContributor {
  label: string;
  minutes: number;
  /** null for the knock-on wait (WIN), which carries a party split instead. */
  party: Party | null;
  /** INCURRED / PLAN_CHANGE / EXPECTED for a live estimate; FINAL for an arrived shipment's ledger. */
  phase: Factor['phase'] | 'FINAL';
  pendingReview: boolean;
}

export interface DecisionBriefModel {
  status: {
    code: string;
    level: RiskLevel | null;
    arrived: boolean;
    etaAt: string | null;
    etaLowAt: string | null;
    etaHighAt: string | null;
    promisedBy: string;
    /** Backend slack (promise − ETA); null when not available. */
    slackMinutes: number | null;
    arrivedAt: string | null;
    onTime: boolean | null;
    delayMinutes: number | null;
  };
  why: {
    source: 'ESTIMATE' | 'FINAL_LEDGER' | 'NONE';
    top: BriefContributor[];
    /** Factors not shown in `top`. */
    moreCount: number;
    totals: { incurred: number; planChange: number; expected: number } | null;
  };
  incident: {
    reason: ReasonCode;
    driverPicked: ReasonCode | null;
    text: string | null;
    reportedAt: string;
    reporterName: string;
    estimatedMinutes: number | null;
    appliedMinutes: number;
    status: ReportStatus;
    changedFrom: { reason: ReasonCode | null; party: Party | null } | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    otherReports: number;
  } | null;
  recovery: {
    state: 'CHOSEN' | 'PROPOSED' | 'NONE';
    kind: RecoveryKind | null;
    title: string | null;
    minutesSavedVsNotify: number | null;
    extraCostInr: number | null;
    costNote: string | null;
    newEtaAt: string | null;
    meetsPromise: boolean | null;
    decidedBy: string | null;
    decidedAt: string | null;
  };
  customer: {
    notifiedAt: string | null;
    response: CustomerResponse | null;
    respondedAt: string | null;
  };
  /** Only when a RECOVERY snapshot and an earlier snapshot exist (#19); otherwise null (omitted). */
  etaChange: {
    beforeAt: string;
    beforeRecordedAt: string;
    afterAt: string;
    decisionRecordedAt: string;
    /** after − before, minutes (negative = earlier). */
    deltaMinutes: number;
  } | null;
}

const TOP_N = 4;

function minutesBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
}

export function buildDecisionBrief(input: {
  shipment: ShipmentDetailCoordinator;
  eta: EtaExplanationCoordinator | null;
  attribution: AttributionResponse | null;
  reports: DriverReportDto[];
  alerts: AlertDtoCoordinator[];
  options: RecoveryOptionDto[];
  snapshots: ReplaySnapshot[] | null;
}): DecisionBriefModel {
  const { shipment: s, eta, attribution, reports, alerts, options, snapshots } = input;
  const arrived = !!s.arrivedAt;

  // ---- A. status: the backend's ETA, promise and slack (live) or actual arrival (arrived) ----
  const status: DecisionBriefModel['status'] = {
    code: s.code,
    level: s.riskLevel,
    arrived,
    etaAt: eta?.predictedArrivalAt ?? s.etaAt,
    etaLowAt: eta?.etaLowAt ?? s.etaLowAt,
    etaHighAt: eta?.etaHighAt ?? s.etaHighAt,
    promisedBy: s.promisedBy,
    slackMinutes: eta?.slackMinutes ?? s.slackMinutes,
    arrivedAt: s.arrivedAt,
    onTime: s.onTime,
    delayMinutes: s.delayMinutes,
  };

  // ---- B. why: live estimate factors (#18), or the final attribution ledger (#34) once arrived ----
  let why: DecisionBriefModel['why'] = { source: 'NONE', top: [], moreCount: 0, totals: null };
  if (!arrived && eta) {
    const all: BriefContributor[] = eta.factors
      .filter((f) => f.minutes !== 0)
      .map((f) => ({ label: f.label, minutes: f.minutes, party: f.party, phase: f.phase, pendingReview: f.reviewStatus === 'PENDING_REVIEW' }));
    const top = [...all].sort((a, b) => Math.abs(b.minutes) - Math.abs(a.minutes)).slice(0, TOP_N);
    why = {
      source: 'ESTIMATE',
      top,
      moreCount: all.length - top.length,
      totals: { incurred: eta.totals.incurredMinutes, planChange: eta.totals.planChangeMinutes, expected: eta.totals.expectedMinutes },
    };
  } else if (arrived && attribution && attribution.rows.length > 0) {
    const all: BriefContributor[] = attribution.rows
      .filter((r) => r.minutes !== 0)
      .map((r) => ({ label: r.label, minutes: r.minutes, party: r.party, phase: 'FINAL' as const, pendingReview: false }));
    const top = [...all].sort((a, b) => b.minutes - a.minutes).slice(0, TOP_N);
    why = { source: 'FINAL_LEDGER', top, moreCount: all.length - top.length, totals: null };
  }

  // ---- C. incident: the latest driver report for this shipment (#24) ----
  const sortedReports = [...reports].sort((a, b) => Date.parse(b.simTime) - Date.parse(a.simTime));
  const r = sortedReports[0];
  const incident: DecisionBriefModel['incident'] = r
    ? {
        reason: r.reason,
        driverPicked: r.chipReason,
        text: r.text,
        reportedAt: r.simTime,
        reporterName: r.reporter.name,
        estimatedMinutes: r.estimatedMinutes,
        appliedMinutes: r.appliedMinutes,
        status: r.status,
        changedFrom: r.originalReason || r.originalParty ? { reason: r.originalReason, party: r.originalParty } : null,
        reviewedBy: r.reviewedBy?.name ?? null,
        reviewedAt: r.reviewedAt,
        otherReports: sortedReports.length - 1,
      }
    : null;

  // ---- D. recovery: chosen option with who/when from the alert (#26); else a CHOSEN option (#29);
  //      else a proposal awaiting the customer. Never infer a decision that was not recorded. ----
  const byNewest = [...alerts].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const chosenAlert = byNewest.find((a) => a.chosenOption);
  const chosenOption = chosenAlert?.chosenOption ?? options.find((o) => o.status === 'CHOSEN') ?? null;
  const proposedAlert = !chosenOption ? byNewest.find((a) => a.proposedOption) : undefined;
  const opt = chosenOption ?? proposedAlert?.proposedOption ?? null;
  const recovery: DecisionBriefModel['recovery'] = {
    state: chosenOption ? 'CHOSEN' : opt ? 'PROPOSED' : 'NONE',
    kind: opt?.kind ?? null,
    title: opt?.title ?? null,
    minutesSavedVsNotify: opt ? opt.minutesSavedVsNotify : null,
    extraCostInr: opt ? opt.extraCostInr : null,
    costNote: opt?.costNote ?? null,
    newEtaAt: opt?.newEtaAt ?? null,
    meetsPromise: opt ? opt.meetsPromise : null,
    decidedBy: chosenOption && chosenAlert ? (chosenAlert.chosenBy?.name ?? null) : null,
    decidedAt: chosenOption && chosenAlert ? chosenAlert.chosenAt : null,
  };

  // ---- E. customer communication: what the backend recorded (no delivery / read status exists) ----
  const respondingAlert = byNewest.find((a) => a.customerResponse);
  const customer: DecisionBriefModel['customer'] = {
    notifiedAt: s.customerNotifiedAt,
    response: s.latestCustomerResponse?.response ?? respondingAlert?.customerResponse ?? null,
    respondedAt: s.latestCustomerResponse?.at ?? respondingAlert?.customerRespondedAt ?? null,
  };

  // ---- ETA before / after the recovery decision: recorded snapshots only (#19) ----
  let etaChange: DecisionBriefModel['etaChange'] = null;
  if (snapshots && chosenOption) {
    const ordered = [...snapshots].sort((a, b) => Date.parse(a.simTime) - Date.parse(b.simTime));
    let i = -1;
    for (let k = ordered.length - 1; k >= 0; k--) {
      if (ordered[k]!.trigger === 'RECOVERY') {
        i = k;
        break;
      }
    }
    if (i > 0) {
      const after = ordered[i]!;
      const before = ordered[i - 1]!;
      etaChange = {
        beforeAt: before.predictedArrivalAt,
        beforeRecordedAt: before.simTime,
        afterAt: after.predictedArrivalAt,
        decisionRecordedAt: after.simTime,
        deltaMinutes: minutesBetween(before.predictedArrivalAt, after.predictedArrivalAt),
      };
    }
  }

  return { status, why, incident, recovery, customer, etaChange };
}
