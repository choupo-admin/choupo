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
  CalculatedToBoughtTool -- "From the calculated to the bought" (C503).  The
  student's question: if I round this exchanger, pipe and compressor driver up
  to what I can buy, what do I pay and what margin do I get?

  A scrolling lesson, six cards; the lesson is DATA (calculatedToBoughtLesson.ts),
  the readers and the page arithmetic are calculatedToBoughtMath.ts's.

  WHAT IS THE ENGINE'S.  Card 1 runs hxBought01_margin_and_stock with the
  margin you set and reads the calculated, required and bought areas, the
  tubes, the shell and the cost.  Card 3 runs it once per stock tube length;
  card 6 once per swept margin.  Card 4 runs line01_pumped_drum with the
  velocity ceiling you set and reads its line list; card 5 runs
  compressor03_staged_design and reads the shaft power and the driver rating.
  What is the PAGE's, and marked so: the minimum pipe bore from the engine's
  velocity, the driver rating at a margin you change and the ladder you
  declare, and the cover test of card 2.  The page predicts no engine number.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Anchor, Box, Group, Loader, SegmentedControl, Stack, Table, Text, Title } from "@mantine/core";

import { useMethodRun, useMethodRunSweep, type MethodRunState, type MethodSweepState } from "../../case/methodRun.js";
import {
  CB_COMPRESSOR_WITNESS, CB_LINE_WITNESS, CB_MARGINS, CB_STOCK_LENGTHS, CB_WITNESS,
  coveringMargin, driverAt, exchangerOverrides, lineOverrides, readDriver, readExchanger,
  readLines, type MarginPoint,
} from "./calculatedToBoughtMath.js";
import { CurveChart, HUE_A, HUE_B, type CurveSeries } from "./controlValveDrawings.js";
import { CB_LIMITS, CB_QUIZ, CB_STEPS } from "./calculatedToBoughtLesson.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(CB_STEPS);

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
} as const;

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
const pct = (v: number | null | undefined, d = 1): string =>
  typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(d)} %` : "—";
const money = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—";

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

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

function Waiting({ runs, what }: { runs: readonly MethodRunState[]; what: string }): JSX.Element | null {
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
      <Group gap="sm" wrap="nowrap" align="center" data-cb-waiting="">
        <Loader size="xs" /><Text size="xs" c="dimmed">{what}</Text>
      </Group>
    );
  }
  return null;
}

function SweepWaiting({ s, what }: { s: MethodSweepState; what: string }): JSX.Element | null {
  const err = s.errs.find((e) => e !== null) ?? null;
  if (err !== null)
    return (
      <Alert color="red" variant="light" title="The engine reported an error: its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{err}</Text>
      </Alert>
    );
  if (s.busy || s.results.length === 0 || s.results.some((r) => r === null))
    return (
      <Group gap="sm" wrap="nowrap" align="center" data-cb-waiting="">
        <Loader size="xs" /><Text size="xs" c="dimmed">{what}</Text>
      </Group>
    );
  return null;
}

/** Three bars on one scale: calculated, required with the margin, bought. */
function AreaBars({ calc, req, bought }: { calc: number; req: number; bought: number }): JSX.Element {
  const W = 360, x0 = 112, x1 = 340;
  const top = Math.max(calc, req, bought) * 1.05;
  const w = (a: number) => ((a / top) * (x1 - x0)).toFixed(1);
  const rows: { y: number; label: string; v: number; fill: string }[] = [
    { y: 14, label: "calculated", v: calc, fill: "var(--mantine-color-dimmed)" },
    { y: 52, label: "with margin", v: req, fill: HUE_A },
    { y: 90, label: "bought", v: bought, fill: HUE_B },
  ];
  return (
    <svg viewBox={`0 0 ${W} 130`} style={{ display: "block", width: "100%", maxWidth: 560 }}
      role="img" aria-label={`Three areas: calculated ${fx(calc, 1)} square metres, required with the margin ${fx(req, 1)}, bought ${fx(bought, 1)}.`}>
      {rows.map((r) => (
        <g key={r.label}>
          <text x={x0 - 6} y={r.y + 18} textAnchor="end" fontSize={11} fill="var(--mantine-color-text)">{r.label}</text>
          <rect x={x0} y={r.y} width={w(r.v)} height={26} fill={r.fill} rx={2} />
          <text x={x0 + Number(w(r.v)) - 4} y={r.y + 18} textAnchor="end" fontSize={11} fontWeight={600} fill="#fff">
            {fx(r.v, 1)}
          </text>
        </g>
      ))}
      <text x={x0} y={126} fontSize={10} fill="var(--mantine-color-dimmed)">area, m2</text>
    </svg>
  );
}

export function CalculatedToBoughtTool(): JSX.Element {
  // ---- state ----------------------------------------------------------------
  const [margin, setMargin] = useState(0.1);
  const [stockIdx, setStockIdx] = useState<string>("all");
  const [uCoef, setUCoef] = useState(0.1);
  const [vmax, setVmax] = useState(3);
  const [mdOverride, setMdOverride] = useState<number | null>(null);
  const [frameStep, setFrameStep] = useState(100);

  const onlyLength = stockIdx === "all" ? null : CB_STOCK_LENGTHS[Number(stockIdx)] ?? null;

  // ---- the engine runs ------------------------------------------------------
  const main = useMethodRun(CB_WITNESS, exchangerOverrides(margin, onlyLength),
    JSON.stringify([margin, onlyLength]), "choupoSolve");
  const lengthSets = useMemo(
    () => CB_STOCK_LENGTHS.map((L) => exchangerOverrides(margin, L)), [margin]);
  const lengths = useMethodRunSweep(CB_WITNESS, lengthSets, `L${margin}`, "choupoSolve");
  const marginSets = useMemo(
    () => CB_MARGINS.map((m) => exchangerOverrides(m, onlyLength)), [onlyLength]);
  const margins = useMethodRunSweep(CB_WITNESS, marginSets, `M${onlyLength}`, "choupoSolve");
  const lineRun = useMethodRun(CB_LINE_WITNESS, lineOverrides(vmax), String(vmax), "choupoSolve");
  const compRun = useMethodRun(CB_COMPRESSOR_WITNESS, [], "", "choupoSolve");

  const hx = readExchanger(main.result);
  const lines = readLines(lineRun.result);
  const drv = readDriver(compRun.result);
  const md = mdOverride ?? drv?.margin ?? 1.1;
  const drvAt = drv ? driverAt(drv.powerShaft, md, frameStep) : null;
  const drvSource = useMemo(() => {
    const m = (compRun.log ?? "").match(/API recommends[^\n]*?\(Brown[^)]*\)/);
    return m ? m[0] : null;
  }, [compRun.log]);

  const points: MarginPoint[] = useMemo(() => {
    const out: MarginPoint[] = [];
    margins.results.forEach((r, i) => {
      const reading = readExchanger(r);
      if (reading) out.push({ margin: CB_MARGINS[i]!, reading });
    });
    return out;
  }, [margins.results]);
  const cover = coveringMargin(points, uCoef);
  const cost0 = points[0]?.reading.cost ?? null;

  // ---- card 1 -----------------------------------------------------------------
  const card1 = (
    <Box data-cb-card="exchanger">
      <OriginMark of={["engine", "assumption"]}
        note="the three areas, the tubes, the shell and the cost are the engine's (the condenser of hxBought01_margin_and_stock, run in this browser); the margin is yours" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "margin", label: "design margin on the area", min: 0, max: 0.3, step: 0.01 }}
          value={margin} onChange={setMargin} />
      </Box>
      <Box mt={8}><Waiting runs={[main]} what="the engine is designing the condenser with your margin" /></Box>
      {hx && (
        <>
          <Figure caption={<>The condenser's three areas on one scale. With a margin of {pct(hx.margin, 0)} the
            engine asks for {fx(hx.margined, 1)} m2 and buys {fx(hx.bought, 1)} m2: {pct(hx.surplus)} above the
            calculated {fx(hx.calculated, 1)} m2, of which your margin is {pct(hx.margin, 0)} and the rest is whole
            tubes and a stock length.</>}>
            <AreaBars calc={hx.calculated} req={hx.margined} bought={hx.bought} />
          </Figure>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>from the engine</Table.Th><Table.Th>value</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>area calculated [m2]</Table.Td><Table.Td data-cb-calc="">{fx(hx.calculated, 2)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>area required with the margin [m2]</Table.Td><Table.Td data-cb-margined="">{fx(hx.margined, 2)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>area bought, installed [m2]</Table.Td><Table.Td data-cb-bought="">{fx(hx.bought, 2)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>tubes</Table.Td><Table.Td>{fx(hx.nTubes, 0)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>tube length bought [m]</Table.Td><Table.Td>{fx(hx.tubeLength, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>shell: calculated, then bought from the list [m]</Table.Td>
                <Table.Td>{fx(hx.shellCalculated, 3)}, then {fx(hx.shellBought, 2)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>purchased cost of the condenser [{hx.currency}]</Table.Td><Table.Td data-cb-cost="">{money(hx.cost)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
        </>
      )}
      <PanelNote>
        Runs tutorials/steady/heat/{CB_WITNESS} (choupoSolve WASM) with `margin {"{ area }"}` set to your value.
        The reboiler of the same column is untouched. The stock lists are the case's own assumption.
      </PanelNote>
    </Box>
  );

  // ---- card 2 -----------------------------------------------------------------
  const card2 = (
    <Box data-cb-card="uncertainty">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the areas are the engine's, swept over the margin; the cover test is this page's arithmetic on them" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "uCoef", label: "fall of the overall coefficient you want to cover", min: 0, max: 0.3, step: 0.01 }}
          value={uCoef} onChange={setUCoef} />
      </Box>
      <Box mt={8}><SweepWaiting s={margins} what="the engine is sweeping the margin from 0 to 30 %" /></Box>
      {points.length > 0 && (
        <Text size="sm" mt={8} data-cb-cover="">
          If the overall coefficient turns out {pct(uCoef, 0)} lower than calculated, the area must be at least the
          calculated {fx(points[0]!.reading.calculated, 1)} m2 divided by {fx(1 - uCoef, 2)}, which is{" "}
          {fx(points[0]!.reading.calculated / (1 - uCoef), 1)} m2.{" "}
          {cover
            ? <>The cheapest swept margin that covers it is <b>{pct(cover.margin, 0)}</b>, which buys{" "}
              {fx(cover.reading.bought, 1)} m2 for {money(cover.reading.cost)} {cover.reading.currency}.</>
            : <>No margin up to {pct(CB_MARGINS[CB_MARGINS.length - 1], 0)} covers that: the uncertainty is larger than the range swept.</>}
        </Text>
      )}
      <PanelNote>
        A margin without the uncertainty named is a number nobody can defend: say what you do not know, in which
        quantity, and by how much. The test holds the coefficient of the calculated bundle for the larger ones.
      </PanelNote>
    </Box>
  );

  // ---- card 3 -----------------------------------------------------------------
  const lenReadings = lengths.results.map((r) => readExchanger(r));
  const minArea = Math.min(...lenReadings.map((r) => r?.bought ?? Infinity));
  const card3 = (
    <Box data-cb-card="stock">
      <OriginMark of={["engine", "assumption"]}
        note="one engine run per stock length at your margin; the lengths are the witness's own assumed list" />
      <Box mt={8}>
        <Text size="xs" c="dimmed" mb={4}>Stock on offer for the main run (card 1 and the cost curve)</Text>
        <SegmentedControl size="xs" fullWidth value={stockIdx} onChange={setStockIdx}
          aria-label="stock tube lengths"
          data={[{ value: "all", label: "all four" },
            ...CB_STOCK_LENGTHS.map((L, i) => ({ value: String(i), label: `${fx(L, 3)} m` }))]} />
      </Box>
      <Box mt={8}><SweepWaiting s={lengths} what="the engine is designing the condenser on each stock length" /></Box>
      {lenReadings.every((r) => r !== null) && (
        <PanTable>
          <Table.Thead>
            <Table.Tr><Table.Th>stock length [m]</Table.Th><Table.Th>tubes</Table.Th><Table.Th>area bought [m2]</Table.Th>
              <Table.Th>shell bought [m]</Table.Th><Table.Th>cost</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lenReadings.map((r, i) => (
              <Table.Tr key={CB_STOCK_LENGTHS[i]} data-cb-length-row={CB_STOCK_LENGTHS[i]}
                style={r!.bought <= minArea * (1 + 1e-9) ? { fontWeight: 700 } : undefined}>
                <Table.Td>{fx(CB_STOCK_LENGTHS[i], 3)}</Table.Td><Table.Td>{fx(r!.nTubes, 0)}</Table.Td>
                <Table.Td>{fx(r!.bought, 2)}</Table.Td><Table.Td>{fx(r!.shellBought, 2)}</Table.Td>
                <Table.Td>{money(r!.cost)} {r!.currency}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
      )}
      <Text size="xs" mt={6}>
        Bold: the length with the smallest installed area, which is the one the engine buys when all four are on
        offer. The margin is the one set in card 1, {pct(margin, 0)}.
      </Text>
    </Box>
  );

  // ---- card 4 -----------------------------------------------------------------
  const card4 = (
    <Box data-cb-card="pipe">
      <OriginMark of={["engine", "page", "assumption"]}
        note="nominal size, bore and velocity are the engine's line list for line01_pumped_drum; the minimum bore is this page's arithmetic from them; the ceiling is yours" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "vmax", label: "velocity ceiling of the liquid discharge window", unit: "m/s", min: 1.5, max: 4, step: 0.25 }}
          value={vmax} onChange={setVmax} />
      </Box>
      <Box mt={8}><Waiting runs={[lineRun]} what="the engine is sizing the lines with your ceiling" /></Box>
      {lines.length > 0 && (
        <PanTable>
          <Table.Thead>
            <Table.Tr><Table.Th>line</Table.Th><Table.Th>service</Table.Th><Table.Th>bought: nominal size [in], schedule</Table.Th>
              <Table.Th>bore [mm]</Table.Th><Table.Th>velocity [m/s]</Table.Th><Table.Th>ceiling [m/s]</Table.Th>
              <Table.Th>smallest bore the ceiling allows [mm]</Table.Th><Table.Th>extra flow area</Table.Th><Table.Th>price of the line</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l) => (
              <Table.Tr key={l.stream} data-cb-line={l.stream}>
                <Table.Td>{l.stream}</Table.Td><Table.Td>{l.service}</Table.Td>
                <Table.Td>{fx(l.nps, 2)}, {fx(l.schedule, 0)}</Table.Td><Table.Td>{fx(l.bore * 1000, 1)}</Table.Td>
                <Table.Td>{fx(l.velocity, 2)}</Table.Td><Table.Td>{fx(l.velocityMax, 2)}</Table.Td>
                <Table.Td>{fx(l.boreMin * 1000, 1)}</Table.Td><Table.Td>{pct(l.areaMargin)}</Table.Td><Table.Td>{l.cost === null ? "not costed" : money(l.cost)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
      )}
      <PanelNote>
        Runs tutorials/plant/{CB_LINE_WITNESS} (choupoSolve WASM) with the ceiling of its liquid-discharge window moved.
        The case declares a price for the 4 inch line only: any other size is listed as not costed in the engine's line list,
        and the page shows it as such. The suction line follows a different rule and is not read here.
      </PanelNote>
    </Box>
  );

  // ---- card 5 -----------------------------------------------------------------
  const card5 = (
    <Box data-cb-card="driver">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the shaft power and the engine's own rating are compressor03_staged_design's; the rating at your margin and the frame ladder are this page's arithmetic" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "md", label: "driver margin (factor on the shaft power)", min: 1, max: 1.5, step: 0.01 }}
          value={Math.round(md * 100) / 100} onChange={(v) => setMdOverride(v)} />
        <KnobSlider knob={{ id: "frame", label: "your frame ladder: step between rungs", unit: "kW", min: 10, max: 500, step: 10 }}
          value={frameStep} onChange={setFrameStep} />
      </Box>
      <Box mt={8}><Waiting runs={[compRun]} what="the engine is sizing the compressor" /></Box>
      {drv && drvAt && (
        <>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>kW</Table.Th><Table.Th>value</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>shaft power the machine needs (engine)</Table.Td><Table.Td data-cb-shaft="">{fx(drv.powerShaft, 1)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>driver rating at the engine's margin {fx(drv.margin, 2)} (engine)</Table.Td><Table.Td data-cb-engine-rating="">{fx(drv.rating, 1)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>driver rating at your margin {fx(md, 2)} (page)</Table.Td><Table.Td data-cb-rating="">{fx(drvAt.rating, 1)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>frame bought from your ladder (page)</Table.Td><Table.Td data-cb-frame="">{fx(drvAt.bought, 0)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>frame over the shaft power</Table.Td><Table.Td>{pct(drvAt.surplus)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="xs" mt={6} data-cb-driver-source="">
            The engine's note on its margin, from the run's log: {drvSource ? `“${drvSource}”` : "—"}
          </Text>
        </>
      )}
      <PanelNote>
        Runs tutorials/steady/rotating/{CB_COMPRESSOR_WITNESS} (choupoSolve WASM) unchanged; the engine carries no motor
        frame list and prices no driver, so the ladder is yours and this card shows no cost.
      </PanelNote>
    </Box>
  );

  // ---- card 6 -----------------------------------------------------------------
  const costPts: [number, number][] = points
    .filter((p) => p.reading.cost !== null && cost0 !== null)
    .map((p) => [p.margin, (p.reading.cost! / cost0! - 1) * 100]);
  const yMax = Math.max(1, ...costPts.map((p) => p[1])) * 1.1;
  const costSeries: CurveSeries[] = costPts.length > 1
    ? [{ name: "cost", pts: costPts, color: HUE_B, labelX: 0.12, labelDy: -10 }] : [];
  const card6 = (
    <Box data-cb-card="cost">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the cost is the engine's purchased cost at each swept margin; the cover marker uses card 2's uncertainty" />
      <Box mt={8}><SweepWaiting s={margins} what="the engine is sweeping the margin from 0 to 30 %" /></Box>
      {costSeries.length > 0 && (
        <Figure caption={<>The condenser's purchased cost against the margin, as the percentage above the cost with none ({money(cost0)}{" "}
          {points[0]?.reading.currency}). It rises in steps because the bought area does.
          {cover ? <> The dotted line marks the cheapest margin that covers an uncertainty of {pct(uCoef, 0)}: {pct(cover.margin, 0)},
            at {fx((cover.reading.cost! / cost0! - 1) * 100, 1)} % more than the cost of none.</> : <> No swept margin covers an uncertainty of {pct(uCoef, 0)}.</>}</>}>
          <CurveChart series={costSeries} xMax={0.3} yMax={yMax} xLabel="margin on the area" yLabel="extra cost over no margin, %"
            xTicks={[0, 0.1, 0.2, 0.3]} yTicks={[0, Math.round(yMax / 2 * 10) / 10, Math.round(yMax * 10) / 10]}
            marks={cover ? [{ x: cover.margin, label: "covers u", color: "var(--mantine-color-dimmed)" }] : []}
            aria="Extra purchased cost of the condenser against the design margin, in percent over no margin." />
        </Figure>
      )}
      <Text size="sm" data-cb-sentence="">
        A margin is chosen for an uncertainty you must name. Say it: this much extra area, for this much uncertainty in
        this quantity, at this price. If you cannot, the margin is a superstition with a price on it.
      </Text>
    </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>From the calculated to the bought</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A calculation gives a minimum; a purchase gives a size. This page rounds an exchanger, a pipe and a compressor
            driver up to what can be bought, on the engine's own runs, and shows what you pay and what margin you end up
            with.
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
        <LessonLimits limits={CB_LIMITS} />
        <LessonQuiz title="Check your understanding" questions={CB_QUIZ} lesson={CB_STEPS} />
        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("control-valve")}>Why does a correctly sized valve still control badly?</Anchor>{" "}
          (another place where a calculated size meets the line it sits in).
        </Text>
      </Stack>
    </Box>
  );
}
