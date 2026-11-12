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
  AdsorptionIsothermsTool — the EduTool `adsorption-isotherms`.

  The student's task, in one sentence: "I have laboratory equilibrium points
  (c, q) for a solute on an adsorbent; which isotherm describes them, with
  what parameters, and how far can I trust it?"

  The page fits the linear, Langmuir and Freundlich isotherms to the points
  -- a synthetic example whose generating parameters are printed, or points
  the student pastes -- by the classical straight lines AND by direct
  least squares on q, shows the residuals and the standard errors, says
  whether the measured range can tell the models apart, and uses the fitted
  isotherm once, for the dose of a single-stage batch.

  ALL OF IT IS THIS PAGE'S ARITHMETIC (gui/src/case/adsorptionIsotherms.ts),
  and every panel is marked so: the engine carries gas-phase Henry and
  Langmuir isotherms in partial pressure and no Freundlich, so a liquid
  point has no honest route through it today.  The measurement and the
  proposal are in docs/design/adsorption-isotherms-from-laboratory-data.md.
\*---------------------------------------------------------------------------*/

import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Box, Group, NumberInput, SegmentedControl, Select, Stack, Table, Text, Textarea, Title,
} from "@mantine/core";

import {
  C_UNITS, MODELS, MODEL_LABEL, PARAM_NAMES, Q_UNITS, SYNTHETIC,
  batchDose, diagnostics, directFit, isothermQ, linearisedFit, paramUnits, parsePoints,
  pointsText, syntheticPoints,
  type Fit, type ModelId, type Pt, type SyntheticSpec, type Weighting,
} from "../../case/adsorptionIsotherms.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { ISO_LIMITS, ISO_STEPS } from "./adsorptionIsothermsLesson.js";

// ---- colours and formatting ---------------------------------------------------------

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const SHADE = "rgba(128, 128, 128, 0.18)";
export const MODEL_COLOR: Readonly<Record<ModelId, string>> = {
  linear: "#8a5cd6", langmuir: "#2a78d6", freundlich: "#d4572a",
};

export const fmt = (v: number, d = 4): string => {
  if (!Number.isFinite(v)) return v === Infinity ? "∞" : "—";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(d - 1);
  const s = v.toPrecision(d);
  return s.includes("e") ? v.toExponential(d - 1) : s;
};

// ---- a small x-y plot ---------------------------------------------------------------

type XY = readonly [number, number];
interface Series {
  name: string;
  color: string;
  points?: readonly XY[];
  line?: readonly XY[];
  dash?: string;
}

const PW = 560, PH = 350, ML = 70, MR = 14, MT = 14, MB = 54;

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => span / s <= n + 0.5) ?? 10 * p;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9 * span; t += step) out.push(Number(t.toPrecision(12)));
  return out;
}

/** Ticks of a log axis between 10^lo and 10^hi: the decades, and 2 and 5
 *  within each decade when the axis spans less than three. */
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  const mult = hi - lo < 3 ? [1, 2, 5] : [1];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++)
    for (const m of mult) {
      const v = m * Math.pow(10, e), l = Math.log10(v);
      if (l >= lo - 1e-9 && l <= hi + 1e-9) out.push(Number(v.toPrecision(6)));
    }
  return out;
}

const tickLabel = (v: number): string => {
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(0);
  return String(Number(v.toPrecision(6)));
};

