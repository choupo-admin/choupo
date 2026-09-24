# column03_azeotrope_mesh — when the method is part of the model

A 100 kmol/h ethanol/water feed, **30/70**, into a **16-stage** column with
the feed on **stage 8**, **R = 2.5**, distillate **25 kmol/h**, at
**1.01325 bar**, under the same NRTL parameters
`compare_activity_etoh_water` plotted and `flash02_ethanol_water` used.
Everything about that specification is ordinary.  The one line that is not is
in the unit's third slot: **`model simultaneous;`**.

The golden: **x_D = 0.8046** ethanol, **x_B = 0.8682** water, T_top
**351.39 K**, T_bottom **357.71 K**, reboiler **935.61 kW**, condenser
**−952.97 kW**, and the plant-boundary first law closing at a residual of
**0 kW**.

## The lesson

1. **`type`, then `model`, then `operation` — and here `model` is the
   numerical method.**  `distillationColumn` accepts `WangHenke` (the
   default, and what solved `column01`) or `simultaneous`, the rigorous MESH
   Newton that solves every stage equation at once.  The `operation` block is
   unchanged in kind from `column01`: the same four specifications, the same
   grammar.  Only the machine behind them was chosen differently, and this
   case exists because on this mixture that choice decides whether there is
   an answer at all.  The case's own `flowsheetDict` header records that the
   sequential bubble-point method does not converge here.
2. **The azeotrope is a ceiling, and the answer sits under it.**  Ethanol and
   water form an azeotrope the case names at roughly `x_eth 0.894` at 1 atm;
   the distillate comes out at **0.804616545279** ethanol.  A distillate
   specified above the azeotrope is not a hard convergence problem — it does
   not exist, and the header is explicit that no method reaches it.  A solver
   that *did* return such a number would be reporting something physically
   impossible.
3. **The temperature span is the azeotrope showing itself.**  Sixteen stages
   buy only **6.32 K** from top to bottom here (351.39 K to 357.71 K).
   `column01` separates benzene from toluene over **28.68 K** on fifteen
   stages.  Same kind of equipment, same kind of specification; the mixture
   is what collapsed the driving force, and the duties tell the same story —
   935.61 kW of reboiler heat for a 25 kmol/h distillate.
4. **The case asks for the profile, and the profile is where a column is
   read.**  `controlDict` declares `reports { streamTable massBalance
   profiles spreadsheet }`.  The `profiles` report prints T, x and y stage by
   stage; read it tray by tray and you can see how much of the column is
   actually separating and how much of it is barely moving.  A column is
   specified in four numbers and understood in that table.

5. **The run tells you something the answer does not, and it is worth
   reading.**  Every execution of this case raises a validity notice about
   the feed: it `is priced as LIQUID (vf = 0) at T = 363 K, P = 1.01325 bar,
   but its own Rachford-Rice residual there is g(V=0) = 0.393227, i.e. it is
   ABOVE its bubble point and cannot hold that label; the enthalpy priced for
   it is missing (or inventing) that phase change.`  The case declares
   `feedQuality 1.0` (a saturated liquid) and the MESH solves the stages from
   that declaration, so the compositions above are what it asked for — but
   the stream's own state at 363 K disagrees, and the enthalpy is where the
   disagreement lands.  The plant boundary still closes at 0 kW, because the
   same pricing is used on both sides of it.  Two things to take from that:
   the engine announces rather than hides, and a balance that closes is not
   the same as a balance that is right.

## What to try

Change the unit's `model` to `WangHenke` and run it.  Watch the **Log** tab:
the outer iterations march and `max|Δx|` does not fall.  That is the whole
claim of this case, reproduced in front of you — and it is why "which solver"
belongs in the model, not in a footnote.  Then open
`cstr01_first_order`, where composition changes for a reason that has nothing
to do with phase equilibrium.
