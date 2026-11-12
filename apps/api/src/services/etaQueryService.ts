import type { EngineRulesResponse } from '@routepulse/shared';
import { RISK_THRESHOLDS, RULE_VERSION } from '@routepulse/shared';
import { shipmentScope } from '../auth/policies.js';
import type { AuthUser } from '../auth/types.js';
import type { EtaResult } from '../engines/eta.js';
import { DomainError, notFound } from '../errors/domainError.js';
import type { SimulationService } from './simulationService.js';
import { computeEtas } from './etaService.js';

/**
 * #18 ETA read (API §8.1). Read-only: recomputes, at the last SETTLED time, exactly what the
 * pipeline computed and cached at that time (same pure functions, same inputs) — it never writes
 * and never advances the clock. Out-of-scope ids → 404; delivered → 409.
 */
export async function getEta(sim: SimulationService, user: AuthUser, shipmentId: string): Promise<EtaResult> {
  return sim.readSettled(async (db, world, settledS) => {
    const row = await db.shipment.findFirst({
      where: { AND: [{ id: shipmentId }, shipmentScope(user)] },
      select: { id: true, currentMilestone: true },
    });
    if (!row) throw notFound();
    if (row.currentMilestone === 'DELIVERED') {
      throw new DomainError('INVALID_TRANSITION', 'This shipment is delivered; see the shipment detail for its outcome.');
    }
    const r = (await computeEtas(db, world, settledS)).get(shipmentId);
    if (!r) throw new DomainError('CONFLICT', 'No estimate is available for this shipment yet (no truck assigned).');
    return r;
  });
}

/** #20 The rule set, stated in plain words (AC-M3.8). Mirrors engines/eta.ts, risk.ts and the engine doc. */
export function engineRules(): EngineRulesResponse {
  return {
    ruleVersion: RULE_VERSION,
    statement: 'Rule-based estimate. Not a trained model. Weights are set by hand.',
    identity: 'Predicted arrival = planned arrival + delay so far + plan change + expected delay',
    factors: [
      { code: 'GATE', name: 'Plant gate', rule: 'Queue and loading time after the planned departure (projected: first-come-first-served over the loading bays)', party: 'Plant' },
      { code: 'HIST', name: 'Transporter pace', rule: 'Pace from delivered history per transporter and lane, applied to the remaining baseline time only; truck late at the gate', party: 'Transporter' },
      { code: 'DISR', name: 'Disruption', rule: 'Slowdown: Δ·s of each slowed interval; closure or breakdown: the whole hold. A stop beats a slowdown; the latest-ending stop and the largest slowdown win', party: "The disruption's party" },
      { code: 'RPT', name: 'Driver report', rule: 'The reported stop until it ends', party: "The report's party (reviewed by the coordinator)" },
      { code: 'WIN', name: 'Receiving window', rule: 'Wait from the road arrival to the eligible check-in time, split by the other parties’ minutes; never the customer by default', party: 'Knock-on split' },
    ],
    thresholds: { onTrackMinSlack: RISK_THRESHOLDS.onTrackMinSlack, watchMinSlack: RISK_THRESHOLDS.watchMinSlack },
    rangeRule: '± (5% of minutes to the predicted arrival + 30 if the last update is older than 2 h + 20 per pending driver report), rounded to the nearest 5 minutes',
    confidenceRule: 'High: updated within 1 h and no pending report · Medium: 1–3 h, or a pending report · Low: older than 3 h or no update yet',
    scoreRule: 'clamp(round(50 − slack ÷ 6), 0, 100); used for sorting only, never a probability',
    reasonDefaults: [
      { reason: 'BREAKDOWN', party: 'TRANSPORTER', minutes: 180 },
      { reason: 'PLANT_GATE_WAIT', party: 'PLANT', minutes: 90 },
      { reason: 'TRAFFIC', party: 'EXTERNAL', minutes: 60 },
      { reason: 'ROAD_CLOSED', party: 'EXTERNAL', minutes: 120 },
      { reason: 'HEAVY_RAIN', party: 'EXTERNAL', minutes: 60 },
      { reason: 'DOCUMENTS', party: 'CONDITIONAL', minutes: 60 },
      { reason: 'UNLOADING_WAIT', party: 'CUSTOMER', minutes: 90 },
      { reason: 'OTHER', party: 'UNATTRIBUTED', minutes: 60 },
    ],
    suggestionRule:
      'Among feasible options that meet the current promise (excluding new window and notify only), the lowest cost; ties → earliest ETA. If none meets the promise, the feasible option with the smallest delay. Every action needs the coordinator’s confirmation.',
    co2e: { enabled: false, method: null, source: null },
  };
}
