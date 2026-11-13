# Equilibrium stages or a rate-based model? -- the `equilibrium-or-rate-based` EduTool

*Slice record, 2026-11-13.  Commission: the owner asked whether sizing real
distillation columns requires rate-based (non-equilibrium) models, received an
answer checked against sources, and then asked: "Podes fazer um EduTool com
estas recomendações e heurísticas? Isto é tremendamente importante!"  Every
number below was printed by this worktree's binary or read in the source
named beside it.*

## 1. The task, and the source rule

The student's task, in one sentence: **"I have to design or rate a column: is
an equilibrium-stage model with one efficiency enough, or do I need a
rate-based model, and how wrong can the simple one be?"**

Every recommendation on the page is one of:

* **(E)** something the page demonstrates with an engine run;
* **(R)** a statement read for this page in a source that could be opened,
  listed in `gui/src/ui/methods/lessonReferences.json` with how it was read;
* **(A)** an assumption of the page, used only for its own arithmetic choices
  (the trace column's four numbers, the 10 ppm target, the guesses).

A recommendation with neither (E) nor (R) is not written.  Section 5 lists
the candidates dropped for that reason.

## 2. What was built

| piece | where |
|---|---|
| the page | `gui/src/ui/methods/EquilibriumOrRateBasedTool.tsx` |
| the lesson text, the reference cards, the decision rows | `gui/src/ui/methods/equilibriumOrRateBasedLesson.ts` |
| witnesses, overrides, readers, the measured points | `gui/src/case/equilibriumOrRateBased.ts` |
| tests | `gui/tests/equilibriumOrRateBased.test.ts` (+ three sweep CSVs in `gui/tests/witnessOutputs.ts`) |
| registry | `equilibrium-or-rate-based`, shelf "Separations & phase equilibria", kind `selection`, theory `ch:ratebased`; the distillation sequence gains it between `fug` and `plant-cost` |
| guide | `docs/eduToolsGuide.tex`, section `sec:edu-equilibrium-or-rate-based` |

No engine code and no new case.  The page runs existing cases with declared
numbers substituted.  One tutorial comment was corrected: the header of
`column11_murphree/system/flowsheetDict` printed an x_D table (0.9505 at
E_MV 0.70, 0.98125 ideal) from an earlier engine; this engine gives 0.9179
and 0.9510, which match the case's golden.  The golden did not move.

Nothing starts on opening: every run is behind a button.

## 3. The demonstrations, measured

### Demonstration 1 -- the efficiency against a trace specification

Witness `steady/distillation/column11_murphree` (benzene/toluene, Wang-Henke,
declared `murphreeEfficiency`, read at `DistillationColumn.cpp:1597`, folded
into an effective K at `:1729`).  Two columns:

* **bulk**: the case as shipped (15 stages, feed 8, R = 2, D = 50 kmol/h);
* **trace**: four declared numbers rewritten (30 stages, feed 20, R = 3,
  D = 45 kmol/h of the 50 kmol/h of benzene fed).

Toluene mole fraction in the distillate (the stream composition the engine
publishes), native runs, every one converged within the case's own
`maxOuterIter 200`:

| E_MV | bulk | trace |
|---|---|---|
| 0.4 | 0.14693 | 1.0530e-2 |
| 0.5 | 0.11979 | 2.7791e-3 |
| 0.6 | 0.09874 | 6.8699e-4 |
| 0.7 | 0.08211 | 1.6326e-4 |
| 0.8 | 0.06876 | 3.6671e-5 |
| 0.9 | 0.05791 | 7.5677e-6 |
| 1.0 | 0.04898 | 1.3904e-6 |

E 0.7 -> 0.6 multiplies the bulk impurity by 1.20 and the trace impurity by
4.21.  Across the slider the trace impurity spans almost four decades.

**Trays for a target.**  The trace column at nStages 16, 18, ..., 80 (feed
held 10 stages above the bottom, the stripping section being loose), at every
efficiency: 231 runs, all converged (maximum 82 outer iterations).  The
smallest grid height that meets the target (nStages, reboiler counted; real
trays = nStages - 1):

| E_MV | 100 ppm | 10 ppm | 1 ppm |
|---|---|---|---|
| 0.4 | 54 | 64 | 74 |
| 0.5 | 44 | 52 | 60 |
| 0.6 | 36 | 44 | 50 |
| 0.7 | 32 | 38 | 44 |
| 0.8 | 28 | 34 | 38 |
| 0.9 | 26 | 30 | 34 |
| 1.0 | 24 | 28 | 32 |

At 10 ppm the trays rise from 27 to 63 as E falls from 1.0 to 0.4, about as
one over the efficiency.  The page runs the 33 heights of ONE efficiency per
press of its button and keeps each finished sweep.

**What was measured before choosing these numbers.**  The first trace
attempts (D = 50 kmol/h, R = 3, feed in the middle) did NOT converge in 200,
3000 or 5000 outer iterations: with D equal to the benzene fed, both products
go pure, and with the feed in the middle of a tall column the stripping
section pinches and Wang-Henke oscillates (max|dx| 0.3 at pass 5000).  D = 45
with the feed near the bottom converges in 40 to 85 passes at every point.
That is why the page holds the stripping section at ten stages.

### Demonstration 2 -- one tray, three correlations, and the measurement

Witnesses `trayEfficiency01_yanagi14` (AIChE), `trayEfficiency05_chanFair_yanagi14`,
`trayEfficiency06_syedaChuang_yanagi14`: the FRI 14 % sieve tray, cyclohexane /
n-heptane at 34 kPa, total reflux, each running its own `outerDict` sweep of
the F-factor (0.3 to 2.3, 21 points).  Native, each under 0.1 s.  At F_s = 1.5:

| model | E_O | mean E_MV | approach to flood | data include this tray |
|---|---|---|---|---|
| AIChE | 0.7349 | 0.7693 | 0.643 | no |
| Chan & Fair | 0.9012 | 0.9142 | 0.642 | yes |
| Syeda & Chuang | 0.6225 | 0.6639 | 0.645 | yes |

Spread 27.9 points.  Measured (Yanagi & Sakata 1982 as transcribed in
`c329-ratebased-first-delivery.md` section 5, two tabulated runs and five
points read off its Fig. 12): 63.3 to 74.3 % between F_s 1.0 and 2.03, 41 %
near flood.  The measured points were NOT re-read for this page; the test
holds them to that record's table.

### Optional demonstration 3 -- not built

The same separation under two activity models was meant to show the size of
the equilibrium uncertainty beside the efficiency's.  No existing pair of
cases differs only in the activity model on a column; benzene/toluene, the
one column that runs at a declared efficiency, is near-ideal, so swapping the
model would show nothing worth a demonstration.  Left out; the page carries the
point only as (R), from Taylor et al. (2010).

## 4. The heuristics on the page, each with its origin

| situation | use | origin |
|---|---|---|
| binary or near-ideal, per-cent specification, trays between weeping and flood | equilibrium stages with one efficiency | E: demonstrations 1 (bulk) and 2 |
| trace (ppm) specification over many trays | equilibrium stages only with the efficiency known to a few points; otherwise a margin in trays | E: demonstration 1 (trace); R: Taylor, Wilkinson & Kooijman 2010 (0.08 ppm predicted, 15 ppm in the plant) |
| multicomponent, components transferring at very different rates | rate-based, or efficiencies by component and stage; with three or more components the component efficiencies are almost always unequal and can exceed one or fall below zero | R: Taylor et al. 2010 (20-60 % and 40-60 % along one column); Jakobsson et al. 2002; Krishnamurthy & Taylor 1985 (pp. 449-450, rows K5, K6); Taylor & Krishna 2000 (section 3.7, p. 5205, row R3) -- the last two read by the coordinating session |
| azeotropic, three or more components, near a distillation boundary | rate-based with multicomponent diffusion; there the equilibrium-stage model predicted the wrong PRODUCT, not a wrong percentage | R: Springer, van der Molen & Krishna 2002; Pelkonen, Górak, Ohligschläger & Kaesemann 2001 (read by the coordinating session, see section 6) |
| reactive absorption or desorption (sour gas) | rate-based with the reactions | R: Thiele et al. 2006 |
| reactive column (reaction and separation in one column) | equilibrium stages for preliminary design; rate-based for final design and control, and for the dynamics | R: Taylor & Krishna 2000, section 7, p. 5220 (rows R30, R31), read by the coordinating session |
| any column, first | check the VLE model | R: Taylor et al. 2010 (thermodynamic model alone moved H2S by orders of magnitude) |

Costs: one uncertain efficiency (E: demonstration 2); mass-transfer
coefficients and interfacial area from correlations often fitted on binary,
small-scale data; on one column the rate-based model gave 5 ppm with valve trays
and the AIChE coefficients and 12 ppm with sieve trays and the Chan and Fair
coefficients (Taylor's Table 2 changes the tray type too, so this is not a
comparison of two correlations alone)
(R: Jakobsson 2002, Taylor 2010); what a rate-based model needs -- design data
for the hardware, hydrodynamic and mass-transfer parameters, diffusion
coefficients, viscosity, surface tension -- and that for reactive columns those
parameters are badly lacking (R: Taylor & Krishna 2000, pp. 5209 and 5220, rows
R11, R33); the tray flow model alone moving the overall transfer rate by up to
about 20 %, plug flow against fully mixed (R: Taylor & Kooijman 2014, pp.
126-127, row C5); in reactive tray-column comparisons, close agreement of an
equilibrium model with an efficiency only when the tray efficiency could be
predicted correctly (R: Taylor & Krishna 2000, section 5.3, p. 5210, row R16;
placed in the COSTS panel, not in the first row, because it is about reactive
columns; read by the reading general and not re-checked by the coordinator);
the size of the problem as Krishnamurthy & Taylor count it for their own
formulation -- 70 against 160 equations for ten stages and three components,
550 against no fewer than 1 300 for fifty stages and five, 2c+1 against 5c+1
variables per stage, a considerable difference but a minor drawback (R: 1985,
pp. 453-454, rows K13, K17; no ratio is stated, by them or by the page); on
the two strippers no significant penalty in speed, convergence or property
availability (R: Taylor 2010) -- stated on the page as the counterweight it
is.  The rows from Krishnamurthy & Taylor, Taylor & Krishna and Taylor &
Kooijman were read by the coordinating session and not opened for this page (section 6).

## 5. Candidates dropped for lack of a source

From the coordinator's summary, each tried and not backed by anything read.
Updated in the third round from section 7 of the coordinating session's
reading note (`docs/reviews/2026-11-13-c388-three-papers-read.md`), which
searched the three further papers for exactly these:

* **"about five times the unknowns per stage"** for a rate-based model: no
  source states it.  REPLACED by the only numbers any source gives, the
  equation counts of Krishnamurthy & Taylor (1985) for their own formulation
  (section 4, costs); the page states no ratio, since the authors state none.
* **Trace or ppm specifications as a trigger for a rate-based model**: still
  without a source after the three papers (none mentions trace components,
  ppm or high purity as a trigger).  It stays on the page as an ENGINE
  demonstration only: the page's own finding, not a published heuristic.
* **A table of when to use which model**: none of the papers read has one;
  the decision table is this page's assembly of separately sourced rows.
* **A cost ratio or timing of the two models**: none (one review calls the
  computational cost largely moot, qualitatively; not used).
* **"for close-boiling near-ideal separations the uncertainty of the VLE and
  of the efficiency usually dominates"**: nothing read says "usually".  What
  survives is the engine statement (row 1) and Taylor's single-case sentence
  on the thermodynamic model (row 6).
* **"reactive absorption is where equilibrium stages fail MOST"**: the
  superlative is not in Thiele et al.; the row says it failed, on one pilot.
* **"strongly non-ideal multicomponent systems"** in general: only the
  azeotropic case near a boundary is backed (Springer et al.).
* **"equilibrium stages with an efficiency or an HETP are the common
  industrial practice"**: kept in the weaker form the sources use ("often
  used", Jakobsson et al.; most programs offer component efficiencies or a
  rate-based approach, Springer et al.); nothing read says "common industrial
  practice", and HETP is not mentioned in the backed sentence.

