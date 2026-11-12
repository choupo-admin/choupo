# Choosing an electrolyte activity model -- an EduTool on the engine's three models

Status: the EduTool `electrolyte-models` is built (gui/src/ui/methods/ElectrolyteModelsTool.tsx,
the lesson in gui/src/ui/methods/electrolyteModelsLesson.ts, the tree files it reads in
gui/src/ui/methods/electrolyteModelsData.ts, the cases, readers and arithmetic in
gui/src/case/electrolyteModels.ts, tests in gui/tests/electrolyteModels.test.ts).  No engine,
data or case file was changed.  Scope approved by the owner (relayed by the coordinator,
2026-11-12); the review that measured the models the same day is
docs/reviews/2026-11-12-electrolyte-models/.

## 1. What the page is for

The task, in one sentence: *I have a solution with salts; which activity model should I
declare, and what do I lose with the others?*  Six steps: the Debye-Hückel limit every model
shares, drawn alone against measurement; what Davies, Pitzer and eNRTL add to it (one
equation each, every symbol glossed, each equation the one the engine runs, cited by
file and line); the same salt under each model against a measured table; the difference
as a design number (the osmotic pressure a membrane must overcome); the choice as four
questions; and the engine's refusal of a pair the catalogue lacks.  Shelf "Property data &
parameters", beside `salt-mixing`; kind `selection` (it helps choose between defensible
alternatives); Theory Guide anchor `ch:electrolytes`, whose subject is the osmotic pressure
and Pitzer's phi.

## 2. What the page asks the engine

Four props cases per salt and two for step 6, each written in the browser and run with
choupoProps (`useCaseFilesRun`), side by side (each run has its own worker):

* **Pitzer** and **eNRTL**: the package a process unit declares --
  `formulation electrolyteGammaPhi; aqueous { activityModel { model Pitzer|eNRTL; } }`, the
  salt as the second component -- and one `electrolyteActivity` operation per molality, each
  with `molality { from m; to m; n 2; }`, which writes a CSV `m,gamma_pm,phi,a_w`
  (src/propertyOps/ElectrolytePackageActivity.cpp).  The op's diagnostics carry only fixed
  1 and 3 mol/kg values, so the page reads the CSV, which the worker returns in `csvFiles`.
* **Davies, free ions**: one `speciate` operation per molality, `activityModel davies`,
  `pH 7.0`, `networkScope restricted; network ( water-dissociation )` (with the `reason` the
  op requires), `diagMeanIonic` for the salt's pair: `gamma_pm_<c>_<a>` and `aw` are read
  from the diagnostics.  `output { file }` is mandatory for `speciate`.
* **Davies with the catalogue's ion pairs**: the same without the restriction.  The
  diagnostic `gamma_pm` is then the FREE ions' mean, so the page computes the
  stoichiometric mean from the activities the engine wrote in the species CSV.
* **Step 6**: MgSO4 under Pitzer (answers) and under eNRTL (the run stops with
  `eNRTL: no parameters for (Mg, SO4) in constant/electrolyte/enrtl.dat (case) or
  standards/parameters/eNRTL/Mg-SO4.dat`, shown verbatim).

Every model is asked at every molality of the measured table (merged with a geometric grid
from 0.001 mol/kg for the curves), so no deviation is interpolated.  Davies is asked only up
to I = 2 mol/kg.  Every operation and CSV name carries a tag `<salt>_<model>`: a run that
finishes after the student picked another salt is not read for the new one (tested).

Cost, measured natively on this tree: Pitzer and eNRTL runs 12-22 ms each (37-46
operations); each Davies run 2.5-4.3 s (26-36 `speciate` operations, about 0.1 s each, most of
it per-operation setup).  The browser's WebAssembly build was NOT measured (no emscripten in
this container).

## 3. What the page computes

All closed form, printed with its constants on the page:

* the Debye-Hückel limit, ln gamma_pm = -3 A_phi |z+ z-| sqrt(I), phi = 1 - A_phi |z+ z-| sqrt(I),
  with the engine's A_phi = 0.3915 (src/thermo/electrolyte/PitzerForm.H:88);
* Davies' phi = -ln a_w / (M_w nu m) from the engine's a_w, M_w = 0.018015 kg/mol;
* the stoichiometric mean with ion pairs, ((a+^nu+ a-^nu-)/((nu+ m)^nu+ (nu- m)^nu-))^(1/nu);
* the measured a_w from the table's phi, ln a_w = -nu m M_w phi;
* the osmotic pressure, Pi = -(R T / V_w) ln a_w, R = 8.314462618, T = 298.15 K, V_w the
  engine's 1.807e-5 m3/mol at 25 C (src/thermo/electrolyte/SolventProperties.H:78);
