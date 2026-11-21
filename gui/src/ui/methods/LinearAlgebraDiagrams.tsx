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
  LinearAlgebraDiagrams -- the STATIC sketches of the `linear-algebra-without-
  pain` page (DEV.md 4c C463, Vitor: "poe muitos esquemas para ficar muito
  visual").  Every one is drawn here from SVG primitives (no copied or traced
  figure) and is the picture a step shows BEFORE any symbol.  Where a diagram
  carries numbers they come from linearAlgebraMath, never typed.  The mapping
  step -> diagrams is DATA in linearAlgebraLesson (LA_STEP_DIAGRAMS), which
  tests/linearAlgebraLesson.test.ts holds to this file.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { Box, Text } from "@mantine/core";

import {
  BOWL3, EX_A, bowlOf, conjugateGradient, curveKind, eigSym, eliminationSteps, fanMatrix, formSign,
  luFactor, quad, steepestDescent, A_ALL_POSITIVE, A_NEGATIVE_ENTRIES, rise,
  type Mat, type Vec,
} from "./linearAlgebraMath.js";

const INK = "#555", BLUE = "#1c7ed6", RED = "#e03131", GREEN = "#2f9e44", ORANGE = "#d9730d", PALE = "#e7f0fa";
const g = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Diagram({ id, caption, w, h, children }: {
  id: string; caption: string; w: number; h: number; children: ReactNode;
}): JSX.Element {
  return (
    <Box data-diagram={id} style={{ maxWidth: 560 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={caption}
        style={{ display: "block", background: "var(--mantine-color-body)" }}
        fontFamily="monospace" fontSize={11} fill={INK}>
        {children}
      </svg>
      <Text size="xs" c="dimmed">{caption}</Text>
    </Box>
  );
}

const Box_ = ({ x, y, w, h, text, fill = PALE, stroke = BLUE }: {
  x: number; y: number; w: number; h: number; text: string; fill?: string; stroke?: string;
}): JSX.Element => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} />
    {text.split("\n").map((t, i, a) => (
      <text key={i} x={x + w / 2} y={y + h / 2 + (i - (a.length - 1) / 2) * 13 + 4} textAnchor="middle">{t}</text>))}
  </g>);
const Arrow = ({ x1, y1, x2, y2, c = INK }: { x1: number; y1: number; x2: number; y2: number; c?: string }): JSX.Element => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = (d: number): string => `${x2 - 8 * Math.cos(a + d)},${y2 - 8 * Math.sin(a + d)}`;
  return (<g stroke={c} fill="none" strokeWidth={1.6}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} />
    <polyline points={`${hx(0.4)} ${x2},${y2} ${hx(-0.4)}`} /></g>);
};

/** A small matrix drawn as a grid of numbers; zeros introduced by elimination are red. */
function MiniMat({ M, x, y, cw = 26, hl, title }: {
  M: Mat; x: number; y: number; cw?: number; hl?: (i: number, j: number) => boolean; title: string;
}): JSX.Element {
  return (
    <g>
      <text x={x + (M.length * cw) / 2} y={y - 6} textAnchor="middle" fontWeight={700}>{title}</text>
      <path d={`M${x},${y} h-4 v${M.length * 22} h4 M${x + M.length * cw},${y} h4 v${M.length * 22} h-4`}
        fill="none" stroke={INK} />
      {M.map((r, i) => r.map((v, j) => (
        <text key={`${i}${j}`} x={x + j * cw + cw / 2} y={y + i * 22 + 15} textAnchor="middle"
          fill={hl?.(i, j) ? RED : INK} fontWeight={hl?.(i, j) ? 700 : 400}>{g(Math.round(v * 100) / 100)}</text>)))}
    </g>);
}

