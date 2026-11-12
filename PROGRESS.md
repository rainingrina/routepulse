# PROGRESS — RoutePulse

Last updated: 2026-11-12. **No application code exists yet.** Implementation starts only after the team's explicit approval.

**Status values:** Not Started · In Progress · Implemented · Tested · Verified
- *Implemented* = code written. *Tested* = automated tests written and passing (ran by us). *Verified* = checked in the running app against the acceptance criteria.

**Owners:** Dev A = API and data, Dev B = web and design (suggested split, architecture §21). Replace with names when the team confirms.
**Test IDs** refer to `planning/04_TECH_ARCHITECTURE.md` §20. **AC IDs** refer to `planning/02_PRODUCT_SPEC.md` §6.

---

## 0. Planning and documentation

| ID | Document | Status | Notes |
|---|---|---|---|
| D-01 | `planning/IDEA_HUNT.md` | Locked (2026-11-12) | Direction and decision record |
| D-02 | `planning/02_PRODUCT_SPEC.md` | Approved | Do not edit |
| D-03 | `planning/03_USER_JOURNEYS.md` | Approved | Do not edit |
| D-04 | `planning/04_TECH_ARCHITECTURE.md` (v0.2) | Approved in principle; v0.2 under review | Decisions D1–D9 |
| D-05 | `planning/05_DATABASE_SCHEMA.md` (v0.2) | Approved in principle; v0.2 under review | |
| D-06 | `planning/06_API_SPEC.md` (v0.2) | Approved in principle; v0.2 under review | |
| D-07 | `planning/07_UI_UX_PLAN.md` (v0.1) | Draft — awaiting review | |
| D-08 | `planning/08_ETA_AND_RISK_ENGINE.md` (v0.1) | Draft — awaiting review | |
| D-09 | `CLAUDE.md`, `PROGRESS.md`, `CHANGELOG.md`, `README.md` | Draft — awaiting review | |

### Open decisions that block or shape implementation
| # | Decision | Source | Blocks |
|---|---|---|---|
| O-1 | Promise measured at arrival or delivery | Architecture §19 #19 | 2.x schema fields, 8.x engine, 14.x definitions |
| O-2 | Demo start time (reset to 10:25 vs advance on stage) | Architecture §19 #18 | 4.4, 16.x |
| O-3 | Three-term vs four-term ETA identity display (plan change after reroute) | Engine doc §13 #1 | 7.x, 11.4 |
| O-4 | NEW_WINDOW: also extend receiving hours? (schema field) | Engine doc §13 #3 | 2.1, 9.x |
| O-5 | Overlap rules and "awaiting arrival confirmation" booking | Engine doc §13 #4–5 | 7.x, 8.x |
| O-6 | Activity feed source (audit filter vs new filter param) | UI plan §20 #1 | 11.x |
| O-7 | Icon library (`lucide-react` vs inline SVG); UI dependency set; self-hosted Inter | UI plan §20 #4–6 | 1.x, 10.x |
| O-8 | Table simplification S-1 (order/shipment items as JSON) | Schema §2.3 | 2.1 (only if behind at hour 5) |
| O-9 | G-CO2: verified emissions factor | Spec §11 | 9.6 |
| O-10 | G-LANG: verified second language | Spec §11 | 13.x, 12.x |

---

## 1. Project setup

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 1.1 | npm workspaces: `apps/web`, `apps/api`, `packages/shared`; strict `tsconfig` | Dev A | Approval to start | Not Started | N/A |
| 1.2 | Root scripts: `dev`, `build`, `typecheck`, `test`, `demo`, `seed`, `reset` | Dev A | 1.1 | Not Started | N/A |
| 1.3 | Docker Compose for PostgreSQL; `.env.example` (`SESSION_SECRET`, `DEMO_MODE`, DB URL) | Dev A | 1.1 | Not Started | N/A |
| 1.4 | Vite + React app shell; dev proxy for `/api`, `/tiles`, `/glyphs` | Dev B | 1.1 | Not Started | N/A |
| 1.5 | Express v5 app: helmet, JSON-only + 100 kB limit, requestId, error middleware | Dev A | 1.1 | Not Started | Not tested |
| 1.6 | Vitest set-up for all workspaces; test DB `routepulse_test` | Dev A | 1.3 | Not Started | N/A |
| 1.7 | `packages/shared`: enums mirror, P0 API types, fixtures (`satisfies`) | Both | 1.1 | Not Started | Not tested |
| 1.8 | Design tokens (`tokens.css`), Tailwind theme, self-hosted Inter | Dev B | 1.4, O-7 | Not Started | N/A |
| 1.9 | `.gitignore` covers `.env`, build output, `node_modules`, map assets if large (developers apply) | Dev A | 1.1 | Not Started | N/A |

## 2. Database and Prisma

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 2.1 | `schema.prisma` (20 models, enums) per schema doc v0.2 | Dev A | 1.3, O-1, O-4 | Not Started | N/A |
| 2.2 | Initial migration + raw SQL CHECKs and partial unique indexes | Dev A | 2.1 | Not Started | Not tested |
| 2.3 | Json column types + hand-written guards (`guards/`) | Dev A | 2.1 | Not Started | Not tested |
| 2.4 | Enum drift check (`contract-checks.ts`) + CT-1 test | Dev A | 1.7, 2.1 | Not Started | Not tested |

