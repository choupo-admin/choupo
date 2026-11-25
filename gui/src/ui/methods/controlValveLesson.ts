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
  controlValveLesson -- the lesson of "Why does a correctly sized valve still
  control badly?" (C509), as DATA.  Pinned by tests/controlValve.test.ts.

  SOURCES.  None is cited.  The derivation of the installed flow is the
  page's own algebra (four lines, printed), and the three inherent
  characteristics are conventions of valve makers whose primary source was
  not read: the page says "by convention" where it names them.  The two
  pieces of practitioner advice of step 5 are stated as advice a student
  will meet, with no author and no quotation.  The choking and cavitation
  relations of step 6 are letdown.ts's, whose own header names where they
  were read.

  The seven steps are the seven cards of the commission; the commission's
  seventh card (throttling against slowing the pump) is NOT in this lesson.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export type FailAction = "open" | "closed" | "inPlace";

export interface FailService {
  id: string;
  service: string;
  /** What the valve does to the plant, in a sentence. */
  role: string;
  /** What happens on each fail action, authored. */
  consequence: Readonly<Record<FailAction, string>>;
  /** Why the safe direction is not one word. */
  pull: string;
  /** The EduTool that holds the numbers which decide it. */
  tool: "overpressure" | "process-safety";
  toolLabel: string;
}

/** Card 8's six services.  AUTHORED text: the page says it is not computed
 *  and not engine-checked. */
export const FAIL_SERVICES: readonly FailService[] = [
  {
    id: "jacket-steam", service: "Steam to a reactor jacket",
    role: "Heats a batch reactor whose reaction needs heat to start.",
    consequence: {
      open: "The jacket stays hot. If the reaction has already started and gives heat, the jacket adds to it.",
      closed: "The jacket cools. An endothermic reaction slows and stops; the batch cools toward the jacket's coolant.",
      inPlace: "The heat input stays at its last value while the reactor drifts.",
    },
    pull: "Closed is the usual safe side for a reaction that releases heat. A product that solidifies when it cools reverses the choice.",
    tool: "process-safety", toolLabel: "Process safety",
  },
  {
    id: "reactor-cooling", service: "Cooling water to a reactor",
    role: "Removes the heat of an exothermic reaction.",
    consequence: {
      open: "The reactor overcools. A reaction that needs a minimum temperature slows down, and its reagent can accumulate unreacted.",
      closed: "Cooling is lost while the reaction still releases heat; the temperature climbs at the adiabatic rate until something else stops it.",
      inPlace: "The cooling stays at its last value; the heat release may rise or fall away from it.",
    },
    pull: "Open is the usual safe side against runaway. A reagent that accumulates in a cold reactor and then reacts at once pulls the other way.",
    tool: "process-safety", toolLabel: "Process safety",
  },
  {
    id: "fuel-gas", service: "Fuel gas to a fired heater",
    role: "Sets the burner duty of a furnace heating a process stream.",
    consequence: {
      open: "The burner keeps firing at full supply. With the process flow lost, the tubes overheat.",
      closed: "The flame goes out and the furnace cools; the process stream is no longer heated.",
      inPlace: "The firing stays at its last duty.",
    },
    pull: "Closed is the usual safe side for the furnace; the process downstream of it sees a lost heat input instead.",
    tool: "process-safety", toolLabel: "Process safety",
  },
  {
    id: "reflux", service: "Reflux to a distillation column",
    role: "Returns condensed overhead to the top of the column.",
    consequence: {
      open: "Reflux keeps flowing. If the pump or the drum level is the failure, an open valve passes whatever the drum holds until it empties.",
      closed: "The top loses its liquid; the overhead composition drifts toward the heavier components and the drum level rises.",
      inPlace: "The reflux holds at its last flow while the feed and the heat input move.",
    },
    pull: "Which side is safe depends on what else fails with the air: the quality of the overhead product, the drum and the pump each name a different one.",
    tool: "process-safety", toolLabel: "Process safety",
  },
  {
    id: "flare-letdown", service: "Let-down to the flare",
    role: "Opens to bring a vessel's pressure down in an upset.",
    consequence: {
      open: "The vessel depressures into the flare header, and the flare takes the inventory at the valve's capacity.",
      closed: "Nothing relieves the vessel through this path; its pressure rises with the upset.",
      inPlace: "The valve stays where it was: shut if it was shut when the air failed.",
    },
    pull: "Open protects the vessel and loads the flare; closed protects the flare and leaves the vessel to its own relief device.",
    tool: "overpressure", toolLabel: "Overpressure",
  },
  {
    id: "compressor-feed", service: "Feed to a compressor",
    role: "Throttles the gas that reaches the machine's suction.",
    consequence: {
      open: "The machine keeps drawing. If its discharge has stopped, the pressure it builds climbs toward its limit.",
      closed: "The machine is starved; its suction pressure falls, and a suction below atmospheric can draw air into the system.",
      inPlace: "The suction flow holds at its last value as the demand changes.",
    },
    pull: "The two failures hurt different things: the machine and its discharge on one side, the purity and the pressure of the suction side on the other.",
    tool: "overpressure", toolLabel: "Overpressure",
  },
];

