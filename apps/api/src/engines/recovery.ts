import type { RecoveryKind } from '@routepulse/shared';
import { RECOVERY_CONFIG } from '../config/recovery.js';
import type { SimRoute } from './simRoute.js';

/**
 * Pure recovery rules (engine doc §8, architecture §12, spec §5.6). No database, no clock.
 * The ETA of every option is NOT computed here: it comes from the one projection path
 * (etaService.explainIn) on a modified copy of the world.
 */

export interface OptionDraft {
  kind: RecoveryKind;
  feasible: boolean;
  infeasibleReason: string | null;
  newEtaS: number | null;
  meetsPromise: boolean;
  extraCostInr: number;
}

const NEVER_SUGGESTED: readonly RecoveryKind[] = ['NEW_WINDOW', 'NOTIFY_ONLY'];
const KIND_ORDER: readonly RecoveryKind[] = ['REPLACEMENT_TRUCK', 'REROUTE', 'SPLIT', 'NEW_WINDOW', 'NOTIFY_ONLY'];

/**
 * Suggested (AC-M4.4): among feasible options that meet the current promise, excluding NEW_WINDOW
 * and NOTIFY_ONLY, the lowest cost (ties → earliest ETA, then kind order). If none meets the
 * promise, the feasible option with the smallest delay (earliest ETA; same exclusions). Else none.
 */
export function suggestedKind(options: readonly OptionDraft[]): RecoveryKind | null {
  const pool = options.filter((o) => o.feasible && o.newEtaS !== null && !NEVER_SUGGESTED.includes(o.kind));
  const byKind = (a: OptionDraft, b: OptionDraft) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  const meeting = pool.filter((o) => o.meetsPromise).sort((a, b) => a.extraCostInr - b.extraCostInr || (a.newEtaS as number) - (b.newEtaS as number) || byKind(a, b));
  if (meeting[0]) return meeting[0].kind;
  const fastest = [...pool].sort((a, b) => (a.newEtaS as number) - (b.newEtaS as number) || a.extraCostInr - b.extraCostInr || byKind(a, b));
  return fastest[0]?.kind ?? null;
}

/**
 * NEW_WINDOW end (architecture §12, L4): projected road arrival rounded UP to the next 30-minute
 * mark; must be later than the current promise and at most promise + 48 h. Null = not offerable.
 */
export function newWindowEnd(roadArrivalS: number, promisedByS: number): { endS: number } | { reason: string } {
  const step = RECOVERY_CONFIG.newWindowStepMinutes * 60;
  const endS = Math.ceil(roadArrivalS / step) * step;
  if (endS <= promisedByS) return { reason: 'The truck already reaches the gate by the current promise.' };
  if (endS > promisedByS + RECOVERY_CONFIG.newWindowMaxHours * 3600) return { reason: 'The new window would be more than 48 h after the promise.' };
  return { endS };
}

/** Travel minutes at the configured replacement speed, rounded up to the whole minute. */
export function travelMinutes(km: number): number {
  return Math.ceil((km / RECOVERY_CONFIG.replacementSpeedKmh) * 60);
}

export function replacementCostInr(km: number): number {
  return RECOVERY_CONFIG.dispatchInr + Math.round(km * RECOVERY_CONFIG.perKmInr) + RECOVERY_CONFIG.transferFeeInr;
}

/**
 * Where two routes of a lane diverge: the end (mm) of their common prefix of identical segments.
 * A reroute is possible only while the truck is strictly before this point.
 */
export function divergenceMm(a: SimRoute, b: SimRoute): number {
  let end = 0;
  for (let i = 0; i < Math.min(a.segments.length, b.segments.length); i += 1) {
    const x = a.segments[i];
    const y = b.segments[i];
    if (!x || !y || x.code !== y.code || x.startMm !== y.startMm || x.endMm !== y.endMm) break;
    end = x.endMm;
  }
  return end;
}

/** Segment codes still ahead of a position on a route (the current segment included). */
export function remainingSegments(route: SimRoute, progressMm: number): string[] {
  return route.segments.filter((s) => s.endMm > progressMm).map((s) => s.code);
}

export interface TruckCandidate {
  id: string;
  code: string;
  roadKm: number;
  defaultDriverUserId: string;
}

/** Nearest candidate within the radius (ties → truck code). */
export function nearestCandidate(candidates: readonly TruckCandidate[]): TruckCandidate | null {
  return [...candidates].filter((c) => c.roadKm <= RECOVERY_CONFIG.replacementRadiusKm).sort((a, b) => a.roadKm - b.roadKm || (a.code < b.code ? -1 : 1))[0] ?? null;
}
