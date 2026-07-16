# The Choupo Constitution — consolidated architecture

*Authoritative, session-consolidated 2026-07-07.  This is the ONE document that
states how a Choupo case is shaped, how the engine reads it, and what every
grammar keyword means.  The deeper per-topic specs remain as references:
[`stream-state-architecture.md`](stream-state-architecture.md),
[`final-property-architecture.md`](final-property-architecture.md),
[`electrolyte-data-architecture.md`](electrolyte-data-architecture.md).  Where any
of those disagrees with this document, THIS document wins.*

The spine of Choupo is one idea repeated at every level: **the plain-text files on
disk are the single source of truth; the topology, the state, the numerics, and the
thermodynamics each live in their OWN file, and every role is INFERRED, never
re-declared.**  No backward-compatibility shims — the forms below are the only
forms.

---

## 1. Case layout

```
case/
├── <shortName>.cho          the openable entity (GUI); may hold GUI-only metadata
├── system/
│   ├── controlDict          meta-control: application, verbosity, description, reports
│   ├── flowsheetDict        TOPOLOGY ONLY — members + named-edge connections
│   ├── solverDict           NUMERICS — tear designation, recycle solver/tol/maxIter  [opt]
│   ├── outerDict            outer driver (sweep / optim / fit / PE)                   [opt]
│   └── postDict             post-processing chain (sizing, cost)                      [opt]
├── constant/
│   ├── propertyDict         the case's OWN declarative thermodynamics (SELF-CONTAINED)
│   ├── propertyData/        SEALED dependency snapshot (bin/choupo-import)            [opt]
│   ├── components/          case-local component overlays                            [opt]
│   ├── electrolyte/         case-local ion / pair overlays                           [opt]
│   └── reactions            named-reaction library                                   [opt]
└── 0/                       the COMPLETE initial stream state (committable INPUT)
```

Output directories the solver WRITES (never authored, `iterations/` gitignored):
`converged/` (the steady solution), `iterations/NNNNNN/` (numerical history +
`iterations/latest`), `0.01/ 0.02/ …` (physical-time transients), `design/`,
`economics/`.

A unit op is entitled to its OWN dignified folder (`<unit>/system/` + `<unit>/
constant/`), inheriting the case `propertyDict` + `controlDict` through the cascade
until it lands something local (e.g. `recovery/` carrying its own NRTL model + pair
data).  A dignified folder is a first-class alternative to an inline block; the
author picks per unit.

---

## 2. Flowsheet grammar — `flowsheetDict` is TOPOLOGY ONLY

A `flowsheetDict` declares WHAT is connected to WHAT.  It carries no stream state,
no boundary lists, no numerics.

### 2.1 Members: `units` and `sectors`

| keyword     | members are…                                   | naming     |
|-------------|------------------------------------------------|------------|
| `units`     | unit OPERATIONS (a `type` + `operation`)       | lowercase  |
| `sectors`   | composite SUB-FLOWSHEETS (their own units/sectors) | UPPERCASE |

* `units ( { type flash; operation {…} } … )` — INLINE unit blocks (a small flat case).
* `units ( cryst1 cryst2 recovery )` — bare names = DIGNIFIED unit ops in folders.
* `sectors ( BRINE EXTRACTION CARBONATION )` — bare names = composite sectors in folders.

`units` and `sectors` may BOTH appear.  The engine flattens every folder member the
same way; the keyword is the author's SEMANTIC label (a plant has *sectors*; a
flowsheet has *units*), and a member's real kind is read from its OWN dict — a leaf
`type` is a unit, an inner `units`/`sectors` is a sub-composite.  **`crystalliser09`
is `units ( cryst1 cryst2 recovery )` — three unit operations, not sectors.**  The
whole tree is flattened to ONE flat solver problem (`plant.sector.unit` names); the
hierarchy is authoring/namespace only, never a solver-within-a-solver.

### 2.2 Connections: NAMED graph edges

A physical stream is a NAMED graph edge with ONE stable identity:

```
connections
{
    liquor1     { from cryst1/motherLiquor;  to cryst2/liquor1; }
    finalLiquor { from cryst2/motherLiquor;  to recovery/finalLiquor; }
    feed        { to cryst1/feed; }            // to-only  = inlet
    stillage    { from recovery/bottoms; }     // from-only = outlet
}
```

