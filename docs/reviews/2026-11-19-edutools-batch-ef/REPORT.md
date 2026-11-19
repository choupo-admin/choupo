# EduTools batches E and F: ten wrong statements in eight lessons

Read-only on main, 2026-11-19, at Vitor's request (the batch plan is on
SESSIONS.md).  Evidence with file:line: [edutools-e.md](edutools-e.md)
(compression, pumpSystem, drying, merkel) and [edutools-f.md](edutools-f.md)
(chromatography, fluidisedBeds, syngas, limitingReactant).

## Wrong

1. **compression step 5: the formula shown and the numbers quoted
   disagree.**  W_N/W_1 = N(R^(m/N)-1)/(R^m-1) (`compressionLesson.ts:285`)
   has no intercooler drop; the quoted 1365.6/1281.9/1255.6 kW come from
   `staged()` with the drops (`compression.ts:244`).  The formula gives
   1338.6/1231.4/1182.0 kW and savings of 23/8/4 %, not "a fifth / 6 % / 2 %".
2. **compression step 1: stale citation.**  The shaft power is
   `CompressorDesign.cpp:225`, not `:224` (Wgas).
3. **drying, "falling-rate law" limit: stale, and it contradicts step 4.**
   The engine announces a declared van Meel curve (`BatchDryer.cpp:331-339`)
   and accepts measured tables with two falling-rate periods.
4. **drying step 5: "the tail never touches X_eq" holds only for n >= 1.**
   The knob goes to 0.3, and the engine (`BatchDryer.cpp:358`) and step 4 say
   n < 1 reaches X_eq in finite time.
5. **fluidisedBeds: a group C powder is drawn as "bubbling"** (the 15 um
   preset at 0.2 m/s gives psi = 31 %, `fluidisedBeds.ts:388-396`).  Step 2
   and the page's own laboratory say it does not fluidise.
6. **syngas: "CO2 >> CH4 > CO ~ N2" is wrong for the host's zeolite5A
   records.**  At 313 K CO's Henry slope is 1.54 against CH4's 0.87; CH4
   reaches the product first only because the feed carries more of it.
7. **syngas: "every exercise reports both" (H2/CO and the module)** is false;
   the PSA table shows neither, and the pressure table has no module
   (`syngasExercise.ts:610-615`).
8. **limitingReactant: typed numbers drift from the golden.**  The page
   quotes inlet 3.589 and X 0.355; the golden gives 3.584 and 0.350, and the
   test pins only the text.
9. **limitingReactant: "the loop throws away about 0.2 % of its unreacted
   gas"** (`limitingReactantLesson.ts:199`).  The case's splitter declares
   0.085 % (`greenAmmonia0x/PurgeSplit/system/flowsheetDict:8`).  With it,
   the page's own closed form predicts a shift of 0.124, not the 0.053 that
   "agrees" with the case's 0.057 -- the agreement rests on a purge that is
   not the case's.  The laptop should confirm the basis before fixing.

## Suspect, the most useful

- **merkel and drying knobs** reach supersaturated air (about 60 % of
  merkel's moisture range at 25 C; the drying humidity knob to 0.04 at 300 K)
  and a T below the wet-bulb bracket.  The engine refuses by name, but the
  student meets a refusal the page invited.
- **compression:** "a real-gas departure raises a warning" -- only stage 1,
  above 5 %, on stdout (`CompressorDesign.cpp:626`).
- **pumpSystem:** Q* is defined in m3/s and the tool shows only kmol/h.
- **fluidisedBeds:** choosing a gas leaves mu at air's value.
- **limitingReactant:** the no-steady-state alert says B accumulates; A does.

## Verified

- chromatography has no wrong statement (van Deemter, the moments,
  resolution, and the 800-cell note recomputed).
- compression: the polytropic head and the efficiency relation.
- The pump and pipe formulas.
- drying: the wet bulb and the break time.
- merkel: the integral and its Chebyshev check.
- fluidisedBeds: Ergun, Wen-Yu, Mori-Wen.
- syngas: the module identity.
- limitingReactant: the closed form.
