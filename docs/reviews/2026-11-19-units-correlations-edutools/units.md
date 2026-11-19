# Unit-conversion traps on unchecked scalar reads (tree 482c4acb32)

Method: every `lookupScalar`/`lookupScalarOrDefault` call in `src/` was parsed
(multi-line aware). 2251 reads in total: 728 pass a `Dims`, **1523 do not**.
Three scans ran over the unchecked set: a conversion constant on the target
variable (pi/180, 1e+-3, 1e5, 1e+-6, 60, 100, 3600, 86400, 273.15, CALORIE,
`units::*`) within 120 lines, or anywhere in the file for a member variable;
a trailing comment that names a non-canonical unit; and a key whose name
carries a unit. Last, every `key <num> <unit>;` declaration in `data/` and
`tutorials/` was cross-checked against its src readers.

Unit table facts that matter here: `C/degC/F` are affine (offset to K),
`deg` gives radians, `%`/`percent` give x0.01, `mol/kg` gives x1e-3 (molality
is canonical kmol/kg), `mol/m3` gives x1e-3, `rpm` gives /60, `1/h` gives
/3600, `yr` gives x3.15e7 s, `um` gives x1e-6, `cal/mol` gives x4.184, and
`1/MPa` exists.

**No key is wrong today.** Every key below is written bare in all of
`data/` and `tutorials/`. All of them are latent.

**The background is stale on one point.** `corrugationAngle` was fixed at
C449 (80cf200a2c). It goes through `packingRecord::angleDegrees`
(PackingRecord.cpp:361), which reads `unitWordOf` and is GUARDED.

## TRAP list (ranked by reach)

| # | file:line | key (bare convention) | a declared unit does | reach |
|---|---|---|---|---|
| 1 | thermo/Component.cpp:325 (and AmbroseWalton.cpp:71 `*1e5`, 13 `c.Pc()*1e5` consumers) | `Pc` (bar) | `48.9 bar` gives 4.89e6 read as bar, so every EoS is off by 1e5 | 544 standard components, 28443 groupEstimative, 276 tutorial files |
| 2 | sizing/ Cyclone:55, CatalystBed:74, Column:188,454, Crystalliser:69, SprayDryer:58, ShellTubeHX:487,521,581,1553, Evaporator:56, StirredTank:79, ConverterShell:94, Vessel:241, Compressor:47 | `pressureDesign` (bar) | `75 bar` gives 7.5e6 "bar". The only consequence is a MaterialLimits *announce* (MaterialLimits.cpp:41); the wall and cost come out absurd | 22 postDicts |
| 3 | GibbsReactor.cpp:339, EquilibriumReactor.cpp:163,172, GibbsMapOp.cpp:135, PhaseChanger.cpp:341,347, UtilityAllocationReport.cpp:536, **PinchPass.cpp:92,94 (Dims-checked!)** | temperature DIFFERENCES `temperatureApproach`, `superheat`, `subcool`, `dTmin`, `latentWidth` | `10 C` is affine, so it reads 283.15 K. `Dims::temperature` cannot tell a difference from a temperature | 14 + 2 + 30 cases |
| 4 | thermo/adsorbent/IsothermModel.cpp:126,163,164; FixedBedAdsorber.cpp:517; BatchAdsorber.cpp:287; FitParameters.cpp:2392 | `q_max`, `H_298`, `initialLoading.*`, `floor` (mol/kg); `b_298` (1/bar) | `mol/kg` gives x1e-3; `1/MPa` gives the wrong pressure basis | 32 + 4 files |
| 5 | thermo/membrane/Membrane.cpp:129 | `chargeDensity` (mol/m3) | `-5 mol/m3` gives -0.005, so DSPM-DE runs nearly uncharged | 24 records |
| 6 | economics: EconomicsPass.cpp:2871,2874,1047,1606 | `projectLife`, `depreciableLife`, `constructionPeriod`, `expiry` (years) | `10 yr` gives 3.15e8. The integer checks PASS (63072000 is an integer) | 15 cases |
| 7 | Membrane.cpp:69 | `P_max` (bar) | `41 bar` gives 4.1e6, so SpiralWoundModule.cpp:709 never fires. Module records (MembraneModule.cpp:291) write `P_max 83 bar;` and read it checked: same key, two conventions | 18 records |
| 8 | atomizer/RotaryAtomizer.cpp:42 `/60`; SprayDryer.cpp:1440 (KPI) | `wheelSpeed` (rpm) | `rpm` is registered, and its own comment names this key. `20000 rpm` gives 333, then /60 again | 9 cases |
| 9 | PitzerActivity.cpp:142, FreezingPoint.cpp:169, ENRTLMixedSolventOp.cpp:138, ENRTLMultiSaltOp.cpp:103, OlssonNaOH.cpp:68,69 | molality `m`, `totalMolality`, `from/toMolality` | `mol/kg` gives x1e-3 | ~10 files |
| 10 | sizing/VesselSize.cpp:162 (`*3600/SV`) | `spaceVelocity` (1/h) | `1/h` gives /3600, so the bed is 3600x | 3 |
| 11 | htc/BellDelaware.cpp:217 (`/100`) | `baffleCutPercent` | `25 %` gives 0.0025 | 2 |
| 12 | sizing/SprayDryerSize.cpp:91 | `targetSize` (um) | `40 um` gives 4e-5 against a micron KPI | 2 |
| 13 | PsychrometricChart.cpp:90,91 | `TminC`, `TmaxC` (degC) | `0 C` gives 273.15 used as degC | 2 |
| 14 | ENRTLMixedSolventOp.cpp:129 (`/100`) | `wtAlcohol` (wt %) | `20 %` gives 0.002 | 1 |
| 15 | PitzerActivity.cpp:155 (`*CALORIE`) | `phiL` (cal/mol) | `cal/mol` is converted twice | 1 |
| 16 | EconomicsPass.cpp:3475 | `operatorAnnualHours` (h) | `1960 h` gives 7.06e6 | 0 |
| 17 | ThermoPackageBuilder.cpp:3370, CatalogueLookup.cpp:493 (display only) | `maxAAD` in a record (per cent) | `8.8 percent` prints "0.09 %" | records |
| 18 | GibbsReactor.cpp:186 | `Q` (kJ/kmol) | a WRONG DIMENSION, accepted: `Q -500 kW;` (the heatExchanger03 spelling) gives -500 J/mol in silence | - |

