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
  FaultCharts -- the ONE small line chart the `fault-diagnosis` EduTool draws
  every trace with (DEV.md 4c C464): a handful of series against a time axis,
  optional horizontal reference lines and shaded intervals, drawn as plain
  SVG so the page has no plotting dependency and a test can read it.
  Colours follow the theme; the series palette is fixed and distinguishable.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";

import { Box } from "@mantine/core";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
export const PALETTE = ["#4dabf7", "#ffa94d", "#69db7c", "#ff8787", "#b197fc"] as const;

export interface TraceSeries {
  label: string;
  y: readonly number[];
  /** x values; defaults to the chart's own `x` */
  x?: readonly number[];
  color?: string;
  dashed?: boolean;
  /** draw as dots, not a line */
  dots?: boolean;
  /** a step line (for 0/1 signals) */
  step?: boolean;
}

export interface TraceBand { y: number; label: string; color?: string }
export interface TraceSpan { from: number; to: number; color?: string; label?: string }

const nice = (lo: number, hi: number): { lo: number; hi: number } => {
  if (!(hi > lo)) return { lo: lo - 1, hi: hi + 1 };
  const pad = 0.08 * (hi - lo);
  return { lo: lo - pad, hi: hi + pad };
};

const tickValues = (lo: number, hi: number, n = 4): number[] => {
  const raw = (hi - lo) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
};

const fmt = (v: number): string => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/\.?0+$/, ""));

export function TraceChart({
  x, series, bands = [], spans = [], xLabel, yLabel, height = 190, yDomain, ariaLabel, id,
}: {
  x: readonly number[];
  series: readonly TraceSeries[];
  bands?: readonly TraceBand[];
  spans?: readonly TraceSpan[];
  xLabel: string;
  yLabel: string;
  height?: number;
  yDomain?: [number, number];
  ariaLabel: string;
  id?: string;
}): JSX.Element {
  const W = 560;
  const H = height;
  const ML = 46, MR = 12, MT = 10, MB = 34;
  const xs = series.flatMap((s) => s.x ?? x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const ys = [...series.flatMap((s) => s.y), ...bands.map((b) => b.y)].filter(Number.isFinite);
  const dom = yDomain ? { lo: yDomain[0], hi: yDomain[1] } : nice(Math.min(...ys), Math.max(...ys));
  const px = (v: number): number => ML + ((v - x0) / (x1 - x0 || 1)) * (W - ML - MR);
  const py = (v: number): number => H - MB - ((v - dom.lo) / (dom.hi - dom.lo)) * (H - MB - MT);
  const yt = tickValues(dom.lo, dom.hi);
  const xt = tickValues(x0, x1, 5);
  return (
    <Box data-trace-chart={id ?? ""} style={{ width: "100%", maxWidth: 640 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label={ariaLabel}>
        {spans.map((s, i) => (
          <rect key={i} x={px(s.from)} y={MT} width={Math.max(0, px(s.to) - px(s.from))} height={H - MB - MT}
            fill={s.color ?? "#ffa94d"} opacity={0.18} />
        ))}
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={ML} x2={W - MR} y1={py(v)} y2={py(v)} stroke={GRID} strokeDasharray="2 4" />
            <text x={ML - 5} y={py(v) + 3} textAnchor="end" fontSize={9} fill={INK}>{fmt(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={`x${v}`}>
            <line x1={px(v)} x2={px(v)} y1={H - MB} y2={H - MB + 3} stroke={INK} />
            <text x={px(v)} y={H - MB + 13} textAnchor="middle" fontSize={9} fill={INK}>{fmt(v)}</text>
          </g>
        ))}
        <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke={INK} />
        <line x1={ML} x2={ML} y1={MT} y2={H - MB} stroke={INK} />
        <text x={(ML + W - MR) / 2} y={H - 4} textAnchor="middle" fontSize={10} fill={INK}>{xLabel}</text>
        <text x={10} y={MT + 4} fontSize={10} fill={INK}>{yLabel}</text>
        {bands.map((b, i) => (
          <g key={`b${i}`}>
            <line x1={ML} x2={W - MR} y1={py(b.y)} y2={py(b.y)} stroke={b.color ?? "#ff8787"} strokeWidth={1.3} strokeDasharray="6 3" />
            <text x={W - MR - 2} y={py(b.y) - 3} textAnchor="end" fontSize={9} fill={b.color ?? "#ff8787"}>{b.label}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const sx = s.x ?? x;
          const col = s.color ?? PALETTE[si % PALETTE.length]!;
          if (s.dots) {
            return (
              <g key={si}>
                {s.y.map((v, i) => Number.isFinite(v) && <circle key={i} cx={px(sx[i]!)} cy={py(v)} r={2} fill={col} />)}
              </g>
            );
          }
          let d = "";
          s.y.forEach((v, i) => {
            if (!Number.isFinite(v)) return;
            const X = px(sx[i]!);
            const Y = py(v);
            if (d === "") d = `M${X.toFixed(1)},${Y.toFixed(1)}`;
            else if (s.step) d += ` H${X.toFixed(1)} V${Y.toFixed(1)}`;
            else d += ` L${X.toFixed(1)},${Y.toFixed(1)}`;
          });
          return <path key={si} d={d} fill="none" stroke={col} strokeWidth={1.6}
            strokeDasharray={s.dashed ? "5 3" : undefined} />;
        })}
      </svg>
      <Legend series={series} />
    </Box>
  );
}

function Legend({ series }: { series: readonly TraceSeries[] }): JSX.Element {
  return (
    <Box style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", fontSize: 11, color: INK }}>
      {series.map((s, i) => (
        <span key={i}>
          <span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px ${s.dashed ? "dashed" : "solid"} ${s.color ?? PALETTE[i % PALETTE.length]!}`, verticalAlign: "middle", marginRight: 4 }} />
          {s.label}
        </span>
      ))}
    </Box>
  );
}

/** A frame for a conceptual diagram: a titled SVG with a fixed viewBox. */
export function DiagramFrame({ n, title, children, h = 160 }: {
  n: number; title: string; children: ReactNode; h?: number;
}): JSX.Element {
  return (
    <Box data-step-diagram={n} mt={8} mb={8}
      style={{ border: `1px solid ${GRID}`, borderRadius: 6, padding: 6, maxWidth: 640 }}>
      <svg viewBox={`0 0 560 ${h}`} width="100%" style={{ display: "block" }} role="img" aria-label={title}>
        <defs>
          <marker id={`ah${n}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
          </marker>
        </defs>
        <g style={{ color: "var(--mantine-color-dimmed)" }} fontSize={11}>{children}</g>
      </svg>
    </Box>
  );
}
