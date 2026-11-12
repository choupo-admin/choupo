# Slice 0 of the thermophysical-property kernel: inventory, door and plan (C378)

Kind: PLAN.  Status: OPEN -- phase A (measurement and a written plan) of
slice 0 of [`thermophysical-property-routes.md`](thermophysical-property-routes.md);
no file under `src/`, `gui/`, `data/`, `tutorials/` or `bin/` changed.  It
binds itself to that record's first section, its three amendment blocks and
its "Answers to the numerical review" (TR-01..21), and to DEV.md 4c C378 and
C381.  Tree read: `origin/main` a0266ceff.  Runs: the binary
`choupoSolve` built from adc4da12d (another session's worktree build); its
`src/` differs from a0266ceff only in `io/SolutionWriter`, `solver/ODE/*` and
`FixedBedAdsorber`, none of which the four runs below reach.  The PRIMARY
checkout's binary is NOT current: it reports commit ea0b3a81e (2026-11-10)
and nine liquid-property sources differ from main since then, so it was not
used.  Cases were copied to a scratch directory and run there.

## 1. The consumer inventory

**How it was derived** (re-run to check; every hit outside `src/thermo/` is
a row below or is named in 1.6 as not a consumer):

```
grep -rnE '\b(density|liquidMolarVolumeOf|viscosityLiquid|surfaceTension|diffusivityLiquid|thermalConductivityLiquid)\s*\(' src
grep -rnE 'Vliq\(\)' src
grep -rnE '\b(1000(\.0*)?|997|998|1\.0e3|1e3)\b' src | grep -iE 'rho|dens|kg/m'
grep -rnE 'lookup\w*\("(rho\w*|density\w*|mu\w*|viscosity\w*|sigma\w*|surfaceTension|D_\w*|diffusivity\w*)"' src
grep -rnE 'pricedDensity::select|phaseDensity::of|stokesEinstein::factor|liquidDensity\(|liquidViscosity\(|RHO_CARRIER|WilkeChang' src
```

Columns: SITE; CONSUMER; SOURCE (K = the package's method; K+S = the package
through `pricedDensity::select`, which leaves out and renormalises a
component whose pure density is not finite, PricedDensity.H:16-36; RAW = a
component field read directly; CONST = a literal; OWN = the unit's own
correlation; DECL = a value the case writes in the unit or pass); STATE at
which it is asked; ON REFUSAL.

### 1.1 Liquid density / molar volume

| site | consumer | source | state asked | on refusal |
|---|---|---|---|---|
| Pump.cpp:103-116 | pump | RAW `Vliq` (25 C), flat; an ion with an aqueous bridge left out of the VOLUME, its mass kept (:319-322) | inlet z; no T, no P | throws (no `Vliq`, not an ion) |
| Pump.cpp:238 | pump (Cp share) | RAW `Vliq` <= 0 as the ion test | inlet z | -- |
| Pump.cpp:319-322 | pump head | MW / v_mix of the line above; CONST 1000 if v_mix = 0 | inlet | silent 1000 |
| PressureExchanger.cpp:191 | pressureExchanger | RAW `Vliq`, ions out of the volume (announced) | HP and LP inlet z | throws |
| CSTR.cpp:245-248, :660-663 | cstr (two paths) | RAW `Vliq` over EVERY package component, present or not | inlet z | throws |
| PFR.cpp:193-196, :690-693 | pfr (liquid bed; :690 only with a concentration law) | RAW `Vliq`, every component | inlet z | throws |
| Crystalliser.cpp:506, :802 | crystalliser MSMPR, FVM | RAW `Vliq`; a component without one adds 0, SILENTLY | inlet | throws only if Q <= 0 |
| SprayDryer.cpp:580 | sprayDryer, one solvent | RAW solvent `Vliq`; CONST 1000 silently if none | feed solvent | silent 1000 |
| SprayDryer.cpp:591-599 | sprayDryer, several solvents | RAW `Vliq` ideal mix; CONST 1000 announced if one lacks it | feed solvents | announced 1000 |
| SpiralWoundModule.cpp:317 | spiralWoundModule | DECL `rho_feed`, default CONST 1000, not announced | -- | -- |
| RatedTestInversion.cpp:223 | spiralWoundModule rated test | DECL `rho_feed`, default 1000 | -- | -- |
| EDCell.cpp:158, :228, :335; EDCell.H:102 | ED cell helpers | CONST 1000 (`rho_w`, `RHO_CARRIER`) | -- | -- |
| ElectrodialysisStack.cpp:347 | electrodialysisStack | CONST 1000 | -- | -- |
| BatchElectrodialysis.cpp:602 (+ :325, kinematic viscosity) | batchElectrodialysis | CONST `RHO_CARRIER` | -- | -- |
| BatchDiafilter.cpp:145-159 | batchDiafilter | DECL `rho`, else 1000 ANNOUNCED | -- | -- |
| Valve.cpp:283-300 | valve | K+S, dropped announced once per PROCESS (static, :288) | inlet and outlet T, P, phase x | KPIs not published, line printed (:366) |
| StorageTank.cpp:140-183 | storageTank | K+S | the unit's T, P (:58-59) | throws with T, P |
| TrayHydraulics.cpp:83-100 | column tray rating | K+S (`TrayHydraulics::liquidDensity`) | tray T, P, x | throws |
| DistillationColumn.cpp:4808 | column condensate volume (`Q_condensate_m3_s`) | K+S via the line above | T[0], y[0] | KPI not published |
| DistillationColumn.cpp:5177, :5609 | computed tray efficiency; packing | K+S via the line above | stage / segment state | throws |
| HeatExchanger.cpp:219-224 | heatExchanger geometry | K, full z; phase by vf < 0.5 | INLET T, P | throws |
| Pipe.cpp:225-236 | pipe two-phase | K over its OWN selection (T > Tc dropped, renormalised) | T, Pin, liquid x | throws |
| Pipe.cpp:442 | pipe single phase | K, full z | T, Pin | throws |
| PhaseChanger.cpp:868, :1307 | phaseChanger geometry (film; boiling) | K, full z | T_f; Tsat - 0.05 K | throws |
| Hydrocyclone.cpp:85 | hydrocyclone | K, fluid x | feed T, P | throws |
| SolidLiquidCore.cpp:136-142 | cakeFilter :152, :247; thickener :132; sedimentingCentrifuge :73 | K, liquid x | feed (and wash) T, P | throws |
| VariableVolumeHoldup.cpp:90 | dynamicTank, dynamicCSTR | K | holdup T, P | rethrown with remedy |
| PhaseDensity.cpp:116-124 | sizing: inventory (Inventory.cpp:36), storage (StorageTankSize.cpp:151), relief valve (ReliefValveSize.cpp:357), pipe header (PipeHeaderSize.cpp:168), gas store (GasStoreSize.cpp:281, :630) | K+S on the POST package (`thermoForPost`, choupoSolve/main.cpp:1005) | the stream's own T, P | refuses by name |
| GasStoreSize.cpp:654-658 | liquefied gas store | K+S | STORAGE T, not the stream's | refuses |
| ShellTubeHX.cpp:230 | shellTubeHX sizer | K (post package) | mean of in/out T (:303) | refuses |
| ReliefValveSize.cpp:360 | relief valve | CONST `waterRefDensity` (specific gravity, a definition) | -- | -- |
| CleanUtilitiesPass.cpp:126, :324 | clean utilities | DECL fluid density | -- | -- |
| ColumnSize.cpp:433 | reflux drum | the column's `Q_condensate_m3_s` KPI | -- | refuses |
| AqueousSplit.cpp:160-175 | membrane split | the caller's `rho` (spiral wound's) | -- | -- |
| BellDelaware.cpp:193 | exchanger htc block | DECL `rho` | -- | -- |
| PropertyEvaluator.cpp:254 | props bench `rho_liquid_<comp>` | K, pure | scan T, P | value refused |
| HansenMixture.cpp:205, SolubilityParameter.cpp:142 | props ops | RAW `Vliq` (25 C) | -- | refuses |
| FitParametersMembrane.cpp:608, PoreTransportBench.cpp:172, PolarisationIndex.cpp:96 | props benches | DECL `density` | -- | -- |

