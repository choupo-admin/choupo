# Proposed variants of `thermophysicalPropertiesDict`

An architecture document covering the 289 property dictionaries of the
Choupo-2607 tutorials.  It does NOT describe the current transitional grammar.

**Rule:** there is no `propertyMethods{}`.  That name mixes activity
coefficients, EoS, caloric properties and transport without saying which
physical property each model computes.

The proposed contract uses blocks with a physical meaning:

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;

components      ( ... );
equilibrium     { ... }   // fugacidade, atividade e equilibrio de fases
caloric         { ... }   // H, S, Cp e mudancas de fase
volumetric      { ... }   // volume, densidade e regras de mistura
transport       { ... }   // mu, k, D, sigma e regras de mistura
propertyKernel  { ... }   // opcional: pacote fundamental coordenado
chemistryRef    "constant/chemistryDict"; // opcional: quimica ativa
```

Not every block is mandatory.  An aqueous speciation case does not invent a
vapour phase; an isothermal case is not obliged to declare a caloric route it
never uses.

There is no global `parameters{}` bag.  Each model references the parameters it
consumes inside its own block.  The data file stays separate, but the link stops
dangling:

```text
activityModel
{
    model NRTL;
    binaryParameters { ethanol-water { source "parameters/NRTL/ethanol-water.dat"; } }
}

fugacityModel
{
    equationOfState SRK;
    mixingRule vanDerWaalsOneFluid;
    binaryInteractions { N2-CH4 { source "parameters/SRK/N2-CH4.dat"; } }
}
```

## List of the variants

| ID | Variant | Covers |
|---|---|---|
| T1 | ideal molecular mixture, gamma-phi | flashes, columns and ideal molecular units |
| T2 | molecular activity, gamma-phi | NRTL, UNIQUAC, Wilson and UNIFAC |
| T3 | COSMO-SAC gamma-phi | liquid activity from sigma profiles |
| T4 | EoS phi-phi | SRK and Peng-Robinson |
| T5 | PC-SAFT phi-phi | PC-SAFT, non-associating and associating in future |
| T6 | dilute solution / Henry | dilute gases and molecular solutes |
| T7 | electrolyte with VLE | Pitzer/eNRTL with apparent components |
| T8 | aqueous ionic solution properties | Davies / Pitzer-HMW, with no artificial VLE |
| T9 | gas-liquid equilibrium with an electrolyte | CO2/O2/N2 between vapour and the aqueous phase |
| T10 | multiple liquid phases | LLE and VLLE |
| T11 | solid-liquid | crystallisation, salts and minerals |
| T12 | pure-fluid kernel | IF97 and future fundamental models |
| T13 | full transport | gas, liquid, interface and mixing rules |
| T14 | continuous solid material | Cp, rho and conductivity of a solid region |
| T15 | per-unit local context | a thermophysical override at a plant node |
| T16 | sealed package | a closed snapshot of the data used |

## T1 - ideal molecular mixture, gamma-phi

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( benzene toluene );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel ideal;
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid
    {
        enthalpyRoute pureLiquidCp;
        heatCapacityMixingRule moleWeighted;
    }
    vapour
    {
        enthalpyRoute idealGasCp;
        heatCapacityMixingRule moleWeighted;
    }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
    }
}

volumetric
{
    liquid { densityModel Rackett; mixingRule volumeAdditive; }
    vapour { densityRoute fromFugacityModel; }
}
```

## T2 - molecular activity, gamma-phi

```text
components ( ethanol water );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel
        {
            model NRTL;           // NRTL | UNIQUAC | Wilson | UNIFAC
            binaryParameters
            {
                ethanol-water
                {
                    source "parameters/NRTL/ethanol-water.dat";
                }
            }
        }
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;   // or a real EoS
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid
    {
        enthalpyRoute pureCpPlusExcess;
        heatCapacityMixingRule moleWeighted;
        excessModel fromLiquidActivitySurface;
    }
    vapour { enthalpyRoute idealGasCp; }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
    }
}
```

If the NRTL pair has no calorimetric fit, `excessModel NRTL` must refuse or be
explicitly omitted.  Fitting VLE does not prove the excess enthalpy.

