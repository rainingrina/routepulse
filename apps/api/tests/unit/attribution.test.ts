import { describe, expect, it } from 'vitest';
import {
  REASON_DEFAULTS,
  countsAgainstTransporter,
  defaultParty,
  gapSeconds,
  onTimeByTransporter,
  rowMinutes,
  totalsByParty,
} from '../../src/engines/attribution.js';
import { classify, words } from '../../src/engines/classifier.js';

describe('CL-1 keyword classifier (KEYWORD_LIST_V1, AC-F2.2)', () => {
  it('"tyre puncture near Lonavala" → BREAKDOWN, matched tyre + puncture, STRONG', () => {
    expect(classify('tyre puncture near Lonavala')).toEqual({ suggestedReason: 'BREAKDOWN', matchedKeywords: ['tyre', 'puncture'], strength: 'STRONG' });
  });

  it('"stuck at plant gate" → PLANT_GATE_WAIT; one keyword is WEAK; unknown text → no suggestion', () => {
    expect(classify('stuck at plant gate')).toMatchObject({ suggestedReason: 'PLANT_GATE_WAIT', matchedKeywords: ['plant', 'gate'], strength: 'STRONG' });
    expect(classify('Heavy RAIN here')).toMatchObject({ suggestedReason: 'HEAVY_RAIN', strength: 'WEAK' });
    expect(classify('all good, tea break')).toEqual({ suggestedReason: null, matchedKeywords: [], strength: 'NONE' });
  });

  it('a tie between reasons gives no suggestion but still shows the matched words', () => {
    expect(classify('rain and traffic')).toEqual({ suggestedReason: null, matchedKeywords: ['traffic', 'rain'], strength: 'NONE' });
  });

  it('matches whole words only; hyphens and case are normalised', () => {
    expect(words("E-way bill, driver's papers")).toEqual(['eway', 'bill', 'drivers', 'papers']);
    expect(classify('E-way bill papers missing').suggestedReason).toBe('DOCUMENTS');
    expect(classify('engineering team').suggestedReason).toBeNull(); // "engine" is not a whole word here
  });
});

describe('reason defaults (spec §5.8)', () => {
  it('match the documented table; DOCUMENTS is Plant before gate-out, External after', () => {
    expect(REASON_DEFAULTS.BREAKDOWN).toEqual({ minutes: 180, party: 'TRANSPORTER' });
    expect(REASON_DEFAULTS.UNLOADING_WAIT).toEqual({ minutes: 90, party: 'CUSTOMER' });
    expect(REASON_DEFAULTS.OTHER).toEqual({ minutes: 60, party: 'UNATTRIBUTED' });
    expect(defaultParty('DOCUMENTS', false)).toBe('PLANT');
    expect(defaultParty('DOCUMENTS', true)).toBe('EXTERNAL');
    expect(defaultParty('ROAD_CLOSED', false)).toBe('EXTERNAL');
  });
});

describe('reconciliation and GAP (AT-4, spec §5.9)', () => {
  it('GAP = (arrivedAt − plannedArrival) − attributed; 0 when the ledger explains everything; never negative', () => {
    expect(gapSeconds(10_000, 4_000, 6_000)).toBe(0);
    expect(gapSeconds(10_000, 4_000, 5_880)).toBe(120);
    expect(() => gapSeconds(10_000, 4_000, 6_001)).toThrow('attribution exceeds the real delay by 1 s');
  });

  it('row minutes add up to the rounded shipment total (largest remainder)', () => {
    const secs = [2400, 1205, 7195, 10800, 45620];
    const mins = rowMinutes(secs);
    expect(mins.reduce((a, b) => a + b, 0)).toBe(Math.round(secs.reduce((a, b) => a + b, 0) / 60));
    expect(rowMinutes([0, 0])).toEqual([0, 0]);
    expect(totalsByParty([{ party: 'PLANT', minutes: 4 }, { party: 'PLANT', minutes: 6 }])).toEqual({ PLANT: 10, TRANSPORTER: 0, CUSTOMER: 0, EXTERNAL: 0, UNATTRIBUTED: 0 });
  });
});

describe('AT-2 but-for rule and raw vs fair on-time (engine doc Example 4)', () => {
  it('plant-only delay never counts against the transporter (AC-F1.2); transporter-only does', () => {
    expect(countsAgainstTransporter(50, 0)).toBe(false);
    expect(countsAgainstTransporter(15, 30)).toBe(true);
  });

  it('mixed: counts only if removing the transporter minutes makes it on time; on time never counts', () => {
    expect(countsAgainstTransporter(50, 20)).toBe(false); // H-1: still 30 late without the transporter
    expect(countsAgainstTransporter(20, 20)).toBe(true); // exactly on time without them
    expect(countsAgainstTransporter(0, 25)).toBe(false); // H-3: on time
  });

  it('Example 4: raw 1 of 3 (33.3 %) vs fair 2 of 3 (66.7 %)', () => {
    const out = onTimeByTransporter([
      { transporterId: 't', onTime: false, countsAgainstTransporter: countsAgainstTransporter(50, 20) },
      { transporterId: 't', onTime: false, countsAgainstTransporter: countsAgainstTransporter(15, 30) },
      { transporterId: 't', onTime: true, countsAgainstTransporter: countsAgainstTransporter(0, 25) },
    ]);
    expect(out.get('t')).toEqual({ shipments: 3, rawOnTime: 1, fairOnTime: 2 });
  });
});
