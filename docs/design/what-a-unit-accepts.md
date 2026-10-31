# What a unit accepts: modelled, a declared approximation, or refused

DEV.md 4c C188, item (5).  Status: **DESIGN, decided 2026-10-31 under rule
00; no code yet.**  Defects (1) and (2) of the same commission are shipped
(`check_membrane_feed_scope`, `check_pump_liquid_inlet`); (3) and (4) are in
progress.  This record fixes the contract before any unit is migrated onto
it.

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
