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
  LinearAlgebraFigures -- the seven small interactive figures of the
  `linear-algebra-without-pain` page (DEV.md 4c C463), one per step, each on
  2x2 or 3x3 numbers the student drags.  Every figure owns its controls and
  draws only what linearAlgebraMath computes: nothing here does arithmetic of
  its own beyond mapping a number to a pixel.

  EVERY DRAG HAS A KEYBOARD TWIN: the handle is a slider with arrow keys, and
  the numeric sliders sit beside the drawing.  Colour never carries meaning
  alone: lines differ by dash as well as colour.
\*---------------------------------------------------------------------------*/

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Badge, Box, Button, Group, Stack, Text } from "@mantine/core";

import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import {
  BOWL3, BOWL3_G, EX_A, EX_B, NEWTON_F, bandsToDense, blockThomas, bowlOf, bowlTests,
  conjugateGradient, cond2, denseWork, eliminationSteps, linearisedLine, luFactor, luSolve,
  newtonPath, newtonStep, norm, pivotDemo, pivotTruth, quad, sampleBands, stationary,
  steepestDescent, wobble, wobbleMatrix, workCounts, curveKind, eigSym, fanMatrix, symPivots,
  A_ALL_POSITIVE, A_NEGATIVE_ENTRIES, rise, type Mat, type Vec,
} from "./linearAlgebraMath.js";
import { ParabolaFan, PolarForm } from "./LinearAlgebraDiagrams.js";

const INK = "#555";
const GRID = "#d0d0d0";
const BLUE = "#1c7ed6";
const RED = "#e03131";
const GREEN = "#2f9e44";
const ORANGE = "#d9730d";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f3 = (v: number): string => (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)
  ? v.toExponential(2) : v.toFixed(3).replace(/\.?0+$/, ""));

// ---- a plane with one draggable handle --------------------------------------

interface Win { x0: number; x1: number; y0: number; y1: number }
interface HandleSpec { at: Vec; onMove: (x: number, y: number) => void; label: string; color: string }

const PW = 360, PH = 360, PM = 24;

function PlaneSvg({ win, handle, aria, children }: {
  win: Win; handle?: HandleSpec; aria: string;
  children: (sx: (x: number) => number, sy: (y: number) => number) => ReactNode;
}): JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const clipId = `la-clip-${useId().replace(/:/g, "")}`;
  const sx = (x: number): number => PM + ((x - win.x0) / (win.x1 - win.x0)) * (PW - 2 * PM);
  const sy = (y: number): number => PH - PM - ((y - win.y0) / (win.y1 - win.y0)) * (PH - 2 * PM);
  const move = (e: PointerEvent<SVGElement>): void => {
    if (!drag.current || !ref.current || !handle) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / Math.max(r.width, 1)) * PW;
    const py = ((e.clientY - r.top) / Math.max(r.height, 1)) * PH;
    handle.onMove(
      clamp(win.x0 + ((px - PM) / (PW - 2 * PM)) * (win.x1 - win.x0), win.x0, win.x1),
      clamp(win.y0 + ((PH - PM - py) / (PH - 2 * PM)) * (win.y1 - win.y0), win.y0, win.y1));
  };
  const key = (e: KeyboardEvent<SVGElement>): void => {
    if (!handle) return;
    const dx = (win.x1 - win.x0) * 0.02, dy = (win.y1 - win.y0) * 0.02;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-dx, 0], ArrowRight: [dx, 0], ArrowUp: [0, dy], ArrowDown: [0, -dy] };
    const m = d[e.key];
    if (m) {
      e.preventDefault();
      handle.onMove(clamp(handle.at[0]! + m[0], win.x0, win.x1), clamp(handle.at[1]! + m[1], win.y0, win.y1));
    }
  };
  return (
    <Box style={{ width: "100%", maxWidth: 420 }}>
      <svg ref={ref} viewBox={`0 0 ${PW} ${PH}`} width="100%" role="img" aria-label={aria}
        style={{ display: "block", touchAction: "none", background: "var(--mantine-color-body)" }}
        onPointerMove={move}
        onPointerUp={() => { drag.current = false; }}
        onPointerLeave={() => { drag.current = false; }}>
        <rect x={PM} y={PM} width={PW - 2 * PM} height={PH - 2 * PM} fill="none" stroke={GRID} />
        <clipPath id={clipId}><rect x={PM} y={PM} width={PW - 2 * PM} height={PH - 2 * PM} /></clipPath>
        <g clipPath={`url(#${clipId})`}>{children(sx, sy)}</g>
        {handle && (
          <>
            <circle cx={sx(handle.at[0]!)} cy={sy(handle.at[1]!)} r={9} fill={handle.color}
              stroke="#fff" strokeWidth={1.5} style={{ cursor: "grab" }}
              tabIndex={0} role="slider" aria-label={handle.label}
              aria-valuenow={handle.at[0]} onKeyDown={key}
              onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture(e.pointerId); }} />
            <text x={sx(handle.at[0]!) + 12} y={sy(handle.at[1]!) - 8} fontSize={10} fill={handle.color}>
              {handle.label}
            </text>
          </>
        )}
      </svg>
    </Box>
  );
}

