import { describe, expect, it } from 'vitest';
import type { EtaResult } from '../../src/engines/eta.js';
import { largestRemainder } from '../../src/engines/rounding.js';
import type { SimShipment } from '../../src/engines/simulate.js';
import { simulate } from '../../src/engines/simulate.js';
import { createPrng } from '../../src/seed/prng.js';
import { BREAKDOWN, CFG, RAIN, ROUTES, disruption, etaOf, heroAtGateOut, hm, s, settle } from '../helpers/engineWorld.js';

const iso = (min: number) => new Date(s(min) * 1000).toISOString();
const isoS = (sec: number) => new Date(sec * 1000).toISOString();
const FRI_0800 = 24 * 60 + 8 * 60;
const bars = (r: EtaResult) => r.factors.map((f) => [f.phase, f.code, f.minutes] as const);
const hero = (w: SimShipment[]) => w.find((x) => x.id === 'shp_1042') as SimShipment;

/** Hero world from the 09:30 gate-out, settled through the given (time, disruptions) path. */
function heroAt(min: number, disruptions = [RAIN, BREAKDOWN].filter((d) => d.startS <= s(min))) {
  return settle([heroAtGateOut()], s(hm(9, 30)), s(min), disruptions);
}

describe('F — SHP-1042 golden checkpoints with the history-derived pace (p = 270/290)', () => {
  it('09:30 gate-out: I = 40 GATE (Plant), E = 20 HIST → ETA 14:20, slack 220, ON_TRACK', () => {
    const r = etaOf([heroAtGateOut()], 'shp_1042', s(hm(9, 30)));
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(14, 20)));
    expect(bars(r)).toEqual([['INCURRED', 'GATE', 40], ['EXPECTED', 'HIST', 20]]);
    expect(r).toMatchObject({ slackMinutes: 220, level: 'ON_TRACK', score: 13, identityHolds: true });
    expect(r.totals).toEqual({ incurredMinutes: 40, planChangeMinutes: 0, expectedMinutes: 20 });
  });

  it('10:25 (demo start, G0): still 14:20 — 4 min moved from expected to incurred HIST; HIGH via GPS', () => {
    const w = heroAt(hm(10, 25));
    const r = etaOf(w, 'shp_1042', s(hm(10, 25)));
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(14, 20)));
    expect(bars(r)).toEqual([['INCURRED', 'GATE', 40], ['INCURRED', 'HIST', 4], ['EXPECTED', 'HIST', 16]]);
    expect(r).toMatchObject({ level: 'ON_TRACK', slackMinutes: 220, rangeMinutes: 10, confidence: 'HIGH', identityHolds: true });
  });

  it('10:30 rain on the ghat (s = 0.65): DISR +120, HIST 16 → ETA 16:20, slack 100, WATCH', () => {
    const w = heroAt(hm(10, 30));
    const r = etaOf(w, 'shp_1042', s(hm(10, 30)), [RAIN]);
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(16, 20)));
    expect(bars(r)).toEqual([['INCURRED', 'GATE', 40], ['INCURRED', 'HIST', 4], ['EXPECTED', 'HIST', 16], ['EXPECTED', 'DISR', 120]]);
    expect(r.factors.find((f) => f.code === 'DISR')).toMatchObject({ party: 'EXTERNAL', reason: 'HEAVY_RAIN', sourceRef: { type: 'DISRUPTION', id: 'dis_rain' } });
    expect(r).toMatchObject({ level: 'WATCH', slackMinutes: 100, score: 33, identityHolds: true });
    expect(r.totals).toEqual({ incurredMinutes: 44, planChangeMinutes: 0, expectedMinutes: 136 });
  });

  it('11:10 breakdown 180 min: road 19:20 → receiving gate Fri 08:00 (WIN 760 split), slack −840, AT_RISK', () => {
    const w = heroAt(hm(11, 10));
    const r = etaOf(w, 'shp_1042', s(hm(11, 10)), [RAIN, BREAKDOWN]);
    expect(isoS(r.projectedRoadArrivalS)).toBe(iso(hm(19, 20)));
    expect(isoS(r.predictedArrivalS)).toBe(iso(FRI_0800));
    expect(bars(r)).toEqual([
      ['INCURRED', 'GATE', 40], ['INCURRED', 'HIST', 7], ['INCURRED', 'DISR', 2],
      ['EXPECTED', 'HIST', 13], ['EXPECTED', 'DISR', 118], ['EXPECTED', 'DISR', 180], ['EXPECTED', 'WIN', 760],
    ]);
    const win = r.factors.find((f) => f.code === 'WIN');
    // Engine doc illustrated 85/422/253 with p = 0.93; the derived pace and second-level weights give 84/423/253.
    expect(win).toMatchObject({ party: null, split: [{ party: 'PLANT', minutes: 84 }, { party: 'TRANSPORTER', minutes: 423 }, { party: 'EXTERNAL', minutes: 253 }] });
    expect(win?.split?.some((p) => p.party === 'CUSTOMER')).toBe(false);
    expect(r).toMatchObject({ level: 'AT_RISK', slackMinutes: -840, score: 100, rangeMinutes: 65, confidence: 'HIGH', identityHolds: true });
    expect(r.totals).toEqual({ incurredMinutes: 49, planChangeMinutes: 0, expectedMinutes: 1071 });
    expect(r.summary).toBe('At risk: +180 min breakdown is the largest factor');
    expect(r.plainReason).toBe('Vehicle breakdown on the route');
  });

  it('11:25: the stopped minutes move from expected to incurred (I = 64), ETA unchanged', () => {
    const w = heroAt(hm(11, 25));
    const r = etaOf(w, 'shp_1042', s(hm(11, 25)), [RAIN, BREAKDOWN]);
    expect(isoS(r.predictedArrivalS)).toBe(iso(FRI_0800));
    expect(r.totals).toEqual({ incurredMinutes: 64, planChangeMinutes: 0, expectedMinutes: 1056 });
    expect(r.factors.filter((f) => f.phase === 'INCURRED').map((f) => f.minutes)).toEqual([40, 7, 2, 15]);
  });

  it('the receiving-gate ETA excludes unloading: arrival 17:50 is the ETA, delivery would be 18:50', () => {
    // Recovery result of Example 3, modelled as a stop until 12:40 (replacement transfer).
    const transfer = disruption({ id: 'dis_transfer', kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1042', startS: s(hm(11, 10)), endS: s(hm(12, 40)), party: 'TRANSPORTER', reason: 'BREAKDOWN' });
    const w = settle([heroAtGateOut()], s(hm(9, 30)), s(hm(11, 25)), [RAIN, transfer]);
    const r = etaOf(w, 'shp_1042', s(hm(11, 25)), [RAIN, transfer]);
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(17, 50)));
    expect(r).toMatchObject({ level: 'WATCH', slackMinutes: 10, identityHolds: true });
    expect(r.factors.some((f) => f.code === 'WIN')).toBe(false);
  });
});

