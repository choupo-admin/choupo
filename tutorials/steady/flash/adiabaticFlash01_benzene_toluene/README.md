# adiabaticFlash01_benzene_toluene — the temperature is the answer, not an input

A benzene/toluene liquid (40/60 mol, 100 kmol/h) at 380 K and 3 bar is let
down to 1 atm across a drum with **no heat added**.  Nothing tells the drum
what temperature to settle at.  The energy balance does: the outlet comes out
at **368.66 K**, an 11.34 K drop, with **5.19 %** of the feed flashed to
vapour (5.19 kmol/h vapour, 94.81 kmol/h liquid).  Every number here is the
case's own golden (`expected`), which `bin/runTests` re-checks.

## The lesson

1. **Q = 0 is a definition, not a setting.**  The dict declares only the
   outlet pressure (`system/flowsheetDict`, `operation { P 1.01325 bar; }`).
   There is no `T` to give; an adiabatic drum has none to receive.
2. **Two Newtons, one inside the other.**  The outer one walks T until the
   outlet enthalpy equals the inlet's; at every trial T the inner one solves
   the Rachford-Rice flash.  Watch it in the **Log** tab — each outer step
   prints its H-residual, and the last one prints `H_residual` at the
   round-off floor (−2.2e-3 W on a 100 kmol/h stream).
3. **Where the 11 K went.**  Vaporising 5 % of the feed costs latent heat,
   and the only place it can come from is the sensible heat of the liquid.
   Open **Streams**: the vapour is benzene-rich, the liquid barely moved in
   composition, and both leave at the same 368.66 K.
4. **Compare with `flash01_benzene_toluene`** — the same feed held at a
   *fixed* 370 K.  There the temperature is an input and the drum needs a
   duty to hold it.  The two cases are the same split asked two ways.

5. **Read the caveat the engine prints — it is about THIS case.**  The
   feed is at 380 K, and benzene's Antoine fit is declared for
   287.7–354.07 K.  The run says so on the console (`[psat] … OUTSIDE its
   declared Trange`) and again in the caveat block at the end: the
   vapour pressure was *extrapolated*, still returned, and the answer
   stands with that stated.  A number you were warned about is a number
   you can defend; one you were not is the dangerous kind.

## What to try

Edit `operation { P … }` to 0.5 bar in the **Case** tab and run again: a
deeper let-down flashes more, and the drum ends colder.  Then look at the
stream table printed *before* the solve — it shows the `0/` seed values,
which look like an answer and are not one; the converged table further
down is the answer.
