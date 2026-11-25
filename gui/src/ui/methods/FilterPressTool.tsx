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
  FilterPressTool -- "When do I open the press?" (C511).

  THE TASK, in one sentence: a plate-and-frame press has a dead time for
  discharge and cleaning; at what cake size should it be opened to pass the
  most filtrate per hour, and how much is lost by opening early or late?

  Every number is read from the engine's own run of the bundled case
  filter02_caco3_pressWashing (choupoSolve, in the browser): K_p, B, the
  cycle, the wash.  The curve is the algebra of filterCycle.ts on those
  numbers; the dots are further engine runs of the same case, at other
  volumes per cycle and at the slider's dead time, so the reader sees the
  algebra sit on the engine.  The optimum is the page's algebra, and says so.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Box, Group, Loader, Stack, Switch, Table, Text, Title } from "@mantine/core";

import type { RunResult } from "../../adapters/SolverAdapter.js";
import { useMethodRun, useMethodRunSweep, type DictOverride } from "../../case/methodRun.js";
import { DryChart, type ChartGuide, type ChartSeries } from "./DryChart.js";
import {
  averageRate, band, cycleTime, factsFromKpis, filtrationTime, optimum, pressesFor,
  rateRatio, washTime, type PressFacts,
} from "./filterCycle.js";
import { PRESS_LIMITS, PRESS_QUIZ, PRESS_STEPS } from "./filterPressCycleLesson.js";
import { KnobSlider } from "./knobPanel.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";

const g4 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? String(Number(v.toPrecision(4))) : "—";
const BOX = {
  border: "1px solid var(--mantine-color-default-border)", borderRadius: 4,
} as const;
const SCROLL = { overflowX: "auto", maxWidth: "100%" } as const;

/** The bundled case, relative to tutorials/. */
export const PRESS_WITNESS = "steady/solids/filter02_caco3_pressWashing";
const UNIT = "press";

/** The case's own cycle, as authored in its flowsheetDict (the test holds
 *  these two to the bundled text). */
export const AUTHORED_V_M3 = 3.37;
export const AUTHORED_TCLEAN_MIN = 20;

/** The dead-time slider, in minutes. */
export const DEAD_KNOB = {
  id: "cleaning", label: "dead time t_d: discharge and cleaning", unit: "min",
  min: 5, max: 90, step: 1, def: AUTHORED_TCLEAN_MIN,
  why: "the case's `cleaningTime`: the time the press is shut down and delivers nothing; "
    + "the engine takes it as one number, whatever the cake",
} as const;

/** The volumes per cycle at which the engine is run again, m3: the case's own
 *  first, then a spread that brackets the optimum for every dead time of the box. */
export const SWEEP_V: readonly number[] = [AUTHORED_V_M3, 1.5, 5, 6, 8, 10];

export function sweepOverrides(tCleanMin: number): DictOverride[][] {
  return SWEEP_V.map((V): DictOverride[] => [
    { file: "system/flowsheetDict", key: "filtratePerCycle", value: V, unit: "m3" },
    { file: "system/flowsheetDict", key: "cleaningTime", value: tCleanMin, unit: "min" },
  ]);
}

const kpisOf = (r: RunResult | null | undefined): { [k: string]: number } | undefined =>
  r?.kpis?.[UNIT];

const H = 3600;
const ENGINE_COLOR = "#e8590c";
const CURVE_COLOR = "#1c7ed6";
const OPT_COLOR = "#2f9e44";

/** The multiples of V_* the table prints: x and 1/x in pairs. */
export const TABLE_X: readonly number[] = [1 / 3, 1 / 2, 2 / 3, 1, 1.5, 2, 3];
export const BAND_SHARE = 0.95;

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

