# Changelog

All notable changes to this repository are recorded here. Format based on Keep a Changelog. Dates are in YYYY-MM-DD.

Entries below describe the backend (branch `backend`) and frontend (branch `frontend`) work and the planning documentation.

## [Unreleased]

### Added (Frontend Phases 1–2)
- **Frontend Phases 1–2 (foundation + control tower), branch `frontend`:**
  - `apps/web` (`@routepulse/web`) added to the npm workspace: React 19, Vite 8, strict TypeScript 5.9, Tailwind CSS 4, Radix UI, TanStack Query, React Router, MapLibre GL JS, lucide-react, Recharts (installed, not yet used); Vitest 4. All from the L9 approved list. Root configuration unchanged.
  - Design tokens from UI plan §2 in `styles/tokens.css`, mapped into the Tailwind theme with the default palette disabled (no raw HEX in components).
  - Typed API client with the error envelope (`ApiRequestError`), a `RoutePulseApi` service interface for endpoints #1–#38 with an HTTP implementation, TanStack Query hooks, 1 s `/api/sync` polling with `worldVersion` invalidation, retry and session-expiry rules (architecture §5.2, §13).
  - App shell: coordinator, customer, driver and login layouts; role guard; one error boundary per route tree; skeleton loading; reconnecting and simulation-error banners; top-bar simulation clock; notification bell.
  - Login page (UI plan §5).
  - Coordinator control tower (UI plan §6): KPI strip, risk-sorted shipment list with chips, search and keyboard navigation, offline MapLibre map with routes, disruption segments and HTML truck/site/plant markers, alerts and activity tabs (activity from `GET /api/audit`, L7), selected-shipment quick panel, recovery cards with confirm and new-window dialogs and stale/conflict handling, simulation dock with reset dialog.
  - Development mock (`npm run dev:mock -w @routepulse/web`): in-browser, fictional fixtures following the documented SHP-1042 scenario; excluded from the production build.
  - DTOs not yet published in `@routepulse/shared` are transcribed verbatim from `06_API_SPEC.md` into `apps/web/src/api/contract/pending.ts` as a temporary, single-file exception (see handoff §3).
  - 72 unit tests (API client, retry/session rules, role guard, formatting, login validation, status badges, list filters, activity summaries, recovery ordering, map geometry, mock fixture identity checks).
  - `docs/FRONTEND_BACKEND_HANDOFF.md`.

### Added (Milestone 5)
- **Backend Milestone 5 (ETA and risk engine), branch `backend`:**
  - Four-term ETA (L3) at the receiving gate (L1): `predicted = planned + incurred (I) + plan change (P) + expected (E)`; I from the clock, P from route baselines (0 without a reroute), E from a forward projection; largest-remainder rounding so the bars always add up (`identityHolds`).
  - Projection = the **same simulation engine** run forward on a copy of the world (manual steps as soon as allowed): gate queue, history pace (HIST), slowdowns/closures/breakdowns (DISR), stops (RPT), L5 precedence and the receiving window with the shipment override (WIN, L4/O-12) are implemented once (`engines/eta.ts`).
  - Live delay ledger booked during settle (pulled forward from task 8.1): GATE, HIST, DISR, RPT and WIN rows in `DelayAttribution` with deterministic ids; drift-free rounding (cumulative ledger = round(I) at every step); WIN knock-on split, never to the customer.
  - Risk rules (`engines/risk.ts`): level thresholds 120/0, LATE, score, range (5% + 30 stale + 20 per pending report, nearest 5), confidence HIGH/MEDIUM/LOW; `ruleVersion = eta-rules-v1`.
  - **O-14:** the manual hero truck sends simulated GPS pings every 30 min like background trucks (also while stopped); pings only refresh `lastUpdateAt`, never create events or milestones.
  - Recalculation pipeline (`services/etaService.ts`) inside every settle, milestone, reset (incl. a SEED calculation at 08:00) and the new `simulationService.applyChange` entry point for disruptions, reports, recovery and window changes; cached ETA/risk fields on `Shipment`; `RiskSnapshot` per the snapshot rule (no overwrite, no identical duplicate at one minute); `worldVersion` bumped on material change.
  - Endpoints #18 `GET /api/shipments/:shipmentId/eta` (coordinator explanation; customer plain summary) and #20 `GET /api/engine/rules`.
  - Shared contracts: `Factor`, `FactorPhase`, `PartyMinutes`, `EtaExplanationCoordinator`, `EtaSummaryCustomer`, `EtaResponse`, `EngineRulesResponse`, `RULE_VERSION`; hand-written guard `isFactorArray` for snapshot factors.
  - Tests: 234 passing (new: 26 ETA-engine unit tests, 6 risk-rule tests, 19 ETA integration tests incl. R1 hero part, R5, R6 and HTTP scoping); O-14, L5, snapshot-cadence and customer-leak mutations each caught.

