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
  The pinch lesson, as DATA — same reason as the McCabe, Kremser and
  Hunter-Nash ones: prose is the part of a tool that rots with nothing
  failing, and an argument held as data can be asserted to still run end to
  end.

  THE ONE IDEA this page is built on: every other method here designs
  something and then reports what it costs.  Pinch analysis runs the other
  way — from the stream population alone it computes the LEAST hot and cold
  utility the whole plant can need, before one exchanger has been drawn.
  Everything else (the pinch itself, the three rules, the ΔT_min trade) is a
  consequence of that.

  THE WORDING DOCTRINE of the engine's pinch pass binds here too, and is
  gate-checked in the test: no superlative, ever.  A feasible match is a
  "thermodynamically admissible candidate"; a target says what is achievable
  and never that any particular network achieves it; the pass analyses and
  never rewrites a flowsheet.  See src/postProcessing/PinchPass.H and
  docs/design/pinch-programme-scope.md.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
export type { LessonStep, SymbolGloss };

export const PINCH_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "The answer arrives before the design does",
    body: "This is the reason pinch analysis is worth a lecture.  From the "
      + "process streams alone — what has to be cooled, what has to be "
      + "heated, and between which temperatures — you can compute the "
      + "minimum hot utility and the minimum cold utility the whole plant "
      + "can possibly need, before a single exchanger has been drawn or a "
      + "single match chosen.  Nothing about the network is assumed to get "
      + "there.  A stream, for this purpose, is not a pipe: it is a duty "
      + "with two temperatures, and its heat-capacity flow rate CP is the "
      + "only other thing the method wants.",
    formula: String.raw`\begin{array}{ll}
\text{hot stream:} & \text{must be cooled}, \quad T_\mathrm{supply} > T_\mathrm{target}\\
\text{cold stream:} & \text{must be heated}, \quad T_\mathrm{supply} < T_\mathrm{target}\\[6pt]
\mathrm{CP} = \dfrac{\lvert Q \rvert}{\lvert T_\mathrm{target} - T_\mathrm{supply} \rvert} & [\text{kW/K}]
\end{array}`,
    where: [
      { sym: "T_\\mathrm{supply}",
        means: "The temperature at which a stream is "
        + "available — the process-side inlet of the unit that carries the "
        + "duty.  A unit with no process-side inlet contributes no segment at "
        + "all.", unit: "K" },
      { sym: "T_\\mathrm{target}",
        means: "The temperature the stream must be brought "
        + "to — the process-side outlet of the same unit.  The pair "
        + "(T_supply, T_target) is what decides the stream's kind: target "
        + "below supply means it is being cooled, so it is a heat source.",
        unit: "K" },
      { sym: "Q", means: "The duty of one unit, taken from its converged run; "
        + "only its magnitude |Q| enters CP, the sign says hot or cold. "
        + " It is the only duty information this analysis has: a unit whose "
        + "duty is essentially zero is skipped, and each retained unit "
        + "becomes exactly one straight segment.", unit: "kW as printed" },
      { sym: "\\mathrm{CP}",
        means: "The heat-capacity flow rate — mass flow times "
        + "specific heat.  Read the units: kW/K, not kJ/(kg·K).  It is not a "
        + "heat capacity, and this is the single commonest confusion in the "
        + "whole method.  Here it is obtained by division from the duty and "
        + "the two terminal temperatures and held constant across the "
        + "segment.", unit: "kW/K" },
    ],
    note: "CP is a heat-capacity flow (mass flow × cp), not a heat capacity, "
      + "so on a temperature against heat-flow diagram a constant-CP stream is a "
      + "straight line whose slope dT/dQ is 1/CP (the horizontal axis is a "
      + "power in kW, not an enthalpy per kilogram).  Choupo builds one such segment per "
      + "duty-carrying unit in the converged run; the hypotheses that go "
      + "into that are listed at the foot of this page.",
  },
  {
    n: 2,
    title: "All the hot streams as one curve, all the cold streams as one",
    body: "Inside a temperature interval where several hot streams are "
      + "present, they behave exactly like one hot stream whose CP is their "
      + "sum: heat is heat, and the diagram only needs enthalpy against "
      + "temperature.  Add the interval enthalpies up from the cold end and "
      + "you have the hot composite curve — one line carrying every heat "
      + "source in the plant.  Do the same for everything that needs heating "
      + "and you have the cold composite.  Two lines now stand for the whole "
      + "process, and the individual streams stop mattering.",
    formula: String.raw`\begin{aligned}
\text{in an interval:}\quad \mathrm{CP}_\mathrm{total} &= \sum_i \mathrm{CP}_i \quad \text{(streams present there)}\\
\Delta H &= \mathrm{CP}_\mathrm{total} \cdot \Delta T\\
H(T) &= \sum \Delta H, \text{ accumulated from the cold end}
\end{aligned}`,
    where: [
      { sym: "\\mathrm{CP}_i",
        means: "The heat-capacity flow rate of one stream i — "
        + "the slope it contributes on the temperature-enthalpy diagram.",
        unit: "kW/K" },
      { sym: "\\mathrm{CP}_\\mathrm{total}",
        means: "The sum of the CP_i of every stream present "
        + "in one temperature interval, formed separately for the hot and the "
        + "cold populations.  Inside an interval the several streams behave "
        + "as one stream of this combined slope — which is exactly what lets "
        + "a composite curve exist at all.", unit: "kW/K" },
      { sym: "\\sum",
        means: "A sum over the streams present in that interval — "
        + "not over all streams.  Which streams are present changes at every "
        + "interval boundary, and that is why the composite curve is a "
        + "polyline and not a straight line.", unit: "none" },
      { sym: "\\Delta H", means: "The enthalpy change across one interval: "
        + "CP_total·ΔT.  It is a duty, and it is what the horizontal axis "
        + "measures.", unit: "kW" },
      { sym: "\\Delta T",
        means: "The width of the interval on the temperature axis.",
        unit: "K" },
      { sym: "H", means: "The accumulated enthalpy, built up from the cold "
        + "end.  Its zero is arbitrary — which is the freedom the next step "
        + "uses when it slides the curves horizontally.", unit: "kW" },
      { sym: "T", means: "Temperature: the vertical axis of both composite "
        + "curves, and the quantity the interval boundaries are cut on.",
        unit: "K" },
    ],
    note: "Only enthalpy differences carry meaning, so either curve may be "
      + "slid horizontally without changing a single stream.  That freedom "
      + "is the whole method: what you choose when you slide is how much "
      + "heat the process is allowed to exchange with itself.",
  },
  {
    n: 3,
    title: "Overlap is recovery; the two overhangs are the targets",
    body: "Slide the cold composite towards the hot one until the two curves "
      + "are nowhere closer, vertically, than ΔT_min.  Now read the "
      + "horizontal axis.  Where the curves overlap there is a hot stream "
      + "above a cold stream that wants heat at every temperature in the "
      + "overlap, so that enthalpy can be exchanged process to process.  "
      + "What sticks out cannot be: the cold overhang at the hot end has no "
      + "process heat above it and must be served by a hot utility; the hot "
      + "overhang at the cold end has no process sink below it and must go "
      + "to a cold utility.  Those two overhangs are Q_H,min and Q_C,min.",
    formula: String.raw`\begin{aligned}
Q_\mathrm{recovery} &= \text{the horizontal overlap}\\
Q_\mathrm{H,min} &= \sum \Delta H_\mathrm{cold} - Q_\mathrm{recovery}\\
Q_\mathrm{C,min} &= \sum \Delta H_\mathrm{hot} - Q_\mathrm{recovery}\\
\text{hence}\quad Q_\mathrm{H,min} - Q_\mathrm{C,min} &= \sum \Delta H_\mathrm{cold} - \sum \Delta H_\mathrm{hot}
\end{aligned}`,
    where: [
      { sym: "Q_\\mathrm{recovery}",
        means: "The heat exchanged between process streams "
        + "rather than with utilities — the horizontal overlap of the two "
        + "composite curves.  Every kilowatt here is a kilowatt you do not "
        + "buy and do not throw away.", unit: "kW" },
      { sym: "Q_\\mathrm{H,min}",
        means: "The minimum hot-utility target: the least "
        + "external heating this stream population admits at this approach.  "
        + "It is a target, not the duty of any equipment that exists — the "
        + "analysis reports it beside the current heating duty for comparison "
        + "and writes nothing into the flowsheet.", unit: "kW" },
      { sym: "Q_\\mathrm{C,min}",
        means: "The minimum cold-utility target: the heat "
        + "that must leave at the bottom.  Like its hot twin it says what is "
        + "achievable, never that the network in front of you achieves it.",
        unit: "kW" },
      { sym: "\\Delta H_\\mathrm{cold}",
        means: "The total enthalpy the cold streams need — "
        + "the full horizontal span of the cold composite.", unit: "kW" },
      { sym: "\\Delta H_\\mathrm{hot}",
        means: "The total enthalpy the hot streams have to "
        + "give up.  Note the identity on the third line: the difference of "
        + "the two targets is fixed by the streams alone and does not move "
        + "when you change the approach.  Only their common level does.",
        unit: "kW" },
    ],
    note: "That last line is a first-law identity and has no ΔT_min in it: "
      + "changing the approach moves both targets by the same amount, never "
      + "one alone.  Choupo does not slide curves — the engine runs the "
      + "Linnhoff-Flower problem table, which is the same construction done "
      + "in arithmetic, and prints its cascade row by row in the run log.",
  },
  {
    n: 4,
    title: "The pinch, and why ΔT_min is a choice and not a constant",
    body: "The place where the two curves come closest is the pinch.  It is "
      + "where the process is nearest to running out of driving force, and "
      + "it cuts the plant in two: above the pinch the process is a net heat "
      + "sink, served by hot utility and needing no cooling; below it the "
      + "process is a net heat source, needing no heating.  Where the pinch "
      + "sits is not a property of the fluids alone — you fixed it when you "
      + "picked ΔT_min.  A smaller ΔT_min lets the curves overlap further: "
      + "more recovery, less utility, a smaller energy bill.  But every "
      + "exchanger then works on a smaller temperature difference, and area "
      + "goes as Q/(U·ΔT_lm), so the same duty buys more surface.  ΔT_min is "
      + "a capital-against-energy trade you make deliberately.",
    formula: String.raw`\begin{aligned}
\text{shifted scale:}\quad T^* &= T_\mathrm{hot} - \tfrac{1}{2}\Delta T_\mathrm{min} = T_\mathrm{cold} + \tfrac{1}{2}\Delta T_\mathrm{min}\\
&\text{on that scale the composites touch at the pinch,}\\
&\text{and the cascade's net heat flow there is exactly } 0\\[4pt]
\text{exchanger area:}\quad A &= \frac{Q}{U \cdot \Delta T_\mathrm{lm}}
\end{aligned}`,
    where: [
      { sym: "T^*", means: "The shifted temperature — hot streams moved down "
        + "by half the approach, cold streams moved up by half.  On this "
        + "scale, adjacency in the table already guarantees a real driving "
        + "force of at least ΔT_min, which is what makes the cascade "
        + "arithmetic legitimate.", unit: "K" },
      { sym: "T_\\mathrm{hot}",
        means: "A temperature read on the hot streams' own "
        + "(unshifted) scale — what a thermometer in that stream reads.",
        unit: "K" },
      { sym: "T_\\mathrm{cold}",
        means: "The same interval read on the cold streams' "
        + "scale.  At the pinch, T_hot − T_cold is exactly ΔT_min: that is "
        + "what 'the curves come closest here' means in arithmetic.",
        unit: "K" },
      { sym: "\\Delta T_\\mathrm{min}",
        means: "The minimum approach you are willing to "
        + "accept — the one number you choose in this whole method.  Smaller "
        + "means less utility and more surface; it is an economic decision, "
        + "not a thermodynamic one.", unit: "K" },
      { sym: "A", means: "Exchanger area — the capital side of the approach "
        + "trade.", unit: "m²" },
      { sym: "Q", means: "The exchanger's duty.  In this formula it must be "
        + "in watts to give m² with U in W/(m²·K); the duties elsewhere on "
        + "the page are printed in kW, so multiply by 1000 first.",
        unit: "W" },
      { sym: "U", means: "The overall heat-transfer coefficient.  It appears "
        + "here only to name the mechanism by which a smaller approach buys "
        + "surface.  This analysis computes no U, no area and no cost — the "
        + "area and costing stage of the pinch programme is deliberately not "
        + "built, so no number on this page carries one.",
        unit: "W/(m²·K) — nominal; nothing here produces one" },
      { sym: "\\Delta T_\\mathrm{lm}",
        means: "The log-mean temperature difference an "
        + "exchanger actually sees.  Same caveat as U: named, not computed "
        + "here.", unit: "K" },
    ],
    note: "Turn the ΔT_min knob and watch both targets move together while "
      + "the pinch temperature moves with them.  The area side of that trade "
      + "is not computed anywhere in this tool: Choupo's pinch pass reports "
      + "energy targets only, so what you are shown is one half of the "
      + "trade-off, said plainly rather than left to look like a balance "
      + "somebody struck.  And not every problem has a pinch: lower ΔT_min "
      + "far enough and one of the two targets reaches zero — a threshold "
      + "problem, with no interior point of closest approach at all.  The "
      + "engine classifies the problem from the whole cascade, interior zeros "
      + "included: one interior zero is a pinch, several are several pinches "
      + "(the problem splits into independent sub-problems), and zeros only "
      + "at the top or the bottom of the range are a threshold problem with "
      + "no hot or no cold utility.  Whatever it finds, it publishes the word "
      + "(summary.csv) and every surface repeats it.  Check the identity on "
      + "your own numbers: Q_H,min − Q_C,min is the same at every ΔT_min.",
  },
  {
    n: 5,
    title: "The three rules — which are one rule wearing three faces",
    body: "This is the part you are examined on.  Do not transfer heat "
      + "across the pinch.  Do not use hot utility below the pinch.  Do not "
      + "use cold utility above the pinch.  They cost the same thing for the "
      + "same reason.  Move Q across the pinch, from the region above to the "
      + "region below: the region above has lost Q that it needed, so the "
      + "hot utility must replace it, and the region below has gained Q it "
      + "did not need, so the cold utility must reject it.  Both utility "
      + "duties rise above their targets by Q — the targets themselves do "
      + "not move — so a cross-pinch transfer of Q is paid for twice, and that "
      + "is the sentence worth remembering.  A heater below the pinch is "
      + "that same transfer with a utility standing in for the process "
      + "stream: heat is added where there is already a surplus, so it "
      + "leaves through the cold utility.  A cooler above the pinch is the "
      + "mirror image: heat is removed where there was a deficit, so the hot "
      + "utility makes it up.  One rule, three faces.",
    formula: String.raw`\begin{aligned}
&\text{cross-pinch transfer of } Q:\\
&\qquad Q_H = Q_\mathrm{H,min} + Q \qquad Q_C = Q_\mathrm{C,min} + Q\\[4pt]
&Q_H - Q_\mathrm{H,min} \;=\; Q_C - Q_\mathrm{C,min}\\
&\qquad = \text{cross-pinch transfer} + \text{heating below} + \text{cooling above}
\end{aligned}`,
    where: [
      { sym: "Q_H", means: "The hot-utility duty the network in front of you "
        + "actually uses — as opposed to Q_H,min, which is what it could use. "
        + " The gap between them is the whole point of the exercise.",
        unit: "kW" },
      { sym: "Q_C", means: "The cold-utility duty actually used.  Note that "
        + "cross-pinch transfer raises both by the same amount: heat sent "
        + "across the pinch has to be replaced above it and removed below.",
        unit: "kW" },
    ],
    note: "The engine names the last two terms in its own KPIs — "
      + "violation_heat_below_pinch_kW and violation_cool_above_pinch_kW — "
      + "measured against the network the case actually declares, and its "
      + "stated hypothesis is that they account, together with any "
      + "cross-pinch transfer, for exactly the current-minus-target excess.  "
      + "It reports those violations by name and by unit.  It does not "
      + "rewire the flowsheet: the network is yours.",
  },
];

