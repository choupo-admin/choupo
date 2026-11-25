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
  ColumnDesignTool (EduTools): designing a column for a REAL mixture -- the
  general, strongly non-ideal case of column design, with the ideal mixture as
  its control.

  THE TASK, in one sentence: an engineer holds a feed and two product purities
  and must decide whether a column can do it, how tall, with how much reflux,
  and what that costs -- and must know how far to trust the shortcut that
  gave the first guess.  The page answers in four cards, in that order.

  WHERE EVERY NUMBER COMES FROM.  The rigorous column is solved by the engine
  (`choupoSolve`, `model simultaneous`), a designSpec per stage count holding
  both key purities, and the answers are a RECORDED RUN: the table the page
  reads is `gui/src/case/columnDesignRecorded.json`, written by
  `bin/curate/c501_column_design_table.py`.  A designSpec is about twenty MESH
  solves, so a live sweep would cost minutes per knob turn; the case
  `tutorials/steady/distillation/column21_design_curve_ethanol_water`
  reproduces any single point in seconds.  What the page computes itself is
  arithmetic it says so about (the lever rule, the annualised cost, the
  position of the minimum, the ratios); `case/columnDesign.ts` holds it and
  contains no physics.

  Theory: \label{ch:column-design} in docs/theoryGuide.tex.
\*---------------------------------------------------------------------------*/