export function XYPlot({ series, xLabel, yLabel, xlog = false, ylog = false, span, yZero = false, yFromPoints = false, ariaLabel }: {
  series: readonly Series[];
  xLabel: string;
  yLabel: string;
  xlog?: boolean;
  ylog?: boolean;
  /** The measured x range: everything outside it is shaded and labelled. */
  span?: readonly [number, number];
  /** Draw a horizontal line at y = 0 (residual plots). */
  yZero?: boolean;
  /** Scale y to the POINTS only; the lines are clipped at the frame.  Used
   *  where a model curve far from the data would otherwise flatten them. */
  yFromPoints?: boolean;
  ariaLabel: string;
}): JSX.Element {
  const clipId = useId().replace(/:/g, "");
  const ok = ([x, y]: XY) => Number.isFinite(x) && Number.isFinite(y) && (!xlog || x > 0) && (!ylog || y > 0);
  const all = series.flatMap((s) => [...(s.points ?? []), ...(s.line ?? [])]).filter(ok);
  const forY = yFromPoints ? series.flatMap((s) => [...(s.points ?? [])]).filter(ok) : all;
  const tx = (v: number) => (xlog ? Math.log10(v) : v);
  const ty = (v: number) => (ylog ? Math.log10(v) : v);
  let x0 = Math.min(...all.map((p) => tx(p[0]))), x1 = Math.max(...all.map((p) => tx(p[0])));
  let y0 = Math.min(...forY.map((p) => ty(p[1]))), y1 = Math.max(...forY.map((p) => ty(p[1])));
  if (!xlog) x0 = Math.min(0, x0);
  if (!ylog && !yZero) y0 = Math.min(0, y0);
  if (yZero) { const m = Math.max(Math.abs(y0), Math.abs(y1), 1e-12); y0 = -m; y1 = m; }
  if (!(x1 > x0)) x1 = x0 + 1;
  if (!(y1 > y0)) y1 = y0 + 1;
  if (yFromPoints && ylog) { y0 -= 0.5; y1 += 0.3; }
  else if (yFromPoints) y1 += 0.25 * (y1 - y0);
  const padY = 0.04 * (y1 - y0);
  y1 += padY; if (ylog || yZero) y0 -= padY;
  const X = (v: number) => ML + ((tx(v) - x0) / (x1 - x0)) * (PW - ML - MR);
  const Y = (v: number) => PH - MB - ((ty(v) - y0) / (y1 - y0)) * (PH - MT - MB);
  const xt = xlog ? logTicks(x0, x1) : niceTicks(x0, x1);
  const yt = ylog ? logTicks(y0, y1) : niceTicks(y0, y1);
  const drawable = (p: XY) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!xlog || p[0] > 0) && (!ylog || p[1] > 0);
  const inside = (p: XY) => drawable(p) && ty(p[1]) >= y0 - 1e-9 && ty(p[1]) <= y1 + 1e-9;
  const pathOf = (pts: readonly XY[]) => {
    let d = "", pen = false;
    for (const p of pts) {
      if (!drawable(p)) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const left = ML, right = PW - MR, top = MT, bottom = PH - MB;
  return (
    <Box>
      <svg viewBox={`0 0 ${PW} ${PH}`} width="100%" role="img" aria-label={ariaLabel}
        style={{ display: "block", maxWidth: PW, fontSize: 15 }}>
        {span && (
          <g data-outside-span="">
            {X(span[0]) > left + 0.5 && (
              <rect x={left} y={top} width={X(span[0]) - left} height={bottom - top} fill={SHADE} />
            )}
            {X(span[1]) < right - 0.5 && (
              <rect x={X(span[1])} y={top} width={right - X(span[1])} height={bottom - top} fill={SHADE} />
            )}
          </g>
        )}
        <rect x={left} y={top} width={right - left} height={bottom - top} fill="none" stroke={GRID} />
        {xt.map((t) => (
          <g key={`x${t}`}>
            <line x1={X(t)} x2={X(t)} y1={top} y2={bottom} stroke={GRID} strokeWidth={0.6} />
            <text x={X(t)} y={bottom + 19} textAnchor="middle" fill={INK}>{tickLabel(t)}</text>
          </g>
        ))}
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={left} x2={right} y1={Y(t)} y2={Y(t)} stroke={GRID} strokeWidth={0.6} />
            <text x={left - 6} y={Y(t) + 4} textAnchor="end" fill={INK}>{tickLabel(t)}</text>
          </g>
        ))}
        {yZero && <line x1={left} x2={right} y1={Y(0)} y2={Y(0)} stroke={TEXT} strokeWidth={1} />}
        <clipPath id={clipId}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => s.line && (
            <path key={`l${s.name}`} d={pathOf(s.line)} fill="none" stroke={s.color} strokeWidth={2}
              strokeDasharray={s.dash} />
          ))}
        </g>
        {series.map((s) => s.points?.filter(inside).map((p, k) => (
          <circle key={`p${s.name}${k}`} cx={X(p[0])} cy={Y(p[1])} r={4.2} fill={s.color}
            stroke="var(--mantine-color-body)" strokeWidth={1} />
        )))}
        <text x={(left + right) / 2} y={PH - 10} textAnchor="middle" fill={TEXT}>{xLabel}</text>
        <text x={14} y={(top + bottom) / 2} textAnchor="middle" fill={TEXT}
          transform={`rotate(-90 14 ${(top + bottom) / 2})`}>{yLabel}</text>
      </svg>
      <Group gap={12} mt={4} wrap="wrap">
        {series.map((s) => (
          <Group key={s.name} gap={6} wrap="nowrap">
            <svg width={26} height={10} aria-hidden>
              {s.line ? <line x1={0} x2={26} y1={5} y2={5} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
                : <circle cx={13} cy={5} r={4} fill={s.color} />}
            </svg>
            <Text size="xs">{s.name}</Text>
          </Group>
        ))}
        {span && (
          <Group gap={6} wrap="nowrap">
            <Box w={18} h={10} style={{ background: SHADE, border: `1px solid ${GRID}` }} />
            <Text size="xs">outside the measured range: not a prediction</Text>
          </Group>
        )}
      </Group>
    </Box>
  );
}

