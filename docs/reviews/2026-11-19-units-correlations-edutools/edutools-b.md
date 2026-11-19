# EduTools review B: levenspiel, epsilonNtu, fug, pinch

Tree: commit 482c4acb32, read only. No binary is built in the tree, so every number below comes from algebra on the engine source or on the case data.

**The brief's premise was wrong.** In this codebase `fug` is the **Fenske–Underwood–Gilliland distillation shortcut** (`registry.ts:945`, `fugLesson.ts`, `FugShortcutTool.tsx`). It is not a fugacity lesson. No EduTool teaches φ, Poynting or the Lewis rule (grep for `poynting` over `gui/src/ui/methods` finds nothing). I reviewed FUG.

## 1. Levenspiel (`levenspielLesson.ts`, `LevenspielTool.tsx`)

**WRONG**
- **The T knob leaves the liquid phase the lesson promises.** The step-1 note says the witnesses are "isothermal, one liquid phase". The tool header (`LevenspielTool.tsx` ~l.396) says the rate laws' concentrations "come from Vliq: P never reaches the physics". The T knob runs 320–380 K (`LevenspielTool.tsx:384`).
  - The feed is 50/50 ethanol/acetic acid at 1 atm with the case's own ideal model (Raoult) and its own Antoine data (`components/ethanol.dat:40`, `aceticAcid.dat:55`). That puts the bubble point at about 363.7 K and the dew point at about 376 K. At 380 K the dew pressure is 1.144 bar, above 1.013 bar.
  - Above about 376 K, both `PFR.cpp:111-118` and `CSTR.cpp:154-164` switch to vapour-basis concentrations. Q rises by roughly 400×, so τ falls from about 269 s to about 0.6 s.
  - Between 364 and 376 K, the CSTR flags a two-phase feed but keeps the liquid basis (`CSTR.cpp:178`).
  - Consequence for a student: X_CSTR goes from about 0.83 at 375 K to about 0.01 at 377 K. That is a phase change, but the page gives the student no way to tell it from kinetics.

**OK-verified**
- PFR and CSTR design equations. The rectangle and integral inequality. N tanks between the area and one tank. The autocatalytic washout criterion k·C_A0·τ > 1 (from C_A = 1/(kτ) < C_A0). The X* optimum derivative (the 1/(−r) terms cancel).
- Units match the engine. F_A0 is in mol/s (`PFR.cpp:182,287`). −r is in mol/(m³·s) (`PFR.cpp:295-305`, `CSTR.cpp:567`). The ×1000 on F[kmol/s]·z (`LevenspielTool.tsx` `feedLimitingFlow`) is right. The catalyst factor 1000·ρ_cat [kg→g] is right (`PFR.cpp:253`).
- The claim that the single-reaction CSTR refuses a product order and the multi-reaction path does not is verified at `CSTR.cpp:424-438`. The claim that an undeclared product gets order 0 is verified at `Reaction.cpp:245-252`.
- The η = 1 direction is right: real η < 1, so the true volume is larger.

## 2. ε-NTU (`epsilonNtuLesson.ts`, `EpsilonNtuTool.tsx`)

**WRONG**
- **The outlets do not come from ε-NTU.** The step-1 note says the exchanger "solves the duty and both outlets from ε-NTU, and only then computes the LMTD". In the engine, ε-NTU gives only Q. The published outlets are inverted from the package enthalpy (`HeatExchanger.cpp:1031-1032`), and the LMTD is then taken on those inverted temperatures (`:1046`). The page's own "sensible-only" limit says exactly this, so the page contradicts itself. Consequence: a student who hand-computes T_out = T_in ∓ Q/C will not reproduce the displayed outlets exactly.

**SUSPECT (developer-facing)**
- **Stale citations.** `EpsilonNtuTool.tsx:46-50` and `:109` say the closed forms and the |1−C_r| < 1e-9 switch are in `HeatExchanger.cpp`. They are in `htc/ShellTubeDesign.cpp:147-165`; HeatExchanger only calls them (`:806`). The formulas themselves are identical.
- **C is on a mass basis in the lesson, a molar basis in the engine.** The lesson defines C = ṁ·c_p in kg/s × J/(kg·K) (step 2). The engine forms C = F[mol/s]·Cp[J/(mol·K)] (`HeatExchanger.cpp:793-794`). Both are W/K, so nothing is wrong, but a student comparing against the run log sees a different basis.

