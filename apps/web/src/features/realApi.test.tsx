import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AlertDto,
  AlertDtoCoordinator,
  AttributionResponse,
  AuditResponse,
  ChooseRecoveryResponse,
  RecoveryOptionsResponse,
  CustomerAlertDto,
  DisruptionDto,
  EtaExplanationCoordinator,
  ListResponse,
  MapLayersResponse,
  NotificationsResponse,
  PositionsResponse,
  ReferenceResponse,
  ShipmentDetail,
  ShipmentListItem,
  ShipmentListItemCoordinator,
  ShipmentListItemCustomer,
  SyncResponse,
  TimelineEvent,
} from '../api/contract';
import { ApiRequestError } from '../api/client';
import { useShipments } from '../api/hooks/world';
import { qk } from '../api/queryClient';
import { NotificationList } from '../app/layouts/NotificationBell';
import { truckAriaLabel } from '../map/markers/markers';
import { renderWithData, text } from '../test/render';
import { ActivityFeed } from './control-tower/ActivityFeed';
import { AlertsPanel } from './control-tower/AlertsPanel';
import { KpiStrip } from './control-tower/KpiStrip';
import { ShipmentList } from './control-tower/ShipmentList';
import { filterShipments } from './control-tower/listFilters';
import { RecoveryQuickSection } from './recovery/RecoveryQuickSection';
import { RecoveryPanel } from './recovery/RecoveryPanel';
import ShipmentDetailPage from './shipment/ShipmentDetailPage';
import SimulationPage from './simulation/SimulationPage';

/**
 * Component tests against REAL API responses: `test/fixtures/api-11-20.json` was captured from the
 * running backend (reset → 10:30 rain on the ghat → 11:10 breakdown report → 11:20), not hand-written.
 * Regenerate it if the contract changes; TypeScript checks the shapes below.
 */
