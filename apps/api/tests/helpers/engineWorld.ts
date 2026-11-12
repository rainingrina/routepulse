import type { Segment } from '@routepulse/shared';
import { explainEta, projectWorld, type DisruptionInfo, type EtaResult } from '../../src/engines/eta.js';
import { rat } from '../../src/engines/rational.js';
import { toSimRoute, type SimRoute } from '../../src/engines/simRoute.js';
import { simulate, type SimDisruption, type SimShipment } from '../../src/engines/simulate.js';
import { istAt } from '../../src/engines/time.js';

/** Pure-engine harness for the Pune lane (seed values: 45/20/65 km, 90/60/120 min, B = 270). */
export const D = '2026-11-19';
export const s = (min: number) => Math.floor(istAt(D, min).getTime() / 1000);
export const hm = (h: number, m: number) => h * 60 + m;
export const CFG = { stepSec: 300, loadingSec: 2400, bays: 3 };
export const PACE = rat(270, 290); // Ghatline–Pune, derived from the seeded history (O-13)

const PUNE_SEGS: Segment[] = [
  { segmentCode: 'PLT-KHP', name: 'Plant to Khopoli', startKm: 0, endKm: 45, speedKmh: 30 },
  { segmentCode: 'KHP-LNV-GHAT', name: 'Ghat', startKm: 45, endKm: 65, speedKmh: 20 },
  { segmentCode: 'LNV-PUN', name: 'Lonavala to Pune', startKm: 65, endKm: 130, speedKmh: 32.5 },
];
export const ROUTE: SimRoute = toSimRoute('rt', PUNE_SEGS);
export const ROUTES = new Map([['rt', ROUTE]]);
export const PLANNED_ARRIVAL = s(hm(13, 20));

/** SHP-1042 just after its 09:30 gate-out: 40 min GATE already booked (08:50–09:30). */
export function heroAtGateOut(over: Partial<SimShipment> = {}): SimShipment {
  return {
    id: 'shp_1042', code: 'SHP-1042', autopilot: false, milestone: 'IN_TRANSIT', truckId: 'trk_07', routeId: 'rt',
    plannedGateS: s(hm(8, 10)), plannedDepS: s(hm(8, 50)), promisedByS: s(hm(18, 0)), overrideEndS: null,
    hours: { openMin: 480, closeMin: 1080 }, unloadingMin: 60, extraUnloadMin: 0, pace: PACE, progressMm: 0, stoppedUntilS: null,
    gateQueuedS: s(hm(8, 10)), loadingStartedS: s(hm(8, 50)), loadingEndS: s(hm(9, 30)), gateOutS: s(hm(9, 30)),
    physicalArrivalS: null, arrivedS: null, deliveredS: null, delayMinutes: null, onTime: null,
    lastUpdateS: s(hm(9, 30)), pingIntervalMin: 30, silentFromS: null, stopCause: null,
    ledger: { 'GATE|PLANT': 2400 }, planChangeByParty: {},
    ...over,
  };
}

export function disruption(over: Partial<SimDisruption> & Pick<SimDisruption, 'id' | 'kind'>): SimDisruption {
  return { segmentCodes: [], shipmentId: null, slowdownPct: null, extraMinutesPerTruck: null, startS: 0, endS: 0, party: 'EXTERNAL', reason: 'OTHER', createdS: over.startS ?? 0, label: over.id, ...over };
}
export const RAIN = disruption({ id: 'dis_rain', kind: 'WEATHER_SLOWDOWN', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, startS: s(hm(10, 30)), endS: s(hm(18, 30)), party: 'EXTERNAL', reason: 'HEAVY_RAIN', label: 'Heavy rain on ghat section' });
export const BREAKDOWN = disruption({ id: 'dis_bd', kind: 'TRUCK_BREAKDOWN', shipmentId: 'shp_1042', startS: s(hm(11, 10)), endS: s(hm(14, 10)), party: 'TRANSPORTER', reason: 'BREAKDOWN', label: 'Truck breakdown near Lonavala' });

export function settle(ships: SimShipment[], fromS: number, toS: number, disruptions: SimDisruption[] = []): SimShipment[] {
  return simulate({ shipments: ships, routes: ROUTES, disruptions, config: CFG, fromS, toS }).shipments;
}

export function infoMap(disruptions: readonly SimDisruption[]): Map<string, DisruptionInfo> {
  return new Map(disruptions.map((d) => [d.id, { id: d.id, kind: d.kind, label: d.label, party: d.party, reason: d.reason, segmentCodes: d.segmentCodes, slowdownPct: d.slowdownPct, startS: d.startS, endS: d.endS }]));
}

export function etaOf(ships: SimShipment[], id: string, nowS: number, disruptions: SimDisruption[] = [], opts: { pendingReports?: number; plannedArrivalS?: number } = {}): EtaResult {
  const now = ships.find((x) => x.id === id) as SimShipment;
  const projected = now.arrivedS !== null ? now : projectWorld({ shipments: ships, routes: ROUTES, disruptions, config: CFG, nowS }).get(id);
  if (!projected) throw new Error('no projection');
  return explainEta({
    now, projected, route: ROUTE, plannedArrivalS: opts.plannedArrivalS ?? PLANNED_ARRIVAL, nowS,
    pendingReports: opts.pendingReports ?? 0, disruptions: infoMap(disruptions), reports: new Map(),
  });
}
