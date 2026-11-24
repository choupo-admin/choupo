# nox03_millerbowman_large_seulex -- the same 235-reaction vessel with `integrator seulex;`

**What it shows.**  The case `nox03_millerbowman_large` (read its README for the mechanism, the vessel and
the comparison with Cantera) integrated with **seulex**, the extrapolated linearly-implicit Euler method of
Hairer & Wanner (1996, IV.9) that OpenFOAM's chemistry uses by default, instead of Rosenbrock23.  Only the
`integrator` word differs.  Theory Guide, section *Extrapolating the linearly-implicit Euler method*.

**What to look at.**  Run it with `CHOUPO_ODE_STATS=1` to print the work counters: about 95 accepted steps
(Rodas4 takes ~730), a Jacobian built on ~90 attempts (the convergence monitor decides, threshold min(1e-4, rtol); Rodas4 builds one per
step) and ~640 factorisations of W (one per extrapolation column, because W = I - h_j J changes with the
sub-step h_j = H/n_j).  The final state (the post-ignition equilibrium) agrees with the Rosenbrock23 case.

**Between the steps.**  The rows written between two steps come from seulex's OWN dense output, the
polynomial through the sub-steps of the step (Hairer & Wanner IV.9, Theory Guide *Dense output: the extrapolated
polynomial*), not from the driver's cubic Hermite as before 2026-11-22 (which put the rows inside the induction
period 4e-2 of a column maximum away from a tight reference).  Grid error against a tight reference, 1 ms
grid: 2.4e-4 at rtol 1e-8 and 2.2e-4 at 1e-10 with `linearSolver dense`, 6.8e-5 and 4.1e-5 with `sparse`
(the step ends themselves: 9e-5, the floor `atol` sets on the trace columns); the dense and sparse runs, which
take the identical steps, differ by 2.4e-4 on the grid (they differed by 1.8e-2).  The polynomial's own error
is not fed back into the step size (that would take 695 steps instead of 95).


# nox03_millerbowman_large -- 235 reactions from a journal table, one batch vessel

**What it is.**  The whole of Appendix A of Miller & Bowman (Prog. Energy Combust. Sci. 15 (1989)
287-338, doi:10.1016/0360-1285(89)90017-8): **235 elementary reactions among 51 species** (C, H,
O, N), 5 of them pressure fall-offs (one Troe, one SRI, three Lindemann) and 21 with a bare third
body, every rate coefficient read from the page images and every reaction named by the number the
paper gives it (A1 ... A234, A5a), with its page, in `constant/reactions`.  It is the case that
shows what the engine does with a mechanism of a size nobody types by hand.

**The vessel.**  Lean methane/air (phi = 0.6) with 100 ppm NO, 1300 K, 1 atm, 1 L, closed,
**adiabatic at constant volume** (`mode adiabatic; energy gasConstantV`, the shock-tube / engine
cell).  Constant volume is chosen because the analytic Jacobian, audited at run time, is available
there (constant pressure integrates on the finite difference, `ignition03`) and because the burned gas
then carries both the heat release and the pressure rise.  The mechanism was built for exactly this
chemistry: the CH + N2 prompt route (A151), the HCN/NCO/NH chain, the NNH route (A216, A221-A227),
N2O (A203-A207), NO2 (A188-A191).

## What it shows

| t / ms | 0 | 1 | 2 | 3 | 5 | 10 | 30 |
|---|---|---|---|---|---|---|---|
| T / K | 1300 | 1307 | 1354 | 2612 | 2603 | 2595 | 2594 |
| NO / ppm | 100 | 83 | 84 | 2917 | 9331 | 14144 | 15008 |
| NO2 / ppm | 0 | 17 | 15 | 2.0 | 6.4 | 9.6 | 10.2 |

* **Induction** (0-2.4 ms): the methane starts to break down and the radical pool builds, and part of the
  initial NO becomes NO2 (17 ppm at 1 ms; the mechanism's route to it is HO2 + NO = NO2 + OH, A188 --
  not checked here by a rate-of-production report).
* **Ignition at 2.4 ms** (Cantera: maximum dT/dt; the write grid of 1 ms says "3 ms"): T jumps to 2612 K,
  P from 1.0 to 2.0 atm.
* **Thermal NO** then grows in the burned gas, 90 % of its final value within 9 ms of the ignition, to
  15008 ppm of NO (NO2 10 ppm) at 30 ms: 99.997 % of the constant-volume adiabatic equilibrium Cantera
  computes from the same charge (NOx 15019.0 ppm, 2593.63 K, 2.0457 bar; here 2593.63 K and 2.0457 bar).

## Held to Cantera, strictly

Same CHEMKIN transcription, the same NASA-9 coefficients Choupo reads (written into the Cantera
input), Cantera 3.2.0 `IdealGasReactor`, adiabatic, constant volume:

| | Choupo (shipped, rtol 1e-8) | Choupo (rtol 1e-11) |
|---|---|---|
| NOx at 30 ms | 15018.5503 ppm | 15018.5476 ppm (Cantera 15018.5475) |
| T at 30 ms, largest T difference over all times | 0.044 K | 2e-5 K |
| every species above x = 1e-6, every write time | 1.8e-3 relative | 8.6e-7 relative |

