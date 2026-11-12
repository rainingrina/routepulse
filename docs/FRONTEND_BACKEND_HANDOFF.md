# Frontend ↔ backend handoff — RoutePulse

Living document maintained by the frontend (Dev B, branch `frontend`). Counterpart of `planning/09_BACKEND_HANDOFF.md` (Dev A).
It records what the web app calls, what it assumes, and what it needs from the backend. The contract itself is `planning/06_API_SPEC.md` v0.3.

Last updated: 2026-11-12 — **frontend Phases 1–2** (foundation + control tower).

---

## 1. Running the web app

The web app is the workspace package `@routepulse/web` (`apps/web`). The root `package.json` was **not** changed; run the web scripts with `-w`:

| Command (from the repo root) | What it does |
|---|---|
| `npm run dev -w @routepulse/web` | Vite on http://localhost:5173, proxying `/api`, `/tiles`, `/glyphs` to http://localhost:4000 (architecture §15) |
| `npm run dev:mock -w @routepulse/web` | Same app with the **in-browser development mock** instead of the API (§6) |
| `npm run typecheck -w @routepulse/web` | `tsc` on the web app |
| `npm test -w @routepulse/web` | Vitest unit tests (Node environment) |
| `npm run build -w @routepulse/web` | Typecheck + production build to `apps/web/dist` (contains no mock code) |

Request to Dev A: add `@routepulse/web` to the root `typecheck` and `test` scripts when convenient (I did not edit root configuration).

## 2. How the web app talks to the API

- One typed client, `apps/web/src/api/client.ts`: same-origin `/api`, `credentials: 'same-origin'`, `Content-Type: application/json` only when there is a body, error envelope → `ApiRequestError { kind, status, code, message, details, requestId }`.
- One service interface, `apps/web/src/api/services/types.ts` (`RoutePulseApi`): one method per endpoint #1–#38. `http.ts` implements it against the real API; `mocks/mockApi.ts` implements it for `--mode mock`. Components only use TanStack Query hooks in `api/hooks/`.
- Freshness (architecture §5.2, API §15): `GET /api/sync` every 1 s inside every signed-in layout; when `worldVersion` changes, every world-state query is invalidated (everything except `me`, `sync`, `rules`). `GET /api/tracking/positions` is polled every 1 s only while `running`.
- Retries (architecture §13): GET retried twice, never on 4xx; mutations never retried.
- Reconnecting banner after 3 consecutive failed `/api/sync` polls.

## 3. Contract types — what is imported, what is pending

Imported from `@routepulse/shared` (published by Dev A): all enum lists/unions, `Id`, `ISODateTime`, `Minutes`, `Pct`, `ApiError`, `ErrorCode`, `ERROR_CODES`, `ValidationIssue`, `ListResponse`, `SimStateDto`, `SyncResponse`, and since backend Milestones 2–3: `UserDto`, `HomePath`, `LoginRequest`, `LoginResponse`, `MeResponse`, `Segment`, `GeoJSONLineString` (removed from `pending.ts`; shapes were identical).

**Pending (not yet in `packages/shared`):** every other DTO in API §2.2 and §4–§14a is transcribed verbatim into `apps/web/src/api/contract/pending.ts`, because the frontend may not edit `packages/shared` alone and `09_BACKEND_HANDOFF.md` asks not to copy DTOs. This is a deliberate, temporary exception:
- Nothing imports `pending.ts` directly; all code imports from `api/contract/index.ts`.
- When a type is published in `@routepulse/shared`, delete it from `pending.ts` and re-export it from `index.ts`; `tsc` shows any drift.
- **Request to Dev A:** publish the DTOs in `packages/shared/src/api/` (you may move `pending.ts` as a starting point). Names I gave to shapes that are inline in the spec — rename freely, I will follow yours:
  `PositionItem`, `OrderDetail`, `OrderListQuery`, `SimClockResponse`, `SimResetResponse`, `ReplaySnapshot`, `DriverTripResponse`, `ClassifyRequest`, `ReviewDriverReportResponse`, `CustomerResponseRequest`, `NotificationsResponse`, `AttributionOverrideRequest`, `AuditItem`, `AuditQuery`.

