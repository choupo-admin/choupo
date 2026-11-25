/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  compressorChoiceLesson -- the lesson of "Which compressor, and how far can I
  turn it down?" (C510), as DATA.  Pinned by tests/compressorChoice.test.ts.

  SOURCES.  The machine chart is Brown (2005), Compressors: Selection and
  Sizing, 3rd ed., Fig 1-2, p.3, as the ENGINE reads it (its table of region
  boxes, good to about 3 % of an edge, published in the design sheet): the page
  carries no corner of its own.  The head and power relations are Brown's
  Eq 2.71-2.78 (p.34-40), the ones compression.ts already holds.  The grid of
  step 3 is AUTHORED: written for this lesson in its own words from general
  practice, no source read for any cell, and the page says so.  The two
  limits that need a maker's map -- a surge line, and the shut-off head -- are
  declared by the student, never read from a source.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export type Favour = "favoured" | "neutral" | "against";

/** The seven questions of the grid, in the order they are drawn. */
export const GRID_QUESTIONS = [
  { id: "pulsation", ask: "Is the delivery smooth?" },
  { id: "oilFree", ask: "Can the gas path stay free of lubricant?" },
  { id: "turndown", ask: "How far can the flow fall before the machine needs help?" },
  { id: "ceiling", ask: "How high a pressure ratio can one machine make?" },
  { id: "molarMass", ask: "What happens when the gas gets lighter?" },
  { id: "speed", ask: "What driver speed does it want?" },
  { id: "access", ask: "How often is it opened up?" },
] as const;
export type GridQuestionId = (typeof GRID_QUESTIONS)[number]["id"];

export const GRID_MACHINES = ["centrifugal", "axial", "screw", "reciprocating"] as const;
export type GridMachine = (typeof GRID_MACHINES)[number];

export interface GridCell { favour: Favour; why: string; }

/** AUTHORED, not computed, no source read for any cell.  "favoured" means the
 *  machine is the usual answer to that question, "against" that it is the
 *  usual reason to pick another; a plant can overrule every cell. */
export const GRID: Readonly<Record<GridQuestionId, Readonly<Record<GridMachine, GridCell>>>> = {
  pulsation: {
    centrifugal: { favour: "favoured", why: "The gas flows through continuously, so the delivery is steady." },
    axial: { favour: "favoured", why: "Continuous flow, as for the centrifugal machine." },
    screw: { favour: "neutral", why: "The lobes pass gas in small repeated packets, a mild ripple that a short line smooths." },
    reciprocating: { favour: "against", why: "Each stroke delivers a pulse; dampers and a check of the piping's natural frequencies come with the machine." },
  },
  oilFree: {
    centrifugal: { favour: "favoured", why: "No part touches the gas path while it works; the bearings and seals sit outside it." },
    axial: { favour: "favoured", why: "The same, no rubbing contact in the gas path." },
    screw: { favour: "neutral", why: "Dry versions keep the gas clean at a lower ratio per stage; oil-flooded ones put lubricant in the gas and take it out again." },
    reciprocating: { favour: "neutral", why: "Cylinders can run without lubricant, with faster wear of the rings; a lubricated cylinder puts oil into the gas." },
  },
  turndown: {
    centrifugal: { favour: "against", why: "Below a minimum flow it surges, so a recycle or a speed change has to stand behind it." },
    axial: { favour: "against", why: "Its stable range is usually narrower still." },
    screw: { favour: "neutral", why: "Speed and a slide valve vary the volume; the efficiency falls away from the design point." },
    reciprocating: { favour: "favoured", why: "Speed, cylinder unloading and clearance pockets step the flow down without a recycle." },
  },
  ceiling: {
    centrifugal: { favour: "neutral", why: "More impellers raise the ratio, until the casing, the shaft or the heat of the discharge says stop." },
    axial: { favour: "against", why: "A modest ratio from a large flow; the usual answer to many tonnes of air, not to a high pressure." },
    screw: { favour: "against", why: "A modest ratio per stage; a high one means stages in series." },
    reciprocating: { favour: "favoured", why: "The usual choice at the highest ratios and pressures; the chart reaches furthest here." },
  },
  molarMass: {
    centrifugal: { favour: "against", why: "The head an impeller gives falls with the weight of the gas: a light gas needs many more impellers for the same ratio." },
    axial: { favour: "against", why: "The same dependence on the gas's weight as the centrifugal machine." },
    screw: { favour: "neutral", why: "A displaced volume, but with a clearance through which a light gas slips back." },
    reciprocating: { favour: "favoured", why: "It displaces a volume; the pressure follows from the gas, so a change of gas mostly moves the power." },
  },
  speed: {
    centrifugal: { favour: "against", why: "It wants a high rotor speed, which usually means a gearbox or a turbine drive." },
    axial: { favour: "against", why: "High rotor speeds again, the same gearbox or turbine-drive question." },
    screw: { favour: "neutral", why: "Moderate speeds; a gear is common." },
    reciprocating: { favour: "favoured", why: "Slow, so a motor can drive it directly or through a belt, at the price of a heavy foundation." },
  },
  access: {
    centrifugal: { favour: "favoured", why: "Few wearing parts and long runs between openings." },
    axial: { favour: "favoured", why: "As for the centrifugal machine." },
    screw: { favour: "neutral", why: "The rotors and bearings are not opened often; a failure means a factory repair." },
    reciprocating: { favour: "against", why: "Valves, rings and rods wear and are changed on a schedule, and the spare machine is part of the design." },
  },
};

