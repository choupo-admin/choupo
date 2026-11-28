# Which shipped cases answer their own question in a figure (C477 corpus survey)

Date 2026-11-24, branch of `main` as it stood; read-only survey, no case, engine or GUI file edited.  Author: a general on C477, for the architect.

## What was asked, and how it was measured

A case *answers in a figure* when it declares one (a `views` block in `system/postDict`, or in `system/propsDict` for `choupoProps`), or when its question is a scalar or a table that a figure would not improve.  Everything counted here was counted by script from the tree of this worktree (`system/controlDict` `description`, the `views` blocks, the presence of `system/outerDict`, the operation types in `system/propsDict`); the verdicts are the general's judgement.

- **Cases under `tutorials/`: 678** (`system/controlDict` found: steady 363, props 187, batch 84, plant 15, ctrl 21, unsteady 8, as `BRAIN.md` FACTS says).  The 1260 curation fits are NOT under `tutorials/`; they are `data/curation/{batches 6, components 103, electrolytes 67, henry 235, pairs 849}` (section at the end).
- **Declared views today: 68 cases** (script count of a `views` list in `postDict`/`propsDict`): steady 28, batch 3, ctrl 19, unsteady 8, plant 2, props 8.

Verdicts:
- **ANSWERED**: a declared `views` figure that answers the case question.
- **ANSWERED (default views)**: a `choupoProps` case whose operation publishes its own default views with nothing declared (`defaultViews`, DEV.md 4c C149; the 14 operations listed under gap G5); read from the operation type, not from a run.
- **ANSWERED (sweep CSV)**: the case runs under an `outerDict`; the sweep or optimiser CSV is drawn by the GUI Plots workspace (`gui/src/ui/PlotsWorkspace.tsx:161-168`, 317) but no `views` can be declared (gap G1).  Whether the default drawing is the right figure was NOT looked at in a browser, so this is the weakest ANSWERED.
- **SCALAR-OK**: the question is a number, a table or a witness of equality; a figure would not teach more.  The reason is in the last column.
- **NEEDS FIGURE**: the figure is named (x, y, series).  A `(Gn)` tag says the grammar or a publication cannot yet express it.

## Totals

| verdict | cases |
|---|---|
| ANSWERED | 68 |
| ANSWERED (default views) | 84 |
| ANSWERED (sweep CSV) | 23 |
| SCALAR-OK | 292 |
| NEEDS FIGURE | 211 |
| total | 678 |

### Per family

| family | cases | ANSWERED | default views | sweep CSV | SCALAR-OK | NEEDS FIGURE |
|---|---|---|---|---|---|---|
| steady/absorption | 8 | 1 | 0 | 0 | 2 | 5 |
| steady/crystallisation | 13 | 0 | 0 | 0 | 9 | 4 |
| steady/distillation | 44 | 10 | 0 | 1 | 3 | 30 |
| steady/drying | 14 | 0 | 0 | 1 | 9 | 4 |
| steady/economics | 5 | 0 | 0 | 2 | 1 | 2 |
| steady/electrodialysis | 10 | 0 | 0 | 0 | 8 | 2 |
| steady/evaporation | 11 | 0 | 0 | 4 | 6 | 1 |
| steady/flash | 41 | 4 | 0 | 2 | 31 | 4 |
| steady/flowsheets | 22 | 5 | 0 | 0 | 15 | 2 |
| steady/gas-solid | 11 | 0 | 0 | 0 | 4 | 7 |
| steady/gibbs | 15 | 0 | 0 | 1 | 14 | 0 |
| steady/heat | 18 | 2 | 0 | 0 | 11 | 5 |
| steady/hydraulics | 13 | 0 | 0 | 0 | 12 | 1 |
| steady/membranes | 28 | 0 | 0 | 1 | 19 | 8 |
| steady/optimisation | 9 | 0 | 0 | 8 | 1 | 0 |
| steady/optimisation (props fits) | 2 | 0 | 2 | 0 | 0 | 0 |
| steady/power | 5 | 0 | 0 | 0 | 0 | 5 |
| steady/reactors | 42 | 6 | 0 | 1 | 26 | 9 |
| steady/rotating | 9 | 0 | 0 | 0 | 7 | 2 |
| steady/separation | 3 | 0 | 0 | 0 | 3 | 0 |
| steady/solids | 20 | 0 | 0 | 0 | 11 | 9 |
| steady/thermo | 10 | 0 | 0 | 0 | 10 | 0 |
| steady/thermoTest | 4 | 0 | 0 | 0 | 4 | 0 |
| steady/userops | 3 | 0 | 0 | 0 | 3 | 0 |
| steady/utilities | 3 | 0 | 0 | 0 | 3 | 0 |
| batch/adsorber | 20 | 0 | 0 | 0 | 2 | 18 |
| batch/combustion | 22 | 3 | 0 | 0 | 5 | 14 |
| batch/crystallisation | 2 | 0 | 0 | 0 | 0 | 2 |
| batch/drying | 2 | 0 | 0 | 0 | 0 | 2 |
| batch/electrodialysis | 3 | 0 | 0 | 0 | 0 | 3 |
| batch/membrane | 3 | 0 | 0 | 0 | 0 | 3 |
| batch/plant | 4 | 0 | 0 | 0 | 3 | 1 |
| batch/reactor | 18 | 0 | 0 | 0 | 3 | 15 |
| batch/recipes | 4 | 0 | 0 | 0 | 1 | 3 |
| batch/still | 6 | 0 | 0 | 0 | 1 | 5 |
| ctrl | 21 | 19 | 0 | 2 | 0 | 0 |
| unsteady | 8 | 8 | 0 | 0 | 0 | 0 |
| plant | 15 | 2 | 0 | 0 | 6 | 7 |
| props/adsorption | 3 | 0 | 2 | 0 | 1 | 0 |
| props/compare | 21 | 1 | 16 | 0 | 3 | 1 |
| props/curation | 14 | 1 | 13 | 0 | 0 | 0 |
| props/electrolyte | 40 | 0 | 12 | 0 | 14 | 14 |
| props/estimate | 8 | 1 | 0 | 0 | 5 | 2 |
| props/fit | 2 | 0 | 1 | 0 | 0 | 1 |
| props/gibbs | 10 | 0 | 7 | 0 | 1 | 2 |
| props/heat | 7 | 0 | 3 | 0 | 3 | 1 |
| props/hydraulics | 3 | 0 | 0 | 0 | 1 | 2 |
| props/kinetics | 2 | 1 | 0 | 0 | 0 | 1 |
| props/membrane | 6 | 3 | 2 | 0 | 1 | 0 |
| props/molecular | 28 | 0 | 14 | 0 | 12 | 2 |
| props/powder | 2 | 0 | 2 | 0 | 0 | 0 |
| props/reactor | 2 | 0 | 0 | 0 | 0 | 2 |
| props/reconciliation | 1 | 0 | 0 | 0 | 1 | 0 |
| props/safety | 2 | 0 | 0 | 0 | 2 | 0 |
| props/scan | 8 | 0 | 3 | 0 | 0 | 5 |
| props/solvents | 3 | 0 | 0 | 0 | 3 | 0 |
| props/steam | 3 | 1 | 2 | 0 | 0 | 0 |
| props/thermo | 9 | 0 | 1 | 0 | 4 | 4 |
| props/thermoTest | 3 | 0 | 1 | 0 | 2 | 0 |
| props/transport | 10 | 0 | 3 | 0 | 6 | 1 |

## The 15 cases where a figure would teach most

Ranked by how much of the lesson is lost without it, then by how cheap it is to declare.

| # | case | the figure and why |
|---|---|---|
| 1 | `batch13_breakthrough_co2` (batch/adsorber/batch13_breakthrough_co2) | the breakthrough curve IS fixed-bed adsorption; y_out per component is already a published extra, so it is declarable today |
| 2 | `ignition01_h2o2` (batch/combustion/ignition01_h2o2) | the temperature and radical history with the ignition delay marked on a log time axis: the first picture of chemical kinetics (grammar has markers and `writeSpacing log`) |
| 3 | `sprayDryer04_profiles` (steady/drying/sprayDryer04_profiles) | the case is named for axial profiles of moisture, size and temperature and declares none; the unit already publishes a profile table |
| 4 | `batch03_consecutive` (batch/reactor/batch03_consecutive) | A -> B -> C against time, the intermediate peaking: the textbook figure, nothing declared |
| 5 | `still01_benzene_toluene` (batch/still/still01_benzene_toluene) | the Rayleigh curve (residue and distillate composition against the fraction distilled): the figure the equation is drawn for |
| 6 | `dryer01_sucrose_tray` (batch/drying/dryer01_sucrose_tray) | X(t) and the rate against X: the constant-rate and falling-rate periods; X_kg_kg and R_kg_m2_s are already published extras |
| 7 | `cstr08_furusawa_bistable` (steady/reactors/cstr08_furusawa_bistable) | heat generation against heat removal against T, three crossings: multiplicity is unreadable from a table |
| 8 | `thiele01_sphere_first_order` (props/reactor/thiele01_sphere_first_order) | the concentration profile in the pellet and eta against the Thiele modulus: the lesson of the case (blocked by G5, thielePellet publishes no table) |
| 9 | `batch26_cooling_failure` (batch/reactor/batch26_cooling_failure) | T against time after the cooling fails, with the boiling point and the MTSR as lines: a safety lesson that is a curve |
| 10 | `absorber01_NH3_water` (steady/absorption/absorber01_NH3_water) | NH3 in gas and liquid by stage against the equilibrium line: the stage profile of the first absorber a student runs (Absorber publishes a profile) |
| 11 | `pfr03_series_selectivity` (steady/reactors/pfr03_series_selectivity) | A, B, C along the tube beside cstr03: why plug flow gives more intermediate is a picture |
| 12 | `bjerrum01_carbonate_pH` (props/electrolyte/bjerrum01_carbonate_pH) | species fractions against pH: the Bjerrum plot is the case name (blocked by G5) |
| 13 | `rankine02_water` (steady/power/rankine02_water) | the T-s diagram of the cycle: the figure every thermodynamics course draws (blocked by G4, stream h and s are not publications) |
| 14 | `membrane01_RO_NaCl_seawater` (steady/membranes/membrane01_RO_NaCl_seawater) | flux, concentration and osmotic pressure along the element: why the permeate flux falls toward the brine end (SpiralWoundModule publishes a profile) |
| 15 | `moody01_friction_correlations` (props/hydraulics/moody01_friction_correlations) | friction factor against Re, the Moody chart, with each correlation against its anchor (blocked by G5) |

## Grammar and publication gaps (where a figure cannot be declared yet)

Evidence is the file and line read in this worktree.

