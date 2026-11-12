# IDEA_HUNT — PS3 Order-to-Delivery Control Tower

LYB Mumbai Hackathon 2026, Round 2. Written 2026-11-12. Method: hackathon-playbook `references/ideas.md` (Phase 1), scaled to a 20-hour build.

> **Status: LOCKED on 2026-11-12.** Direction 1 ("Early Warning, Explained") with selected Direction 3 elements, named **RoutePulse — an explainable shipment recovery and logistics control tower**. See §7 for the decision record. Product spec: `planning/02_PRODUCT_SPEC.md`. User journeys: `planning/03_USER_JOURNEYS.md`.

Notes on inputs:
- `hackathon/ideas.md` and `hackathon/problem-statement.pdf` do not exist in the repo. I used the playbook's installed `ideas.md` (`.agents/skills/hackathon-playbook/references/ideas.md`) and the problem-statement PDF that was attached to the chat.
- "RoutePulse" is not defined anywhere in the repo or the chat. I scored it as what the name suggests (a map of routes with live risk pulses). §5.4 explains why that version, on its own, is the crowded default. If RoutePulse means something else, tell us and I will re-score it.

Evidence labels used in this file:
- **[V]** verified in a source found during this session (link given). Secondary sources are marked as such.
- **[V-vendor]** stated by a vendor about itself. True that they *claim* it; not independently checked.
- **[U]** unverified. Do not show it on screen or say it in the pitch until it is checked.
- **[A]** our assumption. Must be stated as an assumption in the demo.

---

## 1. Phase 1 — Constraints

### 1.1 The brief (quoted from the PDF)
- Objective: "Build a web app that tracks orders from plant to customer, predicts delays, and gives every stakeholder a clear, shared view."
- Context: "customers and sales teams often learn an order is late only after it already is."
- Five core expectations (all required):
  1. Separate logins for the customer, the logistics coordinator and the transporter or driver.
  2. Track orders and shipments on a map, with status milestones.
  3. Predict an ETA and delay risk for each shipment, and show the reason.
  4. Alert the customer and coordinator on delay risk, with a suggested action such as reroute or split shipment.
  5. Dashboard of on-time performance and delay causes by route and transporter.
- Bonus (optional): truck slot booking at the plant gate · "Where is my order?" chatbot · upload/download of invoice and proof of delivery.

### 1.2 Users and the decision each one makes
| Role | Who (fictional, Plant X) | The decision they make | What they need from us |
|---|---|---|---|
| Logistics coordinator | Plant X dispatch desk | "Which shipment do I act on now, and what do I do?" | Ranked risk list, the reason, a ready recovery action |
| Customer | B2B buyer, e.g. a plastics converter that moulds polymer into products | "Do I re-plan my production line, or wait?" | An honest ETA early enough to act, in plain language |
| Transporter / driver | Small fleet owner and driver | "What is my next stop, and how do I report a problem fast?" | A low-effort way to report status; fair treatment when the delay is not theirs |

The key insight from the brief: the customer's pain is not the delay itself. It is **learning about the delay too late to re-plan**. The value metric is therefore *warning lead time*, not prediction accuracy.

### 1.3 Time and team
- 2 people, 20 hours wall-clock until the final demo. **[A]** About 30 productive person-hours after sleep, food and setup.
- Default playbook budget, applied: build 40% · UI 15% · verify 5% · demo prep 20% (here: live demo rehearsal, not a video) · setup/scope 10% · buffer 10%. Feature stop at about hour 15.
- Visual quality is the team's top priority. It maps to UX (5), Presentation (5) and indirectly to Working prototype (20), because the judges *see* functionality.

