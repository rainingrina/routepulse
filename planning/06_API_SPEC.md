# 06 — API specification: RoutePulse

Version 0.2, 2026-11-12. Status: **approved in principle; revision 0.2 for team review.**
Companion to `04_TECH_ARCHITECTURE.md` and `05_DATABASE_SCHEMA.md`. AC-IDs point to `02_PRODUCT_SPEC.md` §6.

**Contract approach [DECIDED D9, 2026-11-12]:** the TypeScript below is the contract. It lives as plain `interface`/`type` declarations in `packages/shared/src/api/*.ts`. **No Zod and no other schema-validation library.** The database model's source of truth is `schema.prisma`; Prisma Client types are used only inside the API. Request validation is hand-written (§1.2). Responses are built by serializers into these DTO types; Prisma entities are never returned directly. Example responses for every endpoint go in `packages/shared/fixtures`, typed with `satisfies`, so the frontend can be built before the endpoint exists.

**Changes in 0.2:** validation section (§1.2) and type-consistency rules (§1.3); `Factor.phase` adds `PLAN_CHANGE`; ETA totals add `planChangeMinutes`; arrival-based on-time definitions (pending architecture §19 issue 19); driver hand-over fields (D3); new endpoint #38 `GET /api/reference`; attribution rows show `kind`; consistency review (§17).

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api` (same origin as the SPA). No version prefix for the prototype. |
| Format | JSON only. Requests with a body must send `Content-Type: application/json`, otherwise `415`. |
| Auth | httpOnly cookie `rp_session` set by login. Every endpoint except `POST /api/auth/login` requires it. |
| Role scope | Lists and details are filtered by the caller's scope (coordinator: all · customer: own company · driver: own shipments). An id outside the scope returns **404 `NOT_FOUND`**, the same as a missing id (AC-M1.4). |
| Role shapes | Some endpoints return a different shape per role (e.g. customers never get driver identity, factor parties or internal codes — AC-M1.6). Each such response has a `view` discriminator. |
| Time | ISO 8601 UTC strings (`ISODateTime`). All business times are **simulation time**. The UI shows them in Asia/Kolkata. |
| Units | Durations: integer minutes. Money: integer INR. Weight: tonnes (number, 1 decimal). Percentages: number 0–100 with 1 decimal, or `null` when the denominator is 0. |
| Ids | Opaque strings (`Id`). Human labels are in `code` fields (`SHP-1042`). |
| Lists | Return `{ items: T[] }` (plus extras where noted). Default `limit` 100, max 200. No cursor paging (data sizes are small). |
| Freshness | Clients poll `GET /api/sync` every 1 s and refetch when `worldVersion` changes (architecture §5.2). |
| Request id | Every response has `X-Request-Id`; error bodies repeat it. |
| Demo-only endpoints | Simulation and reset endpoints also require `DEMO_MODE=true` on the server, else `403 DEMO_MODE_OFF`. |

### 1.1 Error envelope
```ts
interface ApiError {
  error: {
    code: ErrorCode;
    message: string;                 // plain English, safe to show
    details?: ValidationIssue[] | Record<string, unknown>;
    requestId: string;
  };
}
type ErrorCode =
  | 'VALIDATION_ERROR'   // 400
  | 'UNAUTHENTICATED'    // 401
  | 'FORBIDDEN'          // 403 wrong role
  | 'DEMO_MODE_OFF'      // 403
  | 'NOT_FOUND'          // 404 missing or out of scope
  | 'UNSUPPORTED_MEDIA'  // 415
  | 'INVALID_TRANSITION' // 409 out-of-order milestone or action not allowed in this state
  | 'STALE_OPTIONS'      // 409 recovery option set changed
  | 'ALREADY_DONE'       // 409 repeated action
  | 'CONFLICT'           // 409 unique constraint
  | 'RATE_LIMITED'       // 429
  | 'INTERNAL';          // 500
interface ValidationIssue { path: string; message: string }
```
Every endpoint can also return `401 UNAUTHENTICATED` (except login), `500 INTERNAL` and, with a body, `400 VALIDATION_ERROR` / `415 UNSUPPORTED_MEDIA`. The per-endpoint "Errors" lists below name only the additional cases.

### 1.2 Request validation (hand-written, no library)
Prisma does **not** validate HTTP input; it only types database access and enforces database constraints. Every endpoint therefore validates its own input by hand:

| Layer | Checks | Failure |
|---|---|---|
| Middleware | `Content-Type: application/json` on bodies; body ≤ 100 kB; valid JSON | 415 / 400 |
| Controller (shape) | Required fields present; correct JS type; strings trimmed and length-limited; integers in range and multiples where stated; ISO 8601 date strings; enum values in the allowed list; arrays with min/max length; **unknown body fields rejected**; query params parsed from strings (`'true'`/`'false'` booleans, repeated params for lists, integers) | 400 `VALIDATION_ERROR` with **all** issues in `details` |
| Service (business rules) | Scope/ownership; state transitions; feasibility; option set still current; idempotency | 404 / 409 |
| Database (last line) | CHECK constraints, unique and partial unique indexes from the migration | 409 `CONFLICT` / 500 — never reached by a valid request |

- Allowed enum values come from Prisma Client's generated enum objects (e.g. `Object.values(ReasonCode)`), so they always match `schema.prisma`. Subsets (driver-chip reasons, driver-recordable milestones) are named lists in API config.
- Helpers live in `apps/api/src/validation/` (architecture §8.2). Each endpoint below lists its specific rules under **Validation**.
- Path params (`:shipmentId` etc.) are checked as non-empty strings ≤ 64 chars; existence and scope are checked by the service (→ 404).

### 1.3 Keeping API types consistent between backend and frontend (no extra layer)
- Controllers annotate every response with its shared type (`satisfies XResponse`); the SPA's fetch client is generic over the same type.
- Serializers take a Prisma payload type (explicit `select`) and return the shared DTO, so a renamed column or DTO field fails `npm run typecheck`.
- Shared enum unions mirror `schema.prisma` and are checked against the Prisma enum types at compile time (architecture §8.3).
- Fixtures use `satisfies`; integration tests assert key response fields (architecture §20.2).

---

## 2. Shared types

### 2.1 Primitives and enums
```ts
type Id = string;
type ISODateTime = string;
type Minutes = number;   // integer
type Pct = number | null; // 0–100, 1 decimal

type Role = 'COORDINATOR' | 'CUSTOMER' | 'DRIVER';
type Milestone = 'ORDER_CONFIRMED' | 'TRUCK_ASSIGNED' | 'AT_GATE' | 'LOADING' | 'GATE_OUT' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';
type RiskLevel = 'ON_TRACK' | 'WATCH' | 'AT_RISK' | 'LATE';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
type Party = 'PLANT' | 'TRANSPORTER' | 'CUSTOMER' | 'EXTERNAL' | 'UNATTRIBUTED';
type FactorCode = 'GATE' | 'HIST' | 'DISR' | 'RPT' | 'WIN';
type ReasonCode =
  | 'BREAKDOWN' | 'PLANT_GATE_WAIT' | 'TRAFFIC' | 'ROAD_CLOSED' | 'HEAVY_RAIN'
  | 'DOCUMENTS' | 'UNLOADING_WAIT' | 'OTHER'          // driver chips
  | 'TRANSPORTER_PACE' | 'RECEIVING_WINDOW';            // system causes
type EventType = 'MILESTONE' | 'DRIVER_REPORT' | 'REPORT_REVIEWED' | 'DISRUPTION_STARTED' | 'DISRUPTION_ENDED'
  | 'ALERT_OPENED' | 'ALERT_RESOLVED' | 'CUSTOMER_NOTIFIED' | 'CUSTOMER_RESPONDED' | 'RECOVERY_CHOSEN' | 'ATTRIBUTION_OVERRIDDEN';
