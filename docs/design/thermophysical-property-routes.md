# Liquid density, viscosity and surface tension: routes, classes, measurements and hypotheses (C378)

Kind: STUDY.  Status: OPEN -- a proposal awaiting the owner's ratification;
no engine, GUI, data or case file changed.  Branch
`c378-thermophysical-study`, 2026-11-12.  Requested by Vítor (DEV.md 4c
C378) on learning that the engine refuses the density and the viscosity of
a caustic solution.

**What this record settles.**  Nothing yet; it is the written study his
standing rule asks for before any property architecture (2026-07-16:
study first, then design).  It records (1) what the engine does today for
liquid density, viscosity and surface tension (conductivity and diffusivity
where the same structure serves), measured and reproduced; (2) how a large
commercial property system, an open-source simulator, an open interface
standard, an open-source Python property library and the standard
monographs organise these properties; (3) ONE proposed structure; (4) the
migration in landable slices and what each would be validated against.

**Rules that bound it.**  Every engine statement carries `file:line` (tree
at e6c89fce9; the runs used a binary built from adc4da12d, whose `src/` is
identical).  Every literature statement carries its page.  A number not
read or run is not written.  Other systems are described by what they are;
the comparative study that names them is kept outside the tracked tree.

## 1. What the engine does today

### 1.1 The routes

| property | home | routes | mixture | announced | refuses | wrong without saying so |
|---|---|---|---|---|---|---|
| liquid density | `ThermoPackage::density` ThermoPackage.cpp:2270; per component `liquidMolarVolumeOf` :2426 | a pure-fluid record covering the phase (:2287); record `Vliq` anchored on Rackett, `V = Vliq R(T)/R(298.15)` (:2438); `Vliq` held flat (:2458); bare Rackett from Tc, Pc, omega (:2471) | ideal molar volume (:2341) | once PER PROCESS by static flags (:2431); the anchored line names no component | no `Vliq` and no Tc (:2482); T >= Tc (:2511) | pressure ignored in the liquid branch; a `Vliq` stated at another temperature read as a 25 C datum (CO2.dat:31 says 273 K; the anchor is :2428) |
| gas density | same, :2306 | the declared equation of state | its own rule | -- | no EoS (:2308) | -- |
| liquid viscosity | `viscosityLiquid` :2161 | pure-fluid record; else `Andrade`, `Vogel` or the five-coefficient form (LiquidViscosityModel.cpp:70-74) | `logMoleAverage` / `GrunbergNissan` (default, LiquidViscosityMixingRule.cpp:242) | G = 0 for an undeclared pair, by name | no model (:2177); a component without its block | saturated liquid only (no pressure argument, ThermoPackage.H:654) |
| gas viscosity | `viscosityGas` :2059 | `Chung`, `ChapmanEnskog`; Wilke | one rule | Chung's simplifications | no model (:2080) | dilute gas only (no P, ThermoPackage.H:627) |
| surface tension | `surfaceTension` :2238 | pure-fluid record; `StoredCorrelation` (record law, Brock-Bird fall-back announced) or `BrockBird` | `moleFractionAverage` / `Butler` (default, SurfaceTensionMixingRule.cpp:319) | the fall-back, per component | no model (:2256); Brock-Bird without Tb | Brock-Bird applied to an H-bonded liquid when declared (no class guard) |
| liquid conductivity, diffusivity | :2191, :2221 | `SatoRiedel`, five-coefficient form; `WilkeChang` | `massFractionAverage` / `Filippov` / `Li` (default) | -- | no model | -- |
| aqueous solution density from a laboratory analysis | `AqueousVolumetricModel` (electrolyte/AqueousVolumetric.H), from StreamStateIO.cpp:1516, :2728 | `diluteVolume`; `standardStateVolumes` (ion V0 of 11 species records) | additive | printed | sample outside 0-100 C | a SECOND home of a solution density, reachable only from an inlet analysis |

The v2 `transport {}` block reaches the package through one mapper
(ThermoPackageBuilder.cpp:2120-2209), wired for `gammaPhi` and
`diluteSolution`; an `electrolyteGammaPhi` system with `transport {}` is
refused (:2057-2062).  The per-unit override accepts `transport` and
`volumetric` (ThermoOverride.H:101) but no reader of a system `volumetric`
block exists.

### 1.2 Reproduced (scratch cases, not in the tree)

