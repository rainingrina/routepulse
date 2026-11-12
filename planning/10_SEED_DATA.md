# 10 — Seed data facts and assumptions

PROGRESS task 4.5. Every value the seed creates is **fictional** (Plant X). Real city locations are used only as map geography. Source of truth for the values: `apps/api/src/seed/` (this file documents them; if they differ, the code wins and this file must be updated).

Seed name `hero-v1` · demo day **Thu 2026-11-19** · the seed leaves the clock at **Thu 08:00 IST, paused**. All timestamps are stored as UTC instants; business times are shown in Asia/Kolkata.

## 1. Determinism
- Every row has a fixed, readable id (`shp_1042`, `hshp_0001`, `trk_11`, …).
- History uses a fixed-seed PRNG (mulberry32, seed `20261119`); no `Math.random()`, no wall-clock time.
- Re-running the seed truncates and re-inserts in one transaction → identical business data, no duplicates. `SimState.worldVersion` keeps increasing.
- Intentionally not deterministic (excluded from reproducibility digests): bcrypt password hashes (random salt), real-time `createdAt` / `updatedAt`, `worldVersion`.

## 2. Reference data
| Entity | Values |
|---|---|
| Plant | Plant X (fictional), map position 19.0326 N, 73.1175 E |
| Customers (6) | Kestrel Moulders (Pune), Osprey Containers (Nashik), Plover Packaging (Surat), Avocet Polymers (Ahmedabad), Merlin Extrusions (Indore), Shrike Pipes (Nagpur). Receiving 08:00–18:00, unloading 60 min [A] |
| Transporters (5) | Ghatline Carriers (fleet 4, small), Coastway Movers (8, small), Bluehill Transport (25), Ironroad Freight (40), Northstar Haulage (60) |
| Trucks (20) | TRK-07 (Ghatline, hero), TRK-11 (Ghatline, AVAILABLE at Khopoli yard, default driver Suresh — replacement truck, D3), 12 assigned to live shipments, others available or in maintenance |
| Users (15) | 1 coordinator, 6 customer buyers (one per customer), 8 drivers incl. Ramesh (hero) and Suresh (replacement). Emails use the reserved `.test` domain; phones are `+91-00000-000xx`. All share the local `SEED_DEMO_PASSWORD` (gitignored `.env`) |

## 3. Routes — HAND-TRACED DEMO GEOMETRY
The one-time open-routing export (decision D5) was not available, so **every route line is hand-traced through a few waypoints**. Lines are approximate illustrations, not routing-engine output and not exact roads. Each stored geometry carries the foreign member `"x_source": "HAND_TRACED_DEMO"`. Segment lengths and baseline speeds are fictional planning values chosen so baseline minutes match the approved documents.

| Route | Segments (km / baseline min) | Length | Baseline |
|---|---|---|---|
| RT-PUNE-A (primary) | PLT-KHP 45/90 · **KHP-LNV-GHAT 20/60** · LNV-PUN 65/120 | 130 km | **270 min** (ghat = baseline min 90–150) |
| RT-PUNE-B (alternate) | PLT-KHP 45/90 · KHP-PUN-S 108/270 | 153 km | 360 min |
| RT-NASH-A (primary) | PLT-THN 35/60 · THN-KSR 70/80 · KSR-NSK 60/70 | 165 km | 210 min |
| RT-NASH-B (alternate) | PLT-THN 35/60 · THN-NSK-ALT 150/200 | 185 km | 260 min |
| RT-SURT-A (primary) | PLT-BWD 40/70 · BWD-VPI 140/180 · VPI-SRT 100/130 | 280 km | 380 min |
| RT-SURT-B (alternate) | PLT-BWD 40/70 · BWD-SRT-COAST 250/360 | 290 km | 430 min |
| RT-AHMD-A | PLT-BWD · BWD-VPI · VPI-SRT · SRT-VDR 150/180 · VDR-AMD 110/120 | 540 km | 680 min |
| RT-INDR-A | PLT-THN · THN-KSR · KSR-NSK · NSK-DHL 160/200 · DHL-IDR 260/330 | 585 km | 740 min |
| RT-NAGP-A | PLT-THN · THN-KSR · KSR-NSK · NSK-AUR 180/240 · AUR-AMR 330/420 · AMR-NGP 155/200 | 830 km | 1,070 min |

Shared segment codes (e.g. `PLT-KHP`, `PLT-THN`) let one disruption affect several routes.

## 4. Live shipments at Thu 08:00 (12)
Nothing has departed, so there is no movement, no incurred delay and **no cached ETA/risk** (filled by the recalculation pipeline from Milestone 4–5).

