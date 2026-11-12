# Changelog

All notable changes to this repository are recorded here. Format based on Keep a Changelog. Dates are in YYYY-MM-DD.

No application code has been written yet. Entries below describe documentation only.

## [Unreleased]

### Added
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
