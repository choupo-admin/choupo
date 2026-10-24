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
  SinesPtaTool -- "A negative case: the Sines PTA plant" (DEV.md 4c C143).

  A NOTES page with ONE interactive: a pre-tax discounted cash flow the
  student moves, with its break-even spread, NPV against the spread beside
  the published spreads, and a tornado.  NO ENGINE RUN, and that is the
  subject rather than an omission: the case is about the economic analysis
  that decides whether a simulation is worth building at all.

  THE FACTS are in sinesPta.ts and the prose in sinesPtaLesson.ts, both
  React-free, both from one record (docs/design/the-sines-pta-plant-a-
  negative-case.md) and both held by tests/sinesPta.test.ts.  The scope is
  Vitor's ruling: institutions only, no persons, no motives, no politics.

  THE TWO LINE COLOURS are Mantine blue-6 (#228be6) and orange-8 (#e8590c),
  the pair the Front-End Loading page validated, re-run here with the
  dataviz palette validator against the Plotly chrome of BOTH schemes
  (#ffffff and #1f1f1f): every check PASSES in both (lightness band, chroma,
  CVD separation 27.7, normal-vision 34.5, contrast >= 3:1).  The house
  accent/warm pair FAILS the light band and the 3:1 contrast on white, which
  is why the shared TornadoPlot gained an optional `colors` prop.  The
  second line is ALSO dashed and both are named in the legend, so identity
  is never colour alone.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Anchor, Badge, Box, Group, Stack, Table, Text, Title,
} from "@mantine/core";

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "../plotting/plotly.js";
import { TornadoPlot } from "../plotting/TornadoPlot.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import {
  SINES_CHECKLIST, SINES_LIMITS, SINES_MARKET_QUOTES, SINES_STEPS,
  SINES_WARNINGS, type Quote,
} from "./sinesPtaLesson.js";
import {
  APPRAISAL_INPUTS, CAPEX_HISTORY, DEFAULT_APPRAISAL, LOSS_METRICS, OFFTAKE,
  PUBLISHED_SPREADS, SOURCES, TIMELINE, appraise, breakEvenSpread, fmtMoney,
  merchantShareAt, npvCurve, tornadoFigure, type Appraisal, type InputStatus,
} from "./sinesPta.js";
import { setActiveMethodTool } from "./registry.js";

const HUE_A = "#228be6";
const HUE_B = "#e8590c";

const step = lessonStepper(SINES_STEPS);

const STATUS_COLOR: Record<InputStatus, string> = {
  documented: "teal", published: "blue", synthetic: "orange",
};
const STATUS_WORD: Record<InputStatus, string> = {
  documented: "documented", published: "published figure",
  synthetic: "synthetic teaching value",
};

const fx = (v: number, d = 1): string =>
  Number.isFinite(v) ? v.toFixed(d).replace("-", "−") : "—";

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

/** A quotation in its document's language, with the translation beside it. */
function QuoteView({ q }: { q: Quote }): JSX.Element {
  return (
    <Box mb={4}>
      <Text size="sm" fs="italic">“{q.original}”</Text>
      {q.english && (
        <Text size="xs" c="dimmed">English: {q.english}</Text>
      )}
      <Text size="xs" c="dimmed">— {q.source}</Text>
    </Box>
  );
}

const GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
} as const;

// ---- the appraisal --------------------------------------------------------

function InputGrid({ a, set }: {
  a: Appraisal; set: (k: keyof Appraisal, v: number) => void;
}): JSX.Element {
  return (
    <Box style={GRID}>
      {APPRAISAL_INPUTS.map((inp) => (
        <Box key={inp.key} style={{ minWidth: 0 }}>
          <KnobNumber label={`${inp.label} [${inp.unit}]`} value={a[inp.key]}
            min={inp.min} max={inp.max} step={inp.step}
            decimals={inp.step < 1 ? 3 : 0}
            onChange={(v) => set(inp.key, v)} />
          <Group gap={4} mt={2} wrap="wrap">
            <Badge size="xs" variant="light" color={STATUS_COLOR[inp.status]}>
              {STATUS_WORD[inp.status]}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.25 }}>{inp.basis}</Text>
        </Box>
      ))}
    </Box>
  );
}

