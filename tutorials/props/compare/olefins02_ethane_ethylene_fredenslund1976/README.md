# olefins02_ethane_ethylene_fredenslund1976 -- does a cubic equation of state see the relative volatility of the C2 splitter?

`runCase tutorials/props/compare/olefins02_ethane_ethylene_fredenslund1976`

## The question

The ethylene splitter is the other close-boiling tower of an olefins plant
(Tb 169.42 and 184.55 K, the catalogue's records; in the measurements below the
relative volatility is 1.08 to 1.57).  Before
the engine's column is believed on this pair, its thermodynamics has to meet a
measurement.  With the catalogue's own Tc, Pc, omega and NO interaction
parameter, how close do SRK and Peng-Robinson come to the measured bubble
pressures, vapour compositions and relative volatility of ethylene (1) +
ethane (2)?

## The evidence

Fredenslund, Mollerup & Hall, J. Chem. Eng. Data 21 (1976) 301, Table I
(p. 302): 8 interior points at 263.15 K (18.34 to 31.94 atm) and 6 at 293.15 K
(37.14 to 47.85 atm).  A vapour-recirculation cell, the vapour SAMPLED:
x, y and P are measurements (mole fractions "only believed accurate to within
0.003", the paper's footnote).  The paper's own "calculated" columns are not
used.  Transcribed from the page image at 220 dpi.  293.15 K is above
ethylene's critical temperature (282.34 K, the catalogue's record): the measurements stop at
x = 0.4532, and the paper treats ethylene there in the unsymmetric convention.

## DECLARED BEFORE THE FIRST RUN (written before the engine was asked)

kij = 0 (no ethylene-ethane kij exists in the catalogue; none is fitted).

* **alpha, each of the 14 points: |alpha_engine - alpha_measured| <= max(5 % of
  alpha_measured, the point's own measurement uncertainty).**  The measurement
  uncertainty is propagated from the paper's +-0.003 on x and on y (the
  worst of the four corners): 2.4 to 5 % in the middle of the diagram and 11 to
  13 % at the dilute ends (x = 0.046, 0.054, 0.939), where alpha is a ratio of
  two small numbers.  A comparison tighter than the measurement is not a
  comparison.
