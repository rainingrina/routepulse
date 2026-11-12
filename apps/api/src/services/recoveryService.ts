import type { RecoveryKind, RiskLevel } from '@routepulse/shared';
import { ENGINE_CONFIG } from '../config/engine.js';
import { RECOVERY_CONFIG, SUGGESTION_RULE, YARD_ROAD_KM } from '../config/recovery.js';
import type { EtaResult } from '../engines/eta.js';
import { divergenceMm, nearestCandidate, newWindowEnd, remainingSegments, replacementCostInr, suggestedKind, travelMinutes, type OptionDraft, type TruckCandidate } from '../engines/recovery.js';
import { bindingHold, type SimShipment } from '../engines/simulate.js';
import { DomainError, notFound } from '../errors/domainError.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isOptionParams, type OptionParams } from '../guards/recovery.js';
import { fromS, type Db } from '../sim/world.js';
import { writeAudit } from './auditService.js';
import { explainIn, type EtaContext } from './etaService.js';
import type { Actor } from './simulationService.js';

/**
 * Recovery engine (engine doc §8, architecture §12, spec §5.6). Every option's ETA is the ONE
 * projection (etaService.explainIn) on a modified copy of the world; choosing applies the same
 * modification at the decision minute and the normal pipeline recalculates (RC-4).
 *
 * Decisions (2026-11-12, M8): replacement distance = documented yard road distance (Khopoli 20 km)
 * or the shipment's route distance for trucks at the plant; a recovery completes at arrival (no
 * cancel endpoint); option sets regenerate only when their inputs change; SPLIT uses the stated
 * defaults below.
 */

export const KIND_ORDER: readonly RecoveryKind[] = ['REPLACEMENT_TRUCK', 'REROUTE', 'SPLIT', 'NEW_WINDOW', 'NOTIFY_ONLY'];
const OPTION_LEVELS: readonly RiskLevel[] = ['WATCH', 'AT_RISK', 'LATE'];

export interface Evaluated extends OptionDraft {
  title: string;
  constraints: string[];
  params: OptionParams;
  etaLowS: number | null;
  etaHighS: number | null;
  minutesSavedVsNotify: number;
}

interface Facts {
  id: string;
  code: string;
  laneId: string;
  transporterId: string;
  orderId: string;
  routeId: string;
  truck: { id: string; code: string } | null;
  driverUserId: string | null;
  items: { orderLineId: string; quantityT: number; isUrgent: boolean }[];
  childCount: number;
}

interface WorldFacts {
  routesByLane: Map<string, { id: string; code: string; name: string; isPrimary: boolean; lengthKm: number; baselineMinutes: number }[]>;
  trucks: { id: string; code: string; transporterId: string; status: string; locationLabel: string; defaultDriverUserId: string | null }[];
  busyDrivers: Set<string>;
  reports: Map<string, { reason: string }>;
}

const clone = (s: SimShipment): SimShipment => ({ ...s, ledger: { ...s.ledger }, planChangeByParty: { ...s.planChangeByParty } });
const infeasible = (kind: RecoveryKind, reason: string): Evaluated => ({
  kind, feasible: false, infeasibleReason: reason, newEtaS: null, meetsPromise: false, extraCostInr: 0,
  title: TITLE[kind], constraints: [], params: { kind: 'NONE' }, etaLowS: null, etaHighS: null, minutesSavedVsNotify: 0,
});
const TITLE: Record<RecoveryKind, string> = {
  REPLACEMENT_TRUCK: 'Replacement truck',
  REROUTE: 'Reroute',
  SPLIT: 'Split shipment',
  NEW_WINDOW: 'Agree new delivery window',
  NOTIFY_ONLY: 'Notify only',
};
const hm = (s: number) => {
  const m = Math.floor(((s / 60 + 330) % 1440 + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

async function loadWorldFacts(db: Db, ctx: EtaContext): Promise<WorldFacts> {
  const [routes, trucks, live, reports] = await Promise.all([
    db.route.findMany({ select: { id: true, code: true, name: true, laneId: true, isPrimary: true, lengthKm: true, baselineMinutes: true }, orderBy: { code: 'asc' } }),
    db.truck.findMany({ select: { id: true, code: true, transporterId: true, status: true, locationLabel: true, defaultDriverUserId: true }, orderBy: { code: 'asc' } }),
    db.shipment.findMany({ where: { isHistorical: false, currentMilestone: { not: 'DELIVERED' }, driverUserId: { not: null } }, select: { driverUserId: true } }),
    db.driverReport.findMany({ where: { shipmentId: { in: ctx.live.map((s) => s.id) } }, select: { id: true, reason: true } }),
  ]);
  const routesByLane = new Map<string, WorldFacts['routesByLane'] extends Map<string, infer V> ? V : never>();
  for (const r of routes) routesByLane.set(r.laneId, [...(routesByLane.get(r.laneId) ?? []), { ...r, lengthKm: Number(r.lengthKm) }]);
  return { routesByLane, trucks, busyDrivers: new Set(live.map((s) => s.driverUserId as string)), reports: new Map(reports.map((r) => [r.id, { reason: r.reason }])) };
}

async function loadFacts(db: Db, ids: readonly string[]): Promise<Map<string, Facts>> {
  const rows = await db.shipment.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true, code: true, laneId: true, transporterId: true, orderId: true, routeId: true, driverUserId: true,
      truck: { select: { id: true, code: true } },
      items: { select: { orderLineId: true, quantityT: true, orderLine: { select: { isUrgent: true } } }, orderBy: { orderLineId: 'asc' } },
      _count: { select: { children: true } },
    },
  });
  return new Map(rows.map((r) => [r.id, {
    id: r.id, code: r.code, laneId: r.laneId, transporterId: r.transporterId, orderId: r.orderId, routeId: r.routeId, truck: r.truck, driverUserId: r.driverUserId,
    items: r.items.map((i) => ({ orderLineId: i.orderLineId, quantityT: Number(i.quantityT), isUrgent: i.orderLine.isUrgent })),
    childCount: r._count.children,
  }]));
}

