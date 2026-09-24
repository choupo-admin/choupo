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
  wegsteinMath — TWO PLANES, and the split is the same one BodeTool states in
  its own header, for the same reason.

  PLANE A, THE MEASURED ONE, IS THE ENGINE'S.  `recycleSolver Wegstein;` in a
  case's `system/solverDict` puts the flowsheet's recycle on the accelerator
  (src/unitOperations/flowsheet/Flowsheet.cpp:3322), and the engine publishes
  the per-iteration PHYSICAL residuals — the recycle mass and energy imbalance
  as a fraction of what enters the plant — as convergence curves named
  "Mass balance (global)" and "Energy balance (global)"
  (src/applications/choupoSolve/main.cpp:289-292).  This module contributes
  NOTHING to that plane but the dict overrides that ask for it and arithmetic
  on the engine's own published numbers.  It evaluates no physics.

  PLANE B, THE TRANSPARENT ONE, IS THE RECURSION ITSELF, and it is here
  because THE ENGINE DOES NOT PUBLISH IT.  `Wegstein::lastQ()` exists and is
  commented "for logging" (src/solver/Wegstein.H:86-87); nothing in the
  recycle loop prints it, and the iteration table's own `γ-info` column
  carries the energy-tear relative change instead
  (src/unitOperations/flowsheet/Flowsheet.cpp:3373-3374).  So there is no run,
  in this tree, from which a student can read the per-variable secant slope
  `s_i` or the coefficient `q_i` that it produces — and those two numbers ARE
  the method.  The page therefore drives the recursion over a DECLARED toy
  fixed point where every quantity is visible, and says in those words that
  the toy is not a Choupo model.

  WHAT MAKES THE TOY LEGITIMATE RATHER THAN A SECOND HOME.  `wegsteinStep`
  below is a transcription of `Wegstein::step`
  (src/solver/Wegstein.cpp:49-92), line for line including both degeneracy
  guards and their literal epsilons, and it is pinned against
  hand-computable values in tests/wegsteinMath.test.ts.  What it is applied
  TO is a two-variable linear map this module declares in full — no
  thermodynamics, no unit operation, nothing the engine could disagree with.
  A linear map is also the one case where the comparison the page is for can
  be made exactly: Newton on the tear residual solves a linear fixed point in
  a SINGLE step at any coupling, and Wegstein's two scalar secants do not.

  THE QUESTION THIS PAGE WAS BUILT TO ANSWER, in the owner's own words: how
  does one accelerator serve a tear vector that holds a molar flow AND a
  temperature?  The answer is that it never compares them.  Wegstein here is
  COMPONENT-WISE (src/solver/Wegstein.cpp:67-86): each entry of the vector
  gets its own secant slope and its own coefficient, and the secant
  `s_i = (g_i^k − g_i^{k−1}) / (x_i^k − x_i^{k−1})` is a ratio of two
  differences IN THE SAME UNIT, so it is dimensionless — and invariant under
  any affine rescaling of that variable.  Re-express the temperature in
  degrees Celsius or the flow in kmol/h and every `s_i`, every `q_i` and the
  whole trajectory are unchanged.  `rescale` below exists to let a reader
  check that on screen rather than take it on trust.

  AND THE PRICE, which is the other half and must not blur.  The STOPPING
  TEST is a different question from the STEP, and it does not share the step's
  invariance.  The Wegstein branch converges on `normL2(gx, x)`
  (src/unitOperations/flowsheet/Flowsheet.cpp:3348, the norm itself at
  :2043-2052) over the packed tear vector `[F, z_0..z_{nC-1}, T]`
  (src/unitOperations/flowsheet/Flowsheet.cpp:1988-1999, renormalised onto the
  simplex on the way back at src/unitOperations/flowsheet/Flowsheet.cpp:2036)
  — a plain Euclidean norm over a flow in kmol/s, mole fractions and a
  temperature in kelvin, with no per-variable scale.  The Newton branch of the
  same function does NOT do this: it tears on component molar flows plus T
  (src/unitOperations/flowsheet/Flowsheet.cpp:3419-3428) and divides each
  residual by a characteristic scale
  (src/unitOperations/flowsheet/Flowsheet.cpp:3469-3482, applied at
  src/unitOperations/flowsheet/Flowsheet.cpp:3492), and its own comment names
  what the absence of that scaling costs — "the latent under-convergence the
  old Wegstein default also had"
  (src/unitOperations/flowsheet/Flowsheet.cpp:3467-3468).

  NOT HERE, deliberately: any tear-SELECTION heuristic (that is the
  tear-streams page, and the engine deliberately does not choose either), any
  fit of a loop gain to a real flowsheet, and any claim that the toy's
  iteration counts predict a real case's.  The real case is one click away and
  runs its own answer.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";