* **alpha, mean |deviation| over the 14 points: <= 4 %.**
* **bubble pressure, every point: <= 4 %; mean <= 2 %.**  (The cubic's pure
  vapour pressures at 263 K are good to about 2 %; at 293 K the mixture is
  near ethylene's critical region and is held less tight.)
* **vapour mole fraction y, mean absolute deviation: <= 0.010** -- the paper's
  own statement of its thermodynamic consistency (its Discussion).
* No band is relaxed after the run: a model outside it is reported outside it.

## What is compared

SRK (the system) and PR78 (variant `pr`), kij = 0: `P_bubble` and `y_eqT_ethylene`
at the measured x of each row; alpha recomputed by the gate `check_olefin_vle`
from the engine's y.

## The result (14 points; deviation = engine minus measurement)

| T (K) | x | P meas. (atm) | P SRK (dev) | P PR (dev) | y meas. | y SRK (dev) | alpha meas. +- | alpha SRK (dev) | alpha PR (dev) |
|---|---|---|---|---|---|---|---|---|---|
| 263.15 | 0.0462 | 19.06 | 19.15 (+0.47 %) | 19.00 (-0.34 %) | 0.0706 | 0.0653 (-0.0053) | 1.568 +-12.2 % | 1.442 (-8.1 %) | 1.439 (-8.2 %) |
| 263.15 | 0.1446 | 20.48 | 20.38 (-0.50 %) | 20.21 (-1.30 %) | 0.2036 | 0.1949 (-0.0087) | 1.512 +-4.4 % | 1.432 (-5.3 %) | 1.430 (-5.5 %) |
| 263.15 | 0.2561 | 22.03 | 21.80 (-1.06 %) | 21.63 (-1.84 %) | 0.3324 | 0.3283 (-0.0041) | 1.446 +-3.0 % | 1.420 (-1.8 %) | 1.418 (-2.0 %) |
| 263.15 | 0.3982 | 23.96 | 23.65 (-1.28 %) | 23.47 (-2.03 %) | 0.4823 | 0.4816 (-0.0007) | 1.408 +-2.5 % | 1.404 (-0.3 %) | 1.402 (-0.4 %) |
| 263.15 | 0.6138 | 26.82 | 26.59 (-0.85 %) | 26.41 (-1.55 %) | 0.6814 | 0.6863 (+0.0049) | 1.346 +-2.7 % | 1.377 (+2.3 %) | 1.375 (+2.2 %) |
| 263.15 | 0.7894 | 29.10 | 29.12 (+0.05 %) | 28.93 (-0.59 %) | 0.8320 | 0.8352 (+0.0032) | 1.321 +-4.0 % | 1.352 (+2.3 %) | 1.351 (+2.2 %) |
| 263.15 | 0.8476 | 29.86 | 29.98 (+0.41 %) | 29.80 (-0.21 %) | 0.8777 | 0.8819 (+0.0042) | 1.290 +-5.3 % | 1.343 (+4.1 %) | 1.342 (+4.0 %) |
| 263.15 | 0.9392 | 31.05 | 31.39 (+1.08 %) | 31.20 (+0.48 %) | 0.9516 | 0.9535 (+0.0019) | 1.273 +-12.6 % | 1.328 (+4.3 %) | 1.327 (+4.2 %) |
| 293.15 | 0.0539 | 38.46 | 38.62 (+0.41 %) | 38.48 (+0.06 %) | 0.0662 | 0.0637 (-0.0025) | 1.244 +-11.4 % | 1.195 (-4.0 %) | 1.195 (-3.9 %) |
| 293.15 | 0.1537 | 40.85 | 40.69 (-0.39 %) | 40.58 (-0.67 %) | 0.1772 | 0.1758 (-0.0014) | 1.186 +-4.5 % | 1.175 (-0.9 %) | 1.175 (-0.9 %) |
| 293.15 | 0.2663 | 43.57 | 43.09 (-1.10 %) | 43.01 (-1.29 %) | 0.2968 | 0.2942 (-0.0026) | 1.163 +-3.0 % | 1.149 (-1.2 %) | 1.149 (-1.2 %) |
| 293.15 | 0.3664 | 45.98 | 45.28 (-1.52 %) | 45.23 (-1.63 %) | 0.3936 | 0.3931 (-0.0005) | 1.122 +-2.6 % | 1.120 (-0.2 %) | 1.120 (-0.2 %) |
| 293.15 | 0.3988 | 46.85 | 46.01 (-1.80 %) | 45.96 (-1.90 %) | 0.4251 | 0.4240 (-0.0011) | 1.115 +-2.5 % | 1.110 (-0.5 %) | 1.109 (-0.5 %) |
| 293.15 | 0.4532 | 47.85 | 47.23 (-1.30 %) | 47.21 (-1.35 %) | 0.4722 | 0.4744 (+0.0022) | 1.079 +-2.4 % | 1.089 (+0.9 %) | 1.089 (+0.8 %) |

The "+-" is the propagated uncertainty of the MEASURED alpha from the paper's +-0.003 on x and y.

## Against the band declared before the run

* **Bubble pressure: INSIDE** (max 1.80 % SRK, 2.03 % PR against 4 %; mean 0.88 % / 1.09 % against 2 %).
* **y: INSIDE** (mean absolute 0.0031 for both, against 0.010; largest 0.0090).
* **alpha mean: INSIDE** (2.58 % SRK, 2.59 % PR against 4 %).
* **alpha per point: ONE point OUTSIDE for both models**: x = 0.1446 at 263.15 K, -5.3 % (SRK) and -5.5 % (PR)
  against a limit of 5 % (its own measurement uncertainty is 4.4 %, so the 5 % floor governs); it exceeds
  the declared limit by 0.3 to 0.5 point.  Not widened.  Every other point is inside its limit, the
  three dilute-end points (x = 0.046, 0.054, 0.939) inside the measurement's own 11 to 13 % uncertainty.
* **The shape**: at 263.15 K the engine's alpha runs from 1.44 to 1.33 against the measured 1.57 to 1.27,
  too flat again (low at the ethane-rich end, high at the ethylene-rich end); at 293.15 K, where ethylene is
  supercritical, the agreement is better (|dev| <= 1.2 % but at the dilute end).  The engine's bubble pressure
  is LOW by 1 to 2 % through the middle of both isotherms, more so with PR.
* SRK and PR agree within 0.3 point in alpha; PR is 0.6 to 0.8 point lower in P at 263 K.

## What is NOT claimed

* No kij (none in the catalogue for this pair; none fitted).  The paper's own calculation used a
  Redlich-Kwong-type fugacity and the unsymmetric convention at 293.15 K; the engine needs neither.
* The pure ends and the pure-ethylene vapour pressure at 263.15 K (31.94 atm, listed in the paper) are not
  compared.  The ternary CO2 + C2H4 + C2H6 of the paper's Table II is not evaluated (CO2 has no role in a splitter).
* The dataset is `transcribedNotCheckedAgainstArticle`: read from the page image at 220 dpi, every digit.
* No distillation column is built on this pair here (the C3 splitter is; see olefins01 and
  `tutorials/steady/distillation/c3splitter01_propylene_propane`): no published C2 splitter specification is in the folder.
* IN SAMPLE: nothing was fitted to these points.

Gate: `bin/curate/check_olefin_vle.py` (shared with olefins01), pinned: the pressure, y and alpha bands, the one point
outside, the mean.

