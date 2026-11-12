import type { SnapshotTrigger } from '@routepulse/shared';
import { explainEta, projectWorld, type DisruptionInfo, type EtaResult, type ReportInfo } from '../engines/eta.js';
import type { SimDisruption, SimShipment } from '../engines/simulate.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isFactorArray } from '../guards/factors.js';
import { evaluateAlerts } from './alertService.js';
import { refreshOptionSets } from './recoveryService.js';
import { SIM_CONFIG, fromS, loadDisruptions, loadLiveShipments, toS, type Db, type StaticWorld } from '../sim/world.js';

/**
 * ETA service: the ETA/risk step of the ONE recalculation pipeline (architecture §6.3).
 * Called by simulationService inside the same transaction as every settle and every action, so
 * an ETA is never written without the state it was computed from.
 */

/** OVERRIDE (attribution override) is stored on snapshots as REVIEW — the schema's closest trigger. */
export type RecalcTrigger = 'STEP' | 'MILESTONE' | 'RESET' | 'SEED' | 'DISRUPTION' | 'REPORT' | 'REVIEW' | 'OVERRIDE' | 'RECOVERY';

export interface RecalcContext {
  simTimeS: number;
  trigger: RecalcTrigger;
  world: StaticWorld;
  /** Shipments that had a milestone/arrival event in this transaction (snapshot rule: "milestone occurred"). */
  eventShipmentIds?: readonly string[];
  /** Shipments the action was about (snapshot rule: "an action occurred"). */
  actionShipmentIds?: readonly string[];
}

const SNAPSHOT_EVERY_S = 30 * 60;
const SNAPSHOT_ETA_MOVE_MIN = 5;

/** Everything the ETA engine needs at one simulation time (read-only). */
export interface EtaContext {
  nowS: number;
  world: StaticWorld;
  disruptions: SimDisruption[];
  live: SimShipment[];
  plannedArrival: Map<string, number>;
  disruptionInfo: Map<string, DisruptionInfo>;
  reportInfo: Map<string, ReportInfo>;
  pending: Map<string, number>;
}

export async function loadEtaContext(db: Db, world: StaticWorld, simTimeS: number): Promise<EtaContext> {
  const disruptions = await loadDisruptions(db, simTimeS);
  const live = await loadLiveShipments(db, world, disruptions);
  const ids = live.map((s) => s.id);
  const [plans, allDisruptions, reports] = await Promise.all([
    db.shipment.findMany({ where: { id: { in: ids } }, select: { id: true, plannedArrivalAt: true } }),
    db.disruption.findMany({ select: { id: true, kind: true, label: true, party: true, reasonCode: true, segmentCodes: true, slowdownPct: true, startsAt: true, endsAt: true, endedEarlyAt: true } }),
    db.driverReport.findMany({ where: { shipmentId: { in: ids } }, select: { id: true, shipmentId: true, reason: true, party: true, status: true } }),
  ]);
  const disruptionInfo = new Map<string, DisruptionInfo>(
    allDisruptions.map((d) => [
      d.id,
      { id: d.id, kind: d.kind, label: d.label, party: d.party, reason: d.reasonCode, segmentCodes: d.segmentCodes, slowdownPct: d.slowdownPct, startS: toS(d.startsAt), endS: toS(d.endedEarlyAt ?? d.endsAt) },
    ]),
  );
  const pending = new Map<string, number>();
  for (const r of reports) if (r.status === 'PENDING_REVIEW') pending.set(r.shipmentId, (pending.get(r.shipmentId) ?? 0) + 1);
  return {
    nowS: simTimeS,
    world,
    disruptions,
    live,
    plannedArrival: new Map(plans.map((p) => [p.id, toS(p.plannedArrivalAt)])),
    disruptionInfo,
    reportInfo: new Map<string, ReportInfo>(reports.map((r) => [r.id, { id: r.id, reason: r.reason, party: r.party, status: r.status }])),
    pending,
  };
}

/**
 * ETA explanations for `ids` in a (possibly modified) copy of the world: the ONE projection path,
 * used by the pipeline and by recovery options (architecture §10.7: options are projectEta on a
 * modified copy of the context). `extra` adds planned arrivals for shipments not in the database yet
 * (a SPLIT child). Shipments that cannot be projected (no truck) are absent.
 */
