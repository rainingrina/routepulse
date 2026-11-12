/**
 * Deterministic 60-day delivered history (~200 shipments) for the dashboard and HIST pace.
 *
 * Every number is generated from a fixed PRNG seed with the stated distributions below [A]; the
 * same seed always yields the same rows. This is FICTIONAL data, labelled as such in the UI.
 *
 * Construction (all integer minutes, so the ledger reconciles exactly):
 *   physical arrival = planned arrival + gate wait (PLANT) + pace (TRANSPORTER, HIST)
 *                      + external disruption (EXTERNAL) + breakdown stop (TRANSPORTER, RPT)
 *   arrivedAt        = eligible check-in of the physical arrival (receiving-window rule, L1)
 *   WIN              = arrivedAt − physical arrival, split knock-on across the other parties
 *   Σ attribution    = arrivedAt − planned arrival            (invariant, tested)
 *   delayMinutes     = max(0, arrivedAt − promisedBy); onTime = arrivedAt ≤ promisedBy
 *
 * firstAtRiskAt is not random: it is the first moment at which the delay known so far (pace at the
 * gate, gate wait at gate-out, then the disruption / breakdown when they occur) pushed the
 * predicted receiving time past the promise. Shipments that never crossed it have no alert.
 *
 * Distributions [A]:
 *   shipments per lane per day: Pune 0.7, Nashik 0.6, Surat 0.6, Ahmedabad 0.4, Indore 0.35, Nagpur 0.35
 *   planned gate 06:00–13:00 (10-min steps); promise buffer 30/60/90/120/180 min (seedPromise)
 *   gate wait: P = 0.45 Pune, 0.30 elsewhere; 10–70 min
 *   pace r (TRANSPORTER): Ghatline 0.075269 (p = 0.93), Coastway 0.09, Bluehill 0.05,
 *                         Ironroad 0.04, Northstar 0.03; HIST minutes = round(baseline × r)
 *   external disruption: P = 0.30 Pune (ghat), 0.18 elsewhere; 20–150 min; 70% weather slowdown
 *   breakdown: P = 0.12 Coastway, 0.06 others; 60–210 min; half are recovered by a replacement
 *              truck, which caps the stop at 75 min (records a CHOSEN REPLACEMENT_TRUCK option)
 */
import type { Party } from '@routepulse/shared';
import { ENGINE_CONFIG } from '../config/engine.js';
import { eligibleCheckIn, splitKnockOn } from '../engines/receivingWindow.js';
import { addMinutes, istAt, minutesBetween } from '../engines/time.js';
import { COORDINATOR_ID, HISTORY_DAYS, HISTORY_PRNG_SEED, daysBefore, seedPromise } from './constants.js';
import { createPrng, type Prng } from './prng.js';
import { CUSTOMER_RECEIVING, GRADES, LANES, TRUCKS, USERS, primaryRouteOf } from './referenceData.js';
import type { SeedRows } from './rows.js';

const LANE_RATE: Record<string, number> = {
  lane_pune: 0.7,
  lane_nashik: 0.6,
  lane_surat: 0.6,
  lane_ahmedabad: 0.4,
  lane_indore: 0.35,
  lane_nagpur: 0.35,
};
const LANE_TRANSPORTERS: Record<string, readonly string[]> = {
  lane_pune: ['trn_ghatline', 'trn_bluehill', 'trn_northstar'],
  lane_nashik: ['trn_bluehill', 'trn_ghatline'],
  lane_surat: ['trn_coastway', 'trn_bluehill'],
  lane_ahmedabad: ['trn_coastway', 'trn_ironroad'],
  lane_indore: ['trn_ironroad', 'trn_northstar'],
  lane_nagpur: ['trn_northstar', 'trn_ironroad'],
};
/** Designed controllable pace delay rate r = 1/p − 1 per transporter [A]. */
export const TRANSPORTER_PACE_RATE: Record<string, number> = {
  trn_ghatline: 1 / 0.93 - 1,
  trn_coastway: 0.09,
  trn_bluehill: 0.05,
  trn_ironroad: 0.04,
  trn_northstar: 0.03,
};
const BREAKDOWN_P: Record<string, number> = { trn_coastway: 0.12 };
const REPLACEMENT_CAP_MIN = 75;
const RATE_CARD = { dispatchInr: 3000, perKmInr: 55, transferFeeInr: 2000, replacementKm: 20 } as const; // fictional [A]

