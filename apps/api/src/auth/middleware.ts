import type { Role } from '@routepulse/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config/env.js';
import type { PrismaClient } from '../db/prisma.js';
import { DomainError } from '../errors/domainError.js';
import { clearSessionCookie, readSessionCookie, verifyToken, type RevokedSessions } from './session.js';
import type { AuthContext, AuthUser } from './types.js';

export interface SessionDeps {
  config: AppConfig;
  prisma: PrismaClient;
  revoked: RevokedSessions;
  now: () => number;
}

/**
 * Reads the session cookie and, if it is valid, not revoked and names an active user, sets
 * `req.auth` from the DATABASE row (role and scope ids are never taken from the token or the
 * request). An invalid or stale cookie is cleared; the request continues unauthenticated and
 * `requireAuth` decides whether that is allowed.
 */
export function sessionMiddleware({ config, prisma, revoked, now }: SessionDeps): RequestHandler {
  const secure = config.nodeEnv === 'production';
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = readSessionCookie(req.headers.cookie);
    if (!token) return next();

    const nowMs = now();
    const verified = verifyToken(token, config.sessionSecret, nowMs);
    if (!verified.ok || revoked.isRevoked(verified.claims.jti, nowMs)) {
      res.append('Set-Cookie', clearSessionCookie(secure));
      return next();
    }

    const row = await prisma.user.findUnique({
      where: { id: verified.claims.sub },
      select: { id: true, role: true, name: true, email: true, customerId: true, transporterId: true, isActive: true },
    });
    if (!row || !row.isActive) {
      res.append('Set-Cookie', clearSessionCookie(secure));
      return next();
    }

    const user: AuthUser = {
      id: row.id,
      role: row.role,
      name: row.name,
      email: row.email,
      customerId: row.customerId,
      transporterId: row.transporterId,
    };
    req.auth = { user, sessionId: verified.claims.jti, expiresAt: verified.claims.exp };
    next();
  };
}

/** 401 UNAUTHENTICATED unless a valid session is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new DomainError('UNAUTHENTICATED', 'Please sign in to continue.'));
  next();
}

/** 401 without a session; 403 FORBIDDEN when the signed-in role is not allowed. */
export function requireRole(...roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new DomainError('UNAUTHENTICATED', 'Please sign in to continue.'));
    if (!roles.includes(req.auth.user.role)) {
      return next(new DomainError('FORBIDDEN', 'You do not have access to this action.'));
    }
    next();
  };
}

/** Simulator, clock and reset endpoints also need DEMO_MODE=true (architecture §14). */
export function requireDemoMode(config: AppConfig): RequestHandler {
  return (_req, _res, next) => {
    if (!config.demoMode) return next(new DomainError('DEMO_MODE_OFF', 'Demo controls are disabled on this server.'));
    next();
  };
}

/** The session context, for handlers mounted after requireAuth / requireRole. */
export function authContext(req: Request): AuthContext {
  if (!req.auth) throw new DomainError('UNAUTHENTICATED', 'Please sign in to continue.');
  return req.auth;
}

/** The authenticated user, for handlers mounted after requireAuth / requireRole. */
export function authUser(req: Request): AuthUser {
  return authContext(req).user;
}