### 1.2 Liquid viscosity

| site | consumer | source | state | on refusal |
|---|---|---|---|---|
| SprayDryer.cpp:124-138 | sprayDryer | K if a model is declared, else DECL knob default 1e-3 | feed T, z | refuses (since 2026-09-05) |
| SpiralWoundModule.cpp:333, :396-415 | spiralWoundModule | DECL; else K (announced); else 1e-3 `[legacy]` warning | inlet T, z | -- |
| HeatExchanger.cpp:225-228 | heatExchanger | K | inlet | throws |
| Pipe.cpp:240-248, :450-458 | pipe | DECL override announced; else K; else refuses | T, x | refuses |
| PhaseChanger.cpp:870, :1310 | phaseChanger | K | film; Tsat - 0.05 K | throws |
| PipeHeaderSize.cpp:176-199 | pipe header sizer | DECL with `source`, `reason`; else K | stream | refuses |
| ShellTubeHX.cpp:233 | shellTubeHX | K | mean T | refuses |
| DistillationColumn.cpp:5071/5182 | tray efficiency | DECL `liquidViscosity`, else K | stage | refuses |
| DistillationColumn.cpp:5567/5616 | packing | DECL, else K | segment | refuses |
| SolidLiquidCore.cpp:145-159 | cakeFilter :153, sedimentingCentrifuge :74 | K | feed | refuses with remedy |
| StokesEinstein.cpp:48-49 | ED stack :376, batch ED :322, Polarisation.cpp:653, DSPM_DE.cpp:539 | K, PURE solvent at T and 298.15 K | T | no factor if no model |
| BellDelaware.cpp:194 | htc block | DECL `mu` | -- | -- |
| PropertyEvaluator.cpp:285 | props bench | K | scan | value refused |
| FitParametersMembrane.cpp:607, PoreTransportBench.cpp:171, PolarisationIndex.cpp:95 | benches | DECL | -- | -- |

