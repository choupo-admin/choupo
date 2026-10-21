# solvent02 — polystyrene against two hexane blends: better than either, and a pair the liquid refuses

The real case of the solvent-selection lesson (DEV.md 4c C128).  The target is
polystyrene as Hansen placed it in his 1967 thesis (solute G, Table 4.1:
centre (8.6, 3.0, 2.0), radius 3.5 in (cal/cm³)^0.5 — R0 = 7.159 MPa^0.5 in
the engine's unit); the solvents are three of his Table 2.1 placements,
transcribed from the page images into case-local overlay records
(`constant/components/*.dat`) with the thesis page and row beside each value,
converted to Pa^0.5 by sqrt(4.184e6) = 2045.48, and marked `interim`.  The
reference temperature is adopted as 25 °C (the thesis prints none beside its
tables); the run is at 25 °C so nothing is moved away from it.

## Blend 1 — hexane + acetone, by volume

| point | phi_acetone | Ra (MPa^0.5) | RED | phase |
|---|---|---|---|---|
| pure hexane | 0.00 | 9.238 | 1.290 | pure |
| | 0.30 | 6.289 | 0.878 | homogeneous |
| | 0.50 | 4.992 | 0.697 | homogeneous |
| **minimum** | **0.65** | **4.724** | **0.660** | homogeneous |
| | 0.80 | 5.183 | 0.724 | homogeneous |
| pure acetone | 1.00 | 6.638 | 0.927 | pure |

Pure hexane lies outside the sphere and pure acetone just inside its edge (in
the thesis's own test both were rated 3, "strongly swollen, slight
solubility"); the blend dips well inside near 65 % acetone.  That is the
observation Hansen checked his placements against: *two non-solvents on
opposite sides of a solute's sphere give a blend that dissolves it* (thesis,
§2.5, "this has always been found to be the case").  UNIFAC — the case's
activity model, predictive from the records' groups — finds the pair one
liquid at every point, so the word is `homogeneous` all along, which is what
makes the blend a candidate at all.

## Blend 2 — hexane + nitromethane, by mole

The composition is declared by MOLE, so the run converts it to volume
fractions through the records' Vliq (54.1 cm³/mol for nitromethane against
131.6 for hexane: equal moles is 29 % nitromethane by volume) and prints
both.  Both ends are far outside the sphere (RED 1.290 and 1.850), and the
mixture rule puts the middle of the line inside it — on paper, a better blend
than the first (Ra 5.399, RED 0.754 at x = 0.6).

But hexane and nitromethane are an immiscible pair at room temperature, and
the case's UNIFAC says so: where Michelsen's tangent-plane test finds a
second liquid the op **refuses to represent the pair as one solvent** — no
averaged triple, no Ra, no RED for that point, the row marked `twoPhase`
with its negative tm — and the minimum is taken over the points that survive.
The averaged number would have been the best on the line, and it describes a
solvent that does not exist.  A two-phase pair is not useless (it may serve
an extraction); it is only not one solvent.

What UNIFAC answered, measured: **17 of the 19 blends are two-phase**, from
x = 0.05 to 0.85 (tm between −0.10 and −0.40), and only the two
nitromethane-rich blends (x = 0.90 and 0.95) are one liquid — both outside the
sphere (RED 1.340 and 1.572).  Every composition where the mixture rule would
have put the blend inside the sphere (roughly x = 0.3 to 0.8, RED down to
0.754) is refused, so the minimum over the points that survive is **pure
hexane, RED 1.290**: no blend of these two is a solvent for polystyrene.
The counts are pinned in `expected` (`n_twoPhase`, `n_homogeneous`).

| x_nitromethane | phi_nitromethane | Ra | RED | phase |
|---|---|---|---|---|
| 0.00 | 0.000 | 9.238 | 1.290 | pure |
| 0.05 – 0.85 | 0.021 – 0.700 | — | — | twoPhase (refused) |
| 0.90 | 0.787 | 9.591 | 1.340 | homogeneous |
| 0.95 | 0.887 | 11.251 | 1.572 | homogeneous |
| 1.00 | 1.000 | 13.245 | 1.850 | pure |

**This case also found an engine defect, fixed in the same slice.**  Its first
run reported hexane + acetone two-phase at EVERY composition (tm down to
−0.43), for a pair whose UNIFAC activity coefficients at 50:50 are 1.52 and
1.56 and which is miscible.  The Michelsen tangent-plane distance in
`src/solver/StabilityTest.cpp` omitted the ln γᵢ(y) term, so at the trivial
point it read −G^E/RT instead of 0 and called every positive-deviation
mixture unstable.  With the term restored the pair is one liquid (tm at
round-off) and the 38 corpus cases that reach the test kept every golden.

## What is, and is not, measured here

* The **parameters** are Hansen's 1967 placements, primary-sourced per value
  and interim: nobody in this tree has read them back a second time.
* The **phase words** are UNIFAC's prediction from the group table; no LLE
  datum for hexane/nitromethane is in the tree, so the gap it finds is a
  model's answer, announced as such.
* **No blend was dissolved** by anyone here: the thesis tabulates pure
  solvents only (see `solvent03`), and Ra is an affinity, never a
  concentration.
