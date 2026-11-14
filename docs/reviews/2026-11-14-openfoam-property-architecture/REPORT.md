# The property architecture of OpenFOAM, read whole, and what it says to Choupo

Date: 2026-11-14.  Asked by the owner: read the property code of the open
CFD toolbox this project's dictionaries descend from "exhaustively, as a
PhD student would", present its architecture in detail, and send the
analysis to the coordinating session as a SECOND OPINION on the property
layout it is about to rule (`docs/design/several-laws-per-property.md` on
`design/several-laws-per-property` at 10f8a39f5, read whole).

Source: OpenFOAM-dev at fed424ace4 (2026-11-13).  Read: all of
`src/thermophysicalModels` (517 files, 87 049 lines), `src/physicalProperties`,
`src/ThermophysicalTransportModels`, `src/twoPhaseModels`,
`src/OpenFOAM/primitives/functions`, `src/fvModels/general/phaseChange`,
the interface-composition and phase-change models of the multiphase
module, and two of its test cases.  Who read what: the reviewing session
read the per-species core, the phase-change and interface code and the
test cases itself (sections 2, 3, 7); four readers it dispatched read the
rest file by file and their notes (2 300 lines, with file and line) are
kept outside the tree; every reader's claim this page leans on that
looked surprising was re-read by the reviewing session (marked "checked").
Not read: the lagrangian spray code that calls the liquid library, the
unit and dimension parser, the interpolation-weights classes, `etc/`.
Paths below are relative to `src/thermophysicalModels` unless they start
with `src/` or `applications/`.  Choupo facts are measured on main at
9910a23a90.  Nothing in the tree was modified.

## 0. For a phone

* **The elegant part is one idea, applied without exception inside one
  phase**: a species declares the SMALLEST independent set (molar mass, an
  equation of state, ONE heat-capacity law, a formation enthalpy, a
  standard entropy, a viscosity law) and every other property is DERIVED
  by code that does not know which laws were chosen: enthalpy and entropy
  by integrating the heat capacity, their pressure corrections from the
  equation of state, Cv, gamma, the Gibbs energy, a reaction's
  equilibrium constant, the temperature from an enthalpy, the latent heat
  as the difference of two phases' enthalpies.  Nothing derived can be
  typed, so nothing derived can disagree with its source.
* **A table is not a special case there.**  A tabulated heat capacity is
  integrated once, at construction, and h, s and g follow from it exactly
  as from a polynomial.
* **It is not a model for phase equilibrium.**  The vapour pressure, the
  activity model (binary only), the Lewis number that stands for a
  diffusivity all live inside the phase-change model's own dictionary,
  and nothing checks the vapour pressure against the latent heat.  On that
  ground Choupo is already ahead.
