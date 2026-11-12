import type { DisruptionKind, Milestone } from '@routepulse/shared';
import { eligibleCheckIn, type ReceivingHours } from './receivingWindow.js';
import { ceilDiv, floorTimes, rat, type Rational } from './rational.js';
import { segmentAt, type SimRoute, type SimSegment } from './simRoute.js';

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
 * This engine moves trucks and records milestone/arrival facts. It does NOT compute ETA, risk,
 * attribution or alerts (Milestones 5–7).
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

/** Largest active slowdown on a segment (L5: the largest applicable slowdown wins). */
function slowdownPct(disruptions: readonly SimDisruption[], segCode: string, t: number): number {
  let max = 0;
  for (const d of disruptions) {
    if (d.kind === 'WEATHER_SLOWDOWN' && active(d, t) && d.segmentCodes.includes(segCode)) max = Math.max(max, d.slowdownPct ?? 0);
  }
  return max;
}

/**
 * If the truck is held at time t, the time the hold ends (latest-ending applicable stop, L5);
 * otherwise null. Stops: stoppedUntil (driver report / transfer), an active TRUCK_BREAKDOWN for
 * this shipment, and an active ROAD_CLOSURE on the segment the truck is about to enter.
 */
export function holdEnd(sh: SimShipment, route: SimRoute, disruptions: readonly SimDisruption[], t: number): number | null {
  let end: number | null = sh.stoppedUntilS !== null && sh.stoppedUntilS > t ? sh.stoppedUntilS : null;
  const seg = segmentAt(route, sh.progressMm);
  for (const d of disruptions) {
    if (!active(d, t)) continue;
    const applies =
      (d.kind === 'TRUCK_BREAKDOWN' && d.shipmentId === sh.id) ||
      (d.kind === 'ROAD_CLOSURE' && seg !== null && sh.progressMm === seg.startMm && d.segmentCodes.includes(seg.code));
    if (applies && (end === null || d.endS > end)) end = d.endS;
  }
  return end;
}

/** Speed in mm per second on a segment: length/baseline × pace × (1 − slowdown). Exact. */
export function speedMmPerSec(seg: SimSegment, pace: Rational, slowPct: number): Rational {
  return rat(BigInt(seg.endMm - seg.startMm) * pace.num * BigInt(100 - slowPct), BigInt(seg.baselineSec) * pace.den * 100n);
}

const isMoving = (sh: SimShipment) => sh.milestone === 'IN_TRANSIT' && sh.physicalArrivalS === null;

export function simulate(input: SimInput): SimResult {
  const { routes, disruptions, config, fromS, toS } = input;
  if (!Number.isInteger(fromS) || !Number.isInteger(toS) || toS < fromS) throw new RangeError('invalid interval');
  const ships = input.shipments.map((s) => ({ ...s })).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
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

  // ── movement over [t, tn) with constant conditions ──
  const moveAll = (t: number, tn: number) => {
    for (const sh of ships) {
      if (!isMoving(sh)) continue;
      const route = routeOf(sh);
      if (holdEnd(sh, route, disruptions, t) !== null) continue;
      const seg = segmentAt(route, sh.progressMm);
      if (!seg) continue;
      const v = speedMmPerSec(seg, sh.pace, slowdownPct(disruptions, seg.code, t));
      const remaining = BigInt(seg.endMm - sh.progressMm);
      const crossing = t + Number(ceilDiv(remaining, v));
      const moved = floorTimes(v, BigInt(tn - t));
      sh.progressMm = tn >= crossing || moved >= remaining ? seg.endMm : sh.progressMm + Number(moved);
    }
  };

  // ── pings on grid boundaries (autopilot trucks on the road, unless seeded silent) ──
  const pingsAt = (t: number) => {
    if (t % config.stepSec !== 0) return;
    for (const sh of ships) {
      if (!sh.autopilot || !isMoving(sh)) continue;
      if (sh.silentFromS !== null && t >= sh.silentFromS) continue;
      if (sh.lastUpdateS === null || t - sh.lastUpdateS >= sh.pingIntervalMin * 60) sh.lastUpdateS = t;
    }
  };

  function eligibleCheckInS(sh: SimShipment): number {
    const physical = new Date((sh.physicalArrivalS as number) * 1000);
    const override = sh.overrideEndS !== null ? new Date(sh.overrideEndS * 1000) : null;
    return Math.floor(eligibleCheckIn(physical, sh.hours, override).getTime() / 1000);
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

  return { shipments: ships, events, delivered };
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
