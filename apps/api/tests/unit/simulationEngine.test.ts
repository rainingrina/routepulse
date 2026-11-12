import type { Segment } from '@routepulse/shared';
import { describe, expect, it } from 'vitest';
import { derivePaces, paceFromRate } from '../../src/engines/pace.js';
import { ceilDiv, floorTimes, median, rat } from '../../src/engines/rational.js';
import { toSimRoute, type SimRoute } from '../../src/engines/simRoute.js';
import { holdEnd, simulate, speedMmPerSec, type SimDisruption, type SimShipment } from '../../src/engines/simulate.js';
import { istAt } from '../../src/engines/time.js';

const D = '2026-11-19';
const s = (min: number) => Math.floor(istAt(D, min).getTime() / 1000);
const CFG = { stepSec: 300, loadingSec: 2400, bays: 3 };
const PACE = rat(270, 290); // Ghatline–Pune derived from history (O-13)

const PUNE_SEGS: Segment[] = [
  { segmentCode: 'PLT-KHP', name: 'a', startKm: 0, endKm: 45, speedKmh: 30 },
  { segmentCode: 'KHP-LNV-GHAT', name: 'ghat', startKm: 45, endKm: 65, speedKmh: 20 },
  { segmentCode: 'LNV-PUN', name: 'c', startKm: 65, endKm: 130, speedKmh: 32.5 },
];
const ROUTE: SimRoute = toSimRoute('rt', PUNE_SEGS);
const ROUTES = new Map([['rt', ROUTE]]);

function ship(over: Partial<SimShipment> = {}): SimShipment {
  return {
    id: 'shp_x', code: 'SHP-X', autopilot: true, milestone: 'IN_TRANSIT', truckId: 'trk', routeId: 'rt',
    plannedGateS: s(8 * 60 + 10), plannedDepS: s(8 * 60 + 50), promisedByS: s(18 * 60), overrideEndS: null,
    hours: { openMin: 480, closeMin: 1080 }, unloadingMin: 60, extraUnloadMin: 0, pace: PACE, progressMm: 0, stoppedUntilS: null,
    gateQueuedS: null, loadingStartedS: null, loadingEndS: null, gateOutS: s(9 * 60 + 30), physicalArrivalS: null,
    arrivedS: null, deliveredS: null, delayMinutes: null, onTime: null, lastUpdateS: null, pingIntervalMin: 30, silentFromS: null,
    stopCause: null, ledger: {}, planChangeByParty: {},
    ...over,
  };
}
const run = (shipments: SimShipment[], fromMin: number, toMin: number, disruptions: SimDisruption[] = []) =>
  simulate({ shipments, routes: ROUTES, disruptions, config: CFG, fromS: s(fromMin), toS: s(toMin) });
const one = (r: ReturnType<typeof run>) => r.shipments[0] as SimShipment;

describe('exact arithmetic', () => {
  it('rationals: floor, ceil and median are exact', () => {
    expect(floorTimes(rat(7, 3), 3n)).toBe(7n);
    expect(ceilDiv(10n, rat(3))).toBe(4n);
    expect(median([rat(1, 2), rat(1, 3), rat(3, 4)])).toEqual(rat(1, 2));
    expect(median([rat(1), rat(2)])).toEqual(rat(3, 2));
  });

  it('route baseline seconds come from the rounded segment minutes (270 min for Pune)', () => {
    expect(ROUTE.segments.map((x) => x.baselineSec)).toEqual([5400, 3600, 7200]);
    expect(ROUTE.lengthMm).toBe(130_000_000);
  });
});

