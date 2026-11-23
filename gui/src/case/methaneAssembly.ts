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
  methaneAssembly -- the pure module behind the EduTool `methane-assembly`,
  "Assemble methane combustion".

  The page runs SEVEN shipped cases of tutorials/batch/combustion (one
  Petersen, Davidson and Hanson 1999 shock-tube point, the same vessel in each,
  only the reaction sets differ) and reads what the engine wrote: the
  trajectory, the ignition-delay line of the run's log, the final amounts and
  the sensitivity KPIs.  Nothing here computes a rate or a delay: it names the
  witnesses, reads the engine's output, and does the arithmetic of a ratio.

  TWO DATA FILES, both written by
  docs/reviews/2026-11-22-methane-lesson/make_points.py and held to their
  sources by gui/tests/methaneAssembly.test.ts:
    * methaneAssemblyChain.json  -- each stage's reactions (the library record,
      the label the case uses, the printed equation and page);
    * methaneAssemblyPoints.json -- the 31 Petersen points of the two nitrogen
      mixtures, each run under four models (the review's scans) beside the
      measured delay.
\*---------------------------------------------------------------------------*/

import type { TrajectoryData } from "../adapters/SolverAdapter.js";
import chainData from "./methaneAssemblyChain.json";
import pointsData from "./methaneAssemblyPoints.json";

/** One rung of the ladder: a shipped case and the sets it reads. */
export interface Stage {
  id: "core" | "attack" | "methyl" | "formyl" | "carbonMonoxide" | "ethane";
  /** The shipped case, by its name in the bundled corpus (tutorials/<witness>). */
  witness: string;
  /** What the page calls the rung. */
  title: string;
  /** The reaction sets the case lists, in the order it lists them. */
  sets: readonly string[];
  /** The species the rung makes, and which the page plots. */
  watch: readonly string[];
}

export const STAGES: readonly Stage[] = [
  { id: "core", witness: "batch/combustion/methane01_h2o2_core", title: "the H2/O2 core alone",
    sets: ["OConaire2004"], watch: ["CH4", "O2"] },
  { id: "attack", witness: "batch/combustion/methane02_ch4_attack", title: "+ the attack on CH4",
    sets: ["OConaire2004", "MB1989_attack"], watch: ["CH4", "CH3"] },
  { id: "methyl", witness: "batch/combustion/methane03_methyl", title: "+ the methyl step",
    sets: ["OConaire2004", "MB1989_attack", "MB1989_methyl"], watch: ["CH4", "CH3", "HCHO"] },
  { id: "formyl", witness: "batch/combustion/methane04_formyl", title: "+ CH2O to CO",
    sets: ["OConaire2004", "MB1989_attack", "MB1989_methyl", "MB1989_formyl"],
    watch: ["CH4", "HCHO", "CO"] },
  { id: "carbonMonoxide", witness: "batch/combustion/methane05_c1_chain", title: "+ CO to CO2: the C1 chain",
    sets: ["OConaire2004", "MB1989_attack", "MB1989_methyl", "MB1989_formyl", "MB1989_carbonMonoxide"],
    watch: ["CH4", "CO", "CO2"] },
  { id: "ethane", witness: "batch/combustion/methane06_assembled", title: "+ two CH3 make ethane: assembled",
    sets: ["OConaire2004", "MillerBowman1989"], watch: ["CH4", "CO", "CO2", "ethane"] },
];

/** The sensitivity witness: the assembled case with the sensitivity block. */
export const SENSITIVITY_WITNESS = "batch/combustion/methane07_sensitivity";
export const METHANE_BINARY = "choupoBatch" as const;
export const VESSEL = "vessel";

/** The Petersen, Davidson and Hanson 1999 point every case starts from:
 *  Table 1 mixture 2 (3 CH4 + 2 O2 + 10 N2), Table 2 (p. 86). */
export const PETERSEN = { mixture: "2", P_atm: 114.4, T_K: 1244, measured_us: 254 } as const;

// ---- the chain data ---------------------------------------------------------

export interface ChainReaction {
  label: string; equation: string; page: number; record: string; reaction: string;
}
export interface ChainStage {
  id: string; label: string; sets: string[]; reactions: ChainReaction[];
}
export const CHAIN: readonly ChainStage[] = (chainData as { stages: ChainStage[] }).stages;

/** The reactions a rung adds (its own set), and every reaction up to and including it. */
export function addedBy(id: Stage["id"]): readonly ChainReaction[] {
  return CHAIN.find((c) => c.id === id)?.reactions ?? [];
}
export function reactionsUpTo(id: Stage["id"]): readonly ChainReaction[] {
  const order = STAGES.map((s) => s.id);
  const k = order.indexOf(id);
  return order.slice(0, k + 1).flatMap((s) => addedBy(s));
}
/** The printed equation of a reaction label (A8, R1_H_O2_O_OH ...), or the label itself. */
export function equationOf(label: string): string {
  for (const c of CHAIN) for (const r of c.reactions) if (r.label === label) return r.equation;
  return label;
}
/** The rung that adds a reaction. */
export function stageOfReaction(label: string): string | null {
  for (const c of CHAIN) if (c.reactions.some((r) => r.label === label)) return c.id;
  return null;
}

// ---- reading a run -----------------------------------------------------------

/** The engine's ignition delay, s: the `tau_ign (max dT/dt)` line of the run's log
 *  (choupoBatch main.cpp prints it when the temperature rose by more than 200 K). */
export function tauOfLog(log: string): number | null {
  const m = /tau_ign \(max dT\/dt\) = ([0-9.eE+-]+) s/.exec(log);
  return m ? Number(m[1]) : null;
}

/** One column of the trajectory (the amount of a species, kmol, or the temperature). */
export function column(traj: TrajectoryData, what: string): number[] | null {
  const v = traj.vars[what === "T" ? `${VESSEL}.T` : `${VESSEL}.n_${what}`];
  return v && v.length === traj.t.length ? [...v] : null;
}

/** The amounts at the end of a run, kmol, of the species the trajectory carries. */
export function finalAmounts(traj: TrajectoryData): { [sp: string]: number } {
  const out: { [sp: string]: number } = {};
  for (const k of Object.keys(traj.vars)) {
    const m = /^vessel\.n_(.+)$/.exec(k);
    if (m) out[m[1]!] = traj.vars[k]![traj.t.length - 1]!;
  }
  return out;
}

/** The temperature at the end of a run, K. */
export function finalT(traj: TrajectoryData): number | null {
  const T = column(traj, "T");
  return T ? T[T.length - 1]! : null;
}

// ---- the sensitivity -----------------------------------------------------------

export interface SensRow { label: string; equation: string; stage: string | null; S: number; }

/** The sensitivity coefficients the engine pinned in the run's KPIs (`sens_S_<label>`), sorted by
 *  |S|, with the equation of each label and the rung that adds it. */
export function sensitivityRows(kpis: { [key: string]: number } | undefined): SensRow[] {
  if (!kpis) return [];
  return Object.entries(kpis)
    .filter(([k]) => k.startsWith("sens_S_"))
    .map(([k, S]) => {
      const label = k.slice("sens_S_".length);
      return { label, equation: equationOf(label), stage: stageOfReaction(label), S };
    })
    .sort((a, b) => Math.abs(b.S) - Math.abs(a.S));
}

// ---- the comparison with the measurement ----------------------------------------

export interface PetersenPoint {
  mixture: string; P_atm: number; T_K: number; measured_us: number;
  aramco_us: number; millerBowmanFull_us: number; c1Chain_us: number; assembled_us: number;
}
export const POINTS: readonly PetersenPoint[] = (pointsData as unknown as { points: PetersenPoint[] }).points;

export type ModelKey = "aramco_us" | "millerBowmanFull_us" | "c1Chain_us" | "assembled_us";

/** Geometric mean of tau_model / tau_other over the points, and the multiplicative scatter
 *  exp(sd of the logs): the ratio a modeller quotes for a quantity that spans decades. */
export function ratioStats(
  pts: readonly PetersenPoint[], a: ModelKey, b: ModelKey | "measured_us",
): { mean: number; scatter: number; lo: number; hi: number; n: number } {
  const r = pts.map((p) => p[a] / p[b]);
  const l = r.map(Math.log);
  const m = l.reduce((s, x) => s + x, 0) / l.length;
  const sd = Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, l.length - 1));
  return { mean: Math.exp(m), scatter: Math.exp(sd), lo: Math.min(...r), hi: Math.max(...r), n: r.length };
}

/** The point of the shipped cases inside the table. */
export function shippedPoint(): PetersenPoint | undefined {
  return POINTS.find((p) => p.mixture === PETERSEN.mixture && p.P_atm === PETERSEN.P_atm
    && p.T_K === PETERSEN.T_K);
}