/** Projects one shipment in a modified world and returns its explanation (or null). */
function projectOne(ctx: EtaContext, ships: SimShipment[], id: string, opts: Parameters<typeof explainIn>[3] = {}): EtaResult | null {
  return explainIn(ctx, ships, [id], opts).get(id) ?? null;
}

function finish(kind: RecoveryKind, r: EtaResult, base: EtaResult, promiseS: number, cost: number, title: string, constraints: string[], params: OptionParams): Evaluated {
  return {
    kind, feasible: true, infeasibleReason: null, newEtaS: r.predictedArrivalS, meetsPromise: r.predictedArrivalS <= promiseS, extraCostInr: cost,
    title, constraints, params, etaLowS: r.etaLowS, etaHighS: r.etaHighS,
    minutesSavedVsNotify: Math.round((base.predictedArrivalS - r.predictedArrivalS) / 60),
  };
}

/** Evaluates all five kinds for one shipment at ctx.nowS. Deterministic; writes nothing. */
export function evaluateOptions(ctx: EtaContext, wf: WorldFacts, f: Facts, base: EtaResult, fixedNewWindowEndS?: number): Evaluated[] {
  const sh = ctx.live.find((s) => s.id === f.id) as SimShipment;
  const route = ctx.world.routes.get(sh.routeId);
  const moving = sh.milestone === 'IN_TRANSIT' && sh.physicalArrivalS === null;
  const hold = moving && route ? bindingHold(sh, route, ctx.disruptions, ctx.nowS) : null;
  const out: Evaluated[] = [];

  // ── REPLACEMENT_TRUCK: stopped by a breakdown; nearest AVAILABLE truck with a free default driver ──
  out.push((() => {
    if (!moving || !hold || !route) return infeasible('REPLACEMENT_TRUCK', 'The truck is not stopped by a breakdown.');
    let breakdown: { type: 'REPORT'; reportId: string } | { type: 'DISRUPTION'; disruptionId: string } | null = null;
    if (hold.cause.sourceKey.startsWith('RPT:')) {
      const id = hold.cause.sourceKey.slice(4);
      if (wf.reports.get(id)?.reason === 'BREAKDOWN') breakdown = { type: 'REPORT', reportId: id };
    } else if (hold.cause.sourceKey.startsWith('DISR:')) {
      const d = ctx.disruptions.find((x) => `DISR:${x.id}` === hold.cause.sourceKey);
      if (d?.kind === 'TRUCK_BREAKDOWN') breakdown = { type: 'DISRUPTION', disruptionId: d.id };
    }
    if (!breakdown) return infeasible('REPLACEMENT_TRUCK', 'The truck is not stopped by a breakdown.');
    const progressKm = sh.progressMm / 1_000_000;
    const candidates: TruckCandidate[] = wf.trucks
      .filter((t) => t.status === 'AVAILABLE' && t.defaultDriverUserId !== null && !wf.busyDrivers.has(t.defaultDriverUserId) && t.id !== f.truck?.id)
      .map((t) => ({ t, km: t.locationLabel === 'Plant X yard' ? progressKm : YARD_ROAD_KM[t.locationLabel] }))
      .filter((x): x is { t: (typeof x)['t']; km: number } => x.km !== undefined)
      .map((x) => ({ id: x.t.id, code: x.t.code, roadKm: Math.round(x.km * 10) / 10, defaultDriverUserId: x.t.defaultDriverUserId as string }));
    const pick = nearestCandidate(candidates);
    if (!pick) return infeasible('REPLACEMENT_TRUCK', `No available truck with a driver within ${RECOVERY_CONFIG.replacementRadiusKm} km.`);
    const travel = travelMinutes(pick.roadKm);
    const stopUntilS = ctx.nowS + (travel + RECOVERY_CONFIG.transferMinutes) * 60;
    if (stopUntilS >= hold.end) return infeasible('REPLACEMENT_TRUCK', `${pick.code} would not arrive before the repair ends (${hm(hold.end)}).`);
    const ships = [clone(sh)];
    let disruptions = ctx.disruptions;
    if (breakdown.type === 'REPORT') (ships[0] as SimShipment).stoppedUntilS = stopUntilS;
    else {
      const bd = breakdown;
      disruptions = ctx.disruptions.map((d) => (d.id === bd.disruptionId ? { ...d, endS: stopUntilS } : d));
    }
    const r = projectOne(ctx, ships, f.id, { disruptions });
    if (!r) return infeasible('REPLACEMENT_TRUCK', 'No estimate could be computed.');
    const truck = wf.trucks.find((t) => t.id === pick.id);
    return finish('REPLACEMENT_TRUCK', r, base, sh.promisedByS, replacementCostInr(pick.roadKm), `Replacement truck ${pick.code} from ${truck?.locationLabel ?? 'yard'}`,
      [`${pick.code} at ${truck?.locationLabel ?? 'yard'}, ${pick.roadKm} km by road · ${travel} min travel + ${RECOVERY_CONFIG.transferMinutes} min transfer`, `Load transfer until ${hm(stopUntilS)}`, 'Driver changes to the replacement truck’s driver'],
      { kind: 'REPLACEMENT_TRUCK', truckId: pick.id, truckCode: pick.code, driverUserId: pick.defaultDriverUserId, roadKm: pick.roadKm, travelMinutes: travel, transferMinutes: RECOVERY_CONFIG.transferMinutes, stopUntilS, breakdown });
  })());

  // ── REROUTE: moving, before the divergence point, the alternate avoids an active disruption ──
  out.push((() => {
    if (!moving || !route) return infeasible('REROUTE', sh.milestone === 'IN_TRANSIT' ? 'The truck has already reached the customer.' : 'The truck has not left Plant X yet.');
    if (hold) return infeasible('REROUTE', 'The truck is stationary.');
    const current = wf.routesByLane.get(f.laneId)?.find((r) => r.id === sh.routeId);
    const alts = (wf.routesByLane.get(f.laneId) ?? []).filter((r) => r.id !== sh.routeId);
    if (!current || alts.length === 0) return infeasible('REROUTE', 'No alternate route on this lane.');
    const ahead = new Set(remainingSegments(route, sh.progressMm));
    let reason = 'No alternate route avoids an active disruption.';
    for (const alt of alts) {
      const altRoute = ctx.world.routes.get(alt.id);
      if (!altRoute) continue;
      if (sh.progressMm >= divergenceMm(route, altRoute)) { reason = 'The truck is already past the point where the routes split.'; continue; }
      const altAhead = new Set(remainingSegments(altRoute, sh.progressMm));
      const avoided = ctx.disruptions
        .filter((d) => (d.kind === 'WEATHER_SLOWDOWN' || d.kind === 'ROAD_CLOSURE') && d.startS <= ctx.nowS && ctx.nowS < d.endS)
        .filter((d) => d.segmentCodes.some((c) => ahead.has(c)) && !d.segmentCodes.some((c) => altAhead.has(c)))
        .sort((a, b) => a.startS - b.startS || (a.id < b.id ? -1 : 1))[0];
      if (!avoided) continue;
      const planChangeMinutes = alt.baselineMinutes - current.baselineMinutes;
      if (planChangeMinutes < 0) { reason = 'A shorter alternate route is not supported.'; continue; }
      const s2 = clone(sh);
      s2.routeId = alt.id;
      s2.planChangeByParty[avoided.party] = (s2.planChangeByParty[avoided.party] ?? 0) + planChangeMinutes * 60;
      const r = projectOne(ctx, [s2], f.id);
      if (!r) continue;
      const extraKm = Math.round((alt.lengthKm - current.lengthKm) * 10) / 10;
      return finish('REROUTE', r, base, sh.promisedByS, Math.max(0, Math.round(extraKm * RECOVERY_CONFIG.perKmInr)), `Reroute via ${alt.code} (${alt.name})`,
        [`Avoids ${avoided.label}`, `+${extraKm} km, +${planChangeMinutes} min planned driving`],
        { kind: 'REROUTE', routeId: alt.id, routeCode: alt.code, avoidedDisruptionId: avoided.id, planChangeMinutes, extraKm });
    }
    return infeasible('REROUTE', reason);
  })());

  // ── SPLIT: urgent lines leave the plant on a free truck (stated defaults, decision 2026-11-12) ──
  out.push((() => {
    if (f.childCount > 0) return infeasible('SPLIT', 'This shipment has already been split.');
    if (sh.physicalArrivalS !== null) return infeasible('SPLIT', 'The truck has already reached the customer.');
    const total = f.items.reduce((a, i) => a + i.quantityT, 0);
    if (f.items.length <= 1 && total <= RECOVERY_CONFIG.splitMinTonnes) return infeasible('SPLIT', `Only one order line of at most ${RECOVERY_CONFIG.splitMinTonnes} t.`);
    const urgent = f.items.filter((i) => i.isUrgent);
    if (urgent.length === 0 || urgent.length === f.items.length) return infeasible('SPLIT', 'No urgent part to send ahead separately.');
    const free = wf.trucks.filter((t) => t.status === 'AVAILABLE' && t.locationLabel === 'Plant X yard');
    const truck = free.find((t) => t.transporterId === f.transporterId) ?? free[0];
    if (!truck) return infeasible('SPLIT', 'No free truck at Plant X.');
    const primary = (wf.routesByLane.get(f.laneId) ?? []).find((r) => r.isPrimary);
    if (!primary) return infeasible('SPLIT', 'No primary route for this lane.');
    const qty = urgent.reduce((a, i) => a + i.quantityT, 0);
    const child = splitChild(ctx, sh, f, truck.id, truck.transporterId, primary.id);
    const ships = [...ctx.live.map(clone), child.sim];
    const r = projectOne(ctx, ships, child.sim.id, { plannedArrival: new Map([[child.sim.id, child.plannedArrivalS]]) });
    if (!r) return infeasible('SPLIT', 'No estimate could be computed.');
    return finish('SPLIT', r, base, sh.promisedByS, RECOVERY_CONFIG.dispatchInr + Math.round(primary.lengthKm * RECOVERY_CONFIG.perKmInr), `Split: urgent ${qty} t on ${truck.code}`,
      [`${truck.code} free at Plant X`, `Leaves after ${ENGINE_CONFIG.loadingMinutes} min loading on ${primary.code}`, 'The rest of the order stays on the current truck'],
      { kind: 'SPLIT', truckId: truck.id, truckCode: truck.code, transporterId: truck.transporterId, routeId: primary.id, orderLineIds: urgent.map((i) => i.orderLineId), quantityT: qty, plannedDepartureS: child.sim.plannedDepS });
  })());

  // ── NEW_WINDOW: window end fixed at generation (L4); its ETA uses that override ──
  out.push((() => {
    if (sh.arrivedS !== null) return infeasible('NEW_WINDOW', 'The shipment has already arrived.');
    let endS = fixedNewWindowEndS;
    if (endS === undefined) {
      const w = newWindowEnd(base.projectedRoadArrivalS, sh.promisedByS);
      if ('reason' in w) return infeasible('NEW_WINDOW', w.reason);
      endS = w.endS;
    }
    const s2 = clone(sh);
    s2.overrideEndS = endS;
    s2.promisedByS = endS;
    const r = projectOne(ctx, [...ctx.live.filter((x) => x.id !== sh.id).map(clone), s2], f.id);
    if (!r) return infeasible('NEW_WINDOW', 'No estimate could be computed.');
    return finish('NEW_WINDOW', r, base, endS, 0, `Agree new window until ${hm(endS)}`, ['Customer must accept', 'Customer’s normal receiving hours are unchanged'], { kind: 'NEW_WINDOW', newWindowEndS: endS });
  })());

  // ── NOTIFY_ONLY: baseline ──
  out.push(finish('NOTIFY_ONLY', base, base, sh.promisedByS, 0, 'Notify customer only', ['No operational change'], { kind: 'NOTIFY_ONLY' }));
  return out;
}

