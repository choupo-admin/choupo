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
  DemandForecastTool -- "Demand forecast for a drug product" (commission
  C210, synthesis item E8).

  THE TASK (CLAUDE.md section 10): the student of a pharmaceutical plant
  group puts a yearly volume under the plant's economics.  They enter a
  historic series, say its unit and the unit they want, read three forecasts
  side by side with each one's assumption, see the capacity factor and the
  sold quantity against the market, and copy the rampUp list and the design
  production the case's economics reads.

  NO ENGINE RUN.  The arithmetic is demandForecastMath.ts (React-free, held
  by tests/demandForecast.test.ts).  The default series and factors are an
  invented illustration, labelled as one.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Badge, Box, Checkbox, Group, NativeSelect, NumberInput,
  SegmentedControl, Stack, Table, Text, Textarea, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { DEMAND_LIMITS, DEMAND_QUIZ, DEMAND_STEPS } from "./demandForecastLesson.js";
import {
  SCALE_FACTOR, dddReconciliation, designKgPerYear, forecast, pasteBlock,
  scaleWarnings, unitsCheck,
  type DddInputs, type Forecast, type ForecastInputs, type MethodId,
  type Penetration, type Scale, type SeriesKind,
} from "./demandForecastMath.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(DEMAND_STEPS);

const f = (x: number, p = 2): string => (Number.isFinite(x) ? x.toFixed(p) : "—");
const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXTC = "var(--mantine-color-text)";
const METHOD_COLOR: Record<MethodId, string> = { trend: "#1971c2", ddd: "#2f9e44", penetration: "#e8590c" };
const METHOD_LABEL: Record<MethodId, string> = {
  trend: "A  trend regression", ddd: "B  DDD x prevalence", penetration: "C  penetration curve",
};

export const DEFAULT_SERIES = [
  "2016 5200", "2017 5410", "2018 5630", "2019 5790", "2020 6010",
  "2021 6180", "2022 6390", "2023 6540", "2024 6760", "2025 6930",
].join("\n");

export function parseSeries(text: string): { years: number[]; values: number[]; bad: string[] } {
  const years: number[] = [], values: number[] = [], bad: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "") continue;
    const parts = t.split(/[\s,;]+/);
    const y = Number(parts[0]), v = Number(parts[1]);
    if (parts.length !== 2 || !Number.isFinite(y) || !Number.isFinite(v)) bad.push(t);
    else { years.push(y); values.push(v); }
  }
  return { years, values, bad };
}

interface Series { label: string; color: string; xs: number[]; ys: number[]; dashed?: boolean; }
interface Band { xs: number[]; lo: number[]; hi: number[]; color: string; }

function LineChart({ series, bands = [], xLabel, yLabel, id, caption }: {
  series: Series[]; bands?: Band[]; xLabel: string; yLabel: string; id: string; caption: string;
}): JSX.Element {
  const W = 520, H = 240, ML = 56, MR = 14, MT = 12, MB = 40;
  const xs = series.flatMap((s) => s.xs);
  const allY = [...series.flatMap((s) => s.ys), ...bands.flatMap((b) => [...b.lo, ...b.hi])];
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const top = Math.max(...allY, 1e-9) * 1.08;
  const sx = (x: number) => ML + ((x - xMin) / Math.max(xMax - xMin, 1e-9)) * (W - ML - MR);
  const sy = (y: number) => H - MB - (y / top) * (H - MT - MB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => q * top);
  const xt = Array.from(new Set(xs)).sort((a, b) => a - b).filter((_, k, a) => k % Math.ceil(a.length / 8) === 0);
  return (
    <Box data-chart={id} style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={caption}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={ML} x2={W - MR} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={0.6} />
            <text x={ML - 5} y={sy(t) + 3} textAnchor="end" fontSize={9} fill={INK}>{t.toFixed(2)}</text>
          </g>
        ))}
        {xt.map((x) => (
          <text key={x} x={sx(x)} y={H - MB + 13} textAnchor="middle" fontSize={9} fill={INK}>{x}</text>
        ))}
        <text x={(ML + W - MR) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={TEXTC}>{xLabel}</text>
        <text x={12} y={(MT + H - MB) / 2} fontSize={10} fill={TEXTC} textAnchor="middle"
          transform={`rotate(-90 12 ${(MT + H - MB) / 2})`}>{yLabel}</text>
        {bands.map((b, k) => (
          <polygon key={k} fill={b.color} opacity={0.15}
            points={[...b.xs.map((x, i) => `${sx(x)},${sy(b.hi[i] ?? 0)}`),
              ...b.xs.map((x, i) => `${sx(x)},${sy(b.lo[i] ?? 0)}`).reverse()].join(" ")} />
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth={2}
              strokeDasharray={s.dashed ? "5 3" : undefined}
              points={s.xs.map((x, k) => `${sx(x)},${sy(s.ys[k] ?? 0)}`).join(" ")} />
            {s.xs.map((x, k) => <circle key={k} cx={sx(x)} cy={sy(s.ys[k] ?? 0)} r={2.2} fill={s.color} />)}
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

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

function Num({ label, value, onChange, unit, step: st = 1, min = 0, w = 140 }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
  step?: number; min?: number; w?: number;
}): JSX.Element {
  return (
    <NumberInput size="xs" label={label} description={unit} value={value} min={min} step={st} w={w}
      onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) onChange(v); }} />
  );
}

