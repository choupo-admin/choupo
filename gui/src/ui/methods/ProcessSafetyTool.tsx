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
  ProcessSafetyTool -- "Process safety: remove the hazard before you add a
  layer" (DEV.md 4c C60, commissioned by Vitor 2026-10-11).

  A NOTES page with the engine running inside it, on the "Process safety"
  shelf (C61, the overpressure page, sits beside it).  Part 0 is the thesis
  (Gall beside Kletz, Flixborough and Bhopal, read from the sources named in
  processSafetyLesson.ts).  Lesson 1 runs Stoessel's cooling-failure scenario
  on two witnesses -- a batch and the same reaction dosed -- with the
  failure time, the interlock and the two limit temperatures as knobs; every
  temperature the page draws is a run's.  Lesson 2 runs the two C57
  green-ammonia feasibility loops and says what they can and cannot tell
  about the hazardous inventory.

  SEVEN RUNS, and why.  The adiabatic rise is the engine's (the batch with
  the failure at t = 0), the accumulation curves are the engine's (both
  witnesses in normal operation), the MTSR at the chosen instant is the
  engine's (one failure run per witness), and the loop numbers are the
  engine's (one run per pressure).  The batch runs take well under a second
  natively; the page says when it is waiting.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Group, Loader, SegmentedControl, Stack, Table,
  Text, Title,
} from "@mantine/core";

import { useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import { Plot, PLOT_COLORS, darkLayout } from "../plotting/plotly.js";
import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView, Tex } from "./lessonStep.js";
import { SAFETY_LIMITS, SAFETY_STEPS } from "./processSafetyLesson.js";
import {
  BATCH_TF_MAX_S, CLASS_MEANING, PORTIONS, SAFETY_WITNESS_BATCH,
  SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50, SAFETY_WITNESS_SEMI,
  accumulation, at, batchOverrides, criticalityClass, failTimeAfterPortion,
  kpi, mtsrEstimate, readFailure, readLoop, recordBoilingPoints,
  semiOverrides, type CriticalityClass, type LoopReading, type Series,
} from "./processSafety.js";
import { setActiveMethodTool } from "./registry.js";

/** The decomposition onset the page starts from.  An ASSUMPTION, labelled
 *  as one wherever it is drawn: no record here carries a T_D24. */
export const DEFAULT_TD24_K = 380;

