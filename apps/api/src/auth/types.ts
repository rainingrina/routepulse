import type { Role } from '@routepulse/shared';

/**
 * The authenticated principal for one request. Built ONLY from the database row of the user named
 * by a valid session token — never from request bodies, query strings or headers.
 */
export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  customerId: string | null;
  transporterId: string | null;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  /** Token expiry, seconds since epoch (real time). */
  expiresAt: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the session middleware when a valid session cookie is present. */
    auth?: AuthContext;
  }
}
