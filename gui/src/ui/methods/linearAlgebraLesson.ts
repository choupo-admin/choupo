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
  The "Linear algebra without the pain" lesson, as DATA (DEV.md 4c C463), so
  every number it prints is recomputed by tests/linearAlgebraLesson.test.ts
  against linearAlgebraMath -- a page must not teach against its own code.

  WHY IT EXISTS.  Vitor read Shewchuk's "An Introduction to the Conjugate
  Gradient Method Without the Agonizing Pain" (1994) and still felt the pain,
  and never saw why LU is there at all.  The page is built the other way
  round: it starts from the one place a student MEETS linear algebra in
  Choupo -- every Newton step solves J dx = -F -- and answers, in order, the
  question each next idea exists to answer: why solve at all; how to solve
  (elimination) and why keep the receipt (LU); what goes wrong (a tiny pivot,
  a wobbly table); what is free (structure); and only then the bowl and the
  conjugate gradient.  EVERY HARD IDEA IS A PICTURE FIRST, then the symbol,
  then where Choupo uses it.

  THE HONESTY SPINE.  The matrices are 2x2 and 3x3 toys declared in
  linearAlgebraMath; nothing on the page is a Choupo run.  What is Choupo's
  is the CITATIONS (file and line, each held by a claim in
  tests/linearAlgebraLesson.test.ts) and the structure they describe.  The
  page says plainly what Choupo does NOT do: it has no conjugate-gradient
  solver, and its LU also equilibrates the matrix, which the toy does not.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
import {
  BOWL3, BOWL3_G, EX_A, EX_B, bowlOf, blockThomas, cond2, conjugateGradient,
  denseWork, pivotDemo, sampleBands, steepestDescent, wobbleMatrix, workCounts,
} from "./linearAlgebraMath.js";

// ---- The numbers the prose prints, computed once from the one home. --------

export const W1000 = workCounts(1000);
export const PIVOT_EPS = 1e-7;
export const PIVOT_DIGITS = 6;
export const PIVOT_BAD = pivotDemo(PIVOT_EPS, PIVOT_DIGITS, false);
export const PIVOT_GOOD = pivotDemo(PIVOT_EPS, PIVOT_DIGITS, true);
export const WOBBLE_T = 0.001;
export const WOBBLE_COND = cond2(wobbleMatrix(WOBBLE_T));
export const STRUCT_N = 50;
export const STRUCT_NV = 4;
export const STRUCT_BLOCK = blockThomas(
  sampleBands(STRUCT_N, STRUCT_NV), new Array(STRUCT_N * STRUCT_NV).fill(1)).work;
export const STRUCT_DENSE = denseWork(STRUCT_N * STRUCT_NV);
export const SD_KAPPA = 10;
export const SD_THETA = 0.5;
export const SD_START = [4, 1];
export const SD_STEPS = steepestDescent(
  bowlOf(SD_KAPPA, SD_THETA), [0, 0], SD_START, 5000, 1e-8).length - 1;
export const CG_STEPS = conjugateGradient(
  bowlOf(SD_KAPPA, SD_THETA), [0, 0], SD_START, 10, 1e-8).path.length - 1;
export const CG3_STEPS = conjugateGradient(BOWL3, BOWL3_G, [0, 0, 0], 10, 1e-10).path.length - 1;
export const EX_SIZE = EX_A.length;
export const EX_RHS = EX_B.join(", ");

const e1 = (x: number): string => x.toExponential(1).replace("e+", "e");

/** Which static diagrams each step shows, BEFORE its figure and symbols
 *  (LinearAlgebraDiagrams.tsx draws them; the test holds the two together).
 *  "map" belongs to the introduction, not to a step. */
export const LA_STEP_DIAGRAMS: Readonly<Record<number, readonly string[]>> = {
  1: ["ruler"],
  2: ["elimination", "costBlocks"],
  3: ["digits"],
  4: ["nearParallel"],
  5: ["band"],
  6: ["positiveMeans", "shapes"],
  7: ["fan", "vocabulary"],
  8: ["zigzag"],
};
export const LA_INTRO_DIAGRAMS: readonly string[] = ["map"];

