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
  mass and the stage time of the batch plan; optionally (DEV.md 4c C270) on
  the formulation's minimum DWELL TIME (`key:dwell`: the speed capped at
  L/(pi D t_min), the lower capacity used), a declared OEE
  (`key:effectiveness`), and the COMPACTION PRESSURE and punch force a
  target tensile strength needs, from fitted Heckel and Ryshkewitch-Duckworth
  constants (`key:compaction`, one material).  Witness
  `tutorials/batch/plant/tabletPress01_dwell_and_force`.
* Computes (on ONE material, outside the plant): `op:compactionFit` fits the
  Heckel, Kawakita and Ryshkewitch-Duckworth models to compaction data you
  supply, on the linear region you declare, with standard errors.  Witnesses
  `tutorials/props/powder/compaction01_mcc` and
  `tutorials/props/powder/compaction02_dcpd_brittle`.
* Missing: a physical press unit in the FLOWSHEET (the press there is a
  mass split; the sizer's compaction check inverts declared fitted curves and
  predicts no hardness beyond them); any mixing rule for the compaction
  parameters of a blend; any prediction of the minimum dwell a powder needs.
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
* Seen in the GUI: the Panel view (read-only: number, bar, trend, lamp at a
  time cursor, limits drawn, colour only for an alarm the engine reports, the
  facts as written; `?panel=` pop-out; User Guide `sec:panelWorkspace`).
* Missing: editing it in the GUI (a later slice), a draft tool, the driver binaries
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
* THE LINE LIST (`key:lineDesign` in `system/layoutDict`): one sized
  specification per ROUTED PROCESS pipe -- service (liquid discharge, liquid
  suction before a pump, gas, steam, two-phase), nominal size and schedule
  from the case's own size table (Perry Table 10-22 in the shipped cases) and
  the wall of ASME B31.3 Eq. 5.8, velocity against the service window
  (Towler and Sinnott s5.6), the sonic fraction and a declared rho v^2
  erosion limit, Darcy-Weisbach drop with the route's bends and the declared
  valves as equivalent lengths plus the static head, and a cost from prices
  the case declares.  Written to `design/lines/<stream>` and
  `reports/lines/lineList.csv`.  Every rule is a declared block with its
  `source` and `reason` (`origin assumed` where no book in the literature
  folder gives it); a two-phase line is listed not sized.
* THE NOZZLE SCHEDULE (`key:nozzleDesign` in `system/layoutDict`, beside
  `lineDesign`): every placed item's equipment sheet gains a `nozzles {}` block --
  one row per line that ends on it (mark, service, stream, line, nominal size =
  the line's or the item's own criterion with a reducer printed, flange class and
  facing from the case's pressure-temperature table per material (Perry Table
  10-42 in the shipped cases), orientation, design P and T) and the manways or
  inspection openings by the case's rule per equipment kind (Towler and Sinnott
  p. 714, p. 1062).  Nothing defaulted; a material with no table is NOT RATED.
