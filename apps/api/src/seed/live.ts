/**
 * Live shipments at the seed start (Thu 08:00, paused) — 12 shipments including the hero SHP-1042.
 *
 * The seed writes only facts that are true at 08:00: plans, promises, trucks, drivers, and the
 * milestones already reached (source SEED). Nothing has departed yet, so there is no movement,
 * no incurred delay and no ETA. Cached ETA/risk fields stay null until the recalculation pipeline
 * (Milestones 4–5) computes them. The hero pre-script (08:00 → 10:25) runs through the real
 * simulation services in Milestone 4 (L2); it is deliberately NOT faked here.
 *
 * Gate arrangement at 08:00 (3 bays, 40 min loading [A]):
 *   bays busy until 08:10 (SHP-1036), 08:20 (SHP-1037), 08:30 (SHP-1038);
 *   queue: SHP-1039 (07:50), SHP-1040 (07:55), SHP-1041 (08:00).
 * With first-come-first-served bays, SHP-1042 (at gate 08:10) gets the first free bay at 08:50 =
 * its planned departure, so it leaves at 09:30 with 40 min of GATE delay (journeys §3).
 */
import { ENGINE_CONFIG } from '../config/engine.js';
import { addMinutes, istAt } from '../engines/time.js';
import { DEMO_DATE, seedPromise } from './constants.js';
import { CUSTOMER_RECEIVING, LANES, primaryRouteOf } from './referenceData.js';
import type { SeedRows } from './rows.js';

type LiveState = 'TRUCK_ASSIGNED' | 'AT_GATE' | 'LOADING';

interface LiveSpec {
  n: number; // shipment number → SHP-n
  orderNo: number; // ORD-n
  laneId: string;
  transporterId: string;
  truckId: string;
  driverUserId: string | null;
  plannedGateMin: number; // minutes after local midnight on the demo day
  state: LiveState;
  autopilot: boolean;
  lines: { grade: string; t: number; urgent?: boolean }[];
  promiseBufferMin?: number;
  promiseOverride?: Date;
  silentFromMin?: number;
}

const hm = (h: number, m: number) => h * 60 + m;

export const HERO_SHIPMENT_ID = 'shp_1042';

const LIVE: readonly LiveSpec[] = [
  { n: 1036, orderNo: 7775, laneId: 'lane_surat', transporterId: 'trn_coastway', truckId: 'trk_21', driverUserId: 'usr_drv_farhan', plannedGateMin: hm(7, 30), state: 'LOADING', autopilot: true, lines: [{ grade: 'PX-LD 210', t: 22 }] },
  { n: 1037, orderNo: 7776, laneId: 'lane_ahmedabad', transporterId: 'trn_ironroad', truckId: 'trk_41', driverUserId: 'usr_drv_joseph', plannedGateMin: hm(7, 40), state: 'LOADING', autopilot: true, lines: [{ grade: 'PX-PP 330', t: 16 }, { grade: 'PX-HD 520', t: 10 }] },
  { n: 1038, orderNo: 7777, laneId: 'lane_nagpur', transporterId: 'trn_northstar', truckId: 'trk_51', driverUserId: 'usr_drv_vikram', plannedGateMin: hm(7, 50), state: 'LOADING', autopilot: true, lines: [{ grade: 'PX-PP 110', t: 26 }] },
  { n: 1039, orderNo: 7778, laneId: 'lane_pune', transporterId: 'trn_bluehill', truckId: 'trk_31', driverUserId: 'usr_drv_anil', plannedGateMin: hm(7, 50), state: 'AT_GATE', autopilot: true, lines: [{ grade: 'PX-HD 520', t: 24 }] },
  { n: 1040, orderNo: 7779, laneId: 'lane_indore', transporterId: 'trn_ironroad', truckId: 'trk_42', driverUserId: null, plannedGateMin: hm(7, 55), state: 'AT_GATE', autopilot: true, lines: [{ grade: 'PX-LD 210', t: 18 }, { grade: 'PX-PP 110', t: 8 }] },
  { n: 1041, orderNo: 7780, laneId: 'lane_pune', transporterId: 'trn_northstar', truckId: 'trk_52', driverUserId: 'usr_drv_deepak', plannedGateMin: hm(8, 0), state: 'AT_GATE', autopilot: true, lines: [{ grade: 'PX-PP 330', t: 25 }] },
  // Hero: manual milestones (D7); promise Thu 18:00 at the receiving gate (L1).
  { n: 1042, orderNo: 7781, laneId: 'lane_pune', transporterId: 'trn_ghatline', truckId: 'trk_07', driverUserId: 'usr_drv_ramesh', plannedGateMin: hm(8, 10), state: 'TRUCK_ASSIGNED', autopilot: false, lines: [{ grade: 'PX-PP 110', t: 14 }, { grade: 'PX-HD 520', t: 8, urgent: true }], promiseOverride: istAt(DEMO_DATE, hm(18, 0)) },
  { n: 1043, orderNo: 7782, laneId: 'lane_nashik', transporterId: 'trn_bluehill', truckId: 'trk_32', driverUserId: 'usr_drv_gopal', plannedGateMin: hm(8, 40), state: 'TRUCK_ASSIGNED', autopilot: true, lines: [{ grade: 'PX-PP 110', t: 20 }] },
  { n: 1044, orderNo: 7783, laneId: 'lane_surat', transporterId: 'trn_coastway', truckId: 'trk_22', driverUserId: null, plannedGateMin: hm(9, 0), state: 'TRUCK_ASSIGNED', autopilot: true, lines: [{ grade: 'PX-HD 520', t: 21 }] },
  // Silent from 11:00 so the demo can show Low confidence (spec §5.4, AC-M3.6).
  { n: 1045, orderNo: 7784, laneId: 'lane_nagpur', transporterId: 'trn_northstar', truckId: 'trk_53', driverUserId: null, plannedGateMin: hm(9, 20), state: 'TRUCK_ASSIGNED', autopilot: true, lines: [{ grade: 'PX-LD 210', t: 25 }], silentFromMin: hm(11, 0) },
  { n: 1046, orderNo: 7785, laneId: 'lane_pune', transporterId: 'trn_bluehill', truckId: 'trk_33', driverUserId: null, plannedGateMin: hm(9, 40), state: 'TRUCK_ASSIGNED', autopilot: true, lines: [{ grade: 'PX-PP 330', t: 12 }, { grade: 'PX-PP 110', t: 12 }] },
  { n: 1047, orderNo: 7786, laneId: 'lane_indore', transporterId: 'trn_northstar', truckId: 'trk_54', driverUserId: null, plannedGateMin: hm(10, 0), state: 'TRUCK_ASSIGNED', autopilot: true, lines: [{ grade: 'PX-HD 520', t: 23 }] },
];

