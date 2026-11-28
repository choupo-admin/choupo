# EduTools review, batch M: processSafety, bund, plantLayout, gmpLayout

Tree: detached main `2ade5c5351` (2026-11-19). Read-only. The registry ids are `process-safety`, `bund`, `plant-layout` and `gmp-layout`, and each covers the topic its name suggests. I re-opened every engine citation in the four lessons at the line given: about 80 in `PlantLayout.cpp`, `BuildingLayout.cpp`, `BundArithmetic.H`, `BatchReactor.cpp`, `BatchUnitOperation.cpp` and `AdvisorySummary.H`. All of them land on the code they describe. I checked the typed numbers against the goldens or recomputed them from the witness dicts.

## 1. Process safety (`processSafetyLesson.ts`, `ProcessSafetyTool.tsx`, `processSafety.ts`)

**WRONG**
- `ProcessSafetyTool.tsx:860-865`, row "hydrogen and ammonia held in the loop": the page says "not computed: these cases size no vessel, so there is no volume to hold anything (lesson step 15)". Step 15 (`processSafetyLesson.ts`, the n:15 body) and the goldens say the opposite. `ammoniaPEQ02_feasibility150bar/expected:316-325` gives `Converter inventory.mass.total 192.8 kg`, and `Separator RawLiquid.mass` is 4328.6 kg at 150 bar and 23418.8 kg at 50 bar. This is the C259 correction, and it only reached the prose. The test that guards against the old wording (`processSafety.test.ts:563-565`) checks the lesson body and `SAFETY_LIMITS` but not the Tool. *Consequence: the loop table tells the student there is no inventory, and the step directly below it quotes 193 kg and 23.4 t.*

**SUSPECT**
- `registry.ts:1951-1952` (teaches): "the engine cannot call it safer without sizing the equipment". The cases do size the converter and three drums. What is missing is the pipes, the exchanger hold-up and the release scenarios. This is a softer form of the same stale claim.
- Step 5, `where` list (`processSafetyLesson.ts`, n:5): the symbol `n_A` is defined as "the limiting reactant ... (reactant B on this page)". The subscript A names species B in a lesson whose reaction is A + B → P. *A student will plug in n of A.* The numbers are the same here (5 mol each), so this is a pedagogy defect, not an arithmetic one.

**OK-verified**
- `criticalityClass` (`processSafety.ts:539-549`) reproduces Stoessel's five orderings exactly, including the boundaries.
- The semi-batch estimate is consistent: T_cf = T_p + X·ΔT_ad·M_f/M, since ΔT_ad = Q/(M_f c_p). The whole-tank dump form is consistent too.
- TMR_ad ≈ c_p R T0²/(q0 E) comes out in s.
- Q = F·Z·R·T/P: kmol/h × 1000 × Pa⁻¹ gives m³/h (`ProcessSafetyTool.tsx:884`).
- X_H2 = 1.5·ΔNH3/H2 is right.
- Converter states 733.15 K / 673.15 K with a 5 K approach match the goldens (lines 80, 85 and 76, 81).
- Converter-gas volume ratio: 34.66/21.93 = 1.58 ("1.6 times"). Gas mass ratio: 115/193 = 0.60.
- Ideal-gas Q50/Q150 = 1.58 × 0.908 × 3 = 4.3 ("about four times").
- First-order k ≈ 8e-4 s⁻¹ gives under 0.1 % conversion in 1 s.
- Schedule: 16 portions at 900 s, refills at 3150/6750/10350 s, and 50 s write intervals all match the dicts.
- `BatchReactor.cpp:661-727` (the `adiabatic` key) and `BatchUnitOperation.cpp:238-276` (H-equality mixing) are as described.

## 2. Bund (`bundLesson.ts`, `BundTool.tsx`, `bund.ts`)

**WRONG**
- `bundLesson.ts:440-441`, step 11: "The table after this step holds one volume with three walls." The table rendered right after step 11 (`BundTool.tsx:342-347, 513`) has the title "One volume, four walls" and four rows, `walls = [0.3, 0.6, 1.2, 2.0]`. The source comments are stale in the same way (`BundTool.tsx:25`, `:340`, `bund.ts:523`). *The student is told to look for three walls and finds four.*
- `bundLesson.ts`, step 15 (the n:15 body): the bench "computes what it requires (the largest tank, or a quarter of the total, the larger)". Neither offered rule says this (`bund.ts` `RULES`: 110 % of the largest or 25 % of the total, or 100 % of the largest). With the default rule the bench prints 22 m³, not the 20 m³ the sentence predicts. *This drops the 110 % margin that step 8 just explained.*

**SUSPECT**
- `bundLesson.ts:222`: step 4 cites "HSG176 paragraphs 164-165" for the sloped floor. The page's own source list (`bundLesson.ts:88`) puts "a floor sloped away from the tank" under 165-167 and 163-164 under liquid-tightness. One of the two is wrong. I did not read HSG176, so I cannot say which.

