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
  GasLineTool -- "How far can a gas line go?" (C506).

  THE TASK, in one sentence: a gas flows through a long pipe; how far does
  the pressure fall, how wrong is the textbook shortcut, and how long can
  the line be before the steady isothermal equation has no solution?

  The fixed inputs (nitrogen, 8 bar, 300 K, 50 mm steel pipe) are those of
  the engine's tutorial pipe09_isothermal_gas_line, whose golden run
  gasLine.test.ts holds the page's numbers to at the case's own flow and
  length.  The two sliders move the flow and the length; the curves are the
  algebra of gasLine.ts, the same arithmetic as Pipe::solveGasLine.  The page
  does not run the engine in the browser: every number is the page's own
  arithmetic, checked against the recorded engine run.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Box, Group, Stack, Table, Text, Title } from "@mantine/core";

import { DryChart, type ChartGuide, type ChartSeries } from "./DryChart.js";
import {
  ADVISORY_DROP, PIPE09, PIPE09_FLOW_KMOLH, PIPE09_L_M, adiabaticMachAtChoke,
  errorCurve, gasLine, gasState, lengthAtDrop, machAt, profile,
} from "./gasLine.js";
import { GAS_LIMITS, GAS_QUIZ, GAS_STEPS } from "./gasLineLesson.js";
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
const EXACT_COLOR = "#1c7ed6";
const MEAN_COLOR = "#e8590c";
const CHOKE_COLOR = "#c92a2a";
const FLAG_COLOR = "#868e96";
const BAR = 1e-5;

/** The flow slider, kmol/h.  The upper end stays below the flow at which the
 *  page's own inlet reaches the isothermal sonic limit (about 676 kmol/h at
 *  8 bar in 50 mm), where the engine stops the run at the entrance. */
export const FLOW_KNOB = {
  id: "flow", label: "flow of nitrogen", unit: "kmol/h",
  min: 5, max: 150, step: 1, def: PIPE09_FLOW_KMOLH,
  why: "the case's feed flow; it sets the mass flux G, so the Reynolds number, f, "
    + "the choking pressure and the longest line all move with it",
} as const;

/** The length slider, m: past L_max the engine stops the run, and the page shows that. */
export const LENGTH_KNOB = {
  id: "length", label: "length of the line", unit: "m",
  min: 10, max: 1000, step: 10, def: PIPE09_L_M,
  why: "the case's `L`; lengthen it toward L_max and watch the shortcut fail",
} as const;

/** The lengths of the shortcut's table: pipe09's README rows. */
export const TABLE_L: readonly number[] = [10, 100, 300, 500, 540, 548];

/** The adiabatic heat-capacity ratio the page assumes for its one remark on
 *  the adiabatic Mach number (a diatomic ideal gas).  The engine does not use it. */
export const GAMMA_ASSUMED = 1.4;

function Readout({ label, value, unit, dataKey }: {
  label: string; value: string; unit: string; dataKey: string;
}): JSX.Element {
  return (
    <Box px="sm" py={6} style={BOX} data-readout={dataKey} miw={140}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="lg" fw={600}>{value} <Text span size="xs" c="dimmed">{unit}</Text></Text>
    </Box>
  );
}

