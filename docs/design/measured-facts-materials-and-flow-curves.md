# Measured facts, materials and flow curves: one experiments grammar, three forms of the property door (C421 (7), C425, C426)

Kind: PROPOSAL, with measurement.  Status: RULED by the architect 2026-11-18
for sections 2-4, 5b, 5c and 6-8; section 5 (the material) is PUT TO VITOR
on two points of pedagogy before it is built.  Nothing built: no engine,
data, case or golden changed by this record.  SECOND HEAD (same day, C427):
sections 5b (carried quantities) and 5c (the kinds of component) were added
after Vitor asked whether the architecture could be prepared for polymers
now, and three more notes were read (polymer characterisation and
properties in the reference manuals; a textbook of step-growth process
modelling).

Asked by Vitor, in one day: a spray dryer whose syrup viscosity and surface
tension follow a table in temperature and sucrose content; a heat exchanger
whose fluid is known only as viscosity and conductivity against temperature;
a stirred reactor whose power needs the rheology he measures on a rheometer
("tiro a viscosidade aparente em funcao da tensao de corte no reometro");
whether the property architecture is general enough for "filtracao,
secadores, slurries ... em que o sistema e messy e exige dados experimentais
diretos"; and, on the reference manuals he filed: "acho que deve haver uma
falha em componentes nao convencionais".  He was right on the last, and on
the first he had asked before (DEV.md 4c C399).

## 0. What "consolidated" means (2026-11-19, after an outside review)

The architecture is CONSOLIDATED FOR A DECLARED SCOPE when: its contracts
are implemented; the combinations it supports are verified by a witness;
and every combination it does not support is REFUSED BY NAME, with the line
to write or the reason.  It is not a promise that the stream, the door or
the record grammar will never be opened again -- no set of examples can
show that.  A combination with no defined, verifiable behaviour is the
defect; an unsupported one that refuses is not.

## 1. What was measured before writing

* The tree (2026-11-18): the property dictionary holds a mixture's measured
  liquid viscosity and density as ONE point standing over a declared box
  (`measured { <name> { use method|check; reason; } }`, the points in
  `constant/experiments/<name>.dat`); a pure component's liquid viscosity or
  heat capacity may be a table against temperature (`pin`, law type
  `table`).  Thermal conductivity, surface tension and a mixture table are
  refused (`src/thermo/PropertyTable.cpp`, the property check of the table
  reader).  82 sites in 34 source files price a liquid property around the
  door, among them the spray dryer's `operation.liquidViscosity` knob with
  its water defaults.
* A sample's behaviour has three homes: the case's component record (a
  sorption block), an asset record (membranes, adsorbents), and the unit's
  own `operation` (`cakeFilter` reads `specificCakeResistance`, `alpha0`,
  `compressibility`, `mediumResistance`, `wetToDryCakeRatio`).
* Nothing in `src/` models a shear-dependent viscosity, and the stirred
  tank's sizer computes no agitation power.
* Every component needs a formula and a molar mass; streams are molar; no
  enthalpy or density is computed from an analysis.  The property
  architecture's own non-goals say "inert / non-conventional solids not in
  phase equilibrium".
* The study (ten private notes, about 2500 lines, every statement with its
  page): how a breadth-first simulator's manuals treat solids, attributes,
  stream structure, polymers and the property system; Chhabra & Richardson,
  *Non-Newtonian Flow and Applied Rheology*, 2nd ed.; Wakeman & Tarleton,
  *Solid/Liquid Separation: Principles of Industrial Filtration* (2005).
  Three results carry this record.  (i) In that world a sample's data are
  typed in each unit, and for heterogeneous solids no closure rule is
  stated: its own worked coal reactors print the two masses out of balance
  and the total closed.  (ii) Wakeman & Tarleton: a cake resistance is a
  property of the whole sample state, not of the solid -- the same anatase
  changes about sevenfold with pH, a sludge almost tenfold in five days of
  storage -- and "it is poor practice to infer data from a different feed
  suspension"; a test measures an average at its pressure, and two
  legitimate fits of the same six points give different exponents.  (iii)
  Chhabra & Richardson: interpolation of sufficient measured points is
  satisfactory and extrapolation is to be avoided; raw rheometer readings
  are a flow curve only after instrument corrections; a fitted yield stress
  depends on the model fitted.

