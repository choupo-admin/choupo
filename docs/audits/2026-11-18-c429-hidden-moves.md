# C429: what the blind comparison was hiding (2026-11-18)

Method.  The comparison was made honest (a non-zero expected value is compared
relatively whatever its size; round-off classes carry an absolute band in
`bin/curate/golden_bands.tsv`), the 181 cases holding a golden row with
0 < |value| <= 1e-9 (plus the cases whose goldens the new classes rewrote) were run with `bin/runTests --scope` on the build of this
tree, and every row that turned red was traced.  Census of the rows:
`2026-11-18-c429-blind-rows-census.tsv` (999 rows: 167 physical, 6 fit
statistics, 826 round-off residuals, closures, identities and zero-by-construction
quantities, each with its class).

First pass after the change: 174 PASS / 15 FAIL (63 rows).  Rows that were red
only because the recorded value was a round-off quantity (batch24: three rows,
pb82 and the brackish case: two saturation indices at equilibrium) went away
with their classes (`residual_saturation`, `zero_balance`, `zero_pressure_drop`);
no value was touched.  The other 58 rows in 12 cases are real moves, 0 of
UNKNOWN cause:

## Cause A: the ion limiting diffusivities (C403, re-pointed by C413 slice 3b)

Commit 3919cd715 lists the D0 changes (Cl -0.15 %, SO4 +0.9 %, Mg -0.14 %,
Br -3.8 %, Ca +0.13 %, HTart +11.7 %, Tart +6.4 %, H2PO4 -20 %) and
"recorded by hand from the mismatch lines": the rows below 1e-9 (a diffusivity
IS a number of order 1e-9 m2/s) never appeared in a mismatch line, so they kept
their pre-C403 value.  Every row below moved by the size that D0 change predicts.

| case | rows | old -> new | worst |
|---|---|---|---|
| ed08_wine_kht_model_solution | 1 | D_ion_HTart 7.568e-10 -> 8.455e-10 | +11.72 % (= the D0 change exactly) |
| ed09_wine_multiionic | 4 | HTart +11.72 %, Tart +6.42 %, Ca +0.126 %, Mg -0.142 % | +11.72 % |
| ed04_limiting_current_multiionic | 18 | D_ion_SO4 +0.943 %, D_ion_Mg -0.142 %, D_eff +0.016 % (6 stages x 3) | +0.94 % |
| dspmde01_water_treatment_salts | 16 | permeate pore concentrations of Br (-3.5 to -4.1 %, D0 -3.8 %), Cl (-0.48 to -0.56 %, D0 -0.15 %), F, NO3 (-0.36 to -0.42 %), CO3 (-0.31, -0.67 %), SO4 (-0.30, -0.59 %) | -4.06 % |
| membrane24_fit_then_simulate [props] | 1 | fitted parameter 6.7476e-10 -> 6.74752e-10 | -0.0012 % (its band 1e-5; 3919cd715 records the fit's chi2 moving -0.015 %) |

Total 40 rows.  dspmde01 and membrane24 are attributed by the commit's own list
and by the ions concerned (only ions whose D0 moved show up); the pore
concentrations amplify a D0 change by up to a factor 4 (Cl -0.15 % -> -0.56 %),
as the visible rows of the same case did in 3919cd715 (Robs_Br_p1 +44 %).
This was not isolated by running the case on the old record, so it is cause
"attributed by the dated change that moved the same case's visible rows".

## Cause B: the water vapour pressure on IAPWS and the water pair refits (2026-11-16)

Cases whose golden rows were re-recorded on 11-16 by a tool that rewrote only the
rows a mismatch line named; the trace rows below 1e-9 kept their earlier value.

| case | row | old -> new |
|---|---|---|
| acetone06_luyben_column_C1 | C1.x_D_LK | 5.081e-10 -> 5.235e-10 (+3.0 %) |
| acetonePlant | C1.x_D_LK | 4.949e-10 -> 5.154e-10 (+4.1 %) |
| still02_ethanol_water_azeo | n_ethanol_final | 3.388e-11 -> 2.080e-11 (-38.6 %) |

Commits 585067883, 4733d2e29 and af3d0a344 ("water Psat: moved golden rows") moved
the visible rows of the same three cases.  All three carry water.  CAUTION: the
still's row is 2e-11 kmol, below the batch integrator's default atol of 1e-9
(`src/applications/choupoBatch/main.cpp:348`), so its value is set by the
integrator's step history and is large in relative terms for a small cause; the
column rows are a trace in a converged column.  Attributed by timeline, not
isolated by a counter-run.

## Cause C: the NonCommercial compilation's thermochemistry replaced (C170, C335 step 1)

Commit 684b4e709 (2026-11-12) re-imported the H, O, OH, HO2, H2O2 (and S, S2, SO,
CS2, NO) records from NASA/TP-2002-211556 and states: "--record also re-pinned
91 rows that moved inside their own tolerance (tiny mole numbers under the 1e-9
absolute floor), and those were put back to their old values so the golden
changes by exactly the list".  Those rows are these, still at the value recorded
at the release of 2026-07-14 (git history of the files shows no later value):

| case | rows | worst |
|---|---|---|
| ignition01_h2o2 | n_H2O2_final 2.594e-11 -> 9.607e-11, n_HO2_final 1.975e-10 -> 9.128e-10 | +362 % / +362 % (4.6x on HO2) |
| ignition02_h2air_slack | n_H2O2, n_HO2 (-12 %, -5 %) | -11.7 % |
| nox01_zeldovich_postflame | 6 trace species (H2O2, HO2, H, N2O, NH, N) | -1.3 %, +1.0 %, +0.02 % ... worst 1.3 % |
| claus01_thermal_stage | y_CS2 +0.31 %, y_S -3.7 %, y_SO -0.10 %, y_O2 +0.14 %, y_S8 -1.3 % | -3.7 % |

Control run: ignition01 on its own case files as of 684b4e709 with the present
engine gives the present values bit for bit (`n_HO2_final 9.12802450492e-10`), and
the main species (n_H, n_OH, T_final) equal the golden to twelve digits, so the
move lives in the HO2/H2O2 thermochemistry, not in the integrator.  Between the two
the species' two records changed source (GRI -> NASA TP-2002), which moves the
equilibrium constants that set the reverse rates of the trace radicals.

## Summary by cause

| cause | cases | rows | worst |
|---|---|---|---|
| A  ion D0 (C403 via C413 3b) | 5 | 40 | HTart +11.72 % (ed08, ed09) |
| B  water Psat IAPWS 2026-11-16 | 3 | 3 | still02 n_ethanol_final -38.6 % |
| C  radicals' thermo, C170/C335 (rows reverted on 11-12) | 4 | 15 | ignition01 HO2/H2O2 +362 % |
| UNKNOWN | 0 | 0 | |

All 12 cases re-recorded by rewriting exactly these 58 rows (no `--record` of a whole
case, no anchor row touched); the cases then pass `--scope` with the conservation
gates.  Two follow-ups this audit does NOT fix (registered by name): the
ignition and still rows are below the integrator's atol, so a counter-run of
cause B and C on the old engine would be the way to promote "attributed" to
"isolated"; and `D_ion_*` rows that had no relative move in other cases were
not blind (they matched).