**Same key, two conventions in one tree.** Two keys show this and should
come first:
- `Pc`: the estimate op's `reference {}` block writes `Pc 47.0 bar;` and
  reads it as SI (EstimateComponent.cpp:554). A curator who copies it into a
  component record gets 4.7e6 bar.
- `pressureDesign`: in the same postDict it is checked by
  PressureExchangerSize.cpp:111 and read as raw bar by thirteen other sizers.

Another inconsistency, SAFE: bare `coneAngle` (PressureSwirlAtomizer.cpp:49)
means radians, while a bare `corrugationAngle` means degrees.

## The fix is not always "add Dims and drop the factor"

That only works where the bare convention is canonical SI. Here **none of
the trap keys are canonical when bare** (bar, mol/kg, rpm, %, yr, degC).
Adding `Dims::x` alone would accept the declared unit, and then the
existing factor would be applied on top of it. Use the `angleDegrees`
pattern in one home instead:

```cpp
scalar Dictionary::lookupScalarIn(key, Dims, "bar")
// hasDimensions ? units::fromSI(SI, "bar") : bare legacy value
```

Examples:
- `Pc_ = d->lookupScalarIn("Pc", Dims::pressure, "bar")`
- `q_max_ = p->lookupScalarIn("q_max", Dims::molality, "mol/kg")`
- `Nrpm_ = ...In("wheelSpeed", Dims::inverseTime, "rpm")`
- years via `"yr"`
- `baffleCutPercent` via `"percent"`

For temperature differences, add `lookupTemperatureDifference(key)`. It
refuses `C/degC/F` by name and accepts K or bare.

## SAFE / GUARDED counts

- **(a) manual conversion after an unchecked read:** 37 candidates.
  - TRAP 7: Pc, wheelSpeed, baffleCut, wtAlcohol, spaceVelocity, phiL,
    and pressureDesign's announce.
  - GUARDED 4: corrugationAngle, EvidencePartition `maxAAD`
    (`unitWordOf`), ExchangeInput `resinDose`/`CEC` (`hasDimensions`),
    Speciate atmosphere (dims checked).
  - SAFE 26: SI to working-unit or display (TrayHydraulics x3, UA/1000 x3,
    `catalystLoading` x4 kg/m3, MW/1000, HvapTb, Hfus, eta x3, DrumSize,
    RosinRammler, SteamTables, GibbsMapOp, ScalingScan, MembraneShortlist,
    choupoBatch fraction, ReactionHeat, V0 cm3/mol which has no writable
    unit).
- **(b) amount basis:** TRAP 12 sites. SAFE 14: J/mol is canonical
  (`dH_ads` x2, `HvapTb`, `dHf_298`, `Hfus`, `Hsub`), and so are
  kmol/s `extent`/`F`, `CEC`/`CEC_dry`. `v_inf` and `bedCapacity` have no
  registered unit.
- **(c) temperatures:**
  - 78 unchecked absolute-T reads are SAFE (affine C gives the right K).
  - TRAP: 10 difference sites (3 of them Dims-checked) and 2 degC-named
    keys.
- **(d) percent:** TRAP 3 (2 compute, `baffleCutPercent`/`wtAlcohol`; 1 display, `maxAAD`).
  About 69 unchecked fraction-like reads are SAFE, because `%` gives the
  correct fraction.

## Proposed gate: `check_unit_convention`

1. **Conversion arm.** Use the scanner above. Flag an unchecked read whose
   target, within the statement, 120 lines, or file-wide for `member_`,
   meets `[*/]` and a conversion constant outside `<<`/`printf`/`kpis_`/
   `d.set`. Each hit must either go through `lookupScalarIn`/`unitWordOf`/
   `hasDimensions` or carry a `debt_registry` entry.
2. **Comment arm.** Flag an unchecked read whose `//` names a non-canonical
   unit (bar, mol/kg, mol/m3, rpm, %, um, 1/h, yr, degC, cal, mm).
3. **Key-name arm.** Flag an unchecked read of a key spelled `*Percent`,
   `*Pct`, `*_pct`, `*C`, `*_bar`, `*_h`.
4. **Temperature-difference arm.** A declared list (`dTmin`, `superheat`,
   `subcool`, `temperatureApproach`, `latentWidth`, ...) must be read
   through `lookupTemperatureDifference`. This holds even when the read
   carries `Dims::temperature`.
5. **Corpus arm.** A key declared anywhere with a non-identity unit word
   fails if any of its readers is unchecked. Key-name collisions across
   record kinds (`P`, `K`, `value`) need a reader-to-record-kind map, or
   that arm will accuse the innocent.
6. **Sabotage.** Re-insert the C449 double conversion in PackingRecord and
   strip a `Dims::` from one sizer; both must be caught.
