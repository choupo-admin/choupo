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

* **Pedagogy** — undergraduate chemical engineering.  A "glass-box"
  alternative where every equation, every Newton iteration, every K-value is
  visible in source AND run-time output.  (This file used to name a specific
  course here.  It named the WRONG one -- that course is CFD, not process
  simulation -- and the wrong name had been copied into the guides, the
  AI-facing docs, five deliberation records and about twenty tutorial
  headers before anyone read it back.  Corrected 2026-08-12.  No course is
  named in its place: the audience is the discipline, not a timetable slot.)
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
└── tutorials/                  runnable cases by application field (see §8; the
                                COUNT is generated -- generated/releaseInventory.json)
```

### Git & release conventions

* **Never `git add -A`.**  Stage explicitly per file; keep run outputs and
  editor / auto-saved files out of commits.
* **Git identity: the AUTHOR is the copyright holder; the COMMITTER is
  whoever applied the commit** (ruled 2026-09-04, Vítor).  Git carries two
  identities and they answer two different questions, which this line used to
  conflate:
    - `author` = **`Vítor Geraldes` / `talentgroundlda@gmail.com`**.  This is
      the copyright record — the one `AUTHORS`, the source headers, the DCO
      sign-offs and §1 all follow.  It is NEVER rewritten to a tool's
      identity, and `git commit --amend --reset-author` (which would) is
      exactly the flag to avoid.
    - `committer` = the identity of whoever/whatever applied it.  For an
      assistant working in a managed container that is
      `Claude <noreply@anthropic.com>`, because GitHub verifies a signature
      against the COMMITTER and the container's signing key is registered to
      that identity.  A commit whose committer does not match its signing key
      shows as "Unverified" — a cosmetic failure, but one that recurs on every
      push and invites the wrong fix.
  Setting both to the tool would erase the authorship of a GPL project from
  its own history to silence a badge; setting both to the human leaves every
  commit unverifiable.  The split is the honest reading of what each field
  means, and it satisfies both.
* **No `Co-Authored-By` trailer** in commit messages.
* **Version** lives in `src/core/Banner.H` (`CHOUPO_VERSION`), `CITATION.cff`,
  and `CHANGELOG.md` — bump them together when tagging a release.
* **Branches & tags (revised 2026-07-29 — this SUPERSEDES the two-branch
  arrangement of 2026-07-20).**  **The default branch IS the development
  line**: `main` carries `Choupo-dev`, continuously updated, no pre-announced
  target version.  A release is an **immutable tag** `vYYMM` (public name
  `Choupo-YYMM`, internal version `YYMM`) — NEVER deleted, moved or reused; a
  `release-YYMM` branch is cut **from that tag only on the day a patch
  actually ships**, never pre-emptively.  **ONE EXCEPTION HAS BEEN TAKEN, and
  it is RECORDED rather than hidden (2026-09-02, Vítor's decision):**
  `v2607`, the first release, was WITHDRAWN — tag, GitHub Release and site
  entry — because it was too rudimentary to be what a student meets.  The
  rule is not weakened by it, because what makes a tag immutable is that
  somebody may have RELIED on it, and that window closes and never reopens:
  the exception was available for seven weeks and is not available again.  A
  withdrawal is not an erasure of the record — the CHANGELOG keeps 2607's
  section, marked WITHDRAWN and **unbracketed** so `release_inventory.py` can
  never announce it again.  Do not take a second exception without Vítor's
  explicit decision, and never for a release anyone could have cited.  Two
  loose ends were RULED on 2026-09-03: `data/standards/CATALOGUE.dat` now
  names `Choupo-2608` (the catalogue the maintained release shipped), while
  the 394 sealed manifests KEEP `catalogueRelease Choupo-2607` — the
  catalogue identity a seal records is the catalogue AS IT STOOD when the
  case was frozen, and the tree has moved since, so relabelling them would
  claim a freeze that never happened (the ruling is written in
  CATALOGUE.dat's own header); and `paper/README.md` states that both
  artifacts were written against 2607, since withdrawn, and must be re-read
  against 2608 before submission.
  **A SECOND EXCEPTION WAS TAKEN, of a different kind, and it is RECORDED
  the same way (2026-09-03, Vítor's decision: "one release, one tag"):**
  `v2608` was MOVED, from the commit it was cut at to the commit of its
  packaging patch `v2608.1`, and the patch tag and `release-2608` branch were
  deleted — a FOLD, authorised only by a line in `docs/folded-patches.txt`
  and executed only by `fold-patch.yml`, which verifies both commits against
  the remote and refuses anything else.  Why the immutability argument did
  not bind: the tag's first commit built a frozen app that was a shell around
  the live engine, so nobody ever RAN Choupo-2608 at that commit, and the
  moved tag names exactly the commit the published `/v2608/app/` copy was
  built from.  That window closes for any release whose own copy has been
  served correctly; a fold is not available then.  Release procedure:
  [`RELEASING.md`](RELEASING.md).
  Why the change: the earlier layout froze `main` at the last release and did
  the work on `dev`.  OpenFOAM.org — the model it claimed to follow — does the
  opposite, and checking rather than remembering settled it: one repository per
  version line (`OpenFOAM-dev`, `OpenFOAM-13`, `OpenFOAM-12`, …) and in **every
  one of them the default branch is that line's own**.  No repository anywhere
  in that project holds "default = frozen release, side branch = the work".
  Two lessons, and both apply here: the development line owns the default
  branch, and a release is **maintained**, not photographed.  The old layout
  also duplicated the release: `main` and `v2607` were meant to be the same
  thing, and by today `main` had already drifted 3 commits past the tag — the
  arity sin, in the repository's own structure.
* **Starting a dev session?** Read [`DEV.md`](DEV.md) — current state,
  the settled contracts, the roadmap, and how to work.  It is the live
  starting point (companion to `RELEASING.md`).

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
│   ├── thermoPhysPropDict  the thermophysical system (v2 grammar)
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
  `controlDict`, `flowsheetDict`, `constant/thermoPhysPropDict`, and a complete `0/`
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
├── Simulator core       src/{thermo, solver, streams, unitOperations (incl. flowsheet/)}
│   ONE pass:  Flowsheet → SimulationResult (streams + KPIs).
│
└── PostProcessor         src/postProcessing/
    (sizing, costing, reporting)  Augments / reports after a pass.
```

`main.cpp` is a thin orchestrator: (1) load `controlDict`, `flowsheetDict`,
`thermoPhysPropDict`; (2) if `outerDict` → instantiate driver, hand it the simulator
functor, loop; (3) else → one pass + (if `postDict`) the post-processor chain.
The simulator functor is just `runSimulation(flowsheetDict,...)` — a pure
function, used by both the direct path and every outer driver.

### Source tree

```
src/
├── core/                Dictionary, Types, Constants  (SimulationResult moved to result/, 2026-08-05)
├── streams/             ProcessStream  (T, P, F, z, vf — what travels between units)
├── thermo/              Component, ThermoPackage, Database, phase/, vaporPressure/,
│                         activityCoefficient/, equationOfState/, heatCapacity/,
│                         membrane/ (Membrane + MembraneRegistry)
├── materials/           Material + MaterialRegistry (reads the flat
│                       data/standards/assets/ home, kind constructionMaterial)
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
├── outerDriver/         OuterDriver abstract + SweepDriver + GridSweepDriver
│                         + ParetoSweepDriver + OptimizationDriver (Nelder-Mead)
│                         + DesignSpec   (fitBinaryPair is RETIRED: factory throws,
│                         naming choupoProps `fitParameters`)
├── postProcessing/      PostProcessor abstract + SizingPass + CostingPass
│   ├── sizing/                   EquipmentSize abstract + StirredTank + ShellTubeHX
│   └── costing/                  CostingModel abstract + Guthrie
├── propertyOps/         PropertyOperation abstract + the props BENCH ops (choupoProps)
├── reporting/           BalanceMath + the mass/element/energy balance reports
├── result/              the pipeline's OUTPUT records — SimulationResult,
│                         UnitProfile, ResultEmitter (2026-08-05 layering slice)
├── io/                  SolutionWriter — the OpenFOAM-style state directories
├── curation/            BESIDE the stack, never in it: a tool may read the
│                         runtime, NOTHING in the runtime may read a tool
└── applications/
    ├── choupoSolve/main.cpp     steady-state binary
    ├── choupoBatch/main.cpp     batch / time-dependent binary
    ├── choupoCtrl/main.cpp      dynamic continuous + control binary
    └── choupoProps/main.cpp     property evaluation + the PROPS BENCH
```

---

## 5. Conventions

### Language — **the repository is English (US)**

**All repository artifacts are English: code, comments, identifiers, test
and gate names, commit messages, documentation.  This holds regardless of
the language used in conversation.**

Settled 2026-08-04.  Conversation with a maintainer may be in any language;
what lands in the tree may not.  The reason is not style — it is that a
contract nobody can read is not a contract.  This project's architecture
lives in prose (the settled sections here, `docs/architecture/`, every
refusal message), and a reader who cannot read that prose cannot check
whether the engine honours it.  A gate named in one language and a contract
written in another cannot be audited together.

Three things are NOT covered by this rule, and must stay as they are:

* **Proper nouns** — `Vítor Geraldes`, `TalentGround Lda.`, and *choupo*
  itself (the poplar).  A name is not text to be translated.
* **Third-party legal text** — `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES`,
  anything under `thirdParty/`.  Retranslating a licence changes it.
* **Git history** — commit messages already written stay written.  The rule
  binds what is authored from here on, not the record of what was.

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
* Compile cleanly with `-Wall -Wextra -Wpedantic` — **checked** by
  `check_compile_clean` on every full `bin/runTests`, because this line
  had gone quietly false (eight warnings on 2026-08-14, one of them a
  `-Wmisleading-indentation` on unconditional statements that read as
  guarded).  `make STRICT=1` makes warnings fatal and remains the
  complete check; the gate is the affordable one (`-fsyntax-only`, so no
  optimiser-only warnings).

### `controlDict` entries

`application` (word, which binary), `description` (string, run-header label),
`verbosity` (int, default `3`).  Verbosity: `0` silent · `1` +warnings ·
`2` +summary · `3` info — *Newton iterations visible* (pedagogical default) ·
`4` debug.

### Heat of reaction — ONE enthalpy base (settled 2026-06-27, do NOT relitigate)

The heat of reaction is **always** the elements/formation datum:
`dH_rxn(T) = Σ νᵢ·hᵢ(T)`, where each `hᵢ` carries `ΔHf°(elements, 25 °C)` from the
species' `standardThermochemistry{}` block — in **every** reactor, steady
(`conversionReactor` / `cstr` / `pfr` / `gibbsReactor`) AND time-dependent
(`batchReactor` / `dynamicCSTR`).  Every reacting species needs `standardThermochemistry`.
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
**NEVER** written as a component-level `standardThermochemistry` block — that is a SECOND
source of truth that silently drifts (the arity-1 sin; *trees never store
derivatives*).  The crystalliser's **heat of crystallisation reads
`dissolutionEnthalpy` directly** (single-sourced; the `dHcryst 0.0` placeholder
is gone — a real, ion-derived duty even unfitted/mixed-solvent), and
`bin/curate/check_ion_pins.py` **EXITS 1** if any component carrying
`dissolutionEnthalpy` also carries `standardThermochemistry`.  A **nonvolatile salt must
NEVER route its enthalpy through the ideal-gas reference** (`h_pure_ig` /
`idealGasHeatCapacity`) — it takes the solid/aqueous rung.  Property-architecture
(curation-time resolution) is for a MISSING datum; this one is present-via-
derivation, so single-source (arity-1) controls.  Full rationale:
[`docs/ai/energy.md`](docs/ai/energy.md) (the 2026-06-29 deliberation that
settled it was a session forum and is NOT in the repository -- this
paragraph and that doc are the record).

### Aqueous chemistry: declared by the case, read by the units (settled 2026-07-25/26, do NOT relitigate)

