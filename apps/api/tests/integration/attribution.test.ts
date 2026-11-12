import type {
  ApiError,
  AttributionResponse,
  ClassifyResponse,
  CreateDriverReportResponse,
  DriverReportListResponse,
  EtaExplanationCoordinator,
  EtaResponse,
  ReviewDriverReportResponse,
} from '@routepulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppLocals } from '../../src/app.js';
import type { AuthUser } from '../../src/auth/types.js';
import { createPrisma, type PrismaClient } from '../../src/db/prisma.js';
import { istAt } from '../../src/engines/time.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { DEMO_DATE } from '../../src/seed/constants.js';
import { finalizeArrival, getAttribution, overrideAttribution, transporterOnTime } from '../../src/services/attributionService.js';
import { computeEtas, recalculate } from '../../src/services/etaService.js';
import { createReport, reviewReport } from '../../src/services/reportService.js';
import { createSimulationService, type RecalcHook, type SimulationService } from '../../src/services/simulationService.js';
import { fromS, toS } from '../../src/sim/world.js';
import { databaseDigest } from '../helpers/digest.js';
import { loginCookie, startTestServer, type TestServer } from '../helpers/testServer.js';

const PASSWORD = 'test-demo-password-123';
const SYSTEM = { userId: null, role: null } as const;
const MEERA = { userId: 'usr_coord_meera', role: 'COORDINATOR' } as const;
const RAMESH: AuthUser = { id: 'usr_drv_ramesh', role: 'DRIVER', name: 'Ramesh', email: 'driver.ramesh@ghatline.test', customerId: null, transporterId: 'trn_ghatline' };
const at = (h: number, m: number) => istAt(DEMO_DATE, h * 60 + m);
const FRI = (h: number, m: number) => new Date(at(h, m).getTime() + 24 * 3600_000);
const R6_TABLES = ['Shipment', 'ShipmentEvent', 'DelayAttribution', 'RiskSnapshot', 'DriverReport', 'Notification'] as const;

let prisma: PrismaClient;
let real = 0;
const service = (opts: { recalc?: RecalcHook } = {}) =>
  createSimulationService({ prisma, demoMode: true, timers: false, realNow: () => real, seedDemoPassword: PASSWORD, ...opts });
const hero = () => prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1042' } });
const heroEta = (s: SimulationService) => s.readSettled(async (db, w, t) => (await computeEtas(db, w, t)).get('shp_1042'));
const rows = (shipmentId: string) => prisma.delayAttribution.findMany({ where: { shipmentId }, orderBy: [{ sourceKey: 'asc' }, { party: 'asc' }] });
const sumSeconds = (r: { delaySeconds: number }[]) => r.reduce((a, x) => a + x.delaySeconds, 0);

async function rain(s: SimulationService) {
  await s.applyChange('DISRUPTION', async (tx: Prisma.TransactionClient, a: number) => {
    await tx.disruption.create({ data: { id: 'dis_rain', kind: 'WEATHER_SLOWDOWN', origin: 'SIMULATOR', label: 'Heavy rain on ghat section', segmentCodes: ['KHP-LNV-GHAT'], slowdownPct: 65, party: 'EXTERNAL', reasonCode: 'HEAVY_RAIN', startsAt: fromS(a), endsAt: at(18, 30) } });
    return { result: null };
  });
}
async function report(s: SimulationService, input: Partial<Parameters<typeof createReport>[2]> = {}) {
  const { result } = await s.applyChange('REPORT', async (tx, a) => ({
    result: await createReport(tx, a, { shipmentId: 'shp_1042', chipReason: undefined, text: 'tyre puncture near Lonavala', reason: 'BREAKDOWN', estimatedMinutes: undefined, user: RAMESH, ...input }),
    shipmentIds: ['shp_1042'],
  }));
  return result;
}
async function review(s: SimulationService, reportId: string, reason: Parameters<typeof reviewReport>[2]['reason'], party: Parameters<typeof reviewReport>[2]['party'], note?: string) {
  return s.applyChange('REVIEW', async (tx, a) => ({ result: await reviewReport(tx, a, { reportId, reason, party, note, actor: MEERA }) }));
}
/** Journeys run-sheet through the services: reset → 10:30 rain → 11:10 driver report. */
async function heroToReport(s: SimulationService) {
  await s.reset(MEERA);
  await s.control({ action: 'ADVANCE_TO', to: at(10, 30) }, MEERA);
  await rain(s);
  await s.control({ action: 'ADVANCE_TO', to: at(11, 10) }, MEERA);
  return report(s);
}

