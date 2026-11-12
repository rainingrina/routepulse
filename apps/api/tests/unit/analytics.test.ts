import { describe, expect, it } from 'vitest';
import { aggregateDashboard, istWeekStart, median, pct, type ArrivedShipmentFact } from '../../src/engines/analytics.js';
import { istAt } from '../../src/engines/time.js';

/** #36 analytics engine (API §13, spec §5.9–§5.10, §7; engine doc Example 4). Pure function tests. */

const S = (d: Date) => Math.floor(d.getTime() / 1000);
const at = (day: string, h: number, m = 0) => S(istAt(day, h * 60 + m));

function ship(id: string, over: Partial<ArrivedShipmentFact> = {}): ArrivedShipmentFact {
  return {
    id,
    laneId: 'lane_a',
    laneName: 'A lane',
    transporterId: 'trn_t',
    transporterName: 'T Carriers',
    fleetSize: 8,
    arrivedS: at('2026-11-18', 12),
    promisedS: at('2026-11-18', 13),
    onTime: true,
    delayMinutes: 0,
    firstAtRiskS: null,
    customerNotifiedS: null,
    renegotiated: false,
    recoveryChosen: false,
    rows: [],
    ...over,
  };
}
const row = (id: string, party: ArrivedShipmentFact['rows'][number]['party'], minutes: number, reason: ArrivedShipmentFact['rows'][number]['reason'] = null, kind: ArrivedShipmentFact['rows'][number]['kind'] = 'TIME_LOST') => ({
  id,
  party,
  reason,
  kind,
  delaySeconds: minutes * 60,
});
const WINDOW = { fromS: at('2026-10-20', 10), toS: at('2026-11-19', 10) };

describe('helpers', () => {
  it('pct: one decimal, null when nothing to divide', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(0, 5)).toBe(0);
    expect(pct(0, 0)).toBeNull();
  });
  it('median: odd middle, even = mean of the middle two half-up, empty = null', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2])).toBe(2); // 1.5 → 2
    expect(median([10, 20, 30, 41])).toBe(25); // 25
    expect(median([-3, -2])).toBe(-2); // −2.5 → −2 (half-up)
    expect(median([])).toBeNull();
  });
  it('istWeekStart: Monday 00:00 IST (UTC Sunday 18:30), boundaries exact', () => {
    const mon = at('2026-11-16', 0);
    expect(new Date(istWeekStart(at('2026-11-19', 10)) * 1000).toISOString()).toBe('2026-11-15T18:30:00.000Z');
    expect(istWeekStart(mon)).toBe(mon);
    expect(istWeekStart(mon - 1)).toBe(mon - 7 * 86400); // Sunday 23:59:59 IST belongs to the previous week
    expect(istWeekStart(at('2026-11-22', 23, 59))).toBe(mon);
  });
});

