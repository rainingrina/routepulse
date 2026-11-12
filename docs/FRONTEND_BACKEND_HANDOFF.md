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
| 36 | `GET /api/analytics/dashboard?period=30d` | KPI "On-time (30 d)", "Median warning lead" | `['dashboard', filters]` |
| 37 | `GET /api/audit?limit=50` | Activity feed (L7) | `['audit', filters]` |

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
| Q8 | Basemap | `pmtiles` is not approved (O-11). The map currently draws a land-colour background only, plus API layers. The GeoJSON fallback basemap (architecture §16.3) needs a data file — who provides it, and where? | Open (task 10.1/10.2) |
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
| §2.4 Inter self-hosted | System font fallback | Font files not added yet (Q5) |
| §8.1 basemap (tiles or GeoJSON) | Land colour only | Basemap data pending (Q8) |
| §8.3 marker interpolation over 1 s | Markers jump to each new position | Task 10.4 not started |
| §6.6 toast "SHP-1042 is at risk — View options" | One-time row highlight + `aria-live` announcement; no toast component yet | Kept the dependency set minimal; toast to follow |
| §6.4 dock "Advance to…" time picker | Not in the dock yet ("+1 h" is) | Simulation page is Phase 5 |
| §7 Shipment detail, §10 replay, §11 customer, §12 driver, §13 dashboard, §14 reports/simulation pages | Routes exist and show an honest "Not built yet" screen | Later phases |

## 8. Change log

| Date | Change |
|---|---|
| 2026-11-12 | Merged backend Milestones 2–3: auth and geometry types now imported from `@routepulse/shared`. |
| 2026-11-12 | Created. Phases 1–2: client, services, sync, layouts, role guard, login, control tower, map, alerts, activity, quick panel, recovery cards and choose flow. |
