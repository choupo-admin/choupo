# EduTools against the canonical ChemE curriculum — survey and proposal

**Status: SURVEY AND PROPOSAL, nothing built, nothing authorised.**  Written
2026-08-18 on the owner's instruction to go and look at the famous chemical
engineering curricula and find more EduTools — naming two candidates, the
Thiele modulus with a concentration-field visualisation and pressure drop in
packings.  This document classifies candidates against what the engine
ACTUALLY computes, ranks them, and treats the owner's two by name.  It
changes no code and proposes no commitment; §7 is the ranked list, §6 the
verdict on the two named candidates, §9 what could not be verified.

Everything marked *(read)* was verified in this tree at the cited path.
Everything marked *(asserted)* is general knowledge about the curriculum and
was NOT verified here.  The distinction is load-bearing: a bucket-A claim is
worthless without the code that produces the numbers.

---

## 1. The criterion, restated — and the amendment that changes tool design

An EduTool is **a VIEW over physics the engine actually computes — never a
second implementation in TypeScript.**  Twelve exist
(`gui/src/ui/methods/registry.ts:88-149`, *read*): McCabe-Thiele,
psychrometric chart, Kremser, pinch composite curves, ε-NTU, pump-vs-system,
Merkel, Rayleigh, Levenspiel, Van Heerden, drying curve, adsorption
breakthrough.

Three properties of the existing twelve constrain every candidate below, and
all three were read rather than assumed:

