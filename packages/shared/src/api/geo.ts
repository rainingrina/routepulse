/** Route geometry types (06_API_SPEC.md §2.2). */

/** One stretch of road along a route. `segmentCode` is shared by routes that use the same road. */
export interface Segment {
  segmentCode: string;
  name: string;
  /** Distance from the route start, km. */
  startKm: number;
  endKm: number;
  /** Baseline (planning) speed for this stretch, km/h. */
  speedKmh: number;
}

/** GeoJSON LineString, coordinates as [lng, lat]. */
export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
  /** GeoJSON foreign member naming the geometry's origin; every seed route is 'HAND_TRACED_DEMO'. */
  x_source?: GeometrySource;
}

/**
 * Where a route's geometry came from. All current seed routes are hand-traced demo lines
 * (task 4.1; the one-time open-routing export was not available). They are approximate
 * illustrations, not routing-engine output.
 */
export type GeometrySource = 'HAND_TRACED_DEMO';