describe('A — the four terms, identity and rounding', () => {
  it('P = 0 without a reroute; no PLAN_CHANGE bars', () => {
    for (const t of [hm(9, 30), hm(10, 30), hm(11, 10)]) {
      const r = etaOf(heroAt(t), 'shp_1042', s(t), [RAIN, BREAKDOWN].filter((d) => d.startS <= s(t)));
      expect(r.totals.planChangeMinutes).toBe(0);
      expect(r.factors.some((f) => f.phase === 'PLAN_CHANGE')).toBe(false);
    }
  });

  it('ET-1: planned + Σ bars = predicted, and Σ bars per phase = I and E, at every 5-min step 09:30 → 18:00', () => {
    let w = [heroAtGateOut()];
    for (let t = hm(9, 30); t <= hm(18, 0); t += 5) {
      if (t > hm(9, 30)) w = settle(w, s(t - 5), s(t), [RAIN, BREAKDOWN]);
      const r = etaOf(w, 'shp_1042', s(t), [RAIN, BREAKDOWN]);
      const phase = (p: string) => r.factors.filter((f) => f.phase === p).reduce((a, f) => a + f.minutes, 0);
      expect(r.identityHolds).toBe(true);
      expect(phase('INCURRED')).toBe(r.totals.incurredMinutes);
      expect(phase('EXPECTED')).toBe(r.totals.expectedMinutes);
      expect(r.plannedArrivalS / 60 + r.totals.incurredMinutes + r.totals.expectedMinutes).toBe(r.predictedArrivalS / 60);
    }
  });

  it('ET-3: with no new information the ETA is constant over 12 settles; minutes move from E to I', () => {
    let w = heroAt(hm(10, 30));
    const first = etaOf(w, 'shp_1042', s(hm(10, 30)), [RAIN]);
    let prevI = first.totals.incurredMinutes;
    for (let i = 1; i <= 12; i += 1) {
      const t = hm(10, 30) + 5 * i;
      w = settle(w, s(t - 5), s(t), [RAIN]);
      const r = etaOf(w, 'shp_1042', s(t), [RAIN]);
      expect(r.predictedArrivalS).toBe(first.predictedArrivalS);
      expect(r.totals.incurredMinutes).toBeGreaterThanOrEqual(prevI);
      expect(r.totals.incurredMinutes + r.totals.expectedMinutes).toBe(first.totals.incurredMinutes + first.totals.expectedMinutes);
      prevI = r.totals.incurredMinutes;
    }
    expect(prevI).toBeGreaterThan(first.totals.incurredMinutes);
  });

  it('ET-2: largest-remainder rounding sums exactly over 1,000 generated ledgers (fixed seed)', () => {
    const rng = createPrng(20261112);
    for (let i = 0; i < 1000; i += 1) {
      const weights = [...Array(rng.int(1, 7))].map(() => rng.int(0, 90_000));
      const total = weights.some((x) => x > 0) ? rng.int(0, 2000) : 0;
      const parts = largestRemainder(weights, total);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      const sum = weights.reduce((a, b) => a + b, 0);
      parts.forEach((p, j) => {
        const exact = sum === 0 ? 0 : ((weights[j] ?? 0) / sum) * total;
        expect(Math.abs(p - exact)).toBeLessThan(1);
      });
    }
  });

  it('ET-6: expected HIST is prorated to the remaining baseline: full (20) → half (10) → none after arrival', () => {
    expect(etaOf([heroAtGateOut()], 'shp_1042', s(hm(9, 30))).factors.find((f) => f.phase === 'EXPECTED' && f.code === 'HIST')?.minutes).toBe(20);
    // Halfway in baseline time: 135 of 270 min consumed (45 km + 15 km of the ghat) at 09:30 + 145 min.
    const half = heroAtGateOut({ progressMm: 60_000_000, ledger: { 'GATE|PLANT': 2400, 'HIST|TRANSPORTER': 600 } });
    expect(etaOf([half], 'shp_1042', s(hm(11, 55))).factors.find((f) => f.phase === 'EXPECTED' && f.code === 'HIST')?.minutes).toBe(10);
    const w = settle([heroAtGateOut()], s(hm(9, 30)), s(hm(14, 30)));
    // Movement is floored to whole millimetres per step, so the crossing can be a few seconds after the exact 14:20:00.
    expect((hero(w).physicalArrivalS as number) - s(hm(14, 20))).toBeGreaterThanOrEqual(0);
    expect((hero(w).physicalArrivalS as number) - s(hm(14, 20))).toBeLessThan(10);
    const r = etaOf(w, 'shp_1042', s(hm(14, 30)));
    expect(r.factors.filter((f) => f.phase === 'EXPECTED')).toEqual([]);
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(14, 20)));
  });

  it('a closure ahead adds the wait at the segment entry as DISR (113 min 20 s → ETA 16:13)', () => {
    const closure = disruption({ id: 'dis_close', kind: 'ROAD_CLOSURE', segmentCodes: ['KHP-LNV-GHAT'], startS: s(hm(10, 30)), endS: s(hm(13, 0)), party: 'EXTERNAL', reason: 'ROAD_CLOSED' });
    const w = heroAt(hm(10, 30), []);
    const r = etaOf(w, 'shp_1042', s(hm(10, 30)), [closure]);
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(16, 13)));
    expect(r.factors.find((f) => f.code === 'DISR')).toMatchObject({ phase: 'EXPECTED', party: 'EXTERNAL', reason: 'ROAD_CLOSED', minutes: 113 });
    expect(r.identityHolds).toBe(true);
  });

  it('before departure the gate queue is projected (GATE expected), I = 0 before the planned departure', () => {
    const busy = (code: string): SimShipment =>
      heroAtGateOut({ id: code, code, autopilot: true, milestone: 'LOADING', truckId: code, gateOutS: null, plannedDepS: s(hm(8, 50)), loadingStartedS: s(hm(8, 10)), loadingEndS: s(hm(8, 50)), ledger: {} });
    const h = heroAtGateOut({ milestone: 'AT_GATE', gateOutS: null, loadingStartedS: null, loadingEndS: null, ledger: {}, lastUpdateS: s(hm(8, 10)) });
    const world = [busy('B1'), busy('B2'), busy('B3'), h];
    const r = etaOf(world, 'shp_1042', s(hm(8, 10)));
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(14, 20)));
    expect(bars(r)).toEqual([['EXPECTED', 'GATE', 40], ['EXPECTED', 'HIST', 20]]);
    expect(r.totals.incurredMinutes).toBe(0);
  });
});

