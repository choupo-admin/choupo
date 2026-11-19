# EduTools review, batch O (seven "how the engine is used" lessons)

Tree: detached main `ff19aaac41` (2026-11-19). Read-only. Every file:line below was opened at that commit.

Registry note: `plantRun` is "What a plant costs to run, and when it pays" (`plant-running-cost`, an economics page, not about running the engine); `dataSources` is "property-data-sources" (where to find property data and its licence). Both were reviewed as what they are.

## caseAssembly (`caseAssemblyLesson.ts`, `caseAssembly.ts`, `CaseAssemblyTool.tsx`)
OK-verified:
- Citations are function-scoped (`Cite`). The order is main.cpp:537 registerBuiltins → :665 flowsheetDict → :666 controlDict → :671 verbosity → :691 verifySeal → :708 thermoPhysPropDict → :777/815/819 solverDict/outerDict/postDict. The file reads them in that order.
- The four breaks are real: Dictionary.cpp:463 "unknown unit suffix", Units.cpp:51 has only `"Pa"`, main.cpp:1330 "MISSING  0/".
- Default reports: main.cpp:1119-1130 adds mass, energy and element balances when they are not declared.
- `problemDivergence` is always written: main.cpp:1209.
- runCase saves `log.$APP`: bin/runCase:308.
- flash01's files match the FILE_ROLES keywords (solverDict declares tolerance and maxIter).

SUSPECT:
- Step 1 note says "Two optional dictionaries appear only when a case uses them: postDict and outerDict". main.cpp also picks up `system/layoutDict` (:847) and `constant/reactions` (:802). A student is told the list is complete when it is not.
- The `constant/propertyManifest` row says the manifest pins benzene and toluene. flash01's manifest also pins `chemistry/aceticAcid-dissolution.dat` (propertyManifest:~27), which the page never explains. A student reading the file will meet an acetic-acid record in a benzene/toluene case with no explanation.

## runLog (`runLogLesson.ts`, `runLog.ts`, `RunLogTool.tsx`)
WRONG:
- Step 4 contradicts itself on flash13's normalised final residual.
  - Derivation step 1 (runLogLesson.ts:139-140) gives it as 4.4550e-16, and the printed reduction 6.1961e-15 = 4.4550e-16 / 7.1901e-2 checks.
  - Derivation step 3 (runLogLesson.ts:150) writes `r̃_final = 1.8432e-13 ≤ τ`.
  - Both cannot be r̃_final. 1.8432e-13 is a stale value. The test pins neither: gui/tests/runLog.test.ts:377-380 says the final residuals are round-off and were 2.9005e-12 until 2026-11-16.
  - Consequence: the student checks the tolerance test against a number that is not the one the run printed.

SUSPECT:
- Step 6 note says "Both blocks are printed even when they have nothing to say". The page's own verbosity table (runLog.ts:1079) and main.cpp:1644 (`if (verbosity >= 1)`) say both blocks are absent at verbosity 0. Read literally, "a missing block can never be read as good news" is false at level 0.

OK-verified:
- The Newton step V1 = 0.30002 is exact algebra.
- The residual sequence 3.8e-2, 7.8e-4, 5.7e-7, 2.9e-13 is quadratic, as the page says.
- runCase prints `tail -14` (bin/runCase:406) and "FAILED … last 20 lines" (:451).
- These lines exist at the cited sources: LOCAL override (Flowsheet.cpp:1132), "[state] seeded" (:2610), "not present (built-in defaults)" (main.cpp:991), "Recycle converged in" (Flowsheet.cpp:3699), "Final pass…" (:3996), floor 1e-20 (Convergence.H:212).
- Inline `thermo{}` is refused (Flowsheet.cpp:650), so the variant-only wording is right.

## plantRun (`plantRunLesson.ts`, `plantRunMath.ts`, `PlantRunTool.tsx`)
OK-verified:
- All 15 ENGINE_FACTS line numbers in EconomicsPass.cpp match exactly: COM_d :1868, C_WT = 0 :1867, 4.5 :3363, 1960 h :1787, straight line :1892/:3003, tax :1954, WC/salvage :1960, break-even :4498, royalty :1577, sensitivity :2754, and the rest.
- Quiz arithmetic is correct: 7920/1960 = 4.04, 6 × 4.04 → 25; 1.03 × 1.06 − 1 = 9.18 %; 10 × 500/400 = 12.5.
- 8760/1960 = 4.47.
- The NPV salvage treatment (WC untaxed, salvage × (1 − t)) matches :1960.
- Buildings from room areas (:1500) and the three working-capital methods are present.
- No competitor is named. The books are cited as pointers only.

## operatorPanels (`operatorPanelsLesson.ts`, `OperatorPanelsTool.tsx`)
OK-verified:
- The edbatch01 panelDict declares 6 elements.
- Write grid: endTime 2000 s, writeInterval 50 s, so 41 instants; crossing at 1593 s, seen at 1600 s.
- `closestApproachFraction = d/(rmax − rmin)` with d = high − max (PanelPass.cpp:769-776).
- `kNeverApproachedFraction = 0.5` (PanelPass.cpp:56).
- The stack is 7 cell pairs (EUR2C-7P18 record: `cellPairs 7`).
- Paid standards are named as standards, not products. No finding.

