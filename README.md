# Choupo

**Educational process simulator** — C++17, GPL-3.0-or-later, file-first case
directories, modular thermo, file-based component database, browser GUI
(WASM).

> **Choupo-2607** — four binaries, one per problem class.
> `main` is the development line, `Choupo-dev`; a release is an immutable tag
> `vYYMM` (public name `Choupo-YYMM`).  Cite the
> exact version you used — see [`CITATION.cff`](CITATION.cff) and the
> [versioned releases](https://github.com/choupo-admin/choupo/releases).
> (`choupoSolve` steady, `choupoBatch` time-dependent + recipes,
> `choupoCtrl` dynamic continuous + control loops, `choupoProps`
> property evaluation + parameter fitting); a large runnable tutorial
> corpus, every case guarded by regression checks (golden-master KPIs +
> a NaN/inf guard on every case; `listCases` and
> [`generated/releaseInventory.json`](generated/releaseInventory.json)
> carry the current counts);
> three-layer simulator architecture (outer driver / simulator / post).
> Thermo: NRTL / Wilson activity, SRK + Peng-Robinson cubic EoS,
> gas + liquid transport (viscosity, conductivity, diffusivity),
> Henry's law, Pitzer electrolyte osmotic pressure.  Unit ops: flash
> (incl. VLLE), distillation (Wang-Henke, simultaneous MESH, shortcut
> FUG), reactors (CSTR / PFR / multi-phase Gibbs / batch, reversible
> kinetics), heater + two-stream heat exchanger, rotating equipment
> (compressor / turbine / pump), absorber / stripper, solids
> (cyclone / bag filter / gas-solid splitter / crystalliser / spray +
> solid dryer), and a spiral-wound NF/RO membrane (spacer k_film + ΔP
> correlations, multi-element trains).  Sequential-modular flowsheets
> with recycle (Newton-on-tears, or Wegstein) and fractal multi-sector
> plants; outer drivers (sweep, Nelder-Mead optimisation, DesignSpec,
> LM fitting); declarative `reports {}` (stream table, mass + energy
> balances, sizing, Guthrie costing, computed variables, coloured
> `.ods`).  Hand-rolled Newton, Wegstein, RK4, Nelder-Mead,
> Levenberg-Marquardt, Michelsen TPD.  Built-in physical-
> dimensions tracking on every dict scalar.  Web GUI (React + Mantine +
> React Flow + Plotly) with all four binaries shipped as WebAssembly.

## Why this exists

`Choupo` is a glass box: every equation, every Newton iteration, every K-value
is visible — both in the source code and in the terminal output.  It is built
for teaching and for research in areas where transparency and customisation
matter more than breadth.

## Build

```bash
make all              # native release, -O2 → ./choupoSolve ./choupoBatch
                      #                        ./choupoCtrl  ./choupoProps
make MODE=debug all   # -O0 -g, parallel build tree
make wasm-gui         # WebAssembly builds for the browser GUI — all four
                      # binaries into gui/public/wasm/ (never run two
                      # concurrently: they share that directory)
make wasm-clean
make distclean        # wipe the whole build/ tree
```

## Run a tutorial

```bash
./choupoSolve tutorials/steady/flash/flash01_benzene_toluene
```

For an interactive shell with helpers (`runCase`, `listCases`,
`cleanCase`):

```bash
source etc/bashrc
listCases
runCase tutorials/steady/flowsheets/process01_reactor_flash
```

`runCase` reads `controlDict.application` and dispatches to the right
binary, so it takes any tutorial in any category.

The component database is auto-resolved.  Move tutorials around freely
or set `CHOUPO_HOME` to override the lookup.

## Documentation

| File | Audience |
|---|---|
| [`docs/userGuide.pdf`](docs/userGuide.pdf) ([source](docs/userGuide.tex)) | Students and instructors running cases |
| [`docs/developerGuide.pdf`](docs/developerGuide.pdf) ([source](docs/developerGuide.tex)) | Contributors adding unit ops, thermo, drivers |
| [`docs/theoryGuide.pdf`](docs/theoryGuide.pdf) ([source](docs/theoryGuide.tex)) | The mathematics behind every model |
| [`CLAUDE.md`](CLAUDE.md) | AI assistants + conventions; authoritative state |
| [`data/standards/README.md`](data/standards/README.md) | The curated reference data layout |
| [`gui/README.md`](gui/README.md) | Web GUI subproject |

## Case directory layout (file-first)

```
caseDir/
├── system/
│   ├── controlDict          required   verbosity + application + description
│   ├── flowsheetDict        required   topology: units + connections
│   ├── solverDict           optional   per-unit-op solver options
│   ├── outerDict            optional   outer driver (sweep / optimization / …)
│   └── postDict             optional   post-processing chain (sizing / costing)
├── constant/
│   ├── thermoPhysPropDict   required   the thermophysical system (components,
│   │                                   formulation, models, parameters)
│   ├── propertyManifest     sealed record registry (bin/choupo-import)
│   ├── components/          the case's own property records (.dat)
│   ├── reactions            optional   named-reaction library
│   └── parameters/          optional   case-local interaction parameters
│       └── <model>/<c1>-<c2>.dat
└── 0/                       required   complete initial state, one file
                                        per stream
```

A single isolated unit is just a `flowsheetDict` of length 1 — there is
no special "standalone" mode.

## Binaries (one per problem class)

| Binary | Problem class | Equation form | Used by |
|---|---|---|---|
| `choupoSolve` | Steady-state simulation                | `F(x) = 0` (root finding) | flash, bubble-T, distillation, CSTR steady, recycle flowsheets, sweeps, optimisation, parameter estimation |
| `choupoBatch` | Batch / time-dependent simulation       | `dY/dt = f(Y, t)` with recipe events | batch reactor (isothermal / adiabatic / multi-reaction), Rayleigh distillation, recipe-driven multi-vessel sequences |
| `choupoCtrl`  | Dynamic continuous + control loops      | `dY/dt = f(Y, u(t), t)`  | continuous CSTR with PID temperature control, disturbance-rejection studies |
| `choupoProps` | Property evaluation (the PROPS BENCH)   | direct model evaluation — no flowsheet | γ / φ / Psat / Cp scans, T-x-y and binary-LLE sweeps, aqueous speciation + scaling, parameter fits, thermodynamic-consistency tests |

The four binaries share `src/{core,thermo,solver,materials,unitOperations,control}`; `make all` builds all four.  Pick the one your case needs by setting `application` in `controlDict` --- `runCase` then dispatches automatically.

## Capability matrix

| Layer | Capability |
|---|---|
| Activity coefficients γ_i(T, x) | `ideal`, `NRTL`, `Wilson`, `UNIQUAC`, `UNIFAC` (predictive, group contribution), `cosmoSAC` (2002 variant; surface data per component, VT-2005 sets referenced not shipped) |
| Aqueous (electrolyte) activity  | `davies` (teaching rung, charge-only), `pitzerHMW` (per-ion virials), `edwardsPitzer` (Edwards et al. 1978 truncation, sour-water), eNRTL + single-salt Pitzer adapters |
| Equation of state φ_i(T, P, y)  | `idealGas`, `SRK`, `PengRobinson` (alias `PR`), `PCSAFT` (incl. association, 2B/3B/4C schemes) |
| Vapour pressure Psat_i(T)       | `Antoine`, `AmbroseWalton` |
| Heat capacity Cp(T)             | `polynomial` (liquid + ideal gas), `NASA7` |
| Latent heat ΔHvap(T)            | Watson correlation |
| Pure-component Gibbs energy     | `standardThermochemistry { dHf_298; s_298; referenceState; }` block + Kirchhoff via Cp |
| Phases                          | vapour, liquid, solid.  The solid's **crystallising** mode is implemented (one component's pure crystal in SLE — ice and minerals, `f_solid = Psat·exp(−ΔG_fus/RT)`); its **inert** mode (propagated but skipped by the flash) is still a stub and refuses by name |
| Reactors                        | `cstr`, `pfr`, `gibbsReactor` (multi-phase, 3 selectable methods) |
| Separation flash / saturation   | `isothermalFlash` (alias `flash`; VL / LL / VLLE), `adiabaticFlash`, `bubbleT`, `dewT` |
| Distillation                    | `distillationColumn` (alias `column`; Wang-Henke or simultaneous MESH), `shortcutColumn` (alias `FUG`), `absorber`, `stripper` |
| Heat transfer + phase change    | `heater`, `heatExchanger` (ε-NTU), `evaporator` |
| Rotating equipment              | `compressor`, `turbine`, `pump` (W_shaft + η), `electricLoad` (shaft / work sink) |
| Flow manipulation               | `mixer`, `splitter`, `valve` |
| Solids handling                 | `cyclone` (5 sub-models), `bagFilter`, `gasSolidSplitter`, `crystalliser` (MSMPR + FVM PBE), `sprayDryer`, `solidDryer` |
| Membrane                        | `spiralWoundModule` (alias `membraneSW`; NF/RO, solution-diffusion + film model, spacer k_film + ΔP correlations, multi-element trains) |
| Energy + heat ports             | scalar work wires (`energyInputs` / `energyOutputs`), distillation condenser / reboiler heat ports, forward heat-links between units, utility allocation by temperature level — see [`docs/ai/energy.md`](docs/ai/energy.md) |
| Batch unit operations           | `batchReactor` (isothermal / adiabatic, multi-reaction), `batchStill` (Rayleigh) |
| Dynamic unit operations         | `dynamicCSTR` (continuous flow + Arrhenius reactions + jacket heat transfer) |
| Controllers                     | `PIDController` (derivative-on-PV + clamping anti-windup), `ScheduleController` (open-loop MV schedule for disturbance injection) |
| Recipe layer (`choupoBatch`)   | time-triggered events: `transfer` (vessel-to-vessel), `setParameter` (runtime mutation) |
| 1-D solvers                     | Newton-Raphson (bracket + damping + early-tolerance break) |
| n-D solvers                     | NewtonND with Gauss elimination |
| Direct minimisation             | Nelder-Mead simplex (relative-per-axis tolerance) |
| Phase stability                 | Michelsen TPD detector; LL + VLLE flash via Gibbs-energy minimisation on the simplex with multi-start |
| Outer drivers                   | `sweep` (sensitivity), `gridSweep`, `paretoSweep` (multi-objective front), `optimization` (Nelder-Mead minimisation of KPI / cost / `costTotal`), `designSpec`.  (`fitBinaryPair` is RETIRED — the factory throws, naming `fitParameters`; pair regression lives in `choupoProps`, with identifiability diagnostics and a golden.) |
| Post-processing                 | sizing (`stirredTank`, `shellTubeHX`), Guthrie costing (`method guthrie`), Materials registry (`carbonSteel` / `SS304` / `SS316` / `aluminium`) |
| Flowsheet machinery             | sequential-modular with Wegstein on tear streams |
| Web GUI                         | React + Mantine + React Flow + Plotly; all three binaries as WebAssembly, dispatched by `controlDict.application`; time-series trajectory plots for dynamic cases; drag-resizable output panel + pop-out windows |

