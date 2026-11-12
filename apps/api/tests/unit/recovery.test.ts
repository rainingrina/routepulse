import type { Segment } from '@routepulse/shared';
import { describe, expect, it } from 'vitest';
import { divergenceMm, nearestCandidate, newWindowEnd, remainingSegments, replacementCostInr, suggestedKind, travelMinutes, type OptionDraft } from '../../src/engines/recovery.js';
import { isOptionParams } from '../../src/guards/recovery.js';
import { toSimRoute } from '../../src/engines/simRoute.js';
import { istAt } from '../../src/engines/time.js';

const s = (h: number, m: number) => Math.floor(istAt('2026-11-19', h * 60 + m).getTime() / 1000);
const opt = (kind: OptionDraft['kind'], o: Partial<OptionDraft> = {}): OptionDraft => ({ kind, feasible: true, infeasibleReason: null, newEtaS: s(17, 0), meetsPromise: true, extraCostInr: 1000, ...o });

describe('RC-2 Suggested rule (AC-M4.4)', () => {
  it('lowest cost among feasible options that meet the promise; never NEW_WINDOW or NOTIFY_ONLY', () => {
    expect(suggestedKind([opt('NOTIFY_ONLY', { extraCostInr: 0 }), opt('NEW_WINDOW', { extraCostInr: 0 }), opt('REPLACEMENT_TRUCK', { extraCostInr: 6100 }), opt('REROUTE', { extraCostInr: 1265 })])).toBe('REROUTE');
  });
  it('ties on cost → earliest ETA; infeasible options are ignored', () => {
    expect(suggestedKind([opt('REROUTE', { extraCostInr: 500, newEtaS: s(17, 30) }), opt('SPLIT', { extraCostInr: 500, newEtaS: s(17, 0) }), opt('REPLACEMENT_TRUCK', { feasible: false, extraCostInr: 0 })])).toBe('SPLIT');
  });
  it('none meets the promise → the smallest delay; nothing feasible → no suggestion', () => {
    expect(suggestedKind([opt('SPLIT', { meetsPromise: false, newEtaS: s(19, 0), extraCostInr: 10 }), opt('REPLACEMENT_TRUCK', { meetsPromise: false, newEtaS: s(18, 30), extraCostInr: 9000 }), opt('NOTIFY_ONLY', { meetsPromise: false, newEtaS: s(18, 0) })])).toBe('REPLACEMENT_TRUCK');
    expect(suggestedKind([opt('NOTIFY_ONLY'), opt('NEW_WINDOW')])).toBeNull();
  });
});

describe('NEW_WINDOW end (L4)', () => {
  it('road arrival 19:20 → 19:30 (rounded up to 30 min); exactly on a mark stays', () => {
    expect(newWindowEnd(s(19, 20), s(18, 0))).toEqual({ endS: s(19, 30) });
    expect(newWindowEnd(s(19, 30), s(18, 0))).toEqual({ endS: s(19, 30) });
  });
  it('not later than the promise, or more than 48 h after it → not offerable, with a reason', () => {
    expect(newWindowEnd(s(17, 20), s(18, 0))).toEqual({ reason: 'The truck already reaches the gate by the current promise.' });
    expect(newWindowEnd(s(18, 0) + 49 * 3600, s(18, 0))).toEqual({ reason: 'The new window would be more than 48 h after the promise.' });
  });
});

describe('replacement truck arithmetic (fictional rate card [A])', () => {
  it('20 km at 40 km/h = 30 min; cost ₹3,000 + 20 km × ₹55 + ₹2,000 = ₹6,100 (engine doc Example 3)', () => {
    expect(travelMinutes(20)).toBe(30);
    expect(travelMinutes(1.5)).toBe(3);
    expect(replacementCostInr(20)).toBe(6100);
  });
  it('nearest candidate within the 50 km radius, ties by truck code', () => {
    const c = (code: string, roadKm: number) => ({ id: code, code, roadKm, defaultDriverUserId: 'd' });
    expect(nearestCandidate([c('TRK-20', 20), c('TRK-11', 20), c('TRK-09', 5)])?.code).toBe('TRK-09');
    expect(nearestCandidate([c('TRK-11', 20), c('TRK-12', 20)])?.code).toBe('TRK-11');
    expect(nearestCandidate([c('TRK-99', 51)])).toBeNull();
  });
});

describe('route divergence (REROUTE feasibility)', () => {
  const seg = (code: string, a: number, b: number, kmh: number): Segment => ({ segmentCode: code, name: code, startKm: a, endKm: b, speedKmh: kmh });
  const A = toSimRoute('A', [seg('PLT-KHP', 0, 45, 30), seg('KHP-LNV-GHAT', 45, 65, 20), seg('LNV-PUN', 65, 130, 32.5)]);
  const B = toSimRoute('B', [seg('PLT-KHP', 0, 45, 30), seg('KHP-PUN-S', 45, 153, 24)]);
  it('Pune routes share PLT-KHP: they split at 45 km; remaining segments from a position', () => {
    expect(divergenceMm(A, B)).toBe(45_000_000);
    expect(remainingSegments(A, 46_000_000)).toEqual(['KHP-LNV-GHAT', 'LNV-PUN']);
    expect(remainingSegments(A, 0)).toEqual(['PLT-KHP', 'KHP-LNV-GHAT', 'LNV-PUN']);
  });
});

describe('option params guard (Json column, architecture §8.4)', () => {
  it('accepts each kind with its fields and rejects wrong shapes', () => {
    expect(isOptionParams({ kind: 'NEW_WINDOW', newWindowEndS: s(19, 30) }, 'NEW_WINDOW')).toBe(true);
    expect(isOptionParams({ kind: 'REPLACEMENT_TRUCK', truckId: 't', truckCode: 'TRK-11', driverUserId: 'u', roadKm: 20, travelMinutes: 30, transferMinutes: 45, stopUntilS: 1, breakdown: { type: 'REPORT', reportId: 'r' } })).toBe(true);
    expect(isOptionParams({ kind: 'REPLACEMENT_TRUCK', truckId: 't', breakdown: { type: 'X' } })).toBe(false);
    expect(isOptionParams({ kind: 'NEW_WINDOW', newWindowEndS: 1 }, 'REROUTE')).toBe(false);
    expect(isOptionParams({ kind: 'NONE' })).toBe(true);
    expect(isOptionParams('x')).toBe(false);
  });
});
