import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

/**
 * Offline basemap serving (architecture §16, O-11): the PMTiles file is served same-origin at /tiles
 * with HTTP Range support, the CSP is unchanged, and a missing file is a plain 404 (SPA fallback).
 * A small stand-in file is used: Range serving does not depend on the tile contents.
 */

const dir = mkdtempSync(join(tmpdir(), 'rp-basemap-'));
const empty = mkdtempSync(join(tmpdir(), 'rp-basemap-empty-'));
const body = Buffer.concat([Buffer.from('PMTiles'), Buffer.from([3]), Buffer.alloc(4088, 7)]); // 4096 bytes
writeFileSync(join(dir, 'western-india.pmtiles'), body);
writeFileSync(join(dir, '.hidden'), 'x');
mkdirSync(join(dir, 'glyphs', 'Noto Sans Regular'), { recursive: true });
writeFileSync(join(dir, 'glyphs', 'Noto Sans Regular', '0-255.pbf'), Buffer.alloc(64, 1));

let srv: TestServer;
let missing: TestServer;

beforeAll(async () => {
  srv = await startTestServer({ env: { BASEMAP_DIR: dir } });
  missing = await startTestServer({ env: { BASEMAP_DIR: empty } });
});

afterAll(async () => {
  await srv.close();
  await missing.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

describe('/tiles basemap serving', () => {
  it('answers a Range request with 206 and exactly the requested bytes (no session needed)', async () => {
    const res = await fetch(`${srv.baseUrl}/tiles/western-india.pmtiles`, { headers: { Range: 'bytes=0-7' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-7/4096');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('application/vnd.pmtiles');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 7).toString()).toBe('PMTiles');
    expect(bytes[7]).toBe(3);
    expect(bytes.length).toBe(8);
  });

  it('serves a middle range and HEAD; an unsatisfiable range is 416', async () => {
    const mid = await fetch(`${srv.baseUrl}/tiles/western-india.pmtiles`, { headers: { Range: 'bytes=4000-4095' } });
    expect(mid.status).toBe(206);
    expect((await mid.arrayBuffer()).byteLength).toBe(96);
    const head = await fetch(`${srv.baseUrl}/tiles/western-india.pmtiles`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('4096');
    const bad = await fetch(`${srv.baseUrl}/tiles/western-india.pmtiles`, { headers: { Range: 'bytes=5000-6000' } });
    expect(bad.status).toBe(416);
  });

  it('keeps the security policy unchanged (connect-src and img-src self only)', async () => {
    const res = await fetch(`${srv.baseUrl}/tiles/western-india.pmtiles`, { method: 'HEAD' });
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it('missing file → 404 with a setup hint; hidden files and path traversal are not served', async () => {
    const res = await fetch(`${missing.baseUrl}/tiles/western-india.pmtiles`, { method: 'GET' });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('npm run basemap:fetch');
    expect((await fetch(`${srv.baseUrl}/tiles/.hidden`)).status).toBe(404);
    expect((await fetch(`${srv.baseUrl}/tiles/%2e%2e/%2e%2e/package.json`)).status).not.toBe(200);
    expect((await fetch(`${srv.baseUrl}/tiles/`)).status).toBe(404);
  });

  it('serves city-label glyphs same-origin (font stack with a space); missing glyphs → 404', async () => {
    const res = await fetch(`${srv.baseUrl}/glyphs/Noto%20Sans%20Regular/0-255.pbf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-protobuf');
    expect((await res.arrayBuffer()).byteLength).toBe(64);
    expect((await fetch(`${missing.baseUrl}/glyphs/Noto%20Sans%20Regular/0-255.pbf`)).status).toBe(404);
    expect((await fetch(`${srv.baseUrl}/glyphs/Noto%20Sans%20Regular/256-511.pbf`)).status).toBe(404);
  });

  it('BASEMAP_DIR must be absolute when set', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x@localhost/db', SESSION_SECRET: 'x'.repeat(40), BASEMAP_DIR: 'relative/dir' })).toThrow(ConfigError);
    expect(loadConfig({ DATABASE_URL: 'postgresql://x@localhost/db', SESSION_SECRET: 'x'.repeat(40) }).basemapDir).toMatch(/apps[\\/]api[\\/]static[\\/]basemap$/);
  });
});
