# still01_benzene_toluene — Rayleigh distillation, watched drop by drop

One mole of 50/50 benzene/toluene in a pot at 1.013 bar, boiled off for
600 s with the vapour taken away as it forms — no reflux, no trays: the
Rayleigh equation integrated in time.  The pot starts at its bubble
point, **365.00 K**, and ends at **380.04 K** with **0.1 mol** left in it
at **91.8 % toluene**; 0.9 mol (0.0760 kg) has left as distillate.  The
reboiler supplied **30.33 kJ**, the condenser took **29.39 kJ** away.

## The lesson

1. **The residue gets heavier, and hotter, because the light one leaves
   first.**  The **Log** tab prints the pot every 20 s: benzene falls
   faster than toluene, T climbs from 365 to 380 K as the pot approaches
   toluene's boiling point.  That is the Rayleigh curve as numbers.
2. **The whole campaign is a ledger.**  `[campaign] mass balance: m0 =
   0.0851 kg = mF 0.0091 + external 0.0760 kg, closure 0` — what left the
   domain is counted, not lost.  The energy side closes at 4.6e-16 with
   two records, reboiler and condenser, each priced at its own service
   temperature (380.0 K and 365.3 K).
3. **The thermodynamics is Raoult, and the caveats say where it is
   stretched.**  Benzene's Antoine window ends at 354 K and the pot
   starts at 365 K; toluene's ends at 380 K and the pot ends at 380.04.
   Both extrapolations are announced at the moment they happen, on the
   console, inside the table.
4. **Utilities are scheduled in time.**  `reports/utilities/
   utilityDemand.csv` carries the staircase of steam and cooling-water
   demand across the 600 s — a peak, not just a total, which is what a
   batch plant is actually sized on.

## What to try

Halve `endTime`: the pot is still half full and barely enriched — most
of the separation happens late, when there is little left.  Then
`still04_rectifier_benzene_toluene` puts three stages and a reflux over
the same pot, and the distillate purity that a Rayleigh still cannot
reach appears.
