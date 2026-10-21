# Benchmark E -- methane steam reforming in an isothermal PFR

**Sample:** "Hydrogen production through Methane Catalytic Steam Reforming"
(`PlatformFiles/Common/samples/Hydrogen production through Methane Catalytic
Steam Reforming.dwxml`, a plain XML document) of the reference simulator,
DWSIM, read at commit `1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` (GPL-3.0);
the file says `BuildVersion 5.3.6858.20432`, `SavedOn 2018-10-11`.  Its
stored state is in `reference`; no file of theirs is copied and no
parameter of their property package is read.

**What it is:** one plug-flow reactor, 1 m3, isothermal, fed 5.583 mol/s of
methane : steam : hydrogen = 1 : 1 : 0.01 at 1000 K and 1 atm, on the three
reactions of Xu & Froment (1989) -- steam reforming to CO, the water-gas
shift, and the overall reforming to CO2 -- with a "catalyst loading" of
0.386 kg/m3.

## How this case is built

* **Kinetics:** Xu & Froment, AIChE J. 35 (1989) 88, written in
  `constant/reactions` as three `type expression` laws sharing the
  article's ONE adsorption denominator, every parameter cited (A from
  Table 6 at the reference activity, E and dH from Table 5; pressures in
  bar, rates in kmol/(kg h) -- the time base the article prints, which the
  engine converts); the fitted window (773-848 K, 3-15 bar) declared and
  announced: this bed, at 1000 K, is an extrapolation in T.  The article
  prints NO equilibrium constants (only their units); K1, K2, K3 come from
  Choupo's own formation data on the 1 bar ideal-gas standard state
  (`system/propsDict`, `reactionGibbs`, tabulated 950-1050 K and pasted
  into the reactions file; `compare.py` re-runs the op and refuses a moved
  table).
* **Thermodynamics:** phi-phi PR78 with every pair from E-PPR78 (Xu et al.
  2017, `constant/parameters/PPR78/xu2017.dat`) evaluated ONCE at the bed's
  1000 K (`kijTables/`), ALL ten pairs extrapolated above their
  fitted data and marked so.  At 1 atm a kij barely moves a vapour
  fugacity; the comparison shows what it is worth.
* **The sample's "catalyst loading" 0.386 kg/m3** is used as it is: the
  mass of catalyst per cubic metre of reactor on which the per-kg rates are
  scaled.  A packed bed of nickel catalyst weighs ~1000 kg/m3; 0.386 kg/m3
  is not a packed bed, and the outlet composition follows from it (a
  finding, below).
* **Not reproduced:** the sample's Ergun pressure drop (584 Pa over
  101325, 0.58 %; it needs a particle and a transport model, and moves the
  outlet by less than the comparison resolves).  The fresh-catalyst factor
  2.246 (p. 94) is NOT applied -- the sample does not apply it either.

## Findings on the reference side (stated neutrally, from `reference`)

* **Its rates read partial pressures in atm** (`concUnit atm`) where the
  article's are in bar.
* **The shared denominator is truncated in two of the three rates.**  Its
  water-gas-shift denominator carries no K_CH4 p_CH4 term and its overall-
  reforming denominator no K_CO p_CO term: an expression there can only
  name the reaction's own compounds, and CH4 is not in the shift nor CO in
  reaction III.  The article's DEN is one expression for all three.
* **Its equilibrium constants are its own correlations**, not the
  article's (which prints none): K1 = exp(30.42 - 27106/T), K2 =
  exp(-3.798 + 4160/T), K3 = exp(34.218 - 31266/T), in atm^2 / - / atm^2.
  `compare.py` prints them beside Choupo's formation-data values at 1000 K.
* **Its K3 is not K1 x K2.**  Reaction III is I + II, so K3 = K1 K2 by
  thermodynamics; its correlations give, at 1000 K on the bar basis,
  K1 = 28.23, K2 = 1.436 and K3 = 19.65 against K1 K2 = 40.54 (Choupo's
  formation data: 26.52, 1.424, 37.75 = K1 K2).  `compare.py` prints them.
* **Its stored duty is 2.6 times the heat of reaction of its own stored
  conversion:** 1221.81 kW, where its outlet (2.0922 mol/s of CH4
  converted, 0.2276 mol/s of CO2 made) gives 463.3 kW at 1000 K on
  Choupo's formation data and 421.2 kW on its own 298 K `reactionHeat`
  values.
* **Its pre-exponentials are rounded**: 4.22e15, 1.96e6 and 1.02e15 where
  Table 6 prints 4.225e15, 1.955e6 and 1.020e15.
