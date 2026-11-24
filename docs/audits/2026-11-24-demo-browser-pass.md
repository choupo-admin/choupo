<!-- Copyright (C) 2026 Vítor Geraldes -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Browser pass of the 2 December demonstration path, on the published site (2026-11-24)

The site served `https://www.choupo.org/app`, whose WASM carries the build stamp `{"version":"Choupo-dev","commit":"afd3f8ff9"}` (`/wasm/version.json`; the engine banner in every run log prints `Choupo-dev (commit afd3f8ff9)`), which is the required commit.  Browser: Playwright's headless Chromium 157.0.8103.78, viewport 1440x900, scale 1, on 2026-11-24, fresh profile for every stop, on the network of a cloud container.  Covered: all six stops of `docs/demo/demonstration-path-december.md`, the seven PEQ sub-steps, both EduTools with their quizzes and the one Theory link the doc names.  Not covered: the engine's speed against another program (nothing on screen states it), "Pinch" after a manual re-run, a second browser, a human reading of any screen (every screen was read from the DOM text and from the screenshots by the auditor).  Times are measured from the click on "Run flowsheet" to the text "Run complete" in the page.  Nothing was fixed.

**The first finding is about the doc's URLs.**  `?case=<bare name>` does not open the case: the page stays on the landing ("No case open").  The category path opens it: `?case=steady/flash/flash01_benzene_toluene`.  All six stops below were opened by the full path.  The same lookup by bare name fails inside the transfer-unit EduTool (stop 5).

## Console, all stops (deduplicated, verbatim)

Every page load, identically, three entries (count 1 per load):

| entry | text |
|---|---|
| warning | `[tutorials] skipping 'props/curation/fixtures': Tutorial 'props/curation/fixtures' has neither system/flowsheetDict nor system/propsDict` |
| HTTP 404 | `https://www.choupo.org/__thermoml/index.json` |
| error | `Failed to load resource: the server responded with a status of 404 (Not Found)` (the same 404) |

No `pageerror` on any stop.  The 3D layout (stop 4, step 7) adds 4 WebGL driver warnings (`GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels`, 3 + 1), software GL of the headless browser, not necessarily seen on a laptop.

## Stop 1 -- flash01

Opened with `?case=steady/flash/flash01_benzene_toluene`.  Run: 2.1 s, converged, mass 100 %, 3 advisories.

| doc says | on screen | match |
|---|---|---|
| the log prints every Newton iteration of the Rachford-Rice solve | Log tab: table `it V g(V) dg/dV dV`, rows 0 to 3 (V 0.5 to 0.30398357, g 2.9e-13), then "Iterations: 5 (CUMULATIVE ...)" | yes |
| the block's Theory link opens the section that derives it | click on the flash01 card, panel link "Theory -- the section deriving this unit" opens `guide.html?g=theoryGuide#nameddest=ch:flash`: "4 Isothermal flash, vapour-liquid", page 213 of 489 | yes |

Screenshots: `01-flash01-panel.png`, `01-flash01-theory.png`.  The log is also the first thing a student sees as a wall of `[stderr]` lines (extrapolated Antoine for benzene at 370 K, `reviewStatus` not declared for both components); it is honest but not a "thirty seconds" screen.

## Stop 2 -- column19_mtbe_reactive_mesh

Opened with the full path.  Run: 40.3 s, converged, mass 99.9999 %, 47 advisories.  The log shows two `received run` lines (the engine is invoked twice per click on this case and on flash01; not examined further).

