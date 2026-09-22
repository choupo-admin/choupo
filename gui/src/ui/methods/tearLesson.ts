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
  The tear-stream lesson, as DATA, so the arithmetic it claims can be
  recomputed against the tool's own `tearMath` in tests/tearLesson.test.ts —
  a page must not teach against its own code.

  THE SPINE.  A sequential-modular solver walks the units once in the order
  they are declared.  A cycle has no first unit, so something must be guessed;
  the guessed stream is the tear.  Everything else follows from that one
  sentence — why a cut is needed, which edges may be cut, what a cut costs,
  and why the count of cuts is a property of the ORDER rather than of the
  loops.

  THE DIVISION OF LABOUR, which is the reason the page exists rather than a
  chapter.  Choupo finds every cycle, names it, refuses an undeclared one
  seven ways by name, and prints a valid order to paste — and then stops,
  because `tearSelection auto` is deliberately deferred: cycle DETECTION is
  the engine's job and tear CHOICE is the author's.  Steps 1-6 are what the
  author has to decide; step 7 is what the engine will say if they decide it
  badly, and the page runs it.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const TEAR_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A sequential solver walks the units once, in the order you wrote them",
    body: "This is the whole premise, and it is worth being precise about "
      + "because everything below is a consequence. Choupo takes the "
      + "flattened unit list and executes it IN DECLARED ORDER. It does not "
      + "topologically sort it for you, and it does not decide for itself "
      + "which unit is ready. When it reaches a unit it reads that unit's "
      + "inlet streams out of the registry and solves it — so a unit whose "
      + "feed has not been computed yet will happily read the value sitting "
      + "in the case's 0/ directory and give you a wrong answer with a "
      + "successful exit code.",
    note: "That failure used to be silent. The 0/ completeness contract "
      + "pre-seeds every stream, so the historical \"input stream not in "
      + "registry\" guard could no longer fire, and two different mistakes — "
      + "an undeclared recycle, and an acyclic flowsheet declared in the "
      + "wrong order — both produced a plausible number at exit 0. The plan "
      + "validation of step 7 exists because of that.",
  },
  {
    n: 2,
    title: "A cycle has no first unit, so one stream has to be assumed",
    body: "Follow a recycle round: the mixer needs the recycle to compute its "
      + "outlet, the recycle comes from the splitter, the splitter needs the "
      + "separator, the separator needs the reactor, the reactor needs the "
      + "mixer. There is no unit you can start at whose feeds are all known. "
      + "The only way to walk the list once is to ASSUME one of those "
      + "streams, walk, and compare what comes back with what you assumed. "
      + "That stream is the TEAR, and the comparison is the fixed-point "
      + "problem the Wegstein EduTool is about.",
    derivation: [
      { step: "Cut one edge of the cycle. What is left is a chain that can "
          + "be walked from one end to the other." },
      { step: "The cut leaves the stream with two roles: an assumed INPUT at "
          + "the top of the chain, and a computed OUTPUT at the bottom.",
        eq: String.raw`x_\mathrm{assumed} \;\longrightarrow\; \text{walk the chain} \;\longrightarrow\; G(x_\mathrm{assumed})`},
      { step: "Iterate until the two agree. Choupo does this by Newton on "
          + "the tear residual by default, or by Wegstein if the case asks.",
        eq: String.raw`x = G(x)`},
    ],
    formula: String.raw`x = G(x)`,
    where: [
      { sym: "x", means: "the TEAR VECTOR — the assumed state of the cut "
        + "stream: its total flow, its composition and its temperature" },
      { sym: "G", means: "one complete pass through the flowsheet in declared "
        + "order, starting from that assumption" },
      { sym: "x_\\mathrm{assumed}",
        means: "the same tear vector, written out where the "
        + "point is that it is an ASSUMPTION being handed to the plant rather "
        + "than an answer" },
    ],
    note: "Nothing here is special to chemical engineering. It is the "
      + "standard way of turning a cyclic directed graph into a walkable one, "
      + "and every sequential-modular simulator does it.",
  },
  {
    n: 3,
    title: "Which edges MAY be cut: the ones that point backwards",
    body: "Here is the part that is easy to get wrong, and it is the reason "
      + "this page exists as well as the chapter. A tear is not any edge of a "
      + "cycle. Because the solver walks the DECLARED order, an edge only "
      + "needs a cut if it arrives at a unit that has already run — that is, "
      + "if it points BACKWARDS in that order. An edge that points forwards "
      + "needs no cut, and Choupo REFUSES to accept one as a tear, in those "
      + "words: a forward stream needs no cut; remove it from tearStreams.",
    derivation: [
      { step: "Write the units in the order they are declared and give each "
          + "a position. An edge runs from its producer's position to its "
          + "consumer's." },
      { step: "The edge is BACKWARD when the consumer sits at or before the "
          + "producer. At the same position means a unit consuming its own "
          + "output, which is a genuine one-unit cycle.",
        eq: String.raw`\text{backward} \iff \mathrm{pos}(\text{consumer}) \le \mathrm{pos}(\text{producer})`},
      { step: "Every backward edge must be declared, and no forward one may "
          + "be. So for a given order the tear set is not a choice: it IS "
          + "the set of backward edges." },
    ],
    formula: String.raw`\text{backward} \iff \mathrm{pos}(\text{consumer}) \le \mathrm{pos}(\text{producer})`,
    where: [
      { sym: "\\mathrm{pos}",
        means: "the position of a unit in the declared list — "
        + "first unit is 0, and the solver reaches them in that order" },
    ],
    note: "The panel below marks each edge forward or backward as you reorder "
      + "the units, and names the tears that follow.",
  },
  {
    n: 4,
    title: "Backward is not the same as a recycle, and Choupo tells the two apart",
    body: "An edge can point backwards for two entirely different reasons. "
      + "Either it closes a real material cycle — the plant genuinely sends "
      + "matter round a loop — or the plant is a plain chain and you simply "
      + "wrote the units in the wrong order. Both look identical to a naive "
      + "solver, and they need opposite remedies: the first needs a tear and "
      + "an iteration; the second needs the units moved. Declaring a tear "
      + "for the second compensates a typing mistake with an artificial "
      + "iteration, and gets a converged wrong answer.",
    derivation: [
      { step: "Take the backward edge from producer P to consumer C. Ask "
          + "whether C can reach P by following forward edges." },
      { step: "If it can, the edge closes a cycle and is a real recycle. "
          + "This is a TEAR." },
      { step: "If it cannot, there is no loop: the producer is simply "
          + "declared too late. This is an ORDER MISTAKE, and the fix is to "
          + "move the unit, not to add a tear." },
    ],
    note: "Choupo makes exactly this test and names the two outcomes "
      + "differently — MISSING TEAR quotes the cycle it found and the "
      + "declaration that would close it; INVALID ORDER says the edge lies "
      + "on no cycle and this is a declaration-order mistake, not a recycle. "
      + "Where the problem is the order it also prints a valid order to "
      + "paste.",
  },
  {
    n: 5,
    title: "What a cut costs, in the only currency the solver spends",
    body: "Every tear adds variables to the outer problem, and the count "
      + "depends on which solver runs. Wegstein packs the total flow, every "
      + "mole fraction and the temperature; Newton packs component flows and "
      + "the temperature, which is one fewer because it avoids the "
      + "redundancy of fractions that must sum to one. That difference is "
      + "small. The difference that is not small is what a STEP costs: "
      + "Newton builds its Jacobian by central finite differences, which is "
      + "two complete flowsheet sweeps per tear variable, while a Wegstein "
      + "step costs one sweep however long the vector is.",
    derivation: [
      { step: "Per torn stream, the Wegstein branch packs the total flow, "
          + "every mole fraction and the temperature.",
        eq: String.raw`n_W = N_t (N_c + 2)`},
      { step: "Per torn stream, the Newton branch packs component flows and "
          + "the temperature.",
        eq: String.raw`n_N = N_t (N_c + 1)`},
      { step: "And one Newton step perturbs each of those variables up and "
          + "down, running a full sweep at each.",
        eq: String.raw`\text{sweeps per Newton step} = 2 n_N`},
    ],
    formula: String.raw`\begin{aligned}
n_W &= N_t (N_c + 2) &\qquad n_N &= N_t (N_c + 1)\\[4pt]
\text{sweeps per Newton step} &= 2 n_N &\qquad \text{per Wegstein step} &= 1
\end{aligned}`,
    where: [
      { sym: "N_t", means: "the number of torn streams" },
      { sym: "N_c", means: "the number of components the flowsheet carries" },
      { sym: "n_W", means: "tear variables under the Wegstein branch" },
      { sym: "n_N", means: "tear variables under the Newton branch" },
    ],
    note: "So a second tear on a five-component plant costs Newton twelve "
      + "extra sweeps per step. That is the arithmetic behind the standing "
      + "advice to cut as few streams as you can — and the next step is "
      + "about the fact that HOW FEW is not decided by the loops.",
  },
  {
    n: 6,
    title: "Fewest tears is a property of the ORDER, not of the number of loops",
    body: "Count the loops and cut one edge of each, and you will often cut "
      + "more than you need: two cycles that share an edge can both be "
      + "opened by cutting it once. But in Choupo you cannot simply nominate "
      + "that shared edge, because a tear must point backwards and the "
      + "shared edge may point forwards in the order you wrote. Reorder the "
      + "units and it points backwards, and now one cut does the work of "
      + "two. That is the real decision: in a sequential-modular simulator, "
      + "CHOOSING THE TEARS IS CHOOSING THE ORDER.",
    derivation: [
      { step: "Fix an order. The tears are then forced: the backward edges "
          + "that close cycles." },
      { step: "Vary the order. Different edges become backward, so different "
          + "tear sets become reachable — and some orders are not valid at "
          + "all, because they leave a backward edge on no cycle." },
      { step: "The fewest tears this flowsheet can be solved with is "
          + "therefore a minimum over valid orders, and the panel below "
          + "searches all of them exhaustively rather than guessing." },
    ],
    note: "Fewest is not the same as best, and the page does not pretend "
      + "otherwise. A tear whose composition barely moves round the loop "
      + "converges faster than one the loop amplifies, and a tear an author "
      + "can make a sensible first guess at converges faster than one they "
      + "cannot. None of that is visible in the graph, which is precisely "
      + "why Choupo detects your cycles and refuses to choose your cut.",
  },
  {
    n: 7,
    title: "What the engine does when you get it wrong",
    body: "The plan is validated the moment the tear list is final and "
      + "before any state work, so an invalid plan refuses before it can "
      + "seed anything. The findings are COLLECTED and reported as one list, "
      + "each carrying its own remedy — a lint tool describes the whole "
      + "state of a case, not the first defect it meets — and each refusal "
      + "names what it found rather than saying that something is wrong. "
      + "Run the case below with and without its tear and read Choupo's own "
      + "words.",
    note: "The seven named refusals: MISSING TEAR (a backward edge on a "
      + "cycle, undeclared — quotes the cycle and the declaration that "
      + "closes it); INVALID ORDER (a backward edge on no cycle — a "
      + "declaration-order mistake, not a recycle); FORWARD TEAR (declared, "
      + "but consumed only after its producer); OFF-CYCLE TEAR (points "
      + "backwards but lies on no cycle); INLET TEAR (declared, but it is a "
      + "domain inlet with no producer); UNCONSUMED TEAR (nothing consumes "
      + "it, so no cut is needed); UNKNOWN TEAR (not a stream of this graph "
      + "at all — check the spelling). A valid plan is announced instead, "
      + "with its cuts shown: the recycle structure is never implicit.",
  },
];

