import type { ApiError, LoginResponse, MeResponse } from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOGIN_RATE_LIMIT } from '../../src/auth/rateLimit.js';
import { issueToken } from '../../src/auth/session.js';
import { runSeed } from '../../src/seed/seed.js';
import { TEST_SESSION_SECRET, loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

const PASSWORD = 'test-demo-password-123';
let srv: TestServer;

const post = (path: string, body: unknown, cookie?: string) =>
  fetch(`${srv.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie?: string, extra: Record<string, string> = {}) =>
  fetch(`${srv.baseUrl}${path}`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra } });

/** Deep key scan: no sensitive field name anywhere in a JSON value. */
function sensitiveKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => sensitiveKeys(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/password|hash|secret|token|phone|jti/i.test(k)) found.push(k);
      sensitiveKeys(v, found);
    }
  }
  return found;
}

beforeAll(async () => {
  // Many logins in one minute here; the real limit is asserted separately below.
  srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 } });
  await runSeed(srv.prisma, { demoPassword: PASSWORD });
});
afterAll(async () => {
  await srv.close();
});

describe('POST /api/auth/login', () => {
  it.each([
    ['coordinator@plantx.test', 'COORDINATOR', '/control-tower'],
    ['buyer@kestrel.test', 'CUSTOMER', '/orders'],
    ['driver.ramesh@ghatline.test', 'DRIVER', '/trip'],
  ])('logs in %s as %s with home %s and a secure session cookie', async (email, role, home) => {
    const res = await post('/api/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginResponse;
    expect(body.user.role).toBe(role);
    expect(body.homePath).toBe(home);
    expect(Object.keys(body.user).sort()).toEqual(['customer', 'email', 'id', 'name', 'role', 'transporter']);
    expect(sensitiveKeys(body)).toEqual([]);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^rp_session=[\w-]+\.[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
  });

  it('shapes the user by role (customer company / transporter only where relevant)', async () => {
    const cust = (await (await post('/api/auth/login', { email: 'buyer@kestrel.test', password: PASSWORD })).json()) as LoginResponse;
    expect(cust.user).toMatchObject({ customer: { id: 'cus_kestrel', name: 'Kestrel Moulders' }, transporter: null });
    const drv = (await (await post('/api/auth/login', { email: 'driver.ramesh@ghatline.test', password: PASSWORD })).json()) as LoginResponse;
    expect(drv.user).toMatchObject({ customer: null, transporter: { id: 'trn_ghatline', name: 'Ghatline Carriers' } });
    const co = (await (await post('/api/auth/login', { email: 'coordinator@plantx.test', password: PASSWORD })).json()) as LoginResponse;
    expect(co.user).toMatchObject({ customer: null, transporter: null });
  });

  it('accepts the email case-insensitively', async () => {
    expect((await post('/api/auth/login', { email: '  BUYER@Kestrel.TEST ', password: PASSWORD })).status).toBe(200);
  });

  it('gives an identical 401 for a wrong password, an unknown email and an inactive account', async () => {
    await srv.prisma.user.update({ where: { id: 'usr_cust_shrike' }, data: { isActive: false } });
    try {
      const bodies = await Promise.all([
        post('/api/auth/login', { email: 'buyer@kestrel.test', password: 'wrong-password-123' }),
        post('/api/auth/login', { email: 'nobody@nowhere.test', password: PASSWORD }),
        post('/api/auth/login', { email: 'buyer@shrike.test', password: PASSWORD }),
      ]).then((rs) => Promise.all(rs.map(async (r) => ({ status: r.status, body: (await r.json()) as ApiError, cookie: r.headers.get('set-cookie') }))));
      for (const b of bodies) {
        expect(b.status).toBe(401);
        expect(b.cookie).toBeNull();
        expect({ code: b.body.error.code, message: b.body.error.message }).toEqual({ code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' });
      }
    } finally {
      await srv.prisma.user.update({ where: { id: 'usr_cust_shrike' }, data: { isActive: true } });
    }
  });

  it('rejects missing fields, bad types and injected fields (role/userId) with 400 listing every issue', async () => {
    const res = await post('/api/auth/login', { email: 42, role: 'COORDINATOR', userId: 'usr_coord_meera' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect((body.error.details as { path: string }[]).map((d) => d.path).sort()).toEqual(['body.role', 'body.userId', 'email', 'password']);
  });

  it('keeps the JSON-only policy (415) for login', async () => {
    const res = await fetch(`${srv.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    expect(res.status).toBe(415);
  });

  it('audits successes and failures without storing the password', async () => {
    await post('/api/auth/login', { email: 'buyer@kestrel.test', password: 'wrong-password-xyz' });
    const failed = await srv.prisma.auditLog.findFirst({ where: { action: 'auth.login.failed' }, orderBy: { createdAt: 'desc' } });
    expect(failed?.actorUserId).toBeNull();
    expect(JSON.stringify(failed?.data)).not.toContain('wrong-password-xyz');
    const ok = await srv.prisma.auditLog.count({ where: { action: 'auth.login', actorUserId: 'usr_cust_arjun' } });
    expect(ok).toBeGreaterThan(0);
  });
});

