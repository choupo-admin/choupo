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
  columnDesign -- the recorded engine runs behind the "Designing a column for a
  real mixture" EduTool, and the page's arithmetic over them.

  ZERO PHYSICS IN TYPESCRIPT.  Every number that is a result of the column --
  the reflux that meets a fixed specification at each stage count, the
  reboiler duty, the designed diameter, the Turton cost of the five items, the
  Fenske and Underwood limits and the Gilliland curve of the shortcut -- is a
  number the engine printed, read from `columnDesignRecorded.json`, which
  `bin/curate/c501_column_design_table.py` writes by running `choupoSolve`
  (a designSpec around a `model simultaneous` column, once per stage count).
  What this module does is ARITHMETIC the page owns and says so:

    * the lever rule (a mass balance of a two-product split),
    * the annualised cost: a capital-recovery factor times the engine's
      installed cost, plus the engine's utility prices times the engine's
      duties, with the energy price a knob,
    * the position of the minimum of that sum over the recorded stage counts,
    * the gaps between the shortcut's limits and the rigorous ones.

  There is no Math.log, Math.exp or Math.pow here except the capital-recovery
  factor's (1 + i)^n, and tests/columnDesign.test.ts holds every number the
  page prints to this record.
\*---------------------------------------------------------------------------*/

import recorded from "./columnDesignRecorded.json";

export type SystemId = "ew" | "bt";

export interface DesignPoint {
  N: number;
  feedStage: number;
  R: number;
  D_kmolh: number;
  xD: number;
  xB: number;
  Qreb_kW: number;
  Qcond_kW: number;
  diameter_m: number;
  nTrays: number;
  capex_EUR: { condenser: number; reboiler: number; shell: number; trays: number;
    refluxDrum: number; total: number };
  reboilerUtility: { utility: string; EUR_per_h: number; duty_kW: number; EUR_per_kWh: number };
  condenserUtility: { utility: string; EUR_per_h: number };
}

export interface FailedPoint { N: number; failed: true; why: string }

export interface ShortcutRecord {
  recoveryLK: number;
  recoveryHK: number;
  Nmin: number;
  Rmin: number;
  theta: number;
  alpha: number;
  curve: { refluxFactor: number; R: number; N: number; feedStage: number | null }[];
}

export interface TxyRecord {
  P: number;
  components: string[];
  xBubble: number[];
  Tbubble: number[];
  yDew: number[];
  Tdew: number[];
  azeotropeX: number | null;
}

export interface SystemRecord {
  spec: { xD: number; xB: number };
  feedFraction: number;
  curve: (DesignPoint | FailedPoint)[];
  nMin: number | null;
  shortcut: ShortcutRecord;
  txy: TxyRecord | null;
}

export interface SpecRow {
  xD: number;
  Nbig: number | null;
  xB: number;
  rigorousR_atNbig: number | null;
  rigorousNmin: number | null;
  fugRmin: number | null;
  fugNmin: number | null;
  fugAlpha: number | null;
}

export interface Recorded {
  R_MAX: number;
  N_BIG: number;
  systems: Record<SystemId, SystemRecord>;
  specs: { Nbig: number; rows: SpecRow[] };
}

export const RECORD = recorded as unknown as Recorded;

/** The system's record. */
export function systemRecord(id: SystemId): SystemRecord {
  return RECORD.systems[id];
}

/** The recorded points the designSpec CONVERGED on, in stage-count order. */
export function designCurve(id: SystemId): DesignPoint[] {
  return systemRecord(id).curve
    .filter((p): p is DesignPoint => !("failed" in p))
    .sort((a, b) => a.N - b.N);
}

// ---- the page's own arithmetic ----------------------------------------------------

/** Lever rule of a two-product split: D/F = (z - x_B)/(x_D - x_B), all in the
 *  light key's mole fraction.  NaN when the products are the same stream. */
export function leverD(z: number, xD: number, xB: number): number {
  return xD === xB ? Number.NaN : (z - xB) / (xD - xB);
}

/** The light key's mole fraction of the feed of each system, from its record's
 *  own recoveries: z = (D x_D)/(F r_LK) with D/F from the lever rule is
 *  circular, so the feed is stated where the page states the feed. */
export const FEED: Record<SystemId, { z: number; F_kmolh: number; label: string; lk: string; hk: string }> = {
  ew: { z: 0.30, F_kmolh: 100, label: "ethanol / water (NRTL)", lk: "ethanol", hk: "water" },
  bt: { z: 0.50, F_kmolh: 100, label: "benzene / toluene (ideal)", lk: "benzene", hk: "toluene" },
};

/** Is a distillate of mole fraction xD (light key) reachable by a simple column
 *  from this mixture?  For a binary, only if it does not lie beyond an
 *  azeotrope: the azeotrope is the engine's bubble-curve crossing, recorded. */
export function distillateReachable(id: SystemId, xD: number): boolean {
  const az = systemRecord(id).txy?.azeotropeX ?? null;
  return az === null ? xD <= 1 : xD <= az;
}

/** Capital-recovery factor: the fraction of an installed cost charged each year
 *  for `years` at interest `rate`.  (1 + i)^n is the page's only power. */
export function capitalRecovery(rate: number, years: number): number {
  if (rate <= 0) return 1 / years;
  const g = Math.pow(1 + rate, years);
  return (rate * g) / (g - 1);
}

export const HOURS_PER_YEAR = 8000;

export interface CostKnobs {
  /** Price of the heat the reboiler takes, EUR per kWh of duty. */
  energyPrice: number;
  /** Annual charge on the installed cost, per year (capital-recovery factor). */
  capitalCharge: number;
}

export interface CostRow {
  N: number;
  R: number;
  capital: number;
  energy: number;
  cooling: number;
  total: number;
}

/** Annualised cost of one recorded point, EUR per year:
 *  capital = f_c * C_installed (the engine's total-module of the five items),
 *  energy  = Q_reb * h * p_E, cooling = the engine's condenser utility bill. */
export function annualCost(p: DesignPoint, k: CostKnobs): CostRow {
  const capital = k.capitalCharge * p.capex_EUR.total;
  const energy = p.Qreb_kW * HOURS_PER_YEAR * k.energyPrice;
  const cooling = p.condenserUtility.EUR_per_h * HOURS_PER_YEAR;
  return { N: p.N, R: p.R, capital, energy, cooling, total: capital + energy + cooling };
}

/** The recorded point of least annual cost (the optimum over the stage counts
 *  the engine was run at; the page says it is a grid, not a root). */
export function costOptimum(id: SystemId, k: CostKnobs): CostRow | null {
  const rows = designCurve(id).map((p) => annualCost(p, k));
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (b.total < a.total ? b : a));
}

/** The shortcut's limits against the rigorous ones, as the page prints them. */
export interface LimitGap {
  fugRmin: number;
  rigorousRmin: number;      // the engine's R at the largest recorded N (an upper bound of R_min)
  fugNmin: number;
  rigorousNmin: number;
  rRatio: number;            // rigorous / FUG
  nRatio: number;            // rigorous / FUG
}

export function limitGap(id: SystemId): LimitGap | null {
  const s = systemRecord(id);
  const curve = designCurve(id);
  const last = curve[curve.length - 1];
  if (!last || s.nMin === null) return null;
  return {
    fugRmin: s.shortcut.Rmin, rigorousRmin: last.R,
    fugNmin: s.shortcut.Nmin, rigorousNmin: s.nMin,
    rRatio: last.R / s.shortcut.Rmin, nRatio: s.nMin / s.shortcut.Nmin,
  };
}
