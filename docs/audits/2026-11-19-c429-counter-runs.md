# C429: the counter-runs, and the case for a trace class (2026-11-19)

Branch `build/comparator-tests`, cut from `origin/integ/final-1118`.  Three parts:
the comparator's own gate (code, in this commit), the three attributions of
`2026-11-18-c429-hidden-moves.md` that were "by timeline" now isolated by a
counter-run, and a census of the 58 hidden moves against the solvers' own
tolerances with a proposal (nothing applied).

## Part 1 in one paragraph

`bin/curate/within_tol.awk` is now the ONE comparison; `bin/runTests`
(`within_tol`) and the new gate `bin/curate/check_golden_comparator.py` both run
that file.  Old inline awk against the file, on every one of the 180 147 non-`exact`
golden rows of `tutorials/` and `data/` (each at expected, +1e-9, +1e-6, +1e-3,
x1.5, x-1 and 0: 1 261 029 verdicts): 0 differences (script
`cmp_equiv.py`, kept in the scratch area).  The gate found a second defect of the
C429 family while it was written: awk coerces `nan` and `inf` to 0, so an actual
`nan` PASSED against an expected 0 or any `abs:` band (probe: `nan` vs 0 at
1e-4: exit 0; `nan` vs 0 under `abs:1e-9`: exit 0).  Now a non-finite or
non-numeric actual FAILS, a non-finite expected or a malformed band is REFUSED.
No shipped golden row is affected (the 1.26 M verdicts are identical).

## Part 3: the counter-runs

Method.  All three causes are DATA changes (a record, a case copy of a record), so
the counter-run holds the engine constant (one build, the tip of this branch,
`make -j1`, linux64Gcc) and changes only the data, in a scratch `CHOUPO_HOME`
or scratch case copy: stronger than a before/after pair of binaries, which would
also move the code.  Two builds would have been affordable in disk but not in
memory tonight (1-4 GB available), and were not needed.  `CHOUPO_PINS=announce`
(the cases pin the catalogue by hash and refuse a drift in strict mode).
Scratch material is deleted at the end of the run.

### Cause A, the ion limiting diffusivities (C403 / C413 3b): CONFIRMED

Counter-run: the six species records whose D0 differs between a case's held copy
and the catalogue (Ca +0.13 %, Mg -0.14 %, SO4 +0.94 %, Tart +6.42 %, HTart
+11.72 %, H2PO4 -20.19 %; Br -3.83 %, Cl -0.15 % for dspmde01) get the held
copy's D0 in a scratch catalogue; the CURRENT cases run on it.

| case | blind rows | rows reproduced by the old D0 alone (1e-4) |
|---|---|---|
| ed08_wine_kht_model_solution | 1 | 1 of 1 (HTart 7.568e-10 -> 8.455e-10 with the D0) |
| ed09_wine_multiionic | 8 listed in the golden, 4 moved by the cause | 7 of 8; the eighth, `D_ion_H2PO4` (golden 8.46e-10), already equalled the catalogue's new D0 (the held copy said 1.06e-9): it was never one of the 4 moved rows |
| ed04_limiting_current_multiionic | 18 | 18 of 18 |
| dspmde01_water_treatment_salts | 16 pore concentrations | 16 of 16 (Br -3.83 %, Cl -0.15 % alone) |
| membrane24_fit_then_simulate [props] | 1 | not re-run (one row of a fit, -0.0012 %; attributed by the ions concerned) |

The first attempt, running the cases as they stood at 3919cd715^ and 3919cd715
on the current engine, could not be used: neither runs on today's engine (the
solution-density door and the pins refuse them), which is itself a finding for
anyone reading old commits.

### Cause B, water vapour pressure on IAPWS (5429c3140, 2026-11-16): CONFIRMED for two rows, PARTIAL for the third

Counter-run: current engine and cases; scratch catalogue with (psatOld) water.dat
and `chemistry/water-vapour-equilibrium.dat` reverse-patched to before 5429c3140;
(pairsOld) the 24 water-pair records of 788d0c753 put back; (bothOld) both.

| case | row | old golden | current | psatOld | pairsOld | bothOld |
|---|---|---|---|---|---|---|
| acetonePlant | C1.x_D_LK | 4.94903618327e-10 | 5.15380297886e-10 | 4.94903618327e-10 | = current | = psatOld |
| still02_ethanol_water_azeo | n_ethanol_final | 3.38836968904e-11 | 2.08003362152e-11 | 3.38836968904e-11 | = current | = psatOld |
| acetone06_luyben_column_C1 | C1.x_D_LK | 5.08121687919e-10 | 5.23541828358e-10 | 5.03051375517e-10 | = current | = psatOld |

- acetonePlant and still02: with the IAPWS block alone reverted the run
  reproduces the old golden to all twelve digits.  CONFIRMED, and the 24 water pair
  refits move none of the three rows (pairsOld equals current to the digit).
