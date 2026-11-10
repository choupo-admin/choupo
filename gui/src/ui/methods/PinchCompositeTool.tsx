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
  PinchCompositeTool — the ENGINE's pinch analysis, drawn.  This tool reads
  what the C++ PinchPass itself published and computes NOTHING (DEV.md 4c
  C234; it used to re-run the cascade over the shifted curves, a second home
  of the pass, and that is gone):

    reports/pinch/population.csv         the stream table (T_in, T_out, Q, CP
                                         of every segment, recovered side and
                                         service side)
    reports/pinch/problemTable.csv       the worked Linnhoff-Flower cascade:
                                         shifted intervals, sumCP, dH, the
                                         initial and the corrected cascade
    reports/pinch/summary.csv            the CLASS word (interiorPinch,
                                         severalPinches, threshold...), the
                                         pinches and the heat flow at the pinch
    reports/pinch/compositeCurves.csv    curve,T_K,H_kW — "hot", "cold",
                                         "hotShifted", "coldShifted"; the cold
                                         curve is drawn slid right by
                                         Q_C,min (the published offset)
    reports/pinch/candidateMatches.csv   region,hotStream,coldStream,
                                         temperatureFeasible,pinchRule,
                                         maximumCandidateDuty_kW,limitingReason,
                                         recommendation
    KPI row "pinch"                      Q_H_min_kW, Q_C_min_kW,
                                         Q_recovery_max_kW, T_pinch_*_K,
                                         n_pinches, dTmin_K, ...

  The grand composite curve IS the corrected cascade column of the problem
  table against T*; the annotations on the composites (the two utility
  intervals, the maximum recovery, the vertical gap at the pinch) are
  positions of published numbers.

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
  carried is kept: the engine's targets chip, the engine's classification,
  the verbatim engine refusal, the candidate table's own wording and the
  limits list.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { lessonStepper, LessonReferences } from "./lessonStep.js";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Stack, Table,
  Text, Title,
} from "@mantine/core";

import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { DEFAULT_PREFS, formatSig } from "../../state/displayUnits.js";
import { pinchUnits, type PinchUnits } from "../../case/pinchUnits.js";
import {
  KnobField, KnobNumber, PanelNote,
} from "./knobPanel.js";
import { PINCH_LIMITS, PINCH_STEPS } from "./pinchLesson.js";
import {
  PINCH_PASS_EXCERPT, PINCH_CLASS_TEXT, PROBLEM_TABLE_CSV_PATH, SUMMARY_CSV_PATH,
  POPULATION_CSV_PATH, parseProblemTable, parseSummary, parseStreamTable,
  grandCompositeFromTable, type ProblemRow, type StreamRow, type PinchSummary,
} from "../../case/pinch.js";
import { OriginMark } from "./origin.js";

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

// ---- THE CASCADE IS THE ENGINE'S (DEV.md 4c C234) ---------------------------
// This file used to re-run the Linnhoff-Flower cascade over the published
// shifted curves (`computePinchFromCurves`) and cross-check it against the KPI
// row: a second home of PinchPass.  The engine now writes the worked table
// (reports/pinch/problemTable.csv) and its classification (summary.csv); the
// page draws them and computes nothing.

// ---- WHAT THE TARGETS ARE THE TARGETS OF (C150 R16) --------------------------

/** The engine publishes how many segments it extracted and how many boundary
 *  heat duties it left OUT of the population (`segments`, `duties_excluded`,
 *  `Q_excluded_kW` on the "pinch" row).  A target drawn without that is a
 *  plant target only when nothing was left out, so the chip says which it is.
 *  Returns null when the run predates those KPIs (nothing to claim either
 *  way).  Pure: the engine decides, this only words it. */
