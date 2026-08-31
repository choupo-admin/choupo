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
  PinchCompositeTool — the ENGINE's pinch targets, drawn.  Unlike PinchView
  (which recomputes a pinch analysis in the browser from the run's KPIs), this
  tool reads what the C++ PinchPass itself published:

    reports/pinch/compositeCurves.csv    curve,T_K,H_kW — curves "hot", "cold",
                                         "hotShifted", "coldShifted" (verified
                                         against PinchPass.cpp's emit calls; the
                                         engine publishes NO grand-composite
                                         curve, so the GCC here is derived)
    reports/pinch/candidateMatches.csv   region,hotStream,coldStream,
                                         temperatureFeasible,pinchRule,
                                         maximumCandidateDuty_kW,limitingReason,
                                         recommendation
    KPI row "pinch"                      Q_H_min_kW, Q_C_min_kW, T_pinch_K
                                         (shifted scale), T_pinch_hot_K,
                                         T_pinch_cold_K, dTmin_K, ...

  The plane's standing rule is ZERO physics in TypeScript.  The ONE authorized
  exception this tool carries is method GEOMETRY: the Linnhoff-Flower heat
  cascade re-run over the engine's OWN published shifted composite curves —
  pure arithmetic on the CSV, no stream data, no Cp, no dTmin of its own (the
  shift is already inside the curves the engine wrote).  It feeds exactly two
  surfaces, both labelled "derived in view": the cross-check chip (does the
  cascade over the published curves reproduce the engine's KPI targets?) and
  the grand composite curve.  The engine's KPI row is the judge — a
  disagreement is a finding about this tool's reading, never a moved target.

  The candidate-match table renders the engine's own words.  Per the pinch
  pass's doctrine, every feasible row is a "thermodynamically admissible
  candidate" — no row is ever ranked, and no superlative appears anywhere in
  this file (gate-checked by the test).

  SELF-FEEDING (the Methods plane's standalone contract): the DEFAULT source
  is "Classroom" — the tool runs the ENGINE itself (choupoSolve, WASM, via
  case/methodRun.ts) on its bundled witness case
  tutorials/steady/heat/pinch01_four_stream_classic, with the knob values
  (supply temperatures, flows, dTmin) written into the witness's own dicts by
  methodRun's textual scalar override.  ZERO physics enters TypeScript on
  that path either: the knobs edit declared dict scalars and the engine
  recomputes the targets — with each heater's hardware duty Q fixed in the
  flowsheet, moving a supply T or a flow moves the outlet T through the
  engine's own enthalpy balance, and the pinch pass re-extracts the stream
  population from the converged result.  The "Current run" source keeps the
  original behaviour (read the app run's published pinch artefacts) and is
  offered when that run carries them; its old empty state lives only there.

  Charts are inline SVG (the EpsilonNtuTool precedent) — the plotly bundle
  cannot load outside a browser, and the pure helpers here must stay
  importable by the node test runner (tests/pinchCompositeTool.test.ts).

  CHROME: a scrolling teaching page, not an instrument panel.  The lesson is
  DATA (ui/methods/pinchLesson.ts) and is rendered by ONE hoisted renderer, so
  it cannot exist in one branch and vanish in another; the definitions come
  BEFORE the curves and the consequences — the ΔT_min trade and the three
  rules — come after them, because a reader who has not yet seen what the
  overlap means has nothing to read the plot with.  The knobs sit in a
  two-column grid beside the picture.  Every honesty surface the panel
  carried is kept: the engine's targets chip, the derived-in-view cross-check,
  the verbatim engine refusal, the candidate table's own wording and the
  limits list.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { lessonStepper } from "./lessonStep.js";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Stack, Table,
  Text, Title, Tooltip,
} from "@mantine/core";

import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import {
  KnobField, KnobNumber, PanelNote,
} from "./knobPanel.js";
import { PINCH_LIMITS, PINCH_STEPS } from "./pinchLesson.js";

// ---- Where the engine's pinch artefacts live in the run result --------------
// csvFiles keys are case-root-relative (solverWorker.js walks /case and strips
// the "/case/" prefix), so the reports keep their reports/... path.

export const COMPOSITE_CURVES_CSV_PATH = "reports/pinch/compositeCurves.csv";
export const CANDIDATE_MATCHES_CSV_PATH = "reports/pinch/candidateMatches.csv";

// ---- CSV parsing (the engine's own column contracts, verbatim) --------------

export interface CurvePoint {
  T_K: number;
  H_kW: number;
}

/** The curves of compositeCurves.csv, keyed by the engine's own labels
 *  ("hot", "cold", "hotShifted", "coldShifted").  Null when the text is not
 *  the engine's curve,T_K,H_kW format — an honest empty state, never a guess. */
export function parseCompositeCurves(
  csv: string,
): { [curve: string]: CurvePoint[] } | null {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((h) => h.trim());
  if (header.length !== 3 || header[0] !== "curve"
      || header[1] !== "T_K" || header[2] !== "H_kW") return null;
  const out: { [curve: string]: CurvePoint[] } = {};
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length !== 3) continue;
    const T = Number(f[1]);
    const H = Number(f[2]);
    if (!Number.isFinite(T) || !Number.isFinite(H)) continue;
    const name = f[0]!.trim();
    (out[name] ??= []).push({ T_K: T, H_kW: H });
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface CandidateMatch {
  region: string;
  hotStream: string;
  coldStream: string;
  temperatureFeasible: boolean;
  pinchRule: string;
  maximumCandidateDuty_kW: number;
  limitingReason: string;
  recommendation: string;
}

const MATCHES_HEADER =
  "region,hotStream,coldStream,temperatureFeasible,pinchRule,"
  + "maximumCandidateDuty_kW,limitingReason,recommendation";

/** candidateMatches.csv rows, verbatim.  The engine writes no quoting and no
 *  field of its contains a comma, so a plain 8-field split IS the writer's
 *  format; a row of any other arity is skipped rather than misread. */
export function parseCandidateMatches(csv: string): CandidateMatch[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 1 || lines[0] !== MATCHES_HEADER) return [];
  const out: CandidateMatch[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length !== 8) continue;
    const Q = Number(f[5]);
    if (!Number.isFinite(Q)) continue;
    out.push({
      region: f[0]!, hotStream: f[1]!, coldStream: f[2]!,
      temperatureFeasible: f[3] === "yes",
      pinchRule: f[4]!,
      maximumCandidateDuty_kW: Q,
      limitingReason: f[6]!, recommendation: f[7]!,
    });
  }
  return out;
}

/** Why a row is visibly flagged: not temperature-feasible at dTmin, or a
 *  pinch match whose CP rule the engine marked VIOLATED (still admissible —
 *  away from the pinch only, in the engine's own words).  Null = plain row. */
export function candidateFlag(m: CandidateMatch): "infeasible" | "cpRuleViolated" | null {
  if (!m.temperatureFeasible) return "infeasible";
  if (m.pinchRule.includes("VIOLATED")) return "cpRuleViolated";
  return null;
}

// ---- The cascade over the engine's shifted curves (derived in view) ---------
// The authorized method geometry: H(T*) of each shifted composite is the exact
// integral of that population's interval CPs, so differencing the two curves
// between temperature levels reproduces the problem table's per-interval
// dH = (sumCP_hot - sumCP_cold) * dT without ever touching a stream.

/** Piecewise-linear read of a composite H(T), clamped outside its domain
 *  (below the cold end the curve carries nothing; above the hot end it is
 *  fully integrated).  `curve` must be sorted ascending in T. */
export function interpolateH(curve: CurvePoint[], T: number): number {
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  if (T <= first.T_K) return first.H_kW;
  if (T >= last.T_K) return last.H_kW;
  for (let i = 0; i + 1 < curve.length; ++i) {
    const a = curve[i]!;
    const b = curve[i + 1]!;
    if (T <= b.T_K) {
      const w = (T - a.T_K) / (b.T_K - a.T_K);
      return a.H_kW + w * (b.H_kW - a.H_kW);
    }
  }
  return last.H_kW;
}

export interface DerivedPinch {
  Q_H_min_kW: number;
  Q_C_min_kW: number;
  /** Pinch on the SHIFTED scale — comparable to the engine's T_pinch_K KPI. */
  T_pinch_K: number;
  /** The grand composite: net cascade + Q_H_min at every shifted level,
   *  descending T*.  H >= 0 everywhere, exactly 0 at the pinch. */
  gcc: CurvePoint[];
}

/** The Linnhoff-Flower cascade re-run over the engine's published hotShifted /
 *  coldShifted curves.  ONE pass feeds both readouts (the cross-check chip and
 *  the GCC) so the two can never disagree with each other.  Mirrors the
 *  engine's own conventions: the cascade starts at 0 from the top level, the
 *  running minimum uses the same 1e-9 band, Q_H_min = -min(cascade),
 *  Q_C_min = cascade(bottom) + Q_H_min. */
export function computePinchFromCurves(
  hotShifted: CurvePoint[] | undefined,
  coldShifted: CurvePoint[] | undefined,
): DerivedPinch | null {
  if (!hotShifted || !coldShifted
      || hotShifted.length < 2 || coldShifted.length < 2) return null;
  const hot = [...hotShifted].sort((a, b) => a.T_K - b.T_K);
  const cold = [...coldShifted].sort((a, b) => a.T_K - b.T_K);
  const levels = [...new Set([...hot, ...cold].map((p) => p.T_K))]
    .sort((a, b) => b - a);
  if (levels.length < 2) return null;

  const top = levels[0]!;
  const hTop = interpolateH(hot, top);
  const cTop = interpolateH(cold, top);

  // cascade(T*) = heat released by hot streams above T* minus heat absorbed
  // by cold streams above T* — the problem table's running sum, read off the
  // curves instead of the stream population.
  const cascade = levels.map((T) =>
    (hTop - interpolateH(hot, T)) - (cTop - interpolateH(cold, T)));

  let minCascade = 0.0;
  let Tpinch = top;
  for (let i = 0; i < levels.length; ++i) {
    if (cascade[i]! < minCascade - 1.0e-9) {
      minCascade = cascade[i]!;
      Tpinch = levels[i]!;
    }
  }
  const QHmin = -minCascade;
  const QCmin = cascade[cascade.length - 1]! + QHmin;
  const gcc = levels.map((T, i) => ({ T_K: T, H_kW: cascade[i]! + QHmin }));
  return { Q_H_min_kW: QHmin, Q_C_min_kW: QCmin, T_pinch_K: Tpinch, gcc };
}

// ---- The cross-check against the engine's KPI row ---------------------------

export interface CrossCheckRow {
  key: "Q_H_min_kW" | "Q_C_min_kW" | "T_pinch_K";
  engine: number;
  derived: number;
  /** derived - engine. */
  deviation: number;
  agrees: boolean;
}

/** Relative agreement band (with an absolute floor of the same size) — the
 *  CSV carries 10 significant digits, so real agreement sits far inside it. */
export const CROSS_CHECK_TOL = 1.0e-6;

/** Compare the derived cascade targets against the engine's "pinch" KPI row.
 *  Only keys the engine actually published are compared; the engine's number
 *  is the judge and never moves. */
export function crossCheckAgainstKpis(
  derived: DerivedPinch,
  kpis: { [key: string]: number } | undefined,
): CrossCheckRow[] {
  if (!kpis) return [];
  const pairs: [CrossCheckRow["key"], number][] = [
    ["Q_H_min_kW", derived.Q_H_min_kW],
    ["Q_C_min_kW", derived.Q_C_min_kW],
    ["T_pinch_K", derived.T_pinch_K],
  ];
  const rows: CrossCheckRow[] = [];
  for (const [key, d] of pairs) {
    const e = kpis[key];
    if (typeof e !== "number" || !Number.isFinite(e)) continue;
    const deviation = d - e;
    const scale = Math.max(1.0, Math.abs(e));
    rows.push({ key, engine: e, derived: d, deviation,
      agrees: Math.abs(deviation) <= CROSS_CHECK_TOL * scale });
  }
  return rows;
}

// ---- SVG chart geometry -----------------------------------------------------

const W = 640, H = 420;
const X0 = 62, X1 = 616, Y0 = 16, Y1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const HOT = "#ff8a65";     // the kit's warm2 — heat sources (being cooled)
const COLD = "#80deea";    // the kit's accent2 — heat sinks (being heated)
const GCC = "#69db7c";     // PinchView's grand-composite green
const PINCH = "#ffd43b";

const fmt = (v: number | undefined, digits = 1) =>
  v !== undefined && Number.isFinite(v) ? v.toFixed(digits) : "—";

interface Frame {
  toX: (h: number) => number;
  toY: (t: number) => number;
  hLo: number; hHi: number; tLo: number; tHi: number;
}

function makeFrame(points: CurvePoint[]): Frame {
  const hs = points.map((p) => p.H_kW);
  const ts = points.map((p) => p.T_K);
  const hMin = Math.min(0, ...hs);
  const hMax = Math.max(...hs, hMin + 1.0e-9);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts, tMin + 1.0e-9);
  const hPad = 0.04 * (hMax - hMin);
  const tPad = Math.max(1.0, 0.05 * (tMax - tMin));
  const hLo = hMin, hHi = hMax + hPad;
  const tLo = tMin - tPad, tHi = tMax + tPad;
  return {
    toX: (h) => X0 + ((X1 - X0) * (h - hLo)) / (hHi - hLo),
    toY: (t) => Y1 - ((Y1 - Y0) * (t - tLo)) / (tHi - tLo),
    hLo, hHi, tLo, tHi,
  };
}

