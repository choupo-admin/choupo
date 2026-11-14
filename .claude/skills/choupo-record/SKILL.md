---
name: choupo-record
description: Use whenever authoring or editing a Choupo data record or case dictionary — anything under data/standards/ (components, species, chemistry, parameters, conventions, assets), any case constant/ or system/ dict, and any draft under docs/design/. Also use before proposing new dictionary grammar or adapting a format from another simulator or an external proposal.
---

# Authoring a Choupo record

## Procedure — do this first, every time

1. **Open an existing record of the same kind and copy its form.**
   `data/standards/components/water.dat` for a component,
   `data/standards/species/HCO3.dat` for a species,
   `data/standards/chemistry/HAc-formation.dat` for an equilibrium,
   a passing tutorial's `constant/thermoPhysPropDict` for a case.

2. **A format from outside — another simulator, an AI proposal, a paper —
   is never the base.** Translate it INTO the corpus form. Every field that
   has no counterpart in an existing record is a claim that needs
   justifying, not a default.

   *This step exists because it was skipped on 2026-07-27: a draft was
   written from an external proposal's shape and silently reintroduced
   `role`, a second standard state, and six single-valued ceremony fields —
   all of them settled against, none caught, because `docs/design/` sits
   outside the 84 gates that protect the real corpus.*

3. **Run the gates before claiming done:** `bin/runTests` (or at least
   `bin/curate/check_doctrine.py` and the check_* relevant to what you
   touched).

## The six rules

These are not house style. Each is standard practice in **both** a
proprietary industrial process simulator and an open-source one — two
independent lineages converging on the same thing without contact, which is
the strongest evidence available that they are right.  (This project names no
other simulator in its tree; see
`docs/design/no-competitor-is-named-here.md`.  What is carried here is the
practice, which is what the argument needs — not the product, which it does
not.)

### 1. One quantity, one canonical name, one home

Each of them carries exactly ONE keyword for the formation enthalpy and ONE
for the Antoine coefficients — in the proprietary case a fixed parameter
name, in the open-source case a fixed schema element.  Never "sometimes the
vapour pressure lives here, sometimes there".

Consequences, and note that they follow by DEDUCTION — the rule is what
matters, not this list:
- ONE formation datum per component, in its natural phase.  The other
  phases are DERIVED (`h_liq = h_ig - hvap` — the engine already does this
  in `Component::h_formation`).  Two `dHf_298` entries is the arity sin.
- Storing `Hvap` *and* both formation data is the same sin: they are the
  same quantity twice, and the difference of two dHf inherits ~0.7 kJ/mol
  where calorimetry at Tb measures ~0.1.
- A rendered equation string beside a stoichiometry block is a comment,
  not a field.

### 2. Pair data lives in pair tables, never inside a component

Both lineages index their activity-model interaction parameters BY PAIR, in
their own tables.  Neither puts a binary parameter inside a substance
record.

Consequence: a reaction coupling two component families (an ion pair such as
`Ca+2 + HCO3- = CaHCO3+`) belongs to a shared home
(`chemistry/aqueousComplexes/`), not to either component — putting it in one
makes that component claim the other's family; putting it in both gives the
value two homes.

### 3. The property method is ONE knob; reference states are its consequences

Selecting an electrolyte property method settles the activity model, the
standard states, the Henry treatment and the vapour EoS together.  There is
no per-component place to declare a reference state, in either lineage.

Consequences:
- No `reference` field inside a component's `standardStates`: the rung is
  declared by the phase's property method (`ReferenceRung`, Choupo doctrine).
- No `role` on a component.  Role is a property of the (component, phase)
  PAIR — water is the solvent of the aqueous phase and would be a solute in
  an organic one.  Storing it on the substance is a category error.

### 4. A reaction is defined once and referenced; its standard part declares
its authority

The reaction-set construct in both lineages lets each reaction say whether
K is given or computed from Gibbs energies.  Two independent implementations
arrived at this without contact.

In Choupo: `authority measuredK | speciesData | derivedFromReactions`, per
reaction, never by reaction type.  Authority is a property of the DATA
available for that reaction.  When both routes exist the engine compares
them and prints the difference — this part has no commercial equivalent and
is the point of the project.

### 5. Missing data is a named refusal, never a silent default

The industrial practice is to name the missing parameter and stop.  So does
Choupo, and the message must carry the curation remedy.

Never: a fallback value, a zero that means "absent", a flat T-dependence
that is not announced as flat.

### 6. Estimation and regression are CURATION, not runtime

In both lineages the data-regression facility is a SEPARATE activity
producing reviewable parameters.  Nothing estimates during a simulation.

## The amplifier rule

*A hi-fi amplifier has one volume knob.*

**A field with only one possible value is not a setting — it is doctrine
written in the wrong place.**  Say it once, in the docs, and delete the
field.

Ask of every key you are about to write: *what is the other value?*  If
there is none, it does not belong in a dictionary.  If the answer is "a
value nobody would ever choose" (a `false` that would hide output in a
glass-box simulator), it does not belong either.

Likewise a list that can be derived from what is already written (the
species a component introduces, derivable from its reactions' stoichiometry)
is either redundant or a trap: if it disagrees with the derivation, which
one wins?

## Several laws for one property (DEV.md 4c C398, slice (b))

A property block of a component record may hold several NAMED laws.  The
spellings below were settled through these rules; copy them, do not invent
siblings:

- One sub-block per law; the sub-block's NAME is the law's identifier.  Its
  TYPE is its `model` word, or its name when the name is a registered type
  (`andrade`, `vogel`, `chemsepEq101`, `chemsepEq16`, `tauPower`).
- `preferred <name>;` marks the record's one value of the property: REQUIRED
  with two or more laws, NEVER written with one (the amplifier rule: with one
  law there is no other value).  It is a curation decision, never the order
  of the laws.
- The SOFT window keeps each type's existing keys (`Trange`, `Tmin`/`Tmax`,
  `Tlow`/`Thigh`) -- a `window {}` key would give one quantity a second name.
  The HARD window is `domain (lo hi);` in K, optional; outside it the law is
  refused, never switched.
- A law's SOURCE lives in the record's ONE `provenance {}` block, by
  property and law: `provenance { vaporPressure { SR1 { origin ...; } } }`.
  Never a provenance entry inside another block (gate
  `check_provenance_home`).
- `check { T <v> <unit>; value <v> <unit>; tolerance <fraction>; }` inside a
  law is a number its SOURCE PRINTS, with a TRANSCRIPTION tolerance (half a
  unit of the last printed digit), never a fit's residual; a law fitted to a
  reference formulation the tree evaluates writes `check { formulation
  <name>; }` and stores no number.  Read back through the law (gate
  `check_record_law_values`): a CHECK, never a second source.
- A record stores each quantity's PRIMITIVE once and never types a DERIVED
  one (h/s/g of another phase, a latent heat at T other than Tb, a slope of
  the vapour pressure); a redundant datum is accepted only as a CHECK
  (`dGf_298`).  Gate `check_record_primitives`.
- A CASE chooses a law only by naming one the record holds:
  `pin ( { component <name>; law <name>; reason "..."; } );` beside the
  property, in the case's property dictionary or a variant.

## Where Choupo goes further, and why it must not be traded away

Both industrial simulators lose per-value provenance: the number arrives
without its source, its validity domain, or a comparison against an
independent route.  Choupo keeps `source`, `convention`, `validity`,
`reviewStatus` per value, and cross-checks routes where both exist — that
is the differentiator, not overhead.  Never write a value without its
source, and never promote an INTERIM record without the owner's primary
review.
