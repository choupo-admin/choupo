# C421 door slice A (hydraulics and heat): every moved golden row (2026-11-18)

Reason for the whole slice: the pipe (`Pipe.cpp`) and the pipe-header sizer (`PipeHeaderSize.cpp`) no longer read a
liquid or gas property typed in their own block.  A `viscosity`, `surfaceTension` or `gasViscosity` in a pipe's
`operation` / `twoPhase`, or a `viscosity` in a header's designRules, is refused by name
(`unitTypedProperties::refuse`) with the line to write in the property dictionary; the pipe asks the one door
(`liquidProperty::evaluate`) for the liquid and `thermo.viscosityGas` for the gas.  Rows below are those the scoped
run reported beyond tolerance; the re-record of each case also refreshed the rows that moved inside the 1e-4
tolerance (listed per case).  Closures: the scope's mass, element and energy gates held (see the report).

2 cases moved of 14 run; 12 cases byte-identical in verdict (pipe01, pipe03, pumpSystem01, variants01 (steady and
props), table05, heatExchanger04, heatExchanger05, column17, bellDelaware01, bellDelaware02, reboiler_water_copper,
condenser01).

## pipe02_airwater_twophase  (tutorials/steady/hydraulics/pipe02_airwater_twophase)
2 rows beyond tolerance, 1 new row; the rest of the file moved inside 1e-4.

Reason: the case typed `viscosity 8.9e-4 Pa.s;` (water at 25 C, a hand value) in the pipe's `operation`.  The comment
said the Vogel model had no N2 entry, but the pipe already drops the supercritical N2 from the liquid composition it
asks the door about, so the door answers with water alone.  The line is removed; the liquid viscosity is the property
dictionary's Vogel/Grunberg-Nissan water at 298.15 K, 8.8987e-4 Pa.s against the typed 8.9e-4 (-0.015 %).

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.P1.Re_Ls` | 28630.0809685 | 28634.2953177 | 1.5e-4 (Re = rho v D / mu, mu 0.015 % lower) |
| `source.P1.liquidViscosity` | `declared.case` | `Vogel/GrunbergNissan` | the source word: no longer a case declaration |
| `boundary.global.noBoundary` | (absent) | `false` | a key the golden did not carry, appended by --record |

Rows that moved inside tolerance and were refreshed with them (all follow Re_Ls through the friction factor and the
Lockhart-Martinelli parameter, at most 2.4e-5): `X_martinelli` 2.04761715 -> 2.04756729, `phi_L2`, `dP_friction`,
`deltaP`, `holdup_liquid`, `voidFraction`.  The vapour-side rows (`rho_G`, `vaporFraction`, `quality_mass`, `jG`,
`Re_Gs`, `H_feeds_kW`, residual) also differ from the old file by 5e-6 to 2e-5: the viscosity edit does not reach the
flash, so this is drift the old golden already absorbed inside its 1e-4 tolerance (the scoped run did not report it),
not a move of this slice; it is refreshed because `--record` rewrites the whole file.  Energy residual -0.0237 kW both.

## swro01_campoDalias  (tutorials/plant/swro01_campoDalias)
The three `pipeHeader` units (RO1, RO2a, RO2b), each with feed / brine / permeate headers and 6 trains: the same
five keys per header, 270 rows in all, plus 9 new `source` rows.

Reason: each header typed `viscosity { value 1.0e-3 Pa.s; source "ASSUMED seawater near 20 C, the same value the
case's modules use; ..." }`.  That sentence stopped being true in C402: the modules take the case's measured record
`seawater35_NaClboron_liquidViscosity` (0.966 mPa s, seawater S = 35 at 25 C, an assumed value with its basis in the
file), so the headers priced the Reynolds number on a number no other unit of the plant used.  The typed block is
removed; the header asks the door at its stream's own T, P and composition, which returns the same measured record,
0.000966 Pa.s.  Density, bore, velocity, header area, cost and every other row are untouched.

| row (every header, every train) | golden | now | relative move |
|---|---|---|---|
| `values.viscosity` | 0.001 | 0.000966 | -3.4 % (the typed 1.0 mPa s -> the record's 0.966) |
| `values.reynolds` | e.g. RO1 feed 1010351.96 | 1045912.998 | +3.5 % (Re ~ 1/mu) |
| `values.frictionFactor` | e.g. RO1 feed 0.0131078 | 0.0130653 | -0.3 % (Churchill at the higher Re, eps/D fixed) |
| `values.pressureDropPerMetre` | e.g. RO1 feed 31.0687 | 30.9679 | -0.3 % (dP/L ~ f) |
| `basis` (text) | "viscosity 0.001 Pa.s (declared by the case: ASSUMED seawater near 20 C ...; the package declares no liquid-viscosity model)" | "viscosity 0.000966 Pa.s (the case's liquid-viscosity model)" | wording follows the source; Re in the text follows the number |
| `source` (9 new rows, one per header) | (absent) | `stated.seawater35_NaClboron_liquidViscosity` | the door now names the record each header used |

The friction factor and dP/L moves are small because the flow is rough-turbulent (eps/D 7.5e-5, Re 7e5 to 1e6), the
statement the old `reason` made.

## What was NOT moved and why
- `Rohsenow.H` `verify()`: its saturated-water numbers are Incropera & DeWitt's table A.6 inputs of a published
  worked example; the check reproduces a textbook figure, and the package's water would test the package instead.
  Declared exception in `check_liquid_property_ratchet.py` (FALSE_POSITIVES), with the reason.
- `BellDelaware.cpp` `readFluid`: read only by the props bench `BellDelawareBench`, whose two cases reproduce Hewitt,
  Shires & Bott Example 6.2 and Serth Example 6.1 from the BOOK's own fluid properties (the case header says so).  The
  unit (`HeatExchanger.cpp`) reads `readSpec` only and takes its fluid from the streams through the door.  Declared
  exception (KEYREAD_EXEMPT in the checker).
