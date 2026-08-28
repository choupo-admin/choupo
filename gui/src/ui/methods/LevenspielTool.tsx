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
  LevenspielTool — the Levenspiel plot for the Methods workspace: 1/(−r_A)
  against conversion X_A.  For a PFR, V = F_A0 ∫ dX/(−r_A) — the AREA under
  the curve.  For a CSTR, V = F_A0·X_out/(−r_A at the outlet) — the RECTANGLE
  at the outlet height.  Same duty, two areas: THE reactor-design teaching
  construction, and for positive-order kinetics the rectangle circumscribes
  the area — which is WHY a CSTR needs more volume for the same job.

  SELF-FEEDING (the Methods-workspace contract): the DEFAULT mode runs BOTH
  witnesses in the browser (choupoSolve WASM) —
      tutorials/steady/reactors/pfr01_first_order
      tutorials/steady/reactors/cstr01_first_order
  which are TWINS: byte-identical 0/feed, constant/reactions (the ethanol
  esterification, pseudo-first-order in ethanol) and thermoPhysPropDict —
  pinned by the test suite — so the PFR curve and the CSTR rectangle share
  ONE chart and the comparison is between reactors, never between chemistries.
  When the app's CURRENT run carries a servable PFR profile or CSTR KPI set,
  a source toggle offers "Current run" beside the classroom witnesses.

  ZERO physics in TypeScript, with the AUTHORIZED VIEW-GEOMETRY EXCEPTIONS,
  each labeled where it happens:
    * 1/y over the engine's published (X, −r) points — an ordinate transform
      for display (`invRateCurve`); on a reversible law the engine's rate
      goes NEGATIVE past equilibrium, and those points are EXCLUDED with the
      exclusion reported in the chart annotation, never silently dropped;
    * the trapezoid area under the engine's own 1/(−r) points from 0 to
      X_out (`trapezoidAreaInView`, imported from RayleighTool — the ONE
      existing integrator home in this workspace; extracting a shared
      geometry module is a maintainer move, this change writes new files
      only), multiplied by F_lim,in read off the profile's own inlet
      F_<limiting> sample and compared against the case's V_R;
    * the rectangle X_out·(1/(−r_out)) from the CSTR's published KPIs, with
      F_lim,in as F·z_lim of the run's own feed stream (arithmetic on two
      engine-published stream numbers); when no unique feed stream carries
      the limiting component the comparison stays in F_A0-normalized units
      (m³·s/mol) and SAYS so.
  Every rate, every conversion, every volume is engine-emitted: the PFR's
  profile columns X / minus_r_<limiting> / F_<comp> at every RK4 point, and
  the CSTR's KPI block minus_r_<limiting> / X_limiting / V_R.  Nothing here
  re-derives kinetics.

  The chart is inline SVG (the Merkel / EpsilonNtu precedent) — the plotting
  bundle cannot load outside a browser, and the pure helpers (detectors,
  clipping, rectangle, knob map) must stay importable by the node test
  runner (tests/levenspielTool.test.ts).

  THE PAGE IS A SCROLLING LESSON, not an instrument panel: the argument lives
  as DATA in levenspielLesson.ts (steps + limits) so a test can assert it
  still runs end to end, the definitions sit ABOVE the chart and the
  consequences BELOW it, and ONE hoisted renderer serves both this file's
  returns — a tool that hid its explanation on the branch where the engine
  produced nothing would be hiding it exactly when it is most needed.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Text, Title,
  Tooltip,
} from "@mantine/core";

import type { StreamResult, UnitProfile } from "../../adapters/SolverAdapter.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { LEVENSPIEL_LIMITS, LEVENSPIEL_STEPS } from "./levenspielLesson.js";
// The ONE existing trapezoid-integrator home in the Methods workspace (the
// Rayleigh construction owns the same piecewise-linear area-in-view with the
// same coverage refusal).  Reused rather than duplicated — the arity doctrine;
// a shared geometry module is the right home the day a maintainer can move
// both callers onto it.
import { trapezoidAreaInView, type AreaPoint } from "./RayleighTool.js";

/** Per-unit KPI block as the adapter delivers it (RunResult.kpis[unit]). */
export type KpiRow = { [key: string]: number };
export type KpiMap = { [unitName: string]: KpiRow };

// ---- Detection: which engine surfaces feed the tool -------------------------
// Column/key presence is the contract, never a unit or case name (the Merkel
// posture).  The PFR side is a PROFILE carrying `X` plus a `minus_r_<comp>`
// column at every RK4 point; the CSTR side is a KPI block carrying
// `minus_r_<comp>` + `X_limiting` + `V_R`.  A PFR unit publishes no
// minus_r_ KPI (profile only), so the two detectors cannot claim each
// other's units.

/** The engine's per-limiting-reactant rate key/column stem. */
export const RATE_RE = /^minus_r_(.+)$/;

export interface PfrFeed {
  unit: string;
  /** The limiting reactant, read off the minus_r_<limiting> column name. */
  limiting: string;
  profile: UnitProfile;
  kpis?: KpiRow;
}

export interface CstrFeed {
  unit: string;
  limiting: string;
  kpis: KpiRow;
}

/** Profiles that carry the Levenspiel columns: `X` and `minus_r_<comp>`,
 *  equal length ≥ 2.  Sorted by unit name. */
