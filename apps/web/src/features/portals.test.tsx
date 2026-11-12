import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ClassifyResponse,
  CustomerAlertDto,
  DriverReportDto,
  DriverTripResponse,
  ListResponse,
  MapLayersResponse,
  NotificationsResponse,
  OrderDetail,
  OrderSummary,
  PositionsResponse,
  RecordMilestoneResponse,
  ReplayResponse,
  ShipmentDetail,
  ShipmentListItemCustomer,
  SyncResponse,
} from '../api/contract';
import { ApiRequestError } from '../api/client';
import { qk } from '../api/queryClient';
import { routes } from '../app/routes';
import { renderWithData, text } from '../test/render';
import { CustomerAlertBanner } from './customer/CustomerAlertBanner';
import NotificationsPage from './customer/NotificationsPage';
import OrderDetailPage from './customer/OrderDetailPage';
import OrdersPage, { sortOrdersForCustomer } from './customer/OrdersPage';
import ReportProblemPage from './driver/ReportProblemPage';
import TripPage from './driver/TripPage';
import ReplayPage, { initialSnapshotIndex, sliderText, snapshotIndexAt } from './replay/ReplayPage';
import { hourTicks } from './replay/EtaTimelineChart';
import { formatTime } from '../i18n/format';
import ReportsPage, { ReportCard, highlightParts } from './reports/ReportsPage';

/**
 * Milestone 9 portal screens rendered from REAL API responses (captured from the running backend
 * into `test/fixtures/api-11-20.json`: reset → 10:30 rain → 11:10 report → 11:20; then 11:25
 * replacement truck chosen; report confirmed; 18:05 arrival tapped). Not hand-written.
 */
interface Fixture {
  layers: MapLayersResponse;
  positions: PositionsResponse;
  customerShipments: ListResponse<ShipmentListItemCustomer>;
  heroDetail: { shipment: ShipmentDetail };
  m9Sync: SyncResponse;
  customerOrders: ListResponse<OrderSummary>;
  customerOrdersDelivered: ListResponse<OrderSummary>;
  customerOrderDetail: OrderDetail;
  customerHeroDetail: { shipment: ShipmentDetail };
  customerActiveAlerts: ListResponse<CustomerAlertDto>;
  customerNotifications: NotificationsResponse;
  tripRamesh: DriverTripResponse;
  classifyTyre: ClassifyResponse;
  reportsPending: ListResponse<DriverReportDto>;
  tripSuresh: DriverTripResponse;
  tripRameshAfterHandover: DriverTripResponse;
  heroReplay: ReplayResponse;
  quietReplay: ReplayResponse;
  reportsConfirmed: ListResponse<DriverReportDto>;
  tripSureshAtGate: DriverTripResponse;
  arrivedTap: RecordMilestoneResponse;
}
const fx = JSON.parse(readFileSync(new URL('../test/fixtures/api-11-20.json', import.meta.url), 'utf8')) as Fixture;
const sync = fx.m9Sync;
const notFound = new ApiRequestError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'This item is not available.', requestId: 'req-1' });
const heroOrderId = fx.customerOrderDetail.id;

/** Words that must never reach a customer screen (AC-M1.6): driver identity, parties, factor codes. */
const CUSTOMER_LEAKS = ['Ramesh', 'Suresh', 'TRK-', 'Transporter pace', 'Attributed', 'Unattributed', 'GATE', 'HIST', 'DISR', 'RPT', 'Driver reported', 'Breakdown'];