/** A line through a point with a direction, drawn across the whole window. */
function Ruler({ through, dir, sx, sy, color, dash, w = 2 }: {
  through: Vec; dir: Vec; sx: (x: number) => number; sy: (y: number) => number;
  color: string; dash?: string; w?: number;
}): JSX.Element {
  const L = 40;
  return <line x1={sx(through[0]! - L * dir[0]!)} y1={sy(through[1]! - L * dir[1]!)}
    x2={sx(through[0]! + L * dir[0]!)} y2={sy(through[1]! + L * dir[1]!)}
    stroke={color} strokeWidth={w} strokeDasharray={dash} />;
}

/** Banded contours of f over the window, as a grid of cells: one band is a
 *  stripe of equal height, so the stripes ARE the contour lines. */
function Bands({ f, win, sx, sy, n = 44 }: {
  f: (x: number, y: number) => number; win: Win;
  sx: (x: number) => number; sy: (y: number) => number; n?: number;
}): JSX.Element {
  const cells = useMemo(() => {
    const vals: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      vals.push(f(win.x0 + ((i + 0.5) / n) * (win.x1 - win.x0), win.y0 + ((j + 0.5) / n) * (win.y1 - win.y0)));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const step = Math.max((hi - lo) / 14, 1e-9);
    return vals.map((v, k) => {
      const band = Math.floor((v - lo) / step);
      const light = 96 - 4 * (band % 2) - 36 * ((v - lo) / Math.max(hi - lo, 1e-9));
      return { i: k % n, j: Math.floor(k / n), fill: `hsl(210, 55%, ${light.toFixed(1)}%)` };
    });
  }, [f, win, n]);
  const cw = (sx(win.x1) - sx(win.x0)) / n, ch = (sy(win.y0) - sy(win.y1)) / n;
  return (
    <g>{cells.map((c) => (
      <rect key={`${c.i}-${c.j}`} x={sx(win.x0) + c.i * cw} y={sy(win.y0) - (c.j + 1) * ch}
        width={cw + 0.4} height={ch + 0.4} fill={c.fill} />))}</g>
  );
}

const grid = (win: Win, sx: (x: number) => number, sy: (y: number) => number): ReactNode => (
  <g stroke={GRID} strokeWidth={0.6}>
    <line x1={sx(win.x0)} x2={sx(win.x1)} y1={sy(0)} y2={sy(0)} />
    <line x1={sx(0)} x2={sx(0)} y1={sy(win.y0)} y2={sy(win.y1)} />
  </g>);

const row = (children: ReactNode): JSX.Element => (
  <Box style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", alignItems: "start" }}>
    {children}
  </Box>);

function MatView({ M, mark }: { M: Mat; mark?: (i: number, j: number) => boolean }): JSX.Element {
  return (
    <Box component="table" style={{ borderLeft: `2px solid ${INK}`, borderRight: `2px solid ${INK}`,
      borderCollapse: "separate", borderSpacing: "8px 2px", fontFamily: "monospace", fontSize: 13 }}>
      <tbody>{M.map((r, i) => (
        <tr key={i}>{r.map((v, j) => (
          <td key={j} style={{ textAlign: "right", fontWeight: mark?.(i, j) ? 700 : 400,
            color: mark?.(i, j) ? RED : undefined }}>{f3(v)}</td>))}</tr>))}</tbody>
    </Box>);
}

const knob = (id: string, label: string, min: number, max: number, step: number, why: string): PanelKnob =>
  ({ id, label, min, max, step, why });

// ---- 1. Two rulers cross: a Newton step is a linear solve -------------------

const NW: Win = { x0: -3, x1: 3, y0: -3, y1: 3 };

