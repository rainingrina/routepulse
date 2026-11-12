import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DashboardQuery, DashboardResponse, ListResponse, ReferenceResponse, ShipmentListItem, ShipmentListItemCoordinator } from '../api/contract';
import { ApiRequestError } from '../api/client';
import { useShipments } from '../api/hooks/world';
import { qk } from '../api/queryClient';
import { renderWithData, text } from '../test/render';
import { KpiStrip } from './control-tower/KpiStrip';
import DashboardPage, { dashboardQueryFrom } from './dashboard/DashboardPage';

/**
 * M10 dashboard and the Control Tower's #36 cards, rendered from REAL API responses captured into
 * `test/fixtures/api-11-20.json` (reset → 10:30 rain → 11:10 report → 11:20). Not hand-written.
 */
interface Fixture {
  reference: ReferenceResponse;
  shipments: ListResponse<ShipmentListItem>;
  dashboard30: DashboardResponse;
  dashboard60: DashboardResponse;
  dashboardPune: DashboardResponse;
  dashboardEmpty: { query: DashboardQuery; response: DashboardResponse };
  drillPune60: ListResponse<ShipmentListItemCoordinator>;
}
const fx = JSON.parse(readFileSync(new URL('../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as Fixture;
const D30 = { period: '30d' } as const;
const page = (route: string, data: [readonly unknown[], unknown][], errors: [readonly unknown[], unknown][] = []) =>
  renderWithData(<DashboardPage />, { route, path: '/dashboard', data: [[qk.reference, fx.reference], ...data], errors });

describe('Dashboard page (#36, #38)', () => {
  it('KPIs, chart cards, transporter table and the data note come from the API response', () => {
    const d = fx.dashboard30;
    const s = text(page('/dashboard', [[qk.dashboard(D30), d]]));
    expect(s).toContain(`On time ${d.kpis.onTimePct!.toFixed(1)}%`);
    expect(s).toContain(`Arrived ${d.arrivedCount}`);
    expect(s).toContain(`${d.kpis.lateCount} late`);
    expect(s).toContain(`Recovered ${d.kpis.recoveredPct!.toFixed(1)}%`);
    expect(s).toContain(`Renegotiated ${d.kpis.renegotiatedCount}`);
    expect(s).toContain(`Proactive notice ${d.kpis.proactiveNoticeRatePct!.toFixed(1)}%`);
    for (const title of ['On-time % by lane', 'On-time % by transporter', 'Weekly on-time trend', 'Shipments arrived per week', 'Delay minutes by party', 'Delay causes by reason', 'Transporter performance: raw vs fair on-time']) {
      expect(s).toContain(title);
    }
    for (const tr of d.transporterTable) {
      expect(s).toContain(tr.name);
      if (tr.gapPct) expect(s).toContain(`+${tr.gapPct.toFixed(1)} pts`);
    }
    expect(s).toContain('Small fleet');
    expect(s).toContain('Fictional seeded data for Plant X.');
    expect(s).toContain(d.definitions.fairOnTime);
    for (const c of d.causesByParty) expect(s).toContain(c.sharePct === null ? '—' : `${c.sharePct.toFixed(1)}%`);
  });

  it('filters come from the URL: period and lane select the matching #36 query; options from #38', () => {
    const html = page('/dashboard?period=30d&laneId=lane_pune', [[qk.dashboard({ period: '30d', laneId: 'lane_pune' }), fx.dashboardPune]]);
    const s = text(html);
    expect(fx.dashboardPune.filter.laneId).toBe('lane_pune');
    expect(s).toContain(`Arrived ${fx.dashboardPune.arrivedCount}`);
    expect(s).toContain('Clear filters');
    expect(html).toMatch(/<option value="lane_pune" selected="">/);
    for (const tr of fx.reference.transporters) expect(s).toContain(tr.name);
  });

  it('dashboardQueryFrom: unknown period falls back to 30 d; empty ids are dropped', () => {
    expect(dashboardQueryFrom(new URLSearchParams('period=90d&laneId='))).toEqual({ period: '30d' });
    expect(dashboardQueryFrom(new URLSearchParams('period=7d&transporterId=trn_ghatline'))).toEqual({ period: '7d', transporterId: 'trn_ghatline' });
  });

  it('an empty filtered set (real response) shows an honest empty state with Clear filters, no charts', () => {
    const { query, response } = fx.dashboardEmpty;
    expect(response.arrivedCount).toBe(0);
    expect(response.kpis.onTimePct).toBeNull();
    const route = `/dashboard?period=${query.period}&laneId=${query.laneId}&transporterId=${query.transporterId}`;
    const s = text(page(route, [[qk.dashboard(query), response]]));
    expect(s).toContain('No deliveries match these filters');
    expect(s).toContain('Clear filters');
    expect(s).not.toContain('On-time % by lane');
    expect(s).not.toMatch(/\d+\.\d%/);
  });

  it('error and loading states', () => {
    const unknownLane = new ApiRequestError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'This item is not available.', requestId: 'req-2' });
    const err = text(page('/dashboard?laneId=lane_x', [], [[qk.dashboard({ period: '30d', laneId: 'lane_x' }), unknownLane]]));
    expect(err).toContain('This item is not available');
    const loading = page('/dashboard', []);
    expect(loading).toContain('animate-pulse');
    expect(text(loading)).not.toMatch(/\d+\.\d%/);
  });

  it('drill-down data (#14, same window and lane) agrees with the dashboard count', () => {
    const lane = fx.dashboard60.onTimeByLane.find((l) => l.laneId === 'lane_pune')!;
    expect(fx.drillPune60.items).toHaveLength(lane.delivered);
    expect(fx.drillPune60.items.filter((s) => s.onTime).length).toBe(lane.onTime);
    expect(fx.drillPune60.items.every((s) => s.arrivedAt! >= fx.dashboard60.filter.from && s.arrivedAt! <= fx.dashboard60.filter.to)).toBe(true);
  });
});

function KpiHarness() {
  const shipments = useShipments({ status: 'live', sort: 'risk' });
  return <KpiStrip shipments={shipments} level="ALL" onLevel={() => undefined} onShowAlerts={() => undefined} />;
}

describe('Control tower KPI strip with the real #36 (M10)', () => {
  it('shows on-time % and the median warning lead from the same 30 d response as the dashboard', () => {
    const k = fx.dashboard30.kpis;
    const s = text(renderWithData(<KpiHarness />, { data: [[qk.shipments({ status: 'live', sort: 'risk' }), fx.shipments], [qk.dashboard(D30), fx.dashboard30]] }));
    expect(s).toContain(`On-time (30 d) ${k.onTimePct!.toFixed(1)}%`);
    expect(k.medianWarningLeadMinutes).toBe(255);
    expect(s).toContain('Median warning lead 4 h 15 m');
    expect(s).toContain('Before the promised time');
    expect(s).not.toContain('Unavailable');
  });
});
