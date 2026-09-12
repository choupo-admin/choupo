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
  The Wegstein lesson, as DATA, so the arithmetic it claims can be recomputed
  against the tool's own `wegsteinMath` in tests/wegsteinLesson.test.ts — a
  page must not teach against its own code.

  THE SPINE.  A recycle turns a flowsheet into a fixed-point problem in the
  torn stream: guess it, run the plant once, and see what comes back.  Direct
  substitution accepts whatever comes back; Wegstein fits a straight line
  through the last two guesses and jumps to where that line meets the
  diagonal.  Everything else on the page is a consequence.

  THE QUESTION IT WAS BUILT TO ANSWER.  The tear vector holds a molar flow,
  a set of mole fractions and a temperature, and the owner's standing doubt
  was how one accelerator can serve them at once.  It never compares them:
  the acceleration is per variable, and the secant slope each variable gets
  is a ratio of two differences in that variable's own unit, so it is
  dimensionless and unchanged by any rescaling of it.  Steps 4 and 5 are
  that answer, and step 7 is its price.

  THE HONESTY SPINE.  The engine does not publish `q`.  Steps 1-3 and 6-7
  describe the recursion, and the page drives it over a DECLARED toy so the
  coefficients are visible; step 8 is the real engine on a real recycle, and
  the page says at the top of each half which one it is in.  Every claim
  about the engine below carries the file and line that makes it true.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

