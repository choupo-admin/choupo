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
  fastSlowLesson -- the lesson text of the `fast-and-slow` EduTool, "When the
  fast obeys the slow: separation of time scales".

  THE ARGUMENT (Vitor, 2026-11-13).  The page answers the question the sister
  page `correlation-simplicity` asks -- why are the formulas engineers design
  with so simple? -- by showing ONE of its mechanisms at work on running
  models: a fast part that has settled can be replaced by an algebraic
  relation, and what is left is a law with fewer variables and fewer
  constants, valid inside a window of the ratio of time scales.  Three case
  studies, each a full and a reduced engine run (gui/src/case/fastSlow.ts),
  then the closing section that puts the three reduced laws beside the
  correlations a student already uses.

  Every `file:line` below is held to its text by
  gui/tests/fastSlowLesson.test.ts.  No named result enters this page: the
  arithmetic of two time scales is mathematics, written out here.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

/** The opening: the puzzle, before any ratio is defined. */
export const FAST_SLOW_PUZZLE = "A plant has more fast motions than anybody could list: the "
  + "eddies in every pipe, the molecules crossing every film, the short-lived species "
  + "inside every reactor.  Yet the formulas engineers design with have two or three "
  + "variables, and they fit within a design tolerance.  A friction factor, a film "
  + "coefficient, an effectiveness factor, a rate law in the stable species alone.  Why "
  + "are they so simple?";

/** What this page adds to the sister page, in one sentence. */
export const FAST_SLOW_ADDS = "The page \"Why engineering correlations are simple\" argues "
  + "that dimensional analysis alone does not explain it and names the separation of "
  + "scales as one mechanism, shown there on a two-variable toy integrated in your "
  + "browser; this page shows that mechanism at work on running process models, with "
  + "the engine computing both sides: the full model, and the simple law left when the "
  + "fast part has settled.";