export const CV_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A valve is a resistance in series, and it gets what the line leaves",
    body: "A control valve sits in a line with a pump behind it. Pump and line fix how much pressure there is to share; the line takes some in "
      + "friction and fittings, and the valve takes the rest. The pressure drop on the valve's datasheet is therefore not a property of the valve. "
      + "It is whatever the line leaves, and it changes as the flow changes: the faster the liquid moves, the more the line takes and the less is "
      + "left for the valve. The share of the available pressure the valve holds when it is wide open is its authority, "
      + "\\(a\\); the rest of this page is about what that one number does. The bench below does not type it: the engine's pump and pipe, swept over "
      + "the flow, give the pump's rise and the line's drop at each flow, and the valve is sized to take the difference at the rated flow you pick. "
      + "Misconception this breaks: the valve drop is the number on the datasheet. The model could mislead in one way, said in the note: it holds "
      + "the source's pressure constant while the engine's pump, which has constant power, rises as the flow falls.",
    formula: String.raw`\begin{gathered}a = \frac{\Delta P_{v,0}}{P_t}\\ P_t = \Delta P_{\mathrm{line}}(Q) + \Delta P_v(Q)\end{gathered}`,
    where: [
      { sym: "a", means: "the valve's authority", unit: "–" },
      { sym: "\\Delta P_{v,0}", means: "the valve's pressure drop when wide open at the rated flow", unit: "Pa" },
      { sym: "P_t", means: "the pressure available to the line and the valve together: the pump's rise less the static elevation", unit: "Pa" },
      { sym: "\\Delta P_{\\mathrm{line}}", means: "the pressure the line takes in friction and fittings at the flow Q", unit: "Pa" },
      { sym: "\\Delta P_v", means: "the pressure the valve takes at the flow Q", unit: "Pa" },
      { sym: "Q", means: "the volumetric flow", unit: "m3/s" },
      { sym: "k", means: "the line's resistance: its drop is k times the flow squared", unit: "Pa s2/m6" },
      { sym: "C_v", means: "the valve's flow coefficient at its present opening", unit: "m3/(s Pa^0.5)" },
      { sym: "C_{v,\\max}", means: "its flow coefficient wide open", unit: "m3/(s Pa^0.5)" },
      { sym: "Q_{\\max}", means: "the flow with the valve wide open", unit: "m3/s" },
      { sym: "q", means: "the flow relative to the wide-open flow", unit: "–" },
      { sym: "f", means: "the flow coefficient relative to its wide-open value", unit: "–" },
    ],
    derivation: [
      { step: "The source holds one pressure for the line and the valve in series; the line drops its resistance times the flow squared, and the valve the rest.",
        eq: String.raw`P_t = k\,Q^2 + \Delta P_v` },
      { step: "A liquid valve passes a flow set by its flow coefficient, so its drop is the flow squared over the coefficient squared (turbulent, incompressible, unchoked, no flashing).",
        eq: String.raw`\begin{gathered}Q = C_v\sqrt{\Delta P_v}\\ \Delta P_v = Q^2/C_v^2\end{gathered}` },
      { step: "Wide open the coefficient is its largest and the flow is the wide-open flow; the valve takes its wide-open drop and the line the rest.",
        eq: String.raw`\begin{gathered}a = \frac{Q_{\max}^2/C_{v,\max}^2}{P_t}\\ 1-a = \frac{k\,Q_{\max}^2}{P_t}\end{gathered}` },
      { step: "Divide the first equation, written as the pressure equal to the flow squared times the resistance plus one over the coefficient squared, by the pressure. In relative flow and relative coefficient it solves in closed form.",
        eq: String.raw`\begin{gathered}1 = q^2\Big[(1-a) + \frac{a}{f^2}\Big]\\ q = \frac{f}{\sqrt{a+(1-a)f^2}}\end{gathered}` },
    ],
    note: "The pump and the pipe are the engine's (the pumpSystem01 case, run in your browser). The toy "
      + "part is the page's: a valve whose opening you move, in a line that takes its drop in proportion to the flow squared with the engine's "
      + "value at the rated flow. The engine's pump rise at the minimum flow, printed beside the rated one, shows how far a constant source "
      + "head is from a constant-power pump.",
  },
  {
    n: 2,
    title: "The inherent characteristic is a promise made with the valve alone",
    body: "Valve makers cut the trim so that the flow coefficient follows the opening in a chosen way, measured with a constant pressure drop across "
      + "the valve. Three shapes are named by convention: linear, where the coefficient is proportional to the opening; equal percentage, where each "
      + "equal step of opening multiplies the coefficient by the same factor, so it grows exponentially, with a rangeability \\(R\\) that the maker "
      + "declares; and quick opening, which gives most of the capacity in the first part of the travel (the page draws the square root). "
      + "They are choices of trim design, not laws of fluid mechanics, and nothing here cites a standard for them: the rangeability and the curves "
      + "are yours to declare. Misconception this breaks: the characteristic of a valve is a physical law. It is a promise, true only while the "
      + "drop across the valve is constant, which step 3 shows is rarely so.",
    formula: String.raw`\begin{gathered}f_{\mathrm{lin}} = x\\ f_{\mathrm{eq}} = R^{\,x-1}\\ f_{\mathrm{qo}} = \sqrt{x}\end{gathered}`,
    where: [
      { sym: "f", means: "the flow coefficient relative to its value wide open", unit: "–" },
      { sym: "x", means: "the opening, the fraction of full travel", unit: "–" },
      { sym: "R", means: "the rangeability declared for the equal-percentage trim: the ratio of the largest to the smallest controllable coefficient", unit: "–" },
      { sym: "f_{\\mathrm{lin}}", means: "the linear characteristic", unit: "–" },
      { sym: "f_{\\mathrm{eq}}", means: "the equal-percentage characteristic", unit: "–" },
      { sym: "f_{\\mathrm{qo}}", means: "the quick-opening characteristic, as the page draws it", unit: "–" },
    ],
    note: "At x = 0 the equal-percentage curve stands at 1/R, not at zero: a real valve seats and leaks, and the page leaves that out. "
      + "The minimum controlling opening of step 5 is a teaching value.",
  },
  {
    n: 3,
    title: "Installed: the line takes the promise away",
    body: "Put the valve in its line and the drop across it is no longer constant: it is largest when the flow is small, because the line takes "
      + "little then, and it shrinks as the valve opens and the flow grows. Opening the valve a little more now buys less extra flow than the "
      + "inherent curve promised. With the relation of step 1 the installed curve is the inherent one pressed toward a flat top: with an "
      + "authority of one the two curves coincide, and as the authority falls the installed flow climbs steeply at small openings and then "
      + "flattens. A linear valve in a line that holds most of the pressure no longer gives flow linear in its opening. The marked point is the opening "
      + "below which the installed flow is more than a tenth above the promise. Misconception this breaks: a linear valve gives flow linear in opening. "
      + "The model could mislead on the source: a pump whose head rises as the flow falls gives the valve more drop at small flow, which makes the "
      + "installed curve a little friendlier than the page draws it.",
    formula: String.raw`q = \frac{f(x)}{\sqrt{a + (1-a)\,f(x)^2}}`,
    where: [
      { sym: "q", means: "the installed flow relative to the flow with the valve wide open", unit: "–" },
      { sym: "f(x)", means: "the inherent characteristic of step 2", unit: "–" },
      { sym: "a", means: "the authority of step 1", unit: "–" },
    ],
    note: "With a = 1 the formula gives q = f. As a approaches zero, q approaches 1 for every opening above zero: the valve does nothing "
      + "until it is nearly shut.",
  },
  {
    n: 4,
    title: "What the controller feels: the loop gain",
    body: "A controller does not see the valve's curve; it sees how much the flow moves when it moves the stem, the slope of the installed curve. That "
      + "slope is the valve's contribution to the loop gain, and a loop tuned where the gain is small is too aggressive where it is large. The page "
      + "prints the largest and smallest slope over the working range (openings from the minimum to full travel) and their ratio: the ratio is the "
      + "number to read, and the page ranks no shape. The ratio changes with the authority and in opposite senses for different shapes. In a line that holds most "
      + "of the pressure (authority near one) the linear valve gives the flattest gain; equal percentage is the one that rescues a line which takes most of the drop. "
      + "Misconception this breaks: choose equal percentage by default. A loop that is stable at the opening of lowest gain has its gain margin divided by "
      + "that ratio at the opening of highest gain, a question for the Bode page.",
    formula: String.raw`K_v(x) = \frac{a\,\mathrm{d}f/\mathrm{d}x}{\big(a+(1-a)f^2\big)^{3/2}}`,
    where: [
      { sym: "K_v", means: "the valve's gain: the slope of the installed flow against the opening", unit: "–" },
      { sym: "\\mathrm{d}f/\\mathrm{d}x", means: "the slope of the inherent characteristic", unit: "–" },
      { sym: "a", means: "the authority of step 1", unit: "–" },
      { sym: "f", means: "the inherent characteristic of step 2", unit: "–" },
      { sym: "\\mathrm{GM}_{\\mathrm{low}}", means: "the loop's gain margin at the opening of lowest valve gain: the factor by which the loop gain may grow before the loop is on the edge of instability", unit: "–" },
      { sym: "\\mathrm{GM}_{\\mathrm{high}}", means: "the gain margin left at the opening of highest valve gain", unit: "–" },
      { sym: "K_{v,\\max}", means: "the largest valve gain over the working range", unit: "–" },
      { sym: "K_{v,\\min}", means: "the smallest valve gain over the working range", unit: "–" },
    ],
    note: "The gain is evaluated by its analytic derivative, not by differences. The gain margin at the opening of highest gain is \\(\\mathrm{GM}_{\\mathrm{high}} = \\mathrm{GM}_{\\mathrm{low}}\\,/\\,(K_{v,\\max}/K_{v,\\min})\\), the page's arithmetic on one assumption: "
      + "everything else in the loop, the process and the controller, holds still while the valve moves.",
    leadsTo: {
      tool: "bode", toolLabel: "Frequency response", stepTitle: "The open loop, and the two crossover frequencies",
      body: "Which margin does a loop keep when its plant gain changes by a factor of ten? The Bode page works that question for a given loop.",
    },
  },
  {
    n: 5,
    title: "Rangeability, and the start-up trap",
    body: "A valve big enough for start-up and for maximum load has to hold the minimum load too, and the opening that does that may be below the one "
      + "at which the valve controls at all. The installed turndown is the wide-open flow divided by the smallest flow the valve controls, "
      + "and it is far smaller than the makers' rangeability once the line has taken its share. Two pieces of advice meet here, and a student "
      + "will hear both. One says to split the duty: a running valve for the normal load and a smaller starting valve for the low flows, the small one set to close first. "
      + "The other says to control the flow in a line only once, because two valves in one flow loop make two controllers fight. "
      + "Which failure is the plant more likely to meet: a valve that cannot hold the minimum load, or two loops that fight? The page draws the opening "
      + "each arrangement sits at and the turndown it buys, and leaves the question open. Misconception this breaks: bigger is safer.",
    formula: String.raw`f = \frac{q\sqrt{a}}{\sqrt{1-(1-a)\,q^{2}}}`,
    where: [
      { sym: "q", means: "the relative flow demanded", unit: "–" },
      { sym: "a", means: "the authority of the valve for which the flow is relative", unit: "–" },
      { sym: "f", means: "the capacity fraction the flow demands, solved from step 3's relation", unit: "–" },
      { sym: "\\mathrm{turndown}", means: "the wide-open flow over the smallest flow the valve controls", unit: "–" },
      { sym: "s", means: "the capacity of the valve relative to the big valve's: 1 for the big valve alone, less than 1 for the starting valve", unit: "–" },
      { sym: "x_{\\min}", means: "the lowest opening at which the page calls the valve controlling: a teaching value, yours to change", unit: "–" },
    ],
    note: "The installed turndown is \\(1/q_{\\min}\\), where \\(q_{\\min} = q\\big(s\\,f(x_{\\min})\\big)\\) is the relative flow at the lowest controlling opening. The starting valve here carries the whole minimum load alone, and its capacity is a fraction of the big valve's. The hand-over between "
      + "the two valves is not drawn.",
  },
  {
    n: 6,
    title: "Where the valve is most at risk: choking and cavitation at small flow",
    body: "The drop across the valve is the largest where the flow is the smallest, so the check for cavitation and choking belongs at low flow, "
      + "not at the maximum. The page takes the pump's pressure budget from the engine and draws the valve drop against the flow, with the largest drop the "
      + "liquid can take before the flow chokes. Both come from the letdown page's relations: the choked drop, the cavitation index and "
      + "the regime. The water's vapour pressure is the engine's, evaluated at the temperature you set. A small pump leaves the valve far from "
      + "either limit; a larger one brings the left end of the curve into them. Misconception this breaks: check cavitation at maximum flow.",
    formula: String.raw`\begin{gathered}\Delta P_v(q) = P_t\big(1-(1-a)\,q^2\big)\\ \sigma = \frac{P_1 - P_v}{P_1 - P_2}\end{gathered}`,
    where: [
      { sym: "\\Delta P_v", means: "the pressure drop across the valve at the relative flow q", unit: "Pa" },
      { sym: "\\sigma", means: "the cavitation index: larger is safer", unit: "–" },
      { sym: "P_1", means: "the pressure upstream of the valve", unit: "Pa" },
      { sym: "P_2", means: "the pressure downstream of the valve, the discharge vessel's", unit: "Pa" },
      { sym: "P_v", means: "the vapour pressure of the water at the temperature you set, from the engine", unit: "Pa" },
    ],
    note: "\\(F_L\\) is yours, the letdown page's own labelled default. The pressure downstream is the pump's inlet pressure, from the engine, so "
      + "that the sized line starts and ends at the same pressure.",
    leadsTo: {
      tool: "letdown", toolLabel: "Large pressure letdown",
      stepTitle: "Cavitation: vapour that forms, and then collapses",
      body: "The relations used here, with their sources and their limits, are worked out on the letdown page: the vena contracta, the choked drop and the two ways a liquid vaporises.",
    },
  },
  {
    n: 7,
    title: "Which way does it fail, and who is hurt?",
    body: "When the air supply to an actuator is lost the valve goes where its spring puts it: open, closed, or where it stood. The choice is a design "
      + "decision and it can pull two ways in one plant: the side that protects a vessel can be the side that hurts the process behind it. Six "
      + "services below give the student the question. The consequences are AUTHORED text, written for this lesson from plant practice in general: "
      + "nothing here is computed and nothing is checked by the engine. The numbers that decide a real case, a relief rate or a runaway "
      + "temperature rise, live on the Overpressure and Process safety pages. Misconception this breaks: fail-safe is one word. The safe "
      + "direction differs for each service and for each upset.",
    note: "Where the valve stands relative to a pump matters as well: a valve in the suction line lowers the pressure the pump sees. The "
      + "pump-and-system page covers it.",
    leadsTo: {
      tool: "pump-system", toolLabel: "Pump vs system curve", stepTitle: "NPSH: the separate question that can stop the whole thing",
      body: "A valve on the suction side starves the pump instead of loading it. The pump page shows how the suction pressure sets the margin.",
    },
  },
];

