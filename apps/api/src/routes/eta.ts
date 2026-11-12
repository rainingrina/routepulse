import type { EngineRulesResponse, EtaResponse } from '@routepulse/shared';
import { Router } from 'express';
import { authUser, requireRole } from '../auth/middleware.js';
import { toEtaCoordinator, toEtaCustomer } from '../serializers/eta.js';
import { engineRules, getEta } from '../services/etaQueryService.js';
import type { SimulationService } from '../services/simulationService.js';
import { Validator } from '../validation/validator.js';

/** #18 GET /api/shipments/:shipmentId/eta (coordinator, own customer) · #20 GET /api/engine/rules (any role). */
export function etaRouter(sim: SimulationService): Router {
  const router = Router();

  router.get('/shipments/:shipmentId/eta', requireRole('COORDINATOR', 'CUSTOMER'), async (req, res) => {
    const v = new Validator();
    const id = v.pathId(req.params.shipmentId, 'shipmentId');
    v.assertValid();
    const user = authUser(req);
    const result = await getEta(sim, user, id as string);
    const body: EtaResponse = { eta: user.role === 'COORDINATOR' ? toEtaCoordinator(result) : toEtaCustomer(result) };
    res.json(body);
  });

  router.get('/engine/rules', (_req, res) => {
    const body: EngineRulesResponse = engineRules();
    res.json(body);
  });

  return router;
}