// ---- map ----------------------------------------------------------------------
export function MapDiagram(): JSX.Element {
  return (
    <Diagram id="map" w={560} h={250} caption="Newton's J dx = -F in the middle; each idea of the page answers one question about it.">
      <Box_ x={200} y={100} w={160} h={48} text={"Newton step in Choupo\nJ dx = -F"} fill="#fff3e0" stroke={ORANGE} />
      {[
        [10, 10, "1  why solve?\ntwo rulers cross", 200, 100],
        [200, 10, "2  how?\nelimination, LU", 280, 100],
        [390, 10, "3  tiny pivot\nswap rows", 330, 100],
        [10, 190, "4  wobbly table\ncondition number", 220, 148],
        [200, 190, "5  structure\ncolumn = band", 280, 148],
        [390, 190, "6-7  the bowl\ncurvature, CG", 340, 148],
      ].map(([x, y, t, tx, ty], i) => (
        <g key={i}>
          <Box_ x={x as number} y={y as number} w={160} h={44} text={t as string} />
          <Arrow x1={(x as number) + 80} y1={(y as number) + ((y as number) < 100 ? 44 : 0)} x2={tx as number} y2={ty as number} />
        </g>))}
    </Diagram>);
}

// ---- 1: a curve, its ruler, the zero -------------------------------------------
export function RulerDiagram(): JSX.Element {
  const pts: string[] = [];
  for (let x = 20; x <= 260; x += 8) pts.push(`${x},${150 - 90 * Math.sin((x - 20) / 90) + 30}`);
  return (
    <Diagram id="ruler" w={300} h={190} caption="A curve you cannot solve, a ruler (tangent) you can: the ruler hits zero close to the curve's own zero.">
      <line x1={10} y1={150} x2={290} y2={150} stroke={INK} />
      <polyline points={pts.join(" ")} fill="none" stroke={BLUE} strokeWidth={2} />
      <circle cx={92} cy={pts.length ? 150 - 90 * Math.sin(72 / 90) + 30 : 0} r={4} fill={ORANGE} />
      <line x1={40} y1={30} x2={190} y2={150} stroke={RED} strokeDasharray="5 3" strokeWidth={1.6} />
      <circle cx={190} cy={150} r={4} fill={GREEN} />
      <text x={100} y={60} fill={RED}>ruler</text>
      <text x={176} y={170} fill={GREEN}>next guess</text>
      <text x={60} y={118} fill={ORANGE}>guess</text>
    </Diagram>);
}

// ---- 2a: elimination as matrices with zeros appearing, then L and U ---------------
export function EliminationDiagram(): JSX.Element {
  const e = eliminationSteps(EX_A);
  const f = luFactor(EX_A, false);
  const stage1 = e.steps[1]!.after, stage2 = e.steps[2]!.after;
  return (
    <Diagram id="elimination" w={560} h={190} caption="Zeros appear column by column (red). The multipliers that made them are kept: L below, U the staircase. L times U is the table again.">
      <MiniMat M={EX_A} x={20} y={30} title="A" />
      <Arrow x1={105} y1={62} x2={130} y2={62} />
      <MiniMat M={stage1} x={140} y={30} title="column 1 cleared" hl={(i, j) => j === 0 && i > 0} />
      <Arrow x1={225} y1={62} x2={250} y2={62} />
      <MiniMat M={stage2} x={260} y={30} title="column 2 cleared" hl={(i, j) => j < i} />
      <MiniMat M={f.L} x={390} y={30} cw={24} title="L (receipt)" hl={(i, j) => j < i} />
      <MiniMat M={f.U} x={480} y={30} cw={24} title="U" />
      <text x={20} y={140}>multipliers kept in L:</text>
      <text x={20} y={156}>{e.steps.map((s) => g(s.mult)).join(", ")}</text>
    </Diagram>);
}

// ---- 2b: cube vs square cost -------------------------------------------------------
export function CostBlocksDiagram(): JSX.Element {
  const ns = [2, 4, 6, 8];
  let x = 10;
  return (
    <Diagram id="costBlocks" w={560} h={190} caption="Work as area: factoring grows like n cubed over three (orange), each reuse like n squared (green). Double n: eight times the first, four times the second.">
      {ns.map((n) => {
        const a = (n ** 3) / 3 / 6, b = n * n / 6; // scaled to pixels
        const sa = Math.sqrt(a) * 4, sb = Math.sqrt(b) * 4;
        const x0 = x; x += sa + 24;
        return (<g key={n}>
          <rect x={x0} y={150 - sa} width={sa} height={sa} fill={ORANGE} opacity={0.55} stroke={ORANGE} />
          <rect x={x0} y={150 - sb} width={sb} height={sb} fill={GREEN} stroke={GREEN} />
          <text x={x0} y={170}>n = {n}</text>
        </g>);
      })}
    </Diagram>);
}

