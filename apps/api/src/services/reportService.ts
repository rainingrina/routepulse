import type { DriverReasonCode, Milestone, Party, ReasonCode, ReportStatus } from '@routepulse/shared';
import { shipmentScope } from '../auth/policies.js';
import type { AuthUser } from '../auth/types.js';
import { REASON_DEFAULTS, defaultParty } from '../engines/attribution.js';
import { classify, CLASSIFIER_METHOD } from '../engines/classifier.js';
import { eligibleCheckInFor } from '../engines/simulate.js';
import { hhmm } from '../engines/eta.js';
import { DomainError, ValidationError, notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { fromS, loadDisruptions, loadLiveShipments, toS, type Db, type StaticWorld } from '../sim/world.js';
import { isReportNeedsReviewParams } from '../guards/notification.js';
import { writeAudit } from './auditService.js';
import type { Actor } from './simulationService.js';

/**
 * Driver reports and coordinator review (spec §5.8, API §9). A report is DRIVER-CONFIRMED when
 * created (the RPT factor applies at once, "Pending coordinator review") and COORDINATOR-CONFIRMED
 * after review. Nothing is ever confirmed automatically; the classifier only suggests.
 * Create and review run inside simulationService.applyChange (one transaction, one pipeline).
 */

export function classifyText(text: string) {
  const c = classify(text);
  const def = c.suggestedReason ? REASON_DEFAULTS[c.suggestedReason] : null;
  return {
    suggestedReason: c.suggestedReason,
    matchedKeywords: c.matchedKeywords,
    strength: c.strength,
    defaultMinutes: def ? def.minutes : null,
    defaultParty: def && def.party !== 'CONDITIONAL' ? def.party : null,
    method: CLASSIFIER_METHOD,
  } as const;
}

const REPORTABLE: readonly Milestone[] = ['AT_GATE', 'LOADING', 'IN_TRANSIT', 'ARRIVED'];
const DEPARTED: readonly Milestone[] = ['IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

export interface CreateReportInput {
  shipmentId: string;
  chipReason: DriverReasonCode | undefined;
  text: string | undefined;
  reason: DriverReasonCode;
  estimatedMinutes: number | undefined;
  user: AuthUser;
}

/** Creates a driver-confirmed report at the action minute. Returns the new report id. */
export async function createReport(tx: Prisma.TransactionClient, actionS: number, input: CreateReportInput): Promise<string> {
  const sh = await tx.shipment.findFirst({
    where: { AND: [{ id: input.shipmentId }, shipmentScope(input.user)] },
    select: { id: true, code: true, isHistorical: true, currentMilestone: true, physicalArrivalAt: true, stoppedUntil: true },
  });
  if (!sh) throw notFound();
  if (sh.isHistorical || sh.currentMilestone === 'DELIVERED') throw new DomainError('INVALID_TRANSITION', 'This shipment is already delivered.');
  if (!REPORTABLE.includes(sh.currentMilestone)) throw new DomainError('INVALID_TRANSITION', 'A problem can be reported once the truck is at the plant gate.');

  const c = input.text ? classify(input.text) : { suggestedReason: null, matchedKeywords: [] as string[] };
  const departed = DEPARTED.includes(sh.currentMilestone);
  const applied = input.estimatedMinutes ?? REASON_DEFAULTS[input.reason].minutes;
  const party = defaultParty(input.reason, departed);
  const n = await tx.driverReport.count({ where: { shipmentId: sh.id, simTime: fromS(actionS) } });
  const id = `rpt_${sh.id}_${actionS}${n > 0 ? `_${n + 1}` : ''}`;
  await tx.driverReport.create({
    data: {
      id,
      shipmentId: sh.id,
      reporterUserId: input.user.id,
      simTime: fromS(actionS),
      chipReason: input.chipReason ?? null,
      text: input.text ?? null,
      suggestedReason: c.suggestedReason,
      matchedKeywords: c.matchedKeywords,
      reason: input.reason,
      estimatedMinutes: input.estimatedMinutes ?? null,
      appliedMinutes: applied,
      party,
    },
  });

  // Every report holds a moving truck for its applied minutes (architecture §19 #15); several stops
  // → stoppedUntil = the latest end (L5). Before departure the gate rule books the time (GATE);
  // after physical arrival nothing moves (a confirmed "waiting to unload" extends deliveredAt only).
  const data: Prisma.ShipmentUpdateInput = { lastUpdateAt: fromS(actionS) };
  if (sh.currentMilestone === 'IN_TRANSIT' && sh.physicalArrivalAt === null) {
    const end = actionS + applied * 60;
    const current = sh.stoppedUntil ? toS(sh.stoppedUntil) : 0;
    if (end > current) data.stoppedUntil = fromS(end);
  }
  await tx.shipment.update({ where: { id: sh.id }, data });

  const source = input.user.role === 'COORDINATOR' ? 'COORDINATOR' : 'DRIVER';
  await tx.shipmentEvent.create({
    data: { id: `sev_${id}_DRIVER_REPORT`, shipmentId: sh.id, type: 'DRIVER_REPORT', simTime: fromS(actionS), source, actorUserId: input.user.id, data: { reportId: id, reason: input.reason, appliedMinutes: applied } },
  });
  const params = { shipmentCode: sh.code, reportId: id, reason: input.reason };
  if (!isReportNeedsReviewParams(params)) throw new Error('invalid notification params');
  await tx.notification.create({
    data: {
      id: `ntf_${id}_REVIEW`,
      audience: 'COORDINATOR',
      shipmentId: sh.id,
      kind: 'REPORT_NEEDS_REVIEW',
      templateKey: 'notif.REPORT_NEEDS_REVIEW',
      params: { ...params },
      text: `${sh.code}: driver report "${REASON_TEXT[input.reason]}" needs review`,
      simTime: fromS(actionS),
    },
  });
  await writeAudit(tx, {
    actorUserId: input.user.id,
    actorRole: input.user.role,
    action: 'report.create',
    entityType: 'DriverReport',
    entityId: id,
    data: { shipmentId: sh.id, reason: input.reason, appliedMinutes: applied, party, onBehalf: input.user.role === 'COORDINATOR' },
  });
  return id;
}

const REASON_TEXT: Record<ReasonCode, string> = {
  BREAKDOWN: 'Breakdown',
  PLANT_GATE_WAIT: 'Waiting at plant gate',
  TRAFFIC: 'Traffic jam',
  ROAD_CLOSED: 'Road closed',
  HEAVY_RAIN: 'Heavy rain',
  DOCUMENTS: 'Documents / checkpost',
  UNLOADING_WAIT: 'Waiting to unload',
  OTHER: 'Other',
  TRANSPORTER_PACE: 'Transporter pace',
  RECEIVING_WINDOW: 'Receiving window',
};

export interface ReviewInput {
  reportId: string;
  reason: ReasonCode;
  party: Party;
  note: string | undefined;
  actor: Actor;
}

/**
 * Coordinator review (API §9.5, AC-F3.2, AC-F1.3): confirms, or changes reason/party with a note.
 * The report's attribution rows (RPT:<id>) are re-tagged to the reviewed party and reason; the
 * driver's original values are kept on the report. Returns the shipment id.
 */
export async function reviewReport(tx: Prisma.TransactionClient, actionS: number, input: ReviewInput): Promise<string> {
  const r = await tx.driverReport.findUnique({ where: { id: input.reportId } });
  if (!r) throw notFound();
  if (r.status === 'CONFIRMED') throw new DomainError('ALREADY_DONE', 'This report has already been reviewed.');
  const sh = await tx.shipment.findUniqueOrThrow({ where: { id: r.shipmentId }, select: { currentMilestone: true } });
  // The review response carries the live ETA (API §9.5); a delivered shipment has none — corrections
  // after delivery use the attribution override (#35) instead.
  if (sh.currentMilestone === 'DELIVERED') throw new DomainError('INVALID_TRANSITION', 'This shipment is delivered; use an attribution override instead.');
  const changed = r.reason !== input.reason || r.party !== input.party;
  if (changed && !input.note) throw new ValidationError([{ path: 'note', message: 'A note is required when the reason or party changes' }]);

  await tx.driverReport.update({
    where: { id: r.id },
    data: {
      status: 'CONFIRMED',
      reviewedByUserId: input.actor.userId,
      reviewedAt: fromS(actionS),
      reviewNote: input.note ?? null,
      reason: input.reason,
      party: input.party,
      ...(changed ? { originalReason: r.reason, originalParty: r.party } : {}),
    },
  });

  // Re-tag the report's ledger rows (merging if a row for the new party already exists).
  const rows = await tx.delayAttribution.findMany({ where: { shipmentId: r.shipmentId, sourceKey: `RPT:${r.id}` }, orderBy: { id: 'asc' } });
  for (const row of rows) {
    if (row.party === input.party) {
      if (row.reason !== input.reason) await tx.delayAttribution.update({ where: { id: row.id }, data: { reason: input.reason } });
      continue;
    }
    const target = await tx.delayAttribution.findUnique({ where: { shipmentId_sourceKey_party: { shipmentId: r.shipmentId, sourceKey: row.sourceKey, party: input.party } } });
    if (target) {
      await tx.delayAttribution.delete({ where: { id: row.id } });
      await tx.delayAttribution.update({ where: { id: target.id }, data: { delaySeconds: target.delaySeconds + row.delaySeconds, reason: input.reason, updatedAtSim: fromS(actionS) } });
    } else {
      await tx.delayAttribution.update({ where: { id: row.id }, data: { party: input.party, reason: input.reason, updatedAtSim: fromS(actionS) } });
    }
  }

  const data = { reportId: r.id, reason: input.reason, party: input.party, changed, ...(changed ? { originalReason: r.reason, originalParty: r.party } : {}) };
  await tx.shipmentEvent.create({
    data: { id: `sev_${r.id}_REVIEWED`, shipmentId: r.shipmentId, type: 'REPORT_REVIEWED', simTime: fromS(actionS), source: 'COORDINATOR', actorUserId: input.actor.userId, data },
  });
  await writeAudit(tx, { actorUserId: input.actor.userId, actorRole: input.actor.role, action: 'report.review', entityType: 'DriverReport', entityId: r.id, data: { ...data, note: input.note ?? null } });
  return r.shipmentId;
}

export const REPORT_DTO_SELECT = {
  id: true,
  shipmentId: true,
  shipment: { select: { code: true } },
  reporter: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  simTime: true,
  chipReason: true,
  text: true,
  suggestedReason: true,
  matchedKeywords: true,
  reason: true,
  estimatedMinutes: true,
  appliedMinutes: true,
  party: true,
  status: true,
  reviewedAt: true,
  reviewNote: true,
  originalReason: true,
  originalParty: true,
} as const;

export async function getReport(db: Db, id: string) {
  const r = await db.driverReport.findUnique({ where: { id }, select: REPORT_DTO_SELECT });
  if (!r) throw notFound();
  return r;
}

export async function listReports(db: Db, q: { status: ReportStatus; shipmentId: string | undefined; limit: number }) {
  return db.driverReport.findMany({
    where: { status: q.status, ...(q.shipmentId ? { shipmentId: q.shipmentId } : {}) },
    orderBy: [{ simTime: 'desc' }, { id: 'desc' }],
    take: q.limit,
    select: REPORT_DTO_SELECT,
  });
}

/** Facts for the driver's view of one shipment (API §9 DriverTripShipment), at the settled time. */
export async function driverTripFacts(db: Db, world: StaticWorld, settledS: number, shipmentId: string) {
  const row = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: {
      id: true,
      code: true,
      etaAt: true,
      promisedBy: true,
      stoppedUntil: true,
      order: { select: { customer: { select: { name: true, city: true, lat: true, lng: true } } } },
      reports: { where: { status: 'PENDING_REVIEW' }, orderBy: [{ simTime: 'desc' }, { id: 'desc' }], select: { id: true, reason: true, status: true, simTime: true } },
    },
  });
  const disruptions = await loadDisruptions(db, settledS);
  const sim = (await loadLiveShipments(db, world, disruptions)).find((s) => s.id === shipmentId);
  const next = sim ? nextStep(sim, world, settledS) : { nextMilestone: null, canRecordNext: false, nextBlockedReason: null };
  return { row, milestone: sim?.milestone ?? 'DELIVERED', next, stopped: row.stoppedUntil !== null && toS(row.stoppedUntil) > settledS };
}

