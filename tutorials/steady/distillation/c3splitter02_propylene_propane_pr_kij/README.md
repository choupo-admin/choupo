# c3splitter02_propylene_propane_pr_kij -- the C3 splitter on Peng-Robinson with the fitted propene-propane kij

`runCase tutorials/steady/distillation/c3splitter02_propylene_propane_pr_kij`

## What it is

`c3splitter01_propylene_propane` with ONE change: the thermodynamics is Peng-Robinson (PR78) with the propene-propane
kij = 0.00543 that `tutorials/props/compare/olefins03_propane_propene_kij_fit_laurance1972` regressed on the bubble
pressures of Laurance & Swift (fit 100/120/140/160 degF, held out 110/130/150; held-out alpha 0.66 % against 1.8 % for kij = 0).
The record is the catalogue's, `data/standards/parameters/PengRobinson/propane-propylene.dat`, found by name; it names its case.
The specification is the same ILLUSTRATIVE one (feed 100 kmol/h, 70 mol % propylene, liquid, 316.0 K, 17 bar, distillate
99.0 % of the propylene and 1.16 % of the propane, R = 1.2 R_min); nothing here is a published plant.

## Three units on three identical feeds

* `fug`, Fenske-Underwood-Gilliland at the feed's bubble point (316.33 K on this package): alpha = 1.1206, N_min = 79.4,
  R_min = 11.63, R = 13.96, **N = 159.8** theoretical stages, feed at stage 91.2.
* `mesh`, the full MESH column at the shortcut's numbers rounded up (161 stages, feed 92, R = 13.96): it delivers
  **99.03** mol % propylene overhead and 96.62 mol % propane in the bottoms, SHORT of the specification (99.5 / 97.69).
  In c3splitter01 the same comparison agreed to 0.1 point.  The reason is the one the kij introduces: the real alpha falls
  toward the propylene-rich end (the paper's 1.20 at x = 0.1 to 1.10 at x = 0.9), and the shortcut's constant alpha taken at the
  feed (x = 0.7) is too optimistic for the top section.  It is the constant-alpha method's limit, now visible because the
  thermodynamics has a composition-dependent alpha.
* `meshM`, the full MESH column at the tower the MEASURED alpha implies (173 stages, feed 99, R = 15.23; below): it delivers
  **99.51** mol % propylene overhead and **97.71** mol % propane in the bottoms, i.e. the specification (99.5 / 97.69) within 0.02 point.

## Stages and reflux, four ways

| | alpha | N_min | R_min | R (1.2 R_min) | N (theoretical) |
|---|---|---|---|---|---|
| SRK, kij = 0 (c3splitter01) | 1.1345 | 71.6 | 10.42 | 12.51 | 144.6 |
| PR78, kij = 0 (this case without its `binaryInteractions` block) | 1.1332 | 72.3 | 10.53 | 12.63 | 145.9 |
| **PR78, kij = 0.00543 (this case)** | **1.1206** | 79.4 | 11.63 | **13.96** | **159.8** |
| measured alpha (Laurance & Swift at this T, x = 0.7) | 1.1105 | 86.2 | 12.70 | 15.23 | 173.2 |
| this case against the measured-alpha tower | +0.9 % | | | **-8.4 %** | **-7.7 %** |

With kij = 0 the engine's tower is 16.5 % short in stages and 17.9 % in reflux; with the fitted kij it is 7.7 % and 8.4 %
short: the miss is halved, not closed.  What remains is the 0.9 % that alpha still lies above the measurement at x = 0.7
amplified about 8-fold by alpha - 1 = 0.11 (a tower goes as 1 / ln alpha).

## What is NOT claimed

* No published column: the stage count, reflux and purities are an illustrative design problem.
* The measured-alpha tower is Fenske-Underwood-Gilliland arithmetic on ONE alpha (constant alpha); `meshM` shows it is
  a good design on the rigorous column with this kij, which is a statement about the model, not about a plant.
* The kij was fitted to pressure on the SAME paper whose alpha it is compared with (the hold-out is three isotherms of it): the
  closeness to the measured alpha is in sample to that table.  The SRK splitter of c3splitter01 keeps kij = 0 because the
  pressure regression for SRK returns zero (olefins03 README).
* Energy closure of `mesh` and `meshM` is closed by construction on the reboiler and verified by the unit's second route.

Gate: `bin/curate/check_olefin_vle.py` part (G): the shortcut equals the textbook arithmetic on its own alpha to 0.5 %, the
tower against the measured-alpha tower is pinned, `mesh` is pinned short of the specification and `meshM` meets it within 0.002.
