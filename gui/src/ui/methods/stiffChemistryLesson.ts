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
  stiffChemistryLesson -- "Why is chemistry stiff, and how do solvers go fast?".

  The task it serves, in one sentence: a chemical-engineering student who runs
  a combustion or NOx case wants to know why it needs a stiff solver, what a
  Jacobian and an LU are doing, and why one solver is many times faster than
  another on the same mechanism, with Choupo's own numbers.

  WHERE EVERY NUMBER CAME FROM.  The counts, timings and instruction tallies
  are the measured work of 2026-11-22 recorded in docs/reviews/2026-11-22-*
  (the CITATIONS table names each line); nothing is typed from memory.  The
  ignition01 table was produced on the day by running the shipped cases.

  LIVE OR RECORDED.  The page runs nothing in the browser: the work counters
  come from the environment variable CHOUPO_ODE_STATS, which a browser run
  cannot set (AdaptiveTimeStep.H), so every table is a RECORDED run and the
  page says so.  The calculator in step 1 is arithmetic on the page.

  THE CHOUPO SIDE IS CITED TO THE LINE.  CITATIONS lists each file:line and a
  fragment that line must contain; the test reads every one back.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

// ---- page arithmetic (the calculator of step 1) -----------------------------

/** R(z) of classical RK4 on y' = lambda y, z = h lambda (z negative for decay). */
export function rk4Amplification(z: number): number {
  return 1 + z + z * z / 2 + z ** 3 / 6 + z ** 4 / 24;
}

/** R(z) of one implicit Euler step: the L-stable bound every stiff method here shares. */
export function implicitEulerAmplification(z: number): number {
  return 1 / (1 - z);
}

/** The largest h|lambda| with |R_RK4(-x)| <= 1, by bisection (2.785). */
export function rk4StabilityLimit(): number {
  let lo = 1, hi = 4;
  for (let i = 0; i < 80; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (Math.abs(rk4Amplification(-mid)) <= 1) lo = mid; else hi = mid;
  }
  return lo;
}

/** The size scale of the cubic-Hermite defect on a step: (lambda h)^4 / 384. */
export function hermiteDefect(lambdaH: number): number {
  return lambdaH ** 4 / 384;
}

export interface CalcRow {
  lambda: number;   // fastest rate, 1/s
  h: number;        // step, s
  z: number;        // h lambda
  rk4: number;      // |R_RK4(-z)|
  rk4Stable: boolean;
  implicit: number; // |R_IE(-z)|
  rk4Steps: number; // steps RK4 needs to cross the window at its stability limit
  hermite: number;
}

export function calc(lambda: number, h: number, window: number): CalcRow {
  const z = lambda * h;
  const rk4 = Math.abs(rk4Amplification(-z));
  return {
    lambda, h, z, rk4, rk4Stable: rk4 <= 1,
    implicit: Math.abs(implicitEulerAmplification(-z)),
    rk4Steps: Math.ceil(window * lambda / rk4StabilityLimit()),
    hermite: hermiteDefect(z),
  };
}

// ---- recorded tables --------------------------------------------------------

/** ignition01 with each integrator, run on 2026-11-22 from the shipped cases. */
export interface IgnitionRow {
  id: string;
  integrator: string;
  case: string;
  outcome: string;
  tFinal: string;
  tauIgn: string;
  engineTime: string;
}

export const IGNITION_ROWS: readonly IgnitionRow[] = [
  { id: "rosenbrock23", integrator: "Rosenbrock23", case: "ignition01_h2o2",
    outcome: "finishes", tFinal: "3037 K", tauIgn: "8 us", engineTime: "not timed here" },
  { id: "rodas4", integrator: "Rodas4", case: "ignition01_h2o2 with integrator Rodas4",
    outcome: "finishes, same answer", tFinal: "3037 K", tauIgn: "8 us", engineTime: "0.018 s integrating" },
  { id: "seulex", integrator: "seulex", case: "ignition01_h2o2_seulex",
    outcome: "finishes, same answer", tFinal: "3037 K", tauIgn: "8 us", engineTime: "0.011 s integrating" },
  { id: "rk4", integrator: "RK4 (explicit)", case: "ignition01_h2o2_rk4",
    outcome: "stops with an error at t = 2 us: the step drove n_HO2 to -2.96e-5 kmol (clipped, with a warning), T became non-physical and NASA9Cp was asked for H at T <= 0 K",
    tFinal: "none", tauIgn: "none", engineTime: "stops within 0.03 s" },
  { id: "eulersi", integrator: "EulerSI (semi-implicit Euler)", case: "ignition01_h2o2_eulersi",
    outcome: "gives up inside the first 1 us step: a non-finite or negative state after one sub-step (stable, but only first order)",
    tFinal: "none", tauIgn: "none", engineTime: "stops within 0.03 s" },
];

