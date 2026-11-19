# Units, correlations and eight EduTools: an outside sweep

Read-only on main at 482c4acb32, 2026-11-19, at Vitor's request.  Four
independent readings, each with its own file:line evidence:
[units.md](units.md), [correlations.md](correlations.md),
[edutools-a.md](edutools-a.md) (mccabe, ponchon, kremser, psychro) and
[edutools-b.md](edutools-b.md) (levenspiel, epsilonNtu, fug, pinch).
Nothing here moves a number today; every unit trap is latent.

## 1. Unit traps: 18 families, all latent

Of 2251 scalar reads in src/, 728 pass a `Dims` and 1523 do not.  A trap is
an unchecked read whose value is used in a non-canonical unit, so writing the
unit silently gives a wrong number.

- **Component `Pc` is stored in bar** (`Component.cpp:325`, unchecked;
  `AmbroseWalton.cpp:66-71`; about 14 `c.Pc()*1e5` sites).
  - `water.dat:70` writes `Pc 220.64;`, and its own comment says "220.64
    bar".  Writing `Pc 220.64 bar;` would be read as 2.2e7 bar.
  - It reaches every component record.  The estimate `reference {}` block
    writes `Pc 47.0 bar;` and reads it as SI (`EstimateComponent.cpp:554`):
    two conventions for one key.
- **`pressureDesign` in bar.**  13 unchecked sizer sites against one checked
  one (`PressureExchangerSize.cpp:111`) in the same postDict.
- **Temperature differences** (`temperatureApproach`, `superheat`,
  `subcool`, `dTmin`, `latentWidth`): `10 C` is affine and becomes 283.15 K.
  `Dims::temperature` cannot tell a difference from a temperature.
- **Adsorbent amounts in mol/kg** (`q_max`, `H_298`, `initialLoading`,
  `floor`), with `b_298` per bar.  The membrane `chargeDensity` is in mol/m3,
  so a declared unit makes these 1000x small.
- **Economic years** (`projectLife`, `depreciableLife`,
  `constructionPeriod`): `yr` converts to seconds.  Also membrane `P_max` in
  bar, `wheelSpeed` (rpm), `spaceVelocity` (1/h), percent keys,
  `TminC`/`TmaxC`.
- **gibbsReactor `Q`** accepts `-500 kW` and uses it as J/mol.
- **Remedy, one home:** `lookupScalarIn(key, Dims, "bar")`.  A declared unit
  is converted from SI to the working unit; a bare value keeps the legacy
  meaning.  This is the `packingRecord::angleDegrees` pattern C449 already
  used.  Temperature differences get a `lookupTemperatureDifference` that
  refuses C/F by name.
- **Gate `check_unit_convention`, six arms (units.md §5):**
  1. an unchecked read meets a conversion constant;
  2. a trailing comment names a non-canonical unit;
  3. a unit is embedded in a key name;
  4. a temperature-difference key does not use the new helper;
  5. a key is declared with a unit in the corpus and read unchecked;
  6. sabotages.

## 2. Correlations: 88 instances, 24 full objects

- 24 full objects (window + citation + verify); only five check their window
  at run time.  32 objects lack at least one of the three.  32 are inline
  arithmetic in 20 files.
- **No `citation()`:** `HeatTransferCorrelation`, `PhaseChangeHTC`.
- **None of the three:** `MassTransferModel` (Schock-Miquel),
  `PressureDropModel`, the cyclone family, the atomiser, Wilke-Chang,
  Brock-Bird.
- **Inline:** Ergun, two-phase pipe flow (Lockhart-Martinelli, Friedel,
  Beggs-Brill), the pneumatic-conveyor drag, Ranz-Marshall
  (`SprayDryer.cpp:675`), Chilton-Colburn (`RateBasedSegment.cpp:494`),
  Watson, Rackett, Lee-Kesler.
- **Second homes:**
  - Ergun x3 (`PFR.cpp:1731`, `:1791`, `FixedBedAdsorber.cpp:1460`).
  - Blasius x2 (`PneumaticConveyor.cpp:275`).
  - Watson x2 (`Component.cpp:1449/1498`).
  - The Watson K factor x2.
  - The rotary-disc exponent x2.
- **Announcement defects:**
  - `Pipe` discards `FrictionResult::inValidity` (`Pipe.cpp:240/542`).
  - An out-of-window Nusselt is printed only at verbosity >= 2 and never
    reaches AdvisoryLog (`HeatExchanger.cpp:667/687`,
    `PhaseChanger.cpp:1064`).
- **First conversions, by reach:**
  1. Rackett (97 goldens);
  2. Watson;
  3. Schock-Miquel;
  4. `citation()` on the heat-transfer base;
  5. one Ergun object.

## 3. EduTools: nine wrong statements in eight lessons

1. **McCabe: R_min is wrong for a subcooled feed (q > 1).**  The tangent scan
   starts at x_F (`mccabeThiele.ts:264-266`), not at the q-line pinch.  At
   q = 1.5 and alpha 2.5 it gives 1.100 against 0.858, so R = 1.0 shows
   "pinched, N = inf".  No test checks q != 1.
2. **McCabe: azeotrope readout** shows N_min = 0 beside N = inf
   (ethanol/water, which step 5 asks for).
3. **Ponchon** promises difference points and stage steps; it draws one point
   and no steps.
4. **Psychro: the Lewis gap is said to be |1-Le|**; the engine uses Le^(2/3)
   (`PsychrometricChart.cpp:280`), so 15 % is said for 10.3 %.
5. **Psychro: "nitrogen gives the printed chart"**, while its own limits say
   it is 3.4 % high.  The Y_sat(60 C) values are stale (0.1586/0.1534 against
   goldens 0.15764/0.15248).
6. **Levenspiel: the T knob runs to 380 K.**  The feed boils at about 364 K
   and is all vapour at about 376 K, where the reactors switch to vapour
   concentrations.  The CSTR conversion falls from 0.83 to 0.01 in 2 K, shown
   as kinetics.
7. **epsilon-NTU step 1** says the outlets come from epsilon-NTU; only the
   duty does, and the outlets are inverted from enthalpy
   (`HeatExchanger.cpp:1031`).
8. **Pinch card** promises an in-view cascade the page no longer computes.
9. **Pinch step 4** says lowering dTmin always zeroes one target.  It is
   false: hot 400->300 K and cold 350->450 K, both CP 1 kW/K, keep both
   targets positive at every dTmin.

Suspect, the most important one: **Kremser shows A_NH3 = 1.535 at the gas
feed T** (`Absorber.cpp:272`), while the stages run at A 0.73-0.96.  A
student applying "A > 1" predicts the wrong regime (recovery 0.675 against
0.972).

**A gap: no EduTool covers fugacity** (phi, Poynting, the Lewis rule); `fug`
is the FUG shortcut.
