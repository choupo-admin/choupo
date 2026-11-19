# EduTools review, batch C: rayleigh, residue-curves, hunter-nash, sle-pair

Tree: detached main at `.../edu2/tree`. I only read files and did arithmetic by hand or in python3; no engine binary was available. All paths below are relative to `gui/` unless they start with `src/`.

Each registry id matches its topic (`src/ui/methods/registry.ts`): `rayleigh` is RayleighTool, `residue-curves` is ResidueCurvesTool, `hunter-nash` is TieTriangleTool over `case/hunterNash.ts`, and `sle-pair` is SlePairTool.

## 1. rayleigh (`rayleighLesson.ts`, `RayleighTool.tsx`, `BatchStaircasePlot.tsx`)

**WRONG**
1. **The staircase is drawn on the wrong pressure's curve.** The equilibrium curve uses the P knob (`RayleighTool.tsx:719-731`). The rectifier witness still04 always runs with no overrides, at its own 1.013 bar (`RayleighTool.tsx:742`). Both go into `<BatchStaircasePlot curve={curve}…>` (`RayleighTool.tsx:1085`).
   - Consequence: when the student moves P (0.3 to 3 bar), the stages of a 1.013-bar campaign are drawn on another pressure's y*(x). The bottom step then misses the pot, and the caption tells the student to read that gap "as a finding rather than a rounding". The page's own bug is presented to the student as a finding.
2. **A non-existent error source is listed.** The page names the trajectory's write interval as part of the graphical-vs-rigorous gap (`rayleighLesson.ts:71-72`; `RayleighTool.tsx:72` and `:972`).
   - Both sides read the same two trajectory rows: x₀, x_W, W₀ and W all come from the first and last samples (`RayleighTool.tsx:231-239`, used in `buildConstruction`).
   - The Rayleigh identity is exact between any two states on the trajectory, so the write interval contributes nothing.
   - Consequence: the student is taught a false error budget. The real parts are the 121-point trapezoid grid and the engine's RK4 step (dt = 1 s).

**SUSPECT**
3. **The knobs can empty the pot.** At the minimum charge (W₀ = 1e-4 kmol) and the default offtake (F_vap = 1.5e-6 kmol/s), the pot runs dry at 67 s, well inside the default 600 s. At the default charge it runs dry for any endTime of 667 s or more.
   - The engine clamps the holdups to 0 (`src/unitOperations/batch/BatchStill.cpp:914-915`).
   - `potHistory` then returns null because W ≤ 0 (`RayleighTool.tsx:226`).
   - The page then says the run needs "a binary pot … whose holdup falls over the run". The holdup did fall, to zero; the page never says the pot ran dry.
4. **The "charge T" knob changes nothing on this page.** It only seeds the bubble-point Newton (`BatchStill.cpp:81`, `:186`) and the energy ledger (`:676-798`). Neither ln(W₀/W) nor the area depends on it.
   - The file's own rule (`RayleighTool.tsx:342`) excluded the pot volume V as a "placebo control" for exactly this reason.

**OK, verified**
- ln(W₀/W) = ∫ dx/(y*−x).
- With a column the balance becomes 1/(x_D − x), matching the engine's dn = −D·x_D (`BatchStill.cpp:262-266`).
- The operating line y = R/(R+1)·x + x_D/(R+1).
- The walk has trays + 1 steps: nStages excludes the condenser (`BatchStill.cpp:102`) and the pot is the bubble-point stage.
- RK4 calls a bubble-point at every stage (`BatchStill.cpp:897-900`, `:237`).
- Both reflux policies exist and `refluxLimitReached` is published (`BatchStill.cpp:94`, `:989`).
- F_vap × 600 s = 90 % of the charge.

## 2. residue-curves (`residueCurvesLesson.ts`, `ResidueCurvesTool.tsx`, `case/residueCurves.ts`)

**SUSPECT (minor)**
- **Step 2 gives the wrong reason why curves cannot cross.** It says curves cannot cross "therefore", as if that followed from T rising. Non-crossing comes from the vector field x − y* being single-valued (ODE uniqueness). The sentence after it gives the right reason, so only the "therefore" is wrong.
- **Step 2's note overstates its explanation** (`residueCurvesLesson.ts:101`). It says the T drop is nonzero "only because" T is interpolated linearly. But y* is interpolated independently of T, and RK4 clamps points back into the triangle (`clampSimplex`); both also contribute.

**OK, verified**
- The derivation d(Wx) = y* dW gives dx/dξ = x − y*.
- J = ∂(x − y*)/∂x is classified correctly: two positive eigenvalues give an unstable node, the lowest-boiling point (`typeFromJacobian`).
- Separatrices are started from saddles on an edge or inside the triangle, going forward where T rises and backward where it falls (`separatrices`).
- The lever rule D/F = |FB|/|DB| (`limitingSplits`). Direct split: distillate at the unstable node. Indirect split: bottoms at the stable node.
- Refinement resolution is 2h/20 = h/10 on an edge and 2h/8 = h/4 inside, matching the "tenth / quarter" in the limits text.
- 100.0 vs 101.325 kPa is a 1.31 % difference; RT²/ΔH_vap × 0.0131 ≈ 0.34 K, so "a few tenths of a kelvin" is right.
- The preset topologies (glycol: one region; IPA and MeOAc: one boundary) agree with known boiling points.
- `y_eq_<comp>` solves its own bubble point (`src/propertyOps/PropertyEvaluator.cpp:216-228`).

