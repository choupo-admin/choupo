# EduTools review, batch F: chromatography, fluidised beds, syngas, limiting reactant

The tree is the detached main at `.../edu2/tree`. Paths below are relative to it. I opened every engine line the lessons cite. I re-ran the TS modules (chromatography.ts, fluidisedBeds.ts) in node from copies in `run-f/`, and checked the claims against case files and goldens. All four registry ids are what they should be (registry.ts:1306, 1396, 1513, 1541).

## 1. Chromatography (chromatographyLesson.ts, ChromatographyTool.tsx, case/chromatography.ts)

**WRONG**: none found.

**SUSPECT**
- case/chromatography.ts:385-387. A comment says the step bound `2v/dz + 4D/dz² + k(1+k')` is "the Gershgorin bound the engine prints for its own explicit route". The engine prints 6u/dz for the advection term under vanLeer (FixedBedAdsorber.H:76-79), and the page's integrator runs MUSCL with 2v/dz. A student never sees this comment, so the only effect is that a reader of the code is misled.
- ChromatographyTool.tsx:233. The comment says each slice takes "about 12 ms", but the code allows 16 ms (line 238). Cosmetic.

**OK-verified**
- Retention: k' = ρ_b K_c/ε = (1−ε)K/ε with K = ρ_p K_c, and t_R = t0(1+k') with t0 = εL/u. The units check: K_c = H·RT/1e5 comes out in m³/kg (case/chromatography.ts:65-67).
- The engine note holds: R_f = ε + ρ_b q*/c_in and t_st = (L/u)R_f (FixedBedAdsorber.cpp:873-874 and :1025-1027). For a straight isotherm, R_f = ε(1+k').
- Plate model: the Erlang density has mean t_R and variance t_R²/N. The Gaussian and c_max = m/(σ√2π) are right, and m = c_inj·t_inj in mol·s/m³.
- Van Deemter: I re-derived H = 2D_L/v + 2k'v/(k(1+k')²) from the LDF moments. A = 2λd_p (m), B = 2γD_m (m²/s) and C (s) all have the stated units. v_opt = √(B/C) and H_min = A + 2√(BC).
- An upwind grid adds H = Δz. The engine says the same (FixedBedAdsorber.H:305-307 and :86).
- The closed-closed variance 2/Pe − 2(1−e^−Pe)/Pe², the LDF variance 2k'L/(vk) and the injection variance t_inj²/12 are all right.
- Claims about the engine:
  - `constantVelocity` is the default (FixedBedAdsorber.cpp:218).
  - Carrier make-up is booked (.H:108-111).
  - vanLeer is the default and upwind is declared in the page's case (.H:313, chromatography.ts:624).
  - The KPIs t_stoichiometric_* and Pe exist (.cpp:3214, :3298).
- Resolution:
  - R_s = Δt/(2(σ1+σ2)).
  - R_s = 1.5 puts the centres 6σ apart, with a 0.135 % tail at 3σ.
  - R_s = 1 leaves a 2.3 % tail.
  - At the defaults, the rule "R_s grows as √L" is accurate: L for R_s = 1.5 is 1.411 m, and the exact R_s there is 1.503.
- Langmuir: b = K_c/q_s, and dq*/dc < K_c. The descriptions of the shock, the tail, the displacement effect and the tag-along effect are physically correct.
- "Within about two percentage points of 800 cells" (Tool:806): measured at 99 % target. The largest gap is 2.2 points (load 0.4: 53.2 % against 55.4 %).

## 2. Fluidised beds (fluidisedBedsLesson.ts, FluidisedBedsTool.tsx, case/fluidisedBeds.ts)

