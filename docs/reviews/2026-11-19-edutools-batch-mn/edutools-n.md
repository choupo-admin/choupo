# EduTools review, batch N: materials, treeOfChemistry, routeScreening, declaredPathways

Tree: detached main (read only). All four topics are what the registry says they are (registry.ts:2175, 2315, 2210, 1366).

## 1. Materials of construction (materialsLesson.ts, materialsBench.ts, MaterialsTool.tsx)

**SUSPECT**
- materialsLesson.ts:625-635 (step 18) says "the material enters twice: through F_M, and through the pressure factor ... so a weaker material raises F_P as well". That is how Choupo's engine works: Turton.cpp:323-328 puts the record's sigma_y into t_w. As far as I recall, Turton's own vessel F_P (Eq. A.2) uses one fixed carbon-steel S·E (850 bar), so in the textbook the factor does not depend on the material. The page says Turton was NOT READ (line 107). A student may take an engine choice for a property of the bare-module method. The page should say it is the engine's choice.
- Step 22 (line 818-820) and step 23 (line 875): "the weight, and the density with it, moves no euro" and "a vessel is costed on its volume". This is true for vessels costed with Turton (Turton.cpp:80). Pressure-store vessels are costed by steel mass instead (SteelMassCost.cpp:40,124, with F_M fixed at 1.0 at :110), and there the density is the price. It is a special case stated without its scope.
- Step 12 (line 531): the CE formula uses w_Cr and w_Mo, but its `where` list (lines 534-541) leaves them out. They are defined only in step 3. This is minor.

**OK, verified**
- The wall formula t = PD/(2SE−1.2P) + c_a matches VesselMechanics.cpp:33-34. The weight is :35. S = sigma_y is :30, and the gauge reading is VesselMechanics.H:58-60.
- The 3 mm default (DesignDefaults.cpp:46) and E = 1.0 (:53) are as stated.
- The F_P formula with 0.00315/0.0063 matches Turton.cpp:323-328. C_BM is :754 and F_M is :752. P_g is :694. The exchanger extrapolation is :733-751.
- maxP is checked at MaterialLimits.cpp:41 and maxT at :56-57. MaterialRegistry.cpp:58 and Material.H:55 are as cited.
- Postdict lines 185-193 are as cited.
- The four records and their numbers match the assets: six unsourced numbers for carbonSteel, two F_M values cite Turton.
- Hand-checked arithmetic: PREN 18.8/24.7/34.6. CE 0.367. 0.4×1811 K = 724 K = 451 °C. 0.1 mm/yr × 20 yr = 2 mm. Fe3C + 2H2 → 3Fe + CH4 is balanced.
- I recomputed the whole bench (ammoniaReactor03, D and H from its golden). My SS316 converter weight is 60011 kg, which reproduces the golden.
  - SS304 and SS316 give the same wall.
  - Aluminium needs a wall of 273 mm (converter) and 305 mm (separator), more than a quarter of a metre, yet weighs about 0.62× as much.
  - Aluminium's bare-module factor (120.8) is below SS316's (132.5).
  - Carbon steel is the cheapest on all three vessels.
  - Every maxP is exceeded at 220 bar. Every step-23 claim holds.

## 2. Tree of chemistry (treeOfChemistryLesson.ts, TreeOfChemistryTool.tsx, chemistryGraph*.ts, data/standards/routes/)

**WRONG**
- Step 4 (treeOfChemistryLesson.ts:173-175) says the walk "stops on a loop: the balanced vinyl chloride plant feeds the HCl its cracker releases back to the oxychlorination step, and the record marks that route as a declared cycle". The code does not do this:
  - The walk's loop stop fires only when a substance already lies on the path (chemistryGraphMath.ts:267).
  - The VCM recycle runs through a co-product. A co-product is never a target, so it never enters the path.
  - The `cycle` field (olefins.dat:172) is used only to keep oxychlorination out of the default route (chemistryGraphMath.ts:207-208).
  - If a student picks oxychlorination, HCl is expanded through `HClSynthesis` (inorganic.dat:186, H2 + Cl2) and does not stop. The walk then charges fresh chlorine and hydrogen for HCl that the balanced plant supplies itself, which is the opposite of the sentence.

