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
  compressorChoiceDrawings -- the drawings of "Which compressor, and how far
  can I turn it down?" (C510), by hand in SVG, under controlValveDrawings.tsx's
  rules: no prose inside the SVG, ink and text are Mantine CSS variables, a
  360-unit viewBox at 100 % width, a hue is never the only channel (each region
  carries a direct label and a dash of its own), role="img" and an aria-label.

  MachineChart: inlet flow against pressure ratio, both logarithmic, the
  engine's region rectangles (from the design sheet, never typed here), the
  duty as a point that can be dragged, and the recorded points of a plant.
\*---------------------------------------------------------------------------*/

import { useRef } from "react";

import type { ChartRegionSheet } from "../../case/designSheet.js";
import { HUE_A, HUE_B, HUE_C } from "./controlValveDrawings.js";

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const METAL = "var(--mantine-color-default-border)";
const HUE_D = "#9c36b5";   // grape-8

const W = 360, H = 300;
const L = 38, R = 346, T = 12, B = 262;

export const CHART_X = { min: 1e2, max: 1e6 };
export const CHART_Y = { min: 1, max: 200 };

const lx = (q: number): number =>
  L + ((Math.log10(q) - Math.log10(CHART_X.min)) / (Math.log10(CHART_X.max) - Math.log10(CHART_X.min))) * (R - L);
const ly = (r: number): number =>
  B - ((Math.log10(r) - Math.log10(CHART_Y.min)) / (Math.log10(CHART_Y.max) - Math.log10(CHART_Y.min))) * (B - T);
const invX = (x: number): number =>
  Math.pow(10, Math.log10(CHART_X.min) + ((x - L) / (R - L)) * (Math.log10(CHART_X.max) - Math.log10(CHART_X.min)));
const invY = (y: number): number =>
  Math.pow(10, Math.log10(CHART_Y.min) + ((B - y) / (B - T)) * (Math.log10(CHART_Y.max) - Math.log10(CHART_Y.min)));

const STYLE: Record<string, { color: string; dash?: string; short: string }> = {
  centrifugal: { color: HUE_A, short: "centrifugal" },
  axial: { color: HUE_B, dash: "7 4", short: "axial" },
  screw: { color: HUE_C, dash: "2 3", short: "screw" },
  reciprocating: { color: HUE_D, dash: "10 3 2 3", short: "reciprocating" },
};
const styleOf = (m: string) => STYLE[m] ?? { color: INK, short: m };

export interface ChartPoint { name: string; cfm: number; ratio: number; }

