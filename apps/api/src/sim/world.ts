import type { EventSource, FactorCode, Milestone, Party, ReasonCode } from '@routepulse/shared';
import { ENGINE_CONFIG } from '../config/engine.js';
import type { PrismaClient } from '../db/prisma.js';
import { derivePaces } from '../engines/pace.js';
import { toSimRoute, type SimRoute } from '../engines/simRoute.js';
import {
  DEFAULT_SIM_CONFIG,
  loadingEndFor,
  parseLedgerKey,
  type Ledger,
  type SimConfig,
  type SimDisruption,
  type SimEvent,
  type SimShipment,
  type StopCause,
} from '../engines/simulate.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isSegmentArray } from '../guards/geo.js';

/** Prisma client or interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export const SIM_CONFIG: SimConfig = DEFAULT_SIM_CONFIG(ENGINE_CONFIG.stepMinutes, ENGINE_CONFIG.loadingMinutes, ENGINE_CONFIG.loadingBays);

export const toS = (d: Date): number => Math.floor(d.getTime() / 1000);
export const fromS = (s: number): Date => new Date(s * 1000);
const optS = (d: Date | null): number | null => (d ? toS(d) : null);
const optDate = (s: number | null): Date | null => (s === null ? null : fromS(s));

/** Static per seed: routes and history-derived paces. Rebuilt after every reset. */
export interface StaticWorld {
  routes: Map<string, SimRoute>;
  pace: ReturnType<typeof derivePaces>;
}

export async function loadStaticWorld(db: Db): Promise<StaticWorld> {
  const routeRows = await db.route.findMany({ select: { id: true, segments: true } });
  const routes = new Map<string, SimRoute>();
  for (const r of routeRows) {
    if (!isSegmentArray(r.segments)) throw new Error(`route ${r.id} has invalid segments`);
    routes.set(r.id, toSimRoute(r.id, r.segments));
  }
  const history = await db.shipment.findMany({
    where: { isHistorical: true, arrivedAt: { not: null } },
    select: {
      transporterId: true,
      laneId: true,
      route: { select: { baselineMinutes: true } },
      attributions: { where: { party: 'TRANSPORTER', kind: 'TIME_LOST' }, select: { delaySeconds: true } },
    },
  });
  const pace = derivePaces(
    history.map((h) => ({
      transporterId: h.transporterId,
      laneId: h.laneId,
      transporterSeconds: h.attributions.reduce((a, x) => a + x.delaySeconds, 0),
      baselineSeconds: h.route.baselineMinutes * 60,
    })),
  );
  return { routes, pace };
}

const LIVE_SELECT = {
  id: true,
  code: true,
  autopilot: true,
  currentMilestone: true,
  truckId: true,
  routeId: true,
  laneId: true,
  transporterId: true,
  plannedGateAt: true,
  plannedDepartureAt: true,
  promisedBy: true,
  receivingWindowOverrideEndAt: true,
  progressM: true,
  progressCarryMm: true,
  stoppedUntil: true,
  gateQueuedAt: true,
  loadingStartedAt: true,
  gateOutAt: true,
  physicalArrivalAt: true,
  arrivedAt: true,
  deliveredAt: true,
  delayMinutes: true,
  onTime: true,
  lastUpdateAt: true,
  pingIntervalMinutes: true,
  silentFrom: true,
  order: { select: { customer: { select: { receivingOpenMin: true, receivingCloseMin: true, unloadingMinutes: true } } } },
  // LIVE and FINAL rows: after ARRIVED the rows are FINAL but the shipment is still shown until delivery.
  attributions: { select: { sourceKey: true, party: true, kind: true, delaySeconds: true } },
  reports: { select: { id: true, party: true, simTime: true, appliedMinutes: true, reason: true, status: true } },
} as const;

/**
 * Disruptions that can still matter after `afterS`. "Earliest created" for the L5 tie-break uses
 * the simulation start time (then id), never the wall-clock createdAt, so results are reproducible.
 */
/**
 * The cause of a `stoppedUntil` hold: the driver report whose stop ends exactly at stoppedUntil
 * (stoppedUntil = the latest end of the holding reports, L5); tie → earliest report, then id.
 * Null when not stopped.
 */
export function stopCauseOf(
  stoppedUntil: Date | null,
  reports: readonly { id: string; party: Party; simTime: Date; appliedMinutes: number }[],
): StopCause | null {
  if (!stoppedUntil) return null;
  const end = toS(stoppedUntil);
  const match = reports
    .filter((x) => toS(x.simTime) + x.appliedMinutes * 60 === end)
    .sort((a, b) => a.simTime.getTime() - b.simTime.getTime() || (a.id < b.id ? -1 : 1))[0];
  return match ? { sourceKey: `RPT:${match.id}`, party: match.party, createdS: toS(match.simTime) } : null;
}

