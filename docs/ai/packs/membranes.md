# Pack: membranes (NF, RO, UF modules, plants of stages, energy recovery, electrodialysis)

budget: 1200 words (~1920 tokens)

Read after the brief (`docs/ai/brief.md`). Binary: `choupoSolve`. Units: `spiralWoundModule` (alias `membraneSW`) · `pressureExchanger` · `pump` (booster) · `electrodialysisStack`. Batch diafiltration is a `choupoBatch` unit (`batchDiafilter`, `docs/ai/unit-ops.md`). Fuller keys: `docs/ai/unit-ops.md` section "Membrane (NF/RO)". Research-grade model theory: `docs/ai/membrane-research.md`.

## 1. The shape of a membrane case

One `spiralWoundModule` is ONE STAGE: `in feed;` `outputs ( retentate permeate );` (retentate first). A plant is one unit per stage in `flowsheetDict`, with a `pump` between stages. The module marches along the channel in `nNodes` stations. Results (KPIs): `J_w_avg`, `R_obs_<solute>`, `water_recovery`, `dP_feed`, and per element `J_w_avg_elemK`, `dP_elemK`.

Feed (`0/feed`), all in `componentMolarFlows`, plus `T` and `P` (the HIGH side pressure): the membrane unit prices the solvent and each solute from the stream, so declare water and every salt:
```
componentMolarFlows { water 569.02 kmol/h;  NaCl 5.98 kmol/h; }
T 298.15 K;   P 5500000 Pa;
```
Thermo (`constant/thermoPhysPropDict`): `components ( water NaCl ); equilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; } vapour { fugacityModel idealGas; } }`.

## 2. Minimal case: an RO element with typed numbers

Verbatim from `tutorials/steady/membranes/membrane01_RO_NaCl_seawater`:
```
{ name ROunit; type spiralWoundModule; in feed; outputs ( retentate permeate );
  operation
  { membrane SW30HR;        // a record in data/standards/assets/
    area 35.0;  length 1.0;  // m2, m
    P_permeate 1.0 bar;
    k_film 5.0e-5;           // m/s, a constant film coefficient
    dP_feed_total 2.0 bar;
    nNodes 100; } }
```
Membrane records shipped (`data/standards/assets/`): `SW30HR`, `SWRO`, `NF270`, `NF270_dspmde`, `NF_OPEN`, `NF_TIGHT`, `NF_DIVALENT_SELECTIVE`, `BWRO_HIGH_FLUX`, `BWRO_HIGH_REJECTION`. A name not in the folder is refused with the registered list; never invent a membrane or its permeability: if the student's membrane is not there, say so and use the fit route (section 6).

## 3. Hardware as a record: module, elements, vessels

From `tutorials/steady/membranes/membrane15_module_nf270_4040`:
```
operation
{ module NF270-4040;  P_permeate 1.0 bar;  nNodes 50;
  massTransfer { model SchockMiquel; }     // spacer channel from the record
  pressureDrop { model SchockMiquel; }
  polarisation { suctionCorrection GeraldesAfonso2006; ionCoupling none; } }
```
- `module <name>;` takes area, channel height, porosity and leaf length from the record (`NF270-4040`, `SW30HR-380`, the flat cell `SEPA_CF`, and `Generic-2540/4040/8040/16040` which need a `membrane` beside them). Typing `area`, `length`, `channelHeight` or `spacerPorosity` beside `module` is REFUSED (one home). Values the sheet does not state are announced `[estimate]`; limits are announced `[limit]`, never refused.
- `elements m;` in series per vessel, `vessels n;` in parallel per stage, `interElementDP`.
- Liquid properties are NOT typed in the unit: a `viscosity`, `rho_feed` or `diffusivity` key is refused by name. The case declares them in `constant/thermoPhysPropDict` (`transport { liquid { viscosity ...; diffusivity ...; } }` and `approximations { massWithoutVolume {...} }`); copy that block from the witness.
- `osmotic { model Pitzer; }` instead of the default van't Hoff: `tutorials/steady/membranes/membrane06_pitzer`.
- Concentration polarisation: `k_film` (constant) or a `massTransfer` model; the film policy is a `polarisation {}` block, never inside `massTransfer`.

## 4. Transport laws: `transport <word>;`

