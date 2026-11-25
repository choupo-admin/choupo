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
  dryingBalance -- the PURE helpers of the dryer pages (C508): "Why did it
  not dry?" (WhyDidItNotDryTool) and the drying curve grown (DryingCurveTool
  and its cards).  No physics lives here.  Everything below is ONE of four
  things, and says which:

    * an IDENTITY of the moisture bases (w = X/(1+X), X = w/(1-w)) -- algebra
      on the definitions, not a model;
    * a RATIO of two engine numbers (the share of the water removed, the
      water per tonne of product, a time over a loading);
    * an ORDERING of engine numbers against a DECLARED tolerance (the verdict
      of `dryerVerdict`), always returned together with the numbers it used;
    * a READ-OFF of an engine column (the time at which an emitted X(t)
      series crosses a level, interpolated between two emitted samples).

  Every physical number the pages show -- X, the exhaust's water activity,
  the temperatures, the residence time -- is a KPI or a column of an engine
  run of a bundled witness, made by methodRun.  A number this file would have
  to predict is a number the page does not show.
\*---------------------------------------------------------------------------*/

import { tutorialByName } from "../../cases/tutorials.js";
import type { ScalarOverride } from "../../case/methodRun.js";

// ---- The witnesses (bundled corpus identifiers) -----------------------------

export const W_SOLID_RICH = "steady/drying/solidDryer01_sugar";
export const W_SOLID_STARVED = "steady/drying/solidDryer02_starved_air";
export const W_EVAP_STARVED = "steady/drying/evapDryer02_energy_limited";
export const W_SPRAY_COARSE = "steady/drying/sprayDryer06_rea";
export const W_SPRAY_BASE = "steady/drying/sprayDryer01_sugar";
export const W_TRAY = "batch/drying/dryer01_sucrose_tray";

/** The four runs of page A's second card, in the order the page shows them.
 *  `unit` is the unit's own name in the witness's flowsheetDict (the KPI
 *  block's key); `kinetics` says whether the unit has any time in it. */
export interface VerdictCase {
  id: string; witness: string; unit: string; label: string;
  kinetics: boolean; note: string;
}
export const VERDICT_CASES: readonly VerdictCase[] = [
  { id: "solid-rich", witness: W_SOLID_RICH, unit: "solidDryer", kinetics: false,
    label: "Sugar, plenty of hot air (solidDryer01)",
    note: "the solid dryer is a balance plus an isotherm: no kinetics, no time" },
  { id: "solid-starved", witness: W_SOLID_STARVED, unit: "solidDryer", kinetics: false,
    label: "Same sugar, one eighth of the air (solidDryer02)",
    note: "the same unit, the same feed and the same air, cut to one eighth" },
  { id: "evap-starved", witness: W_EVAP_STARVED, unit: "dryer", kinetics: false,
    label: "A crystal with no isotherm, starved of gas (evapDryer02)",
    note: "the evaporative dryer is a balance with free water: no isotherm, no kinetics" },
  { id: "spray-coarse", witness: W_SPRAY_COARSE, unit: "dryer", kinetics: true,
    label: "A coarse spray in a short chamber (sprayDryer06)",
    note: "the one unit here with a clock: a droplet falls for a residence time" },
];

// ---- The moisture bases: identities ----------------------------------------

/** Wet-basis moisture w [kg water / kg wet solid] from the dry basis X
 *  [kg water / kg dry solid].  w = X/(1+X): an identity. */
export function wetFromDry(X: number): number { return X / (1 + X); }

/** Dry-basis X from the wet-basis w.  X = w/(1-w); w = 1 is infinite X. */
export function dryFromWet(w: number): number {
  return w >= 1 ? Infinity : w / (1 - w);
}

/** The share of the water that a step removes, from two dry-basis X.  A ratio
 *  of two numbers; it needs no mass of solid because the solid is unchanged. */
export function shareRemoved(Xin: number, Xout: number): number {
  return Xin > 0 ? (Xin - Xout) / Xin : NaN;
}

/** Kg of water to take off per tonne of PRODUCT (the wet product, at Xout):
 *  1000 (Xin - Xout)/(1 + Xout).  A ratio of two engine numbers. */
export function waterPerTonneProduct(Xin: number, Xout: number): number {
  return (1000 * (Xin - Xout)) / (1 + Xout);
}

// ---- The verdict: an ORDERING with declared tolerances ----------------------