**OK-verified**
- The seven engine twins are line-for-line the same as `BundArithmetic.H:64-118`, and the citations :64/:73/:88/:96/:103/:109/:116 are correct.
- `PlantLayout.cpp:4457` (net volume) and `:4461` (pit) are correct.
- Sloped-floor volume is A(h − Δ/2). The wedge form W e²/(2s) is correct.
- The step-6 derivation h = V0/(A − Σ_{i≠k} π D_i²/4) is correct, and so is the claim that the engine is on the safe side.
- The 25 % term governs only when the total exceeds 4.4 × the largest: 1.1/0.25 = 4.4.
- Wall loads: F = ρgh²/2 and M = ρgh³/6. Doubling the wall halves the pool and multiplies M by 8.
- Drain: C_d·πd²/4·√(2ge) in m³/s, multiplied by dt in s. Leak: m³/h divided by 3600.
- Exercise: net = (55 − 12.975) × 0.55 = 23.11 m³ against 22 m³ required. Wall gap 1.0 m against the 1 m clearance.
- Green-ammonia bund rule (1.1 × largest + 100 mm) matches `ammoniaPEQ_baseCase/system/layoutDict:799-821`.

**Licence.** The 110 %/25 % figures, the 1 m / 2 m clearance and the 225 mm / 600 mm wall figures are from HSE HSG176 and SI 2001/2954. Both are Crown copyright and reusable under the Open Government Licence, and the page paraphrases them with paragraph numbers. This is not a no-grant table.

## 3. Plant layout (`plantLayoutLesson.ts`, `PlantLayoutTool.tsx`, `layoutExercise.ts`)

**WRONG**: none found.

**SUSPECT** (minor)
- Step 9 says an angle must carry its unit "because a bare number would be read as radians". The engine refuses a bare number (`PlantLayout.cpp:131-134`); the radian reading is the reason for the refusal, not what happens. The step's own note says "refused", so this only reads ambiguously in the body.

**OK-verified**
- Every citation checks out: :107-108, 132, 163, 187, 224-227, 235, 247, 291, 334, 409, 2112, 2162, 2934-2936, 2946, 3014, 5079, 5086, 5128, 5210-5211, 5293-5297, 5363-5366, 5387, 5396-5400, 6294-6295, 6310.
- The `clearPlan` and `pointToFootprint` formulas match the code.
- The witness numbers are consistent with each other and with the golden (`ammonia02_full_plant/expected:318, 327, 339-340`):
  - D_sep = 2.668 m, D_drum = 0.544 m, separator at x = 56.
  - Edge-to-edge gap 1.894 m against the 4 m limit; centre-to-centre 3.5 m.
  - The drum must sit at x ≥ 56 + 1.606 + 4 = 61.61 m; at x = 62 the gap is 4.39 m.
  - The drum overlaps at x = 57.5.
  - 4 m centre-to-centre leaves 2.39 m clear; 4 m edge-to-edge needs 5.61 m between centres.
- The FEHE east pull space hits the water cooler: 46 + 12 > 50.
- All distances are labelled author-set. CCPS, GAP, Mecklenburgh, IEC, EI 15 and API RP 505 are named only, with no values.

## 4. GMP layout (`gmpLayoutLesson.ts`, `GmpLayoutTool.tsx`, `gmpLayoutExercise.ts`, `gmpTeachingBuilding.layoutDict`)

**WRONG**: none found.

**SUSPECT** (minor)
- Limit "penetrations" ("a pipe or a duct crossing a room's wall ... is not checked") is true for a room. But since C100 the engine does require a declared wall penetration that lies on the building shell (`PlantLayout.cpp:1864-1893`). Saying so would avoid a false absence.

**OK-verified**
- Every BuildingLayout citation checks out, `80-83` through `1098`, including the ranks at `120-127`.
- Step 5's bubble, sink and cascade inequalities match `:860`, `:865` and `:872-873`.
- Step 8's rule "every neighbour j that is not a sink" matches `:916-919`.
- Gowning state matches `:981-988`, the flow interiors match `:1002-1007`, and `boxGap` matches step 11.
- Teaching-building numbers:
  - 17 rooms.
  - Coating 25 Pa / exitMAL 15 Pa / packaging 5 Pa gives the moves at 16, 15 and 12 Pa exactly as stated.
  - sdIn at 25 − 20 = 5 Pa and sdOut at 5 Pa are sinks; the suite is at 15 Pa, and its 10 Pa below the corridor is exact.
  - Electrical room to suite: √(6² + 4² + 1²) = 7.28 m, against a 6 m declared separation.
- Annex 1 (4.4, 4.12(i), 4.13, 4.14) and 1999/92/EC Annex I are paraphrased correctly. The only standard number is the 10 Pa from Annex 1, which is allowed under the Commission's reuse policy. ISPE and WHO are cited by title only and marked NOT READ.

## Licence summary

None of the four lessons contains a value from a no-grant standard: no NFPA, API, ISPE, IEC, CCPS or GAP numbers.
