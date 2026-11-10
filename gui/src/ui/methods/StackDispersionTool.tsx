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
  StackDispersionTool -- "How tall must the stack be?" (DEV.md 4c C247,
  Vitor 2026-11-08: the design of chimneys, Gaussian equations with
  dispersion coefficients and the famous tables as a function of the weather,
  day or night; and for every EduTool, visual schemes with figures the student
  can move).

  THE TASK (CLAUDE.md section 10): a student has to say why a taller stack
  lowers the ground concentration, why a calm clear night is the bad case far
  from an elevated source and a sunny afternoon the bad case close in, and how
  a limit value turns into a stack height.  FOUR LIVE FIGURES, none static:
    (i)   Turner's key with the chosen cell lit and a picker; the class it
          lands on colours every other figure;
    (ii)  the plume in side view with its sigma envelope and the image source
          below ground;
    (iii) the ground-level concentration along x, log axes, the six classes
          faint, the limit and the maximum marked;
    (iv)  a plan view of ground isopleths with a fence the student sizes.

  TWO HALVES, said at the top of each: the TOY (a slider emission rate) and
  the ENGINE (the flueGas stream of a Gibbs reactor, read from a run).  The
  dispersion is the PAGE's own arithmetic (stackDispersionMath.ts) in both.

  CLASS COLOURS run warm (unstable) to cool (stable); each class is also
  named in every legend, because colour alone is not identity.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Button, Group, SegmentedControl, Stack, Table,
  Text, TextInput, Title,
} from "@mantine/core";

import { rawRecordFor } from "../../case/catalogue.js";
import { useMethodRun } from "../../case/methodRun.js";
import { Plot, darkLayout } from "../plotting/plotly.js";
import { KnobField, KnobNumber, KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";
import {
  STACK_LIMITS, STACK_QUIZ, STACK_SOURCES, STACK_STEPS,
} from "./stackDispersionLesson.js";
import {
  CLASSES, G_PER_M3_TO_MG, G_PER_M3_TO_UG, SIGMA_SETS, TURNER_TABLE,
  TURNER_VERIFIED, WIND_BANDS, WINDOW_M, effectiveHeight, emissionFromStream,
  exitVelocity, finalRise, fluxOf, gepHeight, glcAt, groundMax,
  leastStackHeight, pickClasses, sigmaY, sigmaZ, windBand, worstClass,
  type Insolation, type NightCloud, type Release, type StabilityClass,
  type Terrain,
} from "./stackDispersionMath.js";
import {
  KNOB_D, KNOB_D_STACK, KNOB_FENCE, KNOB_HB, KNOB_HS, KNOB_Q, KNOB_TA,
  KNOB_TRAINS, KNOB_TS, KNOB_TS_STACK, KNOB_U, KNOB_VS, KNOB_WB,
  STACK_DEFAULT, STACK_SPECIES, STACK_STREAM, STACK_WITNESS, type StackKnobs,
} from "./stackDispersionToy.js";

const step = lessonStepper(STACK_STEPS);

/** Warm for unstable, grey for neutral, cool for stable. */
export const CLASS_COLORS: Record<StabilityClass, string> = {
  A: "#d9480f", B: "#f08c00", C: "#c9a400", D: "#868e96", E: "#1c7ed6", F: "#5f3dc4",
};

type Unit = "ug" | "mg";
const UNIT_LABEL: Record<Unit, string> = { ug: "µg/m3", mg: "mg/m3" };
const unitFactor = (u: Unit): number => (u === "ug" ? G_PER_M3_TO_UG : G_PER_M3_TO_MG);

const f = (x: number | null | undefined, p = 1): string =>
  typeof x === "number" && Number.isFinite(x)
    ? (Math.abs(x) >= 1e5 || (x !== 0 && Math.abs(x) < 0.01) ? x.toExponential(2) : x.toFixed(p))
    : "—";

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))",
} as const;

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

export function HalfBanner({ half, children }: {
  half: "toy" | "engine"; children: React.ReactNode;
}): JSX.Element {
  const toy = half === "toy";
  return (
    <Alert color={toy ? "orange" : "teal"} variant="light" mt="sm" data-half={half}
      title={toy ? "The toy: an emission rate you set, dispersion computed in this page"
        : "The engine: the flue gas read from a run; dispersion still computed in this page"}>
      <Text size="sm">{children}</Text>
    </Alert>
  );
}

// ---- the shared state --------------------------------------------------------

interface Setup {
  k: StackKnobs;
  /** "table" = what Turner's key gives; a letter = the student's override */
  override: "table" | StabilityClass;
  /** which of the allowed classes the single-class figures draw */
  pick: StabilityClass | null;
  unit: Unit;
}