| word | use when | needs |
|---|---|---|
| `solutionDiffusion` (default) | NaCl, sugar, one lumped salt; RO | membrane record permeabilities |
| `constantRejection` | a data sheet gives R per solute | `transportParameters { rejection { NaCl 0.60; } source "..."; }` (`fromRatedTest` inverts a sheet's rated test): `tutorials/steady/membranes/membrane23_constant_rejection_nf8040`, `membrane25_rated_test_inversion_nf270_4040` |
| `DSPM-DE` | charged NF pore, divalent ions, Donnan and dielectric exclusion | membrane record with a `poreModel {}`, salts carrying `electrolyte { cation; anion; }`: `tutorials/steady/membranes/membrane10_dspmde_divalent` (`membrane NF270_dspmde; transport DSPM-DE;`) |
| `SDEM` | electroneutral multi-ion NF with traces | `tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces` |
| `gelPolarisation` | UF with a gel layer | `tutorials/steady/membranes/membrane19_uf_gel_polarisation` |

An ion-declared feed with `solutionDiffusion` couples nothing: the permeate then carries a net charge and the run says so; use a salt-declared feed, `SDEM` or `DSPM-DE`. DSPM-DE solves the pore itself (finite differences, 101 nodes by default, announced); never write `method closedForm;` (retired, refused). Optional `transportParameters { poreSolver {...} hindrance DechadilokDeen2006; }`.

## 5. Plants: stages, booster pumps, energy recovery, scaling

- Two-stage NF array: `tutorials/steady/membranes/membrane21_two_stage_nf_array` (and `membrane22_two_stage_nf_array_dspmde`); a train: `membrane05_train`.
- Seawater RO with a `pressureExchanger`: `inputs ( highPressureIn lowPressureIn )` (brine, then seawater), `outputs ( highPressureOut lowPressureOut )`. `efficiency`, `mixing`, `leakage`, `P_LPout` and `source` are ALL required, no defaults: `tutorials/steady/membranes/membrane27_swro_energy_recovery`. Plant context with machine counts: `tutorials/plant/swro01_campoDalias`.
- Scaling of the concentrate (saturation index) from the Pitzer package: `tutorials/steady/membranes/membrane07_scaling_si`, `membrane08_softened_scaling`.
- Feed-and-bleed, a transient: `tutorials/steady/membranes/membrane18_nf_feed_and_bleed`; a start-up: `tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup` (pack `transient`).

## 6. Class shortlist, fitting, characterisation (choupoProps)

When the membrane is not in the catalogue, the order is: shortlist a class (`op:membraneShortlist`: `tutorials/props/membrane/shortlist01_class_to_modules`), characterise from lab data (`tutorials/props/membrane/dspmde02_lab_characterisation_template`), fit then simulate (`tutorials/steady/membranes/membrane24_fit_then_simulate`), water permeance from sheets (`membrane28_water_permeance_from_sheets`). The fit is Choupo's, never yours.

## 7. Electrodialysis

Name the stack: it is a record, not typed hardware. From `tutorials/steady/electrodialysis/ed03_stack_record`:
```
{ name edStack; type electrodialysisStack;
  inputs ( diluateFeed concentrateFeed );  outputs ( diluate concentrate );
  operation { stack EUR2C-7P18;   // kind edStack record
              current 2.0;        // A; OR targetDemin <fraction>; OR targetConductivityRemoval <fraction> -- exactly one
              xi 0.9;  E_electrodes 1.5; } }
```
`N_cellpairs`, `membraneArea`, `channelThickness`, `channelLength`, `spacerPorosity`, `hydraulicPasses` or `linearVelocity` beside `stack` is refused. Whether `membrane` is declared is decided by the record (`EUR2C-7P18` carries it; `EurodiaED-100P-50` needs it declared). A current above the limiting current is announced, never clamped (`tutorials/steady/electrodialysis/ed02_over_limiting_current`). A viscosity model is required in `transport { liquid { viscosity { model Vogel; } } }`. Stages, feed-and-bleed: `ed06_stages_in_series`, `ed07_feed_and_bleed`.

## 8. Pitfalls

- Outputs are `( retentate permeate )`; swapped, the permeate is the brine.
- `P` on the feed is the HIGH side, `P_permeate` the low side; the driving force is `dP - dpi`, so a feed below its osmotic pressure gives no flux (announced).
- Recovery is a RESULT. "Which area gives 50 % recovery" is a `designSpec` on `$area`.
- Declaring a physical constant a record owns (area, channel, density) beside its record is refused: read the refusal, delete the key.
- A bare `k_film` is a constant: for a real element use `massTransfer { model SchockMiquel; }`.
- No O-CMF or other research devices in a student case: spiral-wound solution-diffusion is the textbook route.
- Guides: Theory Guide `ch:membrane`, `ch:dspmde`, `ch:sdem`; User Guide `sec:membranes`; `docs/theoryGuide.tex` label `sec:membrane-liquid-properties` for where the liquid properties come from.

<!-- RUN: membrane01, membrane15, membrane10, ed03 checked by `expected` goldens (bin/runTests).
     SOURCES: docs/ai/unit-ops.md lines 1190-1215 (pressureExchanger), 1878-2270 (module, transport laws), 4492-4530 (electrodialysisStack); the cases named above.
-->
