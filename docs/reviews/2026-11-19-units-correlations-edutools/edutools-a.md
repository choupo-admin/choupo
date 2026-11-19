# EduTools review A: mccabe, ponchon, kremser, psychro (tree 482c4acb32, read-only)

Paths are relative to the tree. Wherever a finding is marked "measured", I ran the TS module under `node --experimental-strip-types` on a copy in scratchpad/rv/, or read the case's own golden `expected`.

## McCabe-Thiele

WRONG
1. **R_min is wrong for a subcooled feed (q > 1).** `minimumReflux` scans for a tangent pinch starting at x >= x_F (`gui/src/case/mccabeThiele.ts:266`). It should start at x >= the q-line pinch x_p, and for q > 1 that point sits to the right of x_F. On a concave curve the secant slope from (x_D, x_D) is largest at the smallest x scanned, so the point at x_F always wins (`:277`). Measured on a constant-alpha curve with alpha = 2.5, x_F = 0.5, x_D = 0.95: R_min comes out as 1.100 at q = 1.5, identical to q = 1. The true value is 0.858, at the pinch (0.595, 0.786). With R = 1.0, `buildMccabe` returns pinched = true and N = infinity, although the staircase is finite. The q slider goes up to 1.5 (`McCabePlot.tsx:199`). Consequence for the student: told "Pinched, infinite stages, raise the reflux" when the column works, and the R/R_min axis is wrong for every subcooled feed. No test checks R_min at q != 1.
2. **N_min = 0 is shown next to N = infinity on an azeotrope.** `minimumStages` breaks before its first step when y*(x) <= x at x_D (`mccabeThiele.ts:310`), and the badge prints the result regardless (`McCabePlot.tsx:461`). Measured on a synthetic azeotropic curve (crossing at 0.9) with the default x_D = 0.95: nMin = 0, N = infinity. This is exactly the ethanol/water case step 5 tells the student to try. Consequence: the "fewest stages" readout says zero.

SUSPECT
3. Steps 2 and 3 call the TypeScript geometry "the engine" (`mccabeLesson.ts:90`, `:173`), and then cite `gui/src/case/mccabeThiele.ts`. That file's own header says it holds no physics. A student will think the C++ solver is being described.
4. `if (!partialReboiler && n > 0) n -= 0;` (`mccabeThiele.ts:314`) does nothing, under a comment saying a total reboiler is not a stage. The behaviour (N unchanged) is consistent; the comment is not.

OK-verified: rectifying, stripping and q-line algebra, including the subtraction (V − V̄)y = (L − L̄)x + F z_F. The q definitions and regimes. Horizontal step = equilibrium, vertical step = balance. The Murphree pseudo-curve y_op + E(y* − y_op). The partial-condenser rule (N unchanged, one fewer tray), which matches `trays = nStages − …`. The q = 1 vertical special case.

## Ponchon-Savarit

WRONG
5. **The Origin note promises things the page does not draw.** It says "the difference points and the stage steps are this page's geometry" (`PonchonSavaritTool.tsx:136`). The plot draws one Δ_D and no steps (`PonchonPlot.tsx:79-99`), and the page's own Alert says there is no second difference point and no staircase.

SUSPECT
6. The line labelled "ray through the top tray" (`PonchonPlot.tsx:95`) is the condenser cut, joining (x_D, Δ_D), (x_D, H_1) and (x_D, h_D). It is vertical for every R, so the student never sees a ray rotate. The page does admit the lever readback is an identity.
7. The file header says the interactive drawing "is NOT built" (`PonchonSavaritTool.tsx:46`), but ConstructionPane is built. A stale absence.

OK-verified: the top energy balance with Q_C < 0, giving Δ_D = h_D − Q_C/D; Δ_B = h_B − Q_R/B. The lever rule L/V = (Δ_D − H)/(Δ_D − h), derived from V = L + D and VH = Lh + DΔ_D. The identities Δ_D − H_1 = R(H_1 − h_D) and Δ_D − h_D = (R + 1)(H_1 − h_D). The parallel-lines argument for constant molar overflow (exact algebra). The total-condenser H_1 read at y = x_D. Units: W / (mol/s) = J/mol, displayed /1000 as kJ/mol. The CSV header matches `EnthalpyConcentration.cpp`.

