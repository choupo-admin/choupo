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
  compressorChoiceMath -- the arithmetic of "Which compressor, and how far can
  I turn it down?" (C510), as pure functions, so a test can hold every number
  the page prints to the engine's own run.

  WHAT IS THE ENGINE'S.  (1) The duty of a sized compressor: its actual inlet
  flow and its overall pressure ratio, and the machine chart the engine chose
  from -- the region rectangles of Brown 2005 Fig 1-2 (p.3) -- published by the
  engine in the design sheet's `compressor { chart ( ... ) }` block (src/
  postProcessing/sizing/CompressorDesign.cpp, the `regions` table; C510).  The
  corners live THERE and nowhere in this file: `readChart` reads them.
  (2) Everything a run prints: W_shaft, T_out, the stage exponent n, Z, the
  molar mass.

  WHAT IS THE PAGE'S, and marked so.  The point-in-region test, the engine's
  tie-break (the list order) and its two fall-backs are the SAME rule as the
  C++ and are held to the engine's own pick by tests/compressorChoice.test.ts;
  the arithmetic of the maximum pressure (a driver-limited ceiling for a
  positive-displacement machine; a shut-off head multiple, YOURS, for a
  centrifugal one); the anti-surge mass balance.  There is NO characteristic
  map in the engine: a surge line is the student's declared fraction of the
  design flow, never a computed one.
\*---------------------------------------------------------------------------*/

import type { ChartRegionSheet, CompressorSheet } from "../../case/designSheet.js";
import { stage, staged } from "./compression.js";

/** The engine's own conversion, src/postProcessing/sizing/CompressorDesign.cpp:36. */
export const CFM_PER_M3S = 2118.8800032893;

/** The chart's outer limits, the engine's own: it refuses above 1e6 cfm and
 *  treats a ratio below 1.4 as a circulator duty (CompressorDesign.cpp, step 1). */
export const CHART_QMAX_CFM = 1.0e6;
export const CHART_QMIN_CFM = 1.0e2;
export const CHART_RMIN = 1.4;

export const m3hFromCfm = (cfm: number): number => cfm / CFM_PER_M3S * 3600;
export const cfmFromM3h = (m3h: number): number => m3h / 3600 * CFM_PER_M3S;

export type Machine = "centrifugal" | "axial" | "screw" | "reciprocating";

export interface Chart {
  regions: ChartRegionSheet[];
}

/** The chart a sized compressor's sheet published, or the reason there is none. */
export function readChart(c: CompressorSheet | null | undefined): Chart | { error: string } {
  if (!c) return { error: "the run has no compressor design sheet" };
  if (c.chart.length === 0)
    return { error: "the sheet carries no machine chart (a `design {}` block is what makes the engine publish it)" };
  return { regions: c.chart };
}

/** The upper ratio edge of a region at flow `cfm`: a straight line on the
 *  log-log axes between the two corners (the engine's `rMaxAt`). */
export function rMaxAt(r: ChartRegionSheet, cfm: number): number {
  if (r.rMaxAtQmin === r.rMaxAtQmax) return r.rMaxAtQmin;
  const t = Math.log(cfm / r.QminCfm) / Math.log(r.QmaxCfm / r.QminCfm);
  return r.rMaxAtQmin * Math.pow(r.rMaxAtQmax / r.rMaxAtQmin, t);
}

/** The machines whose rectangle holds the duty, in the engine's order. */
export function eligible(chart: Chart, cfm: number, ratio: number): string[] {
  return chart.regions
    .filter((r) => cfm >= r.QminCfm && cfm <= r.QmaxCfm && ratio >= r.rMin && ratio <= rMaxAt(r, cfm))
    .map((r) => r.machine);
}

export interface Pick {
  machine: string | null;
  /** How the engine reaches it, in words: inside a region, below the chart, outside it, refused. */
  how: "region" | "belowChart" | "outside" | "beyondFlow";
  /** Every machine whose rectangle holds the point: more than one means the
   *  list order, a convention the book does not give, broke the tie. */
  candidates: string[];
}