* deviations, delta = 100 (model - measured)/measured, at the measured rows.

The measured tables are not copied: the page reads
data/curation/electrolytes/{Na-Cl,K-Cl,Ca-Cl,Na-SO4}/constant/experiments/*.dat through
`import.meta.glob`, the files the catalogue's eNRTL records were regressed against.  Whether a
model was regressed to the table on screen is read from each record's `fittedInCase` (equal to
the table's curation case: in-sample, every fourth row held out by
`heldOut { every 4; offset 3; }`) or its `source` line (naming the table's first author: a
refit, every row counted in-sample).

## 4. What the engine answered (native run of this tree, 25 C)

Mean |delta| of gamma_pm over the table's rows (worst signed delta, at m mol/kg):

| salt (rows) | Pitzer | eNRTL | Davies, free ions (I <= 2) | Davies + ion pairs |
|---|---|---|---|---|
| NaCl (23) | 0.07 % (+0.48 at 6) | 1.46 % (-3.64 at 6), not fitted to it | 19.21 % (+52.2 at 2) | identical to free (HClaq only, in traces) |
| KCl (20) | 0.13 % (+0.31 at 3) | 0.29 % (-0.64 at 4.5), IN-SAMPLE (refit to Hamer & Wu) | 29.44 % (+77.5 at 2) | identical |
| CaCl2 (14) | 0.69 % (+2.17 at 2) | 2.34 % (-4.59 at 0.2), IN-SAMPLE; held-out rows 2.04 % | 48.62 % (+106 at 0.6) | identical (CaOH, HClaq in traces) |
| Na2SO4 (13) | 0.87 % (-1.36 at 0.9) | 0.20 % (+0.79 at 0.1), IN-SAMPLE; held-out rows 0.12 % | 125.93 % (+269 at 0.6) | 9.81 % (+19.5 at 0.6); NaSO4-, Na2SO4aq, HSO4 |

Davies near I = 0.1 and 0.5 (the row nearest each): NaCl +0.28 % and +7.67 %; KCl +1.72 % and
+12.98 %; CaCl2 +4.05 % (I = 0.3) and +16.69 % (I = 0.6); Na2SO4 +20.72 % (I = 0.3) and
+49.75 % (I = 0.6), and with the ion pair -2.71 % and +2.32 % at those rows, +7.15 % at I = 0.9,
+19.47 % at I = 1.8.

Osmotic pressure, bar (measured from the table's phi / ideal phi = 1 / Pitzer / eNRTL /
Davies free ions):

| salt, m | measured | ideal | Pitzer | eNRTL | Davies |
|---|---|---|---|---|---|
| NaCl, 0.5 | 22.76 | 24.71 | 22.78 | 22.63 | 24.71 |
| NaCl, 1 | 46.26 | 49.43 | 46.28 | 46.28 | 49.43 |
| NaCl, 6 | 376.64 | 296.57 | 377.91 | 364.47 | not run |
| KCl, 2 | 90.16 | 98.86 | 90.29 | 90.49 | 98.86 |
| CaCl2, 2 | 203.95 | 148.28 | 205.92 | 199.18 | not run |
| Na2SO4, 0.5 | 25.75 | 37.07 | 25.45 | 25.58 | 37.07 (28.83 with pairs) |

Davies' water is ideal on the species it carries (SpeciationSolver.cpp:1569, `phi = 1`), so
on a salt without an ion pair its osmotic pressure IS van 't Hoff's, to the digit.

MgSO4: Pitzer gamma_pm 0.1690, 0.0772, 0.0554 at 0.1, 0.5, 1 mol/kg (no table in the tree to
compare with); eNRTL refused, as quoted in section 2.

These agree with the review's item 3 tables (Pitzer NaCl/KCl 0.06-0.19 %, eNRTL NaCl 1.4 %,
Davies +0.3 % at I = 0.1 and +8 to +13 % at I = 0.5 for 1-1 salts, Na2SO4 within 3 % with the
ion pair at low I).

## 5. Checks

* gui/tests/electrolyteModels.test.ts: the limit, a_w from phi and Pi against hand values
  (NaCl 1 mol/kg, phi 0.936: Pi = 46.2648 bar); every measured row the page draws equals an
  independent reading of the tree file; every measured molality is among those the engine is
  asked; the held-out rule equals ElectrolyteFit.H's; the in-sample verdicts per salt; the
  case files (exact model words, restricted vs full network); the readers on the engine's
  CSV and diagnostic shapes; the stale-answer race (another salt's, another model's, another
  molality's answer is not read); the stoichiometric mean from activities; the choice's
  branches; every cited source line still says what it is cited for; the page renders.
* tests/methodOrigins, methodTheoryAnchors, lessonTex; gates check_lesson_symbols,
  check_lesson_references, check_method_tools, check_edutool_form, check_doctrine,
  check_guide_pdf_fresh, check_feature_documented.
* In a browser (Chromium, Playwright) at 390 and 1440 px for NaCl, KCl, CaCl2 and Na2SO4,
  with the engine calls served by this tree's NATIVE choupoProps through a stub worker (no
  WebAssembly build here): zero horizontal overflow of the document, no control past the
  right edge.  The WebAssembly path itself is not validated.

## 6. Findings met on the way (reported, not fixed)

* The eNRTL Na-SO4 record says "10 points fitted, 3 interleaved points held out" in its
  header, while the engine's `[fit-grade]` announcement for it says the
  grade was capped because the record "rests on ONE stated temperature and ONE laboratory with
  nothing held out".  Both can be true (held-out rows of the same source are not independent
  evidence), but "nothing held out" reads as a contradiction of the header.
* The `speciate` op refuses without an `output { file }` block even when only its
  diagnostics are wanted.
* The review's EL-01 (single-salt eNRTL off 25 C) stands; the page works at 25 C only and says
  so in its limits.

## 7. To check against the source

One row per equation, constant or number the page states from a published work.  "Checked
against <tree file>" means the page's statement was held to that line of the tree (the
engine's implementation, or the tree's transcription of a table) -- NOT to the paper.  No
row was checked against a paper: no paper was read for this page.  The DOIs were resolved on
Crossref on 2026-11-12 (authors, title, journal, volume, pages, year matched); Debye and
Hückel (1923) has no DOI and was not verified.  File paths below: L = gui/src/ui/methods/
electrolyteModelsLesson.ts, T = gui/src/ui/methods/ElectrolyteModelsTool.tsx,
C = gui/src/case/electrolyteModels.ts.

| what | published work | where on the page | status |
|---|---|---|---|
| ionic strength I = 1/2 sum m_i z_i^2 | Lewis and Randall (1921), as remembered; no DOI cited on the page | L step 1 derivation; C `ionicStrength` | unchecked against the paper (standard definition) |
| single-ion limit ln gamma_i = -3 A_phi z_i^2 sqrt(I) | Debye and Hückel, Phys. Z. 24 (1923) 185, as remembered (no DOI) | L step 1 derivation | checked against src/thermo/electrolyte/PitzerForm.H:98-103 (the I -> 0 limit of fGamma is -3 A sqrt(I)); unchecked against the paper |
| mean coefficient ln gamma_pm = (nu+ ln gamma+ + nu- ln gamma-)/nu and the limit ln gamma_pm = -3 A_phi abs(z+ z-) sqrt(I), phi = 1 - A_phi abs(z+ z-) sqrt(I) | Debye and Hückel (1923), as remembered | L step 1 formula; C `debyeHuckelLimit`; T step-1 plot | averaging checked against src/thermo/electrolyte/ENRTLSingleSalt.H:154; the phi limit checked against PitzerForm.H fPhi (lines 106-111) at I -> 0; unchecked against the paper |
| A_phi = 0.3915 (kg/mol)^1/2 at 25 C | engine constant; the published value (e.g. Pitzer 1973) not compared | L step 1 gloss; C `A_PHI_25` | checked against src/thermo/electrolyte/PitzerForm.H:88; unchecked against any paper |
| 3 A_phi / ln 10 = 0.510, Davies' A = 0.51 | Davies (1938), doi:10.1039/JR9380002093 | L step 1 gloss, step 2 | A = 0.51 checked against src/thermo/electrolyte/AqueousActivity.cpp:131; the arithmetic is the page's; unchecked against the paper |
| Davies: log10 gamma_i = -A z_i^2 (sqrt(I)/(1+sqrt(I)) - 0.3 I) | Davies (1938), doi:10.1039/JR9380002093 | L step 2 derivation | checked against src/thermo/electrolyte/AqueousActivity.cpp:142; unchecked against the paper |
| Davies gives a neutral species gamma = 1 | engine behaviour | C `chooseModel` (acid-gas branch) | checked against src/thermo/electrolyte/AqueousActivity.cpp:140 |
| Davies' stated band, "I about 0.5" ("four times the band its author stated" = I 2) | Davies (1938), as remembered via the engine's own banner | L limit "davies-range" | unchecked against the paper |
| Pitzer single-salt ln gamma_pm = abs(z+ z-) f + m (2 nu+ nu-/nu) B + m^2 (2 (nu+ nu-)^3/2 / nu) C | Pitzer (1973), doi:10.1021/j100621a026; Pitzer and Mayorga (1973), doi:10.1021/j100638a009 | L step 2 derivation | checked against src/thermo/electrolyte/PitzerSingleSalt.H:183-204; unchecked against the papers |
| f = -A_phi [sqrt(I)/(1+b sqrt(I)) + (2/b) ln(1+b sqrt(I))], B = 2 beta0 + (2 beta1/(alpha^2 I))[1-(1+alpha sqrt(I)-alpha^2 I/2) e^(-alpha sqrt(I))], C = 3/2 C^phi | Pitzer and Mayorga (1973) | L step 2 derivation | checked against PitzerForm.H:98-103 and 259-262, PitzerSingleSalt.H:199; unchecked against the paper |
| b = 1.2 | Pitzer (1973) | L step 2 gloss | checked against PitzerForm.H:87; unchecked against the paper |
| alpha = 2.0 for salts with a univalent ion (a 2-2 salt adds beta(2)) | Pitzer and Mayorga (1973); the 2-2 form Pitzer and Mayorga 1974, not cited | L step 2 gloss and derivation text | alpha checked against src/thermo/electrolyte/PitzerSingleSalt.H:144; beta(2) for 2-2 unchecked |
| eNRTL: ln gamma_pm^x = [nu+ (PDH + lc) + nu- (PDH + lc)]/nu, gamma_pm = gamma_pm^x/(1 + nu m M_w), non-randomness 0.2 | Chen and Evans (1986), doi:10.1002/aic.690320311 | L step 2 derivation | checked against src/thermo/electrolyte/ENRTLSingleSalt.H:90, 154, 76; unchecked against the paper |
| eNRTL temperature scaling tau(T) = tau(25 C) 298.15/T | engine behaviour (not a published claim) | L limit "25C" | checked against ENRTLSingleSalt.H:84 |
| ln a_w = -nu m M_w phi, M_w = 0.018015 kg/mol | definition of the molal osmotic coefficient, as remembered | L step 3 formula; C `awFromPhi` | checked against src/thermo/electrolyte/PitzerSingleSalt.H:244 and :150 |
| Pi = -(R T / V_w) ln a_w (incompressible water, pure-water molar volume) | textbook thermodynamics, no work cited on the page | L step 4; C `osmoticPressureBar` | unchecked against a published source; V_w = 1.807e-5 m3/mol checked against src/thermo/electrolyte/SolventProperties.H:78; R checked against src/core/Constants.H:47 |
| Davies' water activity is the ideal one (phi = 1 on the species carried) | engine behaviour | L step 3 note, limit "davies-range" | checked against src/thermo/electrolyte/SpeciationSolver.cpp:1569 and by the run (Davies' Pi equals van 't Hoff's) |
| the measured gamma_pm and phi of NaCl, KCl (Tables 16, 28) | Hamer and Wu (1972), doi:10.1063/1.3253108 | T step 1 and 3 plots, tables | checked against data/curation/electrolytes/{Na-Cl,K-Cl}/constant/experiments/*.dat (the page reads those files; a test holds every drawn row to them); the files' transcription is the tree's claim, unchecked here |
| the measured CaCl2 table (Table 20) | Goldberg and Nuttall (1978), doi:10.1063/1.555569 | as above | checked against data/curation/electrolytes/Ca-Cl/constant/experiments/Ca-Cl.dat; transcription unchecked here |
| the measured Na2SO4 table | Goldberg (1981), doi:10.1063/1.555646 | as above | checked against data/curation/electrolytes/Na-SO4/constant/experiments/Na-SO4.dat; transcription unchecked here |
| Pitzer pair parameters (all four salts, MgSO4) | Appelo, Appl. Geochem. 55 (2015) 62, as the records say (DOI not verified, not cited on the page) | T step 3 table ("source" column) | the source line is read from the record files at run time; unchecked against the paper |
| eNRTL water-NaCl parameters | Chen and Evans (1986), doi:10.1002/aic.690320311 | T step 3 table | source line read from data/standards/parameters/eNRTL/Na-Cl.dat; values unchecked against the paper |
| edwardsPitzer carries molecule-ion terms for NH3, CO2, H2S | Edwards, Maurer, Newman and Prausnitz (1978), doi:10.1002/aic.690240605 | C `chooseModel` (acid-gas branch) | unchecked against the paper |
| theta and psi mixing terms, the HMW assembly | Harvie, Moller and Weare (1984), doi:10.1016/0016-7037(84)90098-X | C `chooseModel` (several-salts branch) | unchecked against the paper |
| "Debye and Hückel worked out the limit in 1923" | Debye and Hückel (1923), no DOI | L step 1 body | unchecked |
