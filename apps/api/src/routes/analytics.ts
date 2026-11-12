import { DASHBOARD_PERIODS, type DashboardResponse } from '@routepulse/shared';
import { Router } from 'express';
import { requireRole } from '../auth/middleware.js';
import { getDashboard } from '../services/analyticsService.js';
import type { SimulationService } from '../services/simulationService.js';
import { Validator } from '../validation/validator.js';

/** #36 `GET /api/analytics/dashboard` (API §13): coordinator only, read-only, one filtered set. */
export function analyticsRouter(sim: SimulationService): Router {
  const router = Router();
  router.get('/analytics/dashboard', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['period', 'laneId', 'transporterId']);
    const period = v.oneOf(q, 'period', DASHBOARD_PERIODS, { optional: true }) ?? '30d';
    const laneId = q['laneId'] === undefined ? undefined : v.pathId(q['laneId'], 'laneId');
    const transporterId = q['transporterId'] === undefined ? undefined : v.pathId(q['transporterId'], 'transporterId');
    v.assertValid();
    const out: DashboardResponse = await sim.readSettled((db, _w, s) => getDashboard(db, { period, laneId, transporterId }, s));
    res.json(out);
  });
  return router;
}
