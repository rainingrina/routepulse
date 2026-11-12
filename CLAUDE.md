# CLAUDE.md — RoutePulse

Instructions for Claude Code in this repository. Keep this file short; details live in `planning/`.

## Hard rules (never break)
1. **Never execute Git commands, directly or indirectly** (no `git`, no `gh`, no scripts or tools that call Git). Developers manage all Git operations themselves only recommend commands with standard github conventions.
2. **No Zod and no other schema-validation library.** Validate requests by hand.
3. **`apps/api/prisma/schema.prisma` is the single source of truth** for database models, fields, relations, enums and indexes (raw-SQL CHECKs/partial indexes live in the migration next to it).
4. **Do not change approved requirements or architecture** without the team's explicit approval. If something conflicts, report it; do not silently decide.
5. **No application code until the team explicitly approves starting implementation.** Then follow `PROGRESS.md` order.
6. **Never fake anything:** no invented features, numbers, commands, environment variables, users or results. All data is fictional (Plant X).

## Project
RoutePulse is an explainable shipment recovery and logistics control tower for **Plant X, a fictional polymer producer** (LYB Mumbai Hackathon 2026, Round 2, Problem Statement 3). Lead user: the logistics coordinator. Supporting roles: customer, transporter/driver.

## Read before working
| Topic | Document |
|---|---|
| Decision record, scope | `planning/IDEA_HUNT.md` §7 |
| Product requirements + acceptance criteria | `planning/02_PRODUCT_SPEC.md` (edit only with team approval) |
| User journeys + demo run-sheet | `planning/03_USER_JOURNEYS.md` (edit only with team approval) |
| Architecture, decisions D1–D9 and locked decisions L1–L10 (§0) | `planning/04_TECH_ARCHITECTURE.md` |
| Database schema | `planning/05_DATABASE_SCHEMA.md` |
| API contracts | `planning/06_API_SPEC.md` |
| UI/UX plan + design tokens | `planning/07_UI_UX_PLAN.md` |
| ETA, attribution, risk, recovery, simulation rules | `planning/08_ETA_AND_RISK_ENGINE.md` |
| Task status | `PROGRESS.md` |

## Stack (approved)
- Frontend: React + TypeScript (Vite SPA).
- Backend: Express v5 + TypeScript (Node.js LTS).
- Database: PostgreSQL + Prisma.
- Approved frontend dependencies (L9): React, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack Query, React Router, Recharts, MapLibre GL JS (used directly), lucide-react; self-hosted Inter. Add **no other** framework or dependency without approval (`pmtiles` is not approved yet).

## Repository layout (planned — architecture §4)
`apps/web` (SPA) · `apps/api` (Express + Prisma) · `packages/shared` (plain TypeScript API types, enum mirrors, constants, fixtures; no runtime dependencies; never imports `@prisma/client`).

## Architecture rules
- **Layers:** controllers (validate shape → authorise → call one service → serializer) · services (use cases, business-rule validation, transactions, world lock) · engines (pure functions) · serializers (Prisma rows → DTOs).
- **Business logic never lives in route handlers.** Controllers do not import Prisma or engines.
- **Engines are pure:** no Prisma, no Express, no `Date.now()`, no `Math.random()`. Time comes from `SimState`.
- **Determinism:** fixed 5-minute grid, `settleTo(t)` with exact splits, integer seconds/metres, largest-remainder rounding. Same seed + same timed actions → same results (architecture §9, engine doc §11).
- **Rule-based, not ML:** never describe ETA/risk as trained, learned or AI-predicted. Use "rule-based estimate".
- **Locked definitions (L1, L3, L4, L6):** ETA = arrival at the receiving gate = Planned + Incurred + Plan change + Expected; on-time = `arrivedAt ≤ promisedBy`; `arrivedAt` is never the tap time; NEW_WINDOW uses the shipment's stored override in preview and execution.
- **One recalculation pipeline** for every state change (architecture §6.3).
- One API process; all mutations go through the in-process world lock.