/** The SPLIT child as engine state (stated defaults: autopilot, primary route, same promise). */
function splitChild(ctx: EtaContext, sh: SimShipment, f: Facts, truckId: string, transporterId: string, routeId: string) {
  const route = ctx.world.routes.get(routeId);
  const baselineS = route ? route.segments.reduce((a, s) => a + s.baselineSec, 0) : 0;
  const plannedDepS = ctx.nowS + ENGINE_CONFIG.loadingMinutes * 60;
  const sim: SimShipment = {
    ...sh, id: `${f.id}_s1`, code: `${f.code}-S1`, autopilot: true, milestone: 'TRUCK_ASSIGNED', truckId, routeId,
    plannedGateS: ctx.nowS, plannedDepS, overrideEndS: null, pace: ctx.world.pace(transporterId, f.laneId), progressMm: 0, stoppedUntilS: null,
    gateQueuedS: null, loadingStartedS: null, loadingEndS: null, gateOutS: null, physicalArrivalS: null, arrivedS: null, deliveredS: null,
    delayMinutes: null, onTime: null, lastUpdateS: null, silentFromS: null, stopCause: null, ledger: {}, planChangeByParty: {}, extraUnloadMin: 0,
  };
  return { sim, plannedArrivalS: plannedDepS + baselineS };
}