describe('Customer portal (#12, #13, #26, #28, #31)', () => {
  it('orders: "Your orders", alert banner with proposal and response buttons, at-risk order first', () => {
    const html = renderWithData(<OrdersPage />, {
      sync,
      data: [
        [qk.orders({ status: 'open' }), fx.customerOrders],
        [qk.shipments({ status: 'live', sort: 'promise' }), fx.customerShipments],
        [qk.alerts({ status: 'active' }), fx.customerActiveAlerts],
      ],
    });
    const s = text(html);
    expect(s).toContain('Your orders');
    expect(s).toContain('Order ORD-7781 is at risk of missing');
    expect(s).toContain('Vehicle breakdown on the route');
    expect(s).toContain('Proposed — Plant X team confirming: a replacement truck, new estimate 17:35.');
    for (const b of ['Accept proposal', 'Prefer to wait', 'Request a call']) expect(s).toContain(b);
    expect(s).toContain('ORD-7781');
    // The first card on screen is the worst-risk order (independent of the sort helper).
    const list = text(html.slice(html.indexOf('aria-label="Open orders"'))); // cards only, after the banners
    const firstCode = /ORD-\d+/.exec(list)?.[0];
    const worst = Math.max(...fx.customerOrders.items.map((o) => ['ON_TRACK', 'WATCH', 'AT_RISK', 'LATE'].indexOf(o.worstRiskLevel ?? '')));
    expect(['ON_TRACK', 'WATCH', 'AT_RISK', 'LATE'].indexOf(fx.customerOrders.items.find((o) => o.code === firstCode)!.worstRiskLevel ?? '')).toBe(worst);
    expect(sortOrdersForCustomer(fx.customerOrders.items)[0]?.code).toBe(firstCode);
    for (const leak of CUSTOMER_LEAKS) expect(s).not.toContain(leak);
  });

  it('sortOrdersForCustomer: worst risk first, orders without a live risk last, then by promise', () => {
    const mixed = [...fx.customerOrdersDelivered.items, ...[...fx.customerOrders.items].reverse()];
    const sorted = sortOrdersForCustomer(mixed);
    expect(sorted.slice(0, fx.customerOrders.items.length).every((o) => o.worstRiskLevel === 'AT_RISK')).toBe(true);
    expect(sorted.slice(fx.customerOrders.items.length).every((o) => o.worstRiskLevel === null)).toBe(true);
    const open = sorted.slice(0, fx.customerOrders.items.length).map((o) => o.promisedBy);
    expect(open).toEqual([...open].sort());
  });

  it('alert banner: without a proposal there is nothing to accept; a given response is acknowledged', () => {
    const a = fx.customerActiveAlerts.items[0]!;
    const noProposal = text(renderWithData(<CustomerAlertBanner alert={{ ...a, action: null }} />, { sync }));
    expect(noProposal).toContain('Plant X team is reviewing options.');
    expect(noProposal).not.toContain('Accept proposal');
    const answered = text(renderWithData(<CustomerAlertBanner alert={{ ...a, customerResponse: 'REQUEST_CALL', canRespond: false }} />, { sync }));
    expect(answered).toContain('Thanks — Plant X will confirm shortly. Your response: Requested a call.');
    expect(answered).not.toContain('Prefer to wait');
  });

  it('order detail: plain ETA card, milestones without actors, transporter name, no driver or internal data', () => {
    const html = renderWithData(<OrderDetailPage />, {
      sync,
      route: `/orders/${heroOrderId}`,
      path: '/orders/:id',
      data: [
        [qk.order(heroOrderId), fx.customerOrderDetail],
        [qk.shipment('shp_1042'), fx.customerHeroDetail],
        [qk.notifications, fx.customerNotifications],
        [qk.mapLayers, fx.layers],
        [qk.positions, fx.positions],
      ],
    });
    const s = text(html);
    expect(s).toContain('ORD-7781');
    expect(s).toContain('Estimated arrival at your gate');
    expect(s).toContain('Rule-based estimate');
    expect(s).toContain('Ghatline Carriers');
    expect(s).toContain('Gate out');
    expect(s).toContain('Updates for this order');
    for (const leak of CUSTOMER_LEAKS) expect(s).not.toContain(leak);
  });

  it('order detail: an order of another customer (404) shows the not-available state', () => {
    const s = text(renderWithData(<OrderDetailPage />, { sync, route: '/orders/ord_other', path: '/orders/:id', errors: [[qk.order('ord_other'), notFound]] }));
    expect(s).toContain('This item is not available');
  });

  it('notifications page lists the customer notices with "Mark all read"', () => {
    const s = text(renderWithData(<NotificationsPage />, { sync, data: [[qk.notifications, fx.customerNotifications], [qk.shipments({ status: 'all', sort: 'promise' }), fx.customerShipments]] }));
    expect(s).toContain('Mark all read');
    expect(fx.customerNotifications.items.length).toBeGreaterThan(0);
    expect(s).toContain(fx.customerNotifications.items[0]!.text);
  });
});

