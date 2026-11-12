# PROGRESS — RoutePulse

Last updated: 2026-11-12 — backend Milestones 1–6 and **Combined Milestone 1** (M7 disruptions, alerts, notifications + the control tower on real APIs) on branch `backend`; frontend Phases 1–2 merged and now integrated with the real API (the in-browser mock remains available for development only). Nothing is marked Verified. Frontend ↔ backend notes: `docs/FRONTEND_BACKEND_HANDOFF.md`.

**Status values:** Not Started · In Progress · Implemented · Tested · Verified
- *Implemented* = code written. *Tested* = automated tests written and passing (ran by us). *Verified* = checked in the running app against the acceptance criteria.

**Owners:** Dev A = API and data, Dev B = web and design (suggested split, architecture §21). Replace with names when the team confirms.
**Test IDs** refer to `planning/04_TECH_ARCHITECTURE.md` §20. **AC IDs** refer to `planning/02_PRODUCT_SPEC.md` §6.

---

## 0. Planning and documentation

| ID | Document | Status | Notes |
|---|---|---|---|
| D-01 | `planning/IDEA_HUNT.md` | Locked (2026-11-12) | Direction and decision record |
| D-02 | `planning/02_PRODUCT_SPEC.md` (v0.2) | Approved; terminology aligned to L1–L4 — revision awaiting review | No acceptance criterion removed (57 before and after) |
| D-03 | `planning/03_USER_JOURNEYS.md` (v0.2) | Approved; hero scenario corrected to L1, L2, L6 — revision awaiting review | |
| D-04 | `planning/04_TECH_ARCHITECTURE.md` (v0.3) | Approved; decision lock L1–L10 recorded — revision awaiting review | Decisions D1–D9, L1–L10 |
| D-05 | `planning/05_DATABASE_SCHEMA.md` (v0.3) | Approved; two `Shipment` fields and enum changes — revision awaiting review | |
| D-06 | `planning/06_API_SPEC.md` (v0.3) | Approved; contract changes for L1, L4, L6, L7 — revision awaiting review | |
| D-07 | `planning/07_UI_UX_PLAN.md` (v0.2) | Approved; decision log closed — revision awaiting review | |
| D-08 | `planning/08_ETA_AND_RISK_ENGINE.md` (v0.2) | Approved; all former open items resolved — revision awaiting review | |
| D-09 | `CLAUDE.md`, `PROGRESS.md`, `CHANGELOG.md`, `README.md` | Updated for the decision lock — awaiting review | |

### Decision status
| # | Decision | Status |
|---|---|---|
| O-1 | Promise at arrival or delivery | **Locked — L1** (arrival at the receiving gate) |
| O-2 | Demo start time | **Locked — L2** (reset to Thu 10:25, paused) |
| O-3 | ETA identity | **Locked — L3** (four terms) |
| O-4 | NEW_WINDOW receiving hours | **Locked — L4** (`Shipment.receivingWindowOverrideEndAt`) |
| O-5 | Overlaps and arrival confirmation | **Locked — L5, L6** |
| O-6 | Activity feed source | **Locked — L7** (`GET /api/audit`) |
| O-7 | Icons, UI dependency set, Inter | **Locked — L9** |
| O-8 | Schema simplification S-1 | **Rejected — L8** (relational schema retained) |
| O-9 | G-CO2: verified emissions factor | **Gate closed (L10)** — CO₂e stays disabled until verified; does not block implementation |
| O-10 | G-LANG: verified second language | **Gate closed (L10)** — English only until verified; does not block implementation |
| O-11 | `pmtiles` browser library for the tiled basemap (not in the L9 list) | **Deferred** (2026-11-12) — frontend coordination; not a backend dependency. GeoJSON fallback basemap remains available (architecture §16.3) |
| O-12 | Receiving override and arrivals before normal opening | **Decided (2026-11-12): literal rule** — an accepted override accepts any road arrival up to its end, including before opening. Implemented in `engines/receivingWindow.ts`, tested. Gate access, unloading availability and on-time eligibility are separate concepts |
| O-13 | Historical pace for the engine | **Decided (2026-11-12):** derive from seeded history (Pune/Ghatline r = 0.0741); Milestone 5 golden tests use the derived pace |
| O-14 | Simulated GPS for the manual hero truck | **Decided (2026-11-12): (b)** — manual trucks ping every 30 min like autopilot trucks (also while stopped); pings only refresh `lastUpdateAt`, never create events or milestones; AT_GATE, GATE_OUT, ARRIVED, DELIVERED stay manual. Implemented in `engines/simulate.ts`, tested (afternoon confidence stays HIGH) |
| O-15 | Logout revocation is in memory | **Accepted for the prototype (2026-11-12).** Production requirement: persistent revocation (e.g. a session table or a per-user session version) — not built without approval |

