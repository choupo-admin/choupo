# Review: rate-based vs equilibrium-stage EduTools (tree d0d2d1c1e5)

Read-only review.  I could not run vitest because `gui/node_modules` is absent.
Every engine `file:line` was opened with `awk 'NR==l'`.  Paths are relative to the tree root.

## WRONG

1. **The interface is said to sit at the wrong end of the film (curved-line step).**
   `gui/src/ui/methods/oneFluxManyUnitsLesson.ts`, step 5 body: "...because the liquid film holds almost all
   the resistance and the interface sits close to the bulk liquid."  This is backwards.  When the liquid film
   controls, nearly all of the driving force lies across the liquid film, so the interface sits close to
   equilibrium with the bulk **gas**.  The page's own solve (`curvedDemo`, `gui/src/case/oneFluxManyUnits.ts`)
   confirms it: x_i = 0.001954, x* = 0.001975, x_b = 0.001.  The interface is at about 98 % of the way from
   x_b to x*.  That position is the real reason why Seader's (b), the slope at x*, is nearly exact: m''
   approaches the local slope at x*.
   Student consequence: the picture of film control is inverted.

2. **The overall-coefficient panel prints a flux 27 % low on its own "Seader 3.18 (a)" defaults.**
   `OneFluxManyUnitsTool.tsx:349` computes N = K_y (y_b − m x_b).  This writes y* = m x_b, a line through
   the origin.  But the default m = 49.7 is Seader's average CHORD, which does not pass through the origin:
   y*(x_b) = 0.0365, not 0.0497.  Results:
   - the panel shows N = 0.00686 kmol/(h m²);
   - exercise 3 (`oneFluxManyUnits.ts`, `overall`) gives K_x (x* − x_b) = 0.00942 from the same inputs;
   - the exact flux is 0.00945.

   Student consequence: two numbers on the same page disagree by 27 % for identical inputs.  The fix is to
   take y* from x* (or from the curve), or to state that the panel assumes y* = m x.

3. **A false claim about the engine: "the one place the sum appears is the first guess".**
   `oneFluxManyUnitsLesson.ts`, step 4 body, citing `RateBasedSegment.cpp:679`.  The resistances-in-series
   sum also appears at:
   - `RateBasedSegment.cpp:690` (the seed again);
   - `:471` (`HOG = HG + lambda HL`);
   - `:853-855`: a per-segment H_OG and the liquid-film share m(V/L)H_L/H_OG.  This is exactly step 4's
     share, and it is published as profile column `HOG` (`:886`).

   Student consequence: the student is told the engine has no overall-coefficient arithmetic, when it
   publishes the very share this step teaches.

4. **The vapour-pressure source is mislabelled in exercise 2.**
   `oneFluxManyUnits.ts:676` says "(Choupo's water record, Antoine form)".  The code (`waterVapourPressure`)
   and `data/standards/components/water.dat:96` are the Wagner/IAPWS form.  The record's provenance (`:302`)
   says it *replaces* Antoine.  The exercise's own data line names Wagner & Pruss, so the exercise contradicts
   itself.  The test comment at `gui/tests/oneFluxManyUnits.test.ts:369` repeats "Antoine".

## SUSPECT

5. **The symbol c is overloaded in step 2** (`oneFluxManyUnitsLesson.ts`, step 2).  Step 2 writes
   J_A = c k Δy and N_A = c k ln(...) for the GAS film.  The step's `where` list does not define c.  Step 1
   defined c as the liquid's total molar concentration.  It should read c_G (or c_t with phase) here.

6. **The Hatta number cites three different equation numbers.**  The body says Eq. 9.2-55; the code comment
   on `hatta` says 9.2-40; exercise 5 says 9.2-54 (the last is for the second-order form).  I could not check
   these against Missen.  At least one of them is probably stale.

7. **The design record cites stale lines.**  `docs/design/equilibrium-or-rate-based.md:51-52` cites
   `DistillationColumn.cpp:1597` / `:1729`.  The read and the fold are at `:1600` / `:1732`, which the lesson
   cites correctly.

