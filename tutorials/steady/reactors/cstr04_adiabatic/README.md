# cstr04_adiabatic — take the jacket away and let T answer

The `cstr01` reactor with **no heat removal**.  The exothermic
esterification heats its own contents until the energy balance closes:
the golden lands at **T_out = 454.15 K**, a **104.2 K** rise from the
350 K feed, with the extent **ξ = 0.1384 mol/s** — essentially complete
conversion (ξ_max is 0.1389 mol/s) because the rate constant at 454 K is
**0.889 s⁻¹**, 250 times its value at 350 K.

## The lesson

1. **Two unknowns now, solved together.**  The extent from the design
   equation and T from `H_out(T, ξ) = H_in`: the dict says so in its own
   header, and `Q_kW` in the golden is **4.7e-12** — zero by
   construction, not by declaration.
2. **An adiabatic CSTR can have more than one answer.**  Before solving,
   the engine *scans* the energy balance across T (the **Log** line
   `[cstr] scanning the energy balance on T in [325.0, 479.5] K for
   steady states`) and reports how many it found — **1** here.  The scan
   is the van Heerden diagram; `cstr05_multiplicity` is the case with
   three.
3. **`T_guess` is a declared aid, and the log says where it landed
   from.**  `operation { T_guess 350; }` picks the branch the Newton
   starts on; the result line prints `landed from T_guess = 350.00 K`.
   With one steady state it cannot matter; with three it decides the
   answer, which is why it is in the dict and not hidden.
4. **Read the two caveats the run prints.**  Acetic acid's Cp polynomial
   is declared to 390 K and this reactor asks it at 450 K: the enthalpy
   path is *extrapolated*, announced, and still returned.  The 454 K
   answer stands with that stated — as with `adiabaticFlash01`, a warned
   number is a defensible one.
5. **"Newton 882 it" is the scan's total, not the answer's.**  The log
   now says so on the line.  Every trial temperature of the scan
   re-enters the extent Newton; the final solve took a handful.

## What to try

Set `T_guess 460;` — same single answer, from the other side.  Then run
`cstr06_jacketed`, where a coolant stream carries the heat away and the
outlet T sits between the two extremes you have now seen.