export function NewtonFigure(): JSX.Element {
  const [p, setP] = useState<Vec>([2.4, 0.5]);
  const step = useMemo(() => { try { return newtonStep(p); } catch { return null; } }, [p]);
  const path = useMemo(() => newtonPath(p, 8), [p]);
  const det = 2 * p[0]! * p[0]! - 2 * p[1]! * p[1]!;
  const singular = Math.abs(det) < 0.05;
  const circle = useMemo(() => Array.from({ length: 73 }, (_, k) => {
    const t = (k / 72) * 2 * Math.PI; return [2 * Math.cos(t), 2 * Math.sin(t)] as Vec; }), []);
  const hyp = useMemo(() => {
    const a: Vec[] = [], b: Vec[] = [];
    for (let k = 0; k <= 60; k++) { const x = 0.28 * Math.exp((k / 60) * Math.log(3 / 0.28)); a.push([x, 1 / x]); b.push([-x, -1 / x]); }
    return [a, b];
  }, []);
  return (
    <Stack gap={6}>
      {row(
        <>
          <PlaneSvg win={NW} aria="Two curves, their tangent lines at the dragged point, and the Newton step"
            handle={{ at: p, onMove: (x, y) => setP([x, y]), label: "guess", color: ORANGE }}>
            {(sx, sy) => (
              <>
                {grid(NW, sx, sy)}
                <polyline fill="none" stroke={BLUE} strokeWidth={2}
                  points={circle.map((q) => `${sx(q[0]!)},${sy(q[1]!)}`).join(" ")} />
                {hyp.map((br, i) => (
                  <polyline key={i} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="6 3"
                    points={br.map((q) => `${sx(q[0]!)},${sy(q[1]!)}`).join(" ")} />))}
                {!singular && ([0, 1] as const).map((i) => {
                  const l = linearisedLine(p, i);
                  return <Ruler key={i} through={l.through} dir={l.dir} sx={sx} sy={sy}
                    color={i === 0 ? BLUE : RED} dash={i === 0 ? "2 3" : "1 4"} w={1.4} />;
                })}
                {step && !singular && (
                  <>
                    <line x1={sx(p[0]!)} y1={sy(p[1]!)} x2={sx(step.next[0]!)} y2={sy(step.next[1]!)}
                      stroke={GREEN} strokeWidth={2.2} />
                    <circle cx={sx(step.next[0]!)} cy={sy(step.next[1]!)} r={5} fill={GREEN} />
                  </>)}
                {path.slice(1).map((q, k) => (
                  <circle key={k} cx={sx(q[0]!)} cy={sy(q[1]!)} r={3} fill="none" stroke={GREEN} />))}
              </>)}
          </PlaneSvg>
          <Stack gap={4}>
            <Text size="sm">
              Blue circle: <Text span ff="monospace" size="xs">x² + y² = 4</Text>. Red dashed hyperbola:{" "}
              <Text span ff="monospace" size="xs">x y = 1</Text>. Dotted lines: each curve's ruler (its tangent)
              at the orange guess. The green arrow ends where the two rulers cross: that is the Newton step,
              and finding it is the solve below. Small green rings: the next iterates.
            </Text>
            {step && !singular ? (
              <Box style={{ fontFamily: "monospace", fontSize: 12 }}>
                <Group gap="md" wrap="wrap" align="center">
                  <Box><div>J</div><MatView M={step.J} /></Box>
                  <Box><div>dx</div><MatView M={step.dx.map((v) => [v])} /></Box>
                  <Box>= −F</Box>
                  <Box><MatView M={step.F.map((v) => [-v])} /></Box>
                </Group>
                <div>‖F‖ now {f3(norm(NEWTON_F(p)))}, after one step {f3(norm(NEWTON_F(step.next)))}</div>
              </Box>
            ) : (
              <Badge color="red" variant="light" size="lg">
                the rulers are parallel here: J is singular, there is no crossing
              </Badge>)}
          </Stack>
        </>)}
    </Stack>
  );
}

// ---- 2. Elimination by hand, then the receipt -------------------------------