export const TEAR_LIMITS: readonly LessonLimit[] = [
  {
    id: "graphs-are-teaching",
    title: "The three flowsheets in the panel are teaching graphs, not cases",
    body: "They are named boxes and named arrows declared in tearMath.ts. "
      + "Nothing in them is thermodynamic and no Choupo case is read to draw "
      + "them, so the verdicts beside them are graph theory rather than "
      + "engine output. The engine's OWN contract is exercised in the second "
      + "panel, on a real case, and what it prints there is quoted verbatim. "
      + "If the two ever disagree, the engine is right.",
  },
  {
    id: "no-ranking",
    title: "Nothing here ranks candidate tears, and that is deliberate",
    body: "The panel computes the fewest tears a valid order can achieve. It "
      + "does not tell you which of two equally cheap plans converges "
      + "faster, because that depends on how much the stream moves round the "
      + "loop, on whether the loop amplifies a disturbance in it, and on "
      + "whether you can make a sensible first guess at its state — none of "
      + "which is in the graph. Choupo declines that judgement too: "
      + "tearSelection auto is named in the contract and deliberately "
      + "deferred.",
  },
  {
    id: "material-only",
    title: "Material cycles only — an energy feedback is detected, not declared",
    body: "A unit may also depend on a duty computed by a unit declared "
      + "later, such as a condenser preheating the column's own feed. That "
      + "is a feedback loop too, and it forces the recycle outer loop on "
      + "even with no material tear, but it is detected automatically and is "
      + "never declared in tearStreams. The asymmetry is in the declaration "
      + "of the cut, not in the detection: a material tear needs a first "
      + "guess the author owns, while a duty starts at zero and converges by "
      + "successive substitution.",
  },
  {
    id: "flat-only",
    title: "One flat level, where a real plant nests",
    body: "The graphs here are flat. A fractal case declares sectors that "
      + "contain units, and a recycle may live inside one sector or run "
      + "between two. Choupo flattens the whole tree to one solver problem "
      + "before any of this happens, so the contract is the same — but the "
      + "names gain their sector prefix and the order you are choosing is "
      + "the flattened one.",
  },
  {
    id: "no-lag",
    title: "A tear is not a delay",
    body: "Deliberately lagging a forward stream — using last iteration's "
      + "value on purpose — would be a separate, explicit feature, and "
      + "Choupo says so in the refusal it gives a forward tear. A tear is "
      + "the cut that makes a cyclic graph walkable, and nothing else.",
  },
];
