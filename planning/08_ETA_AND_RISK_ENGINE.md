# 08 — ETA and risk engine: RoutePulse

Version 0.1, 2026-11-12. Status: **draft for team review.**
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
| Ping interval (autopilot) | 30 min | Architecture §9.3 |
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
| Arrival tolerance | within 2 km of route end | Architecture §19 issue 16 |
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
| `promisedBy` | The **agreed** promise (D4). Starts as the order's promise; moves only when a NEW_WINDOW is accepted |
| ETA / predicted arrival | Predicted arrival at the customer (architecture §10.1; arrival vs delivery is **[OPEN]** §13 item 2) |

---

## 3. The identity

The approved identity is:

```
Predicted ETA = Planned arrival + Incurred delay + Expected future delay
```

It holds exactly, to the minute, for every shipment that has **not been rerouted**.

After a REROUTE, the current route has a different baseline than the planned (primary) route. Architecture 0.2 (§10.2) therefore carries a fourth, separately labelled term:

```
Predicted ETA = Planned arrival + Incurred (I) + Plan change (P) + Expected (E)
P = B(current route) − B(primary route)   (0 unless rerouted)
```

**[OPEN — §13 item 1]** This is a conflict between the three-term wording in this request and the approved architecture. This document follows the approved architecture: P is shown as its own "Plan change" bar, and the three-term identity is the special case P = 0. If the team prefers strictly three terms, P can be displayed inside "Expected future delay" with the label "Longer route"; the arithmetic does not change.

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
| Holding at the destination, outside receiving hours | Δ | WIN · knock-on split (§6) |
| Holding at the destination inside receiving hours, waiting for a manual ARRIVED tap | Δ | UNATTRIBUTED · "Awaiting arrival confirmation" **[INTERPRETATION — §13 item 5]** |
| After ARRIVED (unloading) | 0 for the promise | Customer "waiting to unload" reports are recorded for information |

The two moving terms add up: `Δ·s + Δ(1−s)(1−p) = Δ − Δ·p(1−s)`. The same split is used in the projection (§5), so expected minutes become identical incurred minutes when the future happens as projected.

### 4.3 Overlapping causes [INTERPRETATION — §13 item 4]
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
- `delayMinutes = max(0, arrivedAt − promisedBy)`; `onTime = arrivedAt ≤ promisedBy` (agreed promise, D4).
- Ledger rows become FINAL. A GAP row (UNATTRIBUTED) records any difference between `delayMinutes` and the attributed minutes beyond the promise; in the simulation it is normally 0.
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

### 5.1 Historical transporter performance (HIST) and proration (D6)
- **Pace** `p` for (transporter, lane) comes from delivered history: `r` = median over those shipments of (TRANSPORTER-attributed TIME_LOST seconds ÷ baseline seconds); `p = 1 ÷ (1 + r)`, clamped to `[0.80, 1.00]`. Fallbacks in §1.
- **Proration:** HIST applies only to the **remaining** baseline time: `E_HIST = Σ over remaining pieces b·(1/p − 1) = R·r` when no slowdown applies.
- Examples with `r = 0.0753` (p = 0.93) on a 270-minute route:

| Remaining baseline R | Expected HIST |
|---|---|
| 270 (at gate-out) | 20.3 → 20 min |
| 214 | 16.1 → 16 min |
| 135 (halfway) | 10.2 → 10 min |
| 0 (arrived) | 0 |

- The simulation moves trucks with the **same** `p`, so the projection and the movement agree. History is generated by the seed to match the designed paces **[A]**.

---

## 6. Receiving-window constraint and knock-on split

- Receiving hours come from `Customer.receivingOpenMin` / `receivingCloseMin` in local time (Asia/Kolkata).
- If the projected arrival is outside the window, WIN extra = minutes until the window next opens.
- **Split (spec §5.9, AC-F1.4):** WIN minutes are divided across parties in proportion to each party's other minutes on the shipment (I + P + E, excluding WIN). Rounded with largest remainder. If no other minutes exist → UNATTRIBUTED. **Never to the customer by default.**
- The same split applies when WIN time is actually incurred (truck holding at the destination).