export function GasLineTool(): JSX.Element {
  const step = lessonStepper(GAS_STEPS);
  const [flow, setFlow] = useState<number>(FLOW_KNOB.def);
  const [len, setLen] = useState<number>(LENGTH_KNOB.def);

  const line = useMemo(() => gasLine(PIPE09, flow, len), [flow, len]);
  const st = useMemo(() => gasState(PIPE09, flow), [flow]);
  const L40 = useMemo(() => lengthAtDrop(PIPE09, flow, ADVISORY_DROP), [flow]);
  const choked = line.verdict !== "ok";

  //  Card 1: the profile.  The curve stops at L_max when the line is longer.
  const view = useMemo(() => {
    if (st.inletChoked) return null;
    const xLine = Math.min(len, st.Lmax * 0.999999);
    const xDom = st.Lmax > 3 * len ? len : Math.max(len, st.Lmax);
    const pr = profile(PIPE09, flow, xLine, 120);
    const toPts = (v: number[]): (readonly [number, number])[] =>
      v.map((P, i) => [pr.x[i]!, P * BAR] as const);
    return { xDom, xLine, exact: toPts(pr.exact), mean: toPts(pr.mean) };
  }, [flow, len, st]);

  const err = useMemo(() => errorCurve(PIPE09, flow, 0.98, 120), [flow]);
  const machPts = useMemo(() => {
    if (!view) return [] as (readonly [number, number])[];
    const pr = profile(PIPE09, flow, view.xLine, 120);
    return pr.x.map((x, i) => [x, machAt(st, pr.exact[i]!)] as const);
  }, [view, flow, st]);

  const profileSeries: ChartSeries[] = view ? [
    { id: "exact", label: "exact (the logarithm kept)", color: EXACT_COLOR, pts: view.exact },
    { id: "mean", label: "mean-density shortcut", color: MEAN_COLOR, dash: "6 4", pts: view.mean },
  ] : [];
  const profileGuides: ChartGuide[] = view ? [
    { dir: "h", at: st.Pch * BAR, label: "P_choke", color: CHOKE_COLOR },
    { dir: "v", at: st.Lmax, label: "L_max", color: CHOKE_COLOR },
    ...(!choked ? [{ dir: "v" as const, at: len, label: "your L", color: "#212529", dash: "2 3" }] : []),
  ] : [];

  const errSeries: ChartSeries[] = err.L.length ? [
    { id: "errP2", label: "error of the shortcut's outlet pressure", color: MEAN_COLOR,
      pts: err.L.map((x, i) => [x, 100 * err.errP2[i]!] as const) },
  ] : [];
  const errGuides: ChartGuide[] = [
    ...(L40 !== null ? [{ dir: "v" as const, at: L40,
      label: "40 % drop: the engine's flag", color: FLAG_COLOR }] : []),
    ...(line.verdict === "ok" ? [{ dir: "v" as const, at: len, label: "your L", color: "#212529", dash: "2 3" }] : []),
  ];

  const machSeries: ChartSeries[] = machPts.length ? [
    { id: "ma", label: "isothermal Mach number along the line", color: EXACT_COLOR, pts: machPts },
  ] : [];

  const rows = useMemo(() => TABLE_L.map((L) => ({ L, g: gasLine(PIPE09, flow, L) })), [flow]);

  const verdictText = line.verdict === "inletChoked"
    ? `The inlet is already at or beyond the isothermal sonic limit: P_in = ${g4(PIPE09.P1)} Pa is not above G sqrt(c) = ${g4(st.Pch)} Pa (Pipe.cpp:886-888).  The engine stops the run at the entrance; lower the flow.`
    : line.verdict === "choked"
      ? `The line is choked.  f L/D = ${g4(line.K)} exceeds the ${g4(st.Kmax)} that brings the outlet to the sonic limit, so L = ${g4(len)} m is longer than L_max = ${g4(st.Lmax)} m at this flow.  The engine stops here (Pipe.cpp:893-897: "shorten the line, enlarge D or lower the flow"); the chart ends at L_max.`
      : null;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>How far can a gas line go?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A liquid in a pipe loses pressure in a straight line.  A gas expands as it loses
            pressure, speeds up, and loses it faster and faster, until the steady equation cannot be
            solved at all.  The page is the engine&apos;s own gas line (nitrogen, 8 bar, 300 K,
            50 mm steel pipe): move the flow and the length.
          </Text>
        </Box>

        <Box px="sm" py={8} style={BOX} data-card="controls">
          <Title order={5}>Move the flow and the length</Title>
          <OriginMark of={["engine", "page", "assumption"]}
            note="The gas, the pressure, the temperature and the pipe are those of the tutorial pipe09_isothermal_gas_line, whose recorded run the page's numbers equal at the case's own flow and length; the curves are the page's own arithmetic (the same equations as the engine's pipe); the two sliders are inputs." />
          <Group gap="md" mt={6} align="flex-start" wrap="wrap">
            <Box w={280} maw="100%">
              <KnobSlider knob={FLOW_KNOB} value={flow} onChange={setFlow} showWhy />
              <Box mt={10}>
                <KnobSlider knob={LENGTH_KNOB} value={len} onChange={setLen} showWhy />
              </Box>
            </Box>
            <Box style={{ flex: 1, minWidth: 260 }}>
              <Group gap="sm" wrap="wrap" data-readouts="">
                <Readout dataKey="Pout" label="outlet pressure, exact" unit="bar"
                  value={g4(line.P2 * BAR)} />
                <Readout dataKey="PoutMean" label="outlet pressure, mean-density shortcut" unit="bar"
                  value={g4(line.P2mean * BAR)} />
                <Readout dataKey="Lmax" label="longest line L_max" unit="m" value={g4(st.Lmax)} />
                <Readout dataKey="Pchoke" label="choking pressure P_choke" unit="bar"
                  value={g4(st.Pch * BAR)} />
                <Readout dataKey="MaIn" label="isothermal Mach number, in" unit=""
                  value={g4(st.M1)} />
                <Readout dataKey="MaOut" label="isothermal Mach number, out" unit=""
                  value={g4(line.M2)} />
              </Group>
              <Text size="xs" c="dimmed" mt={6} data-engine-facts="">
                G = {g4(st.G)} kg/(m2 s), Re = {g4(st.Re)} (the same at every section), f = {g4(st.f)}
                (Churchill, as the engine: it moves with the flow because Re does).  At the case&apos;s own
                {" "}{PIPE09_FLOW_KMOLH} kmol/h and {PIPE09_L_M} m these are the numbers of its recorded run.
              </Text>
            </Box>
          </Group>
          {verdictText && (
            <Text size="sm" c="red" mt={8} data-verdict={line.verdict}>{verdictText}</Text>
          )}
        </Box>

        {step(1)}
        <Box px="sm" py={8} style={BOX} data-card="profile">
          <Title order={5}>The pressure along the line</Title>
          <Box mt={4} data-chart="profile">
            {view ? (
              <DryChart series={profileSeries} guides={profileGuides}
                xLabel="distance from the inlet x, m" yLabel="pressure P, bar" yZero xZero
                xDomain={[0, view.xDom]} yDomain={[0, PIPE09.P1 * BAR * 1.05]}
                aria="Pressure along an isothermal gas line, the exact profile and the mean-density shortcut, with the choking pressure and the longest line marked" />
            ) : <Text size="sm" c="dimmed">No profile: the inlet is choked.</Text>}
          </Box>
          <Text size="xs" c="dimmed" mt={4}>
            The exact curve is the equation of step 1 inverted at each x; the shortcut is the same with
            the logarithm dropped.  The curve gets steeper toward the outlet because the gas
            accelerates.  The red lines are the choking pressure and the longest line the flow can use.
          </Text>
        </Box>

        {step(2)}
        <Box px="sm" py={8} style={BOX} data-card="shortcut">
          <Title order={5}>How wrong the shortcut is, against the length</Title>
          <Box mt={4} data-chart="error">
            <DryChart series={errSeries} guides={errGuides}
              xLabel="length of the line L, m" yLabel="error of the shortcut's P_out, %" yZero xZero
              aria="Error of the mean-density shortcut's outlet pressure against the length of the line, with the engine's 40 percent flag level marked" />
          </Box>
          <Text size="xs" c="dimmed" mt={4} data-flag-note="">
            The grey line is where the pressure has fallen by 40 % of the inlet pressure
            {L40 !== null ? ` (L = ${g4(L40)} m at this flow)` : ""}: the level at which the engine prints an
            advisory.  It is the engine&apos;s own flag level, not a bound derived from the equations
            (Pipe.cpp:928).  The shortcut has already failed visibly before it.
          </Text>
          <Box style={SCROLL} mt={6}>
            <Table withTableBorder withColumnBorders fz="xs" data-error-table="">
              <Table.Thead><Table.Tr>
                <Table.Th>L, m</Table.Th><Table.Th>P_out exact, bar</Table.Th>
                <Table.Th>P_out mean-density, bar</Table.Th><Table.Th>drop / P_in, %</Table.Th>
                <Table.Th>error in P_out, %</Table.Th><Table.Th>error in the drop, %</Table.Th>
                <Table.Th>over the 40 % flag</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map(({ L, g }) => (
                  <Table.Tr key={L} data-error-row={L}>
                    <Table.Td>{L}</Table.Td>
                    {g.verdict === "ok" ? (
                      <>
                        <Table.Td>{g4(g.P2 * BAR)}</Table.Td>
                        <Table.Td>{g4(g.P2mean * BAR)}</Table.Td>
                        <Table.Td>{g4(100 * g.dropFrac)}</Table.Td>
                        <Table.Td>{g4(100 * g.errP2)}</Table.Td>
                        <Table.Td>{g4(100 * g.errDP)}</Table.Td>
                        <Table.Td>{g.dropFrac > ADVISORY_DROP ? "yes" : "no"}</Table.Td>
                      </>
                    ) : (
                      <Table.Td colSpan={6}>choked at this flow: longer than L_max = {g4(st.Lmax)} m</Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
          <Text size="xs" c="dimmed" mt={4}>
            At the case&apos;s own flow the rows are the table in the tutorial&apos;s README.  Both errors are
            measured against the exact solution.
          </Text>
        </Box>

        {step(3)}
        <Box px="sm" py={8} style={BOX} data-card="choking">
          <Title order={5}>The isothermal Mach number, and what choking means</Title>
          <Box mt={4} data-chart="mach">
            {machSeries.length ? (
              <DryChart series={machSeries}
                guides={[{ dir: "h", at: 1, label: "Ma_T = 1: choked", color: CHOKE_COLOR }]}
                xLabel="distance from the inlet x, m" yLabel="isothermal Mach number u / sqrt(c)"
                yZero xZero yDomain={[0, 1.05]}
                aria="Isothermal Mach number along the gas line, rising toward 1 at the longest line" />
            ) : <Text size="sm" c="dimmed">No profile: the inlet is choked.</Text>}
          </Box>
          <Text size="sm" mt={6} data-mach-note="">
            At the outlet the isothermal Mach number is {g4(line.M2)} (inlet {g4(st.M1)}).  It reaches
            1 only at P_choke.  Measured against the adiabatic speed of sound, that point is
            Ma = 1/sqrt(gamma) = {g4(adiabaticMachAtChoke(GAMMA_ASSUMED))} for the gamma = {GAMMA_ASSUMED} of a
            diatomic ideal gas (an assumption of the page; the engine does not use gamma).
          </Text>
          <Title order={6} mt={10}>What the model leaves out, and where the engine says so</Title>
          <Box style={SCROLL}>
            <Table withTableBorder withColumnBorders fz="xs" data-left-out="">
              <Table.Thead><Table.Tr>
                <Table.Th>left out</Table.Th><Table.Th>what the engine does</Table.Th><Table.Th>where</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr><Table.Td>adiabatic and Joule-Thomson effects</Table.Td>
                  <Table.Td>holds T at the inlet value; the result block says so</Table.Td>
                  <Table.Td>Pipe.cpp:942</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>a varying compressibility Z</Table.Td>
                  <Table.Td>holds Z at its inlet value, c = P_1/rho_1 all along</Table.Td>
                  <Table.Td>Pipe.cpp:857</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>a slope</Table.Td>
                  <Table.Td>stops a line with dz other than 0, by name</Table.Td>
                  <Table.Td>Pipe.cpp:835-836</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>a gas with no viscosity data</Table.Td>
                  <Table.Td>stops, by name: Re needs it</Table.Td>
                  <Table.Td>Pipe.cpp:839-840</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>a line longer than L_max</Table.Td>
                  <Table.Td>stops, by name, and prints L_max</Table.Td>
                  <Table.Td>Pipe.cpp:893-897</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>a weakening isothermal assumption</Table.Td>
                  <Table.Td>raises an advisory above a 40 % drop</Table.Td>
                  <Table.Td>Pipe.cpp:928-932</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Box>
        </Box>

        <LessonQuiz title="Check your understanding" questions={GAS_QUIZ} lesson={GAS_STEPS} />
        <LessonLimits limits={GAS_LIMITS} title="What this does not show" />
        <LessonReferences tool="gas-line" />
      </Stack>
    </Box>
  );
}