type EventSource = 'DRIVER' | 'COORDINATOR' | 'SIMULATION' | 'SEED' | 'SYSTEM';
type DisruptionKind = 'WEATHER_SLOWDOWN' | 'ROAD_CLOSURE' | 'GATE_CONGESTION' | 'TRUCK_BREAKDOWN';
type ReportStatus = 'PENDING_REVIEW' | 'CONFIRMED';
type AlertStatus = 'OPEN' | 'ACTION_CHOSEN' | 'RESOLVED';
type CustomerResponse = 'ACCEPT_PROPOSAL' | 'PREFER_TO_WAIT' | 'REQUEST_CALL';
type RecoveryKind = 'REROUTE' | 'SPLIT' | 'REPLACEMENT_TRUCK' | 'NEW_WINDOW' | 'NOTIFY_ONLY';
type OptionStatus = 'PROPOSED' | 'AWAITING_CUSTOMER' | 'CHOSEN' | 'SUPERSEDED';
type NotificationKind = 'AT_RISK' | 'AT_RISK_CUSTOMER' | 'RECOVERY_CONFIRMED' | 'PLAN_UPDATED' | 'REPORT_NEEDS_REVIEW'
  | 'CUSTOMER_RESPONDED' | 'BACK_ON_TRACK' | 'DELIVERED' | 'DELIVERED_LATE';
```

### 2.2 Core objects
```ts
interface UserDto {
  id: Id; name: string; email: string; role: Role;
  customer: { id: Id; name: string } | null;      // CUSTOMER only
  transporter: { id: Id; name: string } | null;   // DRIVER only
}

interface SimStateDto {
  simTime: ISODateTime; running: boolean; speed: 1 | 10 | 60; stepMinutes: number;
  worldVersion: number; simError: string | null; demoMode: boolean;
}

interface PartyMinutes { party: Party; minutes: Minutes }

/** One bar of the ETA waterfall. */
interface Factor {
  code: FactorCode;
  phase: 'INCURRED' | 'PLAN_CHANGE' | 'EXPECTED';  // "So far" · "Plan change" (reroute) · "Expected"
  minutes: Minutes;                     // integer, ≥ 0
  party: Party | null;                  // null only for WIN (see split)
  split: PartyMinutes[] | null;         // WIN knock-on split; null otherwise
  reason: ReasonCode | null;
  label: string;                        // "Heavy rain on ghat section"
  detail: string;                       // "Ghat segment 50% slower until 14:30 · +120 min"
  sourceRef: { type: 'DISRUPTION' | 'DRIVER_REPORT'; id: Id } | null;
  reviewStatus: ReportStatus | null;    // RPT only: 'PENDING_REVIEW' shows "Pending coordinator review"
}

/** Coordinator view of the ETA (M3, X2). */
interface EtaExplanationCoordinator {
  view: 'coordinator';
  shipmentId: Id; simTime: ISODateTime; ruleVersion: string;
  plannedArrivalAt: ISODateTime;
  predictedArrivalAt: ISODateTime; etaLowAt: ISODateTime; etaHighAt: ISODateTime;
  promisedBy: ISODateTime; slackMinutes: Minutes;
  level: RiskLevel; score: number; confidence: Confidence; confidenceReason: string;
  summary: string;                      // "At risk: +180 min breakdown is the largest factor"
  factors: Factor[];                    // ordered GATE, HIST, DISR, RPT, WIN; INCURRED before EXPECTED
  totals: { incurredMinutes: Minutes; planChangeMinutes: Minutes; expectedMinutes: Minutes };  // I, P, E (architecture §10.2)
  identityHolds: boolean;               // plannedArrival + Σ minutes == predictedArrival (AC-M3.2)
  isRuleBased: true;                    // AC-M3.8
}

/** Customer view of the ETA (no parties, no codes). */
interface EtaSummaryCustomer {
  view: 'customer';
  shipmentId: Id;
  predictedArrivalAt: ISODateTime; etaLowAt: ISODateTime; etaHighAt: ISODateTime;
  promisedBy: ISODateTime; level: RiskLevel;
  plainReason: string | null;           // "Vehicle breakdown on the route"
  isRuleBased: true;
}

interface MilestoneEntry {
  milestone: Milestone;
  state: 'DONE' | 'CURRENT' | 'PENDING';
  at: ISODateTime | null;
  source: EventSource | null;
  actorName: string | null;             // always null in customer view
}

interface ShipmentListItemCoordinator {
  view: 'coordinator';
  id: Id; code: string; orderId: Id; orderCode: string;
  customer: { id: Id; name: string; city: string };
  lane: { id: Id; name: string };
  transporter: { id: Id; name: string; isSmall: boolean };
  truckCode: string | null;
  currentMilestone: Milestone;
  etaAt: ISODateTime | null; etaLowAt: ISODateTime | null; etaHighAt: ISODateTime | null;
  promisedBy: ISODateTime; slackMinutes: Minutes | null;
  riskLevel: RiskLevel | null; riskScore: number | null; confidence: Confidence | null;
  hasOpenAlert: boolean; pendingReportCount: number;
  parentShipmentId: Id | null;
  deliveredAt: ISODateTime | null; onTime: boolean | null; delayMinutes: Minutes | null;
}

interface ShipmentListItemCustomer {
  view: 'customer';
  id: Id; code: string; orderId: Id; orderCode: string;
  laneName: string; transporterName: string;
  currentMilestone: Milestone;
  etaAt: ISODateTime | null; etaLowAt: ISODateTime | null; etaHighAt: ISODateTime | null;
  promisedBy: ISODateTime; riskLevel: RiskLevel | null;
  plainStatus: string;                  // "On the way · expected 17:50"
  deliveredAt: ISODateTime | null; onTime: boolean | null;
}

type ShipmentListItem = ShipmentListItemCoordinator | ShipmentListItemCustomer;

interface ShipmentDetailCoordinator extends ShipmentListItemCoordinator {
  route: { id: Id; code: string; name: string; isPrimary: boolean; lengthKm: number };
  driver: { id: Id; name: string; phone: string | null } | null;
  items: { orderLineId: Id; gradeCode: string; quantityT: number; isUrgent: boolean }[];
  milestones: MilestoneEntry[];
  plannedArrivalAt: ISODateTime; originalPromisedBy: ISODateTime; renegotiated: boolean;
  progressKm: number; stopped: boolean; stoppedUntil: ISODateTime | null;
  lastUpdateAt: ISODateTime | null;
  firstAtRiskAt: ISODateTime | null; customerNotifiedAt: ISODateTime | null;
  arrivedAt: ISODateTime | null;
  childShipmentIds: Id[];
  openAlert: AlertSummary | null;
  latestCustomerResponse: { response: CustomerResponse; at: ISODateTime } | null;
}

interface ShipmentDetailCustomer extends ShipmentListItemCustomer {
  items: { gradeCode: string; quantityT: number }[];
  milestones: MilestoneEntry[];          // actorName always null
  eta: EtaSummaryCustomer;
  openAlert: CustomerAlertDto | null;
}

type ShipmentDetail = ShipmentDetailCoordinator | ShipmentDetailCustomer;

interface TimelineEvent {
  id: Id; type: EventType; milestone: Milestone | null;
  simTime: ISODateTime; source: EventSource;
  actorName: string | null;              // null in customer view
  summary: string;                       // "Driver reported: Breakdown"
}