**OK, verified**
- I wrote an independent element-balance check over all 140 `kind reaction` routes in 7 files, with formulas read from graph.dat or components/*.dat. All 140 balance.
- Spot checks: MTA toluene 7 CH3OH → C7H8 + 7 H2O + 3 H2. Sucrose fermentation. Oxychlorination. Boudouard.
- No biological route uses H2. Glucose and sucrose fermentations draw their electrons from the substrate.
- Hydrogen per carbon: 3 for CO2→methanol, 4 for methanation, 1 for RWGS, and −3/7 for toluene from methanol (negative, as the text says). Matches h2PerCarbon (chemistryGraphMath.ts:173).
- Acetone per kg phenol: 58.08/94.11 = 0.617, quoted as 0.62.
- Five IEA volumes (graph.dat:243-250) and four ammonia intensities with origin `literature` (syngas.dat:395-401) match "five figures" and "four intensities".
- The step-3 and step-5 formulas match routeInputs and routeOutputs, including the separation 1/y, the slate 1/s and the swapped band ends.

## 3. Route screening (routeScreeningLesson.ts, RouteScreeningTool.tsx)

**WRONG**
- registry.ts:2219-2221 (the `teaches` line) says direct oxidation of methane "wins the first four [filters] and fails the fifth". Filter 4 is heat. By the page's own numbers, route C removes the most heat: about 127 kJ per mol methanol against 98 for A and 59 for B (routeScreeningLesson.ts:181-182). Section 5 calls route C the runaway risk (:182-186). On atom economy C only ties A at 100 %. The summary contradicts the page it summarises.

**SUSPECT**
- Section 2 (:85-86) says the margin is an upper bound "because a real plant never reaches complete conversion". Section 4 (:149-152) says that with recycle, conversion per pass does not set raw-material use; selectivity and losses do. A student could conclude that low per-pass conversion lowers the gross margin.
- Limit "prices" (:268) says "This repository curates no prices". The utility records do carry costs (data/standards/utilities/coolingWater.dat:27, chilledWater.dat:31, dowthermA.dat:34, all labelled as assumptions). The claim holds for chemical prices only.

**OK, verified**
- With the tool's MW and placeholder prices (RouteScreeningTool.tsx:74-114), my recomputed gross margins are A +0.017, B −0.046 and C +0.225 €/kg.
- Hydrogen per kg methanol: B 0.189 kg, A 0.126 kg, ratio 1.5 ("half as much again").
- Atom economy of B: 32.04/50.06 = 0.64, so water takes about 0.36 of the mass ("a third").
- Both X_eq values reproduce the stated Kp: A 0.5293 gives 1.909e-3; B 0.2119 gives 2.20e-5. All three routes lose gas moles.
- Gibbs C, a 2:1 feed: CH4 + 2 O2 burns 1/6 of the 2/3 kmol fed, so a quarter. Outlet fractions are y = 0.50/0.167/0.333, as quoted.
- References: Trost 1991, Douglas 1988, Butters et al. Chem. Rev. 106 (2006) 3002.

## 4. Declared pathways (declaredPathwaysLesson.ts, DeclaredPathwaysTool.tsx)

**SUSPECT**
- Limit "ideal-gas-at-fifty-bar" (:342-347) says "Every equilibrium constant the declared reactor uses is on the ideal-gas rung, so the witness declares fugacityModel idealGas for both". The equilibrium reactor now folds fugacity coefficients into each ln Q:
  - `nonIdealGas` at EquilibriumReactor.cpp:328
  - `lnPhiSum` in the residual at :352
  - a fugacity loop at :682-721
  - an announcement at :1101
  Every K is on the ideal-gas rung for the Gibbs reactor too, so the "so" is no longer the reason. A student is led to think the declared reactor cannot be non-ideal.
- Step 4 cites "EquilibriumReactor.cpp:163 and :174" for the two negative-approach refusals. The calls are at :164 and :175 (:163 is the lookup). The citation is off by one.

**OK, verified**
- Hand-checked chemistry:
  - R = N − rank A: 6−3 for the syngas, 5−3 for ammonia oxidation (components NH3 O2 N2 NO water), 6−3 for the reformer.
  - 4NH3 + 5O2 → 4NO + 6H2O is balanced. My hand rearrangement of its ln K reproduces the page's equation.
  - Δn = +1. My rough ln K of about 120 is close to 121.5.
  - y_NO = 0.0976 and y_N2 = 0.742 follow from 10 % NH3 in air.
  - Boudouard = cracking − reforming + shift, so K_b = 3.2283×2.2825/1.3185 = 5.589.
  - I solved the declared reformer myself with the golden Kp values. F_out = 7.6126 kmol/h matches the golden, and a_C = 1.5800 matches `activity_graphite` 1.58003.
  - Graphite per CH4 is 1.084/5 (Gibbs) = 0.542/2.5 (complete) = 0.217.
- Against the equil02 golden: 61 % = 3.811/6.25 (the feed is split 4 ways), y_CH4 0.451, y_methanol 1.76e-10. The shift is written forward and the feed has CO2 and no water, so it runs backward and is endothermic.
- The sign rule s_j matches TemperatureApproach.H:87. The `T_Kp` KPI is at :1075.
- Citations checked: GibbsReactor.cpp:320 (b = A n), EquilibriumReactor.cpp:121, :280-292, :348-351, :547-591, :599-721, :723-821, :988-1006, and PureSolidPhase.cpp:69-95.
- Not reproduced (no build in the tree): the 0.610 → 0.442 conversion with a 20 K approach. Its provenance is recorded at declaredPathwaysLesson.test.ts:253.