### 1.4 Technical limits
- Stack is fixed: React, TypeScript, Prisma, PostgreSQL.
- **No data is provided.** All data is fictional and created by us (PDF rules 3 and 4).
- The demo runs live in the room (10 minutes total, ~4 minutes of demo). Venue Wi-Fi is an unknown risk. **[A]**
- No real GPS fleet, telematics or government API access in 20 hours. India does have real data sources a pilot could use (FASTag toll pings, e-way bill, VAHAN via ULIP **[V, secondary]** — [fr8](https://www.fr8.in/blog/unified-logistics-interface-platform-ulip-india/), [Business Standard](https://www.business-standard.com/india-news/33-systems-of-7-ministries-have-unified-logistics-interface-platform-123041800053_1.html)), and SIM-based tracking is common for Indian trucks **[V-vendor]** ([Telenity](https://www.telenity.com/sim-tracking-vs-gps-fleets-india/)). These belong in the "pilot / next step" slide, not the demo.
- Generative AI is allowed but must be declared. Undeclared use costs 10 points. Every member must be able to explain every part.

### 1.5 Judging criteria (official, 100 points)
| # | Criterion | Pts | What must be visible on screen |
|---|---|---|---|
| 3 | Working prototype / functionality | 20 | All 5 core items, end to end, live, across 3 logins |
| 6 | Business / user value & impact | 15 | One impact indicator with its calculation and assumptions |
| 1 | Problem understanding & user fit | 10 | A named user, a named decision |
| 2 | Innovation & original thinking | 10 | One thing a judge has not seen in a generic dashboard |
| 4 | Technical design & architecture | 10 | Architecture diagram that matches the demo |
| 5 | Feasibility & scalability | 10 | A believable path from fictional data to real feeds |
| 7 | Responsible AI, security & data | 10 | Human review, confidence, privacy, role-based access |
| 8 | UX & accessibility | 5 | Clear first glance; not colour-only; language access |
| 9 | Presentation & demo | 5 | Smooth, rehearsed, on time |
| 10 | Q&A & team understanding | 5 | Both members explain code, data, trade-offs |

Presentation slots (from the PDF): problem & approach ~2 min · live demo ~4 min · defend ~2 min · Q&A ~2 min ("at least one technical and one assumption question").

### 1.6 Organiser and judges
- Sponsor: LyondellBasell (LYB), a polymer producer. LYB has offices in Mumbai **[V]** ([LYB India page](https://www.lyondellbasell.com/en/locations/asia-pacific/india/)) and posts Mumbai roles in Digital, Procurement and IT Sustainability **[V]** ([example posting](https://careers.lyondellbasell.com/job/Mumbai-IT-Sustainability-Senior-Business-Analyst-400076/1361019800)).
- LYB has a public 2030 target to cut absolute Scope 3 emissions by 30% vs 2020 **[V, company release via CSRwire]** ([source](https://csrwire.com/?p=41513)). No transport-specific sub-target was found **[U]**. Freight emissions are part of Scope 3, so a carbon view of shipments speaks to a real sponsor goal — but do not claim LYB has a logistics target.
- Judges are not named. **[A]** Profile: LYB Mumbai staff from digital, supply chain and business teams; they know the domain better than we do and will spot fake logistics. No public hackathon page for this event was found.

### 1.7 Filters every idea must pass
- **10-second grasp:** "Know a shipment will be late hours before it is, know why, and act on it."
- **Named user + decision:** coordinator decides the recovery; customer decides whether to re-plan.
- **AI honesty test (replaces the playbook's "agentic" test, since this is not an agent event):** if a rule or a lookup does the job as well, call it a rule. Use AI only where it does work a rule cannot.
- **Visual test:** the differentiator must be *seen* in under 30 seconds of demo.
- **20-hour test:** the differentiator must fit on top of the shared core (§6.0) in about 4–5 hours.
- **Sustainability and inclusion test:** must change a decision or a user's access, not be a badge on the page.

---

## 2. Phase 2 — Wide idea generation (60 candidates)

Grouped by lens. Short IDs are used in later sections.

**A. Prediction and explanation**
- A1 Risk waterfall: the ETA is split into minutes per factor (gate queue, weather, driver hours, traffic, transporter history).
- A2 Hindsight replay: scrub back through the day and see *when* the risk first became detectable.
- A3 Probability bands: P50/P90 ETA instead of one date.
- A4 Gate-queue contagion: one late loading pushes risk onto every truck queued behind it.
- A5 Seasonal lane risk (monsoon ghats, festival traffic, harvest season).
- A6 Toll-ping dwell anomaly: a truck that stops "pinging" between toll plazas longer than normal.
- A7 Rest-aware ETA: the ETA includes legally required driver rest, so it never depends on unsafe driving.
- A8 Silent-truck detector: no update for N hours raises risk.
- A9 Prediction confidence from data freshness and data source quality.
- A10 Calibration panel: "how right were our warnings last week?"

**B. Action and recovery**
- B11 Recovery decision cards: reroute / split / swap transporter / expedite / notify, each with time, cost and CO₂ deltas.
- B12 Split planner for multi-grade polymer orders: send the urgent grade first.
- B13 Transporter swap from nearby available trucks.
- B14 Customer co-decision: the customer chooses among recovery options.
- B15 Customer message drafted in the customer's language; coordinator approves before send.
- B16 Escalation ladder with SLA timers.
- B17 Promise guard: feasibility check when sales commits a delivery date.
- B18 Customer inventory runway: "your material runs out Thursday 14:00; this truck arrives Thursday 18:00."
- B19 Customer production-line impact (₹ at risk if the line stops).
- B20 Disruption simulator: inject an event (ghat closure, strike) live and watch the network re-score.

**C. Sustainability**
- C21 Per-shipment CO₂e using the ISO 14083 / GLEC method.
- C22 CO₂ delta on every recovery option; low-carbon option marked.
- C23 Backhaul matcher for empty return trucks.
- C24 Load-factor consolidation of part loads.
- C25 Gate idling emissions counter.
- C26 Customer carbon statement per order (their Scope 3 data).
- C27 Rail mode-shift suggestion for long lanes.
- C28 "Eco-wait": customer accepts a later window so loads can be consolidated.
- C29 Transporter green scorecard (fleet emission class).
- C30 Time-vs-carbon Pareto view of route options.

**D. Inclusion**
- D31 Voice-first multilingual driver app (Hindi / Marathi), big buttons, icons.
- D32 Driver voice note → structured delay reason (AI extraction, human confirm).
- D33 Offline-first driver milestones that sync later.
- D34 Fair delay attribution: controllable vs not, so small transporters are not blamed for plant or customer delays.
- D35 Small-customer access through a no-install tracking link.
- D36 Accessible dashboards: colour-blind-safe, text labels, screen-reader summaries.
- D37 Driver welfare: on delay, suggest safe rest stops instead of pushing the driver.
- D38 Detention logging: waiting time at the gate is recorded and visible.
- D39 Plain-language customer status (no logistics jargon).
- D40 Icon-based proof of delivery for low-literacy users.

**E. Plant side**
- E41 Gate slot booking tied to risk (bonus item).
- E42 Gate queue digital twin with live wait estimate.
- E43 Loading-bay readiness board.
- E44 Dispatch document checklist.
- E45 E-way bill validity risk: a delayed truck whose e-way bill expires before arrival.
- E46 POD photo upload with damage note (bonus item).

**F. Interface**
- F47 "Mission control" map with route arcs and pulsing risk.
- F48 Story mode: each shipment as a narrative timeline.
- F49 Grounded "Where is my order?" chatbot with cited events (bonus item).
- F50 Daily morning brief per role.
- F51 One shared timeline, three role lenses.
- F52 Command palette for coordinators.
- F53 Weekly root-cause report.
- F54 Shareable tracking link for bulk orders.

**G. Network and business**
- G55 Lane health index.
- G56 Transporter OTIF contracts.
- G57 Cost-of-delay estimator.
- G58 Strategic-account weighting of alerts.
- G59 Driver-reported road events (closures, checkpost queues).
- G60 Repeat-hotspot detection (same checkpost, same week).

Discarded fast: anything needing real telematics (A6 as a live feature), any real government API (E45 as live data), mode shift to rail (C27, no credible data in 20 h), marketplace ideas (B13, C23) that pull the product away from PS3's "shared view".

---

## 3. Phase 3 — Top 20 shortlist and scores

Scale 1–5 (5 = best). "20h" means "can be finished in 20 hours *on top of* the shared core". SI = sustainability & inclusion.

| # | Idea | Orig | User value | Visual | Tech feas. | AI relev. | SI | 20h | **Total /35** |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Risk waterfall (minutes per factor) | 3 | 5 | 5 | 5 | 4 | 2 | 5 | **29** |
| B11 | Recovery cards with time/cost/CO₂ deltas | 3 | 5 | 5 | 4 | 4 | 4 | 4 | **29** |
| B15 | Customer message in their language, approved by coordinator | 3 | 4 | 3 | 5 | 5 | 4 | 5 | **29** |
| D34 | Fair delay attribution (whose delay was it) | 5 | 4 | 4 | 4 | 3 | 5 | 4 | **29** |
| A7 | Rest-aware ETA | 5 | 4 | 3 | 4 | 3 | 5 | 4 | **28** |
| B14 | Customer co-decision on recovery | 5 | 5 | 4 | 4 | 3 | 3 | 4 | **28** |
| D31 | Voice-first multilingual driver app | 4 | 4 | 4 | 3 | 5 | 5 | 3 | **28** |
| D32 | Voice note → structured delay reason | 4 | 5 | 4 | 3 | 5 | 4 | 3 | **28** |
| A2 | Hindsight replay ("when did we know?") | 5 | 4 | 5 | 4 | 3 | 1 | 4 | **26** |
| C22 | Low-carbon recovery option | 4 | 3 | 4 | 4 | 2 | 5 | 4 | **26** |
| A3 | P50/P90 ETA bands | 3 | 4 | 4 | 4 | 4 | 1 | 5 | **25** |
| B18 | Customer inventory runway | 5 | 5 | 4 | 4 | 2 | 1 | 4 | **25** |
| B20 | Live disruption simulator | 4 | 3 | 5 | 4 | 3 | 1 | 4 | **24** |
| C28 | Eco-wait consolidation | 5 | 3 | 3 | 3 | 2 | 5 | 3 | **24** |
| D38 | Detention logging | 4 | 3 | 3 | 4 | 1 | 5 | 4 | **24** |
| E45 | E-way bill validity risk | 5 | 4 | 3 | 4 | 2 | 1 | 5 | **24** |
| A4 | Gate-queue contagion | 4 | 4 | 4 | 3 | 3 | 2 | 3 | **23** |
| C21 | Per-shipment CO₂e | 2 | 3 | 3 | 5 | 1 | 4 | 5 | **23** |
| F51 | One timeline, three role lenses | 3 | 4 | 5 | 4 | 1 | 2 | 4 | **23** |
| F49 | Grounded "Where is my order?" chatbot | 2 | 4 | 3 | 3 | 5 | 2 | 3 | **22** |

Reading the table:
- No single idea wins. The strongest products **bundle** 3–4 of these on one shared core.
- High-total ideas split into three families: *explain and act* (A1, B11, A2, B20), *customer-first* (B14, B18, B15, A3), *driver and fairness* (D31, D32, D34, A7, D38).
- C21 (CO₂ per shipment) scores low alone but is cheap and is the base for C22. It goes into every direction.

---

## 4. Phase 4 — Research and validation

### 4.1 Comparable products (prior art)
| Product / approach | What it does | Source | What is left for us |
|---|---|---|---|
| project44 | Visibility platform; claims 15+ AI agent use cases incl. "automated delay reason retrieval"; "ETA explainability" for ETA shifts; "Autopilot" with ~40 prebuilt workflows incl. late-shipment reason codes and carrier outreach | [V-vendor] [project44](https://www.project44.com/?p=76429), [FreightWaves](https://www.freightwaves.com/?p=572982) | **Predicted ETA + reason + AI is already sold by the market leader.** Our novelty cannot be "we predict delays and explain them". It has to be *who* sees it, *what they can do*, or *how fairly it is attributed*. |
| FourKites | Dynamic ETA engine; third-party pages say it uses 150+ factors | [U, secondary listicles] [rework.com](https://resources.rework.com/tools/ai-tools/best-ai-tools-for-logistics-2026) | Same as above. |
| Indian control towers (Intugine, freight-tech vendors) | Combine GPS, SIM and FASTag pings into one dashboard with ETA and exceptions | [V-vendor] [freightfox](https://www.freightfox.ai/blog/how-digital-freight-management-india), [Intugine](https://www.uplers.com/company/intugine---logistics-through-innovation-5507) | "Map + ETA + exceptions" is commodity in India too. |
| Indian GPS fleet apps (fleetx etc.) | Trip tracking, route playback, transport software | [V-vendor] [fleetx](https://blog.fleetx.io/transport-software-the-complete-guide-for-logistics-operators-and-teams/) | Location playback exists. **Playback of the *prediction* ("when did the system know?") was not found** [U — not exhaustively searched]. |
| BlackBuck | Trucking app; says it localised for drivers because English literacy in the sector is "well below 10%" | [V-vendor] [BlackBuck eng blog](https://eng.blackbuck.com/why-humanization-and-localization-of-product-is-critical-in-fueling-digital-inclusion/) | Confirms that driver apps must be local-language. Driver localisation itself is not new. |
| Humsafer | Driver safety app with multilingual voice alerts | [V-vendor, via NITI page] [NITI Frontier Tech](https://frontiertech.niti.gov.in/story/smartphone-ai-that-detects-fatigue-and-saves-lives-on-highways/) | Voice in regional languages for drivers exists for safety; not found combined with shipment status reporting [U]. |
| Hackathon entries | "SupplAIChain – Control Tower AI Agent" (lablab.ai, 2025); Devpost "Triora" (delay prediction + critical path) | [V] [lablab](https://lablab.ai/ai-hackathons/raise-your-hack/supplaichain-vultr-track/supplaichain-the-control-tower-ai-agent), [Devpost](https://devpost.com/software/triora) | "AI control tower agent" is a common hackathon entry. Avoid that framing. |
| Freight carbon accounting | ISO 14083 / GLEC: emissions = tonne-km × intensity factor; Smart Freight Centre publishes India defaults | [V] [SFC India defaults PDF](https://smart-freight-centre-media.s3.amazonaws.com/documents/India_Default_GHG_Emission_Values_SFC_INDIA_v1_2.pdf), [method summary](https://greencalculus.com/methodology/glec-framework-road-freight-methodology/) | The method is standard and citable. Showing CO₂ *inside the recovery decision* is the part that changes behaviour. |

**Conclusion of the sweep:** generic "track + predict + explain + alert" is fully covered by commercial products. Judges from LYB may know project44/FourKites. We must say this openly in the pitch ("the big platforms do X; our prototype explores Y") and put our novelty in a place they do not occupy.

### 4.2 Problem evidence (what we may and may not say)
| Claim | Status | Source |
|---|---|---|
| India's logistics cost is ~7.97% of GDP (2023-24, NCAER for DPIIT) | [V, multiple secondary reports of the official study] | [NCAER PDF](https://ncaer.org/wp-content/uploads/2025/09/NCAER_Logistic_Study_Report_Sept2025.pdf), [Policy Edge](https://www.policyedge.in/p/india-releases-first-official-estimate-of-logistics-costs-at-797-of-gdp) |
| Only 18% of decision-makers say their teams can always intervene when a shipment is delayed (FedEx report, Oct 2025, 700 respondents) | [V, secondary report] | [SupplyChain247](https://www.supplychain247.com/article/fedex-study-shows-only-18-can-intervene-in-shipment-delays) |
| 37% of companies struggle to monitor in-transit cargo (Tive 2025) | [V, secondary report] | [MHL News](https://www.mhlnews.com/transportation-distribution/news/55272257/37-of-companies-cant-track-in-transit-cargo) |
| 90%+ of US consumers say proactive updates ease late deliveries (Locus, Nov 2025) | [V, secondary] — **consumer, not B2B; do not use as B2B evidence** | [SupplyChain247](https://www.supplychain247.com/article/new-locus-survey-delivery-expectations-reliability/bastian_solutions) |
| ~63% of surveyed Indian truck drivers drive >8 h/day; 23% report sleep deprivation | [V, IndiaSpend survey report; date not checked] | [IndiaSpend](https://indiaspend.com/why-trucks-kill-so-many-on-indian-roads/) |
| Drowsy driving in Indian long-haul drivers is linked to long driving, rest patterns and on-time incentives (453 drivers, Mumbai/Indore/Nagpur) | [V, academic] | [Loughborough repository](https://repository.lboro.ac.uk/articles/Effects_of_driver_work-rest_patterns_lifestyle_and_payment_incentives_on_long-haul_truck_driver_sleepiness/9497444/files/17124113.pdf) |
| 82% of truckers in an eye-health study owned a mobile phone; language was a barrier for ~20% | [V, IAPB] | [IAPB](https://www.iapb.org/?p=16835) |
| ~35% of Indian trucks run empty after delivery | **[U] vendor blogs only — do not use** | [fleetx](https://blog.fleetx.io/backhaul-optimization-as-a-profitability-booster) |
| India road freight CO₂ intensity | **[U] — conflicting.** SFC India doc snippet shows ~0.0106 kg CO₂e/t-km; a GLEC v3.2 global default is cited as ~0.101 kg/t-km. A 10× gap means one of them is misread. **Read the primary table before any CO₂ number reaches the screen.** | [SFC India](https://smart-freight-centre-media.s3.amazonaws.com/documents/India_Default_GHG_Emission_Values_SFC_INDIA_v1_2.pdf), [greencalculus](https://greencalculus.com/methodology/glec-framework-road-freight-methodology/) |
| E-way bill validity depends on distance (e.g. per 200 km per day) | **[U] — from memory; not checked this session** | — |
| How often B2B customers learn about delays only after the fact | **[U] — no measurement found.** The PDF itself states it for Plant X; quote the PDF, not a statistic. | PDF slide 7 |

### 4.3 Demand check (playbook Step 7)
- **Felt pain:** the brief states it for Plant X. Market evidence above shows shippers *see* delays but struggle to *act* on them (FedEx 18%). This supports an "act earlier" product over a "see more" product.
- **Moment of use:** coordinator — start of shift and on every alert; customer — when an alert arrives; driver — at each milestone or problem.
- **Better than doing nothing:** today's habit (per the brief) is phone calls after the order is late.
- **Not done, and not claimable:** no user interviews, no reaction test with real coordinators or customers, no baseline test with a general AI assistant (skipped: the job needs Plant X's own shipment data, which no general assistant has). **We must not claim user validation.** If time allows, a 15-minute proxy reaction test (fresh AI agents role-playing a coordinator, a converter's buyer and a driver) can be run after you choose — labelled as a proxy.

---

## 5. Phase 5 — Red-team

### 5.1 Misleading AI claims (Responsible AI = 10 points)
- **"Our ML predicts delays."** Any model trained on data we generate only learns the rules we wrote. Presenting that as learned prediction is a false claim a technical judge will catch. **Fix:** a transparent factor model — each factor adds minutes and risk points, with stated weights. Say: "In a pilot, these weights are fitted on Plant X's history. Today they are set by hand and shown on screen."
- **"AI explains the delay."** If the reason is just the largest factor, it is a rule. Call it a rule. Use an LLM only where text is unstructured or language matters: (a) turning a driver's free-text or voice note into a structured reason, (b) drafting a customer message in their language, (c) the optional chatbot over shipment events.
- **Every AI output needs:** a confidence or source label, a human approval step before anything reaches a customer, and a fallback when the model is down.
- **Privacy:** driver location and phone are personal data even in a fictional demo. Show role-based access (a customer never sees driver identity or other customers' orders) and say what a pilot would minimise.

### 5.2 Technical risks
| Risk | Impact | Mitigation |
|---|---|---|
| Venue Wi-Fi fails → map tiles, LLM and speech APIs fail | Demo dies | Serve map tiles locally (e.g. a regional PMTiles file) **[U: confirm tool choice at setup]**; cache LLM outputs for the scripted path; keep typed input as the fallback for voice; record a backup video but do not switch to it mid-pitch |
| Browser speech-to-text: Chrome-only, needs network, Hindi/Marathi accuracy varies | Driver voice demo stutters | Treat voice as an enhancement; show the typed path first time; pre-test on the demo laptop's mic |
| LLM translation quality for Marathi/Hindi | A wrong message to a "customer" on stage | Coordinator approves; show source and translation side by side; the team should have someone who reads the language check the scripted messages |
| Live moving trucks + clock + DB writes | Race conditions, flaky state during the demo | One deterministic demo clock controlled from the UI; seed script that resets to a known state in one click |
| Road geometry | No routing engine in 20 h | Pre-compute route polylines once and store them in the seed **[A]** |
| Three logins in a 4-minute demo | Time lost switching | Three browser windows side by side, or a presenter role switcher that is clearly labelled as demo-only |
| Postgres/Prisma on the demo laptop | Setup failure on the day | Run it locally from day one; never depend on a cloud DB for the demo |
| CO₂ factor ambiguity (§4.2) | A judge challenges a number we cannot defend | Read the GLEC/SFC primary table first; show the formula and the factor's source on screen |

### 5.3 Weak differentiators (call them out now)
- "Beautiful map with live trucks" — expected; not an innovation point.
- "AI chatbot" — common, low depth, and a bonus item at best.
- "We predict ETAs" — project44 and FourKites sell this.
- "CO₂ badge on each shipment" — decoration unless it changes a choice.
- "Multilingual" as a dropdown — decoration unless a specific user (driver, small customer) gets access they did not have.

### 5.4 About "RoutePulse" (as understood from its name)
If RoutePulse is "routes on a map, each with a live risk pulse", it is the crowded default: it matches the commercial products in §4.1 and the common hackathon framing. It is still a good **visual layer** and fits inside all three directions below. It should not be the product's *reason to exist*. If the team means something more specific, send it and I will score it against the same table.

### 5.5 Features that could fail on stage
- Voice input in a noisy hall.
- Anything that calls an external API on the critical path.
- A "real-time" animation that depends on wall-clock time.
- Translation that a judge can read and finds wrong.
- A dashboard with too few seeded shipments to look real (seed at least ~150 historical shipments across ~6 lanes and ~5 transporters **[A]**, so the on-time and cause charts have shape).

---

## 6. Phase 6 — Recommendation: three directions

### 6.0 The shared core (every direction builds this first)
All five core items, the same in all three directions. Estimated ~10–11 person-hours **[A]**:
1. Seeded users for 3 roles + role-based routes and data access.
2. Map with shipments on pre-computed routes + milestone timeline (Planned → Loaded → Gate out → In transit → Arrived → Delivered).
3. Factor-based ETA and risk score with a visible per-factor breakdown (A1).
4. Alert when risk crosses a threshold, with a suggested action, to coordinator and customer.
5. Dashboard: on-time % and delay causes by lane and transporter, from ~150 seeded historical shipments.
6. Per-shipment CO₂e (C21) with the formula shown, once the factor is verified.

Shared impact indicators (computed from the app's own event log on fictional data, assumptions shown):
- **Warning lead time** = promised delivery time − time of first risk alert, for shipments that end late. Status-quo baseline per the brief: ≈ 0 (customer learns after it is late).
- **Proactive notice rate** = share of late shipments where the customer was told before the promised time.

Each direction below spends the remaining ~4–5 person-hours of build on a different differentiator.

---

### Direction 1 — "Early Warning, Explained" (coordinator-first)
**One line:** The coordinator sees *when* a shipment became risky, *why*, and picks a recovery option whose time, cost and CO₂ trade-off is on the card.

- **Differentiators:** Hindsight replay scrubber (A2) — drag back in time and watch the risk line cross the threshold hours before the promise was missed · Recovery cards with time/cost/CO₂ deltas (B11 + C22) · Live disruption injector for the demo (B20) · Customer message drafted in their language, approved by coordinator (B15).
- **Winning moment:** "The judge drags the scrubber back and sees the system flagged the Pune shipment 9 hours before it would have been late — then one click splits the load and the customer gets a Marathi message."
- **Sustainability:** the low-carbon recovery option is marked and its CO₂ difference is shown at the moment of choice.
- **Inclusion:** customer-language messaging; colour-blind-safe risk encoding with text labels.
- **AI use:** message drafting/translation (approved), optional reason extraction. Prediction itself is a transparent rule model — stated openly.
- **Strengths:** strongest visual demo; most direct fit to core items 3 and 4; impact metric (lead time) is shown, not claimed; lowest technical risk.
- **Weaknesses:** closest to what project44/FourKites sell → Innovation score depends on the replay and CO₂-in-the-decision landing; inclusion is the thinnest of the three.
- **Estimated score band [A]:** high on Prototype, Presentation, UX; medium on Innovation; medium on SI.

### Direction 2 — "Co-Decide" (customer-first)
**One line:** The customer is not just told about a delay; they see an honest ETA range against *their own* material runway and choose the recovery — including a lower-carbon "wait and consolidate" option.

- **Differentiators:** P50/P90 ETA band (A3) · Customer inventory runway — "your stock of grade X runs out Thu 14:00" (B18) · Customer co-decision on options: wait / partial split now / expedite / eco-wait (B14 + C28) · Plain-language, customer-language status (D39 + B15).
- **Winning moment:** "The customer's screen shows their material runs out 4 hours before the truck arrives; they tap 'send the urgent grade first', and the coordinator's split plan is created from that choice."
- **Sustainability:** eco-wait makes CO₂ a *customer* choice with a visible trade-off, which also produces a carbon line for the customer's own Scope 3 reporting.
- **Inclusion:** small converters without ERP get the same visibility through a simple link and their language.
- **AI use:** message drafting/translation; the ETA band from a transparent model with spread; optional chatbot grounded on the order's events.
- **Strengths:** the most original framing (moves the decision to the person who feels the pain); strong user-value story; clear "shared view" fit.
- **Weaknesses:** inventory runway needs a believable fictional customer-stock model and an assumption a judge may question ("how would Plant X know the customer's stock?" — answer: customer enters it or shares it; pilot via EDI). The coordinator role becomes thinner. Eco-wait adds workflow complexity.
- **Estimated score band [A]:** high on Problem fit and Innovation; medium-high on Prototype; feasibility questions likely in Q&A.

### Direction 3 — "Fair Lanes" (driver and transporter-first)
**One line:** Drivers report status and problems by voice in their own language in seconds; the system turns that into structured delay reasons and attributes each delay fairly — plant, transporter, customer, or external — so the dashboard stops blaming small transporters for delays they did not cause.

- **Differentiators:** Voice-first multilingual driver screen (D31) · Voice/text note → structured reason with confirm step (D32) · Fair delay attribution: controllable vs uncontrollable, by party (D34) · Rest-aware ETA that includes legal rest instead of assuming non-stop driving (A7) · Gate detention time logged (D38).
- **Winning moment:** "A driver says in Hindi 'stuck at the plant gate for three hours', the coordinator's dashboard re-attributes that delay from 'transporter' to 'plant gate', and the transporter's on-time score corrects itself."
- **Sustainability:** gate idling time made visible (idling burns fuel) and CO₂ per lane; weaker than D1/D2.
- **Inclusion:** strongest of the three — drivers with low English literacy, and small fleet owners, get a voice and a fair record. Backed by verified evidence on driver hours and fatigue (§4.2).
- **AI use:** the most genuine AI work of the three (multilingual speech → structured data), with clear human-in-the-loop.
- **Strengths:** distinct from commercial products' framing; very strong SI and Responsible AI story; the dashboard requirement (#5, causes by transporter) becomes meaningful rather than generic.
- **Weaknesses:** highest live-demo risk (voice, network, language accuracy); driver screen is small and less visually dramatic than a coordinator control tower; customer alert flow (#4) needs care so it is not neglected; a judge may ask whether drivers would really use it (no validation — must say so).
- **Estimated score band [A]:** high on Innovation, SI, Responsible AI; medium on Visual and Prototype stability.

### 6.1 Trade-off summary
| | D1 Early Warning, Explained | D2 Co-Decide | D3 Fair Lanes |
|---|---|---|---|
| Visual demo | ★★★★★ | ★★★★ | ★★★ |
| Originality | ★★★ | ★★★★★ | ★★★★ |
| User value | ★★★★ | ★★★★★ | ★★★★ |
| Sustainability | ★★★★ | ★★★★★ | ★★★ |
| Inclusion | ★★ | ★★★ | ★★★★★ |
| Genuine AI use | ★★★ | ★★★ | ★★★★★ |
| Demo risk (lower is better) | Low | Medium | High |
| 20-hour fit | Best | Good | Tight |

### 6.2 My recommendation
- **If visual quality and a safe live demo come first (your stated priority): Direction 1**, with one inclusion element borrowed from Direction 3 — the driver can send a short typed or voice note that becomes one of the factors on the risk waterfall. That closes D1's inclusion gap for ~2 hours of extra work and gives the AI a real job.
- **If you want the strongest innovation story and accept more Q&A risk: Direction 2.**
- **Direction 3** is the most meaningful on inclusion, but in 20 hours with a live room demo, its failure modes sit on the critical path. Take its best pieces into D1 rather than build it as the spine.

Runner-up logic for the lock (to confirm after you choose): the fallback must survive the most likely failure. The most likely failure is time, not data, so the fallback is "D1 without the replay scrubber" — the core plus recovery cards still demos all five items.

### 6.3 Proposed day-1 go/no-go gate (applies to whichever direction you choose)
By **build hour 5**: the seed loads ~150 historical + ~12 live shipments; the map shows trucks moving under the demo clock; one scripted shipment crosses the risk threshold with at least 3 factors on its breakdown; all 3 logins see only their own data. If this fails, cut the differentiator to its smallest version and finish the core.

### 6.4 Open checks before any of this reaches the screen
1. Read the GLEC v3.2 / SFC India tables and fix one defensible road-freight CO₂ factor (§4.2 conflict).
2. Confirm the offline map-tile approach on the demo laptop.
3. If E45 (e-way bill) is used as a risk factor, verify the current validity rule.
4. Decide which Indian language(s) the team can personally check.
5. Write the generative-AI declaration (include this ideation work done with Claude).

---

**Waiting for your approval.** Tell us: Direction 1, 2, 3 or a hybrid — and what RoutePulse meant, if it differs from §5.4. The product specification starts only after that.

---

## 7. Decision record (2026-11-12)

**Locked:** RoutePulse — an explainable shipment recovery and logistics control tower.
**Basis:** Direction 1 (Early Warning, Explained) + selected Direction 3 (Fair Lanes) elements.
**Decided by:** the team, after reviewing §1–§6.
**Lead user (ICP):** the Plant X logistics coordinator. Customer and transporter/driver are supporting roles.

> Note: the name "RoutePulse" is kept, but the product is *not* the "map with risk pulses" version red-teamed in §5.4. The map is the visual layer. The reason to exist is early, explained, fairly attributed recovery.

### 7.1 Approved scope
| Group | Item | Source idea |
|---|---|---|
| Mandatory | M1 Three roles: customer, logistics coordinator, transporter/driver | PS3 core 1 |
| Mandatory | M2 Interactive shipment map with status milestones | PS3 core 2 |
| Mandatory | M3 ETA and delay-risk prediction with explanations | PS3 core 3 |
| Mandatory | M4 Customer and coordinator alerts with suggested recovery actions | PS3 core 4 |
| Mandatory | M5 On-time and delay-cause dashboard by route and transporter | PS3 core 5 |
| Differentiator | X1 Historical risk replay | A2 |
| Differentiator | X2 Explainable ETA breakdown | A1 |
| Differentiator | X3 Recovery decision cards (time and cost) | B11 |
| Differentiator | X4 Disruption simulator | B20 |
| From Direction 3 | F1 Fair delay attribution (plant / transporter / customer / external) | D34 |
| From Direction 3 | F2 Driver problem reporting by typed input | D32 (typed, not voice) |
| From Direction 3 | F3 Structured delay-reason confirmation | D32 |
| Sustainability & inclusion | CO₂e in recovery comparison — **only after the emissions factor is verified** | C21, C22 |
| Sustainability & inclusion | Accessible, mobile-friendly driver interface | D31 (without voice), D36 |
| Sustainability & inclusion | Multilingual messages — **only where the team can verify accuracy** | B15 |

### 7.2 Scope restrictions (team decision, binding)
- No real GPS integration.
- No unverified traffic APIs.
- No claim of trained ML prediction. The prediction is a deterministic factor model and is described as such.
- No dependence on voice recognition in the main demo.
- No chatbot or other bonus feature before all five mandatory features pass their acceptance criteria.

### 7.3 Why the runners-up lost
- **Direction 2 (Co-Decide)** lost on feasibility and Q&A risk. The customer inventory runway needs an assumption judges are likely to challenge ("how does Plant X know the customer's stock?"), and it thins out the coordinator role. Its customer-choice idea stays on hold.
- **Direction 3 (Fair Lanes) as the spine** lost on live-demo risk. Voice, network and language accuracy would sit on the critical path. Its fair-attribution and structured-reporting pieces were kept because they work with typed input and deterministic rules.

### 7.4 Fallback
If time runs short: ship M1–M5 + X2 (ETA breakdown) + X3 (recovery cards). Drop X1 (replay) first, then X4 (simulator, replaced by one pre-seeded disruption). This still shows all five mandatory items. It survives the most likely failure (time), because it uses the same data and engine.

### 7.5 Open warning → bet → check
- **Warning:** Innovation is the weakest axis, because commercial platforms already sell explained ETAs (§4.1).
- **Bet:** replay + fair attribution + recovery trade-offs, shown together, read as new to judges.
- **Check:** before feature stop, show the 4-minute demo to one person outside the team. Ask what they remember. If they do not mention replay or fair attribution, move those earlier in the demo.

### 7.6 Day-1 go/no-go gate
Unchanged from §6.3: by build hour 5, the seed loads, the map shows moving shipments under the demo clock, one scripted shipment crosses into "At risk" with at least 3 explained factors, and the 3 logins each see only their own data. If it fails, switch to the §7.4 fallback scope.