interface RecoveryOptionDto {
  id: Id; optionSetId: string; kind: RecoveryKind; title: string;   // "Replacement truck from Khopoli"
  feasible: boolean; infeasibleReason: string | null;
  newEtaAt: ISODateTime | null; etaLowAt: ISODateTime | null; etaHighAt: ISODateTime | null;
  meetsPromise: boolean; minutesSavedVsNotify: Minutes;
  extraCostInr: number; costNote: string;                        // "Estimate from fictional rate card"
  co2eDeltaKg: number | null;                                     // null until G-CO2 (AC-S1.1)
  co2eNote: string;                                               // "CO₂e — method under verification" or method + source
  isSuggested: boolean;
  constraints: string[];
  status: OptionStatus;
}

interface AlertSummary {
  id: Id; status: AlertStatus; openedAt: ISODateTime;
  topFactor: FactorCode | null; topReason: ReasonCode | null;
}

interface AlertDtoCoordinator extends AlertSummary {
  view: 'coordinator';
  shipment: { id: Id; code: string; customerName: string; laneName: string };
  resolvedAt: ISODateTime | null;
  summary: string;
  proposedOption: RecoveryOptionDto | null;
  chosenOption: RecoveryOptionDto | null;
  chosenBy: { id: Id; name: string } | null; chosenAt: ISODateTime | null;
  customerResponse: CustomerResponse | null; customerRespondedAt: ISODateTime | null;
}

interface CustomerAlertDto {
  view: 'customer';
  id: Id; status: AlertStatus; openedAt: ISODateTime;
  shipmentId: Id; shipmentCode: string; orderCode: string;
  predictedArrivalAt: ISODateTime; etaLowAt: ISODateTime; etaHighAt: ISODateTime; promisedBy: ISODateTime;
  plainReason: string;
  action: { label: 'PROPOSED' | 'CONFIRMED'; kind: RecoveryKind; text: string } | null;  // null → "Plant X team is reviewing options"
  customerResponse: CustomerResponse | null; customerRespondedAt: ISODateTime | null;
  canRespond: boolean;
}

type AlertDto = AlertDtoCoordinator | CustomerAlertDto;

interface NotificationDto {
  id: Id; kind: NotificationKind;
  templateKey: string; params: Record<string, string | number>; text: string;
  simTime: ISODateTime; readAt: ISODateTime | null;
  shipmentId: Id | null; shipmentCode: string | null; alertId: Id | null;
}

interface DriverReportDto {
  id: Id; shipmentId: Id; shipmentCode: string;
  reporter: { id: Id; name: string };
  simTime: ISODateTime;
  chipReason: ReasonCode | null; text: string | null;
  suggestedReason: ReasonCode | null; matchedKeywords: string[];
  reason: ReasonCode; estimatedMinutes: Minutes | null; appliedMinutes: Minutes;
  party: Party; status: ReportStatus;
  reviewedBy: { id: Id; name: string } | null; reviewedAt: ISODateTime | null; reviewNote: string | null;
  originalReason: ReasonCode | null; originalParty: Party | null;
}

interface DisruptionDto {
  id: Id; kind: DisruptionKind; origin: 'SEED' | 'SIMULATOR'; label: string;
  segmentCodes: string[]; shipmentId: Id | null;
  slowdownPct: number | null; extraMinutesPerTruck: number | null; stopMinutes: number | null;
  party: Party; reason: ReasonCode;
  startsAt: ISODateTime; endsAt: ISODateTime; endedEarlyAt: ISODateTime | null; active: boolean;
}

