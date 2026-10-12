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
  layer" (DEV.md 4c C60, commissioned by Vitor 2026-10-11; corrected the
  same day on two reviews he relayed).

  A NOTES page with the engine running inside it, on the "Process safety"
  shelf (C61, the overpressure page, sits beside it).  Part 0 is the thesis
  (Gall beside Kletz, Flixborough and Bhopal, read from the sources named in
  processSafetyLesson.ts).  Lesson 1 runs Stoessel's cooling-failure scenario
  on a FICTITIOUS reaction (step 8 of the lesson says so before any run) --
  a batch, the same reaction dosed, and the same reactor with a dosing
  vessel sized to bound what a feed failure can deliver.  Every temperature
  the page draws is a run's, the technical limit MTT included (the bubble
  point of the reactor contents at each instant, from choupoProps runs).
  Lesson 2 runs the two C57 green-ammonia feasibility loops, and the
  engine's Z at each converter feed, and says what they can and cannot tell
  about the hazardous inventory.

  WHAT RUNS, and why each run.  The adiabatic rise is the engine's (the
  batch with the failure at t = 0); the accumulation and mass curves are the
  engine's (each witness in normal operation); T_cf at the chosen instant is
  the engine's (one failure run per witness); the engine-confirmed maximum
  is a SWEEP the reader asks for (one run per post-portion instant, and per
  pre-portion instant for contrast); the MTT at each instant is one
  bubble-point run; the dosing-vessel comparison is one run per worst
  instant per design; the loop numbers are one run per pressure, and Z one
  property run.  The batch runs take well under a second natively; the
  page says when it is waiting and how many runs it is waiting for.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Accordion, Alert, Anchor, Badge, Box, Button, Group, Loader,
  SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import type { RunResult, TrajectoryData } from "../../adapters/SolverAdapter.js";
import {
  useMethodRun, useMethodRunSweep, type MethodRunState, type MethodSweepState,
} from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import { Plot, PLOT_COLORS, darkLayout } from "../plotting/plotly.js";
import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView, Tex } from "./lessonStep.js";
import {
  SAFETY_LIMITS, SAFETY_STEPS, SAFETY_TECH_NOTES,
} from "./processSafetyLesson.js";
import {
  BATCH_TABLE_T, BATCH_TF_MAX_S, BUBBLE_P_BAR, CLASS_MEANING, DEFAULT_PORTION,
  PORTIONS, REFILL_TIMES, SAFETY_WITNESS_BATCH, SAFETY_WITNESS_BUBBLE,
  SAFETY_WITNESS_NH3_150, SAFETY_WITNESS_NH3_50, SAFETY_WITNESS_SEMI,
  SAFETY_WITNESS_TANK, SAFETY_WITNESS_Z, TANK_WORST_T, Z_OPS,
  accumulation, batchOverrides, bubbleOverrides, criticalityClass,
  dumpComposition, dumpEstimate, estimateAt, failTime, kpi, massRatio, maxOf,
  readBubble, readFailure, readGasPoint, readLoop, reactorComposition,
  recordBoilingPoints, recordMolarMasses, semiOverrides, tankOverrides,
  tcfEstimate, volumetricRatio, zOverrides,
  type CriticalityClass, type FeedFailure, type LoopReading, type Series,
  type Side,
} from "./processSafety.js";
import { setActiveMethodTool } from "./registry.js";

/** The T_D24 the page starts from -- the temperature at which the adiabatic
 *  time to maximum rate of the secondary decomposition would be 24 h.  An
 *  ASSUMPTION, labelled as one wherever it is drawn: no record here carries
 *  decomposition kinetics, so nothing here can supply a T_D24.  385 K puts
 *  four classes along the batch's run (4, 3, 1, 2 as it converts). */
export const DEFAULT_TD24_K = 385;

