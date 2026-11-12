import type { EtaExplanationCoordinator, EtaSummaryCustomer } from '@routepulse/shared';
import type { EtaResult } from '../engines/eta.js';

const iso = (s: number) => new Date(s * 1000).toISOString();

/** Coordinator view: full four-term explanation with parties and factor codes. */
export function toEtaCoordinator(r: EtaResult): EtaExplanationCoordinator {
  return {
    view: 'coordinator',
    shipmentId: r.shipmentId,
    simTime: iso(r.simTimeS),
    ruleVersion: r.ruleVersion,
    plannedArrivalAt: iso(r.plannedArrivalS),
    projectedRoadArrivalAt: iso(r.projectedRoadArrivalS),
    predictedArrivalAt: iso(r.predictedArrivalS),
    etaLowAt: iso(r.etaLowS),
    etaHighAt: iso(r.etaHighS),
    receivingWindow: {
      opensAt: iso(r.receivingWindow.opensS),
      closesAt: iso(r.receivingWindow.closesS),
      overrideEndAt: r.receivingWindow.overrideEndS === null ? null : iso(r.receivingWindow.overrideEndS),
    },
    promisedBy: iso(r.promisedByS),
    slackMinutes: r.slackMinutes,
    level: r.level,
    score: r.score,
    confidence: r.confidence,
    confidenceReason: r.confidenceReason,
    summary: r.summary,
    factors: r.factors.map((f) => ({ ...f, split: f.split ? f.split.map((p) => ({ ...p })) : null })),
    totals: { ...r.totals },
    identityHolds: r.identityHolds,
    isRuleBased: true,
  };
}

/** Customer view: explicit field picks only — no parties, no factor codes, no driver identity (AC-M1.6). */
export function toEtaCustomer(r: EtaResult): EtaSummaryCustomer {
  return {
    view: 'customer',
    shipmentId: r.shipmentId,
    predictedArrivalAt: iso(r.predictedArrivalS),
    etaLowAt: iso(r.etaLowS),
    etaHighAt: iso(r.etaHighS),
    promisedBy: iso(r.promisedByS),
    level: r.level,
    plainReason: r.plainReason,
    isRuleBased: true,
  };
}