describe('pace from history (O-13)', () => {
  const sample = (t: string, l: string, sec: number) => ({ transporterId: t, laneId: l, transporterSeconds: sec, baselineSeconds: 270 * 60 });

  it('derives Ghatline–Pune p = 270/290 from a median ratio of 20/270', () => {
    const samples = [...Array(9)].map(() => sample('g', 'pune', 20 * 60)).concat([sample('g', 'pune', 200 * 60)]);
    expect(derivePaces(samples)('g', 'pune')).toEqual(rat(270, 290));
  });

  it('falls back to transporter-wide history below 5 lane samples, then to p = 1', () => {
    const samples = [...Array(5)].map(() => sample('g', 'nashik', 27 * 60)).concat([sample('g', 'pune', 0)]);
    expect(derivePaces(samples)('g', 'pune')).toEqual(paceFromRate(rat(27, 270)));
    expect(derivePaces([])('g', 'pune')).toEqual(rat(1));
  });

  it('clamps p to at least 0.80', () => {
    expect(paceFromRate(rat(1))).toEqual(rat(80, 100));
  });
});

describe('movement', () => {
  it('moves at baseline × pace: 55 min from 09:30 covers 25.603 km (Pune segment 1, 30 km/h)', () => {
    const r = run([ship()], 9 * 60 + 30, 10 * 60 + 25);
    // exact value is 3300 s × 45e6×270/(5400×290) mm/s = 25,603,448.27…; floored per 5-min step
    expect(one(r).progressMm).toBeGreaterThanOrEqual(25_603_437);
    expect(one(r).progressMm).toBeLessThanOrEqual(25_603_448);
  });

  it('one long call equals many calls that stop on the grid (bit-identical)', () => {
    const long = run([ship()], 9 * 60 + 30, 13 * 60 + 30);
    let state = [ship()];
    for (let m = 9 * 60 + 30; m < 13 * 60 + 30; m += 5) state = run(state, m, m + 5).shipments;
    expect(state).toEqual(long.shipments);
  });

  it('an extra mid-step split differs by at most 1 mm per split, and is itself deterministic', () => {
    const plain = run([ship()], 9 * 60 + 30, 9 * 60 + 40);
    const a = run(run([ship()], 9 * 60 + 30, 9 * 60 + 37).shipments, 9 * 60 + 37, 9 * 60 + 40);
    const b = run(run([ship()], 9 * 60 + 30, 9 * 60 + 37).shipments, 9 * 60 + 37, 9 * 60 + 40);
    expect(Math.abs(one(a).progressMm - one(plain).progressMm)).toBeLessThanOrEqual(1);
    expect(a).toEqual(b);
  });

  it('crosses segment boundaries exactly and slows down on the ghat (20 km/h)', () => {
    const atGhat = ship({ progressMm: 45_000_000 });
    const v = speedMmPerSec(ROUTE.segments[1] as never, PACE, 0);
    const r = run([atGhat], 10 * 60, 10 * 60 + 5);
    expect(one(r).progressMm).toBe(45_000_000 + Number(floorTimes(v, 300n)));
  });

  it('physically arrives, then (autopilot) checks in and delivers after unloading', () => {
    const near = ship({ progressMm: 129_000_000 });
    const r = run([near], 13 * 60, 15 * 60);
    const x = one(r);
    expect(x.physicalArrivalS).not.toBeNull();
    expect(x.arrivedS).toBe(x.physicalArrivalS); // inside the window
    expect(x.deliveredS).toBe((x.arrivedS as number) + 3600);
    expect(x.milestone).toBe('DELIVERED');
    expect(x.onTime).toBe(true);
    expect(r.delivered).toEqual(['shp_x']);
  });

  it('an evening arrival waits for the next opening; the override accepts it instead (O-12)', () => {
    const late = ship({ progressMm: 129_900_000, promisedByS: s(18 * 60) });
    const waited = one(run([late], 19 * 60, 20 * 60));
    expect(waited.arrivedS).toBeNull(); // still waiting for 08:00
    const next = one(run([waited], 20 * 60, 24 * 60 + 9 * 60 + 5));
    expect(next.arrivedS).toBe(Math.floor(istAt('2026-11-20', 480).getTime() / 1000));
    expect(next.onTime).toBe(false);
    expect(next.delayMinutes).toBe(14 * 60);
    const withOverride = one(run([ship({ progressMm: 129_900_000, overrideEndS: s(19 * 60 + 30) })], 19 * 60, 19 * 60 + 30));
    expect(withOverride.arrivedS).toBe(withOverride.physicalArrivalS);
  });

  it('records the delay in whole minutes rounded up (L1)', () => {
    const x = one(run([ship({ progressMm: 129_999_000, promisedByS: s(9 * 60 + 29) })], 9 * 60 + 30, 9 * 60 + 35));
    expect(x.delayMinutes).toBe(Math.ceil(((x.arrivedS as number) - s(9 * 60 + 29)) / 60));
  });
});

