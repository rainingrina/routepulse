# RoutePulse — development and testing guide

How to install, run and test RoutePulse locally. Every command below exists in the repository's `package.json` files and was executed on 2026-11-12 on macOS (Apple silicon) unless marked **not verified**. The typecheck, test, Prisma-generate and web-build commands in §D were also re-verified on Windows 11 with PowerShell 5.1. All data is fictional (Plant X).

---

## A. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.19 (`engines` in `package.json`); verified with **25.9.0** | Uses `process.loadEnvFile` and `--env-file` |
| npm | Verified with **11.12.1** | npm workspaces: `apps/api`, `apps/web`, `packages/shared` |
| PostgreSQL | **17** (verified with Homebrew PostgreSQL 17.10) | Two databases: `routepulse_dev` and `routepulse_test` |
| Docker (optional) | Any recent Docker Desktop | Base Compose file runs PostgreSQL; the local override runs the built API and web images. Stack verified 2026-11-12 on Windows |

No other services are needed: no Redis, no external APIs, no map tiles at runtime.

## B. Initial setup

From the repository root:

```bash
npm install                                   # or `npm ci` for an exact install from package-lock.json
cp apps/api/.env.example apps/api/.env        # only if apps/api/.env does not exist yet — never overwrite it
```

Edit `apps/api/.env` (it is gitignored; never commit it):

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Development database, e.g. `postgresql://<your-os-username>@localhost:5432/routepulse_dev` (Homebrew, peer auth — include the username, see §E P1010) or `postgresql://routepulse:routepulse@localhost:5432/routepulse_dev` (Docker Compose; that role exists only in the Compose container) |
| `TEST_DATABASE_URL` | for tests | A **different** database whose name contains `test` (the test runner refuses anything else), e.g. `…/routepulse_test` |
| `SESSION_SECRET` | yes | ≥ 32 random characters: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_DEMO_PASSWORD` | for seed and reset | ≥ 12 characters; the shared password of all fictional demo accounts. Choose your own; it is never printed or committed |
| `DEMO_MODE` | yes | `true` enables the simulation clock and reset endpoints (coordinator only) |
| `PORT` | no (default 4000) | API port. The web dev server proxies to `http://localhost:4000`, so keep 4000 unless you also change `apps/web/vite.config.ts` |
| `NODE_ENV` | no | `development` · `test` · `production` (`production` makes the session cookie `Secure`) |
| `LOG_LEVEL` | no | `info` · `silent` |

Create the databases (local PostgreSQL):

```bash
createdb routepulse_dev
createdb routepulse_test
```

With Docker instead: `docker compose up -d` starts `postgres:17` on port 5432 with user/password `routepulse` and creates both databases (`docker/postgres-init.sql`). The optional local override (`docker compose -f docker-compose.yml -f docker-compose.local.yml up -d`) runs locally built `routepulse-api:local` and `routepulse-web:local` images on `127.0.0.1:4001` and `127.0.0.1:8081`; it requires the external `lyb-hackathon_default` network. Docker startup does **not** run migrations or seed: on a fresh volume, run `npm run db:deploy -w @routepulse/api` and `npm run seed` once against the Compose database. Verified 2026-11-12 on Windows: all three RoutePulse containers healthy.

Database schema, client and demo data:

```bash
npm run db:generate                 # Prisma Client → apps/api/src/generated/prisma (gitignored); run after install and after schema changes
npm run db:deploy -w @routepulse/api   # apply all migrations to DATABASE_URL (non-interactive)
npm run seed                        # deterministic fictional data; clock left at Thu 2026-11-19 08:00 IST, paused (~0.5 s)
```

`npm run db:migrate` (`prisma migrate dev`) is for developers who change `apps/api/prisma/schema.prisma`; it can prompt and create new migrations. Use `db:deploy` just to apply existing ones. The test database is migrated automatically by the test runner.

## C. Starting the application

Two terminals, from the repository root:

