# Solids processing: one size axis, then the units that move along it

**2026-11-12.  Kind: ADR.  Status: slices 1-3 BUILT (DEV.md 4c C361; slice 3 engine and cases, its guides pending); slice 4 PLANNED.**

Vitor, on the breadth-first tools he has used: models he could not trust and
documentation he could not read -- "e preciso que o Choupo ultrapasse isso".
C361 puts solids processing on the agenda in four slices: (1) the size
distribution as a stream attribute every solids unit reads and writes, on
ONE discretisation; (2) size reduction; (3) classification; (4) solid-liquid
separation.  This record decides the axis, scopes all four, and documents
what slices 1 and 2 built.

---

## 1. What existed (measured 2026-11-12, by file and line)

* The stream carries solids as `s` (kmol/s per component, the same index as
  `z`) and ONE `ParticleSizeDistribution psd` for the combined solid phase:
  `src/streams/ProcessStream.H:160-168` before this slice.  The struct was
  two vectors -- representative `diameter` [m] and `massFrac` -- with no
  class edges (`ProcessStream.H:69-75`).
* The distributions are models: `src/core/distribution/SizeDistribution.H:126`
  (base, explicit factory, moments in a declared basis), `RosinRammler`,
  `LogNormalSize`, `TabularSizeDistribution`.  `toTabular` discretised a law
  onto `bins` log-spaced bins between the law's own `dMin`/`dMax`
  (`SizeDistribution.cpp:203-247`): every stream's bins were its OWN.
* Readers and writers of `psd`: `Cyclone.cpp:87-193`, `BagFilter.cpp:109-159`,
  `GasSolidSplitter.cpp:72-143` (table or inline law), `SprayDryer.cpp:1373`
  (its own Rosin-Rammler bins), `PneumaticConveyor.cpp:135-290`,
  `Crystalliser.cpp:614` and `:936` (its own population-balance bins),
  `UnitInputs.cpp:74-84` and `:283-293` (the stream -> unit dict bridge),
  `StreamStateIO.cpp:553`, `:963` (write) and `:3259-3326` (read),
  `ResultEmitter.cpp:327` (JSON).  The `mixer` dropped `psd` on every
  blend (`Mixer.cpp`: the outlet set `s` and never `psd`).
* The GUI computed its own d10/d50/d90 from the bins
  (`gui/src/ui/StreamsWorkspace.tsx:820-830`): a second home for a moment.
* NOT in the engine: any size reduction; any classification of a slurry or
  powder (screen, hydrocyclone); cake filtration; thickener; centrifuge.

## 2. Decision: one size grid, declared by the case

**ADOPTED.**  The case declares the axis once, in `system/flowsheetDict`:

```
sizeGrid
{
    xMax      2.36 mm;     // top edge -- the feed's top size
    ratio     1.41421356;  // x_{k+1}/x_k (sqrt 2: the Tyler series)
    nClasses  13;          // including the pan
}
```

Class 0 is the PAN `[0, x_1]`, classes 1..n-1 are geometric sieve cuts up to
`xMax`; the representative size of a cut is its geometric mean, the pan's one
ratio step below `x_1`.  Every authored inlet with a size distribution is put
on the grid before the first unit runs (`Flowsheet.cpp`, after the authored
inlets are marked), the grid is handed to every unit's dict, and a stream on
the grid carries its `edges` (`ParticleSizeDistribution::edges`, n+1 values).

Why a case grid and not each unit's own: every model C361 lists is written
CLASS BY CLASS -- a mill's b_ij, a screen's or hydrocyclone's partition
number per class, a filter cake's size-dependent permeability, a
crystalliser's population balance.  Two units on two sets of classes can only
be joined through an interpolation nobody declared, and that interpolation
would be the least visible step in the flowsheet.  The geometric grid is the
sieve analysis the data arrive as (Austin 1971 p. 2; H&F 1980 use a sqrt-2
Tyler series), and it is the grid the fixed-pivot technique of Kumar &
Ramkrishna (1996) and the discretisation of Hounslow, Ryall & Marshall (1988)
are written on -- a crystalliser with aggregation, when it comes, lands on the
same axis.

