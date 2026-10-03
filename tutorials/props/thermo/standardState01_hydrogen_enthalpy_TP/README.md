# standardState01_hydrogen_enthalpy_TP — how much does the enthalpy really change?

```
runCase tutorials/props/thermo/standardState01_hydrogen_enthalpy_TP
```

Witness of the `standard-state` EduTool (*Enthalpy, the standard state and
equilibrium: what does the ° mean?*).  Forty-two `propertyPoint` operations
on hydrogen, one per node of the page's grid — 300 to 1000 K by 100 K, at
1, 100, 300, 600 and 1000 bar — plus the green-ammonia converter's state
(733.15 K, 150 bar) and its 1 bar twin.  Each publishes the three numbers the
page separates: `H_ig`, the ideal-gas enthalpy (a function of temperature
alone, on the elements datum — hydrogen is an element, so it is zero at
298.15 K); `H_R`, the SRK residual at the real temperature and pressure; and
their sum `H_real`.

---

## The question

A table gives a standard enthalpy with a degree sign.  Does the sign mean
1 bar?  Does it also mean 25 °C?  If the process runs at 150 bar, is using a
standard property not assuming the gas is ideal?  The page answers in the
order a student can follow — behaviour first, then the reference, only then
the symbol — and this case supplies the behaviour.

## What to read (the numbers are the golden's, 2026-10-03)

* Along 1 bar, heating from 300 to 1000 K raises the enthalpy by
  **20.64 kJ/mol**.  At 300 K, compressing from 1 to 1000 bar at constant
  temperature raises it by **1.29 kJ/mol**; at 1000 K by 1.69.  The pressure
  effect is an order of magnitude smaller than the temperature effect in
  this range, and it is not zero.
* At the converter's state the ideal-gas rise from 298.15 K is 12.73 kJ/mol
  and the residual adds 0.23 kJ/mol — 1.8 % of the rise.  At 1 bar and the
  same temperature the residual is 1.5 J/mol: the real gas at the standard
  pressure is a hair from the ideal gas, and still not the same definition.

## The reference beside the engine

`constant/experimental/hydrogen_Hmolar_leachman2009_coolprop.csv` carries the
same 42 states from a fundamental equation of state fitted to measurements —
Leachman, Jacobsen, Penoncello & Lemmon, *J. Phys. Chem. Ref. Data* 38 (2009)
721–748, as implemented in CoolProp 8.0.0 (Bell et al., *Ind. Eng. Chem. Res.*
53 (2014) 2498; MIT licence).  It is RE-COMPUTED here by
`bin/curate/reference_h2_enthalpy.py` (`--check` re-derives every row), not
pasted from anywhere, and it sits in `constant/experimental/` because that is
the one location the GUI bundle and `.gitignore` admit for a CSV that is a
case input; its header says it is a model's output, not a measurement.

The two agree on the ideal-gas part to a few joules per mole over the whole
range.  They do not agree on the residual: SRK is 6 % below the reference at
300 K and 1000 bar, a third below at 300 K and 100 bar, 11 % below at the
converter.  **Measured before the model was chosen:** Peng-Robinson is
worse here — a third below at 1000 bar and the wrong sign at 100 bar — so the
case runs SRK and the page draws both sets and states the gap.  Nothing was
tuned; hydrogen's anomalous acentric factor (−0.220) is what a cubic
equation handles poorly, and the page says so rather than hiding it.

## Why propertyPoint and not propertyScan2D

A `propertyScan2D` would do this in one operation and write a CSV — which the
browser cannot read back.  The GUI reads each operation's `diagnostics`, so
the grid is 42 point evaluations whose names (`h_T<K>_P<bar>`) are the keys
the page looks up.  The golden pins every one of them.
