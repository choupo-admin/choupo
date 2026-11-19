# EduTools review P: seven lessons (read-only)

Tree: detached main, `.../edu2/tree`. All paths below are relative to it. I checked registry.ts:1906, 2238, 2271, 2346, 2387, 2449 and 2472, and every topic is what its name says. No commercial simulator is named in any of the seven lessons or tools (grep over every lesson/math/Tool file). None of them contains a chemical equation, so there is nothing to balance.

## frontEndLoading (FEL / AACE classes)

**WRONG**
- `gui/src/ui/methods/frontEndLoading.ts:339`, stage "execution": *"no part of the engine reads a vendor quotation."* This has been false since C98. `src/postProcessing/costing/DeclaredQuote.H:24-56` reads `costing { quotes ( { value; currency; year; basis installed|purchased; source; ... } ) }` and enters it as C_BM, and its own comment calls the number "a vendor's price". This is a stale statement of an absence (the BURY-THE-ABSENCE rule). Consequence: a student is told the engine cannot use the one input it accepts for items that no correlation prices, such as the apalutamide tablet press (`apalutamide01_tablets/system/postDict:41`).

**OK-verified**
- AACE table (`frontEndLoading.ts:65-86`) matches `src/postProcessing/EstimateClass.H:99-115` field for field.
- The "best = worst" overlaps are exact: Class 5 optimistic (-20/+30) = Class 3 pessimistic, and Class 4 optimistic (-15/+20) = Class 2 pessimistic.
- Separating ratios: 1.5/0.7 = 2.14 ("more than twice") and 1.1/0.9 are right. σ·√(2·0.1) = 0.447σ and √2 = 1.41 are right.
- The `EstimateClass.H:46-53` citation (pessimistic corner, announced) is correct.
- Step 7 volumes: 20.84 m³ (`ammoniaReactor03_equilibriumApproach/expected`, V_R 20.8443) and 8.20 m³ at 5 K (`ammoniaReactor04_kineticSizing/expected`, V_R 8.2013, approach_K 5.0004).
- "The high range ×2-3" is implemented as a multiplier on H only (`frontEndLoading.ts:106`), which is consistent with the quoted 2020 text.

## campaignPlan (batch scheduling)

**SUSPECT**
- `campaignPlanLesson.ts:157-160`, step 6: "a second tank out of phase gives the dryer back the limit." In toy A (`campaignPlanToy.ts` toyAStages) the tank's other steps total 3 h. With two tanks the dryer limits only if its run d satisfies d > (3+d)/2 (i.e. d > 3 h) **and** d > 3.5 h (the press and coater cycles). For 3 < d < 3.5 the press paces the train, not the dryer. The sentence also reads as if "the dryer idles while d < 3" applies to one tank, but with one tank the dryer idles for every d. Consequence: a student slides into a range where the page contradicts the text.
- `campaignPlanLesson.ts:195`: "928.2 h" against the golden 928.25 (`donepezil02_two_strengths/expected:696`). It is truncated rather than rounded. Cosmetic only; the test (`campaignPlan.test.ts:434`) tolerates it.

**OK-verified**
- Every `BatchPlanPass.H` citation lands on the quoted line: :31-42, :42, :97, :98, :101-102, :108, :109, :111, :112, :113, :114, :115-119, :120, :121, :122, :123, :138-140, :159-162, :210, :214, :219-220.
- `BatchPlanPass.cpp:518` is the 1e-9 ceil guard.
- `apalutamide01_tablets/system/postDict` lines 112, 113, 170 and 178 say what is claimed.
- The golden confirms the solution tank is the limiting stage (`apalutamide01_tablets/expected:989`).
- Quiz figures: 10 156/410.4 = 24.75, so 25 lots (golden lotsPerYear 25, production 10 260.26). The 7/2 = 3.5 h out-of-phase question is right. Two products with directional cleans give the same hours in either order, and the toy's test checks that (`campaignPlan.test.ts:425-430`).

## demandForecast

The method set is trend OLS, DDD bottom-up and logistic share. There is no moving average, exponential smoothing, MAPE or RMSE, so there was nothing of that kind to check.

**WRONG**
- `DemandForecastTool.tsx:369,381`: the column "factor that would fill the plant" prints `r.fillFactor`. `demandForecastMath.ts:384` computes that as Q/mean(M·s·**φ**). Step 6 (`demandForecastLesson.ts:166-180`) defines φ_fill = Q/mean(M·s), and the note directly below the table (`DemandForecastTool.tsx:393`) multiplies by φ to get that. The test confirms the gap: `demandForecast.test.ts:170` asserts fillFactor(φ=6)·6 = fillFactor(φ=1). Consequence: with any capacity factor other than 1, the table and the sentence under it give two different "fill factors" for the same label (at φ = 6 they differ by a factor of 6).

**SUSPECT**
- Step 7 (`demandForecastLesson.ts:183-200`) does not say that the engine takes production fraction **1** for every year after the pasted list (`EconomicsPass.cpp:1027-1030`). It also does not say that a list longer than `projectLife` is refused (`:1119-1126`). The default horizon is 10 (`DemandForecastTool.tsx:173`). A forecast that never fills the plant is silently treated as full output after the horizon. The patent lesson does state "1 afterwards" (`patentExpiryLesson.ts:83`).
- Quiz "capacity-factor" feedback (`:262`): "A factor of 6 means the plant sells six times the whole forecast market." By the page's own N = M·s·φ, it is six times the forecast **share** (equal to the whole market only when s = 1).

