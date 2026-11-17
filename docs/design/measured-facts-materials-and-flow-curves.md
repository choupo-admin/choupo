# Measured facts, materials and flow curves: one experiments grammar, three forms of the property door (C421 (7), C425, C426)

Kind: PROPOSAL, with measurement.  Status: RULED by the architect 2026-11-18
for sections 2-4 and 6-8; section 5 (the material) is PUT TO VITOR on two
points of pedagogy before it is built.  Nothing built: no engine, data, case
or golden changed by this record.

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
PUT TO VITOR: is that the right picture for what he teaches?

FIRST WITNESS proposed: a biomass dryer feeding a combustor, the first law
closed across both from the measured heating value.  PUT TO VITOR: this, a
sewage sludge, or an ore?

## 6. What this record does not do

Conserved attributes on a stream (the chain-length moments of a chain-growth
polymer); time-dependent and viscoelastic fluids; turbulent non-Newtonian
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

## 8. Rejected

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