The `equilibrium { aqueous { activityModel {…} speciation {…} } }` block is
readable with ANY formulation (it left `electrolyteGammaPhi`'s ownership) --
a liquid-only electrolyte case declares its chemistry there.  A model's name
may appear in exactly THREE places: the case declaration (process units READ
it or refuse -- `ThermoPackage::speciateAqueous()` / `speciator()`; no unit
constructs chemistry or defaults a model), a props-BENCH op (the model is the
experiment's subject), or a model-prescribed internal (DSPM-DE's Davies,
announced).  Solid phases: `constant/chemistryDict` says WHICH exist; the
unit only holds policy (`reportMinerals`).  Gates: check_no_unit_chemistry,
unit-chemistry in runTests.

### THE TWO BASES, on EVERY stream the package can resolve (settled 2026-07-31)

Where the package resolves ions, a stream carries BOTH bases: the apparent
components (which ARE the state) and the `speciation {}` decomposition — **the
INLET included**, because a feed nobody speciates is exactly the stream a
student compares an outlet against.  The rule is the ARCHITECTURE's, not the
reactive path's: the post-solve pass was written inside
`if (hasReactiveEquilibrium())`, and a molality model (Pitzer / eNRTL)
**resolves ions without carrying an equilibrium NETWORK**, so every
crystalliser and evaporator brine in the corpus reported its apparent salt and
not one ion while the reactive flashes reported both.  Without a network the
block is COMPLETE DISSOCIATION through each component's declared bridge
(`network ( completeDissociation ); basis stoichiometric;`, **no pH** — there
is no H+ network to solve one from and a neutral 7 would be a number with no
model behind it).  It decomposes the LIQUID: a precipitated crystal stays in
the solid phase (dissolving `s` there is the flash16 error).  The READER
verifies `m = A n` against the SAME declared bridges, so the block closes by
construction; a case with neither a network nor any declared bridge is refused
(names that answer to nothing).  A molecular case gets NO block — one basis is
its whole structure.

**THE REDUCED-IDENTITY RULE, generalised (it has now cost two bugs, one field
apart).**  `Component::identity()` mints a salt with name + MW + role, and the
electrolyte builder used it and stopped there — so EVERY fact the record
declares beyond those three was silently absent at run time.  Two were, and
both surfaced as the engine reporting a datum "missing" that its own input
declares: `dissociatesTo` (no ions on any brine stream) and `formula` (the
element balance publishing `refusedSpecies.NaCl,"no molecular formula
declared"` about a record that says `formula NaCl;` three lines from the MW the
same call had just read).  So: **a component minted by `identity()` must be
handed every declared fact it will be asked for**, through the record it was
minted FROM — `readIdentity()` and `readAqueousMapping()`, ONE parse each, two
callers each, never a second copy of the parse.  When you add a field the
runtime reads off a Component, ask whether the electrolyte salt can reach it.
(A component that genuinely has no such fact — a petroleum cut with no
molecular formula — keeps its honest refusal; the rule is about DECLARED facts
being dropped, never about inventing one.)

The other corollary, also paid for: a writer whose output the reader refuses is
a bug in BOTH.  Gate: check_both_bases (2 fired refusals + the negative +
the element-balance verdict).

### Typed identifiers + the F2 rename (EXECUTED 2026-07-26, three-way ratified)

`ComponentId` / `SpeciesId` / `SolidId` (core/Identifiers.H) are strong types
with NO implicit conversion; the component->species crossing goes ONLY through
the declared stoichiometric bridge (`aqueousMapping (…)` on the component, or
`dissociatesTo` converted at load -- NEVER name identity).  The F2 campaign is
DONE: p/m charge mangles are gone (CaOH, FeOH3, MgSO4_2), redox is roman
(FeII/FeIII, CuI/CuII, MnII/MnIII), chemistry/ files are named by REACTION
(`CaOH-formation.dat`, `CO2-dissolution.dat`, `water-dissociation.dat`),
identity has ONE home (species/ file XOR inline `z`/`ion`), and all sealed
cases were re-imported.  The `aq` suffix STAYS (interim lexical-disambiguation
rule: a derived neutral homonymous with a component -- CaCO3aq vs the salt
CaCO3 -- while RECORD references are bare strings); removal waits for typed
record references, and typed means END-TO-END (ratified 2026-07-26): the
typing must survive intact from the loader to the runtime with NO
intermediate conversion through bare strings -- data files gaining typed
references alone does NOT unlock removal.  Gates: check_species_identity, check_aq_disambiguation,
check_typed_identifiers.

### ThermoResolver / SystemClassifier (RATIFIED three-way 2026-07-26, do NOT relitigate)

Components are classified from CANONICAL RECORD FACTS -- never from names,
never from ad-hoc case lists (`spectators`/`molecularVolatiles`/
`nonreactiveMolecularComponents` were all REJECTED).  The substance-level
fact is **`aqueousSpeciation none|<setName>;`** (participation in the aqueous
EQUILIBRIUM SPECIATION network only -- vapour reactions like the acetic dimer
stay on the gas-liquid records, phase purity); ABSENT = UNKNOWN, refused
inside an electrolyte system with the curation remedy.
`src/thermo/SystemClassifier` classifies (solvent = the DECLARED
`aqueous { solvent ...; }`, default water -- no `if (name == "water")`
anywhere); the reactive builder announces every `[resolver]` conclusion,
verifies the persisted declaration and refuses impossible ones.  The
recommended package is PERSISTED in the case (`bin/choupo-resolve [--draft]`
is where the recommendation is born; the runtime NEVER chooses freely).
Approximations are DELIMITED per component -- `approximations {
idealMolecularVLE { components ( ethanol ); } }` -- authorisation is the
block's presence, applying it to anything unlisted refuses, listing anything
the classifier did not find nonionising refuses.  The molecular backbone
(solvent + nonionising co-volatiles, ion-free x-basis) has TWO declared
routes: the authorised ideal (gamma = 1) and **composite mixed-solvent electrolyte v1**
(`activityModel { ionic davies; molecular NRTL; }`, built same-day on
Vitor's order): the FULL curated NRTL pair prices the backbone (never a
clandestine gammaInfinity constant), the solvent activity decomposes
multiplicatively (a_w = gamma_w*x_w * aw_ionic -- no double counting), ions
stay Davies on water-referenced molality and the network K's stay
water-referenced (the transfer term is the NAMED next slice).  An
authorisation may not shadow a declared model (refused).  The TWO-PHASE
reactive Newton is general (ln V + softmax vapour odds, n volatiles), the
acetic vapour dimer re-weights the vapour balance (v = t_mono + 2 t_dim)
with its association heat priced exactly into the duty.  Gates:
check_resolver_coherence.  Reference cases:
`flash12_nh3_acetic_ethanol_reactive` (ideal authorised, subsaturated) vs
`flash13_acetic_ethanol_vacuum_flash` (NRTL backbone, V/F 0.58 -- the gamma
is the difference between a flash and no flash).

### The SECOND LIQUID on the reactive path — SOLVED 2026-07-27 (do NOT relitigate the shape)

Chemistry and two liquids AT ONCE: the reactive path carried one liquid, the
molecular path carried two and no chemistry, and the fork is now closed.  A
case declares `equilibrium { organic { solvent …; members ( … ); activityModel
…; reason "…"; } }`; the split resolves INSIDE each residual evaluation of the
outer vapour Newton (mathematically simultaneous, numerically nested — the same
posture as the speciation), by a Newton on the equality of ACTIVITY
`ln(γ_org x_org) = ln(γ_aq x_aq)` to 1e-13.  **Gibbs DECIDES, the Newton
SOLVES** — a Nelder-Mead answer is noise under the outer FD Jacobian.  Both
liquids MUST share the molecular model (two models make the residual measure
their disagreement, refused).  **The split does NOT change the stream table**:
the two liquids leave as ONE apparent liquid, internal state like the ions,
so the outer Newton keeps its dimension and the no-organic path is
byte-identical.  Phase appearance/disappearance is an OUTER decision, tested
on the feed, re-tested at the answer, announced both ways, with later passes
CONTINUING from the previous one; a trial that does not admit the phase set
being solved is reported unphysical (no silent fallback to one liquid — that
reports a one-liquid answer under a two-liquid declaration).  Three numerics
fixes rode with it and matter to every reactive case: the per-component cage
was a CEILING at `0.9995*n` (a component that must almost entirely vaporise
could not reach its answer, and the flat residual reads exactly like a
rank-deficient Jacobian), the saturation pre-check computed Σp_eq on ONE
liquid when two were declared (benzene at 16 atm instead of 0.23), and the
seed set the vapour RATIO but never the AMOUNT — now Rachford-Rice on the
equilibrium K's runs beside the flat 2 % seed and **the better of the two
starts the Newton** (neither dominates).  Reference case:
`flash17_two_liquids_reactive` (V/F 0.324, organic 1.68 % of the backbone
liquid at 96 % benzene, pH 2.89, |r| 2e-15).  Full record incl. the three
failed designs: [`docs/design/reactive-second-liquid-proposal.md`](docs/design/reactive-second-liquid-proposal.md) §14.
**The organic may be WET (2026-08-10, §15 of the same record):** the aqueous
solvent may be a declared member — its equality carries the ionic a_w factor
(γ_org·x_org = γ_aq·x_aq·a_w,ionic, the multiplicative decomposition across
the split), molality stays on the aqueous water alone, and the split ⇄
speciation pair is resolved jointly inside each residual (dry paths
byte-identical).  With the solvent a member, |f| gains two trivial
attractors (clone manifold + all-organic cap corner, both at |f| = |ln a_w|
with singular Jacobian), so the seed comes from a Gibbs grid + Nelder-Mead
descent — Gibbs decides, the Newton solves.  Witness
`marcilla01_lls_tie_triangle` (primary-anchor contact, Marcilla 1995): brine
+ solid halite reproduce; the organic vertex does NOT — the corpus UNIFAC is
the VLE table and keeps water/1-butanol miscible at 25 °C — a recorded,
never-tuned finding pinned both ways by `check_marcilla_lls` (its stale-pin
arm fires the day a curated LLE set opens the gap).  Also paid for there:
the speciation γ fixed point gained an announced oscillation guard (Davies
out-of-band drives a period-2 I limit cycle around a genuine fixed point),
and a SPECTATOR master (a fully dissociated salt's free ion, referenced by
no equilibrium) is verified against the species catalogue
(`SpeciationSolver::chargeOf`, now on the provider surface) — the old check
passed only while an unrelated databank record happened to reference Na.

### Equilibrium-parameterisation identity — D2 migration EXECUTED 2026-07-26 (do NOT relitigate)

Identity is per curated PARAMETERISATION; the physical family is DERIVED
from typed references (`gasSpecies`/`dissolvedSpecies`/`solvent`) + a
versioned immutable convention profile (`conventions/Sander-Hxp-v1`,
`PHREEQC-gasMolal-v1`) — full ADR
`docs/design/equilibrium-parameterisation-identity.md`.  The CLOSED
migration is DONE: all 205 `parameters/Henry/` pairs typed
(`bin/curate/migrate_henry_identity.py` — deterministic, idempotent,
fail-closed, explicit exception table for reactive/acid/base solutes,
NEVER name/formula similarity), the 9 chemistry gas-liquid records are
canonical `schemaVersion 2` (legacy `gas`/`dissolved` keys are GONE from
the dev corpus).  The loader keeps a legacy adapter STRICTLY at its
boundary (converted in memory, announced `[legacy] … re-import
recommended`, never written back); `check_legacy_schema` refuses legacy
schema anywhere in standards or sealed mirrors.  Cross-convention
comparisons are curation DIAGNOSTICS (independent primaries = finding;
same-source disagreement = the only error).  The D6 review dossier
(`bin/curate/interim_review_dossier.py` → `generated/interimReviewDossier.md`)
carries coverage + per-point validity marks; INTERIM promotion is Vítor's
primary review ALONE.  The transfer-term contract (D3) is
`docs/design/standard-state-transfer-adr.md` — contract only, no
implementation authorised.

### COSMO / VT-2005 licence separation (EXECUTED 2026-07-26)

The public tree ships NO VT-2005 values: every set is an external REFERENCE
(`licence externalRestricted; installed false;` + full citation).  The user's
own copy installs via `bin/choupo-import-cosmo` into `data/local/cosmo/`
(gitignored); absent, CosmoSac refuses by name with the install command.
cosmoSAC01 regresses on SYNTHETIC teaching surrogates (labelled GPL).
Gate: check_cosmo_scrub (0 restricted values, enforced).

### Electrolyte activity selector keys — `pitzer` ≠ `pitzerHMW` (settled 2026-06-29, A3, do NOT re-clash)

Two DIFFERENT Pitzer engines now carry two DISTINCT factory keys (the old
`pitzer` name-collision across two factories is gone):
* **`pitzer`** = `ElectrolyteActivity`, the salt-level single-salt VLE adapter,
  selected `activityModel { model pitzer; }` in a **thermoPhysPropDict** (eNRTL next).
* **`pitzerHMW`** = `PitzerHMW`, the per-ion multi-ion Harvie-Møller-Weare
  speciation engine, selected `activityModel pitzerHMW;` in a **propsDict
  `speciate`** op (vs `davies`).

The molality+charge surface is a PURE INTERFACE (`ElectrolyteModel`) reached via
`ThermoPackage::electrolyte()` / `ActivityModel::asElectrolyte()` — there is **NO**
`electrolyteModel {}` case block and **no RTTI downcast** in the package (the
construction-time configure downcasts were removed in A1; the engine query is the
`asElectrolyte()` virtual, A2).

### NORMALIZED RESIDUAL — one convergence home (ruled 2026-08-09, do NOT relitigate)

A dimensional residual is a MAGNITUDE, not a verdict: `1e-9` on a raw `||r||`
is a number compared with nothing.  `src/solver/Convergence.H` is the ONE
home — the OpenFOAM triple (`tolerance` · `relTol` · `maxIter`, declared per
solver in `system/solverDict`, e.g. `reactiveEquilibrium { … }`), the ONE
normalization, and the ONE decision (`normFinal <= tolerance` OR
`normFinal/normInitial <= relTol`, subject to `maxIter`).  The normalization
is OpenFOAM's `normFactor` with **cells → equations** and **{Ax, b} → the
terms the equation balances**: `normFactor = Σ|t − mean(t)| + floor`,
`normalized = Σ|r_k| / normFactor`.  Same structure, same intent, **NOT the
same theorem** — the header states three limits rather than claiming identity,
and the one that bites is that a SINGLE-equation system degenerates
(`normFactor ≡ |r|`), which is DETECTED and falls back to the raw residual
naming the criterion.  A solve reports FIVE numbers (raw initial/final,
normalized initial/final, reduction) plus the criterion that decided;
defaults are ANNOUNCED when used, and an unimplemented declared control
REFUSES by name.  Two things paid for: acceptance now requires the
convergence verdict (the per-leg joint check alone would wave a run that
never met its DECLARED tolerance through as a silent pass), and a golden that
pinned a **one-nanowatt** re-flash duty at 1e-4 relative was pinning
cancellation round-off (`column13`, re-recorded with the measurement that
shows it).  Wired: `ReactiveVLE`'s outer Newton.  NOT wired, each with its
reason (§4 of the ADR): `IsothermalFlash`, `SpeciationSolver`'s inner Newton,
`DistillationColumn`'s MESH.  Gate: `check_convergence_residual`
(sabotage-verified twice).  Record:
[`docs/design/normalized-residual-convergence.md`](docs/design/normalized-residual-convergence.md).

### A THIRD aqueous activity engine: `edwardsPitzer` (2026-08-04)

Beside `davies` and `pitzerHMW` sits **`edwardsPitzer`** — the truncated Pitzer
expansion of **Edwards, Maurer, Newman & Prausnitz, AIChE J. 24(6):966-976
(1978)**, selected `activityModel edwardsPitzer;` in a **propsDict `speciate`**
op or declared `model EdwardsPitzer;` in a case's `aqueousProperties`.  It is
here because neither of the other two can serve a sour-water fluid: Davies is
charge-only and returns **exactly 1** for any neutral solute at any ionic
strength (so it cannot express salting-out at all), and PitzerHMW is a
DIFFERENT truncation with a different parameter set — using Edwards' numbers
inside HMW's equation would be quoting him under someone else's model.

**The layering is the point, and it is enforced by the file split.**
`EdwardsPitzer.{H,cpp}` is a PURE kernel: it computes Eqs 8/9/10 from a
parameter set handed to it, reads no files, and is verified against two closed
forms the paper supplies.  `EdwardsCatalogue.{H,cpp}` is the CURATION
arithmetic — Edwards measured ONE family (beta0 for like molecule pairs, Eq 14 /
Table 4) and **estimated everything else** by Eqs 21/22/23/24 — plus the
registered `EdwardsPitzerModel` adapter.  *The tree never stores a derivative*,
so no estimated pair is written to disk; each is derived at assembly and
**ANNOUNCED with the rule that produced it** (four of the five rules are
estimates, and a reader must be able to tell which is which).  `beta1` is never
an independent datum here: Eq 24 correlates it from beta0, and it is 0 on every
pair involving a molecule.

**Records** live under `data/standards/parameters/EdwardsPitzer/` and are keyed
by the **runtime species name** (`CO2aq.dat`, `mi-NH3aq-NH4.dat`), never by a
name a lookup would have to strip a suffix from — that would be the name-identity
crossing the F2 contract bans.  `Trange` is CHECKED where the record is read;
extrapolation is announced and the run continues.

Two traps this slice paid for, both worth generalising:

* **An ActivityResult outlives the frame that made it**, so its closures must be
  SELF-CONTAINED.  The kernel captured names and molalities by value and the
  parameter set by reference; the asymmetry was invisible until a caller built
  the model as a temporary, and then it segfaulted.
* **A banner keyed on one model and defaulting for the rest describes a model
  that is not running.**  The speciation banner was a two-way switch on
  `pitzerHMW`, so Edwards inherited Davies' sentence — and both halves of it
  were false (the "I ~ 0.5" band is Davies' own; the "a_w from phi = 1" claim
  was contradicted by the run's own a_w).  Each model states its OWN scope.

Gate: `check_edwards_model` (reachability through the engine, the neutral gamma
with its exactly-1 Davies negative, all five rules announced, Eq 24 recomputed
from the printed beta0, the banner).  Reference cases:
`tutorials/props/electrolyte/edwards01_sour_water_activity` — a STRUCTURAL
witness only; no number in it is validated against measurement — and, since
2026-08-23, **`edwards02_table7_vle`**: the Table 7 comparison itself, the
vapour side built as the speciate op's `vapour {}` block (Eqs 5/6/11 over the
solved speciation; `fugacity ideal;` REQUIRED — the paper's own φ model is
not transcribed), the carbamate curated case-locally, 18 anchor rows against
the paper's prediction column I with bands sized to the measured residual
(P within 3.2 %, the molecular molalities within 10 %, the residual
concentrated where the carbamate share is largest and bracketed by a
carbamate-free sensitivity op).  Record:
`docs/design/sour-water-stripper-scope.md` §6c.

**THE SEAL MUST NOT CHANGE THE PHYSICS — and the importer now PROVES it, not
merely that the case runs (2026-08-04).**  Adding an activity model without
teaching `bin/choupo-import` about its parameter home broke exactly that
invariant: the first sealed `edwards01` kept 9 of its 28 pair parameters (the
Bronsted like-sign zeros, which need no record) and answered with 19 terms
missing — it RAN, it CONVERGED, and it reported two identical monovalent gammas
and two neutral gammas of exactly 1, which is what a *Davies* run prints.
Nothing refused.  The importer's own validation passed it, because that
validation asked whether the staged case RUNS.  **Running is not agreeing.**
`validate_staged_agrees` now compares the staged sealed run against the case's
own `expected` golden with runTests' tolerances and REFUSES with the likely
cause named, installing nothing; a case with no golden yet keeps the exit-code
check and is TOLD its answer is unverified.  Catching it via the corpus golden
one step later was luck: a case sealed BEFORE its golden was recorded would
have frozen the damaged answer as the reference.  When you add a record home a
model reads, add it to the importer's closure in the same commit.

### Electrolyte data tree — 5 HOMES, NO `apparent/`, NO `true` (SETTLED 2026-07-01; the count corrected 2026-07-28, do NOT relitigate the layout)

A substance's ROLE (lumped / dissociated / multi-ion / molten) is chosen by the
declared `thermoPhysPropDict` a case carries — **never stored on the substance** — via two
ORTHOGONAL axes: **REPRESENTATION** (the declared system activates: lumped → complete
dissociation → partial/ion-pair → multi-ion) × **REFERENCE** (the method selects
one of 4 discrete rungs: solid · pure-liquid Raoult · aqueous-inf-dilution ·
fused-salt Temkin; mixed-solvent = aqueous + a transfer term in `parameters/`, NOT
a 5th rung).  The same Na⁺ is aqueous-ref dissolved / fused-ref molten → `species/`
is **medium-agnostic** (one file), the method picks the rung; molten salt is just
another method, no special case.  **5 homes** — verify against `ls
data/standards/` before quoting this list, it has drifted once:
`components/` (identity **+ `dissociatesTo`** = formula-like ion stoichiometry,
NOT the "saco"; **and the substance's own `solidPhases{}`** — ρ_p, k_v and the
dissolution equilibrium of *its own* solid) · `species/` (model species +
charge, medium-tagged `…Thermo{}`) · `chemistry/` (**FLAT**, no subfolders:
REAL equilibria w/ K+ΔH that couple TWO families — dissolution, association) ·
`parameters/` (per-model pair tables) · `conventions/` (the versioned immutable
convention profiles the D2 identity references) — plus the property PACKAGE,
which is not a directory at all: the manifest that SELECTS everything lives
INLINE in each case's `constant/thermoPhysPropDict` (the shared
`data/standards/propertyPackages/` catalogue + `package <name>;` selector were
retired 2026-07-15, every case is self-contained).  **`methods/` and
`phases/solid/` are RETIRED** — no such directory exists; a phase's reference
rung is a consequence of the declared formulation (the one-knob rule) and solid
particle data sits in the component's `solidPhases{}`.  The engine keeps a
LEGACY `phases/solid/<phase>.dat` read for old external cases; do not write
one.  (`propertySets/` was deleted 2026-07-01 — zero readers.)  **ONE component
= ONE file: `components/apparent/*` is DELETED** (the builder reads salt
identity+`dissociatesTo` from `components/` and the solid from that component's
own `solidPhases{}`);
**"true" is DEPRECATED as a substance or basis name** (ruled 2026-08-05 —
`apparent` STAYS, it is an accepted architectural term with a precise meaning
in electrolyte thermodynamics; it is "true" that misleads, because a student
reads a philosophical claim where the code means *the species the equilibrium
solver works in*).  Write **species**, or the concrete category — *aqueous
species* / *gas species* / *solid species* (`recordType modelSpecies`,
method `requires.ionSpecies`); gate `check_glossary_bans`; **NO top-level `basisMaps/`** (it is the K→∞ limit of
dissociation + is per-(component,method)).  Rejected: two `NaCl.dat`, per-medium
species duplication, mixed-solvent as a 5th rung.  Full contract + the 10 validating
systems + implementation status (F1–F4 done, 202/0 byte-exact):
[`docs/architecture/electrolyte-data-architecture.md`](docs/architecture/electrolyte-data-architecture.md).
Supersedes the `basisMaps`/`apparent-true` layout in the older
`docs/architecture/{aspen-like-data-architecture,data-ontology}.md`.

