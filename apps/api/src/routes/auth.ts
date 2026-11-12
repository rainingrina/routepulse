import type { LoginResponse, MeResponse } from '@routepulse/shared';
import { Router } from 'express';
import { authContext, requireAuth } from '../auth/middleware.js';
import { SESSION_TTL_SECONDS, clearSessionCookie, sessionCookie } from '../auth/session.js';
import type { AuthService } from '../services/authService.js';
import { Validator } from '../validation/validator.js';

/**
 * #1 POST /api/auth/login (public) · #2 POST /api/auth/logout · #3 GET /api/auth/me
 * Controllers only validate shape, call the service and serialize (architecture §6.1).
 */
export function authRouter(auth: AuthService, opts: { secureCookies: boolean }): Router {
  const router = Router();

  router.post('/auth/login', async (req, res) => {
    const v = new Validator();
    const body = v.object(req.body, 'body', ['email', 'password']);
    const email = v.email(body, 'email');
    const password = v.string(body, 'password', { min: 1, max: 128 });
    v.assertValid();

    const result = await auth.login(email as string, password as string, req.ip ?? 'unknown');
    res.setHeader('Set-Cookie', sessionCookie(result.token, SESSION_TTL_SECONDS, opts.secureCookies));
    res.status(200).json(result.body satisfies LoginResponse);
  });

  router.post('/auth/logout', requireAuth, async (req, res) => {
    await auth.logout(authContext(req));
    res.setHeader('Set-Cookie', clearSessionCookie(opts.secureCookies));
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth, async (req, res) => {
    const user = await auth.me(authContext(req));
    res.status(200).json({ user } satisfies MeResponse);
  });

  return router;
}
