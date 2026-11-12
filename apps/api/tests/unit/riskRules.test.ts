import { describe, expect, it } from 'vitest';
import { confidence, confidenceReason, rangeMinutes, riskLevel, riskScore } from '../../src/engines/risk.js';

const NOW = 1_000_000;
const LATER_PROMISE = NOW + 3600;

describe('RK-1 level thresholds (spec §5.4)', () => {
  it('slack 120 → ON_TRACK, 119 and 0 → WATCH, −1 → AT_RISK', () => {
    expect(riskLevel(120, NOW, LATER_PROMISE, false)).toBe('ON_TRACK');
    expect(riskLevel(119, NOW, LATER_PROMISE, false)).toBe('WATCH');
    expect(riskLevel(0, NOW, LATER_PROMISE, false)).toBe('WATCH');
    expect(riskLevel(-1, NOW, LATER_PROMISE, false)).toBe('AT_RISK');
  });

  it('LATE once now > promisedBy and the truck has not arrived in time; never LATE at the promise itself', () => {
    expect(riskLevel(-30, NOW, NOW - 60, false)).toBe('LATE');
    expect(riskLevel(-30, NOW, NOW, false)).toBe('AT_RISK');
    // physically arrived inside the applicable window before the promise → not late, even if not yet tapped
    expect(riskLevel(10, NOW, NOW - 60, true)).toBe('WATCH');
  });
});

describe('RK-2 score', () => {
  it('clamp(round(50 − slack ÷ 6), 0, 100) at −600 / 0 / +600 and in between', () => {
    expect(riskScore(-600)).toBe(100);
    expect(riskScore(0)).toBe(50);
    expect(riskScore(600)).toBe(0);
    expect(riskScore(220)).toBe(13); // 50 − 36.67 = 13.33
    expect(riskScore(100)).toBe(33);
    expect(riskScore(-840)).toBe(100);
  });
});

describe('RK-3 range and confidence by update age', () => {
  it('confidence: 0:59 HIGH · 1:01 MEDIUM · 3:01 LOW · pending report → MEDIUM · never updated → LOW', () => {
    expect(confidence(59, 0)).toBe('HIGH');
    expect(confidence(60, 0)).toBe('HIGH');
    expect(confidence(61, 0)).toBe('MEDIUM');
    expect(confidence(180, 0)).toBe('MEDIUM');
    expect(confidence(181, 0)).toBe('LOW');
    expect(confidence(5, 1)).toBe('MEDIUM');
    expect(confidence(200, 1)).toBe('LOW');
    expect(confidence(null, 0)).toBe('LOW');
  });

  it('range: 5% of minutes to arrival, +30 after 2 h without update, +20 per pending report, nearest 5 (halves up)', () => {
    expect(rangeMinutes(221, 0, 0)).toBe(10); // 11.05 → 10 (engine doc Ex 1)
    expect(rangeMinutes(290, 0, 0)).toBe(15); // 14.5 → 15
    expect(rangeMinutes(235, 0, 0)).toBe(10); // 11.75 → 10
    expect(rangeMinutes(1250, 0, 1)).toBe(85); // 62.5 + 20 = 82.5 → 85 (engine doc Ex 2)
    expect(rangeMinutes(1250, 0, 0)).toBe(65); // 62.5 → 65
    expect(rangeMinutes(100, 119, 0)).toBe(5);
    expect(rangeMinutes(100, 121, 0)).toBe(35); // 2:01 → +30
    expect(rangeMinutes(100, null, 0)).toBe(35);
    expect(rangeMinutes(-10, 0, 0)).toBe(0);
  });

  it('confidence reasons are plain and name the cause', () => {
    expect(confidenceReason(25, 0)).toBe('High — last update 25 min ago');
    expect(confidenceReason(10, 1)).toBe('Medium — driver report pending review');
    expect(confidenceReason(200, 0)).toBe('Low — no update for 3 h 20 min');
    expect(confidenceReason(null, 0)).toBe('Low — no tracking update yet');
  });
});