**Update 2026-11-12 (Phase Zero integration):** published in `@routepulse/shared` and removed from `pending.ts`: `SimClockRequest`, `SimClockResponse`, `SimResetResponse` (M4); `Factor`, `PartyMinutes`, `EtaExplanationCoordinator`, `EtaSummaryCustomer`, `EngineRulesResponse` (M5); `DriverReportDto`, `DriverTripShipment`, `DriverHandover`, `ClassifyRequest`, `ClassifyResponse`, `CreateDriverReportRequest` (reasons narrowed to `DriverReasonCode`), `CreateDriverReportResponse`, `ReviewDriverReportRequest`, `ReviewDriverReportResponse`, `AttributionRowDto`, `AttributionResponse`, `AttributionOverrideRequest` (M6). The root `typecheck` and `test` scripts now include the web app (request §1 done); `npm run dev:web`, `dev:web:mock`, `build:web` exist at the root.

**Update 2026-11-12 (Combined Milestone 1):** the control tower, quick panel, alerts, activity feed, notification bell, map and simulation dock now run on the real API. New: shipment detail page (`/shipments/:id`), Simulation page (`/simulation`). Moved to `@routepulse/shared`: every shipments/alerts/notifications/disruptions/map/audit/reference DTO. Still in `pending.ts`: orders, milestone record, replay, driver trip response, recovery options/choose, dashboard. Answers to §5: Q1 confirmed (backend behaves so); Q2 confirmed — `data` keys `milestone`, `reason`, `label`, `response`, `shipmentCode` are written; Q4 confirmed (`worker-src 'self' blob:`); Q6 confirmed (`live` includes ARRIVED). Fixed: the map region collapsed to 0 px (MapView). `RECOVERY_AVAILABLE` (features/recovery/availability.ts) hides recovery actions until #29/#30 exist.

**Update 2026-11-12 (M8):** recovery is live on the real API — `RECOVERY_AVAILABLE` is `true`; #29/#30 and their types come from `@routepulse/shared` (removed from `pending.ts`). The confirm dialog notes that the estimate is recalculated at the decision minute. Still in `pending.ts`: orders, milestone record, replay, driver trip response, dashboard.

