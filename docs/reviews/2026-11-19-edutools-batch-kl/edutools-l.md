# EduTools review, batch L: solventMixture, equilibriumLandscapes, batchMembrane, lubScaleup

Tree: detached main (HEAD 2026-11-19). Read-only. No engine build was available, so every finding below rests on source lines, witness goldens or exact algebra. All four registry ids match their topics (`solvent-mixture` registry.ts:2499, `equilibrium-landscapes` :1333, `batch-membrane` :1567, `lub-scaleup` :1496).

## 1. solventMixture (Hansen) -- solventMixtureLesson.ts, SolventMixtureTool.tsx, solventMixtureRead.ts

**WRONG**
- Step 7 (solventMixtureLesson.ts:215-217) says the hexane+nitromethane line is "on paper, a better blend than the first". That is false by the engine's own numbers. On a continuous scan, the rule's best for nitromethane is RED 0.754 (Ra 5.399, x = 0.6). solvent02's own header says the same. The acetone blend's minimum is RED 0.660 (golden `hexaneAcetone RED_min 0.659789`). By the rule alone, the first blend is the better one. *Student consequence:* the page's punchline ("the rule likes it more, the liquid refuses") is built on a comparison that runs the other way.

**SUSPECT**
- Step 6 (:191) says acetone sits "just at its edge". Its golden RED is 6.638/7.159 = 0.927, which is inside, and the case header itself says "just inside its edge".
- Step 5 (:156-157) says "a negative minimum tangent-plane distance means a second liquid". The code tests `tmMin < tmTol` with tmTol = -1e-3 (StabilityTest.H:98, StabilityTest.cpp:221). A tm between -1e-3 and 0 is called homogeneous.

**OK-verified**
- Factor 4 on dispersion (HansenMixture.cpp:123).
- Volume-fraction mixing (:404-406).
- Mole/mass to volume conversion through Vliq (:437-447). The formula in step 7 matches.
- Teas fractions, and RED only where R0 exists.
- Conversion factor sqrt(4.184e6): 7.24 x 2045.5 = 14809, which matches nHexane.dat.
- Synthetic arithmetic: pure ends Ra 6 = sqrt(4+16+16), midpoint Ra 2. Golden matches.
- Nitroethane RED 1.39 and cyclohexane 1.06 (golden).
- Every Component/HansenMixture/StabilityTest citation lands on its statement.
- The refusal logic for twoPhase points (:423).
- "Survivors all outside": rule-inside x = 0.30-0.80, and all of those are twoPhase.

## 2. equilibriumLandscapes -- equilibriumLandscapesLesson.ts, EquilibriumLandscapesTool.tsx

**WRONG**
- Step 6 (:336-345), limit `biological-routes-at-the-datum-only` (:457-462) and the Tool caption (EquilibriumLandscapesTool.tsx:589-592) all say "glucose.dat has no Cp on any rung", so the sugar route at 310.15 K refuses with "h_formation liquid leg needs liquidHeatCapacity". That is stale. data/standards/components/glucose.dat:74-79 now carries a `liquidHeatCapacity` (Kishore 1993, Trange 298.15-327.01 K). Component.cpp:1251-1270 sends the solid leg to that Cp, announced, and s_formation does the same (:1380-1382). ReactionGibbs `price` (ReactionGibbs.cpp:97) would therefore price the route at 310.15 K instead of refusing. The witness header (landscape06 propsDict:52-59) carries the same stale claim. *Student consequence:* a "refusal, not a choice" is now a choice. The honest caveat is different: the price would use an aqueous partial-molar Cp for a crystal.
- Stale Component.cpp citations in step 6:
  - ":1128, 1263" for h_formation/s_formation point at PC-SAFT association code and a warning string. The real lines are 1227 and 1362.
  - ":1224-1227" for the refusal: the throw is at 1243.
  - ":1656-1668": requireIdealGasRung starts at 1665.

**SUSPECT**
- Step 3 body (:184-187) says combustion is "exothermic at every cell". The tool's own measured header (Tool.tsx:76-77) records "combustion 123 exothermic + 1 undetermined". Step 3's note (:212-213) says "four of the five witnesses the tally is unanimous". The body contradicts its own note, and the tally the readout draws will show 1 undetermined.
- Tool code-comment citations are stale:
  - "GibbsMapOp.cpp:249-255" for the anchor naming: it is at :309.
  - "109-118" for the negative-magnitude refusal: it is at :135-144.

**OK-verified**
- GibbsMapOp citations: 107-110, 135-144, 149-157, 159-165, 168-213, 220, 231-269, 319-343.
- ElementPotential 47-48, 54-65, 71.
- GibbsReactor 69-164 and 156-161; TemperatureApproach.H:93 (s = -sgn dH); Reaction.cpp:137-149; Formula.cpp:485-496; EquilibriumReactor reaction list.
- The van 't Hoff and K_y = K(P/P°)^-Δν signs for all five systems.
- Both biological equations balance (C, H, O, N, and 24 e-/6 e-).
- Haber-Bosch ΔG° changes sign between 298 K and 700 K (+54.3 kJ, Tool header).