* Missing: utility-line sizing, the two-phase drop, nozzle entrance and exit
  losses, the pump a line needs, steam and nitrogen lines, structures; no
  spacing or zoning table is shipped (every distance is the case's).
* Witnesses: `tutorials/plant/aceticAcid02_plant`,
  `tutorials/plant/greenAmmoniaPEQ_baseCase` (the utility lines and its 24
  process lines' line list), `tutorials/plant/line01_pumped_drum` (the
  smallest line list, one line worked by hand),
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
* Prices print with their origin (C389): each priced stream and the labour
  rate appear in the run's "Prices and where they came from" table, in
  `reports/economics/prices.csv` and in the GUI Reports view, with the case's
  `provenance { origin "..."; kind published|quote|assumption; }` (labour:
  `labourProvenance { }`).  A stream price with no `origin` is refused by name;
  an absent `kind` prints `undeclared`.  Theory Guide, `par:price-origin`.
* Missing: waste treatment cost (it is zero in the cost of manufacture);
  a raw-material inlet you do not price is left out, so price every inlet.
* Witness: `tutorials/batch/plant/apalutamide01_tablets`.

### Labour (operators per shift, crew)
* Computes: Turton's operators per shift with its particulate-step term
  (`key:particulateSteps`), or a crew you declare by area
  (`key:operatingCrew`), priced by your wage, with the shift cover (default
  4.5, round the clock) a declared judgement (`key:operatorCover`).
* Missing: labour scheduled from the batch plan.
* Witness: `tutorials/batch/plant/donepezil01_tablets`.

### Profitability: NPV, IRR, payback, sensitivity (cash flow, tornado)
* Computes: `pass:economics`: discounted cash flow, NPV, IRR, discounted and
  simple payback, the cash flow table; `key:sensitivity` moves one declared
  input at a time (a tornado, not an uncertainty analysis); optional
  `key:land`, `key:financing`, start-up years.
* Also computes, each opt-in and declared with its source: a building cost
  from the GMP interior's room areas priced by grade (`key:buildings`), the
  operating and the NPV break-even capacity and, per priced stream, the
  price at which NPV = 0 (`key:breakEven`), a royalty
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
| Where a unit's liquid properties come from (liquid density source, which density did the pump use, two densities for one liquid, bypassing the property kernel) | Checks: every run prints, per unit, the liquid density, viscosity, surface tension or diffusivity it took, the number and the state, and whether the property kernel or the unit itself supplied it; two units that price one liquid state at two densities are named (`[twice]`).  It changes no number.  Missing: a measured density, a solution-density correlation (see `docs/ai/thermophysical-properties.md`); a per-unit property choice is a named variant (next row) | `unit:pump`, `unit:storageTank`, `unit:spiralWoundModule` | `tutorials/plant/aceticAcid02_plant`, `tutorials/steady/membranes/membrane27_swro_energy_recovery` |
| A case that references the catalogue instead of carrying copies of its records (pins, which record was this case run against, a catalogue edit and the cases it reaches, a record that has changed since, a local variation of a catalogue record, an ion kept as a component over an atom, a frozen copy to send to a collaborator, runCase --strict) | Declares: `key:pins` in `constant/propertyManifest`, one line per catalogue record the run CONSUMED, valued by its computational hash, plus one `relevant:<hash>` line per scanned registry directory (the sorted relevant names that exist, so a relevant arrival is detected and an unrelated edit is not), written by the importer's --pin option from an observed run; a local record with a catalogue homonym declares `key:overlayOf`, `key:variationOf` or `key:distinctFrom` with `key:variationReason`. Checks: the result's seal verdict is `pinned` or `drifted` (changed, vanished, unpinned), announced, refused under `CHOUPO_PINS=refuse` / `runCase --strict` / `key:onDivergence refuse;`; the declaration is checked against the formula with charge, `charge` and `CAS`; the importer's --repin option follows a catalogue edit in every case that pins it; its --seal --to option exports a sealed copy. Missing: a component declared FROM a species (an ion is still a local component with `distinctFrom`); the corpus still carries copies until the flip of every case | `tutorials/steady/flash/flash01_benzene_toluene` |
| One property dictionary with named variants (per-unit property choice, a different viscosity law for one unit, which law did this unit use, resolved view, property package per unit) | Declares: `variants {}` in `constant/thermoPhysPropDict`, each variant only what differs from the case's system; a unit or a props operation selects one with `thermo <name>;`; the property block inside `transport` is what a variant replaces.  Checks: before the solve every run prints the RESOLVED VIEW -- per property, where the choice was made and which law, mixing rule and interaction pairs run.  Missing: tables, and a variant that carries its own `volumetric` block (later slices of C398) | `key:variants`, `key:thermo`, `op:propertyPoint`, `unit:pipe` | `tutorials/steady/thermo/variants01_ethanol_water_line` |
| Several laws for one property in a record (two viscosity fits, the IAPWS vapour pressure beside Antoine, which law did this component use, pin one component's law, a mixture no single model word can price, the units of a law's coefficients) | Declares: named laws inside a record's property block with `preferred <name>;`, each law's soft window (its type's `Trange` / `Tmin` `Tmax`) and an optional hard `domain (lo hi);`; a property block in `transport` with NO model word (each constituent on its record's preferred law); a case pin `pin ( { component; law; reason; } );` beside the property (`transport.liquid.*`, `transport.interface.surfaceTension`, `equilibrium.vaporPressure`, `caloric.<record block>`).  Checks: the law is chosen once per constituent and printed in the resolved view with who chose it, its window and its type's form with coefficient units; outside its soft window the law is announced, and `domain` (a hard window) is refused by the grammar (not supported yet); a pin of a law the record does not hold is refused, listing its laws; every law's `check {}` value is read back through the law (gate check_record_law_values); a record types no derived quantity (gate check_record_primitives).  Missing: the IAPWS law in the catalogue's water record (a later campaign), check values for most laws (a pinned debt) | `key:pin`, `key:preferred`, `op:propertyPoint` | `tutorials/props/transport/purelaws01_methanol_isopropanol_water`, `tutorials/props/thermo/purelaws02_water_two_vapour_pressure_laws` |
| Liquid diffusivity of a mixture (a column's liquid film, infinite dilution in a named solvent, a measured diffusivity, Vignes or a linear rule, a paper's liquid viscosity for the run) | Computes: the infinite-dilution value of a named solute in a named solvent (Wilke-Chang, or a declared entry from an experiments file used inside its box) and, with `returns effective`, the value of a BINARY liquid by a declared rule (CaldwellBabb, Vignes, LefflerCullinan, AndersonBabb), the thermodynamic factor taken as 1; for three components or more, `VignesKooijmanTaylor` (Kooijman & Taylor 1991 Eq. 23, the pair values) reduced by `Wilke` (Taylor & Krishna 1993 Eq. 6.1.14) to one effective diffusivity per component, with the pair values, the thermodynamic-factor matrix and the Fick matrix as props quantities (`D_L_effective_<c>`, `D_L_MS_<i>_<j>`, `Gamma_<i>_<j>`, `D_L_Fick_<i>_<j>`, `D_G_effective_<c>`).  Declares: `key:returns`, `key:composition`, `key:infiniteDilution`, `key:reduction`, `key:thermodynamicFactor` in `transport.liquid.diffusivity`; a stated mixture viscosity `key:measured` in `transport.liquid.viscosity` (one point with a hard box, its reason and its `basis`; the set is part of the box).  Checks: an entry's file is refused when it names the other direction, has a column without a unit or more than one point; a column refuses a property typed in its own blocks, at any depth; the default Wilke-Chang refuses water as the solute (an entry names it with its reason).  Missing: a multicomponent form of the four binary rules (refused, none read), a column that reads the per-component value (C329 slice B2b), a liquid Maxwell-Stefan film, tables of diffusivities (slice (c)) | `key:returns`, `key:measured`, `op:propertyPoint` | `tutorials/props/transport/liquidDiffusivity01_pelkonen_ternary`, `tutorials/props/transport/liquidDiffusivity02_kooijmanTaylor_ternary`, `tutorials/steady/distillation/ratebased01_schulz_0p10bar` |
| A property given as measured points (a table instead of a correlation, my own laboratory data, interpolate a viscosity table, a heat-capacity table, data at a few temperatures, what happens outside the data) | Declares: a law of type `table` -- in a record as a named law (`model table; interpolation; columns; data;`, source in the provenance block) or the case's own points in `constant/experiments/<name>.dat` cited by a pin `pin ( { component; table <name>; interpolation <word>; reason; } );`, optionally with `extend { upTo; downTo; reason; }`; for `liquidViscosity`, `liquidHeatCapacity`, `solidHeatCapacity`.  Computes: the declared interpolant (`linear`, `logLinear`, `logReciprocal`, `monotoneCubic`) between the points; for a heat capacity, H and S as its closed-form integrals from 298.15 K.  Checks: every column has a unit (converted and dimension-checked; `degC` allowed for T, a per-mass Cp converted with the molar mass); minimum points; strictly increasing T; the points are a HARD domain -- outside them the table refuses every evaluation, answer or trial state, by name; a declared extension is announced; a Cp table must contain 298.15 K.  Missing: an ideal-gas Cp table (refused, addendum A2(v)), a vapour-pressure table, 2-D tables of a pure component, a CSV file (a MIXTURE table over T and composition is the next row) | `key:table`, `key:interpolation`, `key:extend`, `op:propertyPoint`, `op:flashSpec` | `tutorials/props/transport/table01_water_viscosity_points`, `tutorials/props/heat/table02_water_liquid_cp_points`, `tutorials/props/heat/table03_trial_state_refused`, `tutorials/steady/flowsheets/table05_sector_table_pins` |
| A liquid MIXTURE property given as measured rows over temperature and composition (a table of viscosity, thermal conductivity or surface tension against T and mass fraction, my own laboratory data for a syrup, a binary mixture, an authorised range, interpolate between rows, what happens past the data, a stated value that is not a measurement, components the table ignores) | Declares: `transport { liquid { viscosity { measured { <name> { use method; interpolation ( ... ); } } } } }` (likewise `thermalConductivity`, and `interface { surfaceTension }`) citing `constant/experiments/<name>.dat`: columns `T`, `w[<c>]` (mass fractions), an optional stated `P`, the value (`mu`, `lambda`, `sigma`); a RECTANGULAR GRID of rows; `provenance { kind measured \| adopted \| estimated; }` (required beside many rows); `box { ... }` or `authorised { ... }` with a `reason` when wider than the rows; `ignores ( ... ); ignoresReason; ignoresUpTo`.  Computes: the declared interpolation (`linear`, `logLinear`, `logReciprocal`, `monotoneCubic`) one axis at a time in the order of the columns; a row returns its own value; between the rows' support and the authorised box the nearest edge's value is held and the largest excursion announced and restated at the end of the run; the origin is `literature` on a row, `derived` between rows, `assumed` when held or `adopted`.  Checks: outside the authorised box the run refuses by name; a scattered set, `box` and `authorised` together, many rows without `kind` or `interpolation`, a wrong word count, a log word on a composition axis, a box narrower than the rows, a wider box without a reason and `ignores` without its bound each refuse by name; a liquid holding an ignored component beyond its bound refuses.  Missing: pressure as an axis, the liquid density (its own `measured` point), a scattered set, a flow curve, a material, a vapour table.  Theory Guide `sec:measured-mixture-table` | `key:measured`, `key:interpolation`, `key:authorised`, `key:kind`, `key:ignores`, `op:propertyPoint`, `unit:pipe` | `tutorials/props/transport/measured01_methanol_glycol_viscosity_grid`, `tutorials/props/transport/measured02_ethanol_water_surface_tension_grid`, `tutorials/steady/hydraulics/pipe03_sucrose_syrup_measured` |
| A liquid whose viscosity depends on the shear rate (a polymer solution, a slurry, a melt: my rheometer's flow curve, power law, Herschel-Bulkley, yield stress, apparent viscosity at a shear) | Declares: `transport { liquid { rheology { measured { <name> { use method; interpolation logLog \| linear; reason; fit { model powerLaw \| Bingham \| HerschelBulkley; } } } } } }` citing `constant/experiments/<name>.dat` (`property flowCurve`; `conditions { instrument; corrected ( ... ); T; w }`; columns two of `gamma`, `tau`, `mu`; `yieldStress { value; how; }`; `authorised`).  Computes: the door's form 3, `apparentViscosity(thermo, T, P, x, shear)` with the shear the UNIT supplies (a rate or a stress), from the rows (declared interpolation) or from a DERIVED fit (printed, nothing stored); the end chord between the support and the authorised domain, announced.  Checks: readings without the instrument and its corrections are refused as a flow curve, naming the correction missing; a falling stress branch; `timeDependent yes`; outside the authorised domain or the T/composition box; a Newtonian viscosity asked of such a liquid; a Bingham or Herschel-Bulkley fit without the yield-stress datum.  Missing: temperature dependence of the curve (it is one state), time-dependent and viscoelastic fluids, a suspension viscosity-concentration law.  Theory Guide `sec:flow-curve` | `key:rheology`, `key:measured`, `key:fit`, `key:yieldStress`, `key:corrected`, `unit:pipe` | `tutorials/steady/hydraulics/pipe04_powerlaw_polymer_solution`, `tutorials/steady/hydraulics/pipe05_herschelbulkley_clay_slurry` |
| A non-Newtonian liquid in a pipe (laminar pressure drop of a power-law, Bingham or Herschel-Bulkley liquid, generalised Reynolds number, transition, turbulent non-Newtonian flow) | Declares: the liquid's flow curve (row above); `operation { turbulent { method DodgeMetzner; } }` for turbulent flow.  Computes: the wall stress from the curve (eq. 3.46), `dP = 4 tau_w L/D` + fittings + elevation, `n'`, `Re_MR`, the effective viscosity, the share of the flow standing on the chord below the lowest row.  Checks: refuses `Re_MR >= 2100` unless a turbulent method is declared; Dodge-Metzner refused outside its data (`2900 <= Re_MR <= 36000`, `0.36 <= n' <= 1`); a viscoelastic liquid past the laminar limit.  Missing: Bingham/Slatter transition criteria, Tomita and Darby turbulent methods, non-circular ducts, pump de-rating.  Theory Guide `sec:pipe-nonnewtonian` | `unit:pipe`, `key:turbulent` | `tutorials/steady/hydraulics/pipe04_powerlaw_polymer_solution`, `tutorials/steady/hydraulics/pipe05_herschelbulkley_clay_slurry` |
| Agitation power of a stirred vessel (impeller power, power number, Reynolds number of mixing, Metzner-Otto average shear rate, helical ribbon, non-Newtonian mixing, shaft work in the energy balance) | Declares: `unit:agitatedVessel` with `operation { vessel { D_T }; impeller { record <name>; tipSpeed \| N; } }`; the impeller as an asset record of `kind impeller` (`key:shearConstant`, `key:laminarPower`); the liquid's flow curve.  Computes: `gamma_avg = k_s N`, `mu_app` from the door, `Re`, `Po`, `P = K_p mu_app N^2 D^3` (laminar), the printed power interval from `k_s`'s and `K_p`'s stated uncertainties, the shaft power as the Work item `W_shaft_kW` and the jacket's duty.  Checks: refuses a yield-stress, shear-thickening, viscoelastic or time-dependent fluid, a transitional `Re`, the laminar relation past its line, a geometry outside eq. 8.7's data unless declared a hypothesis.  Missing: a power CURVE table, the cavern model for yield-stress fluids, mixing time, heat transfer in the vessel, an agitator on the `cstr`.  Theory Guide `sec:agitated-vessel` | `unit:agitatedVessel`, `key:shearConstant`, `key:laminarPower`, `key:outsideCorrelationWindow` | `tutorials/steady/hydraulics/agitation01_helical_ribbon_polymer_melt` |
| Which reactions make and destroy each species (rate of production, a mechanism's reaction contributions, which step makes H or OH, gross and net production, the shares of a species' sources, ignition chemistry) | Computes: at the instants a `batchUnit:batchReactor` lists in `rateOfProduction { times ( ... ); top N; }` (`key:rateOfProduction`), per species the net rate, the gross production and consumption and the top reactions with their share, `c_ij = nu_ij r_j V` in kmol/s, and the whole matrix in `rateOfProduction.csv`; the sum over reactions equals the integrator's dn/dt.  Element path flux: with `pathFlux ( H O );` in the same block (`key:pathFlux`), the atoms of each element from each reactant to each product of every reaction (`f_AB = |r_j| V (nu' a)_A (nu'' a)_B / N_ej`), the net species-to-species paths printed (top N, share, leading reaction), `pathFlux.csv` and one Graphviz `.dot` per element and instant; atoms in minus out of a species equal a_ei times its net rate (Theory Guide `sec:path-flux`).  Missing: mechanism reduction, a rendered diagram in the GUI | `batchUnit:batchReactor` | `tutorials/batch/combustion/ignition01_h2o2_rop` |
| Which reaction governs an ignition (ignition-delay sensitivity, normalised sensitivity coefficient, d ln tau / d ln k, which reaction to change to shorten or lengthen the delay, chain branching versus termination) | Computes: with `sensitivity { response tauIgnition; factor 1.1; reactions all; top N; }` (`key:sensitivity`) on an adiabatic `batchUnit:batchReactor` (Rosenbrock23 or Rodas4), N+1 brute-force integrations, one per reaction with its NET rate (forward and reverse together) multiplied by `factor`; `S_j = d ln tau / d ln k_j`, tau the time T first exceeds T0 + `rise` (interpolated between accepted states); a table sorted by \|S\|, `sensitivity.csv` with every reaction and its final temperature, KPIs `sens_tau0` and `sens_S_<reaction>` for the top N; agrees with Cantera 3.2.0 (its rate multiplier) to 2e-5 in S on the O Conaire H2/air mechanism (Theory Guide `sec:ignition-sensitivity`).  Missing: other responses (peak T, species), adjoint and direct methods, a constant-pressure witness | `batchUnit:batchReactor` | `tutorials/batch/combustion/ignition04_h2air_sensitivity` |
| Analytic Jacobian of a reaction mechanism (stiff kinetics faster, Jacobian of the rate laws, derivative of a rate, third-body and fall-off derivatives, how expensive is the finite-difference Jacobian, is the analytic Jacobian right) | Computes: by DEFAULT on a `batchUnit:batchReactor` whose every law has a derivative (`key:jacobian` `analytic` forces it, `finiteDifference` selects the difference), Rosenbrock23 and Rodas4 build `W = I - h d J` from the rate laws' derivatives in closed form -- mass action, third body, Lindemann and Troe exactly in [M] and T, PLOG (dk/dT, dk/dP), detailed-balance reverse with d ln Kc/dT from h(T), the energy row and the T column by the chain rule on every energy basis (`gasConstantP` as a rank-one term), LHHW / expression by a per-reaction difference; the claim is AUDITED against a central difference at analytic Jacobians 1, 2, 4, 8, ... and a false column refuses the run by name (Theory Guide `sec:batch-analytic-jacobian`).  Checks: the audit, every run.  Missing: dCp/dT is a central difference of the record's law; sensitivity coefficients by a direct or adjoint method | `batchUnit:batchReactor` | `tutorials/batch/combustion/ignition01_h2o2_jac` |
| Sparse linear algebra for a large mechanism (hundreds to a thousand species, the cost of the LU, a sparse Jacobian, fill-reducing ordering, minimum degree, why is a big mechanism slow) | Declares: `solver { linearSolver sparse | auto | dense; }` (`key:linearSolver`) on a `batchUnit:batchReactor` with the analytic Jacobian.  Computes: W = I - h d J factored on the network's pattern by the in-house SparseLU -- minimum-degree ordering (dense nodes last) and symbolic factorisation once, left-looking numeric factorisation with row equilibration each step, each factor accepted on its measured backward error (else refactored dense), a constant-P gas's rank-one term by Sherman-Morrison; `auto` = sparse from 100 rows, measured: 7.3x fewer multiply-adds and 5.8x less linear-algebra time on AramcoMech 1.3 (254 rows), break-even near 100 rows on random networks (Theory Guide `sec:sparse-lu`).  Checks: test/sparse_lu.cpp against the dense LU; sparse = dense on the combustion tutorials with no dense refactorisation.  Missing: a real large mechanism compared with Cantera (AramcoMech 1.3 was TIMED only, 41 of 1542 reactions dropped); sparse factoring in an adaptive sweep of several units; a threaded right-hand side | `batchUnit:batchReactor` | `tutorials/batch/combustion/ignition03_h2air_constp` |
| Adiabatic gas reactor at constant pressure (an ideal-gas cell at fixed P, OpenFOAM's chemistry cell, constant-pressure ignition, constant-P versus constant-V, volume that follows the reaction, expansion work) | Declares: `operation { mode adiabatic; energy gasConstantP; }` on a `batchUnit:batchReactor`, the holdup with T, P and the inventory and NO `V`.  Computes: dH = 0, dT/dt = -sum h_i ndot_i / sum n_i Cp_i with h_i the ideal-gas enthalpy on the formation datum, and V = n R T / P at every state (time directories and reports carry it); witnessed against Cantera's IdealGasConstPressureReactor on the real LLNL H2 mechanism (tau equal, T_final to 1 mK) (Theory Guide `sec:batch-gas-constp`).  Checks: a declared V that disagrees with n R T / P is refused by name.  The analytic Jacobian covers it (V = nRT/P, a rank-one term).  Missing: the adiabatic energy ledger, a non-ideal gas | `batchUnit:batchReactor` | `tutorials/batch/combustion/ignition03_h2air_constp` |
| Pressure-dependent reaction rates (PLOG, a rate constant that depends on pressure, CHEMKIN PLOG table, k(T,P), pyrolysis mechanism, fall-off alternative) | Computes: `kinetics { type plog; plog ( { P 1 atm; A; b; Ea; } ... ); }` (`key:plog`), the CHEMKIN-II table of modified Arrhenius laws: k_i(T) at each tabulated pressure, ln k linear in ln P between two, the end value (no extrapolation) outside the table, lines at one pressure summed, detailed-balance reverse for `reversible true` (Theory Guide `sec:plog-rate`); read by `unit:pfr` and `unit:cstr` at the bed / feed pressure and by `batchUnit:batchReactor` at P = nRT/V of the closed gas (`energy gasConstantV`, the rising pressure, or `gasConstantP`, the fixed one).  Checks: a vessel with no pressure (a liquid batch vessel, `dynUnit:dynamicCSTR`, a feed with no P) refuses it by name; `thirdBody`/`low`/`troe` on it, and a PLOG with a CHEMKIN REV line in the importer, are refused.  Missing: a PLOG law in `dynUnit:dynamicCSTR`, Chebyshev (CHEB) and SRI forms, PLOG in a liquid-phase reactor | `unit:pfr`, `unit:cstr`, `batchUnit:batchReactor` | `tutorials/steady/reactors/plog03_midway`, `tutorials/steady/reactors/plog04_sameP` |
| Steam cracking of ethane, molecular reaction scheme (ethylene yield, cracking coil, Sundaram Froment, pyrolysis of ethane, olefins) | Computes: the five-reaction Model III of Sundaram & Froment 1977 (C2H6 <=> C2H4+H2, 2 C2H6 -> C3H8+CH4, C3H6 <=> C2H2+CH4, C2H2+C2H4 -> C4H6, C2H4+C2H6 -> C3H6+CH4) as `type Arrhenius` laws with reverse legs k_f/K_C, isothermal at the reference temperature, in a chain of `pfr` segments (the `pfr` holds Q at the feed value; each segment re-prices it) (Theory Guide `sec:cracking-molecular`).  Checks: ethylene and hydrogen yields at the published conversion inside the declared band; methane, propylene and butadiene do NOT reproduce Table VIII (-29, -59, +93 %), the same as an independent integration of the printed scheme.  Missing: a `pfr` that re-prices Q along the bed, a declared wall heat-flux or temperature and pressure profile (the paper's industrial coil), propane cracking and mixtures | `unit:pfr` | `tutorials/steady/reactors/cracking01_ethane_sundaram_froment` |
| Flash, phase split (VLE, LLE, bubble/dew point) | equilibrium split, duty | `unit:isothermalFlash`, `unit:adiabaticFlash`, `unit:bubbleT`, `unit:dewT` | `tutorials/steady/flash/flash01_benzene_toluene` |
| Petroleum fraction, TBP curve, pseudo-components (crude cuts, API gravity, Watson K) | a TBP curve cut into pseudo-components: Tb per cut (mid-point of the distilled interval), SG per cut by a declared method (constant Watson K, or declared), then MW, Tc, Pc, Vc, omega and Cp per cut by the Riazi-Daubert estimator; API gravity, SG and Watson K per cut and for the blend; one ESTIMATE record per cut written into the case (a proposal, never a standard record).  Checks: the re-blended cuts must reproduce the feed SG within a DECLARED tolerance (a miss is announced, not adjusted); fractions sum to 1.  One lump from (Tb, SG): `op:estimateComponent` with `model RiaziDaubert;`.  Missing: ASTM D86 / D1160 -> TBP conversion (refuses by name), API gravity and Watson K on the stream report, a crude-distillation reference case, kij for hydrocarbon gas pairs | `op:petroleumCuts`, `op:estimateComponent` | `tutorials/props/estimate/petroleumCuts01_riazi_table36_tbp`, `tutorials/props/estimate/estimate_petroleum_cut` |
| Specified flash (PH, PS, TV/F, PV/F; isentropic expansion, throttling, wet steam quality) | the equilibrium state at a (P, H), (P, S), (T, V/F) or (P, V/F) pair: T or P, vapour fraction, phases, H and S; a pure fluid inside its latent jump lands on the saturation plateau by the lever rule.  Checks: a specification no state meets inside the window is refused.  Missing: (T, H), (T, S), (U, V); the units (`unit:adiabaticFlash`, `unit:valve`, `unit:compressor`, `unit:turbine`) still run their own searches, and a turbine expands a single-phase vapour | `op:flashSpec` | `tutorials/props/thermo/flashSpec01_wet_steam_expansion` |
| Distillation (column, MESH, shortcut, Fenske-Underwood-Gilliland) | rigorous column; shortcut design; total reflux (`key:totalReflux`); tray Murphree efficiency computed from the tray geometry (`key:efficiency`: AIChE, ChanFair, SyedaChuang -- binary, under total reflux only); structured-packed bed at total reflux, HETP and pressure drop (`key:packing`: RochaBravoFair, Delft); the same bed as rate-based (non-equilibrium) segments, two films and the interface energy balance (`model rateBased;`, binary, total reflux; `key:segments`); the packing as an asset record (`key:record`, kind packing: nominal geometry from the record, `key:installed` values measured on the bed, `key:borrowed` values of another packing, each printed; a field the correlation reads and nothing supplies refused by name).  Missing: computed efficiency on a column with feeds and products; packed sections in a production column; a rate-based tray, feed or multicomponent column | `unit:distillationColumn`, `unit:shortcutColumn` | `tutorials/steady/distillation/column01_benzene_toluene`, `tutorials/steady/distillation/trayEfficiency01_yanagi14`, `tutorials/steady/distillation/packing03_schulz_delft_0p10bar`, `tutorials/steady/distillation/ratebased01_schulz_0p10bar`, `tutorials/steady/distillation/packing05_schulz_record_0p10bar` |
| Absorption, stripping, extraction | outlet compositions of the contactor.  Film and overall mass-transfer coefficients, Henry's-law constants in their many forms, and the enhancement factor of a reaction in the liquid film are taught by the EduTool `one-flux-many-units` (page arithmetic on cited textbook formulas; the engine's absorbers do not use film coefficients).  Extraction: a Kremser shortcut CHECK beside the rigorous stage count, a column height from a DECLARED HETS, the package's LLE read against measured tie lines (`op:lleTieLines`), the shortcut on declared numbers (`op:extractionShortcut`).  Missing: packed / rotating-disc / pulsed / mixer-settler models, flooding and diameter, stage efficiency | `unit:absorber`, `unit:stripper`, `unit:extractor`, `op:lleTieLines`, `op:extractionShortcut` | `tutorials/steady/absorption/stripper01_NH3_water`, `tutorials/steady/absorption/extract03_acetic_acid_mibk_perry`, `tutorials/props/compare/lle01_acetic_mibk_perry` |
| Reactors (CSTR, PFR, conversion, equilibrium, Gibbs) | kinetics, equilibrium, adiabatic T | `unit:cstr`, `unit:pfr`, `unit:conversionReactor`, `unit:equilibriumReactor`, `unit:gibbsReactor` (`pack:reactors`) | `tutorials/steady/reactors/cstr01_first_order` |
| Heat exchange (heater, cooler, exchanger, condenser, pinch) | duty, outlet T, area when sized; pinch targets | `unit:heater`, `unit:heatExchanger` (`model BellDelaware;` rates the shell side by the Bell-Delaware method), `op:bellDelawareBench`, `unit:phaseChanger`, `pass:pinchPass` | `tutorials/steady/heat/heatExchanger01_water_water`, `tutorials/steady/heat/heatExchanger04_bell_delaware_rating`, `tutorials/steady/heat/pinch01_four_stream_classic` |
| Pumps, compressors, pipes (pressure drop, hydraulics) | shaft work, outlet state, friction loss.  The EduTool `compression` teaches the work, the efficiencies, the discharge-temperature limit on one stage, staging with intercooling (equal ratios derived) and the real-gas Z and exponent, on the engine's staged compressor design (page arithmetic on cited Brown 2005 formulas, anchored to the sheet's section 1) | `unit:pump`, `unit:compressor`, `unit:pipe` (`pack:pressure`) | `tutorials/steady/hydraulics/pipe01_water_line` |
| Choosing a centrifugal pump (specific speed, expected efficiency, NPSH required and available, NPSH margin, preferred operating range, a manufacturer's characteristic curve) | Declares: `unit:pump` with `efficiency estimated;` + `selection { speed; impeller \| suctionSpecificSpeed; Qbep; preferredRange; }` + `suction { staticHead; lineLoss; inletVelocity; }` (level 1: every number `estimated`, Gülich 4th ed. equations T3.4.15, T3.9.1, T3.9.10, 6.7, T2.2.8, Table 6.2, Sect. 10.9, each at its page), or `curve <name>;` reading `constant/experiments/<name>.dat` (`property pumpCurve`; columns Q, H, eta, NPSHr; level 2).  Computes: nq, the efficiency and its band, NPSH3, NPSHA from the inlet stream, F_NPSH against max(1.25 NPSH3, NPSH3 + 0.6 m), q* in the preferred range, the shaft power from that efficiency; on a curve the head, efficiency and NPSHr at the flow.  Checks: a duty outside Q >= 0.005 m3/s or 10 <= nq <= 100, a flow outside the curve's rows, `eta` beside `efficiency estimated`, a spec beside a curve: refused by name.  Missing: part-load efficiency and NPSH off the BEP, semi-axial and multistage pumps, viscosity and speed correction of a curve, the tip-speed NPSHA rule.  Theory Guide `sec:pump-selection` | `unit:pump`, `key:efficiency`, `key:selection`, `key:curve`, `key:suction` | `tutorials/steady/rotating/pump03_generic_selection`, `tutorials/steady/rotating/pump04_manufacturer_curve` |
| Gas-solid (cyclone, bag filter, conveying) | collection efficiency, pressure drop | `unit:cyclone`, `unit:bagFilter`, `unit:pneumaticConveyor` | `tutorials/steady/gas-solid/bagFilter01_dust` |
| Particle-size distribution on one grid (sieve classes, PSD, d50, d80, Sauter mean, specific surface, blending powders) | every inlet's distribution put on the case's declared geometric grid (a fitted law integrated, a sieve table re-binned, mass exact and printed), blends class by class, d10/d50/d80/d90, Sauter d32 and S_v published per stream.  Checks: a grid leaving > 1 % of a powder above its top refused; two different grids refused.  Missing: one distribution per solid species (a multi-mineral feed is ONE material); the time-integrated binaries | `key:sizeGrid`, `unit:mixer` | `tutorials/steady/solids/psd01_grid_and_moments` |
| Size reduction (milling, grinding, comminution, ball mill, Bond work index, breakage) | a breakage population balance on the size grid: selection function `austin`, `herbstFuerstenau` (energy-specific) or `vogelPeukert` (impact, with a threshold), breakage function `austin`, plug flow or perfectly mixed; product distribution, T rise from the shaft work, Bond's energy printed beside.  Checks: mass closure per class printed; a feed off the grid, a rate law without a residence time, two energy specs refused.  Missing: residence-time distributions between the two limits other than two mixers in series (two perfectly mixed mills at half the power each), mill sizing and cost | `unit:mill` | `tutorials/steady/solids/mill01_limestone_herbstFuerstenau`, `tutorials/steady/solids/mill02_bond_crosscheck` |
| Classification of a powder or slurry on the size grid (screen, sieve, classifier, hydrocyclone, partition curve, cut size d50, bypass, imperfection, closed grinding circuit, circulating load) | one split every classifier performs, class by class (coarse = a_k f_k m_s, fine = the difference, so the products close exactly; a_k = R + (1 - R) c_k): partition curves `whiten`, `rosinRammler`, `tabulated`; `screen` model `karra` (King 2001 eqs. 4.30-4.48: the cloth, inclination and loading give the cut size and the area utilisation factor, no fitted parameter) or `declared`; `hydrocyclone` model `declared` (corrected curve and water split, Kelsall's bypass); `classifier` (a curve and a bypass); a closed circuit with the recycle of a size distribution carried by `directSubstitution`/`Wegstein`/`DominantEigenvalue`.  Checks: per-class closure printed (0); a feed off the grid, a dry hydrocyclone feed, a vapour-bearing fluid, a missing bypass or water split, and Newton-on-tears on a gridded tear refused by name.  Missing: the empirical hydrocyclone correlation of Nageswararao et al. (no source prints its constants), one distribution per solid species (every classifier splits ONE population), King's kinetic screen model, the time-integrated binaries, sizing and cost of a classifier | `unit:classifier`, `unit:screen`, `unit:hydrocyclone` | `tutorials/steady/solids/circuit01_herbstFuerstenau_closedCircuit`, `tutorials/steady/solids/hydrocyclone01_quartz_willsTable91`, `tutorials/steady/solids/screen01_dolomite_karra` |
| Carried quantities on a stream (a size distribution, a material's mass flow, a polymer's chain moments of order 0 and 2) | a CLOSED list of kinds, each owning its basis, its law of mixing, its law of division, its balance (a production term or none), its state-file block and its report line; a mixer adds and a splitter divides by the kind's own law and names no kind; a unit that models a kind says so in `UnitAcceptance::carried` with one sentence (`choupoSolve --describe-units` prints it), and a kind on an inlet of a unit that does not model it is refused by kind, unit and stream before the solve (authored or produced), by the time-integrated drivers and by `choupoBatch`; a kind whose total is a mass (`materialMass`) enters the plant-boundary mass balance as its own `carried.<name>` row; a kind validates its own attributes on construction, read and write.  Checks: `bin/curate/check_carried_kinds.py`.  Missing: the size distribution's storage is still the stream's `psd` field, the element form of a material waits for its analysis | `unit:mixer`, `unit:splitter` | `tutorials/steady/solids/splitter01_slurry_sizeDistribution`, `tutorials/steady/solids/psd01_grid_and_moments` |
| Solid-liquid separation of a slurry (cake filtration, rotary vacuum drum, filter press, washing a cake, thickener, settling test, Talmage-Fitch, Coe-Clevenger, sedimenting centrifuge, tubular bowl, disc stack, Sigma theory, cut size) | `cakeFilter`: the two-resistance law t/V = K_p V/2 + B (Geankoplis section 24.2), a compressible cake alpha = alpha0 dp^s, the cake law and medium resistance a SAMPLE record (`sample <name>;`, kind measured | adopted | estimated, raw t-V rows or a source's printed values, support and authorised domain; typed in the unit they are refused), a continuous drum (area from the cycle time, or the reverse) or a cyclic press (filtration, washing and cycle times, presses required) on CYCLE-AVERAGED streams, the wash a real inlet and the spent wash a real outlet, washing laws `displacement` and `tabulated`; `thickener`: the area from the case's batch settling test, `talmageFitch` (the tangent at a DECLARED compression time) or `coeClevenger`, both printed; `sedimentingCentrifuge`: Sigma of a `tubularBowl` (equal-volume and Geankoplis half-layer cuts) or a `discStack`, cut size d50, Stokes' window enforced, a DERIVED grade efficiency per class on the size grid.  Checks: component mass closes exactly (every outlet the difference); a wash with solids or at another temperature, a settling test that rises, a compression time outside the test, a solid not denser than the liquid, Re >= 1 at the cut size and an undeclared liquid viscosity model refused by name.  Missing: a washing law with constants (none is printed in the sources in hand), constant-rate and centrifugal filtration, an enthalpy balance across the cake, a thickener's depth and compression zone, hindered settling and drive power in the centrifuge, sizing and cost, the time-integrated binaries | `unit:cakeFilter`, `unit:thickener`, `unit:sedimentingCentrifuge` | `tutorials/steady/solids/filter01_caco3_rotaryDrum`, `tutorials/steady/solids/filter02_caco3_pressWashing`, `tutorials/steady/solids/thickener01_settlingTest_talmageFitch`, `tutorials/steady/solids/centrifuge01_tubularBowl_geankoplis`, `tutorials/steady/solids/centrifuge02_discStack_sigmaIdentity` |
| Membranes (RO, NF, UF, diafiltration) | solution-diffusion and pore transport, polarisation | `unit:spiralWoundModule`, `batchUnit:batchDiafilter` | `tutorials/steady/membranes/membrane01_RO_NaCl_seawater` |
| Characterising a membrane from a laboratory record (an uncharged solute for r_p and the thickness, X_d per concentration and its isotherm, parameters with 95 % intervals, a held-out point, NaN for an ion not analysed, an uncharged solute in the DSPM-DE law) | Declares: `fitParameters` residual `kind membrane` on ONE record (`c_<salt>`, `Jv`, `dP_applied`, `R_<ion>` columns; rows split by `discard ( ... )`), `transportParameters { neutralSolutes { <name> { radius; D0; } } }`. Checks: held-out AAD against a band declared before the fit, `feedC_mean_molm3` for the isotherm view. Missing: pH dependence of the charge, mutual hindrance of solutes, a neutral under a pressure-closed flux | `tutorials/props/membrane/dspmde02_lab_characterisation_template` |
| Electrodialysis (ED stack, limiting current) | limiting current, multi-ion transport | `unit:electrodialysisStack`, `batchUnit:batchElectrodialysis` | `tutorials/steady/electrodialysis/ed01_nacl_desalination` |
| Adsorption, PSA, ion exchange (fixed-bed breakthrough, numerical dispersion, convection scheme) | swing cycle, loadings; a fixed bed's breakthrough front and pulse moments, with the scheme's own numerical dispersion announced (first-order upwind adds v dz/2; `vanLeer` removes it) | `unit:psa`, `unit:ionExchanger`, `batchUnit:fixedBedAdsorber`, `key:convectionScheme` | `tutorials/steady/separation/psa01_h2_psa`, `tutorials/batch/adsorber/batch29_pulse_two_schemes` |
| Hydrocarbon and light-gas mixtures from dilute gas to compressed liquid on ONE equation (Lee-Kesler, corresponding states, Ploecker mixing rule, fugacity, enthalpy and entropy departures, liquid and vapour density, cryogenic N2-Ar-CH4 VLE, a printed table to check an equation of state against) | Computes: Z, H_R, S_R and ln phi_i on both roots from `model LeeKeslerPloecker;` (Lee & Kesler 1975 Eq. 3, 9-12 with the Table 1 constants; the mixture as one fluid, PKP 1978 Eq. 9-14 with eta = 0.25 and kappa from Table I, one record per pair; the component fugacity A6-A13); needs only Tc, Pc, omega.  Checks: reproduces 92 entries of the paper's Tables 5-12 and Poling's Example 4-1, G = H - TS to 1e-9, ln phi_i against the mole-number derivative to 1e-6, and the bubble pressure of N2 + CH4, N2 + Ar and ten ternary liquids at 112 K within 1.6 / 0.75 / 0.48 % of Miller, Kidnay & Hiza 1973; hydrogen and helium, kappa <= 0, a record for another EoS and an unknown component are refused by name, an undeclared pair runs kappa = 1 and is announced by name, a state outside T_r 0.3-4 is announced.  Missing: strongly polar fluids, hydrogen and helium effective constants, the graph estimate of an unlisted kappa, the liquid enthalpy of a mixture on the EoS's liquid root (C410; Theory Guide `sec:cubic-liquid-root`) | `key:LeeKeslerPloecker` | `tutorials/props/molecular/lkp01_lee_kesler_tables`, `tutorials/props/compare/lkp02_n2_ch4_ar_112K` |
| Predicting an activity coefficient from molecular groups (UNIFAC, modified UNIFAC Dortmund, group contribution, no fitted pair, gamma at infinite dilution, excess enthalpy from structure, alcohol-alkane or alcohol-water prediction) | Computes: gamma_i from each component's own group decomposition, no binary parameter: `model UNIFAC;` (the original, Hansen 1991) or `model UNIFACDortmund;` (the modified model: r^(3/4) combinatorial part, Psi = exp(-(a + bT + cT^2)/T), OH split primary/secondary/tertiary, ring groups), whose parameters are ONLY those printed in Gmehling, Li & Schiller 1993 (Tables III-IV).  Checks: a main-group pair the paper does not print, or a component without its own `groups { unifacDortmund ( ... ); }` block, is refused by name; the paper's 20-125 C fit window is announced.  Missing: the later licensed Dortmund revisions (not entered), UNIFAC-LLE, polymers | `key:UNIFACDortmund` | `tutorials/props/compare/unifacDortmund01_ethanol_water_reduced_pressure`, `tutorials/props/compare/unifacDortmund02_butanol_water_gamma_infinity` |
| What does Choupo have for this pair or compound? (binary parameters, NRTL, UNIQUAC, UNIFAC, component record, CAS lookup, evidence for a pair) | ONE evidence card in at most 2048 bytes: the catalogue pair record as a paste-ready `source` entry, or Choupo's own regression with its case and verdict, or UNIFAC SAID to be an estimate, or "I do not have it" and what to bring; for a compound, which properties its record carries and which are missing (by name, alias or CAS), never the values.  Checks: it invents no number, and what the C16 chain will add (laboratories, archive hash, extraction filter) is listed as announced-absent.  Missing: the pairs only servable from the measurement archive (slice b) | `op:pairLookup`, `op:componentLookup` | `tutorials/props/molecular/pairLookup01_catalogue_ladder`, `tutorials/props/molecular/componentLookup01_catalogue_ladder` |
| One pair, two parametrisations (a partially miscible pair fitted to VLE and to LLE, several parameter sets for a binary, which NRTL set did this run use, `preferred` set, select a pair set) | Declares: a pair record of NRTL, UNIQUAC or Wilson holding `sets { <name> { parameters; provenance; validity; fittedTo vle \| lle \| vlle \| calorimetry; } }` and `preferred <name>;` (a record with one plain `parameters` block is the set `default`, read as before); a case picks one with `set <name>;` beside the pair's `source`, else the record's preferred set is read.  Checks: an unknown set name is refused by name listing the record's sets, `set` on an inline pair is refused, a record with sets and a stray top-level `parameters` or no `preferred` is refused; the run's `[builder] binary pair` line and the resolved view print the set (nothing new prints for a record of one set).  Missing: the Henry, Pitzer, eNRTL and EoS-kij records (own record types, one parameter block each); no catalogue record holds a second set yet (the second set of the gate probe, the record-form gate, arm pair-sets, is a labelled PROBE built in a temporary directory).  Theory Guide `sec:pair-sets` | `key:set`, `key:preferred`, `key:sets` | `tutorials/props/molecular/nrtl01_ethanol_water_package` |
| Liquid volume of a cubic equation of state (volume translation, Péneloux, SRK, PR, liquid density error of a cubic) | the liquid and vapour volume of SRK or PR lowered by c = Σ x_i c_i with c_i = 0.40768 (R Tc/Pc)(0.29441 − Z_RA) (Eq. 8; or a declared `cShift`), ln phi_i lowered by c_i P/RT in both phases (K-values and flashes unchanged, reactions priced on the translated fluid), S_R unchanged, the vapour-root H_R lowered by P c; OFF by default; a component with no Z_RA or shift is refused by name, `missingZRA YamadaGunn;` is an announced opt-in estimate (SRK; PR takes the Jhaveri-Youngren shift c = s b, Eq. 17-18, Tables 1-2, per component).  Theory Guide `sec:peneloux`.  Checks: equilibrium byte-identical, Eq. 6 and −P c recomputed (`check_volume_translation`), two anchor rows within 2 % of Perry's liquid density.  Missing: Z_RA / J&Y shift for N2/H2, `ThermoPackage::density` (Rackett) is not translated | `equationOfState { volumeTranslation { model Peneloux; } }` (PR: `model JhaveriYoungren;`) `` in a phiPhi system or variant, read through `op:propertyPoint` | `tutorials/props/molecular/volumeTranslation01_nhexane_peneloux` |
| A cubic equation of state fed a low-pressure activity model (mixing rule, excess-Gibbs mixing rule, MHV1, MHV2, modified Huron-Vidal, Michelsen, Dahl and Michelsen, vanDerWaalsOneFluid, kij-free cubic, high-pressure VLE from NRTL or UNIFAC parameters, supercritical component with an activity model) | `mixingRule MHV1;` or `mixingRule MHV2;` on SRK (phiPhi) with the `activityModel` block of a gamma-phi liquid inside the `equationOfState` block: the cubic matched to G^E at ZERO pressure, q1 (beta - sum y_i beta_i) [+ q2 (beta^2 - sum y_i beta_i^2)] = G^E/RT + sum y_i ln(b/b_i), q1 = -0.593 (Michelsen 1990 Eq. 12) or q1 = -0.478, q2 = -0.0047 (Dahl & Michelsen 1990 Eq. 13), ln phi_i from d(n beta)/dn_i (their Eq. A3, needs only ln gamma_i), H_R/S_R carrying the slope of G^E; `vanDerWaalsOneFluid` is the default and today's arithmetic, byte-identical.  Theory Guide `sec:cubic-mixing-rule`.  Checks: PR is refused, a G^E rule with no activityModel or with a kij block, a pair with no record, G^E model ideal, an unknown word and PC-SAFT are each refused by name; a pure beta outside 10-13 is announced; `bin/curate/check_cubic_mixing_rule.py` recomputes both rules from the papers (ln phi_i 1e-9, H_R and S_R against a temperature difference of ln phi).  Missing: Huron-Vidal, Wong-Sandler, PSRK, Peng-Robinson constants.  Under phiPhi a liquid stream is priced on the liquid root's departures (C410).  Witness `tutorials/props/molecular/mhv01_methanol_water_100C` (12 measured bubble points, Poling Table 8-46) |
| Phase diagrams of a mixture (P-T envelope of a feed, bubble and dew curves, cricondentherm, P-x-y at fixed T, bubble pressure) | the P-T envelope of one feed marched in pressure (`op:phaseEnvelope`: bubble and dew temperatures at each pressure, a bracketed cricondentherm where an interior maximum exists, and where each branch stopped and why; on a phi-phi package the incipient liquid/vapour is iterated, a trivial root refused, witness `tutorials/props/molecular/envelope05_natural_gas_phiphi`); the bubble pressure and its incipient vapour at fixed T (`P_bubble`, `y_eqT_<comp>` in `op:propertyScan1D` / `op:propertyPoint`), so a binary swept along x gives a P-x-y.  Checks: a bubble step that falls with pressure and a dew step discontinuous with its branch are discarded and named; a liquid that does not boil at 0.01 bar or a state with one cubic root is refused.  Missing: the nose of the envelope (arc-length continuation, Michelsen 1980) and a cricondenbar; a fixed-T liquid-liquid probe for the P-x-y; a liquid-stability probe for the envelope beyond binaries and on the dew curve; an envelope with the liquid on the equation of state in the Explorer (the phiPhi dew solve is a recorded defect) | `op:phaseEnvelope`, `op:propertyScan1D`, `op:propertyPoint` | `tutorials/props/molecular/envelope03_c3c4c5_both_stop`, `tutorials/props/scan/pxy01_ethanol_water_70C` |
| A cubic equation of state's alpha function (SRK, PR) fitted to a component's own vapour-pressure law | opt-in `alphaFunction MathiasCopeman;` on a phi-phi cubic: the pure-component saturation pressure follows the record's own law over its window (water SRK 0.65 % over 273-634 K against the IAPWS equation, methanol SRK 0.05 % in-sample, against 34 % and 19 % with the default alpha); the three constants live in the record's `cubicAlpha` block, fitted BY CURATION (`bin/curate/fit_alpha_function.py`), never typed from a table.  Checks: a component without the block is refused by name with the tool as the remedy; an unknown alpha function word and PC-SAFT are refused; the curation tool refuses a record whose law is a sublimation line (CO2).  Missing: constants for any component but water and methanol; the Twu and Stryjek-Vera forms; the second derivative in a heat-capacity departure; a mixing rule that uses the improved pure-component fit (C408 slice 1) | `op:propertyScan1D`, `op:mixingRules` | `tutorials/props/molecular/alpha01_water_methanol_psat` |
| Property bench (phase diagrams, steam tables, psychrometry, parameter fitting) | properties, envelopes, fits | `op:phaseEnvelope`, `op:steamTables`, `op:psychrometricChart`, `op:fitParameters`, `op:speciate` | `tutorials/props/steam/steam01_if97_verification`, `tutorials/props/heat/psychro01_n2_water` |
| Reference (multiparameter Helmholtz) equations of state: water IAPWS-95, CO2 Span-Wagner, N2 Span et al., CH4 Setzmann-Wagner | rho, h, s, cp, cv, w, fugacity coefficient at (T, p) or (T, rho), saturation by Maxwell; every published check value reproduced at load.  A flowsheet reaches one through `pureFluids { <component> { method Helmholtz; equation <name>; } }` (a phase effectively pure in it).  Missing: mixtures (GERG-2008), H2 and NH3, transport | `op:referenceEoS` | `tutorials/props/thermo/refEoS01_iapws95_verification` |
| Liquid density a pump or a CSTR uses (water at temperature and pressure, mixtures, aqueous NaOH, a measured density, salt solutions, which method, refusals) | the property kernel's density per constituent set: water by its IAPWS-95 reference equation with pressure (a record names it), additive volumes over the records, a solution record's law (NaOH-water, Olsson 1997), the case's own measured point with a hard box (`key:volumetric`), the declared hypothesis `key:massWithoutVolume` (mass, no volume, bounded); the run's table names the method.  Checks: a set no method prices, a point outside its box, a law outside its bands and a hypothesis above its bound are refused by name.  Missing: an excess volume for mixtures, a pressure term on the record volumes and the NaOH law, a partial molar volume for a dissolved gas; every unit other than the pump and the CSTR still on the older route | `unit:pump`, `unit:cstr`, `op:propertyScan1D` | `tutorials/steady/thermo/liquidDensity01_water`, `tutorials/steady/thermo/liquidDensity04_NaOHpoint`, `tutorials/steady/thermo/liquidDensity06_NaClwaterEthanol` |
| Process control (PID, step response, loops) | closed-loop dynamics | `dynUnit:dynamicCSTR`, `controller:PID` | `tutorials/ctrl/ctrl01_cstr_temp_control` |
| Dynamics without control (start-up, feed and bleed) | transients of connected units | `dynUnit:quasiSteady`, `dynUnit:dynamicTank` | `tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup` |
| Recycles (tear streams) | converged recycle; `recycleSolver` Newton, Wegstein or the opt-in dominant-eigenvalue extrapolation (announced, with fallbacks) | `pack:recycles`, `key:recycleSolver`, `key:recycleDELambdaMax` | `tutorials/plant/hda` |

The full list of unit operations, with their keys, is
`docs/ai/unit-ops.md`.  The catalogue of thermodynamic and property models is
https://www.choupo.org/llm/models.md; it describes the stable release it names
in its first lines, not the development line, so a model added since may be
missing from it (check `docs/ai/thermo.md`).
