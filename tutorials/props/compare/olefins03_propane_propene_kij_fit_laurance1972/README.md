# olefins03_propane_propene_kij_fit_laurance1972 -- ONE binary kij for propene + propane, fitted and held out

`runCase tutorials/props/compare/olefins03_propane_propene_kij_fit_laurance1972`

## The question

`olefins01_propane_propene_laurance1972` showed that with kij = 0 SRK and
Peng-Robinson miss Laurance & Swift's relative volatility by 1.8 % (mean) and
4.6 % (max): too low at the propane-rich end, too high at the propene-rich
end, and the C3 splitter case came out about 17 % short in stages.  Can ONE
constant kij per equation of state, regressed with Choupo's own
`fitParameters`, remove that miss on isotherms it never saw?

## The evidence and the split (written before the fit)

Laurance & Swift, J. Chem. Eng. Data 17 (1972) 333, Table IV: seven isotherms,
nine liquid compositions each, bubble pressure P (the paper's measured and
correlated pressures; alpha and y are computed from them, so the residual is on
P only).  The same 63 rows as olefins01, each file here with a T column added
(a P_bubble fit reads the held temperature from the point).

* FIT: 100, 120, 140, 160 degF (36 points).
* HELD OUT: 110, 130, 150 degF (27 points), interleaved so the test sits
  inside the fitted temperature range, never an extrapolation.
* Residual: `kind P_bubble`, relative, (P_model - P_exp)/P_exp; SRK and PR78
  each fitted separately (two operations, the second with a `thermo {}`
  fragment selecting `PengRobinson`).

## DECLARED BEFORE THE FIT (written before the engine was asked)

The held-out criterion, in the quantity the splitter's tray count depends on:

* **alpha on the 27 held-out points: mean |d alpha| <= 1.0 %, every point <= 3 %**
  (alpha recomputed from the engine's y and x, against the paper's alpha).
  Reason: olefins01's miss is 1.8 % mean / 4.6 % max; a kij that does not at
  least halve the mean is not worth a catalogue record, and 3 % is the
  per-point band olefins01 already declared.
* **bubble pressure on the held-out points: mean <= 0.5 %, every point <= 1.5 %**
  (kij = 0 SRK already meets 0.4 % mean; the fit must not spend pressure
  accuracy to buy alpha).
* The fit's own acceptance entry (`acceptance { maxAAD }`, relative P) is 0.5 %.
* **No band is relaxed after the run.**  If a constant kij cannot remove the
  composition trend (alpha too low at x = 0.1, too high at x = 0.9), that is
  said here as physics, not as a fitting failure.

## The result (every number from the run; alpha recomputed from the engine's y by the gate)

Deviation = engine minus paper, mean of the absolute value over the points; fit = 36 points
(100, 120, 140, 160 degF), held out = 27 (110, 130, 150 degF).

| model, kij | fit: alpha mean / max | held out: alpha mean / max | held out: P mean / max |
|---|---|---|---|
| SRK, kij = 0 (olefins01; all 63 points together, not split) | 1.82 % / 4.62 % | -- | 0.40 % / 1.07 % |
| **SRK, fitted kij = -0.00007** (t95 +-0.0012: zero) | 1.84 % / 4.65 % | **1.82 % / 4.26 %** | 0.37 % / 1.00 % |
| PR78, kij = 0 (the gate's sabotage arm) | 1.81 % / -- | 1.79 % / 4.24 % | 0.76 % / 1.56 % |
| **PR78, fitted kij = +0.00543** (t95 +-0.0009) | 0.69 % / 2.22 % | **0.66 % / 1.97 %** | **0.27 % / 0.58 %** |
| SRK, kij = 0.009 (diagnostic, not fitted) | 0.24 % / 0.81 % | 0.19 % / 0.66 % | 1.34 % / 1.61 % |

The held-out numbers are as good as the fit's, so the number carries to isotherms it never saw.

## Against the band declared before the fit

* **PR78 + kij = 0.00543: INSIDE on every arm** (held-out alpha mean 0.66 % against 1.0 %, max 1.97 % against 3 %;
  held-out P mean 0.27 % against 0.5 %, max 0.58 % against 1.5 %).  The same fit halves the miss of the case it
  replaces (PR kij = 0: 1.79 %) and also improves the pressure.  It is promoted:
  `data/standards/parameters/PengRobinson/propane-propylene.dat`, which names this case (`fittedInCase`).
* **SRK: OUTSIDE.  The pressure regression returns kij = 0** (-0.00007 +- 0.0012), the held-out alpha stays 1.82 %,
  and the held-out pressure verdict says `validated` all the same.  No SRK record is promoted: a number
  indistinguishable from zero that does not change alpha would be a record that says nothing.
* **Why: pressure and relative volatility ask different things of the kij for SRK, not for PR.**  Sensitivity of the
  held-out set to kij (scratch scans of this case's inline-kij form, 14 values):

  | kij | SRK alpha / P | PR alpha / P |
  |---|---|---|
  | -0.004 | 2.60 % / 0.61 % | 2.63 % / 1.29 % |
  | -0.002 | 2.20 % / 0.45 % | 2.21 % / 1.02 % |
  | 0 | 1.82 % / 0.37 % | 1.79 % / 0.76 % |
  | +0.002 | 1.42 % / 0.45 % | 1.38 % / 0.51 % |
  | +0.004 | 1.03 % / 0.67 % | 0.96 % / 0.32 % |
  | +0.006 | 0.63 % / 0.94 % | 0.54 % / 0.26 % |
  | +0.008 | 0.26 % / 1.21 % | 0.22 % / 0.40 % |
  | +0.010 | 0.24 % / 1.48 % | 0.34 % / 0.68 % |

  For PR the minimum of P (about 0.005) sits next to the minimum of alpha (0.008 to 0.009); for SRK the minimum of P
  is at kij = 0 while alpha keeps improving to 0.009, where P is 1.3 % off.  The pressure of a cubic carries the
  pure-fluid vapour-pressure error of each component, which alpha divides out: the SRK vapour pressures of the pair are the
  suspect (not examined here: the pure fluids are not compared separately, see olefins01).  `fitParameters` has no
  relative-volatility residual (kinds `T_bubble`, `P_bubble`, `T_bubble+LLE` only), so a kij chosen on alpha
  cannot be regressed with it today; that is registered as a follow-up, not added to this slice.
* **The composition trend.**  A constant kij CAN remove it: at SRK kij = 0.009 the engine's alpha is -0.30 % at x = 0.1 and
  -0.28 % at x = 0.9 (kij = 0: -3.4 % and +3.0 %).  The PR fit reduces it without removing it (-1.4 % at x = 0.1, +0.8 % at x = 0.9, means over
  the 7 isotherms): the pressure arm of the fit stops it at 0.0054.

## What is NOT claimed

* The hold-out is three isotherms of the SAME table, interleaved inside the fitted range: it tests the interpolation
  in T, not another laboratory, another pressure range or the extrapolation.  The record is `interim`.
* alpha and y in Table IV are computed by the authors from the measured pressures (olefins01's README); the fit uses P only.
* The SRK diagnostic at kij = 0.009 is read off the table above, not regressed, and is not a record.
* Valid for Peng-Robinson only (a kij is not transferable between equations of state: the engine refuses it) and for
  310-345 K, 13-31 bar.

Gate: `bin/curate/check_olefin_vle.py` part (F) reruns this case and pins the fits, the held-out numbers on both sets,
the verdict of the declared band for each model, the record and its reproduction, and a kij = 0 sabotage of the record.
The same record in `tutorials/steady/distillation/c3splitter02_propylene_propane_pr_kij`.