## Kremser

SUSPECT (pedagogy, demonstrated on the witness)
8. The A on screen is evaluated at the gas feed temperature (`Absorber.cpp:272`, `:311`): A_NH3 = 1.535 (`absorber01 expected`). Step 2's note (`kremserLesson.ts:100`) teaches that A > 1 means every stage keeps buying recovery, up to complete recovery. But every stage of the witness runs at A < 1. From the curated Henry record (H = 0.99 bar, dH = −33.7 kJ/mol, van 't Hoff): K = 1.57 at 309 K (A = 0.96) and 2.06 at 315 K (A = 0.73). The chip shows run 0.675 against Kremser 0.972. Step 4 names the mechanism, but nothing tells the student that the column's *regime* flips; read with the displayed A, step 2 predicts the wrong one.

OK-verified: recovery = (A^(N+1) − A)/(A^(N+1) − 1) for a lean solvent, with the A = 1 limit N/(N+1) and the A < 1 limit A. The KPI A = L_in/(K_ref V_in) on total flows, and L/V = 150/100. K is evaluated at the fixed inlet compositions (`Absorber.cpp:167`), as the limits say. The tridiagonal stage balance (`:176-187`) is correct. Stage temperatures of 309-315 K match `0/cleanGas` and `0/richLiquid`. The Henry-only refusal exists (`KremserAcceptance.cpp:111`). The pinch direction for A > 1 and A < 1 is right.

## Psychrometric chart

WRONG
9. **The on-screen Lewis readout overstates the wet-bulb gap.** The page says that at the reported Le "the approximation is worth |1 − Le|·100 % … the whole distance between the adiabatic-saturation family and the true wet-bulb family" (`MethodsWorkspace.tsx:1339-1344`). The engine scales the slope by Le^(2/3) (`PsychrometricChart.cpp:280`), and the lesson's own step 3 formula says the same. For air, Le = 0.8505 (`psychro02 expected`): the page says 15 %, the slope differs by 10.3 %. For N2, Le = 0.817: the page says 18 %, the true figure is 12.6 %.
10. **"Nitrogen with water gives you the chart you have seen printed"** (`MethodsWorkspace.tsx:1324`). The lesson's own limit, the engine comment, and the psychro02 twin all say N2 puts every Y about 3.4 % above a printed air chart.
11. **The Y_sat(60 °C) figures are stale against the engine.** The limit says 0.1586 for N2 and 0.1534 for air (`psychroLesson.ts:391`; also `psychro02 propsDict:20`, `PsychrometricChart.cpp:151`). The current goldens, with T_max = 60 °C, are 0.157636 (`psychro01 expected`) and 0.152481 (`psychro02 expected`). The air value now matches the handbook's ~0.152 that the page says it misses.

SUSPECT
12. "Enthalpy is why the adiabatic-saturation lines are straight" (`psychroLesson.ts:154`). Neither the adiabatic lines nor the isenthalps are straight in (T, Y): c_s depends on Y, and the engine re-evaluates c_s with Y (`PsychrometricChart.cpp:206-209`). Near-coincidence with the isenthalps does not imply straightness.
13. The `psychroSpec` comment says a missing diffusion volume "silently omits" the line (`methodFeeds.ts:202`). The engine now announces it, as the limit correctly says.

OK-verified: Y = (M_v/M_c) p_v/(P − p_v); φ as a ratio of pressures. The 65 % P_v cap (`:86`). The adiabatic-saturation balance c_s(T − T_as) = (Y_as − Y)λ. h per kg of dry gas. Units: Cp J/mol ÷ (g/mol) × 1000 = J/(kg·K), and λ is converted the same way (`:60`, `:197`). Le = α/D with α = k/(ρ c_p,carrier) on a carrier-only gas (`:271-276`). Wet-bulb slope c_s Le^(2/3)/λ (Chilton-Colburn, correct direction). The mixing lever rule; the dehumidification drop; the altitude direction (a sea-level chart understates Y); the ratio 28.96/28.013 = 3.4 %. K→°C conversion done once in `psychroSpec`.