export const WEGSTEIN_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "A recycle makes the flowsheet a fixed-point problem",
    body: "Cut the recycle, and the plant becomes a chain you can walk "
      + "through once: every unit's feed is known by the time you reach it. "
      + "But the cut stream is an INPUT to the chain and an OUTPUT of it, "
      + "and those two are not the same number until you have finished. So "
      + "you guess the cut stream, run the whole chain once, and look at "
      + "what came back round. The sweep is a function: you handed it a "
      + "stream and it handed you a stream. The answer you want is the "
      + "stream that comes back unchanged.",
    derivation: [
      { step: "Call the assumed state of the torn stream x, and call one "
          + "complete pass through the flowsheet G. One pass turns the "
          + "assumption into its consequence.",
        eq: "x_assumed  ->  one sweep  ->  G(x_assumed)" },
      { step: "The plant is consistent exactly when the consequence agrees "
          + "with the assumption. That is a fixed point, not an equation to "
          + "rearrange: G has no formula — it is a reactor, a flash and a "
          + "splitter run in order.",
        eq: "x = G(x)" },
      { step: "Equivalently, a root of the tear residual. This is the form "
          + "Newton wants; the fixed-point form is the one direct "
          + "substitution and Wegstein want.",
        eq: "r(x) = G(x) - x = 0" },
    ],
    formula: "x = G(x)          equivalently   r(x) = G(x) - x = 0",
    where: [
      { sym: "x", means: "the TEAR VECTOR — the assumed state of the cut "
        + "stream, one number per independent coordinate of it" },
      { sym: "G", means: "ONE complete pass through the flowsheet in "
        + "declared order: the function that turns the assumed tear into "
        + "what the plant sends back" },
      { sym: "r", means: "the TEAR RESIDUAL, how far the returned stream is "
        + "from the assumed one. Zero at the answer" },
      { sym: "x_assumed", means: "the same tear vector, written out where the "
        + "point is that it is an ASSUMPTION being handed to the plant rather "
        + "than an answer" },
    ],
    note: "Choupo executes the flattened units in DECLARED ORDER and never "
      + "topologically sorts them, so the sweep is exactly the walk you read "
      + "in the flowsheetDict. Which stream is cut is the author's "
      + "declaration; see the tear-streams EduTool for why the engine will "
      + "not choose it for you.",
  },
  {
    n: 2,
    title: "What is actually in the vector — and it is not the same for both solvers",
    body: "A process stream carries a total flow, a composition, a "
      + "temperature, a pressure and a phase split. Pressure is set by the "
      + "units and the phase split follows from a flash, so neither is torn. "
      + "What remains is where the two solvers in Choupo part company, and "
      + "the difference is worth knowing because it is the first place a "
      + "reader's mental model can go wrong.",
    derivation: [
      { step: "The WEGSTEIN branch packs the total flow, every mole "
          + "fraction, and the temperature — per torn stream "
          + "(src/unitOperations/flowsheet/Flowsheet.cpp:1988-1999).",
        eq: "x = ( F, z_1, z_2, ..., z_Nc, T )" },
      { step: "That is one number more than the stream has independent "
          + "content, because the fractions must sum to one. The redundant "
          + "direction is harmless but real, and the unpack step "
          + "renormalises the fractions back onto the simplex every "
          + "iteration (:2027).",
        eq: "z_1 + z_2 + ... + z_Nc = 1" },
      { step: "The NEWTON branch avoids the redundancy by tearing on "
          + "component molar flows instead, which are mutually independent "
          + "(:3404-3413). The total and the fractions are recovered "
          + "afterwards.",
        eq: "x = ( F_1, ..., F_Nc, T ),    F_i = F z_i" },
    ],
    formula: "Wegstein   x = ( F, z_1, ..., z_Nc, T )      Nc + 2 numbers\n"
      + "Newton     x = ( F_1, ..., F_Nc, T )        Nc + 1 numbers",
    where: [
      { sym: "F", means: "total molar flow of the torn stream", unit: "kmol/s" },
      { sym: "z_i / z_1 / z_2 / z_Nc", means: "mole fraction of component i "
        + "in the torn stream, numbered 1 to Nc — dimensionless, and "
        + "constrained to sum to 1" },
      { sym: "F_i / F_1 / F_Nc", means: "molar flow of component i alone, "
        + "numbered 1 to Nc", unit: "kmol/s" },
      { sym: "T", means: "temperature of the torn stream", unit: "K" },
      { sym: "N_c", means: "number of components in the flowsheet" },
      { sym: "Nc", means: "the same count, written without the underscore "
        + "where a subscript would nest inside another" },
    ],
    note: "So the Wegstein tear vector really does hold a flow of order "
      + "1e-4 kmol/s, several dimensionless fractions, and a temperature "
      + "near 360 K, all in one list. That is the situation the next three "
      + "steps are about.",
  },
  {
    n: 3,
    title: "Direct substitution, and why it can crawl",
    body: "The obvious thing to do with x = G(x) is to accept what comes "
      + "back and go round again. It converges when each pass shrinks the "
      + "error — and the factor by which it shrinks is the LOOP GAIN, the "
      + "slope of G at the answer. A loop that recycles a little converges "
      + "in a handful of passes. A loop that recycles most of what it makes "
      + "has a gain near one, and then the error shrinks by a few percent "
      + "per pass and you are counting sweeps in the hundreds.",
    derivation: [
      { step: "Accept the consequence as the next assumption.",
        eq: "x_next = G(x)" },
      { step: "Write the error against the answer and linearise G about it. "
          + "The next error is the current one multiplied by the slope.",
        eq: "e_next = a e,      a = the slope of G at the fixed point" },
      { step: "So the error is geometric, and the number of sweeps needed "
          + "for a fixed accuracy blows up as the gain approaches one.",
        eq: "e_k = a^k e_0" },
    ],
    formula: "x_next = G(x)          e_k = a^k e_0",
    where: [
      { sym: "e / e_k / e_next / e_0", means: "the error — how far the "
        + "current assumption is from the fixed point. Written e_k at sweep "
        + "k, e_next one sweep on, and e_0 at the author's first guess" },
      { sym: "a", means: "the LOOP GAIN in this direction: the slope of G at "
        + "the answer. Below 1 in magnitude the loop contracts; at 1 it does "
        + "not converge at all" },
      { sym: "k", means: "the sweep counter — each k is one complete pass "
        + "through every unit of the plant" },
      { sym: "x_next", means: "the assumption the NEXT sweep will be handed. "
        + "How it is formed from the current one is the whole difference "
        + "between the three solvers on this page" },
    ],
    note: "A sweep is not cheap. Every pass re-solves every flash, every "
      + "reactor and every column in the plant. Halving the number of "
      + "sweeps is the whole economic case for an accelerator.",
  },
  {
    n: 4,
    title: "Wegstein: two points make a line, and a line has a fixed point you can solve",
    body: "After two passes you do not have one point on the curve y = G(x), "
      + "you have two. Two points define a straight line. Treat that line as "
      + "if it WERE G, and the fixed-point equation becomes linear — one you "
      + "can solve exactly instead of iterating. Take the answer as the next "
      + "guess. That is the whole method.",
    derivation: [
      { step: "The secant slope through the last two passes. Both the "
          + "numerator and the denominator are differences in the SAME "
          + "quantity, so this ratio is dimensionless "
          + "(src/solver/Wegstein.cpp:78).",
        eq: "s = ( G(x_k) - G(x_prev) ) / ( x_k - x_prev )" },
      { step: "Solve the linear fixed point on that secant line: set the "
          + "line equal to x and collect terms.",
        eq: "x = G(x_k) + s ( x - x_k )   ->   x (1 - s) = G(x_k) - s x_k" },
      { step: "Rearranged with one bookkeeping coefficient, which is the "
          + "form the code uses (src/solver/Wegstein.cpp:82, :85).",
        eq: "q = s / (s - 1)" },
    ],
    formula: "x_next = q x + (1 - q) G(x)        q = s / (s - 1)",
    where: [
      { sym: "s", means: "the SECANT SLOPE through the last two passes — the "
        + "method's estimate of how much of a change in the assumption "
        + "survives one trip round the loop. Dimensionless" },
      { sym: "q", means: "the Wegstein COEFFICIENT: how the next guess mixes "
        + "the current assumption with its image. q = 0 is direct "
        + "substitution; q = -1 is a step twice as long; q below -1 is "
        + "stronger extrapolation" },
      { sym: "x_prev", means: "the assumption used on the PREVIOUS pass — the "
        + "second point the secant needs" },
      { sym: "x_k", means: "the assumption used on the current pass" },
    ],
    note: "Note where q lives: between 0 and minus infinity for a "
      + "contracting direction. A slope s of 0.9 gives q = -9, a step ten "
      + "times longer than direct substitution would take. Step 6 is about "
      + "why the engine does not let it.",
  },
  {
    n: 5,
    title: "The answer to the question: it never compares a flow with a temperature",
    body: "It never compares them. Here is the thing that is easy to assume "
      + "and wrong: Wegstein does "
      + "NOT form a step direction in the tear vector and scale it. It runs "
      + "the scalar recursion of step 4 SEPARATELY on every entry of the "
      + "vector: the total flow gets its own secant and its own coefficient, "
      + "each mole fraction gets its own, the temperature gets its own. The "
      + "loop in the engine reads entry i and nothing else "
      + "(src/solver/Wegstein.cpp:67-86). There is no shared step length, so "
      + "there is no scale to get wrong, and no question of whether "
      + "1e-4 kmol/s is large or small compared with 360 K ever arises.",
    derivation: [
      { step: "One secant per variable, formed only from that variable's own "
          + "history. Nothing couples the rows.",
        eq: "s_i = ( g_i(x_k) - g_i(x_prev) ) / ( x_i,k - x_i,prev )" },
      { step: "One coefficient per variable, and one update per variable.",
        eq: "x_i,next = q_i x_i + (1 - q_i) g_i(x)" },
      { step: "Now rescale variable i however you like — kelvin to Celsius, "
          + "kmol/s to kmol/h — as an affine map. The image rescales the "
          + "same way, because it is the same quantity.",
        eq: "x_i -> A x_i + B      implies      g_i -> A g_i + B" },
      { step: "Both the numerator and the denominator of the secant pick up "
          + "the same factor A, and the offset B cancels in each difference. "
          + "So the slope is unchanged, hence so is the coefficient, hence "
          + "so is the entire trajectory.",
        eq: "s_i -> ( A g_i ) / ( A x_i ) = s_i" },
    ],
    formula: "s_i = ( g_i(x_k) - g_i(x_prev) ) / ( x_i,k - x_i,prev )\n"
      + "x_i,next = q_i x_i + (1 - q_i) g_i(x)         one i at a time",
    where: [
      { sym: "s_i", means: "the secant slope of variable i alone" },
      { sym: "q_i", means: "the Wegstein coefficient of variable i alone" },
      { sym: "g_i", means: "entry i of the sweep's answer G(x) — what the "
        + "plant sent back for that one variable" },
      { sym: "x_i", means: "entry i of the tear vector: one flow, or one "
        + "mole fraction, or the temperature. Written x_i,k on the current "
        + "pass and x_i,prev on the previous one" },
      { sym: "A", means: "the multiplier of an affine change of unit (3600 "
        + "for kmol/s to kmol/h)" },
      { sym: "B", means: "the offset of an affine change of unit (-273.15 for "
        + "kelvin to Celsius)" },
    ],
    note: "The panel below lets you re-express the two variables and check "
      + "that claim rather than take it: every coefficient in the table "
      + "stays put to the last digit. Choupo itself packs the tear in "
      + "canonical SI always (kmol/s, K); the re-expression is a question "
      + "about the method, not a switch the engine has.",
  },
  {
    n: 6,
    title: "The clamp, and the two degenerate cases the code handles by name",
    body: "The secant is an estimate, and a bad estimate makes a dangerous "
      + "step. If the slope comes out above 1 the linear model is not a "
      + "contraction at all and the coefficient turns POSITIVE, which sends "
      + "the iterate away from the answer. If the slope comes out just below "
      + "1 the denominator is tiny and the coefficient becomes a huge "
      + "negative number, which throws the iterate far past anywhere the "
      + "straight line was ever a good description of the plant. So the "
      + "coefficient is clamped to a declared interval, and two further "
      + "cases are caught by name rather than by arithmetic.",
    derivation: [
      { step: "The clamp, read from the case's own solverDict "
          + "(recycleWegsteinQmin / recycleWegsteinQmax).",
        eq: "q = clamp( s / (s - 1),  q_min,  q_max )" },
      { step: "q_max = 0 forbids the wrong direction: whenever the secant "
          + "says the loop is not contracting, the step falls back to plain "
          + "direct substitution — slow, never wrong." },
      { step: "q_min bounds the reach. With q_min = -1 the step is at most a "
          + "50/50 blend; with q_min = -5 it travels at most six times "
          + "further than direct substitution would." },
      { step: "If the variable did not move at all between passes there is "
          + "no slope to form, so the coefficient is set to zero rather than "
          + "dividing by zero (src/solver/Wegstein.cpp:72-75)." },
      { step: "If the slope is within 1e-10 of exactly 1 the secant line is "
          + "parallel to the diagonal and meets it nowhere; the code names "
          + "that case and falls back to direct substitution too (:79-80)." },
    ],
    formula: "q = clamp( s / (s - 1),  q_min,  q_max )\n"
      + "recycle defaults:  q_min = -1,  q_max = 0",
    where: [
      { sym: "q_min", means: "the most negative coefficient allowed — the "
        + "limit on how far the extrapolation may reach" },
      { sym: "q_max", means: "the largest coefficient allowed. Zero, which "
        + "forbids stepping away from the image" },
    ],
    note: "The defaults are worth reading carefully, because there are two "
      + "of them and they are not the same number. The Wegstein CLASS "
      + "defaults to [-5, 0] (src/solver/Wegstein.H:73-74); the RECYCLE loop "
      + "constructs it with [-1, 0] "
      + "(src/unitOperations/flowsheet/Flowsheet.cpp:3328-3329). A Choupo "
      + "recycle that declares nothing therefore runs at the gentler clamp.",
  },
  {
    n: 7,
    title: "The price: n scalar secants are blind to the coupling",
    body: "Independence is what makes the method immune to units. It is also "
      + "exactly what it does not know. Each secant measures how variable i "
      + "responds to a change in variable i — but along the path the "
      + "iteration happened to take, in which every OTHER variable was "
      + "moving too. So a slope that looks like a partial derivative is "
      + "really a directional one, and the coupling contaminates it. Newton "
      + "does not have this problem because it builds the whole matrix of "
      + "cross-derivatives; that is what it is paying for.",
    derivation: [
      { step: "What Wegstein has: one number per variable, the diagonal seen "
          + "along one direction.",
        eq: "s_i  approximates  the partial derivative of g_i in x_i" },
      { step: "What Newton has: every cross-term, so a step accounts for a "
          + "change in one variable feeding back through another.",
        eq: "J = dG/dx - I,     J dx = -r" },
      { step: "And what it costs. Choupo builds that matrix by CENTRAL "
          + "finite differences: perturb one tear variable up and down and "
          + "run a complete flowsheet sweep at each. Wegstein takes one "
          + "sweep per step, whatever the size of the vector.",
        eq: "Newton: 2 (Nc + 1) sweeps per step;   Wegstein: 1" },
    ],
    formula: "J = dG/dx - I        J dx = -r",
    where: [
      { sym: "J", means: "the JACOBIAN of the tear residual — the full matrix "
        + "of how every returned variable responds to every assumed one" },
      { sym: "dG/dx", means: "the matrix of partial derivatives of the sweep: "
        + "entry (i, j) is how much returned variable i moves when assumed "
        + "variable j does. Wegstein sees only its diagonal, and only along "
        + "the path it happened to take" },
      { sym: "I", means: "the identity matrix" },
      { sym: "dx", means: "the Newton step: the correction added to the "
        + "current tear vector" },
    ],
    note: "The panel below turns the coupling directly. With the coupling "
      + "at zero the toy loop is two independent scalar problems and "
      + "Wegstein is very good at it; turn the coupling up and the "
      + "iteration count climbs while Newton, on a linear map, keeps "
      + "landing in a single step. That gap IS the price.",
  },
  {
    n: 8,
    title: "What the stopping test does, which is a different question",
    body: "The step is scale-free. The TEST is not, and the two are not the "
      + "same decision. The Wegstein branch stops when the plain Euclidean "
      + "norm of the change in the packed tear vector falls below the "
      + "declared tolerance — a flow in kmol/s, a handful of mole fractions "
      + "and a temperature in kelvin, added in quadrature with no scaling "
      + "(src/unitOperations/flowsheet/Flowsheet.cpp:3348, the norm at "
      + ":2043-2052). A temperature near 360 dominates a flow near 1e-4 by "
      + "six orders of magnitude, so a run can satisfy that test with the "
      + "temperature pinned to six digits and the recycle flow still several "
      + "percent out.",
    derivation: [
      { step: "The Wegstein branch's measure: one unscaled norm over the "
          + "mixed vector.",
        eq: "|G(x) - x|  compared with  recycleTol" },
      { step: "The Newton branch of the same function does NOT do this. It "
          + "divides each residual by a characteristic scale — the tear's "
          + "own total flow for a flow entry, the temperature itself for the "
          + "temperature entry (:3454-3467, applied at :3477).",
        eq: "r_i = ( g_i(x) - x_i ) / scale_i" },
      { step: "The engine's own comment on that scaling names what its "
          + "absence costs, in those words: the latent under-convergence the "
          + "old Wegstein default also had (:3452-3453)." },
      { step: "And for the CONVERGENCE PLOT the engine publishes neither "
          + "norm. It computes two physical residuals instead — the recycle "
          + "mass imbalance and the recycle energy imbalance, each divided "
          + "by what enters the plant — because the solver's own figure "
          + "mixes flows and temperatures into one dimensionless number "
          + "(:2057-2062). Those two are the curves you see below." },
    ],
    formula: "Wegstein test   | G(x) - x |  <  recycleTol      (no scaling)\n"
      + "Newton test     | ( G(x) - x ) / scale |  <  recycleTol",
    where: [
      { sym: "r_i", means: "entry i of the tear residual, after it has been "
        + "made dimensionless by its own scale" },
      { sym: "scale_i", means: "the characteristic size of variable i, used "
        + "to make each residual entry dimensionless before they are "
        + "compared: the tear's total flow for a flow, the temperature for "
        + "the temperature" },
    ],
    note: "This is why the two panels below can disagree about how converged "
      + "a run is while agreeing about the answer. If you change the unit "
      + "the tear is expressed in, every coefficient in the table stays "
      + "identical and the unscaled norm moves by orders of magnitude — one "
      + "of those two numbers is a property of the method and the other is a "
      + "property of the bookkeeping.",
  },
];