---

## 6. Current state (summary — detail in docs)

* Release counts are GENERATED — the single source of truth is
  `bin/curate/release_inventory.py` → `generated/releaseInventory.json`
  (consumed by the homepage + `/models`; a `runTests` gate fails when stale).
  Do NOT hand-maintain these numbers — and that includes HERE.  This file used
  to carry its own copy of the tally and it drifted (41 aqueous species when
  the tree held 51, 194 components in §7 against 247 in §6): a second home for
  a derived number is the arity sin, and a doc is not exempt from it.  Read
  `generated/releaseInventory.json`, or run `bin/curate/release_inventory.py`.
  What is stated below is the SHAPE of the corpus, never its size.
* **Runnable tutorial cases** under `tutorials/{steady,batch,ctrl,props,plant,electrochem}/`;
  `bin/runTests` VERIFIES them via golden-master KPI + NaN/inf guard + the
  doctrine + release-inventory gates (0 FAIL, 0 KNOWN-BROKEN; deliberate EXPECTED-FAILs).
* The standard catalogue carries components (incl. the combustion library —
  GRI-Mech 3.0 + Burcat sulfur/chlorine/soot-PAH/low-T/NOx families), aqueous
  species/ions (one `recordType modelSpecies` file per species,
  `species/<name>.dat`), Henry's-law pairs, a small set of public
  binary-interaction pairs (NRTL/UNIQUAC — the bulk moved to `data/local` in
  the legal scrub) plus Pitzer and eNRTL pairs, unit-operation models,
  materials, membranes and utilities.
* **Four binaries by problem class:** `choupoSolve` (steady, F(x)=0,
  Newton-on-tears recycle), `choupoBatch` (batch dY/dt=f + recipe layer),
  `choupoCtrl` (dynamic + control loops), `choupoProps` (property eval + the
  PROPS BENCH).

**A RESULT BLOCK THE GOLDEN FORMAT CANNOT READ ARRIVES UNPINNED (2026-08-12).**
An unreadable block does not fail — it just stops being checked, silently,
with the suite green; so when you add a top-level result block carrying a
number a reader would act on, add the row kind that reads it IN THE SAME
COMMIT (published ⇒ pinned AND pinned ⇒ published).  Gates:
`check_overlay_aad_pinned` · `check_closure_ledger_pinned` ·
`check_utility_allocation_pinned`.  Record:
[`docs/design/which-result-blocks-a-golden-can-read.md`](docs/design/which-result-blocks-a-golden-can-read.md).

**THE `aad` ROW (2026-08-12).**  An overlay's AAD against a MEASURED dataset is
pinned by an `aad` kind row (`aad <dataset> <model>.<property>.<statistic>`),
auto-generated in `--record`; they are self-recorded rows, never `anchor` rows
— what they pin is that the agreement has not MOVED.  Gate:
`check_overlay_aad_pinned`.  Record:
[`docs/architecture/verification-and-validation.md`](docs/architecture/verification-and-validation.md) §3b.

**THE HONESTY SLICE — twelve gates in one day (2026-08-05), and what building
them found.**  Three audits (arity, silent fallbacks, provenance) were acted
on end to end.  The engine changes are small; the pattern is the point, and it
is now doctrine (`project-philosophy.md` §3a, invariant I1):

* **The arity doctrine covers DECISIONS, not only values.**  The forward
  reaction `order` had FIVE readers with FIVE defaults, and a reactant with no
  declared order silently left its own rate law (exponent 0) — exit 0,
  plausible number.  One home now: `Reaction::forwardOrder`, refusing by name.
  The *reverse* order defaults meaningfully because detailed balance fixes it;
  the forward one is a fact about the MECHANISM and is not derivable.
* **A CHECK THAT CANNOT RUN MUST NOT PASS.**  Found twice in one day:
  `bin/buildSite` WARNed and published when `pdftotext` was absent (so the
  guide-version gate never ran in CI, the only place that publishes), and
  `check_true_ions` reported PASS on every run while both its inputs had been
  deleted — a permanently-green gate is worse than none.  The first refuses
  now; the second is retired.
* **A field the engine cannot see is a comment.**  67 records carried
  `PROPOSAL TIER -- UNVERIFIED` in a banner the parser discards, including 7
  of the 16 in `cavett01`, the flagship external-reference case.
  `reviewStatus` is parsed and ANNOUNCED now (`[unreviewed]`, beside `[local]`
  and `[estimate]`).
* **A declared validity window was parsed and DISCARDED.**  `PolynomialCp`
  assigned `Tmin_`/`Tmax_` and never read them, so I4 was unimplemented on the
  commonest Cp path — which is why six inverted windows did no visible harm.
  *Harmless-because-unchecked is not safety.*
* **K_b is DERIVED, and the derivation is OPT-IN.**  `R·Tb²·M/ΔHvap` from the
  record's own inputs; the declared value stays as a validating anchor.  The
  first version derived for every solvent and gave BPE to a case that models
  without it — an absence must keep meaning what it meant.
* **FOUR hand-compiled counts were wrong**, in both directions — the uncited-
  species list was short by one, the unargued-founding-decision list long by
  three, the upward-edge and cycle counts both short, the crossing-`../` count
  short by one.  *A measurement taken once and then remembered is a derived
  fact with a second home.*  The live numbers live in the gates that recount
  them, and are deliberately not repeated here.

**What was deliberately NOT done, and why it is the substantive half:** four
NEVER-list records, the NF270 40× contradiction and eighteen missing citations
are PINNED, not fixed.  Inventing a citation converts *unsourced* into
*falsely sourced*, which no reader and no gate can detect.  **A visible gap is
strictly better than an invisible falsehood.**  Every pin list fails if a name
is removed without the record being fixed.

Gates: `check_forward_order` · `check_review_status` · `check_ebullioscopic` ·
`check_cp_range_announced` · `check_column_datum_downgrade` ·
`check_glossary_bans` · `check_species_citation` · `check_source_licence` ·
`check_validity_windows` · `check_record_self_consistency` ·
`check_economics_honesty` · `check_layering`.  All sabotage-verified; three
state coverage they do NOT have, because a gate that implies more is worse
than one that reports less.

**EVERY MANUAL GATE READS THE SOURCE; THE TREE SHIPS THE RENDER (2026-09-03).**
`check_doctrine`, `check_guide_paths` and `check_lesson_symbols` scan `.tex`;
a reader opens the committed `.pdf`, and the two are the SAME CLAIM only while
the render is fresh.  `check_guide_pdf_version` cannot see the gap (a stale
render of a `Choupo-dev` source still prints `Choupo-dev`), so
`check_guide_pdf_fresh` decides it by git ancestry over each guide's own
`\input` closure, and refuses a top-level `docs/*.pdf` that no Makefile rule
builds — **a sourceless binary is outside every source gate at once**, which is
how a withdrawn v0.2.0 guide naming two competitors survived the doctrine rule
that banned them.  Rebuild with `make -C docs all` and commit the PDFs beside
the sources that moved.

**THE RECORD A STUDENT PROMOTES MUST CARRY WHAT THE RUN CONCLUDED
(2026-09-03).**  `fitParameters`' promotable pair `.dat` printed the evidence,
the held-out AAD, the band declared before the fit and the verdict, and then
wrote a file naming none of them — with the ORIGIN word (`source fitted;`) in
the slot that says where the DATA came from, which `PairAudit` reads as a
LEGACY source word and deprecates.  Now: `origin`/`method`/`methodVersion`
typed INSIDE `provenance {}` (the axis is a RESPONSIBILITY, not a nesting
level — a first draft put `origin` at top level, ran, and resolved
`unattributed` silently), the evidence with each role and the partition
fingerprint, and a `validation {}` block with the verdict.  The write MOVED
after the held-out pass, because the verdict does not exist before it.  Found
on the way: `ResultEmitter` emitted three keys BY HAND beside the ONE shared
formatter that emits them (duplicate JSON keys on every pair), and a
`.gitignore` rule outlived its directory rename by seven weeks.  NOT done: the
~95-value corpus migration, which no record authorises.  Gate:
`check_promoted_pair_record` (5 sabotages; the artefact is rebuilt, never
tracked — its `fitDate` would go dirty daily).  **Slice 2, same day, one
artefact along: the SCREEN must carry what the FILE declares.**
`estimateComponent` writes per-value provenance (`origin`/`method`/
`methodVersion`/`inputFingerprint`/`uncertainty`) and NOTHING read it, so a
generated component drew in the Explorer exactly like a curated one — while
the inspector's own model had carried an `estimate` mark kind that was never
constructed anywhere.  The rule is STRUCTURAL on both sides (a sub-dict that
declares `origin`; a field-name list would be a second home for the engine's
vocabulary).  The writer is C++ and the reader TypeScript, and the GUI tests
run on a TRANSCRIPTION because the generated file is gitignored — so the gate
RUNS the generator and holds that transcription to it.  A reader sabotage
SURVIVED first contact (every sub-dict in the fixture already declared
`origin`, so the guard had no case); the fixture now carries a `validity {}`
block beside a real one.  Gate: `check_estimate_visible`.  **Slice 3: THE CURATION DOSSIER WAS WRITTEN
IN A GRAMMAR NO DICT PARSER HERE ACCEPTS** — a keyword-prefixed named block
(`property <name>` then `{`) and the domain's COORDINATE LABEL sitting in the
unit slot (`min 0.05 x1;`).  So `promote-from-dossier` hand-rolls regexes
under a comment saying a second parser would be wrong, and the Explorer told
every reader that "no dossier is attached" about components that have three:
*an absence nobody checked is not a finding.*  The property list is now plain
dict grammar — **a LIST, not a keyed block**, because `curate01` curates
`vapourPressure` twice with opposite verdicts and a name-keyed collection
drops the `validationRefused` half (measured: 4 blocks found where 5 verdicts
are declared).  Both readers carry a count arm.  A sabotage SURVIVED TWICE:
once because it reached only a witness whose coordinate is a real unit, once
because the gate's pattern was anchored to the line start while the domain
writes its intervals inline — *a pattern anchored where its subject does not
live is a check that cannot fire.*  Gate: `check_dossier_grammar`.  Record:
[`docs/design/what-a-promoted-record-must-carry.md`](docs/design/what-a-promoted-record-must-carry.md) (§6, §7 for the later slices).