UNIFAC uses the groups stored on the component.  NRTL, UNIQUAC and Wilson use
pairs of the selected model.

## T3 - COSMO-SAC gamma-phi

```text
components ( water ethanol acetone );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel
        {
            model COSMOSAC;
            parameterSet VT2005;
        }
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}
```

The data live on the component, not in the code and not in duplicated components:

```text
cosmo
{
    VT2005
    {
        model COSMOSAC;
        variant "2002";
        source "...";
        license "...";
        area ...;
        volume ...;
        sigmaProfile ( ... );
    }
}
```

COSMO-SAC computes liquid-phase activity coefficients.  It is not an EoS, it does
not directly compute a vapour density, and it does not require `binaryPairs`.

## T4 - EoS phi-phi

```text
components ( N2 CH4 );

equilibrium
{
    formulation phiPhi;
    equationOfState
    {
        model SRK;
        mixingRule vanDerWaalsOneFluid;
        binaryInteractions
        {
            N2-CH4 { source "parameters/SRK/N2-CH4.dat"; }
        }
    }
    liquid
    {
        fugacityRoute equationOfState;
        root liquid;
    }
    vapour
    {
        fugacityRoute equationOfState;
        root vapour;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```

`equationOfState` may be `SRK` or `PengRobinson`.  The same EoS serves both
phases.  Every `kij` declares the EoS it was fitted to.

## T5 - PC-SAFT phi-phi

```text
components ( methane ethane nHexane );

equilibrium
{
    formulation phiPhi;
    equationOfState
    {
        model PCSAFT;
        mixingRule PCSAFTOneFluid;
        binaryInteractions
        {
            methane-ethane { source "parameters/PCSAFT/methane-ethane.dat"; }
        }
    }
    liquid
    {
        fugacityRoute equationOfState;
        root liquid;
    }
    vapour
    {
        fugacityRoute equationOfState;
        root vapour;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```

First version: hard-sphere, hard-chain and dispersion.  The contributions ARE the
definition of the implemented variant, announced by the model; they are not
switches for the user to turn on and off arbitrarily.

Pure-component data on the component:

```text
eosParameters
{
    PCSAFT
    {
        m ...;
        sigma ...;
        epsilon_k ...;
        provenance { origin regressed; method "..."; }
    }
}
```

Association will add sites and parameters inside the same `PCSAFT` block, without
creating another component or another forest of directories.

## T6 - dilute solution / Henry

```text
components ( water CO2 );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        solvent
        {
            component water;
            standardState pureLiquid;
        }
        solutes
        {
            components ( CO2 );
            standardState infiniteDilution;
            solutionModel henryDilute;
            binaryParameters
            {
                CO2-water { source "parameters/Henry/CO2-water.dat"; }
            }
        }
    }
    vapour { fugacityModel idealGas; }
}

```

Henry is a CONVENTION for the group of solutes, not a model of the whole liquid
phase.

## T7 - electrolyte with VLE

```text
components ( water NaCl );

equilibrium
{
    formulation electrolyteGammaPhi;
    aqueous
    {
        solvent water;
        apparentComponents ( NaCl );
        activityModel
        {
            model Pitzer;           // Pitzer | eNRTL
            parameterCoverage modelRequiredInteractions;
        }
        compositionBasis molality;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    aqueous { enthalpyRoute ionicReferencePlusExcess; }
    vapour  { enthalpyRoute idealGasCp; }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
    }
}
```

Pitzer/eNRTL compute the aqueous phase's activity.  Salt dissociation, ionic
references and interactions live in their own records, not in special components.

## T8 - aqueous ionic solution properties

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( water );

aqueousProperties
{
    solvent water;
    activityCoefficients
    {
        model PitzerHMW;             // ou Davies
        referenceBasis aqueousMolality;
    }
}
```

This dictionary supplies activities; it does not do the speciation.  Analytical
totals, admitted masters, a given/solved pH, active reactions and the minerals to
test belong to the `speciate` problem and to the chemical data.  One does not
invent a vapour phase, nor turn the analysis's composition into a fluid property.

## T9 - gas-liquid equilibrium with an electrolyte

This is an equilibrium between two phases.  The dictionary declares the phases'
surfaces and the equality that links them:

```text
components ( water NaCl CO2 O2 N2 );