export const FAST_SLOW_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Two clocks, and the ratio that decides",
    body: "Any model with two parts that change at different speeds can be written with "
      + "the fast part's equation multiplied by a small number ε, the ratio of the fast "
      + "time scale to the slow one.  When ε is small the fast variable y reaches, long "
      + "before x has moved, the value its own equation allows for the current x: the "
      + "right-hand side g is then zero.  That condition is algebraic, not differential, "
      + "so y stops being integrated and becomes a function of x.  The reduced model "
      + "keeps only the slow equation.  It is not exact: the fast part takes a time of "
      + "order ε to settle, and the answer lags by about that much.  So the error of "
      + "the reduction falls with ε, and the question for each model is how small ε "
      + "has to be for the error to stay inside your tolerance.  The three case studies "
      + "below measure that, each with the engine running both models.",
    formula: String.raw`\begin{aligned} \frac{\mathrm{d}x}{\mathrm{d}t} &= f(x, y) \\ \varepsilon\,\frac{\mathrm{d}y}{\mathrm{d}t} &= g(x, y) \;\xrightarrow{\;\varepsilon \to 0\;}\; g(x, y) = 0 \end{aligned}`,
    where: [
      { sym: "x", means: "the slow variable (the master)" },
      { sym: "y", means: "the fast variable, which will obey it" },
      { sym: "t", means: "time, here measured on the slow clock", unit: "s" },
      { sym: "\\mathrm{d}x/\\mathrm{d}t", means: "the rate of change of the slow variable" },
      { sym: "\\mathrm{d}x", means: "a small change of x" },
      { sym: "\\mathrm{d}y", means: "a small change of y" },
      { sym: "\\mathrm{d}t", means: "a small interval of time", unit: "s" },
      { sym: "f", means: "the slow equation's right-hand side" },
      { sym: "g", means: "the fast equation's right-hand side" },
      { sym: "f(x, y)", means: "f at the current x and y" },
      { sym: "g(x, y)", means: "g at the current x and y" },
      { sym: "\\varepsilon", means: "the ratio of the fast time scale to the slow one" },
    ],
    note: "This page writes the reduced model of each case as a case the engine runs, "
      + "never as a formula the page evaluates: the engine computes both sides, and the "
      + "page subtracts one curve from the other.",
  },
  {
    n: 2,
    title: "Case 1: a small tank behind a big one",
    body: "A feed of 1 mol/s runs through a big mixing tank holding 1000 mol and then a "
      + "small one holding 50 mol.  Both start full of A; from t = 0 the feed is the "
      + "tracer B.  Each tank's time constant is what it holds over what flows through "
      + "it: \\(\\tau_s\\) = 1000 s for the big one, \\(\\tau_f\\) = 50 s for the small one, so ε = 0.05.  "
      + "The small tank's content follows whatever leaves the big one, about \\(\\tau_f\\) late.  "
      + "Replace it by its quasi-steady relation and its outlet is its inlet: a tank "
      + "with nothing in it that accumulates.  The engine does exactly that when a "
      + "steady unit is wrapped as `quasiSteady` and re-solved at every instant on what "
      + "its neighbour publishes.  The full model is "
      + "tutorials/unsteady/unsteady07_fast_tank_full, two `dynamicCSTR` vessels; the "
      + "reduced one is unsteady08_fast_tank_reduced, where the small tank is a "
      + "`storageTank` (outlet = inlet) wrapped as `quasiSteady`.",
    derivation: [
      { step: "A tracer balance on each well-mixed tank of constant holdup:",
        eq: String.raw`\begin{aligned} \tau_s\,\frac{\mathrm{d}x_s}{\mathrm{d}t} &= x_\mathrm{in} - x_s \\ \tau_f\,\frac{\mathrm{d}x_f}{\mathrm{d}t} &= x_s - x_f \end{aligned}` },
      { step: "Divide the second by the big tank's time constant: it is the fast equation of step 1, with ε the ratio of the two time constants.  "
          + "Setting ε to zero leaves an algebraic relation:",
        eq: String.raw`\begin{aligned} \varepsilon\,\tau_s\,\frac{\mathrm{d}x_f}{\mathrm{d}t} &= x_s - x_f \\ &\xrightarrow{\;\varepsilon \to 0\;}\; x_f = x_s \end{aligned}` },
      { step: "For a step in the feed, both solutions are known in closed form, and their "
          + "difference is the lag the reduction drops:",
        eq: String.raw`\begin{aligned} x_f - x_s^\mathrm{red} = &\frac{\tau_f\,\exp(-t/\tau_s)}{\tau_s - \tau_f} \\ - &\frac{\tau_f\,\exp(-t/\tau_f)}{\tau_s - \tau_f} \end{aligned}` },
      { step: "Its largest value, over all t, depends on ε alone:",
        eq: String.raw`\max_t\,\lvert x_f - x_s^\mathrm{red}\rvert = \varepsilon^{1/(1-\varepsilon)} \approx \varepsilon` },
    ],
    formula: String.raw`\varepsilon = \frac{\tau_f}{\tau_s}, \qquad \tau = \frac{n}{F}`,
    where: [
      { sym: "\\tau_s", means: "time constant of the big (slow) tank", unit: "s" },
      { sym: "\\tau_f", means: "time constant of the small (fast) tank", unit: "s" },
      { sym: "\\tau", means: "a tank's time constant", unit: "s" },
      { sym: "n", means: "what the tank holds", unit: "kmol" },
      { sym: "F", means: "the flow through it", unit: "kmol/s" },
      { sym: "x_s", means: "tracer mole fraction in the big tank, and leaving it" },
      { sym: "x_f", means: "tracer mole fraction in the small tank, and leaving the plant" },
      { sym: "x_\\mathrm{in}", means: "tracer mole fraction of the feed (1 after t = 0)" },
      { sym: "x_s^\\mathrm{red}", means: "the reduced model's answer for what leaves the plant, the big tank's outlet" },
      { sym: "\\exp", means: "the exponential function" },
      { sym: "\\max_t", means: "the largest value over all times" },
      { sym: "\\mathrm{d}x_s", means: "a small change of the big tank's fraction" },
      { sym: "\\mathrm{d}x_f", means: "a small change of the small tank's fraction" },
    ],
    note: "The closed form is drawn as a check over the engine's two runs, never in "
      + "place of them.",
  },
  {
    n: 3,
    title: "Case 2: a fast equilibrium feeding a slow step",
    body: "In a closed vessel A turns into B and B back into A, both fast, while B turns "
      + "slowly into C.  The full model integrates all three rates "
      + "(tutorials/batch/reactor/batch30_fast_equilibrium_full: \\(k_f\\) = 0.1 1/s, "
      + "\\(k_r\\) = 0.025 1/s, \\(k\\) = 0.001 1/s).  After a short first moment A and B are at "
      + "equilibrium with each other, \\(n_B = K n_A\\), and only their sum moves: the pair "
      + "behaves as one pool that drains into C at the rate of the B it contains.  The "
      + "reduced model (batch31_fast_equilibrium_reduced) runs that one law, written in "
      + "the case as an `expression` rate law with two parameters, k and K.  The fast "
      + "rate constants do not appear at all.",
    derivation: [
      { step: "The three first-order rates:",
        eq: String.raw`\begin{aligned} \frac{\mathrm{d}n_A}{\mathrm{d}t} &= -k_f n_A + k_r n_B \\ \frac{\mathrm{d}n_B}{\mathrm{d}t} &= k_f n_A - k_r n_B - k\,n_B \end{aligned}` },
      { step: "When the two fast rate constants are large against the slow one, the fast pair sets its own ratio:",
        eq: String.raw`\begin{aligned} k_f n_A &= k_r n_B \\ \Rightarrow\; n_B &= K n_A, \quad K = \frac{k_f}{k_r} \end{aligned}` },
      { step: "Add the two balances: the fast terms cancel, and the pool decays with one "
          + "lumped rate constant:",
        eq: String.raw`\begin{aligned} \frac{\mathrm{d}P}{\mathrm{d}t} &= -k\,n_B = -\frac{k\,K}{1 + K}\,P \\ P &= n_A + n_B \end{aligned}` },
    ],
    formula: String.raw`\varepsilon = \frac{k}{k_f}, \quad r = \frac{k\,K}{1+K}\,c_P`,
    where: [
      { sym: "n_A", means: "amount of A in the vessel", unit: "kmol" },
      { sym: "n_B", means: "amount of B", unit: "kmol" },
      { sym: "\\mathrm{d}n_A", means: "a small change of the amount of A", unit: "kmol" },
      { sym: "\\mathrm{d}n_B", means: "a small change of the amount of B", unit: "kmol" },
      { sym: "k_f", means: "rate constant of A to B (fast)", unit: "1/s" },
      { sym: "k_r", means: "rate constant of B to A (fast)", unit: "1/s" },
      { sym: "k", means: "rate constant of B to C (slow)", unit: "1/s" },
      { sym: "K", means: "equilibrium constant of the fast pair, the forward over the reverse rate constant" },
      { sym: "P", means: "the pool, A and B together", unit: "kmol" },
      { sym: "\\mathrm{d}P", means: "a small change of the pool", unit: "kmol" },
      { sym: "r", means: "the reduced rate law, the rate at which C is made per volume", unit: "kmol/(m³ s)" },
      { sym: "c_P", means: "concentration of the pool, P over the vessel volume", unit: "kmol/m³" },
    ],
    note: "The equilibrium constant is held at 4 while the slider moves \\(k_f\\) and \\(k_r\\) "
      + "together, so the reduced answer never moves: only the full model learns how "
      + "fast the pair is.",
  },
  {
    n: 4,
    title: "Case 3: an intermediate that never accumulates",
    body: "A turns into an intermediate I, and I into the product P.  If I is used up "
      + "much faster than it is made, it never piles up: after a short first moment its "
      + "two rates balance and its amount is whatever makes them equal, small and "
      + "following A.  Then P is made as fast as A is consumed, and the rate law needs "
      + "only the stable species.  The full model "
      + "(tutorials/batch/reactor/batch32_fast_intermediate_full: \\(k_1\\) = 0.001 1/s, "
      + "\\(k_2\\) = 0.1 1/s) integrates both steps; the reduced one "
      + "(batch33_fast_intermediate_reduced) runs A to P at \\(k_1 c_A\\), written in the case "
      + "as an `expression` law.  In a closed vessel the P the reduced model is ahead "
      + "by is exactly the I in transit.",
    derivation: [
      { step: "The two first-order steps:",
        eq: String.raw`\begin{aligned} \frac{\mathrm{d}n_A}{\mathrm{d}t} &= -k_1 n_A \\ \frac{\mathrm{d}n_I}{\mathrm{d}t} &= k_1 n_A - k_2 n_I \\ \frac{\mathrm{d}n_P}{\mathrm{d}t} &= k_2 n_I \end{aligned}` },
      { step: "Divide the intermediate's balance by the fast rate constant: its left side "
          + "carries the small number slow over fast.  Setting it to zero:",
        eq: String.raw`\begin{aligned} n_I &= \frac{k_1}{k_2}\,n_A \\ \Rightarrow\; \frac{\mathrm{d}n_P}{\mathrm{d}t} &= k_1 n_A \end{aligned}` },
    ],
    formula: String.raw`\varepsilon = \frac{k_1}{k_2}, \qquad r = k_1\,c_A`,
    where: [
      { sym: "n_I", means: "amount of the intermediate", unit: "kmol" },
      { sym: "n_P", means: "amount of the product", unit: "kmol" },
      { sym: "\\mathrm{d}n_I", means: "a small change of the amount of I", unit: "kmol" },
      { sym: "\\mathrm{d}n_P", means: "a small change of the amount of P", unit: "kmol" },
      { sym: "k_1", means: "rate constant of A to I (slow)", unit: "1/s" },
      { sym: "k_2", means: "rate constant of I to P (fast)", unit: "1/s" },
      { sym: "c_A", means: "concentration of A", unit: "kmol/m³" },
    ],
    note: "This is the same pair of equations as the two tanks, with \\(k_1\\) in place of "
      + "\\(1/\\tau_s\\) and \\(k_2\\) in place of \\(1/\\tau_f\\).  The closed form of case 1 is its closed form "
      + "too, and the engine's two cases give the same numbers at the same ε.",
  },
  {
    n: 5,
    title: "So this is why correlations are simple",
    body: "Look at what each reduction left.  The two tanks became one tank and one time "
      + "constant.  The fast equilibrium became one pool and one lumped rate constant, "
      + "\\(kK/(1+K)\\), with the fast rate constants gone.  The intermediate became a rate "
      + "law in the stable species alone, with \\(k_2\\) gone.  Each is fewer variables, an "
      + "algebraic relation in place of a differential equation, and a valid range: "
      + "a window of the ratio of time scales, which the slider showed you at your "
      + "tolerance.  That is what an engineering correlation is.  It is simple because "
      + "something fast was assumed to have settled, and it fails where that stops being "
      + "true.",
    formula: String.raw`\begin{aligned} \varepsilon\,\frac{\mathrm{d}y}{\mathrm{d}t} &= g(x, y) \\ &\longrightarrow\; g(x, y) = 0 \\ &\longrightarrow\; \text{a law in } x \text{ alone} \end{aligned}`,
    where: [],
    note: "The table below puts the three reduced laws beside correlations you already "
      + "use, and names, for each, what was assumed to have settled and where it is in "
      + "Choupo.",
  },
];

