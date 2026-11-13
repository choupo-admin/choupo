# batch30_fast_equilibrium_full — a fast equilibrium feeding a slow step

An isothermal batch reactor with A <-> B (kf = 0.1, kr = 0.025 1/s, K = 4)
and B -> C (k = 0.001 1/s), every rate integrated by the adaptive
Rosenbrock23 integrator.  10 mol of A, 6000 s.

## What to look at

1. **The first moment.**  A and B reach equilibrium with each other within
   tens of seconds; after that n_B / n_A stays at 4 while both drain to C.
2. **The reduced twin.**  `batch31_fast_equilibrium_reduced` runs one pool
   decaying at k K/(1+K).  The largest gap in n_C between the two is 0.62 %
   of the charge, and it shrinks as kf/k grows.
3. **The step history.**  At verbosity 3 the log prints every step the
   integrator accepts; count them against the reduced twin's.