## 2. One grammar: the experiment record

A measured fact of a case is ONE file, `constant/experiments/<name>.dat`, in
the `constant/` of the dictionary that names it (as today).  What all kinds
share:

```
provenance
{
    citation   "<report or paper, table, page>";
    kind       measured;        // measured | adopted | estimated   (REQUIRED)
    basis      "<what the source says the value is, in its words>";
}
subject     ( ... );            // what the rows are a property OF (section 3)
property    <word>;
conditions  { ... }             // the sample's state that is NOT an axis
columns     ( { name ...; unit ...; basis ...; } ... );
data        ( ... );            // the RAW rows, as measured
authorised  { <axis> (lo hi); ... reason "..."; }   // only when wider than the rows
```

R1.  THE STORED FACT IS THE RAW ROW.  A fitted law (a power law through a
flow curve, `alpha = alpha0 p^n` through filtration tests) is a DERIVED
view: the consumer names the model (`fit { model powerLaw; }`), the engine
fits at load, prints the parameters, the residual of every row and the
range fitted, and stores nothing.  Two fits of one dataset are two views of
one fact, never two facts.

R2.  THREE DOMAINS, PRINTED AS THREE.  The SUPPORT is computed from the rows
(their hull, not their bounding box) and is never typed.  The AUTHORISED
domain is what the case declares when it wants more than the support, with a
reason: a single value stood over a range is a constant-property
approximation and is printed as one.  The INTERPOLATION is declared per
axis.  Inside the support the engine interpolates; between support and
authorised it applies the declared rule and announces the largest excursion;
outside the authorised domain it refuses, at an accepted state always.

