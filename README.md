# RoutePulse

**An explainable shipment recovery and logistics control tower.**
Know it will be late hours before it is — know why, and fix it.

Built for the LYB Mumbai Hackathon 2026, Round 2, Problem Statement 3 (Order-to-Delivery Control Tower). All companies, people and data are **fictional**; "Plant X" is a fictional polymer producer.

> **Project status (2026-11-12): planning complete and decisions locked (L1–L10); implementation not started.** The repository currently contains planning documents only. The commands and configuration below describe the **planned** setup from `planning/04_TECH_ARCHITECTURE.md`; they do not work yet and will be updated to match the real `package.json` scripts when the code exists. See `PROGRESS.md`.

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

None of these is implemented yet.

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

## Getting started (planned — not yet available)

The repository has no `package.json`, `.env.example`, Docker Compose file or Prisma schema yet. When they are added, this section will list the exact commands. The planned shape (architecture §4 and §15) is:

### Prerequisites (planned)
- Node.js LTS and npm.
- PostgreSQL (planned via Docker Compose, or a local install).

### Environment variables (planned)
| Variable | Purpose | Source |
|---|---|---|
| `SESSION_SECRET` | Signs the session cookie | Architecture §7.1 |
| `DEMO_MODE` | Enables simulator, clock and reset endpoints when `true` | Architecture §14 |
| Database connection URL | Prisma datasource; exact name set in `schema.prisma` at setup | To be defined |

A `.env.example` will be added during setup. Real `.env` files are never committed.

### Database and Prisma (planned)
- Schema in `apps/api/prisma/schema.prisma`; migrations include hand-added CHECK constraints and partial indexes.
- A deterministic seed creates fictional customers, lanes, transporters, 60 days of history and the live demo shipments.

### Development scripts (planned names, architecture §4)
`dev` · `build` · `typecheck` · `test` · `demo` · `seed` · `reset` — not yet defined in any `package.json`.

### Testing (planned)
Unit tests for the ETA, risk, attribution and recovery engines; integration tests for authorisation and data isolation; reproducibility tests; and one golden end-to-end hero scenario test. See `planning/04_TECH_ARCHITECTURE.md` §20.

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