**OK-verified**
- OLS, R², s = √(SSE/(n−2)), the two-sided slope p, and the prediction interval with the leading 1 all match `demandForecastMath.ts:200-229`.
- The ×10 jump refusal matches `:143-160`, and the ×100 warning matches `:168-175`.
- The DDD formula matches `dddPacks` (`:255-260`).
- The logistic curve matches `:274`.
- `rampUp ∈ [0,1]` is refused otherwise (`EconomicsPass.cpp:1128-1133`).
- The WHO DDD wording is correct.

## patentExpiry

**SUSPECT**
- Step 6 (`patentExpiryLesson.ts:177`) says "a price curve twice as deep", but the implementation halves the price ratio (`PatentExpiryTool.tsx:51`, `patentExpiryMath.ts:248`: "0.5 = erosion twice as deep"). At 4 producers ρ goes 0.21 → 0.105, so the erosion goes from 79 % to 89.5 %, which is not twice as deep. Step 4's own definition ("half the curve's") is correct. Consequence: the label misleads about the size of the sensitivity.
- The price-by-time curve is averaged over the two ends of each year (`patentExpiryMath.ts:340`). The step 4 formula p = P0·ρ·f does not say so (minor).

**OK-verified**
- 2121 × 0.533 × 0.92 = 1040.05; 1039/19.13 = 54.3 M tablets. Both match the dossier (`docs/design/apalutamide-design-basis-dossier.md:262,284,339`).
- FDA (Conrad & Lutter 2019) 39/54/79/>95 % and EC 2009 25 %/40 %/30 %/45 % carry page citations. ">95 % ⇒ 0.05 is an upper bound" is stated correctly.
- p* = PV/Σ N_j v^j matches `runModel` (`:344-385`), and the "discounted-volume-weighted ≠ volume-weighted" argument is right.
- The price conversion EUR/tablet → EUR/kg (`:367,382`) is correct, and the case's price checks out: 4.0/0.00072546 = 5513.8 (`apalutamide01_tablets/constant/economics:61`).
- The claim that rampUp scales revenue and variable costs but not the fixed COM or the working capital is correct (`EconomicsPass.cpp:1917-1923, 1878`).
- PTE/SPC and data protection are named without durations. The not-advice disclaimer is present (`:37-43`).

## ipStrategy

**OK-verified (spot-checked against the cited articles)**
- EPC Art. 52, 54(2), 55(1), 56, 60(1), 63(1), 63(2)(b), 64(1)-(3), 76(1), 83, 87(1), 93(1), 99-101, 115, 138.
- TRIPS Art. 33 and 34. PCT Art. 21(2)(a), Art. 22(1) (30 months) and EPC R. 159(1) (31 months).
- 35 USC 102(b)(1), 120 and 273(a).
- Directive 2016/943 Art. 1(3)(b), 2(1), 3(1)(a)-(b) and 4.
- UPCA: entry into force 1 June 2023; Art. 32(1)(a)-(e), (g); 33(8); 35(1) (Lisbon/Ljubljana); 83(1), (3)-(5); 9(5); and 18 states.
- G 1/92, G 1/23, G 3/97, Huawei v ZTE C-170/13, PRE v Columbia 508 U.S. 49, T-321/05, Therasense 649 F.3d 1276, FilmTec v Hydranautics 982 F.2d 1546.
- `DEADLINES` (`ipStrategyLesson.ts:1089-1100`): 12/18/30/31 months from priority, and 240 months from filing.
- Not checked (no primary text available here): the CPI article numbers (313-315, 99, 105, 121, 122, 142, 58) and T 406/91 / G 2/21 Reasons 74. Nothing I read contradicts them.

## sinesPta

**OK-verified**
- Merchant shares: 1−450/700 = 0.357, 1−470/700 = 0.329, 1−450/630 = 0.286. Also 0.85 × 560 = 476 against 470.
- Bargain-purchase gain: 4503.5 − 1640.6 = 2862.9.
- West/Asia spread ratios of 2.66, 2.25, 2.20 and 2.14 bear out "more than twice in every year 2014-2017" (`sinesPta.ts:456-467`).
- Capex is "stated seven times" and `CAPEX_HISTORY` has 7 rows.
- Units: kt × US$/t = 10⁻³ M US$, ÷ X (US$/EUR) gives M EUR (`sinesPta.ts:283-284`).
- The NPV and break-even are exactly linear in s, with the slope matching `npvSlopeInSpread` (`:297-310`).
- Every calculator input carries a status (documented or assumption) with its basis (`:167-233`).
- The PTA-in-PET ratios (0.85 t/t; 850 g PTA + 350 g MEG per kg) agree with the stoichiometric 166.13/192.17 = 0.865.

## siteProcessPrice

**SUSPECT**
- Step 4: Y = m_P/(n_L·M_P) (`siteProcessPriceLesson.ts:107`, `siteProcessPriceMath.ts:202`) assumes one mole of product per mole of limiting reactant. The text says "what the limiting reactant could give in theory" but gives no stoichiometric coefficient. A route that is 2:1 (e.g. a dimerisation) gets its yield wrong by a factor of 2. This is a special case presented as general.

**OK-verified**
- Tie weight x* = (R_a − R_b)/(s_bj − s_aj): the common denominator cancels (`siteProcessPriceMath.ts:69-74`).
- Quiz numbers: (18+9)/4 = 6.75 and (24+5)/4 = 7.25; PMI 106/7.5 = 14.13 and E = 13.13; 14.55 × 0.8 = 11.64 and 14.55/1.2 = 12.125.
- `stepDown`/`stepUp` are exact inverses (`:254-273`).
- No figures about any real place, market or patent are shipped.
