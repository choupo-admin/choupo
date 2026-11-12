# Residue curve maps -- an EduTool on the engine's equilibrium, and a proposal for its engine home

Status: the EduTool `residue-curves` is built (gui/src/ui/methods/ResidueCurvesTool.tsx,
gui/src/ui/methods/residueCurvesLesson.ts, the arithmetic in gui/src/case/residueCurves.ts,
tests in gui/tests/residueCurves.test.ts).  The engine operation proposed in section 5 is
NOT built; it is a proposal for the maintainers to decide.

## 1. What the page is for

The phase diagram that explains azeotropic and extractive distillation of a three-component
mixture: the residue curve (the path of the pot liquid of a simple batch still), its
singular points (pure components and azeotropes, as unstable nodes, stable nodes and
saddles), the distillation boundaries out of the saddles, the regions they separate, the
lever rule and the two limiting splits of a feed the student places, and the four ways a
boundary is got round (a heavy entrainer that adds none, a heterogeneous entrainer and a
decanter, a pressure change, a recycle).  It is the ternary sequel of the `rayleigh` page,
which is the same balance on two components.

## 2. What the page asks the engine

The engine as it is, unchanged.  Measured before the page was written:

* `propertyScanTernary` with `mode bubbleT` (src/propertyOps/PropertyScanTernary.cpp, the
  `if (mode == "bubbleT")` branch) writes `x1,x2,x3,T_bubble` only -- no vapour.
* `propertyOps::evaluateProperty` (src/propertyOps/PropertyEvaluator.cpp, the
  `matchPerComp("y_eq", i)` branch) returns `y_eq_<comp>` from `BubblePoint::compute` at a
  supplied liquid composition and pressure, for any number of components; `T_bubble` the
  same way.  `propertyScan1D`/`propertyScan2D` can only sweep a binary composition (the
  partner of an `x[<comp>]` axis is set to `1 - x`), so neither walks a triangle.
* `propertyPoint` evaluates the declared `properties ( ... )` list at one `(T, P, x)`
  and publishes every value in its operation diagnostics.  `T` is required by its state
  block and is not used by `T_bubble` or `y_eq_*`.

So the page writes, in the browser, a props case with ONE `propertyPoint` per composition
of a triangular grid (x1 = i/n, x2 = j/n, x3 = 1 - x1 - x2), each asking for
`T_bubble y_eq_<c1> y_eq_<c2> y_eq_<c3>` at the chosen pressure, in a package of one
liquid (NRTL, pairs resolved by the engine from the catalogue) and an ideal-gas vapour,
and runs it with choupoProps in WASM (`useCaseFilesRun`).  The pairs are not written
into the case; the engine reports where it found each one (`thermoResolution`) and voices
its fit grade, review status and every use outside its validity span (`advisories`), and
the page prints those sentences as the engine wrote them.

A second run follows: the engine is asked again at a finer set of compositions around
each azeotrope the page located (21 points across the bracketing cell of a binary
azeotrope; an 8-by-8 sub-grid around a ternary one), and the same run carries the engine's
own liquid-liquid flash (`propertyScanTernary`, `mode lle`, grid 20) over the whole
triangle at the LOWEST bubble temperature of the map, in a two-liquid package declared on
that operation alone (`thermo { equilibrium { formulation gammaGamma; liquidPhases (...) } }`).

Cost, measured natively (build of this tree, n = 24, 325 operations): the grid run takes
40-60 ms and prints about 290 kB of result JSON; the refinement run 20-35 ms.  At n = 36
(703 operations) the grid run takes 70-95 ms and about 610 kB.  The WASM build was not
available in the session that built the page, so the in-browser time was not measured;
the page shows a progress line while the runs are in flight.

## 3. What the page computes itself

All of it in gui/src/case/residueCurves.ts, and all of it said on the page:

* **Interpolation.**  T and y* inside each triangular grid cell are the barycentric
  (linear) interpolation of the cell's three nodes.  A node the engine did not answer is
  missing; a cell that needs it returns nothing and a curve that reaches it stops, saying
  why.
* **Residue curves.**  dx/dxi = x - y*(x), integrated by fourth-order Runge-Kutta in the
  reduced pair (x1, x2) with the direction normalised to a fixed step of 0.25/n in mole
  fraction (a reparameterisation; the path is unchanged), forwards and backwards from a
  set of interior seeds, until the curve comes within 0.6/n of a NODE (a curve passes a
  saddle by).
* **Singular points.**  The three pure components; a binary azeotrope where y_a - x_a
  changes sign between two interior grid points of an edge (linear interpolation of the
  zero); a ternary azeotrope where the linear interpolant of x - y* vanishes inside a
  cell, accepted only if the field there is small (|x - y*| < 0.05/n).  Located to one
  grid cell, and to 2/(20 n) on an edge or 2/(8 n) inside after the refinement run.