/**
 * Pipeline step (architecture §6.3, ES → RS): for WATCH / AT_RISK / LATE shipments not yet at the
 * customer, a NEW option set when the inputs changed (decision 2026-11-12) — no current set, the
 * shipment's ETA/risk result changed, or an action or event touched it. A set that contains a
 * CHOSEN option is kept (the decision stands until arrival). ON_TRACK → no current set.
 * Returns true when something material changed.
 */
export async function refreshOptionSets(
  tx: Prisma.TransactionClient,
  ctx: EtaContext,
  results: ReadonlyMap<string, EtaResult>,
  touched: ReadonlySet<string>,
): Promise<boolean> {
  const ids = [...results.keys()].sort();
  const rows = await tx.shipment.findMany({ where: { id: { in: ids } }, select: { id: true, currentOptionSetId: true, physicalArrivalAt: true, arrivedAt: true } });
  const sets = await tx.recoveryOption.findMany({
    where: { optionSetId: { in: rows.map((r) => r.currentOptionSetId).filter((x): x is string => x !== null) } },
    select: { optionSetId: true, status: true },
  });
  const decided = new Set(sets.filter((o) => o.status === 'CHOSEN').map((o) => o.optionSetId));
  let wf: WorldFacts | null = null;
  let facts: Map<string, Facts> | null = null;
  let material = false;
  for (const row of rows) {
    const r = results.get(row.id) as EtaResult;
    const eligible = OPTION_LEVELS.includes(r.level) && row.physicalArrivalAt === null && row.arrivedAt === null;
    if (!eligible) {
      if (row.currentOptionSetId && !decided.has(row.currentOptionSetId)) {
        await tx.recoveryOption.updateMany({ where: { optionSetId: row.currentOptionSetId, status: 'PROPOSED' }, data: { status: 'SUPERSEDED' } });
        await tx.shipment.update({ where: { id: row.id }, data: { currentOptionSetId: null } });
        material = true;
      }
      continue;
    }
    if (row.currentOptionSetId && decided.has(row.currentOptionSetId)) continue;
    if (row.currentOptionSetId && !touched.has(row.id)) continue;
    wf ??= await loadWorldFacts(tx, ctx);
    facts ??= await loadFacts(tx, ids);
    const f = facts.get(row.id);
    if (!f) continue;
    await writeOptionSet(tx, ctx, row.id, row.currentOptionSetId, evaluateOptions(ctx, wf, f, r));
    material = true;
  }
  return material;
}