export const LA_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Why a linear solve at all: every Newton step is one",
    body: "Picture two curves on a sheet of paper, and a point on the sheet "
      + "that is NOT where they cross. You want the crossing, and you cannot "
      + "see it. What you can do is lay a ruler along each curve at your "
      + "point (its tangent) and find where the two rulers cross. Two "
      + "straight lines crossing is easy; that crossing is your next guess, "
      + "usually much closer. Do it again. That is Newton's method, and "
      + "finding where the rulers cross IS solving a linear system. Every "
      + "unit and every recycle in Choupo that is solved by Newton does it: "
      + "the step is the solution of J dx = -F, where F is how far each "
      + "equation is from holding (src/solver/NewtonND.cpp:672 builds the "
      + "right-hand side -F), J says how each equation changes when each "
      + "unknown moves, and dx is the move. The engine hands both to a "
      + "dense solver (src/solver/NewtonND.cpp:771), which is the thing the "
      + "rest of this page opens up. Drag the point in the first figure: "
      + "when it sits where the two curves have the same slope, the rulers "
      + "are parallel and there is no crossing, which is what a singular "
      + "Jacobian is.",
    derivation: [
      { step: "Replace each equation by its straight-line approximation at "
          + "the current guess (the first two terms of its Taylor series; "
          + "Biegler, Grossmann and Westerberg Eq. 8.18).",
        eq: String.raw`F(x + \Delta x) \approx F(x) + J\,\Delta x` },
      { step: "Ask the lines to cross at zero: the move that makes the "
          + "approximation vanish is the solution of one linear system "
          + "(the same book's Eqs. 8.20 and 8.21).",
        eq: String.raw`J\,\Delta x = -F` },
    ],
    formula: String.raw`J\,\Delta x = -F \qquad x_{\mathrm{new}} = x + \Delta x`,
    where: [
      { sym: "x", means: "the unknowns of the problem, one number per unknown (stream flows, temperatures, extents)" },
      { sym: "F", means: "the residuals: one number per equation, how far that equation is from being true at x" },
      { sym: "J", means: "the Jacobian: a table whose entry in row i, column j is how much equation i changes per unit change of unknown j" },
      { sym: "\\Delta x", means: "the Newton step: the move the straight-line approximation says lands on the answer" },
      { sym: "x_{\\mathrm{new}}", means: "the next guess" },
    ],
    note: "The textbook for this step is Biegler, Grossmann and Westerberg, "
      + "Systematic Methods of Chemical Process Design (1997), pp. 255-256, "
      + "where the Newton-Raphson algorithm is stated and the Jacobian is "
      + "defined. The page's inspiration for the later steps is Shewchuk, "
      + "\"An Introduction to the Conjugate Gradient Method Without the "
      + "Agonizing Pain\" (1994); no number on this page is taken from it.",
  },
  {
    n: 2,
    title: "Elimination by hand, and LU as its receipt",
    body: "You solved two equations in two unknowns at school: use the first "
      + "equation to remove the first unknown from the second, then read "
      + "off the last unknown, then work back up. That is Gaussian "
      + "elimination, and it works for any number of equations: sweep down, "
      + "subtracting a multiple of each row from the rows below, until what "
      + "is left is a staircase you can climb back up. Now notice the one "
      + "thing the school method throws away: the multiples. LU is nothing "
      + "more than KEEPING them. Write the staircase as U, and the "
      + "multiples, in the spots where the zeros appeared, as L; then "
      + "L times U gives the original table back. It is the receipt of the "
      + "elimination. Why keep it? Because the expensive part was the "
      + "sweep, and the sweep depended only on the table, not on the "
      + "right-hand side. With the receipt in hand a NEW right-hand side "
      + "costs only a pass down L and a pass up U. For a table of n "
      + "equations the sweep costs about n\u00b3/3 operations and each reuse "
      + "n\u00b2; for n = 1000 that is " + e1(W1000.factor) + " against "
      + e1(W1000.solve) + ", a factor of " + Math.round(W1000.factor / W1000.solve)
      + ". Choupo's stiff integrator uses exactly this: it factors its "
      + "iteration matrix once per step (src/solver/ODE/Rosenbrock23.cpp:765) "
      + "and back-solves it for several right-hand sides "
      + "(src/solver/ODE/Rosenbrock23.cpp:855). The engine's Newton uses the "
      + "same two routines through gaussSolve (src/solver/NewtonND.cpp:461), "
      + "and its multipliers are stored where the zeros would be "
      + "(src/solver/LU.cpp:110-111).",
    derivation: [
      { step: "One row operation: subtract m times the pivot row from a row "
          + "below it, with m chosen to make the entry under the pivot zero. "
          + "Keep m.",
        eq: String.raw`m = \frac{a_{ik}}{a_{kk}}, \qquad \text{row}_i \leftarrow \text{row}_i - m\,\text{row}_k` },
      { step: "Every multiplier sits where its zero appeared: the kept "
          + "multipliers are L (with ones on its diagonal), the staircase is U.",
        eq: String.raw`A = L\,U` },
      { step: "To solve for any right-hand side, go down L and then up U: "
          + "two cheap passes.",
        eq: String.raw`L\,y = b, \qquad U\,x = y` },
    ],
    formula: String.raw`A = L\,U, \qquad L\,y = b, \qquad U\,x = y`,
    where: [
      { sym: "A", means: "the table of coefficients (here the Jacobian J of the previous step)" },
      { sym: "L", means: "the receipt: the multipliers kept from the elimination, below a diagonal of ones" },
      { sym: "U", means: "the staircase the elimination ends with: zeros below the diagonal" },
      { sym: "b", means: "the right-hand side: here -F" },
      { sym: "y", means: "a helper vector: the right-hand side after the elimination has been applied to it" },
      { sym: "x", means: "the unknowns being solved for (in the step above, the move)" },
      { sym: "m", means: "a multiplier: how many times the pivot row is subtracted from the row below" },
      { sym: "a_{ik}", means: "the entry of A in row i, column k" },
      { sym: "a_{kk}", means: "the pivot: the entry on the diagonal that the row operation divides by" },
    ],
    note: "The example's table is " + JSON.stringify(EX_A) + ", with "
      + "right-hand side " + EX_RHS + "; it is a textbook choice whose "
      + "multipliers are whole numbers. The toy keeps the idea only: the "
      + "engine's LU also scales the table before it judges a pivot and "
      + "refuses a pivot that is zero to working precision "
      + "(src/solver/LU.cpp:99).",
  },
  {
    n: 3,
    title: "Pivoting: do not divide by a tiny number",
    body: "Imagine a calculator that keeps only " + PIVOT_DIGITS + " "
      + "significant digits. Take the pair of equations \u03b5 x\u2081 + x\u2082 = 1 "
      + "and x\u2081 + x\u2082 = 2 with \u03b5 = " + PIVOT_EPS.toExponential(0)
      + ". Eliminate in the order they are written and the multiplier is "
      + "1/\u03b5 = ten million. Subtract ten million times the first row from "
      + "the second and the little numbers (the 1 and the 2) are swallowed "
      + "whole by the ten million: the calculator cannot hold the 1 next "
      + "to 10\u2077 in six digits. The answer for x\u2081 comes out as "
      + PIVOT_BAD.x1 + "; the truth is very nearly 1. Swap the two rows "
      + "first, so that you divide by the big number 1 instead of the tiny "
      + "\u03b5, and every number stays modest: both answers come out right "
      + "(x\u2081 = " + PIVOT_GOOD.x1 + "). The row swap is pivoting, and the rule is "
      + "to pick, in each column, the entry of largest size at or below the "
      + "diagonal (src/solver/LU.cpp:71) and swap it into place "
      + "(src/solver/LU.cpp:103). A multiplier larger than one is the "
      + "alarm: it magnifies every rounding error already in the row. "
      + "Real computers keep about sixteen digits, not six, so the "
      + "failure needs a smaller \u03b5, but it is the same failure.",
    derivation: [
      { step: "Without the swap, the multiplier is the reciprocal of the "
          + "small number, and the second row becomes enormous.",
        eq: String.raw`m = \frac{1}{\varepsilon}, \qquad u_{22} = 1 - \frac{1}{\varepsilon}` },
      { step: "With the swap, the multiplier is small and the second row "
          + "stays modest.",
        eq: String.raw`m = \varepsilon, \qquad u_{22} = 1 - \varepsilon` },
    ],
    formula: String.raw`\varepsilon\,x_1 + x_2 = 1, \qquad x_1 + x_2 = 2`,
    where: [
      { sym: "\\varepsilon", means: "a small number on the diagonal: the pivot you would be forced to divide by if you did not swap" },
      { sym: "x_1", means: "the first unknown (true value 1/(1 - \u03b5), very nearly 1)" },
      { sym: "x_2", means: "the second unknown (true value (1 - 2\u03b5)/(1 - \u03b5), very nearly 1)" },
      { sym: "m", means: "the multiplier of the elimination, as in the previous step" },
      { sym: "u_{22}", means: "the second pivot: the entry of U in row 2, column 2, that the last division uses" },
    ],
    note: "Partial pivoting is not a cure for everything: it keeps the "
      + "multipliers from growing, but it cannot rescue a table that is "
      + "itself nearly singular. That is the next step.",
  },
  {
    n: 4,
    title: "Conditioning: the wobbly table",
    body: "Put a table on three legs and it is stable; put it on four legs "
      + "of which two are almost the same leg and it rocks. Two equations "
      + "are two lines on a sheet, and their solution is the point where "
      + "they cross. If the lines cross at a good angle, nudging one line "
      + "moves the crossing a little. If they are nearly parallel, the same "
      + "nudge slides the crossing a long way. Drag the crossing in the "
      + "figure and watch. The number that says how wobbly the table is is "
      + "the condition number: the largest factor by which a small "
      + "relative change in the right-hand side can be magnified in the "
      + "answer. For the two lines x\u2081 + x\u2082 = b\u2081 and "
      + "x\u2081 + (1 + t) x\u2082 = b\u2082 with t = " + WOBBLE_T
      + ", the condition number is about " + Math.round(WOBBLE_COND)
      + ": a change of one part in a thousand in b\u2082 moves the answer by "
      + "its own full size. No algorithm can undo this, because the "
      + "wobble is in the problem, not in the method; it is why a process "
      + "model whose equations nearly repeat each other (two almost "
      + "identical balances) is hard to converge, and why Choupo's LU refuses "
      + "a pivot that is zero to working precision rather than dividing by "
      + "it (src/solver/LU.cpp:99). A useful rule of thumb: you lose about "
      + "log\u2081\u2080 of the condition number in digits.",
    derivation: [
      { step: "Change the right-hand side by a small amount and ask how "
          + "much the answer moves.",
        eq: String.raw`A\,(x + \delta x) = b + \delta b \;\Rightarrow\; \delta x = A^{-1}\,\delta b` },
      { step: "Compare the relative changes: the worst ratio is the "
          + "condition number, the product of how much A can stretch a "
          + "vector and how much its inverse can.",
        eq: String.raw`\frac{\lVert \delta x \rVert}{\lVert x \rVert} \le \kappa\,\frac{\lVert \delta b \rVert}{\lVert b \rVert}, \qquad \kappa = \lVert A \rVert\,\lVert A^{-1} \rVert` },
    ],
    formula: String.raw`\frac{\lVert \delta x \rVert}{\lVert x \rVert} \le \kappa\,\frac{\lVert \delta b \rVert}{\lVert b \rVert}`,
    where: [
      { sym: "\\delta x", means: "a change in the answer" },
      { sym: "\\delta b", means: "a small change (a measurement error, a rounding) in the right-hand side" },
      { sym: "\\lVert \\cdot \\rVert", means: "the length of a vector (the usual square root of the sum of squares)" },
      { sym: "\\kappa", means: "the condition number of A: 1 is the best possible (the lines cross at a right angle), and it grows without bound as the lines approach parallel" },
      { sym: "A^{-1}", means: "the inverse of A: the table that undoes A. It is never formed in practice; it is a way of saying what the solve does" },
    ],
    note: "The condition number here is the usual two-norm one; the page's "
      + "toy is the pair of lines above, for which the answer moves by "
      + "exactly \u03b4b\u2082/t in each unknown, in opposite directions.",
  },
  {
    n: 5,
    title: "Structure: why a column's Jacobian is cheap",
    body: "A distillation column is a stack of trays. A tray exchanges "
      + "material and heat with the tray above and the tray below and with "
      + "nothing else, so its equations contain the unknowns of three "
      + "trays at most. Write the Jacobian with each tray's unknowns "
      + "together and nearly the whole table is zeros; the only non-zero "
      + "blocks lie on the diagonal and the two diagonals beside it. That "
      + "shape is block-tridiagonal. You do not need to sweep through all "
      + "the zeros: eliminate tray by tray, down the stack and back, which "
      + "is the school method with small tables in place of numbers "
      + "(block-Thomas). The work grows in proportion to the number of "
      + "trays N instead of its cube: the engine's own header states it as "
      + "O(N nv\u00b3) against O((N nv)\u00b3) for a dense solve "
      + "(src/solver/BlockTridiagonal.H:46), where nv is the number of "
      + "unknowns per tray. For " + STRUCT_N + " trays of " + STRUCT_NV
      + " unknowns the page's own count is " + e1(STRUCT_BLOCK) + " operations "
      + "against " + e1(STRUCT_DENSE) + ", about " + Math.round(STRUCT_DENSE / STRUCT_BLOCK)
      + " times fewer. The Newton step of a column takes this road when "
      + "the case declares the structure, and the solver checks the "
      + "declaration is true before trusting it "
      + "(src/solver/NewtonND.cpp:756).",
    derivation: [
      { step: "Dense elimination touches every entry below every pivot: "
          + "the work is the cube of the number of unknowns.",
        eq: String.raw`W_{\mathrm{dense}} \approx \tfrac{1}{3}\,(N\,n_v)^3` },
      { step: "Block elimination only ever touches the neighbours: one "
          + "small dense factorisation per block, repeated N times.",
        eq: String.raw`W_{\mathrm{block}} \propto N\,n_v^3` },
    ],
    formula: String.raw`W_{\mathrm{dense}} \approx \tfrac{1}{3}\,(N\,n_v)^3 \qquad W_{\mathrm{block}} \propto N\,n_v^3`,
    where: [
      { sym: "W_{\\mathrm{dense}}", means: "the work (count of multiply-adds) of a dense solve of the whole table" },
      { sym: "W_{\\mathrm{block}}", means: "the work of the block-tridiagonal solve of the same table" },
      { sym: "N", means: "the number of blocks: trays in a column, cells in a finite-volume grid" },
      { sym: "n_v", means: "the number of unknowns per block: the size of each small table" },
    ],
    note: "The sparsity is only free if the structure is TRUE. Choupo's "
      + "block solve also has no pivoting across blocks, which is its "
      + "stated limit (src/solver/BlockTridiagonal.H:49-51); inside each "
      + "block it pivots exactly as the dense routine does.",
  },
  {
    n: 6,
    title: "The bowl: a matrix that has one bottom",
    body: "First, what 'positive' means. It is about a NUMBER, not about "
      + "the entries of the table: take a small step x away from a point "
      + "and the function rises by about half of x'Ax. Positive definite "
      + "means that number is positive for every direction x. A table with "
      + "every entry positive can fail (the first table of the first "
      + "figure rises or falls depending on the direction) and a table "
      + "with negative entries can pass (the second never falls). Now to "
      + "the question this step is for. "
      + "So far the table was any table. Now ask a different question: "
      + "you do not want where two lines cross, you want the lowest point "
      + "of a landscape. Near its lowest point a smooth landscape looks "
      + "like a quadratic: a bowl, a ridge, a saddle or a dome, decided by "
      + "one symmetric table A. If A is positive definite the landscape "
      + "is a bowl: one bottom, every direction goes up, and the bottom is "
      + "where A x = g. If A has a flat direction it is a ridge, a whole "
      + "line of bottoms or none; if it curves up one way and down the "
      + "other it is a saddle; if it curves down everywhere it is a dome, "
      + "and the point where A x = g is the top. Newton's method solves "
      + "exactly that equation, so on a saddle it walks happily to the "
      + "saddle point, which is not a minimum. Three equivalent tests tell "
      + "a bowl: every eigenvalue is positive; every pivot of the "
      + "elimination is positive; a Cholesky factor (A = R\u2032R, the "
      + "square root of a matrix) exists. Drag the sliders and the "
      + "starting point and watch all three agree. This is why an "
      + "optimiser cares: a quadratic model of the objective is only "
      + "trusted if its table is a bowl. Choupo's QP solver states that "
      + "requirement (src/solver/ActiveSetQP.H:39) and its SQP driver "
      + "guarantees it by construction instead of testing it: it starts "
      + "from the identity (src/solver/SQP.cpp:257) and updates with a "
      + "damped BFGS rule that cannot lose the property, skipping the "
      + "update rather than break it (src/solver/SQP.cpp:627). Where that "
      + "inner problem is solved is the active-set page.",
    derivation: [
      { step: "A quadratic landscape of one table and one linear term.",
        eq: String.raw`f(x) = \tfrac{1}{2}\,x'A\,x - g'x` },
      { step: "Its slope is zero where one linear system holds: that is "
          + "the lowest point if A is a bowl.",
        eq: String.raw`A\,x^{*} = g` },
      { step: "Positive definite means every direction goes up.",
        eq: String.raw`v'A\,v > 0 \quad \text{for every } v \ne 0` },
    ],
    formula: String.raw`f(x) = \tfrac{1}{2}\,x'A\,x - g'x \qquad A\,x^{*} = g`,
    where: [
      { sym: "f", means: "the landscape: the height at the point x" },
      { sym: "g", means: "the linear part of the landscape; it shifts where the bottom is, never what shape it has" },
      { sym: "x^{*}", means: "the stationary point, where the slope is zero: the bottom of a bowl, the top of a dome, the pass of a saddle" },
      { sym: "v", means: "any direction you could walk in from the bottom" },
      { sym: "x'", means: "the transpose: the row version of the column x (a prime marks it throughout this page)" },
    ],
    leadsTo: {
      tool: "active-set-qp",
      toolLabel: "Quadratic programming with constraints (active set)",
      stepTitle: "The problem, and why this shape is worth a method of its own",
      body: "The bowl in a box: the same quadratic with constraints, and the inner problem of an SQP step.",
    },
    note: "A bowl is called positive definite; one that touches zero in "
      + "some direction is positive semi-definite, the ridge. The three "
      + "tests agree on a bowl; the page's test sweeps a grid of 2x2 "
      + "tables and holds them to each other.",
  },
  {
    n: 7,
    title: "Many variables: n parabolas, one per axis",
    body: "Two variables you can draw; a column has hundreds. The trick is "
      + "that you never need to draw them. A symmetric table has n special "
      + "directions at right angles to each other, its principal axes: "
      + "stand on the stationary point and look along one of them, and the "
      + "landscape is just a parabola, curving up, curving down or flat. "
      + "The number that says how sharply it curves is the eigenvalue of "
      + "that axis. Every other direction is a mixture of the axes, and "
      + "the height along it is the sum of the parabolas, each weighted by "
      + "how much of that axis the direction contains. So the whole "
      + "n-dimensional shape is n one-dimensional pictures at once. "
      + "POSITIVE DEFINITE means all n parabolas open upward: then every "
      + "mixture goes up too, and there is exactly one bottom. If even one "
      + "opens downward, walking along that axis goes down, and the shape "
      + "is a saddle; if one is flat (and none points down) there is a "
      + "valley floor, which is the ridge of the last step in n "
      + "dimensions. Move the coupling slider in the figure and watch the "
      + "smallest parabola of a 3x3 table flatten at c = 2 and then flip "
      + "(for these numbers the determinant is 24 - 6c², which vanishes "
      + "there). You do not have to look along every direction to know: "
      + "run the elimination of step 2 on the symmetric table, without "
      + "swapping rows, and look at the pivots. The table is a bowl exactly "
      + "when every pivot is positive, so the receipt of step 2 is also the "
      + "test (Cholesky is the same elimination with the square root of "
      + "each pivot taken). Why an engineer cares: a mixture is stable "
      + "when any small split into two phases would raise its Gibbs "
      + "energy, which is the statement that the table of second "
      + "derivatives of G is positive definite; a mixture whose table has "
      + "a downward parabola in the composition space gains energy by "
      + "splitting. Choupo's Michelsen stability test asks the sturdier, "
      + "global version of that question: is there ANY other composition "
      + "at which the tangent plane drawn at the feed lies above the "
      + "chemical potentials (src/solver/StabilityTest.H:39-43), measured "
      + "by the tangent-plane distance tm "
      + "(src/solver/StabilityTest.cpp:65-69). The same picture appears in "
      + "mechanics: a mass-and-spring network is stable when every "
      + "displacement stores positive energy, which is the same bowl. "
      + "The odd name comes from the expression x'Ax, a QUADRATIC FORM: "
      + "every term has two factors of the unknowns. 'Form' is old: Gauss, "
      + "in the Disquisitiones Arithmeticae (1801), Section V, Art. 153, "
      + "calls functions of two unknowns of this kind 'forms of the second "
      + "degree or simply forms'; a dictionary of first uses of "
      + "mathematical words says Euler perhaps used 'form' in this sense in "
      + "a paper read in 1775, and gives Salmon (1859) for the English "
      + "'quadratic form'. 'Definite' is a plain-reading word: the sign of "
      + "x'Ax is decided in advance, for every direction. POSITIVE DEFINITE: "
      + "always positive, never zero except at x = 0. INDEFINITE: the sign "
      + "is undecided, it depends on the direction (the saddle). "
      + "SEMI-DEFINITE: the sign never changes but can be zero (the valley "
      + "floor). The name describes the sign of x'Ax, not the shape of the "
      + "bowl, which is why it looks meaningless at first. When 'definite' "
      + "was first used in this sense is not documented in that "
      + "dictionary, which has no entry for it; Sylvester's law of inertia "
      + "(1852) is the nineteenth-century result that counts how many "
      + "directions go up and how many go down.",
    derivation: [
      { step: "The principal axes q_k and their curvatures λ_k are the "
          + "solutions of a symmetric table acting on a direction by only "
          + "stretching it.",
        eq: String.raw`A\,q_k = \lambda_k\,q_k` },
      { step: "Write any direction as a mixture of the axes with weights "
          + "u_k: the height is the sum of the parabolas.",
        eq: String.raw`v'A\,v = \sum_{k=1}^{n} \lambda_k\,u_k^{2}` },
      { step: "The elimination of step 2, on a symmetric table without "
          + "swaps, gives the same kind of sum with the pivots d_k in place "
          + "of the curvatures: all pivots positive is all of v'Av positive.",
        eq: String.raw`A = L\,D\,L' \;\Rightarrow\; v'A\,v = \sum_{k=1}^{n} d_k\,w_k^{2}, \quad w = L'v` },
    ],
    formula: String.raw`v'A\,v = \sum_{k=1}^{n} \lambda_k\,u_k^{2} = \sum_{k=1}^{n} d_k\,w_k^{2}`,
    where: [
      { sym: "n", means: "the number of unknowns: how many axes, and how many parabolas" },
      { sym: "k", means: "the index of an axis (or a pivot), from 1 to n" },
      { sym: "q_k", means: "the k-th principal axis: one of the n directions, at right angles to each other, along which the table only stretches" },
      { sym: "\\lambda_k", means: "the eigenvalue of that axis: the curvature of the parabola along it (positive opens up, negative down, zero flat)" },
      { sym: "u_k", means: "how much of axis k a direction contains" },
      { sym: "D", means: "the diagonal table of pivots left by the elimination" },
      { sym: "d_k", means: "the k-th pivot of the elimination of step 2, run on a symmetric table without swapping rows" },
      { sym: "w", means: "the direction after the elimination's own change of variables, w = L'v" },
      { sym: "w_k", means: "the k-th entry of w: the weight the k-th pivot gets" },
    ],
    note: "In floating point a pivot of 1e-17 counts as zero for this "
      + "purpose, so the test needs a tolerance. The engine's Michelsen test is the global question and "
      + "this page's pivot test the local one; a positive-definite table "
      + "of second derivatives of G rules out only an INFINITESIMAL split, "
      + "and Choupo asks also for a finite one.",
  },
  {
    n: 8,
    title: "Steepest descent zigzags; conjugate gradient never undoes a step",
    body: "You are on the side of a long narrow valley, blindfolded, and "
      + "you may only feel the slope under your feet. Steepest descent: "
      + "walk straight downhill until it stops going down, feel the slope "
      + "again, repeat. In a round bowl that works; in a long narrow "
      + "valley the steepest direction points mostly at the opposite wall, "
      + "so you cross the valley, turn, cross it again: a zigzag whose "
      + "steps are at right angles and which crawls along the floor. On "
      + "the page's bowl (condition number " + SD_KAPPA + ", start at ("
      + SD_START.join(", ") + ")) steepest descent needs " + SD_STEPS
      + " steps to get the residual below 1e-8. Conjugate gradient "
      + "changes one thing: each new direction is the downhill direction "
      + "with the part that would undo the previous step taken out, so "
      + "the progress already made across the valley is never spoiled. "
      + "The directions are 'conjugate' (each is at a right angle to the "
      + "others when the bowl is stretched back into a circle), and on a "
      + "bowl of n unknowns there are only n such directions: conjugate "
      + "gradient is finished after at most n steps, in exact arithmetic. "
      + "Here it takes " + CG_STEPS + " on the 2x2 and " + CG3_STEPS
      + " on a 3x3. It never needs the table itself, only what the table "
      + "does to a vector, which is what makes it the method for tables "
      + "too large to factor (a CFD pressure equation, say). Choupo does "
      + "not have a conjugate-gradient solver: its tables are small or "
      + "block-structured, so it factors them (steps 2 and 5). The page "
      + "teaches the method because it is the other half of the "
      + "linear-algebra picture and because the bowl of step 6 is where it "
      + "lives.",
    derivation: [
      { step: "The residual is the downhill direction: how far A x is "
          + "from g.",
        eq: String.raw`r = g - A\,x` },
      { step: "Steepest descent walks along r, with the exact step length "
          + "that finds the lowest point on that line.",
        eq: String.raw`\alpha = \frac{r'r}{r'A\,r}, \qquad x \leftarrow x + \alpha\,r` },
      { step: "Conjugate gradient walks along a direction d that is the "
          + "residual with the previous direction mixed in, so that d "
          + "never undoes an earlier step: its directions satisfy "
          + "d_i' A d_j = 0.",
        eq: String.raw`d_{\mathrm{new}} = r_{\mathrm{new}} + \beta\,d, \qquad d_i'A\,d_j = 0 \;(i \ne j)` },
    ],
    formula: String.raw`r = g - A\,x \qquad d_i'A\,d_j = 0 \;(i \ne j)`,
    where: [
      { sym: "r", means: "the residual: the downhill direction; it is zero exactly at the bottom" },
      { sym: "\\alpha", means: "the step length along a direction: how far to walk before the slope along that line turns upward again" },
      { sym: "d", means: "the direction walked in conjugate gradient" },
      { sym: "\\beta", means: "how much of the previous direction is mixed into the new one" },
      { sym: "d_{\\mathrm{new}}", means: "the next direction" },
      { sym: "r_{\\mathrm{new}}", means: "the residual after the step" },
      { sym: "d_i", means: "the direction of step i" },
      { sym: "d_j", means: "the direction of an earlier step j" },
      { sym: "i", means: "the number of a later step" },
      { sym: "j", means: "the number of an earlier step, different from i" },
    ],
    note: "The page's bound for steepest descent, that the bowl's own "
      + "height (the A-norm of the error) shrinks by at most "
      + "(\u03ba - 1)/(\u03ba + 1) per step, is checked numerically by the "
      + "page's test, not quoted. Conjugate gradient's n-step finish holds "
      + "in exact arithmetic; with rounding it is a few steps more, which "
      + "is why large problems are preconditioned.",
  },
];

