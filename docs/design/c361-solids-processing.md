# Solids processing: one size axis, then the units that move along it

**2026-11-12.  Kind: ADR.  Status: slices 1-4 BUILT (DEV.md 4c C361; slices 3 and 4 engine and cases, their guides pending).**

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
4. **Hydrocyclone (slice 3).**  (The Nageswararao correlation planned here was not built, see 7.5.)  Sets geometry and slurry state (Nageswararao,
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
| unit `hydrocyclone` (`declared`) | `src/unitOperations/solids/Hydrocyclone.{H,cpp}` |
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
  `Hydrocyclone.cpp:126`.

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
The whiten identity holds for any curve through u = a at d = d50c, so it
cannot see the shape (review SC-02, 2026-11-12: the shape was reshaped and
nothing failed).  Since 2026-11-13 `classifier01_whiten_quartzSlurry` holds
the WHOLE curve: its solids split, both cut sizes and its product flows are
hand-written golden rows from an independent closed-form script beside the
case (`verification/whitenClosedForm.py`), and the same reshaping fails five
of them.  Illustrative parameters: a verification of the implemented form,
not a validation, and eq. 21 itself was not re-read against the paper.

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

`nageswararao` -- REMOVED before integration (2026-11-12).  The builder had
implemented Nageswararao, Wiseman & Napier-Munn (2004) eqs. 13-15, p. 677 (the
pressure-flow, corrected cut size and water-split correlations, with the Whiten
curve of eq. 21), the data window enforced by name and every K a declared input.
It shipped with NO case, because the 2004 paper prints no value of K_Q0, K_D0,
K_W0 for any material and no worked example, and prints its water-split equation
with opposite signs on the inlet exponent (eq. 15 (D_i/D_c)^+0.50, p. 677; its
repetition eq. 18 ^-0.50, p. 680).  The sources were then searched for a printed
worked example with constants that would anchor a case and decide the sign:
King (2001) -- the hydrocyclone sections (4.5, from p. 98; 4.5.7 is Plitt's model)
-- does not mention Nageswararao at all; Wills & Napier-Munn (2006) p. 217 only
NAMES the model ("It also requires the estimate of feed-specific constants from
data, though first approximations can be obtained from libraries of previous case
studies") and prints no constants and no example.  None exists in the literature
folder, so the model is unregistered and its code deleted: a registered model
that no case exercises and no number holds does not ship.  The correlation waits
for a source with constants and a worked example (it would also decide the sign).
`hydrocyclone` keeps `declared`.  The Whiten curve stays (the `whiten` partition
object, eq. 21, anchored by identity).

### 7.6 The recycle of a grid solid

A stream's F and z are its fluid's, so a dry grinding circuit's tear carried
F = 0 and was judged converged on T and P alone: the first run of circuit01
"converged" with a 0.002 % mass and element closure.  When a tear carries a
distribution on the grid, `packTears` now appends its class molar flows
(total solid kmol/s x w_k) AFTER every tear's [F, z, T, P] block (the
pressure check's per-tear stride is unchanged), and `unpackTears` sets the
distribution from them and rescales every solid component in proportion.  A
case without a grid packs exactly what it packed before.  Only the fixed-point
loop reads this vector (`directSubstitution`, `Wegstein`, and `DominantEigenvalue`
which runs the same loop).  circuit01 declares `directSubstitution`, `recycleTol
1e-12`: at 1e-9 the mixer's published inlets missed its outlet by 2.6 W of
enthalpy on the elements datum, which `check_energy_closure` refuses at 0.1 W.

THE NEWTON QUESTION, MEASURED (2026-11-12, a scratch copy of circuit01 with
`recycleSolver Newton;`): exit 2, "the recycle Newton cannot start: the seed tear
has no feasible neighbourhood: fdJacobian: no feasible perturbation for variable
0".  The Newton-on-tears step differentiates the fluid block [F, z, T, P]; a dry
solids recycle has F = 0 and nothing to perturb, and the class flows are not in
what it iterates, so it could never have converged on anything but the fluid.
Decision: the engine REFUSES, before solving, a tear carrying a size distribution
on the grid under Newton, naming the tear and the solvers that carry it
(`Flowsheet.cpp`, after the solver-word check; held by a new arm of
`bin/curate/check_driver_convergence.py`).  `directSubstitution`, `Wegstein` and
`DominantEigenvalue` reach the same circuit (Y = 0.7213 to the printed digits;
closures 0 / 1e-17).

### 7.7 Cases and anchors

| case | held to | kind | result |
|---|---|---|---|
| circuit01 | H&F 1980 Table II (C.E. 70 %, two mixers) and p. 23: at 637 kW, 250 % circulating load at 100 TPH, E = 1.82 kWh/short ton | arithmetic on a published simulation; one input (the breakage function) read by us from a figure | circulating load 2.588 (+3.5 %), E 1.775 kWh/short ton (-2.5 %); anchored at 5 % = the band the figure-read B carries (phi across its 4 % read band alone moves the load 3.4 %) |
| circuit01, the eight other Table II cells | the same 2.50 | compared, not anchored | seven cells 2.44-2.57; two mixers / C.E. 100 % 2.77 (+11 %); an independent Python re-computation agrees to four figures |
| hydrocyclone01 | Wills & Napier-Munn 2006 Table 9.1, pp. 215-216 | IN-SAMPLE reconstruction of a printed worked example (identity check of the bookkeeping; not a validation, corrected 2026-11-13, review SC-01) | underflow dilution 0.339 vs 0.34 and d50 176.0 vs 177.5 um return the book's OWN INPUTS (R_f = 0.39 was computed from the 0.34; the declared curve makes the 148-209 um class 0.49998 by construction), though `expected` still carries them as `anchor` rows (relabel proposed: `docs/design/hydrocyclone01-anchor-relabel-proposal.md`); the one computed number not typed in is U/F 0.6557 vs 0.6520 from the book's own column 8 (0.652 printed), and overflow dilution 1.010 vs 1.00 follows from it: GAPS with one stated cause (7.8) |
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
  The model was UNREGISTERED (7.5), so neither sign is implemented; the
  contradiction is the reason a source with a worked example is needed.
  The nomenclature (p. 672) prints the scaled Steinour factor as
  "8.05 x 10^(1.82 C_V)/(1 - C_V)^2" while p. 684 puts the 8.05 in the
  DENOMINATOR; only the unscaled form (conclusion 8) is offered.
* The paper prints no data-window table and no K values (the reason the model
  is not shipped, 7.5).
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
* The empirical hydrocyclone correlation (Nageswararao et al. 2004 eqs. 13-15):
  unregistered, awaiting a source with constants and a worked example (7.5).
* The gridded tear under Newton-on-tears: REFUSED by name (7.6).
* The time-integrated binaries (6), a sizer or cost for any classifier: not in
  this slice.

## 8. What slice 4 built (2026-11-12)

Solid-liquid separation: three units, six models (two filters, two washing laws, two thickener methods, two bowls), four cases.  Every
equation below is as implemented, with the page it was read from; a
`file:line` points at the line that computes it.  The guides are not written
yet (a second general writes them from this section).

### 8.1 Pieces

| piece | where |
|---|---|
| the slurry reader (one-inlet `feed {}` or `inputStreams`), densities, the package viscosity, product streams, the component closure | `src/unitOperations/solids/SolidLiquidCore.{H,cpp}` |
| unit `cakeFilter` (`rotaryDrum`, `batchPress`; washing `displacement`, `tabulated`) | `src/unitOperations/solids/CakeFilter.{H,cpp}` |
| unit `thickener` (`talmageFitch`, `coeClevenger`) | `src/unitOperations/solids/Thickener.{H,cpp}` |
| unit `sedimentingCentrifuge` (`tubularBowl`, `discStack`) on the classifier core of slice 3 | `src/unitOperations/solids/SedimentingCentrifuge.{H,cpp}` |
| registration (three lines) | `src/unitOperations/UnitOperation.cpp`, after `hydrocyclone` |
| cases | `tutorials/steady/solids/filter01_caco3_rotaryDrum`, `filter02_caco3_pressWashing`, `thickener01_settlingTest_talmageFitch`, `centrifuge01_tubularBowl_geankoplis` |

What existed before (searched by name and in `docs/ai/unit-ops.md`): `bagFilter`
(a GAS-solid fabric filter), `cyclone` and `gasSolidSplitter` (gas-solid),
`hydrocyclone` (slice 3), `batchDiafilter` (a MEMBRANE batch unit, not a cake
filter), `crystalliser`, the dryers.  No cake filter, thickener, settler,
clarifier or liquid centrifuge existed under any name; nothing was built
twice.  The models are branches inside each unit, selected by the `model`
slot and refused by name otherwise; the washing law is a small struct in
`CakeFilter.cpp`.  No new factory was opened: each law has one or two forms
and no second consumer.

Properties are the package's, never the case's: the liquid density is
`ThermoPackage::density(T, P, x, Liquid)`, the viscosity
`ThermoPackage::viscosityLiquid(T, x)` (refused by name when the case
declares no liquid viscosity model, `SolidLiquidCore.cpp`), the solid density
is volume-additive over the components' `solid { rho_p; }`.

### 8.2 `cakeFilter`: the law

Geankoplis, Hersel & Lepek, 5th ed. (G below), section 24.2, pp. 1078-1090.
The integrated two-resistance law is Ruth's (1935); the paper is in the
literature folder and the law was implemented as G prints it, not from the
paper.

| quantity | as implemented | units | source | code |
|---|---|---|---|---|
| compressible cake | alpha = alpha_0 dp^s | m/kg, dp in Pa | G eq. 24.2-11, p. 1081 | `CakeFilter.cpp:184` |
| liquor kept by the cake | L_r = (m - 1) W | kg/s | the definition of m, G eq. 24.2-10, p. 1080 | `:205` |
| filtrate | Q_f = (m_l - L_r) / rho_l | m3/s | balance | `:219` |
| solids per filtrate | c_S = W / Q_f, printed beside rho c_x / (1 - m c_x) | kg/m3 | G eq. 24.2-10 (the same by algebra) | `:220`, `:222` |
| cake porosity (saturated) | eps = ((m-1)/rho_l) / ((m-1)/rho_l + 1/rho_s) | - | ours: the liquor fills the voids | `:225` |
| drum flux, t_c declared | V/(A t_c) = [-R_m/t_c + (R_m^2/t_c^2 + 2 c_S alpha dp f/(mu t_c))^1/2] / (alpha c_S) | m/s | G eq. 24.2-26, p. 1089 (eq. 24.2-24 when R_m = 0) | `:272` |
| drum, area declared | t_c = (f - mu R_m Q_f/(dp A)) 2 dp A^2 / (mu alpha c_S Q_f^2) | s | G eq. 24.2-25 solved for t_c | `:289` |
| cake formation time | t = f t_c | s | G eq. 24.2-23, p. 1088 | `:291` |
| constants | K_p = mu alpha c_S/(A^2 dp), B = mu R_m/(A dp) | s/m6, s/m3 | G eqs. 24.2-14, -15, p. 1082 | `:308-309` |
| filtration time | t = K_p V^2/2 + B V | s | G eq. 24.2-17, p. 1082 | `:310` |
| washing rate | (dV/dt)_f = k / (K_p V_f + B); k = 1 (`sameAsFiltrate`, and every drum), 1/4 (`throughWashing`) | m3/s | G eqs. 24.2-19, -20, pp. 1086-1087 | `:343` |
| wash per cycle, wash time | V_w = Q_w V_f / Q_f; t_w = V_w / (dV/dt)_f | m3, s | cycle-averaged flows | `:344-345` |
| press cycle, presses | t_c = t_f + t_w + t_clean (G p. 1087); n = Q_f t_c / V_f | s, - | G Example 24.2-3; n is ours | `:377-378` |
| wash ratio | N = wash volume / volume of liquid in the cake | - | Perry 9th ed. p. 18-76 (the definition beside eq. 18-71) | `:359` |
| solute remaining, `displacement` | R = max(0, 1 - N) | - | the definition of ideal displacement (no source claimed) | `:55` |
| solute remaining, `tabulated` | ln R linear in N between the test's points; no extrapolation | - | Perry eq. 18-71, p. 18-76 ("log R vs. N", named, not parametrised) | `:70` |
| washed cake liquor | n_cake,i = R n_r,i + beta n_w,i, beta = (1 - R) V_r / V_w (refused above 1) | kmol/s | ours: volume-for-volume replacement | `:361`, `:370` |
| spent wash | the DIFFERENCE (n_r,i + n_w,i) - n_cake,i | kmol/s | balance | `:372` |
| cake per area, thickness | W_A = c_S V / A; L = W_A / ((1 - eps) rho_s) | kg/m2, m | G eq. 24.2-4 with the filtrate held in the cake neglected, as G does | `:396-397` |

Window: constant pressure; laminar flow through the cake (G p. 1077); the
cake law is the case's measured alpha or (alpha_0, s).  Every solid is
retained (stated, not computed).  The products leave at the feed's T and P
(no work; the wash must arrive at the slurry's temperature).

Keys (`operation {}`); NONE has a default:

| key | meaning | unit | required |
|---|---|---|---|
| `pressureDrop` | -dp across cake and medium | Pa | always |
| `specificCakeResistance` | alpha (incompressible cake) | m/kg | or the next two |
| `alpha0`, `compressibility` | alpha = alpha0 dp^s; alpha0 read in SI (m/kg with dp in Pa: its dimensions have no integer form) | SI, - | both or neither |
| `mediumResistance` | R_m | 1/m | always (0 is a declaration) |
| `wetToDryCakeRatio` | m, kg wet cake per kg dry: the cake moisture, DECLARED | - | always |
| `submergence` | f | - | rotaryDrum |
| `cycleTime` XOR `area` | t_c or A; the other is the result | s / m2 | rotaryDrum |
| `area`, `filtratePerCycle`, `cleaningTime` | A, V_f, t_clean | m2, m3, s | batchPress |
| `washFlowPath` | `sameAsFiltrate` (eq. 24.2-19) or `throughWashing` (eq. 24.2-20) | word | batchPress with a wash |
| `washing { model displacement; }` or `{ model tabulated; washRatio (...); remaining (...); }` | the solute-removal law | - | with a wash inlet, and only then |

Inlets `( slurry [wash] )`, outlets `( cake filtrate [spentWash] )`.  KPIs a
student checks by hand: `alpha_m_kg`, `cS_kg_m3` beside `cS_eq24_2_10_kg_m3`,
`filtrate_m3_s`, `Kp_s_m6`, `B_s_m3`, `area_m2`, `cycleTime_s`,
`filtrationTime_s`, `cakeThickness_mm`, `cakePorosity`, `washRatio`,
`soluteRemaining`, `washTime_s`, `washFractionOfCycle`, `pressesRequired`,
`componentMassClosure`.  Profile: the cycle's t/V vs V line (`V_m3`, `t_s`,
`t_over_V_s_m3`, 21 points; slope K_p/2, intercept B -- G Fig. 24.2-2).

### 8.3 How a cyclic filter sits in a steady flowsheet

Following the settled contract "A BATCH PLANT IS DESIGNED ON THE STEADY
BALANCE": the streams are the CYCLE-AVERAGED flows -- the steady balance per
unit time -- and the cycle is a design result computed on them, never a
second time axis and never a binary of its own.

* `rotaryDrum` is continuous by construction (G p. 1088): feed, filtrate and
  cake move at steady rates; a fraction f of each revolution forms cake.
  Declaring t_c gives the area (G Example 24.2-4); declaring the area gives
  t_c.  A wash zone washes at the final filtration rate; when the wash does
  not fit in the (1 - f) of the revolution out of the slurry, the unit
  refuses.
* `batchPress` is cyclic: the case declares A, the filtrate per cycle V_f and
  the cleaning time; t_f (eq. 24.2-17), t_w (eqs. 24.2-19/-20) and t_c follow,
  and `pressesRequired` = Q_f t_c / V_f is the number of identical presses
  that pass the average feed (a real number; rounding up is the student's
  design choice).  The wash per cycle is the wash flow over one cycle, so a
  wash flow of 10 % of the filtrate flow is G's "10 % of the filtrate
  volume".

### 8.4 `thickener`

The data are the case's batch settling test: `initialConcentration` C_0
[kg/m3 of slurry] and the interface height H at times t, first point t = 0,
H = H_0.  Lists are SI (s, m): a list does not carry a unit word.

| quantity | as implemented | source | code |
|---|---|---|---|
| slope at a test time | v = -dH/dt of the parabola through that point and its two neighbours (the interior point nearest t) | ours (numerical; a student draws the tangent by eye) | `Thickener.cpp:49-67` |
| Kynch's layer at (t, H) | H_i = H + v t; C = C_0 H_0 / H_i | Talmage & Fitch 1955 eqs. 4-6, pp. 38-39; Wills & Napier-Munn 2006 eq. 15.4, p. 387 | `:162-165` |
| underflow line | H_u = C_0 H_0 / C_u | T&F step 1, p. 39 | `:144` |
| curve crossing | t_x where the (linearly interpolated) test crosses H_u | T&F p. 39 | `:170-174` |
| `talmageFitch` | tangent at the declared compression time t_c; if H_u < H(t_c): t_u = (H_i - H_u)/v; else t_u = t_x; A = W t_u / (C_0 H_0) | T&F eqs. 7-10 and steps 1-5, p. 39; Wills eq. 15.6, p. 387; Perry 9th ed. eq. 18-54, p. 18-64 | `:177-195`, `:216` |
| `coeClevenger` | A = max over the test's layers with C < C_u of W (1/C - 1/C_u)/v | Coe & Clevenger 1916 as Wills eq. 15.5, p. 387 prints it, with (C, v) from Kynch's construction as Wills p. 387 says may be done | `:210` |
| the identity | Coe-Clevenger at the compression layer = Talmage-Fitch's tangent area (algebra: H_i - H_u = v t_u) | Wills derives eq. 15.6 from 15.5, p. 387 | `:221-225` |
| underflow liquid | (1 - C_u/rho_s) rho_l / C_u kg per kg of solids | definition of C_u | `:229` |
| overflow | the DIFFERENCE, componentwise; every solid to the underflow (ideal) | balance | `:240` |
| unit area | A/W in m2 per (t/d) | T&F eq. 10 (their units ft2/(ton/day)) | `:265` |

Window: Kynch's postulate (the settling velocity a function of the local
concentration only, T&F p. 38); free settling governs the area; the test at
the expected feed concentration (T&F p. 40; a deviation above 5 % is
announced).  Area only: depth, compression time and safety factor (Wills
p. 386 asks for at least two) are not applied.

Keys, none with a default: `settlingTest { initialConcentration [kg/m3];
time ( ... ) [s]; height ( ... ) [m]; }`; `underflowConcentration` C_u
[kg/m3]; `compressionTime` [s] (required by `talmageFitch`, optional and
then drawn with `coeClevenger`).  KPIs: `area_m2`, `unitArea_m2_per_tpd`,
`areaTalmageFitch_m2`, `areaCoeClevenger_m2` (and its C, v),
`underflowLine_Hu_m`, `curveCrossesHu_s`, `compression_H_m`,
`compression_v_m_s`, `tangentIntercept_Hi_m`, `compression_C_kg_m3`, `tu_s`,
`tangentUsed`, `anchor_TFequalsCC_dev`, the stream liquids,
`componentMassClosure`.  PROFILE, for the GUI to draw the construction:
`t_s`, `H_m`, and at every point `kynch_v_m_s`, `kynch_Hi_m`,
`kynch_C_kg_m3`, `coeClevengerArea_m2`; markers at the compression point and
at t_u.

### 8.5 `sedimentingCentrifuge`

Reads its feed with `readClassifierFeed` and splits with `splitOnPartition`
(slice 3, `ClassifierCore`): no second splitter.  g = 9.80665 m/s2 (G p. 1412).

| quantity | as implemented | units | source | code |
|---|---|---|---|---|
| angular speed | omega = 2 pi N (N from `speed` in rpm -> rev/s) | rad/s | G eq. 30.2-4 | `SedimentingCentrifuge.cpp:89` |
| feed volume flow | Q = m_l/rho_l + m_s/rho_s | m3/s | ours | `:85` |
| tubular bowl volume | V = pi b (r_2^2 - r_1^2) | m3 | G p. 1436 | `:103` |
| tubular Sigma | Sigma = omega^2 V / (g ln(2 r_2^2/(r_1^2 + r_2^2))) | m2 | Ambler 1959 eqs. 24-28, p. 191 (the exact form; his eq. 33 is the approximation); de Haan, Eral & Schuur 2nd ed. eqs. 9.44-9.46, p. 309 | `:104` |
| tubular Sigma, half-layer cut | Sigma_G = omega^2 V / (2 g ln(2 r_2/(r_1 + r_2))) | m2 | G eq. 30.2-19, p. 1439 | `:105` |
| disc-stack Sigma | Sigma = 2 pi n omega^2 (r_2^3 - r_1^3) / (3 g tan theta) | m2 | de Haan et al. eq. 9.52, p. 311; Ambler eq. 46, p. 194, with C = 1 | `:119` |
| cut size | Q = 2 v_g(d50) Sigma, v_g = d^2 (rho_s - rho_l) g/(18 mu) -> d50 = (9 mu Q / (drho g Sigma))^1/2 | m | Ambler eq. 9; G eq. 30.2-18 | `:125` |
| G's critical diameter | D_pc from Sigma_G by the same relation | m | G eq. 30.2-12, p. 1436 | `:142` |
| Stokes' window | Re = d50 v_wall rho_l / mu < 1, v_wall = d50^2 drho omega^2 r_2/(18 mu) | - | G eq. 30.2-13, p. 1437; N_Re < 1, G section 30.1B, p. 1413 | `:126-127` |
| tubular grade efficiency | k = d^2 drho omega^2 tau/(18 mu), tau = V/Q; r* = max(r_1, r_2 e^-k); E = (r_2^2 - r*^2)/(r_2^2 - r_1^2) | - | DERIVED here: G eq. 30.2-10 integrated from a starting radius r, with Ambler's eq. 26 premise (feed spread uniformly over the annulus); E(d50) = 1/2 exactly | `:153-155` |
| disc grade efficiency | E = min(1, (d/d50)^2 / 2) | - | DERIVED here: Ambler eqs. 43-44, p. 194, with f(y) = 1 (the case in which his C = 1): the captured fraction is the drift across the gap, v_g Sigma / Q | `:157` |
| sediment | Y = SUM_k E_k f_k of the solids; its liquid Y m_s (1 - w_s)/w_s | kg/s | ours (w_s declared) | `:170-175` |

Windows: Stokes (enforced); dilute free settling (hindered settling, G eq.
30.1-16, is NOT applied -- the case's solids fraction is printed);
Brownian threshold and agglomeration (Ambler pp. 195-196) not modelled.  No
drive power.

Keys, none with a default: `speed` [1/s, `rpm` accepted]; tubularBowl:
`bowlRadius` r_2, `liquidRadius` r_1, `bowlLength` b [m]; discStack:
`discSpaces` n, `outerRadius`, `innerRadius` [m], `discHalfAngle` [rad,
`deg` accepted]; `sedimentSolids` w_s (solids mass fraction of the
discharged sediment) [-].  KPIs: every classifier KPI of slice 3 with the
words `sediment`/`centrate` (`d50_um`, both products' d10..d90, the
closures), plus `omega_rad_s`, `gForce_wall`, `sigma_m2`,
`cutSize_d50_um`, `Re_cut`, `vWall_cut_m_s`, `gradeEfficiency_at_d50`,
and for the tubular bowl `bowlVolume_m3`, `residenceTime_s`,
`sigmaHalfLayer_m2`, `cutSizeHalfLayer_Dpc_um`, `gradeEfficiency_at_Dpc`.
Profile: the class-by-class table of slice 3 (feed, grade efficiency, both
products).

### 8.6 Cases and anchors

| case | held to | kind | result |
|---|---|---|---|
| filter01_caco3_rotaryDrum | G Example 24.2-4, pp. 1089-1090: rotary drum, compressible CaCO3 cake, t_c 250 s declared, the area | printed worked example (arithmetic on G's Example 24.2-1 slurry) | alpha 1.22547e11 vs 1.225e11 (+0.04 %), c_S 308.107 vs 308.1, V/t_c 4.82294e-4 vs 4.823e-4, A 6.6434 vs 6.60 m2 (+0.66 %): all four anchored |
| filter02_caco3_pressWashing | G Examples 24.2-1 to 24.2-3, pp. 1083-1088: press, through-washing, cycle | printed worked examples (on a laboratory test) | K_p 37.719 vs 37.93 (-0.56 %), B 16.010 vs 16.10 (-0.56 %), t_f 268.14 vs 269.7 s (-0.58 %), t_w 192.93 vs 194.0 s (-0.55 %), t_c 1661.07 vs 1663.8 s (27.73 min, -0.16 %): all five anchored at 1 % |
| thickener01_settlingTest_talmageFitch | none printed (see 8.7); identity: Coe-Clevenger at the compression layer = Talmage-Fitch area (dev 0) | IDENTITY only | A_TF 846.94 m2 (0.980 m2 per t/d), A_CC 1102.3 m2; self-recorded golden, no anchor row |
| centrifuge01_tubularBowl_geankoplis | G Example 30.2-2, pp. 1437-1438 | printed worked example | omega 2408.55 vs 2410 (printed rounded, -0.06 %), V 2.74663e-4 vs 2.747e-4 (-0.01 %), D_pc 0.74677 vs 0.746 um (+0.10 %): anchored; Re at the cut 9.6e-8 ("in the Stokes' law range", no number printed) |

The gaps, each with its one cause, nothing tuned:
* filter01, the area: G's own inputs give 6.660 m2 by his eq. 24.2-24, so the
  printed 6.60 is 0.9 % below its own arithmetic; the package's water
  viscosity (Vogel, water's record, 8.889e-4 Pa s against G's 8.937e-4)
  moves A by -0.27 % (A ~ mu^1/2).  Band 1.5 %.
* filter02: the same viscosity, -0.54 %, linear in K_p, B, t_f, t_w; diluted
  in the cycle by the 20 min of cleaning.  Band 1 %.
* centrifuge01: omega printed rounded to 2410; D_pc printed to 3 figures.
* filter02 declares m = 2.0 from G's Example 24.2-4 (the same slurry), because
  Examples 24.2-1 to -3 do not give the cake moisture; the feed is set to one
  press on G's cycle, so `pressesRequired` = 0.998 is a consistency check, not
  an anchor.  centrifuge01's size distribution, solids content, sediment
  solids fraction and temperature are DECLARED (the example has none); no
  anchor reads them.  Its two components are case-local pseudo-components
  (MW 100 as a basis, constant density and viscosity, no enthalpy datum), so
  its energy and element balances are REFUSED for want of data (announced
  by the engine; mass closes, 100.000 %).

Closures held (`bin/runTests --scope tutorials/steady/solids
tutorials/steady/gas-solid`): componentMassClosure 0 on all four (exact by
construction, every outlet the difference); mass 100.000 %; element closure
0.0000 % on filter01/02 and thickener01; plant energy residual below 1e-9 kW
(filter01, filter02, thickener01: isothermal, no work); centrifuge01's energy
and element balances UNAVAILABLE (no enthalpy datum, no formula), named by
`check_energy_closure` among the refusals.

### 8.7 What the sources say that the brief did not

* **Seader, Henley & Roper 4th ed. carries NO filtration, sedimentation or
  centrifugation**: its preface (p. v) says Chapter 19 (mechanical phase
  separations) and Chapters 16-18 (with washing) were REMOVED from the fourth
  edition and remain in the third.  Every printed example used here is
  Geankoplis's.
* **No printed worked example of Talmage-Fitch (or Coe-Clevenger) sizing
  exists in the folder.**  Searched: Geankoplis 30.1F (method only; Problem
  30.1-11 prints data and no answer), Wills & Napier-Munn pp. 385-388
  (method and a figure), Talmage & Fitch 1955 (derivation; their Table II
  unit areas come from curves that are not printed), King chapter 6 (Kynch
  flux model), Perry 9th ed. pp. 18-64 to 18-65 (eq. 18-54), Treybal 3rd ed.
  (batch settling described), de Haan et al. chapter 9 (exercises only).
  thickener01 therefore runs on Geankoplis's problem data with an identity
  and a self-recorded golden, and says so.
* **No washing-efficiency law with constants is printed in the folder.**
  Geankoplis gives the washing RATE only (eqs. 24.2-19/-20); Perry 9th ed.
  names the empirical correlation "log R vs. N" (eq. 18-71, p. 18-76) without
  coefficients; Wills, King and de Haan describe washing without a law.  So
  the `displacement` model is the definition of ideal displacement and the
  `tabulated` model takes the case's own wash test in Perry's coordinates.
* **The primary papers ARE in the folder** (Ruth 1935, Kynch 1952, Talmage &
  Fitch 1955, Ambler 1959; `Articles/Solids-Particles/`).  Talmage & Fitch and
  Ambler were read and cited by equation; Ruth and Kynch were not read: the
  laws are implemented as Geankoplis and Talmage & Fitch / Wills print them.
* **Two definitions of the tubular bowl's Sigma and cut size.**  Geankoplis
  (eqs. 30.2-12, 30.2-19) takes the particle starting HALFWAY through the
  liquid layer; Ambler (eq. 28) and de Haan et al. (eq. 9.44) take the
  radius splitting the layer into EQUAL VOLUMES, which is where a uniformly
  fed bowl captures half of a size.  Both are published; the grade curve is
  the uniformly fed one, on which Geankoplis's D_pc is the 62.8 % size.
* **Neither source prints a grade-efficiency curve E(d)** for the bowl or
  the disc stack; both curves are derived from the trajectories they print
  (8.5), and labelled DERIVED in the code.
* **Ambler's disc-stack Sigma carries a flow factor C** (eq. 46) that he
  calls "not completely understood"; it is 1 here (laminar symmetric flow,
  plug-flow drift) and his measured disc efficiency (55 % of theoretical on
  satin clay, p. 195) is not applied.
* **The centrifugal Stokes check:** Re at the cut size grows as Q^1.5/omega,
  so the remedy is a faster bowl or a lower throughput (the message says
  so).

### 8.8 Refused or deferred, with the reason

Refused, by name (each exercised by hand on a scratch copy of the cases):
`alpha0`/`compressibility` alone or beside `specificCakeResistance`; both or
neither of `cycleTime`/`area`; a medium resistance that alone exceeds the
submerged time; a cake holding more liquid than the slurry brings; a wash
with solids, at another temperature, or that cannot supply the liquor it
replaces; a drum that cannot wash in the unsubmerged part of its revolution;
a wash ratio outside a tabulated test; a settling test that does not start at
t = 0, whose times do not rise or whose interface rises; C_u at or below C_0,
at or above rho_s, or below what the test reached (H_u under its last
height); a compression time outside the test; a centrifuge feed not on the
grid, dry or vapour-bearing; a solid not denser than the liquid; Re >= 1 at
the cut size; a geometry with r_1 >= r_2 or a disc angle outside (0, 90) deg;
a sediment needing more liquid than the feed has; any liquid viscosity the
case did not declare a model for.

Deferred, named:
* An enthalpy balance across the cake (a wash at another temperature) and
  the pressure of the filtrate under vacuum: every product leaves at the
  feed's T and P.
* Constant-rate filtration (G section 24.2C), centrifugal filtration (G
  30.2E), a filter-medium bleed of fines: not built.
* Hindered settling in the centrifuge (G eq. 30.1-16), Ambler's turbulent
  Sigma (eqs. 34-39), the disc stack's measured efficiency factor, drive
  power: not built.
* A thickener's depth, compression zone, flocculant and safety factor
  (Wills p. 386: at least two); a Kynch flux-curve thickener (King 6.1): not
  built -- the area is the result.
* No sizer or cost for any of the three; the time-integrated binaries do not
  carry them (as in 6).
* Gates the names fail until the guides and GUI land (expected, the second
  general's and the GUI's work): `check_feature_documented`,
  `check_schema_coverage`, `check_unit_families` on `cakeFilter`,
  `thickener`, `sedimentingCentrifuge`.
