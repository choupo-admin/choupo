# unsteady07_fast_tank_full — a big tank and a small one, both integrated

Two mixing tanks in series under `choupoSemiContinuous`: SLOW holds 1 kmol
(time constant 1000 s at the 1e-3 kmol/s feed) and FAST holds 0.05 kmol
(50 s).  Both start full of compA; from t = 0 the feed is pure compB.  Both
tanks are `dynamicCSTR` vessels, integrated in time.  5000 s, 0.25 s steps.

## What to look at

1. **The lag.**  FAST's outlet follows SLOW's outlet about 50 s late.  In
   `trajectory.csv` the tracer fraction leaving FAST is
   `FAST.n_compB / (FAST.n_compA + FAST.n_compB)`.
2. **The reduced twin.**  `unsteady08_fast_tank_reduced` replaces FAST by
   its quasi-steady relation (outlet = inlet).  The largest gap between the
   two outlets is 0.0428 at the ratio of time scales 0.05, and the closed
   form for two linear tanks gives the same, eps^(1/(1-eps)).
3. **The step.**  SLOW hands its outlet to FAST once per driver step, so the
   step must be short against FAST's time constant (the `[routing]` line
   says so).

The EduTool page "When the fast obeys the slow" runs this case and its twin
with FAST's holdup changed.
