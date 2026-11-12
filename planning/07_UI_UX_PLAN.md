# 07 — UI/UX plan: RoutePulse

Version 0.2, 2026-11-12. Status: **approved; revision 0.2 applies the locked decisions L1–L10** (architecture §0.1). All items formerly open in §20 are resolved.
Inputs: `02_PRODUCT_SPEC.md` (spec), `03_USER_JOURNEYS.md` (journeys), `04_TECH_ARCHITECTURE.md`, `05_DATABASE_SCHEMA.md`, `06_API_SPEC.md`, `08_ETA_AND_RISK_ENGINE.md`. Endpoint numbers like **#14** refer to the API index (API §3).
This plan does not change product requirements. Items that need a decision are in §20.

**Design direction (approved):** light theme, premium enterprise SaaS. Warm off-white canvas, white surfaces, navy/charcoal text, slate secondary text, a confident blue for actions, restrained teal accents, muted green / amber / red status. Minimal gradients and shadows. Hierarchy comes from type, spacing and alignment, not decoration.

**Showcase screen:** the coordinator control tower (§6). It opens the demo and carries most of the judging impression.

---

## 1. Principles

1. **Decision first.** Every screen answers "what needs me, why, and what do I do?" before showing detail.
2. **Explain every number.** ETA, risk and cost always show their reason one click (or hover) away; "rule-based" is stated, never hidden.
3. **Status is never colour alone.** Colour + icon + text label, everywhere (spec §5.13, AC-A11Y.1).
4. **Calm by default, loud only for risk.** Neutral surfaces; red appears only for AT_RISK/LATE and destructive actions.
5. **Honest about simulation.** A visible "Simulation time" badge and "Fictional data · Plant X" note on every coordinator screen; simulator controls labelled "Simulation".
6. **Offline-safe.** No external fonts, icons, tiles or images at runtime (architecture §16).
7. **Same words everywhere.** Use the spec §10 wording list: "Estimated arrival", "At risk of missing the promised time", "Attributed to", "Proposed — Plant X team confirming". Never "fault", "blame", "AI predicts", "guaranteed".

---

## 2. Design tokens

Contrast values were computed (WCAG 2.1 relative luminance) for the text and status tokens; the delay-cause chart palette was run through a colour-vision validator (adjacent pairs, light surface). Results are noted per table.

### 2.1 Colour — neutrals and brand
| Token | HEX | Use | Contrast |
|---|---|---|---|
| `canvas` | `#F7F6F3` | App background (warm off-white) | — |
| `surface` | `#FFFFFF` | Cards, panels, tables, map frame | — |
| `surface-subtle` | `#FBFAF8` | Table header rows, nested panels, hover rows | — |
| `surface-sunken` | `#F1EFEA` | Inputs' read-only fill, skeletons | — |
| `border` | `#E5E1DA` | Card and divider lines (decorative) | — |
| `border-strong` | `#CFC9BF` | Table outer borders, segmented controls | — |
| `border-input` | `#8A94A3` | Input, checkbox and select outlines | 3.07:1 on white (meets 3:1 non-text) |
| `text` | `#0F1B2D` | Primary text, headings, numbers | 17.3:1 on white · 16.0:1 on canvas |
| `text-secondary` | `#475467` | Secondary text, labels | 7.7:1 · 7.1:1 |
| `text-muted` | `#5F6B7A` | Captions, timestamps, placeholders | 5.4:1 · 5.0:1 |
| `primary` | `#1F4FD1` | Primary buttons, links, focus ring, selected states | 6.8:1 on white; white text on it 6.8:1 |
| `primary-hover` | `#1A43B3` | Hover | 8.4:1 |
| `primary-pressed` | `#163A9C` | Active/pressed | — |
| `primary-subtle` | `#EDF2FE` | Selected row, primary tint backgrounds | `primary` on it 6.1:1 |
| `accent` (teal) | `#0B7A75` | Simulation badge, replay accents, "Suggested" ribbon, links in charts | 5.2:1 on white |
| `accent-subtle` | `#E6F4F3` | Teal tint backgrounds | `accent` on it 4.6:1 |
| `navy-900` | `#0F1B2D` | Login brand panel, top bar text | — |
| `navy-800` | `#1B2B45` | Login brand panel gradient end (only gradient in the app) | — |

### 2.2 Colour — status (reserved; never used for chart series)
| Level / status | Text & icon | Background tint | Icon | Label | Contrast (text on tint) |
|---|---|---|---|---|---|
| ON_TRACK / success | `#2F7A55` | `#E9F4EE` | check-circle | "On track" | 4.6:1 |
| WATCH / warning | `#9A5B00` | `#FDF3E1` | eye | "Watch" | 4.9:1 |
| AT_RISK / danger | `#B42318` | `#FDECEA` | alert-triangle | "At risk" | 5.8:1 |
| LATE | `#7A1E14` | `#F7E4E1` | clock-alert | "Late" | 8.5:1 |
| Info / neutral | `#475467` | `#F1EFEA` | info | — | 6.0:1 |
| Delivered | `#2F7A55` | `#E9F4EE` | package-check | "Delivered" | 4.6:1 |

Map markers use the same text colours as fills with a white 2 px ring and the icon inside.

### 2.3 Colour — delay-cause parties (charts)
Validated as a categorical palette on white, adjacent-pair mode (stacked bars): lightness band, chroma floor, CVD separation (worst adjacent ΔE 14.9 deutan) and normal-vision floor all **PASS**; contrast vs surface ≥ 3:1. The blue/violet pair is close under protanopia when not adjacent, so **the stack order is fixed** (Plant → Transporter → Customer → External → Unattributed) and charts always have a legend, direct labels for ≤ 4 segments, and a table view.
| Party | HEX | Notes |
|---|---|---|
| Plant | `#3B5BDB` | — |
| Transporter | `#C27C0E` | Ochre; distinct from warning amber by placement (charts only) and labels |
| Customer | `#7C4DCC` | — |
| External | `#00968F` | — |
| Unattributed | `#A3A9B3` + 45° hatch texture | Neutral; texture marks "unknown" |

