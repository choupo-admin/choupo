# EduTools review, batch H: tear, wegstein, relaxation, reactorLadder

Tree: detached `main` at `.../edu2/tree`. All paths below are relative to it. I recomputed in node, on copies in `.../edu2/run-h/` (`t1.ts` = tearMath, `pfr.mjs` = the PFR ODE). No native binary was available, so the engine claims come from reading the source and the goldens.

Registry check (`gui/src/ui/methods/registry.ts:1746,1760,1777,1211`): the topics are `tear-streams`, `relaxation`, `wegstein` and `reactor-ladder`. **reactorLadder is not a CSTRs-in-series / tanks-in-series lesson.** It is "stoichiometry → equilibrium limit → rate" on the water-gas shift, with five reactor models fed from one split feed (`tutorials/steady/reactors/ladder01_wgs_three_rungs`). I reviewed it as that. There is no N-tank formula to check.

---

## 1. reactorLadder (`reactorLadderLesson.ts`, `ReactorLadderTool.tsx`)

**WRONG: the 550 K "rate binds" claim is the old liquid-basis result.**
- Where it appears:
  - `reactorLadderLesson.ts:250-252` ("the limit rises to 0.884, but the same bed delivers only 0.866")
  - quiz `rate-binds`, `:426-441`
  - T-knob text, `ReactorLadderTool.tsx:127` ("At 550 K the same bed no longer reaches the limit")
  - header measurement, `:30` (pfr 0.8656 at 550 K)
