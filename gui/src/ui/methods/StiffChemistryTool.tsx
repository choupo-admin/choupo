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
  StiffChemistryTool -- "Why is chemistry stiff, and how do solvers go fast?".

  A NOTES page with one live element.  The task it serves, in one sentence: a
  student who runs a combustion or NOx case learns why it needs a stiff solver,
  what a Jacobian and an LU do, and why one solver is many times faster than
  another on the same mechanism.  The calculator of step 1 is arithmetic on the
  page (origin: page); every table is a RECORDED run (origin: engine, recorded),
  because the engine's work counters need an environment variable a browser run
  cannot set.  Every fact is in stiffChemistryLesson.ts; this file only draws.
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import { Anchor, Badge, Box, Code, Group, Slider, Stack, Table, Text, Title } from "@mantine/core";

import {
  COST_ROWS, COUNT_ROWS, DENSE_OUTPUT_LANDED, IGNITION_ROWS, JACOBIAN_ROWS, JOURNEY_ROWS,
  DENSE_ROWS, SC_LIMITS, SC_STEPS, SPARSE_ROWS, SPLIT_ROWS, TIMING_ROWS, VESSEL_ACCURACY_NOTE, VESSEL_ROWS,
  calc, rk4StabilityLimit,
} from "./stiffChemistryLesson.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(SC_STEPS);
const BORDER = "1px solid var(--mantine-color-default-border)";