**A VERDICT PUBLISHED TO A HUMAN AND PINNED BY NOTHING (2026-09-04).**  Three
fit ops decide a CURATION verdict from a held-out pass against a band declared
BEFORE the fit; it reached the console, the dossier and the promotable record
and NOT the result JSON — so the GUI's fit panel drew the *identifiability*
verdict instead (a different question) and no golden could pin it.  Now
`PropertyOperation::curation()` — the maturity axis, as WORDS, kept apart from
`diagnostics()` (numbers) and `provenance {}` (where the data came from), and
named `curation` because `validation` already names this document's overlay AAD
table.  The decision is taken ONCE (it had three call sites, one of them inside
`if (verbosity >= 2)` — a verdict must not depend on how loudly the run was
asked to speak).  New golden row kind `verdict`, compared as a WORD with
`exact`.  Traps paid for: `--record-append` carries a hard-coded kind allowlist
that DROPS an unknown kind in silence, and drawing the five verdicts in the fit
panel made a FOURTH hand-written home for that vocabulary — added to
`check_verdict_parity` in the same commit.  NOT unified: the two op families
print the verdict in two different console shapes, recorded rather than papered
over.  Gates: `check_fit_verdict_channel` (its strongest arm requires every op
that CALLS `verdictOf` to publish one — `heatCapacityFit` has no witness and
only that arm catches it) · `check_verdict_parity`.  Record:
[`docs/design/the-verdict-that-reached-everyone-except-the-machine.md`](docs/design/the-verdict-that-reached-everyone-except-the-machine.md).

**A DRYER THAT ENDED WETTER THAN IT STARTED (2026-09-04).**  Vítor opened the
flagship plant on the LIVE SITE and saw mass not conserved; a spray dryer was
inventing water because its residual-moisture model is a RATIO carried by the
dry solid and knows nothing about how much water the feed brought, while the
only clamp protected the vapour from going negative.  Fixed and **announced**,
never silently clamped.  **The unit is one bug; the substance is three
silences** — under an `outerDict` the declared balance reports did not run (now
announced by name), the case ships no golden, and NOTHING looked at closure at
all, because a golden pins what a run PRINTS and a stable wrong answer passes
by construction.  Two durable rules came out of it: **reason from the case in
front of you, never from its twin** (I called this a GUI defect first, from the
non-sweep twin, and was wrong); and **a gate that accuses the innocent teaches
the reader to ignore it** — the first `check_mass_closure` collapsed four
states into two and flagged a closed Rankine cycle and two uncompilable
userOps tutorials as violations.  Gate: `check_mass_closure`.  RESERVED for
Vítor: whether a sweep reports on its final point.  Record:
[`docs/design/a-dryer-that-ended-wetter-than-it-started.md`](docs/design/a-dryer-that-ended-wetter-than-it-started.md).

**THE SPECIFICATION SHEET A PROJECT IS AUDITED FROM (2026-09-04).**  A student
hands in a final-year project and somebody must audit it PER UNIT OPERATION:
what goes in, what comes out, what was sized, what it costs.  Those three
answers lived in three unrelated places, none per unit and none where anybody
audits — the ports only inside `iterations/` (opt-in, off by default,
numerical history), the sizing in two flat CSVs, the cost beside it — and
`design/` was a ratified directory NAME nothing had ever written.  Now
`design/<SECTOR>/<unit>/<equipmentTag>`, ONE dictionary per physical item,
regenerated whole every run like `converged/`.  **The shape is 1:N with N = 1**,
which honours §2.8's "one unit may realise MANY items" without building the
`system/designDict` it names (no reader anywhere): a column that one day
yields five gains siblings and nothing above changes.  **The durable half is
D4, and it is OpenFOAM's rule:** an object declares its own dimensions, so
adding one touches no reader.  `EquipmentSizing::set(key, value, unit)` is the
one door; the units had been living in `//` comments and in a hand-written
table four call frames away inside the pass that PRINTS them — the fifth such
home this project has closed — and the migration found that the values are
**not all canonical SI** (`power`/`Q_kW` in kW, `pressureDesign` in bar,
micrometres, rpm; six keys carrying their unit inside the KEY NAME).  Nothing
was converted: rebasing on SI moves numbers in every golden that pins them.
**A dimensionless value declares `[0 0 0 0 0]`**, because omitting the unit
writes the grammar's raw-SI form and a reader cannot then tell a declared
ratio from a forgotten declaration — the exact ambiguity the slice exists to
end, found by the gate reporting a false positive that was really a format
defect.  Traps paid for: a port mass computed as `F * Σ z_i MW_i` **drops the
crystals** (437 kg/h on one stream, while that unit's own balance closed at
100.0000 %) — `StreamMass::F_massTotal` is the home, and its header describes
this very mistake, made before, by someone else; the first gate draft
**patched a source and rebuilt the engine**, which is the 2026-08-18
tree-poisoning shape that only `check_gate_selftest` may take, so the refusal
was fired BY HAND under the journal instead — and that firing found a SECOND
defect, a `throw` inside the per-unit loop leaving a PARTIAL tree that lies by
omission; and **`**/design/` swallows `docs/design/`**, this project's own
records, silently, for every NEW file.  The ignore rule is not tidiness: the
GUI bundle is a Vite glob that inlines every tutorial file as a raw string, so
a committable run output is one machine's stale sizing baked into the shipped
site (second lock in the glob itself).  `bin/cleanCase` would have left the
tree behind while announcing a removal count, and its `--help` printed the GPL
notice instead of the usage.  NOT done: no `designDict`, no new sizing content
(the sheet draws what `SizingPass` computes and invents no field).  **The GUI
half shipped 2026-09-05:** the Case tree is RECURSIVE (`gui/src/ui/caseTree.ts`,
pure and tested — it had grouped by the FIRST path segment and drawn the rest
as one row, on every case), collapse state is keyed on the full path (keying
on the segment folded the case's `system/` and a sector's `system/` together —
name identity, applied to a UI), and the worker harvest selects run-output
trees from ONE list (`OUTPUT_ROOTS`) instead of a hard-coded converged literal
— the literal being exactly why the sheets did not reach the browser the day
the engine wrote them.  `designFiles` is its own `RunResult` field: folding it
into `convergedFiles` would make "no sizing pass" read as "did not solve".
Gate:
`check_design_sheet` (its load-bearing arm reads `massBalance_byUnit.csv`, a
report this writer does not produce, which is what caught the crystals).
Record:
[`docs/design/the-specification-sheet-a-project-is-audited-from.md`](docs/design/the-specification-sheet-a-project-is-audited-from.md).

**EVERY SIZER STATES ITS BASIS, AND WRITING ONE FOUND A VOLUME IN KILOMOLES
(2026-09-05).**  The Reports header promised a design basis for every item
and one sizer in eight stated one.  Rule: a sizer states the rule that
produced its Guthrie size key, AT the site where the rule is applied; a
pass-through says it is one; `EquipmentSizing::basis` is the one home and
`(not stated)` stays the rendering of an empty field on every surface, so a
forgotten basis is visible rather than defaulted away.  Writing the string
for `CrystalliserSize` required reading what its inputs ARE: it multiplied
`liquorFlow` — the unit's MOLAR flow, kmol/s, labelled so in its own source —
by the residence time and called the product m³, so the flagship plant's
crystalliser was costed on a molar holdup an order of magnitude too large,
at exit 0, with a golden pinning it to four decimals.  **A golden pins what
a run PRINTS; only a recomputation from the DECLARATION can see a size that
is wrong** — the MSMPR is a rating model, so the unit now publishes its
declared volume and the sizer passes it through.  Deriving it as
`throughput × residenceTime` was rejected: it reproduces the declaration to
round-off and hides that it is one.  Gate: `check_design_sheet` arms (i)
(source: every sizer assigns `d.basis`) and (j) (a crystalliser sheet's
`V_magma` equals the case's declared `operation.volume`, read from the
dicts).  NOT gated, said plainly: whether a basis string is TRUE of its
sizer.  Record:
[`docs/design/a-basis-nobody-stated-and-a-volume-in-kilomoles.md`](docs/design/a-basis-nobody-stated-and-a-volume-in-kilomoles.md).