**OK-verified**
- All three closed forms (counter-current, co-current, 1-2 shell), and the TypeScript is the same arithmetic.
- C_r = 0 collapse: the shell form reduces to 1−e^−NTU.
- Step 5 numbers: at C_r = 0.5, ε(3) = 0.874 and ε(6) = 0.974, a difference of 0.100. The co-current ceiling is 1/1.5 = 0.667.
- F < 1 for 2N passes is printed (`:1270-1278`).
- The c_p phase switch at vf = 0.5 (`:157`) and the two mean-T passes (`:787-812`).
- The witness: NTU ≈ 2.39 and C_r = 0.833. Water at 2 bar saturates at 393.4 K, which is above the hot knob maximum of 390 K.
- The flow-word refusal (`:116-136`).

## 3. FUG (`fugLesson.ts`, `FugShortcutTool.tsx`, `case/fugShortcut.ts`)

**SUSPECT (developer-facing)**
- **Stale claim about the rigorous column's feed quality.** `fugShortcut.ts:64-66` says "the rigorous column declares `feedQuality 1.0;`". `column02_simultaneous` declares no `feedQuality` and no phase. Its feed, like the shortcut's, is 365 K with nothing declared, and is resolved at its own equilibrium. The bubble point from the case's Antoine is about 365 K, so q = 1 is marginal rather than declared. This comment is not shown to students.

**OK-verified**
- Fenske: the engine's recovery form equals the lesson's mole-fraction form, since D/B cancel (`ShortcutColumn.cpp:143`).
- Underwood θ equation and R_min sum (`:165-233`). The bracket (1, α_LK) is monotone, since the derivative of the sum is positive. The engine refuses a pole inside the bracket.
- Molokanov form of Gilliland (`:269`). Kirkbride with exponent 0.206 (`:274-290`).
- q = 1 − vf on the resolved feed (`:89-90`).
- α frozen at the feed bubble point, and the refusal of α ≤ 1 (`:115-141`).
- x_D from the Fenske distribution, reused at minimum reflux (`:151-160`).
- The stage-count convention, against `DistillationColumn.H:40-47`.
- The CMO list (WangHenke and simultaneous; fullMESH drops it).

## 4. Pinch (`pinchLesson.ts`, `PinchCompositeTool.tsx`, `pinchMoments.tsx`, `case/pinch*.ts`)

**WRONG**
- **The catalogue card describes a cascade the page no longer computes.** `registry.ts:1020` says the tool shows "the in-view cascade cross-checked against the engine's targets". That in-view cascade was removed: `PinchCompositeTool.tsx:237-242` and `case/pinch.ts:29-34` both say the page computes no cascade and reads `problemTable.csv`. Consequence: the card promises an independent check that does not exist.
- **A special case is taught as general.** The step-4 note says "lower ΔT_min far enough and one of the two targets reaches zero — a threshold problem". This is false in general. Counter-example: a hot stream 400→300 K and a cold stream 350→450 K, both CP = 1 kW/K. At ΔT_min = 0, Q_H,min = Q_C,min = 50 kW, and the corrected cascade is zero at 400 and 350 K. So the problem stays pinched at every approach.

**SUSPECT**
- **Contradictory rule for hot versus cold.** The step-1 glosses say two different things decide whether a stream is hot or cold: "(T_supply, T_target) is what decides the stream's kind", and then, for Q, "the sign says hot or cold". For a latent slice (|ΔT| < latentWidth), the engine decides by the sign of Q, not by the temperatures (`PinchPass.cpp:188-193`).
- **The witness-network account mis-counts latent duties.** `processStreams` and `accountNetwork` (`pinchViolations.ts:116-170, 221-232`) take a stream's duty as CP·|T_t − T_s| from the `population.csv` T_in/T_out. For a latent slice the engine sets CP = |Q|/latentWidth while |T_out − T_in| < latentWidth (`PinchPass.cpp:194-196`). An isothermal condenser therefore carries about zero duty in the account. The classroom witness has none, but a "Current run" source with a phase change would break the identity residual that is shown.

**OK-verified**
- Problem table: shifted T* = T_hot − ΔT_min/2 = T_cold + ΔT_min/2 (`PinchPass.cpp:388-401`). The interval ΔH, the cascade, Q_H,min = −min, Q_C,min = cascade + Q_H,min (`:414-450`).
- The class word comes from interior zeros (`:470-486`). T_pinch_hot = T* + ΔT_min/2 and T_pinch_cold = T* − ΔT_min/2 (`:790-792`).
- The identity Q_H,min − Q_C,min = ΣΔH_cold − ΣΔH_hot.
- The three-face excess identity, and the KPI names (`:815-816`).
- Exchangers are entered as recovered heat and are not counted in current utility (`:205`).
- Units: everything is W internally, and every CSV and KPI is divided by 1e3 to kW and kW/K. Temperature differences take no °C offset (`displayUnits.ts:380-386`).
- The W-not-kW note in A = Q/(U·ΔT_lm).
- The supertargeting cost expression is correct.
