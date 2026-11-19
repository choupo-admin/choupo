# EduTools review, batch i: overpressure, pool-fire, stack-dispersion, letdown

The registry ids were the expected ones (`registry.ts:1970`, `:2000ff`, `:2040ff`, `:1139`). The arithmetic modules live in `gui/src/ui/methods/` (`overpressure.ts`, `poolFire.ts`, `stackDispersionMath.ts`, `letdown.ts`), not in `gui/src/case/`. I recomputed the numbers independently, in Python and Node (strip-types) on copies, against the records and the goldens. Nothing was written inside the tree.

## 1. Overpressure (`overpressureLesson.ts`, `OverpressureTool.tsx`, `overpressure.ts`)

**WRONG**
- `OverpressureTool.tsx:327` ("on the same declared blocked-outlet flow for both: the lower-pressure loop circulates more gas") and `registry.ts` teaches ("on the same declared blocked-outlet flow, needs a relief valve about four and a half times larger"). The flows are not the same. The witness compositions (`relief01 propsDict:64-77`), priced with the record molar masses, give W ≈ 155 t/h at 150 bar and ≈ 264 t/h at 50 bar, and the page's own W row shows both. The 4.6× area ratio is about 1.70 (flow) × 3.02 (P1). What is "the same" is the hypothesis, not the flow. *Student consequence:* they credit the whole factor to the pressure.

**SUSPECT**
- Step 11 (`overpressureLesson.ts:597`) prints the API 526 "T" orifice area (26 in², about 16 800 mm²). The C62 ruling (`ReliefArithmetic.H:53-59`) keeps the letter table out of the tree. One entry is not the table, but it sits uneasily with "not reproduced".
- Slider domains leave the model with no word to the reader:
  - The loop bench's P2 slider runs to 150 bar abs (`:283`), above the 50 bar loop's P1 of about 60 bar. P1 − P2 < 0, so the area becomes NaN and is shown as "—" with no explanation.
  - The fire bench's F slider starts at 0 (`:425`). The engine refuses F ∉ (0, 1] (`ReliefValveSize.cpp`, the `environmentFactor` check).
- Step 3 says only the wetted area within the fire height counts. The engine's fire case counts the whole wetted area, πD(level·H) + πD²/4 (`ReliefValveSize.cpp`, fire branch), and the page does not say so.

**OK, verified**
- The constants, rederived:
  - 3.6/√(1000R) = 0.039481
  - (10⁶/3600)·√(R/2000) = 17.910
  - (10⁶/60000)·√(ρw/2000) = 11.779
  - the fire coefficient C·Btu/h·(ft²/m²)^0.82 = 43 192 and 70 959 W/m^1.64
  - The dimensional analysis of all three gas/liquid forms closes.
- The C(k), F2 and P_cf/P1 algebra is right: F2·√(2ρ1ΔP) is the exact isentropic flux.
- The TypeScript and C++ homes are the same procedure:
  - same functions and constants (`overpressure.ts:257-370` against `ReliefArithmetic.H:75-201`);
  - same strict largest-area rule (`overpressure.ts:247` against `ReliefValveSize.cpp:545`);
  - same Kd/Kb/Kc/Kw/Kv defaults (`DesignDefaults.cpp:111-151`).
- The ASME accumulation and set limits are right.
- The fire golden is consistent: P = 706 325 Pa = 1.21·5 bar + atm, and Hvap = 24 076.6 J/mol, which is Watson.
- The Ex 1 / Ex 5 mass ratio is 15.1.
- The citations hold at the lines named:
  - `ReliefValveSize.cpp:545`, `:361`, `:376`
  - `Component.cpp:1441-1449`
  - `ThermoPackage.H:376`
  - `PropertyEvaluator.cpp:193`
  - `PropertyPoint.cpp:88-91`
- The "LetdownHP / StorageFlash governed by their liquid" claim matches the greenAmmonia03 golden (`blocked_LetdownLiquid` 385 mm², `blocked_ProductNH3` 1216 mm²).

## 2. Pool fire (`poolFireLesson.ts`, `PoolFireTool.tsx`, `poolFire.ts`)

**WRONG:** none found.

**SUSPECT**
- The bench opens on an extrapolation: D = 5 m with Heskestad (`PoolFireTool.tsx:291`). Methanol's group Q^(2/5)/D = 6.7 is below the tested 7–700, and 5 m is past the 1 m pan. The page flags both (`:420ff`), but a student's first picture is outside both models.

**OK, verified**
- All the typed numbers reproduce from the records:
  - Hess LHV of the vapour 676.2 and of the liquid 638.2 kJ/mol, 19.92 MJ/kg
  - m″∞ 16.6 g/m²s; predicted 16.5 against the measured 16.3 at 1 m; Bureau of Mines 22.3
  - Q 258 kW; Heskestad 1.10 m (1 m pan) and 0.44 m (30 cm); Thomas 1.55 m
  - energy E 12–16 kW/m² against Mudan 126; the 2^(4/3) "2.5×" and the 3.42e6 dose
  - threshold conversions 1.42, 4.18 and 31.5 kW/m²