describe('Driver portal (#21, #17, #22, #23)', () => {
  it('trip: next step blocked with the server reason, open report, sticky "Report a problem"', () => {
    const html = renderWithData(<TripPage />, { sync, data: [[qk.trip, fx.tripRamesh]] });
    const s = text(html);
    expect(s).toContain('My trip');
    expect(s).toContain('SHP-1042 · Kestrel Moulders, Pune');
    expect(s).toContain('Confirm arrival');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Confirm arrival/);
    expect(s).toContain(fx.tripRamesh.items[0]!.nextBlockedReason!);
    expect(s).toContain('Breakdown');
    expect(s).toContain('Pending review');
    expect(html).toContain('href="/trip/report?shipment=shp_1042"');
    expect(html).toContain('min-h-14'); // 56 px primary targets (UI plan §12)
  });

  it('trip: the replacement driver gets the derived collect instruction', () => {
    const s = text(renderWithData(<TripPage />, { sync, data: [[qk.trip, fx.tripSuresh]] }));
    expect(s).toContain(fx.tripSuresh.items[0]!.instruction!);
    expect(s).toMatch(/Collect load from TRK-07 near .+ — transfer until \d\d:\d\d\./);
    expect(s).toContain('Truck is stopped');
  });

  it('trip: the previous driver sees the hand-over and the empty state', () => {
    const s = text(renderWithData(<TripPage />, { sync, data: [[qk.trip, fx.tripRameshAfterHandover]] }));
    expect(s).toContain('Load handed over to TRK-11 (Suresh) at 11:25. Your trip for SHP-1042 has ended.');
    expect(s).toContain('No trip assigned right now.');
    expect(s).not.toContain('Report a problem');
  });

  it('trip: at the customer gate the arrival can be confirmed (enabled) and explains the recorded time', () => {
    const html = renderWithData(<TripPage />, { sync, data: [[qk.trip, fx.tripSureshAtGate]] });
    const s = text(html);
    expect(s).toContain("At Kestrel Moulders's gate — confirm arrival");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Confirm arrival/);
    expect(s).toContain('not when you tap');
  });

  it('trip: load error shows a retry state', () => {
    const s = text(renderWithData(<TripPage />, { sync, errors: [[qk.trip, new ApiRequestError({ kind: 'http', status: 500, code: 'INTERNAL', message: 'Something failed.', requestId: 'req-9' })]] }));
    expect(s).toContain("Couldn't load your trip");
    expect(s).toContain('Try again');
  });

  it('report a problem: 8 chips (64 px), optional how-long chips, Send disabled until a reason is chosen', () => {
    const html = renderWithData(<ReportProblemPage />, { sync, route: '/trip/report?shipment=shp_1042', data: [[qk.trip, fx.tripRamesh]] });
    const s = text(html);
    for (const chip of ['Breakdown', 'Waiting at plant gate', 'Traffic jam', 'Road closed', 'Heavy rain', 'Documents / checkpost', 'Waiting to unload', 'Other']) expect(s).toContain(chip);
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(8 + 4);
    expect(html).toContain('min-h-16');
    for (const est of ['30 min', '1 h', '2 h', '4 h+']) expect(s).toContain(est);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Send report/s);
    expect(s).toContain('Shipment SHP-1042');
  });

  it('the captured milestone tap returns the driver trip shape with the arrival not at the tap time', () => {
    const r = fx.arrivedTap;
    expect(r.shipment).toMatchObject({ view: 'driver', currentMilestone: 'ARRIVED' });
    const arrived = r.milestones.find((m) => m.milestone === 'ARRIVED')!;
    expect(arrived.actorName).toBeNull();
    expect(arrived.at! < '2026-11-19T12:35:00.000Z').toBe(true); // tapped at 18:05 IST = 12:35Z
  });
});

describe('Coordinator report queue (#24, #25)', () => {
  it('pending card: highlighted keywords, reason, delay used, party, Confirm and Change', () => {
    const html = renderWithData(<ReportsPage />, { sync, data: [[qk.driverReports({ status: 'PENDING_REVIEW' }), fx.reportsPending]] });
    const s = text(html);
    expect(s).toContain('Driver reports');
    expect(s).toContain('SHP-1042');
    expect(html).toContain('<mark');
    expect(html).toMatch(/<mark[^>]*>tyre<\/mark>/);
    expect(s).toContain('Confirm');
    expect(s).toContain('Change reason / party');
    expect(s).toContain('Pending review');
  });

  it('confirmed card shows the reviewer and no action buttons', () => {
    const r = fx.reportsConfirmed.items[0]!;
    const s = text(renderWithData(<ReportCard r={r} />, { sync }));
    expect(s).toContain('Confirmed');
    expect(s).toContain('Reviewed by Meera');
    expect(s).not.toContain('Change reason / party');
  });

  it('highlightParts marks keywords case-insensitively and keeps the text intact', () => {
    const parts = highlightParts('Tyre puncture near Lonavala', ['tyre', 'puncture']);
    expect(parts.map((p) => p.text).join('')).toBe('Tyre puncture near Lonavala');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Tyre', 'puncture']);
    expect(highlightParts('a.b', ['.'])).toEqual([{ text: 'a', match: false }, { text: '.', match: true }, { text: 'b', match: false }]);
  });
});