// ---- The transcription -----------------------------------------------------

/** The two literal guards of `Wegstein::step`, with the engine's own values
 *  and the engine's own names (src/solver/Wegstein.cpp:64-65).  They are not
 *  decoration: `epsX` is why a variable that has not moved keeps `q = 0`
 *  instead of dividing by zero, and `epsS` is why a map that is locally a
 *  pure translation (`g ≈ x + c`, slope exactly 1, no fixed point in sight
 *  along that direction) is left to direct substitution instead of being
 *  extrapolated to infinity. */
export const EPS_X = 1.0e-14;
export const EPS_S = 1.0e-10;

/** The engine's RECYCLE clamp defaults — read off the solverDict with these
 *  fallbacks at src/unitOperations/flowsheet/Flowsheet.cpp:3328-3329.
 *
 *  They are NOT the defaults of the `Wegstein` class, which are [-5, 0]
 *  (src/solver/Wegstein.H:73-74) and which the Theory Guide quotes as
 *  "typical" (§ch:wegstein, eq:wegstein-clip).  The recycle loop constructs
 *  the accelerator with its own pair, so a Choupo recycle that declares
 *  nothing runs at q_min = -1: at most a 50/50 blend of the current iterate
 *  and its image, never the six-fold reach [-5, 0] allows.  Two numbers for
 *  one knob, in two places, and only one of them is what a flowsheet gets. */
export const RECYCLE_QMIN_DEFAULT = -1.0;
export const RECYCLE_QMAX_DEFAULT = 0.0;

/** One variable's answer within one Wegstein step, kept apart so the table can
 *  draw the reason a coefficient is what it is instead of only its value. */
export interface VariableStep {
  /** The secant slope, or null when no slope was formed (first call, or the
   *  variable did not move by more than EPS_X). */
  s: number | null;
  /** s/(s-1) before the clamp, or null when no slope was formed. */
  qRaw: number | null;
  /** The coefficient actually used. */
  q: number;
  /** Why q is what it is — the branch of Wegstein::step that produced it. */
  why: "no history" | "did not move" | "slope ~ 1" | "clamped" | "secant";
  next: number;
}

/** Component-wise Wegstein, transcribed from `Wegstein::step`
 *  (src/solver/Wegstein.cpp:49-92).  `prev` is null on the first call, which
 *  is the engine's `ncalls_ == 0` branch (:53-62): no history, so the step IS
 *  direct substitution and every q is recorded as 0.
 *
 *  The loop never reads a variable other than `i` — that is the whole of the
 *  answer to "how does it handle a flow and a temperature at once". */
export function wegsteinStep(
  x: readonly number[], gx: readonly number[],
  prev: { x: readonly number[]; gx: readonly number[] } | null,
  qMin: number, qMax: number,
): VariableStep[] {
  const out: VariableStep[] = [];
  for (let i = 0; i < x.length; ++i) {
    const xi = x[i] ?? 0;
    const gi = gx[i] ?? 0;
    if (!prev) {
      out.push({ s: null, qRaw: null, q: 0, why: "no history", next: gi });
      continue;
    }
    const dx = xi - (prev.x[i] ?? 0);
    const dg = gi - (prev.gx[i] ?? 0);
    if (Math.abs(dx) < EPS_X) {
      out.push({ s: null, qRaw: null, q: 0, why: "did not move", next: gi });
      continue;
    }
    const s = dg / dx;
    if (Math.abs(s - 1) < EPS_S) {
      out.push({ s, qRaw: null, q: 0, why: "slope ~ 1", next: gi });
      continue;
    }
    const qRaw = s / (s - 1);
    const q = Math.min(Math.max(qRaw, qMin), qMax);
    out.push({
      s, qRaw, q,
      why: q !== qRaw ? "clamped" : "secant",
      next: q * xi + (1 - q) * gi,
    });
  }
  return out;
}