export const CC_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The duty is a volume and a ratio, not a mass and a power",
    body: "A compressor is asked for a flow of gas as it enters the machine, in cubic metres per hour at the suction pressure and temperature, and for a "
      + "pressure ratio. Its price, its size and its type follow from those two, not from the kilograms or the kilowatts that the flowsheet prints. "
      + "The two runs below are the engine's own: air in a staged design and the make-up gas of the ammonia plant, a mixture of hydrogen and nitrogen. "
      + "The table prints each machine's duty as it enters, and then asks what happens if the air machine, with its volume and its ratio, is handed the "
      + "other gas. The mass flow changes in proportion to the weight of the gas and the head per kilogram changes the other way; the power moves "
      + "much less, only through the gas's exponent. Misconception this breaks: a compressor is selected by its power.",
    derivation: [
      { step: "The gas power of one section is the mass flow times the head, divided by the polytropic efficiency (Brown Eq 2.73 and 2.78).",
        eq: String.raw`W = \frac{\dot m\,H}{\eta_p},\qquad H = \frac{Z R_s T_1}{m}\left(r^{m}-1\right)` },
      { step: "The mass flow is the density times the actual volume, and the density of a real gas is its pressure over Z R_s T_1.",
        eq: String.raw`\dot m = \rho\,Q = \frac{P_1\,Q}{Z R_s T_1}` },
      { step: "Put the second into the first. The specific gas constant, and with it the molar mass, cancels.",
        eq: String.raw`W = \frac{P_1\,Q}{m\,\eta_p}\left(r^{m}-1\right)` },
    ],
    formula: String.raw`W = \frac{P_1\,Q}{m\,\eta_p}\left(r^{m}-1\right)`,
    where: [
      { sym: "W", means: "the gas power of one compression section", unit: "W" },
      { sym: "\\dot m", means: "the mass flow through the section", unit: "kg/s" },
      { sym: "H", means: "the head: the work per kilogram that raises the gas from the suction to the discharge pressure", unit: "J/kg" },
      { sym: "Z", means: "the mean compressibility factor of the gas along the path", unit: "–" },
      { sym: "R_s", means: "the specific gas constant, the universal constant over the molar mass", unit: "J/(kg K)" },
      { sym: "T_1", means: "the suction temperature", unit: "K" },
      { sym: "\\rho", means: "the gas density at the suction", unit: "kg/m³" },
      { sym: "P_1", means: "the suction pressure", unit: "Pa" },
      { sym: "Q", means: "the actual volume flow at the suction", unit: "m³/s" },
      { sym: "m", means: "the path exponent of the compression, (n−1)/n, from the engine's stage 1", unit: "–" },
      { sym: "\\eta_p", means: "the polytropic efficiency of the section", unit: "–" },
      { sym: "r", means: "the pressure ratio of the section", unit: "–" },
    ],
    note: "The gas's weight comes back through the exponent \\(m\\) and the compressibility, not through \\(R_s\\): two gases with the same volume, ratio and suction state "
      + "need nearly the same power but very different mass flows and very different heads per kilogram, which is the number a centrifugal impeller is limited by.",
  },
  {
    n: 2,
    title: "Where each family can exist",
    body: "Plot the duty on a chart of inlet flow against pressure ratio, both on logarithmic axes. Each machine family has a region of the chart in which it is "
      + "the usual answer; the chart is a figure of a textbook (Brown, 2005, Fig 1-2), and the engine's selection reads rectangles taken off it. The engine "
      + "publishes those rectangles in its design sheet, and this page draws them from the sheet: it holds no corner of its own. Drag the duty point (or "
      + "move its sliders) and the machines whose rectangle holds it light up; the engine's own pick is marked, and where two regions overlap the "
      + "engine takes the one that comes first in its list, a convention the book does not give. The dots are the four compressors of the reference ammonia plant, "
      + "from a recorded run of the engine, not a live one. Misconception this breaks: compressor families differ only by efficiency.",
    formula: String.raw`Q_{\min}\le Q\le Q_{\max},\qquad r_{\min}\le r\le r_{\max}(Q)=r_L\left(\frac{r_R}{r_L}\right)^{\ln(Q/Q_{\min})/\ln(Q_{\max}/Q_{\min})}`,
    where: [
      { sym: "Q", means: "the actual inlet flow of the duty", unit: "cfm" },
      { sym: "Q_{\\min}, Q_{\\max}", means: "the two flow edges of a region", unit: "cfm" },
      { sym: "r", means: "the overall pressure ratio of the duty", unit: "–" },
      { sym: "r_{\\min}", means: "the lower ratio edge of a region", unit: "–" },
      { sym: "r_L, r_R", means: "the upper ratio edge at the region's left and right flow edge, from the sheet", unit: "–" },
      { sym: "r_{\\max}", means: "the upper ratio edge at the flow Q: a straight line on the log-log axes between the two corners", unit: "–" },
    ],
    note: "The edges were read off a figure and are good to about 3 % of an edge. Below ratio 1.4 the figure draws nothing, and the engine takes the first machine whose flow range holds the point; "
      + "outside every region it takes the reciprocating machine, the only one that reaches the highest ratios. The chart is a convention, not a law: a vendor's own envelope will not follow these rectangles.",
  },
  {
    n: 3,
    title: "Seven questions the chart does not answer",
    body: "The chart says which machines can take the duty. A plant engineer then asks seven further questions, and the answer differs by family. The grid below gives, "
      + "for each machine and each question, whether it is the usual answer, a neutral one, or the usual reason to pick another, and one sentence why. "
      + "It is AUTHORED text, written for this lesson in its own words from general practice: nothing in it is computed, no source was read for any cell, "
      + "and a vendor's quotation can overrule every cell. Use it to find the question that decides your duty, then go to a maker with that question. "
      + "Misconception this breaks: where two machines can take the duty, the choice is arbitrary.",
    note: "A cell is a tendency, not a rule: a high-ratio centrifugal train exists, a low-ratio reciprocating machine exists, and the reasons they are rarer are what the grid records.",
  },
  {
    n: 4,
    title: "The highest pressure this machine can ever make",
    body: "The discharge pressure on the flow diagram is the pressure the plant asks for, not the highest the machine can reach. Close the valve downstream and a "
      + "positive-displacement machine keeps pushing until its driver or its casing stops it, so it is always protected by a relief valve that can pass its whole flow. "
      + "A centrifugal machine climbs only to its shut-off head. Set the design pressure of the vessel after the machine: the page prints the highest pressure the machine "
      + "can make (the driver's rating, for a positive-displacement machine; a shut-off head that is a multiple of the design head, which you set, for a centrifugal one) "
      + "and says in a sentence whether the machine alone can overpressure the vessel. The relief needed is then the Overpressure page's question. "
      + "Misconception this breaks: the discharge pressure on the diagram is the maximum.",
    formula: String.raw`W_d=\frac{(1+\mu)\,\dot m\,Z\,R_s\,T_1}{m\,\eta_p}\sum_{i=1}^{N}\left(r_i^{m}-1\right),\qquad r_s=r\left[\frac{\left(1+k\left(r_1^{m}-1\right)\right)^{1/m}}{r_1}\right]^{N}`,
    where: [
      { sym: "W_d", means: "the driver rating, from the engine's sheet; the ratio the sum reaches when it equals the rating is the highest the machine can push", unit: "W" },
      { sym: "\\mu", means: "the mechanical loss as a fraction of the gas power, from the sheet", unit: "–" },
      { sym: "\\dot m", means: "the mass flow, from the engine's sheet", unit: "kg/s" },
      { sym: "Z", means: "the mean compressibility of stage 1, from the sheet", unit: "–" },
      { sym: "R_s", means: "the specific gas constant of the gas", unit: "J/(kg K)" },
      { sym: "T_1", means: "the temperature at which each section takes the gas in (the intercoolers bring it back to the inlet's)", unit: "K" },
      { sym: "m", means: "the path exponent of the compression, from the engine's stage 1", unit: "–" },
      { sym: "\\eta_p", means: "the polytropic efficiency, held at the design value", unit: "–" },
      { sym: "N", means: "the number of sections, from the engine's design", unit: "–" },
      { sym: "r_i", means: "the pressure ratio of section i, the engine's equal division", unit: "–" },
      { sym: "r_s", means: "the overall ratio at the shut-off head of a centrifugal machine", unit: "–" },
      { sym: "r", means: "the design overall pressure ratio", unit: "–" },
      { sym: "r_1", means: "the design ratio of one section", unit: "–" },
      { sym: "k", means: "the shut-off head over the design head: yours, a maker's map would give it", unit: "–" },
    ],
    note: "The sum is solved numerically with the engine's own staging. The efficiency is held at its design value, the casing and rod load of a real machine are not here, and a centrifugal "
      + "machine's suction conditions are held fixed at shut-off; all of them make the printed ceiling an estimate for the lesson, not a rating.",
    leadsTo: {
      tool: "overpressure", toolLabel: "Overpressure",
      stepTitle: "Blocked outlet: the source keeps delivering",
      body: "How the relief valve is sized for a flow that cannot leave, and the other ways a vessel can exceed its design pressure, are worked out on the Overpressure page.",
    },
  },
  {
    n: 5,
    title: "The anti-surge valve is not free",
    body: "A centrifugal machine cannot work below a minimum flow. When the demand falls below it, a valve opens and sends part of the discharge back to the suction, "
      + "so that the machine still passes the minimum while the plant takes less. The page asks the engine to compress the TOTAL flow that the machine must pass, "
      + "and so prints what it costs: the power at the total flow, the share of the gas that goes round, and the energy per kilogram actually delivered. "
      + "The minimum itself is yours: the engine holds no characteristic map, so the surge flow is a fraction of the design flow that you declare, never a computed one. "
      + "The recycle comes back hot unless it passes a cooler: a second run takes the suction temperature up and the discharge follows. "
      + "Misconception this breaks: the recycle valve costs nothing, and the recycle gas is cold.",
    formula: String.raw`Q_t=\max\left(Q_d,\; f_s\,(1+\mu_s)\,Q_{\mathrm{des}}\right),\qquad \varphi=\frac{Q_t-Q_d}{Q_t},\qquad T_{\mathrm{mix}}=(1-\varphi)\,T_f+\varphi\,T_{\mathrm{out}}`,
    where: [
      { sym: "Q_t", means: "the flow the machine passes, the total", unit: "m³/h" },
      { sym: "Q_d", means: "the flow the plant takes, the demand", unit: "m³/h" },
      { sym: "f_s", means: "the surge flow as a fraction of the design flow: yours", unit: "–" },
      { sym: "\\mu_s", means: "the margin kept above the surge flow: yours", unit: "–" },
      { sym: "Q_{\\mathrm{des}}", means: "the design flow", unit: "m³/h" },
      { sym: "\\varphi", means: "the share of the machine's flow that goes round the recycle valve", unit: "–" },
      { sym: "T_{\\mathrm{mix}}", means: "the suction temperature when the recycle returns uncooled", unit: "K" },
      { sym: "T_f", means: "the temperature of the fresh gas", unit: "K" },
      { sym: "T_{\\mathrm{out}}", means: "the discharge temperature of the machine, from the engine's cooled-recycle run", unit: "K" },
    ],
    note: "The mixing uses a constant heat capacity and one step of the iteration; the page prints the discharge temperature the hot run itself gave, so the distance from a converged value is on screen. "
      + "Speed control, suction throttling and cylinder unloading are not on this page: the first two need a machine's characteristic map, which the engine does not hold, and the third a source on unloading that was not read.",
  },
];

