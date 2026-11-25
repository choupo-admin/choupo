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
  controlValveMath -- the arithmetic behind "Why does a correctly sized valve
  still control badly?" (C509), kept React-free so tests/controlValve.test.ts
  can hold every number the page prints.

  WHAT IS THE ENGINE'S AND WHAT IS THIS FILE'S.  The engine's `pump` and
  `pipe` units, swept over the flow by pumpSystem01 (run in the browser),
  publish the pump's pressure rise and the line's pressure drop at every
  flow; this file READS them (readLine) and turns them into the one number
  the page is about, the valve's authority.  Everything else here is the
  PAGE'S model of a valve: three inherent characteristics, the installed
  flow, the loop gain, the opening a flow demands, the turndown.

  THE INSTALLED FLOW, derived in four lines (the lesson prints them):
    1. The source holds a constant pressure P_t for the line and the valve in
       series; the line drops k Q^2 and the valve drops what remains.
    2. A liquid valve passes Q = Cv(x) sqrt(dP_v), so dP_v = Q^2/Cv^2
       (turbulent, incompressible, no choking, no flashing).
    3. Wide open (f = Cv/Cv_max = 1) the flow is Q_max, the valve takes
       dP_v0 and the authority is a = dP_v0/P_t.
    4. Divide P_t = Q^2 (k + 1/Cv^2) by P_t and use q = Q/Q_max:
       1 = q^2 [(1 - a) + a/f^2], i.e. q = f / sqrt(a + (1 - a) f^2).
  Its slope in f is a / (a + (1 - a) f^2)^(3/2); the loop gain is that times
  the slope of the inherent characteristic.

  THE INHERENT CHARACTERISTICS ARE CONVENTIONS of valve makers, not laws of
  fluid mechanics: linear f = x, equal percentage f = R^(x-1) with the
  rangeability R declared, quick opening f = sqrt(x).  No source is cited,
  because no primary source for the shapes was read; the page says "by
  convention" and the reader declares R.  Equal percentage is not zero at
  x = 0 (f = 1/R); a real valve seats and leaks, which the page does not
  model.

  THE CHOKING AND CAVITATION arithmetic of card 6 is NOT here: it is
  letdown.ts's (chokedLiquidDrop, cavitationIndex, liquidRegime), reused by
  the tool, never written a second time.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../../adapters/SolverAdapter.js";
import type { CaseFiles } from "../../case/types.js";
import { filesToCaseFiles, tutorialByName } from "../../cases/tutorials.js";
import type { PumpSystemSweep } from "./PumpSystemTool.js";

// ---- The witnesses ----------------------------------------------------------

/** The pump and the line, swept over the flow: card 1's engine feed. */
export const CV_LINE_WITNESS = "steady/hydraulics/pumpSystem01_operating_point";
/** The water vapour pressure, evaluated by choupoProps. */
export const CV_PROPS_WITNESS = "props/thermo/purelaws02_water_two_vapour_pressure_laws";
/** The first propertyPoint of that case; its temperature is the page's knob
 *  (the case ships it at 350 K and the name keeps the shipped value). */
export const CV_PROPS_OP = "psatPreferred_350K";
/** Water's Psat window of the record's preferred law, in K (the case's own
 *  comment: inside 273-373 K it is the catalogue's number). */
export const CV_WATER_T_MIN = 273.16;
export const CV_WATER_T_MAX = 373.15;

/** The props case's text with its first state's temperature moved to T_K.
 *  The shipped case writes the state on ONE line (`state { T 350 K; P 1 bar;
 *  ... }`), which a line-anchored ScalarOverride cannot address, so this page
 *  edits that one declaration itself and refuses when it is not there. */
