/**
 * DEVELOPMENT MOCK — shipment fixtures for `vite --mode mock`.
 *
 * Hero SHP-1042 values are taken from 08_ETA_AND_RISK_ENGINE.md §10 Examples 2–3 and journeys §3 [doc]:
 *   stage 0  Thu 10:30 before the rain   predicted 14:20, slack 220, ON_TRACK
 *   stage 1  Thu 10:30 rain injected     predicted 16:20, slack 100, WATCH
 *   stage 2  Thu 11:10 breakdown report  predicted Fri 08:00 (road arrival 19:20), slack −840, AT_RISK
 *   stage 3  Thu 11:25 replacement truck predicted 17:50, slack 10, WATCH
 * Score = clamp(round(50 − slack ÷ 6)) and range rounding (nearest 5, halves up) were applied BY HAND
 * from 08 §2 when writing these fixtures; nothing is calculated at runtime. Background shipments are
 * [mock] illustrative values that satisfy the same identity (checked by mocks/shipments.test.ts).
 */
import type { Confidence, EventSource, Factor, Milestone, RiskLevel } from '../api/contract';
import { ist } from './world';

export interface MockEta {
  predictedArrivalAt: string;
  etaLowAt: string;
  etaHighAt: string;
  projectedRoadArrivalAt: string;
  slackMinutes: number;
  level: RiskLevel;
  score: number;
  confidence: Confidence;
  confidenceReason: string;
  summary: string;
  factors: Factor[];
  receivingWindow: { opensAt: string; closesAt: string; overrideEndAt: string | null };
  /** Customer-safe reason (no parties or codes). */
  plainReason: string | null;
}

export interface MockShipment {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  customerId: string;
  laneId: string;
  routeId: string;
  transporterId: string;
  truckCode: string | null;
  driverUserId: string | null;
  driverName: string | null;
  items: { orderLineId: string; gradeCode: string; quantityT: number; isUrgent: boolean }[];
  plannedArrivalAt: string;
  promisedBy: string;
  originalPromisedBy: string;
  milestones: { milestone: Milestone; at: string; source: EventSource; actorName: string | null }[];
  eta: MockEta | null;
  progressPct: number;
  stopped: boolean;
  stoppedUntil: string | null;
  lastUpdateAt: string | null;
  firstAtRiskAt: string | null;
  customerNotifiedAt: string | null;
  physicalArrivalAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  onTime: boolean | null;
  delayMinutes: number | null;
  pendingReportCount: number;
  plainStatus: string;
}

function f(
  code: Factor['code'],
  phase: Factor['phase'],
  minutes: number,
  party: Factor['party'],
  reason: Factor['reason'],
  label: string,
  detail: string,
  extra: Partial<Factor> = {},
): Factor {
  return { code, phase, minutes, party, split: null, reason, label, detail, sourceRef: null, reviewStatus: null, ...extra };
}

const thuWindow = { opensAt: ist('08:00'), closesAt: ist('18:00'), overrideEndAt: null };

// ---------------- Hero SHP-1042 ----------------

const heroBase: Omit<MockShipment, 'eta' | 'milestones'> & { milestones: MockShipment['milestones'] } = {
  id: 'shp-1042',
  code: 'SHP-1042',
  orderId: 'ord-7781',
  orderCode: 'ORD-7781',
  customerId: 'cus-kestrel',
  laneId: 'lane-pune',
  routeId: 'rte-pune-a',
  transporterId: 'trn-ghatline',
  truckCode: 'TRK-07',
  driverUserId: 'usr-ramesh',
  driverName: 'Ramesh',
  items: [
    { orderLineId: 'ol-7781-1', gradeCode: 'PX-PP 110', quantityT: 14, isUrgent: false },
    { orderLineId: 'ol-7781-2', gradeCode: 'PX-HD 520', quantityT: 8, isUrgent: true },
  ],
  plannedArrivalAt: ist('13:20'),
  promisedBy: ist('18:00'),
  originalPromisedBy: ist('18:00'),
  milestones: [
    { milestone: 'ORDER_CONFIRMED', at: ist('16:00', -1), source: 'SEED', actorName: null },
    { milestone: 'TRUCK_ASSIGNED', at: ist('07:30'), source: 'SEED', actorName: null },
    { milestone: 'AT_GATE', at: ist('08:10'), source: 'DRIVER', actorName: 'Ramesh' },
    { milestone: 'LOADING', at: ist('08:50'), source: 'SIMULATION', actorName: null },
    { milestone: 'GATE_OUT', at: ist('09:30'), source: 'DRIVER', actorName: 'Ramesh' },
    { milestone: 'IN_TRANSIT', at: ist('09:30'), source: 'SYSTEM', actorName: null },
  ],
  progressPct: 23,
  stopped: false,
  stoppedUntil: null,
  lastUpdateAt: ist('10:30'),
  firstAtRiskAt: null,
  customerNotifiedAt: null,
  physicalArrivalAt: null,
  arrivedAt: null,
  deliveredAt: null,
  onTime: null,
  delayMinutes: null,
  pendingReportCount: 0,
  plainStatus: 'On the way · expected 14:20',
};

