import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import type { PrismaClient } from './db/prisma.js';
import type { Logger } from './logging/logger.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { jsonOnly } from './middleware/jsonOnly.js';
import { requestId } from './middleware/requestId.js';
import { requestLog } from './middleware/requestLog.js';
import { healthRouter } from './routes/health.js';

export interface AppDeps {
  config: AppConfig;
  prisma: PrismaClient;
  logger: Logger;
}

/** Builds the Express app. No listening here, so tests can mount it on an ephemeral port. */
export function createApp({ prisma, logger }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

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
  app.use('/api', healthRouter(prisma));
  app.use('/api', apiNotFound);

  app.use(errorHandler(logger));
  return app;
}