export function populationScope(
  kpis: { [key: string]: number } | undefined,
  u: PinchUnits = pinchUnits(DEFAULT_PREFS),
): { label: string; partial: boolean } | null {
  if (!kpis) return null;
  const n = kpis["segments"], ex = kpis["duties_excluded"];
  if (typeof n !== "number" || typeof ex !== "number") return null;
  const seg = `${n} extracted segment${n === 1 ? "" : "s"}`;
  if (ex > 0) {
    const q = kpis["Q_excluded_kW"];
    return { partial: true,
      label: `targets of the ${seg}, not of the plant · ${ex} heat `
        + `dut${ex === 1 ? "y" : "ies"}`
        + (typeof q === "number" ? ` (${u.Q(q, 1)} ${u.qLabel})` : "")
        + " outside the population — reports/pinch/population.csv" };
  }
  return { partial: false,
    label: `targets of the ${seg} · every boundary heat duty is in the population` };
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

function Axes({ frame, xLabel, yLabel, u }: {
  frame: Frame; xLabel: string; yLabel: string; u: PinchUnits;
}): JSX.Element {
  // kW keeps the integer ticks; another duty unit spans decades (MW: 0..40)
  const hTickText = (h: number) => (u.qLabel === "kW" ? h.toFixed(0) : formatSig(h, 3));
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
            fontSize={11} fill={INK}>{hTickText(h)}</text>
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

/** Hot + cold composite curves from the engine's CSV (actual T scales), the
 *  cold curve slid right by the published Q_C,min so the overlap is the heat
 *  the process can recover.  Annotated with the published quantities: the two
 *  utility intervals, the maximum recovery, and the dTmin gap at the pinch. */
function CompositeSvg({ hot: hotK, cold: coldK, offset: offsetK, qh: qhK, qc: qcK, qrec: qrecK, pinch: pinchK, u }: {
  hot: CurvePoint[]; cold: CurvePoint[];
  offset: number; qh?: number; qc?: number; qrec?: number;
  pinch?: { Thot: number; Tcold: number; H: number; dT: number };
  u: PinchUnits;
}): JSX.Element {
  // The engine's K / kW, converted ONCE to the Units menu's temperature and
  // duty (the fields keep their names; the values are display values).
  const cv = (pts: CurvePoint[]) => pts.map((p) => ({ T_K: u.tNum(p.T_K), H_kW: u.qNum(p.H_kW) }));
  const hot = cv(hotK), cold = cv(coldK);
  const q = (v?: number) => (v === undefined ? undefined : u.qNum(v));
  const offset = u.qNum(offsetK), qh = q(qhK), qc = q(qcK), qrec = q(qrecK);
  const pinch = pinchK && { Thot: u.tNum(pinchK.Thot), Tcold: u.tNum(pinchK.Tcold),
    H: u.qNum(pinchK.H), dT: pinchK.dT };
  const coldS = cold.map((p) => ({ T_K: p.T_K, H_kW: p.H_kW + offset }));
  const frame = makeFrame([...hot, ...coldS]);
  const hotEnd = hot[hot.length - 1]!.H_kW;
  const yB = Y1 - 8;
  const bracket = (h0: number, h1: number, label: string, col: string, row: number) => (
    <g key={label}>
      <line x1={frame.toX(h0)} y1={yB - 14 * row} x2={frame.toX(h1)} y2={yB - 14 * row}
        stroke={col} strokeWidth={2} />
      <line x1={frame.toX(h0)} y1={yB - 14 * row - 4} x2={frame.toX(h0)} y2={yB - 14 * row + 4}
        stroke={col} strokeWidth={1.2} />
      <line x1={frame.toX(h1)} y1={yB - 14 * row - 4} x2={frame.toX(h1)} y2={yB - 14 * row + 4}
        stroke={col} strokeWidth={1.2} />
      <text x={(frame.toX(h0) + frame.toX(h1)) / 2} y={yB - 14 * row - 6}
        textAnchor="middle" fontSize={10} fill={col}>{label}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="hot and cold composite curves, cold curve slid by the cold-utility target">
      <Axes frame={frame} xLabel={`heat flow rate (${u.qLabel}), cold curve slid by Q_C,min`} yLabel={`T (${u.tLabel})`} u={u} />
      <polyline points={polyline(frame, hot)} fill="none"
        stroke={HOT} strokeWidth={2.2} />
      <polyline points={polyline(frame, coldS)} fill="none"
        stroke={COLD} strokeWidth={2.2} />
      {pinch && (
        <g>
          <line x1={frame.toX(pinch.H)} y1={frame.toY(pinch.Thot)}
            x2={frame.toX(pinch.H)} y2={frame.toY(pinch.Tcold)}
            stroke={PINCH} strokeWidth={2.4} />
          <circle cx={frame.toX(pinch.H)} cy={frame.toY(pinch.Thot)} r={3.5} fill={PINCH} />
          <circle cx={frame.toX(pinch.H)} cy={frame.toY(pinch.Tcold)} r={3.5} fill={PINCH} />
          <text x={frame.toX(pinch.H) + 8} y={frame.toY((pinch.Thot + pinch.Tcold) / 2) + 4}
            fontSize={10} fill={PINCH}>
            pinch: ΔTmin = {u.dT(pinch.dT, 0)} {u.tLabel} ({pinch.Tcold.toFixed(1)} / {pinch.Thot.toFixed(1)} {u.tLabel})
          </text>
        </g>
      )}
      {qc !== undefined && qc > 0 && bracket(0, qc, `Q_C,min ${u.Q(qcK!, 1)} ${u.qLabel} (cold utility)`, COLD, 0)}
      {qrec !== undefined && qrec > 0 && bracket(offset, hotEnd, `Q_recovery,max ${u.Q(qrecK!, 1)} ${u.qLabel}`, GCC, 1)}
      {qh !== undefined && qh > 0 && bracket(hotEnd, hotEnd + qh, `Q_H,min ${u.Q(qhK!, 1)} ${u.qLabel} (hot utility)`, HOT, 0)}
      <text x={X0 + 8} y={Y0 + 14} fontSize={11} fill={HOT}>hot composite (sources)</text>
      <text x={X0 + 8} y={Y0 + 28} fontSize={11} fill={COLD}>cold composite (sinks, slid)</text>
    </svg>
  );
}

/** The grand composite curve: the problem table's corrected cascade against
 *  the shifted T*, as the engine wrote it; a dot at every interior pinch. */
function GccSvg({ gcc: gccK, pinchStars: starsK, u }: { gcc: CurvePoint[]; pinchStars: number[]; u: PinchUnits }): JSX.Element {
  const gcc = gccK.map((p) => ({ T_K: u.tNum(p.T_K), H_kW: u.qNum(p.H_kW) }));
  const pinchStars = starsK.map((t) => u.tNum(t));
  const frame = makeFrame(gcc);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="grand composite curve">
      <Axes frame={frame} xLabel={`net heat flow, corrected cascade (${u.qLabel})`} yLabel={`shifted T* (${u.tLabel})`} u={u} />
      <line x1={frame.toX(0)} y1={Y0} x2={frame.toX(0)} y2={Y1}
        stroke={INK} strokeWidth={1.1} />
      <polyline points={polyline(frame, gcc)} fill="none"
        stroke={GCC} strokeWidth={2.2} />
      {pinchStars.map((t) => (
        <g key={t}>
          <circle cx={frame.toX(0)} cy={frame.toY(t)} r={5}
            fill={PINCH} stroke="var(--mantine-color-body)" strokeWidth={1.5} />
          <text x={frame.toX(0) + 8} y={frame.toY(t) - 6}
            fontSize={11} fill={PINCH}>pinch · T* = {t.toFixed(2)} {u.tLabel}</text>
        </g>
      ))}
    </svg>
  );
}

// ---- The stream table and the worked cascade (the engine's files, drawn) ---

function StreamTable({ rows, dTmin, u }: { rows: StreamRow[]; dTmin?: number; u: PinchUnits }): JSX.Element {
  return (
    <Box style={{ overflow: "auto" }}>
      <Table striped withTableBorder fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>stream</Table.Th><Table.Th>kind</Table.Th>
            <Table.Th>T_in ({u.tLabel})</Table.Th><Table.Th>T_out ({u.tLabel})</Table.Th>
            <Table.Th>|Q| ({u.qLabel})</Table.Th><Table.Th>CP = |Q|/|ΔT| ({u.cpLabel})</Table.Th>
            <Table.Th>role</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i} style={r.role === "utility" ? { opacity: 0.6 } : undefined}>
              <Table.Td>{r.unit}</Table.Td>
              <Table.Td>{r.side}</Table.Td>
              <Table.Td>{u.T(r.Tin, 2)}</Table.Td>
              <Table.Td>{u.T(r.Tout, 2)}</Table.Td>
              <Table.Td>{u.Q(Math.abs(r.Q_kW), 1)}</Table.Td>
              <Table.Td>{u.CP(r.CP, 3)}</Table.Td>
              <Table.Td>{r.role === "utility"
                ? "service side — not a process stream (left out)"
                : r.role === "recovered" ? "heat already recovered (an exchanger side)"
                : "process stream"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" p="xs">
        The stream population the targets are taken from, as the engine
        extracted it (<code>{POPULATION_CSV_PATH}</code>).  A hot stream is
        cooled, a cold stream is heated; each is one straight segment of
        constant CP.{dTmin !== undefined ? ` The approach is ΔTmin = ${u.dT(dTmin, 0)} ${u.tLabel}.` : ""}
      </Text>
    </Box>
  );
}

function CascadeTable({ rows, u }: { rows: ProblemRow[]; u: PinchUnits }): JSX.Element {
  const cpUnit = u.cpLabel === "kW/K" ? "" : ` (${u.cpLabel})`;
  return (
    <Box style={{ overflow: "auto" }}>
      <Table striped withTableBorder fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>interval</Table.Th>
            <Table.Th>T*_hi → T*_lo ({u.tLabel})</Table.Th>
            <Table.Th>ΣCP hot{cpUnit}</Table.Th><Table.Th>ΣCP cold{cpUnit}</Table.Th>
            <Table.Th>ΔH ({u.qLabel})</Table.Th>
            <Table.Th>cascade ({u.qLabel})</Table.Th>
            <Table.Th>corrected ({u.qLabel})</Table.Th>
            <Table.Th>streams (hot | cold)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.interval}>
              <Table.Td>{r.interval}</Table.Td>
              <Table.Td>{u.T(r.Thi, 2)} → {u.T(r.Tlo, 2)}</Table.Td>
              <Table.Td>{u.CP(r.cpHot, 3)}</Table.Td>
              <Table.Td>{u.CP(r.cpCold, 3)}</Table.Td>
              <Table.Td>{u.Q(r.dH, 1)}</Table.Td>
              <Table.Td>{u.Q(r.casOut, 1)}</Table.Td>
              <Table.Td>
                {u.Q(r.corOut, 1)}
                {r.tag === "pinch" && <Badge ml={6} size="xs" color="yellow" variant="light">pinch</Badge>}
                {r.tag === "bottomZero" && <Badge ml={6} size="xs" color="gray" variant="light">end of range</Badge>}
              </Table.Td>
              <Table.Td>{r.hotStreams || "—"} | {r.coldStreams || "—"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" p="xs">
        The engine&apos;s Linnhoff-Flower table (<code>{PROBLEM_TABLE_CSV_PATH}</code>),
        row by row: ΔH = (ΣCP hot − ΣCP cold) ΔT* is a surplus when positive; the
        cascade accumulates it from the top starting at 0; Q_H,min is minus its
        lowest value; the corrected column is the cascade with Q_H,min fed in at
        the top, so it is never negative and its last value is Q_C,min.  A zero
        strictly inside the range is a pinch.
      </Text>
    </Box>
  );
}

// ---- The candidate-matches table --------------------------------------------

function MatchesTable({ matches, u }: { matches: CandidateMatch[]; u: PinchUnits }): JSX.Element {
  return (
    <Box style={{ overflow: "auto", height: "100%" }}>
      <Table stickyHeader striped withTableBorder fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>region</Table.Th>
            <Table.Th>hot</Table.Th>
            <Table.Th>cold</Table.Th>
            <Table.Th>Q_max, this pair alone ({u.qLabel})</Table.Th>
            <Table.Th>CP rule at the pinch (CP_hot ≤ CP_cold above, ≥ below)</Table.Th>
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
                <Table.Td>{u.Q(m.maximumCandidateDuty_kW, 1)}</Table.Td>
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
        A feasibility assessment of each hot × cold pair on its own, in the
        engine&apos;s words.  Each Q_max is the limit of that pair; the column
        is not additive, because a stream can serve only its own duty once.
        The CP rule compares CP_hot with CP_cold at the pinch only.  Every
        feasible row is a thermodynamically admissible candidate — the table
        ranks nothing and recommends no network.  A violated CP rule keeps its
        away-from-pinch duty; an infeasible row is listed, never dropped.
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

export function PinchCompositeTool(
  { fixedSource }: { fixedSource?: "current" } = {},
): JSX.Element {
  // ---- The app's own run — the "Current run" source. -----------------------
  const appRun = useStore((s) => s.runResult);
  const appHasPinch = !!(appRun?.csvFiles?.[COMPOSITE_CURVES_CSV_PATH]
    || appRun?.kpis?.["pinch"]);

  const [source, setSource] = useState<Source>(fixedSource ?? "classroom");
  // The case's own run follows the Units menu (temperature, duty); the
  // classroom witness keeps its own K / kW sliders and reads K / kW.
  const dispPrefs = useStore((s) => s.displayPrefs);
  const u = useMemo(
    () => pinchUnits(source === "current" ? dispPrefs : DEFAULT_PREFS),
    [source, dispPrefs]);
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
  const popCsv = active?.csvFiles?.[POPULATION_CSV_PATH];
  const tableCsv = active?.csvFiles?.[PROBLEM_TABLE_CSV_PATH];
  const summaryCsv = active?.csvFiles?.[SUMMARY_CSV_PATH];
  const streamRows = useMemo<StreamRow[]>(
    () => (popCsv ? parseStreamTable(popCsv) : []), [popCsv]);
  const tableRows = useMemo<ProblemRow[]>(
    () => (tableCsv ? parseProblemTable(tableCsv) : []), [tableCsv]);
  const summary = useMemo<PinchSummary | null>(
    () => (summaryCsv ? parseSummary(summaryCsv) : null), [summaryCsv]);
  const gcc = useMemo<CurvePoint[]>(
    () => grandCompositeFromTable(tableRows).map((q) => ({ T_K: q.T, H_kW: q.H })),
    [tableRows]);
  const pinchStars = useMemo(
    () => tableRows.filter((r) => r.tag === "pinch").map((r) => r.Tlo), [tableRows]);

  // The toggle appears when the app run carries pinch artefacts (or the user
  // is already on "Current run" and needs the way back); the old empty state
  // lives ONLY under "Current run" — Classroom feeds itself.
  const showSourceToggle = !fixedSource && (appHasPinch || source === "current");
  const emptyCurrentRun = source === "current" && !curves && !kpis;

  const hot = curves?.["hot"];
  const cold = curves?.["cold"];
  const classText = summary ? (PINCH_CLASS_TEXT[summary.class] ?? summary.class) : null;
  const hasPinch = (summary?.nPinches ?? 0) > 0;
  const pinchGeom = hasPinch && kpis && summary?.Hpinch != null
    && kpis["T_pinch_hot_K"] != null && kpis["T_pinch_cold_K"] != null
    ? { Thot: kpis["T_pinch_hot_K"]!, Tcold: kpis["T_pinch_cold_K"]!,
        H: summary.Hpinch, dT: kpis["dTmin_K"] ?? 0 }
    : undefined;

  /* THE KNOBS AND THE VIEW SWITCH — the only surfaces here that SET anything.
     They sit in the page beside the curves, in a two-column grid; the engine's
     targets and the classification chips stay above the picture, because they
     report and do not set.  ΔTmin spans both columns: it is the knob the
     lesson is about. */
  const controls = (
    <>
      <OriginMark of="assumption" note="ΔTmin and the streams you set" />
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

  /* The reported numbers, all the engine's: the targets, the class of the
     problem and the maximum recovery. */
  const chips = (
    <Group gap={8} align="center" wrap="wrap">
      {active && !emptyCurrentRun && (
        <Badge variant="light" color="gray" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          {kpis
            ? `engine targets · Q_H,min ${u.Q(kpis["Q_H_min_kW"]!, 1)} ${u.qLabel} · `
              + `Q_C,min ${u.Q(kpis["Q_C_min_kW"]!, 1)} ${u.qLabel} · `
              + (hasPinch ? `pinch T* ${u.T(kpis["T_pinch_K"]!, 2)} ${u.tLabel} · ` : "no pinch · ")
              + `ΔTmin ${u.dT(kpis["dTmin_K"]!, 0)} ${u.tLabel}`
            : "no pinch KPI row in this run — curves shown, targets unverified"}
        </Badge>
      )}
      {/*  WHAT THE TARGETS ARE THE TARGETS OF (C150 R16): the engine says
           how many segments it extracted and which heat duties it left out;
           a target of a partial population must not read as the plant's.  */}
      {active && !emptyCurrentRun && populationScope(kpis, u) && (
        <Badge variant="light"
          color={populationScope(kpis, u)!.partial ? "red" : "gray"} size="lg"
          styles={{ root: { textTransform: "none" } }}>
          {populationScope(kpis, u)!.label}
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
          {`excess over target · ${u.Q(kpis["Q_heat_current_kW"]!, 1)}`
            + ` − ${u.Q(kpis["Q_H_min_kW"]!, 1)}`
            + ` = ${u.Q(kpis["Q_heat_current_kW"]! - kpis["Q_H_min_kW"]!, 1)} ${u.qLabel}`
            + `  =  ${u.Q(kpis["violation_heat_below_pinch_kW"]!, 1)} heating below`
            + ` + ${u.Q(kpis["violation_cool_above_pinch_kW"]!, 1)} cooling above`}
        </Badge>
      )}
      {classText && summary && (
        <Badge variant="light" color={hasPinch ? "teal" : "yellow"} size="lg"
          styles={{ root: { textTransform: "none", whiteSpace: "normal", height: "auto" } }}>
          {`${summary.class} · ${classText}`}
        </Badge>
      )}
      {kpis && kpis["Q_recovery_max_kW"] != null && (
        <Badge variant="light" color="gray" size="lg"
          styles={{ root: { textTransform: "none" } }}>
          {`Q_recovery,max ${u.Q(kpis["Q_recovery_max_kW"]!, 1)} ${u.qLabel}`
            + ` · Q_H,min − Q_C,min = ${u.Q(kpis["Q_H_min_kW"]! - kpis["Q_C_min_kW"]!, 1)} ${u.qLabel}`
            + ` = cold total − hot total (${u.Q(kpis["Q_cold_total_kW"]!, 1)} − ${u.Q(kpis["Q_hot_total_kW"]!, 1)})`}
        </Badge>
      )}
    </Group>
  );

  /* ONE renderer for the lesson, hoisted above everything that branches: the
     steps must not be able to exist on one path and vanish on another (the
     empty states below are branches inside the SAME page, so the reader who
     has no curves still gets the whole argument). */
  //  The CASE's own Pinch tab (`fixedSource`) is an instrument, not a lecture:
  //  the plant's curves and targets come FIRST, so the head and the argument
  //  of steps 1-3 do not stand above them (Vitor, 2026-11-06: "aparece-me uma
  //  especie de tutorial").  The EduTool, with no fixedSource, keeps the page.
  //  ONE definition, one call site per step (pinchLesson.test.ts holds it):
  //  the filter lives HERE, never at the call sites.
  const stepOf = lessonStepper(PINCH_STEPS);
  const lessonStep = (n: number) => (fixedSource && n <= 3 ? null : stepOf(n));

  const lessonHead = fixedSource ? null : (
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
        <Box>
          <Title order={5}>Watch the curves the engine published</Title>
          <Text size="sm" mt={4}>
            The two composites below are the engine&apos;s own, straight off{" "}
            <code>{COMPOSITE_CURVES_CSV_PATH}</code>: the horizontal overlap
            of the two curves is what the process can recover from itself
            (the green bracket), and the two overhangs are the utility targets
            (the coloured brackets, Q_C,min at the cold end and Q_H,min at the
            hot end).  The cold curve is drawn slid right by Q_C,min, which is
            what makes the overlap the maximum recovery; the horizontal axis is
            a heat flow rate in kW, and a stream of constant CP is a straight
            line of slope 1/CP on it.  The yellow bar is the pinch, where the
            curves are ΔTmin apart.  The grand composite is the corrected
            cascade of the worked-cascade table below plotted against the shifted temperature:
            it touches zero at a pinch and only at an end of the range when
            there is none.  The candidate table is the engine&apos;s
            feasibility assessment of each hot × cold pair, in its own words.
          </Text>
        </Box>

        <OriginMark of={["engine", "page"]} note="the targets, the composite curves and the candidate matches are the pinch pass run in this browser (choupoSolve); the stream table, the worked cascade, the grand composite and the classification are the engine's files, drawn here" />
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
                  in the case&apos;s <code>system/postDict</code> chain
                  (<code>{PINCH_PASS_EXCERPT}</code>) and run
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
                offset={summary?.coldOffset ?? kpis?.["Q_C_min_kW"] ?? 0}
                qh={kpis?.["Q_H_min_kW"]} qc={kpis?.["Q_C_min_kW"]}
                qrec={kpis?.["Q_recovery_max_kW"]} pinch={pinchGeom} u={u} />
            ) : (
              <Box p="xl">
                <Text size="sm" c="dimmed">
                  This run carries no <code>{COMPOSITE_CURVES_CSV_PATH}</code> with
                  hot + cold curves — the pinch pass writes both on every run that
                  finds duty-carrying units; re-run the case.
                </Text>
              </Box>
            ))}
            {pane === "gcc" && (gcc.length > 1 ? (
              <Stack gap={4} h="100%" style={{ minHeight: 0 }}>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  The corrected-cascade column of the engine&apos;s problem table
                  (<code>{PROBLEM_TABLE_CSV_PATH}</code>) against the shifted
                  temperature T*.  It touches zero at a pinch, and only at an end
                  of the range when there is none.
                </Text>
                <Box style={{ flex: 1, minHeight: 0 }}>
                  <GccSvg gcc={gcc} pinchStars={pinchStars} u={u} />
                </Box>
              </Stack>
            ) : (
              <Box p="xl">
                <Text size="sm" c="dimmed">
                  This run carries no <code>{PROBLEM_TABLE_CSV_PATH}</code> — the
                  pinch pass writes it with the targets; re-run the case.
                </Text>
              </Box>
            ))}
                        {pane === "matches" && (matches.length > 0 ? (
              <MatchesTable matches={matches} u={u} />
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

        {/* The figure comes second (DEV.md 4c C277): the steps, the stream
            table and the worked cascade now explain what has just been drawn. */}
        {lessonStep(2)}
        {lessonStep(3)}

        {streamRows.length > 0 && (
          <Box>
            <Title order={5}>The streams</Title>
            <StreamTable rows={streamRows} dTmin={kpis?.["dTmin_K"]} u={u} />
          </Box>
        )}

        {tableRows.length > 0 && (
          <Box>
            <Title order={5}>The worked cascade</Title>
            <CascadeTable rows={tableRows} u={u} />
          </Box>
        )}

        <Text size="xs" c="dimmed">
          Every target here is the engine&apos;s (PinchPass, whose problem table
          is printed cascade row by cascade row in the run log and written to
          reports/pinch/problemTable.csv); this view draws the engine&apos;s
          files and computes nothing.  The targets are an energy bound, not a
          network: a design that reaches them is a separate problem.
          The pass analyses the network the case declares — it designs nothing
          and rewrites nothing.
        </Text>

        {lessonStep(4)}
        {lessonStep(5)}

        {lessonLimits}

        <LessonReferences tool="pinch-composite" />
      </Stack>
    </Box>
  );
}