describe('aggregateDashboard', () => {
  it('empty set: zero counts, null percentages and medians, empty weeks kept, no shares', () => {
    const d = aggregateDashboard([], WINDOW);
    expect(d.arrivedCount).toBe(0);
    expect(d.kpis).toEqual({ onTimePct: null, lateCount: 0, medianDelayMinutesOfLate: null, medianWarningLeadMinutes: null, proactiveNoticeRatePct: null, recoveredPct: null, renegotiatedCount: 0 });
    expect(d.onTimeByLane).toEqual([]);
    expect(d.transporterTable).toEqual([]);
    expect(d.weeklyTrend.length).toBe(5); // weeks of 19 Oct … 16 Nov touch a 30-day window
    expect(d.weeklyTrend.every((w) => w.delivered === 0 && w.onTimePct === null)).toBe(true);
    expect(d.causesByParty.map((c) => [c.party, c.minutes, c.sharePct])).toEqual([
      ['PLANT', 0, null],
      ['TRANSPORTER', 0, null],
      ['CUSTOMER', 0, null],
      ['EXTERNAL', 0, null],
      ['UNATTRIBUTED', 0, null],
    ]);
  });

  it('window is inclusive at both ends, by arrivedAt (L1)', () => {
    const d = aggregateDashboard(
      [ship('a', { arrivedS: WINDOW.fromS }), ship('b', { arrivedS: WINDOW.toS }), ship('c', { arrivedS: WINDOW.fromS - 1 }), ship('d', { arrivedS: WINDOW.toS + 1 })],
      WINDOW,
    );
    expect(d.arrivedCount).toBe(2);
    expect(d.weeklyTrend.reduce((a, w) => a + w.delivered, 0)).toBe(2);
  });

  it('raw vs fair on-time with the but-for rule (engine doc Example 4: raw 33.3, fair 66.7, gap 33.3)', () => {
    const h1 = ship('h1', { onTime: false, delayMinutes: 50, rows: [row('r1', 'PLANT', 70, 'PLANT_GATE_WAIT'), row('r2', 'TRANSPORTER', 20, 'TRANSPORTER_PACE')] });
    const h2 = ship('h2', { onTime: false, delayMinutes: 15, rows: [row('r3', 'TRANSPORTER', 30, 'BREAKDOWN'), row('r4', 'EXTERNAL', 10, 'HEAVY_RAIN')] });
    const h3 = ship('h3', { onTime: true, delayMinutes: 0, rows: [row('r5', 'TRANSPORTER', 25, 'TRANSPORTER_PACE')] });
    const d = aggregateDashboard([h1, h2, h3], WINDOW);
    expect(d.transporterTable).toEqual([
      {
        transporterId: 'trn_t',
        name: 'T Carriers',
        fleetSize: 8,
        isSmall: true,
        delivered: 3,
        rawOnTimePct: 33.3,
        fairOnTimePct: 66.7,
        gapPct: 33.3,
        medianDelayMinutesOfLate: 33, // (15 + 50) / 2 = 32.5 → 33
        topCause: { party: 'PLANT', reason: 'PLANT_GATE_WAIT' }, // 70 > T pace 45 > breakdown 30
      },
    ]);
    expect(d.kpis.onTimePct).toBe(33.3);
    expect(d.kpis.lateCount).toBe(2);
  });

  it('a late shipment caused only by plant gate wait or weather does not lower fair on-time (AC-F1.2)', () => {
    const d = aggregateDashboard(
      [
        ship('x', { onTime: false, delayMinutes: 40, rows: [row('a', 'PLANT', 40, 'PLANT_GATE_WAIT')] }),
        ship('y', { onTime: false, delayMinutes: 30, rows: [row('b', 'EXTERNAL', 40, 'HEAVY_RAIN'), row('c', 'UNATTRIBUTED', 5, null, 'GAP')] }),
        // TRANSPORTER minutes in a GAP row would be a data error, but they are never used for blame
        ship('z', { onTime: false, delayMinutes: 10, rows: [row('d', 'TRANSPORTER', 12, null, 'GAP')] }),
      ],
      WINDOW,
    );
    expect(d.transporterTable[0]).toMatchObject({ rawOnTimePct: 0, fairOnTimePct: 100, gapPct: 100 });
  });

  it('KPIs: warning lead median, proactive notice, recovered, renegotiated', () => {
    const p = at('2026-11-18', 18);
    const ships = [
      // reached AT_RISK 6 h 50 m before the promise, notified at once, recovery chosen, on time → recovered
      ship('a', { promisedS: p, arrivedS: p - 600, firstAtRiskS: p - 410 * 60, customerNotifiedS: p - 410 * 60, recoveryChosen: true }),
      // reached AT_RISK 60 min before, notified, no recovery, late
      ship('b', { promisedS: p, arrivedS: p + 1800, onTime: false, delayMinutes: 30, firstAtRiskS: p - 3600, customerNotifiedS: p - 3600 }),
      // late without ever being flagged; never notified
      ship('c', { promisedS: p, arrivedS: p + 600, onTime: false, delayMinutes: 10 }),
      // on time, never at risk, renegotiated window
      ship('d', { promisedS: p, arrivedS: p - 60, renegotiated: true }),
      // notified only after the promise → not proactive
      ship('e', { promisedS: p, arrivedS: p + 120, onTime: false, delayMinutes: 2, firstAtRiskS: p + 60, customerNotifiedS: p + 60 }),
      // reached AT_RISK, arrived on time on its own (no recovery chosen) → not "recovered"
      ship('f', { promisedS: p, arrivedS: p - 30, firstAtRiskS: p - 120 * 60, customerNotifiedS: p - 120 * 60 }),
    ];
    const d = aggregateDashboard(ships, WINDOW);
    expect(d.kpis.medianWarningLeadMinutes).toBe(90); // [−1, 60, 120, 410] → (60 + 120) / 2
    expect(d.kpis.proactiveNoticeRatePct).toBe(60); // a, b, f notified before promise ÷ a, b, c, e, f
    expect(d.kpis.recoveredPct).toBe(25); // a ÷ a, b, e, f
    expect(d.kpis.renegotiatedCount).toBe(1);
    expect(d.kpis.onTimePct).toBe(50);
    expect(d.kpis.medianDelayMinutesOfLate).toBe(10); // [2, 10, 30]
  });

  it('causes: all attributed minutes; GAP under Unattributed by party only; shares sum to 100.0', () => {
    const ships = [
      ship('a', { rows: [row('a1', 'PLANT', 40, 'PLANT_GATE_WAIT'), row('a2', 'TRANSPORTER', 20, 'TRANSPORTER_PACE')] }),
      ship('b', { laneId: 'lane_b', laneName: 'B lane', transporterId: 'trn_u', transporterName: 'U Lines', fleetSize: 40, rows: [row('b1', 'EXTERNAL', 120, 'HEAVY_RAIN'), row('b2', 'UNATTRIBUTED', 7, null, 'GAP')] }),
    ];
    const d = aggregateDashboard(ships, WINDOW);
    expect(d.causesByParty.map((c) => [c.party, c.minutes])).toEqual([
      ['PLANT', 40],
      ['TRANSPORTER', 20],
      ['CUSTOMER', 0],
      ['EXTERNAL', 120],
      ['UNATTRIBUTED', 7],
    ]);
    expect(d.causesByParty.reduce((a, c) => a + (c.sharePct ?? 0) * 10, 0)).toBe(1000);
    expect(d.causesByReason).toEqual([
      { reason: 'HEAVY_RAIN', party: 'EXTERNAL', minutes: 120 },
      { reason: 'PLANT_GATE_WAIT', party: 'PLANT', minutes: 40 },
      { reason: 'TRANSPORTER_PACE', party: 'TRANSPORTER', minutes: 20 },
    ]);
    expect(d.causesByLane.map((l) => [l.laneName, l.byParty.map((p) => p.minutes)])).toEqual([
      ['A lane', [40, 20, 0, 0, 0]],
      ['B lane', [0, 0, 0, 120, 7]],
    ]);
    expect(d.causesByTransporter.map((t) => t.name)).toEqual(['T Carriers', 'U Lines']);
    expect(d.onTimeByTransporter.map((t) => [t.name, t.isSmall])).toEqual([
      ['T Carriers', true],
      ['U Lines', false],
    ]);
  });

  it('per-shipment rounding: row minutes add up to the rounded shipment total (largest remainder)', () => {
    // 90 s + 90 s = 3 min total → rows 2 + 1 (not 1.5 + 1.5 rounded to 2 + 2)
    const d = aggregateDashboard([ship('a', { rows: [{ id: 'r1', party: 'PLANT', reason: 'PLANT_GATE_WAIT', kind: 'TIME_LOST', delaySeconds: 90 }, { id: 'r2', party: 'EXTERNAL', reason: 'TRAFFIC', kind: 'TIME_LOST', delaySeconds: 90 }] })], WINDOW);
    expect(d.causesByParty.reduce((a, c) => a + c.minutes, 0)).toBe(3);
  });

  it('weekly trend: Monday-00:00-IST buckets, empty weeks included, counts add up', () => {
    const ships = [ship('a', { arrivedS: at('2026-11-16', 0) }), ship('b', { arrivedS: at('2026-11-15', 23, 59), onTime: false, delayMinutes: 5 }), ship('c', { arrivedS: at('2026-11-19', 9) })];
    const d = aggregateDashboard(ships, WINDOW);
    const byWeek = Object.fromEntries(d.weeklyTrend.map((w) => [w.weekStart, [w.delivered, w.onTimePct]]));
    expect(byWeek['2026-11-15T18:30:00.000Z']).toEqual([2, 100]); // week of Mon 16 Nov
    expect(byWeek['2026-11-08T18:30:00.000Z']).toEqual([1, 0]); // Sun 15 Nov 23:59 IST
    expect(d.weeklyTrend[0]?.weekStart).toBe('2026-10-18T18:30:00.000Z'); // week of Mon 19 Oct (window starts Tue 20 Oct)
    expect(d.weeklyTrend.reduce((a, w) => a + w.delivered, 0)).toBe(d.arrivedCount);
  });
});
