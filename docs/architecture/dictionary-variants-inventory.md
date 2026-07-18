# Choupo dictionary variants -- complete tutorial-corpus inventory

Status: architecture inventory, 2026-07-17.  This document is descriptive: it
lists the dictionary families and grammar variants needed to cover the complete
Choupo-2607 tutorial corpus.  A label of **current** means that the engine reads
the form today; **legacy** means that the corpus still uses it but new cases
should not; **proposed** means that the architecture needs the form but the
grammar or engine is not complete.

Corpus inspected:

- 289 `constant/propertyDict` files;
- 285 `system/flowsheetDict` files;
- 285 `system/controlDict` files;
- 59 `system/propsDict` files;
- 21 `system/outerDict`, 14 `system/solverDict`, and 8 `system/postDict` files;
- all case-local records below `constant/` and all authored stream files in `0/`.

The important distinction is between a **file family** and a **variant inside
that file**.  For example, `flowsheetDict` has 55 registered unit `type` values;
that does not justify 55 differently named dictionary files.

## 1. Canonical authored dictionary families

| File or record | Responsibility | Required when |
|---|---|---|
| `system/controlDict` | binary, description, verbosity, reports, time control | every case |
| `system/flowsheetDict` | topology, unit declarations, named connections, recipes/controllers | solve, batch, ctrl |
| `system/propsDict` | property operations and regression jobs | props, instead of flowsheet |
| `system/solverDict` | numerical strategy, tolerances, tear streams | non-default numerics |
| `system/outerDict` | sweep, design specification, optimisation, Pareto/grid driver | repeated outer solves |
| `system/postDict` | equipment sizing and costing chain | post-processing |
| `constant/propertyDict` | components and complete thermophysical/property-system manifest | every case |
| `constant/reactions` | named kinetic/equilibrium reaction set | reacting case |
| `constant/components/<name>.dat` | case-local overlay of one component | data differ from standards |
| `constant/parameters/.../*.dat` | case-local pair/model parameter records | non-standard pair/model data |
| `constant/crystallisation` | nucleation/growth kinetics | crystallisation kinetics |
| `constant/dryingKinetics` | drying-rate curve | solid drying |
| `constant/adsorbents/*.dat` | adsorbent identity/structure | adsorption |
| `constant/membranes/*.dat` | membrane identity/transport data | membrane unit |
| `constant/experimental/*.dat` or `experiments/` | measurements used for fit/validation | regression/benchmark |
| `constant/economics` | economic assumptions | costing/NPV |
| `constant/propertyData/manifest.dat` | hashes and closed dependency snapshot | sealed case |
| `0/<stream>` | complete initial state or tear seed for one graph stream | solve, batch, ctrl |

Generated dictionaries/files such as `converged/`, `iterations/`, physical-time
directories, `internalState`, `streams`, `ports`, `runInfo`, reports and CSVs are
outputs.  They are not additional authoring contracts.

## 2. `controlDict` variants

### C1 -- steady state (`choupoSolve`)

`application`, `description`, `verbosity`, optional display `units`, `precision`
and `reports`.

### C2 -- batch (`choupoBatch`)

C1 plus `startTime`, `endTime`, `deltaT`, `writeInterval`; `timeStepping fixed`
or `adaptive` with `timeSteppingControl`.

### C3 -- continuous dynamics/control (`choupoCtrl`)

Same time contract as C2.  `deltaT` is also the controller sample period;
adaptive integration may sub-step the plant between samples.

### C4 -- property service (`choupoProps`)

C1 metadata, but no time loop and no flowsheet.  Work is declared in
`propsDict`.

## 3. `flowsheetDict` variants

### F1 -- one inline unit

One `type`, one `operation`, and `connections`.  Suitable for a focused unit
tutorial.

### F2 -- flat multi-unit flowsheet

`units` is a list of inline dictionaries.  `connections` gives each stream one
stable graph-edge identity.

### F3 -- dignified unit folders

`units ( Mixer Reactor Flash );`; each member owns its own `system/flowsheetDict`
and may own local `constant/` data.

### F4 -- composite sector/plant

`sectors ( FEED REACTION SEPARATION );`, possibly alongside `units`.  Each sector
is another composable flowsheet.  The runtime flattens the hierarchy.

### F5 -- recycle flowsheet