/** The engine's selection rule (CompressorDesign.cpp, "1. THE MACHINE"):
 *  the first region that holds the point; else, below ratio 1.4 and inside
 *  the chart's flow, the first machine whose flow range holds it; else the
 *  reciprocating machine; above 1e6 cfm the engine refuses. */
export function enginePick(chart: Chart, cfm: number, ratio: number): Pick {
  const candidates = eligible(chart, cfm, ratio);
  if (candidates.length > 0) return { machine: candidates[0]!, how: "region", candidates };
  if (ratio < CHART_RMIN && cfm >= CHART_QMIN_CFM && cfm <= CHART_QMAX_CFM) {
    const first = chart.regions.find((r) => cfm >= r.QminCfm && cfm <= r.QmaxCfm);
    if (first) return { machine: first.machine, how: "belowChart", candidates };
  }
  if (cfm > CHART_QMAX_CFM) return { machine: null, how: "beyondFlow", candidates };
  return { machine: "reciprocating", how: "outside", candidates };
}

// ---- K1: the same machine, two gases -----------------------------------------

export interface DutyRead {
  /** the actual inlet flow [cfm] and [m3/h] */
  cfm: number; m3h: number;
  ratio: number;
  MW: number; mdot: number;      // kg/kmol, kg/s
  T1: number; P1: number; P2: number;   // K, Pa
  n: number; Z: number;          // stage 1's exponent and mean Z, as the sheet prints them
  etaP: number;
  /** the sheet's shaft power [kW] and the head of its first stage [J/kg] */
  powerShaft: number; head1: number;
  mech: number;                  // mechanical loss fraction the sheet applied
  /** the engine's staging: the sections, the ratio of each, and the temperature
   *  the gas enters the second section at (the intercooler's outlet) */
  nStages: number; rStage: number; Tcool: number;
}

/** The duty of a sized compressor, from its sheet, or the reason there is none. */
export function readDuty(
  c: CompressorSheet | null | undefined,
  sheet: { MW: number; mdot: number; Pin: number; Pout: number; Tin: number; powerShaft: number;
           mechLoss: number; nStages: number; rStage: number;
           stages: { n: number; Zavg: number; etaPoly: number; head: number; Tin: number }[] },
): DutyRead | { error: string } {
  if (!c) return { error: "the run has no compressor design sheet" };
  if (!(c.inletFlowCfm > 0)) return { error: "the sheet does not publish the inlet flow" };
  const s1 = sheet.stages[0];
  if (!s1) return { error: "the sheet has no stage 1" };
  return {
    cfm: c.inletFlowCfm, m3h: m3hFromCfm(c.inletFlowCfm), ratio: c.overallRatio,
    MW: sheet.MW, mdot: sheet.mdot, T1: sheet.Tin, P1: sheet.Pin, P2: sheet.Pout,
    n: s1.n, Z: s1.Zavg, etaP: s1.etaPoly, powerShaft: sheet.powerShaft,
    head1: s1.head, mech: sheet.mechLoss,
    nStages: sheet.nStages, rStage: sheet.rStage,
    Tcool: sheet.stages[1]?.Tin ?? sheet.Tin,
  };
}

export interface SwapResult { mdot: number; head: number; power: number; }

/** The same machine -- the same actual inlet volume and the same pressure
 *  ratio, the same suction state -- given ANOTHER gas (molar mass MW2, exponent
 *  n2, compressibility Z2): one section, Brown Eq 2.71-2.78 through
 *  compression.ts's `stage`.  Mass flow follows the density, which follows
 *  the molar mass, so the head per kilogram changes while the power barely does. */
