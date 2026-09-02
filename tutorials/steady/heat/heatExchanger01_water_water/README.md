# heatExchanger01_water_water — the exchanger you can check by hand

Hot water (100 kmol/h, 360 K) against cold water (120 kmol/h, 300 K) in a
counter-current exchanger of **10 m²** at **U = 500 W/m²K**.  Nothing
about the outlet temperatures is declared; the ε-NTU method finds them.
The golden: **Q = 93.79 kW**, hot out **315.28 K**, cold out
**337.27 K**, NTU 2.384, C_r 0.833, **ε = 0.745**, LMTD 18.76 K.

## The lesson

1. **Rating, not design.**  The hardware (area, U, flow arrangement) is
   given in `operation {}`; the question is what it *does* with these two
   streams.  `hxWorkflow1_design_from_duty` asks the reverse.
2. **ε-NTU in four printed numbers.**  The **Log** tab prints NTU, C_r,
   ε and Q on one line, and then **checks itself**: `U·A·LMTD = 93.79 kW`
   beside the ε-NTU result.  Two routes, one answer — that agreement is
   the method being right, and you can redo either on paper.
3. **The smaller heat-capacity rate sets the limit.**  C_hot = 2097 W/K
   is the minimum (fewer moles), so ε is measured on the hot stream:
   (360 − 315.28)/(360 − 300) = 0.745.  Read C_hot and C_cold in the
   KPIs and confirm C_r.
4. **No utility is consumed.**  Both sides are process streams; the
   93.79 kW is *recovered*, which is the whole reason to install an
   exchanger rather than a heater and a cooler.

## What to try

Switch `flow counter;` to `flow co;` and run again: same area, same U,
smaller ε, less heat — the classic comparison, in one word of the dict.
