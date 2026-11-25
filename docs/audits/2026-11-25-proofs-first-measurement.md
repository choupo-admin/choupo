# The proofs of nine, first measurement (C492), 2026-11-25

A MEASUREMENT, not a gate.  Tool: `bin/curate/proofs.py` (with `proofs_closure.py`, the
cloud's verify-the-verifier reader, vendored), not wired into `bin/runTests`.  Engine: this
branch built at origin/main 18fa176c0e (C498 landed) + the tool.  No `src/` edit, no shipped
case touched (every run is a scratch copy through `case_records.copytree`).
Results per case: `~/.cache/choupo/c492/results/T*.case.jsonl`, log `run.log` (the first pass,
before the tool fixes below, is `run0.log`).

## The set: 40 steady cases, one per unit family first, then a second from each family

absorption/absorber01_NH3_water, absorption01_CO2_water; crystallisation/crystalliser01_sugar,
crystalliser02_msmpr; distillation/acetone06_luyben_column_C1, acetone07_luyben_column_C2;
drying/convDryer01_sugar_curve, convDryer02_sugar_countercurrent; economics/economics01_esterification_dcf,
economics02_irr_sweep; electrodialysis/ed01_nacl_desalination, ed02_over_limiting_current;
evaporation/evaporator01_brine, evaporator02_triple_effect_sugar; flash/adiabaticFlash01_benzene_toluene,
analysis01_water_analysis_inlet; flowsheets/acetone03_luyben_reaction_section, ammonia01_synthesis_loop;
gas-solid/bagFilter01_dust, cyclone01_dust_removal; gibbs/claus01_thermal_stage, gibbs01_water_gas_shift;
heat/condenser01_film_nusselt, coolingTower01_merkel; hydraulics/agitation01_helical_ribbon_polymer_melt,
agitation02_yield_stress_refused; membranes/membrane01_RO_NaCl_seawater, membrane02_NF_sugar;
optimisation/designSpec01_triple_equal_areas; plant/ChemicalPlantTutorial; power/brayton01_gas_turbine,
rankine01_water; reactors/aceticAcid01_gibbsReactor; rotating/compressor01_air; separation/psa01_h2_psa;
solids/centrifuge01_tubularBowl_geankoplis; thermo/air01_heater_expand; thermoTest/model1_lumped_evaporator;
userops/userOp01_yield_reactor; utilities/utility01_dowtherm_preheat.
(twoSectorDemo/SECTOR_R is not runnable alone and was dropped; rankine01_water added as the 40th.)

## Totals (final run, tool as committed)

| proof | HOLDS | VIOLATES | NOT JUDGED |
|---|---|---|---|
| T1 homogeneity (feeds x2) | 11 | 0 | 29 |
| T2 component order reversed | 32 | 2 | 6 |
| T3 unit writing (SI) | 38 | 0 | 2 |
| T4 closures recomputed outside the engine | 29 | 0 | 11 |
| T5 admissibility of every stream | 38 | 0 | 2 |
| T6 no-op restart from converged/ | 36 | 0 | 4 |

Worst deviations among the HOLDS: T1 4.9e-8 (ammonia01 loop, tolerance 1e-4 for a recycle),
otherwise <= 5e-12; T2 4.3e-9 (same loop), otherwise 3e-12; T3 7.9e-11 (tolerance 1e-10);
T6 7e-10.  T4: independent mass closure equals the engine's to 1e-4 percentage points in all
29; the lowest closures are claus01_thermal_stage 99.9947 % and ammonia01_synthesis_loop
99.9974 %, both inside the gate's band and both confirmed independently (not report artefacts).

## Sensitivity of the tool (`--sabotage`: ONE number of the transformation's input changed)

flash01_benzene_toluene: T1, T2, T3, T4, T5, T6 all flip from HOLDS to VIOLATES (a feed flow
bumped 1 e-3; T3 a conversion factor 1.001; T4 one converged flow bumped; T5 a negative flow
injected).  rankine01_water: T3, T5, T6 flip; T4 did NOT flip (the bumped file was an internal
stream the topology does not count: a sabotage placement miss, not evidence of vacuity -- the
flash01 flip shows the comparison works); T1 and T2 NOT JUDGED there (declared W_shaft; one component).
Log: `~/.cache/choupo/c492/sabotage.log`.

## Violations, read by hand (final run: 2)

**T2 acetone06_luyben_column_C1 and acetone07_luyben_column_C2: ENGINE (KPI semantics).**
Reversing `components (isopropanol acetone water)` leaves every physical result equal to
4e-9 (D, B, T, duties, compositions) but `x_D_LK` and `x_B_HK` change (C1: x_B_HK 0.884 ->
0.0950, x_D_LK 5e-10 -> 0.0264; C2: x_B_HK 0.988 -> 0.0119, x_D_LK 0.586 -> 0.413).  Source:
`src/unitOperations/distillation/DistillationColumn.cpp:1998-1999` publishes
`x_D_LK = xD[0]` and `x_B_HK = x[N-1][n-1]` "component 0 = light by convention for binary feed",
i.e. the light and heavy key are the first and last name of the LIST, whatever the case says;
these are 3-component columns where neither is the key.  The KPI is a function of the order of
`components`, and a golden pins it.  Smallest reproduction: acetone06 with the list reversed.
Not fixed.  (The iteration count also differs, 18 -> 8 on C1, with equal results; counts are
skipped by the tool as path information.)

## What the first pass found and how each was read (run0.log, tool as first written: 25 flagged)

All of these are the PROOF'S OWN FAULT, fixed in the tool, none an engine defect:
* T1 coolingTower01_merkel: `evaporation_kg_s` was classified intensive because the name
  contains "ratio" (evapo-ratio-n).  Fixed.  T1 analysis01: the feed is a laboratory analysis with
  `volumetricFlow`, not a flow table, and `speciation/flows` were not classed extensive; both fixed;
  holds at 3.6e-12.  T1 centrifuge01_tubularBowl: declares bowlRadius, bowlLength, speed
  (a CASE SPECIFICATION with a size): the domain rule now reads unit-bearing sizes; NOT JUDGED.
* T3 (4): differences of 7e-9 to 1.4e-8 on energy-residual keys (noise by definition, now
  excluded) and, in the two recycle cases (ChemicalPlantTutorial, ammonia01_synthesis_loop), the
  tolerance 1e-10 is below the recycle tolerance; recycle cases are now held to 1e-7.
* T4 (2): ammonia01 and gibbs01 totals of 8.8 and 23 kg/h differ from the CSV at the 5th digit:
  the CSV prints kg/h with four decimals; an absolute floor 6e-5 kg/h was added.
* T5 (2): ChemicalPlantTutorial EthanolVapour / FERMENTATION.Vapour and absorption01 cleanGas
  have fractions summing to 1 + 1.2e-9 and 1 + 1.5e-9.  Judged BENIGN, ENGINE-SIDE NOTE: the
  published composition is not renormalised after a flash converged to ~1e-8; the check's
  tolerance is now 1e-7.  If an exact sum is wanted this is a (small) engine finding.
* T6 (14): 12 restarts REFUSED with "0/ declares an interior ... NOTHING reads it": the
  engine's documented rule is that `converged/internalStates/` is a projection, refused as a seed;
  the tool now restarts from the streams only.  Two columns showed `iterations` 18 -> 0
  (restart at the answer: expected); analysis01 lost `analysisReconciliation` (inlet provenance
  that a converged inlet no longer carries).  Both now skipped as non-results.

## NOT JUDGED, with reasons

* T1 (29): 24 declare a size, duty or volume (area, V_R, volume, W_shaft, Q, distillateRate,
  N_cellpairs, nTubes, filterArea, bodyDiameter, bowlRadius, D, an `area $A` design spec); the key is
  named in each line of the log.  This list is deliberately CONSERVATIVE (any unit-bearing size or a
  known key), so a case whose declared size is inert is also NOT JUDGED.  3 more: userOp01 (needs
  `bin/buildCode`, refused without its user code), agitation02 (refuses by design: density needs
  critical constants), and economics02 / crystalliser (no usable converged feed topology).
* T2 (6): one-component cases (condenser01, air01, rankine01, agitation01), userOp01 and agitation02.
* T3 (2), T5 (2): userOp01 and agitation02 (the base run refuses; both by design).
* T4 (11): the independent reader refuses by name what it does not understand: stream blocks
  `category` (utility streams: 4 cases), `vaporFraction`, `speciation`/`calculated`, a solids-bearing
  file with a text value; `crystalliser` flowsheets it cannot parse (2); economics02 (no `converged/` feed); and the two cases above.
* T6 (4): userOp01, agitation02, ChemicalPlantTutorial (`converged/` holds no state files at the
  top level: a sectored plant) and economics02 (no `converged/`).

## Left undone

* Only 40 of 363 steady cases and 1 of 15 plants; T2-T5 over the whole corpus not run (the cost
  was about seven minutes for the 40 x 6).
* T1 is limited by its domain rule; a per-unit rule (which declared size is inert) would judge more.
* T2 reverses `components` and the stream flow tables only; per-component tables inside a case's
  own `constant/` are not reordered.
* The C498 refusals (negative outlet, broken balance exits non-zero) were not provoked here; T5 found
  no negative flow in the shipped set at this commit, and the tool's own sabotage proves it would see one.