```bash
npm run dev:api     # API on http://localhost:4000 (tsx watch, reads apps/api/.env)
npm run dev:web     # Web app on http://localhost:5173 (Vite; proxies /api, /tiles, /glyphs to :4000)
```

Open **http://localhost:5173**. The browser only talks to `:5173`; the proxy keeps the API same-origin, which the session cookie (`rp_session`, httpOnly, SameSite=Lax) and the CSP (`connect-src 'self'`) require.

Put the demo world at its start (Thu 10:25, hero SHP-1042 in transit): sign in as the coordinator and use **Reset demo** in the simulation dock, or call `POST /api/sim/reset` with `{ "confirm": true }`.

Demo accounts (password = your `SEED_DEMO_PASSWORD`):

| Email | Role | Home |
|---|---|---|
| `coordinator@plantx.test` (Meera) | Coordinator | `/control-tower` |
| `buyer@kestrel.test` (Arjun) | Customer (Kestrel Moulders) | `/orders` |
| `driver.ramesh@ghatline.test` | Driver (hero SHP-1042) | `/trip` |
| `driver.suresh@ghatline.test` | Driver (replacement truck TRK-11) | `/trip` |

More accounts: `planning/10_SEED_DATA.md` §2 and `planning/09_BACKEND_HANDOFF.md` §5a.

**Current integration status (2026-11-12, Combined Milestone 1).** The API implements #1–#11, #14–#16, #18, #20, #22–#28, #31–#35, #37, #38. With the real API the coordinator can use the control tower (KPIs, risk-sorted list, map with positions, alerts, activity, notifications), the shipment detail page (ETA four terms, factors, attribution, activity) and the Simulation page (inject/end disruptions). **M8:** recovery options (#29) and choose (#30) are live in the quick panel, alerts and shipment detail. Not built yet: the dashboard (#36; its two KPI cards say "Unavailable"), orders (#12/#13), milestone taps over HTTP (#17), replay (#19), driver trip (#21), and the customer and driver screens ("Not built yet" pages). To see the complete scripted UI without the API, run the **development mock**:

```bash
npm run dev:web:mock    # http://localhost:5173, in-browser fictional fixtures, any password; banner says "mock"
```

The mock is excluded from production builds.

**One-command start:** the base `docker compose up -d` starts PostgreSQL only. With locally built images and the external network, `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` also starts the API and web app; migrations and seeding remain manual prerequisites. For development, the two commands above remain the default.

**Production build of the web app:** `npm run build:web` → `apps/web/dist`. The API does not serve the built SPA yet; use `npm run preview -w @routepulse/web` (Vite preview, **no API proxy**) only to inspect the build.

## D. Testing

