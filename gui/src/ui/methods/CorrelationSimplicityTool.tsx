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
  WHY ENGINEERING CORRELATIONS ARE SIMPLE (DEV.md 4c C119) -- five pages:
  dimensional analysis; what the Pi theorem gives and does not; asymptotic
  regimes and similarity; master and slave; correlations in practice.

  WHERE EVERY NUMBER COMES FROM.  Page 1 is exact rational arithmetic on the
  dimensional matrix (correlationSimplicityMath.ts).  Page 4 is Haken's
  two-variable model, integrated on the page, beside its closed-form
  reduction.  Pages 2, 3 and 5 draw, differentiate and fit the ENGINE'S OWN
  correlations, read from the two sweep CSVs that
  `props/hydraulics/moody02_correlation_sweeps` writes when the WASM build of
  choupoProps runs it in the reader's browser -- no friction factor and no
  Nusselt number is computed in TypeScript.  The run starts the first time a
  page needs it and is kept for the rest of the visit.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Badge, Box, Checkbox, Chip, Group, Loader, SegmentedControl, Slider, Stack, Table,
  Text, Title,
} from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, Tex, lessonStepper } from "./lessonStep.js";
import {
  SIMPLICITY_LIMITS, SIMPLICITY_QUIZ, SIMPLICITY_SOURCES, SIMPLICITY_STEPS,
} from "./correlationSimplicityLesson.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  BASE_DIMS, PROBLEMS, blend, curveOf, dimsOf, fitDecade, groupTex, hakenEigenvalues, hakenRun,
  keysOf, localSlope, parseSweepCsv, piGroups, q, reachWithin, rref, wiggle,
  type Curve, type DimProblem, type SweepTable,
} from "./correlationSimplicityMath.js";

/** The bundled tutorial this page runs in the browser. */
export const SIMPLICITY_WITNESS = "props/hydraulics/moody02_correlation_sweeps";
export const MOODY_CSV = "moodySweep.csv";
export const NUSSELT_CSV = "nusseltSweep.csv";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const SURFACE = "var(--mantine-color-body)";

/** Categorical hues in FIXED order (never cycled); a colour follows its
 *  entity -- a roughness, a correlation -- and never its rank on screen. */
const SLOT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6",
  "#e34948"] as const;
const slot = (i: number): string => SLOT[i % SLOT.length]!;
const CORR_COLOR: Record<string, string> = {
  Colebrook: SLOT[0], Churchill: SLOT[1], Haaland: SLOT[2], Blasius: SLOT[3],
  Gnielinski: SLOT[0], DittusBoelter: SLOT[1],
};
/** The tube-side Nusselt correlations; Kern is shell-side and not drawn. */
const TUBE_NU = ["Gnielinski", "DittusBoelter"] as const;

type PageId = "dims" | "pi" | "asym" | "slave" | "practice";
const PAGES: { value: PageId; label: string }[] = [
  { value: "dims", label: "1 · Dimensional analysis" },
  { value: "pi", label: "2 · What Π gives" },
  { value: "asym", label: "3 · Asymptotes" },
  { value: "slave", label: "4 · Master and slave" },
  { value: "practice", label: "5 · In practice" },
];
const NEEDS_ENGINE: ReadonlySet<PageId> = new Set(["pi", "asym", "practice"]);

// ---- number formatting ------------------------------------------------------------

export function fmtSig(x: number, n = 4): string {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return x.toExponential(n - 1);
  return String(Number(x.toPrecision(n)));
}
const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const pow10 = (e: number): string => `10${String(e).split("").map((c) => SUP[c] ?? c).join("")}`;
function fmtRe(x: number): string {
  const e = Math.log10(x);
  if (Math.abs(e - Math.round(e)) < 1e-9) return pow10(Math.round(e));
  return x >= 1e5 || x < 1e-2 ? x.toExponential(2) : String(Number(x.toPrecision(3)));
}

// ---- the plot ----------------------------------------------------------------------

interface PlotSeries {
  label: string;
  x: readonly number[];
  y: readonly number[];
  color: string;
  dash?: string;
  width?: number;
}
interface PlotProps {
  series: readonly PlotSeries[];
  xLog?: boolean;
  yLog?: boolean;
  xLabel: string;
  yLabel: string;
  yDomain?: readonly [number, number];
  xDomain?: readonly [number, number];
  bands?: readonly PlotBand[];
  height?: number;
}
/** A shaded x-interval.  `note` is a second, short line under the label --
 *  a few words, never prose (an SVG does not reflow). */
interface PlotBand { x0: number; x1: number; label: string; note?: string }

/** THE TRANSITION IS NOT A CURVE (DEV.md 4c C155).  The engine's band, 2300
 *  to 4000 (FrictionFactorCorrelation.cpp), shaded on every friction plot and
 *  labelled for what it is: a region where Re does not decide the regime, so
 *  no value read off a curve inside it is a prediction. */
const TRANSITION_BAND: PlotBand = {
  x0: 2300, x1: 4000, label: "transition", note: "regime not determined by Re",
};

function niceLinearTicks(lo: number, hi: number, want = 6): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / want, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= want) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step)
    out.push(Math.abs(v) < 1e-12 * step ? 0 : v);
  return out;
}
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  const decades = Math.log10(hi / lo);
  const mult = decades < 1.5 ? [1, 2, 3, 5] : decades < 3 ? [1, 2, 5] : [1];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
    for (const m of mult) {
      const v = m * 10 ** e;
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v);
    }
  return out;
}

/** A small line chart on log or linear axes, with a crosshair that reads every
 *  series at the nearest grid point.  ONE y-axis, always. */