interface Segment { segmentCode: string; name: string; startKm: number; endKm: number; speedKmh: number }
interface GeoJSONLineString { type: 'LineString'; coordinates: [number, number][] }  // [lng, lat]
```

---

## 3. Endpoint index

| # | Method | URL | Roles | Covers |
|---|---|---|---|---|
| 1 | POST | `/api/auth/login` | Public | M1 |
| 2 | POST | `/api/auth/logout` | Any | M1 |
| 3 | GET | `/api/auth/me` | Any | M1 |
| 4 | GET | `/api/sync` | Any | Freshness, X4 |
| 5 | POST | `/api/sim/clock` | Coordinator · demo | X4 |
| 6 | POST | `/api/sim/reset` | Coordinator · demo | X4, J9 |
| 7 | GET | `/api/disruptions` | Coordinator | X4 |
| 8 | POST | `/api/disruptions` | Coordinator · demo | X4 |
| 9 | POST | `/api/disruptions/:disruptionId/end` | Coordinator · demo | X4 |
| 10 | GET | `/api/map/layers` | Any (scoped) | M2 |
| 11 | GET | `/api/tracking/positions` | Any (scoped) | M2 |
| 12 | GET | `/api/orders` | Coordinator, Customer | M1, M2 |
| 13 | GET | `/api/orders/:orderId` | Coordinator, Customer | M1, M2 |
| 14 | GET | `/api/shipments` | Coordinator, Customer | M2, M3 |
| 15 | GET | `/api/shipments/:shipmentId` | Coordinator, Customer | M2, M3 |
| 16 | GET | `/api/shipments/:shipmentId/timeline` | Coordinator, Customer | M2 |
| 17 | POST | `/api/shipments/:shipmentId/milestones` | Driver (own), Coordinator | M2 |
| 18 | GET | `/api/shipments/:shipmentId/eta` | Coordinator, Customer | M3, X2 |
| 19 | GET | `/api/shipments/:shipmentId/replay` | Coordinator | X1 |
| 20 | GET | `/api/engine/rules` | Any | M3 (AC-M3.8) |
| 21 | GET | `/api/driver/trip` | Driver | M1, M2, F2 |
| 22 | POST | `/api/driver-reports/classify` | Driver, Coordinator | F2 |
| 23 | POST | `/api/shipments/:shipmentId/driver-reports` | Driver (own), Coordinator | F2 |
| 24 | GET | `/api/driver-reports` | Coordinator | F3 |
| 25 | POST | `/api/driver-reports/:reportId/review` | Coordinator | F3 |
| 26 | GET | `/api/alerts` | Coordinator, Customer | M4 |
| 27 | GET | `/api/alerts/:alertId` | Coordinator, Customer | M4 |
| 28 | POST | `/api/alerts/:alertId/customer-response` | Customer | M4 |
| 29 | GET | `/api/shipments/:shipmentId/recovery-options` | Coordinator | M4, X3 |
| 30 | POST | `/api/shipments/:shipmentId/recovery-options/:optionId/choose` | Coordinator | M4, X3 |
| 31 | GET | `/api/notifications` | Coordinator, Customer | M4 |
| 32 | POST | `/api/notifications/:notificationId/read` | Coordinator, Customer | M4 |
| 33 | POST | `/api/notifications/read-all` | Coordinator, Customer | M4 |
| 34 | GET | `/api/shipments/:shipmentId/attribution` | Coordinator | F1 |
| 35 | POST | `/api/shipments/:shipmentId/attribution/overrides` | Coordinator | F1 |
| 36 | GET | `/api/analytics/dashboard` | Coordinator | M5, F1, impact |
| 37 | GET | `/api/audit` | Coordinator | Audit |
| 38 | GET | `/api/reference` | Coordinator | M5 filters, X4 form |

---

## 4. Authentication

### 4.1 `POST /api/auth/login`
- **Purpose:** sign in; set the session cookie.
- **Roles:** public. Rate limit 10/min/IP.
- **Request**
  ```ts
  interface LoginRequest { email: string; password: string }
  ```
- **Response 200**
  ```ts
  interface LoginResponse { user: UserDto; homePath: '/control-tower' | '/orders' | '/trip' }
  ```
  Sets `rp_session` (httpOnly, SameSite=Lax, 8 h).
- **Validation:** `email` valid email, ≤ 254 chars, lower-cased by the server; `password` 1–128 chars.
- **Errors:** `401 UNAUTHENTICATED` "Email or password is incorrect" (same message for unknown email and wrong password); `429 RATE_LIMITED`.
- **Audit:** `auth.login` (success and failure, without the password).

### 4.2 `POST /api/auth/logout`
- **Purpose:** end the session (AC-M1.5).
- **Roles:** any signed-in user.
- **Request:** empty body.
- **Response 204.** Clears the cookie.
- **Errors:** none beyond common.

### 4.3 `GET /api/auth/me`
- **Purpose:** current user for the role guard.
- **Roles:** any.
- **Response 200:** `{ user: UserDto }`
- **Errors:** `401` if no or expired session.

---

## 5. Sync and simulation

### 5.1 `GET /api/sync`
- **Purpose:** 1-second poll. Tells the client whether anything changed.
- **Roles:** any.
- **Response 200**
  ```ts
  interface SyncResponse extends SimStateDto { unreadNotifications: number }  // 0 for drivers
  ```
- **Errors:** common only.

### 5.2 `POST /api/sim/clock`
- **Purpose:** play, pause, set speed, advance by minutes, or advance to a time (architecture §9.1).
- **Roles:** coordinator; `DEMO_MODE` required.
- **Request**
  ```ts
  type SimClockRequest =
    | { action: 'PLAY' }
    | { action: 'PAUSE' }
    | { action: 'SET_SPEED'; speed: 1 | 10 | 60 }
    | { action: 'ADVANCE'; minutes: number }        // multiple of 5, 5–720
    | { action: 'ADVANCE_TO'; to: ISODateTime };    // > simTime, ≤ simTime + 24 h, on a 5-min boundary
  ```
- **Response 200:** `SimStateDto & { stepsExecuted: number }`
- **Validation:** as in the comments. `ADVANCE`/`ADVANCE_TO` run synchronously; the response returns after all steps.
- **Errors:** `403 FORBIDDEN`, `403 DEMO_MODE_OFF`, `409 INVALID_TRANSITION` if `to` is not in the future.
- **Audit:** `sim.clock` with action and parameters.

### 5.3 `POST /api/sim/reset`
- **Purpose:** restore the seeded demo state (AC-X4.3, J9).
- **Roles:** coordinator; `DEMO_MODE` required.
- **Request:** `{ confirm: true }`
- **Response 200:** `SimStateDto & { durationMs: number }`
- **Validation:** `confirm` must be literal `true`.
- **Errors:** `403 FORBIDDEN`, `403 DEMO_MODE_OFF`.
- **Audit:** `sim.reset` (written after the reseed).

### 5.4 `GET /api/disruptions`
- **Purpose:** list disruptions for the simulation panel and map.
- **Roles:** coordinator.
- **Query:** `active?: 'true' | 'false'` (default: all).
- **Response 200:** `{ items: DisruptionDto[] }`
- **Errors:** `403 FORBIDDEN`.

### 5.5 `POST /api/disruptions`
- **Purpose:** inject an event and recalculate affected shipments (AC-X4.1, J2).
- **Roles:** coordinator; `DEMO_MODE` required.
- **Request**
  ```ts
  type CreateDisruptionRequest =
    | { kind: 'WEATHER_SLOWDOWN'; label?: string; segmentCodes: string[]; slowdownPct: number; durationMinutes: number }
    | { kind: 'ROAD_CLOSURE';     label?: string; segmentCodes: string[]; durationMinutes: number }
    | { kind: 'GATE_CONGESTION';  label?: string; extraMinutesPerTruck: number; durationMinutes: number }
    | { kind: 'TRUCK_BREAKDOWN';  label?: string; shipmentId: Id; repairMinutes: number };
  ```
- **Response 201**
  ```ts
  interface CreateDisruptionResponse {
    disruption: DisruptionDto;
    impact: {
      affectedShipmentIds: Id[];
      affectedCount: number;
      levelChanges: { shipmentId: Id; code: string; from: RiskLevel | null; to: RiskLevel | null }[];
      nowAtRiskCount: number;
      summary: string;                       // "3 shipments affected · 0 at risk · 1 now Watch"
    };
  }
  ```
- **Validation:** `segmentCodes` 1–10 codes that exist on at least one route; `slowdownPct` 10–90; `durationMinutes` 15–1440, multiple of 5; `extraMinutesPerTruck` 5–240; `repairMinutes` 15–720; `shipmentId` must be a live, in-transit shipment; `label` ≤ 80 chars (default label generated from kind and segment names). The event starts at the current `simTime`. Party and reason are set by the server from the kind (weather → EXTERNAL/HEAVY_RAIN, closure → EXTERNAL/ROAD_CLOSED, gate → PLANT/PLANT_GATE_WAIT, breakdown → TRANSPORTER/BREAKDOWN).
- **Errors:** `403 FORBIDDEN`, `403 DEMO_MODE_OFF`, `404 NOT_FOUND` (shipment), `400 VALIDATION_ERROR` (unknown segment code), `409 INVALID_TRANSITION` (shipment not in transit).
- **Side effects:** `ShipmentEvent DISRUPTION_STARTED` on affected shipments, recalculation pipeline, alerts/notifications per rules, audit `disruption.create`.

### 5.6 `POST /api/disruptions/:disruptionId/end`
- **Purpose:** end an active event early.
- **Roles:** coordinator; `DEMO_MODE` required.
- **Request:** empty body.
- **Response 200:** `CreateDisruptionResponse` (same shape; impact of the ending).
- **Errors:** `404 NOT_FOUND`; `409 ALREADY_DONE` if already ended.

---

## 6. Map and tracking

### 6.1 `GET /api/map/layers`
- **Purpose:** static-ish layers for the map: plant, sites, routes, active disruptions (AC-M2.7).
- **Roles:** any; scoped. Customer: own site and own lane's routes, no disruptions list (plain reasons appear in alerts instead). Driver: own shipments' routes and destinations.
- **Response 200**
  ```ts
  interface MapLayersResponse {
    plant: { name: string; lat: number; lng: number };
    sites: { customerId: Id; name: string; city: string; lat: number; lng: number; receivingHours: string }[];
    routes: { id: Id; code: string; laneId: Id; name: string; isPrimary: boolean; lengthKm: number;
              geometry: GeoJSONLineString; segments: Segment[] }[];
    activeDisruptions: { id: Id; kind: DisruptionKind; label: string; segmentCodes: string[] }[];  // [] for non-coordinators
  }
  ```
- **Errors:** common only.

### 6.2 `GET /api/tracking/positions`
- **Purpose:** current marker positions; polled every 1 s while the clock runs (AC-M2.1, AC-M2.2).
- **Roles:** any; scoped.
- **Response 200**
  ```ts
  interface PositionsResponse {
    simTime: ISODateTime;
    items: {
      shipmentId: Id; code: string; routeId: Id;
      lat: number; lng: number; bearing: number;    // degrees
      progressPct: number;                          // 0–100
      currentMilestone: Milestone; riskLevel: RiskLevel | null; stopped: boolean;
    }[];                                            // live shipments only
  }
  ```
- **Errors:** common only.

---

## 7. Orders and shipments

### 7.1 `GET /api/orders`
- **Purpose:** order list (customer home; coordinator lookup).
- **Roles:** coordinator (all), customer (own company).
- **Query:** `status?: 'open' | 'delivered' | 'all'` (default `open`); `customerId?` (coordinator only); `limit?`.
- **Response 200**
  ```ts
  interface OrderSummary {
    id: Id; code: string; customer: { id: Id; name: string };
    promisedBy: ISODateTime;
    lines: { gradeCode: string; quantityT: number }[];
    shipmentCount: number;
    status: 'OPEN' | 'DELIVERED';                 // derived from shipments
    worstRiskLevel: RiskLevel | null;
  }
  // { items: OrderSummary[] }
  ```
- **Errors:** `403 FORBIDDEN` (driver).

### 7.2 `GET /api/orders/:orderId`
- **Purpose:** order with its shipments (incl. split children).
- **Roles:** coordinator, customer (own).
- **Response 200:** `OrderSummary & { shipments: ShipmentListItem[] }`
- **Errors:** `403 FORBIDDEN` (driver), `404 NOT_FOUND`.

### 7.3 `GET /api/shipments`
- **Purpose:** risk-sorted control-tower list; customer shipment list; dashboard drill-down.
- **Roles:** coordinator (all), customer (own). Drivers use `/api/driver/trip`.
- **Query**
  ```ts
  interface ShipmentListQuery {
    status?: 'live' | 'delivered' | 'all';     // default 'live'
    riskLevel?: RiskLevel[];                   // repeated param
    laneId?: Id; transporterId?: Id;
    customerId?: Id;                           // coordinator only
    deliveredFrom?: ISODateTime; deliveredTo?: ISODateTime;
    onTime?: 'true' | 'false';
    q?: string;                                // code search, ≤ 32 chars
    sort?: 'risk' | 'eta' | 'promise';         // default 'risk' (score desc)
    limit?: number;                            // ≤ 200
  }
  ```
- **Response 200:** `{ items: ShipmentListItem[] }` (`view` matches the caller's role).
- **Validation:** enums checked; `customerId` from a customer → `400`.
- **Errors:** `403 FORBIDDEN` (driver).

### 7.4 `GET /api/shipments/:shipmentId`
- **Purpose:** shipment panel: milestones, items, alert, ETA summary (AC-M2.4).
- **Roles:** coordinator, customer (own).
- **Response 200:** `{ shipment: ShipmentDetail }`
- **Errors:** `403 FORBIDDEN` (driver), `404 NOT_FOUND`.

### 7.5 `GET /api/shipments/:shipmentId/timeline`
- **Purpose:** ordered event list (milestones, reports, disruptions, alerts, recovery).
- **Roles:** coordinator (all events), customer (own; only MILESTONE, CUSTOMER_NOTIFIED, RECOVERY_CHOSEN; `actorName` null).
- **Response 200:** `{ items: TimelineEvent[] }` (ascending `simTime`).
- **Errors:** `403 FORBIDDEN` (driver), `404 NOT_FOUND`.

### 7.6 `POST /api/shipments/:shipmentId/milestones`
- **Purpose:** record the next milestone (J8, AC-M2.5, AC-M2.6).
- **Roles:** driver (own shipment) for `AT_GATE`, `GATE_OUT`, `ARRIVED`, `DELIVERED`; coordinator for any milestone (override, note required).
- **Request**
  ```ts
  interface RecordMilestoneRequest { milestone: Milestone; note?: string }  // note required for coordinator overrides, ≤ 280
  ```
- **Response 200**
  ```ts
  interface RecordMilestoneResponse {
    shipment: ShipmentListItemCoordinator | DriverTripShipment;  // driver gets the trip shape
    milestones: MilestoneEntry[];
  }
  ```
- **Validation:**
  - `milestone` must be exactly the next milestone in order; `IN_TRANSIT` is recorded by the system immediately after `GATE_OUT` and cannot be posted.
  - `ARRIVED` requires the truck to be within 2 km of the route end ("Truck is 38 km from the destination").
  - `DELIVERED` requires `ARRIVED`.
- **Errors:** `403 FORBIDDEN` (customer; or driver posting a coordinator-only milestone), `404 NOT_FOUND`, `409 INVALID_TRANSITION` with a plain reason (AC-M2.6), `409 ALREADY_DONE`.
- **Side effects:** event, `lastUpdateAt`, recalculation; on `DELIVERED`: delivery fields, attribution finalised, alert resolved, notifications; audit `milestone.record` (`milestone.override` for coordinators).

---

## 8. ETA and risk

### 8.1 `GET /api/shipments/:shipmentId/eta`
- **Purpose:** current ETA explanation (AC-M3.1–3.3, X2).
- **Roles:** coordinator → `EtaExplanationCoordinator`; customer (own) → `EtaSummaryCustomer`.
- **Response 200:** `{ eta: EtaExplanationCoordinator | EtaSummaryCustomer }`
- **Errors:** `403 FORBIDDEN` (driver), `404 NOT_FOUND`, `409 INVALID_TRANSITION` if the shipment is delivered (use the shipment detail instead).
- Read-only: returns the latest cached calculation; does not trigger a recalculation.

### 8.2 `GET /api/shipments/:shipmentId/replay`
- **Purpose:** snapshot history for the replay scrubber (AC-X1.1, AC-X1.2, J6).
- **Roles:** coordinator.
- **Response 200**
  ```ts
  interface ReplayResponse {
    shipmentId: Id; code: string; promisedBy: ISODateTime; plannedArrivalAt: ISODateTime;
    firstAtRiskAt: ISODateTime | null;
    leadTimeMinutes: Minutes | null;         // promisedBy − firstAtRiskAt
    snapshots: {
      id: Id; simTime: ISODateTime; trigger: string;
      predictedArrivalAt: ISODateTime; etaLowAt: ISODateTime; etaHighAt: ISODateTime;
      slackMinutes: Minutes; level: RiskLevel; score: number; confidence: Confidence;
      position: { lat: number; lng: number };
      factors: Factor[];
    }[];                                     // ascending simTime
    events: TimelineEvent[];
  }
  ```
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`.