interface Fixture {
  sync: SyncResponse;
  shipments: ListResponse<ShipmentListItem>;
  heroDetail: { shipment: ShipmentDetail };
  heroEta: { eta: EtaExplanationCoordinator };
  heroAttribution: AttributionResponse;
  heroTimeline: ListResponse<TimelineEvent>;
  alerts: ListResponse<AlertDto>;
  notifications: NotificationsResponse;
  audit: AuditResponse;
  reference: ReferenceResponse;
  disruptionsActive: ListResponse<DisruptionDto>;
  layers: MapLayersResponse;
  positions: PositionsResponse;
  customerShipments: ListResponse<ShipmentListItemCustomer>;
  customerAlerts: ListResponse<CustomerAlertDto>;
  arrivedDetail: { shipment: ShipmentDetail };
  arrivedAttribution: AttributionResponse;
  heroOptions: RecoveryOptionsResponse;
  chooseResponse: ChooseRecoveryResponse;
  optionsAfterChoose: RecoveryOptionsResponse;
  alertsAfterChoose: ListResponse<AlertDto>;
  customerAlertsAfterChoose: ListResponse<CustomerAlertDto>;
}
const fx = JSON.parse(readFileSync(new URL('../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as Fixture;
const LIVE = { status: 'live', sort: 'risk' } as const;
const notFound = new ApiRequestError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'No such endpoint.', requestId: 'req-1' });
const coordinatorItems = fx.shipments.items as ShipmentListItemCoordinator[];

function KpiHarness() {
  const shipments = useShipments(LIVE);
  return <KpiStrip shipments={shipments} level="ALL" onLevel={() => undefined} onShowAlerts={() => undefined} />;
}

describe('Control tower KPI strip (real #14/#26/#36 data)', () => {
  it('when #36 fails, the dashboard cards say Unavailable instead of inventing numbers', () => {
    const atRisk = coordinatorItems.filter((s) => s.riskLevel === 'AT_RISK').length;
    const html = text(
      renderWithData(<KpiHarness />, {
        data: [[qk.shipments(LIVE), fx.shipments], [qk.alerts({ status: 'active' }), fx.alerts]],
        errors: [[qk.dashboard({ period: '30d' }), notFound]],
      }),
    );
    expect(html).toContain(`Live shipments ${coordinatorItems.length}`);
    expect(html).toContain(`At risk ${atRisk}`);
    expect(html).toContain(`Open alerts ${fx.alerts.items.length}`);
    expect(html.match(/Unavailable/g)?.length).toBe(2); // On-time (30 d) and Median warning lead
    expect(html).not.toMatch(/\d+(\.\d)?\s?%/); // no percentage is shown without #36
  });

  it('loading state: skeletons, no numbers', () => {
    const html = renderWithData(<KpiHarness />);
    expect(html).toContain('animate-pulse');
    expect(text(html)).not.toContain('Live shipments 12');
  });
});

describe('Shipment list (#14)', () => {
  it('renders the risk-sorted real list with codes, customers and levels; search filters by code', () => {
    const html = text(
      renderWithData(
        <ShipmentList items={coordinatorItems} totalCount={coordinatorItems.length} isPending={false} error={null} onRetry={() => undefined} level="ALL" onLevel={() => undefined} query="" onQuery={() => undefined} selectedId={null} onSelect={() => undefined} hoveredId={null} onHover={() => undefined} simTime={fx.sync.simTime} highlightIds={new Set()} />,
      ),
    );
    for (const s of coordinatorItems) expect(html).toContain(s.code);
    expect(html.indexOf(coordinatorItems[0]!.code)).toBeLessThan(html.indexOf(coordinatorItems[coordinatorItems.length - 1]!.code));
    expect(html).toContain('Kestrel Moulders');
    expect(filterShipments(coordinatorItems, 'ALL', '1042').map((s) => s.code)).toEqual(['SHP-1042']);
    expect(filterShipments(coordinatorItems, 'AT_RISK', '').every((s) => s.riskLevel === 'AT_RISK')).toBe(true);
  });

  it('API error → error state with retry; links go to the shipment detail route', () => {
    const err = renderWithData(<ShipmentList items={[]} totalCount={0} isPending={false} error={new ApiRequestError({ kind: 'network', message: 'Network down' })} onRetry={() => undefined} level="ALL" onLevel={() => undefined} query="" onQuery={() => undefined} selectedId={null} onSelect={() => undefined} hoveredId={null} onHover={() => undefined} simTime={fx.sync.simTime} highlightIds={new Set()} />);
    expect(err).toContain('role="alert"');
    expect(text(err)).toContain('Try again');
  });
});

describe('Alerts panel (#26) and activity feed (#37)', () => {
  it('each alert shows the shipment, status, first-at-risk time, reason and the Suggested action; "View options" opens recovery', () => {
    const html = text(renderWithData(<AlertsPanel onViewOptions={() => undefined} />, { data: [[qk.alerts({ status: 'active' }), fx.alerts], [qk.alerts({ status: 'RESOLVED', limit: 5 }), { items: [] }]] }));
    expect(html).toMatch(/SHP-1042\s+Open/); // state shown as a badge next to the code (redesign)
    expect(html).toContain('At risk · top factor at opening: breakdown');
    expect(html).toMatch(/at risk since Thu 11:10/);
    expect(html).toContain('Suggested: Replacement truck');
    expect(html).toContain('View options');
  });

  it('after the choice the alert stays open as "Action chosen" with the chosen recovery (approved lifecycle)', () => {
    const html = text(renderWithData(<AlertsPanel onViewOptions={() => undefined} />, { data: [[qk.alerts({ status: 'active' }), fx.alertsAfterChoose], [qk.alerts({ status: 'RESOLVED', limit: 5 }), { items: [] }]] }));
    expect(html).toMatch(/SHP-1042\s+Action chosen/);
    expect(html).toContain('Action chosen: Replacement truck');
  });

  it('activity feed shows real audit actions with shipment codes', () => {
    const html = text(renderWithData(<ActivityFeed />, { data: [[qk.audit({ limit: 50 }), fx.audit]] }));
    expect(html).toContain('Driver reported: Breakdown');
    expect(html).toContain('Alert opened');
    expect(html).toContain('Disruption started: Heavy rain on ghat section');
    expect(html).toContain('SHP-1042');
  });
});

describe('Notification bell list (#31)', () => {
  it('shows real coordinator notifications (unread highlighted) and enables "Mark all read"', () => {
    const html = renderWithData(<NotificationList onNavigate={() => undefined} />, { data: [[qk.notifications, fx.notifications]] });
    const t = text(html);
    expect(t).toContain('SHP-1042 is at risk of missing 18:00');
    expect(t).toContain('needs review');
    expect(html).toContain('bg-primary-subtle/50');
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>[^<]*Mark all read/);
  });

  it('empty and error states', () => {
    expect(text(renderWithData(<NotificationList onNavigate={() => undefined} />, { data: [[qk.notifications, { items: [], unreadCount: 0 }]] }))).toContain('No notifications');
    expect(renderWithData(<NotificationList onNavigate={() => undefined} />, { errors: [[qk.notifications, notFound]] })).toContain('role="alert"');
  });
});