**REJECTED:** (a) each unit keeps its own bins and every consumer re-bins
(what existed): N re-binnings with N hidden errors, and no b_ij can be written
once; (b) a fixed engine-wide grid: a sand plant and an API micronisation are
four decades apart; (c) carrying the continuous law on the stream: a mill's
product is not a Rosin-Rammler, so the law would be lost at the first unit.

### 2.1 The mapping onto the grid, and its conservation

* A **continuous law** is INTEGRATED in its mass basis over each class,
  `w_k = F3(x_{k+1}) - F3(x_k)` (`SizeGrid::mapLaw`).  The fractions are
  differences of one cumulative, so they telescope to exactly 1 whatever the
  quadrature error of F3: the error moves mass between neighbouring classes,
  it never creates or destroys any.  The law the 0/ file declared is kept on
  the stream (`declaredLaw`) until the grid is known, so the law is integrated
  once rather than discretised twice.
* A **table** on other classes is RE-BINNED assuming its mass uniform in
  ln x inside each of its own classes (uniform in x inside a pan)
  (`SizeGrid::mapTable`).  Each source class hands out fractions of itself
  that sum to 1, so the total is exact.  A table without `edges` has them
  INFERRED at the geometric midpoints of its sizes, and the run says so.
* Mass above `xMax` is FOLDED into the top class and announced; above 1 % of
  a powder the grid is REFUSED (it does not describe that powder).  Mass below
  `x_1` is the pan's by definition.
* Tested: every mapping prints `sum in` and `sum out` (`[psd-grid]` line);
  `psd01_grid_and_moments` pins the blend's `psd_massFractionSum` and the
  mill cases pin `sizeMassClosure`.

### 2.2 When two streams on different grids meet

**DECIDED, by case** (`Mixer.cpp`, the only unit that joins two solids
streams today):

| inlets | action | why |
|---|---|---|
| all on the same grid | exact blend `w = SUM m_j w_j / SUM m_j`, class by class | nothing to approximate |
| one on the grid, one on a unit's own bins | the second is RE-BINNED onto the grid, mass exact, its d50 shift ANNOUNCED | a legacy unit may still write its own bins; the blend must still close |
| two DIFFERENT declared grids | REFUSED | a case has one grid, so two means a unit ignored it: that unit is the defect, and an interpolation here would hide it |
| a solid-bearing inlet with NO distribution beside a gridded one | REFUSED | the blend's distribution would be undefined |
| no inlet on a grid | nothing done | every case written before the grid is unchanged |

### 2.3 One distribution per stream, or one per solid species?