| doc says | on screen | match |
|---|---|---|
| condenser duty +2.5 % against the reference simulator | Plots > Declared views: -7.60211 MW against -7.4, **-2.73 %** (Choupo - reference = -0.202 MW; larger in magnitude) | differs in size (2.73 against 2.5) |
| reboiler duty +1.5 % | 7.76232 MW against 7.64, **+1.60 %** | differs (1.60 against 1.5) |
| temperatures within 0.6 K | top 323.924 against 324.4 (-0.476 K, -0.147 %), bottom 400.674 against 401.3 (-0.626 K) | bottom is 0.63 K, a hair over the 0.6 |
| (not quoted) conversion | 0.987709 against 0.9887 (-0.100 %) | -- |
| Trap: until C479 lands the comparison is not on screen | The comparison IS on screen: Plots > Declared views, "The course's reference-simulator run of the same column against Choupo", with a "Read it right" note that calls it a cross-check, not a validation | the trap is out of date at `afd3f8ff9` |
| reboiler Q (case's `expected`, not quoted) | 7762.3 kW in the Streams tab and on the canvas | matches the `expected` |

Screenshots: `02-column19-run.png`, `02-column19-plots.png`, `02-column19-streams.png`.

## Stop 3 -- column14_klemola_c4_splitter

Run: 47.4 s, converged, mass 100 %, 22 advisories.

| doc says | on screen | match |
|---|---|---|
| parity plot and Table 2 beside the run | Plots > Declared views: parity plot (log axes, 1:1 line, anchored keys on the line), table "Klemola and Ilme, Table 2: measured plant against Choupo", predicted temperature and liquid-composition profiles | yes |
| i-butane in the distillate +0.45 % | 93.9039 against 93.5 wt %: **+0.432 %** (+0.404 points) | +0.43, not +0.45 |
| n-butane in the bottoms +0.24 % | 97.979 against 98.1 wt %: **-0.123 %** (-0.121 points) | **no**: the sign and the size differ |
| two minor keys miss in opposite senses | n-butane in the distillate -95.9 %, i-butane in the bottoms +37.0 % | yes (the doc gives no numbers) |
| (not quoted) boiler duty | 9.76215 against 10.24 MW (-4.67 %); the page notes the reboiler's own envelope 10.46 MW | -- |

Screenshots: `03-column14-run.png`, `03-column14-plots.png`, `03-column14-streams.png`.

## Stop 4 -- greenAmmoniaPEQ_baseCase

Opened `?case=plant/greenAmmoniaPEQ_baseCase`.  Run: 44.8 s (two recycle loops, converged).  Header: MASS 99.9971 %, ENERGY residual 1.761 kW (0.00207 %), **162 advisories**.

| sub-step | doc says | on screen | match |
|---|---|---|---|
| 1 flowsheet | N2 boost, two make-up compressors, recycle compressor, FEHE, water cooler, chiller, separator, let-down, storage flash; drill into the converter | all present (canvas, `04-peq-run.png`); a double-click on CONVERTER opens a new tab with the three beds, two inter-bed coolers and their steam duties (`04a-peq-converter-drill.png`); in that tab the header reads "convergence not published", "ENERGY not published" | yes; the drilled tab's two "not published" are a surprise |
| 2 balances | closure line printed | MASS 99.9971 %, ENERGY residual 1.761 kW (0.00207 %); Streams tab: mass imbalance 0.00292 %, energy 0.00207 %, "3 closures by construction, 3 verified by a second route" | yes |
| 3 FEHE | cold 275.48 -> 651.16 K, hot 735.56 -> 338.72 K, duty 64 381 kW | Plots > FEHE > Profile (`04c-peq-fehe-profile.png`), read from the curve data: cold 651.162 -> 275.478, hot 735.558 -> 338.716, 21 points; Log: 64380.73 kW, Q = 64380.73 kW, LMTD 73.31 K; Pinch tab: "installed 64380.7 kW"; Streams table prints 275, 651, 736, 339 (three figures) | yes (the Pinch tables show 64400, three figures) |
| 4 pinch | the pinch includes the converter segment (C302) | Pinch tab: Q_H,min 0, Q_C,min 71 400 kW, "no interior pinch" (threshold problem), CONVERTER.InterbedCooler1 and 2 are in the stream population and in the cascade (`04-peq-pinch.png`) | yes |
| 5 TCI, buffer vessels | TCI 167.9 M EUR; ten H2 buffer vessels show as raw names, carry 55 % of capital | Reports > Economic appraisal: TCI **167.86M EUR**.  Reports > Equipment design (`04-peq-reports.png`): the ten vessels are ONE row "V-004A-J H2Buffer, vessel x 10 (identical, in parallel), 362.3 m3 each, 40 253 381 EUR, **43.4 %**" (of the 34 items' installed cost); no raw names in that table | TCI yes; the "raw names" trap is not seen here; 43.4 % of the equipment table, not 55 % (a share of TCI would be 24 %; the doc's basis was not found on screen) |
| 6 economics | NPV -3 288 M EUR; break-even 1.95 EUR/kg ammonia and 1.68 EUR/kg hydrogen; prices public and cited: ammonia 0.530 (Eurostat), hydrogen 8.0 (ACER, October 2025); hydrogen alone 1.44 EUR per kg ammonia | NPV **-3287.69M EUR**; "NPV = 0 at 1.952 EUR/kg of ProductNH3 (declared 0.5300)", "NPV = 0 at 1.685 EUR/kg of H2Feed (declared 8.000)"; the "Prices and where they came from" table: H2Feed 8 EUR/kg, 2025, published, ACER with page and quotation; ProductNH3 0.53 EUR/kg, 2025, published, Eurostat dataset and CN code; also N2Feed, coolingWater (assumption), steamGenerationHP (undeclared) (`04g-peq-economics.png`) | yes.  "Hydrogen alone 0.1803 x 8 = 1.44" is **not found on screen** (searched Reports, Streams, Log) |
| 7 3D layout | roads, fence, gates, piped stores, utilities block; the process block is small | Reports > Plant layout (3D) opens a live WebGL scene: items placed 33, pipes routed 34 (1387 m), utility lines 13 (2062 m), **not routed 6**, layout findings 0, plot area 39 220 m2; a label on screen reads "PreheatedFeed: NOT routed" and a line names CONVERTER.Bed1Out, Bed2Feed, Bed2Out, Bed3Feed as "NOT routed and not marked" (`04h-peq-layout3d.png`) | scene works; the unrouted pipes are visible to a colleague |

The tables of the path's third and fifth rows are exact to the golden digits; the three-figure tables elsewhere (Streams, Pinch) are not a mismatch.  The advisories line reads 162, not 107 (the doc's open item).