export function swapGas(d: DutyRead, gas: { MW: number; n: number; Z: number; etaP: number }): SwapResult {
  // mass flow = density x actual volume; density of a real gas = P MW / (Z R T)
  const R = 8314.462618;
  const rho = d.P1 * gas.MW / (gas.Z * R * d.T1);
  const mdot = rho * (d.m3h / 3600);
  const s = stage({ T1: d.T1, r: d.ratio, n: gas.n, Z: gas.Z, MW: gas.MW, mdot, etaP: gas.etaP, mech: d.mech });
  return { mdot, head: s.head, power: s.Wshaft / 1000 };
}

// ---- K6: the highest pressure the machine can make ---------------------------

/** The largest overall ratio a positive-displacement machine can push before
 *  the DRIVER stops it: the engine's own staging (equal section ratios, the
 *  cooler's pressure drop, every section cooled back to the intercooler
 *  temperature, the exponent of stage 1 held) priced by compression.ts's
 *  `staged`, and the ratio raised, by bisection, until the shaft power equals
 *  the driver rating.  At the engine's design ratio `staged` is the engine's
 *  own total; the efficiency is held at its design value, and the casing and
 *  rod-load limits of a real machine are not here. */
export function driverCeilingRatio(d: DutyRead, driverRatingKW: number): number {
  const power = (r: number): number => staged({
    N: d.nStages, Tcool: d.Tcool, T1: d.T1, P1: d.P1, P2: d.P1 * r, n: d.n, Z: d.Z, MW: d.MW,
    mdot: d.mdot, etaP: d.etaP, mech: d.mech,
  }).Wshaft / 1000;
  let lo = d.ratio, hi = d.ratio * 4;
  while (power(hi) < driverRatingKW && hi < 1e4) hi *= 2;
  for (let it = 0; it < 200; ++it) {
    const mid = 0.5 * (lo + hi);
    if (power(mid) < driverRatingKW) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** A centrifugal machine's shut-off pressure ratio when each section's head at
 *  zero flow is `headMultiple` times its design head (YOURS: a maker's map gives
 *  it, the engine has none): a section's head is proportional to r^m - 1
 *  (Brown Eq 2.73) at fixed suction state, so the stage ratio becomes
 *  (1 + k (r_1^m - 1))^(1/m), and the overall ratio is scaled by that gain over
 *  every section (the intercoolers' pressure drop is taken as unchanged). */
export function shutOffRatio(d: DutyRead, headMultiple: number): number {
  const m = (d.n - 1) / d.n;
  const r1 = d.rStage;
  const r1s = Math.pow(1 + headMultiple * (Math.pow(r1, m) - 1), 1 / m);
  return d.ratio * Math.pow(r1s / r1, d.nStages);
}

// ---- K4: the anti-surge recycle ----------------------------------------------

export interface Recycle {
  /** the delivered flow and the flow through the machine, as fractions of the design flow */
  demand: number; total: number;
  /** the recycle, as a fraction of the design flow and of what the machine passes */
  recycle: number; share: number;
}

/** The anti-surge mass balance at the suction: the machine must pass at least
 *  `surgeFrac * (1 + margin)` of its design flow, whatever the demand; the rest
 *  of its flow goes round the valve (never above the design flow: past it the
 *  duty is not a turndown). */
export function antiSurge(demand: number, surgeFrac: number, margin: number): Recycle {
  const floor = Math.min(1, surgeFrac * (1 + margin));
  const total = Math.max(demand, floor);
  return { demand, total, recycle: total - demand, share: total > 0 ? (total - demand) / total : 0 };
}

/** The suction temperature when the recycle returns UNCOOLED: the mass-weighted
 *  mean of the fresh gas at `Tfresh` and the hot recycle at `Trecycle`, a
 *  constant heat capacity (one step of the iteration; the page shows what is
 *  left). */
export const suctionMix = (share: number, Tfresh: number, Trecycle: number): number =>
  (1 - share) * Tfresh + share * Trecycle;
