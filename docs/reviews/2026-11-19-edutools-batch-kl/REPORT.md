# EduTools batches K and L: twelve wrong statements in eight lessons

Read-only on main, 2026-11-19, at Vitor's request.  Evidence with file:line:
[edutools-k.md](edutools-k.md) (bode, columnControl, fastSlow = the
`fast-and-slow` time-scale page, activeSetQp) and
[edutools-l.md](edutools-l.md) (solventMixture, equilibriumLandscapes,
batchMembrane, lubScaleup).

## Wrong

1. **bode:** the panel note says each run writes "six" scalars and "the same
   five edits" reproduce it (`BodeTool.tsx` ~505-510); `bodeOverrides` writes
   nine.
2. **columnControl, limit `no-dynamics`:** "the dynamic tier is a stirred
   tank and one reference plant".  `DynamicTank`, `QuasiSteadyUnit` and
   `ctrl21_tank_level_control` exist.  That there is no dynamic column is
   still true.
3. **columnControl, drum chip:** the chip and the reflux-ratio knob's reason
   need `L_rect`, which only the WangHenke branch publishes
   (`DistillationColumn.cpp:1993`).  The witness runs `model simultaneous`,
   so they never fire.
4. **fast-and-slow step 2: the closed form of x_f - x_s^red has its sign
   reversed.**  The gap is tf(e^(-t/tf) - e^(-t/ts))/(ts - tf), negative, as
   the page's own plot draws it.  The max |gap| = eps^(1/(1-eps)) is right.
5. **activeSetQp step 6 and the tool: "0.78 % more positive charge than
   negative"** is (c-a)/(c+a).  Cations exceed anions by 1.58 %.
6. **activeSetQp step 5: "every non-zero step strictly reduces the
   objective"** holds only from a feasible start.  Choupo starts at zero with
   equality steps; the page's own run goes from 0 up, and
   `activeSetQpMath.test.ts:372` has it rising.
7. **activeSetQp steps 6-7:** step 6's objective has no 1/2 but calls B the
   identity, while step 7's stationarity needs the 1/2.  Derived from step 6,
   the multipliers come out twice the published ones.
8. **solventMixture step 7: the comparison runs backwards**
   (`solventMixtureLesson.ts:215-217`).  Hexane + nitromethane's best RED is
   0.754, against 0.660 for hexane + acetone (solvent02 golden), so the first
   blend is the better one.
9. **equilibriumLandscapes: "glucose.dat has no Cp, so the sugar route
   refuses at 310.15 K"** (step 6, the limit
   `biological-routes-at-the-datum-only`, `EquilibriumLandscapesTool.tsx:
   589-592`, the landscape06 header).  `glucose.dat:74-79` now carries a
   `liquidHeatCapacity` (Kishore 1993, 298-327 K), and `Component.cpp:
   1251-1270` falls back to it, announced.  The step 6 citations drifted
   (1128/1263 -> 1227/1362; the refusal is at 1243).
10. **batchMembrane:** the citations a student follows are wrong.  The mode
    refusal is at `BatchDiafilter.cpp:192-201`, not 209-217; "reason is
    required" is at 181-188, not 191-199; step 5 cites a reversed "658-655".
    Step 3 says diavolumes are published only in constant-volume mode; they
    are published in both (0 in concentration mode, diafilter03 golden).
11. **lubScaleup: every `FixedBedAdsorber.cpp` citation is stale.**
    - t_st 845 -> 873-874
    - R_f 994 -> 1025-1027
    - the crossing 2012-2020 -> 2040-2048
    - the KPIs 3192-3203 -> 3295-3303
    - qbar 3240 -> 3341

## Suspect, the most useful

- **lubScaleup: "the tool's trapezoid matches the engine's t_st to seven
  digits"** and t_b 2934 s / LUB 1.75 cm are the engine's fine-step KPIs.  The
  tool works on samples 100 s apart across a 231 s front: about 4 digits, with
  t_b near 2913 s and LUB near 2.1 cm (needs a browser run to confirm).  The
  zone is about 0.038 m, not "about 0.05 m".
- **equilibriumLandscapes step 3:** "combustion exothermic at every cell", but
  the tool's header records 123 exothermic + 1 undetermined.
- **activeSetQp:** LICQ recovery drops the highest-indexed active row, not
  "the most recently added".  The browser solver caps at 50 iterations
  against the engine's 200.
- **columnControl:** V = L + D is stated generally; it holds for a
  saturated-liquid feed under CMO.  Two test titles contradict the retracted
  handle text.
- **solventMixture:** acetone at RED 0.927 is "just at its edge" (inside);
  "tm < 0 means two liquids" while the code's threshold is -1e-3
  (`StabilityTest.cpp:221`).
- **bode:** a stale `DynamicDriver.cpp:1055` -> `:1088`.  The integrating
  caveat does not cover the PI controller's own pole.

## Verified

- The PID parallel form and conversion, the ZOH bias, the KKT sign
  convention and the ratio test.
- Hansen's factor 4 and volume-fraction mixing.
- The 3.6e6 m/s to L/(m2 h) factor and both fouling laws.
- The LUB algebra and q* = 2.872 mol/kg.
- The equilibrium chemistry of the landscapes.
