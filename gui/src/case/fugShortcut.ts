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
  fugShortcut -- the two witnesses, the override maps and the readers behind the
  Fenske-Underwood-Gilliland EduTool.

  ZERO PHYSICS IN TYPESCRIPT, and here that is not a slogan but the whole
  design.  Fenske, Underwood's theta and the Gilliland (Molokanov) correlation
  are all in `src/unitOperations/distillation/ShortcutColumn.cpp`; this module
  never evaluates one of them.  What it does is pose questions and read answers:

    * it writes a reflux factor into a declared dict scalar and reads back the
      `N_min`, `R_min`, `theta` and `N_theoretical` KPIs the engine published;
    * it writes a stage count into a declared dict scalar of a RIGOROUS column
      and reads back the `x_D_LK` the engine published.

  There is no `Math.log`, `Math.exp` or `Math.pow` anywhere in this file, and
  tests/fugShortcutTool.test.ts reads the source to keep it that way -- a
  correlation re-evaluated in the view would silently stop being the engine's
  answer the day the engine's changed.

  ------------------------------------------------------------------------
  THE COMPARABILITY PROTOCOL -- how the shortcut and the rigorous column are
  made to answer the SAME question.

  The owner's lesson is the juxtaposition: "shortcut prediction: N stages /
  rigorous MESH: M stages", and it teaches nothing at all unless the two are
  solving one problem.  They are two DIFFERENT tutorials, specified in two
  different ways, so the tie has to be made explicitly and stated on screen.

  What the two witnesses already share, unmodified:

    * the same feed -- 100 kmol/h, 50/50 benzene/toluene, at 1 atm;
    * the same thermophysical system -- both `constant/thermoPhysPropDict`
      files declare gamma-phi with `activityModel ideal;` and
      `fugacityModel idealGas;` (Raoult), so the K-values are the same
      function of T and P in both runs;
    * the same feed quality -- q = 1, saturated liquid (the shortcut reads
      vf = 0 from its own `0/feed`, the rigorous column declares
      `feedQuality 1.0;`).

  What this module ties, and why each tie is needed:

    1. `recoveryHK = 1 - recoveryLK`.  A shortcut column is specified by the two
       key RECOVERIES and answers with a distillate rate; a rigorous column is
       specified by the distillate RATE and answers with purities.  For a 50/50
       binary feed this one tie makes the two specifications the same
       specification: D = F(z_LK r_LK + z_HK r_HK) = F/2 = 50 kmol/h, which is
       exactly the rate `column02_simultaneous` already declares, and then
       x_D,LK = F z_LK r_LK / D = r_LK identically.  So the shortcut's RECOVERY
       target and the rigorous column's PURITY readout are the same number, for
       any recovery the reader dials in, with no arithmetic in between.
       This is also why the feed composition is NOT a knob: 50/50 is what makes
       the tie hold, and a feed knob would quietly break it.

    2. The rigorous column runs at the reflux ratio the SHORTCUT returned (its
       `R` KPI), not at its own authored 2.0.  R is an input to Gilliland and an
       input to MESH; leaving them different would compare two columns at two
       reflux ratios and call the difference a method error.

    3. The rigorous ladder places its feed by the shortcut's OWN Kirkbride
       answer, carried as a FRACTION of the column: `feed_stage /
       N_theoretical`, both engine KPIs, rounded to a tray and clamped into the
       range the MESH solver accepts (2 .. nStages-1).  Feed placement changes a
       column's purity, so it cannot be left to differ; taking the fraction from
       Kirkbride rather than putting the feed at the middle keeps the choice the
       engine's.  (For a symmetric split the two coincide -- Kirkbride returns
       exactly 0.5 -- which is a coincidence of this case, not a general rule.)

  THE STAGE-COUNT CONVENTION, established by measurement rather than assumed.
  A shortcut N and a rigorous `nStages` are only comparable if they count the
  same things.  Run at near-total reflux (R = 1000) the rigorous column reaches
  the 99 % / 99 % products at nStages = 11, and Fenske's N_min for the same
  separation is 10.07 -- so `nStages` is the same count Fenske uses, with no
  offset, and the comparison is stage-for-stage.  The near-total-reflux end of
  the reflux-factor knob reproduces that check live, which is the point of
  letting it go to 8 x R_min: the reader can watch the two counts meet where
  Gilliland stops being involved.

  WHAT IS DELIBERATELY NOT DONE.  The rigorous ladder is a WINDOW of integer
  stage counts around the shortcut's answer, and the crossing is the smallest
  count in that window whose published x_D reaches the target.  It is not a
  root-find and not an interpolation: stages are integers, so the answer is a
  table lookup over real engine runs, and when the crossing is not inside the
  window the tool SAYS the window missed it rather than extrapolating.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { DictOverride } from "./methodRun.js";
