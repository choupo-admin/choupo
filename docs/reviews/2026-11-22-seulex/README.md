# seulex on nox03 (C473 part b) -- measurements

Scripts (run from the repo root after `make all`; the Cantera reference is the rtol 1e-12 CVODES solution of
`/tmp/mb89/mbA.yaml`, built by `docs/reviews/2026-11-22-miller-bowman/cantera_mech.py`):

* `sweep.py` -- integrators x tolerances, wall best of 3, deviation on the output grid, work counters
  (`CHOUPO_ODE_STATS=1`); output kept in `sweep_nox03.txt` (deltaTmax shipped = 1e-3 and 1e-4).
* `endpt.py` -- accuracy at STEP ENDS (endTime = writeInterval = E, so the single written state is a step end,
  no dense output): `endpt.py Rodas4,seulex 1e-6,1e-8,1e-10`.
* `cstats.py` -- Cantera `solver_stats` at three tolerances; `crhs2.py` -- Cantera's kinetics core per call.
* `devcmp.py` -- deviation of existing trajectories.

Findings, in order of importance:

1. Step-end accuracy (largest species deviation above x = 1e-6, at t = 1 / 2 / 3 ms):
   Rodas4 7e-5 / 7e-5 / 3e-5 (rtol 1e-6), 3e-5 / 2e-5 / 8e-6 (1e-8), 5e-7 / 4e-7 / 1e-7 (1e-10);
   seulex 2e-3 / 2e-3 / 6e-4, 4e-5 / 4e-5 / 1e-5, 5e-7 / 4e-7 / 2e-7.  Equal at 1e-10, 1.5x worse at 1e-8,
   25x worse at 1e-6.
2. Wall time (whole process, ~0.09 s of it is start-up): rtol 1e-10: Rodas4 1.61 s, seulex 0.31 s (5x);
   1e-8: 0.40 vs 0.23 (1.7x); 1e-6: 0.15 vs 0.15.  Cantera: 0.118 / 0.043 / 0.029 s.
3. On the OUTPUT GRID seulex has a floor of 2e-5..2e-4 (and 2e-1 at rtol 1e-8) at t = 1, 2 ms that no
   tolerance removes: the driver interpolates with a cubic Hermite polynomial over steps up to 1e-3 s, and
   (lambda h)^4 / 384 with lambda ~ 1e4 /s and h ~ 5e-5 s is 1.6e-4.  deltaTmax 1e-5 brings it to 1.8e-7 at 1.6 s.
4. Counts at rtol 1e-8 (atol 1e-15): Cantera 2137 steps, 38 J, 239 factorisations, 3005 rhs + 2052 in FD
   Jacobians; Rodas4 728 steps, 732 J, 732 factorisations, ~5050 rhs; seulex 100 steps, 70 J, 617 factorisations,
   2860 rhs.
5. Cost per call: Choupo rhs 30 us (38 us in the seulex run), sparse analytic J 87 us (114 us), Cantera rhs ~8 us
   (kinetics core 6.5 us with the state set).  Rodas4 integrate = 277 ms: rhs 154 (56 %), J 63 (23 %), factor +
   solves + overhead 60 (22 %).  seulex integrate = 167 ms: rhs 105 (63 %), J 8 (5 %), rest 54 (32 %).
6. A wrong Jacobian (80 %) costs steps, not the answer (Robertson: 8724 steps vs 117, same y1 to 5e-9); at 50 %
   the damping is lost and the run refuses at hMin.  Never refreshing the Jacobian on nox03: 1.3 million steps,
   414 s.

## Fix round (the controller brought to Hairer's seulex.f)

An Opus review found the first version's constants were ODEX's and a few were ours.  Now: work model
A1 = 5 + 2 n1 + 1, Ak = Ak-1 + 2 (nk - 1) + 1; theta = Euclidean norm ratio with the max(1,.) clamp, THET = min(1e-4, rtol);
window thresholds 4 n(K+1) n(K) at column K-1 and 2 n(K+1) at K, K-1 test skipped for K = 2 and after a rejection;
divergence test (err >= max(4 err_old, 1), j > 2); a rejection sets theta = 2 THET (J rebuilt unless built this step);
first and last step compute all columns, a step ending within 1 % of t1 is stretched to it; error scale from |y0| at
the step start; initial order min(KM-2, ..) with log10(rtol + atol); sequence NSEQU = 1 (1,2,3,4,6,...) kept after
measuring NSEQU = 2 (2,3,4,6,...): CPU 0.184/0.198 s (nox03 1e-8), 0.259/0.261 (1e-10), 0.765/0.774 (nox02 1e-6),
1.031/1.005 (1e-8), a tie.  The env var CHOUPO_SEULEX_THETA is gone.
CPU seconds (the machine was shared; `selfsweep.py`):

| nox03 | rtol | CPU | end 2 ms | grid | acc / J / fact |
|---|---|---|---|---|---|
| Rodas4 | 1e-6 | 0.155 | 6.5e-5 | 1.2e-4 | 201 / 252 / 252 |
| seulex | 1e-6 | 0.148 | 1.9e-2 | 2.1e-2 | 88 / 79 / 475 |
| Rodas4 | 1e-8 | 0.278 | 2.4e-5 | 2.6e-5 | 728 / 732 / 732 |
| seulex | 1e-8 | 0.203 | 4.3e-5 | 1.5e-4 | 95 / 92 / 635 |
| Rodas4 | 1e-10 | 1.196 | 4.1e-7 | 4.2e-7 | 3568 / 3569 / 3569 |
| seulex | 1e-10 | 0.268 | 3.9e-7 | 1.6e-1 | 113 / 111 / 872 |

nox02 (17 vessels; grid deviation from a Rodas4 1e-11 run): Rodas4 1.300 s / 4.325 s (2.5e-6 / 2.5e-8) at 1e-6 / 1e-8;
seulex 0.778 s / 1.108 s (1.2e-3 / 1.3e-4).  ignition01_h2o2: Rodas4 0.105, seulex 0.106, Rosenbrock23 0.117 s CPU.
Sabotages of the gate (each fails it): order pinned at 2, order pinned at 7, theta ignored with J rebuilt every step,
h^2 extrapolation.