## 6. Sources

Read for this page (each in its own scratch directory, with `pdftotext`):

* Taylor, Wilkinson, Kooijman, Distillation Absorption 2010, pp. 401-406 --
  open proceedings, read in full.
* Springer, van der Molen, Krishna, Distillation & Absorption 2002, paper
  3.2-1 -- open proceedings.
* Jakobsson, Aittamaa, Keskinen, Ilme, Distillation & Absorption 2002,
  paper 3.2-4 -- open proceedings.
* Thiele, Faber, Repke, Thielert, Wozny, Distillation and Absorption 2006,
  IChemE Symp. Ser. 152, pp. 469-480 -- open proceedings.
* Yanagi & Sakata 1982 and Murphree 1925 -- verified on Crossref only.

Read by the project's COORDINATING SESSION on 2026-11-13 on its page images,
NOT opened by this page's author (second round of the slice):

* Pelkonen, Górak, Ohligschläger, Kaesemann, Chem. Eng. Process. 40 (2001)
  235-243, doi 10.1016/S0255-2701(00)00117-3 (bibliographic data confirmed on
  Crossref by both).  Section 5 and Fig. 5 (pp. 241-242), experiment AMIW3 of
  its Table 5: acetone, methanol, 2-propanol and water at total reflux and
  atmospheric pressure on 3 m of structured packing in a 100 mm column, the
  composition at the 2 m distributor fixed; the nonequilibrium-stage model
  agrees with the experiment (the reboiler fills with water), the
  equilibrium-stage model and an equal-diffusivity model predict 2-propanol;
  the paper attributes it to diffusional interactions near the distillation
  boundary of the 2-propanol + water azeotrope.  It is the fifth reference
  card and the second origin of the azeotrope row; the page paraphrases it and
  quotes nothing, since nobody on this page's side can hold a quote to it.
  The same session read the figures of a companion paper (Pelkonen,
  Kaesemann, Górak, Ind. Eng. Chem. Res. 36 (1997) 5392-5398, doi
  10.1021/ie970333d), which add that near the boundary the answer also
  depends on the vapour-liquid equilibrium parameter set; that paper is NOT
  cited on the page.

