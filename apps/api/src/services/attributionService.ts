import type { AttributionResponse, AttributionRowDto, Party, ReasonCode } from '@routepulse/shared';
import {
  BUT_FOR_RULE_TEXT,
  countsAgainstTransporter,
  gapSeconds,
  onTimeByTransporter,
  rowMinutes,
  totalsByParty,
} from '../engines/attribution.js';
import { DomainError, notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { fromS, toS, type Db } from '../sim/world.js';
import { writeAudit } from './auditService.js';
import type { Actor } from './simulationService.js';

/**
 * Attribution service: the lifecycle of the ONE delay ledger (DelayAttribution) after settlement
 * has booked it (architecture §10.4–10.5, engine doc §4.5). Never books time itself.
 */

const REASON_LABEL: Record<ReasonCode, string> = {
  BREAKDOWN: 'breakdown',
  PLANT_GATE_WAIT: 'waiting at plant gate',
  TRAFFIC: 'traffic jam',
  ROAD_CLOSED: 'road closed',
  HEAVY_RAIN: 'heavy rain',
  DOCUMENTS: 'documents / checkpost',
  UNLOADING_WAIT: 'waiting to unload',
  OTHER: 'other',
  TRANSPORTER_PACE: 'transporter pace',
  RECEIVING_WINDOW: 'receiving window',
};

/**
 * Finalises a shipment's ledger at ARRIVED (L1, L6): every row becomes FINAL and a GAP row
 * (UNATTRIBUTED) records any unexplained remainder of arrivedAt − plannedArrivalAt. `arrivedAt` is
 * the eligible check-in time of the PHYSICAL arrival — never the time a driver tapped ARRIVED — and
 * the ledger stopped accruing at that moment. Idempotent: a second call changes nothing.
 */
export async function finalizeArrival(tx: Prisma.TransactionClient, shipmentId: string): Promise<{ gapSeconds: number } | null> {
  const sh = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, select: { arrivedAt: true, plannedArrivalAt: true } });
  if (!sh.arrivedAt) throw new Error(`cannot finalise ${shipmentId} before arrival`);
  const live = await tx.delayAttribution.count({ where: { shipmentId, status: 'LIVE' } });
  const hasGap = await tx.delayAttribution.count({ where: { shipmentId, kind: 'GAP' } });
  const anyFinal = await tx.delayAttribution.count({ where: { shipmentId, status: 'FINAL' } });
  if (live === 0 && (anyFinal > 0 || hasGap > 0)) return null; // already finalised
  const rows = await tx.delayAttribution.findMany({ where: { shipmentId, kind: { in: ['TIME_LOST', 'PLAN_CHANGE'] } }, select: { delaySeconds: true } });
  const gap = gapSeconds(toS(sh.arrivedAt), toS(sh.plannedArrivalAt), rows.reduce((a, r) => a + r.delaySeconds, 0));
  await tx.delayAttribution.updateMany({ where: { shipmentId, status: 'LIVE' }, data: { status: 'FINAL', updatedAtSim: sh.arrivedAt } });
  if (gap > 0) {
    await tx.delayAttribution.create({
      data: {
        id: `da_${shipmentId}_GAP_UNATTRIBUTED`,
        shipmentId,
        sourceKey: 'GAP',
        kind: 'GAP',
        factor: null,
        reason: null,
        party: 'UNATTRIBUTED',
        delaySeconds: gap,
        status: 'FINAL',
        updatedAtSim: sh.arrivedAt,
      },
    });
  }
  return { gapSeconds: gap };
}

const ROW_SELECT = {
  id: true,
  sourceKey: true,
  factor: true,
  reason: true,
  kind: true,
  party: true,
  delaySeconds: true,
  status: true,
  originalParty: true,
  overrideNote: true,
  overriddenAt: true,
  overriddenByUserId: true,
  disruption: { select: { label: true } },
  driverReport: { select: { reason: true } },
} as const;

const KIND_ORDER = { TIME_LOST: 0, PLAN_CHANGE: 1, GAP: 2 } as const;
const FACTOR_ORDER = { GATE: 0, HIST: 1, DISR: 2, RPT: 3, WIN: 4 } as const;

/** AttributionResponse for one shipment (API §12.1). Coordinator-only; scoping is done by the caller. */
export async function getAttribution(db: Db, shipmentId: string): Promise<AttributionResponse> {
  const sh = await db.shipment.findUnique({ where: { id: shipmentId }, select: { id: true, arrivedAt: true, delayMinutes: true } });
  if (!sh) throw notFound();
  const rows = await db.delayAttribution.findMany({ where: { shipmentId }, select: ROW_SELECT });
  rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.factor ? FACTOR_ORDER[a.factor] : 9) - (b.factor ? FACTOR_ORDER[b.factor] : 9) ||
      (a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0) ||
      (a.party < b.party ? -1 : a.party > b.party ? 1 : 0),
  );
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: rows.map((r) => r.overriddenByUserId).filter((x): x is string => x !== null) } }, select: { id: true, name: true } })).map((u) => [u.id, u]),
  );
  const minutes = rowMinutes(rows.map((r) => r.delaySeconds));
  const dtos: AttributionRowDto[] = rows.map((r, i) => ({
    id: r.id,
    sourceKey: r.sourceKey,
    factor: r.factor,
    reason: r.reason,
    kind: r.kind,
    label: labelOf(r),
    party: r.party,
    minutes: minutes[i] ?? 0,
    status: r.status,
    originalParty: r.originalParty,
    overrideNote: r.overrideNote,
    overriddenBy: r.overriddenByUserId ? (users.get(r.overriddenByUserId) ?? null) : null,
    overriddenAt: r.overriddenAt ? r.overriddenAt.toISOString() : null,
  }));
  const arrived = sh.arrivedAt !== null;
  const byParty = totalsByParty(dtos);
  const transporterMinutes = dtos.filter((r) => r.party === 'TRANSPORTER' && r.kind !== 'GAP').reduce((a, r) => a + r.minutes, 0);
  return {
    shipmentId,
    status: arrived ? 'FINAL' : 'LIVE',
    delayMinutes: arrived ? (sh.delayMinutes ?? 0) : null,
    totalsByParty: byParty,
    rows: dtos,
    countsAgainstTransporter: arrived ? countsAgainstTransporter(sh.delayMinutes ?? 0, transporterMinutes) : null,
    ruleText: BUT_FOR_RULE_TEXT,
  };
}

