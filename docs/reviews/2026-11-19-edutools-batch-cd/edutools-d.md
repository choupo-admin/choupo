# EduTools review, batch D: reactionEnthalpy, standardState, vanHeerden, approachToEquilibrium

The tree is the detached `main` at `.../edu2/tree`. All four registry ids match their topics (`registry.ts:1243, 1263, 1283, 1416`). I recomputed every number below from the golden files, the catalogue records or exact algebra.

## 1. reaction-enthalpy (`reactionEnthalpyLesson.ts`, `ReactionEnthalpyTool.tsx`)

**WRONG**
- **Step 5 overgeneralises the engine.** `reactionEnthalpyLesson.ts` step 5 says "This is how every Choupo reactor closes its energy balance", and that a reactor evaluates its reaction enthalpy "at the reactor's own temperature".
  - `batchReactor` resolves dH once, at the charge temperature (`BatchReactor.cpp:343`, `state_.T`). In adiabatic liquidDH mode it integrates `-Σ r·V·dH / Cp` on that frozen value (`:578`, `:584-590`). The engine itself says this is "a FROZEN-dH surrogate ... not the canonical H surface" (`BatchReactor.cpp:804-812`).
  - `dynamicCSTR` behaves the same way off its canonical route (`DynamicCSTR.cpp:319`, `:841`).
  - Consequence: a student believes every reactor prices its streams on the formation datum. Two time-integrated reactors do not.
- **The provenance mark for the red line is false.** `ReactionEnthalpyTool.tsx` OriginMark reads "blue and red: the witness run in this browser". The red line is the typed constant `BASE_DATA_DH = -46.1` (`:63`), not engine output. Consequence: a quoted value is presented as a computed one.

**SUSPECT**
- **The note on step 4 points to a directory that does not exist.** It credits the 27.98, 20.48 and −7.50 kJ to "the witness's own constant/components". The witness has no `constant/components`. Its records are the catalogue files `data/standards/components/{N2,H2,NH3}.dat`, pinned by `constant/propertyManifest`. The numbers themselves are right: I recomputed 27.978, 20.479 and −7.499 kJ from those polynomials.
- **The page prints two different percentages for one claim.** The tool computes "under-states by 13.7 %" from the typed −46.1. The prose says 14 %, computed from the engine's −45.94.

**OK, verified**
- Golden values: −45.94, −48.07, −52.68 and −53.44 kJ/mol NH₃.
- Percentages: 16 % = 53.44/45.94 − 1; 14 % = 7.50/53.44; "4 %" at 400 K is 4.4 %.
- Step 6 check: −21 J/K, then −9.98 kJ, then −55.88 kJ.
- Kirchhoff, Hess, the derivation and the ΔT_ad form (ΔH taken at T_in, outlet c̄p) are correct.
- Citations hold: `ReactionHeat.cpp:42` (Σν·h at 1e5 Pa, standard phase) and `PFR.cpp:502`.

## 2. standard-state (`standardStateLesson.ts`, `StandardStateTool.tsx`)

**WRONG**
- **Step 9's derivation states a sign error.** It says "Substitute and multiply by −T (positive)". −T is negative, which is exactly why ΔS_tot ≥ 0 becomes ΔG ≤ 0. Consequence: a student learns the wrong reason the inequality flips.
- **Step 7 presents the gas route as the whole method.** It says "Choupo prices every stream on the elements datum, and the formula below is the whole of it" (Δ_fH° + ideal-gas rise + EoS residual). Its note adds "each record's formation enthalpy is the ideal gas's".
  - Counter-example in a record: `glucose.dat:54` declares `referenceState pureSolid`. It is a component of the reaction-enthalpy witness.
  - Counter-example in code: liquids and electrolytes are priced by other routes, such as the aqueous ion reference and the crystal + ΔH_soln route (`ThermoPackage.cpp:1697-1740`). None of them goes through `H_real`.
  - Consequence: a student generalises a pure-gas formula to every stream.

**SUSPECT**
- **Step 9's symbol table contradicts itself.** H is glossed as "total, not molar, when the system is the whole reactor", but its unit is given as kJ/mol. V (m³/mol) has the same problem.

**OK, verified (all against the golden and the shipped CSV)**
- Step 1 differences: 20.64, 1.29 (reference 1.38), 1.69 (reference 1.73).
- Residual at 1 bar: 0.48 J/mol at 300 K and 1.49 J/mol at 733 K.
- Converter state: 12.73 + 0.23 kJ/mol (reference 0.26), so 1.8 %.
- SRK against the reference: −6 % at 300 K / 1000 bar, −33 % at 300 K / 100 bar, −11 % at the converter.
- Methane h^R(298 K, 1 bar) on SRK: my own SRK gives −16.6 J/mol, matching the page's "about −17".
- (∂h/∂P)_T = v(1 − Tα_P) is correct. The claim that H₂ has a positive derivative above about 200 K matches its Joule-Thomson inversion.
- Gibbs-Helmholtz, van 't Hoff and a = φyP/p° are correct.
- Citations hold: `Component.cpp:1689`, `ThermoPackage.cpp:1517`, `PropertyPoint.cpp:101`.
- Infinite-dilution and Henry standard states are not covered, and the page says so explicitly (step 3). Not a defect.

