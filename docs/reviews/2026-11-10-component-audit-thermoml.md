# The catalogue's pure-component records read against the NIST ThermoML archive (C279, 2026-11-10)

Subject: the pure-component records under `data/standards/components/` (608 files), compared with every
measured pure-compound point the NIST ThermoML archive locates, for four properties: vapour pressure,
liquid heat capacity, liquid viscosity, liquid density.  Tool: `bin/curate/audit_components_thermoml.py`.
Nothing in the catalogue, the engine or any gate was changed.  Branch `c279-component-audit`.

Aggregate statistics and DOIs only.  No measured value is reproduced here (C225/C226: DOI and archive
sha256, not the data); the per-point CSV is written to a scratch path by the script and never enters the tree.

## Summary

- 282 of the 608 components carry at least one qualifying measured point; 49 451 points from 3 078 studies
  (DOIs) qualified for the four properties; 676 (component, property, model) rows were analysed.
- **The positive control passes**: water's catalogue vapour pressure puts its boiling point 0.61 K low over
  243 points in 50-200 kPa (71 studies) and 0.69 K low over the 57 points within 99-103.5 kPa (46 studies);
  C16 measured 0.5-0.7 K.
- **Records that carry a MEASUREMENT-FITTED model are mostly sound**: median clean AAD 0.84 % for the 211
  Antoine vapour-pressure rows (p90 3.1 %), 0.20 % for liquid density on the 211 rows anchored on a declared
  `Vliq` (p90 0.9 % over all 216), 1.3 % for liquid Cp (p90 7.5 %), 2.7 % for the 130 ChemSep viscosity rows
  (p90 13.5 %).
- **Records that carry an ESTIMATE are not**: the 25 `AmbroseWalton` vapour-pressure rows have median clean
  AAD 19.6 % (p90 82.7 %), 15 are suspect by the rule below, and three of the four worst rows of the whole
  audit are in that group (glycerol 99.7 %, diethylethanolamine 82.7 %, methyldiethanolamine 70.0 %).  Their
  records declare no `Trange`, so nothing in a run warns.
- Three further groups need attention (section 7): `Vliq` datums the measurements contradict (propane
  +6.3 %, n-butane +5.3 % in density, four independent studies each), records with no `Vliq` where bare
  Rackett is 23-34 % off (the fatty-acid methyl esters), and individual wrong fits (diisopropanolamine
  Antoine -45.6 % across three studies that all sit INSIDE its declared window).
- The commissioning counts (330 components; 67 167 density points, ...) are block counts over every phase
  and pressure; after the filters that make a comparison meaningful the counts are those above (section 4).
  Neither set is wrong; they answer different questions.

## 1. Method

**Archive.**  DOI 10.18434/mds2-2422, `ThermoML.v2020-09-30.tgz`, sha256
`231161b5e443dc1ae0e5da8429d86a88474cb722016e5b790817bb31c58d7ec2` (the value in
`thirdParty/thermoml/SYNC.json`; the script re-computes the tarball's sha256 on every run and refuses on a
mismatch -- checked today: equal).  11 923 XML files; 2 are not well-formed XML (`index.json` lists them as
refused: `j.fluid.2018.07.020`, `j.fluid.2018.07.021`) and are not read.

**Join.**  `thirdParty/thermoml/identity.json` (built by `bin/choupo-thermoml identity`): InChIKey ->
catalogue names.  It joins 483 of the 608 catalogue names to an archive compound.  A block is read only
when it has exactly one `<Component>`; its compound is found through `<RegNum><nOrgNum>` ->
`<sStandardInChIKey>`.  The join is never by name.