### Changed (Milestone 5)
- `SimDisruption` carries party, reason, label and a simulation-time "created" order (start time, then id) for deterministic L5 tie-breaks; `SimShipment` carries its ledger and stop cause.
- Recalculation hook signature: receives the static world and the shipments touched by events/actions, and returns whether it made a material change.
- Simulation integration digests now include `DelayAttribution` and `RiskSnapshot`.

### Added (Milestone 4)
- **Backend Milestone 4 (deterministic simulation), branch `backend`:**
  - Pure discrete-event engine `engines/simulate.ts`: integer seconds and millimetres, exact BigInt rational speeds and paces, every 5-minute grid boundary is an event boundary; segment crossings, disruption edges, gate queue (FCFS over 3 bays, 40-min loading, never leaving before planned departure), autopilot milestones, physical arrival, eligible check-in (L1/L4/O-12), delivery after unloading, truck release, tracking pings and seeded silence.
  - Disruption effects: weather slowdown (largest wins), road closure held at segment entry, truck breakdown hold, gate congestion (largest extra wins); stop beats slowdown (L5).
  - Pace per (transporter, lane) derived from seeded history as exact rationals (`engines/pace.ts`, O-13).
  - Simulation service: in-process world lock, one Prisma transaction per grid step and per action, in-memory clock restored on rollback, explicit (still empty) recalculation hook for Milestone 5, `worldVersion` on material changes and controls, long-gap guard.
  - Driver milestone service for manual shipments (AT_GATE, GATE_OUT, ARRIVED, DELIVERED) with plain-language 409 reasons; `arrivedAt`/`deliveredAt` from simulation times, not tap times (L6).
  - Reset: seed + hero pre-script through the real services → Thu 10:25 paused (L2): SHP-1042 AT_GATE 08:10, LOADING 08:50, GATE_OUT 09:30, 25.603 km at 10:25.
  - Endpoints #4 `GET /api/sync`, #5 `POST /api/sim/clock`, #6 `POST /api/sim/reset`; shared `SimClockRequest`, `SimClockResponse`, `SimResetRequest`, `SimResetResponse`.
  - Tests: 183 passing (22 engine unit tests, 26 simulation integration tests); gate-order, mutex and rollback mutations each caught.

### Changed
- `writeAudit` accepts a transaction client so audit rows commit atomically with the state they describe.
- Config: optional `SEED_DEMO_PASSWORD` (≥ 12 chars when set) is now also read by the API for the demo reset.
- Test server exposes the app (for the simulation service) and never starts real timers.