export function findPfrFeeds(
  profiles: UnitProfile[] | undefined,
  kpis: KpiMap | undefined,
): PfrFeed[] {
  if (!profiles) return [];
  const out: PfrFeed[] = [];
  for (const p of profiles) {
    const X = p.columns["X"];
    if (!X || X.length < 2) continue;
    const rateCols = Object.keys(p.columns)
      .filter((c) => RATE_RE.test(c)).sort();
    const rateCol = rateCols[0];
    if (rateCol === undefined) continue;
    const r = p.columns[rateCol];
    if (!r || r.length !== X.length) continue;
    const limiting = RATE_RE.exec(rateCol)![1]!;
    const row = kpis?.[p.unit];
    out.push(row
      ? { unit: p.unit, limiting, profile: p, kpis: row }
      : { unit: p.unit, limiting, profile: p });
  }
  return out.sort((a, b) => a.unit.localeCompare(b.unit));
}

/** KPI blocks that carry the CSTR design triple: `minus_r_<comp>` +
 *  `X_limiting` + `V_R`, all finite.  Sorted by unit name. */
export function findCstrFeeds(kpis: KpiMap | undefined): CstrFeed[] {
  if (!kpis) return [];
  const out: CstrFeed[] = [];
  for (const [unit, block] of Object.entries(kpis)) {
    const rateKeys = Object.keys(block).filter((k) => RATE_RE.test(k)).sort();
    const rateKey = rateKeys[0];
    if (rateKey === undefined) continue;
    const limiting = RATE_RE.exec(rateKey)![1]!;
    const fin = (v: number | undefined) =>
      typeof v === "number" && Number.isFinite(v);
    if (!fin(block[rateKey]) || !fin(block["X_limiting"]) || !fin(block["V_R"]))
      continue;
    out.push({ unit, limiting, kpis: block });
  }
  return out.sort((a, b) => a.unit.localeCompare(b.unit));
}

// ---- AUTHORIZED view geometry 1: the 1/(−r) ordinate transform --------------
// Pure display arithmetic over the engine's published (X, −r) points.  On a
// reversible law the rate crosses zero at equilibrium and goes negative past
// it — 1/(−r) diverges at the asymptote, so points with −r ≤ MIN_RATE (or
// non-finite pairs) are EXCLUDED and the exclusion is REPORTED (count + the
// X of the first excluded sample, where the chart draws its annotation).
// Never a silent drop.

/** Below this the ordinate 1/(−r) has no finite, meaningful value. */
export const MIN_RATE = 1.0e-30;

export interface ClippedCurve {
  /** Finite 1/(−r) samples {x: X, f: 1/(−r)}, in the engine's point order. */
  pts: AreaPoint[];
  /** How many published points were excluded (−r ≤ MIN_RATE or non-finite). */
  excludedCount: number;
  /** X of the FIRST excluded sample — where 1/(−r) stops being finite, the
   *  point the chart clips at and annotates.  Null when nothing was excluded.
   *
   *  This used to be called "the equilibrium asymptote", which names ONE
   *  reason the rate can vanish as though it were the only one.  The test
   *  applied is `−r ≤ MIN_RATE or non-finite`, and that fires equally for a
   *  reversible reaction approaching equilibrium, an irreversible one that
   *  has consumed its limiting reactant, a rate law evaluated outside the
   *  window where it means anything, and a NaN.  Only the first of those is
   *  an equilibrium, and a student reading the wrong label learns a physical
   *  story the chart never checked. */
  xClip: number | null;
}

export function invRateCurve(
  X: readonly number[], minusR: readonly number[],
): ClippedCurve {
  const pts: AreaPoint[] = [];
  let excludedCount = 0;
  let xClip: number | null = null;
  const n = Math.min(X.length, minusR.length);
  for (let i = 0; i < n; ++i) {
    const x = X[i]!;
    const r = minusR[i]!;
    if (Number.isFinite(x) && Number.isFinite(r) && r > MIN_RATE) {
      pts.push({ x, f: 1 / r });
    } else {
      excludedCount += 1;
      if (xClip === null && Number.isFinite(x)) xClip = x;
    }
  }
  return { pts, excludedCount, xClip };
}

// ---- AUTHORIZED view geometry 3: the CSTR rectangle -------------------------
// X_out·(1/(−r_out)) from the CSTR's published KPIs — the design identity
// V = F_lim,in·X/(−r) read as an area.  `specificVolume` is the rectangle in
// F_A0-normalized units, m³·s/mol: multiply by F_lim,in [mol/s] to get m³.

export interface CstrRectangle {
  X: number;
  minusR: number;
  /** 1/(−r_out) — the rectangle height [m³·s/mol per unit X]. */
  invR: number;
  V_R: number;
  /** X/(−r) — the rectangle area per mole of limiting feed [m³·s/mol]. */
  specificVolume: number;
}

export function cstrRectangle(
  kpis: KpiRow | undefined, limiting: string,
): CstrRectangle | null {
  if (!kpis) return null;
  const X = kpis["X_limiting"];
  const minusR = kpis[`minus_r_${limiting}`];
  const V_R = kpis["V_R"];
  if (X === undefined || minusR === undefined || V_R === undefined) return null;
  if (!Number.isFinite(X) || !Number.isFinite(V_R)) return null;
  if (!Number.isFinite(minusR) || minusR <= MIN_RATE) return null;
  return { X, minusR, invR: 1 / minusR, V_R, specificVolume: X / minusR };
}

