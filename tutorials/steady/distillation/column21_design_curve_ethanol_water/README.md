# column21_design_curve_ethanol_water — one point of a design curve

The feed is that of `column03_azeotrope_mesh`: 100 kmol/h of ethanol/water,
30/70, a saturated liquid at 1 atm, NRTL liquid and ideal vapour, on
`model simultaneous`. What changes is the question. `column03` fixes the
reflux ratio and the distillate rate and reads the purities; here the
**specification is fixed** (ethanol 0.85 in the distillate, water 0.99 in the
bottoms, both below the azeotrope at about 0.89) and a **`designSpec`**
(`system/outerDict`) finds the reflux ratio `$R` and the distillate rate `$D`
(the case's `variables`) that put the column exactly on it.

At the written 30 stages with the feed on stage 27 the answer is a reflux of
**2.3671**<!--golden: kpi column R--> and a reboiler duty of
**1340.46 kW**<!--golden: kpi column Q_reboiler_kW-->; the tray hydraulics
design a tower of **0.8665 m**<!--golden: kpi column diameter--> and the
postDict sizes and costs the shell, trays, condenser, reboiler and reflux
drum (Turton). The purities come out at **0.85**<!--golden: kpi column x_D_LK-->
and **0.99**<!--golden: kpi column x_B_HK--> by construction.

## The lesson

1. **A design is a point on a curve.** Change `nStages` (and `feedStage`, at
   about nine tenths of the column here) and run again: every integer stage
   count has its own reflux ratio, all of them on the same specification.
   Plotted, those points are R(N), with the minimum reflux as the floor at many
   stages and the minimum stages as the wall at a large reflux.
2. **Two unknowns, two targets.** The `designSpec` is a 2 x 2 Newton on the
   case's `$variables`; the targets are the unit's own `x_D_LK` and `x_B_HK`.
   Compare `tutorials/steady/optimisation/designSpec01_triple_equal_areas`.
3. **The whole curve is recorded, not re-run here.** The script
   `bin/curate/c501_column_design_table.py` runs this case's procedure at every
   stage count (and on the ideal benzene/toluene control, and the shortcut
   column on both) and writes the table the EduTool `column-design` reads. This
   case is its row for N = 30.

## What it does not show

The column is the simultaneous one with constant molar overflow and an
ideal-gas vapour; the exchanger areas come from declared U and LMTD; the feed
placement is a fixed fraction of the column, not an optimum. Nothing is
validated against a measurement.