export function EliminationFigure(): JSX.Element {
  const [k, setK] = useState(0);
  const [b, setB] = useState<Vec>([...EX_B]);
  const [n, setN] = useState(3);
  const e = useMemo(() => eliminationSteps(EX_A), []);
  const shown: Mat = k === 0 ? EX_A : e.steps[k - 1]!.after;
  const fac = useMemo(() => luFactor(EX_A, false), []);
  const sol = useMemo(() => luSolve(fac, b), [fac, b]);
  const nn = Math.round(10 ** n);
  const w = workCounts(nn);
  const last = k > 0 ? e.steps[k - 1]! : null;
  const Lshown: Mat = EX_A.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
  for (const s of e.steps.slice(0, k)) Lshown[s.row]![s.from] = s.mult;
  return (
    <Stack gap={8}>
      {row(
        <>
          <Stack gap={6}>
            <Text size="sm" fw={600}>Eliminate by hand, one row operation at a time</Text>
            <MatView M={shown} mark={(i, j) => last !== null && i === last.row && j <= last.from} />
            <Text size="xs" c="dimmed" style={{ minHeight: 34 }}>
              {last ? `row ${last.row + 1} ← row ${last.row + 1} − (${f3(last.mult)}) × row ${last.from + 1}.  The multiplier ${f3(last.mult)} goes into L, where the zero appeared.`
                : "The table as given. The first row's first entry is the pivot."}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="light" disabled={k === 0} onClick={() => setK(k - 1)}>back</Button>
              <Button size="xs" disabled={k >= e.steps.length} onClick={() => setK(k + 1)}>next row operation</Button>
              <Text size="xs">{k} of {e.steps.length}</Text>
            </Group>
            <Group gap="md" align="center" wrap="wrap">
              <Box><Text size="xs" fw={600}>L (the receipt)</Text>
                <MatView M={Lshown} /></Box>
              <Box><Text size="xs" fw={600}>U (the staircase)</Text><MatView M={fac.U} /></Box>
            </Group>
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={600}>Keep the receipt: a NEW right-hand side is two cheap passes</Text>
            {[0, 1, 2].map((i) => (
              <KnobSlider key={i} value={b[i]!} onChange={(v) => setB(b.map((x, j) => (j === i ? v : x)))}
                knob={knob(`b${i}`, `b${i + 1}`, -30, 30, 1, "the right-hand side")} />))}
            <Text size="sm" ff="monospace">x = ({sol.map(f3).join(", ")})</Text>
            <Text size="xs" c="dimmed">No elimination was repeated: only L y = b and U x = y.</Text>
          </Stack>
        </>)}
      <KnobSlider value={n} onChange={setN}
        knob={knob("n", `size of the table: n = ${nn}`, 1, 3.3, 0.05, "the number of equations (log scale)")} />
      <Box>
        {[["factor once (about n³/3)", w.factor, ORANGE], ["each new right-hand side (n²)", w.solve, GREEN]].map(([lab, v, c]) => (
          <Box key={lab as string} mb={4}>
            <Text size="xs">{lab as string}: {(v as number).toLocaleString("en-US")} operations</Text>
            <Box style={{ height: 10, background: c as string, width: `${clamp((Math.log10(Math.max(v as number, 1)) / 9) * 100, 1, 100)}%` }} />
          </Box>))}
        <Text size="xs" c="dimmed">Bars on a log scale (each tick of the full bar is a factor of ten).</Text>
      </Box>
    </Stack>
  );
}

// ---- 3. A tiny pivot on a few-digit calculator ------------------------------

export function PivotFigure(): JSX.Element {
  const [lg, setLg] = useState(7);
  const [dg, setDg] = useState(6);
  const eps = 10 ** -lg;
  const bad = pivotDemo(eps, dg, false), good = pivotDemo(eps, dg, true);
  const truth = pivotTruth(eps);
  const col = (title: string, r: ReturnType<typeof pivotDemo>, color: string): JSX.Element => (
    <Box style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10, fontFamily: "monospace", fontSize: 13 }}>
      <Text fw={700} size="sm" style={{ fontFamily: "inherit" }}>{title}</Text>
      <div>multiplier m = {f3(r.mult)}</div>
      <div>second pivot = {f3(r.u22)}</div>
      <div>x₂ = {f3(r.x2)}</div>
      <div style={{ fontWeight: 700, color: Math.abs(r.x1 - truth[0]!) > 1e-3 ? RED : GREEN }}>
        x₁ = {f3(r.x1)}</div>
    </Box>);
  return (
    <Stack gap={8}>
      <Text size="sm">
        <Text span ff="monospace" size="xs">ε x₁ + x₂ = 1</Text> and <Text span ff="monospace" size="xs">x₁ + x₂ = 2</Text>,
        on a calculator that keeps {dg} significant digits after every operation. Truth: x₁ = {f3(truth[0]!)}, x₂ = {f3(truth[1]!)}.
      </Text>
      <KnobSlider value={lg} onChange={setLg}
        knob={knob("e", `ε = 1e-${lg.toFixed(1)}`, 1, 14, 0.5, "the small number on the diagonal")} />
      <KnobSlider value={dg} onChange={(v) => setDg(Math.round(v))}
        knob={knob("d", `calculator digits: ${dg}`, 3, 16, 1, "how many significant digits survive each operation")} />
      {row(<>{col("as written: divide by ε", bad, RED)}{col("swap the rows first: divide by 1", good, GREEN)}</>)}
    </Stack>
  );
}

