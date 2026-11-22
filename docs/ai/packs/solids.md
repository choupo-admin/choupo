# Pack: solids (gas-solid separation, size distributions, milling, solid-liquid separation, drying, crystallisation)

budget: 1400 words (~2240 tokens)

Read after the brief (`docs/ai/brief.md`). Binary: `choupoSolve`. Fuller keys, per unit: `docs/ai/unit-ops.md` sections "Solids separators", "Size distribution and size reduction", "Drying", "Crystallisation". A tutorial is a check, not a template; a missing key is refused by name, and the refusal usually names what to write.

## 1. Which unit

| You have | Use |
|---|---|
| dust in a gas | `cyclone` (model word), `bagFilter`, ideal split: `gasSolidSplitter` |
| solids conveyed in a gas line | `pneumaticConveyor` |
| a size distribution and a size reduction | a case `sizeGrid`, then `mill` |
| a size split by sieve or hydraulics | `screen`, `classifier`, `hydrocyclone` |
| a slurry to separate | `cakeFilter`, `thickener`, `sedimentingCentrifuge` |
| a wet solid or a solution to dry | `solidDryer`, `sprayDryer`, `evaporativeDryer`, `convectiveDryer` |
| crystals from a solution | `crystalliser` (`equilibrium`, `MSMPR`, `FVM`) |
| a solid dose placeholder (blender, press, packaging line) | `mixer` / `splitter`: pack `batch-plant` |

## 2. A solid is declared on the component and on the stream

- A solid component carries `solid { rho_p; }` in its record (a missing density is REFUSED by name; several solids take a volume-additive mean, announced). Sample-specific data (a settling test, a filtration test, a drying curve, an isotherm) live in the CASE (`constant/experiments`, `constant/dryingKinetics`), not in `data/standards/`.
- In `0/<stream>`, solids are a phase of the overall flow, with a PSD where the unit needs one:
```
phases { vapour { componentMolarFlows { N2 50 kmol/h; } }
         solid  { componentMolarFlows { silica 46.6 kmol/h; } } }
particleSizeDistribution { diameter ( 0.0001 0.0002 0.0005 ); massFrac ( 0.3 0.5 0.2 ); }
```
(`diameter` in metres, bare SI; there is no `um` in a list.) A mixed stream is a pneumatic or slurry feed, never a fixed-bed stream.

## 3. Gas-solid

From `tutorials/steady/gas-solid/cyclone01_dust_removal`:
```
{ name cyclone; type cyclone; model Lapple;     // Lapple (default) | LeithLicht | IoziaLeith | Barth | Muschelknautz
  in feed; outputs ( cleanGas capturedSolids );
  operation { bodyDiameter 0.5 m; numberOfTurns 5; } }
```
It classifies by size, so the feed needs a PSD. `Muschelknautz` adds the solids-loading effect (`tutorials/steady/gas-solid/cyclone04_high_loading`); validation cases `cyclone02_leith_licht`, `cyclone05_dirgo_leith_validation`. `bagFilter`: `operation { filterArea 30 m2; arealDustLoad 0.5; K1 1e9; K2 1e10; penetration0 0.02; dCharacteristic 1e-6; }` (`tutorials/steady/gas-solid/bagFilter01_dust`), headline KPI `dP_filter`. `gasSolidSplitter`: `operation { solidsRecovery 0.9; gasCarryover 0.01; }`, PSD passes unchanged (`gasSolidSplitter01_ideal`; `02_rosinRammler`, `03_tabular_psd`, `04_lognormal_psd` declare the PSD). `pneumaticConveyor`: `operation { geometry { D 0.1 m; L 8 m; dz 2 m; bends ( { type longRadius; } ) } }`; needs a gas viscosity model in `transport { vapour { viscosity { model Chung; } } }`; warns aloud below the saltation velocity; `tutorials/steady/solids/pneumaticConveyor01_sand`, `pneumaticConveyor02_bends`.

## 4. Size distribution and size reduction

ONE size axis per case, declared in `system/flowsheetDict` (nothing PSD-aware runs without it; two grids are refused):
```
sizeGrid { xMax 2.36 mm; ratio 1.41421356; nClasses 13; }   // pan included
```
Every authored PSD inlet is re-binned onto it, mass exactly, and publishes `d10 d50 d80 d90 d32` (`tutorials/steady/solids/psd01_grid_and_moments`). A measured sieve table goes on its own `edges`. Then, from `tutorials/steady/solids/mill01_limestone_herbstFuerstenau`:
```
{ name mill; type mill; model austin; in feed; outputs ( product );
  operation { specificEnergy 1.82 kWh/t;       // exactly ONE of W_shaft / specificEnergy
              residence plugFlow; residenceTime 2 min;
              selection { S1 0.780 1/min; x1 1.98451 mm; alpha 0.75; }
              breakage  { model austin; phi 0.456; gamma 0.75; beta 2.2; } } }
```
Bond's work index is printed beside the result, never instead (`mill02_bond_crosscheck`; impact breakage `mill03_impact_vogelPeukert`). Size splits: `screen` (`model karra`, `aperture`, `wireDiameter`, `inclination`, `area`, `deck`, `wetScreening`, `bulkDensity`: `screen01_dolomite_karra`; a declared law `screen02_declared_rosinRammler`), `classifier` (`partition { model whiten; d50c 200 um; alpha 3.0; }`, `bypass`, `fluidToCoarse`: `classifier01_whiten_quartzSlurry`), `hydrocyclone` (`model declared; operation { waterToUnderflow 0.39; partition { model tabulated; corrected ( ... ); } }`: `hydrocyclone01_quartz_willsTable91`); a closed grinding circuit with a recycle: `circuit01_herbstFuerstenau_closedCircuit`; slurry split by size: `splitter01_slurry_sizeDistribution`. All of these are under `tutorials/steady/solids/`.

