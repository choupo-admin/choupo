# column01_benzene_toluene — fifteen stages, solved one tray at a time

The same equimolar benzene/toluene feed (100 kmol/h, now at 370 K) in a
rigorous column: **15 stages** (reboiler counted), feed on **stage 8**,
**R = 2**, distillate **50 kmol/h**, Raoult VLE, solved by the Wang–Henke
bubble-point method.  At 370 K and 1 atm the feed resolves to about
70 % vapour (q = 0.30), so the reboiler does far less than the condenser.
The golden: **x_D = 0.9510** benzene, **x_B = 0.9510** toluene, T_top
**355.69 K**, T_bottom **381.51 K**, condenser **−1283 kW**, reboiler
**647 kW**.

## The lesson

1. **The specification is the column, not the split.**  Compare with
   `shortcut01`: there you declared the recoveries and got N; here you
   declare N, the feed stage, R and D — and the purity is the *answer*.
   Both cases separate the same feed; only the question differs.
2. **Watch it converge.**  The **Log** tab prints `Pass  max|Δx|
   balance/F  T_top  T_bottom` for the **41** bubble-point passes.  The
   step and the balance fall by the same factor, about 0.65, every pass:
   that is what linear convergence looks like.  The column stops on the
   balance, not the step — when every stage balance and the balance over its ports
   close to 1e-9 of the feed (here 7.4e-10, with a last step of 2.3e-9).
   A small step alone is not a closed balance: a column that contracts
   slowly takes small steps while still far from its answer.
   `column02_simultaneous` solves the identical column by a Newton on all
   the MESH equations in a handful of iterations — run both and count.
3. **The profile is printed stage by stage.**  T and x for every tray,
   the feed tray marked, the reboiler last: 355.69 K and 88.3 % benzene
   in the liquid on tray 1 (the vapour leaving it, the distillate, is
   95.1 %), 381.51 K and 95.1 % toluene in the reboiler.  That table is
   the McCabe–Thiele diagram in numbers.
4. **Two duties, two utilities, priced from the catalogue.**  The reboiler
   is served by low-pressure steam (0.296 kg/s, 27.96 €/h at the catalogue
   price) and the condenser by cooling water (30.69 kg/s, 1.85 €/h) — the
   same picker every steady report uses, and the €/h is a catalogue
   number, not a market one.
5. **Read the caveats.**  Both Antoine fits are asked slightly outside
   their declared windows on the way to the answer (benzene at 370 K,
   toluene at 380.7 K), announced and still returned.

## What to try

Raise `refluxRatio` to 3: purities climb, both duties climb with them —
the trade-off every column design turns on.  Then try `feedStage 4`: the
same reflux buys less separation when the feed lands in the wrong place.