Single-series charts (on-time % by lane/transporter, weekly trend) use `primary` `#1F4FD1` only. Fair vs raw on-time uses `primary` (fair) and `#9DB3EE` (raw, lighter step of the same hue) — one hue, two steps, labelled.

### 2.4 Typography
- **Family:** Inter (OFL licence), **self-hosted** woff2 files served by the API (no external font request). Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- **Numbers:** `font-variant-numeric: tabular-nums` for times, ETAs, KPIs, tables.
- **No second font family.** Codes (SHP-1042) use Inter with `letter-spacing: 0.02em` and `font-weight: 500`.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 600 | Login headline |
| `kpi` | 28 / 32 | 600, tabular | KPI values |
| `h1` | 24 / 32 | 600 | Page titles |
| `h2` | 20 / 28 | 600 | Section titles |
| `h3` | 16 / 24 | 600 | Card titles, panel headers |
| `body-lg` | 16 / 24 | 400 | Driver UI body, customer messages |
| `body` | 14 / 20 | 400 | Default desktop text, tables |
| `body-strong` | 14 / 20 | 600 | Emphasised values |
| `small` | 12 / 16 | 500 | Captions, timestamps, chip labels |
| `overline` | 11 / 16 | 600, uppercase, letter-spacing 0.06em | Section eyebrows ("SO FAR", "EXPECTED") |

Minimum text size: 12 px on desktop, 16 px body on the driver UI.

### 2.5 Spacing, radii, elevation, motion
| Group | Tokens |
|---|---|
| Spacing (4 px base) | `0` 0 · `0.5` 2 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 20 · `6` 24 · `8` 32 · `10` 40 · `12` 48 · `16` 64 |
| Radii | `sm` 6 (chips, inputs) · `md` 8 (buttons, small cards) · `lg` 12 (cards, panels) · `xl` 16 (modals, driver cards) · `full` 9999 (badges, avatars, markers) |
| Shadows | `xs` `0 1px 2px rgba(15,27,45,0.06)` · `sm` `0 1px 3px rgba(15,27,45,0.08), 0 1px 2px rgba(15,27,45,0.04)` · `md` `0 4px 12px rgba(15,27,45,0.08)` · `overlay` `0 12px 32px rgba(15,27,45,0.14)` |
| Use of shadow | Cards: `border` + `xs`. Popovers/drawers: `md`. Modals: `overlay`. Nothing else. |
| Focus ring | 2 px `primary` outline + 2 px offset (6.3:1 on canvas) |
| Motion | `fast` 120 ms · `base` 200 ms · `slow` 320 ms; easing `cubic-bezier(0.2, 0, 0, 1)`. Marker movement interpolates over 1,000 ms linear. All motion off under `prefers-reduced-motion` (markers jump). |
| Layout widths | App max content 1600 px; side panel 400 px; shipment list 360 px; driver content max 480 px |
| Breakpoints | `sm` 360 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 |
| Z-index | base 0 · map controls 10 · sticky header 20 · drawer 30 · popover 40 · modal 50 · toast 60 |

### 2.6 Iconography
- One outline icon set, 1.5 px stroke, 16/20/24 px. **lucide-react** (ISC licence, tree-shaken) — **approved (L9)**. Not installed during the documentation phase.
- Every icon next to text is `aria-hidden`; icon-only buttons have an `aria-label`.

### 2.7 Implementation of tokens
Tokens are CSS custom properties in `apps/web/src/styles/tokens.css` and mapped into the Tailwind theme (architecture §3 lists Tailwind as an assumption). Components never use raw HEX values.

---

## 3. Information architecture and navigation

| Role | Routes (architecture §5.1) | Home |
|---|---|---|
| Coordinator | `/control-tower` · `/shipments/:id` · `/shipments/:id/replay` · `/dashboard` · `/reports` · `/simulation` | `/control-tower` |
| Customer | `/orders` · `/orders/:id` · `/notifications` | `/orders` |
| Driver | `/trip` · `/trip/report` | `/trip` |

**Coordinator top bar (64 px, white, bottom border):** RoutePulse wordmark · nav (Control tower, Dashboard, Driver reports [count badge], Simulation) · **simulation clock** (teal badge "SIMULATION · Thu 11:10" + play/pause + speed) · notification bell [unread] · user menu (name, role, Log out). A thin strip under it reads "Fictional data · Plant X" (muted, 12 px).

**Customer top bar:** company name (e.g. "Kestrel Moulders"), nav (Orders, Notifications), user menu. No simulator controls; a muted "Times shown in IST" note.

**Driver:** no top nav; a compact header with trip code and a menu (Log out). Bottom area reserved for the primary action.

---

## 4. Component hierarchy and React folder structure

Extends architecture §4 (`apps/web/src`). No new dependencies beyond those already listed there (plus the icon decision in §20).

