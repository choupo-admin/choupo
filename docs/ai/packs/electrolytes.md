# Pack: electrolytes (salts in water: activity, speciation, precipitation, evaporation and crystallisation of brines)

budget: 1100 words (~1760 tokens)

Read after the brief (`docs/ai/brief.md`). Two ways to meet an electrolyte: a property question (`choupoProps`, section 3) and a salt carried through a flowsheet (`choupoSolve`, section 2). Fuller grammar: `docs/ai/thermo.md` section `electrolyteGammaPhi`, `docs/ai/dict-syntax.md` (the `speciate` operation, around the HMW note). Never invent a Pitzer, eNRTL or Ksp number: pairs and constants come from the catalogue (`data/standards/parameters/Pitzer`, `data/standards/chemistry`, `data/standards/species`) or the student's cited data; "the catalogue has no pair for it" is an answer.

## 1. Which engine

| Question | Package / op | Valid for |
|---|---|---|
| gamma+- and osmotic coefficient of one salt to 6 mol/kg and off 25 C | Pitzer (`electrolyteActivity`, `pitzerActivity`) | NaCl-water: Pitzer, not eNRTL, off 25 C |
| a salt in a flowsheet (evaporator, crystalliser, membrane concentrate) | `formulation electrolyteGammaPhi;` with `activityModel { model Pitzer; }` | single salt, water volatile |
| speciation, pH, complexes, precipitation to saturation | `speciate` op (`choupoProps`); ionic rung `davies` (teaching) or `PitzerHMW` (a 2 mol/kg brine) | named species, a `chemistry` and `species` record per ion |
| salt in a mixed solvent (ethanol-water) | eNRTL mixed solvent (`enrtlMixedSolvent`, `enrtlMultiSalt`) | `tutorials/props/electrolyte/enrtl_mixed_nacl_ethanol_esteso`, `enrtl_multisalt_nacl_kcl` |
| sour water, acid gas over an aqueous phase | Edwards-Pitzer: `tutorials/props/electrolyte/edwards02_table7_vle` | |

Each Pitzer pair record has a temperature window; outside it EVERY route prints one advisory: obey it, do not quote the number as measured.

## 2. A salt in a flowsheet: the thermo dictionary

Verbatim from `tutorials/steady/evaporation/evaporator06_nacl_pitzer`, `constant/thermoPhysPropDict`:
```
recordType thermophysicalPropertySystem;  schemaVersion 1;
components ( water NaCl );
equilibrium
{ formulation electrolyteGammaPhi;
  aqueous { activityModel { model Pitzer; }  compositionBasis molality; }
  vapour  { fugacityModel idealGas; } }
caloric
{ energyBasis elementsDatum;
  aqueous { enthalpyRoute ionicReferencePlusExcess; }
  vapour  { enthalpyRoute idealGasCp; } }
```
The stream carries the SALT (`componentMolarFlows { water ...; NaCl ...; }`); the model reads the ions from the salt component's `dissociatesTo` and the `species/` records. And the unit that uses it (same case):
```
{ name evap; type evaporator; inputs ( feed saturatedSteam130C );
  outputs ( concentrated vapour condensate );
  operation { area 20.0 m2; U 2000.0 W/m2/K; } }
```
- The boiling-point rise and the dilution heat come out of the package (a calorimetrically fitted salt prints `heat of dilution`); beyond a record's `lphiValidityMax` the run announces `EXTRAPOLATED`. NaOH: `tutorials/steady/evaporation/evaporator10_naoh_triple_effect`, `evaporator11_naoh_olsson_50wt`. Same salt with eNRTL: `evaporator07_nacl_enrtl`; sucrose in brine: `evaporator09_nacl_sucrose_brine`.
- `pureFluids { water { method IF97; } }` cannot be combined with a dissolved salt.
- Crystallisers on the same package: `tutorials/steady/crystallisation/crystalliser05_nacl_pitzer` (cooling/evaporative), antisolvent: `crystalliser06_nacl_antisolvent`, `crystalliser12_nacl_pitzer_antisolvent` (more: pack `solids`).
- Membranes on a brine: `osmotic { model Pitzer; }` (pack `membranes`).

