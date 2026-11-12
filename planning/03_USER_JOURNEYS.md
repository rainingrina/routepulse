# 03 — User journeys: RoutePulse

Version 0.1, 2026-11-12. Status: **draft for team review.**
Companion to `planning/02_PRODUCT_SPEC.md`. Section references like §5.6 point to the spec. AC-IDs point to spec §6.

All people, companies, trucks and orders below are **fictional**. City names are real geography only. Times are **simulation time**. Minute values are **indicative [A]**; the final values are fixed in the seed so that the demo is repeatable.

---

## 1. Personas (fictional)

| Persona | Role | Situation | What they need | Login (seed) |
|---|---|---|---|---|
| **Meera** | Plant X logistics coordinator (lead user) | Watches ~12 live outbound shipments per shift. Today learns about problems from phone calls. | One ranked view of what needs action, why, and a ready fix. | `coordinator@plantx.test` |
| **Arjun** | Purchase lead at *Kestrel Moulders*, a fictional converter in Pune | Runs injection-moulding lines on Plant X grades. A late truck can idle a line. | Early, plain-language warning with a proposed plan he can respond to. | `buyer@kestrel.test` |
| **Ramesh** | Driver for *Ghatline Carriers*, a fictional 4-truck owner-operator | Drives the Plant X → Pune lane. Uses a basic Android phone; prefers few words and big buttons. | Report a problem in seconds; not be blamed for delays he did not cause. | `driver.ramesh@ghatline.test` |
| **Ghatline owner** (supporting) | Small transporter | Scored by Plant X on on-time %. | A fair score. Appears through the dashboard, not as a separate login. | — |

---

## 2. Journey map overview

| # | Journey | Lead role | Mandatory items covered | Differentiators covered |
|---|---|---|---|---|
| J1 | Start of shift: triage the control tower | Coordinator | M1, M2, M3 | X2 |
| J2 | Disruption hits a lane | Coordinator | M3, M4 | X4, X2 |
| J3 | Driver reports a problem | Driver → Coordinator | M1, M2, M3 | F2, F3 |
| J4 | Customer is warned and responds | Customer | M1, M4 | — |
| J5 | Coordinator chooses a recovery action | Coordinator | M4 | X3, S1 [G-CO2] |
| J6 | Replay: when did we first know? | Coordinator | M3 | X1 |
| J7 | Review performance fairly | Coordinator | M5 | F1 |
| J8 | Delivery and close-out | Driver → all | M2, M5 | F1 |
| J9 | Demo reset | Coordinator (presenter) | — | X4 |

J2–J6 are one continuous **hero scenario** on shipment **SHP-1042**.

---

## 3. Hero scenario: SHP-1042

| Field | Value [A] |
|---|---|
| Order | ORD-7781, Kestrel Moulders, Pune · 22 t: 14 t PX-PP 110 + 8 t PX-HD 520 (fictional grades) |
| Transporter / truck | Ghatline Carriers · TRK-07 · driver Ramesh |
| Promise | Delivered by **Thu 18:00** · Kestrel receiving hours 08:00–18:00 |
| Route | Plant X → expressway → ghat section → Pune. Alternate route exists (longer, avoids ghat). |
| Baseline transit | ~4 h 30 min (lane median from history) |

Indicative timeline (simulation time):
| Time | Event | ETA | Slack | Level |
|---|---|---|---|---|
| 08:50 | Gate queue: 2 trucks ahead → GATE +40 min (Plant) | — | — | On track |
| 09:30 | Gate out | 14:20 (incl. HIST +20, Transporter) | 220 min | On track |
| 10:30 | **Simulator:** heavy rain on ghat section, DISR +120 min (External) | 16:20 | 100 min | **Watch** |
| 11:10 | **Driver report:** "tyre puncture near Lonavala" → Breakdown +180 min (Transporter) | 19:20 → arrives after 18:00 close → waits to Fri 08:00 (WIN, knock-on) | < 0 | **At risk** |
| 11:12 | Coordinator alert + customer alert with proposed action | | | |
| 11:20 | Arjun taps **Accept proposal** | | | |
| 11:25 | Meera confirms **Replacement truck** (TRK-11, Ghatline, free at Khopoli): transfer ~90 min | 17:50 | 10 min | Watch |
| 17:45 | Delivered | | +15 min early | Delivered on time |

Warning lead time for the replay (X1): 18:00 − 11:10 = **6 h 50 min** before the promise.
Whether Breakdown counts against Ghatline: the shipment was delivered on time, so nothing counts. The historical seed shows Ghatline's raw vs. fair on-time gap on the dashboard (J7).

---

## 4. Journeys

### J1 — Start of shift: triage the control tower
**Trigger:** Meera logs in at the start of the shift.
**Goal:** know in 10 seconds which shipments need attention.