/** The engine's tear convergence measure for the Wegstein branch: a PLAIN
 *  Euclidean norm of `G(x) − x` over the packed vector, no per-variable
 *  scale (src/unitOperations/flowsheet/Flowsheet.cpp:2052-2061, called at
 *  :3339).  Named after the engine's own function so the page and the source
 *  cannot drift into two names for one thing. */
export function normL2(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; ++i) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

// ---- The declared toy map --------------------------------------------------

/** THE TOY, STATED IN FULL.  Two tear variables chosen to carry the mismatch
 *  of magnitude and unit that the owner's question is about:
 *
 *      x = [ F , T ]        F in kmol/s, of order 1e-4;  T in K, of order 360
 *
 *  and a LINEAR image, written in SCALED coordinates u = (x − x*)/scale so
 *  that one dimensionless number governs each direction:
 *
 *      u_F <- a·u_F + c·u_T
 *      u_T <- c·u_F + b·u_T
 *
 *  `a` and `b` are the per-variable loop gains a real recycle would have (how
 *  much of a disturbance in the assumed flow survives one pass round the
 *  loop); `c` is the COUPLING — how much a disturbance in one variable comes
 *  back as a disturbance in the other.  A real recycle's G is neither linear
 *  nor symmetric; this one is both, because the point of the page is to watch
 *  a mechanism and not to imitate a plant.
 *
 *  What linearity buys, and it is the reason it was chosen: for a linear G,
 *  Newton on r(x) = G(x) − x lands on the fixed point EXACTLY in one step,
 *  whatever `c` is.  So every iteration Wegstein spends beyond the first is
 *  the price of using two scalar secants where Newton uses a 2x2 Jacobian —
 *  and the reader can turn `c` and watch that price appear. */
export interface ToyMap {
  /** Per-variable loop gain, |a| < 1 for a contracting direction. */
  a: number;
  b: number;
  /** Off-diagonal coupling, in the same scaled coordinates. */
  c: number;
}

/** The fixed point and the scales the toy is written about.  DECLARED here,
 *  in one place, because a magnitude quoted in prose and used in arithmetic
 *  is two homes for one number. */
export const TOY_F_STAR = 2.0e-4;     // kmol/s
export const TOY_T_STAR = 360.0;      // K
export const TOY_F_SCALE = 1.0e-4;    // kmol/s — the size of a disturbance
export const TOY_T_SCALE = 20.0;      // K
/** The author's seed: a rough guess, deliberately not close. */
export const TOY_F_SEED = 1.0e-4;     // kmol/s
export const TOY_T_SEED = 320.0;      // K

export const TOY_DEFAULTS: ToyMap = { a: 0.85, b: 0.55, c: 0.0 };

/** The toy's state: exactly two numbers, so the tuple is the honest type. */
export type Vec2 = readonly [number, number];

const scaled = (x: Vec2): Vec2 => [
  (x[0] - TOY_F_STAR) / TOY_F_SCALE,
  (x[1] - TOY_T_STAR) / TOY_T_SCALE,
];

/** One pass round the toy loop: the flowsheet sweep's stand-in, G(x). */
export function toyG(m: ToyMap, x: Vec2): Vec2 {
  const u = scaled(x);
  return [
    TOY_F_STAR + (m.a * u[0] + m.c * u[1]) * TOY_F_SCALE,
    TOY_T_STAR + (m.c * u[0] + m.b * u[1]) * TOY_T_SCALE,
  ];
}