## 3. vanheerden (`vanHeerdenLesson.ts`, `VanHeerdenTool.tsx`)

**WRONG**
- **Step 5 states a geometric rule that is false in general.** It says that UA and flow "tilt the line steeper, and a steeper line cuts the sigmoid fewer times". Take an adiabatic line pivoting on (T_in, 0) against one sigmoid:
  - a nearly flat line crosses once (hot);
  - a medium slope crosses three times;
  - a steep line crosses once (cold).
  - Steepening from flat therefore adds crossings. The note's own closing sentence ("cannot be read off either curve alone") contradicts the body.
  - Consequence: a student predicts the multiplicity backwards for a reactor running hot.
- **Both step 1 CSTR.cpp citations are stale.**
  - `CSTR.cpp:404-415` is the reverse-rate lambda. The order refusal is at `CSTR.cpp:424-438`.
  - `CSTR.cpp:784-795` is a comment. The root audit itself is the lambda at `:898`, called at `:1005` and `:1262`.

**SUSPECT**
- **Step 5's "B is about 1.5" fits a different case than the one it names.** The page names `cstr06_jacketed`, which has Ea = 70 kJ/mol and T_in = 350 K. With ΔT_ad ≈ 11 K that gives B = 70000·11/(8.314·350²) = 0.76. The 1.5 is `cstr05`'s value (Ea = 100 kJ/mol, T_in = 300 K, ΔT_ad = 10.7 K, so B = 1.43). The conclusion still holds, since either value is below 4.6.

**OK, verified**
- R − G = φ is an identity, and it matches the engine (`CSTR.cpp:1065-1080`: G = H_in − H(T_in, x), R = H(T, x) − H(T_in, x) − Q_ext).
- The textbook forms G = (−ΔH(T_in))ξ and R = Fc_p(T − T_in) + UA(T − T_c) agree with the sign of Q_ext.
- The slope test is correctly called necessary, not sufficient. Tangency at ignition/extinction and hysteresis are stated correctly.
- The multiplicity bound B > 4γ/(γ − 4) is right: I checked it by bisection on the Da(θ) monotonicity for γ = 31.86 and got 4.5743.
- Witness numbers: B = 6.48 against a bound of 4.57; roots 292.43, 302.61 and 336.55 K; 24 % = 57.8/~46.6.

## 4. approach-to-equilibrium (`approachToEquilibriumLesson.ts`, `ApproachToEquilibriumTool.tsx`)

**WRONG**
- **One citation in step 4 is stale.** "the isothermal reactor calls it at 375" is wrong: the call is at `GibbsReactor.cpp:425`, and line 375 is a comment about enthalpy surfaces.

**SUSPECT**
- **Step 4's ΔH_rxn gloss gives the wrong basis.** The unit is given as "J/mol", per mole of reaction in the van 't Hoff sense. What the engine reads is `dH_kJ_per_kmolFeed` = (H_eq − H_in)/N_in, which is per mole of feed (`GibbsReactor.cpp:103`). The sign is the same; the basis is not.
- **Step 4's formula uses ΔT two ways.** It writes "ΔT < 0 (endothermic)", while the page and the engine define ΔT as a magnitude ≥ 0 that is applied as T − ΔT.
- **Step 6's "three places" omits one.** It says the temperature form exists in three places. The `pfr` also publishes the measured approach `approach_K = T_eq − T_out` (`PFR.cpp:1418`), which is the plant reading of step 8, and it is signed.

**OK, verified**
- Citations:
  - `GibbsReactor.cpp:320-326` (b = A·n_feed, and the refusal of an element the feed lacks).
  - `GibbsReactor.cpp:338-344` (negative magnitude refused).
  - `GibbsReactor.cpp:69-162` (`approachDirection`).
  - `GibbsReactor.cpp:408-418` (the announcement and the three caveats).
  - `GibbsReactor.cpp:573-584` (adiabatic probe).
  - `GibbsReactor.cpp:749-755` (Q_kW).
  - `ElementPotential.cpp:47-48` and `:61` (Psat at T).
  - `GibbsMethod.cpp:64-94`, `EquilibriumReactor.cpp:723-821, 877, 940-944, 951`, `CatalystPellet.cpp:50-54`.
- The two-run equivalence is exact for an ideal gas: the ln(P/P0) term does not depend on T, and both witnesses run at 1 bar with `fugacityModel idealGas`.
- gibbs10's 32.4 % NH₃ matches its golden (0.32387).
- "50 °F ≈ 28 K" is right (27.8 K).
- The sign rule follows van 't Hoff correctly.
- Step 7 (three beds in series are one Gibbs reactor) is right because b is conserved and the outlet is a state function. It assumes no pressure drop between beds, which the page does not state.
