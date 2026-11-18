# Does a new capability enter through one place? (units, carried kinds)

Read-only review of `main` at 3b12a4a321.

## A. Carried quantities (C427: 7d7cba1a32, be234c729b)

**What is good.** `CarriedKind` follows the project's factory pattern exactly: `registerType`, `New` and `availableTypes`, with an explicit `registerBuiltins` at Carried.cpp:490-498. It is called from each main and from DynamicDriver.cpp:391, and there are no macros. The mixer and the splitter really are kind-blind. The mixer passes its inlets to `mixCarried` (Mixer.cpp:289) and the splitter calls `divideCarried` (Splitter.cpp:135). Both dispatch through `CarriedKind::New(q.kind)` (Carried.cpp:633, 641), and neither file branches on a kind name. A kind whose total is a mass enters the plant mass balance through a virtual (`totalIsMass`, used at MassBalanceReport.cpp:101/119), not through a name. `UnitAcceptance::carried` (UnitAcceptance.H:212) refuses by default, which is the safe side.

**Cost of adding a new extensive kind, measured:**
1. A class and one registration line, both in Carried.cpp (the kinds sit in an anonymous namespace, :102-258). This part is organic.
2. **Any attribute other than `order` has to be added in the shared code.** `ExtensiveKind::writeState`, `readState` and `report` know only chainMoment's `order` (Carried.cpp:141, 158, 168). So does the free wire function `carriedToDict` (Carried.cpp:543-544). A new attribute is dropped at the unit-input wire with no error. The header comment "the core type knows no kind" (Carried.H) holds for the struct but not for these functions.
3. The batch-driver refusal scans for literal keys (Carried.cpp:746).
4. Each unit that models the kind declares it as a string literal (for example Cyclone.cpp:285).

**Cost of a new unit that carries a size distribution.** It needs `acceptance()` (1 line in .H, about 10 in .cpp) and must parse the `solids { diameters; massFractions; }` wire **itself**. Seven units already do this: Cyclone.cpp:88, BagFilter.cpp:109, PneumaticConveyor.cpp:151, GasSolidSplitter.cpp:105, Mill.cpp:140, ClassifierCore.cpp:95, SolidLiquidCore.cpp:71. The wire is written twice more, at UnitInputs.cpp:85 and :333. So the kind does **not** own the size distribution's state form. That form lives in three places, because the psd is stored both in `ProcessStream::psd` and in `carried`. Inside the kind's own home, `applyCarried` tests `q.kind == "sizeDistribution"` (Carried.cpp:602) where `readCarriedBlock` uses the virtual `storedInStreamPsd()` (:677).

**Coverage.** materialMass and chainMoment are modelled by no unit except the mixer and splitter, so the transform path is exercised only by the Mill (Mill.cpp:272). Two refusal mechanisms exist for the same rule:
- choupoBatch scans the text of its state tree (Carried.cpp:729).
- The time-integrated driver reads only `.carried` (DynamicDriver.cpp:269), so it does not see a psd.

## B. Recent units in practice

**Agitated vessel and non-Newtonian pipe (261790afd6, a0cffcf534, e6a1b57758): 23 `src` file-touches.**
- **(i) Own files, 9:** AgitatedVessel.{H,cpp}, Impeller.{H,cpp}, NonNewtonianPipe.{H,cpp}, FlowCurve.{H,cpp}, ThermoPackageRheology.cpp.
- **(ii) Registration, 1:** UnitOperation.cpp, 2 lines.
- **(iii) Plumbing, 13:**
  - ThermoPackage.H: member and accessor.
  - ThermoPackage.cpp: line 110 (move-assign), :527 (read), :2275 (refuse).
  - ThermoPackageBuilder.cpp: :2273 (table row) and **:2313, a `!= "liquidRheology"` exception inside a generic loop**.
  - TransportGrammar.H: 3 sites, including :92.
  - ExperimentsFile.cpp:143, a list of key names.
  - LiquidTransportDeclarations.H: an include.
  - LiquidPropertyDoor.{H,cpp}: form 3. This one is a legitimate interface extension.
  - **PropertySourceDeclarations.cpp:63**, a central table keyed by unit type name.
  - Pipe.cpp: +168 lines as a branch inside `solve` (Pipe.cpp:472), then 330 lines moved by a0cffcf534.
  - ResolvedView.cpp:948.

  The GUI also had to change: unitFamily.ts:509 and modelDocs.ts:192.