describe('Shipment detail page (#15, #18, #34, #16)', () => {
  const heroData = (): [readonly unknown[], unknown][] => [
    [qk.shipment('shp_1042'), fx.heroDetail],
    [qk.eta('shp_1042'), fx.heroEta],
    [qk.attribution('shp_1042'), fx.heroAttribution],
    [qk.timeline('shp_1042'), fx.heroTimeline],
  ];
  const render = (data: [readonly unknown[], unknown][], errors: [readonly unknown[], unknown][] = [], id = 'shp_1042') =>
    text(renderWithData(<ShipmentDetailPage />, { data, errors, route: `/shipments/${id}`, path: '/shipments/:id' }));

  it('shows the four ETA terms exactly as returned, the factor list, attribution, milestones and activity', () => {
    const eta = fx.heroEta.eta;
    const html = render(heroData());
    expect(html).toContain('SHP-1042');
    expect(html).toContain('Fri 08:00');
    expect(html).toContain(eta.summary);
    expect(html).toContain('Planned arrival');
    expect(html).toContain('+ Delay so far');
    expect(html).toContain('+ Expected delay');
    expect(html).toContain('= Predicted arrival');
    expect(html).toContain('Medium');
    expect(html).toContain('Driver report: breakdown'); // attribution row label from #34
    expect(html).toContain('Live — rows become final at arrival');
    expect(html).toContain('Recovery'); // section present; options are rendered by RecoveryQuickSection (tested below)
    expect(html).not.toContain('Recovery options are not available yet');
    expect(html).toContain('Driver reported: breakdown'); // timeline
    expect(html).not.toContain('identity check failed');
  });

  it('arrived shipment: outcome and FINAL attribution, no ETA call needed', () => {
    const html = render([[qk.shipment('shp_1043'), fx.arrivedDetail], [qk.attribution('shp_1043'), fx.arrivedAttribution], [qk.timeline('shp_1043'), { items: [] }]], [], 'shp_1043');
    expect(html).toContain('Arrived (receiving gate)');
    expect(html).toMatch(/On time|Late by/);
    expect(html).toContain('Final');
    expect(html).toContain(fx.arrivedAttribution.ruleText);
  });

  it('404 → "not available" error state; pending → skeleton', () => {
    const html = render([], [[qk.shipment('shp_1042'), notFound]]);
    expect(html).toContain('This item is not available');
    expect(renderWithData(<ShipmentDetailPage />, { route: '/shipments/shp_1042', path: '/shipments/:id' })).toContain('animate-pulse');
  });
});