function polyline(frame: Frame, pts: CurvePoint[]): string {
  return pts
    .map((p) => `${frame.toX(p.H_kW).toFixed(2)},${frame.toY(p.T_K).toFixed(2)}`)
    .join(" ");
}

function Axes({ frame, xLabel, yLabel }: {
  frame: Frame; xLabel: string; yLabel: string;
}): JSX.Element {
  const hTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (f) => frame.hLo + f * (frame.hHi - frame.hLo));
  const tTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (f) => frame.tLo + f * (frame.tHi - frame.tLo));
  return (
    <g>
      {hTicks.map((h) => (
        <g key={`gx${h}`}>
          <line x1={frame.toX(h)} y1={Y0} x2={frame.toX(h)} y2={Y1}
            stroke={GRID} strokeWidth={0.6} />
          <text x={frame.toX(h)} y={Y1 + 16} textAnchor="middle"
            fontSize={11} fill={INK}>{h.toFixed(0)}</text>
        </g>
      ))}
      {tTicks.map((t) => (
        <g key={`gy${t}`}>
          <line x1={X0} y1={frame.toY(t)} x2={X1} y2={frame.toY(t)}
            stroke={GRID} strokeWidth={0.6} />
          <text x={X0 - 6} y={frame.toY(t) + 4} textAnchor="end"
            fontSize={11} fill={INK}>{t.toFixed(0)}</text>
        </g>
      ))}
      <text x={(X0 + X1) / 2} y={H - 8} textAnchor="middle"
        fontSize={12} fill={INK}>{xLabel}</text>
      <text x={16} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize={12}
        fill={INK} transform={`rotate(-90 16 ${(Y0 + Y1) / 2})`}>{yLabel}</text>
    </g>
  );
}

