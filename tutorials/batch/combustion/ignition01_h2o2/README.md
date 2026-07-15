# ignition01_h2o2 — H₂/O₂ ignition, and why stiff chemistry needs a stiff solver

A closed rigid vessel holds a stoichiometric H₂/O₂ charge diluted in N₂ at
1100 K and ~5 bar. A tiny H-radical seed starts chain branching; after a short
**induction** the radical pool explodes and the mixture **ignites** — a sharp
temperature jump from 1100 K to ~2440 K.

Run it:

```
runCase tutorials/batch/combustion/ignition01_h2o2
```

and plot `trajectory.csv` (T and the radicals H/O/OH vs time). You will see:

| phase | what happens | ~time |
|---|---|---|
| induction | T almost flat (1100→1200 K); H/O/OH grow **exponentially** from the seed | 0 → ~0.7 ms |
| ignition  | chain branching outruns termination; T runs away to ~2440 K | ~0.7 → 1.0 ms |
| equilibrium | the curated thermo pins the burned state; net rate → 0 | after ~1 ms |

The **ignition delay** τ_ign (the time of maximum dT/dt) is ≈ **0.9 ms** here.

## The lesson: stiffness

The radical lifetimes are ~10⁻⁸–10⁻⁷ s while the induction runs over ~10⁻³ s —
a timescale separation of ~10⁶. That is **stiffness**. An explicit method
(RK4) is stability-limited to a step of order the *fastest* scale, so it cannot
take the ~10⁻⁵ s steps this case uses. The solver here is **Rosenbrock23**, an
L-stable linearly-implicit method that steps by *accuracy*, not stability; at
verbosity 3 it prints its stiffness verdict and step counts (the no-silent-
crutch credo).

See it fail on purpose — the sibling case runs the **same** problem with
explicit RK4 at the same step:

```
runCase tutorials/batch/combustion/ignition01_h2o2_rk4
```

It blows up to NaN within a few steps. (That case ships a
`.expect-nonconvergence` marker, so `bin/runTests` skips it — its whole point is
to fail.) Switch the integrator back to `Rosenbrock23` and the same step
converges. *See, then decide*, applied to numerics.

## ⚠️ Provenance — read before you quote a number

- **The thermodynamics is REAL, curated Choupo data.** The equilibrium each
  reversible step relaxes toward, the heat release, and the burned temperature
  all come from the nine species' curated gas-phase thermo (`standardThermochemistry` +
  `idealGasHeatCapacity`) in `data/standards/components/`, each individually
  cited. So the burned state (~2440 K) is physically meaningful.
- **The reaction RATES are REAL: the H/O subsystem of GRI-Mech 3.0, transcribed verbatim (28 reactions, third bodies, explicit colliders, the 2OH(+M) Troe falloff, both DUPLICATE pairs).** The Arrhenius constants in
  `constant/reactions` are hand-chosen, illustrative values — **not** transcribed
  from any published mechanism (GRI-Mech, Ó Conaire, Burke, San Diego, …). They
  reproduce the chain-branching *structure* so there is something stiff to
  integrate and an ignition delay to show. **Do not use τ_ign ≈ 0.9 ms as a
  quantitative result** — it is qualitative. The canonical copy lives under
  `data/proposed/mechanisms/h2o2_synthetic/` (the unverified tier); a curated
  literature mechanism should replace it before any quantitative use.

This case is **run-only** in the regression (smoke + NaN guard) — no KPI golden
is pinned, precisely because the kinetics are illustrative.
