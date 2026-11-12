# 09 — Backend handoff for the frontend

Living document maintained by the backend (branch `backend`). It lists **only what is implemented and tested**. The full target contract is `06_API_SPEC.md`; types live in `packages/shared`.

Last updated: 2026-11-12 — **Milestone 6 (delay attribution, driver reports)**.

---

## 1. How to consume the contract

- Import types and enum lists from the workspace package `@routepulse/shared` (plain TypeScript, no runtime dependencies, never imports Prisma):
  ```ts
  import type { ApiError, HealthResponse, SyncResponse, RiskLevel } from '@routepulse/shared';
  import { RISK_LEVELS } from '@routepulse/shared';
  ```
- Enum lists mirror `apps/api/prisma/schema.prisma`. Use the `as const` arrays (e.g. `RISK_LEVELS`) for dropdowns and exhaustive switches.
- Do not copy DTOs into the web app; import them, so a contract change breaks the build instead of failing at runtime.

## 2. Running the API locally

```bash
npm install
cp apps/api/.env.example apps/api/.env      # then set DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET
docker compose up -d                       # or use a local PostgreSQL and create routepulse_dev / routepulse_test
npm run db:migrate                         # applies migrations to DATABASE_URL
npm run dev:api                            # http://localhost:4000
```
The SPA dev server should proxy `/api` to `http://localhost:4000` so cookies are same-origin (architecture §15).

## 3. Conventions (all endpoints)

| Topic | Rule |
|---|---|
| Base path | `/api` |
| Bodies | JSON only. A body without `Content-Type: application/json` → **415** `UNSUPPORTED_MEDIA`. Max 100 kB. |
| Errors | Always the envelope below. `message` is plain English and safe to display. |
| Request id | Every response has an `X-Request-Id` header; error bodies repeat it as `error.requestId`. Show it under "Show details" in error states. |
| Times | ISO 8601 UTC strings. Business times are simulation time; display in Asia/Kolkata. |
| CSP | API responses send `connect-src 'self'`; all requests must be same-origin. |

**Error envelope** (`ApiError`):
```json
{ "error": { "code": "NOT_FOUND", "message": "No such endpoint.", "requestId": "e973aec0-c75c-4e4e-bf7d-6392f2c17bf3" } }
```
Validation failures add `details: ValidationIssue[]`:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request body is not valid JSON.",
  "details": [{ "path": "body", "message": "Malformed JSON" }], "requestId": "…" } }