8. **Mole basis vs mass basis is unstated for ppm.**  The impurity is displayed as "ppm" in
   `EquilibriumOrRateBasedTool.tsx:79` and as "10 ppm" targets.  It is a mole fraction × 10⁶.  Undergraduates
   usually read ppm as a mass ratio, so it should say "mol ppm".

9. **The engine scope is incomplete about the packing correlation.**  `OFMU_ENGINE_SCOPE` cites only
   `PackingRBF.cpp:127/129/133` for k_G, k_L and a_e.  The segment can also take them from `PackingDelft`
   (`RateBasedSegment.cpp:457`).  This is not wrong; it is a partial description.

10. **HETP is missing from the lesson's account of rate-based efficiency.**  The equilibrium-or-rate-based
    lesson says a rate-based model makes "the efficiency something it computes".  The engine's only
    rate-based model is a packed bed, so what it computes is an HETP / H_OG, not a Murphree efficiency.
    Nowhere does the lesson connect the two.

## OK-verified

- **Every lesson citation lands on the claimed code:**
  - `DistillationColumn.cpp:1600` (E_MV read);
  - `:1732` (Keff = E K + (1−E) y_{j+1}/x_j, which is algebraically the step-1 Murphree formula; the loop
    skips the reboiler and stage 0 only with a partial condenser, as the note says);
  - `:2400` (MESH refuses);
  - `:5103` (binary only);
  - `RateBasedSegment.cpp:467/468/469/585/597/603/604/679`;
  - `PackingRBF.cpp:127/129/133`;
  - `HenrysLaw.cpp:50` (H_ref as pressure) and `:163` (van 't Hoff, sign matches the lesson);
  - `ThermoPackage.cpp:1305` (K = H/P).
- **The engine-scope claims hold:**
  - the rate-based segment is binary-only (`RateBasedSegment.cpp:143`), runs at total reflux, and refuses
    a feed (`:118-131`);
  - absorbers are Kremser equilibrium stages (`separation/Absorber.H`).
- **Dimensional analysis passes:**
  - k_y = k_c P/RT = k_p P;
  - k_x = k_L ρ_L/M_L;
  - β_V = c_G k_G a_e A_T Δz / V_ref works out as kmol/m³·m/s·m² ÷ kmol/s, so it is dimensionless;
  - 1/K_y = 1/k_y + m/k_x, K_x = m K_y;
  - 1/K_G = 1/k_p + 1/(H^cp k_L) and 1/K_L = H^cp/k_p + 1/k_L, both in m² s Pa/mol and s/m;
  - Taylor–Kooijman 1/K_OV;
  - Sander H^cc = H^cp RT, H^xp = H^cp M_w/ρ_w, H^bp = H^cp/ρ_w, m = ρ_w/(M_w H^cp P);
  - the stagnant-film log mean;
  - Ha = √(D k₁)/k_L, λ = sinh(Ha(1−z))/sinh Ha, E = Ha/tanh Ha, E_i and van Krevelen–Hoftijzer;
  - N = p_A/(1/k_Ag + H_A/(E k_L));
  - F_s = u √ρ_V in (m/s)(kg/m³)^0.5, on the tower area.  This matches the engine
    (`DistillationColumn.cpp:5182`) and Yanagi's nomenclature.
- **The TypeScript unit factors are right:**
  - kmol/(m² s kPa) = 1 SI;
  - lbmol/(ft² h atm);
  - M/atm = 1000/101325;
  - bar L/mol = 100 Pa m³/mol;
  - cm²/s → 10⁻⁴;
  - the IAPWS Wagner coefficients;
  - c in mg/L = mol/m³ × g/mol.
- **The equilibrium-or-rate-based numbers match the design record's tables:**
  - "about a fifth" (×1.20);
  - "factor of four" (×4.21);
  - 27→63 real trays (nStages − 1, total condenser, as in column11's header);
  - Krishnamurthy–Taylor counts 70/160, 550/1300 (2c+1 vs 5c+1);
  - 0.08 vs 15 ppm ≈ two orders of magnitude.
- **The binary-equal-Murphree argument (step 3 note) is correct.**
- **`totalRefluxLoop.ts` converts units correctly:** kmol/s → display, and m³/s × 3600.