## Tutorials

Cases live under `tutorials/<category>/<name>/`:

| Category | Binary |
|---|---|
| `steady/` | `choupoSolve` |
| `batch/`  | `choupoBatch` |
| `ctrl/`   | `choupoCtrl`  |
| `props/`  | `choupoProps` |
| `plant/`  | `choupoSolve` (fractal multi-sector showcase) |
| `electrochem/` | `choupoSolve` |

**Counts are generated, never written here.**  The single source of truth
is [`generated/releaseInventory.json`](generated/releaseInventory.json)
(produced by `bin/curate/release_inventory.py`, with a `runTests` gate that
fails when it goes stale) — a tally copied into prose is a second home for
a derived number, and this table used to carry one that had drifted.

Browse the full inventory with `listCases`.  `bin/runTests` checks each
case that ships an `expected` file against per-case golden-master KPIs;
cases without one run end-to-end under a NaN/inf guard only.  A golden
PASS means the answer has not MOVED — agreement with published
measurement is a separate claim, carried by `anchor` rows and the named
validation subset in
[`docs/architecture/verification-and-validation.md`](docs/architecture/verification-and-validation.md).

See [`docs/userGuide.pdf`](docs/userGuide.pdf) for a one-line summary
of what each one teaches.

## Web GUI

Browser front-end in [`gui/`](gui).  React + Mantine + React Flow +
Plotly.  Loads the C++ solver as a WebAssembly module (via Emscripten)
running in a Web Worker; falls back to a deterministic mock when the
WASM is not built.  See [`gui/README.md`](gui/README.md).