async function writeOptionSet(tx: Prisma.TransactionClient, ctx: EtaContext, shipmentId: string, previousSetId: string | null, options: Evaluated[]): Promise<string> {
  const n = await tx.recoveryOption.count({ where: { shipmentId, createdAtSim: fromS(ctx.nowS), kind: 'NOTIFY_ONLY' } });
  const setId = `ops_${shipmentId}_${ctx.nowS}${n > 0 ? `_${n + 1}` : ''}`;
  const suggested = suggestedKind(options);
  const alert = await tx.alert.findFirst({ where: { shipmentId, status: { in: ['OPEN', 'ACTION_CHOSEN'] } }, select: { id: true } });
  if (previousSetId) await tx.recoveryOption.updateMany({ where: { optionSetId: previousSetId, status: 'PROPOSED' }, data: { status: 'SUPERSEDED' } });
  for (const o of [...options].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))) {
    if (!isOptionParams(o.params)) throw new Error(`invalid option params for ${o.kind}`);
    await tx.recoveryOption.create({
      data: {
        id: `opt_${setId}_${o.kind}`,
        shipmentId,
        alertId: alert?.id ?? null,
        optionSetId: setId,
        createdAtSim: fromS(ctx.nowS),
        kind: o.kind,
        feasible: o.feasible,
        infeasibleReason: o.infeasibleReason,
        newEtaAt: o.newEtaS === null ? null : fromS(o.newEtaS),
        etaLowAt: o.etaLowS === null ? null : fromS(o.etaLowS),
        etaHighAt: o.etaHighS === null ? null : fromS(o.etaHighS),
        meetsPromise: o.meetsPromise,
        minutesSavedVsNotify: o.minutesSavedVsNotify,
        extraCostInr: o.extraCostInr,
        isSuggested: o.kind === suggested,
        suggestionRule: SUGGESTION_RULE,
        constraints: o.constraints,
        params: { ...o.params, title: o.title } as Prisma.InputJsonValue,
      },
    });
  }
  await tx.shipment.update({ where: { id: shipmentId }, data: { currentOptionSetId: setId } });
  return setId;
}

// ───────────────────────────── choose (#30) ─────────────────────────────

export interface ChooseResult {
  optionId: string;
  childShipmentId: string | null;
  driverChange: { fromDriverName: string; toDriverName: string; toTruckCode: string } | null;
  customerNotified: boolean;
}

const PLAIN: Record<RecoveryKind, string> = {
  REPLACEMENT_TRUCK: 'a replacement truck',
  REROUTE: 'an alternative route',
  SPLIT: 'an extra truck for the urgent part of your order',
  NEW_WINDOW: 'a new arrival window',
  NOTIFY_ONLY: 'close monitoring of your delivery (no change to the plan)',
};
export const plainRecovery = (k: RecoveryKind) => PLAIN[k];

/**
 * Coordinator decision (API §10.5, AC-M4.5, AC-M4.8). Runs inside applyChange('RECOVERY'): the
 * option is re-evaluated at the decision minute and exactly that evaluation is applied, so the
 * pipeline's new ETA equals the option's refreshed newEtaAt (RC-4). The audit keeps every option
 * of the set as shown. Duplicate protection: stale set → 409 STALE_OPTIONS; already chosen → 409.
 */