| Step | Meera does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Logs in with coordinator account | Control tower home: map + shipment list sorted by risk score; "Simulation time Thu 08:45" label | AC-M1.1 |
| 2 | Scans the list | Each row: shipment, customer, lane, milestone, ETA ± range, level (colour + icon + label), confidence | AC-M3.1, AC-M2.3, AC-A11Y.1 |
| 3 | Clicks SHP-1042 | Side panel: 8 milestones (current highlighted), ETA waterfall, factor list with minutes, party, reason | AC-M2.4, AC-M3.2, AC-M3.3, AC-X2.1 |
| 4 | Hovers the GATE bar | "2 trucks ahead at Gate 1 · ~20 min each · +40 min · Plant" | AC-M3.3 |

**Success:** Meera can say which shipment is closest to its promise and why, without opening another tool.
**Edge states:** no live shipments → designed empty state; a shipment with no update for > 3 h → Low confidence and wider range (AC-M3.6).

---

### J2 — Disruption hits a lane
**Trigger:** in the demo, Meera injects an event; in a pilot this would come from a feed.
**Goal:** see the network's response at once.

| Step | Meera does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Opens **Simulation** panel | Panel labelled "Simulation"; event types listed | AC-X4.2 |
| 2 | Chooses "Heavy rain / slowdown", ghat section, 50% slower, 4 h | Segment highlighted on map | AC-X4.1, AC-M2.7 |
| 3 | Confirms | Summary: "3 shipments affected · 0 at risk · 1 now Watch". All affected shipments recalculate. | AC-X4.1, AC-M3.4 |
| 4 | Opens SHP-1042 | New DISR bar "+120 min · Heavy rain on ghat section · External". Level Watch (amber + eye icon). | AC-M3.4, AC-X2.1 |

**Success:** the impact of one event on every shipment is visible in one step.
**Edge states:** event on a segment with no shipments → "0 shipments affected"; ending the event early recalculates back.

---

### J3 — Driver reports a problem
**Trigger:** TRK-07 gets a tyre puncture near Lonavala.
**Goal:** Ramesh reports it in seconds; the ETA reflects it; the coordinator confirms the reason.

Driver screen (phone, 360 px):
| Step | Ramesh does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Opens app (already logged in) | "My trip" — SHP-1042, next stop, next milestone button, large **Report a problem** button | AC-M1.3, AC-F2.1 |
| 2 | Taps **Report a problem** | Reason chips with icons + text; text box; "How long?" chips | AC-F2.1 |
| 3 | Types "tyre puncture near Lonavala" | "Suggested: **Breakdown** — matched: *tyre*, *puncture*. Is this right?" | AC-F2.2 |
| 4 | Taps **Yes**, taps "2 h" | Report saved as driver-confirmed. "Plant X has been informed." | AC-F3.1 |

*Alternative path (fastest):* Ramesh taps the **Breakdown** chip directly → 2 taps, no typing.

Coordinator side:
| Step | Meera does | RoutePulse shows / does | AC |
|---|---|---|---|
| 5 | — | Alert: "SHP-1042 · driver report needs reason confirmation". ETA now includes RPT bar "+180 min · Breakdown · Transporter · Pending coordinator review". | AC-F3.1 |
| 6 | Opens report, confirms "Breakdown · Transporter" | Label changes to "Confirmed". Audit log entry. | AC-F3.2, AC-M4.8 |

**Success:** a problem that used to need a phone call is a structured, attributed delay in under a minute.
**Edge states:** text with no keyword match → "No suggestion — please pick a reason"; "Other" → party Unassigned until the coordinator sets it; coordinator changes the party → note required (AC-F1.3).

---

### J4 — Customer is warned and responds
**Trigger:** SHP-1042 crosses into At risk after the breakdown report (11:10).
**Goal:** Arjun learns early, in plain words, and can respond.

| Step | Arjun does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | — | In-app alert: "Order ORD-7781 is at risk of missing Thu 18:00." | AC-M4.2 |
| 2 | Opens alert | New estimate (with range); reason in plain words: "Vehicle breakdown on the route and heavy rain on the ghat section". No driver name, no internal codes. | AC-M1.6, AC-M4.2 |
| 3 | Reads proposed action | "Proposed — Plant X team confirming: replacement truck from Khopoli. Expected arrival ~17:50 Thu." | AC-M4.2 |
| 4 | Taps **Accept proposal** | "Thanks — Plant X will confirm shortly." | AC-M4.6 |
| 5 | Later receives update | "Plant X confirmed: replacement truck. New estimate 17:50 ± 25 min." | AC-M4.5 |