## Authorship and Provenance

**Copyright © 2026 Vítor Geraldes.**  Choupo was
conceived and architected by Vítor Geraldes, and substantial parts of the
initial implementation, documentation, and tutorial corpus were produced
with assistance from Anthropic Claude Code using Claude Opus/Fable models.
The published project is human-curated, reviewed, corrected, and maintained
by Vítor Geraldes.  The academic-citation entry is in
[`CITATION.cff`](CITATION.cff); the authoritative fine-grained record of
authorship is [`AUTHORS`](AUTHORS), source headers, DCO sign-offs, and git
history.

Vítor's contribution to the architecture, project direction, and initial
release was made outside an exclusive-employment arrangement, on personal
equipment and accounts, including a personally paid Claude Code subscription.
The *Choupo* name and marks are separately held as a trademark by TalentGround
Lda.; the GPL licence covers the software, not the brand.

Bug reports and concrete improvement suggestions are welcome through the issue
tracker. The project is maintainer-led and does not accept external code
contributions or pull requests; see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licence

Choupo is licensed under the **GPL-3.0-or-later** — free for academic,
research, personal, and commercial use alike.  See
[`LICENSE`](LICENSE), [`NOTICE`](NOTICE), and [`LICENSES/README.md`](LICENSES/README.md).