function Grid({ head, rows, id }: { head: readonly string[]; rows: readonly (readonly string[])[]; id: string }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ overflowX: "auto" }} data-sc-table={id}>
      <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>{head.map((h) => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => (
            <Table.Tr key={i}>{r.map((c, j) => <Table.Td key={j}>{c}</Table.Td>)}</Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

const sci = (x: number): string => (x === 0 ? "0" : x.toExponential(2));

function Calculator(): JSX.Element {
  const [logLam, setLogLam] = useState(9);
  const [logH, setLogH] = useState(-8);
  const window = 3.0e-3;
  const r = calc(10 ** logLam, 10 ** logH, window);
  return (
    <Box data-sc-calculator="" px="sm" py={8} style={{ border: BORDER, borderRadius: 4 }}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">try it: the fastest mode against the step</Text>
      <OriginMark of={["assumption", "page"]}
        note="the two sliders are inputs; the numbers below are this page's arithmetic on the stability functions" />
      <Text size="xs" mt={6}>log10 of the fastest rate |λ|, in 1/s: <b>{logLam}</b></Text>
      <Slider min={3} max={10} step={1} value={logLam} onChange={setLogLam} aria-label="log10 of the fastest rate" />
      <Text size="xs" mt={8}>log10 of the step h, in s: <b>{logH}</b></Text>
      <Slider min={-10} max={-2} step={1} value={logH} onChange={setLogH} aria-label="log10 of the step" />
      <Stack gap={2} mt={8}>
        <Text size="xs">h|λ| = <b>{sci(r.z)}</b>; RK4 is stable only below {rk4StabilityLimit().toFixed(3)}.</Text>
        <Text size="xs" data-sc-rk4={r.rk4Stable ? "stable" : "unstable"}>
          One RK4 step multiplies that mode by <b>{sci(r.rk4)}</b>: {r.rk4Stable ? "it decays, as it should" : "it GROWS: the run blows up"}.
        </Text>
        <Text size="xs">One implicit Euler step multiplies it by <b>{sci(r.implicit)}</b>, whatever the step.</Text>
        <Text size="xs">
          To cross a {sci(window)} s window RK4 needs at least <b>{sci(r.rk4Steps)}</b> steps, set by this mode alone.
        </Text>
        <Text size="xs">Cubic-Hermite defect scale (λh)^4/384: <b>{sci(r.hermite)}</b>.</Text>
      </Stack>
    </Box>
  );
}

export function StiffChemistryTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Why is chemistry stiff, and how do solvers go fast?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why a combustion or NOx case needs a stiff solver, what a Jacobian
            and an LU are doing, and why one solver is many times faster than
            another on the same mechanism, with Choupo's own numbers.
          </Text>
          <Group gap={6} mt={6} data-sc-recorded="">
            <Badge size="sm" variant="light" color="orange">recorded, not live</Badge>
            <Text size="xs" c="dimmed">
              The tables are recorded native runs of 2026-11-22. The engine's work
              counters come from an environment variable, <Code>CHOUPO_ODE_STATS</Code>,
              that a browser run cannot set, so nothing here is run in your browser.
            </Text>
          </Group>
        </Box>

        {step(1)}
        <Calculator />
        <Box>
          <Title order={6}>ignition01: the same vessel with five integrators</Title>
          <OriginMark of="engine" note="recorded runs of the shipped cases, 2026-11-22" />
          <Grid id="ignition" head={["integrator", "case", "outcome", "T_final", "ignition delay", "engine time"]}
            rows={IGNITION_ROWS.map((r) => [r.integrator, r.case, r.outcome, r.tFinal, r.tauIgn, r.engineTime])} />
        </Box>

        {step(2)}
        <Stack gap={6} data-sc-jacobians="">
          {JACOBIAN_ROWS.map((j) => (
            <Box key={j.id} px="sm" py={8} data-sc-jacobian={j.id} style={{ border: BORDER, borderRadius: 4 }}>
              <Text size="sm" fw={700}>{j.name}</Text>
              <Text size="xs"><b>How:</b> {j.how}.</Text>
              <Text size="xs"><b>Cost:</b> {j.cost}.</Text>
              <Text size="xs"><b>Risk:</b> {j.risk}.</Text>
            </Box>
          ))}
        </Stack>

        {step(3)}
        <Box>
          <OriginMark of="engine" note="recorded callgrind and run tallies, 2026-11-22" />
          <Grid id="sparse" head={["quantity", "value"]} rows={SPARSE_ROWS.map((r) => [r.what, r.value])} />
        </Box>

        {step(4)}
        <Box>
          <Title order={6}>nox03 (52 species, 235 reactions): the counts, by integrator and tolerance</Title>
          <OriginMark of="engine" note="recorded; atol 1e-15; step-end deviation from a tight Cantera reference" />
          <Grid id="counts"
            head={["integrator", "rtol", "CPU", "accepted steps", "Jacobians", "factorisations", "rhs calls", "step-end deviation"]}
            rows={COUNT_ROWS.map((r) => [r.integrator, r.rtol, r.cpu, r.accepted, r.jacobians, r.factors, r.rhs, r.stepEnd])} />
          <Text size="sm" mt={6}>
            Reading it: at a loose tolerance Rodas4 takes 201 small steps and
            seulex 88 big ones, but seulex is 25 times worse at the step ends (1.9e-2
            against 6.5e-5) and no faster. At a tight tolerance Rodas4 needs 3568
            steps and seulex 113: the same answer to 4e-7, five times faster. A
            big-step method pays per step in factorisations and loses where the
            error budget is loose; it wins where accuracy sets many small steps.
          </Text>
        </Box>

        {step(5)}
        <Box>
          <OriginMark of="engine" note="recorded; the right-hand side before and after the code changes of the day" />
          <Grid id="cost" head={["quantity", "before", "after"]} rows={COST_ROWS.map((r) => [r.what, r.before, r.after])} />
          <Box mt={8}>
            <Title order={6}>Where the instructions of one run went</Title>
            <Grid id="split" head={["part", "share"]} rows={SPLIT_ROWS.map((r) => [r.part, r.share])} />
          </Box>
          <Box mt={8}>
            <Title order={6}>The comparison like with like</Title>
            <Grid id="timing" head={["measurement", "Choupo", "Cantera", "ratio"]}
              rows={TIMING_ROWS.map((r) => [r.what, r.choupo, r.cantera, r.ratio])} />
            <Text size="xs" c="dimmed" mt={4}>
              Python's <Code>import cantera</Code> alone costs 0.15 s, so a comparison of whole processes
              flatters nobody: integration only, and end to end, are different questions.
            </Text>
          </Box>
        </Box>

        {step(6)}
        <Box data-sc-vessels="">
          <Title order={6}>nox02 (17 vessels) against Cantera: coupled, then each vessel on its own step, then threads</Title>
          <OriginMark of="engine" note="recorded; integration only, wall of the vessels' integration, times Cantera's; best of 3 on 4 cores" />
          <Grid id="vessels" head={["integrator", "rtol", "coupled", "1 thread", "2 threads", "4 threads"]}
            rows={VESSEL_ROWS.map((r) => [r.integrator, r.rtol, r.coupled, r.one, r.two, r.four])} />
          <Text size="xs" mt={4} data-sc-vessel-accuracy="">{VESSEL_ACCURACY_NOTE}</Text>
        </Box>

        {step(7)}
        <Box data-sc-dense="">
          <OriginMark of="engine" note="recorded: grid error against a tight reference, nox03, 1 ms write grid" />
          <Text size="sm">
            The diagnosis: the written grid differed by 7.67e-3 between a dense and a sparse linear solve while every
            step end agreed (a 1e-8 relative difference). A change of 1e-12 in the initial temperature moved the
            grid by 1e-7: the cubic amplified it by about 1e5. What each integrator uses now, and what it gained:
          </Text>
          <Grid id="dense" head={["integrator", "construction", "grid error before", "grid error after"]}
            rows={DENSE_ROWS.map((r) => [r.method, r.construction, r.before, r.after])} />
          <Text size="sm" mt={4} data-sc-dense-status={DENSE_OUTPUT_LANDED ? "landed" : "pending"}>
            {DENSE_OUTPUT_LANDED
              ? "These interpolants are in the engine: solver { denseOutput integrator; } is the default and hermite asks for the old cubic. They are not error-controlled: the step size does not see them (making it see them would take 695 steps instead of 95), so interior rows carry the accuracy of the construction, not the tolerance."
              : "The integrators' own dense output is prepared on branch dense-output and arrives later."}
          </Text>
        </Box>

        {step(8)}
        <Stack gap={6} data-sc-journey="">
          {JOURNEY_ROWS.map((j) => (
            <Box key={j.id} px="sm" py={6} data-sc-journey-row={j.id} style={{ border: BORDER, borderRadius: 4 }}>
              <Text size="xs" fw={700}>{j.when}</Text>
              <Text size="xs">{j.lesson}</Text>
            </Box>
          ))}
        </Stack>

        <LessonLimits limits={SC_LIMITS} />

        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("linear-algebra-without-pain")}>
            Linear algebra without pain
          </Anchor>{" "}(what an LU is),{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("fast-and-slow")}>
            Fast and slow
          </Anchor>{" "}(time scales in a model) and{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("how-do-we-know-k")}>
            Where does the rate constant come from?
          </Anchor>.
        </Text>

        <LessonReferences tool="stiff-chemistry" />
      </Stack>
    </Box>
  );
}

export default StiffChemistryTool;
