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
  ControlValveTool -- "Why does a correctly sized valve still control badly?"
  (C509).  A scrolling lesson, seven cards; the lesson is DATA
  (controlValveLesson.ts), the arithmetic is controlValveMath.ts's, the
  drawings controlValveDrawings.tsx's.

  WHAT IS THE ENGINE'S.  Card 1 runs the engine's pump and pipe
  (pumpSystem01_operating_point, swept over the flow, choupoSolve in the
  browser) and READS the pump's rise and the line's drop; the valve's
  authority comes from them, never from a typed number.  Card 6 reads the
  water's vapour pressure from a choupoProps run (purelaws02, its first
  temperature moved to the knob's).  What is the PAGE's, and marked so: the
  three inherent characteristics (conventions), the installed-flow relation,
  the gain, the turndown, and the choking arithmetic, which is letdown.ts's.
  Card 7 is AUTHORED text, marked as not computed.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Anchor, Badge, Box, Button, Group, Loader, SegmentedControl, Stack, Table,
  Text, Title } from "@mantine/core";

import { useCaseFilesRun, useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import {
  CV_LINE_WITNESS, CV_PROPS_WITNESS, CV_WATER_T_MAX, CV_WATER_T_MIN, CV_SHAPES,
  R_DEFAULT, SHAPE_LABEL, X_MIN_DEFAULT, deviationOpening,
  gainRange, inherent, installedFlow, installedTurndown, loopGain, maxFlowOfCapacity,
  minControllableFlow, openingForFlow, quadraticityRatio, readLine, readPsatWater, sizeValve,
  splitAt, waterCase, type Shape,
} from "./controlValveMath.js";
import {
  CurveChart, HUE_A, HUE_B, HUE_C, SeriesLoopDrawing, type CurveSeries,
} from "./controlValveDrawings.js";
import { CV_LIMITS, CV_QUIZ, CV_STEPS, FAIL_SERVICES, type FailAction } from "./controlValveLesson.js";
import { cavitationIndex, chokedLiquidDrop, FL_DEFAULT, liquidRegime, recordScalar } from "./letdown.js";
import { DEFAULT_PUMP_KNOBS, findPumpSystemSweep, pumpSystemOverrides } from "./PumpSystemTool.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(CV_STEPS);

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
} as const;
const BORDER = "1px solid var(--mantine-color-default-border)";

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
const bar = (pa: number | undefined, d = 2): string =>
  typeof pa === "number" && Number.isFinite(pa) ? (pa / 1e5).toFixed(d) : "—";

function Figure({ children, caption }: { children: React.ReactNode; caption: React.ReactNode }): JSX.Element {
  return (
    <Box component="figure" m={0} mt={8} mb={8} style={{ minWidth: 0 }}>
      {children}
      <Text component="figcaption" size="xs" c="dimmed" mt={4}
        style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.35 }}>
        {caption}
      </Text>
    </Box>
  );
}

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

function Waiting({ runs, what }: { runs: MethodRunState[]; what: string }): JSX.Element | null {
  const err = runs.find((r) => r.err !== null)?.err ?? null;
  if (err !== null) {
    return (
      <Alert color="red" variant="light" title="The engine reported an error: its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{err}</Text>
      </Alert>
    );
  }
  if (runs.some((r) => r.busy || r.result === null)) {
    return (
      <Group gap="sm" wrap="nowrap" align="center" data-cv-waiting="">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">{what}</Text>
      </Group>
    );
  }
  return null;
}

function ShapePicker({ value, onChange }: { value: Shape; onChange: (s: Shape) => void }): JSX.Element {
  return (
    <SegmentedControl size="xs" fullWidth value={value} onChange={(v) => onChange(v as Shape)}
      data={CV_SHAPES.map((s) => ({ value: s, label: SHAPE_LABEL[s] }))} aria-label="inherent characteristic" />
  );
}

const grid = (n: number, x0 = 0, x1 = 1): number[] =>
  Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);

