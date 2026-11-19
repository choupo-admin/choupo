# EduTools review, batch j: plant-cost, economics-errors, least-squares, data-reconciliation

Tree: detached main (HEAD 2026-11-19). The four lessons are the ones registered under these ids (registry.ts:2404, :2369, :1809, :1711). Read-only. I recomputed the defaults by running copies of plantCostMath.ts and economicsErrorsMath.ts in node (scratchpad run-j/). The engine numbers come from the goldens of curate02 and reconcile01.

## 1. least-squares (leastSquaresLesson.ts, LeastSquaresTool.tsx, leastSquaresRun.ts)

**WRONG**
1. **The Tool still describes the witness that was retired on 2026-11-18 (C439).** The lesson was rewritten for it, the Tool was not. The case's own golden (curate02 `expected`) reads n_data 10, n_heldout 4, n_params 2, identifiable 1, cond 31.9. The Tool says otherwise in five places:
   - LeastSquaresTool.tsx:352-354: "eight measured ... bubble temperatures, four NRTL coefficients, and three more measurements".
   - :457-462: "The eight points ... nothing at 0.20, nothing at 0.50, nothing at 0.80. Those three compositions ... withheld". The held-out x values are actually 0.1000, 0.3940, 0.6310 and 0.8480 (curate02 README.md:51; the dataset header).
   - :508: "the three withheld measurements".
   - :208: the plot's aria label says "eight fitted points".
   - :700-703: "its four coefficients are not separately determined by the evidence". This sits directly under a badge that reads "parameters individually determined", and it contradicts lesson step 10.
   - Consequence: the page tells a student the opposite of the run it draws, on the very identifiability point the page exists to teach. The doc comment at leastSquaresRun.ts:52-53 ("eight ... fitted, three withheld") is stale in the same way.
2. **leastSquaresLesson.ts:334 says `fdStep` is "1e-3 on this page's case".** The case declares `fdStep 1.0e-4` (curate02 system/propsDict, `options`). A student who checks h by hand gets a value ten times too large.
3. **"Choupo's bubble-temperature fit does not read [a per-point σ]" is a buried absence.** The lesson says so at :113-115, :125 ("Choupo: σ_i = 1 for every i"), :101-103 and :100 ("Choupo's T_bubble residual is this with every weight equal to one").
   - Since 2026-09-28 the fit accepts `residual { weighting uncertainty; }` and weights each point by 1/U_k (src/propertyOps/FitWeighting.H header; FitParameters.cpp:953, :177; it publishes `weighted`).
   - curate02 only *chooses* `equal`. Its README.md:50 says "curate04 weights by them".
   - Consequence: the student is told that a capability which ships does not exist.