## 3. hunter-nash (`hunterNashLesson.ts`, `TieTriangleTool.tsx`, `case/hunterNash.ts`)

**WRONG**
1. **The colinearity tooltip quotes a retired tolerance.** It says the residual is the same order as "the cascade's own stopping tolerance (a relative mass closure of 1e-4)" (`TieTriangleTool.tsx:574`).
   - The engine stops at 1e-8, and says so explicitly: "1e-8, NOT the 1e-4 it was (DEV.md 4c C123)" (`src/unitOperations/separation/Extractor.cpp:595-605`).
   - The test fixture is a transcription from 2026-08-18, before C123 (`tests/hunterNash.test.ts:337-385`, massClosure 7.2e-5). It is stale: its F_extract is 0.0359293973 against today's golden 0.0359317153. The test comment at `:484` repeats the 1e-4 claim.
   - Consequence: the student reads a 1e-4 explanation for a residual that the current engine should make far smaller.

**SUSPECT**
2. **Step 5's walk only works in one direction, and the page does not say which** (`hunterNashLesson.ts:160`). It says: raffinate → (tie line) → extract → (line through Δ) → "the raffinate of the next stage".
   - In the page's own numbering, Δ = R_j − E_{j+1} (step 4, and the legs in `hunterNash.ts`). So E_j and R_{j+1} are not colinear with Δ.
   - The sentence is right only when walking from stage N back toward stage 1, which the page never says. The tool's operating lines run R_j → E_{j+1}.

**OK, verified**
- The lever rule FM/MS = S/F.
- Δ = F − E₁ = R_j − E_{j+1} = R_N − S, from F + E_{j+1} = E₁ + R_j.
- The extractor takes exactly two inlets (`Extractor.cpp:468`). The extract-defining species is the declared solvent, or else the solvent stream's dominant component (`:544-550`). The extract is labelled as the phase richer in it (`:165`).
- M is found twice, by line crossing and by lever arithmetic, and the two are compared.
- The corners are placed as carrier, solvent and solute, matching the textbook.

## 4. sle-pair (`slePairLesson.ts`, `SlePairTool.tsx`, `slePairMath.ts`, `slePairData.ts`)

**WRONG**
1. **The b₁₂ and b₂₁ labels are swapped** (`slePairLesson.ts:179-180`).
   - In the printed formula, and in the engine's termA (`src/thermo/activityCoefficient/NRTL.cpp`, around 413), G₂₁/(x₁ + x₂G₂₁) is the local fraction of molecule 2 around a central molecule 1. So τ₂₁ = b₂₁/T is the *solvent-around-solute* energy, and b₁₂ is *solute-around-solvent*.
   - The page labels them the other way round. Consequence: the student's physical reading of the two fitted parameters is inverted.
2. **Step 7 names the wrong comparison pair** (`slePairLesson.ts:196`). It says the cold-half pair's γ₂^∞ is "190 000 times larger than the pair fitted to all of it".
   - The comparison pair is fitted only on the training points, 8 of 11, with the held-out points excluded (`SlePairTool.tsx:247`; `tests/slePair.test.ts:202-206`).

**SUSPECT**
3. **"342.8 K, the warmest measurement"** (`slePairLesson.ts:130`) is only the warmest point of the cyclohexane series. 2-propanol reaches 343.1 K and acetic acid 346.65 K, and the page's default solvent is acetone.
4. **"The ideal column is the same for every solvent"** (`SlePairTool.tsx:445`) is not quite what the table shows. The ideal solubility is evaluated at each series' own nearest T (298, 298.15 and 298.45 K), giving 0.1647, 0.1653 and 0.1665. At 3 significant figures those can print different digits.

**OK, verified by recomputation**
- Ideal solubility 0.1653 (Wang) and 0.1896 (Yang): ΔH_fus differs by 7 % and the ideal solubility by 15 %.
- The ΔCp term: formula and sign correct; 0.239 at 298.15 K (factor 1.27) and 0.0589 at 342.8 K.
- The relation ln γ_extracted = ln γ − term.
- The ideal saturation temperature of x₁ = 0.1 is 278.9 K.
- γ₁ in acetone runs from 0.761 to 0.948; in cyclohexane it is 35.3 at 283 K.
- The acetone window is x₁ = 0.127 to 0.303, over 45 K.
- The NRTL transcription is the engine's loop.
- Every `SLE_ENGINE_SOURCES` line reads back as claimed: NRTL.cpp:386 and :425, SolidPhase.H:46 and :124, IsothermalFlash.cpp:111, FitParameters.cpp:412.