export interface JacobianRow { id: string; name: string; how: string; cost: string; risk: string }

export const JACOBIAN_ROWS: readonly JacobianRow[] = [
  { id: "fd", name: "Finite differences",
    how: "perturb one unknown at a time and difference f, with a step of about the square root of machine epsilon times the size of y_j",
    cost: "about one right-hand side per column (fewer when columns that share no row are coloured together)",
    risk: "round-off noise on the fast radicals, and a cost that grows with the number of species" },
  { id: "analytic", name: "Choupo's analytic Jacobian",
    how: "the derivative of every rate law written out: mass action, third body, Lindemann, Troe, PLOG, the temperature column and the equilibrium constant",
    cost: "one sparse build per Jacobian, the pattern analysed once",
    risk: "a wrong column; so the engine audits it against a central difference at the 1st, 2nd, 4th, ... Jacobian and stops by name on disagreement. It is the default where every law has a derivative" },
  { id: "openfoam", name: "OpenFOAM's fast Jacobian",
    how: "always analytic, but the default keeps only the diagonal of dc/dY and the fall-off temperature and concentration terms are compiled out (as read in a Choupo review of its source)",
    cost: "cheap to build",
    risk: "approximate on fall-off and unchecked: a wrong Jacobian costs steps before the answer (Robertson: 8724 steps against 117, same y1 to 5e-9), but at about 50 % wrong the damping is lost and the run stops" },
];

export interface SparseRow { id: string; what: string; value: string }

export const SPARSE_ROWS: readonly SparseRow[] = [
  { id: "n", what: "nox03: rows of the matrix", value: "52" },
  { id: "fill", what: "entries in the pattern", value: "2145 of 2704 (79 % full)" },
  { id: "lu", what: "entries in L + U", value: "2530 (94 % of dense)" },
  { id: "ma", what: "multiply-adds per factor", value: "38 101 (dense n^3/3 would be 46.9 k)" },
  { id: "ir-before", what: "instructions per factor, indexed loop", value: "382.6 k" },
  { id: "ir-after", what: "instructions per factor, runs of consecutive rows", value: "273.0 k (bit-identical result)" },
  { id: "dense-nox03", what: "dense against sparse, whole nox03 run (seulex)", value: "1.07 times (sparse 7 % cheaper)" },
  { id: "dense-nox02", what: "dense against sparse, nox02 (17 vessels, seulex)", value: "9.9 times (block-diagonal)" },
];

export interface CountRow {
  id: string; integrator: string; rtol: string; cpu: string; accepted: string;
  jacobians: string; factors: string; rhs: string; stepEnd: string;
}

/** nox03, atol 1e-15, the controller as shipped (seulex README, fix round). */
export const COUNT_ROWS: readonly CountRow[] = [
  { id: "r4-6", integrator: "Rodas4", rtol: "1e-6", cpu: "0.155 s", accepted: "201", jacobians: "252", factors: "252", rhs: "-", stepEnd: "6.5e-5" },
  { id: "sx-6", integrator: "seulex", rtol: "1e-6", cpu: "0.148 s", accepted: "88", jacobians: "79", factors: "475", rhs: "-", stepEnd: "1.9e-2" },
  { id: "r4-8", integrator: "Rodas4", rtol: "1e-8", cpu: "0.278 s", accepted: "728", jacobians: "732", factors: "732", rhs: "5117", stepEnd: "2.4e-5" },
  { id: "sx-8", integrator: "seulex", rtol: "1e-8", cpu: "0.203 s", accepted: "95", jacobians: "92", factors: "635", rhs: "3065", stepEnd: "4.3e-5" },
  { id: "r4-10", integrator: "Rodas4", rtol: "1e-10", cpu: "1.196 s", accepted: "3568", jacobians: "3569", factors: "3569", rhs: "-", stepEnd: "4.1e-7" },
  { id: "sx-10", integrator: "seulex", rtol: "1e-10", cpu: "0.268 s", accepted: "113", jacobians: "111", factors: "872", rhs: "-", stepEnd: "3.9e-7" },
  { id: "ct-8", integrator: "CVODES / BDF (Cantera 3.2)", rtol: "1e-8", cpu: "0.040 s integrating", accepted: "2137", jacobians: "38", factors: "239", rhs: "3005 (+ 2052 in difference Jacobians)", stepEnd: "-" },
];

export interface CostRow { id: string; what: string; before: string; after: string }

export const COST_ROWS: readonly CostRow[] = [
  { id: "rhs-ir", what: "right-hand side of nox03, instructions per call", before: "277.6 k", after: "167.6 k" },
  { id: "rhs-us", what: "right-hand side, microseconds per call", before: "23.3", after: "14.0" },
  { id: "jac-us", what: "analytic Jacobian, microseconds per build", before: "60.0", after: "41.2" },
  { id: "ct-us", what: "Cantera 3.2 kinetics alone on the same state, microseconds", before: "-", after: "3.0" },
];

