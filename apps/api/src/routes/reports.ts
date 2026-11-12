import {
  DRIVER_REASON_CODES,
  PARTIES,
  REASON_CODES,
  REPORT_ESTIMATE_MINUTES,
  REPORT_STATUSES,
  type AttributionResponse,
  type ClassifyResponse,
  type CreateDriverReportResponse,
  type DriverReportListResponse,
  type ReviewDriverReportResponse,
} from '@routepulse/shared';
import { Router } from 'express';
import { authUser, requireRole } from '../auth/middleware.js';
import { assertShipmentInScope } from '../auth/policies.js';
import type { PrismaClient } from '../db/prisma.js';
import { toEtaCoordinator } from '../serializers/eta.js';
import { toDriverReportDto, toDriverTripShipment } from '../serializers/driverReport.js';
import { getAttribution, overrideAttribution } from '../services/attributionService.js';
import { getEta } from '../services/etaQueryService.js';
import { classifyText, createReport, driverTripFacts, getReport, listReports, reviewReport } from '../services/reportService.js';
import type { SimulationService } from '../services/simulationService.js';
import { Validator } from '../validation/validator.js';

/**
 * #22 classify · #23 create report · #24 review queue · #25 review (API §9)
 * #34 attribution · #35 attribution override (API §12)
 */
export function reportsRouter(sim: SimulationService, prisma: PrismaClient): Router {
  const router = Router();

  router.post('/driver-reports/classify', requireRole('DRIVER', 'COORDINATOR'), (req, res) => {
    const v = new Validator();
    const body = v.object(req.body, 'body', ['text']);
    const text = v.string(body, 'text', { min: 1, max: 280, trim: true });
    v.assertValid();
    const out: ClassifyResponse = classifyText(text as string);
    res.json(out);
  });

  router.post('/shipments/:shipmentId/driver-reports', requireRole('DRIVER', 'COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const shipmentId = v.pathId(req.params.shipmentId, 'shipmentId');
    const body = v.object(req.body, 'body', ['chipReason', 'text', 'reason', 'estimatedMinutes']);
    const chipReason = v.oneOf(body, 'chipReason', DRIVER_REASON_CODES, { optional: true });
    const text = v.string(body, 'text', { min: 1, max: 280, trim: true, optional: true });
    const reason = v.oneOf(body, 'reason', DRIVER_REASON_CODES);
    const estimatedMinutes = v.integer(body, 'estimatedMinutes', { min: 30, max: 240, optional: true });
    if (estimatedMinutes !== undefined && !(REPORT_ESTIMATE_MINUTES as readonly number[]).includes(estimatedMinutes)) {
      v.issues.push({ path: 'estimatedMinutes', message: 'Must be 30, 60, 120 or 240' });
    }
    if (body['chipReason'] === undefined && body['text'] === undefined) v.issues.push({ path: 'body', message: 'Pick a reason chip or type a note' });
    v.assertValid();
    const user = authUser(req);
    const { result: reportId } = await sim.applyChange('REPORT', async (tx, actionS) => {
      const id = await createReport(tx, actionS, { shipmentId: shipmentId as string, chipReason, text, reason: reason as (typeof DRIVER_REASON_CODES)[number], estimatedMinutes, user });
      return { result: id, shipmentIds: [shipmentId as string] };
    });
    const report = toDriverReportDto(await getReport(prisma, reportId));
    const trip = user.role === 'DRIVER' ? await sim.readSettled(async (db, world, s) => toDriverTripShipment(await driverTripFacts(db, world, s, shipmentId as string))) : null;
    const out: CreateDriverReportResponse = { report, trip };
    res.status(201).json(out);
  });

  router.get('/driver-reports', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const q = v.object(req.query, 'query', ['status', 'shipmentId', 'limit']);
    const status = v.oneOf(q, 'status', REPORT_STATUSES, { optional: true }) ?? 'PENDING_REVIEW';
    const shipmentId = q['shipmentId'] === undefined ? undefined : v.pathId(q['shipmentId'], 'shipmentId');
    let limit = 50;
    if (q['limit'] !== undefined) {
      const n = typeof q['limit'] === 'string' && /^\d+$/.test(q['limit']) ? Number(q['limit']) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > 200) v.issues.push({ path: 'limit', message: 'Must be an integer from 1 to 200' });
      else limit = n;
    }
    v.assertValid();
    const out: DriverReportListResponse = { items: (await listReports(prisma, { status, shipmentId, limit })).map(toDriverReportDto) };
    res.json(out);
  });

  router.post('/driver-reports/:reportId/review', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const reportId = v.pathId(req.params.reportId, 'reportId');
    const body = v.object(req.body, 'body', ['reason', 'party', 'note']);
    const reason = v.oneOf(body, 'reason', REASON_CODES);
    const party = v.oneOf(body, 'party', PARTIES);
    const note = v.string(body, 'note', { min: 5, max: 280, trim: true, optional: true });
    if (party === 'UNATTRIBUTED' && reason !== undefined && reason !== 'OTHER') v.issues.push({ path: 'party', message: 'Unattributed is only allowed with reason OTHER' });
    v.assertValid();
    const user = authUser(req);
    const actor = { userId: user.id, role: user.role };
    const { result: shipmentId } = await sim.applyChange('REVIEW', async (tx, actionS) => {
      const sid = await reviewReport(tx, actionS, { reportId: reportId as string, reason: reason as (typeof REASON_CODES)[number], party: party as (typeof PARTIES)[number], note, actor });
      return { result: sid, shipmentIds: [sid] };
    });
    const out: ReviewDriverReportResponse = { report: toDriverReportDto(await getReport(prisma, reportId as string)), eta: toEtaCoordinator(await getEta(sim, user, shipmentId)) };
    res.json(out);
  });

  router.get('/shipments/:shipmentId/attribution', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const shipmentId = v.pathId(req.params.shipmentId, 'shipmentId');
    v.assertValid();
    await assertShipmentInScope(prisma, authUser(req), shipmentId as string);
    const out: AttributionResponse = await getAttribution(prisma, shipmentId as string);
    res.json(out);
  });

  router.post('/shipments/:shipmentId/attribution/overrides', requireRole('COORDINATOR'), async (req, res) => {
    const v = new Validator();
    const shipmentId = v.pathId(req.params.shipmentId, 'shipmentId');
    const body = v.object(req.body, 'body', ['attributionId', 'newParty', 'note']);
    const attributionId = v.string(body, 'attributionId', { min: 1, max: 128 });
    const newParty = v.oneOf(body, 'newParty', PARTIES);
    const note = v.string(body, 'note', { min: 5, max: 280, trim: true });
    v.assertValid();
    const user = authUser(req);
    await assertShipmentInScope(prisma, user, shipmentId as string);
    await sim.applyChange('OVERRIDE', async (tx, actionS) => {
      await overrideAttribution(tx, actionS, { shipmentId: shipmentId as string, attributionId: attributionId as string, newParty: newParty as (typeof PARTIES)[number], note: note as string, actor: { userId: user.id, role: user.role } });
      return { result: null, shipmentIds: [shipmentId as string] };
    });
    const out: AttributionResponse = await getAttribution(prisma, shipmentId as string);
    res.json(out);
  });

  return router;
}
