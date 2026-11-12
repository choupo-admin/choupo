# Solids processing: one size axis, then the units that move along it

**2026-11-12.  Kind: ADR.  Status: slices 1-2 BUILT (DEV.md 4c C361); slices 3-4 PLANNED.**

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
