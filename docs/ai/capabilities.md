# Capability index: does Choupo do X?

Read this page to answer a CAPABILITY question ("does Choupo have a tablet
press?", "can it size the HVAC?").  To DESIGN a process, read the brief
(`docs/ai/brief.md`, served at https://www.choupo.org/llm/brief.md) instead.

For every concept below, four answers, kept apart on purpose:

* **Computes**: physics or engineering arithmetic the engine solves and
  publishes (a temperature, a size, a cost, a utilisation).
* **Balances only**: the unit moves mass (and enthalpy where stated) and
  models NO machine.  A name in a tutorial is not a model: in the tablet
  cases the unit called `tabletPress` is a `unit:splitter`.
* **Checks**: the engine tests a declaration against a rule and refuses or
  announces; it computes nothing new.
* **Missing**: not in Choupo today.  Do not invent it; say it is missing
  and, if the design needs it, make it a declared assumption in DESIGN.md.

How to read the names (a gate, `bin/curate/check_capability_index.py`, holds
every one of them to the source tree, so a name here is a name that exists):

| Written | Means | Where it goes |
|---|---|---|
| `unit:<type>` | a steady unit operation (`choupoSolve`) | `type <type>;` in `system/flowsheetDict` |
| `batchUnit:<type>` | a batch unit (`choupoBatch`) | `type <type>;` in `system/flowsheetDict` |
| `dynUnit:<type>` | a time-integrated unit (`choupoSemiContinuous`, `choupoCtrl`) | `type <type>;` in `system/flowsheetDict` |
| `op:<type>` | a property-bench operation (`choupoProps`) | `type <type>;` in `system/propsDict` |
| `pass:<name>` | a post-processing block | a top-level block in `system/postDict` |
| `sizer:<type>` | an entry of `sizing { units ( ... ) }` | `type <type>;` in that entry |
| `kind:<word>` | a `sizer:ratedMachine` kind | `designRules { kind <word>; }` |
| `key:<name>` | a dictionary key | as named in the row |
| `controller:<type>` | a control-loop element (`choupoCtrl`) | `controllers ( ... )` |
| `pack:<name>` | the task pack to read | https://www.choupo.org/llm/packs/<name>.md |

Every witness is a tutorial case given by its FULL path in the repository
(https://github.com/choupo-admin/choupo); it opens in the app from the case
list under the same name.

## 1. Pharmaceutical (oral solid dose) plant

The two worked plants are `tutorials/batch/plant/donepezil01_tablets` (wet
granulation, fluid-bed drying) and `tutorials/batch/plant/apalutamide01_tablets`
(spray-dried dispersion with acetone recovery, roller compaction).  Both are
`choupoSolve` cases: a steady material balance per kg of product, with a
batch plan, sizing, clean utilities, costing and economics on top
(`pack:batch-plant`).

### Batch plan, lots, campaigns, Gantt chart (scheduling, cycle time, number of batches)
* Computes: `pass:batchPlan` turns the steady balance into lots: lot size,
  lots a year, the cycle of every stage, the limiting cycle, campaigns, the
  busy hours and occupancy of every stage, parallel units in and out of
  phase, the first campaign's Gantt (`reports/batchPlan/gantt.csv`; the app
  draws it).  Several products on the same stages with a declared
  `key:campaignOrder`.  The purified water and effluent volume of cleaning
  (`key:cleaning`).
* Checks: refuses a plan that cannot run (a stage busier than its train's
  `key:availableTime`, campaigns that do not fit); announces an under-used
  stage or an idle train.
* Missing: a scheduling optimiser (the order is the student's decision),
  the size of an intermediate store between trains, labour that follows the
  plan, a recipe integrated in time inside the plant (that is
  `choupoBatch`, a separate case).
* Witness: `tutorials/batch/plant/donepezil01_tablets`.

### Machine utilisation (does one machine carry the lot? equipment rating, capacity check)
* Checks: `sizer:ratedMachine` compares the load the plan puts on a machine
  with the vendor rating YOU declare, for `kind:batchVolume` (blender,
  granulator, coating pan), `kind:massRate` (mill, roller compactor),
  `kind:tabletPress`, `kind:packagingLine` and `kind:volumeRate` (pump);
  utilisation is published per machine; above 1 the item is refused
  (`FAILED`), above `key:announceAbove` it is announced; `key:installed`
  declares machines in parallel.
* Missing: any machine model (a rated machine has no physics, no
  correlation cost and no place on the plot plan: its price is a quote, its
  place is a room).
* Witness: `tutorials/batch/plant/apalutamide01_tablets`.

### Tablet compression (tablet press, compaction, tabletting, tablet hardness)
* Balances only: in the flowsheet the press is a `unit:splitter` (product
  and rejects).
* Checks: `kind:tabletPress` holds the press's tablets per hour (stations x
  turret speed x compressions per revolution) against the lot, the tablet
  mass and the stage time of the batch plan.
* Computes (on ONE material, outside the plant): `op:compactionFit` fits the
  Heckel, Kawakita and Ryshkewitch-Duckworth models to compaction data you
  supply, on the linear region you declare, with standard errors.  Witnesses
  `tutorials/props/powder/compaction01_mcc` and
  `tutorials/props/powder/compaction02_dcpd_brittle`.
* Missing: a physical press unit in the flowsheet that turns compression
  force, die and fill mass into relative density, porosity, tensile strength
  or hardness of the tablet; any mixing rule for the compaction parameters of
  a blend.
* Witness (press as a machine): `tutorials/batch/plant/donepezil01_tablets`.

### Granulation (wet granulation, high-shear granulator, roller compaction, dry granulation)
* Balances only: the granulator or roller compactor is a `unit:mixer`
  (binder solution plus powder, or powder alone).
* Checks: the granulator as `kind:batchVolume`, the roller compactor as
  `kind:massRate`.
* Missing: granule growth, granule size distribution, binder-to-powder
  ratio physics, compact ribbon density.
* Witnesses: `tutorials/batch/plant/donepezil01_tablets` (wet),
  `tutorials/batch/plant/apalutamide01_tablets` (roller compaction).

### Drying (fluid-bed dryer, tray dryer, coating dryer, LOD)
* Computes: `unit:solidDryer` dries a hygroscopic solid with a real hot-air
  stream against its sorption isotherm (the component's `key:sorption`
  block): outlet temperature from the energy balance, water evaporated,
  wet-bulb floor, and which limit binds (isotherm, heat or saturation).
  `unit:evaporativeDryer` for free surface water, `unit:convectiveDryer` on a
  drying curve, `batchUnit:batchDryer` in time.
* Missing: fluid-bed hydrodynamics (minimum fluidisation, bed height,
  elutriation); a fluid-bed dryer is a `unit:solidDryer` with a stated basis.
* Witnesses: `tutorials/batch/plant/donepezil01_tablets` (fluid-bed dryer),
  `tutorials/steady/drying/solidDryer01_sugar`,
  `tutorials/batch/drying/dryer02_characteristic_curves`.

### Spray drying (spray dryer, amorphous solid dispersion, atomiser)
* Computes: `unit:sprayDryer`: atomisation, droplet drying, outlet gas
  temperature and powder moisture, with several solvents and several solids
  (drug plus polymer); chamber models `marshall`, `langrishKockel`, `chen`;
  sized by `sizer:sprayDryer`.  Solvent recovery downstream with
  `unit:phaseChanger` (condenser) and `unit:isothermalFlash`.
* Witnesses: `tutorials/batch/plant/apalutamide01_tablets` (acetone, nitrogen
  loop), `tutorials/steady/drying/sprayDryer01_sugar`.

### Blending, milling, screening, coating, packaging
* Balances only: blenders and coating pans are `unit:mixer`; mills, screens
  and packaging lines are `unit:splitter`.  The coating suspension's water is
  dried by a `unit:solidDryer` with its own air heater.
* Checks: each as a rated machine (`kind:batchVolume`, `kind:massRate`,
  `kind:packagingLine`).
* A size-reducing mill with a particle-size distribution exists as
  `unit:mill` (a breakage population balance on the case's `key:sizeGrid`,
  see section 2); the tablet plant's mill box is still a `unit:splitter`.
  A screen, a classifier and a hydrocyclone on the same grid exist as
  `unit:screen`, `unit:classifier` and `unit:hydrocyclone` (section 2).
  A cake filter, a thickener and a sedimenting centrifuge on a slurry exist as
  `unit:cakeFilter`, `unit:thickener` and `unit:sedimentingCentrifuge` (section 2).
* Missing: blend uniformity and segregation, coating film thickness and
  weight gain kinetics.
* Witness: `tutorials/batch/plant/apalutamide01_tablets`.

### Clean utilities: HVAC air changes and purified water (cleanroom air, AHU, PW generator)
* Computes: `pass:cleanUtilities`: per room, supply air = air changes per
  hour of its grade x room volume (`key:changesPerHour`, rates YOU declare
  and cite), fan power and the sensible heating and cooling duty of the
  fresh air (`key:hvac`); purified water demand per lot, the peak overlap in
  the plan's Gantt, the generator and the storage (`key:purifiedWater`), with
  the cleaning water of the batch plan joining the same ledger.  The supply
  air of each grade is priced by a quote (`key:hvacGrade`,
  `key:valuePerSupplyAir`).
* Checks: refuses a grade with no declared air-change rate.
* Missing: humidity and latent load, room heat gains, filter pressure drop
  beyond the declared fan rise; no air-change table is shipped.  The PW
  generator and tank are sized but not costed (quote them).
* Witness: `tutorials/batch/plant/donepezil01_tablets`.

### GMP building, room grades, airlocks, pressure cascade (cleanroom layout, gowning, personnel and material flows)
* Checks: `key:building` in `system/layoutDict`: floors, rooms with grade
  A|B|C|D|CNC and pressure, airlocks as rooms with a regime, doors, stairs,
  lifts, personnel/material/waste flows.  A building that cannot exist is
  refused (overlapping rooms, a door with no shared wall, equipment that does
  not fit its room); a GMP rule broken is announced (cascade step, airlock
  regime, grade change without an airlock, ungowned entry, containment, flow
  crossings, ATEX against ignition, no escape route).
* Missing: particle-count classification, door widths, travel distances.
* Witness: `tutorials/batch/plant/donepezil01_tablets` (`pack:layout`).

### Operator panel of a batch run (alarms, limits, displays, operator interface)
* Checks: `key:elements` in `system/panelDict` of a `choupoBatch` case, read
  after the time loop: number, bar, trend and lamp displays over published columns, each with
  a reason, limits with their source and reason, alarms with the action they
  ask for, messages.  A malformed panel is refused by name; the engine reports
  FACTS: a quantity not published or constant over the run, a scale that hides
  the run, a limit outside its scale, a limit violated at k of n written
  instants and from when, a limit the run never approached, a controller no
  element shows, several alarms on one quantity, the count of active alarms,
  the instants a message would fire.  Never a grade.
* Missing: drawing it (a later slice), a draft tool, the driver binaries
  (`choupoCtrl`, `choupoSemiContinuous`), a dimension per column; alarm
  practice is good practice, not verified against a standard.
* Witness: `tutorials/batch/electrodialysis/edbatch01_constant_current`.

### Plot plan and site layout (plant layout, equipment spacing, pipe rack, roads)
* Computes: in `system/layoutDict`, the routes and lengths of the pipes over
  a declared `key:pipeRack`, where each pipe lands on its item (a PORT: a
  column's feed at its stage's height on the shell, bottoms at the sump,
  distillate on the reflux drum; an exchanger's tube and shell nozzles; a
  drum's inlet, vapour and liquid; movable with `key:ports`), the plot area,
  the paved road area; the cooling-water, refrigerant and flare-header lines
  the case DECLARES in `key:utilityLines` (a utility is not a stream), routed
  on the same rack above the process pipes, each UNSIZED, carrying the flow of
  the run's own utility allocation where the case names a unit and a utility.
* Checks: overlaps are refused; short separations, ignition sources in a
  hazardous zone or downwind of a release, roads without a gate, items out of
  reach of a road are announced; truck routes walked against a design
  vehicle; a fence derived from the plot.
* Missing: pipe sizing, pressure drop and cost from the layout (process or
  utility), steam and nitrogen lines, structures; no
  spacing or zoning table is shipped (every distance is the case's).
* Witnesses: `tutorials/plant/aceticAcid02_plant`,
  `tutorials/plant/greenAmmoniaPEQ_baseCase` (the utility lines),
  `tutorials/batch/plant/apalutamide01_tablets` (`pack:layout`).

### Equipment list and tags (equipment register, tag numbers)
* Computes: every sized item gets a plant tag (`P-101A`, `TP-101`, ...;
  declared with `key:tag` or `key:itemTags`, generated otherwise) and one row
  in `reports/equipment/equipmentList.csv` (tag, unit, sector, size, design
  pressure, material, cost); one specification sheet per item under
  `design/`.  The app prints the list from Reports.
* Witness: `tutorials/batch/plant/donepezil01_tablets` (`pack:design-cost`).

### Process flow diagram sheet (PFD, stream table, flowsheet drawing)
* Computes (in the app): Reports -> PFD draws the flowsheet with its stream
  table, equipment tags, utilities legend and title block as a printable
  sheet.  The engine's own table: `key:streamTable` in the `reports` block of
  `system/controlDict` writes `reports/streams/streamTable.csv`.
* Missing: piping and instrumentation diagrams (P&ID).
* Witness: any case; `tutorials/batch/plant/apalutamide01_tablets`.

### Capital cost (CAPEX, equipment cost, bare-module cost, FCI)
* Computes: `pass:costing` prices every sized item that has a correlation
  (vessels, exchangers, columns, pumps and compressors, dryers ...) by the
  `key:Turton` bare-module method with your CEPCI; the fixed capital follows
  in `pass:economics`.
* Missing: a cost correlation for pharmaceutical machines (granulator,
  press, coating pan, packaging line): they are quotes.
* Witness: `tutorials/batch/plant/donepezil01_tablets` (`pack:design-cost`).

### Quotes (vendor price, installed cost, building cost)
* Computes: `key:quotes` in `pass:costing` enters your price for an item or a
  facility (installed or purchased with your own bare-module factor, scaled
  by a declared exponent if wanted).
* Checks: a quote needs its source; a quote on an item whose sizer refused
  stops the run.
* Witness: `tutorials/batch/plant/donepezil01_tablets`.

### Operating cost (OPEX, cost of manufacture, raw materials, utilities)
* Computes: `pass:economics`: raw materials from the prices you give in
  `constant/economics`, utilities from their records, labour, and the cost of
  manufacture; for a batch plant the year's flows come from the plan
  (`key:streamFactor` `fromBatchPlan`).
* Missing: waste treatment cost (it is zero in the cost of manufacture);
  a raw-material inlet you do not price is left out, so price every inlet.
* Witness: `tutorials/batch/plant/apalutamide01_tablets`.

### Labour (operators per shift, crew)
* Computes: Turton's operators per shift with its particulate-step term
  (`key:particulateSteps`), or a crew you declare by area
  (`key:operatingCrew`), priced by your wage.
* Missing: labour scheduled from the batch plan.
* Witness: `tutorials/batch/plant/donepezil01_tablets`.

### Profitability: NPV, IRR, payback, sensitivity (cash flow, tornado)
* Computes: `pass:economics`: discounted cash flow, NPV, IRR, discounted and
  simple payback, the cash flow table; `key:sensitivity` moves one declared
  input at a time (a tornado, not an uncertainty analysis); optional
  `key:land`, `key:financing`, start-up years.
* Also computes, each opt-in and declared with its source: a building cost
  from the GMP interior's room areas priced by grade (`key:buildings`), the
  operating and the NPV break-even capacity (`key:breakEven`), a royalty
  inside a declared patent window (`key:royalty`) and the working capital by
  three methods side by side (`key:workingCapitalMethods`).  Not computed:
  depreciation by asset class (straight line only).
* Witnesses: `tutorials/batch/plant/apalutamide01_tablets` (sensitivity),
  `tutorials/steady/economics/economics04_building_royalty_breakeven`,
  `tutorials/steady/economics/economics01_esterification_dcf`,
  `tutorials/steady/economics/economics03_startup_years`.

### Effluent (wastewater, cleaning effluent, waste)
* Computes: the effluent VOLUME of cleaning a year (`key:effluentFraction` in
  `key:cleaning` of `pass:batchPlan`).  Process effluent streams are ordinary
  outlet streams of the balance.
* Missing: the effluent load (COD, API content), any treatment unit and its
  cost.
* Witness: `tutorials/batch/plant/donepezil01_tablets`.

### API synthesis, crystallisation, isolation (batch reactor, filtration, centrifuge)
* Computes: in `choupoBatch`, `batchUnit:batchReactor` (kinetics, heat,
  dosing), `batchUnit:batchCrystalliser`, `batchUnit:batchStill`; steady
  `unit:crystalliser` and `unit:cstr`.
* Missing: a solid-liquid filter, filter press or centrifuge unit (use a
  `unit:splitter` and say it is a balance); coupling a `choupoBatch` recipe to
  the batch plan of a `choupoSolve` plant.
* Witnesses: `tutorials/batch/reactor/batch01_first_order`,
  `tutorials/batch/reactor/batch27_semibatch_dosing`,
  `tutorials/batch/crystallisation/batch13_nacl_pitzer`.

## 2. General process engineering (shorter)

| Concept (synonyms) | Computes | Where | Witness |
|---|---|---|---|
| Flash, phase split (VLE, LLE, bubble/dew point) | equilibrium split, duty | `unit:isothermalFlash`, `unit:adiabaticFlash`, `unit:bubbleT`, `unit:dewT` | `tutorials/steady/flash/flash01_benzene_toluene` |
| Petroleum fraction, TBP curve, pseudo-components (crude cuts, API gravity, Watson K) | a TBP curve cut into pseudo-components: Tb per cut (mid-point of the distilled interval), SG per cut by a declared method (constant Watson K, or declared), then MW, Tc, Pc, Vc, omega and Cp per cut by the Riazi-Daubert estimator; API gravity, SG and Watson K per cut and for the blend; one ESTIMATE record per cut written into the case (a proposal, never a standard record).  Checks: the re-blended cuts must reproduce the feed SG within a DECLARED tolerance (a miss is announced, not adjusted); fractions sum to 1.  One lump from (Tb, SG): `op:estimateComponent` with `model RiaziDaubert;`.  Missing: ASTM D86 / D1160 -> TBP conversion (refuses by name), API gravity and Watson K on the stream report, a crude-distillation reference case, kij for hydrocarbon gas pairs | `op:petroleumCuts`, `op:estimateComponent` | `tutorials/props/estimate/petroleumCuts01_riazi_table36_tbp`, `tutorials/props/estimate/estimate_petroleum_cut` |
| Specified flash (PH, PS, TV/F, PV/F; isentropic expansion, throttling, wet steam quality) | the equilibrium state at a (P, H), (P, S), (T, V/F) or (P, V/F) pair: T or P, vapour fraction, phases, H and S; a pure fluid inside its latent jump lands on the saturation plateau by the lever rule.  Checks: a specification no state meets inside the window is refused.  Missing: (T, H), (T, S), (U, V); the units (`unit:adiabaticFlash`, `unit:valve`, `unit:compressor`, `unit:turbine`) still run their own searches, and a turbine expands a single-phase vapour | `op:flashSpec` | `tutorials/props/thermo/flashSpec01_wet_steam_expansion` |
| Distillation (column, MESH, shortcut, Fenske-Underwood-Gilliland) | rigorous column; shortcut design; total reflux (`key:totalReflux`); tray Murphree efficiency computed from the tray geometry (`key:efficiency`: AIChE, ChanFair, SyedaChuang -- binary, under total reflux only); structured-packed bed at total reflux, HETP and pressure drop (`key:packing`: RochaBravoFair, Delft).  Missing: computed efficiency on a column with feeds and products; packed sections in a production column | `unit:distillationColumn`, `unit:shortcutColumn` | `tutorials/steady/distillation/column01_benzene_toluene`, `tutorials/steady/distillation/trayEfficiency01_yanagi14`, `tutorials/steady/distillation/packing03_schulz_delft_0p10bar` |
| Absorption, stripping, extraction | outlet compositions of the contactor.  Extraction: a Kremser shortcut CHECK beside the rigorous stage count, a column height from a DECLARED HETS, the package's LLE read against measured tie lines (`op:lleTieLines`), the shortcut on declared numbers (`op:extractionShortcut`).  Missing: packed / rotating-disc / pulsed / mixer-settler models, flooding and diameter, stage efficiency | `unit:absorber`, `unit:stripper`, `unit:extractor`, `op:lleTieLines`, `op:extractionShortcut` | `tutorials/steady/absorption/stripper01_NH3_water`, `tutorials/steady/absorption/extract03_acetic_acid_mibk_perry`, `tutorials/props/compare/lle01_acetic_mibk_perry` |
| Reactors (CSTR, PFR, conversion, equilibrium, Gibbs) | kinetics, equilibrium, adiabatic T | `unit:cstr`, `unit:pfr`, `unit:conversionReactor`, `unit:equilibriumReactor`, `unit:gibbsReactor` (`pack:reactors`) | `tutorials/steady/reactors/cstr01_first_order` |
| Heat exchange (heater, cooler, exchanger, condenser, pinch) | duty, outlet T, area when sized; pinch targets | `unit:heater`, `unit:heatExchanger` (`model BellDelaware;` rates the shell side by the Bell-Delaware method), `op:bellDelawareBench`, `unit:phaseChanger`, `pass:pinchPass` | `tutorials/steady/heat/heatExchanger01_water_water`, `tutorials/steady/heat/heatExchanger04_bell_delaware_rating`, `tutorials/steady/heat/pinch01_four_stream_classic` |
| Pumps, compressors, pipes (pressure drop, hydraulics) | shaft work, outlet state, friction loss | `unit:pump`, `unit:compressor`, `unit:pipe` (`pack:pressure`) | `tutorials/steady/hydraulics/pipe01_water_line` |
| Gas-solid (cyclone, bag filter, conveying) | collection efficiency, pressure drop | `unit:cyclone`, `unit:bagFilter`, `unit:pneumaticConveyor` | `tutorials/steady/gas-solid/bagFilter01_dust` |
| Particle-size distribution on one grid (sieve classes, PSD, d50, d80, Sauter mean, specific surface, blending powders) | every inlet's distribution put on the case's declared geometric grid (a fitted law integrated, a sieve table re-binned, mass exact and printed), blends class by class, d10/d50/d80/d90, Sauter d32 and S_v published per stream.  Checks: a grid leaving > 1 % of a powder above its top refused; two different grids refused.  Missing: one distribution per solid species (a multi-mineral feed is ONE material); the time-integrated binaries | `key:sizeGrid`, `unit:mixer` | `tutorials/steady/solids/psd01_grid_and_moments` |
| Size reduction (milling, grinding, comminution, ball mill, Bond work index, breakage) | a breakage population balance on the size grid: selection function `austin`, `herbstFuerstenau` (energy-specific) or `vogelPeukert` (impact, with a threshold), breakage function `austin`, plug flow or perfectly mixed; product distribution, T rise from the shaft work, Bond's energy printed beside.  Checks: mass closure per class printed; a feed off the grid, a rate law without a residence time, two energy specs refused.  Missing: residence-time distributions between the two limits other than two mixers in series (two perfectly mixed mills at half the power each), mill sizing and cost | `unit:mill` | `tutorials/steady/solids/mill01_limestone_herbstFuerstenau`, `tutorials/steady/solids/mill02_bond_crosscheck` |
| Classification of a powder or slurry on the size grid (screen, sieve, classifier, hydrocyclone, partition curve, cut size d50, bypass, imperfection, closed grinding circuit, circulating load) | one split every classifier performs, class by class (coarse = a_k f_k m_s, fine = the difference, so the products close exactly; a_k = R + (1 - R) c_k): partition curves `whiten`, `rosinRammler`, `tabulated`; `screen` model `karra` (King 2001 eqs. 4.30-4.48: the cloth, inclination and loading give the cut size and the area utilisation factor, no fitted parameter) or `declared`; `hydrocyclone` model `declared` (corrected curve and water split, Kelsall's bypass); `classifier` (a curve and a bypass); a closed circuit with the recycle of a size distribution carried by `directSubstitution`/`Wegstein`/`DominantEigenvalue`.  Checks: per-class closure printed (0); a feed off the grid, a dry hydrocyclone feed, a vapour-bearing fluid, a missing bypass or water split, and Newton-on-tears on a gridded tear refused by name.  Missing: the empirical hydrocyclone correlation of Nageswararao et al. (no source prints its constants), one distribution per solid species (every classifier splits ONE population), King's kinetic screen model, the time-integrated binaries, sizing and cost of a classifier | `unit:classifier`, `unit:screen`, `unit:hydrocyclone` | `tutorials/steady/solids/circuit01_herbstFuerstenau_closedCircuit`, `tutorials/steady/solids/hydrocyclone01_quartz_willsTable91`, `tutorials/steady/solids/screen01_dolomite_karra` |
| Solid-liquid separation of a slurry (cake filtration, rotary vacuum drum, filter press, washing a cake, thickener, settling test, Talmage-Fitch, Coe-Clevenger, sedimenting centrifuge, tubular bowl, disc stack, Sigma theory, cut size) | `cakeFilter`: the two-resistance law t/V = K_p V/2 + B (Geankoplis section 24.2), a compressible cake alpha = alpha0 dp^s, a continuous drum (area from the cycle time, or the reverse) or a cyclic press (filtration, washing and cycle times, presses required) on CYCLE-AVERAGED streams, the wash a real inlet and the spent wash a real outlet, washing laws `displacement` and `tabulated`; `thickener`: the area from the case's batch settling test, `talmageFitch` (the tangent at a DECLARED compression time) or `coeClevenger`, both printed; `sedimentingCentrifuge`: Sigma of a `tubularBowl` (equal-volume and Geankoplis half-layer cuts) or a `discStack`, cut size d50, Stokes' window enforced, a DERIVED grade efficiency per class on the size grid.  Checks: component mass closes exactly (every outlet the difference); a wash with solids or at another temperature, a settling test that rises, a compression time outside the test, a solid not denser than the liquid, Re >= 1 at the cut size and an undeclared liquid viscosity model refused by name.  Missing: a washing law with constants (none is printed in the sources in hand), constant-rate and centrifugal filtration, an enthalpy balance across the cake, a thickener's depth and compression zone, hindered settling and drive power in the centrifuge, sizing and cost, the time-integrated binaries | `unit:cakeFilter`, `unit:thickener`, `unit:sedimentingCentrifuge` | `tutorials/steady/solids/filter01_caco3_rotaryDrum`, `tutorials/steady/solids/filter02_caco3_pressWashing`, `tutorials/steady/solids/thickener01_settlingTest_talmageFitch`, `tutorials/steady/solids/centrifuge01_tubularBowl_geankoplis`, `tutorials/steady/solids/centrifuge02_discStack_sigmaIdentity` |
| Membranes (RO, NF, UF, diafiltration) | solution-diffusion and pore transport, polarisation | `unit:spiralWoundModule`, `batchUnit:batchDiafilter` | `tutorials/steady/membranes/membrane01_RO_NaCl_seawater` |
| Electrodialysis (ED stack, limiting current) | limiting current, multi-ion transport | `unit:electrodialysisStack`, `batchUnit:batchElectrodialysis` | `tutorials/steady/electrodialysis/ed01_nacl_desalination` |
| Adsorption, PSA, ion exchange (fixed-bed breakthrough, numerical dispersion, convection scheme) | swing cycle, loadings; a fixed bed's breakthrough front and pulse moments, with the scheme's own numerical dispersion announced (first-order upwind adds v dz/2; `vanLeer` removes it) | `unit:psa`, `unit:ionExchanger`, `batchUnit:fixedBedAdsorber`, `key:convectionScheme` | `tutorials/steady/separation/psa01_h2_psa`, `tutorials/batch/adsorber/batch29_pulse_two_schemes` |
| What does Choupo have for this pair or compound? (binary parameters, NRTL, UNIQUAC, UNIFAC, component record, CAS lookup, evidence for a pair) | ONE evidence card in at most 2048 bytes: the catalogue pair record as a paste-ready `source` entry, or Choupo's own regression with its case and verdict, or UNIFAC SAID to be an estimate, or "I do not have it" and what to bring; for a compound, which properties its record carries and which are missing (by name, alias or CAS), never the values.  Checks: it invents no number, and what the C16 chain will add (laboratories, archive hash, extraction filter) is listed as announced-absent.  Missing: the pairs only servable from the measurement archive (slice b) | `op:pairLookup`, `op:componentLookup` | `tutorials/props/molecular/pairLookup01_catalogue_ladder`, `tutorials/props/molecular/componentLookup01_catalogue_ladder` |
| Property bench (phase diagrams, steam tables, psychrometry, parameter fitting) | properties, envelopes, fits | `op:phaseEnvelope`, `op:steamTables`, `op:psychrometricChart`, `op:fitParameters`, `op:speciate` | `tutorials/props/steam/steam01_if97_verification`, `tutorials/props/heat/psychro01_n2_water` |
| Reference (multiparameter Helmholtz) equations of state: water IAPWS-95, CO2 Span-Wagner, N2 Span et al., CH4 Setzmann-Wagner | rho, h, s, cp, cv, w, fugacity coefficient at (T, p) or (T, rho), saturation by Maxwell; every published check value reproduced at load.  A flowsheet reaches one through `pureFluids { <component> { method Helmholtz; equation <name>; } }` (a phase effectively pure in it).  Missing: mixtures (GERG-2008), H2 and NH3, transport | `op:referenceEoS` | `tutorials/props/thermo/refEoS01_iapws95_verification` |
| Process control (PID, step response, loops) | closed-loop dynamics | `dynUnit:dynamicCSTR`, `controller:PID` | `tutorials/ctrl/ctrl01_cstr_temp_control` |
| Dynamics without control (start-up, feed and bleed) | transients of connected units | `dynUnit:quasiSteady`, `dynUnit:dynamicTank` | `tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup` |
| Recycles (tear streams) | converged recycle; `recycleSolver` Newton, Wegstein or the opt-in dominant-eigenvalue extrapolation (announced, with fallbacks) | `pack:recycles`, `key:recycleSolver`, `key:recycleDELambdaMax` | `tutorials/plant/hda` |

The full list of unit operations, with their keys, is
`docs/ai/unit-ops.md`.  The catalogue of thermodynamic and property models is
https://www.choupo.org/llm/models.md; it describes the stable release it names
in its first lines, not the development line, so a model added since may be
missing from it (check `docs/ai/thermo.md`).