Topology is identical to F2--F4.  The recycle is a normal named edge; its tear
designation and algorithm live in `solverDict`, and its seed lives in `0/`.

### F6 -- batch recipe

F1--F4 plus recipe events such as transfer, parameter changes and conditional
events.  Initial holdups remain state, not topology.

### F7 -- controlled dynamic flowsheet

F1--F4 plus `controllers`, signals, schedules and disturbances.  PID/controller
configuration is topology/control logic; controller state is runtime state.

### Registered unit `type` values present in the tutorials

`PID`, `Schedule`, `Signal`, `absorber`, `adiabaticFlash`, `bagFilter`,
`batchAccumulator`, `batchAdsorber`, `batchCrystalliser`, `batchReactor`,
`batchStill`, `boiler`, `bubbleT`, `componentSplitter`, `compressor`,
`condenser`, `conversionReactor`, `crystalliser`, `cstr`, `cyclone`, `dewT`,
`distillationColumn`, `dynamicCSTR`, `electricLoad`, `electrodialysisStack`,
`equilibriumReactor`, `evaporator`, `extractor`, `fixedBedAdsorber`,
`gasSolidSplitter`, `gibbsReactor`, `heatExchanger`, `heater`, `ionExchanger`,
`isothermalFlash`, `mixer`, `multiStreamHX`, `pfr`, `pipe`,
`pneumaticConveyor`, `prbs`, `psa`, `pump`, `shortcutColumn`, `sinusoidal`,
`solidDryer`, `spiralWoundModule`, `splitter`, `sprayDryer`, `step`, `stripper`,
`tsaTwinBed`, `turbine`, `valve`, `yieldReactor`.

These are variants of the `operation{}` payload.  Their required fields belong
in the unit-operation schema/reference, not in separate top-level dict names.

## 4. `propsDict` variants

`propsDict` always contains `operations ( ... )`; each operation is selected by
`type`.  The complete tutorial set contains:

| Family | Current operation types |
|---|---|
| Point/grid evaluation | `propertyPoint`, `propertyScan1D`, `propertyScanBinary`, `propertyScanTernary`, `moleFraction` |
| Molecular equilibrium/consistency | `activityCoefficients`, `vleConsistency`, `gibbsMap`, `hConsistency` |
| Electrolytes/speciation | `electrolyteActivity`, `pitzerActivity`, `enrtlMultiSalt`, `enrtlMixedSolvent`, `speciate`, `scalingScan`, `exchange` |
| Pure-fluid/phase | `steamTables`, `purePhaseDiagram` |
| Estimation/regression | `estimateComponent`, `linearTbEstimate`, `fitParameters` |
| Kinetics/adsorption/heat transfer | `kinetics1D`, `isothermEval`, `heatTransferBench` |

Future EOS validation should reuse `propertyPoint`/scan operations and add
diagnostic keys, not create a `pcsaftPropsDict`.

## 5. `solverDict` variants

### S1 -- per-unit-type numerical defaults

Named blocks such as `isothermalFlash { tolerance; maxIter; outerAccelerator;
compositionTol; maxOuterIter; }`.  An inline unit may override the same fields.

### S2 -- flowsheet recycle strategy

`tearStreams`, `recycleSolver`, `recycleTol`, and `recycleMaxIter`.  This is the
only home of the numerical fact that a graph stream is a tear.

### S3 -- combined

S1 and S2 may coexist: local nonlinear solver settings and plant-level recycle
iteration are independent axes.

## 6. `outerDict` variants

The corpus has five driver types:

1. `sweep` -- one variable, repeated simulation;
2. `gridSweep` -- Cartesian grid of variables;
3. `designSpec` -- inverse solve for a target;
4. `optimization` -- objective plus bounds/constraints;
5. `paretoSweep` -- multiple competing objectives.

Parameter regression over property data remains a `fitParameters` operation in
`propsDict`; it is not another flowsheet outer driver.

## 7. `postDict` variants

The tutorials currently exercise sizing/costing adapters for `stirredTank`,
`shellTubeHX`, `evaporator`, `sprayDryer`, and `crystalliser`.  A post chain may
combine sizing, purchased cost, installed cost and economic aggregation.  It
must consume simulation results and never become a second physical solver.

## 8. `propertyDict` structural variants

