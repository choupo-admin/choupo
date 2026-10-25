# ignition01_h2o2 — H₂/O₂ ignition, and why stiff chemistry needs a stiff solver

A closed rigid vessel holds a stoichiometric H₂/O₂ charge diluted in N₂ at
1100 K and 5 bar. A trace H-radical seed starts chain branching; after a short
**induction** the radical pool explodes and the mixture **ignites** — a sharp
temperature jump from 1100 K to ~3078 K.

Run it:

```
runCase tutorials/batch/combustion/ignition01_h2o2
```

and plot `trajectory.csv` (T and the radicals H/O/OH vs time). You will see:

| phase | what happens | ~time |
|---|---|---|
| induction | T almost flat (1100→1220 K); H/O/OH grow **exponentially** from the seed | 0 → ~6 µs |
| ignition  | chain branching outruns termination; T runs away past 2500 K | ~6 → 9 µs |
| equilibrium | the thermo pins the burned state; net rate → 0 | after ~50 µs |

The **ignition delay** τ_ign (the time of maximum dT/dt, printed in the run's
epilogue on the 1 µs write grid) is ≈ **8 µs** here.  The trace H seed is
what makes it that short: the same mechanism without a seed, at 2 atm, gives
the 43 µs of the shock-tube pin in `ignition02_h2air_slack`.

## The lesson: stiffness

The radical lifetimes are far shorter than the induction — the solver prints
a stiffness ratio of order 10⁷.  That is **stiffness**.  An explicit method
(RK4) is stability-limited to a step of order the *fastest* scale, so it cannot
take the 1 µs steps this case uses.  The solver here is **Rosenbrock23**, an
L-stable linearly-implicit method that steps by *accuracy*, not stability; at
verbosity 3 it prints its stiffness verdict and step counts (the no-silent-
crutch credo).

See it fail on purpose — two siblings run the **same** problem at the same
step with other integrators:

```
runCase tutorials/batch/combustion/ignition01_h2o2_rk4      # explicit RK4: blows up to NaN
runCase tutorials/batch/combustion/ignition01_h2o2_eulersi  # semi-implicit Euler: refuses by name
```

(Both ship a `.expect-nonconvergence` marker — their whole point is to fail.)
*See, then decide*, applied to numerics.

## Provenance — read before you quote a number

- **The reaction rates** are the H₂/O₂ mechanism of Ó Conaire, Curran, Simmie,
  Pitz & Westbrook, *Int. J. Chem. Kinet.* 36 (2004) 603, Table I, transcribed
  from the paper — the same `constant/reactions` as `ignition02_h2air_slack`,
  where the transcription is pinned against the Slack shock-tube delays.
  Reverse rates come from equilibrium, through the thermo below.
- **The thermodynamics**: the formation data are the curated catalogue's; the
  ideal-gas heat capacities of H₂, O₂, N₂ and water are case-local NASA-9
  polynomials read from NASA/TP-2002-211556 (McBride, Zehe & Gordon 2002,
  public domain), because the catalogue's process-range Cp does not reach a
  flame.
- **What changed on 2026-10-25** (DEV.md §4c C164): until then this case and its
  two siblings ran the H/O subsystem of GRI-Mech 3.0, copied verbatim, with
  heat capacities from GRI-Mech's thermo file.  GRI-Mech grants no
  redistribution, so both were replaced.  The burned temperature moved from
  2641 K to 3078 K, and the new one is the right one, measured rather than
  argued: a Gibbs minimisation (`gibbsReactor`, isothermal, this charge's
  elements) at the run's final T and P reproduces the run's final composition
  (H 1.152 %, water 26.98 %), while at the old 2641 K it puts H at 0.17 % and
  water at 31.1 % where the old run had stopped at 3.17 % and 23.1 %.  The old
  plateau was a radical pool that never recombined, not an equilibrium.  The
  integrator lesson is unchanged.

The KPI golden pins the burned state; the ignition delay is printed, not
pinned.