export async function chooseOption(
  tx: Prisma.TransactionClient,
  ctx: EtaContext,
  input: { shipmentId: string; optionId: string; optionSetId: string; note: string | undefined; actor: Actor },
): Promise<ChooseResult> {
  const sh = await tx.shipment.findUnique({
    where: { id: input.shipmentId },
    select: { id: true, code: true, isHistorical: true, currentMilestone: true, currentOptionSetId: true, truckId: true, driverUserId: true, promisedBy: true, order: { select: { code: true, customerId: true } }, driver: { select: { name: true } }, truck: { select: { code: true } } },
  });
  if (!sh || sh.isHistorical) throw notFound();
  const option = await tx.recoveryOption.findFirst({ where: { id: input.optionId, shipmentId: sh.id } });
  if (!option) throw notFound();
  const alert = await tx.alert.findFirst({ where: { shipmentId: sh.id, status: { in: ['OPEN', 'ACTION_CHOSEN'] } } });
  const chosenAlready = await tx.recoveryOption.count({ where: { shipmentId: sh.id, status: 'CHOSEN', ...(alert ? { alertId: alert.id } : { optionSetId: option.optionSetId }) } });
  if (option.status === 'CHOSEN' || chosenAlready > 0) throw new DomainError('ALREADY_DONE', 'A recovery action has already been chosen for this alert.');
  const stale = () => new DomainError('STALE_OPTIONS', 'These options are out of date. Review the current options.', { currentOptionSetId: sh.currentOptionSetId });
  if (option.optionSetId !== input.optionSetId || sh.currentOptionSetId !== input.optionSetId || option.status !== 'PROPOSED') throw stale();
  if (!option.feasible) throw new DomainError('INVALID_TRANSITION', `This option is not feasible: ${option.infeasibleReason ?? ''}`.trim());

  // Re-check feasibility and re-evaluate at the decision minute (architecture §10.7).
  const base = explainIn(ctx, ctx.live, [sh.id]).get(sh.id);
  const wf = await loadWorldFacts(tx, ctx);
  const f = (await loadFacts(tx, [sh.id])).get(sh.id);
  if (!base || !f) throw stale();
  const stored = option.params as Record<string, unknown>;
  const fixedEnd = option.kind === 'NEW_WINDOW' && typeof stored['newWindowEndS'] === 'number' ? stored['newWindowEndS'] : undefined;
  const fresh = evaluateOptions(ctx, wf, f, base, fixedEnd).find((o) => o.kind === option.kind);
  if (!fresh || !fresh.feasible || !isOptionParams(fresh.params, option.kind)) throw stale();
  const p = fresh.params;
  const atS = ctx.nowS;
  let childShipmentId: string | null = null;
  let driverChange: ChooseResult['driverChange'] = null;
  const eventData: Record<string, string | number | null> = { optionId: option.id, optionSetId: option.optionSetId, kind: option.kind };

  switch (p.kind) {
    case 'REPLACEMENT_TRUCK': {
      if (p.breakdown.type === 'REPORT') await tx.shipment.update({ where: { id: sh.id }, data: { stoppedUntil: fromS(p.stopUntilS) } });
      else await tx.disruption.update({ where: { id: p.breakdown.disruptionId }, data: { endedEarlyAt: fromS(p.stopUntilS) } });
      const newDriver = await tx.user.findUniqueOrThrow({ where: { id: p.driverUserId }, select: { name: true } });
      if (sh.truckId) await tx.truck.update({ where: { id: sh.truckId }, data: { status: 'MAINTENANCE' } });
      await tx.truck.update({ where: { id: p.truckId }, data: { status: 'ASSIGNED' } });
      await tx.shipment.update({ where: { id: sh.id }, data: { truckId: p.truckId, driverUserId: p.driverUserId } });
      driverChange = { fromDriverName: sh.driver?.name ?? '—', toDriverName: newDriver.name, toTruckCode: p.truckCode };
      Object.assign(eventData, { previousDriverUserId: sh.driverUserId, previousTruckId: sh.truckId, newTruckId: p.truckId, newDriverUserId: p.driverUserId, stopUntil: fromS(p.stopUntilS).toISOString() });
      break;
    }
    case 'REROUTE': {
      const d = await tx.disruption.findUniqueOrThrow({ where: { id: p.avoidedDisruptionId }, select: { party: true, reasonCode: true } });
      await tx.shipment.update({ where: { id: sh.id }, data: { routeId: p.routeId } });
      if (p.planChangeMinutes > 0) {
        await tx.delayAttribution.create({
          data: { id: `da_${sh.id}_ROUTE:${p.avoidedDisruptionId}_${d.party}`, shipmentId: sh.id, sourceKey: `ROUTE:${p.avoidedDisruptionId}`, kind: 'PLAN_CHANGE', factor: 'DISR', reason: d.reasonCode, party: d.party, delaySeconds: p.planChangeMinutes * 60, disruptionId: p.avoidedDisruptionId, updatedAtSim: fromS(atS) },
        });
      }
      Object.assign(eventData, { routeId: p.routeId, avoidedDisruptionId: p.avoidedDisruptionId, planChangeMinutes: p.planChangeMinutes });
      break;
    }
    case 'SPLIT': {
      childShipmentId = await createSplitChild(tx, ctx, sh.id, p);
      Object.assign(eventData, { childShipmentId, truckId: p.truckId });
      break;
    }
    case 'NEW_WINDOW':
      Object.assign(eventData, { newWindowEnd: fromS(p.newWindowEndS).toISOString() });
      break;
    case 'NOTIFY_ONLY':
      break;
  }

  const awaiting = option.kind === 'NEW_WINDOW';
  await tx.recoveryOption.update({
    where: { id: option.id },
    data: {
      status: awaiting ? 'AWAITING_CUSTOMER' : 'CHOSEN',
      newEtaAt: fresh.newEtaS === null ? null : fromS(fresh.newEtaS),
      etaLowAt: fresh.etaLowS === null ? null : fromS(fresh.etaLowS),
      etaHighAt: fresh.etaHighS === null ? null : fromS(fresh.etaHighS),
      meetsPromise: fresh.meetsPromise,
      minutesSavedVsNotify: fresh.minutesSavedVsNotify,
      params: { ...p, title: fresh.title } as Prisma.InputJsonValue,
      ...(alert && !option.alertId ? { alertId: alert.id } : {}),
    },
  });
  // Another option chosen → an earlier NEW_WINDOW still awaiting the customer is superseded (L4).
  await tx.recoveryOption.updateMany({ where: { shipmentId: sh.id, status: 'AWAITING_CUSTOMER', id: { not: option.id } }, data: { status: 'SUPERSEDED' } });
  if (alert) await tx.alert.update({ where: { id: alert.id }, data: { status: 'ACTION_CHOSEN', chosenOptionId: option.id, chosenByUserId: input.actor.userId, chosenAt: fromS(atS) } });

  const n = await tx.shipmentEvent.count({ where: { shipmentId: sh.id, type: 'RECOVERY_CHOSEN' } });
  await tx.shipmentEvent.create({ data: { id: `sev_${sh.id}_RECOVERY_CHOSEN_${n + 1}`, shipmentId: sh.id, type: 'RECOVERY_CHOSEN', simTime: fromS(atS), source: 'COORDINATOR', actorUserId: input.actor.userId, data: eventData } });

  const eta = fresh.newEtaS !== null ? hm(fresh.newEtaS) : '—';
  await tx.notification.create({
    data: { id: `ntf_${option.id}_RECOVERY_CONFIRMED`, audience: 'COORDINATOR', shipmentId: sh.id, alertId: alert?.id ?? null, kind: 'RECOVERY_CONFIRMED', templateKey: 'notif.RECOVERY_CONFIRMED', params: { shipmentCode: sh.code, kind: option.kind }, text: awaiting ? `${sh.code}: new window until ${hm((p as { newWindowEndS: number }).newWindowEndS)} proposed to the customer.` : `${sh.code}: ${fresh.title.toLowerCase()} chosen — new estimate ${eta}.`, simTime: fromS(atS) },
  });
  // Customer: plain words only (no truck driver, party or codes); NEW_WINDOW waits for acceptance (API §10.5).
  let customerNotified = false;
  if (!awaiting) {
    await tx.notification.create({
      data: { id: `ntf_${option.id}_PLAN_UPDATED`, audience: 'CUSTOMER', customerId: sh.order.customerId, shipmentId: sh.id, alertId: alert?.id ?? null, kind: 'PLAN_UPDATED', templateKey: 'notif.PLAN_UPDATED', params: { orderCode: sh.order.code, predictedArrivalAt: fresh.newEtaS === null ? '' : fromS(fresh.newEtaS).toISOString() }, text: `Plant X arranged ${PLAIN[option.kind]} for order ${sh.order.code}. New estimate ${eta}.`, simTime: fromS(atS) },
    });
    customerNotified = true;
  }
  const set = await tx.recoveryOption.findMany({ where: { optionSetId: option.optionSetId }, orderBy: { id: 'asc' } });
  await writeAudit(tx, {
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    action: 'recovery.choose',
    entityType: 'RecoveryOption',
    entityId: option.id,
    data: {
      shipmentId: sh.id, shipmentCode: sh.code, kind: option.kind, note: input.note ?? null,
      realisedEtaAt: fresh.newEtaS === null ? null : fromS(fresh.newEtaS).toISOString(),
      alternatives: set.map((o) => ({ id: o.id, kind: o.kind, feasible: o.feasible, newEtaAt: o.newEtaAt ? o.newEtaAt.toISOString() : null, meetsPromise: o.meetsPromise, extraCostInr: o.extraCostInr, isSuggested: o.isSuggested })),
    },
  });
  return { optionId: option.id, childShipmentId, driverChange, customerNotified };
}