export function explainIn(
  ctx: EtaContext,
  ships: readonly SimShipment[],
  ids: readonly string[],
  opts: { disruptions?: readonly SimDisruption[]; plannedArrival?: ReadonlyMap<string, number> } = {},
): Map<string, EtaResult> {
  const disruptions = opts.disruptions ?? ctx.disruptions;
  const projected = projectWorld({ shipments: ships, routes: ctx.world.routes, disruptions, config: SIM_CONFIG, nowS: ctx.nowS });
  const out = new Map<string, EtaResult>();
  for (const id of ids) {
    const sh = ships.find((x) => x.id === id);
    if (!sh) continue;
    const end = sh.arrivedS !== null ? sh : projected.get(sh.id);
    const route = ctx.world.routes.get(sh.routeId);
    const planned = opts.plannedArrival?.get(sh.id) ?? ctx.plannedArrival.get(sh.id);
    if (!end || !route || planned === undefined) continue;
    out.set(
      sh.id,
      explainEta({ now: sh, projected: end, route, plannedArrivalS: planned, nowS: ctx.nowS, pendingReports: ctx.pending.get(sh.id) ?? 0, disruptions: ctx.disruptionInfo, reports: ctx.reportInfo }),
    );
  }
  return out;
}

/** Computes the ETA explanation of every live shipment at simTimeS. Read-only. */
export async function computeEtas(db: Db, world: StaticWorld, simTimeS: number): Promise<Map<string, EtaResult>> {
  const ctx = await loadEtaContext(db, world, simTimeS);
  return explainIn(ctx, ctx.live, ctx.live.map((s) => s.id));
}

const TRIGGER_FOR_SNAPSHOT: Record<RecalcTrigger, SnapshotTrigger> = {
  STEP: 'STEP',
  MILESTONE: 'MILESTONE',
  RESET: 'STEP',
  SEED: 'SEED',
  DISRUPTION: 'DISRUPTION',
  REPORT: 'REPORT',
  REVIEW: 'REVIEW',
  OVERRIDE: 'REVIEW',
  RECOVERY: 'RECOVERY',
};

/**
 * The pipeline step: recalculate every live shipment, update the cached Shipment fields and store
 * RiskSnapshots per the snapshot rule (architecture §9.5):
 *   level changed · ETA moved ≥ 5 min since the last snapshot · an action or milestone occurred ·
 *   30 simulated minutes since the last snapshot · or no snapshot yet.
 * Never overwrites a snapshot; skips a snapshot identical to one already stored at the same time.
 * Returns true when something material changed (worldVersion must be bumped).
 */