4. **Limit "error-structure" (leastSquaresLesson.ts:569-570): "The dataset declares no per-point uncertainty".** The dataset does declare one: an `uncertainty { T_bubble { kind expandedCombined; level 95; ... } }` block (constant/experiments/*.dat:56-62). The README gives the range as 0.13-0.45 K, and step 8's own band is built from "the largest stated uncertainty (0.18 K)". The page contradicts itself.

**SUSPECT**
- Step 8 note, :443-447: "0.18 K plus ... (0.03 K)" gives 0.21 K, while the text says "about 0.22 K". The case's endpoint errors are 0.033 + 0.003 = 0.036 K, so the total is 0.216 K, and 0.216/354.28 = 0.0610 %. Separately, the case's origin string itself prints "= 0.0601 %", which is an arithmetic typo in the case (it should be 0.0610).
- Step 6, :318-320: "one searched over plus or minus 15 and one over plus or minus 5000". The case's bounds are ±3000 (propsDict; step 4 says ±3000 too). The ±15 bound for a_ij is in neither the case nor the README.
- Tool :567 and lesson :496 say "five lines" for CurationDossier.cpp:59-72. It is now 14 lines, including a logic_error guard. The cited range itself is still correct.

**OK-verified:** every FitParameters.cpp citation was checked against the line it names:
- :133, :245 (t(8) = 2.306, so the interval is +17.7 % wider than 1.96), :259, :280, :540, :677;
- :1007, :1013, :1020, :1025, :1043, :1045, :1049 (1e-3·h), :1050, :1051 (λ > 1e12), :1246 (cond < 1e8, |ρ| < 0.999), :1582;
- EvidencePartition.H:259-260 and :342; PropertyOperation.H:118.

The derivations also check out: the Gauss-Newton and Marquardt equations; C = χ²_red (J'J)⁻¹ (FitParameters.cpp:1208); cond 31.9 and ρ 0.940 match the golden; 14 points split as 10 + 4; the held-out x range is 0.10-0.85; ethanol's Trange is (273 369).

## 2. plant-cost (plantCostLesson.ts, PlantCostTool.tsx, plantCostMath.ts)

**WRONG**
1. **plantCostLesson.ts:79: "the print is at line 3802".** EconomicsPass.cpp:3802 is the land-recovery print. The `[Lang cross-check]` print is at :3807. The test (plantCost.test.ts:61) only mentions "3802" in a comment, so nothing holds this line.
2. **PlantCostTool.tsx:367-368 cites `:254`, `:403`, `:409` and `:2879`, each one line too early.**
   - :254 is "seconds) -- a default number ...".
   - :2879 is "The fraction 0.15 is also the comparison line ...".
   - The lesson and ENGINE_SOURCES (which the test does hold) use the correct :255, :404, :410 and :2880.
   - The comment at plantCostMath.ts:300 (":403-:409") is stale in the same way.
   - Consequence: the student lands on the wrong line.

**OK-verified**
- Lang factors 3.10/3.63/4.74. Quiz: 3.10 × 3.0 = 9.3.
- Asgharian: Σ = 0.88687 rounds to 0.887, and 4.7 × Σ = 4.168 rounds to 4.17. The page reports that it reproduces both, which is correct.
- The factored D/I/F and the re-basing quiz (dividing by 1 + Σf) are correct algebra.
- Engine FCI = contingencyFee(ΣC_BM + bldg) + siteFactor·ΣC_BM0 (EconomicsPass.cpp:3080). The default contingencyFee is costing::contingencyAndFee = 1.18 (:2934, CostingModel.H:69, Turton.cpp:755). siteFactor is 0.50 (:2928).
- The working-capital build-up matches buildWorkingCapital, including the 1/365 day, receivables at R, minimum cash at COM_d and payables on C_RM (:279, :404, :407, :410). x/(1-x) is the correct conversion from a share of TCI to a share of FCI.
- The loan schedule matches the engine loop (EconomicsPass.cpp:1979-2027): draws at the end of each year, IDC = r·B capitalised, interest paid on the opening balance, grace years, the annuity on P with n = term, and the last payment clearing the balance. Defaults: IDC 0.6 and loan at start-up 20.6.

## 3. economics-errors (economicsErrorsLesson.ts, EconomicsErrorsTool.tsx, economicsErrorsMath.ts)

**WRONG**
1. **EconomicsErrorsTool.tsx:264 OriginMark: "one illustrative plant, shared with classes 3 and 6".** Class 6 runs on its own state, `rt = {I:30, cf:6, ...}` (:179). The shared plant's cash flow is 10.9 M EUR/yr. Editing the plant leaves class 6 unchanged.

**SUSPECT**
- Step 7's title promises "an IRR of hundreds of per cent", and the quiz uses 400 %. At the default scale of 6 the page shows an IRR of 120 % (computed: 1.1995). That is not "hundreds", and it sits below the engine's 200 % warning (EconomicsPass.cpp:2180), which the same panel's guard describes. A student sees the guard text and never sees it fire.

**OK-verified**
- The break-even N* formula is exact algebra, and NPV(N*) = 0 to round-off.
- Tax: 30 − 20 − 3 = 7, 21 % gives 1.47, and 6.3 is about 4.3×.
- Units: 3 GWh = 10 800 GJ, a factor of 277.8; eurPerKwhToEurPerGJ gives ×277.8.
- The working-capital spread at the defaults is 10.2×, so "an order of magnitude" holds. NPV cost = W(1 − (1+i)^−L).
- Every GUARDS needle exists in the cited file: EconomicsPass.cpp:1080, :2917, :1875, :4498, :1956, :1577, :2079, :2180, :1228 and :1886; UtilityAllocationReport.cpp:411; DeclaredQuote.cpp:184.
- Royalties are charged only for t ≤ expiry (:1931).

## 4. data-reconciliation (dataReconciliationLesson.ts, DataReconciliationTool.tsx, dataReconciliationRun.ts)

**OK-verified, no WRONG found.**
- The Lagrangian, x̂ = m − CAᵀλ, λ = (ACAᵀ)⁻¹r and γ = rᵀ(ACAᵀ)⁻¹r are all exact. So are V, Σ = C − V, and the complete-the-square identity for the prior.
- Šidák: β = 0.0073 and z = 2.683. χ² critical values: 9.488 (4 dof), 7.815 (3 dof), 14.067 (7 dof).
- Every typed number matches the reconcile01 golden:
  - mixer residual test 1.605;
  - rms 0.807 / 0.443;
  - γ 3.19 / 26.67;
  - z(F3) −4.858 and z(F2) 2.569;
  - drifted residual tests −4.74 and +4.10;
  - reconciled F2 = F3 = 153.35;
  - σ(x̂) 1.295 and F6 0.387;
  - offsetTest_F3 4.858, the same magnitude as z(F3), so the identity holds;
  - prior case: σ 0.896 and prior-conflict 3.96;
  - the prior is 2 % (combinedSigma implies s = 3.0 and 0.2).
- Citations: DataReconciliation.cpp:494, :524, :673, :701, :722, :740, :754 and :758, and AnalysisReconciler.cpp:261, all as described.
- The refusals exist: dependent balances (:392), the active bound (:676) and unobservable flows (:597).
- Only a nit: t_j at step 13 has the opposite sign to z_j, so "exactly" holds in magnitude.
