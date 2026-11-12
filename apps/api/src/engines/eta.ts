import {
  RULE_VERSION,
  type Confidence,
  type Factor,
  type FactorCode,
  type FactorPhase,
  type Party,
  type ReasonCode,
  type ReportStatus,
  type RiskLevel,
} from '@routepulse/shared';
import { largestRemainder } from './rounding.js';
import { confidence, confidenceReason, rangeMinutes, riskLevel, riskScore, roundHalfUp } from './risk.js';
import { baselineSecondsConsumed, type SimRoute } from './simRoute.js';
import { parseLedgerKey, simulate, type Ledger, type SimConfig, type SimDisruption, type SimShipment } from './simulate.js';
import { istMidnight, istMinuteOfDay } from './time.js';

/**
 * ETA engine (architecture §10, engine doc §3–§7). PURE: no database, no wall clock.
 *
 * Expected delay comes from running THE SAME simulation engine forward on a copy of the world
 * ("projection"): every manual step is assumed to happen as soon as it is allowed (autopilot copy),
 * and the ledger the engine books between now and the eligible check-in time is the expected
 * delay by cause. Projection and settlement therefore share one implementation of the gate queue,
 * pace (HIST), slowdowns/closures/breakdowns (DISR), stops (RPT), the L5 precedence and the
 * receiving window with the shipment's override (WIN, L4/O-12). With no new information, every
 * expected second turns into the identical incurred second as time passes (ET-3).
 */

const STEP_CHUNK_S = 6 * 3600;
const MAX_HORIZON_S = 7 * 24 * 3600;

/**
 * Runs the world forward from nowS until every shipment that has a truck has an arrival at the
 * receiving gate (arrivedS), or the horizon is reached. Returns the projected end state per id.
 * Shipments without a truck cannot be projected and are absent from the result.
 */
export function projectWorld(input: {
  shipments: readonly SimShipment[];
  routes: ReadonlyMap<string, SimRoute>;
  disruptions: readonly SimDisruption[];
  config: SimConfig;
  nowS: number;
}): Map<string, SimShipment> {
  let state = input.shipments.map((s) => ({ ...s, autopilot: true, ledger: { ...s.ledger } }));
  const done = (s: SimShipment) => s.arrivedS !== null || s.truckId === null;
  let t = input.nowS;
  // Instant consequences at `now` first (e.g. an eligible manual truck is checked in at once).
  state = simulate({ shipments: state, routes: input.routes, disruptions: input.disruptions, config: input.config, fromS: t, toS: t }).shipments;
  while (!state.every(done) && t - input.nowS < MAX_HORIZON_S) {
    // Chunks end on grid boundaries, so the result is identical to one long call.
    const next = (Math.floor(t / input.config.stepSec) + 1) * input.config.stepSec + STEP_CHUNK_S;
    state = simulate({ shipments: state, routes: input.routes, disruptions: input.disruptions, config: input.config, fromS: t, toS: next }).shipments;
    t = next;
  }
  return new Map(state.filter((s) => s.arrivedS !== null).map((s) => [s.id, s]));
}

// ───────────────────────────── explanation ─────────────────────────────

export interface DisruptionInfo {
  id: string;
  kind: SimDisruption['kind'];
  label: string;
  party: Party;
  reason: ReasonCode;
  segmentCodes: readonly string[];
  slowdownPct: number | null;
  startS: number;
  endS: number;
}

export interface ReportInfo {
  id: string;
  reason: ReasonCode;
  party: Party;
  status: ReportStatus;
}

export interface EtaInput {
  now: SimShipment;
  /** Projected end state from projectWorld (arrivedS set), or the shipment itself once arrived. */
  projected: SimShipment;
  route: SimRoute;
  plannedArrivalS: number;
  nowS: number;
  pendingReports: number;
  disruptions: ReadonlyMap<string, DisruptionInfo>;
  reports: ReadonlyMap<string, ReportInfo>;
}

export interface EtaResult {
  shipmentId: string;
  ruleVersion: string;
  simTimeS: number;
  plannedArrivalS: number;
  projectedRoadArrivalS: number;
  predictedArrivalS: number;
  etaLowS: number;
  etaHighS: number;
  rangeMinutes: number;
  receivingWindow: { opensS: number; closesS: number; overrideEndS: number | null };
  promisedByS: number;
  slackMinutes: number;
  level: RiskLevel;
  score: number;
  confidence: Confidence;
  confidenceReason: string;
  summary: string;
  plainReason: string | null;
  /** Largest factor (both phases of one cause; WIN only when nothing else) — used by the alert engine. */
  topFactor: { code: FactorCode; reason: ReasonCode | null } | null;
  factors: Factor[];
  totals: { incurredMinutes: number; planChangeMinutes: number; expectedMinutes: number };
  identityHolds: boolean;
}