export interface SplitRow { id: string; part: string; share: string }

/** Where the instructions of the seulex run on nox03 (rtol 1e-8) went (callgrind, fair-timing). */
export const SPLIT_ROWS: readonly SplitRow[] = [
  { id: "integrate", part: "integration (everything inside the stepper)", share: "997 M of 1396 M instructions (71 %)" },
  { id: "rhs", part: "right-hand side, 3065 calls", share: "519.5 M (37 %), of it the 235 reactions' rates 298.8 M (21 %)" },
  { id: "factor", part: "SparseLU factor, 635 calls", share: "243 M (17 %) before the run kernels, 173.3 M after" },
  { id: "startup", part: "start-up: 825 dictionary files parsed, pins hashed", share: "about a third of this run before the later start-up work" },
];

export interface TimingRow {
  id: string; what: string; choupo: string; cantera: string; ratio: string;
}

/** Like with like (fair-timing, merged tree): integration only, then end to end. */
export const TIMING_ROWS: readonly TimingRow[] = [
  { id: "int-nox03-sx", what: "integration only, nox03 seulex rtol 1e-8", choupo: "0.103 s", cantera: "0.046 s", ratio: "2.25" },
  { id: "e2e-nox03-sx", what: "end to end, nox03 seulex rtol 1e-8 (process against python3)", choupo: "0.212 s", cantera: "0.251 s", ratio: "0.84" },
  { id: "int-nox02-r4", what: "integration only, nox02 (17 vessels) Rodas4 rtol 1e-8", choupo: "1.576 s", cantera: "0.043 s", ratio: "36" },
];

export interface JourneyRow { id: string; when: string; lesson: string }

export const JOURNEY_ROWS: readonly JourneyRow[] = [
  { id: "measure", when: "morning", lesson: "Choupo was far slower than Cantera (the first tables, quoted from the project log, gave about 300 times on the large case). Nobody changed code before a profile said where the time went." },
  { id: "profile", when: "midday", lesson: "A profile of one run: the right-hand side, the Jacobian and the linear algebra each took a share. The matrix was 79 % full, so sparse tricks bought little on that case: the measurement overruled the plan." },
  { id: "identity", when: "every speedup", lesson: "Before and after each change, every shipped case was run and every output byte compared: 666 cases, 44 091 files, 0 moved. A speedup that changes results is not a speedup." },
  { id: "like", when: "evening", lesson: "The comparison itself was corrected: integration only, then end to end. Python's import cantera alone costs 0.15 s. Integration is 2.25 times Cantera on nox03; end to end it is level." },
];

export interface VesselRow {
  id: string; integrator: string; rtol: string; coupled: string;
  one: string; two: string; four: string;
}

/** nox02, integration only: wall of the vessels' integration, times Cantera (fair-timing, pervessel). */
export const VESSEL_ROWS: readonly VesselRow[] = [
  { id: "r4-8", integrator: "Rodas4", rtol: "1e-8", coupled: "35.9x", one: "5.8x", two: "3.9x", four: "3.2x" },
  { id: "r4-10", integrator: "Rodas4", rtol: "1e-10", coupled: "64.5x", one: "22.6x", two: "12.2x", four: "10.6x" },
  { id: "sx-8", integrator: "seulex", rtol: "1e-8", coupled: "20.1x", one: "3.3x", two: "1.7x", four: "1.1x" },
  { id: "sx-10", integrator: "seulex", rtol: "1e-10", coupled: "14.5x", one: "3.8x", two: "1.7x", four: "1.7x" },
];

/** The accuracy that goes with the table: separate steps leave the cold vessels less accurate at equal rtol. */
export const VESSEL_ACCURACY_NOTE =
  "Accuracy goes the other way: with every vessel on its own step the cold vessels no longer ride the hot vessels' small steps, so at equal rtol they are less accurate (Rodas4 1e-8: 3.5e-4 per vessel against 1.7e-4 coupled, as the Cantera reactors are). What decides it on the shipped case is atol: at rtol 1e-10 the worst deviation from Cantera over every species and write time is 1.7e-3 coupled at atol 1e-17, 2.0e-3 per vessel at 1e-17 and 5.7e-4 per vessel at the case's atol of 1e-19 kmol. A species that starts at zero is error-controlled only above atol.";

/** True when the key `denseOutput` is in the engine tree; the test holds this to the source. */
export const DENSE_OUTPUT_LANDED = true;

export interface DenseRow { id: string; method: string; construction: string; before: string; after: string }