* **Zero physics in TypeScript, with AUTHORISED VIEW-GEOMETRY EXCEPTIONS.**
  `LevenspielTool.tsx:48-67` (*read*) enumerates its own three: an ordinate
  transform (`1/y` over the engine's published points), a trapezoid area
  under engine points, and a rectangle from engine KPIs.  Each is labelled
  where it happens.  A candidate that needs a *correlation* evaluated in the
  browser is not an EduTool; a candidate that needs a *line drawn between two
  engine-published points* is.
* **A tool is fed by its OWN SEALED WITNESS and nothing else.**  Decided
  2026-08-17 by Vítor, recorded in `docs/architecture/decision-records.md:102`
  (*read*, via `one-tab-one-thing.md`): the `Classroom | Current run` toggle
  goes, "a teaching instrument whose answer depends on what happens to be
  open in another tab is not stable".  So **every candidate below needs a
  witness tutorial**, and where none exists that cost is stated.  Bundling is
  automatic (`gui/src/cases/tutorials.ts:64`, *read* — every tutorial input
  file is inlined at build time), so "witness" means "author and seal a
  case", not "wire up a loader".
* **One witness, one run, knobs debounced** (`gui/src/case/methodRun.ts`,
  *read*).  A tool does not orchestrate N runs.

### 1.1 The finding that upgrades several candidates: the sweep IS the chart

A classical chart is a FAMILY OF CURVES, and a single engine run gives one
point.  That looked like the structural blocker for every chart-shaped
candidate (Moody, the Fair capacity chart, η-φ).  It is not, because the
engine already sweeps itself:

* `SweepDriver` writes `sweep_results.csv` with `point, <target>, <responses…>`
  (`src/outerDriver/SweepDriver.cpp:63,91-99`, *read*), responses being
  `unit.KPI` paths (`tutorials/steady/optimisation/sensitivity01_column_reflux/system/outerDict`,
  *read*).
* `GridSweepDriver` does the same over TWO targets
  (`src/outerDriver/GridSweepDriver.cpp:78,107`, *read*) — a family of curves.
* The GUI worker harvests every `*.csv` the run writes into `RunResult.csvFiles`
  (`gui/public/workers/*.js:230-236`; `gui/src/adapters/SolverAdapter.ts:329`,
  *read*).

**So a chart witness is an `outerDict` grid sweep, and the whole family is
engine-computed in ONE run.**  Nothing new is needed for this.  It is the
single most useful mechanical fact in this survey and it should be stated in
the registry's own comment when the first chart tool lands.

---

## 2. Survey method

Read in this tree: `gui/src/ui/methods/registry.ts`, `LevenspielTool.tsx`,
`methodRun.ts`, `tutorials.ts`, the worker CSV harvest; the unit-operation
tree `src/unitOperations/**`; the property-operation registry
`src/propertyOps/PropertyOperation.cpp:130-176`; the solver inventory
`src/solver/`; `src/streams/ProcessStream.H`; `docs/theoryGuide.tex` chapter
labels and its transport-status note; the tutorial corpus listing.

The curriculum frame is the standard sequence: unit operations
(McCabe/Smith/Harriott; Coulson & Richardson; Geankoplis), separations
(Treybal; Seader & Henley), reaction engineering (Levenspiel; Fogler),
transport (Bird/Stewart/Lightfoot), and design (Sinnott & Towler; Perry;
Green & Southard).  Where a method's presence in a *named* text was not
verified here it is marked "commonly taught, source not verified here" —
inventing a citation converts *unsourced* into *falsely sourced*, which no
reader and no gate can detect.

---

## 3. The classical constructions — methods, not topics

Listed only where the CONSTRUCTION is the lesson: something is drawn, and the
drawing answers the question.

| # | Construction | Where taught (asserted unless noted) | Bucket |
|---|---|---|---|
| 1 | Common tangent to g_mix(x): why a binary splits | Smith/Van Ness/Abbott; any thermo course | **A** |
| 2 | Ternary tie-triangle + Hunter-Nash stage stepping | Treybal (commonly taught; page not verified) | **A** |
| 3 | MSMPR semilog CSD: ln n vs L, slope −1/Gτ | Randolph & Larson; Mullin (commonly taught) | **A** |
| 4 | Cyclone grade-efficiency curve and d50 | Coulson & Richardson vol. 2; Perry | **A** |
| 5 | Moody chart: f vs Re at several ε/D | Moody (1944); C&R vol. 1 | **A** |
| 6 | Arrhenius plot: ln k vs 1/T, slope −E/R | universal | **A** |
| 7 | Langmuir linearisation p/q vs p | Ruthven; Perry (commonly taught) | **A** |
| 8 | Compressibility chart Z vs P at several T | Smith/Van Ness/Abbott | **A** |
| 9 | Levenspiel plot, Van Heerden, McCabe-Thiele, Kremser, Rayleigh, Merkel, ε-NTU, pinch, psychro, drying, breakthrough, pump-vs-system | — | **BUILT** |
| 10 | η–φ effectiveness curve + intraparticle profile | Thiele (1939); Levenspiel; Fogler | **B** |
| 11 | Weisz-Prater observable criterion | Fogler (commonly taught) | **B** (tiny) |
| 12 | Fair capacity chart C_SB vs F_LV (sieve trays) | Fair (1961), already cited in-tree *(read)* | **B** (tiny) |
| 13 | Generalised pressure-drop correlation, packed columns | Perry; Sinnott & Towler (chart lineage) | **B** (large) |
| 14 | Ponchon-Savarit enthalpy-composition construction | Treybal; C&R vol. 2 (commonly taught) | **B** |
| 15 | HTU/NTU + Colburn diagram, packed absorption | Treybal | **B** |
| 16 | RTD: E and F curves, tanks-in-series, dispersion | Levenspiel | **B** |
| 17 | Residue curve map / distillation boundaries | Seader & Henley; Doherty & Malone | **B** |
| 18 | Rankine cycle on T–s and Mollier | Smith/Van Ness/Abbott | **B** |
| 19 | Minimum fluidisation velocity; Geldart chart | Kunii & Levenspiel; C&R vol. 2 | **B** |
| 20 | Constant-pressure filtration, t/V vs V | C&R vol. 2; Perry (commonly taught) | **B** |
| 21 | Kynch / Coe-Clevenger / Talmage-Fitch thickener sizing | C&R vol. 2 (commonly taught) | **B** |
| 22 | Two-film interface construction, slope −k_x/k_y | Treybal | **B** |
| 23 | Heisler / Gurney-Lurie transient conduction charts | Incropera; BSL (Gurney-Lurie) | **C** |
| 24 | Bode / Nyquist / root locus | control texts, none named in the brief | **C** (reframe) |
| 25 | Wilson plot for exchanger coefficients | commonly taught, source not verified here | **C** |
| 26 | Cost nomographs / CE-index curves | Sinnott & Towler; Peters & Timmerhaus | **C** (weak) |

---

## 4. Bucket A — the engine already computes it

Each row names the code that produces the numbers and a witness.  "New
witness" means the physics is there but no sealed case exercises it in the
shape the tool needs.

### A1. Common tangent to the Gibbs energy of mixing — the strongest cheap win

`src/propertyOps/PropertyScanBinary.cpp:86` (*read*) writes
`x1,gmix_J_per_mol,role,beta`, and its own comment at lines 96-101 states
what a tool would draw: *"the two binodal points lie ON the curve above and
share its common tangent — the engine, not a fit, locates them.  A miscible
system returns no split: reported honestly."*  Witness exists:
`tutorials/props/scan/binary01_lle_water_nbutanol` (*read*).

The tool draws g_mix(x1), the two engine-located binodal points, and the
straight line through them — and the student SEES that the line lies BELOW
the curve between them, which is the entire reason two phases exist.  The
only view geometry is a straight segment between two published points.
Zero engine work.  Theory anchor `ch:lle-gibbs` exists (*read*).

#### A1 amendment, 2026-08-18 — the lens EXISTS, and the remaining gap is engine-side

A1 reads as a proposal for a thirteenth EduTool.  It should not: the picture
it describes is already on screen, and has been since before the 2026-08-15
purge that moved McCabe-Thiele and the psychrometric chart OUT of Explore.
It is the Explore lens `binaryLle` — "Binary LLE (g_mix + tangent)"
(`gui/src/ui/ExploreWorkspace.tsx`), gated in `gui/src/case/exploreViews.ts`,
fed by `propertyScanBinary` through `gui/src/case/exploreSynth.ts`, drawn by
`gui/src/ui/plotting/BinaryLlePlot.tsx`, which renders the curve, the two
engine binodal markers with their β, and the dashed chord through them.
The purge applied this survey's own placement criterion
(method-construction → EduTools; property-surface → Explorer) and left this
lens where it was — so the criterion has already been run against this exact
picture, and it came out Explorer.  A1 is banked, not pending; building a
tool for it would be a second home for one picture.

What is NOT banked is a slice of the physics the picture asserts, and it is
**engine-side (C++), not view-side**.  Two published quantities are missing
from `propertyScanBinary`'s `x1,gmix_J_per_mol,role,beta`:

1. **The tangent slope per binodal row** — `dg/dx = R·T·ln(γ₁x₁/γ₂x₂)`,
   evaluated at each of the two coexisting compositions from the same
   activity model the flash used.  Published, it makes the construction
   FALSIFIABLE on screen: two slopes that agree with each other and with the
   chord's rise-over-run are the common-tangent condition, checked rather
   than asserted.  Today the chord is drawn between two flash results and
   nothing anywhere confirms it is tangent to the curve it crosses.
2. **`role,spinodal` rows** — the compositions where `d²g/dx² = 0`, so the
   metastable band between binodal and spinodal can be drawn.  It is
   currently absent from the diagram, and the view says so in those words:
   the engine publishes the curve and two compositions, no curvature.

**Why this cannot be done in the view, and must not be attempted there.**
ZERO physics in TypeScript is a settled contract, and this is a case where
the contract has teeth rather than merely holding the line.  A finite
difference across the published `role,curve` nodes near the butanol-rich
binodal of `binary01` returns about **638 J/mol** where the chord's own slope
is about **1247 J/mol** (a probe recorded 2026-08-18 and NOT re-measured in
this slice — quoted for the size of the discrepancy, not as a pinned datum) —
a factor of two apart, on a grid whose spacing the GUI chooses
(`binaryLle: { n: … }`) and whose nodes do not land on the binodal
compositions at all.  A reader shown 638 beside 1247 would conclude the
construction had failed, when what failed is differentiating a coarse sample
of a steep curve at a point it does not contain.  A number that LOOKS like a
check and is not one is worse than the honest absence, because it is
believed.  The activity model, the γ's and the flash all live in the engine;
the slope belongs where they are.

Both items are small — the γ's are already in hand at each binodal row where
`PropertyScanBinary` writes it — and neither is authorised here.  This
records the gap; the slice is Vítor's to call.

### A2. Ternary tie-triangle and the Hunter-Nash construction

Two engine surfaces, already in the corpus and already agreeing:

* `propertyScanTernary` writes the binodal and the tie-lines from the LL
  flash — `x1,x2,x3,region,region_id,kind,tieline_id,…`
  (`src/propertyOps/PropertyScanTernary.cpp:201-278`, *read*); witness
  `tutorials/props/scan/ternary03_lle_water_ethanol_benzene`.
* `Extractor` publishes per-stage compositions —
  `stage, F_extract, F_raffinate, xE_<comp>, xR_<comp>`
  (`src/unitOperations/separation/Extractor.cpp:426-433`, *read*); witness
  `tutorials/steady/absorption/extract01_ethanol_water_benzene`.  The unit is
  a rigorous stagewise LL cascade over the SHARED Gibbs-minimisation flash
  kernel (`Extractor.H:40-53`, *read*) — not a shortcut.

**Verified, and worth recording:** the two witnesses' `thermoPhysPropDict`
files differ ONLY in the two liquid-phase NAMES (`liq1/liq2` vs
`raffinate/extract`) and a `vapour { fugacityModel idealGas; }` block the
extractor does not declare (*read*, `diff`).  Same components, same
formulation `gammaGamma`, same activity parameters.  So the tie-lines and the
stage points are the same physics — but the tool must map the phase names,
and the twin identity must be PINNED by a test the way the Levenspiel
pfr01/cstr01 twins are, or a later edit to one dict silently makes the
picture a lie.

Zero engine work.  Theory anchor `ch:extractor` exists (*read*).

#### A2 amendment, 2026-08-18 — BUILT, and the "no new physics" claim held with one named exception

The tool exists: `gui/src/ui/methods/TieTriangleTool.tsx` (the construction)
over `gui/src/case/hunterNash.ts` (the reading and the geometry), pinned by
`gui/tests/hunterNash.test.ts`, with `sec:hunter-nash` written into the LLE
chapter of the theory guide.  It is registered `planned` and NOT mounted —
the reason is recorded beside the registry entry and is a host-dispatch
question, not a physics one.

**Verified by RUNNING, not reading** (which §9.1 says this survey did not do,
and which this slice did):

* `./choupoProps tutorials/props/scan/ternary03_lle_water_ethanol_benzene`
  reproduces the case's committed `ternary.csv` **byte for byte** — 141 data
  rows, 105 classified nodes, 18 tie-lines at the authored `tieStride 4`.
* `./choupoSolve tutorials/steady/absorption/extract01_ethanol_water_benzene`
  publishes the per-stage tie-lines the construction needs
  (`xE_<comp>`/`xR_<comp>` over `stage`), the four terminal flows as KPIs, and
  the two inlet stream compositions.
* The Hunter-Nash colinearity — Δ, R_j, E_{j+1} on one line for every cut —
  **holds on the engine's own cascade to 1.2e-4 of a triangle edge**, the same
  ORDER as the extractor's own stopping tolerance (a relative mass closure of
  1e-4).  That is an order-of-magnitude remark, not an identity: a mass closure
  and a distance on a diagram are different quantities and are not claimed to
  be the same one.  The
  mixing point located as a line crossing agrees with the lever-rule point
  computed from the published flows to 2.8e-4.  Both are now the tool's
  headline numbers, and both are falsifiable rather than asserted.