* the connection KEY is the stream ID (**== its `0/` state filename**);
* `from`/`to` are producer/consumer PORTS — `unit/port`, where `port` is the unit's
  REAL producedStreams name (crystalliser → `crystals`/`motherLiquor`; column →
  `distillate`/`bottoms`), never the case-level stream name;
* **ROLE is inferred from topology**: `to`-only → inlet · `from`+`to` → internal ·
  `from`-only → outlet.  There is NO `boundary{}` — direction is a graph fact.

### 2.3 Recycles / tears

A recycle is ONE named edge like any other (producer downstream, consumer upstream).
That it is a TEAR — assumed + iterated — is a NUMERICAL property declared in
`solverDict`, never a graph pseudo-node:

```
// system/solverDict
tearStreams   ( recoveredEthanol );
recycleSolver Newton;   recycleTol 1e-5;   recycleMaxIter 150;
```

A recycle listed in `tearStreams` is torn exactly ONCE (declared + auto-detection
are de-duplicated).  An honest recycle Newton recovers from a temporary infeasible
trial (see §6).

---

## 3. Stream state — `0/` and the OpenFOAM-style directories

**State lives in its OWN file on disk, one per stream, never inside
`flowsheetDict`.**

* **`0/`** — the COMPLETE initial state (one file per graph stream), the committable
  INPUT.  **Completeness contract**: N graph streams == N files in `0/`; a
  missing/orphan file is FATAL for `choupoSolve`.  Inter-sector streams are stored
  ONCE (owned by the producing sector).  Materialised by `choupo-init0` (propagate
  authored inlets + required cycle-breaking seeds); a tear carries its seed here.
* **`converged/`** — the steady solution (solver output, not `final/`).
* **`iterations/NNNNNN/`** — optional numerical history + `iterations/latest`; NEVER
  physical time.  The per-iteration SolutionWriter writes HERE, never `0/`.
* **`0.01/ 0.02/ …`** — physical transient snapshots (choupoBatch/choupoCtrl).

`0/` is committable (un-gitignored) precisely because solver output moved to
`iterations/`.

### 3.1 Stream grammar (a `0/` file)

Several natural MATERIAL forms — the author picks one, a second is a FATAL conflict:
`componentMolarFlows` / `componentMassFlows` / `molarFlow`+`moleFractions` /
`massFlow`+`massFractions`.  Overall-vs-phase-resolved: a `phases{}` block
decomposes the overall material and sums back to it exactly (a `solid` phase rides
along a crystalliser/dryer stream, PSD persisted).

Thermodynamic state = **T and P** (a TP flash resolves the split).  `vaporFraction`
is written ONLY when non-zero (a liquid vf=0 is the implicit default; a vapour/
two-phase stream carries it as the phase seed) — never a decorative `0`, never a
`derived{}` second layer, no PH/PS/TQ/PQ closure axis.

---

## 4. Property architecture — `propertyDict` + SELF-CONTAINMENT

**A case declares its OWN thermodynamics in `constant/propertyDict` — every case is
declaratively self-DESCRIBING (inline manifest, no shared selector).  A case is
runtime self-CONTAINED only once SEALED**: `bin/choupo-import` materialises the
closed dependency snapshot into `constant/propertyData/` (289 inline manifests vs
5 sealed snapshots in the corpus, 2026-07-16).  For an unsealed case the runtime
legitimately resolves components / methods / chemistry / parameters from
`data/standards/` (versioned `Choupo-2607`); for a sealed case the catalogue is a
CREATION/IMPORT-time resource only, not a runtime dependency.

```
constant/propertyDict          declares components / chemistry / propertyMethods (INLINE,
   │                           no `package <name>;` selector, ZERO data/standards paths)
   ▼
ThermoPackageBuilder           resolves records from constant/propertyData/ + local overlays
   │                           (loads + assembles; NEVER estimates — that is curation-time)
   ▼
constant/propertyData/         SEALED snapshot: manifest.dat (release + per-record sha256)
   │                           + components / species / chemistry / phases / parameters
   ▼
ThermoPackage  →  unit ops     (units know ONLY the ThermoPackage — never file paths)
```

