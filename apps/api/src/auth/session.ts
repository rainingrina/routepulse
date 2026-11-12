import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SESSION_COOKIE_NAME, type Role } from '@routepulse/shared';

/**
 * Session tokens (architecture §7.1): a compact HS256 JWT in an httpOnly cookie, implemented with
 * node:crypto (no JWT dependency). Expiry uses REAL time, never simulation time.
 *
 * Claims: sub (user id), role (informational — the server always reloads the user and uses the
 * database role), iat, exp (seconds), jti (session id, used for logout invalidation).
 */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;
const HEADER_B64 = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export interface SessionClaims {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
  jti: string;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function issueToken(
  user: { id: string; role: Role },
  secret: string,
  nowMs: number,
  ttlSeconds = SESSION_TTL_SECONDS,
): { token: string; claims: SessionClaims } {
  const iat = Math.floor(nowMs / 1000);
  const claims: SessionClaims = { sub: user.id, role: user.role, iat, exp: iat + ttlSeconds, jti: randomUUID() };
  const body = `${HEADER_B64}.${b64url(JSON.stringify(claims))}`;
  return { token: `${body}.${sign(body, secret).toString('base64url')}`, claims };
}

export type TokenProblem = 'malformed' | 'bad_header' | 'bad_signature' | 'bad_claims' | 'expired' | 'not_yet_valid';

/** Verifies structure, algorithm, signature (constant time) and lifetime. Never throws. */
export function verifyToken(token: string, secret: string, nowMs: number): { ok: true; claims: SessionClaims } | { ok: false; problem: TokenProblem } {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return { ok: false, problem: 'malformed' };
  const [header, payload, signature] = parts as [string, string, string];
  // Only our exact header is accepted: this rejects alg=none and algorithm-confusion tokens.
  if (header !== HEADER_B64) return { ok: false, problem: 'bad_header' };

  const expected = sign(`${header}.${payload}`, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, problem: 'bad_signature' };

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, problem: 'malformed' };
  }
  if (!isClaims(claims)) return { ok: false, problem: 'bad_claims' };
  const now = Math.floor(nowMs / 1000);
  if (claims.exp <= now) return { ok: false, problem: 'expired' };
  if (claims.iat > now + CLOCK_SKEW_SECONDS) return { ok: false, problem: 'not_yet_valid' };
  return { ok: true, claims };
}

function isClaims(v: unknown): v is SessionClaims {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c['sub'] === 'string' &&
    c['sub'].length > 0 &&
    (c['role'] === 'COORDINATOR' || c['role'] === 'CUSTOMER' || c['role'] === 'DRIVER') &&
    Number.isInteger(c['iat']) &&
    Number.isInteger(c['exp']) &&
    typeof c['jti'] === 'string' &&
    c['jti'].length > 0
  );
}

/**
 * Logout invalidation (AC-M1.5, test AZ-6). Revoked session ids are kept in memory until their
 * token would have expired anyway. Prototype limit (documented): a process restart forgets the
 * list, so a token logged out before a restart is accepted again until its own expiry (≤ 8 h).
 */
export class RevokedSessions {
  private readonly revoked = new Map<string, number>(); // jti → exp (seconds)

  revoke(claims: Pick<SessionClaims, 'jti' | 'exp'>): void {
    this.revoked.set(claims.jti, claims.exp);
  }

  isRevoked(jti: string, nowMs: number): boolean {
    this.prune(nowMs);
    return this.revoked.has(jti);
  }

  private prune(nowMs: number): void {
    const now = Math.floor(nowMs / 1000);
    for (const [jti, exp] of this.revoked) if (exp <= now) this.revoked.delete(jti);
  }
}

// ───────────── Cookies (no cookie-parser dependency) ─────────────

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/** httpOnly, SameSite=Lax, Path=/; Secure when served over HTTPS (production). */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}
