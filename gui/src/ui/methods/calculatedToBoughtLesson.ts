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
  calculatedToBoughtLesson -- the lesson of "From the calculated to the bought"
  (C503), as DATA.  Pinned by tests/calculatedToBought.test.ts.

  SOURCES.  None is cited.  The algebra is the page's own (a few lines each,
  printed); the exchanger, the line list and the compressor numbers on screen
  are the engine's own runs, and the driver card quotes the engine's own note
  (including the book and page the engine names) from the run's log rather
  than from this file.  The page prints no engine number in its prose: every
  number a student reads is a live run.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const CB_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A calculation gives a minimum; a purchase gives a size",
    body: "Sizing an exchanger ends on the smallest bundle that just delivers the duty, so the area it reports is a minimum "
      + "specification: nothing on sale has exactly that area. Between the calculated area and the one you pay for stand two "
      + "separate decisions. The first is a margin, a fraction of the calculated area you add on purpose. The second is the stock: "
      + "tubes come in certain lengths, shells in certain diameters, and the next size that meets the required area is the one you buy. "
      + "The engine runs the condenser of a distillation column three ways in this card and prints three areas side by side: the calculated one, the one "
      + "required with your margin, and the bought one, which is also the area the cost is priced on. The leftover of the bought area over the calculated one is "
      + "not a margin anybody chose: part of it is your margin, the rest is whole tubes and a stock length. "
      + "Misconception this breaks: the area on the datasheet is the area that was calculated.",
    formula: String.raw`\begin{gathered}A_{\mathrm{calc}} = \frac{|Q|}{U\,F\,\Delta T_{\mathrm{lm}}}\\ A_{\mathrm{req}} = (1+m)\,A_{\mathrm{calc}}\\ A_{\mathrm{bought}} \ge A_{\mathrm{req}}\end{gathered}`,
    where: [
      { sym: "A_{\\mathrm{calc}}", means: "the area of the smallest bundle that delivers the duty", unit: "m2" },
      { sym: "Q", means: "the heat duty", unit: "W" },
      { sym: "U", means: "the overall heat-transfer coefficient, with the declared fouling", unit: "W/(m2 K)" },
      { sym: "F", means: "the correction of the log-mean temperature difference for the flow arrangement", unit: "–" },
      { sym: "\\Delta T_{\\mathrm{lm}}", means: "the log-mean temperature difference of a counter-current exchanger", unit: "K" },
      { sym: "A_{\\mathrm{req}}", means: "the area required once the margin is added", unit: "m2" },
      { sym: "m", means: "the margin the case declares, as a fraction of the calculated area", unit: "–" },
      { sym: "A_{\\mathrm{bought}}", means: "the installed area of the bundle that can be bought: the smallest of the stock that meets the requirement", unit: "m2" },
    ],
    derivation: [
      { step: "The duty a bundle delivers is the coefficient times the area times the corrected mean temperature difference; the calculated area makes it equal to the duty.",
        eq: String.raw`|Q| = U\,F\,\Delta T_{\mathrm{lm}}\,A_{\mathrm{calc}}` },
      { step: "A margin asks the bundle to deliver the duty times one plus the margin, so the required area is the calculated area times the same factor.",
        eq: String.raw`U\,F\,\Delta T_{\mathrm{lm}}\,A_{\mathrm{req}} = (1+m)\,|Q|` },
      { step: "Tubes are whole and lengths come from a list, so the bundle the engine can build has an area at or above the required one; the cost follows that area.",
        eq: String.raw`A_{\mathrm{bought}} \ge A_{\mathrm{req}}` },
    ],
    note: "The coefficient U is recomputed for the larger bundle (fewer tubes per pass means a different velocity), so the bought area is not exactly the "
      + "calculated area times one plus the margin; the engine's three numbers are the ones on screen. The stock lists in the witness are the case's own "
      + "assumption, not a maker's catalogue.",
  },
  {
    n: 2,
    title: "A margin is a decision about an uncertainty you can name",
    body: "A margin pays for something you do not know. The film coefficient of a condensing vapour on a tube bank is a correlation with a scatter; the fouling "
      + "allowance is a typical value, not a measurement of this water. Say you believe the overall coefficient could turn out a fraction \\(u\\) below the one used. "
      + "The bundle then delivers only \\(1-u\\) of what was calculated, and it still serves the duty when its area is at least the calculated area divided by \\(1-u\\). "
      + "The page sweeps the margin from nothing to thirty percent on the engine, reads the bought area and the cost at each, and marks the cheapest swept margin that covers the "
      + "uncertainty you set. A margin chosen without that sentence, \"for an uncertainty of this size in this quantity\", is a number nobody can defend or remove. "
      + "Misconception this breaks: ten percent is what a margin is.",
    formula: String.raw`A_{\mathrm{bought}} \ge \frac{A_{\mathrm{calc}}}{1-u}`,
    where: [
      { sym: "A_{\\mathrm{bought}}", means: "the installed area of the bought bundle", unit: "m2" },
      { sym: "A_{\\mathrm{calc}}", means: "the calculated area of step 1", unit: "m2" },
      { sym: "u", means: "the fraction by which you believe the overall coefficient may fall below the calculated one", unit: "–" },
      { sym: "Q_{\\mathrm{delivered}}", means: "the heat a bundle of area A delivers when the coefficient has fallen by u", unit: "W" },
      { sym: "A", means: "the area of a candidate bundle", unit: "m2" },
      { sym: "U", means: "the overall heat-transfer coefficient used in the calculation", unit: "W/(m2 K)" },
      { sym: "F", means: "the correction of the log-mean temperature difference", unit: "–" },
      { sym: "\\Delta T_{\\mathrm{lm}}", means: "the log-mean temperature difference", unit: "K" },
      { sym: "Q", means: "the heat duty", unit: "W" },
    ],
    derivation: [
      { step: "If the true coefficient is the calculated one times one minus u, a bundle of area A delivers that fraction of the duty the calculated one would.",
        eq: String.raw`Q_{\mathrm{delivered}} = (1-u)\,U\,F\,\Delta T_{\mathrm{lm}}\,A` },
      { step: "For the duty to hold, the delivered heat must reach the duty, which fixes the smallest area.",
        eq: String.raw`(1-u)\,U\,F\,\Delta T_{\mathrm{lm}}\,A \ge |Q| \;\Rightarrow\; A \ge \frac{A_{\mathrm{calc}}}{1-u}` },
    ],
    note: "This is the page's arithmetic on the engine's areas. It holds the coefficient U of the calculated bundle for the larger ones, which is not exact: a bigger bundle "
      + "has a slightly different velocity and so a slightly different coefficient. It also treats the whole of the uncertainty as one fall in U; a real project names several.",
  },
  {
    n: 3,
    title: "The stock steps: tube length and shell diameter",
    body: "Lengths come in a few values and shells in a few diameters, so the bought area moves in steps as the margin grows, and the same margin can cost more or less on a "
      + "different length. The engine tries every length on the case's list, finds on each the smallest bundle that meets the required duty, and buys the one with the smallest "
      + "installed area. Restrict the list to one length and the engine can buy only that: the table runs all four. The shell is the smallest listed inside diameter that holds the "
      + "bundle; the engine does not fill a larger shell with more tubes, and says so. Misconception this breaks: the cheapest length is the longest one.",
    note: "The area is what the page's cost follows. A longer tube with fewer tubes may need a different shell, which a cost correlation per item does not see; the engine says the "
      + "bundle is not enlarged to fill a larger shell.",
  },
  {
    n: 4,
    title: "A pipe: the next nominal size up",
    body: "A line is sized to a velocity window: fast enough to keep the pressure drop low enough to matter and slow enough to avoid erosion and noise. The window's ceiling fixes the "
      + "smallest bore, and the line you buy is the next nominal size on the list. Because the velocity at constant flow falls with the square of the bore, the flow area the bought "
      + "line has over the minimum is the ceiling over the actual velocity, minus one. The engine writes the line list for a small pumped drum, with the nominal size, the bore and "
      + "the velocity of each line; the window's ceiling for liquids is the knob. Only one size is priced in this case's cost table, and the page says which line is, and which is not. "
      + "Misconception this breaks: the pipe diameter is what the calculation gave.",
    formula: String.raw`\begin{gathered}v = \frac{4\dot V}{\pi d^{2}}\\ d_{\min} = d\sqrt{\frac{v}{v_{\max}}}\\ \frac{A_{\mathrm{bought}}}{A_{\min}} - 1 = \frac{v_{\max}}{v} - 1\end{gathered}`,
    where: [
      { sym: "v", means: "the velocity in the bought line, from the engine's line list", unit: "m/s" },
      { sym: "\\dot V", means: "the volumetric flow, fixed by the process", unit: "m3/s" },
      { sym: "d", means: "the inside diameter of the bought line, from the engine's line list", unit: "m" },
      { sym: "d_{\\min}", means: "the smallest inside diameter whose velocity does not pass the ceiling", unit: "m" },
      { sym: "v_{\\max}", means: "the velocity window's ceiling for the service, which the knob moves", unit: "m/s" },
      { sym: "A_{\\mathrm{bought}}", means: "the flow area of the bought line", unit: "m2" },
      { sym: "A_{\\min}", means: "the flow area of the smallest line the ceiling allows", unit: "m2" },
      { sym: "\\pi", means: "the ratio of a circle's circumference to its diameter", unit: "–" },
    ],
    derivation: [
      { step: "At a fixed flow the velocity is the flow over the flow area, which is a quarter of pi times the bore squared.",
        eq: String.raw`v = \frac{4\dot V}{\pi d^{2}}` },
      { step: "The smallest bore is the one whose velocity just reaches the ceiling; dividing the two velocities cancels the flow.",
        eq: String.raw`\frac{v}{v_{\max}} = \frac{d_{\min}^{2}}{d^{2}} \;\Rightarrow\; d_{\min} = d\sqrt{v/v_{\max}}` },
      { step: "Flow areas go as bores squared, so the margin in area is the ceiling over the velocity, less one.",
        eq: String.raw`\frac{A_{\mathrm{bought}}}{A_{\min}} - 1 = \frac{d^{2}}{d_{\min}^{2}} - 1 = \frac{v_{\max}}{v} - 1` },
    ],
    note: "The line list prints the bore and the velocity; the minimum bore is this page's arithmetic from them, not an engine number. The suction line is sized on a different rule than a window, "
      + "and the page reads the window's lines only.",
  },
  {
    n: 5,
    title: "A driver: the sizer's margin and the frame above it",
    body: "A compressor's driver is not chosen at the power the machine needs; the engine's sizer asks for the driver to be rated above it, by a margin it announces, with the source it names "
      + "in the run's own log, quoted below. The rating that results is still not a size you can buy: motors come in frames. The engine carries no frame list, so the ladder here is "
      + "yours: a step in kilowatts that you declare, and the page rounds the rating up to the next rung. The surplus of the frame over the machine's own shaft power is the margin plus the rounding, "
      + "as in the exchanger. Misconception this breaks: the driver is rated at the shaft power.",
    formula: String.raw`\begin{gathered}P_{\mathrm{rated}} = m_d\,P_{\mathrm{shaft}}\\ P_{\mathrm{frame}} = s\,\left\lceil P_{\mathrm{rated}}/s \right\rceil\end{gathered}`,
    where: [
      { sym: "P_{\\mathrm{rated}}", means: "the driver rating the sizer asks for", unit: "kW" },
      { sym: "m_d", means: "the driver margin, as a factor on the shaft power", unit: "–" },
      { sym: "P_{\\mathrm{shaft}}", means: "the shaft power the machine needs, from the engine", unit: "kW" },
      { sym: "P_{\\mathrm{frame}}", means: "the frame bought: the rating rounded up to a rung of your ladder", unit: "kW" },
      { sym: "s", means: "the step between rungs of the ladder you declare", unit: "kW" },
    ],
    derivation: [
      { step: "The sizer multiplies the greatest shaft power by the margin it carries.",
        eq: String.raw`P_{\mathrm{rated}} = m_d\,P_{\mathrm{shaft}}` },
      { step: "A ladder of equal steps has rungs at whole multiples of the step; the frame is the first rung at or above the rating.",
        eq: String.raw`P_{\mathrm{frame}} = s\,\left\lceil P_{\mathrm{rated}}/s \right\rceil` },
    ],
    note: "The page changes the margin and recomputes the rating by the formula the sizer uses; at the sizer's own margin the engine's printed rating and this page's agree, which the page's "
      + "tests hold. The engine prices no driver separately, so this card shows no cost.",
  },
  {
    n: 6,
    title: "What the margin costs, and what it covers",
    body: "Put the cost on a line against the margin and it climbs in steps, because the bought area does. No margin is free and none is optimal in itself: the question is what it covers. "
      + "Name the uncertainty, read the cheapest swept margin that covers it, and say it aloud: \"this much extra area, for this much uncertainty in this quantity, at this price\". "
      + "If the uncertainty cannot be named, the margin is a superstition that has a price. The same sentence applies to a pipe's next nominal size and a driver's next frame: each is a "
      + "margin that the stock chose for you, and the useful question is whether you would have chosen it. Misconception this breaks: a margin is safe because it is large.",
    note: "The cost is the engine's purchased cost of the condenser alone, from the correlation the case declares; it leaves out the shell-side and tube-side pressure drop a larger bundle changes, "
      + "and the pumping those drops cost, which the engine's sheet does print.",
  },
];