**WRONG**
- Group C is called "bubbling" on the main page, which contradicts step 2 and the page's own laboratory.
  - Where it happens: regimeMap sets u_mb = u_mf for every group except A (fluidisedBeds.ts:388-396), and the Tool prints "= u_mf: a group ${group} powder bubbles as it fluidises" (FluidisedBedsTool.tsx, the u_mb row of the step-3 table).
  - With the page's own "fine powder" preset (15 µm, 1200 kg/m³, which geldartGroup classes as C) at the default u = 0.2 m/s, step 3 reads **"bubbling"**. Step 4 then builds a bubble bed for it (ψ = 31 % bypass, H/L_mf = 1.25).
  - Step 2 (lesson:112-114) says a group C powder "does not fluidise properly".
  - The laboratory tab draws the same powder as "cohesive: not animated" (fluidisationLab.ts:357, held by fluidisationLab.test.ts:231).
  - For a student: two surfaces of one tool disagree about the same powder, and the main page gives a bypass fraction for a bed the lesson says does not form.

**SUSPECT**
- Choosing a gas changes only M. The viscosity stays at 18 µPa·s, which the page calls "a typical value for air". If a student picks helium (about 19.6 µPa·s, so close) or a hot gas, nothing prompts them to change μ (Tool, gas Select and μ input). The page does say the viscosity is typed, so this is a pedagogy risk rather than an error.
- Step 4's note says "small bubbles in a shallow bed of fine powder renew it many times". At the same u, the page's own numbers give the finer catalyst-like powder fewer renewals than sand (1.42 against 4.80) because its u_mf is smaller. The sentence holds for small bubbles, but a student may read it as a statement about fine powders.

**OK-verified**
- Ergun is written in the same form as the engine's (PFR.cpp:1731-1732).
- The step-1 force balance and its division by ρ_g d³/(μ²(1−ε)) give 1.75Re²/ε³ + 150(1−ε)Re/ε³ = Ar.
- Wen-Yu: C_2 = ε³/1.75 gives ε = 0.415, and at that ε the quadratic's C_1 would be 25.1, not 33.7. So the claim that "C_1 then matches no sphere" holds.
- Terminal velocity: C_D Re² = (4/3)Ar. The Schiller-Naumann law and its 0.44 switch match PneumaticConveyor.cpp:48-52, and the engine does iterate from Stokes (.cpp:99).
- Stokes, Abrahamsen-Geldart (u_mb = 7.23 mm/s for the catalyst preset, which I recomputed by hand), Bi-Grace and Mori-Wen are all right. Mori-Wen's cm/cm²/s conversions are right (fluidisedBeds.ts:430-436).
- K_bc in cgs, the Davidson cloud ratio 3u_f/(u_br − u_f), u_b, δ, H = L_mf/(1−δ̄), and ψ = ((u−u_mf)/u)·e^(−∫K_bc/u_b dh) are all right.
- The exercise answers are right: ×4 and ×√2 when the diameter doubles, a ΔP that stays flat above u_mf, and u_mf ∝ ρ_g^(−1/2) for coarse particles.

## 3. Syngas (syngasLesson.ts, syngasExercise.ts, SyngasTool.tsx)

**WRONG**
- syngasLesson.ts:309-313 says "the host case's isotherms rank them CO2 >> CH4 > CO ~ N2 >> H2". The host's records are data/standards/parameters/adsorption/equilibria/zeolite5A/*.dat. At the bed's 313 K (psa01 flowsheetDict:62), their Henry slopes q_max·b(T) are CO2 16.2, **CO 1.54, CH4 0.87**, N2 0.55 and H2 0.045 mol/(kg·bar). b_298 is 0.85 for CO against 0.40 for CH4. So CO is held more strongly than CH4, and CO is nowhere near N2. Methane breaks into the product first (at 3 bar) because it has the larger feed share (5 % against 4 %), not because it is held more strongly. With the competitive Langmuir and w = 2, η = 0.8, the capacity/availability ratio at 3 bar is 0.57 for CH4 and 1.00 for CO. A student would draw the wrong conclusion about CO.
- syngasLesson.ts:62-63 says "Every exercise on this page reports both [H2/CO and M]". It does not: COLUMNS.cleaning is purity and recovery only, and COLUMNS.pressure has no module (syngasExercise.ts:610-615). The Tool draws exactly COLUMNS (SyngasTool.tsx:256).

**SUSPECT**
- "Four routes, one methane" (SyngasTool.tsx:347) and "compares the routes on the same methane" (lesson:176). The routes run on two hosts: steam and CO2 reforming are isothermal at 1000 K on 1 kmol/h in gibbs11, while partial oxidation and ATR are adiabatic on 2 kmol/h at 525 K in screen01. The ratios are intensive, but the conditions are not the same.

