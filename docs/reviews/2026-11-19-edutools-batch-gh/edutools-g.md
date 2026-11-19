# EduTools review, batch G: bjerrum, electrolyte-models, salt-mixing, element-potential

Tree: detached main (scratchpad/edu2/tree). Read only. I reran two of the page's numbers in node on a copy of `saltMixingMath.ts` (run-g/). I could not run the engine, because the tree has no build.

## 1. bjerrum (`bjerrumLesson.ts`, `BjerrumTool.tsx`; witness `props/electrolyte/bjerrum01_carbonate_pH`)

**WRONG**
- **The boron claim is stale.** `bjerrumLesson.ts:320-330` (limit `one-family`) says boron is "not available: the species record for borate exists but there is no boric-acid species and no formation reaction". That is no longer true:
  - `data/standards/species/H3BO3.dat` exists.
  - `data/standards/chemistry/BOH4-formation.dat` exists (H3BO3 + H2O = B(OH)4- + H+, logK25 −9.24).
  - Both were added in commit a8bd986844 on 2026-11-01, nine days before the lesson was last edited (2026-11-10).
  - `tutorials/props/electrolyte/borate01_felmyWeare` already speciates boron.
  - A student is told that boron is a curation gap when it is curated. The one-step, two-curve diagram the page says is impossible can be built now.

**OK, verified against the golden `expected` of the witness**
- Crossovers interpolated from the golden: 6.3409 and 10.2616. The page says 6.341 and 10.262.
- γ_HCO3 = 0.9748 and γ_CO3 = 0.903 at the first crossover; 0.813/0.949 at the second. The page says 0.975, 0.90 and 0.81/0.95.
- Worst closure 0.99966 (page: 0.9997).
- 11 beakers carry no Na and 33 report SI rows; both match the prose.
- Algebra checked:
  - pH = pK1 + log γ_HCO3: 6.352 − 0.011 = 6.341.
  - Davies fourth root at I = 0.5 gives γ1 = 0.7334, so 6.352 + log10 0.733 = 6.217.
  - The pK sign conventions match the records: `CO2aq-formation.dat` logK25 +6.352, `CO3-formation.dat` −10.329.
- Davies is charge-only with A = 0.51·f(T) on log10 (`AqueousActivity.cpp:164,175`). The pH scale is −log10(γ_H m_H), Davies charge-symmetric (`AqueousActivity.cpp:153-157`).
- The 0.5 mol/kg band is declared at `AqueousActivity.cpp:121-129`.
- The T slider (278-348 K) stays inside the analytic log K range. The C_T slider (≤ 20 mmol/kg) keeps I far below 0.5.
- **Outside the lesson, same family:** the witness's own header says "the two beakers with no sodium" (propsDict, item 2 of its header). The lesson's "eleven" is the correct count.

## 2. electrolyte-models (`electrolyteModelsLesson.ts`, `ElectrolyteModelsTool.tsx`, `gui/src/case/electrolyteModels.ts`)

**WRONG**
- **About 12 line numbers in the student-visible prose are stale.**
  - The test holds only the separate `EM_CITATIONS` list (`electrolyteModels.test.ts:272-277`), and that list is correct. Nothing holds the numbers typed into the prose, so every one of them has drifted by 10-30 lines. Prose citation → actual line:

    | Prose citation | Actual line |
    |---|---|
    | `PitzerForm.H` line 88 (A_φ, :96) | 106 |
    | `PitzerForm.H` line 87 (b, :160) | 105 |
    | `AqueousActivity.cpp` line 131 (:158) | 164; line 131 is a criterion string |
    | `AqueousActivity.cpp` line 142 (:129) | 175; line 142 is a lone `{` |
    | `SpeciationSolver.cpp` 1569 (:208) | 1599 |
    | `PitzerSingleSalt.H` 191-201 and 199 (:136, :147) | ~201-217 and 214 |
    | `PitzerForm.H` 98-103 and 259-262 (:147) | ~119-125 and 280-288 |
    | `ENRTLSingleSalt.H` 90 and 154 (:149) | 100 and 164 |
    | `ENRTLSingleSalt.H` 84 (:288) | 94 |

  - Consequence: a student who opens the cited line lands on a comment or on unrelated code. This is the exact defect `EM_CITATIONS` was written to prevent.
- **The provenance of the Pitzer records is misattributed.**
  - `electrolyteModelsLesson.ts:303-307` says the Pitzer records' "authors fitted them ... (Pitzer and Mayorga 1973 fitted the osmotic coefficients)".
  - Every record's own `source` line is Appelo, Appl. Geochem. 55 (2015): `Na-Cl.dat:64`, `K-Cl.dat:41`, `Ca-Cl.dat:31`, `Na-SO4.dat:29`.
  - The values differ from Pitzer and Mayorga's. NaCl has β0 = 0.07534, β1 = 0.2769, Cφ = 0.00148. Pitzer and Mayorga's 0.0765/0.2664/0.00127 appear in the record only as the Silvester-Pitzer T-function constants `sp_q1/q6/q11`.
  - The tool prints the Appelo source line in the same table (`ElectrolyteModelsTool.tsx:425`), so the page contradicts itself.

**SUSPECT**
- **The page contradicts itself on Davies' band.**
  - `:329` says "this page has no source for the band its author stated".
  - The engine declares that band with a source: Davies 1962, plus the medians measured in the tree (`AqueousActivity.cpp:85-97,121-129`).
  - The page's own module says DAVIES_I_MAX is "four times the band its authors stated" (`electrolyteModels.ts:251-252`).
- **Stale code-comment citations.** `electrolyteModels.ts:106-108` cites `PitzerSingleSalt.H:150` (that line is `spEval32`; M_w is at :164) and `SpeciationSolver.cpp:660` (a dH lookup; 18.015 is at :677 and :1996).