function NpvSpreadChart({ a }: { a: Appraisal }): JSX.Element {
  const asSet = npvCurve(a, 0, 300);
  const stopsYear = a.captiveStopsAfter === 0 || a.captiveStopsAfter > 2;
  const down = npvCurve({ ...a, captiveStopsAfter: 2 }, 0, 300);
  const sStar = breakEvenSpread(a);
  const marks = [
    { s: 87, label: "Asia 2014: 87" },
    { s: 163, label: "Asia 5-yr avg to 2014: 163" },
    { s: 231, label: "West 2014: 231" },
  ];
  const shapes: Record<string, unknown>[] = [
    { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 0,
      line: { color: PLOT_COLORS.axis, width: 1.5 } },
    ...marks.map((m) => ({
      type: "line", xref: "x", x0: m.s, x1: m.s, yref: "paper", y0: 0, y1: 1,
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dot" } })),
  ];
  const annotations: Record<string, unknown>[] = marks.map((m, i) => ({
    xref: "x", x: m.s, yref: "paper", y: 1 - 0.07 * i, yanchor: "top",
    xanchor: m.s > 200 ? "right" : "left", text: m.label, showarrow: false,
    font: { size: 10 },
  }));
  const traces: Record<string, unknown>[] = [{
    type: "scatter", mode: "lines", name: "NPV, inputs as set",
    x: asSet.s, y: asSet.npv, line: { color: HUE_A, width: 2 },
    hovertemplate: "spread %{x:.0f} US$/t<br>NPV %{y:.0f} M EUR<extra>as set</extra>",
  }];
  if (stopsYear) {
    traces.push({
      type: "scatter", mode: "lines",
      name: "NPV, captive customer stops after year 2",
      x: down.s, y: down.npv, line: { color: HUE_B, width: 2, dash: "dash" },
      hovertemplate: "spread %{x:.0f} US$/t<br>NPV %{y:.0f} M EUR"
        + "<extra>customer stops after year 2</extra>",
    });
  }
  if (Number.isFinite(sStar) && sStar >= 0 && sStar <= 300) {
    traces.push({
      type: "scatter", mode: "markers", name: `break-even s* = ${fx(sStar, 0)} US$/t`,
      x: [sStar], y: [0],
      marker: { color: HUE_A, size: 11, symbol: "diamond",
        line: { color: PLOT_COLORS.background, width: 2 } },
      hovertemplate: "break-even %{x:.0f} US$/t<extra></extra>",
    });
  }
  return (
    <Box style={{ width: "100%", height: 400 }}>
      <Plot data={traces}
        layout={{
          ...darkLayout,
          title: { text: "NPV against the spread (pre-tax, at the decision)",
            font: { ...darkLayout.font, size: 13 } },
          xaxis: { ...darkLayout.xaxis, range: [0, 300],
            title: { text: "industry spread s  [US$/t]" } },
          yaxis: { ...darkLayout.yaxis, title: { text: "NPV  [M EUR]" } },
          shapes, annotations,
          legend: { ...darkLayout.legend, orientation: "h", x: 0, y: -0.22 },
          margin: { ...darkLayout.margin, b: 96 },
          hovermode: "x unified",
        }}
        config={PLOT_CONFIG}
        useResizeHandler style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}

function Appraiser(): JSX.Element {
  const [a, setA] = useState<Appraisal>(DEFAULT_APPRAISAL);
  const set = (k: keyof Appraisal, v: number) => setA((p) => ({ ...p, [k]: v }));
  const r = useMemo(() => appraise(a), [a]);
  const sStar = useMemo(() => breakEvenSpread(a), [a]);
  const fig = useMemo(() => tornadoFigure(a), [a]);
  return (
    <Box>
      <Title order={5}>Your appraisal</Title>
      <Text size="sm" mt={4}>
        Move any input.  The badge under each says whether its default is
        documented, a published figure, or a synthetic teaching value; the
        line under it says where it comes from.
      </Text>
      <Box mt={8}><InputGrid a={a} set={set} /></Box>
      <Group gap="xs" mt={10} wrap="wrap">
        <Badge size="lg" variant="filled" color={r.npv >= 0 ? "teal" : "red"}>
          NPV = {fx(r.npv, 0)} M EUR
        </Badge>
        <Badge size="lg" variant="light" color="blue">
          break-even spread s* = {fx(sStar, 0)} US$/t
        </Badge>
        <Badge size="lg" variant="light" color="gray">
          merchant share (year 2) = {fx(100 * r.merchantShare, 1)} %
        </Badge>
        <Badge size="lg" variant="light" color="gray">
          PV of capital = {fx(r.pvCapex, 0)} M EUR
        </Badge>
      </Group>
      <Box mt={10}><NpvSpreadChart a={a} /></Box>
      <Text size="xs" c="dimmed">
        Dotted verticals: three of the published spreads (IVL-AR2014,
        IVL-AR2015).  Solid line: the NPV with every input as set; dashed:
        the same with the captive customer stopping after operating year 2
        (drawn only while your own setting is a later year or never).
        Diamond: the break-even spread.
      </Text>
      <Box mt={12}>
        <Title order={6}>One input at a time: the tornado</Title>
        <TornadoPlot fig={fig} colors={{ low: HUE_A, high: HUE_B }} />
        <PanelNote>{fig.caveat}</PanelNote>
      </Box>
      <Box mt={10} style={{ maxHeight: 300, overflowY: "auto" }}>
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>year k</Table.Th><Table.Th>t [yr]</Table.Th>
              <Table.Th>production [kt]</Table.Th><Table.Th>captive [kt]</Table.Th>
              <Table.Th>merchant [kt]</Table.Th><Table.Th>CF [M EUR]</Table.Th>
              <Table.Th>discount factor</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {r.years.map((y) => (
              <Table.Tr key={y.k}>
                <Table.Td>{y.k}</Table.Td><Table.Td>{y.t}</Table.Td>
                <Table.Td>{fx(y.production, 0)}</Table.Td>
                <Table.Td>{fx(y.captiveVolume, 0)}</Table.Td>
                <Table.Td>{fx(y.merchantVolume, 0)}</Table.Td>
                <Table.Td>{fx(y.cashFlow, 1)}</Table.Td>
                <Table.Td>{fx(y.discountFactor, 3)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
      </Box>
      <PanelNote>
        This is the analysis a student should have done, not a reconstruction
        of the real business plan: no public document read gives the plan's
        conversion cost, fixed costs, assumed spread, discount rate or cash
        flows.  Pre-tax; no depreciation, debt service, working capital or
        receivables.  The tornado writes its NPVs in EUR, so that{" "}
        {fmtMoney(-1.5e8)} reads minus EUR 150 million.
      </PanelNote>
    </Box>
  );
}

// ---- the page --------------------------------------------------------------

export function SinesPtaTool(): JSX.Element {
  const shareContract = merchantShareAt(OFFTAKE.capacity, OFFTAKE.contract);
  const shareNeed = merchantShareAt(OFFTAKE.capacity, OFFTAKE.need);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>A negative case: the Sines PTA plant</Title>
          <Text size="sm" c="dimmed" mt={4}>
            What the economic analysis of a chemical process must contain,
            read from a case in which it was not done: a PTA plant whose
            margin was a spread, whose output had one captive customer, and
            whose warnings were written down at the time.  Every fact carries
            its primary source and page; the research record is{" "}
            <code>docs/design/the-sines-pta-plant-a-negative-case.md</code>.
            Institutions only: no persons are named and no motive is
            attributed to anyone.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}

        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>when</Table.Th><Table.Th>what the document stated</Table.Th>
              <Table.Th>EUR M</Table.Th><Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CAPEX_HISTORY.map((c) => (
              <Table.Tr key={`${c.when}-${c.value}`}>
                <Table.Td>{c.when}</Table.Td><Table.Td>{c.what}</Table.Td>
                <Table.Td>{c.value}</Table.Td><Table.Td>{c.source}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>

        {step(4)}

        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>quantity</Table.Th><Table.Th>kt/yr</Table.Th>
              <Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr><Table.Td>plant capacity</Table.Td>
              <Table.Td>{OFFTAKE.capacity}</Table.Td><Table.Td>LSB-2012 p. 29</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>what the plan assumed the shareholder would buy</Table.Td>
              <Table.Td>the whole output</Table.Td><Table.Td>CPI-2019 p. 288</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>what the contract allowed it to buy (no explicit penalty)</Table.Td>
              <Table.Td>up to {OFFTAKE.contract}</Table.Td><Table.Td>LSB-2012 p. 29; LSB-2014 pp. 122-123</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>what its PET plants ({OFFTAKE.petCapacity} kt/yr) needed</Table.Td>
              <Table.Td>{OFFTAKE.need}</Table.Td><Table.Td>LSB-2012 p. 37</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>merchant share, against the contract / the need</Table.Td>
              <Table.Td>{fx(100 * shareContract, 1)} % / {fx(100 * shareNeed, 1)} %</Table.Td>
              <Table.Td>this page's arithmetic</Table.Td></Table.Tr>
          </Table.Tbody>
        </PanTable>

        {step(5)}
        {step(6)}
        <Appraiser />

        {step(7)}
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>year</Table.Th><Table.Th>Asia PTA [US$/t]</Table.Th>
              <Table.Th>West PTA, 50:50 North America : Europe [US$/t]</Table.Th>
              <Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {PUBLISHED_SPREADS.map((r) => (
              <Table.Tr key={r.year}>
                <Table.Td>{r.year}</Table.Td><Table.Td>{r.asia}</Table.Td>
                <Table.Td>{r.west ?? "—"}</Table.Td><Table.Td>{r.source}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
        <Text size="xs" c="dimmed">
          IVL's "industry spread": selling price less raw-material
          consumption.  Published figures, quoted with their source.
        </Text>
        <Box>
          {SINES_MARKET_QUOTES.map((q) => <QuoteView key={q.original} q={q} />)}
        </Box>

        {step(8)}
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>what the documents record (original, then English)</Table.Th>
              <Table.Th>the concept that catches it</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {SINES_WARNINGS.map((w) => (
              <Table.Tr key={w.n}>
                <Table.Td style={{ verticalAlign: "top" }}>{w.n}</Table.Td>
                <Table.Td style={{ verticalAlign: "top", minWidth: 280 }}>
                  {w.quotes.map((q) => <QuoteView key={q.original} q={q} />)}
                  <Text size="xs" mt={2}>{w.context}</Text>
                </Table.Td>
                <Table.Td style={{ verticalAlign: "top", minWidth: 180 }}>
                  <Text size="sm">{w.concept}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>

        {step(9)}
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>when</Table.Th><Table.Th>what happened</Table.Th>
              <Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {TIMELINE.map((t) => (
              <Table.Tr key={t.when + t.event}>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{t.when}</Table.Td>
                <Table.Td>{t.event}</Table.Td><Table.Td>{t.source}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>

        {step(10)}
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>metric</Table.Th><Table.Th>what it measures</Table.Th>
              <Table.Th>value</Table.Th><Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {LOSS_METRICS.map((m) => (
              <Table.Tr key={m.metric}>
                <Table.Td><b>{m.metric}</b></Table.Td><Table.Td>{m.definition}</Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{m.value}</Table.Td>
                <Table.Td>{m.source}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
        <Text size="xs" c="red" fw={600}>
          These figures overlap.  Do not add them.
        </Text>

        {step(11)}
        {/* A plain list: Mantine's List wraps its labels 20 px past the
            item's own box (measured at 390 px), which a phone clips. */}
        <Box component="ul" style={{ margin: 0, paddingLeft: 20 }}>
          {SINES_CHECKLIST.map((c) => (
            <Text component="li" size="sm" key={c} mb={4}>{c}</Text>
          ))}
        </Box>

        <LessonLimits limits={SINES_LIMITS} />

        <Box>
          <Title order={5}>Sources</Title>
          <PanTable>
            <Table.Tbody>
              {SOURCES.map((s) => (
                <Table.Tr key={s.short}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}><b>{s.short}</b></Table.Td>
                  <Table.Td>{s.cite}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4}>
            Pages are printed pages, except where "PDF p." is written.
            Quotations from Portuguese and Spanish documents are given in the
            original with an English translation; the translations are this
            page's.
          </Text>
        </Box>

        <Text size="sm">
            Next:{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("front-end-loading")}>
              Front-End Loading
            </Anchor>{" "}(the stage gates warning 8 is about) and{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("route-screening")}>
              Screening routes to a product
            </Anchor>{" "}(the gross margin as the first filter).
        </Text>
      </Stack>
    </Box>
  );
}