**Success:** Arjun knows ~7 hours before the promise and can plan his line, instead of finding out at 18:00.
**Edge states:** Arjun taps **Request a call** → coordinator sees "Customer requests a call"; Arjun tries to open another customer's order by URL → refused (AC-M1.4); shipment returns to On track → info message.

---

### J5 — Coordinator chooses a recovery action
**Trigger:** At-risk alert on SHP-1042.
**Goal:** compare options and act.

| Step | Meera does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Opens the alert | Recovery cards, side by side | AC-M4.1, AC-M4.3 |
| 2 | Compares | **Replacement truck** (Suggested): ETA 17:50, meets promise ✓, saves ~14 h vs Notify only, est. ₹ cost (fictional rate card). **Split shipment**: urgent 8 t on a new truck from the plant via the alternate route (avoids the ghat), loading + transit puts it at ~18:40 ✗, rest Fri 08:00, higher ₹ — shown so the judge sees why it is not suggested. **Agree new window**: needs customer to accept 19:30 receiving, ₹0, never auto-suggested. **Reroute**: shown disabled — "Truck is stationary (breakdown)". **Notify only**: arrives Fri 08:00 ✗. | AC-M4.3, AC-M4.4, AC-X3.1 |
| 3 | Reads the rule | "Suggested = meets current promise at lowest estimated cost." | AC-M4.4 |
| 4 | Sees Arjun's response | "Customer accepted the proposal at 11:20" | AC-M4.6 |
| 5 | Chooses Replacement truck → Confirm | Plan updated (TRK-11 assigned); ETA recalculates to 17:50; level Watch; customer update sent; audit log records the choice and the alternatives shown | AC-M4.5, AC-M4.8 |

CO₂e: if [G-CO2] has passed, each card also shows "CO₂e vs Notify only: +x kg" with a source link; Split shows the extra truck's emissions. If not, cards read "CO₂e — method under verification" (AC-S1.1/1.2).

**Success:** a decision in under a minute, with the trade-off visible and recorded.
**Edge states:** the Suggested option becomes infeasible before confirm (truck taken) → conflict state "TRK-11 is no longer free — options updated", no silent failure.

---

### J6 — Replay: when did we first know?
**Trigger:** Meera (or a judge) asks "how early did the system see this?"
**Goal:** show the warning lead time on screen.

| Step | Meera does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Opens **Replay** on SHP-1042 | Chart: predicted ETA (with range band) vs promised-time line across the day. Event markers: gate out, rain, breakdown report, alerts, recovery, delivery. | AC-X1.1 |
| 2 | Drags scrubber to 10:30 | Map shows truck before the ghat; level Watch; waterfall shows DISR appearing | AC-X1.2 |
| 3 | Drags to 11:10 | Marker **"First at risk · 6 h 50 min before promise"**; waterfall shows RPT and WIN bars | AC-X1.1, AC-X1.2 |
| 4 | Drags to 11:25 | ETA drops back under the promise line after the recovery action | AC-X1.2 |

**Success:** the core claim of the product — earlier warning — is shown, not asserted.

---

### J7 — Review performance fairly
**Trigger:** weekly review, or a judge asks "which transporter is worst?"
**Goal:** see on-time and causes by lane and transporter, with fair attribution.

| Step | Meera does | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Opens **Dashboard** (last 60 days) | KPIs: on-time %, delivered count, median delay, median warning lead time, proactive notice rate | AC-M5.1 |
| 2 | Looks at on-time by lane and by transporter | Bar charts with value labels; table toggle | AC-M5.1, AC-M5.5 |
| 3 | Filters lane = Pune | All charts update together; causes show ghat weather (External) and gate waits (Plant) as the top two | AC-M5.2, AC-M5.3 |
| 4 | Opens transporter table | Ghatline: raw on-time % vs **fair on-time %** side by side; the gap is highlighted with "Most late minutes on this lane were attributed to plant gate waits and weather" | AC-M5.4, AC-F1.2 |
| 5 | Opens one late historical shipment | Delay split by party, including any Unattributed minutes | AC-F1.1 |

**Success:** Meera sees that the plant's own gate is a top delay cause, and that a small transporter's score was unfair. This is the insight a generic dashboard hides.
**Edge states:** filter with no shipments → empty state, not a broken chart.

---

### J8 — Delivery and close-out
**Trigger:** the replacement truck arrives in Pune.

| Step | Actor | RoutePulse shows / does | AC |
|---|---|---|---|
| 1 | Driver taps **Arrived**, then **Delivered** | Milestones update; skipping a step is refused with a reason | AC-M2.5, AC-M2.6 |
| 2 | Customer | "Delivered 17:45 — on time" | AC-M2.5 |
| 3 | Coordinator | Shipment moves to delivered; dashboard includes it after refresh | AC-M5.7 |