**A HIERARCHY THE ENGINE BUILT AND THREW AWAY (2026-09-04).**  `flattenNode`
knows each leaf's owning sector exactly — `nsPrefix` IS the parent chain — and
it concatenated that into the qualified name and kept only the string, so
every reader downstream got a flat list of dotted names.  The sector now
TRAVELS AS DATA (`FlatUnit::sector` → `EquipmentSizing` → `CostBreakdown`),
stamped once at the flatten seam: recovering it downstream by splitting the
last dot is **name identity**, right on today's corpus and silently wrong for
the first unit whose name carries a dot for another reason.  The design table
groups by sector, both CSVs carry the column, and the costing console
subtotals capital per sector with each one's share of C_TM.  **EMPTY IS NOT A
SECTOR CALLED "root"**: a flat case gains no key, no banner, no column and no
block, and that was verified byte-identical against a build of the previous
commit rather than argued.  Gate: `check_sector_hierarchy` — its strongest arm
is a SOURCE arm, because no output arm can tell a correct stamp from a correct
split.  RESERVED for Vítor: making the `design`/`economics` REPORT KINDS run by
default (they are declared in `controlDict`'s `reports {}`).  Not affected by
the 2026-09-04 specification sheets, which ride the `sizing {}` PASS in
`postDict` instead.
Record:
[`docs/design/the-hierarchy-that-only-existed-in-the-name.md`](docs/design/the-hierarchy-that-only-existed-in-the-name.md).

**THE CATALOGUE READ BACK AGAINST A BOOK — a TOOL, deliberately not a gate
(2026-08-25).**  `bin/curate/verify_against_poling.py` reads the CURATOR's own
copy of Poling/Prausnitz/O'Connell App. A, matches by CAS never by name, and
prints its report to `data/local/`; it is NOT wired into `bin/runTests` and
never will be — a check that cannot run must not pass, and a skip-when-absent
gate would be permanently green exactly where it matters.  Record:
[`docs/design/verifying-the-catalogue-against-a-book.md`](docs/design/verifying-the-catalogue-against-a-book.md).

**A DESTRUCTIVE GATE POISONED THE EVIDENCE (2026-08-18).**  `check_gate_selftest`
restores inside `try/finally`, which is not death-safe against SIGKILL (a clean
tree hides a poisoned binary from `check_build_fresh`), so
`bin/curate/destructive_session.py` writes a disk JOURNAL before the first
mutation, and `bin/runTests` (before `check_workspace_truth`), `--record` and
both arms of `gate_manifest` REFUSE while a journal stands; `gate_manifest`
refuses to write on any failure or timeout.  Deliberately NOT done: automatic
repair, and reordering the walk.  Record:
[`docs/design/destructive-gate-contamination.md`](docs/design/destructive-gate-contamination.md).

**THE MESH DECLARES ITS STRUCTURE, AND THE SOLVER AUDITS THE DECLARATION
(2026-08-25).**  `opts.blockTri = {N, nv}` buys Curtis-Powell-Reid finite
differences and a block-Thomas solve; a declared structure is a solver aid,
and aids report aloud — the first iteration measures the off-band maximum and
REFUSES by name when the declaration is materially false.  The fullMESH keeps
its dense solve (its structure is BORDERED).  Gate: `check_block_tridiagonal`.
Record: [`docs/design/block-tridiagonal-mesh.md`](docs/design/block-tridiagonal-mesh.md).

**A BUBBLE POINT IS (x, P, T), AND THE FIT NOW READS ALL THREE (2026-08-25).**
`EvidencePoint` carries a per-point pressure (a quiet NaN when undeclared,
never zero — zero is a pressure), as a `Pressure` COLUMN or a held-constant
SCALAR; `residual.P` beside evidence carrying its own, and a held-constant
with no unit, REFUSE by name.  A dataset's `reviewStatus` is announced, and
`checked` MUST NOT BE SILENT; a guard scoped to an object the caller
recreates in a loop guards nothing.  Gate: `check_held_out_pressure`.  Record:
[`docs/design/held-out-pressure.md`](docs/design/held-out-pressure.md).

**ONE THERMOML TOOLCHAIN, NOT TWO (2026-08-25).**  `bin/choupo-thermoml` is
the one tool (`sync` · `index` · `search [--online]` · `extract` ·
`extract-vle`); its cache lives in `thirdParty/thermoml/`, never `data/local/`
(the loader RESOLVES that tree by name); an unresolvable component REFUSES
rather than being guessed, and a multi-block article demands `--block N`
because choosing is the curator's act.  Record:
[`docs/design/held-out-pressure.md`](docs/design/held-out-pressure.md) §8.

**THE WASM BUILD DIED WHERE THE NATIVE ONE PASSED, AND THE SITE WENT STALE
(2026-08-27).**  A lambda captured a STRUCTURED BINDING —
`for (const auto& [uname, cb] : …)` then `[&]{ … cb.factors … }` — which is
illegal in C++17 and became legal only in C++20.  **g++ accepts it as an
extension and says nothing, even under `-Wall -Wextra -Wpedantic`**;
emscripten's clang makes it an error.  So it built natively, passed the whole
suite and every gate, and killed `make wasm`: `publish-site` failed on THREE
consecutive pushes while www.choupo.org went on serving a bundle three commits
old.  **A green suite is not evidence about the site** — the site is a
different artefact from a different toolchain, and nothing in `bin/runTests`
compiled it.  §13 says to rebuild WASM and it was not done.
**What makes a LOCAL gate possible:** the two compilers do not disagree about
the LANGUAGE, only about severity — ordinary clang reports the same constructs
as `-Wc++20-extensions` where emscripten's older clang errors.  So
`check_wasm_dialect` compiles every `src/**/*.cpp` with `clang++ -std=c++17
-fsyntax-only` and those families promoted to errors, no emscripten needed;
it carries a PROBE (the construct itself) that must still be rejected, and it
FAILS rather than skips when clang is absent.  Swept, not assumed: that was
the only instance in the tree.  **It is NOT `make wasm`** — local libstdc++
headers, so it cannot see the libc++ differences `check_std_includes` exists
for; the flag list is an enumeration; and emscripten's clang is OLDER, so a
construct the local one accepts silently still passes.  4 sabotages, and
**S2 SURVIVED**: `-Wc++2a-extensions` is an ALIAS of the same group, so
disarming one flag leaves the other armed and the gate went on printing two
claims that were false at that moment — any future sabotage must disarm the
whole list.  **RESERVED for Vítor: the standard itself.**  The C++17 choice is
registered in two places and ARGUED in neither (`property-architecture.md`
§106 rejects C++20 because it *"contradicts settled decisions (C++17, …)"*,
which is circular).  The code that broke the site is valid C++20.  Against
moving: the WASM toolchain is pinned at **emscripten 3.1.6 (2022)** and the
whole site is built from it — whether it does C++20 well enough is a
MEASUREMENT nobody has taken, not a guess to make.

**A CITATION REQUIREMENT CHANGED WHAT THE READERS READ (2026-08-28/29).**
Every EduTool lesson symbol needs a `file:line` citation into the ENGINE,
verified mechanically (waiver dict kept EMPTY); a missing definition is
visible and a WRONG one is not, and a test over a false claim is worse than no
test.  Where two prose homes cannot share a variable, a gate that recomputes
is the only available single source.  The pump/pipe liquid-density split named
there as NOT fixed was CLOSED 2026-08-29 (Rackett anchored on the record's own
declared `Vliq`) — a stale ABSENCE outliving the gap it named.  Gates:
`check_lesson_symbols` · `check_bjerrum_prose` · `check_shortcut_column_refusals`.
Record:
[`docs/design/what-a-citation-requirement-found.md`](docs/design/what-a-citation-requirement-found.md).

**CAN THE STUDENT GET IT OUT? — leg 5 (2026-08-27).**  The `design` and
`economics` reports SERIALISE `result` and refuse naming the remedy when it is
empty (a report draws, it does not recompute); one failing report no longer
kills every report after it — each is caught by name, the count raised on
`AdvisoryLog`; `sizing.csv` carries the design BASIS and `costs.csv` reproduces
its own total.  Making `design`/`economics` default is RESERVED.  Gate:
`check_cost_provenance`.  Record:
[`docs/design/the-deliverable.md`](docs/design/the-deliverable.md).

**A NUMBER YOU CANNOT TRACE IS A NUMBER YOU CANNOT DEFEND — leg 4 (2026-08-27).**
`DictAudit` reaches `postDict`, `solverDict` and `outerDict` (PURE parameter
files; the walker reads `entries_` DIRECTLY — never `subDict()`, which
`note()`); `constructionPeriod` ANNOUNCES and does not refuse; the costing
table prints its own arithmetic (a provenance line too coarse to reproduce is
worse than none); a missing-key refusal names the closest match.  NEVER EDIT
`bin/runTests` WHILE IT RUNS; `bin/curate/runtests_verdict.py` is the ONE home
for a harness verdict — *moved* only when a verdict was printed, anything else
`could-not-run` (converted: `check_component_name_hint`,
`check_friction_correlations`).  RESERVED for Vítor: the costing model is registered as
`Guthrie` and every coefficient in the file is Turton's.  Gates:
`check_postdict_audit` · `check_cost_provenance`.  Records:
[`docs/design/the-key-nobody-read-in-the-postdict.md`](docs/design/the-key-nobody-read-in-the-postdict.md)
and [`docs/design/a-cost-you-can-defend.md`](docs/design/a-cost-you-can-defend.md).

**A CORRELATION IS AN OBJECT, WITH A WINDOW, A CITATION AND AN ANCHOR
(2026-08-25).**  `FrictionFactorCorrelation` (Blasius, Colebrook-White,
Haaland, Churchill) joins `HeatTransferCorrelation`: declared validity window
+ `verify()` anchor + `citation()` — a correlation whose source is a comment
is one the reader cannot check.  The bench never ranks them; the witness
publishes two spreads and never one.  NOT ESTABLISHED: no correlation here is
checked against MEASURED data.  Gate: `check_friction_correlations`.  Record:
[`docs/design/correlations-as-objects.md`](docs/design/correlations-as-objects.md).

**A BATCH MEMBRANE, AND THE WASHOUT LAW FAILING WHERE A STUDENT CAN WATCH
(2026-08-25).**  Everything a membrane needs was already here -- the
solution-diffusion and DSPM-DE transport laws, van't Hoff and Pitzer osmotic,
film polarisation, the asset records -- and ALL of it served exactly one unit,
the steady spiral-wound module.  Diafiltration and batch concentration are how
membranes are actually run at laboratory and pilot scale and how they are
taught; `choupoBatch` had no membrane at all.  `batchDiafilter` adds NO
architecture: it is a `BatchUnitOperation` asking `TransportModel::localFluxes`
the same question the module asks, once per instant instead of once per channel
node, in two modes (`concentration`, `constantVolume`).  **The lesson is the
point.**  The hand derivation `c/c0 = exp(-(1-R)N)` assumes the rejection is
CONSTANT; it is not (the solute leaves, the osmotic pressure falls, the flux
climbs, the observed rejection rises), so the unit publishes `R_obs_<solute>`
at every instant and, in constant-volume mode, `washoutActual_` beside
`washoutIdeal_` **evaluated from THIS RUN's own initial R** -- an idealisation
computed from the run, never declared, so the gap cannot have been arranged.
Witness `diafilter01_nf_desalting` (5.44 diavolumes: NaCl to 50.2 %, MgSO4 held
at 99.2 %, flux 233 -> 256 LMH, R 0.8714 -> 0.8748, actual 0.5015 vs ideal
0.4970).  **Three things this slice paid for.**  (1) A vessel OPEN IN BOTH
DIRECTIONS needs its intake declared: the first run reported 4996 kg
unaccounted, and *the balance was right and the unit was wrong* -- hence
`BatchUnitOperation::takeContinuousIntake`, the mirror of the discharge, drained
per accepted step (`takeDatumAmendments` could not serve: it is drained only
inside the recipe's `setParameter` handler because its subject is a CHANGED
DECLARATION, not a flow) and recorded under its own kind word `externalIntake`
so a wash-water make-up is not filed as a re-declared feed.  (2) **A LEDGER
BUILT BY RE-INTEGRATING A FLUX DISAGREES WITH THE STATE THE INTEGRATOR
ACCEPTED**, at O(dt): the first version closed at 1.9e-3 while its own comment
claimed it read the inventory.  The permeated VOLUME is now an integrated state
and every record is a DIFFERENCE against the accepted inventory -- closure
1.2e-16, and the sabotage that restores the quadrature closes at 5e-4, which a
careful-sounding 1e-3 tolerance would have waved through (which is why the gate
pins MACHINE level, not a tolerance).  (3) **The printed balance equation must
be the arithmetic that decided**: `[campaign] mass balance` omitted the drawn-in
and returned amendment terms the verdict has always used, so an open campaign
printed `m0 = mF + external` with tens of kilograms missing and then said
"(closed)".  Also: `toBulk` left its anonymous namespace inside
`SpiralWoundModule.cpp` for `src/unitOperations/membrane/BulkConversion.H` when the second caller
arrived (11/11 membrane goldens unmoved), and `choupoBatch` now loads
`MembraneRegistry` and the membrane sub-model factories -- *a unit is not
installed until everything it constructs is*.  NOT modelled, said plainly:
fouling and flux decline (the largest gap to a real rig), any k_film
correlation (the case DECLARES it and the unit refuses without it rather than
inventing a geometry), temperature transients, gel-layer/critical-flux
behaviour, and the pump work (`energyLedgerGap` names it; the campaign energy
balance is UNAVAILABLE rather than closed with a term quietly zero).  Gate:
`check_diafiltration` (5 sabotages, two of which attack the driver and the unit
separately because the declaration can be lost on either side of the hook).

**FOULING FOLLOWED THE SAME DAY, and the "largest gap" sentence above is now
PARTLY PAID.**  Resistance in series on the permeance the unit hands the
transport law -- `1/A_eff = 1/A_w + r_f(v)`, `v = V_permeated/A`, `r_f` growing
by one of HERMIA'S BLOCKING LAWS (Hermia 1982; `cake` and `intermediate`
implemented).  **Applied where the transport CONTEXT is assembled, not inside a
transport law**: both `solutionDiffusion` and `DSPM_DE` read `ctx.A_w`, so ONE
home serves both and neither is modified -- and fouling is a property of what
the membrane has been asked to do OVER TIME, which is why the steady module
cannot carry it and this unit is the only place in the tree that does.  **A
BLOCKING LAW IS A CLAIM ABOUT A MECHANISM**, not a fitting exponent, so the
block REQUIRES a `reason` (the engine cannot know whether a deposited layer or
a covered pore describes a feed) and `standard`/`complete` REFUSE by name
rather than being approximated by a neighbour their lumped permeance cannot
represent.  Absent the block there is no fouling and the run is byte-identical.
The constant is EQUIPMENT-AND-FEED data (axiom 3) and lives in the case -- **no
catalogue record is touched, so no curation decision rides on it**.  Witness
`diafilter02_fouling_decline`, the SAME operation as diafilter01 with only the
fouling added, so the difference IS the fouling: the flux turns round (233 ->
196 LMH where the clean twin rises to 256), permeance falls to 72.5 % of clean,
and the same 160 s buys 4.74 diavolumes instead of 5.44, leaving 53.4 % of the
NaCl behind against 50.2 %.  Its `k` is declared HYPOTHETICAL in its own header:
a fully dissolved brine has nothing to deposit, so the case demonstrates the
CONSEQUENCE of a declared decline, never this feed's fouling -- a structural
witness on the `edwards01` precedent.  STILL not modelled: any MEASURED fouling
(the tree carries no fouling data at all), critical flux, gel layers, cleaning
or backwash cycles, and any prediction of `k` itself.  **Sabotage 8 SURVIVED its
first run** -- it removed the `reason` requirement and the gate said OK, because
the shipped witness declares one: *a guard whose only case satisfies it is a
guard nothing tests.*  The gate now BUILDS the offending cases (reason stripped,
`standard` requested, a law nobody implemented) and requires each to refuse AND
name why.  8 sabotages total, two of which survived first contact.

**AN ADVISORY NOW SAYS WHICH STATE IT IS ABOUT (2026-08-24).**  An advisory
carries `where` (the innermost open `AdvisoryFrame`) and `status` (`accepted`
| `trial`), both stamped by the SINK, not by the sites that raise them; THE
DEFAULT IS `accepted`, status only ever moves TOWARD the answer, and the block
PARTITIONS on that stamped field — never on a similarity heuristic.  Frame the
search where the search IS, not at every caller.  NOT covered: the recycle
Wegstein, the Gibbs multi-start, Wang-Henke and both time integrators.  Gate:
`check_advisory_attribution`.  Record:
[`docs/design/advisory-attribution.md`](docs/design/advisory-attribution.md).

**THE PELLET IS A POINT, AND NOW THE ENGINE SAYS SO (2026-08-18).**
`catalystLoading` is a unit conversion and never claimed to be more: a
heterogeneous rate constant is reported per gram of dry catalyst and the bed
makes it volumetric.  But the four reactors that read it — `cstr`, `pfr`,
`batchReactor`, `dynamicCSTR` — then evaluate the rate at BULK conditions,
which is the **effectiveness factor taken as η = 1**, and nothing in the
engine, the dicts or the output said so.  η MULTIPLIES the rate (the
first-order sphere gives η = 0.1867 at φ = 5), so a bed sized on it can be
undersized several-fold, silently, at exit 0.  The engine cannot decide
whether that is the reader's case — a Weisz-Prater check needs the pellet
dimension and a D_eff, and no case declares either — so it ANNOUNCES and
judges nothing, the same posture as the extrapolated sub-273 K Antoine and
the sub-band Davies.  ONE home (`unitOperations/reactor/CatalystPellet.{H,cpp}`,
on the `ReactionHeat.H` precedent that `batch/` and `dynamic/` already
include), riding `AdvisoryLog` so it reaches the reader in the end-of-run
caveat block and not only at its site.  **Zero numbers moved; no golden
moved.**  Two things this slice paid for, both in the GATE rather than the
engine, both found by the sabotage protocol: (1) the first negative was
`cstr01`, a SINGLE-reaction case, and `catalystLoading` is read inside
`solveMultiReaction` — so its silence was a property of the control flow and
**a negative that cannot fire pins nothing** (the `check_true_ions` shape,
caught the same day rather than a year later); (2) the suppression sabotage
`continue`d past the caveat-block arm, leaving it unproven, so a fourth
sabotage keeps the log line and drops the advisory — *"announced" without the
replay is the slightly-louder-form-of-silence the summary block exists to
end.*  NOT built, and named rather than implied: the pellet itself (a
`kind catalyst;` asset record mirroring `Adsorbent`, a D_eff arity ruling, a
rate multiplier in the same four reactors) — scope in
[`docs/design/edutools-curriculum-survey.md`](docs/design/edutools-curriculum-survey.md) §6.1.
Gate: `check_pellet_announcement` (4 sabotages; states the reach it does NOT
have — no corpus case declares `catalystLoading` on a `pfr`).

**THE REFERENCE RUNG — a declared field the hot path did not honour
(2026-08-06).**  `h_pure_ig` / `s_pure_ig` / `g_pure_ig` refuse on a non-gas
`standardThermochemistry.referenceState` before the Cp check, quoting the
record's own word and naming `h_formation` as the remedy — the old message was
advice that creates the bug; `datumOnIdealGasRung()` is kept SEPARATE from
`hasCpIdealGas()`.  NOT closed: `water.dat` carries only the ideal-gas datum
(a MISSING SECOND DATUM, gating `gStd`).  Gate: `check_reference_rung`.
Record: [`docs/design/reference-rung-refusal.md`](docs/design/reference-rung-refusal.md).

