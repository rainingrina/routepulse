import type { RiskLevel } from '../api/contract';

/**
 * Screen-space grouping of truck markers (UI plan §8.2). Trucks whose markers would overlap on
 * screen are drawn as one cluster button placed at the position of its most urgent member — a real
 * truck position; no coordinate is moved or averaged. Pinned trucks (selected / hovered) are never
 * absorbed, so the truck the coordinator is working with always stays visible on its own.
 */

export interface ScreenTruck {
  id: string;
  x: number;
  y: number;
  level: RiskLevel | null;
}

export interface TruckGroup {
  /** The member whose marker element hosts the group (most urgent, then by id). */
  anchorId: string;
  /** Anchor first, then the rest in the same priority order. */
  memberIds: string[];
}

const LEVEL_PRIORITY: Record<RiskLevel | 'NONE', number> = { LATE: 4, AT_RISK: 3, WATCH: 2, ON_TRACK: 1, NONE: 0 };

export function levelPriority(level: RiskLevel | null): number {
  return LEVEL_PRIORITY[level ?? 'NONE'];
}

/** The most severe level among members (null when none has a level). */
export function worstLevel(levels: (RiskLevel | null)[]): RiskLevel | null {
  return levels.reduce<RiskLevel | null>((worst, l) => (levelPriority(l) > levelPriority(worst) ? l : worst), null);
}

/**
 * Greedy, deterministic grouping: trucks are visited most-urgent first (ties by id); each unvisited
 * truck collects every unvisited, unpinned truck within `radiusPx` of it.
 */
export function groupTrucks(trucks: ScreenTruck[], radiusPx: number, pinned: ReadonlySet<string>): TruckGroup[] {
  const order = [...trucks].sort((a, b) => levelPriority(b.level) - levelPriority(a.level) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const taken = new Set<string>();
  const groups: TruckGroup[] = [];
  const r2 = radiusPx * radiusPx;
  for (const t of order) {
    if (taken.has(t.id)) continue;
    taken.add(t.id);
    const members = [t.id];
    if (!pinned.has(t.id)) {
      for (const o of order) {
        if (taken.has(o.id) || pinned.has(o.id)) continue;
        const dx = o.x - t.x;
        const dy = o.y - t.y;
        if (dx * dx + dy * dy <= r2) {
          taken.add(o.id);
          members.push(o.id);
        }
      }
    }
    groups.push({ anchorId: t.id, memberIds: members });
  }
  return groups;
}
