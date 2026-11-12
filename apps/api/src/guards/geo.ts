import type { GeoJSONLineString, Segment } from '@routepulse/shared';

/** Hand-written runtime guards for Route Json columns (architecture §8.4; no schema library). */

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isLineString(v: unknown): v is GeoJSONLineString {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { type?: unknown; coordinates?: unknown };
  return (
    o.type === 'LineString' &&
    Array.isArray(o.coordinates) &&
    o.coordinates.length >= 2 &&
    o.coordinates.every(
      (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        isFiniteNumber(c[0]) &&
        isFiniteNumber(c[1]) &&
        c[0] >= -180 &&
        c[0] <= 180 &&
        c[1] >= -90 &&
        c[1] <= 90,
    )
  );
}

export function isSegment(v: unknown): v is Segment {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s['segmentCode'] === 'string' &&
    s['segmentCode'].length > 0 &&
    typeof s['name'] === 'string' &&
    isFiniteNumber(s['startKm']) &&
    isFiniteNumber(s['endKm']) &&
    isFiniteNumber(s['speedKmh']) &&
    s['speedKmh'] > 0 &&
    s['endKm'] > s['startKm']
  );
}

export function isSegmentArray(v: unknown): v is Segment[] {
  return Array.isArray(v) && v.length > 0 && v.every(isSegment);
}

/** Baseline minutes of one segment, rounded once (architecture §10.1). */
export function segmentBaselineMinutes(s: Segment): number {
  return Math.round(((s.endKm - s.startKm) / s.speedKmh) * 60);
}

/**
 * Structural checks for a route (schema §5.6): segments ordered and contiguous from 0, last
 * endKm = lengthKm, Σ rounded segment minutes = baselineMinutes. Returns problems (empty = valid).
 */
export function routeProblems(route: { code: string; lengthKm: number; baselineMinutes: number; segments: unknown; geometry: unknown }): string[] {
  const problems: string[] = [];
  if (!isLineString(route.geometry)) problems.push(`${route.code}: geometry is not a valid GeoJSON LineString`);
  if (!isSegmentArray(route.segments)) {
    problems.push(`${route.code}: segments are not a valid Segment[]`);
    return problems;
  }
  const segs = route.segments;
  if (segs[0]?.startKm !== 0) problems.push(`${route.code}: first segment must start at 0 km`);
  for (let i = 1; i < segs.length; i += 1) {
    if (segs[i]?.startKm !== segs[i - 1]?.endKm) problems.push(`${route.code}: segment ${i} is not contiguous`);
  }
  const last = segs[segs.length - 1];
  if (last && Math.abs(last.endKm - route.lengthKm) > 1e-9) problems.push(`${route.code}: last endKm ≠ lengthKm`);
  const minutes = segs.reduce((a, s) => a + segmentBaselineMinutes(s), 0);
  if (minutes !== route.baselineMinutes) {
    problems.push(`${route.code}: Σ segment minutes ${minutes} ≠ baselineMinutes ${route.baselineMinutes}`);
  }
  return problems;
}
