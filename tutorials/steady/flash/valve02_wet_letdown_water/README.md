# valve02_wet_letdown_water — a throttle that ends inside the saturation plateau

An isenthalpic valve on water (IAPWS-IF97): 0.02 kmol/s at 450 K and 20 bar to
1 bar.  The outlet is a wet mixture at **372.76 K** (dT = -77.24 K).  The
density falls from 891.05 kg/m3 in the liquid feed to 3.99 kg/m3 for the
two-phase outlet, with phase densities 958.64 (liquid) and 0.590 (vapour)
kg/m3.  Figures are the case's `expected` rows.

## The lesson

1. The valve now solves through the shared (P,H) flash
   (`flashState::specifiedFlash`), the same routine as the adiabatic drum:
   with `adiabaticFlash02_wet_water_letdown` the outlet temperature is
   identical, 372.755918611 K.
2. A valve drops pressure at constant enthalpy; the temperature falls
   because part of the liquid vaporises.
3. The outlet is a mixture, so the printed density is the mixture's, not
   either phase's.

## What to try

Compare with `valve_refusal_pressure_raise`: the same unit asked to raise the
pressure refuses by name.