/** Hot + cold composite curves, straight from the engine's CSV (unshifted —
 *  the actual T scales), with the KPI pinch temperatures as dashed guides. */
function CompositeSvg({ hot, cold, pinchHot, pinchCold }: {
  hot: CurvePoint[]; cold: CurvePoint[];
  pinchHot?: number; pinchCold?: number;
}): JSX.Element {
  const frame = makeFrame([...hot, ...cold]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="hot and cold composite curves">
      <Axes frame={frame} xLabel="cumulative enthalpy H (kW)" yLabel="T (K)" />
      {pinchHot !== undefined && Number.isFinite(pinchHot) && (
        <g>
          <line x1={X0} y1={frame.toY(pinchHot)} x2={X1} y2={frame.toY(pinchHot)}
            stroke={HOT} strokeWidth={0.9} strokeDasharray="4 4" />
          <text x={X1 - 4} y={frame.toY(pinchHot) - 4} textAnchor="end"
            fontSize={10} fill={HOT}>pinch (hot) {pinchHot.toFixed(2)} K</text>
        </g>
      )}
      {pinchCold !== undefined && Number.isFinite(pinchCold) && (
        <g>
          <line x1={X0} y1={frame.toY(pinchCold)} x2={X1} y2={frame.toY(pinchCold)}
            stroke={COLD} strokeWidth={0.9} strokeDasharray="4 4" />
          <text x={X1 - 4} y={frame.toY(pinchCold) + 12} textAnchor="end"
            fontSize={10} fill={COLD}>pinch (cold) {pinchCold.toFixed(2)} K</text>
        </g>
      )}
      <polyline points={polyline(frame, hot)} fill="none"
        stroke={HOT} strokeWidth={2.2} />
      <polyline points={polyline(frame, cold)} fill="none"
        stroke={COLD} strokeWidth={2.2} />
      <text x={X0 + 8} y={Y0 + 14} fontSize={11} fill={HOT}>hot composite (sources)</text>
      <text x={X0 + 8} y={Y0 + 28} fontSize={11} fill={COLD}>cold composite (sinks)</text>
    </svg>
  );
}

