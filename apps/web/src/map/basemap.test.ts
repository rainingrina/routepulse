import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapLayersResponse } from '../api/contract';
import { BASEMAP_ATTRIBUTION, BASEMAP_BOUNDS, BASEMAP_PATH, basemapInstalled, basemapLayers, basemapSource } from './basemap';

/** Offline basemap (architecture §16, O-11): same-origin only, approved display rules, bounds. */

const colors = { land: '#land', water: '#water', border: '#border', road: '#road' };
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
  it('HEAD 200 → true; 404 or network error → false (fallback style)', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const ok = (async (u: string, i?: RequestInit) => (calls.push([u, i]), new Response(null, { status: 200 }))) as unknown as typeof fetch;
    expect(await basemapInstalled(ok)).toBe(true);
    expect(calls[0]).toEqual([BASEMAP_PATH, { method: 'HEAD', credentials: 'same-origin' }]);
    expect(await basemapInstalled((async () => new Response('missing', { status: 404 })) as unknown as typeof fetch)).toBe(false);
    expect(await basemapInstalled((async () => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch)).toBe(false);
  });
});