describe('disruptions (L5 precedence)', () => {
  const rain = (pct: number, id = 'd1'): SimDisruption => ({ id, kind: 'WEATHER_SLOWDOWN', segmentCodes: ['PLT-KHP'], shipmentId: null, slowdownPct: pct, extraMinutesPerTruck: null, startS: s(9 * 60), endS: s(12 * 60), party: 'EXTERNAL', reason: 'HEAVY_RAIN', createdS: s(9 * 60), label: 'rain' });

  it('a slowdown reduces speed by its percentage; the largest overlapping slowdown wins', () => {
    const free = one(run([ship()], 9 * 60 + 30, 10 * 60));
    const slow = one(run([ship()], 9 * 60 + 30, 10 * 60, [rain(50)]));
    const both = one(run([ship()], 9 * 60 + 30, 10 * 60, [rain(50), rain(30, 'd2')]));
    expect(Math.abs(slow.progressMm * 2 - free.progressMm)).toBeLessThanOrEqual(12);
    expect(both.progressMm).toBe(slow.progressMm);
  });

  it('a road closure holds the truck at the segment start until it ends; mid-segment trucks continue', () => {
    const closure: SimDisruption = { id: 'c', kind: 'ROAD_CLOSURE', segmentCodes: ['KHP-LNV-GHAT'], shipmentId: null, slowdownPct: null, extraMinutesPerTruck: null, startS: s(10 * 60), endS: s(11 * 60), party: 'EXTERNAL', reason: 'ROAD_CLOSED', createdS: s(10 * 60), label: 'closure' };
    const atEntry = one(run([ship({ progressMm: 45_000_000 })], 10 * 60, 10 * 60 + 55, [closure]));
    expect(atEntry.progressMm).toBe(45_000_000);
    const inside = one(run([ship({ progressMm: 50_000_000 })], 10 * 60, 10 * 60 + 5, [closure]));
    expect(inside.progressMm).toBeGreaterThan(50_000_000);
    const after = one(run([atEntry], 10 * 60 + 55, 11 * 60 + 5, [closure]));
    expect(after.progressMm).toBeGreaterThan(45_000_000);
  });

  it('a breakdown stops the truck; a stop beats a slowdown; the latest-ending stop wins', () => {
    const bd: SimDisruption = { id: 'b', kind: 'TRUCK_BREAKDOWN', segmentCodes: [], shipmentId: 'shp_x', slowdownPct: null, extraMinutesPerTruck: null, startS: s(10 * 60), endS: s(11 * 60), party: 'TRANSPORTER', reason: 'BREAKDOWN', createdS: s(10 * 60), label: 'breakdown' };
    const before = ship({ progressMm: 10_000_000 });
    const stopped = one(run([before], 10 * 60, 10 * 60 + 30, [bd, rain(50)]));
    expect(stopped.progressMm).toBe(10_000_000);
    const both = ship({ progressMm: 10_000_000, stoppedUntilS: s(11 * 60 + 30), stopCause: { sourceKey: 'RPT:r1', party: 'TRANSPORTER', createdS: s(10 * 60 + 10) } });
    expect(holdEnd(both, ROUTE, [bd], s(10 * 60 + 15))).toBe(s(11 * 60 + 30));
  });
});

