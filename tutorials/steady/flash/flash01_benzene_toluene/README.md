# flash01_benzene_toluene — the canonical first run

The same 40/60 benzene/toluene feed (100 kmol/h) as `adiabaticFlash01`,
this time **held at 370 K** and 1 bar.  Raoult's law, ideal vapour, the
Rachford-Rice equation solved by Newton in one unknown.  The golden:
**V/F = 0.3040** (30.40 kmol/h vapour, 69.60 kmol/h liquid),
**K_benzene = 1.651**, **K_toluene = 0.674**.

## The lesson

1. **`type` → `model` → `operation`.**  The unit is an `isothermalFlash`,
   the machine is named (`model rachfordRice;`), and the numbers live in
   `operation { T 370.0 K;  P 1.0 bar; }`.  That order is the grammar of
   every unit in Choupo.
2. **K is a ratio of pressures here.**  With Raoult's law
   `K_i = Psat_i(T) / P`.  The **Props** tab lets you read both vapour
   pressures at 370 K and check the two K's by hand — a two-line
   calculation a student should do once.
3. **Rachford-Rice has one root in (0, 1) when the feed is between its
   bubble and dew points.**  The **Log** tab prints each Newton iterate of
   V/F; count them.
4. **This drum adds no heat — and that is worth understanding.**  The
   golden reports `Q_kW = 0`.  The feed is declared at 370 K and 1 bar,
   the drum holds 370 K and 1 bar, and enthalpy is a state function of
   (T, P, z): the feed stream *already is* the two-phase mixture the drum
   separates.  Move `T` away from the feed's 370 K and a duty appears —
   that is the isothermal flash earning its name.  (This README first said
   "holding T costs a duty"; the case's own golden said otherwise.)

## What to try

Move `T` between the feed's bubble point and dew point and watch V/F sweep
from 0 to 1; `flash06_sweep_T` does exactly that automatically with an
`outerDict`, which is the next case to open.