| run | result |
|---|---|
| `propertyPoint`, water + NaOH, the electrolyte package | dies before any density: the operation computes the ideal-gas enthalpy first (PropertyPoint.cpp:70) and NaOH has none |
| same, with `transport {}` | refused at assembly (ThermoPackageBuilder.cpp:2057) |
| `propertyScan1D`, `rho_liquid_NaOH` / `_NaCl`, molecular package | every point `nan`: "needs either a `Vliq` ... or the critical constants" (:2482) |
| viscosity of water + NaOH | `nan`: NaOH has no `liquidViscosity` block |
| surface tension of water + NaCl | `nan`: Brock-Bird needs Tc, Pc, Tb |
| `rho_liquid_CO2` 320 K, `rho_liquid_N2` 300 K | refused by name (:2511) |
| `rho_liquid_CO2` 280 K / 298.15 K | 1153.1 / 936.4 kg/m3; the engine's own reference equation for CO2 (`referenceEoS`) gives the saturated liquid 883.6 / 710.5: +30.5 % / +31.8 % |
| water without a pure-fluid record, 273.16 / 277.16 / 373.16 / 573.16 K | 1019.7 / 1016.1 / 924.6 / 665.6; the engine's IAPWS-95: 999.8 / 1000.0 / 958.3 / 712.1 (saturated): +2.0 / +1.6 / -3.5 / -6.5 %, no 4 C maximum |
| water at 298.15 K, 1 and 500 bar | 996.96 both; IAPWS-95 997.05 and 1018.4 (-2.1 % at 500 bar) |
| water + ethanol, x = 0.25, 298.15 K | 0.935 mPa s with G = 0 (announced) and with `logMoleAverage` (not announced); measured 2.342 at x = 0.30 (tutorial mixing01, Pires et al. 2007): about -60 % |
| water, surface tension at 25 C | Brock-Bird 106.5 mN/m, the record's measured law 71.5: +49 % |

### 1.3 Who reads these properties

