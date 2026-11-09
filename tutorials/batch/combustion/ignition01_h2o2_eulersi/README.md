# ignition01_h2o2_eulersi — the A-stable solver that fails honestly

The third integrator of the stiffness lesson.  The same adiabatic
constant-volume H₂/O₂ ignition as [`ignition01_h2o2`](../ignition01_h2o2/README.md)
(Rosenbrock23, converges) and
[`ignition01_h2o2_rk4`](../ignition01_h2o2_rk4/README.md) (explicit RK4, blows
up), here with **semi-implicit Euler** (`integrator EulerSI;`) at the same
`deltaT = 1e-6 s`.

Run it by hand:

```
runCase tutorials/batch/combustion/ignition01_h2o2_eulersi
```

## What you see

Semi-implicit Euler is A-stable, so it does not oscillate to infinity the way
RK4 does — the first steps are physical (T 1100 → 1102 → 1108 → 1139 K) — but
it is FIRST ORDER, and once the ignition transient starts one linearised step
is wrong enough to drive the state unphysical.  The integrator reports that it
gave up, and the reactor refuses by name instead of exiting 0:

```
ERROR: BatchReactor 'bomb': the 'EulerSI' integrator GAVE UP inside a
0.000001 s step (accepted 1 sub-step(s), stopping 0.000001 s into it: a
non-finite or negative state on a fixed semi-implicit Euler step).  Use a
smaller deltaT or a stiff integrator (integrator Rosenbrock23;).
```

`.expect-nonconvergence` records why that refusal exists (until 2026-08-22
this exact run reached a negative temperature and exited 0).  L-stable second
order converges, explicit fourth order blows up loudly, A-stable first order
fails honestly: *see, then decide*, applied to numerics.

## Provenance

Same as the sibling: the Ó Conaire et al. (2004) H₂/O₂ mechanism
(`constant/reactions`, shared with `ignition02_h2air_slack`) and NASA-9 heat
capacities from NASA/TP-2002-211556 for H₂, O₂, N₂ and water.  Until
2026-10-25 it ran a GRI-Mech 3.0 subset, replaced because GRI-Mech grants no
redistribution (DEV.md §4c C164); the failure it teaches did not change.