* **Choupo already has the same derivation in substance** (one formation
  datum, Cp integrals, Kirchhoff across the phase change, EoS residuals,
  g = h - T s).  What it lacks is the UNIFORMITY: vapour pressure and heat
  capacities are per-component law objects built from the record (the
  toolbox's shape); liquid viscosity, conductivity and surface tension are
  package-level models that reach into each record for a sub-block of
  their own name.  That second shape, not the number of laws, is why
  methanol + 2-propanol + water cannot be priced by one word.
* **Three things I ask the coordinator to weigh before ruling** (section
  9): take the layer CONTRACT, not the generic `liquid` class, as the
  ancestor; do not postpone heat-capacity tables, they are the safest
  table there is; and write down, per phase, which data are PRIMITIVE and
  which are DERIVED or a CHECK.

## 1. The dictionary and how the object is assembled

One file per fluid or phase: `constant/physicalProperties[.<phase>]`
(`src/physicalProperties/physicalProperties/physicalProperties.C:40-99`).
Its first block names ONE model per layer:

```
thermoType
{
    type            heRhoThermo;          // which state variable set (psi- or rho-based, solid)
    mixture         multicomponentMixture; // how species combine
    transport       sutherland;           // viscosity and conductivity law
    thermo          janaf;                // heat-capacity law (and so h, s)
    equationOfState perfectGas;           // density and pressure corrections
    specie          specie;               // molar mass
    energy          sensibleInternalEnergy; // which energy the solver transports
}
species (air H2O C3H8O);   defaultSpecie air;
H2O { specie { molWeight 18.0153; }  thermodynamics { ...Cp coefficients... }
      transport { As ...; Ts ...; } }
```

The seven words are joined into ONE C++ template type name,
`heRhoThermo<multicomponentMixture<sutherland<janaf<perfectGas<specie>>,sensibleInternalEnergy>>>`,
and looked up in a table of instantiated types
(`basic/basicThermo/basicThermoTemplates.C:145-173`).  A tuple that was
not compiled is either compiled and linked at run time or refused with a
table of the valid tuples (`:47-128`, checked).  Each species block is
read by its own layers: each layer reads the sub-dictionary of its own
name and passes the rest down.

Consequence worth noting: **one law per layer for ALL species of a
phase.**  A mixture cannot hold one species on a polynomial heat capacity
and another on a table; the type is one.  This is the same restriction
Choupo's liquid-viscosity word has today, and the toolbox lives with it
by keeping the laws generic (a polynomial fits everything).

## 2. One species: five layers, each with a fixed contract (read by the reviewing session)

```
transport  <  thermo wrapper  <  heat-capacity law  <  equation of state  <  specie
```

| layer | what the user declares | what the layer must provide to the layer above |
|---|---|---|
| `specie` (`specie/specie.H`) | `molWeight` | W, R = RR/W, a mass fraction Y used by the mixture algebra |
| equation of state (13 of them) | its constants (`rho`; `Tc Vc Pc omega`; a polynomial; a table) | `rho(p,T)` AND the pressure CONTRIBUTIONS to everything else: `h`, `Cp`, `e`, `Cv`, `sp`, `sv`, `psi`, `Z`, `CpMCv`, `alphav` (`equationOfState/perfectGas/perfectGas.H:118-150`) |
| heat-capacity law (`hConst`, `hPolynomial`, `janaf`, `hPower`, `hIcoTabulated`, `hTabulated`, NSRDS forms, and the `e...` twins on Cv) | ONE law for Cp (or Cv), `hf`, `sf` | `Cp`, `hs`, `ha`, `hf`, `s`, `gStd`, `dCpdT`, `limit(T)` |
| `species::thermo` wrapper (`specie/thermo/thermo/thermo.H`, `thermoI.H`) | nothing | everything derived (below) |
| transport (`const`, `sutherland`, `polynomial`, `logPolynomial`, `Andrade`, `WLF`, NSRDS, `icoTabulated`, `tabulated`) | its constants | `mu(p,T)`, `kappa(p,T)` |

How the layers compose, with the lines:

* The ideal part and the pressure part are ADDED, in every law the same
  way: `Cp = Cp_ + EquationOfState::Cp(p, T)`,
  `hs = Cp_*(T - Tref_) + hsRef_ + EquationOfState::h(p, T)`,
  `s = Cp_*log(T/Tstd) + EquationOfState::sp(p, T)`
  (`specie/thermo/hConst/hConstThermoI.H:87-131`).  For a perfect gas the
  contributions are 0 except `sp = -R ln(p/pStd)` and `CpMCv = R`
  (`equationOfState/perfectGas/perfectGasI.H`); for Peng-Robinson they
  are the departure functions (`PengRobinsonGasI.H:78-200`); for a
  constant-density liquid `h = p/rho` and the rest 0 (`rhoConstI.H`).
* The enthalpy-to-energy conversion is three lines shared by every
  enthalpy law: `Cv = Cp - CpMCv`, `es = hs - p/rho`, `ea = ha - p/rho`
  (`specie/thermo/thermo/HtoEthermo.H`), and the mirror for laws written
  on Cv (`EtoHthermo.H`).
* The wrapper derives the rest, knowing nothing of the laws below it
  (`thermoI.H:76-110`): `gamma = Cp/(Cp - CpMCv)`, `g = ha - T s`,
  `a = ea - T s`, and the equilibrium constant of a reaction
  `K = exp(-Y gStd/(RR T))` with `Kc`, `Kx`, `Kn` from it (`:113-225`).
* **Temperature from an energy: ONE Newton for the whole code**,
  `Tnew = limit(Test - (F(p,Test) - f)/dFdT(p,Test))`, with F the chosen
  energy and dFdT the matching heat capacity, relative tolerance 1e-4,
  100 iterations, a diagnostic re-run and an abort when it fails
  (`thermoI.H:238-299`, `thermo.C:31-34`).
* The `energy` word only chooses which of these the solver transports
  (`specie/thermo/sensibleEnthalpy/sensibleEnthalpy.H:76-116`): the
  field's name, `he`, `Cpv`, and which inversion.  The user never writes
  an initial or boundary enthalpy: they are derived from the temperature
  field's own boundary types (`basic/basicThermo/basicThermo.C:113-155`).
* Even transport derives where it can: Sutherland's conductivity is
  `mu*Cv*(1.32 + 1.77 R/Cv)` (`sutherlandTransportI.H:118-126`); the
  constant model takes `mu` and EITHER `Pr` OR `kappa` and refuses both
  (`transport/const/constTransport.C:44-58`).

**What a user of one gas species declares: W, the Cp coefficients (which
carry hf and sf in the JANAF form), two viscosity constants.  What is
derived: rho, psi, Cp, Cv, gamma, hs, ha, es, ea, s, g, a, K of any
reaction, T from the energy, kappa.**

## 3. Tables and functions: where raw data enters

Two mechanisms, and they are not equally good.

**(a) A table as the heat-capacity LAW (the consistent route).**
`hIcoTabulated` stores ONE table, Cp against T, and nothing else:

```
thermodynamics { hf 0;  sf 0;  Cp { values ((200 1005) (350 1010) (400 1020)); } }
```

The table type integrates itself at construction and keeps the two
running integrals (`specie/thermophysicalFunctions/integratedNonUniformTable1/`,
`intfdT`, `intfByTdT`); then
`hs = Cp_.intfdT(T) + EoS::h`, `s = Cp_.intfByTdT(T) + EoS::sp + sf_`,
`gStd = intfdT + hf - (intfByTdT + sf) T`
(`specie/thermo/hIcoTabulated/hIcoTabulatedThermoI.H`).  The polynomial
law does the same analytically, once, in its constructor
(`hPolynomialThermo.C:60-66`).  **A table of Cp is therefore exactly as
safe as a polynomial of Cp: h, s, g, K and the T inversion follow from
the one stored function.**

**(b) Tables of several properties side by side (the unchecked route).**
`hTabulated` stores hs, Cp and Cv as three independent (p, T) tables;
its entropy and Gibbs energy are `NotImplemented` (checked,
`hTabulatedThermoI.H:139,150`).  `rhoTabulated` refuses to derive any
thermodynamic contribution "not sufficiently accurate" and must be
paired with it.  Nothing checks that the Cp table is the derivative of
the hs table.

**The generic function machinery** (`src/OpenFOAM/primitives/functions`):
a property that is a `Function1` (of one variable) or `Function2` is
selected by a `type` word; a bare number is a constant; types include
constant, polynomial, table (inline `values`, or `file` in native or CSV
format), and every thermophysical function of the species library
(Antoine, the DIPPR 100-107 and 114 forms, Fuller and other diffusivity
forms), each usable wherever a function is expected.  The caller passes
the dimensions of x and y; the user may override the units with
`units (<x> <y>)` and the data is converted once at reading.  The
generic 1-D table's out-of-range behaviour is `error | warn | clamp |
zero | repeat`, DEFAULT clamp (`Function1/Table/Table.C:151-156`,
checked); the thermophysical tables (uniform and non-uniform, 1-D and
2-D) always abort outside their range.  The base class asks every type
for `value`, `derivative` and `integral`; a type that cannot honour one
aborts at run time.

**The generic `liquid` class** (`thermophysicalProperties/liquidProperties/liquid/`),
which the coordinator's record takes as "the organising idea", is the
WEAKEST part of this code and should be read as a warning: its thirteen
slots are independent, so `Cp` and `h` are two unrelated functions the
user supplies; the liquid library has NO entropy (`s` is not
implemented); a slot written as a bare number instead of a
sub-dictionary silently becomes "none" and aborts at first use, not at
construction; `h` is mandatory in practice because the formation
enthalpy is read off it at Tstd (`liquid.C:86`, checked).  It serves the
spray code and is not part of the thermodynamic stack of section 2.

## 4. Mixtures: three declared ways, each honest about its limits

| `mixture` word | how a cell's properties are obtained | exact when |
|---|---|---|
| `multicomponentMixture` (coefficient mixing) | the species OBJECTS are added, weighted by mass fraction; each layer defines what "adding" does to its coefficients (`mixtures/coefficientMulticomponentMixture`) | the law is linear in its coefficients: JANAF and constant Cp, hf (exact for an ideal mixture); molar mass harmonic |
| `valueMulticomponentMixture` | every species is evaluated, then VALUES are combined: harmonic in mass for rho, mass-weighted for Cp, h, e; mole-weighted for mu and kappa (`mixtures/valueMulticomponentMixture`) | ideal mixing of values; the only route for laws whose coefficients do not mix |
| `coefficientWilkeMulticomponentMixture` | thermodynamics by coefficients, mu and kappa by the Wilke formula on each species' own transport object | -- |

The class comments say where the first is wrong: six of the thirteen
equations of state carry "Coefficient mixing is very inaccurate and not
supported" (Peng-Robinson, the polynomial and linear liquids), and
`rPolynomial` exists because a polynomial in 1/rho DOES mix.  There is
no excess property anywhere: every mixture is ideal.  The thermodynamic
mixture and the transport mixture are two separate types so that one can
be mass-based and the other mole-based.  A solver may also ask for any
species alone (`hsi`, `hai`, `Cpi`, `rhoi`, `mui`, `kappai`, `Wi`,
`hfi`; `multicomponentThermo.H:79-309`).

## 5. Reactions: the equilibrium constant is never typed

A reaction is written as a string, `2H2 + O2 = 2H2O`.  Its thermodynamic
object is built by the SAME algebra as a mixture: right-hand side minus
left-hand side, each species' object weighted by its coefficient
(`specie/reaction/reactions/ReversibleReaction/`, read by a reader).
The resulting object's Gibbs function is the reaction's, so `K`, `Kc`
and the reverse rate `kf/Kc` come out of section 2's wrapper with no
input.  A `Reversible` reaction has no key in which an equilibrium
constant could be written; the only alternative is to declare both
rates.  The heat release is `-sum hf_i RR_i`, from the same formation
data.  (Choupo has this: one enthalpy base, `reactionHeat()`, the Gibbs
reactor; and it goes further, since it cross-checks a typed `dH_rxn`.)

## 6. Fluxes: who owns a diffusion coefficient

Not the thermodynamic object.  A separate, separately selected model per
phase, in `constant/thermophysicalTransport[.<phase>]`, owns the heat
flux and the species fluxes and therefore the diffusivities
(`src/ThermophysicalTransportModels`, read by a reader):

1. `unityLewisFourier` (the default when the file is absent, announced):
   D = kappa/(rho Cp), derived, nothing declared;
2. `FickianFourier` with `Dm { O2 <Function2 of (p,T)>; ... }`: one
   mixture diffusivity per species;
3. the same with `D { O2-N2 <Function2>; ... }`: binary pairs, every
   pair required, mixed into a mixture value at each step;
4. `MaxwellStefanFourier` on the same binary `D {}`: for each cell an
   (n-1) x (n-1) system is built and inverted (`MaxwellStefan.C:65-105`),
   the last species closing the sum.

All coefficients are declared "independent of composition"; none is
computed from kinetic theory inside the flux model (the Fuller and API
forms are function TYPES the user selects for a pair).  A thermal
diffusion coefficient per species is optional.  The species enthalpy
carried by diffusion is added to the heat flux from the thermo's own
`hsi`.  **State functions and flux closures are two objects in two
files; the matrix inversion belongs to the flux model, the binary
coefficients are data.**

## 7. Two phases: one exemplary idea and one counter-example (read by the reviewing session)

**The latent heat is not declared.**  In the phase-change base class,

```
has[j] = (pure phase) ? thermos()[j].ha(p, Tchange) : mcThermos[j].hai(specie, p, Tchange);
return has.second() - has.first();      // latent heat of phase change
```

(`src/fvModels/general/phaseChange/phaseChange.C:418-443`).  In the
water + isopropanol evaporation test
(`test/multiphaseEuler/massDiffusionLimitedPhaseChange/waterAndIsopropanolEvaporation`)
the liquid declares for water `hf -1.5879e7` J/kg (the LIQUID's
formation enthalpy), a constant `Cv`, a constant `rho`; the gas declares
the JANAF coefficients; the latent heat at any temperature, and its
slope, follow.  Each phase carries its own formation datum; the pair
must be consistent and nothing checks that it is.

**The equilibrium is not in the property objects at all.**  In the same
case the phase-change model's own dictionary (`constant/fvModels`) holds:
the saturation pressure of each species (`pSat ArdenBuck;`, or an Antoine
block typed there), the activity model (`nonRandomTwoLiquid`, two
species only, with `alpha`, `beta` and the interaction function typed
per species), and `Le 1.0` standing for the diffusivity.  The saturation
curve is never derived from, or checked against, the two phases' Gibbs
energies or the latent heat they imply.  The single-phase cavitation
models do the same with `pSat` (a reader's finding).  Surface tension is
a per-interface function in `constant/phaseProperties`, constant or any
`Function1` of T.

So: inside one phase, properties are asked of the phase's object and
only there; across an interface, the toolbox does what the owner's rule
C397 forbids.  A reader listed the other places where an equipment-like
model types its own property (a lumped mass's rho and Cv, a baffle's
whole solid, wall layers' conductivities, a turbulent Prandtl number
with two homes).

## 8. What it does not have, and Choupo does or must

* No validity window on a law except JANAF's `Tlow/Thigh`, which warn
  and then CLAMP the temperature (`janafThermoI.H:100`, checked);
  polynomial and constant laws are valid everywhere by silence.
* No provenance, source or uncertainty on any datum; a table needs no
  source.
* A default that clamps a table outside its range.
* Defaults for a whole physical closure (unity Lewis) taken when a file
  is absent, announced on one line.
* Registration by macros and static tables; a missing combination
  compiled at run time.  (This project's explicit factories and its
  refusal of both are settled.)
* Defects found by the readers, as evidence that the code is not
  self-checking where data are redundant: in the NSRDS heat-capacity law
  the standard entropy `sf_` is read and never added to `s` or `gStd`
  (checked: it appears only in constructors and mixing,
  `NSRDSThermoI.H`); compiled liquids whose `h` is not the integral of
  their `Cp` (n-heptane, ethane, propane); documentation whose keys the
  code does not read (`hTabulated`'s example, the 2-D table's
  `Tlow/Thigh`).

## 9. What it says to Choupo, measured

**9.1 The derivation chain is already here; say so, and make it the
contract.**  `Component::h_formation` takes ONE formation datum in the
natural phase, crosses the phase change at 298.15 K and integrates the
target phase's heat capacity (`src/thermo/Component.cpp:1186-1260`), so
with a declared liquid Cp the latent heat at T is Kirchhoff's, derived,
as in section 7; `H_real = H_ig + residual` and its entropy twin are
section 2's ideal-plus-contribution (`ThermoPackage.H:329-360`);
`g = h - T s` on one phase is one potential (`:393`).  And the
heat-capacity interface is ALREADY the toolbox's: `Cp`, `H(T, Tref)`,
`S(T, Tref)` are the three pure virtuals of `HeatCapacityModel`
(`src/thermo/heatCapacity/HeatCapacityModel.H:58-66`).

**9.2 Therefore heat-capacity tables need not wait.**  The coordinator's
record refuses them in its first slices because "a hole in a table
becomes a hole in an energy balance" (its 5.5).  Section 3(a) is the
counter-evidence: a table that implements the three functions of 9.1,
with the two integrals built at construction, is one more
`HeatCapacityModel`, and every enthalpy, entropy and Gibbs energy that
exists today follows from it with no other line changed.  The hole is
the hard edge the record already gives every table; "the table must
contain 298.15 K" is then a consequence of the interface (the integral
is taken from Tref), not a special rule.  Of the three table properties
the record orders, Cp is the one where the derived quantities come free
AND consistent; vapour pressure is the one where they do not (9.4).

**9.3 The two shapes inside Choupo are the real finding.**  Vapour
pressure and the three heat capacities are per-COMPONENT law objects
built from the record's own `model` word (`Component.cpp:543`,
`:780-790`): section 2's shape.  Liquid viscosity, liquid conductivity
and surface tension are per-PACKAGE models whose one method takes the
component and reaches into its record for the sub-block of the model's
own name (`viscosityLiquidPure(const Component&, T)`,
`src/thermo/transport/LiquidViscosityModel.H:88`).  The first shape
cannot have the "one word for all components" problem; the second
cannot avoid it.  The smallest coherent change is to give the second
family the first family's shape: the record's block carries the law
(type word, coefficients, window, source), the component builds its law
object at reading, and the package-level word is the MIXING RULE only.
"Several laws per property", "a table", "a case pin" are then all the
same act: choosing which law object a component holds.  The record's
5.1 arrives at the same grammar; this says why it is the right one and
that it is a unification, not an addition.  Count of what is rewritten
at the record level (from the record's own measurement A, not
re-measured here): 543 vapour-pressure and about 1 100 heat-capacity
blocks are already in the target shape; 402 viscosity and 381
conductivity blocks hold named sub-blocks and need the reader to treat a
sub-block's name as its law type; 88 surface-tension blocks are bare and
need a default type word in the reader.  No record file has to change
for slice 0.

**9.4 Write down, per phase, the PRIMITIVE set, and make every redundant
datum a CHECK.**  What the toolbox never lets a user type twice, a
Choupo record can hold twice:

| primitive (stored once) | derived (never stored) | redundant if also stored: a CHECK, announced, never a second source |
|---|---|---|
| formation enthalpy and entropy in the natural phase | h, s, g of every phase; a reaction's heat and K | a typed `dH_rxn` (already a cross-checked override) |
| ideal-gas Cp(T), liquid Cp(T), each ONE law | the sensible legs; Kirchhoff's slope of the latent heat | -- |
| the phase-change enthalpy at ONE temperature (`HvapTb`) | the latent heat at T | Watson's curve where a liquid Cp exists (the record's "two latent heats", `what-water-dat-does-not-say.md`) |
| vapour pressure p_sat(T) | d ln p / dT for the Newtons | Clausius-Clapeyron's latent heat against the derived one; the curve's boiling point against `Tb` |
| liquid volume law | the pressure term of the liquid enthalpy (C390) | -- |

The toolbox's lesson is the first two columns; its section-7 failure is
the third column missing.  The record's 5.5 already proposes the vapour
pressure row's check; generalising it to this table, as a curation gate
per record, is what would have caught the toolbox's own defects of
section 8.

**9.5 Where a property is asked.**  Section 6 supports the owner's rule
and the outside proposal's split exactly: binary diffusivities are DATA
of the phase (functions of p and T, per pair), the composition rule that
makes a mixture value or a Maxwell-Stefan matrix belongs to the flux
closure, and in Choupo's column the flux closure is the film model.  So:
the column asks the package for the binary coefficients, the viscosity,
the density and the conductivity; the film model owns the matrix.  The
package's `liquidDiffusivity` slot should be declared per PAIR-capable
law (a model for all pairs, or a datum for one pair), which is the
toolbox's `D { A-B <function>; }`.

**9.6 What NOT to take.**  One law per layer for all species (9.3 is the
remedy the toolbox does not have); coefficient mixing; the clamp;
derived closures taken by default; the seven-word type tuple (Choupo's
formulation knob already settles activity model, standard states and
reference together, which is the better form of the same idea); phase
equilibrium data inside an equipment model.

**9.7 One inversion.**  The toolbox has one energy-to-temperature
Newton.  Choupo has two named ones in unit code
(`reactorOutlet::temperatureOfEnthalpy`, `ReactorOutlet.cpp:189`;
`VariableVolumeHoldup::temperatureFromEnthalpy`,
`VariableVolumeHoldup.cpp:203`) and, by a rough count that I did not
verify file by file, eighteen unit files that both price an enthalpy and
loop on a temperature.  Not part of the property layout; named so that
the review of the whole of Choupo against the ruled design looks there.

## 10. Requests to the coordinator (no code is changed by the reviewer)

1. Before ruling, say in the record which shape is the target for the
   liquid transport laws (9.3) and whether the legacy word then means
   "mixing rule plus a pin for all", as its 5.4 proposes.
2. Move the heat-capacity table up the build order, or say what besides
   the interface of 9.1 it would need (9.2).
3. Add the table of 9.4 to the record as the statement of what a record
   may hold once, and name the gate.
4. For `liquidDiffusivity`, decide the pair grammar before the next
   rate-based slice (9.5).
