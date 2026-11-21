/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  faultDiagnosisLesson -- the lesson of the `fault-diagnosis` EduTool
  ("How a plant tells you something is wrong"; DEV.md 4c C464): fault
  detection and diagnosis, in plain language, from a story that happened in
  the author's own house to the methods an engineer reaches for.

  NO ENGINE IS RUN.  Every number the page prints is computed in
  faultDiagnosisMath.ts / faultSignals.ts / faultChallenge.ts from the
  assumptions the page declares, and tests/faultDiagnosis.test.ts pins each
  one.  The plants are toys; the page says so at the top and in its limits.

  SOURCES, read at the page (the PDFs are in the author's library):
    Seborg, Edgar, Mellichamp and Doyle, Process Dynamics and Control, 4th ed.,
    Wiley, 2017 -- section 10.1.2 (process alarms, p. 163) and Chapter 21
    (limit checking and performance calculations, pp. 397-398; quality
    control charts, pp. 398-403; multivariate monitoring, pp. 407-408; control
    performance monitoring, p. 408).
    Montgomery, Introduction to Statistical Quality Control, 6th ed., Wiley,
    2009 -- chance and assignable causes (section 5.2), the statistical basis
    of the control chart and the average run length (section 5.3, p. 191,
    Eq. 5.2), the cusum chart (section 9.1, pp. 400-401).
  Page numbers are the PRINTED ones.  The literature on fault diagnosis
  proper (Venkatasubramanian et al., Comput. Chem. Eng. 2003; Chiang, Russell
  and Braatz, Fault Detection and Diagnosis in Industrial Systems; Isermann,
  Fault-Diagnosis Systems; the Tennessee Eastman challenge problem) is named
  as further reading by title ONLY: it was not read for this page and no
  number is taken from it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const FAULT_DIAGNOSIS_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A dehumidifier that made the house cooler every few hours",
    body: "This happened in the author's house. A home dehumidifier showed a dip of "
      + "about 0.5 to 0.7 degrees C in the room temperature every 4.5 hours or so, "
      + "and the humidity jumped each time. The first guess was the unit's automatic "
      + "defrost. The real cause was plainer: when its water tank filled, the unit "
      + "stopped for about 20 minutes while a slow pump emptied the tank. A running "
      + "dehumidifier warms the room a little with its own motor, so stopping it "
      + "cools the room within minutes, and the house, which stores a great deal of "
      + "heat, brings the temperature back slowly. Move the stop in the figure and "
      + "watch the dip follow it. The numbers in the story are the author's; the "
      + "room in the figure is a toy with two heat stores whose sizes were chosen "
      + "to tell the story, not measured.",
    note: "Why this is the opening: it has every ingredient of the page. A symptom "
      + "(a dip, a spike), a first hypothesis that was wrong, a measurement that "
      + "separated the hypotheses, a sensor that was biased, and a controller that "
      + "was watching the wrong thing.",
  },
  {
    n: 2,
    title: "Pick the observation that tells the explanations apart",
    body: "Two explanations fitted the same dips. A defrost cycle is set by a timer or "
      + "by frost on the coil; it does not care how much water arrives. A full tank "
      + "stops the unit sooner when more water arrives, and the stop lasts as long as "
      + "the pump needs to empty the tank. So two numbers separate them: how the time "
      + "between stops changes when the moisture load changes, and how long a stop "
      + "lasts. Seeing only the period, both explanations agree (the figure sets the "
      + "defrost timer to the observed period on purpose). The duration, and the "
      + "reaction to a change of load, do not agree. Good diagnosis starts by asking "
      + "which measurement the rival explanations predict differently.",
    formula: String.raw`t_{\mathrm{period}} = \frac{V}{\dot m}, \qquad t_{\mathrm{stop}} = \frac{V}{\dot q}`,
    where: [
      { sym: "t_{\\mathrm{period}}", means: "time between two stops of the unit", unit: "h" },
      { sym: "t_{\\mathrm{stop}}", means: "length of one stop: the time the pump needs to empty the tank", unit: "h" },
      { sym: "V", means: "volume of the water tank", unit: "L" },
      { sym: "\\dot m", means: "the water the unit collects, which equals the room's moisture load once the humidity is steady", unit: "L/h" },
      { sym: "\\dot q", means: "the pump's emptying rate", unit: "L/h" },
    ],
    note: "The tank of 3 L, the load of 16 L per day and the pump of 9 L/h in the "
      + "figure are assumptions chosen so that the two divisions give the 4.5 h and "
      + "the 20 minutes of the story.",
  },
  {
    n: 3,
    title: "A controller can measure the wrong thing",
    body: "The unit switched on above 55 % relative humidity and off below 50 %. That "
      + "band is narrow, and the sensor sat in the unit's own warm air. Warm air "
      + "holds more water at saturation, so the same vapour reads as a lower "
      + "percentage: running the unit lowers its own reading, by about as much as the "
      + "whole band is wide. The controller then sees mostly its own heating, not the "
      + "moisture in the room. Drag the self-heating in the figure: with none, the "
      + "unit switches a few times an hour; with a degree or two it switches many "
      + "times, chasing its own warmth. A band should be wide compared with what the "
      + "sensor can mistake.",
    formula: String.raw`\Delta\varphi \approx \varphi\left(1 - \frac{p_{\mathrm{sat}}(T)}{p_{\mathrm{sat}}(T+\Delta T)}\right)`,
    where: [
      { sym: "\\Delta\\varphi", means: "how much lower the sensor reads than the room, in points of relative humidity" },
      { sym: "\\varphi", means: "the room's relative humidity, as a fraction" },
      { sym: "p_{\\mathrm{sat}}", means: "saturation pressure of water at the given temperature, from the Wagner equation of the Choupo water record", unit: "Pa" },
      { sym: "T", means: "the room's temperature", unit: "C" },
      { sym: "\\Delta T", means: "how much the unit warms the air at its sensor", unit: "K" },
    ],
  },
  {
    n: 4,
    title: "Compare with what is conserved, not with what depends on temperature",
    body: "Relative humidity is a ratio against a ceiling that moves with temperature, so "
      + "two correct sensors in two rooms at different temperatures can disagree by "
      + "tens of points. The water itself is conserved. Convert each reading to the "
      + "mass of water per cubic metre of air, absolute humidity, and compare those. "
      + "In the story, one sensor read 18.4 degrees C and 68 %, another 22.3 degrees C "
      + "and 52 %: sixteen points apart, yet the same air within half a gram per "
      + "cubic metre. Redundancy then does its job: the unit's own sensor, compared "
      + "this way with an independent one, was found to read about 15 points high. "
      + "A second sensor measuring the same thing is the cheapest fault detector "
      + "there is.",
    formula: String.raw`\rho_{\mathrm{v}} = \frac{\varphi\,p_{\mathrm{sat}}(T)}{R_{\mathrm{v}}\,(T + 273.15)}`,
    where: [
      { sym: "\\rho_{\\mathrm{v}}", means: "absolute humidity: mass of water vapour per volume of air (the figure prints it in g/m3)", unit: "kg/m3" },
      { sym: "R_{\\mathrm{v}}", means: "specific gas constant of water vapour: the gas constant over the molar mass of water", unit: "J/(kg K)" },
    ],
    note: "The page gets 10.70 and 10.27 g/m3 for the two sensors; the story rounded "
      + "them to about 10.7 and 10.2.",
  },
  {
    n: 5,
    title: "Four lessons from one dehumidifier",
    body: "First, choose the observation that separates the hypotheses: here the "
      + "duration of a stop and the response to a change of load. Second, diagnose "
      + "with quantities that are conserved (the mass of water, a mass balance) "
      + "rather than with ones that depend on the state (a relative humidity that "
      + "moves with temperature). Third, redundancy exposes a biased sensor: two "
      + "independent measurements of the same thing, compared on a common basis, "
      + "cannot both be right if they disagree. Fourth, a controller can measure the "
      + "wrong thing: when the quantity it watches is dominated by its own effect, "
      + "it regulates itself and not the process. The rest of the page turns these "
      + "four habits into methods, and ends with cases where you are the diagnostician.",
  },
  {
    n: 6,
    title: "Limits and alarms: the first, cheapest line",
    body: "The simplest detector is a limit on a measurement: a high limit, a low limit, "
      + "a limit on how fast it may change, and a floor under how much it varies (a "
      + "dead sensor varies too little). Seborg gives the common arrangement of two "
      + "pairs of limits, warning limits for small excursions and alarm limits for "
      + "serious ones (a storage tank with low and low-low levels of 15 % and 5 %, "
      + "high and high-high of 85 % and 95 %). The price is a trade you can feel in "
      + "the figure: put the limit close to normal and noise crosses it with nobody "
      + "at fault, a false alarm; put it far and a real fault is noticed late. A "
      + "limit also sees only one variable and knows nothing of the others: it "
      + "cannot say a reading is wrong while it is still inside its range.",
    note: "Sources: Seborg, Edgar, Mellichamp and Doyle, 4th ed., p. 163 (warning and "
      + "alarm limits; an alarm with its own sensor catches drifts and failures) and "
      + "pp. 397 to 398 (limit checking, rate-of-change and low-variance checks).",
  },
  {
    n: 7,
    title: "A residual: what you measured minus what the plant should do",
    body: "To see a fault that stays inside every limit, compare the plant with a model "
      + "of it. The difference, measured minus predicted, is the residual: zero (apart "
      + "from noise) when everything works, non-zero when something does not. A tank is "
      + "the simplest model there is: what comes in, minus what goes out, is what the "
      + "level accounts for. The example: the inlet meter reads 10 and the outlet meter "
      + "reads 9, yet the level does not rise. Something is wrong, and the balance says "
      + "so; but it accuses the pair of meters, not one. Which meter it is needs one more "
      + "independent piece of information, such as the pump's curve or a third meter.",
    formula: String.raw`r = \dot V_{\mathrm{in}} - \dot V_{\mathrm{out}} - A\,\frac{\mathrm{d}h}{\mathrm{d}t}`,
    where: [
      { sym: "r", means: "the balance residual: zero when the meters and the level agree", unit: "m3/h" },
      { sym: "\\dot V_{\\mathrm{in}} \\,/\\, \\dot V_{\\mathrm{out}}", means: "the volumetric flow read on the inlet meter, and on the outlet meter", unit: "m3/h" },
      { sym: "A", means: "cross-section of the tank", unit: "m2" },
      { sym: "h", means: "the level read by the level transmitter", unit: "m" },
      { sym: "t", means: "time", unit: "h" },
    ],
  },
  {
    n: 8,
    title: "Fouling is a slow drift; a broken thermometer is a step",
    body: "A heat exchanger lost duty. Estimate its overall conductance from the "
      + "temperatures and the flows, and watch how it moves. Fouling builds up slowly "
      + "and its approach flattens as the deposit grows: a drift. A thermometer that "
      + "shifts does so at one moment: a step. The two give different pictures, and one "
      + "more check separates them for good: the heat the hot side loses must equal "
      + "the heat the cold side gains. With fouling both sides still agree and only "
      + "the conductance falls; with a shifted thermometer the two duties stop "
      + "agreeing from the day it shifted. Choose the fault in the figure and read "
      + "both traces.",
    formula: String.raw`UA = \frac{Q}{\Delta T_{\mathrm{lm}}}, \qquad \Delta T_{\mathrm{lm}} = \frac{\Delta T_1 - \Delta T_2}{\ln\left(\Delta T_1 / \Delta T_2\right)}`,
    where: [
      { sym: "U", means: "overall heat-transfer coefficient", unit: "kW/(m2 K)" },
      { sym: "A", means: "heat-transfer area (U times A is the conductance that the figure calls UA)", unit: "m2" },
      { sym: "Q", means: "heat duty, taken here from the cold stream", unit: "kW" },
      { sym: "\\Delta T_{\\mathrm{lm}}", means: "log-mean temperature difference of a counter-current exchanger", unit: "K" },
      { sym: "\\Delta T_1 \\,/\\, \\Delta T_2", means: "the temperature differences between the streams at the two ends of the exchanger", unit: "K" },
    ],
  },
  {
    n: 9,
    title: "A pump off its own curve",
    body: "A worn pump delivers less. So does a partly closed valve. Watching the flow "
      + "alone cannot tell them apart: the figure finds a valve setting that gives a "
      + "healthy pump exactly the flow of the worn one. The pump's manufacturer curve "
      + "tells them apart. With the valve closed a little, the pump still sits on its "
      + "curve; it only moves along it. With wear, the operating point drops below the "
      + "curve. The residual is the head measured minus the head the curve gives at "
      + "the measured flow: zero for a healthy pump on any piping, negative for a "
      + "worn one. Again the diagnosis is a comparison with a model, and the model "
      + "here is a datasheet.",
    formula: String.raw`H_{\mathrm{cat}}(Q) = H_{0} - k_{\mathrm{p}}\,Q^{2}, \qquad r_{H} = H_{\mathrm{meas}} - H_{\mathrm{cat}}(Q_{\mathrm{meas}})`,
    where: [
      { sym: "H_{\\mathrm{cat}}", means: "the pump head the catalogue curve gives at flow Q", unit: "m" },
      { sym: "Q", means: "the pump flow", unit: "m3/h" },
      { sym: "H_{0}", means: "shut-off head of the healthy pump (the head at zero flow)", unit: "m" },
      { sym: "k_{\\mathrm{p}}", means: "how fast the catalogue head falls with the square of the flow", unit: "m/(m3/h)2" },
      { sym: "r_{H}", means: "the head residual: zero for a healthy pump", unit: "m" },
      { sym: "H_{\\mathrm{meas}}", means: "the head measured across the pump", unit: "m" },
      { sym: "Q_{\\mathrm{meas}}", means: "the flow measured at the same time", unit: "m3/h" },
    ],
  },
  {
    n: 10,
    title: "Two sensors for one quantity, and a vote when there are three",
    body: "If two independent sensors measure the same quantity, their difference should "
      + "be noise. When it is bigger than noise allows, one of them is wrong, but two "
      + "sensors cannot say which: the disagreement accuses the pair. A third sensor "
      + "settles it by majority, and the odd one is the suspect. The same idea works "
      + "between a sensor and a balance: Seborg's two-unit example closes the overall "
      + "mass balance to 4 % but each unit alone to 25 % and minus 34 %, and concludes "
      + "that one of the two flow meters between the units is faulty. The balance "
      + "is the second sensor. Move the bias on sensor B in the figure and watch "
      + "where the threshold is crossed.",
    formula: String.raw`z_{\mathrm{AB}} = \frac{\left| y_{\mathrm{A}} - y_{\mathrm{B}} \right|}{\sqrt{\sigma_{\mathrm{A}}^{2} + \sigma_{\mathrm{B}}^{2}}}`,
    where: [
      { sym: "z_{\\mathrm{AB}}", means: "the difference of the two readings in units of its own noise; above about 3 it is not noise" },
      { sym: "y_{\\mathrm{A}} \\,/\\, y_{\\mathrm{B}}", means: "the readings of sensor A and of sensor B" },
      { sym: "\\sigma_{\\mathrm{A}} \\,/\\, \\sigma_{\\mathrm{B}}", means: "the standard deviation of the noise of each sensor" },
    ],
    note: "Source: Seborg, Edgar, Mellichamp and Doyle, 4th ed., p. 398, Fig. 21.2 and "
      + "the text around it (errors of closure of 25 %, -34 % and 4 %).",
  },
  {
    n: 11,
    title: "Data reconciliation: adjust the meters so the balances close, and see who needed it most",
    body: "Several balances at once can do more than one. Reconciliation finds the "
      + "smallest adjustments to the measurements, each weighed by how noisy its meter "
      + "is, that make every balance close exactly. Then two tests. The global test asks "
      + "whether the total adjustment is bigger than noise allows: if it is, a "
      + "measurement is wrong. The measurement test divides each adjustment by its own "
      + "standard deviation and points at the largest. On a splitter with a single "
      + "balance, every meter gets the same score and the test cannot choose. Add a "
      + "mixer downstream, so the middle stream appears in two balances, and the "
      + "culprit stands out; two meters that appear together in the same balances "
      + "remain indistinguishable, and the page says so.",
    derivation: [
      { step: "Measurements y have noise of size sigma. We look for the values x closest to them, in units of that noise, that satisfy every balance A x = 0. For the splitter F1 = F2 + F3 the single row is (1, -1, -1).",
        eq: String.raw`\min_{x} \sum_{i} \left(\frac{y_{i} - x_{i}}{\sigma_{i}}\right)^{2} \quad \text{subject to} \quad A\,x = 0` },
      { step: "Solving it (a Lagrange multiplier per balance) gives the adjustment: the balance residual, spread over the meters in proportion to their variance. V is the diagonal matrix of the variances.",
        eq: String.raw`x = y - V A^{\mathsf{T}} \left(A V A^{\mathsf{T}}\right)^{-1} A\,y` },
      { step: "On the splitter there is one balance: r = y1 - y2 - y3 and the variance of r is the sum of the three variances. Each meter is moved by its share of r.",
        eq: String.raw`r = y_{1} - y_{2} - y_{3}, \qquad \sigma_{r}^{2} = \sigma_{1}^{2} + \sigma_{2}^{2} + \sigma_{3}^{2}, \qquad x_{i} = y_{i} - \frac{a_{i}\,\sigma_{i}^{2}}{\sigma_{r}^{2}}\,r` },
      { step: "If every meter is right, r is noise with variance sigma_r squared, so its square over that variance follows a chi-square law with as many degrees of freedom as there are balances. The global test rejects when it is too large.",
        eq: String.raw`\chi^{2} = \frac{r^{2}}{\sigma_{r}^{2}}, \qquad \chi^{2} > \chi^{2}_{1-\alpha,\,m} \;\Rightarrow\; \text{a measurement is wrong}` },
      { step: "The measurement test divides each adjustment by its own standard deviation. With one balance this ratio is the same for every meter, so it cannot choose.",
        eq: String.raw`z_{i} = \frac{\left| y_{i} - x_{i} \right|}{\sqrt{\left(V A^{\mathsf{T}} (A V A^{\mathsf{T}})^{-1} A V\right)_{ii}}}` },
    ],
    formula: String.raw`\chi^{2} = r^{\mathsf{T}} \left(A V A^{\mathsf{T}}\right)^{-1} r`,
    where: [
      { sym: "x_{i} \\,/\\, y_{i}", means: "the reconciled value of stream i, and its measured value", unit: "t/h" },
      { sym: "x \\,/\\, y", means: "the vector of reconciled values and the vector of measured values, one entry per stream", unit: "t/h" },
      { sym: "y_{1} \\,/\\, y_{2} \\,/\\, y_{3}", means: "the three measured flows of the splitter: the feed and the two products", unit: "t/h" },
      { sym: "\\sigma_{1} \\,/\\, \\sigma_{2} \\,/\\, \\sigma_{3}", means: "the noise standard deviations of those three meters", unit: "t/h" },
      { sym: "\\chi^{2}_{1-\\alpha,\\,m}", means: "the value that a chi-square variable with m degrees of freedom stays below with probability 1 minus alpha: the limit of the global test" },
      { sym: "\\sigma_{i}", means: "the standard deviation of the noise of meter i", unit: "t/h" },
      { sym: "A", means: "the balance matrix: one row per balance, one column per stream, +1 for a stream entering and -1 for one leaving" },
      { sym: "V", means: "the diagonal matrix of the variances of the meters" },
      { sym: "r", means: "the vector of balance residuals, A times y", unit: "t/h" },
      { sym: "\\sigma_{r}", means: "the standard deviation of the single balance residual on the splitter", unit: "t/h" },
      { sym: "a_{i}", means: "the coefficient of stream i in the balance (+1 or -1)" },
      { sym: "\\chi^{2}", means: "the global statistic; it follows a chi-square law with m degrees of freedom when every meter is right" },
      { sym: "\\alpha", means: "the accepted chance of a false alarm, here 5 %" },
      { sym: "m", means: "the number of independent balances: the degrees of freedom" },
      { sym: "z_{i}", means: "the measurement-test score of meter i: its adjustment over its own standard deviation" },
    ],
    note: "The engine's own reconciliation is on the Data reconciliation page; this one is "
      + "a small second implementation, in the page, so you can poke at it. The tests "
      + "compare it with exact results (two degrees of freedom is an exponential law) "
      + "and with the normal probabilities Seborg prints. Sources: Seborg, Edgar, "
      + "Mellichamp and Doyle, 4th ed., pp. 397 to 398 (closure errors, reconciliation).",
    leadsTo: {
      tool: "data-reconciliation",
      toolLabel: "Data reconciliation",
      stepTitle: "the engine's own reconciliation of a recycle loop",
      body: "The same idea on a recycle plant, solved by the engine, with a gross error planted on a chosen meter.",
    },
  },
  {
    n: 12,
    title: "Time signatures: a step, a drift, an oscillation, a period",
    body: "Faults leave shapes in time. A step is a jump that stays: a shifted sensor, a "
      + "valve that was moved. A drift is a steady slope: fouling, a sensor losing its "
      + "calibration, a catalyst ageing. An oscillation repeats: a loop that is "
      + "hunting, a stick-slip valve, a tank that fills and empties on a cycle, a "
      + "controller band too narrow. Its period is a fingerprint: in the dehumidifier "
      + "it was the tank, not the weather. The figure builds each shape with noise and "
      + "asks a small classifier three questions: how much of the variance a straight "
      + "line explains, how much a single step explains, and how strongly what is left "
      + "repeats itself. Lower the signal and the noise wins; no classifier sees what "
      + "is not there.",
    formula: String.raw`R^{2} = 1 - \frac{\mathrm{SSE}}{\mathrm{SST}}`,
    where: [
      { sym: "R^{2}", means: "the share of the signal's variance that a model (a line, or a step) explains" },
      { sym: "\\mathrm{SSE}", means: "sum of the squared differences between the signal and the model" },
      { sym: "\\mathrm{SST}", means: "sum of the squared differences between the signal and its own mean" },
    ],
  },
  {
    n: 13,
    title: "Many variables at once: control charts and statistical monitoring",
    body: "A plant has hundreds of measurements and no one can watch all the limits. "
      + "Statistical process control puts each variable on a chart with limits set from "
      + "its own normal scatter: the mean plus and minus three standard deviations. "
      + "Seborg prints the three probabilities that make three sigma the usual "
      + "choice: 0.6827, 0.9545 and 0.9973 of normal data lie within one, two and three "
      + "standard deviations. A point beyond the limits is a sign of a special cause. "
      + "How long you wait for a signal is the average run length, the inverse of the "
      + "chance that one point falls outside: with three-sigma limits and nothing "
      + "wrong, about 370 points between false alarms (Montgomery); after a real shift "
      + "of the mean it is much shorter, which the figure shows. Small shifts are caught "
      + "better by a cumulative-sum chart. When many variables move together, the "
      + "multivariate methods look at all of them at once: Hotelling's T squared, and "
      + "principal component analysis and partial least squares for large, correlated "
      + "sets (the squared-prediction-error statistic that goes with them is in the "
      + "literature named at the end, not read for this page). They are the subject of "
      + "whole books, and this page only points at them.",
    formula: String.raw`\mathrm{ARL} = \frac{1}{p}`,
    where: [
      { sym: "\\mathrm{ARL}", means: "average run length: the mean number of points plotted before one falls outside the limits" },
      { sym: "p", means: "the probability that a single point falls outside the limits" },
    ],
    note: "Sources: Seborg, Edgar, Mellichamp and Doyle, 4th ed., Eq. 21-6 on p. 398 "
      + "and pp. 407 to 408 (multivariate monitoring, PCA and PLS); Montgomery, 6th ed., "
      + "section 5.3 and Eq. 5.2 on p. 191 (ARL0 = 370), pp. 400 to 401 "
      + "(a Shewhart chart is insensitive to small shifts; the cusum chart).",
  },
];