The 1.8e-3 sits at the 2 ms write, in the induction, where the radical pool grows by decades per
millisecond; it is the integration error of the second-order Rosenbrock method and shrinks with the
tolerance (`docs/reviews/2026-11-22-miller-bowman/compare_cantera.py large`).  All 235 reactions
balance in elements (Cantera refuses an unbalanced reaction on loading; it loaded all of them).

## Solver

`linearSolver sparse` (the vessel has 52 rows, the sparse path factors W on the network's pattern),
`jacobian analytic`, Rosenbrock23, adaptive: 12 audits of the analytic Jacobian against the dense
finite difference, worst column 1.0e-7 of the column's scale (tolerance 1e-4).

**The dense solve cannot start this charge, and says so.**  With `linearSolver dense` (or `auto`,
which is dense below 100 rows) the integration stops at t = 0: "Rosenbrock23 gave up at t = 0 s (0 %
of the interval) -- hMin: the step fell below the floor after a rejected step (a positive row driven
negative) -- the row driven negative is row 15 of unit 'vessel' (n_CH2OH)".  The same with the finite
difference Jacobian, with Rodas4, with rtol 1e-4 ... 1e-6, with a seed of every absent species from
1e-20 to 1e-8 (a seed of 1e-6 runs 98 % of the first millisecond and then fails the same way at
n_C2H5).  The sparse path completes and equals Cantera, so the sparse and dense results
could not be compared to 1e-10 on this case; they were compared (identical to the 9 printed
digits) on a single 73-reaction vessel of `nox02`.  Recorded as an engine finding, not worked
around: the case ships the path that runs.

## Wall time (before C471; Choupo's step is still tied to `writeInterval`)

Same mechanism, thermochemistry, charge and machine; the reference is Cantera at rtol 1e-12.
Best of three, `docs/reviews/2026-11-22-miller-bowman/timing.py`:

| | wall / s | max rel dev from the reference |
|---|---|---|
| Cantera rtol 1e-6 | 0.027 | 2e-5 |
| Cantera rtol 1e-8 | 0.042 | 7e-7 |
| Choupo rtol 1e-6 | 0.24 | 5e-2 |
| **Choupo rtol 1e-8 (shipped)** | **1.06** | **1.8e-3** |
| Choupo rtol 1e-10 | 8.2 | 1.8e-5 |

Choupo needs 0.24 s for the accuracy Cantera reaches in 0.03 s at 2e-5, and 8 s for 2e-5: a factor
of 25 to 300.  Where the time goes (callgrind, instruction counts, shipped tolerance, whole process):
the right-hand side 43.5 % (of which the equilibrium constants, a Gibbs energy of every species
re-evaluated from NASA-9 at each call, 13.4 %, and the `pow` of the rate laws 18.7 %), the analytic
Jacobian 34.1 % (the gradient of the rate laws 21.9 %), the sparse factorisation 11.9 % and its solves
3.4 %; writing the 31 state directories costs below 0.3 %; reading the case 4 %.  Choupo takes 3448
accepted steps where CVODES takes 2427 at the same rtol 1e-8: about 0.3 ms a step against 17 microseconds,
a factor of 17 per step and 1.4 in the count.

## Known differences and what was not done

* **Thermochemistry.**  NASA/TP-2002-211556 (stable species as case-local NASA-9 overrides,
  radicals from the NASA table) and, for the nine species the table lacks (NNH, CH2CO, 1CH2, H2CN, HOCN,
  HCNO, HCCOH, C3H2, C4H3), RRHO-computed records anchored to ATcT (Theory Guide `sec:rrho-thermo`).  The paper's Table 1 (p. 289) prints heats of
  formation that differ from ATcT for five of them (paper minus ATcT, kJ/mol): 1CH2 -4.6, NNH -5.0,
  H2CN +8.7, HOCN +5.3, HCNO -8.8.  The case keeps one thermochemistry per run and does not switch.
* **Reading of the Troe footnote (A1).**  The paper prints F_cent = (1-a) exp(-T/T*) + a exp(-T**/T)
  with a = 0.604, T* = 6927, T** = 132.  The case reads the three numbers as the CHEMKIN-II `TROE / a T*** T* /`
  of the same mechanism family, F_cent = (1-a) exp(-T/6927) + a exp(-T/132); the printed exponent
  of the second term (-T**/T) looks like a typesetting inversion.  A1 is 2CH3 (+M) = C2H6 (+M): the choice
  moves no printed number here.
* **SRI (A2)** prints four numbers (0.45 797 979 1.): read as a b c d with e = 0.
* **Mass closure 2e-6** (element closure 1e-15): the species records carry molar masses from three
  sources (the NASA report's record lines, standard atomic weights, the catalogue), which differ in the
  sixth digit; the atoms close exactly.
* **No measurement stands behind this case.**  Appendix A is a mechanism, not an experiment;
  `nox02` is the one held to the paper's own comparison.  Not done: the Petersen, Davidson & Hanson
  (1999) shock-tube point on this mechanism; no constant-pressure run (the audited Jacobian is not
  available there).

## Files

`constant/reactions` (generated by `bin/curate/chemkin_to_choupo.py` from the transcription, with the
paper's reaction numbers and pages), `constant/components/` (stable species, NASA-9),
`0/internalStates/vessel`, `expected` (golden).  Regenerate with
`docs/reviews/2026-11-22-miller-bowman/build_cases.py`.