describe('plant gate', () => {
  const atGate = (code: string, queuedMin: number, over: Partial<SimShipment> = {}) =>
    ship({ id: code, code, milestone: 'AT_GATE', gateOutS: null, gateQueuedS: s(queuedMin), plannedGateS: s(queuedMin), plannedDepS: s(queuedMin + 40), truckId: code, ...over });

  it('serves the queue first-come-first-served across 3 bays (tie: shipment code)', () => {
    const q = [atGate('B', 480), atGate('A', 480), atGate('C', 481), atGate('D', 482)];
    const r = run(q, 8 * 60 + 5, 8 * 60 + 5);
    const loadStart = Object.fromEntries(r.shipments.map((x) => [x.code, x.loadingStartedS]));
    expect(loadStart).toEqual({ A: s(485), B: s(485), C: s(485), D: null });
    const later = run(r.shipments, 8 * 60 + 5, 8 * 60 + 50);
    expect(later.shipments.find((x) => x.code === 'D')?.loadingStartedS).toBe(s(525)); // first bay free at 08:45
  });

  it('orders by gate arrival time, not by shipment code (one bay: Z arrived first, so A waits)', () => {
    const busy = ship({ id: 'B1', code: 'B1', milestone: 'LOADING', gateOutS: null, loadingStartedS: s(470), loadingEndS: s(510), truckId: 'B1', plannedDepS: s(600) });
    const r = simulate({ shipments: [busy, atGate('Z', 480), atGate('A', 481)], routes: ROUTES, disruptions: [], config: { ...CFG, bays: 1 }, fromS: s(485), toS: s(530) });
    expect(r.shipments.find((x) => x.code === 'Z')?.loadingStartedS).toBe(s(510));
    expect(r.shipments.find((x) => x.code === 'A')?.loadingStartedS).toBeNull();
  });

  it('never leaves before the planned departure; the wait after it is the plant gate wait', () => {
    const early = atGate('E', 470, { plannedDepS: s(9 * 60 + 30) });
    const r = run([early], 7 * 60 + 50, 9 * 60 + 35);
    expect(one(r).gateOutS).toBe(s(9 * 60 + 30));
  });

  it('gate congestion adds its minutes to trucks starting to load while it is active', () => {
    const cong: SimDisruption = { id: 'g', kind: 'GATE_CONGESTION', segmentCodes: [], shipmentId: null, slowdownPct: null, extraMinutesPerTruck: 20, startS: s(8 * 60), endS: s(9 * 60), party: 'PLANT', reason: 'PLANT_GATE_WAIT', createdS: s(8 * 60), label: 'congestion' };
    const r = run([atGate('F', 485)], 8 * 60 + 5, 8 * 60 + 5, [cong]);
    expect(one(r).loadingEndS).toBe(s(485 + 60));
  });
});

describe('pings and determinism', () => {
  it('autopilot trucks ping every 30 min; seeded silent trucks stop pinging', () => {
    const loud = one(run([ship({ lastUpdateS: s(9 * 60 + 30) })], 9 * 60 + 30, 10 * 60 + 5));
    expect(loud.lastUpdateS).toBe(s(10 * 60));
    const quiet = one(run([ship({ lastUpdateS: s(9 * 60 + 30), silentFromS: s(9 * 60 + 45) })], 9 * 60 + 30, 10 * 60 + 5));
    expect(quiet.lastUpdateS).toBe(s(9 * 60 + 30));
  });

  it('manual (hero) trucks are never moved through milestones by the simulation', () => {
    const hero = ship({ autopilot: false, milestone: 'TRUCK_ASSIGNED', gateOutS: null });
    expect(one(run([hero], 8 * 60, 9 * 60)).milestone).toBe('TRUCK_ASSIGNED');
  });

  it('same input → identical output (no randomness, no wall clock)', () => {
    expect(run([ship()], 9 * 60 + 30, 12 * 60)).toEqual(run([ship()], 9 * 60 + 30, 12 * 60));
  });
});
