import { IST_OFFSET_MINUTES } from '../config/engine.js';

/** Pure time helpers. Business times are stored in UTC and interpreted in Asia/Kolkata (UTC+05:30, no DST). */

export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 1440;

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MINUTE_MS;
}

/** UTC instant for a local IST calendar date ('YYYY-MM-DD') and minutes after local midnight. */
export function istAt(localDate: string, minutesAfterMidnight: number): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new RangeError(`invalid local date: ${localDate}`);
  const [, y, mo, d] = m;
  const utcMidnight = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  return new Date(utcMidnight + (minutesAfterMidnight - IST_OFFSET_MINUTES) * MINUTE_MS);
}

/** Minutes after local IST midnight (0 ≤ x < 1440, may be fractional). */
export function istMinuteOfDay(date: Date): number {
  const local = date.getTime() / MINUTE_MS + IST_OFFSET_MINUTES;
  return ((local % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** UTC instant of local IST midnight for the day containing `date`. */
export function istMidnight(date: Date): Date {
  return new Date(date.getTime() - istMinuteOfDay(date) * MINUTE_MS);
}

/** Local IST calendar date 'YYYY-MM-DD' of an instant. */
export function istDate(date: Date): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MINUTE_MS);
  return shifted.toISOString().slice(0, 10);
}