export const PINCH_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "targets-not-a-network",
    title: "A target says what is achievable, never that anything achieves it.",
    body: "Q_H,min and Q_C,min are the least utility this stream population "
      + "admits at this ΔT_min. They are not a claim that the flowsheet in "
      + "front of you reaches them, and reaching them is a separate design "
      + "problem with a cost of its own — typically more exchangers and more "
      + "surface than a network that settles for less. Choupo's pinch pass "
      + "analyses: it writes no match into the flowsheet, moves no stream "
      + "and changes no topology. The network stays the author's.",
  },
  {
    id: "no-ranking",
    title: "The candidate table is exhaustive and unranked.",
    body: "Every hot × cold pair in each region is listed with the duty the "
      + "physics admits at this ΔT_min and the bound that limits it. A "
      + "feasible row is a thermodynamically admissible candidate and "
      + "nothing more: no row is ranked, preferred or recommended, because "
      + "which match to build turns on layout, controllability, safety and "
      + "cost that none of this reads. A pinch match whose CP rule the "
      + "engine marks violated keeps its away-from-pinch duty and is "
      + "listed — never quietly dropped.",
  },
  {
    id: "constant-cp",
    title: "One straight segment per duty-carrying unit.",
    body: "The pass takes CP = |Q| / |T_out − T_in| for each unit and holds "
      + "it constant across that segment, so a strongly temperature-"
      + "dependent cp is linearised over the unit; split the unit in the "
      + "flowsheet to refine it. A phase change (|ΔT| below the pass's "
      + "latentWidth, 1 K by default, with Q ≠ 0) enters as a "
      + "near-isothermal slice of that width at the unit's temperature — the "
      + "standard composite-curve treatment of latent duty, and a visible "
      + "approximation on the curve. The 1 K width is itself an assumption "
      + "you declare (latentWidth in the postDict): it moves the boundaries "
      + "of the problem table, and the pass runs no sensitivity on it, so a "
      + "target that sits on a latent slice is worth re-running at another "
      + "width.",
  },
  {
    id: "stream-population",
    title: "The streams are read off the units, not declared.",
    body: "The population is each unit's generic Q KPI paired with its first "
      + "non-utility inlet/outlet stream — which only heaters, coolers, "
      + "phase changers, flash drums and two-stream exchangers publish. Every "
      + "other heat duty is not in it: a column's reboiler and condenser, a "
      + "reactor's duty, a crystalliser's cooling. The pass lists each duty "
      + "it leaves out, with its kW, beside the targets (and in "
      + "reports/pinch/population.csv), and says that the targets are then "
      + "those of the extracted segments, not of the plant — in this "
      + "implementation, separating a column's two duties or placing a "
      + "reactor's heat at a temperature is a modelling choice nobody has "
      + "made yet, so they are named rather than guessed. A two-stream "
      + "exchanger is heat already recovered: it enters as both of its "
      + "sides, and its duty is counted in neither current-utility total, so "
      + "it can never be offered back as a further saving.",
  },
  {
    id: "no-area-or-cost",
    title: "No area target, no exchanger count, no capital cost.",
    body: "The capital half of the ΔT_min trade is described on this page "
      + "and computed nowhere in it: vertical-area targeting, the "
      + "minimum-units count and a cost target are a later phase of the "
      + "pinch programme that has not been authorised or built. So the tool "
      + "can tell you that a smaller ΔT_min buys energy and costs surface; "
      + "it cannot tell you where the two meet, and no number here should be "
      + "read as though it had.",
  },
  {
    id: "utility-levels",
    title: "Two totals, not a choice of utilities.",
    body: "Q_H,min and Q_C,min are total duties at the two extremes. Which "
      + "services supply them — a lower-pressure steam placed against the "
      + "grand composite, cooling water before a refrigerant — is a further "
      + "targeting step this pass does not take. The separate "
      + "utility-allocation report picks a catalogue service per duty under "
      + "an approach of its own; that is a different question with its own "
      + "declared dTmin, and the two are not the same number.",
  },
];

