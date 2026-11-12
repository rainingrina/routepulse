import { FACTOR_CODES, FACTOR_PHASES, PARTIES, REASON_CODES, REPORT_STATUSES, type Factor } from '@routepulse/shared';

/** Hand-written guard for RiskSnapshot.factors (Json column; architecture §8.4). Run on write and read. */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const isMinutes = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function isFactor(v: unknown): v is Factor {
  if (!isObj(v)) return false;
  if (!oneOf(FACTOR_CODES, v.code) || !oneOf(FACTOR_PHASES, v.phase) || !isMinutes(v.minutes)) return false;
  if (!(v.party === null || oneOf(PARTIES, v.party))) return false;
  if (!(v.reason === null || oneOf(REASON_CODES, v.reason))) return false;
  if (typeof v.label !== 'string' || typeof v.detail !== 'string') return false;
  if (!(v.reviewStatus === null || oneOf(REPORT_STATUSES, v.reviewStatus))) return false;
  if (v.split !== null) {
    if (!Array.isArray(v.split) || !v.split.every((p) => isObj(p) && oneOf(PARTIES, p.party) && isMinutes(p.minutes))) return false;
  }
  if (v.sourceRef !== null) {
    const r = v.sourceRef;
    if (!isObj(r) || !(r.type === 'DISRUPTION' || r.type === 'DRIVER_REPORT') || typeof r.id !== 'string') return false;
  }
  return true;
}

export const isFactorArray = (v: unknown): v is Factor[] => Array.isArray(v) && v.every(isFactor);
