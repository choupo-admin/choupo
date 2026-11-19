# C440 converter slice -- moved and added golden rows (2026-11-18)

Branch build/c440-converter, cut from origin/main 57b69ec9a0.  No process number moved.

## What the slice found about its own premise

The brief asked to wire ONE non-PEQ ammonia plant's converter to the bed and shell sizers.
`greenAmmonia03_basicDesign` ALREADY is: its three `pfr` beds are sized from the Dyson-Simon
kinetics (a designSpec solves each V_R), its `CONVERTER` sector is one `converterShell` at one
diameter solved by outerDict, at 166 bar g, in SS316.  `ammonia02_full_plant` has a gibbsReactor
(no kinetics) sized as a `vessel` on a typed space velocity at 220 bar: wiring beds there would
replace the reactor and move every process number, which the brief forbids.  So no case was
rewired; the gaps that remained in the greenAmmonia03 converter were closed instead.

## Moved row (one)

| case | row | before | after | reason |
|---|---|---|---|---|
| greenAmmonia03_basicDesign | equipment CONVERTER/shell basis (text, exact) | the shell's geometry sentence | the same sentence + "WALL: ONE thin-wall ASME thickness at 166 bar g on material SS316's single sigma_y (138 MPa), NOT de-rated for the service temperature (...); hottest member port 788.15 K, stream CONVERTER.Bed1Out; HYDROGEN SERVICE: hydrogen attack and nitriding are NOT checked -- no Nelson-curve or hydrogen-service material table is shipped ..." | the sheet now says what its wall is and is not (C440). Edited by hand in the golden; no numeric row moved. |

## Added rows (record-append)

| case | row | value |
|---|---|---|
| greenAmmonia03_basicDesign | equipment CONVERTER/shell values.T_service [K] | 788.15 (the hottest port state of the five members; a lower bound on the metal temperature) |
| ammoniaRate01_dyson_simon | four rows for the new point `bed1Inlet_148p9atm` (V3 238.33, eta 0.03658, xi 0.47807, Eq40 113.94 kmol/m3/h) | read at 148.9 atm with the 150 atm column of Table I |

Every existing numeric row of both cases is byte-identical (`--scope` PASS; mass, element and
energy closures held, `energy_boundary_pinned` held).  The converter's before/after sizing
(V_R 86.21 m3, D 2.245 m, H 21.78 m, 182.5 t, 17.51 M EUR total module) is unchanged.