export async function recalculate(tx: Prisma.TransactionClient, ctx: RecalcContext): Promise<boolean> {
  const etaCtx = await loadEtaContext(tx, ctx.world, ctx.simTimeS);
  const results = explainIn(etaCtx, etaCtx.live, etaCtx.live.map((s) => s.id));
  if (results.size === 0) return false;
  const touched = new Set<string>([...(ctx.actionShipmentIds ?? []), ...(ctx.eventShipmentIds ?? [])]);
  const ids = [...results.keys()];
  const [cached, lastSnaps] = await Promise.all([
    tx.shipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, routeId: true, progressM: true, etaAt: true, etaLowAt: true, etaHighAt: true, slackMinutes: true, riskLevel: true, riskScore: true, confidence: true },
    }),
    tx.riskSnapshot.findMany({
      where: { shipmentId: { in: ids } },
      distinct: ['shipmentId'],
      orderBy: [{ shipmentId: 'asc' }, { simTime: 'desc' }, { id: 'desc' }],
      select: { id: true, shipmentId: true, simTime: true, level: true, predictedArrivalAt: true, etaLowAt: true, etaHighAt: true, confidence: true, slackMinutes: true, factors: true },
    }),
  ]);
  const cache = new Map(cached.map((c) => [c.id, c]));
  const last = new Map(lastSnaps.map((s) => [s.shipmentId, s]));
  const events = new Set(ctx.eventShipmentIds ?? []);
  const actions = new Set(ctx.actionShipmentIds ?? []);
  let material = false;

  for (const id of ids.sort()) {
    const r = results.get(id) as EtaResult;
    const c = cache.get(id);
    if (!c) continue;
    if (!isFactorArray(r.factors)) throw new Error(`invalid factors for ${id}`);
    const eta = fromS(r.predictedArrivalS);
    const changed =
      c.etaAt?.getTime() !== eta.getTime() || c.riskLevel !== r.level || c.confidence !== r.confidence;
    const changedAny =
      changed ||
      c.etaLowAt?.getTime() !== r.etaLowS * 1000 ||
      c.etaHighAt?.getTime() !== r.etaHighS * 1000 ||
      c.slackMinutes !== r.slackMinutes ||
      c.riskScore !== r.score;
    if (changedAny) {
      await tx.shipment.update({
        where: { id },
        data: { etaAt: eta, etaLowAt: fromS(r.etaLowS), etaHighAt: fromS(r.etaHighS), slackMinutes: r.slackMinutes, riskLevel: r.level, riskScore: r.score, confidence: r.confidence },
      });
    }
    if (changed) material = true;
    if (changedAny) touched.add(id);

    // Snapshot rule.
    const prev = last.get(id);
    const factorsJson = JSON.stringify(r.factors);
    const forcedByAction = actions.has(id) || events.has(id) || (ctx.trigger === 'DISRUPTION' && changedAny) || ctx.trigger === 'SEED';
    const due =
      !prev ||
      prev.level !== r.level ||
      Math.abs(prev.predictedArrivalAt.getTime() - eta.getTime()) >= SNAPSHOT_ETA_MOVE_MIN * 60_000 ||
      forcedByAction ||
      ctx.simTimeS - toS(prev.simTime) >= SNAPSHOT_EVERY_S;
    if (!due) continue;
    const sameTime = prev !== undefined && toS(prev.simTime) === ctx.simTimeS;
    if (
      sameTime &&
      prev.level === r.level &&
      prev.predictedArrivalAt.getTime() === eta.getTime() &&
      prev.etaLowAt.getTime() === r.etaLowS * 1000 &&
      prev.etaHighAt.getTime() === r.etaHighS * 1000 &&
      prev.confidence === r.confidence &&
      prev.slackMinutes === r.slackMinutes &&
      JSON.stringify(prev.factors) === factorsJson
    ) {
      continue; // identical to the snapshot already stored at this minute: no duplicate
    }
    let snapId = `rs_${id}_${ctx.simTimeS}`;
    if (sameTime) snapId = `${snapId}_${(await tx.riskSnapshot.count({ where: { shipmentId: id, simTime: fromS(ctx.simTimeS) } })) + 1}`;
    const trigger: SnapshotTrigger = events.has(id) && ctx.trigger === 'STEP' ? 'MILESTONE' : TRIGGER_FOR_SNAPSHOT[ctx.trigger];
    await tx.riskSnapshot.create({
      data: {
        id: snapId,
        shipmentId: id,
        routeId: c.routeId,
        simTime: fromS(ctx.simTimeS),
        trigger,
        ruleVersion: r.ruleVersion,
        plannedArrivalAt: fromS(r.plannedArrivalS),
        predictedArrivalAt: eta,
        etaLowAt: fromS(r.etaLowS),
        etaHighAt: fromS(r.etaHighS),
        slackMinutes: r.slackMinutes,
        level: r.level,
        score: r.score,
        confidence: r.confidence,
        progressKm: (c.progressM / 1000).toFixed(2),
        factors: JSON.parse(factorsJson) as Prisma.InputJsonValue,
      },
    });
    material = true;
  }
  // Recovery options (ES → RS) before alerts, so a newly opened alert can name the Suggested option.
  if (await refreshOptionSets(tx, etaCtx, results, touched)) material = true;
  // Alerts and notifications from the same authoritative results (architecture §6.3: ES → AS).
  if (await evaluateAlerts(tx, ctx.simTimeS, results)) material = true;
  return material;
}
