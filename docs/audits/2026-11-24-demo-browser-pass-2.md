<!-- Copyright (C) 2026 Vítor Geraldes -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# Second browser pass of the 2 December demonstration path, on the published site (2026-11-24)

The site served `https://www.choupo.org/app`, whose WASM carries the build stamp `{"version":"Choupo-dev","commit":"d51d651da"}` (`/wasm/version.json`; `/buildinfo.json` reads `d51d651dab96d30b2dca68ab8b7cfab47ed4bfd1`, built 2026-11-24 18:44 UTC; the engine banner in every run log prints `Choupo-dev (commit d51d651da)`), which is the required commit.  Browser: Playwright's headless Chromium, viewport 1440x900, scale 1, on 2026-11-24, fresh profile for every stop, on the network of a cloud container.  Covered: all six stops of `docs/demo/demonstration-path-december.md` as it reads on `main` (d51d651dab), every `?case=` link written as the document writes it (bare name), the PEQ sub-steps 1 to 6, both EduTools of stop 5, the one Theory link the document names, and the re-check of each first-pass problem.  Not covered: sub-step 7 of the plant (the 3D layout froze the page, see below; the layout numbers were read from the page text instead), a screenshot of the economic appraisal (the page froze when asked to draw it), the quizzes' answers (the transfer-unit quiz was present but not answered this time; methane-assembly's is present), a second browser, a human reading of any screen (everything was read from the DOM text and from the screenshots by the auditor).  Times are measured from the click on "Run flowsheet" to the text "Run complete" in the page, one browser at a time except where said.  Nothing was fixed.

**Headline.**  Bare-name URLs now open the case, the console is clean, the two "received run" lines are one, the transfer-unit step 5 now ends with numbers instead of an error (after about 4 minutes 40 seconds), and the nox02 legend no longer covers the plot.  Not fixed: the converter drill-in tab still reads "convergence not published" and "ENERGY not published" (that fix is not on the site: it is not in `main` either), and the PEQ 3D layout froze the page for more than 7 minutes on two attempts.

## Stop 1 -- flash01

Opened with `?case=flash01_benzene_toluene` (bare name): the URL became `?case=steady%2Fflash%2Fflash01_benzene_toluene` and the case opened directly.  Run: 3.1 s, converged, mass 100 %, 3 advisories.

| doc says | on screen | match |
|---|---|---|
| the log prints every Newton iteration of the Rachford-Rice solve | Log: table `it V g(V) dg/dV dV`, rows 0 to 3 (V 0.5 to 0.30398357, g 2.9e-13), then "Iterations: 5 (CUMULATIVE ...)" | yes |
| the Theory link of the block opens the section that derives it | a click on the flash01 card shows "Theory -- the section deriving this unit"; it opens `guide.html?g=theoryGuide#nameddest=ch%3Aflash`: "4 Isothermal flash, vapour-liquid", page 213 of 489 | yes |
| (the log also carries) | still a wall of `[stderr]` lines (`reviewStatus` not declared, extrapolated saturation pressure) | not a "thirty seconds" screen |

Screenshots: `s1-run.png`, `s1-flash01-panel.png`, `s1-flash01-theory.png`.

## Stop 2 -- column19_mtbe_reactive_mesh

Bare name opened the case (`steady/distillation/column19_mtbe_reactive_mesh`).  Run: 36.3 s, converged, mass 99.9999 %, 47 advisories.

| doc says | on screen | match |
|---|---|---|
| condenser duty 2.73 % larger than the reference run | Plots > Declared views: -7.60211 MW against -7.4, relative -2.73 % (larger in magnitude) | yes |
| reboiler duty 1.60 % larger | 7.76232 MW against 7.64, +1.60 % | yes |
| top and bottom temperatures within 0.48 K and 0.63 K | 323.924 against 324.4 (-0.476 K), 400.674 against 401.3 (-0.626 K) | yes |
| conversion 0.1 % lower | 0.987709 against 0.9887, -0.100 % | yes |
| "Read it right" note, a cross-check not a validation | present, the same words | yes |

Screenshots: `s2-run.png`, `s2-plots.png`, `s2-streams.png`.

## Stop 3 -- column14_klemola_c4_splitter

Bare name opened the case.  Run: 41.3 s (the first minute overlapped the start of the plant's run in another browser), converged, mass 100 %, 22 advisories.

| doc says | on screen | match |
|---|---|---|
| i-butane in the distillate 93.90 against 93.5 (+0.43 %) | 93.9039 against 93.5, +0.432 % | yes |
| n-butane in the bottoms 97.98 against 98.1 (-0.12 %) | 97.979 against 98.1, -0.123 % | yes |
| parity plot and Table 2 beside the run | Plots > Declared views: the parity plot and "Klemola and Ilme, Table 2: measured plant against Choupo" | yes |
| the two minor keys miss in opposite senses, the paper's balance fails on them | n-butane in the distillate -95.9 %, i-butane in the bottoms +37.0 %; the page says so, in kg/h too | yes |
| (not quoted) boiler duty | 9.76215 against 10.24 MW (-4.67 %); the page notes the reboiler's own envelope 10.46 MW | -- |

Screenshots: `s3-run.png`, `s3-plots.png`, `s3-streams.png`.

## Stop 4 -- ammoniaPEQ_baseCase

Bare name opened the case (`plant/ammoniaPEQ_baseCase`).  Run: 40.4 to 42.4 s on four runs (two recycle loops, converged).  Header: MASS 99.9971 %, ENERGY residual 1.761 kW (0.00207 %), 162 advisories.

| sub-step | doc says | on screen | match |
|---|---|---|---|
| 1 flowsheet | the units listed; drill into the converter | all present (`p1-peq-run.png`); a double-click on CONVERTER opens a new tab with Bed1..Bed3, two inter-bed coolers and their steam duties (16 013 and 13 405 kW) (`p1a-peq-converter-drill.png`); that tab's header reads "Run complete: convergence not published; 22 advisories", "CONVERGED not published", "ENERGY not published" | flowsheet yes; the drilled tab is NOT as the first-pass re-check expects (see below) |
| 2 balances | closure line printed | MASS 99.9971 %, ENERGY residual 1.761 kW (0.00207 %); Streams tab: mass imbalance 0.00292 %, energy 0.00207 % (streams in 533.1, out -57 167.7 kW, boundary Q -57 699.0 kW), "3 closures by construction, 3 verified by a second route" (`p2-peq-streams.png`) | yes |
| 3 FEHE | cold 275.48 -> 651.16 K, hot 735.56 -> 338.72 K, duty 64 381 kW | Plots > FEHE > Profile, from the curve data: cold 651.162 -> 275.478, hot 735.558 -> 338.716, 21 points each (`p3-peq-fehe-profile.png`); Log: "Q = 64380.73 kW, LMTD = 73.31 K", pinch lines "recovered FEHE ... -64380.7280 kW"; the Pinch table prints 64400 (three figures) | yes |
| 4 pinch | the pinch includes the converter segment (C302) | Pinch tab: Q_C,min 71 400 kW; CONVERTER.InterbedCooler1 (788 -> 693 K, 16 000 kW) and InterbedCooler2 (764 -> 683 K, 13 400 kW) are in the stream population (`p4-peq-pinch.png`) | yes |
| 5 equipment | TCI 167.9 M EUR; ten H2 buffer vessels one grouped row, 43.4 % of its cost | Reports > Equipment design: one row "V-004A-J H2Buffer, vessel x 10 (identical, in parallel), 362.3 m3 each, 40 253 381 EUR, 43.4 %" (`p6-peq-equipment-table.png`); TCI in the appraisal: 167.86M EUR | yes |
| 6 economics | NPV -3 288 M EUR; break-even 1.95 EUR/kg ammonia (3.7 x the market) and 1.68 EUR/kg hydrogen; prices 0.530 (Eurostat) and 8.0 (ACER, October 2025) | NPV -3287.69M EUR; "NPV = 0 at 1.952 EUR/kg of ProductNH3 (declared 0.5300)" and "NPV = 0 at 1.685 EUR/kg of H2Feed (declared 8.000)"; the prices table: H2Feed 8 EUR/kg, 2025, published, ACER pdf p. 40 with its quotation; ProductNH3 0.53 EUR/kg, 2025, published, Eurostat DS-045409 CN 28141000 | yes; the hydrogen break-even reads 1.685 on screen against the document's 1.68 (a rounding of 1.685 either way) |
| 6 (cont.) | hydrogen alone 0.1803 x 8 = 1.44 EUR/kg of ammonia | searched Reports (all sections), Streams, Log, Pinch: not on screen | not found (the document says "say first", so this is a spoken number) |
| 3 and 5 (cont.) | advisories | the doc's open item quotes 107; the header reads 162 | differs (162) |
| 7 3D layout | roads, fence, gates, piped stores, utilities block | the page FROZE: after the click on "Plant layout (3D)" the renderer did not answer for more than 7 minutes, on two attempts in a clean browser (every poll of `document.title` timed out; the screenshot timed out at 180 s).  The same click on `line01_pumped_drum` answered in 17 s.  From the page text (the section is already in the DOM): Items placed 33, Pipes routed 34 (1387 m), Utility lines 13 (2062 m, unsized), Not routed 6, Layout findings 0, Plot area 39 220 m2, TCI 168 MEUR, NPV -3290 MEUR, plant boundary duty -57.7 MW, shaft work 13.73 MW, first-law residual 0.00207 %; a line "NOT routed and not marked: CONVERTER.Bed1Out, Bed2Feed, Bed2Out, Bed3Feed"; "PreheatedFeed: NOT routed" | **broken in this browser** (cause not examined; first pass opened this scene in 10 s) |

A related symptom: after the click on "Economic appraisal" the page also stopped answering twice when the click went to a paragraph that names it instead of its button, and a screenshot taken while the scroll position was at the appraisal figures timed out at 180 s.  The text of the appraisal was read in a run where the button itself was clicked and the screenshot was taken at the top of the page.  No economic-appraisal screenshot was obtained.

## Stop 5 -- the two EduTools

**transfer-unit** (`?workspace=methods&tool=transfer-unit`).  Opens at once; at the default sliders: lambda 0.714, N_t (Kremser) 5.53, N_OG 6.51, HETP 0.707 m (as in the first pass).  **Step 5 now ends with numbers, not the red "not in the bundled corpus" line**: after 282 s (second run, alone; first run 290 s) the panel shows packed height Z 2.200 m, mean H_OG over 100 segments 0.1582 m, N_OG = sum dz/H_OG 13.911, mean lambda 0.965, HETP from H_OG and lambda 0.1613 m against the engine's published 0.1609 m, theoretical stages 13.672, N_OG/N_t 1.017, lambda implied 0.966, each with its ORIGIN badge (`t2-transfer-unit-engine.png`).  A banner on the page says "The engine flagged 4 caveats (2 about a model used outside its validity) on the runs behind this page".  The wait is about the same as the first pass's 300 s: a colleague watches "Running the engine in the browser..." for nearly five minutes.  The quiz "Check your understanding" is present (four questions, answers not clicked this time).  Console: nothing.

**methane-assembly** (`?workspace=methods&tool=methane-assembly`).  "run the six rungs": 11.8 s, six rows, no error (`m1-methane-ladder.png`).

| rung | reactions | ignition delay [us] | final T [K] |
|---|---|---|---|
| H2/O2 core alone | 21 | none | 1244.0 |
| + attack on CH4 | 26 | none | 1243.3 |
| + methyl step | 38 | 26.0 | 2101.6 |
| + CH2O to CO | 56 | 24.0 | 2163.1 |
| + CO to CO2 | 60 | 24.0 | 2170.4 |
| + two CH3 make ethane (assembled) | 67 | 324 | 2199.6 |

Measured: 254 us (Petersen, Davidson and Hanson 1999, Table 2, page 86), as the page says.  The quiz is present (`m2-methane-quiz.png`).  The rows equal the first pass's.  The document quotes no number for this tool.

## Stop 6 -- nox02_millerbowman_denox

Bare name opened the case (`batch/combustion/nox02_millerbowman_denox`).  Run: 7.2 s (5.1 s in the first pass), converged, 19 advisories; MASS and ENERGY "not published" (a batch case).  One attempt in an earlier browser failed to find the Run button within 30 s (the case had not drawn); the next three opened normally.

| doc says | on screen | match |
|---|---|---|
| minimum 16.7 ppm NOx at 1225 K | Plots > Declared views: Choupo series minimum 16.7182 ppm at 1225 K (17 points); digitised paper curve 17 ppm at 1225 K; measured points 14.5 ppm at 1229 K (`n2-nox02-plots.png`) | yes |
| paper's model curve within 2.9 ppm rms; Cantera within 1.7e-3; about 1.2 times Cantera's time | the document says not to look for them on screen; "Where every number comes from" lists the three series with their files (`n3-nox02-origins.png`) and none of the three claims | as the document says |
| do NOT open Plots > Trajectory | opened once to check: 357 series, the page now states "legend hidden, hover to identify" (the legend no longer covers the plot), but the plot is still unreadable: flat lines on a double axis (`n4-nox02-trajectory.png`) | the trap stands, softened |

## Console, all stops (deduplicated, verbatim)

Collected with `console` (error and warning), `pageerror` and every HTTP response of 400 or more, on every page load of stops 1, 2, 3, 4, 6 and both EduTools.

| entry | count |
|---|---|
| (nothing) | 0 on every page |

The first pass's three entries per load (the `[tutorials] skipping 'props/curation/fixtures'` warning, the 404 of `/__thermoml/index.json` and its "Failed to load resource" error) are gone.  No `pageerror`.  The 3D scene of `line01_pumped_drum`, opened as a control, adds the same 4 WebGL driver warnings as the first pass (`GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels`, 3 + 1), software GL of the headless browser.  The PEQ layout never answered, so its console was not read.

## Timings (click on Run to "Run complete")

| stop | this pass | first pass |
|---|---|---|
| 1 flash01 | 3.1 s | 2.1 s |
| 2 column19 | 36.3 s | 40.3 s |
| 3 column14 | 41.3 s | 47.4 s |
| 4 PEQ plant | 40.4 to 42.4 s (4 runs) | 44.8 s |
| 5 transfer-unit step 5 | 282 to 290 s, ends with numbers | 300 s, ends with an error |
| 5 methane-assembly ladder | 11.8 s | 12.3 s |
| 6 nox02 | 7.2 s | 5.1 s |
| 4.7 PEQ 3D layout | no answer after more than 7 minutes (two attempts) | opened in about 10 s |

## First pass problems, now

| first-pass problem | now |
|---|---|
| `?case=<bare name>` opens the landing | **fixed**: all six cases open from the bare name, the URL is rewritten to the category path |
| transfer-unit step 5 "not in the bundled corpus", after 300 s | **fixed as to the error** (numbers appear); **still there as to the wait** (282 to 290 s with only "Running the engine in the browser...") |
| nox02 trajectory legend covers the plot | **fixed in part**: the legend is hidden with a hint; 357 series are still unreadable |
| two `received run` lines per click | **fixed**: one line per run (checked on flash01, column19, column14, the plant and nox02) |
| `/__thermoml/index.json` 404 and the `props/curation/fixtures` warning | **fixed**: console empty |
| PEQ converter drill-in tab "convergence not published", "ENERGY not published" | **still there**: the drilled tab reads "Run complete: convergence not published", "CONVERGED not published", "ENERGY not published".  The expected text ("CONVERGED yes (plant run)", energy closed on the plant boundary) is not on the site, and a search of `main` (d51d651dab) for it finds nothing: that fix is not merged yet |
| the doc's numbers against the screen (column19 +2.5 %, column14 +0.24 %, buffer 55 %) | **fixed in the document**: every number the document now quotes was found on screen, except the spoken ones (hydrogen alone 1.44 EUR/kg, nox02's rms, Cantera agreement and time ratio) |
| PEQ 162 against 107 advisories | **still there** (162; the document's open item) |
| PEQ 3D: 6 pipes not routed | **still there** (6 not routed, 4 of them named "NOT routed and not marked"; "Layout findings 0"); the scene itself did not open in this pass |

## Broken or surprising, in the order a colleague meets it

1. PEQ stop, sub-step 7: the page stops answering when "Plant layout (3D)" is opened (more than 7 minutes, two clean attempts); the same click on `line01_pumped_drum` is fine.  Not examined further: it may be the headless software GL on a scene this size, but the first pass opened the same scene in about 10 s on the same kind of machine.  A colleague on a laptop with a real GPU may not see it; it must be tried on the machine of the day.
2. Transfer-unit step 5 makes a colleague wait nearly 5 minutes in front of "Running the engine in the browser..." with no progress shown.  It then works.
3. The converter drill-in tab still reads "convergence not published" and "ENERGY not published" under a plant that reads CONVERGED yes and an energy residual of 0.00207 %.
4. 162 advisories under the plant's run header (the document's open decision: fold them, or say they are the model's validity notes).
5. The economic appraisal and the 3D layout share the Reports page; after the appraisal was opened, drawing or scrolling the page near the layout froze the browser's screenshot twice.  A colleague on a slow machine may feel it as a stall.
6. nox02 Plots > Trajectory is still unreadable (357 flat series); the document says to skip it.
7. flash01's log is a wall of `[stderr]` lines (extrapolated saturation pressure, `reviewStatus` not declared) before the iteration table.
8. The hydrogen-alone figure (0.1803 x 8 = 1.44 EUR per kg) is not shown anywhere on screen, and the document's spoken numbers for nox02 are not either; both are said, not shown.