interface Derived {
  allowed: readonly StabilityClass[];
  fromTable: readonly StabilityClass[];
  active: StabilityClass;
  r: Release;
  F: number;
  worst: ReturnType<typeof worstClass>;
  activeMax: ReturnType<typeof groundMax>;
  limitG: number;
}

export function derive(s: Setup, r: Release): Derived {
  const k = s.k;
  const fromTable = pickClasses({ ...k.weather, wind10: k.u });
  const allowed: readonly StabilityClass[] =
    s.override !== "table" ? [s.override] : fromTable.length > 0 ? fromTable : CLASSES;
  const active = s.pick && allowed.includes(s.pick) ? s.pick : allowed[0]!;
  return {
    allowed, fromTable, active, r, F: fluxOf(r),
    worst: worstClass(r, allowed, k.terrain),
    activeMax: groundMax(r, active, k.terrain),
    limitG: k.limit / G_PER_M3_TO_UG,
  };
}

const releaseOf = (k: StackKnobs): Release => ({
  Q: k.Q, u: k.u, hs: k.hs, d: k.d, vs: k.vs, Ts: k.Ts, Ta: k.Ta,
});

// ---- figure (i): Turner's key and the picker -----------------------------------

const COLS: { id: Insolation | NightCloud; group: "day" | "night"; head: string }[] = [
  { id: "strong", group: "day", head: "strong" },
  { id: "moderate", group: "day", head: "moderate" },
  { id: "slight", group: "day", head: "slight" },
  { id: "overcast", group: "night", head: "thinly overcast or 4/8 or more low cloud" },
  { id: "clear", group: "night", head: "3/8 or less cloud" },
];

export function ClassChip({ c, size = "sm" }: { c: StabilityClass; size?: "xs" | "sm" }): JSX.Element {
  return (
    <Badge size={size} radius="sm" data-class={c}
      style={{ background: CLASS_COLORS[c], color: "#fff" }}>{c}</Badge>
  );
}