equilibrium
{
    formulation reactiveGammaPhi;

    phases
    {
        aqueous
        {
            solvent water;
            apparentComponents ( NaCl );
            activityModel
            {
                model Pitzer;
                parameterCoverage modelRequiredInteractions;
            }
            compositionBasis molality;
        }

        vapour
        {
            fugacityModel idealGas;
        }
    }

    phaseEquilibrium
    {
        vapour-aqueous
        {
            condition chemicalPotentialEquality;

            transferredComponents
            {
                CO2
                {
                    vapourReference fugacity;
                    aqueousReference infiniteDilution;
                    transferModel Henry;
                    aqueousSpecies CO2aq;
                    binaryParameters
                    {
                        source "parameters/Henry/CO2-water.dat";
                    }
                }
                O2
                {
                    vapourReference fugacity;
                    aqueousReference infiniteDilution;
                    transferModel Henry;
                    aqueousSpecies O2;
                    binaryParameters
                    {
                        source "parameters/Henry/O2-water.dat";
                    }
                }
                N2
                {
                    vapourReference fugacity;
                    aqueousReference infiniteDilution;
                    transferModel Henry;
                    aqueousSpecies N2;
                    binaryParameters
                    {
                        source "parameters/Henry/N2-water.dat";
                    }
                }
            }
        }
    }
}

chemistryRef "constant/chemistryDict";
```

Pitzer/eNRTL still represents the aqueous phase; Henry supplies the reference
bridge for each transferred gas.  The speciation turns CO2aq into HCO3- and
CO3-- without counting the gas-liquid transfer a second time.

Whether the system is open or closed **is not a thermophysical property**:

- an atmosphere with an imposed `pCO2`: a condition of the speciation operation;
- a finite gas phase: inventory/volume, in the state and in the unit;
- a continuous gas flow: a stream and the flowsheet topology.

All three use exactly the same gas-liquid equilibrium declared above.

## T10 - multiple liquid phases

```text
components ( water organicSolvent solute );

equilibrium
{
    formulation liquidLiquid;
    phases
    {
        aqueous
        {
            activityModel NRTL;
            standardState pureLiquid;
        }
        organic
        {
            activityModel NRTL;
            standardState pureLiquid;
        }
    }
    phaseEquilibrium
    {
        aqueous-organic
        {
            condition chemicalPotentialEquality;
            commonDatum pureLiquid;
        }
    }
}
```

For VLLE the vapour phase is added.  If two phases use different conventions,
`phaseEquilibrium` declares the bridge and the datum; they are never silently
mixed.

## T11 - solid-liquid

```text
components ( water NaOH ethanol );

equilibrium
{
    formulation electrolyteGammaPhi;
    aqueous
    {
        solvent water;
        activityModel
        {
            model eNRTL;
            parameterCoverage modelRequiredInteractions;
        }
        compositionBasis molality;
    }
    vapour { fugacityModel idealGas; }
    solid
    {
        phaseModel pureStoichiometric;
        availablePhaseData ( sodiumHydroxide );
    }
}

chemistryRef "constant/chemistryDict";

caloric
{
    energyBasis absoluteEnthalpy;
    dissolution { route fromSolidPhaseRecord; }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
        solidLiquid  { enthalpyRoute componentFusionData; }
        solidVapour  { enthalpyRoute componentSublimationData; }
    }
}
```

Variants: molecular solubility, salts, minerals, melting and sublimation.
`availablePhaseData` makes the phase available to the calculation, but the
OPERATION decides whether it merely computes SI or permits mass transfer to reach
equilibrium.  The crystal's intrinsic properties, the dissolution reaction / K,
and sample data are not one category.  PSD and growth kinetics belong to the
sample/unit.

## T12 - coordinated pure-fluid kernel

```text
components ( water );

propertyKernel
{
    component water;
    model IF97;
    releases ( state caloric viscosity conductivity surfaceTension );
}

equilibrium
{
    phases ( liquid vapour );
    route kernelNative;
}