```
apps/web/src/
├─ app/
│  ├─ App.tsx                     providers (QueryClient, Router), SyncProvider
│  ├─ routes.tsx                  three route trees + RoleGuard
│  ├─ RoleGuard.tsx
│  └─ layouts/                    CoordinatorLayout · CustomerLayout · DriverLayout · AuthLayout
├─ api/
│  ├─ client.ts                   typed fetch (generic over shared response types), error envelope → ApiError
│  ├─ sync.ts                     useSync (poll /api/sync, invalidate on worldVersion)
│  └─ hooks/                      one hook per endpoint (useShipments, useShipment, useEta, useReplay, useRecoveryOptions, useChooseRecovery, …)
├─ components/                    design system (no business logic)
│  ├─ primitives/                 Button · IconButton · Input · Textarea · Select · Checkbox · SegmentedControl · Tabs · Tooltip · Popover · Dialog · Drawer · Toast
│  ├─ display/                    Card · KpiCard · Badge · StatusBadge · PartyChip · ConfidenceChip · EtaDisplay (time ± range) · CodeLabel · Timestamp · EmptyState · ErrorState · Skeleton · Banner
│  ├─ data/                       DataTable (sortable, keyboard) · TableToggle (chart ↔ table)
│  ├─ charts/                     BarChart · StackedBarChart · LineChart · WaterfallChart · EtaTimelineChart · ChartLegend · ChartTooltip
│  └─ icons/                      icon wrapper (lucide or inline SVG)
├─ map/
│  ├─ MapView.tsx                 MapLibre map, offline style (tiles or GeoJSON fallback)
│  ├─ layers/                     RoutesLayer · DisruptionsLayer · SitesLayer
│  ├─ markers/                    TruckMarker · SiteMarker · PlantMarker (HTML markers)
│  └─ MapLegend.tsx · MapControls.tsx
├─ features/
│  ├─ auth/                       LoginPage · DemoAccountsDisclosure
│  ├─ control-tower/              ControlTowerPage · KpiStrip · ShipmentList · ShipmentListItem · RiskFilterChips · AlertsPanel · ActivityFeed · ShipmentQuickPanel
│  ├─ shipment/                   ShipmentDetailPage · ShipmentHeader · MilestoneTimeline · EtaWaterfall · FactorList · AttributionPanel · EventTimeline · AuditList · ReportReviewCard · MilestoneOverrideDialog
│  ├─ recovery/                   RecoveryPanel · RecoveryCard · ConfirmRecoveryDialog · NewWindowDialog · StaleOptionsBanner
│  ├─ replay/                     ReplayPage · ReplayChart · ReplayScrubber · ReplayEventMarkers · FirstAtRiskCallout
│  ├─ simulation/                 SimClockControl · SimulationPage · DisruptionForm · DisruptionList · ImpactSummary · ResetDemoDialog
│  ├─ reports/                    ReportsQueuePage
│  ├─ dashboard/                  DashboardPage · FilterBar · ImpactKpis · OnTimeByLane · OnTimeByTransporter · WeeklyTrend · CausesByParty · CausesByReason · TransporterTable · DefinitionsPopover
│  ├─ customer/                   OrdersPage · OrderCard · OrderDetailPage · CustomerAlertBanner · CustomerResponseButtons · CustomerEtaCard · PlainMilestones · NotificationsPage
│  └─ driver/                     TripPage · NextStepCard · HandoverBanner · ReportProblemPage · ReasonChipGrid · SuggestionConfirm · DurationChips · ReportSentState · MiniRouteMap
├─ i18n/                          en.ts (+ second language only if G-LANG passes) · format.ts (Intl date/time in Asia/Kolkata, durations)
└─ styles/                        tokens.css · globals.css
```

Rules: `components/` has no API calls; `features/` composes components and hooks; map code lives only in `map/`; text strings come from `i18n/`.

---

## 5. Login page

**Layout (≥ 1024 px):** two columns. Left 45%: navy brand panel (`navy-900 → navy-800` vertical gradient, the only gradient) with the RoutePulse wordmark, the tagline "Know it will be late hours before it is — know why, and fix it." (spec §1), and three short lines: "Explained ETAs", "Recovery options with trade-offs", "Fair delay attribution". Bottom: "Fictional demo · Plant X is a fictional company". Right 55%: centred form card (max 400 px).
**< 1024 px:** brand panel collapses to a 120 px header; form below.