export const FAULT_DIAGNOSIS_QUIZ: readonly QuizQuestion[] = [
  {
    id: "separate",
    q: "Two explanations give the same period between the dips. What do you measure next?",
    options: [
      "How long each dip lasts and how the period changes when the moisture load changes",
      "The same period again, over a longer record",
      "The room temperature to one more decimal",
      "Nothing: pick the simpler explanation",
    ],
    correct: 0,
    feedback: "When rival explanations agree on one observation, pick one on which they "
      + "differ. A timer's period does not follow the moisture load and its stop does "
      + "not follow the pump; a full tank does both.",
    steps: [2, 5],
  },
  {
    id: "absolute",
    q: "One sensor reads 68 % at 18.4 degrees C and another 52 % at 22.3 degrees C. Do they disagree about the air?",
    options: [
      "Yes, by 16 points, so one is badly wrong",
      "No: in absolute humidity they are within about half a gram per cubic metre",
      "Yes, because the warmer air must be the drier",
      "It cannot be told without a third sensor",
    ],
    correct: 1,
    feedback: "Relative humidity is a ratio against a ceiling that rises with "
      + "temperature. In grams of water per cubic metre the two readings are 10.7 and "
      + "10.3: the same air.",
    steps: [4],
    origins: ["page"],
  },
  {
    id: "tank",
    q: "The inlet meter reads more than the outlet meter but the level stays flat. What does the balance tell you?",
    options: [
      "The inlet meter is wrong",
      "The outlet meter is wrong",
      "One of the two meters is wrong, and the balance alone cannot say which",
      "The tank is leaking",
    ],
    correct: 2,
    feedback: "A residual accuses the set of quantities in the balance, not one of "
      + "them. A third, independent piece of information (a pump curve, another meter) "
      + "is needed to choose; a leak would show in the level.",
    steps: [7, 10],
  },
  {
    id: "foulingStep",
    q: "An exchanger's estimated U has fallen, and the heat lost by the hot side still equals the heat gained by the cold side. What is the likely cause?",
    options: [
      "A thermometer has shifted",
      "Fouling: the exchanger itself changed",
      "A flowmeter has stopped",
      "Nothing: the estimate is noise",
    ],
    correct: 1,
    feedback: "A shifted thermometer breaks the energy balance from the day it shifts. "
      + "Fouling changes the exchanger but both sides still see the same heat.",
    steps: [8],
  },
  {
    id: "oneBalance",
    q: "A splitter has one balance and the global test rejects. Why can the measurement test not point at one meter?",
    options: [
      "The meters are too accurate",
      "With one balance every meter's adjustment gives the same score",
      "The chi-square law does not apply",
      "It can: the largest flow is the culprit",
    ],
    correct: 1,
    feedback: "All three meters appear in the one balance, so the residual cannot say "
      + "which was wrong. Another balance in which a stream appears alone is what "
      + "separates them.",
    steps: [11],
  },
  {
    id: "arl",
    q: "A chart with three-sigma limits and nothing wrong has an average run length of about 370. What does that mean?",
    options: [
      "A false alarm about once in 370 points, on average",
      "A real fault is found after 370 points",
      "The chart is wrong 370 times a year",
      "370 points are needed to set the limits",
    ],
    correct: 0,
    feedback: "ARL is the inverse of the chance that one point falls outside the limits: "
      + "about 0.27 % for three sigma, so a false alarm every 370 points on average. "
      + "After a real shift the run length is much shorter.",
    steps: [13],
    origins: ["reference", "page"],
  },
];