caloric  { energyBasis absoluteEnthalpy; route kernelNative; }
transport { route kernelNative; }
```

A fundamental kernel delivers coherent properties as a set.  It must not be
artificially dismantled into independent models.

## T13 - full transport

```text
transport
{
    vapour
    {
        viscosity
        {
            model Chung;
            mixingRule Wilke;
        }
        thermalConductivity
        {
            model Eucken;
            mixingRule Wassiljewa;
        }
        diffusivity
        {
            model Fuller;
            mixingRule MaxwellStefan;
        }
    }

    liquid
    {
        viscosity
        {
            model Andrade;
            mixingRule logarithmic;
        }
        thermalConductivity
        {
            model SatoRiedel;
            mixingRule massWeighted;
        }
        diffusivity
        {
            model WilkeChang;
        }
    }

    interface
    {
        surfaceTension
        {
            model BrockBird;
            mixingRule moleWeighted;
        }
    }
}
```

A `mixingRule` appears only if it is selectable.  Where there is a single rule,
the runtime announces it in the resolved plan without pretending there was a
choice.

Extensions covered when needed: electrical conductivity, ionic mobility,
multicomponent diffusion and effective two-phase properties.  Transport in pores,
membranes and beds references the material/equipment assets.

## T14 - continuous solid material

```text
components ( steel );

solidMaterial
{
    densityRoute constant;
    caloricRoute solidCp;
    conductivityRoute isotropicSolid;
}

caloric
{
    energyBasis sensibleEnthalpy;
    solid { enthalpyRoute solidCp; }
}

transport
{
    solid
    {
        thermalConductivity { model constantIsotropic; }
    }
}
```

This is the equivalent of a conducting solid region.  It does not justify a global
`solidPropertiesDict`: it remains a thermophysical context.

## T15 - per-unit local context

A unit or a sector may own its own
`constant/thermophysicalPropertiesDict`, inheriting the components and replacing
only a COMPLETE thermophysical context.  The boundary announces its models and
audits the enthalpy datum.  Streams carry state, not models.

## T16 - sealed package

Any of T1-T15 may close its dependencies:

```text
constant/propertyData/
    manifest.dat
    components/
    species/
    chemistry/
    parameters/
```

Sealing changes reproducibility and data resolution, not the declared physics.

## Application to the Farelo cases

The Farelo tutorials are a particularly useful test of this architecture: they
combine aqueous activity at extreme concentrations, saturation of two salts, the
common-ion effect and, in the LiCl case, a hydrate whose reaction includes the
water activity.  The reference paper is Farelo, Fernandes and Avelino, *J. Chem.
Eng. Data* 50 (2005) 1470-1477, DOI 10.1021/je050111j.

The separation was checked against two mature architectures:

- A commercial simulator, `Literature/ASPEN/APRSYS 111 Physical Property Methods
  and Models-1.pdf`, chapters 1 and 5: the electrolyte property method, solution
  chemistry, apparent/real components and salt precipitation;
- the same simulator, `Literature/ASPEN/AspUserGuide10-1.pdf`, chapters 6 and 27:
  `Chemistry ID`, global/local selection and the electrolyte reaction types;
- USGS PHREEQC 3: a thermodynamic database separate from `SOLUTION`, candidate
  phases separate from `EQUILIBRIUM_PHASES`, and output separate in
  `SELECTED_OUTPUT`.

The examples that follow show the **proposed contract**, not the transitional
grammar the two tutorials execute today.  There are four distinct homes:

| Fact | Home |
|---|---|
| the activity model, its reference and the interaction parameters | `constant/thermophysicalPropertiesDict` |
| species, aqueous reactions and candidate pure phases | the network selected by `constant/chemistryDict` |
| log K, the reactions' stoichiometry and the phases' data | the chemical/thermodynamic catalogue |
| composition, pH, open/closed system and the phases authorised to react | `system/propsDict` |
| measured points and the observables to compare against | `constant/experimental/` + the test/report |

Measured points are NEVER intrinsic properties of a component.  A `propsDict`
asks for calculations AT the experimental points; it does not redefine the
thermodynamics for each point.

### F1 - NaCl + NH4Cl + H2O

The thermophysical dictionary declares only the solution's property context.
Because this tutorial's feed is an analysis in ionic totals, NaCl and NH4Cl are
NOT stream components: the only apparent component is water.  The chemical
network bound to the package determines the aqueous species and the minerals for
which saturation indices can be computed.

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;

components ( water );

aqueousProperties
{
    solvent water;
    activityCoefficients
    {
        model PitzerHMW;
        referenceBasis aqueousMolality;
        releases ( ionicActivities waterActivity osmoticCoefficient );

        interactionParameters
        {
            ionPairs
            {
                Na-Cl  "parameters/Pitzer/pairs/Na-Cl.dat";
                NH4-Cl "parameters/Pitzer/pairs/NH4-Cl.dat";
            }
            higherOrder
            {
                required ( theta(Na,NH4) psi(Na,NH4,Cl) );
                missingPolicy declaredZeroApproximation;
                justification
                    "binary-pair prediction; no curated mixed-ion fit";
            }
        }
    }
}

chemistryRef "constant/chemistryDict";
```

