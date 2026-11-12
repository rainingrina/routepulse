import { addMinutes, istAt, istDate, istMinuteOfDay } from '../engines/time.js';
import { CUSTOMER_RECEIVING } from './referenceData.js';

/** Seed identity. Bump when seeded business data changes, so resets can be traced. */
export const SEED_NAME = 'hero-v1';

/** Demo day: a Thursday (journeys §3). All business times are simulation time, IST. */
export const DEMO_DATE = '2026-11-19';
/** The seed leaves the clock at Thu 08:00, paused (architecture §9.6, L2). */
export const SEED_START = istAt(DEMO_DATE, 8 * 60);

/** Fixed PRNG seed for the 60-day history. Changing it changes all history. */
export const HISTORY_PRNG_SEED = 20261119;
export const HISTORY_DAYS = 60;

export const COORDINATOR_ID = 'usr_coord_meera';

/** Local calendar date `days` before the demo date. */
export function daysBefore(days: number): string {
  return istDate(addMinutes(istAt(DEMO_DATE, 12 * 60), -days * 1440));
}

/**
 * Fictional promise rule for seeded orders [A] (seed data only, not an engine rule):
 * the first half-hour mark at least `bufferMinutes` after the planned arrival that lies inside
 * the customer's receiving hours; before opening → that day 09:00; after closing → the next day 09:00.
 */
export function seedPromise(plannedArrival: Date, bufferMinutes: number): Date {
  const earliest = addMinutes(plannedArrival, bufferMinutes);
  const minute = istMinuteOfDay(earliest);
  const roundedUp = addMinutes(earliest, (30 - (minute % 30)) % 30);
  const m = istMinuteOfDay(roundedUp);
  const day = istDate(roundedUp);
  if (m < CUSTOMER_RECEIVING.receivingOpenMin) return istAt(day, CUSTOMER_RECEIVING.receivingOpenMin + 60);
  if (m > CUSTOMER_RECEIVING.receivingCloseMin) return addMinutes(istAt(day, CUSTOMER_RECEIVING.receivingOpenMin + 60), 1440);
  return roundedUp;
}