function CurvePlot({ series, xLog = true, yLog = true, xLabel, yLabel, yDomain, xDomain, bands,
  height = 300 }: PlotProps): JSX.Element {
  const W = 720, H = height, L = 66, R = 16, T = 12, B = 42;
  const ok = (v: number, log: boolean) => Number.isFinite(v) && (!log || v > 0);
  const xs = series.flatMap((s) => s.x.filter((v) => ok(v, xLog)));
  const [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
  //  The y range is taken over the points that are DRAWN, so a series that
  //  runs past the x window does not stretch the axis.
  const ys = series.flatMap((s) => s.y.filter((v, i) => ok(v, yLog)
    && s.x[i]! >= x0 * (1 - 1e-12) && s.x[i]! <= x1 * (1 + 1e-12)));
  let [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (!yDomain) {
    if (yLog) { y0 /= 1.1; y1 *= 1.1; }
    else { const pad = 0.05 * (y1 - y0 || 1); y0 -= pad; y1 += pad; }
  }
  const tx = (v: number) => (xLog ? Math.log10(v) : v);
  const ty = (v: number) => (yLog ? Math.log10(v) : v);
  const sx = (v: number) => L + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * (W - L - R);
  const sy = (v: number) => T + (1 - (ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * (H - T - B);
  const inv = (px: number) => {
    const t = tx(x0) + ((px - L) / (W - L - R)) * (tx(x1) - tx(x0));
    return xLog ? 10 ** t : t;
  };
  const xt = xLog ? logTicks(x0, x1) : niceLinearTicks(x0, x1);
  const yt = yLog ? logTicks(y0, y1) : niceLinearTicks(y0, y1);
  const path = (s: PlotSeries): string => {
    let d = "", pen = false;
    for (let i = 0; i < s.x.length; i++) {
      const X = s.x[i]!, Y = s.y[i]!;
      if (!ok(X, xLog) || !ok(Y, yLog) || X < x0 || X > x1 || Y < y0 || Y > y1) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${sx(X).toFixed(1)},${sy(Y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hx = hover === null ? null : inv(hover);
  const read = hx === null ? [] : series.map((s) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < s.x.length; i++) {
      if (!ok(s.x[i]!, xLog) || !ok(s.y[i]!, yLog)) continue;
      const d = Math.abs(tx(s.x[i]!) - tx(hx));
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : { s, x: s.x[best]!, y: s.y[best]! };
  }).filter((r): r is { s: PlotSeries; x: number; y: number } => r !== null
    && r.y >= y0 && r.y <= y1);
  const tipW = 230, tipH = 16 + 15 * read.length;
  const tipX = hover !== null && hover > W - tipW - 30 ? hover - tipW - 10 : (hover ?? 0) + 10;
  return (
    <Box>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`${yLabel} against ${xLabel}`}
        style={{ display: "block", touchAction: "none" }}
        onPointerMove={(e) => {
          const r = svgRef.current?.getBoundingClientRect();
          if (!r) return;
          const px = ((e.clientX - r.left) * W) / r.width;
          setHover(px >= L && px <= W - R ? px : null);
        }}
        onPointerLeave={() => setHover(null)}>
        {(bands ?? []).map((b) => (
          <g key={b.label}>
            <rect x={sx(Math.max(b.x0, x0))} y={T}
              width={Math.max(0, sx(Math.min(b.x1, x1)) - sx(Math.max(b.x0, x0)))}
              height={H - T - B} fill={INK} opacity={0.12} />
            <text x={sx(Math.max(b.x0, x0)) + 3} y={T + 12} fontSize={11} fill={INK}>{b.label}</text>
            {b.note && (
              <text x={sx(Math.max(b.x0, x0)) + 3} y={T + 25} fontSize={10} fill={INK}
                fontStyle="italic">{b.note}</text>
            )}
          </g>
        ))}
        {xt.map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} stroke={GRID} strokeWidth={1} />
            <text x={sx(v)} y={H - B + 15} fontSize={11} fill={INK} textAnchor="middle">
              {xLog ? fmtRe(v) : fmtSig(v, 3)}
            </text>
          </g>
        ))}
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={sy(v) + 4} fontSize={11} fill={INK} textAnchor="end">
              {yLog && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9 && Math.abs(v) >= 1e4
                ? fmtRe(v) : fmtSig(v, 3)}
            </text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} fontSize={12} fill={TEXT} textAnchor="middle">{xLabel}</text>
        <text x={14} y={(T + H - B) / 2} fontSize={12} fill={TEXT} textAnchor="middle"
          transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{yLabel}</text>
        {series.map((s) => (
          <path key={s.label} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2}
            strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={hover} x2={hover} y1={T} y2={H - B} stroke={INK} strokeWidth={1} />
            {read.map((r) => (
              <circle key={r.s.label} cx={sx(r.x)} cy={sy(r.y)} r={4} fill={r.s.color}
                stroke={SURFACE} strokeWidth={2} />
            ))}
            {read.length > 0 && (
              <g>
                <rect x={tipX} y={T + 4} width={tipW} height={tipH} rx={4} fill={SURFACE}
                  stroke={GRID} />
                <text x={tipX + 8} y={T + 18} fontSize={11} fill={INK}>
                  {xLabel.split(" ")[0]} = {fmtSig(read[0]!.x, 4)}
                </text>
                {read.map((r, i) => (
                  <text key={r.s.label} x={tipX + 8} y={T + 33 + 15 * i} fontSize={11} fill={TEXT}>
                    {r.s.label}: {fmtSig(r.y, 5)}
                  </text>
                ))}
              </g>
            )}
          </g>
        )}
      </svg>
      {series.length >= 2 && (
        <Group gap={14} mt={2} wrap="wrap">
          {series.map((s) => (
            <Group key={s.label} gap={6} wrap="nowrap">
              <svg width={26} height={10} aria-hidden>
                <line x1={1} x2={25} y1={5} y2={5} stroke={s.color} strokeWidth={2.5}
                  strokeDasharray={s.dash} />
              </svg>
              <Text size="xs">{s.label}</Text>
            </Group>
          ))}
        </Group>
      )}
    </Box>
  );
}

// ---- small shared pieces ---------------------------------------------------------------

/** A result panel.  `origin` is REQUIRED (DEV.md 4c C112): every panel on
 *  this page states where its numbers came from. */
function Panel({ title, origin, originNote, children }: {
  title: string; origin: OriginKind | readonly OriginKind[];
  originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>{title}</Text>
      <Box mb={8}><OriginMark of={origin} note={originNote} /></Box>
      <Stack gap={10}>{children}</Stack>
    </Box>
  );
}

function LabeledSlider({ label, value, min, max, step, onChange, show }: {
  label: ReactNode; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; show: string;
}): JSX.Element {
  return (
    <Box>
      <Group justify="space-between" gap={6}>
        <Text size="xs" c="dimmed">{label}</Text>
        <Text size="xs" ff="monospace">{show}</Text>
      </Group>
      <Slider size="xs" mt={4} value={value} min={min} max={max} step={step} label={null}
        onChange={onChange} />
    </Box>
  );
}

function RoughnessPicker({ keys, value, onChange }: {
  keys: readonly number[]; value: number; onChange: (v: number) => void;
}): JSX.Element {
  return (
    <Box>
      <Text size="xs" c="dimmed" mb={4}>relative roughness <Tex src="\varepsilon/D" mode="inline" /></Text>
      <SegmentedControl size="xs" value={String(value)} onChange={(v) => onChange(Number(v))}
        data={keys.map((k) => ({ value: String(k), label: k === 0 ? "0 (smooth)" : fmtSig(k, 2) }))} />
    </Box>
  );
}

/** Where the curves came from -- said beside every engine plot. */
function EngineSource(): JSX.Element {
  return (
    <Text size="xs" c="dimmed">
      Every curve here is read from the engine&apos;s own sweep, written by{" "}
      <Text span ff="monospace" size="xs">frictionBench</Text> /{" "}
      <Text span ff="monospace" size="xs">heatTransferBench</Text> when the
      witness <Text span ff="monospace" size="xs">{SIMPLICITY_WITNESS}</Text> ran
      in your browser: 20 points per decade, each the correlation the pipe and the
      exchanger use. No measurement enters.
    </Text>
  );
}

// ---- Page 1: dimensional analysis ---------------------------------------------------------

function Frac({ n, d }: { n: number; d: number }): JSX.Element {
  return <>{d === 1 ? String(n) : `${n}/${d}`}</>;
}

export function DimensionalPage(): JSX.Element {
  const [pid, setPid] = useState<DimProblem["id"]>("friction");
  const P = PROBLEMS[pid];
  const [selBy, setSelBy] = useState<Record<string, string[]>>({
    friction: [...PROBLEMS.friction.relevant], convection: [...PROBLEMS.convection.relevant],
  });
  const [coreBy, setCoreBy] = useState<Record<string, string[]>>({
    friction: [...PROBLEMS.friction.defaultCore], convection: [...PROBLEMS.convection.defaultCore],
  });
  const sel = selBy[pid]!;
  const core = coreBy[pid]!.filter((c) => sel.includes(c));
  const vars = P.candidates.filter((v) => sel.includes(v.id));
  const res = useMemo(() => piGroups(vars, core), [vars, core]);
  const toggleVar = (id: string) => setSelBy((s) => ({ ...s,
    [pid]: s[pid]!.includes(id) ? s[pid]!.filter((x) => x !== id) : [...s[pid]!, id] }));
  const toggleCore = (id: string) => setCoreBy((s) => ({ ...s,
    [pid]: s[pid]!.includes(id) ? s[pid]!.filter((x) => x !== id) : [...s[pid]!, id] }));
  const symOf = (id: string) => P.candidates.find((v) => v.id === id)?.sym ?? id;

  //  The matrix method, shown: core columns first, reduced exactly.
  const reduced = useMemo(() => {
    if (!res.ok) return null;
    const ordered = [...core.map((id) => vars.find((v) => v.id === id)!),
      ...vars.filter((v) => !core.includes(v.id))];
    const { R } = rref(BASE_DIMS.map((_, r) => ordered.map((v) => q(v.dims[r]!))));
    return { ordered, R };
  }, [res, core, vars]);

  return (
    <Stack gap="md">
      {step(1)}
      {step(2)}
      <Panel title="the dimensional matrix, live" origin={["page", "assumption"]}
        originNote="the rank and the groups are computed on this page from the variables you tick">
        <SegmentedControl size="xs" value={pid} onChange={(v) => setPid(v as DimProblem["id"])}
          data={[{ value: "friction", label: PROBLEMS.friction.title },
            { value: "convection", label: PROBLEMS.convection.title }]} />
        <Box>
          <Text size="xs" c="dimmed" mb={4}>the variables the problem depends on (tick and untick)</Text>
          <Stack gap={4}>
            {P.candidates.map((v) => (
              <Checkbox key={v.id} size="xs" checked={sel.includes(v.id)}
                onChange={() => toggleVar(v.id)}
                label={<><Tex src={v.sym} mode="inline" />{"  "}{v.means} [{v.unit}]</>} />
            ))}
          </Stack>
        </Box>
        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders fz="xs" style={{ width: "auto" }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                {vars.map((v) => (
                  <Table.Th key={v.id} style={{ textAlign: "center" }}>
                    <Tex src={v.sym} mode="inline" />
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {BASE_DIMS.map((d, r) => (
                <Table.Tr key={d}>
                  <Table.Td><Tex src={d} mode="inline" /></Table.Td>
                  {vars.map((v) => (
                    <Table.Td key={v.id} style={{ textAlign: "center", fontFamily: "monospace" }}>
                      {v.dims[r]}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Group gap={8}>
          <Badge tt="none" variant="light">n = {vars.length} variables</Badge>
          <Badge tt="none" variant="light">rank r = {res.rank}</Badge>
          <Badge tt="none" variant="filled">N<sub>Π</sub> = n − r = {vars.length - res.rank} groups</Badge>
        </Group>
        <Box>
          <Text size="xs" c="dimmed" mb={4}>
            the core (repeating variables) -- it must hold exactly r = {res.rank} of them, and
            their columns must be independent
          </Text>
          <Group gap={6}>
            {vars.map((v) => (
              <Chip key={v.id} size="xs" checked={core.includes(v.id)}
                onChange={() => toggleCore(v.id)}>
                <Tex src={v.sym} mode="inline" />
              </Chip>
            ))}
          </Group>
          <Group gap={6} mt={6}>
            <Text size="xs" c="dimmed">presets:</Text>
            {P.alternativeCores.map((c) => (
              <Badge tt="none" key={c.join(",")} variant="outline" style={{ cursor: "pointer" }}
                onClick={() => {
                  setCoreBy((s) => ({ ...s, [pid]: [...c] }));
                  setSelBy((s) => ({ ...s, [pid]: [...new Set([...s[pid]!, ...c])] }));
                }}>
                <Tex src={c.map(symOf).join(",\\,")} mode="inline" />
              </Badge>
            ))}
          </Group>
        </Box>
        {!res.ok ? (
          <Alert color="red" variant="light" title="not a basis">
            <Text size="sm">{res.reason}.</Text>
          </Alert>
        ) : (
          <>
            {reduced && (
              <Box style={{ overflowX: "auto" }}>
                <Text size="xs" c="dimmed" mb={4}>
                  the same matrix, core columns first, reduced exactly by row operations: each
                  non-core column is read off as one group
                </Text>
                <Table withTableBorder withColumnBorders fz="xs" style={{ width: "auto" }}>
                  <Table.Thead>
                    <Table.Tr>
                      {reduced.ordered.map((v, j) => (
                        <Table.Th key={v.id} style={{ textAlign: "center",
                          background: j < core.length ? "var(--mantine-color-default-hover)" : undefined }}>
                          <Tex src={v.sym} mode="inline" />
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {reduced.R.slice(0, res.rank).map((row, i) => (
                      <Table.Tr key={i}>
                        {row.map((x, j) => (
                          <Table.Td key={j} style={{ textAlign: "center", fontFamily: "monospace" }}>
                            <Frac n={x.n} d={x.d} />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            )}
            <Stack gap={4}>
              {res.groups.map((g, i) => {
                const dims = dimsOf(res.vars, g.exps);
                return (
                  <Group key={g.head} gap={10} wrap="nowrap">
                    <Text size="sm" w={70}>
                      <Tex src={`\\Pi_{${i + 1}} =`} mode="inline" />
                    </Text>
                    <Tex src={groupTex(res.vars, g.exps)} mode="inline" />
                    <Text size="xs" c="dimmed">
                      dimensions {BASE_DIMS.map((d, k) => `${d.replace("\\Theta", "Θ")}^${dims[k]}`).join(" ")}
                      {dims.every((x) => x === 0) ? " -- dimensionless" : " -- NOT dimensionless"}
                      {g.head === P.target ? " · the dependent group" : ""}
                    </Text>
                  </Group>
                );
              })}
            </Stack>
          </>
        )}
      </Panel>
      {step(3)}
    </Stack>
  );
}

// ---- Page 2: what Pi gives -------------------------------------------------------------

export function PiPage({ moody }: { moody: SweepTable }): JSX.Element {
  const keys = useMemo(() => keysOf(moody, "relRough"), [moody]);
  const [eps, setEps] = useState(1e-3);
  const e = keys.includes(eps) ? eps : (keys[0] ?? 0);
  const [a, setA] = useState(0.15);
  const [k, setK] = useState(1.5);
  const c = useMemo(() => curveOf(moody, "relRough", e, "f_Colebrook", "in_Colebrook"), [moody, e]);
  const w = c.Re.map((Re, i) => wiggle(Re, c.y[i]!, a, k));
  return (
    <Stack gap="md">
      {step(4)}
      {step(5)}
      <Panel title="an invented law beside the engine's" origin={["engine", "page", "assumption"]}
        originNote="Colebrook is the engine's sweep run in this browser; the ripple is this page's, at the amplitude and frequency you set">
        <RoughnessPicker keys={keys} value={e} onChange={setEps} />
        <LabeledSlider label={<>ripple amplitude <Tex src="a" mode="inline" /></>} value={a}
          min={0} max={0.3} step={0.01} onChange={setA} show={a.toFixed(2)} />
        <LabeledSlider label={<>ripple frequency <Tex src="k" mode="inline" /> (per decade of Re)</>}
          value={k} min={0.5} max={4} step={0.5} onChange={setK} show={k.toFixed(1)} />
        <CurvePlot xLabel="Re" yLabel="f (Darcy)"
          series={[
            { label: "Colebrook (engine)", x: c.Re, y: c.y, color: CORR_COLOR.Colebrook! },
            { label: "invented: Colebrook × ripple", x: c.Re, y: w, color: SLOT[4], dash: "6 4" },
          ]} />
        <Text size="xs" c="dimmed">
          Both curves depend on Re and ε/D and on nothing else, so dimensional analysis
          accepts both. The ripple is computed on the page from the formula above, at
          the engine&apos;s own grid points (k is capped at 4 per decade so the 20 points
          per decade can still draw it).
        </Text>
        <EngineSource />
      </Panel>
    </Stack>
  );
}

// ---- Page 3: asymptotes and similarity -----------------------------------------------------

/** A cut wherever the engine names a different regime on either side. */
const regimeSplit = (c: Curve) => (i: number) => c.regime[i] !== c.regime[i - 1];

/** The same curve with a gap where the regime changes, so a plot does not
 *  draw a line across the switch of law the slope was not taken across. */
function brokenAtRegimes(c: Curve, y: readonly number[]): { x: number[]; y: number[] } {
  const out = { x: [] as number[], y: [] as number[] };
  c.Re.forEach((Re, i) => {
    if (i > 0 && c.regime[i] !== c.regime[i - 1]) { out.x.push(NaN); out.y.push(NaN); }
    out.x.push(Re); out.y.push(y[i]!);
  });
  return out;
}

function slopeAt(c: Curve, s: readonly number[], Re: number): number {
  let best = -1, bd = Infinity;
  c.Re.forEach((r, i) => { const d = Math.abs(Math.log10(r / Re)); if (d < bd) { bd = d; best = i; } });
  return best < 0 || bd > 1e-6 ? NaN : s[best]!;
}

export function AsymptotesPage({ moody }: { moody: SweepTable }): JSX.Element {
  const keys = useMemo(() => keysOf(moody, "relRough"), [moody]);
  const curves = useMemo(() => keys.map((e) => {
    const c = curveOf(moody, "relRough", e, "f_Colebrook", "in_Colebrook");
    return { e, c, s: localSlope(c.Re, c.y, regimeSplit(c)) };
  }), [moody, keys]);
  const lam = useMemo(() => curveOf(moody, "relRough", keys[0] ?? 0, "fL_Churchill"), [moody, keys]);
  const label = (e: number) => (e === 0 ? "ε/D = 0" : `ε/D = ${fmtSig(e, 2)}`);
  const decades = [1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
  return (
    <Stack gap="md">
      {step(6)}
      {step(7)}
      {step(8)}
      <Panel title="the Moody plane, from the engine" origin={["engine", "page"]}
        originNote="the curves are the engine's sweep run in this browser; the local slopes are taken on this page">
        <CurvePlot xLabel="Re" yLabel="f (Darcy)" height={340} yDomain={[5e-3, 1]}
          bands={[TRANSITION_BAND]}
          series={[
            ...curves.map(({ e, c }, i) => ({ label: `Colebrook, ${label(e)}`, x: c.Re, y: c.y,
              color: slot(i) })),
            { label: "64/Re (fL_Churchill)", x: lam.Re, y: lam.y, color: INK, dash: "4 4", width: 1.5 },
          ]} />
        <Text size="xs" c="dimmed">
          Below Re = 2300 the engine substitutes the exact laminar law for Colebrook, so every
          roughness falls on one line; the dashed line is the same law published beside
          Churchill&apos;s expression, continued past 2300 until it leaves the plot.
          The shaded band is the engine&apos;s transition band: there the regime is not
          determined by Re, and the curves drawn through it are not predictions (step 14).
        </Text>
        <CurvePlot xLabel="Re" yLabel="local slope d ln f / d ln Re" yLog={false}
          yDomain={[-1.1, 0.1]} bands={[TRANSITION_BAND]}
          series={curves.map(({ e, c, s }, i) => ({ label: label(e), ...brokenAtRegimes(c, s),
            color: slot(i) }))} />
        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder fz="xs" style={{ width: "auto" }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>local slope at</Table.Th>
                {decades.map((d) => <Table.Th key={d} style={{ textAlign: "right" }}>Re = {fmtRe(d)}</Table.Th>)}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {curves.map(({ e, c, s }) => (
                <Table.Tr key={e}>
                  <Table.Td>{label(e)}</Table.Td>
                  {decades.map((d) => (
                    <Table.Td key={d} style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {slopeAt(c, s, d).toFixed(4)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Text size="xs" c="dimmed">
          The slope is a finite difference of ln f against ln Re between neighbouring grid
          points of the same regime, central inside a regime and one-sided at its ends,
          computed on the page. Blasius&apos; exponent is −0.25 for comparison.
        </Text>
        <EngineSource />
      </Panel>
    </Stack>
  );
}

// ---- Page 4: master and slave --------------------------------------------------------------

export function SlavePage(): JSX.Element {
  const [lr, setLr] = useState(2);           // log10(gamma / eps)
  const eps = 1, gamma = 10 ** lr;
  const x0 = 0.02 * Math.sqrt(eps * gamma), tEnd = 8;
  const run = useMemo(() => hakenRun(eps, gamma, tEnd, x0), [gamma, x0]);
  const ev = hakenEigenvalues(eps, gamma);
  const xs = run.xStar;
  return (
    <Stack gap="md">
      {step(9)}
      {step(10)}
      <Panel title="Haken's model: the full pair against the reduced equation" origin={["page", "assumption"]}
        originNote="both systems integrated on this page, at the ratio you set; no engine run">
        <LabeledSlider label={<>scale ratio <Tex src="\gamma/\varepsilon" mode="inline" /></>}
          value={lr} min={0} max={3} step={0.05} onChange={setLr} show={fmtSig(gamma / eps, 3)} />
        <Group gap={8} wrap="wrap">
          <Badge tt="none" variant="light">x* = √(εγ) = {fmtSig(xs, 4)}</Badge>
          <Badge tt="none" variant="light">
            eigenvalues: {ev.im[0] === 0
              ? `${fmtSig(ev.re[0]!, 4)}, ${fmtSig(ev.re[1]!, 4)}`
              : `${fmtSig(ev.re[0]!, 4)} ± ${fmtSig(ev.im[0]!, 4)} i`}
          </Badge>
          <Badge tt="none" variant="light" color={ev.im[0] === 0 ? "gray" : "red"}>
            {ev.im[0] === 0 ? "γ ≥ 8ε: a monotone approach" : "γ < 8ε: complex roots, the full system oscillates"}
          </Badge>
          <Badge tt="none" variant="filled">max |x − x_reduced| / x* = {fmtSig(run.maxRelErr, 3)}</Badge>
        </Group>
        <CurvePlot xLog={false} yLog={false} xLabel="t (units of 1/ε)" yLabel="x / x*"
          series={[
            { label: "full system (RK4)", x: run.t, y: run.x.map((v) => v / xs), color: SLOT[0] },
            { label: "reduced (closed form)", x: run.t, y: run.xReduced.map((v) => v / xs),
              color: SLOT[1], dash: "6 4" },
          ]} />
        <CurvePlot xLog={false} yLog={false} xLabel="t (units of 1/ε)" yLabel="y / y*"
          series={[
            { label: "slave y, full system", x: run.t, y: run.y.map((v) => v / eps), color: SLOT[2] },
            { label: "slaved y = x²/γ", x: run.t, y: run.ySlaved.map((v) => v / eps),
              color: SLOT[4], dash: "6 4" },
          ]} />
        <Text size="xs" c="dimmed">
          ε = 1 and x(0) = 0.02 x*, y(0) = 0. Both equations of the full system are
          integrated on the page by classical fourth-order Runge-Kutta with a step that
          resolves 1/γ; the reduced curve is the closed form of step 9, evaluated. No
          engine run is involved in this page.
        </Text>
      </Panel>
      {step(11)}
    </Stack>
  );
}

// ---- Page 5: correlations in practice ---------------------------------------------------

type FitCurveId = "colebrook" | "gnielinski";

export function PracticePage({ moody, nusselt }: { moody: SweepTable; nusselt: SweepTable }): JSX.Element {
  const keys = useMemo(() => keysOf(moody, "relRough"), [moody]);
  const prs = useMemo(() => keysOf(nusselt, "Pr"), [nusselt]);

  // ---- (a) one decade, one power law
  const [which, setWhich] = useState<FitCurveId>("colebrook");
  const pr = prs.includes(7) ? 7 : (prs[0] ?? 7);
  const full = useMemo(() => (which === "colebrook"
    ? curveOf(moody, "relRough", 0, "f_Colebrook", "in_Colebrook")
    : curveOf(nusselt, "Pr", pr, "Nu_Gnielinski", "in_Gnielinski")), [which, moody, nusselt, pr]);
  //  Fitted only inside the correlation's own window.
  const win = useMemo(() => {
    const idx = full.Re.map((_, i) => i).filter((i) => full.inWindow[i]);
    return { Re: idx.map((i) => full.Re[i]!), y: idx.map((i) => full.y[i]!) };
  }, [full]);
  //  A decade always STARTS ON A GRID POINT, so it holds the 21 points from
  //  a to 10 a inclusive (the grid is 20 points per decade).
  let lastStart = 0;
  win.Re.forEach((r, i) => { if (10 * r <= win.Re.at(-1)! * (1 + 1e-9)) lastStart = i; });
  const [i0, setI0] = useState<number | null>(null);
  const firstAtLeast = (v: number) => Math.max(0, win.Re.findIndex((r) => r >= v * (1 - 1e-9)));
  const iStart = Math.min(i0 ?? firstAtLeast(1e4), lastStart);
  const a = win.Re[iStart] ?? 1e4;
  const [tol, setTol] = useState(0.2);
  const fit = useMemo(() => fitDecade(win.Re, win.y, a), [win, a]);
  const reach = useMemo(() => reachWithin(win.Re, win.y, fit, a, tol), [win, fit, a, tol]);
  const drift = useMemo(() => {
    const out: { a: number; m: number; err: number }[] = [];
    if (!win.Re.length) return out;
    for (let e = Math.ceil(Math.log10(win.Re[0]!) - 1e-9); ; e++) {
      const k = win.Re.findIndex((r) => r >= 10 ** e * (1 - 1e-9));
      if (k < 0 || k > lastStart) break;
      const f = fitDecade(win.Re, win.y, win.Re[k]!);
      out.push({ a: win.Re[k]!, m: f.m, err: f.maxRelErr });
    }
    return out;
  }, [win, lastStart]);
  const yName = which === "colebrook" ? "f" : "Nu";

  // ---- (b) the blend of asymptotes
  const [eps, setEps] = useState(1e-3);
  const e = keys.includes(eps) ? eps : (keys[0] ?? 0);
  const [n, setN] = useState(12);
  const ch = useMemo(() => ({
    f: curveOf(moody, "relRough", e, "f_Churchill"),
    fL: curveOf(moody, "relRough", e, "fL_Churchill"),
    fT: curveOf(moody, "relRough", e, "fT_Churchill"),
  }), [moody, e]);
  const blendN = ch.f.Re.map((_, i) => blend(ch.fL.y[i]!, ch.fT.y[i]!, n));
  const maxDev = (yy: readonly number[]) => yy.reduce((m, v, i) => Math.max(m, Math.abs(v / ch.f.y[i]! - 1)), 0);
  const dev12 = useMemo(() => maxDev(ch.f.Re.map((_, i) => blend(ch.fL.y[i]!, ch.fT.y[i]!, 12))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ch]);
  const devN = maxDev(blendN);

  // ---- (c) the transition zone -- its own roughness, smooth by default, so
  //  Blasius (which carries no roughness term) is asked a question it can
  //  answer and the spread is about the transition, not about Blasius.
  const [epsT, setEpsT] = useState(0);
  const eT = keys.includes(epsT) ? epsT : (keys[0] ?? 0);
  const fNames = useMemo(() => moody.cols.filter((c) => c.startsWith("f_")).map((c) => c.slice(2)), [moody]);
  const spread = useMemo(() => {
    const fc = fNames.map((nm) => curveOf(moody, "relRough", eT, `f_${nm}`, `in_${nm}`));
    const nc = TUBE_NU.map((nm) => curveOf(nusselt, "Pr", pr, `Nu_${nm}`, `in_${nm}`));
    const sp = (cs: Curve[]) => cs[0]!.Re.map((_, i) => {
      const v = cs.map((c) => c.y[i]!);
      return (Math.max(...v) - Math.min(...v)) / Math.min(...v);
    });
    return { fc, nc, sf: sp(fc), sn: sp(nc) };
  }, [moody, nusselt, fNames, eT, pr]);
  const rows = spread.fc[0]!.Re.map((Re, i) => ({ Re, i }))
    .filter(({ Re }) => Re >= 1e3 * (1 - 1e-9) && Re <= 1.6e4 && Math.abs(Math.log10(Re) * 10
      - Math.round(Math.log10(Re) * 10)) < 1e-6);

  return (
    <Stack gap="md">
      {step(12)}
      <Panel title="one decade, one power law" origin={["engine", "page"]}
        originNote="the engine's sweep, fitted on this page">
        <SegmentedControl size="xs" value={which}
          onChange={(v) => { setWhich(v as FitCurveId); setI0(null); }}
          data={[{ value: "colebrook", label: "Colebrook, smooth pipe" },
            { value: "gnielinski", label: `Gnielinski Nu, Pr = ${fmtSig(pr, 2)}` }]} />
        <LabeledSlider label="the decade fitted starts at Re =" value={iStart} min={0}
          max={lastStart} step={1} onChange={setI0} show={`${fmtSig(a, 3)} .. ${fmtSig(10 * a, 3)}`} />
        <LabeledSlider label="design tolerance" value={tol} min={0.05} max={0.3} step={0.01}
          onChange={setTol} show={`±${Math.round(tol * 100)} %`} />
        <Group gap={8} wrap="wrap">
          <Badge tt="none" variant="filled">
            {yName} ≈ {fmtSig(fit.C, 4)} Re^{fmtSig(fit.m, 4)}
          </Badge>
          <Badge tt="none" variant="light">{fit.n} grid points</Badge>
          <Badge tt="none" variant="light">worst error inside the decade {fmtSig(100 * fit.maxRelErr, 3)} %</Badge>
          <Badge tt="none" variant="light" color="grape">
            within ±{Math.round(tol * 100)} % from Re = {fmtSig(reach.lo, 3)} to {fmtSig(reach.hi, 3)}
            {" "}({fmtSig(reach.decades, 3)} decades)
          </Badge>
        </Group>
        <CurvePlot xLabel="Re" yLabel={which === "colebrook" ? "f (Darcy)" : "Nu"}
          bands={[{ x0: a, x1: 10 * a, label: "fitted decade" }]}
          series={[
            { label: which === "colebrook" ? "Colebrook (engine)" : "Gnielinski (engine)",
              x: win.Re, y: win.y, color: SLOT[0] },
            { label: "power law fitted on one decade", x: win.Re,
              y: win.Re.map((r) => fit.C * r ** fit.m), color: SLOT[1], dash: "6 4" },
          ]} />
        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder fz="xs" style={{ width: "auto" }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>decade fitted</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>exponent m</Table.Th>
                <Table.Th style={{ textAlign: "right" }}>worst error in the decade</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {drift.map((d) => (
                <Table.Tr key={d.a}>
                  <Table.Td>{fmtSig(d.a, 4)} .. {fmtSig(10 * d.a, 4)}</Table.Td>
                  <Table.Td style={{ textAlign: "right", fontFamily: "monospace" }}>{d.m.toFixed(4)}</Table.Td>
                  <Table.Td style={{ textAlign: "right", fontFamily: "monospace" }}>
                    {(100 * d.err).toFixed(2)} %
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Text size="xs" c="dimmed">
          Least squares of ln {yName} on ln Re over the grid points of the decade, computed on
          the page; only points inside the correlation&apos;s own window are used.
        </Text>
      </Panel>

      {step(13)}
      <Panel title="Churchill's expression as a blend of its two asymptotes" origin={["engine", "page", "assumption"]}
        originNote="the asymptotes and f are the engine's; the blend at your n is this page's">
        <RoughnessPicker keys={keys} value={e} onChange={setEps} />
        <LabeledSlider label={<>blending exponent <Tex src="n" mode="inline" /></>} value={n}
          min={1} max={30} step={1} onChange={setN} show={String(n)} />
        <Group gap={8} wrap="wrap">
          <Badge tt="none" variant="filled" color={dev12 < 1e-12 ? "teal" : "red"}>
            at n = 12, max |blend / f_Churchill − 1| over the grid = {dev12.toExponential(2)}
          </Badge>
          <Badge tt="none" variant="light">at n = {n}: {fmtSig(100 * devN, 3)} %</Badge>
        </Group>
        <CurvePlot xLabel="Re" yLabel="f (Darcy)" yDomain={[1e-3, 1]} bands={[TRANSITION_BAND]}
          series={[
            { label: "laminar asymptote 64/Re", x: ch.fL.Re, y: ch.fL.y, color: SLOT[2], dash: "4 4" },
            { label: "turbulent branch f_t", x: ch.fT.Re, y: ch.fT.y, color: SLOT[3], dash: "4 4" },
            { label: "Churchill f (engine)", x: ch.f.Re, y: ch.f.y, color: CORR_COLOR.Churchill! },
            { label: `blend at n = ${n}`, x: ch.f.Re, y: blendN, color: SLOT[0], width: 1.5 },
          ]} />
        <Text size="xs" c="dimmed">
          The two asymptotes and Churchill&apos;s f are the engine&apos;s (columns
          fL_Churchill, fT_Churchill, f_Churchill); the blend is computed on the page from the
          two asymptotes alone. Inside the shaded band every n draws a smooth curve and none
          of them is the friction factor of a real pipe: the blend is an interpolation that
          keeps a solver continuous, not a model of the transition.
        </Text>
      </Panel>

      {step(14)}
      <Panel title="the transition band: the correlations disagree, and Re does not decide the regime"
        origin={["engine", "page"]}
        originNote="the correlations are the engine's sweep; the spread is computed on this page">
        <RoughnessPicker keys={keys} value={eT} onChange={setEpsT} />
        <CurvePlot xLabel="Re" yLabel="spread s (0.1 = 10 %)" yLog={false} height={240}
          xDomain={[1e3, 1e5]} bands={[TRANSITION_BAND]}
          series={[
            { label: `friction, ε/D = ${fmtSig(eT, 2)}`, x: spread.fc[0]!.Re, y: spread.sf, color: SLOT[0] },
            { label: `Nusselt (tube-side), Pr = ${fmtSig(pr, 2)}`, x: spread.nc[0]!.Re, y: spread.sn,
              color: SLOT[1] },
          ]} />
        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder fz="xs" style={{ width: "auto" }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Re</Table.Th>
                <Table.Th>regime</Table.Th>
                {fNames.map((nm) => <Table.Th key={nm} style={{ textAlign: "right" }}>f {nm}</Table.Th>)}
                <Table.Th style={{ textAlign: "right" }}>spread s</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ Re, i }) => (
                <Table.Tr key={Re}>
                  <Table.Td>{fmtSig(Re, 3)}</Table.Td>
                  <Table.Td>{spread.fc[0]!.regime[i]}</Table.Td>
                  {spread.fc.map((c, k) => (
                    <Table.Td key={fNames[k]} style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {c.y[i]!.toFixed(5)}{c.inWindow[i] ? "" : " †"}
                    </Table.Td>
                  ))}
                  <Table.Td style={{ textAlign: "right", fontFamily: "monospace" }}>
                    {(100 * spread.sf[i]!).toFixed(1)} %
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
        <Text size="xs" c="dimmed">
          † the engine flags the point as outside that correlation&apos;s own window (below
          2300 a substituted laminar law, or an extrapolation; Blasius at any ε/D above zero,
          because it has no roughness term). The Nusselt spread is Gnielinski against
          Dittus-Boelter only -- Kern is a shell-side correlation and is left out. A row
          inside the band is what each correlation RETURNS there, not what a pipe at that Re
          does: the regime itself is not determined by Re in the band.
        </Text>
        <EngineSource />
      </Panel>

      {step(15)}
      <Box>
        <Title order={5}>Sources of step 15, and how each was read</Title>
        {SIMPLICITY_SOURCES.map((s) => (
          <Box key={s.id} mt={6}>
            <Text size="sm">{s.cite}</Text>
            <Text size="xs" c="dimmed">{s.used}</Text>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

// ---- the page ------------------------------------------------------------------------------

const step = lessonStepper(SIMPLICITY_STEPS);

export function CorrelationSimplicityTool(): JSX.Element {
  const [page, setPage] = useState<PageId>("dims");
  //  The engine run starts the first time a page needs it, and is kept.
  const [started, setStarted] = useState(false);
  useEffect(() => { if (NEEDS_ENGINE.has(page)) setStarted(true); }, [page]);
  const run = useMethodRun(started ? SIMPLICITY_WITNESS : null, [], "", "choupoProps");
  const moody = useMemo(() => parseSweepCsv(run.result?.csvFiles?.[MOODY_CSV] ?? ""), [run.result]);
  const nusselt = useMemo(() => parseSweepCsv(run.result?.csvFiles?.[NUSSELT_CSV] ?? ""), [run.result]);
  const ready = moody.rows.length > 0 && nusselt.rows.length > 0;

  const engineGate = (body: () => JSX.Element): JSX.Element => {
    if (run.err) {
      return (
        <Alert color="red" variant="light" title="the engine run did not finish">
          <Text size="sm">{run.err}</Text>
        </Alert>
      );
    }
    if (!ready) {
      return (
        <Group gap={8}>
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            running {SIMPLICITY_WITNESS} with choupoProps in your browser…
          </Text>
        </Group>
      );
    }
    return body();
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Why engineering correlations are simple</Title>
          <Text size="sm" c="dimmed" mt={4}>
            From dimensional analysis to master and slave scales. The Buckingham Π theorem
            reduces the number of variables, but the function it leaves is arbitrary; that
            correlations end up with few groups AND very simple formulas that fit to a design
            tolerance comes from somewhere else -- from asymptotic regimes, from the separation
            of scales, and from the narrow range a correlation is fitted over.
          </Text>
        </Box>
        <Alert color="gray" variant="light" title="Synthetic data, said plainly">
          <Text size="sm">
            The curves on pages 2, 3 and 5 are the engine&apos;s own friction-factor and
            Nusselt correlations, evaluated by the engine on a grid. They stand in for the
            truth a student differentiates and fits: no measurement enters this
            page.
          </Text>
        </Alert>
        <SegmentedControl fullWidth value={page} onChange={(v) => setPage(v as PageId)} data={PAGES} />
        {page === "dims" && <DimensionalPage />}
        {page === "pi" && engineGate(() => <PiPage moody={moody} />)}
        {page === "asym" && engineGate(() => <AsymptotesPage moody={moody} />)}
        {page === "slave" && <SlavePage />}
        {page === "practice" && engineGate(() => <PracticePage moody={moody} nusselt={nusselt} />)}
        {run.busy && page !== "dims" && page !== "slave" && ready && (
          <Text size="xs" c="dimmed">re-running…</Text>
        )}
        <LessonQuiz title="Check your understanding (all five pages)"
          questions={SIMPLICITY_QUIZ} lesson={SIMPLICITY_STEPS} />
        <LessonLimits limits={SIMPLICITY_LIMITS} />
      </Stack>
    </Box>
  );
}
