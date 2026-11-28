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
  HowManyPhasesTool -- "How many phases? Gibbs energy and the tangent plane".

  THE TASK, in one sentence: a solver has found two liquids with equal
  activities -- is that the answer, and if a phase were absent how would
  the engine know?

  Every curve is a table of the engine's own run (in the browser) of the
  bundled case props/scan/binary04_tangent_plane_water_nbutanol, which is
  propertyScanBinary with its `stability` block: g_mix, the two coexisting
  liquids of the liquid-liquid flash, the activities of both components, the
  activities in the two liquids, and the tangent-plane distance of the
  declared feed with the verdict of the engine's own Michelsen test.  The page
  adds the lever rule, the common tangent and the tangent-plane distance for
  the feed on the slider, as arithmetic on the engine's activities
  (phaseTangent.ts); no activity model is evaluated here.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Box, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { DryChart, type ChartGuide, type ChartSeries } from "./DryChart.js";
import { PHASES_LIMITS, PHASES_QUIZ, PHASES_STEPS } from "./howManyPhasesLesson.js";
import { KnobSlider } from "./knobPanel.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";
import {
  commonTangent, gOverRT, isoActivityPairs, lever, nodeOf, phasesFromViews,
  stationaryPoints, tangentAt, tmCurve, verdictAt, type PhasesData,
} from "./phaseTangent.js";

const g4 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? String(Number(v.toPrecision(4))) : "—";
const BOX = {
  border: "1px solid var(--mantine-color-default-border)", borderRadius: 4,
} as const;
const SCROLL = { overflowX: "auto", maxWidth: "100%" } as const;
const CURVE = "#1c7ed6";
const LINE = "#e8590c";
const OK = "#2f9e44";
const BAD = "#c92a2a";
const FLAG = "#868e96";

/** The bundled case, relative to tutorials/. */
export const PHASES_WITNESS = "props/scan/binary04_tangent_plane_water_nbutanol";
/** The case's temperature, K (the test holds it to the propsDict). */
export const CASE_T_K = 298.15;
/** The feed the case declares for the engine's own Michelsen test. */
export const ENGINE_FEED = 0.8;

/** The feed slider: mole fraction of water, stepping on the engine's nodes. */
export const FEED_KNOB = {
  id: "feed", label: "feed composition z (mole fraction of water)", unit: "-",
  min: 0.02, max: 0.98, step: 0.01, def: ENGINE_FEED,
  why: "the feed of the lever rule and of the tangent-plane test; it steps on the "
    + "engine's own composition nodes so its activities are the engine's numbers",
} as const;

function Readout({ label, value, unit, dataKey }: {
  label: string; value: string; unit: string; dataKey: string;
}): JSX.Element {
  return (
    <Box px="sm" py={6} style={BOX} data-readout={dataKey} miw={150}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="lg" fw={600}>{value} <Text span size="xs" c="dimmed">{unit}</Text></Text>
    </Box>
  );
}

/** The lines of the engine's log the page quotes (the flash card). */
export function quotedLines(log: string | null | undefined): string[] {
  if (!log) return [];
  const keep = /Michelsen TPD stability test|tm_min|\[binaryLLE\]|\[tangentPlane\]/;
  return log.split(/\r?\n/).map((l) => l.trim()).filter((l) => keep.test(l));
}

/** The page: runs the bundled case in the browser and hands its tables to the view. */
export function HowManyPhasesTool(): JSX.Element {
  const run = useMethodRun(PHASES_WITNESS, [], "", "choupoProps");
  const files = run.result?.csvFiles;
  const d: PhasesData | null = useMemo(() => {
    if (!files) return null;
    const keys = Object.keys(files);
    const get = (view: string): string | undefined => {
      const k = keys.find((p) => p.endsWith(`/${view}.csv`));
      return k === undefined ? undefined : files[k];
    };
    return phasesFromViews(get, CASE_T_K);
  }, [files]);
  return (
    <HowManyPhasesView d={d} log={run.log ?? run.result?.log ?? null}
      busy={run.busy} err={run.err} ran={!!run.result} />
  );
}

/** What the page draws from the engine's tables (separate so it can be rendered
 *  from a recorded run without a browser engine). */
