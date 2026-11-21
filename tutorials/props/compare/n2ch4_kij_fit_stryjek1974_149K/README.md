# n2ch4_kij_fit_stryjek1974_149K -- ONE SRK kij for nitrogen + methane, from one isotherm of one primary

`runCase tutorials/props/compare/n2ch4_kij_fit_stryjek1974_149K`

## The question

The catalogue's SRK kij for N2-CH4 (0.0289) cited a compilation monograph, not
a measurement.  `flash09_n2ch4_stryjek` anchors its K-values to Stryjek,
Chappelear & Kobayashi (J. Chem. Eng. Data 19 (1974) 334, Table III), 149.82 K.
A kij fitted by Choupo to that same isotherm, alone, makes the record and the
anchor come from ONE primary (C335, third pass).  A global kij over all eight
isotherms (0.0058) misses this isotherm's K_N2 by 6 %: kij depends on T in that
table, so the record's validity window is this ONE isotherm.

## The evidence and the split (written before the fit)

Table III, 149.82 K, p. 338, read from the page image: seven rows kept.
Discarded by rule BEFORE the fit: the pure-methane row (extrapolated), the
300 psia row (no liquid composition), the critical point (664 psia) and every
row within 3 % of the critical pressure (649 psia).
* FIT: 179, 249.5, 396.5, 594 psia (rows 1, 3, 5, 7).
* HELD OUT: 202.5, 299, 495 psia (rows 2, 4, 6), interleaved.
* Residual: `P_bubble` relative, plus alpha = K_N2/K_CH4 relative (weights 1, 1);
  y is the table's measured vapour composition, so alpha is a measured quantity.

## DECLARED BEFORE THE FIT

* Held-out bubble pressure: mean |dP/P| <= 2 %, every point <= 4 %.
* Held-out alpha: mean <= 4 %, every point <= 6 %.
* The fit's own acceptance (`maxAAD`, P and alpha rows together): 3 %.
* The anchor of flash09: K_N2 at 299 psia (3.047) within the 3 % that case
  declares.
* No band is relaxed after the run.