/** The closing table: a simple law, what was slaved to obtain it, where it is
 *  in Choupo, and its price.  Text only; every engine claim cites file:line. */
export interface SimpleLaw {
  law: string;
  slaved: string;
  where: string;
  price: string;
  tool?: "thiele" | "correlation-simplicity";
}
export const SIMPLE_LAWS: readonly SimpleLaw[] = [
  {
    law: "Case 1: one tank and one time constant",
    slaved: "The small tank's content, settled on what leaves the big one.",
    where: "This page, unsteady07 and unsteady08.",
    price: "The lag of the small tank is lost; the window is the \\(\\varepsilon\\) your tolerance allows.",
  },
  {
    law: "Case 2: one pool and the lumped rate constant \\(kK/(1+K)\\)",
    slaved: "The ratio of A to B, settled at its equilibrium.",
    where: "This page, batch30 and batch31.",
    price: "The first moment, while B forms, is lost; nothing about the fast pair's speed can be learned from the reduced law.",
  },
  {
    law: "Case 3: a rate law in the stable species alone, \\(k_1 c_A\\)",
    slaved: "The intermediate, settled where its two rates balance.",
    where: "This page, batch32 and batch33.",
    price: "The intermediate in transit is lost; \\(k_2\\) cannot be fitted from the product curve.",
  },
  {
    law: "The effectiveness factor of a catalyst pellet",
    slaved: "The concentration profile inside the pellet, settled at every instant on the "
      + "concentration outside it: diffusion and reaction inside are fast against the "
      + "changes of the bulk.",
    where: "The pellet page solves that steady profile and reads the effectiveness factor off it.",
    price: "It holds while the pellet's own time to settle is short against the bed's; a "
      + "pellet that has not settled is not described by one number.",
    tool: "thiele",
  },
  {
    law: "A film coefficient or a friction factor",
    slaved: "The thin layer next to a wall, settled point by point on the main flow "
      + "outside it.",
    where: "The sister page derives the laminar flat-plate law from that idea and shows "
      + "where turbulence has no clean gap.",
    price: "It holds in the regime it was derived or fitted for; across the laminar to "
      + "turbulent transition the layer no longer obeys one outer number.",
    tool: "correlation-simplicity",
  },
  {
    law: "A membrane module solved as steady inside a tank's start-up",
    slaved: "The module, which holds almost no liquid, settled at every instant on the "
      + "tank it is fed from.",
    where: "tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup wraps the module as "
      + "quasiSteady; the engine announces such a unit as solved at the SAME INSTANT as "
      + "its inlet (DynamicDriver.cpp:778).",
    price: "Nothing accumulates in the module, so the transient has the tank's time "
      + "constant alone; a module with real holdup would need its own.",
  },
  {
    law: "No law at all: a loop with no vessel on it",
    slaved: "Everything: every unit on the loop has been made quasi-steady.",
    where: "The engine refuses to integrate it (DynamicDriver.cpp:820-823): \"form a "
      + "loop in which NO unit holds an inventory (all quasiSteady) -- such a loop has "
      + "no time constant and is a steady recycle.  Put a vessel (e.g. dynamicCSTR) on "
      + "the loop, or solve it with choupoSolve's tear machinery.\"",
    price: "With every fast part settled there is no slow part left to integrate: the "
      + "reduction has eaten the whole model, and what remains is a steady problem.",
  },
];