- **G1: `views` beside an `outerDict` is refused by name.**  `src/applications/choupoSolve/main.cpp:829-835` (steady), `src/dynamicDriver/DynamicDriver.cpp:641-656` (ctrl and semi-continuous), stated in `docs/design/a-post-processing-dictionary.md` (C487 section).  Cases affected: 45 under an `outerDict`, none with views; the families are distillation 16, optimisation 9, evaporation 4, flash 3, reactors 2, economics 2, and one each of drying, gibbs, hydraulics, membranes, power, rotating, ctrl16, ctrl20, ammoniaPEQ03.  These are exactly the cases whose question IS a curve (HETP and tray efficiency against F-factor with the paper's measured points, pump against system curve, IRR against volume), so the gap costs most where the figure matters most.  A sweep is "a further producer" in the design record (section 7) and not yet built.
- **G2: five view types only.**  `src/postProcessing/views/Views.cpp:700-706` accepts `series, profile, parity, residuals, table`.  No ternary triangle (marcilla01/02, ternary01-03 of props/scan, flash/LLE cases), no contour or map (scan2d01), no bar chart or categorical axis (the ranked sensitivities of ignition04 and methane07), no Gantt (donepezil02).
- **G3: a unit publishes ONE table.**  `src/unitOperations/UnitOperation.H:158` has a single `profile()`; `publishedTables()` exists only on property operations (`src/propertyOps/PropertyOperation.H:146`), as the design record names (a spiral-wound march and a pore at each station need two tables).  Affects the DSPM-DE pore (membrane20), pump and compressor curves, the exchanger T-Q diagram.
- **G4: a stream publishes T, P, F, vf, F_mass and composition only.**  `src/postProcessing/views/RunPublications.cpp:144-159`.  No enthalpy, entropy (T-s of a cycle: rankine, brayton, combined), and no size distribution (the solids family).
- **G5: only 14 of the ~57 property operations publish tables** (`grep publishedTables src/propertyOps/*.H`: CompactionFit, FitParameters, GibbsMapOp, PhaseEnvelope, PitzerActivity, PolarisationIndex, PoreTransportBench, PropertyScan1D, PropertyScanBinary, PsychrometricChart, PurePhaseDiagram, ScalingScan, SteamTables, VaporPressureFit).  A case built on `speciate` (26), `propertyPoint` (34), `thielePellet`, `frictionBench`, `heatTransferBench`, `reactionGibbs`, `kinetics1D`, `electrolyteFit`, `enthalpyConcentration`, `phaseSplitScan`, `propertyScan2D` and `propertyScanTernary` can draw scalar diagnostics only.
- **G6: no convergence history and no economics producer.**  `src/postProcessing/views/RunPublications.H` lists unit KPIs, a unit profile and stream properties as the only producers; the tear iterations of cavett01 and recycle02, and the cash-flow years of the economics and green-ammonia cases, are not among them.
- **G7: the batch producer is the vessel only.**  `src/postProcessing/views/BatchPublications.H` carries T, n per component and the vessel's extras; the axial profile inside `FixedBedAdsorber` (batch16, batch29) is not published, though the outlet curves (`y_out_<c>`, `c_out_<c>`, T) are, via `trajectoryExtras` (`src/unitOperations/batch/FixedBedAdsorber.cpp`).

## Case tables by family

Question = `controlDict` `description`, shortened to 110 characters.  "Declared" lists the view names.

### steady/absorption (8 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `absorber01_NH3_water` | NH3 absorption from air into water (Kremser, 6 stages) | n | NEEDS FIGURE: profile: NH3 in gas and liquid by stage against the equilibrium line (Kremser's six stages) |
| `absorption01_CO2_water` | Single-stage CO2 absorption in water (Henry's law) | n | SCALAR-OK: single stage, Henry's law: the answer is one solubility number |
| `acetone05_luyben_absorber` | Luyben's acetone absorber: 9 stages, water washing acetone out of the hydrogen offgas -- against his own ac... | n | NEEDS FIGURE: profile: acetone in gas and liquid by stage, nine stages, with Luyben's two end values as markers |
| `extract01_ethanol_water_benzene` | Counter-current LL extraction: recover ethanol from water with benzene | n | NEEDS FIGURE: profile: ethanol in raffinate and extract by stage |
| `extract02_declared_interior` | An extraction cascade that starts from the interior declared in 0/ | ethanol_by_stage | ANSWERED |
| `extract03_acetic_acid_mibk_perry` | Counter-current LL extraction of acetic acid from water with MIBK (Perry Example 15-1 problem) | n | NEEDS FIGURE: profile: acetic acid in raffinate and extract by stage against Perry Example 15-1 |
| `extraction01_waterButanol` | Water/n-butanol LL flash at 298 K (experimental) | n | SCALAR-OK: one LL flash at 298 K: two compositions |
| `stripper01_NH3_water` | NH3 stripping from water with air (Kremser, 6 stages, warm) | n | NEEDS FIGURE: profile: NH3 in liquid and gas by stage (warm six-stage stripping) |

### steady/crystallisation (13 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `crystalliser01_sugar` | Cooling crystalliser: sugar solution 80 -> 20 C, yield by solubility | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser02_msmpr` | MSMPR sugar crystalliser: population balance by method of moments | n | NEEDS FIGURE: profile: population density n(L) against size (moments method: its reconstruction) |
| `crystalliser03_pbe_size_independent` | Crystalliser FVM-PBE: sanity vs MSMPR (size-independent growth) | n | NEEDS FIGURE: profile: n(L) of the FVM-PBE against the MSMPR exponential |
| `crystalliser04_size_dependent_growth` | Crystalliser FVM-PBE with size-dependent growth (sizeFactor > 0) | n | NEEDS FIGURE: profile: n(L) with size-dependent growth against the size-independent one |
| `crystalliser05_nacl_pitzer` | NaCl crystalliser: saturation from the PITZER ion activity (Ksp = (gamma_pm*m_sat)^2). Feed is a SUPERSATUR... | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser06_nacl_antisolvent` | Antisolvent (drowning-out) crystallisation of NaCl: a SATURATED aqueous brine is mixed with ethanol; the eN... | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser07_nacl_antisolvent_cooled` | Antisolvent + COOLING crystallisation of NaCl: the same drowning-out brine + ethanol as crystalliser06, but... | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser08_nacl_antisolvent_msmpr` | Continuous MSMPR antisolvent crystallisation of NaCl: a saturated brine + ethanol fed to a well-mixed vesse... | n | NEEDS FIGURE: profile: n(L) of the antisolvent MSMPR |
| `crystalliser09_KHT_KCl_series` | Two crystallisers in series separating KCl from potassium bitartrate (KHT, cream of tartar) by manipulating... | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser10_naoh_antisolvent` | NaOH antisolvent crystallisation (water + ethanol, eNRTL drowning-out) -- the acceptance-case core | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser11_kcl_antisolvent_ethanol` | Antisolvent (drowning-out) crystallisation of KCl: a SATURATED aqueous KCl brine (4.76 mol/kg) is mixed wit... | n | SCALAR-OK: one yield and one outlet state: a table |
| `crystalliser12_nacl_pitzer_antisolvent` | Pitzer + antisolvent: the calorimetric L_phi fit is AQUEOUS, so a mixed solvent drops it -- and the duty ba... | n | SCALAR-OK: one yield and one outlet state: a table |
| `overlay02_nacl_calorimetric` | NaCl crystalliser: saturation from the PITZER ion activity (Ksp = (gamma_pm*m_sat)^2). Feed is a SUPERSATUR... | n | SCALAR-OK: one yield and one outlet state: a table |

### steady/distillation (44 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `acetone06_luyben_column_C1` | Luyben's acetone column C1 on predictive UNIFAC: the test of a prediction written before the column was built | n | NEEDS FIGURE: profile: composition by stage against Luyben's prediction |
| `acetone07_luyben_column_C2` | Luyben's water column C2: the IPA recycle meets the azeotrope acetone01 measured | n | NEEDS FIGURE: profile: acetone/IPA/water by stage showing the azeotrope pinch |
| `c3splitter01_propylene_propane` | C3 splitter (propylene / propane), ILLUSTRATIVE specification: the stages and reflux the engine's SRK relat... | n | NEEDS FIGURE: profile: propylene fraction by stage (the 100-stage lesson is how flat the middle is) |
| `c3splitter02_propylene_propane_pr_kij` | C3 splitter (propylene / propane), ILLUSTRATIVE specification, Peng-Robinson with the propene-propane kij f... | n | NEEDS FIGURE: profile: as c3splitter01, with the fitted kij |
| `column01_benzene_toluene` | Benzene/toluene distillation column (Wang-Henke) | composition_by_stage | ANSWERED |
| `column02_simultaneous` | Rigorous distillation by simultaneous MESH Newton (benzene/toluene; validates against column01) | n | SCALAR-OK: a numerical agreement with column01 (same column, other solver): the answer is the Newton residual and the duty difference |
| `column03_azeotrope_mesh` | Azeotropic distillation (ethanol/water, NRTL) by the rigorous simultaneous MESH method | composition_by_stage | ANSWERED |
| `column04_multifeed_sidedraw` | Simultaneous MESH column: two feeds + a liquid side draw (rigorous MESH) | n | NEEDS FIGURE: profile: the three compositions by stage with the two feed stages and the side-draw stage marked |
| `column05_reactive_methylacetate` | Reactive distillation: methyl acetate synthesis (validation vs Pöpken et al. 2001, run S-1) | n | NEEDS FIGURE: profile: T and composition by stage against the measured run S-1 endpoints (constant/experimental) |
| `column06_fullMESH` | Full-MESH (Naphtali-Sandholm) distillation -- energy-consistent V_j/L_j, seeded from the CMO solution (benz... | n | NEEDS FIGURE: profile: V_j and L_j by stage, CMO against full MESH (the energy-consistent flows are the lesson) |
| `column07_naphtaliSandholm` | Full-MESH (Naphtali-Sandholm) validation vs AIChE J. 17 (1971) 148, Problem 2: nC4/iC5/nC5 | n | NEEDS FIGURE: parity: T and x by stage against AIChE J. 17 Problem 2 |
| `column08_radfrac_multidraw` | rigorous column: multi-feed + multi-side-draw distillation (C3/C4/C5/C6), full-MESH | n | NEEDS FIGURE: profile: composition by stage with the feeds and draws marked |
| `column09_tray_hydraulics` | Sieve-tray hydraulics: the column that separates, sized so its trays do not flood | n | NEEDS FIGURE: profile: percent of flood and weeping margin by tray |
| `column10_flooding` | The same column, built too narrow: every tray floods -- and it still converges | n | NEEDS FIGURE: profile: percent of flood by tray, every tray above 100 % |
| `column11_murphree` | Murphree tray efficiency: 14 REAL trays plus the reboiler (nStages 15, reboiler counted), not ideal stages... | n | NEEDS FIGURE: profile: liquid composition by tray, real trays against ideal stages |
| `column12_stage_is_a_flash` | An equilibrium stage IS a flash: a tray's own two products, recombined and re-flashed, must come back as th... | n | SCALAR-OK: an identity (a tray equals a flash): the answer is a residual near zero |
| `column13_sour_water_stage_identity` | The stage identity under CHEMISTRY: a sour-water tray's own two products, recombined and re-flashed, must c... | temperature_by_stage | ANSWERED |
| `column14_klemola_c4_splitter` | Klemola-Ilme industrial C4 splitter: 74 real trays at the measured E_MV = 1.191, products anchored on the p... | parity_products,table_measured_vs_choupo,table_minor_keys_kgph,profile_temperature,profile_composition | ANSWERED |
| `column15_klemola_ideal_trays` | The Klemola-Ilme C4 splitter with IDEAL trays: the same column at E_MV = 1, the control arm that says what... | n | NEEDS FIGURE: profile: the same composition and T profiles as column14 at E_MV = 1, the control arm that needs to sit beside column14's |
| `column16_declared_interior` | A column that starts from the interior declared in 0/ | composition_by_stage | ANSWERED |
| `column17_exchanger_design` | The column's condenser and reboiler designed: Nusselt film condensation and Rohsenow boiling under the crit... | n | SCALAR-OK: a designed condenser and reboiler: areas and fluxes, a datasheet |
| `column18_partial_condenser` | Benzene/toluene column with a PARTIAL condenser (Wang-Henke) | composition_by_stage | ANSWERED |
| `column19_mtbe_reactive_mesh` | MTBE reactive column: a mole-changing reaction in the rigorous (full MESH) column; compared with the refere... | referenceSimulator | ANSWERED |
| `column20_mtbe_kinetic_mesh` | MTBE reactive column with a RATE-LIMITED reaction (Rehfinger & Hoffmann law) in the rigorous (full MESH) co... | n | NEEDS FIGURE: profile: composition and reaction rate by stage (where the rate-limited conversion happens) |
| `packing01_schulz_0p10bar` | Structured packing at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.10 bar top pressure (FRI, Schul... | n | NEEDS FIGURE: HETP against F-factor with the measured points of Schulz Fig. 2 (sweep CSV exists; views refused beside outerDict, G1) |
| `packing02_schulz_0p02bar` | Structured packing at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.02 bar top pressure (FRI, Schul... | n | NEEDS FIGURE: HETP against F-factor with measured points (G1) |
| `packing03_schulz_delft_0p10bar` | Structured packing at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.10 bar top pressure (FRI, Schul... | n | NEEDS FIGURE: HETP against F-factor with measured points (G1) |
| `packing04_schulz_delft_0p02bar` | Structured packing at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.02 bar top pressure (FRI, Schul... | n | NEEDS FIGURE: HETP against F-factor with measured points (G1) |
| `packing05_schulz_record_0p10bar` | The packing as a RECORD: packing01's bed with its geometry read from a packing record (nominal), the instal... | n | ANSWERED (sweep CSV): the same HETP sweep as packing01 with the geometry from a record: its answer is that it equals packing01, the CSV shows it |
| `ratebased01_schulz_0p10bar` | Rate-based (non-equilibrium) packed segments at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.10 ba... | n | NEEDS FIGURE: HETP against F-factor, rate-based beside equilibrium, with measured points (G1) |
| `ratebased02_schulz_0p02bar` | Rate-based (non-equilibrium) packed segments at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.02 ba... | n | NEEDS FIGURE: as ratebased01 at 0.02 bar (G1) |
| `ratebased03_schulz_delft_0p10bar` | Rate-based (non-equilibrium) packed segments at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.10 ba... | n | NEEDS FIGURE: as ratebased01 (G1) |
| `ratebased04_schulz_delft_0p02bar` | Rate-based (non-equilibrium) packed segments at total reflux: Montz-Pak A3-500M with p-/o-xylene at 0.02 ba... | n | NEEDS FIGURE: as ratebased01 (G1) |
| `shortcut01_benzene_toluene` | Shortcut (FUG) design of a benzene/toluene column | shortcut_design | ANSWERED |
| `stripper01_sour_water` | S2: a sour-water stripper over the chemistry -- eight reactive trays, the CO2-strips-first mechanism measur... | composition_by_stage | ANSWERED |
| `stripper02_sour_water_h2s` | The three-family sour water: CO2 strips overhead while H2S concentrates downward and the pH FALLS -- the se... | composition_by_stage | ANSWERED |
| `totalReflux01_c6c7_yanagiRun628` | Total reflux: a 10-tray cyclohexane/n-heptane column at 34 kPa on the conditions of FRI run 628 (Yanagi & S... | n | NEEDS FIGURE: parity: composition by tray against the measured FRI run 628 |
| `trayEfficiency01_yanagi14` | Sieve-tray efficiency computed from the internals (AIChE + eddy diffusion + entrainment), FRI 14 % hole-are... | n | NEEDS FIGURE: overall tray efficiency against F-factor with the measured Yanagi & Sakata points (G1) |
| `trayEfficiency02_yanagi08` | Sieve-tray efficiency computed from the internals (AIChE + eddy diffusion + entrainment), FRI 8 % hole-area... | n | NEEDS FIGURE: as trayEfficiency01 (G1) |
| `trayEfficiency03_yanagi14_165kPa` | Sieve-tray efficiency computed from the internals (AIChE + eddy diffusion + entrainment), FRI 14 % hole-are... | n | NEEDS FIGURE: as trayEfficiency01 (G1) |
| `trayEfficiency04_yanagi08_165kPa` | Sieve-tray efficiency computed from the internals (AIChE + eddy diffusion + entrainment), FRI 8 % hole-area... | n | NEEDS FIGURE: as trayEfficiency01 (G1) |
| `trayEfficiency05_chanFair_yanagi14` | Sieve-tray efficiency computed from the internals (ChanFair + eddy diffusion + entrainment), FRI 14 % hole-... | n | NEEDS FIGURE: as trayEfficiency01 for the ChanFair method (G1) |
| `trayEfficiency06_syedaChuang_yanagi14` | Sieve-tray efficiency computed from the internals (SyedaChuang + eddy diffusion + entrainment), FRI 14 % ho... | n | NEEDS FIGURE: as trayEfficiency01 for SyedaChuang (G1) |
| `trayEfficiency07_syedaChuang_yanagi08` | Sieve-tray efficiency computed from the internals (SyedaChuang + eddy diffusion + entrainment), FRI 8 % hol... | n | NEEDS FIGURE: as trayEfficiency01 for SyedaChuang (G1) |

### steady/drying (14 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `convDryer01_sugar_curve` | Continuous convective drying of sugar on its characteristic drying curve: the same feed through a co-curren... | n | NEEDS FIGURE: profile: solid moisture and gas T along the dryer |
| `convDryer02_sugar_countercurrent` | Continuous convective drying of sugar on its characteristic drying curve: the countercurrent arrangement, t... | n | NEEDS FIGURE: profile: solid X and gas T along the dryer, counter-current |
| `convDryer03_sugar_crossflow` | Continuous convective drying of sugar on its characteristic drying curve: the crossflow arrangement, the sa... | n | NEEDS FIGURE: profile: solid X and gas T along the dryer, crossflow |
| `evapDryer01_nacl` | Evaporative dryer: free surface water on NaCl crystals evaporated into dry nitrogen, adiabatic, the binding... | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `evapDryer02_energy_limited` | The same dryer starved of gas: 40 kmol/h instead of 600, so the gas runs out of heat at its wet bulb and 16... | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `solidDryer01_sugar` | Solid dryer: wet sugar powder dried to sorption equilibrium | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `solidDryer02_starved_air` | Solid dryer starved of air: the exhaust saturates before the sugar reaches its isotherm | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `sprayDryer01_sugar` | Spray dryer: 40 wt% sugar solution -> powder (rotary atomiser, Ranz-Marshall) | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `sprayDryer02_residence_sweep` | Spray dryer: chamber-height sweep -> the drying curve (residence = L/v; constant + falling rate -> equilibr... | n | ANSWERED (sweep CSV): drying curve from the chamber-height sweep CSV (G1) |
| `sprayDryer03_pressure_nozzle` | Spray dryer: 40 wt% sugar solution -> powder (PRESSURE-SWIRL nozzle at 40 bar, d32=9575*dP^-1/3; Ranz-Marsh... | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `sprayDryer04_profiles` | Spray dryer DISTRIBUTED: axial profiles of moisture, size and temperature along the chamber | n | NEEDS FIGURE: profile: moisture, drop size and T along the chamber (the case is about the axial profiles and declares none) |
| `sprayDryer05_whey` | Spray dryer: whey (prob 5.2) -- 500 kg/h, X0=5, rotary co-current, sorption-isotherm residual moisture | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `sprayDryer06_rea` | Spray dryer REA (model chen): Reaction Engineering Approach kinetics -- smooth rate, no critical-moisture b... | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |
| `sprayDryer07_design` | Spray dryer DESIGN: give targets (powder size, residence), the sizing pass inverts to the geometry | n | SCALAR-OK: one dried-product state (moisture, T, size): a table |

### steady/economics (5 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `economics01_esterification_dcf` | Esterification plant: CAPEX (Turton) -> OPEX (COM_d) -> discounted-cash-flow appraisal (NPV/IRR/payback) | n | NEEDS FIGURE: cumulative discounted cash flow against year (no economics producer, G6) |
| `economics02_irr_sweep` | Sweep reactor volume; read economics.IRR/NPV/payback per point (SweepDriver runs the post chain) | n | ANSWERED (sweep CSV): IRR/NPV against reactor volume from the sweep CSV (G1) |
| `economics03_startup_years` | The start-up years of a discounted cash flow (DEV.md 4c C63): ammonia02_full_plant's plant and costing, app... | n | NEEDS FIGURE: cash flow by year with the start-up ramp (G6) |
| `economics04_building_royalty_breakeven` | Economic extensions: a building priced by room grade, the two break-evens, a royalty with a patent window,... | n | SCALAR-OK: an appraisal table (CAPEX, OPEX, NPV) |
| `sugarPlantEconomicsSweep` | Sugar plant ECONOMICS SWEEP -- IRR / payback / NPV vs RawJuice sucrose content (Phase-2 SweepDriver post-ch... | n | ANSWERED (sweep CSV): IRR/payback against sucrose content from the sweep CSV (G1) |

### steady/electrodialysis (10 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `ed01_nacl_desalination` | Electrodialysis stack: NaCl diluate desalination, 100 cell pairs | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed02_over_limiting_current` | Electrodialysis stack driven ABOVE its limiting current (loud warning) | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed03_stack_record` | Electrodialysis: the stack named as a record, the crossflow velocity derived | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed04_limiting_current_multiionic` | Limiting current density, MgCl2 + MgSO4: engine against Geraldes & Afonso (2010) Table 4 | n | NEEDS FIGURE: parity: limiting current density, engine against Geraldes & Afonso Table 4 |
| `ed05_industrial_stack` | Electrodialysis: a 100-cell-pair, 50 m2 industrial stack, two hydraulic passes | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed06_stages_in_series` | Four electrodialysis stages in series: the limiting current falls 15.6x along the train, so each stage is g... | n | NEEDS FIGURE: limiting current against stage number (the 15.6x fall) |
| `ed07_feed_and_bleed` | Feed-and-bleed electrodialysis: the stack never sees the feed, and its limiting current is set by the LOOP... | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed08_wine_kht_model_solution` | Electrodialysis for wine tartrate stabilisation, reduced to a potassium hydrogen tartrate model solution: 2... | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed09_wine_multiionic` | Electrodialysis for wine tartrate stabilisation on a thirteen-ion wine: 20 % of the conductivity removed on... | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |
| `ed10_passthrough_benzene` | Electrodialysis stack: NaCl desalination with benzene DECLARED to pass through | n | SCALAR-OK: one stack operating point (current, limiting current, desalination): a table |

### steady/evaporation (11 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `evaporator01_brine` | Single-effect evaporator: 35 g/L brine at 1 bar; the fixed steam duty/UA evaporates ~82 % of the feed water... | n | SCALAR-OK: one steam duty, concentration and boiling-point elevation: a table |
| `evaporator02_triple_effect_sugar` | Triple-effect cocurrent evaporator: 22500 kg/h sugar solution 5%->25% (textbook Example 10.4) | n | NEEDS FIGURE: T and evaporation per effect, textbook Example 10.4 |
| `evaporator03_co_current` | Co-current forward-feed triple-effect evaporator, user-defined components (textbook problem 10.38, case a) | n | ANSWERED (sweep CSV): per-effect results from the sweep CSV (G1) |
| `evaporator04_orange_juice_simple` | Single-effect evaporator concentrating orange juice 10% to 50% solids (textbook Example 10.2 a-c, without BPE) | n | ANSWERED (sweep CSV): steam economy against concentration from the sweep CSV (G1) |
| `evaporator05_counter_current` | Counter-current backward-feed triple-effect evaporator (textbook problem 10.38 variant) | n | ANSWERED (sweep CSV): the counter-current variant, sweep CSV (G1) |
| `evaporator06_nacl_pitzer` | Single-effect NaCl evaporator with the boiling-point elevation from the PITZER electrolyte model (a_w), not... | n | SCALAR-OK: one steam duty, concentration and boiling-point elevation: a table |
| `evaporator07_nacl_enrtl` | Single-effect NaCl evaporator with the boiling-point elevation from the eNRTL water activity (electrolyte-N... | n | SCALAR-OK: one steam duty, concentration and boiling-point elevation: a table |
| `evaporator08_naoh_dilution_heat` | Single-effect NaOH evaporator: the heat of dilution IN the duty (fitted L_phi, Parker-validated) | n | SCALAR-OK: one steam duty, concentration and boiling-point elevation: a table |
| `evaporator09_nacl_sucrose_brine` | Evaporating a brine that also carries sugar: the electrolyte BPE is computed on the salt molality, and the... | n | SCALAR-OK: one steam duty, concentration and boiling-point elevation: a table |
| `evaporator10_naoh_triple_effect` | Triple-effect forward-feed NaOH evaporator: the heat of dilution in each effect, inside the fitted window (... | n | ANSWERED (sweep CSV): per-effect heat of dilution, sweep CSV (G1) |
| `evaporator11_naoh_olsson_50wt` | Single-effect caustic evaporator, 20 -> 50 wt % NaOH, on the high-concentration OlssonNaOH model (Geankopli... | n | SCALAR-OK: one steam duty, concentration and boiling-point elevation: a table |

### steady/flash (41 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `adiabaticFlash01_benzene_toluene` | Adiabatic flash, benzene/toluene 40/60, 380K/3bar -> 1atm | T_against_benzene,streams_before_after | ANSWERED |
| `analysis01_water_analysis_inlet` | A laboratory water analysis as a first-class inlet: mg/L with alkalinity as CaCO3, a measured density, and... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `analysis02_weighted_least_squares` | The same laboratory water as analysis01, reconciled by constrained weighted least squares over four measure... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `bubbleT01_ethanol_water` | Bubble-T of 30/70 ethanol/water at 1 atm (NRTL) | liquid_and_first_vapour | ANSWERED |
| `bubbleT02_uniquac_ethanol_water` | Bubble-T of 30/70 ethanol/water at 1 atm (UNIQUAC) -- validates the UNIQUAC model against the NRTL/Wilson t... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `dewT01_ethanol_water` | Dew-T of 30/70 ethanol/water vapour at 1 atm (NRTL) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash01_benzene_toluene` | Isothermal flash benzene/toluene at 370 K, 1 bar (Raoult) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash02_ethanol_water` | Isothermal flash 50/50 ethanol/water at 355 K (NRTL) | lever_rule,streams | ANSWERED |
| `flash03_wilson_ethanol_water` | Isothermal flash 50/50 ethanol/water at 355 K (Wilson activity model) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash04_molarFlows_input` | Isothermal flash, feed declared via molarFlows (benzene 40 + toluene 60 kmol/h) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash05_ternary_massFlows` | Ternary flash benzene/toluene/n-hexane, feed in mass flows (5000 kg/h) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash06_sweep_T` | Flash benzene/toluene at 1 bar: T swept 360->385 K across the bubble->dew window (V/F S-curve + duty) | n | ANSWERED (sweep CSV): V/F S-curve and duty against T from the sweep CSV (GUI default); a declared view is refused beside an outerDict (G1) |
| `flash07_gridsweep_TP` | 2-D grid sweep: flash V/F over T x P (the flash envelope) | n | NEEDS FIGURE: V/F against T, one line per P (the flash envelope); sweep CSV exists, `views` refused beside an outerDict (G1) |
| `flash08_co2_water_package` | Carbonated water flash whose thermo is an INLINE property-package MANIFEST: constant/thermoPhysPropDict IS... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash09_n2ch4_stryjek` | phi-phi VLE VALIDATION vs Stryjek, Chappelear & Kobayashi (1974), J. Chem. Eng. Data 19:334 (DOI 10.1021/je... | n | NEEDS FIGURE: parity: engine y_N2 against measured y_N2 (Table III) per x_N2 -- a VLE validation is read as points on a line |
| `flash09_nh3_water_reactive` | Reactive NH3/water flash: SIMULTANEOUS aqueous speciation (NH4+/H+/OH-, pH solved) + VLE at 368 K, 1 atm --... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash10_acetic_water_reactive` | Reactive acetic acid/water flash: SIMULTANEOUS aqueous speciation (Acetate-/H+/OH-, pH solved) + VLE -- the... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash10_ch4propane_pcsaft` | PC-SAFT phi-phi binary flash, CH4/propane at 273.15 K / 20 bar, kij = 0 (announced): the PREDICTIVE baselin... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash11_acetic_T_sweep` | Reactive acetic/water flash: T swept 328->368 K in the subsaturated window (p_eq climbs, dimer share falls,... | n | ANSWERED (sweep CSV): p_eq, dimer share and pH against T from the sweep CSV (G1) |
| `flash12_nh3_acetic_ethanol_reactive` | Reactive 4-component flash: NH3 + HAc neutralise into an ammonium-acetate buffer (pH ~ pKa_HAc); ethanol cl... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash13_acetic_ethanol_vacuum_flash` | Reactive VACUUM flash on mixed-solvent v1 (NRTL backbone + Davies ions): V/F = 0.58 at 358.15 K / 0.65 atm,... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash14_calcite_carbonate_basis` | Reactive calcite/carbonate flash: the FIRST component whose aqueous bridge spans TWO master families (CaCO3... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash15_refused_salt_basis_rank` | DELIBERATE REFUSAL: K/Na x Cl/SO4 -- four salt components onto four ion families with rank 3, so the compon... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash16_calcite_precipitation` | Reactive flash that PRECIPITATES: the calcite/carbonate basis of flash14 fed past saturation, with calcite... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash17_two_liquids_reactive` | Reactive flash with TWO liquids: vapour + speciated aqueous + benzene-rich organic at 313.15 K / 0.353 atm... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash18_water_analysis_basis` | A stream written in the AQUEOUS-SPECIES basis: a calcium-bicarbonate water analysis (Ca 0.0122, HCO3 0.0244... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash19_organic_and_precipitate` | FOUR phases at once: vapour + speciated aqueous + benzene-rich organic + solid calcite. flash16's feed plus... | phase_contents | ANSWERED |
| `flash20_ethanol_water_pcsaft` | Ethanol/water flash: predictive PC-SAFT (assoc, kij=0) vs fitted NRTL | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash21_brine_co2_pitzer` | NaCl brine + CO2 reactive flash under the pitzerHMW ionic rung -- seam S5(b) witness: the declared model IS... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash21_freeze_concentration` | Freeze-concentration SLE flash: ice crystallises from a water/ethanol liquor at -15 C; the liquor concentra... | n | SCALAR-OK: one SLE point (ice yield, liquor composition); the curve is the props case phaseSplit01 |
| `flash22_drum_sizing_benzene_toluene` | A benzene/toluene flash drum at 370 K, 1 bar, SIZED in detail: Souders-Brown velocity, levels, nozzles | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash23_gas_only_oh_quench` | A gas-only species in two flashes: OH stays in the vapour (DEV.md 4c C458) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash_polymer_devolatilisation` | Devolatilise a polystyrene melt: flash off residual toluene; the polymer (fixed-MW pseudo-component, role n... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `flash_pseudoComponent_petCut` | Flash of a petroleum pseudo-component (Riazi-Daubert lump) + toluene, with a heater closing the energy balance | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `leaf01_flash` | Leaf-node form: isothermal flash benzene/toluene (sectored-layout base case) | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `marcilla01_lls_tie_triangle` | LLS anchor contact vs Marcilla 1995 (Table 10A row 4 charge): brine + solid halite reproduced; the organic... | n | NEEDS FIGURE: ternary triangle with the tie line and the solid vertex (grammar gap G2: no ternary type) |
| `marcilla02_lls_ternary_invariant` | The ternary LLS invariant vs Marcilla 1995 Table 4B: aqueous brine + WET butanol-rich organic + solid halit... | n | NEEDS FIGURE: ternary triangle of the invariant point against Table 4B (G2) |
| `vlle01_waterButanol` | Liquid-liquid flash of water + 1-butanol at 320 K, 1.013 bar -- the real miscibility gap from the cited Win... | n | SCALAR-OK: two liquid compositions against the cited fit: a four-number table |
| `vlle03_audit_artificial` | Algorithm-audit synthetic VLLE: 3 components with identical Psat and exaggerated NRTL. Should converge to 3... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `vlle04_two_liquids_decanter` | Structural witness: a phaseSet VLLE flash whose search finds TWO LIQUIDS and no vapour (ethanol + cyclohexa... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |
| `vlle05_produced_feed` | Synthetic VLLE decanter fed by a heater: a produced stream keeps its producer's vapour-liquid answer (DEV.m... | n | SCALAR-OK: a stream table (split, compositions, T) is the answer at one operating point |

### steady/flowsheets (22 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `acetone03_luyben_reaction_section` | Luyben's acetone REACTION SECTION: reactor -> cooler -> flash, against his Rout and the flash split | n | SCALAR-OK: reactor, cooler, flash against Luyben's Rout: a comparison table |
| `ammonia01_synthesis_loop` | Complete ammonia synthesis loop (Haber-Bosch) with recycle and purge: makeup 1:3 N2:H2 (+ Ar inert) -> mix... | around_the_loop | ANSWERED |
| `cavett01_recycle_train` | Cavett (1963) four-flash recycle benchmark on the primary Rosen-Pauls spec: 2 tears, Newton 7 it (Wegstein... | n | NEEDS FIGURE: tear residual against iteration, Newton against Wegstein (no producer publishes a convergence history, G6) |
| `composite01_two_flashes` | Composite node: two flashes in series (sectored-layout step 2) | benzene_through_the_flashes,streams | ANSWERED |
| `credo01_valve_heater_drum` | Info-follows-streams credo: heater (Q) + valve (P) set the state; the flash drum (no knobs) just separates | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `esterification2sector` | Esterification plant -- two sectors (REACTION + SEPARATION) sharing components; per-sector constant/ data (... | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `inletState01_undeclared_vapour` | Witness: undeclared superheated vapours are read as vapours by the valve, the mixer and the splitter | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `plant01_two_sectors` | Recursive plant: factory of two composite sectors (sectored-layout step 3) | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `plant02_basename_twins` | basename twins: a top-level `feed` and a DISTINCT sector-internal `A.feed` coexist | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `process01_reactor_flash` | Two-unit flowsheet: CSTR -> isothermal flash | along_the_flowsheet | ANSWERED |
| `process02_reactor_hx_flash` | Three-unit flowsheet: CSTR -> heater -> flash | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `process02_with_design` | process02 with full reports: balances + sizing + Turton costing | along_the_flowsheet | ANSWERED |
| `process03_recycle` | Recycle loop: the tear stream is solved by Newton (2 iterations, /r/2 3.9e-6) | loop_flows | ANSWERED |
| `process04_research_workflow` | Case-local binary pair file (research workflow pattern) | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `process05_isomerization_recycle` | Isomerization neoPentane->nPentane: mixer + CSTR + distillation with recycle | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `proxy01_gas_loop` | Proxy step 1: gas WGS loop with one recycle (mixer + Gibbs reactor + splitter) | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `recycle02_dominant_eigenvalue` | Isomerization recycle closed by the dominant-eigenvalue extrapolation (Orbach-Crowe) -- iterations vs Newto... | n | NEEDS FIGURE: iterations to converge, three accelerators (G6) |
| `recycle_autoinit_tear` | Recycle with NO authored tear guess -- the solver auto-seeds the tear from the feed aggregate (announced),... | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `table05_sector_table_pins` | A sector's table pin reads the sector's own file: two sectors pin water's liquid viscosity to a table of th... | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `twoSectorDemo` | Two-sector demo plant -- self-contained: 10 components, 10 NRTL pairs, 5 reactions, and TWO custom compiled... | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `SECTOR_R` | SECTOR_R -- the reactor sector. Runs its OWN compiled unit op (stoichReactor) on the plant-level thermo (ca... | n | SCALAR-OK: structural or closure witness: a stream table and the balances |
| `SECTOR_S` | SECTOR_S -- the separation sector. Runs its OWN compiled unit op (sharpSplitColumn) on the plant-level ther... | n | SCALAR-OK: structural or closure witness: a stream table and the balances |

### steady/gas-solid (11 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `bagFilter01_dust` | Bag filter (baghouse) on a dusty gas: >99% capture + cake pressure drop | n | SCALAR-OK: one capture efficiency and one pressure drop: a table |
| `cyclone01_dust_removal` | Cyclone dust removal: silica from N2 (Lapple, D_c = 0.5 m) | n | NEEDS FIGURE: grade-efficiency curve: capture against particle size |
| `cyclone02_leith_licht` | Cyclone dust removal -- Leith-Licht back-mixing model | n | NEEDS FIGURE: grade-efficiency curve, Leith-Licht |
| `cyclone03_iozia_leith` | Cyclone dust removal -- Iozia-Leith data-fitted logistic (beta) | n | NEEDS FIGURE: grade-efficiency curve, Iozia-Leith logistic |
| `cyclone04_high_loading` | Cyclone high dust loading -- Muschelknautz mass-loading effect | n | NEEDS FIGURE: grade-efficiency curve at high loading against the low-loading one |
| `cyclone05_dirgo_leith_validation` | VALIDATION vs Dirgo & Leith (1985): a Stairmand high-efficiency cyclone (D=0.305 m, 0.139 m3/s, ~15 m/s inl... | n | NEEDS FIGURE: parity: efficiency by size against the measured Dirgo & Leith curve |
| `cyclone06_barth` | WITNESS: the Barth (1956) equilibrium-orbit cyclone model on the Dirgo & Leith Stairmand geometry (same des... | n | NEEDS FIGURE: grade-efficiency curve of the Barth model on the Dirgo & Leith cyclone |
| `gasSolidSplitter01_ideal` | Ideal gas-solid splitter: specified 90% solids recovery (no efficiency physics) | n | SCALAR-OK: one capture efficiency and one pressure drop: a table |
| `gasSolidSplitter02_rosinRammler` | gas-solid split with a FITTED Rosin-Rammler feed PSD (the model is declared, the engine discretises) | n | NEEDS FIGURE: feed and captured size distributions (no size distribution is a stream publication, G4) |
| `gasSolidSplitter03_tabular_psd` | WITNESS: tabular (sieve-analysis) particle-size distribution on the gas-solid splitter; sibling of gasSolid... | n | SCALAR-OK: one capture efficiency and one pressure drop: a table |
| `gasSolidSplitter04_lognormal_psd` | WITNESS: log-normal particle-size distribution (dgm, sigmaG) on the gas-solid splitter; sibling of gasSolid... | n | SCALAR-OK: one capture efficiency and one pressure drop: a table |

### steady/gibbs (15 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `claus01_thermal_stage` | Claus thermal stage: adiabatic Gibbs reactor over C-H-N-O-S | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs01_water_gas_shift` | Gibbs reactor: water-gas shift CO + H2O <-> CO2 + H2 at 800 K | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs02_steam_reforming` | Gibbs reactor: steam reforming of methane at 1000 K | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs03_methane_combustion` | Gibbs reactor: methane combustion in stoichiometric air at 1800 K | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs04_wgs_temperature_sweep` | Water-gas shift equilibrium swept over T = 600..1200 K | n | ANSWERED (sweep CSV): CO conversion against T from the sweep CSV, with the equilibrium curve the answer (G1) |
| `gibbs05_adiabatic_flame` | Adiabatic flame of lean CH4 in air (φ = 0.5) | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs06_h2_flame_radicals` | Stoichiometric H2/air adiabatic flame -- the radical pool at equilibrium | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs06_thermal_nox` | Methane combustion at 1800 K with thermal NOx formation | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs07_wgs_cooled` | Cooled WGS Gibbs reactor (350 K): water condenses, shifting the equilibrium (multi-phase) | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs08_wgs_cooled_reactiveflash` | Cooled WGS via reactiveFlash (B1) -- cross-checks the elementPotential V+L result | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs09_wgs_cooled_directmin` | Cooled WGS via directMin (B2, Nelder-Mead direct G-min) -- cross-checks A/B1 to ~0.3% | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs10_ammonia_fugacity` | Ammonia synthesis equilibrium at 200 bar with the REAL-gas fugacity correction: N2 + 3 H2 <-> 2 NH3 at 700... | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs11_carbon_deposition` | Gibbs reactor with a pure solid phase: graphite forms at S/C 0.8, not at S/C 3 | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs12_element_potential_newton` | The element-potential Newton, logged: four Gibbs reactors -- a gas, a condensing liquid, a depositing solid... | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |
| `gibbs13_adiabatic_approach_direction` | An adiabatic ammonia synthesis bed fed a gas that already carries 16 % NH3 (the third bed of a staged conve... | n | SCALAR-OK: one equilibrium state at one T and P: a composition table (the curves are the props/gibbs landscapes) |

### steady/heat (18 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `condenser01_film_nusselt` | Horizontal-tube steam condenser: Nusselt film HTC -> duty (geometry mode) | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `coolingTower01_merkel` | Water cooling tower, Merkel enthalpy driving force -- rating: the packing is given, the cold-water T is the... | n | NEEDS FIGURE: Merkel diagram: air enthalpy operating line against the saturation-enthalpy curve |
| `heatExchanger01_water_water` | Two-stream heat exchanger (eps-NTU): hot/cold water recovery | exchanger | ANSWERED |
| `heatExchanger02_geometry_U` | Shell-and-tube heat exchanger sized from GEOMETRY: the overall U and area are COMPUTED from the tube bundle... | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `heatExchanger03_pure_water_plateau` | Pure water on its saturation plateau: a 40 bar boiler, a 100 bar partial condenser and a trim cooler | n | NEEDS FIGURE: T-Q diagram of the 40 bar boiler (the plateau); needs the exchanger's T against cumulative duty |
| `heatExchanger04_bell_delaware_rating` | Shell-and-tube RATING by the Bell-Delaware method: shell-side film and pressure drop from the declared TEMA... | n | SCALAR-OK: a rating: U, area and dP shell side, a table |
| `heatExchanger05_bell_delaware_auto` | Shell-and-tube RATING by the Bell-Delaware method: shell-side film and pressure drop from the declared TEMA... | n | SCALAR-OK: as heatExchanger04 |
| `heatlink01_condenser_to_heater` | Forward heat-link: column condenser preheats a downstream stream | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `heatlink02_condenser_feed_preheat` | Feedback heat-link (energy tear): column condenser preheats its OWN feed | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `hx01_heater` | Heater: 50/50 ethanol/water from 300 K to ~338 K (sensible) | T_in_out,heater | ANSWERED |
| `hx02_condensing_steam` | Steam condensing against cooling water on IF97: the outlet sits on its saturation plateau with the duty the... | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `hxWorkflow1_design_from_duty` | PART 1 of 2 -- DESIGN: the DUTY TARGET is given (cool the hot shell 330->315 K) and the exchanger GEOMETRY... | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `hxWorkflow2_rate_designed` | Shell-and-tube heat exchanger sized from GEOMETRY: the overall U and area are COMPUTED from the tube bundle... | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `mheatx01_two_hot_one_cold` | Multi-stream heat exchanger: 2 hot + 1 cold, balance closes | n | NEEDS FIGURE: composite curves: hot and cold T against cumulative duty |
| `phasechange01_partial_condenser` | Partial condenser: benzene/toluene vapour cooled to quality 0.4 | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `phasechange02_saturated_mixture` | Saturated liquid and vapour of a benzene-toluene mixture: bubble and dew point | n | SCALAR-OK: a duty, an outlet T or an area: a datasheet row |
| `pinch01_four_stream_classic` | Pinch P1 targets: classic 4-stream problem table (dTmin 20 K) | n | NEEDS FIGURE: composite and grand composite curves, T against H (the pinch page in the GUI may draw it; not verified) |
| `reboiler_water_copper` | Steam-heated copper-surface pool reboiler: Rohsenow nucleate flux -> duty, Zuber CHF ceiling (geometry mode) | n | NEEDS FIGURE: boiling curve: heat flux against wall superheat with the Zuber ceiling |

### steady/hydraulics (13 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `agitation01_helical_ribbon_polymer_melt` | Agitation power of a helical ribbon in a power-law polymer melt (Chhabra & Richardson Example 8.5): D_T 2.2... | n | SCALAR-OK: one pressure drop or one power: a number |
| `agitation02_yield_stress_refused` | REFUSED: agitation power of a fluid with a yield stress (unyielded regions, R9) | n | SCALAR-OK: one pressure drop or one power: a number |
| `agitation03_shear_thickening_refused` | REFUSED: agitation power of a shear-thickening fluid (n = 1.3, R9) | n | SCALAR-OK: one pressure drop or one power: a number |
| `letdown01_ammonia_flashing` | Pressure letdown: the green-ammonia separator liquid throttled 140 -> 20 -> 1 bar (flashing), and the loop... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe01_water_line` | Pipe pressure drop: 2000 kmol/h water in a 0.1 m x 50 m commercial-steel line (Churchill friction) | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe02_airwater_twophase` | Gas-liquid two-phase pressure drop: air (N2) + water in a horizontal 0.05 m x 10 m line, Lockhart-Martinell... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe03_sucrose_syrup_measured` | Pipe pressure drop of a sucrose syrup whose viscosity is the case's own measured table (24 rows over temper... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe04_powerlaw_polymer_solution` | Laminar pressure drop of a power-law polymer solution (Chhabra & Richardson Example 3.1): 25 mm, 10 m, 2500... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe05_herschelbulkley_clay_slurry` | Laminar pressure drop of a Herschel-Bulkley clay slurry (Chhabra & Richardson Example 3.3): 40 mm, 500 m, 0... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe06_turbulent_dodge_metzner` | Turbulent pressure drop of a power-law polymer solution by the declared Dodge-Metzner method (eqs. 3.70-3.7... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe07_turbulent_refused` | REFUSED: turbulent flow of a power-law polymer solution with no turbulent method declared (R9) | n | SCALAR-OK: one pressure drop or one power: a number |
| `pipe08_flowcurve_uncorrected_refused` | REFUSED: capillary readings without the Bagley end-effect correction and the slip test are not a flow curve... | n | SCALAR-OK: one pressure drop or one power: a number |
| `pumpSystem01_operating_point` | Pump vs system curve: sweep the feed flow, the operating point is the intersection | n | NEEDS FIGURE: system curve and pump curve with the intersection (sweep CSV only, G1) |

### steady/membranes (28 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `membrane01_RO_NaCl_seawater` | Spiral-wound RO of 35 g/L NaCl feed at 55 bar (canonical seawater desalination) | n | NEEDS FIGURE: profile: flux, osmotic pressure and concentration along the element |
| `membrane02_NF_sugar` | NF270 partial rejection of glucose at 10 bar (canonical NF: 10 g/L sugar feed) | n | SCALAR-OK: one rejection at one pressure |
| `membrane03_concentration_polarization` | Concentration polarization study: sweep k_film over a SW30HR seawater RO case | n | ANSWERED (sweep CSV): polarisation modulus against k_film from the sweep CSV (G1) |
| `membrane04_spacer_schock_miquel` | Seawater RO with k_film computed from spacer-channel hydraulics (Schock-Miquel Sherwood); k_film falls ~6.6... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane05_train` | Multi-element membrane train: 3 SW30HR elements in series (seawater RO) | n | NEEDS FIGURE: profile: flux and recovery along the three elements |
| `membrane06_pitzer` | Seawater RO with the Pitzer osmotic model (vs membrane01 van't Hoff) | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane07_scaling_si` | Brackish RO, 6 x 8-inch modules: per-module scaling audit (SI at wall vs bulk) | n | NEEDS FIGURE: SI at the wall and in the bulk for each of the six modules |
| `membrane08_softened_scaling` | Softener + brackish RO: ion-exchange removes the scaling driver upstream of the vessel | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane09_index_vs_rigorous` | Seawater RO at high recovery: industry calcite indices (LSI / Stiff-Davis / Ryznar) vs the rigorous activit... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane10_dspmde_divalent` | DSPM-DE NF: divalent (MgSO4) > mixed (CaCl2) > monovalent (NaCl) rejection at 10 bar | n | SCALAR-OK: three rejections ranked: a three-row table |
| `membrane11_dspmde_born_toggle` | DSPM-DE NF: Born dielectric-exclusion toggle (same NaCl feed, poreDielectric on vs off) | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane12_sdem_nf270_nacl_traces` | SDEM on NF270: dominant NaCl 0.01 M + NaNO3/NH4Cl traces -- NO3- slips through, the field says why | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane13_sdem_nf270_mgso4_traces` | SDEM on NF270: dominant MgSO4 0.01 M + NaNO3/NH4Cl traces -- both trace anions negatively rejected | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane14_polarisation_multiionic` | NF270 + SDEM on a real spacer channel: per-ion film, one interface field (Geraldes & Afonso 2007) -- Gamma... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane15_module_nf270_4040` | NF270-4040 element as a RECORD: NaCl 2 g/L at the rated 4.8 bar -- the geometry, limits and estimates come... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane16_module_sw30hr_8040` | SW30HR-380 element as a RECORD: seawater 32 g/L NaCl at the rated 55 bar -- membrane01's separation with th... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane17_sepa_cf_flat_cell` | A laboratory cell in five lines: SEPA CF flat-sheet cell + an NF270 coupon, membrane12's NaCl + traces feed... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane18_nf_feed_and_bleed` | Feed-and-bleed NF: the module never sees the feed, it sees the LOOP concentration | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane19_uf_gel_polarisation` | UF of a protein by gel polarisation: past a modest pressure the flux is set by mass transfer, not by the pump | n | NEEDS FIGURE: flux against pressure (the plateau where the gel limits); one point in the run |
| `membrane20_dspmde_pore_finite_difference` | DSPM-DE NF: the charged pore solved node by node (the default) on NaCl and MgSO4 at 10 bar, its wall closed... | n | NEEDS FIGURE: profile: ion concentration and potential across the pore (unit tables beyond one profile are not published, G3) |
| `membrane21_two_stage_nf_array` | A two-stage NF array, 4:2 vessels x 6 generic 8-inch elements, interstage booster: one unit per stage, the... | n | NEEDS FIGURE: flux and recovery by stage of the 4:2 array |
| `membrane22_two_stage_nf_array_dspmde` | membrane21 with the charged-pore membrane model: the same 4:2 array of generic 8-inch elements and booster,... | n | NEEDS FIGURE: as membrane21 with the charged-pore model, beside it |
| `membrane23_constant_rejection_nf8040` | Constant intrinsic rejection per salt (Geraldes & Afonso 2007, Eq. 1): NaCl + MgSO4 through one vessel of s... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane24_fit_then_simulate` | One case, two modes: NF270's DSPM-DE pore fitted to published intrinsic rejections (Properties mode), then... | n | NEEDS FIGURE: parity: fitted against published intrinsic rejections |
| `membrane25_rated_test_inversion_nf270_4040` | A data sheet's OBSERVED rejection inverted to the INTRINSIC one: NF270-4040 with MgSO4 fromRatedTest, besid... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane26_class_sulphate_removal` | A membrane chosen by WHAT IT DOES: sulphate removal on the illustrative functional class NF_DIVALENT_SELECT... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane27_swro_energy_recovery` | SWRO with energy recovery: high-pressure pump + rotary pressure exchanger + booster + one SW30HR-380 stage... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |
| `membrane28_water_permeance_from_sheets` | The water permeance a data sheet implies: NF270-4040 and SW30HR-380 with waterPermeance fromRatedTest, repr... | n | SCALAR-OK: one permeate flux, recovery and rejection: a table |

### steady/optimisation (9 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `designSpec01_triple_equal_areas` | DesignSpec: equal-area triple-effect sugar evaporator (manipulate $A so L3 = 4500 kg/h) | n | SCALAR-OK: one solved area (a design specification): a scalar |
| `optim01_column_reflux` | Optimise reflux ratio + feedStage of benzene/toluene column to minimise reboiler vapour V_strip | n | ANSWERED (sweep CSV): objective and constraints against iteration, optimisation_history.csv (G1) |
| `optim02_process_cost` | Minimise total module Turton cost of reactor + heater by varying reactor V_R and heater Q | n | ANSWERED (sweep CSV): history CSV (G1) |
| `optim04_membrane_recovery_scaling` | Brackish RO: maximise water recovery up to the scaling limit (SQP, scaling constraints active at the optimum) | n | ANSWERED (sweep CSV): recovery against scaling index along the SQP path (G1) |
| `optim05_reactor_npv` | Esterification CSTR sized & operated for MAX NPV by hand-rolled SQP, subject to a reactor-size cap and a ca... | n | ANSWERED (sweep CSV): NPV against reactor volume along the path (G1) |
| `optim06_integer_stages` | The classic N-vs-R trade solved in ONE run: nStages declared integer -> exhaustive enumeration, one full SQ... | n | ANSWERED (sweep CSV): cost against number of stages and reflux ratio: the enumeration table (G1) |
| `pareto01_purity_energy` | The purity-energy PARETO FRONT by epsilon-constraint: minimise V_strip subject to x_D_LK >= eps, eps swept... | n | ANSWERED (sweep CSV): Pareto front from the sweep CSV (G1) |
| `sensitivity01_column_reflux` | Sweep reflux ratio R = 1.5..5.0 (10 pts) across the column01 case; responses: x_D purity + V_strip (reboile... | n | ANSWERED (sweep CSV): x_D against reflux from the sweep CSV (G1) |
| `sensitivity02_feasibility_map` | Feasibility MAP: the reflux sweep with declared constraints -- every row marked (value, bound, residual, sa... | n | ANSWERED (sweep CSV): the constrained sweep with its feasible band (G1) |

### steady/optimisation (props fits) (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `fitNRTL01_ethanol_water` | Fit NRTL ethanol/water pair against 1 atm bubble-T data (Levenberg-Marquardt) | n | ANSWERED (default views): default views of fitParameters |
| `fitNRTL02_thermoml_isobars` | Fit the ethanol/water NRTL pair across three measured isobars, then predict a fourth held out from a differ... | n | ANSWERED (default views): default views of fitParameters |

### steady/power (5 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `brayton01_gas_turbine` | Closed Brayton (gas-turbine) cycle: compress air -> combust (gas-aware heater) -> expand to feed P | n | NEEDS FIGURE: T-s diagram of the Brayton cycle (G4; the case is also an outerDict, G1) |
| `combined01_brayton_rankine` | Combined-cycle: Brayton (CH4 + air, Gibbs combustor) + HRSG + Rankine + 2 generators | n | NEEDS FIGURE: T-Q diagram of the HRSG, or the two T-s loops (G4) |
| `combined02_brayton_rankine_shaft` | Combined cycle with SHAFT-SPLIT: gas turbine drives the compressor + net to the generator | n | NEEDS FIGURE: as combined01 |
| `rankine01_water` | Simplified gas-phase Rankine: superheated steam -> turbine (-10 kW) -> cooler (gas-only, no phase change) | n | NEEDS FIGURE: T-s diagram of the cycle (stream h and s are not publications, G4) |
| `rankine02_water` | Closed IF97 Rankine cycle: pump -> boiler -> turbine -> condenser -> recycle | n | NEEDS FIGURE: T-s diagram of the closed IF97 cycle (G4) |

### steady/reactors (42 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `aceticAcid01_gibbsReactor` | ACETIC ACID FROM CO + METHANOL -- a basic Gibbs-reactor tutorial. One gibbsReactor with the six species of... | products_and_feed | ANSWERED |
| `acetone02_luyben_reactor` | Luyben's acetone reactor: IPA dehydrogenation at 90 % conversion, 623 K -- outlet composition and duty agai... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `ammonia03_quench_converter` | Ammonia synthesis loop with a THREE-BED QUENCH CONVERTER: cold feed gas is taken off upstream of the feed-e... | bed_by_bed | ANSWERED |
| `ammoniaReactor01_fixedConversion` | AMMONIA REACTOR-MODEL LADDER, rung 1 of 4 -- FIXED CONVERSION. The ammonia synthesis loop with a conversion... | n | SCALAR-OK: rung 1 of 4: a stream table; the ladder comparison lives across four cases |
| `ammoniaReactor02_equilibrium` | AMMONIA REACTOR-MODEL LADDER, rung 2 of 4 -- THERMODYNAMIC CEILING. The same loop with a gibbsReactor at TR... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `ammoniaReactor03_equilibriumApproach` | AMMONIA REACTOR-MODEL LADDER, rung 3 of 4 -- REALISTIC OUTLET. The same loop with the gibbsReactor detuned... | per_pass | ANSWERED |
| `ammoniaReactor04_kineticSizing` | AMMONIA REACTOR-MODEL LADDER, rung 4 of 4 -- KINETIC SIZING: THE ENGINE SOLVES THE BED VOLUME. The same loo... | n | ANSWERED (sweep CSV): bed volume from the kinetics: the sweep CSV, G1 for a declared view |
| `ammoniaRoutes01_screening` | Screening three production routes to ammonia on paper: overall stoichiometry, heat of reaction, the electro... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `chlorophenol01_chlorination` | Chlorophenol: classic phenol chlorination (PhOH + Cl2 -> 4-CP + HCl) + HCl flash | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `conversion01_hda` | Conversion reactor: HDA toluene+H2 -> benzene+CH4 at 75%/pass (gas-basis, no kinetics, no Vliq) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `conversion02_parallel_selectivity` | Conversion reactor, PARALLEL network A->B / A->C: selectivity as a SPEC (75 %) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `cracking01_ethane_sundaram_froment` | Ethane steam cracking: Sundaram-Froment 1977 molecular scheme vs the Froment 1976 pilot (Table VIII) | n | NEEDS FIGURE: parity: product yields against Froment 1976 Table VIII |
| `cstr01_first_order` | CSTR with pseudo-first-order Arrhenius esterification (AcOH + EtOH <-> EtOAc + H2O), ~53% conversion of eth... | feed_and_outlet,reactor_numbers | ANSWERED |
| `cstr02_reversible_wgs` | Reversible water-gas shift (CO + H2O <-> CO2 + H2) in a CSTR | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `cstr03_series_selectivity` | CSTR with a SERIES network A->B->C: multi-reaction, the selectivity problem | n | NEEDS FIGURE: selectivity (B yield) against residence time; one point in the run, the curve needs a sweep |
| `cstr04_adiabatic` | ADIABATIC CSTR: T_out solved WITH the extents; Q=0 by construction (elements datum); the liquid esterificat... | temperature_rise | ANSWERED |
| `cstr05_multiplicity` | CSTR steady-state scan: with the corrected (nearly thermoneutral) liquid esterification the reactor has ONE... | n | NEEDS FIGURE: S-curve: heat generation and removal against T (the case scans internally) |
| `cstr06_jacketed` | JACKETED CSTR: the coolant carries heat away -- Q = UA (T_c - T_out); the nearly thermoneutral esterificati... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `cstr07_lhhw_methylAcetate` | LHHW on activities: methyl-acetate synthesis over Amberlyst 15 (Popken 2000, Eq 16) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `cstr08_furusawa_bistable` | Adiabatic CSTR, propylene-oxide hydration (Furusawa, Nishimura & Miyauchi 1969): the energy-balance scan fi... | n | NEEDS FIGURE: S-curve: the energy-balance scan with its three steady states |
| `elementary01a_modArrhenius_chemkin` | PFR, CHEMKIN modified-Arrhenius second-order isomerisation (witness: equals elementary01b) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `elementary01b_modArrhenius_arrhenius` | PFR, plain-Arrhenius equivalent of elementary01a | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `elementary02a_thirdBody_chemkin` | PFR, CHEMKIN third-body reversible isomerisation (witness: equals elementary02b) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `elementary02b_thirdBody_arrhenius` | PFR, Arrhenius equivalent of elementary02a | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `elementary03a_falloff_chemkin` | PFR, CHEMKIN Lindemann fall-off reversible isomerisation (witness: equals elementary03b) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `elementary03b_falloff_arrhenius` | PFR, Arrhenius equivalent of elementary03a | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `equil01_reforming` | Equilibrium reactor (REquil): SMR + WGS to SIMULTANEOUS equilibrium at 1100 K | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `equil02_methanol_declared_pathways` | Declared pathways: one syngas, three equilibria -- Gibbs over every species, a declared reaction subset (me... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `equil03_ammonia_oxidation_declared_pathways` | Declared pathways, a reaction that runs to completion: ammonia in air, three equilibria -- Gibbs over every... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `equil04_reforming_carbon_declared_pathways` | Declared pathways, a reformer that cokes: one feed, three equilibria -- Gibbs over every species (graphite... | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `ladder01_wgs_three_rungs` | The reactor ladder: one water-gas-shift feed through the stoichiometric, the equilibrium and the kinetic rung | n | SCALAR-OK: three rungs of one feed: conversion and T of each rung, three numbers |
| `pfr01_first_order` | PFR with the same kinetics as cstr01 (RK4 integration) | conversion_along_tube,flows_along_tube | ANSWERED |
| `pfr02_reversible_wgs` | Reversible water-gas shift (CO + H2O <-> CO2 + H2) in a PFR; approaches the same X_eq as the CSTR | n | NEEDS FIGURE: profile: CO conversion along the tube against the equilibrium conversion line |
| `pfr03_series_selectivity` | PFR with the SAME series network A->B->C: no back-mixing -> MORE of the intermediate B | n | NEEDS FIGURE: profile: A, B, C along the tube (B peaks), beside cstr03's single points |
| `pfr04_adiabatic` | ADIABATIC PFR: T(V) is a RESULT; the nearly thermoneutral liquid esterification warms the stream only ~6.6... | n | NEEDS FIGURE: profile: T(V) along the bed |
| `pfr05_cooled_multitubular` | A COOLED MULTITUBULAR PFR: o-xylene oxidation in salt-cooled tubes -- the hot spot is a RESULT, and the tub... | n | NEEDS FIGURE: profile: T along the tube with the hot spot marked (the sweep over tubes is the secondary question; G1) |
| `pfr_polyesterification` | PFR step-growth polyesterification — Carothers/Flory chain statistics | n | NEEDS FIGURE: profile: Mn, Mw and PDI along the tube (PolymerKPIs publishes a profile) |
| `plog01_onePressure` | PFR, PLOG with one pressure line equals modifiedArrhenius (witness: equals elementary01a) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `plog02_atTabulated` | PFR, PLOG at a tabulated pressure equals that line (witness: equals elementary01a) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `plog03_midway` | PFR, PLOG midway in ln P between two lines (witness: equals elementary01a) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `plog04_sameP` | PFR, PLOG with two lines at one pressure are summed (witness: equals elementary01a) | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |
| `screen01_methanol_routes` | Screening three routes to methanol on paper: stoichiometry, equilibrium, heat and selectivity | n | SCALAR-OK: one outlet state at one condition (conversion, T, composition): a stream table |

### steady/rotating (9 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `compressor01_air` | Adiabatic air compressor: 10 kW shaft, eta 0.75 --- P_out and T_out are RESULTS | n | SCALAR-OK: one shaft power and outlet state: a table |
| `compressor02_designspec_pout` | Air compressor sized to hit P_out = 8 bar exactly, via DesignSpec on $W_shaft | n | SCALAR-OK: one solved shaft power for a target pressure |
| `compressor03_staged_design` | Air compressed from 1 bar to 12 bar, DESIGNED as a machine: the chart picks the type, the discharge limit s... | n | SCALAR-OK: one shaft power and outlet state: a table |
| `compressorTurbine01_turbo_booster` | Turbo-booster: turbine shaft drives a compressor (energy wire) | n | SCALAR-OK: one shaft power and outlet state: a table |
| `pump01_water` | Water pump: 2 kW shaft, eta 0.65 --- incompressible, P_out / T_out are RESULTS | n | SCALAR-OK: one shaft power and outlet state: a table |
| `pump02_pressure_spec` | Water pump specified by DISCHARGE PRESSURE (P_out 30 bar) --- the shaft power W_shaft is the RESULT (closed... | n | SCALAR-OK: one shaft power and outlet state: a table |
| `pump03_generic_selection` | Generic pump selection (Gulich): nq, estimated efficiency, NPSH3, NPSHA and margin, operating region -- eve... | n | NEEDS FIGURE: H-Q and efficiency curves with the operating point (a unit table beyond one profile, G3) |
| `pump04_manufacturer_curve` | Pump on a declared (ILLUSTRATIVE) curve: H, eta, NPSHr read at the flow; shaft power, NPSH margin | n | NEEDS FIGURE: the declared H, eta and NPSHr curves with the operating point |
| `turbine01_air` | Adiabatic gas turbine: extract 10 kW from hot air, eta 0.85 --- P_out / T_out are RESULTS | n | SCALAR-OK: one shaft power and outlet state: a table |

### steady/separation (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `psa01_h2_psa` | H2-PSA: 20-bar syngas (H2/CO2/CH4/CO/N2) over zeolite 5A -> high-purity H2 raffinate + CO2-rich tail gas (e... | n | SCALAR-OK: a shortcut cycle result (recovery, purity): a table |
| `tsa01_co2_twin_bed` | Twin-bed TSA shortcut: continuous CO2 removal from helium by alternating adsorption at 298 K and regenerati... | n | SCALAR-OK: a shortcut cycle result (recovery, purity): a table |
| `tsa02_refused_capacity` | TSA refusal lesson: one undersized column cannot hold the CO2 loaded during the declared switch interval | n | SCALAR-OK: a shortcut cycle result (recovery, purity): a table |

### steady/solids (20 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `centrifuge01_tubularBowl_geankoplis` | A tubular-bowl sedimenting centrifuge by Sigma theory, held to Geankoplis Example 30.2-2 (the critical part... | n | SCALAR-OK: one Sigma-theory capture: a number held to Geankoplis |
| `centrifuge02_discStack_sigmaIdentity` | A disc-stack sedimenting centrifuge by Sigma theory, a declared illustration: the engine's Sigma equals de... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `circuit01_herbstFuerstenau_closedCircuit` | Herbst & Fuerstenau's 1980 closed-circuit design case: 100 TPH of limestone, a ball mill with the residence... | n | NEEDS FIGURE: size distributions of the circuit's streams (no size distribution is a stream publication, G4) |
| `classifier01_whiten_quartzSlurry` | A size classifier on Whiten's partition curve (a = 3, d50c = 200 um, bypass 0.30) splitting a quartz slurry... | n | NEEDS FIGURE: partition curve against size with the declared d50c |
| `filter01_caco3_rotaryDrum` | A continuous rotary vacuum drum filter on a compressible CaCO3 cake (alpha = 4.37e9 dp^0.3), held to Geanko... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `filter02_caco3_pressWashing` | A plate-and-frame filter press with through-washing on Geankoplis's CaCO3 slurry (Examples 24.2-1 to 24.2-3... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `filter03_drum_area_medium_tabulatedWash` | A rotary vacuum drum with a declared area (cycle time the result), a medium resistance R_m = 1e10 1/m and a... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `filter04_leafFilter_sameAsFiltrateWash` | A batch leaf filter washed along the filtrate's path (washFlowPath sameAsFiltrate, Geankoplis eq. 24.2-19)... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `filter05_calciumSilicate_measuredTest` | A laboratory filter press on a calcium silicate suspension whose cake resistance is DERIVED from the raw t-... | n | NEEDS FIGURE: parity: t/V against V of the laboratory test and the fitted line (the resistance is derived from it) |
| `hydrocyclone01_quartz_willsTable91` | A hydrocyclone on a declared corrected curve and water split (Kelsall's bypass), run forward on the worked... | n | NEEDS FIGURE: corrected partition curve with the bypass |
| `mill01_limestone_herbstFuerstenau` | Dry ball milling of 8x10 mesh limestone as a first-order breakage population balance on a sqrt-2 sieve grid... | n | NEEDS FIGURE: feed and product size distributions (G4) |
| `mill02_bond_crosscheck` | The limestone of mill01 ground on the ENERGY basis of Herbst & Fuerstenau (1980): the specific energy itsel... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `mill03_impact_vogelPeukert` | An impact mill whose selection function is the single-particle breakage probability of Vogel & Peukert (200... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `pneumaticConveyor01_sand` | Dilute-phase pneumatic conveying of sand in nitrogen: the glass-box dP breakdown + the saltation-margin saf... | n | SCALAR-OK: a pressure-drop breakdown: one table of terms |
| `pneumaticConveyor02_bends` | A SHORT (8 m) conveying line routed through 6 bends -- the lesson: A FITTING ADDS PRESSURE DROP WITHOUT ADD... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `psd01_grid_and_moments` | Two limestone powders on ONE declared size grid: a fitted Rosin-Rammler law is INTEGRATED over the grid's c... | n | NEEDS FIGURE: the two powders' distributions on one grid (G4) |
| `screen01_dolomite_karra` | A vibrating screen predicted by Karra's model (King 2001, eqs. 4.30-4.48, no fitted parameter) and held to... | n | NEEDS FIGURE: screen partition curve against size |
| `screen02_declared_rosinRammler` | A screen on a declared Rosin-Rammler partition curve (King 2001 eq. 4.41, d50 = 22 mm, m = 5.9, bypass 0.05... | n | NEEDS FIGURE: screen partition curve against size, declared curve |
| `splitter01_slurry_sizeDistribution` | A splitter divides a limestone slurry 30/70 and BOTH branches keep the slurry's size distribution: the dist... | n | SCALAR-OK: one split, one duty or one cake: a table |
| `thickener01_settlingTest_talmageFitch` | A gravity thickener sized from one batch settling test by the Talmage-Fitch tangent at the compression poin... | n | NEEDS FIGURE: settling curve with the Talmage-Fitch tangent |

### steady/thermo (10 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `air01_heater_expand` | Predefined mixture: heat a stream fed with `components ( air )`, which expands to N2/O2/Ar at load time | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `basis01_two_unit_chain` | Basis reconciliation, the two-unit chain: a speciating flash hands its brine to a unit running a DIFFERENT... | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `liquidDensity01_water` | Liquid density D1: pure water through a pump and a CSTR -- the reference equation by the fact that a record... | n | SCALAR-OK: a density method per case: one number against its reference |
| `liquidDensity02_waterEthanol` | Liquid density D2: water + ethanol (x_ethanol 0.25) by additive volumes, the water leaf on its reference eq... | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `liquidDensity03_NaOH` | Liquid density D3: aqueous NaOH (20 wt %) by the solution record's density law | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `liquidDensity04_NaOHpoint` | Liquid density D3b: one measured point of the case's caustic, marked as the method of its constituent set | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `liquidDensity05_CO2water` | Liquid density D4: CO2 dissolved in water -- a declared Henry solute has no pure-liquid volume, the same re... | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `liquidDensity06_NaClwaterEthanol` | Liquid density D5: NaCl in water + ethanol -- no method prices the set, and the refusal says what record would | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `perUnitThermo01_srk_nrtl` | Per-unit thermo: turbine SRK (real gas) -> flash NRTL (non-ideal liquid) | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |
| `variants01_ethanol_water_line` | Named variants: a pipe and a property check select the same variant of the case's one property dictionary (... | n | SCALAR-OK: a property method, a basis or a witness of agreement: numbers against a reference |

### steady/thermoTest (4 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `model1_lumped_evaporator` | thermoTest model 1 -- NaCl as a LUMPED molecular component: the boiling-point elevation is the IDEAL K_b*m... | n | SCALAR-OK: a model-comparison witness: one result per model |
| `model2_pitzer_evaporator` | thermoTest model 2 -- NaCl as a PITZER electrolyte (Na+ + Cl-, aqueous-inf-dilution reference): the boiling... | n | SCALAR-OK: a model-comparison witness: one result per model |
| `model3_enrtl_antisolvent_crystalliser` | Antisolvent (drowning-out) crystallisation of NaCl: a SATURATED aqueous brine is mixed with ethanol; the eN... | n | SCALAR-OK: a model-comparison witness: one result per model |
| `model5_nrtl_flash` | thermoTest model 5 -- water + ethanol as MOLECULAR components (no ions): an isothermal VLE flash on the NRT... | n | SCALAR-OK: a model-comparison witness: one result per model |

### steady/userops (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `userOp01_yield_reactor` | User-defined yieldReactor (case-local code/): neoPentane -> nPentane, X=0.8 | n | SCALAR-OK: a user-code witness: the answer is that the user unit equals the built-in |
| `userOp02_component_splitter` | User-defined componentSplitter (case-local code/): shortcut benzene/toluene split | n | SCALAR-OK: a user-code witness: the answer is that the user unit equals the built-in |
| `userOp03_case_rate_law` | ONE rate law written TWICE, by the two routes a case carries its own kinetics: a Michaelis-Menten law in C+... | n | SCALAR-OK: a user-code witness: the answer is that the user unit equals the built-in |

### steady/utilities (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `utility01_dowtherm_preheat` | Dowtherm A loop preheats a hydrocarbon feed (eps-NTU) | n | SCALAR-OK: one outlet T and one duty: a number |
| `utility02_hitec_csp_heater` | HITEC molten salt loop sensibly heats pressurised (48 bar) boiler feedwater to ~244 C, just below T_sat, fo... | n | SCALAR-OK: one outlet T and one duty: a number |
| `utility03_glycol_brine_chiller` | PG-30 brine sensibly cools an ethanol vapour stream from 330 K to ~273 K (eps-NTU, no phase change), ~20.8... | n | SCALAR-OK: one outlet T and one duty: a number |

### batch/adsorber (20 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `batch09_adsorber_co2` | Closed isothermal CO2 uptake on zeolite 13X (LDF, solid film): the vessel relaxes to the inventory equilibr... | n | NEEDS FIGURE: uptake against time with the equilibrium inventory as a line |
| `batch10_adsorber_co2_n2` | Closed isothermal competitive CO2/N2 uptake on zeolite 13X: extended-Langmuir site competition drives the e... | n | NEEDS FIGURE: uptake of CO2 and N2 against time (competition and roll-up) |
| `batch11_adsorber_henry` | Closed isothermal Henry-limit uptake (linear isotherm): the coupled gas+solid system is LINEAR and the run... | n | NEEDS FIGURE: uptake against time with the linear closed form |
| `batch12_adsorber_refused_P` | REFUSAL lesson: declared initial.P (10 bar) contradicts n*R*T/V (4.958 bar) -- the honest cross-check FATAL... | n | SCALAR-OK: a refusal lesson: the answer is the refusal text |
| `batch13_breakthrough_co2` | CO2 15%/He breakthrough on zeolite 13X -- 1-D isothermal fixed bed (A3): t_st = 3040.5 s announced pre-run,... | n | NEEDS FIGURE: breakthrough: y_out/y_in against t with the stoichiometric time marked (y_out_<c> is a published extra) |
| `batch14_transport_only` | Pure transport (k = 0) on the batch13 bed, N = 200: t_50 vs the Ogata-Banks analytic ADE solution (gate G1)... | n | NEEDS FIGURE: breakthrough against the analytic Ogata-Banks curve |
| `batch15_mesh_study` | Mesh-study member N = 25 of the batch13 breakthrough: t_b(5%) converges monotonically 2732 -> 2839 -> 2891... | n | NEEDS FIGURE: breakthrough at N = 25 beside the finer grids |
| `batch16_ergun_profile` | A4 F1: pure-He Ergun profile against the closed-form P-squared solution | n | NEEDS FIGURE: axial pressure against the closed-form P-squared solution (the axial profile is not a publication, G7) |
| `batch17_dilute_ergun_limit` | A4 F2: 400 ppm uptake, Ergun must approach the A3 constant-velocity limit | n | NEEDS FIGURE: breakthrough with Ergun against the constant-velocity limit |
| `batch18_ergun_conservation` | A4 F3: 15 percent CO2 with explicit carrier continuity and Ergun velocity | n | SCALAR-OK: a conservation witness: the answer is a closure number |
| `batch19_feed_switch_purge` | A5 feed switch: CO2/He load to 3600 s (batch13 anchors), then pure-He purge to 9000 s -- amended feed commi... | n | NEEDS FIGURE: breakthrough then purge desorption curve against t |
| `batch20_thermal_breakthrough` | A5-T1 adiabatic CO2/He breakthrough (ergun, one T per cell): thermal wave + earlier front vs batch18, ancho... | n | NEEDS FIGURE: outlet T and y_out against t (the thermal wave and the early front) |
| `batch21_tsa_hot_purge` | T1.5 TSA half-cycle: adiabatic load to 3600 s, then 400 K clean He purge -- feed.T as the hot-purge control... | n | NEEDS FIGURE: outlet T and y_out against t through load and hot purge |
| `batch22_wall_cooled` | T2 wall-cooled CO2/He breakthrough (h=5 W/m2K, T_wall=298.15 K): the bed BETWEEN its limits -- t_50 bracket... | n | NEEDS FIGURE: outlet T and y_out against t between the adiabatic and isothermal limits |
| `batch23_tsa_cycles` | Toward A6: three hand-declared TSA cycles (cold load / 400 K purge) in one campaign -- eleven ledgered feed... | n | NEEDS FIGURE: outlet y_out and T against t over the three cycles |
| `batch24_blowdown_inert` | P-swing witness A: inert isothermal blowdown, n/n0 = P/P0 | n | NEEDS FIGURE: n/n0 against P/P0 with the straight line |
| `batch24_tsa_until_css` | Toward A6: three hand-declared TSA cycles (cold load / 400 K purge) in one campaign -- eleven ledgered feed... | n | NEEDS FIGURE: as batch23: the cycle-to-cycle drift |
| `batch25_blowdown_thermal` | P-swing witness B: adiabatic blowdown COOLS (expansion work) | n | NEEDS FIGURE: T and P against t during the adiabatic blowdown |
| `batch29_pulse_two_schemes` | A linear pulse through two identical fixed beds, upwind and van Leer, against the closed-form mean and vari... | n | NEEDS FIGURE: outlet pulse of upwind and van Leer against the closed form (the spatial pulse is not a publication, G7) |
| `batch30_bed_correlations` | Where do Dax, k_f and k_LDF come from? -- batch13's CO2/N2 bed with the declared Dax and k_LDF beside the l... | n | NEEDS FIGURE: breakthrough with declared against estimated Dax and k_LDF |

### batch/combustion (22 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `ignition01_h2o2` | Adiabatic constant-V H2/O2 ignition at 1100 K (O Conaire 2004 H2/O2 kinetics, NASA-9 thermo); Rosenbrock23... | n | NEEDS FIGURE: T and OH against t on a log write grid with tau marked (markers exist in the grammar) |
| `ignition01_h2o2_eulersi` | WITNESS + EXPECTED FAILURE: semi-implicit Euler on the H2/O2 ignition -- A-stable but first-order, goes unp... | n | SCALAR-OK: an EXPECTED FAILURE witness: the answer is the refusal |
| `ignition01_h2o2_jac` | Adiabatic constant-V H2/O2 ignition at 1100 K on the ANALYTIC kinetics Jacobian, audited against the finite... | n | SCALAR-OK: a Jacobian audit witness: equal to ignition01 |
| `ignition01_h2o2_rk4` | Adiabatic constant-V H2/O2 ignition at 1100 K (O Conaire 2004 H2/O2 kinetics, NASA-9 thermo); EXPLICIT RK4... | n | SCALAR-OK: an integrator witness: equal to ignition01 |
| `ignition01_h2o2_rop` | Adiabatic constant-V H2/O2 ignition with rates of production per species and reaction at three instants at... | n | SCALAR-OK: a table of rates of production per species and reaction at one instant |
| `ignition01_h2o2_seulex` | Adiabatic constant-V H2/O2 ignition at 1100 K (O Conaire 2004 H2/O2 kinetics, NASA-9 thermo); seulex stiff... | n | SCALAR-OK: an integrator witness: equal to ignition01 |
| `ignition02_h2air_slack` | Stoich H2/air ignition, 1100 K / 2 atm (Slack shock tube; O Conaire 2004 kinetics) | n | NEEDS FIGURE: T against t with tau and the Slack measured delay as a marker |
| `ignition03_h2air_constp` | Adiabatic constant-P H2/O2 ignition at 1100 K (O Conaire 2004 H2/O2 kinetics, NASA-9 thermo); Rosenbrock23... | n | NEEDS FIGURE: T against t, constant P, beside constant V |
| `ignition04_h2air_sensitivity` | Ignition-delay sensitivity of stoich H2/air, 1100 K / 2 atm (brute force, N+1 integrations) | n | NEEDS FIGURE: bar chart of S_j for the top reactions (a categorical axis: no bar type, G2; sensitivity.csv exists) |
| `kinetics01_oh_decay` | Flash-photolysis cell: a trace of OH decaying in H2/N2 at 1000 K, 1 bar, isothermal (O Conaire 2004 H2/O2 k... | n | NEEDS FIGURE: ln [OH] against t: the straight line of a first-order decay |
| `kinetics02_h2o2_falloff` | Fall-off cell: a trace of H2O2 decaying in N2 at 1000 K, 30 bar, isothermal (O Conaire 2004 H2/O2 kinetics,... | n | NEEDS FIGURE: ln [H2O2] against t |
| `methane01_h2o2_core` | the H2/O2 core ALONE: methane is a spectator, nothing starts (Petersen, Davidson & Hanson 1999, mixture 2,... | n | NEEDS FIGURE: T and CH3 against t: no ignition (rung 1 of the ladder) |
| `methane02_ch4_attack` | + the attack on CH4: CH3 appears, and has nowhere to go (Petersen, Davidson & Hanson 1999, mixture 2, 1244... | n | NEEDS FIGURE: CH3 against t accumulating (rung 2) |
| `methane03_methyl` | + the methyl step: CH3 -> CH3O -> CH2O (Petersen, Davidson & Hanson 1999, mixture 2, 1244 K, 114.4 atm) | n | NEEDS FIGURE: T against t with the early ignition (rung 3) |
| `methane04_formyl` | + CH2O -> HCO -> CO (and CH2): the carbon reaches CO, not yet CO2 (Petersen, Davidson & Hanson 1999, mixtur... | n | NEEDS FIGURE: CO against t (rung 4) |
| `methane05_c1_chain` | + CO -> CO2: the whole C1 chain, from CH4 to CO2 (Petersen, Davidson & Hanson 1999, mixture 2, 1244 K, 114.... | n | NEEDS FIGURE: CO2 against t and tau against the measured 254 us (rung 5) |
| `methane06_assembled` | + the ethane route (two CH3 recombine): the assembled mechanism (Petersen, Davidson & Hanson 1999, mixture... | n | NEEDS FIGURE: T against t with tau on the measured delay (rung 6) |
| `methane07_sensitivity` | the assembled mechanism with the sensitivity of the ignition delay to every reaction (Petersen, Davidson &... | n | NEEDS FIGURE: bar chart of the ranked sensitivities, two methyl reactions heading (G2) |
| `nox01_zeldovich_postflame` | Thermal NOx in post-flame H2/air gas, 2125 K / 1 atm (Glarborg 2018 N chemistry) | n | NEEDS FIGURE: NO against t (thermal Zeldovich growth) |
| `nox02_millerbowman_denox` | Miller & Bowman 1989 Fig. 57 (Lyon & Hardy flow reactor, data set 1): thermal DeNOx window, Appendix B, 17... | denoxWindow | ANSWERED |
| `nox03_millerbowman_large` | Miller & Bowman 1989 Appendix A (235 reactions, 51 species): lean CH4/air + 100 ppm NO, adiabatic constant... | ignition,noRoutes | ANSWERED |
| `nox03_millerbowman_large_seulex` | Miller & Bowman 1989 Appendix A (235 reactions, 51 species): lean CH4/air + 100 ppm NO, adiabatic constant... | ignition,noRoutes | ANSWERED |

### batch/crystallisation (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `batch13_nacl_pitzer` | Batch NaCl crystalliser: saturation from the Pitzer ion activity, not a solubility curve | n | NEEDS FIGURE: supersaturation and mean size against t |
| `batch14_nacl_pitzer_antisolvent` | Batch NaCl crystalliser with ethanol present: a pairwise-aqueous model announces the mixed-solvent term it... | n | NEEDS FIGURE: supersaturation and yield against t with ethanol present |

### batch/drying (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `dryer01_sucrose_tray` | Tray drying of wet sucrose into declared 60 C air: the classical constant-rate / falling-rate drying curve,... | n | NEEDS FIGURE: drying curve X(t) and rate curve R(X): the constant-rate and falling-rate periods (X_kg_kg and R_kg_m2_s are published extras) |
| `dryer02_characteristic_curves` | The characteristic drying curve: one wet sucrose tray, one declared air, four falling-rate shapes -- linear... | n | NEEDS FIGURE: rate against moisture for the four falling-rate shapes |

### batch/electrodialysis (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `edbatch01_constant_current` | Batch recirculating electrodialysis at constant current: the limiting current falls with the depleting dilu... | n | NEEDS FIGURE: current, limiting current and diluate conductivity against t |
| `edbatch02_constant_voltage` | Batch recirculating electrodialysis at constant voltage: the current decays as the diluate loses conductivi... | n | NEEDS FIGURE: current against t as the diluate loses salt |
| `edbatch03_multiionic_split` | Batch electrodialysis of a mixed NaCl + K2SO4 brine: two counter-ions on each membrane share its current by... | n | NEEDS FIGURE: the two counter-ions in the diluate against t |

### batch/membrane (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `diafilter01_nf_desalting` | Constant-volume NF diafiltration: NaCl washed out of an MgSO4 retentate, with the OBSERVED rejection publis... | n | NEEDS FIGURE: NaCl and MgSO4 in the retentate against diavolumes with the observed rejection |
| `diafilter02_fouling_decline` | The same diafiltration with a DECLARED Hermia cake-law decline: what fouling costs a washout schedule | n | NEEDS FIGURE: flux against t with and without the Hermia decline |
| `diafilter03_dspmde_batch` | Batch NF concentration on the DSPM-DE pore model: the observed rejection per instant and the campaign's tim... | n | NEEDS FIGURE: retentate concentration and rejection against t |

### batch/plant (4 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `apalutamide01_tablets` | APALUTAMIDE 60 mg FILM-COATED TABLETS, a drug-product plant (the API is BOUGHT), a generic entrant at loss... | n | SCALAR-OK: a deliverables table (produces, half, not) |
| `donepezil01_tablets` | DONEPEZIL HYDROCHLORIDE 10 mg FILM-COATED TABLETS, a drug-product plant (the API is BOUGHT): WET GRANULATIO... | n | SCALAR-OK: a deliverables table |
| `donepezil02_two_strengths` | DONEPEZIL HYDROCHLORIDE 10 mg AND 5 mg FILM-COATED TABLETS, TWO PRODUCTS in campaigns on one drug-product p... | n | NEEDS FIGURE: campaign Gantt of the two products on one line (no Gantt or bar type, G2) |
| `tabletPress01_dwell_and_force` | THE TABLET PRESS, RATED ON DWELL TIME AND ON COMPACTION FORCE (DEV.md 4c C270). One rotary press makes plac... | n | SCALAR-OK: a rating: two numbers against their limits |

### batch/reactor (18 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `batch01_first_order` | Isothermal batch Fischer esterification (AcOH + EtOH <-> EtOAc + H2O) at 350 K, pseudo-first-order in ethan... | n | NEEDS FIGURE: conversion and composition against t |
| `batch01b_first_order_eulersi` | GREEN WITNESS: semi-implicit Euler (EulerSI) on batch01 mild isothermal esterification -- first order suffi... | n | SCALAR-OK: a numerical witness equal to batch01 within a tolerance |
| `batch02_adiabatic` | Adiabatic batch esterification (AcOH + EtOH -> EtOAc + H2O), starting cold (320 K); the nearly thermoneutra... | n | NEEDS FIGURE: T and conversion against t |
| `batch03_consecutive` | Isothermal batch reactor: consecutive A -> B -> C with k1 > k2; intermediate B peaks then decays | n | NEEDS FIGURE: A, B, C against t: B peaks then decays |
| `batch04_reversible_wgs` | Batch reversible water-gas shift (CO + H2O <-> CO2 + H2) at 600 K; conversion relaxes to X_eq | n | NEEDS FIGURE: conversion against t relaxing to X_eq (a line) |
| `batch04_transient_dirs` | Adiabatic batch esterification with OpenFOAM-style REAL-TIME instant dirs: scrub 0/ 30/ 60/ ... s to watch... | n | SCALAR-OK: the lesson is the instant directories, not a curve |
| `batch05_crystalliser` | Batch crystalliser: supersaturated sugar relaxes, PBE by method of moments | n | NEEDS FIGURE: supersaturation and moments against t |
| `batch06_adaptive_runaway` | Adiabatic esterification (AcOH+EtOH), nearly thermoneutral after the acetic-acid correction; ADAPTIVE Rosen... | n | NEEDS FIGURE: T against t on a log axis around the runaway |
| `batch07_lhhw_methylAcetate` | LHHW in a BATCH reactor: methyl-acetate synthesis over Amberlyst 15 (Popken 2000, Eq 16) | n | NEEDS FIGURE: composition against t |
| `batch08_isothermal_duty` | Isothermal jacket duty from a DECLARED dH_rxn: E = dH*dXi via extents (lumped species, no formation data) | n | SCALAR-OK: one integrated jacket duty from a declared dH |
| `batch26_cooling_failure` | Cooling failure on a batch (fictitious A + B -> P in solvent S): isothermal at 330 K, the jacket stops at t... | n | NEEDS FIGURE: T against t of the runaway after the cooling fails, with the boiling point as a line |
| `batch27_semibatch_dosing` | Semi-batch (fictitious A + B -> P in solvent S): B dosed in 16 portions over 4 h at 330 K, the jacket fails... | n | NEEDS FIGURE: n_B and T against t with the dosing steps |
| `batch28_dosing_vessel_limit` | Semi-batch with a day tank that holds a quarter of B (fictitious A + B -> P in solvent S): the cooling fail... | n | NEEDS FIGURE: n_B and T against t with the day-tank limit |
| `batch30_fast_equilibrium_full` | A fast reversible step feeding a slow one, A <-> B fast and B -> C slow, ALL THREE rates integrated: the fu... | n | NEEDS FIGURE: A, B, C against t, beside the reduced model of batch31 |
| `batch31_fast_equilibrium_reduced` | The same reactor reduced by partial equilibrium: A and B as ONE pool decaying at k K/(1+K), written as one... | n | NEEDS FIGURE: the pool against t, with the full model's sum of A and B |
| `batch32_fast_intermediate_full` | A -> I -> P with the intermediate I consumed fast, BOTH rates integrated: the full model batch33 is compare... | n | NEEDS FIGURE: A, I, P against t, I quasi-steady |
| `batch33_fast_intermediate_reduced` | The same reactor reduced by the quasi-steady intermediate: A -> P at the rate A makes I, written as one exp... | n | NEEDS FIGURE: A, P against t, with the full model's P |
| `batch34_fractional_order_at_zero` | Isothermal batch reactor: A -> B -> C, B absent at t = 0 and consumed at order 1/2 (the analytic Jacobian a... | n | NEEDS FIGURE: A, B, C against t, B against the analytic curve |

### batch/recipes (4 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `recipe01_react_then_distill` | Two-vessel batch recipe: esterify (AcOH + EtOH -> EtOAc + H2O) in a reactor, transfer the charge to a still... | n | NEEDS FIGURE: reactor and still composition against t across the transfer |
| `recipe02_setpoint_ramp` | Single-reactor recipe with T_setpoint steps: 320 K → 350 K @ 200 s → 380 K @ 500 s | n | NEEDS FIGURE: T against t on the stepped set point |
| `recipe03_conditional_partial` | Conditional + partial recipe: react until x_ethanol < 0.30, then transfer 50% to a still | n | NEEDS FIGURE: ethanol fraction against t with the trigger line at 0.30 |
| `recipe04_charge_enthalpy` | H-equality recipe charge: T_mix from the first law, not the molar average; balance CLOSES across a transfer | n | SCALAR-OK: a first-law check at the charge: one mixing T |

### batch/still (6 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `still01_benzene_toluene` | Rayleigh batch distillation: benzene/toluene 50/50, 1 atm, ideal Raoult | n | NEEDS FIGURE: Rayleigh curve: residue composition against the fraction distilled |
| `still02_ethanol_water_azeo` | Rayleigh batch distillation: ethanol/water 40/60 with NRTL, residue concentrates in water | n | NEEDS FIGURE: residue composition against fraction distilled, with the azeotrope |
| `still03_with_receiver` | Rayleigh still distilling INTO a receiver tank (dischargeTo accumulator) | n | NEEDS FIGURE: residue and receiver composition against t |
| `still04_rectifier_benzene_toluene` | batch rectification: 3 stages + total condenser, R=3, with receiver tank (dischargeTo accumulator) | n | NEEDS FIGURE: x_D and R against t (xD_<c> and R are published extras) |
| `still05_rectifier_constant_xD` | batch rectification, constant-composition policy: R(t) holds x_D until refluxMax, then D=0 | n | NEEDS FIGURE: R(t) holding x_D until the reflux limit |
| `still06_ledger_mixed_validity` | Ledger H-validity is MONOTONIC: mixed valid/invalid packages never resurrect a poisoned record | n | SCALAR-OK: a ledger-validity lesson: the answer is a flag |

### ctrl (21 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `ctrl01_cstr_temp_control` | Dynamic CSTR (compA -> compB) with PID jacket-temperature control; T climbs from 320 K into the +/-2% setpo... | response | ANSWERED |
| `ctrl02_disturbance_rejection` | PID disturbance rejection: T_in steps down then up, PID maintains T_setpoint | response,rejection | ANSWERED |
| `ctrl03_adaptive_disturbance` | PID disturbance rejection with ADAPTIVE plant integration --- controller samples on the fixed 1 s grid, Ros... | response,rejection | ANSWERED |
| `ctrl05_disturbance_transient` | PID disturbance rejection with OpenFOAM-style real-time instant dirs: T_in steps down (700 s) then up (1300... | response,rejection | ANSWERED |
| `ctrl06_sine_disturbance` | Forced SINUSOIDAL inlet-T disturbance: T_in = 320 + 15 sin(2 pi t / 600). The PID chases a moving target ->... | response,attenuation | ANSWERED |
| `ctrl07_lhhw_inhibition` | Product inhibition meets a PID: an LHHW reaction whose exotherm fades as its own product covers the catalyst | response | ANSWERED |
| `ctrl08_prbs_ident` | PRBS identification experiment: T_in = 320 +/- 10 K by a maximal-length LFSR (n=4, period 15 bits x 120 s)... | response,record | ANSWERED |
| `ctrl09_stream_disturbance` | Inlet-field disturbance: componentMolarFlow.compA steps 3.5e-5 -> 5.25e-5 kmol/s; F and z_in change by the... | response,step | ANSWERED |
| `ctrl10_brine_concentration` | Dynamic brine tank on a Pitzer package: the electrolyte thermodynamics through a transient | response | ANSWERED |
| `ctrl11_esterification_jacket` | Jacketed esterification CSTR under PID temperature control: the first ctrl case whose stored enthalpy exist... | response,holdup | ANSWERED |
| `ctrl12_williams_otto` | Williams-Otto plant (arXiv:2004.07614 eqs. 3.6-3.11 verbatim) settling onto the published steady state x* =... | rates,harvest | ANSWERED |
| `ctrl13_williams_otto_step` | Williams-Otto F_fB step 20->21 klb/h at t*=100 h (paper Fig. 2): F_pP climbs ~3.90 -> ~4.45 klb/h | response | ANSWERED |
| `ctrl14_williams_otto_pi` | Williams-Otto PI channel (F_fB, F_pP), paper eq. 4.6 with the section-4.1 tunings: F_pP tracks 3.90 -> 4.5... | response | ANSWERED |
| `ctrl16_williams_otto_optimal` | Williams-Otto section-5.3 combined optimisation: Nelder-Mead over two K=5 Schedule profiles, J measured aga... | n | ANSWERED (sweep CSV): optimisation_history.csv (the K = 5 profiles); a declared view is refused beside an outerDict (G1) |
| `ctrl17_signal_shapes` | WITNESS: ramp + pulse + staircase signals on three feed handles, with the temperature PID rejecting all thr... | loop,feeds | ANSWERED |
| `ctrl17_step_reaction_curve` | Open-loop process reaction curve: the jacket steps +5, -5, +20 and -20 K from one settled base, and the fou... | steps,reactionCurve | ANSWERED |
| `ctrl18_rtd_pulse_cstr` | RTD by pulse tracer on a pure mixing tank: tracer substitution at constant flow, tau = N/F = 240 s; engine-... | pulse,washout | ANSWERED |
| `ctrl19_freq_response_cstr` | Frequency response of the LTI mixing tank at omega*tau = 1: engine-fitted amplitude and phase against the e... | response | ANSWERED |
| `ctrl20_bode_cstr` | Bode table of the LTI mixing tank: outer frequency sweep (one datum, lockstep mirror) over the engine frequ... | n | ANSWERED (sweep CSV): Bode magnitude and phase against frequency from sweep_results.csv (G1) |
| `ctrl21_tank_level_control` | Water tank with a manipulated outflow and a PI level controller: the inflow steps +50 % at 600 s, the integ... | level | ANSWERED |
| `ctrl22_reactor_level_and_temperature` | Reactor with a level: a PI level loop on the outflow and a PI temperature loop on the jacket act on ONE uni... | level,temperature | ANSWERED |

### unsteady (8 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `unsteady01_startup_transient` | Open-loop CSTR START-UP transient with OpenFOAM-style real-time instant dirs: charged cold (320 K), no cont... | startup | ANSWERED |
| `unsteady02_tanks_in_series` | Tanks-in-series RTD: three equal mixing tanks chained by the ctrl router; impulse in tank 1 -> Erlang-3 res... | tracer | ANSWERED |
| `unsteady03_nf_feed_and_bleed_startup` | Feed-and-bleed NF start-up: the loop concentrates from the feed's to its steady value, the module solved qu... | loop | ANSWERED |
| `unsteady04_uf_feed_and_bleed_startup` | Feed-and-bleed UF start-up: the loop concentrates the protein, and the gel-limited flux falls as ln(c_g/c_b... | loop | ANSWERED |
| `unsteady05_tank_valve_drain` | Water tank drained through a valve, no controller: after a 50 % step in the inflow the level SELF-REGULATES... | level | ANSWERED |
| `unsteady06_reactor_fill_and_react` | A reactor that starts as a heel and FILLS while a first-order isomerisation runs: volume and level follow t... | fill,reaction | ANSWERED |
| `unsteady07_fast_tank_full` | Two tanks in series, a big one and a small one, BOTH integrated in time: the outlet after a step in the fee... | tracer | ANSWERED |
| `unsteady08_fast_tank_reduced` | The same two tanks with the small one replaced by its quasi-steady relation (a storageTank wrapped as quasi... | tracer | ANSWERED |

### plant (15 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `ChemicalPlantTutorial` | Sugar plant -- multi-sector proxy: a JuiceSplitter feeding three sectors (CONCENTRATION + DRYING + FERMENTA... | n | SCALAR-OK: a structural, multi-sector demo: stream table and closure |
| `aceticAcid02_plant` | ACETIC ACID FROM CO + METHANOL, rung 2 -- the plant around the Gibbs reactor of aceticAcid01: UNIFAC liquid... | acid_through_the_plant | ANSWERED |
| `acetonePlant` | Acetone from 2-propanol: Luyben's Figure 1 closed, with the IPA recycle | plant_products | ANSWERED |
| `ammonia02_full_plant` | Full-scale ammonia SYNTHESIS LOOP at 200 bar (~59 t/h NH3, 1400 t/day) -- a synthesis-loop fundamental, not... | n | NEEDS FIGURE: ammonia make against the loop's recycle and purge (a loop stream summary); the layout is drawn by the 3D viewer |
| `ammoniaPEQ02_feasibility150bar` | Green ammonia, 1200 t/day, FEASIBILITY study at 150 bar (illustrated design stage FEL-2; rung 2 of the gree... | n | NEEDS FIGURE: NPV against the hydrogen price (the economics sensitivity; no economics producer, G6) |
| `ammoniaPEQ02_feasibility50bar` | Green ammonia, 1200 t/day, FEASIBILITY study (illustrated design stage FEL-2), an EXPLORATORY ALTERNATIVE o... | n | NEEDS FIGURE: as the 150 bar case, beside it (G6) |
| `ammoniaPEQ03_basicDesign` | Green ammonia, 1200 t/day, BASIC DESIGN (illustrated design stage FEL-3, process side; rung 3 of the green-... | n | NEEDS FIGURE: cost build-up of the basic design and its sweep (G1, G6) |
| `ammoniaPEQ_baseCase` | Green ammonia, 1200 t/day: the REFERENCE case of the PEQ 2026-27 project brief (base data v2), outside the... | n | NEEDS FIGURE: cash flow and NPV against ammonia price (G6); layout viewer exists |
| `hda` | HDA plant -- toluene + H2 -> benzene + CH4. A single FLAT flowsheet with two plant-level recycles (an H2 ga... | n | SCALAR-OK: a flowsheet closure and product purities: stream table |
| `line01_pumped_drum` | A pumped ethanol/water feed to a flash drum: the line list of a laid-out plant, one line worked by hand | n | SCALAR-OK: a line list entry worked by hand: a table |
| `lithiumBrinePlant` | lithiumBrinePlant -- THE reference case: a SECTORED lithium-carbonate plant from salar brine, WIRED into on... | n | SCALAR-OK: a sectored plant: stream table and closures |
| `polycaprolactonePlant` | Poly(caprolactone) production PLANT — step-growth PFR (Carothers/Flory Mn/Mw/PDI) + devolatiliser that stri... | n | NEEDS FIGURE: profile: Mn, Mw and PDI along the PFR (PolymerKPIs) |
| `properties` | Close the loop: ESTIMATE the PCL repeat-unit glass transition Tg by the Yang 2020 group-contribution scheme... | n | SCALAR-OK: a Tg estimate: one number |
| `swro01_campoDalias` | Campo de Dalias two-pass seawater desalination plant from a manufacturer's public case study: pretreatment,... | n | NEEDS FIGURE: profile: flux and recovery along the pressure vessel and the two passes, against the manufacturer's case |
| `tartaricAcid` | Tartaric-acid plant (wine route): lime precipitation of calcium tartrate, then sulfuric acidulation to tart... | n | SCALAR-OK: a precipitation and acidulation yield: one table |

### props/adsorption (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `isotherm01_eval_13x_co2` | Adsorption isotherm bench: CO2/zeolite13X q(T,p) grid + Henry/saturation/pin/unit-invariance gates | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `isotherm02_fit_jaschik` | Isotherm regression: CO2/13X Jaschik 2020 (CC BY) multi-T Langmuir fit + recovery/single-T/Henry identifiab... | n | ANSWERED (default views): default views of fitParameters |
| `isotherm03_fit_refusals` | Fit refusal gates: non-converged fits refuse their verdicts by name | n | ANSWERED (default views): default views of fitParameters |

### props/compare (21 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `aceticWater01_txy_association` | Acetic acid/water T-x-y at 1 atm on UNIFAC with the ASSOCIATED ideal-gas vapour (monomer + dimer), against... | n | ANSWERED (default views): default views of propertyScan1D |
| `acetone01_ipa_water_azeotrope` | IPA/water T-x-y at 1 atm from PREDICTIVE UNIFAC on a lake-estimated isopropanol, held against Luyben's publ... | n | ANSWERED (default views): default views of propertyScan1D |
| `acetone04_acetone_water_vle` | Acetone/water T-x-y at 1 atm on PREDICTIVE UNIFAC -- both components curated, so this isolates the mixture... | n | ANSWERED (default views): default views of propertyScan1D |
| `compare_activity_etoh_water` | Compare 3 activity models (ideal / NRTL / Wilson) for γ_ethanol in equimolar mixture with water vs T | gamma_ethanol_three_models | ANSWERED |
| `compare_eos_co2` | Compare 3 EoS (idealGas / SRK / PR) for Z of CO2 near critical (T=310 K, P from 1 to 100 bar) | n | ANSWERED (default views): default views of propertyScan1D |
| `compare_kinetics_order` | Rate-law order from DATA: 1st- vs 2nd-order fits overlaid on measured c(t) --- the data picks the order | n | NEEDS FIGURE: c(t) data with the first- and second-order fits overlaid (G5) |
| `compare_psat_ambrose_walton` | Psat: Ambrose-Walton corresponding-states PREDICTION vs fitted Antoine DATA, for benzene (non-polar, good)... | n | ANSWERED (default views): default views of propertyScan1D |
| `compare_transport_water` | Compare water transport: IAPWS (IF97 R12-08/R15-11) vs generic correlations (Andrade / SatoRiedel), 280-370 K | n | ANSWERED (default views): default views of propertyScan1D |
| `compare_visc_liquid_ammonia` | Liquid-viscosity Andrade for ammonia, 235-300 K (cross-check mu@239.85K ~ 0.255 mPa.s) | n | ANSWERED (default views): default views of propertyScan1D |
| `compare_visc_liquid_water` | Compare 2 liquid viscosity correlations (Andrade vs Vogel) for water, 280-360 K | n | ANSWERED (default views): default views of propertyScan1D |
| `compare_vle_etoh_water` | Ethanol/water T-x-y at 1 atm: ideal vs NRTL model curves OVERLAID with measured VLE data --- see the data,... | n | ANSWERED (default views): default views of propertyScan1D |
| `evidence01_methanol_water_points` | Methanol/water bubble T evaluated AT the 13 measured x of a held-out study (doi 10.1021/je200341c): NRTL, U... | n | ANSWERED (default views): default views of propertyScan1D |
| `extractionShortcut01_perry_example15_1` | Extraction shortcut (Perry Eq. 15-43) on Examples 15-1 to 15-3 | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `lkp02_n2_ch4_ar_112K` | Lee-Kesler-Ploecker bubble pressure and vapour composition of N2 + CH4, N2 + Ar and the ternary at 112.00 K... | n | ANSWERED (default views): default views of propertyScan1D |
| `lle01_acetic_mibk_perry` | LLE validation: water + acetic acid + MIBK, 25 C, UNIFAC against Perry Table 15-8 | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `n2ch4_kij_fit_stryjek1974_149K` | Nitrogen + methane: ONE SRK kij fitted to the 149.82 K isotherm of Stryjek, Chappelear and Kobayashi (1974)... | n | ANSWERED (default views): default views of fitParameters |
| `olefins01_propane_propene_laurance1972` | Propene + propane bubble pressure and vapour composition at the 7 isotherms 100-160 F of Laurance and Swift... | n | ANSWERED (default views): default views of propertyScan1D |
| `olefins02_ethane_ethylene_fredenslund1976` | Ethylene + ethane bubble pressure and vapour composition at 263.15 K and 293.15 K measured by Fredenslund,... | n | ANSWERED (default views): default views of propertyScan1D |
| `olefins03_propane_propene_kij_fit_laurance1972` | Propene + propane bubble pressure and vapour composition at the 7 isotherms 100-160 F of Laurance and Swift... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `unifacDortmund01_ethanol_water_reduced_pressure` | Ethanol/water bubble T and vapour y at the measured x of Voutsas et al. (2011), 13.15 / 19.71 / 32.86 kPa:... | n | ANSWERED (default views): default views of propertyScan1D |
| `unifacDortmund02_butanol_water_gamma_infinity` | Table XI of Gmehling, Li & Schiller (1993) reproduced: gamma-infinity of four butanols in water at 25-100 C... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/curation (14 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `curate01_water_evidence_partition` | The FIT/HELD-OUT partition contract: the same property fitted twice, differing only in whether evidence was... | n | ANSWERED (default views): default views of vaporPressureFit |
| `curate02_vle_heldout_ethanol_water` | Fit an ethanol-water NRTL pair (two parameters, starting from Raoult) to ten measured bubble points at 101.... | txy_fit,parity_heldout | ANSWERED |
| `curate03_thermoml_fixture_bubble` | ThermoML -> extract -> partition -> fit -> held-out -> dossier, on a SYNTHETIC structural fixture: the plum... | n | ANSWERED (default views): default views of fitParameters |
| `curate04_nrtl_methanol_water` | NRTL methanol-water regressed to measured bubble temperatures (ThermoML locates, the article sources), held... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate05_nrtl_acetone_methanol` | NRTL acetone-methanol regressed to measured bubble temperatures (ThermoML locates, the article sources), he... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate06_nrtl_isopropanol_water` | NRTL isopropanol-water regressed to measured bubble temperatures (ThermoML locates, the article sources), h... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate07_nrtl_ethylacetate_ethanol` | NRTL ethylAcetate-ethanol regressed to measured bubble temperatures (ThermoML locates, the article sources)... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate08_nrtl_methylacetate_methanol` | NRTL methylAcetate-methanol regressed to measured bubble temperatures (ThermoML locates, the article source... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate09_nrtl_propanol_water` | NRTL 1Propanol-water regressed to measured bubble temperatures (ThermoML locates, the article sources), hel... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate10_nrtl_acetonitrile_water` | NRTL acetonitrile-water regressed to measured bubble temperatures (ThermoML locates, the article sources),... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate11_nrtl_acetone_ethanol` | NRTL acetone-ethanol regressed to measured bubble temperatures (ThermoML locates, the article sources), hel... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate12_nrtl_ethanol_cyclohexane` | NRTL ethanol-cyclohexane regressed to measured bubble temperatures (ThermoML locates, the article sources),... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `curate13_synthetic_lle_butanol_water` | SYNTHETIC water + 1-butanol: NRTL recovered from engine-generated bubble temperatures AND tie lines in ONE... | n | ANSWERED (default views): default views of fitParameters |
| `curate14_nrtl_butanol_water` | Water + 1-butanol: NRTL fitted to measured ThermoML bubble temperatures AND tie lines in ONE fit (kind T_bu... | n | ANSWERED (default views): default views of fitParameters |

### props/electrolyte (40 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `aminoBuffers01_tris_glycine` | Tris and triethanolamine buffers at half neutralisation and a glycine titration with HCl and NaOH at 25 C a... | n | NEEDS FIGURE: glycine titration curve (G5) |
| `archer01_nacl_cold_to_hot` | NaCl Pitzer 0-100 C vs Archer 1992 -- the cold edge the freezing curve stands on | n | ANSWERED (default views): default views of pitzerActivity |
| `bjerrum01_carbonate_pH` | Carbonate speciation across the pH range -- the Bjerrum plot, titrated | n | NEEDS FIGURE: species fractions against pH (the Bjerrum plot); speciate publishes no table (G5) |
| `borate01_felmyWeare` | Borate in Pitzer-HMW (Felmy & Weare 1986): borax-saturated water against the paper's Table 1, and seawater... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `citricAcid01_speciation` | Citric acid 0.1 mol/kg titrated with NaOH (0 to 2.5 equivalents) at 25 C: pH and the H3Cit/H2Cit/HCit/Cit d... | n | NEEDS FIGURE: titration curve: pH against equivalents of NaOH (G5) |
| `composition01_nacl` | Apparent-salt input: the analysis is given as composition { NaCl 2.0 mol/kg }, expanded to Na + Cl ion tota... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `davies01_band_edge` | The Davies band edge, MEASURED: gamma_pm and a_w for NaCl under Davies beside PitzerHMW on identical brines... | n | NEEDS FIGURE: gamma_pm against ionic strength, Davies against Pitzer: where the band ends (G5) |
| `edwards01_sour_water_activity` | Edwards et al. (1978) activity model on a sour-water NH3/CO2 brine -- the molecular solutes get a real gamm... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `edwards02_table7_vle` | Edwards (1978) Table 7 anchor: NH3-CO2-H2O VLE at 100 degC -- the paper's own predictions reproduced from i... | n | NEEDS FIGURE: parity: engine against Table 7 pressures (G5) |
| `edwards03_table8_vle` | Edwards (1978) Table 8 anchor: NH3-H2S-H2O VLE at 80 degC -- the paper's own predictions reproduced from it... | n | NEEDS FIGURE: parity: engine against Table 8 pressures (G5) |
| `electrolyteFit01_nacl` | electrolyteFit: Pitzer and eNRTL regressed to the evaluated gamma_pm and phi of NaCl, 25 C | n | NEEDS FIGURE: parity and residuals of the Pitzer and eNRTL fits (electrolyteFit publishes no table, G5) |
| `enrtl_mixed_nacl_ethanol_esteso` | VALIDATION of the generalized segment-based eNRTL (Chen & Song 2004, AIChE J 50:1928, DOI 10.1002/aic.10151... | n | NEEDS FIGURE: parity against Esteso's measurements (G5) |
| `enrtl_multisalt_nacl_kcl` | Multi-salt symmetric eNRTL (Song & Chen 2009) -- NaCl+KCl Harned sweep at 4 mol/kg | n | NEEDS FIGURE: the Harned sweep against the measured points (G5) |
| `enthalpy_naoh_water` | NaOH-water heat of dilution: Pitzer with calorimetric T-slots vs Parker (1965) | n | ANSWERED (default views): default views of pitzerActivity |
| `estimatedSpecies01_announced` | WITNESS: a run that consumes an ESTIMATED species datum announces it (C376) | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `farelo_licl_range` | LiCl Pitzer REFITTED to Hamer-Wu + Farelo saturation: gamma_pm to ~11% over 0.5-19 mol/kg (was 774 at 19.7m... | n | NEEDS FIGURE: gamma against m against the measured points (G5) |
| `farelo_nacl_nh4cl` | Pitzer-HMW vs Farelo (JCED 2005): NaCl+NH4Cl common-ion salting-out -- model SI ~ 0 at each measured satura... | n | NEEDS FIGURE: NaCl solubility against NH4Cl against the measured points (G5) |
| `fpd01_nacl_freezing` | NaCl freezing-point depression -- ice as a SolidPhase, the crystal's first case | n | NEEDS FIGURE: freezing-point depression against molality with the measured points (G5) |
| `goodsBuffers01_hepes_mes` | HEPES and MES buffers (0.05 mol/kg, half-neutralised with NaOH) at 25 C and 37 C: the pH and its temperatur... | n | SCALAR-OK: a buffer pH table |
| `inorganicLadders01_goldberg` | Half-neutralisation beakers of phosphoric, pyrophosphoric, arsenic and sulfurous acids and hydrazinium at 2... | n | SCALAR-OK: half-neutralisation pH of four acids: a table |
| `ksp_temperature` | K(T) MATTERS: a temperature scan of mineral saturation for ONE fixed water (a hard, carbonate-bearing groun... | n | NEEDS FIGURE: SI against T (G5) |
| `olsson01_naoh_high_concentration` | NaOH-water to 80 wt %: water activity, exact boiling-point rise and heat of dilution on the OlssonNaOH mode... | n | ANSWERED (default views): default views of pitzerActivity |
| `overlay01_nacl_ksp` | PARTIAL deep-merge overlay: a case recalibrates ONLY the halite equilibrium logK25 via a case-local overlay... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `pb82_calcite_open_co2` | Calcite in CO2-saturated water (Plummer & Busenberg 1982): open pCO2 0.956 atm + equilibrate calcite at 25... | n | SCALAR-OK: one equilibrium state against Plummer & Busenberg |
| `pitzer01_nacl` | Pitzer mean ionic activity coefficient gamma_pm(m) for NaCl in water at 25 C --- validated vs Robinson & St... | n | ANSWERED (default views): default views of pitzerActivity |
| `pitzer02_cacl2` | Pitzer gamma_pm(m) for CaCl2 (a 2:1 salt) in water at 25 C --- the SAME general formula as NaCl, only the c... | n | ANSWERED (default views): default views of pitzerActivity |
| `pitzer02_nacl_package` | NaCl Pitzer via the NEW property-package builder (reads zero old salt files) | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `pitzer_calcite_brine` | Pitzer-HMW carbonate system on surface seawater -- pins SI_calcite / SI_gypsum against the published oceano... | n | SCALAR-OK: two saturation indices |
| `pitzer_gamma_hamer_wu` | Pitzer gamma_pm/phi vs Hamer & Wu 1972 -- 6 salts, evaluated NBS data | n | ANSWERED (default views): default views of pitzerActivity |
| `pitzer_hmw_hot_agreement` | HMW vs single-salt Pitzer at 100 C, same NaCl 4 m state: the two surfaces must AGREE now that both apply th... | n | ANSWERED (default views): default views of pitzerActivity |
| `pitzer_nacl_sp77_hot` | NaCl Pitzer to 200 C -- Silvester & Pitzer 1977 T-functions, validated vs their Table V | n | ANSWERED (default views): default views of pitzerActivity |
| `pitzer_seawater_verify` | Pitzer-HMW verification: (binaries + ternary theta/psi) on standard synthetic seawater (I ~ 0.7). Pins per-... | n | SCALAR-OK: a verification table of pins |
| `pitzer_vs_davies_ro_concentrate` | Davies vs Pitzer-HMW on a seawater RO concentrate: gypsum/calcite SI vs recovery from the same feed under t... | n | ANSWERED (default views): default views of scalingScan |
| `precipitation_ro_brackish` | Equilibrium PRECIPITATION (the SI = 0 ceiling) of a brackish RO concentrate: aqueous speciation (Davies) +... | n | ANSWERED (default views): default views of scalingScan |
| `rainwater_air` | WATER OPEN TO AIR: the generic multi-gas Henry pin. Pure water equilibrated with the atmosphere (pCO2 4.2e-... | n | SCALAR-OK: one pH of rain: a scalar |
| `scaling_ro_brackish` | RO membrane-scaling audit of a brackish groundwater: aqueous speciation (Davies) with pH SOLVED from electr... | n | ANSWERED (default views): default views of scalingScan |
| `softener_brackish` | Ion-exchange softening of a brackish RO feed: removes the calcite-scaling driver (raw vs softened vs soften... | n | ANSWERED (default views): default views of scalingScan |
| `tartaricAcid_acidulation` | Tartaric-acid acidulation liquor: rigorous Pitzer brine chemistry (Ca-SO4-K-Cl) + the gypsum precipitation... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `volatileAcids01_acetic_formic` | Acetic and formic acid, 0.1 mol/kg in water at 25 C: pH of the acid alone, at half neutralisation and as th... | n | SCALAR-OK: pH of two acids: a four-number table |
| `wineAcids01_tartaric_malic` | Tartaric + malic + lactic acid (0.03 mol/kg each) in water titrated with KOH, 0 to 1.2 equivalents of titra... | n | NEEDS FIGURE: pH against KOH added (G5) |

### props/estimate (8 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `estimate_acetone` | CREATE a component from its groups: Joback estimate of acetone (2 CH3 + 1 ketone), validated against NIST -... | estimated_properties | ANSWERED |
| `estimate_ethanol_benzene` | Joback estimates: ethanol (H-bonding -> Tb weak, the honest limit) and benzene (aromatic groups -> good) --... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `estimate_petroleum_cut` | ESTIMATE a petroleum PSEUDO-COMPONENT by name from (Tb, SG) -- Riazi-Daubert; see the SCREAMING ESTIMATE pr... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `petroleumCuts01_riazi_table36_tbp` | CUT a TBP curve into petroleum PSEUDO-COMPONENTS (Riazi ASTM MNL50): Tb per cut, SG by constant Watson K, A... | n | NEEDS FIGURE: TBP curve with the cut boundaries and per-cut Tb |
| `userEstimate01_linear_tb` | User-code property estimation: a student's OWN linear group-contribution Tb estimator (linearTbEstimate), c... | n | NEEDS FIGURE: parity: the student's own estimate against the measured Tb |
| `vanKrevelen01_polystyrene_density` | ESTIMATE the density of polystyrene by Van Krevelen group contribution on the repeat unit -- glass-box addi... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `yang2020_Tg_polystyrene` | ESTIMATE the glass-transition Tg of polystyrene by the Yang 2020 modified group-contribution scheme (CC-BY)... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `yang2020_Tg_pvc` | ESTIMATE the glass-transition Tg of poly(vinyl chloride) (PVC) by the Yang 2020 modified group-contribution... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/fit (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `cp01_polynomial_recovery` | Quadratic Cp fit on data generated from a quadratic -- exact recovery, with the Kirchhoff Cp_ig - Cp_liq cr... | n | NEEDS FIGURE: measured Cp points with the fitted line (heatCapacityFit publishes no table, G5) |
| `psat01_antoine_recovery` | Antoine fit on data generated from Choupo's own water correlation: the coefficients must come back exactly,... | n | ANSWERED (default views): default views of vaporPressureFit |

### props/gibbs (10 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `landscape01_ammonia_synthesis` | Equilibrium landscape: ammonia synthesis, NH3 mole fraction against T at 1, 10, 100 bar -- and the 298 K /... | n | ANSWERED (default views): default views of gibbsMap |
| `landscape02_water_gas_shift` | Equilibrium landscape: water-gas shift, CO conversion (carbon in CO2) against T -- pressure-indifferent | n | ANSWERED (default views): default views of gibbsMap |
| `landscape03_steam_reforming` | Equilibrium landscape: methane steam reforming (S/C 3), carbon left in CH4 against T -- pressure hurts | n | ANSWERED (default views): default views of gibbsMap |
| `landscape04_methane_combustion` | Equilibrium landscape: methane combustion in stoichiometric air, carbon in CO2 against T -- complete until... | n | ANSWERED (default views): default views of gibbsMap |
| `landscape05_thermal_no` | Equilibrium landscape: thermal NO in methane-air combustion products against T -- the GLOBAL caveat, drawn | n | ANSWERED (default views): default views of gibbsMap |
| `landscape06_nitrogen_fixation_routes` | Nitrogen fixation, three overall routes on one formation surface: heterotrophic (sugar as the electron dono... | n | NEEDS FIGURE: Delta G against T for the three routes (reactionGibbs publishes no table, G5) |
| `landscape07_sugar_nitrogen_all_pathways` | Gibbs maps with a pure solid: the sucrose nitrogen-fixation reactants with every pathway open, and Boudouar... | n | ANSWERED (default views): default views of gibbsMap |
| `nh3_equilibrium_map` | Ammonia equilibrium map (T x P): why Haber runs at 400-500 C and 150-300 bar | n | ANSWERED (default views): default views of gibbsMap |
| `reactionEnthalpy01_haber_kirchhoff` | The reaction enthalpy is a function of temperature: N2 + 3 H2 -> 2 NH3 priced from 25 C to 527 C on the for... | n | NEEDS FIGURE: Delta H(T) against T (G5) |
| `thermoTable01_propane_radicals` | Propane's two C-H bonds and the n-propyl beta-scission, priced on species the case reads from the NASA ther... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/heat (7 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `bellDelaware01_hewitt_example62` | Bell-Delaware shell side -- Hewitt, Shires & Bott Example 6.2 reproduced step by step at the book's own dec... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `bellDelaware02_serth_example61` | Bell-Delaware shell side, form Serth -- Serth Example 6.1 with every correction factor computed (J_L, J_B,... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `htbench01_correlations` | Heat-transfer correlation bench -- each convective correlation (Dittus-Boelter, Gnielinski, Kern) verified... | n | NEEDS FIGURE: Nu or h against Re, one line per correlation (G5) |
| `psychro01_n2_water` | Psychrometric chart for N2/water at 1 atm, 0-60 C: saturation + four RH lines + three adiabatic-saturation... | n | ANSWERED (default views): default views of psychrometricChart |
| `psychro02_air_water` | Psychrometric chart with dry AIR as the carrier (the textbook object): saturation, RH, adiabatic-saturation... | n | ANSWERED (default views): default views of psychrometricChart |
| `table02_water_liquid_cp_points` | A heat capacity given as points: liquid water's Cp from the record's constant and from eleven evaluated poi... | n | ANSWERED (default views): default views of propertyScan1D |
| `table03_trial_state_refused` | The known cost of a table's hard end: a (P, H) search whose answer lies inside a liquid-Cp table is seeded... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/hydraulics (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `letdown02_valve_fluid_properties` | The two valve inlets of letdown01: the loop purge's Cp/Cv and Z at 140 bar (is the gas letdown choked?) and... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `moody01_friction_correlations` | The Moody chart's four correlations, each verified against its own published anchor and then all asked the... | n | NEEDS FIGURE: friction factor against Re: the Moody chart (G5) |
| `moody02_correlation_sweeps` | The friction-factor and Nusselt correlations swept across five decades of Reynolds number -- the engine's o... | n | NEEDS FIGURE: friction factor and Nusselt against Re over five decades (G5) |

### props/kinetics (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `ammoniaRate01_dyson_simon` | The ammonia synthesis rate of Dyson & Simon (1968), WRITTEN in the case (constant/reactions, `type expressi... | locus_of_maximum_rate | ANSWERED |
| `rate01_arrhenius_recovery` | Second-order decay at three temperatures, generated from k0 = 4e6, Ea = 60 kJ/mol: the Arrhenius line must... | n | NEEDS FIGURE: c(t) data with the fitted curve at three T (kinetics1D publishes no table, G5) |

### props/membrane (6 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `dspmde01_water_treatment_salts` | A water-treatment feed through the DSPM-DE pore: nitrate, fluoride, bromide, carbonate and ammonium salts f... | n | ANSWERED (default views): default views of poreTransport |
| `dspmde02_lab_characterisation_template` | A laboratory template: fill ONE experiment record (3 concentrations x 3 pressures) and get the DSPM-DE pore... | charge_isotherm | ANSWERED |
| `labban2017_dspmde_validation` | Labban, Liu, Chong & Lienhard (2017): the DSPM-DE pore of a low-pressure NF hollow fibre FITTED on uncharge... | n | ANSWERED (default views): default views of fitParameters |
| `nanofiltran_geraldesAlves2008` | The NanoFiltran paper (Geraldes & Alves 2008) in one case: Choupo against NanoFiltran code to code, against... | gridStudy_Na,gridStudy_iterations,fig4_concentration,fig4_potential,fig3_dye4,fig3_dye37,codeToCode_exampleIdeal,table2_N350,table2_grid,fig3_dye4_table,fig3_dye37_table,codeToCode | ANSWERED |
| `polarisation01_geraldes_afonso_table1` | Concentration polarisation of a Na+/Cl-/dye3- solution (Geraldes & Afonso 2007, Table 1): per-ion k, one in... | gamma_dye4,gamma_dye37,rejection_dye4,rejection_dye37 | ANSWERED |
| `shortlist01_class_to_modules` | From a membrane class to the commercial elements that do it: hard filters, each survivor re-rated at the st... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/molecular (28 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `alpha01_water_methanol_psat` | The saturation pressure of water and of methanol from the SRK cubic with its default (Soave) alpha function... | n | ANSWERED (default views): default views of propertyScan1D |
| `componentLookup01_catalogue_ladder` | componentLookup: a catalogue record by name and by CAS, a group-estimate-lake compound, and an unknown | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `cosmoSAC01_water_ethanol` | COSMO-SAC 2002 (NIST benchmark, VT-2005 profiles): pure->lngamma=0, binary/ternary multicomponent gammas, n... | n | ANSWERED (default views): default views of propertyScan1D |
| `cosmoSAC02_lvpp_selection_lin2002` | COSMO-SAC LVPP-HFTZVP-2018: activity coefficients at infinite dilution in water and in n-hexane, the SELECT... | n | ANSWERED (default views): default views of propertyScan1D |
| `cosmoSAC03_ethanol_water_predictive` | Predictive vs fitted: ethanol-water at 1 atm by COSMO-SAC LVPP-HFTZVP-2018 (no binary parameter), beside th... | n | ANSWERED (default views): default views of fitParameters, propertyScan1D |
| `entropy01_air_ledger` | The entropy ledger of 79/21 N2/O2 at 400 K, 2 bar on SRK: every line of s(T,P,y) published separately, so a... | n | ANSWERED (default views): default views of propertyScan1D |
| `envelope01_natural_gas` | P-T phase envelope of a lean natural gas: the dew branch over its cricondentherm, and a bubble branch that... | n | ANSWERED (default views): default views of phaseEnvelope |
| `envelope02_c3c4c5_branch_stop` | P-T envelope of a C3/C4/C5 feed marched through propane's Tc: the reference factor is held continuous above... | n | ANSWERED (default views): default views of phaseEnvelope |
| `envelope03_c3c4c5_both_stop` | P-T envelope of a C3/C4/C5 feed marched to 80 bar on an ideal liquid and a PR vapour: the bubble branch sto... | n | ANSWERED (default views): default views of phaseEnvelope |
| `envelope04_water_benzene_two_liquids` | P-T envelope of equimolar water + benzene on UNIFAC + PR beside the T-x-y's liquid-stability probe: two liq... | n | ANSWERED (default views): default views of phaseEnvelope, propertyScan1D |
| `envelope05_natural_gas_phiphi` | P-T phase envelope of a lean natural gas on one Peng-Robinson cubic for both phases: dew and bubble points... | n | ANSWERED (default views): default views of phaseEnvelope |
| `eval_nrtl_catalogue` | EVALUATE mode: score the CATALOGUE NRTL pair against your own data -- the scale before any fit | n | ANSWERED (default views): default views of fitParameters |
| `eval_nrtl_pinned` | EVALUATE a pinned what-if: a pinned run scores the package but mutates NOTHING (the leakage sentinel) | n | ANSWERED (default views): default views of fitParameters |
| `exergy01_air_dead_state` | Physical exergy of 79/21 N2/O2 at 400 K, 2 bar against a DECLARED 298.15 K / 1 bar dead state -- b = (h-h0)... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `flash01_operating_line` | The equilibrium curve a flash operating line is drawn on | n | ANSWERED (default views): default views of propertyScan1D |
| `lkp01_lee_kesler_tables` | The Lee-Kesler equation of state against the tables Lee & Kesler (1975) print: Z, enthalpy and entropy depa... | n | NEEDS FIGURE: parity against the printed table (G5) |
| `mhv01_methanol_water_100C` | Can a cubic equation of state be fed a low-pressure excess-Gibbs model? Methanol + water at 100 C, twelve m... | n | SCALAR-OK: one excess-Gibbs comparison table |
| `mixrules01_natural_gas` | The van der Waals one-fluid mixing rule, decomposed: SRK a_mix/b_mix of a 90/5/5 CH4/N2/CO2 gas at 250 K, p... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `nrtl01_ethanol_water_package` | ethanol-water NRTL via the SAME property-package builder (molecular U4) | n | SCALAR-OK: gamma at one composition |
| `pairLookup01_catalogue_ladder` | pairLookup: the honesty ladder for four pairs (curated, regressed, UNIFAC estimate, none) | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `pairLookup03_provenance_stale_seal` | pairLookup provenance line: case sealed from an OLDER release than the installation | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `pcsaft01_pure_nhexane` | PC-SAFT pure n-hexane: Z + liquid molar volume at 298 K, 1 bar | n | SCALAR-OK: one Z and one liquid volume |
| `pcsaft02_states_crosscheck` | PC-SAFT across states: CH4 Z vs SRK cross-check + propane/n-butane liquid density vs handbook | n | SCALAR-OK: a cross-check table against SRK |
| `pcsaft03_association_pure` | PC-SAFT association (Wertheim TPT1): 2B water + 2B ethanol, pure liquids | n | SCALAR-OK: two pure-liquid numbers |
| `ppr78Kij01_ch4_co2_h2` | The E-PPR78 group-contribution kij of a CH4/CO2/H2 gas, evaluated once at a declared temperature and writte... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `solubility01_hildebrand_ladder` | Hildebrand: one number for like-dissolves-like, and where it stops | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `srk01_h2n2_density` | Does SRK describe the ammonia synthesis loop's gas? Sixteen MEASURED (T, P, x, rho) points on the nitrogen... | n | NEEDS FIGURE: parity: SRK density against the 16 measured points (propertyPoint publishes no table, G5) |
| `volumeTranslation01_nhexane_peneloux` | How wrong is the liquid density of SRK, and what does a Peneloux volume translation do about it? n-Hexane,... | n | ANSWERED (default views): default views of propertyScan1D |

### props/powder (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `compaction01_mcc` | Microcrystalline cellulose on the compaction bench: Heckel, Kawakita and Ryshkewitch-Duckworth fitted to tw... | n | ANSWERED (default views): default views of compactionFit |
| `compaction02_dcpd_brittle` | A brittle excipient on the compaction bench: dicalcium phosphate fitted to two open datasets (no open lacto... | n | ANSWERED (default views): default views of compactionFit |

### props/reactor (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `thiele01_sphere_first_order` | Single catalyst pellet: intraparticle concentration field, effectiveness factor, and the eta(phi) family, e... | n | NEEDS FIGURE: concentration profile in the pellet and effectiveness against Thiele modulus (thielePellet publishes no table, G5) |
| `thiele02_prater_temperature` | Single catalyst pellet: intraparticle concentration field, effectiveness factor, and the eta(phi) family, e... | n | NEEDS FIGURE: T and concentration profiles in the pellet (G5) |

### props/reconciliation (1 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `reconcile01_recycle_loop` | Seven flow meters on an invented recycle loop, reconciled under four node balances: the residuals of the ra... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/safety (2 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `relief01_ammonia_loop_gas` | The ammonia synthesis loop's converter feed at the relieving pressure of a blocked outlet, at 150 bar and a... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `relief02_acetone_fire_case` | An acetone drum in a pool fire: the boiling temperature at the relieving pressure, the latent heat there, a... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/scan (8 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `binary01_lle_water_nbutanol` | Binary LLE g_mix + common-tangent (water/1-butanol) at 298.15 K via propertyScanBinary, cited Winkelman 200... | n | ANSWERED (default views): default views of propertyScanBinary |
| `hxy01_ethanol_water_1atm` | Enthalpy-concentration locus (h-x-y) of ethanol/water at 1 atm on the elements datum -- the data a Ponchon-... | n | NEEDS FIGURE: the h-x-y diagram (enthalpyConcentration publishes no table, G5) |
| `phase01_water_full` | Complete P-T phase diagram of water (purePhaseDiagram, solid+liquid+vapour) | n | ANSWERED (default views): default views of purePhaseDiagram |
| `pxy01_ethanol_water_70C` | P-x-y of ethanol/water at 70 C (bubble pressure and incipient vapour along x, a maximum-pressure azeotrope... | n | ANSWERED (default views): default views of propertyScan1D |
| `scan2d01_co2_compressibility` | Z(T,P) for CO2 on Peng-Robinson over a 15 x 20 grid that crosses the critical point: the compressibility su... | n | NEEDS FIGURE: Z(T,P) as lines per T, or a map; no contour type (G2, G5) |
| `ternary01_audit_vlle` | Ternary VLLE phase map (compA/compB/compC) at 350 K, 1 bar via propertyScanTernary | n | NEEDS FIGURE: ternary phase map (no ternary type, G2) |
| `ternary02_bubbleT_benzene_toluene_water` | Ternary T_bubble surface (benzene/toluene/water) at 1 bar via propertyScanTernary mode bubbleT | n | NEEDS FIGURE: ternary T surface (G2) |
| `ternary03_lle_water_ethanol_benzene` | Ternary LLE solubility (water/ethanol/benzene) at 298 K via UNIFAC + propertyScanTernary mode lle | n | NEEDS FIGURE: ternary LLE diagram with tie lines (G2) |

### props/solvents (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `solvent01_synthetic_mixture` | DIDACTIC EXAMPLE WITH SYNTHETIC PARAMETERS: two fictitious solvents A and B, a fictitious polymer P between... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `solvent02_polystyrene_hexane_blends` | Polystyrene (Hansen 1967, solute G) against two hexane blends: hexane + acetone, two solvents each short of... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `solvent03_polystyrene_observed` | Polystyrene (Hansen 1967, solute G) screened against thirteen pure solvents of the same thesis, beside the... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/steam (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `steam01_if97_verification` | IAPWS-IF97 steam tables (R7-97(2012)) -- the verification case. The six computer-program verification state... | states,table5,table15,table35,table36 | ANSWERED |
| `steam02_water_transport` | IAPWS water transport properties -- viscosity (R12-08), thermal conductivity (R15-11) and surface tension (... | n | ANSWERED (default views): default views of propertyScan1D |
| `steam03_if97_region3` | IAPWS-IF97 region 3 (near-critical and supercritical water, the Helmholtz form f(rho,T)). The three verific... | n | ANSWERED (default views): default views of steamTables |

### props/thermo (9 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `bubble01_reaction_mass_boiling_point` | The boiling point of a reaction mass: the bubble point of the cooling-failure batch's contents (fictitious... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `flashSpec01_wet_steam_expansion` | The general flash specification (DEV.md 4c C214 W1): steam at 80 bar and 500 C expanded isentropically to 0... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `heavyWater01_isotope_effect` | Heavy water against ordinary water: the vapour-pressure isotope effect and the boiling points, from the rec... | n | ANSWERED (default views): default views of propertyScan1D |
| `phaseSplit01_freeze_water_ethanol` | Freeze-concentration scan: a 10 mol% ethanol liquor cooled from 0 to -20 C, one SLE flash per kelvin -- the... | n | NEEDS FIGURE: ice fraction and liquor composition against T (phaseSplitScan publishes no table, G5) |
| `purelaws02_water_two_vapour_pressure_laws` | Several named laws in one record: a case-local water record holding two vapour-pressure laws (the catalogue... | n | NEEDS FIGURE: Psat against T for the two laws (G5) |
| `refEoS01_iapws95_verification` | Reference (multiparameter Helmholtz) equations of state through one kernel: water IAPWS-95 (R6-95(2018)), c... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `standardState01_hydrogen_enthalpy_TP` | h(T,P) of hydrogen on SRK, 300-1000 K by 1-1000 bar, 42 points: the ideal-gas part against the residual, fo... | n | NEEDS FIGURE: h against T, one line per P over the 42 points (G5) |
| `temperature01_gas_thermometer` | The gas thermometer: why the ideal gas is a limit, not a substance | n | NEEDS FIGURE: Z or the thermometer error against T: the ideal gas as a limit (G5) |
| `temperature02_engineers_ladder` | The range a chemical engineer actually works in | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |

### props/thermoTest (3 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `atoms01_formula_parser` | The shared formula parser, opened up: nested groups, both hydrate spellings, an ion charge that is not an e... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `h_surface_identity` | The state identities of the canonical enthalpy surface: dh/dT == Cp_phase, the 298 K vaporisation anchor, a... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `model4_speciation_scaling` | RO membrane-scaling audit of a brackish groundwater: aqueous speciation (Davies) with pH SOLVED from electr... | n | ANSWERED (default views): default views of scalingScan |

### props/transport (10 cases)

| case | question | declared | verdict |
|---|---|---|---|
| `liquidDiffusivity01_pelkonen_ternary` | The liquid diffusivity a package returns (C398 slice (d)): the six infinite-dilution values of methanol, 2-... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `liquidDiffusivity02_kooijmanTaylor_ternary` | The multicomponent liquid diffusivity of Kooijman & Taylor (1991) on their own Table I, acetone / benzene /... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `measured01_methanol_glycol_viscosity_grid` | A measured mixture table: the viscosity of liquid methanol + ethylene glycol on a 3 x 4 grid of temperature... | n | ANSWERED (default views): default views of propertyScan1D |
| `measured02_ethanol_water_surface_tension_grid` | A measured mixture table: the surface tension of aqueous ethanol on a 2 x 5 grid of temperature and mass fr... | n | ANSWERED (default views): default views of propertyScan1D |
| `mixing01_water_acetone` | Liquid mixing rules, old beside new, at measured points: surface tension of water + acetone (mole-fraction... | n | NEEDS FIGURE: surface tension against x, old mixing rule, new rule, measured points (G5) |
| `purelaws01_methanol_isopropanol_water` | One law per constituent: the liquid viscosity of methanol + 2-propanol + water, which no single model word... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `surfacetension01_stored_vs_brockbird` | Liquid surface tension two ways: StoredCorrelation (a power law fitted to the laboratories in the ThermoML... | n | SCALAR-OK: a point, a ladder or a table of values (propertyPoint, speciate, estimate, lookup, refusal): numbers against a source |
| `table01_water_viscosity_points` | A table is a law type: water's liquid viscosity from the record's Vogel fit and from eleven evaluated point... | n | ANSWERED (default views): default views of propertyScan1D |
| `transport01_gas_bench` | Every transport correlation proves itself against its own anchor -- theory or arithmetic, said which -- and... | n | SCALAR-OK: each correlation against its anchor: a table of agreements |
| `transport02_chapman_enskog` | Chapman-Enskog from Svehla's own force constants: seven gases at 300 K priced by two viscosity and two cond... | n | SCALAR-OK: seven gases at 300 K against Svehla: a table |

## The 1260 curation fits (`data/curation`, outside `tutorials/`)

Summarised one row per batch.  The operation types of all 1260 `propsDict` files were counted by script (`grep` of `type <op>;`); none declares `views`.

| batch | cases | operations (count over the batch) | verdict |
|---|---|---|---|
| components | 103 | `vaporPressureFit` 103 | ANSWERED (default views): the parity, residuals and parameter table of a vapour-pressure fit |
| pairs | 849 | `fitParameters` 4080, `propertyScan1D` 3121 | ANSWERED (default views): parity, residuals, parameters, and the scan curves |
| henry | 235 | `pairLookup` 235 | SCALAR-OK: a catalogue lookup of one Henry constant, with its provenance line |
| electrolytes | 67 | `electrolyteFit` 134 | NEEDS FIGURE: parity and residuals of the Pitzer and eNRTL fits; `electrolyteFit` publishes no table (G5), as for `electrolyteFit01_nacl` |
| batches | 6 | `propertyScan1D` 171, `estimateComponent` 79, `pairLookup` 45, `elementalComposition` 1 | ANSWERED (default views) for the scans, SCALAR-OK for the estimates and lookups |

## What was read in full and what was sampled

- **Counted by script for all 678 cases:** the `description`, the application, the `views` blocks and their names, `outerDict` presence, the operation types of every propsDict.  This is exact.
- **Read by the general:** the `description` of every case, in family listings; the `views` grammar (`Views.cpp` refusals, the three `*Publications.H` files, `docs/design/a-post-processing-dictionary.md` C477 and C487 sections), `flash02_ethanol_water/system/postDict`, and the READMEs of `column04_multifeed_sidedraw` and `column05_reactive_methylacetate`.
- **Not read:** the README header of nearly every other case.  The question of each case is the `controlDict` `description`; where a README could change a verdict (a case whose title says one thing and whose README another) it was not looked for.  No case was run.  Whether a unit publishes the profile the proposed figure needs (columns, absorbers, PFR, spray dryer, cyclone, spiral-wound module, convective dryer, crystalliser are in the list of units with a `UnitProfile`; the cooling tower and exchangers likewise) was read from the class lists, not from an output; a NEEDS FIGURE that assumes a profile is therefore the weakest claim in the batch of steady cases.
- **Verdicts are judgement, the counts are measurements.**  Re-reading the NEEDS FIGURE rows for a case whose question is already answered by the default view of a different operation is the likeliest correction.