## Stop 5 -- the two EduTools

**transfer-unit** (`?workspace=methods&tool=transfer-unit`).  Opens at once; the sliders' sums read at the default: lambda 0.714, N_t (Kremser) 5.53, N_OG 6.51, HETP 0.707 m.  **Step 5 ("Where Choupo computes them") is broken on the site**: the button "Run ratebased01_schulz_0p10bar and read its H_OG" ends in the red line "method witness 'ratebased01_schulz_0p10bar' is not in the bundled corpus" (`05-transfer-unit-engine.png`), after a wait of 300 s with nothing else.  The case exists in the tree under `tutorials/steady/distillation/`; the lookup is by bare name, the same failure as the bare `?case=`.  The quiz "Check your understanding" works: four questions, a click on an answer prints the explanation and a "Back to" link (`05-transfer-unit-quiz-answered.png`).

**methane-assembly** (`?workspace=methods&tool=methane-assembly`).  Button "run the six rungs": 12.3 s, six rows, no error (`05-methane-assembly-ladder.png`).

| rung | ignition delay [us] | final T [K] |
|---|---|---|
| H2/O2 core alone | none | 1244.0 |
| + attack on CH4 | none | 1243.3 |
| + methyl step | 26.0 | 2101.6 |
| + CH2O to CO | 24.0 | 2163.1 |
| + CO to CO2 | 24.0 | 2170.4 |
| + two CH3 make ethane (assembled) | 324 | 2199.6 |

Measured at this point: 254 us (Petersen, Davidson and Hanson 1999, Table 2, page 86), as the page says.  The quiz ("Check your understanding", questions on the delay definition, rung 1, rung 2, ...) is present at the end (`05-methane-assembly-quiz.png`).  The doc quotes no number for this tool.

## Stop 6 -- nox02_millerbowman_denox

Opened with `?case=batch/combustion/nox02_millerbowman_denox`.  Run: 5.1 s, converged, 19 advisories; "MASS not published", "ENERGY not published", "PRODUCTS none" in the header (a batch case).

| doc says | on screen | match |
|---|---|---|
| minimum 16.7 ppm NOx at 1225 K | Plots > Declared views, "In which temperature window does NH3 remove NO?": the Choupo series has its minimum **16.7182 ppm at 1225 K** (17 points); the digitised paper curve 17 ppm at 1225 K; the measured points 14.5 ppm at 1229 K (`06-nox02-plots.png`) | yes |
| paper's model curve within 2.9 ppm rms | not found on screen (Declared views, "Where every number comes from", Log) | not found |
| Cantera within 1.7e-3 in every species | not found on screen (same places) | not found |
| about 1.2 times Cantera's time | not found on screen; the page shows only its own time (5.1 s) | not found |
| until C477, show the trajectory plot, not the full list of species | Plots > Trajectory draws 357 traces (17 vessels x 21 variables) with a legend that covers the plot and a double axis: unreadable (`06-nox02-trajectory.png`) | the trap holds; do not open it |

## The broken or surprising list, in the order a colleague meets it

1. `?case=<bare name>` (every case URL in the doc) opens the landing, not the case.  Use `?case=steady/flash/flash01_benzene_toluene` style paths, or fix the doc.
2. transfer-unit step 5: red "method witness ... is not in the bundled corpus" (same bare-name lookup).  Other EduTool steps that run a witness may do the same; not tested.
3. Console: a 404 on `/__thermoml/index.json` and the `props/curation/fixtures` warning on every load.
4. column19 comparison is on screen already (Plots > Declared views), with -2.73 % and +1.60 %, not +2.5 % and +1.5 %; column14's second purity is -0.123 %, not +0.24 %.  The doc's lines should be re-read from the screen.
5. nox02: the rms, the Cantera agreement and the speed ratio are not on screen; the trajectory plot is unreadable.
6. PEQ: 162 advisories; the drilled converter tab reads "convergence not published" and "ENERGY not published"; the 3D layout names 6 pipes as not routed, with "Layout findings 0".
7. The H2 buffer share on screen is 43.4 % of the equipment table, not 55 %; the grouped row hides no raw names.
8. Each run of flash01 and column19 prints two `received run` lines in the log (two engine invocations per click).
