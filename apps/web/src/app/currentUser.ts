import { createContext, useContext } from 'react';
import type { UserDto } from '../api/contract';

/**
 * The signed-in user of a guarded route tree, provided by `RoleGuard`.
 *
 * Kept in its own module on purpose: `RoleGuard.tsx` then exports only components and can be
 * Fast-Refreshed. When the context lived there, every hot update re-ran that module and created a
 * new context object; a page module that failed to reload kept reading the old one and threw
 * "useCurrentUser must be used inside RoleGuard" (dev-only; reproduced 2026-11-12).
 */
export const CurrentUserContext = createContext<UserDto | null>(null);

export function useCurrentUser(): UserDto {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used inside RoleGuard');
  return user;
}
