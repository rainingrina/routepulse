import type { Party } from '@routepulse/shared';
import { largestRemainder } from './rounding.js';
import { DAY_MINUTES, addMinutes, istMidnight, istMinuteOfDay } from './time.js';

/**
 * Receiving-window rules (architecture §10.1, engine doc §2 and §6; decisions L1, L4).
 *
 * - Eligibility is decided by ARRIVAL time at the customer's gate.
 * - Applicable window = the customer's default hours, OR (after an accepted NEW_WINDOW) any road
 *   arrival up to this shipment's `receivingWindowOverrideEndAt`.
 * - Eligible check-in = the road arrival if inside the applicable window, otherwise the next
 *   default opening time after it.
 * The same function is used by settlement, projection and the seed so the rule is identical.
 */
export interface ReceivingHours {
  openMin: number; // minutes after local midnight
  closeMin: number;
}

export function isInsideDefaultWindow(at: Date, hours: ReceivingHours): boolean {
  const m = istMinuteOfDay(at);
  return m >= hours.openMin && m <= hours.closeMin;
}

export function eligibleCheckIn(roadArrival: Date, hours: ReceivingHours, overrideEndAt: Date | null = null): Date {
  if (isInsideDefaultWindow(roadArrival, hours)) return roadArrival;
  if (overrideEndAt && roadArrival.getTime() <= overrideEndAt.getTime() && istMinuteOfDay(roadArrival) >= hours.openMin) {
    // Override extends the same day's acceptance up to its end (L4); it never moves the opening time.
    return roadArrival;
  }
  const midnight = istMidnight(roadArrival);
  const minute = istMinuteOfDay(roadArrival);
  const opensToday = addMinutes(midnight, hours.openMin);
  return minute < hours.openMin ? opensToday : addMinutes(midnight, DAY_MINUTES + hours.openMin);
}

/** Minutes waited for the window (WIN) for a given road arrival. */
export function windowWaitMinutes(roadArrival: Date, hours: ReceivingHours, overrideEndAt: Date | null = null): number {
  return (eligibleCheckIn(roadArrival, hours, overrideEndAt).getTime() - roadArrival.getTime()) / 60_000;
}

/**
 * Knock-on split of WIN (spec §5.9, AC-F1.4): WIN units are divided across parties in proportion
 * to each party's other delay units on the shipment, with largest-remainder rounding.
 * Never assigned to the customer by default; with no other delay it is UNATTRIBUTED.
 * Units are integers (minutes or seconds — the caller decides).
 */
export function splitKnockOn(winUnits: number, otherUnitsByParty: Partial<Record<Party, number>>): Partial<Record<Party, number>> {
  if (winUnits === 0) return {};
  const parties = (Object.keys(otherUnitsByParty) as Party[])
    .filter((p) => (otherUnitsByParty[p] ?? 0) > 0)
    .sort();
  if (parties.length === 0) return { UNATTRIBUTED: winUnits };
  const parts = largestRemainder(parties.map((p) => otherUnitsByParty[p] ?? 0), winUnits);
  const out: Partial<Record<Party, number>> = {};
  parties.forEach((p, i) => {
    const v = parts[i] ?? 0;
    if (v > 0) out[p] = v;
  });
  return out;
}
