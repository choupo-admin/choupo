# adiabaticFlash02_wet_water_letdown — an outlet inside the saturation plateau

Water (IAPWS-IF97), 0.02 kmol/s at 450 K and 20 bar, is let down to 1 bar in
an adiabatic drum.  The feed is compressed liquid.  The energy balance puts the
outlet on the saturation plateau: **372.76 K** (a 77.24 K drop), with
**14.72 %** of the feed flashed to vapour (0.00294 kmol/s vapour, 0.01706
kmol/s liquid).  Both leave at the same temperature.  The figures are the
case's `expected` rows.

## The lesson

1. On the plateau a pure fluid's temperature is fixed by the pressure, so
   (P, H) has no root in T.  The vapour fraction carries the enthalpy.
2. The unit asks the shared (P,H) flash (`flashState::specifiedFlash`); the
   Log prints its bracketed Newton in T and the outlet route it took.
3. The energy closure is exact: H_feeds = H_products = 270.17 kW, Q = 0.

## What to try

Change `P` in the Properties box and watch the plateau temperature follow the
saturation line.  Compare `adiabaticFlash03_near_pure_letdown`, which adds a
trace of methanol, and `valve02_wet_letdown_water`, the same letdown through a
valve.