async function createSplitChild(tx: Prisma.TransactionClient, ctx: EtaContext, parentId: string, p: Extract<OptionParams, { kind: 'SPLIT' }>): Promise<string> {
  const parent = await tx.shipment.findUniqueOrThrow({ where: { id: parentId } });
  const route = await tx.route.findUniqueOrThrow({ where: { id: p.routeId }, select: { baselineMinutes: true } });
  const childId = `${parent.id}_s1`;
  const atS = ctx.nowS;
  await tx.shipment.create({
    data: {
      id: childId, code: `${parent.code}-S1`, orderId: parent.orderId, laneId: parent.laneId, routeId: p.routeId, transporterId: p.transporterId,
      truckId: p.truckId, driverUserId: null, parentShipmentId: parent.id, autopilot: true, isHistorical: false, currentMilestone: 'TRUCK_ASSIGNED',
      plannedGateAt: fromS(atS), plannedDepartureAt: fromS(p.plannedDepartureS), plannedArrivalAt: fromS(p.plannedDepartureS + route.baselineMinutes * 60),
      promisedBy: parent.promisedBy, originalPromisedBy: parent.originalPromisedBy, pingIntervalMinutes: parent.pingIntervalMinutes,
    },
  });
  await tx.shipmentItem.updateMany({ where: { shipmentId: parent.id, orderLineId: { in: p.orderLineIds } }, data: { shipmentId: childId } });
  await tx.truck.update({ where: { id: p.truckId }, data: { status: 'ASSIGNED' } });
  for (const m of ['ORDER_CONFIRMED', 'TRUCK_ASSIGNED'] as const) {
    await tx.shipmentEvent.create({ data: { id: `sev_${childId}_${m}`, shipmentId: childId, type: 'MILESTONE', milestone: m, simTime: fromS(atS), source: 'SYSTEM', data: { splitFrom: parent.id } } });
  }
  return childId;
}

// ───────────────────────────── customer acceptance of NEW_WINDOW (#28, L4) ─────────────────────────────