### 6.1 Renegotiated windows (NEW_WINDOW)
- The coordinator offers a new promise (`newWindowEnd`); the option becomes AWAITING_CUSTOMER. On the customer's ACCEPT_PROPOSAL: `promisedBy = newWindowEnd`, `renegotiated = true`, `originalPromisedBy` kept.
- The prediction is **not** changed by a new promise — only slack, level and score change.
- **[OPEN — §13 item 3]** Journeys J5 describe NEW_WINDOW as "accept 19:30 receiving". The approved schema stores only a new promise, not a change to the customer's receiving hours. If receiving still closes at 18:00, a 19:20 arrival still triggers WIN and the new promise is still missed. Proposal: add a per-shipment receiving-close override (one nullable column on `Shipment`) set together with the new promise. This needs your approval because it changes the approved schema.

---

## 7. Risk engine

### 7.1 Inputs and output
The risk engine consumes only the projection result and the promise. It introduces **no factors beyond GATE, HIST, DISR, RPT and WIN**, and applies **no weights** to them: each factor contributes exactly its minutes. "Weight" in this engine means the minutes rule of each factor (§4–§6); there is no separate weighting layer.

| Output | Rule |
|---|---|
| Slack | `promisedBy − predictedArrival` (minutes) |
| Level | ON_TRACK ≥ 120 · WATCH 0–119 · AT_RISK < 0 · LATE when `now > promisedBy` and not arrived |
| Score | `clamp(round(50 − slack ÷ 6), 0, 100)` — sorting only; never shown as a probability |
| Range | ± (5% of minutes to predicted arrival + 30 if last update > 2 h + 20 per pending report), rounded to the nearest 5 min |
| Confidence | HIGH / MEDIUM / LOW from data freshness and pending reports |
| Summary | Names the largest factor: "At risk: +180 min breakdown is the largest factor" |

### 7.2 Confidence and uncertainty — how they are shown
- The ETA is always shown with its range ("17:50 ± 25 min") and a confidence chip with the reason ("Medium — driver report pending review").
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
| **NEW_WINDOW** | Always | Prediction unchanged; promise moves on acceptance | None | No cost; customer must agree; counted as renegotiated (D4) |
| **NOTIFY_ONLY** | Always | Unchanged | None | Baseline for comparison |

**Suggested** (AC-M4.4): among feasible options that meet the current promise, excluding NEW_WINDOW and NOTIFY_ONLY, the lowest cost; ties → earliest ETA. If none meets the promise, the feasible option with the smallest delay (same exclusions). If none is feasible, nothing is suggested.

---

## 9. Simulation rules (summary)

| Topic | Rule (architecture §9) |
|---|---|
| Grid | State moves forward on 5-minute boundaries; movement and ledger are computed by `settleTo(t)`, split at boundaries and disruption edges |
| Actions between boundaries | Stamped to the whole minute; `settleTo(actionTime)` first; the grid never shifts; splits are exact (integer metres + carry) |
| Pause / play | Pause keeps `simTime` (no snapping); play resumes without a jump |
| Speed | 1× / 10× / 60×; changing speed first settles at the old speed |
| Advance | `ADVANCE n` and `ADVANCE_TO t` pause implicitly and process every boundary in order; `ADVANCE 60` ≡ 12 × `ADVANCE 5` |
| Reset | Truncate + deterministic reseed + hero pre-script (start time **[OPEN]**, architecture §19 issue 18) |
| Background shipments (D7) | Autopilot: AT_GATE at `plannedGateAt`, LOADING by bay availability, GATE_OUT when loaded and not before `plannedDepartureAt`, ARRIVED at the exact crossing minute, DELIVERED after unloading |
| Hero shipment (D7) | Manual: driver taps AT_GATE, GATE_OUT, ARRIVED, DELIVERED. LOADING is always recorded by the simulation (plant activity). The truck holds at the destination until the ARRIVED tap |
| Pings | Autopilot pings every 30 min unless seeded silent; driver actions also count |
| Long gap | > 12 boundaries in one tick → process 12, pause, show `simError` |

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
| Transporter pace p | 0.93 (r = 0.0753) |
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
- Provisional arrival = 11:10 + 179 + 311 = **19:20** → after the 18:00 close.
- E_WIN = 19:20 → Fri 08:00 = **760**. Other minutes by party: PLANT 40; TRANSPORTER 7 + 180 + 13 = 200; EXTERNAL 2 + 118 = 120; total 360. Split: PLANT 84.4, TRANSPORTER 422.2, EXTERNAL 253.3 → largest remainder → **85 / 422 / 253**.
- Predicted = 13:20 + 49 + (180 + 13 + 118 + 760) = 13:20 + 1,120 min = **Fri 08:00** ✓.
- Slack = −840 → **AT_RISK**, score 100. Range ± (5% of 1,250 = 62.5 + 20 pending = 82.5) → ±85. Confidence MEDIUM (pending report).
- Alert opens; `firstAtRiskAt = 11:10`; coordinator and customer notified.

