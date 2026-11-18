# curate02_vle_heldout_ethanol_water — fit a binary pair, then test it on data it never saw

This case regresses the four NRTL coefficients of the **ethanol-water** pair
on **eight measured bubble temperatures** at 101.325 kPa, then asks the fitted
pair to predict **three more measured points** that were set aside before the
fit ran (x_ethanol = 0.20, 0.50, 0.80).  It runs under `choupoProps`
(`fitParameters`, bubble-temperature residual).  The golden: held-out
deviation **0.073 %** of T (**0.26 K**) against a band of **0.1 %** declared
beforehand; verdict **validated**.

## What to look at

1. **Fit quality vs held-out evidence.**  The run prints them as two sections.
   The fit's RMS is 0.32 K; what matters is the second section, the error on
   points the model was never handed.  A fit that only reproduces its own data
   proves nothing; this one is scored on evidence it did not see.
2. **The band was declared first.**  `acceptance` in `system/propsDict` gives
   the 0.1 % limit and its origin (scatter of atmospheric bubble-point
   measurements).  The margin is a factor of 1.4, reported as such.
3. **Validated is not determined.**  `identifiable 0`, a condition number near
   4e11 and parameter correlations of 0.9999: one isobar cannot separate the
   four coefficients, so they are meaningless one by one although the pair
   predicts well.  The run says so, and so does the proposal file's header.
4. **The take-away file**, `ethanol-water.proposal.dat`: the fitted pair with
   both datasets, the held-out result, the band and the verdict.  Moving it
   into a case's `constant/parameters/NRTL/` is how a fitted pair gets used.

## What to change

- In `system/propsDict`, tighten `maxAAD` to `0.05 percent` and rerun: the
  verdict turns to not validated, with the same fit.
- Move a point between the two files under `constant/experiments/` and watch
  the held-out error change: the split is a modelling decision.
- Compare with `curate04_nrtl_methanol_water`, the same contract built from
  published measurements end to end.

## Source of the data

Eleven measured ethanol-water bubble temperatures at 101.325 kPa from a
published vapour-liquid-equilibrium compilation (pedagogical subset), split by
a fixed rule (every third point held out); the provenance block of each file
under `constant/experiments/` states it.
