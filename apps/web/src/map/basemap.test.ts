import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapLayersResponse } from '../api/contract';
import type { LayerSpecification } from 'maplibre-gl';
import { BASEMAP_ATTRIBUTION, BASEMAP_BOUNDS, BASEMAP_PATH, CITY_FONT, GLYPH_PROBE_PATH, basemapInstalled, basemapLayers, basemapSource, cityLabelLayer, installBasemap, type BasemapTarget } from './basemap';
import { CITY_LABELS, cityLabelsGeoJSON } from './cities';

/** Offline basemap (architecture §16, O-11): same-origin only, approved display rules, bounds. */

const colors = { land: '#land', water: '#water', border: '#border', road: '#road', label: '#label' };
const fx = JSON.parse(readFileSync(new URL('../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as { layers: MapLayersResponse };
const inside = ([lng, lat]: [number, number]) => lng >= BASEMAP_BOUNDS[0][0] && lng <= BASEMAP_BOUNDS[1][0] && lat >= BASEMAP_BOUNDS[0][1] && lat <= BASEMAP_BOUNDS[1][1];

describe('basemap style', () => {
  it('reads one same-origin PMTiles file; no external URL, glyphs, sprites or symbol layers', () => {
    const src = basemapSource('http://localhost:5173');
    expect(src).toMatchObject({ type: 'vector', url: `pmtiles://http://localhost:5173${BASEMAP_PATH}` });
    const layers = basemapLayers(colors);
    const json = JSON.stringify(layers);
    expect(json).not.toMatch(/https?:\/\//);
    expect(json).not.toMatch(/glyphs|sprite|text-field|icon-image/);
    expect(layers.every((l) => l.type === 'fill' || l.type === 'line')).toBe(true);
    expect(layers.map((l) => l.id)).toEqual(['bm-earth', 'bm-water', 'bm-roads', 'bm-state-borders']);
  });

  it('draws state borders only — never country or disputed boundaries (approved decision)', () => {
    const borders = basemapLayers(colors).filter((l) => 'source-layer' in l && l['source-layer'] === 'boundaries');
    expect(borders).toHaveLength(1);
    expect(borders[0]).toMatchObject({ filter: ['all', ['==', ['get', 'kind'], 'region'], ['!=', ['get', 'disputed'], true]] });
    expect(JSON.stringify(borders)).not.toContain('country');
  });

  it('uses the passed design-token colours (land, water, border, road)', () => {
    const paint = Object.fromEntries(basemapLayers(colors).map((l) => [l.id, JSON.stringify((l as { paint?: unknown }).paint)]));
    expect(paint['bm-earth']).toContain('#land');
    expect(paint['bm-water']).toContain('#water');
    expect(paint['bm-state-borders']).toContain('#border');
    expect(paint['bm-roads']).toContain('#road');
  });

  it('credits OpenStreetMap contributors with a link to the copyright page (ODbL)', () => {
    expect(BASEMAP_ATTRIBUTION).toContain('© OpenStreetMap contributors');
    expect(BASEMAP_ATTRIBUTION).toContain('https://www.openstreetmap.org/copyright');
    expect(basemapSource('http://x').attribution).toBe(BASEMAP_ATTRIBUTION);
  });
});

describe('basemap bounds', () => {
  it('match the setup script bbox exactly', () => {
    const script = readFileSync(new URL('../../../../scripts/fetch-basemap.sh', import.meta.url), 'utf8');
    const bbox = /^BBOX="([^"]+)"/m.exec(script)?.[1];
    expect(bbox).toBe(`${BASEMAP_BOUNDS[0][0].toFixed(1)},${BASEMAP_BOUNDS[0][1].toFixed(1)},${BASEMAP_BOUNDS[1][0].toFixed(1)},${BASEMAP_BOUNDS[1][1].toFixed(1)}`);
  });

  it('contain the plant, all six customer sites (Pune, Nashik, Surat, Ahmedabad, Indore, Nagpur) and every route point', () => {
    const l = fx.layers;
    expect(inside([l.plant.lng, l.plant.lat])).toBe(true);
    expect(l.sites.map((s) => s.city).sort()).toEqual(['Ahmedabad', 'Indore', 'Nagpur', 'Nashik', 'Pune', 'Surat']);
    for (const s of l.sites) expect(inside([s.lng, s.lat])).toBe(true);
    for (const r of l.routes) for (const c of r.geometry.coordinates) expect(inside(c as [number, number])).toBe(true);
  });
});

describe('basemapInstalled', () => {
  it('checks the tiles and the label glyphs separately (HEAD, same origin); errors count as missing', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const tilesOnly = (async (u: string, i?: RequestInit) => (calls.push([u, i]), new Response(null, { status: u === BASEMAP_PATH ? 200 : 404 }))) as unknown as typeof fetch;
    expect(await basemapInstalled(tilesOnly)).toEqual({ tiles: true, glyphs: false });
    expect(calls).toEqual([
      [BASEMAP_PATH, { method: 'HEAD', credentials: 'same-origin' }],
      [GLYPH_PROBE_PATH, { method: 'HEAD', credentials: 'same-origin' }],
    ]);
    expect(GLYPH_PROBE_PATH).toBe('/glyphs/Noto%20Sans%20Regular/0-255.pbf');
    expect(await basemapInstalled((async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)).toEqual({ tiles: false, glyphs: false });
  });
});

/** Reference city-centre coordinates (WGS84) used to check the label data independently. */
const REFERENCE: Record<string, [number, number]> = {
  Pune: [73.8567, 18.5204],
  Nashik: [73.7898, 19.9975],
  Surat: [72.8311, 21.1702],
  Ahmedabad: [72.5714, 23.0225],
  Indore: [75.8577, 22.7196],
  Nagpur: [79.0882, 21.1458],
};

describe('city labels', () => {
  it('cover exactly the six lane cities with accurate coordinates inside the basemap bounds', () => {
    expect(CITY_LABELS.map((c) => c.name).sort()).toEqual(Object.keys(REFERENCE).sort());
    for (const c of CITY_LABELS) {
      const [lng, lat] = REFERENCE[c.name]!;
      expect(Math.abs(c.lng - lng)).toBeLessThan(0.01);
      expect(Math.abs(c.lat - lat)).toBeLessThan(0.01);
      expect(inside([c.lng, c.lat])).toBe(true);
    }
    expect(new Set(CITY_LABELS.map((c) => c.rank)).size).toBe(CITY_LABELS.length);
  });

  it('match the seeded customer sites in the same cities (labels sit next to the site markers)', () => {
    for (const site of fx.layers.sites) {
      const c = CITY_LABELS.find((x) => x.name === site.city)!;
      expect(Math.abs(c.lng - site.lng) + Math.abs(c.lat - site.lat)).toBeLessThan(0.01);
    }
  });

  it('GeoJSON points carry name, rank and minZoom', () => {
    const g = cityLabelsGeoJSON();
    expect(g.features).toHaveLength(6);
    expect(g.features[0]).toMatchObject({ type: 'Feature', properties: { name: 'Ahmedabad', rank: 1, minZoom: 4 }, geometry: { type: 'Point', coordinates: [72.5714, 23.0225] } });
  });

  it('symbol layer: local font stack, muted colour with land halo, collision on, rank ordering, zoom-dependent', () => {
    const l = cityLabelLayer(colors) as Extract<LayerSpecification, { type: 'symbol' }>;
    expect(l).toMatchObject({ id: 'bm-city-labels', type: 'symbol', source: 'city-labels', filter: ['>=', ['zoom'], ['get', 'minZoom']] });
    expect(l.layout).toMatchObject({ 'text-font': [CITY_FONT], 'text-allow-overlap': false, 'text-ignore-placement': false, 'symbol-sort-key': ['get', 'rank'], 'text-anchor': 'left' });
    expect(l.paint).toMatchObject({ 'text-color': '#label', 'text-halo-color': '#land' });
    expect(JSON.stringify(l)).not.toMatch(/https?:\/\/|icon-image/);
  });
});

/** Fake MapLibre map: records sources, layer order and glyph URL like the real `addLayer(layer, beforeId)`. */
function fakeMap(existing: string[] = []): BasemapTarget & { order: string[]; glyphs: string | null; sources: string[] } {
  const m = {
    order: [...existing],
    sources: [] as string[],
    glyphs: null as string | null,
    getSource: (id: string) => (m.sources.includes(id) ? {} : undefined),
    getLayer: (id: string) => (m.order.includes(id) ? {} : undefined),
    addSource: (id: string) => m.sources.push(id),
    addLayer: (layer: LayerSpecification, beforeId?: string) => {
      const i = beforeId ? m.order.indexOf(beforeId) : -1;
      if (i >= 0) m.order.splice(i, 0, layer.id);
      else m.order.push(layer.id);
    },
    setGlyphs: (url: string | null) => {
      m.glyphs = url;
    },
  };
  return m;
}

const OVERLAYS = ['routes-alt', 'routes-primary', 'routes-selected', 'disr-under', 'disr-dash'];
const BASEMAP_ORDER = ['bm-earth', 'bm-water', 'bm-roads', 'bm-state-borders', 'bm-city-labels'];

describe('installBasemap layer ordering', () => {
  it('when overlays already exist: basemap then city labels are inserted below every overlay', () => {
    const m = fakeMap(['land', ...OVERLAYS]);
    expect(installBasemap(m, 'http://localhost:5173', colors, { tiles: true, glyphs: true })).toEqual(BASEMAP_ORDER);
    expect(m.order).toEqual(['land', ...BASEMAP_ORDER, ...OVERLAYS]);
    expect(m.glyphs).toBe('http://localhost:5173/glyphs/{fontstack}/{range}.pbf');
  });

  it('when installed before the overlays: appended in order, overlays added later stay on top; idempotent', () => {
    const m = fakeMap(['land']);
    installBasemap(m, 'http://x', colors, { tiles: true, glyphs: true });
    for (const o of OVERLAYS) m.addLayer({ id: o, type: 'line', source: 'routes' });
    expect(m.order).toEqual(['land', ...BASEMAP_ORDER, ...OVERLAYS]);
    expect(installBasemap(m, 'http://x', colors, { tiles: true, glyphs: true })).toEqual([]);
  });

  it('missing glyphs → no labels and no glyph URL; missing tiles → labels only (fallback land style)', () => {
    const a = fakeMap(['land', ...OVERLAYS]);
    installBasemap(a, 'http://x', colors, { tiles: true, glyphs: false });
    expect(a.order).not.toContain('bm-city-labels');
    expect(a.glyphs).toBeNull();
    const b = fakeMap(['land', ...OVERLAYS]);
    installBasemap(b, 'http://x', colors, { tiles: false, glyphs: true });
    expect(b.order).toEqual(['land', 'bm-city-labels', ...OVERLAYS]);
  });
});
