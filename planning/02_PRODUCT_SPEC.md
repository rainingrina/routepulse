# 02 — Product specification: RoutePulse

LYB Mumbai Hackathon 2026, Round 2, Problem Statement 3 (Order-to-Delivery Control Tower).
Version 0.2, 2026-11-12. Status: **approved; revision 0.2 aligns terminology with the locked decisions L1–L10** (`04_TECH_ARCHITECTURE.md` §0). No requirement or acceptance criterion was removed; wording changed only where a locked decision required it (arrival-based promise, four-term ETA, demo reset at 10:25, NEW_WINDOW receiving override).
Inputs: `planning/IDEA_HUNT.md` (§7 decision record), problem-statement PDF.
Out of scope for this document: technical architecture, data schema, API design, code. Those come after review.

Labels: **[A]** assumption, stated in the demo if a judge asks · **[G]** gated: ships only after a named check passes · **P0/P1/P2** priority.

---

## 1. Product in one paragraph

RoutePulse is a web app for Plant X, a fictional polymer producer. It tracks bulk orders from the plant gate to the customer. For every live shipment it calculates an ETA and a delay-risk level from a small set of named factors, and shows how many minutes each factor adds. When a shipment becomes at risk, it alerts the coordinator and the customer, and it offers recovery options that compare time, cost and (once verified) CO₂e. Every delay minute is attributed to a party — plant, transporter, customer or external — so transporters are scored only on what they control. A replay shows when the risk first became visible, and a disruption simulator lets the coordinator test how the network responds to an event.

**Tagline:** Know it will be late hours before it is — know why, and fix it.

---

## 2. User, decision, action

| | Lead user: logistics coordinator |
|---|---|
| **User** | The Plant X dispatch coordinator who watches 10–20 live outbound shipments on a shift **[A]**. |
| **Decision** | "Which shipment needs me now, why, and which recovery action do I take?" |
| **Action** | Picks a recovery action (reroute, split, replacement truck, agree new window, or notify only). The customer is informed with the new plan. |