export const CC_LIMITS: readonly LessonLimit[] = [
  { id: "chart-convention",
    title: "The chart is a convention, read off a figure",
    body: "The rectangles are the engine's reading of one book's figure, good to about 3 % of an edge. A maker's envelope for a model will not follow them, "
      + "and a point near an edge is not decided by this chart. Where two regions overlap the engine takes the first in its list, a tie-break the source does not give." },
  { id: "no-map",
    title: "No characteristic map, so no surge line and no speed control",
    body: "The engine's compressor is one adiabatic pass at the flow it is given. It holds no head-flow map, so a surge line cannot be computed: the minimum flow of step 5 is a fraction "
      + "you declare, and the shut-off head of step 4 is a multiple you declare. Surge itself is a dynamic instability set by the map and by the volume downstream; this page "
      + "shows only the steady cost of staying away from it. Speed control and suction throttling would need the same map, and the unloading of a reciprocating machine "
      + "a source this page has not read; neither is drawn." },
  { id: "one-section",
    title: "One section, constant efficiency",
    body: "The ceiling of step 4 treats the machine as a single section at the exponent of the engine's first stage, with the efficiency held at its design value. "
      + "The casing, the rod load and the temperature limits that stop a real machine earlier are not in it." },
  { id: "recycle-one-step",
    title: "The hot recycle is one step of an iteration",
    body: "The suction temperature of the hot-recycle run is the mixture of the fresh gas and the discharge of the cooled run, with a constant heat capacity. "
      + "The run's own discharge is a little higher, and the page prints how much." },
  { id: "peq-recorded",
    title: "The plant's four compressors are a recorded run",
    body: "They were read from a run of the engine on the reference plant, which takes longer than a classroom page should wait. The numbers do not follow the sliders; "
      + "they are as the engine printed them on the date shown." },
  { id: "authored",
    title: "The grid is authored",
    body: "The seven-question grid is written for this lesson in its own words. Nothing in it is computed and no source was read for any cell." },
];

