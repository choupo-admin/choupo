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
  loopPlacementMath -- the arithmetic of "Where to put a control loop"
  (DEV.md 4c C204).

  WHAT IS HERE AND WHAT IS NOT.  Three small pieces of classical arithmetic
  and nothing that is the engine's:

    * the count of control degrees of freedom (valves against variables),
    * the relative gain array of a 2x2 (Bristol 1966), computed from a gain
      matrix the CALLER hands in,
    * the rule that turns a gain and a residence time into PI gains.

  THE GAIN MATRIX IS NEVER TYPED.  It is Delta y / Delta u measured on three
  runs of choupoCtrl (a base and one step in each manipulated input), read by
  `stateFromKpis` off the published result.  Nothing in this file models the
  reactor: no rate law, no heat balance, no liquid volume.  The page's closed
  loop pairings are runs of the same case with its controllers replaced
  (loopPlacementCase.ts); what they converge to, or fail to, is the engine's.

  The tuning recipe (`piFromGain`) is the page's own ASSUMPTION and is labelled
  so: half a unit of loop gain, an integral time of 300 s, one third of the
  vessel's 1000 s residence time.  It is not a tuning method; it only gives
  every pairing the same treatment so the difference between them is the
  pairing's.
\*---------------------------------------------------------------------------*/

// ---- the witness and the experiment's constants ------------------------------

/** The shipped two-loop reactor this page re-wires (tutorials/ctrl). */
export const LOOP_WITNESS = "ctrl/ctrl22_reactor_level_and_temperature";

/** The base operating point of the gain experiment: jacket temperature [K]
 *  and feed rate [kmol/s].  The level loop is closed in every run. */
export const BASE_TJ_K = 345;
export const BASE_F_KMOL_S = 1.0e-3;
/** The steps: small enough that the gains do not move by more than a few
 *  percent with the step size (measured: lambda 1.87 at these steps against
 *  2.02 at five times the step). */
export const STEP_TJ_K = 2;
export const STEP_F_KMOL_S = 2.0e-5;
/** Run lengths [s]: long enough for the open-loop steady state (the open runs
 *  reach it well inside 30000 s), and for the closed pairings to settle. */
export const OPEN_END_S = 30000;
export const CLOSED_END_S = 20000;
/** The set points of the closed pairings: temperature [K] and mole fraction of
 *  the product.  The vessel starts at 340 K and a mole fraction of 0.5. */
export const SP_T_K = 335;
export const SP_X = 0.40;

/** The PI recipe: loop gain K * Kp and integral time. */
export const LOOP_GAIN = 0.5;
export const TAU_I_S = 300;

// ---- what a run publishes -----------------------------------------------------

/** The four numbers the page reads from a run of the reactor. */
export interface LoopState {
  /** reactor.T_final [K] */
  T: number;
  /** product mole fraction, n_2Butanol / (n_2Butanol + n_2Methyl1Propanol) */
  x: number;
  /** reactor.level_final [m] */
  level: number;
  /** reactor.F_in_final [kmol/s] */
  F: number;
}

type Kpis = { [unit: string]: { [key: string]: number } } | undefined;

/** Read the state from a result's KPIs, or null when the run published none
 *  (a refused run has no result: the caller shows the engine's message). */
export function stateFromKpis(kpis: Kpis): LoopState | null {
  const r = kpis?.["reactor"];
  if (!r) return null;
  const a = r["n_2Methyl1Propanol_final"], b = r["n_2Butanol_final"];
  const T = r["T_final"], level = r["level_final"], F = r["F_in_final"];
  if ([a, b, T, level, F].some((v) => v === undefined || !Number.isFinite(v)))
    return null;
  const x = b! / (a! + b!);
  return { T: T!, x, level: level!, F: F! };
}

// ---- the gain matrix and the RGA ---------------------------------------------

/** Steady-state gains; rows are the controlled variables (T, x), columns the
 *  manipulated ones (T_jacket, F_in):  K = [[dT/dTj, dT/dF], [dx/dTj, dx/dF]]. */
export interface Gain2 { K11: number; K12: number; K21: number; K22: number }

/** K_ij = Delta y_i / Delta u_j on a base run and one step in each input
 *  (Seborg et al. 2017, Eq. 18-38; all other inputs held, level loop closed). */
export function gainsFromRuns(
  base: LoopState, jacketStep: LoopState, feedStep: LoopState,
  dTj: number, dF: number,
): Gain2 {
  return {
    K11: (jacketStep.T - base.T) / dTj,
    K21: (jacketStep.x - base.x) / dTj,
    K12: (feedStep.T - base.T) / dF,
    K22: (feedStep.x - base.x) / dF,
  };
}

/** lambda_11 of a 2x2 (Seborg 18-34).  Infinite when K11 K22 = K12 K21 (the
 *  matrix is singular: the two outputs cannot be set independently). */