describe('ledger booking during settle (AT-1, ET-4, ET-8; L5)', () => {
  const ledgerAfter = (sh: SimShipment, fromMin: number, toMin: number, d = [] as Parameters<typeof settle>[3]) => (settle([sh], s(fromMin), s(toMin), d)[0] as SimShipment).ledger;

  it('before the planned departure nothing is booked; after it, a late truck books HIST and a truck at the gate books GATE', () => {
    const early = heroAtGateOut({ milestone: 'TRUCK_ASSIGNED', gateOutS: null, ledger: {} });
    expect(ledgerAfter(early, hm(8, 0), hm(8, 50))).toEqual({});
    expect(ledgerAfter(early, hm(8, 50), hm(9, 20))).toEqual({ 'HIST|TRANSPORTER': 1800 });
    const loading = heroAtGateOut({ milestone: 'LOADING', gateOutS: null, loadingEndS: s(hm(12, 0)), ledger: {} });
    expect(ledgerAfter(loading, hm(8, 40), hm(9, 20))).toEqual({ 'GATE|PLANT': 1800 });
  });

  it('moving with pace p: HIST = Δ(1 − p); with a slowdown s: DISR = Δ·s to the disruption, HIST = Δ(1 − s)(1 − p)', () => {
    expect(ledgerAfter(heroAtGateOut({ ledger: {} }), hm(9, 30), hm(10, 30))).toEqual({ 'HIST|TRANSPORTER': 248 }); // 3600 × 20/290
    const rain50 = disruption({ id: 'r50', kind: 'WEATHER_SLOWDOWN', segmentCodes: ['PLT-KHP'], slowdownPct: 50, startS: s(hm(9, 30)), endS: s(hm(12, 0)), party: 'EXTERNAL', reason: 'HEAVY_RAIN' });
    expect(ledgerAfter(heroAtGateOut({ ledger: {} }), hm(9, 30), hm(10, 30), [rain50])).toEqual({ 'DISR:r50|EXTERNAL': 1800, 'HIST|TRANSPORTER': 124 });
  });

  it('L5: a stop beats a slowdown; the latest-ending stop wins; the largest slowdown wins', () => {
    const rain = disruption({ id: 'r1', kind: 'WEATHER_SLOWDOWN', segmentCodes: ['PLT-KHP'], slowdownPct: 30, startS: s(hm(9, 30)), endS: s(hm(12, 0)) });
    const bd = disruption({ id: 'bd', kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1042', startS: s(hm(10, 0)), endS: s(hm(11, 0)), party: 'TRANSPORTER', reason: 'BREAKDOWN' });
    const moving = heroAtGateOut({ ledger: {}, progressMm: 10_000_000 });
    expect(ledgerAfter(moving, hm(10, 0), hm(10, 30), [bd, rain])).toEqual({ 'DISR:bd|TRANSPORTER': 1800 });
    const reported = heroAtGateOut({ ledger: {}, progressMm: 10_000_000, stoppedUntilS: s(hm(11, 30)), stopCause: { sourceKey: 'RPT:r1', party: 'TRANSPORTER', createdS: s(hm(10, 0)) } });
    expect(ledgerAfter(reported, hm(10, 0), hm(10, 30), [bd])).toEqual({ 'RPT:r1|TRANSPORTER': 1800 });
    const big = disruption({ id: 'r2', kind: 'WEATHER_SLOWDOWN', segmentCodes: ['PLT-KHP'], slowdownPct: 50, startS: s(hm(9, 30)), endS: s(hm(12, 0)) });
    const led = ledgerAfter(heroAtGateOut({ ledger: {} }), hm(9, 30), hm(10, 30), [rain, big]);
    expect(Object.keys(led).sort()).toEqual(['DISR:r2|EXTERNAL', 'HIST|TRANSPORTER']);
    expect(led['DISR:r2|EXTERNAL']).toBe(1800);
  });

  it('settle and projection book the same cause and seconds (no double counting): projected E becomes identical I', () => {
    // From 11:10 with rain and breakdown known, the realised future must equal the projection exactly.
    const w1110 = heroAt(hm(11, 10));
    const projected = etaOf(w1110, 'shp_1042', s(hm(11, 10)), [RAIN, BREAKDOWN]);
    const realised = settle(w1110, s(hm(11, 10)), s(FRI_0800 + 60), [RAIN, BREAKDOWN]);
    const atFri = etaOf(realised, 'shp_1042', s(FRI_0800 + 60), [RAIN, BREAKDOWN]);
    expect(atFri.predictedArrivalS).toBe(projected.predictedArrivalS);
    expect(atFri.factors.filter((f) => f.phase === 'EXPECTED')).toEqual([]);
    // Each projected cause became the same incurred cause (± 1 min of rounding per cause).
    const byCode = (r: EtaResult, phases: string[]) => {
      const m = new Map<string, number>();
      for (const f of r.factors) if (phases.includes(f.phase)) m.set(`${f.code}:${f.sourceRef?.id ?? ''}`, (m.get(`${f.code}:${f.sourceRef?.id ?? ''}`) ?? 0) + f.minutes);
      return m;
    };
    const expectedAll = byCode(projected, ['INCURRED', 'EXPECTED']);
    const incurredAll = byCode(atFri, ['INCURRED']);
    expect([...incurredAll.keys()].sort()).toEqual([...expectedAll.keys()].sort());
    for (const [k, v] of expectedAll) expect(Math.abs((incurredAll.get(k) ?? 0) - v)).toBeLessThanOrEqual(1);
    expect(atFri.totals.incurredMinutes).toBe(projected.totals.incurredMinutes + projected.totals.expectedMinutes);
  });

  it('ET-4: the ledger total does not depend on how settle calls are split (12 × 5 min = one 60-min call)', () => {
    const one = hero(settle(heroAt(hm(10, 30)), s(hm(10, 30)), s(hm(11, 30)), [RAIN, BREAKDOWN]));
    let w = heroAt(hm(10, 30));
    for (let t = hm(10, 30); t < hm(11, 30); t += 5) w = settle(w, s(t), s(t + 5), [RAIN, BREAKDOWN]);
    const many = hero(w);
    const sum = (l: Record<string, number>) => Object.values(l).reduce((a, b) => a + b, 0);
    expect(sum(many.ledger)).toBe(sum(one.ledger));
    for (const k of Object.keys(one.ledger)) expect(Math.abs((many.ledger[k] ?? 0) - (one.ledger[k] ?? 0))).toBeLessThanOrEqual(12);
    expect(many.progressMm).toBe(one.progressMm);
  });

  it('ET-7: WIN waits are split by the other parties’ minutes; with none it is UNATTRIBUTED, never the customer', () => {
    const atGate = (ledger: Record<string, number>) =>
      heroAtGateOut({ progressMm: 130_000_000, physicalArrivalS: s(hm(19, 20)), lastUpdateS: s(hm(19, 20)), ledger });
    expect(ledgerAfter(atGate({}), hm(19, 20), hm(20, 0))).toEqual({ 'WIN|UNATTRIBUTED': 2400 });
    expect(ledgerAfter(atGate({ 'GATE|PLANT': 600, 'HIST|TRANSPORTER': 1800 }), hm(19, 20), hm(20, 0))).toMatchObject({ 'WIN|PLANT': 600, 'WIN|TRANSPORTER': 1800 });
  });
});

describe('receiving window and arrival (L1, L4, L6, O-12)', () => {
  it('ET-9: physical arrival 17:50, ARRIVED not tapped at 18:20 → ETA 17:50, nothing booked after 17:50, not LATE', () => {
    const h = heroAtGateOut({ progressMm: 130_000_000, physicalArrivalS: s(hm(17, 50)), lastUpdateS: s(hm(17, 50)) });
    const w = settle([h], s(hm(17, 50)), s(hm(18, 20)));
    expect(hero(w).ledger).toEqual(h.ledger);
    expect(hero(w).milestone).toBe('IN_TRANSIT'); // manual: waits for the tap
    const r = etaOf(w, 'shp_1042', s(hm(18, 20)));
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(17, 50)));
    expect(r.level).toBe('WATCH'); // slack 10, promise passed but arrived in time
  });

  it('LATE when the promise passes and the truck has not arrived', () => {
    const w = heroAt(hm(18, 5));
    expect(etaOf(w, 'shp_1042', s(hm(18, 5)), [RAIN, BREAKDOWN]).level).toBe('LATE');
  });

  it('ET-10: with an override ending 19:30 the 19:20 road arrival is inside → WIN 0, ETA 19:20; default hours unchanged', () => {
    const w = heroAt(hm(11, 10)).map((x) => ({ ...x, overrideEndS: s(hm(19, 30)), promisedByS: s(hm(19, 30)) }));
    const r = etaOf(w, 'shp_1042', s(hm(11, 10)), [RAIN, BREAKDOWN]);
    expect(isoS(r.predictedArrivalS)).toBe(iso(hm(19, 20)));
    expect(r.factors.some((f) => f.code === 'WIN')).toBe(false);
    expect(r).toMatchObject({ slackMinutes: 10, level: 'WATCH' });
    expect(hero(w).hours).toEqual({ openMin: 480, closeMin: 1080 });
    expect(r.receivingWindow.overrideEndS).toBe(s(hm(19, 30)));
  });
});

