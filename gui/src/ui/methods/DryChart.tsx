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
  DryChart -- one small inline-SVG line chart for the dryer cards (C508).
  It DRAWS the series it is given and computes nothing but the axis frame:
  the series are engine columns or engine KPIs, handed in by the cards.  Inline
  SVG, like the other method tools, so the node test runner can render it.
\*---------------------------------------------------------------------------*/

import { Box, Text } from "@mantine/core";

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  /** SVG dash pattern, "" for a solid line. */
  dash?: string;
  /** (x, y) pairs, in data units; a non-finite pair breaks the line. */
  pts: readonly (readonly [number, number])[];
  /** Draw a dot at each point (a sweep), not only the line. */
  dots?: boolean;
  /** Dot colours, one per point, overriding `color` (e.g. by verdict). */
  dotColors?: readonly string[];
  /** Draw only the dots, no line through them (engine runs sitting on a curve). */
  noLine?: boolean;
}

export interface ChartGuide {
  /** "h": a horizontal line at y = at; "v": a vertical line at x = at. */
  dir: "h" | "v";
  at: number;
  label: string;
  color: string;
  dash?: string;
}

const W = 640, H = 330, X0 = 70, X1 = 616, Y0 = 14, Y1 = 276;
const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";

const tick = (v: number): string => {
  const a = Math.abs(v);
  if (a !== 0 && (a < 0.001 || a >= 100000)) return v.toExponential(1);
  return String(Number(v.toPrecision(3)));
};

function domainOf(vals: number[], pad: number, zero: boolean): [number, number] {
  const f = vals.filter((v) => Number.isFinite(v));
  if (f.length === 0) return [0, 1];
  let lo = Math.min(...f), hi = Math.max(...f);
  if (zero) lo = Math.min(lo, 0);
  if (!(hi > lo)) { hi = lo + 1; }
  const p = (hi - lo) * pad;
  return [zero && lo === 0 ? 0 : lo - p, hi + p];
}

export function DryChart({
  series, guides = [], xLabel, yLabel, aria, xZero = false, yZero = false,
  xDomain, yDomain,
}: {
  series: readonly ChartSeries[]; guides?: readonly ChartGuide[];
  xLabel: string; yLabel: string; aria: string;
  xZero?: boolean; yZero?: boolean;
  xDomain?: readonly [number, number]; yDomain?: readonly [number, number];
}): JSX.Element {
  const xs = series.flatMap((s) => s.pts.map((p) => p[0]))
    .concat(guides.filter((g) => g.dir === "v").map((g) => g.at));
  const ys = series.flatMap((s) => s.pts.map((p) => p[1]))
    .concat(guides.filter((g) => g.dir === "h").map((g) => g.at));
  const [xlo, xhi] = xDomain ?? domainOf(xs, 0.03, xZero);
  const [ylo, yhi] = yDomain ?? domainOf(ys, 0.06, yZero);
  const toX = (x: number): number => X0 + ((X1 - X0) * (x - xlo)) / (xhi - xlo || 1);
  const toY = (y: number): number => Y1 - ((Y1 - Y0) * (y - ylo)) / (yhi - ylo || 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <Box style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={aria}
        style={{ display: "block", maxHeight: 360 }}>
        {ticks.map((f) => {
          const x = xlo + f * (xhi - xlo), y = ylo + f * (yhi - ylo);
          return (
            <g key={f}>
              <line x1={toX(x)} x2={toX(x)} y1={Y0} y2={Y1} stroke={GRID} strokeWidth={0.6} />
              <text x={toX(x)} y={Y1 + 15} textAnchor="middle" fontSize={11} fill={INK}>{tick(x)}</text>
              <line x1={X0} x2={X1} y1={toY(y)} y2={toY(y)} stroke={GRID} strokeWidth={0.6} />
              <text x={X0 - 6} y={toY(y) + 4} textAnchor="end" fontSize={11} fill={INK}>{tick(y)}</text>
            </g>
          );
        })}
        <text x={(X0 + X1) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={INK}>{xLabel}</text>
        <text x={14} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize={12} fill={INK}
          transform={`rotate(-90 14 ${(Y0 + Y1) / 2})`}>{yLabel}</text>
        {guides.map((g) => {
          if (g.dir === "h") {
            if (g.at < ylo || g.at > yhi) return null;
            return (
              <g key={`g${g.label}`}>
                <line x1={X0} x2={X1} y1={toY(g.at)} y2={toY(g.at)} stroke={g.color}
                  strokeWidth={1.2} strokeDasharray={g.dash ?? "5 4"} />
                <text x={X1 - 4} y={toY(g.at) - 4} textAnchor="end" fontSize={10} fill={g.color}>{g.label}</text>
              </g>
            );
          }
          if (g.at < xlo || g.at > xhi) return null;
          return (
            <g key={`g${g.label}`}>
              <line x1={toX(g.at)} x2={toX(g.at)} y1={Y0} y2={Y1} stroke={g.color}
                strokeWidth={1.2} strokeDasharray={g.dash ?? "5 4"} />
              <text x={toX(g.at) + 4} y={Y0 + 11} fontSize={10} fill={g.color}>{g.label}</text>
            </g>
          );
        })}
        {series.map((s) => {
          const good = s.pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
          return (
            <g key={s.id} data-series={s.id}>
              {good.length > 1 && !s.noLine && (
                <polyline fill="none" stroke={s.color} strokeWidth={2}
                  strokeDasharray={s.dash ?? ""}
                  points={good.map((p) => `${toX(p[0]).toFixed(1)},${toY(p[1]).toFixed(1)}`).join(" ")} />
              )}
              {s.dots && good.map((p, i) => (
                <circle key={i} cx={toX(p[0])} cy={toY(p[1])} r={4.5}
                  fill={s.dotColors?.[i] ?? s.color} stroke="var(--mantine-color-body)" strokeWidth={1.2} />
              ))}
            </g>
          );
        })}
      </svg>
      <Box style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
        {series.map((s) => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width={26} height={6} aria-hidden>
              <line x1={0} x2={26} y1={3} y2={3} stroke={s.color} strokeWidth={2}
                strokeDasharray={s.dash ?? ""} />
            </svg>
            <Text span size="xs">{s.label}</Text>
          </span>
        ))}
      </Box>
    </Box>
  );
}
