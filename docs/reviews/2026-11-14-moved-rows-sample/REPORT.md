# Review by measurement: the moved golden rows, sampled (R6)

Date: 2026-11-14.  Asked by the coordinator (board, R6), after the fifth
batch landed (main 2d4d75936d).  Nothing modified; nothing run but two
scripts that read git.

## 1. The 151 tablet rows: all of them, not ten

`compare_tablet_rows.py` reads the list this session published before
the re-record
(`docs/reviews/2026-11-13-pharmaceutical-plant-cases/ph03_ph06_moved_rows.tsv`:
case, row, old golden, value on the branch) and the three `expected`
files on main and on the commit before the batch (bf74f5ce85).

| case | rows listed | equal on main to the listed value (1e-9 relative) | rows that moved on main and are NOT listed | rows added | rows removed |
|---|---|---|---|---|---|
| apalutamide01_tablets | 29 | 29 | 0 | 9 | 0 |
| donepezil01_tablets | 37 | 37 | 0 | 12 | 0 |
| donepezil02_two_strengths | 85 | 85 | 0 | 20 | 0 |

So the re-record moved exactly the 151 rows of the list, each to the
listed value, and nothing else: the restoration of the rows the recorder
had rewritten inside its tolerance left no stray.  The 41 added rows are
the new sheet keys of the installed-size ruling (`V_required`,
`V_installed`, `fill_installed`, per strength where there are two).

One reading note, not a finding: on the final blender of the first case
the sheet shows `V_required` 1.333 m3 above `V_installed` 1.2 m3.  It is
consistent (the required volume is at the PLANNED fill 0.6; the
installed machine holds the lot at 0.667, under its declared maximum
0.7), but the two numbers side by side read as a machine too small.

## 2. Five economics rows of the green-ammonia case, by hand

`tutorials/plant/greenAmmonia02_feasibility150bar/expected` on main, from
the golden's own stream flows, the case's prices, its stream factor
(0.90: 28 382 400 s per year) and the records' molar masses.

| row | golden | by hand | how |
|---|---|---|---|
| `C_RM` | 566 427 124.187 | 566 427 124.187 (8e-13 relative) | (1.225 kmol/s x 2.016 x 8.0 + 0.408333 kmol/s x (0.9999 x 28.013 + 0.0001 x 39.948) x 0.0175) x 28 382 400 |
| `revenue` | 206 094 401.695 | implies 13.70065 kg/s of product, a molar mass of 17.0299 on the golden's 0.804506 kmol/s | pure ammonia is 17.030: the product carries its dissolved traces; with 17.030 the hand value is 6e-6 higher |
| `grossMargin_RM` | -360 332 722.492 | -360 332 722.492 | revenue - C_RM |
| `grossMargin_RM_UT` | -392 753 034.029 | -392 753 034.028 | minus C_UT 32 420 311.536 |
| `COM_d` | 747 194 871.897 | 747 194 871.896 (1e-12 relative) | 0.180 FCI + 2.73 C_OL + 1.23 (C_UT + C_RM), with FCI 42 056 702.885 and C_OL 1 114 402.724 |

All five hold.

## 3. Not done

The 30 goldens of the liquid-density pilot were not sampled here: 30 of
its pump and reactor quantities were recomputed independently in the
pilot's review (its section 3), before the re-record, and the gating
rows were re-measured on round 2 (its section 8).
