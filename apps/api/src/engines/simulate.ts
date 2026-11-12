import type { DisruptionKind, Milestone, Party, ReasonCode } from '@routepulse/shared';
import { eligibleCheckIn, splitKnockOn, type ReceivingHours } from './receivingWindow.js';
import { ceilDiv, floorTimes, rat, type Rational } from './rational.js';
import { largestRemainder } from './rounding.js';
import { baselineSecondsConsumed, segmentAt, type SimRoute, type SimSegment } from './simRoute.js';

/**
 * Deterministic discrete-event simulation (architecture §9, engine doc §9).
 *
 * PURE: no database, no wall clock, no randomness. Time is integer seconds (UTC epoch), distance is
 * integer millimetres, speeds and paces are exact rationals. Given the same world and the same
 * [fromS, toS], the result is always identical.
 *
 * Every 5-minute grid boundary is an event boundary, so advancing in one call or in many calls
 * that stop on the grid executes exactly the same computation. Extra split points (a driver
 * action stamped mid-step) can differ from an unsplit run by at most 1 mm per split because
 * movement is floored to whole millimetres; results remain deterministic for the same action times.
 *
 * This engine moves trucks, records milestone/arrival facts and books the delay LEDGER (incurred
 * seconds by cause, architecture §10.5) with the L5 precedence. The ETA engine (engines/eta.ts)
 * runs this same function forward on a copy of the world to obtain the expected delay, so
 * projection and settlement can never disagree (engine doc §4.3, §11).
 *
 * Ledger rounding: per call, the integer seconds booked for a shipment are
 * round(I(to)) − round(I(from)), where I is the exact incurred time from the clock identity
 * (now − plannedDeparture − C). The cumulative ledger therefore always equals round(I) exactly and
 * never drifts; the call's seconds are spread over the causes with the largest-remainder method.
 */

export interface SimDisruption {
  id: string;
  kind: DisruptionKind;
  segmentCodes: readonly string[];
  shipmentId: string | null;
  slowdownPct: number | null;
  extraMinutesPerTruck: number | null;
  startS: number;
  /** Effective end: endedEarlyAt if set, else endsAt. Active on [startS, endS). */
  endS: number;
  /** Party and reason the disruption's delay is booked to (Disruption.party / reasonCode). */
  party: Party;
  reason: ReasonCode;
  /** Creation time (tie-break for L5: earliest created wins among equals). */
  createdS: number;
  label: string;
}

/**
 * Cause of a `stoppedUntil` hold (a driver report, or a recovery transfer that keeps the original
 * report's cause). Required whenever stoppedUntilS is set.
 */
export interface StopCause {
  sourceKey: string; // "RPT:<reportId>"
  party: Party;
  createdS: number;
}

/** Ledger key = `${sourceKey}|${party}` → integer seconds (DelayAttribution TIME_LOST rows). */
export type Ledger = Record<string, number>;
export const ledgerKey = (sourceKey: string, party: Party) => `${sourceKey}|${party}`;
export function parseLedgerKey(key: string): { sourceKey: string; party: Party } {
  const i = key.lastIndexOf('|');
  return { sourceKey: key.slice(0, i), party: key.slice(i + 1) as Party };
}

export interface SimShipment {
  id: string;
  code: string;
  autopilot: boolean;
  milestone: Milestone;
  truckId: string | null;
  routeId: string;
  plannedGateS: number;
  plannedDepS: number;
  promisedByS: number;
  overrideEndS: number | null;
  hours: ReceivingHours;
  unloadingMin: number;
  pace: Rational;
  progressMm: number;
  stoppedUntilS: number | null;
  gateQueuedS: number | null;
  loadingStartedS: number | null;
  /** Derived, not stored: loadingStarted + loading time + gate congestion active at start. */
  loadingEndS: number | null;
  gateOutS: number | null;
  physicalArrivalS: number | null;
  arrivedS: number | null;
  deliveredS: number | null;
  delayMinutes: number | null;
  onTime: boolean | null;
  lastUpdateS: number | null;
  pingIntervalMin: number;
  silentFromS: number | null;
  stopCause: StopCause | null;
  /** Incurred seconds by cause (TIME_LOST). The engine returns an updated copy. */
  ledger: Ledger;
  /** PLAN_CHANGE seconds by party (reroutes); only used as weights for the WIN split. */
  planChangeByParty: Partial<Record<Party, number>>;
}

export interface SimConfig {
  stepSec: number;
  loadingSec: number;
  bays: number;
}

