import { PARTIES, type DriverReasonCode, type Party } from '@routepulse/shared';
import { largestRemainder } from './rounding.js';
import { roundHalfUp } from './risk.js';

/**
 * Delay attribution rules (spec §5.8–§5.9, engine doc §4.5, architecture §10.4). Pure.
 * Parties: PLANT · TRANSPORTER · CUSTOMER · EXTERNAL · UNATTRIBUTED. No other categories, no weights.
 */

/** Reason defaults (spec §5.8 table; engine doc §1). Minutes are [A] demo values. */
export const REASON_DEFAULTS: Readonly<Record<DriverReasonCode, { minutes: number; party: Party | 'CONDITIONAL' }>> = {
  BREAKDOWN: { minutes: 180, party: 'TRANSPORTER' },
  PLANT_GATE_WAIT: { minutes: 90, party: 'PLANT' },
  TRAFFIC: { minutes: 60, party: 'EXTERNAL' },
  ROAD_CLOSED: { minutes: 120, party: 'EXTERNAL' },
  HEAVY_RAIN: { minutes: 60, party: 'EXTERNAL' },
  DOCUMENTS: { minutes: 60, party: 'CONDITIONAL' },
  UNLOADING_WAIT: { minutes: 90, party: 'CUSTOMER' },
  OTHER: { minutes: 60, party: 'UNATTRIBUTED' },
};

/**
 * Default party for a report. DOCUMENTS: "Plant if documents missing at dispatch, else External"
 * — interpreted as: reported before the truck left the gate → PLANT; after gate-out → EXTERNAL.
 */
export function defaultParty(reason: DriverReasonCode, departed: boolean): Party {
  const p = REASON_DEFAULTS[reason].party;
  if (p !== 'CONDITIONAL') return p;
  return departed ? 'EXTERNAL' : 'PLANT';
}

export const BUT_FOR_RULE_TEXT =
  "Counts against the transporter only if the shipment would have been on time without the transporter's minutes.";

/**
 * GAP (UNATTRIBUTED) seconds at finalisation (spec §5.9: "any remaining gap between actual and
 * baseline is Unattributed"): (arrivedAt − plannedArrivalAt) − Σ TIME_LOST and PLAN_CHANGE
 * seconds. Normally 0 in the simulation. A negative value means the ledger holds more than the
 * real delay — an invariant violation that must never be hidden.
 */
export function gapSeconds(arrivedS: number, plannedArrivalS: number, attributedSeconds: number): number {
  const gap = arrivedS - plannedArrivalS - attributedSeconds;
  if (gap < 0) throw new Error(`attribution exceeds the real delay by ${-gap} s`);
  return gap;
}

/**
 * Whole minutes per row: the shipment total is round(Σ seconds / 60) (halves up), split over the
 * rows by largest remainder so the displayed rows always add up to the total (API §12).
 */
export function rowMinutes(seconds: readonly number[]): number[] {
  const total = roundHalfUp(seconds.reduce((a, b) => a + b, 0) / 60);
  if (total === 0) return seconds.map(() => 0);
  return largestRemainder(seconds, total);
}

export function totalsByParty(rows: readonly { party: Party; minutes: number }[]): Record<Party, number> {
  const out = Object.fromEntries(PARTIES.map((p) => [p, 0])) as Record<Party, number>;
  for (const r of rows) out[r.party] += r.minutes;
  return out;
}

/**
 * But-for rule (spec §5.9, engine doc §4.5): a late shipment counts against the transporter only
 * if it would have been on time without the transporter-attributed minutes (TIME_LOST and
 * PLAN_CHANGE, incl. its WIN share): delayMinutes > 0 && delayMinutes − transporterMinutes ≤ 0.
 */
export function countsAgainstTransporter(delayMinutes: number, transporterMinutes: number): boolean {
  return delayMinutes > 0 && delayMinutes - transporterMinutes <= 0;
}

export interface ArrivedShipmentOutcome {
  transporterId: string;
  onTime: boolean;
  countsAgainstTransporter: boolean;
}

/**
 * Raw vs fair on-time per transporter (spec §5.10, engine doc §10 Example 4). Raw = arrived on
 * time ÷ arrived. Fair = shipments that do not count against the transporter ÷ arrived (a late
 * shipment that would still have been late without the transporter's minutes is not held against it).
 */
export function onTimeByTransporter(outcomes: readonly ArrivedShipmentOutcome[]): Map<string, { shipments: number; rawOnTime: number; fairOnTime: number }> {
  const out = new Map<string, { shipments: number; rawOnTime: number; fairOnTime: number }>();
  for (const o of outcomes) {
    const e = out.get(o.transporterId) ?? { shipments: 0, rawOnTime: 0, fairOnTime: 0 };
    e.shipments += 1;
    if (o.onTime) e.rawOnTime += 1;
    if (!o.countsAgainstTransporter) e.fairOnTime += 1;
    out.set(o.transporterId, e);
  }
  return out;
}