R3.  `kind` IS REQUIRED.  `measured` is a measurement; `adopted` is a value
its authors chose to use (the packed-column cases' viscosity is one, by its
own source's words); `estimated` is a correlation's output the case freezes.
The run's property table prints the word.  The dictionary key stays
`measured` for the three (a rename would move sixteen cases for a word); the
record's `kind` is where the truth is told.

R4.  `conditions` ARE PART OF THE IDENTITY.  A column is a variable the
consumer may move along; a condition is a state of the sample the test held
fixed (pH, flocculant and dose, age, the instrument and the corrections
applied, the filter medium).  A consumer whose stream contradicts a
condition the engine can see (a pH, a temperature) is refused or announced
by the rule of the kind; a condition the engine cannot see is printed beside
every number taken from the record.

R5.  EVERY COLUMN HAS A UNIT AND, WHERE IT HAS ONE, A BASIS (dry or wet
mass, per mass of dry solid, per volume of filtrate).  One basis per
analysis: a wet entry beside dry ones is refused.

## 3. Four kinds of subject

| kind | the rows are a property of | axes | consumed through |
|---|---|---|---|
| fluid property | a liquid mixture of a constituent set | T, P, mass fractions of named components | the door, form 1 |
| flow curve | the same, sheared | the above + shear rate or shear stress | the door, form 3 |
| material | a heterogeneous solid sample | none (its analyses) + T for its laws | the door, form 2 |
| sample behaviour | a SYSTEM under a test: suspension + medium, wet solid + gas | the test's own variables | the unit, by name |

R6.  A SAMPLE'S BEHAVIOUR IS NOT A PROPERTY OF A PHASE STATE, so it does not
go through the door.  A unit names the dataset (`sample <name>;` in its
`operation`) and asks one service for the quantity its model needs (the
average specific resistance at its pressure difference, the equilibrium
moisture at its gas state), which answers with the value, the rule and the
support status.  The numbers leave the unit's dictionary; two filters on one
slurry name one file.  Kinds to cover, in the order their units exist:
filtration tests (rows t, V at a pressure, with concentration, wet-to-dry
ratio, area, medium), sorption isotherms (today a block of the component
record), drying curves, settling tests, grindability.  The medium resistance
measured in a filtration test belongs to that test's record: the same book
that defines it says it can come out negative and that the cloth of the
test is the cloth to use.

## 4. The door, in three forms

Form 1, as today: `evaluate(thermo, property, T, P, x)`.  It gains: the
table of a mixture for viscosity, thermal conductivity, surface tension and
density, axes as declared, the components outside the axes stated in
`ignores ( ... )` with a reason; the answer carries the support status.

Form 2, new: `evaluate(material, property, T, P)` on a MASS basis, for
enthalpy and density only.

Form 3, new: `apparentViscosity(thermo, T, P, x, shear)` where `shear` is a
rate or a stress THE UNIT SUPPLIES from its own geometry.

R7.  WHO OWNS WHAT IN A SHEARED FLOW.  The flow curve is the fluid's and
lives in the property dictionary (`transport { liquid { rheology { measured
{ ... } } } }`), declared Newtonian by absence.  The shear rate is the
unit's: a pipe's from its velocity and diameter with the correction for the
curve's local slope, a stirred vessel's from its impeller speed and the
impeller's constant.  That constant and the impeller's power curve are facts
of the IMPELLER and live in an asset record of kind impeller, each with its
source and its stated uncertainty (the book gives a quarter to a third for
the constant, and the power printed carries it).  A unit never holds a
viscosity; a property dictionary never holds a speed.

R8.  A FLOW-CURVE RECORD DECLARES ITS INSTRUMENT AND ITS CORRECTIONS
(`conditions { instrument ...; corrected ( ... ); }`): readings that are not
yet a flow curve are refused as one, naming the correction missing.  A YIELD
STRESS is a datum of its own (`yieldStress` row or record, with how it was
measured), never read off a fit.

R9.  REFUSED BY NAME, from the book's own stated limits: agitation power by
the average-shear-rate concept for a fluid with a yield stress (unyielded
regions), for a shear-thickening fluid and for a viscoelastic one; a laminar
pipe relation past the generalised transition; a time-dependent fluid (no
general law: this record does not model history); a suspension treated as
one liquid without the case declaring it homogeneous, with its reason.

R10.  THE SHAFT POWER IS A STREAM.  Agitation power enters the vessel's
energy balance as work on a named work stream, as a pump's does, and leaves
as enthalpy of the contents.

## 5. The material (PUT TO VITOR on M7 and on the first witness)

M1.  A MATERIAL is a record of `kind material`: no formula, no molar mass,
described by its analyses, which are an experiment record of the case (it is
the sample's): the ultimate analysis with its ash, on ONE stated basis; the
heating value measured, with its basis; optionally the proximate analysis
(for a case that models devolatilisation).  The file is refused when its
fractions do not sum, or when the ash of two analyses disagree beyond their
stated tolerance.

M2.  ON A MASS BASIS, AND OUTSIDE THE MOLE FRACTIONS.  A stream carries its
materials as mass flows beside its molar part, as it carries a size
distribution today; the equilibrium machinery never sees them.  No unit
molar mass is invented.  (This reaches the stream, the mixer, the splitter,
the balances and the state files: it is the large part of the work, and it
is preceded by a spike with written criteria, as the solid-equilibrium work
was.)

M3.  ELEMENTS FROM THE ANALYSIS; ASH IS CONSERVED AS A MASS OF ITS OWN.  The
element balance reads the same numbers the enthalpy reads, so the two
closures cannot disagree.

M4.  THE STORED FACT IS THE HEATING VALUE.  The formation enthalpy on the
elements datum is derived at load from it and the analysis, and printed with
the sensitivity (a small relative error in a heat of combustion is a large
one in the formation enthalpy it implies).  Heat capacity and density are
declared or measured laws with their windows.  A correlation for a missing
heating value is an `estimated` record, read in its original paper.

M5.  NEVER OFFERED TO AN EQUILIBRIUM.  A unit declares whether it accepts
materials; one that does not refuses by name.  Nothing ignores them.

M6.  A MATERIAL CHANGES ONLY BY A DECLARED CONVERSION: the yield reactor,
built in, on a mass basis, to species and to other materials; the engine
checks every element and the ash and refuses an open balance; its heat is
the difference of enthalpies, never a typed number.

M7.  NO ATTRIBUTE THAT A UNIT EDITS.  Moisture is the COMPONENT water the
solid holds, tied to the gas by the sample's sorption record; a converted
solid (a char) is ANOTHER material with its own analysis.  The cost, stated:
a solid whose composition changes continuously is a few lumped materials.
(Amended 2026-11-19: with Q2's balance equation a material's element masses
COULD be carried with declared rates, which is the honest form of a
continuous conversion; it is out of the present scope and declared so, not
ruled out.)
PUT TO VITOR: is that the right picture for what he teaches?

FIRST WITNESS proposed: a biomass dryer feeding a combustor, the first law
closed across both from the measured heating value.  PUT TO VITOR: this, a
sewage sludge, or an ore?

## 5b. Carried quantities (C427)

THE OBSERVATION.  The material makes a stream carry mass flows beside its
molar part (M2); a chain-growth polymer needs it to carry moments of its
chain-length distribution; the size distribution is carried today.  These
are one concept, and the stream is opened for it once.

WHAT WAS READ.  In the reference world every attributed component hangs a
vector on the stream.  Where that vector has a law it works: a polymer's
flow-type attributes are "primary conserved quantities" that add on mixing,
divide in proportion to their component on every split, and are balanced in
reactors like moles.  Where it has none (the analyses of a heterogeneous
solid) the manuals state no closure and their own examples print open
component balances.  Four habits of that mechanism are NOT taken: the same
fact stored twice (a polymer's flow in "apparent moles of average segment"
and its first moment); up to four equivalent ways to supply one attribute,
the first present winning in silence; a column model that ignores
attributes; property parameters taken from the polymer, else its segments,
else group contributions, a missing group dropped without a word.  The
textbook read beside the manuals uses no moments at all for step growth:
segments (repeat and end) are SPECIES, the chain count is half the end
segments, the number-average molar mass follows; and it says in its own
words that this route cannot give the weight average or the polydispersity.
It prints no atom balance, and admits an energy inconsistency in one heat of
reaction.

Q1.  A CARRIED QUANTITY is extensive, attached to a CARRIER (a component or
a declared set of components of the stream), of a kind in a closed list, on
a DECLARED BASIS and in declared units.  (First written "extensive,
conserved": corrected 2026-11-19 -- extensive does not mean conserved; two
particles that merge keep their mass and halve their number, and a
distribution's moments change under reaction.)  The first kinds: the mass flow of a
material; the size distribution of a particulate carrier (existing); a
moment of a polymer's chain-length distribution.

Q2.  ITS LAW IS PART OF ITS KIND, NOT OF THE CASE: a rule of mixing, a rule
of division, and a BALANCE EQUATION WITH THE PRODUCTION OR DESTRUCTION
TERMS THAT APPLY to the kind (none for a mass; some for a number or a
moment).  Carried quantities ADD
when streams mix.  They DIVIDE WITH THEIR CARRIER when a unit divides a
stream, unless the unit is a model of their fractionation and says so (a
classifier for a size distribution).  They CHANGE only inside a unit that
solves their balance with a declared rate.  A unit that changes the amount
of a carrier and has no rate for what the carrier carries REFUSES by name:
nothing is ignored, and nothing is copied through a reaction.

Q3.  WHAT HAS NO SUCH LAW IS NOT CARRIED.  A moisture content, an analysis,
a quality index are not extensive conserved quantities: moisture is the
component water, an analysis is fixed data of the material, an index is
computed on request.  This is the rule of which M7 is the consequence.

Q4.  ONE HOME FOR A POLYMER'S MASS AND ATOMS: ITS SEGMENTS, AS SPECIES.
A segment is a component with a formula and a formation datum like any
other, so mass, elements and energy close by the rules every case already
obeys.  The first moment is then DERIVED from the segment flows and is never
carried; there are no apparent moles.  Step growth needs no carried
quantity: its chain count is derived from the end-segment flows, and what a
case assumes about the distribution (the most-probable one) is an
ANNOUNCED approximation with its consequence printed, as the existing
`polymer {}` block of the step-growth cases already does in effect.

Q5.  WHAT A POLYMER CARRIES, WHEN IT CARRIES: the zeroth moment (the chain
count, when end groups are not conserved species) and the second (for the
weight average), each a flow.  The distribution itself is never carried: it
is a derived view, reconstructed where a model allows and labelled as such.

Q6.  THE SMALLEST HONEST CHAIN-GROWTH MODEL, for the day a case asks: dead
polymer's zeroth and second moments carried, live chains by the
quasi-steady-state algebra, and the reactions that break the closure of
three moments (transfer to polymer, long-chain branching) REFUSED by name
rather than closed by an unstated assumption.

Q7.  A PROPERTY THAT NEEDS A CHAIN AVERAGE asks for it as a quantity the
package derives from the stream (number-average molar mass from segments
and chain count), through the door's first form; its parameters live on the
segment records, and a missing one is a refusal.

Q8.  THE SPIKE IS TAKEN ONCE, with written criteria, on two subjects: a
material through a dryer and a splitter, and a polymer's two moments through
a mixer, a splitter and one reactor with an analytic answer.  Criteria: mass,
elements and energy close; a quantity entering a unit that neither models
nor refuses it is impossible by construction; the state files round-trip;
no existing case moves.

## 5d. The spike on the stream, with its criteria (C427; written 2026-11-18)

WHAT EXISTS, measured at `src/streams/ProcessStream.H` lines 184-193: a
stream already carries, beside `F`, `z` and `vf`, a solid molar flow per
component `s` and ONE size distribution `psd` of the combined solid; 14
unit sources read or write `.psd`, and the mixer (`Mixer.cpp` 142-300)
combines distributions mass-weighted by hand.  So the stream has been opened
once already, ad hoc: the spike turns that opening into the general one,
and the size distribution is its first tenant, migrated.

THE SHAPE TO PROVE (not to build in full).  A stream gains an ordered set
of CARRIED QUANTITIES, each `{ kind, carrier, values, unit }`; the kinds
are a closed list registered by the explicit-factory pattern of section 5 of
CLAUDE.md (a kind = one class: its law of mixing, its law of division, its
state-file form, its report form).  Kinds in the spike: `sizeDistribution`
(the existing `psd`, carrier = the solid of the stream), `materialMass`
(carrier = a named material, value = kg/s), `chainMoment` (carrier = a
declared polymer, order 0 or 2, value = kmol/s or its moment unit).  The
mixer and the splitter stop knowing any kind: they call the kind's laws.
A unit declares, in its acceptance (`UnitAcceptance`), the kinds it MODELS;
any other kind on an inlet is refused by name before the solve.

CRITERIA, ALL REQUIRED, each a scripted check in the spike's branch:
S1  No existing case moves: every golden byte-identical, `--fast` and a
    `--scope` over the 14 PSD-carrying units' cases; the size distribution,
    migrated into the new mechanism, prints and writes exactly as before.
S2  Mass, elements and energy close on a probe flowsheet that carries a
    material through mixer -> splitter -> dryer-stub, and on a polymer's
    zeroth and second moments through mixer -> splitter -> one reactor with
    an analytic answer (a constant-rate step growth whose moments are closed
    form); each closure printed by the existing balance reports, the gates
    unchanged.
S3  By construction, not by test: a carried quantity entering a unit that
    neither models nor refuses it is IMPOSSIBLE (the acceptance check runs
    before every solve); proven by a probe that adds a `chainMoment` to a
    heater's inlet and is refused naming the kind and the unit.
S4  The state files round-trip: a carried quantity written in `0/` or
    `converged/` reads back to the same bits; an old state file without the
    block reads as "none carried".
S5  The cost is measured: the walk's wall clock on the 14 PSD cases within
    5 % of today's; the memory of a stream with no carried quantity
    unchanged.
S6  The design survives contact: anything the spike shows the record got
    wrong is written back into this section before any further slice.
THREE BEHAVIOURS, each shown on at least two kinds: mixing; division
without fractionation; TRANSFORMATION (the size distribution through a mill
or a crystalliser, the chain moments through the reactor).  Transport and
mixing alone leave the hard part unproven.
OUT OF THE SPIKE: the material's analyses and enthalpy (M1-M4), any polymer
property or kinetics, the GUI.  The spike's verdict is a page in this
record: kept, changed, or abandoned, with the evidence.

## 5c. The kinds of component (C427)

Today a record says `role nonvolatile` or `role solute` (105 records) and
the rest is habit.  One closed vocabulary, read by the records, by the
units' acceptance rules and by the Explorer:

| kind | has | takes part in phase equilibrium | basis |
|---|---|---|---|
| molecular | formula, molar mass | yes | molar |
| pseudo | a declared characterisation, an estimated molar mass | yes | molar |
| crystalline | formula, molar mass, a solid datum | only where a solid phase is declared | molar |
| segment | formula, molar mass; never free | as part of its polymer | molar |
| material | analyses; no formula | never | mass |

An aqueous species keeps its own tree (`species/`).  A POLYMER is not a
kind of record: it is a declaration of the case naming its segments (the
carrier of Q1), so no polymer "component" duplicates what its segments
state.  An oligomer is a molecular record that says which segments it is
made of.  `role` stays what it is, a statement about volatility in a case.
The Explorer follows the vocabulary when records of the new kinds exist.

## 6. What this record does not do

The polymer PHYSICS (property models from segments, phase equilibrium with
polymers, the kinetic schemes of chain growth): section 5b prepares the
stream and the vocabulary for them and builds none; time-dependent and viscoelastic fluids; turbulent non-Newtonian
pipe flow beyond one declared method (the methods differ by up to a half
among themselves, by the book); a neural network as a law (C422, a candidate
with its three conditions).

## 7. Order, and the anchors to hold it to

1. `measured` grows to tables (R1-R5, form 1): the spray dryer's and the
   exchangers' door slices of C421 depend on it.
2. Sample behaviour (R6): the cake filter first.  Anchors, from Wakeman &
   Tarleton, to be re-read on the page images before any is pinned: the
   constant-pressure worked example that yields an average resistance and a
   medium resistance from its own t-V rows, and the tables of measured
   resistance with their conditions.
3. The yield reactor and the component splitter as built-in units (C426's
   first small item; M6 needs the first).
4. Flow curves (R7-R10, form 3): the pipe, then the stirred vessel.  Anchor,
   from Chhabra & Richardson, likewise to be re-read: the helical-ribbon
   agitation example computed from closed formulas, and the pipe examples
   per model.
5. The material (M1-M7), spike first.

Every step carries its guide section, its catalogue entry and its witness
(CLAUDE.md rule 4d).

## 7a. What the first sample-behaviour slice taught (2026-11-19)

Built: the filtration test as the first kind (`src/samples/`), the cake
filter naming `sample <name>;`, Wakeman & Tarleton's Example 4.1 reproduced
from its own rows within 0.5 %.  Five corrections to this record, RULED:
(i) THE ROW WINDOW IS PART OF THE RECORD: which rows a fit uses
(`linearRegion { fromRow; toRow; reason; }`) is an analyst's decision about
the data and is stored with it; R1 holds for everything else (the fit is a
derived view).  (ii) ONE SLURRY, ONE RECORD across cases cannot be met by a
case-local file, because a case is self-contained; when two shipped cases
share a sample, the sample becomes a CATALOGUE record (`data/standards/
samples/`, kind sample, its source and conditions), pinned by hash like any
record -- a sample used by one case stays in that case.  (iii) A STATED law
(an adopted book value with no rows) has no support, so its authorised
domain is REQUIRED and starts at the case's operating point; widening it
needs a reason.  Strict on purpose.  (iv) A measured medium resistance may
be negative (the source says so); the unit refuses to USE a negative one,
by name.  (v) A unit inside a sector reads the sector's own experiments
folder, as table pins already do: to be done with the next kind.  For the
next kinds the service gains declared state AXES (support as a hull, an
interpolation per axis) and one reducer per kind by explicit factory.

## 7b. The closure contracts (2026-11-19, from the second outside review)

Four behaviours must be defined and held by a witness before the scope of
section 0 is called consolidated.  Each is a contract, not new physics.

K1.  A DATUM FLIP IS REFUSED.  A pure-fluid equation's enthalpy is on its
publication's datum, not the elements datum; the source already states the
rule (`src/thermo/pureFluid/PureFluidModel.H`, "Datum": valid only for a
phase effectively pure in the flagged component; a flip across a model
boundary "is hard-refused by the model-boundary audit ... dH ill-posed").
What is missing is the PROOF: a probe of two sectors, one on a pure-fluid
water package and one on a reacting package, joined by a stream, must be
refused by name, and a closed single-package loop must not be.  If the probe
shows the refusal does not fire, that is a defect to fix before anything
else.  A bridge between the two datums (the formation enthalpy of the pure
fluid's reference state) is NOT built; it is the declared way to lift the
refusal later.

K2.  WHO GOVERNS IS PRINTED.  When `pureFluids` sits beside an `equilibrium`
block, the resolved view says, per component and per quantity (phase
boundary, enthalpy, entropy, density, transport), which object answers, and
the composition threshold at which the pure-fluid route gives way.  A
witness pins those lines.

K3.  A PAIR MAY HOLD SEVERAL NAMED PARAMETER SETS.  The identity of a set is
(the species, the model and its convention profile, the set's name); a pair
record gains `sets { <name> { parameters ...; provenance ...; validity ...;
fittedTo vle | lle | vlle | calorimetry; } }` and `preferred <name>;`, the
shape a component record already uses for its laws.  A case that needs
another set says `set <name>;` beside the pair's `source`; the run prints
the set used.  A record with one unnamed set reads as today (the set's name
is `default`), so no existing record or case changes.  The ion components
that share an atom's name (33 `distinctFrom` declarations) are RENAMED to
their species names in a slice of their own; `distinctFrom` stays only as
the grammar of a real homonym.

K4.  THE CASE A STUDENT TAKES AWAY RUNS ALONE.  The exported case (the
sealed form: its records copied and hashed) runs on a build whose catalogue
is hidden, to the same result, and says so; a gate does exactly that on one
case per family.

Declined for the closure, with its reason: a refusal at a solver's TRIAL
state as a recoverable failed step.  Today's behaviour is defined and
witnessed (the run ends, by name); making it recoverable is an improvement
of the solvers, not a missing contract.

## 8. Rejected

* A POLYMER AS ONE COMPONENT IN "APPARENT MOLES" with its true size in an
  attribute: the same mass stated twice, and a stoichiometry that must be
  kept consistent with a reference molar mass by hand.
* SEVERAL EQUIVALENT WAYS TO SUPPLY ONE CARRIED QUANTITY, first present
  wins: two homes at the door.
* MUTABLE ATTRIBUTES CARRIED BY THE STREAM.  They need a mixing rule per
  attribute and a conservation law per attribute; where the reference world
  has one (polymers) it works, where it has none (heterogeneous solids) its
  own examples print open component balances.  An attribute that a unit
  edits is mass appearing without a stream (rule 4b).
* A UNIT MOLAR MASS for materials: it lets mole-based machinery run on a
  number that means nothing.
* THE SAMPLE'S DATA IN THE UNIT: two homes the day two units share a slurry.
* THE FITTED PARAMETERS AS THE STORED FACT: the fit depends on the method;
  the rows do not.
* ONE CALCULATION INTERFACE FOR EVERYTHING: a cake resistance and a flow
  curve do not take the variables a viscosity takes; the grammar is shared,
  the interfaces are three plus the sample service.
* A CALCULATOR THAT READS A RESULT AND WRITES AN INPUT inside the sequence:
  a side channel around the streams; the declared design specification and
  the outer drivers stay the way.
