# Sample-behaviour slice (design R6): goldens moved

Branch `build/last-sample`, cut from `origin/integ/final-1118` (9a52244dc).

## Moved rows: none

The four shipped cake-filter cases moved their typed numbers into a sample
record each (`filter01`, `filter03`, `filter02` + `filter04` carry the same
record byte for byte).  `bin/runTests --scope` over the four, run on the built
tree: PASS 8 / FAIL 0, every golden compared as written (strict band), every
anchor (4 on filter01, 5 on filter02) still agreeing with its cited primary.
No row of any `expected` file of the four was edited: the values the unit
takes from the record are the values it used to read from `operation`, to
the digit.

## New case: `filter05_calciumSilicate_measuredTest`

Recorded with `bin/runTests --record` and then two rows replaced by anchors
by hand (alpha_m_kg, mediumResistance_1_m) against Wakeman & Tarleton
Example 4.1, pp. 122-123 (re-read on the page image, PDF page 135-136):

| row | book | Choupo (derived from the 11 t-V rows) | gap |
|---|---|---|---|
| alpha_m_kg | 7.4e9 | 7.4303e9 | +0.41 % |
| mediumResistance_1_m | 1.54e10 | 1.5383e10 | -0.11 % |

The gap is the book's own rounding: it prints its regression t/V = 1.742e6 V
+ 0.5186e4; least squares through rows 3-11 of its Table 4.9 gives 1.7417e6
and 5196.7.  Band 1 %.  Every other row is the unit's, pinned at 1e-4.
