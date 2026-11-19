# ignition01_h2o2_rop — which reactions make and destroy each species

The same H₂/O₂ ignition as `ignition01_h2o2` (closed rigid vessel, 1100 K,
5 bar, O Conaire 2004 mechanism, Rosenbrock23), with one added block on the
vessel:

```
rateOfProduction { times ( 3.0e-6 7.0e-6 1.5e-5 ); top 5; }
```

Run it:

```
runCase tutorials/batch/combustion/ignition01_h2o2_rop
```

At the first committed step that reaches each time (here the 1 µs write grid
hits them exactly) the run prints, for every species, its net rate of change,
its gross production and consumption, and the `top` reactions on each side
with their **share** of that gross. The whole matrix goes to
`rateOfProduction.csv` (columns `t_s, species, reaction, nu, rate_kmol_m3_s,
contribution_kmol_s`, plus a `NET` row and the integrator's own `DNDT_ODE`
row per species).

The three instants were read from `ignition01_h2o2`'s trajectory:

| instant | T | what it shows |
|---|---|---|
| 3 µs | 1108 K | induction: the radical pool is growing, almost no heat released |
| 7 µs | 1766 K | the ramp, between the 6 and 8 µs rows where dT/dt peaks |
| 15 µs | 3076 K | burned gas: each channel's forward and reverse legs nearly cancel, so net is small against gross |

Definitions: `r_j` is the net rate of reaction *j* (kmol/m³/s, the very number
the integrator uses, third-body concentration and fall-off included),
`c_ij = ν_ij r_j V` (kmol/s) is what reaction *j* does to species *i*, and
Σ_j c_ij equals the integrator's dnᵢ/dt exactly (held by
`bin/curate/check_rate_of_production.py`). Theory Guide: *Rates of production
of a reaction mechanism*.

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
