/**
 * DEVELOPMENT MOCK of the RoutePulse API (`vite --mode mock`). In-memory, resets on page reload.
 *
 * It serves the 06_API_SPEC.md contract from fictional fixtures and follows ONE scripted scenario —
 * the hero SHP-1042 (journeys §3, engine doc §10). It does not simulate anything: every value comes
 * from a fixture, and actions only move the script between documented checkpoints:
 *   stage 0 → 1  coordinator injects heavy rain on the ghat section (POST /api/disruptions)
 *   stage 1 → 2  Ramesh reports a breakdown (POST /api/shipments/shp-1042/driver-reports) — clock set to 11:10
 *   stage 2      Arjun responds to the alert (POST /api/alerts/alr-1/customer-response) — clock set to 11:20
 *   stage 2 → 3  Meera chooses Replacement truck (POST …/recovery-options/opt-rt/choose) — clock set to 11:25
 * Anything outside the script answers with an "unavailable in mock mode" error rather than invented data.
 */
import { ApiRequestError } from '../api/client';
import type * as C from '../api/contract';
import type { RoutePulseApi } from '../api/services/types';
import { BACKGROUND, HERO_STAGES, type MockShipment } from './shipments';
import { CUSTOMERS, LANES, PLANT, ROUTES, TRANSPORTERS, TRUCKS, USERS, ist, pointAtFraction, type MockUser } from './world';

type Stage = 0 | 1 | 2 | 3;

const LATENCY_MS = 180;
const RULE_VERSION = 'mock';
const COST_NOTE = 'Estimate from fictional rate card';
const CO2E_NOTE = 'CO₂e — method under verification';
const SUGGESTION_RULE =
  'Suggested: among feasible options that meet the current promise, excluding Agree new window and Notify only, the lowest cost; ties → earliest ETA.';

let requestCounter = 0;
const rid = () => `mock-${(++requestCounter).toString().padStart(5, '0')}`;
const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

function fail(status: number, code: C.ErrorCode, message: string, details?: C.ValidationIssue[] | Record<string, unknown>): never {
  throw new ApiRequestError({ kind: 'http', status, code, message, details: details ?? null, requestId: rid() });
}
function unavailable(what: string): never {
  throw new ApiRequestError({
    kind: 'unavailable',
    message: `${what} is not available in mock mode yet. It needs the real API.`,
    requestId: rid(),
  });
}

interface MockState {
  sessionUserId: string | null;
  stage: Stage;
  simTime: string;
  running: boolean;
  speed: 1 | 10 | 60;
  worldVersion: number;
  customerResponse: { response: C.CustomerResponse; at: string } | null;
  readNotificationIds: Set<string>;
}

const initialState = (): MockState => ({
  sessionUserId: null,
  stage: 0,
  simTime: ist('10:30'),
  running: false,
  speed: 1,
  worldVersion: 1,
  customerResponse: null,
  readNotificationIds: new Set(),
});