describe('Replay (#19, golden G6)', () => {
  it('header callout, read-only banner, slider at the first-at-risk snapshot, play control and events', () => {
    const html = renderWithData(<ReplayPage />, {
      sync,
      route: '/shipments/shp_1042/replay',
      path: '/shipments/:id/replay',
      data: [
        [qk.replay('shp_1042'), fx.heroReplay],
        [qk.shipment('shp_1042'), fx.heroDetail],
        [qk.mapLayers, fx.layers],
        [qk.positions, fx.positions],
      ],
    });
    const s = text(html);
    expect(fx.heroReplay.leadTimeMinutes).toBe(410);
    expect(s).toContain('First at risk 11:10 · 6 h 50 m before promise');
    expect(s).toContain('Historical view, read-only');
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-valuetext="11:10, At risk, estimated arrival');
    expect(s).toContain('Play replay');
    expect(s).toContain('Driver reported: breakdown');
    expect(s).toContain('Recovery action chosen');
    expect(s).toContain('Promised by');
  });

  it('never-at-risk shipment says so; scrubber helpers snap to stored snapshots', () => {
    const s = text(renderWithData(<ReplayPage />, { sync, route: '/shipments/shp_1043/replay', path: '/shipments/:id/replay', data: [[qk.replay('shp_1043'), fx.quietReplay], [qk.mapLayers, fx.layers], [qk.positions, fx.positions]] }));
    expect(s).toContain('Never at risk');
    const r = fx.heroReplay;
    const i = initialSnapshotIndex(r);
    expect(r.snapshots[i]!.simTime).toBe(r.firstAtRiskAt);
    expect(initialSnapshotIndex(fx.quietReplay)).toBe(fx.quietReplay.snapshots.length - 1);
    expect(snapshotIndexAt(r, '2026-11-19T05:42:00.000Z')).toBe(i); // 11:12 → the 11:10 snapshot
    expect(snapshotIndexAt(r, '2000-01-01T00:00:00.000Z')).toBe(0);
    expect(sliderText(r.snapshots[i]!)).toMatch(/^11:10, At risk, estimated arrival /);
  });

  it('chart y ticks fall on whole IST hours', () => {
    const lo = Date.parse('2026-11-19T07:05:00.000Z'); // 12:35 IST
    const hi = Date.parse('2026-11-20T04:20:00.000Z'); // Fri 09:50 IST
    const ticks = hourTicks(lo, hi);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(6);
    for (const t of ticks) expect(formatTime(new Date(t).toISOString())).toMatch(/^\d\d:00$/);
    expect(formatTime(new Date(ticks[0]!).toISOString())).toBe('13:00');
  });

  it('replay of a missing or out-of-scope shipment shows the not-available state', () => {
    const s = text(renderWithData(<ReplayPage />, { sync, route: '/shipments/x/replay', path: '/shipments/:id/replay', errors: [[qk.replay('x'), notFound]] }));
    expect(s).toContain('This item is not available');
  });
});

describe('Routes', () => {
  it('every planned screen is built: the role trees have their pages, none is a placeholder (M10)', () => {
    const paths: string[] = [];
    const walk = (rs: typeof routes) => {
      for (const r of rs) {
        if (r.path) paths.push(r.path);
        const el = r.element as { props?: { title?: string; task?: string } } | undefined;
        expect(el?.props?.task).toBeUndefined(); // the removed placeholder took a "task" prop
        if (r.children) walk(r.children);
      }
    };
    walk(routes);
    for (const p of ['control-tower', 'shipments/:id', 'shipments/:id/replay', 'dashboard', 'reports', 'simulation', 'orders', 'orders/:id', 'notifications', 'trip', 'trip/report']) {
      expect(paths).toContain(p);
    }
  });
});
