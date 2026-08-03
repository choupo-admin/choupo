# Pinch full programme — scoping (roadmap #8)

**Status: P1 BUILT 2026-08-03 (approved Vítor 2026-08-02).  P2 BUILT
2026-08-03 as an ANALYSIS TABLE per the ratified second-opinion round of
2026-08-03: columns region/hotStream/coldStream/temperatureFeasible/
pinchRule/maximumCandidateDuty/limitingReason/recommendation; every
feasible row is a "thermodynamically admissible candidate" and the word
"optimal" never appears (gate-enforced).  P3 (area/cost targets) stays
UNAUTHORISED — propose again before building it.**  Two conditions rode
with the P1 approval and both are honoured across P1+P2: the pass
*analyses but never rewrites the network* (it is a pure report — it
mutates nothing but its own KPI block and artefacts), and the METHOD
HYPOTHESES (constant CP per segment, the near-isothermal latent slice,
first non-utility stream pairing, raw current-duty sums; P2: pinch
clipping, the counter-current end-approach bound, the CP rule binding
only at the pinch) are stated in `src/postProcessing/PinchPass.H` where
the reader of the code meets them first.

P2 as built: `reports/pinch/candidateMatches.csv` (exhaustive hot×cold
pairs per region), KPIs `pinch.candidates_total / candidates_admissible /
violation_heat_below_pinch_kW / violation_cool_above_pinch_kW`, the
coursework violation diagnostics printed per unit, and — on the
pinch01 classic — the identity check the header hand-works: violations
120 + 260 = 380 kW = Q_heat_current − Q_H_min.  A pinch match violating
the CP rule is still reported with its away-from-pinch feasible duty
("admissible only away from the pinch"), never silently dropped.  Gate:
`bin/curate/check_pinch_p2.py` (independent duty recomputation, exact
CP-rule wording, the no-"optimal" language boundary, the excess
identity; sabotage-verified — flipped below-pinch inequality → 4 probes
fail by value).

Built: `pinchPass` PostProcessor (postDict chain, `pinchPass { dTmin
10 K; }`), printed Linnhoff-Flower problem table, KPIs
`pinch.Q_H_min_kW / Q_C_min_kW / T_pinch_K` (+hot/cold, +current
duties), `reports/pinch/compositeCurves.csv`.  Witness:
`tutorials/steady/heat/pinch01_four_stream_classic` (targets 107.5 kW /
40 kW / pinch 90 °C hot, hand-worked in the flowsheetDict header).
Gate: `bin/curate/check_pinch_p1.py` — independent Python cascade,
CSV coherence, negative (never runs uninvited), dTmin ≤ 0 refusal;
sabotage-verified (wrong shift → 3 probes fail by value).

Date: 2026-08-02 (scoping) / 2026-08-03 (P1 built).

---

## 1. What exists today (the heuristic screen)

`src/reporting/UtilityAllocationReport.{H,cpp}` —
`allocateUtilities(result, flowsheet, dTmin = 10 K)`: every unit DUTY
(the `Q` KPI) is allocated to the lowest-grade catalogue utility that is
still hot/cold enough at the declared approach.  That is *utility
targeting per duty, independently* — the pinch-analysis way of PICKING a
service, but with no interaction between duties: no composite curves, no
problem table, no recognition that a hot stream could heat a cold one
before either touches a utility (beyond the explicit `heatLink`s the
author draws or the auto-detected condenser feedbacks).  The batch
campaign allocator reuses the same `pickForDuty` rule.  Roadmap #8's
"real match sizing beyond the heuristic screen" is everything the
per-duty view cannot see.

## 2. What the full programme adds (in pedagogical order)

**P1 — Targets (pure report, no sizing).**
Extract the hot/cold stream population from the converged result: every
unit that changes a stream's temperature contributes a segment
(T_supply, T_target, CP = |Q|/|ΔT|; latent segments enter as
near-isothermal slices at their T with CP from the phase-change duty —
the engine already knows every one of these numbers).  Then, at a
declared `dTmin`:

* **composite curves** (hot + cold, shifted) → CSV artefact the GUI can
  plot;
* **problem table** (Linnhoff & Flower 1978) printed cascade-row by
  cascade-row at verbosity ≥ 3 — the glass-box heart of the feature;
* **energy targets**: Q_H,min, Q_C,min, the pinch temperature(s);
* the honest comparison line: *current* utility consumption (what
  `allocateUtilities` reports today) vs the *target* — the number that
  tells a student how much integration their flowsheet is leaving on
  the table.

**P2 — Match recommendations (a table, never a rewiring).**
Above/below-pinch decomposition with the CP feasibility rules of the
pinch design method (Linnhoff & Hindmarsh 1983, the primary): a printed
candidate-match table (stream pair, side of pinch, feasible duty, the
rule that admitted it) plus the three refusal diagnostics students meet
in coursework (match across the pinch; heater below it; cooler above
it) applied to the AUTHOR'S existing network and reported by name.  The
flowsheet is NEVER modified: the author owns the topology (the
no-silent-crutch stance); the engine says what the physics permits and
what the current network violates.

**P3 — Area and cost targets.**
Vertical (Bath-formula) area targeting from the balanced composite
curves, exchanger-count target (N_min = S − 1 per side of pinch), and a
cost target through the EXISTING `ShellTubeHX` + `Guthrie` chain — so
`economics/` can print "network as built vs area/cost target at this
dTmin", and a `dTmin` sweep via the ordinary `SweepDriver` exposes the
energy-capital trade-off (the classic supertargeting plot) with zero
new driver machinery.

## 3. Where it lives (architecture)

A **PostProcessor pass** (`pinchPass`, declared in the `postDict`
chain) — layer 3 by the book: it consumes a converged
`SimulationResult`, writes artefacts (`reports/pinch/compositeCurves.csv`,
`problemTable.csv`, KPIs `pinch.Q_H_min` / `Q_C_min` / `T_pinch` /
`area_target_m2`), and never touches the solve.  Stream-segment
extraction is the one new shared object (`PinchStreams`), built read-only
from the result; `dTmin` defaults to the utility report's 10 K and both
read it from ONE declared home so the screen and the programme can never
disagree silently.

Data it needs that already exists: per-unit duties (KPIs), stream T/P/z
and enthalpies (converged state), phase-change duties (the units
announce them), the utilities catalogue, ShellTubeHX + Guthrie.  Data it
needs that does NOT exist: nothing — this is why the feature is cheap
relative to its pedagogical weight.

## 4. Witness cases (external-reference pattern)

* `pinch01_four_stream_classic` — the four-stream textbook problem of
  Linnhoff & Hindmarsh (1983): published targets and pinch temperature
  golden-locked digit for digit; ONE coherent primary end to end.
* `pinch02_flowsheet_screen` — run the pass over an existing corpus
  flowsheet (candidate: `heatlink02_condenser_feed_preheat`) and lock
  the current-vs-target gap; the case that shows the feature on OUR
  kind of flowsheet, not just the textbook table.
* Sweep witness — `dTmin` ∈ [5, 30] K via `SweepDriver` reproducing the
  supertargeting curve's shape.

## 5. Deliberately OUT

Automatic network synthesis / flowsheet rewiring (MER MINLP — the
equation-oriented dream stays deferred), retrofit analysis, splitting
recommendations beyond the CP-rule flags, multi-period/batch pinch (the
batch temporal-utility half is its own named pending item), and total
site analysis.

## 6. Staging & cost

Three slices matching P1→P3, each with its witness + theory-guide
section before the next starts; est. P1 ≈ one file pair + extraction
object (+300 lines), P2 ≈ +200, P3 ≈ +150 reusing sizing/costing.  No
new deps, no grammar beyond `postDict { pinchPass { dTmin 10 K; } }`.

---

**Decision requested from Vítor:** approve the P1→P3 staging (or trim to
P1-only first), the `pinchPass`/`postDict` home, and the
Linnhoff-primary witness choice — or amend.