export const CV_LIMITS: readonly LessonLimit[] = [
  { id: "constant-head",
    title: "A constant source",
    body: "The model holds the pressure available to the line and the valve constant as the flow changes. A centrifugal pump's head "
      + "rises as the flow falls, which gives the valve more drop at low flow, so the installed gain is friendlier than step 3 draws it. "
      + "The engine's constant-power pump, printed beside the rated flow, shows the size of the difference." },
  { id: "liquid-only",
    title: "Liquid only",
    body: "Every relation here assumes a turbulent, incompressible liquid with no choking and no flashing. A gas passes through the valve "
      + "differently (the letdown page treats it), and a liquid that flashes does not obey the square-root law." },
  { id: "friction",
    title: "Stiction and hysteresis",
    body: "A real valve sticks and lags at small openings, and at small openings they dominate the behaviour; the curves here are smooth." },
  { id: "conventions",
    title: "The characteristics and the minimum opening are conventions",
    body: "The three inherent shapes, the rangeability R and the lowest controlling opening are values the page declares for the lesson. "
      + "A maker's valve carries its own certified characteristic, and no source was read for the shapes drawn here." },
  { id: "authored",
    title: "The fail cards are authored",
    body: "The consequences of step 7 are written text. They are not computed from a model of the plant and the engine has not checked them." },
];