## 3. batchMembrane -- batchMembraneLesson.ts, batchMembraneMath.ts, BatchMembraneTool.tsx

**WRONG (stale or impossible citations a student follows)**
- Step 2 (:237) gives "BatchDiafilter.cpp:209-217" for the refusal of an unknown mode. Those lines are initial-holdup reading. The mode parse and refusal are at :192-201.
- Step 6 note (:460) gives ":191-199" for "`reason` is REQUIRED". Those lines are the mode parse. The reason refusal is at :181-188.
- Step 5 note (:410) cites ":658-655", a reversed range. The Tool's version (BatchMembraneTool.tsx:738, ":651-655") lands on the R_avg block. The category-error comment is at :658-662.
- Smaller drifts:
  - Area ":118" is actually :121.
  - J_w in LMH ":567" is actually :575.
  - concentrationFactor ":601" is actually :602 (601 is V_initial).

**SUSPECT**
- Step 3 (:299-302) says the engine "publishes the diavolume count only in constant-volume mode". In fact `diavolumes` is published in both modes, as 0 in concentration mode (BatchDiafilter.cpp:577, 603; H:268-269; diafilter03 golden `diavolumes 0`).
- Step 9 (:657) says "ln(20) = 3 ... exactly". Its own note (:726-729) insists the page does not round (ln 20 = 2.9957).
- batchMembraneMath.ts:645-647 comment says rho "defaults to 1000 and ANNOUNCES it". That contradicts :727-730 and the C402 refusal (cpp:148-150). The comment is not student-facing.

**OK-verified**
- Derivations: n/n0 = exp(-(1-R)N); VCF^-(1-R); c/c0 = VCF^R; the composite exponent.
- 3.6e6 m/s to LMH (math:73, cpp:575).
- Q_d line (:398); solute and solvent balances (:442-459); R0 from the run (:289-291).
- washoutIdeal at :666-669, the same law as math:148.
- Fouling: cake gives 1/(1/A_w + k v); intermediate gives A_w e^{-kv} (:357-362), matching the formulas. r_f is in s·Pa/m.
- SolutionDiffusion 106-119, 133, 181.
- TB032 recomputation: 9.51 %, 7.04 %, N = 4.2613, 14.9x, 0.99 %, all exact.
- Both gap signs occur (diafilter01 NaCl 0.5013 > 0.4967; diafilter02 0.5334 < 0.5436).
- 01 and 02 differ only in the fouling block (diffed).

## 4. lubScaleup -- lubScaleupLesson.ts, lubScaleupMath.ts, LubScaleupTool.tsx

**WRONG (stale citations, all into FixedBedAdsorber.cpp, now 3369 lines)**
- t_st ":845-846" is a `.assign` line. tStoich_ = (L/u)(ε + ρ_b q*/c_in) is at :873-874.
- R_f definition ":994" is mid-string. The printed definition is at :1025-1027.
- Trapezoid ":2012" and 5 % crossing ":2013-2020" are moment accumulators. The real lines are :2040 and :2041-2048.
- KPIs ":3192-3203" is ledgerClosure_. The KPIs are at :3295-3303.
- qbar_final ":3240" is a brace. It is at :3341.
- Header line ":209-214": L is at :210 (fine).

**SUSPECT**
- Step 2 note (:166) says the tool's trapezoid and the engine's t_st "agree to about seven digits". Step 4 quotes t_b = 2934 s and LUB 1.75 cm as what the page shows.
  - Those are the engine's internal-sample KPIs: `integral_anchor` 3040.51243 vs `t_stoichiometric` 3040.51251.
  - The tool integrates and interpolates on `trajectory.t` (LubScaleupTool.tsx:226), which choupoBatch writes on the writeInterval grid (main.cpp:340; batch13 writeInterval 100 s), across a 5-95 % front only 231 s wide.
  - A model curve fitted to the three crossing KPIs gives a trapezoid error of about 0.5 s (4 digits) and a linearly interpolated t_b of about 2913 s. That would make LUB about 2.1 cm.
  - Needs one browser run to confirm.
- Step 1 note (:113) says the "zone about 0.05 m long". From the goldens: (t95 - t5) · u/R_f = 231.5 x 1.644e-4 = 0.038 m, and 2 LUB = 0.035 m.

**OK-verified**
- LUB = L(1 - t_b/t_st).
- L_es = u c_in t_req/(ρ_b q* + ε c_in) = L t_req/t_st, consistent with t_st = (L/u)R_f.
- L_full = L[1 + (t_req - t_b)/t_st], and the truncation-direction argument.
- D = sqrt(4Q/πu); dimensional check of the capacity balance (mol/m²).
- q*_iso = (R_f - ε)c_in/ρ_b = 2.872 mol/kg, equal to qbar_final.
- 3.5 % and 1.75 cm from the KPIs; <1 % for 3 m; "service time a little longer" (algebra).
- FixedBedAdsorber.H:41 and Adsorbent.cpp:42.
