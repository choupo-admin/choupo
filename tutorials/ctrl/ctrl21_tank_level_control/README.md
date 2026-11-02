# ctrl21_tank_level_control — the most common loop of a plant: inventory

A water tank (`dynamicTank`, D = 2 m, 3.14 m²) whose outflow is a
**manipulated flow** (`mode flow`, `mv F_out`, a flow-controlled pump).
Because nothing in the outflow depends on the level, the level
**integrates** the difference of the flows and never comes back by
itself.  A **PI level controller** on `F_out` closes the loop.  The
inflow steps from 0.20 to 0.30 kmol/s at t = 600 s; 3000 s run, 2 s steps.

Run it: `runCase tutorials/ctrl/ctrl21_tank_level_control` (it runs under
`choupoCtrl`).  Its sibling `unsteady05_tank_valve_drain` drains the same
tank through a valve instead and needs no controller.

## What to look at

1. **The PI holds the level.**  Plot `level` in `trajectory.csv`: it stays
   at the 2.0 m setpoint, rises by at most 0.031 m after the inflow step
   and returns with zero offset (< 1e-7 m at the end).  The integral term
   is what removes the offset.
2. **P-only settles off the setpoint.**  Set `Ki 0.0;` in the controller's
   `gains {}` and run again: the level ends at 2.05 m.  A proportional
   controller needs an error to hold a different outflow, and the offset is
   (F_in,new − bias)/|Kp| = (0.30 − 0.20)/2 = 0.050 m.
3. **The gains are negative.**  The controller is direct-acting on
   `error = setpoint − level`; a level ABOVE the setpoint must RAISE the
   outflow, so the loop is reverse-acting and Kp, Ki are negative.  With a
   positive sign the level runs away until the tank overflows, and the
   engine refuses that by name (`OVERFLOWED`).
4. **The ledger claims mass and energy and closes** (~1e-14): the tank stores
   its enthalpy on the elements datum, T is a readout.  `[balance]` lines
   print the check.

The closed loop is second order (ωn ≈ 7.6e-3 1/s, ζ ≈ 0.76).  The tank's
buffering is what a loose level loop trades against the smoothness of the
downstream flow.  `check_dynamic_tank` re-runs both the PI and the P-only
variants and holds these numbers.
