# T1 (feeds x2): the per-unit rule of declared sizes (C492), 2026-11-25

`UNIT_RULES` in `bin/curate/proofs.py`.  A declared size is SCALED with the feeds where it is extensive, scaled by
sqrt(k) where only a cross section is, left alone where the model reads it only as an intensive length, and
anything not named leaves the case NOT JUDGED (the reason names the unit type and the key).  Each rule is read in the
engine source and checked by hand on one case: the case is run with the rule applied (it must HOLD to 1e-7) and with the
rule switched off for that key (the key left at its written value: it must break, or the rule is not needed).

| unit type (how many corpus cases the rule frees) | key | rule | source read | case, rule applied | the same case, key left unscaled |
|---|---|---|---|---|---|
| distillationColumn (about 35) | distillateRate, bottomsRate, side-draw `rate` | x k (molar flow specifications) | DistillationColumn.cpp specs | column01_benzene_toluene HOLDS (3.8e-12 over 36 keys) | VIOLATES (H_products moves 0.9 %, 24 keys) |
| distillationColumn, any `diameter` | `hydraulics { diameter }` | NO RULE yet: the mechanism x sqrt(k) (A_T = pi D^2/4, `DistillationColumn.cpp:5138`, velocity kept) is implemented but no judged case exercised it, so it is not claimed | `:5138` | - | NOT JUDGED by name |
| distillationColumn, tray | `hydraulics` with `trayType` | NO RULE: not homogeneous | weir loading is per weir length ~D (`:5201`) | scaling D x sqrt 2 moved dP_column_kPa 4 % in column09/10/11/17 (rating and design mode) | NOT JUDGED by name |
| cstr (26) | V_R, UA | x k (residence time kept; UA in W/K is extensive, `CSTR.cpp:745`) | CSTR.cpp:325,745 | cstr01_first_order HOLDS (4.8e-12) | VIOLATES (H_products -104 -> -208 kW) |
| pfr (19) | V_R | x k (space time kept) | PFR slices of V_R | pfr01_first_order HOLDS (2.7e-12) | VIOLATES (H_products doubles) |
| heater (18) | Q | x k (a duty in kW) | heater duty | hx01_heater HOLDS (2.6e-12) | VIOLATES (H_products -7733 -> -15565 kW) |
| spiralWoundModule (about 30) | vessels (inserted as `vessels 2` when the case has only a `module` record), area | x k; `length`, `channelHeight` inert | `SpiralWoundModule.cpp:259-267`, `:1795-1821`: identical vessels in parallel see the same feed state and the outlet is the one-vessel result x nVessels; area x k at a fixed length widens the channel | membrane23 HOLDS (4.7e-12 over 41 keys) | the engine REFUSES the x2 run (retentate P -1.14 bar: a vessel loaded with twice the flow) |
| spiralWoundModule, flat cell | `module` record with `format flatSheetCell` | NO RULE: one coupon of fixed area | `SpiralWoundModule.cpp:198`, `:270` (`vessels` refused for a cell) | membrane17 NOT JUDGED by name | the engine refuses `vessels 2` |

The selection is the five unit types that excluded the most cases in the scan of the 258 cases with a declared size
(distillationColumn 112 occurrences, then heatExchanger, pipe, spiralWoundModule 49, outerDict, heater 36,
electrodialysisStack, cstr 26, pfr 23).  Next by the same count, not done: evaporator `area` (14, needs UA or a U
correlation to be an extensive size), heatExchanger `area` (12), pump/compressor/turbine `W_shaft` (extensive, x k; the
nozzle sizes of the sizers are a postDict matter), electrodialysisStack (current and cell pairs: a count of parallel
pairs would be x k, not read yet).

Reproduction of the table: `python3 -c` with `proofs.UNIT_RULES[type][key] = 'inert'` then `proofs.t1(case)`; the
numbers above are from that run of 2026-11-25.
