import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AlertDtoCoordinator,
  AttributionResponse,
  DriverReportDto,
  EtaExplanationCoordinator,
  EtaResponse,
  ListResponse,
  AlertDto,
  RecoveryOptionsResponse,
  ReplaySnapshot,
  ShipmentDetailCoordinator,
} from '../../api/contract';
import { buildDecisionBrief } from './briefModel';

// Real API responses captured from the running backend (see realApi.test.tsx).
const fx = JSON.parse(readFileSync(new URL('../../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as {
  heroDetail: { shipment: ShipmentDetailCoordinator };
  heroEta: EtaResponse;
  alerts: ListResponse<AlertDto>;
  alertsAfterChoose: ListResponse<AlertDto>;
  optionsAfterChoose: RecoveryOptionsResponse;
  arrivedDetail: { shipment: ShipmentDetailCoordinator };
  arrivedAttribution: AttributionResponse;
};
const hero = fx.heroDetail.shipment;
const heroEta = fx.heroEta.eta as EtaExplanationCoordinator;
const heroAlerts = (list: ListResponse<AlertDto>) => list.items.filter((a): a is AlertDtoCoordinator => a.view === 'coordinator' && a.shipment.id === hero.id);

// A driver report shaped exactly like #24's DriverReportDto (no fixture captures #24 for this shipment).
const report = (over: Partial<DriverReportDto> = {}): DriverReportDto => ({
  id: 'rpt_1',
  shipmentId: hero.id,
  shipmentCode: hero.code,
  reporter: { id: 'usr_drv', name: 'Ramesh' },
  simTime: '2026-11-19T05:40:00.000Z',
  chipReason: null,
  text: 'tyre puncture near Lonavala',
  suggestedReason: 'BREAKDOWN',
  matchedKeywords: ['puncture'],
  reason: 'BREAKDOWN',
  estimatedMinutes: null,
  appliedMinutes: 180,
  party: 'TRANSPORTER',
  status: 'PENDING_REVIEW',
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  originalReason: null,
  originalParty: null,
  ...over,
});

const base = { shipment: hero, eta: heroEta, attribution: null, reports: [], alerts: [], options: [], snapshots: null };

describe('Decision brief — status and why (real #15 / #18)', () => {
  it('uses the backend ETA, promise and slack as returned', () => {
    const b = buildDecisionBrief(base);
    expect(b.status).toMatchObject({ code: 'SHP-1042', level: hero.riskLevel, arrived: false, etaAt: heroEta.predictedArrivalAt, promisedBy: hero.promisedBy, slackMinutes: heroEta.slackMinutes });
  });

  it('lists the largest contributors with their API minutes and keeps incurred vs expected apart', () => {
    const b = buildDecisionBrief(base);
    expect(b.why.source).toBe('ESTIMATE');
    expect(b.why.top).toHaveLength(4);
    const sorted = [...heroEta.factors].sort((x, y) => y.minutes - x.minutes).slice(0, 4);
    expect(b.why.top.map((c) => [c.label, c.minutes, c.phase])).toEqual(sorted.map((f) => [f.label, f.minutes, f.phase]));
    expect(b.why.moreCount).toBe(heroEta.factors.filter((f) => f.minutes !== 0).length - 4);
    expect(b.why.totals).toEqual({ incurred: heroEta.totals.incurredMinutes, planChange: heroEta.totals.planChangeMinutes, expected: heroEta.totals.expectedMinutes });
  });

  it('after arrival uses the FINAL attribution ledger (#34), not an estimate', () => {
    const arrived = fx.arrivedDetail.shipment;
    const b = buildDecisionBrief({ ...base, shipment: arrived, eta: null, attribution: fx.arrivedAttribution });
    expect(b.status).toMatchObject({ arrived: true, arrivedAt: arrived.arrivedAt, onTime: arrived.onTime });
    expect(b.why.source).toBe('FINAL_LEDGER');
    expect(b.why.top.every((c) => c.phase === 'FINAL')).toBe(true);
    expect(b.why.totals).toBeNull();
  });

  it('no factors and no ledger → nothing invented', () => {
    const b = buildDecisionBrief({ ...base, eta: { ...heroEta, factors: [] } });
    expect(b.why.top).toEqual([]);
    expect(buildDecisionBrief({ ...base, eta: null }).why.source).toBe('NONE');
  });
});

describe('Decision brief — incident (#24 shape)', () => {
  it('no report → null (UI shows "No driver incident reported.")', () => {
    expect(buildDecisionBrief(base).incident).toBeNull();
  });
  it('latest report with category, text, time, estimates and review status', () => {
    const older = report({ id: 'rpt_0', simTime: '2026-11-19T04:00:00.000Z', reason: 'TRAFFIC' });
    const b = buildDecisionBrief({ ...base, reports: [older, report()] });
    expect(b.incident).toMatchObject({ reason: 'BREAKDOWN', text: 'tyre puncture near Lonavala', reportedAt: '2026-11-19T05:40:00.000Z', estimatedMinutes: null, appliedMinutes: 180, status: 'PENDING_REVIEW', otherReports: 1 });
  });
  it('a reviewed change is shown as Confirmed with what it was changed from (no "Rejected" status exists)', () => {
    const b = buildDecisionBrief({ ...base, reports: [report({ status: 'CONFIRMED', reason: 'OTHER', party: 'UNATTRIBUTED', originalReason: 'BREAKDOWN', originalParty: 'TRANSPORTER', reviewedBy: { id: 'u', name: 'Meera' }, reviewedAt: '2026-11-19T06:00:00.000Z' })] });
    expect(b.incident).toMatchObject({ status: 'CONFIRMED', changedFrom: { reason: 'BREAKDOWN', party: 'TRANSPORTER' }, reviewedBy: 'Meera' });
  });
});

describe('Decision brief — recovery and customer (real #26 / #29)', () => {
  it('nothing proposed or chosen → NONE', () => {
    expect(buildDecisionBrief(base).recovery.state).toBe('NONE');
  });

  it('11:20: an option proposed to the customer is PROPOSED, never "selected", and has no decision maker', () => {
    const b = buildDecisionBrief({ ...base, alerts: heroAlerts(fx.alerts) });
    expect(b.recovery).toMatchObject({ state: 'PROPOSED', kind: 'REPLACEMENT_TRUCK', decidedBy: null, decidedAt: null });
  });

  it('11:25: chosen option with saving, cost, who and when — exactly the alert values', () => {
    const alerts = heroAlerts(fx.alertsAfterChoose);
    const a = alerts.find((x) => x.chosenOption)!;
    const b = buildDecisionBrief({ ...base, alerts, options: fx.optionsAfterChoose.options });
    expect(b.recovery).toEqual({
      state: 'CHOSEN',
      kind: a.chosenOption!.kind,
      title: a.chosenOption!.title,
      minutesSavedVsNotify: a.chosenOption!.minutesSavedVsNotify,
      extraCostInr: a.chosenOption!.extraCostInr,
      costNote: a.chosenOption!.costNote,
      newEtaAt: a.chosenOption!.newEtaAt,
      meetsPromise: a.chosenOption!.meetsPromise,
      decidedBy: 'Meera',
      decidedAt: a.chosenAt,
    });
  });

  it('a CHOSEN option without an alert keeps the option but does not invent a decision maker', () => {
    const b = buildDecisionBrief({ ...base, options: fx.optionsAfterChoose.options });
    expect(b.recovery.state).toBe('CHOSEN');
    expect(b.recovery.decidedBy).toBeNull();
  });

  it('customer communication is what the backend recorded', () => {
    const b = buildDecisionBrief(base);
    expect(b.customer).toEqual({ notifiedAt: hero.customerNotifiedAt, response: null, respondedAt: null });
    const responded = buildDecisionBrief({ ...base, shipment: { ...hero, latestCustomerResponse: { response: 'ACCEPT_PROPOSAL', at: '2026-11-19T05:50:00.000Z' } } });
    expect(responded.customer).toMatchObject({ response: 'ACCEPT_PROPOSAL', respondedAt: '2026-11-19T05:50:00.000Z' });
  });
});

describe('Decision brief — ETA before / after the decision (#19 snapshots)', () => {
  const snap = (simTime: string, trigger: string, predictedArrivalAt: string): ReplaySnapshot => ({
    id: `${trigger}-${simTime}`,
    simTime,
    trigger,
    predictedArrivalAt,
    etaLowAt: predictedArrivalAt,
    etaHighAt: predictedArrivalAt,
    slackMinutes: 0,
    level: 'AT_RISK',
    score: 0,
    confidence: 'MEDIUM',
    position: { lat: 0, lng: 0 },
    factors: [],
  });
  const chosen = { ...base, alerts: heroAlerts(fx.alertsAfterChoose) };

  it('uses the RECOVERY snapshot and the one recorded just before it', () => {
    const b = buildDecisionBrief({
      ...chosen,
      snapshots: [snap('2026-11-19T05:00:00.000Z', 'DISRUPTION', '2026-11-19T10:50:00.000Z'), snap('2026-11-19T05:40:00.000Z', 'REPORT', '2026-11-20T02:30:00.000Z'), snap('2026-11-19T05:55:00.000Z', 'RECOVERY', '2026-11-19T12:20:00.000Z')],
    });
    expect(b.etaChange).toEqual({ beforeAt: '2026-11-20T02:30:00.000Z', beforeRecordedAt: '2026-11-19T05:40:00.000Z', afterAt: '2026-11-19T12:20:00.000Z', decisionRecordedAt: '2026-11-19T05:55:00.000Z', deltaMinutes: -850 });
  });

  it('omitted when no RECOVERY snapshot, no earlier snapshot, or no chosen recovery', () => {
    expect(buildDecisionBrief({ ...chosen, snapshots: [snap('2026-11-19T05:40:00.000Z', 'REPORT', '2026-11-20T02:30:00.000Z')] }).etaChange).toBeNull();
    expect(buildDecisionBrief({ ...chosen, snapshots: [snap('2026-11-19T05:55:00.000Z', 'RECOVERY', '2026-11-19T12:20:00.000Z')] }).etaChange).toBeNull();
    expect(buildDecisionBrief({ ...base, snapshots: [snap('2026-11-19T05:40:00.000Z', 'REPORT', '2026-11-20T02:30:00.000Z'), snap('2026-11-19T05:55:00.000Z', 'RECOVERY', '2026-11-19T12:20:00.000Z')] }).etaChange).toBeNull();
  });
});
