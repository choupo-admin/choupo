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
└── tutorials/                  runnable cases by application field (see §8; the
                                COUNT is generated -- generated/releaseInventory.json)
```

### Git & release conventions

* **Never `git add -A`.**  Stage explicitly per file; keep run outputs and
  editor / auto-saved files out of commits.
* **Git identity** for project commits: `Vítor Geraldes` /
  `talentgroundlda@gmail.com` (the copyright holder).
* **No `Co-Authored-By` trailer** in commit messages.
* **Version** lives in `src/core/Banner.H` (`CHOUPO_VERSION`), `CITATION.cff`,
  and `CHANGELOG.md` — bump them together when tagging a release.
* **Branches & tags (revised 2026-07-29 — this SUPERSEDES the two-branch
  arrangement of 2026-07-20).**  **The default branch IS the development
  line**: `main` carries `Choupo-dev`, continuously updated, no pre-announced
  target version.  A release is an **immutable tag** `vYYMM` (public name
  `Choupo-YYMM`, internal version `YYMM`) — NEVER deleted, moved or reused; a
  `release-YYMM` branch is cut **from that tag only on the day a patch
  actually ships**, never pre-emptively.  Release procedure:
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
├── Simulator core       src/{thermo, solver, streams, unitOperations, flowsheet}
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
├── core/                Dictionary, SimulationResult, Types, Constants
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

* **Proper nouns** — `Vítor Geraldes`, `TalentGround Lda.`, *Métodos
  Computacionais em Fenómenos de Transferência* (the MCFT course), and
  *choupo* itself (the poplar).  A name is not text to be translated.
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
* Compile cleanly with `-Wall -Wextra -Wpedantic`.

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
from the printed beta0, the banner).  Reference case:
`tutorials/props/electrolyte/edwards01_sour_water_activity` — a STRUCTURAL
witness only; no number in it is validated against measurement.  The measured
comparison is the paper's Table 7, which needs the vapour side
(`docs/design/sour-water-stripper-scope.md`).

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
  `bin/runTests` validates them via golden-master KPI + NaN/inf guard + the
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

**A COLUMN OVER A CHEMISTRY — the effective stage K (built 2026-08-04).**
`ThermoPackage::stageK(T, P, zStage, x, y)` is the ONE entry a tray asks for
equilibrium.  Molecular package → forwards to `Kvec`, byte-identical (all 12
column tutorials unmoved).  Reactive package → solves the stage's own
equilibrium at its own (T, P, z) and returns an **effective APPARENT** K; the
apparent components stay the state, the ions stay internal to the stage
exactly as in a flash, and the Jacobian never sees one.  Nested, not rigorous
species-basis MESH — one reactive flash per stage per residual, and a case
that runs it must say so.  **A K-VALUE IS AN INCIPIENT QUANTITY** (paid for
once): K = y/x off the flash is right only while the stage is two-phase and
returns a column of ZEROS the moment a trial state is subsaturated — residual
−1 everywhere, flat in T, singular Jacobian, `Newton iters: 0` over an
untouched guess.  The subsaturated branch uses the equilibrium partial
pressures over the fully speciated liquid, K_i = (p_i/P)/x_i (published per
apparent component as `ReactiveVLE`'s `pEqAtm`; a declared dimer contributes
on the monomer basis).  The branches agree where they meet.  **A trial
composition can leave the simplex** — the Newton overshoots the minor
component first (CO2 at −8.5e-4 against a feed of 8e-3) — so `stageK` projects
onto the simplex and ANNOUNCES it once: negatives clamped (overshoot), exact
zeros left alone (absent means absent).  A refusal raised inside a stage now
names the trial (T, z) that provoked it.  Witnesses: `column12_stage_is_a_flash`
(molecular CONTROL, adiabatic re-flash so the recovered T is an energy result)
and `column13_sour_water_stage_identity` (NH3+CO2/water, 7 Newton iters to
|F| 8e-10, identity closing at 1e-9 **on the ions too**).  Gate:
`check_stage_identity` (4 identity claims + 2 guards + the off-stage negative;
R1 speciation, R2 the declared T read back from the column's own profile.csv,
R3 the twin really reacts), sabotage-verified twice.  Named gap: a reactive
ADIABATIC flash needs its bracket seeded from the feed, not from 200 K — until
then the reacting twin claims the equilibrium half of the identity and
column12 keeps the energy half.  Also fixed on the way: `adiabaticFlash`
priced EVERY inlet as a sub-cooled liquid regardless of its vapour fraction
(silent — it converges, to the wrong temperature); it now reads the stream's
`vf`.  Scope + the record of what the one-stage identity turned into and why:
[`docs/design/sour-water-stripper-scope.md`](docs/design/sour-water-stripper-scope.md) §6a.
Theory: `sec:stagek`.

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
the portable part: `cavett01_recycle_train` (Rosen-Pauls spec verbatim;
Wegstein DEFEATED on the real conditions, Newton 7 it; SRK products beside
the published APR/FLOWTRAN tables) and the Williams-Otto four
(`ctrl12`-`ctrl14`, `ctrl16`: the published x* to all digits, Fig.-2 step,
Fig.-4 PI shape, §5.3 optimum at 99.1 % of the published collocation value
from K=5 shooting — the gap stated up front and measured).  Spec + anchors:
[`docs/design/williams-otto-reference-case.md`](docs/design/williams-otto-reference-case.md).
Pattern for future references: one coherent primary source end to end,
never a blend; provenance of every number stated in the case.

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
recipe01 (react-then-distil INTO a receiver; vessels retain all mass, closure ~1e-15), recipe02 (T-programme + impulses,
2e-15), still06/batch08 (adversarial validity).  Heat-of-crystallisation is
SHARED steady↔batch (`CrystallisationHeat.{H,cpp}`).  **DATUM AMENDMENTS
(A5, 2026-08-01):** an open-boundary unit's declared feed commitment is
campaign matter from t = 0, so a recipe that RE-DECLARES the feed (the fixed
bed's isothermal feed switch, `setParameter feed.<component>` = new mole
fraction) jumps the datum — the jump is priced by the unit
(`takeDatumAmendments()`, `BatchUnitOperation::DatumAmendment`) and ledgered
as `feedAmendment` records against the external boundary; mass/element/energy
closures read the records (witness batch19_feed_switch_purge; gate
check_feed_switch, sabotage-verified; T/u/P swings refuse by name).  Phase
(f), first half SHIPPED (forum #98.3-6 as amended by #99-5): every VALID
ledger record with a service T is allocated to a catalogue utility by the
SAME `pickForDuty` rule the steady report uses (phase-aware dutyPerKg —
condensing steam is latent), campaign cost = Σ E·price, unserved records
LISTED never dropped (`utility_*_kJ/kg/eur` + `utility_cost_eur_total`
KPIs).  The TEMPORAL half SHIPPED 2026-08-03 (form B as ratified): the
demand STAIRCASE on the accepted-driver-step grid
(`reports/utilities/utilityDemand.csv`, row = tStart/tEnd/unit/eventType/
utility/deltaEnergy/averageRate — the rate an explicit step MEAN), the
ledger stays the SOLE authority (per record Σprofile == exact E at 1e-6
rel or the profile is REFUSED and the record stands; unprofiled records
LISTED), impulses are an explicit class (no rate, excluded from peaks,
warned), peaks (`utility_*_peak_kW/_t_peak_s`) come from the canonical
profile only, ONE allocator (the profile inherits each record's
`pickForDuty`).  Samplers live in `noteTimeAdvanced` (a `hasOdeForm()`
unit never runs `step()`).  The reconciliation caught two REAL ledger
bugs on first contact, both fixed with it: (1) transfers were priced
into duty records (`chargeFrom`/`discharge*` mutated before notifying —
recipe01's "reaction" +6716.6 kJ was H(empty)−H(charge), and steam was
billed for a vessel transfer; now `notifyStateWillChange()` closes the
segment PRE-mutation, `notifyStateChanged()` only re-bases); (2) the
driver routed continuous discharges AFTER the clock-note, so hand-off
accumulators lagged their sample window by one step (now
`routeDischarges` → `noteTimeAdvanced` → events, and
`takeContinuousDischarge(tNow)` carries the committed time — the fixed
bed's algebraic carrier outlet must never read its own stale clock).
Witnesses recipe01 (steam peak 16.96 kW at the bring-to-boil vs 0.76 kW
mean — the number the total hides) + recipe02 (impulses) + batch13
(unprofiled listing); gate `check_temporal_utilities` (3 mandated
sabotages).  Full record:
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
repository, so this paragraph is the record of the decision.  **The seal is COMPUTATIONAL
since 2026-08-03** (`sealSchema computational;`, corpus migrated 328/0 —
a sealing-SCHEMA migration, never a scientific reseal): the claim is the
PARSED content (`src/core/DictCanonical`, surface `choupoProps
--canonical-hash/--canonical-dump`; exclusion by typed fields — the
parser's tree — never comment-stripping), so comment/formatting/
unit-spelling drift is COSMETIC (announced, verdict intact) while a
moved value/dimension/key diverges and `onDivergence refuse` fires
exactly as before; the legacy byte hashes stay in the manifests as
historical provenance and seal-drift is now classified
cosmetic-vs-computational.  Gate `check_seal_schema`
(sabotage-verified); record:
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
those were band-aids for the missing persisted-state model.  Migration is
COMPLETE (2026-07-10): `0/` is the ONLY steady state home; a `streams {}`
block in any flowsheetDict (root or nested) is REFUSED loudly — no dual
reader, no fallback.  Full contract:
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
Basis vocabulary: **flowsheet/component basis** vs **aqueous-species basis**
(the older "apparent/true" wording is banned — see §data tree).  This is the
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
across a model boundary as MATTER: a `speciation {}` block a unit solved is
stamped `origin "solved:<unit>"`, and a composition-preserving unit whose
LOCAL `thermo {}` world resolves no chemistry TRANSPORTS its inlet's block
(`origin "transported:<unit>"`) instead of letting the post-solve pass
re-derive it with the global package — that re-derivation was silent
respeciation across a boundary.  A carried equilibrium also states
`solvedAtT` (the outlet is at 332 K carrying a block solved at 313 K; saying
"transported" without saying from where leaves the reader to assume the two
agree).  The reader STORES a verified block (carriage, not just checking),
rows are written in canonical sorted order, and a block declaring no
`network`/`basis` is REFUSED.  Gate `check_basis_spike` — ten criteria, five
refusals, sabotage-verified twice; full record incl. the three finds and the
open questions a migration must answer:
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

`data/standards/` holds the FROZEN, committee-managed reference tree.  Eight
directories, and `ls data/standards/` is the authority on both the list and the
counts (§6: the tally is generated, never copied here):
`components/` · `species/` · `chemistry/` (flat) · `parameters/` (the per-model
pair catalogues — `NRTL/ UNIQUAC/ Henry/ Pitzer/ eNRTL/ SRK/ UNIFAC/
adsorption/ solution/`, Migration 2 done 2026-07-16) · `conventions/` (the
versioned convention profiles of the D2 identity) · `assets/` (FLAT with a
`kind` field — Migration 4, 2026-07-16: construction materials, membranes incl.
the CMX_AMX ion-exchange pair, adsorbents, the SAC_Na resin) · `mixtures/` ·
`utilities/` (steam LP/MP/HP, coolingWater, chilledWater, dowthermA,
hitecSalt, refrigerationPG, electricity).  The engine REFUSES to write under
`data/standards/` — new data is a curation act.

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

*Last reviewed: 2026-08-03 — COHERENCE SWEEP after the week's seven
doctrine slices, read end to end rather than patched paragraph by
paragraph.  What it found is the argument for doing it: four dangling
pointers into a session `memory/` that was never in the repository (a
reader would go looking and find nothing); this file's own layout block
still carrying "318 runnable cases" against a tree of 328 — the exact
hand-maintained tally §6 forbids, committed by the file that states the
rule; the same defect in the public README (284); and
`docs/design/unread-dict-keys-proposal.md` still headed "Nothing
implemented" three days after it shipped as `core/DictAudit`.  A rule the
file itself breaks is a wish, so the tally rule is now a GATE
(`release_inventory.py --check`, sabotage-verified).  Verified clean in
both directions: every `check_*` gate this file names exists, and every
gate that exists is wired into `bin/runTests`.
Earlier (2026-06-06): trimmed to its session-load essentials; the
capabilities narrative, tutorials index, GUI internals + WASM quirks moved
to `docs/engine-capabilities.md`, `docs/tutorials-catalogue.md`,
`docs/gui-internals.md`.  Per-version history →
[`CHANGELOG.md`](CHANGELOG.md).*
