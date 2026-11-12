import type { ApiError, HealthResponse } from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer.js';

let srv: TestServer;

beforeAll(async () => {
  srv = await startTestServer();
});
afterAll(async () => {
  await srv.close();
});

describe('Milestone 1 foundation', () => {
  it('GET /api/health reports the database as up', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe('ok');
    expect(body.database).toBe('up');
    expect(Number.isNaN(Date.parse(body.serverTime))).toBe(false);
  });

  it('sets a server-generated X-Request-Id and ignores a client-supplied one', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`, { headers: { 'X-Request-Id': 'spoofed' } });
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(id).not.toBe('spoofed');
  });

  it('returns the error envelope for an unknown /api route', async () => {
    const res = await fetch(`${srv.baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('rejects a non-JSON body with 415 UNSUPPORTED_MEDIA', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    expect(res.status).toBe(415);
    expect(((await res.json()) as ApiError).error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('rejects malformed JSON with 400 VALIDATION_ERROR and no stack trace', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/at .+\.(ts|js):\d+/);
    expect((JSON.parse(text) as ApiError).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bodies over 100 kB with 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob: 'x'.repeat(110 * 1024) }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiError).error.code).toBe('VALIDATION_ERROR');
  });

  it('sends a same-origin Content-Security-Policy (offline guarantee)', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("connect-src 'self'");
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('migrations', () => {
  it('created SimState with its raw-SQL CHECK constraints on the test database', async () => {
    const rows = await srv.prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conrelid = '"SimState"'::regclass ORDER BY conname`;
    expect(rows.map((r) => r.conname)).toEqual([
      'SimState_pkey',
      'SimState_settled_chk',
      'SimState_singleton_chk',
      'SimState_speed_chk',
      'SimState_step_chk',
    ]);
  });

  it('enforces the SimState speed and singleton CHECKs at the database', async () => {
    const now = new Date();
    // Make sure the singleton row exists, so the speed check (not the primary key) is what rejects.
    await srv.prisma.simState.upsert({
      where: { id: 1 },
      create: { id: 1, simTime: now, lastSettledAt: now, seedName: 'test' },
      update: {},
    });
    await expect(srv.prisma.simState.update({ where: { id: 1 }, data: { speed: 7 } })).rejects.toThrow(/SimState_speed_chk/);
    await expect(
      srv.prisma.simState.create({ data: { id: 2, simTime: now, lastSettledAt: now, seedName: 'test' } }),
    ).rejects.toThrow(/SimState_singleton_chk/);
  });
});