## 5. Solid-liquid separation

- `cakeFilter` (`outputs ( cake filtrate )`), a `model` word and a `sample` that names a record in the case's `constant/experiments` (the measured specific resistance): `tutorials/steady/solids/filter01_caco3_rotaryDrum`:
```
{ name drum; type cakeFilter; model rotaryDrum; in slurry; outputs ( cake filtrate );
  operation { pressureDrop 67.0 kPa; submergence 0.33; cycleTime 250 s; sample caco3_geankoplis_ex24_2_4; } }
```
Siblings: `filter02_caco3_pressWashing`, `filter03_drum_area_medium_tabulatedWash`, `filter04_leafFilter_sameAsFiltrateWash`, `filter05_calciumSilicate_measuredTest` (all `tutorials/steady/solids/`).
- `thickener` (`model talmageFitch`, `operation { settlingTest { initialConcentration 250 kg/m3; time (...) s; height (...) m; } compressionTime 1.75 h; underflowConcentration 700 kg/m3; }`): `tutorials/steady/solids/thickener01_settlingTest_talmageFitch`.
- `sedimentingCentrifuge` (`outputs ( sediment centrate )`, `model tubularBowl`, `bowlRadius liquidRadius bowlLength speed sedimentSolids`): `tutorials/steady/solids/centrifuge01_tubularBowl_geankoplis`; disc stack: `centrifuge02_discStack_sigmaIdentity`.

## 6. Drying

`inputs ( feed dryingAir ); outputs ( powder exhaustAir );` The drying air is a real stream (components N2/O2/water), its outlet T is a RESULT. From `tutorials/steady/drying/sprayDryer01_sugar`:
```
{ name dryer; type sprayDryer; inputs ( feed dryingAir ); outputs ( powder exhaustAir );
  operation { wheelDiameter 0.1 m; wheelSpeed 20000; chamberDiameter 1.0 m; chamberHeight 5.0 m; }
  dryingCurve sugarDrying; }        // constant/dryingKinetics: critical X and the falling-rate curve
```
The feed's density, viscosity and surface tension come from the property dictionary (`transport { liquid { viscosity ... } }`, `transport { interface { surfaceTension ... } }`); typing `viscosity`, `density`, `sigma` in `operation` is refused by name. Variants: `sprayDryer02_residence_sweep`, `sprayDryer03_pressure_nozzle`, `sprayDryer05_whey`, `sprayDryer07_design`; solid dryer `solidDryer01_sugar`; evaporative `evapDryer01_nacl`; convective `convDryer01_sugar_curve`, `convDryer02_sugar_countercurrent`.

## 7. Crystallisation

Verbatim keys from `tutorials/steady/crystallisation/crystalliser02_msmpr`:
```
type crystalliser;  model MSMPR;               // equilibrium (default) | MSMPR | FVM
crystallisation sucroseKinetics;                // -> constant/crystallisation (kinetics)
operation { operatingTemperature 293.15 K;  volume 5.0 m3; }
```
(That case writes the unit in the leaf-node form; in a `units ( { ... } )` list it is a normal block with `in feed; outputs ( magma );`.) `equilibrium` needs only a solubility (a `solubility {}` curve on the solute component, or the electrolyte salt of the package); `MSMPR` and `FVM` also need kinetics and `solid { rho_p; k_v; }` on the solute (no `k_v`: the sphere, announced; no `rho_p`: refused) and return the crystal size distribution. `inputs ( brine antisolvent );` combines feeds inside the unit (drowning-out). `operation { solute KCl; }` picks the salt when several are present. Cases: `crystalliser01_sugar`, `crystalliser03_pbe_size_independent`, `crystalliser04_size_dependent_growth`, `crystalliser05_nacl_pitzer`, `crystalliser08_nacl_antisolvent_msmpr`, `crystalliser09_KHT_KCl_series` (all `tutorials/steady/crystallisation/`). Electrolyte feeds: pack `electrolytes`. A batch crystalliser and a batch dryer are `choupoBatch` units (pack `transient`).

## 8. Pitfalls

- No `sizeGrid`, no PSD maths: a PSD inlet without the grid is passed through, not classified.
- A key typed twice (for example a density beside a record that owns it) is refused, not merged; delete the key.
- A mill takes exactly ONE of `W_shaft` and `specificEnergy`.
- A dryer outlet T, a cut size, a pressure drop, a crystal mean size are RESULTS; "which area for a 5 percent moisture" is a `designSpec`.
- Measured sample data are the CASE's: copy the structure of the witness record, never take a number from memory.
- Guides: Theory Guide `ch:crystalliser`, `ch:crystalliser-fvm`, `sec:size-grid`; the solids and drying chapters in `docs/theoryGuide.tex` and `docs/tutorialsGuide-steady.tex`.

<!-- RUN: the cases named above are golden-checked by bin/runTests.
     SOURCES: docs/ai/unit-ops.md lines 2365-3030 (solids, size, drying, crystallisation); the flowsheetDict of each case named above.
-->