export function HowManyPhasesView({ d, log: rawLog, busy, err, ran, initialFeed = FEED_KNOB.def }: {
  d: PhasesData | null; log: string | null; busy: boolean; err: string | null; ran: boolean;
  /** The feed the slider starts at (a recorded-run render starts it elsewhere). */
  initialFeed?: number;
}): JSX.Element {
  const step = lessonStepper(PHASES_STEPS);
  const [z, setZ] = useState<number>(initialFeed);

  const k = d ? nodeOf(d, z) : 0;
  const zNode = d ? d.x[k]! : z;
  const view = useMemo(() => {
    if (!d) return null;
    const ct = commonTangent(d);
    const lv = lever(d, zNode);
    const tm = tmCurve(d, k);
    const verdict = verdictAt(d, k);
    const stat = stationaryPoints(d, k);
    const tan = tangentAt(d, k);
    const gz = gOverRT(d, k);
    const RT = d.gJ[k]! / gz;
    const gLine = ct ? ct.intercept + ct.slope * zNode : NaN;
    const pairs = isoActivityPairs(d);
    return { ct, lv, tm, verdict, stat, tan, gz, RT, gLine, pairs };
  }, [d, k, zNode]);

  const gSeries: ChartSeries[] = d && view ? [
    { id: "g", label: "g_mix / RT (the engine's gmix table)", color: CURVE,
      pts: d.x.map((x, j) => [x, d.gJ[j]! / view.RT] as const) },
    ...(view.ct ? [
      { id: "tangent", label: "common tangent through the two coexisting liquids", color: LINE,
        pts: [[view.ct.xa, view.ct.ga], [view.ct.xb, view.ct.gb]] as const },
      { id: "binodal", label: "coexisting liquids (the flash's binodal)", color: LINE, dots: true, noLine: true,
        pts: [[view.ct.xa, view.ct.ga], [view.ct.xb, view.ct.gb]] as const },
    ] : []),
  ] : [];
  const feedSeries: ChartSeries[] = d && view ? [
    { id: "feed", label: "the feed on the curve", color: "#212529", dots: true, noLine: true,
      pts: [[zNode, view.gz] as const] },
    ...(view.lv?.inside ? [{
      id: "split", label: "the feed split on the tangent", color: OK, dots: true, noLine: true,
      pts: [[zNode, view.gLine] as const],
    }] : []),
  ] : [];

  const aSeries: ChartSeries[] = d ? [
    { id: "a1", label: "a1, activity of water", color: CURVE, pts: d.x.map((x, j) => [x, d.a1[j]!] as const) },
    { id: "a2", label: "a2, activity of n-butanol", color: LINE, pts: d.x.map((x, j) => [x, d.a2[j]!] as const) },
    ...(d.binAct.length === 2 ? [
      { id: "iso1", label: "the two liquids on a1", color: CURVE, dots: true, noLine: true,
        pts: d.binAct.map((b) => [b.x, b.a1] as const) },
      { id: "iso2", label: "the two liquids on a2", color: LINE, dots: true, noLine: true,
        pts: d.binAct.map((b) => [b.x, b.a2] as const) },
    ] : []),
  ] : [];
  const aGuides: ChartGuide[] = d && d.binAct.length === 2 ? [
    { dir: "h", at: d.binAct[0]!.a1, label: "equal a1", color: CURVE, dash: "2 4" },
    { dir: "h", at: d.binAct[0]!.a2, label: "equal a2", color: LINE, dash: "2 4" },
    { dir: "v", at: d.binAct[0]!.x, label: "x'", color: FLAG },
    { dir: "v", at: d.binAct[1]!.x, label: "x''", color: FLAG },
  ] : [];

  const tmSeries: ChartSeries[] = view ? [
    { id: "tm", label: "tm(y) for the feed on the slider", color: CURVE,
      pts: view.tm.filter((p) => !p.binodal).map((p) => [p.y, p.tm] as const) },
    { id: "stationary", label: "stationary points on the sampled curve", color: BAD, dots: true, noLine: true,
      dotColors: view.stat.map((s) => (s.kind === "trivial" ? FLAG : s.tm < 0 ? BAD : OK)),
      pts: view.stat.map((s) => [s.y, s.tm] as const) },
    ...(view.tm.some((p) => p.binodal) ? [{
      id: "binodal-tm", label: "the two coexisting liquids as trial phases", color: LINE, dots: true, noLine: true,
      pts: view.tm.filter((p) => p.binodal).map((p) => [p.y, p.tm] as const),
    }] : []),
  ] : [];
  const log = quotedLines(rawLog);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>How many phases? Gibbs energy and the tangent plane</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Equal fugacities in two liquids are necessary for equilibrium, not sufficient: the
            trivial pair, a split that is only a local minimum and a split into the wrong number of
            phases meet them too.  Equilibrium is the global minimum of the Gibbs energy, and
            Michelsen&apos;s tangent-plane test decides whether a phase is absent.  The system is
            water and 1-butanol at {CASE_T_K} K and 1 bar; every curve is the engine&apos;s own run,
            in your browser.
          </Text>
          {busy && <Group gap={6} mt={4}><Loader size="xs" /><Text size="xs" c="dimmed">running the engine</Text></Group>}
          {err && <Text size="xs" c="red" ff="monospace">{err}</Text>}
          {!busy && !err && ran && !d && (
            <Text size="xs" c="red" data-no-tables="">
              The run finished but the tables of the case (lleMap, activity, tpd) are not in its
              outputs: the page has nothing to draw.
            </Text>
          )}
        </Box>

        {step(1)}
        <Box px="sm" py={8} style={BOX} data-card="gmix">
          <Title order={5}>The Gibbs energy of mixing has two humps</Title>
          <OriginMark of={["engine"]} note="the gmix table of the engine's propertyScanBinary run" />
          <Box mt={6} data-chart="gmix">
            <DryChart series={gSeries} xLabel="mole fraction of water, x1" yLabel="g_mix / RT"
              xDomain={[0, 1]}
              aria="Molar Gibbs energy of mixing of water and n-butanol against composition, with the common tangent through the two coexisting liquids" />
          </Box>
          {d && view?.ct && (
            <Text size="sm" mt={4} data-summary="gmix">
              The curve is not convex between x1 = {g4(view.ct.xa)} and x1 = {g4(view.ct.xb)}: a
              straight line (the common tangent) touches it at both and lies below it in between.
              Those two compositions are the liquids the engine&apos;s flash found.
            </Text>
          )}
        </Box>

        {step(2)}
        <Box px="sm" py={8} style={BOX} data-card="tangent">
          <Title order={5}>The common tangent: move the feed</Title>
          <OriginMark of={["engine", "page"]}
            note="the curve and the two liquids are the engine's tables; the lever rule and the line value at the feed are the page's arithmetic" />
          <Group gap="md" mt={6} align="flex-start" wrap="wrap">
            <Box w={280} maw="100%">
              <KnobSlider knob={FEED_KNOB} value={zNode} onChange={setZ} showWhy />
            </Box>
            <Box style={{ flex: 1, minWidth: 260 }}>
              {d && view?.lv && (
                <Group gap="sm" wrap="wrap" data-readouts="tangent">
                  <Readout dataKey="verdict" label="the feed" unit=""
                    value={view.lv.inside ? "splits into two liquids" : "stays one liquid"} />
                  <Readout dataKey="betaLo" label="butanol-rich liquid, fraction"
                    value={g4(view.lv.betaLo)} unit="-" />
                  <Readout dataKey="betaHi" label="water-rich liquid, fraction"
                    value={g4(view.lv.betaHi)} unit="-" />
                  <Readout dataKey="drop" label="fall of the mixture's G on splitting"
                    value={view.lv.inside ? g4((view.gz - view.gLine) * view.RT) : "0"} unit="J/mol" />
                </Group>
              )}
            </Box>
          </Group>
          <Box mt={8} data-chart="tangent">
            <DryChart series={[...gSeries, ...feedSeries]} xLabel="mole fraction of water, x1"
              yLabel="g_mix / RT" xDomain={[0, 1]}
              aria="Gibbs energy of mixing with the common tangent and the feed on the curve and, inside the two-liquid region, on the tangent" />
          </Box>
          {d && view?.lv && d.binodal.length === 2 && (
            <Text size="xs" c="dimmed" mt={4} data-engine-betas="">
              The engine&apos;s own flash, for its declared feed z = {g4(ENGINE_FEED)}, gave the fractions{" "}
              {g4(d.binodal[0]!.beta)} and {g4(d.binodal[1]!.beta)}; the lever rule on the two
              compositions at that feed gives the same.  Outside the two liquids one of the lever
              fractions is negative or above one: there is nothing to split.
            </Text>
          )}
        </Box>

        {step(3)}
        <Box px="sm" py={8} style={BOX} data-card="isoactivity">
          <Title order={5}>Three solutions of equal activities</Title>
          <OriginMark of={["engine", "page"]}
            note="a1, a2 and the activities in the two liquids are engine tables; the pairs found on the sampled curves are the page's reading" />
          <Box mt={6} data-chart="activity">
            <DryChart series={aSeries} guides={aGuides} xLabel="mole fraction of water, x1"
              yLabel="activity" xDomain={[0, 1]}
              aria="Activities of water and n-butanol against composition, with the two liquids of the flash at equal activity levels" />
          </Box>
          {d && view && d.binAct.length === 2 && (
            <>
              <Box style={SCROLL} mt={6}>
                <Table withTableBorder withColumnBorders fz="xs" data-iso-table="">
                  <Table.Thead><Table.Tr>
                    <Table.Th>solution</Table.Th><Table.Th>x&apos;</Table.Th><Table.Th>x&apos;&apos;</Table.Th>
                    <Table.Th>a1(x&apos;&apos;) - a1(x&apos;)</Table.Th><Table.Th>a2(x&apos;&apos;) - a2(x&apos;)</Table.Th>
                    <Table.Th>what it is</Table.Th>
                  </Table.Tr></Table.Thead>
                  <Table.Tbody>
                    <Table.Tr data-iso-row="trivial">
                      <Table.Td>trivial</Table.Td><Table.Td>any</Table.Td><Table.Td>= x&apos;</Table.Td>
                      <Table.Td>0</Table.Td><Table.Td>0</Table.Td>
                      <Table.Td>two identical &quot;phases&quot;, K = 1: met at every composition</Table.Td>
                    </Table.Tr>
                    <Table.Tr data-iso-row="true">
                      <Table.Td>the engine&apos;s pair</Table.Td>
                      <Table.Td>{g4(d.binAct[0]!.x)}</Table.Td><Table.Td>{g4(d.binAct[1]!.x)}</Table.Td>
                      <Table.Td>{(d.binAct[1]!.a1 - d.binAct[0]!.a1).toExponential(1)}</Table.Td>
                      <Table.Td>{(d.binAct[1]!.a2 - d.binAct[0]!.a2).toExponential(1)}</Table.Td>
                      <Table.Td>the global minimum of G: the common tangent</Table.Td>
                    </Table.Tr>
                    <Table.Tr data-iso-row="found">
                      <Table.Td>read off the curves</Table.Td>
                      <Table.Td>{view.pairs.length ? g4(view.pairs[0]!.lo) : "—"}</Table.Td>
                      <Table.Td>{view.pairs.length ? g4(view.pairs[0]!.hi) : "—"}</Table.Td>
                      <Table.Td>0 by construction</Table.Td><Table.Td>sign change</Table.Td>
                      <Table.Td>{view.pairs.length} non-trivial pair{view.pairs.length === 1 ? "" : "s"}
                        {" "}found on the sampled curves, to the grid&apos;s resolution</Table.Td>
                    </Table.Tr>
                    <Table.Tr data-iso-row="wrong-number">
                      <Table.Td>the wrong number of phases</Table.Td>
                      <Table.Td>{g4(d.binAct[0]!.x)}</Table.Td><Table.Td>{g4(d.binAct[1]!.x)}</Table.Td>
                      <Table.Td>0</Table.Td><Table.Td>0</Table.Td>
                      <Table.Td>
                        {view.lv?.inside
                          ? `the same pair for the feed on the slider is a real split (fractions ${g4(view.lv.betaLo)} and ${g4(view.lv.betaHi)}); move the feed outside the two liquids`
                          : `the same pair for the feed on the slider gives fractions ${g4(view.lv?.betaLo)} and ${g4(view.lv?.betaHi)}: one is negative or above one, so a two-phase answer is wrong`}
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Box>
              <Text size="xs" c="dimmed" mt={4}>
                A Newton method on the two equations can converge to the trivial row with zero
                residual (the K = 1 trap of the Theory Guide, section on liquid-liquid equilibrium by Gibbs minimisation); the engine&apos;s liquid-liquid flash minimises the
                Gibbs energy instead (IsothermalFlash.cpp:584-605).
              </Text>
            </>
          )}
        </Box>

        {step(4)}
        <Box px="sm" py={8} style={BOX} data-card="tpd">
          <Title order={5}>The tangent-plane distance, drawn</Title>
          <OriginMark of={["engine", "page"]}
            note="tm(y) is arithmetic on the engine's activity table; for the engine's declared feed it equals the engine's tpd table, and the engine's own Michelsen verdict is quoted beside it" />
          <Group gap="md" mt={6} align="flex-start" wrap="wrap">
            <Box w={280} maw="100%">
              <KnobSlider knob={FEED_KNOB} value={zNode} onChange={setZ} showWhy />
            </Box>
            <Box style={{ flex: 1, minWidth: 260 }}>
              {d && view && (
                <Group gap="sm" wrap="wrap" data-readouts="tpd">
                  <Readout dataKey="tmVerdict" label="the feed on the slider is" unit=""
                    value={view.verdict.unstable ? "unstable: a phase is absent" : "stable: one liquid"} />
                  <Readout dataKey="tmMin" label="lowest tm over the trial compositions"
                    value={g4(view.verdict.tmMin)} unit="-" />
                  <Readout dataKey="tmAt" label="at the trial composition y1 ="
                    value={g4(view.verdict.y)} unit="-" />
                </Group>
              )}
            </Box>
          </Group>
          <Box mt={8} data-chart="tpd">
            <DryChart series={tmSeries}
              guides={[{ dir: "h", at: 0, label: "tm = 0 (the tangent)", color: FLAG, dash: "2 4" },
                { dir: "v", at: zNode, label: "z", color: "#212529", dash: "2 4" }]}
              xLabel="trial mole fraction of water, y" yLabel="tm(y)" xDomain={[0, 1]}
              aria="Tangent-plane distance of the feed against the trial composition, with its stationary points marked" />
          </Box>
          {d && view && (
            <Text size="sm" mt={4} data-summary="tpd">
              {view.verdict.unstable
                ? <>At z = {g4(zNode)} the distance goes below zero (down to {g4(view.verdict.tmMin)} at
                  y = {g4(view.verdict.y)}): a small amount of that composition would lower the Gibbs
                  energy, so one liquid is not the answer.</>
                : <>At z = {g4(zNode)} the distance is never below zero (its lowest value is {g4(view.verdict.tmMin)}, at
                  y = {g4(view.verdict.y)}): no trial phase lowers the Gibbs energy, one liquid is stable.</>}
              {" "}Stationary points on the sampled curve: {view.stat.map((s) => `${s.kind} at y = ${g4(s.y)}`).join("; ") || "none"}.
            </Text>
          )}
          {d?.stationary && (
            <Text size="xs" c="dimmed" mt={4} data-engine-verdict="">
              The engine&apos;s own Michelsen test, run on its declared feed z = {g4(d.stationary.feed)}: {d.stationary.unstable ? "UNSTABLE" : "stable"},
              lowest value {g4(d.stationary.tmMin)} (its own modified form, one minus the sum of the Y at a
              stationary point), incipient phase at y = {g4(d.stationary.y1)}.  Move the slider to that feed
              and the page&apos;s verdict is the same.
            </Text>
          )}
        </Box>

        {step(5)}
        <Box px="sm" py={8} style={BOX} data-card="engine">
          <Title order={5}>One flash, run by the engine</Title>
          <OriginMark of="engine" note="the log of the engine's run of the case, quoted line by line" />
          {log.length > 0
            ? <Box component="pre" mt={6} p="xs" style={{ ...BOX, overflowX: "auto", fontSize: 12, margin: 0 }}
                data-engine-log="">{log.join("\n")}</Box>
            : <Text size="xs" c="dimmed" mt={6}>The log could not be read.</Text>}
          {d && d.binodal.length === 2 && (
            <Text size="sm" mt={6} data-summary="engine">
              The liquid-liquid flash found the two liquids at x1 = {g4(d.binodal[0]!.x)} and{" "}
              {g4(d.binodal[1]!.x)}: the same two points the common tangent of the common-tangent card touches, and the
              pair of the equal-activities card.
            </Text>
          )}
        </Box>

        <LessonQuiz title="Check your understanding" questions={PHASES_QUIZ} lesson={PHASES_STEPS} />
        <LessonLimits limits={PHASES_LIMITS} title="What this does not show" />
        <LessonReferences tool="how-many-phases" />
      </Stack>
    </Box>
  );
}