**ICE IS A PHASE, NOT A SPECIAL CASE (2026-08-07).**  `SolidPhase::fEffective`
returning `Psat(T)·exp(−ΔG_fus/RT)` at the crystal's index — and ZERO at every
other — is the entire implementation; freezing-point depression falls out of
K = 1, derived and never declared.  `component <name>;` is REQUIRED (solute
inclusion is not modelled); `K_f` is derived from a cited `Hfus`, and a record
with none keeps its declared value.  A status guard armed on one of two routes
guards neither.  Prose staleness is deliberately NOT gated.  Gate:
`check_ice_freezing`.  Record:
[`docs/design/ice-as-a-solid-phase-of-the-solvent.md`](docs/design/ice-as-a-solid-phase-of-the-solvent.md).

**THE STRUCTURAL SLICE (2026-08-05/06) — the layering now HOLDS, and the
machinery that enforces it got its own arity treatment.**

* **I17 and I18 are ASSERTED, not bounded** (`global-invariants.md`).  Every
  pinned upward edge was the same defect — ONE shared concept filed inside a
  consumer.  `PINNED_UP` is empty; the only cycle left is the ACCEPTED
  `solver ↔ thermo` (§7.3).  Debts in
  [`docs/architecture/module-boundaries.md`](docs/architecture/module-boundaries.md).
* **`result/` and the tooling plane.**  `result` (the pipeline's output
  records) and `io` (domain serialisation) are subsystems in the layering;
  `curation` sits BESIDE the stack under a stronger rule — *a tool may read
  the runtime, nothing in the runtime may read a tool, only `applications/`
  joins the planes.*  A finding record is neutral data and belongs at the
  bottom: [`docs/design/where-a-finding-record-lives.md`](docs/design/where-a-finding-record-lives.md).
* **`bin/curate/debt_registry.py` — ONE home for every accepted violation.**
  Waivers were scattered across eight of the 92 `check_*` scripts: the arity
  doctrine broken by the machinery built to enforce it.  Each entry carries
  why / remedy / blocker.  `check_debt_registry` keeps it the only home and
  refuses an entry no gate reads; it does NOT judge whether a waiver is still
  true — that is each gate's stale-pin arm.  (`check_ion_pins.PINS` was
  renamed `ANCHORS`: a pinned *violation* and a pinned *anchor* are opposites.)
* **`generated/gateManifest.json` — what each gate CLAIMS, derived by running
  it** and capturing its own OK line, never transcribed from a docstring.  It
  records the claim and stated blind spots; it does NOT record sabotages or
  retirement conditions, because those are not visible in a gate's output.
* **A DURABLE CAVEAT SURFACE.**  Extrapolations, unverified records and
  estimates now ride `AdvisoryLog` into the result JSON AND are replayed once
  at the end of every run, grouped (`core/AdvisorySummary.H`).  A run with
  nothing to say says so — silence must mean "nothing raised", never "the
  block did not run".  All four binaries emit it.
* **`Trange unknown;` (AP3).**  Three states, not two: a declared window, a
  DECLARED absence, or no key at all.  An impossible interval (`hi <= lo`)
  now REFUSES at construction — extrapolation needs a real domain to
  extrapolate from.  Six records migrated.
* **`provenance fittedToCase;` (AP4).**  A record shipping transport
  parameters must say where they came from, and a fitted set must NAME the
  case it was fitted against.  NF270's header quoted permeabilities its cited
  datasheet never published (it publishes rejections); the false KIND of claim
  was removed rather than a number chosen, so no value and no golden moved.
* **`bin/runTests` is the VERIFICATION AND REGRESSION corpus (G2)**, with a
  named validation subset of seven cases —
  [`docs/architecture/verification-and-validation.md`](docs/architecture/verification-and-validation.md).
  A PASS proves an answer has not moved from a self-recorded golden, never
  that it is right.
* **The sealing closure is OBSERVED, not guessed (D3, first slice).**  The
  resolver seam carries an opt-in consumption ledger, and `bin/choupo-import`
  REFUSES an under-staged seal — verified by reproducing the 2026-08-04
  Edwards defect, which it catches earlier than the golden did.  The
  hand-written `want()` list STAYS: one run cannot see a record a model reads
  only for other component sets.

Gates added: `check_debt_registry` · `check_caveat_surface` · `gate_manifest
--check`.  All sabotage-verified, and three sabotages found defects in the
gates themselves rather than in the engine.

**A COLUMN OVER A CHEMISTRY — the effective stage K (built 2026-08-04).**
`ThermoPackage::stageK(T, P, zStage, x, y)` is the ONE entry a tray asks for
equilibrium: molecular → `Kvec`, byte-identical; reactive → an effective
APPARENT K, the ions internal to the stage, the Jacobian never sees one.  A
K-VALUE IS AN INCIPIENT QUANTITY: a subsaturated or above-band trial is priced
over the speciated liquid (a typed `NonConvergence` is absorbed, a REFUSAL
never is); a trial leaving the simplex is projected and ANNOUNCED.
`adiabaticFlash` reads the stream's `vf`.  Gate: `check_stage_identity`.
Record: [`docs/design/sour-water-stripper-scope.md`](docs/design/sour-water-stripper-scope.md) §6a.

**Pinch — P1 targets + P2 analysis table (built 2026-08-03; P3 area-cost
stays UNAUTHORISED).**  A `pinchPass` PostProcessor in the postDict chain:
Linnhoff-Flower problem table printed cascade by cascade,
`pinch.Q_H_min_kW / Q_C_min_kW / T_pinch_K` KPIs,
`reports/pinch/compositeCurves.csv`; P2 (ratified 2026-08-03) adds the
candidate-match ANALYSIS table `reports/pinch/candidateMatches.csv`
(exhaustive hot×cold pairs per region, the exact counter-current
end-approach bound, the CP rule binding only AT the pinch — a violating
pinch match keeps its away-from-pinch duty, said so) + the coursework
violation diagnostics (heater below / cooler above the pinch, whose sum
equals the current-vs-target excess).  **Every feasible row is a
"thermodynamically admissible candidate" — the word "optimal" never
appears (gate-enforced), and the pass never rewrites the network.**
Method hypotheses stated in `PinchPass.H`.  Witness
`pinch01_four_stream_classic` (hand-worked cascade + candidate table in
its header); gates `check_pinch_p1` + `check_pinch_p2` (independent
recomputation, both sabotage-verified).  Scope:
`docs/design/pinch-programme-scope.md`.

**PC-SAFT association — built 2026-08-03 with the three ratified amendments**
(extensible (nD,nA) site representation behind `siteCounts()`; nested
tolerances X-fixed-point 1e-14 under the 1e-12 η bisection; widened
validation: X^A echoed + closed-form oracle + non-associating corpus
untouched at 1e-10).  The trio `assocScheme/epsAB_K/kappaAB` extends the
component's `pcsaft{}` block, all-or-nothing, Wolbach-Sandler cross rules,
kij = 0 announced.  **THE SCHEME IS PART OF THE FIT** (paid for once: the
G&S-2002 water set is 2B — the paper's own site count — and curated as 4C it
passed a pure-density anchor by coincidence while the ethanol/water mixture
flash collapsed; a mixture witness catches what a pure anchor cannot).
Witnesses `pcsaft03_association_pure` + `flash20_ethanol_water_pcsaft`
(predictive vs fitted NRTL side by side); gate `check_pcsaft_association`
(independent Python closure, per-set anchors, sabotage-verified); theory
guide `ch:pcsaft`.  Sealing note: per-unit `thermo{}` overrides ride the
importer's dependency closure since flash20 (a sealed case must never change
physics on sealing).

**THE PROBLEM SOLVED IS NOT ALWAYS THE PROBLEM POSED (ruled 2026-08-11).**  An
ADVISORY says the answer is qualified; a DIVERGENCE says the answer is to a
DIFFERENT QUESTION — `core/ProblemDivergence.H`, printed ABOVE the caveats,
emitted ABOVE the KPIs, written to `converged/problemDivergence`, ALWAYS.  A
substitution nobody authorised is REFUSED; a declared approximation is
RECORDED, never refused.  The authorisation lives ONCE at the TOP LEVEL of the
thermophysical system, parsed ONCE at `buildV2Dispatch`; the decision has ONE
home (`resolveIdealPairSubstitution`).  NOT covered: only `shortcutColumn` and
the three pair-parameter activity models are wired.  Gate:
`check_problem_divergence`.  Record:
[`docs/design/problem-divergence-contract.md`](docs/design/problem-divergence-contract.md).