**Filters (the point must be one the engine's model is entitled to be asked).**
- Vapour pressure: "Vapor or sublimation pressure, kPa" and "Boiling temperature at pressure P, K" (read as
  a (T, P) point).  Excluded: any point whose property phase, or (when that is absent) block phases, is a
  crystal (1 580 points).
- Cp, viscosity, density: property phase `Liquid` only; pressure at most 1 000 kPa when stated (44 381
  points of the three properties above it are excluded; a point with no stated pressure is kept).  Molar and
  specific Cp are both read (specific converted with the record's `MW`).  Excluded as ambiguous or
  off-model: phase "fluid (supercritical or subcritical)" (768 density points at <= 1 MPa), gas, crystal,
  glass, metastable liquid (157 Cp points), kinematic viscosity, molar density.
- Blocks with a variable other than T and P (9) are skipped.

**Engine values.**
- Vapour pressure `Psat_<comp>`, liquid Cp `Cp_liquid_<comp>` and liquid viscosity `viscosity_liquid` come
  from `choupoProps` `propertyScan1D` with `vary { variable T; points ( ... ); }` at the measured
  temperatures, one scratch case per component (single-component `thermoPhysPropDict`, ideal liquid, ideal
  gas), built by the script outside the tree.  Viscosity is evaluated once per model the record carries,
  selected by `transport { liquid { viscosity { model ...; } } }`: `chemsepEq101` (130 components),
  `andrade` and `vogel` (the 5 components with those blocks).
- A point the engine refuses (e.g. Psat above Tc, its own physical wall) is dropped and counted, never
  substituted: vapour pressure 16 861 qualifying points, 16 814 evaluated.
- **Liquid density is NOT exposed by any `choupoProps` key** (checked in
  `src/propertyOps/PropertyEvaluator.cpp`: no density key).  The audit therefore recomputes the engine's
  route INDEPENDENTLY in Python: `ThermoPackage::density`, liquid branch
  (`src/thermo/ThermoPackage.cpp`, from `constexpr scalar Tref_Vliq = 298.15`): V(T) = Vliq * R(T)/R(298.15)
  where R is `closures::rackettVliq` (`src/thermo/DerivedClosures.H`), anchored when the record declares
  `Vliq` and `Tc`/`Pc`; flat `Vliq` without critical constants; bare Rackett without `Vliq`; refused at
  T >= Tc.  **Labelled "recomputed" everywhere below (the `*` in tables).**  Cross-checked against the
  engine's own published density -- the `pipe` unit's `density` KPI, from
  `tutorials/steady/hydraulics/pipe01_water_line` copied to scratch with the component and T replaced
  (`--cross-check-density`):

  | component | T = 290 K | T = 300 K | T = 320 K |
  |---|---|---|---|
  | water | 1004.4274 vs 1004.4274 | 995.2509 vs 995.2509 | 976.5798 vs 976.5798 |
  | ethanol | 797.0787 vs 797.0787 | 785.3115 vs 785.3115 | 761.1081 vs 761.1081 |
  | benzene | 881.4970 vs 881.4970 | 871.6279 vs 871.6279 | 851.4064 vs 851.4064 |
  | methanol | 796.6848 vs 796.6848 | 785.1166 vs 785.1166 | 761.3063 vs 761.3063 |

  (engine KPI vs recomputed, kg/m3; worst relative difference 1.4e-12.  Acetone and toluene could not be
  used: acetone has no `liquidViscosity` block and the pipe refuses it; at the template's flow toluene's
  pressure drop exceeds the inlet pressure.)  The same density route is what the `pipe` and `pump` units
  price with, so what is audited is what a unit would use.
- An independent spot check of the engine path itself: water Antoine at 300 K evaluated by hand from the
  record's coefficients, 3533.5278 Pa, against the engine's 3.53352783e3 Pa.

**Statistics.**  Relative error = (engine - measured)/measured.  Reported per (component, property, model),
INSIDE and OUTSIDE the record's declared validity window separately: n, bias (mean signed error), AAD
(mean absolute error), maximum absolute error, and the share of points whose absolute deviation is within
the point's own expanded uncertainty (`<nCombExpandUncertValue>`; for boiling-temperature points the
comparison is in K).  Windows: `vaporPressure.Trange`, `liquidHeatCapacity.Trange`, `Tmin`/`Tmax` of a
`chemsepEq101` block; the `andrade` and `vogel` blocks declare none ("none" in the tables, all points in one
bucket).  The Rackett density route declares none: the audit uses its own convention, T <= 0.95 Tc, and says
so (a saturated-liquid correlation is not asked near the critical point).

**Equivalent boiling-temperature error.**  For vapour pressure the engine's own curve is scanned on a 0.5 K
grid around the data (never beyond Tc) and inverted by log-linear interpolation: dTb = T_engine(P_measured)
- T_measured (negative = the catalogue boils too cold).  Reported as the mean over points with P_measured in
50-200 kPa.  No linearisation: a first, linear-slope version gave hundreds of K where the curve is badly
wrong, and was replaced.

**Per-study screen (flags a STUDY, not a record).**  The record's error depends on T, so studies covering
different ranges are not compared by their median error.  Each point's error is compared with the consensus
(median of the other studies' own bin medians) in its temperature bin (width max(5 K, span/15)); a bin needs
at least two other studies.  A study with at least three comparable points whose median difference from
consensus exceeds 3 x FLOOR is flagged, FLOOR being what the property is ever measured to (vapour pressure
and Cp 1 %; viscosity 2 %; density 0.1 %).  A study with too few neighbours is "unverifiable", not flagged.
**A record is suspect** only when, after removing flagged studies, at least two studies remain and their AAD
(in-window points, or all points when no window is declared) exceeds 5 % (vapour pressure, Cp), 10 %
(viscosity) or 2 % (density).  A row with a single study can be ranked by deviation but is never called
suspect: one study cannot be told from a bad one.

## 2. What is and is not checked

Checked: the record's own models, as the engine evaluates them, against measured pure-compound points of
four properties at the pressures a saturated or near-ambient liquid model is meant for.

NOT checked: mixtures; gas-phase properties; critical constants, enthalpy of vaporisation, thermal
conductivity, surface tension, ideal-gas Cp; pressure dependence (liquid points above 1 MPa are excluded);
whether an archive point is itself right -- the archive transcribes journal tables, and "within the stated
uncertainty" is a weak test here because 49 405 of the 49 451 qualifying points carry an expanded
uncertainty, assigned by the archive's data-file compiler and not necessarily by the authors; the two
unparseable files; the 125 catalogue names the identity bridge does not join; the sealed mirrors; the
engine's extrapolation announcements (not read).  A record with one or two studies is only as good as they
are.

## 3. Positive control and reference fluids

Water, vapour pressure (the record's `Antoine`, declared `Trange` 273-373 K; 843 points from 98 studies,
139 of them outside the window): inside the window bias +1.01 %, AAD 1.54 %; the engine boils 0.614 K cold
on average over 50-200 kPa (243 points, 71 studies) and 0.693 K cold within 99-103.5 kPa (57 points, 46
studies).  This is the 0.5-0.7 K C16 measured and what the record's own header says (the fit puts Tb at
372.45 K against the declared 373.15 K).  Water's Cp (the constant 75.5 J/mol/K) agrees to 0.37 % AAD; its
viscosity is Andrade 3.50 % against Vogel 1.38 % AAD (both blocks are in the record; the case chooses).

Reference fluids (inside the declared window; the density window is the audit's own Tr <= 0.95; `*` =
recomputed route; bias / AAD / max in %; last column is bias / AAD outside the window):

| component | prop | model | pts | studies | T span K | window K | pts outside | bias / AAD / max | within unc | outside bias / AAD |
|---|---|---|---|---|---|---|---|---|---|---|
| acetone | vp | Antoine | 88 | 24 | 298-365 | 259-508 | 0 | -0.40 / 0.47 / 1.0 | 73 % | - |
| acetone | dens | RackettAnchored* | 125 | 60 | 278-328 | 0-483 | 0 | +0.73 / 0.73 / 1.5 | 1 % | - |
| benzene | vp | Antoine | 102 | 34 | 283-520 | 288-354 | 19 | -0.13 / 0.51 / 5.2 | 80 % | -0.84 / 1.27 |
| benzene | cp | liquidHeatCapacity | 23 | 5 | 293-350 | 278-350 | 1 | -1.91 / 2.55 / 9.3 | 73 % | -10.45 / 10.45 |
| benzene | visc | andrade | 79 | 25 | 288-393 | none | - | +0.03 / 0.82 / 7.6 | 94 % | - |
| benzene | visc | vogel | 79 | 25 | 288-393 | none | - | -0.42 / 0.81 / 4.7 | 84 % | - |
| benzene | dens | RackettAnchored* | 325 | 121 | 283-353 | 0-534 | 0 | +0.04 / 0.09 / 0.4 | 51 % | - |
| ethanol | vp | Antoine | 562 | 113 | 273-498 | 273-369 | 20 | +0.06 / 0.53 / 10.2 | 84 % | +4.32 / 4.40 |
| ethanol | cp | liquidHeatCapacity | 87 | 11 | 265-348 | 280-351 | 6 | -4.54 / 5.74 / 15.0 | 22 % | +8.73 / 8.73 |
| ethanol | visc | andrade | 437 | 112 | 268-348 | none | - | +0.52 / 1.89 / 42.5 | 69 % | - |
| ethanol | visc | vogel | 437 | 112 | 268-348 | none | - | -0.14 / 2.27 / 41.0 | 62 % | - |
| ethanol | dens | RackettAnchored* | 1024 | 359 | 233-413 | 0-488 | 0 | -0.06 / 0.49 / 9.2 | 14 % | - |
| methanol | vp | Antoine | 289 | 91 | 274-433 | 288-356 | 56 | -0.11 / 0.46 / 4.7 | 87 % | +3.15 / 3.25 |
| methanol | cp | liquidHeatCapacity | 53 | 9 | 248-398 | 280-340 | 11 | -2.31 / 3.72 / 12.4 | 38 % | -9.04 / 14.35 |
| methanol | visc | andrade | 264 | 70 | 278-334 | none | - | -1.83 / 2.30 / 37.8 | 68 % | - |
| methanol | visc | vogel | 264 | 70 | 278-334 | none | - | -1.83 / 2.30 / 37.8 | 68 % | - |
| methanol | dens | RackettAnchored* | 742 | 263 | 273-512 | 0-487 | 1 | -0.13 / 0.31 / 9.2 | 23 % | -7.32 / 7.32 |
| toluene | vp | Antoine | 221 | 50 | 254-573 | 273-380 | 50 | -0.08 / 0.82 / 8.7 | 83 % | -0.30 / 1.49 |
| toluene | cp | liquidHeatCapacity | 24 | 4 | 228-353 | 280-380 | 4 | -3.32 / 3.76 / 10.3 | 40 % | +12.29 / 12.29 |
| toluene | visc | andrade | 195 | 49 | 248-373 | none | - | -0.32 / 1.07 / 8.7 | 77 % | - |
| toluene | visc | vogel | 195 | 49 | 248-373 | none | - | -0.32 / 1.07 / 8.7 | 77 % | - |
| toluene | dens | RackettAnchored* | 527 | 171 | 233-545 | 0-562 | 0 | +0.03 / 0.12 / 11.3 | 65 % | - |
| water | vp | Antoine | 843 | 98 | 261-548 | 273-373 | 139 | +1.01 / 1.54 / 22.1 | 58 % | +4.85 / 4.87 |
| water | cp | liquidHeatCapacity | 164 | 20 | 278-373 | 273-373 | 1 | +0.10 / 0.37 / 1.6 | 97 % | -0.67 / 0.67 |
| water | visc | andrade | 618 | 125 | 273-369 | none | - | +0.89 / 3.50 / 23.0 | 55 % | - |
| water | visc | vogel | 618 | 125 | 273-369 | none | - | -0.92 / 1.38 / 23.2 | 94 % | - |
| water | dens | RackettAnchored* | 1469 | 369 | 273-433 | 0-615 | 0 | -0.40 / 0.76 / 5.6 | 19 % | - |

## 4. Coverage

Catalogue records: 608.  Joined to an archive compound by InChIKey: 483.  With at least one qualifying
point and an engine value: 282 (285 had qualifying points; 3 had none the engine could evaluate).

| property | components with rows | qualifying points | studies | commissioning count (any phase, any P) |
|---|---|---|---|---|
| vapour pressure | 236 | 16 861 | 923 | 256 components / 18 825 points |
| liquid density | 216 | 20 788 | 2 300 | 232 / 67 167 |
| liquid viscosity (a model in the record) | 135 (171 compounds had points; 37 components have no model) | 8 764 | 789 | 188 / 19 937 |
| liquid Cp | 84 (90 compounds had points; 6 components have no model) | 3 038 | 120 | 108 / 8 323 |

The commissioning block counts and these differ for stated reasons, and the earlier numbers are not wrong:
the block count includes sublimation points, crystal / glass / gas / supercritical phases, kinematic
viscosity, and the liquid points above 1 MPa; and it counts a component with a measured block for ANY
property (330) where this table counts those that survive the filters for one of four.

No model in the record (never a failure): vapour pressure -- `CS2`, `acetaldehyde`; liquid Cp --
`diEthylCarbonate`, `diethylethanolamine`, `methylDiEthanolAmine`, `methylethanolamine`,
`monoethanolamine`, `piperazine`; liquid density -- `acetaldehyde` (no `Vliq`, no Tc/Pc); liquid viscosity --
37 components, among them `acetone`, `1Propanol`, `1Hexanol`, `14Dioxane`, `124Trichlorobenzene` (the full
list is in the script's summary JSON).  One consequence: the `pipe` unit refuses such a liquid by name.

## 5. Results by property and model

Columns: rows; points; median clean AAD (flagged studies removed; in-window); p90; rows above the
property's threshold (5 / 5 / 10 / 2 %); suspect rows; rows with a single study; median share within stated
uncertainty; studies flagged / studies; rows with points outside the declared window.

| property / model | rows | points | median AAD % | p90 % | over threshold | suspect | single-study | within unc (median) | flagged / studies | rows with points outside |
|---|---|---|---|---|---|---|---|---|---|---|
| vapour pressure / Antoine | 211 | 15 535 | 0.84 | 3.13 | 13 | 3 | 58 | 62 % | 26 / 1 876 | 160 (3 783 points) |
| vapour pressure / AmbroseWalton | 25 | 1 279 | 19.56 | 82.70 | 21 | 15 | 7 | 9 % | 7 / 108 | none declares a window |
| liquid Cp / polynomial or chemsepCp16 | 84 | 2 814 | 1.34 | 7.53 | 10 | 3 | 44 | 50 % | 6 / 200 | 32 (616 points) |
| viscosity / chemsepEq101 | 130 | 5 084 | 2.74 | 13.54 | 19 | 12 | 36 | 50 % | 42 / 1 013 | 7 (25 points) |
| viscosity / andrade | 5 | 1 593 | 1.58 | 3.25 | 0 | 0 | 0 | 69 % | 11 / 381 | no window |
| viscosity / vogel | 5 | 1 593 | 1.07 | 1.96 | 0 | 0 | 0 | 77 % | 11 / 381 | no window |
| liquid density / Rackett (recomputed) | 216 | 20 779 | 0.20 | 0.91 | 12 | 8 | 40 | 29 % | 71 / 6 056 | 13 (69 points, Tr > 0.95) |

Readings that follow from the table:
- A measurement-fitted Antoine record is within 1 % of the measurements for most components, and the
  engine's boiling temperature at 50-200 kPa is within 0.12 K (median |dTb|, 83 components with at least 10
  points there) and 0.6 K (p90).  Of those 83, 14 exceed 0.5 K, 7 exceed 1 K and 4 exceed 2 K (two Antoine records, two
  `AmbroseWalton` ones: diethyl carbonate -9.9 K, dimethyl sulfoxide -2.0 K).  The largest Antoine ones: n-dodecane +5.08 K (20 points,
  3 studies), N,N-dimethylacetamide +3.49 K (16 points, 9 studies), dimethyl carbonate +1.16 K (30 points,
  17 studies), methyl propionate +0.88 K (134 points, 5 studies).
- Points outside the declared Antoine window are common (160 of 211 rows, 3 783 points) and where they exist
  the error is larger there: ethanol +4.32 % AAD outside against 0.53 % inside; methanol 3.25 % against
  0.46 %; water 4.87 % against 1.54 %.  The engine announces the extrapolation but moves no number.
- Cp: 11 rows are a single constant (`polynomial` with one coefficient); their median clean AAD is 4.2 %,
  against 0.36 % for the 14 four-coefficient polynomials and 1.3 % for the 58 five-coefficient rows (ChemSep
  form 16).  A constant cannot follow Cp(T), so a large AAD there is the model class as much as the datum.
- The case-selected Vogel/Andrade pair matters (water 1.38 % vs 3.50 %).  Only 5 records carry those
  blocks; in two of them (toluene, methanol) the Vogel C is 0 and the block is the Andrade twin (identical rows).
- The density within-uncertainty share is low (29 %) because the measurements are tight (median stated
  relative uncertainty 0.075 %) against a correlation whose own AAD is 0.20 %; for vapour pressure the median
  stated uncertainty is 1.0 %.

## 6. The worst rows

Ranked by clean AAD divided by the property's threshold; rows need at least 5 points and at least two studies
that survive the screen.  Window: declared window in K / points outside it (density: the audit's own Tr <=
0.95 window).  Bias / AAD / max (%) and within-unc (%) are over the in-window (or all, when no window)
points; "clean AAD" removes flagged studies; the last column is flagged studies.  `*` = recomputed density.

| component | prop | model | pts | studies | T span K | window / outside | bias | AAD | max | within unc | clean AAD | flagged |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| glycerol | vp | AmbroseWalton | 143 | 8 | 304-561 | none | -99.73 | 99.73 | 100.00 | 1 | 99.73 | 0 |
| methylStearate | dens | RackettAnchored* | 16 | 2 | 313-363 | 0-736 / 0 out | +33.71 | 33.71 | 33.76 | 0 | 33.71 | 0 |
| diethylethanolamine | vp | AmbroseWalton | 72 | 5 | 274-450 | none | -82.70 | 82.70 | 93.30 | 0 | 82.70 | 0 |
| methylDiEthanolAmine | vp | AmbroseWalton | 30 | 5 | 357-738 | none | -70.03 | 70.03 | 99.14 | 7 | 70.03 | 0 |
| methylPalmitate | dens | RackettAnchored* | 27 | 3 | 308-383 | 0-717 / 0 out | +23.44 | 23.44 | 23.62 | 0 | 23.51 | 1 |
| mNitrotoluene | vp | AmbroseWalton | 37 | 2 | 291-338 | none | -48.65 | 48.65 | 59.02 | 0 | 48.65 | 0 |
| diisopropanolamine | vp | Antoine | 53 | 3 | 410-468 | 407-601 / 0 out | -45.55 | 45.55 | 58.00 | 9 | 45.55 | 0 |
| diEthylCarbonate | vp | AmbroseWalton | 177 | 13 | 238-452 | none | +73.97 | 73.97 | 177.28 | 0 | 41.64 | 3 |
| dimethylethanolamine | vp | AmbroseWalton | 69 | 3 | 273-448 | none | -35.89 | 37.16 | 63.98 | 1 | 35.34 | 1 |
| nPentylAcetate | vp | AmbroseWalton | 25 | 5 | 274-423 | none | +23.32 | 23.32 | 42.07 | 0 | 23.32 | 0 |
| dimethylethanolamine | visc | chemsepEq101 | 6 | 2 | 298-353 | 214-550 / 0 out | -44.46 | 44.46 | 56.50 | 0 | 44.46 | 0 |
| nHexylAcetate | vp | AmbroseWalton | 27 | 2 | 274-440 | none | +19.56 | 19.56 | 43.59 | 0 | 19.56 | 0 |
| dimethylSulfoxide | vp | AmbroseWalton | 59 | 13 | 293-464 | none | +18.94 | 18.94 | 35.91 | 8 | 18.94 | 0 |
| methylStearate | vp | Antoine | 96 | 3 | 323-536 | 349-760 / 25 out | +16.47 | 17.57 | 44.26 | 10 | 17.57 | 0 |
| propane | dens | RackettAnchored* | 43 | 4 | 90-360 | 0-351 / 1 out | +6.29 | 6.29 | 6.53 | 0 | 6.29 | 0 |
| nEicosane | vp | AmbroseWalton | 14 | 2 | 313-373 | none | +13.22 | 14.13 | 38.51 | 57 | 14.13 | 0 |
| cisDecahydronaphthalene | visc | chemsepEq101 | 10 | 2 | 293-363 | 243-562 / 0 out | +28.09 | 28.09 | 35.27 | 0 | 28.09 | 0 |
| diethanolamine | vp | AmbroseWalton | 6 | 2 | 428-489 | none | -13.99 | 13.99 | 16.57 | 17 | 13.99 | 0 |
| phenanthrene | vp | AmbroseWalton | 78 | 2 | 384-480 | none | -13.42 | 13.42 | 31.96 | 78 | 13.42 | 0 |
| nButane | dens | RackettAnchored* | 73 | 4 | 135-424 | 0-404 / 1 out | +5.32 | 5.32 | 5.68 | 0 | 5.32 | 0 |
| nAminoethylEthanolamine | visc | chemsepEq101 | 22 | 4 | 293-343 | 273-598 / 0 out | +25.16 | 25.40 | 51.06 | 18 | 25.40 | 0 |
| ethylenediamine | visc | chemsepEq101 | 14 | 6 | 298-323 | 284-550 / 0 out | +22.53 | 22.53 | 35.20 | 0 | 22.53 | 0 |
| diButylCarbonate | vp | AmbroseWalton | 45 | 2 | 287-478 | none | -10.40 | 10.99 | 27.25 | 31 | 10.99 | 0 |
| 14Butanediol | cp | liquidHeatCapacity | 69 | 5 | 283-353 | 290-450 / 1 out | -8.16 | 8.16 | 10.56 | 0 | 8.16 | 0 |
| methylethanolamine | vp | AmbroseWalton | 40 | 3 | 275-451 | none | +7.28 | 8.15 | 18.67 | 10 | 8.15 | 0 |
| cyclohexanol | visc | chemsepEq101 | 18 | 2 | 303-373 | 297-520 / 0 out | -1.35 | 15.70 | 89.60 | 17 | 15.70 | 0 |
| nButanol | cp | liquidHeatCapacity | 79 | 8 | 273-353 | 280-390 / 1 out | -6.12 | 7.53 | 20.56 | 21 | 7.53 | 0 |
| nHexadecane | vp | Antoine | 56 | 3 | 284-561 | 438-632 / 31 out | -6.42 | 7.42 | 24.50 | 96 | 7.42 | 0 |
| methylPhenylCarbonate | dens | RackettAnchored* | 10 | 3 | 288-318 | 0-670 / 0 out | +2.88 | 2.88 | 2.98 | 0 | 2.88 | 0 |
| mesitylene | visc | chemsepEq101 | 39 | 7 | 278-350 | 228-550 / 0 out | +16.21 | 16.21 | 25.96 | 0 | 14.22 | 1 |

## 7. Records that most need attention, with the evidence

**A.  `AmbroseWalton` vapour pressure (estimated, no declared window) -- the largest group.**  21 of 25 rows
exceed 5 % AAD, 15 are suspect.  Four or more studies agree against the record for: glycerol (8 studies,
-99.7 %; at 560 K the record gives 4.8 kPa while the same record declares Tb = 563 K, so at 50-200 kPa the
engine's boiling temperature is 84 K too high), diethylethanolamine (5 studies, -82.7 %),
methyldiethanolamine (5, -70.0 %), diethyl carbonate (13 studies, +41.6 % after three are flagged),
n-pentyl acetate (5, +23.3 %), dimethyl sulfoxide (13, +18.9 %), monoethanolamine (8, +10.5 %; 7.0 % clean).
With two or three studies: m-nitrotoluene -48.7 %, dimethylethanolamine -35.3 %, n-hexyl acetate +19.6 %,
n-eicosane +14.1 %, diethanolamine -14.0 %, phenanthrene -13.4 %, dibutyl carbonate -11.0 %,
methylethanolamine +8.2 %.  The correlation reads only Tc, Pc and omega (`src/thermo/vaporPressure/
AmbroseWalton.cpp`) and ignores the record's own `Tb`; omega of the worst records is 1.54 (glycerol), 1.28
(triethanolamine), 1.16 (methyldiethanolamine).  Rows with a single study (triethanolamine -49 %,
N-aminoethylethanolamine -69 %, pyrene -49 %, squalane +57 %, one point of dimethyl terephthalate) point
the same way but are not called suspect.  A student cannot see any of this: no `Trange`, no announcement
beyond the record's estimate origin.

**B.  Liquid density -- `Vliq` datums the measurements contradict.**  The anchored route reproduces the
declared `Vliq` at 298.15 K exactly (checked), so a bias roughly constant in T is the datum:
- propane +6.3 % over 43 points / 4 studies (T 90-360 K) and n-butane +5.3 % over 73 points / 4 studies: the
  declared 84.2 and 96.2 cm3/mol are the molar volumes of the liquid at about 276 K and 270 K, not at
  298.15 K (the record says "saturated-liquid molar volume" with no temperature).  Propylene +21.4 % (one
  study, 26 points) and ethane +71.8 % (one study, 2 points) are of the same kind but unverifiable here.
- diethyl ether: +0.3 % AAD in-window (Tr <= 0.95, 23 points); the 23 points above Tr 0.95 are +15.3 %: the
  error is the near-critical tail of the correlation, not the record.
- 5-methyl-2-hexanone -8.5 % (3 studies, 3 points), cis-decalin +2.2 % (2 studies).
- CO2 +30 % (one study, 14 points): the anchor temperature 298.15 K is within 6 K of its Tc.

**C.  Records with no `Vliq`: bare Rackett.**  Five records; four suspect: methyl stearate +33.7 % (16 points,
2 studies; omega 1.018), methyl palmitate +23.5 % (27 points, 3 studies; omega 0.910), diphenyl carbonate
+16.0 % (2 studies, 2 points), methyl phenyl carbonate +2.9 % (3 studies).  Rackett's Zra = 0.29056 -
0.08775 omega falls to about 0.2 for these, so the fault is the correlation outside its omega range; the
engine announces "bare Rackett -- a generic saturated-liquid ESTIMATE" once per run.  Median clean AAD of the
211 anchored rows is 0.196 %; of the five bare ones 16.0 %.

**D.  Individual Antoine fits.**
- diisopropanolamine: -45.6 % AAD over 53 points / 3 studies (10.1021/je101259r,
  10.1016/j.fluid.2012.11.009, 10.1021/acs.jced.7b00827), T 410-468 K, ENTIRELY inside the declared window
  407-601 K.  The studies agree with each other and not with the record (coefficients "converted exactly
  from ChemSep eqno 10").
- methyl stearate: +17.6 % over 96 points / 3 studies; 25 points lie below the declared window (349-760 K),
  the in-window bias is +16.5 %.
- n-hexadecane: -7.4 % (3 studies; window 438-632 K, 31 of 56 points below it).
- ethylene: -4.8 % over 19 points / 4 studies, inside its window 150-283 K (under the 5 % suspect threshold).
- n-dodecane and N,N-dimethylacetamide: boiling-temperature errors +5.1 K and +3.5 K (section 5).
- Single-study rows over 5 %: MD3M +73 %, MD4M +51 %, methyl linoleate +48 % (4 points), fluorene +17 %,
  piperazine +13 %, methyl linolenate +12 %: unverifiable with this archive.

**E.  Liquid viscosity, `chemsepEq101` records** (12 suspect, 19 over 10 %).  Three or more independent
studies agree against the record for: ethylenediamine +22.5 % (6 studies), N-aminoethylethanolamine +25.4 %
(4), mesitylene +14.2 % (6 clean studies, one flagged), methacrylic acid +13.5 % (6), diisopropanolamine
-11.6 % (4), diethylenetriamine -11.5 % (4), 2-methyl-2-butanol -10.7 % (4).  With two studies:
dimethylethanolamine -44.5 % (6 points), cis-decalin +28.1 %, cyclohexanol 15.7 %, trans-decalin -13.3 %,
methylal 10.4 %.  The five records with Andrade/Vogel blocks are all within 3.3 % AAD (p90).

**F.  Liquid Cp.**  Suspect rows: 1,4-butanediol -8.2 % (69 points, 5 studies), n-butanol -7.5 % AAD (8
studies; the record is one constant, 177 J/mol/K), 2-pentanol +5.3 % (2 studies; 134 of 158 points outside
the declared 276-420 K window).  Ethanol (11 studies; one constant, 112.3 J/mol/K) is -4.5 % in-window and
+8.7 % outside.  Single-study rows over 5 %: diethylenetriamine -24 %, sucrose -20 %, p-toluic acid -15 %,
benzoic acid +14 %, N-aminoethylethanolamine -12 %, acetic acid -9.7 % (2 points).

**G.  Studies, not records.**  140 (study, property) pairs were flagged.  Four were flagged against three
different components each and are the best candidates for a bad study (or a mislabelled unit):
10.1021/je050444g (Cp), and 10.1016/j.jct.2005.06.011, 10.1016/j.fluid.2007.08.006,
10.1007/s10765-016-2096-3 (density).  Twenty rows with exactly two studies disagree by more than 3 FLOOR
(a two-study conflict: neither is flagged, because one cannot say which is wrong).

## 8. Findings for the commander (nothing was changed)

1. **Estimated vapour pressure is the catalogue's weakest class and it is silent.**  An `AmbroseWalton`
   record gets no `Trange`, so no extrapolation announcement can fire, and 21 of 25 are off by more than
   5 %.  Candidates, all RESERVED decisions: refuse the estimate where omega is outside its range, announce
   it as `[estimate]` with the audited error where the audit has one, or refit the 15 suspect components to
   the measurements (diethylethanolamine, methyldiethanolamine and glycerol first).
2. **Two `Vliq` datums contradict measurements (propane, n-butane)** and five records lack one; the ordinary
   fix is a curated `Vliq` from the measured density at 298.15 K, not a change to the route.
3. **diisopropanolamine's Antoine is wrong inside its own window** by about 45 %, three studies agreeing.
4. **A compound database from this archive is plausible**: the archive holds a vapour pressure, density and
   Cp series for 152 compounds outside the catalogue (the commissioning block count, not re-measured here),
   and where several studies exist they agree (140 flagged (study, property) pairs among about 3 000
   studies).  Its first risk is the compiler-assigned uncertainty, which is not a measurement property.
5. **The commissioning counts** are block counts and right as such; the figures to quote for "what could a
   record be compared against" are those of section 4.
6. **Tool limits.**  Liquid density has no engine key, so the audit re-implements the route (identical to
   1.4e-12 on four components against the `pipe` unit's KPI).  A one-line `rho_liquid_<comp>` key on
   `propertyScan1D` would remove the recomputation; that is an engine change, listed here and not made.
7. **The two unparseable archive files** (`j.fluid.2018.07.020`, `.021`) are not read; if they carry a
   catalogue compound its count is understated by their points.

## 9. Reproduce

```
python3 -I bin/curate/audit_components_thermoml.py --work <scratch dir>        # full audit
python3 -I bin/curate/audit_components_thermoml.py --work <scratch dir> \
    --cross-check-density water,ethanol,benzene,methanol
```

Requires the built `choupoProps` and `choupoSolve` (`make all`), `CHOUPO_HOME` set to the tree, and the
gitignored cache (`bin/choupo-thermoml sync`).  The per-point CSV and the summary JSON are written to the
scratch directory (refused when it is inside the tree).  About 30 s on 3 processes.
