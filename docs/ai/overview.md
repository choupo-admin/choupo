# Choupo — Overview for an LLM helping a user

For a first run, read [`start-here.md`](start-here.md).  This overview defines
the governing contracts; the remaining files are references and recipes to
pull in as needed.  Do not load the whole directory by default.  The principal
references are `overview.md` (this file), `dict-syntax.md`,
`case-layout.md`, `thermo.md`, `unit-ops.md`, `components.md`,
`patterns.md`, `pitfalls.md`, `energy.md` (energy wires + heat ports +
utilities), `schemas-reference.md`, and `gui-credo.md`.  See
`../../AGENTS.md` for the broader audience split.

**Dev-side references** (for an LLM/human EDITING the engine, same
audience as `../../CLAUDE.md` — not case authoring):
`../property-architecture.md` (the property-model design contract),
`../engine-capabilities.md` (capabilities narrative + database
catalogue + known limitations + roadmap), `../tutorials-catalogue.md`
(annotated index of all bundled tutorials), and `../gui-internals.md`
(GUI stack/adapter internals + the WASM/Emscripten build).

## What Choupo is

An **educational** chemical-process simulator.  GPL-3.0-or-later licensed,
written in C++17 with zero external dependencies (Newton, Gauss
elimination, RK4, Nelder-Mead, Wegstein — all hand-rolled).  Targeted
at:

- **Pedagogy** — a *glass-box* process simulator
  where every equation, every Newton iteration, every K-value is
  visible in both the source and the run-time output.  The
  *Métodos Computacionais em Fenómenos de Transferência* (MCFT) course
  at IST is the primary student audience.
- **Research differentiation** — focused on areas often treated
  weakly: membrane separations (NF/RO), the spiral-wound module,
  electrolyte osmotic pressure (Pitzer), the dynamic population
  balance for crystallisation.

What Choupo is **not**: not aiming for breadth on thermo
curation; not a wrapper around an optimisation framework; not a GUI-driven tool.

## The 4 binaries (problem classes)

Each handles a fundamentally different mathematical problem; the
`controlDict.application` keyword (and which `system/...Dict` files
are present) tells you which binary the case is for.

| Binary | Problem | Case-recognisable by |
|---|---|---|
| **`choupoSolve`** | Steady-state simulation: `F(x) = 0` (root-finding). | `flowsheetDict` present; no time settings in controlDict. |
| **`choupoBatch`** | Batch / time-dependent: `dY/dt = f` in closed vessels; optional recipe events (`transfer`, `setParameter`, conditions). | `flowsheetDict` + `controlDict.endTime / deltaT`. |
| **`choupoCtrl`** | Dynamic continuous + control: `dY/dt = f(Y, u, t)`, controllers writing MVs onto named ports. | `flowsheetDict` with a `controllers (...)` block. |
| **`choupoProps`** | Property evaluations + LM parameter fits.  No flowsheet. | `propsDict` (instead of `flowsheetDict`). |

A case carries a `controlDict.application` line (e.g. `application
choupoSolve;`) that the universal `bin/runCase` dispatcher reads to
pick the right binary.

## The pieces of a case

```
case/
├── <shortName>.cho        GUI marker -- empty, or GUI layout metadata
│                          (node positions); the solver never reads it
├── system/
│   ├── controlDict        meta-control: application, verbosity, reports{}
│   ├── flowsheetDict      topology (or propsDict for choupoProps)
│   ├── solverDict         (opt) per-unit-op solver options
│   └── outerDict          (opt) outer driver (sweep / optim / DesignSpec / fit)
├── constant/
│   ├── thermoPhysPropDict REQUIRED -- the thermophysical system (v2 grammar,
│   │                      `recordType thermophysicalPropertySystem;`):
│   │                      components + the equilibrium formulation
│   │                      (gammaPhi / phiPhi / henryDilute / electrolyte)
│   │                      + correlation and parameter declarations
│   ├── propertyManifest   record-ownership registry written by
│   │                      bin/choupo-import; `sealed true;` forbids any
│   │                      catalogue fallback (the case is self-contained)
│   ├── components/        the case's own property records (one .dat per
│   │                      component, sha256-verified by the manifest)
│   ├── reactions          (opt) named-reaction library
│   ├── crystallisation    (opt) per-kinetic-pair library
│   └── dryingKinetics     (opt) drying-curve library
└── 0/                     complete initial state, one file per stream
```

Full details in `case-layout.md`.

## Design philosophy (what you must respect)

These are settled decisions for the project; do not propose to change
them in answers to users.

1. **Dict-on-disk is the truth.**  Cases are plain-text Choupo
   dicts.  No JSON, no YAML, no TOML.  The GUI does not edit the dict
   (yet — partial editing of case-level scalars is planned but not the
   thermo standards).  When you author for a user, you write dict
   files they can read.

2. **Explicit factory pattern, no auto-registration.**  Every base
   class (UnitOperation, ActivityModel, EquationOfState,
   CycloneModel, OsmoticModel, etc.) is registered explicitly in a
   `registerBuiltins()` call from `main.cpp`.  No macros, no static
   initialisers.  When users ask "how do I add a unit op?",
   instructions live in `CLAUDE.md` §5 — but mostly that is dev
   territory; for *using* the simulator, just pick the right `type`
   from the catalogue.