| Command (repo root) | What it tests | PostgreSQL | Seed needed | Changes data | Success looks like |
|---|---|---|---|---|---|
| `npm run typecheck` | `tsc` for `packages/shared`, `apps/api`, `apps/web` (strict) | no | no | no | three `tsc -p tsconfig.json` runs with no errors |
| `npm test` | typecheck, then **all API tests**, then **all web tests** | yes (`TEST_DATABASE_URL`) | no (tests reseed the test DB themselves) | only the **test** database | `Tests 359 passed (359)` (API) and `Tests 121 passed (121)` (web) |
| `npm test -w @routepulse/api` | API unit + integration tests (Vitest; files run one at a time; 30 s per-test timeout) | yes | no | test DB only | `Test Files 24 passed (24)` · `Tests 359 passed (359)` |
| `npx vitest run tests/unit` (in `apps/api`) | API pure-engine unit tests only (simulation, ETA, risk, attribution, recovery, analytics, classifier, validation, session) | the global setup still migrates the test DB, so it must be reachable | no | test DB migrations only | `Test Files 12 passed (12)` · `Tests 154 passed (154)` |
| `npx vitest run tests/integration` (in `apps/api`) | Real Express app on an ephemeral port + real test DB: auth, scoping, simulation, ETA, attribution, shipments/map/audit, disruptions, alerts and notifications, recovery, portals (orders, milestone taps, replay/G6, driver trip), analytics (#36), reproducibility (R1–R8), golden checkpoints | yes | no (each file resets) | test DB | `Test Files 12 passed (12)` · `Tests 205 passed (205)` |
| `npm test -w @routepulse/web` | Web unit + component tests (API client, retry/session rules, role guard, formatting, badges, filters, mock fixture identities; control tower, shipment detail, simulation page, notifications, recovery, customer orders/order detail/notifications, driver trip/report, report queue, replay and the dashboard rendered from **real API responses** in `apps/web/src/test/fixtures/api-11-20.json`) | no | no | no | `Test Files 10 passed (10)` · `Tests 121 passed (121)` |
| `npm run typecheck -w @routepulse/web` | Web types only | no | no | no | no output after the `tsc` line |
| `cd apps/api && npx prisma validate` | Prisma schema validity | no | no | no | `The schema at prisma/schema.prisma is valid` |
| `npm run build:web` | Web typecheck + production bundle | no | no | writes `apps/web/dist` | `✓ built in …` (a "chunks larger than 500 kB" warning is currently expected) |

Not automated yet: browser end-to-end tests (the Combined Milestone 1 browser walkthrough was run manually with Playwright; see PROGRESS 15.4 notes). The golden hero test (architecture §20.3) G0–G8 runs inside the API integration suite (G6 replay since M9).

**Override variables without editing `.env`:** values already set in the shell win over `apps/api/.env` (Node `--env-file` / `process.loadEnvFile` do not override), e.g.
`DATABASE_URL=postgresql://$USER@localhost:5432/routepulse_dev TEST_DATABASE_URL=postgresql://$USER@localhost:5432/routepulse_test npm test`.

**Fixture refresh:** `apps/web/src/test/fixtures/api-11-20.json` holds real API responses (reset → 10:30 rain → 11:10 report → 11:20; the M9 keys continue → 11:25 replacement truck chosen → report confirmed → 18:05 arrival tapped). Regenerate it from the running API if the contract changes.

Test database safety: `apps/api/vitest.config.ts` refuses to run if `TEST_DATABASE_URL` is missing or equals `DATABASE_URL`, and the global setup refuses a database whose URL does not contain `test`.

Cross-platform bootstrap: Vitest pins its root to `apps/api` and loads `.env` from that directory. The global setup parses `TEST_DATABASE_URL`, prints the target database and host, then runs the installed Prisma CLI through `process.execPath` (`node_modules/prisma/build/index.js`), which works on Windows and Linux.

## E. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Invalid environment configuration:` followed by a list of variables when starting the API | `apps/api/.env` missing or incomplete — copy `.env.example` and fill every required variable (§B) |
| `TEST_DATABASE_URL is not set` / `must differ from DATABASE_URL` / `Refusing to migrate a database that does not look like a test database` | Set a separate `routepulse_test` URL in `apps/api/.env` |
| `spawnSync ... node_modules\.bin\prisma ENOENT` | The old bootstrap used the Unix Prisma wrapper. The current setup invokes Prisma through Node; run `npm install`, then `npm run db:generate` and `npm test` again |
| `No test files found` | Run commands from the repository root or through the workspace scripts. Vitest's root is pinned to `apps/api`; confirm `apps/api/tests/**/*.test.ts` exists |
| `P1010: User was denied access on the database` (tests or migrations) | The URL's user does not exist on this server — typically the Docker Compose user `routepulse` used against a local Homebrew PostgreSQL. Use `postgresql://<your-os-username>@localhost:5432/…` (the username is required for Prisma), or start Docker Compose |
| `ECONNREFUSED 127.0.0.1:5432`, `P1001` | PostgreSQL not running: `brew services start postgresql@17` (Homebrew) or `docker compose up -d`; check with `pg_isready` |
| `database "routepulse_dev" does not exist` | `createdb routepulse_dev` (and `routepulse_test`) |
| Prisma: "Cannot find module …/generated/prisma" | Run `npm run db:generate` |
| Prisma: migrations not applied / missing tables | `npm run db:deploy -w @routepulse/api`; the test DB is migrated automatically by `npm test` |
| `prisma migrate reset` refuses to run | Prisma blocks destructive resets from automated tools; reset manually only if you mean to wipe the dev DB. `npm run seed` already truncates and reseeds business data |
| Times look 5 h 30 min off | The API forces the DB session to UTC (`-c TimeZone=UTC`); display is Asia/Kolkata in the UI. Do not change the DB time zone setting |
| `EADDRINUSE :4000` or `:5173` | Another process holds the port: `lsof -i :4000`; stop it, or run a second pair on other ports: `PORT=4100 npm run dev:api` and `ROUTEPULSE_API_ORIGIN=http://localhost:4100 npx vite --port 5175` (in `apps/web`). Vite silently moves to 5174 if 5173 is taken — check which API it proxies to |
| Map area blank (fixed 2026-11-12) | The map region collapsed to 0 px height (conflicting position classes). Fixed in `apps/web/src/map/MapView.tsx`; hard-refresh (Cmd/Ctrl + Shift + R). The map has no street/terrain basemap yet (O-11): routes, sites and trucks on a land-colour background are expected |
| Login works but every call returns 401 | The browser must use http://localhost:5173 (same origin through the proxy). Calling `:4000` directly from the SPA would not carry the cookie. In production (`NODE_ENV=production`) the cookie is `Secure` and needs HTTPS |
| `Email or password is incorrect.` | The password is your `SEED_DEMO_PASSWORD` at the time you seeded; re-run `npm run seed` after changing it |
| `429 RATE_LIMITED` on login | 10 attempts per minute per IP; wait a minute |
| `403 DEMO_MODE_OFF` on clock/reset | Set `DEMO_MODE="true"` and restart the API |
| `Reset is not configured: SEED_DEMO_PASSWORD is missing` | Add `SEED_DEMO_PASSWORD` to `apps/api/.env` and restart the API |
| Web shows "Not built yet" or panels with errors | Expected for screens and endpoints not implemented yet (see §C status); use `npm run dev:web:mock` to view the scripted UI |
| Vite logs `http proxy error … ECONNREFUSED` | The API is not running (or not yet started); start `npm run dev:api` |
| CORS errors | Should not occur: there is no cross-origin call in development (Vite proxy). If you see one, you are calling the API on another origin |
| Simulation shows "Clock paused after a long gap" | The laptop slept while the clock was running; press Play again (long-gap guard) |
| Docker: "failed to connect to the docker API" | Start Docker Desktop; or use a local PostgreSQL instead |

## F. Verifying M8 (recovery) by hand

1. Start the API and web (§C), sign in as the coordinator, **Reset demo** (Thu 10:25).
2. Simulation page → Heavy rain on `KHP-LNV-GHAT`, 65 %, 480 min. SHP-1042 turns Watch; its quick panel shows **Reroute via RT-PUNE-B** as Suggested.
3. Advance to 11:10 (dock "+1 h" or `POST /api/sim/clock {"action":"ADVANCE_TO",…}`), sign in as `driver.ramesh@ghatline.test` in another browser profile and report "tyre puncture near Lonavala" (or `POST /api/shipments/shp_1042/driver-reports`). SHP-1042 turns At risk; the alert shows **Suggested: Replacement truck**; options: replacement TRK-11 17:35 ₹6,100, reroute disabled (stationary), new window until 19:30.
4. Advance to 11:25 → **View options** → choose the replacement truck → confirm. Expected: new estimate **17:50**, Watch, driver Ramesh → Suresh (TRK-11), customer notified; the alert stays **Action chosen**.
5. Advance past 17:50 and record ARRIVED as Suresh (or the coordinator via the service): the alert resolves at arrival; attribution shows GATE 40 / HIST 20 / DISR 120 / RPT 90.

## G. Verifying M9 (portals, replay, milestone taps) by hand

Use the test database or a dev database you may reset. Passwords are `SEED_DEMO_PASSWORD` from your `.env`.

1. **Customer** (`buyer@kestrel.test`): after the M8 steps 1–3 (rain 10:30, report 11:10) open `/orders`. Expected: "Your orders", red banner "Order ORD-7781 is at risk of missing Thu 18:00", "Vehicle breakdown on the route", "Proposed — Plant X team confirming: a replacement truck, new estimate 17:35." and three buttons. Press **Request a call** → "Thanks — Plant X will confirm shortly. Your response: Requested a call." Open ORD-7781: plain ETA card ("Rule-based estimate"), milestones without names, map, transporter name, no driver name, no party names.
2. **Driver** (`driver.ramesh@ghatline.test`, phone width 360 px): `/trip` shows SHP-1042, next step "Arrived at customer" with **Confirm arrival** disabled and "NN km to destination". **Report a problem** → type "heavy traffic jam near toll plaza" → "Suggested: Traffic jam — matched: traffic, jam. Is this right?" → **Yes** → **1 h** → **Send report** → "Plant X has been informed."
3. **Coordinator** `/reports`: the traffic report shows highlighted keywords; **Change reason / party** → preset "Other · Unattributed" + note → **Save review**; **Confirm** the breakdown; the Confirmed tab lists both with the reviewer.
4. Advance to 11:25 and choose the replacement truck (M8 step 4). **Suresh** (`driver.suresh@ghatline.test`) `/trip`: "Collect load from TRK-07 near Khopoli–Lonavala ghat — transfer until 12:40." **Ramesh**: "Load handed over to TRK-11 (Suresh) at 11:25. Your trip for SHP-1042 has ended." and "No trip assigned right now."
5. Coordinator → SHP-1042 → **Replay**: "First at risk 11:10 · 6 h 50 m before promise", read-only banner, chart with the dashed promise line and the red diamond at 11:10; ←/→ / Home / End move the slider; **Play replay** steps one snapshot per second (disabled with reduced motion).
6. Advance past 17:50 (e.g. 18:05): Suresh's next step reads "At Kestrel Moulders's gate — confirm arrival" → **Confirm arrival** → confirm. The recorded arrival is the gate time (17:49), not 18:05. The next step becomes "Confirm unloading complete" (blocked until unloading finishes); repeating ARRIVED through the API returns 409 ALREADY_DONE "This milestone is already recorded."

## H. Verifying M10 (analytics dashboard) by hand

1. Reset the demo (coordinator) and follow M8 steps 1–3 (rain 10:30, report 11:10), then open **Dashboard**. Default **30 d**: the window line reads "Tue 11:20 – Thu 11:20 · by arrival at the receiving gate" (when the clock is at Thu 11:20). Seven KPI cards; hover On time / Median warning lead / Proactive notice / Recovered for the definition.
2. The Control Tower's **On-time (30 d)** and **Median warning lead** cards show the same two numbers as the dashboard's 30 d view (no longer "Unavailable").
3. Choose **Lane → Plant X → Pune** and **60 d**: the URL becomes `?laneId=lane_pune&period=60d` and every card and chart changes together. Switch any chart card to **Table** to read the values.
4. In the transporter table select a transporter: the dialog lists exactly "Arrived" shipments for that transporter, lane and window; count the on-time rows — the share equals "Raw on-time". "Gap" = fair − raw; small fleets (≤ 10 trucks) carry a "Small fleet" chip.
5. Pick a lane / transporter / 7 d combination with no arrivals: "No deliveries match these filters" with **Clear filters**.
6. Live arrival (AC-M5.7): continue the hero run (M8 step 4, then arrival) and refresh the dashboard: the 7 d view for Pune / Ghatline counts one more arrival, on time.
7. Customer or driver accounts cannot open `/dashboard` (role guard) and `GET /api/analytics/dashboard` returns 403 for them.