## 3. Authentication and authorisation

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 3.1 | Login / logout / me (#1–#3), bcrypt, JWT cookie, in-memory login rate limit | Dev A | 2.2 | Not Started | Not tested |
| 3.2 | `requireRole`, `scopeForUser`, 404-for-out-of-scope | Dev A | 3.1 | Not Started | Not tested |
| 3.3 | Validation helpers (`validation/`) + CT-2 | Dev A | 1.5 | Not Started | Not tested |
| 3.4 | Login page, role guard, three route trees (UI plan §3, §5) | Dev B | 1.8, 3.1 | Not Started | Not tested |
| 3.5 | AZ-1 … AZ-8 integration tests | Dev A | 3.2, 5.x | Not Started | Not tested |

## 4. Seed data

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 4.1 | Route geometry: one-time open routing export → GeoJSON; segments by hand (D5) | Dev A | — | Not Started | N/A |
| 4.2 | Reference data: customers, lanes, routes, transporters, trucks, users (incl. second driver, D3) | Dev A | 2.2, 4.1 | Not Started | Not tested |
| 4.3 | Deterministic 60-day history (~200 shipments) with attribution matching designed paces | Dev A | 4.2 | Not Started | Not tested |
| 4.4 | Live shipments + hero SHP-1042 + hero pre-script | Dev A | 4.2, 6.x, O-2 | Not Started | Not tested |
| 4.5 | Facts/assumptions file listing every seeded value and config value | Dev A | 4.3 | Not Started | N/A |

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
| 6.5 | Reset (#6) ≤ 5 s | Dev A | 4.4, 6.1 | Not Started | Not tested |
| 6.6 | Disruptions (#7–#9) with impact summary | Dev A | 6.2, 7.x | Not Started | Not tested |
| 6.7 | Reproducibility tests R1–R8 | Dev A | 6.2–6.5 | Not Started | Not tested |

## 7. ETA and risk engines

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 7.1 | `projectEta` (gate, transit pieces, closures, stops, WIN) | Dev A | 6.2, O-3, O-5 | Not Started | Not tested |
| 7.2 | Identity + largest-remainder rounding (ET-1, ET-2, ET-3) | Dev A | 7.1 | Not Started | Not tested |
| 7.3 | HIST pace from history + proration (ET-6) | Dev A | 4.3, 7.1 | Not Started | Not tested |
| 7.4 | Risk level, score, range, confidence (RK-1…RK-3) | Dev A | 7.1 | Not Started | Not tested |
| 7.5 | Recalculation pipeline + snapshot rule; ETA endpoint (#18), rules (#20), replay (#19) | Dev A | 7.1, 7.4 | Not Started | Not tested |
| 7.6 | Worked examples 1–3 from the engine doc as unit tests | Dev A | 7.2 | Not Started | Not tested |

## 8. Delay attribution

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 8.1 | Ledger booking in settle (AT-1) incl. overlap rules | Dev A | 6.2, O-5 | Not Started | Not tested |
| 8.2 | WIN knock-on split (ET-7) | Dev A | 8.1 | Not Started | Not tested |
| 8.3 | Finalisation at arrival, GAP row, but-for rule (AT-2, AT-4) | Dev A | 8.1, O-1 | Not Started | Not tested |
| 8.4 | Attribution endpoints (#34, #35) + overrides (AT-3) | Dev A | 8.3 | Not Started | Not tested |

## 9. Alerts and recovery

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 9.1 | Alert lifecycle + one-active index; notifications (#31–#33) | Dev A | 7.5 | Not Started | Not tested |
| 9.2 | Alerts (#26, #27) and customer response (#28) | Dev A | 9.1 | Not Started | Not tested |
| 9.3 | `generateOptions` (5 kinds), Suggested rule (RC-1, RC-2) | Dev A | 7.1 | Not Started | Not tested |
| 9.4 | Choose (#30) incl. hand-over (D3), staleness 409 (RC-4, RC-5, AZ-9) | Dev A | 9.3 | Not Started | Not tested |
| 9.5 | Driver reports: classify (#22), create (#23), queue (#24), review (#25) (CL-1) | Dev A | 7.5 | Not Started | Not tested |
| 9.6 | CO₂e on options — only if G-CO2 passes (RC-3 must pass either way) | Dev A | O-9 | Not Started | Not tested |

## 10. Map

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 10.1 | One-hour offline tiles spike (architecture §16.2) — record PASS/FAIL | Dev B | 1.4 | Not Started | N/A |
| 10.2 | Basemap (PMTiles) or GeoJSON fallback; CSP check | Dev B | 10.1 | Not Started | Not tested |
| 10.3 | Layers, HTML truck/site markers, legend, selection sync | Dev B | 10.2, 5.3 | Not Started | Not tested |
| 10.4 | Marker interpolation, reduced-motion behaviour | Dev B | 10.3 | Not Started | Not tested |

## 11. Coordinator screens

| ID | Task | Owner | Depends on | Status | Test status |
|---|---|---|---|---|---|
| 11.1 | Control tower layout, KPI strip, shipment list (UI plan §6) | Dev B | 3.4, 5.1, 10.3 | Not Started | Not tested |
| 11.2 | Alerts tab and activity feed | Dev B | 9.2, O-6 | Not Started | Not tested |
| 11.3 | Quick panel + shipment detail page (UI plan §6.5, §7) | Dev B | 7.5 | Not Started | Not tested |
| 11.4 | ETA waterfall + factor list | Dev B | 7.5, O-3 | Not Started | Not tested |
| 11.5 | Recovery cards, confirm/new-window dialogs, stale/conflict states (UI plan §9) | Dev B | 9.4 | Not Started | Not tested |
| 11.6 | Replay page (UI plan §10) | Dev B | 7.5 | Not Started | Not tested |
| 11.7 | Simulation dock + page; reset dialog | Dev B | 6.4–6.6 | Not Started | Not tested |
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
| 14.1 | `analyticsService` + dashboard endpoint (#36); AZ-10 | Dev A | 8.3, O-1 | Not Started | Not tested |
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