| Code | Lane | Transporter / truck | State at 08:00 | Planned gate | Planned arrival | Promise |
|---|---|---|---|---|---|---|
| SHP-1036 | Surat | Coastway / TRK-21 | LOADING since 07:30 | 07:30 | Thu 14:30 | Thu 16:30 |
| SHP-1037 | Ahmedabad | Ironroad / TRK-41 | LOADING since 07:40 | 07:40 | Thu 19:40 | Fri 09:00 |
| SHP-1038 | Nagpur | Northstar / TRK-51 | LOADING since 07:50 | 07:50 | Fri 02:20 | Fri 09:00 |
| SHP-1039 | Pune | Bluehill / TRK-31 | AT_GATE since 07:50 | 07:50 | Thu 13:00 | Thu 15:00 |
| SHP-1040 | Indore | Ironroad / TRK-42 | AT_GATE since 07:55 | 07:55 | Thu 20:55 | Fri 09:00 |
| SHP-1041 | Pune | Northstar / TRK-52 | AT_GATE since 08:00 | 08:00 | Thu 13:10 | Thu 15:30 |
| **SHP-1042** | **Pune** | **Ghatline / TRK-07, Ramesh** | **TRUCK_ASSIGNED (manual)** | **08:10** | **Thu 13:20** | **Thu 18:00** |
| SHP-1043 | Nashik | Bluehill / TRK-32 | TRUCK_ASSIGNED | 08:40 | Thu 12:50 | Thu 15:00 |
| SHP-1044 | Surat | Coastway / TRK-22 | TRUCK_ASSIGNED | 09:00 | Thu 16:00 | Thu 18:00 |
| SHP-1045 | Nagpur | Northstar / TRK-53 | TRUCK_ASSIGNED, silent from 11:00 (Low confidence demo) | 09:20 | Fri 03:50 | Fri 09:00 |
| SHP-1046 | Pune | Bluehill / TRK-33 | TRUCK_ASSIGNED | 09:40 | Thu 14:50 | Thu 17:00 |
| SHP-1047 | Indore | Northstar / TRK-54 | TRUCK_ASSIGNED | 10:00 | Thu 23:00 | Fri 09:00 |

**Gate arrangement (3 bays, 40 min loading [A]):** bays busy until 08:10, 08:20, 08:30; queue SHP-1039 → 1040 → 1041. First-come-first-served gives SHP-1042 (at the gate 08:10) the first free bay at **08:50 = its planned departure**, so gate-out 09:30 and 40 min GATE (Plant), as in journeys §3. This is produced by the Milestone 4 simulation, not written by the seed.

**SHP-1042 order ORD-7781:** 14 t PX-PP 110 + 8 t PX-HD 520 (urgent; used by SPLIT).

## 5. History (60 days, 2026-09-20 → 2026-11-18)
Generated by `apps/api/src/seed/history.ts`; distributions are in its header. Current output: **177 delivered shipments**, overall on-time **84.7 %** (arrival ≤ agreed promise, L1).

| Transporter | Shipments | Raw on-time | Fair on-time (but-for rule) |
|---|---|---|---|
| Bluehill Transport | 40 | 70.0 % | 90.0 % |
| Coastway Movers | 37 | 91.9 % | 97.3 % |
| Ghatline Carriers | 43 | 79.1 % | 88.4 % |
| Ironroad Freight | 26 | 100.0 % | 100.0 % |
| Northstar Haulage | 31 | 90.3 % | 96.8 % |

Ledger construction: gate wait (PLANT), pace = round(baseline × r) (TRANSPORTER), external disruption (EXTERNAL, with a seeded `Disruption` row), breakdown (TRANSPORTER, with a confirmed `DriverReport`), receiving-window wait split knock-on. Σ attribution = arrivedAt − plannedArrivalAt for every shipment (tested). `firstAtRiskAt` is the first moment the delay known so far pushed the predicted receiving time past the promise; 29 shipments have a resolved alert, 2 of them recovered by a chosen replacement truck.

**Pace rates r [A]:** Ghatline 0.0753 (p = 0.93), Coastway 0.09, Bluehill 0.05, Ironroad 0.04, Northstar 0.03. Because history stores whole minutes, the Ghatline–Pune pace derivable from history is 20 / 270 = 0.0741; expected HIST minutes match the engine doc's examples (20 at 270, 16 at 214).

## 6. Counts (current seed)
Customer 6 · Transporter 5 · User 15 · Truck 20 · Lane 6 · Route 9 · Order 189 · OrderLine 193 · Shipment 189 (177 historical + 12 live) · ShipmentItem 193 · ShipmentEvent 1,786 · Disruption 41 · DriverReport 14 · Alert 29 · RecoveryOption 2 · Notification 116 · DelayAttribution 405 · RiskSnapshot 0 · AuditLog 0 · SimState 1. Seed time on the development laptop ≈ 0.5 s.

## 7. Not in the seed (by design)
- No RiskSnapshots and no cached ETA/risk: they come from the engine (Milestones 4–5), never invented.
- No hero pre-script: `RESET` will seed and then run 08:00 → 10:25 through the real simulation services (L2, Milestone 4).
- No audit rows: the seed is not a user action; `sim.reset` audit arrives with the reset endpoint.
