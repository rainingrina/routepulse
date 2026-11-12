import type { CreateDisruptionRequest, CreateDisruptionResponse, DisruptionDto, DisruptionKind, Party, ReasonCode, RiskLevel } from '@routepulse/shared';
import { DomainError, ValidationError, notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isSegmentArray } from '../guards/geo.js';
import { fromS, toS, type Db } from '../sim/world.js';
import { writeAudit } from './auditService.js';
import type { Actor } from './simulationService.js';

/**
 * Simulator disruptions (API §5.4–5.6, spec §5.7, AC-X4.1). A disruption is only DATA: the
 * deterministic simulation engine applies it (slowdown / closure at segment entry / breakdown hold /
 * gate congestion, L5 precedence) and the single recalculation pipeline produces ETA, risk,
 * alerts and notifications. Create and end run inside simulationService.applyChange.
 */

const KIND_PARTY: Record<DisruptionKind, { party: Party; reason: ReasonCode }> = {
  WEATHER_SLOWDOWN: { party: 'EXTERNAL', reason: 'HEAVY_RAIN' },
  ROAD_CLOSURE: { party: 'EXTERNAL', reason: 'ROAD_CLOSED' },
  GATE_CONGESTION: { party: 'PLANT', reason: 'PLANT_GATE_WAIT' },
  TRUCK_BREAKDOWN: { party: 'TRANSPORTER', reason: 'BREAKDOWN' },
};

export const DISRUPTION_SELECT = {
  id: true,
  kind: true,
  origin: true,
  label: true,
  segmentCodes: true,
  shipmentId: true,
  slowdownPct: true,
  extraMinutesPerTruck: true,
  stopMinutes: true,
  party: true,
  reasonCode: true,
  startsAt: true,
  endsAt: true,
  endedEarlyAt: true,
} as const satisfies Prisma.DisruptionSelect;

type DisruptionRow = Prisma.DisruptionGetPayload<{ select: typeof DISRUPTION_SELECT }>;

export function toDisruptionDto(d: DisruptionRow, nowS: number): DisruptionDto {
  const end = toS(d.endedEarlyAt ?? d.endsAt);
  return {
    id: d.id,
    kind: d.kind,
    origin: d.origin,
    label: d.label,
    segmentCodes: [...d.segmentCodes],
    shipmentId: d.shipmentId,
    slowdownPct: d.slowdownPct,
    extraMinutesPerTruck: d.extraMinutesPerTruck,
    stopMinutes: d.stopMinutes,
    party: d.party,
    reason: d.reasonCode,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    endedEarlyAt: d.endedEarlyAt ? d.endedEarlyAt.toISOString() : null,
    active: toS(d.startsAt) <= nowS && nowS < end,
  };
}

export async function listDisruptions(db: Db, nowS: number, active: boolean | undefined): Promise<DisruptionDto[]> {
  const rows = await db.disruption.findMany({ orderBy: [{ startsAt: 'desc' }, { id: 'desc' }], select: DISRUPTION_SELECT });
  return rows.map((r) => toDisruptionDto(r, nowS)).filter((d) => active === undefined || d.active === active);
}

/** Segment code → { name, route ids } from the seeded route table (validation and labels). */
async function segmentIndex(db: Db): Promise<Map<string, { name: string; routeIds: string[] }>> {
  const routes = await db.route.findMany({ select: { id: true, segments: true } });
  const out = new Map<string, { name: string; routeIds: string[] }>();
  for (const r of routes) {
    if (!isSegmentArray(r.segments)) continue;
    for (const s of r.segments) {
      const e = out.get(s.segmentCode) ?? { name: s.name, routeIds: [] };
      e.routeIds.push(r.id);
      out.set(s.segmentCode, e);
    }
  }
  return out;
}

/**
 * Shipments a disruption applies to (spec §5.7): weather/closure → live shipments that have not
 * yet passed one of its segments; gate congestion → shipments not yet departed; breakdown → that
 * shipment. Whether the ETA actually changes is decided by the engine, not here.
 */