---

## 1. Project setup

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 1.1 | npm workspaces: `apps/api`, `packages/shared` (backend side); strict `tsconfig` — `apps/web` is added by Dev B | Dev A | Approval to start | Tested | `npm run typecheck` + `npm test` pass (12 tests) |
| 1.2 | Root scripts: `dev:api`, `dev:web`, `dev:web:mock`, `build:web`, `typecheck` (shared + api + web), `test` (typecheck + api + web tests), `db:migrate`, `db:generate`, `seed`; `demo`, `reset` scripts and an API-served production build pending | Dev A | 1.1 | In Progress | All existing scripts run (verified 2026-11-12, `docs/DEVELOPMENT_AND_TESTING.md`) |
| 1.3 | Docker Compose for PostgreSQL; `apps/api/.env.example` (`DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `DEMO_MODE`, `PORT`, `NODE_ENV`, `LOG_LEVEL`) | Dev A | 1.1 | Implemented | Compose file **not run** (Docker daemon off on this machine); development and tests verified against local PostgreSQL 17 |
| 1.4 | Vite + React app shell; dev proxy for `/api`, `/tiles`, `/glyphs` — `apps/web` joined the workspace; scripts `dev`, `dev:mock`, `build`, `typecheck`, `test` (run with `-w @routepulse/web`) | Dev B | 1.1 | Implemented | Typecheck + production build pass; mock dev server serves every module; not yet run against the API |
| 1.5 | Express v5 app: helmet (same-origin CSP), JSON-only (415) + 100 kB limit, requestId, error envelope middleware, request log, `GET /api/health` | Dev A | 1.1 | Tested | 7 integration tests pass; a deliberately broken 415 guard made the suite fail (test can fail) |
| 1.6 | Vitest set-up (api workspace); test DB `routepulse_test` migrated by global setup; guard refuses non-test databases | Dev A | 1.3 | Tested | Runs green; guard proven by refusing the dev DB |
| 1.7 | `packages/shared`: enums, base types and the DTOs of every implemented endpoint (#1–#6, #18, #20–#25, #34, #35); the web app imports them (20 former duplicates removed from `apps/web/src/api/contract/pending.ts`); DTOs of unbuilt endpoints still live in `pending.ts` until published | Both | 1.1 | In Progress | Workspace typecheck clean (shared, api, web); enum drift check passes (2.4) |
| 1.8 | Design tokens (`tokens.css`), Tailwind theme, self-hosted Inter | Dev B | 1.4 | In Progress | Tokens (UI plan §2) and Tailwind theme done; default palette disabled; Inter files not added yet (handoff Q5) |
| 1.9 | `.gitignore` covers `.env*` (except `.env.example`), `dist/`, `node_modules/`, generated Prisma client (developers commit) | Dev A | 1.1 | Implemented | N/A |

## 2. Database and Prisma

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 2.1 | `schema.prisma`: all 20 models and 22 enums per schema doc v0.3 (incl. `physicalArrivalAt`, `receivingWindowOverrideEndAt`); explicit `onDelete: Restrict` except the 5 documented Cascades | Dev A | 1.3 | Tested | `prisma validate` passes; migration applied to dev and test; integration tests query real tables |
| 2.2 | Migrations `init_sim_state`, `sim_state_checks`, `full_schema`: 49 CHECK constraints + 5 partial unique indexes; `prisma migrate diff` against the schema is empty (Prisma will not drop them) | Dev A | 2.1 | Tested | Constraint and index lists asserted; 10 behavioural rejection tests pass |
| 2.3 | Json guards: `isLineString`, `isSegmentArray`, `routeProblems` (seed), `isFactorArray` (RiskSnapshot.factors), `isReportNeedsReviewParams` (Notification.params for REPORT_NEEDS_REVIEW); alert/response notification params are built from typed literals in `alertService` without a separate guard yet; option params come with M8 | Dev A | 2.1 | In Progress | Route, factor and report-notification guards exercised by tests |
| 2.4 | Enum drift check: compile-time equality of 22 shared unions vs Prisma enums (`contract-checks.ts`) + runtime order test (CT-1) | Dev A | 1.7, 2.1 | Tested | Passes; renaming one shared value failed both `tsc` (1 error) and the test |

## 3. Authentication and authorisation

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 3.1 | Login / logout / me (#1–#3): bcrypt verification with dummy-hash timing guard, HS256 session cookie (`node:crypto`), 8 h expiry, logout revocation (in-memory deny-list), in-memory login rate limit 10/min/IP, audit `auth.login` / `auth.login.failed` / `auth.logout` | Dev A | 2.2 | Tested | 23 HTTP integration tests + 13 unit tests; smoke-tested on the dev server; revocation mutation caught |
| 3.2 | `requireAuth` (deny by default), `requireRole`, `requireDemoMode`, session middleware loading the DB user; scope policies for shipments, orders, alerts, notifications, customers, driver reports; 404-for-out-of-scope guards | Dev A | 3.1 | Tested | 12 authorisation tests against the seeded DB; scope and token-role mutations caught |
| 3.3 | Validation helpers (`validation/validator.ts`) + CT-2 | Dev A | 1.5 | Tested | 8 unit tests |
| 3.4 | Login page, role guard, three route trees (UI plan §3, §5) | Dev B | 1.8, 3.1 | Implemented | Guard decision, login validation and session-expiry rule unit-tested; not yet run against the now-implemented #1–#3 |
| 3.5 | AZ series: AZ-6/7/8 at middleware level; per-endpoint role, scope (AZ-2/3/5) and customer deep-key scans (AZ-4) written for #14–#16, #10, #11, #26–#28, #31–#33, #37, #38, #7–#9, #18, #22–#25, #34, #35. A generated full role matrix (AZ-1) over all 38 endpoints is not written yet | Dev A | 3.2, 5.x | In Progress | Per-endpoint checks pass |

## 4. Seed data

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 4.1 | Route geometry: **hand-traced demo GeoJSON** (open-routing export unavailable), labelled `x_source: HAND_TRACED_DEMO`; 9 routes, segments chosen to match approved baselines | Dev A | — | Tested | Structural route checks pass; Pune 270 min with ghat at 90–150 |
| 4.2 | Reference data: 6 customers, 5 transporters, 20 trucks, 6 lanes, 9 routes, 15 users (incl. second Ghatline driver Suresh + TRK-11 at Khopoli, D3) | Dev A | 2.2 | Tested | Seed reproducibility + data tests pass |
| 4.3 | Deterministic 60-day history: 177 delivered shipments, ledger reconciles exactly, knock-on WIN split, alerts from known-delay timing | Dev A | 4.2 | Tested | Reconciliation (unit + SQL), L1 on-time, no WIN→customer; reconciliation test proven to fail when WIN rows are dropped |
| 4.4 | Live shipments + hero SHP-1042 at Thu 08:00, and the hero pre-script 08:00 → 10:25 through the real simulation services (AT_GATE 08:10 driver, LOADING 08:50 simulation, GATE_OUT 09:30 driver) | Dev A | 4.2, 6.x | Tested | Hero sequence, sources, 40-min gate wait and 25.603 km at 10:25 asserted |
| 4.5 | Facts/assumptions file: `planning/10_SEED_DATA.md` | Dev A | 4.3 | Implemented | N/A |

## 5. Shipment APIs

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 5.1 | Shipments list (#14, filters/sort/limit, role views) and detail (#15) done; orders (#12, #13) not started | Dev A | 3.2, 4.2 | In Progress | #14/#15 integration tests (roles, scope, filters, validation, customer key scan) |
| 5.2 | Timeline (#16) done (coordinator all events with actors; customer milestones/notices/recovery without actors). Milestone taps over HTTP (#17) not started (service exists since M4) | Dev A | 5.1 | In Progress | #16 tested |
| 5.3 | Map layers (#10, role-scoped, `x_source: HAND_TRACED_DEMO` kept), positions (#11, live shipments, extrapolated between grid steps by the same engine, read-only), reference (#38) | Dev A | 4.1, 5.1 | Tested | Scoping per role, extrapolation writes nothing |
| 5.4 | Driver trip (#21) incl. instruction and hand-overs | Dev A | 5.1, 9.4 | Not Started | Not tested |
| 5.5 | Audit (#37): coordinator, shipment filter incl. its alerts/reports/attribution rows; `shipmentCode` added to audit data for the activity feed | Dev A | 5.1 | Tested | Roles, filters, validation |

## 6. Simulation

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 6.1 | `SimState` clock service, `GET /api/sync` (#4), in-process world lock (`sim/mutex.ts`) | Dev A | 2.2 | Tested | Sync for all roles; concurrency tests; mutex mutation caught |
| 6.2 | Pure discrete-event engine (`engines/simulate.ts`): integer seconds and millimetres, exact rational speeds/paces, grid boundaries always event boundaries, segment crossings, disruption edges; persisted position (`progressM` + `progressCarryMm`) | Dev A | 6.1 | Tested | 22 engine unit tests; restart-midway carry test; one-call vs many-calls bit-identical |
| 6.3 | Autopilot milestones (AT_GATE at planned gate, FCFS gate queue over 3 bays, LOADING, GATE_OUT not before planned departure, physical arrival, ARRIVED at eligible check-in, DELIVERED after unloading, truck release), pings + seeded silence; manual hero via `recordMilestone` (L6: `arrivedAt` = physical/eligible time, never the tap time) | Dev A | 6.2 | Tested | Gate order (arrival-vs-code mutation caught), L6 late-tap test, autopilot delivery test |
| 6.4 | Clock controls (#5): PLAY, PAUSE, SET_SPEED 1×/10×/60×, ADVANCE, ADVANCE_TO; long-gap guard (12 steps, pause, `simError`) | Dev A | 6.2 | Tested | Speed tests per speed, pause/resume without jump, R8, validation and role tests |
| 6.5 | Reset (#6): deterministic seed + hero pre-script → Thu 10:25 paused, ≈ 0.5–0.7 s; sessions survive (stable user ids); audit `sim.reset` | Dev A | 4.4, 6.1 | Tested | R7 two-reset digest identical; < 5 s asserted |
| 6.6 | Disruptions: engine effects (M4), ledger/ETA booking (M5) and endpoints #7 list, #8 create (4 kinds, validation, impact summary, events, audit), #9 end early — all through `applyChange` and the single pipeline | Dev A | 6.2, 7.x | Tested | Create/end/list, validation, roles, DEMO_MODE off, ETA effect via the engine |
| 6.7 | Reproducibility tests: R1 (hero part), R2, R3/R4 (incl. ledger and snapshots), R5, **R6 both variants** (disruption action and driver report at 11:07, running vs paused: identical shipments, events, ledger, snapshots, reports, notifications), R7, R8. R1 for alerts/options waits for those milestones | Dev A | 6.2–6.5 | Tested | All pass against the real engine and test database |

## 7. ETA and risk engines

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 7.1 | `projectEta` = the simulation engine run forward on a world copy (`engines/eta.ts` `projectWorld`): gate queue, transit pieces, closures, stops, breakdowns, WIN with receiving override, L5 precedence | Dev A | 6.2 | Tested | Golden checkpoints, closure, pre-departure gate queue, ET-8, ET-10 |
| 7.2 | Identity + largest-remainder rounding (ET-1, ET-2, ET-3) | Dev A | 7.1 | Tested | ET-1 at every 5-min step 09:30–18:00; ET-2 property test (1,000 ledgers); ET-3 over 12 settles |
| 7.3 | HIST pace from history + proration (ET-6) | Dev A | 4.3, 7.1 | Tested | 20 → 10 → 0 min |
| 7.4 | Risk level, score, range, confidence (RK-1…RK-3) | Dev A | 7.1 | Tested | `engines/risk.ts`, 6 unit tests |
| 7.5 | Recalculation pipeline (`services/etaService.ts`) + snapshot rule + cached fields; ETA endpoint (#18) and rules (#20) done; replay (#19) **not started** (needs the timeline/position DTOs) | Dev A | 7.1, 7.4 | In Progress | Pipeline, snapshot rule, transactions, #18 scoping/AZ-4 scan, #20 tested |
| 7.6 | Worked examples from the engine doc as unit tests: Example 2 (hero 09:30 / 10:25 / 10:30 / 11:10 / 11:25) and Example 3 (17:50 after the transfer) done with the derived pace; Example 1 (Nashik, designed p = 0.95) not written | Dev A | 7.2 | In Progress | Example 2–3 checkpoints pass |

## 8. Delay attribution

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 8.1 | Ledger booking in settle (AT-1) incl. L5 overlap rules (ET-8) — **pulled into Milestone 5** (needed for the incurred bars) | Dev A | 6.2 | Tested | Gate wait, late truck, pace, slowdown, stops, two stops, two slowdowns, split invariance |
| 8.2 | WIN knock-on split (ET-7) | Dev A | 8.1 | Tested | Incurred and projected split; UNATTRIBUTED without other minutes; never CUSTOMER |
| 8.3 | Physical arrival, eligible check-in, finalisation at ARRIVED (rows FINAL at `arrivedAt`, never the tap time; idempotent), GAP row (UNATTRIBUTED remainder of arrivedAt − plannedArrival), but-for rule, raw vs fair on-time per transporter (AT-2, AT-4, ET-9) | Dev A | 8.1 | Tested | Hero (manual, tap 5 min after eligibility) and autopilot finalisation; GAP from missing evidence; Example 4; seed table reproduced |
| 8.4 | Attribution endpoints (#34, #35) + overrides incl. merge (AT-3) | Dev A | 8.3 | Tested | Roles, scoping, validation, merge, LIVE-row override visible in the ETA |

## 9. Alerts and recovery

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 9.1 | Alert lifecycle in the pipeline (open on AT_RISK/LATE, one active per shipment, firstAtRiskAt/customerNotifiedAt, resolve on level drop or at arrival, new episode after resolution) and notifications AT_RISK, AT_RISK_CUSTOMER, BACK_ON_TRACK, ARRIVED_LATE, REPORT_NEEDS_REVIEW, CUSTOMER_RESPONDED; endpoints #31–#33. RECOVERY_CONFIRMED / PLAN_UPDATED come with M8; DELIVERED notification not implemented (no documented trigger/audience) | Dev A | 7.5 | Tested | G2 alerts, no duplicates (AC-M4.7), resolution, scoping, read state |
| 9.2 | Alerts #26, #27 (coordinator and customer views) and customer response #28 (record, notify, event, audit). The NEW_WINDOW acceptance branch of #28 comes with M8 | Dev A | 9.1 | In Progress | #26–#28 tested |
| 9.3 | `generateOptions` (5 kinds), Suggested rule (RC-1, RC-2) | Dev A | 7.1 | Not Started | Not tested |
| 9.4 | Choose (#30) incl. hand-over (D3), staleness 409; NEW_WINDOW acceptance applies the stored override (L4) (RC-4, RC-5, ET-10, AZ-9) | Dev A | 9.3 | Not Started | Not tested |
| 9.5 | Driver reports: classify (#22), create (#23), queue (#24), review (#25) (CL-1); RPT pending → confirmed; review re-tags attribution. Driver trip endpoint #21 itself is task 5.4 (the `DriverTripShipment` DTO is built and returned by #23) | Dev A | 7.5 | Tested | 29 integration + classifier unit tests; driver scope and role checks |
| 9.6 | CO₂e on options — only if G-CO2 passes (RC-3 must pass either way) | Dev A | O-9 (gate) | Not Started | Not tested |

## 10. Map

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 10.1 | One-hour offline tiles spike (architecture §16.2) — record PASS/FAIL | Dev B | 1.4 | Not Started | N/A |
| 10.2 | Basemap (PMTiles, if O-11 approved) or GeoJSON fallback; CSP check | Dev B | 10.1, O-11 | In Progress | Offline style without tiles/glyphs (land colour only); basemap data pending (handoff Q8); MapLibre worker served same-origin (Q4) |
| 10.3 | Layers, HTML truck/site markers, legend, selection sync — now on real #10/#11; map container height bug fixed; legend labels hand-traced routes; positions-unavailable notice | Dev B / Dev A | 10.2, 5.3 | Implemented | Browser-checked at 1440/1024/768/390 (manual); no automated map rendering test (WebGL) |
| 10.4 | Marker interpolation, reduced-motion behaviour | Dev B | 10.3 | Not Started | Not tested |

## 11. Coordinator screens

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 11.1 | Control tower layout, KPI strip, shipment list — connected to real #14/#26/#24; dashboard KPIs (#36) show "Unavailable" until M10 | Dev B / Dev A | 3.4, 5.1, 10.3 | Implemented | Component tests from real API fixtures; manual browser run |
| 11.2 | Alerts tab (real #26: shipment code, status, first-at-risk time, reason) and activity feed (real #37) | Dev B / Dev A | 9.2, 5.5 | Implemented | Component tests from real API fixtures; manual browser run |
| 11.3 | Quick panel (real #15/#18) + shipment detail page (#15, #18, #34, #16) | Dev A | 7.5 | Implemented | Component tests (live, arrived, 404, loading); manual browser run |
| 11.4 | ETA explanation: four-term identity table + factor list on the detail page (from #18). A graphical waterfall chart is not built | Dev A | 7.5 | In Progress | Component tests |
| 11.5 | Recovery cards/dialogs exist (mock); with the real API an explicit "not available yet" notice is shown until M8 (`features/recovery/availability.ts`) | Dev B | 9.4 | In Progress | Notice tested (and mutation-checked) |
| 11.6 | Replay page (UI plan §10) | Dev B | 7.5 | Not Started | Not tested |
| 11.7 | Simulation dock (real #5/#6) + Simulation page: inject disruption (#8, segments from #38), impact summary, active list with End (#7/#9) | Dev A | 6.4–6.6 | Implemented | Component tests; manual browser run (rain → 3 alerts, impact shown) |
| 11.8 | Driver reports queue; attribution tab with overrides | Dev B | 8.4, 9.5 | Not Started | Not tested |

## 12. Customer portal

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 12.1 | Orders list with alert banner and response buttons (UI plan §11) | Dev B | 5.1, 9.2 | Not Started | Not tested |
| 12.2 | Order detail with plain ETA, milestones, own map | Dev B | 12.1, 10.3 | Not Started | Not tested |
| 12.3 | Notifications page | Dev B | 9.1 | Not Started | Not tested |

## 13. Driver portal

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 13.1 | Trip page: next-step card, instruction, hand-over banner, mini map (UI plan §12) | Dev B | 5.4 | Not Started | Not tested |
| 13.2 | Report a problem: chips, suggestion confirm, duration, success | Dev B | 9.5 | Not Started | Not tested |
| 13.3 | 360 px check, ≥ 48 px targets | Dev B | 13.1, 13.2 | Not Started | Not tested |

## 14. Analytics

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 14.1 | `analyticsService` + dashboard endpoint (#36), arrival-based; AZ-10 | Dev A | 8.3 | Not Started | Not tested |
| 14.2 | Dashboard page: filters, KPIs, charts with table toggle, transporter table (UI plan §13) | Dev B | 14.1 | Not Started | Not tested |

## 15. Testing and integration

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 15.1 | Day-1 go/no-go gate (IDEA_HUNT §7.6) by build hour 5 | Both | 4.4, 6.3, 7.5, 3.2, 10.3 | Not Started | Not tested |
| 15.2 | Golden hero test G0–G8 — G0, G1, **G2** (report path incl. one OPEN alert, firstAtRiskAt 11:10, coordinator + customer notifications, REPORT_NEEDS_REVIEW), G3 (customer response part), G4 pass through the services/HTTP. G5–G8 need recovery (M8) | Dev A | 6.x–9.x | In Progress | G0–G4 parts pass |
| 15.3 | Full suite green: unit + integration + typecheck | Both | All | Not Started | Not tested |
| 15.4 | Acceptance-criteria walk-through (spec §6) in the running app | Both | 11–14 | Not Started | Not tested |
| 15.5 | Visual QA checklist (UI plan §19) | Dev B | 11–14 | Not Started | Not tested |
| 15.6 | Accessibility pass (keyboard, contrast, reduced motion) | Dev B | 11–14 | Not Started | Not tested |
| 15.7 | Offline run with Wi-Fi off | Both | 10.2, 16.1 | Not Started | Not tested |

## 16. Demo preparation

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 16.1 | `npm run demo` one-command start on the demo laptop | Dev A | 15.3 | Not Started | Not tested |
| 16.2 | Three Chrome cookie jars set up (D2); driver account switch rehearsed (D3) | Both | 16.1 | Not Started | N/A |
| 16.3 | Backup laptop with the same build; recorded fallback run | Both | 16.1 | Not Started | N/A |
| 16.4 | Rehearse 4-minute run-sheet ×3 with timer (journeys §5) | Both | 16.2 | Not Started | N/A |
| 16.5 | Architecture diagram slide matching the build; impact indicator with formula and assumptions | Both | 15.4 | Not Started | N/A |
| 16.6 | Generative-AI declaration (README + slide) | Both | — | Not Started | N/A |
| 16.7 | Feature stop at build hour 15 | Both | — | Not Started | N/A |
