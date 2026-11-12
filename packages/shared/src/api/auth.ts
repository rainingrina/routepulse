import type { Role } from '../enums.js';
import type { Id } from './common.js';

/** 06_API_SPEC.md §2.2 — the signed-in user. Never contains password or session data. */
export interface UserDto {
  id: Id;
  name: string;
  email: string;
  role: Role;
  /** CUSTOMER only. */
  customer: { id: Id; name: string } | null;
  /** DRIVER only. */
  transporter: { id: Id; name: string } | null;
}

export type HomePath = '/control-tower' | '/orders' | '/trip';

/** POST /api/auth/login (#1). */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /api/auth/login (#1) → 200. Also sets the httpOnly `rp_session` cookie. */
export interface LoginResponse {
  user: UserDto;
  homePath: HomePath;
}

/** GET /api/auth/me (#3) → 200. */
export interface MeResponse {
  user: UserDto;
}

/** Name of the httpOnly session cookie (architecture §7.1). The browser sends it automatically. */
export const SESSION_COOKIE_NAME = 'rp_session';