* `bin/choupo-import <case>` materialises the closed dependency snapshot into
  `constant/propertyData/` and seals it.  When present, the runtime reads the frozen
  copy and the log states *"installation catalogue NOT consulted"*.
* **The definitive test**: move the case out of the repo / delete `data/standards/`
  entirely — a sealed case MUST still assemble and run.  `choupoSolve` enters the
  case dir BEFORE constructing the Database, so a sealed case skips the catalogue-
  root requirement.
* Do NOT copy the whole catalogue — import a CLOSED, explicit snapshot
  (reproducibility, not duplication).

The five legal axes of heterogeneous thermo: **models per PHASE · conventions per
GROUP · correlations per COMPONENT · parameters per PAIR · packages per UNIT** — one
Gibbs surface per phase, never two.  A per-unit `thermo{}` override REPLACES the
models for that unit (components stay global).

### 4.1 Model boundaries — H is conserved, T is the readout

What a stream transports is STATE (T, P, composition), NOT a thermo model.  Each
unit recomputes enthalpy in its OWN model, so two adjacent models can legitimately
report DIFFERENT enthalpies for the same state.  The model-boundary AUDIT surfaces
that ΔH:

* it fires only where a stream ACTUALLY carries a species that changes speciation
  (van't Hoff ν > 1, e.g. KCl → K⁺+Cl⁻) — a purely molecular stream (ethanol/water)
  shares one reference across worlds, so its ΔH is well-posed (not flagged);
* a COMPUTABLE boundary contributes to an explicit *model-inconsistency* line in the
  first-law ledger; a genuine speciation change where the two references are
  incommensurable is noted calmly (ΔH not carried across), never faked and never an
  alarm — the global balance is honest, not silently violated.

---

## 5. Layers & binaries

```
OuterDriver     src/outerDriver/     sensitivity / optim / PE / fit — reruns the pass
Simulator core  src/{thermo,solver,streams,unitOperations,flowsheet}  Flowsheet → SimulationResult
PostProcessor   src/postProcessing/  sizing / costing / reporting — augments after a pass
```

Four binaries by problem class: `choupoSolve` (steady, F(x)=0, Newton-on-tears),
`choupoBatch` (batch dY/dt + recipe), `choupoCtrl` (dynamic + control), `choupoProps`
(property eval + the PROPS bench).  One binary per class — never split within a class
for a numerical-strategy variant.

---

## 6. Solver honesty

* **No silent crutch.**  Every aid (initial guess, tear seed, bound) is first-class
  and explicit; the solver ANNOUNCES what it does to converge and never disguises it.
* **Recoverable trial-domain failure.**  A unit handed a physically infeasible TRIAL
  point (a column whose bottoms B = F−D−draws ≤ 0) throws a typed `InfeasibleTrial`.
  A probing solver RECOVERS — a finite-difference Jacobian falls back from central to
  a one-sided difference, a line search shortens the step — never a hard throw, never
  a 1e30 penalty, never a silent clamp.  An ACCEPTED/base state that is infeasible is
  still fatal (real error vs recoverable probe).

---

## 7. Conventions (non-negotiable)

* **Naming**: `sectors` UPPERCASE (BRINE), `units`/unit-ops lowercase (cryst1);
  streams are edge names; a purely-numeric sector name is refused (collides with
  instant dirs).
* **Files, not YAML/JSON/TOML.**  Hierarchical plain-text dicts; scalars carry units
  (named / bracket-dimensions / raw SI), cross-checked to canonical SI.
* **No backward compatibility** in the forms above — `streams{}`, `boundary{}`,
  anonymous `connections( )`, `children`, `propertyPackage`/`thermoPackage`, and
  `derived{}` are GONE, not deprecated-but-read.
* **Explicit factory pattern**, no auto-registration.  **C++17, no external libs.**
  **Make**, not CMake.  **GPL-3.0-or-later** code; the *Choupo* name is TalentGround
  Lda.'s trademark, separate from the code licence.

*All models are wrong; some are useful — and Choupo shows you which, in the source
AND in the run.*