export function waterTemperatureText(text: string, T_K: number): string {
  const re = /(state\s*\{\s*T\s+)([-+0-9.eE]+)(\s*K\s*;)/;
  if (!re.test(text))
    throw new Error("control-valve: the first state's `T <number> K;` is not in the props witness's propsDict");
  return text.replace(re, `$1${T_K}$3`);
}

/** The props witness, with the water temperature of card 6 written in. */
export function waterCase(T_K: number): CaseFiles {
  const entry = tutorialByName(CV_PROPS_WITNESS);
  const raw = entry?.files.rawFiles;
  if (!raw) throw new Error(`method witness '${CV_PROPS_WITNESS}' is not in the bundled corpus`);
  return filesToCaseFiles(CV_PROPS_WITNESS, {
    ...raw, "system/propsDict": waterTemperatureText(raw["system/propsDict"] ?? "", T_K),
  });
}

/** The vapour pressure the props run published [Pa], or undefined. */
export function readPsatWater(r: RunResult | null | undefined): number | undefined {
  const d = r?.operationResults?.find((o) => o.name === CV_PROPS_OP)?.diagnostics;
  const v = d?.["Psat_water"];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ---- The inherent characteristic (by convention) ---------------------------

export const CV_SHAPES = ["linear", "equalPercentage", "quickOpening"] as const;
export type Shape = typeof CV_SHAPES[number];

export const SHAPE_LABEL: Readonly<Record<Shape, string>> = {
  linear: "linear",
  equalPercentage: "equal percentage",
  quickOpening: "quick opening",
};

/** The rangeability the page offers first: an illustration, a declared
 *  convention, not any valve's. */
export const R_DEFAULT = 50;
/** The lowest opening at which the page lets a valve be called controlling
 *  [fraction of travel]: a teaching value, said to be one. */
export const X_MIN_DEFAULT = 0.1;

/** f = Cv/Cv_max at the opening x in [0, 1]. */
export function inherent(shape: Shape, x: number, R: number): number {
  switch (shape) {
    case "linear": return x;
    case "equalPercentage": return Math.pow(R, x - 1);
    case "quickOpening": return Math.sqrt(x);
  }
}

/** df/dx, analytic. */
export function inherentSlope(shape: Shape, x: number, R: number): number {
  switch (shape) {
    case "linear": return 1;
    case "equalPercentage": return Math.log(R) * Math.pow(R, x - 1);
    case "quickOpening": return x > 0 ? 0.5 / Math.sqrt(x) : Infinity;
  }
}

/** The opening that gives the capacity fraction f, clamped to [0, 1]. */
export function inherentInverse(shape: Shape, f: number, R: number): number {
  let x: number;
  switch (shape) {
    case "linear": x = f; break;
    case "equalPercentage": x = 1 + Math.log(f) / Math.log(R); break;
    case "quickOpening": x = f * f; break;
  }
  return Math.min(1, Math.max(0, x));
}

// ---- Installed flow, authority, gain ---------------------------------------

/** q = Q/Q_max of the valve in its line, for the capacity fraction f and the
 *  authority a in (0, 1]. */
export function installedFlow(f: number, a: number): number {
  return f / Math.sqrt(a + (1 - a) * f * f);
}

/** dq/df, analytic. */
export function installedFlowSlope(f: number, a: number): number {
  return a / Math.pow(a + (1 - a) * f * f, 1.5);
}

/** The loop gain dq/dx at the opening x. */
export function loopGain(shape: Shape, x: number, a: number, R: number): number {
  return installedFlowSlope(inherent(shape, x, R), a) * inherentSlope(shape, x, R);
}

export interface GainRange {
  max: number; min: number; ratio: number; xAtMax: number; xAtMin: number;
}

/** The largest and smallest loop gain over x0..x1, on a fine grid of
 *  the analytic gain; ratio = max/min. */
export function gainRange(shape: Shape, a: number, R: number,
  x0 = X_MIN_DEFAULT, x1 = 1, n = 900): GainRange {
  let max = -Infinity, min = Infinity, xAtMax = x0, xAtMin = x0;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n;
    const g = loopGain(shape, x, a, R);
    if (g > max) { max = g; xAtMax = x; }
    if (g < min) { min = g; xAtMin = x; }
  }
  return { max, min, ratio: max / min, xAtMax, xAtMin };
}

/** The capacity fraction a demanded flow q < 1 needs: the installed-flow
 *  relation solved for f. */
export function capacityForFlow(q: number, a: number): number {
  return q * Math.sqrt(a) / Math.sqrt(1 - (1 - a) * q * q);
}

/** The opening that delivers the relative flow q (1 means the wide-open
 *  flow), or null when q cannot be had (the opening would exceed full
 *  travel for a capacity above 1). */
export function openingForFlow(shape: Shape, q: number, a: number, R: number,
  capacityScale = 1): number | null {
  const f = capacityForFlow(q, a) / capacityScale;
  return f > 1 + 1e-12 ? null : inherentInverse(shape, f, R);
}

/** The opening below which the installed flow is more than `tol` ABOVE the
 *  inherent promise (q/f > 1 + tol), or null when it never is (a so large
 *  that q/f stays within tol everywhere).  Solved in closed form from
 *  q/f = 1/sqrt(a + (1-a) f^2). */
export function deviationOpening(shape: Shape, a: number, R: number, tol = 0.1): number | null {
  if (a >= 1) return null;
  const fStar2 = (1 / ((1 + tol) * (1 + tol)) - a) / (1 - a);
  if (fStar2 <= 0) return null;   // q/f never exceeds 1 + tol: the line never takes more than that
  const fStar = Math.sqrt(fStar2);
  if (fStar >= 1) return null;
  return inherentInverse(shape, fStar, R);
}

// ---- Rangeability, the start-up trap ---------------------------------------

/** The smallest relative flow a valve of capacity `capacityScale` (its Cv
 *  relative to the big valve's) holds at the lowest controlling opening
 *  `xMin`. */
export function minControllableFlow(shape: Shape, a: number, R: number,
  xMin: number, capacityScale = 1): number {
  return installedFlow(capacityScale * inherent(shape, xMin, R), a);
}

/** The installed turndown: the wide-open flow over the smallest
 *  controllable one. */
export function installedTurndown(shape: Shape, a: number, R: number,
  xMin: number, capacityScale = 1): number {
  return 1 / minControllableFlow(shape, a, R, xMin, capacityScale);
}

/** The most a valve of that capacity can pass wide open, relative to the
 *  big valve's wide-open flow. */
export function maxFlowOfCapacity(a: number, capacityScale: number): number {
  return installedFlow(capacityScale, a);
}

// ---- The source head, split --------------------------------------------------

export interface PressureSplit { line: number; valve: number }

/** The available dynamic pressure P_t split at the relative flow q: the line
 *  takes (1 - a) P_t q^2 and the valve what remains. */
export function splitAt(Pt: number, a: number, q: number): PressureSplit {
  const line = (1 - a) * Pt * q * q;
  return { line, valve: Pt - line };
}

// ---- Reading the pump-and-line sweep ---------------------------------------

export interface LineReading {
  /** The flow, kmol/s (the engine's canonical basis). */
  F: number;
  /** The pump's pressure rise, Pa. */
  pumpDP: number;
  /** The whole line's drop: friction + fittings + elevation, Pa. */
  systemDP: number;
  /** The elevation part, Pa. */
  elevation: number;
  /** Friction + fittings, Pa. */
  lineLoss: number;
  /** The pressure at the pump inlet, Pa. */
  P_in: number;
}

/** The sweep point nearest the flow F [kmol/s], or null when a column is
 *  absent. */
export function readLine(sweep: PumpSystemSweep | null, F: number): LineReading | null {
  if (!sweep || sweep.F.length === 0) return null;
  let i = 0;
  for (let j = 1; j < sweep.F.length; j++)
    if (Math.abs(sweep.F[j]! - F) < Math.abs(sweep.F[i]! - F)) i = j;
  const elev = sweep.columns[`${sweep.systemUnit}.dP_elevation`]?.[i];
  const Pout = sweep.columns[`${sweep.pumpUnit}.P_out`]?.[i];
  const pumpDP = sweep.pumpDP[i], systemDP = sweep.systemDP[i];
  if (elev === undefined || Pout === undefined || pumpDP === undefined
    || systemDP === undefined) return null;
  return {
    F: sweep.F[i]!, pumpDP, systemDP, elevation: elev,
    lineLoss: systemDP - elev, P_in: Pout - pumpDP,
  };
}

export interface ValveSizing {
  /** The dynamic budget the line and the valve share, Pa: the pump's rise at
   *  the rated flow less the static elevation. */
  Pt: number;
  /** The valve's drop wide open at the rated flow, Pa. */
  dpValveOpen: number;
  /** Authority a = dpValveOpen / Pt. */
  a: number;
}

/** The valve a rated flow asks for: the pump's rise at that flow, less what
 *  the line (with its elevation) takes, is the valve's wide-open drop.
 *  null when the line alone already takes all the pump gives. */
export function sizeValve(rated: LineReading | null): ValveSizing | null {
  if (!rated) return null;
  const Pt = rated.pumpDP - rated.elevation;
  const dpValveOpen = rated.pumpDP - rated.systemDP;
  if (!(Pt > 0) || !(dpValveOpen > 0)) return null;
  return { Pt, dpValveOpen, a: dpValveOpen / Pt };
}

/** The ratio of two line losses against the square of the flow ratio: 1 when
 *  the line obeys k Q^2 exactly (the friction factor drifts with Re, so the
 *  engine's number is a little off 1). */
export function quadraticityRatio(hi: LineReading, lo: LineReading): number {
  return (hi.lineLoss / lo.lineLoss) / Math.pow(hi.F / lo.F, 2);
}
