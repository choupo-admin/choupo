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
      + "MINIMUM hot utility and the MINIMUM cold utility the whole plant "
      + "can possibly need, before a single exchanger has been drawn or a "
      + "single match chosen.  Nothing about the network is assumed to get "
      + "there.  A stream, for this purpose, is not a pipe: it is a duty "
      + "with two temperatures, and its heat-capacity flow rate CP is the "
      + "only other thing the method wants.",
    formula: "hot stream:   must be COOLED,  T_supply > T_target\n"
      + "cold stream:  must be HEATED,  T_supply < T_target\n"
      + "CP = Q / |T_target − T_supply|        [kW/K]",
    where: [
      { sym: "T_supply", means: "The temperature at which a stream is "
        + "AVAILABLE — the process-side inlet of the unit that carries the "
        + "duty.  A unit with no process-side inlet contributes no segment at "
        + "all.", unit: "K" },
      { sym: "T_target", means: "The temperature the stream must be brought "
        + "TO — the process-side outlet of the same unit.  The pair "
        + "(T_supply, T_target) is what decides the stream's kind: target "
        + "below supply means it is being cooled, so it is a heat SOURCE.",
        unit: "K" },
      { sym: "Q", means: "The duty of one unit, taken from its converged run. "
        + " It is the only duty information this analysis has: a unit whose "
        + "duty is essentially zero is skipped, and each retained unit "
        + "becomes exactly one straight segment.", unit: "kW as printed" },
      { sym: "CP", means: "The heat-capacity FLOW RATE — mass flow times "
        + "specific heat.  Read the units: kW/K, not kJ/(kg·K).  It is NOT a "
        + "heat capacity, and this is the single commonest confusion in the "
        + "whole method.  Here it is obtained by DIVISION from the duty and "
        + "the two terminal temperatures and held constant across the "
        + "segment.", unit: "kW/K" },
    ],
    note: "CP is a heat-capacity FLOW (mass flow × cp), not a heat capacity, "
      + "so on a temperature-enthalpy diagram a constant-CP stream is a "
      + "straight line of slope 1/CP.  Choupo builds one such segment per "
      + "duty-carrying unit in the converged run; the hypotheses that go "
      + "into that are listed at the foot of this page.",
  },
  {
    n: 2,
    title: "All the hot streams as ONE curve, all the cold streams as one",
    body: "Inside a temperature interval where several hot streams are "
      + "present, they behave exactly like one hot stream whose CP is their "
      + "sum: heat is heat, and the diagram only needs enthalpy against "
      + "temperature.  Add the interval enthalpies up from the cold end and "
      + "you have the HOT COMPOSITE CURVE — one line carrying every heat "
      + "source in the plant.  Do the same for everything that needs heating "
      + "and you have the COLD COMPOSITE.  Two lines now stand for the whole "
      + "process, and the individual streams stop mattering.",
    formula: "in an interval:  CP_total = Σ CP_i   (streams present there)\n"
      + "                 ΔH        = CP_total · ΔT\n"
      + "H(T) = Σ ΔH, accumulated from the cold end",
    where: [
      { sym: "CP_i", means: "The heat-capacity flow rate of ONE stream i — "
        + "the slope it contributes on the temperature-enthalpy diagram.",
        unit: "kW/K" },
      { sym: "CP_total", means: "The sum of the CP_i of every stream present "
        + "in one temperature interval, formed separately for the hot and the "
        + "cold populations.  Inside an interval the several streams behave "
        + "as ONE stream of this combined slope — which is exactly what lets "
        + "a composite curve exist at all.", unit: "kW/K" },
      { sym: "Σ", means: "A sum over the streams PRESENT IN THAT INTERVAL — "
        + "not over all streams.  Which streams are present changes at every "
        + "interval boundary, and that is why the composite curve is a "
        + "polyline and not a straight line.", unit: "none" },
      { sym: "ΔH", means: "The enthalpy change across one interval: "
        + "CP_total·ΔT.  It is a duty, and it is what the horizontal axis "
        + "measures.", unit: "kW" },
      { sym: "ΔT", means: "The width of the interval on the temperature axis.",
        unit: "K" },
      { sym: "H", means: "The accumulated enthalpy, built up from the cold "
        + "end.  Its ZERO is arbitrary — which is the freedom the next step "
        + "uses when it slides the curves horizontally.", unit: "kW" },
      { sym: "T", means: "Temperature: the vertical axis of both composite "
        + "curves, and the quantity the interval boundaries are cut on.",
        unit: "K" },
    ],
    note: "Only enthalpy DIFFERENCES carry meaning, so either curve may be "
      + "slid horizontally without changing a single stream.  That freedom "
      + "is the whole method: what you choose when you slide is how much "
      + "heat the process is allowed to exchange with itself.",
  },
  {
    n: 3,
    title: "Overlap is recovery; the two overhangs ARE the targets",
    body: "Slide the cold composite towards the hot one until the two curves "
      + "are nowhere closer, vertically, than ΔT_min.  Now read the "
      + "horizontal axis.  Where the curves OVERLAP there is a hot stream "
      + "above a cold stream that wants heat at every temperature in the "
      + "overlap, so that enthalpy can be exchanged process to process.  "
      + "What sticks out cannot be: the cold overhang at the hot end has no "
      + "process heat above it and must be served by a hot utility; the hot "
      + "overhang at the cold end has no process sink below it and must go "
      + "to a cold utility.  Those two overhangs are Q_H,min and Q_C,min.",
    formula: "Q_recovery = the horizontal overlap\n"
      + "Q_H,min = Σ ΔH_cold − Q_recovery\n"
      + "Q_C,min = Σ ΔH_hot  − Q_recovery\n"
      + "hence   Q_H,min − Q_C,min = Σ ΔH_cold − Σ ΔH_hot",
    where: [
      { sym: "Q_recovery", means: "The heat exchanged between process streams "
        + "rather than with utilities — the horizontal OVERLAP of the two "
        + "composite curves.  Every kilowatt here is a kilowatt you do not "
        + "buy and do not throw away.", unit: "kW" },
      { sym: "Q_H,min", means: "The minimum HOT-utility target: the least "
        + "external heating this stream population admits at this approach.  "
        + "It is a TARGET, not the duty of any equipment that exists — the "
        + "analysis reports it beside the current heating duty for comparison "
        + "and writes nothing into the flowsheet.", unit: "kW" },
      { sym: "Q_C,min", means: "The minimum COLD-utility target: the heat "
        + "that must leave at the bottom.  Like its hot twin it says what is "
        + "achievable, never that the network in front of you achieves it.",
        unit: "kW" },
      { sym: "ΔH_cold", means: "The total enthalpy the cold streams need — "
        + "the full horizontal span of the cold composite.", unit: "kW" },
      { sym: "ΔH_hot", means: "The total enthalpy the hot streams have to "
        + "give up.  Note the identity on the third line: the DIFFERENCE of "
        + "the two targets is fixed by the streams alone and does not move "
        + "when you change the approach.  Only their common level does.",
        unit: "kW" },
    ],
    note: "That last line is a first-law identity and has no ΔT_min in it: "
      + "changing the approach moves BOTH targets by the same amount, never "
      + "one alone.  Choupo does not slide curves — the engine runs the "
      + "Linnhoff-Flower problem table, which is the same construction done "
      + "in arithmetic, and prints its cascade row by row in the run log.",
  },
  {
    n: 4,
    title: "The pinch, and why ΔT_min is a choice and not a constant",
    body: "The place where the two curves come closest is the PINCH.  It is "
      + "where the process is nearest to running out of driving force, and "
      + "it cuts the plant in two: above the pinch the process is a net heat "
      + "SINK, served by hot utility and needing no cooling; below it the "
      + "process is a net heat SOURCE, needing no heating.  Where the pinch "
      + "sits is not a property of the fluids alone — you fixed it when you "
      + "picked ΔT_min.  A smaller ΔT_min lets the curves overlap further: "
      + "more recovery, less utility, a smaller energy bill.  But every "
      + "exchanger then works on a smaller temperature difference, and area "
      + "goes as Q/(U·ΔT_lm), so the same duty buys more surface.  ΔT_min is "
      + "a capital-against-energy trade you make deliberately.",
    formula: "shifted scale:  T* = T_hot − ΔT_min/2 = T_cold + ΔT_min/2\n"
      + "on that scale the composites TOUCH at the pinch,\n"
      + "and the cascade's net heat flow there is exactly 0\n"
      + "exchanger area:  A = Q / (U · ΔT_lm)",
    where: [
      { sym: "T*", means: "The SHIFTED temperature — hot streams moved down "
        + "by half the approach, cold streams moved up by half.  On this "
        + "scale, adjacency in the table already guarantees a real driving "
        + "force of at least ΔT_min, which is what makes the cascade "
        + "arithmetic legitimate.", unit: "K" },
      { sym: "T_hot", means: "A temperature read on the HOT streams' own "
        + "(unshifted) scale — what a thermometer in that stream reads.",
        unit: "K" },
      { sym: "T_cold", means: "The same interval read on the COLD streams' "
        + "scale.  At the pinch, T_hot − T_cold is exactly ΔT_min: that is "
        + "what 'the curves come closest here' means in arithmetic.",
        unit: "K" },
      { sym: "ΔT_min", means: "The minimum approach you are willing to "
        + "accept — the one number you CHOOSE in this whole method.  Smaller "
        + "means less utility and more surface; it is an economic decision, "
        + "not a thermodynamic one.", unit: "K" },
      { sym: "A", means: "Exchanger area — the capital side of the approach "
        + "trade.", unit: "m²" },
      { sym: "U", means: "The overall heat-transfer coefficient.  IT APPEARS "
        + "HERE ONLY TO NAME THE MECHANISM by which a smaller approach buys "
        + "surface.  This analysis computes no U, no area and no cost — the "
        + "area and costing stage of the pinch programme is deliberately not "
        + "built, so no number on this page carries one.",
        unit: "W/(m²·K) — nominal; nothing here produces one" },
      { sym: "ΔT_lm", means: "The log-mean temperature difference an "
        + "exchanger actually sees.  Same caveat as U: named, not computed "
        + "here.", unit: "K" },
    ],
    note: "Turn the ΔT_min knob and watch both targets move together while "
      + "the pinch temperature moves with them.  The AREA side of that trade "
      + "is not computed anywhere in this tool: Choupo's pinch pass reports "
      + "energy targets only, so what you are shown is one half of the "
      + "trade-off, said plainly rather than left to look like a balance "
      + "somebody struck.  And not every problem has a pinch: lower ΔT_min "
      + "far enough and one of the two targets reaches zero — a THRESHOLD "
      + "problem, with no interior point of closest approach at all.  When "
      + "it is the HOT target that vanishes the cascade never dips below "
      + "zero, and the engine then leaves its pinch temperature at the top "
      + "of the temperature range: that is the cascade's convention showing "
      + "through rather than a pinch, and the target that went to zero is "
      + "what carries the meaning there.",
  },
  {
    n: 5,
    title: "The three rules — which are one rule wearing three faces",
    body: "This is the part you are examined on.  Do not transfer heat "
      + "ACROSS the pinch.  Do not use hot utility BELOW the pinch.  Do not "
      + "use cold utility ABOVE the pinch.  They cost the same thing for the "
      + "same reason.  Move Q across the pinch, from the region above to the "
      + "region below: the region above has lost Q that it needed, so the "
      + "hot utility must replace it, and the region below has gained Q it "
      + "did not need, so the cold utility must reject it.  BOTH targets "
      + "rise by Q — a cross-pinch transfer of Q is paid for twice, and that "
      + "is the sentence worth remembering.  A heater below the pinch is "
      + "that same transfer with a utility standing in for the process "
      + "stream: heat is added where there is already a surplus, so it "
      + "leaves through the cold utility.  A cooler above the pinch is the "
      + "mirror image: heat is removed where there was a deficit, so the hot "
      + "utility makes it up.  One rule, three faces.",
    formula: "cross-pinch transfer of Q:\n"
      + "    Q_H = Q_H,min + Q        Q_C = Q_C,min + Q\n"
      + "excess over target\n"
      + "    = cross-pinch transfer + heating below + cooling above",
    where: [
      { sym: "Q_H", means: "The hot-utility duty the network in front of you "
        + "ACTUALLY uses — as opposed to Q_H,min, which is what it could use. "
        + " The gap between them is the whole point of the exercise.",
        unit: "kW" },
      { sym: "Q_C", means: "The cold-utility duty actually used.  Note that "
        + "cross-pinch transfer raises BOTH by the same amount: heat sent "
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
      + "approximation on the curve.",
  },
  {
    id: "stream-population",
    title: "The streams are read off the units, not declared.",
    body: "The population is each unit's generic Q KPI paired with its first "
      + "non-utility inlet/outlet stream. Multi-duty equipment — a column "
      + "carrying both a reboiler and a condenser — therefore enters as its "
      + "NET duty unless the flowsheet models the two as separate units. The "
      + "current-versus-target line sums raw duties, so heat already "
      + "recovered through drawn heat-links is still counted at the units it "
      + "touches.",
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