| Element | Detail |
|---|---|
| Form | Email, Password (show/hide toggle), "Sign in" primary button (full width, 44 px) |
| Errors | Inline under the form: "Email or password is incorrect" (`danger` text + icon); field errors linked with `aria-describedby` |
| Rate limit | "Too many attempts. Try again in a minute." |
| Demo accounts | Collapsed disclosure "Demo accounts" listing role + email only (no passwords on screen; passwords in the team's local file) |
| After login | Redirect to `homePath` from #1 |
| States | Button spinner while submitting; disabled inputs during submit |

API: **#1** login · **#3** me (on load; signed-in users are redirected to their home).

---

## 6. Coordinator control tower (showcase)

### 6.1 Layout (1440 × 900 reference; works 1280–1920)
```
┌───────────────────────── Top bar (64) ─────────────────────────────────────────────┐
│ RoutePulse  Control tower  Dashboard  Driver reports(1)  Simulation   [SIM Thu 11:10 ▶ 60×]  🔔3  Meera ▾ │
├──────────────────────────── KPI strip (96) ────────────────────────────────────────┤
│ Live 12 │ At risk 1 ▲ │ Watch 3 │ Open alerts 1 │ Reports to review 1 │ On-time (30 d) 81.4% │ Median warning lead 5 h 10 m │
├──────────────┬───────────────────────────────────────────────┬─────────────────────┤
│ Shipments    │                                               │ Right panel (400)   │
│ (360)        │                 MAP (flex)                    │ Tabs: Alerts │ Activity │
│ filter chips │  routes · trucks · sites · disruptions        │  — or —             │
│ risk-sorted  │                                               │ Selected shipment   │
│ list         │   [legend]                [Simulation dock]   │ quick panel         │
└──────────────┴───────────────────────────────────────────────┴─────────────────────┘
```
- Numbers in the sketch are layout examples only; real values come from the API.
- Below 1280 px: right panel becomes an overlay drawer; KPI strip scrolls horizontally (no wrap).
- Below 1024 px: not a target for the coordinator (spec §9); show a notice "Best viewed on a larger screen" and a stacked layout (list, then map, then panel).

### 6.2 KPI strip
| KPI | Source | Interaction |
|---|---|---|
| Live shipments | count from **#14** (status live) | Click → clears list filters |
| At risk | count of AT_RISK in #14 (danger badge) | Click → filter list to AT_RISK |
| Watch | count of WATCH in #14 | Click → filter WATCH |
| Open alerts | **#26** (active) count | Click → Alerts tab |
| Reports to review | **#24** (PENDING_REVIEW) count | Click → `/reports` |
| On-time (30 d) | **#36** `kpis.onTimePct` (period 30d) | Click → `/dashboard` |
| Median warning lead time | **#36** `kpis.medianWarningLeadMinutes` | Tooltip: definition from `definitions.warningLead` |
`KpiCard`: overline label, `kpi` value, small caption ("of 12 live"); AT_RISK value in `danger` with icon. Values animate only with a 120 ms fade (no counting animation).

### 6.3 Shipment list (left, 360 px)
- Header: "Shipments" + search by code (debounced, client-side over the loaded list) + filter chips: All · At risk · Watch · On track · Late.
- Sorted by risk score (default, from #14 `sort=risk`).
- **Row (72 px):** left 4 px level bar (colour) · `StatusBadge` (icon + label) · code `SHP-1042` · customer + city · lane · ETA `16:20 ± 20` vs promise `18:00` · slack text ("1 h 40 m spare" / "Misses by 14 h") · confidence chip if not HIGH · badges: "Alert", "Report pending".
- Hover: highlight matching truck on map. Click/Enter: select (map flies to the truck; right panel shows the quick panel). Keyboard: ↑/↓ move, Enter selects, Esc clears.
- Split child shipments are indented under their parent with a "Split" chip.

### 6.4 Map (centre) — see §8 for details
Shows all live shipments, routes, sites, plant, active disruptions. Selected shipment: its route highlighted, others dimmed to 40%. A floating **Simulation dock** (bottom-right, teal outline, labelled "SIMULATION") holds: play/pause, speed segmented control (1× / 10× / 60×), "+1 h", "Advance to…" time picker, "Inject event" (opens the disruption form drawer), "Reset demo" (confirm dialog). Map legend bottom-left (collapsible).

### 6.5 Right panel
**Default: tabs "Alerts" and "Activity".**
- **Alerts** (#26 active): cards sorted newest first — level icon, "SHP-1042 at risk of missing Thu 18:00", top factor sentence, customer response chip if any ("Customer accepted proposal 11:20"), buttons "View options" (→ recovery in the quick panel) and "Open". Resolved alerts collapse into "Recently resolved".
- **Activity feed:** chronological list (newest first, 50 items) of domain activity: milestones, driver reports, report reviews, disruptions, alerts, customer responses, recovery choices. Each item: icon, one-line summary, shipment code link, simulation time. New items slide in (fade only under reduced motion). **Data source (L7):** `GET /api/audit` (#37) with `limit=50` (plus `shipmentId` when a shipment is selected); the client shows only domain actions (`milestone.*`, `report.*`, `disruption.*`, `alert.*`, `recovery.*`, `attribution.*`) and hides `auth.*` and `sim.clock`. No separate endpoint.

**When a shipment is selected: quick panel** (replaces the tabs, back arrow returns):
1. Header: code, customer, lane, `StatusBadge`, "Open full detail" link (→ `/shipments/:id`).
2. ETA block: "Estimated arrival 16:20 ± 20 · Promised by 18:00 · Confidence High"; summary sentence.
3. Compact `EtaWaterfall` (§7.3).
4. Milestones (compact horizontal stepper).
5. Recovery section (when WATCH/AT_RISK): Suggested card + "Compare all options" (→ full recovery view, §9).
6. Pending report card (if any) with Confirm / Change.

### 6.6 Live behaviour
- `SyncProvider` polls #4 every 1 s; on `worldVersion` change, list, alerts, activity, KPIs refetch (API §15). Trucks move via #11 every 1 s while running.
- When a shipment turns AT_RISK: its row briefly pulses (one 600 ms highlight; none under reduced motion), a toast appears ("SHP-1042 is at risk — View options"), an `aria-live="polite"` region announces it (max one announcement per 5 s).
- When the clock is paused: the badge shows "PAUSED"; trucks stay still.
- `simError` from #4 → amber banner under the top bar: "Simulation paused: <reason>".

### 6.7 API dependencies (control tower)
#3, #4, #5, #6, #7, #8, #9, #10, #11, #14, #18, #24, #26, #29, #31, #36, #38 and #37 for the activity feed (L7).

---

## 7. Shipment detail page (`/shipments/:id`)

### 7.1 Layout
```
┌ Header: ← Control tower · SHP-1042 · Kestrel Moulders, Pune · [At risk] · ETA Fri 08:00 ± 85 · Promised Thu 18:00 · Confidence Medium · [Replay] ┐
├──────────────── Left (8/12) ───────────────────────────┬────── Right (4/12) ────────────┤
│ ETA explanation (waterfall + factor list)               │ Recovery options (Suggested    │
│                                                         │ first, then others, disabled   │
│ Milestones (vertical, with time + source)               │ last)                          │
│                                                         │ Customer response (if any)     │
│ Tabs: Timeline │ Attribution │ Audit                    │ Driver report review           │
│                                                         │ Mini map (route + position)    │
└─────────────────────────────────────────────────────────┴────────────────────────────────┘
```
Below 1280 px: right column moves under the left column.

### 7.2 Header
Code (`h1`), customer + city, lane, transporter + truck, driver name (coordinator only), `StatusBadge`, `EtaDisplay`, promise, `ConfidenceChip` with tooltip reason, "Renegotiated" chip if applicable, buttons: **Replay** (→ §10), **Override milestone** (secondary, opens dialog requiring a note; API #17), **Report on behalf of driver** (secondary; same form as the driver's, logged; API #22, #23 — spec §4).

### 7.3 ETA explanation — `EtaWaterfall`
- Horizontal waterfall from **Planned arrival** to **Predicted arrival at the receiving gate** (L1), with a vertical **Promised by** line (dashed navy), a **Road arrival** tick (`projectedRoadArrivalAt`) and the applicable receiving window shaded (light teal band; an accepted override is labelled "Agreed window until 19:30") on the time axis.
- Bars grouped under overline labels **SO FAR** (INCURRED), **PLAN CHANGE** (only if rerouted) and **EXPECTED**, each bar coloured by **party** (§2.3), labelled "+120 min · Heavy rain on ghat section". WIN bar shows its party split as stacked segments with a "knock-on" label.
- Pending RPT bars use a dashed outline + "Pending coordinator review" chip.
- Under the chart, `FactorList` repeats every bar as text rows (accessible equivalent): factor, phase, minutes, party, detail, source link.
- Footer: "Rule-based estimate · How is this calculated?" → popover with #20 content. Identity line (L3, four terms): "13:20 planned + 49 so far + 0 plan change + 1,071 expected = Fri 08:00".
- API: **#18** (coordinator view), **#20**.

### 7.4 Milestones
Vertical stepper with 8 milestones (spec §5.3): done (check, time, source "Driver · Ramesh" / "Simulation"), current (pulsing dot off under reduced motion), pending (hollow). API: **#15**.

### 7.5 Tabs
- **Timeline** (#16): all events with icons and simulation times.
- **Attribution** (#34, #35): stacked bar of minutes by party (live or final), rows table (cause, kind, party, minutes, status, override info), but-for result after arrival ("Does not count against the transporter — the shipment would still be late without the transporter's minutes"). "Re-attribute" per row → dialog: new party select + required note (5–280 chars).
- **Audit** (#37 with `shipmentId`): who did what, when.

### 7.6 Driver report review card
Shows report text, matched keywords highlighted, driver's reason, estimate, party; buttons **Confirm** and **Change reason/party** (requires note). API: **#24**, **#25**.

### 7.7 States
Loading: skeleton header + skeleton waterfall. Not found / out of scope (404): "This shipment is not available." Delivered: waterfall shows final values with "Final" chip; recovery section hidden.

---

## 8. Interactive map

### 8.1 Basemap
- Offline only (architecture §16): local PMTiles if the spike passes, otherwise the GeoJSON fallback. The visual style is the same in both: land `#EEECE6`, water `#DCE6EE`, state borders `#CFC9BF` 1 px, no POI clutter, no basemap labels except (tiled variant only) major city names in `text-muted`.
- OpenStreetMap attribution visible bottom-right when tiles are OSM-derived.

### 8.2 Data layers
| Layer | Style |
|---|---|
| Primary route | 3 px `#334155` line, 80% opacity; selected: 4 px `primary` |
| Alternate route | 2 px dashed `#8A94A3`; shown when its shipment is selected or a reroute option is hovered |
| Disruption segment | 6 px `danger` line at 35% opacity under a 2 px dashed `danger` line + label pill ("Heavy rain · −65% speed · until 18:30") |
| Plant | Navy square marker with factory icon, label "Plant X" |
| Customer sites | White circle with navy border + building icon; label with name and receiving hours on hover |
| Trucks (`TruckMarker`) | 28 px circle in level colour, white 2 px ring, truck icon (white); code label pill below (`SHP-1042`); stopped: pause glyph badge; selected: 36 px + `primary` halo; focusable `<button>` with `aria-label="SHP-1042, At risk, estimated arrival Friday 08:00"` |

### 8.3 Interaction
- Click / Enter on a truck selects the shipment (syncs with the list). Hover shows a tooltip card (code, customer, ETA, level).
- Zoom controls and "fit all" button (top-right). Scroll-zoom enabled only after the map is focused/clicked (prevents scroll traps).
- Positions from **#11** every 1 s while running; markers interpolate linearly over 1 s (none under reduced motion).
- Layers from **#10**; disruptions also update after #8/#9 via `worldVersion`.

### 8.4 Role variants
| Role | Map content |
|---|---|
| Coordinator | Everything |
| Customer | Plant, own site, own lane route(s), own trucks; no disruption overlay (plain reason appears in alerts) |
| Driver | Own route, next stop, own truck; compact (§12) |

### 8.5 Accessibility
The shipment list is the accessible equivalent of the map. Map region has `role="region"` + `aria-label="Shipment map"`; keyboard users can Tab to truck markers; all map information also exists as text in the list/panel.

---

## 9. Recovery recommendations

Shown in the quick panel (Suggested only + "Compare all") and in full on the shipment detail page (right column) and as a modal from an alert ("View options").

### 9.1 `RecoveryCard`
| Area | Content |
|---|---|
| Top | Kind icon + title ("Replacement truck from Khopoli yard"); **Suggested** ribbon (teal) on one card |
| Outcome | New ETA ± range; **Meets promise ✓ / Misses promise ✗** (icon + text, success/danger) |
| Metrics (3 columns) | Time saved vs Notify only · Estimated extra cost "₹6,100" with "Fictional rate card" caption · CO₂e: value, or "CO₂e — method under verification" (muted) until G-CO2 (AC-S1.1) |
| Constraints | Bulleted ("Needs TRK-11, free at Khopoli from 11:30") |
| Action | "Choose" (primary on Suggested, secondary on others) |
| Disabled | Greyed card, no button, reason line: "Truck is stationary (breakdown)" (AC-X3.1) |

Order: Suggested → other feasible (meets promise first, then by cost) → NEW_WINDOW → NOTIFY_ONLY → infeasible. The suggestion rule text (from #29 `suggestionRule`) sits above the cards.

### 9.2 Choose flow
1. Click "Choose" → `ConfirmRecoveryDialog`: summary (what changes, new ETA, cost), customer message preview ("Plant X confirmed: replacement truck. New estimate 17:50 ± 20 min."), optional note, **Confirm** button. NEW_WINDOW opens `NewWindowDialog`, which shows the option's fixed `newWindowEnd` read-only ("Agreed window for this shipment until 19:30 — customer must accept") and the preview ETA; there is no time picker, so the preview and the execution use the same window (L4). After confirm the card shows "Waiting for customer acceptance"; if the customer accepts, the card shows "Accepted 11:3x — new promise 19:30".
2. On success (#30): toast "Recovery confirmed"; card shows "Chosen by Meera at 11:25"; for REPLACEMENT_TRUCK a line "Driver changed: Ramesh → <replacement driver>" (from `driverChange`).
3. On `409 STALE_OPTIONS`: `StaleOptionsBanner` "Options changed — review the updated cards", options refetch; nothing is applied.
4. On `409 ALREADY_DONE`: "An option was already chosen for this alert" + refresh.
API: **#29**, **#30**, **#27** (customer response shown above the cards: "Customer accepted the proposal at 11:20").

---

## 10. Historical shipment replay (`/shipments/:id/replay`)

### 10.1 Layout
```
┌ Header: ← SHP-1042 · Replay · First at risk 11:10 · 6 h 50 m before promise (teal callout) ┐
├─────────── Map (left 7/12): position at selected snapshot ──┬── Snapshot (right 5/12) ─────┤
│                                                             │ Level · ETA ± range · slack  │
│                                                             │ Waterfall at this moment     │
├─────────── EtaTimelineChart (full width, 220 px) ───────────────────────────────────────────┤
│ y = time of day; predicted ETA line (2 px primary) with range band (primary-subtle);       │
│ promised-by line (dashed navy); x = simulation time; event markers on the x axis            │
├─────────── Scrubber (full width) ──────────────────────────────────────────────────────────┤
│ ◀ ▶  ━━━━━━━●━━━━━━━━━━  11:10   [Play replay ▷]   markers: gate out · rain · report · alert · recovery │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
### 10.2 Behaviour
- Scrubber snaps to snapshots; ←/→ keys step one snapshot; Home/End jump to first/last. `role="slider"` with `aria-valuetext="11:10, At risk, estimated arrival Friday 08:00"`.
- Moving the scrubber updates map position (the snapshot's `position`, computed by the server from the route at that time), level, ETA and waterfall (AC-X1.2).
- **First at risk** marker: red diamond on the timeline + callout with lead time (AC-X1.1). If the shipment never reached AT_RISK: "Never at risk" callout.
- "Play replay" animates through snapshots at 1 per second (disabled under reduced motion; manual stepping still works).
- Event markers have tooltips (event summary + time) and are keyboard-focusable.
API: **#19**, **#10**.

---

## 11. Customer portal

Only the customer's own company data is ever requested or shown (server-scoped; AC-M1.2, AC-M1.4, AC-M1.6).

### 11.1 Orders (`/orders`)
- Page title "Your orders"; at-risk orders first.
- **Alert banner** at top when any active alert exists (`CustomerAlertBanner`): red/amber tint by level, "Order ORD-7781 is at risk of missing Thu 18:00", plain reason, proposed action ("Proposed — Plant X team confirming: replacement truck…" or "Plant X team is reviewing options"), and response buttons **Accept proposal** · **Prefer to wait** · **Request a call** (AC-M4.6). After responding: "Thanks — Plant X will confirm shortly." with the chosen response shown.
- **Order cards:** order code, grades and tonnes, promise, `StatusBadge`, estimated arrival ± range, plain status ("On the way · expected 17:50"), shipment count (split shown as "2 shipments").
- Responsive: 1-column cards < 768 px; 2-column ≥ 1024 px.

### 11.2 Order detail (`/orders/:id`)
- Header: order code, promise, overall status.
- Per shipment: `CustomerEtaCard` (estimated arrival ± range, promise, level, plain reason, "Rule-based estimate" note), `PlainMilestones` (no actor names), map (own route + truck), transporter name (no driver identity).
- Notifications related to the order inline.

### 11.3 Notifications (`/notifications`)
List with unread dots, "Mark all as read". Text rendered from `templateKey` + `params` via i18n, falling back to `text`.

### 11.4 API
**#3**, **#4**, **#10**, **#11**, **#12**, **#13**, **#15**, **#16**, **#18** (customer view), **#26**, **#27**, **#28**, **#31**, **#32**, **#33**.

### 11.5 Language
Plain words only (spec §10). No factor codes, no party names, no driver identity. Second language only if G-LANG passes.

---

## 12. Driver portal (mobile-first)

Target: 360 × 740 px; works up to 480 px wide centred on larger screens. Tap targets ≥ 48 × 48 px (spec asks ≥ 44). Body text 16 px. High contrast; usable in sunlight.

### 12.1 Trip (`/trip`)
```
┌─────────────────────────────┐
│ My trip            ☰       │
│ SHP-1042 · Kestrel, Pune    │
│ [Hand-over banner, if any]  │
│ ┌─────────────────────────┐ │
│ │ NEXT STEP               │ │
│ │ Gate out                │ │
│ │ [  Mark gate out  ]     │ │  ← 56 px primary button
│ │ blocked reason if any   │ │
│ └─────────────────────────┘ │
│ Estimated arrival 17:50     │
│ Promised by 18:00           │
│ Instruction (if any)        │
│ ▸ Route map (collapsed)     │
│ Open reports: Breakdown ·   │
│   Pending review            │
│                             │
│ [ ⚠ Report a problem ]      │  ← 56 px, sticky bottom
└─────────────────────────────┘
```
- **Next step card:** shows `nextMilestone` and a single primary button; if `canRecordNext` is false, the button is disabled and `nextBlockedReason` is shown ("38 km to destination", "Receiving opens at 08:00", "Unloading finishes at 18:50"). After physical arrival the card reads "At Kestrel's gate — confirm arrival"; the recorded arrival time is the physical arrival time, not the tap time (L6). On tap → confirm sheet "Mark gate out at 09:30?" → #17. Errors (`409 INVALID_TRANSITION`) show the server's plain reason.
- **Hand-over banner (D3):** from `recentHandovers` — "Load handed over to TRK-11 at 11:25. Your trip for SHP-1042 has ended." For the replacement driver, `instruction` reads "Collect load from TRK-07 near Lonavala".
- **Mini route map:** collapsed by default (saves data and attention); expands to a 240 px map with own route, truck and destination (#10, #11).
- Empty state (no assigned shipment): "No trip assigned right now."

### 12.2 Report a problem (`/trip/report`) — ≤ 3 taps for a chip (AC-F2.1)
1. **Reason chips** grid (2 columns, 64 px tall, icon + text): Breakdown · Waiting at plant gate · Traffic jam · Road closed · Heavy rain · Documents / checkpost · Waiting to unload · Other.
2. Optional text box "Or describe it" (280 chars, counter). Typing calls **#22** (debounced 400 ms) → `SuggestionConfirm`: "Suggested: **Breakdown** — matched: *tyre*, *puncture*. Is this right?" **Yes** / **Pick another** (AC-F2.2). Nothing is sent until confirmed.
3. "How long?" chips: 30 min · 1 h · 2 h · 4 h+ (optional).
4. **Send report** (56 px) → **#23** → success state: "Plant X has been informed." + summary + "Back to trip".
- Fast path: tap a chip → Send (2 taps + send).
- Voice input is not offered (team restriction).

### 12.3 API
**#2**, **#3**, **#4**, **#10**, **#11**, **#17**, **#21**, **#22**, **#23**.

---

## 13. Analytics dashboard (`/dashboard`)

### 13.1 Layout
```
┌ Filter bar (sticky): Period [7d | 30d | 60d] · Lane [All ▾] · Transporter [All ▾] · "Fictional seeded data" ┐
├ Impact KPIs: On-time % · Arrived · Median delay (late) · Median warning lead · Proactive notice rate · Recovered % · Renegotiated ┤
├ On-time % by lane (bar) ───────────────┬ On-time % by transporter (bar) ───────────────┤
├ Weekly on-time trend (line) ───────────┬ Delay minutes by party (100% stacked bar) ────┤
├ Delay causes by reason (horizontal bar, sorted) ──────────────────────────────────────────┤
├ Transporter table: delivered · raw on-time · fair on-time · gap · median delay · top cause ┤
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- One request (**#36**) per filter change keeps every chart consistent (AC-M5.3). Filter options from **#38**.
- Every chart card: title, one-line definition (from `definitions`), "Chart / Table" toggle (AC-M5.5), hover tooltips per mark, value labels on bars. No dual axes.
- **Transporter table:** raw vs fair on-time side by side; the gap cell is highlighted (primary-subtle) and, for small transporters, a "Small fleet" chip and explanation popover ("Most late minutes on this lane were attributed to plant gate waits and weather"). Row click → drill-down list via **#14** (`status=all`, `arrivedFrom`/`arrivedTo` = the filter window).
- KPI definitions: on-time = arrived at the receiving gate by the **agreed** promise (L1, D4); renegotiated count shown separately.
- Empty filter result: "No deliveries match these filters" with "Clear filters".
- Responsive: 2-column grid ≥ 1280 px; 1 column below.

### 13.2 API
**#36**, **#38**, **#14**, **#34** (from drill-down to a shipment).

---

## 14. Other coordinator screens (brief)
| Screen | Content | API |
|---|---|---|
| Driver reports (`/reports`) | Queue of pending reports (cards as in §7.6); tabs Pending / Confirmed | #24, #25 |
| Simulation (`/simulation`) | Full-page version of the dock: clock controls, disruption form (kind, segments from #38 grouped by route, slowdown %, duration), active/ended disruptions list with "End now", impact summary after each injection ("3 shipments affected · 0 at risk · 1 now Watch"), Reset demo | #4–#9, #38 |

---

## 15. Cross-cutting states

| State | Pattern |
|---|---|
| Loading | Skeletons shaped like the final content (`surface-sunken` blocks, shimmer off under reduced motion). Never a full-page spinner after first load. Buttons show inline spinners. |
| Empty | `EmptyState`: icon, one-line title, one-line help, optional action. Examples: "No live shipments", "No alerts — everything is on track", "No deliveries match these filters". |
| Error (request) | `ErrorState` in the card: "Couldn't load shipments" + "Try again"; details hidden behind "Show details" (request id). |
| Error (action) | Inline under the control or toast; server `message` shown (plain English by contract). |
| Not found / out of scope | "This item is not available" — same message for missing and out-of-scope (matches 404 design). |
| Conflict (409) | Context banner (stale options, already done, invalid transition) with a refresh action. |
| Reconnecting | Top banner after 3 failed #4 polls: "Reconnecting…"; data stays visible but marked stale (muted timestamp "Updated 12 s ago"). |
| Simulation paused / error | Badge "PAUSED"; amber banner for `simError`. |
| Session expired (401) | Redirect to login with "Your session ended. Please sign in again." |
| Rule-based notice | Every ETA view has "Rule-based estimate" with a link to the rules (#20). |

---

## 16. Accessibility requirements (WCAG 2.1 AA target)

- **Contrast:** text ≥ 4.5:1 (tokens in §2 meet this on canvas and surface); non-text UI (input borders, focus ring, chart marks) ≥ 3:1.
- **Not colour alone:** levels, parties, outcomes always carry icon + text; charts have legends and table views; unattributed has texture.
- **Keyboard:** every action reachable; visible focus ring; logical tab order; list arrow-key navigation; scrubber slider keys; dialogs trap focus and restore it on close; `Esc` closes overlays.
- **Screen readers:** landmarks (`header`, `nav`, `main`, `aside`); headings in order; `aria-live="polite"` for new alerts (rate-limited); icon-only buttons labelled; map markers labelled; charts have a text summary and table.
- **Forms:** visible labels; errors linked via `aria-describedby`; required fields marked in text.
- **Motion:** honour `prefers-reduced-motion` (no pulsing, no marker tweening, no replay autoplay).
- **Touch:** driver targets ≥ 48 px; spacing ≥ 8 px between targets.
- **Language:** `lang="en"` on `<html>`; second-language strings tagged with their own `lang` if G-LANG passes.
- **Zoom:** layouts usable at 200% browser zoom on 1280 px (coordinator) and at 360 px with 130% text (driver).

## 17. Responsive requirements

| Screen | 360 | 768 | 1024 | 1280 | 1536+ |
|---|---|---|---|---|---|
| Login | Stacked | Stacked | Split | Split | Split |
| Control tower | Notice + stacked | Notice + stacked | Stacked (list / map / panel) | Full 3-column (drawer panel) | Full 3-column |
| Shipment detail | — | 1 column | 1 column | 2 columns (8/4) | 2 columns |
| Replay | — | Stacked | Stacked | Map + snapshot side by side | Same |
| Dashboard | — | 1 column | 1 column | 2-column grid | 2-column grid |
| Customer portal | 1 column | 1 column | 2-column cards | 2-column | 3-column cards |
| Driver portal | **Primary target** | Centred 480 px | Centred 480 px | Centred 480 px | Centred 480 px |

---

## 18. Demo-specific UI notes (journeys §5)
- Three Chrome cookie jars (D2): coordinator at 1440 px (normal profile), customer at ~900 px (Incognito), driver at 360 px (Guest).
- The hand-over (D3): the driver window logs out and logs in as the replacement driver before J8.
- Pre-demo: "Reset demo" from the Simulation dock → Thu 10:25, paused (L2). The presenter uses "Advance to…" before each scripted step (10:30, 11:10, 11:20, 11:25, 17:50, 18:50).
- Large text in the coordinator window is not needed; rely on hierarchy and the selected-shipment highlight for the audience.

---

## 19. Visual QA checklist (run before feature stop and before the demo)

**Tokens and consistency**
- [ ] No raw HEX values in components; all colours from tokens.
- [ ] One icon set, one stroke width; icons aligned to text baselines.
- [ ] Numbers use tabular figures; times formatted consistently ("Thu 11:10", "17:50 ± 20 min").
- [ ] Spacing on the 4 px grid; card paddings consistent (16 or 24).
- [ ] Only the login panel uses a gradient; shadows limited to the four tokens.

**Status and meaning**
- [ ] Every level appears with icon + label + colour, on list, map, panel, customer and driver screens.
- [ ] Party colours follow the fixed order; legend present; direct labels where ≤ 4 segments.
- [ ] Wording matches spec §10 (no "fault", "blame", "AI predicts", "guaranteed").
- [ ] "Rule-based estimate", "Simulation", "Fictional data" labels visible where required.
- [ ] CO₂e shows "method under verification" until G-CO2 passes.

**Layout**
- [ ] Control tower at 1280, 1440, 1920: no overlap, no clipped text, map fills space, KPI strip on one row (scroll ≤ 1280).
- [ ] Driver at 360 × 740: primary action visible without scrolling; sticky report button does not cover content.
- [ ] Customer at 360 and 1024: alert banner and buttons fully visible.
- [ ] Long names (customer, segment labels) truncate with tooltip, never overflow.

**States**
- [ ] Loading, empty, error, conflict, reconnecting, paused states seen at least once each.
- [ ] 404 page identical for missing and out-of-scope items.

**Accessibility**
- [ ] Keyboard-only run through J1, J5, J6, J7 succeeds.
- [ ] Contrast spot-check with a tool on the five main screens.
- [ ] Reduced-motion run: no pulsing, no tweening, no autoplay.
- [ ] Screen-reader smoke test on login, control tower list, recovery dialog.

**Offline and data**
- [ ] Wi-Fi off: map, fonts and icons render; Network panel shows only `localhost` requests.
- [ ] Customer and driver windows show no driver phone, no party names, no other customers' data.
- [ ] The hero run matches the journeys' sequence (rain → report → alert → response → recovery → replay → dashboard).

---

## 20. Decision log

All items that were open in revision 0.1 are resolved (architecture §0.1).

| # | Item | Resolution |
|---|---|---|
| 1 | Activity feed data source | **L7** — `GET /api/audit` (#37) with existing filters (§6.5) |
| 2 | Arrival vs delivery wording | **L1** — "Estimated arrival" and "Promised by" refer to arrival at the receiving gate; "Delivered" means unloading complete |
| 3 | Demo start time | **L2** — reset to Thu 10:25, paused |
| 4 | Icon dependency | **L9** — `lucide-react` |
| 5 | UI library set | **L9** — React, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack Query, React Router, Recharts, MapLibre GL JS, lucide-react. Nothing else without approval. |
| 6 | Self-hosted Inter | **L9** — approved |
| 7 | NEW_WINDOW and receiving hours | **L4** — shipment-specific override; dialog shows the fixed window (§9.2) |

Gated features stay disabled (L10): CO₂e shows "method under verification"; no second language until verified.
