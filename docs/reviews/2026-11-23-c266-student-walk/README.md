# C266 -- the student walk (2026-11-23)

Walked AS A STUDENT at 1440x900 with Playwright (chromium), in the RUNNING app
with a REAL engine: Emscripten 3.1.6 was installed from emsdk in the cloud
container and `make -j4 wasm-gui` built all five binaries; the dev GUI
(`vite`) served them.  Branch `c266-walk`, from origin/claude/choupo-simulator-new-session-s494v2.
Covered: the reference plant (run, Streams, Variables, Plots, Log, Case, Reports,
Pinch), column19 (MTBE), column14 (Klemola), the EduTools home and Find, Browse tutorials,
all 105 registry entries (99 distinct tools) opened for console errors / NaN / undefined
text, and a sample of 23 cases across steady, batch, ctrl, unsteady, plant and props.

Limits of the walk: software WebGL in the container freezes the tab on the Reports page
(its 3D layout section), so the 3D view was NOT judged (WebGL was disabled for
screenshots of Reports).  No console errors on any page; all 99 EduTools open without NaN or
undefined text.  Screenshots at 1x unless the name says 2x.

## Ranked findings

S1 = a colleague notices it and it looks wrong; S2 = confusing; S3 = polish.
Owner GUI = this branch can fix; ENGINE/CASE = laptop.