// ---- 4. The wobbly table -----------------------------------------------------

const WW: Win = { x0: -1, x1: 3, y0: -1, y1: 3 };

export function WobbleFigure(): JSX.Element {
  const [lt, setLt] = useState(-1);
  const [e, setE] = useState(0);
  const t = 10 ** lt;
  const w = wobble(t, e);
  const kappa = cond2(wobbleMatrix(t));
  const b0 = [2, 2 + t];
  const set = (x: number, y: number): void => {
    // dragging the crossing along line 1 (x1 + x2 = 2) moves b2 by e = t (x2 - 1)
    void x; setE(clamp(t * (y - 1), -0.5, 0.5));
  };
  const at: Vec = [w.x[0]!, w.x[1]!];
  return (
    <Stack gap={6}>
      {row(
        <>
          <PlaneSvg win={WW} aria="Two lines; the second is nudged; their crossing is the answer"
            handle={{ at, onMove: set, label: "answer", color: ORANGE }}>
            {(sx, sy) => (
              <>
                {grid(WW, sx, sy)}
                <Ruler through={[b0[0]! - 1, 1]} dir={[1, -1]} sx={sx} sy={sy} color={BLUE} dash="" />
                <Ruler through={[0, (b0[1]! + e) / (1 + t)]} dir={[1 + t, -1]} sx={sx} sy={sy} color={RED} dash="6 3" />
                <circle cx={sx(1)} cy={sy(1)} r={4} fill="none" stroke={INK} />
              </>)}
          </PlaneSvg>
          <Stack gap={4}>
            <Text size="sm">
              Blue: <Text span ff="monospace" size="xs">x₁ + x₂ = 2</Text>. Red dashed: <Text span ff="monospace" size="xs">x₁ + (1 + t) x₂ = 2 + t + e</Text>.
              The ring is the true crossing (1, 1) at e = 0; the orange dot is where the lines cross now. Drag it, or move e.
            </Text>
            <KnobSlider value={lt} onChange={setLt}
              knob={knob("t", `t = ${f3(t)}   (how far from parallel)`, -3, 0, 0.05, "the gap between the two lines' slopes")} />
            <KnobSlider value={e} onChange={setE}
              knob={knob("e", `error in b₂: e = ${f3(e)}`, -0.5, 0.5, 0.0005, "a measurement error in the second right-hand side")} />
            <Group gap={6} wrap="wrap">
              <Badge variant="light" color="gray">condition number κ = {f3(kappa)}</Badge>
              <Badge variant="light" color="gray">answer = ({f3(w.x[0]!)}, {f3(w.x[1]!)})</Badge>
              <Badge variant="light" color={w.amp > 10 ? "red" : "green"}>
                error amplified {f3(w.amp)} times (never more than κ)</Badge>
            </Group>
          </Stack>
        </>)}
    </Stack>
  );
}

// ---- 5. Structure ------------------------------------------------------------