**§9.6 is upgraded.**  That caveat said the twin claim rested on one `diff` of
two `thermoPhysPropDict` files and did not prove the records resolve
identically.  They do: the two cases' sealed `constant/components/*.dat` and
`constant/parameters/UNIFAC/**` are **byte-identical**, and the test suite pins
that set-for-set rather than file-by-file, so a record added to one witness and
not the other fails too.

**The engine gap the build found, and it is the one the survey did not
anticipate.**  `propertyScanTernary` publishes tie-lines only at the
compositions its own grid sweep produced; there is no way to ask for **the
tie-line through a GIVEN composition**.  The classical Hunter-Nash stage count
needs exactly that — step 2 of the construction reads a conjugate composition
off a tie-line interpolated between the plotted ones — so a *graphical stage
count* cannot be drawn without inventing a flash nobody ran.  The tool
therefore steps on the CASCADE's own stages and says so: it shows what the
method claims about the stages the engine solved, and it cannot answer "how
many stages would this duty need" graphically.  Closing the gap is a small
props-op slice (an LL flash at a declared list of compositions, published in
the same tie-row shape), and it is not authorised here.

**A second finding, engine-side and pre-existing.**  Both witnesses raise the
LL flash's own TPD advisory on their DEFAULT settings — 138 warnings on the map
run, 340 on the 5-stage cascade — `converged phase L-alpha is TPD-unstable
(tm ≈ -0.57) … the reported 2-phase answer may be a local minimum.  Consider
phaseSet VLLE.`  The posture is deliberate (advisory since 2026-07-25,
`IsothermalFlash.cpp`), it goes to stderr, and nothing in the corpus surfaces
it.  Every tie-line the diagram draws is one of those answers, so the tool
counts them and prints the engine's first line verbatim.  Whether a
water/ethanol/benzene LL flash at 298 K *should* be flagged unstable is a
question for the curator; this records that it is.

### A3. MSMPR crystal size distribution

`Crystalliser` publishes `number_density`, `mass_density` and (on the
size-dependent path) `growth_rate` over an L grid
(`src/unitOperations/crystallisation/Crystalliser.cpp:543-544, 856-858`,
*read*), built from the MSMPR population balance n(L) = n0·exp(−L/Gτ)
(`Crystalliser.cpp:528`, *read*).  Witness
`tutorials/steady/crystallisation/crystalliser02_msmpr` (*read*).

The construction is the semilog plot: ln n against L is a STRAIGHT LINE whose
slope is −1/(Gτ) and whose intercept is the nucleation density n0 — the plot
by which a real CSD measurement is turned into a growth rate and a nucleation
rate.  View geometry: a log ordinate and a least-squares line through engine
points (the line is a fit, so it must be labelled as one, and the engine's
own G and τ should be printed beside the fitted slope as the check).  Zero
engine work.  Theory anchors `ch:crystalliser`, `ch:crystalliser-fvm` (*read*).

