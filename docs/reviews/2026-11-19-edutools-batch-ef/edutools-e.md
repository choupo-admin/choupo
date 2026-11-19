# EduTools review, batch E: compression, pump-system, drying, merkel

Tree: detached main (scratchpad/edu2/tree). I edited nothing in the tree. The registry ids are `compression`, `pump-system`, `drying` and `merkel` (registry.ts:1045, 1031, 1423, 1161), and each one is the lesson its name suggests. Arithmetic was recomputed in python, plus node on a copy of compression.ts in run-e/.

## compression (compressionLesson.ts, compression.ts, CompressionTool.tsx, src/postProcessing/sizing/CompressorDesign.cpp)

**WRONG: step 5's numbers do not follow from step 5's formula.** compressionLesson.ts:285 gives W_N/W_1 = N(R^{m/N}-1)/(R^m-1). That is the drop-free ideal (`idealWorkFactor`, compression.ts:260). The prose at :271-278 quotes 1365.6, 1281.9 and 1255.6 kW, and those come from `staged()`, which includes the intercooler pressure drops (compression.ts:244; the test confirms it at tests/compression.test.ts:150-157). With m = 0.378505, c = 1114.8 kW and W_1 = 1740.5 kW, the displayed formula gives 1338.6, 1231.4 and 1182.0 kW at 477.2, 407.9 and 377.2 K. It also gives savings of 23 / 8 / 4 %, not "a fifth / 6 % / 2 %". The asymptote "m ln R ... 60 %" is a drop-free number placed next to drop-inclusive bars; with drops, N = 4 already sits at 72 %. A student who checks the step by hand is 4 % off at N = 3 and concludes the page is wrong.

**WRONG (minor): stale citation.** :54-55 says the shaft power is at CompressorDesign.cpp:224. Line 224 computes `Wgas = mdot*head/etaP`; the shaft power `Wgas*(1+mech)` is at :225.

**SUSPECT: the warning claim is too broad.** :316-317 says a departure that breaks the dhCheck closure "raises a warning in the run". The engine tests only stage 1, at |dhCheck| > 5 % (CompressorDesign.cpp:626). It prints that to stdout and never adds it to AdvisoryLog. The second section's +0.66 %, which the page quotes, is never checked.

**OK, verified:**
- Head and shaft power: lesson :62-64 against :223-225 and compression.ts:156-162. My values are 87036 J/kg, 412.44 K and 427.31 kW, the lesson's own numbers.
- η_a = (r^a−1)/(r^{a/η_p}−1) (:216): 0.719 and 0.656.
- r_max = 2.967 and 763.7 K; N = 2 gives 480.8 K only with drops (r = 3.5337).
- The Lagrange derivation and c [W].
- k_eff = 1/(1−a): 1.405 and 1.407.
- The 2 psi drop of 0.1379 bar on both coolers.
- Citations :35, :207, :216, :218, :221 and :246.

## pump-system (pumpSystemLesson.ts, PumpSystemTool.tsx, Pump.cpp, Pipe.cpp)

**SUSPECT: units mismatch.** Step 1 defines the operating point Q* in m³/s (pumpSystemLesson.ts:89-92). The tool reports it only as F* in kmol/h (PumpSystemTool.tsx:517, :669) and gives no conversion. The student has to supply MW/ρ themselves.

**OK, verified:**
- Δp_pump = ηW/Q (Pump.cpp:166) and h = dP/(ρg) (:425).
- System curve f(L/D)ρv²/2 + ΣKρv²/2 + ρgΔz with nothing else (Pipe.cpp:585-589).
- The two density routes: the pump uses `liquidProperty::density` (Pump.cpp:101); the pipe uses the package `thermo.density(...Liquid)` reached through `liquidProperty::evaluate` (Pipe.cpp:467, LiquidPropertyDoor.cpp:146).
- "No NPSH anywhere": `grep -i npsh|cavitat src` returns nothing.
- The affinity laws, the NPSH algebra, and "throttle → lower Q*, higher Δp" are all correct.
- The witness's knobs and fittings (2×0.9 + 10 = 11.8) match the lesson.

## drying (dryingLesson.ts, DryingCurveTool.tsx, BatchDryer.cpp, Psychrometry.H)

**WRONG: the "falling-rate-law" limit is stale and contradicts step 4.** The limit (dryingLesson.ts:303-311) says the engine announces "R = R_c (X−X_eq)/(X_c−X_eq) ... a modelling choice" and that there is "no second falling-rate period". The witness declares `dryingCurve { shape power; }`, so the engine prints "CHARACTERISTIC DRYING CURVE (van Meel 1958), declared" instead (BatchDryer.cpp:331-339). It also accepts a measured table (:339, DryingCurve.cpp). Step 4's own note (:258-262) says such a table "can carry the two falling-rate periods". The student reads two opposite claims on one page.

**WRONG: step 5 assumes n = 1 without saying so.** The formula t(X) → ∞ and the note "the tail ... never touches" X_eq (:270, :272) hold only for n ≥ 1. The n knob runs from 0.3 to 3 (DryingCurveTool.tsx:514). Step 4 (:228) and the engine (BatchDryer.cpp:358) both say that n < 1 reaches X_eq in finite time.

**SUSPECT: the air-humidity knob refuses at low air temperature.** The airY knob runs to 0.04 while airT goes down to 300 K, where Y_sat = 0.0225. Above that the engine refuses ("supersaturated", Psychrometry.H:185) or clips a_w at 0.99. It refuses by name rather than giving a wrong answer.

**OK, verified:**
- The wet-bulb equation against Psychrometry.H:142-148, the Y_sat formula (:103), and R_c = k_Y ΔY (:297).
- λ in J/kg (:298, J/mol ÷ kg/kmol × 1000).
- t_c = m_s(X0−X_c)/(R_c A) (:309): 1027 s from m_s = 2.0 kg, R_c = 7.008e-4 and A = 0.5. The tooltip says "~1030 s".
- τ (:311), GAB at the air's a_w (:247-256), and X_c ≤ X_eq refused (:258).
- The solid temperature is not integrated (:401). T_wb is 300.534 K against the authored 300.53 K.

## merkel (merkelLesson.ts, MerkelTool.tsx, CoolingTower.cpp)

**SUSPECT: two knobs run into refusals.** At the default 25 °C, about 60 % of the airMoisture range is supersaturated air. Saturation is reached at 2.03 kmol/h of water against 65 kmol/h of N2, and the knob goes to 5 (MerkelTool.tsx:226); the engine refuses by name. The airT minimum of 273.15 K is below the wet-bulb bracket floor of 273.65 K (Psychrometry.H:149), which is also refused.

**SUSPECT: step 3's rating-mode claim is slightly too strong.** Step 3 note (:203-206) says rating mode has "no such message". Rating mode does refuse when L/G is too high ("even a vanishing range needs more packing", CoolingTower.cpp:260-263).

**OK, verified:**
- The operating line, Me = ∫cp_L dT/(h*−h) by Simpson (:204-223) and Chebyshev-4 (:277-285).
- L and G on component mass flows (:143-144), and cp_L at (T_in + 25 °C)/2 = 35 °C (:167).
- The design refusals at or below T_wb and at the pinch (:238-249).
- The gap −E·cp_L·(T_out−0 °C) (:365-377), checked algebraically.
- The witness numbers: T_wb 19.87 °C; evaporation 2.40 %; gap −1.393 kW = 3.82 % of 36.44 kW; Chebyshev against Simpson 4.3e-5.
- Not verified: the energy-report figure of −1.57 kW, which needs a run.