export function StructureFigure(): JSX.Element {
  const [N, setN] = useState(8);
  const [nv, setNv] = useState(3);
  const n = N * nv;
  const A = useMemo(() => bandsToDense(sampleBands(Math.min(N, 12), nv)), [N, nv]);
  const bt = useMemo(() => blockThomas(sampleBands(N, nv), new Array(n).fill(1)).work, [N, nv, n]);
  const dense = denseWork(n);
  const sh = Math.min(N, 12) * nv;
  const cell = Math.min(14, 300 / sh);
  return (
    <Stack gap={6}>
      {row(
        <>
          <Box>
            <svg viewBox={`0 0 ${sh * cell + 2} ${sh * cell + 2}`} width="100%" style={{ maxWidth: 340, display: "block" }}
              role="img" aria-label={`Non-zero pattern of the Jacobian of ${Math.min(N, 12)} trays of ${nv} unknowns`}>
              {A.map((r, i) => r.map((v, j) => (v !== 0
                ? <rect key={`${i}-${j}`} x={1 + j * cell} y={1 + i * cell} width={cell - 1} height={cell - 1}
                  fill={Math.floor(i / nv) === Math.floor(j / nv) ? BLUE : GREEN} />
                : null)))}
            </svg>
            <Text size="xs" c="dimmed">
              Non-zero entries of a column's Jacobian (first {Math.min(N, 12)} trays shown). Blue: a tray's own unknowns.
              Green: the tray above and below. Everything else is zero.
            </Text>
          </Box>
          <Stack gap={4}>
            <KnobSlider value={N} onChange={(v) => setN(Math.round(v))}
              knob={knob("N", `trays N = ${N}`, 2, 100, 1, "the number of blocks")} />
            <KnobSlider value={nv} onChange={(v) => setNv(Math.round(v))}
              knob={knob("nv", `unknowns per tray nv = ${nv}`, 1, 6, 1, "the size of each block")} />
            <Text size="sm" ff="monospace">
              dense solve: {dense.toLocaleString("en-US")} operations<br />
              block-Thomas: {bt.toLocaleString("en-US")} operations<br />
              ratio: {f3(dense / bt)}
            </Text>
            <Text size="xs" c="dimmed">Both counted in the loops of the page's own code, for the same system.</Text>
          </Stack>
        </>)}
    </Stack>
  );
}

// ---- 6. The bowl --------------------------------------------------------------

const BWIN: Win = { x0: -3, x1: 3, y0: -3, y1: 3 };
const BG: Vec = [1, 0.5];
const SHAPE_WORDS: Record<string, string> = {
  bowl: "a bowl: one bottom", dome: "a dome: the stationary point is the top",
  saddle: "a saddle: up one way, down the other", ridge: "a ridge: a flat direction, no unique bottom" };

export function BowlFigure(): JSX.Element {
  const [a, setA] = useState(2), [b, setB] = useState(0.6), [c, setC] = useState(1);
  const [p, setP] = useState<Vec>([-2, 1.5]);
  const A: Mat = [[a, b], [b, c]];
  const t = bowlTests(a, b, c);
  const star = stationary(a, b, c, BG);
  const f = useMemo(() => (x: number, y: number) => quad([[a, b], [b, c]], BG, [x, y]), [a, b, c]);
  const next = star;
  return (
    <Stack gap={6}>
      {row(
        <>
          <PlaneSvg win={BWIN} aria="Contour bands of a quadratic landscape; the Newton step from the dragged point"
            handle={{ at: p, onMove: (x, y) => setP([x, y]), label: "start", color: ORANGE }}>
            {(sx, sy) => (
              <>
                <Bands f={f} win={BWIN} sx={sx} sy={sy} />
                {grid(BWIN, sx, sy)}
                {star && (
                  <>
                    <line x1={sx(p[0]!)} y1={sy(p[1]!)} x2={sx(star[0]!)} y2={sy(star[1]!)} stroke={GREEN} strokeWidth={2.2} />
                    <rect x={sx(star[0]!) - 5} y={sy(star[1]!) - 5} width={10} height={10} fill={GREEN} stroke="#fff" />
                  </>)}
              </>)}
          </PlaneSvg>
          <Stack gap={4}>
            <KnobSlider value={a} onChange={setA} knob={knob("a", `A₁₁ = ${f3(a)}`, -3, 3, 0.05, "curvature along x")} />
            <KnobSlider value={b} onChange={setB} knob={knob("b", `A₁₂ = ${f3(b)}`, -3, 3, 0.05, "the coupling between x and y")} />
            <KnobSlider value={c} onChange={setC} knob={knob("c", `A₂₂ = ${f3(c)}`, -3, 3, 0.05, "curvature along y")} />
            <Text size="sm" fw={600}>{SHAPE_WORDS[t.shape]}</Text>
            <Box style={{ fontFamily: "monospace", fontSize: 12 }}>
              <div>eigenvalues: {f3(t.eigen[0])}, {f3(t.eigen[1])} {t.pdByEigen ? "(both positive)" : "(not all positive)"}</div>
              <div>pivots: {f3(t.pivots[0])}, {Number.isNaN(t.pivots[1]) ? "n/a" : f3(t.pivots[1])} {t.pdByPivots ? "(both positive)" : "(not all positive)"}</div>
              <div>Cholesky factor exists: {t.cholesky ? "yes" : "no"}</div>
            </Box>
            {next ? (
              <Text size="xs" c="dimmed">
                Green: the Newton step from the orange start solves A x = g and lands on the square. Height there{" "}
                {f3(quad(A, BG, next))}, at the start {f3(quad(A, BG, p))}.
                {t.shape !== "bowl" ? " It is NOT a minimum: this table is not a bowl." : ""}
              </Text>) : (
              <Text size="xs" c="dimmed">A is singular: A x = g has no single solution, so there is no step to draw.</Text>)}
          </Stack>
        </>)}
    </Stack>
  );
}

