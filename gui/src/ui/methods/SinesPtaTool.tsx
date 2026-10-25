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
  SinesPtaTool -- "Economic appraisal and project risk: lessons from the
  Sines PTA plant" (DEV.md 4c C143).

  A NOTES page with ONE interactive: a simplified, pre-tax, unfinanced
  discounted cash flow the student moves, with its break-even spread, NPV
  against the spread, and a tornado.  NO ENGINE RUN, and that is the
  subject rather than an omission: the case is about the economic analysis
  that decides whether a simulation is worth building at all.

  FOUR KINDS OF STATEMENT, told apart in ink AND in words on every table and
  beside every result: documented, attributed conclusion, own calculation,
  assumption (sinesPta.ts `Status`).  The notice that the calculator is an
  illustrative teaching scenario sits IMMEDIATELY beside its results, not
  only in the limits at the end; tests/sinesPta.test.ts holds that.

  THE FACTS are in sinesPta.ts and the prose in sinesPtaLesson.ts, both
  React-free, both from one record (docs/design/the-sines-pta-plant-
  appraisal-and-project-risk.md) and both held by tests/sinesPta.test.ts.

  THE TWO LINE COLOURS are Mantine blue-6 (#228be6) and orange-8 (#e8590c),
  the pair the Front-End Loading page validated, re-run here with the
  dataviz palette validator against the Plotly chrome of BOTH schemes
  (#ffffff and #1f1f1f): every check PASSES in both (lightness band, chroma,
  CVD separation 27.7, normal-vision 34.5, contrast >= 3:1).  The second
  line is ALSO dashed and both are named in the legend, so identity is never
  colour alone.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Anchor, Badge, Box, Group, Paper, Stack, Table, Text, Title,
} from "@mantine/core";

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "../plotting/plotly.js";
import { TornadoPlot } from "../plotting/TornadoPlot.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import {
  SINES_CHECKLIST, SINES_INSTITUTIONAL_NOTE, SINES_LIMITS, SINES_MARKET_QUOTES,
  SINES_PURPOSE, SINES_RISKS, SINES_SCOPE, SINES_STEPS, SINES_TITLE,
  type Quote, type Recorded, type RiskCard,
} from "./sinesPtaLesson.js";
import {
  APPRAISAL_INPUTS, CAPEX_HISTORY, DEFAULT_APPRAISAL, IVL_REPORT_URLS,
  LOSS_METRICS, PERIOD_WORD, PUBLISHED_SPREADS, SCENARIO_NOTICE, SOURCES,
  STATUS_MEANING, STATUS_WORD, TIMELINE, appraise, breakEvenSpread, fmtMoney,
  npvCurve, offtakeRows, tornadoFigure, type Appraisal, type Period,
  type Status,
} from "./sinesPta.js";
import { setActiveMethodTool } from "./registry.js";

const HUE_A = "#228be6";
const HUE_B = "#e8590c";

const step = lessonStepper(SINES_STEPS);

const STATUS_COLOR: Record<Status, string> = {
  documented: "teal", attributed: "violet", calculation: "blue",
  assumption: "orange",
};

const fx = (v: number, d = 1): string =>
  Number.isFinite(v) ? v.toFixed(d).replace("-", "−") : "—";

/** The status of a number, in ink and in words. */
function StatusBadge({ status }: { status: Status }): JSX.Element {
  return (
    <Badge size="xs" variant="light" color={STATUS_COLOR[status]}
      data-status={status} style={{ whiteSpace: "nowrap" }}>
      {STATUS_WORD[status]}
    </Badge>
  );
}

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

