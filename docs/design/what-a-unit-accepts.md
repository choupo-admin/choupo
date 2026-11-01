# What a unit accepts: modelled, a declared approximation, or refused

DEV.md 4c C188, item (5).  Status: **DESIGN decided 2026-10-31 under rule
00; SLICES A, B AND C BUILT the same day** (sections 9, 10 and 11): the
contract, its one checking function, the pre-solve pass, `--describe-units`,
the seven units that already refused migrated onto it, the declared
pass-through on the electrodialysis stack, the batch diafilter's `models`
rule, and the generated "models / may pass / refuses / needs" text in
docs/ai and the GUI.  Defects (1)-(4) of the same commission are
shipped (`check_membrane_feed_scope`, `check_pump_liquid_inlet`,
`check_aqueous_solvent_home`, `check_activity_domain`).

## 1. The problem, measured

An external proposal asked for a "chemical component classification and
unit-operation compatibility architecture".  Mapped against the engine
(main a84aa7922, every finding below re-read at its `file:line`):

* **What already exists, and stays.**  One component registry
  (`thermo/Database.cpp`); components and aqueous species apart, with typed
  identifiers (`core/Identifiers.H`) and declared bridges (`aqueousMapping`,
  `dissociatesTo`, crossed only in `AqueousChemistry::singleMaster`); both
  bases on every resolvable stream, verified by `m = A n`; electroneutrality
  in the speciation; membrane and stack catalogues as `assets/` records,
  apart from the chemistry.  None of this is redesigned.
* **What is absent.**  No unit DECLARES what it accepts.  Every refusal is a
  `throw` inside that unit's `solve()`, reached only when its turn comes;
  nothing checks a flowsheet before it runs; the GUI, the F1 help and
  `docs/ai/unit-ops.md` describe each unit in prose that nothing ties to the
  refusals.  Where a unit forgot to refuse, a wrong answer left at exit 0 --
  the two defects this commission shipped first (an RO module that re-counted
  ethanol as water, a pump that pumped vapour).

The proposal's own instinct -- a universal ontology of component types and
of "material states" -- is REJECTED (section 7).  What is missing is
narrower: a declaration, per unit, that the engine reads.

## 2. Three states, never two

For a unit and a stream it is handed, every PRESENT component is in exactly
one state:

1. **MODELLED.**  It enters the unit's equations, because the declared
   models can price it inside their DECLARED domain.  Ethanol diluted in a
   wine is modelled when the package computes its activity (Vitor,
   2026-10-31); the aqueous speciation is valid while water is the dominant
   solvent -- a criterion the MODEL states, with its reason (item 4), never a
   universal threshold.
2. **A DECLARED APPROXIMATION ("passes through").**  It crosses the unit
   without entering its equations: a little benzene in a second liquid phase
   through an electrodialysis stack (Vitor, 2026-10-31).  The CASE declares
   it, with its fate; the engine never assumes one.
3. **REFUSED.**  By name, naming both remedies: a model that prices it, or
   the pass-through declaration.

A unit with no notion of components it does not model (a mixer, a heater)
models everything it is given; the three states matter only where a model
covers a SUBSET of what a stream can carry.

## 3. The contract: one declaration per unit class

Each unit class answers ONE virtual, in C++, beside `readsInteriorKinds()`
and `utilityPorts()`:

```cpp
//  What this unit accepts.  Read by the pre-solve pass, by the unit's own
//  solve (on the stream it is actually handed), and by the generated
//  documentation.  Default: accepts every phase and models every component.
virtual UnitAcceptance acceptance() const;
```

`UnitAcceptance` is DATA, not code paths:

| field | meaning | RO module (example) |
|---|---|---|
| `phases` | the inlet phases the model is written for | `liquid` |
| `solvent` | whether a declared aqueous solvent must be present (and dominant, per the package's own domain) | `aqueous, required` |
| `models` | a predicate naming the components the equations carry, as a SENTENCE and as a test | "the solvent, and every component the case declares `role nonvolatile` with a `B_s`" |
| `requires` | package capabilities read by name (`aqueousChemistry`, `electrolyteModel`, `liquidMolarVolume`, ...) | `osmoticPressure` |
| `passThrough` | whether a pass-through may be declared, and the FATES this unit offers | `permeate`, `retentate` |
| `refusesAlso` | conditions outside the predicate, each with its sentence | `a feed with no water` |

Two rules make it one source:

* **The unit's own refusals are the contract applied, not a second copy.**
  `solve()` calls the ONE function `checkAcceptance(unit, inlet, thermo)`
  on the stream it is handed; the throws that exist today (RO, ED stack, ion
  exchanger, pump, crystalliser) move into that function's sentences, by
  name, with their remedies.  A refusal that is not in the declaration
  cannot be written.
* **The documentation is generated from it.**  `choupoSolve --describe-units`
  prints every registered unit's `UnitAcceptance` as JSON; the GUI's unit
  panel, the F1 page's generated "What this unit models / may pass / refuses"
  section and `docs/ai/unit-ops.md`'s same section are written from that
  file by a generator under `bin/curate/`, held by a freshness gate.  The
  prose a human writes around it stays prose; the three lists are never
  hand-written.

## 4. When it is checked

* **Before the solve**, in `Flowsheet` beside `validateSequentialPlan` (and
  so in `choupo-lint`): every AUTHORED inlet is resolved once
  (`flashState::resolvedInletVaporFraction`, the one home) and checked
  against the unit that consumes it.  A refusal there costs a student
  nothing and points at the case file.
* **At the solve**, on the stream the unit is actually handed: a produced
  stream exists only then, and a recycle may carry a component the first
  pass did not.  The same function, the same sentence.
* **Never by a symptom.**  The check reads the declaration and the stream's
  resolved state; it never infers acceptance from a number the solve
  produced (the 200 K bubble-point lesson, C186).

## 5. The pass-through declaration

In the unit's own block, beside `operation` -- it is about THAT unit, not
about the thermophysical system:

```
{
    name        ED1;
    type        electrodialysisStack;
    ...
    passThrough
    {
        benzene { fate diluate; }
        reason  "trace organic in a second liquid phase; the stack's ion
                 transport does not act on it";
    }
}
```

* Authorisation is the block's PRESENCE (the `approximations {}` posture,
  section 5 of CLAUDE.md): a component listed that the unit MODELS refuses
  (a listing nobody needs is a comment that reads like a decision); a fate
  the contract does not offer refuses; `reason` is required, because the
  claim is about a mechanism the engine cannot verify.
* The component enters every BALANCE -- mass, element, and energy where its
  enthalpy is priceable -- so the closure stays verifiable.
