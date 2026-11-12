# 08 — ETA and risk engine: RoutePulse

Version 0.2, 2026-11-12. Status: **approved; revision 0.2 applies the locked decisions L1–L10** (architecture §0.1). All items formerly open in §13 are resolved.
This document is the detailed rulebook behind `04_TECH_ARCHITECTURE.md` §9–§12. It does not change any approved decision. Where it must interpret or extend, the item is marked **[INTERPRETATION]** or **[OPEN]** and listed in §13.

**Nature of the engine.** Every number is produced by fixed, hand-written rules from stated inputs. Nothing is learned from data. The UI and the pitch describe it as "rule-based" (spec §10; AC-M3.8). The rule set is versioned: `ruleVersion = "eta-rules-v1"`.

Labels: **[A]** assumption (value set in API config and the facts/assumptions file; fixed by the golden test) · **[INTERPRETATION]** detail not stated in approved documents · **[OPEN]** team decision needed.

---

## 1. Configuration values

All values live in `apps/api/src/config/`. Values marked **[A]** are fictional and may be tuned before the golden test is recorded.

| Name | Value | Source |
|---|---|---|
| Grid step | 5 min | Architecture §9.1 |
| Standard loading time per truck | 40 min **[A]** | — |
| Loading bays | 3 **[A]** | Spec §5.1 |
| Unloading time | `Customer.unloadingMinutes` (default 60) | Schema |
| Ping interval (every truck on the road, incl. the manual hero — O-14) | 30 min | Architecture §9.3 |
| Level thresholds | ON_TRACK slack ≥ 120 · WATCH 0–119 · AT_RISK < 0 | Spec §5.4 |
| Range | ± (5% of minutes to predicted arrival + 30 if last update > 2 h + 20 per pending report), rounded to the nearest 5 min (halves up) | Spec §5.4 |
| Confidence | HIGH ≤ 1 h & no pending report · MEDIUM 1–3 h or pending report · LOW > 3 h | Spec §5.4 |
| Risk score | `clamp(round(50 − slack ÷ 6), 0, 100)` | Spec §5.4 |
| Reason defaults | Breakdown 180 (T) · Plant gate 90 (P) · Traffic 60 (E) · Road closed 120 (E) · Heavy rain 60 (E) · Documents 60 (P if missing at dispatch, else E) · Unloading 90 (C) · Other 60 (unassigned) | Spec §5.8 |
| HIST pace bounds | `p ∈ [0.80, 1.00]` **[A]** | — |
| HIST minimum history | 5 delivered shipments per transporter-lane, else transporter-wide, else `p = 1` **[A]** | — |
| Replacement search radius | 50 km **[A]** | — |
| Replacement travel speed | 40 km/h **[A]** | — |
| Load transfer time | 45 min **[A]** | — |
| Split eligibility | > 1 order line or > 10 t | Spec §5.6 |
| Rate card (fictional) | dispatch ₹3,000 · ₹55/km · transfer fee ₹2,000 **[A]** | Spec §5.1 |
| Arrival confirmation | ARRIVED allowed only after physical arrival and from the eligible check-in time; DELIVERED only from `arrivedAt + unloadingMinutes` | Architecture §9.3 (L6) |
| NEW_WINDOW proposal | Projected road arrival rounded **up** to the next 30-minute mark; later than the current promise; ≤ promise + 48 h | Architecture §12 (L4) |
| CO₂ factor | `null` until G-CO2 passes | Spec §5.12 |

---

## 2. Time quantities

| Symbol | Meaning |
|---|---|
| `B(route)` | Baseline transit minutes of a route = Σ segment `lengthKm ÷ speedKmh × 60`, each segment rounded once at seed; stored as `Route.baselineMinutes` |
| `plannedDepartureAt` | `plannedGateAt + standard loading time` |
| `plannedArrivalAt` | `plannedDepartureAt + B(primary route)` — fixed at planning, never moved by delays |
| `C` | Baseline minutes **consumed**: the baseline time of the distance already covered on the current route (from the per-segment table, rounded to the minute) |
| `R` | Baseline minutes **remaining**: `B(current route) − C` |
| `promisedBy` | The **agreed** promise (D4) for **arrival at the receiving gate** (L1). Starts as the order's promise; moves only when a NEW_WINDOW is accepted. `originalPromisedBy` never changes |
| Road arrival | When the truck reaches the customer's gate: `projectedRoadArrivalAt` (projected) / `physicalArrivalAt` (actual) |
| Applicable receiving window | The customer's default hours; after an accepted NEW_WINDOW, additionally any road arrival up to `Shipment.receivingWindowOverrideEndAt` (L4) — **literally any**, including arrivals before the default opening time (decision O-12, 2026-11-12) |
| Eligible check-in time | Road arrival if inside the applicable window, otherwise the next default opening after it |
| ETA / `predictedArrivalAt` | Predicted arrival at the receiving gate = eligible check-in time of the projected road arrival (L1) |
| `arrivedAt` | Eligible check-in time of `physicalArrivalAt`; confirmed by the ARRIVED milestone, never the tap time (L6) |
| `deliveredAt` | `arrivedAt + unloadingMinutes` (+ confirmed unloading waits); may be after the window closes (L1) |

---

## 3. The identity

