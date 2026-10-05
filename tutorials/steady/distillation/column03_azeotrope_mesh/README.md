# column03_azeotrope_mesh — when the method is part of the model

A 100 kmol/h ethanol/water feed, **30/70**, into a **16-stage** column with
the feed on **stage 8**, **R = 2.5**, distillate **25 kmol/h**, at
**1.01325 bar**, under the same NRTL parameters
`compare_activity_etoh_water` plotted and `flash02_ethanol_water` used.
Everything about that specification is ordinary.  The one line that is not is
in the unit's third slot: **`model simultaneous;`**.

The golden: **x_D = 0.8046** ethanol, **x_B = 0.8682** water, T_top
**351.39 K**, T_bottom **357.71 K**, reboiler **956.24 kW**, condenser
**−952.97 kW**, and the plant-boundary first law closing at a residual of
**0 kW**.  The feed is a **saturated liquid at 354.42 K**, declared as one in
`0/feed` (`phase liquid;` at its own bubble point).

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
   956.24 kW of reboiler heat for a 25 kmol/h distillate.
4. **The case asks for the profile, and the profile is where a column is
   read.**  `controlDict` declares `reports { streamTable massBalance
   profiles spreadsheet }`.  The `profiles` report prints T, x and y stage by
   stage; read it tray by tray and you can see how much of the column is
   actually separating and how much of it is barely moving.  A column is
   specified in four numbers and understood in that table.

5. **A feed's state is said once, by the stream.**  Until 2026-10-05 this
   case said two things: `0/feed` put the feed at 363 K, and the column said
   `feedQuality 1.0` (a saturated liquid).  At 363 K and 1 atm this mixture
   is all vapour under the case's own NRTL (it boils at 354.42 K, and the
   engine's own flash at 363 K finds V/F = 1), so the column priced a liquid
   while the
   energy report priced the vapour the stream is, and the plant boundary
   carried a **1149.69 kW** residual -- the latent heat of the whole feed.
   The engine now reads a feed by what it MEANS and refuses the
   contradiction; the case was corrected to declare the saturated liquid it
   was designed around, and the first law closes.  Two things to take from
   that: a quantity with two homes will one day disagree with itself, and a
   vapour feed is not a drop-in alternative here -- try deleting
   `phase liquid;` and setting `T 363 K;` in `0/feed`: with q = 0 this
   specification leaves the stripping section without vapour, and the MESH
   says so by name.

## What to try

Change the unit's `model` to `WangHenke` and run it.  Watch the **Log** tab:
the outer iterations march and `max|Δx|` does not fall.  That is the whole
claim of this case, reproduced in front of you — and it is why "which solver"
belongs in the model, not in a footnote.  Then open
`cstr01_first_order`, where composition changes for a reason that has nothing
to do with phase equilibrium.