---

### J9 — Demo reset
**Trigger:** before each rehearsal and before the live demo.

| Step | Presenter does | RoutePulse does | AC |
|---|---|---|---|
| 1 | Coordinator → Simulation → **Reset demo** → confirm | Restores seed: clock Thu 08:45, all events, reports, choices and alerts cleared | AC-X4.3 |
| 2 | Repeats the hero run | Same ETAs and levels as last time | AC-M3.7 |

---

## 5. Live demo run-sheet (~4 minutes)

Set-up: three browser windows side by side — coordinator (large), customer (medium), driver (phone-size, 360 px). All logged in. Demo reset done. Clock paused at Thu 08:45. No network needed.

| Time | Window | What we show | Line we say (draft) | Criterion it serves |
|---|---|---|---|---|
| 0:00–0:25 | Coordinator | Control tower: map, 12 shipments, levels with icons. Click SHP-1042 → waterfall. | "Every shipment has an ETA you can read: each bar is a reason, in minutes." | M2, M3, UX |
| 0:25–0:55 | Coordinator | Simulation → heavy rain on ghat. "3 affected · 1 Watch". | "One event, and the whole network re-scores." | X4, Innovation |
| 0:55–1:25 | Driver | Report a problem → type "tyre puncture near Lonavala" → Suggested: Breakdown → Yes. | "Two taps or one sentence. No phone call." | M1, F2, F3, Inclusion |
| 1:25–1:50 | Customer | At-risk alert with plain reason + proposed action → Accept. | "Arjun knows at 11:10, not at 18:00." | M4, user value |
| 1:50–2:40 | Coordinator | Confirm breakdown reason. Recovery cards: Suggested replacement truck, Split, disabled Reroute with reason, Notify only. Confirm. | "Every option shows time and cost. The rule for 'Suggested' is on the card. A person decides." | M4, X3, Responsible AI |
| 2:40–3:10 | Coordinator | Replay: drag to 11:10 → "First at risk · 6 h 50 min before promise". | "This is our impact measure: warning lead time." | X1, Impact |
| 3:10–3:50 | Coordinator | Dashboard → Pune lane → Ghatline raw vs fair on-time. | "Most of this transporter's late minutes were our own gate and the weather. Fair score: transporters are judged on what they control." | M5, F1, Inclusion |
| 3:50–4:00 | — | Close on dashboard KPIs. | "Rule-based, explainable, and every decision is logged." | Presentation |

Fallbacks during the demo:
- A window is not responding → reload; state is server-side.
- Anything inconsistent → Reset demo (≤ 5 s) and resume from the last step.
- Laptop fails entirely → pre-recorded run on a second device (shown only if the live demo cannot continue).

---

## 6. Screen inventory

| Screen | Role(s) | Journeys |
|---|---|---|
| Login | All | J1, J3, J4 |
| Control tower (map + risk-sorted list) | Coordinator | J1, J2 |
| Shipment panel (milestones, ETA waterfall, factors, audit) | Coordinator (full), Customer (summary) | J1, J3, J5 |
| Recovery cards | Coordinator | J5 |
| Replay | Coordinator | J6 |
| Simulation panel (events, clock, reset) | Coordinator | J2, J9 |
| Driver report review | Coordinator | J3 |
| Dashboard | Coordinator | J7 |
| Notification centre | Coordinator, Customer | J3, J4, J5 |
| My orders (list + map) | Customer | J4, J8 |
| Order detail + alert response | Customer | J4 |
| My trip | Driver | J3, J8 |
| Report a problem | Driver | J3 |

---

## 7. Coverage check: every mandatory item has a journey and acceptance criteria

| Mandatory item | Journeys | Acceptance criteria |
|---|---|---|
| M1 Three roles | J1, J3, J4 | AC-M1.1 – AC-M1.6 |
| M2 Map + milestones | J1, J2, J8 | AC-M2.1 – AC-M2.7 |
| M3 ETA + risk + reasons | J1, J2, J3, J6 | AC-M3.1 – AC-M3.8 |
| M4 Alerts + suggested action | J4, J5 | AC-M4.1 – AC-M4.8 |
| M5 Dashboard by route and transporter | J7, J8 | AC-M5.1 – AC-M5.7 |

---

## 8. Questions for the team on these journeys
1. Is three side-by-side windows workable on the demo laptop's screen, or do we need a presenter role switcher (clearly labelled demo-only)?
2. Are the fictional names (Kestrel Moulders, Ghatline Carriers, Ramesh, Meera, Arjun) acceptable? A quick check that they do not match a real Pune or Maharashtra company is still needed.
3. Is a 6 h 50 min lead time in the hero run believable to LYB judges, or should the scenario be tighter?