// ---- 3: digits falling off ----------------------------------------------------------
export function DigitsDiagram(): JSX.Element {
  const big = "10000000", small = "00000001";
  return (
    <Diagram id="digits" w={560} h={170} caption="Six digits of room. Ten million and one: the one lands beyond the window and falls off, and with it the information the answer needed.">
      <text x={20} y={22} fontWeight={700}>10000000 + 1 on a six-digit calculator</text>
      {big.split("").map((d, i) => (
        <g key={i}>
          <rect x={30 + i * 34} y={40} width={30} height={30} fill={i < 6 ? PALE : "none"} stroke={i < 6 ? BLUE : RED} strokeDasharray={i < 6 ? "" : "3 2"} />
          <text x={45 + i * 34} y={60} textAnchor="middle">{d}</text>
          <text x={45 + i * 34} y={95} textAnchor="middle" fill={i === 7 ? RED : INK}>{small[i]}</text>
        </g>))}
      <text x={30} y={118} fill={RED}>the 1 sits in the 8th place; the window holds six</text>
      <Arrow x1={45 + 7 * 34} y1={100} x2={45 + 7 * 34} y2={145} c={RED} />
      <text x={290} y={150} fill={RED}>gone</text>
    </Diagram>);
}

// ---- 4: near-parallel lines whose crossing jumps --------------------------------------
export function NearParallelDiagram(): JSX.Element {
  const panel = (x0: number, slope: number, label: string): JSX.Element => {
    const cx0 = x0 + 120, cy0 = 90;
    const line = (s: number, dy: number, c: string, d?: string): JSX.Element => (
      <line x1={x0 + 10} y1={cy0 + dy - s * -110} x2={x0 + 230} y2={cy0 + dy - s * 110} stroke={c} strokeWidth={2} strokeDasharray={d} />);
    const dy = -8;
    // blue: y = cy0 + s (x - cx0); dashed red: y = cy0 - s (x - cx0) + dy  =>  x - cx0 = dy / (2 s)
    const jump = dy / (2 * slope);
    return (
      <g>
        <text x={x0 + 10} y={16} fontWeight={700}>{label}</text>
        {line(-slope, 0, BLUE)}
        {line(slope, 0, RED)}
        {line(slope, dy, RED, "5 3")}
        <circle cx={cx0} cy={cy0} r={4} fill="none" stroke={INK} />
        <circle cx={cx0 + jump} cy={cy0} r={4} fill={ORANGE} />
        <Arrow x1={cx0} y1={cy0 + 16} x2={cx0 + jump} y2={cy0 + 16} c={ORANGE} />
      </g>);
  };
  return (
    <Diagram id="nearParallel" w={500} h={190} caption="Same nudge of the red line (dashed). At a good angle the crossing barely moves; nearly parallel, it jumps far.">
      {panel(0, 0.9, "good angle")}
      {panel(250, 0.08, "nearly parallel")}
    </Diagram>);
}

// ---- 5: full matrix against band ------------------------------------------------------------
export function BandDiagram(): JSX.Element {
  const n = 12, c = 14;
  const grid = (x0: number, band: boolean, title: string): JSX.Element => (
    <g>
      <text x={x0} y={14} fontWeight={700}>{title}</text>
      {Array.from({ length: n * n }, (_, k) => {
        const i = Math.floor(k / n), j = k % n;
        const on = !band || Math.abs(Math.floor(i / 3) - Math.floor(j / 3)) <= 1;
        return <rect key={k} x={x0 + j * c} y={22 + i * c} width={c - 1} height={c - 1} fill={on ? (band ? BLUE : ORANGE) : "#f1f1f1"} />;
      })}
    </g>);
  return (
    <Diagram id="band" w={440} h={200} caption="Every unknown against every unknown (left) against each tray talking only to its neighbours (right): 144 entries against 72 here, and the gap widens with every tray you add.">
      {grid(10, false, "dense: n squared entries")}
      {grid(230, true, "block-tridiagonal")}
    </Diagram>);
}