export async function loadDisruptions(db: Db, afterS: number): Promise<SimDisruption[]> {
  const rows = await db.disruption.findMany({ orderBy: { id: 'asc' } });
  return rows
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      segmentCodes: d.segmentCodes,
      shipmentId: d.shipmentId,
      slowdownPct: d.slowdownPct,
      extraMinutesPerTruck: d.extraMinutesPerTruck,
      startS: toS(d.startsAt),
      endS: toS(d.endedEarlyAt ?? d.endsAt),
      party: d.party,
      reason: d.reasonCode,
      createdS: toS(d.startsAt),
      label: d.label,
    }))
    .filter((d) => d.endS > afterS);
}

/** Live (not delivered, not historical) shipments as engine state. */
export async function loadLiveShipments(db: Db, world: StaticWorld, disruptions: readonly SimDisruption[]): Promise<SimShipment[]> {
  const rows = await db.shipment.findMany({
    where: { isHistorical: false, currentMilestone: { not: 'DELIVERED' } },
    select: LIVE_SELECT,
    orderBy: { code: 'asc' },
  });
  return rows.map((r) => {
    const loadingStartedS = optS(r.loadingStartedAt);
    const ledger: Ledger = {};
    const planChangeByParty: Partial<Record<Party, number>> = {};
    for (const a of r.attributions) {
      if (a.kind === 'TIME_LOST') ledger[`${a.sourceKey}|${a.party}`] = a.delaySeconds;
      else if (a.kind === 'PLAN_CHANGE') planChangeByParty[a.party] = (planChangeByParty[a.party] ?? 0) + a.delaySeconds;
    }
    const stopCause = stopCauseOf(r.stoppedUntil, r.reports);
    const physicalS = optS(r.physicalArrivalAt);
    // Confirmed "waiting to unload" reports made at the customer extend deliveredAt only (spec §5.8, L1).
    const extraUnloadMin = r.reports
      .filter((x) => x.reason === 'UNLOADING_WAIT' && x.status === 'CONFIRMED' && physicalS !== null && toS(x.simTime) >= physicalS)
      .reduce((a, x) => a + x.appliedMinutes, 0);
    return {
      id: r.id,
      code: r.code,
      autopilot: r.autopilot,
      milestone: r.currentMilestone,
      truckId: r.truckId,
      routeId: r.routeId,
      plannedGateS: toS(r.plannedGateAt),
      plannedDepS: toS(r.plannedDepartureAt),
      promisedByS: toS(r.promisedBy),
      overrideEndS: optS(r.receivingWindowOverrideEndAt),
      hours: { openMin: r.order.customer.receivingOpenMin, closeMin: r.order.customer.receivingCloseMin },
      unloadingMin: r.order.customer.unloadingMinutes,
      extraUnloadMin,
      pace: world.pace(r.transporterId, r.laneId),
      progressMm: r.progressM * 1000 + r.progressCarryMm,
      stoppedUntilS: optS(r.stoppedUntil),
      gateQueuedS: optS(r.gateQueuedAt),
      loadingStartedS,
      loadingEndS: loadingStartedS === null ? null : loadingEndFor(loadingStartedS, disruptions, SIM_CONFIG),
      gateOutS: optS(r.gateOutAt),
      physicalArrivalS: optS(r.physicalArrivalAt),
      arrivedS: optS(r.arrivedAt),
      deliveredS: optS(r.deliveredAt),
      delayMinutes: r.delayMinutes,
      onTime: r.onTime,
      lastUpdateS: optS(r.lastUpdateAt),
      pingIntervalMin: r.pingIntervalMinutes,
      silentFromS: optS(r.silentFrom),
      stopCause,
      ledger,
      planChangeByParty,
    };
  });
}

const FACTOR_OF_KEY = (sourceKey: string): FactorCode =>
  sourceKey.startsWith('DISR:') ? 'DISR' : sourceKey.startsWith('RPT:') ? 'RPT' : (sourceKey as FactorCode);

/**
 * Upserts the changed ledger rows (DelayAttribution, kind TIME_LOST, status LIVE). Row ids are
 * deterministic so the database digest is identical across identical runs.
 */
