# CLAUDE.md — Choupo project guide

This file briefs any AI assistant (or new human collaborator) on
**what this project is, how it is structured, what conventions to follow,
and which traps to avoid**.  Read it before touching code.  It is kept
lean (loads every session); heavy reference lives in `docs/` — pointers
throughout.

---

## 1. What this project is

**Choupo** is an *educational* process simulator written in **C++17**,
licensed under **GNU GPL-3.0-or-later** — free for academic, research,
personal, and commercial use under the GPL.  It was conceived and architected
by **Vítor Geraldes**; substantial parts of the initial implementation,
documentation, and tutorial corpus were produced with assistance from
Anthropic Claude Code using Claude Opus/Fable models; the published project
is human-curated, reviewed, corrected, and maintained by **Vítor Geraldes**
and **Pedro Mendes**.  Copyright belongs to the named human contributors
according to `AUTHORS`, source headers, DCO sign-offs, and git.  The code is
open; the *Choupo* **name and marks are NOT granted by the software licence**
and are a trademark of **TalentGround Lda.** (Vítor's family holding) — open
code, holding-owned name, deliberate (see §10).  See [`LICENSE`](LICENSE),
[`NOTICE`](NOTICE), [`AUTHORS`](AUTHORS), [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`CITATION.cff`](CITATION.cff), [`TRADEMARKS.md`](TRADEMARKS.md).

Provenance note: Vítor's architecture, project direction, and initial release
work was done outside an exclusive-employment arrangement, on personal
equipment and accounts, including a personally paid Claude Code subscription.
The *Choupo* trademark is held separately by TalentGround Lda.

Targeted at:

* **Pedagogy** — the *Métodos Computacionais em Fenómenos de Transferência*
  (MCFT) course.  A "glass-box" alternative where every equation, every
  Newton iteration, every K-value is visible in source AND run-time output.
* **Research / industry differentiation** — extensible for areas where
  breadth-first tools are weak (membranes / NF / RO — Vítor's research;
  electrochemical systems; bioprocess detail; multi-scale CFD coupling).

What it is **not**: not aiming for breadth or thermo-curation parity; not a
wrapper around an optimisation framework; not a GUI tool.  The differentiator
is **transparency + customisation**.  The value is **academic and
reputational**, not commercial.

---

## 2. Build & run

Zero external dependencies — only a C++17 compiler (`g++`) and GNU `make`.

```bash
cd /path/to/Choupo
make all                       # release build (`make` alone does the same)
make MODE=debug                # debug build (parallel tree)

source etc/bashrc              # adds bin/ + project root to PATH
runCase tutorials/steady/flash/flash01_benzene_toluene   # dispatches by application field
listCases                      # available tutorials
bin/runTests                   # FULL regression (NaN/inf guard + golden-master KPIs)
bin/runGui                     # GUI dev server + Firefox (see docs/gui-internals.md)
bin/runSite                    # local landing rehearsal (`/` landing, `/app` GUI, one port)
```

Layout:

```
Choupo/
├── Makefile / make/           top-level switch + compiler.mk + rules.mk
├── build/<PLATFORM>[Debug]/    *.o, *.d, binary  (gitignored)
├── choupoSolve / choupoBatch   symlinks → build/<...>/<binary>
├── etc/bashrc                  sourceable shell env
├── bin/                        runCase, runTests, runGui, runSite, listCases, devGui, llmctx, …
├── data/standards/             components/ materials/ membranes/ utilities/ + pair catalogues
├── src/                        C++ source (see §4)
└── tutorials/                  148 cases under steady/ batch/ ctrl/ props/ plant/ (see §8)
```

### Git & release conventions

* **Never `git add -A`.**  Stage explicitly per file; keep run outputs and
  editor / auto-saved files out of commits.
* **Git identity** for project commits: `Vítor Geraldes` /
  `talentgroundlda@gmail.com` (the copyright holder).
* **No `Co-Authored-By` trailer** in commit messages.
* **Version** lives in `src/core/Banner.H` (`CHOUPO_VERSION`), `CITATION.cff`,
  and `CHANGELOG.md` — bump them together when tagging a release.

---

## 3. Case directory layout (file-first)

```
case/
├── <shortName>.cho         empty marker file — the GUI's "openable" entity
├── system/
│   ├── controlDict         meta-control (verbosity, description, reports)
│   ├── flowsheetDict       topology: units + connections (+ optional `recipe`
│   │                         block of time-triggered events for choupoBatch)
│   ├── solverDict          per-unit-op solver options          [optional]
│   ├── outerDict           outer driver (sweep / optim / PE)   [optional]
│   └── postDict            post-processing chain (sizing, cost)[optional]
├── constant/
│   ├── propertyDict        components + γ-φ models / phases
│   └── reactions           named-reaction library             [optional]
└── 0/                      complete state, one file per graph stream
```

* **A single isolated unit is just a `flowsheetDict` of length 1.**  No
  "standalone" mode — one consistent case format for everything.
* **The `.cho` marker file** is the openable entity in the GUI (the CLI is
  unaffected; `runCase`/`choupoSolve` take the folder path).  Intentionally
  empty for now; future GUI-only metadata lives here without polluting the
  dicts the C++ solver reads.
* **Tutorial categories:** `steady/` → choupoSolve, `batch/` → choupoBatch,
  `ctrl/` → choupoCtrl.  `bin/runCase` reads `controlDict.application` and
  dispatches automatically.
* Optional dicts are truly optional.  A minimal steady case has
  `controlDict`, `flowsheetDict`, `constant/propertyDict`, and a complete `0/`
  directory.  `flowsheetDict` contains topology only; stream values live in
  `0/<stream>`.

Full case-authoring detail (dict syntax, `recipe` actions, fractal
multi-sector shape) → [`docs/ai/case-layout.md`](docs/ai/case-layout.md) and
[`docs/engine-capabilities.md`](docs/engine-capabilities.md) §7.

---

## 4. Architecture: 3 layers

```
┌── OuterDriver           src/outerDriver/
│   (sensitivity, optim, parameter estimation, MC)
│   Repeatedly runs the simulator with modified inputs.
│
├── Simulator core       src/{thermo, solver, streams, unitOperations, flowsheet}
│   ONE pass:  Flowsheet → SimulationResult (streams + KPIs).
│
└── PostProcessor         src/postProcessing/
    (sizing, costing, reporting)  Augments / reports after a pass.
```

`main.cpp` is a thin orchestrator: (1) load `controlDict`, `flowsheetDict`,
`thermoPackage`; (2) if `outerDict` → instantiate driver, hand it the simulator
functor, loop; (3) else → one pass + (if `postDict`) the post-processor chain.
The simulator functor is just `runSimulation(flowsheetDict,...)` — a pure
function, used by both the direct path and every outer driver.

### Source tree

```
src/
├── core/                Dictionary, SimulationResult, Types, Constants
├── streams/             ProcessStream  (T, P, F, z, vf — what travels between units)
├── thermo/              Component, ThermoPackage, Database, phase/, vaporPressure/,
│                         activityCoefficient/, equationOfState/, heatCapacity/,
│                         membrane/ (Membrane + MembraneRegistry)
├── materials/           Material + MaterialRegistry (loads data/materials/*.dat)
├── solver/              NewtonRaphson (1-D), NewtonND (n-D), Wegstein,
│                         StabilityTest (Michelsen TPD)
├── unitOperations/
│   ├── UnitOperation.{H,cpp}     abstract base + factory + registerBuiltins
│   ├── flash/ saturation/ reactor/ heatTransfer/ mixer/ distillation/
│   ├── flowsheet/                Flowsheet (the orchestrator)
│   ├── membrane/                 SpiralWoundModule  (NF/RO)
│   ├── batch/                    BatchUnitOperation + BatchReactor + BatchStill  (choupoBatch)
│   └── dynamic/                  DynamicUnitOperation + DynamicCSTR  (choupoCtrl)
├── control/             Controller abstract + PIDController + ScheduleController  (choupoCtrl)
├── outerDriver/         OuterDriver abstract + SweepDriver + FitBinaryPair
│                         + OptimizationDriver (Nelder-Mead)
├── postProcessing/      PostProcessor abstract + SizingPass + CostingPass
│   ├── sizing/                   EquipmentSize abstract + StirredTank + ShellTubeHX
│   └── costing/                  CostingModel abstract + Guthrie
└── applications/
    ├── choupoSolve/main.cpp     steady-state binary
    ├── choupoBatch/main.cpp     batch / time-dependent binary
    ├── choupoCtrl/main.cpp      dynamic continuous + control binary
    └── choupoProps/main.cpp     property evaluation + the PROPS BENCH
```

---

## 5. Conventions

### Factory pattern — **always explicit**

Every base class (`UnitOperation`, `Phase`, `ActivityModel`,
`EquationOfState`, `VaporPressureModel`, `HeatCapacityModel`, `OuterDriver`,
`PostProcessor`, `EquipmentSize`, `CostingModel`) has:

```cpp
class Base {
public:
    using Factory = std::function<std::unique_ptr<Base>(...)>;
    static void  registerType(const std::string& name, Factory f);
    static std::unique_ptr<Base> New(...);
    static void  registerBuiltins();
};
```

`registerBuiltins()` is called **explicitly** in `main.cpp`.  Do **not** add
auto-registration via macros / static initialisers.  Reasons: (1) pedagogical
clarity — students see exactly where types come from; (2) avoids the
static-init order fiasco (auto-reg can silently fail if the linker discards a
TU); (3) consistency — every base follows the same pattern.

### Adding a new unit operation

1. Implement under `src/unitOperations/<category>/MyOp.{H,cpp}`, inherit from
   `UnitOperation`.
2. Override `type()`, `solve()`, optionally `producedStreams()` and `kpis()`.
3. In `src/unitOperations/UnitOperation.cpp`: `#include "<category>/MyOp.H"`
   and one line in `registerBuiltins()`:
   `reg("myOp", []{ return std::make_unique<MyOp>(); });`
4. `make` picks the new `.cpp` up automatically (recursive `find`).  **Rebuild
   WASM** too (`make wasm`) or the GUI won't see the new type (§13).

Dev-side instructions live HERE; the user-facing catalogue entry goes in
[`docs/ai/unit-ops.md`](docs/ai/unit-ops.md).  Add a new thermo model the same
way for the relevant base (e.g. `Wilson` under
`src/thermo/activityCoefficient/`, registered in `ActivityModel.cpp`).

### Dictionaries — plain-text, hierarchical

* Hierarchical plain text, `// line` and `/* block */` comments;
  `keyword value;` scalars; sub-dicts `{...}`; lists `(...)`; list-of-dicts.
* Component-aware tokenizer (`[` `]` are word chars, used in paths).
* `Dictionary::setScalarAtPath("units[0].operation.refluxRatio", v)` — used by
  outer drivers to vary parameters across passes.
* **Unit spec order: `type` then `model` then `operation`.**  The `model` slot
  (single word, right after `type`) selects a sub-model where one exists
  (e.g. `cyclone` → Lapple/…/Muschelknautz; `distillationColumn` →
  WangHenke/simultaneous); numeric params live in `operation`.
* **Per-unit `thermo {}` override** REPLACES the global models for that unit
  only (components stay global) — e.g. SRK for a high-P compressor.
  Pedagogical caveat: a stream crossing a model boundary is re-interpreted
  there.  Default is ONE consistent global model.
* **Scalar values carry units** in three forms: named-unit (`P 1 bar;`),
  bracket dimensions (`A_w [-1 2 1 0 0] 1.5e-12;`), or raw SI.  Parser
  converts to canonical SI and cross-checks declared vs expected dimensions
  with a crystal-clear error on mismatch.

Full dict/units/thermo-override detail + examples →
[`docs/ai/dict-syntax.md`](docs/ai/dict-syntax.md).

### Code style

* C++17 only — `std::variant`, `std::unique_ptr`, `std::filesystem`.
* No raw `new` / `delete`.  Smart pointers everywhere.
* Headers compile in isolation; minimise inter-includes.
* Brace style: Allman (open brace on a new line for functions).
* Indent 4 spaces, no tabs.
* `snake_case` variables, `camelCase` methods, `PascalCase` types.
* Compile cleanly with `-Wall -Wextra -Wpedantic`.

### `controlDict` entries

`application` (word, which binary), `description` (string, run-header label),
`verbosity` (int, default `3`).  Verbosity: `0` silent · `1` +warnings ·
`2` +summary · `3` info — *Newton iterations visible* (pedagogical default) ·
`4` debug.

### Heat of reaction — ONE enthalpy base (settled 2026-06-27, do NOT relitigate)

The heat of reaction is **always** the elements/formation datum:
`dH_rxn(T) = Σ νᵢ·hᵢ(T)`, where each `hᵢ` carries `ΔHf°(elements, 25 °C)` from the
species' `gibbsFormation{}` block — in **every** reactor, steady
(`conversionReactor` / `cstr` / `pfr` / `gibbsReactor`) AND time-dependent
(`batchReactor` / `dynamicCSTR`).  Every reacting species needs `gibbsFormation`.
The reactions-dict **`dH_rxn` key is NOT a primary input** — it is an explicit,
announced, cross-checked **override**, honoured only when a species deliberately
lacks formation data (toy / lumped pedagogy); when both exist the engine warns on
a mismatch, never silently overrides the curated value, and never runs silently
thermally-neutral (the `dH_rxn = 0.0` default is gone).  Unified through a single
shared `reactionHeat()` resolver so steady and dynamic can never diverge again —
full rationale in [`docs/ai/energy.md`](docs/ai/energy.md).

### Salt formation — ION-DERIVED, never a component block (settled 2026-06-29, forum 5/6, do NOT relitigate)

A dissolving / crystallising **salt's SOLID formation enthalpy is a DERIVATIVE**,
not a stored input: `Hf_solid = Σνᵢ·hfAq_i − dH_soln`, from the aqueous ions
(`data/standards/components/true/aqueous/` `hfAq`) **plus** the heat of solution (the
component's `electrolyte { dissolutionEnthalpy }` block, primary-cited).  It is
**NEVER** written as a component-level `gibbsFormation` block — that is a SECOND
source of truth that silently drifts (the arity-1 sin; *trees never store
derivatives*).  The crystalliser's **heat of crystallisation reads
`dissolutionEnthalpy` directly** (single-sourced; the `dHcryst 0.0` placeholder
is gone — a real, ion-derived duty even unfitted/mixed-solvent), and
`bin/curate/check_ion_pins.py` **EXITS 1** if any component carrying
`dissolutionEnthalpy` also carries `gibbsFormation`.  A **nonvolatile salt must
NEVER route its enthalpy through the ideal-gas reference** (`h_pure_ig` /
`idealGasHeatCapacity`) — it takes the solid/aqueous rung.  Property-architecture
(curation-time resolution) is for a MISSING datum; this one is present-via-
derivation, so single-source (arity-1) controls.  Full rationale: the
`salt-crystallisation-enthalpy-2026-06-29` forum + [`docs/ai/energy.md`](docs/ai/energy.md).

### Electrolyte activity selector keys — `pitzer` ≠ `pitzerHMW` (settled 2026-06-29, A3, do NOT re-clash)

Two DIFFERENT Pitzer engines now carry two DISTINCT factory keys (the old
`pitzer` name-collision across two factories is gone):
* **`pitzer`** = `ElectrolyteActivity`, the salt-level single-salt VLE adapter,
  selected `activityModel { model pitzer; }` in a **thermoPackage** (eNRTL next).
* **`pitzerHMW`** = `PitzerHMW`, the per-ion multi-ion Harvie-Møller-Weare
  speciation engine, selected `activityModel pitzerHMW;` in a **propsDict
  `speciate`** op (vs `davies`).

The molality+charge surface is a PURE INTERFACE (`ElectrolyteModel`) reached via
`ThermoPackage::electrolyte()` / `ActivityModel::asElectrolyte()` — there is **NO**
`electrolyteModel {}` case block and **no RTTI downcast** in the package (the
construction-time configure downcasts were removed in A1; the engine query is the
`asElectrolyte()` virtual, A2).

### Electrolyte data tree — 7 HOMES, NO `apparent/`, NO `true` (SETTLED 2026-07-01, do NOT relitigate)

A substance's ROLE (lumped / dissociated / multi-ion / molten) is chosen by the
`propertyPackage` a case selects — **never stored on the substance** — via two
ORTHOGONAL axes: **REPRESENTATION** (the package activates: lumped → complete
dissociation → partial/ion-pair → multi-ion) × **REFERENCE** (the method selects
one of 4 discrete rungs: solid · pure-liquid Raoult · aqueous-inf-dilution ·
fused-salt Temkin; mixed-solvent = aqueous + a transfer term in `parameters/`, NOT
a 5th rung).  The same Na⁺ is aqueous-ref dissolved / fused-ref molten → `species/`
is **medium-agnostic** (one file), the method picks the rung; molten salt is just
another method, no special case.  **7 homes:** `components/` (identity **+
`dissociatesTo`** = formula-like ion stoichiometry, NOT the "saco") · `species/`
(model species + charge, medium-tagged `…Thermo{}`) · `phases/solid/` (ρ_p,k_v) ·
`chemistry/` (REAL equilibria w/ K+ΔH: dissolution, association) · `parameters/` ·
`propertyMethods/` (declares model + reference rung) · `propertyPackages/` (SELECTS
all; a manifest).  (`propertySets/` was deleted 2026-07-01 — zero readers.)  **ONE component = ONE file:
`components/apparent/*` is DELETED** (the builder reads salt identity+`dissociatesTo`
from `components/`, solid from `phases/solid/`, anchor from `chemistry/salts/`);
**"true species" is BANNED** (→ *model/solver species*; `recordType modelSpecies`,
method `requires.ionSpecies`); **NO top-level `basisMaps/`** (it is the K→∞ limit of
dissociation + is per-(component,method)).  Rejected: two `NaCl.dat`, per-medium
species duplication, mixed-solvent as a 5th rung.  Full contract + the 10 validating
systems + implementation status (F1–F4 done, 202/0 byte-exact):
[`docs/architecture/electrolyte-data-architecture.md`](docs/architecture/electrolyte-data-architecture.md).
Supersedes the `basisMaps`/`apparent-true` layout in the older
`docs/architecture/{aspen-like-data-architecture,data-ontology}.md`.

---

## 6. Current state (summary — detail in docs)

* **211 tutorials** under `tutorials/{steady,batch,ctrl,props,plant,electrochem}/`;
  `bin/runTests` validates **255** via golden-master KPI + NaN/inf guard
  + the doctrine gate (0 FAIL, 0 KNOWN-BROKEN; one deliberate EXPECTED-FAIL).
* **194 components** (incl. the combustion library — GRI-Mech 3.0 + Burcat sulfur/chlorine/soot-PAH/low-T/NOx families: H/O/OH/HO2/H2O2/CH/CH2/CH2_S/HCO/CH3O/CH2OH/C2H/C2H3/C2H5/C3H7 + NNH/HNO/CN/NCO/HCCO/ketene/acetaldehyde) (+ **33/41 aqueous ions** carrying a formation tier),
  **205 Henry's-law pairs**, **123 binary-interaction + 55 Pitzer pairs**,
  **4 materials**, **4 membranes**, **9 utilities** in the standard catalogue.
* **Four binaries by problem class:** `choupoSolve` (steady, F(x)=0,
  Newton-on-tears recycle), `choupoBatch` (batch dY/dt=f + recipe layer),
  `choupoCtrl` (dynamic + control loops), `choupoProps` (property eval + the
  PROPS BENCH).

**Batch campaign LEDGERS — material + energy (built 2026-07-11, forum
#99/#101/#102).**  choupoBatch carries two structured ledgers: the MATERIAL
ledger (one `TransferRecord` per material edge, per-package enthalpy at each
package's own T, MONOTONIC H-validity — a poisoned record never resurrects)
and the ENERGY ledger (one `EnergyRecord` per segment of constant physics;
kinds reaction/reboiler/condenser/latent/impulse live, sensible/mixing/
externalH/shaftWork/heatLoss reserved).  Every integral is an EXACT state
difference on the elements datum, never a quadrature (Hess collapses
per-reaction duty to Σ Δn·h(T); the still's reboiler is first-law over the
pot; the crystalliser prices Δμ3; the setParameter-T impulse is
H(n,T₁)−H(n,T₀)); `chargeFrom` solves T_mix by H-EQUALITY (fallback = molar
average, announced + drained as a named gap).  The campaign energy balance
claims a verdict ONLY when every piece is ledgered and priceable — otherwise
UNAVAILABLE quoting each `energyLedgerGap()` verbatim.  Reference cases:
recipe01 (react-then-distil, closes 6e-16), recipe02 (T-programme + impulses,
2e-15), still06/batch08 (adversarial validity).  Heat-of-crystallisation is
SHARED steady↔batch (`CrystallisationHeat.{H,cpp}`).  Phase (f) — temporal
utilities + cost — pending.

**General heterogeneous-thermo solver — SETTLED 2026-07-06 (do NOT relitigate).**
A flowsheet may run units in DIFFERENT thermo WORLDS on ONE global component set,
each unit computing in its own world via a per-unit `thermo {}` override —
including MANIFEST worlds (electrolyte Pitzer), not only flat activity/eos:
`thermoFor` routes an electrolyte override through the `ThermoPackageBuilder`
(subset-aware — it picks its active salt from the package's `chemistry.salts`,
treating other salts as spectators).  The `IsothermalFlash` LL Gibbs minimisation
restricts to the ACTIVE components (feed `z > 0`) so a sparse stream in a big
flowsheet still splits — inactive species stay 0 in both phases (mass conserved
exactly; identical to the full search when all species are active).  Reference
case: **`tutorials/plant/lithiumBrinePlant`** — a FRACTAL, WIRED plant, 5 sectors
as composite boxes across 4 worlds (Pitzer / NRTL LLE / Gibbs / molecular), mass
closes on every element.  Cases are SELF-CONTAINED via a SEALED `constant/propertyData/`
snapshot (`bin/choupo-import` materialises the dependency closure + a per-record
sha256 manifest; the runtime is FORBIDDEN the installation catalogue when sealed;
versioned `Choupo-2607` per `data/standards/CATALOGUE.dat`).  Full state:
`memory/universal_solver_2026_07_06.md`.

**Stream-state directories + topological drill-in — RATIFIED 2026-07-06 (the
constitutional spine; do NOT reopen the ontology unless a concrete case proves
the contract fails).**  A stream's STATE lives in its OWN file on disk,
OpenFOAM-style — never inside `flowsheetDict`.  `flowsheetDict` declares the
TOPOLOGY; the state directories carry the NUMBERS: **`0/`** (COMPLETE initial
state, one file per stream), **`converged/`** (steady solution — not `final/`,
not numeric), **`iterations/`** (optional numerical history, NEVER physical
time), **`0.01/` `0.02/`…** (physical transient snapshots), **`design/`**
(equipment realisation), **`economics/`** (cost/value).  Rules FROZEN: the graph
is fractal (root assembles sectors + inter-sector links only); **completeness
contract** — N streams == N files in `0/`, missing/orphan is FATAL for
`choupoSolve`; **stream role is inferred from TOPOLOGY** (no producer+consumer →
inlet · producer+consumer → internal · producer+no-consumer → outlet; no
`fixed`/`guess`/boundary mini-language); inter-sector streams stored ONCE (owned
by the producing sector); **`choupo-init0`** materialises `0/` by explicit
propagation from authored inlets + required cycle-breaking seeds (incomplete `0/`
+ `choupoSolve` = FATAL; never overwrites without `--force`); **drill-in changes
the DOMAIN, not the stream** — a sector's producer leaving the domain flips the
role internal→inlet, and the child `0/` is materialised from the parent's
persisted state, **`converged/` by default, never a silent "latest"**; canonical
material blocks are **`componentMolarFlows`** or `componentMassFlows`
(flow-plus-fractions is also accepted); `componentFlows` is a legacy fluid-only
alias; process-unit ≠ physical-equipment (`designDict` maps → `design/`);
economics aggregates over DESIGNED equipment.  This RETIRES
the volatile in-memory drill-in feed injection (inherited-result/`&feeds=`) —
those were band-aids for the missing persisted-state model.  Migration: a strict
dual reader (`0/` present → read `0/` ONLY, never merge legacy `streams{}`).
Build order: (1) `0/` reader+completeness validator, (2) `choupo-init0`, (3)
migrate `lithiumBrinePlant` first, (4) `converged/` writer, (5) topological
drill-in, (6) corpus migration, (7) design/economics.  Full contract:
[`docs/architecture/stream-state-architecture.md`](docs/architecture/stream-state-architecture.md).

**Three-axiom property layout** (referenced by `docs/ai/overview.md`):
(1) INTRINSIC pure-compound props → `data/standards/components/<name>.dat`;
(2) PAIR-dependent (NRTL/Wilson/Henry) → `data/standards/<feature>/<pair>.dat`;
(3) EQUIPMENT-dependent kinetics → case `constant/`;
(4) SAMPLE-specific measured data → case `constant/components/<name>.dat`
(`Database` overlays it field-by-field over the standard entry).

The full capabilities narrative — props bench, recycle solver, energy streams,
heat/utility credo, reports chain, fractal multi-sector flowsheets, the
database catalogue, known limitations, and the roadmap — lives in
**[`docs/engine-capabilities.md`](docs/engine-capabilities.md)**.

**Property-model architecture — SETTLED 2026-06-05, do NOT relitigate.**  Full
contract: **[`docs/property-architecture.md`](docs/property-architecture.md)**.
One-sentence stance: *property estimation is a RESOLUTION problem solved at
CURATION time (a glass-box `.dat` the student reviews + promotes), not a
calculation problem solved at runtime.*  Three layers kept apart (curated data
+ per-value provenance → existing model factories as the interfaces → curation
tools where the resolver lives); provenance at data + validation boundaries
only, never the hot path.  Rejected: structure-first/RDKit, `PropertyResult<T>`
in the solver, a runtime resolver, a parallel interface taxonomy,
C++20/CMake/Eigen/PC-SAFT/COSMO-SAC/CAPE-OPEN/open-core.

**Property architecture — FINAL / CLOSED, RATIFIED 2026-06-30 (design SETTLED, do
NOT relitigate; implementation pending).**  Canonical umbrella:
**[`docs/architecture/final-property-architecture.md`](docs/architecture/final-property-architecture.md)**
(unifies the three layers); Layer-1 data detail in
**[`docs/architecture/electrolyte-data-architecture.md`](docs/architecture/electrolyte-data-architecture.md) (data layer; earlier iterations in `docs/architecture/archive/`)**
+ its migration map.  **THE FLOW: `propertyPackage` declares → `ThermoPackageBuilder`
assembles → `ThermoPackage` computes → unit ops.**  The runtime
assembly step is the BUILDER (loads + assembles, NEVER estimates); "resolver" is
reserved for CURATION-time estimation.  The reference basis (the `ReferenceRung`)
lives INSIDE the `propertyMethod`, declared per phase — the engine reads it, never
hardcodes "aqueous".  Choupo copies Aspen's CONCEPTUAL separation, glass-box —
eight kinds: apparent components / true species / solid phases / chemistry sets /
property methods / parameter databanks / **PROPERTY PACKAGES (the CENTRE — a case
SELECTS a package, it does not merely list components)** / property sets.  The
package fixes componentApproach (apparent|true), active chemistry, per-phase
property methods, required parameter databanks, and reported property sets;
`thermoPackage` stays loadable as a degenerate `propertyPackage` (its lean
projection).  This is the DATA-layout half; `docs/property-architecture.md` is the
resolution/MODEL half; the **arity doctrine** (`docs/ai/data-doctrine.md`) and the
**`ReferenceRung`** phase-rung resolver are SLICES under it (reference selection
folds into the propertyMethod layer).  The flat-components O(1) lookup (§7 below,
2026-06-07) is preserved by `generated/indexes/`+`flatCaches/` — the apparent/true
split is SOURCE-layout, never a runtime directory-walk, so the two decisions do not
conflict.  **Phase 5 (the engine reasons apparent-vs-true) is COMMITTED** and is
what justifies any file move; build via a vertical spike (`aqueousNaCl_pitzer`,
end-to-end through all layers) BEFORE any mass migration.  **Grammar
consolidated 2026-07-04** (professors+students fora, `docs/design/thermo-grammar-*`):
per-GROUP reference rungs within a phase (A1), vapour/transport as method slots
(A2), declared+verified parameters (A3); families implemented: electrolyte.*,
activity.*, `solution.henryDilute` (KK/KI Henry); the five legal axes of
heterogeneous thermo = models/PHASE, conventions/GROUP, correlations/COMPONENT,
parameters/PAIR, packages/UNIT — one Gibbs surface per phase, never two.  Rejected: the
"subtract / freeze the core" counter (the complexity is irreducible thermodynamics
— EXPOSE it cleanly in explicit files, don't hide it in overloaded components).

---

## 7. Database catalogue (summary)

`data/standards/` holds the FROZEN, committee-managed reference tree:
`components/` (194), `materials/` (4: carbonSteel/SS304/SS316/aluminium),
`membranes/` (4: SW30HR seawater-RO, NF270 loose-NF, NF270_dspmde, CMX_AMX
ion-exchange), `utilities/` (9: steam
LP/MP/HP, coolingWater, chilledWater, dowthermA, hitecSalt, refrigerationPG,
electricity), plus pair catalogues (`binaryPairs/`, `henry/`, `unifac/`).  The
engine REFUSES to write under `data/standards/` — new data is a curation act.

**Two data tiers only — `standards` (public) and `local` (private); the
public `proposed` tier was RETIRED 2026-07-13 (do NOT reintroduce it).**  The
old `data/proposed/` was a *versioned, public* lower-trust staging tier — which
is exactly what created the third-party-redistribution problem (bulk
ChemSep/DECHEMA values sitting in the public repo).  It is replaced by
`data/local/`: a **gitignored, private** working tier.  The public repo ships
`data/local/` EMPTY (`README.md` + `.gitkeep`); the runtime reads it when
present.  Data is therefore either **curated + public** (`data/standards/`) or
**yours + private** (`data/local/`) — no public middle tier.
Precedence (both components and NRTL/UNIQUAC/Wilson pairs):
`inline / case-local / snapshot > standards > local > idealDefault` — the case
always overrides; among the shared catalogue **standards beats local** (local
fills gaps).  A `local` consumption is announced `[local] UNVERIFIED` and
transported in result provenance.  The importer (`bin/curate/chemsep_to_choupo.py`)
and `fitParameters` proposals write to `data/local/`.  Original third-party
databanks live under `thirdParty/` (also gitignored); the public repo
redistributes NO third-party values — for compounds beyond the curated
standards it ships Choupo's OWN open group-contribution estimates under
`data/groupEstimative/` (Joback / Lee-Kesler, flagged as estimates), never
third-party databank values.  Never mix those ownership boundaries.

* **`components/` stays PHYSICALLY FLAT — do NOT relitigate (settled 2026-06-07).**
  The loader resolves `components/<name>.dat` by EXACT NAME (`Database.cpp`,
  O(1) path concat, replicated across the tools); category (solid/fluid/family)
  already lives INSIDE each `.dat` (`role`, `gibbsFormation.phase`), and a
  species can be e.g. solid AND fluid — so no single folder is its true home.
  Browsability is a VIEW problem (a generated `INDEX.md` + an optional,
  absence-tolerant `tags ( … );` field), not a storage problem, until well past
  1000 files.  Never move files into `components/<phase>/` subfolders (it breaks
  the by-name lookup) and never add a startup directory-walk.

Full field-by-field catalogue (what each `.dat` carries, the utility lineup,
pseudo-components) → [`docs/engine-capabilities.md`](docs/engine-capabilities.md)
§8; case-author view → [`docs/ai/components.md`](docs/ai/components.md).

---

## 8. Tutorials

`listCases` enumerates all 148; `runCase tutorials/<category>/<name>` runs one.
The annotated index of what each demonstrates →
**[`docs/tutorials-catalogue.md`](docs/tutorials-catalogue.md)**.

---

## 9. Known limitations (traps)

* **LL flash for symmetric γ-models** would collapse to the K=1 saddle via
  Newton/SS — the `IsothermalFlash` LL path uses direct Gibbs-energy
  minimisation (Nelder-Mead, multi-start) instead.
* **3-phase VLLE flash** verified after a multi-start seeding fix
  (`pushDerivedStart` in `IsothermalFlash.cpp`); finds 3-phase coexistence
  when it is the Gibbs-global minimum (`vlle03_audit_artificial`).
* **NRTL distillation through an azeotrope** is unstable in Wang-Henke
  (bubble-point) — select `method simultaneous;` (rigorous MESH Newton) for
  azeotropic systems.  Wang-Henke stays the default for ideal systems.
* **Bubble-point distillation is slow** (O(100-500) outer iterations);
  `simultaneous` converges in ~5-6 Newton iterations.

Full diagnoses → [`docs/engine-capabilities.md`](docs/engine-capabilities.md) §9.

---

## 10. Conventions for AI assistants working on this code

### Two AI audiences — two docs

- **`CLAUDE.md`** (this file) — for an LLM editing the SOURCE CODE.
  Architecture, conventions, decisions made.
- **`docs/ai/` (+ `AGENTS.md` at root pointing in)** — for an LLM helping a
  USER author a case.  Small files (overview, dict-syntax, case-layout, thermo,
  unit-ops, components, patterns, pitfalls); `bin/llmctx` concatenates them.

When working on source code, **don't duplicate** case-authoring content into
CLAUDE.md — put it under `docs/ai/`.

### Pedagogical mindset, not industrial

The user is **Vítor Geraldes**.  Every change is judged on: (1) pedagogical
clarity — can a student read the code and understand?; (2) source transparency
— no hidden magic, macros, autogen; (3) licence purity (see the CODE-vs-DATA
split below).

**Licence policy — CODE vs DOCS vs DATA (clarified 2026-06-18, do NOT relitigate).**
* **CODE:** GPL-3.0-or-later. Dependencies should be permissive unless Vítor
  explicitly accepts the GPL compatibility and redistribution consequences.
  LGPL/GPL libraries are not added casually; this project favours readable,
  local C++ over dependency expansion.
* **DOCS / MANUALS:** the guides/manuals under `docs/` are a separate
  documentary work authored, curated, and editorially maintained by Vítor
  Geraldes and Pedro Mendes (except the Developer Guide, authored by Vítor
  Geraldes alone). Their prose, figures, and explanatory text are
  CC BY-SA 4.0. Code excerpts, Choupo case files, and other machine-readable
  examples included in the guides remain GPL-3.0-or-later. Do not put the
  manuals under GPL wholesale, and do not treat external project contributors
  as guide authors.
* **DATA** (`data/standards/` `.dat`, vendored case data): the repo is
  **multi-licensed by component** — each data file/folder may carry **its own open
  licence, INCLUDING copyleft / share-alike** (CC-BY-SA, GPL-as-data, etc.).
  Bundled data is **aggregation**, not a derivative of the GPL-3.0-or-later code, so it does
  NOT infect the code; the data keeps its licence (honour attribution + share-alike
  on *that* data).  Ship a per-source licence manifest + NOTICE.
* **Excluded regardless of copyleft** (these are NOT copyleft issues): **NonCommercial**
  (CC-BY-NC, e.g. CAS Common Chemistry — restricts commercial use, against Choupo's
  free-for-commercial ethos) and **no-grant / all-rights-reserved** (NIST SRD/WebBook,
  Engineering Toolbox, DIPPR, Yaws, CRC, REFPROP — nothing to honour).  Also watch
  **provenance laundering** (copyleft data that secretly contains proprietary data).
* Cite the **PRIMARY** source per value, never the aggregator's arrangement.

### Decisions already made — do not relitigate

* **C++17, no external libs.**  No Boost/Eigen/Sundials — hand-rolled Newton,
  Gauss, RK4, Michelsen.
* **Make + custom rules.**  No CMake (`make/compiler.mk` + `rules.mk`).
* **GPL-3.0-or-later source-code licence (settled 2026-06-18); documentation manuals under CC BY-SA 4.0.**
  Contributors keep their copyright (`AUTHORS`, source headers, DCO sign-offs,
  and git) for code, cases, tests, models, and executable examples; inbound =
  outbound under GPL-3.0-or-later — **no CLA, no copyright assignment, no
  commercial dual-licence**.  The guides/manuals are Vítor Geraldes + Pedro
  Mendes only.  The *Choupo* name/marks are separate (no
  open-source licence grants trademark) — trademark of **TalentGround Lda.**,
  INPI PT Classes 9+42.  **Do NOT add** a CLA, commercial/dual-license, or
  closed proprietary modules.  Value is reputational/pedagogical, not
  commercial.  Detail: [`CONTRIBUTING.md`](CONTRIBUTING.md),
  [`TRADEMARKS.md`](TRADEMARKS.md).
* **Brand / NAME CASING — SETTLED 2026-06-04, do NOT reopen.**  Three registers
  by surface: **`CHOUPO`** (uppercase) = visual product brand on BRAND/UI
  surfaces (logo, banner art, GUI navbar/TopBar wordmark, splash, homepage
  hero); **`Choupo`** (initial cap) = PROSE (README, docs, comments, commit
  messages, licence text — never `CHOUPO` in running prose); **`choupo`** /
  `CHOUPO_*` = CODE conventions (binaries, `Choupo::` namespace,
  `CHOUPO_HOME`/`CHOUPO_VERSION` macros).  "Choupo" is a word (the poplar),
  not an acronym — prose takes a single capital; the acrostic is a decorative
  backronym, not the origin.
* **File-first case layout** — dicts everywhere; **never** YAML/JSON/TOML.
* **Explicit factory pattern, no auto-registration.**
* **One binary per problem class** (steady root-finding vs DAE-with-control vs
  recipe-driven batch vs property eval).  Do **not** split *within* a class for
  numerical-strategy variants (no `flashFoam`/`cstrFoam`); all strategies
  (Newton, Wegstein, RK4, Nelder-Mead, …) coexist inside each binary, selected
  via dicts.
* **No silent crutch (numerical honesty) — decided 2026-05-30.**  Every solver
  aid (initial guess, tear estimate, bound) is first-class, explicit in the
  dict, and the student's to own; the solver **announces** what it does to
  converge, never disguises it (the anti-ASCEND stance).  Auto-init is allowed
  but honest (propagate the *feeds* through the topology, never a magic
  universal constant); bounds are optional aids that **report aloud when they
  bind**; reject the universal solve-everything solver (that is the
  equation-oriented dream deferred in the roadmap).  Box: *all models are
  wrong, some are useful.*

* **Fractal units + the MODEL-BOUNDARY rule — SETTLED 2026-06-08, forum 5/5, do
  NOT relitigate.**  The flowsheet is fractal (composite sectors nest leaf
  units); `flattenNode` collapses the tree to ONE flat solver problem with
  `plant.sector.unit` names — the hierarchy is authoring/namespace only, never a
  recursive solver-within-a-solver.  Per-unit `thermo {}` REPLACES models, keeps
  components global (`thermoFor`).  Standalone "run one unit with frozen inlets"
  is a GUI 1-unit-case construction (`unitFocus.ts`), NOT a native solver mode.
  **THE RULE: `H` is the conserved truth, `T` is the model-dependent readout.**
  A model boundary is NOT a physical device, so there is no real ΔT to absorb —
  H-continuity is a CONVENTION, not a law.  **Default stays hold-T / let-H-jump**
  (the discontinuity is VISIBLE in the printed enthalpy).  A silent "hold H, flex
  T" is REJECTED (it hides energy in an invisible T-nudge that biases recycles —
  worse than the honest jump; and eNRTL↔NRTL has no common composition basis).
  The honest feature is an opt-in **model-boundary AUDIT**: print `ΔH =
  H_down−H_up` at fixed (T,P,z) (kJ/mol + kW), sum into a "model-inconsistency"
  line in the first-law ledger, **hard-refuse across any phase/vf/speciation
  flip**.  Unit layout is FLEXIBLE — both forms are first-class (Vítor 2026-06-08):
  a unit may be INLINE in the parent `flowsheetDict` (light cases) OR carry its
  OWN dignified folder (`system/` + `constant/`) — the author picks per case, the
  engine runs both, and there is NO forced mass-migration of existing flat
  tutorials.  Dignity is for ALL units (any unit is ENTITLED to a folder, never
  "earned" — Vítor OVERRULED the forum's "earned/inline-by-default"); the
  all-folders form is the standard for research / multi-scale-debug cases.  A
  unit's `constant/` is its local-data HOME (measured props, kinetics, PSD
  accumulate there), inheriting the case `thermoPackage` via the cascade until
  something local lands — *the house waiting for the data*, not ceremony: its
  `README` states the folder's PURPOSE, never just "inherits via cascade", and it
  must NOT carry a `thermoPackage` placeholder (that shadows the case default and
  breaks the run).  The inheritance cascade must be LOUD (per-unit `thermo:
  inherited (global)` vs `LOCAL override — …`, implemented in `runUnit`).  Full
  rationale: the `fractal-dignified-units-2026-06-08` memory +
  [`docs/ai/energy.md`](docs/ai/energy.md) §model boundaries.

### Things to NEVER do

* **Never** suggest a Python rewrite or wrapper.
* **Never** add macro magic for self-registration (RTS-style macros).
* **Never** import a heavy CFD framework or any heavy dep.
* **Never** joke about "$N in tokens replacing commercial software" — taken as
  a flippant signal.
* **Never** skip alignment when proposing architecture changes — make a
  proposal, wait for confirmation, then code.
* **Never name Aspen (or any commercial competitor — HYSYS, ProSim, DWSIM,
  gPROMS, ChemCAD…) in the USER-FACING MANUALS** (settled 2026-07-03, Vítor).
  This covers everything a user reads: the `docs/` guides (`theoryGuide`,
  `tutorialsGuide`, `explorerGuide`, `propsGuide`, developer guide), tutorial
  `controlDict`/`flowsheetDict` header comments and `description` strings, the
  tutorials catalogue, and GUI-visible copy.  Describe the *concept*
  generically instead — "commercial process simulators", "a detailed
  exchanger-rating tool", "the standard/industrial design workflow", "detailed
  design / detailed rating" (not "EDR Design/Rating"), "a black-box tool".  Do
  NOT carry a competitor trademark attribution in a manual's front-matter (if
  it is never named, none is needed).  Source-code comments and git commit
  messages are developer-facing, not manuals — a passing Aspen reference there
  is tolerated, but prefer the generic phrasing there too.

### When proposing features

Frame around: Pareto (20 % effort → 80 % value); pedagogical visibility (what
does the student SEE?); differentiation (don't reproduce what breadth-first
tools do better — focus on customisation, sensitivity, optimisation, exotic
domains like membranes).

### When implementing

* **Backwards-compat is mandatory** — existing tutorials must keep passing.
  Run the full regression after every meaningful change:
  ```bash
  bin/runTests                 # every tutorial, all four binaries + buildCode
  bin/runTests tutorials/steady/flash/flash01_benzene_toluene   # one case
  bin/runTests --record <case> # refresh a case's golden-master `expected`
  ```
  `runTests` does a **NaN/inf guard on every case** (an exit-code check passes
  even on silent NaN — this caught the membrane bug) AND **reference-KPI
  comparison** for any case shipping an `expected` file.  Never reintroduce the
  bare `binary > /dev/null && PASS` check.
* **Add KPIs** when adding new unit ops (they feed sensitivity, optim, sizing,
  costing).
* **Update this CLAUDE.md** when adding a major capability (and the relevant
  doc under `docs/`).

---

## 11. Quick reference

| Common operation | Where |
|---|---|
| Run a case | `runCase tutorials/<category>/<name>` (auto-dispatches by `application`) |
| List tutorials | `listCases` |
| Full regression | `bin/runTests` |
| Materialise a case's `0/` | `bin/choupo-init0 <case>` (propagates from authored inlets + tear seeds; `--force` regenerates estimates; refuses $variable streams{}) |
| Build / debug / clean | `make all` / `make MODE=debug` / `make clean` (current) · `make distclean` (all) |
| List available unit-op types | `UnitOperation::availableTypes()` (in code) |
| Vary a value in `flowsheetDict` programmatically | `dict.setScalarAtPath(path, v)` |
| Path syntax | `units[0].operation.refluxRatio` or `reactions.myRxn.kinetics.A` |

---

## 12. Web GUI (`gui/`)

The browser front-end (React + React Flow + Plotly + Vitest), runs
`choupoSolve` and `choupoProps` in-browser via WASM.  **Design stance (settled
2026-05-16, codified as a Credo):** the GUI is a **runner and visualiser, NOT
an editor** — cases are authored as plain-text dicts on disk (edited with any
text editor, increasingly with LLM help).  The GUI loads the dicts, draws the
flowsheet, runs the solver, streams the log, renders plots.  ParaView-inspired
but with its OWN identity (case tree on the left, pop-outs instead of
multi-view splits).

**Before proposing ANY GUI change** (palette, tabs, panels, dialogs,
features-seen-elsewhere), read **[`docs/ai/gui-credo.md`](docs/ai/gui-credo.md)**
— the single source of truth (founding principles, deliberate adaptations vs
ParaView, consolidated patterns, anti-patterns, vocabulary, roadmap, and the
three questions to ask first).

Stack / phase status / layout / adapter pattern / dict round-trip invariant →
**[`docs/gui-internals.md`](docs/gui-internals.md)**.  Quick start:
`cd gui && npm install && npm run dev` (`:5173`); `npm test` (round-trip on all
tutorials); `npm run typecheck`; `npm run build`.

---

## 13. WebAssembly build (`make wasm`)

The WASM solver is the same C++ as the native binary, compiled with Emscripten
into `gui/public/wasm/`.  **Default rebuild is `make wasm-gui`** (= choupoSolve
+ choupoProps, the only two the GUI uses; never run two `make wasm`
concurrently — they clobber `gui/public/wasm/`).

**IMPORTANT — rebuild WASM after adding/changing a unit op.**  The WASM build is
SEPARATE from the native binary; a new built-in only appears in the browser
after `make wasm`.  Symptom of a stale `.wasm`: the GUI errors
`UnitOperation::New: unknown type '<yourType>'` though the native binary runs it
fine.  If `make wasm` says "Nothing to be done", force it:
`make wasm-clean && make wasm`.

The Emscripten 3.1.6 minifier/runtime quirks (the `run_case` C wrapper, the
`callMain`/`ENV`/`NO_EXIT_RUNTIME` traps, the UMD→ESM blob bridge, the
worker-in-`public/` rule) + all build targets + the resume-a-debugging-session
recipe → **[`docs/gui-internals.md`](docs/gui-internals.md)** §5.  Do not remove
those workarounds without re-validating.

---

## 14. Open architectural decisions

* Phase 1.5b transport for structured results: stdout markers vs MEMFS file
  written by the C++ and read back by the worker?
* Phase 2 property editors: hand-rolled per unit-op type vs schema-driven?
* Phase 4 sandboxing: container-per-run vs in-process gVisor-like?

---

*Last reviewed: 2026-06-06 — CLAUDE.md trimmed to its session-load essentials;
the capabilities narrative, tutorials index, GUI internals + WASM quirks moved
to `docs/engine-capabilities.md`, `docs/tutorials-catalogue.md`,
`docs/gui-internals.md` (property contract already in
`docs/property-architecture.md`).  Per-version history →
[`CHANGELOG.md`](CHANGELOG.md).*
