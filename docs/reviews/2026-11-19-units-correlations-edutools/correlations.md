# Census of empirical correlations in src/ (tree 482c4acb32, read-only)

Interface learnt: `FrictionFactorCorrelation` (hydraulics/friction/FrictionFactorCorrelation.H:118) and the
five transport bases (TransportModel.H:81-83, DiffusivityModel.H:82-84, LiquidViscosityModel.H:83-85,
ThermalConductivityModel, LiquidConductivityModel) carry `validityWindow()` (a STRING), `citation()`,
`verify()`; transport anchors are `CorrelationVerify` (kind theory|arithmetic). `HeatTransferCorrelation`
(htc/HeatTransferCorrelation.H:95) and `PhaseChangeHTC` have window + verify, NO `citation()`.
`MassTransferModel`, `PressureDropModel`, `CycloneModel`, `Atomizer`, `LiquidDiffusivityModel`,
`SurfaceTensionModel` have NONE of the three. Legend: W window, Chk run-time check (A = AdvisoryLog,
c = console only, - = none), C citation() in code, V verify().

## Table

| Correlation | Family | file:line | Class | W | Chk | C | V |
|---|---|---|---|---|---|---|---|
| Blasius, Colebrook, Haaland, Churchill | Darcy f | friction/FrictionFactorCorrelation.cpp:75-306 | i | y | in result; **Pipe drops it** (Pipe.cpp:542 `.f`), only transition band announced (A); PipeHeaderSize:266 / LineSheets:454 print | y | y |
| Chung, ChapmanEnskog | gas mu | ChungViscosity.cpp:72, ChapmanEnskog.cpp:99 | i | y | A (T*, Omega range) | y | y |
| Eucken, modifiedEucken | gas k | Eucken.cpp, ModifiedEucken.cpp | i | y | - | y | y |
| Fuller | gas D | Fuller.cpp:46 | i | y | - | y | y |
| Andrade, Vogel, chemsepEq101, table | liquid mu | Andrade/Vogel/ChemSepVisc101.cpp:87 | i | y | eq101 A; table refuses; Andrade/Vogel - | y | y |
| SatoRiedel, chemsepEq16 | liquid k | SatoRiedel.cpp, ChemSepCond16.cpp:77 | i | y | eq16 A; SatoRiedel - | y | y |
| Li-Finlayson | bed wall h | wallHeatTransfer/LiFinlayson.H:136 | i | y | A (PFR.cpp:1318) | y | y |
| Austin/HerbstFuerstenau/VogelPeukert, Austin breakage, Bond, Whiten/RosinRammler | mill, partition | millModel/MillModels.cpp, classifierModel/PartitionCurves.cpp | i | y | verify run in solve (Mill.cpp:361) | y | y |
| Wilke phi_ij | gas mixing | GasMixingRules.H:88 | ii | n | - | n | y (theory) |
| Liquid mu/k mixing, sigma mixing | mixing rules | *MixingRule.H | ii | y | - | y | n |
| Dittus-Boelter, Gnielinski, Kern | Nu | htc/DittusBoelter.H:63, Gnielinski.H, Kern.H:65 | ii | y | in result; HeatExchanger.cpp:667/687 **cout at verbosity>=2 only**; ShellTubeHX.cpp:1447 A | n (comment) | y |
| NusseltFilm, Rohsenow, ZuberCHF | phase-change h | htc/NusseltFilm.H, Rohsenow.H, ZuberCHF.H | ii | y | PhaseChanger.cpp:1064 cout at verbosity>=2; ShellTubeHX:1475 A | n | y |
| Schock-Miquel Sh, StirredCell Sh | membrane k_film | massTransfer/SchockMiquel.H:69, StirredCell.H:107 | ii | n | - | n (comment) | n |
| Schock-Miquel friction | membrane dP | pressureDrop/SchockMiquelDrop.H:66 | ii | n | - | n | n |
| Lapple, LeithLicht, IoziaLeith, Barth, Muschelknautz; Shepherd-Lapple dP | cyclone | cycloneModel/*.cpp, CycloneModel.cpp:89 | ii | n | - | n | n |
| Friedman/Marshall disc, direct-drop regimes, windage Cm; pressure-swirl | droplet d32 | RotaryAtomizer.cpp:58/80-84/105, PressureSwirlAtomizer.cpp:78-94 | ii | note string | printed note | n | n |
| Wilke-Chang | liquid D | WilkeChang.cpp:58 | ii | n | - | n | n |
| Brock-Bird | sigma | BrockBird.cpp | ii | n | - | n | n |
| AIChE, Chan-Fair, Syeda-Chuang | tray efficiency | TrayEfficiency.cpp:71-91, 96-130, 150-210 | ii (static, enum) | n | throws on non-physical; SyedaChuang flag | comment | n |
| Rocha-Bravo-Fair, Delft | packing ae/kG/kL/dP | PackingRBF.cpp:87-130, PackingDelft.cpp:81-124 | ii (static) | record ranges (PackingRecord.cpp:115) | refuse | comment | n |
| Joback, Riazi-Daubert, Van Krevelen | curation estimators | propertyOps/ConstantEstimator.H:117 | ii | n | - | method word | n |
| ED Sherwood powerLaw | ED stack | EDCell.cpp:304 (coeffs from record) | ii | record Re | A | record | n |
| Ergun | packed-bed dP | PFR.cpp:1731, **PFR.cpp:1791**, **FixedBedAdsorber.cpp:1460** | iii (3 homes) | n | - | A note (PFR.cpp:1705) | n |
| Fair flooding (Lygeros-Magoulas) | tray capacity | TrayHydraulics.cpp:56, 303 | iii | F_LV, open area | refusal + cout note (571) | comment | n |
| Sinnott h_d, h_ow, h_dc; Bolles-Fair | tray dP | TrayHydraulics.cpp:396-425 | iii | n | - | comment | n |
| Lockhart-Martinelli/Chisholm, Butterworth, Friedel, Beggs-Brill | two-phase dP | Pipe.cpp:305-319, 321, 338-343, 351-412 | iii | n | - | comment | n |
| Schiller-Naumann drag | particle | PneumaticConveyor.cpp:51 | iii | n | - | comment | n |
| Blasius (Fanning) | gas f | **PneumaticConveyor.cpp:275** | iii (2nd home) | n | - | n | n |
| Yang 1974 solids f; Rizk saltation | pneumatic | PneumaticConveyor.cpp:295-299, 372-375 | iii | Yang eps (442) | A/refuse | comment | n |
| Dodge-Metzner | non-Newtonian f | NonNewtonianPipe.cpp:140 | iii | n | - | comment | n |
| Ranz-Marshall Nu/Sh | droplet | SprayDryer.cpp:675-676 | iii | n | - | comment | n |
| Chilton-Colburn / penetration | rate-based h | RateBasedSegment.cpp:494-495 | iii | n | - | n | n |
| Molokanov (Gilliland), Kirkbride | shortcut column | ShortcutColumn.cpp:269, 287-289 | iii | n | - | comment | n |
| Karra capacity factors | screen | Screen.cpp:55-75, 249-256 | iii | n | - | comment | anchor (Screen.cpp:100) |
| Bell-Delaware (ESDU/Serth j, Taborek J, Kf) | shell side | BellDelaware.cpp:364-381, 473, 652 | iii (functions) | partial | A info | comment | arithmetic note |
| Kern row correction N^-1/4 | condensing bank | ShellTubeHX.cpp:729 | iii | n | - | n | n |
| Tube-count K1, n1 | bundle | ShellTubeDesign.cpp:59-73 | iii | n | - | n | n |
| Geraldes-Afonso suction | membrane film | InterfaceBalance.cpp:82 | iii | phi<20 | A | message | n |
| Dechadilok-Deen K_d, K_c | pore hindrance | DSPM_DE.cpp:136-144 | iii | n | - | comment | n |
| Impeller Po (eq 8.7), Re_turb (eq 8.8) | agitation | Impeller.cpp:179, AgitatedVessel.cpp:163 | iii | 8.7 y | A list | record provenance | n |
| Watson dHvap | latent heat | **Component.cpp:1449 and 1498** | iii (2 sites, 15 caller files) | n | - | comment | n |
| Rackett | liquid V | DerivedClosures.H:65 (one home, 7 callers) | iii | n | - | n | n |
| Lee-Kesler omega | acentric | DerivedClosures.H:54 (2 callers) | iii | n | - | n | n |
| Watson K factor | petroleum | **RiaziDaubert.cpp:117, EstimateComponent.cpp:785** | iii (2 homes) | n | - | n | n |
| Riazi Eq 3.17 SG | petroleum | PetroleumCuts.cpp:219 | iii | n | - | string | n |
| Rotary-disc N^0.6 scaling | sizing | **SprayDryerSize.cpp:97** (2nd home of RotaryAtomizer.cpp:58 exponent) | iii | n | - | n | n |

Not counted (theory, declared, or data): Stokes/Sigma (SedimentingCentrifuge, Stokes window checked), Kremser,
Fenske/Underwood, Merkel, declared Dax/k_LDF/k_Y, IAPWS, UNIFAC group contribution (activity model).
Not present: O'Connell efficiency, Onda wetted area, any HETP correlation (HETP is derived from RBF/Delft),
Zuber is present only as CHF, no Wakao-Funazkri / Wilson-Geankoplis yet (C450, ruled, not built).

## Counts (correlation instances)

- (i) full object: ~24 (friction 4, gas transport 5, liquid transport 6, Li-Finlayson 1, solids 8). Window
  CHECKED at run time for 7 of them (Chung, ChapmanEnskog, chemsepEq101, chemsepEq16, Li-Finlayson, friction
  where the caller reads it); declared-only for Eucken x2, Fuller, Andrade, Vogel, SatoRiedel.
- (ii) object missing something: ~32 (HTC 6 lack citation; membrane 3, cyclone 6, atomizer 4, Wilke-Chang,
  Brock-Bird, tray efficiency 3, packing 2, estimators 3, mixing rules 4 lack verify, ED Sherwood 1).
- (iii) inline arithmetic: ~32 sites across 20 files.

Second homes: Ergun x3 (two in PFR.cpp, one in FixedBedAdsorber.cpp); Blasius (friction family vs
PneumaticConveyor.cpp:275); Watson dHvap x2 in Component.cpp; Watson K x2; rotary-disc exponent x2.
Wilke phi_ij, Rackett and Lee-Kesler omega are single homes (good).

Two announcement defects worth fixing independently of conversion: `Pipe` discards
`FrictionResult::inValidity` (Pipe.cpp:240, 542); `HeatExchanger`/`PhaseChanger` print an out-of-window Nu
only inside `if (verbosity >= 2)` and never into AdvisoryLog (the "announcement inside a conditional" shape).

## Ten highest-value conversions (reach = tutorials that select the word)

1. **Rackett** (97 goldens mention it; every liquid-density route) - a `LiquidVolumeCorrelation` object around
   `closures::rackettVliq`: window Tr<1, Spencer-Danner 1972 citation, arithmetic anchor (Zra at Tr=1 gives
   RTc/Pc Zra^1).
2. **Watson dHvap** (15 caller files: evaporator, column, phase changer...) - fold Component.cpp:1498 into
   :1449, add window (Tr<1, announce T>Tc returning 0), Watson 1943 citation, theory anchor (= HvapTb at Tb).
3. **Schock-Miquel k_film/friction** (20 cases) - give MassTransferModel and PressureDropModel the three methods;
   Re window from Schock & Miquel 1987, announced once per unit.
4. **Dittus-Boelter/Gnielinski/Kern** (13 cases + 16 sized exchangers) - add `citation()` to the HTC base
   (and PhaseChangeHTC), and route HeatExchanger/PhaseChanger window breaches to AdvisoryLog at all verbosity.
5. **Ergun** (16 cases, 3 homes) - one `PackedBedPressureDrop` object (Ergun 1952) called by PFR (both sites)
   and FixedBedAdsorber; Re_p published, arithmetic anchor; fits beside C450's dispersion/film objects.
6. **Cyclone family** (Lapple in 14 cases) - three methods on CycloneModel; inlet-velocity and geometry window
   announced; Lapple/Shepherd-Lapple anchor from the book's worked example.
7. **Brock-Bird sigma** (31 cases) and **Wilke-Chang** (17 cases; feeds tray efficiency and rate-based) - give
   SurfaceTensionModel and LiquidDiffusivityModel the CorrelationVerify interface (Poling examples as anchors).
8. **Rotary atomizer** (15 spray-dryer cases) - Atomizer base gains the three methods; SprayDryerSize.cpp:97
   asks the object for its speed exponent instead of a literal 0.6.
9. **Ranz-Marshall** (13 spray-dryer cases) - a particle-transfer correlation object (Ranz & Marshall 1952,
   Re window), the natural sibling of C450's Wakao-Funazkri film coefficient.
10. **Tray efficiency + Fair flooding** (column hydraulics 13 cases, efficiency models 7) - convert the
   TrayEfficiency enum and TrayHydraulics' C_SB into registered objects with window (F_LV, Fa, Pe_G) announced
   through AdvisoryLog instead of the console note at TrayHydraulics.cpp:571; anchors from Treybal/Kister
   worked examples.

Cheap riders: replace PneumaticConveyor.cpp:275 with `FrictionFactorCorrelation::New("Blasius")` (Darcy/4),
unify the Watson K factor, and wire Pipe's `inValidity` into AdvisoryLog.