The guides/manuals under [`docs/`](docs) are a separate documentary work:
their prose, figures, and explanatory text are licensed under
**CC BY-SA 4.0**.  Code excerpts, Choupo case files, and other
machine-readable examples inside the guides stay under **GPL-3.0-or-later**.
The Properties Guide and Theory Guide are authored by Vítor Geraldes, Pedro
Mendes, and Miguel Rodrigues. The Developer Guide and remaining manuals are
authored by Vítor Geraldes alone.

Use it, modify it, redistribute it, and build on it under GPL-3.0-or-later.
Forks remain welcome under that licence, but this upstream repository does not
accept external patches or pull requests. Suggestions do not transfer
copyright and do not guarantee implementation.
The licence does **not** grant rights to the *Choupo*
name or marks — the code is open; the name is a trademark of
**TalentGround Lda.** (the founder's family holding).  See
[`TRADEMARKS.md`](TRADEMARKS.md) for details.

## Roadmap

**Choupo-2607.**  Four binaries, three-layer architecture
(outer driver / simulator / post-processor); the runnable-case tally is
generated (`generated/releaseInventory.json`), never written here.  Thermo:
ideal / NRTL / Wilson activity, SRK + Peng-Robinson cubic EoS,
ideal-gas H/S, Henry's law, Pitzer electrolyte osmotic, gas + liquid
transport (viscosity / conductivity / diffusivity, selectable
sub-models).  Unit ops: VL / LL / VLLE flash, Wang-Henke and
simultaneous-MESH distillation, shortcut FUG, CSTR / PFR / batch
reactors (with reversible kinetics) + multi-phase Gibbs (3 selectable
methods), heater + two-stream HX (ε-NTU), rotating equipment
(compressor / turbine / pump), absorber / stripper, solids
(cyclone / bag filter / gas-solid splitter / crystalliser MSMPR + FVM
PBE / spray + solid dryer), spiral-wound NF/RO membrane with spacer
correlations + multi-element trains.  Energy layer: scalar work wires,
distillation condenser / reboiler heat ports, forward heat-links
between units, utility allocation by temperature level, and a full
Brayton + Rankine combined cycle (shaft split + HRSG heat link) — see
[`docs/ai/energy.md`](docs/ai/energy.md).