export type Verdict = "air-limited" | "time-limited" | "isotherm-bound" | "not-classified";

/** The tolerances, declared and printed on the page beside every verdict.
 *  `sat`: an exhaust a_w at or above 1 - sat counts as saturated.
 *  `floorK`: an outlet temperature within this many kelvin of the gas wet bulb
 *  counts as at the floor.  `iso`: an X_final within this RELATIVE amount of
 *  X_eq counts as on the isotherm.  `dry`: the largest X below which a unit
 *  without an isotherm counts as having no water left. */
export const VERDICT_TOLERANCE = { sat: 0.01, floorK: 0.5, iso: 0.01, dry: 1e-6 } as const;

/** The engine numbers a verdict may read.  null: the unit does not publish it. */
export interface DryerFacts {
  Xinitial: number | null; Xfinal: number | null; Xeq: number | null;
  exhaustAw: number | null;   // kpi exhaust_humidity (the exhaust's water activity)
  Tout: number | null; Twb: number | null;
  residence: number | null;   // kpi residenceTime (spray dryer only)
}

export interface VerdictResult {
  verdict: Verdict;
  /** Which sub-reason, for the air-limited verdict: the gas is full, or the gas is cold. */
  detail: "exhaust saturated" | "gas at its wet bulb" | null;
  /** The sentence the page prints: the numbers used and the comparison made. */
  reason: string;
  /** The engine numbers actually compared, name and value, in order. */
  used: { name: string; value: number }[];
}

const g = (v: number): string => String(Number(v.toPrecision(4)));

/** Order the engine's numbers.  The rules, in this order:
 *   1. isotherm-bound: X_final is within `iso` (relative) of X_eq -- the solid
 *      reached the floor its air allows; more air, heat or time cannot help;
 *   2. air-limited: the exhaust is saturated (a_w >= 1 - sat) or the outlet is
 *      within `floorK` of the gas wet bulb, and the product is still above its
 *      floor -- the air is used up;
 *   3. time-limited: the unit has a residence time, the air has capacity left
 *      (rule 2 did not apply) and X_final is above X_eq by more than `iso`;
 *   4. otherwise not classified, with the reason.
 *  It decides nothing the engine did not already print: it only orders. */
export function dryerVerdict(f: DryerFacts, hasKinetics: boolean): VerdictResult {
  const T = VERDICT_TOLERANCE;
  const used: { name: string; value: number }[] = [];
  const add = (name: string, v: number | null): void => {
    if (v !== null && Number.isFinite(v)) used.push({ name, value: v });
  };
  add("X_final", f.Xfinal); add("X_eq", f.Xeq); add("exhaust a_w", f.exhaustAw);
  add("T_out", f.Tout); add("T_wb", f.Twb); add("residence", f.residence);
  const none = (why: string): VerdictResult =>
    ({ verdict: "not-classified", detail: null, reason: why, used });
  if (f.Xfinal === null) return none("the run published no X_final");

  if (f.Xeq !== null && f.Xfinal <= f.Xeq * (1 + T.iso))
    return { verdict: "isotherm-bound", detail: null, used,
      reason: `X_final = ${g(f.Xfinal)} is within ${100 * T.iso} % of X_eq = ${g(f.Xeq)}: `
        + "the solid sits on its isotherm, so more air, heat or time would not dry it further" };

  const aboveFloor = f.Xeq !== null ? true : f.Xfinal > T.dry;
  if (aboveFloor) {
    if (f.exhaustAw !== null && f.exhaustAw >= 1 - T.sat)
      return { verdict: "air-limited", detail: "exhaust saturated", used,
        reason: `the exhaust is saturated (a_w = ${g(f.exhaustAw)} >= ${g(1 - T.sat)}) `
          + `while X_final = ${g(f.Xfinal)} is still above `
          + (f.Xeq !== null ? `X_eq = ${g(f.Xeq)}` : "zero")
          + ": the air cannot carry any more water" };
    if (f.Tout !== null && f.Twb !== null && f.Tout - f.Twb <= T.floorK)
      return { verdict: "air-limited", detail: "gas at its wet bulb", used,
        reason: `the outlet is at the gas's wet bulb (T_out - T_wb = ${g(f.Tout - f.Twb)} K <= ${T.floorK} K) `
          + `while X_final = ${g(f.Xfinal)} is still above `
          + (f.Xeq !== null ? `X_eq = ${g(f.Xeq)}` : "zero")
          + ": the gas has given all the heat it holds" };
  }
  if (hasKinetics && f.residence !== null && f.Xeq !== null && f.Xfinal > f.Xeq * (1 + T.iso))
    return { verdict: "time-limited", detail: null, used,
      reason: `the exhaust has capacity left and X_final = ${g(f.Xfinal)} is `
        + `${g(100 * (f.Xfinal / f.Xeq - 1))} % above X_eq = ${g(f.Xeq)} after a residence of `
        + `${g(f.residence)} s: the clock ran out before the isotherm was reached` };
  return none(f.Xeq === null && f.Xfinal <= T.dry
    ? "no water is left and no limit bound: X_final is zero"
    : "none of the three orderings applies to these numbers");
}