export function createMockApi(): RoutePulseApi {
  let s = initialState();

  // ---------- helpers ----------
  const bump = () => {
    s.worldVersion += 1;
  };
  const currentUser = (): MockUser => {
    const u = USERS.find((x) => x.id === s.sessionUserId);
    if (!u) fail(401, 'UNAUTHENTICATED', 'Please sign in.');
    return u;
  };
  const requireRole = (...roles: MockUser['role'][]): MockUser => {
    const u = currentUser();
    if (!roles.includes(u.role)) fail(403, 'FORBIDDEN', 'This action is not available for your role.');
    return u;
  };
  const shipments = (): MockShipment[] => [HERO_STAGES[s.stage]!, ...BACKGROUND];
  const visibleShipments = (u: MockUser): MockShipment[] => {
    if (u.role === 'COORDINATOR') return shipments();
    if (u.role === 'CUSTOMER') return shipments().filter((x) => x.customerId === u.customerId);
    return shipments().filter((x) => x.driverUserId === u.id);
  };
  const findShipment = (u: MockUser, id: string): MockShipment => {
    const sh = visibleShipments(u).find((x) => x.id === id);
    if (!sh) fail(404, 'NOT_FOUND', 'This shipment is not available.');
    return sh;
  };
  const customer = (id: string) => CUSTOMERS.find((c) => c.id === id)!;
  const lane = (id: string) => LANES.find((l) => l.id === id)!;
  const transporter = (id: string) => TRANSPORTERS.find((t) => t.id === id)!;
  const route = (id: string) => ROUTES.find((r) => r.id === id)!;

  const toUserDto = (u: MockUser): C.UserDto => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    customer: u.customerId ? { id: u.customerId, name: customer(u.customerId).name } : null,
    transporter: u.transporterId ? { id: u.transporterId, name: transporter(u.transporterId).name } : null,
  });

  const simState = (): C.SimStateDto => ({
    simTime: s.simTime,
    running: s.running,
    speed: s.speed,
    stepMinutes: 5,
    worldVersion: s.worldVersion,
    simError: null,
    demoMode: true,
  });

  const currentMilestone = (sh: MockShipment): C.Milestone => sh.milestones[sh.milestones.length - 1]!.milestone;

  const milestoneEntries = (sh: MockShipment, hideActors: boolean): C.MilestoneEntry[] => {
    const all: C.Milestone[] = ['ORDER_CONFIRMED', 'TRUCK_ASSIGNED', 'AT_GATE', 'LOADING', 'GATE_OUT', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];
    const done = sh.milestones.length;
    return all.map((m, i) => {
      const rec = sh.milestones[i];
      const state: C.MilestoneEntry['state'] = i < done - 1 || (i === done - 1 && m === 'DELIVERED') ? 'DONE' : i === done - 1 ? 'CURRENT' : 'PENDING';
      return {
        milestone: m,
        state,
        at: rec?.at ?? null,
        source: rec?.source ?? null,
        actorName: hideActors ? null : (rec?.actorName ?? null),
      };
    });
  };

  const hasOpenAlert = (sh: MockShipment) => sh.id === 'shp-1042' && s.stage >= 2;

  const listItemCoordinator = (sh: MockShipment): C.ShipmentListItemCoordinator => {
    const c = customer(sh.customerId);
    const t = transporter(sh.transporterId);
    return {
      view: 'coordinator',
      id: sh.id,
      code: sh.code,
      orderId: sh.orderId,
      orderCode: sh.orderCode,
      customer: { id: c.id, name: c.name, city: c.city },
      lane: { id: sh.laneId, name: lane(sh.laneId).name },
      transporter: { id: t.id, name: t.name, isSmall: t.isSmall },
      truckCode: sh.truckCode,
      currentMilestone: currentMilestone(sh),
      etaAt: sh.eta?.predictedArrivalAt ?? null,
      etaLowAt: sh.eta?.etaLowAt ?? null,
      etaHighAt: sh.eta?.etaHighAt ?? null,
      promisedBy: sh.promisedBy,
      slackMinutes: sh.eta?.slackMinutes ?? null,
      riskLevel: sh.eta?.level ?? null,
      riskScore: sh.eta?.score ?? null,
      confidence: sh.eta?.confidence ?? null,
      hasOpenAlert: hasOpenAlert(sh),
      pendingReportCount: sh.pendingReportCount,
      parentShipmentId: null,
      arrivedAt: sh.arrivedAt,
      deliveredAt: sh.deliveredAt,
      onTime: sh.onTime,
      delayMinutes: sh.delayMinutes,
    };
  };

  const listItemCustomer = (sh: MockShipment): C.ShipmentListItemCustomer => ({
    view: 'customer',
    id: sh.id,
    code: sh.code,
    orderId: sh.orderId,
    orderCode: sh.orderCode,
    laneName: lane(sh.laneId).name,
    transporterName: transporter(sh.transporterId).name,
    currentMilestone: currentMilestone(sh),
    etaAt: sh.eta?.predictedArrivalAt ?? null,
    etaLowAt: sh.eta?.etaLowAt ?? null,
    etaHighAt: sh.eta?.etaHighAt ?? null,
    promisedBy: sh.promisedBy,
    riskLevel: sh.eta?.level ?? null,
    plainStatus: sh.plainStatus,
    arrivedAt: sh.arrivedAt,
    deliveredAt: sh.deliveredAt,
    onTime: sh.onTime,
  });

  const etaCoordinator = (sh: MockShipment): C.EtaExplanationCoordinator => {
    const e = sh.eta;
    if (!e) fail(409, 'INVALID_TRANSITION', 'This shipment has arrived; see the shipment detail.');
    const sum = (phase: C.Factor['phase']) => e.factors.filter((x) => x.phase === phase).reduce((a, x) => a + x.minutes, 0);
    const totals = { incurredMinutes: sum('INCURRED'), planChangeMinutes: sum('PLAN_CHANGE'), expectedMinutes: sum('EXPECTED') };
    const identityHolds =
      Date.parse(sh.plannedArrivalAt) + (totals.incurredMinutes + totals.planChangeMinutes + totals.expectedMinutes) * 60_000 ===
      Date.parse(e.predictedArrivalAt);
    return {
      view: 'coordinator',
      shipmentId: sh.id,
      simTime: s.simTime,
      ruleVersion: RULE_VERSION,
      plannedArrivalAt: sh.plannedArrivalAt,
      projectedRoadArrivalAt: e.projectedRoadArrivalAt,
      predictedArrivalAt: e.predictedArrivalAt,
      etaLowAt: e.etaLowAt,
      etaHighAt: e.etaHighAt,
      receivingWindow: e.receivingWindow,
      promisedBy: sh.promisedBy,
      slackMinutes: e.slackMinutes,
      level: e.level,
      score: e.score,
      confidence: e.confidence,
      confidenceReason: e.confidenceReason,
      summary: e.summary,
      factors: e.factors,
      totals,
      identityHolds,
      isRuleBased: true,
    };
  };

  const etaCustomer = (sh: MockShipment): C.EtaSummaryCustomer => {
    const e = sh.eta;
    if (!e) fail(409, 'INVALID_TRANSITION', 'This shipment has arrived; see the shipment detail.');
    return {
      view: 'customer',
      shipmentId: sh.id,
      predictedArrivalAt: e.predictedArrivalAt,
      etaLowAt: e.etaLowAt,
      etaHighAt: e.etaHighAt,
      promisedBy: sh.promisedBy,
      level: e.level,
      plainReason: e.plainReason,
      isRuleBased: true,
    };
  };

  // ---------- recovery options (hero only, stage ≥ 2) [doc: engine Example 2–3] ----------

  const option = (o: Partial<C.RecoveryOptionDto> & Pick<C.RecoveryOptionDto, 'id' | 'kind' | 'title'>): C.RecoveryOptionDto => ({
    optionSetId: 'os-1110',
    feasible: true,
    infeasibleReason: null,
    newEtaAt: null,
    etaLowAt: null,
    etaHighAt: null,
    meetsPromise: false,
    minutesSavedVsNotify: 0,
    newWindowEnd: null,
    extraCostInr: 0,
    costNote: COST_NOTE,
    co2eDeltaKg: null,
    co2eNote: CO2E_NOTE,
    isSuggested: false,
    constraints: [],
    status: 'PROPOSED',
    ...o,
  });

  const heroOptions = (): C.RecoveryOptionDto[] => {
    const chosen = s.stage === 3;
    const st = (kind: C.RecoveryKind): C.OptionStatus => (!chosen ? 'PROPOSED' : kind === 'REPLACEMENT_TRUCK' ? 'CHOSEN' : 'SUPERSEDED');
    return [
      option({
        id: 'opt-rt',
        kind: 'REPLACEMENT_TRUCK',
        title: 'Replacement truck from Khopoli',
        newEtaAt: chosen ? ist('17:50') : ist('17:35'),
        etaLowAt: chosen ? ist('17:10') : ist('16:55'),
        etaHighAt: chosen ? ist('18:30') : ist('18:15'),
        meetsPromise: true,
        minutesSavedVsNotify: chosen ? 850 : 865,
        extraCostInr: 6100,
        isSuggested: true,
        constraints: ['Needs TRK-11, free at Khopoli from 11:30', 'Travel 30 min + load transfer 45 min'],
        status: st('REPLACEMENT_TRUCK'),
      }),
      option({
        id: 'opt-split',
        kind: 'SPLIT',
        title: 'Send the urgent 8 t from the plant',
        newEtaAt: ist('18:16'),
        meetsPromise: false,
        minutesSavedVsNotify: 824,
        extraCostInr: 11800,
        constraints: ['Urgent part loads at Plant X until 12:05, alternate route', 'Remaining 14 t still arrives Fri 08:00'],
        status: st('SPLIT'),
      }),
      option({
        id: 'opt-reroute',
        kind: 'REROUTE',
        title: 'Reroute via the alternate route',
        feasible: false,
        infeasibleReason: 'Truck is stationary (breakdown)',
        status: st('REROUTE'),
      }),
      option({
        id: 'opt-window',
        kind: 'NEW_WINDOW',
        title: 'Agree a receiving window until 19:30',
        newEtaAt: ist('19:20'),
        newWindowEnd: ist('19:30'),
        meetsPromise: true,
        minutesSavedVsNotify: 760,
        constraints: ['Customer must accept the new window', 'Never auto-suggested'],
        status: st('NEW_WINDOW'),
      }),
      option({
        id: 'opt-notify',
        kind: 'NOTIFY_ONLY',
        title: 'Notify the customer only',
        newEtaAt: ist('08:00', 1),
        meetsPromise: false,
        constraints: ['No change to the plan'],
        status: st('NOTIFY_ONLY'),
      }),
    ];
  };

  // ---------- alerts ----------

  const alertCoordinator = (): C.AlertDtoCoordinator | null => {
    if (s.stage < 2) return null;
    const opts = heroOptions();
    const chosen = s.stage === 3 ? opts.find((o) => o.status === 'CHOSEN')! : null;
    return {
      view: 'coordinator',
      id: 'alr-1',
      status: s.stage === 3 ? 'ACTION_CHOSEN' : 'OPEN',
      openedAt: ist('11:10'),
      topFactor: 'RPT',
      topReason: 'BREAKDOWN',
      shipment: { id: 'shp-1042', code: 'SHP-1042', customerName: 'Kestrel Moulders', laneName: 'Plant X → Pune' },
      resolvedAt: null,
      summary: 'SHP-1042 at risk of missing Thu 18:00 — +180 min breakdown is the largest factor.',
      proposedOption: opts.find((o) => o.isSuggested) ?? null,
      chosenOption: chosen,
      chosenBy: chosen ? { id: 'usr-meera', name: 'Meera' } : null,
      chosenAt: chosen ? ist('11:25') : null,
      customerResponse: s.customerResponse?.response ?? null,
      customerRespondedAt: s.customerResponse?.at ?? null,
    };
  };

  const alertCustomer = (): C.CustomerAlertDto | null => {
    if (s.stage < 2) return null;
    const hero = HERO_STAGES[s.stage]!;
    return {
      view: 'customer',
      id: 'alr-1',
      status: s.stage === 3 ? 'ACTION_CHOSEN' : 'OPEN',
      openedAt: ist('11:10'),
      shipmentId: 'shp-1042',
      shipmentCode: 'SHP-1042',
      orderCode: 'ORD-7781',
      predictedArrivalAt: hero.eta!.predictedArrivalAt,
      etaLowAt: hero.eta!.etaLowAt,
      etaHighAt: hero.eta!.etaHighAt,
      promisedBy: hero.promisedBy,
      plainReason: hero.eta!.plainReason ?? 'Delay on the route',
      action:
        s.stage === 3
          ? { label: 'CONFIRMED', kind: 'REPLACEMENT_TRUCK', text: 'A replacement truck has taken over your load. Estimated arrival 17:50.' }
          : { label: 'PROPOSED', kind: 'REPLACEMENT_TRUCK', text: 'Proposed — Plant X team confirming: a replacement truck takes over the load; estimated arrival about 17:35.' },
      customerResponse: s.customerResponse?.response ?? null,
      customerRespondedAt: s.customerResponse?.at ?? null,
      canRespond: s.stage === 2,
    };
  };

  // ---------- notifications ----------

  const notifications = (audience: 'COORDINATOR' | 'CUSTOMER'): C.NotificationDto[] => {
    const list: C.NotificationDto[] = [];
    const n = (id: string, kind: C.NotificationKind, text: string, at: string): C.NotificationDto => ({
      id,
      kind,
      templateKey: kind.toLowerCase(),
      params: { shipmentCode: 'SHP-1042' },
      text,
      simTime: at,
      readAt: s.readNotificationIds.has(id) ? s.simTime : null,
      shipmentId: 'shp-1042',
      shipmentCode: 'SHP-1042',
      alertId: 'alr-1',
    });
    if (audience === 'COORDINATOR') {
      if (s.stage >= 2) {
        list.push(n('ntf-c1', 'AT_RISK', 'SHP-1042 is at risk of missing Thu 18:00.', ist('11:10')));
        list.push(n('ntf-c2', 'REPORT_NEEDS_REVIEW', 'Driver report on SHP-1042 needs your review.', ist('11:10')));
      }
      if (s.customerResponse) list.push(n('ntf-c3', 'CUSTOMER_RESPONDED', 'Kestrel Moulders responded to the SHP-1042 alert.', s.customerResponse.at));
    } else {
      if (s.stage >= 2)
        list.push(n('ntf-u1', 'AT_RISK_CUSTOMER', 'Order ORD-7781 may arrive later than promised. Plant X team is reviewing options.', ist('11:10')));
      if (s.stage === 3) list.push(n('ntf-u2', 'PLAN_UPDATED', 'Plan updated for ORD-7781: a replacement truck has taken over. Estimated arrival 17:50.', ist('11:25')));
    }
    return list.sort((a, b) => b.simTime.localeCompare(a.simTime));
  };

  const report = (): C.DriverReportDto | null =>
    s.stage < 2
      ? null
      : {
          id: 'rpt-1',
          shipmentId: 'shp-1042',
          shipmentCode: 'SHP-1042',
          reporter: { id: 'usr-ramesh', name: 'Ramesh' },
          simTime: ist('11:10'),
          chipReason: null,
          text: 'tyre puncture near Lonavala',
          suggestedReason: 'BREAKDOWN',
          matchedKeywords: ['tyre', 'puncture'],
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
        };

  const rainDisruption = (): C.DisruptionDto | null =>
    s.stage < 1
      ? null
      : {
          id: 'dis-rain',
          kind: 'WEATHER_SLOWDOWN',
          origin: 'SIMULATOR',
          label: 'Heavy rain on ghat section',
          segmentCodes: ['PNQ-GHAT'],
          shipmentId: null,
          slowdownPct: 65,
          extraMinutesPerTruck: null,
          stopMinutes: null,
          party: 'EXTERNAL',
          reason: 'HEAVY_RAIN',
          startsAt: ist('10:30'),
          endsAt: ist('18:30'),
          endedEarlyAt: null,
          active: true,
        };

  const auditItems = (): C.AuditItem[] => {
    const a = (id: string, action: string, at: string, actor: MockUser | null, data: Record<string, unknown>, entityType = 'Shipment', entityId: string | null = 'shp-1042'): C.AuditItem => ({
      id,
      actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
      action,
      entityType,
      entityId,
      simTime: at,
      createdAt: at,
      data,
    });
    const meera = USERS[0]!;
    const arjun = USERS[1]!;
    const ramesh = USERS[2]!;
    const items: C.AuditItem[] = [
      a('aud-1', 'milestone.record', ist('09:30'), ramesh, { shipmentCode: 'SHP-1042', milestone: 'GATE_OUT' }),
      a('aud-2', 'milestone.record', ist('09:50'), null, { shipmentCode: 'SHP-1031', milestone: 'ARRIVED' }, 'Shipment', 'shp-1031'),
      a('aud-0', 'sim.clock', ist('10:30'), meera, { action: 'PAUSE' }, 'SimState', null),
    ];
    if (s.stage >= 1) items.push(a('aud-3', 'disruption.create', ist('10:30'), meera, { label: 'Heavy rain on ghat section', affectedCount: 1 }, 'Disruption', 'dis-rain'));
    if (s.stage >= 2) {
      items.push(a('aud-4', 'report.create', ist('11:10'), ramesh, { shipmentCode: 'SHP-1042', reason: 'BREAKDOWN' }, 'DriverReport', 'rpt-1'));
      items.push(a('aud-5', 'alert.open', ist('11:10'), null, { shipmentCode: 'SHP-1042', level: 'AT_RISK' }, 'Alert', 'alr-1'));
    }
    if (s.customerResponse) items.push(a('aud-6', 'alert.customerResponse', s.customerResponse.at, arjun, { shipmentCode: 'SHP-1042', response: s.customerResponse.response }, 'Alert', 'alr-1'));
    if (s.stage === 3) items.push(a('aud-7', 'recovery.choose', ist('11:25'), meera, { shipmentCode: 'SHP-1042', kind: 'REPLACEMENT_TRUCK' }, 'RecoveryOption', 'opt-rt'));
    return items.sort((x, y) => (y.simTime ?? '').localeCompare(x.simTime ?? ''));
  };

  const driverTripShipment = (sh: MockShipment): C.DriverTripShipment => {
    const c = customer(sh.customerId);
    const stage2 = s.stage === 2;
    return {
      view: 'driver',
      id: sh.id,
      code: sh.code,
      customerName: c.name,
      city: c.city,
      destination: { lat: c.lat, lng: c.lng },
      currentMilestone: currentMilestone(sh),
      nextMilestone: 'ARRIVED',
      canRecordNext: false,
      nextBlockedReason: 'Not at the destination yet',
      etaAt: sh.eta?.predictedArrivalAt ?? null,
      promisedBy: sh.promisedBy,
      stopped: sh.stopped,
      instruction: stage2 ? 'Stay with the truck. Plant X team is arranging help.' : s.stage === 3 ? 'Collect load from TRK-07 near Lonavala' : null,
      openReports: report() ? [{ id: 'rpt-1', reason: 'BREAKDOWN', status: 'PENDING_REVIEW', simTime: ist('11:10') }] : [],
    };
  };

  // ---------- API ----------

  const api: RoutePulseApi = {
    async login({ email }) {
      await wait();
      const u = USERS.find((x) => x.email === email.trim().toLowerCase());
      if (!u) fail(401, 'UNAUTHENTICATED', 'Email or password is incorrect');
      s.sessionUserId = u.id;
      const homePath = u.role === 'COORDINATOR' ? '/control-tower' : u.role === 'CUSTOMER' ? '/orders' : '/trip';
      return { user: toUserDto(u), homePath };
    },
    async logout() {
      await wait();
      s.sessionUserId = null;
    },
    async me() {
      await wait();
      return { user: toUserDto(currentUser()) };
    },
    async sync() {
      const u = currentUser();
      const unread =
        u.role === 'DRIVER' ? 0 : notifications(u.role === 'COORDINATOR' ? 'COORDINATOR' : 'CUSTOMER').filter((n) => !n.readAt).length;
      return { ...simState(), unreadNotifications: unread };
    },
    async simClock(body) {
      await wait();
      requireRole('COORDINATOR');
      if (body.action === 'PLAY') s.running = true;
      else if (body.action === 'PAUSE') s.running = false;
      else if (body.action === 'SET_SPEED') s.speed = body.speed;
      else unavailable('Advancing the simulation clock');
      bump();
      return { ...simState(), stepsExecuted: 0 };
    },
    async simReset() {
      await wait();
      requireRole('COORDINATOR');
      const keep = s.sessionUserId;
      s = initialState();
      s.sessionUserId = keep;
      s.worldVersion = Date.now() % 100_000;
      return { ...simState(), durationMs: LATENCY_MS };
    },
    async listDisruptions() {
      await wait();
      requireRole('COORDINATOR');
      const d = rainDisruption();
      return { items: d ? [d] : [] };
    },
    async createDisruption(body) {
      await wait();
      requireRole('COORDINATOR');
      const isScriptedRain = body.kind === 'WEATHER_SLOWDOWN' && body.segmentCodes.includes('PNQ-GHAT');
      if (!isScriptedRain || s.stage !== 0) unavailable('Only the scripted heavy-rain event on the ghat section (from 10:30, before any other step)');
      s.stage = 1;
      bump();
      return {
        disruption: rainDisruption()!,
        impact: {
          affectedShipmentIds: ['shp-1042'],
          affectedCount: 1,
          levelChanges: [{ shipmentId: 'shp-1042', code: 'SHP-1042', from: 'ON_TRACK', to: 'WATCH' }],
          nowAtRiskCount: 0,
          summary: '1 shipment affected · 0 at risk · 1 now Watch',
        },
      };
    },
    async endDisruption() {
      await wait();
      unavailable('Ending a disruption early');
    },
    async mapLayers() {
      await wait();
      const u = currentUser();
      const visible = visibleShipments(u);
      const laneIds = new Set(visible.map((x) => x.laneId));
      const custIds = new Set(visible.map((x) => x.customerId));
      const isCoord = u.role === 'COORDINATOR';
      return {
        plant: PLANT,
        sites: CUSTOMERS.filter((c) => isCoord || custIds.has(c.id)).map((c) => ({
          customerId: c.id,
          name: c.name,
          city: c.city,
          lat: c.lat,
          lng: c.lng,
          receivingHours: c.receivingHours,
        })),
        routes: ROUTES.filter((r) => isCoord || laneIds.has(r.laneId)).map((r) => ({
          id: r.id,
          code: r.code,
          laneId: r.laneId,
          name: r.name,
          isPrimary: r.isPrimary,
          lengthKm: r.lengthKm,
          geometry: { type: 'LineString', coordinates: r.coordinates },
          segments: r.segments,
        })),
        activeDisruptions:
          isCoord && s.stage >= 1 ? [{ id: 'dis-rain', kind: 'WEATHER_SLOWDOWN', label: 'Heavy rain on ghat section', segmentCodes: ['PNQ-GHAT'] }] : [],
      };
    },
    async positions() {
      const u = currentUser();
      return {
        simTime: s.simTime,
        items: visibleShipments(u)
          .filter((sh) => !sh.deliveredAt)
          .map((sh) => {
            const p = pointAtFraction(route(sh.routeId).coordinates, sh.progressPct / 100);
            return {
              shipmentId: sh.id,
              code: sh.code,
              routeId: sh.routeId,
              lat: p.lat,
              lng: p.lng,
              bearing: Math.round(p.bearing),
              progressPct: sh.progressPct,
              currentMilestone: currentMilestone(sh),
              riskLevel: sh.eta?.level ?? null,
              stopped: sh.stopped,
            };
          }),
      };
    },
    async listOrders() {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const byOrder = new Map<string, MockShipment[]>();
      for (const sh of visibleShipments(u)) byOrder.set(sh.orderId, [...(byOrder.get(sh.orderId) ?? []), sh]);
      return { items: [...byOrder.values()].map(orderSummary) };
    },
    async getOrder(orderId) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const shs = visibleShipments(u).filter((x) => x.orderId === orderId);
      if (shs.length === 0) fail(404, 'NOT_FOUND', 'This order is not available.');
      return { ...orderSummary(shs), shipments: shs.map((x) => (u.role === 'CUSTOMER' ? listItemCustomer(x) : listItemCoordinator(x))) };
    },
    async listShipments(query = {}) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      let list = visibleShipments(u);
      const status = query.status ?? 'live';
      if (status === 'live') list = list.filter((x) => !x.deliveredAt);
      if (status === 'delivered') list = list.filter((x) => x.deliveredAt);
      if (query.riskLevel?.length) list = list.filter((x) => x.eta && query.riskLevel!.includes(x.eta.level));
      if (query.q) list = list.filter((x) => x.code.toLowerCase().includes(query.q!.toLowerCase()));
      const sort = query.sort ?? 'risk';
      list = [...list].sort((a, b) => {
        if (sort === 'risk') return (b.eta?.score ?? -1) - (a.eta?.score ?? -1);
        if (sort === 'promise') return a.promisedBy.localeCompare(b.promisedBy);
        return (a.eta?.predictedArrivalAt ?? '9').localeCompare(b.eta?.predictedArrivalAt ?? '9');
      });
      return { items: list.map((x) => (u.role === 'CUSTOMER' ? listItemCustomer(x) : listItemCoordinator(x))) };
    },
    async getShipment(id) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const sh = findShipment(u, id);
      if (u.role === 'CUSTOMER') {
        return {
          shipment: {
            ...listItemCustomer(sh),
            items: sh.items.map((i) => ({ gradeCode: i.gradeCode, quantityT: i.quantityT })),
            milestones: milestoneEntries(sh, true),
            eta: etaCustomer(sh),
            openAlert: sh.id === 'shp-1042' ? alertCustomer() : null,
          },
        };
      }
      const r = route(sh.routeId);
      const alert = sh.id === 'shp-1042' ? alertCoordinator() : null;
      return {
        shipment: {
          ...listItemCoordinator(sh),
          route: { id: r.id, code: r.code, name: r.name, isPrimary: r.isPrimary, lengthKm: r.lengthKm },
          driver: sh.driverName ? { id: sh.driverUserId ?? `drv-${sh.id}`, name: sh.driverName, phone: null } : null,
          items: sh.items,
          milestones: milestoneEntries(sh, false),
          plannedArrivalAt: sh.plannedArrivalAt,
          originalPromisedBy: sh.originalPromisedBy,
          renegotiated: false,
          receivingWindowOverrideEndAt: null,
          progressKm: Math.round((r.lengthKm * sh.progressPct) / 100),
          stopped: sh.stopped,
          stoppedUntil: sh.stoppedUntil,
          lastUpdateAt: sh.lastUpdateAt,
          firstAtRiskAt: sh.firstAtRiskAt,
          customerNotifiedAt: sh.customerNotifiedAt,
          physicalArrivalAt: sh.physicalArrivalAt,
          childShipmentIds: [],
          openAlert: alert ? { id: alert.id, status: alert.status, openedAt: alert.openedAt, topFactor: alert.topFactor, topReason: alert.topReason } : null,
          latestCustomerResponse: sh.id === 'shp-1042' ? s.customerResponse : null,
        },
      };
    },
    async getTimeline() {
      await wait();
      unavailable('The shipment timeline');
    },
    async recordMilestone() {
      await wait();
      unavailable('Recording milestones');
    },
    async getEta(id) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const sh = findShipment(u, id);
      return { eta: u.role === 'CUSTOMER' ? etaCustomer(sh) : etaCoordinator(sh) };
    },
    async getReplay() {
      await wait();
      unavailable('Replay');
    },
    async getRules() {
      await wait();
      unavailable('The rules page');
    },
    async getTrip() {
      await wait();
      const u = requireRole('DRIVER');
      const mine = visibleShipments(u);
      return {
        items: mine.map(driverTripShipment),
        recentHandovers:
          u.id === 'usr-ramesh' && s.stage === 3
            ? [{ shipmentId: 'shp-1042', shipmentCode: 'SHP-1042', toTruckCode: 'TRK-11', toDriverName: 'Vikram', at: ist('11:25') }]
            : [],
      };
    },
    async classify() {
      await wait();
      unavailable('Reason suggestion');
    },
    async createDriverReport(id, body) {
      await wait();
      const u = requireRole('DRIVER', 'COORDINATOR');
      findShipment(u, id);
      if (id !== 'shp-1042' || s.stage !== 1 || body.reason !== 'BREAKDOWN') {
        unavailable('Only the scripted breakdown report on SHP-1042 (after the rain event)');
      }
      s.stage = 2;
      s.simTime = ist('11:10');
      bump();
      return { report: report()!, trip: u.role === 'DRIVER' ? driverTripShipment(HERO_STAGES[2]!) : null };
    },
    async listDriverReports(query = {}) {
      await wait();
      requireRole('COORDINATOR');
      const r = report();
      const status = query.status ?? 'PENDING_REVIEW';
      return { items: r && r.status === status && (!query.shipmentId || query.shipmentId === r.shipmentId) ? [r] : [] };
    },
    async reviewDriverReport() {
      await wait();
      unavailable('Reviewing driver reports');
    },
    async listAlerts(query = {}) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const a = u.role === 'CUSTOMER' ? (u.customerId === 'cus-kestrel' ? alertCustomer() : null) : alertCoordinator();
      const status = query.status ?? 'active';
      const matches = a && (status === 'active' ? a.status !== 'RESOLVED' : a.status === status);
      return { items: matches && (!query.shipmentId || query.shipmentId === 'shp-1042') ? [a] : [] };
    },
    async getAlert(id) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const a = u.role === 'CUSTOMER' ? (u.customerId === 'cus-kestrel' ? alertCustomer() : null) : alertCoordinator();
      if (!a || a.id !== id) fail(404, 'NOT_FOUND', 'This alert is not available.');
      return { alert: a };
    },
    async respondToAlert(id, body) {
      await wait();
      const u = requireRole('CUSTOMER');
      const a = u.customerId === 'cus-kestrel' ? alertCustomer() : null;
      if (!a || a.id !== id) fail(404, 'NOT_FOUND', 'This alert is not available.');
      if (!a.canRespond) fail(409, 'INVALID_TRANSITION', 'This alert can no longer be answered.');
      s.customerResponse = { response: body.response, at: ist('11:20') };
      if (Date.parse(s.simTime) < Date.parse(ist('11:20'))) s.simTime = ist('11:20');
      bump();
      return { alert: alertCustomer()! };
    },
    async getRecoveryOptions(id) {
      await wait();
      const u = requireRole('COORDINATOR');
      const sh = findShipment(u, id);
      if (sh.id !== 'shp-1042' || s.stage < 2) {
        return { shipmentId: sh.id, optionSetId: null, generatedAt: null, suggestionRule: SUGGESTION_RULE, options: [] };
      }
      return { shipmentId: sh.id, optionSetId: 'os-1110', generatedAt: ist('11:10'), suggestionRule: SUGGESTION_RULE, options: heroOptions() };
    },
    async chooseRecovery(id, optionId, body) {
      await wait();
      const u = requireRole('COORDINATOR');
      findShipment(u, id);
      if (id !== 'shp-1042' || s.stage < 2) fail(404, 'NOT_FOUND', 'This recovery option is not available.');
      if (body.optionSetId !== 'os-1110') fail(409, 'STALE_OPTIONS', 'Options changed — review the updated cards.', { currentOptionSetId: 'os-1110' });
      if (s.stage === 3) fail(409, 'ALREADY_DONE', 'An option has already been chosen for this alert.');
      const opt = heroOptions().find((o) => o.id === optionId);
      if (!opt) fail(404, 'NOT_FOUND', 'This recovery option is not available.');
      if (!opt.feasible) fail(409, 'STALE_OPTIONS', opt.infeasibleReason ?? 'This option is not feasible.', { currentOptionSetId: 'os-1110' });
      if (opt.kind !== 'REPLACEMENT_TRUCK') unavailable(`Choosing "${opt.title}" (the mock scripts only the documented Replacement truck choice)`);
      s.stage = 3;
      s.simTime = ist('11:25');
      bump();
      const hero = HERO_STAGES[3]!;
      return {
        option: heroOptions().find((o) => o.id === 'opt-rt')!,
        alert: alertCoordinator(),
        shipment: listItemCoordinator(hero),
        eta: etaCoordinator(hero),
        childShipment: null,
        driverChange: { fromDriverName: 'Ramesh', toDriverName: 'Vikram', toTruckCode: 'TRK-11' },
        customerNotified: true,
      };
    },
    async listNotifications() {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const items = notifications(u.role === 'COORDINATOR' ? 'COORDINATOR' : 'CUSTOMER');
      return { items, unreadCount: items.filter((n) => !n.readAt).length };
    },
    async markNotificationRead(id) {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const aud = u.role === 'COORDINATOR' ? 'COORDINATOR' : 'CUSTOMER';
      if (!notifications(aud).some((n) => n.id === id)) fail(404, 'NOT_FOUND', 'This notification is not available.');
      s.readNotificationIds.add(id);
      const items = notifications(aud);
      return { notification: items.find((n) => n.id === id)!, unreadCount: items.filter((n) => !n.readAt).length };
    },
    async markAllNotificationsRead() {
      await wait();
      const u = requireRole('COORDINATOR', 'CUSTOMER');
      const items = notifications(u.role === 'COORDINATOR' ? 'COORDINATOR' : 'CUSTOMER').filter((n) => !n.readAt);
      for (const n of items) s.readNotificationIds.add(n.id);
      return { updated: items.length, unreadCount: 0 };
    },
    async getAttribution() {
      await wait();
      unavailable('Attribution');
    },
    async overrideAttribution() {
      await wait();
      unavailable('Attribution overrides');
    },
    async dashboard() {
      await wait();
      unavailable('Analytics (needs the 60-day seeded history)');
    },
    async audit(query = {}) {
      await wait();
      requireRole('COORDINATOR');
      let items = auditItems();
      if (query.shipmentId) items = items.filter((i) => i.data.shipmentCode === shipments().find((x) => x.id === query.shipmentId)?.code);
      return { items: items.slice(0, query.limit ?? 100) };
    },
    async reference() {
      await wait();
      requireRole('COORDINATOR');
      return {
        lanes: LANES,
        routes: ROUTES.map((r) => ({ id: r.id, code: r.code, laneId: r.laneId, name: r.name, isPrimary: r.isPrimary, segments: r.segments })),
        segments: ROUTES.flatMap((r) => r.segments.map((g) => ({ segmentCode: g.segmentCode, name: g.name, routeCodes: [r.code] }))),
        transporters: TRANSPORTERS,
        customers: CUSTOMERS.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city })),
        trucks: TRUCKS,
      };
    },
  };

  function orderSummary(shs: MockShipment[]): C.OrderSummary {
    const first = shs[0]!;
    const c = customer(first.customerId);
    const rank: Record<C.RiskLevel, number> = { ON_TRACK: 0, WATCH: 1, AT_RISK: 2, LATE: 3 };
    const levels = shs.map((x) => x.eta?.level).filter((l): l is C.RiskLevel => !!l);
    return {
      id: first.orderId,
      code: first.orderCode,
      customer: { id: c.id, name: c.name },
      promisedBy: first.promisedBy,
      lines: first.items.map((i) => ({ gradeCode: i.gradeCode, quantityT: i.quantityT })),
      shipmentCount: shs.length,
      status: shs.every((x) => x.deliveredAt) ? 'DELIVERED' : 'OPEN',
      worstRiskLevel: levels.length ? levels.reduce((a, b) => (rank[b] > rank[a] ? b : a)) : null,
    };
  }

  return api;
}
