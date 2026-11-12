import { join } from 'node:path';
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
import { reportsRouter } from './routes/reports.js';
import { worldRouter } from './routes/world.js';
import { portalRouter } from './routes/portal.js';
import { analyticsRouter } from './routes/analytics.js';

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
  // Offline basemap (architecture §16, O-11): the regional PMTiles file is served same-origin with
  // HTTP Range support (MapLibre's pmtiles protocol reads it in byte ranges). Public OSM-derived data,
  // so no session is needed; a missing file is a plain 404 and the SPA falls back to its land-only style.
  app.use(
    '/tiles',
    express.static(config.basemapDir, {
      acceptRanges: true,
      index: false,
      dotfiles: 'ignore',
      maxAge: '1h',
      setHeaders: (res, path) => {
        if (path.endsWith('.pmtiles')) res.setHeader('Content-Type', 'application/vnd.pmtiles');
      },
    }),
  );
  app.use('/tiles', (_req, res) => {
    res.status(404).type('text/plain').send('Basemap not installed. Run `npm run basemap:fetch` (see docs/DEVELOPMENT_AND_TESTING.md).');
  });
  // City-label glyphs (one Latin range of Noto Sans Regular, OFL), fetched with the basemap: same origin.
  app.use(
    '/glyphs',
    express.static(join(config.basemapDir, 'glyphs'), {
      index: false,
      dotfiles: 'ignore',
      maxAge: '1h',
      setHeaders: (res, path) => {
        if (path.endsWith('.pbf')) res.setHeader('Content-Type', 'application/x-protobuf');
      },
    }),
  );
  app.use('/glyphs', (_req, res) => {
    res.status(404).type('text/plain').send('Map glyphs not installed. Run `npm run basemap:fetch -- --glyphs-only`.');
  });
  // Static-file errors keep their HTTP status (e.g. 416 for an unsatisfiable Range, 403 for a bad path).
  const staticError = (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : 500;
    res.status(status).end();
  };
  app.use('/tiles', staticError);
  app.use('/glyphs', staticError);
  app.use('/api', sessionMiddleware({ config, prisma, revoked, now }));

  // Public endpoints.
  app.use('/api', healthRouter(prisma));
  app.use('/api', authRouter(authService, { secureCookies }));

  // Deny by default: every other /api route requires a valid session. Unauthenticated callers get
  // 401 even for unknown paths, so the API surface cannot be enumerated without signing in.
  app.use('/api', requireAuth);
  app.use('/api', simRouter(sim, prisma, config));
  app.use('/api', etaRouter(sim));
  app.use('/api', reportsRouter(sim, prisma));
  app.use('/api', worldRouter(sim, prisma, config));
  app.use('/api', portalRouter(sim, prisma));
  app.use('/api', analyticsRouter(sim));
  // (Further protected routers are mounted here in later milestones, each with requireRole + scope policies.)
  app.use('/api', apiNotFound);

  app.use(errorHandler(logger));
  return app;
}