/** The grid against a tight reference on nox03, before and after the integrators' own dense output. */
export const DENSE_ROWS: readonly DenseRow[] = [
  { id: "seulex", method: "seulex", construction: "extrapolated polynomial through the sub-steps (Hairer and Wanner IV.9)", before: "4.0e-2", after: "6.8e-5" },
  { id: "rodas4", method: "Rodas4", construction: "CONTRO of rodas.f: a cubic from the stage vectors (Hairer and Wanner IV.7)", before: "1.9e-4", after: "6.1e-5" },
  { id: "rosenbrock23", method: "Rosenbrock23", construction: "ntrp23s of Shampine and Reichelt, second order, from the two stage increments", before: "level", after: "level (the step end dominates)" },
];

// ---- the steps --------------------------------------------------------------

export const SC_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "What stiffness is",
    body: "A burning mixture has radicals that settle in nanoseconds while the temperature moves over milliseconds. The Jacobian's eigenvalues \\(\\lambda\\) span that range. An explicit method must keep \\(h|\\lambda|\\) below a limit set by its stability function, even after the fast mode has died: the step follows the fastest mode, not the accuracy.",
    formula: String.raw`R_{\mathrm{RK4}}(z) = 1 + z + \frac{z^{2}}{2} + \frac{z^{3}}{6} + \frac{z^{4}}{24}, \qquad |R_{\mathrm{RK4}}(-z)| \le 1 \;\Rightarrow\; z = h|\lambda| \le 2.785`,
    where: [
      { sym: "R_{\\mathrm{RK4}}", means: "factor by which one RK4 step multiplies a mode y' = (eigenvalue) y" },
      { sym: "z", means: "step times the size of the eigenvalue", unit: "dimensionless" },
      { sym: "h", means: "step size", unit: "s" },
      { sym: "\\lambda", means: "an eigenvalue of the Jacobian; chemistry spans about -1e9 /s for radicals to -1e3 /s for NOx", unit: "1/s" },
    ],
    note: "Choupo ships the two failures on purpose: ignition01_h2o2_rk4 and ignition01_h2o2_eulersi are expected failures, recorded below.",
  },
  {
    n: 2,
    title: "Three Jacobians",
    body: "A stiff method needs the matrix of derivatives of the rates. Three ways to get it: difference it numerically, write the derivatives out and audit them (Choupo), or write them out approximately (OpenFOAM's default). A wrong matrix costs steps before it costs the answer.",
    formula: String.raw`J_{ij} = \frac{\partial f_i}{\partial y_j} \approx \frac{f_i(y + \delta\,e_j) - f_i(y)}{\delta}, \qquad \delta \approx \sqrt{\varepsilon_{\mathrm{mach}}}\,|y_j|`,
    where: [
      { sym: "J_{ij}", means: "derivative of rate of change i with respect to unknown j", unit: "1/s" },
      { sym: "f_i", means: "right-hand side: the rate of change of unknown i" },
      { sym: "y_j", means: "unknown j: a species amount or the temperature" },
      { sym: "y", means: "the whole state vector" },
      { sym: "\\delta", means: "perturbation of one unknown in the difference" },
      { sym: "e_j", means: "unit vector that is 1 in position j and 0 elsewhere" },
      { sym: "\\varepsilon_{\\mathrm{mach}}", means: "double-precision machine epsilon, 2.2e-16" },
    ],
  },
  {
    n: 3,
    title: "Linear algebra: what an implicit step solves",
    body: "Each implicit step solves a linear system with the matrix \\(I - h\\gamma J\\). Dense LU costs about \\(n^3/3\\) multiply-adds; sparse LU skips the zeros. On a 52-row matrix that is 79 % full the saving is small; on 17 independent vessels in one matrix it is ten-fold.",
    formula: String.raw`(I - h\,\gamma\,J)\,x = b`,
    where: [
      { sym: "I", means: "identity matrix" },
      { sym: "h", means: "step size", unit: "s" },
      { sym: "\\gamma", means: "method constant: 1/4 for Rodas4, 1 divided by (2 + square root of 2) for Rosenbrock23" },
      { sym: "J", means: "the Jacobian of step 2", unit: "1/s" },
      { sym: "x", means: "the unknown increment of the state" },
      { sym: "b", means: "right-hand side built from f" },
    ],
    note: "An LU factorisation is a receipt for elimination: factor once, then each solve is two cheap triangular sweeps.",
  },
  {
    n: 4,
    title: "Four integrators and what they count",
    body: "Rodas4 and Rosenbrock23 build one Jacobian and factor once per step. seulex takes few big steps, rebuilds J only when it has aged and factors many times per step. CVODES (Cantera) takes many steps and reuses one factor. Which wins depends on the tolerance.",
    formula: String.raw`h_{\mathrm{new}} = \sigma\,h\,e^{-1/4}`,
    where: [
      { sym: "h_{\\mathrm{new}}", means: "the next step proposed by Rodas4", unit: "s" },
      { sym: "\\sigma", means: "safety factor, 0.9 for Rodas4" },
      { sym: "h", means: "the step just taken", unit: "s" },
      { sym: "e", means: "scaled error norm of that step: at most 1 is accepted; exponent 1/4 for a method of order 4" },
    ],
    note: "A fourth-order step shrinks as the tolerance to the power 1/4 (3.2 times per two decades); seulex raises its order instead, so its step count barely moves.",
  },
  {
    n: 5,
    title: "The cost of one evaluation, and where the time goes",
    body: "A run costs counts times prices: right-hand sides, Jacobians, factorisations. The count was reduced by the method, the price by the code. Choupo's right-hand side fell from 23 to 14 microseconds; Cantera's kinetics alone take 3. Time is also spent outside the integrator.",
    formula: String.raw`t_{\mathrm{run}} \approx N_{f}\,c_{f} + N_{J}\,c_{J} + N_{\mathrm{LU}}\,c_{\mathrm{LU}} + t_{\mathrm{start}}`,
    where: [
      { sym: "t_{\\mathrm{run}}", means: "wall time of the whole process", unit: "s" },
      { sym: "N_{f}", means: "number of right-hand side evaluations" },
      { sym: "c_{f}", means: "cost of one right-hand side evaluation", unit: "s" },
      { sym: "N_{J}", means: "number of Jacobian builds" },
      { sym: "c_{J}", means: "cost of one Jacobian build", unit: "s" },
      { sym: "N_{\\mathrm{LU}}", means: "number of factorisations" },
      { sym: "c_{\\mathrm{LU}}", means: "cost of one factorisation with its solves", unit: "s" },
      { sym: "t_{\\mathrm{start}}", means: "start-up: reading and hashing the data files", unit: "s" },
    ],
  },
  {
    n: 6,
    title: "Many reactors in one run",
    body: "nox02 puts 17 isothermal vessels in one system. Their Jacobian is block-diagonal, so sparse LU is ten times cheaper than dense, yet coupled, one step size serves all 17 and is set by the stiffest. Now each vessel takes its own step, and the vessels run on threads: 20 times Cantera becomes 3.3 times on one thread and 1.1 times on four (seulex, rtol 1e-8).",
    formula: String.raw`J = \mathrm{diag}(J_{1},\,J_{2},\,\ldots,\,J_{m})`,
    where: [
      { sym: "J", means: "Jacobian of the whole system", unit: "1/s" },
      { sym: "J_{k}", means: "Jacobian of vessel k alone, with zero blocks between vessels", unit: "1/s" },
      { sym: "\\mathrm{diag}", means: "block-diagonal matrix: the listed blocks on the diagonal, zeros elsewhere" },
      { sym: "J_{m}", means: "Jacobian of the last vessel, number m", unit: "1/s" },
      { sym: "m", means: "number of independent vessels (17 in nox02)" },
    ],
  },
  {
    n: 7,
    title: "Writing between steps: dense output",
    body: "An adaptive run takes long steps, but the file wants a fine write grid. Between step ends a cubic Hermite through the ends and their slopes turned a 1e-8 end difference into 1e-2 inside a stiff step, because the slope enters multiplied by \\(h\\). Each integrator now hands over its own polynomial, built from its stages.",
    formula: String.raw`y(t_w) \approx h_{00}\,y_{n} + h_{10}\,h\,f_{n} + h_{01}\,y_{n+1} + h_{11}\,h\,f_{n+1}`,
    where: [
      { sym: "y(t_w)", means: "the interpolated state at the write time" },
      { sym: "h_{00}, h_{10}, h_{01}, h_{11}", means: "the four cubic Hermite weights, polynomials in the fraction s of the step already elapsed" },
      { sym: "y_{n}", means: "accepted state at the start of the step" },
      { sym: "y_{n+1}", means: "accepted state at the end of the step" },
      { sym: "h", means: "the step", unit: "s" },
      { sym: "f_{n}", means: "right-hand side at the start of the step", unit: "1/s" },
      { sym: "f_{n+1}", means: "right-hand side at the end of the step", unit: "1/s" },
      { sym: "\\varepsilon_{\\mathrm{H}}", means: "size scale of the cubic Hermite defect on one step" },
    ],
    derivation: [
      { step: "The defect of a cubic on a mode with z = h times the eigenvalue size is of the order of z^4/384 times the solution scale; with 1e4 /s and 5e-5 s that is 1.6e-4.", eq: String.raw`\varepsilon_{\mathrm{H}} \approx \frac{(\lambda h)^{4}}{384}` },
    ],
    note: "Not error-controlled: the polynomial is checked after the step, never fed back into the step size (that would take 695 steps instead of 95). Declare solver { denseOutput hermite; } for the old cubic.",
  },
  {
    n: 8,
    title: "The journey of one day, as a method",
    body: "Measure before optimising. Profile before choosing what to change. Prove each speedup leaves every result byte for byte. Compare like with like. The sequence below is what happened, not what was planned.",
    note: "A speedup that changes results is not a speedup.",
  },
];