* **Its stored `CompoundConversions`** are 0.753 (CH4), -234 (H2), 0.835
  (water), -2.28e9 (CO2) and -1.86e10 (CO): conversions of species absent
  from the feed, divided by their zero inlet.
* **Its `OutletTemperature` field reads 298.15 K** while the reactor is
  isothermal at its 1000 K inlet and its outlet stream is stored at 1000 K
  (the field is the mode's unused default).

## Comparison

Run `python3 -I benchmarks/dwsim/compare.py reforming01_methane_steam_pfr`
(needs `make all`).

Measured 2026-10-21 on this branch:

```
Benchmark E -- methane steam reforming PFR, 1000 K, 1 atm (Xu & Froment 1989; PR78 + E-PPR78)
---------------------------------------------------------------------------------------------
                                                  reference        Choupo  Choupo - ref         rel %
product F [mol/s]                                    9.7677        9.7444       -0.0233       -0.2388
product T [K]                                     1000.0000     1000.0000             0             0
product P [Pa]                                   1.0074e+05    1.0132e+05      584.4354        0.5801
product x_CH4                                        0.0702        0.0716        0.0014        1.9449
product x_H2                                         0.6687        0.6684   -3.4463e-04       -0.0515
product x_water                                      0.0469        0.0466   -3.3625e-04       -0.7171
product x_CO2                                        0.0233        0.0250        0.0017        7.3014
product x_CO                                         0.1909        0.1885       -0.0024       -1.2498
CH4 conversion                                       0.7532        0.7490       -0.0042       -0.5576
reactor duty [kW] (isothermal, + endothermic)     1221.8095      460.1334     -761.6761      -62.3400
The sample's own equilibrium correlations and its atm pressures are findings (README).

  reference PFR: pressure drop 584.435409531521 Pa (not reproduced), stored residence time 2.18277079629982 s
  Choupo: first-law residual 0 kW (energy exchanged (the larger of: sum of |declared duties and work|, and |Q boundary|)); converged True
  Choupo T profile: 1000.00 K at the inlet, 1000.00 K at the outlet (isothermal by construction)
```

## Findings on Choupo's side

* **The outlet agrees to a few per cent and the conversion to half a per
  cent** (CH4 conversion 0.7490 against 0.7532; H2 0.6684 against 0.6687;
  CO 0.1885 against 0.1909; CO2 0.0250 against 0.0233, +7.3 %, the largest
  relative gap).  The gas residence time agrees to 1e-4 (2.1826 against
  2.1828 s), which checks the volume, the flow and the catalyst basis the
  two programs integrate over.
* **Both beds are RATE-limited, so the composition gap is kinetic and not
  thermodynamic.**  Steam reforming leaves both outlets about a third short
  of equilibrium (1 - Q/K1 = 0.35 here, 0.38 for the sample against its own
  K1), and the shift runs in REVERSE at both (1 - Q/K2 = -0.34, -0.21).  At
  such outlets every difference in the rate expressions shows: the
  sample's atm partial pressures against the article's bar, its two
  truncated denominators, its rounded pre-exponentials and its own K
  correlations (all findings on its side).  Which of them moves the
  outlet by how much is NOT measured here: an ablation would have to run
  the sample's numbers, which this benchmark does not read into a case.
* **The kij is worth nothing here, measured:** the same bed with every kij
  0 gives the same outlet to every printed digit and a duty 0.015 kW
  lower (460.119 against 460.133 kW).  The rate laws read IDEAL partial
  pressures, as the article writes them, and at 1 atm and 1000 K the PR78
  departure is tens of watts.
* **The duty: 460.13 kW here against the sample's stored 1221.81 kW.**
  Choupo's closes the bed's first law to 0.000 kW in its own report and is
  the heat of reaction of its conversion: 2.0806 mol/s of CH4 x
  dH_I(1000 K) 225.21 kJ/mol less 0.2436 mol/s of CO2 x 34.80 kJ/mol
  (460.08 kW; the 0.05 kW left is the PR78 departure).
  The same arithmetic on the SAMPLE's stored outlet gives 463.3 kW (its
  own `reactionHeat` values, at 298 K: 421 kW).  Its stored duty is 2.6
  times the heat of reaction of the conversion it stores; nothing in the
  stored state accounts for the rest (findings on the reference side).
* **Not reproduced, stated:** the Ergun pressure drop (the sample's
  outlet is at 100 740.6 Pa, Choupo's at the inlet's 101 325 Pa).  The T
  profile is flat at 1000.00 K on both sides (isothermal by construction).
