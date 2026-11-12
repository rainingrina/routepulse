# PROGRESS — RoutePulse

Last updated: 2026-11-12 — backend Milestones 1 (foundation), 2 (schema + deterministic seed) and 3 (authentication and authorisation) on branch `backend`; frontend Phases 1–2 (foundation + control tower) on branch `frontend`, built against an in-browser development mock. Nothing is marked Verified. Frontend ↔ backend notes: `docs/FRONTEND_BACKEND_HANDOFF.md`.

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

---

## 1. Project setup

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 1.1 | npm workspaces: `apps/api`, `packages/shared` (backend side); strict `tsconfig` — `apps/web` is added by Dev B | Dev A | Approval to start | Tested | `npm run typecheck` + `npm test` pass (12 tests) |
| 1.2 | Root scripts: `dev:api`, `typecheck`, `test`, `db:migrate`, `db:generate`, `seed` exist; `build`, `demo`, `reset` pending (later milestones) | Dev A | 1.1 | In Progress | Existing scripts run |
| 1.3 | Docker Compose for PostgreSQL; `apps/api/.env.example` (`DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `DEMO_MODE`, `PORT`, `NODE_ENV`, `LOG_LEVEL`) | Dev A | 1.1 | Implemented | Compose file **not run** (Docker daemon off on this machine); development and tests verified against local PostgreSQL 17 |
| 1.4 | Vite + React app shell; dev proxy for `/api`, `/tiles`, `/glyphs` — `apps/web` joined the workspace; scripts `dev`, `dev:mock`, `build`, `typecheck`, `test` (run with `-w @routepulse/web`) | Dev B | 1.1 | Implemented | Typecheck + production build pass; mock dev server serves every module; not yet run against the API |
| 1.5 | Express v5 app: helmet (same-origin CSP), JSON-only (415) + 100 kB limit, requestId, error envelope middleware, request log, `GET /api/health` | Dev A | 1.1 | Tested | 7 integration tests pass; a deliberately broken 415 guard made the suite fail (test can fail) |
| 1.6 | Vitest set-up (api workspace); test DB `routepulse_test` migrated by global setup; guard refuses non-test databases | Dev A | 1.3 | Tested | Runs green; guard proven by refusing the dev DB |
| 1.7 | `packages/shared`: enum mirror, base types, `HealthResponse`, `SimStateDto`, `SyncResponse`, `Segment`, `GeoJSONLineString`, constants (`PLANT`, thresholds); endpoint DTOs and fixtures added per milestone | Both | 1.1 | In Progress | Typechecked; enum drift check passes (2.4) |
| 1.8 | Design tokens (`tokens.css`), Tailwind theme, self-hosted Inter | Dev B | 1.4 | In Progress | Tokens (UI plan §2) and Tailwind theme done; default palette disabled; Inter files not added yet (handoff Q5) |
| 1.9 | `.gitignore` covers `.env*` (except `.env.example`), `dist/`, `node_modules/`, generated Prisma client (developers commit) | Dev A | 1.1 | Implemented | N/A |

## 2. Database and Prisma

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 2.1 | `schema.prisma`: all 20 models and 22 enums per schema doc v0.3 (incl. `physicalArrivalAt`, `receivingWindowOverrideEndAt`); explicit `onDelete: Restrict` except the 5 documented Cascades | Dev A | 1.3 | Tested | `prisma validate` passes; migration applied to dev and test; integration tests query real tables |
| 2.2 | Migrations `init_sim_state`, `sim_state_checks`, `full_schema`: 49 CHECK constraints + 5 partial unique indexes; `prisma migrate diff` against the schema is empty (Prisma will not drop them) | Dev A | 2.1 | Tested | Constraint and index lists asserted; 10 behavioural rejection tests pass |
| 2.3 | Json guards: `isLineString`, `isSegmentArray`, `routeProblems` done (used by the seed); guards for factors, option params and notification params come with their milestones | Dev A | 2.1 | In Progress | Route guards tested |
| 2.4 | Enum drift check: compile-time equality of 22 shared unions vs Prisma enums (`contract-checks.ts`) + runtime order test (CT-1) | Dev A | 1.7, 2.1 | Tested | Passes; renaming one shared value failed both `tsc` (1 error) and the test |

## 3. Authentication and authorisation

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 3.1 | Login / logout / me (#1–#3): bcrypt verification with dummy-hash timing guard, HS256 session cookie (`node:crypto`), 8 h expiry, logout revocation (in-memory deny-list), in-memory login rate limit 10/min/IP, audit `auth.login` / `auth.login.failed` / `auth.logout` | Dev A | 2.2 | Tested | 23 HTTP integration tests + 13 unit tests; smoke-tested on the dev server; revocation mutation caught |
| 3.2 | `requireAuth` (deny by default), `requireRole`, `requireDemoMode`, session middleware loading the DB user; scope policies for shipments, orders, alerts, notifications, customers, driver reports; 404-for-out-of-scope guards | Dev A | 3.1 | Tested | 12 authorisation tests against the seeded DB; scope and token-role mutations caught |
| 3.3 | Validation helpers (`validation/validator.ts`) + CT-2 | Dev A | 1.5 | Tested | 8 unit tests |
| 3.4 | Login page, role guard, three route trees (UI plan §3, §5) | Dev B | 1.8, 3.1 | Implemented | Guard decision, login validation and session-expiry rule unit-tested; not yet run against the now-implemented #1–#3 |
| 3.5 | AZ-1 … AZ-8 integration tests — **AZ-6, AZ-7 (middleware level), AZ-8 (validation/415) done**; AZ-1 (full role matrix), AZ-2/3/5 (per endpoint), AZ-4 (deep key scan per endpoint) are written as each product endpoint lands, using the tested scope policies | Dev A | 3.2, 5.x | In Progress | Identity endpoints and scope layer covered |

## 4. Seed data

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 4.1 | Route geometry: **hand-traced demo GeoJSON** (open-routing export unavailable), labelled `x_source: HAND_TRACED_DEMO`; 9 routes, segments chosen to match approved baselines | Dev A | — | Tested | Structural route checks pass; Pune 270 min with ghat at 90–150 |
| 4.2 | Reference data: 6 customers, 5 transporters, 20 trucks, 6 lanes, 9 routes, 15 users (incl. second Ghatline driver Suresh + TRK-11 at Khopoli, D3) | Dev A | 2.2 | Tested | Seed reproducibility + data tests pass |
| 4.3 | Deterministic 60-day history: 177 delivered shipments, ledger reconciles exactly, knock-on WIN split, alerts from known-delay timing | Dev A | 4.2 | Tested | Reconciliation (unit + SQL), L1 on-time, no WIN→customer; reconciliation test proven to fail when WIN rows are dropped |
| 4.4 | Live shipments + hero SHP-1042 at Thu 08:00 **done**; hero pre-script 08:00 → 10:25 through the real services pending (needs Milestone 4 simulation) | Dev A | 4.2, 6.x | In Progress | Hero plan/promise/truck/driver/order and gate arrangement tested |
| 4.5 | Facts/assumptions file: `planning/10_SEED_DATA.md` | Dev A | 4.3 | Implemented | N/A |

## 5. Shipment APIs

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 5.1 | Orders and shipments (#12–#15) with role serializers | Dev A | 3.2, 4.2 | Not Started | Not tested |
| 5.2 | Timeline (#16) and milestones (#17) with transition rules | Dev A | 5.1 | Not Started | Not tested |
| 5.3 | Map layers (#10), positions (#11), reference (#38) | Dev A | 4.1, 5.1 | Not Started | Not tested |
| 5.4 | Driver trip (#21) incl. instruction and hand-overs | Dev A | 5.1, 9.4 | Not Started | Not tested |
| 5.5 | Audit (#37) | Dev A | 5.1 | Not Started | Not tested |

## 6. Simulation

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 6.1 | `SimState`, sync (#4), world lock | Dev A | 2.2 | Not Started | Not tested |
| 6.2 | `settleTo(t)` movement (integer metres + carry), boundaries, disruption edges | Dev A | 6.1 | Not Started | Not tested |
| 6.3 | Autopilot milestones, gate queue, pings; manual hero rules | Dev A | 6.2 | Not Started | Not tested |
| 6.4 | Clock controls (#5): play/pause/speed/advance/advance-to; long-gap guard | Dev A | 6.2 | Not Started | Not tested |
| 6.5 | Reset (#6) ≤ 5 s — the seed half is done (≈ 0.5 s, idempotent, two-reset digest identical); the endpoint and hero pre-script are pending | Dev A | 4.4, 6.1 | In Progress | Seed reproducibility tested (dev + test DB) |
| 6.6 | Disruptions (#7–#9) with impact summary | Dev A | 6.2, 7.x | Not Started | Not tested |
| 6.7 | Reproducibility tests R1–R8 | Dev A | 6.2–6.5 | Not Started | Not tested |

## 7. ETA and risk engines

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 7.1 | `projectEta` (gate, transit pieces, closures, stops, WIN with receiving override, L5 precedence) | Dev A | 6.2 | Not Started | Not tested |
| 7.2 | Identity + largest-remainder rounding (ET-1, ET-2, ET-3) | Dev A | 7.1 | Not Started | Not tested |
| 7.3 | HIST pace from history + proration (ET-6) | Dev A | 4.3, 7.1 | Not Started | Not tested |
| 7.4 | Risk level, score, range, confidence (RK-1…RK-3) | Dev A | 7.1 | Not Started | Not tested |
| 7.5 | Recalculation pipeline + snapshot rule; ETA endpoint (#18), rules (#20), replay (#19) | Dev A | 7.1, 7.4 | Not Started | Not tested |
| 7.6 | Worked examples 1–3 from the engine doc as unit tests | Dev A | 7.2 | Not Started | Not tested |

## 8. Delay attribution

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 8.1 | Ledger booking in settle (AT-1) incl. L5 overlap rules (ET-8) | Dev A | 6.2 | Not Started | Not tested |
| 8.2 | WIN knock-on split (ET-7) | Dev A | 8.1 | Not Started | Not tested |
| 8.3 | Physical arrival, eligible check-in, finalisation at ARRIVED, GAP row, but-for rule (AT-2, AT-4, ET-9) | Dev A | 8.1 | Not Started | Not tested |
| 8.4 | Attribution endpoints (#34, #35) + overrides (AT-3) | Dev A | 8.3 | Not Started | Not tested |

## 9. Alerts and recovery

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 9.1 | Alert lifecycle + one-active index; notifications (#31–#33) | Dev A | 7.5 | Not Started | Not tested |
| 9.2 | Alerts (#26, #27) and customer response (#28) | Dev A | 9.1 | Not Started | Not tested |
| 9.3 | `generateOptions` (5 kinds), Suggested rule (RC-1, RC-2) | Dev A | 7.1 | Not Started | Not tested |
| 9.4 | Choose (#30) incl. hand-over (D3), staleness 409; NEW_WINDOW acceptance applies the stored override (L4) (RC-4, RC-5, ET-10, AZ-9) | Dev A | 9.3 | Not Started | Not tested |
| 9.5 | Driver reports: classify (#22), create (#23), queue (#24), review (#25) (CL-1) | Dev A | 7.5 | Not Started | Not tested |
| 9.6 | CO₂e on options — only if G-CO2 passes (RC-3 must pass either way) | Dev A | O-9 (gate) | Not Started | Not tested |

## 10. Map

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 10.1 | One-hour offline tiles spike (architecture §16.2) — record PASS/FAIL | Dev B | 1.4 | Not Started | N/A |
| 10.2 | Basemap (PMTiles, if O-11 approved) or GeoJSON fallback; CSP check | Dev B | 10.1, O-11 | In Progress | Offline style without tiles/glyphs (land colour only); basemap data pending (handoff Q8); MapLibre worker served same-origin (Q4) |
| 10.3 | Layers, HTML truck/site markers, legend, selection sync | Dev B | 10.2, 5.3 | Implemented | Segment slicing unit-tested; runs on mock data only; not checked in a browser yet |
| 10.4 | Marker interpolation, reduced-motion behaviour | Dev B | 10.3 | Not Started | Not tested |

## 11. Coordinator screens

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 11.1 | Control tower layout, KPI strip, shipment list (UI plan §6) | Dev B | 3.4, 5.1, 10.3 | Implemented | List filter/search and at-risk detection unit-tested; mock data only; not checked in a browser yet |
| 11.2 | Alerts tab and activity feed from `GET /api/audit` (L7) | Dev B | 9.2, 5.5 | Implemented | Domain-action filter and summaries unit-tested; audit `data` keys unconfirmed (handoff Q2) |
| 11.3 | Quick panel + shipment detail page (UI plan §6.5, §7) | Dev B | 7.5 | In Progress | Quick panel done; detail page not started |
| 11.4 | ETA waterfall (four terms, road-arrival tick, receiving window band) + factor list | Dev B | 7.5 | In Progress | Factor list (text equivalent) done; waterfall chart not started |
| 11.5 | Recovery cards, confirm/new-window dialogs, stale/conflict states (UI plan §9) | Dev B | 9.4 | Implemented | Card order unit-tested; choose flow and 409 handling exercised only against the mock |
| 11.6 | Replay page (UI plan §10) | Dev B | 7.5 | Not Started | Not tested |
| 11.7 | Simulation dock + page; reset dialog | Dev B | 6.4–6.6 | In Progress | Top-bar clock, map dock (play/pause/speed/+1 h) and reset dialog done; Simulation page and "Advance to" not started |
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
| 15.2 | Golden hero test G0–G8 | Dev A | 6.x–9.x | Not Started | Not tested |
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