import { Suspense, lazy, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import {
  COLUMN_DESIGN_LIMITS, COLUMN_DESIGN_QUIZ, COLUMN_DESIGN_STEPS,
} from "./columnDesignLesson.js";
import {
  FEED, HOURS_PER_YEAR, RECORD, annualCost, capitalRecovery, costOptimum,
  designCurve, distillateReachable, leverD, limitGap, systemRecord,
  type SystemId,
} from "../../case/columnDesign.js";

// ---- the knobs --------------------------------------------------------------------

const XD_KNOB: PanelKnob = {
  id: "xD",
  label: "Distillate purity asked for, light-key mole fraction",
  min: 0.5, max: 0.99, step: 0.005,
  why: "The product you would like to make. Drag it past the azeotrope of the "
    + "real mixture and the card says that no column can; the ideal mixture "
    + "is free of that limit.",
};

const PRICE_KNOB: PanelKnob = {
  id: "energyPrice",
  label: "Price of the reboiler's heat",
  unit: "EUR/kWh",
  min: 0.01, max: 0.2, step: 0.005,
  why: "Started at the engine's own low-pressure steam price. Dearer heat is "
    + "saved by spending capital: the cost optimum moves to more stages and "
    + "less reflux.",
};

const CHARGE_KNOB: PanelKnob = {
  id: "capitalCharge",
  label: "Capital charge",
  unit: "1/yr",
  min: 0.05, max: 0.4, step: 0.01,
  why: "The fraction of the installed cost charged each year (a capital-recovery "
    + "factor). Started at a ten percent rate over fifteen years.",
};

/** The engine's own price of the reboiler's steam, EUR per kWh of duty, read
 *  from the first recorded point (every point records the same utility). */
function enginePrice(id: SystemId): number {
  return designCurve(id)[0]!.reboilerUtility.EUR_per_kWh;
}

const DEFAULT_CHARGE = Number(capitalRecovery(0.10, 15).toFixed(2));

// ---- small layout helpers -----------------------------------------------------------

const GRID = "var(--mantine-color-default-border)";

function Panel({ n, title, origin, originNote, children }: {
  n: number; title: string; origin: OriginKind | readonly OriginKind[];
  originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" data-column-design-card={n}
      style={{ border: `1px solid ${GRID}`, borderRadius: 6 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">card {n}</Text>
      <Title order={4} mb={4}>{title}</Title>
      <Box mb={8}><OriginMark of={origin} note={originNote} /></Box>
      <Stack gap={10}>{children}</Stack>
    </Box>
  );
}

function Chip({ children, color = "cyan", filled = false }: {
  children: ReactNode; color?: string; filled?: boolean;
}): JSX.Element {
  return (
    <Badge variant={filled ? "filled" : "light"} color={color} size="lg"
      styles={{ root: { textTransform: "none", height: "auto", paddingBlock: 4,
        whiteSpace: "normal" } }}>
      {children}
    </Badge>
  );
}

function Wide({ children }: { children: ReactNode }): JSX.Element {
  return <Box style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</Box>;
}

const f = (v: number, d = 3): string => v.toFixed(d);

// ---- the charts (plotly is deferred: it touches `self` at module load) --------------

interface ChartSpec { title: string; x: string; y: string; traces: object[]; shapes?: object[];
  annotations?: object[]; xRange?: [number, number]; yRange?: [number, number]; yType?: "log" | "linear" }

const Chart = lazy(async () => {
  const { Plot, PLOT_CONFIG, darkLayout } = await import("../plotting/plotly.js");
  type PlotData = ComponentProps<typeof Plot>["data"];
  function ChartInner({ spec }: { spec: ChartSpec }) {
    return (
      <Plot
        data={spec.traces as PlotData}
        layout={{
          ...darkLayout,
          margin: { ...darkLayout.margin, t: 44, l: 64 },
          title: { text: spec.title, font: { ...darkLayout.font, size: 13 } },
          xaxis: { ...darkLayout.xaxis, title: { text: spec.x },
            ...(spec.xRange ? { range: spec.xRange } : {}) },
          yaxis: { ...darkLayout.yaxis, title: { text: spec.y },
            ...(spec.yRange ? { range: spec.yRange } : {}),
            ...(spec.yType ? { type: spec.yType } : {}) },
          legend: { ...darkLayout.legend, orientation: "h" as const, x: 0, y: -0.28,
            xanchor: "left" as const },
          shapes: spec.shapes ?? [], annotations: spec.annotations ?? [],
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    );
  }
  return { default: ChartInner };
});

const COL = {
  rig: "#26c6da", fug: "#ffb74d", warm: "#ff8a65", warm2: "#ff8a65", good: "#a5d6a7", cap: "#ce93d8",
};

function ChartBox({ spec }: { spec: ChartSpec }): JSX.Element {
  return (
    <Box style={{ height: 400, minWidth: 0 }} data-column-design-chart="">
      <Suspense fallback={<Group gap={8} p="md"><Loader size="sm" />
        <Text size="sm" c="dimmed">loading the plot…</Text></Group>}>
        <Chart spec={spec} />
      </Suspense>
    </Box>
  );
}

// ---- builders of each card's chart (no physics: they lay recorded numbers out) --------

function txySpec(id: SystemId, xD: number): ChartSpec {
  const t = systemRecord(id).txy;
  const feed = FEED[id];
  const traces: object[] = [];
  if (t) {
    traces.push({ type: "scatter", mode: "lines", name: "boiling (bubble) curve, T against x",
      x: t.xBubble, y: t.Tbubble, line: { color: COL.rig, width: 2.5 } });
    traces.push({ type: "scatter", mode: "lines", name: "condensing (dew) curve, T against y",
      x: t.yDew, y: t.Tdew, line: { color: COL.fug, width: 2.5 } });
  }
  const all = t ? [...t.Tbubble, ...t.Tdew] : [350, 380];
  const lo = Math.min(...all) - 1, hi = Math.max(...all) + 1;
  const shapes: object[] = [
    { type: "line", x0: feed.z, x1: feed.z, y0: lo, y1: hi, line: { color: "#9e9e9e", width: 1.5, dash: "dot" } },
    { type: "line", x0: xD, x1: xD, y0: lo, y1: hi,
      line: { color: distillateReachable(id, xD) ? COL.good : COL.warm, width: 2.5, dash: "dash" } },
  ];
  const annotations: object[] = [
    { x: feed.z, y: hi, text: "feed", showarrow: false, yanchor: "bottom" },
    { x: xD, y: lo, text: "asked", showarrow: false, yanchor: "top" },
  ];
  const az = t?.azeotropeX ?? null;
  if (az !== null) {
    shapes.push({ type: "line", x0: az, x1: az, y0: lo, y1: hi, line: { color: COL.warm2, width: 1.5 } });
    annotations.push({ x: az, y: hi, text: "azeotrope", showarrow: false, yanchor: "bottom",
      xanchor: "right" });
  }
  return { title: `${feed.label}: T-x-y at 1 atm`,
    x: `light-key (${feed.lk}) mole fraction`, y: "temperature [K], 1 atm",
    traces, shapes, annotations, xRange: [0, 1], yRange: [lo, hi] };
}

function curveSpec(id: SystemId): ChartSpec {
  const pts = designCurve(id);
  const s = systemRecord(id);
  const last = pts[pts.length - 1]!;
  const traces: object[] = [
    { type: "scatter", mode: "lines+markers", name: "rigorous column on specification, one designSpec per N",
      x: pts.map((p) => p.N), y: pts.map((p) => p.R),
      line: { color: COL.rig, width: 2.5 }, marker: { color: COL.rig, size: 7 },
      hovertemplate: "N = %{x}<br>R = %{y:.4f}<extra></extra>" },
  ];
  const shapes: object[] = [
    { type: "line", x0: pts[0]!.N, x1: last.N + 2, y0: last.R, y1: last.R,
      line: { color: COL.warm, width: 1.5, dash: "dash" } },
  ];
  if (s.nMin !== null) shapes.push({ type: "line", x0: s.nMin, x1: s.nMin, y0: 0, y1: pts[0]!.R * 1.1,
    line: { color: COL.warm2, width: 1.5, dash: "dash" } });
  return { title: "Reflux against stages, fixed specification",
    x: "N (equilibrium stages)", y: "R (reflux ratio)", traces, shapes,
    yRange: [0, pts[0]!.R * 1.1] };
}

function costSpec(id: SystemId, price: number, charge: number): ChartSpec {
  const pts = designCurve(id);
  const rows = pts.map((p) => annualCost(p, { energyPrice: price, capitalCharge: charge }));
  const opt = costOptimum(id, { energyPrice: price, capitalCharge: charge })!;
  const k = 1 / 1000;
  const traces: object[] = [
    { type: "scatter", mode: "lines+markers", name: "capital charge", x: rows.map((r) => r.N),
      y: rows.map((r) => r.capital * k), line: { color: COL.cap, width: 2 }, marker: { size: 5, color: COL.cap } },
    { type: "scatter", mode: "lines+markers", name: "heat and cooling water", x: rows.map((r) => r.N),
      y: rows.map((r) => (r.energy + r.cooling) * k), line: { color: COL.fug, width: 2 },
      marker: { size: 5, color: COL.fug } },
    { type: "scatter", mode: "lines+markers", name: "annual cost", x: rows.map((r) => r.N),
      y: rows.map((r) => r.total * k), line: { color: COL.rig, width: 3 }, marker: { size: 6, color: COL.rig } },
    { type: "scatter", mode: "markers", name: "cheapest recorded N", x: [opt.N], y: [opt.total * k],
      marker: { size: 15, symbol: "star", color: COL.good } },
  ];
  const ys = rows.flatMap((r) => [r.capital, r.energy + r.cooling, r.total]).map((v) => v * k);
  return { title: "Annual cost along the design curve", x: "N (equilibrium stages)",
    y: "thousand EUR per year", traces,
    yRange: [0, Math.min(Math.max(...ys), 3 * opt.total * k) * 1.05] };
}

function shortcutSpec(id: SystemId): ChartSpec {
  const pts = designCurve(id);
  const sc = systemRecord(id).shortcut;
  const rmax = Math.max(...pts.map((p) => p.R), ...sc.curve.map((c) => c.R));
  const nmax = Math.max(...pts.map((p) => p.N), ...sc.curve.map((c) => c.N));
  const traces: object[] = [
    { type: "scatter", mode: "lines+markers", name: "rigorous column on specification",
      x: pts.map((p) => p.R), y: pts.map((p) => p.N), line: { color: COL.rig, width: 2.5 },
      marker: { color: COL.rig, size: 7 } },
    { type: "scatter", mode: "lines+markers", name: "shortcut: Gilliland N(R), same products",
      x: sc.curve.map((c) => c.R), y: sc.curve.map((c) => c.N), line: { color: COL.fug, width: 2.5 },
      marker: { color: COL.fug, size: 6 } },
  ];
  const shapes: object[] = [
    { type: "line", x0: sc.Rmin, x1: sc.Rmin, y0: 0, y1: nmax, line: { color: COL.fug, width: 1.5, dash: "dash" } },
    { type: "line", x0: 0, x1: rmax, y0: sc.Nmin, y1: sc.Nmin, line: { color: COL.fug, width: 1.5, dash: "dot" } },
  ];
  const cap = Math.min(rmax, sc.Rmin * 6);
  return { title: "Stages against reflux: rigorous and shortcut",
    x: "R (reflux ratio)", y: "N (equilibrium stages)", traces, shapes,
    xRange: [0, cap], yRange: [0, Math.min(nmax, 60) * 1.05] };
}

// ---- the tool -------------------------------------------------------------------------

export function ColumnDesignTool(): JSX.Element {
  const [id, setId] = useState<SystemId>("ew");
  const [xD, setXD] = useState(0.85);
  const [price, setPrice] = useState(() => Number(enginePrice("ew").toFixed(3)));
  const [charge, setCharge] = useState(DEFAULT_CHARGE);

  const rec = systemRecord(id);
  const feed = FEED[id];
  const pts = useMemo(() => designCurve(id), [id]);
  const knobs = { energyPrice: price, capitalCharge: charge };
  const opt = useMemo(() => costOptimum(id, knobs), [id, price, charge]);   // eslint-disable-line react-hooks/exhaustive-deps
  const gap = limitGap(id);
  const lessonStep = lessonStepper(COLUMN_DESIGN_STEPS);
  const xBlk = rec.spec.xB;      // the HEAVY key's purity in the bottoms, as specified
  const xBLight = 1 - rec.spec.xB;   // two components: the light key's share of the bottoms
  const reachable = distillateReachable(id, xD);
  const dF = leverD(feed.z, xD, xBLight);
  const az = rec.txy?.azeotropeX ?? null;
  const nBig = pts[pts.length - 1]!;
  const optHere = opt!;
  const optAtEngine = costOptimum(id, { energyPrice: enginePrice(id), capitalCharge: DEFAULT_CHARGE })!;
  const optPt = pts.find((p) => p.N === optHere.N)!;

  const setMixture = (v: SystemId): void => {
    setId(v);
    setPrice(Number(enginePrice(v).toFixed(3)));
    setXD(v === "ew" ? 0.85 : 0.95);
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        <Box>
          <Title order={3}>Designing a column for a real mixture</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Four questions in the order a design meets them: can it be done, how many stages
            against how much reflux, what is the cheapest of those, and how far to trust the
            shortcut that gave the first guess. The ideal mixture stays beside the real one as the
            control.
          </Text>
        </Box>

        <Group gap={10} align="center" wrap="wrap">
          <Text size="sm" fw={600}>Mixture</Text>
          <SegmentedControl size="xs" value={id} onChange={(v) => setMixture(v as SystemId)}
            data={[{ label: "ethanol / water (real)", value: "ew" },
              { label: "benzene / toluene (ideal control)", value: "bt" }]} />
        </Group>

        {/* ---------------- card 1 ---------------- */}
        <Panel n={1} title="Feasibility: what can a simple column make from this feed?"
          origin={["engine", "page"]}
          originNote="the engine's boiling and condensing temperatures of the mixture (a recorded scan); the lever rule is this page's arithmetic">
          {lessonStep(1)}
          <Box style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <Stack gap={8}><KnobSlider knob={XD_KNOB} value={xD} onChange={setXD} showWhy /></Stack>
            <Stack gap={8}>
              <Group gap={8} wrap="wrap">
                <Chip color={reachable ? "teal" : "red"} filled>
                  {reachable ? "reachable by a simple column" : "beyond the azeotrope: no column makes it"}
                </Chip>
                {az !== null
                  ? <Chip color="orange">azeotrope at x = {f(az, 3)} (read on the engine&apos;s scan)</Chip>
                  : <Chip color="gray">no azeotrope on the engine&apos;s scan</Chip>}
                {reachable && Number.isFinite(dF) && dF > 0 && dF < 1 && (
                  <Chip>lever rule: D/F = {f(dF, 3)}, bottoms at x = {f(xBLight, 2)}</Chip>)}
              </Group>
            </Stack>
          </Box>
          <ChartBox spec={txySpec(id, xD)} />
        </Panel>

        {/* ---------------- card 2 ---------------- */}
        <Panel n={2} title="The design curve: reflux against stages, at a fixed specification"
          origin={["engine", "reference"]}
          originNote="a RECORDED run of the engine's rigorous simultaneous column, one designSpec per stage count">
          {lessonStep(2)}
          <Group gap={8} wrap="wrap">
            <Chip filled color="teal">
              specification, held at every point: x_D = {f(rec.spec.xD, 2)} (light key), the heavy
              key at {f(xBlk, 2)} in the bottoms
            </Chip>
            <Chip color="orange">N_min: {rec.nMin ?? "n/a"} stages (smallest N with a reflux up to {RECORD.R_MAX})</Chip>
            <Chip color="orange">R at N = {nBig.N}: {f(nBig.R, 3)} (an upper bound of R_min)</Chip>
          </Group>
          <ChartBox spec={curveSpec(id)} />
          <Wide>
            <Table withTableBorder withColumnBorders fz="xs" data-column-design-table="curve">
              <Table.Thead><Table.Tr>
                <Table.Th>N</Table.Th><Table.Th>feed stage</Table.Th><Table.Th>R</Table.Th>
                <Table.Th>D [kmol/h]</Table.Th><Table.Th>x_D (light key) reached</Table.Th>
                <Table.Th>x_B (heavy key) reached</Table.Th><Table.Th>Q_reb [kW]</Table.Th>
                <Table.Th>diameter [m]</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {pts.map((p) => (
                  <Table.Tr key={p.N}>
                    <Table.Td>{p.N}</Table.Td><Table.Td>{p.feedStage}</Table.Td>
                    <Table.Td>{f(p.R, 4)}</Table.Td><Table.Td>{f(p.D_kmolh, 2)}</Table.Td>
                    <Table.Td>{f(p.xD, 4)}</Table.Td><Table.Td>{f(p.xB, 4)}</Table.Td>
                    <Table.Td>{f(p.Qreb_kW, 0)}</Table.Td><Table.Td>{f(p.diameter_m, 3)}</Table.Td>
                  </Table.Tr>))}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            Recorded run: <code>bin/curate/c501_column_design_table.py</code> edits{" "}
            <code>nStages</code> and the targets in copies of{" "}
            <code>tutorials/steady/distillation/column21_design_curve_ethanol_water</code> and runs{" "}
            <code>choupoSolve</code> on each; that case reproduces any row (change <code>nStages</code>{" "}
            and <code>feedStage</code>). The feed enters at {f(rec.feedFraction, 2)} of the column.
          </Text>
        </Panel>

        {/* ---------------- card 3 ---------------- */}
        <Panel n={3} title="The cost optimum: stages cost capital, reflux costs energy"
          origin={["engine", "page", "assumption"]}
          originNote="capital, duties and utility prices are the engine's (recorded); the sum, the capital charge, the heat price and the hours are this page's">
          {lessonStep(3)}
          <Box style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <Stack gap={8}>
              <KnobSlider knob={PRICE_KNOB} value={price} onChange={setPrice} showWhy />
              <KnobSlider knob={CHARGE_KNOB} value={charge} onChange={setCharge} showWhy />
            </Stack>
            <Stack gap={8}>
              <Group gap={8} wrap="wrap">
                <Chip filled color="teal">
                  cheapest recorded N = {optHere.N} (R = {f(optHere.R, 3)}, {f(optHere.total / 1000, 0)} thousand EUR/yr)
                </Chip>
                <Chip color="gray">
                  at the engine&apos;s steam price and the default charge: N = {optAtEngine.N}
                </Chip>
                <Chip color="gray">operating hours fixed at {HOURS_PER_YEAR} h/yr</Chip>
              </Group>
              <Text size="xs" c="dimmed">
                Installed cost at that point (engine, Turton total module): shell {f(optPt.capex_EUR.shell / 1000, 0)},
                trays {f(optPt.capex_EUR.trays / 1000, 0)}, condenser {f(optPt.capex_EUR.condenser / 1000, 0)},
                reboiler {f(optPt.capex_EUR.reboiler / 1000, 0)}, reflux drum {f(optPt.capex_EUR.refluxDrum / 1000, 0)}
                thousand EUR; tower diameter {f(optPt.diameter_m, 2)} m.
              </Text>
            </Stack>
          </Box>
          <ChartBox spec={costSpec(id, price, charge)} />
        </Panel>

        {/* ---------------- card 4 ---------------- */}
        <Panel n={4} title="The shortcut as a control: where it agrees and where it parts"
          origin={["engine", "page"]}
          originNote="Fenske-Underwood-Gilliland solved by the engine's shortcut column on the same mixture and the same products; the ratios are this page's">
          {lessonStep(4)}
          <ChartBox spec={shortcutSpec(id)} />
          <Wide>
            <Table withTableBorder withColumnBorders fz="xs" data-column-design-table="control">
              <Table.Thead><Table.Tr>
                <Table.Th>mixture</Table.Th><Table.Th>R_min shortcut</Table.Th>
                <Table.Th>rigorous R at N = {RECORD.N_BIG}</Table.Th><Table.Th>ratio</Table.Th>
                <Table.Th>N_min Fenske</Table.Th><Table.Th>N_min rigorous</Table.Th><Table.Th>ratio</Table.Th>
                <Table.Th>alpha frozen</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {(["bt", "ew"] as SystemId[]).map((s) => {
                  const g = limitGap(s);
                  return g ? (
                    <Table.Tr key={s}>
                      <Table.Td>{FEED[s].label}</Table.Td>
                      <Table.Td>{f(g.fugRmin, 3)}</Table.Td><Table.Td>{f(g.rigorousRmin, 3)}</Table.Td>
                      <Table.Td fw={700}>{f(g.rRatio, 2)}</Table.Td>
                      <Table.Td>{f(g.fugNmin, 2)}</Table.Td><Table.Td>{g.rigorousNmin}</Table.Td>
                      <Table.Td fw={700}>{f(g.nRatio, 2)}</Table.Td>
                      <Table.Td>{f(systemRecord(s).shortcut.alpha, 2)}</Table.Td>
                    </Table.Tr>) : null;
                })}
              </Table.Tbody>
            </Table>
          </Wide>
          {gap && (
            <Group gap={8} wrap="wrap">
              <Chip filled color={gap.rRatio < 1.5 ? "teal" : "red"}>
                {FEED[id].label}: the rigorous column needs {f(gap.rRatio, 2)} times the shortcut&apos;s
                minimum reflux and {f(gap.nRatio, 2)} times its minimum stages
              </Chip>
            </Group>
          )}
          {id === "ew" && (
            <>
              <Text size="sm" fw={600}>Approaching the azeotrope (heavy key held at 0.99 in the bottoms)</Text>
              <Wide>
                <Table withTableBorder withColumnBorders fz="xs" data-column-design-table="specs">
                  <Table.Thead><Table.Tr>
                    <Table.Th>x_D asked</Table.Th><Table.Th>R_min shortcut</Table.Th>
                    <Table.Th>rigorous R at the largest N reached</Table.Th><Table.Th>that N</Table.Th><Table.Th>ratio</Table.Th>
                    <Table.Th>N_min Fenske</Table.Th><Table.Th>N_min rigorous</Table.Th>
                    <Table.Th>alpha frozen</Table.Th>
                  </Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {RECORD.specs.rows.filter((r) => r.rigorousR_atNbig !== null).map((r) => (
                      <Table.Tr key={r.xD}>
                        <Table.Td>{f(r.xD, 2)}</Table.Td>
                        <Table.Td>{r.fugRmin === null ? "n/a" : f(r.fugRmin, 3)}</Table.Td>
                        <Table.Td>{r.rigorousR_atNbig === null ? "n/a" : f(r.rigorousR_atNbig, 3)}</Table.Td>
                        <Table.Td>{r.Nbig ?? "n/a"}</Table.Td>
                        <Table.Td fw={700}>{r.fugRmin && r.rigorousR_atNbig ? f(r.rigorousR_atNbig / r.fugRmin, 2) : "n/a"}</Table.Td>
                        <Table.Td>{r.fugNmin === null ? "n/a" : f(r.fugNmin, 2)}</Table.Td>
                        <Table.Td>{r.rigorousNmin ?? "n/a"}</Table.Td>
                        <Table.Td>{r.fugAlpha === null ? "n/a" : f(r.fugAlpha, 2)}</Table.Td>
                      </Table.Tr>))}
                  </Table.Tbody>
                </Table>
              </Wide>
            </>
          )}
          <Alert color="yellow" variant="light" title="What the shortcut does not see">
            <Text size="xs">
              It freezes one relative volatility at the feed&apos;s bubble point, so an azeotrope, where
              the volatility falls to one, is not representable. The ratios above are the price of that
              assumption on this mixture; the ideal control shows the method itself is sound where the
              assumption holds. The rigorous minimum reflux for a non-ideal column (the pinch in the
              rectifying section, the boundary value method past an azeotrope) is the next step for the
              engine, so the rigorous floor here is the recorded curve&apos;s own.
            </Text>
          </Alert>
        </Panel>

        <LessonLimits limits={COLUMN_DESIGN_LIMITS} title="What this does not show" />

        <LessonQuiz title="Check your understanding" questions={COLUMN_DESIGN_QUIZ}
          lesson={COLUMN_DESIGN_STEPS} />

        <LessonReferences tool="column-design" />
      </Stack>
    </Box>
  );
}