/** The grand composite curve — derived in view from the engine's shifted
 *  composite curves (the engine publishes no GCC of its own). */
function GccSvg({ gcc, Tpinch }: { gcc: CurvePoint[]; Tpinch: number }): JSX.Element {
  const frame = makeFrame(gcc);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="grand composite curve">
      <Axes frame={frame} xLabel="net heat flow H (kW)" yLabel="shifted T* (K)" />
      <line x1={frame.toX(0)} y1={Y0} x2={frame.toX(0)} y2={Y1}
        stroke={INK} strokeWidth={1.1} />
      <polyline points={polyline(frame, gcc)} fill="none"
        stroke={GCC} strokeWidth={2.2} />
      <circle cx={frame.toX(0)} cy={frame.toY(Tpinch)} r={5}
        fill={PINCH} stroke="var(--mantine-color-body)" strokeWidth={1.5} />
      <text x={frame.toX(0) + 8} y={frame.toY(Tpinch) - 6}
        fontSize={11} fill={PINCH}>pinch · T* = {Tpinch.toFixed(2)} K</text>
    </svg>
  );
}

// ---- The candidate-matches table --------------------------------------------

function MatchesTable({ matches }: { matches: CandidateMatch[] }): JSX.Element {
  return (
    <Box style={{ overflow: "auto", height: "100%" }}>
      <Table stickyHeader striped withTableBorder fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>region</Table.Th>
            <Table.Th>hot</Table.Th>
            <Table.Th>cold</Table.Th>
            <Table.Th>Q_max (kW)</Table.Th>
            <Table.Th>pinch rule</Table.Th>
            <Table.Th>limiting reason</Table.Th>
            <Table.Th>engine&apos;s recommendation</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {matches.map((m, i) => {
            const flag = candidateFlag(m);
            return (
              <Table.Tr key={i}
                style={flag === "infeasible" ? { opacity: 0.65 } : undefined}>
                <Table.Td>{m.region}</Table.Td>
                <Table.Td>{m.hotStream}</Table.Td>
                <Table.Td>{m.coldStream}</Table.Td>
                <Table.Td>{fmt(m.maximumCandidateDuty_kW)}</Table.Td>
                <Table.Td>
                  {flag ? (
                    <Badge variant="light" size="sm"
                      color={flag === "infeasible" ? "red" : "orange"}
                      styles={{ root: { textTransform: "none" } }}>
                      {flag === "infeasible"
                        ? "not temperature-feasible at dTmin"
                        : "CP rule violated at the pinch"}
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed">{m.pinchRule}</Text>
                  )}
                </Table.Td>
                <Table.Td>{m.limitingReason}</Table.Td>
                <Table.Td>{m.recommendation}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" p="xs">
        The engine&apos;s own wording, verbatim: every feasible row is a
        thermodynamically admissible candidate — the table ranks nothing and
        recommends no network.  A VIOLATED CP rule keeps its away-from-pinch
        duty; an infeasible row is listed, never dropped.
      </Text>
    </Box>
  );
}

// ---- The standalone classroom witness + its knobs ---------------------------
// The witness is the bundled tutorial the classroom mode re-runs in the
// browser.  Its identifier is the bundled-corpus key (sub-classed categories
// carry the subclass segment: <category>/<subclass>/<case>).

export const PINCH_WITNESS = "steady/heat/pinch01_four_stream_classic";

/** One classroom knob: a declared scalar in one of the witness's own dict
 *  files.  `key` must be UNIQUE in `file` — methodRun's applyScalarOverride
 *  THROWS otherwise, and the test verifies every knob against the REAL
 *  bundled witness text.  `value` is the witness's own number, as written. */
export interface PinchKnob {
  id: string;
  label: string;
  /** Case-root-relative dict file the knob edits. */
  file: string;
  /** The dict key as written in that file. */
  key: string;
  /** The witness's own value, verbatim from its dict. */
  value: number;
  unit: string;
  min: number;
  step: number;
}

export const PINCH_KNOBS: readonly PinchKnob[] = [
  // The pass's minimum approach — system/postDict `dTmin 20 K;`.
  { id: "dTmin", label: "ΔTmin", file: "system/postDict", key: "dTmin",
    value: 20, unit: "K", min: 1, step: 1 },
  // Supply temperatures — each stream's own 0/ file, key `T` (unique there).
  { id: "h1T", label: "H1 supply T", file: "0/h1In", key: "T",
    value: 423.15, unit: "K", min: 273.15, step: 5 },
  { id: "h2T", label: "H2 supply T", file: "0/h2In", key: "T",
    value: 363.15, unit: "K", min: 273.15, step: 5 },
  { id: "c1T", label: "C1 supply T", file: "0/c1In", key: "T",
    value: 293.15, unit: "K", min: 273.15, step: 5 },
  { id: "c2T", label: "C2 supply T", file: "0/c2In", key: "T",
    value: 298.15, unit: "K", min: 273.15, step: 5 },
  // Molar flows — the single-component `hxFluid <F> mol/s;` line in each
  // inlet's componentMolarFlows block (unique per file).  CP = F·cp, so a
  // flow knob scales that stream's CP — in the engine, never here.
  { id: "h1F", label: "H1 flow", file: "0/h1In", key: "hxFluid",
    value: 20, unit: "mol/s", min: 1, step: 5 },
  { id: "h2F", label: "H2 flow", file: "0/h2In", key: "hxFluid",
    value: 80, unit: "mol/s", min: 1, step: 5 },
  { id: "c1F", label: "C1 flow", file: "0/c1In", key: "hxFluid",
    value: 25, unit: "mol/s", min: 1, step: 5 },
  { id: "c2F", label: "C2 flow", file: "0/c2In", key: "hxFluid",
    value: 30, unit: "mol/s", min: 1, step: 5 },
];

/** The ScalarOverride list for a knob-value map — one override per knob,
 *  missing ids falling back to the witness's own value. */
export function pinchOverrides(
  values: { [id: string]: number },
): ScalarOverride[] {
  return PINCH_KNOBS.map((k) => ({
    file: k.file, key: k.key, value: values[k.id] ?? k.value,
  }));
}

/* THE PER-TOOL FOLD KEY IS GONE (2026-08-18).  The name that used to be
 * exported here (PINCH_CONTROLS_COLLAPSED_KEY) answered "is THIS tool's knob
 * strip folded?", and there is no longer a per-tool answer to give.  There is
 * no fold at all now: the knobs sit in the page beside the curves, and a page
 * that scrolls has no chrome to put away. */

// ---- The workspace tool -----------------------------------------------------

type Pane = "composite" | "gcc" | "matches";
type Source = "classroom" | "current";

export function PinchCompositeTool(): JSX.Element {
  // ---- The app's own run — the "Current run" source. -----------------------
  const appRun = useStore((s) => s.runResult);
  const appHasPinch = !!(appRun?.csvFiles?.[COMPOSITE_CURVES_CSV_PATH]
    || appRun?.kpis?.["pinch"]);

  const [source, setSource] = useState<Source>("classroom");
  const [pane, setPane] = useState<Pane>("composite");

  // ---- Classroom knobs (values are session state; collapse persists). ------
  const [knobValues, setKnobValues] = useState<{ [id: string]: number }>(
    () => Object.fromEntries(PINCH_KNOBS.map((k) => [k.id, k.value])));
  // The fold reads and writes through the shared, junk-tolerant hook — this
  // used to be a fourth hand-rolled copy of the same try/catch pair.

  // ---- The classroom engine run: the witness with the knobs written in. ----
  const overridesKey = JSON.stringify(knobValues);
  const overrides = useMemo(() => pinchOverrides(knobValues),
    // overridesKey is the change signal for the value map (methodRun's own
    // convention); the map identity is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overridesKey]);
  const method = useMethodRun(
    source === "classroom" ? PINCH_WITNESS : null,
    overrides, overridesKey, "choupoSolve");

  // ---- The active result feeds the EXISTING rendering, unchanged. ----------
  const active = source === "classroom" ? method.result : appRun;
  const curvesCsv = active?.csvFiles?.[COMPOSITE_CURVES_CSV_PATH];
  const matchesCsv = active?.csvFiles?.[CANDIDATE_MATCHES_CSV_PATH];
  const kpis = active?.kpis?.["pinch"];

  const curves = useMemo(
    () => (curvesCsv ? parseCompositeCurves(curvesCsv) : null), [curvesCsv]);
  const matches = useMemo(
    () => (matchesCsv ? parseCandidateMatches(matchesCsv) : []), [matchesCsv]);
  const derived = useMemo(
    () => (curves
      ? computePinchFromCurves(curves["hotShifted"], curves["coldShifted"])
      : null),
    [curves]);
  const checks = useMemo(
    () => (derived ? crossCheckAgainstKpis(derived, kpis) : []),
    [derived, kpis]);

  // The toggle appears when the app run carries pinch artefacts (or the user
  // is already on "Current run" and needs the way back); the old empty state
  // lives ONLY under "Current run" — Classroom feeds itself.
  const showSourceToggle = appHasPinch || source === "current";
  const emptyCurrentRun = source === "current" && !curves && !kpis;

  const hot = curves?.["hot"];
  const cold = curves?.["cold"];
  const allAgree = checks.length > 0 && checks.every((c) => c.agrees);
  const checkLines = checks.map((c) =>
    `${c.key}: engine ${c.engine} · derived ${c.derived.toPrecision(10)}`
    + `  (Δ = ${c.deviation.toExponential(2)})`);

  /* THE KNOBS AND THE VIEW SWITCH — the only surfaces here that SET anything.
     They sit in the page beside the curves, in a two-column grid; the engine's
     targets and the cross-check chip stay above the picture, because they
     report and do not set.  ΔTmin spans both columns: it is the knob the
     lesson is about. */
  const controls = (
    <>
      {showSourceToggle && (
        <SegmentedControl size="xs" value={source} fullWidth
          onChange={(v) => setSource(v as Source)}
          data={[
            { label: "Classroom", value: "classroom" },
            { label: "Current run", value: "current" },
          ]} />
      )}
      <KnobField label="view">
        <SegmentedControl size="xs" value={pane} fullWidth
          onChange={(v) => setPane(v as Pane)}
          data={[
            { label: "Composites", value: "composite" },
            { label: "Grand composite", value: "gcc" },
            { label: `Candidates (${matches.length})`, value: "matches" },
          ]} />
      </KnobField>
      {source === "classroom" && (
        <>
          <Box style={{ display: "grid", gap: 8,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {PINCH_KNOBS.map((k) => (
              <Box key={k.id} style={{ minWidth: 0,
                ...(k.id === "dTmin" ? { gridColumn: "1 / -1" } : {}) }}>
                <KnobNumber label={`${k.label} (${k.unit})`}
                  value={knobValues[k.id] ?? k.value} min={k.min} step={k.step}
                  onChange={(v) => setKnobValues((st) => ({ ...st, [k.id]: v }))} />
              </Box>
            ))}
          </Box>
          <Button size="compact-xs" variant="subtle" color="gray"
            onClick={() => setKnobValues(Object.fromEntries(
              PINCH_KNOBS.map((k) => [k.id, k.value])))}>
            reset to the witness
          </Button>
          <PanelNote>
            Classroom mode — standalone: choupoSolve (WASM) runs in the browser
            on the witness case <code>tutorials/{PINCH_WITNESS}</code>, with the
            knob values written into its own dicts; every number beside the
            curves is the engine&apos;s output.
          </PanelNote>
        </>
      )}
    </>
  );

  /* The reported numbers: the engine's targets, and the derived-in-view
     cross-check that says whether this tool read them correctly. */
  const chips = (
    <Group gap={8} align="center" wrap="wrap">
      {active && !emptyCurrentRun && (
        <Badge variant="light" color="gray" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          {kpis
            ? `engine targets · Q_H,min ${fmt(kpis["Q_H_min_kW"])} kW · `
              + `Q_C,min ${fmt(kpis["Q_C_min_kW"])} kW · `
              + `pinch T* ${fmt(kpis["T_pinch_K"], 2)} K · `
              + `ΔTmin ${fmt(kpis["dTmin_K"], 0)} K`
            : "no pinch KPI row in this run — curves shown, targets unverified"}
        </Badge>
      )}
      {/*  THE EXCESS, DECOMPOSED -- the one identity on this page a reader can
           redo on paper, and the page stated it in symbols only.  The lesson
           says "excess over target = cross-pinch transfer + heating below +
           cooling above" and that "the gap between them is the whole point of
           the exercise", then showed no gap.  All four numbers are already
           published by PinchPass; three of them reached no surface.  */}
      {active && !emptyCurrentRun && kpis
        && kpis["Q_heat_current_kW"] != null
        && kpis["violation_heat_below_pinch_kW"] != null
        && kpis["violation_cool_above_pinch_kW"] != null && (
        <Badge variant="light" color="orange" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          {`excess over target · ${fmt(kpis["Q_heat_current_kW"])}`
            + ` − ${fmt(kpis["Q_H_min_kW"])}`
            + ` = ${fmt(kpis["Q_heat_current_kW"]! - kpis["Q_H_min_kW"]!)} kW`
            + `  =  ${fmt(kpis["violation_heat_below_pinch_kW"])} heating below`
            + ` + ${fmt(kpis["violation_cool_above_pinch_kW"])} cooling above`}
        </Badge>
      )}
      {derived && checks.length > 0 && (
        <Tooltip withArrow multiline w={380}
          label={"Derived in view: the Linnhoff-Flower cascade re-run over"
            + " the engine's published hotShifted/coldShifted curves.\n"
            + checkLines.join("\n")}
          styles={{ tooltip: { whiteSpace: "pre-line" } }}>
          <Badge variant="light" size="lg"
            color={allAgree ? "teal" : "orange"}
            styles={{ root: { textTransform: "none", cursor: "help" } }}>
            {allAgree
              ? "cross-check (derived in view): cascade reproduces the engine's targets"
              : "cross-check (derived in view): DISAGREES — a finding about this"
                + " tool's reading, the engine's targets stand"}
          </Badge>
        </Tooltip>
      )}
      {derived && checks.length === 0 && (
        <Badge variant="light" color="gray" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          cross-check unavailable — no engine KPI row to compare against
        </Badge>
      )}
    </Group>
  );

  /* ONE renderer for the lesson, hoisted above everything that branches: the
     steps must not be able to exist on one path and vanish on another (the
     empty states below are branches inside the SAME page, so the reader who
     has no curves still gets the whole argument). */
  const lessonStep = lessonStepper(PINCH_STEPS);

  const lessonHead = (
    <Box>
      <Title order={3}>
        Pinch analysis, or how much energy the plant needs before you design it
      </Title>
      <Text size="sm" c="dimmed" mt={4}>
        Two curves, one temperature difference you choose, and three rules that
        turn out to be the same rule.
      </Text>
    </Box>
  );

  const lessonLimits = (
    <Box>
      <Title order={5}>What this does not model</Title>
      <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {PINCH_LIMITS.map((l) => (
          <Text key={l.id} size="xs" c="dimmed">
            <b>{l.title}</b> {l.body}
          </Text>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        {lessonHead}

        {lessonStep(1)}
        {lessonStep(2)}
        {lessonStep(3)}

        <Box>
          <Title order={5}>Now read the curves the engine published</Title>
          <Text size="sm" mt={4}>
            The two composites below are the engine&apos;s own, straight off{" "}
            <code>{COMPOSITE_CURVES_CSV_PATH}</code>: the horizontal gap
            between their ends is what the process can recover from itself, and
            the two overhangs are the targets in the chip above.  The grand
            composite is the same cascade plotted against the shifted
            temperature — it touches zero AT the pinch, and any bulge away from
            the axis is heat the process passes down through itself rather than
            to a utility.  The candidate table is the engine&apos;s exhaustive
            hot × cold analysis, in its own words.
          </Text>
        </Box>

        {chips}

        {source === "classroom" && method.err && (
          /* The engine's refusal, VERBATIM — a refusal is a teaching surface
             and is never paraphrased away by a layout change. */
          <Alert color="red" variant="light" title="choupoSolve (WASM)">
            <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {method.err}
            </Text>
          </Alert>
        )}

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(220px, 300px) 1fr" }}>
          <Stack gap={8} style={{ minWidth: 0 }}>{controls}</Stack>
          <Box pos="relative" style={{ minWidth: 0, height: 460 }}>
            {/* Honest empty state — ONLY for the "Current run" source; the
                classroom source feeds itself. */}
            {emptyCurrentRun && (
              <Box style={{ height: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", padding: 24 }}>
                <Text size="sm" c="dimmed" ta="center" maw={520}>
                  No pinch targets in this run.  This tool reads the
                  engine&apos;s own pinch pass: declare <code>pinchPass</code>{" "}
                  in the case&apos;s <code>system/postDict</code> chain and run
                  a converged steady case — the engine then writes{" "}
                  <code>reports/pinch/compositeCurves.csv</code> +{" "}
                  <code>candidateMatches.csv</code> and publishes the{" "}
                  <code>pinch</code> KPI row.  Witness case:{" "}
                  <code>tutorials/{PINCH_WITNESS}</code>.
                </Text>
              </Box>
            )}
            {/* Classroom source before its first result: the run is in flight
                (Loader) or it refused (the Alert above carries the words). */}
            {source === "classroom" && !active && (
              <Box style={{ height: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", padding: 24 }}>
                {method.busy
                  ? <Loader size="lg" />
                  : (
                    <Text size="sm" c="dimmed" ta="center" maw={520}>
                      {method.err
                        ? "The classroom run did not produce a result — the engine's own words are in the alert above."
                        : "Waiting for the classroom engine run."}
                    </Text>
                  )}
              </Box>
            )}
            {!emptyCurrentRun && active && (<>
            {pane === "composite" && (hot && cold ? (
              <CompositeSvg hot={hot} cold={cold}
                pinchHot={kpis?.["T_pinch_hot_K"]} pinchCold={kpis?.["T_pinch_cold_K"]} />
            ) : (
              <Box p="xl">
                <Text size="sm" c="dimmed">
                  This run carries no <code>{COMPOSITE_CURVES_CSV_PATH}</code> with
                  hot + cold curves — the pinch pass writes both on every run that
                  finds duty-carrying units; re-run the case.
                </Text>
              </Box>
            ))}
            {pane === "gcc" && (derived ? (
              <Stack gap={4} h="100%" style={{ minHeight: 0 }}>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  Derived in view from the engine&apos;s shifted composite curves
                  (<code>hotShifted</code>/<code>coldShifted</code> in{" "}
                  <code>{COMPOSITE_CURVES_CSV_PATH}</code>) — the engine publishes
                  no grand-composite curve of its own.  The temperature shift
                  (±ΔTmin/2) is already inside those curves; nothing here re-applies
                  it.
                </Text>
                <Box style={{ flex: 1, minHeight: 0 }}>
                  <GccSvg gcc={derived.gcc} Tpinch={derived.T_pinch_K} />
                </Box>
              </Stack>
            ) : (
              <Box p="xl">
                <Text size="sm" c="dimmed">
                  The grand composite is derived from the engine&apos;s{" "}
                  <code>hotShifted</code>/<code>coldShifted</code> curves and this
                  run carries none — the pinch pass writes them beside the actual
                  curves; re-run the case.
                </Text>
              </Box>
            ))}
            {pane === "matches" && (matches.length > 0 ? (
              <MatchesTable matches={matches} />
            ) : (
              <Box p="xl">
                <Text size="sm" c="dimmed">
                  No <code>{CANDIDATE_MATCHES_CSV_PATH}</code> in this run — the
                  pinch pass writes the exhaustive hot×cold analysis table on every
                  run that finds duty-carrying units; re-run the case.
                </Text>
              </Box>
            ))}
            </>)}
            {/* A knob changed while a previous result is on screen: the stale
                curves stay visible under the loader until the engine answers. */}
            {source === "classroom" && method.busy && active && (
              <Box style={{ position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                pointerEvents: "none" }}>
                <Loader size="lg" />
              </Box>
            )}
          </Box>
        </Box>

        <Text size="xs" c="dimmed">
          Every target here is the engine&apos;s (PinchPass, whose problem table
          is printed cascade row by cascade row in the run log); this view
          re-reads its published curves and derives nothing but the grand
          composite and the cross-check above, both labelled where they appear.
          The pass analyses the network the case declares — it designs nothing
          and rewrites nothing.
        </Text>

        {lessonStep(4)}
        {lessonStep(5)}

        {lessonLimits}
      </Stack>
    </Box>
  );
}