const SHAPE_STYLE: Record<Shape, { color: string; dash?: string; labelX: number; dy: number }> = {
  linear: { color: HUE_A, labelX: 0.55, dy: 16 },
  equalPercentage: { color: HUE_B, dash: "7 4", labelX: 0.6, dy: -14 },
  quickOpening: { color: HUE_C, dash: "2 3", labelX: 0.2, dy: -8 },
};

export function ControlValveTool(): JSX.Element {
  // ---- state ----------------------------------------------------------------
  const [W, setW] = useState(DEFAULT_PUMP_KNOBS.W_shaft);
  const [ratedKmolH, setRated] = useState(2880);   // 0.8 kmol/s: a sweep point
  const [minKmolH, setMin] = useState(1440);       // 0.4 kmol/s: the sweep's lowest
  const [opening, setOpening] = useState(0.6);
  const [R, setR] = useState(R_DEFAULT);
  const [shape, setShape] = useState<Shape>("linear");
  const [aOverride, setAOverride] = useState<number | null>(null);
  const [xMin, setXMin] = useState(X_MIN_DEFAULT);
  const [startScale, setStartScale] = useState(0.6);
  const [gmLow, setGmLow] = useState(3);
  const [FL, setFL] = useState(FL_DEFAULT);
  const [Tw, setTw] = useState(300);
  const [service, setService] = useState(FAIL_SERVICES[0]!.id);
  const [action, setAction] = useState<FailAction>("closed");
  const [qLoadOverride, setQLoadOverride] = useState<number | null>(null);

  // ---- the engine runs ------------------------------------------------------
  const knobs = useMemo(() => ({ ...DEFAULT_PUMP_KNOBS, W_shaft: W }), [W]);
  const lineRun = useMethodRun(CV_LINE_WITNESS, pumpSystemOverrides(knobs),
    JSON.stringify(knobs), "choupoSolve");
  const propsRun = useCaseFilesRun(() => waterCase(Tw), String(Tw), "choupoProps");
  const sweep = useMemo(() => findPumpSystemSweep(lineRun.result?.csvFiles), [lineRun.result]);
  const Psat = readPsatWater(propsRun.result);
  const Pc = (recordScalar(tutorialByName(CV_PROPS_WITNESS)?.files.rawFiles, "water", "Pc") ?? NaN) * 1e5;

  const rated = useMemo(() => readLine(sweep, ratedKmolH / 3600), [sweep, ratedKmolH]);
  const low = useMemo(() => readLine(sweep, minKmolH / 3600), [sweep, minKmolH]);
  const sizing = useMemo(() => sizeValve(rated), [rated]);
  const aEngine = sizing?.a ?? null;
  const a = aOverride ?? aEngine ?? 0.5;
  const qLow = rated && low ? low.F / rated.F : 0.5;

  const aStatus = aOverride !== null
    ? `your a = ${fx(aOverride, 2)} (the line of card 1 gives ${fx(aEngine, 2)})`
    : aEngine !== null ? `a = ${fx(aEngine, 2)}, from the engine's line of card 1`
    : "a = 0.50, a placeholder until the engine has run";

  const aControl = (
    <Box mt={8} style={KNOB_GRID}>
      <KnobSlider knob={{ id: "a", label: "authority a", min: 0.05, max: 1, step: 0.01 }}
        value={Math.round(a * 100) / 100} onChange={(v) => setAOverride(v)} />
      <Stack gap={4} justify="flex-end">
        <Text size="xs" c="dimmed" data-cv-a-status="">{aStatus}</Text>
        <Button size="xs" variant="light" disabled={aOverride === null || aEngine === null}
          onClick={() => setAOverride(null)}>use the engine's a again</Button>
      </Stack>
    </Box>
  );

  // ---- card 1 ----------------------------------------------------------------
  const lin = installedFlow(opening, a);
  const split = sizing ? splitAt(sizing.Pt, a, lin) : null;
  const card1 = (
    <Box data-cv-card="series">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the pump's rise and the line's drop are the engine's (pumpSystem01 swept over the flow, run in this browser); the valve is the page's linear toy, moved by the opening you set" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "W", label: "pump shaft power", unit: "kW", min: 1, max: 20, step: 0.5 }}
          value={W} onChange={setW} />
        <KnobSlider knob={{ id: "rated", label: "rated flow (valve wide open)", unit: "kmol/h", min: 1800, max: 5400, step: 360 }}
          value={ratedKmolH} onChange={setRated} />
        <KnobSlider knob={{ id: "min", label: "minimum flow", unit: "kmol/h", min: 1440, max: 3600, step: 360 }}
          value={minKmolH} onChange={setMin} />
        <KnobSlider knob={{ id: "x", label: "valve opening x", min: 0.05, max: 1, step: 0.01 }}
          value={opening} onChange={setOpening} />
      </Box>
      <Box mt={8}><Waiting runs={[lineRun]} what="the engine is running the pump and the line over the flow" /></Box>
      {rated && sizing === null && (
        <Alert color="orange" variant="light" mt={8} data-cv-unsizable="">
          At {fx(rated.F * 3600, 0)} kmol/h the line alone already takes all that the pump gives
          ({bar(rated.systemDP)} bar against a rise of {bar(rated.pumpDP)} bar), so no valve
          can be sized for it. Lower the rated flow or raise the pump's power.
        </Alert>
      )}
      {rated && sizing && split && (
        <Figure caption={<>The pump's rise at the rated flow, stacked as three bars: the static
          elevation (green) is the engine's, the line (orange) and the valve (blue) share the rest.
          At the rated flow with the valve wide open, the valve takes {bar(sizing.dpValveOpen)} bar
          of the {bar(sizing.Pt)} bar the two share: its authority is {fx(sizing.a, 2)}. Move
          the opening and the line takes more as the flow grows, and the valve less: you are
          at {fx(lin * 100, 0)} % of the rated flow, the valve holding {bar(split.valve)} bar.</>}>
          <SeriesLoopDrawing elevation={rated.elevation} line={split.line} valve={split.valve}
            opening={opening} />
        </Figure>
      )}
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>from the engine</Table.Th><Table.Th>at the rated flow</Table.Th><Table.Th>at the minimum flow</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>flow [kmol/h]</Table.Td><Table.Td>{fx(rated ? rated.F * 3600 : undefined, 0)}</Table.Td><Table.Td>{fx(low ? low.F * 3600 : undefined, 0)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>pump's pressure rise [bar]</Table.Td><Table.Td>{bar(rated?.pumpDP)}</Table.Td><Table.Td>{bar(low?.pumpDP)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>line: friction and fittings [bar]</Table.Td><Table.Td>{bar(rated?.lineLoss, 3)}</Table.Td><Table.Td>{bar(low?.lineLoss, 3)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>static elevation [bar]</Table.Td><Table.Td>{bar(rated?.elevation, 3)}</Table.Td><Table.Td>{bar(low?.elevation, 3)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>left for the valve, wide open [bar]</Table.Td><Table.Td>{rated ? bar(rated.pumpDP - rated.systemDP) : "—"}</Table.Td><Table.Td>{low ? bar(low.pumpDP - low.systemDP) : "—"}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Text size="xs" mt={6} data-cv-quadratic="">
        The line's loss against the square of the flow, minimum over rated:{" "}
        {rated && low && rated.F !== low.F ? fx(quadraticityRatio(rated, low), 3) : "—"} (1 would be
        exactly quadratic: the friction factor drifts with the Reynolds number). The pump's rise at the
        minimum flow is {rated && low ? fx(low.pumpDP / rated.pumpDP, 2) : "—"} times its rise at the
        rated one: the engine's pump has constant power, so its rise climbs as the flow falls, while the
        valve of this page is given the rated flow's pressure and holds it constant.
      </Text>
      <PanelNote>
        Runs tutorials/{CV_LINE_WITNESS} (choupoSolve WASM, a 13-point sweep of the feed flow) with the
        pump's shaft power you set. The valve is sized by difference at the rated flow: the pump's rise
        there, less the line and its elevation, is what the valve takes wide open.
      </PanelNote>
    </Box>
  );

  // ---- card 2 ----------------------------------------------------------------
  const xs = grid(100);
  const inherentSeries: CurveSeries[] = CV_SHAPES.map((s) => ({
    name: SHAPE_LABEL[s], pts: xs.map((x) => [x, inherent(s, x, R)] as [number, number]),
    color: SHAPE_STYLE[s].color, dash: SHAPE_STYLE[s].dash, labelX: SHAPE_STYLE[s].labelX,
    labelDy: SHAPE_STYLE[s].dy,
  }));
  const card2 = (
    <Box data-cv-card="inherent">
      <OriginMark of={["page", "assumption"]}
        note="three conventions drawn by this page; the rangeability is yours" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "R", label: "rangeability R of the equal-percentage trim", min: 10, max: 200, step: 5 }}
          value={R} onChange={setR} />
      </Box>
      <Figure caption={<>The flow coefficient relative to its value wide open, against the opening,
        for the three conventional shapes, each as a maker states it for a constant pressure drop
        across the valve. With R = {R} the equal-percentage trim passes {fx(inherent("equalPercentage", 0, R) * 100, 1)} %
        of the full coefficient at zero opening and rises exponentially; the linear one is a straight
        line; the quick-opening one has given 70 % of its capacity by half travel.</>}>
        <CurveChart series={inherentSeries} xMax={1} yMax={1.05} xLabel="opening x"
          yLabel="f = Cv / Cv,max" xTicks={[0, 0.25, 0.5, 0.75, 1]} yTicks={[0, 0.5, 1]}
          aria={`Three inherent characteristics against the opening, with R = ${R}.`} />
      </Figure>
    </Box>
  );

  // ---- card 3 ----------------------------------------------------------------
  const inst = (s: Shape): CurveSeries => ({
    name: `${SHAPE_LABEL[s]}, installed`,
    pts: xs.map((x) => [x, installedFlow(inherent(s, x, R), a)] as [number, number]),
    color: SHAPE_STYLE[s].color, width: 2.8, labelX: 0.14, labelDy: -26,
  });
  const promise = (s: Shape): CurveSeries => ({
    name: "inherent promise",
    pts: xs.map((x) => [x, inherent(s, x, R)] as [number, number]),
    color: "var(--mantine-color-dimmed)", dash: "4 4", width: 1.6, labelX: 0.72, labelDy: 24,
  });
  const xDev = deviationOpening(shape, a, R);
  const card3 = (
    <Box data-cv-card="installed">
      <OriginMark of={["page", "engine", "assumption"]}
        note="the installed-flow relation is this page's; a is the engine's line of card 1 unless you override it" />
      <Box mt={8}><ShapePicker value={shape} onChange={setShape} /></Box>
      {aControl}
      <Figure caption={<>The valve in its line: the installed flow (solid) against what the inherent
        curve promised (dashed), for the {SHAPE_LABEL[shape]} trim at {aStatus}. At q = 1 both meet;
        below it the line takes less and the valve more, so the installed flow rises above the promise.
        {xDev === null
          ? " At this authority the installed flow stays within a tenth of the promise at every opening."
          : <> Below the opening x = {fx(xDev, 2)} (the dotted line) it is more than a tenth above the promise.</>}</>}>
        <CurveChart series={[promise(shape), inst(shape)]} xMax={1} yMax={1.05} xLabel="opening x"
          yLabel="q = Q / Q at wide open" xTicks={[0, 0.25, 0.5, 0.75, 1]} yTicks={[0, 0.5, 1]}
          marks={xDev !== null && xDev > 0 ? [{ x: xDev, label: "+10 %", color: "var(--mantine-color-dimmed)" }] : []}
          aria={`Installed flow against the opening for the ${SHAPE_LABEL[shape]} trim at authority ${fx(a, 2)}, over the inherent curve.`} />
      </Figure>
      <Text size="xs" data-cv-q-half="">
        At half travel the installed flow is {fx(installedFlow(inherent(shape, 0.5, R), a), 3)} of the
        wide-open flow; the valve alone promised {fx(inherent(shape, 0.5, R), 3)}.
      </Text>
    </Box>
  );

  // ---- card 4 ----------------------------------------------------------------
  const gains = CV_SHAPES.map((s) => ({ s, g: gainRange(s, a, R) }));
  const gainMax = Math.max(...gains.map((e) => e.g.max)) * 1.05;
  const gainSeries: CurveSeries[] = CV_SHAPES.map((s) => ({
    name: SHAPE_LABEL[s],
    pts: grid(90, 0.1, 1).map((x) => [x, loopGain(s, x, a, R)] as [number, number]),
    color: SHAPE_STYLE[s].color, dash: SHAPE_STYLE[s].dash,
    labelX: s === "quickOpening" ? 0.3 : s === "linear" ? 0.78 : 0.88,
    labelDy: s === "linear" ? 14 : -6,
  }));
  const card4 = (
    <Box data-cv-card="gain">
      <OriginMark of={["page", "engine", "assumption"]}
        note="the gain is the analytic slope of the page's installed flow; a is the engine's unless you override it" />
      {aControl}
      <Figure caption={<>The valve's gain, the slope of the installed flow against the opening, for the
        three shapes at {aStatus}, over the working range from x = 0.1 to full travel. For the
        steepest shape the loop gain at its highest-gain opening is {fx(Math.max(...gains.map((e) => e.g.ratio)), 1)} times
        the gain at its lowest.</>}>
        <CurveChart series={gainSeries} xMax={1} yMax={gainMax} xLabel="opening x" yLabel="gain dq/dx"
          xTicks={[0, 0.25, 0.5, 0.75, 1]}
          yTicks={Array.from(new Set([0, Math.round(gainMax / 2 * 10) / 10, Math.round(gainMax * 10) / 10]))}
          aria={`Valve gain against the opening for the three shapes at authority ${fx(a, 2)}.`} />
      </Figure>
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "gm", label: "gain margin of the loop at the opening of lowest gain", min: 1.5, max: 10, step: 0.5 }}
          value={gmLow} onChange={setGmLow} />
      </Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>shape</Table.Th><Table.Th>largest gain</Table.Th><Table.Th>smallest gain</Table.Th><Table.Th>ratio</Table.Th><Table.Th>margin at the highest-gain opening</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {gains.map(({ s, g }) => (
            <Table.Tr key={s} data-cv-gain-row={s}>
              <Table.Td>{SHAPE_LABEL[s]}</Table.Td>
              <Table.Td>{fx(g.max, 2)} at x = {fx(g.xAtMax, 2)}</Table.Td>
              <Table.Td>{fx(g.min, 2)} at x = {fx(g.xAtMin, 2)}</Table.Td>
              <Table.Td>{fx(g.ratio, 1)}</Table.Td>
              <Table.Td>{fx(gmLow / g.ratio, 2)}{gmLow / g.ratio < 1 ? " (below 1: unstable there)" : ""}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="sm" mt={6}>
        Try authority 1, then 0.5, then 0.2 and 0.1. The page ranks nothing: it prints the ratio. What would
        you do with a ratio of {fx(Math.max(...gains.map((e) => e.g.ratio)), 0)}? Take the number to{" "}
        <Anchor component="button" type="button" onClick={() => setActiveMethodTool("bode")}>the Bode page</Anchor>{" "}
        and ask how much gain margin the rest of the loop can spare.
      </Text>
    </Box>
  );

  // ---- card 5 ----------------------------------------------------------------
  const qMinLoad = Math.min(0.9, Math.max(0.02, qLow));
  const qLoad = qLoadOverride ?? qMinLoad;
  const bigOpening = openingForFlow(shape, qLoad, a, R, 1);
  const smallOpening = openingForFlow(shape, qLoad, a, R, startScale);
  const bigTurndown = installedTurndown(shape, a, R, xMin, 1);
  const smallTurndown = installedTurndown(shape, a, R, xMin, startScale);
  const smallMax = maxFlowOfCapacity(a, startScale);
  const card5 = (
    <Box data-cv-card="rangeability">
      <OriginMark of={["page", "engine", "assumption"]}
        note="the arithmetic is this page's; a and the default minimum load come from the engine's line of card 1; the lowest controlling opening and the starting valve's size are yours" />
      <Box mt={8}><ShapePicker value={shape} onChange={setShape} /></Box>
      {aControl}
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "qLoad", label: "minimum load, as a fraction of the rated flow", min: 0.05, max: 0.9, step: 0.01 }}
          value={qLoad} onChange={setQLoadOverride} />
        <KnobSlider knob={{ id: "xmin", label: "lowest opening at which the valve controls (a teaching value)", min: 0.02, max: 0.3, step: 0.01 }}
          value={xMin} onChange={setXMin} />
        <KnobSlider knob={{ id: "s", label: "starting valve's capacity, relative to the big valve", min: 0.1, max: 0.9, step: 0.05 }}
          value={startScale} onChange={setStartScale} />
      </Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th /><Table.Th>one big valve</Table.Th><Table.Th>starting valve alone</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>opening at the minimum load</Table.Td>
            <Table.Td data-cv-open-big="">{bigOpening === null ? "cannot carry it" : `${fx(bigOpening * 100, 0)} %`}{bigOpening !== null && bigOpening < xMin ? " (below the controlling opening)" : ""}</Table.Td>
            <Table.Td data-cv-open-small="">{smallOpening === null ? "cannot carry it (its wide-open flow is " + fx(smallMax * 100, 0) + " % of the rated)" : `${fx(smallOpening * 100, 0)} %`}{smallOpening !== null && smallOpening < xMin ? " (below the controlling opening)" : ""}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>smallest flow that is controlled, % of the rated</Table.Td>
            <Table.Td>{fx(minControllableFlow(shape, a, R, xMin, 1) * 100, 1)}</Table.Td>
            <Table.Td>{fx(minControllableFlow(shape, a, R, xMin, startScale) * 100, 1)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>installed turndown (wide open over smallest controlled)</Table.Td>
            <Table.Td data-cv-turndown-big="">{fx(bigTurndown, 1)}</Table.Td>
            <Table.Td data-cv-turndown-small="">{fx(smallTurndown * smallMax, 1)} on its own range; with the running valve, {fx(smallTurndown, 1)} from its smallest flow to the running valve wide open</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        The starting valve's own turndown is its wide-open flow ({fx(smallMax * 100, 0)} % of the rated)
        over its smallest controlled flow; the pair reach from that smallest flow to the running valve's
        wide-open flow.
      </Text>
      <Box mt={8} px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }} data-cv-advice="">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">two pieces of advice, and one question</Text>
        <Text size="sm" mt={4}>
          You will be told to split the duty between a running valve and a starting valve, and you will
          be told to control the flow in a line only once. They answer different failures: the first a valve
          that cannot hold the minimum load, the second two loops that fight over one flow. For the plant
          you have in mind, which failure is the likelier, and what would show it before start-up?
        </Text>
      </Box>
    </Box>
  );

  // ---- card 6 ----------------------------------------------------------------
  const qs = grid(90, 0.1, 1);
  const P2 = rated?.P_in;
  const chokeReady = sizing !== null && P2 !== undefined && Psat !== undefined && Number.isFinite(Pc);
  const valveDrop = (q: number): number => (sizing ? splitAt(sizing.Pt, a, q).valve : NaN);
  const rows6 = chokeReady && sizing && P2 !== undefined && Psat !== undefined
    ? [qLow, 1].map((q) => {
      const dp = valveDrop(q);
      const P1 = P2 + dp;
      return { q, dp, P1, choke: chokedLiquidDrop(P1, Psat, Pc, FL),
        sigma: cavitationIndex(P1, P2, Psat), regime: liquidRegime(P1, P2, Psat, FL) };
    }) : null;
  const chart6: CurveSeries[] = chokeReady && sizing && P2 !== undefined && Psat !== undefined ? [
    { name: "valve drop", pts: qs.map((q) => [q, valveDrop(q) / 1e5] as [number, number]),
      color: HUE_A, width: 2.8, labelX: 0.28, labelDy: -8 },
    { name: "largest drop before choking", pts: qs.map((q) => [q, chokedLiquidDrop(P2 + valveDrop(q), Psat, Pc, FL) / 1e5] as [number, number]),
      color: HUE_B, dash: "7 4", labelX: 0.62, labelDy: -8 },
  ] : [];
  const yMax6 = chart6.length ? Math.max(...chart6.flatMap((s) => s.pts.map((p) => p[1]))) * 1.08 : 1;
  const card6 = (
    <Box data-cv-card="choke">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the budget and the pressure at the vessel come from the engine's line; the vapour pressure from a choupoProps run at your temperature; the choking and cavitation arithmetic is the letdown page's; the valve's recovery factor is yours" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "Tw", label: "water temperature (only the vapour pressure follows it)", unit: "K", min: CV_WATER_T_MIN, max: CV_WATER_T_MAX, step: 1 }}
          value={Tw} onChange={setTw} />
        <KnobSlider knob={{ id: "FL", label: "\\(F_L\\), the valve's pressure recovery factor", min: 0.5, max: 0.99, step: 0.01 }}
          value={FL} onChange={setFL} />
      </Box>
      <Text size="xs" c="dimmed" mt={4}>
        The pump's power (card 1's first knob, now {fx(W, 1)} kW), the rated flow and the authority set the
        budget the valve shares; raise the power to bring the left of the curve toward its limits.
      </Text>
      <Box mt={8}><Waiting runs={[lineRun, propsRun]} what="the engine is evaluating the line and the water's vapour pressure" /></Box>
      {chart6.length > 0 && (
        <Figure caption={<>The drop across the valve against the relative flow (solid), and the largest drop that still
          raises the flow of a liquid valve with your <i>F</i><sub>L</sub> (dashed). The valve drop is the largest at the
          smallest flow, where the line takes least; the water's vapour pressure at {fx(Tw, 0)} K is
          {" "}{fx(Psat !== undefined ? Psat / 1e3 : undefined, 2)} kPa, from the engine.</>}>
          <CurveChart series={chart6} xMax={1} yMax={yMax6} xLabel="relative flow q"
            yLabel="pressure drop [bar]" xTicks={[0, 0.25, 0.5, 0.75, 1]}
            yTicks={[0, Math.round(yMax6 * 5) / 10, Math.round(yMax6 * 10) / 10]}
            aria="The valve's pressure drop against the relative flow, falling from small to large flow, with the choked drop for comparison." />
        </Figure>
      )}
      {rows6 && (
        <PanTable>
          <Table.Thead>
            <Table.Tr><Table.Th>at</Table.Th><Table.Th>valve inlet P1 [bar]</Table.Th><Table.Th>valve drop [bar]</Table.Th><Table.Th>choked drop [bar]</Table.Th><Table.Th>cavitation index σ</Table.Th><Table.Th>regime</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows6.map((r) => (
              <Table.Tr key={r.q} data-cv-risk-row={r.q === 1 ? "max" : "min"}>
                <Table.Td>{r.q === 1 ? "rated flow" : `minimum flow (${fx(r.q * 100, 0)} % of rated)`}</Table.Td>
                <Table.Td>{bar(r.P1)}</Table.Td><Table.Td>{bar(r.dp)}</Table.Td><Table.Td>{bar(r.choke)}</Table.Td>
                <Table.Td>{fx(r.sigma, 2)}</Table.Td>
                <Table.Td>{r.dp >= r.choke ? "choked" : r.regime === "neither" ? "neither" : r.regime}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
      )}
      <PanelNote>
        Runs tutorials/{CV_PROPS_WITNESS} (choupoProps WASM) with its first temperature moved to yours; the
        case names that operation for 350 K, its shipped value. P2, the pressure at the discharge vessel,
        is the engine's pump inlet pressure: the sized line starts and ends at one pressure. The choking
        relations are those of the{" "}
        <Anchor component="button" type="button" onClick={() => setActiveMethodTool("letdown")}>letdown page</Anchor>.
      </PanelNote>
    </Box>
  );

  // ---- card 7 ----------------------------------------------------------------
  const svc = FAIL_SERVICES.find((s) => s.id === service) ?? FAIL_SERVICES[0]!;
  const ACTIONS: { value: FailAction; label: string }[] = [
    { value: "open", label: "fails open" }, { value: "closed", label: "fails closed" },
    { value: "inPlace", label: "fails in place" },
  ];
  const card7 = (
    <Box data-cv-card="fail">
      <Group gap={6}>
        <Badge size="sm" variant="light" color="orange" data-cv-authored="">authored, not computed</Badge>
        <Text size="xs" c="dimmed">
          The consequences below are written text. Nothing here is computed and the engine has not checked them.
        </Text>
      </Group>
      <Stack gap={8} mt={8}>
        <SegmentedControl size="xs" fullWidth orientation="vertical" value={service} onChange={setService}
          data={FAIL_SERVICES.map((s) => ({ value: s.id, label: s.service }))} aria-label="service" />
        <SegmentedControl size="xs" fullWidth value={action} onChange={(v) => setAction(v as FailAction)}
          data={ACTIONS} aria-label="fail action" />
        <Box px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }} data-cv-fail-consequence={`${svc.id}:${action}`}>
          <Text size="xs" c="dimmed">{svc.role}</Text>
          <Text size="sm" mt={4}><b>If the air is lost and it {ACTIONS.find((a2) => a2.value === action)!.label}:</b> {svc.consequence[action]}</Text>
          <Text size="sm" mt={6}><b>Why it is not one word:</b> {svc.pull}</Text>
          <Text size="xs" mt={6}>
            The numbers that decide a real case:{" "}
            <Anchor component="button" type="button" onClick={() => setActiveMethodTool(svc.tool)}>{svc.toolLabel}</Anchor>.
          </Text>
        </Box>
      </Stack>
    </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Why does a correctly sized valve still control badly?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A control valve is sized once, at one flow, and then asked to work over all of them. This page
            takes a pump and a line from the engine and shows what the line does to the valve: the share of
            the pressure it holds, the curve it really has, the gain the controller feels, the range it can
            hold, where it is most at risk, and which way it fails.
          </Text>
        </Box>
        {step(1)}
        {card1}
        {step(2)}
        {card2}
        {step(3)}
        {card3}
        {step(4)}
        {card4}
        {step(5)}
        {card5}
        {step(6)}
        {card6}
        {step(7)}
        {card7}
        <LessonLimits limits={CV_LIMITS} />
        <LessonQuiz title="Check your understanding" questions={CV_QUIZ} lesson={CV_STEPS} />
        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("letdown")}>Large pressure letdown</Anchor>{" "}
          (what the fluid does in the valve),{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("pump-system")}>Pump vs system curve</Anchor>{" "}
          (the source of the head),{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("loop-placement")}>Loop placement</Anchor>{" "}
          (where a loop belongs) and{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("bode")}>Frequency response</Anchor>{" "}
          (the margin a loop keeps).
        </Text>
      </Stack>
    </Box>
  );
}