export const CV_QUIZ: readonly QuizQuestion[] = [
  {
    id: "datasheet-drop", steps: [1],
    q: "What fixes the pressure drop across a control valve in service?",
    options: [
      "The valve's datasheet",
      "What the pump and the line leave over at that flow",
      "The valve's size alone",
      "The inlet temperature",
    ],
    correct: 1,
    feedback: "The valve shares the available pressure with the line, so its drop is whatever the line leaves at that flow (step 1).",
    origins: ["page"],
  },
  {
    id: "promise", steps: [2, 3],
    q: "A linear valve sits in a line that takes most of the pressure. What does flow against opening look like?",
    options: [
      "A straight line, because the valve is linear",
      "Steep at small openings and flattening toward full travel",
      "Flat at small openings and steep at the end",
      "Independent of the opening",
    ],
    correct: 1,
    feedback: "The drop on the valve shrinks as it opens, so each extra bit of opening buys less flow than the inherent curve promised (step 3).",
    origins: ["page"],
  },
  {
    id: "which-shape", steps: [4],
    q: "Which shape gives the flattest loop gain when the valve holds nearly all the available pressure?",
    options: [
      "Equal percentage, always",
      "Quick opening",
      "Linear",
      "None: the gain is the same for every shape",
    ],
    correct: 2,
    feedback: "With an authority near one the installed curve is the inherent one, and the linear curve has the flattest slope; equal percentage pays when the line takes most of the drop (step 4).",
    origins: ["page"],
  },
  {
    id: "bigger", steps: [5],
    q: "Why is a valve sized for the maximum load not automatically safer?",
    options: [
      "It always costs more",
      "At the minimum load it must sit at an opening where it no longer controls well",
      "It makes the pump run backwards",
      "It lowers the authority to zero",
    ],
    correct: 1,
    feedback: "The wider the valve, the smaller the opening that carries the minimum flow, and the lower its installed turndown (step 5).",
    origins: ["page"],
  },
  {
    id: "where-cavitates", steps: [6],
    q: "At which end of the flow range is the drop across the valve, and so its risk of choking, the largest?",
    options: [
      "At maximum flow",
      "At minimum flow",
      "At half flow",
      "The same everywhere",
    ],
    correct: 1,
    feedback: "At small flow the line takes little, so the valve takes almost all the available pressure: check cavitation and choking there (step 6).",
    origins: ["page"],
  },
];