These variants are orthogonal profiles of one thermophysical property-system
contract.  New models do not receive new top-level filenames.

### P0 -- flat compatibility form (**legacy/current reader**)

`components`, `activityModel`, `equationOfState`, optional nested `transport`.
Still dominates the corpus, but new architecture work should target the inline
manifest form below.

### P1 -- molecular gamma-phi

Liquid `activity.ideal`, `activity.NRTL`, `activity.UNIQUAC`, `activity.Wilson`,
`activity.UNIFAC`, or `activity.cosmoSAC`; vapour `builtin.idealGas`, `eos.SRK`,
`eos.PengRobinson`, or a future EOS.  Activity-pair models declare
`parameters.binaryPairs`; COSMO-SAC reads component sigma profiles and has no
binary-pair requirement.

### P2 -- molecular phi-phi

The same EOS is selected for liquid and vapour: currently SRK/PR, proposed
non-associating PC-SAFT.  `parameters.kijPairs` is model-specific and optional
only where a zero interaction parameter is an explicit, announced assumption.

### P3 -- dilute-solution/Henry

`solution { solvent; solutes (...); }`, liquid `solution.henryDilute`, and
`parameters.henryPairs`.  Solvent uses its pure-liquid reference; declared gas
solutes use the infinite-dilution Henry reference.

### P4 -- salt-level electrolyte VLE

Liquid `electrolyte.pitzer` or `electrolyte.eNRTL`, with `inputBasis`, active
salt chemistry, solvent and formula-unit components.  This is distinct from
the per-ion aqueous-speciation activity surface.

### P5 -- aqueous multi-ion speciation

`inputBasis { solvent; apparentComponents; analyticalMasters; }` and
`aqueousActivity electrolyte.davies` or `electrolyte.pitzerHMW`.  Chemistry
activates aqueous reactions, minerals and exchange records.

### P6 -- electrolyte plus volatile gas

Two distinct closures are required:

- open reservoir: operation-level `atmosphere { CO2 <partial-pressure>; ... }`
  pins dissolved species through gas-liquid equilibrium;
- finite gas phase: **proposed**, must solve gas inventory, phase equilibrium,
  aqueous speciation and global balances together.

In a VLE flash, a declared Henry gas solute layers over the electrolyte liquid
surface; it must not replace Pitzer/eNRTL as the whole-liquid method.

### P7 -- multiple liquid phases

`phases { liquidA; liquidB; ... }`, each with one activity/Gibbs surface, for
LLE/VLLE.  A future `phaseEquilibrium{}` bridge is needed when phases use
different standard-state conventions.

### P8 -- solid equilibrium

Solid method plus active `chemistry.salts`/minerals.  Intrinsic crystal and
solid-reference data live in `component.dat/solidPhases`; sample PSD and kinetic
data do not.

### P9 -- pure-fluid fundamental equation

`pureFluids { water { method IF97; } }` routes an effectively pure phase through
a coordinated package for state, caloric and transport properties.  It is not
an activity model or a generic mixture EOS.

### P10 -- transport-complete package

Transport must remain property- and phase-specific:

- gas viscosity and its mixture rule;
- gas thermal conductivity and mixture rule;
- binary/multicomponent gas diffusivity;
- liquid viscosity and mixture rule;
- liquid thermal conductivity and mixture rule;
- liquid diffusivity;
- interfacial surface tension;
- optional electrical conductivity/ion mobility where electrochemical units
  consume them.

The current rich `propertyMethods.transport` shortcut covers only gas viscosity;
it is not a complete transport manifest.

### P11 -- per-unit model override

A unit-local thermo block replaces selected models while retaining the global
component identity set.  Model-boundary enthalpy/reference auditing must be
explicit.

### P12 -- sealed package

Any P1--P11 manifest may be sealed into `constant/propertyData/`.  Sealing
changes resolution/reproducibility, not physical meaning.

## 9. Pure-component record variants

One `component.dat` can carry several of these blocks simultaneously; they are
capabilities, not different chemical identities.

1. volatile molecular component: identity, criticals, vapour pressure, Cp,
   latent heat, liquid volume/density;
2. nonvolatile molecular solute: identity, solution/solid data, no fabricated
   vapour-pressure curve;
