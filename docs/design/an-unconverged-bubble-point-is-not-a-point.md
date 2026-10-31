# An unconverged bubble point is not a point

DEV.md 4c C186 item 6, 2026-10-31.  Code: `src/thermo/SaturationCurves.{H,cpp}`
(`bubbleT`, `binaryTxy`) and `src/applications/choupoSolve/main.cpp` (the
T-x-y guard).  Gate: `bin/curate/check_txy_bubble_verdict.py`.

## 1. The defect

`bubbleT` solves sum_i K_i(T) x_i = 1 by a bracketed Newton on 200..700 K and
returned its last iterate without reading the Newton's verdict.  A liquid
that boils below 200 K came back as T = 200 K with sum K x well above 1.
`binaryTxy` drew every composition it was handed, and choupoSolve's guard
refused the diagram only when EVERY point sat on the 200 K floor -- so a
curve that was wrong at SOME points was published.  The external review
measured one at 200 K with sum K x = 1.52575 where the true bubble T is
191.893 K, and 20 of 29 points invalid.

Reproduced on the parent commit (a84aa7922) with propane + ethane on an
ideal gamma-phi package (Raoult): at 1 bar the published curve had 29
points, 16 of them at exactly 200 K; at 2 bar, 29 points, 1 at 200 K.

A second shape of the same defect, found while building the witness: with
the LIGHT component plotted first, the floor points have y_1 = K_1 x_1 > 1,
and the out-of-range-y guard threw the WHOLE diagram away without a word
(verbosity below 2).  The review's shape needs the heavy component first,
so that y stays in range at the bad points; the gate's witnesses are built
that way.

## 2. The rule

**An unconverged solve is not a point, and a guard reads the solver's
verdict, never a symptom.**

* `bubbleT` takes an optional `bool* converged` and writes the Newton's own
  verdict into it.  The returned T is unchanged.
* `binaryTxy` asks `bubbleTSolve` for the Newton's whole verdict (T,
  converged, and the residual |sum K x - 1| AT the returned T -- on a Newton
  that ran out of iterations `newton1D`'s own residual belongs to the
  iterate before its last step, so it is re-evaluated there) and judges
  each composition against ONE tolerance, `kTxyAcceptResidual` = 1e-5 in
  `SaturationCurves.H`:
  * above it the composition is DROPPED, listed in `xUnconverged` beside
    `nAttempted`, and never seeds the next solve;
  * inside it but short of the Newton's own 1e-8 the point is DRAWN and
    listed in `xAcceptedUnconverged`, with the worst |f|.
  Where every point converges, the sweep is exactly what it was.
* WHY A SECOND TOLERANCE (the architect's ruling, 2026-10-31).  The first
  cut accepted only a converged Newton and refused `flash20_ethanol_water_
  pcsaft`'s diagram, which the parent code drew correctly: on PC-SAFT the K
  carries numerical noise above 1e-8, and 26 of its 29 points end at
  |f| = 6e-8 to 3e-6 after the full 30 iterations, 22-27 of them bisections
  -- right to ~1e-4 K (dT ~ |f| / |d(sum K x)/dT|, the slope about 0.03-0.05
  /K).  Refusing it would teach that PC-SAFT cannot draw a T-x-y diagram.
  The defect being fixed is a point on the 200 K floor at |f| ~ 0.5.  The
  condition on the second tolerance is that it is never a SILENT second
  verdict: every point it accepts short of the Newton's test is counted and
  announced.
* choupoSolve counts the drops ALOUD (stderr, and `AdvisoryLog` so the
  sentence reaches the end-of-run caveat block and the result's
  `advisories`), naming each dropped composition; and, separately, the
  points accepted short of the Newton's 1e-8, once per diagram, with the
  worst |f|.  It REFUSES the diagram by
  name when fewer than HALF of the attempted compositions remain -- a stated
  default: an envelope that is mostly gaps reads as a complete one.
* The 200 K floor guard is gone.  The verdict is the stronger test: at 2 bar
  the witness has one point at the floor and TWO unconverged compositions,
  and the floor guard could only ever have seen the first.
* The out-of-range-y guard stays.  With every published point converged it
  cannot fire (sum K x = 1 bounds each K_i x_i), so it is an invariant check
  now, not a detector.

## 3. Every caller, and what an unconverged result means for it

Measured by grep of `bubbleT(` and `binaryTxy(` in `src/` on 2026-10-31:

| caller | what it does now |
|---|---|
| `binaryTxy` (SaturationCurves.cpp) | reads the verdict, drops and lists the point |
| `DistillationColumn.cpp:1691` (the Wang-Henke stage temperatures) | passes no verdict pointer: UNCHANGED, and covered |
| `DistillationColumn.cpp`, `bubbleTWithItsVapour` (its three `bubbleT` calls; called for the distillate's bubble point and for a feed's) | reads every call's verdict and folds the LAST one into its `converged` flag |

The column is the same function, not a different one, and its calls were
left exactly as they were -- for two different reasons.

* `:1691` is COVERED.  An inner bubble-T solve inside the Wang-Henke outer
  iteration is an ITERATE, and the column accepts a pass only when every
  published stage closes |sum_i K_i x_i - 1| to `bubbleTol` = 1e-9 (the
  acceptance test at `:1608`).  An unconverged inner solve cannot reach a
  published profile.
* `bubbleTWithItsVapour` now FOLDS the verdict (the architect's ruling,
  2026-10-31: a verdict dropped is the defect this item removes).  Its
  `converged` flag used to report the incipient-VAPOUR iteration only.  What
  the flag does when false is unchanged: for the DISTILLATE the column
  prints `[distillate] WARNING: the bubble point of the distillate did not
  converge`, adds a `numerics` advisory and publishes the top tray's
  temperature; for a FEED the enthalpic feed quality throws "its bubble
  point did not converge" and falls back, said, to q = 1 - vf.  Both callers
  ALSO re-test |sum K x - 1| <= 1e-8 themselves, so the fold adds one case:
  a Newton asked for 1e-12 that misses it while the re-test passes is now
  called unconverged.  Measured before the fold, with a temporary probe over
  the same 122 cases: no column call of `bubbleT` failed to converge, so no
  corpus case moves.

## 4. Not done, named

* The bracket itself (200..700 K).  A cryogenic binary still has no point
  below 200 K; it is now SAID, not drawn.  Widening the bracket is a separate
  change with its own reach (every bubble-T solve in the engine).
* The dew curve: `binaryTxy` draws the dew line from the same bubble solve
  (y = K x at the bubble T), so it inherits the verdict and needs none of
  its own.
* The steady `txy` block is pinned by no golden row (the `txy` rows in the
  corpus belong to choupoProps operations).  The gate holds the behaviour;
  a row kind for it is not added here.
