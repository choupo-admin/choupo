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
  PatentExpiryTool -- "Patent expiry and generic entry" (commission C195).

  THE TASK (CLAUDE.md section 10): the student of a pharmaceutical plant
  group declares the originator's sales and the loss-of-exclusivity date, the
  rivals and the erosion curves, and reads the volume and price per year the
  plant would see, the pair the case's economics can hold (`rampUp`, one
  `price`), and what late entry or deeper erosion does to the revenue.

  NO ENGINE RUN.  The arithmetic is patentExpiryMath.ts (React-free, held by
  tests/patentExpiry.test.ts); this file draws it.  Every curve point carries
  an origin word, and a point the student edits becomes `assumed`.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Button, Group, NumberInput, SegmentedControl,
  Stack, Table, Text, TextInput, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  PATENT_LIMITS, PATENT_NOT_ADVICE, PATENT_QUIZ, PATENT_STEPS,
} from "./patentExpiryLesson.js";
import {
  PATENT_SOURCES, addMonthsIso, defaultInputs, originatorVolume,
  pasteBlock, runModel, scenarios, type DeclaredCurve, type PatentInputs,
  type PriceMode,
} from "./patentExpiryMath.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(PATENT_STEPS);

export const DEEPER_FACTOR_DEFAULT = 0.5;

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const TEXTC = "var(--mantine-color-text)";
const BLUE = "#1971c2";
const ORANGE = "#e8590c";

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

const fmt = (x: number, p = 2): string => (Number.isFinite(x) ? x.toFixed(p) : "—");
const fmtM = (x: number, p = 2): string => fmt(x / 1e6, p);

// ---- A small line chart (SVG) ---------------------------------------------

interface Series { label: string; color: string; xs: number[]; ys: number[]; dashed?: boolean; }

function LineChart({ series, xLabel, yLabel, yMax, caption, id }: {
  series: Series[]; xLabel: string; yLabel: string; yMax?: number;
  caption: string; id: string;
}): JSX.Element {
  const W = 520, H = 230, ML = 52, MR = 14, MT = 12, MB = 40;
  const xs = series.flatMap((s) => s.xs);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const top = yMax ?? Math.max(...series.flatMap((s) => s.ys), 1e-9) * 1.1;
  const sx = (x: number) => ML + ((x - xMin) / Math.max(xMax - xMin, 1e-9)) * (W - ML - MR);
  const sy = (y: number) => H - MB - (y / top) * (H - MT - MB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  return (
    <Box data-chart={id} style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={caption}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={ML} x2={W - MR} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={0.6} />
            <text x={ML - 5} y={sy(t) + 3} textAnchor="end" fontSize={9} fill={INK}>
              {t >= 100 ? t.toFixed(0) : t.toFixed(2)}
            </text>
          </g>
        ))}
        {Array.from(new Set(xs)).sort((a, b) => a - b).map((x) => (
          <text key={x} x={sx(x)} y={H - MB + 13} textAnchor="middle" fontSize={9} fill={INK}>{x}</text>
        ))}
        <text x={(ML + W - MR) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={TEXTC}>{xLabel}</text>
        <text x={12} y={(MT + H - MB) / 2} fontSize={10} fill={TEXTC} textAnchor="middle"
          transform={`rotate(-90 12 ${(MT + H - MB) / 2})`}>{yLabel}</text>
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth={2}
              strokeDasharray={s.dashed ? "5 3" : undefined}
              points={s.xs.map((x, i) => `${sx(x)},${sy(s.ys[i] ?? 0)}`).join(" ")} />
            {s.xs.map((x, i) => <circle key={i} cx={sx(x)} cy={sy(s.ys[i] ?? 0)} r={2.4} fill={s.color} />)}
          </g>
        ))}
      </svg>
      <Group gap="md" mt={2}>
        {series.map((s) => (
          <Text key={s.label} size="xs" c="dimmed">
            <span style={{ color: s.color, fontWeight: 700 }}>{s.dashed ? "- - " : "— "}</span>{s.label}
          </Text>
        ))}
      </Group>
    </Box>
  );
}

// ---- The editable curve tables ---------------------------------------------