**THE MODEL-BOUNDARY STEP IS ACCOUNTED, NOT CHARGED TO THE UNIT (2026-08-09).**
Three quantities travel apart and are never collapsed: the RAW imbalance · the
declared STEP · what REMAINS; the verdict is taken on the third.  The audit is
INDEPENDENT (it never calls `Flowsheet::thermoFor` — an auditor that reuses
the auditee's arithmetic checks nothing), and a step is credited only when
DECLARED · UNAMBIGUOUS · PRICEABLE · READABLE · REPRODUCED under
`solver/Convergence.H` (`modelBoundaryClosure`; `maxIter` refused).  Gate:
`check_model_boundary_ledger`.  Record:
[`docs/design/model-boundary-energy-ledger.md`](docs/design/model-boundary-energy-ledger.md).

**Balance diagnostics, three levels (2026-07-19): total mass · per-element
atoms · energy — engine-owned, GUI only draws.  ALL THREE run by DEFAULT on
every converged steady run (2026-08-02, roadmap #7):** conservation is the
curriculum, so none depends on a case declaring `reports {}`; a declared
block keeps control (`enabled false;` opts out per report), and the refusal
posture follows provenance — the *default* energyBalance reports a missing
enthalpy datum as UNAVAILABLE with the remedy (the `status,REFUSED` artefact
still written), a *declared* one keeps the hard ERROR.  Gate:
check_default_reports.  ONE shared formula parser
(`src/thermo/ElementComposition`; `elementalComposition` props op = its
glass-box surface); steady `elementBalance` report (boundary atoms, its own
artefact beside massBalance); choupoCtrl accepted-step ledger
(`BalanceSnapshot` contract, `balanceTrajectory.csv` + `.meta`); the
dynamicCSTR physical-energy claim honestly refuses (Cp/convective ODE ≠
derivative of canonical U/H) until the model is reformulated.  Gates:
check_element_composition / check_element_balance / check_ctrl_balance.

**Ctrl FIRST LAW — three probed routes; the ledger CLAIMS (2026-08-01).**
The dynamicCSTR's energy equation is chosen by PROBING the enthalpy surface
(never by name): canonical per-species (stored H = Σnᵢhᵢ(T), the ODE its
exact derivative — witness `ctrl11`, closure 1.4e-7, second-order in deltaT
= the ledger's trapezoid, not the physics); **mixture-H** when the
per-species leg cannot serve (the electrolyte salt is mixture-level,
`aqueousSaltEnthalpy(m,T)` — the vessel stores TOTAL H as a STATE,
dH/dt = Ḣin−Ḣout+Q on `H_liquid_formation`, partial-molar terms implicit,
reactions inside the datum, T a Newton readout — witness `ctrl10`, 7.9e-11);
Cp/convective for the datum-less toys, refusing as ever.  The route is
ANNOUNCED with its reason.  choupoCtrl's balance ledger carries the energy
rung on the same accepted-state trapezoid as material.  Gate:
`check_ctrl_balance` (claim + refusal + step-order + T-dependent-Cp fixture,
sabotage-verified).

**outerDict over choupoCtrl (2026-08-01).**  The ctrl campaign is a PURE
FUNCTOR (fresh units/controllers per evaluation; `writeOutputs` gates every
artefact), so `system/outerDict` wraps the dynamic path with the SAME
OuterDriver architecture as choupoSolve — a piecewise-constant control
profile IS a `Schedule`, varied via `controllers[i].schedule[j].value`.
Witness: `ctrl16_williams_otto_optimal`.  Trap learned: dict clones do NOT
carry runtime-inserted blocks — the 0/-state seeding runs inside the
functor, idempotent.

**External-reference battery (2026-08-01).**  Beyond self-recorded goldens,
cases pinned on PRIMARY published anchors, each stating what is and is not
the portable part: `cavett01_recycle_train` and the Williams-Otto four
(`ctrl12`-`ctrl14`, `ctrl16`).  Pattern for future references: one coherent
primary source end to end, never a blend; provenance of every number stated
in the case.  Spec + anchors:
[`docs/design/williams-otto-reference-case.md`](docs/design/williams-otto-reference-case.md).

**Batch campaign LEDGERS — material + energy (built 2026-07-11, forum
#99/#101/#102).**  choupoBatch carries two structured ledgers: the MATERIAL
ledger (one `TransferRecord` per material edge, per-package enthalpy at each
package's own T, MONOTONIC H-validity — a poisoned record never resurrects)
and the ENERGY ledger (one `EnergyRecord` per segment of constant physics).
Every integral is an EXACT state difference on the elements datum, never a
quadrature; `chargeFrom` solves T_mix by H-EQUALITY (fallback = molar
average, announced + drained as a named gap).  The campaign energy balance
claims a verdict ONLY when every piece is ledgered and priceable — otherwise
UNAVAILABLE quoting each `energyLedgerGap()` verbatim.  Heat-of-crystallisation
is SHARED steady↔batch (`CrystallisationHeat.{H,cpp}`).  **DATUM AMENDMENTS
(A5, 2026-08-01):** a recipe that RE-DECLARES the feed jumps the datum — the
jump is priced by the unit (`takeDatumAmendments()`) and ledgered as
`feedAmendment` records against the external boundary (witness
batch19_feed_switch_purge; gate check_feed_switch; T/u/P swings refuse by
name).  **Phase (f) UTILITIES, both halves SHIPPED (temporal half
2026-08-03):** every VALID ledger record with a service T is allocated by the
SAME `pickForDuty` rule the steady report uses, unserved records LISTED never
dropped; the demand STAIRCASE (`reports/utilities/utilityDemand.csv`) keeps
the ledger as SOLE authority (a profile that does not reproduce its record is
REFUSED and the record stands), impulses are an explicit class, ONE
allocator.  `notifyStateWillChange()` closes the segment PRE-mutation, and
`takeContinuousDischarge(tNow)` carries the committed time.  Gate:
`check_temporal_utilities`.  Full record:
[`docs/design/batch-temporal-utilities-proposal.md`](docs/design/batch-temporal-utilities-proposal.md) §8.

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
closes on every element.  Cases are SELF-CONTAINED via a SEALED `constant/propertyManifest`
+ mirrored `constant/` records (`bin/choupo-import` materialises the dependency closure + a per-record
sha256 manifest; the runtime is FORBIDDEN the installation catalogue when sealed;
versioned `Choupo-2607` per `data/standards/CATALOGUE.dat`).  The
architecture is
[`docs/architecture/property-architecture.md`](docs/architecture/property-architecture.md);
the 2026-07-06 working notes were a session memory and are NOT in the
repository, so this paragraph is the record of the decision.  **The seal is
COMPUTATIONAL since 2026-08-03** (`sealSchema computational;` — a
sealing-SCHEMA migration, never a scientific reseal): the claim is the PARSED
content (`src/core/DictCanonical`), so comment/formatting/unit-spelling drift
is COSMETIC (announced, verdict intact) while a moved value/dimension/key
diverges and `onDivergence refuse` fires exactly as before.  Gate
`check_seal_schema`; record:
[`docs/design/computational-seal-migration.md`](docs/design/computational-seal-migration.md).

**Sequential-plan contract (tears + order) — SETTLED 2026-07-25, do NOT
relitigate.**  The solver executes the flattened units IN DECLARED ORDER
(never a silent topo-sort), and the 0/ completeness pre-seeding retired the
old "input stream not in registry" guard — so an undeclared recycle tear AND
an out-of-order acyclic flowsheet both silently read stale 0/ seeds (wrong
answer, exit 0; both reproduced before the fix).  The contract, validated at
the flatten seam in `Flowsheet::validateSequentialPlan` (shared by choupoSolve
+ choupo-lint; `-init0` keeps its own UNREACHED accounting): **every material
input = domain inlet ∨ EARLIER unit's output ∨ declared tear; every declared
tear = a backward edge closing a REAL cycle.**  This SUBSUMES "graph−tears is
acyclic" and validates the order itself.  Six named refusals (MISSING TEAR
with the cycle chain · INVALID ORDER with a paste-ready valid order · FORWARD
/ OFF-CYCLE / UNKNOWN / INLET tear), findings collected, remedy-bearing; a
valid recycle plan ANNOUNCES its cuts (`[plan]`, verbosity ≥ 2).  Cycle
*detection* is the engine's job; tear *choice* stays the author's (energy
heat-link feedback stays auto-detected — the asymmetry material/energy is in
the declaration of the CUT, not the detection).  A non-converged recycle now
returns **exit 1** and `converged/` is NOT written (the name is a contract).
Corpus evidence: 14/14 tear cases already satisfy it, 158 flat cases have
valid order, 0 redundant tears.  Deferred, named: `tearSelection auto`
(Phase 2, solverDict, loud heuristic), `laggedStreams` (deliberate lag is a
separate feature, never a tear), stream freshness marks (batch/ctrl future).

**Stream-state directories + topological drill-in — RATIFIED 2026-07-06 (the
constitutional spine; do NOT reopen the ontology unless a concrete case proves
the contract fails).**  A stream's STATE lives in its OWN file on disk,
OpenFOAM-style — never inside `flowsheetDict` (TOPOLOGY only): `0/` (COMPLETE
initial state, N streams == N files, missing/orphan FATAL), `converged/`
(steady solution), `iterations/` (numerical history, NEVER physical time),
`0.01/` `0.02/`… (transient snapshots), `design/`, `economics/`.  Stream role
is inferred from TOPOLOGY; drill-in changes the DOMAIN, not the stream (the
child `0/` from `converged/` by default, never a silent "latest");
`choupo-init0` never overwrites without `--force`; a `streams {}` block in any
flowsheetDict is REFUSED loudly — no dual reader, no fallback.  Full contract:
[`docs/architecture/stream-state-architecture.md`](docs/architecture/stream-state-architecture.md).

**The `phases {}` decomposition names AQUEOUS · ORGANIC · SOLID (2026-07-30).**
`componentMolarFlows` stays the OVERALL material and the apparent basis is
NEVER disturbed; a `phases {}` block decomposes it and must sum back exactly.
Three rules, each fixing a wrong answer every test had passed: (1) **the
speciation attaches to the AQUEOUS material** — top level when there is one
liquid (the stream IS that material), inside `phases.aqueous` when a second
liquid or a solid is named, because the ions are there and nowhere else; (2)
**a precipitate is a PHASE, not a species** — a mineral among the aqueous
species reported a crystal as dissolved, and *closed*, which is why nobody
saw it; the owning component comes from its own `solidPhases {}` record,
never matched by name; (3) **a size distribution belongs to its POPULATION**
— inside `phases.solid`, never at the top level where it could only describe
"the combined solid".  **Names are checked against what they name:** outlets
bind POSITIONALLY, so `outputs ( aqueous organic )` was right only while the
solvent happened to be declared first — the engine refuses an `aqueous`
outlet holding less solvent than the `organic` one, and refuses the name
outright in a system with no solvent.  Splits close by SUBTRACTION (one side
stored, the other derived) so two roundings cannot drift apart.  Reference
cases: `flash17` (two liquids), `flash16` (precipitate), `flash19` (FOUR
phases at once).  Gate: `check_phase_speciation` — seven refusals fired
through the real reader, and **three of them passed with the fix reverted**
(they test structure, not the check), which is worth knowing before trusting
a green run.

**A LABORATORY ANALYSIS IS AN INLET — `aqueousAnalysis {}`, the SEVENTH
canonical form (A1 shipped 2026-08-09; do NOT fold it into
`speciesMolarFlows`).**  *Inventory is not measurement.*  A
`speciesMolarFlows … basis analytical;` block declares flows the author has
ALREADY reconciled, and charge closure is a CONTRACT there — refusing a
violation is right.  A lab sheet is mg/L with uncertainties, reported partly
on surrogate formulae, and it does NOT close; that is what is to be
RECONCILED.  Keeping them apart made this an ADDITION and the corpus blast
radius ZERO.  THREE LAYERS, THREE HOMES: the MEASUREMENT in `0/<stream>`,
**never rewritten** (O1 — reconciling into the measurement destroys it and
the next run reconciles the reconciliation); the RECONCILED conserved
inventory in `converged/<stream>` under `calculated { analysisReconciliation
{…} conservedInventory {…} }`, report-only and ignored by the reader (the
same deletability test `speciation` passes); the EQUILIBRIUM in the answer.
`as <formula>` resolves its MW through the ONE elemental-formula parser
(`thermo/ElementComposition`) and its `perFormulaUnit` is DECLARED —
"alkalinity as CaCO3 is 2 HCO3 per CaCO3" is a convention, not arithmetic to
invent.  The DENSITY ROUTE is required and explicit (`provenance measured;`
plus exactly one flow anchor); an ITERATIVE density is refused BY NAME as the
declared gap.  The solvent is closed by the density AFTER the m = A n
inversion, never on the ion masses — the bridges are not mass-conserving
(CaCO3 → Ca + HCO3 borrows an H from the water), so closing on the ions
leaves that hydrogen unowned.  ONE inverter: `collectBridges` /
`requireDeclaredNetwork` / `invertMastersOntoComponents` were extracted and
BOTH forms call them.  Reconciliation is `adjustSingleSpecies` (with
`adjustChloride` as sugar, expanded aloud) under a MANDATORY
`maximumCorrection`.  With no rule declared: inside `closureTolerance`
(0.5 %, a NAMED DEFAULT, announced when it defaults) it passes through
ANNOUNCED; outside it, it REFUSES naming the two remedies — **never a silent
adjustment**.  Witness `analysis01_water_analysis_inlet` (+0.7813 % → 0,
chloride +5.1208 %); gate `check_aqueous_analysis` (the balance recomputed
independently from the authored mg/L; the charge-weighted adjustment
identity, because moles and equivalents coincide only for a monovalent ion;
nine refusals; the negative), sabotage-verified.  **Correction, 2026-08-09:
this paragraph used to say the witness's own golden does NOT move under that
sabotage.  It does** — pH 8.1349 against the recorded 7.9077 — and both the
gate's docstring and the scope doc had recorded so from the day the sabotage
was performed, while this copy said the opposite.  A doc is not exempt from
arity: the observation has ONE home, and it is beside the gate that made it.

**A2 SHIPPED 2026-08-09 — `method weightedLeastSquares;`, and the ruling's
one-way arrow made STRUCTURAL.**  Minimise `Σ ((x−m)/σ)²` subject to the laws
the case DECLARES in `enforce ( … )`, a convex QP on `solver/ActiveSetQP`;
Vítor's boundary — *analysis → reconciliation → ONE admissible composition →
equilibrium, never a coupled loop* — is enforced by a translation unit:
`src/streams/AnalysisReconciler.{H,cpp}` includes NOTHING from `thermo/`.  A
missing σ refuses (`genericWaterAnalysis-v1` was REFUSED, not shipped); pH
stays refused — it is on the other side of the boundary.  Gate:
`check_aqueous_reconciliation`.  Record:
[`docs/design/aqueous-analysis-inlet-scope.md`](docs/design/aqueous-analysis-inlet-scope.md) §8 (A1) and §9 (A2).

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
C++20/CMake/Eigen/PC-SAFT/CAPE-OPEN/open-core.

**COSMO-SAC — the rejection was REVERSED 2026-07-15 (Vítor), for a MINIMAL, glass-box
version only.**  The original blanket rejection was against *bloat* (heavy deps, quantum
chemistry, thousands of imported compounds, a new architecture).  A lean COSMO-SAC that
adds NONE of that IS in: the 2002 (Lin & Sandler) variant, exactly the NIST benchmark
(Bell et al., AIChE J. 2019; reference code usnistgov/COSMOSAC, public domain), as a plain
`ActivityModel` subclass (`src/thermo/activityCoefficient/CosmoSac.{H,cpp}`, model key
`cosmoSAC`) — no new interface, no new deps, ~150 lines of self-contained C++.  Each
compound carries its OWN COSMO surface data in its `component.dat` `cosmo { <setName> {
variant; source; area; volume; sigmaProfile ( … ); } }` block — one or MORE named
parameter SETS (unlike Joback's single set), 51-point grid −0.025..0.025 e/Å², step 0.001.
The case PICKS a set: `activityModel { model cosmoSAC; source <setName>; }` (omit `source`
when a component carries a single set — its lone set is the default; a multi-set component
then REQUIRES an explicit `source`).  Each set declares its `variant` → the matching
constants (only `cosmoSAC2002` implemented today; a set with another variant is a LOUD
error — never mix a profile with the wrong variant's constants).  MULTIPLE SOURCES ARE
ALLOWED as long as each set names its own (Vítor 2026-07-15): 77 standard components carry
a `VT2005` set (Mullins IECR 45 (2006) 4389, DFT-COSMO, US-gov public domain via the NIST
bundle); LVPP (MIT, ~2500) and CHAOS (CC-BY, ~53000) are licence-compatible additional
sets a component may ALSO carry, each labelled.  A component lacking a `cosmo` block, or
the requested set, is a LOUD error.  NOT for the `data/groupEstimative/` lake (a name
catalogue, not COSMO targets).  Validated: pure→lnγ=0 exact, water/hexane
strongly non-ideal, and a bit-for-bit cross-check vs an independent implementation of the
same equations+profiles.  Still rejected: profile GENERATION (quantum chemistry), bulk
import of thousands, multiple variants, any new architecture.  Reference case:
`tutorials/props/molecular/cosmoSAC01_water_ethanol`.

**Property architecture — consolidated; the authority is
[`docs/architecture/property-architecture.md`](docs/architecture/property-architecture.md)**
(level 2 under the Constitution — authority map:
[`docs/architecture/README.md`](docs/architecture/README.md); it superseded
`final-property-architecture.md` on 2026-07-14, kept as historical record).
Layer-1 data detail in
**[`docs/architecture/electrolyte-data-architecture.md`](docs/architecture/electrolyte-data-architecture.md)**
(design record + implementation addendum; earlier iterations in
`docs/architecture/archive/`).  **THE FLOW: the case's INLINE
`constant/thermoPhysPropDict` declaration → `ThermoPackageBuilder`
assembles → `ThermoPackage` computes → unit ops.**  The runtime
assembly step is the BUILDER (loads + assembles, NEVER estimates); "resolver" is
reserved for CURATION-time estimation.  The reference basis is a CONSEQUENCE of
the declared formulation, not an independent selector: choosing `formulation`
settles the activity model, the standard states and the Henry treatment
TOGETHER (the **one-knob rule**), so nothing hardcodes "aqueous" and nothing
picks a rung separately either.  **There is no `ReferenceRung` type** — the
name appears in older notes as a planned resolver and was never built; do not
go looking for it, and do not build one without a case that proves the one-knob
rule insufficient.  Conceptual separation, glass-box — the kinds: components /
model species / solid phases (a component's `solidPhases{}`) / chemistry sets /
property methods / parameter databanks / **the INLINE manifest (the CENTRE — a
case DECLARES its package, it does not merely list components; the shared
catalogue + `package <name>;` selector were retired 2026-07-15)**.
Basis vocabulary: **flowsheet/component basis** (equivalently the *apparent*
basis — that word is accepted) vs **aqueous-species basis**; "true basis" is
deprecated — see §data tree.  This is the
DATA-layout half; root `docs/property-architecture.md` is the
resolution/MODEL half (a deliberate name twin — root = level-3 deep reference);
the **arity doctrine** (`docs/ai/data-doctrine.md`) is a SLICE under it
(reference selection folds into the formulation, per the one-knob rule above).
The flat-components O(1) lookup (§7 below,
2026-06-07) survives because it needs no machinery to survive: `Database.cpp`
resolves `components/<name>.dat` by exact-name path concatenation, so any basis
split is SOURCE-layout, never a runtime directory-walk, and the two decisions do
not conflict.  (This sentence used to credit `generated/indexes/` and
`flatCaches/`, neither of which was ever built — a doc claiming machinery that
does not exist sends the next reader looking for it.)  **General basis reconciliation — the vertical SPIKE is BUILT (2026-08-03),
the MASS MIGRATION stays UNAUTHORISED.**  The two-unit chain
(`tutorials/steady/thermo/basis01_two_unit_chain`) carries the species basis
across a model boundary as MATTER — a `speciation {}` block stamped
`origin "solved:<unit>"` or `"transported:<unit>"`, `solvedAtT` stated — and
a block declaring no `network`/`basis` is REFUSED.  Gate `check_basis_spike`;
record:
[`docs/design/basis-reconciliation-spike.md`](docs/design/basis-reconciliation-spike.md).
**Do NOT generalise to the corpus without Vítor's decision.**  **Grammar
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

`data/standards/` holds the FROZEN, committee-managed reference tree.  `ls
data/standards/` is the authority on both the list and the counts -- this
sentence used to hand-carry a count of its own ("Eight directories") one line
before naming that authority, and it had drifted to nine (§6: the tally is generated, never copied here):
`components/` · `species/` · `chemistry/` (flat) · `parameters/` (the per-model
pair catalogues — `NRTL/ UNIQUAC/ Henry/ Pitzer/ eNRTL/ SRK/ UNIFAC/
adsorption/ solution/`, Migration 2 done 2026-07-16) · `conventions/` (the
versioned convention profiles of the D2 identity) · `assets/` (FLAT with a
`kind` field — Migration 4, 2026-07-16: construction materials, membranes incl.
the CMX_AMX ion-exchange pair, adsorbents, the SAC_Na resin) · `mixtures/` ·
`utilities/` (steam LP/MP/HP, coolingWater, chilledWater, dowthermA,
hitecSalt, refrigerationPG, electricity).  The engine REFUSES to write under
`data/standards/` — new data is a curation act.  That sentence was true in ONE
operation until 2026-09-04 and false in the other thirty-one that take an
output path from a dict; the rule has one home now
(`records::refuseStandardsWrite`) and a gate that recounts its callers
(`check_standards_write_guard`; record: [`docs/design/a-rule-enforced-in-one-place.md`](docs/design/a-rule-enforced-in-one-place.md)).

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

**A NONCOMMERCIAL COMPILATION IS NOT RESCUED BY `via` (settled 2026-09-01).**
For an aggregator (NIST WebBook, CRC) the licence question is
authority-vs-route: a primary read THROUGH one is compliant, because the value
came from the journal.  For a NonCommercial COMPILATION there is no such
route — the arrangement IS what would be copied, and the protocol's phrasing
is *"do not enter their numbers, even cited"*.  What is allowed is the name as
a CROSS-CHECK, which enters no value.  **Burcat / ReSpecTh (the Third
Millennium database) is that class** — "provided free of charge for non
commercial use" — and `check_source_licence` now enforces it, so no new record
can name it as a value's origin.  The records that already do are PINNED in
`debt_registry.NC_COMPILATION` with the remedy (NASA TM-4513 and ATcT, the
clean routes `bin/curate/import_gibbs_nasa.py` already names); whether the
"Burcat 2005 / JANAF" citation is a citable publication or the database under
another name is RESERVED for Vítor.  How it was found, and why nothing was
deleted:
[`docs/design/a-noncommercial-compilation-in-the-public-tree.md`](docs/design/a-noncommercial-compilation-in-the-public-tree.md).
The general rule, which is the durable half: **a licence decision recorded in a
tool's comment is not enforced anywhere — put it in the gate, or it is a
sentence rather than a contract.**

* **`components/` stays PHYSICALLY FLAT — do NOT relitigate (settled 2026-06-07).**
  The loader resolves `components/<name>.dat` by EXACT NAME (`Database.cpp`,
  O(1) path concat, replicated across the tools); category (solid/fluid/family)
  already lives INSIDE each `.dat` (`role`, `standardThermochemistry.referenceState`), and a
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

`listCases` enumerates them all; `runCase tutorials/<category>/<name>` runs one.
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
  (bubble-point) — select `model simultaneous;` (rigorous MESH Newton) for
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
  Geraldes and Pedro Mendes. **The AUTHORSHIP LINE OF EACH GUIDE IS DECIDED IN
  ONE PLACE — `docs/preamble.tex`'s `\manualauthors`** (ruled 2026-08-18,
  Vítor: *"fico só eu"*, on the EduTools Guide).  Today that macro gives Vítor
  Geraldes + Pedro Mendes + Miguel Rodrigues to the Properties and Theory
  Guides, and **Vítor Geraldes alone to every other guide**, the EduTools
  Guide included.  This paragraph used to name the Developer Guide as the sole
  sole-author exception, which had already drifted from the macro that decides
  it — a second home for a fact about who answers for a work, which is the
  worst kind to let drift.  Read `preamble.tex`; do not copy its answer back
  here. Their prose, figures, and explanatory text are
  CC BY-SA 4.0. Code excerpts, Choupo case files, and other machine-readable
  examples included in the guides remain GPL-3.0-or-later. Do not put the
  manuals under GPL wholesale, and do not treat external project contributors
  as guide authors.
  **Authorship of record is not a drafting prohibition (ruled 2026-08-06,
  Vítor: "you are fully authorized to make the development guide.  My role is
  only as a curator").**  An assistant had read the sole-author line as a bar
  on writing into `developerGuide.tex` and declined to, which is the wrong
  reading and cost the guide a slice of material it needed: the line records
  WHO answers for the work, and §1 already states that substantial parts of
  the documentation were drafted with assistance under human curation.  Draft
  freely; the attribution line does NOT change, and the model identifier never
  appears in the tree.
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

* **C++17 — CLOSED 2026-08-27, with the argument that had been missing.**  The
  choice was registered in two places and argued in neither, and
  `property-architecture.md` §106 rejected C++20 because it *"contradicts
  settled decisions (C++17, …)"*, which is circular.  Three facts close it, and
  they were MEASURED, not remembered:
  (1) **`OpenFOAM-dev` compiles with `-std=c++14`** — checked at commit
  `09951d6`, 2026-08-27, on every platform rule in the tree (g++, clang, icx,
  ARM, PPC), not one `c++17` anywhere.  The project this one takes as its
  model is a standard BEHIND us, with a far larger codebase and decades of
  maintenance.
  (2) The WASM toolchain is pinned at **emscripten 3.1.6 (2022)** and the whole
  site is built from it.  In C++17 the gap between g++ 13 and that clang is
  narrow; in C++20 it is wide, so **moving would make the site-breaking failure
  of 2026-08-27 MORE likely, not less** — and it also widens the blind spot
  `check_wasm_dialect` states about itself.
  (3) Nothing here needs it.  This is hand-rolled numerics with no template
  metaprogramming; C++20 would buy convenience, not capability.
  Do not reopen.  If a concrete feature is ever genuinely blocked by C++17, the
  prerequisite is upgrading emscripten FIRST and separately — never the two at
  once.
* **No external libs.**  No Boost/Eigen/Sundials — hand-rolled Newton,
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
  accumulate there), inheriting the case `thermoPhysPropDict` via the cascade until
  something local lands — *the house waiting for the data*, not ceremony: its
  `README` states the folder's PURPOSE, never just "inherits via cascade", and it
  must NOT carry a `thermoPhysPropDict` placeholder (that shadows the case default and
  breaks the run).  The inheritance cascade must be LOUD (per-unit `thermo:
  inherited (global)` vs `LOCAL override — …`, implemented in `runUnit`).  Full
  rationale: [`docs/ai/energy.md`](docs/ai/energy.md) §model boundaries
  (the 2026-06-08 forum that settled it was a session deliberation and is
  NOT in the repository -- this paragraph is the record).

### Things to NEVER do

**These rules are DEFINED in
[`docs/architecture/project-philosophy.md`](docs/architecture/project-philosophy.md)
§4 (level 1).  This file references them and defines none** — settled
2026-08-04: `CLAUDE.md` is a level-4 operational guide, and a level-4 document
cannot define policy that binds the project.  When the two disagree, the
philosophy wins and this list is the stale copy.

* **Never** suggest a Python rewrite or wrapper.
* **Never** add macro magic for self-registration (RTS-style macros).
* **Never** import a heavy CFD framework or any heavy dep.
* **Never** joke about "$N in tokens replacing commercial software".
* **Never trade a gate for speed (ruled 2026-09-04, Vítor).**  He raised the
  question himself — *"não era melhor seguir a regra do Facebook, move fast &
  break things?"* — and then closed it from experience: he had been burned by
  exactly that on his company's own OpenFOAM simulator.  The same day paid for
  it twice, in facts rather than argument: a spray dryer creating 2948 kg/h of
  water on a case the suite PASSED (nothing looked at closure), and a missing
  `#include <map>` that compiled natively, passed the whole corpus and every
  gate, and would have killed `make wasm` on the next publish — leaving
  www.choupo.org serving a stale bundle with nothing in the tree saying so.
  **Neither was a case failing.  Both were gates seeing what no case can see.**
  The permitted direction is FASTER gates, never fewer: `check_wasm_dialect`
  419 s → 98 s and `check_impossible_phase_pins` 186 s → 0.08 s, both with
  every arm intact.  Do not reopen.
* **Never** skip alignment when proposing architecture changes — propose, wait
  for confirmation, then code.  Amended 2026-08-08: DELEGATE-WITH-DEFAULT items
  ship on a stated, recorded default (philosophy §4 carries the rule and the
  reserved list; `docs/design/queue-ruling-2026-08-08.md` is the ruling).
* **Never name a commercial competitor in the USER-FACING MANUALS** (settled
  2026-07-03).  Scope, phrasing and the tolerated developer-facing exception:
  philosophy §4.  Enforced by `check_doctrine`.

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
* **BURY THE ABSENCE YOU JUST FILLED — in the same commit (ruled
  2026-08-31).**  A capability arriving silently falsifies every sentence,
  test, ADR, comment and example whose truth depended on its NOT existing,
  and nobody re-reads the "we do not have this" lists on the day the thing
  ships.  Measured, not supposed: of the 43 defects a seven-way EduTools
  audit found that night, four were exactly this, and all four were caused
  by work from the preceding 72 hours — the `exergy` op falsified the
  entropy page's own list of absences *and* its design trace;
  `explainProperty` falsified "written explicitly exactly ONCE in the whole
  engine" (and the second site is the op that page's witness runs); the
  CSTR's new monotone-extent refusal falsified "Choupo can express an
  autocatalytic law"; and giving `air.dat` its carrier key falsified "air
  cannot be selected here today", twice over.  So when you ship a
  capability, grep the tree for the phrases that name its absence — *does
  not support*, *cannot*, *there is no*, *unavailable*, *not implemented*,
  *no ... anywhere in Choupo* — and settle each against the code.  Delegate
  it if you like: an agent whose ONLY mission is "this now exists; find
  everything whose truth depended on it not existing" does the sweep
  cheaply and has no blast radius.
* **THIS FILE IS THE NEXT SESSION'S MEMORY, so a stale fact in it is not
  untidiness — it is CORRUPTED MEMORY** (same ruling).  There is no
  cross-session store: a session begins from this file and the tree, which
  makes every sentence here something a successor will load as true without
  any way to suspect it.  Keep to invariants, contracts, conventions and
  the reasons behind them; a claim a single commit can falsify does not
  belong here, and belongs even less in the form of a NUMBER.  The
  paragraph that taught this said the pump and the pipe used liquid
  densities 12 % apart — closed on 2026-08-29, still written here on
  2026-08-31, in three homes at once, and read back off this file by a
  session that then briefed an auditor with it.  The auditor read the
  engine instead and returned the correction.  Prefer the durable form: not
  *"X and Y differ by 12 %"* but *"when a document claims a current
  limitation, verify it against the engine before repeating it."*

---

## 11. Quick reference

| Common operation | Where |
|---|---|
| Run a case | `runCase tutorials/<category>/<name>` (auto-dispatches by `application`) |
| List tutorials | `listCases` |
| Full regression | `bin/runTests` |
| A change confined to `gui/` | `bin/runTests --gui` — the app's tests + typecheck + every gate that READS `gui/` (list DERIVED from the gate sources, never hand-kept).  ~3 min against ~30: no corpus case runs and no C++ is compiled, so it says nothing about the solver.  The moment a commit also touches `src/`, `tutorials/` or `data/`, the full sweep is the check |
| Materialise a case's `0/` | `bin/choupo-init0 <case>` (propagates from authored inlets + tear seeds; `--force` regenerates estimates; refuses $variable streams{}) |
| Validate a case WITHOUT solving | `bin/choupo-lint <case>` (read-only: load+compose+0/-completeness+unit-type/duplicate checks + topology-inferred stream roles; bails at the same `Flowsheet::solve` seam as `-init0`) |
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
into `gui/public/wasm/`.  **Default rebuild is `make wasm-gui`** (verified
2026-08-01: the target now builds all four binaries into
`gui/public/wasm/`; never run two `make wasm` concurrently — they clobber
`gui/public/wasm/`).

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

*Last reviewed: 2026-09-03 — DIET BY DEMOTION of §6.  Twenty-four dated
narrative paragraphs that already had a design record were compacted to
their rule, their trap, their gates and their record link (numbers dropped:
they are the class of claim this file says must not live here); every
paragraph WITHOUT a record was left whole, because its content exists only
here, and the thirteen "do NOT relitigate" markers all survive.  What to do
with the record-less paragraphs is the next slice: write the record first,
then demote.  §10's rule that this file is the next session's memory is why
the diet is worth the risk of a lost nuance — a memory a session cannot
finish reading is not a memory.
Earlier (2026-08-31) — a SEVEN-WAY EduTools audit read every lesson
page against the engine it cites (§10's citation-requirement method, run
again at scale): 43 confirmed defects, of which 33 are fixed in five
commits ordered by damage to a student — wrong symbol DEFINITIONS first
(Kremser's L and V were defined solute-free while the engine reads total
stream flows, so a student recomputing A by hand got 1.706 against the
1.535 on screen), then false claims about the engine, then pages
contradicting themselves, then the tests that pinned falsehoods, then
counts and precisions.  Two rules came out of it and are now in §10: BURY
THE ABSENCE YOU JUST FILLED, and THIS FILE IS THE NEXT SESSION'S MEMORY.
The second was paid for by this file itself: the 12 % pump/pipe density
split it recorded as an open limitation had been closed on 2026-08-29, and
an auditor briefed with that sentence went to the engine and returned the
correction.  A general may contradict the emperor, and did.
Earlier (2026-08-29) — the glossing slice landed (§6): every EduTool
lesson defines its symbols, and requiring a `file:line` citation for each one
turned eleven writing tasks into eleven READING tasks, which is where the eight
defects came from.  One of them was a claim this project had written about
itself and pinned with a passing test.  Nothing in §5's settled contracts
moved.
Earlier (2026-08-07) — the ice slice landed (§6): the crystal is a
Phase, `K_f` became a derived anchor, and a status guard that watched one of
two routes was found to have been silently green through its own subject's
promotion.  Nothing in §5's settled contracts moved.
Earlier (2026-08-06): COHERENCE SWEEP after the structural slice, read
end to end rather than patched paragraph by paragraph.  Verified in both
directions: every `check_*` this file names exists and is wired into
`bin/runTests` (the one apparent miss, `check_true_ions`, is named only as the
permanently-green gate that was RETIRED — history, not a dangling pointer),
the §1 layering diagram matches `check_layering`'s BANDS plus its tooling
plane, and `global-invariants.md` reads I17/I18 as HOLDS because they do.
One real drift found and fixed: `domain-glossary.md` quoted the G2
recommendation verbatim under "adopted", but what was adopted is STRICTER than
what was proposed — "verification and regression corpus with a named
validation subset", not "regression and validation corpus", because the second
reads as though the two were comparable halves and the validation subset is
seven cases out of several hundred.  A recommendation quoted as adopted must
be the wording that carried.
Earlier (2026-08-03): the sweep that found four dangling pointers into a
session `memory/` never in the repository, and two hand-maintained tallies
that had drifted — which is why the tally is now a gate.
Earlier (2026-06-06): trimmed to its session-load essentials; the
capabilities narrative, tutorials index, GUI internals + WASM quirks moved
to `docs/engine-capabilities.md`, `docs/tutorials-catalogue.md`,
`docs/gui-internals.md`.  Per-version history →
[`CHANGELOG.md`](CHANGELOG.md).*