The locked identity (L3) is:

```
ETA = Planned arrival + Incurred (I) + Plan change (P) + Expected (E)
P = B(current route) − B(primary route)   (0 unless rerouted)
```

All four terms are kept in the engine and in the explanation model; P is shown as its own "Plan change" bar. Without a reroute, P = 0 and the identity reads `ETA = Planned arrival + Incurred delay + Expected future delay`.

### 3.1 Why nothing is double-counted
| Term | Covers | Computed from |
|---|---|---|
| I | Time **already elapsed** beyond the plan, up to `now` | The clock: `I = now − plannedDepartureAt − C` once departed; `max(0, now − plannedDepartureAt)` before departure |
| P | A **fixed** difference between two route baselines | The route table |
| E | Time **from `now` onward** beyond the remaining baseline | Forward projection (§5) |

I and E cover disjoint time intervals: `(−∞, now]` and `(now, arrival]`. As time passes, a minute moves from E into I; it is never in both. P is not a time interval but a constant, applied once.

### 3.2 Proof (departed shipment)
```
Planned + I + P + E
 = (plannedDep + B_primary) + (now − plannedDep − C) + (B_current − B_primary) + E
 = now + (B_current − C) + E
 = now + R + E
```
`now + R + E` is exactly how the forward projection computes the arrival. ∎
Before departure: `Planned + I + E = plannedDep + B + max(0, now − plannedDep) + E_gate + E_transit = projected gate-out + B + E_transit`. ∎

### 3.3 Rounding so the displayed bars add up
- The ledger and the projection work in **integer seconds**.
- `I` is taken from the clock (exact minutes). The per-cause incurred bars are the ledger's seconds per cause converted to minutes and rounded with the **largest-remainder method** so they sum exactly to I.
- The predicted arrival is rounded to the minute. The per-cause expected bars are rounded the same way to sum exactly to `predicted − now − R`.
- Result: the waterfall bars always add up to the ETA to the minute (AC-M3.2).

---

## 4. Incurred delay and attribution (the ledger)

### 4.1 Parties and causes
| Factor | Typical causes (reason) | Default party |
|---|---|---|
| GATE | Plant gate queue, loading, gate congestion (`PLANT_GATE_WAIT`) | PLANT |
| HIST | Transporter pace below baseline; truck late to the gate (`TRANSPORTER_PACE`) | TRANSPORTER |
| DISR | Weather slowdown (`HEAVY_RAIN`), road closure (`ROAD_CLOSED`), simulator breakdown (`BREAKDOWN`), gate congestion event (`PLANT_GATE_WAIT`) | The disruption's party: EXTERNAL / EXTERNAL / TRANSPORTER / PLANT |
| RPT | Driver-confirmed report (any chip reason) | Reason default; coordinator may change it |
| WIN | Waiting for the receiving window (`RECEIVING_WINDOW`) | Knock-on split (§6) |

