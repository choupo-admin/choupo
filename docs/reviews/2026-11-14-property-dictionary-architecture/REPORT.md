# A design reading by measurement: where a case's properties are decided

Date: 2026-11-14.  Asked by the owner, with a proposal written by an
outside assistant after the ternary packed-column discussion, and with
one instruction: look at how OpenFOAM lets a user put raw experimental
data (parametrised functions or tables) into its dictionaries.  Measured
on main at 71203dc590 and later; OpenFOAM-dev read at its master on
GitHub today.  Nothing modified.  This is a reading for the owner and
the coordinator to decide on; architecture is theirs.

## 1. The proposal's diagnosis, checked against the tree

| claim | verdict | measured |
|---|---|---|
| the unit's block can impose a liquid property | holds | `tutorials/steady/distillation/ratebased01_schulz_0p10bar/system/flowsheetDict:99`: `liquidViscosity 3.91e-4;` inside `packing {}`; read at `RateBasedSegment.cpp:233-234`.  Four units read a property from their own block (the two column files, the spray dryer, the pipe) |
| the rate-based solver builds its own liquid diffusivity although the package has a selection for it | holds | `RateBasedSegment.cpp:263`: `const WilkeChang wilkeChang(nullptr);`; the package's slot is `liquidDiffusivity { model WilkeChang; }` (`ThermoPackage.H:661-672`) |
| reading the case's thermophysical dictionary does not tell how the column gets its properties | holds | that case's `transport {}` declares three vapour models, the liquid conductivity and the surface tension; it says nothing on liquid viscosity, diffusivity or density, all of which the column uses |
| two units can get one property by two routes | holds, and the project counts it | `bin/curate/liquid_property_ratchet_debt.tsv`: 80 sites in 44 files where a consumer obtains a liquid property outside the one door (30 conversions, 19 literals, 17 record volumes, 14 direct model calls) |
| thermophysical fragments are repeated in units | holds, small | 7 flowsheets carry a per-unit `thermo {}` |

What the proposal does not know: the project already ruled the
direction.  Since the liquid-density pilot one kernel answers the
density of pumps and reactors, the 80 sites are a debt that may only
shrink, and every run publishes a property-sources table that says, per
consumer, which source was used ("own", "declared", "kernel").  So the
run TELLS what happened; what is missing is that the case's dictionary
DECIDES it, for the transport properties as for the density.

## 2. How OpenFOAM does it (read from its source)

- **One dictionary per fluid, one block that names the model of each
  layer.**  `constant/physicalProperties`: `thermoType { transport ...;
  thermo ...; equationOfState ...; energy ...; }`, then the
  coefficients in `mixture { specie {} thermodynamics {} transport {} }`
  (tutorial `hotRadiationRoom`).
- **A generic liquid whose every property is a run-time selected
  function.**  Class `liquid` (`liquidProperties/liquid/liquid.H`):
  "Generic thermophysical properties class for a liquid in which the
  functions and coefficients for each property are run-time selected."
  Thirteen slots (`rho pv hl Cp h Cpg B mu mug kappa kappag sigma D`),
  each a `Function1` of temperature read from a sub-dictionary of that
  name, each constructed WITH ITS DIMENSIONS; a slot that is absent is a
  `None` function (`liquid.C:44-64`).
- **Raw data enters through the same slot as a correlation.**  A
  `Function1` can be a constant, a polynomial, or a table: `type table;
  values ((x y) ...);` inline, or `file "<path>";`, with
  `outOfBounds clamp;` and `interpolationScheme linear;` declared beside
  the data (`Function1/Table/Table.H`).
- **Tabulated properties of (p, T)** exist as models of the same
  layers: `transport tabulated;` with `mu { low (..); high (..); values
  n m (...); }`, `thermo hTabulated;`, `equationOfState rhoTabulated;`
  (tutorial `wallBoilingIATE`, `physicalProperties.liquid`).
- **No solver holds a property.**  A solver asks the properties object.

The transferable idea is ONE generic function interface for every
property slot: a measured table, a constant and a named correlation are
three values of the same key, in the same file, with the out-of-range
policy written beside the data.

## 3. What Choupo has, and what it lacks, against that

Has: a factory per property with named correlations (Antoine, Wagner,
Andrade, Vogel, the stored forms, Wilke-Chang, Sato-Riedel, ...), each
with a validity window and a citation; mixing rules as objects for the
liquid viscosity; a `measured {}` block with `use method | check` and
`replaces {}` for the liquid density; a formula evaluator with units,
dimension checks and one-dimensional tables (`src/core/Formula`), used
today by rate laws only; sealed case-local records.

Lacks: a way to write, in the case's thermophysical dictionary, "this
property is this number / this table / this expression, from this
source, valid here" for any property other than the liquid density.
That absence is why a measured viscosity is typed into the column's
block.

## 4. On the proposal itself

Agreed: the goal, the eight completion criteria, the rule that a mixture
property is either given directly for a stated mixture or built from
pure-component laws through a named mixing rule, and that a case-specific
choice sits beside the property it changes.

Cautions:

1. **A `thermodynamics {}` block of free choices for h, s and Cp
   collides with two settled contracts**: the one-knob rule (the
   formulation settles activity model, standard states and reference
   together) and the one enthalpy base.  It should be a RESOLVED VIEW
   of what the formulation implies, plus declared data where a datum is
   missing, not a second set of selectors.
2. **Named packages referenced by units** replaces the settled per-unit
   `thermo {}` override.  It is cleaner (one file holds every world of
   the case; OpenFOAM does the same with one file per fluid) and the
   migration is seven cases, but it reopens a ruling: the owner's.
3. **Several named laws per property in a record, and a `piecewise`
   model**, are new record grammar across 687 components.  Not needed
   for the first step: a case-level declared function covers the
   measured-data need without touching the catalogue.
4. The proposal treats this as a new reorganisation.  It is the
   extension of the door of the density pilot to the transport
   properties, which the register already names as owed.

## 5. The smallest coherent change

1. **One declared-function grammar for every property slot of the case's
   thermophysical dictionary**, beside `model <name>;`: a constant, a
   table of (T, value) inline or from a case file, or an expression,
   each with its unit, its source, its validity window and its
   out-of-range word; one reader, built on the existing formula
   evaluator.  For a mixture property the block says whether the datum
   is the MIXTURE's (and for which components and composition) or one
   component's, in which case the mixing rule is named.
2. **A unit's block may not carry a property.**  Once the slot exists,
   `liquidViscosity` inside `packing {}` (and the three siblings) is
   refused with the line to write in the thermophysical dictionary.
3. **The rate-based column asks the package** for its liquid
   diffusivity, viscosity, conductivity and density; its own
   Wilke-Chang instance goes.  The 14 "direct" sites of the ratchet
   follow, then the rest.
4. **A resolved view before the run**: for each property the package
   can be asked, the law, the record or declared datum, the source and
   the window, printed by the engine and drawn by the app.  This is the
   same engine-side publication the property-sources review asked for
   (rows PS-10, PS-11).
5. Named packages, several laws per record and `piecewise` wait for a
   case that needs them.

The witness is the ternary packed column of the next rate-based slice:
with steps 1 to 4 a reader opens one dictionary and follows each of its
properties to the value the column used.