import type { SeriesPoint } from "./engineSeries.js";

// ---- The two witnesses ------------------------------------------------------

/** The SHORTCUT witness: the bundled FUG tutorial, benzene/toluene, keys
 *  benzene (LK) / toluene (HK), `refluxFactor` = R/R_min. */
export const FUG_SHORTCUT_WITNESS = "steady/distillation/shortcut01_benzene_toluene";

/** The RIGOROUS witness: the SAME separation solved by the simultaneous MESH
 *  Newton (`model simultaneous;`).  Chosen over `column01` (Wang-Henke) for one
 *  reason that matters in a browser: it converges quadratically in 5-10
 *  iterations where the bubble-point sweep needs O(100), and this tool solves a
 *  dozen of them per knob turn. */
export const FUG_RIGOROUS_WITNESS = "steady/distillation/column02_simultaneous";

// ---- Knobs ------------------------------------------------------------------

export interface FugKnobValues {
  /** Fraction of the feed light key that must leave in the distillate.  The
   *  heavy-key recovery is tied to it (see the header): r_HK = 1 - r_LK. */
  recoveryLK: number;
  /** Operating reflux as a multiple of the Underwood minimum, R/R_min.  The
   *  shortcut dict's `refluxFactor`. */
  refluxFactor: number;
  /** Rigorous ladder: how many stage counts to try BELOW the shortcut's N. */
  ladderBelow: number;
  /** Rigorous ladder: how many stage counts to try ABOVE the shortcut's N. */
  ladderAbove: number;
}

/** The witness's own authored values, so the tool opens ON the tutorial: 99 %
 *  of the benzene to the top, 1 % of the toluene, R = 1.3 R_min.  Overriding
 *  with these leaves the shortcut dicts byte-identical (pinned by the test). */
export const FUG_KNOB_DEFAULTS: FugKnobValues = {
  recoveryLK: 0.99,
  refluxFactor: 1.3,
  ladderBelow: 6,
  ladderAbove: 4,
};

/** The reflux-factor abscissa of the N(R) construction: an AUTHORED list, not a
 *  generated one.  A geometric grid would need a logarithm, and this file
 *  carries none; a hand-picked list is also the honest shape here, because the
 *  interesting structure is bunched just above R_min (where N runs away) and
 *  the tail only has to show the approach to N_min. */
export const REFLUX_FACTOR_LADDER: readonly number[] =
  [1.02, 1.05, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.5, 3.5, 5.0, 8.0];

// ---- Override maps ----------------------------------------------------------
//  Each key was verified UNIQUE in its witness file against the real bundled
//  raw text (tests/fugShortcutTool.test.ts resolves every one of them);
//  applyScalarOverride THROWS on a missing or ambiguous key, so a witness edit
//  that breaks a knob fails the suite rather than the classroom.

/** Bring a knob value back to a decimal a dict should carry.
 *
 *  A slider at step 0.005 hands out 0.9450000000000001, and `1 - 0.99` is
 *  0.010000000000000009 -- both would be written verbatim into a tutorial dict,
 *  which is ugly, unreadable in the "copy this case" hand-off, and enough to
 *  make "the defaults leave the witness byte-identical" false.  Six decimals is
 *  finer than any knob here and coarser than the noise. */
const dictValue = (v: number): number => Number(v.toFixed(6));

/** The shortcut column at one reflux factor.  `recoveryHK` is written as well
 *  as `recoveryLK` because the tie between them IS the comparability protocol
 *  -- leaving the witness's authored 0.01 in place while the reader moves
 *  `recoveryLK` would silently unpin the distillate rate. */
export function shortcutOverrides(
  k: FugKnobValues, refluxFactor: number,
): DictOverride[] {
  return [
    { file: "system/flowsheetDict", key: "recoveryLK",
      value: dictValue(k.recoveryLK) },
    { file: "system/flowsheetDict", key: "recoveryHK",
      value: dictValue(1 - k.recoveryLK) },
    { file: "system/flowsheetDict", key: "refluxFactor",
      value: dictValue(refluxFactor) },
  ];
}

/** The rigorous MESH column at one stage count, at the reflux the shortcut
 *  returned.  `distillateRate` is NOT written: the witness already declares
 *  50 kmol/h, which is what the recovery tie pins it to. */
