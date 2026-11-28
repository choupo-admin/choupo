# pfr06_refusal_unreachable_enthalpy -- a PFR whose enthalpy inversion is refused

A refusal witness (C532 c).  The adiabatic bed of pfr04, fed at 450 K and 15 bar, marches to a
state whose enthalpy the package cannot invert.  The shared home (`flashState::specifiedFlash`,
PH) refuses; the PFR catches it and prints

    Converged:     NO
    The outlet-temperature inversion (flashState::specifiedFlash, PH) was refused: ...

then the flowsheet stops by name (`unit 'reactor' failed to converge`).  Before, the exception left
the unit and could end a recycle.

## What to try

Set the feed back to 350 K (pfr04) and the bed runs: T is a result, 6.6 K of warming.
