# C318: the flash drums of the PEQ reference plant sized in detail -- goldens moved

Branch `build/c318-drum-sizing`, cut from `origin/main`. `bin/runTests --scope` over
`ammoniaPEQ_baseCase` shows 116 moved rows and 3 rows that disappeared; every one is a SIZING,
COSTING, INVENTORY or LAYOUT row of the three drums (Separator, LetdownHP, StorageFlash) or an
economics total that adds their cost. **No stream, unit KPI, balance or energy row moved** (the process
solves before the sizing pass; mass, element and energy closures held). The rows were then updated from
the run by `drum_upd.py`-style patching of exactly the failing rows (never `--record`), and the 54 rows the
new sizing publishes (K_SB, LLL/NLL/HLL, nozzles, ...) were appended with `--record-append`.

## Why each group moved

* **Sizing (equipment.<drum>.values.*, basis)** -- the drums used `residenceTime` on the ideal-gas vapour
  flow (V = Q_gas tau); they are now `drum { method towler; ... }`: V, D, H are results of the Souders-Brown
  area, the liquid levels (hold-up 600 s, surge 120 s, low level 0.3 m) and the orientation. All three come
  out HORIZONTAL (Separator: vertical H/D 5.02 > 5; LetdownHP 5426 and StorageFlash 198: liquid drums that
  the old basis could only lower-bound). `L_over_D` is now the result H/D (5, 4, 3 by pressure, Towler
  10.9.3). `Q_gas` (the ideal-gas flow of the old basis) is no longer published: the three rows were removed.
* **Costing (equipment.<drum>.cost.*) and inventory (equipment.<drum>.inventory.*)** -- follow V, D and the
  wall: bare module and total module of each drum; the inventories are the declared fractions of the new
  volumes (the fractions are unchanged author-set assumptions).
* **Economics (kpi.economics.*)** -- FCI 99.13 -> 102.13 MEUR, TCI 145.82 -> 148.92 MEUR, working capital
  and NPV follow; the break-even prices and the production cost move by the same capital.
* **Layout (layout.*)** -- a horizontal drum lies down. The plot plan now stands the three drums `alongX`
  at x = 74 m, y = 11, 18, 25 m (they were vertical at x = 62, 70, 78, y = 14); the loop kerb slab became
  x 66..82, y 8.5..26.8 m and its pit moved to x = 87, y = 18 m and deepened to 3 m, because the largest
  liquid holdup (LetdownHP, 18.8 m3) plus rain now needs 34.0 m3 (the old pit 18 m3 would be `inadequate`:
  the first run of the new sizing showed exactly that finding). Pipe, access, flare-line lengths and the plot
  footprint follow the new positions. Findings: 0 before, 0 after (the intermediate layouts showed 1 to 2
  separation findings, fixed by the spacing above).

## The rows (old -> new)

| row | old | new |
|---|---|---|
| equipment.LetdownHP.values.D | 0.455712445129 | 2.286 |
| equipment.LetdownHP.values.H | 1.36713733539 | 9.144 |
| equipment.LetdownHP.values.L_over_D | 3 | 4 |
| equipment.LetdownHP.values.V_R | 0.222937256182 | 37.5299988298 |
| equipment.LetdownHP.values.weight | 101.747966544 | 10798.0021026 |
| equipment.LetdownHP.cost.totalModule | 26939.7364931 | 1074361.10904 |
| equipment.Separator.values.D | 2.21900644711 | 2.1336 |
| equipment.Separator.values.H | 6.65701934132 | 10.668 |
| equipment.Separator.values.L_over_D | 3 | 5 |
| equipment.Separator.values.V_R | 25.7446402926 | 38.1415988108 |
| equipment.Separator.values.weight | 54517.2202427 | 80835.2502426 |
| equipment.Separator.cost.totalModule | 5029049.46997 | 6555587.24265 |
| equipment.StorageFlash.values.D | 1.6377892471 | 2.4384 |
| equipment.StorageFlash.values.H | 4.9133677413 | 7.3152 |
| equipment.StorageFlash.values.V_R | 10.3493614437 | 34.1606389349 |
| equipment.StorageFlash.values.weight | 846.861443203 | 2137.72721143 |
| equipment.StorageFlash.cost.totalModule | 168814.658767 | 399901.746253 |
| kpi.economics.FCI | 99130953.8463 | 102134555.074 |
| kpi.economics.NPV | -3237284828.42 | -3243209385.8 |
| kpi.economics.TCI | 145820420.99 | 148923841.309 |
| kpi.economics.productionCostPerKg | 1.86284194632 | 1.86423229732 |
| layout.summary.pipeLength | 1433.90469488 | 1487.71262106 |
| layout.plot.footprintArea | 3428.7374093 | 3483.97787159 |
| layout.bund:loopKerb.area | 192 | 292.8 |
| layout.bund:loopKerb.netVolume | 18 | 36 |
| layout.bund:loopKerb.requiredVolume | 16.6361600731 | 34.0049994149 |
| kpi.economics.breakEven_operating_fixed | 31861533.4523 | 32735915.143 |
| kpi.economics.breakEven_price_H2Feed | 1.78130846387 | 1.7699742548 |
| kpi.economics.breakEven_price_ProductNH3 | 1.93005376389 | 1.93261600333 |

(The other rows of the groups above, and the 54 new ones, are in the case's `expected`; the full list of
116 moved rows is the diff of that file.)

## New case

`tutorials/steady/flash/flash22_drum_sizing_benzene_toluene`, recorded with `--record`; its README repeats
the sizing by hand (D 1.668 -> 1.676 m vertical, H/D 5.71 -> horizontal D 2.438 m, L 7.315 m, levels 0.300 /
1.112 / 1.184 m, nozzles 471 / 407 / 134 mm), agreeing with the run to the printed digits.

## Not moved (checked)

`bin/runTests --scope` over `ammonia03_quench_converter`, `economics03_startup_years`,
`ammonia02_full_plant`, `ammoniaPEQ03_basicDesign` (all keep `residenceTime` drums): PASS 4/0, every golden
as written; the new code is behind `designRules { drum {} }`.
