# flash02_ethanol_water — the same flash, with the activity model switched on

A 50/50 ethanol/water feed (50 kmol/h of each) held at **355 K** and
**1.01325 bar** in one `isothermalFlash`.  Structurally this is
`flash01_benzene_toluene` again: one unit, one `operation { T ... P ... }`,
Rachford-Rice in one unknown.  Everything that is different is in
`constant/thermoPhysPropDict`, which declares NRTL with exactly the
parameters `compare_activity_etoh_water` plotted — `a_ij -0.8009`,
`b_ij 246.18`, `a_ji 3.4578`, `b_ji -586.0809`, `alpha 0.30`.

The golden: **V/F = 0.7976** (79.76 kmol/h vapour, 20.24 kmol/h liquid),
**K_ethanol = 2.2274**, **K_water = 0.5850**, and **Q_kW = 0**.

## The lesson

1. **K stopped being a ratio of pressures.**  In `flash01` Raoult gave
   `K_i = Psat_i(T) / P` and you could check both K's against the two vapour
   pressures the log prints.  Here the liquid is non-ideal, so
   `K_i = gamma_i * Psat_i(T) / P`, and the activity coefficient is the whole
   of the difference between this case and the last one.  The **Log** tab
   still prints the vapour pressures, so the gap between `Psat/P` and the
   reported K is the gamma, read off the screen.
2. **The model arrived from the case, not from the unit.**  The unit spec in
   `flowsheetDict` carries no thermodynamics at all — `type`,
   `in`/`outputs`, and `operation { T 355.0 K; P 1.01325 bar; }`.  Swapping
   Raoult for NRTL touched one file, and it was not the one describing the
   equipment.
3. **The gamma that acts here is not the gamma you plotted.**  Case 2 scanned
   an *equimolar* liquid; the liquid leaving this drum is not equimolar.
   `K_ethanol 2.2274` is greater than 1 and `K_water 0.5850` is less than 1,
   so ethanol concentrates in the vapour and the liquid left behind is
   water-rich — at a composition the previous case never evaluated.  A curve
   at fixed composition is a slice through a surface the flash walks across.
4. **`Q_kW = 0`, for the same reason as `flash01`.**  The feed file declares
   `vaporFraction 0.7975634083` at 355 K and 1.01325 bar, and the drum holds
   that same T and P — so the feed stream *already is* the two-phase mixture
   the drum separates, and the answer `V/F = 0.797563408329` reproduces the
   declared fraction digit for digit.  Enthalpy is a state function; nothing
   has to be added to hold a state you were already in.
5. **Read the `flowsheetDict` header before you move anything.**  It records
   that the operating pressure once read a bare `P 1.01325;` with no unit —
   parsed as 1.01325 **Pa** — which drove the K's to O(1e5) and reported a
   fully vaporised feed, converged, with no warning.  Scalars carry units in
   this grammar; that header is what a silent wrong answer costs.

## What to try

Set the liquid's `activityModel` back to `ideal` in
`constant/thermoPhysPropDict` and run again.  The K's collapse to `Psat/P`,
the split moves, and `Q_kW` stops being zero — because the feed's declared
vapour fraction is no longer the answer at 355 K.  That difference is case 2's
three curves, arriving in a unit.  Then open
`column01_benzene_toluene`, where this same equilibrium is solved on fifteen
stages at once.