/** The eigenvalues of the scaled map.  A symmetric 2x2, so both are real and
 *  the closed form is exact.
 *
 *  This is published rather than hidden because it decides whether a run that
 *  fails is Wegstein's fault or the problem's: when the larger |eigenvalue|
 *  reaches 1 the loop is no longer a contraction and DIRECT SUBSTITUTION
 *  diverges too.  A page that let a reader crank the coupling into that
 *  region and then blamed the accelerator would be teaching a falsehood. */
export function toyEigenvalues(m: ToyMap): [number, number] {
  const mid = (m.a + m.b) / 2;
  const rad = Math.hypot((m.a - m.b) / 2, m.c);
  return [mid + rad, mid - rad];
}

export function toySpectralRadius(m: ToyMap): number {
  const e = toyEigenvalues(m);
  return Math.max(Math.abs(e[0]), Math.abs(e[1]));
}

// ---- Driving the three solvers over the toy --------------------------------

export interface Iterate {
  k: number;
  x: Vec2;
  gx: Vec2;
  /** Per-variable detail; empty for the solvers that have none. */
  vars: VariableStep[];
  /** normL2(G(x), x) — the engine's own Wegstein convergence measure, in SI. */
  deltaL2: number;
  /** The same norm with the variables re-expressed in the display units, so
   *  the page can put the two side by side.  Equal to `deltaL2` in SI. */
  deltaL2Display: number;
  /** True distance to the known fixed point, scaled per variable, so the
   *  semilog plot compares like with like.  Available only because the toy's
   *  answer is declared; a real case has no such number, and the page says so. */
  errScaled: number;
}

export interface SolveTrace {
  iterates: Iterate[];
  converged: boolean;
  /** Why it stopped: met the tolerance, hit the cap, or left the map's basin. */
  stop: "converged" | "cap" | "diverged";
}

const errScaled = (x: Vec2): number => {
  const u = scaled(x);
  return Math.hypot(u[0], u[1]);
};

/** Unit systems the page can re-express the tear vector in.  NONE of these is
 *  a switch the engine has: Choupo packs the tear in canonical SI always
 *  (kmol/s and K — src/streams/ProcessStream.H:78).  They exist so a reader
 *  can ask what a DIFFERENT choice would have done to the two numbers on this
 *  page, and find that it moves the stopping test and not the step. */
export interface DisplayUnits {
  id: "si" | "kmolPerHour" | "celsius";
  label: string;
  /** Multiplier and offset applied to each variable: value_display = m·v + o. */
  scale: [number, number];
  offset: [number, number];
  names: [string, string];
}

export const DISPLAY_UNITS: readonly DisplayUnits[] = [
  { id: "si", label: "SI - kmol/s, K (what the engine packs)",
    scale: [1, 1], offset: [0, 0], names: ["kmol/s", "K"] },
  { id: "kmolPerHour", label: "flow in kmol/h",
    scale: [3600, 1], offset: [0, 0], names: ["kmol/h", "K"] },
  { id: "celsius", label: "temperature in °C",
    scale: [1, 1], offset: [0, -273.15], names: ["kmol/s", "°C"] },
];

export function rescale(x: Vec2, u: DisplayUnits): Vec2 {
  return [x[0] * u.scale[0] + u.offset[0], x[1] * u.scale[1] + u.offset[1]];
}

const SI: DisplayUnits = {
  id: "si", label: "SI - kmol/s, K (what the engine packs)",
  scale: [1, 1], offset: [0, 0], names: ["kmol/s", "K"],
};

/** How far the iterate is allowed to run before the page calls it divergence.
 *  Generous: a scaled error of 1e6 is a hundred thousand disturbance-widths
 *  away from the answer, which no recovering iteration passes through. */
const DIVERGED = 1.0e6;

interface DriveOptions {
  qMin: number;
  qMax: number;
  tol: number;
  maxIter: number;
  units?: DisplayUnits;
}

/** WEGSTEIN — the accelerator, driven exactly as `Flowsheet`'s recycle branch
 *  drives it (src/unitOperations/flowsheet/Flowsheet.cpp:3330-3390): pack,
 *  sweep, measure `normL2(gx, x)`, test, then accelerate and unpack.  The
 *  test comes BEFORE the acceleration, which is why a converged run's last
 *  recorded step has no coefficients: the loop broke out of it. */
