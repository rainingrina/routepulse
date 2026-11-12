import type { SimClockResponse, SimResetResponse, SyncResponse } from '@routepulse/shared';
import { Router } from 'express';
import { authUser, requireAuth, requireDemoMode, requireRole } from '../auth/middleware.js';
import { notificationScope } from '../auth/policies.js';
import type { AppConfig } from '../config/env.js';
import type { PrismaClient } from '../db/prisma.js';
import type { ClockCommand, SimulationService } from '../services/simulationService.js';
import { Validator } from '../validation/validator.js';

const ACTIONS = ['PLAY', 'PAUSE', 'SET_SPEED', 'ADVANCE', 'ADVANCE_TO'] as const;

function parseClock(body: unknown): ClockCommand {
  const v = new Validator();
  const raw = v.object(body, 'body', ['action', 'speed', 'minutes', 'to']);
  const action = v.oneOf(raw, 'action', ACTIONS);
  // Reject fields that do not belong to the chosen action (unknown-field rule, API §1.2).
  const allowed: Record<(typeof ACTIONS)[number], string[]> = {
    PLAY: ['action'],
    PAUSE: ['action'],
    SET_SPEED: ['action', 'speed'],
    ADVANCE: ['action', 'minutes'],
    ADVANCE_TO: ['action', 'to'],
  };
  if (action) v.object(raw, 'body', allowed[action]);
  let cmd: ClockCommand | null = null;
  switch (action) {
    case 'PLAY':
    case 'PAUSE':
      cmd = { action };
      break;
    case 'SET_SPEED': {
      const speed = v.integer(raw, 'speed', { min: 1, max: 60 });
      if (speed !== undefined && speed !== 1 && speed !== 10 && speed !== 60) v.issues.push({ path: 'speed', message: 'Must be 1, 10 or 60' });
      cmd = { action, speed: speed as 1 | 10 | 60 };
      break;
    }
    case 'ADVANCE': {
      const minutes = v.integer(raw, 'minutes', { min: 5, max: 720, multipleOf: 5 });
      cmd = { action, minutes: minutes as number };
      break;
    }
    case 'ADVANCE_TO': {
      const to = v.isoDateTime(raw, 'to');
      if (to && to.getTime() % 300_000 !== 0) v.issues.push({ path: 'to', message: 'Must be on a 5-minute boundary' });
      cmd = { action, to: to as Date };
      break;
    }
  }
  v.assertValid();
  return cmd as ClockCommand;
}

/** #4 GET /api/sync (any signed-in role) · #5 POST /api/sim/clock · #6 POST /api/sim/reset (coordinator + DEMO_MODE). */
export function simRouter(sim: SimulationService, prisma: PrismaClient, config: AppConfig): Router {
  const router = Router();

  router.get('/sync', requireAuth, async (req, res) => {
    const user = authUser(req);
    const state = await sim.state();
    const unreadNotifications =
      user.role === 'DRIVER' ? 0 : await prisma.notification.count({ where: { AND: [notificationScope(user), { readAt: null }] } });
    res.json({ ...state, unreadNotifications } satisfies SyncResponse);
  });

  router.post('/sim/clock', requireRole('COORDINATOR'), requireDemoMode(config), async (req, res) => {
    const cmd = parseClock(req.body);
    const user = authUser(req);
    const result = await sim.control(cmd, { userId: user.id, role: user.role });
    res.json(result satisfies SimClockResponse);
  });

  router.post('/sim/reset', requireRole('COORDINATOR'), requireDemoMode(config), async (req, res) => {
    const v = new Validator();
    const body = v.object(req.body, 'body', ['confirm']);
    v.literalTrue(body, 'confirm');
    v.assertValid();
    const user = authUser(req);
    const result = await sim.reset({ userId: user.id, role: user.role });
    res.json(result satisfies SimResetResponse);
  });

  return router;
}
