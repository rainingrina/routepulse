import { addProtocol, type LayerSpecification, type SourceSpecification, type VectorSourceSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { cityLabelsGeoJSON } from './cities';

/**
 * Offline regional basemap (architecture §16, decision O-11 approved 2026-11-12).
 *
 * The API serves `western-india.pmtiles` (created by `npm run basemap:fetch`) same-origin at /tiles,
 * read in byte ranges through the `pmtiles://` protocol. No tiles, fonts, sprites or images come from
 * any other host, so the CSP (`connect-src 'self'`) is unchanged and the map works with Wi-Fi off.
 *
 * Approved display rules: no international boundaries are drawn (only state borders), and the view
 * is locked to western India. City-name labels (six lane cities, local data in ./cities) are a MapLibre
 * symbol layer using one Latin glyph range (Noto Sans Regular, OFL) also served by the API at /glyphs.
 */

export const BASEMAP_PATH = '/tiles/western-india.pmtiles';
export const BASEMAP_SOURCE = 'basemap';
export const CITY_SOURCE = 'city-labels';
export const CITY_FONT = 'Noto Sans Regular';
export const GLYPH_PROBE_PATH = `/glyphs/${encodeURIComponent(CITY_FONT)}/0-255.pbf`;
/** The first operational overlay layer in MapView; everything from the basemap goes below it. */
export const FIRST_OVERLAY_LAYER = 'routes-alt';

export const glyphsUrl = (origin: string) => `${origin}/glyphs/{fontstack}/{range}.pbf`;

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
  /** City-name text (muted ink) and its halo (the land colour). */
  label: string;
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

/**
 * City-name labels: restrained muted text with a land-coloured halo, to the right of the point (the
 * customer-site marker sits on the point). Collision detection stays on (no overlap), `rank` orders
 * placement, and each city appears from its own `minZoom`. Text grows slightly with zoom.
 */
export function cityLabelLayer(c: BasemapColors): LayerSpecification {
  return {
    id: 'bm-city-labels',
    type: 'symbol',
    source: CITY_SOURCE,
    filter: ['>=', ['zoom'], ['get', 'minZoom']],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': [CITY_FONT],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 12.5, 12, 14],
      'text-anchor': 'left',
      'text-offset': [1.3, 0],
      'text-padding': 4,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: { 'text-color': c.label, 'text-halo-color': c.land, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 },
  };
}

export interface BasemapAvailability {
  tiles: boolean;
  glyphs: boolean;
}

/** Basemap file + glyph availability (HEAD, same origin). Missing tiles → land-only; missing glyphs → no labels. */
export async function basemapInstalled(fetchImpl: typeof fetch = fetch): Promise<BasemapAvailability> {
  const ok = async (path: string) => {
    try {
      return (await fetchImpl(path, { method: 'HEAD', credentials: 'same-origin' })).ok;
    } catch {
      return false;
    }
  };
  const [tiles, glyphs] = await Promise.all([ok(BASEMAP_PATH), ok(GLYPH_PROBE_PATH)]);
  return { tiles, glyphs };
}

/** The part of the MapLibre map this module uses (a fake in tests). */
export interface BasemapTarget {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  addSource(id: string, source: SourceSpecification): unknown;
  addLayer(layer: LayerSpecification, beforeId?: string): unknown;
  setGlyphs(url: string | null): unknown;
}

/**
 * Adds the basemap (and, when glyphs are installed, the city labels) once, always below the first
 * operational overlay if it already exists — so routes, disruptions and the HTML markers stay on top.
 * Returns the ids it added, in stacking order.
 */
export function installBasemap(map: BasemapTarget, origin: string, colors: BasemapColors, available: BasemapAvailability): string[] {
  const added: string[] = [];
  const below = map.getLayer(FIRST_OVERLAY_LAYER) ? FIRST_OVERLAY_LAYER : undefined;
  if (available.tiles && !map.getSource(BASEMAP_SOURCE)) {
    registerBasemapProtocol();
    map.addSource(BASEMAP_SOURCE, basemapSource(origin));
    for (const layer of basemapLayers(colors)) {
      map.addLayer(layer, below);
      added.push(layer.id);
    }
  }
  if (available.glyphs && !map.getSource(CITY_SOURCE)) {
    map.setGlyphs(glyphsUrl(origin));
    map.addSource(CITY_SOURCE, { type: 'geojson', data: cityLabelsGeoJSON() });
    const layer = cityLabelLayer(colors);
    map.addLayer(layer, below);
    added.push(layer.id);
  }
  return added;
}