export type SimEvent =
  | { shipmentId: string; atS: number; type: 'MILESTONE'; milestone: Milestone }
  | { shipmentId: string; atS: number; type: 'PHYSICAL_ARRIVAL' };

export interface SimInput {
  shipments: readonly SimShipment[];
  routes: ReadonlyMap<string, SimRoute>;
  disruptions: readonly SimDisruption[];
  config: SimConfig;
  fromS: number;
  toS: number;
}

export interface SimResult {
  shipments: SimShipment[];
  events: SimEvent[];
  /** Shipments delivered in this interval (their trucks become available). */
  delivered: string[];
}

const PRE_GATE: readonly Milestone[] = ['ORDER_CONFIRMED', 'TRUCK_ASSIGNED'];
const active = (d: SimDisruption, t: number) => d.startS <= t && t < d.endS;

/** Seconds of extra loading for a truck starting to load at t (largest active gate congestion, L5). */
export function gateCongestionExtraSec(disruptions: readonly SimDisruption[], t: number): number {
  let max = 0;
  for (const d of disruptions) {
    if (d.kind === 'GATE_CONGESTION' && active(d, t)) max = Math.max(max, d.extraMinutesPerTruck ?? 0);
  }
  return max * 60;
}

export function loadingEndFor(startS: number, disruptions: readonly SimDisruption[], config: SimConfig): number {
  return startS + config.loadingSec + gateCongestionExtraSec(disruptions, startS);
}

/** Binding slowdown on a segment (L5: the largest applies; tie → earliest created, then id). */
function bindingSlowdown(disruptions: readonly SimDisruption[], segCode: string, t: number): SimDisruption | null {
  let best: SimDisruption | null = null;
  for (const d of disruptions) {
    if (d.kind !== 'WEATHER_SLOWDOWN' || !active(d, t) || !d.segmentCodes.includes(segCode) || (d.slowdownPct ?? 0) <= 0) continue;
    const pct = d.slowdownPct ?? 0;
    const bp = best?.slowdownPct ?? 0;
    if (!best || pct > bp || (pct === bp && (d.createdS < best.createdS || (d.createdS === best.createdS && d.id < best.id)))) best = d;
  }
  return best;
}
const slowdownPct = (disruptions: readonly SimDisruption[], segCode: string, t: number) => bindingSlowdown(disruptions, segCode, t)?.slowdownPct ?? 0;

export interface BindingCause {
  sourceKey: string;
  party: Party;
}

/**
 * The binding stop at time t (L5): among stoppedUntil (driver report / transfer), an active
 * TRUCK_BREAKDOWN for this shipment and an active ROAD_CLOSURE on the segment the truck is about
 * to enter, the one with the LATEST end; tie → earliest created (then id). Null if not held.
 */
export function bindingHold(
  sh: SimShipment,
  route: SimRoute,
  disruptions: readonly SimDisruption[],
  t: number,
): { end: number; cause: BindingCause } | null {
  let best: { end: number; createdS: number; id: string; cause: BindingCause } | null = null;
  const consider = (end: number, createdS: number, id: string, cause: BindingCause) => {
    if (!best || end > best.end || (end === best.end && (createdS < best.createdS || (createdS === best.createdS && id < best.id)))) {
      best = { end, createdS, id, cause };
    }
  };
  if (sh.stoppedUntilS !== null && sh.stoppedUntilS > t) {
    if (!sh.stopCause) throw new Error(`shipment ${sh.code} is stopped without a recorded cause`);
    consider(sh.stoppedUntilS, sh.stopCause.createdS, sh.stopCause.sourceKey, { sourceKey: sh.stopCause.sourceKey, party: sh.stopCause.party });
  }
  const seg = segmentAt(route, sh.progressMm);
  for (const d of disruptions) {
    if (!active(d, t)) continue;
    const applies =
      (d.kind === 'TRUCK_BREAKDOWN' && d.shipmentId === sh.id) ||
      (d.kind === 'ROAD_CLOSURE' && seg !== null && sh.progressMm === seg.startMm && d.segmentCodes.includes(seg.code));
    if (applies) consider(d.endS, d.createdS, d.id, { sourceKey: `DISR:${d.id}`, party: d.party });
  }
  const b = best as { end: number; cause: BindingCause } | null;
  return b ? { end: b.end, cause: b.cause } : null;
}

/** End of the binding hold at time t, or null (see bindingHold). */
export function holdEnd(sh: SimShipment, route: SimRoute, disruptions: readonly SimDisruption[], t: number): number | null {
  return bindingHold(sh, route, disruptions, t)?.end ?? null;
}