export function driveWegstein(m: ToyMap, o: DriveOptions): SolveTrace {
  const units = o.units ?? SI;
  const iterates: Iterate[] = [];
  let x: Vec2 = [TOY_F_SEED, TOY_T_SEED];
  let prev: { x: Vec2; gx: Vec2 } | null = null;
  for (let k = 0; k < o.maxIter; ++k) {
    const gx = toyG(m, x);
    const deltaL2 = normL2(gx, x);
    const vars = wegsteinStep(x, gx, prev, o.qMin, o.qMax);
    iterates.push({
      k, x, gx, vars,
      deltaL2,
      deltaL2Display: normL2(rescale(gx, units), rescale(x, units)),
      errScaled: errScaled(x),
    });
    if (deltaL2 < o.tol) return { iterates, converged: true, stop: "converged" };
    if (!Number.isFinite(deltaL2) || errScaled(x) > DIVERGED)
      return { iterates, converged: false, stop: "diverged" };
    prev = { x, gx };
    x = [vars[0]?.next ?? x[0], vars[1]?.next ?? x[1]];
  }
  return { iterates, converged: false, stop: "cap" };
}

/** DIRECT SUBSTITUTION — the same loop with the accelerator switched off.
 *  It is not a separate method in the engine: it is what the Wegstein branch
 *  DOES when `recycleWegsteinQmin` and `Qmax` are both 0, because the clamp
 *  interval collapses to {0} and every coefficient is forced to it. */
export function driveDirect(m: ToyMap, o: DriveOptions): SolveTrace {
  return driveWegstein(m, { ...o, qMin: 0, qMax: 0 });
}

/** NEWTON on the tear residual r(x) = G(x) − x, over the toy's own 2x2
 *  Jacobian.  The toy's G is linear, so the Jacobian is exact and constant
 *  and ONE step lands on the fixed point whatever the coupling — which is the
 *  measurement the page exists to make.
 *
 *  This is the toy's arithmetic and NOT a model of the engine's Newton
 *  branch, which builds its Jacobian by CENTRAL finite differences over the
 *  tear variables — two full flowsheet sweeps per variable
 *  (Theory Guide §ch:newton-tears) — and tears on component molar flows
 *  rather than on (F, z, T)
 *  (src/unitOperations/flowsheet/Flowsheet.cpp:3419-3428).  The cost per step
 *  is the whole reason Wegstein is still on offer, and no toy can show it. */
export function driveNewton(m: ToyMap, o: DriveOptions): SolveTrace {
  const units = o.units ?? SI;
  const iterates: Iterate[] = [];
  let x: Vec2 = [TOY_F_SEED, TOY_T_SEED];
  //  dG/dx in the SCALED coordinates is [[a, c], [c, b]]; in the natural
  //  coordinates each entry is multiplied by (scale of the row / scale of the
  //  column).  J = dG/dx - I.
  const rF = TOY_F_SCALE, rT = TOY_T_SCALE;
  const j00 = m.a - 1;
  const j01 = m.c * rF / rT;
  const j10 = m.c * rT / rF;
  const j11 = m.b - 1;
  const det = j00 * j11 - j01 * j10;
  for (let k = 0; k < o.maxIter; ++k) {
    const gx = toyG(m, x);
    const deltaL2 = normL2(gx, x);
    iterates.push({
      k, x, gx, vars: [],
      deltaL2,
      deltaL2Display: normL2(rescale(gx, units), rescale(x, units)),
      errScaled: errScaled(x),
    });
    if (deltaL2 < o.tol) return { iterates, converged: true, stop: "converged" };
    if (!Number.isFinite(det) || Math.abs(det) < 1e-300)
      return { iterates, converged: false, stop: "diverged" };
    const r0 = gx[0] - x[0], r1 = gx[1] - x[1];
    //  Solve J dx = -r by Cramer's rule (2x2; the engine uses Gauss with
    //  partial pivoting for the general case).
    const dx0 = (-r0 * j11 + r1 * j01) / det;
    const dx1 = (-r1 * j00 + r0 * j10) / det;
    x = [x[0] + dx0, x[1] + dx1];
    if (errScaled(x) > DIVERGED)
      return { iterates, converged: false, stop: "diverged" };
  }
  return { iterates, converged: false, stop: "cap" };
}