/**
 * The customer ACCEPTs a NEW_WINDOW proposal: exactly the stored newWindowEnd becomes the promise and
 * the shipment's receiving override (preview = execution); renegotiated = true; the customer's default
 * hours and originalPromisedBy are untouched. Superseded proposal → 409 STALE_OPTIONS, nothing applied.
 */
export async function acceptNewWindow(tx: Prisma.TransactionClient, atS: number, input: { alertId: string; customerId: string; actor: Actor }): Promise<string> {
  const alert = await tx.alert.findFirst({ where: { id: input.alertId, shipment: { order: { customerId: input.customerId } } }, select: { id: true, status: true, chosenOptionId: true, shipmentId: true, shipment: { select: { code: true, promisedBy: true, order: { select: { code: true } } } } } });
  if (!alert) throw notFound();
  if (alert.status === 'RESOLVED') throw new DomainError('INVALID_TRANSITION', 'This alert is already resolved.');
  const option = alert.chosenOptionId ? await tx.recoveryOption.findUnique({ where: { id: alert.chosenOptionId } }) : null;
  if (!option || option.kind !== 'NEW_WINDOW' || option.status !== 'AWAITING_CUSTOMER' || !isOptionParams(option.params, 'NEW_WINDOW')) {
    throw new DomainError('STALE_OPTIONS', 'This proposal is no longer available; Plant X will update you.');
  }
  const endS = (option.params as Extract<OptionParams, { kind: 'NEW_WINDOW' }>).newWindowEndS;
  const previous = alert.shipment.promisedBy;
  await tx.shipment.update({ where: { id: alert.shipmentId }, data: { promisedBy: fromS(endS), receivingWindowOverrideEndAt: fromS(endS), renegotiated: true } });
  await tx.recoveryOption.update({ where: { id: option.id }, data: { status: 'CHOSEN' } });
  await tx.alert.update({ where: { id: alert.id }, data: { customerResponse: 'ACCEPT_PROPOSAL', customerRespondedAt: fromS(atS), customerRespondedByUserId: input.actor.userId } });
  const n = await tx.shipmentEvent.count({ where: { shipmentId: alert.shipmentId, type: 'CUSTOMER_RESPONDED' } });
  await tx.shipmentEvent.create({ data: { id: `sev_${alert.id}_RESPONDED_${n + 1}`, shipmentId: alert.shipmentId, type: 'CUSTOMER_RESPONDED', simTime: fromS(atS), source: 'SYSTEM', actorUserId: input.actor.userId, data: { alertId: alert.id, response: 'ACCEPT_PROPOSAL' } } });
  await tx.shipmentEvent.create({ data: { id: `sev_${option.id}_APPLIED`, shipmentId: alert.shipmentId, type: 'RECOVERY_APPLIED', simTime: fromS(atS), source: 'SYSTEM', actorUserId: input.actor.userId, data: { optionId: option.id, newWindowEnd: fromS(endS).toISOString(), previousPromisedBy: previous.toISOString() } } });
  const nn = await tx.notification.count({ where: { alertId: alert.id, kind: 'CUSTOMER_RESPONDED' } });
  await tx.notification.create({ data: { id: `ntf_${alert.id}_RESPONDED_${nn + 1}`, audience: 'COORDINATOR', shipmentId: alert.shipmentId, alertId: alert.id, kind: 'CUSTOMER_RESPONDED', templateKey: 'notif.CUSTOMER_RESPONDED', params: { shipmentCode: alert.shipment.code, response: 'ACCEPT_PROPOSAL' }, text: `Customer accepted the new window until ${hm(endS)} for ${alert.shipment.code}.`, simTime: fromS(atS) } });
  await tx.notification.create({ data: { id: `ntf_${option.id}_PLAN_UPDATED`, audience: 'CUSTOMER', customerId: input.customerId, shipmentId: alert.shipmentId, alertId: alert.id, kind: 'PLAN_UPDATED', templateKey: 'notif.PLAN_UPDATED', params: { orderCode: alert.shipment.order.code, newWindowEnd: fromS(endS).toISOString() }, text: `New arrival window for order ${alert.shipment.order.code} agreed: until ${hm(endS)}.`, simTime: fromS(atS) } });
  await writeAudit(tx, { actorUserId: input.actor.userId, actorRole: input.actor.role, action: 'alert.customerResponse', entityType: 'Alert', entityId: alert.id, data: { shipmentId: alert.shipmentId, shipmentCode: alert.shipment.code, response: 'ACCEPT_PROPOSAL' } });
  await writeAudit(tx, { actorUserId: input.actor.userId, actorRole: input.actor.role, action: 'recovery.apply', entityType: 'RecoveryOption', entityId: option.id, data: { shipmentId: alert.shipmentId, shipmentCode: alert.shipment.code, kind: 'NEW_WINDOW', newWindowEnd: fromS(endS).toISOString(), previousPromisedBy: previous.toISOString() } });
  return alert.shipmentId;
}

/** True when the alert's chosen option is a NEW_WINDOW (acceptance goes through the pipeline). */
export async function isNewWindowDecision(db: Db, alertId: string): Promise<boolean> {
  const a = await db.alert.findUnique({ where: { id: alertId }, select: { chosenOptionId: true } });
  if (!a?.chosenOptionId) return false;
  const o = await db.recoveryOption.findUnique({ where: { id: a.chosenOptionId }, select: { kind: true } });
  return o?.kind === 'NEW_WINDOW';
}