`aqueousProperties` supplies `gamma_i`, `a_i`, `a_w` and the osmotic coefficient.
It does not declare which species exist, does not solve balances and does not
precipitate solids.  There is no caloric block in this isothermal experiment;
`logK25` does not by itself imply an enthalpy route for an adiabatic crystalliser.

`missingPolicy declaredZeroApproximation` is deliberately noisy.  The current
catalogue contains the Na-Cl and NH4-Cl pairs, but contains neither a
`theta(Na,NH4)` interaction nor a `psi(Na,NH4,Cl)`.  A ternary prediction cannot
pretend that data was measured or fitted.

`chemistryDict` — the conceptual equivalent of the commercial simulator's
`Chemistry ID` and of PHREEQC's `SOLUTION_MASTER_SPECIES` +
`SOLUTION_SPECIES` + `PHASES` network — must select the Na/NH4/Cl network and
make halite/salammoniac available for the SI calculation.  **Its grammar is not
ratified yet, and so no block is invented here.**  Available for SI does not mean
present, nor authorised to precipitate; that authorisation belongs to an
`equilibrate` operation, like PHREEQC's `EQUILIBRIUM_PHASES`.

The current Choupo catalogue co-locates the phase and the dissolution reaction in
`components/NH4Cl.dat`:

```text
solidPhases
{
    salammoniac
    {
        dissolutionReaction
        {
            masters ( { ion NH4; nu 1; } { ion Cl; nu 1; } );
        }
        equilibrium
        {
            logK25 1.2364;
            dH 14800;
            source "calibrated to Farelo pure-NH4Cl saturation, 298.15 K";
        }
    }
}
```

This describes the current state faithfully, but **must not yet be declared the
final architecture**.  The commercial simulator keeps precipitation and the
constant in its solution chemistry; PHREEQC keeps stoichiometry and `log K` in
the `PHASES` record.  Thermodynamically, the reaction's K depends on the
stoichiometry and on the aqueous species' reference states, not on the crystal's
identity alone.  The v2 decision is between (a) keeping a typed phase sub-record
inside the component, with the chemical dependency explicit, and (b) separating
the solid's identity/properties from the dissolution reaction in the chemical
catalogue.  One does not choose between them for the reader's convenience.

The Pitzer pair is a record of the model itself, consumed where it was referenced:

```text
recordType electrolytePairParameters;
modelFamily Pitzer;
compatibleActivityModels ( Pitzer PitzerHMW );
pair { cation NH4; anion Cl; }
coefficients
{
    beta0 0.0522; beta1 0.1918; beta2 0.0;
    Cphi -0.00301; alpha1 2.0; alpha2 12.0;
}
source "Pitzer and Mayorga (1973); validated against Farelo (2005)";
```

Finally, `system/propsDict` holds the analysis's basis and walks the measured
compositions.  This is the current executable form of one entry:

```text
{
    name farelo_NaCl_nh4_187;
    type speciate;
    analyticalTotals
    {
        Na 5.00 mol/kg; NH4 1.87 mol/kg; Cl 6.87 mol/kg;
    }
    pH solve;
    diagSpecies ( Na NH4 );
    output { file f_187.csv; }
}
```

This operation computes the speciation and the SI of the candidate phases; it does
not alter the composition to reach SI = 0.  A eutonic calculation would
additionally carry `equilibrate { minerals ( halite salammoniac ); }` plus phase
inventories/limits.  That active set's current non-convergence at an approximate
ionic strength of 8.6 mol/kg is a separate numerical limitation.