const CODE_ORDER: Record<FactorCode, number> = { GATE: 0, HIST: 1, DISR: 2, RPT: 3, WIN: 4 };
const PHASE_ORDER: Record<FactorPhase, number> = { INCURRED: 0, PLAN_CHANGE: 1, EXPECTED: 2 };
const PARTY_ORDER: readonly Party[] = ['PLANT', 'TRANSPORTER', 'CUSTOMER', 'EXTERNAL', 'UNATTRIBUTED'];

export const LEVEL_TEXT: Record<RiskLevel, string> = { ON_TRACK: 'On track', WATCH: 'Watch', AT_RISK: 'At risk', LATE: 'Late' };
export const REASON_SHORT: Record<ReasonCode, string> = {
  BREAKDOWN: 'breakdown',
  PLANT_GATE_WAIT: 'plant gate wait',
  TRAFFIC: 'traffic',
  ROAD_CLOSED: 'road closure',
  HEAVY_RAIN: 'heavy rain',
  DOCUMENTS: 'documents',
  UNLOADING_WAIT: 'unloading wait',
  OTHER: 'other',
  TRANSPORTER_PACE: 'transporter pace',
  RECEIVING_WINDOW: 'receiving window',
};
/** Customer wording: no parties, no factor codes, no driver identity (AC-M1.6). */
export const REASON_PLAIN: Record<ReasonCode, string> = {
  BREAKDOWN: 'Vehicle breakdown on the route',
  PLANT_GATE_WAIT: 'Waiting at the dispatch plant',
  TRAFFIC: 'Heavy traffic on the route',
  ROAD_CLOSED: 'Road closure on the route',
  HEAVY_RAIN: 'Heavy rain on the route',
  DOCUMENTS: 'Document check',
  UNLOADING_WAIT: 'Waiting to unload',
  OTHER: 'Operational delay',
  TRANSPORTER_PACE: 'Slower transit than planned',
  RECEIVING_WINDOW: 'Arrival after receiving hours',
};

