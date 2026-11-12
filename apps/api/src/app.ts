import express, { type Express } from 'express';
import helmet from 'helmet';
import { requireAuth, sessionMiddleware } from './auth/middleware.js';
import { LOGIN_RATE_LIMIT, RateLimiter } from './auth/rateLimit.js';
import { RevokedSessions } from './auth/session.js';
import type { AppConfig } from './config/env.js';
import type { PrismaClient } from './db/prisma.js';
import type { Logger } from './logging/logger.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { jsonOnly } from './middleware/jsonOnly.js';
import { requestId } from './middleware/requestId.js';
import { requestLog } from './middleware/requestLog.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { createAuthService } from './services/authService.js';
import { createSimulationService, type RecalcHook, type SimulationService } from './services/simulationService.js';
import { simRouter } from './routes/sim.js';
import { etaRouter } from './routes/eta.js';

export interface AppDeps {
  config: AppConfig;
  prisma: PrismaClient;
  logger: Logger;
  /** Real-time clock for sessions and rate limits (injectable for tests). Never simulation time. */
  now?: () => number;
  /** Login rate limit override (tests). */
  loginRateLimit?: { limit: number; windowMs: number };
  /** Simulation options (tests inject a real-time clock, disable timers, or a failing recalc hook). */
  simulation?: { realNow?: () => number; timers?: boolean; recalc?: RecalcHook };
}

export interface AppLocals {
  simulation: SimulationService;
}

/** Builds the Express app. No listening here, so tests can mount it on an ephemeral port. */
export function createApp({ config, prisma, logger, now = Date.now, loginRateLimit = LOGIN_RATE_LIMIT, simulation = {} }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  const revoked = new RevokedSessions();
  const loginLimiter = new RateLimiter(loginRateLimit.limit, loginRateLimit.windowMs);
  const authService = createAuthService({ prisma, sessionSecret: config.sessionSecret, revoked, loginLimiter, now });
  const secureCookies = config.nodeEnv === 'production';
  const sim = createSimulationService({
    prisma,
    demoMode: config.demoMode,
    ...(config.seedDemoPassword ? { seedDemoPassword: config.seedDemoPassword } : {}),
    ...simulation,
  });
  (app.locals as AppLocals).simulation = sim;

  app.use(requestId);
  app.use(requestLog(logger));
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Offline demo: every request must stay on this origin (architecture §14, §16.4).
          'connect-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'worker-src': ["'self'", 'blob:'],
        },
      },
    }),
  );

  app.use('/api', jsonOnly, express.json({ limit: '100kb' }));
  app.use('/api', sessionMiddleware({ config, prisma, revoked, now }));

  // Public endpoints.
  app.use('/api', healthRouter(prisma));
  app.use('/api', authRouter(authService, { secureCookies }));

  // Deny by default: every other /api route requires a valid session. Unauthenticated callers get
  // 401 even for unknown paths, so the API surface cannot be enumerated without signing in.
  app.use('/api', requireAuth);
  app.use('/api', simRouter(sim, prisma, config));
  app.use('/api', etaRouter(sim));
  // (Further protected routers are mounted here in later milestones, each with requireRole + scope policies.)
  app.use('/api', apiNotFound);

  app.use(errorHandler(logger));
  return app;
}
