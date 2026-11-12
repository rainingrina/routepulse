import { describe, expect, it } from 'vitest';
import { eligibleCheckIn, splitKnockOn, windowWaitMinutes } from '../../src/engines/receivingWindow.js';
import { largestRemainder } from '../../src/engines/rounding.js';
import { istAt, istMinuteOfDay } from '../../src/engines/time.js';

const HOURS = { openMin: 480, closeMin: 1080 }; // 08:00–18:00
const THU = '2026-11-19';
const FRI = '2026-11-20';

describe('largestRemainder', () => {
  it('always sums exactly to the total (property check over a fixed sample)', () => {
    let a = 7;
    for (let i = 0; i < 1000; i += 1) {
      a = (a * 1103515245 + 12345) % 2147483648; // deterministic LCG, no Math.random
      const weights = [a % 97, (a >> 3) % 53, (a >> 7) % 211, (a >> 11) % 5].map((w) => w + 0.5);
      const total = a % 1000;
      const parts = largestRemainder(weights, total);
      expect(parts.reduce((x, y) => x + y, 0)).toBe(total);
      expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });

  it('breaks ties deterministically toward the lower index', () => {
    expect(largestRemainder([1, 1, 1], 1)).toEqual([1, 0, 0]);
  });

  it('rejects a non-zero total over zero weights', () => {
    expect(() => largestRemainder([0, 0], 3)).toThrow();
  });
});

describe('receiving window (L1, L4)', () => {
  it('keeps an arrival inside the default window', () => {
    const at = istAt(THU, 17 * 60 + 50);
    expect(eligibleCheckIn(at, HOURS).getTime()).toBe(at.getTime());
  });

  it('treats the closing minute as inside the window', () => {
    const at = istAt(THU, 18 * 60);
    expect(eligibleCheckIn(at, HOURS).getTime()).toBe(at.getTime());
  });

  it('moves an evening arrival to the next opening (hero: 19:20 → Fri 08:00, 760 min)', () => {
    const at = istAt(THU, 19 * 60 + 20);
    expect(eligibleCheckIn(at, HOURS).getTime()).toBe(istAt(FRI, 480).getTime());
    expect(windowWaitMinutes(at, HOURS)).toBe(760);
  });

  it('moves an early-morning arrival to the same day opening', () => {
    expect(eligibleCheckIn(istAt(THU, 5 * 60), HOURS).getTime()).toBe(istAt(THU, 480).getTime());
  });

  it('accepts a road arrival up to the shipment override without changing default hours (19:20 ≤ 19:30)', () => {
    const at = istAt(THU, 19 * 60 + 20);
    const override = istAt(THU, 19 * 60 + 30);
    expect(eligibleCheckIn(at, HOURS, override).getTime()).toBe(at.getTime());
    expect(HOURS).toEqual({ openMin: 480, closeMin: 1080 });
    expect(eligibleCheckIn(istAt(THU, 19 * 60 + 40), HOURS, override).getTime()).toBe(istAt(FRI, 480).getTime());
  });
});

describe('knock-on split of WIN (engine doc Example 2)', () => {
  it('splits 760 min over PLANT 40 / TRANSPORTER 200 / EXTERNAL 120 as 85 / 422 / 253', () => {
    expect(splitKnockOn(760, { PLANT: 40, TRANSPORTER: 200, EXTERNAL: 120 })).toEqual({ EXTERNAL: 253, PLANT: 85, TRANSPORTER: 422 });
  });

  it('never assigns WIN to the customer when nothing else caused delay', () => {
    expect(splitKnockOn(30, {})).toEqual({ UNATTRIBUTED: 30 });
  });

  it('returns nothing when there is no wait', () => {
    expect(splitKnockOn(0, { PLANT: 10 })).toEqual({});
  });
});

describe('IST helpers', () => {
  it('converts local IST wall time to UTC and back', () => {
    const at = istAt(THU, 8 * 60);
    expect(at.toISOString()).toBe('2026-11-19T02:30:00.000Z');
    expect(istMinuteOfDay(at)).toBe(480);
  });
});
