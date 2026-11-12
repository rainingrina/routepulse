import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/auth/rateLimit.js';
import {
  RevokedSessions,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  issueToken,
  readSessionCookie,
  sessionCookie,
  verifyToken,
} from '../../src/auth/session.js';

const SECRET = 'unit-test-secret-at-least-32-characters!!';
const NOW = Date.UTC(2026, 10, 12, 9, 0, 0);
const user = { id: 'usr_cust_arjun', role: 'CUSTOMER' as const };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const signWith = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

describe('session tokens', () => {
  it('round-trips a valid token with an 8-hour lifetime and a unique session id', () => {
    const a = issueToken(user, SECRET, NOW);
    const b = issueToken(user, SECRET, NOW);
    const v = verifyToken(a.token, SECRET, NOW);
    expect(v).toEqual({ ok: true, claims: a.claims });
    expect(a.claims.exp - a.claims.iat).toBe(SESSION_TTL_SECONDS);
    expect(a.claims.jti).not.toBe(b.claims.jti);
  });

  it('rejects an expired token (real time, at exactly exp)', () => {
    const { token, claims } = issueToken(user, SECRET, NOW);
    expect(verifyToken(token, SECRET, claims.exp * 1000)).toEqual({ ok: false, problem: 'expired' });
    expect(verifyToken(token, SECRET, claims.exp * 1000 - 1000).ok).toBe(true);
  });

  it('rejects a token signed with another secret', () => {
    const { token } = issueToken(user, 'another-secret-that-is-also-32-chars-long', NOW);
    expect(verifyToken(token, SECRET, NOW)).toEqual({ ok: false, problem: 'bad_signature' });
  });

  it('rejects a payload edited after signing (e.g. role escalated)', () => {
    const { token, claims } = issueToken(user, SECRET, NOW);
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64({ ...claims, role: 'COORDINATOR' })}.${s}`;
    expect(verifyToken(forged, SECRET, NOW)).toEqual({ ok: false, problem: 'bad_signature' });
  });

  it('rejects alg=none and any header other than HS256/JWT', () => {
    const { claims } = issueToken(user, SECRET, NOW);
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.x`;
    expect(verifyToken(none, SECRET, NOW)).toEqual({ ok: false, problem: 'bad_header' });
    const hs512Body = `${b64({ alg: 'HS512', typ: 'JWT' })}.${b64(claims)}`;
    expect(verifyToken(`${hs512Body}.${signWith(hs512Body, SECRET)}`, SECRET, NOW)).toEqual({ ok: false, problem: 'bad_header' });
  });

  it('rejects malformed tokens and bad claims without throwing', () => {
    expect(verifyToken('', SECRET, NOW)).toEqual({ ok: false, problem: 'malformed' });
    expect(verifyToken('a.b', SECRET, NOW)).toEqual({ ok: false, problem: 'malformed' });
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const body = `${header}.${b64({ sub: 'x', role: 'ADMIN', iat: 1, exp: 9e9, jti: 'j' })}`;
    expect(verifyToken(`${body}.${signWith(body, SECRET)}`, SECRET, NOW)).toEqual({ ok: false, problem: 'bad_claims' });
  });

  it('rejects a token issued in the future beyond the allowed skew', () => {
    const { token } = issueToken(user, SECRET, NOW + 10 * 60_000);
    expect(verifyToken(token, SECRET, NOW)).toEqual({ ok: false, problem: 'not_yet_valid' });
  });
});

describe('revocation list (logout)', () => {
  it('reports revoked ids until their tokens would have expired', () => {
    const r = new RevokedSessions();
    const exp = Math.floor(NOW / 1000) + 60;
    r.revoke({ jti: 'j1', exp });
    expect(r.isRevoked('j1', NOW)).toBe(true);
    expect(r.isRevoked('j2', NOW)).toBe(false);
    expect(r.isRevoked('j1', (exp + 1) * 1000)).toBe(false); // pruned after expiry
  });
});

describe('session cookie', () => {
  it('is httpOnly, SameSite=Lax, Path=/ and only Secure when asked', () => {
    const plain = sessionCookie('tok', 100, false);
    expect(plain).toBe('rp_session=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=100');
    expect(sessionCookie('tok', 100, true)).toContain('; Secure');
    expect(clearSessionCookie(false)).toContain('Max-Age=0');
  });

  it('reads only the rp_session cookie', () => {
    expect(readSessionCookie('a=1; rp_session=abc.def.ghi; b=2')).toBe('abc.def.ghi');
    expect(readSessionCookie('rp_session=')).toBeNull();
    expect(readSessionCookie('other=1')).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
  });
});

describe('login rate limiter', () => {
  it('allows `limit` attempts per window per key, then blocks until the window passes', () => {
    const rl = new RateLimiter(3, 60_000);
    expect([1, 2, 3].map(() => rl.attempt('ip', NOW))).toEqual([true, true, true]);
    expect(rl.attempt('ip', NOW + 1)).toBe(false);
    expect(rl.attempt('other-ip', NOW + 1)).toBe(true);
    expect(rl.attempt('ip', NOW + 60_001)).toBe(true);
  });
});