const gradeSlug = (g: string) => g.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

export function addLiveShipments(rows: SeedRows): void {
  for (const s of LIVE) {
    const lane = LANES.find((l) => l.id === s.laneId);
    if (!lane) throw new Error(`unknown lane ${s.laneId}`);
    const route = primaryRouteOf(s.laneId);
    const shipmentId = `shp_${s.n}`;
    const orderId = `ord_${s.orderNo}`;

    const plannedGateAt = istAt(DEMO_DATE, s.plannedGateMin);
    const plannedDepartureAt = addMinutes(plannedGateAt, ENGINE_CONFIG.loadingMinutes);
    const plannedArrivalAt = addMinutes(plannedDepartureAt, route.baselineMinutes);
    const promisedBy = s.promiseOverride ?? seedPromise(plannedArrivalAt, s.promiseBufferMin ?? 120);
    const placedAt = addMinutes(istAt(DEMO_DATE, hm(10, 0)), -2 * 1440);
    const assignedAt = addMinutes(istAt(DEMO_DATE, hm(16, 0)), -1440);

    rows.orders.push({ id: orderId, code: `ORD-${s.orderNo}`, customerId: lane.customerId, promisedBy, placedAt });
    for (const line of s.lines) {
      const lineId = `oln_${s.orderNo}_${gradeSlug(line.grade)}`;
      rows.orderLines.push({ id: lineId, orderId, gradeCode: line.grade, quantityT: line.t, isUrgent: line.urgent ?? false });
      rows.shipmentItems.push({ id: `sit_${s.n}_${gradeSlug(line.grade)}`, shipmentId, orderLineId: lineId, quantityT: line.t });
    }

    const atGate = s.state === 'AT_GATE' || s.state === 'LOADING';
    rows.shipments.push({
      id: shipmentId,
      code: `SHP-${s.n}`,
      orderId,
      laneId: s.laneId,
      routeId: route.id,
      transporterId: s.transporterId,
      truckId: s.truckId,
      driverUserId: s.driverUserId,
      autopilot: s.autopilot,
      isHistorical: false,
      currentMilestone: s.state,
      plannedGateAt,
      plannedDepartureAt,
      plannedArrivalAt,
      promisedBy,
      originalPromisedBy: promisedBy,
      gateQueuedAt: atGate ? plannedGateAt : null,
      loadingStartedAt: s.state === 'LOADING' ? plannedGateAt : null,
      lastUpdateAt: atGate ? plannedGateAt : null,
      pingIntervalMinutes: ENGINE_CONFIG.pingIntervalMinutes,
      silentFrom: s.silentFromMin !== undefined ? istAt(DEMO_DATE, s.silentFromMin) : null,
    });

    const ev = (suffix: string, milestone: 'ORDER_CONFIRMED' | 'TRUCK_ASSIGNED' | 'AT_GATE' | 'LOADING', at: Date) =>
      rows.events.push({ id: `evt_${s.n}_${suffix}`, shipmentId, type: 'MILESTONE', milestone, simTime: at, source: 'SEED', data: {} });
    ev('01', 'ORDER_CONFIRMED', placedAt);
    ev('02', 'TRUCK_ASSIGNED', assignedAt);
    if (atGate) ev('03', 'AT_GATE', plannedGateAt);
    if (s.state === 'LOADING') ev('04', 'LOADING', plannedGateAt);
  }
}

/** Receiving hours used for every seeded customer [A]. */
export const LIVE_RECEIVING = CUSTOMER_RECEIVING;