| # | sev | where | what is wrong | screenshot | owner |
|---|---|---|---|---|---|
| 1 | S1 | props cases, Studies (psat01, steam01, psychro01, binary01, relief02, nrtl01: 6 of 6 sampled) | "No figure published" on every one.  psychro01 is a psychrometric chart case and binary01 an LLE map: the chart is only a CSV in "Other plots".  The case's question is not answered on screen.  (C477 surface, so not touched.) | S1-props-psychro01-no-figure, S1-props-binary01-no-figure | ENGINE/CASE (C477) |
| 2 | S1 | steam01_if97_verification, Studies | 61 values keyed `cp`, `cv`, `h`, `psat_MPa`, `v`, `w` with "unit not published" beside each, no comparison with the IAPWS Table 5/15 values the case is meant to verify; `v` printed as 0.001.  psat01 prints raw keys `fit.0.value_leastSquares`, `minimax_max_scaled_start` | S1-props-steam01-no-units | ENGINE/CASE |
| 3 | S1 | reference plant, Plots > Profile > FEHE | T_cold runs 650 -> 216 K and T_hot 733 -> 263 K, but the exchanger's own KPIs and the stream table say cold 276 -> 650 K, hot 733 -> 337 K.  The profile arrays run four steps past the exchanger ends (log line ~4781): the cold side appears to cool below its own inlet.  Axes read `T_cold`, `T_hot`, `position` with no units | S1-reference-plant-fehe-profile | ENGINE |
| 4 | S1 | reference plant, Reports > Economic appraisal | NPV -3237.87 M EUR, IRR dash, payback "never"; revenue 206 M EUR/yr against COM 724 M EUR/yr.  Honest (cited prices) and stated ("NPV = 0 at 1.930 EUR/kg"), but it is the first number a colleague reads on the plant shown | S1-reference-plant-economics-npv | CASE |
| 5 | S1 | column19/20 (MTBE) | the headline "held within 2.5 % of the reference simulator" is nowhere on screen: no declared views, no anchors; the description says "nothing validated against a measurement"; the comparison lives in a thermoPhysPropDict comment.  column14 (Klemola) has the parity plot and Table 2 and reads well | ok-column14-parity | CASE |
| 6 | S2 | reference plant, run header | 107 advisories (8 warning-level: Gnielinski outside window, FEHE design pressure 166 bar above SS316's 100 bar rating, cost extrapolated outside its range) directly under the header; column19 47, swro01 132 | S2-reference-plant-107-advisories | ENGINE/CASE |
| 7 | S2 | ctrl02, Plots | lands on "Global balances": a flat mass line on a -0.5..1 kg axis; the case's question (does T hold its setpoint after the disturbance) is on the Control tab and in the Trajectory sidebar entry, not what Plots opens on | S2-ctrl02-plots-lands-on-balances | GUI (default view choice) |
| 8 | S2 | ctrl02 Flowsheet | header says PRODUCTS none although the case has a product stream; MASS not published; dynamicCSTR card shows `UA = 50`, `T_jacket = 320` with no units (steady cards print `T = 370 K`) | S2-ctrl02-products-none-no-units | GUI/ENGINE |
| 9 | S2 | ed01_nacl_desalination, rectifier card | "POWER electricity (generated)  W = +0.1 kW  -0.0 EUR/h" for a unit that consumes power; `current = 8 -` carries a dash instead of A | S2-ed01-electricity-generated | ENGINE/CASE |
| 10 | S2 | swro01_campoDalias, canvas | node boxes overlap and clip labels (IntakeChamber under IntakePump, Remineralisation under Disinfection); 15 pipes unrouted by rule | S2-swro01-node-overlap | GUI (layout) |
| 11 | S2 | reference plant, Reports > Equipment design | ten identical H2Buffer vessels (V-105A..J, 362.3 m3, 4.03 M EUR each, 55 % of capital) named `vessel1 (vessel)`; header `C_TM (EUR)` unexplained; size `192.6 A (m2)` | S2-reference-plant-equipment-list | CASE |
| 12 | S2 | column19, Plots legend and Streams | `isoButane` and `isoButene` one letter apart in one legend; raw `extent_kmol_h`, `In K_a`; Streams Role column truncated to `F...`/`P...` | S2-column19-profile-legend, S2-column19-streams-role-truncated | GUI |
| 13 | S2 | ignition01 (a deliberate failure) | red "Run failed" with an empty canvas and no reason on screen.  FIXED (below) | fix2-before / fix2-after | GUI, done |
| 14 | S3 | EduTools home | the tab title read "Tool: home".  FIXED | fix1-before / fix1-after | GUI, done |
| 15 | S3 | ctrl02 Control | right-axis tick labels clipped at the panel edge, `t [s]` half under the footer, left axis titled "MV [K]" while it carries the PV range | S3-ctrl02-control-axes-clipped | GUI |
| 16 | S3 | reference plant, Pinch | legend text "cold composite (sinks, slid)" crossed by the curve; the red "Partial analysis" banner on the plant being shown | S3-pinch-legend-overlap | GUI |
| 17 | S3 | reference plant, run header and Variables | mass closure 99.9971 % (not 100); Variables values (49.3, 1180, 13700) have no unit column; Plots sidebar lists "nothing published" for 8 units | -- | ENGINE/GUI |
| 18 | S3 | run tooltip | the "Run the flowsheet" tooltip stays over the PRODUCTS line right after a click | any run screenshot | GUI |
| 19 | S3 | pinch-composite, methane-assembly | two sections numbered "1 ·" in pinch-composite; methane-assembly says "six rungs" and names methane01..methane07; "with the page of the paper they are read from" | -- | GUI |
| 20 | S3 | EduTools | BRAIN says 89 tools; the app counts 99 | -- | BRAIN |

Good: flash01, shortcut01, evaporator01, batch03, still01, unsteady01, hda, ammonia02,
column14, stiff-chemistry, methane-assembly, pinch-composite, electrolyte-models run or open
cleanly; the reference plant runs in 8 s and converges (mass 99.9971 %, energy residual 0.002 %).

## Fixes made on this branch (gui/ only)

1. EduTools home tab read "Tool: home" -> "Tool: EduTools home" (`gui/src/ui/MenuBar.tsx`).
2. A failed run now shows the engine's own last `ERROR:` line on the run strip
   (`engineFailureLine` in `gui/src/case/runSummary.ts`, drawn in `RunSummaryStrip.tsx`);
   ignition01 shows `Engine: ERROR: NASA9Cp: H asked at T <= 0 K`.  Tests added in
   `gui/tests/resultUnits.test.ts` (20 pass); `npm run typecheck` clean.