### 8.3 `GET /api/engine/rules`
- **Purpose:** "How is this calculated?" page (AC-M3.8). Makes the rule-based nature explicit.
- **Roles:** any.
- **Response 200**
  ```ts
  interface EngineRulesResponse {
    ruleVersion: string;
    statement: string;                       // "Rule-based estimate. Not a trained model. Weights are set by hand."
    identity: string;                        // "Predicted arrival = planned arrival + delay so far + expected delay"
    factors: { code: FactorCode; name: string; rule: string; party: string }[];
    thresholds: { onTrackMinSlack: Minutes; watchMinSlack: Minutes };   // 120, 0
    rangeRule: string; confidenceRule: string; scoreRule: string;
    reasonDefaults: { reason: ReasonCode; party: Party | 'CONDITIONAL'; minutes: Minutes }[];
    suggestionRule: string;
    co2e: { enabled: boolean; method: string | null; source: string | null };
  }
  ```
- **Errors:** common only.

---

## 9. Driver and driver reports

```ts
interface DriverTripShipment {
  view: 'driver';
  id: Id; code: string;
  customerName: string; city: string; destination: { lat: number; lng: number };
  currentMilestone: Milestone; nextMilestone: Milestone | null;
  canRecordNext: boolean; nextBlockedReason: string | null;     // e.g. "38 km to destination"
  etaAt: ISODateTime | null; promisedBy: ISODateTime;
  stopped: boolean;
  instruction: string | null;            // derived, not stored: "Wait for replacement truck TRK-11 (ETA 12:40)" or "Collect load from TRK-07 near Lonavala"
  openReports: { id: Id; reason: ReasonCode; status: ReportStatus; simTime: ISODateTime }[];
}

/** A shipment this driver handed over in a REPLACEMENT_TRUCK recovery (D3).
 *  Derived from RECOVERY_CHOSEN events whose data.previousDriverUserId = caller. */
interface DriverHandover {
  shipmentId: Id; shipmentCode: string;
  toTruckCode: string; toDriverName: string;
  at: ISODateTime;
}
```

