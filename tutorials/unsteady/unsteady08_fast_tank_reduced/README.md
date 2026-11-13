# unsteady08_fast_tank_reduced — the small tank replaced by its relation

The reduced twin of `unsteady07_fast_tank_full`: the same feed step and the
same big tank SLOW, with the small tank FAST written as a `storageTank`
wrapped as `quasiSteady`.  Its outlet IS its inlet, re-solved at every
accepted instant; nothing in it is integrated.

## What to look at

1. **One differential equation instead of two.**  Only SLOW carries a
   holdup in `trajectory.csv`; FAST publishes the holdup its declared
   residence time implies (`FAST.kpi_holdupMass_kg`), a number and not a
   state.
2. **What is lost.**  The outlet is SLOW's outlet, with no lag.  Against the
   full twin the largest gap in the outlet tracer fraction is 0.0428.
3. **The routing line** says `SAME INSTANT` for FAST: a unit with no
   inventory is solved on its inlet at the instant, never a step late.