/** How to read the page: the four kinds of statement. */
function StatusLegend(): JSX.Element {
  const all: Status[] = ["documented", "attributed", "calculation", "assumption"];
  return (
    <Paper withBorder p="xs" radius="sm">
      <Text size="sm" fw={600}>How to read this page</Text>
      <Text size="xs" mt={2}>
        Every number and statement is one of four kinds, marked with its word:
      </Text>
      <Box component="ul" style={{ margin: "4px 0 0 0", paddingLeft: 20 }}>
        {all.map((s) => (
          <Text component="li" size="xs" key={s} mb={2}>
            <StatusBadge status={s} /> {STATUS_MEANING[s]}.
          </Text>
        ))}
      </Box>
      <Text size="xs" mt={4}>
        And every documented fact says when it is from, because information
        that came during construction or afterwards was not available at the
        decision: {(Object.keys(PERIOD_WORD) as Period[])
          .map((p) => PERIOD_WORD[p]).join("; ")}.
      </Text>
      <Text size="xs" mt={4}>
        Interpretations are written as readings ("one possible reading"),
        never as facts, and a link between a risk, a
        decision and an outcome is stated only where a document states it.
      </Text>
    </Paper>
  );
}

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
            <StatusBadge status={inp.status} />
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
    { s: 87, label: "Asia 2014: 87 (later)" },
    { s: 163, label: "Asia 5-yr avg to 2014: 163 (later)" },
    { s: 231, label: "West index 2014: 231 (later)" },
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
          title: { text: "NPV against a constant spread: illustrative teaching scenario",
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
    <Box data-testid="sines-appraisal">
      <Title order={5}>A simplified appraisal for teaching</Title>
      <Paper withBorder p="xs" radius="sm" mt={6} data-testid="sines-results"
        style={{ borderLeft: "4px solid var(--mantine-color-orange-6)" }}>
        <Text size="sm" fw={600} data-testid="scenario-notice">{SCENARIO_NOTICE}</Text>
        <Group gap="xs" mt={6} wrap="wrap">
          <Badge size="lg" variant="light" color={r.npv >= 0 ? "teal" : "red"}>
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
        <Group gap={6} mt={6} wrap="wrap">
          <StatusBadge status="calculation" />
          <Text size="xs">
            on the inputs below, of which two are documented and the rest are
            assumptions.  Pre-tax and unfinanced: it cannot say whether the
            project could service its debt.
          </Text>
        </Group>
      </Paper>
      <Text size="sm" mt={10} fw={600}>The inputs</Text>
      <Text size="xs" mt={2}>
        Move any input.  The word under each says whether its default is
        documented or an assumption; the line under it says where it comes
        from, and when.
      </Text>
      <Box mt={8}><InputGrid a={a} set={set} /></Box>
      <Box mt={10}><NpvSpreadChart a={a} /></Box>
      <Text size="xs" c="dimmed">
        Dotted verticals: three of IVL's published spreads, all of them later
        information (published 2015 on) and none of them the Sines plant's
        own; the West figure is a 50:50 North America : Europe index.  Solid
        line: the NPV with every input as set; dashed: the same with the
        captive customer stopping after operating year 2 (drawn only while
        your own setting is a later year or never).  Diamond: the constant
        break-even spread.
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
        The year table, like every result above, is this page's calculation on
        the inputs as set.  No public document gives the business plan's
        conversion cost, fixed costs, assumed spread, discount rate or cash
        flows.  Not modelled: taxes and depreciation, financing and debt
        service, working capital, receivables, and any cost of a delay.  The
        tornado writes its NPVs in EUR, so that {fmtMoney(-1.5e8)} reads
        minus EUR 150 million.
      </PanelNote>
    </Box>
  );
}

// ---- the risk cards --------------------------------------------------------

function RecordedView({ label, rec }: { label: string; rec: Recorded | null }): JSX.Element {
  return (
    <Box mt={6}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">{label}</Text>
      {rec === null ? (
        <Text size="xs">None recorded in the passages read.</Text>
      ) : (
        <>
          {rec.when !== "—" && <Text size="xs" c="dimmed">{rec.when}</Text>}
          {rec.quotes.map((q) => <QuoteView key={q.original} q={q} />)}
          {rec.note && <Text size="xs">{rec.note}</Text>}
        </>
      )}
    </Box>
  );
}

function RiskCardView({ c }: { c: RiskCard }): JSX.Element {
  return (
    <Paper withBorder p="xs" radius="sm" data-risk={c.n}>
      <Text size="sm" fw={700}>{c.n}. {c.title}</Text>
      <RecordedView label="Risk identified" rec={c.identified} />
      <RecordedView label="Condition recommended" rec={c.condition} />
      <RecordedView label="What the documents record about the decision" rec={c.decision} />
      <Box mt={6}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Later (later information)</Text>
        <Text size="xs">{c.later}</Text>
      </Box>
      <Box mt={6}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          The corresponding appraisal concept
        </Text>
        <Text size="sm">{c.concept}</Text>
      </Box>
    </Paper>
  );
}

// ---- the page --------------------------------------------------------------

