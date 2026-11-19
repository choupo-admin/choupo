# EduTools review, batch K: bode, column-control, fast-and-slow, active-set-qp

Tree: detached `main` (scratchpad `edu2/tree`). This was a read-only review. There is no native binary in the tree, so no case was run. Every verdict below comes from reading the code, doing exact algebra, or recomputing in python. Paths are relative to the tree.

Registry ids: `bode`, `column-control`, `fast-and-slow` (the file is `fastSlowLesson.ts`, but the registry id is `fast-and-slow`: a separation-of-time-scales page, not an explicit-stability page) and `active-set-qp`.

## bode (bodeLesson.ts, bodeMath.ts, BodeTool.tsx)

**WRONG**
- `BodeTool.tsx` (PanelNote, about lines 505-510) says "Each run writes **six** declared scalars ... The same **five** edits by hand". `bodeOverrides` (`bodeMath.ts`, about lines 470-500) writes **nine**: frequency x2, endTime, deltaT, discardCycles, fitCycles, compA, compB and V. The note's own list also enumerates more than six. A student who repeats "the same five edits" by hand cannot reproduce the run.

**SUSPECT**
- `bodeMath.ts` header cites `src/dynamicDriver/DynamicDriver.cpp:1055` as a Bode-related comment. Line 1055 is `S0 S1 S2` of the rtd block. The comment is now at :1088, and a further hit at :2215 is missing from the "searched" list. This is a stale citation in a developer comment.
- Step 8 and the footnote say the reading needs a stable open loop. The tool's "beyond −180°" message says the integrator's pole at the origin "already breaks" that assumption. But the default PI loop (and every PI/PID loop) carries the same origin pole through the controller, and the page reads it with no caveat. The student gets an inconsistent rule about poles at s = 0.
- `bodeLesson.ts` header says the section is introduced "at the top", but the "Below this line, nothing is computed" alert renders **after** steps 5-7 (`BodeTool.tsx` about line 600). Developer-facing only.

**OK-verified**
- dB = 20 log10.
- −3.0103 dB and −6.0206 dB.
- Corner at 1/240 = 4.167e-3 rad/s. The witness frequency 6.6315e-4 Hz x 2π gives ωτ = 1.
- Lag closed form (`DynamicCSTR.cpp:787-790`; τ = nTot/F at :629, with :628 the comment line).
- Fit: `atan2` at :2031, phase at :2043, residual at :2048. The zero-order hold at `DynamicDriver.cpp:1754-1756` is confirmed through `SignalController::update` (value(t) held across the RK4).
- Bias −π/1000 = 0.18°.
- `sinusoidal` is registered (`Signal.cpp:93`).
- PID form and conversion: `PIDController.cpp:75`, :115-120, :123-127, :135.
- PID response Kc(1 + i(ωτ_D − 1/(ωτ_I))), with cancellation at 1/√(τ_Iτ_D).
- The `startsBeyondMinus180` algebra.
- `ctrl20_bode_cstr` has 4 points with anchor rows.

## column-control (columnControlLesson.ts, ColumnControlTool.tsx)

**WRONG**
- Limit "no-dynamics" (`columnControlLesson.ts`, about line 290) says Choupo's dynamic tier "is a stirred tank and one reference plant". The tool header says the same. The tree has `DynamicTank` (`src/unitOperations/dynamic/DynamicTank.H`: "a TANK with a LEVEL ... the most common control loop"), `QuasiSteadyUnit`, and a level loop under control in `tutorials/ctrl/ctrl21_tank_level_control`. On a page about level loops, the student is told Choupo has no level dynamics. "No dynamic column" itself is still true.
- The drum chip and the reflux-ratio knob's rationale ("decides which stream leaving the drum is larger ... the heuristic that decides LV against DV"; min 0.5 "so the chip ... could show the other case") cannot fire on the default witness:
  - `drumStreams` needs the `L_rect` KPI (`ColumnControlTool.tsx:282`).
  - `L_rect` is published only by the WangHenke branch (`DistillationColumn.cpp:1993`).
  - The witness `column02_simultaneous` runs `solveSimultaneous` (dispatch at :1364; KPIs at :4433-4446, no `L_rect`), and its golden has no `L_rect` row.
  - So the chip is silently absent in the default classroom mode.

**SUSPECT**
- `columnControlTool.test.ts:494` and `:505` are titled "the REFLUX handle moves L alone" and "the DISTILLATE handle moves D alone". `HANDLE_TEXT` and the C259 F2 fix say neither handle moves one stream alone. The test titles pin the retracted claim.
- `HANDLE_TEXT` says "V rises with it (V = L + D)", where V is defined in step 1 as the reboiler boilup. That holds for the boilup only with a saturated-liquid feed under constant molar overflow (CMO). The witness feed (365 K, close to its bubble point) nearly satisfies it, but the statement is given as general.