describe('B — O-14 simulated GPS for the manual hero truck', () => {
  it('the manual truck pings every 30 min while on the road, even while stopped; pings never change milestones or create events', () => {
    const r = simulate({ shipments: [heroAtGateOut()], routes: ROUTES, disruptions: [RAIN, BREAKDOWN], config: CFG, fromS: s(hm(9, 30)), toS: s(hm(13, 5)) });
    const h = r.shipments[0] as SimShipment;
    expect(h.lastUpdateS).toBe(s(hm(13, 0))); // 10:00, 10:30, … 13:00 (stopped 11:10–14:10)
    expect(h.milestone).toBe('IN_TRANSIT');
    expect(r.events).toEqual([]);
  });

  it('a seeded silent truck stops pinging; a physically arrived truck no longer pings', () => {
    const silent = simulate({ shipments: [heroAtGateOut({ silentFromS: s(hm(10, 15)) })], routes: ROUTES, disruptions: [], config: CFG, fromS: s(hm(9, 30)), toS: s(hm(12, 0)) });
    expect((silent.shipments[0] as SimShipment).lastUpdateS).toBe(s(hm(10, 0)));
    const parked = heroAtGateOut({ progressMm: 130_000_000, physicalArrivalS: s(hm(14, 20)), lastUpdateS: s(hm(14, 20)) });
    const after = simulate({ shipments: [parked], routes: ROUTES, disruptions: [], config: CFG, fromS: s(hm(14, 20)), toS: s(hm(16, 0)) });
    expect((after.shipments[0] as SimShipment).lastUpdateS).toBe(s(hm(14, 20)));
  });

  it('thanks to GPS the hero keeps HIGH confidence through the afternoon; a silent truck drops to MEDIUM then LOW', () => {
    for (const t of [hm(12, 40), hm(14, 5), hm(15, 30), hm(17, 0)]) {
      expect(etaOf(heroAt(t), 'shp_1042', s(t), [RAIN, BREAKDOWN]).confidence).toBe('HIGH');
    }
    const silentAt = (t: number) => settle([heroAtGateOut({ silentFromS: s(hm(10, 15)) })], s(hm(9, 30)), s(t), [RAIN]);
    expect(etaOf(silentAt(hm(11, 30)), 'shp_1042', s(hm(11, 30)), [RAIN]).confidence).toBe('MEDIUM');
    const late = etaOf(silentAt(hm(13, 5)), 'shp_1042', s(hm(13, 5)), [RAIN]);
    expect(late.confidence).toBe('LOW');
    expect(late.rangeMinutes).toBeGreaterThanOrEqual(30); // +30 after 2 h without an update
  });
});

describe('G — determinism', () => {
  it('same world and time → identical result, every time', () => {
    const a = etaOf(heroAt(hm(11, 10)), 'shp_1042', s(hm(11, 10)), [RAIN, BREAKDOWN]);
    const b = etaOf(heroAt(hm(11, 10)), 'shp_1042', s(hm(11, 10)), [RAIN, BREAKDOWN]);
    expect(b).toEqual(a);
  });
});
