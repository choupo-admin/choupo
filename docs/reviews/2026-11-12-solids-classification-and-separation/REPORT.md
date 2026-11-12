# Review by measurement: classification and solid-liquid separation (C361 slices 3 and 4)

Date: 2026-11-12.  Reviewed at main efa32a76e7.  Cell: the screen,
hydrocyclone, classifier and closed grinding circuit (slice 3) and the cake
filter, thickener and sedimenting centrifuges (slice 4); columns VERIFIED,
VALIDATED and the honesty of their reporting.  `run_all.sh <repo root>
[work dir]` regenerates every table.  The reviewer changed no tracked file.

## 1. Independent recomputation

Each unit was recomputed from the published equation (Python, standard
library, not transcribed from the C++); agreement is within 2e-5
everywhere, mostly 1e-9 or better (`recomputation.tsv`).

| unit / case | quantity | independent | engine |
|---|---|---|---|
| screen01 (Karra) | oversize / feed | 0.293292 | 0.293294 |
| hydrocyclone01 (declared curve) | d50 | 176.012 um | same to 1e-8 |
| circuit01 (Austin mill + classifier, own successive substitution) | recycle | 65.215414 kg/s | same to 3e-10 |
| filter01 (Ruth) | area | 6.6434 m2 | same to 1e-5 |
| filter02 (Ruth, washing) | cycle time, book's viscosity | 1663.61 s | book's figures to 0.03 % |
| thickener01 (Talmage-Fitch) | area | 846.94 m2 | same to 5e-13 |
| centrifuge01 (Stokes trajectory) | Sigma | 273.2495 m2, equal to Ambler's closed form | same |
| centrifuge02 (disc stack) | Sigma | 9405.026 m2 | same to 1e-12 |

Conservation: the worst per-size-class closure is 6.5e-13 (mills
excluded: breakage moves mass between classes); the whole circuit closes to
4e-12; energy residuals are about 1e-10 kW, and circuit01's 637 kW of shaft
work closes to 3.8e-7 kW.

## 2. What each anchor is (`anchors.tsv`)

screen01 is a true comparison with a measurement (Karra's model has no
fitted parameter; oversize -4.0 %, stated).  circuit01 compares with
Herbst and Fuerstenau's SIMULATION (circulating load 2.588 against 2.50,
specific energy -2.45 %), said as such.  filter01, filter02 and
centrifuge01 redo the book's arithmetic on the book's inputs: a check of
arithmetic, not a prediction.  thickener01 and centrifuge02 are identity
anchors, said as such.  hydrocyclone01 is IN-SAMPLE and is not labelled so
(SC-01).

## 3. Sabotage (`sabotage.tsv`)

| change | caught? |
|---|---|
| partition-curve exponent x 0.8 | yes, 23 golden rows of screen01 (the unit's own self-check cannot see it) |
| Ruth's B V term dropped | yes, filter02's anchors; filter01 passes (its medium resistance is zero) |
| `whiten` curve reshaped, c(d50c) = 1/2 kept | NO: nothing in the tree uses or tests it (SC-02) |

## 4. Findings (`findings.tsv`; each reproduced twice by the review)

* **SC-01 (S2)** hydrocyclone01's two anchor rows return their own inputs:
  R_f was computed from the book's dilution and the declared curve makes
  the 148-209 um class exactly 0.49998, so d50 lands there by construction;
  the case, the Tutorials Guide and the design record call the products
  "predicted" and runTests prints "agree with the cited primary".
* **SC-02 (S2)** the registered `whiten` curve has no case and its only
  check holds for any shape -- the condition the design record gives for
  unregistering a correlation.
* **SC-03 (S2)** the centrifuges apply dilute Stokes settling at any feed
  concentration in silence (a 30 vol % feed runs to exit 0, caveat block
  "none raised"); the design record and the Theory Guide say the solids
  fraction is printed, and no output carries it.
* **SC-04 (S2)** the thickener's only window check (a settling test run
  more than 5 % off the feed concentration) is printed to the console only
  at verbosity >= 1 (`Thickener.cpp`, the result block); no solids unit
  raises anything through the advisory log (0 uses under
  `src/unitOperations/solids/`, recounted by the commander).
* **SC-05 (S3)** screen01 is itself overloaded: the console says
  OVERLOADED while the caveat block says "none raised".
* **SC-06 (S3)** the filter accepts any `compressibility` (s = -0.5 and 1.5
  both run, giving 0.078 m2 and 5224 m2).
* **SC-07 (S3)** the thickener's output does not say how the compression
  slope is taken; the area is 805, 847 or 1129 m2 by method.
* **SC-08 (S3)** branches with no case and so no golden: the screen's
  `declared` and a case-declared Rosin-Rammler curve, the classifier with a
  fluid, the rotary drum with declared area / medium resistance / wash,
  tabulated washing, `washFlowPath sameAsFiltrate`.

## 5. Not examined

The transcription of King's constants and of Wills Table 9.1 (neither book
was read); Herbst and Fuerstenau's other table cells and figure; the wet
screening table; whether the recycle tear's clipping of negative class
flows ever acts (read, not shown); the GUI; the time-integrated binaries.

## 6. The cells

VERIFIED can be filled for every unit at the points tested (the scripts are
the independent route).  VALIDATED: screen01 only; hydrocyclone01 must not
be counted until SC-01 is answered.