async function affectedShipments(db: Db, d: { kind: DisruptionKind; segmentCodes: readonly string[]; shipmentId: string | null }): Promise<{ id: string; code: string }[]> {
  if (d.kind === 'TRUCK_BREAKDOWN') {
    return d.shipmentId ? db.shipment.findMany({ where: { id: d.shipmentId }, select: { id: true, code: true } }) : [];
  }
  if (d.kind === 'GATE_CONGESTION') {
    return db.shipment.findMany({
      where: { isHistorical: false, currentMilestone: { in: ['ORDER_CONFIRMED', 'TRUCK_ASSIGNED', 'AT_GATE', 'LOADING'] } },
      orderBy: { code: 'asc' },
      select: { id: true, code: true },
    });
  }
  const live = await db.shipment.findMany({
    where: { isHistorical: false, currentMilestone: { not: 'DELIVERED' }, physicalArrivalAt: null },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, progressM: true, route: { select: { segments: true } } },
  });
  return live
    .filter((s) => isSegmentArray(s.route.segments) && s.route.segments.some((sg) => d.segmentCodes.includes(sg.segmentCode) && sg.endKm * 1000 > s.progressM))
    .map((s) => ({ id: s.id, code: s.code }));
}

const LEVEL_WORD: Record<RiskLevel, string> = { ON_TRACK: 'On track', WATCH: 'Watch', AT_RISK: 'At risk', LATE: 'Late' };

/** Builds the impact block (API §5.5) from levels captured before and after the pipeline ran. */
export async function impactOf(
  db: Db,
  affected: readonly { id: string; code: string }[],
  before: ReadonlyMap<string, RiskLevel | null>,
): Promise<CreateDisruptionResponse['impact']> {
  const ids = [...before.keys()];
  const after = await db.shipment.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, riskLevel: true }, orderBy: { code: 'asc' } });
  const levelChanges = after.filter((s) => (before.get(s.id) ?? null) !== s.riskLevel).map((s) => ({ shipmentId: s.id, code: s.code, from: before.get(s.id) ?? null, to: s.riskLevel }));
  const affectedIds = new Set(affected.map((a) => a.id));
  const nowAtRiskCount = after.filter((s) => affectedIds.has(s.id) && (s.riskLevel === 'AT_RISK' || s.riskLevel === 'LATE')).length;
  const counts = new Map<RiskLevel, number>();
  for (const c of levelChanges) if (c.to) counts.set(c.to, (counts.get(c.to) ?? 0) + 1);
  const parts = [`${affected.length} shipment${affected.length === 1 ? '' : 's'} affected`, `${nowAtRiskCount} at risk`, ...[...counts.entries()].map(([lvl, n]) => `${n} now ${LEVEL_WORD[lvl]}`)];
  return { affectedShipmentIds: affected.map((a) => a.id), affectedCount: affected.length, levelChanges, nowAtRiskCount, summary: parts.join(' · ') };
}

async function liveLevels(db: Db): Promise<Map<string, RiskLevel | null>> {
  const rows = await db.shipment.findMany({ where: { isHistorical: false, currentMilestone: { not: 'DELIVERED' } }, select: { id: true, riskLevel: true } });
  return new Map(rows.map((r) => [r.id, r.riskLevel]));
}