### Added (Milestone 3)
- **Backend Milestone 3 (authentication and authorisation), branch `backend`:**
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (#1–#3).
  - HS256 session tokens with `node:crypto` (no JWT dependency): exact-header check (rejects `alg=none`), constant-time signature check, 8 h real-time expiry, per-session id; httpOnly SameSite=Lax cookie, `Secure` in production.
  - Logout revocation via an in-memory deny-list (AZ-6); deactivated or deleted users lose access on the next request.
  - Session middleware that loads the user from the database on every request (role and scope never taken from the token or the client); `requireAuth` (deny by default for every `/api` route except login and health), `requireRole`, `requireDemoMode`.
  - Scope policies for shipments, orders, alerts, notifications, customers and driver reports, plus 404-for-out-of-scope guards.
  - Uniform login failure (wrong password / unknown email / inactive) with a dummy bcrypt comparison against timing leaks; in-memory login rate limit 10/min/IP (429).
  - Audit rows `auth.login`, `auth.login.failed` (email only), `auth.logout`.
  - Hand-written request validator (`apps/api/src/validation/validator.ts`, CT-2).
  - Shared contracts published from API spec §2.2/§4: `UserDto`, `HomePath`, `LoginRequest`, `LoginResponse`, `MeResponse`, `SESSION_COOKIE_NAME`.
  - Tests: 135 passing in total (new: session/cookie/rate-limit/validator units, 23 auth HTTP tests, 12 authorisation tests); three injected security regressions were each caught.

### Changed
- **O-12 decided:** an accepted receiving-window override accepts any road arrival up to its end, including before normal opening (`engines/receivingWindow.ts`; tested). Gate access, unloading availability and on-time eligibility are documented as separate concepts.
- **Historical pace:** the engine and Milestone 5 golden tests use the history-derived pace (Pune/Ghatline r = 0.0741), recorded in the engine doc, seed facts and PROGRESS (O-13).
- **O-11 (`pmtiles`)** deferred for frontend coordination; not a backend dependency.
- Unauthenticated requests to unknown `/api` paths now return 401 instead of 404 (deny by default); the foundation test was updated accordingly.

### Added (Milestone 2)
- **Backend Milestone 2 (schema + deterministic seed), branch `backend`:**
  - Complete `schema.prisma`: 20 models, 22 enums (schema doc v0.3), all documented relations and indexes; explicit `onDelete: Restrict` except the 5 documented Cascades.
  - Migration `full_schema` with 49 CHECK constraints and 5 partial unique indexes; `prisma migrate diff` confirms Prisma will not drop them.
  - Enum drift check: compile-time equality of shared unions vs Prisma enums (`apps/api/src/contract-checks.ts`) + runtime order test.
  - Pure helpers reused by later engines: largest-remainder rounding, IST time helpers, receiving-window eligibility and knock-on WIN split.
  - Hand-written Json guards for route geometry and segments.
  - Deterministic, idempotent seed (`npm run seed`): 6 customers, 5 transporters, 15 users, 20 trucks, 6 lanes, 9 routes with **hand-traced demo geometry** (labelled `HAND_TRACED_DEMO`), 177-shipment 60-day history with an exactly reconciling attribution ledger, 12 live shipments incl. hero SHP-1042 at Thu 08:00 (paused).
  - Shared: `Segment`, `GeoJSONLineString`, `GeometrySource`, `PLANT`, `DISPLAY_TIME_ZONE`, `RISK_THRESHOLDS`, `SMALL_FLEET_MAX`.
  - `SEED_DEMO_PASSWORD` environment variable (gitignored `.env`); `bcryptjs` 3.0.3 dependency.
  - `planning/10_SEED_DATA.md` (seed facts and assumptions, task 4.5).
  - Tests: 80 passing (enum drift, helpers, pure seed data, two-reset reproducibility digest, idempotency, SQL invariants, constraint presence, 10 constraint-rejection cases, time-zone regression).

### Fixed
- **Time-zone storage bug:** with a PostgreSQL server whose default time zone is not UTC (here Asia/Kolkata), timestamps written through the Prisma pg adapter were stored shifted by the server offset while still round-tripping through Prisma. Every API database session now sets `TimeZone=UTC`; regression test reads stored values with SQL.

### Changed
- Seed code lives in `apps/api/src/seed/` (not `apps/api/prisma/seed/` as sketched in architecture §4) so the Milestone 4 reset service can import it.
- Foundation test for SimState CHECKs now targets the existing singleton row (the old version could pass on the primary-key error instead of the CHECK).

### Added (Milestone 1)
- **Backend Milestone 1 (foundation), branch `backend`:**
  - npm workspaces (`apps/api`, `packages/shared`); strict TypeScript base config.
  - `@routepulse/shared`: enum lists mirroring schema v0.3; `ApiError`, `ErrorCode`, `ValidationIssue`, `ListResponse`, primitives; `HealthResponse`, `SimStateDto`, `SyncResponse`.
  - `apps/api`: Express v5 app with request id, JSON-only guard (415), 100 kB body limit, helmet with same-origin CSP, single-line JSON logs, error envelope middleware, `GET /api/health`.
  - Hand-validated environment configuration (`DATABASE_URL`, `SESSION_SECRET` ≥ 32 chars, `DEMO_MODE`, `PORT`, `NODE_ENV`, `LOG_LEVEL`); `apps/api/.env.example`.
  - Prisma 7.10.1 with the `@prisma/adapter-pg` driver adapter; `prisma.config.ts` loads `.env` with Node's built-in loader (no dotenv).
  - Migrations: `init_sim_state`, `sim_state_checks` (SimState CHECK constraints).
  - `docker-compose.yml` (PostgreSQL 17 + test database init script).
  - Vitest with a global setup that migrates the separate test database; 12 tests (unit + integration against the real app and database).
  - `planning/09_BACKEND_HANDOFF.md` for the frontend developer.
- `GET /api/health` recorded in `06_API_SPEC.md` as an operational endpoint.
- `.gitignore`: `node_modules/`, `dist/`, `.env*` (except `.env.example`), generated Prisma client.

## [0.0.2] — 2026-11-12 — Decision lock (documentation only)

### Added
- Locked decisions L1–L10 recorded in `planning/04_TECH_ARCHITECTURE.md` §0.1.
- Schema: `Shipment.physicalArrivalAt` (L6) and `Shipment.receivingWindowOverrideEndAt` (L4), with CHECK constraints; `EventType.PHYSICAL_ARRIVAL` and `EventType.RECOVERY_APPLIED`.
- API: `arrivedAt` on shipment list items; `projectedRoadArrivalAt` and `receivingWindow` on the coordinator ETA explanation; `physicalArrivalAt`, `receivingWindowOverrideEndAt` on shipment detail; `RecoveryOptionDto.newWindowEnd`; `arrivedFrom`/`arrivedTo` list filters.
- Engine doc: arrival terms (road arrival, applicable receiving window, eligible check-in time), NEW_WINDOW preview and acceptance rules, L5 overlap precedence statement, recalculated hero values.
- Tests planned: ET-8 (overlap precedence), ET-9 (arrival confirmation), ET-10 (receiving override).

### Changed
- Promise, ETA and on-time are measured at arrival at the customer's receiving gate (L1); `deliveredAt` means unloading complete. Dashboard population and indexes moved from `deliveredAt` to `arrivedAt`; `deliveredCount` renamed `arrivedCount`; `NotificationKind.DELIVERED_LATE` renamed `ARRIVED_LATE`.
- Demo reset now seeds and runs the hero pre-script through the real services to Thu 10:25, paused (L2); journeys J1, J9 and the run-sheet updated, with "Advance to" steps.
- ETA identity documented as four terms everywhere (L3): planned + incurred + plan change + expected; spec AC-M3.2 and AC-X2.1 wording aligned (IDs and meaning unchanged).
- NEW_WINDOW: the accepted window is stored per shipment; the window is fixed on the option, and `ChooseRecoveryRequest.newWindowEnd` was removed so the preview and execution match (L4).
- Arrival confirmation: `arrivedAt` is the eligible check-in time of the physical arrival, never the tap time; waiting for a tap books no delay (L6).
- Activity feed uses `GET /api/audit` (L7). Frontend dependency set approved (L9). Schema simplification S-1 rejected (L8).
- `react-map-gl` removed from the design (not in the approved list); MapLibre GL JS is used directly.

### Fixed
- Hero SHP-1042: delivery time corrected from 17:45 (before the 17:50 arrival) to **18:50** (17:50 arrival + 60 min seed-default unloading); "transfer ~90 min" reconciled as total stoppage 11:10–12:40; customer-alert preview corrected to ≈17:35 (computed at 11:10); alerts fire at 11:10, not 11:12; customer update range ±20 min (computed), not ±25; split timing no longer quoted as a fixed number.
- Journeys: baseline described as the primary route baseline (270 min), not a historical median.

### Removed
- Open-item lists in the engine doc and UI plan (all resolved by L1–L10); the "awaiting arrival confirmation" UNATTRIBUTED booking (replaced by L6).

## [0.0.1] — 2026-11-12 — Planning and documentation milestone

### Added
- `planning/IDEA_HUNT.md`: constraints, 60 ideas, top-20 shortlist, prior-art and evidence review, red-team, three directions, and the decision record locking **RoutePulse** (Direction 1 with selected Direction 3 elements).
- `planning/02_PRODUCT_SPEC.md`: product specification with acceptance criteria for all five mandatory requirements (M1–M5), differentiators (X1–X4), driver/attribution features (F1–F3), sustainability and accessibility gates.
- `planning/03_USER_JOURNEYS.md`: personas, nine journeys, hero scenario SHP-1042, 4-minute demo run-sheet.
- `planning/04_TECH_ARCHITECTURE.md`: architecture (Express v5 API, React SPA, PostgreSQL + Prisma), determinism model, ETA identity, offline map plan, security, testing strategy, decisions D1–D9.
- `planning/05_DATABASE_SCHEMA.md`: 20-table Prisma schema design with constraints, ER diagram and table classification.
- `planning/06_API_SPEC.md`: 38 endpoint contracts as plain TypeScript types, manual validation rules, consistency review.
- `planning/07_UI_UX_PLAN.md`: design tokens, screen layouts, component structure, states, accessibility, visual QA checklist.
- `planning/08_ETA_AND_RISK_ENGINE.md`: deterministic ETA, attribution, risk, recovery and simulation rules with worked examples.
- `CLAUDE.md`, `PROGRESS.md`, `CHANGELOG.md` and an expanded `README.md`.

### Changed
- Architecture, schema and API revised to v0.2 after team review: Express v5 confirmed; three Chrome cookie jars for the demo; second seeded driver for replacement trucks; on-time against the agreed promise; prorated transporter history; autopilot background shipments; shared coordinator read state.
- ETA explanation changed from "baseline + factors" to "planned arrival + incurred + expected" (plus a plan-change term after a reroute) to remove double counting.
- Delay ledger changed to integer seconds; movement to integer metres with a carry, so simulation results are exactly reproducible.
- `README.md` replaced: the previous file contained only the title `# lyb-hackathon`.

### Fixed
(Corrections made while drafting, before the documents were approved.)
- Journeys: corrected the hero scenario's split-shipment timing (a new truck from the plant could not reach Pune by 16:30 in the rain).
- Product spec: receiving-window waits are no longer attributed to the customer by default; "Agree new window" and "Notify only" are never auto-suggested.

### Removed
- Zod (and any schema-validation library) from the design; `schema.prisma` is the single source of truth and request validation is hand-written (decision D9).