* **Type, read twice.**  From the boiling temperatures on a ring of radius 1.5/n around the
  point inside the triangle (all higher: unstable node; all lower: stable node; mixed:
  saddle), and from the eigenvalues of J = d(x - y*)/dx by finite differences that step
  into the triangle.  Both are shown; a disagreement means the grid is too coarse there.
* **Boundaries.**  From each saddle, along each eigenvector of J that points into the
  triangle, integrated forwards where T rises along that direction and backwards where it
  falls.
* **Regions.**  A 12-by-12 interior grid of seeds, each labelled by the unstable node its
  curve starts at and the stable node it ends at.
* **Lever rule.**  For a feed the student places: its region, then the direct split (the
  region's unstable node as distillate, the bottoms where the straight line through the
  feed meets the triangle's edge or a boundary polyline) and the indirect split (the stable
  node as bottoms); D/F = |FB|/|DB|.

## 4. Checks on the physics, measured on the engine's maps (n = 24, 1.01325 bar)

Run natively with the page's own module (no part of the arithmetic re-implemented):

| preset | singular points (T, type) | boundaries | regions |
|---|---|---|---|
| ethanol + water + ethylene glycol | EtOH-water az x_EtOH 0.885, 351.26 K, unstable node; ethanol 351.45 K saddle; water 372.45 K saddle; glycol 470.51 K stable node | 0 | 1 |
| isopropanol + methanol + water | methanol 337.70 K unstable node; IPA-water az x_IPA 0.675, 353.63 K saddle; IPA 355.22 K and water 372.45 K stable nodes | 1 (methanol to the azeotrope) | 2 |
| chloroform + methanol + MEK | CHCl3-MeOH az x 0.646, 326.70 K unstable node; MeOH-MEK az x_MeOH 0.846, 337.16 K saddle; methanol 337.70 K stable node; CHCl3-MEK az x 0.192, 353.46 K stable node; chloroform and MEK saddles | 1 | 2 |
| benzene + methanol + methyl acetate | MeOH-MeOAc az x_MeOH 0.340, 326.69 K unstable node; benzene-MeOH az x_benzene 0.393, 331.59 K saddle; methyl acetate saddle; benzene, methanol stable nodes | 1 | 2 |
| acetonitrile + ethanol + water | ternary az (0.413, 0.548, 0.039), 345.46 K unstable node; three binary az, all saddles; three pure stable nodes | 3 | 3 |

* The glycol map has ONE unstable node, the ethanol-water azeotrope (the pair predicts it at
  this pressure), and one region: no boundary, which is why glycol works as an extractive
  agent.  The engine's liquid-liquid flash at 351.26 K found no split in any of 171
  compositions.
* No two drawn residue curves crossed on any preset at 1.01325 bar (15 seeds, crossings
  counted away from a 2/n neighbourhood of every singular point).  One pair did cross on
  isopropanol + methanol + water at 5 bar, where curves bunch along the boundary towards
  methanol: the page reports such a count on its own drawing rather than hiding it.  Every curve started at an unstable node and
  ended at a stable node once the ternary azeotrope of the last preset was found.
* The boiling temperature fell between consecutive curve points by at most 0.0037 K at
  1.01325 bar and 0.0057 K over every run listed here (the linear interpolation creases
  the T surface); it never fell on the isopropanol and methyl acetate maps at 1.01325 bar.
* At n = 24 the acetonitrile-ethanol azeotrope is read as a saddle from the temperatures
  and as an unstable node from J; the ternary azeotrope 0.03 K below it is the reason, and
  the page prints both readings with the word "disagrees".
* Every boundary started at a saddle and ended at a node.
* The acetonitrile + ethanol + water map is fragile: the model's ternary azeotrope sits
  0.03 K below the acetonitrile-ethanol azeotrope and 0.04 in water mole fraction away from
  that edge.  At n = 24 the eigenvalue reading of the ternary azeotrope disagrees with the
  temperature reading (saddle against unstable node) and the page says so; at n = 36 they
  agree.  Before the near-singular tolerance of section 3 was added, the page did not find
  that point at all and drew three boundaries that ended nowhere -- the reason the
  "unresolved" label and the n = 36 grid are on the page.
* Pressure: on chloroform + methanol + MEK at 5 bar the methanol-MEK azeotrope disappears in
  the model and the map has one region (the engine announces that every pair is then far
  above its validity span).  On isopropanol + methanol + water the IPA-water azeotrope moves
  from x_IPA 0.653 at 0.3 bar to 0.675 at 1.01325 bar and 0.661 at 5 bar.  No liquid-liquid
  split was found at the map's lowest bubble temperature on any of these runs.

## 5. Proposal: a `residueCurveMap` engine operation (for the maintainers to decide)

The page is a correct client of today's engine, but it carries arithmetic that belongs in a
glass-box C++ operation where the props bench, a golden and the Theory Guide can hold it:

