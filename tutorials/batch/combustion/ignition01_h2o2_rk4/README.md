# ignition01_h2o2_rk4 — the explicit solver that blows up (on purpose)

This is the **failure half** of the stiffness lesson. It runs the exact same
adiabatic constant-volume H₂/O₂ ignition as the sibling case
[`ignition01_h2o2`](../ignition01_h2o2/README.md), but with the **explicit RK4**
integrator instead of the stiff Rosenbrock23 — at the same fixed step
(`deltaT = 1e-6 s`).

Run it by hand:

```
runCase tutorials/batch/combustion/ignition01_h2o2_rk4
```

## What you see

The first step is still plausible (T 1100 → 1110 K); the second already throws
the state out of the physical region (T near 8000 K, H₂ at zero), and the
third is `nan`.  The engine refuses rather than exit 0:

```
ERROR: BatchReactor 'bomb': accepted state has unphysical T = nan K after a RK4
step -- the integration blew up.  Use a smaller deltaT or a stiff integrator
(integrator Rosenbrock23;).
```

That blow-up **is** the result.  The stiff sibling prints a stiffness ratio of
order 10⁷ for this chemistry: an explicit method is stability-limited to a step
of order the *fastest* scale, so a step chosen for the *induction* is murdered
by stability long before accuracy matters.

Compare side-by-side with `ignition01_h2o2`, whose L-stable adaptive
sub-stepping integrates the *same* chemistry to a clean burned state
(~3078 K), and with `ignition01_h2o2_eulersi`, which is A-stable but first
order and fails honestly by name.  *See, then decide*, applied to numerics.

## Regression note

This case ships a `.expect-nonconvergence` marker, so `bin/runTests` counts it
as an EXPECTED-FAIL — its whole point is to fail.

## Provenance

Same as the sibling: the Ó Conaire et al. (2004) H₂/O₂ mechanism
(`constant/reactions`, shared with `ignition02_h2air_slack`) and NASA-9 heat
capacities from NASA/TP-2002-211556 for H₂, O₂, N₂ and water.  Until
2026-10-25 it ran a GRI-Mech 3.0 subset, replaced because GRI-Mech grants no
redistribution (DEV.md §4c C164); the failure it teaches did not change.
