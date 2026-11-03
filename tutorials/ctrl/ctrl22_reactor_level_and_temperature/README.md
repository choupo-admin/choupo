# ctrl22_reactor_level_and_temperature — two loops, one unit

A jacketed reactor with a **level** (`dynamicCSTR` with `volumeMode
variable`, D = 0.5 m, H = 1.0 m): isobutanol → 2-butanol, first order,
exothermic, fed at 300 K and run at 340 K.  Two PI controllers act on
DIFFERENT manipulated variables of the SAME vessel:

* `LC1` — level on the outflow `F_out`, reverse acting (Kp = −0.034,
  Ki = −2.1e-4);
* `TC1` — temperature on the jacket `T_jacket` (Kp = 5, Ki = 0.02).

The inflow steps from 1.0e-3 to 1.5e-3 kmol/s at t = 1200 s; 3600 s run,
2 s steps.  Run it: `runCase tutorials/ctrl/ctrl22_reactor_level_and_temperature`
(it runs under `choupoCtrl`).  Its sibling `unsteady06_reactor_fill_and_react`
fills the same reactor from a heel with no controller.

## What to look at

1. **The level loop rejects the inflow step.**  Plot `reactor.level`: the
   peak excursion is 0.010 m (the P-only bound would be dF/|Kp| = 0.015 m)
   and the level is back on 0.50 m at the end (< 2e-6 m).
2. **The temperature loop holds 340 K** against a colder, larger feed:
   T dips about 2 K after the step and returns; the jacket temperature
   (`TC1.MV`) rises from about 367 K to about 387 K.
3. **The loops are coupled through the vessel.**  The declared UA = 300 W/K
   is the value with the vessel FULL; the engine scales it with the wetted
   wall, UA(h) = UA·A_w(h)/A_w(H), A_w = πDh + πD²/4 (166.7 W/K at the
   starting 0.5 m, announced).  The reaction heat r·V follows the volume too.
4. **The ledger claims mass and energy and closes** (~1e-10 or better): both
   species carry a formation datum, so the vessel takes the canonical energy
   route, which the run announces.

`check_dynamic_cstr_level` re-runs this case and holds these numbers.