### 9.1 `GET /api/driver/trip`
- **Purpose:** the driver's home: assigned live shipments, next step, instruction (J3); recent hand-overs (D3).
- **Roles:** driver.
- **Response 200:** `{ items: DriverTripShipment[]; recentHandovers: DriverHandover[] }` (hand-overs in the last 12 sim-hours)
- **Errors:** `403 FORBIDDEN` (non-driver).

### 9.2 `POST /api/driver-reports/classify`
- **Purpose:** stateless reason suggestion from typed text (AC-F2.2). Writes nothing.
- **Roles:** driver, coordinator.
- **Request:** `{ text: string }`
- **Response 200**
  ```ts
  interface ClassifyResponse {
    suggestedReason: ReasonCode | null;
    matchedKeywords: string[];             // shown to the user
    strength: 'STRONG' | 'WEAK' | 'NONE';  // STRONG ≥ 2 keywords for one reason; WEAK = 1; NONE = 0
    defaultMinutes: Minutes | null;
    defaultParty: Party | null;
    method: 'KEYWORD_LIST_V1';
  }
  ```
- **Validation:** `text` 1–280 chars after trim.
- **Errors:** `403 FORBIDDEN` (customer).

### 9.3 `POST /api/shipments/:shipmentId/driver-reports`
- **Purpose:** create a driver-confirmed report; applies the RPT factor as "Pending coordinator review" (AC-F2.1, AC-F3.1).
- **Roles:** driver (own shipment); coordinator (on behalf; audited).
- **Request**
  ```ts
  interface CreateDriverReportRequest {
    chipReason?: ReasonCode;               // driver chip tapped
    text?: string;                         // ≤ 280
    reason: ReasonCode;                    // the reason the driver confirmed
    estimatedMinutes?: 30 | 60 | 120 | 240;
  }
  ```
- **Response 201**
  ```ts
  interface CreateDriverReportResponse {
    report: DriverReportDto;
    trip: DriverTripShipment | null;       // null for coordinator callers
  }
  ```
- **Validation:** at least one of `chipReason` or `text`; `reason` must be a driver-chip reason (not `TRANSPORTER_PACE` / `RECEIVING_WINDOW`); shipment must be live and past `TRUCK_ASSIGNED`. The server re-runs the classifier on `text` and stores its own `suggestedReason` and `matchedKeywords` (it does not trust client values). `appliedMinutes` = `estimatedMinutes` or the reason default; `party` = reason default.
- **Errors:** `403 FORBIDDEN` (customer), `404 NOT_FOUND`, `409 INVALID_TRANSITION` (delivered shipment).
- **Side effects:** event `DRIVER_REPORT`, `lastUpdateAt`, `stoppedUntil` for stopping reasons, recalculation, coordinator notification `REPORT_NEEDS_REVIEW`, audit `report.create`.

### 9.4 `GET /api/driver-reports`
- **Purpose:** coordinator review queue.
- **Roles:** coordinator.
- **Query:** `status?: ReportStatus` (default `PENDING_REVIEW`); `shipmentId?`; `limit?`.
- **Response 200:** `{ items: DriverReportDto[] }` (newest first).
- **Errors:** `403 FORBIDDEN`.

### 9.5 `POST /api/driver-reports/:reportId/review`
- **Purpose:** coordinator confirms or changes reason and party (AC-F3.2, AC-F1.3).
- **Roles:** coordinator.
- **Request**
  ```ts
  interface ReviewDriverReportRequest { reason: ReasonCode; party: Party; note?: string }
  ```
- **Response 200:** `{ report: DriverReportDto; eta: EtaExplanationCoordinator }`
- **Validation:** `note` required (5–280 chars) if `reason` or `party` differs from the report; `party` cannot be `UNATTRIBUTED` unless `reason = 'OTHER'`.
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`, `409 ALREADY_DONE` (already confirmed).
- **Side effects:** event `REPORT_REVIEWED`, attribution rows re-tagged, recalculation, audit `report.review`.

---

## 10. Alerts and recovery

### 10.1 `GET /api/alerts`
- **Purpose:** coordinator alert list; customer's own alerts.
- **Roles:** coordinator (all), customer (own).
- **Query:** `status?: AlertStatus | 'active'` (`active` = OPEN + ACTION_CHOSEN; default `active`); `shipmentId?`; `limit?`.
- **Response 200:** `{ items: AlertDto[] }` (newest first; `view` per role).
- **Errors:** `403 FORBIDDEN` (driver).

### 10.2 `GET /api/alerts/:alertId`
- **Purpose:** alert detail (J4, J5).
- **Roles:** coordinator, customer (own).
- **Response 200:** `{ alert: AlertDto }`
- **Errors:** `403 FORBIDDEN` (driver), `404 NOT_FOUND`.

### 10.3 `POST /api/alerts/:alertId/customer-response`
- **Purpose:** customer responds to the proposal (AC-M4.6). Also accepts a NEW_WINDOW proposal.
- **Roles:** customer (own).
- **Request:** `{ response: CustomerResponse }`
- **Response 200:** `{ alert: CustomerAlertDto }`
- **Validation:** alert must be `OPEN` or `ACTION_CHOSEN` and `canRespond`; one response per alert (a later response replaces the earlier one only while the alert is `OPEN` **[A]**).
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_TRANSITION` (alert resolved).
- **Side effects:** coordinator notification `CUSTOMER_RESPONDED`; event `CUSTOMER_RESPONDED`; if the chosen option is `NEW_WINDOW` in `AWAITING_CUSTOMER` and the response is `ACCEPT_PROPOSAL`: `promisedBy` updated, `renegotiated = true`, option `CHOSEN`, recalculation; audit `alert.customerResponse`.

### 10.4 `GET /api/shipments/:shipmentId/recovery-options`
- **Purpose:** the latest option set for a WATCH or AT_RISK shipment (AC-M4.3, AC-M4.4, AC-X3.1). Read-only: sets are generated by the recalculation pipeline.
- **Roles:** coordinator.
- **Response 200**
  ```ts
  interface RecoveryOptionsResponse {
    shipmentId: Id;
    optionSetId: string | null;            // null when the shipment is ON_TRACK or delivered
    generatedAt: ISODateTime | null;
    suggestionRule: string;                // shown on screen
    options: RecoveryOptionDto[];          // always includes NOTIFY_ONLY when a set exists; infeasible kinds included with reason
  }
  ```
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`.

### 10.5 `POST /api/shipments/:shipmentId/recovery-options/:optionId/choose`
- **Purpose:** coordinator decision; applies the action (AC-M4.5, AC-M4.8, J5).
- **Roles:** coordinator.
- **Request**
  ```ts
  interface ChooseRecoveryRequest {
    optionSetId: string;                   // must equal the shipment's current set
    confirm: true;
    newWindowEnd?: ISODateTime;            // required for NEW_WINDOW; > current promisedBy, ≤ +48 h
    note?: string;                         // ≤ 280
  }
  ```
- **Response 200**
  ```ts
  interface ChooseRecoveryResponse {
    option: RecoveryOptionDto;             // status CHOSEN, or AWAITING_CUSTOMER for NEW_WINDOW
    alert: AlertDtoCoordinator | null;     // null if the shipment was WATCH without an alert
    shipment: ShipmentListItemCoordinator;
    eta: EtaExplanationCoordinator;
    childShipment: ShipmentListItemCoordinator | null;  // SPLIT only
    driverChange: { fromDriverName: string; toDriverName: string; toTruckCode: string } | null;  // REPLACEMENT_TRUCK only (D3)
    customerNotified: boolean;
  }
  ```
- **Validation:** option belongs to the shipment and to `optionSetId`; option `feasible`; feasibility re-checked at apply time.
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`, `409 STALE_OPTIONS` (newer set exists, or the option became infeasible — `details.currentOptionSetId` included), `409 ALREADY_DONE` (an option is already CHOSEN for this alert).
- **Side effects:** effect applied (route switch / child shipment + items / truck switch + `stoppedUntil` / awaiting customer), event `RECOVERY_CHOSEN`, alert → `ACTION_CHOSEN`, recalculation, customer notification `PLAN_UPDATED` (not for NEW_WINDOW until accepted), audit `recovery.choose` with the ids and summaries of all options in the set.