## TypeScript and API conventions
- `strict` TypeScript everywhere; `npm run typecheck` must pass (planned script).
- API DTOs are plain interfaces in `packages/shared/src/api`. **Never return Prisma entities**; serializers build DTOs using explicit Prisma `select`.
- Use Prisma Client–generated types inside the API only.
- Shared enum unions mirror `schema.prisma`; keep the compile-time drift check (`apps/api/src/contract-checks.ts`) green.
- Prisma `Json` columns: typed + hand-written guards in `apps/api/src/guards/`.
- JSON only; ISO 8601 UTC times (display Asia/Kolkata); integer minutes; integer INR; error envelope `{ error: { code, message, details?, requestId } }` (API §1.1).

## Manual request validation
- Controllers: required fields, types, enum values (from Prisma Client enum objects), lengths, ranges, ISO dates; **reject unknown body fields**; collect all issues → `400 VALIDATION_ERROR`.
- Services: state transitions, scope/ownership, feasibility, staleness → `404` / `409`.
- Database constraints are the last line of defence, not the validation layer. Prisma does not validate HTTP input.

## Prisma and database
- Edit `schema.prisma` first; generate migrations; add raw SQL CHECKs/partial indexes listed in `planning/05_DATABASE_SCHEMA.md` with `--create-only`.
- Seed is deterministic (fixed ids, fixed-seed PRNG). Reset must stay ≤ 5 s.
- Timestamps `Timestamptz(3)`; simulation-time columns are set from `SimState`, never `now()`.

## Authentication and authorisation
- bcrypt hashes; httpOnly SameSite=Lax JWT cookie `rp_session`; secret from `.env` (never committed).
- Every endpoint: `requireRole` + `scopeForUser` + role-specific serializer. Out-of-scope ids return **404**, same as missing.
- Customers never receive driver identity, party labels, factor codes or other customers' data.
- Simulator, clock and reset: coordinator only **and** `DEMO_MODE=true`.

## Error handling and security
- Typed domain errors → one Express error middleware → envelope with `requestId`; no stack traces in responses.
- JSON-only bodies (415 otherwise), 100 kB limit, `helmet`, CSP `connect-src 'self'` (also enforces the offline map).
- Free text is length-limited and rendered as text, never HTML.
- No secrets in code, logs or docs.

## Testing (architecture §20)
- Vitest. Unit tests for engines (ET, RK, AT, RC, CL, CT series), integration tests for authorisation/data isolation (AZ series) using the real Express app and Node's built-in `fetch`, reproducibility tests (R1–R8), and the **golden hero test** (G0–G8).
- Prove new tests can fail. Run the full suite before reporting work as done. Report failures honestly with output.

## UI/UX expectations (UI plan)
- Light, premium enterprise SaaS. Use only the tokens in `planning/07_UI_UX_PLAN.md` §2; no raw HEX in components.
- Status = colour + icon + text, always. Charts: fixed party order, legend, table toggle.
- Coordinator control tower is the showcase screen. Driver UI is mobile-first (360 px, ≥ 48 px targets).
- Designed loading, empty, error, conflict, reconnecting and paused states.
- Offline: no external fonts, icons, tiles or images at runtime.
- Run the visual QA checklist (UI plan §19) before feature stop.

## AI use and data transparency
- Generative AI (Claude Code) is used for planning documents and code assistance; the team declares this in the README and the presentation (hackathon rule: undeclared use costs 10 points). Every team member must be able to explain the code.
- The product itself uses no generative AI at runtime: ETA, risk, recovery suggestions, reason suggestions and customer messages are deterministic rules and templates.
- All data is fictional and simulated. Label simulation time and fictional data in the UI. Never present simulated numbers as real-world results.

## Workflow and documentation
- Before work: read `PROGRESS.md` and the relevant planning section.
- Propose a short plan for product/UI changes and wait for "go"; requested bug fixes may proceed.
- After work: update `PROGRESS.md` (status + test status, honestly), add a `CHANGELOG.md` entry, and update docs if behaviour changed.
- Status values: Not Started / In Progress / Implemented / Tested / Verified. Never mark something Tested without a passing test you ran, or Verified without checking it in the running app.
- Do not create new documents unless asked; update existing ones.
- Commands in `README.md` must match real `package.json` scripts once they exist.
