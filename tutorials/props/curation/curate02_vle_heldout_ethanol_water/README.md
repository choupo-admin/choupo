# curate02_vle_heldout_ethanol_water -- fit a binary pair, then test it on points it never saw

Ethanol and water do not mix ideally: at 101.3 kPa the mixture boils at lower
temperatures than Raoult's law says, and it forms an azeotrope near 89 mol %
ethanol that no ordinary distillation can cross.  This case measures how much
the NRTL activity model, with only **two** adjustable numbers (b_ij and b_ji),
closes that gap.  It starts from zero (Raoult's law, gamma = 1), fits the two
numbers to **ten** measured bubble points, and then asks the fitted pair to
predict **four** more measured points that were set aside before the fit ran.
It runs under `choupoProps` (`fitParameters`, bubble-temperature residual).

## What to look at

1. **The T-x-y diagram first.**  Measured bubble points (ten used in the fit,
   four held out, drawn as separate series) against two curves: Raoult's law
   (the start of the fit) and the fitted NRTL (the end).  The gap between the
   two curves is what the two numbers learned.  Look at the azeotrope, where
   Raoult's curve cannot follow the data.
2. **The held-out number second.**  The log's HELD-OUT EVIDENCE section gives
   the average error on the four points the fit never saw, in kelvin and as a
   percentage of T, against a band that was declared before the fit.  The
   verdict (`validated` or not) is that comparison and nothing more.
3. **Is the fit well posed?**  Two parameters on one isobar are identifiable:
   the run reports `identifiable`, the condition number and the correlation of
   b_ij with b_ji.  (The earlier version of this case fitted four numbers to
   one isobar; they could not be told apart, and the run said so.)
4. **The take-away file**, `ethanol-water.proposal.dat`: the fitted pair with
   both datasets, the held-out result, the band and the verdict.  Moving it
   into a case's `constant/parameters/NRTL/` is how a fitted pair gets used.

## What to change

- In `system/propsDict`, tighten `maxAAD` and rerun: the same fit, a different
  verdict.  The band is declared first on purpose; changing it after seeing
  the result is what the contract forbids.
- Move a point from one file under `constant/experiments/` to the other and
  watch the held-out error change: the split is a modelling decision.
- Free `a_ij` and `a_ji` too (add them to `parameters`) and read
  `identifiable` and the correlations: one isobar cannot support four numbers.
- After a refit, write the new b_ij and b_ji into
  `constant/thermoPhysPropDict`: that is the pair the NRTL curve in the
  diagram is drawn with.
- Compare with `curate04_nrtl_methanol_water`, the same contract over several
  isobars with a held-out set from another laboratory.

## What is fixed, and why

- a_ij = a_ji = 0: over one isobar the a and b of a coefficient multiply almost
  the same function of T, so freeing both only trades one for the other.
- alpha = 0.30: the usual value for a mixture of a polar and a less polar
  liquid; one isobar cannot determine it.
- The fit is unweighted: every point has the same say (their stated uncertainties, 0.13-0.45 K, are in the data files and curate04 weights by them).
- Split rule, declared before the fit: every third point by increasing x
  (3rd, 6th, 9th, 12th: x_ethanol = 0.1000, 0.3940, 0.6310, 0.8480) is held out.

## Source of the data

Lai, H.-S.; Lin, Y.-F.; Tu, C.-H. (2014).  Isobaric (vapor + liquid) equilibria
for the ternary system of (ethanol + water + 1,3-propanediol) and three
constituent binary systems at P = 101.3 kPa.  J. Chem. Thermodyn.
doi:10.1016/j.jct.2013.08.020 (the ethanol + water block), 14 interior points
located through the NIST/TRC ThermoML Archive and extracted with
`bin/choupo-thermoml extract-vle`; the provenance block of each file under
`constant/experiments/` records the archive file, block and sha256.  The points
are transcribed from the archive and not yet read back against the article
(`reviewStatus transcribedNotCheckedAgainstArticle`).
