# cstr04_adiabatic — take the jacket away and let T answer

The `cstr01` reactor with **no heat removal**.  The esterification is
only **mildly exothermic in the liquid** (dH_rxn about -2.7 kJ/mol at
298 K, after the acetic-acid correction recorded in
`docs/design/acetic-acid-latent-heat-closure.md`), so the contents heat
only a little: the golden lands at **T_out = 355.34 K**, a **5.34 K**
rise from the 350 K feed, with the extent **ξ = 0.0853 mol/s** (ξ_max is
0.1389 mol/s, so conversion is about 61 %) at a rate constant of
**5.1e-3 s⁻¹**.

Earlier versions of this case printed a 104 K rise and complete
conversion; they were written around a liquid heat of reaction about ten
times too large.  **The original teaching point (an adiabatic reactor
heating itself by ~100 K) needs a genuinely exothermic reaction; a
replacement case is planned.**  Nothing in this case was tuned to recover
it.

The feed is still declared at 15 bar, a leftover from the old design,
where a 454 K product had to be held liquid.  At the corrected 355 K the
outlet is liquid even at 1 atm.

## The lesson

1. **Two unknowns now, solved together.**  The extent from the design
   equation and T from `H_out(T, ξ) = H_in`: the dict says so in its own
   header, and `Q_kW` in the golden is **~1e-11** — zero by
   construction, not by declaration.
2. **An adiabatic CSTR can have more than one answer — here it has one.**
   Before solving, the engine *scans* the energy balance across T (the
   **Log** line `[cstr] scanning the energy balance on T in [325.0,
   383.5] K for steady states`) and reports how many it found — **1**.
   The scan is the van Heerden diagram; with a nearly thermoneutral
   reaction the generation curve is too small to cut the removal line
   more than once.
3. **`T_guess` is a declared aid, and the log says where it landed
   from.**  `operation { T_guess 350; }` picks the branch the Newton
   starts on; the result line prints `landed from T_guess = 350.00 K`.
   With one steady state it cannot matter; with several it would decide
   the answer, which is why it is in the dict and not hidden.
4. **Read the caveats the run prints.**  Acetic acid's Cp polynomial is
   declared to 390 K and the ethanol vapour-pressure fit to 369 K; the
   scan's upper end asks for slightly more, so the path is *extrapolated*,
   announced, and still returned — a warned number is a defensible one.
5. **"Newton 742 it" is the scan's total, not the answer's.**  The log
   says so on the line.  Every trial temperature of the scan re-enters
   the extent Newton; the final solve took a handful.

## What to try

Set `T_guess 360;` — same single answer.  Then run `cstr06_jacketed`,
where a coolant stream carries heat away and the outlet T sits below the
feed.