- acetone06: the IAPWS block alone moves the row +4.07 % (5.0305e-10 to
  5.2354e-10); the old golden (recorded 2026-08-13, commit 5d9fa059d) is 1.0 %
  above what the current engine gives on the old curve.  So B is the cause of
  +4.07 % in a net +3.03 %, and a second, older cause of -1.0 % sits between
  2026-08-13 and 2026-11-16 (candidates: the column's enthalpy surface, 94a739541
  of 10-26, the feed thermal state d6a984701 of 09-12; not isolated, it needs
  an engine bisection).  The audit's attribution stands for the direction and
  the dominant size, not for the whole move.
- The still row is 2.1e-11 kmol against the batch integrator's default atol of
  1e-9, and it still reproduces bit for bit: below atol is not the same as
  noise.  See Part 2.

### Cause C, radical thermochemistry re-sourced (684b4e709, C170/C335): WRONG ATTRIBUTION for ignition01 and four nox01 rows, CONFIRMED for the rest

Counter-run: the five combustion/Gibbs cases as they stood at 684b4e709^ (case
copies of H, O, OH, HO2, H2O2 as before) and at 684b4e709, both on the CURRENT
engine, so the difference of the two runs is the data re-source alone.  "rest" is
before-data run against the old golden (what moved before 684b4e709, or without
it); "data step" is the 684b4e709 record change.

| case | row | old golden | before-data run | after-data run | total | data step | rest |
|---|---|---|---|---|---|---|---|
| ignition01 | bomb.n_H2O2_final | 2.5941e-11 | 1.0971e-10 | 9.6066e-11 | +270.3 % | -12.44 % | **+322.9 %** |
| ignition01 | bomb.n_HO2_final | 1.9749e-10 | 9.6477e-10 | 9.1280e-10 | +362.2 % | -5.39 % | **+388.5 %** |
| ignition02 | n_H2O2_final | 3.9447e-11 | 3.9454e-11 | 3.4841e-11 | -11.68 % | -11.69 % | +0.02 % |
| ignition02 | n_HO2_final | 4.2753e-10 | 4.2746e-10 | 4.0596e-10 | -5.05 % | -5.03 % | -0.02 % |
| nox01 | n_H2O2_final | 1.0502e-12 | 1.0502e-12 | 1.0370e-12 | -1.26 % | -1.26 % | 0.00 % |
| nox01 | n_HO2_final | 1.6149e-11 | 1.6146e-11 | 1.6316e-11 | +1.03 % | +1.05 % | -0.02 % |
| nox01 | n_H_final | 6.0237e-10 | 6.0250e-10 | 6.0250e-10 | +0.02 % | 0.00 % | +0.02 % |
| nox01 | n_N2O_final | 1.3726e-12 | 1.3792e-12 | 1.3792e-12 | +0.48 % | 0.00 % | **+0.48 %** |
| nox01 | n_NH_final | 2.5052e-15 | 2.5085e-15 | 2.4932e-15 | -0.48 % | -0.61 % | +0.13 % |
| nox01 | n_N_final | 2.2616e-14 | 2.2621e-14 | 2.2620e-14 | +0.02 % | -0.01 % | +0.02 % |
| claus01 | boiler.y_CS2 | 1.4250e-10 | = golden | 1.4294e-10 | +0.31 % | +0.31 % | 0 |
| claus01 | boiler.y_S | 4.5152e-18 | = golden | 4.3495e-18 | -3.67 % | -3.67 % | 0 |
| claus01 | boiler.y_SO | 6.7616e-11 | = golden | 6.7547e-11 | -0.10 % | -0.10 % | 0 |
| claus01 | furnace.y_O2 | 2.0895e-10 | 2.0890e-10 | 2.0925e-10 | +0.14 % | +0.17 % | -0.02 % |
| claus01 | furnace.y_S8 | 9.3689e-14 | 9.3711e-14 | 9.2428e-14 | -1.35 % | -1.37 % | +0.02 % |

Verdicts:

- ignition02 (2 rows), claus01 (5 rows), nox01 H2O2, HO2, NH: CONFIRMED, the data
  step is the whole move.
- nox01 H and N: the "move" is 0.02 %, inside noise of the comparison between two
  engines (2e-4); no cause needed.