### A4. Cyclone grade-efficiency curve

`Cyclone` publishes `diameter_micron`, `grade_efficiency`, `massFrac_in`,
`massFrac_cleanGas`, `massFrac_captured`
(`src/unitOperations/separation/Cyclone.cpp:233-237`, *read*); five witnesses
under `tutorials/steady/gas-solid/` including a validation case
(`cyclone05_dirgo_leith_validation`, *read*).  The `model` slot already
carries five sub-models (Lapple … Muschelknautz), so the tool can show the
SAME dust through different correlations — which is the real lesson: d50 is a
model output, not a property of the cyclone.  Zero engine work; the
multi-model comparison needs one witness per model or a per-tool knob mapping
to the `model` word (a WORD override, which `applyScalarOverride` does not do
— it replaces NUMBERS only, `methodRun.ts:60-80`, *read*).  That is a small,
named GUI slice, not engine work.

### A5. Moody chart

`Pipe` publishes `reynolds`, `frictionFactor`, `regime`, `velocity`,
`head_loss_m` (`src/unitOperations/hydraulics/Pipe.cpp:574-577`, *read*), with
three selectable friction models (Churchill default, Haaland, Colebrook) and
the regime announced (`Pipe.H:60-78`, *read*).  Witness
`tutorials/steady/hydraulics/pipe01_water_line`.

A grid sweep over flow × roughness (§1.1) produces the whole chart in one
run, every point from the engine's own correlation.  **New witness needed**: a
`pipe0X_moody_map` carrying an `outerDict` grid sweep.  Zero engine work.
Theory anchor `ch:hydraulics-pressure` (*read*).

### A6. Arrhenius plot

`kinetics1D` writes `T_K,time,c_fit,c_data,k_T` and prints E_a, k0 and R²
(`src/propertyOps/Kinetics1D.cpp:285,315`, *read*); witness
`tutorials/props/kinetics/rate01_arrhenius_recovery` (*read*).  The
construction is ln k against 1/T with the engine's own fitted line; the
pedagogy is that the recovered E_a is only as good as the T-range spanned.
Zero engine work.

### A7. Adsorption isotherm and its linearisation

`isothermEval` writes `T,p,q` over a (T,p) grid and runs its contract gates
(Henry limit, saturation, anchor pin) — `src/propertyOps/IsothermEval.cpp:163`
(*read*); witness `tutorials/props/adsorption/isotherm01_eval_13x_co2`.  The
construction is the Langmuir linearisation p/q vs p (a straight line whose
slope is 1/q_sat), plus the Henry-limit tangent at the origin, which the
engine already checks.  Zero engine work.  Theory anchor `ch:adsorption`.

### A8. Compressibility chart

`propertyScan2D` with `properties ( Z v_molar )` — witness
`tutorials/props/scan/scan2d01_co2_compressibility` (*read*).  A Z-vs-P family
at several T, from whichever cubic EOS or PC-SAFT the case declares.  Zero
engine work.  Honest caveat the tool must carry: this is NOT the generalised
(Nelson-Obert) chart in reduced coordinates unless the case's own T_c/P_c are
used to reduce the axes — and reducing axes with the record's own criticals is
arithmetic on published numbers, so it is permissible view geometry, but it
must say that the collapse onto one curve is the EOS's claim, not a
measurement.

### A9. Tray flood approach along a column

`DistillationColumn` publishes per-stage `floodApproach`, `dP_Pa`,
`h_backup_mm` and the KPIs `diameter`, `floodApproach_max`, `floodStage`,
`dP_column_kPa`, `downcomerBackup_max_mm`
(`src/unitOperations/distillation/DistillationColumn.cpp:1602-1621`, *read*).

Bucket A, but weak AS A CONSTRUCTION: it is a profile plot, not a drawing that
answers a question.  The construction version is B3 below and is much better.

### A10. Ergun pressure profile through a packed bed