const step = (n: number) => {
  const s = SAFETY_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const C_BATCH = PLOT_COLORS.series[1]!;   // warm: the batch
const C_SEMI = PLOT_COLORS.series[0]!;    // accent: the semi-batch
const C_LIMIT = PLOT_COLORS.axis;

const f1 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—";
const f2 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—";
const pct = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${(100 * v).toFixed(1)} %` : "—";
const kmolh = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(0) : "—";

function Waiting({ runs, what }: { runs: MethodRunState[]; what: string }): JSX.Element | null {
  const err = runs.find((r) => r.err !== null)?.err ?? null;
  if (err !== null) {
    return (
      <Alert color="red" variant="light"
        title="The engine refused or failed — its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
          {err}
        </Text>
      </Alert>
    );
  }
  if (runs.some((r) => r.busy || r.result === null)) {
    return (
      <Group gap="sm" wrap="nowrap" align="center">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">{what} — seconds, not instant</Text>
      </Group>
    );
  }
  return null;
}

function hours(s: Series): number[] { return s.t.map((t) => t / 3600); }

function hline(y: number, x0: number, x1: number, name: string, dash: string): object {
  return {
    type: "scatter", mode: "lines", name, x: [x0, x1], y: [y, y],
    line: { color: C_LIMIT, width: 1.5, dash }, hoverinfo: "name+y",
  };
}

function ClassBadge({ v }: { v: ReturnType<typeof criticalityClass> }): JSX.Element {
  if (v.cls === null)
    return <Badge variant="light" color="gray">no class: {v.why}</Badge>;
  const color = v.cls <= 2 ? "teal" : v.cls === 3 ? "yellow" : "red";
  return <Badge variant="light" color={color}>class {v.cls}</Badge>;
}

// ---- Lesson 1: the cooling-failure bench -----------------------------------

function CoolingFailureBench(): JSX.Element {
  const [tf, setTf] = useState(600);
  const [portion, setPortion] = useState(PORTIONS);
  const [interlock, setInterlock] = useState(true);
  const [td24, setTd24] = useState(DEFAULT_TD24_K);

  const boiling = useMemo(
    () => recordBoilingPoints(tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles),
    []);
  const lowestTb = boiling[0];
  const [mtt, setMtt] = useState<number>(lowestTb ? lowestTb.Tb : 350);

  const bNorm = useMethodRun(SAFETY_WITNESS_BATCH, batchOverrides(null),
    "norm", "choupoBatch");
  const bAd = useMethodRun(SAFETY_WITNESS_BATCH, batchOverrides(0),
    "ad0", "choupoBatch");
  const bFail = useMethodRun(SAFETY_WITNESS_BATCH, batchOverrides(tf),
    `tf=${tf}`, "choupoBatch");
  const sNorm = useMethodRun(SAFETY_WITNESS_SEMI, semiOverrides(null, true),
    "norm", "choupoBatch");
  const sFail = useMethodRun(SAFETY_WITNESS_SEMI,
    semiOverrides(portion, interlock), `n=${portion},il=${interlock}`,
    "choupoBatch");

  const ad = readFailure(bAd.result?.trajectory);
  const Tp = ad?.T0 ?? NaN;
  const dTad = ad ? ad.Tmax - ad.T0 : NaN;
  const Xb = accumulation(bNorm.result?.trajectory);
  const Xs = accumulation(sNorm.result?.trajectory);
  const estB = Xb && Number.isFinite(dTad) ? mtsrEstimate(Xb, Tp, dTad) : null;
  const estS = Xs && Number.isFinite(dTad) ? mtsrEstimate(Xs, Tp, dTad) : null;
  const failB = readFailure(bFail.result?.trajectory);
  const failS = readFailure(sFail.result?.trajectory);
  const tfS = failTimeAfterPortion(portion);
  const XbAt = Xb ? at(Xb, tf) : NaN;
  const XsAt = Xs ? at(Xs, tfS) : NaN;

  const classB = criticalityClass(Tp, failB?.Tmax ?? NaN, mtt, td24);
  const classS = criticalityClass(Tp, failS?.Tmax ?? NaN, mtt, td24);
  const peakB = kpi(bNorm.result, "campaign", "utility_coolingWater_peak_kW");
  const peakS = kpi(sNorm.result, "campaign", "utility_coolingWater_peak_kW");

  //  The MTSR-against-failure-time figure: Stoessel's picture, drawn from
  //  the two normal-operation runs and marked with the two failure runs.
  const tEnd = Math.max(...(Xs?.t ?? [0]), ...(Xb?.t ?? [0])) / 3600;
  const traces: object[] = [];
  if (estB) traces.push({ type: "scatter", mode: "lines",
    name: "batch: T_p + X_ac ΔT_ad", x: hours(estB), y: estB.y,
    line: { color: C_BATCH, width: 2 } });
  if (estS) traces.push({ type: "scatter", mode: "lines",
    name: "semi-batch: T_p + X_ac ΔT_ad", x: hours(estS), y: estS.y,
    line: { color: C_SEMI, width: 2 } });
  if (failB) traces.push({ type: "scatter", mode: "markers",
    name: "batch: engine MTSR", x: [tf / 3600], y: [failB.Tmax],
    marker: { color: C_BATCH, size: 11, symbol: "diamond" } });
  if (failS) traces.push({ type: "scatter", mode: "markers",
    name: interlock ? "semi-batch: engine MTSR" : "semi-batch, interlock failed",
    x: [tfS / 3600], y: [failS.Tmax],
    marker: { color: C_SEMI, size: 11,
      symbol: interlock ? "diamond" : "x" } });
  if (Number.isFinite(Tp)) traces.push(hline(Tp, 0, tEnd, "T_p", "dot"));
  traces.push(hline(mtt, 0, tEnd, "MTT (declared)", "dash"));
  traces.push(hline(td24, 0, tEnd, "T_D24 (assumed)", "longdash"));

  const climb: object[] = [];
  const TB = failB ? bFail.result?.trajectory : undefined;
  const TS = failS ? sFail.result?.trajectory : undefined;
  if (TB?.vars["reactor.T"]) climb.push({ type: "scatter", mode: "lines",
    name: `batch, failure at ${tf} s`, x: TB.t.map((t) => t / 3600),
    y: TB.vars["reactor.T"], line: { color: C_BATCH, width: 2 } });
  if (TS?.vars["reactor.T"]) climb.push({ type: "scatter", mode: "lines",
    name: `semi-batch, failure after portion ${portion}`
      + (interlock ? "" : " (interlock failed)"),
    x: TS.t.map((t) => t / 3600), y: TS.vars["reactor.T"],
    line: { color: C_SEMI, width: 2 } });

  return (
    <Box>
      <Title order={5}>The cooling-failure bench</Title>
      <Text size="sm" mt={4}>
        Choose when the cooling fails in each reactor, whether the dosing
        interlock works, and the two limits.  The engine re-runs each
        failure; the curves are the methodology&apos;s estimate drawn from
        the engine&apos;s own normal-operation runs.
      </Text>
      <Box mt={8} style={{ display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
        <KnobNumber label="batch: cooling fails at t_f [s]" value={tf} min={0}
          max={BATCH_TF_MAX_S} step={60} onChange={setTf} />
        <KnobNumber label={`semi-batch: fails 50 s after portion n (1–${PORTIONS})`}
          value={portion} min={1} max={PORTIONS} step={1}
          onChange={(v) => setPortion(Math.min(PORTIONS, Math.max(1, Math.round(v))))} />
        <KnobField label="semi-batch: dosing interlock">
          <SegmentedControl size="xs" fullWidth value={interlock ? "works" : "fails"}
            data={[{ value: "works", label: "works" },
                   { value: "fails", label: "fails" }]}
            onChange={(v) => setInterlock(v === "works")} />
        </KnobField>
        <KnobNumber label="MTT, declared [K]" value={mtt} min={300} max={500}
          step={1} decimals={2} onChange={setMtt} />
        <KnobNumber label="T_D24, ASSUMED [K]" value={td24} min={300} max={600}
          step={5} decimals={1} onChange={setTd24} />
      </Box>
      <Box mt={8}>
        <Waiting runs={[bNorm, bAd, bFail, sNorm, sFail]}
          what="the engine is integrating the reactors" />
      </Box>
      <Box mt={10} style={{ width: "100%", height: 360 }}>
        <Plot data={traces}
          layout={{
            ...darkLayout,
            title: { text: "MTSR if the cooling fails at time t",
              font: { ...darkLayout.font, size: 14 } },
            xaxis: { ...darkLayout.xaxis, title: { text: "failure time t  [h]" } },
            yaxis: { ...darkLayout.yaxis, title: { text: "temperature  [K]" } },
            legend: { ...darkLayout.legend, orientation: "h", y: -0.25 },
            margin: { ...darkLayout.margin, b: 96 },
          }}
          useResizeHandler style={{ width: "100%", height: "100%" }} />
      </Box>
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={10}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>reactor</Table.Th>
              <Table.Th>failure at [s]</Table.Th>
              <Table.Th>X_ac at failure</Table.Th>
              <Table.Th>estimate T_p + X_ac ΔT_ad [K]</Table.Th>
              <Table.Th>engine MTSR [K]</Table.Th>
              <Table.Th>class</Table.Th>
              <Table.Th>peak cooling duty, normal operation [kW]</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>batch</Table.Td>
              <Table.Td>{tf}</Table.Td>
              <Table.Td>{pct(XbAt)}</Table.Td>
              <Table.Td>{f1(Tp + XbAt * dTad)}</Table.Td>
              <Table.Td>{f1(failB?.Tmax)}{failB?.stillRising ? " (still rising)" : ""}</Table.Td>
              <Table.Td><ClassBadge v={classB} /></Table.Td>
              <Table.Td>{peakB === null ? "—" : peakB.toFixed(4)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>semi-batch{interlock ? "" : " (interlock failed)"}</Table.Td>
              <Table.Td>{tfS}</Table.Td>
              <Table.Td>{pct(XsAt)}</Table.Td>
              <Table.Td>{f1(Tp + XsAt * dTad)}</Table.Td>
              <Table.Td>{f1(failS?.Tmax)}{failS?.stillRising ? " (still rising)" : ""}</Table.Td>
              <Table.Td><ClassBadge v={classS} /></Table.Td>
              <Table.Td>{peakS === null ? "—" : peakS.toFixed(4)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="sm" mt={6}>
        T_p = {f1(Tp)} K and ΔT_ad = {f2(dTad)} K, both from the engine
        (the batch run with the failure at t = 0).
        {classB.cls !== null && <> Batch: {CLASS_MEANING[classB.cls as CriticalityClass]}.</>}
        {classS.cls !== null && <> Semi-batch: {CLASS_MEANING[classS.cls as CriticalityClass]}.</>}
      </Text>
      <Box mt={10} style={{ width: "100%", height: 320 }}>
        <Plot data={climb}
          layout={{
            ...darkLayout,
            title: { text: "The reactor temperature in the two failure runs",
              font: { ...darkLayout.font, size: 14 } },
            xaxis: { ...darkLayout.xaxis, title: { text: "time  [h]" } },
            yaxis: { ...darkLayout.yaxis, title: { text: "T  [K]" } },
            legend: { ...darkLayout.legend, orientation: "h", y: -0.3 },
            margin: { ...darkLayout.margin, b: 90 },
          }}
          useResizeHandler style={{ width: "100%", height: "100%" }} />
      </Box>
      <PanelNote>
        Runs tutorials/{SAFETY_WITNESS_BATCH} and tutorials/
        {SAFETY_WITNESS_SEMI} in your browser (choupoBatch WASM), moving
        only their recipe lines: the failure time, `value 0|1` on the
        failure, and `fraction 0|1` on the interlock.  The MTT default is the
        lowest normal boiling point among the witness&apos;s component records
        ({lowestTb ? `${lowestTb.component}, ${lowestTb.Tb} K` : "none found"}),
        a declared choice and not a bubble point.  T_D24 starts at{" "}
        {DEFAULT_TD24_K} K as an assumption for the exercise: no record here
        carries a decomposition onset.  The peak cooling duty is the
        engine&apos;s utility-ledger KPI for each witness&apos;s 18.5 mol
        batch.
      </PanelNote>
    </Box>
  );
}

// ---- The criticality-class table (static) ----------------------------------

function ClassTable(): JSX.Element {
  const rows: { cls: CriticalityClass; order: string }[] = [
    { cls: 1, order: String.raw`T_\mathrm{p} \le \mathrm{MTSR} < \mathrm{MTT} < T_\mathrm{D24}` },
    { cls: 2, order: String.raw`T_\mathrm{p} \le \mathrm{MTSR} < T_\mathrm{D24} < \mathrm{MTT}` },
    { cls: 3, order: String.raw`T_\mathrm{p} \le \mathrm{MTT} \le \mathrm{MTSR} < T_\mathrm{D24}` },
    { cls: 4, order: String.raw`T_\mathrm{p} \le \mathrm{MTT} < T_\mathrm{D24} < \mathrm{MTSR}` },
    { cls: 5, order: String.raw`T_\mathrm{p} < T_\mathrm{D24} < \mathrm{MTSR},\ \mathrm{MTT} \text{ either side}` },
  ];
  return (
    <Box style={{ overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>class</Table.Th>
            <Table.Th>ordering</Table.Th>
            <Table.Th>what the ordering implies (our reading)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.cls}>
              <Table.Td><b>{r.cls}</b></Table.Td>
              <Table.Td><Tex src={r.order} mode="inline" /></Table.Td>
              <Table.Td>{CLASS_MEANING[r.cls]}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

// ---- Lesson 2: the two ammonia loops ---------------------------------------

function LoopComparison(): JSX.Element {
  const r150 = useMethodRun(SAFETY_WITNESS_NH3_150, [], "base", "choupoSolve");
  const r50 = useMethodRun(SAFETY_WITNESS_NH3_50, [], "base", "choupoSolve");
  const a = readLoop(r150.result);
  const b = readLoop(r50.result);
  const bad = [a, b].find((x) => typeof x === "string") as string | undefined;
  const A = typeof a === "object" ? a : null;
  const B = typeof b === "object" ? b : null;
  const ratio = (k: keyof LoopReading): string => {
    const x = A?.[k], y = B?.[k];
    return typeof x === "number" && typeof y === "number" && x !== 0
      && Number.isFinite(x) && Number.isFinite(y) ? `${(y / x).toFixed(2)}×` : "—";
  };
  const rows: { label: string; k: keyof LoopReading; fmt: (v: number) => string }[] = [
    { label: "converter pressure [bar]", k: "P_bar", fmt: (v) => v.toFixed(0) },
    { label: "converter temperature [K]", k: "T_K", fmt: (v) => v.toFixed(1) },
    { label: "H2 converted per pass", k: "h2PerPass", fmt: (v) => pct(v) },
    { label: "converter feed [kmol/h]", k: "feed_kmol_h", fmt: kmolh },
    { label: "H2 in the converter feed [kmol/h]", k: "feedH2_kmol_h", fmt: kmolh },
    { label: "recycle [kmol/h]", k: "recycle_kmol_h", fmt: kmolh },
    { label: "H2 in the recycle [kmol/h]", k: "recycleH2_kmol_h", fmt: kmolh },
    { label: "NH3 in the recycle [kmol/h]", k: "recycleNH3_kmol_h", fmt: kmolh },
    { label: "NH3 made in the converter [kmol/h]", k: "made_kmol_h", fmt: kmolh },
    { label: "NH3 product [kmol/h]", k: "product_kmol_h", fmt: kmolh },
    { label: "gross margin after raw materials and utilities [M€/yr]",
      k: "grossMargin_RM_UT", fmt: (v) => (v / 1e6).toFixed(2) },
  ];
  return (
    <Box>
      <Waiting runs={[r150, r50]} what="the engine is solving both loops" />
      {bad !== undefined && (
        <Alert color="red" variant="light" title="A loop could not be read">
          <Text size="xs">{bad}</Text>
        </Alert>
      )}
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>quantity (engine)</Table.Th>
              <Table.Th>150 bar</Table.Th>
              <Table.Th>50 bar</Table.Th>
              <Table.Th>50 / 150</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => {
              const x = A?.[r.k], y = B?.[r.k];
              return (
                <Table.Tr key={r.k}>
                  <Table.Td>{r.label}</Table.Td>
                  <Table.Td>{typeof x === "number" && Number.isFinite(x) ? r.fmt(x) : "—"}</Table.Td>
                  <Table.Td>{typeof y === "number" && Number.isFinite(y) ? r.fmt(y) : "—"}</Table.Td>
                  <Table.Td>{ratio(r.k)}</Table.Td>
                </Table.Tr>
              );
            })}
            <Table.Tr>
              <Table.Td>hydrogen and ammonia HELD in the loop</Table.Td>
              <Table.Td colSpan={3}>
                not computed: these cases size no vessel, so there is no
                volume to hold anything (lesson step 12)
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
      <PanelNote>
        Runs tutorials/{SAFETY_WITNESS_NH3_150} and tutorials/
        {SAFETY_WITNESS_NH3_50} unchanged, in your browser (choupoSolve
        WASM).  The flows are the converter feed (PreheatedFeed), its
        effluent (HotEffluent), the Recycle and the ProductNH3 stream of each
        run; the per-pass conversion is step 11&apos;s formula on them; the
        gross margin is the economics pass&apos;s own grossMargin_RM_UT KPI.
      </PanelNote>
    </Box>
  );
}

// ---- The page ---------------------------------------------------------------

export function ProcessSafetyTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Process safety: remove the hazard before you add a layer</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why every protective layer is itself a system that can fail, what
            Flixborough and Bhopal showed about it, and two applications with
            the engine running: the cooling-failure scenario on a batch and on
            a dosed reactor, and a lower-pressure ammonia loop that is not
            simply safer.
          </Text>
        </Box>

        <Title order={4}>Part 0 — the thesis</Title>
        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        <Title order={4}>Lesson 1 — the cooling-failure scenario</Title>
        {step(5)}
        {step(6)}
        {step(7)}
        <ClassTable />
        {step(8)}
        {step(9)}
        <CoolingFailureBench />
        {step(10)}
        <Text size="sm">
          What a vessel needs once the boiling is the barrier -- the relief
          device, its sizing, and where the relief goes:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("overpressure")}>
            Designing for overpressure
          </Anchor>.
        </Text>
        <Text size="sm">
          Continue with{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("vanheerden")}>
            Ignition / extinction (Van Heerden)
          </Anchor>{" "}for the continuous reactor&apos;s heat-generation and
          heat-removal picture.
        </Text>

        <Title order={4}>Lesson 2 — inherent safety against economics</Title>
        {step(11)}
        <LoopComparison />
        {step(12)}
        <Text size="sm">
          Staging and fidelity:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("front-end-loading")}>
            Front-End Loading
          </Anchor>{" "}explains why a stage-2 study carries duties and no
          vessel sizes.
        </Text>

        <LessonLimits limits={SAFETY_LIMITS} />
      </Stack>
    </Box>
  );
}
