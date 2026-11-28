# pump10_supercritical_outlet — a pump above the critical pressure

A water pump from 1 bar and 298.15 K to 300 bar, above the critical pressure
of water, with efficiency 0.65 and flow 0.01 kmol/s.  The outlet is a
single-phase compressed liquid at **302.72 K** (dT = 4.57 K).  Head 3058 m,
hydraulic work 5.40 kW, shaft work **8.31 kW**.  Figures are the case's
`expected` rows.

## The lesson

1. Above the critical pressure there is no saturation temperature, so a pump
   must not ask for T_sat: the case witnesses that it does not.
2. The outlet is a single-phase compressed liquid; the case asks for no
   T_sat.
3. The shaft work is the hydraulic work over the efficiency: 5.40 / 0.65 =
   8.31 kW.

## What to try

Lower the outlet pressure below the critical pressure and compare.