`FixedBedAdsorber` under `flowModel ergun` writes an axial profile carrying
`z P c_i q_i [T]` (`src/unitOperations/batch/FixedBedAdsorber.cpp:1501-1546`,
*read*); witnesses `batch16_ergun_profile` (its controlDict: *"pure-He Ergun
profile against the closed-form P-squared solution"*), `batch17_dilute_ergun_limit`,
`batch18_ergun_conservation` (*read* — the owner's brief named the last two and
they exist).

**One blocker, precisely located**: the file is written as
`<t>/<name>.profile`, and the GUI worker harvests only `*.csv` plus two named
`.meta` files (`gui/public/workers/*.js:230-236`, *read*).  So this profile
never reaches the browser.  Either the writer emits `.csv` or the harvest
learns the extension — a one-line-scale plumbing slice in one of two places,
but it must be done deliberately (the harvest is a whitelist on purpose: an
eager glob would bloat the bundle).

---

## 5. Bucket B — needs a named engine slice first

### B1. Thiele modulus and the intraparticle field — see §6.1.

### B2. Packed-COLUMN pressure drop and flooding — see §6.2.

### B3. The Fair capacity chart, traced by the column's own stages (TINY)

`TrayHydraulics` already computes, per tray, the flow parameter
F_LV = (L/V)·√(ρ_V/ρ_L) and the Souders-Brown capacity coefficient C_SB from
the Lygeros & Magoulas algebraic representation of Fair's chart
(`src/unitOperations/distillation/TrayHydraulics.H:54-70`,
`TrayHydraulics.cpp:47,110`, *read*).  Neither is published.

**The slice is two profile columns.**  And the construction is unusually
elegant: every tray of one column sits at its own F_LV but at the SAME tray
spacing, so the stages' (F_LV, C_SB) points LIE ON the Fair curve — the column
traces its own chart.  A grid sweep over tray spacing (§1.1) gives the family.

Two honesty features are already in the engine and must reach the tool: the
header states the Lygeros-Magoulas fit "is KNOWN to misbehave at small F_LV
(its slope turns the wrong way below F_LV ~ 0.03)" and the pass "says so out
loud" (`TrayHydraulics.H:65-70`, *read*, exposed as `Result::lowFlowParam`),
and the weep check refuses to run without the charted constant K2 — *"Choupo
will not invent it"* (`TrayHydraulics.H:87-96`, *read*).  A tool that drew a
smooth curve through the misbehaving region would undo both.

### B4. Ponchon-Savarit

Needs, per stage, the vapour and liquid molar flows V and L and the phase
enthalpies H_V, H_L at column pressure.  The column publishes only
`stage, T, x_i, y_i` (`DistillationColumn.cpp:392-407`, *read*), and
`ProcessStream` carries a fluid-phase `H` but no per-stage record
(`ProcessStream.H:110`, *read*).  Slice: four profile columns from the MESH
solution (which already holds V and L — they are passed into
`TrayHydraulics::evaluate`, *read*), plus an h-x-y props scan for the
enthalpy-composition envelope.  Medium; and the pedagogical payoff is
narrower than McCabe-Thiele, which is already built.

### B5. HTU/NTU, packed absorption, the Colburn diagram

The theory guide's own consolidated status note says it plainly: *"No
transport coefficient is read or computed by any unit op … column efficiency
is 100 % per stage"* (`docs/theoryGuide.tex:11868-11875`, *read*).  The
Absorber is a Kremser group method with no height and no hydraulics
(`Absorber.H:31-64`, *read*).  This is a mass-transfer-coefficient programme
(Onda / Sherwood correlations), not a tool slice.  Large.

### B6. RTD — E and F curves, tanks-in-series, dispersion

Nothing in `src/` computes a residence-time distribution (*read*: a grep for
RTD / residence time distribution / dispersion number / tanks-in-series /
E-curve across `src/**` returns one hit, and it is `PSA.cpp:425` LISTING
dispersion among the things that unit does NOT model).  The engine has the
pieces — an ODE integrator stack
(`src/solver/ODE/`, *read*) and a dynamic CSTR — so a tracer-pulse dynamic
case could produce a real E(t) from a real vessel model.  That is a genuine
slice (a tracer species with no reaction, a pulse injection, the outlet
concentration history) and it is Levenspiel's core diagnostic construction.
Medium; higher curriculum weight than B4.

### B7. Rankine on T–s / Mollier

Two independent blockers, both verified:
* **Streams carry no entropy.**  `ProcessStream` has F, T, P, z, vf, H
  (`ProcessStream.H:78-118`, *read*) — no S.  So a cycle's state points cannot
  be placed on an s-axis today.
* **Model mismatch.**  `steamTables` (IF97) publishes the saturation dome and
  isobars (`src/propertyOps/SteamTables.cpp:139-229`, *read*), but
  `tutorials/steady/power/rankine01_water` declares `formulation gammaPhi` with
  `activityModel ideal` (*read*).  Drawing that cycle on an IF97 dome is a
  model-boundary crossing, and the project has a settled posture for exactly
  that (`ModelBoundaryAudit`, the enthalpy STEP): it must be announced, not
  papered over.

Slice: publish stream entropy, and either an IF97-based power witness or an
announced-boundary tool.  Medium, and it touches the stream record — which
makes it a bigger decision than its line count suggests.

### B8. Fluidisation — u_mf and the Geldart chart

Ergun exists but in exactly ONE unit (`FixedBedAdsorber`, *read*); u_mf is the
root of Ergun ΔP = bed weight, which `NewtonRaphson` (*read*) solves trivially.
But there is no fluidised unit operation and no particle-density/size record
outside the adsorbent one, and the Geldart chart is a CLASSIFICATION diagram —
a map of published boundaries, not a computation.  A u_mf tool would be honest;
a Geldart tool would be a picture of someone else's chart, and belongs in the
theory guide rather than in an instrument that claims to compute.

### B9. Filtration; B10. Thickener sizing (Kynch / Talmage-Fitch)

No filtration unit (`BagFilter` is gas-solid dust collection, *read*) and no
settling/thickener unit anywhere (*read*).  Both constructions are strong
curriculum items in Coulson & Richardson vol. 2 (asserted), and both are
LINEARISATIONS OF MEASURED DATA (t/V vs V; the settling curve's tangent
construction) rather than views over a simulation.  If built, they should be
built as UNITS first with their own witnesses; a tool over an absent unit
would be a data-plotting widget wearing an EduTool's name.

### B11. Residue curve maps

The pieces exist — bubble-point solving (`src/unitOperations/saturation/`,
*read*), a ternary bubble-T scan witness
(`tutorials/props/scan/ternary02_bubbleT_benzene_toluene_water`, *read*), and an
ODE stack.  The slice is a props op that integrates dx/dξ = x − y*(x) from a
grid of starting compositions.  Small-to-medium, and it opens the azeotropic
distillation material that the corpus already touches (the guide's known
limitation about NRTL through an azeotrope).  Worth listing; not top five.

---

## 6. The owner's two named candidates

### A-new. Species distribution vs pH (the Bjerrum plot) -- EXPLORE, ruled 2026-08-18

Vitor proposed it and placed it himself: "um grafico em que se varia o pH e se
mostram as especies que estao em fase aquosa (tb. se pode manipular o CO2 ou a
T entre 0 e 100 graus)", then "isso talvez possa ficar no explore".  That is
the settled criterion applied correctly -- a distribution diagram shows what a
system IS, not a construction a student performs -- so it is an EXPLORE lens
and not the fourteenth EduTool.

**ZERO NEW PHYSICS, verified in the source rather than assumed.**  The
`speciate` props op already declares all three knobs:
`pH` (a number OR the word `solve`, `Speciate.cpp:193-200`), `atmosphere { CO2
4.2e-4 atm; ... }` for the open system with a MANDATORY pressure unit
(`:207-224`), and `temperature` (`:231`).  The lens is a sweep over an op the
corpus already runs -- the same shape as every other Explore lens.

**THE ONE THING THE VIEW MUST SAY, and it is the whole lesson.**  `pH` carries
two different meanings and the op's own grammar separates them.  With `pH
solve` it is a RESULT, from electroneutrality -- what every reactive case
prints today ("speciation: SOLVED pH = ... (from electroneutrality)").  Given
as a number it is IMPOSED, and imposing a pH asserts a strong acid or base
that nobody declared, supplying the charge that closes the balance: the
solution is no longer neutral by itself, it is neutral because of an implicit
titrant.

Neither is wrong -- the classical Bjerrum plot is drawn exactly the second way.
Drawing it WITHOUT SAYING SO is what would be wrong, and it is the same defect
class as the reduced-identity and the eta = 1 silences: a declared fact the
reader never meets.  So the axis states that the pH is imposed and that the
per-point charge imbalance IS the implicit titrant.  If the engine can publish
that excess charge, it becomes a number on screen instead of a sentence, and
that is the preferred form -- a claim with a measurement beside it.

Named consequences, not yet slices:
  * the 0-100 C range crosses declared validity bands (Davies' trust band, the
    van't Hoff K(T) windows).  The engine already ANNOUNCES those; the lens
    should surface the advisory rather than hide it, which makes the range a
    demonstration of numerical honesty rather than a hazard.
  * varying CO2 moves the equilibrium pH AND the carbonate/bicarbonate split at
    once -- rainwater and ocean acidification on one pair of axes.
  * whether the engine publishes the excess charge under an imposed pH is
    UNVERIFIED here; check before promising it in the view.

### 6.1 Thiele modulus with concentration-field visualisation

#### What the engine does today, and the silence in it

**There is no intraparticle diffusion anywhere.**  Verified: a case-insensitive
grep for `thiele|effectiveness factor|intraparticle|effectiveDiffus|pellet`
across every `.H`/`.cpp` in `src/` returns exactly **three** matches, and none
of them is the physics (*read*): a McCabe-Thiele q-line comment
(`DistillationColumn.cpp:896`), and the same adsorbent-record diagnostic string
twice (`FixedBedAdsorber.cpp:286`, `BatchAdsorber.cpp:187` — *"pellet/sample
this k describes"*, describing where a mass-transfer coefficient came from).
`docs/theoryGuide.tex` contains no Thiele modulus at all — every "Thiele" in
the documentation is "McCabe-Thiele" (*read*).

`catalystLoading` does one thing and says so: *"A heterogeneous rate constant
is reported per gram of dry catalyst; the bed converts it to a volumetric
rate.  Absent => already volumetric."* — `src/unitOperations/reactor/PFR.cpp:449-452`
(*read*), with the identical two lines in `CSTR.cpp:460`, `BatchReactor.cpp:77,400`
and `DynamicCSTR.cpp:78,506` (*read*).  It is a unit conversion.  **The pellet
is a POINT, the effectiveness factor is implicitly 1, and nothing anywhere
says so.**

That is the defect, and it is bigger than the missing tool.  A student runs a
packed-bed reactor in Choupo and gets an answer computed as though the
reactant reached the centre of every pellet instantly.  For a sphere at
φ = 5 the true η is about 0.19 (asserted — the standard first-order sphere
result η = (1/φ)[1/tanh 3φ − 1/(3φ)]): **the reactor volume is wrong by a
factor of five, silently, exit 0.**  η MULTIPLIES the rate.  This is not
decoration.

#### The cheapest correct action, and it is not the tool

**Announce the assumption.**  When a reactor declares `catalystLoading` and no
pellet model, print that the pellet is unresolved and η = 1 is assumed.  Zero
numbers move, zero goldens move, and the silent falsehood becomes a stated
approximation.  The project has done exactly this before and recorded why: a
declared validity window that was parsed and discarded, a status guard armed
on one of two routes — *harmless-because-unchecked is not safety*
(`CLAUDE.md` §6, *read*).  Ship this before anything else in this document.

Pair it with the **Weisz-Prater** observable criterion, which needs only
quantities a run already has plus the pellet radius and D_eff: it tells the
student whether they need the pellet at all, and it is the honest way to make
the announcement quantitative rather than merely present.

#### What the engine would need for the real slice

* **A pellet record, and it is an ASSET, not a component field.**  Mirror
  `src/thermo/adsorbent/Adsorbent.H` + `AdsorbentRegistry` (*read*) — which
  already carries `dParticle()` and `sphericity()` (`Adsorbent.H:91-92`) and is
  already declared case-locally in the corpus
  (`tutorials/batch/adsorber/*/constant/adsorbents/zeolite13X_A4.dat:14`,
  `dParticle 2.0 mm;`, *read*).  A `kind catalyst;` record in the flat
  `data/standards/assets/` home (`kind` values today: constructionMaterial, RO,
  NF, IEM, adsorbent, ionExchangeResin — *read*) carrying pellet
  `geometry slab|cylinder|sphere;`, the characteristic dimension, particle
  porosity and tortuosity.  Nothing about the pellet goes on a component: the
  record rules are explicit that pair data lives in pair tables and that a
  substance record does not carry another family's facts.
* **Where D_eff lives is a decision the owner must make, and it is the arity
  question.**  An effective diffusivity is a (component, pellet) PAIR.  Two
  honest options: a pair table under `data/standards/parameters/` keyed by
  (species, catalyst) with a primary source per value; or DERIVE it as
  (ε_p/τ)·D_molecular from the transport block and ANNOUNCE the derivation —
  *the tree never stores a derivative*.  What must NOT happen is both, which is
  the arity sin the project has paid for repeatedly.
* **The BVP, with no new machinery.**  d²c/dξ² + (s/ξ)·dc/dξ = φ²·c^n on
  ξ ∈ (0,1], c(1) = c_surface, dc/dξ|₀ = 0, s = 0/1/2 for slab/cylinder/sphere.
  Discretised on N nodes this is exactly what `NewtonND` + `LU` already solve
  (`src/solver/NewtonND.{H,cpp}`, `src/solver/LU.{H,cpp}`, *read*), and the
  corpus already contains a 1-D discretised population balance
  (`ch:crystalliser-fvm`, *read*) as precedent.  **No new dependency, no new
  solver.**  The isothermal first-order case has a closed form, which is the
  verification oracle a gate needs.
* **η is a RESULT, never a knob.**  The Absorber header states the general
  credo — hardware in `operation`, performance as a result (`Absorber.H:36-42`,
  *read*).  A case declares a pellet; it never declares η.  Applying η is one
  multiplication at the point where `catFactor` is applied today
  (`PFR.cpp:451-452` and its three siblings, *read*).
* **The reaction order comes from ONE home.**  `Reaction::forwardOrder`, which
  refuses by name when undeclared (`CLAUDE.md` §6, *read*) — the pellet must
  not grow a second order field.

#### The non-isothermal pellet: OUT of a first slice, and the reason matters

A non-isothermal pellet adds an energy equation coupled through Arrhenius,
producing the Prater/γ multiplicity: up to three η for one φ, and η > 1.  It is
out of the first slice for three reasons, in order of weight:

1. **The mathematics changes kind.**  The isothermal BVP has one solution and a
   Newton finds it.  The non-isothermal one has three and a Newton finds
   whichever the initial guess is nearest — which is precisely the failure mode
   the project refuses (a plausible number at exit 0).  It needs continuation,
   not iteration, and the answer must be reported as a SET.
2. **The multiplicity lesson is already carried, one scale up.**  Van Heerden is
   a live EduTool.  A second multiplicity construction competing with it is not
   the Pareto move.
3. **The first slice has an oracle and the second does not.**  Shipping the
   isothermal η against its closed form is verifiable; shipping the
   non-isothermal one is not, at first contact.

The tool must SAY "isothermal pellet — the non-isothermal pellet has multiple
steady states and is not modelled", the way the engine says what it does not do
elsewhere.

#### The tool itself

Two panels over the same engine-published BVP:

* **η vs φ**, log-log, all three geometries, with the case's own point placed on
  its own curve — the family from a grid sweep (§1.1).  The two asymptotes
  (η → 1 at small φ; η → 1/φ at large φ) and the near-collapse of the three
  geometries when φ is built on the volume-to-surface length are the lesson.
* **The concentration field**: c/c_s against r/R from the BVP nodes, drawn both
  as a line and as a radial disc — the owner's "visualisation of concentration
  fields".  Both are views over published nodes; the disc is a polar
  re-rendering of the same vector, which is view geometry of exactly the kind
  already authorised.

The witness should be a PAIR of runs of the same reactor, pellet declared and
not, so the volume difference is the thing the student sees first.

**Order of work: announcement + Weisz-Prater → catalyst record + D_eff ruling →
BVP + η hook → witness → tool.**  Each step is useful alone, and the first is
useful immediately.

### 6.2 Pressure drop in packings — and the distinction the brief asked for

**The engine has Ergun, and Ergun is not this.**

What exists (*read*): `FixedBedAdsorber` supports `flowModel ergun`, refuses
without a positive `dParticle` and without gas viscosity, writes P(z) into its
axial profile, and is pinned by three witnesses — `batch16_ergun_profile`
(verified against a closed-form P² solution), `batch17_dilute_ergun_limit`,
`batch18_ergun_conservation` (`FixedBedAdsorber.cpp:155-215, 1501-1546`,
*read*).  The theory guide states the Ergun equation as the packed-bed law
(`theoryGuide.tex:11826-11831`, *read*).

What "pressure drop in packings" means in a separations course is a DIFFERENT
problem, and three differences are decisive:

1. **Two phases, counter-current.**  A column packing carries gas up and liquid
   down.  The liquid hold-up narrows the channel the gas flows through, so ΔP
   rises with liquid rate at fixed gas rate.  Ergun has no liquid in it.
2. **The runaway is the point.**  The pedagogy of the generalised
   pressure-drop chart is the near-vertical rise at flooding — the operating
   limit.  Ergun is smooth and has no limit.
3. **The geometry is not a particle.**  Rings and structured sheets are
   described by a packing factor and a specific surface area, not by a sphere
   diameter; ε runs 0.7-0.95, well outside where Ergun's constants were fitted.

**Verdict: bucket B, and a LARGER B than the Thiele one** — because the blocker
is DATA and CITATION, not physics.  Verified (*read*): a grep across every
`.H`/`.cpp` in `src/` for `raschig|pall ring|HETP|randomPacking|structured
packing|packingFactor` returns **zero** matches, and the word "packing" itself
appears only as the cooling tower's Merkel packing and as the ODE integrator's
"same packing as y".  `data/standards/assets/` holds no packing either — its
`kind` values today are constructionMaterial, RO, NF, IEM, adsorbent and
ionExchangeResin (*read*).

Two honest routes, and the project's own precedent decides between them:

* The classical presentation is a CHART, and this repository has already ruled
  on charts twice, in the same file: it USES a published algebraic
  representation of Fair's chart with the fit named and its misbehaviour
  announced, and it REFUSES to invent the charted constant K2
  (`TrayHydraulics.H:63-96`, *read*).  So: **an algebraic correlation with a
  primary source, cited as an equation — never a digitised chart.**  Published
  algebraic forms for packed-column ΔP and flood exist (the Robbins and the
  Kister-Gill families are the ones usually cited; **source not verified here**,
  and the curator must check a primary before any of it is written down).
* The packing itself becomes curated data: `data/standards/assets/<packing>.dat`
  with `kind packing;`, mirroring the adsorbent records — packing factor,
  specific area, void fraction, each primary-cited with a validity window, and
  a REFUSAL when the packing is not curated.  The `kind` field and the flat
  assets home already support this with no architectural change (*read*).

And the SHAPE should not be invented either: the right form is a RATING PASS on
a converged column — "at this traffic, what is ΔP and how close to flood" —
which is exactly `TrayHydraulics`' settled posture (*"hydraulics is a RATING
pass on a converged profile, not a coupled unknown.  That is the honest
scope."*, `TrayHydraulics.H:38-42`, *read*).  Not a new coupled column.

**The interim answer to the owner's request, available now: B3.**  The engine
already computes F_LV and C_SB per tray and publishes neither.  Two profile
columns buy a real, cited, classical capacity chart — traced by the column's
own stages — on hardware Choupo actually models.  If the owner wants a
flooding-and-pressure-drop instrument in front of students soon, that is the
one that can ship soon; the packed-column version is a curation programme with
a unit at the end of it.

---

## 7. Ranked shortlist

Ranked by pedagogical value per unit of engine work, with the work named.
"Witness" cost is stated separately because a bucket-A tool is not free — it
needs a sealed case.

| Rank | Item | Engine work | Witness | Why here |
|---|---|---|---|---|
| **1** | **Thiele: the η = 1 ANNOUNCEMENT + Weisz-Prater** (not a tool) | One announcement in the four reactors that read `catalystLoading`; Weisz-Prater from existing observables + pellet R and D_eff | none (existing cases) | Removes a silent falsehood that can be a factor-of-five error in reactor volume. Zero goldens move. Nothing else in this document has this ratio. |
| **2** | **A1 — g_mix common tangent** | **none** | exists (`binary01_lle_water_nbutanol`) | The single deepest idea in the thermodynamics half of MCFT — *why* a phase splits — and the engine already locates the tangent points and says so in its own comment. |
| **3** | **A2 — ternary tie-triangle + Hunter-Nash** | **none** | two exist, thermo verified near-identical; needs a phase-name map and a twin-identity pin | Core Treybal construction; a rigorous stagewise cascade to judge the graphical answer against, which is the Kremser/Levenspiel pattern exactly. |
| **4** | **B1 — Thiele η-φ + intraparticle field** (the owner's #1) | Catalyst asset record + registry (mirrors `Adsorbent`); a D_eff arity ruling; a finite-difference BVP on `NewtonND`+`LU`; one rate-multiplier hook ×4 reactors | new pair-of-runs witness | The owner asked for it, and it CHANGES ANSWERS rather than illustrating them. Medium slice, no new dependency, closed-form oracle for the gate. |
| **5** | **B3 — Fair capacity chart from the column's own stages** | **two profile columns** (F_LV, C_SB — both already computed) | grid-sweep witness over tray spacing | The honest, buildable half of the owner's "pressure drop in packings", on hardware the engine models, with the fit's known misbehaviour already announced by the engine. |

Close behind, in order: **A3** MSMPR semilog CSD (zero engine work, canonical
construction, witness exists) · **A4** cyclone grade efficiency (zero engine
work; needs a word-override in the tool layer for the model comparison) ·
**A5** Moody chart (zero engine work; needs a grid-sweep witness) · **B6** RTD
E/F curves (real slice, high Levenspiel weight) · **A7** Langmuir
linearisation · **A6** Arrhenius plot · **B11** residue curve maps.

Deliberately NOT in the top five despite being cheap: **A9** (a profile plot,
not a construction), **A8** (Explore already owns property surfaces; the split
criterion in `registry.ts:157-161` puts a Z-P family on the Explore side of the
line unless the tool builds the reduced-coordinate collapse, and that claim
needs stating carefully), **A10** (blocked on a `.csv` harvest decision that
should be made on its own merits, not to unblock a tool).

---

## 8. Recommended OUT

* **Heisler / Gurney-Lurie transient conduction charts.**  The engine solves no
  conduction PDE and has no business growing one for a chart.  This belongs to
  a heat-transfer course, and a process simulator that grew a slab-conduction
  solver to draw it would be buying breadth for its own sake.
* **Bode / Nyquist / root locus — but REFRAME rather than reject.**  The engine
  integrates a nonlinear DAE; it has no transfer function, and linearising one
  in the browser to draw a Bode plot would be a second implementation in
  TypeScript, which is the one thing an EduTool may not be.  The honest version
  is the OPEN-LOOP REACTION CURVE: run a real `choupoCtrl` witness with a step
  in the manipulated variable, read the dead time and the slope off the ENGINE's
  own trajectory, and lay the Ziegler-Nichols tuning construction over it.  That
  is bucket A over an existing binary and existing witnesses
  (`tutorials/ctrl/`, *read*) and it teaches what the chart teaches: that the
  tuning rule is a reading taken off a measured response.
* **Wilson plot.**  A regression of measured exchanger data — a laboratory
  method, not a view over a simulation.
* **Cost nomographs / CE-index curves.**  `CostingPass`/`Guthrie` exists, so the
  numbers are there, but a chart of somebody's cost index is not a construction
  a student learns anything structural from; and the project's economics-honesty
  gate already governs what may be claimed here.
* **Geldart classification chart.**  A map of published boundaries, not a
  computation.  Theory guide, not instrument.

---

## 9. What could not be verified here

Stated plainly, because a survey that hides its gaps is worse than a shorter one.

1. **No gate, test or build was run** — the brief forbade `make`, `bin/runTests`
   and the `check_*` scripts.  Every claim above is a READING of source, dicts
   and docs, not an observed run.  In particular the bucket-A claims say "this
   code writes this column", not "I saw these numbers".
2. **No citation was verified against a primary source.**  Book attributions in
   §3 are general knowledge; the ones marked "commonly taught, source not
   verified here" are the ones I am least sure about — the Hunter-Nash naming in
   Treybal, the Kynch/Talmage-Fitch lineage in Coulson & Richardson, the
   filtration linearisation's home, and the Wilson plot.  **The packed-column
   correlations (Robbins; Kister & Gill) are named from memory and MUST be
   checked against a primary before a line of §6.2 is implemented.**  The
   in-tree citations quoted in §5 (Fair 1961; Souders & Brown 1934; Lygeros &
   Magoulas 1986; Ergun) were read from the source files, not independently
   confirmed against the papers.
3. **The η ≈ 0.19 at φ = 5 figure in §6.1 is an asserted standard result**, not
   a computation performed here, and not a number in this repository.
4. **Effort was NOT sized in hours.**  It is sized by SHAPE — "mirrors an
   existing pair of files", "two profile columns", "one hook in four places" —
   because I have no calibration for this codebase's velocity and a fabricated
   estimate would be exactly the kind of confident-looking number this project
   refuses elsewhere.
5. **The tutorial and record counts were not quoted**, per the generated-inventory
   rule; where a count would have been natural, the shape is given instead.
6. **The A2 twin-identity claim rests on one `diff`** of two
   `thermoPhysPropDict` files.  It does not prove the two cases' component
   records or pair parameters resolve identically at run time — only that the
   declarations match.  That is what a pinning test would have to establish.
   **CLOSED 2026-08-18** (see the A2 amendment): the two witnesses' sealed
   `constant/components/` and `constant/parameters/` trees are byte-identical,
   and `gui/tests/hunterNash.test.ts` pins the whole set.
7. **The Explore/EduTools boundary for A8** (compressibility chart) is a
   judgement call I made against the split criterion in `registry.ts:157-161`,
   not a decision anyone has taken.  It should be ruled on rather than assumed.