const GATE_40 = f('GATE', 'INCURRED', 40, 'PLANT', 'PLANT_GATE_WAIT', 'Plant gate & loading wait', 'All bays busy; loading ran 08:50–09:30 · +40 min');
const HIST_LABEL = 'Ghatline Carriers pace on this lane';
const RAIN = { type: 'DISRUPTION' as const, id: 'dis-rain' };
const REPORT = { type: 'DRIVER_REPORT' as const, id: 'rpt-1' };

export const HERO_STAGES: MockShipment[] = [
  {
    ...heroBase,
    eta: {
      predictedArrivalAt: ist('14:20'),
      etaLowAt: ist('14:10'),
      etaHighAt: ist('14:30'), // 5% of 230 min = 11.5 → ±10
      projectedRoadArrivalAt: ist('14:20'),
      slackMinutes: 220,
      level: 'ON_TRACK',
      score: 13,
      confidence: 'HIGH',
      confidenceReason: 'Last update under 1 hour ago; no pending reports.',
      summary: 'On track: 3 h 40 m spare before the promised time.',
      factors: [
        GATE_40,
        f('HIST', 'INCURRED', 4, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Lane history pace 0.93 · +4 min so far'),
        f('HIST', 'EXPECTED', 16, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Pace 0.93 on 214 baseline min remaining · +16 min'),
      ],
      receivingWindow: thuWindow,
      plainReason: null,
    },
  },
  {
    ...heroBase,
    plainStatus: 'On the way · expected 16:20',
    eta: {
      predictedArrivalAt: ist('16:20'),
      etaLowAt: ist('16:00'),
      etaHighAt: ist('16:40'), // 5% of 350 = 17.5 → ±20
      projectedRoadArrivalAt: ist('16:20'),
      slackMinutes: 100,
      level: 'WATCH',
      score: 33,
      confidence: 'HIGH',
      confidenceReason: 'Last update under 1 hour ago; no pending reports.',
      summary: 'Watch: +120 min heavy rain on the ghat section is the largest factor.',
      factors: [
        GATE_40,
        f('HIST', 'INCURRED', 4, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Lane history pace 0.93 · +4 min so far'),
        f('HIST', 'EXPECTED', 16, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Pace 0.93 on 214 baseline min remaining · +16 min'),
        f('DISR', 'EXPECTED', 120, 'EXTERNAL', 'HEAVY_RAIN', 'Heavy rain on ghat section', 'Ghat section 65% slower until 18:30 · +120 min', { sourceRef: RAIN }),
      ],
      receivingWindow: thuWindow,
      plainReason: 'Heavy rain on the route',
    },
  },
  {
    ...heroBase,
    progressPct: 37,
    stopped: true,
    stoppedUntil: ist('14:10'),
    lastUpdateAt: ist('11:10'),
    firstAtRiskAt: ist('11:10'),
    customerNotifiedAt: ist('11:10'),
    pendingReportCount: 1,
    plainStatus: 'Delayed · Plant X team is reviewing options',
    eta: {
      predictedArrivalAt: ist('08:00', 1),
      etaLowAt: ist('06:35', 1),
      etaHighAt: ist('09:25', 1), // 5% of 1,250 = 62.5 + 20 pending = 82.5 → ±85 [doc]
      projectedRoadArrivalAt: ist('19:20'),
      slackMinutes: -840,
      level: 'AT_RISK',
      score: 100,
      confidence: 'MEDIUM',
      confidenceReason: 'A driver report is pending coordinator review.',
      summary: 'At risk: +180 min breakdown is the largest factor.',
      factors: [
        GATE_40,
        f('HIST', 'INCURRED', 7, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Lane history pace 0.93 · +7 min so far'),
        f('DISR', 'INCURRED', 2, 'EXTERNAL', 'HEAVY_RAIN', 'Heavy rain on ghat section', '3 min on the ghat in rain so far · +2 min', { sourceRef: RAIN }),
        f('HIST', 'EXPECTED', 13, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Pace 0.93 on 179 baseline min remaining · +13 min'),
        f('DISR', 'EXPECTED', 118, 'EXTERNAL', 'HEAVY_RAIN', 'Heavy rain on ghat section', 'Remaining ghat in rain until 18:30 · +118 min', { sourceRef: RAIN }),
        f('RPT', 'EXPECTED', 180, 'TRANSPORTER', 'BREAKDOWN', 'Breakdown reported by driver', '"tyre puncture near Lonavala" · Breakdown default 180 min', {
          sourceRef: REPORT,
          reviewStatus: 'PENDING_REVIEW',
        }),
        f('WIN', 'EXPECTED', 760, null, 'RECEIVING_WINDOW', 'Receiving window (knock-on)', 'Road arrival 19:20 is after the 18:00 close · waits until Fri 08:00', {
          split: [
            { party: 'PLANT', minutes: 85 },
            { party: 'TRANSPORTER', minutes: 422 },
            { party: 'EXTERNAL', minutes: 253 },
          ],
        }),
      ],
      receivingWindow: thuWindow,
      plainReason: 'Vehicle breakdown on the route',
    },
  },
  {
    ...heroBase,
    truckCode: 'TRK-11',
    driverUserId: 'usr-vikram',
    driverName: 'Vikram',
    progressPct: 37,
    stopped: true,
    stoppedUntil: ist('12:40'),
    lastUpdateAt: ist('11:25'),
    firstAtRiskAt: ist('11:10'),
    customerNotifiedAt: ist('11:10'),
    pendingReportCount: 1,
    plainStatus: 'On the way after a truck change · expected 17:50',
    eta: {
      predictedArrivalAt: ist('17:50'),
      etaLowAt: ist('17:10'),
      etaHighAt: ist('18:30'), // 5% of 385 = 19.25 + 20 pending = 39.25 → ±40
      projectedRoadArrivalAt: ist('17:50'),
      slackMinutes: 10,
      level: 'WATCH',
      score: 48,
      confidence: 'MEDIUM',
      confidenceReason: 'A driver report is pending coordinator review.',
      summary: 'Watch: replacement truck chosen; 10 min spare before the promised time.',
      factors: [
        GATE_40,
        f('HIST', 'INCURRED', 7, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Lane history pace 0.93 · +7 min so far'),
        f('DISR', 'INCURRED', 2, 'EXTERNAL', 'HEAVY_RAIN', 'Heavy rain on ghat section', '3 min on the ghat in rain so far · +2 min', { sourceRef: RAIN }),
        f('RPT', 'INCURRED', 15, 'TRANSPORTER', 'BREAKDOWN', 'Breakdown reported by driver', 'Stopped since 11:10 · +15 min so far', {
          sourceRef: REPORT,
          reviewStatus: 'PENDING_REVIEW',
        }),
        f('HIST', 'EXPECTED', 13, 'TRANSPORTER', 'TRANSPORTER_PACE', HIST_LABEL, 'Pace 0.93 on 179 baseline min remaining · +13 min'),
        f('DISR', 'EXPECTED', 118, 'EXTERNAL', 'HEAVY_RAIN', 'Heavy rain on ghat section', 'Remaining ghat in rain until 18:30 · +118 min', { sourceRef: RAIN }),
        f('RPT', 'EXPECTED', 75, 'TRANSPORTER', 'BREAKDOWN', 'Breakdown reported by driver', 'Replacement TRK-11 from Khopoli: moving again 12:40 · +75 min', {
          sourceRef: REPORT,
          reviewStatus: 'PENDING_REVIEW',
        }),
      ],
      receivingWindow: thuWindow,
      plainReason: 'Vehicle breakdown on the route; a replacement truck has taken over',
    },
  },
];

// ---------------- Background shipments [mock] at Thu 10:30 ----------------

function hist(phase: Factor['phase'], minutes: number, transporter: string): Factor {
  return f('HIST', phase, minutes, 'TRANSPORTER', 'TRANSPORTER_PACE', `${transporter} pace on this lane`, `Lane history · +${minutes} min${phase === 'INCURRED' ? ' so far' : ''}`);
}

const doneThrough = (
  steps: [Milestone, string, EventSource][],
): MockShipment['milestones'] => steps.map(([milestone, at, source]) => ({ milestone, at, source, actorName: null }));

const HIGH_REASON = 'Last update under 1 hour ago; no pending reports.';

export const BACKGROUND: MockShipment[] = [
  {
    // Engine doc Example 1 (Plant X → Nashik) at 10:30 [doc values; minutes moved from E to I]
    id: 'shp-1038', code: 'SHP-1038', orderId: 'ord-7779', orderCode: 'ORD-7779', customerId: 'cus-heronfield',
    laneId: 'lane-nashik', routeId: 'rte-nashik-a', transporterId: 'trn-bluefinch', truckCode: 'TRK-21',
    driverUserId: null, driverName: 'Sanjay',
    items: [{ orderLineId: 'ol-7779-1', gradeCode: 'PX-PP 110', quantityT: 22, isUrgent: false }],
    plannedArrivalAt: ist('11:30'), promisedBy: ist('14:00'), originalPromisedBy: ist('14:00'),
    milestones: doneThrough([['ORDER_CONFIRMED', ist('11:00', -1), 'SEED'], ['TRUCK_ASSIGNED', ist('06:00'), 'SEED'], ['AT_GATE', ist('07:20'), 'SIMULATION'], ['LOADING', ist('07:20'), 'SIMULATION'], ['GATE_OUT', ist('08:00'), 'SIMULATION'], ['IN_TRANSIT', ist('08:00'), 'SYSTEM']]),
    eta: {
      predictedArrivalAt: ist('11:41'), etaLowAt: ist('11:36'), etaHighAt: ist('11:46'), projectedRoadArrivalAt: ist('11:41'),
      slackMinutes: 139, level: 'ON_TRACK', score: 27, confidence: 'HIGH', confidenceReason: HIGH_REASON,
      summary: 'On track: 2 h 19 m spare before the promised time.',
      factors: [hist('INCURRED', 7, 'Bluefinch Freight'), hist('EXPECTED', 4, 'Bluefinch Freight')],
      receivingWindow: thuWindow, plainReason: null,
    },
    progressPct: 68, stopped: false, stoppedUntil: null, lastUpdateAt: ist('10:00'), firstAtRiskAt: null, customerNotifiedAt: null,
    physicalArrivalAt: null, arrivedAt: null, deliveredAt: null, onTime: null, delayMinutes: null, pendingReportCount: 0,
    plainStatus: 'On the way · expected 11:41',
  },
  {
    id: 'shp-1044', code: 'SHP-1044', orderId: 'ord-7783', orderCode: 'ORD-7783', customerId: 'cus-larkspur',
    laneId: 'lane-surat', routeId: 'rte-surat-a', transporterId: 'trn-saltpan', truckCode: 'TRK-41',
    driverUserId: null, driverName: 'Imran',
    items: [{ orderLineId: 'ol-7783-1', gradeCode: 'PX-LL 218', quantityT: 21, isUrgent: false }],
    plannedArrivalAt: ist('13:00'), promisedBy: ist('15:00'), originalPromisedBy: ist('15:00'),
    milestones: doneThrough([['ORDER_CONFIRMED', ist('09:00', -1), 'SEED'], ['TRUCK_ASSIGNED', ist('05:30'), 'SEED'], ['AT_GATE', ist('06:40'), 'SIMULATION'], ['LOADING', ist('07:05'), 'SIMULATION'], ['GATE_OUT', ist('07:55'), 'SIMULATION'], ['IN_TRANSIT', ist('07:55'), 'SYSTEM']]),
    eta: {
      predictedArrivalAt: ist('13:50'), etaLowAt: ist('13:40'), etaHighAt: ist('14:00'), projectedRoadArrivalAt: ist('13:50'),
      slackMinutes: 70, level: 'WATCH', score: 38, confidence: 'HIGH', confidenceReason: HIGH_REASON,
      summary: 'Watch: +25 min plant gate wait is the largest factor.',
      factors: [
        f('GATE', 'INCURRED', 25, 'PLANT', 'PLANT_GATE_WAIT', 'Plant gate & loading wait', 'Waited for a free bay 06:40–07:05 · +25 min'),
        hist('INCURRED', 10, 'Saltpan Roadways'),
        hist('EXPECTED', 15, 'Saltpan Roadways'),
      ],
      receivingWindow: { opensAt: ist('07:00'), closesAt: ist('19:00'), overrideEndAt: null }, plainReason: 'Loading took longer at the plant',
    },
    progressPct: 55, stopped: false, stoppedUntil: null, lastUpdateAt: ist('10:15'), firstAtRiskAt: null, customerNotifiedAt: null,
    physicalArrivalAt: null, arrivedAt: null, deliveredAt: null, onTime: null, delayMinutes: null, pendingReportCount: 0,
    plainStatus: 'On the way · expected 13:50',
  },
  {
    id: 'shp-1039', code: 'SHP-1039', orderId: 'ord-7776', orderCode: 'ORD-7776', customerId: 'cus-wrenbrook',
    laneId: 'lane-ahmedabad', routeId: 'rte-ahmedabad-a', transporterId: 'trn-bluefinch', truckCode: 'TRK-22',
    driverUserId: null, driverName: 'Harpreet',
    items: [{ orderLineId: 'ol-7776-1', gradeCode: 'PX-HD 520', quantityT: 24, isUrgent: false }],
    plannedArrivalAt: ist('15:30'), promisedBy: ist('17:00'), originalPromisedBy: ist('17:00'),
    milestones: doneThrough([['ORDER_CONFIRMED', ist('08:00', -1), 'SEED'], ['TRUCK_ASSIGNED', ist('04:00'), 'SEED'], ['AT_GATE', ist('05:10'), 'SIMULATION'], ['LOADING', ist('05:20'), 'SIMULATION'], ['GATE_OUT', ist('06:00'), 'SIMULATION'], ['IN_TRANSIT', ist('06:00'), 'SYSTEM']]),
    eta: {
      predictedArrivalAt: ist('16:00'), etaLowAt: ist('15:45'), etaHighAt: ist('16:15'), projectedRoadArrivalAt: ist('16:00'),
      slackMinutes: 60, level: 'WATCH', score: 40, confidence: 'HIGH', confidenceReason: HIGH_REASON,
      summary: 'Watch: +30 min transporter lane history is the largest factor.',
      factors: [hist('INCURRED', 12, 'Bluefinch Freight'), hist('EXPECTED', 18, 'Bluefinch Freight')],
      receivingWindow: thuWindow, plainReason: 'Slower progress than planned',
    },
    progressPct: 50, stopped: false, stoppedUntil: null, lastUpdateAt: ist('10:20'), firstAtRiskAt: null, customerNotifiedAt: null,
    physicalArrivalAt: null, arrivedAt: null, deliveredAt: null, onTime: null, delayMinutes: null, pendingReportCount: 0,
    plainStatus: 'On the way · expected 16:00',
  },
  {
    id: 'shp-1045', code: 'SHP-1045', orderId: 'ord-7785', orderCode: 'ORD-7785', customerId: 'cus-tealstone',
    laneId: 'lane-indore', routeId: 'rte-indore-a', transporterId: 'trn-monsoon', truckCode: 'TRK-51',
    driverUserId: null, driverName: 'Prakash',
    items: [
      { orderLineId: 'ol-7785-1', gradeCode: 'PX-HD 520', quantityT: 12, isUrgent: false },
      { orderLineId: 'ol-7785-2', gradeCode: 'PX-PP 110', quantityT: 10, isUrgent: false },
    ],
    plannedArrivalAt: ist('08:00', 1), promisedBy: ist('12:00', 1), originalPromisedBy: ist('12:00', 1),
    milestones: doneThrough([['ORDER_CONFIRMED', ist('14:00', -1), 'SEED'], ['TRUCK_ASSIGNED', ist('09:45'), 'SEED']]),
    eta: {
      predictedArrivalAt: ist('08:25', 1), etaLowAt: ist('07:20', 1), etaHighAt: ist('09:30', 1), projectedRoadArrivalAt: ist('08:25', 1),
      slackMinutes: 215, level: 'ON_TRACK', score: 14, confidence: 'HIGH', confidenceReason: HIGH_REASON,
      summary: 'On track: 3 h 35 m spare before the promised time.',
      factors: [hist('EXPECTED', 25, 'Monsoon Movers')],
      receivingWindow: { opensAt: ist('08:00', 1), closesAt: ist('18:00', 1), overrideEndAt: null }, plainReason: null,
    },
    progressPct: 0, stopped: false, stoppedUntil: null, lastUpdateAt: ist('09:45'), firstAtRiskAt: null, customerNotifiedAt: null,
    physicalArrivalAt: null, arrivedAt: null, deliveredAt: null, onTime: null, delayMinutes: null, pendingReportCount: 0,
    plainStatus: 'Truck assigned · expected Fri 08:25',
  },
  {
    // Low-confidence edge state (journeys J1): no update for more than 3 h.
    id: 'shp-1036', code: 'SHP-1036', orderId: 'ord-7772', orderCode: 'ORD-7772', customerId: 'cus-corvid',
    laneId: 'lane-nagpur', routeId: 'rte-nagpur-a', transporterId: 'trn-ironpeak', truckCode: 'TRK-31',
    driverUserId: null, driverName: 'Anil',
    items: [{ orderLineId: 'ol-7772-1', gradeCode: 'PX-PP 110', quantityT: 23, isUrgent: false }],
    plannedArrivalAt: ist('10:00'), promisedBy: ist('14:00'), originalPromisedBy: ist('14:00'),
    milestones: doneThrough([['ORDER_CONFIRMED', ist('09:00', -2), 'SEED'], ['TRUCK_ASSIGNED', ist('16:00', -1), 'SEED'], ['AT_GATE', ist('19:00', -1), 'SIMULATION'], ['LOADING', ist('19:20', -1), 'SIMULATION'], ['GATE_OUT', ist('20:00', -1), 'SIMULATION'], ['IN_TRANSIT', ist('20:00', -1), 'SYSTEM']]),
    eta: {
      predictedArrivalAt: ist('10:50'), etaLowAt: ist('10:20'), etaHighAt: ist('11:20'), projectedRoadArrivalAt: ist('10:50'),
      slackMinutes: 190, level: 'ON_TRACK', score: 18, confidence: 'LOW', confidenceReason: 'No update for more than 3 hours.',
      summary: 'On track: 3 h 10 m spare; no recent update, so the range is wider.',
      factors: [hist('INCURRED', 40, 'Ironpeak Haulage'), hist('EXPECTED', 10, 'Ironpeak Haulage')],
      receivingWindow: { opensAt: ist('08:00'), closesAt: ist('20:00'), overrideEndAt: null }, plainReason: null,
    },
    progressPct: 96, stopped: false, stoppedUntil: null, lastUpdateAt: ist('07:05'), firstAtRiskAt: null, customerNotifiedAt: null,
    physicalArrivalAt: null, arrivedAt: null, deliveredAt: null, onTime: null, delayMinutes: null, pendingReportCount: 0,
    plainStatus: 'On the way · expected 10:50',
  },
  {
    // L1 example: arrived inside the window at 09:50 (on time vs 10:00); unloading runs to 10:50.
    id: 'shp-1031', code: 'SHP-1031', orderId: 'ord-7770', orderCode: 'ORD-7770', customerId: 'cus-heronfield',
    laneId: 'lane-nashik', routeId: 'rte-nashik-a', transporterId: 'trn-saltpan', truckCode: 'TRK-42',
    driverUserId: null, driverName: 'Mahesh',
    items: [{ orderLineId: 'ol-7770-1', gradeCode: 'PX-LL 218', quantityT: 20, isUrgent: false }],
    plannedArrivalAt: ist('09:40'), promisedBy: ist('10:00'), originalPromisedBy: ist('10:00'),
    milestones: doneThrough([['ORDER_CONFIRMED', ist('10:00', -1), 'SEED'], ['TRUCK_ASSIGNED', ist('04:30'), 'SEED'], ['AT_GATE', ist('05:20'), 'SIMULATION'], ['LOADING', ist('05:30'), 'SIMULATION'], ['GATE_OUT', ist('06:10'), 'SIMULATION'], ['IN_TRANSIT', ist('06:10'), 'SYSTEM'], ['ARRIVED', ist('09:50'), 'DRIVER']]),
    eta: null,
    progressPct: 100, stopped: true, stoppedUntil: null, lastUpdateAt: ist('09:50'), firstAtRiskAt: null, customerNotifiedAt: null,
    physicalArrivalAt: ist('09:50'), arrivedAt: ist('09:50'), deliveredAt: null, onTime: true, delayMinutes: 0, pendingReportCount: 0,
    plainStatus: 'Arrived 09:50 · unloading',
  },
];
