import type { GeoJSONLineString, Segment } from '@routepulse/shared';
import { segmentBaselineMinutes } from '../guards/geo.js';

/**
 * Route in simulation units: integer millimetres and integer baseline seconds per segment.
 * Baseline seconds come from the rounded segment minutes (architecture §10.1), so the sum over
 * segments equals Route.baselineMinutes × 60 exactly.
 */
export interface SimSegment {
  code: string;
  startMm: number;
  endMm: number;
  baselineSec: number;
}

export interface SimRoute {
  id: string;
  lengthMm: number;
  segments: SimSegment[];
}

const KM_TO_MM = 1_000_000;

export function toSimRoute(id: string, segments: readonly Segment[]): SimRoute {
  const segs = segments.map((s) => ({
    code: s.segmentCode,
    startMm: Math.round(s.startKm * KM_TO_MM),
    endMm: Math.round(s.endKm * KM_TO_MM),
    baselineSec: segmentBaselineMinutes(s) * 60,
  }));
  const last = segs[segs.length - 1];
  if (!last) throw new RangeError(`route ${id} has no segments`);
  return { id, lengthMm: last.endMm, segments: segs };
}

/** Segment containing position `mm`; a position exactly on a boundary belongs to the next segment. */
export function segmentAt(route: SimRoute, mm: number): SimSegment | null {
  if (mm >= route.lengthMm) return null;
  return route.segments.find((s) => mm < s.endMm) ?? null;
}

/** Baseline seconds consumed by the distance already covered (architecture §10.1, "C"). */
export function baselineSecondsConsumed(route: SimRoute, mm: number): number {
  let sec = 0;
  for (const s of route.segments) {
    if (mm >= s.endMm) sec += s.baselineSec;
    else {
      if (mm > s.startMm) sec += (s.baselineSec * (mm - s.startMm)) / (s.endMm - s.startMm);
      break;
    }
  }
  return sec;
}

// ───────────── map position (display only; never feeds the simulation) ─────────────

const R_EARTH_KM = 6371.0088;
function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * Point along a (hand-traced) route line at the same fraction of length as `mm` of the planning
 * length. Returns [lng, lat] and the bearing in degrees. Display only.
 */
export function positionAlong(line: GeoJSONLineString, fraction: number): { lng: number; lat: number; bearing: number } {
  const coords = line.coordinates;
  const f = Math.min(1, Math.max(0, fraction));
  const legs = coords.slice(1).map((c, i) => haversineKm(coords[i] as [number, number], c));
  const total = legs.reduce((a, b) => a + b, 0);
  let target = f * total;
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i] as number;
    const a = coords[i] as [number, number];
    const b = coords[i + 1] as [number, number];
    if (target <= leg || i === legs.length - 1) {
      const t = leg === 0 ? 0 : Math.min(1, target / leg);
      const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
      return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, bearing: (bearing + 360) % 360 };
    }
    target -= leg;
  }
  const last = coords[coords.length - 1] as [number, number];
  return { lng: last[0], lat: last[1], bearing: 0 };
}
