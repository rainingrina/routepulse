# 09 — Backend handoff for the frontend

Living document maintained by the backend (branch `backend`). It lists **only what is implemented and tested**. The full target contract is `06_API_SPEC.md`; types live in `packages/shared`.

Last updated: 2026-11-12 — **Milestone 4 (deterministic simulation)**.

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
- **What moves:** shipment progress and milestones change on 5-minute simulation steps; between steps nothing is written. Positions/ETA endpoints are not implemented yet (positions #11 in a later milestone; ETA in Milestone 5).
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

Log in with these accounts through `/api/auth/login` (Milestone 3). Live shipments have **no ETA/risk yet** (`etaAt`, `riskLevel` are null) until the simulation and engine milestones; build empty/"calculating" states for that.

## 6. Polling and freshness (planned behaviour, API §15)

- Poll `GET /api/sync` every 1 s; refetch affected queries when `worldVersion` changes. Not yet implemented.

## 7. Known incomplete functionality

Implemented: `/api/health`, authentication (#1–#3) and the simulation clock (#4–#6). Not yet implemented: shipments, orders, map layers and positions, disruptions endpoints, ETA, alerts, recovery, notifications, analytics. Live shipments still have no ETA/risk (null) until Milestone 5. Next: Milestone 5 (ETA and risk), after approval.

## 8. Contract change log

| Date | Change | Breaking? |
|---|---|---|
| 2026-11-12 | Initial publish: enums, base types, `HealthResponse`, `SimStateDto`, `SyncResponse` | — |
| 2026-11-12 | Added `Segment`, `GeoJSONLineString`, `GeometrySource`, `PLANT`, `DISPLAY_TIME_ZONE`, `RISK_THRESHOLDS`, `SMALL_FLEET_MAX` | No |
| 2026-11-12 | Added `SimClockRequest`, `SimClockResponse`, `SimResetRequest`, `SimResetResponse` (as specified in API §5); #4–#6 implemented | No |
| 2026-11-12 | Added `UserDto`, `HomePath`, `LoginRequest`, `LoginResponse`, `MeResponse`, `SESSION_COOKIE_NAME` (already specified in API §2.2/§4; now published). Unauthenticated calls to unknown `/api` paths now return 401 instead of 404 | No (new types); behaviour change for unknown paths only |