**OK-verified**
- Every equation balances (steps 2, 10, 14 and 15, including C3H6 + CO + H2 → C4H8O).
- The module identity M = (3a + h − c − 2o)/(a + c) is right, and so are the slip and carbon corrections. I recomputed the partial-oxidation case: (3 − 1 − 3·0.085)/0.915 = 1.907, against the quoted 1.908. ATR gives 3 − 2·0.6 = 1.8. CO2 + 3H2 gives exactly 2. Carbon deposition raises M above 3 (quoted 3.838).
- The ideal-gas K with P², the van 't Hoff signs, the activity identity ln a_C = Σπ_k A_kC − g_C/RT, and a_C = K p_CH4/p_H2² are right.
- Every cited line matches the text it is cited for:
  - GibbsReactor.cpp: 181, 182-185, 226-229, 514 and 755. Line 743 confirms that an adiabatic run publishes no Q.
  - GibbsSolidPhase.cpp: 102-107 and 231.
  - EquilibriumReactor.cpp: 63, 64, 86-90, 105, 121, 200 and 1062.
  - PSA.cpp: 196, 205-206, 225, 248 and 314-315.
- The 50 bar and 150 bar declared in the named 0/ files are right.
- The unit conversions are right: mol/s × 3.6 gives kmol/h, and Δq·w·F has kmol/s units.

## 4. Limiting reactant (limitingReactantLesson.ts, LimitingReactantTool.tsx)

**WRONG**
- Step 4 and step 6 (lesson:179-199 and :265-268) quote a converter inlet of 3.589 and X = 0.355, as if these were the case's present values. The tool's default does the same: "Start where the green ammonia case sits ... 35.5 % conversion" (Tool, the "Now move it" text). The shipped golden (tutorials/plant/ammoniaPEQ_baseCase/expected:76-88) gives something else:
  - From the expected values N_in = 5435.410, N_out = 4622.170 mol/s, y_N2 = 0.163387 and y_H2 = 0.636942 (all gas): ξ = 406.62 mol/s, N2 in = 1161.82, H2 in = 4163.91.
  - So **r_in = 3.584 and X = 0.350**.
  - The page dates its numbers to 2026-10-02, but it states them in the present tense and as the slider default. The test pins only the text (limitingReactant.test.ts:77).
- The tool says "a 0.2 % purge", and the lesson says "the loop throws away about 0.2 % of its unreacted gas". The case's PurgeSplit declares `fractions ( 0.00085 0.99915 )` (PurgeSplit/system/flowsheetDict:8), and Purge/UnreactedGas = 0.003235/3.8053 = 0.085 %. With the case's real p, the closed form predicts a shift of 3·1e-4·0.3506/0.00085 = 0.124, not 0.053. So the agreement with the case's 0.057 rests on a p that is not the case's purge, and the page does not say what its 0.2 % is (perhaps all the loss streams lumped together).

**SUSPECT**
- The tool's no-steady-state alert says "B accumulates as a deficit pass after pass". When the fresh feed is short of B, the reactant in surplus, A, is what builds up in the loop. Step 2 of the lesson says so itself.

**OK-verified**
- Re-derived by hand:
  - F_A,in = F_A,f/D with D = X + p(1−X).
  - F_B,in = νF_A,f(ε/p + 1/D), so r_in = ν(1 + εD/p).
  - The bound is ε ≥ −p(1−X)/D.
  - ρ_B = r_in/(νX) − 1, which gives 2.37 on the page's own numbers.
- The page's prediction of 0.0534 is right, given the page's inputs.
- The feed numbers are right:
  - H2 = 4410 kmol/h.
  - N2 = 1469.853 kmol/h with Ar = 0.147, which is 100 ppm, so H2/N2 = 3.0003 and ε = 1e-4.
  - The exact-3 H2 = 4409.559 kmol/h.
- purgeLoop matches the closed form, and bLostFraction = p·B_left/B_fresh.