/** The sentence on validity windows, with its citation into the engine. */
export const WINDOW_SENTENCE = "This is why a correlation in the engine is an object "
  + "with a validity window and a citation, not a bare formula: the friction factor "
  + "correlations each publish \"the window its OWN authors stated\" "
  + "(FrictionFactorCorrelation.H:128) and their primary citation "
  + "(FrictionFactorCorrelation.H:133).  The window is where the fast part that was "
  + "slaved has settled; outside it the simple law has lost the assumption that made "
  + "it simple.";

export const FAST_SLOW_LIMITS: readonly LessonLimit[] = [
  {
    id: "linear",
    title: "Linear, first-order models.",
    body: "All three case studies are linear and first order, which is why the closed "
      + "form fits two of them exactly.  In a nonlinear model the reduction can fail in "
      + "other ways (several roots of the fast relation, or none), which these cases "
      + "cannot show.",
  },
  {
    id: "synthetic",
    title: "Synthetic species, author-set numbers.",
    body: "A, B and C are the corpus's synthetic stand-ins and every rate constant and "
      + "holdup is chosen for the lesson; no number on the page is a measurement.  The "
      + "reactors are isothermal, so no heat of reaction is needed and none is used.",
  },
  {
    id: "consistent-start",
    title: "Where the start is on the slow path, and where it is not.",
    body: "The two tanks start where the reduced model starts (both full of A), so case "
      + "1's gap is the lag alone.  The reactors start with A only, off the relation "
      + "the reduction assumes (no B, no I), so their gap includes the first moment "
      + "while the fast part settles.",
  },
  {
    id: "cost",
    title: "What the cost counts.",
    body: "For the two reactors the cost is the number of steps the adaptive "
      + "Rosenbrock23 integrator accepted, counted from the step history the engine "
      + "prints; it includes at least one step per written instant.  The tank case runs "
      + "a fixed RK4 step, and the time-integrated driver publishes no count: both of its "
      + "runs take the same declared number of steps.  The explicit-step bound beside "
      + "them is arithmetic on the fastest rate constant, not a run.",
  },
  {
    id: "browser",
    title: "Runs in your browser.",
    body: "Every curve is the engine compiled to run in the browser, on the six "
      + "tutorial cases with one declared number changed.",
  },
];
