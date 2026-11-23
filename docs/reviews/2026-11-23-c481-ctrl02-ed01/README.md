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

- The ctrl02 Trajectory plot overlays twelve series on two axes; the landing is
  now the response, the legibility of that figure is a separate item (walk 15).

## Fix round (Opus review)

- The direction is a published flag, not a name match: `ElectrodialysisStack` publishes `drawsPower 1`;
  `resolveEnergyInputs` tells an `electricLoad` `operation.drawsPower` (ANY of its wires); the load then
  publishes the grid draw `W_electric = W_DC/eta`, `W_losses = W_DC (1/eta - 1)`, `eta_rectifier`
  (not `eta_generator`), and the report bills exactly `W_electric`.  Probes in
  `check_unit_duty_allocation.py` (f): ed01 at eta 0.9, a two-wire rectifier, a turbine generator and a
  load chained behind it.  Moved rows beyond the first re-record: per ED case
  `kpi rectifier eta_generator` -> `eta_rectifier`, new `drawsPower` rows on the stack and the rectifier;
  values identical at eta 1.
- Plots landing: a trajectory first only for `choupoCtrl`; an uncontrolled transient keeps the ledger.
- GUI pre-run stub uses the engine's rule (`POWER_DRAWING_FEEDER_TYPES`); a run's own row wins after.
- Docs: docs/ai/energy.md, unit-ops.md, the electricity.dat header (11 copies), Theory Guide (power bill +
  ElectricLoad entry), theoryGuide.pdf rebuilt.

## Registered, pre-existing, not fixed

- The turbine-generator cases still do not pin `utilities/electricity.dat`.
- ed04's DC power (a stack with no rectifier) is never billed and never announced.
- Sectored plants: wire sources are unit names local to a sector (qualified names are not resolved).
