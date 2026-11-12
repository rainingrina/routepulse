# Changelog

All notable changes to this repository are recorded here. Format based on Keep a Changelog. Dates are in YYYY-MM-DD.

No application code has been written yet. Entries below describe documentation only.

## [Unreleased]

### Added
- Nothing yet.

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
