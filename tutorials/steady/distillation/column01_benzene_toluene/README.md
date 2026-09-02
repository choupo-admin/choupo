# column01_benzene_toluene — fifteen stages, solved one tray at a time

The same equimolar benzene/toluene feed (100 kmol/h, now at 370 K) in a
rigorous column: **15 stages** (reboiler counted), feed on **stage 8**,
**R = 2**, distillate **50 kmol/h**, Raoult VLE, solved by the Wang–Henke
bubble-point method.  The golden: **x_D = 0.9812** benzene, **x_B =
0.9812** toluene, T_top **354.21 K**, T_bottom **382.89 K**, condenser
**−1281 kW**, reboiler **1279 kW**.

## The lesson

1. **The specification is the column, not the split.**  Compare with
   `shortcut01`: there you declared the recoveries and got N; here you
   declare N, the feed stage, R and D — and the purity is the *answer*.
   Both cases separate the same feed; only the question differs.
2. **Watch it converge.**  The **Log** tab prints `Outer iter  max|Δx|
   T_top  T_bottom` for all **108** bubble-point iterations, the final
   max|Δx| = 9.3e-8.  Wang–Henke is slow and steady; `column02_simultaneous`
   solves the identical column by a Newton on all the MESH equations in a
   handful of iterations — run both and count.
3. **The profile is printed stage by stage.**  T and x for every tray,
   the feed tray marked, the reboiler last: 354.21 K and 95.3 % benzene
   on tray 1, 382.89 K and 98.1 % toluene in the reboiler.  That table is
   the McCabe–Thiele diagram in numbers.
4. **Two duties, two utilities, priced from the catalogue.**  The reboiler
   is served by low-pressure steam (0.585 kg/s, 55.3 €/h at the catalogue
   price) and the condenser by cooling water (30.6 kg/s, 1.84 €/h) — the
   same picker every steady report uses, and the €/h is a catalogue
   number, not a market one.
5. **Read the caveats.**  Both Antoine fits are asked slightly outside
   their declared windows on the way to the answer (benzene at 365 K,
   toluene at 380.7 K), announced and still returned.

## What to try

Raise `refluxRatio` to 3: purities climb, both duties climb with them —
the trade-off every column design turns on.  Then try `feedStage 4`: the
same reflux buys less separation when the feed lands in the wrong place.