export function MachineChart({ regions, duty, picked, eligible, onMove, points }: {
  regions: readonly ChartRegionSheet[];
  duty: { cfm: number; ratio: number };
  picked: string | null;
  eligible: readonly string[];
  onMove: (cfm: number, ratio: number) => void;
  points: readonly ChartPoint[];
}): JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const clampX = (v: number) => Math.min(CHART_X.max, Math.max(CHART_X.min, v));
  const clampY = (v: number) => Math.min(CHART_Y.max, Math.max(CHART_Y.min, v));
  const move = (e: React.PointerEvent): void => {
    const svg = ref.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    onMove(clampX(invX(Math.min(R, Math.max(L, x)))), clampY(invY(Math.min(B, Math.max(T, y)))));
  };
  const xt = [1e2, 1e3, 1e4, 1e5, 1e6];
  const yt = [1, 2, 5, 10, 20, 50, 100, 200];
  const fmtQ = (q: number): string => (q >= 1e3 ? `1e${Math.round(Math.log10(q))}` : String(q));
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" data-cc-chart=""
      style={{ display: "block", width: "100%", maxWidth: 560, touchAction: "none", cursor: "crosshair" }}
      aria-label={`Machine chart: inlet flow ${duty.cfm.toFixed(0)} cubic feet per minute against pressure ratio `
        + `${duty.ratio.toFixed(2)}. Machines whose region holds the point: ${eligible.length ? eligible.join(", ") : "none"}. `
        + `The engine's pick: ${picked ?? "none"}.`}
      onPointerDown={(e) => { dragging.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (dragging.current) move(e); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}>
      <rect x={L} y={T} width={R - L} height={B - T} fill="none" stroke={METAL} />
      {xt.map((q) => (
        <g key={q}>
          <line x1={lx(q)} y1={T} x2={lx(q)} y2={B} stroke={METAL} strokeWidth={0.5} />
          <text x={lx(q)} y={B + 12} fontSize={9} textAnchor="middle" fill={INK}>{fmtQ(q)}</text>
        </g>
      ))}
      {yt.map((r) => (
        <g key={r}>
          <line x1={L} y1={ly(r)} x2={R} y2={ly(r)} stroke={METAL} strokeWidth={0.5} />
          <text x={L - 4} y={ly(r) + 3} fontSize={9} textAnchor="end" fill={INK}>{r}</text>
        </g>
      ))}
      <text x={(L + R) / 2} y={H - 8} fontSize={10} textAnchor="middle" fill={INK}>inlet flow [cfm], actual</text>
      <text x={10} y={(T + B) / 2} fontSize={10} textAnchor="middle" fill={INK}
        transform={`rotate(-90 10 ${(T + B) / 2})`}>pressure ratio</text>
      {regions.map((r) => {
        const s = styleOf(r.machine);
        const on = eligible.includes(r.machine);
        const pts = `${lx(r.QminCfm)},${ly(r.rMin)} ${lx(r.QmaxCfm)},${ly(r.rMin)} `
          + `${lx(r.QmaxCfm)},${ly(r.rMaxAtQmax)} ${lx(r.QminCfm)},${ly(r.rMaxAtQmin)}`;
        const cx = (lx(r.QminCfm) + lx(r.QmaxCfm)) / 2;
        const cy = (ly(r.rMaxAtQmin) + ly(r.rMaxAtQmax)) / 2 + 12;
        return (
          <g key={r.machine} data-cc-region={r.machine} data-cc-on={on ? "1" : "0"}>
            <polygon points={pts} fill={s.color} fillOpacity={on ? 0.28 : 0.08}
              stroke={s.color} strokeWidth={on ? 2.4 : 1.2} strokeDasharray={s.dash} />
            <text x={cx} y={cy} fontSize={9} textAnchor="middle" fill={s.color} fontWeight={on ? 700 : 400}>
              {s.short}{picked === r.machine ? " *" : ""}
            </text>
          </g>
        );
      })}
      {points.map((p, i) => (
        <g key={p.name} data-cc-point={p.name}>
          <path d={`M ${lx(p.cfm)} ${ly(p.ratio) - 4} l 4 4 l -4 4 l -4 -4 Z`} fill={TEXT} />
          <text x={lx(p.cfm) + 6} y={ly(p.ratio) + (i % 2 === 0 ? -5 : 11)} fontSize={8} fill={TEXT}>{p.name}</text>
        </g>
      ))}
      <circle cx={lx(duty.cfm)} cy={ly(duty.ratio)} r={6} fill="none" stroke={TEXT} strokeWidth={2} data-cc-duty="" />
      <circle cx={lx(duty.cfm)} cy={ly(duty.ratio)} r={2} fill={TEXT} />
    </svg>
  );
}

// ---- the recycle: what the machine passes, and what is delivered ------------

/** One horizontal bar split into the delivered share and the recycled share of
 *  what the machine passes, with the surge floor marked. */
export function RecycleBar({ demand, total, floor }: {
  demand: number; total: number; floor: number;
}): JSX.Element {
  const w = 300, x0 = 30, y0 = 26, h = 26;
  const X = (f: number) => x0 + Math.min(1.05, f) * w;
  return (
    <svg viewBox="0 0 360 100" role="img" data-cc-recycle=""
      style={{ display: "block", width: "100%", maxWidth: 560 }}
      aria-label={`The machine passes ${(total * 100).toFixed(0)} per cent of its design flow; `
        + `${(demand * 100).toFixed(0)} per cent is delivered and ${((total - demand) * 100).toFixed(0)} per cent goes round the recycle valve; `
        + `the surge floor is at ${(floor * 100).toFixed(0)} per cent.`}>
      <rect x={x0} y={y0} width={w} height={h} fill="none" stroke={METAL} />
      <rect x={x0} y={y0} width={Math.max(0, X(demand) - x0)} height={h} fill={HUE_A} opacity={0.85} />
      <rect x={X(demand)} y={y0} width={Math.max(0, X(total) - X(demand))} height={h} fill={HUE_B} opacity={0.85} />
      <line x1={X(floor)} y1={y0 - 8} x2={X(floor)} y2={y0 + h + 8} stroke={TEXT} strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={X(floor)} y={y0 - 12} fontSize={9} textAnchor="middle" fill={TEXT}>surge floor</text>
      <text x={x0 + 4} y={y0 + h + 22} fontSize={10} fill={HUE_A}>delivered {(demand * 100).toFixed(0)} %</text>
      <text x={x0 + w} y={y0 + h + 22} fontSize={10} textAnchor="end" fill={HUE_B}>
        recycle {((total - demand) * 100).toFixed(0)} %
      </text>
      <text x={x0} y={y0 + h + 36} fontSize={9} fill={INK}>0</text>
      <text x={x0 + w} y={y0 + h + 36} fontSize={9} textAnchor="end" fill={INK}>design flow</text>
    </svg>
  );
}