export function SinesPtaTool(): JSX.Element {
  const offtake = offtakeRows();
  const periods = Object.keys(PERIOD_WORD) as Period[];
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>{SINES_TITLE}</Title>
          <Text size="sm" mt={4}>{SINES_PURPOSE}</Text>
          <Text size="sm" c="dimmed" mt={4}>{SINES_SCOPE}  Every fact carries
            its primary source and page; the documents are listed, with what
            each one is and a public link, at the end of the page.</Text>
          <Text size="xs" c="dimmed" mt={4} data-testid="institutional-note">
            {SINES_INSTITUTIONAL_NOTE}
          </Text>
        </Box>

        <StatusLegend />

        {step(1)}
        {step(2)}
        {step(3)}

        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>when</Table.Th><Table.Th>perimeter, as the document stated it</Table.Th>
              <Table.Th>EUR M</Table.Th><Table.Th>status</Table.Th>
              <Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CAPEX_HISTORY.map((c) => (
              <Table.Tr key={`${c.when}-${c.value}`}>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{c.when}</Table.Td>
                <Table.Td>{c.perimeter}</Table.Td>
                <Table.Td>{c.value}</Table.Td>
                <Table.Td><StatusBadge status={c.status} /></Table.Td>
                <Table.Td>{c.source}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
        <Text size="xs" c="dimmed">
          Different perimeters: compare each value only with its own
          definition.  The page draws no ratio between them.
        </Text>

        {step(4)}

        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>quantity</Table.Th><Table.Th>kt/yr</Table.Th>
              <Table.Th>status</Table.Th><Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {offtake.map((o) => (
              <Table.Tr key={o.quantity}>
                <Table.Td>{o.quantity}</Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{o.value}</Table.Td>
                <Table.Td><StatusBadge status={o.status} /></Table.Td>
                <Table.Td>{o.source}</Table.Td>
              </Table.Tr>
            ))}
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
              <Table.Th>West PTA index, 50:50 North America : Europe [US$/t]</Table.Th>
              <Table.Th>published in</Table.Th>
              <Table.Th>status</Table.Th><Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {PUBLISHED_SPREADS.map((r) => (
              <Table.Tr key={r.year}>
                <Table.Td>{r.year}</Table.Td><Table.Td>{r.asia}</Table.Td>
                <Table.Td>{r.west ?? "—"}</Table.Td>
                <Table.Td>IVL {r.published}</Table.Td>
                <Table.Td><StatusBadge status={r.status} /></Table.Td>
                <Table.Td>{r.source}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </PanTable>
        <Text size="xs" c="dimmed">
          IVL's "industry spread": selling price less raw-material
          consumption.  Later information, all of it: none of these figures
          was available at the 2007-2008 decision, and none is the Sines
          plant's realised spread.  For retrospective scenarios only.
        </Text>
        <Box>
          {SINES_MARKET_QUOTES.map((q) => <QuoteView key={q.original} q={q} />)}
        </Box>

        {step(8)}
        <Box style={{ display: "grid", gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
          {SINES_RISKS.map((c) => <RiskCardView key={c.n} c={c} />)}
        </Box>

        {step(9)}
        {periods.map((p) => {
          const rows = TIMELINE.filter((t) => t.period === p);
          if (rows.length === 0) return null;
          return (
            <Box key={p}>
              <Text size="sm" fw={600}>{PERIOD_WORD[p]}</Text>
              <PanTable>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>when</Table.Th><Table.Th>what the documents record</Table.Th>
                    <Table.Th>status</Table.Th><Table.Th>source</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((t) => (
                    <Table.Tr key={t.when + t.event}>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{t.when}</Table.Td>
                      <Table.Td>{t.event}</Table.Td>
                      <Table.Td><StatusBadge status={t.status} /></Table.Td>
                      <Table.Td>{t.source}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </PanTable>
            </Box>
          );
        })}

        {step(10)}
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>metric</Table.Th><Table.Th>what kind of number</Table.Th>
              <Table.Th>what it measures</Table.Th>
              <Table.Th>value</Table.Th><Table.Th>status</Table.Th>
              <Table.Th>source</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {LOSS_METRICS.map((m) => (
              <Table.Tr key={m.metric}>
                <Table.Td><b>{m.metric}</b></Table.Td><Table.Td>{m.kind}</Table.Td>
                <Table.Td>{m.definition}</Table.Td>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{m.value}</Table.Td>
                <Table.Td><StatusBadge status={m.status} /></Table.Td>
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
          <Title order={5}>Sources: what each document is, and where to read it</Title>
          <PanTable>
            <Table.Tbody>
              {SOURCES.map((s) => (
                <Table.Tr key={s.short}>
                  <Table.Td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                    <b>{s.short}</b>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{s.cite}</Text>
                    <Text size="xs" c="dimmed">{s.nature}.</Text>
                    {s.short.startsWith("IVL-AR") ? (
                      <Text size="xs">
                        {Object.entries(IVL_REPORT_URLS).map(([k, u], i) => (
                          <span key={k}>{i > 0 && " · "}
                            <Anchor href={u} target="_blank" rel="noopener noreferrer"
                              size="xs">{k}</Anchor>
                          </span>
                        ))}
                      </Text>
                    ) : (
                      <Anchor href={s.url} target="_blank" rel="noopener noreferrer"
                        size="xs" style={{ overflowWrap: "anywhere" }}>
                        open the document
                      </Anchor>
                    )}
                  </Table.Td>
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
            </Anchor>{" "}(the stage gates of card 8) and{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("route-screening")}>
              Screening routes to a product
            </Anchor>{" "}(the gross margin as the first filter).
        </Text>
      </Stack>
    </Box>
  );
}
