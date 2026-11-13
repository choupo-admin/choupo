# CI platform rows: phase A measurement (2026-11-13, C384 second half)

Sources: fast job of run 43376184787 (door-batch branch) and main run 43376323217;
nightly full job of 2026-11-12 (2763 mismatch rows). The logs list only rows that
FAILED at 1e-4, so every distribution is conditional on that. Denominators: 1824
expected files, 183028 rows (175257 at 1e-4, 7095 exact).

Fast job: PASS 78 / FAIL 7. Full job: 817 FAIL = 807 cases + 10 gates.

| class | failing / in goldens | rel median | p95 | max | abs max |
|---|---|---|---|---|---|
| minimax_evaluations | 2265 / 4174 | 1.5e-2 | 0.103 | 1.43 | 666 |
| iter | 6 / 4114 | 0.125 | 0.89 | 0.89 | 8 |
| cond_JtJ | 172 / 4109 | 2.3e-3 | 0.218 | 1.4e3 | 2.4e10 |
| chi2 family | 33 / ~4120 | 1.2e-3 | 0.089 | 0.39 | 5.7 |
| rms | 27 / 4257 | 1.1e-3 | 0.088 | 0.18 | 0.047 |
| bubble_aad_fit | 32 / 4084 | 1.1e-3 | 0.060 | 0.16 | 0.038 |
| bubble_max_fit, max_abs_resid, minimax_max_scaled_final | 19/19/15 | 4e-4 | 0.33 | 0.33 | 0.12 |
| relErr, aad_heldout, lle_*, max_abs_corr | 37 | 4e-4..7e-3 | 0.34 | 0.34 | 0.16 |
| params A, B, C, dHvap | 6/6/10/6 | 7e-3..1.6e-2 | .19/.35/.19/.027 | 0.35 | 2.6e3 |
| boundary residual_kW | 10 | 1.1e-3 | 1.5e-2 | 1.5e-2 | 6.6e-3 kW |
| H_closure_gap_kW | 10 | n/a | | | 1.2e-5 kW |
| energy_residual_kJ | 3 | 3.5e-2 | 6.4e-2 | 6.4e-2 | 5.8e-7 kJ |

Residual differences against the energy term of the same balance: H_closure_gap
1e-10 of the unit Q_kW; boundary residual 6.4e-7 of Q_boundary (proxy01: 8e-5 of
Q_boundary 1.98 kW); campaign energy_residual 6e-13; balance energy_residual
2e-15 of the largest published term.

## Optimiser
Minimax (src/propertyOps/FitObjective.cpp, minimise): Nelder-Mead, 5 restarts,
maxEvaluations 1500, pass stops at simplex size < 1e-7 and spread < 1e-9(1+f),
restart ends when improvement < 1e-6 relative: counts are chaotic in the last
places. Least squares (FitParameters.cpp:661-663, 1030-1042): LM, maxIter 40,
tolerance 1e-4 on relative chi2 change, FD step 1e-3: parameters are defined to
about 1e-2 in flat directions. No unordered containers, threads, OpenMP or RNG in
the fit code. Two local runs of acetone-methanol: byte-identical console, 423
evaluations = golden; the runner printed 419. Uninitialised reads not audited.

## Not band questions
rankine02_water converges on the runner to another fixed point (boiler inlet
571.98 K vs 447.69 K); fit_nrtl identifiable 0 vs 1; the route bench differs in
588 of 4975 blocks (math library); check_regressed_pairs 356 values (flat valleys).

## Gates (reason on the runner)
std_includes (ClassifierCore map include, fixed on main); tb_antoine (five
records, four pinned since); compile_clean (HeatExchanger dangling-reference);
membrane_import (openpyxl absent); regressed_pairs and regressed_electrolytes
(optimiser); gmp_layout and batch_plan (record on a probe exits 1, output
discarded); design_sheet (fixture numbers); gui-tests (runLog.test.ts:382 pins
solver numbers, two more unknown).

## Locale and Broken pipe
Bare sorts: runTests 283, 1267, 2491 (and 8847-8848 sort -V),
bin/checkHeaderSelfContained:44; only the batch's two reach a golden. Broken pipe:
printf piped to awk-exit or grep -m1 at runTests 883, 945, 1036, 1171, 1201 (and
2203, 2244, 8000, 8809).