export function FilterPressTool(): JSX.Element {
  const step = lessonStepper(PRESS_STEPS);
  const base = useMethodRun(PRESS_WITNESS, [], "", "choupoSolve");
  const [tMin, setTMin] = useState<number>(DEAD_KNOB.def);
  const [wash, setWash] = useState<boolean>(true);
  const sets = useMemo(() => sweepOverrides(tMin), [tMin]);
  const sweep = useMethodRunSweep(PRESS_WITNESS, sets, String(tMin), "choupoSolve");

  const eng = factsFromKpis(kpisOf(base.result));
  const kb = kpisOf(base.result);
  const tD = tMin * 60;
  const model: PressFacts | null = eng
    ? { ...eng.facts, washOverFactor: wash ? eng.facts.washOverFactor : 0 } : null;

  const view = useMemo(() => {
    if (!eng || !model) return null;
    const o = optimum(model, tD);
    const V0 = eng.V;
    const vmax = Math.max(3 * o.V, 1.15 * Math.max(...SWEEP_V));
    const pts: (readonly [number, number])[] = [];
    for (let i = 1; i <= 120; i++) {
      const V = (vmax * i) / 120;
      pts.push([V, H * averageRate(model, V, tD)]);
    }
    const dots = wash
      ? SWEEP_V.flatMap((V, i) => {
        const k = kpisOf(sweep.results[i]);
        const tc = k?.["cycleTime_s"];
        return typeof tc === "number" && tc > 0 ? [{ V, tc, r: H * V / tc }] : [];
      }) : [];
    let gap = 0;
    for (const d of dots) {
      const page = H * averageRate(model, d.V, tD);
      gap = Math.max(gap, Math.abs(d.r - page) / page);
    }
    const bnd = band(model, tD, BAND_SHARE);
    const rate0 = averageRate(model, V0, tD);
    const rows = TABLE_X.map((x) => {
      const V = x * o.V;
      const tc = cycleTime(model, V, tD);
      return {
        x, V, tf: filtrationTime(model, V), tw: washTime(model, V), tc,
        rate: H * V / tc, share: rateRatio(o.beta, x),
        thick: kb?.["cakeThickness_mm"] !== undefined ? kb["cakeThickness_mm"]! * V / V0 : null,
        presses: pressesFor(eng.Qf, V, tc),
      };
    });
    return { o, V0, vmax, pts, dots, gap, bnd, rate0, rows };
  }, [eng, model, tD, wash, sweep.results, kb]);

  const series: ChartSeries[] = view ? [
    { id: "page", label: "average rate V / t_c (the page's algebra on the engine's K_p and B)",
      color: CURVE_COLOR, pts: view.pts },
    ...(view.dots.length ? [{
      id: "engine", label: "engine runs of the case at other volumes (same dead time)",
      color: ENGINE_COLOR, dots: true, noLine: true,
      pts: view.dots.map((d) => [d.V, d.r] as const),
    }] : []),
    { id: "now", label: "the case's own cycle", color: "#212529", dots: true, noLine: true,
      pts: [[view.V0, H * view.rate0] as const] },
  ] : [];
  const guides: ChartGuide[] = view ? [
    { dir: "v", at: view.o.V, label: "V*", color: OPT_COLOR },
    { dir: "h", at: H * view.o.rate * BAND_SHARE, label: "95 % of the maximum", color: "#868e96", dash: "2 4" },
  ] : [];
  const problems = [base.err, ...sweep.errs].filter((e): e is string => !!e);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>When do I open the press?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A plate-and-frame press filters at constant pressure, and every cycle ends with a dead
            time for discharge and cleaning.  The average rate over a whole cycle has a maximum, and
            it is flat.  The numbers below are the engine&apos;s own press, run in your browser.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}
        {step(5)}

        <Box px="sm" py={8} style={BOX} data-card="cycle">
          <Title order={5}>Try it: move the dead time</Title>
          <OriginMark of={["engine", "page"]}
            note="K_p, B, the wash and the cycle are the KPIs of an engine run of filter02_caco3_pressWashing; the curve and the optimum are algebra on them; the dots are six more engine runs" />
          <Group gap="md" mt={6} align="flex-start" wrap="wrap">
            <Box w={280} maw="100%">
              <KnobSlider knob={DEAD_KNOB} value={tMin} onChange={setTMin} showWhy />
              <Switch mt={10} size="sm" checked={wash} onChange={(e) => setWash(e.currentTarget.checked)}
                label="count the washing (the engine's case washes)" data-wash-switch="" />
            </Box>
            <Box style={{ flex: 1, minWidth: 260 }}>
              {eng && model && view ? (
                <Group gap="sm" wrap="wrap" data-readouts="">
                  <Readout dataKey="Vstar" label="best volume per cycle V*" value={g4(view.o.V)} unit="m3" />
                  <Readout dataKey="Rstar" label="best average rate" value={g4(H * view.o.rate)} unit="m3/h" />
                  <Readout dataKey="Rnow" label={`the case's cycle, V = ${g4(view.V0)} m3`}
                    value={g4(H * view.rate0)} unit="m3/h" />
                  <Readout dataKey="share" label="the case's cycle, share of the maximum"
                    value={g4(100 * view.rate0 / view.o.rate)} unit="%" />
                </Group>
              ) : (base.busy ? <Loader size="xs" /> : null)}
            </Box>
          </Group>

          <Box mt={8} data-chart="rate">
            <DryChart series={series} guides={guides} xLabel="filtrate per cycle V, m3"
              yLabel="average rate over the whole cycle, m3/h" yZero xZero
              aria="Average filtrate rate over a whole press cycle against the volume per cycle, with its flat maximum, the case's own cycle and engine runs on the curve" />
            {(base.busy || sweep.busy) && (
              <Group gap={6}><Loader size="xs" /><Text size="xs" c="dimmed">running the press</Text></Group>
            )}
          </Box>

          {eng && model && view && (
            <>
              <Text size="sm" mt={6} data-summary="">
                {wash
                  ? <>At t_d = {tMin} min the rate peaks at <strong>{g4(view.o.V)} m3</strong> per cycle:
                    filtering {g4(view.o.tFilt / 60)} min and washing {g4(view.o.tWash / 60)} min.  The
                    time that grows as V<sup>2</sup> is {g4(view.o.quadraticTime / 60)} min against t_d
                    = {g4(tD / 60)} min (they are equal at the optimum, step 3).</>
                  : <>With no washing, at t_d = {tMin} min the rate peaks at <strong>{g4(view.o.V)} m3</strong> per
                    cycle, where t_f = {g4(view.o.tFilt / 60)} min and t_d + B V* = {g4((tD + eng.facts.B * view.o.V) / 60)} min:
                    the classical rule, the filtration time equal to the dead time plus the cloth&apos;s share.</>}
                {" "}Within 5 % of the maximum from {g4(view.bnd.lo)} m3 to {g4(view.bnd.hi)} m3 per cycle.
              </Text>
              {wash && view.dots.length > 0 && (
                <Text size="xs" c="dimmed" mt={2} data-gap="">
                  The six engine runs sit on the page&apos;s curve to within {g4(100 * view.gap)} % in the
                  average rate.  The optimum itself is not an engine run: it is the algebra of steps 2 to 4.
                </Text>
              )}
              <Title order={6} mt={10}>How much is lost by opening early or late</Title>
              <Box style={SCROLL}>
                <Table withTableBorder withColumnBorders fz="xs" data-loss-table="">
                  <Table.Thead><Table.Tr>
                    <Table.Th>V / V*</Table.Th><Table.Th>V, m3</Table.Th>
                    <Table.Th>filter, min</Table.Th><Table.Th>wash, min</Table.Th>
                    <Table.Th>cycle, min</Table.Th><Table.Th>rate, m3/h</Table.Th>
                    <Table.Th>share of maximum, %</Table.Th>
                    <Table.Th>cake, mm</Table.Th><Table.Th>presses for the feed</Table.Th>
                  </Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {view.rows.map((r) => (
                      <Table.Tr key={r.x} data-loss-row={g4(r.x)} fw={r.x === 1 ? 700 : undefined}>
                        <Table.Td>{g4(r.x)}</Table.Td><Table.Td>{g4(r.V)}</Table.Td>
                        <Table.Td>{g4(r.tf / 60)}</Table.Td><Table.Td>{g4(r.tw / 60)}</Table.Td>
                        <Table.Td>{g4(r.tc / 60)}</Table.Td><Table.Td>{g4(r.rate)}</Table.Td>
                        <Table.Td data-col="share">{g4(100 * r.share)}</Table.Td>
                        <Table.Td>{g4(r.thick)}</Table.Td><Table.Td>{g4(r.presses)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
              <Text size="xs" c="dimmed" mt={4}>
                The rows at V/V* = 1/2 and 2 (and at 1/3 and 3) lose the same share: the curve is
                symmetric in x and 1/x (step 4).  The cake thickness is the engine&apos;s value at
                the case&apos;s cycle ({g4(kb?.["cakeThickness_mm"])} mm at {g4(view.V0)} m3), scaled in
                proportion to V.  The engine does not compare it with the depth of a frame.  Presses
                for the feed is Q_f t_c / V, the engine&apos;s own definition (CakeFilter.cpp:406); the
                case&apos;s own count is {g4(kb?.["pressesRequired"])}.
              </Text>
              <Text size="xs" c="dimmed" mt={4} data-engine-facts="">
                Engine numbers read: K_p = {g4(eng.facts.Kp)} s/m6, B = {g4(eng.facts.B)} s/m3,
                w/f = {g4(eng.facts.washOverFactor)}, case cycle {g4(eng.tc)} s with t_d = {g4(kb?.["cleaningTime_s"])} s
                (the engine run at the case&apos;s own 20 min).
              </Text>
            </>
          )}
          {problems.map((e) => <Text key={e} size="xs" c="red" ff="monospace">{e}</Text>)}
        </Box>

        <LessonQuiz title="Check your understanding" questions={PRESS_QUIZ} lesson={PRESS_STEPS} />
        <LessonLimits limits={PRESS_LIMITS} title="What this does not show" />
        <LessonReferences tool="filter-press-cycle" />
      </Stack>
    </Box>
  );
}
