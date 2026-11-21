# olefins01_propane_propene_laurance1972 -- does a cubic equation of state see the relative volatility of the C3 splitter?

`runCase tutorials/props/compare/olefins01_propane_propene_laurance1972`

## The question

Propene and propane boil 5.6 K apart (Tb 225.46 and 231.02 K, the catalogue's
records).  In the measured table below their relative volatility is 1.05 to 1.22,
and a tray count goes as 1/ln(alpha), so a design that is wrong by 0.01 in alpha
is wrong by many trays (Laurance & Swift, p. 333, cite Manley: differences of 35 %
in the design number of trays between data sources).  Before the engine's column is believed on this pair, its
thermodynamics has to meet a measurement at the splitter's conditions.  This
case asks: with the catalogue's own Tc, Pc, omega and NO interaction parameter,
how close do SRK and Peng-Robinson come to the relative volatility of
propene (1) + propane (2) at 100 to 160 degF?

## The evidence

Laurance & Swift, J. Chem. Eng. Data 17 (1972) 333, Table IV (p. 335): seven
isotherms (100, 110, ... 160 degF = 310.93 ... 344.26 K), liquid propene mole
fraction 0.1 ... 0.9, the bubble pressure P, the vapour composition y and the
relative volatility alpha.  What the numbers ARE (the paper's own account,
read at p. 333-335): the vapour pressures of pure fluids and mixtures (Table I)
were MEASURED, probable error 0.1 %; Table IV is COMPUTED from them by
integrating the isothermal general coexistence equation (Manley & Swift), with
an estimated error of +-0.005 in alpha, so no vapour was sampled.  The data are
therefore measured pressures turned into y and alpha, not a direct sample of
the vapour.  Transcribed from the page image, every digit, 63 rows (the pure
ends are not listed: there y = x).  Two printed slips are declared in the
dataset headers (a P at 120 degF, a y at 110 degF).

## DECLARED BEFORE THE FIRST RUN (written before the engine was asked)

kij = 0 (the catalogue has no propene-propane kij, so none is used and none is
fitted).  The band, with its reason:

* **alpha, every one of the 63 points: |alpha_engine / alpha_paper - 1| <= 3 %.**
  Reason: the cubic's pure-fluid vapour pressures (Soave / PR78 alpha from the
  acentric factor alone) were expected good to 1 to 2 % for these two hydrocarbons, the
  errors of the two partly cancelling in the ratio, and a 3 % band on alpha (1.05 to 1.22 in the table) is
  0.03 to 0.04 absolute against the paper's own +-0.005.  A model that misses by more would change a column's tray count by
  tens of per cent.
