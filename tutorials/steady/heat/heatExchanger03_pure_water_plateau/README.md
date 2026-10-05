# heatExchanger03_pure_water_plateau — the state a temperature cannot name

Superheated steam at **100 bar, 700 K** against feedwater at **40 bar,
480 K**, 100 kmol/h each, in a counter-current exchanger of **2 m²** at
**U = 1000 W/m²K**; then a `heater` takes **500 kW** more out of the steam.
Every stream carries ONE component, water.

## The lesson

1. **A pure fluid boils at one temperature.**  At fixed pressure its
   enthalpy H(T) is a step at Tsat(P): every joule between the saturated
   liquid and the saturated vapour goes in AT Tsat.  So when the duty asks
   for an enthalpy inside that step, the outlet temperature is Tsat and what
   changes is the **vapour fraction**, q = (H − h_L)/(h_V − h_L).
2. **Both directions in one unit.**  The exchanger's duty (from ε-NTU)
   partly condenses the steam (it leaves at Tsat(100 bar) with q ≈ 0.95) and
   partly boils the feedwater (Tsat(40 bar), q ≈ 0.10).  The Log prints a
   `PURE fluid on its saturation plateau` line for each side.
3. **Why the stream carries q as a pin.**  For a mixture, T and P between
   the bubble and dew points fix the split.  For ONE component on its
   curve they do not — any q is consistent with them — so the stream must
   say which.  Open `converged/wetFeed`: `T`, `P` and `vaporFraction`, the
   one case where a stream legitimately declares all three.
4. **The temperature does not move, the quality does.**  `trimCooler`
   removes 500 kW from the wet steam: T_out equals T_in (to the
   bisection's precision) and q falls from 0.95 to 0.42.
5. **Nothing is lost.**  The energy balance closes every unit to the duty
   it declares, and the plant boundary to zero.

## What it does not claim

This is a STRUCTURAL witness.  The water record's Antoine fit is stated for
273–373 K, so Tsat at 40 and 100 bar is extrapolated (and announced):
Tsat(40 bar) here is 515.6 K, not the steam tables' 523.5 K.  The vapour is
an ideal gas and the latent heat is Watson's.  What the case pins is the
mechanics — the outlet sits at Tsat with the quality the first law demands
— never the steam properties.

## What to try

Raise the area to 4 m²: more feedwater boils, more steam condenses, and
both outlet temperatures stay exactly where they were.