/** Speed in mm per second on a segment: length/baseline × pace × (1 − slowdown). Exact. */
export function speedMmPerSec(seg: SimSegment, pace: Rational, slowPct: number): Rational {
  return rat(BigInt(seg.endMm - seg.startMm) * pace.num * BigInt(100 - slowPct), BigInt(seg.baselineSec) * pace.den * 100n);
}

const isMoving = (sh: SimShipment) => sh.milestone === 'IN_TRANSIT' && sh.physicalArrivalS === null;
const DEPARTED: readonly Milestone[] = ['IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

/** Eligible check-in (L1, L4, O-12) for a road arrival at `roadS`. */
export function eligibleCheckInFor(sh: Pick<SimShipment, 'hours' | 'overrideEndS'>, roadS: number): number {
  const override = sh.overrideEndS !== null ? new Date(sh.overrideEndS * 1000) : null;
  return Math.floor(eligibleCheckIn(new Date(roadS * 1000), sh.hours, override).getTime() / 1000);
}

/**
 * Exact incurred seconds I at time t from the clock identity (architecture §10.2):
 * departed → t − plannedDep − C; not departed → max(0, t − plannedDep); frozen at the eligible
 * check-in time after physical arrival (L6).
 */
export function incurredExactSec(sh: SimShipment, route: SimRoute, t: number): number {
  if (!DEPARTED.includes(sh.milestone)) return Math.max(0, t - sh.plannedDepS);
  let at = t;
  if (sh.arrivedS !== null) at = Math.min(t, sh.arrivedS);
  else if (sh.physicalArrivalS !== null) at = Math.min(t, eligibleCheckInFor(sh, sh.physicalArrivalS));
  return at - sh.plannedDepS - baselineSecondsConsumed(route, sh.progressMm);
}

export function simulate(input: SimInput): SimResult {
  const { routes, disruptions, config, fromS, toS } = input;
  if (!Number.isInteger(fromS) || !Number.isInteger(toS) || toS < fromS) throw new RangeError('invalid interval');
  const ships = input.shipments
    .map((s) => ({ ...s, ledger: { ...s.ledger } }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  // Exact incurred time at the start (for the drift-free ledger rounding) and the call's raw
  // seconds per cause (weights for the largest-remainder spread).
  const iStart = new Map(ships.map((sh) => [sh.id, incurredExactSec(sh, routes.get(sh.routeId) ?? missingRoute(sh.routeId), fromS)]));
  const raw = new Map<string, Map<string, number>>(); // shipmentId → sourceKey|party (WIN: 'WIN') → seconds
  const book = (sh: SimShipment, key: string, sec: number) => {
    if (sec <= 0) return;
    let m = raw.get(sh.id);
    if (!m) raw.set(sh.id, (m = new Map()));
    m.set(key, (m.get(key) ?? 0) + sec);
  };
  const events: SimEvent[] = [];
  const delivered: string[] = [];
  const routeOf = (sh: SimShipment): SimRoute => {
    const r = routes.get(sh.routeId);
    if (!r) throw new Error(`missing route ${sh.routeId}`);
    return r;
  };
  const milestone = (sh: SimShipment, m: Milestone, t: number) => {
    sh.milestone = m;
    events.push({ shipmentId: sh.id, atS: t, type: 'MILESTONE', milestone: m });
  };

  // ── transitions at an exact instant, repeated until nothing changes ──
  const transitionsAt = (t: number) => {
    for (let guard = 0; guard < 100; guard += 1) {
      let changed = false;

      for (const sh of ships) {
        if (sh.autopilot && PRE_GATE.includes(sh.milestone) && sh.truckId !== null && sh.plannedGateS <= t) {
          sh.gateQueuedS = t;
          sh.lastUpdateS = t;
          milestone(sh, 'AT_GATE', t);
          changed = true;
        }
      }

      // Gate: first-come-first-served by gate arrival time (tie: shipment code).
      const busy = ships.filter((s) => s.milestone === 'LOADING' && (s.loadingEndS ?? 0) > t).length;
      const queue = ships
        .filter((s) => s.milestone === 'AT_GATE')
        .sort((a, b) => (a.gateQueuedS ?? 0) - (b.gateQueuedS ?? 0) || (a.code < b.code ? -1 : 1));
      for (let free = config.bays - busy; free > 0 && queue.length > 0; free -= 1) {
        const sh = queue.shift() as SimShipment;
        sh.loadingStartedS = t;
        sh.loadingEndS = loadingEndFor(t, disruptions, config);
        milestone(sh, 'LOADING', t);
        changed = true;
      }

      for (const sh of ships) {
        if (sh.autopilot && sh.milestone === 'LOADING' && (sh.loadingEndS ?? Infinity) <= t && sh.plannedDepS <= t) {
          sh.gateOutS = t;
          sh.lastUpdateS = t;
          milestone(sh, 'GATE_OUT', t);
          milestone(sh, 'IN_TRANSIT', t);
          changed = true;
        }
        if (sh.milestone === 'IN_TRANSIT' && sh.physicalArrivalS === null && sh.progressMm >= routeOf(sh).lengthMm) {
          sh.physicalArrivalS = t;
          events.push({ shipmentId: sh.id, atS: t, type: 'PHYSICAL_ARRIVAL' });
          changed = true;
        }
        if (sh.autopilot && sh.milestone === 'IN_TRANSIT' && sh.physicalArrivalS !== null && sh.arrivedS === null) {
          const eligible = eligibleCheckInS(sh);
          if (eligible <= t) {
            recordArrival(sh, eligible);
            milestone(sh, 'ARRIVED', t);
            changed = true;
          }
        }
        if (sh.autopilot && sh.milestone === 'ARRIVED' && sh.deliveredS === null && sh.arrivedS !== null && sh.arrivedS + sh.unloadingMin * 60 <= t) {
          sh.deliveredS = t;
          milestone(sh, 'DELIVERED', t);
          delivered.push(sh.id);
          changed = true;
        }
      }
      if (!changed) return;
    }
    throw new Error('simulation transitions did not settle (guard)');
  };

  // ── next instant at which anything can change ──
  const nextEventAfter = (t: number): number => {
    let next = Math.min(toS, (Math.floor(t / config.stepSec) + 1) * config.stepSec);
    const consider = (x: number | null) => {
      if (x !== null && x > t && x < next) next = x;
    };
    for (const sh of ships) {
      if (sh.autopilot && PRE_GATE.includes(sh.milestone) && sh.truckId !== null) consider(sh.plannedGateS);
      if (sh.milestone === 'LOADING') {
        consider(sh.loadingEndS);
        if (sh.autopilot && sh.loadingEndS !== null) consider(Math.max(sh.loadingEndS, sh.plannedDepS));
      }
      if (isMoving(sh)) {
        const route = routeOf(sh);
        const hold = holdEnd(sh, route, disruptions, t);
        if (hold !== null) consider(hold);
        else {
          const seg = segmentAt(route, sh.progressMm);
          if (seg) {
            const v = speedMmPerSec(seg, sh.pace, slowdownPct(disruptions, seg.code, t));
            consider(t + Number(ceilDiv(BigInt(seg.endMm - sh.progressMm), v)));
          }
        }
      }
      if (sh.autopilot && sh.milestone === 'IN_TRANSIT' && sh.physicalArrivalS !== null && sh.arrivedS === null) consider(eligibleCheckInS(sh));
      if (sh.autopilot && sh.milestone === 'ARRIVED' && sh.arrivedS !== null && sh.deliveredS === null) consider(sh.arrivedS + sh.unloadingMin * 60);
    }
    for (const d of disruptions) {
      consider(d.startS);
      consider(d.endS);
    }
    return next;
  };

  // ── movement and ledger booking over [t, tn) with constant conditions (§10.5, L5) ──
  const overlap = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));
  const moveAll = (t: number, tn: number) => {
    const dt = tn - t;
    for (const sh of ships) {
      if (sh.arrivedS !== null || sh.milestone === 'ARRIVED' || sh.milestone === 'DELIVERED') continue; // frozen (L6)
      if (!DEPARTED.includes(sh.milestone)) {
        // Before departure: only time after the planned departure is delay.
        const late = overlap(t, tn, sh.plannedDepS, Infinity);
        if (PRE_GATE.includes(sh.milestone)) book(sh, ledgerKey('HIST', 'TRANSPORTER'), late);
        else book(sh, ledgerKey('GATE', 'PLANT'), late);
        continue;
      }
      if (sh.physicalArrivalS !== null) {
        // Physically arrived: waiting for the applicable receiving window is WIN; waiting for a
        // manual ARRIVED tap after the eligible time books nothing (L6).
        book(sh, 'WIN', overlap(t, tn, sh.physicalArrivalS, eligibleCheckInS(sh)));
        continue;
      }
      const route = routeOf(sh);
      const hold = bindingHold(sh, route, disruptions, t);
      if (hold !== null) {
        book(sh, ledgerKey(hold.cause.sourceKey, hold.cause.party), dt); // a stopped truck is not slowed (L5)
        continue;
      }
      const seg = segmentAt(route, sh.progressMm);
      if (!seg) continue;
      const slow = bindingSlowdown(disruptions, seg.code, t);
      const pct = slow?.slowdownPct ?? 0;
      const v = speedMmPerSec(seg, sh.pace, pct);
      const remaining = BigInt(seg.endMm - sh.progressMm);
      const crossing = t + Number(ceilDiv(remaining, v));
      const moved = floorTimes(v, BigInt(dt));
      const before = sh.progressMm;
      sh.progressMm = tn >= crossing || moved >= remaining ? seg.endMm : sh.progressMm + Number(moved);
      // lost = Δ − baseline consumed; DISR = Δ·s to the binding slowdown, HIST = the rest (= Δ(1−s)(1−p)).
      const consumed = (seg.baselineSec * (sh.progressMm - before)) / (seg.endMm - seg.startMm);
      const disr = slow ? (dt * pct) / 100 : 0;
      if (slow) book(sh, ledgerKey(`DISR:${slow.id}`, slow.party), disr);
      book(sh, ledgerKey('HIST', 'TRANSPORTER'), dt - consumed - disr);
    }
  };

  // ── simulated GPS pings on grid boundaries (every truck on the road, unless seeded silent) ──
  // O-14 (decided 2026-11-12): manual (hero) trucks ping too — the driver's phone sends GPS even
  // though milestones are tapped by hand. A ping only refreshes lastUpdateAt; it never records a
  // ShipmentEvent and never changes a milestone.
  const pingsAt = (t: number) => {
    if (t % config.stepSec !== 0) return;
    for (const sh of ships) {
      if (!isMoving(sh)) continue;
      if (sh.silentFromS !== null && t >= sh.silentFromS) continue;
      if (sh.lastUpdateS === null || t - sh.lastUpdateS >= sh.pingIntervalMin * 60) sh.lastUpdateS = t;
    }
  };

  function eligibleCheckInS(sh: SimShipment): number {
    return eligibleCheckInFor(sh, sh.physicalArrivalS as number);
  }

  let t = fromS;
  for (;;) {
    transitionsAt(t);
    pingsAt(t);
    if (t >= toS) break;
    const tn = nextEventAfter(t);
    moveAll(t, tn);
    t = tn;
  }

  for (const sh of ships) {
    const route = routeOf(sh);
    const total = Math.round(incurredExactSec(sh, route, toS)) - Math.round(iStart.get(sh.id) ?? 0);
    const m = raw.get(sh.id);
    if (total <= 0 || !m) continue;
    const keys = [...m.keys()].sort();
    const parts = largestRemainder(keys.map((k) => m.get(k) ?? 0), total);
    keys.forEach((k, i) => {
      const sec = parts[i] ?? 0;
      if (sec === 0) return;
      if (k !== 'WIN') {
        sh.ledger[k] = (sh.ledger[k] ?? 0) + sec;
        return;
      }
      // WIN knock-on split by each party's other minutes at this moment (spec §5.9, AC-F1.4).
      const byParty: Partial<Record<Party, number>> = { ...sh.planChangeByParty };
      for (const [lk, v] of Object.entries(sh.ledger)) {
        const { sourceKey, party } = parseLedgerKey(lk);
        if (sourceKey !== 'WIN') byParty[party] = (byParty[party] ?? 0) + v;
      }
      for (const [party, v] of Object.entries(splitKnockOn(sec, byParty)) as [Party, number][]) {
        const lk = ledgerKey('WIN', party);
        sh.ledger[lk] = (sh.ledger[lk] ?? 0) + v;
      }
    });
  }

  return { shipments: ships, events, delivered };
}

function missingRoute(id: string): never {
  throw new Error(`missing route ${id}`);
}

/** Arrival outcome (L1): on time = arrivedAt ≤ promisedBy; delay in whole minutes, rounded up. */
export function recordArrival(sh: SimShipment, arrivedS: number): void {
  sh.arrivedS = arrivedS;
  const late = arrivedS - sh.promisedByS;
  sh.onTime = late <= 0;
  sh.delayMinutes = late <= 0 ? 0 : Math.ceil(late / 60);
}

export const DEFAULT_SIM_CONFIG = (stepMinutes: number, loadingMinutes: number, bays: number): SimConfig => ({
  stepSec: stepMinutes * 60,
  loadingSec: loadingMinutes * 60,
  bays,
});
