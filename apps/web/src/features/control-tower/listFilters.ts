import type { RiskLevel, ShipmentListItemCoordinator } from '../../api/contract';

/** UI plan §6.3 filter chips: All · At risk · Watch · On track · Late. */
export type LevelFilter = 'ALL' | RiskLevel;
export const LEVEL_FILTERS: LevelFilter[] = ['ALL', 'AT_RISK', 'WATCH', 'ON_TRACK', 'LATE'];

export function parseLevelFilter(v: string | null): LevelFilter {
  return (LEVEL_FILTERS as string[]).includes(v ?? '') ? (v as LevelFilter) : 'ALL';
}

/**
 * Client-side filter + code search over the loaded, server-sorted list (UI plan §6.3: search is
 * client-side over the loaded list). Keeps the API's risk order; never re-ranks.
 */
export function filterShipments(
  items: ShipmentListItemCoordinator[],
  level: LevelFilter,
  query: string,
): ShipmentListItemCoordinator[] {
  const q = query.trim().toLowerCase();
  return items.filter((s) => (level === 'ALL' || s.riskLevel === level) && (q === '' || s.code.toLowerCase().includes(q)));
}

export function countByLevel(items: ShipmentListItemCoordinator[]): Record<RiskLevel, number> {
  const out: Record<RiskLevel, number> = { ON_TRACK: 0, WATCH: 0, AT_RISK: 0, LATE: 0 };
  for (const s of items) if (s.riskLevel) out[s.riskLevel] += 1;
  return out;
}

/** Ids whose level became AT_RISK since the previous list (for the one-time highlight and announcement). */
export function newlyAtRisk(
  previous: Map<string, RiskLevel | null> | null,
  items: ShipmentListItemCoordinator[],
): ShipmentListItemCoordinator[] {
  if (!previous) return [];
  return items.filter((s) => s.riskLevel === 'AT_RISK' && previous.has(s.id) && previous.get(s.id) !== 'AT_RISK');
}