Supporting roles (one line each in the pitch):
- **Customer** (a plastics converter's buyer): learns about the risk early, in plain language, with the proposed fix, and can respond.
- **Transporter / driver**: updates milestones and reports problems in seconds from a phone; delays they did not cause are not counted against them.

**Outcome chain:** coordinator sees risk early → chooses a recovery action → the customer is told before the promised time and can re-plan → fewer surprise late deliveries and fairer transporter scores.
Nothing in this chain is measured on real users. The demo shows the chain on fictional data and says so.

---

## 3. Scope

### 3.1 In scope
| ID | Feature | Priority | Est. person-hours [A] |
|---|---|---|---|
| M1 | Three roles with separate logins and data access | P0 | 2 |
| M2 | Interactive map with shipments, routes and status milestones | P0 | 4 |
| M3 | ETA and delay-risk engine with per-factor explanation | P0 | 4 |
| M4 | Alerts to coordinator and customer with suggested recovery action | P0 | 3 |
| M5 | Dashboard: on-time % and delay causes by route and transporter | P0 | 3 |
| — | Fictional seed data + demo clock + one-click demo reset | P0 | 3 |
| X2 | Explainable ETA breakdown (waterfall) | P0 (it *is* M3's explanation) | incl. in M3 |
| X3 | Recovery decision cards (time, cost; CO₂e [G]) | P0 (it *is* M4's suggested action) | 2 |
| F1 | Fair delay attribution by party | P1 | 2 |
| F2 | Driver problem reporting by typed input + quick-pick reasons | P1 | 1.5 |
| F3 | Structured delay-reason confirmation (driver, then coordinator) | P1 | 1.5 |
| X4 | Disruption simulator | P1 | 2.5 |
| X1 | Historical risk replay | P1 | 2.5 |
| S1 | CO₂e on recovery cards | P1 [G-CO2] | 1 |
| S2 | Verified second-language message templates | P2 [G-LANG] | 1 |
| — | Visual polish, accessibility pass, empty/loading/error states | P0 (continuous) | 4 |

Total ≈ 39 person-hours against ~30 available **[A]**. The cut order in §3.3 closes the gap.

### 3.2 Out of scope (team decision, binding)
- Real GPS, telematics, SIM tracking or FASTag data.
- Any live traffic or weather API.
- Trained ML models, or any claim that the prediction is learned.
- Voice recognition in the main demo.
- Chatbot, gate slot booking, invoice/POD upload — until M1–M5 pass every acceptance criterion in §6.
- Real email, SMS or WhatsApp sending. Alerts are in-app. The UI may say "in a pilot this is also sent by email/SMS".

### 3.3 Cut order if time runs short
Cut in this order; each step keeps M1–M5 intact:
1. S2 (second language).
2. X1 replay → replaced by a static "first at risk at HH:MM" line on the shipment panel.
3. X4 simulator → replaced by one pre-seeded disruption that starts on a demo-clock trigger.
4. F2/F3 typed reporting → driver can still update milestones; one seeded confirmed report.
5. F1 → dashboard shows causes by reason only, without the "fair score" column.

### 3.4 On hold (do not build; recorded so they are not lost)
| Item | Why it is on hold |
|---|---|
| Rest-aware ETA (driver legal rest) | Strong inclusion idea, but not approved; adds a model to defend |
| Customer inventory runway / co-decision | Direction 2; feasibility question in Q&A |
| Eco-wait consolidation | Workflow complexity |
| "Where is my order?" chatbot | Bonus; only after M1–M5 pass |
| Gate slot booking | Bonus |
| Invoice / POD upload | Bonus |
| Voice input for drivers | Demo risk |
| LLM-assisted reason classification | Optional enhancement behind a switch, only with the keyword fallback in place |

### 3.5 Feature stop
Feature stop at **build hour 15** of 20. After that: fixes, accessibility, visual polish, rehearsal only.

---

## 4. Roles and access

Login is email + password with seeded fictional accounts. All emails use the reserved `.test` domain.

| Capability | Coordinator | Customer | Transporter / driver |
|---|---|---|---|
| See all shipments | Yes | Own company's orders only | Own assigned shipments only |
| See map | All shipments | Own shipments | Own route and next stop |
| See ETA, risk level, factor breakdown | Full breakdown | Plain-language summary + top reason | ETA and next milestone only |
| See driver name / phone | Yes | No (transporter name only) | Own profile |
| See other customers' data | Yes | **Never** | **Never** |
| Update milestones | Yes (override, logged) | No | Yes (own shipments) |
| Report a problem | Yes (on behalf, logged) | No | Yes |
| Confirm delay reason / attribution | Yes | No | Confirms own report's reason |
| See and choose recovery options | Yes | Sees proposed / chosen option; can respond | Sees resulting instruction |
| Dashboard | Full | Own on-time record only (P2) | Own transporter scorecard (P2) |
| Disruption simulator, demo clock, reset | Yes | No | No |

Access is enforced on the server, not only hidden in the UI **(AC-M1.4)**.

---

## 5. Functional specification

### 5.1 Fictional world and seed data [A]
All names and companies are fictional. Real Indian city locations are used only as map geography.
- **Plant X**: one plant, location in the Mumbai metropolitan region **[A]**. Two gates, three loading bays.
- **Product**: polyolefin grades (e.g. "PX-PP 110", "PX-HD 520" — fictional codes), shipped bagged on full trucks of 20–25 t **[A]**.
- **Customers**: 5–6 fictional converters in Pune, Nashik, Surat, Ahmedabad, Indore, Nagpur **[A]**. Each has receiving hours (e.g. 08:00–18:00).
- **Lanes**: one per customer city, each with a primary route and, where plausible, one alternate route. Route lines are pre-computed once and stored with the seed.
- **Transporters**: 5 fictional companies, from a 4-truck owner-operator to a 60-truck fleet.
- **History**: ~150–200 delivered shipments over the last 60 days, generated by a deterministic seed with stated delay distributions per lane, transporter and party. These drive M5 and the transporter-history factor.
- **Live**: ~12 shipments at mixed stages at demo start, including one scripted "hero" shipment (§3 of the journeys doc).
- **Rate card** for cost estimates: fixed dispatch charge + ₹/km by truck type, fictional values **[A]**.
- Every generated distribution and value is documented in a facts/assumptions file at build time.

### 5.2 Demo clock
- The app runs on a **simulated clock**, visibly labelled "Simulation time".
- Coordinator controls: pause, play, speed (1×, 10×, 60×), jump +1 h.
- Shipments move along their route lines according to the clock.
- **Reset demo** restores the seeded demo state in ≤ 5 s: deterministic seed, then the hero pre-script run through the real simulation engine up to **Thu 10:25**, clock **paused** (locked decision L2).
- Nothing in the demo depends on wall-clock time or an external network call.

### 5.3 Shipment milestones (M2)
Ordered milestones:
1. Order confirmed
2. Truck assigned
3. Reported at plant gate
4. Loading
5. Gate out
6. In transit (with named waypoints)
7. Arrived at customer (checked in at the customer's receiving gate — this is the moment the promise is measured against, L1)
8. Delivered (unloading complete; may finish after the receiving window closes if arrival was inside it)

Each milestone records: time (simulation), who recorded it (role + name), source ("driver app", "coordinator override", "seed").

### 5.4 ETA and delay-risk engine (M3, X2)

**Nature of the model.** Deterministic and rule-based. Each factor adds a number of minutes, has an owner party and a plain-language reason. No learned model. In a pilot, factor weights would be fitted on Plant X's real history; today they are hand-set and visible.

**ETA formula** (locked decision L3)
`ETA = Planned arrival + Incurred delay (I) + Plan change (P) + Expected future delay (E)`
- **ETA** = estimated arrival at the customer's receiving gate (L1).
- **Planned arrival** = planned departure + baseline transit of the primary route (fixed at planning).
- **I** = delay already experienced; **P** = extra baseline time after a reroute (0 if not rerouted); **E** = future extra time projected by the rules below. Equivalent form used by the engine: `ETA = now + remaining baseline transit + E` (proof in `08_ETA_AND_RISK_ENGINE.md` §3).

**Factors (v1)**
| Code | Factor | How minutes are calculated | Party |
|---|---|---|---|
| LANE | Baseline transit | Remaining baseline minutes of the current route (Σ segment length ÷ segment baseline speed). This is the baseline, not a delay. | — |
| GATE | Plant gate & loading wait | Before gate-out: trucks ahead in queue × typical loading time. After gate-out: actual recorded excess wait. | Plant |
| HIST | Transporter lane history | This transporter's median *controllable* delay on this lane, from history. | Transporter |
| DISR | Active disruption on route | Slowdown % × affected segment time, or closure wait / reroute difference. Set by the simulator or seed. | External (weather, closure) · Plant (gate congestion) · Transporter (breakdown) |
| RPT | Driver-reported issue | Default minutes per reason code, or the driver's estimate. Applied once the driver confirms the reason. | Per reason code (§5.8) |
| WIN | Customer receiving window | If the road arrival falls outside the applicable receiving window (the customer's hours, or this shipment's accepted override after a new window, L4), minutes until the window next opens. | Carried over: split across the parties whose delays pushed arrival outside the window, in proportion to their minutes. Shown as "Receiving window (knock-on)". Never attributed to the customer by default — a fixed receiving window is not a customer delay. |

**Uncertainty and confidence**
- ETA is shown with a range: ± (5% of remaining time + 30 min if the last update is older than 2 h + 20 min per unconfirmed report) **[A]**.
- Confidence: **High** (last update ≤ 1 h, no unconfirmed reports) · **Medium** (1–3 h, or an unconfirmed report) · **Low** (> 3 h without an update).
- The range and confidence are labelled as rule-based, not statistical.

**Risk level** from slack = promised arrival time − ETA **[A, thresholds configurable]**:
| Level | Rule | Shown as |
|---|---|---|
| On track | slack ≥ 120 min | Green + check icon + "On track" |
| Watch | 0 ≤ slack < 120 min | Amber + eye icon + "Watch" |
| At risk | slack < 0 (predicted to miss) | Red + warning icon + "At risk" |
| Late | promised time passed, not yet arrived | Dark red + clock icon + "Late" |

**Risk score** (for sorting only): `clamp(50 − slack_minutes ÷ 6, 0, 100)`.

**Recalculation triggers:** every milestone, driver report, reason confirmation, disruption start/end, recovery action, and every 30 simulated minutes.

**Snapshots:** each recalculation stores a snapshot: time, ETA, range, level, score and the factor list. Snapshots feed the replay (X1) and the impact indicators (§7).

**Explanation (X2):** a waterfall from "planned arrival" to "predicted arrival", one bar per factor, each with minutes, party and a one-line reason (e.g. "Ghat section slowed by heavy rain — +95 min — External"). The promised time is drawn as a line. The largest factor is named in the summary sentence.

### 5.5 Alerts (M4)
In-app notification centre for coordinator and customer.

| Trigger | Coordinator | Customer |
|---|---|---|
| Level changes to At risk | Alert with factor summary + recovery options | Plain-language alert + proposed action |
| Level changes to Watch | Badge on the shipment list (no pop-up) | Nothing |
| Recovery action chosen | Confirmation | Update: what Plant X is doing and the new ETA |
| Driver report submitted | Alert: "needs reason confirmation" | Nothing until the ETA changes level |
| Shipment returns to On track | Info | Info if they had received an At-risk alert |
| Arrived late (after the promise) | Info | Info with final delay and attributed cause |

Customer alert content (template-based, no generated text):
- Order and shipment reference.
- New estimated arrival with range.
- Main reason in plain words (no internal codes, no driver identity).
- Proposed action, labelled "Proposed — Plant X team confirming", or the chosen action.
- Response buttons: **Accept proposal** · **Prefer to wait** · **Request a call**. The response is shown to the coordinator.

No duplicate alert for the same shipment and level within one episode.

### 5.6 Recovery decision cards (X3)
Shown to the coordinator for any shipment at Watch or At risk.

Action types (generated only when feasible):
| Action | When offered | Effect if chosen |
|---|---|---|
| Reroute | An alternate route exists and avoids an active disruption | Shipment follows the alternate route line |
| Split shipment | A truck is free at the plant and the order has more than one line or > 10 t **[A]** | A new partial shipment is created from the plant with the urgent quantity |
| Replacement truck | Breakdown reported, a truck from the same or another transporter is free within reach | Load transfers; new truck continues |
| Agree new delivery window | Always | After customer acceptance: this shipment's promise and its receiving window move to the agreed window (the customer's default hours and the original promise are kept on record, L4); ETA, WIN, slack and risk recalculate; no cost |
| Notify only | Always (baseline for comparison) | No operational change; customer informed |

Each card shows:
- New ETA and range, and whether it meets the promise (yes/no).
- Time saved vs. "Notify only".
- Estimated extra cost in ₹ from the rate card, with "fictional rate card" label.
- CO₂e difference — **only if [G-CO2] has passed**; otherwise the field reads "CO₂e — method under verification" and is not counted in ranking.
- Constraints ("needs truck TRK-14, free at Bay 2 from 11:30").
- One card is marked **Suggested** by a fixed rule: among options that meet the *current* promise, the lowest cost; if none meets it, the smallest delay. "Agree new delivery window" and "Notify only" are never auto-suggested, because they change or miss the promise instead of meeting it. The rule is stated on the card.

Choosing a card requires a confirm step and records: who, when, which option, the alternatives shown. The coordinator can choose any card, not only the suggested one.

### 5.7 Disruption simulator (X4)
Coordinator-only panel, clearly labelled **"Simulation"**.

Event types:
| Event | Parameters | Effect |
|---|---|---|
| Heavy rain / slowdown | Region or route segment, slowdown %, duration | DISR factor on affected shipments |
| Road closure | Segment, duration | Wait or reroute required |
| Plant gate congestion | Extra minutes per truck, duration | GATE factor for queued trucks |
| Truck breakdown | Shipment, estimated repair time | DISR (Transporter) + replacement option |

On injection: affected route segments are highlighted on the map, all affected shipments recalculate, a summary shows "N shipments affected · M now at risk", and alerts fire per §5.5. Events can be ended early. Reset clears them.

### 5.8 Driver problem reporting and reason confirmation (F2, F3)
Driver screen, mobile-first.

1. Driver taps **Report a problem**.
2. Picks a quick reason chip, or types a short note, or both. Chips: Breakdown · Waiting at plant gate · Traffic jam · Road closed · Heavy rain · Documents / checkpost · Waiting to unload · Other.
3. Optional: "How long do you expect?" (30 min / 1 h / 2 h / 4 h+).
4. If text was typed, the app suggests a reason code from keywords and shows "Suggested: Breakdown — is this right?" The driver taps **Yes** or picks another.
5. The report is **driver-confirmed**: the RPT factor is applied immediately and shown as "Pending coordinator review".
6. The coordinator confirms or changes the reason and the party (**coordinator-confirmed**). Changes need a short note. Both steps are logged.

Reason code → party mapping (default; coordinator can override with a note):
| Reason code | Default party | Default minutes [A] |
|---|---|---|
| Breakdown | Transporter | 180 |
| Waiting at plant gate | Plant | 90 |
| Traffic jam | External | 60 |
| Road closed | External | 120 |
| Heavy rain | External | 60 |
| Documents / checkpost | Plant if documents missing at dispatch, else External | 60 |
| Waiting to unload | Customer | 90 |
| Other | Unassigned — needs coordinator | 60 |

The keyword classifier is a fixed word list (English, plus verified Hindi/Romanised Hindi terms if [G-LANG] passes). It shows which words matched. It never auto-confirms.

### 5.9 Fair delay attribution (F1)
- Every delay minute on a shipment that has arrived is attributed to one party: **Plant · Transporter · Customer · External · Unattributed**.
- Minutes come from confirmed factor events (gate wait actuals, confirmed reports, disruptions, receiving-window waits). Any remaining gap between actual and baseline is **Unattributed** and shown, not hidden.
- **Fair on-time rule** for transporters ("but-for" rule): a late shipment counts against the transporter only if it would have been on time without the transporter-attributed minutes.
- The coordinator can re-attribute minutes with a mandatory note; the change is logged and visible.
- Wording: "attributed to", never "fault" or "blame".

### 5.10 Dashboard (M5)
Coordinator view. Filters: period (last 7 / 30 / 60 days), lane, transporter.
- **KPIs:** on-time % (arrival ≤ agreed promise, L1) · shipments arrived · renegotiated count · median delay of late shipments · median warning lead time · proactive notice rate (§7).
- **On-time % by lane** and **by transporter** (bar charts, value labels on bars).
- **On-time trend** by week.
- **Delay causes:** minutes by party (stacked) and by reason code, filterable by lane and transporter.
- **Transporter table:** shipments · raw on-time % · fair on-time % (§5.9) · median delay · top attributed cause. The gap between raw and fair is highlighted for small transporters.
- Every chart has a text alternative (table toggle) and does not rely on colour alone.

### 5.11 Historical risk replay (X1)
On any live or delivered shipment:
- A timeline chart of predicted ETA (with range) against the promised time, across all snapshots.
- A scrubber; moving it updates the map position, risk level and factor waterfall to that moment.
- A marker **"First at risk"** at the first snapshot that reached At risk in the episode, with the lead time to the promise.
- Markers for events: milestones, driver reports, disruptions, recovery action chosen, customer notified.

### 5.12 Sustainability: CO₂e on recovery cards (S1) [G-CO2]
- Method: ISO 14083 / GLEC approach — emissions = tonne-km × road-freight intensity factor, plus empty-running km for any extra truck **[method to confirm in G-CO2]**.
- **Gate G-CO2:** a team member reads the primary GLEC v3.x / Smart Freight Centre India table, records one factor with its boundary (well-to-wheel), unit and page in the facts file, and resolves the 10× discrepancy noted in IDEA_HUNT §4.2. Until then, CO₂e is not displayed anywhere.
- When shown: CO₂e appears on each recovery card as a difference vs. "Notify only", with an info link to the formula and factor source.

### 5.13 Inclusion and accessibility
- **Driver interface:** works at 360 px width; tap targets ≥ 44 × 44 px; icon + text on every action; max two taps to report a common problem; large type (≥ 16 px body); works in bright light (contrast ≥ 4.5:1).
- **Coordinator and customer:** keyboard navigable; visible focus; risk never shown by colour alone (icon + label); charts have a table view; respects reduced-motion settings.
- **Language [G-LANG]:** English by default. A second language (Hindi suggested for drivers **[A]**) only for fixed UI strings and message templates that a team member has read and confirmed. No runtime machine translation.
- **Small transporters:** fair on-time score (§5.9) and visible attribution in their scorecard.

### 5.14 Audit log
Records, with time and user: logins, milestone changes and overrides, driver reports, reason confirmations and changes, attribution overrides, recovery choices (with alternatives shown), customer responses, simulator events, demo resets. Viewable by the coordinator per shipment.

---

## 6. Acceptance criteria

Format: **Given / When / Then**. Every criterion must be demonstrable on the seeded data. "Pass" means shown working in the app, not in code.

### M1 — Three separate roles
| ID | Criterion |
|---|---|
| AC-M1.1 | Given the seeded accounts, when a coordinator, a customer and a driver each log in, then each lands on a different role home screen (control tower / my orders / my trip). |
| AC-M1.2 | Given a customer is logged in, when they open the shipment list or map, then they see only shipments for their own company. |
| AC-M1.3 | Given a driver is logged in, when they open their trip view, then they see only shipments assigned to them. |
| AC-M1.4 | Given a customer is logged in, when they request another customer's shipment directly (e.g. by changing the ID in the URL), then access is refused and nothing of that shipment is shown. |
| AC-M1.5 | Given any role, when they log out, then protected screens are no longer reachable without logging in again. |
| AC-M1.6 | Given a customer views a shipment, then driver name and phone are not shown anywhere on the page. |

### M2 — Map with status milestones
| ID | Criterion |
|---|---|
| AC-M2.1 | Given live shipments, when the coordinator opens the map, then every live shipment is shown at its current position on its route line. |
| AC-M2.2 | Given the demo clock is playing, when simulation time advances, then in-transit markers move along their route lines. |
| AC-M2.3 | Given a shipment marker, then its risk level is shown by colour **and** icon/label. |
| AC-M2.4 | Given a shipment is selected, then a panel shows all 8 milestones with time, source and the current one highlighted. |
| AC-M2.5 | Given a driver marks the next milestone, then the coordinator's and the customer's views show the new milestone within one refresh cycle (≤ 5 s real time). |
| AC-M2.6 | Given a driver tries to skip a milestone (e.g. Delivered before Arrived), then the app refuses and explains why. |
| AC-M2.7 | Given the map, then the plant, the customer sites and any active disruption zones are visible and labelled. |

### M3 — ETA and delay risk with reasons
| ID | Criterion |
|---|---|
| AC-M3.1 | Given any live shipment, then it shows an ETA, an ETA range, a confidence level and a risk level. |
| AC-M3.2 | Given a shipment's breakdown, then planned arrival + the sum of factor minutes (incurred, plan change and expected) equals the displayed ETA (to the minute). |
| AC-M3.3 | Given each factor in the breakdown, then it shows minutes, party and a one-line plain reason. |
| AC-M3.4 | Given a disruption is injected on a shipment's route, when it recalculates, then a DISR factor appears and the ETA increases by that factor's minutes. |
| AC-M3.5 | Given slack crosses below 0, then the level changes to At risk at that recalculation and a snapshot is stored. |
| AC-M3.6 | Given no update for > 3 simulated hours, then confidence shows Low and the range widens per §5.4. |
| AC-M3.7 | Given the same seed and the same actions, when the demo is reset and repeated, then the same ETAs and levels result (deterministic). |
| AC-M3.8 | Given the explanation screen, then it states that the ETA is rule-based and links to the factor rules. |

### M4 — Alerts with suggested recovery action
| ID | Criterion |
|---|---|
| AC-M4.1 | Given a shipment changes to At risk, then the coordinator gets an alert within the same recalculation, showing the top factor and a link to recovery options. |
| AC-M4.2 | Given a shipment changes to At risk, then the customer gets an in-app alert with new ETA, plain reason and a proposed action labelled "Proposed — Plant X team confirming". |
| AC-M4.3 | Given an at-risk shipment, then at least two recovery cards are shown, always including "Notify only", each with new ETA, meets-promise yes/no, time saved and estimated cost. |
| AC-M4.4 | Given the recovery cards, then exactly one is marked Suggested and the rule behind it is displayed. |
| AC-M4.5 | Given the coordinator chooses a card and confirms, then the shipment plan changes accordingly (route, new partial shipment, or new window), the ETA recalculates, and the customer receives an update. |
| AC-M4.6 | Given the customer taps Accept / Prefer to wait / Request a call, then the coordinator sees that response on the shipment. |
| AC-M4.7 | Given a shipment stays At risk across several recalculations, then no duplicate alert is sent for the same episode. |
| AC-M4.8 | Given a recovery choice, then the audit log records who chose it, when, and which alternatives were shown. |

### M5 — Dashboard by route and transporter
| ID | Criterion |
|---|---|
| AC-M5.1 | Given the seeded history, then the dashboard shows overall on-time % and on-time % for each lane and each transporter. |
| AC-M5.2 | Given the dashboard, then delay causes are shown by party and by reason code, and can be filtered by lane and by transporter. |
| AC-M5.3 | Given a filter change, then all charts and KPIs update consistently (same filtered set). |
| AC-M5.4 | Given the transporter table, then it shows raw and fair on-time % side by side per §5.9. |
| AC-M5.5 | Given any chart, then a table view with the same numbers is available. |
| AC-M5.6 | Given a hand-picked lane in the seed, then the dashboard's on-time % matches a manual count from the seed data (checked once before the demo). |
| AC-M5.7 | Given a live shipment arrives at the customer during the demo, then the dashboard includes it after refresh. |

### Differentiators
| ID | Criterion |
|---|---|
| AC-X1.1 | Given a shipment that reached At risk, then the replay shows predicted ETA vs. promised time across snapshots, with a "First at risk" marker and lead time in hours and minutes. |
| AC-X1.2 | Given the scrubber moves, then map position, level and waterfall update to that snapshot. |
| AC-X2.1 | Given a shipment, then the waterfall runs from planned arrival to predicted arrival, one bar per factor, with the promise line shown. (Shares AC-M3.2/3.3.) |
| AC-X3.1 | Given a recovery option is infeasible (e.g. no free truck), then it is not offered, or it is shown disabled with the reason. |
| AC-X4.1 | Given the coordinator injects an event, then affected segments highlight, a "N affected · M at risk" summary appears, and alerts fire per §5.5. |
| AC-X4.2 | Given a non-coordinator, then the simulator panel is not available (UI and server). |
| AC-X4.3 | Given Reset demo, then all events, reports, choices and alerts return to the seeded demo state (Thu 10:25, paused) within 5 s. |

### Direction 3 elements
| ID | Criterion |
|---|---|
| AC-F1.1 | Given a shipment that arrived late, then its delay minutes are split by party, and any unexplained minutes show as Unattributed. |
| AC-F1.2 | Given a late shipment caused only by plant gate wait, then it does not lower the transporter's fair on-time %. |
| AC-F1.3 | Given the coordinator re-attributes minutes, then a note is required and the change appears in the audit log and the dashboard. |
| AC-F1.4 | Given a shipment that misses the receiving window only because of external and plant delays, then the overnight wait is attributed to External and Plant, not to the customer. |
| AC-F2.1 | Given the driver screen at 360 px width, when the driver reports "Waiting at plant gate" via a chip, then it takes ≤ 3 taps and no typing. |
| AC-F2.2 | Given a typed note "tyre puncture near Lonavala", then the suggested reason is Breakdown, the matched word is shown, and nothing is applied until the driver confirms. |
| AC-F3.1 | Given a driver-confirmed report, then the RPT factor appears in the ETA labelled "Pending coordinator review". |
| AC-F3.2 | Given the coordinator confirms or changes the reason/party, then the label changes to "Confirmed" and attribution updates. |

### Sustainability and inclusion
| ID | Criterion |
|---|---|
| AC-S1.1 | Given [G-CO2] has not passed, then no CO₂e number appears anywhere in the app. |
| AC-S1.2 | Given [G-CO2] has passed, then each recovery card shows CO₂e difference vs. Notify only, with a link to the formula and factor source. |
| AC-S2.1 | Given a second language is enabled, then every string in it is on a list signed off by a named team member; untranslated strings fall back to English. |
| AC-A11Y.1 | Given the risk level anywhere, then it is readable without colour (icon + text). |
| AC-A11Y.2 | Given the coordinator home, then all primary actions are reachable by keyboard with visible focus. |
| AC-A11Y.3 | Given text on any screen, then contrast is ≥ 4.5:1 (checked by tool on the main screens). |

---

## 7. Impact indicators

Computed by the app from its own snapshots and event log. Fictional data; the formulas are the claim, not the numbers.

| Indicator | Formula | Baseline (status quo) | Assumptions to state |
|---|---|---|---|
| **Warning lead time** | For each shipment that reached At risk: promised time − time of first At-risk snapshot. Report the median. | ≈ 0 h: per the brief, customers learn an order is late only after it already is. | Seeded factor patterns; real lead time depends on data freshness in a pilot. |
| **Proactive notice rate** | Late-or-at-risk shipments where the customer was alerted before the promised time ÷ all late-or-at-risk shipments. | ≈ 0% per the brief. | In-app alert counts as notice. |
| **Recovered shipments** | Shipments that were At risk, had a recovery action chosen, and arrived on time ÷ shipments that reached At risk. | Not measurable today. | Recovery effects are simulated. |
| **Fair-score correction** | Per transporter: fair on-time % − raw on-time %. | Raw score only. | Attribution rules in §5.8–5.9. |

Pilot extension (say, do not build): compare warning lead time and on-time % for 4–6 weeks on 1–2 real lanes against the prior period.

---

## 8. Responsible AI, data and security

**Where AI is used and not used (product):**
| Function | Method | AI? |
|---|---|---|
| ETA and risk | Deterministic factor rules | No |
| Explanation | Direct read-out of the factor rules | No |
| Recovery options and Suggested label | Deterministic rules + fictional rate card | No |
| Reason suggestion from typed note | Fixed keyword list, matched words shown | No (an optional LLM suggestion may be added behind a switch, with keyword fallback, P2) |
| Customer messages | Fixed templates | No |

**Generative AI used in building:** declared in the presentation and README (ideation, planning documents, code assistance — to be completed honestly by the team). Every member must be able to explain every rule above.

**Controls:**
- Human review: no recovery action executes without the coordinator's confirm step; driver reports need coordinator confirmation before attribution is final.
- Confidence: every ETA shows a range and a confidence level with its rule.
- Privacy: customers never see driver identity or other customers' data; access enforced on the server; seed contains no real personal data; `.test` emails only.
- Auditability: §5.14.
- Honesty in wording: "estimated", "predicted (rule-based)", "attributed to". Never "AI-predicted", "guaranteed", "fault" or "blame".

---

## 9. Non-functional requirements
| Area | Requirement |
|---|---|
| Offline demo | The main demo path makes no external network call. Map tiles are served locally **[technical choice in architecture doc]**. |
| Determinism | Same seed + same actions → same results. One-click reset ≤ 5 s. |
| Performance | Coordinator home and dashboard load in ≤ 2 s on the demo laptop with the seed. |
| Responsiveness | Driver UI at 360 px; coordinator UI at 1280–1920 px; customer UI both. |
| Visual quality | One consistent design system; no raw browser dialogs; designed empty, loading, error and "conflict" states (e.g. a recovery option that became infeasible). |
| Browser | Latest Chrome on the demo laptop is the target; one other browser checked once. |

---

## 10. Wording rules
| Use | Avoid |
|---|---|
| "Estimated arrival", "predicted (rule-based)" | "AI predicts", "guaranteed ETA" |
| "Attributed to the plant / transporter / customer / external" | "Fault", "blame", "caused by the driver" |
| "At risk of missing the promised time" | "Will be late" (before it is) |
| "Simulation", "fictional" on simulator and seed-driven views | Anything implying live data |
| "Proposed — Plant X team confirming" | "Your order will be split" (before the coordinator confirms) |

---

## 11. Gates before items reach the screen
| Gate | Check | Owner | By |
|---|---|---|---|
| G-CO2 | One verified road-freight factor with source, boundary and unit | Team | Before build hour 12, else S1 is cut |
| G-LANG | Named team member signs off every second-language string | Team | Before feature stop, else S2 is cut |
| G-DAY1 | IDEA_HUNT §7.6 go/no-go gate | Team | Build hour 5 |

---

## 12. Open questions for the team
1. Which second language, if any, can a team member read and verify? (Hindi assumed for drivers.)
2. Confirm the Plant X map location and the customer cities in §5.1.
3. Confirm thresholds in §5.4 (Watch at < 120 min slack).
4. Who presents, and on which laptop will the demo run? (Affects offline map setup.)
5. Should the customer's response buttons (Accept / Prefer to wait / Request a call) stay P0 inside M4, or move to P1?