* **alpha, mean over the 63 points: <= 1.5 %.**
* **bubble pressure, every point: <= 3 %; mean <= 1.5 %** (the paper's P is good
  to 0.1 %; the band is the cubic's vapour-pressure accuracy).
* **No band is declared for the SIGN of the miss**, and none is relaxed after
  the run: a model outside the band is reported outside it.

## What is compared

Two systems, same kij = 0: `srk` (the system's SRK) and `pr` (variant, PR78).  63
`propertyScan1D` points each (`P_bubble`, `y_eqT_propylene` at the paper's own
x).  The overlay's `aad` rows give the mean deviation of P and y; alpha is
recomputed from the engine's y and x by the gate `check_olefin_vle`.

## The result (63 points; deviation = engine minus paper; alpha recomputed from the engine's y)

| T (degF) | alpha mean abs. dev. SRK / PR | alpha at x = 0.1 (SRK) | alpha at x = 0.9 (SRK) | P_bubble mean abs. dev. SRK / PR | y mean abs. dev. (SRK) |
|---|---|---|---|---|---|
| 100 | 2.52 % / 2.50 % | -4.62 % | +3.99 % | 0.47 % / 1.22 % | 0.0039 |
| 110 | 2.25 % / 2.23 % | -4.23 % | +3.59 % | 0.39 % / 1.09 % | 0.0034 |
| 120 | 2.01 % / 1.98 % | -3.80 % | +3.26 % | 0.35 % / 0.94 % | 0.0031 |
| 130 | 1.78 % / 1.77 % | -3.35 % | +2.97 % | 0.32 % / 0.77 % | 0.0027 |
| 140 | 1.58 % / 1.57 % | -2.91 % | +2.70 % | 0.33 % / 0.58 % | 0.0024 |
| 150 | 1.39 % / 1.38 % | -2.48 % | +2.44 % | 0.41 % / 0.43 % | 0.0021 |
| 160 | 1.21 % / 1.19 % | -2.10 % | +2.14 % | 0.55 % / 0.28 % | 0.0019 |
| **all 63** | **1.82 % / 1.80 %** (max 4.62 % / 4.63 %) | | | **0.40 % / 0.76 %** (max 1.06 % / 1.73 %) | 0.0028 (max 0.0059) |

## Against the band declared before the run

* **Bubble pressure: INSIDE** (max 1.06 % SRK, 1.73 % PR against 3 %; mean 0.40 / 0.76 against 1.5 %).
* **Relative volatility: OUTSIDE, for both models.**  10 of the 63 points exceed 3 %
  (100 degF: x = 0.1, 0.2, 0.8, 0.9; 110 degF: 0.1, 0.2, 0.9; 120 degF: 0.1, 0.9; 130 degF: 0.1; same set for PR), the mean is 1.82 % (SRK) and 1.80 % (PR)
  against 1.5 %.  The band was not widened.  PR and SRK differ by under 0.05 point in
  alpha: the choice of cubic is not what matters for this pair; the missing kij is.
* **The miss has one shape**, at every isotherm: the engine's alpha is too LOW
  at the propane-rich end (x = 0.1) and too HIGH at the propene-rich end
  (x = 0.9), and the error shrinks as T rises.  At 100 degF the paper's alpha
  falls from 1.2022 (x = 0.1) to 1.0976 (x = 0.9); the engine's falls from 1.1467 to
  1.1414, almost flat.  The measured mixture has a small positive deviation from
  Raoult's law (the paper's Figures 3 to 5: 1000 ln(P/P_r) peaks at about 12 to 14 on the
  plotted curves, i.e. 1.2 to 1.4 % in pressure), a kij = 0 cubic has almost none.  A kij would flatten
  the misfit; **none was fitted here** -- the sibling `olefins03_propane_propene_kij_fit_laurance1972` does it,
  on four isotherms of this very table and tests it on the other three (the slice is the deviation; a fit to all 63 points
  would remove the only measurement this pair has in the engine, which is why the fit keeps a held-out set).
* **y** is within 0.006 everywhere (mean 0.0028): the paper's own alpha error of +-0.005 is
  the same order, so the y comparison cannot see the alpha miss; alpha is the sensitive quantity.

## What it means for the column

alpha - 1 is 0.05 to 0.22 in this table (0.11 at the splitter's feed composition and temperature), so the tray count goes as
1/ln(alpha): a 2 % alpha error is close to a 20 % error in the tower.  `tutorials/steady/distillation/c3splitter01_propylene_propane` runs the engine's
column and the same arithmetic on the measured alpha: the measured alpha implies
173 theoretical stages and R = 15.2, the engine's 145 and R = 12.5 (-16.5 % in stages, -17.9 % in reflux).

## What is NOT claimed

* The pure-fluid vapour pressures are not compared separately: they enter alpha at x -> 0 and
  1, which the dataset does not list; the Antoine records the run prints as "outside Trange" only
  SEED the incipient-vapour iteration of the bubble-pressure solver (`BubblePoint.H`), the answer
  is the cubic's.  The cubic's liquid density is not tested here.
* No kij in THIS case (olefins03 fits one: PR78 +0.00543, SRK zero); no propene-propane record exists in `data/standards/parameters/SRK`; the PPR78 group
  contribution (`op:ppr78Kij`, Peng-Robinson) is a prediction route this case does not try.
* y and alpha of Table IV are computed by the authors from measured pressures (integration of the
  coexistence equation with their own vapour-compressibility and liquid-volume correlations), not
  sampled vapours; the 63 points are not independent of each other.
* The dataset is `transcribedNotCheckedAgainstArticle` by the engine's own vocabulary: read by the
  author of the case from the page image, digit by digit, and cross-checked by recomputing each printed alpha from its printed x and y
  (agreement 0.0015 at every row but one printed slip, declared in the dataset header).
* IN SAMPLE: neither the cubic nor the catalogue's Tc, Pc, omega were fitted to this table.

Gate: `bin/curate/check_olefin_vle.py` (header names the defect: a one-digit slip in a record moves alpha by
2 % and the tower by 20 %, at exit 0).  Pins the miss at its measured size, the signature, the pressure band, and
sees a transposed omega on propylene.

