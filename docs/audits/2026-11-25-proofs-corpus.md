# The proofs of nine over the whole steady corpus and the plants (C492), 2026-11-25

A MEASUREMENT, not a gate.  Tool `bin/curate/proofs.py` (+ `proofs_closure.py`), engine of this branch
(origin/main 18fa176c0e, C498 in).  376 cases: 363 steady + 13 plant cases that `choupoSolve` runs.
One case at a time, -j1, nice 15.  Results (one JSON line per case):
`~/.cache/choupo/c504b/results/T*.all.jsonl`; the first pass before the tool fixes is `results-run1/`.
Every count below is taken from those JSON files, not from the logs.

## Totals

| proof | HOLDS | VIOLATES | NOT JUDGED |
|---|---|---|---|
| T0 base run alone (the corpus's fixed cost) | 360 | - | 16 (base refuses or needs user code) |
| T1 homogeneity (feeds x2) | 97 | 2 | 277 |
| T2 component order reversed | 272 | 54 | 50 |
| T3 unit writing (SI) | 358 | 2 | 16 |
| T4 closures recomputed outside the engine | 250 | 0 | 126 |
| T5 admissibility of every stream | 343 | 0 | 33 |
| T6 no-op restart from converged/ | 318 | 6 | 52 |

NOT JUDGED, by reason (from the JSON):
* T1 277: 243 declare a size, duty, volume or a hardware record (area, V_R, W_shaft, Q, `module`, `stack`...);
  16 base refuses; 14 feeds not identifiable (observer units, no `units (` list); 4 outerDict.
* T2 50: 34 have fewer than 2 components; 16 base refuses.  T3 16: base refuses.  T5 33: 16 base refuses,
  17 the result publishes no streams.
* T4 126: 47 stream blocks the independent reader does not handle (utility `category`, `vaporFraction`,
  `speciation`...); 26 no `converged/` stream files (sweep or outer-driver cases); 16 base refuses; 14 flowsheet
  without a parsable `units (` list; 5 pseudo-component formulas (A, B, C: no elements); the rest, one each
  (a text value `n/a`, observer units, a component record with no formula, 0 or 2 candidate state files for a stream).
* T6 52: 27 no `converged/` stream files; 16 base refuses; 9 sectored plants with no top-level state files.

T1's NOT JUDGED rate (74 %) is the cost of a conservative domain rule: any declared size or hardware record
excludes the case, including those whose size is inert.  A per-unit rule is the way to judge more.

## Wall time of the whole corpus, per proof (sum of per-case seconds, one case at a time)

| proof | seconds (light load / second pass under load) | what it spends |
|---|---|---|
| T0 base runs | 384 | 360 converged runs; the heaviest: column14 19 s, plants tens of seconds |
| T1 | 214 / 297 | one run per judged case (97) |
| T2 | 565 / 630 | one run per case with >= 2 components |
| T3 | 550 / 772 | one run per case |
| T4 | 164 / 256 | no engine run (reads converged/ and reports) |
| T5 | 151 / 422 | no engine run |
| T6 | 371 / 734 | one run per case |

T4 and T5 cost file reading on top of the base runs.  The two columns differ because the machine's load
differed between the passes; the larger figure is the safe one.  Sequentially, base + T1..T6 is about
40 min (light load) to 55 min.  T4 and T5 add under 5 minutes each to a base that exists anyway.

## Violations, read by hand

The first pass of this corpus flagged 131 violations; 70 were the proof's own fault (name-matching
classifier errors: `evaporation_kg_s` read as a ratio, `overflow_*` and `rho_V_out` as flows, a stream named
`aqueous`, component flows nested under a phase block, noise-level quantities such as `H_closure_gap_kW`
1e-9 kW, hardware records such as `module NF270-4040;` or `stack EurodiaED-100P-50;` not seen as declared sizes,
sector-prefixed element rows, pseudo-component formulas A/B/C, state-file digits on 1e-6 flows).  All fixed in the
tool; the numbers above are after the fixes.  What remains:

### T1 (2): solver tolerance, not defects
* extract02_declared_interior: raffinate benzene 3.1e-7 relative (liquid-liquid solver stops at 1e-8; amplified).
* gibbs06_h2_flame_radicals: burnt H 1.35e-7 (cloud's finding, `GibbsMethod.cpp:128`: absolute 1e-8 residual).
  Both are within a factor 3 of the 1e-7 band.  Among the 97 HOLDS 7 exceed 1e-10, 4 exceed 1e-8 (worst 5e-8).

### T2 (54)
* 36 columns: `x_D_LK` / `x_B_HK` change when `components` is reversed.  ENGINE, ALREADY DISPATCHED (C504):
  `DistillationColumn.cpp:1998-1999` takes the keys by list position.  One line: acetone06_luyben_column_C1 with the list
  reversed.  Every other column result is equal (the same two keys; `alpha_mean` in totalReflux01_c6c7_yanagiRun628 has the
  same cause).
* 9 membranes (membrane07, 08, 09, 21, 22, 23, 26, optim04, swro01): `c_ret_elem<n>` is
  `elemRetConc.push_back(Ns > 0 ? c_b[0] : 0.0)`, "first solute" (`SpiralWoundModule.cpp:1620`): a KPI by list
  position.  NEW ENGINE FINDING of the same class as C504.  One line: membrane07 with the list reversed.
* 9 others:
  - ed09_wine_multiionic `demin_ratio` 0.224 -> 0.700: the reference ion is chosen by order
    (`ElectrodialysisStack.cpp:625`): ENGINE, same class.  One line: ed09 reversed.
  - phasechange01_partial_condenser `Q_latent_kW` -556.4 -> -541.7 with total Q equal to 1.4e-8: the sensible/latent
    split depends on order (`PhaseChanger.cpp:705-714`): ENGINE, same class.
  - flash20_ethanol_water_pcsaft 7e-6, vlle03_audit_artificial and vlle05_produced_feed up to 4e-3 (F_alpha 0.011308
    vs 0.011306, 1.2e-4): the phase-split result of a multi-start Gibbs minimisation depends on the order: ENGINE
    (solver path or non-unique minimum), not examined further.  One line: vlle03 reversed.
  - optim07_mads_mixed_column (25 keys), optim06_integer_stages and pareto01_purity_energy (the reversed run fails,
    rc=1, where the base ran; 74 against 62 SQP evaluations in optim06): the optimiser's path depends on the
    order: ENGINE/optimiser (C496's SQP), not examined.  One line: optim06 reversed.

### T3 (2): solver amplification of a 1e-16 rewrite, not defects
* flash20_ethanol_water_pcsaft 1.05e-8 (H_feeds) and process05_isomerization_recycle 1.1e-7 (bottoms neoPentane, a recycle).
  Tolerance used 1e-8 (1e-7 for a recycle): the 1e-10 of the brief is below the solvers' own stopping tolerance
  (19 of the 358 HOLDS exceed 1e-10, 5 exceed 1e-8, worst 7e-8).

### T6 (6)
* stripper01_sour_water, stripper02_sour_water_h2s: ENGINE.  The `converged/feed` stream does not carry the
  declared `phase liquid;` pin that `0/feed` has (R-E2), so the restart resolves the feed to its own equilibrium
  (vapour fraction 0 -> 0.0173, feed H 0.18 %, bottoms T 369.97 -> 369.26 K).  `converged/` is not a faithful
  restart snapshot when a pin was declared.  One line: stripper01 with converged/ as 0/.
* marcilla01_lls_tie_triangle, marcilla02_lls_ternary_invariant: ENGINE.  The engine REFUSES its own written
  state: "the `speciation` block does NOT collapse back to the material of the stream.  Master 'Na': the
  components carry 1.495361e-04 kmol/s ..., the block declares 1.130335e-04".  The writer and the read-back
  check disagree on a two-liquid stream.  One line: marcilla01, copy converged/ (streams only) to 0/, run.
* extract02_declared_interior 9.6e-7 (`N_shortcut`) and ed07_feed_and_bleed 1.5e-4 (a recycle at tolerance 1e-4):
  solver tolerance, not defects.

### T4: 0 violations in 250
Independent mass closure equals the engine's to 1e-4 pp in all 250.  The lowest closures: claus01_thermal_stage
99.9947, pfr_polyesterification 99.9963, polycaprolactonePlant 99.9963, ammoniaPEQ03 / PEQ 99.9971,
ammonia01_synthesis_loop and ammoniaReactor02 99.9974; 22 cases are below 99.999 %, none below 99.99 %.
One known debt shows in the engine's own element report and is not a proof failure: membrane08_softened_scaling
(Ca 0.012 %, Mg 0.020 %, K 0.23 %, Na 142.6 %: the SAC resin takes the cations and no stream carries them; pinned in
`check_element_closure.py:110` at 99.9881).  It contradicts the "named stream" rule of C258 (BRAIN).

### T5: 0 violations in 343
No negative flow, fractions outside [0,1], vapour fraction outside [0,1] or non-positive T, P in any shipped
stream at this commit (C498's refusal had nothing to refuse).  Fractions summing to 1 + 1.2e-9 (the earlier
note) are below the tool's 1e-7 band.

## Where the 5e-5 and 3e-5 of mass go (claus01, ammonia01)

The element balances close to 100.0000 % in both cases, so no atom is lost.  The mass ledger of each case,
summed over the species' net flow times (record MW minus the sum of standard atomic weights of its formula),
reproduces the reported imbalance to the printed digit.

claus01_thermal_stage, total -0.5101 kg/h of 9689.6 (5.3e-5): by unit, furnace -0.4293, boiler -0.0809, burnerMix 0.
By species: S8 -0.3893 (record MW 256.48 against 8 x 32.065 = 256.52), H2S -0.0920 (34.082 against 34.0809 on 82.1 kmol/h),
water -0.0230, O2 -0.0090, S2 -0.0016, SO2 +0.0047; the sum is -0.5101.  The furnace forms the S8, so it
carries 84 % of the gap.

ammonia01_synthesis_loop, total -0.0002 kg/h of 8.83 (2.6e-5), all in the converter: NH3 17.030 against 17.0305,
N2 28.013 against 28.0134, H2 2.016 against 2.0159; 0.466 kmol/h of NH3 formed (the cloud saw the same 2.4e-5 on
ammoniaReactor01).

Judgement: not a loss, an INCONSISTENCY OF THE MW FIELDS of the component records (rounded to 3-4 digits and, for S8,
built on S = 32.06) against the atomic weights the formulas imply.  The balance is correct in atoms and exposed in mass
by rounding.  Remedies, the architect's choice: derive MW from the formula, or a data gate holding `MW` to the formula's
sum within 1e-4 relative; neither changes any physics.  (Script `~/.cache/choupo/proofs/mwloss.py`; atomic weights
H 1.00794, C 12.0107, N 14.0067, O 15.9994, S 32.065, Ar 39.948.)  The other low closures (pfr_polyesterification,
polycaprolactonePlant) were not traced.

## Left undone
* The engine findings above are not fixed (brief); C504 owns the column keys.  The membrane `c_ret_elem`, ED `demin_ratio`
  and PhaseChanger `Q_latent` KPIs are the same class and are not known to be in C504.
* T1's domain is conservative; T4's reader refuses 47 stream-block kinds and 14 flowsheet layouts it should learn.
* Not run: `choupoBatch`, ctrl and semi-continuous cases.