describe('sessions: GET /api/auth/me', () => {
  it('returns the signed-in user with a valid cookie', async () => {
    const cookie = await loginCookie(srv.baseUrl, 'buyer@kestrel.test', PASSWORD);
    const res = await get('/api/auth/me', cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeResponse;
    expect(body.user.id).toBe('usr_cust_arjun');
    expect(sensitiveKeys(body)).toEqual([]);
  });

  it('401 without a cookie, with a garbage cookie (cookie cleared), and with a forged signature', async () => {
    expect((await get('/api/auth/me')).status).toBe(401);
    const garbage = await get('/api/auth/me', 'rp_session=not.a.token');
    expect(garbage.status).toBe(401);
    expect(garbage.headers.get('set-cookie')).toContain('Max-Age=0');
    const forged = issueToken({ id: 'usr_coord_meera', role: 'COORDINATOR' }, 'attacker-secret-that-is-32-characters-long', Date.now());
    expect((await get('/api/auth/me', `rp_session=${forged.token}`)).status).toBe(401);
  });

  it('401 for an expired session', async () => {
    const expired = issueToken({ id: 'usr_cust_arjun', role: 'CUSTOMER' }, TEST_SESSION_SECRET, Date.now() - 9 * 3600_000);
    expect((await get('/api/auth/me', `rp_session=${expired.token}`)).status).toBe(401);
  });

  it('expires sessions after 8 hours of real time (injected clock)', async () => {
    let now = Date.now();
    const timed = await startTestServer({ now: () => now });
    try {
      const cookie = await loginCookie(timed.baseUrl, 'buyer@kestrel.test', PASSWORD);
      expect((await fetch(`${timed.baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status).toBe(200);
      now += 8 * 3600_000;
      expect((await fetch(`${timed.baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status).toBe(401);
    } finally {
      await timed.close();
    }
  });

  it('never trusts the role claim or client headers: the database role and id win', async () => {
    // A correctly signed token that CLAIMS coordinator for a customer account.
    const lying = issueToken({ id: 'usr_cust_arjun', role: 'COORDINATOR' }, TEST_SESSION_SECRET, Date.now());
    const res = await get('/api/auth/me', `rp_session=${lying.token}`, { 'X-User-Id': 'usr_coord_meera', 'X-Role': 'COORDINATOR' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as MeResponse).user).toMatchObject({ id: 'usr_cust_arjun', role: 'CUSTOMER' });
  });

  it('invalidates an existing session when the account is deactivated', async () => {
    const cookie = await loginCookie(srv.baseUrl, 'buyer@osprey.test', PASSWORD);
    await srv.prisma.user.update({ where: { id: 'usr_cust_osprey' }, data: { isActive: false } });
    try {
      expect((await get('/api/auth/me', cookie)).status).toBe(401);
    } finally {
      await srv.prisma.user.update({ where: { id: 'usr_cust_osprey' }, data: { isActive: true } });
    }
  });
});

describe('POST /api/auth/logout', () => {
  it('204, clears the cookie, and the old cookie no longer works (AZ-6)', async () => {
    const cookie = await loginCookie(srv.baseUrl, 'driver.ramesh@ghatline.test', PASSWORD);
    const res = await post('/api/auth/logout', {}, cookie);
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/^rp_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0$/);
    expect((await get('/api/auth/me', cookie)).status).toBe(401);
  });

  it('logging out one session leaves the user\'s other sessions working', async () => {
    const a = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
    const b = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
    await post('/api/auth/logout', {}, a);
    expect((await get('/api/auth/me', a)).status).toBe(401);
    expect((await get('/api/auth/me', b)).status).toBe(200);
  });

  it('401 without a session', async () => {
    expect((await post('/api/auth/logout', {})).status).toBe(401);
  });
});

describe('deny by default and error envelope', () => {
  it('401 for any unknown /api path without a session; 404 once signed in', async () => {
    const anon = await get('/api/shipments');
    expect(anon.status).toBe(401);
    const body = (await anon.json()) as ApiError;
    expect(body.error).toMatchObject({ code: 'UNAUTHENTICATED', requestId: anon.headers.get('x-request-id') });
    const cookie = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
    expect((await get('/api/not-a-real-endpoint', cookie)).status).toBe(404);
  });

  it('keeps /api/health public', async () => {
    expect((await get('/api/health')).status).toBe(200);
  });
});

describe('cookie security in production and login rate limiting', () => {
  it('adds Secure to the cookie when NODE_ENV=production', async () => {
    const prod = await startTestServer({ env: { NODE_ENV: 'production' } });
    try {
      const res = await fetch(`${prod.baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'buyer@kestrel.test', password: PASSWORD }),
      });
      expect(res.headers.get('set-cookie')).toContain('; Secure');
    } finally {
      await prod.close();
    }
  });

  it('uses 10 attempts per minute per IP by default (architecture §7.1)', () => {
    expect(LOGIN_RATE_LIMIT).toEqual({ limit: 10, windowMs: 60_000 });
  });

  it('429 RATE_LIMITED after the limit, even with the correct password', async () => {
    const limited = await startTestServer({ loginRateLimit: { limit: 3, windowMs: 60_000 } });
    try {
      const attempt = (password: string) =>
        fetch(`${limited.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'buyer@kestrel.test', password }) });
      expect((await attempt('wrong-1-xxxxx')).status).toBe(401);
      expect((await attempt('wrong-2-xxxxx')).status).toBe(401);
      expect((await attempt('wrong-3-xxxxx')).status).toBe(401);
      const blocked = await attempt(PASSWORD);
      expect(blocked.status).toBe(429);
      expect(((await blocked.json()) as ApiError).error.code).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });
});