- **Avoidable:**
  - The property-source table could be a unit virtual, as `acceptance()` already is.
  - The string exception at Builder:2313 could be avoided.
  - The pipe branch could have been a rheology model object.
  - The most damaging cost is one of process: **EduTool `file:line` citations freeze the layout of the source.** ThermoPackageRheology.cpp exists "so that ThermoPackage.cpp keeps its line numbers" (its own Description). Code is crammed onto existing lines to keep numbering: ThermoPackage.cpp:2275 `{   if (...)`, :110, and Flowsheet.cpp:205 `reportCarried(...);   std::cout`. a0cffcf534 moved 330 lines "so the lesson citations hold".
- **A consequence the extra code has already caused:** the agitator publishes `W_shaft` (AgitatedVessel.cpp:258) exactly as a pump does. UtilityAllocationReport.cpp:490 bills electricity only to `ty == "pump" || ty == "compressor"`, so the agitator's power is never allocated to electricity.

**Sample behaviour (b64a585630): organic.** It adds a new home, src/samples/SampleBehaviour.{H,cpp}. The only other change is the consumer edit in CakeFilter.{H,cpp}, plus one layering-gate line. Caveat: the stated extension is "one function per kind" (SampleBehaviour.H:68-71), not a registry. `refuseTypedSampleNumbers` is generic in name and filtration-specific in body (SampleBehaviour.cpp:402).

## C. Dispatch on type or model names outside a factory

No `dynamic_cast` to a concrete unit class was found. There are 34 equality comparisons against registered unit-type literals; about 8 are false positives (ports, modes). There are also about 6 static sets of type names. The worst sites:
1. PropertySourceDeclarations.cpp:32-90: 19 unit-type rows.
2. UtilityAllocationReport.cpp:490/502: electricity billed by type (see the agitator above).
3. EconomicsPass.cpp:3250-3253 `particulateUnitTypes` (9 types). It disagrees with `acceptance().carried`: Mill, Screen, Classifier, Hydrocyclone, CakeFilter, Thickener and SedimentingCentrifuge declare `sizeDistribution` but are not on the list. These are two homes for one fact.
4. choupoSolve/main.cpp:386-391 `kNonEquilibrium`: a negative list, so a new unit (agitatedVessel included) inherits the txy envelope by default.
5. PlantLayout.cpp:435, 1042-1047, 1066, 1122, 1186, 1205.
6. Flowsheet.cpp:970-972: column heat ports by type. Also :546/568 (evaporator) and :4192 (isothermalFlash).
7. EquipmentTag.cpp:50-63 and 120-122.
8. Turton.cpp:278-283: coefficient sets chosen by if-chain.
9. EnergyItems.H:150-155 `isProcessToProcessExchanger`. This one is honestly labelled "joins it here, by a human".
10. SpiralWoundModule.cpp:620, 795, 866, 919: **model** names (`transportModel->type() == "solutionDiffusion"` / `"constantRejection"`) where a capability virtual would do.

For contrast, `EnergyItems` keys on KPI names and `interiorKindsRead` asks the instance (UnitOperation.cpp:146). Those are the organic pattern, and it already exists in the tree.

## Verdict
- **Elegant:**
  - `CarriedKind` is a textbook explicit factory, and the mixer and splitter are genuinely kind-blind (Mixer.cpp:289, Splitter.cpp:135, Carried.cpp:633/641).
  - Unit and sizer registration is one line each (UnitOperation.cpp:200, EquipmentSize.cpp:83+).
  - The sample-behaviour slice adds a home and touches only its consumer.
- **Not elegant:**
  - The size distribution keeps two storages. Its wire is parsed in 7 units and written in 3 places, so "the kind owns the state form" is true only for the non-psd kinds.
  - The extensive-kind base and the wire know chainMoment's `order` (Carried.cpp:141-170, 543).
  - At least 10 type-name side tables outside the unit force each new unit to visit reports, layout, economics and property-source plumbing. One visit has already been missed: electricity billing for the agitator.
  - `file:line` lesson citations turn local additions into contortions of shared files (ThermoPackageRheology.cpp, ThermoPackage.cpp:2275, a0cffcf534).
- **The three cheapest changes:**
  1. **Replace the type tables with unit virtuals or KPI keys,** the pattern `acceptance()` and EnergyItems already use. Make property sources a `UnitOperation` virtual. Bill electricity by the presence of the `W_shaft` KPI. Derive the "particulate" list from `acceptance().carried.kinds`. Three files, and three side tables disappear.
  2. **Finish the psd migration.** Add one `psdOfInlet(dict)` in Carried.cpp and call it from the 7 units. Have `carriedToDict` and `ExtensiveKind` serialise the whole `attributes` map. Use `storedInStreamPsd()` at Carried.cpp:602.
  3. **Make lesson citations anchor-based** (a marker comment resolved by the gate) instead of line-based, so new code can sit where it belongs.