/** The glossary: every symbol of every step, once, from the same `where`
 *  lists the steps draw (a symbol defined in two steps is shown at its first). */
export const LA_GLOSSARY: readonly { sym: string; means: string; step: number }[] = (() => {
  const seen = new Set<string>();
  const out: { sym: string; means: string; step: number }[] = [];
  for (const s of LA_STEPS)
    for (const w of s.where ?? [])
      if (!seen.has(w.sym)) { seen.add(w.sym); out.push({ sym: w.sym, means: w.means, step: s.n }); }
  return out;
})();

export const LA_LIMITS: readonly LessonLimit[] = [
  {
    id: "toy-not-engine",
    title: "The matrices are toys; the citations are the engine's",
    body: "Every table on this page is 2x2, 3x3 or a small block-tridiagonal "
      + "one, declared in the page's own arithmetic. No Choupo run is shown. "
      + "What is Choupo's is the file and line each step cites, which a "
      + "test holds to the text the step says is there.",
  },
  {
    id: "lu-simplified",
    title: "The engine's LU does a little more than the toy's",
    body: "The toy picks the largest entry in the column. The engine does "
      + "too, but it first rescales rows and columns so that the choice "
      + "does not depend on the units of an equation or an unknown, and it "
      + "refuses a pivot that is zero to working precision "
      + "(src/solver/LU.cpp:99). The idea is the same; the "
      + "details are not.",
  },
  {
    id: "no-cg-in-engine",
    title: "Choupo has no conjugate-gradient solver",
    body: "Step 7 teaches a method the engine does not use: its tables are "
      + "small or block-structured and are factored. Conjugate gradient "
      + "belongs to the other regime, tables too big to hold, and to "
      + "positive definite ones only. The page puts it here because the "
      + "bowl of step 6 is where it lives, not because Choupo calls it.",
  },
  {
    id: "exact-arithmetic",
    title: "'n steps' is exact arithmetic",
    body: "Conjugate gradient finishes in n steps only if nothing is "
      + "rounded. With rounding the directions slowly lose their "
      + "conjugacy, and a large problem takes more steps than unknowns; "
      + "the cure (a preconditioner) is not on this page.",
  },
  {
    id: "not-sparse-in-general",
    title: "Structure is only free if it is true",
    body: "Block-Thomas works because a column's equations really do "
      + "couple only neighbouring trays. A recycle, a side stream or a "
      + "pump-around adds entries off the three diagonals and the "
      + "structure is no longer block-tridiagonal; the engine checks the "
      + "declaration and refuses a false one rather than return a wrong "
      + "answer.",
  },
  {
    id: "no-eigen-svd",
    title: "Eigenvalues and the condition number are named, not computed by hand",
    body: "The page uses eigenvalues to classify a bowl and a norm-based "
      + "condition number for the wobble, but shows no algorithm for "
      + "either: for a 2x2 they have a closed form, and larger ones are "
      + "left to a library.",
  },
];