// ---- 7. Steepest descent zigzags, conjugate gradient does not ----------------

const CWIN: Win = { x0: -5, x1: 5, y0: -5, y1: 5 };

export function CgFigure(): JSX.Element {
  const [lk, setLk] = useState(1);
  const [th, setTh] = useState(0.5);
  const [x0, setX0] = useState<Vec>([4, 1]);
  const kappa = 10 ** lk;
  const A = useMemo(() => bowlOf(kappa, th), [kappa, th]);
  const sd = useMemo(() => steepestDescent(A, [0, 0], x0, 60, 1e-8), [A, x0]);
  const cg = useMemo(() => conjugateGradient(A, [0, 0], x0, 10, 1e-8), [A, x0]);
  const f = useMemo(() => (x: number, y: number) => quad(A, [0, 0], [x, y]), [A]);
  const line = (pts: Vec[], sx: (x: number) => number, sy: (y: number) => number): string =>
    pts.map((q) => `${sx(q[0]!)},${sy(q[1]!)}`).join(" ");
  const b3 = useMemo(() => conjugateGradient(BOWL3, BOWL3_G, [0, 0, 0], 10, 1e-10), []);
  return (
    <Stack gap={6}>
      {row(
        <>
          <PlaneSvg win={CWIN} aria="A long narrow bowl, the zigzag of steepest descent and the two steps of conjugate gradient"
            handle={{ at: x0, onMove: (x, y) => setX0([x, y]), label: "start", color: ORANGE }}>
            {(sx, sy) => (
              <>
                <Bands f={f} win={CWIN} sx={sx} sy={sy} />
                {grid(CWIN, sx, sy)}
                <polyline points={line(sd, sx, sy)} fill="none" stroke={RED} strokeWidth={1.4} strokeDasharray="4 2" />
                {sd.map((q, i) => <circle key={i} cx={sx(q[0]!)} cy={sy(q[1]!)} r={2} fill={RED} />)}
                <polyline points={line(cg.path, sx, sy)} fill="none" stroke={GREEN} strokeWidth={2.6} />
                {cg.path.map((q, i) => <circle key={i} cx={sx(q[0]!)} cy={sy(q[1]!)} r={4} fill={GREEN} />)}
              </>)}
          </PlaneSvg>
          <Stack gap={4}>
            <KnobSlider value={lk} onChange={setLk} knob={knob("k", `condition number κ = ${f3(kappa)}`, 0, 2, 0.05, "how long and narrow the bowl is")} />
            <KnobSlider value={th} onChange={setTh} knob={knob("th", `turn of the axes = ${f3(th)} rad`, 0, 1.5, 0.05, "the valley's direction")} />
            <Group gap={6} wrap="wrap">
              <Badge variant="light" color="red">steepest descent: {sd.length - 1} steps shown{sd.length > 60 ? " (stopped at 60)" : ""}</Badge>
              <Badge variant="light" color="green">conjugate gradient: {cg.path.length - 1} steps</Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Red dashed: steepest descent, each step at a right angle to the last. Green: conjugate gradient. Both
              start at the orange dot (drag it). On a 3×3 bowl the same method takes {b3.path.length - 1} steps:
              one per unknown.
            </Text>
          </Stack>
        </>)}
    </Stack>
  );
}

// ---- 6a. What "positive" means: the number x'Ax, not the entries of A ----------------------------------