| unit / pass | density | viscosity | surface tension |
|---|---|---|---|
| Pump (Pump.cpp:88-128), PressureExchanger (:191), CSTR (:245, :660), PFR (:193, :690), Crystalliser (:380, :506, :802), CrystallisationSaturation (:124), SprayDryer (:580-599) | BYPASS: the record's flat 25 C `Vliq` | SprayDryer via the home | SprayDryer via the home |
| SpiralWoundModule (:317), RatedTestInversion (:223), EDCell (:158), ElectrodialysisStack (:347) | CONSTANT 1000 kg/m3 (the module's default is not announced; BatchDiafilter.cpp:140-152 announces the same default) | module via the home (:398) | -- |
| Valve, StorageTank, Pipe, HeatExchanger, PhaseChanger, TrayHydraulics, DistillationColumn, Hydrocyclone, SolidLiquidCore, VariableVolumeHoldup; sizing PhaseDensity, GasStoreSize, ShellTubeHX, PipeHeaderSize | via the home (several through `pricedDensity::select`, which leaves out components with no liquid volume) | via the home; Pipe and the column accept a declared value | via the home; Pipe and the trays accept a declared value |

No stream table prints a density or a viscosity (ResultEmitter.cpp:871-886
prints `.rho` only inside a sized item's inventory).

### 1.4 The gaps

| property x kind of liquid | today | announced | refused | wrong silently |
|---|---|---|---|---|
| density, molecular | anchored Rackett | once per process | without data | when `Vliq` is not a 25 C value; far from 25 C (water -6.5 % at 300 C) |
| density, compressed | saturated value | no | -- | yes |
| density, electrolyte | none (package); ideal (analysis inlet) | analysis yes | package yes | -- |
| density, dissolved gas | none | -- | yes, or left out by the caller | -- |
| density, slurry | pulp volume-additive, written in two units | printed | without rho_p | -- |
| density in 7 bypassing units and 3 constant ones | flat `Vliq`, or 1000 | mostly no | -- | yes |
| viscosity, aqueous-organic mixture | Grunberg-Nissan, G = 0 unless declared | yes (not under `logMoleAverage`) | -- | about -60 % on water-ethanol |
| viscosity, electrolyte / dissolved gas | none | -- | yes | -- |
| surface tension, H-bonded pure | Brock-Bird when declared | no | -- | +49 % on water |
| surface tension, electrolyte | none | -- | yes | -- |

### 1.5 Contradictions with written doctrine

- "The runtime never estimates a missing value" (property-architecture.md
  §1, §5): bare Rackett and Brock-Bird ARE runtime estimates, announced.
  Proposed reading: a predictive model from record constants is a route
  labelled `estimate` with its expected error; estimating the constants
  themselves stays curation.
- ThermoPackage.cpp:2321-2339 records the pump/pipe density split as fixed;
  seven units still read the flat `Vliq`.
- The mixing-rules forum of 2026-07-04 ratified A5 (per-component transport
  overrides) and A6 (a resolved-models table, "every cell that is an
  estimate SAYS estimate"); neither was built.
- `approximations {}` is parsed in two places
  (ApproximationAuthorisation.H readFrom; ThermoPackageBuilder.cpp:1095),
  `reason` is optional in both, unknown words are not refused, and the block
  is not accepted in a per-unit fragment.

## 2. How others organise it

| source | how it is organised |
|---|---|
| a large commercial property system (its methods-and-models reference manual, 2001) | a property METHOD is a set of ROUTES; a route is a tree (property, method code, sub-routes, models at the leaves); MAJOR properties are those unit operations read (liquid mixture volume, viscosity, surface tension, conductivity, diffusivity), SUBORDINATE ones include pressure corrections; the user replaces one route at a time or one model everywhere it is used.  Electrolytes: a separate method code per mixture property fed by the TRUE composition -- an apparent-electrolyte volume (V = V_inf + A x/(1+x)), a relative-viscosity correction of the Jones-Dole type with ion coefficients, an Onsager-Samaras surface-tension increment, a Riedel conductivity correction -- with apparent salts reconstituted ARBITRARILY from the ions; no concentration range stated for any of them.  Dissolved gases: a corresponding-states partial molar volume used only for Henry's pressure correction. |
| an open-source simulator (its public property-package source) | one base class owns every transport routine, so transport is independent of the thermodynamic model; options: liquid density mode (Rackett, Rackett-plus-data, EoS, COSTALD; default the second), liquid viscosity mode (data or a corresponding-states estimate), four parameter-free viscosity mixing rules (default a mole average), pressure corrections on by default.  Silent fall-backs: an estimate when a correlation is missing, a 1e20 sentinel that drops a supercritical component from the volume sum, Tr reset to 0.5 in Rackett, Tb taken as 0.7 Tc.  Electrolytes: density forced to additive water + ion volumes from a databank; the other properties generic, with ions returning zero.  Options for supercritical components are declared and never read. |
| an open interface standard for property packages (2011) | the stream state is the MATERIAL owned by the simulator; the property package is STATELESS; density, viscosity, conductivity, diffusion coefficient are single-phase MIXTURE properties, surface tension a TWO-PHASE property (pp. 114-117); capability is declared and queryable (pp. 90-93); failures are typed (pp. 85-86); how a package chooses its methods is "outside the scope" (p. 15) |
| an open-source Python property library (its documentation) | each property an OBJECT with several METHODS, a RANKED default, per-method temperature limits, a validity test, a user override, named extrapolation, and a separate pressure method set; a mixture object tries methods "until one succeeds"; for aqueous electrolytes a per-solute additive model is ranked first for volume and viscosity; nothing for electrolyte surface tension |
| Carlson, Chem. Eng. Prog. 92(10) (1996) 35-46 | method choice follows the CLASS of the system: polar? -> electrolyte? -> real or pseudo components -> pressure (Fig. 1, p. 36); polar: P above 10 bar? -> interaction parameters available? -> liquid-liquid? (Fig. 2, p. 38); "you shouldn't automatically accept the default methods" for density and viscosity, Rackett "recommended for general use" (p. 37) |
| Kontogeorgis et al., Ind. Eng. Chem. Res. 60 (2021) 4987-5013 (industrial survey) | "transport properties need better prediction methods ..., especially for viscosity"; software should warn "if no interaction parameters are available (and set to zero)" (p. 4999); mixture viscosity "a challenge" (p. 5007); models for interfacial and transport properties "are lacking, partially due to the lack of measurements" (p. 5010) |
| a critically evaluated data programme | per compound and property: recommended equation + uncertainty + the data it rests on |

### 2.1 What the monographs recommend, with the error they state

| property | situation | method | class | error | source |
|---|---|---|---|---|---|
| saturated liquid density | one measured density | Rackett on a reference volume | all | 2 % | Perry 9ed p. 2-350; Poling 5ed p. 4.38 |
| same | Tc, Pc, omega only | Rackett / Yamada-Gunn | omega < 0.4 / > 0.4 | 15 % (Perry 2-349); 2.56 / 6.07 % (Poling 4.38) |
| liquid mixture density | | Spencer-Danner-Li | | about 7 % | Perry 2-350 |
| liquid density from a cubic EoS | | | | 10-20 % | Perry 2-349 |
| pure liquid viscosity, predictive | | group contribution | organic, not inorganic | "less than 10 to 15 %"; "None ... particularly reliable" | Poling 9.75 |
| liquid viscosity vs pressure | | Lucas | polar and nonpolar | < 10 % | Poling 9.55 |
| liquid mixture viscosity | | Grunberg-Nissan | G = 0, hydrocarbons | about 15 % | Perry 2-354 |
| same | | with fitted G / UNIFAC-VISCO | nonpolar / polar | a few % / 5-10 % | Poling 9.90 |
| same | aqueous | "neither ... Grunberg-Nissan ... nor UNIFAC-VISCO ... is recommended" | water | | Poling 9.90 |
| surface tension, pure | | corresponding states (Brock-Bird) | non-H-bonded / alcohols, acids, phenols | < 5 % / "unacceptable" | Poling 12.10 |
| mixture surface tension | | UNIFAC-based (Suarez) | incl. aqueous | 3-4 % | Poling 12.23 |
| liquid conductivity | organic / mixtures / dilute electrolytes | Latini, Sastri / Filippov, Li / Riedel | | < 15 % / 4-8 % / +-5 % | Poling 10.49, Perry 2-357, Poling 10.61 |
| gas viscosity, pure and mixtures | | Chung, Lucas; Wilke | nonpolar / polar | 0.5-1.5 % / 2-4 %; mixtures < 5 % | Poling 9.14, 9.29 |
| NaOH-water density, 0-200 C | | 18-coefficient polynomial | | 0.04 % mean, 0.23 % max | Olsson et al., Int. J. Thermophys. 18 (1997) 779, p. 786 |
| NaOH-water viscosity, 20-200 C | | relative-viscosity polynomial | | 2.13 % mean, 12.2 % max | same, pp. 791-792 |

Poling gives no method for the density, viscosity or surface tension of
aqueous electrolyte solutions (data pointers only, pp. 9.51, 9.89) and no
recipe for a supercritical component's volume in a liquid mixture.

### 2.2 Taken, and deliberately not taken

| taken | from |
|---|---|
| an ELECTROLYTE correction as its own step of each liquid property | the commercial system; the Python library |
| a PRESSURE correction as its own, declared step | the commercial system; the open-source simulator |
| the route printed and replaceable step by step | the commercial system's route tree |
| a dissolved gas's partial molar volume as a datum | the commercial system (here: the Henry pair's `v_inf`, already a field) |
| declared capability, typed refusals | the interface standard |
| method choice keyed on the class of the component | Carlson; Poling's class-keyed recommendations |
| an expected error per route | the evaluated-data programme's uncertainty |

| NOT taken | why |
|---|---|
| silent fall-backs to an estimate; dropping a supercritical component by a sentinel | the cão-e-gato principle (mixing-rules forum, 2026-07-04): a cat may hunt, it must be named |
| a hidden ranking that runs the first valid method | the student must see the method that ran and those passed over |
| apparent salts reconstituted arbitrarily from ions to feed salt-fitted correlations | a number from an arbitrary assignment cannot be defended; refuse, or apply the declared salt's correlation |
| a mixture rule inconsistent with the pure route | one route per property |

## 3. The proposal

### 3.1 Five concepts

| concept | meaning | home |
|---|---|---|
| PROPERTY | one home per property; every unit calls it | `ThermoPackage::density`, `viscosityLiquid`, `surfaceTension`, ... (exist) |
| CLASS | of a component in a liquid: `molecular`, `associating`, `dissolvedGas`, `electrolyte`, `suspendedSolid`; DERIVED from the record (and T), printed | the classifier that already classifies from record facts |
| ROUTE | pure correlation -> mixture rule -> system correction -> pressure correction; each step a named object with a window, a source, a QUALITY word and an EXPECTED ERROR | correlation objects and mixing rules (exist); corrections (new) |
| DECLARED MEASUREMENT | a number or fitted correlation with its source; beats any estimate in its window | by arity, scope and kind: component record, pair record, case `constant/`, unit |
| HYPOTHESIS | a named concession from a closed list, with a reason and a stated size | `approximations {}` (exists) |

### 3.2 Classes and what each changes

| class | derived from | changes |
|---|---|---|
| `molecular` | condensable record, T < Tc | -- |
| `associating` | a PC-SAFT association scheme on the record, or a UNIFAC group with OH, H2O, COOH, ACOH, NH2; else declared `liquidClass associating;` | Brock-Bird is not a default; G = 0 labelled poor |
| `dissolvedGas` | the state: T >= Tc of the component | density from the Henry pair's `v_inf`, else refuse or hypothesis |
| `electrolyte` | `dissociatesTo` / aqueous mapping, or a charged species | a solution correction from the salt-solvent record, else refuse or hypothesis |
| `suspendedSolid` | the stream's solids | a suspension layer, density only |

Water is `associating`; its exception is data (a pure-fluid record).

### 3.3 Default routes (few, simple, with their error) and what is left out

| property | class | default | quality | expected error |
|---|---|---|---|---|
| density | molecular, associating | record `Vliq` at its stated T, Rackett shape | measured level | about 2 % |
| | no `Vliq` | bare Rackett | estimate | up to 15 % |
| | electrolyte | salt-solvent correlation | measured | the record's (NaOH: 0.04 % mean) |
| | dissolvedGas | Henry `v_inf` | fitted | the record's |
| viscosity | pure | record correlation | measured | its fit |
| | mixture, nonpolar | Grunberg-Nissan, G declared or 0 | fitted / estimate | about 15 % at G = 0 |
| | mixture with an associating member | Grunberg-Nissan with a declared G | fitted | mixing01: 10.2 % mean in-sample; at G = 0 a factor of two |
| | electrolyte | relative viscosity from the salt-solvent record | measured | NaOH: 2.13 % mean, 12.2 % max |
| surface tension | pure molecular / associating | stored law, Brock-Bird only for molecular | measured / estimate | < 5 % / refused without data |
| | mixture | Butler on the case's activity model | estimate | -31 % to -0.5 % (mixing01, water-acetone) |
| conductivity | electrolyte | ion increments (Riedel) | estimate | +-5 % |

LEFT OUT, on purpose: predictive pure-liquid viscosity; UNIFAC-based
viscosity; a second liquid-mixture density rule; electrolyte surface
tension (no source in hand); slurry viscosity (a declared measured value
only); dense-gas transport (until a case needs it).  Pareto order: density
(read by almost every unit, errors linear in volume and head), then
viscosity (linear in filtration and settling, weaker in pipes and
exchangers), conductivity, surface tension (weak in flooding).  The gas
side stays as it is: kinetic theory, 0.5-4 % pure and < 5 % mixtures at low
pressure; its one gap is dense gas.

### 3.4 How the run says it

At assembly, a resolved-routes table (component x property -> route,
class, quality, expected error).  At each use, one line naming the worst
step, its error and its source; e.g. "mixing: Grunberg-Nissan,
water-ethanol G = 0 -- ESTIMATE, poor for an aqueous pair (Poling 5ed p.
9.90; measured -60 %, mixing01).  Declare a fitted G or a measured
viscosity."  One line per (component, route), replacing the once-per-process
flags (ThermoPackage.cpp:2431).

### 3.5 Grammar

The case's `transport {}` is unchanged.  The reserved `volumetric {}` gets
a reader, only for a choice with alternatives:

    volumetric { liquid { pressureCorrection none; } }   // | Tait, when its source is in hand

No density `mixingRule` key (one rule: a key with one value is doctrine in
the wrong place); no key to switch a system correction on -- it applies
when the class is present AND the pair record carries the data, and it is
announced.

A salt-solvent record (arity 2), in the existing solution tier
`data/standards/parameters/solution/<solute>-<solvent>.dat`:

    recordType  solutionProperties;
    solute      NaOH;
    solvent     water;
    liquidDensity
    {
        form          polynomialSqrtW;      // rho = sum_k t^k sum_j c_kj w^(j/2)
        basis         solventMassFraction;
        coefficients  ( ... );               // transcribed with table and page
        window        ( { T (273.15 283.15) K; wSolventMin 0.80; } ... );
        expectedError { mean 0.04 %; max 0.23 %; }
        source        "Olsson, Jernqvist & Aly (1997) Int. J. Thermophys. 18, 779-793, eqs 6-9, Table IV";
    }

Forms are named by their mathematics, so a second salt in the same shape is
a record and nothing else; a physical model with a name (Masson, Jones-Dole,
a per-solute additive model for several salts) is a form too.

Hypotheses, a closed list of two, in the existing top-level block:

    approximations
    {
        massWithoutVolume  { components ( NaOH ); reason "..."; }
        excludedFromMixing { components ( N2 H2 ); properties ( viscosity surfaceTension ); reason "..."; }
    }

`massWithoutVolume`: the components add mass and no volume (the analysis
reader's `diluteVolume` and the Pump's ion reading, named); size printed as
their mass fraction, bounded where the engine already states it ("~ +1.8 %
at 1 molal NaCl", AqueousVolumetric.H:39-41).  `excludedFromMixing`: the
property is computed over the other components, renormalised
(`pricedDensity::select`, named); size printed as the excluded mole
fraction, the effect "not bounded" unless a source bounds it.

Rules: (1) a hypothesis never overrides a route that exists and applies --
it authorises a fall-back where the engine would refuse; (2) one block, one
parser, propagated; (3) a closed vocabulary, a gate arm per word, an unknown
word refused naming the allowed ones, `reason` mandatory; (4) the case's
hypotheses printed in one block of the run header and of the report, with
the number each stands in for; (5) an unused hypothesis reported as unused.
It is not a switch on a balance, not a value without a source (that is a
declared measurement, another key in another home), not a per-unit knob.

A MODEL predicts a number from other data and has an expected error; a
DECLARED MEASUREMENT is the number (or a fit to numbers) with its source
and window; a HYPOTHESIS is a stated concession that removes a term and
says how big it may be.  The run says which one each number rests on.

### 3.6 The electrolyte seam

Optional `solutionDensity` / `solutionViscosity` methods on the electrolyte
ACTIVITY interface (C377, withdrawn) were the wrong seam: a solution density
is salt + solvent data (arity 2) independent of the activity model chosen;
only one model would have implemented it (a per-model special case); and
the analysis reader would have stayed a third home.  Replacement: the
salt-solvent record, consumed by the correction step of the density and
viscosity routes.  The analysis slot folds in: `diluteVolume` is
`massWithoutVolume`; `standardStateVolumes` is the correction at infinite
dilution (ion V0 from the species records); the reader calls the package's
density route, and its pure-water term becomes the package's water route.

### 3.7 Scope

| question | answer |
|---|---|
| default | one consistent set of routes per case |
| a unit or sector wants another route | the existing `thermo { transport {} }` / `thermo { volumetric {} }` fragment, replace-whole per block (ThermoOverride.H:101), announced at the unit with the route replaced -- nothing new |
| a hypothesis per unit | not in the pilot: `approximations` is refused in a fragment and stored run-wide; allowed only when a case needs it, and then carried by the package |
| a boundary between routes | a density is not conserved, so no ledger entry; announced once per boundary by the model-boundary machinery, which already detects `volumetric` and `transport` in a fragment (ModelBoundaryLedger.cpp:62) |
| the stream table | prints no density today; if it does, the package of the graph that contains both ends prices it |

### 3.8 The six tests

| test | passed by |
|---|---|
| no component name in code | class from record facts; water's exception is its pure-fluid record; a gate arm greps the route files for component names |
| the record is designed | component (arity 1): `Vliq` with its T, correlations, optional class; pair (arity 2): `parameters/solution/`, Henry `v_inf`; sample: case `constant/`; equipment: the unit |
| few concepts | five (§3.1) |
| exceptions are data | pure-fluid records, declared class, fitted pair G |
| no big bang | `Vliq` exists in 531 of 696 records and a tool reads its stated temperature from the comment; the other blocks are unchanged; missing data refuses by name; today's two implicit concessions stay as announced defaults until a tool declares them in each case |
| reversible | the pilot is density alone |

### 3.9 Why this will not become a patchwork

| how it would degrade | what stops it |
|---|---|
| units computing their own density or a constant | a ratchet gate recounting direct `Vliq()` reads and density literals under `src/unitOperations` and `src/postProcessing`: it may only shrink |
| a correction written for one salt or one paper | closed registry of mathematical forms, each with a witness against measured data and a Theory Guide section; component names in route files fail a gate |
| hypotheses growing into a configuration language | two words, each a gate arm; unknown words refused; unused ones reported; a new word needs the owner's ruling |

## 4. Migration and validation

Measured data in hand: the ThermoML mirror (files declaring mass density:
702 binary, 3738 multicomponent, 203 with water and a salt, 374 with a
dissolved gas; viscosity 307 / 1339 / 67 / 118; surface tension 95 / 374 /
12 / 40); the engine's IAPWS-95 and CO2 reference-equation records; the
handbook's aqueous NaCl and NaOH density tables (Perry 9ed Tables 2-53,
2-54, pp. 2-100..104); the NaOH paper's own tables; the mixing01 witness.

| slice | content | validated against | goldens that can move | documentation (rule 4d) |
|---|---|---|---|---|
| S0 | per-component route lines, quality and expected error on each step, the resolved-routes table, "pressure not applied", a list of `Vliq` records stated at another temperature, `reason` mandatory and unknown words refused in `approximations` | byte-identical numbers | none | Theory Guide section on routes and quality words; docs/ai/thermo.md |
| S1 PILOT density | one home for the 7 bypassing and 3 constant units; `volumetric {}` read; salt-solvent correction (NaOH, NaCl); Henry `v_inf`; the two hypotheses (today's implicit uses as announced defaults); analysis slot folded; a liquid-only path and a mixture density key on the props bench; electrolyte packages may carry `volumetric`/`transport` | IAPWS-95 water (0-300 C, 500 bar), CO2 reference equation, ThermoML NaOH-water (doi 10.1021/acs.jced.9b00536), handbook tables, NaOH paper, ThermoML water-ethanol | cases with pump, pressure exchanger, CSTR, PFR, crystalliser, spray dryer away from 25 C; spiral-wound and electrodialysis cases; derived analysis densities -- listed by a reach script before any re-record | a section per form and hypothesis with labels; links; a witness per kind; catalogue; PDFs |
| JUDGE | the owner reads the pilot on three cases: continue, or discard the structure | | | |
| S2 viscosity | electrolyte relative viscosity; G = 0 labelled by class | ThermoML salt-water viscosity; mixing01 | none for molecular cases | as S1 |
| S3 surface tension | Brock-Bird not a default for associating liquids; electrolytes refused or a hypothesis | ThermoML surface tension; mixing01 | the cases that declare Brock-Bird for water or an alcohol (15 of the 33 files that declare it) | as S1 |
| S4 | electrolyte conductivity; ion diffusivity | monograph examples | brine exchangers | as S1 |
| S5 | slurry density in one function | arithmetic | none | short |
| S6 | pressure corrections, declared | IAPWS-95 at pressure, ThermoML compressed sets | none by default | as S1 |
| S7 | a tool declares the hypotheses in every case relying on them; implicit defaults removed | the corpus | none | |

Works not in hand that a complete electrolyte treatment needs: Laliberté &
Cooper, J. Chem. Eng. Data 49 (2004) 1141 (density, many salts); Laliberté,
J. Chem. Eng. Data 52 (2007) 321 (viscosity); Jones & Dole, J. Am. Chem.
Soc. 51 (1929) 2950; Kaminsky, Discuss. Faraday Soc. 24 (1957) 171;
Onsager & Samaras, J. Chem. Phys. 2 (1934) 528; Dutcher, Wexler & Clegg,
J. Phys. Chem. A 114 (2010) 12216; Rogers & Pitzer, J. Phys. Chem. Ref.
Data 11 (1982) 15; Hankinson & Thomson, AIChE J. 25 (1979) 653; Thomson,
Brobst & Hankinson, AIChE J. 28 (1982) 671; Brelvi & O'Connell, AIChE J.
18 (1972) 1239; Hendriks et al., Ind. Eng. Chem. Res. 49 (2010) 11131.

**Open for the owner.**  (1) The two-word hypothesis vocabulary and the
phase in which today's implicit concessions stay as announced defaults.
(2) Entering per-solute coefficient tables from journal papers into
`parameters/solution/`.  (3) An optional `liquidClass` record field.  (4)
Brock-Bird refused for associating liquids without a stored law (moves
goldens).  (5) Grunberg-Nissan with G = 0 on an aqueous pair: labelled or
refused.  (6) `Vliq` with its temperature: the record form.  (7) Slurry
viscosity as a declared measured value only.  (8) The pressure correction:
wait for the primary, or build from the monograph's description.
