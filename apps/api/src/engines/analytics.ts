import { PARTIES, SMALL_FLEET_MAX, type AttributionKind, type DashboardResponse, type Party, type PartyMinutes, type ReasonCode } from '@routepulse/shared';
import { IST_OFFSET_MINUTES } from '../config/engine.js';
import { BUT_FOR_RULE_TEXT, countsAgainstTransporter, rowMinutes } from './attribution.js';
import { largestRemainder } from './rounding.js';
import { roundHalfUp } from './risk.js';

/**
 * Dashboard analytics (API §13, spec §5.9–§5.10 and §7). Pure: one filtered set of arrived
 * shipments in, every dashboard number out, so charts never disagree (AC-M5.3). No database,
 * no clock. Rules decided 2026-11-12 (M10):
 *  - cause charts sum ALL attributed minutes of the set (delay vs plan, incl. on-time shipments and
 *    the receiving-window knock-on split); GAP rows count under UNATTRIBUTED by party, not by reason;
 *  - weekly trend uses calendar weeks starting Monday 00:00 IST (first/last may be partial);
 *  - medians of an even count = mean of the two middle values, rounded half-up.
 */

export interface AttributionFact {
  id: string;
  kind: AttributionKind;
  reason: ReasonCode | null;
  party: Party;
  delaySeconds: number;
}

export interface ArrivedShipmentFact {
  id: string;
  laneId: string;
  laneName: string;
  transporterId: string;
  transporterName: string;
  fleetSize: number;
  arrivedS: number;
  promisedS: number;
  onTime: boolean;
  delayMinutes: number;
  firstAtRiskS: number | null;
  customerNotifiedS: number | null;
  renegotiated: boolean;
  /** A recovery option of this shipment reached CHOSEN (a NEW_WINDOW counts once accepted). */
  recoveryChosen: boolean;
  rows: AttributionFact[];
}

export const DASHBOARD_DEFINITIONS: DashboardResponse['definitions'] = {
  onTime: 'On time = arrived at the receiving gate by the agreed promise (arrivedAt ≤ promisedBy). Renegotiated shipments count against their agreed new window and are also counted separately.',
  fairOnTime: `Fair on-time: ${BUT_FOR_RULE_TEXT} Computed from the final attributed minutes.`,
  warningLead: 'Warning lead = promised time − the first time the shipment was At risk, for shipments that reached At risk (median).',
  proactiveNotice: 'Proactive notice = late or at-risk shipments whose customer was notified before the promised time ÷ all late or at-risk shipments.',
  recovered: 'Recovered = shipments that reached At risk, had a recovery action chosen and arrived on time ÷ shipments that reached At risk.',
};

export const DATA_NOTE = 'Fictional seeded data for Plant X.';

/** Percent with one decimal; null when the denominator is 0 (nothing to measure). */
export function pct(n: number, d: number): number | null {
  return d === 0 ? null : roundHalfUp((n * 1000) / d) / 10;
}

/** Median of whole minutes; even count → mean of the middle two rounded half-up; null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? (v[mid] as number) : roundHalfUp(((v[mid - 1] as number) + (v[mid] as number)) / 2);
}

/** Epoch seconds of Monday 00:00 IST of the week containing `s`. */
export function istWeekStart(s: number): number {
  const off = IST_OFFSET_MINUTES * 60;
  const localDay = Math.floor((s + off) / 86400); // days since 1970-01-01 local
  const weekday = (localDay + 3) % 7; // 1970-01-01 was a Thursday → Monday = 0
  return (localDay - weekday) * 86400 - off;
}

/** Whole minutes per row for one shipment (same rounding as the attribution endpoint). */
function shipmentRowMinutes(rows: readonly AttributionFact[]): { row: AttributionFact; minutes: number }[] {
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const mins = rowMinutes(sorted.map((r) => r.delaySeconds));
  return sorted.map((row, i) => ({ row, minutes: mins[i] ?? 0 }));
}

