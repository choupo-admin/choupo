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
  1000 K (`kijTables/`), eight of the ten pairs extrapolated far above their
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

COMPARISON_TABLE_PLACEHOLDER

## Findings on Choupo's side

CHOUPO_FINDINGS_PLACEHOLDER
