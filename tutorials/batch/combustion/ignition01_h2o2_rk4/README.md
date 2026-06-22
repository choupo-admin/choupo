# ignition01_h2o2_rk4 — the explicit solver that blows up (on purpose)

This is the **failure half** of the stiffness lesson. It runs the exact same
adiabatic constant-volume H₂/O₂ ignition as the sibling case
[`ignition01_h2o2`](../ignition01_h2o2/README.md), but with the **explicit RK4**
integrator instead of the stiff Rosenbrock23 — at the same fixed step
(`deltaT = 1e-5 s`).

Run it by hand:

```
runCase tutorials/batch/combustion/ignition01_h2o2_rk4
```

## What you see

`trajectory.csv` is a column of `nan` from the very first output step
(t = 1e-4 s) onward — there is **no** clean induction-then-jump, just immediate
divergence:

```
t,...,bomb.T
0.0,...,1.10000000e+03
1.0e-4,...,-nan
2.0e-4,...,-nan
...
```

That immediate blow-up **is** the result. The radical lifetimes (~10⁻⁸–10⁻⁷ s)
are six orders of magnitude shorter than the induction timescale (~10⁻³ s) — the
chemistry is **stiff**. An explicit method like RK4 is stability-limited to a
step of order the *fastest* scale, so the ~10⁻⁵ s step this case uses is far too
large: the integration is murdered by stability long before accuracy matters.

Compare side-by-side with the stiff sibling: switch to (or open)
`ignition01_h2o2`, whose L-stable adaptive sub-stepping integrates the *same*
chemistry to a clean burned state (~2440 K). *See, then decide*, applied to
numerics.

## Regression note

This case ships a `.expect-nonconvergence` marker, so `bin/runTests` **skips**
it — its whole point is to fail, and it would otherwise trip the NaN guard.

## Provenance

Same as the sibling: the **thermodynamics is real curated Choupo data**, but the
**reaction rates are synthetic** (hand-chosen Arrhenius constants reproducing the
chain-branching structure, not a published mechanism). Do not quote any number
from this case as quantitative.
