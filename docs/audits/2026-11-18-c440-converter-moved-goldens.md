# C440 converter slice -- moved and added golden rows (2026-11-18/19)

Branch build/c440-converter, cut from origin/main 57b69ec9a0.

## What the slice found about its own premise

The brief asked to wire ONE non-PEQ ammonia plant's converter to the bed and shell sizers.
`greenAmmonia03_basicDesign` ALREADY was: three `pfr` beds sized by a designSpec on the
Dyson-Simon rate, one `converterShell` at one diameter, 166 bar g, SS316.  `ammonia02_full_plant`
has a gibbsReactor on a typed space velocity; beds there would replace the reactor.  The
architect's ruling (2026-11-19): apply the effectiveness factor to greenAmmonia03's beds, with
the clamp to Table I's 150 atm column; re-record with reasons.

## The cause, in one change

`greenAmmonia03_basicDesign/constant/reactions`: the rate was Eq 19 (intrinsic, xi = 1).  It is
now Eq 40 = Eq 19 x xi (both legs carry xi), xi from Eq 39 on Table I read at max(P, 150 atm)
(`Pxi`), dp 8 mm declared (6-10 mm window refuses outside), xi window (0,1] announced, H2/N2
band announced, caveat rewritten.  The law's equilibrium-temperature window is narrowed from
300-1500 K to 500-1000 K because xi is a cubic in T that is negative below about 450 K, which
made forward-minus-reverse cross zero outside Eq 19's equilibrium (the run refused the
approach with "legs do not cross"); at the beds' conversions xi > 0 over 500-1000 K.
`variables{}` start values in flowsheetDict follow the new converged design point.

## Moved rows, by cause (greenAmmonia03_basicDesign `expected`; 1276 rows, 399 move beyond 1e-4, none added or removed)

Direct (the beds need more catalyst because xi < 1 on the rate):

| item | before | after |
|---|---|---|
| Bed1 V_R | 10.222 m3 | 15.918 m3 (+56 %: xi 0.43 at the inlet, bed 1 solved to the same 788.15 K outlet) |
| Bed2 V_R | 19.283 m3 | 23.848 m3 (+24 %: 5 K approach to the law's own equilibrium) |
| Bed3 V_R | 32.572 m3 | 33.299 m3 (+2 %: near equilibrium the approach criterion binds, not the rate) |
| converter D (one diameter, Ergun 1 bar) | 2.2451 m | 2.2547 m |
| bed heights L (Bed1/2/3) | 2.582 / 4.871 / 8.228 m | 3.987 / 5.973 / 8.340 m |
| bed dP | 0.349 / 0.629 / ~1.00 bar | 0.530 / 0.761 / ~1.00 bar |
| catalyst charges (2500 kg/m3, 15 EUR/kg) | 25.6 / 48.2 / 81.4 t | 39.8 / 59.6 / 83.2 t; total module 0.452 / 0.853 / 1.441 -> 0.704 / 1.055 / 1.473 M EUR |

Consequent, converter shell (stacked members, one wall):

| row | before | after |
|---|---|---|
| shell H | 21.777 m | 24.396 m |
| shell V | 86.21 m3 | 97.40 m3 |
| shell wall t | 148.5 mm | 149.2 mm (D grew) |
| shell mass | 182.5 t | 206.2 t |
| shell total module | 17.508 M EUR | 19.550 M EUR |
| shell basis text | geometry sentence | + wall/material/hydrogen-service statement and T_service (earlier commit) |

Consequent, loop and plant (small, all through the bed outlets):

- Bed outlet states: Bed2 T_out 763.94 -> 763.76 K, Bed3 T_out / HotEffluent T 735.677 -> 735.558 K, X_N2 moves in the fourth digit; HotEffluent F 4.8453 -> 4.8493 kmol/s; Purge F 3.4243e-3 -> 3.4277e-3.  Cause: the beds reach the same stated criteria with the larger charges, so the effluent differs only by the criterion's residual and by the dP.
- Everything downstream of those streams moves in the 3rd-5th digit: FEHE, interbed coolers, WaterCooler, Chiller, Separator rows (area, UA, cost, inventory), RecycleComp, the relief valves read from them (CONVERTER/psv A 3109.97 -> 3112.12), pinch totals (Q_hot 135847 -> 135872 kW), utilities, `boundary global residual_kW` 1.7606 -> 1.7608 (open energy closure pin unchanged in kind).
- Economics: FCI 60.504 -> 63.269 M EUR (+2.77: shell +2.04, catalyst +0.50, rest exchangers), TCI 106.39 -> 109.21 M EUR, NPV -3037.28 -> -3043.29 M EUR, productionCostPerKg 1.8486 -> 1.8500.  The README's generated stage comparison was regenerated (`gen_ammonia_stage_comparison.py`; NPV -3324.94 -> -3043.29 M EUR feasibility to basic design).
- Closures: mass, element and energy closures held in `--scope` (see the report); no closure is above tolerance.

## Other cases

- `ammoniaRate01_dyson_simon`: four rows appended for the new 148.9 atm point (xi 0.478), nothing moved.
- The converterShell basis text and `T_service` were added earlier in this branch (88ef1bb056).
- ammoniaReactor01/04, ammoniaRoutes01, ammonia03_quench_converter, greenAmmonia02 x2, ammonia02_full_plant: their files are untouched; they are in the `--scope` pass.

## Witness copy that follows the plant

`letdown01_ammonia_flashing` copies greenAmmonia03's `RawLiquid` and `Purge` streams to the digit
(`gui/tests/letdown.test.ts` holds the copy to the plant's own converged file), so `0/RawLiquid`
and `0/Purge` were refreshed from the plant's new converged/MAIN values (Purge N2 2.4562 -> 2.4589,
H2 9.5160 -> 9.5253, NH3 0.31626 -> 0.31658 kmol/h; RawLiquid NH3 2927.015 -> 2927.009 kmol/h).
Seven golden rows moved beyond 1e-4, all the purge flow's 0.1 % rise passing through the purge
valve (stream FuelGas.F, Purge.F, PurgeValve F, Q_in, Q_out, dT, massFlow; e.g. F 3.42426e-3 ->
3.42767e-3 kmol/s); `--record` rewrote the other 66 rows within tolerance.  Cause: the same bed
change, through the loop's purge.

`letdown02_valve_fluid_properties` (the props witness of the same drum liquid and purge) carries the
same two compositions and the liquid's T in its propsDict, held by the same test; they were copied
from letdown01's refreshed files (T 253.014294846 -> 253.014292544 K).  One golden row moved beyond
1e-4: `diag.purge.H_R` -145.3828 -> -145.3985 (the purge's composition moved by 0.1 %); the rest
refreshed within tolerance.