### F2 - LiCl + H2O with LiCl.H2O(s)

This case uses LiCl as an apparent component because the operations supply
`composition { LiCl ...; }`; `dissociatesTo` converts that entry onto the ionic
basis.  The hydrate remains a CANDIDATE chemical phase, not an automatically
present one.  The aqueous model must supply `waterActivity`, because `a_w` enters
the hydrate reaction's quotient.

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;

components ( water LiCl );

aqueousProperties
{
    solvent water;
    activityCoefficients
    {
        model PitzerHMW;
        referenceBasis aqueousMolality;
        releases ( ionicActivities waterActivity osmoticCoefficient );
        interactionParameters
        {
            ionPairs
            {
                Li-Cl "parameters/Pitzer/pairs/Li-Cl.dat";
            }
        }
    }
}

chemistryRef "constant/chemistryDict";
```

`chemistryDict` must include Li and Cl in the network and make
`lithiumChlorideH2O` available for SI.  The syntax remains to be ratified.  The
phase enters a mass-transfer equilibrium only when an operation lists it
explicitly in `equilibrate`.

In the current catalogue, the hydrate's co-located record makes the water leg
explicit; the same pending architectural decision described above applies:

```text
solidPhases
{
    lithiumChlorideH2O
    {
        dissolutionReaction
        {
            masters ( { ion Li; nu 1; } { ion Cl; nu 1; } );
            nuWater 1;
        }
        equilibrium
        {
            logK25 4.9841;
            source "calibrated to Farelo LiCl saturation at 298.15 K";
        }
    }
}
```

Its Pitzer record documents that this is no longer an independent prediction of
Farelo's data:

```text
recordType electrolytePairParameters;
modelFamily Pitzer;
compatibleActivityModels ( Pitzer PitzerHMW );
pair { cation Li; anion Cl; }
coefficients
{
    beta0 0.17; beta1 0.278; beta2 0.0;
    Cphi -0.0026; alpha1 2.0; alpha2 12.0;
}
fit
{
    sources ( "Hamer and Wu (1972)" "Farelo et al. (2005)" );
    validity { molality ( 0 19 mol/kg ); }
}
```

So the comparison at 19.7 mol/kg is a CHECK of the `Li-Cl` calibration and of the
hydrate's Ksp, not a blind validation.  The intermediate mean-activity points
still test the correlation's shape.  The precipitation path's current divergence
near I = 20 mol/kg should appear as a numerical limit in the operation's report,
without altering these dictionaries.

### F3 - the paper's remaining systems

| System | Variation on F1/F2 | Honest status |
|---|---|---|
| KCl + NH4Cl + H2O | `sylvite` + `salammoniac`; the K-Cl and NH4-Cl pairs; mixed interactions declared | the same architecture as F1 |
| NaCl + LiCl + H2O | `halite` + `lithiumChlorideH2O`; the Na-Cl and Li-Cl pairs | the same architecture, `a_w` included |
| KCl + LiCl + H2O | `sylvite` + `lithiumChlorideH2O`; the K-Cl and Li-Cl pairs | the same architecture, `a_w` included |
| NaCl/KCl + AlCl3 + H2O | alkali chlorides + `AlCl3.6H2O` and Al3+ hydrolysis | refused until curated speciation, parameters and a solid phase exist |

The paper contains 553 points for six ternaries, but a large CSV does not
automatically turn the six systems into valid models.  In particular, the AlCl3
cases must not be activated with a cosmetic dictionary: the paper reports a pH
below 2.75, and Al3+ hydrolysis is part of the necessary physics.

## Homes of the data

### Intrinsic per-component data

```text
components/<name>.dat
    identity
    criticalConstants
    vaporPressure
    idealGasHeatCapacity
    liquidHeatCapacity
    solidHeatCapacity
    standardThermochemistry
    phaseTransitions
    {
        liquidVapour
        {
            model Watson;
            referenceTemperature Tb;
            referenceEnthalpy Hvap_Tb;
        }
        solidLiquid
        {
            transitionTemperature Tm;
            enthalpyFusion Hfus;
        }
        solidVapour
        {
            enthalpySublimation Hsub;
        }
    }
    liquidVolume / density
    solidPhases
    groups { joback; unifac; }
    uniquac
    cosmo { <set> { ... } }
    eosParameters { PCSAFT { ... } }
    transportParameters