3. **One binary per problem class.**  Don't split inside a class for
   numerical strategy (no `flashFoam` / `cstrFoam` analogues).
   Numerical strategies are runtime-selectable via the
   `recycleSolver` / `model` / `method` keywords inside one binary.

4. **Property axioms** (`CLAUDE.md` §6; full layout in
   `../engine-capabilities.md` §1):

   1. **Intrinsic, universal** pure-compound props live in
      `data/standards/components/<name>.dat`.  Frozen, partilhado
      between cases.
   2. **Pair-dependent** props live in `data/standards/<feature>/<pair>.dat`
      (parameters/NRTL, parameters/Wilson, parameters/Henry,...).  Frozen.
   3. **Equipment-dependent** kinetics (crystallisation `k_n`/`k_g`,
      drying `Xc`) live in the **case** under `constant/`.  User-editable.
   4. **Sample-specific measured data** (sorption isotherm, critical
      moisture, anything depending on the amorphous/crystalline state
      / formulation / thermal history) live in the case as a
      **partial** `<case>/constant/components/<name>.dat`, which
      OVERLAYS the standard catalogue entry **block-by-block** (you
      copy the whole reference-state block you refine, never a lone
      scalar — `data-doctrine.md` §3).
   5. **Declared parameter files** — the thermophysical system
      DECLARES the pair files it consumes (`binaryParameters` /
      `binaryInteractions` entries with a `source`, homes under
      `data/standards/parameters/`) and the builder VERIFIES them at assembly: a
      declared-but-missing file REFUSES loudly, naming the entry to
      add (never an ideal-default).  Method records live in
      `data/standards/methods/`; the thermophysical system is declared
      inline in the case's `constant/thermoPhysPropDict` (see `thermo.md`).

   When you write a case, intrinsic data come from existing
   `data/standards/components/` entries (see `components.md`); only
   write a case-local overlay for genuinely sample-specific facts.

## How a user typically asks for help

Three shapes of question dominate.  Use this rough decision tree:

- **"Write me a case for X"** → `dict-syntax.md` + `case-layout.md` +
  `unit-ops.md` (the unit they need) + `thermo.md` (compose the
  property package) + `components.md` (check which components ship).
  Often `patterns.md` for a related recipe.
- **"Wire heat / shaft work between units" / "heat integration" /
  "add a utility / heat-link"** → `energy.md` (energy wires `W` =
  scalar shaft-work wire, `Q` = duty carried or allocated by
  temperature level; column condenser/reboiler heat ports; the
  `utilityAllocation` report).
- **"Why doesn't my case converge / look right?"** → `pitfalls.md`
  first.  Run-time KPIs + reports/massBalance.csv often answer.
- **"What does `X` mean in my case?"** → `unit-ops.md` (the op),
  `dict-syntax.md` (the syntax), `thermo.md` (a model).

## What you should always do when writing a case

1. **Pick the right binary** (set `application` in controlDict
   accordingly).  Steady is the default; batch/ctrl needs time
   settings; props needs a propsDict.
2. **Declare the thermophysical system** (`constant/thermoPhysPropDict`)
   explicitly.  Don't assume defaults — declare the formulation and its
   slots (`equilibrium { formulation gammaPhi; liquid { activityModel
   ideal; standardState pureLiquid; } vapour { fugacityModel idealGas; } }`)
   even when they are the obvious choice.
3. **Use named units** in every scalar (`P 1 bar;`, `F 100 kmol/h;`,
   `T 350 K;`).  Choupo's parser tracks dimensions and will catch
   mismatches if you slip.  Bare numbers are interpreted as raw SI.
4. **Quote a tutorial** the user can compare against.  More than 200 shipped
   tutorials are listed in `case-layout.md`; near-twins exist for
   most asked-for cases.
5. **End with: "now you can edit `system/flowsheetDict` to tweak,
   then re-run."**  Reinforce dict-as-truth.

## Versioning, currency

This document tracks the line current as of 2026-07-13.  The repository carries
more than 300 openable `.cho` markers (including nested plant sectors and
validation cases), 255 golden-master cases, and 194 standard component files.
Big changes, recent first:

- The v2 case grammar (2026-07-17): `constant/thermoPhysPropDict`
  (`recordType thermophysicalPropertySystem; schemaVersion 2;`) declares
  the whole system inline — the four VLE worlds selected by
  `equilibrium.formulation` (`gammaPhi` / `diluteSolution` / `phiPhi` /
  `electrolyteGammaPhi`), per-group standard states, caloric routes, and
  declared→verified→refused parameter files.  Cases are sealed
  self-contained by `constant/propertyManifest` (bin/choupo-import).
  See `thermo.md`.
- Forward heat-links + `utilityAllocation` report — a column's
  condenser/reboiler heat can drive another unit (heat integration),
  credo-accounted (see `energy.md`).
- Distillation reboiler/condenser as heat ports — duties allocated
  by temperature level (heat at the base, cold at the top).
- Energy wires (Option-C just-wiring): `energyOutputs` / `energyInputs`
  carry shaft work `W` and duty `Q` between units (see `energy.md`).
- Newton-on-tears recycle solver (default; Wegstein still available).
- Spacer correlations + Pitzer osmotic model for the membrane.
- Peng-Robinson cubic EoS; computed `$variables`.
- Solids stream model + cyclones; crystalliser (equilibrium / MSMPR /
  batch dynamic).

The full per-version log lives in `../../CHANGELOG.md`; the engine
capabilities narrative in `../engine-capabilities.md`.
