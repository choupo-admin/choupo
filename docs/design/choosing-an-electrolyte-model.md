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
  with the engine's A_phi = 0.3915 (the published value is printed as 0.392) (src/thermo/electrolyte/PitzerForm.H:88);
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
| NaCl (23) | 0.07 % (+0.48 at 6) | 1.46 % (-3.64 at 6), not regressed to this table (but fitted by Chen et al. 1982 to Robinson-Stokes NaCl data) | 19.21 % (+52.2 at 2) | identical to free (HClaq only, in traces) |
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
  (Review 2026-11-12, origin/main 4a3d79cca: CONFIRMED, src/propertyOps/Speciate.cpp:365 reads
  `dict->subDict("output")->lookupWord("file")` unconditionally and writes the CSV before the
  diagnostics at :376.)
* (Review 2026-11-12: finding 1 CONFIRMED, src/thermo/FitGrade.H:126-129 appends the fixed phrase "with nothing held out" to every record that carries a `fitGradeCap`, without reading the record's `heldOut` block; ElectrolyteFit.H:70-74 says the interleaved rows "cannot contradict" the fit, so the intent is "nothing that could contradict it", and the sentence drops that qualifier.)
* The review's EL-01 (single-salt eNRTL off 25 C) stands; the page works at 25 C only and says
  so in its limits.

## 7. Checked against the source (review of 2026-11-12, branch review/electrolyte-models)

Each row was held to the printed work in ~/Choupo-Literature (equation, table and page given), to the
page text and to the engine.  Verdicts: **matches**, **differs** (how), **not found in hand**.  Works
NOT in hand: Pitzer (1973) part I, Davies (1962) and (1938), Debye and Hückel (1923), Lewis and Randall
(1921), Appelo (2015), Harvie, Møller and Weare (1984), Pitzer and Mayorga (1974, 2-2 salts); a row that
rests on one of them was checked against a work in hand that prints the equation and is marked
"original not read".  L = gui/src/ui/methods/electrolyteModelsLesson.ts, C = gui/src/case/electrolyteModels.ts.
Works used: PM = Pitzer and Mayorga, J. Phys. Chem. 77 (1973) 2300; PK = Pitzer and Kim, JACS 96 (1974) 5701;
KF = Kim and Frederick, JCED 33 (1988) 177; CBBE = Chen, Britt, Boston and Evans, AIChE J. 28 (1982) 588;
CE = Chen and Evans, AIChE J. 32 (1986) 444; HW = Hamer and Wu, JPCRD 1 (1972) 1047; PB = Plummer and
Busenberg, GCA 46 (1982) 1011; Ar = Archer, JPCRD 21 (1992) 793; Wa = Wankat, Separation Process
Engineering 2nd ed.

| # | what | verdict | evidence |
|---|---|---|---|
| 1 | ionic strength I = 1/2 sum m_i z_i^2 | matches (original not read) | PM p. 2301 prints "I is the ionic strength, 1/2 sum m_i z_i^2"; HW ref [19] cites Lewis and Randall JACS 43, 1112 (1921) |
| 2 | single-ion limit ln gamma_i = -3 A_phi z_i^2 sqrt(I) | matches (original not read) | PK eq 3 (z_i^2 times the DH function) with f^gamma of PM eq 6, whose I -> 0 limit is -3 A_phi sqrt(I); HW and PK cite Debye and Hückel, Physik. Z. 24, 185 (1923) |
| 3 | mean coefficient and the two limits (ln gamma_pm, phi) | matches | mean: PM eq 3 and PK eq 4; phi - 1 = abs(z+ z-) f^phi, f^phi = -A_phi sqrt(I)/(1 + b sqrt(I)) (PM eqs 2, 5): limit phi = 1 - A_phi abs(z+ z-) sqrt(I) |
| 4 | A_phi = 0.3915 at 25 C | matches to the printed precision | PM p. 2301, PK p. 5702, KF p. 177 print 0.392 (a rounding of 0.3915); CBBE eq 29 evaluates to 0.3909 at 298.15 K.  Base is natural log (the slope of phi, and 3 A_phi for ln gamma) |
| 5 | 3 A_phi/ln 10 = 0.510; Davies A = 0.51 | matches | arithmetic 3 x 0.3915/2.302585 = 0.51008; AqueousActivity.cpp:131 uses 0.51; PB eq 17 uses log10 and a symbol A (value not read in the extract) |
| 6 | Davies log10 gamma_i = -A z_i^2 (sqrt(I)/(1+sqrt(I)) - 0.3 I) | equation matches PB eq 17 (p. 1017: 0.3 I, log10); attribution differs; original not read | PB print 0.3 I and cite Davies (1962), not 1938 as the page does; what the 1938 paper prints is not found in hand; the engine uses 0.3 (AqueousActivity.cpp:142).  The page now cites PB and says the 1938 paper was not read |
| 7 | Davies gives a neutral species gamma = 1 | matches the engine | AqueousActivity.cpp:140; no source in hand states it for Davies |
| 8 | Davies' stated band, "I about 0.5" | **not found in hand** | no work in hand states a band for Davies (PB only says Debye-Hückel proper is reliable to I <= 0.01).  The page no longer attributes a band to "its author" |
| 9 | Pitzer single-salt ln gamma_pm | matches | PM eq 3 |
| 10 | f^gamma, B^gamma, C^gamma = 3/2 C^phi | matches, with an omission corrected | PM eqs 6, 9, 11 exactly.  The omission: eq 9 with beta(2) (PK eq 10) was missing from the page, while the CaCl2 and MgSO4 records use it (see 12).  Note KF eq 9 defines C^phi = C_MX/(2 abs(zM zX)^1/2), a different convention from PM's tabulated C^phi |
| 11 | b = 1.2 | matches | PM p. 2301, PK p. 5702, KF p. 177 |
| 12 | alpha = 2.0 for salts with a univalent ion; 2-2 adds beta(2) | differs (incomplete) | alpha = 2.0 for "all solutes considered" (one or both ions univalent), PM p. 2301; for 2-2 salts alpha_1 = 1.4 AND alpha_2 = 12.0 with beta(2) (PK p. 5702, KF p. 177): the page omitted alpha_1 = 1.4.  Also the catalogue's CaCl2 record (2-1) carries beta(2) = -1.13, which PM Table VI does not (it has beta0 0.3159, beta1 1.614, C -0.00034 for CaCl2): with beta(2) = 0 the Pitzer mean deviation on the CaCl2 table is 1.37 %, with it 0.69 % |
| 13 | eNRTL equations; non-randomness 0.2; closest approach 14.9; molal conversion | matches | alpha = 0.2: CBBE p. 590 after eq 7, CE p. 448; rho = 14.9: CBBE p. 593, CE notation; ln gamma(m) = ln gamma(x) - ln(1 + M_s (nu_c + nu_a) m/1000), M_s in g/mol, CBBE p. 593 (page: M_w in kg/mol, same); unsymmetric reference state; two adjustable energies tau_ca,m and tau_m,ca |
| 14 | eNRTL tau(T) = tau(25 C) 298.15/T | engine behaviour, differs from the published form | CE eq 45: tau = a + b(1/T - 1/theta) + c[(theta - T)/T + ln(T/theta)] with fitted b, c; the page said "engine behaviour" and now also says it is not CE's form |
| 15 | ln a_w = -nu m M_w phi, M_w 0.018015 | matches | Ar (the paragraph on the osmotic coefficient; page not noted): "phi = -ln a_w (M_1 nu m)^-1, M_1 the molar mass of the solvent"; PitzerSingleSalt.H:244 |
| 16 | Pi = -(R T/V_w) ln a_w | matches (assumes ideal vapour) | Wa eq 16-14: Pi v_solvent = RT ln(VP_solvent/VP_solution) for an incompressible liquid, v the partial molar volume; the page uses the pure-water molar volume and says so (limit "osmotic"); R, V_w as before |
| 17 | Davies water activity is ideal (phi = 1) | matches the engine | SpeciationSolver.cpp:1569 comment, and the run (Davies Pi equals the ideal value) |
| 18 | measured NaCl and KCl tables | matches | every row (23 NaCl, 20 KCl) equals HW Table 16 (p. 1067) and Table 28 (p. 1073) printed values |
| 19 | measured CaCl2 table | matches | all 14 rows equal Goldberg and Nuttall Table 20 (p. 291), read from the page image |
| 20 | measured Na2SO4 table | matches | all 13 rows equal Goldberg (1981) p. 695 (the table ends the 25 C rows at 1.957 m, saturation; the tree stops at 1.75) |
| 21 | Pitzer pair parameters (Appelo 2015) | not found in hand; differ from PM and KF | NaCl PM 0.0765/0.2664/0.00127, KF 0.07722/0.25183/0.00106, record 0.07534/0.2769/0.00148; KCl PM 0.04835/0.2122/-0.00084, record 0.04808/0.2168/-0.000788; Na2SO4 PM (from Table VI) 0.0196/1.113/0.00497, record 0.0273/0.956/0.003418; MgSO4 KF 0.22438/3.3067/-40.493 (beta2)/0.02512, record 0.2135/3.367/-32.45/0.02875 (alpha_1 1.4 both).  All are fits to the same kind of data |
| 22 | eNRTL water-NaCl parameters "Chen and Evans (1986)" | differs | 8.885 and -4.549 are CBBE (1982) Table 1 (p. 592, sigma 0.018, to 6 m, fitted to mean activity coefficients of Robinson and Stokes); CE (1986) Table 1 (p. 448, osmotic coefficients) has tau_ca,m -4.5916, tau_m,ca 9.0234.  The record's source line (data/standards/parameters/eNRTL/Na-Cl.dat) is mis-attributed; the page's reference note now says so |
| 23 | edwardsPitzer carries molecule-ion terms | matches | Edwards, Maurer, Newman, Prausnitz (1978) p. 969: "molecule-ion (salting out) and ion-ion interaction" parameters, activity coefficients "by Pitzer's equation" |
| 24 | theta and psi mixing terms; HMW assembly | mixing terms match; assembly not found in hand | PK eqs 8, 9, 11 define theta_MN, psi_MNX; HMW (1984) not in hand (Felmy and Weare 1986 cites it) |
| 25 | "Debye and Hückel worked out the limit in 1923" | not found in hand (citation only) | HW ref [2], PK ref 3 cite Physik. Z. 24, 185 (1923); the paper itself is not in hand |

Verdict count: matches 17 (rows 1, 2, 3, 4, 5, 7, 9, 10, 11, 13, 15, 16, 17, 18, 19, 20, 23; rows 1, 2, 5, 6
rest on an original not read), differs 4 (6 in its attribution only, 12, 14, 22), not found in hand 3 (8, 21,
25), mixed 1 (24).

Numbers the page shows, recomputed by hand: NaCl Davies at I = 0.5: log10 gamma = -0.51 (0.70711/1.70711 -
0.15) = -0.13475, gamma = 0.7332, +7.67 % on 0.681.  Osmotic pressure of 1 mol/kg NaCl: phi = 0.936
(HW), ln a_w = -2 x 1 x 0.018015 x 0.936 = -0.033724, Pi = 8.314462618 x 298.15/1.807e-5 x 0.033724 =
46.265 bar; ideal phi = 1: 49.428 bar.  Na2SO4 at I = 0.3: Davies free ions log10 gamma_pm = -2 x 0.51 x
0.26389 = -0.26917, gamma 0.5381, +20.72 % on 0.4457; with NaSO4- (log K 0.94, the catalogue's) solved by
hand: -2.71 %.  Pitzer deviations of section 4 reproduce from the record parameters and PM eqs 3, 6, 9, 11
(NaCl 0.07 %, KCl 0.13 %, CaCl2 0.69 %, Na2SO4 0.87 %).
