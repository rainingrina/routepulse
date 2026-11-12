import type { LoginResponse, Role, UserDto } from '../api/contract';

/** Home per role — UI plan §3, matches `LoginResponse.homePath` (API §4.1). */
export const HOME_PATH: Record<Role, LoginResponse['homePath']> = {
  COORDINATOR: '/control-tower',
  CUSTOMER: '/orders',
  DRIVER: '/trip',
};

export type AccessDecision = { kind: 'allow' } | { kind: 'login' } | { kind: 'redirect'; to: string };

/**
 * Client-side role guard decision. UX only — the server enforces access (architecture §5.1);
 * a signed-in user on another role's route is sent to their own home.
 */
export function decideAccess(user: UserDto | null, required: Role): AccessDecision {
  if (!user) return { kind: 'login' };
  if (user.role !== required) return { kind: 'redirect', to: HOME_PATH[user.role] };
  return { kind: 'allow' };
}

export const SESSION_EXPIRED_PARAM = 'session';
export const SESSION_EXPIRED_VALUE = 'expired';