export function PositiveMeansFigure(): JSX.Element {
  const [th, setTh] = useState(-Math.PI / 4);
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const W = 520, H = 230;
  const move = (e: PointerEvent<SVGElement>): void => {
    if (!drag.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / Math.max(r.width, 1)) * W;
    const py = ((e.clientY - r.top) / Math.max(r.height, 1)) * H;
    const cx = px < W / 2 ? 130 : 390;
    setTh(Math.atan2(-(py - 100), px - cx));
  };
  const x: Vec = [Math.cos(th), Math.sin(th)];
  const cases: [string, Mat][] = [["A = [[1, 2], [2, 1]]", A_ALL_POSITIVE], ["A = [[2, -1], [-1, 2]]", A_NEGATIVE_ENTRIES]];
  return (
    <Stack gap={6}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 560, touchAction: "none", display: "block" }}
        role="img" aria-label="Polar plot of x'Ax over the direction for two tables; drag to turn the arrow"
        fontFamily="monospace" fontSize={11} fill={INK}
        onPointerMove={move} onPointerUp={() => { drag.current = false; }} onPointerLeave={() => { drag.current = false; }}
        onPointerDown={(e) => { drag.current = true; move(e); }}>
        {cases.map(([name, A], k) => {
          const v = rise(A, x);
          return (
            <g key={name}>
              <text x={130 + k * 260} y={16} textAnchor="middle" fontWeight={700}>{name}</text>
              <PolarForm A={A} cx={130 + k * 260} cy={100} angle={th} />
              <text x={130 + k * 260} y={190} textAnchor="middle" fill={v >= 0 ? GREEN : RED} fontWeight={700}>
                {"x'Ax = " + f3(v)}</text>
              <text x={130 + k * 260} y={208} textAnchor="middle" fontSize={10}>
                {v >= 0 ? "rises in this direction" : "falls in this direction"}</text>
            </g>);
        })}
      </svg>
      <Group gap="xs" wrap="wrap">
        <KnobSlider value={th} onChange={setTh}
          knob={knob("th", `direction angle = ${f3((th * 180) / Math.PI)}°`, -Math.PI, Math.PI, 0.01, "the direction you step in")} />
        <Button size="xs" variant="light" onClick={() => setTh(-Math.PI / 4)}>direction (1, −1)</Button>
      </Group>
      <Text size="xs" c="dimmed">
        x is a unit step; for the vector (1, −1) itself the numbers are {rise(A_ALL_POSITIVE, [1, -1])} and {rise(A_NEGATIVE_ENTRIES, [1, -1])}.
        The dashed ring is zero: the curve outside it is a rise, inside it a fall. Drag anywhere on a plot to turn the arrow.
      </Text>
    </Stack>
  );
}

// ---- 7. Many variables: n parabolas, and the pivots that tell the same story -----------------------

export function FanFigure(): JSX.Element {
  const [n, setN] = useState(3);
  const [c, setC] = useState(1);
  const A = useMemo(() => fanMatrix(n, c), [n, c]);
  const ev = useMemo(() => eigSym(A).values, [A]);
  const piv = useMemo(() => symPivots(A), [A]);
  const allUp = ev.every((l) => curveKind(l) === "up");
  const pivOk = piv.every((d) => d > 1e-9);
  return (
    <Stack gap={6}>
      <Group gap="xs">
        {[2, 3, 6].map((m) => (
          <Button key={m} size="xs" variant={m === n ? "filled" : "light"} onClick={() => setN(m)}>{m} unknowns</Button>))}
      </Group>
      <KnobSlider value={c} onChange={setC}
        knob={knob("c", `coupling c = ${f3(c)}`, 0, 3, 0.02, "how strongly neighbouring unknowns pull on each other")} />
      <svg viewBox={`0 0 ${Math.max(n, 3) * 70} 90`} width="100%" style={{ maxWidth: 470 }}
        role="img" aria-label="One parabola per principal axis of the table you perturb"
        fontFamily="monospace" fontSize={11} fill={INK}>
        <ParabolaFan values={ev} x0={0} y0={0} cell={Math.min(70, 440 / n)} />
      </svg>
      <Group gap={6} wrap="wrap">
        <Badge variant="light" color={allUp ? "green" : "red"}>
          {allUp ? "every parabola opens up: a bowl" : ev.some((l) => curveKind(l) === "down") ? "a parabola opens down: a saddle" : "a parabola is flat: a valley floor"}
        </Badge>
        <Badge variant="light" color={pivOk ? "green" : "red"}>
          pivots of the elimination: {piv.map((d) => (Number.isNaN(d) ? "n/a" : f3(d))).join(", ")} ({pivOk ? "all positive" : "not all positive"})
        </Badge>
      </Group>
      <Text size="xs" c="dimmed">
        The two badges are two routes to one verdict: the curvatures along the n axes, and the n pivots of the
        elimination of step 2 run on this table without swapping rows. They agree whenever the table is not exactly
        on the edge.
      </Text>
    </Stack>
  );
}