// ---- 6: bowl, saddle, ridge: contours and 3-D sketches -----------------------------------------
const surf = (f: (x: number, y: number) => number, ox: number, oy: number, col: string): JSX.Element => {
  const P = (x: number, y: number): string => {
    const z = f(x, y);
    return `${ox + 34 * (x - y) * 0.9},${oy + 14 * (x + y) - 26 * z}`;
  };
  const lines: string[] = [];
  for (let a = -1; a <= 1.001; a += 0.25) {
    const l1: string[] = [], l2: string[] = [];
    for (let b = -1; b <= 1.001; b += 0.1) { l1.push(P(a, b)); l2.push(P(b, a)); }
    lines.push(l1.join(" "), l2.join(" "));
  }
  return <g fill="none" stroke={col} strokeWidth={0.9}>{lines.map((p, i) => <polyline key={i} points={p} />)}</g>;
};
export function ShapesDiagram(): JSX.Element {
  const shapes: [string, (x: number, y: number) => number, number][] = [
    ["bowl", (x, y) => x * x + y * y, 0], ["saddle", (x, y) => x * x - y * y, 1], ["ridge", (x) => x * x, 2]];
  return (
    <Diagram id="shapes" w={560} h={290} caption="Top: seen from above, the level lines. Below: the same surface in perspective. Bowl: closed loops. Saddle: crossing curves. Ridge: parallel lines, a whole valley floor.">
      {shapes.map(([name, f, k]) => {
        const x0 = 20 + k * 180;
        const lv = [0.15, 0.4, 0.7, 1];
        return (
          <g key={name}>
            <text x={x0 + 55} y={14} fontWeight={700}>{name}</text>
            <rect x={x0} y={22} width={150} height={110} fill="none" stroke="#ccc" />
            {name === "bowl" && lv.map((r) => <ellipse key={r} cx={x0 + 75} cy={77} rx={r * 60} ry={r * 45} fill="none" stroke={BLUE} />)}
            {name === "saddle" && lv.flatMap((r) => [
              <path key={`a${r}`} d={`M${x0 + 75 + 20 * r},22 Q${x0 + 75 + 8 * r},77 ${x0 + 75 + 20 * r},132`} fill="none" stroke={BLUE} />,
              <path key={`b${r}`} d={`M${x0 + 75 - 20 * r},22 Q${x0 + 75 - 8 * r},77 ${x0 + 75 - 20 * r},132`} fill="none" stroke={BLUE} />,
              <path key={`c${r}`} d={`M${x0},${77 - 20 * r} Q${x0 + 75},${77 - 8 * r} ${x0 + 150},${77 - 20 * r}`} fill="none" stroke={RED} strokeDasharray="4 2" />,
              <path key={`d${r}`} d={`M${x0},${77 + 20 * r} Q${x0 + 75},${77 + 8 * r} ${x0 + 150},${77 + 20 * r}`} fill="none" stroke={RED} strokeDasharray="4 2" />])}
            {name === "ridge" && lv.flatMap((r) => [
              <line key={`a${r}`} x1={x0 + 75 + 60 * r} y1={22} x2={x0 + 75 + 60 * r} y2={132} stroke={BLUE} />,
              <line key={`b${r}`} x1={x0 + 75 - 60 * r} y1={22} x2={x0 + 75 - 60 * r} y2={132} stroke={BLUE} />])}
            {surf(f, x0 + 75, 190, name === "saddle" ? RED : BLUE)}
          </g>);
      })}
    </Diagram>);
}

// ---- 7: zigzag against straight to the bottom -----------------------------------------------------
export function ZigzagDiagram(): JSX.Element {
  const A = bowlOf(12, 0.5), x0: Vec = [4, 1];
  const sd = steepestDescent(A, [0, 0], x0, 14), cg = conjugateGradient(A, [0, 0], x0, 5).path;
  const S = 42, cx = 140, cy = 100;
  const P = (p: Vec): string => `${cx + S * p[0]!},${cy - S * p[1]!}`;
  const levels = [0.5, 2, 6, 14, 28];
  const ell = (lvl: number): JSX.Element => {
    const pts: string[] = [];
    for (let t = 0; t <= 2 * Math.PI + 0.1; t += 0.1) {
      const d = [Math.cos(t), Math.sin(t)];
      const q = quad(A, [0, 0], d) * 2; // d'Ad
      const r = Math.sqrt(2 * lvl / q);
      pts.push(P([r * d[0]!, r * d[1]!]));
    }
    return <polyline key={lvl} points={pts.join(" ")} fill="none" stroke="#9cc3e8" />;
  };
  return (
    <Diagram id="zigzag" w={560} h={200} caption="Same bowl, same start. Steepest descent (red) re-crosses the valley at right angles; conjugate gradient (green) is at the bottom in two steps.">
      <g transform="translate(0,0)">
        {levels.map(ell)}
        <polyline points={sd.map(P).join(" ")} fill="none" stroke={RED} strokeDasharray="4 2" />
        <polyline points={cg.map(P).join(" ")} fill="none" stroke={GREEN} strokeWidth={2.6} />
        {cg.map((p, i) => <circle key={i} cx={cx + S * p[0]!} cy={cy - S * p[1]!} r={4} fill={GREEN} />)}
        <text x={cx + S * 4 + 6} y={cy - S * 1 - 6}>start</text>
      </g>
      <text x={330} y={60} fill={RED}>steepest descent: {sd.length - 1}+ steps</text>
      <text x={330} y={80} fill={GREEN}>conjugate gradient: {cg.length - 1} steps</text>
      <text x={330} y={110}>3 x 3 bowl: {conjugateGradient(BOWL3, [1, 2, 3], [0, 0, 0], 10, 1e-10).path.length - 1} steps</text>
    </Diagram>);
}