beforeAll(() => {
  prisma = createPrisma(process.env['DATABASE_URL'] ?? '');
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('C — driver report and review on the hero (G2, G4)', () => {
  const s = () => sim;
  let sim: SimulationService;
  let reportId = '';

  it('G2: 11:10 report "tyre puncture near Lonavala" → RPT 180 pending review, AT_RISK Fri 08:00, ±85 MEDIUM', async () => {
    sim = service();
    reportId = await heroToReport(sim);
    expect(reportId).toBe(`rpt_shp_1042_${toS(at(11, 10))}`);
    const r = await prisma.driverReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(r).toMatchObject({ status: 'PENDING_REVIEW', reason: 'BREAKDOWN', suggestedReason: 'BREAKDOWN', matchedKeywords: ['tyre', 'puncture'], appliedMinutes: 180, party: 'TRANSPORTER', reporterUserId: 'usr_drv_ramesh' });
    const h = await hero();
    expect(h.stoppedUntil?.toISOString()).toBe(at(14, 10).toISOString());
    expect(h.lastUpdateAt?.toISOString()).toBe(at(11, 10).toISOString());
    expect(h).toMatchObject({ riskLevel: 'AT_RISK', slackMinutes: -840, confidence: 'MEDIUM' });
    expect(h.etaAt?.toISOString()).toBe(FRI(8, 0).toISOString());
    const eta = await heroEta(s());
    expect(eta?.rangeMinutes).toBe(85); // 62.5 + 20 pending → 85 (engine doc Example 2)
    expect(eta?.factors.find((f) => f.code === 'RPT')).toMatchObject({ phase: 'EXPECTED', minutes: 180, party: 'TRANSPORTER', reviewStatus: 'PENDING_REVIEW', sourceRef: { type: 'DRIVER_REPORT', id: reportId } });
    expect(eta?.factors.find((f) => f.code === 'WIN')?.split).toEqual([{ party: 'PLANT', minutes: 84 }, { party: 'TRANSPORTER', minutes: 423 }, { party: 'EXTERNAL', minutes: 253 }]);
  });

  it('records evidence: DRIVER_REPORT event (source DRIVER), coordinator notification, audit report.create', async () => {
    const ev = await prisma.shipmentEvent.findUniqueOrThrow({ where: { id: `sev_${reportId}_DRIVER_REPORT` } });
    expect(ev).toMatchObject({ type: 'DRIVER_REPORT', source: 'DRIVER', actorUserId: 'usr_drv_ramesh' });
    const n = await prisma.notification.findMany({ where: { kind: 'REPORT_NEEDS_REVIEW' } });
    expect(n.map((x) => [x.audience, x.customerId, x.shipmentId])).toEqual([['COORDINATOR', null, 'shp_1042']]);
    const audit = await prisma.auditLog.findMany({ where: { action: 'report.create' } });
    expect(audit.map((a) => [a.actorUserId, a.entityId])).toEqual([['usr_drv_ramesh', reportId]]);
  });

  it('the stop books RPT seconds (Transporter) while pending; minutes move from expected to incurred', async () => {
    await sim.control({ action: 'ADVANCE_TO', to: at(11, 20) }, MEERA);
    const rpt = (await rows('shp_1042')).filter((r) => r.sourceKey === `RPT:${reportId}`);
    expect(rpt.map((r) => [r.party, r.reason, r.delaySeconds, r.driverReportId, r.status])).toEqual([['TRANSPORTER', 'BREAKDOWN', 600, reportId, 'LIVE']]);
  });

  it('G4: coordinator confirms (same reason/party, no note needed) → CONFIRMED, ±60 HIGH; a second review is 409', async () => {
    await review(sim, reportId, 'BREAKDOWN', 'TRANSPORTER');
    const r = await prisma.driverReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(r).toMatchObject({ status: 'CONFIRMED', reviewedByUserId: 'usr_coord_meera', originalReason: null, originalParty: null });
    expect(r.reviewedAt?.toISOString()).toBe(at(11, 20).toISOString());
    const eta = await heroEta(s());
    expect(eta).toMatchObject({ confidence: 'HIGH', rangeMinutes: 60 });
    expect(eta?.factors.filter((f) => f.code === 'RPT').map((f) => f.reviewStatus)).toEqual(['CONFIRMED', 'CONFIRMED']);
    expect(await prisma.shipmentEvent.count({ where: { id: `sev_${reportId}_REVIEWED` } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'report.review', entityId: reportId } })).toBe(1);
    await expect(review(sim, reportId, 'BREAKDOWN', 'TRANSPORTER')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('A/D: physical arrival 19:19:43; ARRIVED tapped Fri 08:05 → arrivedAt Fri 08:00, ledger FINAL, reconciles, no GAP', async () => {
    await sim.control({ action: 'ADVANCE_TO', to: FRI(8, 5) }, MEERA);
    const before = await hero();
    expect(before.physicalArrivalAt?.toISOString()).toBe(new Date(at(19, 19).getTime() + 43_000).toISOString());
    expect(before.currentMilestone).toBe('IN_TRANSIT'); // manual: waits for the tap
    expect((await rows('shp_1042')).every((r) => r.status === 'LIVE')).toBe(true);
    const ledgerBeforeTap = sumSeconds(await rows('shp_1042'));

    await sim.recordMilestone('shp_1042', 'ARRIVED', { userId: 'usr_drv_ramesh', role: 'DRIVER' });
    const h = await hero();
    expect(h.arrivedAt?.toISOString()).toBe(FRI(8, 0).toISOString()); // eligible check-in, not the 08:05 tap
    expect(h).toMatchObject({ delayMinutes: 840, onTime: false });
    const final = await rows('shp_1042');
    expect(final.every((r) => r.status === 'FINAL' && r.updatedAtSim.getTime() === FRI(8, 0).getTime())).toBe(true);
    expect(final.some((r) => r.kind === 'GAP')).toBe(false);
    expect(sumSeconds(final)).toBe(ledgerBeforeTap); // nothing booked for the confirmation lag (L6)
    expect(sumSeconds(final)).toBe((h.arrivedAt!.getTime() - h.plannedArrivalAt.getTime()) / 1000); // 1,120 min
  });

  it('attribution (#34 service): 1,120 min = GATE 40 + HIST 20 + DISR 120 + RPT 180 + WIN 760; not against the transporter', async () => {
    const a = await getAttribution(prisma, 'shp_1042');
    expect(a.status).toBe('FINAL');
    expect(a.rows.map((r) => [r.factor, r.party, r.minutes])).toEqual([
      ['GATE', 'PLANT', 40], ['HIST', 'TRANSPORTER', 20], ['DISR', 'EXTERNAL', 120], ['RPT', 'TRANSPORTER', 180],
      ['WIN', 'EXTERNAL', 253], ['WIN', 'PLANT', 84], ['WIN', 'TRANSPORTER', 423],
    ]);
    expect(a.totalsByParty).toEqual({ PLANT: 124, TRANSPORTER: 623, CUSTOMER: 0, EXTERNAL: 373, UNATTRIBUTED: 0 });
    expect(a.delayMinutes).toBe(840);
    expect(a.countsAgainstTransporter).toBe(false); // 840 − 623 = 217 > 0: still late without the transporter
  });

  it('repeated finalisation and later steps change nothing (no double counting, no second GAP)', async () => {
    const ledger = async () => (await databaseDigest(prisma, ['DelayAttribution']))['DelayAttribution'];
    const digest = await ledger();
    await prisma.$transaction(async (tx) => {
      expect(await finalizeArrival(tx, 'shp_1042')).toBeNull();
    });
    await sim.control({ action: 'ADVANCE_TO', to: FRI(10, 0) }, MEERA);
    expect(await ledger()).toEqual(digest);
  });
});

describe('B — attribution rules through the pipeline', () => {
  it('autopilot arrival finalises at ARRIVED; every arrived live shipment reconciles exactly to arrivedAt − plannedArrival', async () => {
    const s = service();
    await s.reset(MEERA);
    await s.control({ action: 'ADVANCE_TO', to: at(14, 0) }, MEERA);
    const arrived = await prisma.shipment.findMany({ where: { isHistorical: false, arrivedAt: { not: null } }, include: { attributions: true } });
    expect(arrived.map((x) => x.code)).toContain('SHP-1043');
    for (const x of arrived) {
      expect(x.attributions.every((r) => r.status === 'FINAL')).toBe(true);
      expect(sumSeconds(x.attributions)).toBe((x.arrivedAt!.getTime() - x.plannedArrivalAt.getTime()) / 1000);
      expect(x.attributions.some((r) => r.kind === 'GAP')).toBe(false);
    }
    const live = await prisma.delayAttribution.findMany({ where: { shipment: { isHistorical: false, arrivedAt: null } } });
    expect(live.every((r) => r.status === 'LIVE')).toBe(true);
  });

  it('AT-4: missing ledger evidence becomes an UNATTRIBUTED GAP row at finalisation — shown, not hidden', async () => {
    const s = service();
    await s.reset(MEERA);
    await s.control({ action: 'ADVANCE_TO', to: at(12, 0) }, MEERA);
    const hist = await prisma.delayAttribution.findUniqueOrThrow({ where: { shipmentId_sourceKey_party: { shipmentId: 'shp_1043', sourceKey: 'HIST', party: 'TRANSPORTER' } } });
    await prisma.delayAttribution.update({ where: { id: hist.id }, data: { delaySeconds: hist.delaySeconds - 120 } }); // simulate lost evidence
    await s.control({ action: 'ADVANCE_TO', to: at(14, 0) }, MEERA);
    const x = await prisma.shipment.findUniqueOrThrow({ where: { id: 'shp_1043' }, include: { attributions: true } });
    const gap = x.attributions.find((r) => r.kind === 'GAP');
    expect(gap).toMatchObject({ sourceKey: 'GAP', party: 'UNATTRIBUTED', factor: null, delaySeconds: 120, status: 'FINAL' });
    expect(sumSeconds(x.attributions)).toBe((x.arrivedAt!.getTime() - x.plannedArrivalAt.getTime()) / 1000);
    expect((await getAttribution(prisma, 'shp_1043')).totalsByParty.UNATTRIBUTED).toBe(2);
  });

  it('L5 overlap: a 60-min report inside a 180-min breakdown books only the latest-ending stop; nothing twice', async () => {
    const s = service();
    await s.reset(MEERA);
    await s.control({ action: 'ADVANCE_TO', to: at(11, 10) }, MEERA);
    await s.applyChange('DISRUPTION', async (tx, a) => {
      await tx.disruption.create({ data: { id: 'dis_bd', kind: 'TRUCK_BREAKDOWN', origin: 'SIMULATOR', label: 'Truck breakdown', segmentCodes: [], shipmentId: 'shp_1042', stopMinutes: 180, party: 'TRANSPORTER', reasonCode: 'BREAKDOWN', startsAt: fromS(a), endsAt: fromS(a + 180 * 60) } });
      return { result: null, shipmentIds: ['shp_1042'] };
    });
    const rid = await report(s, { reason: 'TRAFFIC', text: 'traffic jam', estimatedMinutes: 60 });
    const before = sumSeconds(await rows('shp_1042'));
    await s.control({ action: 'ADVANCE_TO', to: at(14, 10) }, MEERA);
    const after = await rows('shp_1042');
    expect(after.find((r) => r.sourceKey === `RPT:${rid}`)).toBeUndefined(); // shorter stop never binds
    expect(after.find((r) => r.sourceKey === 'DISR:dis_bd')?.delaySeconds).toBe(180 * 60);
    expect(sumSeconds(after) - before).toBe(180 * 60); // exactly the stopped time, once
  });

  it('a stop beats a slowdown: during the report stop on the rainy ghat only RPT is booked', async () => {
    const s = service();
    const rid = await heroToReport(s);
    const disrBefore = (await rows('shp_1042')).find((r) => r.sourceKey === 'DISR:dis_rain')?.delaySeconds;
    await s.control({ action: 'ADVANCE_TO', to: at(12, 10) }, MEERA);
    const r = await rows('shp_1042');
    expect(r.find((x) => x.sourceKey === 'DISR:dis_rain')?.delaySeconds).toBe(disrBefore);
    expect(r.find((x) => x.sourceKey === `RPT:${rid}`)?.delaySeconds).toBe(3600);
  });

  it('unattributed: an OTHER report stays UNATTRIBUTED until the coordinator assigns a party with a note', async () => {
    const s = service();
    await s.reset(MEERA);
    await s.control({ action: 'ADVANCE_TO', to: at(11, 0) }, MEERA);
    const rid = await report(s, { reason: 'OTHER', text: 'waiting for instructions', estimatedMinutes: 30 });
    await s.control({ action: 'ADVANCE_TO', to: at(11, 15) }, MEERA);
    expect((await rows('shp_1042')).filter((r) => r.sourceKey === `RPT:${rid}`).map((r) => [r.party, r.delaySeconds])).toEqual([['UNATTRIBUTED', 900]]);
    await expect(review(s, rid, 'TRAFFIC', 'EXTERNAL')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' }); // change needs a note
    await review(s, rid, 'TRAFFIC', 'EXTERNAL', 'Driver confirmed by phone: traffic jam');
    const rr = await prisma.driverReport.findUniqueOrThrow({ where: { id: rid } });
    expect(rr).toMatchObject({ reason: 'TRAFFIC', party: 'EXTERNAL', originalReason: 'OTHER', originalParty: 'UNATTRIBUTED', reviewNote: 'Driver confirmed by phone: traffic jam' });
    // AC-F3.2: attribution re-tagged, ETA factor follows the reviewed party
    expect((await rows('shp_1042')).filter((r) => r.sourceKey === `RPT:${rid}`).map((r) => [r.party, r.reason, r.delaySeconds])).toEqual([['EXTERNAL', 'TRAFFIC', 900]]);
    const eta = await heroEta(s);
    expect(eta?.factors.filter((f) => f.code === 'RPT').map((f) => f.party)).toEqual(['EXTERNAL', 'EXTERNAL']);
    await s.control({ action: 'ADVANCE_TO', to: at(11, 35) }, MEERA);
    expect((await rows('shp_1042')).filter((r) => r.sourceKey === `RPT:${rid}`).map((r) => [r.party, r.delaySeconds])).toEqual([['EXTERNAL', 1800]]);
  });
});

describe('overrides (AT-3, AC-F1.3)', () => {
  it('moves the whole row with a note, keeps the original party, writes an event and audit; same party is 409', async () => {
    const s = service();
    await s.reset(MEERA);
    await s.control({ action: 'ADVANCE_TO', to: at(14, 0) }, MEERA);
    const gate = await prisma.delayAttribution.findFirstOrThrow({ where: { shipmentId: 'shp_1043', sourceKey: 'GATE' } });
    const total = sumSeconds(await rows('shp_1043'));
    const override = (attributionId: string, newParty: 'TRANSPORTER' | 'PLANT', note = 'Truck arrived without documents') =>
      s.applyChange('OVERRIDE', async (tx, a) => {
        await overrideAttribution(tx, a, { shipmentId: 'shp_1043', attributionId, newParty, note, actor: MEERA });
        return { result: null };
      });
    await override(gate.id, 'TRANSPORTER');
    const moved = await prisma.delayAttribution.findUniqueOrThrow({ where: { id: gate.id } });
    expect(moved).toMatchObject({ party: 'TRANSPORTER', originalParty: 'PLANT', overrideNote: 'Truck arrived without documents', overriddenByUserId: 'usr_coord_meera', status: 'FINAL', delaySeconds: gate.delaySeconds });
    expect(sumSeconds(await rows('shp_1043'))).toBe(total);
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: 'shp_1043', type: 'ATTRIBUTION_OVERRIDDEN' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'attribution.override', entityId: gate.id } })).toBe(1);
    await expect(override(gate.id, 'TRANSPORTER')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    // moving it back keeps the FIRST original party
    await override(gate.id, 'PLANT', 'Correction after review');
    expect(await prisma.delayAttribution.findUniqueOrThrow({ where: { id: gate.id } })).toMatchObject({ party: 'PLANT', originalParty: 'PLANT' });
    await expect(override('da_nope', 'PLANT')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('merges into an existing row of the same source and target party (WIN knock-on rows)', async () => {
    const s = service();
    await heroToReport(s);
    await s.control({ action: 'ADVANCE_TO', to: FRI(8, 5) }, MEERA);
    await s.recordMilestone('shp_1042', 'ARRIVED', { userId: 'usr_drv_ramesh', role: 'DRIVER' });
    const plantWin = await prisma.delayAttribution.findUniqueOrThrow({ where: { shipmentId_sourceKey_party: { shipmentId: 'shp_1042', sourceKey: 'WIN', party: 'PLANT' } } });
    const trWin = await prisma.delayAttribution.findUniqueOrThrow({ where: { shipmentId_sourceKey_party: { shipmentId: 'shp_1042', sourceKey: 'WIN', party: 'TRANSPORTER' } } });
    await s.applyChange('OVERRIDE', async (tx, a) => {
      await overrideAttribution(tx, a, { shipmentId: 'shp_1042', attributionId: plantWin.id, newParty: 'TRANSPORTER', note: 'Gate wait caused by late truck', actor: MEERA });
      return { result: null };
    });
    expect(await prisma.delayAttribution.findUnique({ where: { id: plantWin.id } })).toBeNull();
    expect(await prisma.delayAttribution.findUniqueOrThrow({ where: { id: trWin.id } })).toMatchObject({ delaySeconds: plantWin.delaySeconds + trWin.delaySeconds, originalParty: 'PLANT' });
    const a = await getAttribution(prisma, 'shp_1042');
    expect(a.rows.reduce((x, r) => x + r.minutes, 0)).toBe(1120);
    expect(a.countsAgainstTransporter).toBe(false); // 840 − (623 + 84) = 133 > 0
  });

  it('an override on a LIVE row changes the ETA factor party now; later seconds follow the default rule', async () => {
    const s = service();
    await s.reset(MEERA);
    const gate = await prisma.delayAttribution.findFirstOrThrow({ where: { shipmentId: 'shp_1042', sourceKey: 'GATE' } });
    await s.applyChange('OVERRIDE', async (tx, a) => {
      await overrideAttribution(tx, a, { shipmentId: 'shp_1042', attributionId: gate.id, newParty: 'TRANSPORTER', note: 'Truck reached the gate unprepared', actor: MEERA });
      return { result: null, shipmentIds: ['shp_1042'] };
    });
    const eta = await heroEta(s);
    expect(eta?.factors.find((f) => f.code === 'GATE')).toMatchObject({ phase: 'INCURRED', minutes: 40, party: 'TRANSPORTER' });
    expect(eta?.predictedArrivalS).toBe(toS(at(14, 20))); // the ETA itself is unchanged
    const snap = await prisma.riskSnapshot.findFirstOrThrow({ where: { shipmentId: 'shp_1042' }, orderBy: [{ simTime: 'desc' }, { id: 'desc' }] });
    expect(snap.trigger).toBe('REVIEW');
  });
});

describe('F — transactions, idempotence, fair on-time, R6', () => {
  it('a failing review rolls back completely (report still pending, rows untouched)', async () => {
    const s = service();
    const rid = await heroToReport(s);
    const digest = await databaseDigest(prisma, R6_TABLES);
    const failing = service({ recalc: async (tx, ctx) => { if (ctx.trigger === 'REVIEW') throw new Error('injected failure'); return recalculate(tx, ctx); } });
    await expect(review(failing, rid, 'TRAFFIC', 'EXTERNAL', 'Changing reason for the test')).rejects.toThrow('injected failure');
    expect(await databaseDigest(prisma, R6_TABLES)).toEqual(digest);
    expect((await prisma.driverReport.findUniqueOrThrow({ where: { id: rid } })).status).toBe('PENDING_REVIEW');
  });

  it('repeated recalculation does not touch the ledger', async () => {
    const s = service();
    await heroToReport(s);
    const ledger = async () => (await databaseDigest(prisma, ['DelayAttribution']))['DelayAttribution'];
    const digest = await ledger();
    for (let i = 0; i < 3; i += 1) await s.applyChange('REVIEW', async () => ({ result: null }));
    expect(await ledger()).toEqual(digest);
  });

  it('E: raw vs fair on-time from the persisted ledger reproduces the seed story (no hard-coded values)', async () => {
    await service().reset(MEERA);
    const perf = await transporterOnTime(prisma);
    expect(perf.map((p) => [p.name, p.shipments, p.rawOnTimePct, p.fairOnTimePct])).toEqual([
      ['Bluehill Transport', 40, 70, 90],
      ['Coastway Movers', 37, 91.9, 97.3],
      ['Ghatline Carriers', 43, 79.1, 88.4],
      ['Ironroad Freight', 26, 100, 100],
      ['Northstar Haulage', 31, 90.3, 96.8],
    ]);
  });

  it('E: the late hero counts against raw on-time but not fair on-time for Ghatline', async () => {
    const s = service();
    await heroToReport(s);
    await s.control({ action: 'ADVANCE_TO', to: FRI(8, 5) }, MEERA);
    await s.recordMilestone('shp_1042', 'ARRIVED', { userId: 'usr_drv_ramesh', role: 'DRIVER' });
    const g = (await transporterOnTime(prisma)).find((p) => p.transporterId === 'trn_ghatline');
    expect(g).toMatchObject({ shipments: 44, rawOnTimePct: 77.3, fairOnTimePct: 88.6 }); // 34/44 raw, 39/44 fair
  });

  it('R6 (driver-report variant): a report at 11:07 gives identical results running or paused', async () => {
    const runTo1107 = async (pause: boolean) => {
      const s = service();
      await s.reset(MEERA);
      await s.control({ action: 'SET_SPEED', speed: 60 }, MEERA);
      await s.control({ action: 'PLAY' }, MEERA);
      real += 42_500; // 10:25 + 42.5 min = 11:07:30
      await s.tick();
      if (pause) await s.control({ action: 'PAUSE' }, MEERA);
      const rid = await report(s);
      expect(rid).toBe(`rpt_shp_1042_${toS(at(11, 7))}`); // stamped to the whole minute
      if (!pause) await s.control({ action: 'PAUSE' }, MEERA);
      await s.control({ action: 'ADVANCE_TO', to: at(12, 0) }, MEERA);
      return databaseDigest(prisma, R6_TABLES, ['speed', 'running', 'simError']);
    };
    const running = await runTo1107(false);
    const paused = await runTo1107(true);
    expect(paused).toEqual(running);
  });
});

describe('HTTP: #22–#25, #34, #35 — roles, scoping, validation', () => {
  let srv: TestServer;
  let coordinator: string;
  let kestrel: string;
  let ramesh: string;
  let suresh: string;
  const call = (method: 'GET' | 'POST', path: string, cookie: string | null, body?: unknown) =>
    fetch(`${srv.baseUrl}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const code = async (res: Response) => ((await res.json()) as ApiError).error.code;

  beforeAll(async () => {
    srv = await startTestServer({ loginRateLimit: { limit: 1000, windowMs: 60_000 }, env: { SEED_DEMO_PASSWORD: PASSWORD }, simulation: { timers: false } });
    const sim = (srv.app.locals as AppLocals).simulation;
    await sim.reset(MEERA);
    await sim.control({ action: 'ADVANCE_TO', to: at(11, 10) }, MEERA);
    coordinator = await loginCookie(srv.baseUrl, 'coordinator@plantx.test', PASSWORD);
    kestrel = await loginCookie(srv.baseUrl, 'buyer@kestrel.test', PASSWORD);
    ramesh = await loginCookie(srv.baseUrl, 'driver.ramesh@ghatline.test', PASSWORD);
    suresh = await loginCookie(srv.baseUrl, 'driver.suresh@ghatline.test', PASSWORD);
  });
  afterAll(async () => {
    await srv.close();
  });

  it('#22 classify: driver and coordinator; customers 403; writes nothing; validates text', async () => {
    const res = await call('POST', '/api/driver-reports/classify', ramesh, { text: 'tyre puncture near Lonavala' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestedReason: 'BREAKDOWN', matchedKeywords: ['tyre', 'puncture'], strength: 'STRONG', defaultMinutes: 180, defaultParty: 'TRANSPORTER', method: 'KEYWORD_LIST_V1' } satisfies ClassifyResponse);
    expect((await call('POST', '/api/driver-reports/classify', coordinator, { text: 'documents missing' })).status).toBe(200);
    expect((await call('POST', '/api/driver-reports/classify', kestrel, { text: 'x' })).status).toBe(403);
    expect(await code(await call('POST', '/api/driver-reports/classify', ramesh, { text: '   ' }))).toBe('VALIDATION_ERROR');
    expect(await code(await call('POST', '/api/driver-reports/classify', ramesh, { text: 'a'.repeat(281) }))).toBe('VALIDATION_ERROR');
    expect(await prisma.driverReport.count({ where: { shipment: { isHistorical: false } } })).toBe(0);
  });

  it('#23 validation: needs chip or text, a driver-chip reason, allowed estimates, no unknown fields', async () => {
    const post = (body: unknown) => call('POST', '/api/shipments/shp_1042/driver-reports', ramesh, body);
    for (const body of [
      { reason: 'BREAKDOWN' },
      { chipReason: 'BREAKDOWN', reason: 'TRANSPORTER_PACE' },
      { chipReason: 'BREAKDOWN', reason: 'BREAKDOWN', estimatedMinutes: 45 },
      { chipReason: 'BREAKDOWN', reason: 'BREAKDOWN', party: 'PLANT' },
      { text: 'x'.repeat(281), reason: 'OTHER' },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect((await call('POST', '/api/shipments/shp_1042/driver-reports', ramesh, 'not json')).status).toBe(400);
  });

  it('#23 scoping: a driver reports only on own shipments (404 otherwise); customers 403; delivered → 409', async () => {
    const body = { chipReason: 'TRAFFIC', reason: 'TRAFFIC' };
    expect((await call('POST', '/api/shipments/shp_1041/driver-reports', ramesh, body)).status).toBe(404);
    expect((await call('POST', '/api/shipments/shp_1042/driver-reports', suresh, body)).status).toBe(404);
    expect((await call('POST', '/api/shipments/shp_1042/driver-reports', kestrel, body)).status).toBe(403);
    const delivered = await prisma.shipment.findFirstOrThrow({ where: { isHistorical: true }, select: { id: true } });
    const res = await call('POST', `/api/shipments/${delivered.id}/driver-reports`, coordinator, body);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('INVALID_TRANSITION');
  });

  let reportId = '';
  it('#23 create (driver): 201 with the report and the driver trip; the customer ETA shows no internal evidence', async () => {
    const res = await call('POST', '/api/shipments/shp_1042/driver-reports', ramesh, { text: 'tyre puncture near Lonavala', reason: 'BREAKDOWN' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateDriverReportResponse;
    reportId = body.report.id;
    expect(body.report).toMatchObject({ shipmentCode: 'SHP-1042', reporter: { id: 'usr_drv_ramesh', name: 'Ramesh' }, status: 'PENDING_REVIEW', appliedMinutes: 180, party: 'TRANSPORTER', suggestedReason: 'BREAKDOWN', simTime: at(11, 10).toISOString() });
    expect(body.trip).toMatchObject({ view: 'driver', id: 'shp_1042', currentMilestone: 'IN_TRANSIT', nextMilestone: 'ARRIVED', canRecordNext: false, stopped: true, instruction: null, openReports: [{ id: reportId, reason: 'BREAKDOWN', status: 'PENDING_REVIEW' }] });
    expect(body.trip?.nextBlockedReason).toMatch(/^\d+ km to destination$/);
    const eta = await call('GET', '/api/shipments/shp_1042/eta', kestrel);
    const text = JSON.stringify(await eta.json());
    for (const banned of ['Ramesh', 'reporter', 'party', 'reportId', 'DRIVER_REPORT', 'RPT']) expect(text).not.toContain(banned);
    expect(text).toContain('Vehicle breakdown on the route');
  });

  it('#24 queue: coordinator only; newest first; status/limit filters validated', async () => {
    const res = await call('GET', '/api/driver-reports', coordinator);
    expect(res.status).toBe(200);
    const list = (await res.json()) as DriverReportListResponse;
    expect(list.items.map((r) => r.id)).toEqual([reportId]);
    expect(((await (await call('GET', '/api/driver-reports?status=CONFIRMED', coordinator)).json()) as DriverReportListResponse).items.length).toBeGreaterThan(0); // seeded history
    expect((await call('GET', '/api/driver-reports?status=CONFIRMED&limit=2', coordinator)).status).toBe(200);
    expect((await call('GET', '/api/driver-reports?limit=0', coordinator)).status).toBe(400);
    expect((await call('GET', '/api/driver-reports?status=REJECTED', coordinator)).status).toBe(400);
    expect((await call('GET', '/api/driver-reports?foo=1', coordinator)).status).toBe(400);
    expect((await call('GET', '/api/driver-reports', ramesh)).status).toBe(403);
    expect((await call('GET', '/api/driver-reports', kestrel)).status).toBe(403);
  });

  it('#25 review: coordinator only; note rules; UNATTRIBUTED only with OTHER; 200 with report + ETA; then 409', async () => {
    const path = `/api/driver-reports/${reportId}/review`;
    expect((await call('POST', path, ramesh, { reason: 'BREAKDOWN', party: 'TRANSPORTER' })).status).toBe(403);
    expect((await call('POST', path, coordinator, { reason: 'BREAKDOWN', party: 'UNATTRIBUTED', note: 'unknown cause' })).status).toBe(400);
    expect((await call('POST', path, coordinator, { reason: 'BREAKDOWN', party: 'PLANT' })).status).toBe(400); // change without note
    expect((await call('POST', path, coordinator, { reason: 'BREAKDOWN', party: 'PLANT', note: 'bad' })).status).toBe(400); // note < 5
    expect((await call('POST', '/api/driver-reports/rpt_nope/review', coordinator, { reason: 'BREAKDOWN', party: 'TRANSPORTER' })).status).toBe(404);
    const res = await call('POST', path, coordinator, { reason: 'BREAKDOWN', party: 'TRANSPORTER' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReviewDriverReportResponse;
    expect(body.report).toMatchObject({ status: 'CONFIRMED', reviewedBy: { id: 'usr_coord_meera', name: 'Meera' } });
    expect(body.eta.factors.find((f) => f.code === 'RPT')?.reviewStatus).toBe('CONFIRMED');
    expect(body.eta.confidence).toBe('HIGH');
    expect(await code(await call('POST', path, coordinator, { reason: 'BREAKDOWN', party: 'TRANSPORTER' }))).toBe('ALREADY_DONE');
  });

  it('#34/#35 attribution: coordinator only; override validates note, party and row ownership', async () => {
    expect((await call('GET', '/api/shipments/shp_1042/attribution', kestrel)).status).toBe(403);
    expect((await call('GET', '/api/shipments/shp_1042/attribution', ramesh)).status).toBe(403);
    expect((await call('GET', '/api/shipments/shp_nope/attribution', coordinator)).status).toBe(404);
    const res = await call('GET', '/api/shipments/shp_1042/attribution', coordinator);
    const a = (await res.json()) as AttributionResponse;
    expect(a).toMatchObject({ status: 'LIVE', delayMinutes: null, countsAgainstTransporter: null });
    expect(a.ruleText).toBe("Counts against the transporter only if the shipment would have been on time without the transporter's minutes.");
    const gate = a.rows.find((r) => r.factor === 'GATE');
    const path = '/api/shipments/shp_1042/attribution/overrides';
    expect((await call('POST', path, coordinator, { attributionId: gate?.id, newParty: 'TRANSPORTER', note: 'no' })).status).toBe(400);
    expect((await call('POST', path, coordinator, { attributionId: gate?.id, newParty: 'PLANT', note: 'Same party again' })).status).toBe(409);
    const other = await prisma.delayAttribution.findFirstOrThrow({ where: { shipmentId: 'shp_1041' } });
    expect((await call('POST', path, coordinator, { attributionId: other.id, newParty: 'EXTERNAL', note: 'Wrong shipment row' })).status).toBe(404);
    expect((await call('POST', path, kestrel, { attributionId: gate?.id, newParty: 'EXTERNAL', note: 'Customer attempt' })).status).toBe(403);
    const ok = await call('POST', path, coordinator, { attributionId: gate?.id, newParty: 'TRANSPORTER', note: 'Truck came without documents' });
    expect(ok.status).toBe(200);
    const after = (await ok.json()) as AttributionResponse;
    expect(after.rows.find((r) => r.id === gate?.id)).toMatchObject({ party: 'TRANSPORTER', originalParty: 'PLANT', overrideNote: 'Truck came without documents', overriddenBy: { id: 'usr_coord_meera', name: 'Meera' } });
  });

  it('audit history lists every decision with actor and simulation time', async () => {
    const audit = await prisma.auditLog.findMany({ where: { action: { in: ['report.create', 'report.review', 'attribution.override'] } }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((x) => [x.action, x.actorUserId])).toEqual([
      ['report.create', 'usr_drv_ramesh'],
      ['report.review', 'usr_coord_meera'],
      ['attribution.override', 'usr_coord_meera'],
    ]);
    expect(audit.every((x) => x.simTime?.toISOString() === at(11, 10).toISOString())).toBe(true);
  });

  it('the coordinator may report on behalf (source COORDINATOR, audited); ETA explanation stays consistent', async () => {
    const res = await call('POST', '/api/shipments/shp_1041/driver-reports', coordinator, { chipReason: 'TRAFFIC', reason: 'TRAFFIC', estimatedMinutes: 30 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateDriverReportResponse;
    expect(body.trip).toBeNull();
    expect(await prisma.shipmentEvent.findUniqueOrThrow({ where: { id: `sev_${body.report.id}_DRIVER_REPORT` } })).toMatchObject({ source: 'COORDINATOR' });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'report.create', entityId: body.report.id } });
    expect(audit.data).toMatchObject({ onBehalf: true });
    const eta = ((await (await call('GET', '/api/shipments/shp_1041/eta', coordinator)).json()) as EtaResponse).eta as EtaExplanationCoordinator;
    expect(eta.identityHolds).toBe(true);
  });
});