// ---- Plane A: the engine run ------------------------------------------------

/** The recycle witness.  `process03_recycle` is the classic
 *  reactor–separator–recycle architecture: a mixer, a CSTR, an isothermal
 *  flash and a splitter, with `recycle` declared as the tear.  It is the case
 *  the Theory Guide's own bug story is about (§ch:newton-tears, "Why the
 *  residual must be relative"), four components, and it solves in
 *  milliseconds — so a reader can turn the solver over and watch the answer
 *  stay put while the path to it changes. */
export const WEGSTEIN_WITNESS = "steady/flowsheets/process03_recycle";

/** Its `system/solverDict` as shipped: the file the overrides below edit. */
export const WITNESS_SOLVER_DICT = "system/solverDict";

export type RecycleSolver = "Newton" | "Wegstein";

export interface RecycleKnobs {
  solver: RecycleSolver;
  /** `recycleTol` — the tear tolerance the outer loop converges on. */
  tol: number;
  /** `recycleMaxIter` — the cap; exceeding it is a FAILED solve, not a
   *  warning (src/unitOperations/flowsheet/Flowsheet.cpp:3194-3199). */
  maxIter: number;
}

export const RECYCLE_DEFAULTS: RecycleKnobs = {
  solver: "Newton", tol: 1e-5, maxIter: 120,
};

/** The four scalars and one word this page writes into the witness, and
 *  nothing else.  Each is a key the shipped case already declares, so the
 *  same edits made by hand in the case directory give the same answer.
 *
 *  WHAT IS NOT HERE, and it is the knob the owner asked for: the clamp.
 *  `recycleWegsteinQmin` / `Qmax` are read by the engine
 *  (src/unitOperations/flowsheet/Flowsheet.cpp:3328-3329) but this witness
 *  carries them COMMENTED OUT, and an override replaces a declared value — it
 *  does not add a key.  Measured on the corpus (2026-09-12): of the ten cases
 *  that select `recycleSolver Wegstein`, only two declare the clamp live, one
 *  converges in a single iteration and the other is insensitive to it.  So
 *  the clamp is driven on the transparent recursion above, where every
 *  coefficient it acts on is visible anyway, and this plane drives the
 *  choice of solver.  A case declaring the clamp live would let this plane
 *  drive it too; that is a tutorials change, not a GUI one. */
export function recycleOverrides(k: RecycleKnobs): DictOverride[] {
  return [
    { file: WITNESS_SOLVER_DICT, key: "recycleSolver", word: k.solver },
    { file: WITNESS_SOLVER_DICT, key: "recycleTol", value: k.tol, unit: "" },
    { file: WITNESS_SOLVER_DICT, key: "recycleMaxIter", value: k.maxIter,
      unit: "" },
  ];
}

/** The tear the witness declares, named here so the page and the override
 *  cannot disagree about which stream it is talking about. */
export const WITNESS_TEAR = "recycle";

/** Pull the engine's own per-iteration recycle residual out of a finished
 *  run.  These are the PHYSICAL curves — the tear mass and energy imbalance
 *  divided by a plant-inlet scale — which the engine computes precisely
 *  because the solvers' own `|Δtear|` mixes flows and temperatures into one
 *  dimensionless figure and it wanted two curves a student recognises
 *  (src/unitOperations/flowsheet/Flowsheet.cpp:2066-2071).
 *
 *  The engine already refuses to show a reader the mixed norm on this plot.
 *  Returning null rather than an empty array keeps "the run published no
 *  curve" distinguishable from "the curve was flat". */
export function recycleResidual(
  convergence: readonly { label: string; residuals: number[] }[] | undefined,
  which: "mass" | "energy",
): number[] | null {
  const want = which === "mass"
    ? "Mass balance (global)" : "Energy balance (global)";
  const hit = convergence?.find((c) => c.label === want);
  return hit && hit.residuals.length > 0 ? [...hit.residuals] : null;
}
