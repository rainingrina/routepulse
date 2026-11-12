import type { HealthResponse } from '@routepulse/shared';
import { Router } from 'express';
import type { PrismaClient } from '../db/prisma.js';

export const API_VERSION = '0.1.0';

/**
 * GET /api/health — public operational check. 200 when the database answers, 503 otherwise.
 * Business logic lives in services; this route only probes the connection.
 */
export function healthRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    let database: HealthResponse['database'] = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const body = {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      serverTime: new Date().toISOString(),
      version: API_VERSION,
    } satisfies HealthResponse;
    res.status(database === 'up' ? 200 : 503).json(body);
  });
  return router;
}