```
Status per code: `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN`/`DEMO_MODE_OFF` 403 · `NOT_FOUND` 404 · `UNSUPPORTED_MEDIA` 415 · `INVALID_TRANSITION`/`STALE_OPTIONS`/`ALREADY_DONE`/`CONFLICT` 409 · `RATE_LIMITED` 429 · `INTERNAL` 500.

## 4. Implemented endpoints

| Method | Path | Auth | Status |
|---|---|---|---|
| GET | `/api/health` | Public | Implemented + tested |
| POST | `/api/auth/login` (#1) | Public | Implemented + tested |
| POST | `/api/auth/logout` (#2) | Session | Implemented + tested |
| GET | `/api/auth/me` (#3) | Session | Implemented + tested |
| GET | `/api/sync` (#4) | Session (any role) | Implemented + tested |
| POST | `/api/sim/clock` (#5) | Coordinator + `DEMO_MODE` | Implemented + tested |
| POST | `/api/sim/reset` (#6) | Coordinator + `DEMO_MODE` | Implemented + tested |
| GET | `/api/shipments/:shipmentId/eta` (#18) | Coordinator, Customer (own) | Implemented + tested |
| GET | `/api/engine/rules` (#20) | Session (any role) | Implemented + tested |
| POST | `/api/driver-reports/classify` (#22) | Driver, Coordinator | Implemented + tested |
| POST | `/api/shipments/:shipmentId/driver-reports` (#23) | Driver (own shipment), Coordinator | Implemented + tested |
| GET | `/api/driver-reports` (#24) | Coordinator | Implemented + tested |
| POST | `/api/driver-reports/:reportId/review` (#25) | Coordinator | Implemented + tested |
| GET | `/api/shipments/:shipmentId/attribution` (#34) | Coordinator | Implemented + tested |
| POST | `/api/shipments/:shipmentId/attribution/overrides` (#35) | Coordinator | Implemented + tested |

### Driver reports and attribution (Milestone 6) — what the SPA must do
- **Classify while typing (#22):** `POST /api/driver-reports/classify` `{ "text": "tyre puncture near Lonavala" }` → `ClassifyResponse` `{ suggestedReason: "BREAKDOWN", matchedKeywords: ["tyre","puncture"], strength: "STRONG", defaultMinutes: 180, defaultParty: "TRANSPORTER", method: "KEYWORD_LIST_V1" }`. Writes nothing. Show "Suggested: Breakdown — matched: tyre, puncture. Is this right?"; with `suggestedReason: null` show "No suggestion — please pick a reason". `defaultParty` is null for Documents (depends on gate-out). Text 1–280 chars after trim. Customers → 403.
- **Create (#23):** `POST /api/shipments/:id/driver-reports` with `CreateDriverReportRequest` — at least one of `chipReason` / `text`; `reason` is one of the 8 chips; `estimatedMinutes` ∈ 30 / 60 / 120 / 240 (optional; otherwise the reason default); unknown fields → 400. **201** → `{ report: DriverReportDto, trip: DriverTripShipment | null }` (`trip` for drivers; null for coordinators). Errors: another driver's shipment → 404; before the truck is at the plant gate or after delivery → 409 `INVALID_TRANSITION` with a plain message. The server re-classifies the text itself. Effects: the truck is held (`trip.stopped: true`), the ETA gains an RPT bar with `reviewStatus: "PENDING_REVIEW"` (label "Pending coordinator review"), range +20 and confidence MEDIUM; refetch on `worldVersion`.
- **Review queue (#24):** `GET /api/driver-reports?status=PENDING_REVIEW|CONFIRMED&shipmentId=…&limit=1..200` (defaults: pending, 50), newest first.
- **Review (#25):** `POST /api/driver-reports/:id/review` `{ reason, party, note? }` — `note` (5–280) is required when reason or party changes; `party: "UNATTRIBUTED"` only with `reason: "OTHER"`. 200 → `{ report, eta }` (`eta` = coordinator explanation; the RPT bar now says CONFIRMED). Second review → 409 `ALREADY_DONE`; report on a delivered shipment → 409 `INVALID_TRANSITION` (use #35). There is no "reject" button in the contract: changing the reason/party with a note is the correction path.
- **Attribution (#34):** `GET /api/shipments/:id/attribution` → `AttributionResponse`. `status` LIVE while travelling, FINAL from arrival; `delayMinutes` and `countsAgainstTransporter` are null until arrival. Row `minutes` add up exactly to the shipment total; GAP rows (`kind: "GAP"`, Unattributed) mean "no recorded cause" — show them, never hide them. Show `ruleText` under the but-for result. Wording: "attributed to", never "fault".
- **Override (#35):** `POST /api/shipments/:id/attribution/overrides` `{ attributionId, newParty, note }` (note 5–280) → updated `AttributionResponse`; same party → 409 `ALREADY_DONE`; a row of another shipment → 404. The row keeps `originalParty`, `overrideNote`, `overriddenBy`, `overriddenAt`. Overriding a live row also changes that bar's party in the ETA explanation.
- **Hero values (report path):** 11:10 report → Fri 08:00, AT_RISK, ±85 MEDIUM; after the 11:20 review → ±60 HIGH. Without recovery the hero's final attribution is 1,120 min: Plant 124, Transporter 623, External 373; delay 840; does not count against Ghatline.

### ETA and risk (Milestone 5) — what the SPA must do
- **`GET /api/shipments/:shipmentId/eta`** → `EtaResponse` (`{ eta }`). Coordinator gets `EtaExplanationCoordinator`, customer (own order) gets `EtaSummaryCustomer`; driver → 403; another customer's or unknown id → 404; delivered → 409 `INVALID_TRANSITION` (show the shipment outcome instead). Refetch when `worldVersion` changes. Read-only: never moves the clock.
- **Waterfall:** start at `plannedArrivalAt`, add `factors` in the given order (INCURRED "So far" → PLAN_CHANGE → EXPECTED; within a phase GATE, HIST, DISR, RPT, WIN). The bars always sum to `predictedArrivalAt` (`identityHolds: true`); `totals` gives I / P / E. `P` is 0 until reroutes exist. Draw `promisedBy` as a line and `projectedRoadArrivalAt` as the road-arrival tick; WIN (`party: null`) carries `split[]` by party. Show `summary` as the headline sentence and `confidence` + `confidenceReason` as the chip, with "± range" from `etaLowAt`/`etaHighAt`. Always label it "Rule-based estimate" (`isRuleBased: true`).
- **Hero values after reset (Thu 10:25):** ETA 14:20 IST (`08:50Z`), ON_TRACK, slack 220, ±10, HIGH; bars GATE 40 (Plant, so far), HIST 4 (so far), HIST 16 (expected). After rain at 10:30 → 16:20 WATCH; after an 11:10 breakdown → Fri 08:00 AT_RISK with a WIN bar of 760 split Plant 84 / Transporter 423 / External 253.
- **Customer view:** only `predictedArrivalAt`, range, `promisedBy`, `level`, `plainReason` (e.g. "Vehicle breakdown on the route"; null when on track) — no parties, factor codes or driver identity.
- **Lists:** live shipments now have `etaAt`, `etaLowAt`, `etaHighAt`, `slackMinutes`, `riskLevel`, `riskScore`, `confidence` filled (list endpoints come in a later milestone). Level = colour + icon + text; `riskScore` is for sorting only, never a percentage.
- **GPS (O-14):** every truck on the road, including the manual hero, refreshes `lastUpdateAt` every 30 simulated minutes; this is not an event and does not appear in timelines. Driver milestone taps remain DRIVER events.
- **`GET /api/engine/rules`** → `EngineRulesResponse` for the "How is this calculated?" page (`ruleVersion` `eta-rules-v1`, thresholds 120/0, range/confidence/score rules, reason defaults, `co2e.enabled: false`).

### Simulation clock (what the SPA must do)
- **Poll `GET /api/sync` every 1 s** (every role). Response `SyncResponse`:
  ```json
  { "simTime": "2026-11-19T04:55:00.000Z", "running": false, "speed": 1, "stepMinutes": 5,
    "worldVersion": 42, "simError": null, "demoMode": true, "unreadNotifications": 0 }
  ```
  `simTime` 04:55 UTC = **Thu 10:25 IST** (display in Asia/Kolkata). When `worldVersion` changes, refetch the queries in API §15. Show "PAUSED" when `running` is false and an amber banner when `simError` is set.
- **Clock controls** (coordinator only): `POST /api/sim/clock` with `SimClockRequest`:
  `{ "action": "PLAY" }` · `{ "action": "PAUSE" }` · `{ "action": "SET_SPEED", "speed": 1 | 10 | 60 }` · `{ "action": "ADVANCE", "minutes": 5…720, multiple of 5 }` · `{ "action": "ADVANCE_TO", "to": "<ISO, on a 5-min boundary, ≤ 24 h ahead>" }`. Response `SimClockResponse` (state + `stepsExecuted`). ADVANCE/ADVANCE_TO always leave the clock **paused**. Extra fields → 400.
- **Reset demo:** `POST /api/sim/reset` with `{ "confirm": true }` → `SimResetResponse`; the world returns to **Thu 10:25, paused** (hero SHP-1042 in transit, 25.6 km out). Takes about half a second; the user stays signed in.
- **What moves:** shipment progress, milestones, ETA and risk change on 5-minute simulation steps and on actions; between steps nothing is written. Positions (#11) come in a later milestone.
- **Errors:** customer/driver → 403 `FORBIDDEN`; `DEMO_MODE=false` → 403 `DEMO_MODE_OFF`; invalid time target → 409 `INVALID_TRANSITION` with a plain message.

### Authentication behaviour (what the SPA must do)
- **Login:** `POST /api/auth/login` with `LoginRequest` (`{ email, password }`, JSON). 200 → `LoginResponse` (`user`, `homePath`) and an httpOnly cookie `rp_session` (8 h). The SPA never sees or stores the token; `fetch` must run same-origin (Vite proxy in dev) so the browser sends the cookie.
  ```json
  { "user": { "id": "usr_cust_arjun", "name": "Arjun", "email": "buyer@kestrel.test", "role": "CUSTOMER",
              "customer": { "id": "cus_kestrel", "name": "Kestrel Moulders" }, "transporter": null },
    "homePath": "/orders" }
  ```
- **Wrong credentials:** 401 `UNAUTHENTICATED`, message "Email or password is incorrect." (identical for unknown email, wrong password, inactive account). Show the message as-is.
- **Too many attempts:** 429 `RATE_LIMITED` (10 per minute per IP).
- **Bad input:** 400 `VALIDATION_ERROR` with `details[]` (`{ path, message }`); unknown fields are rejected — send exactly `email` and `password`.
- **Route guard:** call `GET /api/auth/me` on app start → `MeResponse` or 401 (go to `/login`). Use `user.role` only for UX; the server enforces every rule.
- **Logout:** `POST /api/auth/logout` with body `{}` → 204; the cookie is cleared and that session is revoked.
- **Any 401 from any endpoint** means "not signed in or session ended" → redirect to login ("Your session ended. Please sign in again.").
- **403 `FORBIDDEN`** = signed in but wrong role; **404 `NOT_FOUND`** also covers "exists but not yours" — show "This item is not available."
- **Deny by default:** every `/api` route except login and health needs a session, including unknown paths (401).
- **Three cookie jars for the demo (D2):** one browser profile per role; one cookie per origin.

### `GET /api/health`
Operational check (not one of the 38 product endpoints). 200 when the database answers, 503 otherwise.
```json
{ "status": "ok", "database": "up", "serverTime": "2026-11-12T08:34:18.666Z", "version": "0.1.0" }
```
Type: `HealthResponse`. `serverTime` is wall-clock time, not simulation time.

## 5. Contract types already published (endpoints not yet implemented)

| Type | For endpoint | Notes |
|---|---|---|
| All enum lists and unions (`ROLES`, `MILESTONES`, `RISK_LEVELS`, `PARTIES`, `REASON_CODES`, `DRIVER_REASON_CODES`, `NOTIFICATION_KINDS`, …) | All | Mirror of schema v0.3 (incl. `PHYSICAL_ARRIVAL`, `RECOVERY_APPLIED`, `ARRIVED_LATE`) |
| `ApiError`, `ErrorCode`, `ValidationIssue`, `ListResponse<T>`, `Id`, `ISODateTime`, `Minutes`, `Pct` | All | |
| `SimStateDto`, `SyncResponse`, `SimClockRequest`, `SimClockResponse`, `SimResetRequest`, `SimResetResponse` | #4, #5, #6 | **Implemented** (Milestone 4) |
| `Factor`, `FactorPhase` (`FACTOR_PHASES`), `PartyMinutes`, `EtaExplanationCoordinator`, `EtaSummaryCustomer`, `EtaResponse`, `EngineRulesResponse`, `RULE_VERSION` | #18, #20 (and later #19 replay, #23, #30) | **Implemented** (Milestone 5) |
| `DriverReportDto`, `DriverTripShipment`, `DriverHandover`, `ClassifyRequest`, `ClassifyResponse`, `CreateDriverReportRequest`, `CreateDriverReportResponse`, `DriverReportListResponse`, `ReviewDriverReportRequest`, `ReviewDriverReportResponse`, `REPORT_ESTIMATE_MINUTES`, `AttributionRowDto`, `AttributionResponse`, `AttributionOverrideRequest` | #21 (DTO only), #22–#25, #34, #35 | **Implemented** (Milestone 6). `CreateDriverReportRequest` narrows `chipReason`/`reason` to `DriverReasonCode` (the documented validation). `DriverTripShipment.instruction` is always null until recovery (Milestone 7) |

**Action for the web app (type collisions):** `apps/web/src/api/contract/pending.ts` still declares 20 types that are now published here, so `npm run typecheck -w @routepulse/web` fails with "already exported" errors: `AttributionOverrideRequest`, `AttributionResponse`, `AttributionRowDto`, `ClassifyRequest`, `ClassifyResponse`, `CreateDriverReportRequest`, `CreateDriverReportResponse`, `DriverHandover`, `DriverReportDto`, `DriverTripShipment`, `EngineRulesResponse`, `EtaExplanationCoordinator`, `EtaSummaryCustomer`, `Factor`, `PartyMinutes`, `ReviewDriverReportRequest`, `ReviewDriverReportResponse`, `SimClockRequest`, `SimClockResponse`, `SimResetResponse`. Delete them from `pending.ts` and import them from `@routepulse/shared` where the remaining pending types use them. (The backend does not edit `apps/web`.)
| `UserDto`, `LoginRequest`, `LoginResponse`, `MeResponse`, `HomePath`, `SESSION_COOKIE_NAME` | #1–#3 | **Implemented** (Milestone 3) |

You may build against these with fixtures; field names will not change without a note here.

### Added in Milestone 2 (types only; endpoints come later)
| Type / constant | For | Notes |
|---|---|---|
| `Segment`, `GeoJSONLineString`, `GeometrySource` | #10 map layers, #38 reference | Route geometry is **hand-traced demo data** (`x_source: "HAND_TRACED_DEMO"` in the stored GeoJSON). Show a small "Illustrative routes" note on the map. |
| `PLANT`, `DISPLAY_TIME_ZONE`, `RISK_THRESHOLDS`, `SMALL_FLEET_MAX` | Map, formatting, badges | UI-safe constants |

## 5a. Seeded demo data (for building screens)
Run `npm run seed` (needs `SEED_DEMO_PASSWORD` in `apps/api/.env`). Clock: **Thu 2026-11-19 08:00 IST, paused**. Full list: `planning/10_SEED_DATA.md`.

| Account (all share `SEED_DEMO_PASSWORD`) | Role | Scope |
|---|---|---|
| `coordinator@plantx.test` (Meera) | COORDINATOR | everything |
| `buyer@kestrel.test` (Arjun) | CUSTOMER | Kestrel Moulders, Pune (hero customer) |
| `buyer@osprey.test`, `buyer@plover.test`, `buyer@avocet.test`, `buyer@merlin.test`, `buyer@shrike.test` | CUSTOMER | one customer each |
| `driver.ramesh@ghatline.test` | DRIVER | hero SHP-1042 (TRK-07) |
| `driver.suresh@ghatline.test` | DRIVER | replacement truck TRK-11 (D3 hand-over) |
| 6 more drivers (`driver.*@*.test`) | DRIVER | their live shipments |

Log in with these accounts through `/api/auth/login` (Milestone 3). Right after `npm run seed` (without a reset) live shipments have no ETA yet until the first simulation step; after `POST /api/sim/reset` every live shipment has its ETA and risk. Keep a "calculating" state for null values.

## 6. Polling and freshness (planned behaviour, API §15)

- Poll `GET /api/sync` every 1 s; refetch affected queries when `worldVersion` changes. Not yet implemented.

## 7. Known incomplete functionality

Implemented: `/api/health`, authentication (#1–#3), the simulation clock (#4–#6), ETA explanation (#18), engine rules (#20), driver reports (#22–#25) and attribution (#34, #35). Not yet implemented: shipments/orders lists and detail, timeline, replay (#19), driver trip (#21), map layers and positions, disruption endpoints (#7–#9), alerts, recovery, notifications endpoints (the `REPORT_NEEDS_REVIEW` row is already written), analytics (raw/fair on-time is computed in the service, not yet exposed). Next: Milestone 7, after approval.

## 8. Contract change log

| Date | Change | Breaking? |
|---|---|---|
| 2026-11-12 | Initial publish: enums, base types, `HealthResponse`, `SimStateDto`, `SyncResponse` | — |
| 2026-11-12 | Added `Segment`, `GeoJSONLineString`, `GeometrySource`, `PLANT`, `DISPLAY_TIME_ZONE`, `RISK_THRESHOLDS`, `SMALL_FLEET_MAX` | No |
| 2026-11-12 | Added `SimClockRequest`, `SimClockResponse`, `SimResetRequest`, `SimResetResponse` (as specified in API §5); #4–#6 implemented | No |
| 2026-11-12 | Added driver-report, driver-trip and attribution types (API §2.2, §9, §12); #22–#25, #34, #35 implemented; attribution final at arrival (L1); ETA bars follow the ledger party | No |
| 2026-11-12 | Added `Factor`, `FactorPhase`, `FACTOR_PHASES`, `PartyMinutes`, `EtaExplanationCoordinator`, `EtaSummaryCustomer`, `EtaResponse`, `EngineRulesResponse`, `RULE_VERSION` (as specified in API §2 and §8); #18 and #20 implemented; manual hero truck now refreshes `lastUpdateAt` via simulated GPS (O-14) | No |
| 2026-11-12 | Added `UserDto`, `HomePath`, `LoginRequest`, `LoginResponse`, `MeResponse`, `SESSION_COOKIE_NAME` (already specified in API §2.2/§4; now published). Unauthenticated calls to unknown `/api` paths now return 401 instead of 404 | No (new types); behaviour change for unknown paths only |