---

## 11. Notifications

### 11.1 `GET /api/notifications`
- **Purpose:** notification centre (coordinator, customer).
- **Roles:** coordinator (audience COORDINATOR), customer (audience CUSTOMER, own company).
- **Query:** `unreadOnly?: 'true' | 'false'`; `limit?` (default 50).
- **Response 200:** `{ items: NotificationDto[]; unreadCount: number }` (newest first).
- **Errors:** `403 FORBIDDEN` (driver).

### 11.2 `POST /api/notifications/:notificationId/read`
- **Purpose:** mark one as read.
- **Roles:** coordinator, customer (own).
- **Request:** empty.
- **Response 200:** `{ notification: NotificationDto; unreadCount: number }`
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`. Idempotent (already read → 200).

### 11.3 `POST /api/notifications/read-all`
- **Purpose:** mark all visible as read.
- **Roles:** coordinator, customer.
- **Response 200:** `{ updated: number; unreadCount: 0 }`
- **Errors:** `403 FORBIDDEN` (driver).

---

## 12. Attribution

```ts
interface AttributionRowDto {
  id: Id; sourceKey: string; factor: FactorCode | null; reason: ReasonCode | null;
  kind: 'TIME_LOST' | 'PLAN_CHANGE' | 'GAP';
  label: string; party: Party;
  minutes: Minutes;                     // from integer delaySeconds; largest-remainder rounding so rows sum to the shipment total
  status: 'LIVE' | 'FINAL';
  originalParty: Party | null; overrideNote: string | null;
  overriddenBy: { id: Id; name: string } | null; overriddenAt: ISODateTime | null;
}
interface AttributionResponse {
  shipmentId: Id; status: 'LIVE' | 'FINAL';
  delayMinutes: Minutes | null;                       // null until delivered
  totalsByParty: Record<Party, Minutes>;
  rows: AttributionRowDto[];
  countsAgainstTransporter: boolean | null;           // but-for rule; null until delivered (AC-F1.2)
  ruleText: string;                                   // "Counts against the transporter only if the shipment would have been on time without the transporter's minutes."
}
```

### 12.1 `GET /api/shipments/:shipmentId/attribution`
- **Purpose:** delay minutes by party for one shipment (AC-F1.1, AC-F1.4).
- **Roles:** coordinator.
- **Response 200:** `AttributionResponse`
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`.

