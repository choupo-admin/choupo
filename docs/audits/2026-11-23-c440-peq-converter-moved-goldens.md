# C440 / C302 -- the reference plant's converter: moved and added golden rows (2026-11-23)

Branch build/c440-c302-reference-plant, cut from origin/main 645c6cbea0.
Case: `tutorials/plant/ammoniaPEQ_baseCase`. The `expected` file was deleted and re-recorded
whole (it carries no anchor row), because `--record` keeps rows whose keys the run no longer
prints: 2923 rows before, 3126 after; 143 removed, 346 added, 505 moved beyond their 1e-4
tolerance.

## The cause, in one change

The plant's converter was ONE Gibbs reactor (733.15 K, 5 K short of equilibrium) sized as a
vessel on an ASSUMED space velocity of 20000 1/h. It is now the converter of
`ammoniaPEQ03_basicDesign`: a sector `CONVERTER` of three adiabatic `pfr` beds on the Dyson &
Simon rate times the effectiveness factor (`constant/reactions`), two interbed steam boilers
(420 and 410 C), one pressure shell (`converterShell`, SS316, 166 bar g). The bed volumes and the
shared diameter are `variables` (`V_Bed1..3`, `D_converter`): the design point of 03's 3 x 3
DesignSpec, RE-RUN on this plant before the numbers were adopted: converged at once (0
iterations, `||F||` 0.048 against a tolerance of 1). The outerDict is not shipped in this case:
under an outer driver the layout is checked after the post-processing chain, and the `land`
block needs the plot area (the run refuses by name).

Consequent edits that move rows by themselves: the energy recycle is now cut at `PreheatedFeed`
(a tear cannot sit on a sector outlet), `recycleTol` 1e-8 -> 1e-10, the recycle compressor power
850 -> 908 kW (re-tuned so the loop is again at 150.9 bar, as 03 did), 0/ moved under `MAIN/`
and `CONVERTER/`, the FEHE's `tubeStream` is `CONVERTER.HotEffluent`.

## Removed rows (143)

Every row of the retired unit: `kpi Converter` (16: Gibbs lambdas, approach, y_i), `equipment
Converter` (23: the vessel on a space velocity, its inventory), `utility Converter` (4), the
layout rows of the item `Converter` (9), its nozzles (20), `access:Converter`, and the layout
lines and pipes of the two streams that now end on the sector (`line:PreheatedFeed`,
`line:HotEffluent`, 3+3 pipes, 25+25 rows: re-routed to the shell's ports, re-added under the
same keys with new values or counted as moved), plus two FEHE nozzles whose ports moved.

## Added rows (346)

`kpi CONVERTER.Bed1/2/3` (40 each), `kpi CONVERTER.InterbedCooler1/2` (11 each), `equipment`
for the two boilers (45 each), the shell (18), the three bed baskets (10 each) and catalyst
charges (7 each), `layout CONVERTER/shell` and its nozzles and manways, `utility
CONVERTER.InterbedCooler1/2` (4 each), `layout plotSector:CONVERTER`, the four interior streams
(`Bed1Out`, `Bed2Feed`, `Bed2Out`, `Bed3Feed`: F and T).

## Moved rows (505, by cause)

* The loop carries more gas, because the beds lose pressure (0.53 + 0.76 + 1.00 bar, Ergun) and
  the converter leaves at 18.9 % NH3 and 735.56 K against 19.7 % at 733.15 K: HotEffluent F
  4.6222 -> 4.8493 kmol/s, CompRecycle F 3.8021 -> 4.0291, Separator F_in 4.6222 -> 4.8493,
  RecycleComp W_shaft 850 -> 908 kW (W_isen, T_out, dS_gen follow), product ProductNH3 F 0.80450
  -> 0.80440 (1184 t/day). All plant-wide quantities downstream move in the 2nd-3rd digit: FEHE
  (Q 61.56 -> 64.38 MW, 13 rows, plus the 35 rows of its Kern design), WaterCooler (Q 6.809 ->
  6.591 MW), Chiller (Q 20.790 -> 21.901 MW), Separator, LetdownHP, StorageFlash, NH3Storage (16
  rows per tank: working volume follows the production), the utility rows of the coolers.
* Pinch (15 rows): 10 -> 12 segments, `duties_excluded` 1 -> 0, `Q_excluded_kW` 30264 -> 0,
  Q_hot_total 102.7 -> 135.9 MW, Q_C,min 41.11 -> 71.43 MW, Q_recovery_max 61.62 -> 64.44 MW,
  T_pinch 728.15 -> 783.15 K (a threshold problem both times: no interior pinch).
* Economics (27 rows): FCI 99.47 -> 120.59 M EUR (the shell 19.55, the catalyst 3.23 M EUR of
  total module, the two boilers, minus the retired vessel), TCI 146.20 -> 167.86, NPV -3237.9 ->
  -3287.7 M EUR, C_UT 5.54 -> 6.51 M EUR/yr, C_UT_credit -15.46 -> -15.03 M EUR/yr (the steam is
  raised in the coolers, 29.4 MW, not 30.3 MW), productionCostPerKg 1.863 -> 1.876, break-even
  ammonia price 1.930 -> 1.952 EUR/kg.
* Layout (about 150 rows): the converter item is now `CONVERTER/shell` (2.25 m x 24.4 m, was
  1.67 m x 10.0 m), the pipes meet its ports, the plan's summary moves (33 placed, 2 sized items
  not placed on their own: the two boilers sit inside the shell).
* Plant first law: `boundary global` Q_boundary -57705.6 -> -57699.0 kW, residual 1.7533 ->
  1.7608 kW (the pinned open residual, tolerance abs 0.85 either way), W_shaft 13670 -> 13728 kW.

## Closures

Held in `bin/runTests --scope tutorials/plant` (19 PASS, 0 FAIL): total mass 99.997 %,
element balances, energy closure (the three beds' closures hold by construction and are
VERIFIED by the adiabatic second route; the unit arm of `check_energy_closure` lost its
Gibbs witness `Converter`, whose -7.24 kW departure-function residual was a property of that
reactor, and the entry is removed from the gate), plant-boundary first law.

## Gates edited because they named the retired unit

* `bin/curate/check_energy_closure.py`: the witness `(ammoniaPEQ_baseCase, Converter)` removed.
* `bin/curate/check_unit_duty_allocation.py`: arm (c) and (d) read the two interbed coolers (the
  declared steam credit, now on the two units that raise it).
* `gui/tests/bund.test.ts`: the green witness pins follow the tank's new volume (20196.5623 m3).
* `gui/tests/limitingReactant.test.ts` and the lesson: the loop's measured numbers re-taken on
  the new plant (inlet H2/N2 3.584 -> 3.579, exact-3 run 3.526 -> 3.522, per-pass N2 conversion
  0.350 -> 0.336, rho_B 2.4 -> 2.6), read from the bed rows of the golden.
* `gui/tests/frontEndLoading.test.ts`, `caseAliases.test.ts`, `drillProjectedSeed.test.ts`: the
  folder `Converter` they drilled into is gone.