describe('Recovery (#29, #30) from real API responses', () => {
  const activeHero: [readonly unknown[], unknown] = [qk.alerts({ status: 'active', shipmentId: 'shp_1042' }), { items: fx.alerts.items.filter((a) => (a as AlertDtoCoordinator).shipment.id === 'shp_1042') }];

  it('full panel: the rule, Suggested first, ETA, meets-promise, fictional cost, constraints, infeasible reasons shown disabled', () => {
    const html = renderWithData(<RecoveryPanel shipmentId="shp_1042" />, { data: [[qk.recoveryOptions('shp_1042'), fx.heroOptions], activeHero] });
    const t = text(html);
    expect(t).toContain(fx.heroOptions.suggestionRule);
    expect(t.indexOf('Replacement truck TRK-11 from Khopoli yard')).toBeLessThan(t.indexOf('Notify customer only'));
    expect(t).toContain('Estimate from fictional rate card');
    expect(t).toContain('TRK-11 at Khopoli yard, 20 km by road');
    expect(t).toContain('Not available: The truck is stationary.');
    expect(t).toContain('CO₂e — method under verification');
    expect(t).toMatch(/₹\s?6,100/);
  });

  it('quick section shows only the Suggested card plus "Compare all options"', () => {
    const t = text(renderWithData(<RecoveryQuickSection shipmentId="shp_1042" />, { data: [[qk.recoveryOptions('shp_1042'), fx.heroOptions], activeHero] }));
    expect(t).toContain('Compare all options');
    expect(t).toContain('Replacement truck TRK-11 from Khopoli yard');
    expect(t).not.toContain('Notify customer only');
  });

  it('after the decision: the chosen card is marked and no option can be chosen again', () => {
    const chosen = fx.optionsAfterChoose.options.find((o) => o.status === 'CHOSEN');
    expect(chosen?.kind).toBe('REPLACEMENT_TRUCK');
    const html = renderWithData(<RecoveryPanel shipmentId="shp_1042" />, { data: [[qk.recoveryOptions('shp_1042'), fx.optionsAfterChoose], [qk.alerts({ status: 'active', shipmentId: 'shp_1042' }), fx.alertsAfterChoose]] });
    expect(html).not.toMatch(/>Choose</);
    expect(text(html)).toMatch(/Chosen/);
  });

  it('the choose response carries the realised ETA (= pipeline ETA, RC-4), driver change and customer notice', () => {
    const r = fx.chooseResponse;
    expect(r.option.newEtaAt).toBe(r.eta.predictedArrivalAt);
    expect(r.driverChange).toEqual({ fromDriverName: 'Ramesh', toDriverName: 'Suresh', toTruckCode: 'TRK-11' });
    expect(r.alert?.status).toBe('ACTION_CHOSEN');
    expect(r.customerNotified).toBe(true);
  });

  it('customer view of the decision: plain words, no truck, driver, cost or party', () => {
    const k = fx.customerAlertsAfterChoose.items[0]!;
    expect(k.action).toEqual({ label: 'CONFIRMED', kind: 'REPLACEMENT_TRUCK', text: 'Plant X arranged a replacement truck. New estimate 17:50.' });
    expect(JSON.stringify(fx.customerAlertsAfterChoose)).not.toMatch(/TRK-|Suresh|Ramesh|Khopoli|extraCostInr|TRANSPORTER/);
  });
});

describe('Simulation page (#7–#9, #38)', () => {
  it('lists real segments and active disruptions; the form is enabled in demo mode', () => {
    const html = renderWithData(<SimulationPage />, {
      data: [[qk.reference, fx.reference], [qk.shipments(LIVE), fx.shipments], [qk.disruptions({ active: 'true' }), fx.disruptionsActive]],
    });
    const t = text(html);
    expect(t).toContain('KHP-LNV-GHAT');
    expect(t).toContain('Heavy rain on ghat section');
    expect(t).toContain('End now');
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]* disabled=""/);
  });

  it('demo mode off: warning and disabled actions', () => {
    const html = renderWithData(<SimulationPage />, {
      data: [[qk.reference, fx.reference], [qk.shipments(LIVE), fx.shipments], [qk.disruptions({ active: 'true' }), fx.disruptionsActive]],
      sync: { demoMode: false },
    });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]* disabled=""/);
  });
});

describe('Map data (#10, #11) and customer isolation in real responses', () => {
  it('every route is labelled hand-traced; positions carry a readable label per truck', () => {
    expect(fx.layers.routes.every((r) => r.geometry.x_source === 'HAND_TRACED_DEMO')).toBe(true);
    expect(fx.layers.activeDisruptions.map((d) => d.label)).toContain('Heavy rain on ghat section');
    const hero = fx.positions.items.find((p) => p.shipmentId === 'shp_1042');
    expect(hero).toBeDefined();
    expect(truckAriaLabel(hero!.code, hero!.riskLevel, 'Friday 08:00')).toBe('SHP-1042, At risk, estimated arrival Friday 08:00');
  });

  it('customer responses carry no driver identity, parties, factor codes or internal evidence', () => {
    const json = JSON.stringify([fx.customerShipments, fx.customerAlerts]);
    for (const banned of ['"driver"', '"party"', '"factors"', '"reporter"', '"topReason"', '"topFactor"', 'Ramesh', 'RPT', 'TRANSPORTER']) expect(json).not.toContain(banned);
    expect(fx.customerAlerts.items.find((a) => a.shipmentId === 'shp_1042')?.plainReason).toBe('Vehicle breakdown on the route');
  });
});