Read by the project's COORDINATING SESSION on 2026-11-13 from the files' text
layer (a reading general, with named rows re-checked by the coordinator), NOT
opened by this page's author (third round); the reading note with every row,
section and page is `docs/reviews/2026-11-13-c388-three-papers-read.md`:

* Krishnamurthy & Taylor, AIChE J. 31 (1985) 449-456, doi
  10.1002/aic.690310312 (Crossref's; not printed on the pages).  Rows K5, K6,
  K13, K17.  Re-checked by the coordinator: the equation counts and the
  minor-drawback remark (p. 454), unequal and unbounded efficiencies (p. 450).
* Taylor & Krishna, Chem. Eng. Sci. 55 (2000) 5183-5229, doi
  10.1016/S0009-2509(00)00120-2.  Rows R3, R11, R16, R30, R31, R33.
  Re-checked: pp. 5205 and 5220.  NOT re-checked: R11 (p. 5209) and R16
  (p. 5210).
* Taylor & Kooijman, in Distillation: Fundamentals and Principles (2014),
  pp. 97-143, doi 10.1016/B978-0-12-386547-2.00003-X.  Row C5, re-checked.

All three DOIs confirmed on Crossref by this page's author too.  The page
paraphrases every row, quotes none, keeps the authors' hedges, and marks each
place it uses one of these papers as read by the coordinating session; neither
the page nor the EduTools Guide points into `docs/reviews/`.

**Not readable, and what it would add.**  Taylor, Krishna & Kooijman, "Real-
world modeling of distillation", Chem. Eng. Prog., July 2003, pp. 28-39 (the
University of Amsterdam repository record lists volume 98; the issue is July
2003): the repository carries metadata only, the author's mirror returned 401,
and the AIChE page serves the issue's editorial.  It is the review usually
cited for these recommendations, and reading it could add rows (packed
columns and HETP, the computational cost, more industrial cases).  The page
says the list is incomplete for that reason.  The owner may supply it.

Affiliations and the program the 2010 paper used are not named on the page
(house rule).

## 7. Phase 2

* When the general-reflux rate-based mode is built (design record
  [`c329-ratebased-at-general-reflux.md`](c329-ratebased-at-general-reflux.md),
  now on main; the page tells students only that the mode is planned and not
  built), demonstration 1 can
  run the SAME column rate-based beside the efficiency model.
* Component efficiencies that differ (a multicomponent tray efficiency) would
  let the engine show row 3 instead of quoting it.
* The unread 2003 review.
* An HETP demonstration on the packed witnesses (`packing01`..`04`).

No rejected alternative of design weight is stated, beyond the dropped
candidates of section 5 and the non-converging first trace column of
section 3.