## 3. A property or a speciation question: `choupoProps`

`controlDict`: `application choupoProps;`. `system/propsDict`: `operations ( { ... } );`. The simplest op, the mean activity coefficient of NaCl on a molality grid (`tutorials/props/electrolyte/pitzer02_nacl_package`):
```
operations
( { name gamma_nacl; type electrolyteActivity;
    molality { from 0.1; to 6.0; n 30; }
    output { file pitzer_nacl.csv; } } );
```
Speciation and precipitation (`type speciate;`), from `tutorials/props/electrolyte/precipitation_ro_brackish`:
```
{ name feed_eq; type speciate;
  analyticalTotals { Ca 84 mg/L; Mg 27 mg/L; Na 363 mg/L; K 12 mg/L; Cl 510 mg/L; SO4 250 mg/L; HCO3 183 mg/L; }
  pH solve;                                   // or a number
  equilibrate { minerals ( calcite gypsum ); }  // allowed to precipitate to SI = 0
  output { file feed_eq.csv; } }
```
Its `constant/thermoPhysPropDict` is the aqueous-chemistry shape, NOT `equilibrium {}`:
```
components ( water );
aqueousProperties { activityCoefficients { model Davies; referenceBasis aqueousMolality; } }
```
(`model PitzerHMW;` for brines, as in `tutorials/props/electrolyte/pitzer_seawater_verify`.) The case also carries the species it uses: `constant/chemistry/<species>-formation.dat`, `constant/species`, `constant/parameters`, `constant/components` (each case is self-contained). Notes:
- Totals can be written stoichiometrically: `analyticalTotals { Cl 0.005 mol/kg; HCO3 $C_T; } totalsBasis stoichiometric; pH solve;` (carbonate titration: `tutorials/props/electrolyte/bjerrum01_carbonate_pH`).
- The precipitation result is a CEILING (SI = 0, infinite time, no nucleation barrier), not a deposit forecast.
- Scaling over a recovery range: `type scalingScan;` (same case); softener: `tutorials/props/electrolyte/softener_brackish`; RO scaling SI only: `scaling_ro_brackish`.
- Weak and amphoteric families exist as records (acetic, formic, tartaric, citric, malic, lactic, carbonate, phosphate, borate, amines, laboratory buffers): `tutorials/props/electrolyte/citricAcid01_speciation`, `volatileAcids01_acetic_formic`, `goodsBuffers01_hepes_mes`, `aminoBuffers01_tris_glycine`, `borate01_felmyWeare`. Look at which species names exist in `data/standards/species/` before writing one: a name not there is refused.
- Freezing-point depression: `type freezingPoint;` (`tutorials/props/electrolyte/fpd01_nacl_freezing`); the Pitzer fit to the student's own data: `electrolyteFit` (`tutorials/props/electrolyte/electrolyteFit01_nacl`).
- A hand-written Ksp or species record in `data/standards/` is a curation act; in a case it goes under `constant/` and is announced as an overlay (`tutorials/props/electrolyte/overlay01_nacl_ksp`).

## 4. Pitfalls

- Choosing Davies above about 0.5 mol/kg: it is a charge-only teaching rung; a 2 mol/kg brine needs `PitzerHMW`.
- Writing the ions as flowsheet components in a steady case: carry the SALT, let the package dissociate it (an ion-by-ion feed to a membrane couples nothing and charges the permeate).
- Expecting an NaCl enthalpy from the default report when the salt has no enthalpy datum: the run refuses and names it.
- Treating `electrolyteActivity` output as VLE: it is activity only; the VLE adapter is the `electrolyteGammaPhi` package.
- Anything above a record's temperature or molality window is an extrapolation: say so to the student.
- Guides: Theory Guide `ch:electrolytes`, `ch:pitzer-hmw`, `ch:enrtl`, `sec:enrtl-mixed`, `sec:enrtl-multisalt`, `ch:speciation`, `ch:phase-changer` (evaporator).

<!-- RUN: the cases named above are golden-checked by bin/runTests.
     SOURCES: docs/ai/thermo.md lines 523-730; docs/ai/unit-ops.md `evaporator`; the cases named above (thermoPhysPropDict, propsDict).
-->