### 1.3 Surface tension

| site | consumer | source | on refusal |
|---|---|---|---|
| SprayDryer.cpp:389-411 | sprayDryer | DECL knob; else K; else CONST 0.072 on ANY exception | silent 0.072 |
| Pipe.cpp:303-304, :329-330 | pipe Friedel / other two-phase | DECL, else K | throws |
| PhaseChanger.cpp:865 | condensation (unused by Nusselt) | K, exception -> 0 | silent 0 |
| PhaseChanger.cpp:1280 | boiling | K | refuses |
| TrayHydraulics.cpp:247-248 | tray rating | DECL `sigma` WINS, else K | refuses |
| DistillationColumn.cpp:5209 | tray efficiency | K WINS if a model exists, else DECL `sigma` | -- |
| DistillationColumn.cpp:5617 | packing | K | refuses |
| ShellTubeHX.cpp:999 | boiling sizer | K | refuses |
| PropertyPoint.cpp:179, PropertyEvaluator.cpp:294 | props | K (PropertyPoint swallows the refusal) | -- |

### 1.4 Liquid diffusivity

| site | consumer | source |
|---|---|---|
| SpiralWoundModule.cpp:340, :426-440 | spiralWoundModule | DECL; else K for the first nonvolatile solute in the aqueous solvent; else 1.6e-9 `[legacy]` |
| EffectiveDiffusivity.cpp:135, :175 | pellet | K, or a measured `D_eff` record |
| DistillationColumn.cpp:5186-5188, :5619-5621 | tray efficiency; packing | OWN `WilkeChang` instance (:5173, :5579) in the MIXTURE viscosity, linear in x: bypasses the package's diffusivity model |
| Polarisation.cpp:653, DSPM_DE.cpp:539, EDCell.cpp:162 | membranes, ED | species record `D0` x Stokes-Einstein (record) |
| FitParametersMembrane.cpp:618 | bench | DECL |
| PropertyEvaluator.cpp:291 | props bench | K, components 0 in 1 only |

Liquid thermal conductivity (listed, not slice 0): HeatExchanger.cpp:232,
PhaseChanger.cpp:869, :1311, ShellTubeHX.cpp:237, PropertyEvaluator.cpp:288.

### 1.5 Totals and reconciliation

