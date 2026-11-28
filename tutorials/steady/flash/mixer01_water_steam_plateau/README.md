# mixer01_water_steam_plateau — liquid and steam mixed onto the plateau

An adiabatic mixer on water (IAPWS-IF97): 0.01 kmol/s of liquid at 300 K and
0.01 kmol/s of steam at 450 K, both at 1 bar.  The mix ends on the saturation
plateau at **372.76 K** with a vapour fraction of **0.4668**, outlet 0.02
kmol/s.  H_feeds = H_products = 530.08 kW and Q = 0.  Figures are the case's
`expected` rows.

## The lesson

1. The mixer fixes the outlet by an enthalpy balance at the outlet pressure,
   and asks the shared (P,H) flash (`flashState::specifiedFlash`) for the
   state.
2. On the plateau the temperature is the saturation temperature of 1 bar, the
   vapour fraction does the balancing.  The same 372.76 K appears in the two
   letdown cases at 1 bar.
3. The case witnesses that the mixer handles an outlet inside the plateau.

## What to try

Change the liquid flow and watch the vapour fraction move while T stays put,
until one phase disappears.