```

There are no per-model components (`water_PC-SAFT`, `water_COSMO`, and so on).

`vaporPressure` and `phaseTransitions.liquidVapour` are DIFFERENT data.  An
Antoine correlation supplies `Psat(T)`; it does not, by itself, supply an
independent enthalpy of vaporisation.  The derivative of `ln(Psat)` can produce an
effective Clausius-Clapeyron value under assumptions, and should serve as a
consistency AUDIT, never as a silent substitute for `Hvap(T)`.  Likewise melting
requires at least `Tm`, `Hfus` and the solid and liquid Cp routes to leave the
transition temperature.

### Data that name a pair or an interaction

```text
parameters/NRTL/<i>-<j>.dat
parameters/UNIQUAC/<i>-<j>.dat
parameters/Wilson/<i>-<j>.dat
parameters/Henry/<solute>-<solvent>.dat
parameters/SRK/<i>-<j>.dat
parameters/PengRobinson/<i>-<j>.dat
parameters/PCSAFT/<i>-<j>.dat
parameters/electrolyte/{pairs,lambda,theta,psi,zeta}/...
```

These files are not selected by a global block.  The reference appears inside the
`activityModel`, `fugacityModel`, Henry group or electrolyte model that actually
consumes them.

## Where the mixing rules live

There is no global `mixingRules{}`, because a viscosity rule cannot be applied to
a density or to an EoS.  Each property declares its own rule:

| Property | Where the rule lives | Examples |
|---|---|---|
| EoS/fugacity | `equilibrium.equationOfState.mixingRule` | van der Waals one-fluid, PC-SAFT one-fluid |
| activity/excess | the `activityModel` itself | NRTL, UNIQUAC, Wilson, UNIFAC, COSMO-SAC |
| ideal Cp/enthalpy | `caloric.<phase>.heatCapacityMixingRule` | moleWeighted, massWeighted |
| excess enthalpy | `caloric.<phase>.excessModel` | the same activity surface, IF calorimetrically supported |
| density/volume | `volumetric.<phase>.mixingRule` | volumeAdditive, EoS-native |
| viscosity | `transport.<phase>.viscosity.mixingRule` | Wilke, logarithmic |
| thermal conductivity | `transport.<phase>.thermalConductivity.mixingRule` | Wassiljewa, massWeighted |
| diffusion | `transport.<phase>.diffusivity.mixingRule` | Maxwell-Stefan / multicomponent |
| surface tension | `transport.interface.surfaceTension.mixingRule` | moleWeighted, or a validated interfacial model |

In a mixture's phase change, the enthalpy is not an isolated average of `Hvap_i`:
it follows from the difference between the phases' COMPLETE enthalpies, including
their different compositions, Cp, excess enthalpies and the EoS's residual
contributions.  A component's `Hvap`/`Hfus` data are a component anchor/route,
not a universal mixing rule.

### Active chemistry

`chemistryDict` selects aqueous, gas-liquid, mineral, ion-exchange and process
reactions.  The selection is separate from the thermophysical calculation, but
the assembly validates both together.

## Invalid combinations

1. two different EoS on the roots of one phi-phi flash;
2. a `kij` fitted for one EoS consumed by another;
3. COSMO-SAC with no profile, or mixing sigma-profile families;
4. two general activity models on the same phase;
5. Henry replacing Pitzer/eNRTL across a whole brine;
6. equilibrium between phases with different data and no `phaseEquilibrium`;
7. a caloric route reusing parameters fitted to VLE alone, with no evidence;
8. transport requested without the necessary model, data or mixing rule;
9. silent estimation during assembly;
10. sample/equipment data presented as intrinsic to the component.

## Coverage

T1-T16 cover the configurations present in the 289 `propertyDict` files plus the
extensions discussed: COSMO-SAC, PC-SAFT, gaseous CO2, full transport,
speciation, solids and fundamental kernels.  The current executable grammar
should be MIGRATED to this contract; it must not determine the final design.