| property | rows | file:line refs | kernel (K, K+S) | bypass (RAW, CONST, OWN, record) | declared by the case (DECL) | other |
|---|---|---|---|---|---|---|
| density / volume | 38 | 48 | 15 + 1 (pipe, own selection) | 14 (RAW 9, CONST 5) | 6 (two default silently to 1000) | 2 (a KPI; the caller's value) |
| viscosity | 14 | 18 | 6 | 0 (two DECL rows default to 1e-3) | 8 (6 of them fall back to K) | -- |
| surface tension | 9 | 10 | 5 | 1 (0.072 on any exception) | 3 (beside K) | -- |
| diffusivity | 6 | 8 | 1 | 3 (OWN 1, record 2) | 2 | -- |

(Counted by a script over the tables above; a row groups the call sites of
one consumer and one source.)  Against the record's section 1.3 ("seven read the 25 C volume,
four use 1000"): a stream volume from RAW `Vliq` is read by SIX unit types
(pump, pressure exchanger, CSTR, PFR, crystalliser MSMPR/FVM, spray dryer);
the record's seventh, CrystallisationSaturation.cpp:124, and
Crystalliser.cpp:380 pass the antisolvent's `Vliq` into the mixed-solvent
activity model (`gammaPMMixed`) -- a model PARAMETER, not a density, so they
belong with 1.6.  Constant density: SIX unit types, not four
(spiral wound, rated-test inversion, ED cell, ED stack, batch ED -- the
review's twelfth, `reproductions.tsv` RP-04 -- and batch diafilter's
announced default), plus the spray dryer's silent 1000.  Added by this
inventory and in no earlier count: the column's own Wilke-Chang, the pipe's
own Tc selection, the spray dryer's 0.072 N/m.

### 1.6 Readers that are not consumers of the four properties

Thermo-internal uses of `Vliq` as a model parameter: Wilson.cpp:111;
Poynting, SaturatedVapour.cpp:148-153; WilkeChang.cpp:45 (the solute volume);
`gammaPMMixed` (Crystalliser.cpp:380, CrystallisationSaturation.cpp:124);
SolventProperties.H `vWater`/`rhoWaterKell` (electrolyte kernels and
AqueousVolumetric.cpp:102, :127); `liquidMixingContext` (ThermoPackage.cpp:2530:
Li's and Butler's mixing rules read `liquidMolarVolumeOf`).  Curation writers:
EstimateComponent.cpp, PetroleumCuts.cpp.  Flags: ComponentIdentity.cpp:55,
choupoProps/main.cpp:141.  Gas-only: FixedBedAdsorber.cpp:1400, Cyclone.cpp,
PFR.cpp:736.  Solid bulk or particle densities (CatalystBedSize, RatedMachineSize,
Screen, PneumaticConveyor, BatchPlanPass) are not liquid properties.

### 1.7 Liquid-volume data NOT at 25 C (TR-12; the scope of the correction commit after slice 0)

`Vliq` is read as a 298.15 K datum (ThermoPackage.cpp:2428).  Census of
`data/standards/components/*.dat` (script in the scratch area; the review's
`census.tsv` agrees on every stated temperature):

| class | records | the record states |
|---|---|---|
| a volume at Tb, Tc below 298.15 K | CH4, CO, H2, N2, NO, O2 | "at Tb" |
| another temperature | CO2 (273 K; Tc 304.13), hitecSalt (465 K, no Tc) | the temperature |
| Tc below 298.15 K, no temperature stated | Ar, He, O3, ethylene | nothing |
| near-critical at 25 C (Tc 298-330 K), no temperature stated | ethane (305.32), acetylene (308.30), N2O (309.57), HCl (324.55) | nothing |
| not a pure-liquid volume | sucrose ("apparent molar volume in aqueous solution") | the quantity |

Seventeen records.  Measured by the review: ethane +71 %, HCl +45 %, CO2
+31.8 % at 298.15 K; N2 at 90 K and CH4 at 120 K refused although reference
equations exist for both.  Acetylene and N2O are candidates, not measured.

## 2. What each class prints today (runs, binary adc4da12d)

| class | case run | what the log or result says about the number |
|---|---|---|
| RAW flat `Vliq` | aceticAcid02_plant | nothing about the source; KPI `"v_molar_liq": 4.07e-05`, `"head_m": 375.451325984` |
| RAW with ions | membrane27_swro_energy_recovery | `[pump] dissolved ion(s) (NaCl) carry no liquid molar volume: the volume flow is the solvent's (dilute-solution reading, ...; ion mole fraction 0.0104 neglected)` |
| RAW, silent leave-out | crystalliser08_nacl_antisolvent_msmpr | `"residenceTime": 3504.09836425`; nothing says NaCl's volume is zero |
| CONST 1000 | membrane27 (RO) | nothing; no `rho_feed` in the case |
| K (route, once per process) | aceticAcid02_plant | `liquid density: the record's own Vliq at 25 C, with Rackett supplying only the temperature dependence ...` |
| K+S | aceticAcid02_plant | `[valve] liquid density priced without CO, dimethylEther (mole fraction 8.339e-03) ...`; `[hydraulics] lightsColumn: the tray hydraulics' liquid density ... CO, dimethylEther have no liquid density there` |
| sizing pass | greenAmmoniaPEQ_baseCase | `[density] inventory 'Separator': stream 'RawLiquid' is liquid at 253.15 K, 140 bar -> rho = 748.86 kg/m3`, and the left-out line naming N2, H2, Ar |
| pure-fluid route | greenAmmoniaPEQ_baseCase (utility water; IF97 selected by its `utilities/coolingWater.dat:59`) | `density: IAPWS fundamental equation (rho = MW / v_molar)` |
| DECL | (read) | Pipe.cpp:243 `[pipe] liquid viscosity: USER OVERRIDE ...`; PipeHeaderSize `muFrom` |

No class prints, beside its value, WHICH source a unit used: the package's
lines say which route the package took the first time it was called in the
process, never for which unit.

## 3. The door (sketch; not in `src/`)

```cpp
// src/thermo/LiquidPropertyDoor.H -- thermo band (reads core only; read by
// unitOperations, postProcessing, propertyOps).  check_layering: no new edge.
namespace Choupo::liquidProperty {
enum class Property { density, viscosity, surfaceTension };   // diffusivity: its
                     // request (solute, medium) is decided at its own slice (TR-13)
enum class Basis { mole };                    // slice 0: what the package takes today
struct Request { Property property; DensityPhase phase; scalar T, P;
                 const sVector& x; Basis basis = Basis::mole; };
struct Leaf    { std::string component, methodId; scalar share; };
struct Quality {                              // provenance-semantics-five-axes.md
    Origin      origin;        // core/Origin.H words: literature|regressed|predictive|...
    std::string provenance;    // the record or publication the datum came from
    std::optional<ValidityDomain> domain; bool inside;   // core/Origin.H
    std::string evidence;      // a stated uncertainty, or "not quantified"
};
struct Result  { scalar value; std::string methodId, label;  // label GENERATED
                 std::vector<Leaf> leaves; Quality quality; bool pressureApplied; };
enum class ErrorKind { outsideHardDomain, invalidState, missingDatum };
struct DomainError : std::runtime_error {          // what() == today's message
    DomainError(ErrorKind, const std::string& message, std::string remedy);
    ErrorKind kind; std::string remedy; };
Result evaluate(const ThermoPackage&, const Request&);
// a consumer that bypasses the door registers what it uses, through a TAG:
struct Source { const char* id; const char* label; bool kernel; };
void used(const std::string& consumerType, const std::string& unit,
          Property, const Source&, const std::string& stateNote);
}
```

- **Behind the door in slice 0**: `evaluate` calls `ThermoPackage::density`,
  `viscosityLiquid`, `surfaceTension` unchanged; the method id comes from
  the branch the package already takes (pure fluid; anchored, flat or bare
  Rackett per component -- `liquidMolarVolumeOf` gains an out-parameter
  naming its branch, no other change).  The value is the same double.
- **Refusals stay byte-identical**: each `throw std::runtime_error(m)` in
  those routes becomes `throw DomainError(kind, m, remedy)`; `DomainError`
  derives from `std::runtime_error`, so every `catch` in the tree catches it
  as today and `what()` returns `m` unchanged.  It does NOT derive from
  `InfeasibleTrial` (core/InfeasibleTrial.H): a solver that catches that type
  rejects a step, which would change behaviour.  Mapping it to a rejected
  step is the pilot's (rule 7).  Kinds today: T >= Tc
  (ThermoPackage.cpp:2502-2513) `outsideHardDomain`; empty composition (:2280),
  non-finite volume `invalidState`; no `Vliq` and no Tc (:2481-2485), no model
  (:2177, :2256) `missingDatum`.
- **Per-unit override**: the door takes the `ThermoPackage&` the unit
  already holds (`Flowsheet::thermoFor`, Flowsheet.cpp:2061), so an override
  reaches it unchanged; the table names the package (global or the unit's).
- **Bypass registration that cannot drift**: every bypass number moves into
  a `Source` constant that the computation READS: `kDiluteCarrier =
  {1000.0, "constant 1000 kg/m3 (dilute carrier)"}` replaces `RHO_CARRIER`
  and the four literals; `recordVolume25C(comp)` replaces each `Vliq()` read
  in 1.1 and calls `used()` itself.  The label is a member of the object
  that supplies the number, so changing the number without the label is
  one edit, not two.  A ratchet (section 7) refuses new raw reads.
- **Two sources at one level today (TR-07), reported, not changed**: water
  with `pureFluids { water { method IF97; } }` takes the pure-fluid route
  when the liquid is effectively pure and REFUSES any mixture containing
  water (ThermoPackage.cpp:1398-1410); without it, the record's `Vliq`. No
  record binds a reference equation (TR-18): the case selects IF97 or
  `Helmholtz` (PureFluidModel.cpp:198-203), one key per component, so no tie
  exists inside `pureFluids`.  A solution density from an inlet analysis
  (`AqueousVolumetric`) never reaches a unit.  Declared value versus package:
  the declared value wins everywhere except DistillationColumn.cpp:5209
  (sigma) and SprayDryer.cpp:124-138 (viscosity: a declared model
  overrides the knob).

## 4. The table

Printed once at assembly from the units' declared tags (verbosity >= 2) and
once at the end from the uses actually recorded; aggregated per (consumer
type, property, source).  As it would print for the three cases run:

```
[properties] liquid properties by consumer -- slice 0 describes what each unit uses
  consumer      units                        property  source                                         P
  storageTank   methanolTank acidTank        density   kernel: Vliq(25 C) x Rackett(T)                 not applied
  pump          methanolPump                 density   BYPASS: record Vliq 25 C, flat                  not applied
  valve         letdown                      density   kernel, left out CO dimethylEther (8.3e-3)      not applied
  column        lightsColumn                 density   kernel, left out CO dimethylEther (max 6.4e-2)  not applied
  column        lightsColumn                 sigma     declared by the case (hydraulics.sigma)         --
  sizing        methanolTank(storage, inventory) density kernel: Vliq(25 C) x Rackett(T)               not applied
```
(aceticAcid02_plant)
```
  pump          HPpump Booster               density   BYPASS: Vliq 25 C, NaCl volume 0, mass kept     not applied
  pressureExchanger PX                       volume    BYPASS: Vliq 25 C, NaCl volume 0                 not applied
  spiralWoundModule RO                       density   BYPASS: constant 1000 kg/m3 (default)           --
  spiralWoundModule RO                       viscosity declared by the case 0.95e-3 Pa s               --
  spiralWoundModule RO                       diffusivity BYPASS: 1.6e-9 m2/s legacy default            --
```
(membrane27_swro_energy_recovery)
```
  sizing        Separator LetdownHP StorageFlash NH3Storage density kernel, left out N2 H2 Ar     not applied
  sizing (utility side) water                density   pure fluid IF97 v(T, P)                         applied
```
(greenAmmoniaPEQ_baseCase, sectored; no shipped per-unit `thermo {}` override
sits on a liquid-property consumer -- section 9.)

**Result record**: a top-level block `propertySources`, one entry per
aggregated row: `consumerType`, `units`, `property`, `sourceId`, `label`,
`kernel` (bool), `package` (`global` or the unit), `pressureApplied`,
`leftOut` (names, largest fraction), `passes`.  A block a golden cannot read
arrives unpinned (settled contract of 2026-08-12), so the same commit adds a
golden row kind `source` keyed (unit, property) whose value is the
`sourceId` WORD (the `verdict` precedent).  Behaviour by binary (TR-15):
choupoSolve one record per run; choupoBatch, choupoCtrl and
choupoSemiContinuous aggregate over instants, and a (unit, property) that
used two sources across instants is two rows, which is itself a finding;
under an outer driver the registry is cleared per pass like
`ApproximationAuthorisation::clear()` and merged with a pass count.

## 5. Proof that no number moves

| surface | changes? | who reads it |
|---|---|---|
| every published number | no | goldens (`kpi`, `stream`, `equipment` ... rows) |
| result JSON | new block `propertySources` | golden kind `source` (new); GUI ignores unknown blocks (no whitelist found in gui/src or bin/curate) |
| expected files | rows ADDED only | a diff script: every pre-existing row byte-identical |
| log | the table, two times | gates that grep the log for presence only; none found comparing whole logs |
| line numbers in edited `src/` files | yes | EduTool citations: ThermoPackage.cpp (3), CSTR.cpp (6), PFR.cpp (4), Valve.cpp (2), HeatExchanger, Pipe, TrayHydraulics (2), ResultEmitter -- `--gui` |

**THE CHARACTERISATION BENCH (TR-16), recorded BEFORE any engine edit.**
A flag of `choupoProps` (`--property-route-bench <manifest>`, in
`applications/`, so no factory name and no props operation is added).  It
enumerates every record in `data/standards/components` and, for each,
density over every route the record supports (pure fluid IF97 and
`Helmholtz` for each `equation` registered; anchored, flat and bare Rackett
by construction of the package), viscosity (Andrade, Vogel, the
five-coefficient form), surface tension (stored correlation, Brock-Bird),
diffusivity (Wilke-Chang in water), plus the mixing rules on the binaries
with water and with ethanol.  Grid: T = 90, 120, 200, 250, 273.15, 277.15,
298.15, 323.15, 373.15, 473.15, 573.15 K x P = 1, 50, 500 bar.  Each line:
record, route, T, P, the value in `%a` (hexfloat) or the full `what()`.
Output lives in `build/` (gitignored); the TRACKED artefact is
`bin/curate/property_route_bench.sha256.tsv`, one hash per (record, route).
Re-run: `choupoProps --property-route-bench bin/curate/property_route_bench.manifest`.
Comparison after the slice: the old call AND the door, both against the
recorded hashes, bit for bit.  It becomes a gate (`check_property_route_bench`)
until the pilot, which re-records it with the moved rows listed.

**Validation sized by reach.**  The door and the bypass tags change no
arithmetic; the bench proves it for every route, witnesses do not.  The
result block reaches EVERY case (ResultEmitter is on every path), and adding
the `source` kind rewrites every expected file that has a consumer: that is
a full sweep, and its written reason is exactly this -- a new block on the
emitter every case goes through, and expected files that gain rows; the
targeted checks cannot show that no pre-existing row moved.  Plus `--gui`
(lesson citations), `check_wasm_dialect`, `check_layering`,
`check_compile_clean`.

## 6. The `approximations` hardening

Shipped blocks (7, every one with a `reason`): aceticAcid02_plant and
acetonePlant and acetone03_luyben_reaction_section
(`componentOutsideActivityModel`), basis01_two_unit_chain and
flash12_nh3_acetic_ethanol_reactive (`idealMolecularVLE`),
esterification2sector and crystalliser09_KHT_KCl_series (`idealBinaryPair`).
Parse sites: ApproximationAuthorisation.H:114-150 (two words) and
ThermoPackageBuilder.cpp:1095-1105 (`idealMolecularVLE`); both read `reason`
with `lookupWordOrDefault`, neither refuses an unknown word; ThermoOverride.H
refuses `approximations` in a fragment as an unknown key (kept).

Single parser: `ApproximationAuthorisation::readFrom` reads all three words;
the builder at :1095 asks it.  Unknown word: refused naming the three.
Missing `reason`: refused with the word and its components.  No shipped
case changes (all seven carry a reason, none an unknown word).  What
changes with it, in the same commit: `bin/choupo-resolve` (:195-200 writes
the block without a reason), the probe in `check_composite_limits.py:189`
(no reason), docs/ai/thermo.md:705 (example without reason).  Hazard to
measure first: `readFrom` is called on every v2 build
(ThermoPackageBuilder.cpp:2231), including the post and utility packages
built after the solve; the parse should fill a value owned by the build.

## 7. Documentation owed (rule 4d, C381)

| owed | where | after slice 0 it says |
|---|---|---|
| Theory Guide | new section `\label{ch:liquid-property-sources}` after `ch:rackett` (theoryGuide.tex:2277) | the door, the routes as they are, the bypass classes, the domain error kinds |
| Theory links | `gui/src/case/modelDocs.ts` for pump, CSTR, spiral wound to that section | -- |
| case author's assistant | NEW `docs/ai/thermophysical-properties.md` (bin/llmctx picks it up), one pointer line from thermo.md `## transport` (:440), docs/ai/packs/properties.md and pitfalls.md | where each property comes from today, how to read the table, "BYPASS" means the unit's number ignores the package, the refusals with remedies, and the measured deviations only (1.7; water +2 / -6.5 %; Brock-Bird on water +49 %; water-ethanol viscosity -59.7 %); no key that the engine does not accept |
| capability index | docs/ai/capabilities.md, Checks: "reports per consumer the source of a liquid property" | -- |
| source editor's assistant | docs/ai/extending.md section 2 | a unit asks the door; three lines below |
| settled contract | docs/architecture/settled-contracts.md, "A UNIT NEVER PRICES A LIQUID PROPERTY ITSELF" | + the ratchet |
| Tutorials Guide | the table read on pump01 and membrane27 | -- |

A new file, not an extension of thermo.md: thermo.md is the equilibrium
grammar (756 lines) and the kernel's audience asks a different question;
each later slice rewrites this one file.  Three lines for extending.md:

```cpp
using namespace Choupo::liquidProperty;
const Result r = evaluate(thermo, { Property::density, DensityPhase::Liquid, T, P, x });
const scalar rho = r.value;   // r.label says which method; a DomainError says why not
```

Proposed CLAUDE.md text (the coordinator edits it): section 5 pointer "- A
unit never prices a liquid density, viscosity, surface tension or
diffusivity itself: it asks `liquidProperty::evaluate` -> settled-contracts";
"Adding a new unit operation", new step: "A liquid property comes from
`liquidProperty::evaluate`; a constant or a `Vliq()` read is refused by
`check_liquid_property_ratchet`."  A brief to a general who builds a unit
names the door, the four acceptance criteria of rule 4d and this ratchet.

**Machine check**: `check_liquid_property_ratchet` counts `Vliq()` reads and
density literals (the greps of section 1) in `src/unitOperations` and
`src/postProcessing`; debt pinned in
`bin/curate/liquid_property_ratchet_debt.tsv` at today's inventory (file:
count), allowed only to shrink.  C379's EduTool reads `propertySources`
from the result, nothing else.

## 8. The code plan

| step | files | check | risk |
|---|---|---|---|
| 1 bench | choupoProps/main.cpp, manifest, `.sha256.tsv` | recorded twice, identical | none to numbers |
| 2 `DomainError` | new thermo header; the throws in ThermoPackage.cpp | bench; `what()` identical | a catch on the type: none exists |
| 3 door | `LiquidPropertyDoor.{H,cpp}`; the branch out-parameter | bench old = door, bit for bit | line shifts (lessons) |
| 4 tags and registry | the 1.1-1.4 bypass sites, EDCell.H | witnesses of each class byte-identical | a literal changed with its label |
| 5 table and block | ResultEmitter.cpp, SimulationResult.H, runTests `source` kind | full sweep, rows only added | WASM: no lambda capturing a structured binding, no C++20 initialisers |
| 6 `approximations` | ApproximationAuthorisation, builder, choupo-resolve, gate probe | the seven cases and the three gates | the post-build reset |
| 7 docs | section 7 | gates of docs | -- |

NOT in slice 0, though tempting: moving the pump or the CSTR onto the door;
renormalising the crystalliser; the column's Wilke-Chang; the pipe's Tc
rule; the 1000 defaults; the description fixes of section 9 that change a
printed line beyond the table (each is its own commit); `associating`.

## 9. Findings

1. **One liquid, two densities, in shipped cases.**  membrane27: the HP pump
   prices the RO feed at 1030.94 kg/m3 (dP 5.3e6 Pa / head 524.2277 m g:
   NaCl mass over water's volume) and RO at 1000 (default, unannounced):
   -3.0 %.  aceticAcid02_plant, fresh methanol at 300 K: storage tank and
   sizer 785.12, pump 787.27 (+0.27 %).
2. **Three different operations answer "a component with no liquid
   volume"**: the pump keeps its mass and gives it no volume (announced),
   `pricedDensity` leaves it out and renormalises (announced), the
   crystalliser gives it no volume and says nothing (crystalliser08).
3. **False self-descriptions**: ThermoPackage.cpp:2292 prints "IAPWS
   fundamental equation" for IF97, an industrial formulation (PEQ log);
   WilkeChang.H:43 says V_A at Tb, WilkeChang.cpp:45 reads the 25 C `Vliq`;
   SprayDryer.cpp builds `muLSource`/`sigmaSource` and never prints them,
   and the latter names Brock-Bird whatever model runs.
4. **Second selection rules**: Pipe.cpp:225-232 drops T > Tc itself
   (PricedDensity.H says one criterion); the column takes a declared sigma
   first in rating (TrayHydraulics.cpp:247) and the package's first in its
   efficiency (DistillationColumn.cpp:5209); no shipped case declares both.
5. **CSTR and PFR refuse a component absent from their feed** that has no
   `Vliq` (the loop does not test z > 0).
6. **Pressure is applied only on the pure-fluid route**: PEQ liquid NH3 at
   253.15 K gives 748.86 kg/m3 at 140 bar and at 20 bar.
7. **Announcements are once per process** (ThermoPackage.cpp:2429,
   Valve.cpp:288): under a driver only the first pass, and the "flat" and
   "bare" lines name only the first component.
8. **No shipped per-unit override reaches a liquid-property consumer**, and
   every sizer prices with the case's global package
   (choupoSolve/main.cpp:1005), never a unit's override.
9. **The routes record's premise that the primary binary equals main is
   false today** (ea0b3a81e).

**Disagreement with a ruling.**  "Printed at assembly, per consumer"
cannot be literal: which source a unit uses is known only when its code
path runs (pump with or without ions; spray dryer with or without a
model).  The assembly table is the units' declared tags; the result table
is what ran; a tag declared and not used, or used and not declared, is a
reported mismatch.  And the full sweep in section 5 is the price of the
contract that a result block is pinned in its commit; I see no honest way
around it.