export const SC_LIMITS: readonly LessonLimit[] = [
  { id: "recorded", title: "Every table is a recorded run",
    body: "The page runs no case in your browser. The work counters come from an environment variable that a browser run cannot set, so the counts are recorded from native runs on 2026-11-22; the calculator in step 1 is arithmetic on this page." },
  { id: "one-mechanism", title: "One large mechanism",
    body: "The counts are for one 52-row mechanism at one temperature history (nox03). Another mechanism, with a sparser matrix, can move the dense and sparse comparison and the best integrator." },
  { id: "load", title: "Timings were taken on a shared machine",
    body: "Instruction counts are exact; seconds carry 10 to 20 % of noise from other work on the machine. Read the ratios, not the last digit." },
  { id: "morning", title: "The morning figure is quoted",
    body: "The 300-fold figure of the first day comes from the project log, before the tables were kept; it cannot be reproduced from this tree." },
  { id: "per-vessel", title: "Separate steps trade accuracy at equal tolerance",
    body: "With every vessel on its own step, the cold vessels are less accurate at the same rtol than when coupled; compare accuracy at the case's own atol, not the tolerance alone." },
];

// ---- the claims about Choupo, read back by the test -------------------------

const R = "docs/reviews/2026-11-22-";

/** Every file:line the page names, with a fragment that line must contain. */
export const CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "src/solver/ODE/ODEIntegrator.cpp", line: 101, contains: 'registerType("RK4"' },
  { file: "src/solver/ODE/ODEIntegrator.cpp", line: 107, contains: 'registerType("Rodas4"' },
  { file: "src/solver/ODE/ODEIntegrator.cpp", line: 110, contains: 'registerType("seulex"' },
  { file: "src/solver/ODE/Rosenbrock23.cpp", line: 611, contains: "const scalar pw     = rodas ? 0.25" },
  { file: "src/solver/ODE/Rosenbrock23.cpp", line: 620, contains: "= rodas ? 0.25 : 1.0 / (2.0 + std::sqrt(2.0))" },
  { file: "src/solver/ODE/Jacobian.cpp", line: 40, contains: "const scalar kSqrtEps" },
  { file: "src/solver/ODE/ODEJacobianAudit.H", line: 31, contains: "central difference" },
  { file: "src/unitOperations/batch/BatchReactor.cpp", line: 547, contains: "if (jacKey.empty()) jacobianAnalytic_ = allAnalytic;" },
  { file: "src/unitOperations/batch/BatchReactor.H", line: 384, contains: "kSparseAutoRows = 100" },
  { file: "src/solver/ODE/AdaptiveTimeStep.H", line: 259, contains: 'getenv("CHOUPO_ODE_STATS")' },
  { file: "src/solver/ODE/Seulex.H", line: 56, contains: "J is rebuilt only when theta" },
  { file: "src/applications/choupoBatch/main.cpp", line: 2373, contains: ": h00 * yPrev[u][i] + h10 * hTaken" },
  { file: "src/unitOperations/batch/BatchReactor.cpp", line: 149, contains: 'lookupScalarOrDefault("threads"' },
  { file: R + "seulex/README.md", line: 24, contains: "Cantera 2137 steps, 38 J, 239 factorisations" },
  { file: R + "seulex/README.md", line: 50, contains: "| Rodas4 | 1e-8 | 0.278" },
  { file: R + "seulex/README.md", line: 51, contains: "| seulex | 1e-8 | 0.203" },
  { file: R + "seulex/README.md", line: 30, contains: "A wrong Jacobian (80 %)" },
  { file: R + "sparselu-speed/README.md", line: 8, contains: "n = 52, 2145 of 2704 entries" },
  { file: R + "sparselu-speed/README.md", line: 39, contains: "| 382.6 k | 273.0 k |" },
  { file: R + "sparselu-speed/README.md", line: 58, contains: "| nox02 (17 vessels) | seulex | 7.41 G" },
  { file: R + "rhs-speed/README.md", line: 24, contains: "| base (c473-speed) | 277.6k | 23.3 | 60.0" },
  { file: R + "rhs-speed/README.md", line: 27, contains: "| 167.6k | 14.0 | 41.2" },
  { file: R + "rhs-speed/README.md", line: 29, contains: "kinetics alone 3.0 us" },
  { file: R + "fair-timing/README.md", line: 144, contains: "| nox03 | seulex | 1e-8 | 0.103 | 0.046 | 2.25 | 0.212 | 0.251 | 0.84" },
  { file: R + "fair-timing/README.md", line: 146, contains: "| nox02 | Rodas4 | 1e-8 | 1.576 | 0.043 | 36" },
  { file: R + "fair-timing/README.md", line: 168, contains: "| seulex | NEW | 1 396 M | 997 M | 519.5 M | 3065" },
  { file: R + "fair-timing/README.md", line: 183, contains: "`SparseLU::factor` (635 factorisations" },
  { file: R + "fair-timing/README.md", line: 209, contains: "| Rodas4 | 1e-8 | 1.181 (35.9x) | 0.202 (5.8x) | 0.122 (3.9x) | 0.101 (3.2x)" },
  { file: R + "fair-timing/README.md", line: 210, contains: "| Rodas4 | 1e-10 | 4.713 (64.5x) | 1.489 (22.6x) | 0.800 (12.2x)" },
  { file: R + "fair-timing/README.md", line: 211, contains: "| seulex | 1e-8 | 0.630 (20.1x) | 0.102 (3.3x) | 0.058 (1.7x) | 0.036 (1.1x)" },
  { file: R + "fair-timing/README.md", line: 212, contains: "| seulex | 1e-10 | 0.898 (14.5x) | 0.213 (3.8x) | 0.120 (1.7x) | 0.085 (1.7x)" },
  { file: R + "fair-timing/README.md", line: 217, contains: "Rodas4 1e-8 3.5e-4 (coupled 1.7e-4)" },
  { file: R + "fair-timing/README.md", line: 234, contains: "2.0e-3 per vessel at atol 1e-17 and 5.7e-4 per vessel at atol 1e-19" },
  { file: R + "dense-output/README.md", line: 32, contains: "Controlling it took 695 accepted" },
  { file: R + "dense-output/README.md", line: 44, contains: "| seulex 1e-8 | 4.0e-2 / 4.0e-2 | 2.4e-4 / 6.8e-5 |" },
  { file: R + "dense-output/README.md", line: 47, contains: "| Rodas4 1e-8 | 1.9e-4 / 6.1e-5 | 6.1e-5 / 6.1e-5 |" },
  { file: R + "dense-output/README.md", line: 75, contains: "4.0e-2 → 6.8e-5" },
  { file: "src/unitOperations/batch/BatchReactor.cpp", line: 172, contains: 'lookupWordOrDefault("denseOutput", "integrator")' },
  { file: R + "densesparse/README.md", line: 26, contains: "grid dev 7.67e-3" },
  { file: R + "densesparse/README.md", line: 29, contains: "seulex: dense grid 4.0e-2" },
  { file: R + "densesparse/README.md", line: 31, contains: "amplifies a round-off-size change by ~1e5" },
  { file: R + "densesparse/README.md", line: 66, contains: "The integrators' own dense output" },
  { file: "docs/reviews/2026-11-20-openfoam-chemistry-comparison/REPORT.md", line: 53, contains: "fall-off T and concentration terms compiled OUT" },
];

