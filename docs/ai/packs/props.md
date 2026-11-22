# Pack: props bench (choupoProps: evaluate, scan and verify properties, no flowsheet)

budget: 1250 words (~2000 tokens)

Read after the brief (`docs/ai/brief.md`). Use it when the student asks for a property, a curve, a diagram or a check, not a process: "what is Z of CO2 at 100 bar", "draw the T-x-y of ethanol-water", "steam properties", "is this correlation right". Binary: `choupoProps`. Pack `properties` is the sister pack for a component or pair the catalogue LACKS (lookup, estimate, fit). Fuller keys: `docs/ai/unit-ops.md` section "choupoProps", `docs/ai/patterns.md`, `docs/ai/thermophysical-properties.md`; the 57 operations are listed by name in `src/propertyOps/PropertyOperation.cpp`.

## 1. The shape of a props case

```
case/
  <name>.cho
  system/controlDict     application choupoProps;  description "..."; verbosity 2;
  system/propsDict       operations ( { name ...; type ...; ... } { ... } );
  constant/thermoPhysPropDict   the same thermophysical system a flowsheet uses (brief section 5)
```
No `0/`, no `flowsheetDict`. Each operation is a block with a `name` and a `type`; results go to STDOUT (a point) or a CSV named in `output { file x.csv; }` (a scan, long form, one row per node), and into the result JSON. The first law and mass balance do not apply.

## 2. Evaluate and scan: the workhorses

State and properties (`propertyPoint`), from `tutorials/props/molecular/entropy01_air_ledger`:
```
{ name ledger; type propertyPoint;
  state { T 400 K; P 2 bar; composition { N2 0.79; O2 0.21; } }
  properties ( s_ig_N2 s_ig_O2 S_ig S_R S_real Cp_ig Z ); }
```
A 1-D scan (`propertyScan1D`), a P-x-y from `tutorials/props/scan/pxy01_ethanol_water_70C`:
```
{ name pxy; type propertyScan1D;
  vary { variable x[ethanol]; from 0; to 1; n 21; }
  state { T 343.15 K; P 1 atm; composition { ethanol 0.5; water 0.5; } }
  properties ( P_bubble y_eqT_ethanol );
  output { file pxy.csv; } }
```
(`vary { variable T; from 250 K; to 400 K; n 51; }` for a temperature scan.) A 2-D grid (`propertyScan2D`, a heat map), from `tutorials/props/scan/scan2d01_co2_compressibility`:
```
{ name Z_co2_TP; type propertyScan2D;
  varyX { variable T; from 280 K; to 420 K; n 15; }
  varyY { variable P; from 1 bar; to 200 bar; n 20; }
  state { composition { CO2 1.0; } }
  properties ( Z v_molar );  output { file Z_co2_grid.csv; } }
```
Its `constant/thermoPhysPropDict`: `components ( CO2 ); equilibrium { formulation phiPhi; equationOfState { model PengRobinson; } }`. The property words: `T P Psat_<comp> T_bubble P_bubble y_eq_<comp> y_eqT_<comp> gamma_<comp> Cp_liquid_<comp> Hvap_<comp> Cp_ig H_ig S_ig Z v_molar H_R S_R H_real S_real viscosity thermal_conductivity diffusivity` (and the liquid forms `mu_L k_L D_L`). `Psat_`, `gamma_`, `y_eq_`, `Cp_liquid_`, `Hvap_` are per component; the rest are mixture scalars at `state.composition`. A word the package cannot compute is refused by name (a liquid Cp for a component with no `liquidHeatCapacity` record). Never answer a property from memory: run the op or say Choupo does not have it.

## 3. Which operation