export const CC_QUIZ: readonly QuizQuestion[] = [
  {
    id: "same-power", steps: [1],
    q: "The same actual inlet volume and the same pressure ratio are asked of air and of a lighter gas at the same suction state. What changes most?",
    options: [
      "The power, in proportion to the molar mass",
      "The mass flow and the head per kilogram, the power much less",
      "Nothing: the machine does the same work on every gas",
      "The suction pressure",
    ],
    correct: 1,
    feedback: "The molar mass cancels out of the power; it stays in the mass flow and in the head per kilogram (step 1).",
    origins: ["page"],
  },
  {
    id: "two-numbers", steps: [1, 2],
    q: "Which two numbers locate a duty on the machine chart?",
    options: [
      "Power and discharge temperature",
      "Mass flow and molar mass",
      "Actual inlet flow and pressure ratio",
      "Suction pressure and driver speed",
    ],
    correct: 2,
    feedback: "The chart's axes are the inlet volume flow and the pressure ratio (step 2).",
    origins: ["page"],
  },
  {
    id: "overlap", steps: [2],
    q: "A duty sits inside two regions of the chart. What decides which machine the engine selects?",
    options: [
      "The efficiency of each",
      "The order of the engine's list, a convention the book does not give",
      "The cheaper machine",
      "The one with the larger region",
    ],
    correct: 1,
    feedback: "The book gives no tie-break; the engine takes the first region in its list and says so (step 2).",
    origins: ["page"],
  },
  {
    id: "closed-valve", steps: [4],
    q: "The valve after a positive-displacement compressor is closed by mistake. What limits the pressure?",
    options: [
      "Nothing in the machine; the driver, the casing or a relief valve stops it",
      "The discharge pressure on the flow diagram",
      "The suction pressure",
      "The intercooler",
    ],
    correct: 0,
    feedback: "The machine keeps displacing its volume until something stops it, so the relief valve must pass its whole flow (step 4).",
    origins: ["page"],
  },
  {
    id: "recycle-cost", steps: [5],
    q: "Demand falls below the minimum flow of a centrifugal machine and the anti-surge valve opens. What is true?",
    options: [
      "The machine passes the minimum flow, the power stays high, and the recycled gas returns warm unless it is cooled",
      "The power falls in proportion to the demand",
      "The recycled gas returns cold",
      "The energy per kilogram delivered is unchanged",
    ],
    correct: 0,
    feedback: "The machine still compresses the total flow, so the power does not follow the demand, and the energy per kilogram delivered rises (step 5).",
    origins: ["page"],
  },
];