export const LA_QUIZ: readonly QuizQuestion[] = [
  {
    id: "why-solve",
    q: "Each Newton step in Choupo requires solving J dx = -F. What does that linear system represent?",
    options: [
      "The point where the straight-line approximations of all the equations cross at zero",
      "The exact answer of the process model",
      "The sum of all the residuals",
      "A way of checking that the mass balance closes",
    ],
    correct: 0,
    feedback: "Newton replaces every curved equation by its tangent at the "
      + "current guess; J dx = -F finds where all those straight lines hit "
      + "zero together. It is only an approximation, which is why Newton "
      + "repeats, and why a singular J (parallel tangents) stops it.",
    steps: [1],
  },
  {
    id: "lu-receipt",
    q: "You must solve the same table A against ten different right-hand sides. What does keeping LU save?",
    options: [
      "Nothing: each right-hand side needs a full elimination",
      "The sweep is done once; each right-hand side then costs only two cheap passes, about n\u00b2 instead of n\u00b3/3",
      "The need to pivot",
      "The need for A to be square",
    ],
    correct: 1,
    feedback: "The sweep (about n\u00b3/3 operations) depends only on A; L "
      + "and U are the receipt of it. Each new right-hand side then needs "
      + "only the pass down L and the pass up U, about n\u00b2. Choupo's "
      + "stiff integrator relies on exactly this.",
    steps: [2],
  },
  {
    id: "tiny-pivot",
    q: "Why swap rows so that the largest entry of the column is the pivot?",
    options: [
      "To make the table symmetric",
      "To make the elimination run faster",
      "To keep the multipliers small, so rounding errors are not magnified",
      "To make the determinant positive",
    ],
    correct: 2,
    feedback: "Dividing by a tiny pivot gives a huge multiplier, which "
      + "swamps the other numbers in the row and loses their digits. "
      + "Dividing by the largest entry keeps every multiplier at most one "
      + "in size. The swap changes the order of the equations, not the "
      + "answer.",
    steps: [3],
  },
  {
    id: "ill-conditioned",
    q: "Two lines cross at a very shallow angle. The right-hand side has a measurement error of one part in a thousand. What happens to the crossing point?",
    options: [
      "It moves by about one part in a thousand",
      "It can move by many times that: the condition number is the largest possible amplification",
      "It does not move, because the solver is exact",
      "It moves only if the solver does not pivot",
    ],
    correct: 1,
    feedback: "Nearly parallel lines make a wobbly table: the condition "
      + "number is the worst-case ratio of relative change in the answer "
      + "to relative change in the right-hand side. It belongs to the "
      + "problem, so no pivoting or better algorithm removes it.",
    steps: [4],
  },
  {
    id: "structure",
    q: "A column with N trays and nv unknowns per tray has a block-tridiagonal Jacobian. How does the block solve's work grow with N?",
    options: [
      "Like N cubed, the same as a dense solve",
      "Like N squared",
      "In proportion to N",
      "It does not depend on N",
    ],
    correct: 2,
    feedback: "Each tray couples only to its neighbours, so elimination "
      + "touches one small block per tray: about N times nv\u00b3. A dense "
      + "solve of the same table grows like (N nv)\u00b3. The saving is "
      + "only real if the structure is true, which the engine checks.",
    steps: [5],
  },
  {
    id: "bowl",
    q: "A symmetric table with six unknowns has five principal-axis parabolas opening upward and one opening downward. What is the surface, and what will the elimination show?",
    options: [
      "A bowl; every pivot is positive",
      "A saddle (indefinite); at least one pivot will not be positive",
      "A valley floor (semi-definite); all pivots are positive",
      "A dome; every pivot is negative",
    ],
    correct: 1,
    feedback: "One downward parabola is enough: walking along that axis "
      + "goes down, so the sign of x'Ax depends on the direction and the "
      + "table is indefinite, a saddle. The pivots are the same story "
      + "told by the elimination of step 2: they are all positive exactly "
      + "when the table is a bowl, so at least one is not. A dome needs "
      + "all six to open downward.",
    steps: [6, 7],
  },
  {
    id: "cg",
    q: "What does conjugate gradient do that steepest descent does not?",
    options: [
      "It uses a larger step length",
      "It chooses each direction so as not to undo the progress of the earlier steps, so an n-unknown bowl needs at most n steps",
      "It avoids computing the residual",
      "It works on any table, not only positive-definite ones",
    ],
    correct: 1,
    feedback: "Steepest descent's consecutive steps are at right angles "
      + "and keep re-crossing the valley. Conjugate gradient removes from "
      + "each new direction the part that would spoil an earlier step; in "
      + "exact arithmetic that finishes an n-unknown bowl in n steps. It "
      + "does need the table to be positive definite.",
    steps: [8],
  },
];