**OK-verified**
- The 5 − 3 = 2 count.
- The structure table matches `columnControlStructures.dat`.
- `T_top`/`T_bottom` = T[0]/T[N−1].
- Stage numbering matches `DistillationColumn.H:36-47`.
- Tray range.
- Slope pick 10 on `WITNESS_T` (recomputed).
- The sign-change physics for the two handles.
- The single-ended record (`columnControl-singleEndedDefault.dat`).

## fast-and-slow (fastSlowLesson.ts, FastSlowTool.tsx, case/fastSlow.ts)

**WRONG**
- Step 2, third derivation line: `x_f − x_s^red = τf e^{−t/τs}/(τs−τf) − τf e^{−t/τf}/(τs−τf)`. The sign is reversed. From x_s = 1 − e^{−t/τs} and x_f = 1 − (τs e^{−t/τs} − τf e^{−t/τf})/(τs−τf):
  - x_f − x_s = τf(e^{−t/τf} − e^{−t/τs})/(τs−τf), which is < 0 (the full model lags).
  - The page's own gap plot is labelled "full − reduced" (`gapOf`, `fastSlow.ts`) and therefore draws negative values against a formula that says positive.
  - The max |·| = ε^{1/(1−ε)} result is correct.

**SUSPECT**
- The header says "held by gui/tests/fastSlowLesson.test.ts". That file does not exist; the test is `fastSlow.test.ts`.

**OK-verified**
- Case values: 1000/50 mol, ε = 0.05; kf 0.1, kr 0.025, k 0.001, K = 4; k1 0.001, k2 0.1 (all checked against the case dicts).
- The pool law kK/(1+K).
- "The P ahead is exactly the I in transit" (exact by the mass balance).
- The case-3 gap equals case 1's (same ODE in the gap variable).
- The largest eigenvalue in `fastestRate`.
- RK4 real-axis bound 2.785.
- Rosenbrock23 adaptive with verbosity 3 and the step history (`choupoBatch/main.cpp:1453-1466`).
- `DynamicDriver.cpp:802` and :844-847 quoted verbatim.
- `FrictionFactorCorrelation.H:128/133`.

## active-set-qp (activeSetQpLesson.ts, activeSetQpMath.ts, ActiveSetQpTool.tsx)

**WRONG**
- Step 6 and the tool (`ActiveSetQpTool.tsx` about line 483) say the sheet "carries 0.78 % more positive charge than negative". The engine's 0.78 % is the charge-balance error over the **sum**: CBE = 100(c−a)/(c+a) (`StreamStateIO.cpp:1981`). From the sheet's own analytes, cations are 4.1918 meq/L and anions 4.1268 meq/L. That is a CBE of 0.782 %, but the positive charge exceeds the negative by **1.58 %**.
- Step 5: "Every step of non-zero length strictly reduces the objective ... that is why it terminates." This holds only from a feasible start (the N&W Algorithm 16.3 premise). Choupo's variant starts at x = 0 with the equalities' residual unremoved and admits violated rows (step 3's note). The page's own reconciliation starts at u = 0 with objective 0 and ends with a positive objective, and the test `activeSetQpMath.test.ts:372` (x ≥ 1 from zero) has the objective rising from 0 to 0.5. A special case is presented as the general rule.
- Step 6's objective `min Σ((x−m)/σ)²` is called "B the identity", and step 7 writes stationarity as `u + C̃'λ + A'μ = 0`. Both hold only for ½Σu², which is what the engine solves (`AnalysisReconciler.cpp:120-121`: B = I, g = 0). Written without the ½, B = 2I and every λ doubles. A student deriving from step 6 gets multipliers twice the published ones. The inconsistency is inherited from `AnalysisReconciler.H:35`.

**SUSPECT**
- `activeSetQpMath.ts:54` and :193 (and the engine comment at `ActiveSetQP.cpp:304`) say the LICQ recovery drops "the most recently added" inequality. The code drops `ineqRowOf.back()`, which is the **highest-indexed** active row (`ActiveSetQP.cpp:313`; `ineqRowOf` is filled in index order at :232-239).
- The transcription's cap is `maxIter = 50` (`activeSetQpMath.ts` `activeSetQP`), against the engine's 200 (`ActiveSetQP.H:138`). The "cap — the engine throws here" row can be shown where the engine would not throw, despite the "same tolerances" claim.

**OK-verified**
- The KKT sign convention ([B A'; A 0][p; λ] = [−grad; −c]; λ ≥ 0 on ≤ rows).
- The ratio test α_k = −(a·x+b)/(a·p) with slope > feasTol.
- Tolerances at :144-145, the zero-step test at :327, `rowTol` at :176-181, the infeasible verdict at :380-390.
- The hand-worked problem and answer (:463-503).
- The verify call precedes every SQP run (`OptimizationDriver.cpp:623`).
- The normalisation at `AnalysisReconciler.cpp:129-140`.
- μ sign through the −1 unit rows.
- 4 unknowns and 3 constraint families.