* It is RECORDED on the ProblemDivergence channel as a
  `declaredApproximation` (locus: the unit; requested: "pass through
  <component> to <fate>"; reason: the case's), so it is above the caveats in
  the run, in the result JSON and in `converged/problemDivergence`.
* It may only be offered by a unit whose model the component does not
  disturb: the contract's `passThrough` field is `none` for a unit where any
  foreign component changes what the model computes (an RO module, whose
  osmotic pressure is the solvent's activity, offers it only for a component
  the case also declares nonvolatile-and-inert -- the exact fates are
  settled when RO is migrated, measured, not argued here).

## 6. Migration

* No corpus case changes.  Measured before each step: a unit migrated onto
  the contract must run every case that reaches it byte-identical, because
  the refusals it already had are moved, not changed, and a case that ran
  could not have triggered one.
* Order: the units that already refuse (spiralWoundModule, ED stack and
  batch ED, ion exchanger, pump, crystalliser), one per slice; then
  `--describe-units` and the generated documentation; then the pre-solve
  pass; then `passThrough`, first on the electrodialysis stack (Vitor's
  example), with a witness.
* Item (4) of C188 -- each activity model declaring its own validity
  (temperature, ionic strength, the dominant-solvent criterion) -- is the
  same idea one layer down, and lands before the `solvent` field is read.

## 7. Rejected

* **A mandatory identity-type field on every component record** (molecular /
  ion / analytical salt / mineral / polymer / pseudocomponent).  The facts
  already derive from the record (`dissociatesTo`, `solidPhases{}`, the
  species catalogue); a second statement of them is a second home that
  drifts, and 609 records of curation for no answer the engine cannot
  already give.
* **A universal "material state" classifier** (aqueous electrolyte, organic
  solution, slurry, ...) with thresholds.  Each model declares its own
  domain; a global label would be one more home for a judgement the model
  already makes, and its thresholds would be invented.
* **"Water + ethanol in aqueous RO is an error."**  Wine and beer
  dealcoholisation by RO is industrial practice; the transport model's
  domain decides, not the presence of ethanol.
* **A default fate for an unmodelled component.**  Where a component goes
  in a separator IS a model choice; a default would hide it.
* **Commercial membrane selection** -- deferred, as the proposal itself says.

## 8. Not decided here, named

* The capability vocabulary of `requires` (its words come from the package
  queries that exist; the list is fixed when the first three units are
  migrated, not invented up front).
* Whether a recycle that brings a new component into a unit after the first
  pass refuses at once or at the converged state (measured on the first
  recycle that reaches a migrated unit).

## 9. Slice A, as built (2026-10-31)

What exists now, and the choices the design left open that the build had to
settle:

* **`UnitAcceptance`** (`src/unitOperations/UnitAcceptance.H`) is a struct of
  data: `declared` (false on the default, so `--describe-units` can tell an
  unmigrated unit from one that declared "everything"); `phases` (liquid /
  vapour, each with its `why` and `remedy`); `solvent` (`aqueousRequired`,
  read through `ThermoPackage::findAqueousSolvent`, the one home of the
  solvent since C188 item 3); `models` (a CLOSED rule word --
  `everyComponent` | `aqueousSolventAndNonvolatileSolutes` -- with its
  sentence, its `why` and its remedy: a word rather than a free lambda so the
  test has one home and the generated docs can print the rule);
  `passThroughFates` (empty everywhere); `refusesAlso` (id, sentence, remedy
  and a test returning the violation's detail -- no unit uses it yet).
  `requires` (section 3's package capabilities) is NOT in the struct: its
  vocabulary is fixed when the first three units are migrated (section 8),
  and an empty field would be a field nobody reads.
* **`acceptanceFindings`** (`UnitAcceptance.cpp`) is the one place an
  acceptance refusal is written: one finding per violated clause, each naming
  the unit, its type, the stream, the fact and the remedy.
  `checkAcceptance(unit, inlet, thermo, where)` throws them at the unit's
  solve; the pre-solve pass collects them.
* **The inlet's phase is resolved only when the contract restricts phases**
  (`acceptanceInletOf`): resolving it for a unit that accepts every phase would
  run an inlet flash, and raise its advisories, on a unit that never asked.
* **The pre-solve pass** is `Flowsheet::checkAuthoredInletAcceptance`
  (`src/unitOperations/flowsheet/FlowsheetAcceptance.cpp`), called once in
  `solve()` right after the undetermined-saturation refusal and before the
  lint seam: every AUTHORED inlet with F > 0 of every unit whose class
  declared a contract, utility ports excepted, in that unit's OWN world
  (`thermoFor`).  Under `--lint` the findings join the lint's list
  ("authored inlet not accepted: ..."); otherwise they refuse the run before
  the flowsheet banner prints.  A produced stream is checked only at the solve.
  The contract applies to every process inlet of a unit; both migrated units
  have one, and a per-PORT contract waits for a unit that needs it.
* **`choupoSolve --describe-units`** prints every registered type's contract
  as JSON (`schema unitAcceptance-v1`), needing no case.
* **Migrated:** `spiralWoundModule` (aqueous solvent required; models the
  solvent and the `role nonvolatile` solutes; no phase rule, because none
  existed and slice A adds no refusal) and `pump` (liquid only).  Their
  refusals MOVED: the RO module's from deep in its solve to the point where
  its feed composition is read, so a feed it cannot accept is refused before
  any membrane record is looked up.
* **Gate:** `check_unit_acceptance` (sabotages in its docstring).

**What remained after slice A** is section 10's first half; what remains
after slice B is its last paragraph.

## 10. Slice B, as built (2026-10-31)

* **Five more units on the contract**, each refusal MOVED (same condition,
  same remedy, now written by `acceptanceFindings`):
  * `electrodialysisStack` -- aqueous solvent in both channels; the IONS
    (rule `aqueousSolventAndIons`: every other present component crosses its
    declared bridge, `AqueousChemistry::singleMaster`, to ONE species with a
    record in the catalogue -- the bridge's own refusal sentence travels in
    the finding); at least one ion per channel (`models.atLeastOne`); the
    case's aqueous activity model (`needs aqueousActivityModel`).  These were
    four throws in the stack's solve and in `edCell::buildChannel`.  The
    builder keeps its guards: the batch rig rebuilds a channel at every
    instant, and a diluate the run itself strips of ions is a RESULT the
    contract cannot see (check_ed_batch S9/S12 meet exactly that guard).
  * `ionExchanger` -- the same rule, the same need, its own sentences; four
    throws moved.
  * `crystalliser` -- judged on the COMBINED feed (`appliesTo combinedFeed`,
    new: a brine and an antisolvent are one liquor; judging the antisolvent
    inlet alone would refuse every drowning-out case).  Two `refusesAlso`
    conditions: a crystallisable solute (the package's electrolyte salt, or a
    present component with `solubility {}`), a volatile carrier.  The
    auto-selection of the solute has ONE home, `crystAutoSolute`, read by the
    contract and by `crystSaturation`.  An operation-selected solute
    (`operation.solute`) is the unit's CONFIGURATION, not its feed: its two
    refusals stay inside `crystSaturation`, which the batch crystalliser (not
    migrated) also calls.  "The feed is not supersaturated" is NOT in the
    contract: the saturation is the model's answer at the declared T_op, a
    result of the solve (section 4's "never by a symptom").
  * `batchElectrodialysis`, `batchDiafilter` (choupoBatch).  **choupoBatch
    has no pre-solve seam**: `BatchUnitOperation` gained the same
    `acceptance()` virtual, and a declaring vessel judges its INITIAL HOLDUP
    in its own `initialise`, which runs for every vessel before any vessel
    steps.  `checkAcceptance(acc, type, ...)` is the overload for a unit that
    is not a `UnitOperation`.  The rig judges both tanks; "the diluate carries
    N cation(s) and M anion(s)" was NOT moved -- it is read off the built
    channel and concerns the diluate tank alone, while a contract applies to
    every tank (a per-port contract would host it).  The diafilter's one
    refusal (no aqueous carrier) moved; no `models` rule was added, because
    slice B moves refusals and adds none.  NAMED, not fixed: a diafilter
    holdup component that is neither the solvent nor `role nonvolatile` is
    never refused and never permeates -- retained whole, in silence; that is
    the RO module's defect (1) one unit along, and its rule is the RO
    module's.  (Closed in slice C, section 11.)
* **`needs`** is section 3's `requires`, spelled `needs` because `requires`
  is a C++20 keyword (`check_wasm_dialect` promotes the C++20-compatibility
  family).  Its vocabulary is ONE word today, `aqueousActivityModel`, the
  only package capability the three ionic units read by name; a capability
  is about the PACKAGE, so its finding names no stream and the pre-solve
  pass keeps one copy of it.
* **`choupoBatch --describe-units`** prints the vessels' contracts through
  the same writer (`describeAcceptancesJson`); the JSON gained `appliesTo`,
  `needs`, `models.atLeastOne`, and `passThrough` became `{ fates, why }`
  (schema still `unitAcceptance-v1`: nothing read it yet).
* **`passThrough` (section 5), on the electrodialysis stack only.**  The
  grammar is section 5's.  `passThroughFindings` is the one place its
  refusals are written: a unit that offers no fate (judged for EVERY unit
  that carries the block, migrated or not, in the pre-solve pass -- a block
  an unmigrated unit would silently ignore is a decision the case thinks it
  took); a name that is not a component; the aqueous solvent; a component
  the unit MODELS; an unknown key; a missing or unoffered `fate`; no
  `reason`; an empty block.  A covered component is ACCEPTED by
  `acceptanceFindings` (not judged by `models`, not counted by
  `atLeastOne`).  `recordPassThrough` puts one `declaredApproximation` per
  (unit, component) on the ProblemDivergence channel, deduplicated there.
  **The fates the stack offers are `diluate | concentrate`, the outlet that
  carries ALL of the component the stack is fed (both channels together);
  no split fraction is offered**: dividing a component between the channels
  is a transfer across the membranes, a partition the declaration says the
  stack does not perform, and a fraction would be a fitted number with no
  mechanism behind it.  A fate that moves a component out of the channel it
  was fed in is the case's claim, and the run prints the amount.  The stack
  carries the component unchanged in amount to its outlet; `buildChannel`
  skips it (it is not an ion of the channel, and the molalities are taken
  on the solvent, so no stack number moves).
* **Witness** `tutorials/steady/electrodialysis/ed10_passthrough_benzene`:
  ed01 with 0.01 kmol/h of benzene in the diluate feed, declared `fate
  diluate`.  Measured: benzene 0.01 kmol/h (2.778e-6 kmol/s) in the diluate
  feed, 0.01 kmol/h in the diluate, 0 in the concentrate; the stack's mass
  row 653.6157 kg/h in and out (100.0000 %); carbon 0.06 kmol/h in and out
  (100.0000 %, residual 7e-18); one `declaredApproximation` in the banner,
  the result JSON and `converged/problemDivergence`; and every stack KPI
  (U 13.5060661272 V, demin 0.831450327632, i_lim 131.456 A/m2, ...) equal
  to the benzene-free twin's to every printed digit.  The ENERGY balance of
  this case is UNAVAILABLE -- ed01's Na and Cl records carry no enthalpy
  datum -- so the pass-through's first law is visible only on the priceable
  part (the water + benzene enthalpy flow, -1426.72995812 kW, is the same on
  the diluate feed and the diluate).  Read against ed01 the voltage differs
  in the fourth figure: ed10 was sealed against the Choupo-2608 catalogue
  (different curated Na/Cl diffusivities), ed01 against 2607.
* **Gate** `check_unit_acceptance`, arms (f)-(k) added (sabotages in its
  docstring).

**What remained after slice B** is section 11's last paragraph.

## 11. Slice C, as built (2026-10-31)

* **The diafilter's defect, reproduced and closed.**  diafilter01 with
  0.001 of ethanol in the holdup (manifest removed, `ethanol` added to the
  components): the parent ran to exit 0 and reported `n_ethanol_final
  0.0005555` -- exactly the 0.001 x 0.5555 kmol it was charged with --
  after 5.43 diavolumes that washed NaCl down to 50.2 %.  Ethanol, which a
  loose NF membrane passes nearly freely, was retained whole and nothing
  said so: the RO module's defect (1), one unit along.  `batchDiafilter`
  now declares the module's rule, `aqueousSolventAndNonvolatileSolutes`
  (its transport builds a permeance only for the `role nonvolatile`
  solutes), with the module's remedy, and the same holdup refuses by name
  at initialise: `'ethanol' (z = 0.001000): role 'volatile'`.  The three
  diafilter cases carry only water and `role nonvolatile` salts, and run
  unchanged.  The remedy text is a near copy of the module's (the module's
  file was being edited by another slice; one home for the sentence is
  named, not built).
* **The generator** `bin/curate/gen_unit_acceptance_docs.py` runs BOTH
  binaries of the tree (`--describe-units`) and writes, for every unit
  that DECLARED a contract, four lists -- models / may pass through /
  refuses / needs -- each sentence the declaration's own, in two places:
  a region of `docs/ai/unit-ops.md` between `<!-- BEGIN GENERATED
  unit-acceptance <types> -->` / `<!-- END ... -->` markers, and
  `gui/schemas/unitAcceptance.json` (where engine-derived GUI data lives:
  `propsFileTraffic.json` is its precedent).  One renderer serves both, so
  the GUI computes nothing.  A region is rewritten in place; a declared
  unit without one gets one just before the first heading after its own; a
  region for a unit that no longer declares is removed; an undeclared unit
  gets nothing (silence keeps meaning "nothing declared").  A type and its
  aliases share a heading and one region (`spiralWoundModule,membraneSW`),
  and the generator refuses if they ever declare different contracts.  The
  hand-written "Accepts" paragraphs of slices A and B (crystalliser, ion
  exchanger, ED stack, the choupoBatch intro) are replaced by the regions;
  the ED stack's `passThrough` grammar and semantics stay hand-written,
  because they explain a declaration, not the contract.
* **Registered** in `generated_artefacts.py` as two entries (the region,
  conflict `human`, scope `region`; the JSON, conflict `regenerate`; phase
  `build`), and its `--check` is a `bin/runTests` row
  (`unit-acceptance-docs`).
* **GUI**: the Internals "Model" tab (`InternalsView.tsx`), which already
  shows the unit's catalogue section (`modelDocs.modelSection`), draws the
  four lists above it from the JSON (`case/unitAcceptance.ts`), and
  `modelSection` drops the generated region from the raw text so it is not
  shown twice.
* **Gate** `check_unit_acceptance`, arms (l) (the diafilter refusal fires
  by name through its contract) and (m) (the generated text is current and
  names exactly the declared units, in both outputs; the undeclared mixer
  in neither).

**What remains (slice D onward):** `passThrough` on any other unit (the RO
module's fates are to be measured, section 5); per-port contracts (the
batch rig's cation/anion refusal); the batch crystalliser; the `needs`
vocabulary beyond its one word; one home for the RO module's and the
diafilter's shared remedy sentence; a Theory Guide page per unit carrying
the generated section (only docs/ai and the GUI carry it today); section
8's recycle question.

## 12. Slice D, as built (2026-11-01)

* **Per-port phases.**  `UnitAcceptance::ports` (one entry per process
  inlet, in the order of the unit's `inputs (...)`) gives each inlet its own
  `phases`; the pre-solve pass hands `acceptanceInletOf` the inlet's index and
  the unit passes its own index at the solve (`AcceptanceInlet::port`).  The
  message names the port ("the gas feed inlet is not a vapour").  JSON
  gains `ports`; the generator draws one refusal line per restricted port.
* **Units now on the contract** (measured against `--describe-units` before
  the slice: only the RO module, pump, ED stack, ion exchanger, crystalliser and
  the batch diafilter / batch ED declared one):
  * `compressor` -- vapour suction only; its inline refusal MOVED into the
    contract (same remedies; `check_inlet_resolution` arm (q) reads the new
    sentence).
  * `turbine` -- vapour inlet only.  **A real silent defect, new refusal:**
    the turbine priced its inlet with `H_real`/`S_real` (the vapour root at the
    overall composition) and published `vf = 1`, so a liquid or two-phase inlet
    was expanded as vapour at exit 0 -- the compressor's wet-suction defect of
    2026-10-21, one machine along.
  * `absorber`, `stripper` -- ONE declaration (`separation/KremserAcceptance`),
    per-port phases (gas vapour, liquid liquid) and five conditions: the
    refusals that stood in each solve (no solvent, no solute, a non-solute in
    the liquid, steam in the stripping gas) MOVED; **new:** a `role solute`
    with no Henry pair against the solvent is refused -- it failed the
    classification test and fell through to the inert branch, the gas passing on
    unwashed at exit 0.
  * `extractor` -- both inlets liquid (a vapour entered the stage balances as
    a liquid).
  * `evaporator` -- exactly one volatile species; its two throws MOVED into the
    contract (a wine's ethanol + water is refused before any unit runs).
  * `batchCrystalliser` -- the steady crystalliser's contract, ONE declaration
    (`Crystalliser().acceptance()`), judged on the initial holdup; its two
    throws (no solute, no solvent) MOVED.
  * Declared with no refusal of their own, so that the generated page states
    what each models and which approximation it makes: `distillationColumn`,
    `shortcutColumn`, `isothermalFlash` (alias `flash`), `adiabaticFlash`,
    `valve`, `heatExchanger`, `mixer`, `splitter`.  A declared unit that
    restricts nothing is skipped by the pre-solve pass (building its world would
    announce for no finding).
* **The Theory Guide** carries the section "What a unit accepts" (Part I),
  with a table generated by the same generator (`docs/theoryGuide-
  unitAcceptanceTable.tex`).
* **NOT done, named:** `passThrough` on `psa` / `tsaTwinBed` / the adsorbers
  (a component with no isotherm is announced and reported to the light product;
  C188 now says that is a declared approximation, but the isotherm set is the
  unit's CONFIGURATION, which `acceptance()` -- a function of the class alone --
  cannot see; it needs a configuration-aware contract); `heater`,
  `phaseChanger`, `pipe`, the reactors, the dryers, `storageTank`, the other
  batch vessels; the RO / diafilter shared remedy sentence.