export function rigorousOverrides(
  nStages: number, feedStage: number, refluxRatio: number,
): DictOverride[] {
  return [
    { file: "system/flowsheetDict", key: "nStages", value: Math.round(nStages) },
    { file: "system/flowsheetDict", key: "feedStage", value: Math.round(feedStage) },
    // NOT rounded: R is the SHORTCUT'S OWN ANSWER being carried across, not a
    // knob a reader dialled.  Trimming it would make the two columns run at
    // slightly different refluxes, which is the one difference this protocol
    // exists to remove.
    { file: "system/flowsheetDict", key: "refluxRatio", value: refluxRatio },
  ];
}

/** The shortcut series: one point per reflux factor, with the reader's own
 *  operating factor inserted in order (and never duplicated). */
export function shortcutSeries(k: FugKnobValues): SeriesPoint[] {
  const factors = [...REFLUX_FACTOR_LADDER];
  if (!factors.some((f) => Math.abs(f - k.refluxFactor) < 1e-9))
    factors.push(k.refluxFactor);
  factors.sort((a, b) => a - b);
  return factors.map((f) => ({
    label: `R/R_min = ${f}`,
    overrides: shortcutOverrides(k, f),
  }));
}

// ---- Readers ----------------------------------------------------------------
//  Activation by PUBLISHED KPI rather than by unit name: the two witnesses call
//  their units "column" and "column01", and a tool that hardcodes those names
//  breaks the day a case is renamed.  The predicate is the KPI bag's own shape.

export interface ShortcutAnswer {
  unit: string;
  /** Fenske: minimum stages at total reflux. */
  Nmin: number;
  /** Underwood: minimum reflux ratio. */
  Rmin: number;
  /** Underwood: the root theta between the two key volatilities. */
  theta: number;
  /** Gilliland: the stage count at the operating reflux. */
  N: number;
  /** The operating reflux ratio the engine used. */
  R: number;
  /** Kirkbride: the feed stage, counted from the top. */
  feedStage: number;
  /** The relative volatility the shortcut froze, at the feed bubble point. */
  alpha: number;
  /** Distillate light-key mole fraction (= the declared recovery, under the
   *  tie in this file's header). */
  xD_LK: number;
  /** Distillate molar flow, in whatever unit the engine published (SI). */
  D: number;
}

/** Read the ONE shortcut column out of a run, or null if the run has none. */
export function readShortcutAnswer(r: RunResult | null): ShortcutAnswer | null {
  if (!r?.kpis) return null;
  for (const [unit, bag] of Object.entries(r.kpis)) {
    const need = ["N_min", "R_min", "N_theoretical", "R", "theta",
      "feed_stage", "alpha_LK_HK", "x_D_LK", "D"];
    if (!need.every((key) => typeof bag[key] === "number")) continue;
    return {
      unit,
      Nmin: bag["N_min"]!, Rmin: bag["R_min"]!, theta: bag["theta"]!,
      N: bag["N_theoretical"]!, R: bag["R"]!, feedStage: bag["feed_stage"]!,
      alpha: bag["alpha_LK_HK"]!, xD_LK: bag["x_D_LK"]!, D: bag["D"]!,
    };
  }
  return null;
}

export interface RigorousAnswer {
  unit: string;
  nStages: number;
  feedStage: number;
  R: number;
  /** Distillate light-key mole fraction. */
  xD_LK: number;
  /** Bottoms heavy-key mole fraction. */
  xB_HK: number;
  /** Reboiler duty [kW], when the run published one. */
  Qreboiler?: number;
  /** MESH Newton iterations, when published. */
  iterations?: number;
}

/** Read the ONE rigorous column out of a run, or null if the run has none.
 *  The predicate deliberately requires `nStages` AND `x_D_LK` and forbids
 *  `N_theoretical`: a shortcut run must never be read as a rigorous one. */
export function readRigorousAnswer(r: RunResult | null): RigorousAnswer | null {
  if (!r?.kpis) return null;
  for (const [unit, bag] of Object.entries(r.kpis)) {
    if (typeof bag["N_theoretical"] === "number") continue;
    const need = ["nStages", "feedStage", "R", "x_D_LK", "x_B_HK"];
    if (!need.every((key) => typeof bag[key] === "number")) continue;
    const a: RigorousAnswer = {
      unit,
      nStages: bag["nStages"]!, feedStage: bag["feedStage"]!, R: bag["R"]!,
      xD_LK: bag["x_D_LK"]!, xB_HK: bag["x_B_HK"]!,
    };
    if (typeof bag["Q_reboiler_kW"] === "number") a.Qreboiler = bag["Q_reboiler_kW"];
    if (typeof bag["iterations"] === "number") a.iterations = bag["iterations"];
    return a;
  }
  return null;
}