/*---------------------------------------------------------------------------*\
  EXPERIMENT (DEV.md 4c C305): the page asks for a PREDICTION before each run
  and then puts the engine's number beside the student's guess.  The prompts
  are data for the same reason the steps are; the comparison is drawn by the
  tool and is never a grade -- a guess and a result side by side, and the
  reader judges.
\*---------------------------------------------------------------------------*/

export interface PinchPrediction {
  id: "dTmin" | "noPinch" | "network";
  title: string;
  prompt: string;
  /** What the page then does with the engine, said before it does it. */
  check: string;
  /** Set on the one prompt the tool cannot run for the student. */
  designExercise?: boolean;
}

export const PINCH_PREDICTIONS: readonly PinchPrediction[] = [
  {
    id: "dTmin",
    title: "Prediction 1 · Halve the approach",
    prompt: "Reduce ΔT_min from 20 K to 10 K on the witness streams.  Will "
      + "Q_H,min rise, fall or stay the same?  By about how many kW?  Write "
      + "your guess before you press the button.",
    check: "The engine is run twice on the streams as they are set now, once "
      + "at 20 K and once at 10 K, and both targets are printed beside your "
      + "guess.  Look at Q_C,min as well: step 3 says what it must do.",
  },
  {
    id: "noPinch",
    title: "Prediction 2 · Make the pinch disappear",
    prompt: "Change one supply temperature (the knobs above) until the engine "
      + "reports no interior pinch.  Before you turn the knob, write which "
      + "stream you will move, in which direction, and why physically the "
      + "point of closest approach should then leave the interior of the "
      + "range.",
    check: "The engine's classification of the problem at your knob values "
      + "is printed beside your explanation as soon as it answers.  A "
      + "threshold problem has a zero only at an end of the cascade: one of "
      + "the two utilities is then not needed at all.",
  },
  {
    id: "network",
    title: "Design exercise · A network that approaches the targets",
    prompt: "On paper, design a heat-exchanger network for the four witness "
      + "streams whose hot utility comes as close to Q_H,min as you can.  "
      + "The candidate table (view: Candidates) lists every admissible pair "
      + "and the duty that pair alone allows.  When you have it, type the "
      + "hot and cold utility your network uses.",
    check: "This tool does not build networks.  It prints the engine's two "
      + "targets beside your two numbers and checks one thing any network "
      + "must satisfy, whatever its matches: the first law, "
      + "Q_H − Q_C = Q_H,min − Q_C,min.  Whether your network respects "
      + "ΔT_min in every exchanger is for you to check.",
    designExercise: true,
  },
];