// ---- panels -----------------------------------------------------------------------

export function Panel({ title, origin, originNote, children }: {
  title: string; origin: OriginKind | readonly OriginKind[];
  originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" style={{ border: `1px solid ${GRID}`, borderRadius: 6, minWidth: 0 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>{title}</Text>
      <Box mb={8}><OriginMark of={origin} note={originNote} /></Box>
      <Stack gap={10}>{children}</Stack>
    </Box>
  );
}

/** Tables scroll inside their own box, never the page. */
export function Wide({ children }: { children: ReactNode }): JSX.Element {
  return <Box style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</Box>;
}

const step = lessonStepper(ISO_STEPS);

/** A log-spaced (or linear) grid of concentrations for drawing a curve. */
function curveGrid(lo: number, hi: number, log: boolean, n = 160): number[] {
  return Array.from({ length: n }, (_, k) => (log
    ? lo * Math.pow(hi / lo, k / (n - 1))
    : lo + ((hi - lo) * k) / (n - 1)));
}

function paramLines(f: Fit, cU: string, qU: string, withSe: boolean): string[] {
  if (f.refused) return ["refused"];
  const units = paramUnits(f.model, cU, qU);
  return PARAM_NAMES[f.model].map((nm, k) => {
    const se = withSe && f.se ? ` ± ${fmt(f.se[k]!, 2)}` : "";
    const u = units[k] === "–" ? "" : ` ${units[k]}`;
    return `${nm} = ${fmt(f.params[k]!)}${se}${u}`;
  });
}

/** One parameter per line, so a narrow table wraps by parameter. */
function ParamCell({ f, cU, qU, withSe }: { f: Fit; cU: string; qU: string; withSe: boolean }): JSX.Element {
  return <>{paramLines(f, cU, qU, withSe).map((l) => <Text key={l} size="xs" style={{ whiteSpace: "nowrap" }}>{l}</Text>)}</>;
}

// ---- illustration of step 1 -------------------------------------------------------

function ShapesFigure(): JSX.Element {
  const c = curveGrid(0, 10, false, 80);
  return (
    <XYPlot ariaLabel="favourable, linear and unfavourable isotherm shapes"
      xLabel="c (any units)" yLabel="q (any units)"
      series={[
        { name: "favourable: q = 10 c/(1 + c)", color: MODEL_COLOR.langmuir, line: c.map((x) => [x, (10 * x) / (1 + x)]) },
        { name: "linear: q = 0.8 c", color: MODEL_COLOR.linear, line: c.map((x) => [x, 0.8 * x]) },
        { name: "unfavourable: q = 0.08 c²", color: MODEL_COLOR.freundlich, line: c.map((x) => [x, 0.08 * x * x]) },
      ]} />
  );
}

// ---- the page ---------------------------------------------------------------------

type Source = string;   // a SYNTHETIC id, or "paste"