// ---- F_lim,in — from published numbers only ---------------------------------
// The chips compare absolute volumes only when F_lim,in is derivable from the
// run's own published numbers; otherwise they compare in F_A0-normalized
// units and say so.  Nothing is invented.

/** PFR: the inlet sample of the profile's own F_<limiting> column [mol/s] —
 *  an engine-published number (the profile's first RK4 point is the inlet). */
export function pfrInletLimitingFlow(
  profile: UnitProfile, limiting: string,
): number | null {
  const col = profile.columns[`F_${limiting}`];
  const v = col?.[0];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** The minimal stream shape the CSTR-side derivation reads. */
export type FeedStreamLike =
  Pick<StreamResult, "role" | "F" | "composition">;

/** CSTR: F·z_lim over the run's SINGLE feed-role stream carrying the
 *  limiting component [mol/s] — arithmetic on two engine-published stream
 *  numbers (F in kmol/s, z a mole fraction; ×1000 is unit scaling).  Null
 *  when no unique such stream exists — ambiguity is not resolved by
 *  guessing. */
export function feedLimitingFlow(
  streams: readonly FeedStreamLike[] | undefined, limiting: string,
): number | null {
  if (!streams) return null;
  const feeds = streams.filter(
    (s) => s.role === "feed" && (s.composition[limiting] ?? 0) > 0);
  if (feeds.length !== 1) return null;
  const s = feeds[0]!;
  const z = s.composition[limiting]!;
  if (!Number.isFinite(s.F) || s.F <= 0 || !Number.isFinite(z)) return null;
  return s.F * 1000.0 * z;
}

// Re-exported so the test suite pins the integrator contract THIS tool
// depends on from this tool's own import path.
export { trapezoidAreaInView };
export type { AreaPoint };

// ---- The classroom witnesses + their knob→dict map --------------------------
// The STANDALONE feed: the tool clones BOTH bundled tutorials, writes the
// SAME knob values into each witness's DECLARED dict scalars (methodRun's
// textual override — units and comments survive; a knob that misses its dict
// THROWS), and runs choupoSolve twice in the browser.  The two witnesses are
// TWINS — byte-identical 0/feed, constant/reactions and thermoPhysPropDict,
// pinned by the test suite — and the shared knobs write the same feed and T
// into both, so the PFR area and the CSTR rectangle stay directly comparable
// on one chart.
//
// Knobs deliberately ABSENT, each with its reason recorded:
//   * the CSTR's V_R — cstr01 declares it INLINE on one line
//     (`operation   { V_R 0.005; }`), which the line-anchored
//     `key value [unit];` override grammar cannot address (the key is not at
//     line start).  The CSTR therefore always runs its authored 0.005 m³ —
//     stated in the provenance — and the test suite pins the miss
//     (applyScalarOverride throws on it) so the absence stays a recorded
//     fact, not an accident.  A methodRun grammar extension (sub-dict-aware
//     addressing) would unlock it; not a workaround here.
//   * L or D — pfr01 parameterizes the reactor by V_R alone; no L or D
//     scalar is declared anywhere, and a knob must turn a declared dict
//     scalar, never an invented handle.
//   * P — `P 101325 Pa;` in 0/feed IS addressable, but both witnesses run
//     liquid-phase rate laws whose concentrations come from Vliq: P never
//     reaches the physics, and a knob that does not reach the physics is a
//     placebo control (the RayleighTool "decorative V" precedent).
//   * nSteps — addressable and real (the RK4 grid IS the published curve's
//     resolution), but it is the integrator's own numerics control; exposing
//     it beside the physics knobs invites reading numerics as physics.

/** Bundled identifiers ("<category>/<subclass>/<case>" — steady is a
 *  sub-classed category, so the `reactors` segment is part of them). */
export const PFR_WITNESS = "steady/reactors/pfr01_first_order";
export const CSTR_WITNESS = "steady/reactors/cstr01_first_order";

/** The twins' limiting reactant, as their shared constant/reactions
 *  declares it (`limitingReactant   ethanol;`). */
export const WITNESS_LIMITING = "ethanol";

export interface KnobTarget {
  /** Which witness this knob writes into. */
  witness: string;
  /** The file there. */
  file: string;
}

export interface LevenspielKnob {
  /** Stable id — the key of the knob-value state bag. */
  id: string;
  /** What the student reads beside the control. */
  label: string;
  /** The dict key as written in the target file(s). */
  key: string;
  /** The witnesses' own authored value — the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit the dict declares.  The knob writes the NUMBER only; the unit
   *  word in the dict survives the override untouched.  "" for keys the dict
   *  declares bare (the unit then lives in the label). */
  unit: string;
  /** The (witness, file) pairs this knob writes.  A witness absent here
   *  keeps its authored value — a recorded absence, never an accident. */
  targets: readonly KnobTarget[];
}

const BOTH_FEEDS: readonly KnobTarget[] = [
  { witness: PFR_WITNESS, file: "0/feed" },
  { witness: CSTR_WITNESS, file: "0/feed" },
];

/** The classroom knobs — all engine-side levers.  T reaches the Arrhenius
 *  rate constant, the two feed flows set F_lim,in and the composition the
 *  rate law sees, and the PFR's V_R sets how far along the curve the area
 *  runs (X_out moves with it). */
export const LEVENSPIEL_KNOBS: readonly LevenspielKnob[] = [
  { id: "T", label: "feed / reactor T", key: "T",
    def: 350, min: 320, max: 380, step: 1, unit: "K", targets: BOTH_FEEDS },
  { id: "F_ethanol", label: "feed ethanol (limiting)", key: "ethanol",
    def: 0.5, min: 0.1, max: 2, step: 0.05, unit: "kmol/h",
    targets: BOTH_FEEDS },
  { id: "F_aceticAcid", label: "feed acetic acid", key: "aceticAcid",
    def: 0.5, min: 0.1, max: 2, step: 0.05, unit: "kmol/h",
    targets: BOTH_FEEDS },
  // pfr01's flowsheetDict declares `V_R 0.005;` BARE (m³ in a comment) — so
  // this knob's dict unit is the empty word and the label carries the m³.
  { id: "V_R", label: "PFR volume V_R (m³)", key: "V_R",
    def: 0.005, min: 0.001, max: 0.02, step: 0.001, unit: "",
    targets: [{ witness: PFR_WITNESS, file: "system/flowsheetDict" }] },
];

export type LevenspielKnobValues = { [id: string]: number };

/** The witnesses' authored values — the classroom baseline. */
export function defaultKnobValues(): LevenspielKnobValues {
  const out: LevenspielKnobValues = {};
  for (const k of LEVENSPIEL_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values → the ScalarOverrides ONE witness receives.  Non-finite
 *  values are dropped (that knob keeps the witness's authored number) —
 *  never written as NaN. */
export function knobOverridesFor(
  values: LevenspielKnobValues, witness: string,
): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of LEVENSPIEL_KNOBS) {
    const v = values[k.id];
    if (v === undefined || !Number.isFinite(v)) continue;
    for (const t of k.targets) {
      if (t.witness === witness)
        out.push({ file: t.file, key: k.key, value: v });
    }
  }
  return out;
}

// The provenance lines, always visible in classroom mode.
const PROVENANCE_RUNS =
  `Runs tutorials/${PFR_WITNESS} AND tutorials/${CSTR_WITNESS} with your `
  + "parameters, in your browser (choupoSolve WASM).";
const PROVENANCE_TWINS =
  "The two witnesses are twins — byte-identical 0/feed, constant/reactions "
  + "(ethanol esterification, pseudo-first-order in ethanol) and thermo — so "
  + "the PFR area and the CSTR rectangle are directly comparable on one "
  + "chart.  The CSTR keeps its authored V_R = 0.005 m³ (declared inline, "
  + "out of the override grammar's reach — a recorded knob absence).";


// ---- Display formatting -----------------------------------------------------

function fmt(v: number | null | undefined, d = 4): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toPrecision(d) : "—";
}
const fmtTick = (v: number) => String(Number(v.toPrecision(3)));

// ---- The chart (inline SVG, the Merkel frame conventions) -------------------

const FW = 640, FH = 420;
const FX0 = 66, FX1 = 606, FY0 = 16, FY1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const CURVE_COLOR = "#26c6da";     // the 1/(−r) curve off the PFR profile
const AREA_COLOR = "#26c6da";      // the shaded PFR area (light fill)
const RECT_COLOR = "#ffb74d";      // the CSTR rectangle
const CLIP_COLOR = "#ff8a65";      // the equilibrium-asymptote annotation

interface PfrChartView {
  curve: ClippedCurve;
  /** [x0, xEnd] of the kept points — the drawn/integrated window. */
  x0: number;
  xEnd: number;
}

interface CstrChartView {
  rect: CstrRectangle;
}

function LevenspielSvg({ pfr, cstr, limiting, busyOverlay }: {
  pfr: PfrChartView | null;
  cstr: CstrChartView | null;
  limiting: string;
  /** A newer classroom run is in flight: keep the last chart visible and
   *  overlay a loader — never a blank. */
  busyOverlay: boolean;
}): JSX.Element {
  const pts = pfr ? pfr.curve.pts : [];

  // Drawn domain over whatever is present, clipped to the physical X ∈ [0, 1].
  const xMaxData = Math.max(pfr ? pfr.xEnd : 0, cstr ? cstr.rect.X : 0);
  const xLo = 0;
  const xHi = Math.min(1, (xMaxData || 0.1) * 1.08);
  const yMaxData = Math.max(
    ...pts.map((p) => p.f),
    cstr ? cstr.rect.invR : 0,
    0);
  const yHi = (yMaxData || 1) * 1.08;

  const toX = (x: number) => FX0 + ((FX1 - FX0) * (x - xLo)) / (xHi - xLo || 1);
  const toY = (f: number) => FY1 - ((FY1 - FY0) * f) / (yHi || 1);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xLo + f * (xHi - xLo));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yHi);

  // The shaded PFR area: curve points forward, closed to the f = 0 baseline.
  const areaPts = pts.length >= 2
    ? pts.map((p) => `${toX(p.x).toFixed(2)},${toY(p.f).toFixed(2)}`)
      .concat([
        `${toX(pts[pts.length - 1]!.x).toFixed(2)},${toY(0).toFixed(2)}`,
        `${toX(pts[0]!.x).toFixed(2)},${toY(0).toFixed(2)}`,
      ]).join(" ")
    : null;
  const curveLine = pts
    .map((p) => `${toX(p.x).toFixed(2)},${toY(p.f).toFixed(2)}`).join(" ");

  return (
    <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {busyOverlay && (
        <Box style={{ position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1,
          background: "light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.35))" }}>
          <Loader size="sm" />
        </Box>
      )}
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Levenspiel plot: reciprocal reaction rate versus
          conversion; PFR area shaded, CSTR rectangle outlined">
        {/* grid + axes */}
        {xTicks.map((t) => (
          <g key={`gx${t}`}>
            <line x1={toX(t)} y1={FY0} x2={toX(t)} y2={FY1}
              stroke={GRID} strokeWidth={0.6} />
            <text x={toX(t)} y={FY1 + 16} textAnchor="middle"
              fontSize={11} fill={INK}>{fmtTick(t)}</text>
          </g>
        ))}
        {yTicks.map((f) => (
          <g key={`gy${f}`}>
            <line x1={FX0} y1={toY(f)} x2={FX1} y2={toY(f)}
              stroke={GRID} strokeWidth={0.6} />
            <text x={FX0 - 6} y={toY(f) + 4} textAnchor="end"
              fontSize={11} fill={INK}>{fmtTick(f)}</text>
          </g>
        ))}
        <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
          fontSize={12} fill={INK}>
          X — conversion of {limiting}
        </text>
        <text x={14} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
          fill={INK} transform={`rotate(-90 14 ${(FY0 + FY1) / 2})`}>
          1 / (−r_{limiting})  [(m³·s)/mol]
        </text>

        {/* the CSTR rectangle — X_out wide, 1/(−r_out) tall, from the KPIs */}
        {cstr && (
          <g>
            <rect x={toX(0)} y={toY(cstr.rect.invR)}
              width={toX(cstr.rect.X) - toX(0)}
              height={toY(0) - toY(cstr.rect.invR)}
              fill={RECT_COLOR} opacity={0.12} />
            <rect x={toX(0)} y={toY(cstr.rect.invR)}
              width={toX(cstr.rect.X) - toX(0)}
              height={toY(0) - toY(cstr.rect.invR)}
              fill="none" stroke={RECT_COLOR} strokeWidth={1.6} />
            <line x1={toX(cstr.rect.X)} y1={FY0 + 10}
              x2={toX(cstr.rect.X)} y2={FY1}
              stroke={RECT_COLOR} strokeWidth={1} strokeDasharray="4 3" />
            <text x={toX(cstr.rect.X) + 4} y={FY0 + 20} fontSize={10}
              fill={RECT_COLOR}>
              X_CSTR = {fmt(cstr.rect.X)}
            </text>
          </g>
        )}

        {/* the shaded PFR area, under the curve */}
        {areaPts && (
          <polygon points={areaPts} fill={AREA_COLOR} opacity={0.15}
            stroke="none" />
        )}

        {/* the 1/(−r) curve off the engine's published points */}
        {pts.length >= 2 && (
          <>
            <polyline points={curveLine} fill="none" stroke={CURVE_COLOR}
              strokeWidth={2} />
            <line x1={toX(pfr!.xEnd)} y1={FY0 + 10}
              x2={toX(pfr!.xEnd)} y2={FY1}
              stroke={CURVE_COLOR} strokeWidth={1} strokeDasharray="4 3" />
            <text x={toX(pfr!.xEnd) + 4} y={FY0 + 34} fontSize={10}
              fill={CURVE_COLOR}>
              X_PFR = {fmt(pfr!.xEnd)}
            </text>
          </>
        )}

        {/* where 1/(−r) stops being finite — excluded points REPORTED, never
            silently dropped, and NOT diagnosed: the chart measures that the
            rate vanished, not why */}
        {pfr && pfr.curve.xClip !== null && (
          <g>
            <line x1={toX(pfr.curve.xClip)} y1={FY0}
              x2={toX(pfr.curve.xClip)} y2={FY1}
              stroke={CLIP_COLOR} strokeWidth={1.4} strokeDasharray="3 3" />
            <text x={toX(pfr.curve.xClip) - 4} y={FY1 - 8} fontSize={10}
              textAnchor="end" fill={CLIP_COLOR}>
              rate vanishes here — {pfr.curve.excludedCount} published
              point{pfr.curve.excludedCount === 1 ? "" : "s"} with −r ≤ 0
              excluded (reported, not hidden)
            </text>
          </g>
        )}
      </svg>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function LevenspielTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);

  // ---- Source: the classroom witnesses vs the app's current run.  The
  // toggle appears only when the current run carries a SERVABLE feed (a PFR
  // profile with a minus_r_ column, or a CSTR KPI design triple).
  const appPfr = useMemo(
    () => findPfrFeeds(appResult?.profiles, appResult?.kpis)[0] ?? null,
    [appResult]);
  const appCstr = useMemo(
    () => findCstrFeeds(appResult?.kpis)[0] ?? null,
    [appResult]);
  const appServable = appPfr !== null || appCstr !== null;
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    appServable && source === "current" ? "current" : "classroom";

  // ---- Classroom knobs → per-witness overrides → TWO in-browser solves -----
  const [knobs, setKnobs] = useState<LevenspielKnobValues>(defaultKnobValues);
  const knobsKey = JSON.stringify(knobs);
  const pfrRun = useMethodRun(
    src === "classroom" ? PFR_WITNESS : null,
    knobOverridesFor(knobs, PFR_WITNESS), knobsKey, "choupoSolve");
  const cstrRun = useMethodRun(
    src === "classroom" ? CSTR_WITNESS : null,
    knobOverridesFor(knobs, CSTR_WITNESS), knobsKey, "choupoSolve");
  const busy = pfrRun.busy || cstrRun.busy;

  const pfrFeed = useMemo(
    () => (src === "current"
      ? appPfr
      : findPfrFeeds(pfrRun.result?.profiles, pfrRun.result?.kpis)[0] ?? null),
    [src, appPfr, pfrRun.result]);
  const cstrFeed = useMemo(
    () => (src === "current"
      ? appCstr
      : findCstrFeeds(cstrRun.result?.kpis)[0] ?? null),
    [src, appCstr, cstrRun.result]);
  const cstrStreams =
    src === "current" ? appResult?.streams : cstrRun.result?.streams;

  // ---- The PFR side: curve + area + the V_R comparison ---------------------
  const pfrView = useMemo(() => {
    if (!pfrFeed) return null;
    const X = pfrFeed.profile.columns["X"];
    const mr = pfrFeed.profile.columns[`minus_r_${pfrFeed.limiting}`];
    if (!X || !mr) return null;
    const curve = invRateCurve(X, mr);
    if (curve.pts.length < 2) return null;
    const x0 = curve.pts[0]!.x;
    const xEnd = curve.pts[curve.pts.length - 1]!.x;
    // AUTHORIZED view geometry 2: trapezoids over the engine's own points.
    const area = xEnd > x0
      ? trapezoidAreaInView(curve.pts, x0, xEnd) : null;
    const FlimIn = pfrInletLimitingFlow(pfrFeed.profile, pfrFeed.limiting);
    const Vview = area !== null && FlimIn !== null ? area * FlimIn : null;
    const vr = pfrFeed.kpis?.["V_R"];
    const V_R = typeof vr === "number" && Number.isFinite(vr) ? vr : null;
    const relDev = Vview !== null && V_R !== null && V_R > 0
      ? Math.abs(Vview - V_R) / V_R : null;
    return {
      unit: pfrFeed.unit, limiting: pfrFeed.limiting,
      curve, x0, xEnd, area, FlimIn, Vview, V_R, relDev,
    };
  }, [pfrFeed]);

  // ---- The CSTR side: rectangle + the V_R comparison -----------------------
  const cstrView = useMemo(() => {
    if (!cstrFeed) return null;
    const rect = cstrRectangle(cstrFeed.kpis, cstrFeed.limiting);
    if (!rect) return null;
    const FlimIn = feedLimitingFlow(cstrStreams, cstrFeed.limiting);
    const Vview = FlimIn !== null ? FlimIn * rect.specificVolume : null;
    const relDev = Vview !== null && rect.V_R > 0
      ? Math.abs(Vview - rect.V_R) / rect.V_R : null;
    return {
      unit: cstrFeed.unit, limiting: cstrFeed.limiting,
      rect, FlimIn, Vview, relDev,
    };
  }, [cstrFeed, cstrStreams]);

  // ---- The punchline: rectangle vs area AT THE SAME X ----------------------
  // Classroom-only: only there are the two constructions guaranteed to share
  // feed and kinetics (the witnesses are twins and the knobs write the same
  // values into both).  Both operands are F_A0-normalized [m³·s/mol], so no
  // F cancels wrongly.  Null when the CSTR's X lies past the curve's finite
  // coverage — a partial area would silently understate the integral.
  const punchline = useMemo(() => {
    if (src !== "classroom" || !pfrView || !cstrView) return null;
    if (pfrView.limiting !== cstrView.limiting) return null;
    const X = cstrView.rect.X;
    if (!(X > pfrView.x0)) return null;
    const areaAtX = trapezoidAreaInView(pfrView.curve.pts, pfrView.x0, X);
    if (areaAtX === null || areaAtX <= 0) return null;
    return { areaAtX, ratio: cstrView.rect.specificVolume / areaAtX };
  }, [src, pfrView, cstrView]);

  // ---- The setup panel's content: source, knobs, provenance ----------------
  const controls = (
    <>
      {(appServable || source === "current") && (
        <SegmentedControl size="xs" value={src} fullWidth
          onChange={(v) => setSource(v === "current" ? "current" : "classroom")}
          data={[
            { label: "Classroom", value: "classroom" },
            { label: "Current run", value: "current" },
          ]} />
      )}
      {src === "classroom" && (
        <>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                re-solving both reactors — seconds, not instant
              </Text>
            </Group>
          )}
          {LEVENSPIEL_KNOBS.map((k) => (
            <KnobNumber key={k.id}
              label={k.unit ? `${k.label} [${k.unit}]` : k.label}
              value={knobs[k.id] ?? k.def} min={k.min} max={k.max} step={k.step}
              onChange={(v) => setKnobs((st) => ({ ...st, [k.id]: v }))} />
          ))}
          <PanelNote>{PROVENANCE_RUNS}</PanelNote>
          <PanelNote>{PROVENANCE_TWINS}</PanelNote>
        </>
      )}
    </>
  );

  // The engines' messages, verbatim — never rephrased, never swallowed.
  const alerts = (
    <>
      {src === "classroom" && pfrRun.err !== null && (
        <Alert color="red" variant="light" m={12}
          title="The PFR run refused or failed — the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {pfrRun.err}
          </Text>
        </Alert>
      )}
      {src === "classroom" && cstrRun.err !== null && (
        <Alert color="red" variant="light" m={12}
          title="The CSTR run refused or failed — the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {cstrRun.err}
          </Text>
        </Alert>
      )}
    </>
  );

  /*  ONE renderer for the lesson, above BOTH returns: the empty state and the
   *  full page show the same steps.  A tool that hides its explanation when
   *  the engine produced nothing is exactly backwards — the reader with no
   *  chart is the reader who most needs the argument. */
  const lessonStep = (n: number) => {
    const st = LEVENSPIEL_STEPS.find((x) => x.n === n);
    if (!st) return null;
    return (
      <Box key={n}>
        <Title order={5}>{st.n} · {st.title}</Title>
        <Text size="sm" mt={4}>{st.body}</Text>
        {st.formula && (
          <Box my={8} px="sm" py={6}
            style={{ borderLeft: "3px solid var(--mantine-color-default-border)" }}>
            <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {st.formula}
            </Text>
          </Box>
        )}
        {st.note && <Text size="sm" c="dimmed">{st.note}</Text>}
      </Box>
    );
  };

  const lessonHead = (
    <Box>
      <Title order={3}>Sizing a reactor, where the area IS the volume</Title>
      <Text size="sm" c="dimmed" mt={4}>
        One curve, two shapes under it — and the shape of the curve decides
        which reactor you should build.
      </Text>
    </Box>
  );

  const lessonLimits = (
    <Box>
      <Title order={5}>What this does not model</Title>
      <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {LEVENSPIEL_LIMITS.map((l) => (
          <Text key={l.id} size="xs" c="dimmed">
            <b>{l.title}</b> {l.body}
          </Text>
        ))}
      </Box>
    </Box>
  );

  // ---- Nothing drawable yet: per-source honest states -----------------------
  if (pfrView === null && cstrView === null) {
    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        {lessonHead}
        {alerts}
        {[1, 2, 3, 4, 5].map(lessonStep)}
        <Stack gap={8} style={{ maxWidth: 280 }}>{controls}</Stack>
        <Box style={{ display: "flex", alignItems: "center",
          justifyContent: "center", padding: 12 }}>
          {src === "classroom"
            && pfrRun.err === null && cstrRun.err === null
            && (busy || pfrRun.result === null || cstrRun.result === null) ? (
            <Group gap="sm" wrap="nowrap" align="center">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                the engine is solving both reactors — seconds, not instant
              </Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed" ta="center" maw={480}>
              {src === "classroom"
                ? "The classroom runs finished but published neither "
                  + "Levenspiel surface"
                : "This run serves neither side of the Levenspiel "
                  + "construction"}
              {" "}— it needs a PFR profile carrying X and minus_r_&lt;comp&gt;
              columns, or a CSTR KPI block carrying minus_r_&lt;comp&gt;,
              X_limiting and V_R.
            </Text>
          )}
        </Box>
        {lessonLimits}
        </Stack>
      </Box>
    );
  }

  const limiting = pfrView?.limiting ?? cstrView?.limiting ?? "A";

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
      {lessonHead}
      {alerts}
      {lessonStep(1)}
      {lessonStep(2)}
      {lessonStep(3)}

      <Box>
        <Title order={5}>Now read the two reactors the engine solved</Title>
        <Text size="sm" mt={4}>
          Below, the same duty done twice.  The shaded area is the PFR&apos;s
          volume and the outlined rectangle is the CSTR&apos;s, both drawn from
          the engines&apos; own published points — the twins share a feed, a
          reaction file and a thermophysical system, so the only difference on
          the chart is the reactor.  Turn a knob and watch the two shapes move
          against each other.
        </Text>
      </Box>

      <Box style={{ display: "grid", gap: 14,
        gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
        <Stack gap={8}>{controls}</Stack>
        <Box style={{ minWidth: 0 }}>

      {/* Chips: what each construction honestly claims. */}
      <Group gap="sm" wrap="wrap" align="center" px={12} py={6}
        style={{ flexShrink: 0 }}>
        {pfrView && (
          <Tooltip withArrow multiline w={440}
            label={"PFR: V = F_lim,in·∫dX/(−r).  Every ordinate is the "
              + "engine's published minus_r column at its own RK4 points; "
              + "F_lim,in is the profile's own inlet F_"
              + `${pfrView.limiting} sample (${fmt(pfrView.FlimIn)} mol/s).  `
              + "Agreement means the graphical construction REPRODUCES the "
              + "engine's integration — the residual is trapezoid-vs-RK4 "
              + "truncation on the same grid — never evidence the model is "
              + "right."}>
            <Badge variant="light" color="cyan" tt="none"
              styles={{ root: { cursor: "help" } }}>
              PFR area·F_lim,in = {fmt(pfrView.Vview)} m³ vs V_R ={" "}
              {fmt(pfrView.V_R)} m³
              {pfrView.relDev !== null
                && ` (Δ = ${pfrView.relDev.toExponential(2)})`}
            </Badge>
          </Tooltip>
        )}
        {pfrView && pfrView.Vview === null && (
          <Text size="xs" c="dimmed">
            PFR area = {fmt(pfrView.area)} (m³·s)/mol per mole of feed — the
            absolute-volume comparison needs the profile&apos;s inlet
            F_{pfrView.limiting} sample, which this run did not publish.
          </Text>
        )}
        {cstrView && (
          <Tooltip withArrow multiline w={440}
            label={cstrView.Vview !== null
              ? "CSTR: V = F_lim,in·X/(−r) — the engine's own design "
                + "identity, restated from four independently published "
                + "numbers: the feed stream's F·z_"
                + `${cstrView.limiting} (${fmt(cstrView.FlimIn)} mol/s, `
                + "arithmetic on two engine stream numbers) and the KPIs "
                + "X_limiting, minus_r, V_R.  It closes at ~1e-12 on the "
                + "witness because the engine solved exactly this equation."
              : "No unique feed stream carrying "
                + `${cstrView.limiting} is published by this run, so `
                + "F_lim,in is not derivable from published numbers — the "
                + "rectangle is compared in F_A0-normalized units "
                + "(m³·s/mol) instead, and this is said rather than a "
                + "flow invented."}>
            <Badge variant="light" color="orange" tt="none"
              styles={{ root: { cursor: "help" } }}>
              {cstrView.Vview !== null
                ? `CSTR rect·F_lim,in = ${fmt(cstrView.Vview)} m³ vs V_R = `
                  + `${fmt(cstrView.rect.V_R)} m³ (Δ = `
                  + `${cstrView.relDev !== null
                    ? cstrView.relDev.toExponential(2) : "—"})`
                : `CSTR rectangle = ${fmt(cstrView.rect.specificVolume)} `
                  + "(m³·s)/mol — F_A0-normalized (no unique feed stream)"}
            </Badge>
          </Tooltip>
        )}
        {punchline && cstrView && (
          <Tooltip withArrow multiline w={460}
            label={"Same job, same chemistry: the witnesses are twins (same "
              + "0/feed, same constant/reactions — pinned by the test "
              + "suite) and the knobs write the same T and feed into both.  "
              + `At the CSTR's own X = ${fmt(cstrView.rect.X)}, the `
              + "rectangle circumscribes the area because 1/(−r) RISES with "
              + "X for positive-order kinetics: the CSTR does its entire "
              + "duty at the outlet's lowest rate, the PFR only its last "
              + "sliver.  Both operands are F_A0-normalized (m³·s/mol), "
              + "off the engine's own published points."}>
            <Badge variant="light" color={punchline.ratio > 1 ? "teal" : "yellow"}
              tt="none" styles={{ root: { cursor: "help" } }}>
              same X = {fmt(cstrView.rect.X)}: CSTR rectangle ={" "}
              {fmt(punchline.ratio, 3)}× the PFR area
            </Badge>
          </Tooltip>
        )}
        {src === "classroom" && !punchline && pfrView && cstrView && (
          <Text size="xs" c="dimmed">
            no same-X comparison — the CSTR&apos;s X lies outside the
            curve&apos;s finite coverage (a partial area would understate the
            integral, so none is claimed).
          </Text>
        )}
        {src === "current" && pfrView && cstrView && (
          <Text size="xs" c="dimmed">
            same-X punchline is classroom-only: this run&apos;s two units are
            not verified to share feed and kinetics, and comparing areas
            across different chemistries would be a different claim.
          </Text>
        )}
      </Group>

      {/* The chart. */}
      <LevenspielSvg
        pfr={pfrView
          ? { curve: pfrView.curve, x0: pfrView.x0, xEnd: pfrView.xEnd }
          : null}
        cstr={cstrView ? { rect: cstrView.rect } : null}
        limiting={limiting}
        busyOverlay={src === "classroom" && busy} />

      {/* The view-geometry provenance, each transform labeled (the standing
          Methods rule: what this file computes, it declares). */}
      <Box px={12} pb={8} style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed">
          Ordinate: 1/(−r_{limiting}) — an ordinate transform for display over
          the engine&apos;s published (X, −r) points [(m³·s)/mol].
          {" "}Shaded area: trapezoids over those same points from X ={" "}
          {fmt(pfrView?.x0 ?? 0, 2)} to X_PFR — the authorized view geometry;
          the RK4 that made the points is the engine&apos;s.
          {" "}Rectangle: X_out·1/(−r_out) from the CSTR&apos;s published
          KPIs.  Nothing here re-derives kinetics.
        </Text>
        {pfrView && pfrView.curve.excludedCount > 0 && (
          <Text size="xs" c="dimmed">
            {pfrView.curve.excludedCount} published point
            {pfrView.curve.excludedCount === 1 ? "" : "s"} where the rate
            vanishes (−r ≤ 0) excluded from the 1/(−r) view — reported here
            and annotated on the chart, never silently dropped.  WHY it
            vanishes is not decided here: equilibrium is one reason, a
            consumed limiting reactant and a rate law asked a question
            outside its window are others.
          </Text>
        )}
      </Box>
        </Box>
      </Box>

      {lessonStep(4)}
      {lessonStep(5)}
      {lessonLimits}
      </Stack>
    </Box>
  );
}