### 12.2 `POST /api/shipments/:shipmentId/attribution/overrides`
- **Purpose:** re-attribute a row to another party with a note (AC-F1.3).
- **Roles:** coordinator.
- **Request:** `{ attributionId: Id; newParty: Party; note: string }`
- **Response 200:** `AttributionResponse`
- **Validation:** `note` 5–280 chars; `newParty` ≠ current party; the row belongs to the shipment; `GAP` rows can be re-attributed.
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND`, `409 ALREADY_DONE` (same party).
- **Side effects:** event `ATTRIBUTION_OVERRIDDEN`, audit `attribution.override`, analytics reflect it on the next request.

---

## 13. Analytics

### 13.1 `GET /api/analytics/dashboard`
- **Purpose:** every dashboard number from one filtered set of database rows, so charts never disagree (AC-M5.1–5.7, spec §7).
- **Roles:** coordinator.
- **Query**
  ```ts
  interface DashboardQuery {
    period?: '7d' | '30d' | '60d';    // default '30d'; window ends at current simTime
    laneId?: Id;
    transporterId?: Id;
  }
  ```
- **Response 200**
  ```ts
  interface DashboardResponse {
    filter: { period: '7d' | '30d' | '60d'; from: ISODateTime; to: ISODateTime; laneId: Id | null; transporterId: Id | null };
    generatedAtSim: ISODateTime;
    deliveredCount: number;                              // size of the filtered set (shipments that arrived in the window)
    kpis: {
      onTimePct: Pct;
      lateCount: number;
      medianDelayMinutesOfLate: Minutes | null;
      medianWarningLeadMinutes: Minutes | null;          // promisedBy − firstAtRiskAt, shipments that reached AT_RISK
      proactiveNoticeRatePct: Pct;                       // late-or-at-risk with customerNotifiedAt < promisedBy
      recoveredPct: Pct;                                 // reached AT_RISK, action chosen, delivered on time
      renegotiatedCount: number;
    };
    onTimeByLane: { laneId: Id; laneName: string; delivered: number; onTime: number; onTimePct: Pct }[];
    onTimeByTransporter: { transporterId: Id; name: string; isSmall: boolean; delivered: number; onTime: number; onTimePct: Pct }[];
    weeklyTrend: { weekStart: ISODateTime; delivered: number; onTimePct: Pct }[];
    causesByParty: { party: Party; minutes: Minutes; sharePct: Pct }[];
    causesByReason: { reason: ReasonCode; party: Party; minutes: Minutes }[];
    causesByLane: { laneId: Id; laneName: string; byParty: PartyMinutes[] }[];
    causesByTransporter: { transporterId: Id; name: string; byParty: PartyMinutes[] }[];
    transporterTable: {
      transporterId: Id; name: string; fleetSize: number; isSmall: boolean;
      delivered: number;
      rawOnTimePct: Pct;                                 // on time vs agreed promise
      fairOnTimePct: Pct;                                // late counts only if but-for rule says transporter caused it
      gapPct: Pct;                                       // fair − raw
      medianDelayMinutesOfLate: Minutes | null;
      topCause: { party: Party; reason: ReasonCode | null } | null;
    }[];
    definitions: Record<'onTime' | 'fairOnTime' | 'warningLead' | 'proactiveNotice' | 'recovered', string>;
    dataNote: string;                                    // "Fictional seeded data for Plant X."
  }
  ```
- **Validation:** `period` enum; ids must exist.
- **Errors:** `403 FORBIDDEN`, `404 NOT_FOUND` (unknown lane/transporter).
- **Data source:** `Shipment` rows with `arrivedAt` in the window (filtered) + their `DelayAttribution` rows. Computed per request by a pure aggregation function over database records; no stored aggregates.
- **Definitions** (also returned in `definitions`): on-time = `arrivedAt ≤ promisedBy`, where `promisedBy` is the **agreed** promise (D4; arrival vs delivery pending architecture §19 issue 19). Renegotiated shipments are included in on-time % and also counted in `renegotiatedCount`. Fair on-time applies the but-for rule (architecture §10.4).
- Drill-down: the UI calls `GET /api/shipments?status=delivered&laneId=…&deliveredFrom=…` with the same filter.

---

## 14. Audit

### 14.1 `GET /api/audit`
- **Purpose:** decision history (spec §5.14).
- **Roles:** coordinator.
- **Query:** `shipmentId?` (matches `entityId` of the shipment and its alerts, reports and options); `entityType?`; `entityId?`; `limit?` (default 100).
- **Response 200**
  ```ts
  interface AuditResponse {
    items: {
      id: Id; actor: { id: Id; name: string; role: Role } | null;
      action: string; entityType: string; entityId: Id | null;
      simTime: ISODateTime | null; createdAt: ISODateTime;
      data: Record<string, unknown>;
    }[];
  }
  ```
- **Errors:** `403 FORBIDDEN`.

---

## 14a. Reference data

### 14a.1 `GET /api/reference`
- **Purpose:** lists for dashboard filters and the simulation form (added in 0.2; previously missing).
- **Roles:** coordinator.
- **Response 200**
  ```ts
  interface ReferenceResponse {
    lanes: { id: Id; code: string; name: string; customerId: Id }[];
    routes: { id: Id; code: string; laneId: Id; name: string; isPrimary: boolean; segments: Segment[] }[];
    segments: { segmentCode: string; name: string; routeCodes: string[] }[];   // de-duplicated across routes
    transporters: { id: Id; code: string; name: string; fleetSize: number; isSmall: boolean }[];
    customers: { id: Id; code: string; name: string; city: string }[];
    trucks: { id: Id; code: string; transporterId: Id; status: 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE'; locationLabel: string; hasDefaultDriver: boolean }[];
  }
  ```
- **Validation:** none (no input).
- **Errors:** `403 FORBIDDEN`.

---

## 15. Client refetch rules

When `worldVersion` changes, the SPA invalidates these query keys (TanStack Query):

| Query key | Endpoint | Invalidate on version change |
|---|---|---|
| `['shipments', filters]` | 14 | Yes |
| `['shipment', id]`, `['eta', id]`, `['timeline', id]` | 15, 18, 16 | Yes |
| `['recoveryOptions', id]` | 29 | Yes |
| `['alerts', filters]`, `['alert', id]` | 26, 27 | Yes |
| `['notifications']` | 31 | Yes |
| `['driverReports', filters]` | 24 | Yes |
| `['trip']` | 21 | Yes |
| `['dashboard', filters]` | 36 | Yes (cheap at this data size) |
| `['replay', id]` | 19 | Yes |
| `['positions']` | 11 | Polled every 1 s while `running`; also on version change |
| `['mapLayers']` | 10 | Only on disruption changes and reset (version change is fine) |
| `['rules']` | 20 | Never (static per server start) |

---

## 16. Coverage: mandatory requirements → endpoints

| Requirement | Endpoints | Key acceptance criteria |
|---|---|---|
| M1 Three roles | 1, 2, 3; role scope on 10–19, 21–37 | AC-M1.1 (homePath), AC-M1.4 (404 out of scope), AC-M1.5 (logout), AC-M1.6 (customer DTOs) |
| M2 Map + milestones | 10, 11, 14, 15, 16, 17, 21 | AC-M2.1–2.7 |
| M3 ETA + risk + reasons | 18, 19, 20 (and cached fields in 14, 15) | AC-M3.1–3.8 |
| M4 Alerts + suggested action | 26, 27, 28, 29, 30, 31, 32, 33 | AC-M4.1–4.8 |
| M5 Dashboard by route + transporter | 36 (+ 14 for drill-down) | AC-M5.1–5.7 |
| X1 Replay | 19 | AC-X1.1–1.2 |
| X3 Recovery cards | 29, 30 | AC-X3.1 |
| X4 Simulator + reset | 4, 5, 6, 7, 8, 9 | AC-X4.1–4.3 |
| F1 Fair attribution | 34, 35, 36 | AC-F1.1–1.4 |
| F2/F3 Driver reports | 21, 22, 23, 24, 25 | AC-F2.1–F3.2 |
| S1 CO₂e | 29 (`co2eDeltaKg`, `co2eNote`), 20 (`co2e`) | AC-S1.1–1.2 |
| Reference data | 38 | Supports AC-M5.2 filters and the AC-X4.1 form |

---

## 17. Consistency review (0.2)

Checked every endpoint against `05_DATABASE_SCHEMA.md` and the role matrix in spec §4.

### 17.1 Findings and fixes
| # | Finding | Fix in 0.2 |
|---|---|---|
| C-1 | No endpoint returned lanes, transporters, segments or trucks for dashboard filters and the disruption form | Added #38 `GET /api/reference` |
| C-2 | Reroute changes the route, so replay positions need the route at snapshot time | `RiskSnapshot.routeId` added (schema); replay uses it |
| C-3 | Factor phases could not show a reroute's longer baseline without double counting | `PLAN_CHANGE` phase + `planChangeMinutes`; ledger `kind = PLAN_CHANGE` |
| C-4 | Replacement truck switches the driver (D3), but the original driver's trip had no way to show the hand-over | `recentHandovers` on #21; `driverChange` on #30; event data `previousDriverUserId` |
| C-5 | Ledger minutes would not sum exactly to the identity with fractional movement | Ledger stores integer `delaySeconds`; API rounds with largest remainder |
| C-6 | `Shipment.progressKm` (decimal) could disagree with the integer movement model | Schema uses `progressM` + `progressCarryMm`; API exposes `progressKm` as a derived number |
| C-7 | On-time definition used `deliveredAt` while the ETA refers to arrival | Definitions now use `arrivedAt` (pending §19 issue 19 of the architecture) |
| C-8 | Validation section referred to a schema library | Replaced by §1.2 (hand-written) |

### 17.2 Field-to-column check (summary)
| DTO field(s) | Column(s) / derivation |
|---|---|
| `ShipmentListItem*.etaAt/etaLowAt/etaHighAt/slackMinutes/riskLevel/riskScore/confidence` | `Shipment` cached fields |
| `transporter.isSmall` | `Transporter.fleetSize ≤ 10` (derived) |
| `hasOpenAlert`, `openAlert` | `Alert` where status ∈ {OPEN, ACTION_CHOSEN} |
| `pendingReportCount` | `DriverReport` where status = PENDING_REVIEW |
| `milestones[]` | `ShipmentEvent` (type MILESTONE) + `Milestone` enum order |
| `progressKm`, `stopped` | `Shipment.progressM ÷ 1000`; `stoppedUntil > simTime` |
| `EtaExplanationCoordinator.factors` | Latest `RiskSnapshot.factors` (incurred from `DelayAttribution`, expected from projection) |
| `plainReason` (customer) | Template from `Alert.topReason` / latest snapshot's largest factor reason |
| `RecoveryOptionDto.title`, `costNote`, `co2eNote` | Derived from `kind` + `params` + config |
| `NotificationDto` | `Notification` columns |
| `DriverReportDto` | `DriverReport` columns + reporter/reviewer names |
| `DisruptionDto.active` | `startsAt ≤ simTime < coalesce(endedEarlyAt, endsAt)` |
| `AttributionRowDto.minutes` | `DelayAttribution.delaySeconds` with rounding |
| Dashboard numbers | `Shipment` (`arrivedAt`, `onTime`, `delayMinutes`, `firstAtRiskAt`, `customerNotifiedAt`, `renegotiated`) + `DelayAttribution` |
| `DriverTripShipment.instruction`, `recentHandovers` | Derived from `stoppedUntil`, the chosen `RecoveryOption.params`, and `ShipmentEvent` RECOVERY_CHOSEN data |

### 17.3 Role and DTO check (summary)
| Rule | Status |
|---|---|
| Every endpoint lists roles that match spec §4 | ✓ |
| Customer-facing shapes (`view: 'customer'`) have no driver identity, party, factor code or internal id of another party | ✓ (enforced by serializers; tested by AZ-4) |
| Driver endpoints return only the caller's shipments | ✓ (#21, #17, #23 scoped by `driverUserId`) |
| Coordinator-only: simulation, disruptions, replay, reports queue, attribution, analytics, audit, reference | ✓ |
| Endpoints a role cannot call return 403; ids outside scope return 404 | ✓ |
| No endpoint returns a Prisma entity directly | ✓ (serializer rule, architecture §8.3) |

### 17.4 Remaining gaps (accepted)
- Customer and transporter dashboards (spec §4 marks them P2) have no endpoints yet.
- No pagination cursors (data is small).
