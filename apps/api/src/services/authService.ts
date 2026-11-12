import type { LoginResponse, UserDto } from '@routepulse/shared';
import { verifyPassword } from '../auth/password.js';
import type { RateLimiter } from '../auth/rateLimit.js';
import { issueToken, type RevokedSessions, type SessionClaims } from '../auth/session.js';
import type { AuthContext } from '../auth/types.js';
import type { PrismaClient } from '../db/prisma.js';
import { DomainError, notFound } from '../errors/domainError.js';
import { HOME_PATH, USER_DTO_SELECT, toUserDto } from '../serializers/user.js';
import { writeAudit } from './auditService.js';

export interface AuthServiceDeps {
  prisma: PrismaClient;
  sessionSecret: string;
  revoked: RevokedSessions;
  loginLimiter: RateLimiter;
  now: () => number;
}

/** One message for every login failure, so responses never reveal whether an account exists. */
export const LOGIN_FAILED_MESSAGE = 'Email or password is incorrect.';

export function createAuthService({ prisma, sessionSecret, revoked, loginLimiter, now }: AuthServiceDeps) {
  return {
    async login(email: string, password: string, clientIp: string): Promise<{ token: string; claims: SessionClaims; body: LoginResponse }> {
      if (!loginLimiter.attempt(clientIp, now())) {
        throw new DomainError('RATE_LIMITED', 'Too many sign-in attempts. Try again in a minute.');
      }

      const row = await prisma.user.findUnique({
        where: { email },
        select: { ...USER_DTO_SELECT, passwordHash: true, isActive: true },
      });
      const usable = row !== null && row.isActive;
      const ok = await verifyPassword(password, usable ? row.passwordHash : null);

      if (!ok || !row) {
        await writeAudit(prisma, {
          actorUserId: null,
          actorRole: null,
          action: 'auth.login.failed',
          entityType: 'User',
          entityId: null,
          data: { email },
        });
        throw new DomainError('UNAUTHENTICATED', LOGIN_FAILED_MESSAGE);
      }

      const { token, claims } = issueToken({ id: row.id, role: row.role }, sessionSecret, now());
      await writeAudit(prisma, { actorUserId: row.id, actorRole: row.role, action: 'auth.login', entityType: 'User', entityId: row.id });
      return { token, claims, body: { user: toUserDto(row), homePath: HOME_PATH[row.role] } };
    },

    async logout(auth: AuthContext): Promise<void> {
      revoked.revoke({ jti: auth.sessionId, exp: auth.expiresAt });
      await writeAudit(prisma, { actorUserId: auth.user.id, actorRole: auth.user.role, action: 'auth.logout', entityType: 'User', entityId: auth.user.id });
    },

    async me(auth: AuthContext): Promise<UserDto> {
      const row = await prisma.user.findUnique({ where: { id: auth.user.id }, select: USER_DTO_SELECT });
      if (!row) throw notFound();
      return toUserDto(row);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