// ---- 6a: "positive" is about the number x'Ax, not about the entries of A ------------------------
/** The polar plot of x'Ax over the direction angle: a ring marks zero, the curve
 *  lies outside it where the number is positive (green) and inside where it is
 *  negative (red).  Returns the segments so the interactive figure draws the same. */
export function PolarForm({ A, cx, cy, R = 52, k = 14, angle }: {
  A: Mat; cx: number; cy: number; R?: number; k?: number; angle?: number;
}): JSX.Element {
  const N = 120;
  const pt = (th: number): [number, number] => {
    const rr = R + k * rise(A, [Math.cos(th), Math.sin(th)]);
    return [cx + rr * Math.cos(th), cy - rr * Math.sin(th)];
  };
  return (
    <g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#999" strokeDasharray="3 3" />
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * 2 * Math.PI, b = ((i + 1) / N) * 2 * Math.PI;
        const [x1, y1] = pt(a), [x2, y2] = pt(b);
        const v = rise(A, [Math.cos((a + b) / 2), Math.sin((a + b) / 2)]);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={2.4}
          stroke={v >= 0 ? GREEN : RED} strokeDasharray={v >= 0 ? undefined : "3 2"} />;
      })}
      {angle !== undefined && (() => {
        const [px, py] = pt(angle);
        return (<g>
          <Arrow x1={cx} y1={cy} x2={cx + R * 0.8 * Math.cos(angle)} y2={cy - R * 0.8 * Math.sin(angle)} c={ORANGE} />
          <circle cx={px} cy={py} r={4} fill={ORANGE} />
        </g>);
      })()}
    </g>);
}

export function PositiveMeansDiagram(): JSX.Element {
  const cases: [string, Mat, string][] = [
    ["A = [[1, 2], [2, 1]]", A_ALL_POSITIVE, "every entry positive, yet x'Ax dips below zero: NOT positive definite"],
    ["A = [[2, -1], [-1, 2]]", A_NEGATIVE_ENTRIES, "negative entries, yet x'Ax is positive in every direction: positive definite"]];
  return (
    <Diagram id="positiveMeans" w={520} h={250}
      caption="'Positive' is about the number x'Ax (the rise when you step in direction x), never about the entries of A. Dashed ring: zero. Green outside it: positive. Red inside it: negative.">
      {cases.map(([name, A, note], k) => (
        <g key={name}>
          <text x={130 + k * 260} y={16} textAnchor="middle" fontWeight={700}>{name}</text>
          <PolarForm A={A} cx={130 + k * 260} cy={100} />
          <text x={130 + k * 260} y={190} textAnchor="middle">
            {"x = (1, -1): x'Ax = " + rise(A, [1, -1])}</text>
          <text x={130 + k * 260} y={208} textAnchor="middle" fontSize={10}>{note.slice(0, 44)}</text>
          <text x={130 + k * 260} y={222} textAnchor="middle" fontSize={10}>{note.slice(44)}</text>
        </g>))}
    </Diagram>);
}

// ---- 7: a fan of parabolas, one per principal axis ---------------------------------------------
const KIND_COLOUR = { up: GREEN, down: RED, flat: "#888" } as const;

/** One parabola icon per eigenvalue: opens up (green), down (red) or is flat
 *  (grey, dashed).  The icon's curvature is the eigenvalue, clamped to fit. */