```
{
    name    rcm;
    type    residueCurveMap;
    state   { P 1.01325 bar; }
    grid    { n 24; }                 // the field the map is integrated over
    seeds   { n 8; }                  // or an explicit list of compositions
    output  { curves rcm_curves.csv; points rcm_points.csv; boundaries rcm_boundaries.csv; }
}
```

* Integrate dx/dxi = x - y* with the EXACT bubble point at every RK stage (no
  interpolation, so the creases of section 4 vanish), adaptive in step.
* Locate every azeotrope by Newton on x - y*(x) = 0 started from the grid's sign changes,
  reporting the residual, and classify by the eigenvalues of the analytic or
  finite-difference Jacobian.
* Publish the singular points as diagnostics (a golden row kind can then pin them), the
  boundaries, and the region of any declared feed.
* Run the liquid-liquid check along each curve, not at one temperature, and REFUSE (or
  switch to the heterogeneous residue curve, a later slice) where the liquid splits.
* The page would then draw the operation's output and compute nothing, as most EduTools do.

## 6. The published azeotropes, and how they were read

The comparison uses MEASURED points already in the corpus, each file carrying the DOI and
located through the NIST/TRC ThermoML Archive.  The reading is this page's: linear
interpolation between the two measured points where y - x changes sign, or the lowest
measured bubble temperature where the series has no vapour.  Every DOI was resolved on
api.crossref.org on 2026-11-12.

| pair | file in the corpus | P | measured reading | engine (1.01325 bar) |
|---|---|---|---|---|
| ethanol-water | tutorials/steady/optimisation/fitNRTL02_thermoml_isobars/constant/experiments/ethanol-water-bubble-je2008704.dat (Kamihama et al. 2012, doi:10.1021/je2008704; checked against the article) | 101.3 kPa | lowest T 351.26 K at x_EtOH 0.901 and 0.914 (no vapour reported) | x 0.885, 351.26 K |
| isopropanol-water | tutorials/props/curation/curate06_nrtl_isopropanol_water/constant/experiments/isopropanol-water-bubble-j.jct.2017.02.005.dat (Orchillés et al. 2017, doi:10.1016/j.jct.2017.02.005) | 100.0 kPa | between x 0.658 (y 0.670) and 0.716 (y 0.702): x 0.685, 353.11 K | x 0.675, 353.63 K |
| methyl acetate-methanol | tutorials/props/curation/curate08_nrtl_methylacetate_methanol/constant/experiments/methylAcetate-methanol-bubble-j.fluid.2015.04.018.dat (Zhang et al. 2015, doi:10.1016/j.fluid.2015.04.018) | 101.3 kPa | between x 0.647 (y 0.656) and 0.737 (y 0.707): x_MeOAc 0.668, 326.79 K | x_MeOAc 0.660, 326.69 K |
| acetonitrile-water | tutorials/props/curation/curate10_nrtl_acetonitrile_water/constant/experiments/acetonitrile-water-bubble-j.jct.2019.07.006.dat (Li et al. 2019, doi:10.1016/j.jct.2019.07.006) | 101.3 kPa | between x 0.5935 (y 0.6669) and 0.6962 (y 0.6939): x 0.693, 349.65 K | x 0.676, 349.86 K |

Honestly: the engine places three of the four azeotropes within 0.03 in mole fraction of
the measured reading (ethanol-water 0.016 to 0.029 short of it, methyl acetate-methanol
0.008, acetonitrile-water 0.017) and within 0.25 K, and the isopropanol-water one 0.010 in
composition but 0.52 K hot (part of
which is the 1.3 % pressure difference; the catalogue water's vapour pressure near
373 K is recorded elsewhere as reading 0.7 K low at 1 atm, which acts the other way).  The
three files other than Kamihama's are marked `transcribedNotCheckedAgainstArticle` in the
corpus; the values were not read back against the articles for this page either.  No
measured azeotrope was read for benzene-methanol, chloroform-methanol, chloroform-MEK,
methanol-MEK, benzene-isopropanol, acetonitrile-ethanol or any ternary azeotrope, and the
page says so instead of comparing.

## 7. Findings about the engine and the catalogue (reported, not fixed)

* `propertyScanTernary mode lle` without a `gammaGamma` package and named `liquidPhases`
  counts every node as a FAILURE (171 of 171) and reports `n_ll 0` beside it: a check that
  could not run reads, to a careless reader, as "no split found".  The page reads
  `failures` and says it.
* `propertyPoint` requires `T` in its state block even when every property asked for
  solves its own temperature.
* The acetonitrile-ethanol pair is used at 371.8 K against a validity span of one
  temperature (333.15 K); the chloroform-MEK pair likewise (303.15 K).  The engine says so
  on every run; a map built on such pairs is the model's, and the page says that too.