const step = (n: number) => {
  const s = SAFETY_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const C_BATCH = PLOT_COLORS.series[1]!;   // warm: the batch
const C_SEMI = PLOT_COLORS.series[0]!;    // accent: the semi-batch
const C_TANK = PLOT_COLORS.series[4]!;  // green: the day tank
const C_LIMIT = PLOT_COLORS.axis;

const f1 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—";
const f2 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—";
const f3 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "—";
const pct = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${(100 * v).toFixed(1)} %` : "—";
const kmolh = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(0) : "—";
const fin = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

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

function SweepStatus({ s, what }: { s: MethodSweepState; what: string }): JSX.Element | null {
  const err = s.errs.find((e) => e !== null) ?? null;
  if (err) {
    return (
      <Alert color="red" variant="light"
        title="A run of the sweep did not finish — its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{err}</Text>
      </Alert>
    );
  }
  if (s.busy)
    return (
      <Group gap="sm" wrap="nowrap" align="center">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">{what}: {s.done} of {s.results.length} runs</Text>
      </Group>
    );
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

const tfOf = (r: RunResult | null | undefined) => readFailure(r?.trajectory);

/** The bubble points of a list of compositions, one props run each. */
function useBubbleSweep(
  xs: ({ [comp: string]: number } | null)[], enabled: boolean,
): { T: (number | null)[]; s: MethodSweepState } {
  const ok = enabled && xs.length > 0 && xs.every((x) => x !== null);
  const sets = ok ? xs.map((x) => bubbleOverrides(x!)) : [];
  const key = JSON.stringify(sets.map((o) => o.map((v) => ("value" in v ? v.value : 0))));
  const s = useMethodRunSweep(ok ? SAFETY_WITNESS_BUBBLE : null, sets, key, "choupoProps");
  return { T: s.results.map((r) => readBubble(r)), s };
}

// ---- The runs every bench shares -------------------------------------------

interface Core {
  bNorm: MethodRunState; bAd: MethodRunState; sNorm: MethodRunState;
  mw: { [comp: string]: number };
  Tp: number; dTad: number;
  proxy: { component: string; Tb: number } | undefined;
}

function useCore(): Core {
  const raw = tutorialByName(SAFETY_WITNESS_BATCH)?.files.rawFiles;
  const mw = useMemo(() => recordMolarMasses(raw), [raw]);
  const proxy = useMemo(() => recordBoilingPoints(raw)[0], [raw]);
  const bNorm = useMethodRun(SAFETY_WITNESS_BATCH, batchOverrides(null),
    "norm", "choupoBatch");
  const bAd = useMethodRun(SAFETY_WITNESS_BATCH, batchOverrides(0),
    "ad0", "choupoBatch");
  const sNorm = useMethodRun(SAFETY_WITNESS_SEMI, semiOverrides(null),
    "norm", "choupoBatch");
  const ad = tfOf(bAd.result);
  return {
    bNorm, bAd, sNorm, mw, proxy,
    Tp: ad?.T0 ?? NaN, dTad: ad ? ad.Tmax - ad.T0 : NaN,
  };
}

type MttSource = "bubble" | "proxy" | "declared";

// ---- Lesson 1: the cooling-failure bench -----------------------------------

function CoolingFailureBench(
  { core, td24, setTd24 }: { core: Core; td24: number; setTd24: (v: number) => void },
): JSX.Element {
  const { bNorm, bAd, sNorm, mw, Tp, dTad, proxy } = core;
  const [tf, setTf] = useState(600);
  const [portion, setPortion] = useState(DEFAULT_PORTION);
  const [side, setSide] = useState<Side>("after");
  const [feed, setFeed] = useState<FeedFailure>("held");
  const [mttSource, setMttSource] = useState<MttSource>("bubble");
  const [mttDeclared, setMttDeclared] = useState<number>(proxy ? proxy.Tb : 350);
  const [confirm, setConfirm] = useState(false);

  const sideOk: Side = portion === 1 ? "after" : side;
  const tfS = failTime(portion, sideOk);
  const bFail = useMethodRun(SAFETY_WITNESS_BATCH, batchOverrides(tf),
    `tf=${tf}`, "choupoBatch");
  const sFail = useMethodRun(SAFETY_WITNESS_SEMI, semiOverrides(tfS, feed),
    `t=${tfS},feed=${feed}`, "choupoBatch");

  const tB = bNorm.result?.trajectory;
  const tS = sNorm.result?.trajectory;

  //  The MTT at every instant the page uses: the chosen two, the batch
  //  table's and the sixteen post-portion instants.
  const portionsN = Array.from({ length: PORTIONS }, (_, k) => k + 1);
  const afterT = portionsN.map((n) => failTime(n, "after"));
  const beforeT = portionsN.slice(1).map((n) => failTime(n, "before"));
  const useBubble = mttSource === "bubble";
  const xB = reactorComposition(tB, tf);
  const xS = reactorComposition(tS, tfS);
  const oB = xB ? bubbleOverrides(xB) : [];
  const oS = xS ? bubbleOverrides(xS) : [];
  const keyOf = (o: typeof oB): string =>
    JSON.stringify(o.map((v) => ("value" in v ? v.value : 0)));
  const bBub = useMethodRun(xB && useBubble ? SAFETY_WITNESS_BUBBLE : null, oB,
    keyOf(oB), "choupoProps");
  const sBub = useMethodRun(xS && useBubble ? SAFETY_WITNESS_BUBBLE : null, oS,
    keyOf(oS), "choupoProps");
  const bubB = useBubbleSweep(
    tB ? BATCH_TABLE_T.map((t) => reactorComposition(tB, t)) : [], useBubble);
  const bubS = useBubbleSweep(
    tS ? afterT.map((t) => reactorComposition(tS, t)) : [], useBubble);
  const mttOf = (bubble: number | null | undefined): number =>
    mttSource === "bubble" ? bubble ?? NaN
      : mttSource === "proxy" ? proxy?.Tb ?? NaN : mttDeclared;
  const mttB = mttOf(readBubble(bBub.result));
  const mttS = mttOf(readBubble(sBub.result));
  const mttBt = BATCH_TABLE_T.map((_, i) => mttOf(bubB.T[i]));
  const mttSt = afterT.map((_, i) => mttOf(bubS.T[i]));

  //  The ENGINE-CONFIRMED search, only when the reader asks for it.
  const sweepSets = confirm
    ? [...afterT, ...beforeT].map((t) => semiOverrides(t, "held")) : [];
  const sweep = useMethodRunSweep(confirm ? SAFETY_WITNESS_SEMI : null,
    sweepSets, `confirm=${confirm}`, "choupoBatch");
  const engAfter = afterT.map((_, i) => tfOf(sweep.results[i])?.Tmax ?? null);
  const engBefore = beforeT.map((_, i) =>
    tfOf(sweep.results[afterT.length + i])?.Tmax ?? null);
  const confirmed = !sweep.busy && sweep.done === sweepSets.length
    && sweepSets.length > 0 && engAfter.every(fin);
  const engMax = confirmed
    ? engAfter.reduce((b, v, i) => (v! > engAfter[b]! ? i : b), 0) : null;

  //  The estimate curves and the estimate at the chosen instants.
  const ok = fin(dTad);
  const Xb = accumulation(tB);
  const Xs = accumulation(tS);
  const Rb = massRatio(tB, mw);
  const Rs = massRatio(tS, mw);
  const estB = Xb && Rb && ok ? tcfEstimate(Xb, Tp, dTad, Rb) : null;
  const estS = Xs && Rs && ok ? tcfEstimate(Xs, Tp, dTad, Rs) : null;
  const estS0 = Xs && ok ? tcfEstimate(Xs, Tp, dTad, null) : null;
  const pB = ok ? estimateAt(tB, mw, Tp, dTad, tf) : null;
  const pS = ok ? estimateAt(tS, mw, Tp, dTad, tfS) : null;
  const pSt = afterT.map((t) => (ok ? estimateAt(tS, mw, Tp, dTad, t) : null));
  const pBt = BATCH_TABLE_T.map((t) => (ok ? estimateAt(tB, mw, Tp, dTad, t) : null));
  const maxEstB = estB ? maxOf(estB) : null;
  const maxEstS = estS ? maxOf(estS) : null;
  const maxEstSPortion = maxEstS
    ? Math.min(PORTIONS, Math.floor(maxEstS.t / 900) + 1) : null;

  const failB = tfOf(bFail.result);
  const failS = tfOf(sFail.result);
  const ad = tfOf(bAd.result);

  //  (a) the scenario's class; the PROCESS class from the maximum.
  const classB = criticalityClass(Tp, failB?.Tmax ?? NaN, mttB, td24);
  const classS = criticalityClass(Tp, failS?.Tmax ?? NaN, mttS, td24);
  const procB = criticalityClass(Tp, ad?.Tmax ?? NaN, mttBt[0] ?? NaN, td24);
  const semiMax = engMax !== null
    ? { T: engAfter[engMax]!, n: engMax + 1, from: "engine" as const }
    : maxEstS && maxEstSPortion !== null
      ? { T: maxEstS.y, n: maxEstSPortion, from: "estimate" as const } : null;
  const procS = criticalityClass(Tp, semiMax?.T ?? NaN,
    semiMax ? mttSt[semiMax.n - 1] ?? NaN : NaN, td24);

  const peakB = kpi(bNorm.result, "campaign", "utility_coolingWater_peak_kW");
  const peakS = kpi(sNorm.result, "campaign", "utility_coolingWater_peak_kW");
  const feedLabel: Record<FeedFailure, string> = {
    held: "interlock holds the feed",
    pumpOn: "interlock fails, pump runs on",
    wholeTank: "whole tank enters at once",
  };
  const mttWord = mttSource === "bubble" ? `bubble point at ${BUBBLE_P_BAR} bar`
    : mttSource === "proxy" ? "proxy: lowest Tb" : "declared";

  //  The T_cf-against-failure-time figure.
  const tEnd = Math.max(...(Xs?.t ?? [0]), ...(Xb?.t ?? [0])) / 3600;
  const traces: object[] = [];
  if (estB) traces.push({ type: "scatter", mode: "lines",
    name: "batch: estimate T_p + X_ac ΔT_ad", x: hours(estB), y: estB.y,
    line: { color: C_BATCH, width: 2 } });
  if (estS) traces.push({ type: "scatter", mode: "lines",
    name: "semi-batch: estimate with M_f/M(t)", x: hours(estS), y: estS.y,
    line: { color: C_SEMI, width: 2 } });
  if (estS0) traces.push({ type: "scatter", mode: "lines",
    name: "semi-batch: estimate, mass correction left out", x: hours(estS0),
    y: estS0.y, line: { color: C_SEMI, width: 1.5, dash: "dot" } });
  if (confirmed) {
    traces.push({ type: "scatter", mode: "markers",
      name: "semi-batch: engine, 1 s after each portion",
      x: afterT.map((t) => t / 3600), y: engAfter,
      marker: { color: C_SEMI, size: 7, symbol: "triangle-up" } });
    traces.push({ type: "scatter", mode: "markers",
      name: "semi-batch: engine, 1 s before each portion",
      x: beforeT.map((t) => t / 3600), y: engBefore,
      marker: { color: C_SEMI, size: 7, symbol: "triangle-down-open" } });
  }
  if (failB) traces.push({ type: "scatter", mode: "markers",
    name: "batch: engine T_cf, your instant", x: [tf / 3600], y: [failB.Tmax],
    marker: { color: C_BATCH, size: 11, symbol: "diamond" } });
  if (failS) traces.push({ type: "scatter", mode: "markers",
    name: `semi-batch: engine, your instant (${feedLabel[feed]})`,
    x: [tfS / 3600], y: [failS.Tmax],
    marker: { color: C_SEMI, size: 11, symbol: feed === "held" ? "diamond" : "x" } });
  if (fin(Tp)) traces.push(hline(Tp, 0, tEnd, "T_p", "dot"));
  if (mttSource === "bubble") {
    if (mttBt.some(fin)) traces.push({ type: "scatter", mode: "lines+markers",
      name: `MTT(t), batch: bubble point at ${BUBBLE_P_BAR} bar`,
      x: BATCH_TABLE_T.map((t) => t / 3600), y: mttBt,
      line: { color: C_BATCH, width: 1, dash: "dash" }, marker: { size: 5 } });
    if (mttSt.some(fin)) traces.push({ type: "scatter", mode: "lines+markers",
      name: `MTT(t), semi-batch: bubble point at ${BUBBLE_P_BAR} bar`,
      x: afterT.map((t) => t / 3600), y: mttSt,
      line: { color: C_SEMI, width: 1, dash: "dash" }, marker: { size: 5 } });
  } else if (fin(mttB)) {
    traces.push(hline(mttB, 0, tEnd, `MTT (${mttWord})`, "dash"));
  }
  traces.push(hline(td24, 0, tEnd, "T_D24 (assumed)", "longdash"));

  const climb: object[] = [];
  const TB = failB ? bFail.result?.trajectory : undefined;
  const TS = failS ? sFail.result?.trajectory : undefined;
  if (TB?.vars["reactor.T"]) climb.push({ type: "scatter", mode: "lines",
    name: `batch, failure at ${tf} s`, x: TB.t.map((t) => t / 3600),
    y: TB.vars["reactor.T"], line: { color: C_BATCH, width: 2 } });
  if (TS?.vars["reactor.T"]) climb.push({ type: "scatter", mode: "lines",
    name: `semi-batch, failure 1 s ${sideOk} portion ${portion} (${feedLabel[feed]})`,
    x: TS.t.map((t) => t / 3600), y: TS.vars["reactor.T"],
    line: { color: C_SEMI, width: 2 } });

  const scenarioNote = feed === "held" ? ""
    : " -- with the feed not stopped this is the compound scenario's maximum, "
      + "not an MTSR";

  return (
    <Box>
      <Title order={5}>The cooling-failure bench</Title>
      <Text size="sm" mt={4}>
        Choose when the cooling fails in each reactor, what the feed does
        then, where the technical limit comes from, and the assumed T_D24.
        The engine re-runs each failure and each bubble point; the curves are
        the methodology&apos;s estimate drawn from the engine&apos;s own
        normal-operation runs.
      </Text>
      <Box mt={8} style={{ display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
        <KnobNumber label="batch: cooling fails at t_f [s]" value={tf} min={0}
          max={BATCH_TF_MAX_S} step={60} onChange={setTf} />
        <KnobNumber label={`semi-batch: portion n (1–${PORTIONS})`}
          value={portion} min={1} max={PORTIONS} step={1}
          onChange={(v) => setPortion(Math.min(PORTIONS, Math.max(1, Math.round(v))))} />
        <KnobField label="semi-batch: the failure is 1 s">
          <SegmentedControl size="xs" fullWidth value={sideOk}
            data={[{ value: "before", label: "before it", disabled: portion === 1 },
                   { value: "after", label: "after it" }]}
            onChange={(v) => setSide(v as Side)} />
        </KnobField>
        <KnobField label="semi-batch: the feed, when the cooling fails">
          <SegmentedControl size="xs" fullWidth value={feed} orientation="vertical"
            data={[{ value: "held", label: "interlock holds it" },
                   { value: "pumpOn", label: "interlock fails" },
                   { value: "wholeTank", label: "whole tank enters" }]}
            onChange={(v) => setFeed(v as FeedFailure)} />
        </KnobField>
        <KnobField label="MTT from">
          <SegmentedControl size="xs" fullWidth value={mttSource}
            data={[{ value: "bubble", label: "bubble pt" },
                   { value: "proxy", label: "proxy" },
                   { value: "declared", label: "your value" }]}
            onChange={(v) => setMttSource(v as MttSource)} />
        </KnobField>
        {mttSource === "declared" && (
          <KnobNumber label="MTT, declared [K]" value={mttDeclared} min={300}
            max={500} step={1} decimals={2} onChange={setMttDeclared} />
        )}
        <KnobNumber label="T_D24, ASSUMED [K]" value={td24} min={300} max={600}
          step={5} decimals={1} onChange={setTd24} />
      </Box>
      <Box mt={8}>
        <Waiting runs={[bNorm, bAd, bFail, sNorm, sFail,
          ...(useBubble ? [bBub, sBub] : [])]}
          what="the engine is integrating the reactors and solving the bubble points" />
        <SweepStatus s={bubB.s} what="bubble points, batch" />
        <SweepStatus s={bubS.s} what="bubble points, semi-batch" />
      </Box>

      <Title order={6} mt={10}>(a) The scenario you chose</Title>
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>reactor</Table.Th>
              <Table.Th>failure at [s]</Table.Th>
              <Table.Th>X_ac at failure</Table.Th>
              <Table.Th>M_f / M(t)</Table.Th>
              <Table.Th>estimate T_cf [K]</Table.Th>
              <Table.Th>engine T_cf [K]</Table.Th>
              <Table.Th>MTT [K] ({mttWord})</Table.Th>
              <Table.Th>class of this scenario</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>batch</Table.Td>
              <Table.Td>{tf}</Table.Td>
              <Table.Td>{pct(pB?.X)}</Table.Td>
              <Table.Td>{f2(pB?.ratio)}</Table.Td>
              <Table.Td>{f1(pB?.Tcf)}</Table.Td>
              <Table.Td>{f1(failB?.Tmax)}{failB?.stillRising ? " (still rising)" : ""}</Table.Td>
              <Table.Td>{f1(mttB)}</Table.Td>
              <Table.Td><ClassBadge v={classB} /></Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>semi-batch, {feedLabel[feed]}</Table.Td>
              <Table.Td>{tfS} (1 s {sideOk} portion {portion})</Table.Td>
              <Table.Td>{pct(pS?.X)}</Table.Td>
              <Table.Td>{f2(pS?.ratio)}</Table.Td>
              <Table.Td>{feed === "held" ? f1(pS?.Tcf)
                : "n/a: the estimate assumes the feed stops"}</Table.Td>
              <Table.Td>{f1(failS?.Tmax)}{failS?.stillRising ? " (still rising)" : ""}</Table.Td>
              <Table.Td>{f1(mttS)}</Table.Td>
              <Table.Td><ClassBadge v={classS} /></Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" c="dimmed" mt={4}>
        Each row&apos;s class is read with that row&apos;s own engine T_cf in
        the MTSR slot{scenarioNote}: it classes the SCENARIO, not the process.
        {classB.cls !== null && <> Batch: {CLASS_MEANING[classB.cls as CriticalityClass]}.</>}
        {classS.cls !== null && <> Semi-batch: {CLASS_MEANING[classS.cls as CriticalityClass]}.</>}
      </Text>

      <Title order={6} mt={10}>(b) and (c): the maximum, estimated and confirmed</Title>
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>reactor</Table.Th>
              <Table.Th>(b) estimate&apos;s maximum [K], where</Table.Th>
              <Table.Th>(c) engine&apos;s maximum [K], where</Table.Th>
              <Table.Th>MTT there [K]</Table.Th>
              <Table.Th>class of the process</Table.Th>
              <Table.Th>peak cooling duty, normal operation [kW]</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>batch</Table.Td>
              <Table.Td>{f1(maxEstB?.y)}{maxEstB ? `, t = ${maxEstB.t} s` : ""}</Table.Td>
              <Table.Td>{f1(ad?.Tmax)}, t = 0 (the accumulation only falls
                after it)</Table.Td>
              <Table.Td>{f1(mttBt[0])}</Table.Td>
              <Table.Td><ClassBadge v={procB} /></Table.Td>
              <Table.Td>{peakB === null ? "—" : peakB.toFixed(4)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>semi-batch</Table.Td>
              <Table.Td>{f1(maxEstS?.y)}{maxEstSPortion !== null
                ? `, right after portion ${maxEstSPortion}` : ""}</Table.Td>
              <Table.Td>{engMax !== null
                ? `${f1(engAfter[engMax])}, 1 s after portion ${engMax + 1}`
                : "not searched yet"}</Table.Td>
              <Table.Td>{f1(semiMax ? mttSt[semiMax.n - 1] : NaN)}</Table.Td>
              <Table.Td><ClassBadge v={procS} />{semiMax
                ? <Text span size="xs" c="dimmed"> (from the {semiMax.from})</Text> : null}</Table.Td>
              <Table.Td>{peakS === null ? "—" : peakS.toFixed(4)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
      <Group mt={6} gap="sm" align="center">
        <Button size="xs" variant="light" disabled={confirm}
          onClick={() => setConfirm(true)}>
          Search with the engine: {PORTIONS + PORTIONS - 1} failure runs
        </Button>
        <SweepStatus s={sweep} what="failure runs" />
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        T_p = {f1(Tp)} K and ΔT_ad = {f2(dTad)} K, both from the engine (the
        batch run with the failure at t = 0).  (b) is the largest value of the
        estimate over the rows the normal-operation run writes, every 50 s;
        (c) is the largest engine T_cf over the instants it was asked about:
        1 s after each portion (and 1 s before, drawn for contrast).  Neither
        is a maximum over every instant.
        {semiMax ? ` The semi-batch's process class uses the ${semiMax.from}'s maximum.` : ""}
      </Text>

      <Box mt={10} style={{ width: "100%", height: 400 }}>
        <Plot data={traces}
          layout={{
            ...darkLayout,
            title: { text: "T_cf: the temperature if the cooling fails at time t",
              font: { ...darkLayout.font, size: 14 } },
            xaxis: { ...darkLayout.xaxis, title: { text: "failure time t  [h]" } },
            yaxis: { ...darkLayout.yaxis, title: { text: "temperature  [K]" } },
            legend: { ...darkLayout.legend, orientation: "h", y: -0.25 },
            margin: { ...darkLayout.margin, b: 150 },
          }}
          useResizeHandler style={{ width: "100%", height: "100%" }} />
      </Box>

      <Title order={6} mt={10}>The margin along the run: MTT(t) − T_cf(t)</Title>
      <Text size="xs" c="dimmed">
        MTT is {mttWord}; T_cf is the engine&apos;s where it has run that
        instant, the estimate otherwise (said in the column); the class uses
        the assumed T_D24 = {f1(td24)} K.
      </Text>
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>instant</Table.Th>
              <Table.Th>X_ac</Table.Th>
              <Table.Th>T_cf [K]</Table.Th>
              <Table.Th>MTT [K]</Table.Th>
              <Table.Th>MTT − T_cf [K]</Table.Th>
              <Table.Th>class of that scenario</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {BATCH_TABLE_T.map((t, i) => {
              const eng = t === 0 ? ad?.Tmax : undefined;
              const T = eng ?? pBt[i]?.Tcf;
              const m = mttBt[i];
              return (
                <Table.Tr key={`b${t}`}>
                  <Table.Td>batch, t = {t} s</Table.Td>
                  <Table.Td>{pct(pBt[i]?.X)}</Table.Td>
                  <Table.Td>{f1(T)} ({eng !== undefined ? "engine" : "estimate"})</Table.Td>
                  <Table.Td>{f1(m)}</Table.Td>
                  <Table.Td>{fin(T) && fin(m) ? f1(m - T) : "—"}</Table.Td>
                  <Table.Td><ClassBadge v={criticalityClass(Tp, T ?? NaN, m ?? NaN, td24)} /></Table.Td>
                </Table.Tr>
              );
            })}
            {afterT.map((t, i) => {
              const eng = engAfter[i];
              const T = fin(eng) ? eng : pSt[i]?.Tcf;
              const m = mttSt[i];
              return (
                <Table.Tr key={`s${t}`}>
                  <Table.Td>semi-batch, 1 s after portion {i + 1}</Table.Td>
                  <Table.Td>{pct(pSt[i]?.X)}</Table.Td>
                  <Table.Td>{f1(T)} ({fin(eng) ? "engine" : "estimate"})</Table.Td>
                  <Table.Td>{f1(m)}</Table.Td>
                  <Table.Td>{fin(T) && fin(m) ? f1(m - T) : "—"}</Table.Td>
                  <Table.Td><ClassBadge v={criticalityClass(Tp, T ?? NaN, m ?? NaN, td24)} /></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>

      <Box mt={10} style={{ width: "100%", height: 320 }}>
        <Plot data={climb}
          layout={{
            ...darkLayout,
            title: { text: "The reactor temperature in your two failure runs",
              font: { ...darkLayout.font, size: 14 } },
            xaxis: { ...darkLayout.xaxis, title: { text: "time  [h]" } },
            yaxis: { ...darkLayout.yaxis, title: { text: "T  [K]" } },
            legend: { ...darkLayout.legend, orientation: "h", y: -0.3 },
            margin: { ...darkLayout.margin, b: 90 },
          }}
          useResizeHandler style={{ width: "100%", height: "100%" }} />
      </Box>
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
    { cls: 5, order: String.raw`T_\mathrm{p} < T_\mathrm{D24} < \mathrm{MTSR},\ T_\mathrm{D24} < \mathrm{MTT}` },
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

// ---- The dosing-vessel bench -----------------------------------------------

function tankLabel(t: number): string {
  if (t < REFILL_TIMES[0]!) return "1 s after portion 1";
  const k = REFILL_TIMES.findIndex((r) => r + 1 === t);
  return k >= 0 ? `1 s after refill ${k + 1}` : `t = ${t} s`;
}

function DosingVesselBench(
  { core, td24 }: { core: Core; td24: number },
): JSX.Element {
  const { sNorm, mw, Tp, dTad } = core;
  const tNorm = useMethodRun(SAFETY_WITNESS_TANK, tankOverrides(null),
    "norm", "choupoBatch");
  const T = TANK_WORST_T;
  const key = JSON.stringify(T);
  const s27 = useMethodRunSweep(SAFETY_WITNESS_SEMI,
    T.map((t) => semiOverrides(t, "wholeTank")), `whole27:${key}`, "choupoBatch");
  const s28 = useMethodRunSweep(SAFETY_WITNESS_TANK,
    T.map((t) => tankOverrides(t, "wholeTank")), `whole28:${key}`, "choupoBatch");
  const t27: TrajectoryData | undefined = sNorm.result?.trajectory;
  const t28: TrajectoryData | undefined = tNorm.result?.trajectory;
  const ok = fin(dTad);
  const e27 = ok ? dumpEstimate(t27, "dosingTank", mw, Tp, dTad) : null;
  const e28 = ok ? dumpEstimate(t28, "dayTank", mw, Tp, dTad) : null;
  const at = (s: Series | null, t: number): number => {
    if (!s) return NaN;
    //  The rows the worst instants sit after: the estimate is taken at the
    //  row itself (a transfer row is written after the transfer).
    const i = s.t.findIndex((r) => r >= t - 1);
    return i >= 0 ? s.y[i]! : NaN;
  };
  const x27 = t27 ? T.map((t) => dumpComposition(t27, "dosingTank", t)) : [];
  const x28 = t28 ? T.map((t) => dumpComposition(t28, "dayTank", t)) : [];
  const b27 = useBubbleSweep(x27, true);
  const b28 = useBubbleSweep(x28, true);

  const traces: object[] = [];
  if (e27) traces.push({ type: "scatter", mode: "lines",
    name: "dosing tank holds all of B: estimate, whole tank enters",
    x: hours(e27), y: e27.y, line: { color: C_SEMI, width: 2 } });
  if (e28) traces.push({ type: "scatter", mode: "lines",
    name: "day tank holds a quarter: estimate, whole day tank enters",
    x: hours(e28), y: e28.y, line: { color: C_TANK, width: 2 } });
  traces.push({ type: "scatter", mode: "markers", name: "engine, tank of all of B",
    x: T.map((t) => t / 3600), y: s27.results.map((r) => tfOf(r)?.Tmax ?? null),
    marker: { color: C_SEMI, size: 10, symbol: "diamond" } });
  traces.push({ type: "scatter", mode: "markers", name: "engine, day tank",
    x: T.map((t) => t / 3600), y: s28.results.map((r) => tfOf(r)?.Tmax ?? null),
    marker: { color: C_TANK, size: 10, symbol: "diamond" } });
  const tEnd = (e27?.t[e27.t.length - 1] ?? 18000) / 3600;
  traces.push(hline(td24, 0, tEnd, "T_D24 (assumed)", "longdash"));
  if (fin(Tp)) traces.push(hline(Tp, 0, tEnd, "T_p", "dot"));

  return (
    <Box>
      <Title order={5}>The dosing vessel: what a feed failure can deliver</Title>
      <Text size="sm" mt={4}>
        The cooling fails and, at the same instant, the WHOLE vessel connected
        to the reactor empties into it.  Left: the semi-batch witness, whose
        dosing tank holds all of B.  Right: the same reactor with a day tank
        that holds a quarter of B and is refilled from storage only when it
        is empty (no refill after a failure).  The instants are the ones at
        which that vessel is fullest: right after the first portion and right
        after each refill.
      </Text>
      <Box mt={8}>
        <Waiting runs={[tNorm, sNorm]} what="the engine is integrating the two designs" />
        <SweepStatus s={s27} what="whole-tank runs, tank of all of B" />
        <SweepStatus s={s28} what="whole-tank runs, day tank" />
        <SweepStatus s={b27.s} what="bubble points, tank of all of B" />
        <SweepStatus s={b28.s} what="bubble points, day tank" />
      </Box>
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th rowSpan={2}>failure instant</Table.Th>
              <Table.Th colSpan={4}>dosing tank holds all of B (batch27)</Table.Th>
              <Table.Th colSpan={4}>day tank holds a quarter (batch28)</Table.Th>
            </Table.Tr>
            <Table.Tr>
              <Table.Th>estimate [K]</Table.Th>
              <Table.Th>engine T_cf [K]</Table.Th>
              <Table.Th>MTT [K]</Table.Th>
              <Table.Th>class</Table.Th>
              <Table.Th>estimate [K]</Table.Th>
              <Table.Th>engine T_cf [K]</Table.Th>
              <Table.Th>MTT [K]</Table.Th>
              <Table.Th>class</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {T.map((t, i) => {
              const a = tfOf(s27.results[i])?.Tmax;
              const b = tfOf(s28.results[i])?.Tmax;
              const ma = b27.T[i] ?? NaN, mb = b28.T[i] ?? NaN;
              return (
                <Table.Tr key={t}>
                  <Table.Td>{tankLabel(t)}</Table.Td>
                  <Table.Td>{f1(at(e27, t))}</Table.Td>
                  <Table.Td>{f1(a)}</Table.Td>
                  <Table.Td>{f1(ma)}</Table.Td>
                  <Table.Td><ClassBadge v={criticalityClass(Tp, a ?? NaN, ma, td24)} /></Table.Td>
                  <Table.Td>{f1(at(e28, t))}</Table.Td>
                  <Table.Td>{f1(b)}</Table.Td>
                  <Table.Td>{f1(mb)}</Table.Td>
                  <Table.Td><ClassBadge v={criticalityClass(Tp, b ?? NaN, mb, td24)} /></Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" c="dimmed" mt={4}>
        The estimate is T_p + (n_B in the reactor + n_B in the vessel)/n_B,total
        × ΔT_ad × M_f/(M_reactor + M_vessel), from each design&apos;s
        normal-operation run.  MTT is the bubble point at {BUBBLE_P_BAR} bar of
        the reactor contents with the vessel&apos;s added, before they react;
        T_D24 is the assumed {f1(td24)} K.  These are compound scenarios -- a
        cooling failure and a feed failure -- searched at the instants listed,
        not at every instant.
      </Text>
      <Box mt={10} style={{ width: "100%", height: 340 }}>
        <Plot data={traces}
          layout={{
            ...darkLayout,
            title: { text: "T_cf if the cooling fails and the whole vessel enters",
              font: { ...darkLayout.font, size: 14 } },
            xaxis: { ...darkLayout.xaxis, title: { text: "failure time t  [h]" } },
            yaxis: { ...darkLayout.yaxis, title: { text: "temperature  [K]" } },
            legend: { ...darkLayout.legend, orientation: "h", y: -0.3 },
            margin: { ...darkLayout.margin, b: 110 },
          }}
          useResizeHandler style={{ width: "100%", height: "100%" }} />
      </Box>
    </Box>
  );
}

// ---- Lesson 2: the two ammonia loops ---------------------------------------

interface Loops { r150: MethodRunState; r50: MethodRunState;
  A: LoopReading | null; B: LoopReading | null; bad?: string }

function useLoops(): Loops {
  const r150 = useMethodRun(SAFETY_WITNESS_NH3_150, [], "base", "choupoSolve");
  const r50 = useMethodRun(SAFETY_WITNESS_NH3_50, [], "base", "choupoSolve");
  const a = readLoop(r150.result);
  const b = readLoop(r50.result);
  const bad = [a, b].find((x) => typeof x === "string") as string | undefined;
  return { r150, r50, bad,
    A: typeof a === "object" ? a : null, B: typeof b === "object" ? b : null };
}

function LoopComparison({ loops }: { loops: Loops }): JSX.Element {
  const { r150, r50, A, B, bad } = loops;
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
                volume to hold anything (lesson step 15)
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}

function VolumetricFlow({ loops }: { loops: Loops }): JSX.Element {
  const { A, B } = loops;
  const run = useMethodRun(A && B ? SAFETY_WITNESS_Z : null,
    A && B ? zOverrides(A, B) : [],
    A && B ? `${A.feedT_K},${A.feedP_Pa},${B.feedT_K},${B.feedP_Pa}` : "",
    "choupoProps");
  const za = readGasPoint(run.result, Z_OPS.p150);
  const zb = readGasPoint(run.result, Z_OPS.p50);
  const v = A && B && za && zb ? volumetricRatio(A, B, za, zb) : null;
  const R = 8.314462618;
  const q = (L: LoopReading | null, z: typeof za): number =>
    L && z ? (L.feed_kmol_h * 1000 * z.Z * R * z.T) / z.P : NaN;
  const rows: { label: string; a: string; b: string; r: string }[] = [
    { label: "molar flow F [kmol/h]", a: kmolh(A?.feed_kmol_h), b: kmolh(B?.feed_kmol_h), r: f3(v?.flow) },
    { label: "Z (engine)", a: f3(za?.Z), b: f3(zb?.Z), r: f3(v?.z) },
    { label: "T [K]", a: f1(za?.T), b: f1(zb?.T), r: f3(v?.temperature) },
    { label: "P [bar] (ratio: P150/P50)", a: f2(za ? za.P / 1e5 : NaN),
      b: f2(zb ? zb.P / 1e5 : NaN), r: f3(v?.pressure) },
    { label: "volumetric flow Q = F Z R T / P [m³/h]", a: kmolh(q(A, za)),
      b: kmolh(q(B, zb)), r: f2(v?.real) },
    { label: "the same with Z = 1 (ideal gas)", a: "", b: "", r: f2(v?.ideal) },
  ];
  return (
    <Box>
      <Waiting runs={[run]} what="the engine is evaluating Z at each converter feed" />
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>converter feed</Table.Th>
              <Table.Th>150 bar loop</Table.Th>
              <Table.Th>50 bar loop</Table.Th>
              <Table.Th>factor in Q50/Q150</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.label}>
                <Table.Td>{r.label}</Table.Td>
                <Table.Td>{r.a}</Table.Td>
                <Table.Td>{r.b}</Table.Td>
                <Table.Td>{r.r}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}

// ---- The page ---------------------------------------------------------------

export function ProcessSafetyTool(): JSX.Element {
  const core = useCore();
  const loops = useLoops();
  const [td24, setTd24] = useState(DEFAULT_TD24_K);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Process safety: remove the hazard before you add a layer</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Two case histories, then the engine on a reactor whose cooling
            fails and on an ammonia loop at a lower pressure.
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
        <Alert color="yellow" variant="light"
          title="Read before the runs: a fictitious reaction, no vapour phase, an assumed T_D24">
          <Text size="sm">
            The reaction below does not exist, the reactor cannot boil, and
            no decomposition is modelled.  Step 8 says what that means for
            every number the runs draw.
          </Text>
        </Alert>
        {step(8)}
        {step(9)}
        {step(10)}
        {step(11)}
        {step(12)}
        <CoolingFailureBench core={core} td24={td24} setTd24={setTd24} />
        {step(13)}
        <DosingVesselBench core={core} td24={td24} />
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
        {step(14)}
        <LoopComparison loops={loops} />
        {step(15)}
        <VolumetricFlow loops={loops} />
        <Text size="sm">
          Staging and fidelity:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("front-end-loading")}>
            Front-End Loading
          </Anchor>{" "}explains why a stage-2 study carries duties and no
          vessel sizes.
        </Text>

        <Accordion variant="separated" radius="sm">
          <Accordion.Item value="tech">
            <Accordion.Control>
              <Text size="sm" fw={600}>Technical note: what the page runs</Text>
            </Accordion.Control>
            <Accordion.Panel>
              {SAFETY_TECH_NOTES.map((n) => (
                <Box key={n.id} mb={8}>
                  <Text size="sm" fw={600}>{n.title}</Text>
                  <PanelNote>{n.body}</PanelNote>
                </Box>
              ))}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <LessonLimits limits={SAFETY_LIMITS} />
      </Stack>
    </Box>
  );
}
