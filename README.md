# RoutePulse

**An explainable shipment recovery and logistics control tower.**
Know it will be late hours before it is — know why, and fix it.

Built for the LYB Mumbai Hackathon 2026, Round 2, Problem Statement 3 (Order-to-Delivery Control Tower). All companies, people and data are **fictional**; "Plant X" is a fictional polymer producer.

> **Project status (2026-11-12): planning complete and decisions locked (L1–L10); backend Milestone 1 (foundation) implemented on branch `backend`; other features not yet implemented.** The commands below match the real `package.json` scripts. See `PROGRESS.md` for exact status.

---

## Problem

At Plant X, bulk polymer orders pass through planning, dispatch, transport and delivery, yet customers and sales teams often learn an order is late only after it already is (problem statement). Delays are reported by phone, their causes are unclear, and transporters can be scored for delays they did not cause.

## Solution

RoutePulse gives three roles one shared view:

| Role | What they get |
|---|---|
| **Logistics coordinator** (lead user) | A control tower that ranks live shipments by risk, explains each ETA factor by factor, raises alerts early, and offers recovery options compared on time and cost |
| **Customer** | Early, plain-language warnings about their own orders, the proposed fix, and a way to respond |
| **Transporter / driver** | A mobile screen to update milestones and report problems in seconds; delays they did not cause are not counted against them |

### Planned features
- Three separate roles with server-side access control.
- Interactive map with shipments, routes and status milestones.
- Rule-based ETA and delay risk with a factor-by-factor explanation (gate wait, transporter history, disruptions, driver reports, receiving window).
- Alerts to coordinator and customer with suggested recovery actions (reroute, split, replacement truck, new window, notify only).
- On-time and delay-cause dashboard by route and transporter, with fair attribution by party.
- Historical risk replay: when did the shipment first become at risk?
- Disruption simulator on a deterministic simulation clock.
- Driver problem reporting by typed input with reason confirmation.

None of these features is implemented yet; only the backend foundation (health check, error handling, database setup) exists.

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite single-page app) |
| Backend | Express v5 + TypeScript on Node.js |
| Database | PostgreSQL + Prisma (`schema.prisma` is the single source of truth) |
| Validation | Hand-written request validation (no schema-validation library) |
| Approved UI libraries (not installed yet) | Tailwind CSS, Radix UI, TanStack Query, React Router, Recharts, MapLibre GL JS, lucide-react; self-hosted Inter font |
| Tests | Vitest (unit, integration, golden scenario) |

## Architecture overview

```
Browser (React SPA)  ──JSON /api/*──▶  Express v5 API  ──Prisma──▶  PostgreSQL
                                      ├─ controllers (validate · authorise · DTOs)
                                      ├─ services (use cases, transactions)
                                      ├─ engines (pure, deterministic rules)
                                      └─ simulation runner (5-minute grid)
```
- One API process serves the API, the built SPA and local map assets from one origin; the demo runs without internet.
- The ETA is the estimated arrival at the customer's receiving gate, and it is rule-based: `ETA = Planned arrival + Incurred delay + Plan change + Expected future delay` (plan change is 0 unless the shipment was rerouted). It is not a trained model.
- On-time means arrived at the receiving gate by the agreed promise; delivery (unloading) may finish later.
- Details: `planning/04_TECH_ARCHITECTURE.md` (architecture), `planning/05_DATABASE_SCHEMA.md` (schema), `planning/06_API_SPEC.md` (API), `planning/08_ETA_AND_RISK_ENGINE.md` (rules).

---

## Getting started (backend — Milestone 1)

Only the backend foundation exists so far (branch `backend`). The web app is developed separately.

### Prerequisites
- Node.js ≥ 20.19 and npm.
- PostgreSQL 17: either `docker compose up -d` (uses `docker-compose.yml`, creates `routepulse_dev` and `routepulse_test`) or a local install with those two databases created (`createdb routepulse_dev`, `createdb routepulse_test`).

### Setup
```bash
npm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET (≥ 32 chars)
npm run db:migrate                       # apply migrations to DATABASE_URL
npm run dev:api                          # API on http://localhost:4000 — check GET /api/health
```

