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

Read at commit cec127f1562d (2026-11-24); the times below are not all write points of the shipped log grid (91 points, 20 per decade from 1 us),
so they are taken from a scratch copy of the case on a uniform 1 ms write grid (the same dense output; at 1, 10 and 30 ms, which the
shipped grid also writes, the values are identical).

| t / ms | 0 | 1 | 2 | 3 | 5 | 10 | 30 |
|---|---|---|---|---|---|---|---|
| T / K | 1300 | 1307 | 1354 | 2612 | 2603 | 2595 | 2594 |
| NO / ppm | 100 | 83 | 84 | 2917 | 9331 | 14144 | 15008 |
| NO2 / ppm | 0 | 17 | 15 | 2.0 | 6.4 | 9.6 | 10.2 |

* **Induction** (0-2.4 ms): the methane starts to break down and the radical pool builds, and part of the
  initial NO becomes NO2 (17 ppm at 1 ms; the mechanism's route to it is HO2 + NO = NO2 + OH, A188 --
  not checked here by a rate-of-production report).
* **Ignition at 2.4 ms** (`tauIgnition` = 2.380 ms, maximum dT/dt on the integrator's dense output; Cantera 3.2.0, maximum dT/dt of its own steps: 2.3802 ms; a 1 ms write grid alone would say "3 ms"): T jumps to 2612 K,
  P from 1.0 to 2.0 atm.
* **Thermal NO** then grows in the burned gas, 90 % of its final value within 9 ms of the ignition, to
  15008 ppm of NO (NO2 10 ppm) at 30 ms: 99.997 % of the constant-volume adiabatic equilibrium Cantera
  computes from the same charge (NOx 15019.0 ppm, 2593.63 K, 2.0457 bar; here 2593.63 K and 2.0457 bar).

## Held to Cantera

Same CHEMKIN transcription, the same NASA-9 coefficients Choupo reads (written into the Cantera
input by `cantera_mech.py`), Cantera 3.2.0 `IdealGasReactor`, adiabatic, constant volume, CVODES rtol 1e-10, atol 1e-20,
compared by `docs/reviews/2026-11-22-miller-bowman/compare_cantera.py large` at the write times of the Choupo run (deviation
max |x - x_Cantera| / max(x_Cantera, 1e-9) over all times and species).

**Current (2026-11-24, commit cec127f1562d, Cantera 3.2.0, atol 1e-15 kmol).**  The agreement depends on the write grid, because since C471
the trajectory between the integrator's steps is its dense output (a stage polynomial, not error-controlled):

| | shipped, rtol 1e-8, log grid (91 points) | rtol 1e-8, uniform 1 ms (31 points) | rtol 1e-11, uniform 1 ms | rtol 1e-11, log grid |
|---|---|---|---|---|
| NOx at 30 ms / ppm (Cantera 15018.5475) | 15018.5509 | 15018.5509 | 15018.5481 | 15018.5481 |
| largest T difference over all times | 0.35 K | 0.044 K | 0.013 K | 0.11 K |
| species above x = 1e-6, every write time | 7.0e-3 | 1.8e-3 | 5.7e-4 | 2.2e-3 |
| every species above 1e-9, every write time | 6.3e-2 (HCHO at 16 us) | 2.6e-3 (CH2CO at 2 ms) | 8.0e-4 | 6.2e-2 |

The final state is unaffected (NOx within 4e-4 ppm of Cantera, T_final and P_final to the printed digits); what the grid changes is the
interpolated points inside the induction, where the radical pool grows by decades per millisecond.  The shipped log grid puts many points
there, so its worst deviation (7.0e-3 on the species above 1e-6) is larger than the 1.8e-3 quoted before, and tightening the tolerance no
longer shrinks it to 1e-6 as it did when the step was tied to the write interval: the interpolation, not the step control, sets it.

**Historical (2026-11-22, before C471 free stepping, uniform 1 ms grid, Cantera 3.2.0):** NOx at 30 ms 15018.5503 ppm at rtol 1e-8
(15018.5476 at rtol 1e-11, Cantera 15018.5475); T difference 0.044 K (2e-5 K at 1e-11); species above 1e-6: 1.8e-3 (8.6e-7 at 1e-11).  The rtol 1e-8
column is reproduced today on the uniform grid (1.8e-3, 0.044 K); the rtol 1e-11 column is not (5.7e-4, 0.013 K).  All 235 reactions
balance in elements (Cantera refuses an unbalanced reaction on loading; it loaded all of them).

## Solver

`linearSolver sparse` (the vessel has 52 rows, the sparse path factors W on the network's pattern),
`jacobian analytic`, Rosenbrock23, adaptive: 12 audits of the analytic Jacobian against the dense
finite difference, worst column 1.0e-7 of the column's scale (tolerance 1e-4).

**The dense solve now starts and finishes (corrected 2026-11-24).**  This README used to say that with `linearSolver dense` (or `auto`,
which is dense below 100 rows) the integration stopped at t = 0, "Rosenbrock23 gave up at t = 0 s ... row 15 of unit 'vessel' (n_CH2OH)",
driven negative by the first rejected step.  That was true on 2026-11-22; since the C474 slice of batch stiff integration (`0efd215206`,
"dense clean-charge start", with the positivity fixes of `7434d6bd9c`) it is not: at commit cec127f1562d `linearSolver dense`, `auto`,
the finite-difference Jacobian with dense, and Rodas4 with dense all run to 30 ms (about 0.8 s each), and the dense run agrees with the sparse
one (T_final 2593.63412794 K and P_final 204569.7303 Pa as printed, tauIgnition 2.380 ms; the NO route closure differs in the eighth digit).  The shipped case keeps `linearSolver sparse`, which is the faster path for 52 rows with 235 reactions' pattern
(2530 entries in L+U); the dense/sparse comparison to 1e-10 was made on the 73-reaction vessel of `nox02` (identical to 9 printed digits).

## Wall time

Current: the shipped case takes 0.69 s for the whole process (one run at commit cec127f1562d, 2026-11-24, this machine; not best of three) and 0.8 s with `linearSolver dense`; the table below is HISTORICAL.

### Historical (2026-11-22, before C471; the step was tied to `writeInterval`)

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

## The two figures (C477)

`system/postDict` declares two views, each one question.  **`ignition`, "when does it ignite, and what NO does it leave?"**:
T on the left axis, NO and NO2 [ppm] on the right, log time, a marker at `tauIgnition` = 2.380 ms, the time of the steepest
temperature rise on the integrator's dense output (Theory Guide `sec:ignition-delay-dense`).  **`noRoutes`, "where does the NO come
from?"**: the net NO formed by five DECLARED sets of Appendix A reactions (`routeIntegral` in `flowsheetDict`: thermal = the N-atom steps
of the extended Zeldovich mechanism, N2O, the NO2 cycle, HNO and NH, and the HCN/NCO branch with its reburning), integrated in time on the
dense output (Theory Guide `sec:route-integrals`).  At 30 ms the thermal class makes 98 % of the net NO (1.38e-7 of 1.41e-7 kmol); the
routes add up to the NO inventory's change to 9 ppm (the run's `[routes]` lines).  The routes are reaction classes, not traced atom paths:
the HCN/NCO class cannot separate prompt NO from fuel-bound nitrogen, and the NNH route has no NO-producing step in this mechanism
(NNH + O gives N2O + H here), so it is not declared.  The write grid is log (`writeSpacing log`, 20 per decade from 1 us, 91 points).
Declared and resolved by `choupoBatch`; not looked at on a screen by its author.

## Files

`constant/reactions` (generated by `bin/curate/chemkin_to_choupo.py` from the transcription, with the
paper's reaction numbers and pages), `constant/components/` (stable species, NASA-9),
`0/internalStates/vessel`, `expected` (golden).  Regenerate with
`docs/reviews/2026-11-22-miller-bowman/build_cases.py`.