export function ParabolaFan({ values, x0, y0, cell = 60 }: {
  values: number[]; x0: number; y0: number; cell?: number;
}): JSX.Element {
  return (
    <g>{values.map((l, k) => {
      const kind = curveKind(l);
      const cx = x0 + k * cell + cell / 2, cy = y0 + 30;
      const pts: string[] = [];
      for (let t = -1; t <= 1.001; t += 0.1) {
        const yy = kind === "flat" ? 0 : Math.max(-22, Math.min(22, l * 9 * t * t)) * (kind === "up" ? -1 : -1);
        pts.push(`${cx + 22 * t},${cy + yy}`);
      }
      return (
        <g key={k}>
          <line x1={cx - 24} y1={cy} x2={cx + 24} y2={cy} stroke="#ddd" />
          <polyline points={pts.join(" ")} fill="none" stroke={KIND_COLOUR[kind]} strokeWidth={2.2}
            strokeDasharray={kind === "flat" ? "4 3" : undefined} />
          <text x={cx} y={cy + 38} textAnchor="middle" fill={KIND_COLOUR[kind]}>{(Math.round(l * 100) / 100).toFixed(2)}</text>
        </g>);
    })}</g>);
}

export function FanDiagram(): JSX.Element {
  const rows: [string, number, number][] = [["2 unknowns", 2, 3], ["3 unknowns", 3, 1], ["6 unknowns", 6, 1.2]];
  return (
    <Diagram id="fan" w={460} h={290}
      caption="Look along each principal axis: a parabola whose curvature is the eigenvalue. Green opens up, red down, grey is flat. All green: a bowl in any number of variables.">
      {rows.map(([lab, n, c], r) => (
        <g key={lab}>
          <text x={8} y={22 + r * 92} fontWeight={700}>{lab}</text>
          <ParabolaFan values={eigSym(fanMatrix(n, c)).values} x0={8} y0={20 + r * 92} cell={Math.min(70, 440 / n)} />
        </g>))}
    </Diagram>);
}

// ---- 7b: the name: the sign of x'Ax around the circle of directions --------------------------------
export function VocabularyDiagram(): JSX.Element {
  const cases: [string, Mat][] = [
    ["positive definite", [[2, 0.5], [0.5, 1]]], ["semi-definite", [[1, 1], [1, 1]]], ["indefinite", [[1, 2], [2, 1]]]];
  return (
    <Diagram id="vocabulary" w={520} h={210}
      caption="x'Ax is a quadratic form. Walk round every direction: positive all the way round (definite), zero along one direction (semi-definite), or the sign changes with the direction (indefinite).">
      {cases.map(([name, A], k) => {
        const cx = 90 + k * 170, cy = 90, r = 56;
        return (
          <g key={name}>
            <text x={cx} y={16} textAnchor="middle" fontWeight={700}>{name}</text>
            {Array.from({ length: 72 }, (_, i) => {
              const a0 = (i / 72) * 2 * Math.PI, a1 = ((i + 1.15) / 72) * 2 * Math.PI;
              const f = formSign(A, (a0 + a1) / 2);
              const col = f > 1e-9 ? GREEN : f < -1e-9 ? RED : "#888";
              return <line key={i} x1={cx + r * Math.cos(a0)} y1={cy - r * Math.sin(a0)}
                x2={cx + r * Math.cos(a1)} y2={cy - r * Math.sin(a1)} stroke={col} strokeWidth={7} />;
            })}
            <text x={cx} y={cy + 4} textAnchor="middle">x'Ax</text>
            <text x={cx} y={190} textAnchor="middle">{name === "indefinite" ? "sign changes" : name === "semi-definite" ? "positive or zero" : "always positive"}</text>
          </g>);
      })}
    </Diagram>);
}

export const LA_DIAGRAM_VIEWS: Record<string, () => JSX.Element> = {
  map: MapDiagram, ruler: RulerDiagram, elimination: EliminationDiagram, costBlocks: CostBlocksDiagram,
  digits: DigitsDiagram, nearParallel: NearParallelDiagram, band: BandDiagram, shapes: ShapesDiagram,
  positiveMeans: PositiveMeansDiagram, fan: FanDiagram, vocabulary: VocabularyDiagram, zigzag: ZigzagDiagram,
};
