# A splitter divides a slurry and keeps its size distribution

One `splitter` takes a limestone slurry (1.0 t/h of calcite in 4.0 t/h of
water, with a measured sieve table on the edges 45 / 90 / 180 / 355 / 710 um)
and sends 30 % to `branchA` and 70 % to `branchB`.

## What it shows

A particle-size distribution is **intensive**: its numbers are the *fractions*
of the solid in each size class, and they are weighed by the solid mass that
carries them.  Dividing a stream divides the mass and leaves the fractions
alone, so each branch carries the **same** four fractions
(0.10 / 0.30 / 0.40 / 0.20) with its own solid mass (0.3 and 0.7 t/h of
calcite).  The splitter names no kind of quantity: it hands the distribution to
the kind's own law of division (`src/streams/Carried.cpp`, `SizeDistributionKind::divide`).

## Why it is a shipped case

Until 2026-11-18 the splitter dropped the size distribution on **every**
branch.  The mass balance closed (a distribution is not a flow) and every
golden pinned "unchanged", so nothing said so; the defect was found by putting
a second kind of carried quantity on the same stream.  This case pins the
repaired behaviour: the golden holds the branches' flows **and** the
distribution moments each branch publishes, and the gate
`bin/curate/check_carried_kinds.py` reads the branches' state files and holds
that both carry the feed's distribution class for class, and that splitting
then mixing returns the feed's distribution to 1e-12.

## Run

```
runCase tutorials/steady/solids/splitter01_slurry_sizeDistribution
```