/** IS IT ECONOMIC?  The capital half of step 4's trade, said as a question
 *  the student has to answer, because the engine does not answer it: the
 *  pinch pass reports energy targets only, and area targeting, the
 *  units count and a cost target (supertargeting) are not built. */
export const PINCH_ECONOMIC_STEP: LessonStep = {
  n: 6,
  title: "Is it economic?",
  body: "The targets are thermodynamic: the least utility the streams admit "
    + "at the approach you chose.  They are not the cheapest plant.  A "
    + "smaller ΔT_min lowers the energy bill and raises the exchanger area, "
    + "because every exchanger then works on a smaller driving force, and "
    + "the ΔT_min of least total cost sits where the falling energy cost "
    + "and the rising capital cost add up to the smallest sum.  Choupo does "
    + "not compute that point: its pinch pass prices no area, so this page "
    + "shows the energy half of the trade and says so.  Before you open the "
    + "list below, write down which data you would need to find it.",
  formula: String.raw`\begin{aligned}
\text{annual cost}(\Delta T_\mathrm{min}) &= c_H\,Q_\mathrm{H,min} + c_C\,Q_\mathrm{C,min} + f_A \sum_k C_A(A_k)\\[4pt]
A_k &= \frac{Q_k}{U_k\,\Delta T_{\mathrm{lm},k}}
\end{aligned}`,
  where: [
    { sym: "c_H", means: "The price of hot utility per unit of duty and "
      + "year — steam, fired heat.  Choupo's pinch pass reads none.",
      unit: "currency per kW and year" },
    { sym: "c_C", means: "The price of cold utility, the same way — cooling "
      + "water, refrigeration.", unit: "currency per kW and year" },
    { sym: "f_A", means: "The annualisation factor that turns a capital "
      + "cost into a cost per year (interest rate and plant life).",
      unit: "1/year" },
    { sym: "C_A", means: "The installed cost of one exchanger as a function "
      + "of its area, typically a + b·A^c from a costing correlation.",
      unit: "currency" },
    { sym: "k", means: "The index of one exchanger of the network: the sum "
      + "runs over every unit, so the number of units matters as much as "
      + "the area.", unit: "none" },
    { sym: "A_k", means: "The heat-transfer area of exchanger k.",
      unit: "m²" },
    { sym: "Q_k", means: "The duty of exchanger k, in watts when U_k is in "
      + "W/(m²·K).", unit: "W" },
    { sym: "U_k", means: "The overall heat-transfer coefficient of exchanger "
      + "k, from the two film coefficients and any fouling.",
      unit: "W/(m²·K)" },
    { sym: "\\Delta T_{\\mathrm{lm},k}", means: "The log-mean temperature "
      + "difference of exchanger k.  It shrinks as ΔT_min shrinks, which is "
      + "how a smaller approach buys area.", unit: "K" },
  ],
  note: "What you would need, at least: a U for every match (or film "
    + "coefficients per stream), a cost law for an exchanger against its "
    + "area (cost per m² or a + b·A^c), the price of each utility and the "
    + "hours the plant runs a year, and the interest rate and life that "
    + "annualise the capital.  With them, the total annual cost can be "
    + "evaluated at several ΔT_min values and the lowest one read off — the "
    + "supertargeting step this tool has not built.",
};

/** The Experiment moment's steps as a LIST, the shape every lesson module
 *  exports: tests/lessonTex.test.ts finds steps by that shape and parses
 *  every formula and glossed symbol in them. */
export const PINCH_EXPERIMENT_STEPS: readonly LessonStep[] = [PINCH_ECONOMIC_STEP];