/** Creates the disruption at the action minute (API §5.5). Returns its id, affected shipments and the levels before. */
export async function createDisruption(tx: Prisma.TransactionClient, actionS: number, req: CreateDisruptionRequest, actor: Actor) {
  const segments = await segmentIndex(tx);
  let shipmentId: string | null = null;
  if (req.kind === 'WEATHER_SLOWDOWN' || req.kind === 'ROAD_CLOSURE') {
    const unknown = req.segmentCodes.filter((c) => !segments.has(c));
    if (unknown.length > 0) throw new ValidationError(unknown.map((c) => ({ path: 'segmentCodes', message: `Unknown segment code ${c}` })));
  }
  if (req.kind === 'TRUCK_BREAKDOWN') {
    const s = await tx.shipment.findUnique({ where: { id: req.shipmentId }, select: { id: true, code: true, isHistorical: true, currentMilestone: true, physicalArrivalAt: true } });
    if (!s || s.isHistorical) throw notFound();
    if (s.currentMilestone !== 'IN_TRANSIT' || s.physicalArrivalAt !== null) throw new DomainError('INVALID_TRANSITION', `${s.code} is not on the road.`);
    shipmentId = s.id;
  }
  const minutes = req.kind === 'TRUCK_BREAKDOWN' ? req.repairMinutes : req.durationMinutes;
  const segmentCodes = req.kind === 'WEATHER_SLOWDOWN' || req.kind === 'ROAD_CLOSURE' ? [...new Set(req.segmentCodes)] : [];
  const names = segmentCodes.map((c) => segments.get(c)?.name ?? c).join(', ');
  const defaultLabel: Record<DisruptionKind, string> = {
    WEATHER_SLOWDOWN: `Heavy rain on ${names}`,
    ROAD_CLOSURE: `Road closure on ${names}`,
    GATE_CONGESTION: 'Gate congestion at Plant X',
    TRUCK_BREAKDOWN: 'Truck breakdown',
  };
  const n = await tx.disruption.count({ where: { startsAt: fromS(actionS), origin: 'SIMULATOR' } });
  const id = `dis_${actionS}_${n + 1}`;
  const before = await liveLevels(tx);
  const { party, reason } = KIND_PARTY[req.kind];
  await tx.disruption.create({
    data: {
      id,
      kind: req.kind,
      origin: 'SIMULATOR',
      label: req.label?.trim() || defaultLabel[req.kind],
      segmentCodes,
      shipmentId,
      slowdownPct: req.kind === 'WEATHER_SLOWDOWN' ? req.slowdownPct : null,
      extraMinutesPerTruck: req.kind === 'GATE_CONGESTION' ? req.extraMinutesPerTruck : null,
      stopMinutes: req.kind === 'TRUCK_BREAKDOWN' ? req.repairMinutes : null,
      party,
      reasonCode: reason,
      startsAt: fromS(actionS),
      endsAt: fromS(actionS + minutes * 60),
      createdByUserId: actor.userId,
    },
  });
  const affected = await affectedShipments(tx, { kind: req.kind, segmentCodes, shipmentId });
  for (const s of affected) {
    await tx.shipmentEvent.create({ data: { id: `sev_${id}_${s.id}_STARTED`, shipmentId: s.id, type: 'DISRUPTION_STARTED', simTime: fromS(actionS), source: 'COORDINATOR', actorUserId: actor.userId, data: { disruptionId: id, kind: req.kind } } });
  }
  await writeAudit(tx, { actorUserId: actor.userId, actorRole: actor.role, action: 'disruption.create', entityType: 'Disruption', entityId: id, data: { kind: req.kind, label: req.label?.trim() || defaultLabel[req.kind], segmentCodes, ...(shipmentId ? { shipmentId } : {}), minutes, affected: affected.length } });
  return { id, affected, before };
}

/** Ends an active disruption early (API §5.6) at the action minute. */
export async function endDisruption(tx: Prisma.TransactionClient, actionS: number, disruptionId: string, actor: Actor) {
  const d = await tx.disruption.findUnique({ where: { id: disruptionId }, select: { ...DISRUPTION_SELECT } });
  if (!d) throw notFound();
  if (d.endedEarlyAt !== null || toS(d.endsAt) <= actionS) throw new DomainError('ALREADY_DONE', 'This disruption has already ended.');
  if (toS(d.startsAt) > actionS) throw new DomainError('INVALID_TRANSITION', 'This disruption has not started yet.');
  const before = await liveLevels(tx);
  const affected = await affectedShipments(tx, { kind: d.kind, segmentCodes: d.segmentCodes, shipmentId: d.shipmentId });
  await tx.disruption.update({ where: { id: d.id }, data: { endedEarlyAt: fromS(actionS) } });
  for (const s of affected) {
    await tx.shipmentEvent.create({ data: { id: `sev_${d.id}_${s.id}_ENDED`, shipmentId: s.id, type: 'DISRUPTION_ENDED', simTime: fromS(actionS), source: 'COORDINATOR', actorUserId: actor.userId, data: { disruptionId: d.id } } });
  }
  await writeAudit(tx, { actorUserId: actor.userId, actorRole: actor.role, action: 'disruption.end', entityType: 'Disruption', entityId: d.id, data: { kind: d.kind, label: d.label, affected: affected.length } });
  return { id: d.id, affected, before };
}

export async function getDisruptionDto(db: Db, id: string, nowS: number): Promise<DisruptionDto> {
  return toDisruptionDto(await db.disruption.findUniqueOrThrow({ where: { id }, select: DISRUPTION_SELECT }), nowS);
}
