import type {
  Confidence,
  FactorCode,
  Milestone,
  Party,
  ReasonCode,
  RecoveryKind,
  RiskLevel,
  CustomerResponse,
  DriverReasonCode,
  Role,
} from '../api/contract';

/**
 * English UI strings. Wording follows 02_PRODUCT_SPEC.md §10 and 07_UI_UX_PLAN.md §1.7:
 * "Estimated arrival", "Attributed to", "At risk of missing the promised time", "rule-based".
 * Second language stays disabled until G-LANG passes (L10).
 */
export const riskLabel: Record<RiskLevel, string> = {
  ON_TRACK: 'On track',
  WATCH: 'Watch',
  AT_RISK: 'At risk',
  LATE: 'Late',
};

/** Spec §5.3 milestone names. ARRIVED is arrival at the receiving gate (L1); DELIVERED is unloading complete. */
export const milestoneLabel: Record<Milestone, string> = {
  ORDER_CONFIRMED: 'Order confirmed',
  TRUCK_ASSIGNED: 'Truck assigned',
  AT_GATE: 'Reported at plant gate',
  LOADING: 'Loading',
  GATE_OUT: 'Gate out',
  IN_TRANSIT: 'In transit',
  ARRIVED: 'Arrived at customer',
  DELIVERED: 'Delivered (unloading complete)',
};

export const partyLabel: Record<Party, string> = {
  PLANT: 'Plant',
  TRANSPORTER: 'Transporter',
  CUSTOMER: 'Customer',
  EXTERNAL: 'External',
  UNATTRIBUTED: 'Unattributed',
};

/** Spec §5.4 factor names. */
export const factorLabel: Record<FactorCode, string> = {
  GATE: 'Plant gate & loading wait',
  HIST: 'Transporter lane history',
  DISR: 'Active disruption on route',
  RPT: 'Driver-reported issue',
  WIN: 'Receiving window (knock-on)',
};

export const reasonLabel: Record<ReasonCode, string> = {
  BREAKDOWN: 'Breakdown',
  PLANT_GATE_WAIT: 'Plant gate wait',
  TRAFFIC: 'Traffic',
  ROAD_CLOSED: 'Road closed',
  HEAVY_RAIN: 'Heavy rain',
  DOCUMENTS: 'Documents',
  UNLOADING_WAIT: 'Unloading wait',
  OTHER: 'Other',
  TRANSPORTER_PACE: 'Transporter pace',
  RECEIVING_WINDOW: 'Receiving window',
};

export const confidenceLabel: Record<Confidence, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const recoveryKindLabel: Record<RecoveryKind, string> = {
  REROUTE: 'Reroute',
  SPLIT: 'Split shipment',
  REPLACEMENT_TRUCK: 'Replacement truck',
  NEW_WINDOW: 'Agree new receiving window',
  NOTIFY_ONLY: 'Notify only',
};

export const customerResponseLabel: Record<CustomerResponse, string> = {
  ACCEPT_PROPOSAL: 'Accepted proposal',
  PREFER_TO_WAIT: 'Prefers to wait',
  REQUEST_CALL: 'Requested a call',
};

/** Driver reason chips (UI plan §12.2): plain words for the driver, mapped to the shared reason codes. */
export const driverChipLabel: Record<DriverReasonCode, string> = {
  BREAKDOWN: 'Breakdown',
  PLANT_GATE_WAIT: 'Waiting at plant gate',
  TRAFFIC: 'Traffic jam',
  ROAD_CLOSED: 'Road closed',
  HEAVY_RAIN: 'Heavy rain',
  DOCUMENTS: 'Documents / checkpost',
  UNLOADING_WAIT: 'Waiting to unload',
  OTHER: 'Other',
};

/** Driver next-step button text (UI plan §12.1). Only the four driver milestones are tappable. */
export const nextStepAction: Partial<Record<Milestone, string>> = {
  AT_GATE: 'Report at plant gate',
  GATE_OUT: 'Mark gate out',
  ARRIVED: 'Confirm arrival',
  DELIVERED: 'Confirm unloading complete',
};

/** Customer response buttons (UI plan §11.1, AC-M4.6). */
export const customerResponseAction: Record<CustomerResponse, string> = {
  ACCEPT_PROPOSAL: 'Accept proposal',
  PREFER_TO_WAIT: 'Prefer to wait',
  REQUEST_CALL: 'Request a call',
};

export const roleLabel: Record<Role, string> = {
  COORDINATOR: 'Coordinator',
  CUSTOMER: 'Customer',
  DRIVER: 'Driver',
};

export const t = {
  appName: 'RoutePulse',
  tagline: 'Know it will be late hours before it is — know why, and fix it.',
  fictionalNotice: 'Fictional data · Plant X',
  fictionalDemo: 'Fictional demo · Plant X is a fictional company',
  timesInIst: 'Times shown in IST',
  ruleBased: 'Rule-based estimate',
  mockBanner:
    'Development mock mode — fictional fixture data served in the browser. No backend is connected; actions follow a scripted scenario.',
  login: {
    title: 'Sign in',
    email: 'Email',
    password: 'Password',
    show: 'Show password',
    hide: 'Hide password',
    submit: 'Sign in',
    incorrect: 'Email or password is incorrect',
    rateLimited: 'Too many attempts. Try again in a minute.',
    sessionEnded: 'Your session ended. Please sign in again.',
    unreachable: 'Could not reach the RoutePulse server. Check that the API is running.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.',
    tooLong: (max: number) => `Use at most ${max} characters.`,
    points: ['Explained ETAs', 'Recovery options with trade-offs', 'Fair delay attribution'],
  },
  nav: {
    controlTower: 'Control tower',
    dashboard: 'Dashboard',
    reports: 'Driver reports',
    simulation: 'Simulation',
    orders: 'Orders',
    notifications: 'Notifications',
    logout: 'Log out',
  },
  states: {
    notAvailable: 'This item is not available',
    notAvailableHelp: 'It does not exist or is not available to your account.',
    pageNotFound: 'This page is not available',
    goHome: 'Go to home',
    tryAgain: 'Try again',
    showDetails: 'Show details',
    requestId: 'Request id',
    reconnecting: 'Reconnecting… data shown may be out of date.',
    somethingWrong: 'Something went wrong',
    somethingWrongHelp: 'This part of RoutePulse failed to load. Try again, or reload the page.',
    reload: 'Reload page',
    notInMock: 'Not available in mock mode yet',
  },
  sim: {
    badge: 'Simulation',
    paused: 'Paused',
    running: 'Running',
    play: 'Play simulation',
    pause: 'Pause simulation',
    speed: 'Simulation speed',
    error: (reason: string) => `Simulation paused: ${reason}`,
    demoOff: 'Demo mode is off on the server; simulation controls are disabled.',
  },
} as const;