export function TurnerTable({ s }: { s: Setup }): JSX.Element {
  const band = windBand(s.k.u);
  const col = s.k.weather.day ? s.k.weather.insolation : s.k.weather.cloud;
  return (
    <PanTable>
      <Table.Thead>
        <Table.Tr>
          <Table.Th rowSpan={2}>surface wind (10 m) [m/s]</Table.Th>
          <Table.Th colSpan={3} ta="center">DAY: incoming solar radiation</Table.Th>
          <Table.Th colSpan={2} ta="center">NIGHT: cloud cover</Table.Th>
        </Table.Tr>
        <Table.Tr>{COLS.map((c) => <Table.Th key={c.id}>{c.head}</Table.Th>)}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {WIND_BANDS.map((b) => (
          <Table.Tr key={b} data-wind-band={b}>
            <Table.Td>{b}</Table.Td>
            {COLS.map((c) => {
              const cell = TURNER_TABLE[b][c.id];
              const lit = b === band && c.id === col;
              return (
                <Table.Td key={c.id} data-lit={lit ? "yes" : undefined}
                  style={lit ? { outline: "3px solid var(--mantine-color-yellow-6)",
                    outlineOffset: -3, fontWeight: 700 } : undefined}>
                  {cell.length === 0 ? "—" : cell.join("-")}
                </Table.Td>
              );
            })}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </PanTable>
  );
}

function Picker({ s, set, d }: {
  s: Setup; set: (s: Setup) => void; d: Derived;
}): JSX.Element {
  const k = s.k;
  const setK = (p: Partial<StackKnobs>) => set({ ...s, k: { ...k, ...p } });
  return (
    <Box data-figure="i">
      <Box style={KNOB_GRID}>
        <KnobField label="when">
          <SegmentedControl size="xs" fullWidth value={k.weather.day ? "day" : "night"}
            data={[{ value: "day", label: "day" }, { value: "night", label: "night" }]}
            onChange={(v) => setK({ weather: { ...k.weather, day: v === "day" } })} />
        </KnobField>
        {k.weather.day ? (
          <KnobField label="sunshine">
            <SegmentedControl size="xs" fullWidth value={k.weather.insolation}
              data={["strong", "moderate", "slight"]}
              onChange={(v) => setK({ weather: { ...k.weather, insolation: v as Insolation } })} />
          </KnobField>
        ) : (
          <KnobField label="cloud">
            <SegmentedControl size="xs" fullWidth value={k.weather.cloud}
              data={[{ value: "overcast", label: "overcast / 4/8 +" },
                { value: "clear", label: "clear / 3/8 -" }]}
              onChange={(v) => setK({ weather: { ...k.weather, cloud: v as NightCloud } })} />
          </KnobField>
        )}
        <KnobSlider knob={KNOB_U} value={k.u} onChange={(v) => setK({ u: v })} />
        <KnobField label="terrain (which sigma set)">
          <SegmentedControl size="xs" fullWidth value={k.terrain}
            data={[{ value: "rural", label: "open country" }, { value: "urban", label: "town" }]}
            onChange={(v) => setK({ terrain: v as Terrain })} />
        </KnobField>
        <KnobField label="class: from the table, or by hand">
          <SegmentedControl size="xs" fullWidth value={s.override}
            data={[{ value: "table", label: "table" }, ...CLASSES.map((c) => ({ value: c, label: c }))]}
            onChange={(v) => set({ ...s, override: v as Setup["override"] })} />
        </KnobField>
      </Box>
      <Group mt="xs" gap="xs" align="center" data-picked="">
        <Text size="sm">Turner&apos;s key gives:</Text>
        {d.fromTable.length === 0
          ? <Text size="sm" c="dimmed">no class (a dash: night, wind under 2 m/s). Every class is drawn.</Text>
          : d.fromTable.map((c) => <ClassChip key={c} c={c} />)}
        {s.override !== "table" && <Text size="sm" c="dimmed">overridden by hand to {s.override}</Text>}
        {d.allowed.length > 1 && (
          <>
            <Text size="sm" c="dimmed">single-class figures draw</Text>
            <SegmentedControl size="xs" value={d.active}
              data={d.allowed.map((c) => ({ value: c, label: c }))}
              onChange={(v) => set({ ...s, pick: v as StabilityClass })} />
          </>
        )}
      </Group>
      <TurnerTable s={s} />
      <Text size="xs" c="dimmed" mt={4}>
        A cell with two letters is the class between: the design searches both. The table is
        {TURNER_VERIFIED === "unread" ? " NOT checked against a printed copy of Turner's workbook (see the sources)." : " Turner's Table 3-1 (1967 edition, p. 6). Strong sun is a solar altitude above 60 degrees with clear sky, slight 15 to 35 degrees; D applies to overcast day or night; night runs from 1 h before sunset to 1 h after sunrise."}
      </Text>
    </Box>
  );
}

// ---- figure (ii): the plume in side view ---------------------------------------

export function sideViewTraces(d: Derived, terrain: Terrain, hs: number) {
  const cls = d.active;
  const H = effectiveHeight(d.r, cls);
  const xmax = Math.min(10000, Math.max(1000, 1.4 * d.activeMax.x));
  const xs = Array.from({ length: 81 }, (_, i) => (xmax * i) / 80);
  const xr = 0.08 * xmax;
  const sz = xs.map((x) => (x <= 0 ? 0 : sigmaZ(x, cls, terrain)));
  const col = CLASS_COLORS[cls];
  const centre = xs.map((x) => (x < xr ? hs + ((H - hs) * x) / xr : H));
  const aboveEnv = xs.map((x, i) => (x < xr ? NaN : H + sz[i]!));
  const belowEnv = xs.map((x, i) => (x < xr ? NaN : H - sz[i]!));
  const traces = [
    { x: [0, xmax], y: [0, 0], type: "scatter", mode: "lines", name: "ground",
      line: { color: "#868e96", width: 3 } },
    { x: [0, 0], y: [0, hs], type: "scatter", mode: "lines", name: `stack, ${f(hs, 0)} m`,
      line: { color: "#495057", width: 6 } },
    { x: xs, y: centre, type: "scatter", mode: "lines", name: `plume centre line, H = ${f(H, 0)} m`,
      line: { color: col, width: 3 } },
    { x: xs, y: aboveEnv, type: "scatter", mode: "lines", name: "± one sigma-z envelope",
      line: { color: col, width: 1.5, dash: "dot" } },
    { x: xs, y: belowEnv, type: "scatter", mode: "lines", name: "envelope, lower",
      showlegend: false, line: { color: col, width: 1.5, dash: "dot" } },
    { x: xs, y: xs.map((x) => (x < xr ? NaN : -H)), type: "scatter", mode: "lines",
      name: "image source (below the ground)", line: { color: col, width: 2, dash: "dash" } },
    { x: xs, y: xs.map((x, i) => (x < xr ? NaN : -H + sz[i]!)), type: "scatter", mode: "lines",
      name: "image envelope", showlegend: false, line: { color: col, width: 1, dash: "dashdot" } },
    { x: xs, y: xs.map((x, i) => (x < xr ? NaN : -H - sz[i]!)), type: "scatter", mode: "lines",
      name: "image envelope, lower", showlegend: false, line: { color: col, width: 1, dash: "dashdot" } },
    { x: [d.activeMax.x], y: [0], type: "scatter", mode: "markers",
      name: `ground maximum at ${f(d.activeMax.x, 0)} m`,
      marker: { symbol: "diamond", size: 12, color: col, line: { color: "#fff", width: 1 } } },
  ];
  return { traces, xmax, H };
}

function SideView({ s, d }: { s: Setup; d: Derived }): JSX.Element {
  const k = s.k;
  const { traces, xmax, H } = useMemo(
    () => sideViewTraces(d, k.terrain, k.hs), [d, k.terrain, k.hs]);
  return (
    <Box data-figure="ii" mt="sm" style={{ width: "100%", height: 420 }}>
      <Plot data={traces}
        layout={{
          ...darkLayout,
          title: { text: `Side view, class ${d.active}: the plume and its image`,
            font: { ...darkLayout.font, size: 14 } },
          xaxis: { ...darkLayout.xaxis, range: [0, xmax], title: { text: "distance downwind x  [m]" } },
          yaxis: { ...darkLayout.yaxis, range: [-1.15 * Math.max(H, 40) - 40, 1.4 * Math.max(H, 40) + 40],
            title: { text: "height z  [m]" } },
          legend: { ...darkLayout.legend, orientation: "h", y: -0.28 },
          margin: { ...darkLayout.margin, b: 130 },
        }}
        useResizeHandler style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}

// ---- figure (iii): ground concentration along x ----------------------------------

export function glcCurve(r: Release, cls: StabilityClass, t: Terrain, n = 90) {
  const [lo, hi] = WINDOW_M;
  const x = Array.from({ length: n + 1 }, (_, i) => lo * Math.pow(hi / lo, i / n));
  return { x, conc: x.map((xi) => glcAt(r, cls, t, xi)) };
}

function GlcFigure({ s, d }: { s: Setup; d: Derived }): JSX.Element {
  const k = s.k;
  const fac = unitFactor(s.unit);
  const curves = useMemo(
    () => CLASSES.map((cl) => ({ cl, ...glcCurve(d.r, cl, k.terrain) })), [d.r, k.terrain]);
  const peak = Math.max(...curves.flatMap((q) => q.conc)) * fac;
  const limit = d.limitG * fac;
  const top = Math.max(peak, limit) * 2;
  const bottom = Math.min(top * 1e-4, limit / 30);
  const traces: object[] = curves.map((cv) => ({
    x: cv.x, y: cv.conc.map((v) => v * fac), type: "scatter", mode: "lines",
    name: `class ${cv.cl}${d.allowed.includes(cv.cl) ? "" : " (not allowed now)"}`,
    opacity: cv.cl === d.active ? 1 : d.allowed.includes(cv.cl) ? 0.55 : 0.22,
    line: { color: CLASS_COLORS[cv.cl], width: cv.cl === d.active ? 4 : 1.5 },
  }));
  traces.push(
    { x: [WINDOW_M[0], WINDOW_M[1]], y: [limit, limit], type: "scatter", mode: "lines",
      name: `limit, ${f(limit, 3)} ${UNIT_LABEL[s.unit]}`, line: { color: "#e03131", width: 2, dash: "dash" } },
    { x: [d.activeMax.x], y: [d.activeMax.C * fac], type: "scatter", mode: "markers",
      name: `maximum of class ${d.active}: ${f(d.activeMax.C * fac, 3)} at ${f(d.activeMax.x, 0)} m`
        + (d.activeMax.atEdge ? " (at the window edge)" : ""),
      marker: { symbol: "diamond", size: 13, color: CLASS_COLORS[d.active], line: { color: "#fff", width: 1 } } },
  );
  return (
    <Box data-figure="iii" mt="sm" style={{ width: "100%", height: 460 }}>
      <Plot data={traces}
        layout={{
          ...darkLayout,
          title: { text: "Ground-level concentration on the centre line, all six classes",
            font: { ...darkLayout.font, size: 14 } },
          xaxis: { ...darkLayout.xaxis, type: "log", range: [Math.log10(WINDOW_M[0]), Math.log10(WINDOW_M[1])],
            title: { text: "distance downwind x  [m]  (the window of the fits)" } },
          yaxis: { ...darkLayout.yaxis, type: "log", range: [Math.log10(bottom), Math.log10(top)],
            title: { text: `ground concentration C(x,0,0)  [${UNIT_LABEL[s.unit]}]` } },
          legend: { ...darkLayout.legend, orientation: "h", y: -0.3 },
          margin: { ...darkLayout.margin, b: 150 },
        }}
        useResizeHandler style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}

// ---- figure (iv): the plan view with a fence ----------------------------------------

export function planGrid(r: Release, cls: StabilityClass, t: Terrain, xmax: number, nx = 70, ny = 45) {
  const xs = Array.from({ length: nx }, (_, i) => -0.2 * xmax + (1.2 * xmax * i) / (nx - 1));
  const ymax = 0.45 * xmax;
  const ys = Array.from({ length: ny }, (_, j) => -ymax + (2 * ymax * j) / (ny - 1));
  const z = ys.map((y) => xs.map((x) => {
    if (x < WINDOW_M[0] * 0.5) return NaN;
    const c = glcAt(r, cls, t, x) * Math.exp(-(y * y) / (2 * sigmaY(x, cls, t) ** 2));
    return c > 0 ? c : NaN;
  }));
  return { xs, ys, z };
}

function PlanView({ s, d }: { s: Setup; d: Derived }): JSX.Element {
  const k = s.k;
  const fac = unitFactor(s.unit);
  const xmax = Math.min(10000, Math.max(1.6 * d.activeMax.x, 2 * k.fence, 600));
  const g = useMemo(() => planGrid(d.r, d.active, k.terrain, xmax), [d.r, d.active, k.terrain, xmax]);
  const zl = g.z.map((row) => row.map((v) => (Number.isFinite(v) ? Math.log10(v * fac) : null)));
  const lim = Math.log10(d.limitG * fac);
  const th = Array.from({ length: 73 }, (_, i) => (2 * Math.PI * i) / 72);
  const inside = d.activeMax.x < k.fence;
  const traces: object[] = [
    { type: "contour", x: g.xs, y: g.ys, z: zl, name: "isopleths",
      colorscale: "Viridis", contours: { coloring: "heatmap" }, ncontours: 14,
      colorbar: { title: { text: `log10 C [${UNIT_LABEL[s.unit]}]` }, thickness: 12 },
      hovertemplate: "x %{x:.0f} m, y %{y:.0f} m, log10 C %{z:.2f}<extra></extra>" },
    { type: "contour", x: g.xs, y: g.ys, z: zl, showscale: false, name: "the limit",
      contours: { type: "constraint", operation: "=", value: lim },
      line: { color: "#e03131", width: 3 }, hoverinfo: "skip" },
    { type: "scatter", mode: "lines", name: `fence, radius ${f(k.fence, 0)} m`,
      x: th.map((t) => k.fence * Math.cos(t)), y: th.map((t) => k.fence * Math.sin(t)),
      line: { color: "#fff", width: 3, dash: "dash" } },
    { type: "scatter", mode: "markers", name: "stack", x: [0], y: [0],
      marker: { symbol: "x", size: 11, color: "#fff" } },
    { type: "scatter", mode: "markers",
      name: `ground maximum, ${inside ? "inside" : "outside"} the fence`,
      x: [d.activeMax.x], y: [0],
      marker: { symbol: "diamond", size: 13, color: inside ? "#74c0fc" : "#ff6b6b", line: { color: "#fff", width: 1 } } },
  ];
  return (
    <Box data-figure="iv" mt="sm" style={{ width: "100%", height: 460 }}>
      <Plot data={traces}
        layout={{
          ...darkLayout,
          title: { text: `Plan view, class ${d.active}, wind to the right: the red line is your limit`,
            font: { ...darkLayout.font, size: 14 } },
          xaxis: { ...darkLayout.xaxis, range: [-0.2 * xmax, xmax], title: { text: "x downwind  [m]" } },
          yaxis: { ...darkLayout.yaxis, range: [-0.45 * xmax, 0.45 * xmax], scaleanchor: "x",
            title: { text: "y across the wind  [m]" } },
          legend: { ...darkLayout.legend, orientation: "h", y: -0.25 },
          margin: { ...darkLayout.margin, b: 120 },
        }}
        useResizeHandler style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}

// ---- readouts ------------------------------------------------------------------------

export function ClassTable({ s, d }: { s: Setup; d: Derived }): JSX.Element {
  const fac = unitFactor(s.unit);
  return (
    <PanTable>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>class</Table.Th><Table.Th>allowed now</Table.Th>
          <Table.Th>sigma-y, sigma-z at 1 km [m]</Table.Th><Table.Th>rise Δh [m]</Table.Th>
          <Table.Th>effective height H [m]</Table.Th><Table.Th>maximum at x [m]</Table.Th>
          <Table.Th>maximum [{UNIT_LABEL[s.unit]}]</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {CLASSES.map((c) => {
          const m = groundMax(d.r, c, s.k.terrain);
          const allowed = d.allowed.includes(c);
          return (
            <Table.Tr key={c} data-class-row={c}
              style={c === d.worst.cls ? { background: "var(--mantine-color-yellow-light)" } : undefined}>
              <Table.Td><ClassChip c={c} size="xs" />{c === d.worst.cls ? <Badge ml={6} size="xs" color="orange">worst allowed</Badge> : null}</Table.Td>
              <Table.Td>{allowed ? "yes" : "no"}</Table.Td>
              <Table.Td>{f(sigmaY(1000, c, s.k.terrain), 0)}, {f(sigmaZ(1000, c, s.k.terrain), 0)}</Table.Td>
              <Table.Td>{f(finalRise(d.F, d.r.u, c, d.r.Ta), 1)}</Table.Td>
              <Table.Td>{f(effectiveHeight(d.r, c), 1)}</Table.Td>
              <Table.Td>{f(m.x, 0)}{m.atEdge ? " (edge)" : ""}</Table.Td>
              <Table.Td>{f(m.C * fac, 3)}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </PanTable>
  );
}

export interface Design {
  least: number | null;
  gep: number;
  recommended: number | null;
}

export function design(s: Setup, d: Derived): Design {
  const least = leastStackHeight(d.r, d.allowed, s.k.terrain, d.limitG);
  const gep = gepHeight(s.k.hb, s.k.wb);
  return { least, gep, recommended: least === null ? null : Math.max(least, gep) };
}

function DesignBlock({ s, d }: { s: Setup; d: Derived }): JSX.Element {
  const dz = useMemo(() => design(s, d), [s, d]);
  const fac = unitFactor(s.unit);
  const ok = d.worst.max.C <= d.limitG;
  return (
    <Box data-design="" mt="sm" px="sm" py="xs"
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Text size="sm" fw={600}>The design question, for the classes allowed now ({d.allowed.join(", ")})</Text>
      <Text size="sm" mt={4}>
        At h<sub>s</sub> = {f(d.r.hs, 0)} m the worst class is {d.worst.cls}, with a maximum of{" "}
        {f(d.worst.max.C * fac, 3)} {UNIT_LABEL[s.unit]} at {f(d.worst.max.x, 0)} m
        {d.worst.max.atEdge ? " (at the edge of the window: the true maximum is farther out)" : ""}:{" "}
        <b>{ok ? "under" : "over"}</b> your limit of {f(s.k.limit * fac / G_PER_M3_TO_UG, 3)} {UNIT_LABEL[s.unit]}
        {" "}(source: {s.k.limitSource}; date: {s.k.limitDate}).
      </Text>
      <Text size="sm" mt={4} data-least="">
        Least stack height that puts the worst maximum at the limit:{" "}
        <b>{dz.least === null ? "more than 1000 m" : `${f(dz.least, 1)} m`}</b>.
        Good-engineering-practice height next to a {f(s.k.hb, 0)} m building {f(s.k.wb, 0)} m wide:{" "}
        <b>{f(dz.gep, 1)} m</b>. Recommended, the larger of the two:{" "}
        <b>{dz.recommended === null ? "none within 1000 m" : `${f(dz.recommended, 1)} m`}</b>.
      </Text>
    </Box>
  );
}

// ---- the toy half -----------------------------------------------------------------------

export function Toy({ s, set }: { s: Setup; set: (s: Setup) => void }): JSX.Element {
  const k = s.k;
  const r = useMemo(() => releaseOf(k), [k]);
  const d = useMemo(() => derive(s, r), [s, r]);
  const setK = (p: Partial<StackKnobs>) => set({ ...s, k: { ...k, ...p } });
  return (
    <Box data-toy="">
      <HalfBanner half="toy">
        A source of {f(k.Q, 1)} g/s that you set, at the exit conditions you set. Every figure below
        redraws as you move a control; the class colour is the class Turner&apos;s key gives for the
        weather you pick.
      </HalfBanner>
      <OriginMark of={["page", "reference", "assumption"]}
        note="dispersion, classes, rise and search are this page's arithmetic (stackDispersionMath.ts); the emission rate and the limit are yours" />

      {/* The plume comes before step 2 (DEV.md 4c C277): the student moves
          the weather and the stack first; step 2 then names what the side view
          shows. */}
      <Box mt="sm" style={KNOB_GRID}>
        <KnobSlider knob={KNOB_HS} value={k.hs} onChange={(v) => setK({ hs: v })} />
        <KnobSlider knob={KNOB_U} value={k.u} onChange={(v) => setK({ u: v })} />
        <KnobSlider knob={KNOB_VS} value={k.vs} onChange={(v) => setK({ vs: v })} />
        <KnobSlider knob={KNOB_D} value={k.d} onChange={(v) => setK({ d: v })} />
        <KnobSlider knob={KNOB_TS} value={k.Ts} onChange={(v) => setK({ Ts: v })} />
        <KnobSlider knob={KNOB_TA} value={k.Ta} onChange={(v) => setK({ Ta: v })} />
      </Box>
      <SideView s={s} d={d} />
      <PanelNote>
        Buoyancy flux F = {f(d.F, 1)} m4/s3; rise of class {d.active} = {f(finalRise(d.F, k.u, d.active, k.Ta), 1)} m,
        so H = {f(effectiveHeight(r, d.active), 1)} m. The rise is drawn as a short climb; the page
        takes it all at once. Dashed below ground: the image source that makes the ground return the plume.
      </PanelNote>

      {step(2)}
      {step(3)}
      <Picker s={s} set={set} d={d} />

      {step(4)}
      {step(5)}
      <PanelNote>
        Sigma set: {SIGMA_SETS[k.terrain].source}.
        {SIGMA_SETS[k.terrain].verified === "unread" ? " Unread for this page." : " Read in the printed tables (see the sources)."}
      </PanelNote>

      {step(6)}
      <Box mt="sm" style={KNOB_GRID}>
        <KnobSlider knob={KNOB_Q} value={k.Q} onChange={(v) => setK({ Q: v })} />
        <KnobSlider knob={KNOB_HS} value={k.hs} onChange={(v) => setK({ hs: v })} />
        <KnobField label="concentration unit">
          <SegmentedControl size="xs" fullWidth value={s.unit}
            data={[{ value: "ug", label: "µg/m3" }, { value: "mg", label: "mg/m3" }]}
            onChange={(v) => set({ ...s, unit: v as Unit })} />
        </KnobField>
      </Box>
      <GlcFigure s={s} d={d} />
      <ClassTable s={s} d={d} />

      {step(7)}
      <Box mt="sm" style={KNOB_GRID}>
        <KnobNumber label={`your limit value [${UNIT_LABEL[s.unit]}]`}
          value={Number((k.limit * unitFactor(s.unit) / G_PER_M3_TO_UG).toPrecision(6))} min={0} step={s.unit === "ug" ? 1 : 0.001}
          onChange={(v) => setK({ limit: (v * G_PER_M3_TO_UG) / unitFactor(s.unit) })} />
        <KnobField label="its source">
          <TextInput size="xs" value={k.limitSource} onChange={(e) => setK({ limitSource: e.currentTarget.value })} />
        </KnobField>
        <KnobField label="its date">
          <TextInput size="xs" value={k.limitDate} onChange={(e) => setK({ limitDate: e.currentTarget.value })} />
        </KnobField>
        <KnobSlider knob={KNOB_FENCE} value={k.fence} onChange={(v) => setK({ fence: v })} />
        <KnobSlider knob={KNOB_HB} value={k.hb} onChange={(v) => setK({ hb: v })} />
        <KnobSlider knob={KNOB_WB} value={k.wb} onChange={(v) => setK({ wb: v })} />
      </Box>
      <PlanView s={s} d={d} />
      <DesignBlock s={s} d={d} />
    </Box>
  );
}

// ---- the engine half ---------------------------------------------------------------------

function molarMassOf(species: string): number | null {
  const body = rawRecordFor(species);
  const m = body ? /^\s*MW\s+([0-9.eE+-]+)\s*;/m.exec(body) : null;
  return m ? Number(m[1]) : null;
}

export function EngineHalf({ s }: { s: Setup }): JSX.Element {
  const [go, setGo] = useState(false);
  const [trains, setTrains] = useState(100);
  const [TsStack, setTsStack] = useState(450);
  const [dStack, setDStack] = useState(1.5);
  const run = useMethodRun(go ? STACK_WITNESS : null, [], "plain", "choupoSolve");
  const stream = run.result?.streams.find((x) => x.name === STACK_STREAM)
    ?? (run.result?.streamAliases?.[STACK_STREAM]
      ? run.result.streams.find((x) => x.name === run.result!.streamAliases![STACK_STREAM])
      : undefined);
  const M = molarMassOf(STACK_SPECIES);
  const k = s.k;
  const em = stream && M !== null
    ? emissionFromStream(stream, STACK_SPECIES, M, trains, TsStack) : null;
  const vs = em ? exitVelocity(em.Vdot, dStack) : null;
  const r: Release | null = em && vs !== null
    ? { Q: em.Q, u: k.u, hs: k.hs, d: dStack, vs, Ts: TsStack, Ta: k.Ta } : null;
  const d = useMemo(() => (r ? derive(s, r) : null), [s, r?.Q, r?.vs, r?.d, r?.Ts, r?.Ta, r?.hs, r?.u]); // eslint-disable-line react-hooks/exhaustive-deps
  const fac = unitFactor(s.unit);
  return (
    <Box data-engine-half="" mt="md">
      <HalfBanner half="engine">
        Methane burned at 1800 K in a Gibbs reactor ({STACK_WITNESS}). The page runs the case in
        the browser and READS the outlet stream {STACK_STREAM}: its flow, temperature, pressure and the mole
        fraction of {STACK_SPECIES}. It recomputes none of them. A stack as a sized item of the plant does
        not exist yet, so the diameter, the scale-up and the stack-gas temperature are yours.
      </HalfBanner>
      <OriginMark of={["engine", "page", "assumption"]}
        note={`the ${STACK_STREAM} stream of ${STACK_WITNESS} and the molar mass of ${STACK_SPECIES} from the catalogue are read; the scale-up, the stack-gas temperature and the diameter are assumptions`} />
      {step(8)}
      {!go && (
        <Button mt="sm" size="xs" variant="default" data-engine-run={STACK_WITNESS}
          onClick={() => setGo(true)}>
          Run {STACK_WITNESS} and read its flue gas
        </Button>
      )}
      {go && run.busy && <Text size="sm" mt="sm" c="dimmed">Running the engine in the browser…</Text>}
      {go && run.err && <Text size="sm" mt="sm" c="red">{run.err}</Text>}
      {go && !run.busy && !run.err && run.result && !stream && (
        <Text size="sm" mt="sm" c="red">The run published no stream named {STACK_STREAM}.</Text>
      )}
      {stream && M === null && <Text size="sm" mt="sm" c="red">The catalogue has no molar mass for {STACK_SPECIES}.</Text>}
      {stream && em && r && d && vs !== null && (
        <Box data-engine-result="">
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>read from the run</Table.Th><Table.Th>value</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>flow of {STACK_STREAM}</Table.Td><Table.Td>{f(stream.F * 3600, 3)} kmol/h</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>temperature, pressure</Table.Td><Table.Td>{f(stream.T, 0)} K, {f(stream.P / 1e5, 3)} bar</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{STACK_SPECIES} in the gas</Table.Td><Table.Td>{f(em.ppm, 0)} ppm (mole)</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>molar mass of {STACK_SPECIES} (catalogue)</Table.Td><Table.Td>{f(M, 3)} g/mol</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Box mt="sm" style={KNOB_GRID}>
            <KnobSlider knob={KNOB_TRAINS} value={trains} onChange={(v) => setTrains(Math.round(v))} showWhy />
            <KnobSlider knob={KNOB_TS_STACK} value={TsStack} onChange={setTsStack} showWhy />
            <KnobSlider knob={KNOB_D_STACK} value={dStack} onChange={setDStack} />
          </Box>
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>converted by the page</Table.Th><Table.Th>value</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr data-emission=""><Table.Td>emission rate of {STACK_SPECIES}, Q</Table.Td><Table.Td>{f(em.Q, 3)} g/s</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>flue-gas volume flow at {f(TsStack, 0)} K</Table.Td><Table.Td>{f(em.Vdot, 2)} m3/s</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>exit velocity through {f(dStack, 1)} m</Table.Td><Table.Td>{f(vs, 2)} m/s</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>buoyancy flux F (T<sub>a</sub> = {f(k.Ta, 0)} K)</Table.Td><Table.Td>{f(d.F, 1)} m4/s3</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>worst allowed class at h<sub>s</sub> = {f(k.hs, 0)} m</Table.Td>
                <Table.Td>{d.worst.cls}: {f(d.worst.max.C * fac, 3)} {UNIT_LABEL[s.unit]} at {f(d.worst.max.x, 0)} m</Table.Td></Table.Tr>
              <Table.Tr data-engine-least=""><Table.Td>least stack height for your limit</Table.Td>
                <Table.Td>{(() => { const h = leastStackHeight(r, d.allowed, k.terrain, d.limitG); return h === null ? "more than 1000 m" : `${f(h, 1)} m`; })()}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <PanelNote>
            The weather, terrain, stack height and limit are the ones set above in the toy. Move them there
            and this table follows.
          </PanelNote>
        </Box>
      )}
    </Box>
  );
}

// ---- the page --------------------------------------------------------------------------

export function StackDispersionTool(): JSX.Element {
  const [s, set] = useState<Setup>({
    k: STACK_DEFAULT, override: "table", pick: null, unit: "ug",
  });
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Box>
          <Title order={4}>How tall must the stack be?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The Gaussian plume, Pasquill&apos;s weather classes, Briggs&apos; spreads and rise, the ground
            maximum and the least stack height for a limit. Every figure moves: change the weather, the
            stack or the limit and the plume, the curves and the plan redraw.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Two halves, not one" data-halves="">
            The sections marked “the toy” use an emission rate you set; the section marked “the engine” reads the
            flue gas of a Choupo run. In both, the dispersion is this page&apos;s own arithmetic: the engine
            has no dispersion model and no stack as a sized item. The page says which half you are in at the top of each.
          </Alert>
        </Box>
        {step(1)}
        <Toy s={s} set={set} />
        <EngineHalf s={s} />
        <LessonQuiz title="Check your understanding" questions={STACK_QUIZ} lesson={STACK_STEPS} />
        <LessonLimits limits={STACK_LIMITS} />
        <Box data-sources="">
          <Title order={5}>Sources, and which were read</Title>
          {STACK_SOURCES.map((x) => (
            <Text key={x.id} size="xs" mt={6}>
              <b>{x.read === "read" ? "READ" : x.read === "partly" ? "PARTLY READ" : "NOT READ"}.</b>{" "}
              {x.cite}. {x.used}
            </Text>
          ))}
        </Box>
        <Text size="sm" c="dimmed">
          Next on the same shelf:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("pool-fire")}>
            the radiation of a pool fire
          </Anchor>.
        </Text>

        <LessonReferences tool="stack-dispersion" />
      </Stack>
    </Box>
  );
}