## dataSources (`dataSourcesLesson.ts`, `DataSourcesTool.tsx`)
OK-verified:
- All 14 CITATIONS and all 14 RECORD_LINES of dimethylCarbonate-methanol.dat match line for line.
- The band U/T̄ = 0.3/341.73 = 0.0878 %, rounded up, gives 0.088.
- The DOIs are 2006 and 2013, so "seven years later" is right.
- The AAD formula matches FitParameters.cpp:1545-1548 (|dT|/T, ×100/N).
- The Tool draws its text from the lesson, so the two cannot drift.

SUSPECT:
- CODATA is classed `no-grant` (dataSourcesLesson.ts:~205). The class table row for no-grant says "copyValues: no: local only" (:~420). But the exercise `burcat-hf` (:~560) tells the student to "take the value from the NASA Glenn report or the CODATA Key Values instead", and the picker row `formation` sends them to CODATA first. Consequence: a student is told both that CODATA values may not enter a record and that they should enter them.
- The picker row `mixture-vle` says "you fit, on one laboratory, and hold out another". Two pages later on the same path, databaseToParameters step 4 says fitting one laboratory and testing another "measured how much laboratories disagree, not the model … none is held out." The two pages give contrary advice with no reconciliation.

## databaseToParameters (`databaseToParametersLesson.ts`, `DatabaseToParametersTool.tsx`, `databaseToParametersFit.ts`)
WRONG:
- **Severe fits.** Step 6 says "severe fits are no longer promoted" and "The 17 severe records promoted before that rule are still in the catalogue". It cites "the refusal to promote" at bin/curate/pairs_c283.py:170.
  - That line now reads `NOT_PROMOTED_GRADES = ("refused",)`. The comment at :164-169 says C333 reversed C300 rule 3: "a `severe` fit STAYS in the catalogue".
  - The design doc it cites (binary-pairs-from-open-measurements.md:1335) itself says rule 3 was "measured, not done".
  - Recount: the commit 42c1dcbde had 17 `fitGrade severe;` records. HEAD has 79; 63 of them were added 2026-11-12 under C333 (`6590338956`).
  - The Tool repeats the claim ("promoted before severe stopped being promoted", DatabaseToParametersTool.tsx:513).
  - Consequence: the student believes a severe grade cannot reach the catalogue. It can, and does.
- **Fixed a and alpha.** Step 1 says "Choupo's curated pairs fix a and alpha and fit only the two b's". The `where` list says a is "fixed at 0" and alpha is "fixed at 0.30". Three catalogue NRTL records contradict this:
  - nButanol-water.dat: alpha 0.44639, a_ij −4.1116, a_ji 4.0596. This is the record the page's own MAP row "lle" cites.
  - ethanol-water.dat: a_ij −0.8009, a_ji 3.4578.
  - 1Propanol-water.dat: alpha 0.40.
  - Consequence: a special case (the C283 pipeline's frame) is taught as the catalogue's rule.

OK-verified:
- All 21 CITATIONS and the 12 acetone-methanol RECORD_LINES match. The record cites 7 DOIs.
- The limits are MIN_INTERIOR = 5 (bin/choupo-curate:111), pmax 110 kPa (pairs_c283.py:379), and OUTLIER_K 3.0 (:75).
- Grades are 1/2/4 K and 5/10/20 %.
- "0 reviewed by a person" still holds. The 70 "humanReviewed true;" hits are all inside comments.
- The counts are dated to their commit on the page (Tool:506).

## correlationSimplicity (`correlationSimplicityLesson.ts`, `correlationSimplicityMath.ts`, `CorrelationSimplicityTool.tsx`)
WRONG:
- Step 14 says that at Pr = 7, Dittus-Boelter "falls steadily behind [Gnielinski] -- 16 % by Re = 1e5, 42 % by 1e7", and that at Pr = 0.7 the two "stay within about 12 %".
  - From the engine's own formulas (Gnielinski.cpp:63-65 with Petukhov f; DittusBoelter.H:63, n = 0.4), the gap relative to Gnielinski is 16.4 % and 41.8 %.
  - The step's own spread s = (ymax − ymin)/ymin, which the Tool plots (CorrelationSimplicityTool.tsx:789-791), gives 19.6 % and 71.7 % at those points. The witness sweep carries Pr = 7 up to Re = 2e7.
  - The 12 % at Pr = 0.7 uses the s basis (11.6 %), so one sentence mixes two denominators.
  - Consequence: the plot under the sentence reads 72 % where the prose says 42 %.

SUSPECT:
- Step 3 calls the μ-u-D group "the friction factor times the Reynolds number -- the Poiseuille number, which is the constant 64". With the 2 dropped, as step 2 says, the group is f·Re/2 = 32.

OK-verified:
- Citations: FrictionFactorCorrelation.cpp:47 (64/Re), :52-53 (2300/4000), :92 (Blasius), :173 (Colebrook), :200 (rough closed form), :288-290 (A, B), :315-317 (n = 12), :356-359 (fL, fT); DittusBoelter.H:63; Pipe.cpp:578-579.
- Churchill's algebra checks: sqrt(8/f_t) = (A+B)^{1/16}.
- Haken model: fixed point (√(εγ), ε); λ² + γλ + 2εγ = 0 with complex roots below γ = 8ε; reduced slope −2ε; the Bernoulli/logistic solution is correct.
- 0.332/0.339 is 2 % low.
- Reynolds' ratio: 13000 × 43.7/278 ≈ 2043.
- The Gnielinski local exponent at Pr = 7 is 0.86-0.89.

## Licence
No banned competitor name in any of the 14 files (check_doctrine list, check_doctrine.py:69). ChemSep is named as a data source and is not on the ban list. No third-party databank value is quoted as Choupo data. The dataSources page quotes licence text only.