const RECEIVING = { openMin: CUSTOMER_RECEIVING.receivingOpenMin, closeMin: CUSTOMER_RECEIVING.receivingCloseMin };

interface Component {
  key: 'GATE' | 'HIST' | 'DISR' | 'RPT';
  party: Party;
  minutes: number;
  /** When the system learns about it. */
  knownAt: Date;
}

const pad = (n: number) => String(n).padStart(4, '0');

function driversOf(transporterId: string): string[] {
  return USERS.filter((u) => u.role === 'DRIVER' && u.transporterId === transporterId).map((u) => u.id);
}
function trucksOf(transporterId: string): string[] {
  return TRUCKS.filter((t) => t.transporterId === transporterId).map((t) => t.id);
}

/** Predicted receiving time if only components known by `t` were counted. */
function predictedAt(plannedArrival: Date, comps: Component[], t: Date): Date {
  const known = comps.filter((c) => c.knownAt.getTime() <= t.getTime()).reduce((a, c) => a + c.minutes, 0);
  return eligibleCheckIn(addMinutes(plannedArrival, known), RECEIVING);
}

export function addHistory(rows: SeedRows): void {
  const rng: Prng = createPrng(HISTORY_PRNG_SEED);
  let seq = 0;

  for (let day = HISTORY_DAYS; day >= 1; day -= 1) {
    const date = daysBefore(day);
    for (const lane of LANES) {
      if (!rng.chance(LANE_RATE[lane.id] ?? 0)) continue;
      seq += 1;
      const n = pad(seq);
      const route = primaryRouteOf(lane.id);
      const transporterId = rng.pick(LANE_TRANSPORTERS[lane.id] ?? []);
      const drivers = driversOf(transporterId);
      const driverUserId = drivers.length > 0 ? rng.pick(drivers) : null;
      const truckId = rng.pick(trucksOf(transporterId));

      const plannedGateAt = istAt(date, rng.stepped(6 * 60, 13 * 60, 10));
      const plannedDepartureAt = addMinutes(plannedGateAt, ENGINE_CONFIG.loadingMinutes);
      const plannedArrivalAt = addMinutes(plannedDepartureAt, route.baselineMinutes);
      const promisedBy = seedPromise(plannedArrivalAt, rng.pick([30, 60, 90, 120, 180]));

      // ── delay components ──
      const comps: Component[] = [];
      const histMin = Math.round(route.baselineMinutes * (TRANSPORTER_PACE_RATE[transporterId] ?? 0));
      if (histMin > 0) comps.push({ key: 'HIST', party: 'TRANSPORTER', minutes: histMin, knownAt: plannedGateAt });

      const gateWait = rng.chance(lane.id === 'lane_pune' ? 0.45 : 0.3) ? rng.stepped(10, 70, 5) : 0;
      const gateOutAt = addMinutes(plannedDepartureAt, gateWait);
      if (gateWait > 0) comps.push({ key: 'GATE', party: 'PLANT', minutes: gateWait, knownAt: gateOutAt });

      const transitSpan = route.baselineMinutes;
      let disruption: { id: string; minutes: number; startsAt: Date; weather: boolean; segment: string } | null = null;
      if (rng.chance(lane.id === 'lane_pune' ? 0.3 : 0.18)) {
        const minutes = rng.stepped(20, 150, 5);
        const startsAt = addMinutes(gateOutAt, rng.stepped(30, Math.max(30, Math.floor(transitSpan * 0.5)), 5));
        const segs = route.segments.map((s) => s.segmentCode);
        const segment = lane.id === 'lane_pune' ? 'KHP-LNV-GHAT' : rng.pick(segs);
        disruption = { id: `dis_h${n}`, minutes, startsAt, weather: rng.chance(0.7), segment };
        comps.push({ key: 'DISR', party: 'EXTERNAL', minutes, knownAt: startsAt });
      }

      let breakdown: { id: string; original: number; applied: number; at: Date; recovered: boolean } | null = null;
      if (driverUserId && rng.chance(BREAKDOWN_P[transporterId] ?? 0.06)) {
        const original = rng.stepped(60, 210, 15);
        const at = addMinutes(gateOutAt, rng.stepped(30, Math.max(30, Math.floor(transitSpan * 0.6)), 5));
        const recovered = original > REPLACEMENT_CAP_MIN && rng.chance(0.5);
        breakdown = { id: `rpt_h${n}`, original, applied: recovered ? REPLACEMENT_CAP_MIN : original, at, recovered };
        comps.push({ key: 'RPT', party: 'TRANSPORTER', minutes: breakdown.applied, knownAt: at });
      }

      // ── outcome ──
      const lostMin = comps.reduce((a, c) => a + c.minutes, 0);
      const physicalArrivalAt = addMinutes(plannedArrivalAt, lostMin);
      const arrivedAt = eligibleCheckIn(physicalArrivalAt, RECEIVING);
      const winMin = minutesBetween(physicalArrivalAt, arrivedAt);
      const deliveredAt = addMinutes(arrivedAt, CUSTOMER_RECEIVING.unloadingMinutes);
      const delayMinutes = Math.max(0, Math.round(minutesBetween(promisedBy, arrivedAt)));
      const onTime = arrivedAt.getTime() <= promisedBy.getTime();

      // ── first at-risk moment (from when each delay became known; before recovery) ──
      const knowledge = comps.map((c) => (c.key === 'RPT' && breakdown ? { ...c, minutes: breakdown.original } : c));
      const checkpoints = [...new Set(knowledge.map((c) => c.knownAt.getTime()))].sort((a, b) => a - b).map((t) => new Date(t));
      const firstAtRiskAt = checkpoints.find((t) => predictedAt(plannedArrivalAt, knowledge, t).getTime() > promisedBy.getTime()) ?? null;

      // ── rows ──
      const shipmentId = `hshp_${n}`;
      const orderId = `hord_${n}`;
      const qty = rng.pick([20, 22, 24, 25]);
      const grade = rng.pick(GRADES);
      const placedAt = addMinutes(plannedGateAt, -2 * 1440);
      rows.orders.push({ id: orderId, code: `ORD-H${n}`, customerId: lane.customerId, promisedBy, placedAt });
      rows.orderLines.push({ id: `holn_${n}`, orderId, gradeCode: grade, quantityT: qty });
      rows.shipmentItems.push({ id: `hsit_${n}`, shipmentId, orderLineId: `holn_${n}`, quantityT: qty });

      rows.shipments.push({
        id: shipmentId,
        code: `SHP-H${n}`,
        orderId,
        laneId: lane.id,
        routeId: route.id,
        transporterId,
        truckId,
        driverUserId,
        autopilot: true,
        isHistorical: true,
        currentMilestone: 'DELIVERED',
        plannedGateAt,
        plannedDepartureAt,
        plannedArrivalAt,
        promisedBy,
        originalPromisedBy: promisedBy,
        progressM: Math.round(route.lengthKm * 1000),
        gateQueuedAt: plannedGateAt,
        loadingStartedAt: addMinutes(plannedGateAt, gateWait),
        gateOutAt,
        lastUpdateAt: arrivedAt,
        firstAtRiskAt,
        customerNotifiedAt: firstAtRiskAt,
        physicalArrivalAt,
        arrivedAt,
        deliveredAt,
        delayMinutes,
        onTime,
      });

      const evt = (k: string, type: 'MILESTONE' | 'PHYSICAL_ARRIVAL' | 'DRIVER_REPORT' | 'REPORT_REVIEWED' | 'DISRUPTION_STARTED' | 'ALERT_OPENED' | 'CUSTOMER_NOTIFIED' | 'RECOVERY_CHOSEN' | 'ALERT_RESOLVED' | 'CUSTOMER_RESPONDED', at: Date, extra: { milestone?: 'ORDER_CONFIRMED' | 'TRUCK_ASSIGNED' | 'AT_GATE' | 'LOADING' | 'GATE_OUT' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED'; actorUserId?: string; data?: Record<string, string | number | boolean> } = {}) =>
        rows.events.push({
          id: `hevt_${n}_${k}`,
          shipmentId,
          type,
          milestone: extra.milestone ?? null,
          simTime: at,
          source: 'SEED',
          actorUserId: extra.actorUserId ?? null,
          data: extra.data ?? {},
        });
      evt('01', 'MILESTONE', placedAt, { milestone: 'ORDER_CONFIRMED' });
      evt('02', 'MILESTONE', addMinutes(plannedGateAt, -960), { milestone: 'TRUCK_ASSIGNED' });
      evt('03', 'MILESTONE', plannedGateAt, { milestone: 'AT_GATE' });
      evt('04', 'MILESTONE', addMinutes(plannedGateAt, gateWait), { milestone: 'LOADING' });
      evt('05', 'MILESTONE', gateOutAt, { milestone: 'GATE_OUT' });
      evt('06', 'MILESTONE', gateOutAt, { milestone: 'IN_TRANSIT' });
      evt('07', 'PHYSICAL_ARRIVAL', physicalArrivalAt);
      evt('08', 'MILESTONE', arrivedAt, { milestone: 'ARRIVED' });
      evt('09', 'MILESTONE', deliveredAt, { milestone: 'DELIVERED' });

      // ── disruption and driver report source rows ──
      if (disruption) {
        const endsAt = addMinutes(disruption.startsAt, disruption.minutes * 2 + 60);
        rows.disruptions.push({
          id: disruption.id,
          kind: disruption.weather ? 'WEATHER_SLOWDOWN' : 'ROAD_CLOSURE',
          origin: 'SEED',
          label: disruption.weather ? 'Heavy rain (historical, fictional)' : 'Road closure (historical, fictional)',
          segmentCodes: [disruption.segment],
          slowdownPct: disruption.weather ? rng.stepped(30, 70, 5) : null,
          stopMinutes: disruption.weather ? null : disruption.minutes,
          party: 'EXTERNAL',
          reasonCode: disruption.weather ? 'HEAVY_RAIN' : 'ROAD_CLOSED',
          startsAt: disruption.startsAt,
          endsAt,
        });
        evt('10', 'DISRUPTION_STARTED', disruption.startsAt, { data: { disruptionId: disruption.id } });
      }
      if (breakdown && driverUserId) {
        rows.driverReports.push({
          id: breakdown.id,
          shipmentId,
          reporterUserId: driverUserId,
          simTime: breakdown.at,
          chipReason: 'BREAKDOWN',
          reason: 'BREAKDOWN',
          matchedKeywords: [],
          appliedMinutes: breakdown.original,
          party: 'TRANSPORTER',
          status: 'CONFIRMED',
          reviewedByUserId: COORDINATOR_ID,
          reviewedAt: addMinutes(breakdown.at, 5),
        });
        evt('11', 'DRIVER_REPORT', breakdown.at, { actorUserId: driverUserId, data: { reportId: breakdown.id } });
        evt('12', 'REPORT_REVIEWED', addMinutes(breakdown.at, 5), { actorUserId: COORDINATOR_ID, data: { reportId: breakdown.id } });
      }

      // ── attribution ledger (FINAL) ──
      const sourceKey = (c: Component) =>
        c.key === 'DISR' ? `DISR:${disruption?.id}` : c.key === 'RPT' ? `RPT:${breakdown?.id}` : c.key;
      const reasonOf = (c: Component) =>
        c.key === 'GATE' ? 'PLANT_GATE_WAIT' : c.key === 'HIST' ? 'TRANSPORTER_PACE' : c.key === 'RPT' ? 'BREAKDOWN' : disruption?.weather ? 'HEAVY_RAIN' : 'ROAD_CLOSED';
      for (const c of comps) {
        rows.attributions.push({
          id: `hatt_${n}_${c.key}`,
          shipmentId,
          sourceKey: sourceKey(c),
          kind: 'TIME_LOST',
          factor: c.key,
          reason: reasonOf(c),
          party: c.party,
          delaySeconds: c.minutes * 60,
          status: 'FINAL',
          disruptionId: c.key === 'DISR' ? (disruption?.id ?? null) : null,
          driverReportId: c.key === 'RPT' ? (breakdown?.id ?? null) : null,
          updatedAtSim: arrivedAt,
        });
      }
      if (winMin > 0) {
        const byParty: Partial<Record<Party, number>> = {};
        for (const c of comps) byParty[c.party] = (byParty[c.party] ?? 0) + c.minutes;
        const split = splitKnockOn(winMin, byParty);
        for (const [party, minutes] of Object.entries(split) as [Party, number][]) {
          rows.attributions.push({
            id: `hatt_${n}_WIN_${party}`,
            shipmentId,
            sourceKey: 'WIN',
            kind: 'TIME_LOST',
            factor: 'WIN',
            reason: 'RECEIVING_WINDOW',
            party,
            delaySeconds: minutes * 60,
            status: 'FINAL',
            updatedAtSim: arrivedAt,
          });
        }
      }

      // ── alert history (only shipments whose known delay crossed the promise) ──
      if (firstAtRiskAt) {
        const alertId = `halt_${n}`;
        const top = [...knowledge].filter((c) => c.knownAt.getTime() <= firstAtRiskAt.getTime()).sort((a, b) => b.minutes - a.minutes)[0];
        const recovered = breakdown?.recovered === true;
        const optionId = recovered ? `hopt_${n}` : null;
        const chosenAt = recovered && breakdown ? addMinutes(breakdown.at, 15) : null;
        rows.alerts.push({
          id: alertId,
          shipmentId,
          status: 'RESOLVED',
          openedAt: firstAtRiskAt,
          resolvedAt: arrivedAt,
          topFactor: top?.key ?? null,
          topReason: top ? reasonOf(top) : null,
          proposedOptionId: optionId,
          chosenOptionId: optionId,
          chosenByUserId: recovered ? COORDINATOR_ID : null,
          chosenAt,
          customerResponse: recovered ? 'ACCEPT_PROPOSAL' : null,
          customerRespondedAt: recovered && chosenAt ? addMinutes(chosenAt, -5) : null,
          customerRespondedByUserId: null,
        });
        evt('20', 'ALERT_OPENED', firstAtRiskAt, { data: { alertId } });
        evt('21', 'CUSTOMER_NOTIFIED', firstAtRiskAt, { data: { alertId } });
        evt('29', 'ALERT_RESOLVED', arrivedAt, { data: { alertId } });

        const notify = (k: string, audience: 'COORDINATOR' | 'CUSTOMER', kind: 'AT_RISK' | 'AT_RISK_CUSTOMER' | 'RECOVERY_CONFIRMED' | 'PLAN_UPDATED', at: Date, text: string) =>
          rows.notifications.push({
            id: `hntf_${n}_${k}`,
            audience,
            customerId: audience === 'CUSTOMER' ? lane.customerId : null,
            shipmentId,
            alertId,
            kind,
            templateKey: `notif.${kind}`,
            params: { shipmentCode: `SHP-H${n}` },
            text,
            simTime: at,
            readAt: addMinutes(at, 30),
          });
        notify('a1', 'COORDINATOR', 'AT_RISK', firstAtRiskAt, `SHP-H${n} is at risk of missing the promised time.`);
        notify('a2', 'CUSTOMER', 'AT_RISK_CUSTOMER', firstAtRiskAt, `Order ORD-H${n} is at risk of missing the promised time.`);

        if (recovered && breakdown && optionId && chosenAt) {
          rows.recoveryOptions.push({
            id: optionId,
            shipmentId,
            alertId,
            optionSetId: `hset_${n}`,
            createdAtSim: breakdown.at,
            kind: 'REPLACEMENT_TRUCK',
            feasible: true,
            newEtaAt: arrivedAt,
            meetsPromise: onTime,
            minutesSavedVsNotify: breakdown.original - breakdown.applied,
            extraCostInr: RATE_CARD.dispatchInr + RATE_CARD.replacementKm * RATE_CARD.perKmInr + RATE_CARD.transferFeeInr,
            isSuggested: true,
            suggestionRule: 'Suggested = meets the current promise at the lowest estimated cost.',
            constraints: [],
            params: { historical: true },
            status: 'CHOSEN',
          });
          evt('22', 'CUSTOMER_RESPONDED', addMinutes(chosenAt, -5), { data: { alertId, response: 'ACCEPT_PROPOSAL' } });
          evt('23', 'RECOVERY_CHOSEN', chosenAt, { actorUserId: COORDINATOR_ID, data: { optionId, kind: 'REPLACEMENT_TRUCK' } });
          notify('r1', 'COORDINATOR', 'RECOVERY_CONFIRMED', chosenAt, `Recovery confirmed for SHP-H${n}: replacement truck.`);
          notify('r2', 'CUSTOMER', 'PLAN_UPDATED', chosenAt, `Plant X confirmed a replacement truck for order ORD-H${n}.`);
        }
      }

      if (!onTime) {
        const late = (k: string, audience: 'COORDINATOR' | 'CUSTOMER', text: string) =>
          rows.notifications.push({
            id: `hntf_${n}_${k}`,
            audience,
            customerId: audience === 'CUSTOMER' ? lane.customerId : null,
            shipmentId,
            alertId: firstAtRiskAt ? `halt_${n}` : null,
            kind: 'ARRIVED_LATE',
            templateKey: 'notif.ARRIVED_LATE',
            params: { shipmentCode: `SHP-H${n}`, delayMinutes },
            text,
            simTime: arrivedAt,
            readAt: addMinutes(arrivedAt, 30),
          });
        late('l1', 'COORDINATOR', `SHP-H${n} arrived ${delayMinutes} min after the promised time.`);
        late('l2', 'CUSTOMER', `Order ORD-H${n} arrived ${delayMinutes} min after the promised time.`);
      }
    }
  }
}