Today ONE `psd` describes the combined solid phase (`ProcessStream.H`), and
the 0/ reader already refuses a second solid phase carrying its own
(`StreamStateIO.cpp:3263-3279`).  The general case -- limestone and quartz
in one mill product, each with its own distribution -- needs one distribution
per solid component (or per declared population).  **The minimal honest step
taken now:** the grid is shared by every population (it is the case's), and
every unit of slices 1-2 is SINGLE-POPULATION BY CONSTRUCTION: the mill grinds
"the solids" with one selection and one breakage function, and its header and
the guide say that a multi-mineral feed is ground as one material.
**Deferred** (named, slice 3 or later): `psd` becomes a map component ->
fractions on the shared grid, so a screen can split two minerals with their
own distributions and a liberation model has somewhere to live.  Nothing in
slices 1-2 has to be undone for it: the grid, the mapping and the moments are
per-vector already.

### 2.4 Moments, from one home

`psdMoments` (`SizeGrid.cpp`) derives d10, d50, d80, d90 (log-interpolation
of the cumulative mass between class edges -- the re-binning's own
within-class assumption), the Sauter mean `d32 = 1 / SUM w_k / xbar_k` and
`S_v = 6/d32`.  The engine publishes them on every stream that has a
distribution (`psd.moments` in the result JSON; `edgesInferred` says when the
stream is not on a grid), the mixer and the mill publish them as KPIs, and the
GUI draws the published numbers.

### 2.5 No golden moves

With no `sizeGrid` declared, no mapping runs, no edges exist, every unit
writes what it wrote, and the mixer blends nothing.  Proven on every case
with solids (`bin/runTests --scope`, the list in the commit).

## 3. Pedagogical scope of each unit on the C361 list

Two lines each: what the student SEES and SETS, and what is REFUSED.

1. **Size grid and moments (slice 1, built).**  Sets the sieve stack once;
   sees every stream's distribution on it with d10/d50/d80/d90/Sauter, and
   the mapping's mass closure.  Refused: a grid that leaves > 1 % of a feed
   above its top edge; blending streams on two different grids.
2. **Mill (slice 2, built).**  Sets the selection law (`austin`,
   `herbstFuerstenau`, `vogelPeukert`), the breakage function, the residence
   model and the shaft power; sees feed and product class by class, the
   extents, T_out from the shaft work and Bond's energy beside the
   population-balance energy.  Refused: a feed not on the grid, a rate law
   without a residence time, two energy specifications.
3. **Screen (slice 3).**  Sets aperture, efficiency/partition parameters
   (textbook model Vitor supplies -- no DOI-bearing primary verified); sees
   the partition number per class and the over/undersize distributions.
   Refused: an aperture outside the grid; a feed not on the grid.
4. **Hydrocyclone (slice 3).**  Sets geometry and slurry state (Nageswararao,
   Wiseman & Napier-Munn 2004); sees d50c, the water split to underflow, the
   bypass and the corrected and actual partition curves.  Refused: a dry
   feed; geometry outside the correlation's data window.
5. **Cake filter with washing (slice 4).**  Sets area, pressure, cake and
   medium resistances (Ruth 1935); sees t/V vs V, the cake mass and the wash
   displacement.  Refused: a feed with no liquid; a compressible cake without
   its compressibility.
6. **Thickener (slice 4).**  Sets the batch settling curve (Kynch 1952;
   Talmage & Fitch 1955); sees the required area by the Talmage-Fitch
   construction and the underflow concentration.  Refused: a settling curve
   that is not monotone.
7. **Sedimenting centrifuge (slice 4).**  Sets geometry and speed (Ambler
   1959 sigma theory); sees Sigma, the cut size and the clarified overflow.
   Refused: a particle Reynolds number outside Stokes' law.

## 4. What slices 1 and 2 built

| piece | where |
|---|---|
| the grid, the mappings, the moments | `src/core/distribution/SizeGrid.{H,cpp}` |
| edges and the declared law on the stream | `src/streams/ProcessStream.H` (`ParticleSizeDistribution`) |
| a unit's own bins onto the grid; moments as KPIs | `src/streams/PsdOnGrid.H` |
| authored inlets onto the grid; the grid to every unit | `src/unitOperations/flowsheet/Flowsheet.cpp` |
| edges through the dict bridge | `src/unitOperations/flowsheet/UnitInputs.cpp` |
| edges kept by the separators; own bins mapped | `Cyclone.cpp`, `BagFilter.cpp`, `GasSolidSplitter.cpp`, `PneumaticConveyor.cpp`, `Crystalliser.cpp`, `SprayDryer.cpp` |
| blends on the grid | `src/unitOperations/mixer/Mixer.cpp` |
| edges and moments in the result and the 0/ files | `ResultEmitter.cpp`, `StreamStateIO.cpp` |
| the mill | `src/unitOperations/solids/Mill.{H,cpp}` |
| selection, breakage, Bond as objects | `src/unitOperations/solids/millModel/MillModels.{H,cpp}` |
| units `kWh/t`, `kWh/shortTon`, `t/kWh` | `src/core/Units.cpp` |

The mill's mathematics, models, windows and anchors are in the Theory Guide
section `sec:mill` (and `sec:size-grid` for the axis).  Cases:
`tutorials/steady/solids/psd01_grid_and_moments`,
`mill01_limestone_herbstFuerstenau`, `mill02_bond_crosscheck`,
`mill03_impact_vogelPeukert`.

**Residence models.**  Austin (1971) gives both limits in a few lines -- the
fully mixed mill (eq. 44a) and plug flow, which is the batch solution at
t = tau (eqs. 46-49) -- so both are offered.  The partially back-mixed mill
(eqs. 50-53, a residence-time distribution) and two mixers in series (H&F
1980's design case) are deferred: they need an RTD object, and with it the
closed circuit H&F use, which is slice 3's classifier.

**Anchors, and what kind they are.**  The breakage function reproduces
King's Illustrative example 5.2 (b52 = 0.1459, a printed worked example);
the Vogel-Peukert law reproduces the paper's statement that a stressing
parameter of 1 is a 63 % breakage probability (an identity at a printed
point); the Herbst-Fuerstenau model the paper's 1.82 kWh/t x 350 t/h =
637.0 kW (arithmetic); the Austin selection function the identity S(x1) = S1
with H&F's k1 = 0.780 1/min; Bond the definition of the work index.  NONE is a
mill measured by Choupo: the closest is mill01, which reproduces H&F's
first-order disappearance of the 8x10 mesh feed with their k1.

## 5. Order of slices 3 and 4

1. **Slice 3: classification** -- screen and hydrocyclone by a partition
   curve, then a CLOSED milling circuit (mill + hydrocyclone + recycle).  It
   comes before slice 4 because H&F's own design case (Tables I-II: 100 t/h
   at 250 % circulating load) is a closed circuit, and holding the mill to it
   is the first measured-against-published number the mill can earn.  Needs:
   the per-species `psd` decision of 2.3 if the screen is to split two
   minerals; a slurry stream (water as fluid + solids is already a stream).
2. **Slice 4: solid-liquid separation** -- cake filtration with washing
   (Ruth), thickener (Kynch / Talmage-Fitch), sedimenting centrifuge (Ambler
   sigma).  Each takes the grid only for its cut-size statements; the
   filtration and settling laws themselves are on bulk properties.

Skorych et al. (2020, Dyssol) is a published open-source solids flowsheet
framework: its answers may be compared against, never its code copied.

## 6. Not done, named

* Time-integrated binaries (`choupoCtrl`, `choupoSemiContinuous`,
  `choupoBatch`) do not read `sizeGrid`; their units keep their own bins.
* `QuasiSteadyUnit` builds its own augmented dicts and does not receive the
  grid.
* One distribution per solid species (2.3).
* No sizer or cost for the mill (Bond's power-to-diameter relation is in
  King p. 204 and H&F p. 24; the sizing pass is a later slice).

## 7. What slice 3 built (2026-11-12)

Classification on the size grid: one partition-curve family, one split, three
units, and the closed circuit Herbst & Fuerstenau design.  Every equation
below is as implemented, with the page it was read from.

### 7.1 Pieces

| piece | where |
|---|---|
| partition curves as objects (`whiten`, `rosinRammler`, `tabulated`), explicit registration, `verify()` anchors | `src/unitOperations/solids/classifierModel/PartitionCurves.{H,cpp}` (registry `PartitionCurves.cpp:326`, called from `UnitOperation::registerBuiltins`) |
| the one split every classifier performs; feed reader; passing fraction; KPIs and profile | `src/unitOperations/solids/ClassifierCore.{H,cpp}` |
| unit `classifier` (a curve and a bypass, nothing else) | `src/unitOperations/solids/Classifier.{H,cpp}` |
| unit `screen` (`karra` / `declared`) | `src/unitOperations/solids/Screen.{H,cpp}` |
| unit `hydrocyclone` (`declared` / `nageswararao`) | `src/unitOperations/solids/Hydrocyclone.{H,cpp}` |
| grid solids in the recycle tear vector | `src/unitOperations/flowsheet/Flowsheet.cpp:1813-1828` (pack), `:1880-1899` (unpack) |
| units `shortTon/kWh`, `shortTon/h` | `src/core/Units.cpp:261-262` |
| cases | `tutorials/steady/solids/circuit01_herbstFuerstenau_closedCircuit`, `screen01_dolomite_karra`, `hydrocyclone01_quartz_willsTable91` |

### 7.2 The split, and why it closes exactly

King (2001) section 4.2, eqs. 4.20-4.29, pp. 86-87: the classification
function c(d_pi) is the fraction of class i of the feed that leaves in the
coarse product.  Two curves are kept apart:

* corrected c_k -- what a `PartitionCurve` returns;
* actual a_k = R + (1 - R) c_k, R the BYPASS (the fraction of every class
  short-circuited to the coarse product).  In a hydrocyclone R is the water
  recovery to underflow R_f (Kelsall; Wills & Napier-Munn 2006 eq. 9.15,
  p. 214, written forward; Nageswararao et al. 2004 eq. 21 is the same
  algebra for the overflow, E_oa = C (1 - c), C = 1 - R_f).
  `Classifier.cpp:89`, `Screen.cpp` (after its model block),
  `Hydrocyclone.cpp:305`.

Per class, m_s the feed's solids mass flow and f_k its fractions
(`ClassifierCore.cpp:147-148`):

    coarse_k = a_k f_k m_s,        fine_k = f_k m_s - coarse_k

The fine product is the DIFFERENCE, so coarse + fine = feed per class to the
last bit (the printed closure is 0.000e+00 in all three cases).  The fluid
(the stream's F z -- F and z are the FLUID's, the solids ride `s`) splits by
one fraction R_fl, the same for every fluid component
(`ClassifierCore.cpp:79` and the build lambda).  Every solid component
splits in the proportion Y = SUM_k a_k f_k: ONE POPULATION (2.3 stays
deferred, and each unit header says so).  No work, no heat: both products
leave at the feed's T and P.

A continuous curve is evaluated at each class's representative size (the
geometric mean of its edges, King's d_pi).  Published per class (profile):
the feed fractions, corrected and actual partition, both products'
fractions.  KPIs: the solids and fluid splits, the bypass, `d50c_um` (0.5
crossing of the corrected curve), `d50_um` and `imperfection`
I = (d75 - d25)/(2 d50) on the ACTUAL curve (Wills eq. 9.14, p. 214; not
published when the bypass leaves no d25), both products' d10..d90, d32, S_v,
and the closures.  Crossings by `partitionSize` (`PartitionCurves.cpp:334`):
linear in ln x between neighbouring representative sizes, the first crossing
from the fine end.

### 7.3 Partition curves

| model | c(d) as implemented | parameters | source | code |
|---|---|---|---|---|
| `whiten` | 1 - (e^a - 1)/(e^(a d/d50c) + e^a - 2) | `d50c` [length], `alpha` [-] | Nageswararao, Wiseman & Napier-Munn (2004) eq. 21, p. 681 (written there for the overflow; divided by C and complemented here) | `PartitionCurves.cpp:143` |
| `rosinRammler` | 1 - exp(-0.693 (d/d50)^m), 0.693 as printed | `d50` [length], `m` [-] | King (2001) eq. 4.41, p. 89; Plitt's form, Nageswararao et al. eq. 20, p. 680 | `PartitionCurves.cpp:214` |
| `tabulated` | c_k declared on the case's classes, pan first, each in [0, 1] | `corrected ( ... )`, exactly nClasses values | King section 4.2; H&F 1980 p. 18 (classifier matrix C) | `PartitionCurves.cpp:268` |

Windows: whiten -- monotone (the fish-hook beta form, eq. 25 p. 683, is NOT
built); rosinRammler -- a monotone S-curve; tabulated -- the case's own grid,
never interpolated to another.  Anchors (`verify()`), all IDENTITIES: whiten
c(d50c) = 1/2 for any a (the definition of d50c, p. 683); rosinRammler
c(d50) = 1 - e^-0.693 = 0.49997; tabulated -- nothing to compute, said so.

### 7.4 `screen`, model `karra`

Karra (1979) as King (2001) prints it, section 4.2.1-4.2.2, pp. 87-90, in
King's units (h_T mm, A t/(h m2), W^F t/h, rho_B kg/m3):

| quantity | as implemented | King | code |
|---|---|---|---|
| effective aperture | h_T = (h + d_w) cos(theta) - d_w | eq. 4.31 | `Screen.cpp:214` |
| basic capacity | A = 12.13 h_T^0.32 - 10.3 (h_T < 51 mm); 0.34 h_T + 14.41 (>= 51) | 4.32-4.33 | `Screen.cpp:54` |
| open area (optional `openArea`) | A <- A x 100 oa / OA, OA = 21.5 log10(h) + 37 | 4.34-4.35 | `Screen.cpp:229-236` |
| oversize factor | B = 1.6 - 1.2 Pbar (Pbar <= 0.87); 4.275 - 4.25 Pbar; Pbar = 1 - P^F(h_T) | 4.36 | `Screen.cpp:59` |
| half-size factor | C = 0.7 + 1.2x (x <= 0.3); 2.053 x^0.564 (<= 0.55); 3.35 x^1.37 (<= 0.8); 5x - 1.5; x = P^F(h_T/2) | 4.37 | `Screen.cpp:64` |
| deck, wet, bulk density | D = 1.1 - 0.1 S; E from the table of p. 89 with T = 1.26 h_T (only `wetScreening yes`, else 1); F = rho_B/1600 | 4.38, p. 89, 4.39 | `Screen.cpp:73`, `:243-247` |
| near-size factor | G_c = 0.975 (1 - P^F(1.25 h_T) + P^F(0.75 h_T))^0.511 | 4.40 | `Screen.cpp:248` |
| loading | K = (W^F P^F(h_T)/area)/(A B C D E F) | 4.42 | `Screen.cpp:251` |
| cut size | d50 = h_T G_c / K^0.148 | 4.43 | `Screen.cpp:255` |
| partition | rosinRammler with m = 5.9, no bypass | 4.41 | the curve object |
| capacity, AUF, efficiency | Th = A B C D E F G_c area; AUF = undersize transmitted / Th; eff = transmitted / (W^F P^F(h)) | 4.30, 4.48, 4.46-4.47 | `Screen.cpp:265-267` |

P^F(x) is `fractionPassing` (`ClassifierCore.cpp:107`): the grid's own
within-class assumption (uniform in ln x, uniform in x in the pan).  Window
enforced: the aperture inside the grid (refused by name otherwise); h_T > 0;
A > 0 (h_T above about 0.6 mm, the correlation's own zero).  The relation
signs of 4.36-4.37 and the theta of 4.31 do not survive text extraction; they
were read from the rendered pages, and the branches meet within 0.03 at each
boundary.  Anchor: an identity at a printed point, King p. 87 -- the factors
are unity at the standard condition, B(0.5) C(0.25) = 1.

`screen`, model `declared`: a `partition {}` curve, a `bypass` (fines
misplaced to the oversize) and an optional `aperture`, checked against the
grid.

### 7.5 `hydrocyclone`

`declared`: a `partition {}` curve with its cut size and `waterToUnderflow`
R_f, which is also the solids bypass.

`nageswararao`: Nageswararao, Wiseman & Napier-Munn (2004) eqs. 13-15, p. 677
(units of its footnote 4: lengths m, theta degrees, Q m3/h per cyclone,
P kPa, rho_p t/m3, g m/s2, d50c um), with the Whiten curve of eq. 21
(`alpha`):

    eq. 13  Q/(D_c^2 sqrt(P/rho_p)) = K_Q0 D_c^-0.10 (D_o/D_c)^0.68 (D_i/D_c)^0.45
            (L_c/D_c)^0.20 theta^-0.10  -> solved for P from the feed's own Q
                                                       (Hydrocyclone.cpp:242-252)
    eq. 14  d50c/D_c = K_D0 D_c^-0.65 (D_o/D_c)^0.52 (D_u/D_c)^-0.50 (D_i/D_c)^0.20
            (L_c/D_c)^0.20 theta^0.15 (P/(rho_p g D_c))^-0.22 lambda^0.93   (:255)
    eq. 15  R_f = K_W0 (D_o/D_c)^-1.19 (D_u/D_c)^2.40 (D_i/D_c)^0.50 (L_c/D_c)^0.22
            theta^-0.24 (P/(rho_p g D_c))^-0.53 lambda^0.27                 (:260)

lambda is DECLARED: `hinderedSettling original`, C_V/(1 - C_V)^3 (p. 676), or
`steinour`, 10^(1.82 C_V)/(1 - C_V)^2, the complete Steinour form unscaled
(Castro 1990, p. 684; conclusion 8, p. 685) (`Hydrocyclone.cpp:236-237`): a
case's K_D0 and K_W0 belong to one of them.  K_Q0, K_D0, K_W0 and alpha are
material constants the case declares (p. 679); no default exists.  R_V
(eq. 16) is not built (conclusion 5: redundant).  Also published: the
hydraulic power P Q (Wills eq. 9.20, p. 217) and the products' dilutions.

DATA WINDOW, enforced by name (`Hydrocyclone.cpp:55-56`): feed solids 40-70 %
by weight (the fitting set, pp. 678, 681, 684); D_c 0.102-0.381 m (the
database's 10.2-38.1 cm cyclones, p. 677); the fluid water only (p. 675).
The paper prints no window for the geometric ratios, so none is enforced.
Anchor: an identity at a printed point, p. 681 -- "an increase in D_u of 10 %
will always result in an increase of 26 % in R_f": 1.1^2.40 = 1.2570 against
1.26 (0.24 %, the paper's rounding).  The model has NO case: the paper prints
no K values for any material and no worked example, and inventing K for a
tutorial would be the default the brief forbids.  It was exercised on a
scratch copy of hydrocyclone01 (it runs; D_c 0.5 m and 25 % solids are
refused by name).

### 7.6 The recycle of a grid solid

A stream's F and z are its fluid's, so a dry grinding circuit's tear carried
F = 0 and was judged converged on T and P alone: the first run of circuit01
"converged" with a 0.002 % mass and element closure.  When a tear carries a
distribution on the grid, `packTears` now appends its class molar flows
(total solid kmol/s x w_k) AFTER every tear's [F, z, T, P] block (the
pressure check's per-tear stride is unchanged), and `unpackTears` sets the
distribution from them and rescales every solid component in proportion.  A
case without a grid packs exactly what it packed before.  Only
`directSubstitution` and `Wegstein` read this vector; the default
`Newton`-on-tears does not, and a gridded solids recycle under Newton is NOT
validated (circuit01 declares `directSubstitution`, `recycleTol 1e-12`: at
1e-9 the mixer's published inlets missed its outlet by 2.6 W of enthalpy on
the elements datum, which `check_energy_closure` refuses at 0.1 W).

### 7.7 Cases and anchors

| case | held to | kind | result |
|---|---|---|---|
| circuit01 | H&F 1980 Table II (C.E. 70 %, two mixers) and p. 23: at 637 kW, 250 % circulating load at 100 TPH, E = 1.82 kWh/short ton | arithmetic on a published simulation; one input (the breakage function) read by us from a figure | circulating load 2.588 (+3.5 %), E 1.775 kWh/short ton (-2.5 %); anchored at 5 % = the band the figure-read B carries (phi across its 4 % read band alone moves the load 3.4 %) |
| circuit01, the eight other Table II cells | the same 2.50 | compared, not anchored | seven cells 2.44-2.57; two mixers / C.E. 100 % 2.77 (+11 %); an independent Python re-computation agrees to four figures |
| hydrocyclone01 | Wills & Napier-Munn 2006 Table 9.1, pp. 215-216 | printed worked example on measured data | underflow dilution 0.339 vs 0.34 and d50 176.0 vs 177.5 um (geometric vs arithmetic class mean) anchored; U/F 0.6557 vs 0.652 and overflow dilution 1.010 vs 1.00 are GAPS with one stated cause (7.8) |
| screen01 | King 2001 Example 10.1, Table 10.1 (Hennings & Grant 1982) | MEASURED | NOT anchored (Karra states no accuracy): oversize 0.293 vs 0.305 measured (-4.0 %), undersize % passing within -1.6/-2.7 %; King's own AUF 1.58 vs Choupo 1.08, unexplained (likeliest: King's run applied the open-area correction, which gives about 1.47) |

What circuit01 represents EXACTLY, and what is its own: H&F's mill RTD "two
ideal mixers in series" (p. 18 footnote, E(theta) = 4 theta e^(-2 theta)) is
two perfectly mixed `mill` units in series, each drawing half the power --
with an energy-specific rate the extent of each half is kappa/2, which IS
that RTD, so no residence model was added.  The specific breakage rate is
H&F's printed Fig. 14 legend, k^E_i = 2.40 (sqrt(x_i x_i+1)/2000)^0.72
(kWh/ton)^-1; the breakage distribution function is mill01's Austin fit to
points we read from Fig. 13 (OURS).  "ton" is read as the US short ton.
screen01 carries the catalogue's calcite record for the test's dolomite (the
catalogue's dolomite has no `role` and no thermal block; a screen reads only
the declared bulk density), said in its thermoPhysPropDict.

### 7.8 What the sources say that the brief did not

* H&F's Tables I-II are not "RTD and classifier efficiency" curves: Table I is
  the production rate of an 11.5 ft mill and Table II the power and diameter
  for 100 TPH, each for three RTDs x three classifier efficiencies.  H&F's
  classifier is a two-level step (C = 1 above 150 mesh, 0.3 below, p. 18),
  not a curve given class by class; it is `tabulated` + a 0.3 bypass.  The
  circuit's product size distribution exists only as a figure (Fig. 16), so
  it is not compared.
* H&F's classifier is not a hydrocyclone and their circuit carries no water;
  a hydrocyclone needs a slurry.  The circuit uses the generic `classifier`
  unit (a curve and a bypass, nothing else), which H&F's "classifier matrix
  C" is.  This third unit type was not in the brief.
* Nageswararao et al. 2004 print eq. 15 twice with different signs on the
  inlet exponent: (D_i/D_c)^+0.50 in eq. 15 (p. 677), ^-0.50 in its
  repetition eq. 18 (p. 680); R_V likewise (eq. 16 ^+0.25, eq. 19 ^-0.25).
  Eq. 15, the model's statement, is implemented and the run says so; within
  one geometry K_W0 absorbs the difference, across inlet sizes it does not.
  The nomenclature (p. 672) prints the scaled Steinour factor as
  "8.05 x 10^(1.82 C_V)/(1 - C_V)^2" while p. 684 puts the 8.05 in the
  DENOMINATOR; only the unscaled form (conclusion 8) is offered.
* The paper prints no data-window table and no K values; the window enforced
  is assembled from its text (7.5), and no case runs the model.
* Wills's own Table 9.1 contradicts Kelsall's assumption in its finest class
  (37.2 % of the -74 um solids to underflow against 39 % of the water): the
  corrected recovery would be negative.  hydrocyclone01 declares 0 there and
  carries the 0.54 % of the feed this misplaces as its one stated gap.
* King's K uses P(h_T) (eq. 4.42) and his efficiency P^F(h) (eq. 4.47); both
  are implemented as printed.

### 7.9 Refused or deferred, with the reason

* Per-species distribution (2.3): deferred; every classifier splits one
  population, said in each header.
* Fish hook (Whiten beta, Nageswararao eq. 25): not built -- beta* is defined
  only implicitly and the paper calls the effect undetermined (p. 683).
* Plitt's model (eqs. 3-6): not built -- the brief named Nageswararao, and
  Plitt's F1-F4 would be four more declared constants.
* King's kinetic screen model (eqs. 4.49-4.86): not built -- King says it
  awaits experiments on the crowded length L_c (p. 97).
* A vapour-bearing fluid: refused by all three units (a gas-borne powder is a
  `cyclone`'s).
* The gridded tear under Newton-on-tears (7.6), the time-integrated binaries
  (6), a sizer or cost for any classifier: not in this slice.