/** Case directories the page names; each must exist and carry a controlDict. */
export const SC_CASES: readonly string[] = [
  "tutorials/batch/combustion/ignition01_h2o2",
  "tutorials/batch/combustion/ignition01_h2o2_rk4",
  "tutorials/batch/combustion/ignition01_h2o2_eulersi",
  "tutorials/batch/combustion/ignition01_h2o2_seulex",
  "tutorials/batch/combustion/nox03_millerbowman_large",
  "tutorials/batch/combustion/nox02_millerbowman_denox",
];

/** Theory Guide labels the page names; each must exist in docs/theoryGuide.tex. */
export const SC_LABELS: readonly string[] = [
  "ch:stiff-ode", "sec:batch-vessels-separate", "sec:batch-analytic-jacobian", "sec:sparse-lu", "sec:seulex", "sec:batch-dense-output",
];

// ---- the quiz ---------------------------------------------------------------

/** Seven questions, each answerable from the page.  A number a question
 *  quotes is one the page prints: a recorded run (marked "engine") or the
 *  page's own arithmetic (marked "page").  C158. */
export const SC_QUIZ: readonly QuizQuestion[] = [
  {
    id: "rk4-limit", steps: [1],
    q: "The fast radicals have long since settled, yet the explicit RK4 step is still held down.  By step 1, what holds it?",
    options: [
      "The accuracy of the temperature, which needs small steps",
      "The stability function: RK4 needs h|λ| ≤ 2.785 for the Jacobian's largest eigenvalue, even after that mode has died",
      "The size of the write grid in the output file",
      "The number of reactions in the mechanism",
    ],
    correct: 1,
    feedback: "An explicit method must keep h|λ| inside its stability region whatever the solution is doing: the step follows the fastest mode, not the accuracy.  The recorded ignition01 runs show the cost: with RK4 the step drove n_HO2 negative at t = 2 µs and the run stopped, and EulerSI, stable but only first order, gave up inside its first 1 µs step (step 1).",
    origins: ["page", "engine"],
  },
  {
    id: "jacobian-wrong", steps: [2],
    q: "What does the page's Robertson example say about an approximate or wrong Jacobian in an implicit method?",
    options: [
      "It changes the answer by a large amount, so the run is useless",
      "It makes no difference, because the step controller corrects it",
      "It costs steps before it costs the answer: 8724 steps against 117 for the same y1 to 5e-9",
      "It makes the run faster, because a diagonal matrix is cheaper to factor",
    ],
    correct: 2,
    feedback: "The error control looks at the solution, not at the matrix, so a poor Jacobian slows the convergence of each step and the controller pays in smaller steps.  Only when the matrix is about 50 % wrong is the damping lost and the run stops.  That is why Choupo audits its analytic Jacobian against a central difference at the 1st, 2nd, 4th, ... build (step 2).",
    origins: ["engine"],
  },
  {
    id: "sparse-gain", steps: [3],
    q: "Why does a sparse LU gain only 1.07 times on nox03 but 9.9 times on nox02?",
    options: [
      "nox03 has more species, so its matrix is larger",
      "The sparse code is only compiled for nox02",
      "nox02 runs with a tighter tolerance",
      "nox03's matrix is 79 % full, so there are few zeros to skip, while nox02's 17 independent vessels make a block-diagonal matrix that is mostly zeros",
    ],
    correct: 3,
    feedback: "A sparse factorisation saves exactly the work on zeros.  nox03 has 2145 of 2704 entries in its pattern, and L + U holds 94 % of the dense count, so little is saved.  nox02's Jacobian is a block per vessel with zero blocks between them, so the saving is large (step 3).",
    origins: ["engine"],
  },
  {
    id: "step-counts", steps: [4],
    q: "On nox03 the tolerance goes from 1e-6 to 1e-10.  Rodas4's accepted steps go from 201 to 3568; seulex's from 88 to 113.  Why do they scale so differently?",
    options: [
      "Rodas4 is fourth order, so its step shrinks as the tolerance to the power 1/4; seulex raises its order instead, so its step count barely moves",
      "seulex ignores the tolerance",
      "Rodas4 recomputes the Jacobian less often",
      "Both are the same method with a different name",
    ],
    correct: 0,
    feedback: "A fixed-order method buys accuracy with smaller steps; an extrapolation method buys it with higher order and a few more sub-steps.  That is why seulex is five times faster at 1e-10 (0.268 s against 1.196 s) but no faster at 1e-6, where it pays many factorisations per big step (step 4).",
    origins: ["engine"],
  },
  {
    id: "like-with-like", steps: [5, 8],
    q: "Integration alone takes Choupo 2.25 times Cantera on nox03 (seulex), yet end to end the ratio is 0.84.  What is the page's lesson?",
    options: [
      "Choupo is slower than Cantera, and the end-to-end figure is a mistake",
      "The two figures answer different questions: end to end includes Python's import of Cantera (0.15 s) and the start-up of each program, so a comparison must say what it compares",
      "Cantera's integrator is not stiff",
      "Choupo's right-hand side costs 3 µs, which is why it wins",
    ],
    correct: 1,
    feedback: "Python's import cantera alone costs 0.15 s, so a comparison of whole processes flatters nobody: integration only, and end to end, are different questions.  Choupo's own right-hand side costs 14.0 µs per call against 3.0 µs for Cantera's kinetics alone, which is where the 2.25 comes from (steps 5 and 8).",
    origins: ["engine"],
  },
  {
    id: "vessel-steps", steps: [6],
    q: "In nox02 the 17 vessels are coupled in one system.  Why does giving each vessel its own step (20.1 times Cantera becomes 3.3 times on one thread, seulex rtol 1e-8) help?",
    options: [
      "The Jacobian becomes denser",
      "Coupled, one step size serves all 17 vessels and is set by the stiffest; separately, the cold vessels take the big steps they can",
      "The tolerance is relaxed for the cold vessels",
      "The threads make each vessel faster",
    ],
    correct: 1,
    feedback: "The Jacobian is block-diagonal, but a coupled run still shares one step.  Separate steps remove that coupling and threads add the rest (1.1 times on four).  The price is accuracy: at equal rtol the cold vessels are less accurate, so the case's atol decides the result (step 6).",
    origins: ["engine"],
  },
  {
    id: "dense-output", steps: [7],
    q: "Every step end agreed to 1e-8, yet a cubic Hermite write grid was off by 4.0e-2 for seulex.  What was wrong, and what fixed it?",
    options: [
      "The step ends were wrong and the grid was right",
      "The write grid was too coarse and needed more points",
      "The cubic carries the slope multiplied by h, which a stiff step amplifies; each integrator now hands over its own polynomial, and the seulex grid error falls to 6.8e-5",
      "The tolerance was set too loose",
    ],
    correct: 2,
    feedback: "The defect of a cubic on a stiff mode scales as (λh)^4/384, so a small slope error becomes a large error between the ends.  The integrators' own dense output brings the seulex grid from 4.0e-2 to 6.8e-5.  It is not error-controlled: the step size does not see it (step 7).",
    origins: ["engine", "page"],
  },
];
