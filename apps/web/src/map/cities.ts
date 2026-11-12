/**
 * City-name labels for the offline basemap (Phase A enhancement, approved 2026-11-12). Local point
 * data — no geocoding or network call. Coordinates are the city centres in WGS84 (decimal degrees),
 * the same points the seed uses for the fictional customer sites in these cities. `rank` sets the
 * collision priority (1 = placed first) and `minZoom` the zoom from which a label may appear.
 */
export interface CityLabel {
  name: string;
  lng: number;
  lat: number;
  rank: number;
  minZoom: number;
}

export const CITY_LABELS: readonly CityLabel[] = [
  { name: 'Ahmedabad', lng: 72.5714, lat: 23.0225, rank: 1, minZoom: 4 },
  { name: 'Surat', lng: 72.8311, lat: 21.1702, rank: 2, minZoom: 4 },
  { name: 'Pune', lng: 73.8567, lat: 18.5204, rank: 3, minZoom: 4 },
  { name: 'Nagpur', lng: 79.0882, lat: 21.1458, rank: 4, minZoom: 4 },
  { name: 'Indore', lng: 75.8577, lat: 22.7196, rank: 5, minZoom: 4 },
  { name: 'Nashik', lng: 73.7898, lat: 19.9975, rank: 6, minZoom: 5 },
];

/** GeoJSON for the MapLibre source (properties used by the symbol layer). */
export function cityLabelsGeoJSON() {
  return {
    type: 'FeatureCollection' as const,
    features: CITY_LABELS.map((c) => ({
      type: 'Feature' as const,
      properties: { name: c.name, rank: c.rank, minZoom: c.minZoom },
      geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] as [number, number] },
    })),
  };
}