**OK, verified**
- Debye-Hückel limit ln γ± = −3A_φ|z+z−|√I and φ = 1 − A_φ|z+z−|√I. This is the I→0 limit of `fGamma` (`PitzerForm.H:121-125`), and 3·0.3915/ln10 = 0.5101.
- The mean-ion identity (ν+z+² + ν−z−²)/ν = |z+z−| holds.
- Davies in ln form (−ln10·A z²(...)).
- The Pitzer ln γ±, B^γ and C^γ = 1.5Cφ match `PitzerSingleSalt.H:201-217`.
- The eNRTL molal conversion 1/(1 + νmM_w), with M_w in kg/mol, matches `:100` (0.001·Mw[g/mol]). τ·298.15/T matches `:94`, and α = 0.2.
- ln a_w = −νmM_wφ matches `PitzerSingleSalt.H:259`.
- Π = (RT/V̄_w)νmM_wφ, so φ = 1 gives νmRTρ_w.
- NaCl's φ crosses 1 between 2.0 (0.984) and 2.5 (1.013).
- 99 Pitzer pair files, 3 of them with T-slots (K-Cl, Na-Cl, Na-OH). β2 is present on Ca-Cl and Mg-SO4. There is no `eNRTL/Mg-SO4.dat`.
- Held-out rows: every 4, offset 3 (`Ca-Cl/system/propsDict:18`).
- The tool's Davies φ = −ln a_w/(M_w ν m) is consistent with the solver's a_w at φ = 1.

## 3. salt-mixing (`saltMixingLesson.ts`, `SaltMixingTool.tsx`, `saltMixingMath/Model/Data.ts`)

**WRONG:** none found.

**SUSPECT**
- **The sliders take the KCl binary past its stated validity without saying so.**
  - `K-Cl.dat:33,37` says "Validity capped at saturation (4.803 mol/kg)" (`lphiValidityMax 4.8`), with T-slots fitted to 25 °C L_φ.
  - The page evaluates B_KCl at I = m_X. Recomputed with the page's own functions: the eutonic reaches I = 7.21 at 298 K and 9.14 at 353 K, and the KCl binary is 6.85 mol/kg at 353 K.
  - Slider maxima: 353 K (isotherm), 358 K (design).
  - The limits cover θ(T) (`:283-289`) but not this extrapolation. `saltMixingMath.ts:191-195` knows it ("negative C_phi ... extrapolated past its range"), but the student is never told.

**OK, verified**
- The HMW reduction to two cations and one anion (lesson `:120-127`, math `:114-136`) matches the general sums term by term. E_θ = 0 for like charges. S_C, Z = 2m_X, C = Cφ/2 and g' are correct.
- The fit residual r = 2m_Nθ + (m_N m_X + m_M m_N)ψ is exact algebra.
- Units: θ in kg/mol, ψ and C in kg²/mol², S_C dimensionless.
- The van't Hoff form matches.
- "17 % short at 343 K", recomputed: KCl from the catalogue K_sp is 5.405 mol/kg against Farelo's 6.504, which is −16.9 %. The record's dH 8500 and the calorimetric 17200 are at `KCl.dat:59,63`.
- θ = −0.012 and ψ = −0.0015 come from the catalogue.
- The DH factor polynomial is identical to `SolventProperties.H:94-100`.
- The Silvester-Pitzer q-mapping matches `PitzerHMW.cpp:124-135`.
- There is no Al-Cl record.
- Residual sign −Δ is correct.
- Tcold < Thot is guarded.

## 4. element-potential (`elementPotentialLesson.ts`, `ElementPotentialTool.tsx`, `elementPotentialRun.ts`)

**WRONG:** none found.

**SUSPECT (minor)**
- Limit `ideal-gas` cites `GibbsMethod.cpp:66-74` for "repeats the Newton until φ settles". Those lines are the comment and the `nonIdeal` flag. The loop itself is at `:202` (maxOuter), `:224` (warmStartPass) and `:332`.

**OK, verified**
- The residual and the change of variables n_i = exp(lnN − ln(P/P°) − g/RT + Σπ_k A_ki) match `GibbsMethod.cpp:76-94`, with ln_P = ln(P/Pref) at :61. The ±50 cap is at :51-52 and :84.
- The least-squares seed is at :100-124, tolerance 1e-8 and maxIter 80 at :128-129.
- In `NewtonND.cpp`: finite-difference Jacobian :769, Gauss :771, singular Jacobian :774, backtracking :798, the default branch :927-937.
- Hand check of step 3 on the quoted numbers. Every μ/RT equals Σπ_k A_ki to within 1e-4:
  - CO: −43.4799 vs −43.4800.
  - H2O: −62.3837 vs −62.3838.
  - CO2: −87.7941 vs −87.7942.
  - H2: −18.0695 vs −18.0696.
  - ln K = 1.4328 and K = 4.19.
- Coking: −0.6765 + 1.5224 = 0.8459, so a_C = 2.33.
- Ammonia feed: 100 kmol/h = 27.8 mol/s, and y_H2O,out ≈ 0.15/1.025 = 14.6 %. Elements N, H, O give a 4×4 Jacobian.
- Shift feed: 0.5 kmol/h = 0.139 mol/s CO, and ln N = −1.2809 gives 0.278 mol/s.
- The primal step formula is Gordon-McBride's, and the e² step limit is at `:516-519`.
- Solid-phase refusal for more than one solid: `GibbsSolidPhase.cpp:240-250`.
- λ = πRT at `GibbsReactor.cpp:763`.
- The test (`elementPotentialLesson.test.ts:275-326`) holds both the anchored lines and the quoted digits.