- ignition01 (2 rows) and nox01 N2O: WRONG ATTRIBUTION.  The +362 % on HO2 is not
  684b4e709's: that commit moves it -5.4 %.  The rest (4.9x) is already in the
  case as it stood at 684b4e709^, and the case as it stood at b87cc7ba2 (C164,
  2026-10-25, "combustion cases off GRI-Mech: O Conaire kinetics, NASA-9 thermo, no
  NNH") gives the same 9.64766251182e-10 on the current engine.  The visible rows
  of that commit moved (ignition01 T_final 2641 K to 3078 K, re-recorded
  row by row in 1af0b85b5); the two trace rows below 1e-9 were skipped by the
  blind comparison and kept their 2026-07-14 values through C164, C185 (thirdBody,
  10-31, code), 684b4e709 and the hand re-pins.  Check of C185: the golden
  that 1af0b85b5 recorded on the pre-C185 engine for the visible rows equals the
  current engine on the same data to 8e-10 relative (T_final 3077.97900108 vs
  3077.97900347), so the 10-31 code change did not move this case.  The cause of
  ignition01's rows and of nox01's N2O is C164 (the mechanism and the Cp
  overrides), not C170/C335.  684b4e709's own commit message ("91 rows moved
  inside their own tolerance, put back to their old values") is where the
  trace rows were last put back to a value C164 had already made stale.
- Running the pre-C164 case (b87cc7ba2^) on the current engine aborts (exit 2):
  an old case does not necessarily run on today's engine.

## Part 2: a class for traces below the solver's tolerance (census; nothing applied)

The 58 hidden moves by what bounds their digits:

| group | rows | cases | value range | the solver's own scale | in the candidate set |
|---|---|---|---|---|---|
| A, ion D0 (physical input data, D_ion, D_eff, pore concentrations) | 40 | 5 | 1e-12 to 1e-9 (a diffusivity IS 1e-9 m2/s) | no solver: a record's number | no |
| B, columns x_D_LK ~ 5e-10 | 2 | 2 | 5.1e-10, 5.2e-10 | simultaneous MESH Newton, tolerance 1e-9 (DistillationColumn.cpp:3496) | yes |
| B, still n_ethanol_final | 1 | 1 | 2.1e-11 kmol | integrator atol 1e-9 default (choupoBatch/main.cpp:348) | yes |
| C, ignition/nox01 trace radicals | 10 | 3 | 2.5e-15 to 9.1e-10 kmol | batch reactor ODE: hard-coded atol 1e-15 species, rtol 1e-7 (BatchReactor.cpp:1088-1090): NOT 1e-9 | partly: relative resolution is 1e-7, so these are not below the solver's scale |
| C, claus01 trace y | 5 | 1 | 4.5e-18 to 2.1e-10 | Gibbs minimiser, 1e-8 on the element balance (GibbsMethod.cpp:128) | yes |

Candidate set: 18 rows in 7 cases (B 3, C 15 if claus01's 5 and the 10 batch rows are
counted, the batch ones only on the default-atol reading).  Findings that bear on a
class:

1. NONE of the 18 behaves like noise.  Each one reproduced either bit for bit
   (B: psatOld equals the old golden to 12 digits months later) or to 1e-4
   (C: before-data runs equal the old golden to 2e-4 where the data did not
   move) under the other, unrelated data; and each responded to the data that
   changed by exactly what physics gives (ignition02 -11.7 %, claus01 y_S -3.7 %).
   A digit that moves with an input and not with a restart is signal, not noise.
2. A `trace_below_solver_tol` class with an absolute band at the solver's tolerance
   would have PASSED every one of the real moves above (claus01 y_S at -3.7 %,
   ignition02 at -11.7 %, nox01 at 1.3 %, still02 at -38.6 %) and the 4.9x
   ignition01 change: the C429 defect again, declared.  The ignition01 row is the
   case in point: tolerance-sized traces are the ones a thermochemistry or
   mechanism error shows up in first.
3. Where noise IS real is between platforms (the CI runner differs from the
   maintainer's machine in the last digits).  That is what the existing PLATFORM
   group of `golden_bands.tsv` is for (applied only in cross mode, never on disk,
   never tighter than the file's band).

PROPOSAL.  Do not add a strict-mode class.  If the GitHub runner measures
divergence on these rows, add one class to the platform group, `trace_platform`,
kinds kpi/diag, rule `rel`, a band set from the measured spread (not from the
solver tolerance), keyed by an explicit name list pinned in
`bin/curate/golden_bands.tsv` with the case's reason, so that strict mode on the
recording machine stays relative on every non-zero value.  Decision belongs to the
architect; the data to take it (a runner sweep of the 18 rows) does not exist yet.

## What else the work turned up

- `bin/choupo-import` (the sealing importer's golden reader, lines ~1591-1605)
  is a SECOND implementation of the comparison, still carrying the `> 1e-9`
  floor of the C429 defect (its comment calls it "runTests' rule, floor
  included") and unable to read an `abs:` band.  Not touched: not in this
  slice's files.  Seals of cases whose goldens carry `abs:` rows will crash on
  `float("abs:...")` and a physical row at or below 1e-9 is compared absolutely
  at the relative tolerance there.  Recommended: have it call `within_tol.awk`.
- `bin/curate/check_golden_bands.py` cuts `within_tol()` out of `bin/runTests`
  by text; the function now needs `$ROOT` (its arm was updated to pass it).
- `check_gate_selftest.py` has two new sabotage arms (the `ae > 1e-9` floor put
  back into the awk, and the non-numeric-actual test removed).  The full selftest
  was NOT run (nightly tier, memory 1-4 GB); both sabotages were applied by hand
  and the gate failed both (floor: 4 lines of (a); non-finite: 20+ lines of (d)).