export function lambda11(K: Gain2): number {
  const ratio = (K.K12 * K.K21) / (K.K11 * K.K22);
  return 1 / (1 - ratio);
}

/** The RGA of a 2x2: the diagonal pairing (y1-u1, y2-u2) has lambda, the
 *  swapped pairing 1 - lambda (Seborg 18-35: rows and columns sum to one). */
export function rga2(K: Gain2): { diag: number; swapped: number } {
  const l = lambda11(K);
  return { diag: l, swapped: 1 - l };
}

/** The same array by the general formula Lambda = K o (K^-1)^T (Seborg
 *  18-36/18-37), for a 2x2: the test holds the two routes equal. */
export function rgaSchur(K: Gain2): [[number, number], [number, number]] {
  const det = K.K11 * K.K22 - K.K12 * K.K21;
  //  K^-1 = (1/det) [[K22, -K12], [-K21, K11]];  H = (K^-1)^T
  const H = [[K.K22 / det, -K.K21 / det], [-K.K12 / det, K.K11 / det]];
  return [[K.K11 * H[0]![0]!, K.K12 * H[0]![1]!],
          [K.K21 * H[1]![0]!, K.K22 * H[1]![1]!]];
}

export type Verdict = "good" | "interacting" | "weak" | "wrong";

/** What the array says about ONE pairing with relative gain `lam`.
 *  Bristol's recommendation: pair so that relative gains are positive and as
 *  close to one as possible (Seborg p. 334); a negative gain is refused
 *  (p. 335, remark 3: instability in the loop or in the whole system). */
export function verdict(lam: number): Verdict {
  if (!(lam > 0)) return "wrong";
  if (lam < 0.5) return "weak";
  if (lam <= 1.2) return "good";
  return "interacting";
}

/** The best of the two pairings by the recommendation: the diagonal one when
 *  its relative gain is at least one half (Seborg p. 334), else the swapped. */
export function recommendedPairing(K: Gain2): "diagonal" | "swapped" {
  return lambda11(K) >= 0.5 ? "diagonal" : "swapped";
}

// ---- PI gains for a loop ------------------------------------------------------

/** Kp and Ki for a loop whose process gain is `K` (engine units): Kp K = 0.5
 *  (times `scale`, which the page leaves at 1 and the tests vary),
 *  Ki = Kp / 300 s.  The sign follows K because the engine's PID acts on
 *  e = SP - PV (src/control/PIDController.cpp:125): a negative gain needs a
 *  negative Kp, exactly as the shipped level loop has. */
export function piFromGain(K: number, scale = 1): { Kp: number; Ki: number } {
  const Kp = (LOOP_GAIN * scale) / K;
  return { Kp, Ki: Kp / TAU_I_S };
}

// ---- degrees of freedom -------------------------------------------------------

/** A place where a control valve can go.  `line` is the pipe or utility it is
 *  on: two valves on the SAME line are one degree of freedom, not two
 *  (Seborg et al. 2017, Sec. 13.1.1, Fig. 13.1: streams that split or merge
 *  cannot all be set; a second valve in series sets nothing new). */
export interface ValveSite { id: string; label: string; line: string }

export const VALVE_SITES: readonly ValveSite[] = [
  { id: "feed", label: "a valve on the feed line", line: "feed" },
  { id: "feed2", label: "a second valve in series on the feed line", line: "feed" },
  { id: "out", label: "a valve on the product line", line: "product" },
  { id: "jacket", label: "the jacket's utility valve", line: "utility" },
];

/** A variable one may want to hold, and whether it is a valve's own flow. */
export interface HeldVariable { id: string; label: string; why: string }

export const HELD_VARIABLES: readonly HeldVariable[] = [
  { id: "level", label: "the liquid level", why: "an inventory: it integrates, so it must be held" },
  { id: "T", label: "the reactor temperature", why: "a constraint and, here, the quality's lever" },
  { id: "x", label: "the product composition", why: "the quality" },
  { id: "Fout", label: "a set product flow", why: "a rate target" },
];

export interface DofCount {
  /** independent valves: distinct lines carrying at least one valve */
  valves: number;
  /** variables to hold */
  held: number;
  /** valves - held: >= 0 means the demand can be met, < 0 it cannot */
  spare: number;
}

/** N_FC from the chosen sites (Seborg 13-2 with the General Rule: N_FC is the
 *  number of independent manipulated inputs; the feed's own state is the
 *  disturbance). */
export function countDof(sites: readonly string[], held: readonly string[]): DofCount {
  const lines = new Set(
    VALVE_SITES.filter((s) => sites.includes(s.id)).map((s) => s.line));
  const valves = lines.size;
  return { valves, held: held.length, spare: valves - held.length };
}