const SCALE_OPTS = [
  { value: "", label: "— choose —" },
  { value: "units", label: "units" },
  { value: "thousands", label: "thousands" },
  { value: "millions", label: "millions" },
];

export function DemandForecastTool(): JSX.Element {
  const [text, setText] = useState(DEFAULT_SERIES);
  const [kind, setKind] = useState<SeriesKind>("packs");
  const [seriesScale, setSeriesScale] = useState<Scale | "">("thousands");
  const [answerScale, setAnswerScale] = useState<Scale | "">("millions");
  const [jumpOk, setJumpOk] = useState(false);
  const [dddPerPack, setDddPerPack] = useState(28);
  const [ddd, setDdd] = useState<DddInputs>({
    population: 10.3e6, prevalence: 0.20, treated: 0.60, moleculeShare: 0.50,
    adherence: 0.80, dddPerDay: 1, dddPerPack: 28, growth: 0.02,
  });
  const [pen, setPen] = useState<Penetration>({ sMax: 0.30, jHalf: 3, k: 1.0 });
  const [penBase, setPenBase] = useState<"trend" | "last">("trend");
  const [plant, setPlant] = useState({
    designQ: 2.0, share: 0.25, factor: 1, tabletsPerPack: 28, tabletMassG: 0.5,
    delay: 1, horizon: 10, level: 0.95,
  });
  const [driver, setDriver] = useState<MethodId>("trend");

  const parsed = useMemo(() => parseSeries(text), [text]);
  const sf = seriesScale === "" ? NaN : SCALE_FACTOR[seriesScale];
  const af = answerScale === "" ? NaN : SCALE_FACTOR[answerScale];
  const verdict = useMemo(() => unitsCheck(
    { values: parsed.values, seriesScale, answerScale, jumpConfirmed: jumpOk }, parsed.years),
    [parsed, seriesScale, answerScale, jumpOk]);
  const refusals = [
    ...verdict.refusals,
    ...(parsed.bad.length ? [`Cannot read: ${parsed.bad.join("; ")}. Write one "year value" pair per line.`] : []),
    ...(parsed.years.length < 3 ? ["At least three years are needed to fit a trend."] : []),
  ];
  const ok = refusals.length === 0;

  const setPl = <K extends keyof typeof plant>(k: K, v: (typeof plant)[K]) => setPlant({ ...plant, [k]: v });
  const inp: ForecastInputs | null = ok ? {
    years: parsed.years, values: parsed.values.map((v) => v * sf), kind, dddPerPack,
    delay: plant.delay, horizon: plant.horizon, share: plant.share, factor: plant.factor,
    designPacks: plant.designQ * af, level: plant.level, ddd: { ...ddd, dddPerPack },
    pen, penBase,
  } : null;
  const fcs = useMemo(() => {
    if (!inp) return null;
    const out: Partial<Record<MethodId, Forecast>> = {};
    for (const m of ["trend", "ddd", "penetration"] as const) {
      const r = forecast(m, inp);
      if (r) out[m] = r;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, kind, seriesScale, answerScale, jumpOk, dddPerPack, ddd, pen, penBase, plant]);

  const unitLabel = kind === "DDD" ? "DDD" : "packs";
  const aw = answerScale === "millions" ? "million " : answerScale === "thousands" ? "thousand " : "";
  const show = (x: number) => x / af;
  const lastYear = parsed.years[parsed.years.length - 1] ?? 0;
  const trend = fcs?.trend;
  const chosen = fcs?.[driver];
  const warnings = chosen && inp ? scaleWarnings(inp.designPacks, chosen.meanSoldPacks / Math.max(plant.factor, 1e-12)) : [];

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Demand forecast for a drug product</Title>
          <Text size="sm" c="dimmed" mt={4}>
            For a group that must put a yearly volume under a plant&apos;s
            economics: three forecasts from one history, side by side, the
            units checked, the capacity factor made explicit, and the
            numbers the batch plan&apos;s economics reads.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="A forecast is not a measurement" data-not-measurement="">
            Each method rests on an assumption that no statistic on this
            page tests.  The history below is an invented illustration;
            replace it with a series you can cite.
          </Alert>
        </Box>

        {step(1)}
        {step(2)}

        <Box data-panel="series">
          <Title order={5}>The history and its units</Title>
          <OriginMark of={["page", "assumption"]} note="default series, population and shares are invented illustrations" />
          <Group mt={6} gap="md" align="flex-start" wrap="wrap">
            <Textarea size="xs" label="year and value, one pair per line" value={text} minRows={10}
              autosize w={220} onChange={(e) => setText(e.currentTarget.value)} data-series-input="" />
            <Stack gap="xs">
              <SegmentedControl size="xs" value={kind} onChange={(v) => setKind(v as SeriesKind)}
                data={[{ value: "packs", label: "series is in packs" }, { value: "DDD", label: "series is in DDD" }]} />
              <NativeSelect size="xs" label="Unit of the series" description="scale of the numbers you typed"
                value={seriesScale} data={SCALE_OPTS} w={210}
                onChange={(e) => setSeriesScale(e.currentTarget.value as Scale | "")} />
              <NativeSelect size="xs" label="Unit of the answer" description="scale you want the results in"
                value={answerScale} data={SCALE_OPTS} w={210}
                onChange={(e) => setAnswerScale(e.currentTarget.value as Scale | "")} />
              <Num label="DDD in one pack" unit="DDD / pack" value={dddPerPack} onChange={setDddPerPack} />
              <Checkbox size="xs" label="Confirm a large jump between years is real" checked={jumpOk}
                onChange={(e) => setJumpOk(e.currentTarget.checked)} />
            </Stack>
          </Group>
          {!ok && (
            <Alert mt="sm" color="red" variant="light" title="Refused until corrected" data-units-refusal="">
              <Stack gap={2}>{refusals.map((r, k) => <Text key={k} size="sm">{r}</Text>)}</Stack>
            </Alert>
          )}
        </Box>

        {ok && fcs && inp ? (
          <>
            {step(3)}
            <Box data-panel="trend">
              <Title order={5}>Method A: the trend</Title>
              <OriginMark of={["page", "assumption"]} note="ordinary least squares on your history; the band is a prediction interval" />
              {trend?.fit && (
                <>
                  <PanTable>
                    <Table.Thead><Table.Tr>
                      <Table.Th>slope b (series unit / yr)</Table.Th><Table.Th>intercept a</Table.Th>
                      <Table.Th>R^2</Table.Th><Table.Th>s (series unit)</Table.Th>
                      <Table.Th>t of slope</Table.Th><Table.Th>p of slope</Table.Th><Table.Th>df</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody><Table.Tr data-fit="">
                      <Table.Td>{f(trend.fit.slope / sf, 3)}</Table.Td>
                      <Table.Td>{f(trend.fit.intercept / sf, 1)}</Table.Td>
                      <Table.Td>{f(trend.fit.r2, 4)}</Table.Td>
                      <Table.Td>{f(trend.fit.s / sf, 3)}</Table.Td>
                      <Table.Td>{f(trend.fit.tSlope, 2)}</Table.Td>
                      <Table.Td>{trend.fit.pSlope < 0.001 ? "< 0.001" : f(trend.fit.pSlope, 3)}</Table.Td>
                      <Table.Td>{trend.fit.df}</Table.Td>
                    </Table.Tr></Table.Tbody>
                  </PanTable>
                  <Text size="xs" c="dimmed" mt={2}>
                    Slope, intercept and s are in the unit of the series ({seriesScale}).  The p value
                    asks whether the history can tell this slope from zero.
                  </Text>
                </>
              )}
              <Group mt={6} gap="md" align="flex-end">
                <Num label="Prediction level" value={plant.level} step={0.01} min={0.5}
                  onChange={(v) => setPl("level", Math.min(0.999, v))} />
              </Group>
              {trend && (
                <LineChart id="trend-chart" caption="History, trend and prediction band"
                  xLabel="year" yLabel={`${unitLabel} (${answerScale})`}
                  series={[
                    { label: "history", color: INK, xs: parsed.years, ys: parsed.values.map((v) => show(v * sf)) },
                    { label: "trend forecast", color: METHOD_COLOR.trend, dashed: true,
                      xs: trend.rows.map((r) => r.year), ys: trend.rows.map((r) => show(kind === "DDD" ? r.market * dddPerPack : r.market)) },
                  ]}
                  bands={[{ color: METHOD_COLOR.trend, xs: trend.rows.map((r) => r.year),
                    lo: trend.rows.map((r) => show((r.lo ?? 0) * (kind === "DDD" ? dddPerPack : 1))),
                    hi: trend.rows.map((r) => show((r.hi ?? 0) * (kind === "DDD" ? dddPerPack : 1))) }]} />
              )}
              {trend?.notes.map((n, k) => <Text key={k} size="xs" c="orange">{n}</Text>)}
              <Text size="xs" c="dimmed" mt={4}>
                Assumes the cause of the past trend persists.  Last observed year: {lastYear}.
              </Text>
            </Box>

            {step(4)}
            <Box data-panel="ddd">
              <Title order={5}>Method B: doses from patients</Title>
              <OriginMark of={["assumption"]} note="every factor is an estimate you must source" />
              <Group mt={6} gap="md" align="flex-end" wrap="wrap">
                <Num label="Population N" unit="persons" value={ddd.population} step={100000}
                  onChange={(v) => setDdd({ ...ddd, population: v })} w={170} />
                <Num label="Prevalence p" value={ddd.prevalence} step={0.01} onChange={(v) => setDdd({ ...ddd, prevalence: v })} />
                <Num label="Treated q" value={ddd.treated} step={0.05} onChange={(v) => setDdd({ ...ddd, treated: v })} />
                <Num label="Treatment share m" value={ddd.moleculeShare} step={0.05} onChange={(v) => setDdd({ ...ddd, moleculeShare: v })} />
                <Num label="Adherence c" value={ddd.adherence} step={0.05} onChange={(v) => setDdd({ ...ddd, adherence: v })} />
                <Num label="DDD per day u" value={ddd.dddPerDay} step={0.5} onChange={(v) => setDdd({ ...ddd, dddPerDay: v })} />
                <Num label="Growth / yr" value={ddd.growth} step={0.005} min={-0.5} onChange={(v) => setDdd({ ...ddd, growth: v })} />
              </Group>
              <Text size="sm" mt={6} data-ddd-recon="">
                Base-year count: <b>{f(show(dddReconciliation(inp) * (inp.values[inp.values.length - 1] ?? 0) / (kind === "DDD" ? dddPerPack : 1)), 3)} {aw}</b>packs
                against {f(show((inp.values[inp.values.length - 1] ?? 0) / (kind === "DDD" ? dddPerPack : 1)), 3)} observed:
                ratio <b>{f(dddReconciliation(inp), 2)}</b>
                {Math.abs(Math.log(dddReconciliation(inp))) > Math.log(1.5)
                  ? " — more than 50 % apart: one of the factors, or the series, is off." : "."}
              </Text>
            </Box>

            {step(5)}
            <Box data-panel="penetration">
              <Title order={5}>Method C: the S-curve</Title>
              <OriginMark of={["assumption"]} note="ceiling, midpoint and steepness cannot be estimated from the market history" />
              <Group mt={6} gap="md" align="flex-end" wrap="wrap">
                <Num label="Ceiling S_max" value={pen.sMax} step={0.05} onChange={(v) => setPen({ ...pen, sMax: Math.min(1, v) })} />
                <Num label="Years to half, j_half" unit="years" value={pen.jHalf} step={0.5} onChange={(v) => setPen({ ...pen, jHalf: v })} />
                <Num label="Steepness k" unit="per year" value={pen.k} step={0.1} onChange={(v) => setPen({ ...pen, k: v })} />
                <SegmentedControl size="xs" value={penBase} onChange={(v) => setPenBase(v as "trend" | "last")}
                  data={[{ value: "trend", label: "market follows the trend" }, { value: "last", label: "market held at the last year" }]} />
              </Group>
            </Box>

            {step(6)}
            <Box data-panel="plant">
              <Title order={5}>The plant, the share and the capacity factor</Title>
              <OriginMark of={["page", "assumption"]} note="the share and the factor are assumptions you must argue" />
              <Group mt={6} gap="md" align="flex-end" wrap="wrap">
                <Num label="Design production Q" unit={`${aw}packs / yr`} value={plant.designQ} step={0.5} onChange={(v) => setPl("designQ", v)} />
                <Num label="Share of the market" value={plant.share} step={0.05} onChange={(v) => setPl("share", v)} />
                <Num label="Capacity factor" unit="1 = no more than the share" value={plant.factor} step={0.5} onChange={(v) => setPl("factor", v)} w={180} />
                <Num label="Launch after last year" unit="years" value={plant.delay} onChange={(v) => setPl("delay", Math.round(v))} />
                <Num label="Operating years" value={plant.horizon} onChange={(v) => setPl("horizon", Math.min(30, Math.max(1, Math.round(v))))} />
                <Num label="Tablets per pack" value={plant.tabletsPerPack} onChange={(v) => setPl("tabletsPerPack", v)} />
                <Num label="Packaged tablet mass" unit="g" value={plant.tabletMassG} step={0.05} onChange={(v) => setPl("tabletMassG", v)} />
              </Group>
              <PanTable>
                <Table.Thead><Table.Tr>
                  <Table.Th>method</Table.Th><Table.Th>mean market ({aw}packs)</Table.Th>
                  <Table.Th>mean sold ({aw}packs)</Table.Th><Table.Th>sold / market</Table.Th>
                  <Table.Th>factor that would fill the plant</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {(["trend", "ddd", "penetration"] as const).map((m) => {
                    const r = fcs[m];
                    if (!r) return null;
                    return (
                      <Table.Tr key={m} data-method-summary={m}>
                        <Table.Td><span style={{ color: METHOD_COLOR[m], fontWeight: 700 }}>{METHOD_LABEL[m]}</span></Table.Td>
                        <Table.Td>{f(show(r.meanMarketPacks), 3)}</Table.Td>
                        <Table.Td>{f(show(r.meanSoldPacks), 3)}</Table.Td>
                        <Table.Td>{f(r.meanSoldPacks / Math.max(r.meanMarketPacks, 1e-12), 3)}</Table.Td>
                        <Table.Td>{f(r.fillFactor, 2)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </PanTable>
              <Text size="sm" mt={4} data-factor-note="">
                Your capacity factor is <b>{f(plant.factor, 2)}</b>.  It is an <b>assumption</b>:
                {plant.factor > 1
                  ? " the plant is selling " + f(plant.factor, 2) + " times the share of the market the method gives it, so volume from somewhere else must be argued (other countries, an indication, a contract)."
                  : plant.factor < 1 ? " the plant sells less than the share forecast." : " the plant sells exactly the forecast share."}
                {" "}To fill a plant of {f(plant.designQ, 2)} {aw}packs a year from method {METHOD_LABEL[driver][0]} the factor would be{" "}
                <b>{f((chosen?.fillFactor ?? NaN) * plant.factor, 2)}</b>.
              </Text>
              {chosen?.rows.some((r) => r.soldOverMarket > 1) && (
                <Text size="sm" c="red" mt={4} data-over-market="">
                  In {chosen.rows.filter((r) => r.soldOverMarket > 1).length} of {chosen.rows.length} years the plant would have to
                  sell more than the entire forecast market.
                </Text>
              )}
              {warnings.map((w, k) => <Text key={k} size="xs" c="orange" data-scale-warning="">{w}</Text>)}
              <LineChart id="compare-chart" caption="Packs sold per year by method"
                xLabel="year" yLabel={`${aw}packs / yr`}
                series={[
                  ...(["trend", "ddd", "penetration"] as const).flatMap((m) => {
                    const r = fcs[m];
                    return r ? [{ label: METHOD_LABEL[m], color: METHOD_COLOR[m], xs: r.rows.map((x) => x.year), ys: r.rows.map((x) => show(x.sold)) }] : [];
                  }),
                  { label: "design production Q", color: INK, dashed: true,
                    xs: (chosen?.rows ?? []).map((x) => x.year), ys: (chosen?.rows ?? []).map(() => plant.designQ) },
                ]} />
            </Box>

            {step(7)}
            <Box data-panel="paste">
              <Title order={5}>What the case&apos;s economics reads</Title>
              <OriginMark of={["page", "assumption"]} note="rampUp and the design production, for the method you pick" />
              <Group mt={6} gap="sm" align="center">
                <Text size="sm">From</Text>
                <SegmentedControl size="xs" value={driver} onChange={(v) => setDriver(v as MethodId)}
                  data={[{ value: "trend", label: "A trend" }, { value: "ddd", label: "B DDD" }, { value: "penetration", label: "C S-curve" }]} />
              </Group>
              {chosen && (
                <>
                  <PanTable>
                    <Table.Thead><Table.Tr>
                      <Table.Th>op. year j</Table.Th><Table.Th>year</Table.Th>
                      <Table.Th>market ({answerScale})</Table.Th><Table.Th>share</Table.Th>
                      <Table.Th>factor</Table.Th><Table.Th>sold ({answerScale})</Table.Th>
                      <Table.Th>sold / market</Table.Th><Table.Th>rampUp</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {chosen.rows.map((r) => (
                        <Table.Tr key={r.j} data-year-row={r.j}>
                          <Table.Td>{r.j}</Table.Td><Table.Td>{r.year}</Table.Td>
                          <Table.Td>{f(show(r.market), 3)}</Table.Td><Table.Td>{f(r.share, 3)}</Table.Td>
                          <Table.Td>{f(r.factor, 2)}</Table.Td><Table.Td>{f(show(r.sold), 3)}</Table.Td>
                          <Table.Td>{f(r.soldOverMarket, 3)}</Table.Td>
                          <Table.Td>{f(r.ramp, 4)}{r.capped ? " (plant-limited)" : ""}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </PanTable>
                  <Box component="pre" data-paste-block="" mt={6} p="xs"
                    style={{ overflowX: "auto", fontSize: 12, border: `1px solid ${GRID}`, borderRadius: 4 }}>
                    {pasteBlock(chosen, inp.designPacks, plant.tabletsPerPack, plant.tabletMassG, aw.trim(), af)}
                  </Box>
                  <Text size="xs" c="dimmed" mt={4}>
                    Design production {f(designKgPerYear(inp.designPacks, plant.tabletsPerPack, plant.tabletMassG) / 1000, 1)} t a year of packaged tablets.
                    The price per year is not in this page: see the patent-expiry tool.
                  </Text>
                </>
              )}
            </Box>

            {step(8)}
          </>
        ) : (
          <>{step(3)}{step(4)}{step(5)}{step(6)}{step(7)}{step(8)}</>
        )}

        <LessonQuiz title="Check your understanding" questions={DEMAND_QUIZ} lesson={DEMAND_STEPS} />
        <LessonLimits limits={DEMAND_LIMITS} />
        <Group gap="xs"><Badge variant="light">no engine run</Badge></Group>

        <LessonReferences tool="demand-forecast" />
      </Stack>
    </Box>
  );
}
