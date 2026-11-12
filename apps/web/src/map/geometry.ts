/**
 * Display-only geometry helpers for the map. No routing, no ETA logic.
 *
 * Segment highlighting slices a route line by `startKm/lengthKm … endKm/lengthKm` of its planar length.
 * This assumes the route geometry is roughly km-proportional — to be confirmed with Dev A
 * (docs/FRONTEND_BACKEND_HANDOFF.md §5).
 */
export type LngLat = [number, number];

function cumulativeLengths(coords: LngLat[]): { lens: number[]; total: number } {
  const lens = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(total);
  }
  return { lens, total };
}

function pointAt(coords: LngLat[], lens: number[], dist: number): LngLat {
  for (let i = 1; i < coords.length; i++) {
    if (dist <= lens[i]! || i === coords.length - 1) {
      const a = coords[i - 1]!;
      const b = coords[i]!;
      const span = lens[i]! - lens[i - 1]!;
      const r = span === 0 ? 0 : Math.min(Math.max((dist - lens[i - 1]!) / span, 0), 1);
      return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
    }
  }
  return coords[coords.length - 1]!;
}

/** Sub-line between fractions f0 and f1 (0–1) of the line's length. */
export function sliceLine(coords: LngLat[], f0: number, f1: number): LngLat[] {
  if (coords.length < 2) return coords;
  const { lens, total } = cumulativeLengths(coords);
  const d0 = Math.max(0, Math.min(f0, 1)) * total;
  const d1 = Math.max(0, Math.min(f1, 1)) * total;
  const out: LngLat[] = [pointAt(coords, lens, d0)];
  for (let i = 1; i < coords.length - 1; i++) if (lens[i]! > d0 && lens[i]! < d1) out.push(coords[i]!);
  out.push(pointAt(coords, lens, d1));
  return out;
}

/** Point at the middle of a line (for disruption label pills). */
export function midpoint(coords: LngLat[]): LngLat {
  const { lens, total } = cumulativeLengths(coords);
  return pointAt(coords, lens, total / 2);
}

/** [[minLng, minLat], [maxLng, maxLat]] or null for no points. */
export function boundsOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