| The student wants | `type` | Witness (under `tutorials/props/`) |
|---|---|---|
| one state, any property | `propertyPoint` | `molecular/entropy01_air_ledger` |
| every term of H or S, re-added and checked | `explainProperty` | `molecular/entropy01_air_ledger` |
| a curve, a grid, a ternary diagram | `propertyScan1D`, `propertyScan2D`, `propertyScanTernary`, `propertyScanBinary` | `scan/pxy01_ethanol_water_70C`, `scan/scan2d01_co2_compressibility`, `scan/ternary01_audit_vlle` |
| P-T envelope of a feed, cricondentherm | `phaseEnvelope` | `molecular/envelope05_natural_gas_phiphi` |
| a pure-fluid phase diagram, H-x-y | `purePhaseDiagram`, `enthalpyConcentration` | `scan/phase01_water_full`, `scan/hxy01_ethanol_water_1atm` |
| phase split along T or P | `phaseSplitScan` | `thermo/phaseSplit01_freeze_water_ethanol` |
| a flash at a spec pair (P,S) (P,H) (P,V/F) (T,V/F) | `flashSpec` | `thermo/flashSpec01_wet_steam_expansion` |
| steam tables, IAPWS-95, a reference equation | `steamTables`, `referenceEoS` | `steam/steam01_if97_verification`, `thermo/refEoS01_iapws95_verification` |
| LLE tie lines against measurement, extraction shortcut | `lleTieLines`, `extractionShortcut` | `compare/lle01_acetic_mibk_perry` |
| VLE thermodynamic consistency; H surface identity | `vleConsistency`; `hConsistency` | `compare/compare_vle_etoh_water`; `thermoTest/h_surface_identity` |
| mixing rules, exergy, solubility parameter, Hansen | `mixingRules`, `exergy`, `solubilityParameter`, `hansenMixture` | `molecular/mixrules01_natural_gas`, `molecular/exergy01_air_dead_state`, `molecular/solubility01_hildebrand_ladder`, `solvents/solvent01_synthetic_mixture` |
| psychrometrics | `psychrometricChart` | `heat/psychro01_n2_water` |
| friction factor, Nusselt, Bell-Delaware | `frictionBench`, `heatTransferBench`, `bellDelawareBench` | `hydraulics/moody02_correlation_sweeps`, `heat/bellDelaware01_hewitt_example62` |
| transport properties | `transportBench` | `transport/transport02_chapman_enskog` |
| a rate law, a Thiele modulus, a reaction curve | `rateLawBench`, `thielePellet`, `reactionCurve`, `kinetics1D` | `kinetics/ammoniaRate01_dyson_simon`, `reactor/thiele01_sphere_first_order`, `compare/compare_kinetics_order` |
| adsorption isotherm | `isothermEval` | `adsorption/isotherm01_eval_13x_co2` |
| Gibbs of reaction, a Gibbs-energy map | `reactionGibbs`, `gibbsMap` | `gibbs/thermoTable01_propane_radicals`, `gibbs/landscape04_methane_combustion` |
| electrolyte activity, speciation, scaling | see pack `electrolytes` | `electrolyte/` |
| a pair or component lookup, estimate, fit | see pack `properties` | `molecular/pairLookup01_catalogue_ladder` |
| pore transport in a membrane, a shortlist | `poreTransport`, `membraneShortlist` | `membrane/dspmde01_water_treatment_salts`, `membrane/shortlist01_class_to_modules` |
| reconcile measured plant data | `dataReconciliation` | `reconciliation/reconcile01_recycle_loop` |

## 4. Steam and other fixed laws

```
{ name r1_T300_p3MPa; type steamTables; source "IAPWS R7-97(2012)"; point { P 3 MPa; T 300 K; } }
```
From `tutorials/props/steam/steam01_if97_verification`: a `source` citation is part of the op. For a wet-steam expansion use `flashSpec` with `spec { pair PS; P 0.1 bar; targetFrom { T 773.15 K; P 80 bar; } }` and `composition { water 1; }`. IF97 is only in force over its range; below 273.15 K a stream is priced on another route and the run says which.

## 5. Choosing the package

The same rule as a flowsheet (brief section 5): `gammaPhi` with `NRTL` for a polar liquid, `phiPhi` with SRK or Peng-Robinson for a gas or high P, `gammaGamma` for two liquids, `electrolyteGammaPhi` for salts. Declared pairs go where consumed (`binaryParameters { ethanol-water { } }` resolves from the catalogue). A pair that is not in the catalogue: pack `properties`. A scan over a composition of a binary in a package without a second liquid will not split: a VLLE needs an explicit `phases` block with two liquids (`tutorials/props/scan/ternary01_audit_vlle`).

## 6. Pitfalls

- Units in `from`/`to` of a `vary` carry their suffix (`250 K`, `1 bar`); a `composition` in a `vary` is `x[<comp>]`.
- `n` is the number of nodes, not intervals; `n 21` over 0 to 1 is steps of 0.05.
- A scan CSV has no golden of its own: pin a number with a `propertyPoint` as the case does for the P-x-y peak.
- A property the record lacks (a viscosity of a component with no transport entry) is refused by name, naming the block to add; never fill it from memory.
- `propertyScanTernary` needs exactly three components and a VLLE-capable package.
- Output files are CSV in long form; the GUI turns one into a one-click plot chip.
- Guides: `docs/propsGuide.tex` and `docs/propsGuide-operations.tex` (one section per operation), `docs/tutorialsGuide-props.tex`; Theory Guide sections of the package chosen.

<!-- RUN: the cases named above are golden-checked by bin/runTests.
     SOURCES: docs/ai/unit-ops.md lines 4245-4385; src/propertyOps/PropertyOperation.cpp (the registered names); the propsDict of the cases named above.
-->