export function AdsorptionIsothermsTool(): JSX.Element {
  const [source, setSource] = useState<Source>(SYNTHETIC[0]!.id);
  const [pasteText, setPasteText] = useState<string>(
    "c\tq\n" + pointsText(syntheticPoints(SYNTHETIC[1]!)));
  const [pasteCU, setPasteCU] = useState<string>("mmol/L");
  const [pasteQU, setPasteQU] = useState<string>("mmol/g");
  const [weighting, setWeighting] = useState<Weighting>("absolute");
  const [axes, setAxes] = useState<"auto" | "linear" | "log">("auto");

  const spec: SyntheticSpec | null = SYNTHETIC.find((s) => s.id === source) ?? null;
  const parsed = useMemo(() => (spec ? null : parsePoints(pasteText)), [spec, pasteText]);
  const pts: Pt[] = useMemo(
    () => (spec ? syntheticPoints(spec) : parsed?.points ?? []), [spec, parsed]);
  const cU = spec ? spec.cU : pasteCU, qU = spec ? spec.qU : pasteQU;

  const fits = useMemo(() => (pts.length ? MODELS.map((m) => directFit(m, pts, weighting)) : []), [pts, weighting]);
  const lins = useMemo(() => (pts.length ? MODELS.map((m) => linearisedFit(m, pts)) : []), [pts]);
  const diag = useMemo(() => (fits.length ? diagnostics(pts, fits[1]!, fits[2]!) : null), [pts, fits]);

  const cmin = pts.length ? pts[0]!.c : NaN, cmax = pts.length ? pts[pts.length - 1]!.c : NaN;
  const logAxes = axes === "log" || (axes === "auto" && (diag?.decades ?? 0) >= 2);
  const smallest = fits.length ? fits.reduce((a, b) => (b.rms < a.rms ? b : a)) : null;

  // batch
  const [batchModel, setBatchModel] = useState<ModelId | null>(null);
  const [V, setV] = useState<number | string>(1);
  const [c0, setC0] = useState<number | string>("");
  const [removal, setRemoval] = useState<number | string>(90);
  const [q0, setQ0] = useState<number | string>(0);
  const bModel: ModelId = batchModel ?? smallest?.model ?? "langmuir";
  const bFit = fits.find((f) => f.model === bModel);
  const c0v = c0 === "" ? cmax : Number(c0);
  const cUnit = C_UNITS.find((u) => u.id === cU)!, qUnit = Q_UNITS.find((u) => u.id === qU)!;
  const batch = bFit && pts.length ? batchDose({
    model: bModel, params: bFit.params, cU: cUnit, qU: qUnit,
    V_L: Number(V), c0: c0v, removal: Number(removal) / 100, q0: Number(q0),
  }) : null;

  const xs = logAxes ? curveGrid(cmin / 3, cmax * 3, true) : curveGrid(0, cmax * 1.35, false);
  const xsFine = logAxes ? xs : curveGrid(cmax * 1e-3, cmax * 1.35, false);
  const dataSeries: Series = { name: "measured points", color: TEXT, points: pts.map((p) => [p.c, p.q]) };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>Adsorption isotherms from laboratory data</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You have equilibrium points -- a concentration left in the liquid and the loading on
            the solid -- for one solute on one adsorbent at one temperature.  Which isotherm
            describes them, with what parameters, and how far can you trust it?  This page fits
            the linear, Langmuir and Freundlich isotherms two ways, shows what each leaves behind,
            and uses the result once, for a batch dose.  Every number here is computed by this
            page in your browser; the engine has no liquid-phase isotherm today.
          </Text>
        </Box>

        {step(1)}
        <Panel title="three shapes" origin="assumption"
          originNote="illustrative curves; their equations are printed in the legend">
          <ShapesFigure />
        </Panel>

        {step(2)}

        <Panel title="the points" origin="assumption"
          originNote={spec ? "a SYNTHETIC set, generated by this page from the parameters and noise printed below -- not a measurement"
            : "your points, as pasted"}>
          <Select label="data" allowDeselect={false} value={source}
            onChange={(v) => { if (v) { setSource(v); setC0(""); setBatchModel(null); } }}
            data={[...SYNTHETIC.map((s) => ({ value: s.id, label: s.label })),
              { value: "paste", label: "Paste your own points" }]} />
          {spec ? (
            <>
              <Text size="sm">{spec.story}</Text>
              <Alert color="gray" variant="light" title="Synthetic: generated, not measured">
                <Text size="sm">
                  {spec.n} points, c evenly spaced in log c from {spec.cFrom} to {spec.cTo} {spec.cU};
                  q from the {MODEL_LABEL[spec.model]} isotherm with{" "}
                  {PARAM_NAMES[spec.model].map((nm, k) => `${nm} = ${spec.params[k]}`).join(", ")}{" "}
                  ({spec.cU}, {spec.qU}), each multiplied by exp(σ e) with σ = {spec.sigma} and e a
                  standard normal number from a seeded generator (seed {spec.seed}), then rounded to
                  four significant figures.  So the fit below can be checked against the truth.
                </Text>
              </Alert>
            </>
          ) : (
            <>
              <Text size="sm">
                Two columns, c then q, one point per line, separated by spaces, a tab, a semicolon
                or a single comma (a spreadsheet copy works).  A first line of text is read as a
                header.  At least four points, all positive.
              </Text>
              <Group gap="sm" align="flex-start" wrap="wrap">
                <Textarea label="c and q" value={pasteText} minRows={8} autosize maxRows={16}
                  onChange={(e) => setPasteText(e.currentTarget.value)} data-points-input=""
                  styles={{ input: { fontFamily: "monospace" } }} style={{ flex: "1 1 220px", minWidth: 0 }} />
                <Stack gap="xs" style={{ flex: "1 1 200px" }}>
                  <Select label="unit of c" allowDeselect={false} value={pasteCU}
                    onChange={(v) => { if (v) setPasteCU(v); }}
                    data={C_UNITS.map((u) => ({ value: u.id, label: u.label }))} />
                  <Select label="unit of q" allowDeselect={false} value={pasteQU}
                    onChange={(v) => { if (v) setPasteQU(v); }}
                    data={Q_UNITS.map((u) => ({ value: u.id, label: u.label }))} />
                </Stack>
              </Group>
              {parsed?.header && (
                <Text size="xs" c="dimmed">First line read as a header and skipped: "{parsed.header}".</Text>
              )}
              {parsed && parsed.errors.length > 0 && (
                <Alert color="red" variant="light" title="Refused: these points cannot be fitted as written">
                  <Stack gap={4}>
                    {parsed.errors.map((e) => <Text key={e} size="sm">{e}</Text>)}
                  </Stack>
                </Alert>
              )}
            </>
          )}
          {pts.length > 0 && (
            <Text size="sm">
              {pts.length} points, c from {fmt(cmin)} to {fmt(cmax)} {cU} ({fmt(diag!.decades, 3)} decades),
              q from {fmt(Math.min(...pts.map((p) => p.q)))} to {fmt(Math.max(...pts.map((p) => p.q)))} {qU}.
            </Text>
          )}
        </Panel>

        {step(3)}

        {pts.length > 0 && (
          <>
            <Panel title="the three direct fits on the isotherm" origin="page"
              originNote="least squares on q by this page's Levenberg-Marquardt; the curves are the formulas of step 2 at the fitted parameters">
              <Group gap="sm" wrap="wrap">
                <Box>
                  <Text size="sm" fw={500} mb={4}>residuals</Text>
                  <SegmentedControl size="xs" value={weighting} onChange={(v) => setWeighting(v as Weighting)}
                    data={[{ value: "absolute", label: "absolute, on q" }, { value: "relative", label: "relative, on q" }]} />
                </Box>
                <Box>
                  <Text size="sm" fw={500} mb={4}>axes</Text>
                  <SegmentedControl size="xs" value={axes} onChange={(v) => setAxes(v as typeof axes)}
                    data={[{ value: "auto", label: "auto" }, { value: "linear", label: "linear" }, { value: "log", label: "log-log" }]} />
                </Box>
              </Group>
              <XYPlot ariaLabel="measured points and the three fitted isotherms"
                xLabel={`c, ${cU}`} yLabel={`q, ${qU}`} xlog={logAxes} ylog={logAxes} span={[cmin, cmax]} yFromPoints
                series={[
                  ...fits.map((f) => ({
                    name: MODEL_LABEL[f.model], color: MODEL_COLOR[f.model],
                    line: xsFine.map((c): XY => [c, isothermQ(f.model, f.params, c)]),
                  })),
                  dataSeries,
                ]} />
              <Text size="xs" c="dimmed">
                {logAxes ? "Log-log axes (chosen because the points span two decades or more): a "
                  + "Freundlich isotherm is a straight line here, and a Langmuir one bends over "
                  + "to its plateau." : "Linear axes."}{" "}
                The shaded bands lie outside the measured concentrations; the curves are drawn
                there only to show how the models part company, which is exactly why no curve there
                is a prediction.
              </Text>
            </Panel>

            <Panel title="the classical straight lines, beside the direct fits" origin="page"
              originNote="ordinary least squares on the transformed variables of step 3, by this page">
              <Group gap="md" align="flex-start" wrap="wrap">
                <Box style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <Text size="sm" fw={500}>Langmuir: 1/q against 1/c</Text>
                  <XYPlot ariaLabel="double-reciprocal Langmuir plot" yFromPoints
                    xLabel={`1/c, 1/(${cU})`} yLabel={`1/q, 1/(${qU})`}
                    series={[
                      ...(lins[1]!.refused ? [] : [{
                        name: "straight-line fit", color: MODEL_COLOR.langmuir, dash: "6 4",
                        line: [[0, 1 / lins[1]!.params[0]!], [1.05 / cmin, (1 + lins[1]!.params[1]! * 1.05 / cmin) / lins[1]!.params[0]!]] as XY[],
                      }]),
                      {
                        name: "direct fit, transformed", color: MODEL_COLOR.langmuir,
                        line: [[0, 1 / fits[1]!.params[0]!], [1.05 / cmin, (1 + fits[1]!.params[1]! * 1.05 / cmin) / fits[1]!.params[0]!]] as XY[],
                      },
                      { name: "points", color: TEXT, points: pts.map((p): XY => [1 / p.c, 1 / p.q]) },
                    ]} />
                </Box>
                <Box style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <Text size="sm" fw={500}>Freundlich: log q against log c</Text>
                  <XYPlot ariaLabel="log-log Freundlich plot" xlog ylog
                    xLabel={`c, ${cU}`} yLabel={`q, ${qU}`}
                    series={[
                      {
                        name: "straight-line fit", color: MODEL_COLOR.freundlich, dash: "6 4",
                        line: [[cmin, isothermQ("freundlich", lins[2]!.params, cmin)], [cmax, isothermQ("freundlich", lins[2]!.params, cmax)]] as XY[],
                      },
                      {
                        name: "direct fit", color: MODEL_COLOR.freundlich,
                        line: [[cmin, isothermQ("freundlich", fits[2]!.params, cmin)], [cmax, isothermQ("freundlich", fits[2]!.params, cmax)]] as XY[],
                      },
                      { name: "points", color: TEXT, points: pts.map((p): XY => [p.c, p.q]) },
                    ]} />
                </Box>
              </Group>
              <Wide>
                <Table fz="xs" striped withTableBorder style={{ minWidth: 560 }} styles={{ th: { whiteSpace: "nowrap" } }}>
                  <Table.Thead><Table.Tr>
                    <Table.Th>model</Table.Th><Table.Th>straight-line fit</Table.Th>
                    <Table.Th>R², transformed</Table.Th><Table.Th>direct fit ({weighting} residuals)</Table.Th>
                  </Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {MODELS.slice(1).map((m, k) => (
                      <Table.Tr key={m}>
                        <Table.Td>{MODEL_LABEL[m]}</Table.Td>
                        <Table.Td>{lins[k + 1]!.refused ? <Text size="xs" c="red">refused: {lins[k + 1]!.refused}</Text>
                          : <ParamCell f={lins[k + 1]!} cU={cU} qU={qU} withSe={false} />}</Table.Td>
                        <Table.Td>{lins[k + 1]!.r2Transformed !== undefined ? fmt(lins[k + 1]!.r2Transformed!, 4) : "—"}</Table.Td>
                        <Table.Td><ParamCell f={fits[k + 1]!} cU={cU} qU={qU} withSe={false} /></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Wide>
              <Text size="xs" c="dimmed">
                The two lines in each plot are two answers from the same points.  The straight-line
                fit minimises the scatter of 1/q (or log q); the direct fit minimises the scatter of q.
                On the double-reciprocal plot the points at the lowest concentrations sit far to the
                right and pull the line; a high R² there says the TRANSFORMED points lie close to a
                line, not that the isotherm fits q.
              </Text>
            </Panel>

            {step(4)}

            <Panel title="parameters, standard errors and residuals" origin="page"
              originNote="the direct fits; standard errors from s² (JᵀWJ)⁻¹ at the answer, by this page">
              <Wide>
                <Table fz="xs" striped withTableBorder style={{ minWidth: 560 }} styles={{ th: { whiteSpace: "nowrap" } }}>
                  <Table.Thead><Table.Tr>
                    <Table.Th>model</Table.Th><Table.Th>parameters ± standard error</Table.Th>
                    <Table.Th>RMS, {qU}</Table.Th><Table.Th>largest relative error</Table.Th>
                    <Table.Th>LM iterations</Table.Th>
                  </Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {fits.map((f) => (
                      <Table.Tr key={f.model}>
                        <Table.Td><Text span size="xs" fw={700} c={MODEL_COLOR[f.model]}>{MODEL_LABEL[f.model]}</Text></Table.Td>
                        <Table.Td><ParamCell f={f} cU={cU} qU={qU} withSe /></Table.Td>
                        <Table.Td>{fmt(f.rms, 3)}</Table.Td>
                        <Table.Td>{(100 * f.maxRel).toFixed(1)} %</Table.Td>
                        <Table.Td>{f.model === "linear" ? "none (closed form)" : `${f.iterations}${f.converged ? "" : ", NOT converged"}`}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Wide>
              {smallest && (
                <Text size="sm">
                  Smallest RMS residual: <b>{MODEL_LABEL[smallest.model]}</b> ({fmt(smallest.rms, 3)} {qU}
                  {fits.filter((f) => f !== smallest).map((f) => `, against ${fmt(f.rms, 3)} for ${MODEL_LABEL[f.model]}`).join("")}).
                  A smaller RMS with two parameters against one is expected even when the extra
                  parameter is not needed; read the residual plot for a pattern before choosing.
                </Text>
              )}
              <XYPlot ariaLabel="relative residuals of the three fits" yZero xlog={logAxes}
                xLabel={`c, ${cU}`} yLabel="(q_model − q)/q"
                series={fits.map((f) => ({
                  name: MODEL_LABEL[f.model], color: MODEL_COLOR[f.model],
                  points: pts.map((p, i): XY => [p.c, f.relResid[i]!]),
                  line: pts.map((p, i): XY => [p.c, f.relResid[i]!]), dash: "2 3",
                }))} />
              <Text size="xs" c="dimmed">
                Relative residuals, whichever residuals the fit minimised.  A model with the right
                shape scatters about zero; a run of one sign followed by a run of the other is a
                wrong shape, however small the RMS.
              </Text>
            </Panel>

            {spec && (
              <Panel title="did the fit recover the truth?" origin={["page", "assumption"]}
                originNote="the generating parameters are declared by the example; the fitted ones are this page's">
                <Text size="sm">
                  These points were generated from the {MODEL_LABEL[spec.model]} isotherm with{" "}
                  {PARAM_NAMES[spec.model].map((nm, k) => `${nm} = ${spec.params[k]}`).join(", ")}.
                  The direct {MODEL_LABEL[spec.model]} fit gives{" "}
                  {(() => {
                    const f = fits.find((x) => x.model === spec.model)!;
                    return PARAM_NAMES[spec.model].map((nm, k) => {
                      const dev = f.se ? Math.abs(f.params[k]! - spec.params[k]!) / f.se[k]! : NaN;
                      return `${nm} = ${fmt(f.params[k]!)} ± ${fmt(f.se?.[k] ?? NaN, 2)} (${fmt(dev, 2)} standard errors from the truth)`;
                    }).join(", ");
                  })()}.
                </Text>
                <Text size="xs" c="dimmed">
                  With {fmt(spec.sigma * 100, 2)} % noise, a parameter within about two standard errors of
                  its generating value is what an honest fit delivers.  Change the residuals between
                  absolute and relative and watch the answer move.
                </Text>
              </Panel>
            )}

            <Panel title="can these points tell the models apart?" origin="page"
              originNote="from the measured range and the direct Langmuir and Freundlich fits, by this page">
              <Wide>
                <Table fz="xs" withTableBorder>
                  <Table.Tbody>
                    <Table.Tr><Table.Td>decades of c spanned, log₁₀(c_max/c_min)</Table.Td><Table.Td>{fmt(diag!.decades, 3)}</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>fraction of the Langmuir plateau at the highest point, c_max/(K_L + c_max)</Table.Td><Table.Td>{(100 * diag!.thetaMax).toFixed(1)} %</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>the same at the lowest point</Table.Td><Table.Td>{(100 * diag!.thetaMin).toFixed(1)} %</Table.Td></Table.Tr>
                    <Table.Tr><Table.Td>Freundlich n from 1, in standard errors, |n − 1|/se</Table.Td><Table.Td>{fmt(diag!.curvatureInSE, 3)}</Table.Td></Table.Tr>
                  </Table.Tbody>
                </Table>
              </Wide>
              {diag!.warnings.length > 0 ? (
                <Alert color="yellow" variant="light" title="What these points cannot settle">
                  <Stack gap={4}>{diag!.warnings.map((w) => <Text key={w} size="sm">{w}</Text>)}</Stack>
                </Alert>
              ) : (
                <Text size="sm">
                  The points span the low-concentration region and approach the plateau, over more
                  than a decade, and show curvature beyond their scatter: the range is wide enough
                  for the models to disagree, so their residuals can decide between them.
                </Text>
              )}
              <Text size="xs" c="dimmed">
                These are rules of thumb this page applies, with the thresholds written in each
                sentence (10 % and 50 % of the plateau, one decade, two standard errors).  The
                Langmuir plateau they refer to is the fitted one, so where Langmuir itself fits badly
                read them as a statement about that fit.
              </Text>
            </Panel>

            {step(5)}

            <Panel title="one batch tank, dosed to a target" origin={["page", "assumption"]}
              originNote="the balance of step 5 on the fitted isotherm, by this page; the volume, concentration and removal are your inputs">
              <Group gap="sm" align="flex-end" wrap="wrap">
                <Select label="isotherm" allowDeselect={false} value={bModel} w={150}
                  onChange={(v) => { if (v) setBatchModel(v as ModelId); }}
                  data={MODELS.map((m) => ({ value: m, label: MODEL_LABEL[m] }))} />
                <NumberInput label="V, L" value={V} onChange={setV} min={0} w={110} />
                <NumberInput label={`c₀, ${cU}`} value={c0 === "" ? Number(cmax.toPrecision(4)) : c0}
                  onChange={setC0} min={0} w={140} />
                <NumberInput label="removal, %" value={removal} onChange={setRemoval} min={1} max={99.9} w={110} />
                <NumberInput label={`q₀, ${qU}`} value={q0} onChange={setQ0} min={0} w={130} />
              </Group>
              {batchModel === null && smallest && (
                <Text size="xs" c="dimmed">The isotherm defaults to the fit with the smallest RMS; choose another to compare.</Text>
              )}
              {batch?.refused ? (
                <Alert color="red" variant="light" title="Refused">
                  <Text size="sm">{batch.refused}</Text>
                </Alert>
              ) : batch && (
                <>
                  <Text size="sm">
                    To take c from {fmt(c0v)} to <b>{fmt(batch.c)} {cU}</b>, the {MODEL_LABEL[bModel]} fit holds
                    q* = {fmt(batch.q)} {qU} there, and the balance needs{" "}
                    <b>M = {fmt(batch.M_g)} g</b> of adsorbent for {fmt(Number(V))} L
                    ({fmt(batch.M_g / Number(V))} g per litre).  The operating line has slope −V/M = {fmt(-batch.slope)} {qU} per {cU}.
                  </Text>
                  {(batch.c < cmin || batch.c > cmax) && (
                    <Alert color="yellow" variant="light" title="The target lies outside the measured range">
                      <Text size="sm">
                        The isotherm is read at c = {fmt(batch.c)} {cU}, outside the measured {fmt(cmin)} to {fmt(cmax)}{" "}
                        {cU}: the dose rests on an extrapolation of the {MODEL_LABEL[bModel]} curve, and the three
                        models give {fits.map((f) => `${MODEL_LABEL[f.model]} q* = ${fmt(isothermQ(f.model, f.params, batch.c))}`).join(", ")}{" "}
                        {qU} there.  Measure a point at that concentration before trusting the number.
                      </Text>
                    </Alert>
                  )}
                  {c0v > cmax && (
                    <Text size="xs" c="dimmed">
                      c₀ is above the highest measured concentration; that is harmless for the balance,
                      which only reads the isotherm at the final concentration.
                    </Text>
                  )}
                  <XYPlot ariaLabel="isotherm with the batch operating line" xLabel={`c, ${cU}`} yLabel={`q, ${qU}`}
                    span={[cmin, cmax]}
                    series={[
                      {
                        name: `${MODEL_LABEL[bModel]} fit`, color: MODEL_COLOR[bModel],
                        line: curveGrid(0, Math.max(c0v, cmax) * 1.1, false).map((c): XY => [c, isothermQ(bModel, bFit!.params, c)]),
                      },
                      {
                        name: "operating line", color: TEXT, dash: "6 4",
                        line: [[c0v, Number(q0)], [batch.c, batch.q]] as XY[],
                      },
                      { name: "the answer", color: "#1baf7a", points: [[batch.c, batch.q]] },
                      { name: "measured points", color: INK, points: pts.map((p): XY => [p.c, p.q]) },
                    ]} />
                  <Text size="xs" c="dimmed">
                    This is the one-stage balance only.  Several stages, the dose against a curve
                    of removals and the contact time are on the Batch adsorption page, which takes
                    an isotherm from here.
                  </Text>
                </>
              )}
            </Panel>
          </>
        )}

        <LessonLimits limits={ISO_LIMITS} />
        <LessonReferences tool="adsorption-isotherms" />
      </Stack>
    </Box>
  );
}
