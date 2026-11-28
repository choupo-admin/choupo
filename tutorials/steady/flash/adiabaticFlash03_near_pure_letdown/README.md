# adiabaticFlash03_near_pure_letdown — the same letdown with 1e-5 methanol

The letdown of `adiabaticFlash02_wet_water_letdown` (450 K, 20 bar to 1 bar,
adiabatic) with 1e-5 mole fraction of methanol added.  A near-pure feed is the
edge of the plateau case: the mixture is no longer pure, so a (P,H) root in T
exists, but it lies almost flat.  The outlet is **372.7554 K** (drop 77.2446
K), with **14.10 %** vapour; the pure-water case gives 372.7559 K and 14.72 %.
Figures are the case's `expected` rows.

## The lesson

1. A trace of a second component turns a plateau into a very flat curve.  The
   solver must still find the root, and it does, with the same shared (P,H)
   flash.
2. The energy-balance residual is 1.5e-4 J/mol, against a feed enthalpy of
   -5498 kW on the elements datum; H_feeds and H_products agree to 3e-9 kW.
3. The two temperatures differ by 0.5 mK: the plateau of the pure case is the
   limit of this one.

## What to try

Raise the methanol fraction and watch the outlet temperature leave the
plateau value.