export const hhmm = (s: number): string => {
  const m = Math.floor(istMinuteOfDay(new Date(s * 1000)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** One bar: a source and its party (WIN: one bar for all parties, with a split). */
interface Group {
  sourceKey: string;
  /** null only for WIN */
  party: Party | null;
  code: FactorCode;
  seconds: number;
  byParty: Map<Party, number>;
  sortKey: string;
}

function codeOf(sourceKey: string): FactorCode {
  if (sourceKey.startsWith('DISR:')) return 'DISR';
  if (sourceKey.startsWith('RPT:')) return 'RPT';
  return sourceKey as FactorCode;
}

function groupsOf(ledger: Ledger, disruptions: ReadonlyMap<string, DisruptionInfo>): Group[] {
  const map = new Map<string, Group>();
  for (const [key, sec] of Object.entries(ledger)) {
    if (sec <= 0) continue;
    const { sourceKey, party } = parseLedgerKey(key);
    const code = codeOf(sourceKey);
    // Bars follow the ledger's party, so an override or review is visible in the explanation.
    const groupKey = code === 'WIN' ? 'WIN' : key;
    let g = map.get(groupKey);
    if (!g) {
      const d = code === 'DISR' ? disruptions.get(sourceKey.slice(5)) : undefined;
      const tie = d ? `${String(d.startS).padStart(12, '0')}:${d.id}` : sourceKey;
      g = { sourceKey, party: code === 'WIN' ? null : party, code, seconds: 0, byParty: new Map(), sortKey: `${CODE_ORDER[code]}:${tie}:${PARTY_ORDER.indexOf(party)}` };
      map.set(groupKey, g);
    }
    g.seconds += sec;
    g.byParty.set(party, (g.byParty.get(party) ?? 0) + sec);
  }
  return [...map.values()].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

function diffLedger(after: Ledger, before: Ledger): Ledger {
  const out: Ledger = {};
  for (const [k, v] of Object.entries(after)) {
    const d = v - (before[k] ?? 0);
    if (d > 0) out[k] = d;
  }
  return out;
}

export function explainEta(input: EtaInput): EtaResult {
  const { now: sh, projected, route, nowS, disruptions, reports } = input;
  const bCurMin = route.segments.reduce((a, s) => a + s.baselineSec, 0) / 60;
  const bPrimaryMin = (input.plannedArrivalS - sh.plannedDepS) / 60;
  const plannedArrivalMin = input.plannedArrivalS / 60;
  const departed = sh.milestone === 'IN_TRANSIT' || sh.milestone === 'ARRIVED' || sh.milestone === 'DELIVERED';

  const roadS = projected.physicalArrivalS as number;
  const predictedS = projected.arrivedS as number;
  const predictedMin = roundHalfUp(predictedS / 60);

  // I from the clock (identity frozen at the eligible check-in time after physical arrival, L6).
  let incurred: number;
  if (!departed) incurred = Math.max(0, (nowS - sh.plannedDepS) / 60);
  else if (sh.physicalArrivalS !== null && predictedS <= nowS) incurred = roundHalfUp((predictedS - sh.plannedDepS) / 60) - bCurMin;
  else incurred = (nowS - sh.plannedDepS) / 60 - roundHalfUp(baselineSecondsConsumed(route, sh.progressMm) / 60);
  const planChange = bCurMin - bPrimaryMin;
  const expected = predictedMin - plannedArrivalMin - incurred - planChange;

  const factors: Factor[] = [];
  const add = (phase: FactorPhase, groups: Group[], total: number) => {
    if (total === 0 || groups.length === 0) return;
    const minutes = largestRemainder(groups.map((g) => g.seconds), total);
    groups.forEach((g, i) => {
      const m = minutes[i] ?? 0;
      if (m > 0) factors.push(toFactor(phase, g, m, input));
    });
  };
  const incurredGroups = groupsOf(sh.ledger, disruptions);
  const expectedGroups = groupsOf(diffLedger(projected.ledger, sh.ledger), disruptions);
  if (incurred > 0 && incurredGroups.length === 0) throw new Error(`${sh.code}: incurred delay without ledger rows`);
  if (expected > 0 && expectedGroups.length === 0) throw new Error(`${sh.code}: expected delay without projected causes`);
  add('INCURRED', incurredGroups, incurred);
  if (planChange !== 0) {
    const pc = Object.entries(sh.planChangeByParty).filter(([, v]) => (v ?? 0) > 0);
    add(
      'PLAN_CHANGE',
      pc.map(([party, v]) => ({ sourceKey: 'ROUTE', party: party as Party, code: 'DISR' as FactorCode, seconds: v ?? 0, byParty: new Map([[party as Party, v ?? 0]]), sortKey: party })),
      planChange,
    );
  }
  add('EXPECTED', expectedGroups, expected);
  factors.sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]); // stable: keeps code order within a phase

  const sum = factors.reduce((a, f) => a + f.minutes, 0);
  const identityHolds = plannedArrivalMin + sum === predictedMin && sum === incurred + planChange + expected;

  // Risk.
  const promisedMin = sh.promisedByS / 60;
  const slack = Math.round(promisedMin - predictedMin);
  const arrivedOnTime = sh.physicalArrivalS !== null && predictedS <= sh.promisedByS;
  const level = riskLevel(slack, nowS, sh.promisedByS, arrivedOnTime);
  const age = sh.lastUpdateS === null ? null : Math.floor((nowS - sh.lastUpdateS) / 60);
  const range = rangeMinutes(predictedMin - nowS / 60, age, input.pendingReports);

  // Summary names the largest factor (both phases of one cause together; WIN is a knock-on).
  const bySource = new Map<string, { minutes: number; reason: ReasonCode | null; label: string; code: FactorCode }>();
  for (const f of factors) {
    if (f.code === 'WIN') continue;
    const k = `${f.code}:${f.sourceRef?.id ?? f.reason ?? ''}`;
    const e = bySource.get(k) ?? { minutes: 0, reason: f.reason, label: f.label, code: f.code };
    e.minutes += f.minutes;
    bySource.set(k, e);
  }
  let top: { minutes: number; reason: ReasonCode | null; code: FactorCode } | null = null;
  for (const e of bySource.values()) if (!top || e.minutes > top.minutes) top = e;
  const winMinutes = factors.filter((f) => f.code === 'WIN').reduce((a, f) => a + f.minutes, 0);
  const summary =
    top && top.minutes > 0
      ? `${LEVEL_TEXT[level]}: +${top.minutes} min ${top.reason ? REASON_SHORT[top.reason] : 'delay'} is the largest factor`
      : `${LEVEL_TEXT[level]}: no delay factors`;
  const plainReason =
    level === 'ON_TRACK'
      ? null
      : top && top.minutes > 0 && top.reason
        ? REASON_PLAIN[top.reason]
        : winMinutes > 0
          ? REASON_PLAIN.RECEIVING_WINDOW
          : null;

  const predictedAtS = predictedMin * 60;
  const dayStart = istMidnight(new Date(predictedAtS * 1000)).getTime() / 1000;
  return {
    shipmentId: sh.id,
    ruleVersion: RULE_VERSION,
    simTimeS: nowS,
    plannedArrivalS: input.plannedArrivalS,
    projectedRoadArrivalS: roundHalfUp(roadS / 60) * 60,
    predictedArrivalS: predictedAtS,
    etaLowS: predictedAtS - range * 60,
    etaHighS: predictedAtS + range * 60,
    rangeMinutes: range,
    receivingWindow: { opensS: dayStart + sh.hours.openMin * 60, closesS: dayStart + sh.hours.closeMin * 60, overrideEndS: sh.overrideEndS },
    promisedByS: sh.promisedByS,
    slackMinutes: slack,
    level,
    score: riskScore(slack),
    confidence: confidence(age, input.pendingReports),
    confidenceReason: confidenceReason(age, input.pendingReports),
    summary,
    plainReason,
    topFactor: top && top.minutes > 0 ? { code: top.code, reason: top.reason } : winMinutes > 0 ? { code: 'WIN', reason: 'RECEIVING_WINDOW' } : null,
    factors,
    totals: { incurredMinutes: incurred, planChangeMinutes: planChange, expectedMinutes: expected },
    identityHolds,
  };
}

function toFactor(phase: FactorPhase, g: Group, minutes: number, input: EtaInput): Factor {
  const incurred = phase === 'INCURRED';
  const base = { code: g.code, phase, minutes, split: null, sourceRef: null, reviewStatus: null } as const;
  switch (g.code) {
    case 'GATE':
      return {
        ...base,
        party: g.party ?? 'PLANT',
        reason: 'PLANT_GATE_WAIT',
        label: 'Plant gate wait and loading',
        detail: incurred ? `Gate queue and loading after the planned departure · +${minutes} min` : `Projected gate queue and loading · +${minutes} min`,
      };
    case 'HIST': {
      const pct = Math.round((Number(input.now.pace.num) / Number(input.now.pace.den)) * 1000) / 10;
      return {
        ...base,
        party: g.party ?? 'TRANSPORTER',
        reason: 'TRANSPORTER_PACE',
        label: 'Transporter pace (from delivered history)',
        detail: `${incurred ? 'So far' : 'Remaining baseline'} at ${pct}% of baseline speed · +${minutes} min`,
      };
    }
    case 'DISR': {
      if (phase === 'PLAN_CHANGE') {
        const party = g.party ?? 'UNATTRIBUTED';
        return { ...base, party, reason: null, label: 'Plan change (reroute)', detail: `Longer route baseline · +${minutes} min` };
      }
      const id = g.sourceKey.slice(5);
      const d = input.disruptions.get(id);
      const party = g.party ?? d?.party ?? 'UNATTRIBUTED';
      const what =
        d?.kind === 'WEATHER_SLOWDOWN'
          ? `${d.segmentCodes.join(', ')} ${d.slowdownPct ?? 0}% slower until ${hhmm(d.endS)}`
          : d?.kind === 'ROAD_CLOSURE'
            ? `${d.segmentCodes.join(', ')} closed until ${hhmm(d.endS)}`
            : d?.kind === 'TRUCK_BREAKDOWN'
              ? `Truck stopped until ${hhmm(d.endS)}`
              : d
                ? `Gate congestion until ${hhmm(d.endS)}`
                : 'Disruption';
      return {
        ...base,
        party,
        reason: d?.reason ?? null,
        label: d?.label ?? 'Disruption',
        detail: `${what} · +${minutes} min`,
        sourceRef: { type: 'DISRUPTION', id },
      };
    }
    case 'RPT': {
      const id = g.sourceKey.slice(4);
      const r = input.reports.get(id);
      return {
        ...base,
        party: g.party ?? r?.party ?? 'UNATTRIBUTED',
        reason: r?.reason ?? null,
        label: r ? `Driver report: ${REASON_SHORT[r.reason]}` : 'Driver report',
        detail: `${incurred ? 'Stopped so far' : `Stopped until ${input.now.stoppedUntilS === null ? '—' : hhmm(input.now.stoppedUntilS)}`} · +${minutes} min`,
        sourceRef: { type: 'DRIVER_REPORT', id },
        reviewStatus: r?.status ?? null,
      };
    }
    case 'WIN': {
      const parties = PARTY_ORDER.filter((p) => (g.byParty.get(p) ?? 0) > 0);
      const parts = largestRemainder(parties.map((p) => g.byParty.get(p) ?? 0), minutes);
      const split = parties.map((party, i) => ({ party, minutes: parts[i] ?? 0 })).filter((x) => x.minutes > 0);
      const road = input.projected.physicalArrivalS ?? 0;
      return {
        ...base,
        party: null,
        split,
        reason: 'RECEIVING_WINDOW',
        label: 'Waiting for the receiving window',
        detail: incurred
          ? `Waited at the customer gate for receiving hours · +${minutes} min`
          : `Road arrival ${hhmm(road)} is outside receiving hours; check-in at ${hhmm(input.projected.arrivedS ?? road)} · +${minutes} min`,
      };
    }
  }
}