Risk over time for SHP-1042: ON_TRACK (09:30, slack 220) → WATCH (10:30, slack 100) → AT_RISK (11:10, slack −840).

### Example 3 — Recovery (SHP-1042 at 11:25)
At 11:25 the truck has been stopped 15 min. C = 91, R = 179. I = 11:25 − 08:50 − 91 = **64** → GATE 40, HIST 7, DISR 2, RPT 15. Remaining stop 165.

| Option | Calculation | Predicted | Meets 18:00? | Cost (fictional) |
|---|---|---|---|---|
| NOTIFY_ONLY | 11:25 + 179 + 165 + 13 + 118 = 19:20 → WIN | Fri 08:00 | ✗ | ₹0 |
| REPLACEMENT_TRUCK | TRK-11 at a yard 20 km away: travel 30 min + transfer 45 min → stop until 12:40; E = 75 + 13.5 + 117.9 = 206.4 | **17:50** | ✓ | 3,000 + 20 km × 55 + 2,000 = **₹6,100** |
| SPLIT | Urgent 8 t from the plant: loading to 12:05; alternate route B_alt = 360 [A] at p = 0.97 → 371 min | ≈ 18:16 (urgent part); remainder Fri 08:00 | ✗ | Higher (second dispatch + 160 km) |
| REROUTE | Truck is stationary | — | Disabled: "Truck is stationary (breakdown)" | — |
| NEW_WINDOW | Prediction unchanged; promise would move | Fri 08:00 (see §6.1 open item) | Only with a new promise | ₹0 |

**Suggested:** REPLACEMENT_TRUCK (only feasible option that meets the current promise).
**After choose (11:25):** truck → TRK-11, driver → the second seeded driver (D3). Predicted = 13:20 + 64 + (75 + 13 + 118) = **17:50** ✓ (now + R + E = 11:25 + 179 + 206). Slack 10 → **WATCH**. WIN disappears; its knock-on minutes are gone because the window is no longer missed. Alert → ACTION_CHOSEN; customer gets PLAN_UPDATED.
**Arrival 17:50:** `onTime = true`, `delayMinutes = 0`. Total incurred vs plan = 17:50 − 08:50 − 270 = 270 min → GATE 40 (PLANT), HIST 20 (TRANSPORTER), DISR 120 (EXTERNAL), RPT 90 (TRANSPORTER). Because the shipment was on time, the but-for rule does not count anything against the transporter. **Warning lead time** for the replay = 18:00 − 11:10 = **6 h 50 min**.

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

## 13. Items needing a team decision

| # | Item | Status | Proposal |
|---|---|---|---|
| 1 | Three-term identity in this request vs four-term identity (with P after REROUTE) in approved architecture §10.2 | **OPEN** | Keep four terms internally; P = 0 unless rerouted. Optionally display P inside "Expected" labelled "Longer route". |
| 2 | Promise measured at arrival or at delivery (architecture §19 issue 19) | **OPEN** (carried over) | Arrival |
| 3 | NEW_WINDOW changes the promise but not receiving hours (J5 implies extended receiving) | **OPEN** | Add one nullable `Shipment.receivingCloseOverrideAt`, set with the new promise |
| 4 | Overlap rules in §4.3 (latest-ending stop binds; largest slowdown wins) | **INTERPRETATION** — confirm | As written |
| 5 | Manual hero truck waiting at destination before the ARRIVED tap | **INTERPRETATION** — confirm | Book as UNATTRIBUTED "Awaiting arrival confirmation"; presenter taps promptly; golden test taps at the exact arrival minute |
| 6 | Demo start time (architecture §19 issue 18) | **OPEN** (carried over) | Reset to 10:25 via the hero pre-script |
| 7 | Hero numbers here (rain s = 0.65 for 8 h, transfer 75 min) differ slightly from the journeys' indicative "transfer ~90 min" | **INFO** | Journeys were indicative; these values reproduce the journeys' 14:20 / 16:20 / 19:20 / 17:50 timeline |
