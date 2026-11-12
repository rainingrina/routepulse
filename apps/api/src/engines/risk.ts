import { RISK_THRESHOLDS, type Confidence, type RiskLevel } from '@routepulse/shared';

/**
 * Risk rules (spec §5.4, engine doc §7, architecture §10.8). Pure, hand-written, versioned
 * ("eta-rules-v1"). No weights, no learned parameters, no probabilities.
 */

/** Round half up (x.5 → x+1), used wherever the documents say "rounded". */
export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

/**
 * Level from slack (minutes): ON_TRACK ≥ 120 · WATCH 0–119 · AT_RISK < 0; LATE when the promise
 * has passed (`now > promisedBy`) and the truck did not physically arrive inside the applicable
 * window by the promise (`arrivedOnTime` false).
 */
export function riskLevel(slackMinutes: number, nowS: number, promisedByS: number, arrivedOnTime: boolean): RiskLevel {
  if (nowS > promisedByS && !arrivedOnTime) return 'LATE';
  if (slackMinutes >= RISK_THRESHOLDS.onTrackMinSlack) return 'ON_TRACK';
  if (slackMinutes >= RISK_THRESHOLDS.watchMinSlack) return 'WATCH';
  return 'AT_RISK';
}

/** Sorting score: clamp(round(50 − slack ÷ 6), 0, 100). Never shown as a probability. */
export function riskScore(slackMinutes: number): number {
  return Math.min(100, Math.max(0, roundHalfUp(50 - slackMinutes / 6)));
}

/** Minutes since the last update, or null when the shipment has never sent one. */
export type UpdateAge = number | null;
const STALE_RANGE_AFTER_MIN = 120;
const HIGH_MAX_AGE_MIN = 60;
const MEDIUM_MAX_AGE_MIN = 180;

/**
 * Range half-width in minutes: ± (5% of minutes to predicted arrival + 30 if the last update is
 * older than 2 h + 20 per pending report), rounded to the nearest 5 (halves up). Integer
 * arithmetic in hundredths of a minute, so no floating-point edge can change the result.
 * A shipment with no update yet is treated as stale (interpretation, architecture §19).
 */
export function rangeMinutes(minutesToArrival: number, ageMin: UpdateAge, pendingReports: number): number {
  const stale = ageMin === null || ageMin > STALE_RANGE_AFTER_MIN;
  const hundredths = Math.max(0, minutesToArrival) * 5 + (stale ? 3000 : 0) + 2000 * pendingReports;
  return Math.floor((hundredths + 250) / 500) * 5;
}

/** HIGH ≤ 1 h and no pending report · MEDIUM 1–3 h or a pending report · LOW > 3 h (or never updated). */
export function confidence(ageMin: UpdateAge, pendingReports: number): Confidence {
  if (ageMin === null || ageMin > MEDIUM_MAX_AGE_MIN) return 'LOW';
  if (ageMin > HIGH_MAX_AGE_MIN || pendingReports > 0) return 'MEDIUM';
  return 'HIGH';
}

export function confidenceReason(ageMin: UpdateAge, pendingReports: number): string {
  const c = confidence(ageMin, pendingReports);
  if (ageMin === null) return 'Low — no tracking update yet';
  const age = ageMin < 60 ? `${ageMin} min` : `${Math.floor(ageMin / 60)} h ${ageMin % 60} min`;
  if (c === 'HIGH') return `High — last update ${age} ago`;
  if (c === 'MEDIUM' && pendingReports > 0 && ageMin <= HIGH_MAX_AGE_MIN) return 'Medium — driver report pending review';
  if (c === 'MEDIUM') return `Medium — last update ${age} ago${pendingReports > 0 ? '; driver report pending review' : ''}`;
  return `Low — no update for ${age}`;
}