export const CB_LIMITS: readonly LessonLimit[] = [
  { id: "stock-is-assumed",
    title: "The stock lists are the case's own",
    body: "The tube lengths and the shell diameters in the witness are assumptions written for the lesson, with that said in the case; no maker's list was read. Replace them with a "
      + "supplier's before buying anything." },
  { id: "one-exchanger",
    title: "One exchanger, one line list, one compressor",
    body: "Each part runs a single shipped case. Nothing here says how the numbers change for a different service; the point is how a margin and a stock list turn a calculated "
      + "size into a bought one." },
  { id: "cover-test",
    title: "The cover test is one uncertainty in one quantity",
    body: "The test of step 2 treats the whole of what you do not know as a fall in the overall coefficient. A project names several uncertainties, and they do not add that way." },
  { id: "pipe-cost",
    title: "The pipe cost table has one entry",
    body: "The line list of the witness prices only the 4 inch line; every other size is listed as not costed, and the page shows it as such rather than inventing a price." },
  { id: "driver-ladder",
    title: "The driver ladder is yours",
    body: "The engine carries no frame list for motors. The ladder on the page is a step you set, and it prices nothing." },
];

export const CB_QUIZ: readonly QuizQuestion[] = [
  {
    id: "minimum", steps: [1],
    q: "How is the calculated area of an exchanger best read?",
    options: [
      "the area to be installed",
      "a minimum specification: the area of the smallest bundle that delivers the duty",
      "the area with a margin already in it",
      "an upper limit",
    ],
    correct: 1,
    feedback: "It is the smallest bundle that delivers the duty. Margin and stock sizes come on top (step 1).",
    origins: ["engine"],
  },
  {
    id: "surplus", steps: [1, 3],
    q: "The bought area exceeds the calculated one by more than the margin you declared. Why?",
    options: [
      "The engine adds a hidden second margin",
      "Whole tubes and the stock lengths add area beyond the margin",
      "The coefficient U was ignored",
      "The shell stock list was used to enlarge the bundle",
    ],
    correct: 1,
    feedback: "Tubes are whole and lengths come from a list, so the bundle is the next one that meets the requirement, at or above it (steps 1 and 3).",
    origins: ["engine"],
  },
  {
    id: "name-it", steps: [2, 6],
    q: "What makes a margin defensible?",
    options: [
      "That it is at least ten percent",
      "That it is large",
      "That it covers an uncertainty you can name, in a quantity you can name",
      "That the stock offers it",
    ],
    correct: 2,
    feedback: "A margin pays for something unknown; without the name of it, nobody can say whether it is too small or too large (steps 2 and 6).",
    origins: ["page"],
  },
  {
    id: "cover", steps: [2],
    q: "The overall coefficient may fall by 20 percent below the calculated one. By what factor must the area exceed the calculated area?",
    options: ["1.20", "1.25", "0.80", "1.00"],
    correct: 1,
    feedback: "The area must be at least the calculated area divided by one minus 0.20, which is a factor of 1.25 (step 2).",
    origins: ["page"],
  },
  {
    id: "pipe-area", steps: [4],
    q: "A line runs at 2 m/s with a window ceiling of 3 m/s. How much more flow area does it have than the smallest line the ceiling allows?",
    options: ["33 percent", "50 percent", "67 percent", "2 percent"],
    correct: 1,
    feedback: "The area ratio equals the velocity ceiling over the actual velocity, 3 over 2, so 50 percent more (step 4).",
    origins: ["page"],
  },
  {
    id: "driver", steps: [5],
    q: "The sizer rates a driver at 1.1 times the shaft power, and the frames come in steps of 100 kW. The shaft power is 450 kW. Which frame is bought?",
    options: ["495 kW", "500 kW", "450 kW", "600 kW"],
    correct: 1,
    feedback: "The rating is 495 kW, and the first rung of a 100 kW ladder at or above it is 500 kW (step 5).",
    origins: ["page"],
  },
];