export const WEGSTEIN_LIMITS: readonly LessonLimit[] = [
  {
    id: "no-q-published",
    title: "The engine does not publish q, and that is why the top panel is a toy",
    body: "Wegstein::lastQ() exists and its comment says it is for logging "
      + "(src/solver/Wegstein.H:86-87), but nothing in the recycle loop "
      + "prints it. There is no run in this tree from which the per-variable "
      + "secant slope or coefficient can be read. So the coefficients you "
      + "can watch above are computed here, over a two-variable map this "
      + "page declares in full — a straight line with a coupling knob, not a "
      + "reactor. The recursion that consumes it is a line-for-line "
      + "transcription of Wegstein::step and is pinned against "
      + "hand-computable values; the map it is applied to is not a Choupo "
      + "model and no number in it came from one.",
  },
  {
    id: "linear-toy",
    title: "The toy is linear, which flatters both methods",
    body: "A real sweep G is not linear, and its secants wander as the "
      + "iteration moves. On the toy the secant is the slope exactly once "
      + "there is any history, and Newton's Jacobian is exact and constant, "
      + "so Newton lands in one step. That is the point — it makes the cost "
      + "of the missing cross-terms measurable — but do not read the "
      + "iteration counts as predictions. The engine panel below runs a real "
      + "recycle with a real reactor and flash in it and reports its own.",
  },
  {
    id: "clamp-not-driven",
    title: "The clamp is driven on the toy and not on the engine, and here is why",
    body: "recycleWegsteinQmin and recycleWegsteinQmax are real engine keys "
      + "read from the case's solverDict, but a knob on this page can only "
      + "replace a value a case already DECLARES — it cannot add a key. "
      + "Measured across the corpus on 2026-09-12: ten cases select "
      + "recycleSolver Wegstein, eight of them carry the two clamp keys "
      + "commented out, and of the two that declare them live one converges "
      + "in a single iteration and the other returns the same twelve "
      + "iterations for every clamp between 0 and -5. So the engine panel "
      + "drives the choice of solver and the tolerance instead, and the "
      + "clamp is turned where its effect on each coefficient is visible "
      + "anyway.",
  },
  {
    id: "state-not-torn",
    title: "The tear carries a flow, a composition and a temperature — and "
      + "not the rest of the stream's state",
    body: "The pack and unpack move exactly those three things "
      + "(src/unitOperations/flowsheet/Flowsheet.cpp:1988-1999 and "
      + "src/unitOperations/flowsheet/Flowsheet.cpp:2009-2050). The pressure "
      + "and the phase split are NOT torn: pressure is set by the units, and "
      + "the vapour fraction sitting on the torn stream is whatever the "
      + "previous sweep left there — the engine says so in its own words on "
      + "the Newton side, calling it the phase proxy "
      + "(src/unitOperations/flowsheet/Flowsheet.cpp:3529-3532). So the state "
      + "handed to the first consumer of a tear is an assumption about three "
      + "quantities carrying a fourth along for the ride, and only at "
      + "convergence, when the assumption and its image agree, is it a state "
      + "the whole plant agrees on. It is worth knowing which of a stream's "
      + "numbers the iteration is actually chasing.",
  },
  {
    id: "not-selection",
    title: "Nothing here chooses WHICH stream to cut",
    body: "This page is about closing a tear once it has been declared. "
      + "Choosing it is a separate decision with a separate contract: the "
      + "engine DETECTS every cycle and refuses an undeclared one, and "
      + "deliberately does not choose the cut for you. The tear-streams "
      + "EduTool is about that half.",
  },
  {
    id: "one-tear",
    title: "One tear, two variables — a plant has more of both",
    body: "The toy has a single cut with two coordinates. A real flowsheet "
      + "may declare several tears at once, and each contributes its own "
      + "flow, its own mole fractions and its own temperature to one vector: "
      + "the evaporator case in the corpus tears two streams. Nothing about "
      + "the method changes — the recursion is still one scalar problem per "
      + "entry — but the vector is longer and the unscaled norm of step 8 "
      + "has more places to hide a badly converged variable.",
  },
];