/** The engine's own record that this column is a declared approximation.  The
 *  tool RENDERS this verdict; it never writes one of its own (the engine's
 *  words are in ShortcutColumn.cpp, and the contract is
 *  docs/design/problem-divergence-contract.md). */
export function shortcutDivergences(r: RunResult | null) {
  return (r?.divergences ?? []).filter((d) => d.kind === "declaredApproximation");
}

// ---- The rigorous ladder ----------------------------------------------------

/** The integer stage counts to try, bracketing the shortcut's answer.
 *
 *  `Math.ceil` on the shortcut's N is the only rounding in this file that
 *  touches a stage count, and it is not an approximation of anything: a column
 *  has a whole number of trays, and 21.59 theoretical stages means you build
 *  22.  Counts below 2 are dropped -- the MESH solver needs a feed stage
 *  strictly between the condenser and the bottom. */
export function stageWindow(
  Nshortcut: number, below: number, above: number,
): number[] {
  if (!(Nshortcut > 0)) return [];
  const centre = Math.ceil(Nshortcut);
  const lo = Math.max(3, centre - Math.max(0, Math.round(below)));
  const hi = centre + Math.max(0, Math.round(above));
  const out: number[] = [];
  for (let n = lo; n <= hi; ++n) out.push(n);
  return out;
}

/** Where the feed goes on a ladder rung, from the shortcut's own Kirkbride
 *  answer carried as a fraction of the column.  Clamped to the range the MESH
 *  solver accepts (2 .. nStages-1); it REFUSES nothing, because a clamp here
 *  is a topology bound, not a physical claim -- and the clamp only ever binds
 *  on columns of three or four stages. */
export function feedStageFor(nStages: number, fraction: number): number {
  const f = Number.isFinite(fraction) && fraction > 0 && fraction < 1
    ? fraction : 0.5;
  const raw = Math.round(f * nStages);
  return Math.min(Math.max(raw, 2), Math.max(2, nStages - 1));
}

/** The Kirkbride feed fraction the engine published, as a fraction of the
 *  column: `feed_stage / N_theoretical`.  Both are KPIs; this is a ratio of two
 *  engine answers, never a correlation re-evaluated. */
export function kirkbrideFraction(a: ShortcutAnswer): number {
  return a.N > 0 ? a.feedStage / a.N : 0.5;
}

/** The rigorous series: one MESH solve per stage count in the window. */
export function rigorousSeries(
  window: readonly number[], fraction: number, refluxRatio: number,
): SeriesPoint[] {
  return window.map((n) => ({
    label: `N = ${n}`,
    overrides: rigorousOverrides(n, feedStageFor(n, fraction), refluxRatio),
  }));
}

export interface LadderRung {
  nStages: number;
  feedStage: number;
  xD_LK: number;
  xB_HK: number;
  Qreboiler?: number;
}

/** The ladder as drawn: the rungs the engine actually answered, in order. */
export function ladderRungs(results: readonly (RunResult | null)[]): LadderRung[] {
  const out: LadderRung[] = [];
  for (const r of results) {
    const a = readRigorousAnswer(r);
    if (!a) continue;
    const rung: LadderRung = {
      nStages: a.nStages, feedStage: a.feedStage,
      xD_LK: a.xD_LK, xB_HK: a.xB_HK,
    };
    if (a.Qreboiler !== undefined) rung.Qreboiler = a.Qreboiler;
    out.push(rung);
  }
  out.sort((a, b) => a.nStages - b.nStages);
  return out;
}

export interface Crossing {
  /** The smallest stage count in the ladder whose published x_D reaches the
   *  target, or null when no rung in the window did. */
  nStages: number | null;
  /** True when the ladder's LOWEST rung already met the target -- so the real
   *  answer may be lower still and the window is the wrong window. */
  belowWindow: boolean;
  /** True when NO rung met the target: the answer is above the window. */
  aboveWindow: boolean;
}

/** The stage count at which the rigorous column first reaches the target
 *  distillate purity.  A TABLE LOOKUP over engine answers -- no interpolation
 *  (a column cannot have 20.4 stages) and no extrapolation: a window that does
 *  not contain the crossing says so, and the caller says so on screen. */
export function ladderCrossing(
  rungs: readonly LadderRung[], target: number,
): Crossing {
  if (rungs.length === 0)
    return { nStages: null, belowWindow: false, aboveWindow: false };
  const hit = rungs.find((r) => r.xD_LK >= target);
  if (!hit) return { nStages: null, belowWindow: false, aboveWindow: true };
  return {
    nStages: hit.nStages,
    belowWindow: hit.nStages === rungs[0]!.nStages,
    aboveWindow: false,
  };
}