function labelOf(r: { kind: string; factor: string | null; reason: ReasonCode | null; disruption: { label: string } | null; driverReport: { reason: ReasonCode } | null }): string {
  if (r.kind === 'GAP') return 'Unexplained delay (no recorded cause)';
  if (r.kind === 'PLAN_CHANGE') return 'Plan change (reroute)';
  switch (r.factor) {
    case 'GATE':
      return 'Plant gate wait and loading';
    case 'HIST':
      return 'Transporter pace (from delivered history)';
    case 'DISR':
      return r.disruption?.label ?? 'Disruption';
    case 'RPT':
      return `Driver report: ${REASON_LABEL[r.driverReport?.reason ?? r.reason ?? 'OTHER']}`;
    case 'WIN':
      return 'Waiting for the receiving window';
    default:
      return 'Delay';
  }
}

/**
 * Override (API §12.2, AC-F1.3): the whole row moves to another party with a note; the first
 * original party is kept; if a row with the same source and the target party exists, the seconds
 * merge into it. Runs inside simulationService.applyChange (one transaction, one pipeline).
 */
export async function overrideAttribution(
  tx: Prisma.TransactionClient,
  actionS: number,
  input: { shipmentId: string; attributionId: string; newParty: Party; note: string; actor: Actor },
): Promise<void> {
  const row = await tx.delayAttribution.findFirst({ where: { id: input.attributionId, shipmentId: input.shipmentId } });
  if (!row) throw notFound();
  if (row.party === input.newParty) throw new DomainError('ALREADY_DONE', 'This row is already attributed to that party.');
  const original = row.originalParty ?? row.party;
  const stamp = { overrideNote: input.note, overriddenByUserId: input.actor.userId, overriddenAt: fromS(actionS), updatedAtSim: fromS(actionS) };
  const target = await tx.delayAttribution.findUnique({
    where: { shipmentId_sourceKey_party: { shipmentId: row.shipmentId, sourceKey: row.sourceKey, party: input.newParty } },
  });
  let resultId = row.id;
  if (target) {
    await tx.delayAttribution.delete({ where: { id: row.id } });
    await tx.delayAttribution.update({
      where: { id: target.id },
      data: { delaySeconds: target.delaySeconds + row.delaySeconds, originalParty: target.originalParty ?? original, ...stamp },
    });
    resultId = target.id;
  } else {
    await tx.delayAttribution.update({ where: { id: row.id }, data: { party: input.newParty, originalParty: original, ...stamp } });
  }
  const n = await tx.shipmentEvent.count({ where: { shipmentId: row.shipmentId, type: 'ATTRIBUTION_OVERRIDDEN' } });
  const data = { attributionId: resultId, sourceKey: row.sourceKey, fromParty: row.party, toParty: input.newParty, seconds: row.delaySeconds, note: input.note };
  await tx.shipmentEvent.create({
    data: { id: `sev_${row.shipmentId}_OVERRIDE_${n + 1}`, shipmentId: row.shipmentId, type: 'ATTRIBUTION_OVERRIDDEN', simTime: fromS(actionS), source: 'COORDINATOR', actorUserId: input.actor.userId, data },
  });
  await writeAudit(tx, { actorUserId: input.actor.userId, actorRole: input.actor.role, action: 'attribution.override', entityType: 'DelayAttribution', entityId: resultId, data });
}

/**
 * Raw vs fair on-time per transporter over every arrived shipment (spec §5.10; Example 4), from the
 * persisted FINAL ledger and the stored arrival outcome. Analytics endpoint #36 reuses this later.
 */
export async function transporterOnTime(db: Db): Promise<{ transporterId: string; name: string; shipments: number; rawOnTimePct: number; fairOnTimePct: number }[]> {
  const shipments = await db.shipment.findMany({
    where: { arrivedAt: { not: null } },
    select: { id: true, transporterId: true, onTime: true, delayMinutes: true, attributions: { select: { party: true, kind: true, delaySeconds: true, id: true, sourceKey: true } } },
  });
  const outcomes = shipments.map((s) => {
    const rows = [...s.attributions].sort((a, b) => (a.id < b.id ? -1 : 1));
    const mins = rowMinutes(rows.map((r) => r.delaySeconds));
    const transporterMinutes = rows.reduce((a, r, i) => a + (r.party === 'TRANSPORTER' && r.kind !== 'GAP' ? (mins[i] ?? 0) : 0), 0);
    return { transporterId: s.transporterId, onTime: s.onTime === true, countsAgainstTransporter: countsAgainstTransporter(s.delayMinutes ?? 0, transporterMinutes) };
  });
  const names = new Map((await db.transporter.findMany({ select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const pct = (n: number, d: number) => Math.round((n / d) * 1000) / 10;
  return [...onTimeByTransporter(outcomes).entries()]
    .map(([transporterId, v]) => ({ transporterId, name: names.get(transporterId) ?? transporterId, shipments: v.shipments, rawOnTimePct: pct(v.rawOnTime, v.shipments), fairOnTimePct: pct(v.fairOnTime, v.shipments) }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}