/** Next driver step and why it may be blocked — the same rules as simulationService.recordMilestone. */
function nextStep(sh: Awaited<ReturnType<typeof loadLiveShipments>>[number], world: StaticWorld, nowS: number): { nextMilestone: Milestone | null; canRecordNext: boolean; nextBlockedReason: string | null } {
  if (sh.autopilot) return { nextMilestone: null, canRecordNext: false, nextBlockedReason: 'Milestones are recorded automatically.' };
  switch (sh.milestone) {
    case 'ORDER_CONFIRMED':
      return { nextMilestone: 'AT_GATE', canRecordNext: false, nextBlockedReason: 'No truck assigned yet.' };
    case 'TRUCK_ASSIGNED':
      return { nextMilestone: 'AT_GATE', canRecordNext: true, nextBlockedReason: null };
    case 'AT_GATE':
      return { nextMilestone: 'GATE_OUT', canRecordNext: false, nextBlockedReason: 'Waiting for a loading bay.' };
    case 'LOADING': {
      if (sh.loadingEndS !== null && sh.loadingEndS > nowS) return { nextMilestone: 'GATE_OUT', canRecordNext: false, nextBlockedReason: `Loading finishes at ${hhmm(sh.loadingEndS)}.` };
      if (sh.plannedDepS > nowS) return { nextMilestone: 'GATE_OUT', canRecordNext: false, nextBlockedReason: `Planned departure is ${hhmm(sh.plannedDepS)}.` };
      return { nextMilestone: 'GATE_OUT', canRecordNext: true, nextBlockedReason: null };
    }
    case 'GATE_OUT':
    case 'IN_TRANSIT': {
      if (sh.physicalArrivalS === null) {
        const route = world.routes.get(sh.routeId);
        const km = route ? Math.max(0, Math.ceil((route.lengthMm - sh.progressMm) / 1_000_000)) : 0;
        return { nextMilestone: 'ARRIVED', canRecordNext: false, nextBlockedReason: `${km} km to destination` };
      }
      const eligible = eligibleCheckInFor(sh, sh.physicalArrivalS);
      if (eligible > nowS) return { nextMilestone: 'ARRIVED', canRecordNext: false, nextBlockedReason: `Receiving opens at ${hhmm(eligible)}` };
      return { nextMilestone: 'ARRIVED', canRecordNext: true, nextBlockedReason: null };
    }
    case 'ARRIVED': {
      const done = (sh.arrivedS ?? nowS) + (sh.unloadingMin + sh.extraUnloadMin) * 60;
      if (done > nowS) return { nextMilestone: 'DELIVERED', canRecordNext: false, nextBlockedReason: `Unloading finishes at ${hhmm(done)}` };
      return { nextMilestone: 'DELIVERED', canRecordNext: true, nextBlockedReason: null };
    }
    case 'DELIVERED':
      return { nextMilestone: null, canRecordNext: false, nextBlockedReason: null };
  }
}