3. apparent salt: identity plus `dissociatesTo`/species map and solid phases;
4. crystalline solid/mineral: `solidPhases`, crystal density/shape, equilibrium
   and thermochemistry;
5. gas-only species/radical: gas thermochemistry/NASA representation and no
   invented liquid path;
6. lump/pseudocomponent/polymer: declared average identity and validity limits;
7. group-contribution-capable component: `groups { joback; unifac; }`;
8. COSMO-SAC-capable component: named `cosmo` sets with area, volume, sigma
   profile, variant, source and licence;
9. model-specific EOS-capable component: `eosParameters { PCSAFT { m; sigma;
   epsilon_k; provenance; } }` (**proposed PC-SAFT data contract**);
10. pure-fluid-routable component: enough identity to select an external
    fundamental-equation package without duplicating its tables.

Aqueous model species remain records in `species/<name>.dat` (one `recordType
modelSpecies` file each), not fake process components, except where an explicit
process-stream basis requires otherwise.

## 10. Parameter and chemistry record variants

### Arity-2/model pair records

- activity pairs: NRTL, UNIQUAC, Wilson;
- EOS interactions: SRK, PR and future PC-SAFT `kij`;
- Henry solute-solvent pairs;
- electrolyte cation-anion pairs;
- adsorption adsorbent-adsorbate equilibrium/kinetic pairs;
- solution-property solute-solvent records.

### Higher-order electrolyte records

Pitzer pair, `lambda`, like-charge `theta`, ternary `psi`, and `zeta`.  A full
mixed-electrolyte method must declare and validate its required interaction
coverage rather than silently behaving as pairwise-only.

### Chemistry records

- aqueous formation/speciation reactions;
- gas-liquid equilibrium records such as CO2(g)/CO2(aq);
- ion-exchange half-reactions;
- mineral/solid dissolution equilibrium;
- process reaction sets: `Arrhenius`, `modifiedArrhenius`, `thirdBody`,
  `falloff`, and `LHHW`, plus stoichiometric/equilibrium reaction forms.

Chemistry uses thermophysical properties but is not itself another activity
model.  Keeping it as a separate contract prevents double-counting reactions
inside a phase model.

## 11. Equipment/material asset dictionaries

These are referenced by operations and must not be absorbed into the
thermophysical manifest:

- adsorbent identity, porosity, pellet and bed properties;
- adsorption isotherm and rate/transport records;
- membrane material, permeance/diffusivity/selectivity and geometry;
- ion-exchange resin identity and capacity;
- crystallisation nucleation/growth kinetics and sample PSD;
- drying isotherm versus drying-rate curve;
- utility definitions;
- equipment material/mechanical data;
- economic indices and costing assumptions.

## 12. `0/<stream>` state variants

### M1 -- material stream, total composition

Exactly one composition basis: component molar flows, component mass flows,
total molar flow plus mole fractions, or total mass flow plus mass fractions;
plus `T` and `P`.

### M2 -- phase-resolved material stream

`phases{}` carries liquid/vapour/solid subdivisions that sum to the overall
material.  Optional PSD and solid attributes travel with the solid phase.

### M3 -- tear seed

Same complete grammar as M1/M2.  Its numerical role comes from `solverDict`,
not from a special stream-file format.

### M4 -- dynamic holdup/state

Initial vessel inventory and dynamic internal state, with physical-time output
written to time directories.  This is state, not a flowsheet declaration.

### M5 -- signal/electrical state

Control signals and electrical quantities use their own typed state where the
corresponding graph edge is non-material.  They must not masquerade as a
zero-flow material stream.

## 13. Recommended minimal top-level set

The entire corpus can therefore be covered without a proliferation of names:

```text
system/controlDict
system/flowsheetDict | system/propsDict
system/solverDict    [optional]
system/outerDict     [optional]
system/postDict      [optional]

constant/thermophysicalPropertiesDict   proposed clearer name for propertyDict
constant/chemistryDict                  proposed extraction of active chemistry
constant/reactions                      reaction records
constant/components/                    component overlays
constant/parameters/                    model/pair records
constant/assets/                        equipment/material assets

0/<edge-name>                           state
```

The rename/extraction is an architectural migration, not a prerequisite for
COSMO-SAC or PC-SAFT.  Until the engine and complete corpus migrate atomically,
`constant/propertyDict` remains the executable filename.