### 4.2 Booking rules per settled interval of Δ seconds
| Situation during the interval | Lost seconds | Booked to |
|---|---|---|
| Before `plannedDepartureAt` (any pre-departure state) | 0 | — (waiting before the plan is not delay) |
| After `plannedDepartureAt`, truck not yet at the gate | Δ | HIST · TRANSPORTER · "Truck late at gate" |
| After `plannedDepartureAt`, at gate or loading | Δ | GATE · PLANT · "Gate wait / loading" |
| Stopped (`stoppedUntil > t`) | Δ | The binding stop (§4.3) |
| Moving, pace `p`, slowdown `s` | `Δ − Δ·p·(1−s)` | DISR `Δ·s` (disruption's party) and HIST `Δ·(1−s)·(1−p)` (TRANSPORTER) |
| Physically arrived, outside the applicable receiving window | Δ | WIN · knock-on split (§6) |
| Physically arrived and eligible for check-in, waiting for a manual ARRIVED tap | 0 | Nothing (L6). `arrivedAt` is the eligible check-in time; the confirmation lag is recorded only in the ARRIVED event data. No attribution record is needed, so the ETA and on-time result cannot change |
| After ARRIVED (unloading) | 0 for the promise | Confirmed "waiting to unload" reports extend `deliveredAt` only |

The two moving terms add up: `Δ·s + Δ(1−s)(1−p) = Δ − Δ·p(1−s)`. The same split is used in the projection (§5), so expected minutes become identical incurred minutes when the future happens as projected.

### 4.3 Overlapping causes [DECIDED L5]
The same precedence is applied by the settle step (incurred) and by the forward projection (expected), so an expected minute always becomes the same incurred minute. Every disruption and report keeps its own events in history; only the winning cause receives ledger time, so effective delay is booked once.

| Overlap | Rule | Reason |
|---|---|---|
| Stopped **and** inside a slowdown window | Whole Δ to the stop; slowdown ignored | A stopped truck is not slowed |
| Two stops at once (e.g. breakdown report and road closure) | `stoppedUntil = max(...)`; Δ booked to the stop with the **latest end** (tie: earliest created) | The latest-ending stop is the binding constraint |
| Two slowdowns on the same segment | Use the **largest** `s`; book DISR to that disruption | Avoids multiplying slowdowns into unrealistic speeds |
| Slowdown and transporter pace | Combined multiplicatively (§4.2) with fixed decomposition | Keeps both parties' shares stable |
| Gate congestion while queued | Extra minutes booked to GATE / PLANT with the congestion event as source | Same party; source kept for the timeline |
| Driver report that duplicates a simulator disruption | Both may be active; the stop rule above applies. The coordinator can re-attribute on review | Duplicate detection is not in scope |

### 4.4 Resolved and ended disruptions
- When a disruption ends (on schedule or early via the simulator), **expected** DISR for it drops to zero at the next recalculation.
- **Incurred** DISR already in the ledger stays — that time was really lost.
- A closure ending early releases a truck that is held at the closure on the next settle.
- A driver report's stop ends at `stoppedUntil`; the coordinator cannot shorten it in v1 (re-reporting creates a new report).

### 4.5 At arrival and delivery
- `delayMinutes = max(0, arrivedAt − promisedBy)`; `onTime = arrivedAt ≤ promisedBy` (agreed promise, D4; arrival-based, L1).
- **After physical arrival the identity freezes at the eligible check-in time:** WIN accrues while the truck waits for the window; afterwards nothing is booked and the ETA equals `arrivedAt` (L6).
- At ARRIVED the ledger rows become FINAL. A GAP row (UNATTRIBUTED) records any difference between `delayMinutes` and the attributed minutes beyond the promise; in the simulation it is normally 0.
- **As implemented (Milestone 6):** finalisation happens when ARRIVED is recorded (autopilot in the settle step; manual on the tap). Rows are stamped with `arrivedAt` (the eligible check-in time of the physical arrival), never the tap time; the ledger stopped accruing at that moment (L6). **GAP definition used [INTERPRETATION, resolving a wording conflict]:** GAP = `(arrivedAt − plannedArrivalAt) − Σ(TIME_LOST + PLAN_CHANGE)` in seconds — "any remaining gap between actual and baseline" (spec §5.9) — so every arrived shipment reconciles exactly to arrival − planned arrival. The architecture/schema wording "difference between `delayMinutes` and attributed minutes" is superseded by this (delayMinutes is measured against the promise, the ledger against the plan). A negative remainder is an invariant violation and raises an error instead of being hidden. Displayed row minutes: total = round(Σ seconds / 60), split by largest remainder.
- **But-for rule** (spec §5.9): `countsAgainstTransporter = delayMinutes > 0 && (delayMinutes − transporterMinutes) ≤ 0`, where `transporterMinutes` = FINAL TIME_LOST + PLAN_CHANGE minutes attributed to TRANSPORTER.
- Overrides: the coordinator moves a whole row to another party with a note; `originalParty` is kept; audit row written (AC-F1.3).

---

## 5. Expected future delay (forward projection)

`projectEta(context)` is a pure function. It walks forward from `now` in time order:

1. **Remaining stop.** If `stoppedUntil > now`: extra = `stoppedUntil − now` to the binding stop's cause.
2. **Gate (not departed).** Projected gate-out = `max(plannedDepartureAt, now + queue wait + remaining loading + congestion minutes)`. Queue wait = trucks ahead ÷ bays × loading time. Extra = projected gate-out − `max(now, plannedDepartureAt)`, to GATE / PLANT.
3. **Transit.** Segment by segment from the current position. Each segment is split at disruption window edges **in projected time**. For each piece of baseline time `b` with pace `p` and slowdown `s`:
   - actual time = `b ÷ (p·(1−s))`
   - HIST extra = `b·(1/p − 1)` → TRANSPORTER
   - DISR extra = `(b/p)·(s/(1−s))` → the disruption's party
4. **Closures.** If the truck would reach a closed segment before the closure ends: extra = wait until it ends, to DISR.
5. **Receiving window.** If the projected arrival falls outside receiving hours: extra = time until the window next opens, to WIN (§6).
6. Arrival = `now + R + Σ extras`. Factors are returned with phase EXPECTED.

**As implemented (Milestone 5, `engines/eta.ts`).** Steps 1–5 are not coded a second time: the projection runs the **same simulation engine** forward on a copy of the world (every manual step assumed as soon as it is allowed) until each shipment's eligible check-in time, and E per cause is the ledger that run books from `now` on. This makes §4.3 and §11 ("projection and settle use the same decomposition") true by construction: with no new information, every expected second becomes the identical incurred second (ET-3 tested over 12 settles). One consequence **[INTERPRETATION]**: the gate queue in step 2 is the exact first-come-first-served simulation over the loading bays, not the approximation "trucks ahead ÷ bays × loading time"; both agree when every bay frees on schedule.

### 5.1 Historical transporter performance (HIST) and proration (D6)
- **Pace** `p` for (transporter, lane) comes from delivered history: `r` = median over those shipments of (TRANSPORTER-attributed TIME_LOST seconds ÷ baseline seconds); `p = 1 ÷ (1 + r)`, clamped to `[0.80, 1.00]`. Fallbacks in §1.
- **Proration:** HIST applies only to the **remaining** baseline time: `E_HIST = Σ over remaining pieces b·(1/p − 1) = R·r` when no slowdown applies.
- **Golden values recomputed with the derived pace (Milestone 5, `tests/unit/etaEngine.test.ts`):** 09:30 → 14:20 (I 40 GATE, E 20 HIST) · 10:25 → 14:20 (I 40 + 4, E 16) · 10:30 rain → **16:20**, DISR 120, HIST 16, slack 100, WATCH · 11:10 breakdown 180 → road 19:20, **Fri 08:00**, I 49 = 40/7/2, E HIST 13 + DISR 118 + stop 180 + WIN 760, slack −840, AT_RISK · 11:25 → I 64 = 40/7/2/15 · transfer to 12:40 → **17:50**. Only the WIN split moves by a minute: **84 / 423 / 253** (Plant / Transporter / External) instead of the illustrative 85 / 422 / 253 (weights are ledger seconds). With a simulator breakdown (no pending report) the 11:10 range is ±65 and confidence HIGH; the ±85/MEDIUM in Example 2 apply to the driver-report path (Milestone 6).
- **Decided 2026-11-12:** the pace used by the engine and by the Milestone 5 golden tests is the one **derived from the seeded history**, not a designed value. For Ghatline on the Pune lane this is **r = 20 / 270 = 0.0741** (p ≈ 0.931), not 0.0753. The worked examples in §10 below still show the designed p = 0.93; their expected-HIST minutes are unchanged (20 at R = 270, 16 at R = 214, 13 at R = 179), and any one-minute differences elsewhere will be fixed by recomputing the golden values with the derived pace in Milestone 5.
- Examples with `r = 0.0753` (p = 0.93) on a 270-minute route (illustrative; see the note above):

| Remaining baseline R | Expected HIST |
|---|---|
| 270 (at gate-out) | 20.3 → 20 min |
| 214 | 16.1 → 16 min |
| 135 (halfway) | 10.2 → 10 min |
| 0 (arrived) | 0 |

- The simulation moves trucks with the **same** `p`, so the projection and the movement agree. History is generated by the seed to match the designed paces **[A]**.

---

## 6. Receiving-window constraint and knock-on split

- Default receiving hours come from `Customer.receivingOpenMin` / `receivingCloseMin` in local time (Asia/Kolkata). They are never modified by a recovery (L4).
- Eligibility is decided by **arrival** time (L1). If the road arrival is outside the applicable window (default hours, or this shipment's accepted override), WIN extra = eligible check-in time − road arrival.
- Unloading may finish after the window closes if arrival was inside it (L1).
- **O-12 (decided 2026-11-12):** an accepted override accepts any road arrival up to its end, including before the customer's normal opening time; the opening time is not an extra restriction.
- **Separate concepts:** physical gate access, unloading availability and on-time eligibility are kept apart. The receiving-window rule decides only on-time eligibility (`arrivedAt`); it does not model when the gate physically opens or when unloading crews are available.
- Settlement and projection use the same window rule.
- **Split (spec §5.9, AC-F1.4):** WIN minutes are divided across parties in proportion to each party's other minutes on the shipment (I + P + E, excluding WIN). Rounded with largest remainder. If no other minutes exist → UNATTRIBUTED. **Never to the customer by default.**
- The same split applies when WIN time is actually incurred (truck holding at the destination).

### 6.1 Renegotiated windows (NEW_WINDOW)
- **Preview:** when options are generated, NEW_WINDOW gets a fixed `newWindowEnd` = projected road arrival rounded up to the next 30-minute mark (later than the current promise, ≤ +48 h). Its `newEtaAt` is computed by `projectEta` with `receivingWindowOverrideEndAt = newWindowEnd`.
- **Choose:** the coordinator chooses it; the option becomes AWAITING_CUSTOMER and is not superseded by routine recalculations.
- **Acceptance (L4):** on the customer's ACCEPT_PROPOSAL the service applies exactly the stored `newWindowEnd`: `promisedBy` and `receivingWindowOverrideEndAt` are set to it, `renegotiated = true`. `originalPromisedBy` and the customer's default hours are unchanged. ETA, WIN, slack and risk are recalculated; the new ETA equals the preview's `newEtaAt` at the same time. Events CUSTOMER_RESPONDED and RECOVERY_APPLIED and audit rows are written.
- **Stale:** if the coordinator chose another option or the alert resolved, acceptance returns 409 and nothing is applied.
- Example (hero at 11:25): road arrival 19:20 → `newWindowEnd` 19:30 → preview ETA 19:20 (inside the override, WIN = 0), meets the new window; ₹0; never auto-suggested.

---

## 7. Risk engine

### 7.1 Inputs and output
The risk engine consumes only the projection result and the promise. It introduces **no factors beyond GATE, HIST, DISR, RPT and WIN**, and applies **no weights** to them: each factor contributes exactly its minutes. "Weight" in this engine means the minutes rule of each factor (§4–§6); there is no separate weighting layer.

| Output | Rule |
|---|---|
| Slack | `promisedBy − predictedArrival` (minutes) |
| Level | ON_TRACK ≥ 120 · WATCH 0–119 · AT_RISK < 0 · LATE when `now > promisedBy` and the shipment has not physically arrived inside the applicable window |
| Score | `clamp(round(50 − slack ÷ 6), 0, 100)` — sorting only; never shown as a probability |
| Range | ± (5% of minutes to predicted arrival + 30 if last update > 2 h + 20 per pending report), rounded to the nearest 5 min |
| Confidence | HIGH / MEDIUM / LOW from data freshness and pending reports |
| Summary | Names the largest factor: "At risk: +180 min breakdown is the largest factor" |

### 7.2 Confidence and uncertainty — how they are shown
- The ETA is always shown with its range ("17:50 ± 20 min") and a confidence chip with the reason ("Medium — driver report pending review").
- The range and confidence are labelled **rule-based**, not statistical. They never claim a probability.

### 7.3 How risk changes over time
- With no new information and events running as projected, the **ETA stays constant**: each minute moves from E into I. The level only changes because of new events, ends of events, actions or the promise changing.
- LATE is the only level that changes with the clock alone (the promise passes before arrival).
- A pending report raises the range and lowers confidence; confirming it removes the 20-minute widening.
- A silent truck (no update > 2 h, > 3 h) widens the range and lowers confidence; the ETA itself is unchanged until something happens.

---

## 8. Recovery actions

All options are computed by running `projectEta` on a **modified copy** of the context; choosing applies the same modification and reruns the pipeline (architecture §10.7). Infeasible kinds are shown disabled with a reason.

| Kind | Available when | ETA impact | Attribution change | Operational trade-off |
|---|---|---|---|---|
| **REROUTE** | Truck moving; an alternate route avoids an active disruption; current position before the routes diverge | Remaining route = alternate; P = B_alt − B_primary; avoided DISR removed from E | P attributed to the avoided disruption's party (PLAN_CHANGE row) | Extra distance and cost; possibly longer if the disruption ends early |
| **SPLIT** | A truck AVAILABLE at the plant; > 1 order line or > 10 t | New child shipment for urgent lines with its own plan (`plannedDeparture = now + loading`); parent ETA unchanged | Child starts with a clean ledger; parent keeps its own | Second truck cost; urgent grade early, remainder still late |
| **REPLACEMENT_TRUCK** | Stopped by a breakdown; an AVAILABLE truck with a default driver within the radius | `stoppedUntil = now + travel + transfer`; RPT/DISR expected stop replaced by the shorter hand-over | Remaining stop stays with the original cause (TRANSPORTER for a breakdown), relabelled "Load transfer" | Cost of a second vehicle; driver changes (D3) |
| **NEW_WINDOW** | Always | With the shipment-specific override, WIN is recalculated: if the road arrival is ≤ `newWindowEnd`, ETA = road arrival; slack and level change | None | No cost; customer must agree; counted as renegotiated (D4); customer default hours untouched (L4) |
| **NOTIFY_ONLY** | Always | Unchanged | None | Baseline for comparison |

**As implemented (M8, `engines/recovery.ts`, `services/recoveryService.ts`):** every option is `explainIn` (the same projection) on a modified copy; replacement travel uses the documented yard road distance (Khopoli yard 20 km → 30 min; trucks at the plant: the shipment's route distance), radius 50 km, transfer 45 min, a candidate needs a default driver not driving another live shipment and must beat the repair end; REROUTE needs a moving truck before the divergence point and an alternate that avoids an active slowdown/closure ahead (P = B_alt − B_current, PLAN_CHANGE row to the avoided disruption's party; a shorter alternate is not offered); SPLIT needs > 1 line or > 10 t and an urgent part (not the whole shipment), uses the stated defaults; NEW_WINDOW per §6.1; NOTIFY_ONLY = current ETA. Golden: 10:30 rain → reroute via RT-PUNE-B Suggested (15:57, ₹1,265); 11:10 report → replacement TRK-11 Suggested (17:35, ₹6,100), new window 19:30 (ETA 19:20); chosen at 11:25 → 17:50; arrival 17:50 on time; final ledger GATE 40 / HIST 20 / DISR 120 / RPT 90.

**Suggested** (AC-M4.4): among feasible options that meet the current promise, excluding NEW_WINDOW and NOTIFY_ONLY, the lowest cost; ties → earliest ETA. If none meets the promise, the feasible option with the smallest delay (same exclusions). If none is feasible, nothing is suggested.

---

## 9. Simulation rules (summary)

Implemented in Milestone 4 (`apps/api/src/engines/simulate.ts`, `services/simulationService.ts`); implementation assumptions are recorded in architecture §9.2. Delay at arrival is `ceil(late seconds / 60)` minutes.


| Topic | Rule (architecture §9) |
|---|---|
| Grid | State moves forward on 5-minute boundaries; movement and ledger are computed by `settleTo(t)`, split at boundaries and disruption edges |
| Actions between boundaries | Stamped to the whole minute; `settleTo(actionTime)` first; the grid never shifts; splits are exact (integer metres + carry) |
| Pause / play | Pause keeps `simTime` (no snapping); play resumes without a jump |
| Speed | 1× / 10× / 60×; changing speed first settles at the old speed |
| Advance | `ADVANCE n` and `ADVANCE_TO t` pause implicitly and process every boundary in order; `ADVANCE 60` ≡ 12 × `ADVANCE 5` |
| Reset (L2) | Truncate + deterministic reseed (Thu 08:00) + hero pre-script through the normal services (AT_GATE 08:10, LOADING 08:50 by simulation, GATE_OUT 09:30) + advance to **Thu 10:25**, paused |
| Background shipments (D7) | Autopilot: AT_GATE at `plannedGateAt`, LOADING by bay availability, GATE_OUT when loaded and not before `plannedDepartureAt`, PHYSICAL_ARRIVAL at the exact crossing minute, ARRIVED at the eligible check-in time, DELIVERED after unloading |
| Hero shipment (D7, L6) | Manual: driver taps AT_GATE, GATE_OUT, ARRIVED, DELIVERED. LOADING is always recorded by the simulation (plant activity). The truck holds at the gate after physical arrival; `arrivedAt` and `deliveredAt` come from the simulation's times, not the taps |
| Pings | Every truck on the road (autopilot **and** the manual hero, O-14) pings every 30 min unless seeded silent — also while stopped, not after physical arrival; driver actions also count. A ping only refreshes `lastUpdateAt`; it never creates an event or a milestone |
| Ledger (Milestone 5) | Booked during settle per §4.2 with L5; per settle call the shipment's booked seconds are `round(I(to)) − round(I(from))` (I exact from the clock), spread over the causes by largest remainder, so the cumulative ledger always equals round(I) and never drifts |
| Long gap | > 12 boundaries in one tick → process 12, pause, show `simError` |

**Driver reports (Milestone 6) [INTERPRETATION where marked]:**
- Classifier `KEYWORD_LIST_V1` (`engines/classifier.ts`), English only (G-LANG closed), whole-word match after lower-casing and removing hyphens/apostrophes; the reason with most distinct matches is suggested, a tie gives no suggestion; STRONG ≥ 2, WEAK 1, NONE 0. **Word list [INTERPRETATION — the spec names only the method and examples]:** Breakdown: breakdown, broke, broken, tyre(s), tire(s), puncture(d), flat, engine, axle, brake(s), overheating, overheated, clutch, battery, mechanic, repair · Plant gate: plant, gate, loading, bay, dispatch · Traffic: traffic, jam, congestion, accident, tollbooth · Road closed: closed, closure, blocked, diversion, landslide, barricade · Heavy rain: rain, raining, rains, flood(ed/ing), waterlogged, waterlogging, storm · Documents: document(s), papers, permit, eway, invoice, checkpost, checkpoint, challan · Unloading: unload, unloading, unloaded, dock, forklift.
- Applied minutes = the driver's estimate or the reason default; party = the reason default. DOCUMENTS "Plant if missing at dispatch, else External" → **[INTERPRETATION]** reported before gate-out → PLANT, after → EXTERNAL.
- A report on a moving truck holds it until `report time + applied minutes` (architecture §19 #15); with several stops `stoppedUntil` = the latest end and the binding report is the one ending there (tie: earliest, then id). Before departure the gate rule books the time (GATE); after physical arrival nothing moves; a CONFIRMED "waiting to unload" report made at the customer extends `deliveredAt` only.
- Review confirms, or changes reason/party with a note; the report keeps the driver's original values and its RPT ledger rows move to the reviewed party. There is no "rejected" status (schema: PENDING_REVIEW / CONFIRMED); a rejection is a change to OTHER / UNATTRIBUTED with a note.
- Golden check (report path, Example 2): at 11:10 the report gives Fri 08:00, AT_RISK, slack −840, **±85, MEDIUM** (pending report), RPT 180 pending, WIN 84/423/253; after the 11:20 review: CONFIRMED, ±60, HIGH. Without recovery the hero arrives physically at 19:19:43, `arrivedAt` Fri 08:00, delay 840, FINAL ledger 1,120 min = GATE 40 + HIST 20 + DISR 120 + RPT 180 + WIN 760, no GAP, does not count against the transporter (840 − 623 > 0).
- ETA bars follow the ledger's party per source, so an override or a review is visible in the explanation (fix in Milestone 6; no golden value changed).

**Implementation interpretations (Milestone 5) [INTERPRETATION]:**
- "Earliest created" in the L5 tie-breaks uses the disruption's simulation start time, then its id (never the wall-clock `createdAt`), so results are reproducible.
- A shipment that has never sent an update (e.g. not yet at the gate) is treated as older than 3 h: confidence LOW and +30 on the range.
- LATE: `now > promisedBy` and the truck has not physically arrived with an eligible check-in time ≤ `promisedBy` (an on-time physical arrival awaiting the ARRIVED tap is not late, L6).
- The range is applied symmetrically around the predicted arrival as written; the lower bound is not clamped to `now`.
- Summary: the largest factor by minutes across both phases of one cause, excluding the WIN knock-on; customer `plainReason` is that factor's reason in plain words (null when ON_TRACK).

---

## 10. Worked examples

All companies are fictional. Times are simulation time (Thursday unless stated). Values marked **[A]** are illustrative and are fixed by the seed.

### Example 1 — Normal delivery (Plant X → Nashik)
| Input | Value |
|---|---|
| Primary route baseline B | 210 min |
| Planned gate / departure / arrival | 07:20 / 08:00 / 11:30 |
| Promise | 14:00 · receiving 08:00–18:00 |
| Transporter pace p | 0.95 (r = 0.0526) |

**At 08:00 (gate-out on time, no queue):** C = 0, R = 210, I = 0. E_HIST = 210 × 0.0526 = 11.05 → **11**. Predicted = 11:30 + 0 + 11 = **11:41**. Check: now + R + E = 08:00 + 210 + 11 = 11:41 ✓. Slack 139 → **ON_TRACK**, score 27. Range: 5% of 221 = 11.05 → ±10. Confidence HIGH.

**At 09:45:** elapsed 105 min × 0.95 = 99.75 baseline consumed → C = **100**, R = 110. I = 09:45 − 08:00 − 100 = **5** (HIST). E_HIST = 110 × 0.0526 = 5.79 → **6**. Predicted = 11:30 + 5 + 6 = **11:41** ✓ (unchanged — minutes moved from E to I).

**Arrival:** actual travel = 210 ÷ 0.95 = 221.05 min → ARRIVED **11:41** (autopilot, exact minute). `delayMinutes = 0`, `onTime = true`. Final ledger: HIST 11 min (TRANSPORTER). No WIN, no GAP.

### Example 2 — Multiple delay causes (hero SHP-1042, Plant X → Pune)
| Input | Value |
|---|---|
| Primary route baseline B | 270 min; ghat segment = baseline minutes 90–150 |
| Planned departure / arrival | 08:50 / **13:20** |
| Promise | 18:00 · receiving 08:00–18:00 |
| Transporter pace p | 0.93 (r = 0.0753) in this illustration; the implementation and golden tests use the history-derived r = 0.0741 (§5.1) |
| Rain (simulator) | ghat segment, slowdown s = 0.65, 10:30–18:30 **[A]** |

**09:30 — gate-out after a 40-minute gate wait.** I = 09:30 − 08:50 − 0 = **40** (GATE, PLANT). R = 270. E_HIST = 270 × 0.0753 = 20.3 → **20**. Predicted = 13:20 + 40 + 20 = **14:20**. Slack 220 → **ON_TRACK**.

**10:30 — rain injected.** Elapsed 60 min × 0.93 = 55.8 → C = **56**, R = 214. I = 10:30 − 08:50 − 56 = **44** → GATE 40, HIST 4 (ledger 4.2). Projection: 34 baseline min to the ghat (reached ≈ 11:07); ghat 60 baseline min under p and s; then 120 baseline min.
- E_HIST = 214 × 0.0753 = 16.1 → **16**
- E_DISR = (60 ÷ 0.93) × (0.65 ÷ 0.35) = 119.8 → **120**
- Predicted = 13:20 + 44 + 136 = **16:20** ✓ (now + R + E = 10:30 + 214 + 136). Slack 100 → **WATCH**.

**11:10 — driver reports "tyre puncture near Lonavala", Breakdown, default 180 min.** Settle 10:30→11:10: 37 min at pace (+34.4 baseline), 3 min on the ghat in rain (+0.98 baseline) → C = 91, R = 179. I = 11:10 − 08:50 − 91 = **49** → ledger GATE 40.0, HIST 6.86, DISR 1.95 → largest-remainder → GATE 40, HIST 7, DISR 2.
Projection from 11:10: stop 180 → moves again 14:10; remaining ghat 59.0 baseline min in rain (exits ≈ 17:11, before 18:30); then 120 baseline.
- E_RPT = **180** (TRANSPORTER, pending review)
- E_HIST = 179 × 0.0753 = 13.5 → **13**
- E_DISR = (59.0 ÷ 0.93) × 1.857 = 117.9 → **118**
- **Road arrival** = 11:10 + 179 + 311 = **19:20** → after the 18:00 close.
- E_WIN = 19:20 → Fri 08:00 = **760**. Other minutes by party: PLANT 40; TRANSPORTER 7 + 180 + 13 = 200; EXTERNAL 2 + 118 = 120; total 360. Split: PLANT 84.4, TRANSPORTER 422.2, EXTERNAL 253.3 → largest remainder → **85 / 422 / 253**.
- **Receiving-window wait** (WIN) = 760 min; **final receiving ETA** = 13:20 + 49 + 0 + (180 + 13 + 118 + 760) = 13:20 + 1,120 min = **Fri 08:00** ✓ (P = 0, no reroute).
- Proposed action in the customer alert at 11:10 = Suggested option computed at 11:10: REPLACEMENT_TRUCK with a stop until 12:25 → ETA **≈ 17:35** if confirmed then. Meera confirms at 11:25, so the realised ETA is 17:50 (Example 3).
- Slack = −840 → **AT_RISK**, score 100. Range ± (5% of 1,250 = 62.5 + 20 pending = 82.5) → ±85. Confidence MEDIUM (pending report).
- Alert opens; `firstAtRiskAt = 11:10`; coordinator and customer notified.

Risk over time for SHP-1042: ON_TRACK (09:30, slack 220) → WATCH (10:30, slack 100) → AT_RISK (11:10, slack −840).

### Example 3 — Recovery (SHP-1042 at 11:25)
At 11:25 the truck has been stopped 15 min. C = 91, R = 179. I = 11:25 − 08:50 − 91 = **64** → GATE 40, HIST 7, DISR 2, RPT 15. Remaining stop 165.

| Option | Calculation | Predicted | Meets 18:00? | Cost (fictional) |
|---|---|---|---|---|
| NOTIFY_ONLY | 11:25 + 179 + 165 + 13 + 118 = 19:20 → WIN | Fri 08:00 | ✗ | ₹0 |
| REPLACEMENT_TRUCK | TRK-11 at Khopoli yard, 20 km away: travel 30 min + transfer 45 min → stop until 12:40. The load is stopped **≈ 90 min in total** (11:10–12:40), which is the journeys' "transfer ~90 min". E = 75 + 13.5 + 117.9 = 206.4 | **17:50** | ✓ | 3,000 + 20 km × 55 + 2,000 = **₹6,100** |
| SPLIT | Urgent 8 t from the plant: loading to 12:05; alternate route B_alt = 360 **[A]** at p = 0.97 → 371 min | ≈ 18:16 (urgent part) with this seed value; remainder Fri 08:00. The exact time is fixed by the seeded alternate route and the golden test | ✗ | Higher (second dispatch + 160 km) |
| REROUTE | Truck is stationary | — | Disabled: "Truck is stationary (breakdown)" | — |
| NEW_WINDOW | `newWindowEnd` = 19:20 rounded up = 19:30; with the override, the 19:20 road arrival is inside the window → WIN 0 | 19:20 (if the customer accepts) | ✓ against the new window 19:30; never auto-suggested | ₹0 |

**Suggested:** REPLACEMENT_TRUCK (only feasible option that meets the current promise).
**After choose (11:25):** truck → TRK-11, driver → the second seeded driver (D3). Predicted = 13:20 + 64 + (75 + 13 + 118) = **17:50** ✓ (now + R + E = 11:25 + 179 + 206). Slack 10 → **WATCH**. WIN disappears; its knock-on minutes are gone because the window is no longer missed. Alert → ACTION_CHOSEN; customer gets PLAN_UPDATED.
**Physical arrival 17:50** (inside 08:00–18:00) → eligible check-in 17:50 → `arrivedAt` = **17:50**, `onTime = true`, `delayMinutes = 0`, even if the replacement driver taps ARRIVED a few minutes later (L6). **Delivered 18:50** = 17:50 + 60 min unloading (Kestrel uses the seed default `unloadingMinutes = 60`); finishing after the 18:00 close is allowed because arrival was inside the window (L1). Total incurred vs plan = 17:50 − 08:50 − 270 = 270 min → GATE 40 (PLANT), HIST 20 (TRANSPORTER), DISR 120 (EXTERNAL), RPT 90 (TRANSPORTER). Because the shipment was on time, the but-for rule does not count anything against the transporter. **Warning lead time** for the replay = 18:00 − 11:10 = **6 h 50 min**.

### Example 4 — Fair attribution on historical shipments (but-for rule)
| Shipment | Delay beyond promise | Minutes by party (final) | delay − transporter | Counts against transporter? |
|---|---|---|---|---|
| H-1 | 50 | PLANT 70, TRANSPORTER 20 | 30 > 0 | **No** — still late without the transporter's minutes |
| H-2 | 15 | TRANSPORTER 30, EXTERNAL 10 | −15 ≤ 0 | **Yes** — on time without the transporter's minutes |
| H-3 | 0 | TRANSPORTER 25 | — | No — on time |
For a transporter with these three shipments: raw on-time = 1 of 3 (33.3%); fair on-time = 2 of 3 (66.7%) — H-1 is excluded from blame.

---

## 11. Determinism checklist for implementers
- No `Date.now()` or `Math.random()` inside engines; all time comes from `SimState`.
- Integer seconds and metres; one rounding rule (largest remainder) for display.
- Same per-segment baseline table for C, R and B.
- Projection and settle use the same HIST/DISR decomposition.
- Options use the same `projectEta` as the pipeline.
- Tests: architecture §20 (ET-1…ET-7, RK-1…RK-3, AT-1…AT-4, RC-1…RC-5, R1…R8, golden G0–G8). The worked examples above become unit tests with the seed's final values.

---

## 12. What the engine does not do
- No learned model, no statistical probability, no live traffic or weather data.
- No new risk factors beyond GATE, HIST, DISR, RPT, WIN.
- No automatic customer-facing action: every recovery needs the coordinator's confirmation.

---

## 13. Decision log

All items that were open in revision 0.1 are resolved by the locked decisions (architecture §0.1).

| # | Item | Resolution |
|---|---|---|
| 1 | Three-term vs four-term identity | **L3** — four terms; P = 0 without a reroute (§3) |
| 2 | Promise at arrival or delivery | **L1** — arrival at the receiving gate (§2, §4.5, §6) |
| 3 | NEW_WINDOW did not change receiving hours | **L4** — `Shipment.receivingWindowOverrideEndAt`; preview = execution (§6.1) |
| 4 | Overlap rules | **L5** — as in §4.3 |
| 5 | Waiting for a manual ARRIVED tap | **L6** — `physicalArrivalAt`; `arrivedAt` = eligible check-in; nothing booked for confirmation lag (§4.2) |
| 6 | Demo start time | **L2** — reset to Thu 10:25, paused (§9) |
| 7 | Hero "transfer ~90 min" vs 17:50 | Reconciled by calculation: total stoppage 11:10–12:40 ≈ 90 min = 15 min before the decision + 30 min travel + 45 min transfer → ETA 17:50 (Example 3) |

No engine decision remains open. Gates G-CO2 and G-LANG stay closed (L10).