**Update 2026-11-12 (M9):** `OrderSummary`, `OrderDetail`, `OrderListQuery`, `RecordMilestoneRequest/Response`, `ReplaySnapshot`, `ReplayResponse`, `DriverTripResponse` now come from `@routepulse/shared` (removed from `pending.ts`); only the dashboard DTOs (#36, M10) remain pending. New screens on the real API: customer `/orders`, `/orders/:id`, `/notifications`; driver `/trip`, `/trip/report`; coordinator `/shipments/:id/replay` and `/reports`. New hooks in `api/hooks/portal.ts`; `map/MiniMap.tsx` for small maps (legend starts collapsed); `NotificationList` takes `linkFor`. #13 is consumed unwrapped (API §7.2). The in-browser mock still answers #17/#19 with "not available in mock mode" (development only).

**Update 2026-11-12 (M10):** `DashboardQuery`/`DashboardResponse` come from `@routepulse/shared`; `api/contract/pending.ts` is deleted — every API type is now published. `/dashboard` is built on the real #36 (filters in the URL, Chart/Table toggles, drill-down via #14), the planned-screen placeholder component is removed, and the Control Tower's #36 cards show real values from the same cached `['dashboard', {period: '30d'}]` query. The in-browser mock still answers #36 with "not available in mock mode" (development only).

## 4. Endpoints the frontend calls today

| # | Endpoint | Used by | Query key |
|---|---|---|---|
| 1 | `POST /api/auth/login` | Login page | — (sets `me`) |
| 2 | `POST /api/auth/logout` | User menu | — (clears cache) |
| 3 | `GET /api/auth/me` | Role guard, `/`, login redirect | `['me']` |
| 4 | `GET /api/sync` | All signed-in layouts (1 s) | `['sync']` |
| 5 | `POST /api/sim/clock` | Top-bar clock, simulation dock (PLAY, PAUSE, SET_SPEED, ADVANCE 60) | — |
| 6 | `POST /api/sim/reset` | Simulation dock "Reset demo" (confirm dialog) | — |
| 10 | `GET /api/map/layers` | Control-tower map | `['mapLayers']` |
| 11 | `GET /api/tracking/positions` | Control-tower map | `['positions']` |
| 14 | `GET /api/shipments?status=live&sort=risk` | KPI strip, shipment list | `['shipments', filters]` |
| 15 | `GET /api/shipments/:id` | Quick panel | `['shipment', id]` |
| 18 | `GET /api/shipments/:id/eta` | Quick panel (not called once `arrivedAt` is set) | `['eta', id]` |
| 24 | `GET /api/driver-reports?status=PENDING_REVIEW` | Nav badge, KPI | `['driverReports', filters]` |
| 26 | `GET /api/alerts?status=active` and `?status=RESOLVED&limit=5` | KPI, Alerts tab, recovery panel (`shipmentId`) | `['alerts', filters]` |
| 29 | `GET /api/shipments/:id/recovery-options` | Recovery panel | `['recoveryOptions', id]` |
| 30 | `POST …/recovery-options/:optionId/choose` | Confirm dialog (`optionSetId`, `confirm: true`, optional `note`) | — |
| 31–33 | Notifications list / read / read-all | Bell popover | `['notifications']` |
| 36 | `GET /api/analytics/dashboard?period=…&laneId=…&transporterId=…` | Dashboard page; Control Tower KPI "On-time (30 d)", "Median warning lead" (`period=30d`) | `['dashboard', filters]` |
| 37 | `GET /api/audit?limit=50` | Activity feed (L7) | `['audit', filters]` |
| 12 | `GET /api/orders?status=open|delivered` | Customer orders | `['orders', filters]` |
| 13 | `GET /api/orders/:id` | Customer order detail | `['order', id]` |
| 14 | `GET /api/shipments?status=live|delivered&sort=promise` / `status=all` | Customer order cards / notification links | `['shipments', filters]` |
| 17 | `POST /api/shipments/:id/milestones` | Driver next-step confirm | — (invalidates world state) |
| 19 | `GET /api/shipments/:id/replay` | Replay page | `['replay', id]` |
| 21 | `GET /api/driver/trip` | Driver trip, report page | `['trip']` |
| 22 | `POST /api/driver-reports/classify` | Report page (debounced 400 ms) | — |
| 23 | `POST /api/shipments/:id/driver-reports` | Report page Send | — |
| 25 | `POST /api/driver-reports/:id/review` | Report queue Confirm / Change | — |
| 28 | `POST /api/alerts/:id/customer-response` | Customer alert banner | — |

## 5. Assumptions and questions for Dev A

| # | Topic | Assumption / request | Status |
|---|---|---|---|
| Q1 | Auth | A 401 from `/api/auth/me` means "signed out" (not an error). A 401 from `/api/auth/login` means wrong credentials. Any other 401 means the session expired → redirect to `/login?session=expired`. | Please confirm |
| Q2 | Activity feed | `AuditItem.data` is untyped in API §14. The feed reads `data.shipmentCode`, `data.milestone`, `data.reason`, `data.label`, `data.response`, `data.kind` when present and otherwise shows a generic sentence. Please confirm the keys you write, or publish a typed `data` per action. | Open |
| Q3 | Map segments | Disruption segments are drawn by slicing the route line at `startKm/lengthKm … endKm/lengthKm` of its planar length. This is only right if the exported geometry is roughly km-proportional. Alternative: return segment geometry in #10. | Open |
| Q4 | CSP and MapLibre | The MapLibre worker is emitted as a same-origin module file (`/assets/maplibre-gl-worker-*.mjs`, set with `setWorkerUrl`), so no `blob:` worker is needed. Please make sure the helmet CSP allows same-origin workers (`worker-src 'self'`, or no `worker-src` so it falls back to `script-src 'self'`). | Please verify when serving the SPA |
| Q5 | Inter font | L9 approves self-hosted Inter; no font files are in the repo yet. Architecture §2.4 says the API serves them. Where should the woff2 files live (`apps/web/public/fonts` or the API)? Until then the system font fallback is used. | Open |
| Q6 | "Live" list | `status=live` is assumed to include ARRIVED-but-not-DELIVERED shipments (they show "Arrived 09:50 · unloading"). | Please confirm |
| Q7 | Customer notifications | `NotificationDto` has `shipmentId` but no `orderId`; the customer portal routes are `/orders/:id`. The customer UI will map shipment → order through `GET /api/orders`. | FYI (no change requested) |
| Q8 | Basemap | Resolved 2026-11-12 (O-11 approved): self-hosted western-India PMTiles at `/tiles` (`npm run basemap:fetch`), `pmtiles` protocol in `map/basemap.ts`; land-only fallback when the file is missing (architecture §16.5) | Resolved |
| Q9 | Recovery dialog | The "customer message preview" in the confirm dialog is built in the UI from the option fields and labelled as a preview; the sent text is the server template. | FYI |

## 6. Development mock (`--mode mock`)

- Code: `apps/web/src/mocks/` (`world.ts`, `shipments.ts`, `mockApi.ts`). Loaded only by `vite --mode mock` through a dynamic import; the production build contains none of it (checked by searching `dist/`).
- A banner on every screen says mock mode is active. Sign in as `coordinator@plantx.test`, `buyer@kestrel.test` or `driver.ramesh@ghatline.test` with any password.
- It follows **one scripted scenario** — hero SHP-1042 with the documented values from `08_ETA_AND_RISK_ENGINE.md` §10 Examples 2–3:
  1. start Thu 10:30, paused (the docs give exact hero values at 10:30, not at the L2 demo start 10:25);
  2. inject heavy rain on `PNQ-GHAT` → Watch, 16:20;
  3. driver reports a breakdown → At risk, Fri 08:00, alert + notifications (clock set to 11:10);
  4. customer responds (11:20);
  5. coordinator chooses Replacement truck → Watch, 17:50 (11:25).
- It does not simulate anything. Unscripted actions (other options, advancing the clock, replay, analytics, attribution, timeline, rules, classify, review) answer with an "unavailable in mock mode" error, shown as such in the UI — never invented data.
- Background shipments, customer and transporter names other than Kestrel Moulders and Ghatline Carriers, coordinates and route lines are **[mock]** placeholders marked in the source. `mocks/shipments.test.ts` checks that every fixture satisfies the four-term identity, slack, level and score rules.

## 7. Deviations from the UI plan (with reasons)

| UI plan | Current state | Reason |
|---|---|---|
| §2.4 Inter self-hosted | Done in the v2 redesign: Inter Variable bundled from `@fontsource-variable/inter@5.3.0` (same origin, offline) | — |
| §8.1 basemap: "major city names in text-muted" (tiled variant) | Built for the six lane cities (symbol layer, local glyphs at `/glyphs`, `--rp-text-muted` with a land halo) | Approved enhancement; other places unlabelled |
| §8.1 basemap layers | Adds main roads (white, `--rp-surface`) to land, water and state borders | Lets coordinators judge route position; no POIs |
| §8.3 marker interpolation over 1 s | Markers jump to each new position | Task 10.4 not started |
| §6.6 toast "SHP-1042 is at risk — View options" | One-time row highlight + `aria-live` announcement. A toast component now exists (v2, Radix Toast from `radix-ui`) but is used only for confirmed mutations | The at-risk toast was not part of the redesign scope (no new behaviour added) |
| §6.4 dock "Advance to…" time picker | Not in the dock yet ("+1 h" is) | Simulation page is Phase 5 |
| §13 drill-down "list via #14" | Opens in a dialog over the dashboard (same window and filters), rows link to the shipment page | Keeps the filter context |
| §13 "value labels on bars" for the 100 % stacked party chart | Minutes on hover and in the Table view; overall shares in the card's definition line | Labels on thin stacked segments overlap |
| §10 replay map | Shows the lane's routes and the snapshot position; it does not zoom to the route | Kept the shared map component unchanged |
| §10 event markers "on the x axis" | Focusable event chips under the scrubber (jump to the snapshot in force) | Recharts markers are not keyboard-focusable |
| §11.3 text from `templateKey` + `params` via i18n | Server `text` shown (plain words) | Only English is enabled (L10) |
| §14 attribution tab with overrides (#35) | Not built | Not in the M9 scope |

## 8. Change log

| Date | Change |
|---|---|
| 2026-11-12 | UI redesign v2 across the whole web app (tokens, graphite frame, component system, toasts on real success, breadcrumbs, map attribution moved to a custom bottom-left element). No API call, contract or role change. UI plan §2–§3 v0.3. |
| 2026-11-12 | Phase A completed: basemap file installed (zoom 0–12, 91 MiB), city-name labels, attribution top-left; verified in the browser incl. Wi-Fi off. |
| 2026-11-12 | Phase A: offline basemap (`pmtiles` protocol, same-origin `/tiles`), map locked to western India, land-only fallback. |
| 2026-11-12 | M10: dashboard page on the real #36; Control Tower #36 cards live; `pending.ts` removed. |
| 2026-11-12 | M9: customer portal, driver portal, replay page and driver-report queue on the real API; M9 DTOs imported from `@routepulse/shared`. |
| 2026-11-12 | Merged backend Milestones 2–3: auth and geometry types now imported from `@routepulse/shared`. |
| 2026-11-12 | Created. Phases 1–2: client, services, sync, layouts, role guard, login, control tower, map, alerts, activity, quick panel, recovery cards and choose flow. |
