import { describe, expect, it } from 'vitest';
import { istAt, istMinuteOfDay } from '../../src/engines/time.js';
import { isLineString, routeProblems, segmentBaselineMinutes } from '../../src/guards/geo.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import { BUILT_ROUTES, GEOMETRY_SOURCE } from '../../src/seed/referenceData.js';
import { buildSeedRows } from '../../src/seed/seed.js';

const rowsA = buildSeedRows('HASH');
const rowsB = buildSeedRows('HASH');

describe('seed data is deterministic (pure build)', () => {
  it('builds byte-identical rows on two runs', () => {
    expect(JSON.stringify(rowsA)).toBe(JSON.stringify(rowsB));
  });

  it('gives every row an explicit, unique id', () => {
    for (const [table, list] of Object.entries(rowsA)) {
      const ids = (list as { id?: string }[]).map((r) => r.id);
      expect(ids.every((id) => typeof id === 'string' && id.length > 0), table).toBe(true);
      expect(new Set(ids).size, table).toBe(ids.length);
    }
  });
});

describe('routes (hand-traced demo geometry, task 4.1)', () => {
  it('pass the structural checks and are labelled as hand-traced', () => {
    for (const r of BUILT_ROUTES) {
      expect(routeProblems(r)).toEqual([]);
      expect(isLineString(r.geometry)).toBe(true);
      expect(r.geometry.x_source).toBe(GEOMETRY_SOURCE);
    }
  });

  it('give the Pune primary route a 270-min baseline with the ghat at baseline minutes 90–150', () => {
    const pune = BUILT_ROUTES.find((r) => r.code === 'RT-PUNE-A');
    expect(pune?.baselineMinutes).toBe(270);
    const mins = pune?.segments.map(segmentBaselineMinutes) ?? [];
    expect(mins).toEqual([90, 60, 120]);
    expect(pune?.segments[1]?.segmentCode).toBe('KHP-LNV-GHAT');
  });

  it('give the Pune alternate a 360-min baseline sharing the first segment (reroute divergence)', () => {
    const alt = BUILT_ROUTES.find((r) => r.code === 'RT-PUNE-B');
    expect(alt?.baselineMinutes).toBe(360);
    expect(alt?.segments[0]?.segmentCode).toBe('PLT-KHP');
  });
});

describe('hero SHP-1042 seed facts (journeys §3, engine doc Example 2)', () => {
  const hero = rowsA.shipments.find((s) => s.code === 'SHP-1042');
  const at = (v: unknown) => new Date(v as Date);

  it('has the documented plan and promise', () => {
    expect(hero).toBeDefined();
    expect(at(hero?.plannedGateAt).getTime()).toBe(istAt(DEMO_DATE, 8 * 60 + 10).getTime());
    expect(at(hero?.plannedDepartureAt).getTime()).toBe(istAt(DEMO_DATE, 8 * 60 + 50).getTime());
    expect(at(hero?.plannedArrivalAt).getTime()).toBe(istAt(DEMO_DATE, 13 * 60 + 20).getTime());
    expect(at(hero?.promisedBy).getTime()).toBe(istAt(DEMO_DATE, 18 * 60).getTime());
    expect(at(hero?.originalPromisedBy).getTime()).toBe(at(hero?.promisedBy).getTime());
    expect(hero?.receivingWindowOverrideEndAt ?? null).toBeNull();
  });

  it('is manual, on TRK-07 with Ramesh, not yet at the gate, with no cached ETA', () => {
    expect(hero?.autopilot).toBe(false);
    expect(hero?.truckId).toBe('trk_07');
    expect(hero?.driverUserId).toBe('usr_drv_ramesh');
    expect(hero?.currentMilestone).toBe('TRUCK_ASSIGNED');
    expect(hero?.etaAt ?? null).toBeNull();
    expect(hero?.riskLevel ?? null).toBeNull();
  });

  it('carries 14 t PX-PP 110 + 8 t urgent PX-HD 520', () => {
    const lines = rowsA.orderLines.filter((l) => l.orderId === hero?.orderId);
    expect(lines.map((l) => [l.gradeCode, Number(l.quantityT), l.isUrgent])).toEqual([
      ['PX-PP 110', 14, false],
      ['PX-HD 520', 8, true],
    ]);
  });

  it('has the replacement truck TRK-11 available at Khopoli yard with Suresh (D3)', () => {
    const trk11 = rowsA.trucks.find((t) => t.id === 'trk_11');
    expect(trk11).toMatchObject({ status: 'AVAILABLE', locationLabel: 'Khopoli yard', defaultDriverUserId: 'usr_drv_suresh', transporterId: 'trn_ghatline' });
  });

  it('arranges the gate so the hero gets the first free bay at its planned departure (08:50)', () => {
    const live = rowsA.shipments.filter((s) => !s.isHistorical);
    const loading = live.filter((s) => s.currentMilestone === 'LOADING').map((s) => istMinuteOfDay(at(s.loadingStartedAt)));
    const queued = live.filter((s) => s.currentMilestone === 'AT_GATE').map((s) => istMinuteOfDay(at(s.gateQueuedAt)));
    expect(loading.sort((a, b) => a - b)).toEqual([450, 460, 470]); // 07:30, 07:40, 07:50 → free 08:10, 08:20, 08:30
    expect(queued.sort((a, b) => a - b)).toEqual([470, 475, 480]); // 3 trucks ahead → bays free again 08:50, 09:00, 09:10
  });
});

describe('historical ledger reconciles by construction', () => {
  it('Σ attribution seconds = arrivedAt − plannedArrivalAt for every historical shipment', () => {
    const byShipment = new Map<string, number>();
    for (const a of rowsA.attributions) {
      if (a.shipmentId) byShipment.set(a.shipmentId, (byShipment.get(a.shipmentId) ?? 0) + a.delaySeconds);
    }
    const hist = rowsA.shipments.filter((s) => s.isHistorical);
    expect(hist.length).toBeGreaterThan(150);
    for (const s of hist) {
      const expected = (new Date(s.arrivedAt as Date).getTime() - new Date(s.plannedArrivalAt as Date).getTime()) / 1000;
      expect(byShipment.get(s.id ?? '') ?? 0, s.code).toBe(expected);
    }
  });

  it('never attributes a receiving-window wait to the customer', () => {
    expect(rowsA.attributions.filter((a) => a.factor === 'WIN' && a.party === 'CUSTOMER')).toEqual([]);
  });
});