function CurveEditor({ curve, onEdit, active }: {
  curve: DeclaredCurve; onEdit: (idx: number, y: number) => void; active: boolean;
}): JSX.Element {
  return (
    <Box data-curve={curve.id} data-curve-active={active ? "yes" : "no"}>
      <Text size="sm" fw={600}>{curve.label}</Text>
      <Text size="xs" c="dimmed">Source: {curve.source}.{active ? "" : " (not driving the result under the current price mode)"}</Text>
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{curve.xLabel}</Table.Th>
            <Table.Th>{curve.yLabel}</Table.Th>
            <Table.Th>origin</Table.Th>
            <Table.Th>why</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {curve.points.map((p, i) => (
            <Table.Tr key={p.x} data-curve-point={`${curve.id}:${p.x}`} data-point-origin={p.origin}>
              <Table.Td>{p.x}</Table.Td>
              <Table.Td>
                <NumberInput size="xs" value={Number(p.y.toFixed(4))} step={0.01} min={0}
                  decimalScale={4} w={90} aria-label={`${curve.id} at ${p.x}`}
                  onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) onEdit(i, v); }} />
              </Table.Td>
              <Table.Td>
                <Badge size="sm" variant={p.origin === "stated" ? "filled" : "light"}
                  color={p.origin === "stated" ? "teal" : "orange"}>{p.origin}</Badge>
              </Table.Td>
              <Table.Td>{p.note}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

export function PatentExpiryTool(): JSX.Element {
  const [inp, setInp] = useState<PatentInputs>(defaultInputs());
  const [deeper, setDeeper] = useState(DEEPER_FACTOR_DEFAULT);

  const sum = useMemo(() => runModel(inp), [inp]);
  const scen = useMemo(() => scenarios(inp, deeper), [inp, deeper]);
  const firstEntry = addMonthsIso(inp.loeDate, inp.entryLagMonths);
  const launch = firstEntry ? addMonthsIso(firstEntry, 12 * inp.delayYears) : null;
  const v0 = originatorVolume(inp);

  const set = <K extends keyof PatentInputs>(k: K, v: PatentInputs[K]) => setInp({ ...inp, [k]: v });
  const num = (k: keyof PatentInputs, label: string, opts: { step?: number; min?: number; unit?: string; w?: number } = {}) => (
    <NumberInput size="xs" label={label} description={opts.unit}
      value={inp[k] as number} min={opts.min ?? 0} step={opts.step ?? 1} w={opts.w ?? 150}
      onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) set(k, v as never); }} />
  );
  const editCurve = (id: DeclaredCurve["id"], idx: number, y: number) =>
    setInp({
      ...inp,
      curves: inp.curves.map((c) => c.id !== id ? c : {
        ...c,
        points: c.points.map((p, i) => i !== idx ? p : {
          ...p, y, origin: "assumed", note: "edited on this page by you; the value is yours, not the study's",
        }),
      }),
    });
  const curve = (id: DeclaredCurve["id"]) => inp.curves.find((c) => c.id === id)!;
  const drives = (id: DeclaredCurve["id"]) =>
    id === "priceByCompetitors" ? inp.priceMode === "byCompetitors"
      : id === "priceByTime" ? inp.priceMode === "byTime" : true;

  const yearsAxis = sum.rows.map((r) => r.j);
  const base = scen[0]!.summary;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Patent expiry and generic entry</Title>
          <Text size="sm" c="dimmed" mt={4}>
            For a group designing a generic tablet plant: what volume and
            what price per year the plant will see after the originator
            loses exclusivity, the numbers the case&apos;s economics can
            read from them, and what a late entry or a deeper price fall
            does to the revenue.  Defaults are the apalutamide01_tablets
            business case; the curves are yours to edit.
          </Text>
          <Alert mt="sm" color="yellow" variant="light"
            title="Not a freedom-to-operate analysis" data-not-fto="">
            {PATENT_NOT_ADVICE}
          </Alert>
          <Text size="xs" c="dimmed" mt={6} data-honest-limit="curves">
            Every curve point below says whether a published study states
            it (<b>stated</b>) or the page interpolated, extended or chose
            it (<b>assumed</b>); the sensitivities are readings, not
            predictions.
          </Text>
        </Box>

        {step(1)}
        {step(2)}

        <Box data-panel="inputs">
          <Title order={5}>The market you declare</Title>
          <OriginMark of={["reference", "assumption"]}
            note="defaults: the apalutamide dossier, sections 3.2-3.3 (derived from estimates); yours to replace" />
          <Group mt={6} align="flex-end" gap="md" wrap="wrap">
            {num("salesMEUR", "Originator net sales", { unit: "million EUR / yr", step: 10 })}
            {num("originatorPrice", "Originator net price", { unit: "EUR / tablet", step: 0.5 })}
            <TextInput size="xs" label="Loss of exclusivity (YYYY-MM-DD)" w={190}
              value={inp.loeDate} onChange={(e) => set("loeDate", e.currentTarget.value)}
              description="assumed: a US patent's anticipated expiry" />
            {num("entryLagMonths", "First generic entry after it", { unit: "months (EC 2009: >7 on average)", step: 1, w: 190 })}
            {num("delayYears", "Your plant launches after the first entry", { unit: "years", step: 1, w: 200 })}
          </Group>
          <Group mt={6} align="flex-end" gap="md" wrap="wrap">
            {num("projectLife", "Project life", { unit: "operating years (the case's projectLife)", step: 1, w: 200 })}
            {num("discountRate", "Discount rate", { unit: "per year (the case's discountRate)", step: 0.01 })}
            {num("tabletMassG", "Packaged tablet mass", { unit: "g (the case's run)", step: 0.01 })}
            {num("capacityMTablets", "Design production Q", { unit: "million tablets / yr", step: 0.5 })}
          </Group>
          {launch === null && (
            <Text size="xs" c="red" mt={4}>
              Write the loss-of-exclusivity date as YYYY-MM-DD, for example 2035-12-03.
            </Text>
          )}
          <Text size="sm" mt={6} data-derived="dates">
            Volume of the molecule before exclusivity ends:{" "}
            <b>{fmtM(v0)} million tablets a year</b>.  First generic entry:{" "}
            <b>{firstEntry ?? "—"}</b>.  Your launch (year 0 of the cash flow):{" "}
            <b>{launch ?? "—"}</b>.
          </Text>
        </Box>

        {step(3)}
        {step(4)}

        <Box data-panel="price-curves">
          <Title order={5}>Price erosion</Title>
          <OriginMark of={["reference", "assumption"]}
            note="stated points: Conrad and Lutter, FDA 2019, p. 2; EC sector inquiry fact sheet, p. 1; the rest assumed" />
          <Group mt={6} gap="sm" align="center">
            <Text size="sm">Index the price by</Text>
            <SegmentedControl size="xs" value={inp.priceMode}
              onChange={(v) => set("priceMode", v as PriceMode)}
              data={[
                { value: "byCompetitors", label: "number of producers (US, FDA)" },
                { value: "byTime", label: "years since first entry (EU, EC)" },
              ]} />
            <Button size="xs" variant="subtle" onClick={() => { setInp(defaultInputs()); setDeeper(DEEPER_FACTOR_DEFAULT); }}>
              Reset all to the defaults
            </Button>
          </Group>
          <LineChart id="price-curves" caption="Generic price ratio, two readings"
            xLabel="producers (solid) or years since first entry (dashed)"
            yLabel="price / originator's pre-LoE price" yMax={1}
            series={[
              { label: "by number of producers (FDA)", color: BLUE,
                xs: curve("priceByCompetitors").points.map((p) => p.x),
                ys: curve("priceByCompetitors").points.map((p) => p.y) },
              { label: "by years since first entry (EC)", color: ORANGE, dashed: true,
                xs: curve("priceByTime").points.map((p) => p.x),
                ys: curve("priceByTime").points.map((p) => p.y) },
            ]} />
          <Stack gap="sm" mt="sm">
            <CurveEditor curve={curve("priceByCompetitors")} active={drives("priceByCompetitors")}
              onEdit={(i, y) => editCurve("priceByCompetitors", i, y)} />
            <CurveEditor curve={curve("priceByTime")} active={drives("priceByTime")}
              onEdit={(i, y) => editCurve("priceByTime", i, y)} />
          </Stack>
        </Box>

        {step(5)}

        <Box data-panel="volume-curves">
          <Title order={5}>Volume: the generics&apos; share, the rivals, the newcomer&apos;s split</Title>
          <OriginMark of={["reference", "assumption"]}
            note="generic share: EC fact sheet p. 2 for years 1-2, the rest assumed; rivals and split: assumed, no source" />
          <LineChart id="share-curve" caption="Cumulative generic share of the molecule's volume"
            xLabel="years since first generic entry (end of year)" yLabel="generic share" yMax={1}
            series={[{ label: "cumulative generic share G", color: BLUE,
              xs: curve("genericShare").points.map((p) => p.x),
              ys: curve("genericShare").points.map((p) => p.y) }]} />
          <Stack gap="sm" mt="sm">
            <CurveEditor curve={curve("genericShare")} active
              onEdit={(i, y) => editCurve("genericShare", i, y)} />
            <CurveEditor curve={curve("rivals")} active
              onEdit={(i, y) => editCurve("rivals", i, y)} />
            <CurveEditor curve={curve("newcomerShare")} active
              onEdit={(i, y) => editCurve("newcomerShare", i, y)} />
          </Stack>
        </Box>

        <Box data-panel="result">
          <Title order={5}>What the market gives your plant, year by year</Title>
          <OriginMark of={["page", "assumption"]}
            note="computed on this page from the curves above; not a forecast" />
          <Group align="flex-start" gap="lg" mt={6} wrap="wrap">
            <LineChart id="volume-chart" caption="Tablets sold per year"
              xLabel="operating year" yLabel="million tablets / yr"
              series={[
                { label: "sold", color: BLUE, xs: yearsAxis, ys: sum.rows.map((r) => r.soldTablets / 1e6) },
                { label: "design production Q", color: INK, dashed: true, xs: yearsAxis,
                  ys: yearsAxis.map(() => inp.capacityMTablets) },
              ]} />
            <LineChart id="price-chart" caption="Net ex-factory price per tablet"
              xLabel="operating year" yLabel="EUR / tablet"
              series={[{ label: "generic price", color: ORANGE, xs: yearsAxis, ys: sum.rows.map((r) => r.price) }]} />
          </Group>
          <PanTable>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>op. year j</Table.Th>
                <Table.Th>market year k</Table.Th>
                <Table.Th>producers n</Table.Th>
                <Table.Th>generic share g</Table.Th>
                <Table.Th>newcomer share w</Table.Th>
                <Table.Th>price ratio</Table.Th>
                <Table.Th>sold (M tablets)</Table.Th>
                <Table.Th>sold (t)</Table.Th>
                <Table.Th>EUR / tablet</Table.Th>
                <Table.Th>EUR / kg</Table.Th>
                <Table.Th>revenue (M EUR)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sum.rows.map((r) => (
                <Table.Tr key={r.j} data-year-row={r.j}>
                  <Table.Td>{r.j}</Table.Td>
                  <Table.Td>{r.k}</Table.Td>
                  <Table.Td>{r.n}</Table.Td>
                  <Table.Td>{fmt(r.genericShare, 3)}</Table.Td>
                  <Table.Td>{fmt(r.newcomerShare, 3)}</Table.Td>
                  <Table.Td>{fmt(r.priceRatio, 3)}</Table.Td>
                  <Table.Td>{fmtM(r.soldTablets)}{r.capped ? " (at Q)" : ""}</Table.Td>
                  <Table.Td>{fmt(r.soldKg / 1000, 1)}</Table.Td>
                  <Table.Td>{fmt(r.price, 3)}</Table.Td>
                  <Table.Td>{fmt(r.pricePerKg, 0)}</Table.Td>
                  <Table.Td>{fmt(r.revenueMEUR, 2)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4} data-share-note="">
            At the end of the table the newcomer holds{" "}
            {fmt(100 * (sum.rows[sum.rows.length - 1]?.soldTablets ?? 0) / v0, 1)} % of the
            molecule&apos;s volume; the apalutamide case declares a 25 % market
            share (dossier 4.1, an estimate) and produces {fmt(inp.capacityMTablets, 1)} million
            tablets a year from the first year, which is {fmt(100 * inp.capacityMTablets * 1e6 / v0, 1)} %
            of this page&apos;s volume V<sub>0</sub>.
          </Text>
        </Box>

        {step(6)}

        <Box data-panel="sensitivity">
          <Title order={5}>Late by one or two years, or a deeper fall: each moved alone</Title>
          <OriginMark of={["page", "assumption"]}
            note="the same curves, one thing moved at a time; a reading, not a prediction" />
          <Group mt={6} align="flex-end">
            <NumberInput size="xs" label="Deeper erosion: price ratio multiplied by"
              description="assumed stress; 0.5 = prices half the curve's" value={deeper}
              min={0.05} max={1} step={0.05} decimalScale={2} w={230}
              onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) setDeeper(v); }} />
          </Group>
          <PanTable>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>scenario</Table.Th>
                <Table.Th>PV of revenue at your launch (M EUR)</Table.Th>
                <Table.Th>PV at the first generic entry (M EUR)</Table.Th>
                <Table.Th>change vs as declared</Table.Th>
                <Table.Th>mean volume (M tablets / yr)</Table.Th>
                <Table.Th>price p* (EUR / tablet)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scen.map((s) => (
                <Table.Tr key={s.id} data-scenario={s.id}>
                  <Table.Td>{s.label}</Table.Td>
                  <Table.Td>{fmt(s.summary.pvRevenueMEUR, 1)}</Table.Td>
                  <Table.Td>{fmt(s.summary.pvAtFirstEntryMEUR, 1)}</Table.Td>
                  <Table.Td>{s.id === "base" ? "—" : `${fmt(s.pvChangePct, 1)} %`}</Table.Td>
                  <Table.Td>{fmtM(s.summary.meanTablets)}</Table.Td>
                  <Table.Td>{fmt(s.summary.pasteTabletPrice, 3)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4}>
            The case&apos;s NPV is taken at the launch, so a late entrant looks
            almost unchanged in the first column and is worse off in the second:
            both are shown because both are what a reader may compare.
          </Text>
        </Box>

        {step(7)}

        <Box data-panel="paste">
          <Title order={5}>What the case&apos;s economics reads</Title>
          <OriginMark of={["page", "assumption"]}
            note="rampUp and price from the table above, for the discount rate and tablet mass you declared" />
          <Text size="sm" mt={4} data-paste-summary="">
            Mean volume <b>{fmtM(base.meanTablets)} million tablets a year</b>;
            revenue <b>{fmt(base.totalRevenueMEUR, 1)} M EUR</b> over {inp.projectLife} years
            ({fmt(base.pvRevenueMEUR, 1)} M EUR in present value at the launch);
            simple average price <b>{fmt(base.meanPrice, 3)} EUR a tablet</b>;
            discounted-volume-weighted price p* <b>{fmt(base.pasteTabletPrice, 3)} EUR a
            tablet = {fmt(base.pastePricePerKg, 1)} EUR/kg</b> of packagedTablets.
          </Text>
          <Box component="pre" data-paste-block="" mt={6} p="xs"
            style={{ overflowX: "auto", fontSize: 12, border: `1px solid ${GRID}`, borderRadius: 4 }}>
            {pasteBlock(inp, base)}
          </Box>
          <Text size="xs" c="dimmed" mt={4}>
            The case&apos;s own keys: <code>rampUp</code> in{" "}
            <code>system/postDict</code> economics, <code>production perYear</code> in
            its batchPlan, <code>price</code> in <code>constant/economics</code>.
            Beside <code>streamFactor fromBatchPlan</code> the ramp scales revenue
            and variable costs; the working capital does not follow it.
          </Text>
        </Box>

        {step(8)}

        <LessonQuiz title="Check your understanding" questions={PATENT_QUIZ} lesson={PATENT_STEPS} />

        <LessonLimits limits={PATENT_LIMITS} />

        <Box data-panel="sources">
          <Title order={5}>Sources: what was read, and where</Title>
          <OriginMark of="reference" note="every stated point above comes from the first two" />
          <PanTable>
            <Table.Tbody>
              {PATENT_SOURCES.map((s) => (
                <Table.Tr key={s.short} data-source={s.short}>
                  <Table.Td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}><b>{s.short}</b></Table.Td>
                  <Table.Td>
                    <Text size="xs">{s.cite}</Text>
                    <Text size="xs" c="dimmed">Read: {s.read}.</Text>
                    <Anchor href={s.url} target="_blank" rel="noopener noreferrer" size="xs"
                      style={{ overflowWrap: "anywhere" }}>{s.url}</Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4}>
            Both published studies were read online on 2026-11-01.
          </Text>
        </Box>

        <Text size="sm">
          Next:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("ip-strategy")}>
            Intellectual property as competitive strategy
          </Anchor>{" "}(how patents are used and defeated) and{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("front-end-loading")}>
            Front-End Loading
          </Anchor>{" "}(where the market study sits in a project).
        </Text>

        <LessonReferences tool="patent-expiry" />
      </Stack>
    </Box>
  );
}