- The correlations are right: Burgess, Thomas (42, 0.61), Heskestad, Mudan-Croce, and the Shokri-Beyler Eq 6b view factor with the above/below split.
- The point-source and solid-flame limits are exact algebra: L/D at the surface, 4/π far away.
- All `poolFire.ts:NNN` citations land on the named functions (242 … 492). The `Component.cpp:1288-1289` crossing and `:1449` (exponent 0.38) are correct.
- The layout pairs (4 m vessel–vessel, 30 m building–vessel) are as `layoutDict:253-255` declares.

## 3. Stack dispersion (`stackDispersionLesson.ts`, `StackDispersionTool.tsx`, `stackDispersionMath.ts`, `stackDispersionToy.ts`)

**WRONG**
- `stackDispersionToy.ts` KNOB_U: "Wind dilutes and flattens the rise, both as 1/u". In stable air (E, F) the rise law the page itself uses is 2.6·(F/(u·s))^(1/3) (`stackDispersionMath.ts` `finalRise`), which goes as u^(-1/3). *Student consequence:* a special case taught as general, and exactly for the stable classes the night case turns on.

**SUSPECT**
- Step 6: "the maximum is where the vertical spread is the stack height over the root of two". By the derivation's own algebra it is the effective height H = h_s + Δh; the same sentence then switches to "effective height".
- The "cold-jet" limit says "no source for that law was read". STACK_SOURCES/briggs-rise says ISC3 Vol II, which was read, tests momentum against buoyancy and uses the momentum rise when it wins. Either the momentum law was in hand or the source note overstates what was read.
- Step 3 calls F "very stable". Pasquill/Turner's F is "moderately stable"; G is the extreme.

**OK, verified**
- Briggs rural and urban σ fits match the published sets coefficient by coefficient.
- Turner's table matches cell by cell, and so do its footnotes (60°, 15–35°, ±1 h).
- Briggs F, the 21.425/38.71 laws split at 55, and Γ = 0.020/0.035 K/m are right.
- The image-source and ground-centreline formula is right, and the C_max = 2Q/(πeuH²)·σz/σy algebra checks.
- The misprint argument holds: σz = 506 m against 200 m, and 12.7× rural F.
- GEP = H_b + 1.5·min(H, W) and the 65 m clause are right.
- The emission conversion (kmol/s → g/s, ideal-gas volume) is right.
- gibbs06 flueGas is 0.00292 kmol/s = 10.5 kmol/h ("about 10") at 1800 K.
- Run at the defaults, stable maxima are lower and farther out, F's maximum is flagged at the window edge, and the class curves cross. All three are as the prose says.

## 4. Letdown (`letdownLesson.ts`, `LetdownTool.tsx`, `letdown.ts`)

**WRONG**
- `LetdownTool.tsx` NoiseBench: its OriginMark says "the noise relations, as the fluids library implements them, evaluated on this page". No noise relation is run. The code computes only Q·ΔP, an ideal-expander work and 10·log10 (`letdown.ts:333-356`), and the page's own source note and PanelNote say none was run or computed.

**SUSPECT**
- NoiseBench's "mechanical power dissipated" for the purge is the isentropic expander work: 17.7 kW, with T2s = 74.7 K. The liquid rows' Q·ΔP is the throttle's lost work. The gas analogue, isothermal ∫v dP, is 30.7 kW at T1 (36.1 kW at 298 K). The "same fraction" dB comparison is therefore about 2.4–3.1 dB off for the gas row.
- The prose predates C390 (2026-11-18), which added the liquid pressure term v(1 − αT)dP (`ThermoPackage.cpp:3908ff`). The engine's first throttle now warms the liquid 253.15 → 255.03 K, about 2 K of liquid Joule-Thomson heating (`letdown.test.ts:263`).
  - Step 2 says only that the dissolved gas comes out and "the temperature hardly moves". A throttled liquid warming is the teachable point, and it is never said.
  - Step 9's "a small cooling with the storage pressure above Pv" is now an untested sign.

**OK, verified**
- IEC relations as stated:
  - F_L definition and P_vc
  - F_F = 0.96 − 0.28·√(Pv/Pc)
  - ΔPmax = F_L²(P1 − F_F·Pv)
  - x_eff cap and Y = 1 − x/(3·F_γ·x_T), down to 2/3
  - the nozzle Saint-Venant ratio
- Step 10's numbers come out of the goldens:
  - P_vc = 20 − 18.99/0.81 = −3.44 bar
  - F_F·Pv = 0.9222 × 2.066 = 1.91 bar
  - ΔPmax = 14.66 bar
  - the choke at 5.34 bar, which matches the overpressure page's step 10
- k = 1.403 gives P*/P1 = 0.528 ("about one half"). With x_T = 0.7 the valve chokes at x = 0.70, beyond the nozzle's 0.47, as stated.
- Purge golden: ratio 70, dT = −4.9 K ("a few kelvin colder"), volume ratio 64.
- HP hydraulic power 251 kW ("hundreds of kW").
- The H2–NH3 Henry Trange (288, 333) against use at 253 K, and the density still Vliq-anchored Rackett (`ThermoPackage.cpp:2489ff`), so the "density" limit stands.
- The citations hold at the lines named: `Valve.H:32`, `Valve.cpp:148`, `:264`, `ThermoPackage.cpp:2429`, `StreamEquilibrium.H:1021`, `PropertyEvaluator.cpp:168`, `PropertyPoint.cpp:89`.
