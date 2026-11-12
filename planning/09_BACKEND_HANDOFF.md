# 09 — Backend handoff for the frontend

Living document maintained by the backend (branch `backend`). It lists **only what is implemented and tested**. The full target contract is `06_API_SPEC.md`; types live in `packages/shared`.

Last updated: 2026-11-12 — **Milestone 2 (schema + deterministic seed)**.

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
| `SimStateDto`, `SyncResponse` | #4 `GET /api/sync`, #5, #6 | Shape is final per API spec; endpoint arrives in Milestone 4 |

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

Login endpoints arrive in Milestone 3. Live shipments have **no ETA/risk yet** (`etaAt`, `riskLevel` are null) until the simulation and engine milestones; build empty/"calculating" states for that.

## 6. Polling and freshness (planned behaviour, API §15)

- Poll `GET /api/sync` every 1 s; refetch affected queries when `worldVersion` changes. Not yet implemented.

## 7. Known incomplete functionality

Everything except `/api/health` — auth, shipments, simulation, ETA, alerts, recovery, analytics — is not yet implemented. The database and seed exist (Milestone 2). Next: Milestone 3 (auth), after approval.

## 8. Contract change log

| Date | Change | Breaking? |
|---|---|---|
| 2026-11-12 | Initial publish: enums, base types, `HealthResponse`, `SimStateDto`, `SyncResponse` | — |
| 2026-11-12 | Added `Segment`, `GeoJSONLineString`, `GeometrySource`, `PLANT`, `DISPLAY_TIME_ZONE`, `RISK_THRESHOLDS`, `SMALL_FLEET_MAX` | No |
