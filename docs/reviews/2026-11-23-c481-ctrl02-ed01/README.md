# C481 -- C266 walk findings 7, 8, 9 (ctrl02, ed01)

Live app (dev GUI, WebGL off, WASM rebuilt from this tree), after the fix.
"Before" is the walk's own capture on main:
`../2026-11-23-c266-student-walk/S2-ctrl02-plots-lands-on-balances.png`,
`S2-ctrl02-products-none-no-units.png`, `S2-ed01-electricity-generated.png`.

| # | cause | fix | after |
|---|---|---|---|
| 7 | `gui/src/case/defaultPlot.ts`: the dynamic balance ledger ranked above a time trajectory | a trajectory wins; the ledger stays one click away | `after_ctrl02_02_Plots.png` opens on Trajectory (PV, SP, MV, the T_in steps) |
| 8a | a time-integrated run publishes no stream table (`streams` empty; the Streams tab says so), so `PRODUCTS` filtered nothing and read "none" | `RunSummaryStrip` names the graph's outlets: `product (no steady state published)` | `after_ctrl02_01_Flowsheet.png` |
| 8b | `dynamicCSTR` has no operation schema; the card dropped even the unit the dict declared (`T_jacket 320 K` printed `320`) | schema `gui/schemas/operations/dynamicCSTR.schema.json` (UA W/K, T_jacket K, read from `DynamicCSTR.cpp:195-196`); and a key the schema does not describe keeps its declared unit (`UnitNode.tsx` `summarise`) | `UA = 50 W/K`, `T_jacket = 320 K` |
| 9a | `src/reporting/UtilityAllocationReport.cpp`: every `electricLoad` was credited "electricity (generated)"; in ed01-03, 05-10 it is the rectifier of the stack's DC draw (`W_electric`, P = U I) | the direction is read from who feeds the wire: a feeder that publishes `W_electric` draws, so the row is `electricity`, a cost on W_DC / eta (no motor efficiency); a turbine's generator is unchanged. The pre-run power stub (`toGraph.ts`) says the same word | `after_ed01_01_Flowsheet.png`: `POWER electricity  W = +0.1 kW  0.0 EUR/h` |
| 9b | `electrodialysisStack` / `batchElectrodialysis` schemas gave `current`, `voltage`, `E_electrodes` the unit `-` | A and V (the descriptions already said "raw SI (amperes / volts)") | `current = 8 A` |

## Moved golden rows (9 cases, utility rows only)

ed01, ed02, ed03, ed05, ed06 (R1-R4), ed07, ed08, ed09, ed10:
`utility <unit> power.electricity_(generated).{duty_kW,T,kg_s,eur_h}` becomes
`power.electricity.*`.  `duty_kW`, `T`, `kg_s` are numerically identical;
`eur_h` changes sign (a credit of -0.0108 EUR/h becomes the cost of
+0.0108 EUR/h in ed01).  `utilities/electricity.dat` is now pinned in each
manifest: the price is a recorded read.  No other number in any golden moved.

## Not done

- The card still prints `N_cellpairs = 100 -` and `xi = 0.9 -` (the schema's `-`
  for a dimensionless key); a one-line rule in `fmtScalar` would hide it.
- The ctrl02 Trajectory plot overlays twelve series on two axes; the landing is
  now the response, the legibility of that figure is a separate item (walk 15).
- Pre-run, a turbine-less ED case with no `energyOutputs` expression
  `W_electric` would still read "(generated)"; the engine rule decides after a run.