### Environment variables (`apps/api/.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection for the API and migrations |
| `TEST_DATABASE_URL` | Separate database for integration tests (must differ from `DATABASE_URL`) |
| `SESSION_SECRET` | Signs the session cookie; at least 32 characters |
| `DEMO_MODE` | `true` enables simulator, clock and reset endpoints (coordinator only) |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` · `test` · `production` |
| `LOG_LEVEL` | `info` · `silent` |

### Scripts (root)
| Script | What it does |
|---|---|
| `npm run dev:api` | Start the API with reload |
| `npm run typecheck` | TypeScript checks for `packages/shared` and `apps/api` |
| `npm test` | Typecheck, then all API tests (migrates the test database first) |
| `npm run db:migrate` | `prisma migrate dev` on `DATABASE_URL` |
| `npm run db:generate` | Regenerate the Prisma client |

Planned for later milestones: `seed`, `reset`, `demo`, `build`. The frontend contract for implemented endpoints is in `planning/09_BACKEND_HANDOFF.md`.

## Getting started (web app — frontend Phases 1–2)

The web app is the workspace package `@routepulse/web` (`apps/web`, branch `frontend`). After `npm install` at the root:

| Script (from the repo root) | What it does |
|---|---|
| `npm run dev -w @routepulse/web` | Vite dev server on http://localhost:5173; proxies `/api`, `/tiles`, `/glyphs` to the API on :4000 |
| `npm run dev:mock -w @routepulse/web` | Same app with an in-browser **development mock** (fictional fixtures, scripted SHP-1042 scenario, no backend needed) |
| `npm run typecheck -w @routepulse/web` | TypeScript check of the web app |
| `npm test -w @routepulse/web` | Web unit tests (Vitest) |
| `npm run build -w @routepulse/web` | Typecheck + production build (no mock code included) |

Most API endpoints are not implemented yet, so screens beyond login only show data in mock mode. Frontend ↔ backend notes: `docs/FRONTEND_BACKEND_HANDOFF.md`.

---

## Demo

- Live demo on a single laptop, offline, with three Chrome cookie jars (coordinator, customer, driver).
- Reset prepares the demo at simulation time Thu 10:25, paused, by running the hero's morning through the real simulation engine.
- Hero scenario: shipment SHP-1042 from Plant X to a fictional converter in Pune — heavy rain on the ghat, a driver-reported breakdown, an early at-risk alert, a replacement-truck recovery, and a replay showing when the risk first appeared. Run-sheet: `planning/03_USER_JOURNEYS.md` §5.
- Impact indicators (computed from the app's own records on fictional data): warning lead time, proactive notice rate, recovered shipments, fair-score correction (spec §7).

## Known limitations

- Not implemented yet (see `PROGRESS.md`).
- All data is fictional and simulated; there is no real GPS, telematics, traffic or weather integration.
- The ETA and risk are deterministic rules with hand-set values, not a trained model; a pilot would fit the rates on real history.
- CO₂e is shown only after an emissions factor is verified (gate G-CO2); a second language only after a team member verifies it (gate G-LANG).
- Prototype security limits: no token revocation, no MFA, single-process lock, local database.
- Remaining open item: whether to add the `pmtiles` browser library for the tiled basemap or use the GeoJSON fallback (`PROGRESS.md` §0).

## Generative AI declaration

Generative AI (Claude Code, Anthropic) was used to help with ideation, planning documents and, later, code assistance. The team reviews all output and must be able to explain every part of the code, data and design. The product itself does not use generative AI at runtime: ETAs, risk levels, recovery suggestions, reason suggestions and customer messages come from deterministic rules and templates.

## Documentation

| Document | Purpose |
|---|---|
| `planning/IDEA_HUNT.md` | Ideation and decision record |
| `planning/02_PRODUCT_SPEC.md` | Product specification and acceptance criteria |
| `planning/03_USER_JOURNEYS.md` | User journeys and demo run-sheet |
| `planning/04_TECH_ARCHITECTURE.md` | Technical architecture and decisions |
| `planning/05_DATABASE_SCHEMA.md` | Database schema |
| `planning/06_API_SPEC.md` | API contracts |
| `planning/07_UI_UX_PLAN.md` | UI/UX plan and design tokens |
| `planning/08_ETA_AND_RISK_ENGINE.md` | ETA, attribution, risk and simulation rules |
| `PROGRESS.md` | Implementation status |
| `CHANGELOG.md` | Change history |
| `CLAUDE.md` | Instructions for Claude Code in this repository |

## Disclaimer

Plant X and all scenarios are hypothetical and were written for this hackathon. They do not describe the operations, systems, data or policies of LyondellBasell or any other organisation.