- Since DEV.md C421 (2026-11-18), the PFR prices a gas feed at Q = F·RT/P. The page's own limit `volume-is-a-shape` (`:306-316`) and the case header both say so, and the golden records `source kinetic vapourVolume kernel.vapourVolume.equationOfState`.
- I recomputed the bed from the case's own data: A = 1e6, Ea = 8e4, V_R = 0.01 m³, F = 0.4/3.6 mol/s, 10 bar, K from the published limits. It reproduces the golden exactly at 600 K: Da_kTau 1.9578, τ 18.04 s, X 0.841432775.
- At 550 K the same integration gives k·C0·τ = 54 and **X = 0.8835028, against a limit of 0.8835029**. The bed reaches equilibrium to 1e-7, so "the rate binds at 550 K" and "hot beds are limited by equilibrium, cool beds by the rate" are not what this witness now shows.
- Consequence: the student moves the slider to 550 K, sees PFR = limit, and the page (and the quiz's correct answer) says the opposite.

**SUSPECT: §5 calls it "this liquid-basis PFR" (`:241-243`) while the page's own limit says gas basis.**
- The refusal it cites, `PFR.cpp:223-224` (`refuseLiquidBasisDetailedBalance`), does exist and fires for Σν ≠ 0.
- Its rationale comment, `Reaction.cpp:106-107` ("cstr/pfr's F/Q is LIQUID mol/m³"), is also stale since C421. The engine label and the page label drift together.

**SUSPECT: the header's measured pfr X at 600 K (0.84143272012, `:27`) differs from the golden (0.841432775225).** It is within tolerance, but it is a second C421 leftover.

**OK-verified:**
- K(600) = 28.15866; √K = 5.3065; X_eq = √K/(1+√K) = 0.84143.
- X_eq = 0.884 → 0.754 from 550 to 700 K.
- Gibbs y_CO2 = X/2 = 0.42072. Δν = 0, so K_c = K_p.
- K at T+ΔT for an exothermic reaction; the 50 K approach equals the 650 K limit.
- Citations checked and correct:
  - `ConversionReactor.cpp:216-219, 221-239, 230-233` (bounds check only 0 ≤ X ≤ 1 and that no outlet goes negative; there is no equilibrium cross-check)
  - `EquilibriumReactor.cpp:746-789`
  - `PFR.cpp:221-229` (k_rev = k/Kc)
  - `Reaction.cpp:104-112`
- Rate-law units are consistent: k in m³/(mol·s), C in mol/m³, r in mol/(m³·s).

---

## 2. tear (`tearLesson.ts`, `TearStreamsTool.tsx`, `tearMath.ts`)

**WRONG: the "shared" graph blurb (`tearMath.ts:~150`) says "Move the reactor above the mixer and watch the tear count fall to one."**
- I ran `judgePlan` on the order with the reactor moved above the mixer (1,0,2,3,4). It gives **three** tears: toReactor, longRecycle and shortRecycle.
- One tear needs the mixer moved last (1,2,3,4,0), which gives toReactor only. `bestOrder` finds that order, so the test at `tests/tearMath.test.ts:151` passes, but the instruction is wrong.
- Consequence: a student who presses ↑ on the reactor once (`TearStreamsTool.tsx:398`) sees the count go from 2 to 3.

**SUSPECT: stale citations in the module's comments.**
- `tearMath.ts` cites `:4457-4463`, `:4468-4470`, `:4477-4484`, `:4488-4491`, `:4554-4559`, `:4425-4457`, `:4459-4512`, `:4473`, `:4823-4832` and `:2752-2757`.
- The real code is at `Flowsheet.cpp:5078-5195` (refusals), `:4987` (`validateSequentialPlan`) and `:2681-2689` (the leading sentence).
- The comment "CLAUDE.md lists six and omits UNCONSUMED TEAR" is false: CLAUDE.md lists all seven.

**OK-verified:**
- Backward ⇔ pos(consumer) ≤ pos(producer) (`Flowsheet.cpp:5127-5129`).
- All seven refusal names and their messages match `Flowsheet.cpp:5078-5195` verbatim. MISSING TEAR quotes the cycle; INVALID ORDER prints a valid order.
- n_W = N_t(N_c+3) (`Flowsheet.cpp:1844-1878`). The gridded-solids class flows appended there are an unmentioned special case.
- n_N = N_t(N_c+2) (`:3741-3750`). 2·(5+2) = 14 sweeps per extra tear.
- Central finite differences (`NewtonND.cpp:190-259`).
- The 0/ read at `:2295` and the plan validation at `:2681` both come before any unit is solved.
- The default is Newton (`:3349`).

---

## 3. wegstein (`wegsteinLesson.ts`, `WegsteinTool.tsx`, `wegsteinMath.ts`)

**SUSPECT: "line-for-line transcription of Wegstein::step, both degeneracy guards" overstates the copy.**
- Where: limit `no-q-published` and `wegsteinMath.ts` header. Step 6 also says "two further cases are caught by name".
- `Wegstein.cpp:84-88` has a third guard: a positive entry (the pressure) whose secant fixed point x* = (g − s·x)/(1 − s) is not positive gets q = 0. `wegsteinStep` omits it.
- It is harmless on the (F, T) toy, but the claim is false, and step 6 under-describes the engine.

**SUSPECT: stale or wrong citations.**
- Step 4 cites "Wegstein.cpp:83, :85" for the update form. Line 85 is a brace; the update is `:92`.
- Step 8 cites `Flowsheet.cpp:3639` as the stopping test. That line computes `normL2`; the comparison is `:3675`.
- Step 6 cites `:3540-3541` for the defaults; they are at `:3539-3540`.
- Step 2 cites `:3747` for the pressure; it is at `:3748`.

**SUSPECT: the step-2 gloss "P … unit bar" covers both rows of the formula.** The Newton vector packs P in **Pa** (`Flowsheet.cpp:3748`, `v.push_back(s.P)`); only the Wegstein vector uses bar (`:1859`). This is harmless after the Newton scaling, but a student told "bar" for the Newton row is told something false.

**SUSPECT: limit `clamp-not-driven` quotes a dated count ("ten cases select Wegstein, two declare the clamp live").** Today 7 cases select Wegstein and 4 declare it live (swro01 −5, rankine02 0, evaporator05 −0.7, membrane27 −100). The reasoning still holds for process03.

**SUSPECT: `wegsteinMath.ts` `driveDirect` says direct substitution "is not a separate method in the engine".** `recycleSolver directSubstitution` exists (`Flowsheet.cpp:3362`), and the relaxation page teaches it.

**SUSPECT (pedagogy): "Wegstein is the default recycle accelerator of every sequential-modular simulator"** (step 4 note; relaxation step 5). "Every" is unverifiable, and Choupo, an SM simulator, defaults to Newton.

**OK-verified:**
- s = Δg/Δx (`:78`); q = s/(s−1) clamped (`:83`).
- 0 < s < 1 gives q < 0; −1 < s < 0 gives 0 < q < ½; s > 1 gives q > 1. s = 0.9 gives q = −9 and a tenfold step.
- The reach is (1 − q): ×2 at q = −1, ×6 at q = −5. G = 2x − 2 from x = 5 goes to 8 by direct substitution and to 2 by Wegstein.
- The guards are 1e-14 (`:72-75`) and 1e-10 (`:79-80`). The class default is [−5, 0] (`Wegstein.H:74-75`); the recycle default is [−1, 0].
- Affine invariance of s is correct.
- The Wegstein test is an unscaled L2 norm (`:1950-1958`), Newton is scaled (`:3805-3824, :3847`), and the quote at `:3807-3808` is verbatim.
- The renormalisation is at `:1913` and the phase proxy at `:3930-3931`.
- The witness process03 declares Newton, tol 1e-5 and maxIter 120, so every override replaces an existing key.

(Engine-side note, outside the page: the `Wegstein.H:46-55` comment says "positive q would amplify the slow direction". That is wrong; positive q damps, and the lesson has it right.)

---

## 4. relaxation (`relaxationLesson.ts`, `RelaxationTool.tsx`, `relaxationMath.ts`)

**WRONG: step 8 (`:285-294`) says that for all the knobs it lists, including `recycleWegsteinQmin/Qmax`, "a declared value is announced in the run log; a value outside its range … is refused by name."**
- The clamp keys are read at `Flowsheet.cpp:3539-3540` with no announcement and no range check.
- `Wegstein::Wegstein` (`Wegstein.cpp:36-39`) checks nothing either.
- `qmin > qmax` reaches `std::clamp` (`Wegstein.cpp:83`), which is undefined behaviour in C++.
- Only `recycleRelaxation` (`:3400-3418`) and `recycleMaxStep` (`:3865-3879`) behave as described.
- Consequence: a student trusts that a mistyped clamp would be caught, and it is not.

**SUSPECT: the step-4 formula "w_opt ≤ 1 ⟺ a ≤ 0" (`:192`) is stated without its domain a < 1.** For a > 1, w_opt = 1/(1 − a) < 0 is also ≤ 1, which is the case step 3 itself discusses. The same applies to the `relaxationMath.ts` header.

**SUSPECT (pedagogy): step 7 says "a unit's own equations … are solved coupled by Newton with a line search."** That is a special case presented as general. Rachford-Rice, the Wang-Henke bubble-point column and the Nelder-Mead LL flash (CLAUDE.md §9) are not.

**OK-verified:**
- a_eff = 1 − w + w·a.
- Contraction ⇔ 0 < w < 2/(1 − a) for a < 1; no w > 0 works for a ≥ 1.
- a = 2, w = −1 gives a_eff = 0.
- w_opt = 1/(1 − a).
- Wegstein's q = 1 − w; the default clamp [−1, 0] means w ∈ [1, 2], so Wegstein never under-relaxes.
- The Newton step on the toy lands in one step.
- The relaxed update is at `Flowsheet.cpp:3676-3681`; the refusal and announcement at `:3400-3418`; Armijo at `NewtonND.cpp:619` and `Flowsheet.cpp:3859`.
- OpenFOAM's 0.3 (p) and 0.7 (U) are the standard factors.
