import { addProtocol, type LayerSpecification, type VectorSourceSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

/**
 * Offline regional basemap (architecture §16, decision O-11 approved 2026-11-12).
 *
 * The API serves `western-india.pmtiles` (created by `npm run basemap:fetch`) same-origin at /tiles,
 * read in byte ranges through the `pmtiles://` protocol. No tiles, fonts, sprites or images come from
 * any other host, so the CSP (`connect-src 'self'`) is unchanged and the map works with Wi-Fi off.
 *
 * Approved display rules: no international boundaries are drawn (only state borders), and the view
 * is locked to western India. Place names stay as HTML markers (§16.1), so no glyph files are needed.
 */

export const BASEMAP_PATH = '/tiles/western-india.pmtiles';
export const BASEMAP_SOURCE = 'basemap';

/** [west, south], [east, north] — the extract's bbox (scripts/fetch-basemap.sh) and the map's maxBounds. */
export const BASEMAP_BOUNDS: [[number, number], [number, number]] = [
  [71.0, 16.5],
  [80.5, 24.5],
];

export const BASEMAP_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://protomaps.com" target="_blank" rel="noopener noreferrer">Protomaps</a>';

let registered = false;
/** Registers the pmtiles:// protocol once per page (the PMTiles docs ask for a single registration). */
export function registerBasemapProtocol(): void {
  if (registered) return;
  const protocol = new Protocol();
  addProtocol('pmtiles', protocol.tile);
  registered = true;
}

export function basemapSource(origin: string): VectorSourceSpecification {
  return { type: 'vector', url: `pmtiles://${origin}${BASEMAP_PATH}`, attribution: BASEMAP_ATTRIBUTION };
}

export interface BasemapColors {
  land: string;
  water: string;
  border: string;
  road: string;
}

/**
 * Basemap layers (UI plan §8.1): land, water, state borders 1 px, main roads; no POIs, no labels.
 * Colours are the `--rp-map-*` tokens (roads: the surface token) passed in by the caller.
 * Boundaries: only `kind = region` (states) and never a feature marked `disputed`; `country`
 * boundaries are not drawn (approved decision).
 */
export function basemapLayers(c: BasemapColors): LayerSpecification[] {
  const src = { source: BASEMAP_SOURCE } as const;
  return [
    { id: 'bm-earth', type: 'fill', ...src, 'source-layer': 'earth', paint: { 'fill-color': c.land } },
    {
      id: 'bm-water',
      type: 'fill',
      ...src,
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': c.water },
    },
    {
      id: 'bm-roads',
      type: 'line',
      ...src,
      'source-layer': 'roads',
      minzoom: 6,
      filter: ['any', ['==', ['get', 'kind'], 'highway'], ['all', ['==', ['get', 'kind'], 'major_road'], ['>=', ['zoom'], 9]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.road,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 10, 1.6, 13, 3],
      },
    },
    {
      id: 'bm-state-borders',
      type: 'line',
      ...src,
      'source-layer': 'boundaries',
      filter: ['all', ['==', ['get', 'kind'], 'region'], ['!=', ['get', 'disputed'], true]],
      paint: { 'line-color': c.border, 'line-width': 1 },
    },
  ];
}

/** Basemap file availability (HEAD, same origin). false → the land-only fallback style is used. */
export async function basemapInstalled(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(BASEMAP_PATH, { method: 'HEAD', credentials: 'same-origin' });
    return res.ok;
  } catch {
    return false;
  }
}