// ---- A READ-OFF of an engine column ----------------------------------------

/** The time at which the emitted series X(t) first falls to `target`,
 *  interpolated linearly between the two emitted samples that bracket it, or
 *  null when the run never got there (or started below it, at which the time
 *  is the first sample's).  A read-off of the engine's own column. */
export function timeToReach(
  t: readonly number[], X: readonly number[], target: number,
): number | null {
  if (!Number.isFinite(target)) return null;
  for (let i = 0; i < X.length; ++i) {
    const x = X[i]!;
    if (!Number.isFinite(x)) continue;
    if (x <= target) {
      if (i === 0) return t[0] ?? null;
      const x0 = X[i - 1]!, t0 = t[i - 1]!, t1 = t[i]!;
      if (!Number.isFinite(x0) || x0 === x) return t1;
      return t0 + ((x0 - target) / (x0 - x)) * (t1 - t0);
    }
  }
  return null;
}

// ---- A knob made of a RATIO ------------------------------------------------

const KMOL_H = /^(\s*)(\S+)(\s+)([-+0-9.eE]+)(\s*)kmol\/h(\s*;)/;

/** Overrides that multiply the authored flow of each named species of a
 *  stream file by `factor`: a ratio of the case's own numbers, written back
 *  in the unit the dict declares.  It reads the authored numbers from the
 *  bundled text of the witness, so the page types none of them.  Throws when
 *  the witness or a species is absent (a knob that misses must not run). */
export function scaledFlowOverrides(
  witness: string, file: string, species: readonly string[], factor: number,
): ScalarOverride[] {
  const raw = tutorialByName(witness)?.files.rawFiles?.[file];
  if (raw === undefined) throw new Error(`witness '${witness}' lacks file ${file}`);
  return species.map((s) => {
    let found: number | null = null;
    for (const line of raw.split("\n")) {
      const m = KMOL_H.exec(line);
      if (m && m[2] === s) { found = Number(m[4]); break; }
    }
    if (found === null || !Number.isFinite(found))
      throw new Error(`${file} of '${witness}' declares no '${s} <n> kmol/h;'`);
    return { file, key: s, value: Number((found * factor).toPrecision(10)), unit: "kmol/h" };
  });
}

// ---- A READ of a number the case declares ----------------------------------

/** The number a bundled witness declares for `key` (optionally inside the
 *  `{ ... }` block named `block`, so a one-letter key such as C is not
 *  confused with another line), skipping a bracket-dimension prefix:
 *  `k_Y [1 -2 -1 0 0]  0.05;` reads 0.05.  A read of the case's own text; null
 *  when the case does not declare it.  The page types none of these numbers. */
export function declaredNumber(
  witness: string, file: string, key: string, block?: string,
): number | null {
  let raw = tutorialByName(witness)?.files.rawFiles?.[file];
  if (raw === undefined) return null;
  raw = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  if (block !== undefined) {
    const open = new RegExp(`(^|\\s)${block}\\s*\\{`).exec(raw);
    if (!open) return null;
    const from = open.index + open[0].length;
    const to = raw.indexOf("}", from);
    raw = raw.slice(from, to < 0 ? undefined : to);
  }
  const m = new RegExp(`(^|[\\s;{])${key}\\s+(?:\\[[^\\]]*\\]\\s*)?([-+0-9.eE]+)`).exec(raw);
  return m ? Number(m[2]) : null;
}

/** The authored total of the named species of a stream file, in kmol/h. */
export function authoredFlow(
  witness: string, file: string, species: readonly string[],
): number {
  return scaledFlowOverrides(witness, file, species, 1)
    .reduce((a, o) => a + o.value, 0);
}