const zeroParties = (): Record<Party, number> => Object.fromEntries(PARTIES.map((p) => [p, 0])) as Record<Party, number>;
const toPartyMinutes = (m: Record<Party, number>): PartyMinutes[] => PARTIES.map((party) => ({ party, minutes: m[party] }));
const byName = <T extends { name: string }>(a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export type DashboardAggregate = Omit<DashboardResponse, 'filter' | 'generatedAtSim' | 'definitions' | 'dataNote'>;

export function aggregateDashboard(facts: readonly ArrivedShipmentFact[], window: { fromS: number; toS: number }): DashboardAggregate {
  const set = facts.filter((f) => f.arrivedS >= window.fromS && f.arrivedS <= window.toS);
  const minutesOf = new Map(set.map((f) => [f.id, shipmentRowMinutes(f.rows)]));

  // KPIs
  const late = set.filter((f) => !f.onTime);
  const reachedAtRisk = set.filter((f) => f.firstAtRiskS !== null);
  const lateOrAtRisk = set.filter((f) => !f.onTime || f.firstAtRiskS !== null);
  const kpis: DashboardResponse['kpis'] = {
    onTimePct: pct(set.length - late.length, set.length),
    lateCount: late.length,
    medianDelayMinutesOfLate: median(late.map((f) => f.delayMinutes)),
    medianWarningLeadMinutes: median(reachedAtRisk.map((f) => Math.floor((f.promisedS - (f.firstAtRiskS as number)) / 60))),
    proactiveNoticeRatePct: pct(lateOrAtRisk.filter((f) => f.customerNotifiedS !== null && f.customerNotifiedS < f.promisedS).length, lateOrAtRisk.length),
    recoveredPct: pct(reachedAtRisk.filter((f) => f.recoveryChosen && f.onTime).length, reachedAtRisk.length),
    renegotiatedCount: set.filter((f) => f.renegotiated).length,
  };

  // Group helpers
  const lanes = new Map<string, { name: string; ships: ArrivedShipmentFact[] }>();
  const transporters = new Map<string, { name: string; fleetSize: number; ships: ArrivedShipmentFact[] }>();
  for (const f of set) {
    const l = lanes.get(f.laneId) ?? { name: f.laneName, ships: [] };
    l.ships.push(f);
    lanes.set(f.laneId, l);
    const t = transporters.get(f.transporterId) ?? { name: f.transporterName, fleetSize: f.fleetSize, ships: [] };
    t.ships.push(f);
    transporters.set(f.transporterId, t);
  }
  const partyTotals = (ships: readonly ArrivedShipmentFact[]) => {
    const m = zeroParties();
    for (const s of ships) for (const { row, minutes } of minutesOf.get(s.id) ?? []) m[row.party] += minutes;
    return m;
  };
  const countsAgainst = (s: ArrivedShipmentFact) => {
    const tMin = (minutesOf.get(s.id) ?? []).reduce((a, { row, minutes }) => a + (row.party === 'TRANSPORTER' && row.kind !== 'GAP' ? minutes : 0), 0);
    return countsAgainstTransporter(s.delayMinutes, tMin);
  };

  const onTimeByLane = [...lanes.entries()]
    .map(([laneId, l]) => {
      const onTime = l.ships.filter((s) => s.onTime).length;
      return { laneId, laneName: l.name, name: l.name, delivered: l.ships.length, onTime, onTimePct: pct(onTime, l.ships.length) };
    })
    .sort(byName)
    .map(({ name: _n, ...r }) => r);

  const transporterRows = [...transporters.entries()].map(([transporterId, t]) => ({ transporterId, ...t })).sort(byName);
  const onTimeByTransporter = transporterRows.map((t) => {
    const onTime = t.ships.filter((s) => s.onTime).length;
    return { transporterId: t.transporterId, name: t.name, isSmall: t.fleetSize <= SMALL_FLEET_MAX, delivered: t.ships.length, onTime, onTimePct: pct(onTime, t.ships.length) };
  });

  // Weekly trend: every Monday-00:00-IST week touching the window, empty weeks included.
  const weeklyTrend: DashboardResponse['weeklyTrend'] = [];
  for (let w = istWeekStart(window.fromS); w <= window.toS; w += 7 * 86400) {
    const ships = set.filter((f) => f.arrivedS >= w && f.arrivedS < w + 7 * 86400);
    weeklyTrend.push({ weekStart: new Date(w * 1000).toISOString(), delivered: ships.length, onTimePct: pct(ships.filter((s) => s.onTime).length, ships.length) });
  }

  // Causes
  const total = partyTotals(set);
  const totalMinutes = PARTIES.reduce((a, p) => a + total[p], 0);
  const shares = totalMinutes > 0 ? largestRemainder(PARTIES.map((p) => total[p]), 1000) : null;
  const causesByParty = PARTIES.map((party, i) => ({ party, minutes: total[party], sharePct: shares ? (shares[i] as number) / 10 : null }));

  const reasonMap = new Map<string, { reason: ReasonCode; party: Party; minutes: number }>();
  for (const s of set) {
    for (const { row, minutes } of minutesOf.get(s.id) ?? []) {
      if (row.reason === null || minutes === 0) continue;
      const key = `${row.reason}|${row.party}`;
      const e = reasonMap.get(key) ?? { reason: row.reason, party: row.party, minutes: 0 };
      e.minutes += minutes;
      reasonMap.set(key, e);
    }
  }
  const causesByReason = [...reasonMap.values()].sort(
    (a, b) => b.minutes - a.minutes || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0) || PARTIES.indexOf(a.party) - PARTIES.indexOf(b.party),
  );

  const causesByLane = onTimeByLane.map((l) => ({ laneId: l.laneId, laneName: l.laneName, byParty: toPartyMinutes(partyTotals(lanes.get(l.laneId)?.ships ?? [])) }));
  const causesByTransporter = transporterRows.map((t) => ({ transporterId: t.transporterId, name: t.name, byParty: toPartyMinutes(partyTotals(t.ships)) }));

  const transporterTable = transporterRows.map((t) => {
    const n = t.ships.length;
    const rawCount = t.ships.filter((s) => s.onTime).length;
    const fairCount = t.ships.filter((s) => !countsAgainst(s)).length; // ≥ rawCount: an on-time shipment never counts against
    const causes = new Map<string, { party: Party; reason: ReasonCode | null; minutes: number }>();
    for (const s of t.ships) {
      for (const { row, minutes } of minutesOf.get(s.id) ?? []) {
        if (minutes === 0) continue;
        const key = `${row.party}|${row.reason ?? ''}`;
        const e = causes.get(key) ?? { party: row.party, reason: row.reason, minutes: 0 };
        e.minutes += minutes;
        causes.set(key, e);
      }
    }
    const top = [...causes.values()].sort(
      (a, b) => b.minutes - a.minutes || PARTIES.indexOf(a.party) - PARTIES.indexOf(b.party) || (a.reason ?? '').localeCompare(b.reason ?? ''),
    )[0];
    return {
      transporterId: t.transporterId,
      name: t.name,
      fleetSize: t.fleetSize,
      isSmall: t.fleetSize <= SMALL_FLEET_MAX,
      delivered: n,
      rawOnTimePct: pct(rawCount, n),
      fairOnTimePct: pct(fairCount, n),
      gapPct: pct(fairCount - rawCount, n), // fair − raw from the counts (not from two rounded percentages)
      medianDelayMinutesOfLate: median(t.ships.filter((s) => !s.onTime).map((s) => s.delayMinutes)),
      topCause: top ? { party: top.party, reason: top.reason } : null,
    };
  });

  return { arrivedCount: set.length, kpis, onTimeByLane, onTimeByTransporter, weeklyTrend, causesByParty, causesByReason, causesByLane, causesByTransporter, transporterTable };
}
