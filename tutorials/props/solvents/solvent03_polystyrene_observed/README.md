# solvent03 — thirteen pure solvents beside what Hansen observed

The confrontation with experiment of the solvent-selection lesson (DEV.md 4c
C128).  No `composition {}`: the `hansenMixture` op screens each declared
solvent PURE against polystyrene (Hansen 1967, solute G) — one row each, the
phase word `pure` — and `constant/experimental/hansen1967_table23_polystyrene.csv`
holds what the same thesis **observed** for each solvent (Table 2.3, column
G, the 1–6 scale of its page 20: 1 soluble, 2 almost soluble, 3 strongly
swollen with slight solubility, 4 swollen, 5 slight effect, 6 no visible
effect), with the citation on every row.  The op does not read that file; the
two tables are joined here, by the EduTool, and by the gate.

## Predicted beside observed

Ra in MPa^0.5 against R0 = 7.159 (the thesis's 3.5 (cal/cm³)^0.5); RED = Ra/R0.

| solvent | dD | dP | dH | Ra | RED | predicted | observed (Table 2.3) |
|---|---|---|---|---|---|---|---|
| methylEthylKetone | 15.89 | 9.00 | 5.11 | 4.558 | 0.637 | inside | 1 soluble |
| toluene | 18.04 | 1.43 | 2.05 | 5.208 | 0.728 | inside | 1 soluble |
| benzene | 18.31 | 1.02 | 2.05 | 5.691 | 0.795 | inside | 1 soluble |
| acetone | 15.50 | 10.43 | 6.95 | 6.638 | 0.927 | inside | 3 strongly swollen, slight solubility |
| ethylAcetate | 15.22 | 5.32 | 9.20 | 7.024 | 0.981 | inside | 1 soluble |
| diethylEther | 14.42 | 2.86 | 5.11 | 7.209 | 1.007 | outside | 3 strongly swollen, slight solubility |
| cyclohexane | 16.73 | 0 | 0 | 7.573 | 1.058 | outside | 1 soluble |
| nHexane | 14.81 | 0 | 0 | 9.238 | 1.290 | outside | 3 strongly swollen, slight solubility |
| nitroethane | 15.95 | 15.55 | 4.50 | 9.971 | 1.393 | outside | 2 almost soluble |
| nButanol | 15.98 | 5.73 | 15.75 | 12.106 | 1.691 | outside | 6 no visible effect |
| nitromethane | 15.75 | 18.82 | 5.11 | 13.245 | 1.850 | outside | 5 slight effect |
| ethanol | 15.81 | 8.80 | 19.43 | 15.971 | 2.231 | outside | 6 no visible effect |
| methanol | 15.18 | 12.27 | 22.30 | 19.808 | 2.767 | outside | 6 no visible effect |

Every solvent the thesis rated 6 lies outside the sphere; every solvent it
rated 1 lies inside or — cyclohexane, RED 1.058 — within the ±0.5
(cal/cm³)^0.5 band the thesis states for its own radii.  The residual, read
across the line RED = 1: **nitroethane** (RED 1.39, rated 2) and
**cyclohexane** (RED 1.06, rated 1) dissolve from outside; **acetone** (RED
0.93, rated 3) does not quite from inside.  Three of thirteen, where the
thesis itself expects about one solvent in forty on each side beyond ±0.5 of
the radius (page 39) — this set is small and its residual sits on the
boundary, as the thesis says the deviations do.

## What this confrontation is, said plainly

Hansen's sphere for this polymer was **drawn through these very
observations** (thesis §4.4: the centres were determined from the solvents
that dissolve each solute).  Agreement here therefore shows that the
transcription and the distance arithmetic reproduce his placement — a check
of the method on its own training set, not an independent prediction of a
solvent he never tried.  No blend was dissolved by anyone: the thesis
tabulates pure solvents only, and a measured point along a mixture line is
what this corpus does not have.

The package is `ideal` because no mixture is asked for.  Every parameter
is a case-local overlay record with the thesis page and row beside the value,
`reviewStatus interim` (transcribed from the page images, not the OCR text,
whose columns are scrambled; a second reading pending).

## Golden

`expected` pins each solvent's `Ra_pure_<name>` and the CSV cells of the
screen; `check_hansen_mixture` rebuilds them from the records and prints the
residual above as a measurement, failing only on a rated-6 solvent inside
the sphere or a rated-1 solvent beyond the thesis's own band.