export async function persistLedger(
  db: Db,
  before: readonly SimShipment[],
  after: readonly SimShipment[],
  disruptions: readonly SimDisruption[],
  atS: number,
): Promise<number> {
  const prev = new Map(before.map((s) => [s.id, s.ledger]));
  const disr = new Map(disruptions.map((d) => [d.id, d]));
  let changed = 0;
  for (const s of after) {
    const old = prev.get(s.id) ?? {};
    for (const key of Object.keys(s.ledger).sort()) {
      const sec = s.ledger[key] ?? 0;
      if (sec === (old[key] ?? 0)) continue;
      const { sourceKey, party } = parseLedgerKey(key);
      const factor = FACTOR_OF_KEY(sourceKey);
      let reason: ReasonCode | null = null;
      let disruptionId: string | null = null;
      let driverReportId: string | null = null;
      if (factor === 'GATE') reason = 'PLANT_GATE_WAIT';
      else if (factor === 'HIST') reason = 'TRANSPORTER_PACE';
      else if (factor === 'WIN') reason = 'RECEIVING_WINDOW';
      else if (factor === 'DISR') {
        disruptionId = sourceKey.slice(5);
        reason = disr.get(disruptionId)?.reason ?? (await db.disruption.findUniqueOrThrow({ where: { id: disruptionId }, select: { reasonCode: true } })).reasonCode;
      } else if (factor === 'RPT') {
        driverReportId = sourceKey.slice(4);
        reason = (await db.driverReport.findUniqueOrThrow({ where: { id: driverReportId }, select: { reason: true } })).reason;
      }
      await db.delayAttribution.upsert({
        where: { shipmentId_sourceKey_party: { shipmentId: s.id, sourceKey, party } },
        create: {
          id: `da_${s.id}_${sourceKey}_${party}`,
          shipmentId: s.id,
          sourceKey,
          kind: 'TIME_LOST',
          factor,
          reason,
          party,
          delaySeconds: sec,
          disruptionId,
          driverReportId,
          updatedAtSim: fromS(atS),
        },
        update: { delaySeconds: sec, updatedAtSim: fromS(atS) },
      });
      changed += 1;
    }
  }
  return changed;
}

/** Writes only the fields the engine changed. Returns the number of shipments updated. */
export async function persistShipments(db: Db, before: readonly SimShipment[], after: readonly SimShipment[]): Promise<number> {
  const prev = new Map(before.map((s) => [s.id, s]));
  let updated = 0;
  for (const s of after) {
    const p = prev.get(s.id);
    if (!p) continue;
    const data: Prisma.ShipmentUpdateInput = {};
    if (s.milestone !== p.milestone) data.currentMilestone = s.milestone;
    if (s.progressMm !== p.progressMm) {
      data.progressM = Math.floor(s.progressMm / 1000);
      data.progressCarryMm = s.progressMm % 1000;
    }
    const dates: [keyof SimShipment, keyof Prisma.ShipmentUpdateInput][] = [
      ['gateQueuedS', 'gateQueuedAt'],
      ['loadingStartedS', 'loadingStartedAt'],
      ['gateOutS', 'gateOutAt'],
      ['physicalArrivalS', 'physicalArrivalAt'],
      ['arrivedS', 'arrivedAt'],
      ['deliveredS', 'deliveredAt'],
      ['lastUpdateS', 'lastUpdateAt'],
      ['stoppedUntilS', 'stoppedUntil'],
    ];
    for (const [k, col] of dates) {
      if (s[k] !== p[k]) (data as Record<string, unknown>)[col] = optDate(s[k] as number | null);
    }
    if (s.delayMinutes !== p.delayMinutes) data.delayMinutes = s.delayMinutes;
    if (s.onTime !== p.onTime) data.onTime = s.onTime;
    if (Object.keys(data).length > 0) {
      await db.shipment.update({ where: { id: s.id }, data });
      updated += 1;
    }
  }
  return updated;
}

/** Deterministic event id: one milestone (or physical arrival) per shipment. */
export const simEventId = (shipmentId: string, e: Pick<SimEvent, 'type'> & { milestone?: Milestone }) =>
  `sev_${shipmentId}_${e.type === 'MILESTONE' ? e.milestone : 'PHYSICAL_ARRIVAL'}`;

export async function persistEvents(
  db: Db,
  events: readonly SimEvent[],
  source: EventSource,
  actorUserId: string | null = null,
  data: Prisma.InputJsonValue = {},
): Promise<void> {
  if (events.length === 0) return;
  await db.shipmentEvent.createMany({
    data: events.map((e) => ({
      id: simEventId(e.shipmentId, e),
      shipmentId: e.shipmentId,
      type: e.type,
      milestone: e.type === 'MILESTONE' ? e.milestone : null,
      simTime: fromS(e.atS),
      source,
      actorUserId,
      data,
    })),
  });
}

/** A delivered shipment's truck becomes available at the customer's site. */
export async function releaseTrucks(db: Db, deliveredShipmentIds: readonly string[]): Promise<void> {
  for (const id of deliveredShipmentIds) {
    const s = await db.shipment.findUnique({
      where: { id },
      select: { truckId: true, order: { select: { customer: { select: { name: true, city: true, lat: true, lng: true } } } } },
    });
    if (!s?.truckId) continue;
    const c = s.order.customer;
    await db.truck.update({
      where: { id: s.truckId },
      data: { status: 'AVAILABLE', locationLabel: `${c.name}, ${c.city}`, lat: c.lat, lng: c.lng },
    });
  }
}