export const FAULT_DIAGNOSIS_LIMITS: readonly LessonLimit[] = [
  {
    id: "toys",
    title: "Every plant on this page is a toy.",
    body: "The room, the humidistat, the tank, the exchanger, the pump and every plant "
      + "of the challenges are small models with assumed numbers and generated noise. "
      + "Their shapes are the textbook ones; their sizes are not measurements. The "
      + "story of the first steps is the author's, told, not re-measured here. No "
      + "engine is run: every number is computed in this page.",
  },
  {
    id: "thresholds",
    title: "A threshold here is a teaching threshold, not a plant setting.",
    body: "The page flags a residual at six standard errors, a balance at five percent, a "
      + "switching rate at thirty an hour: values that make these toys decidable. A real "
      + "plant sets them from its own noise, its own cost of a false alarm and of a "
      + "missed fault, and revisits them.",
  },
  {
    id: "identifiability",
    title: "A test can say something is wrong and still not say what.",
    body: "A balance accuses the quantities in it; a one-balance reconciliation cannot "
      + "choose; two sensors cannot say which one is wrong. Naming the fault needs one "
      + "more independent piece of information, and some faults cannot be told apart "
      + "from the measurements you have. The page says so each time it happens.",
  },
  {
    id: "reading",
    title: "Further reading, by title only.",
    body: "Venkatasubramanian, Rengaswamy, Yin and Kavuri, a three-part review of process "
      + "fault detection and diagnosis in Computers and Chemical Engineering (2003); "
      + "Chiang, Russell and Braatz, Fault Detection and Diagnosis in Industrial "
      + "Systems; Isermann, Fault-Diagnosis Systems; and the Tennessee Eastman problem "
      + "of Downs and Vogel as the standard benchmark. They were not read for this page "
      + "and no number on it comes from them.",
  },
];
