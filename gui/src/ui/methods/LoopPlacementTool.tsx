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
  LoopPlacementTool -- "Where to put a control loop" (DEV.md 4c C204).

  THE TASK (CLAUDE.md section 10): a student with a vessel and several things to
  hold leaves able to (1) count the valves that let them hold anything, (2)
  say which variable is held first and why the engine refuses to run without
  it, (3) read a relative gain array measured from runs and choose the
  pairing, and (4) see, in the engine, what the wrong pairing does.

  WHAT RUNS WHERE.  The engine runs the three gain runs and the four wirings
  (choupoCtrl in the browser, on the shipped ctrl22 reactor re-wired by
  loopPlacementCase.ts).  The page does the valve count and the 2x2 array
  (loopPlacementMath.ts).  The gain runs start on their own, one after the
  other; the wirings run on a click, one at a time.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Box, Button, Checkbox, Group, Stack, Table, Text, Title,
} from "@mantine/core";

import { useCaseFilesRun, type MethodRunState } from "../../case/methodRun.js";
import { filesToCaseFiles, tutorialByName } from "../../cases/tutorials.js";
import { TraceChart } from "./FaultCharts.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import {
  LOOP_PLACEMENT_LIMITS, LOOP_PLACEMENT_QUIZ, LOOP_PLACEMENT_STEPS,
} from "./loopPlacementLesson.js";
import {
  buildLoopCase, WIRINGS, type Wiring, type WiringName,
} from "./loopPlacementCase.js";
import {
  BASE_F_KMOL_S, BASE_TJ_K, countDof, gainsFromRuns, HELD_VARIABLES, LOOP_WITNESS,
  rga2, SP_T_K, SP_X, STEP_F_KMOL_S, STEP_TJ_K, stateFromKpis, VALVE_SITES, verdict,
  type Gain2, type LoopState,
} from "./loopPlacementMath.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(LOOP_PLACEMENT_STEPS);

const fmt = (v: number, d = 3): string =>
  Number.isFinite(v) ? v.toPrecision(d) : "n/a";

/** The witness's raw files, once. */
function witnessRaw(): { [rel: string]: string } {
  const e = tutorialByName(LOOP_WITNESS);
  if (!e?.files.rawFiles)
    throw new Error(`method witness '${LOOP_WITNESS}' is not in the bundled corpus`);
  return e.files.rawFiles;
}

/** One engine run of a wiring; null `w` idles it. */
function useWiredRun(w: Wiring | null, key: string): MethodRunState {
  return useCaseFilesRun(
    w ? () => filesToCaseFiles(LOOP_WITNESS, buildLoopCase(witnessRaw(), w)) : null,
    key, "choupoCtrl");
}

const stateOf = (r: MethodRunState): LoopState | null =>
  stateFromKpis(r.result?.kpis);

// ---- step 1: the valve count -------------------------------------------------

function DofCounter(): JSX.Element {
  const [sites, setSites] = useState<string[]>(["feed", "out", "jacket"]);
  const [held, setHeld] = useState<string[]>(["level", "T", "x"]);
  const c = countDof(sites, held);
  const toggle = (list: string[], set: (v: string[]) => void, id: string): void =>
    set(list.includes(id) ? list.filter((s) => s !== id) : [...list, id]);
  return (
    <Box data-dof="" mt="xs" mb="md">
      <OriginMark of={["page", "assumption"]} note="a count, not a run; the sites and the wishes are the page's reading of the reactor" />
      <Group align="flex-start" gap="xl" mt={4}>
        <Stack gap={4}>
          <Text size="sm" fw={600}>Valves you fit</Text>
          {VALVE_SITES.map((s) => (
            <Checkbox key={s.id} size="xs" label={s.label} checked={sites.includes(s.id)}
              onChange={() => toggle(sites, setSites, s.id)} />
          ))}
        </Stack>
        <Stack gap={4}>
          <Text size="sm" fw={600}>Variables you want to hold</Text>
          {HELD_VARIABLES.map((v) => (
            <Checkbox key={v.id} size="xs" label={`${v.label} (${v.why})`} checked={held.includes(v.id)}
              onChange={() => toggle(held, setHeld, v.id)} />
          ))}
        </Stack>
      </Group>
      <Alert mt="xs" variant="light" color={c.spare >= 0 ? "teal" : "red"} data-dof-result="">
        <Text size="sm">
          Independent valves: <b>{c.valves}</b>. Variables to hold: <b>{c.held}</b>.{" "}
          {c.spare === 0 && "Square: every valve has a variable."}
          {c.spare > 0 && `${c.spare} valve(s) spare: they can serve an optimisation or a second variable.`}
          {c.spare < 0 && `${-c.spare} variable(s) too many: at least one cannot be held independently.`}
        </Text>
      </Alert>
    </Box>
  );
}

// ---- the closed-loop traces --------------------------------------------------

function Traces({ run, label }: { run: MethodRunState; label: string }): JSX.Element | null {
  const tr = run.result?.trajectory;
  if (!tr) return null;
  const a = tr.vars["reactor.n_2Methyl1Propanol"], b = tr.vars["reactor.n_2Butanol"];
  const T = tr.vars["reactor.T"], F = tr.vars["reactor.F_in"];
  if (!a || !b || !T || !F) return null;
  const x = a.map((v, i) => b[i]! / (v + b[i]!));
  return (
    <Box data-traces={label}>
      <TraceChart x={tr.t} xLabel="time, s" yLabel="T, K" height={140} id={`T-${label}`}
        ariaLabel={`reactor temperature, ${label}`}
        series={[{ label: "T", y: T }]} bands={[{ y: SP_T_K, label: "set point" }]} />
      <TraceChart x={tr.t} xLabel="time, s" yLabel="product mole fraction" height={140} id={`x-${label}`}
        ariaLabel={`product mole fraction, ${label}`}
        series={[{ label: "x", y: x }]} bands={[{ y: SP_X, label: "set point" }]} />
      <TraceChart x={tr.t} xLabel="time, s" yLabel="feed rate, kmol/s" height={140} id={`F-${label}`}
        ariaLabel={`feed rate, ${label}`}
        series={[{ label: "F_in", y: F }]} />
    </Box>
  );
}

function RunBox({ name, title, run, active, onRun, disabled, note }: {
  name: WiringName; title: string; run: MethodRunState; active: boolean;
  onRun: () => void; disabled: boolean; note: string;
}): JSX.Element {
  const s = stateOf(run);
  return (
    <Box data-wiring={name} mt="xs" mb="md">
      <Group gap="xs">
        <Button size="xs" onClick={onRun} disabled={disabled || active}>
          {active ? "Already run" : title}
        </Button>
        {run.busy && <Text size="xs" c="dimmed">the engine is running...</Text>}
      </Group>
      <Text size="xs" c="dimmed" mt={2}>{note}</Text>
      {run.err && (
        <Alert mt="xs" color="red" variant="light" data-run-stopped={name}
          title="The engine stopped this run">
          <Text size="sm">{run.err}</Text>
        </Alert>
      )}
      {s && (
        <>
          <OriginMark of="engine" note={`one run of choupoCtrl, tutorials/${LOOP_WITNESS} re-wired`} />
          <Table withTableBorder fz="xs" mt={4} w="auto" data-run-result={name}>
            <Table.Tbody>
              <Table.Tr><Table.Td>temperature at the end</Table.Td><Table.Td><b>{fmt(s.T, 5)}</b> K (set point {SP_T_K})</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>product mole fraction</Table.Td><Table.Td><b>{fmt(s.x, 4)}</b> (set point {SP_X})</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>level</Table.Td><Table.Td><b>{fmt(s.level, 4)}</b> m</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>feed rate</Table.Td><Table.Td><b>{fmt(s.F, 4)}</b> kmol/s (started at {BASE_F_KMOL_S})</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </>
      )}
      <Traces run={run} label={name} />
    </Box>
  );
}

// ---- the page ----------------------------------------------------------------

export function LoopPlacementTool(): JSX.Element {
  // ---- the three gain runs, one after the other, from the page's first paint ----
  const base = useWiredRun({ kind: "open", Tj: BASE_TJ_K, F: BASE_F_KMOL_S }, "gain-base");
  const sBase = stateOf(base);
  const jacket = useWiredRun(sBase ? { kind: "open", Tj: BASE_TJ_K + STEP_TJ_K, F: BASE_F_KMOL_S } : null, "gain-jacket");
  const sJacket = stateOf(jacket);
  const feed = useWiredRun(sJacket ? { kind: "open", Tj: BASE_TJ_K, F: BASE_F_KMOL_S + STEP_F_KMOL_S } : null, "gain-feed");
  const sFeed = stateOf(feed);

  const K: Gain2 | null = useMemo(
    () => (sBase && sJacket && sFeed ? gainsFromRuns(sBase, sJacket, sFeed, STEP_TJ_K, STEP_F_KMOL_S) : null),
    [sBase, sJacket, sFeed]);
  const rga = K ? rga2(K) : null;

  // ---- the wirings, on a click, one at a time -----------------------------------
  const [want, setWant] = useState<{ [k in WiringName]?: true }>({});
  const wire = (n: WiringName): Wiring | null =>
    K && want[n] ? { kind: "closed", loops: WIRINGS[n], K } : null;
  const natural = useWiredRun(wire("natural"), "w-natural");
  const swapped = useWiredRun(wire("swapped"), "w-swapped");
  const noLevel = useWiredRun(wire("noLevel"), "w-nolevel");
  const fixed = useWiredRun(wire("fixedThroughput"), "w-fixed");
  const anyBusy = base.busy || jacket.busy || feed.busy || natural.busy || swapped.busy
    || noLevel.busy || fixed.busy;
  const ask = (n: WiringName) => (): void => setWant((w) => ({ ...w, [n]: true }));

  const gainErr = base.err ?? jacket.err ?? feed.err;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Where to put a control loop</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Count the valves, hold the inventory first, measure the gains, read the relative gain array, and watch the engine
            run the right pairing and the wrong one on one small reactor.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="One toy reactor, run by the engine" data-toy-banner="">
            The reactor is the shipped two-loop case ctrl22 (a first-order isomerisation in a jacketed vessel with a level),
            re-wired by the page. The gains, the array and every outcome below are runs of choupoCtrl in your browser; the
            valve count and the 2x2 arithmetic are in the page. The reaction is not fitted to data and the tuning recipe is
            the page&apos;s assumption.
          </Alert>
          <Box mt="xs">
            <OriginMark of="reference" note="Seborg, Edgar, Mellichamp and Doyle, Process Dynamics and Control, 4th ed. (Wiley, 2017), Sections 13.1, 13.2.1 and 18.2: the pages named in each step" />
          </Box>
        </Box>

        {step(1)}
        <DofCounter />

        {step(2)}
        <RunBox name="noLevel" title="Run the pairing without the level loop" run={noLevel}
          active={!!want.noLevel && !noLevel.err && !noLevel.busy && !!stateOf(noLevel)} disabled={!K || anyBusy}
          onRun={ask("noLevel")}
          note="The same wiring as step 5's natural one, with the level loop removed. Needs the gains of step 3 first." />

        {step(3)}
        <Box data-gains="" mt="xs" mb="md">
          <OriginMark of="engine" note="three runs of choupoCtrl: a base and one step in each valve, the level loop closed" />
          {gainErr && <Alert color="red" variant="light" mt={4}><Text size="sm">{gainErr}</Text></Alert>}
          <Table withTableBorder fz="xs" mt={4} w="auto">
            <Table.Thead>
              <Table.Tr><Table.Th>run</Table.Th><Table.Th>jacket, K</Table.Th><Table.Th>feed, kmol/s</Table.Th><Table.Th>T, K</Table.Th><Table.Th>x</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {([
                ["base", BASE_TJ_K, BASE_F_KMOL_S, sBase],
                ["jacket step", BASE_TJ_K + STEP_TJ_K, BASE_F_KMOL_S, sJacket],
                ["feed step", BASE_TJ_K, BASE_F_KMOL_S + STEP_F_KMOL_S, sFeed],
              ] as const).map(([n, tj, f, s]) => (
                <Table.Tr key={n}>
                  <Table.Td>{n}</Table.Td><Table.Td>{tj}</Table.Td><Table.Td>{f}</Table.Td>
                  <Table.Td>{s ? fmt(s.T, 6) : "running..."}</Table.Td><Table.Td>{s ? fmt(s.x, 5) : ""}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {K && (
            <Table withTableBorder fz="xs" mt="xs" w="auto" data-gain-matrix="">
              <Table.Thead><Table.Tr><Table.Th>gain K</Table.Th><Table.Th>jacket, K/K</Table.Th><Table.Th>feed, per (kmol/s)</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr><Table.Td>temperature</Table.Td><Table.Td>{fmt(K.K11)}</Table.Td><Table.Td>{fmt(K.K12)}</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>mole fraction</Table.Td><Table.Td>{fmt(K.K21)}</Table.Td><Table.Td>{fmt(K.K22)}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          )}
        </Box>

        {step(4)}
        <Box data-rga="" mt="xs" mb="md">
          <OriginMark of={["engine", "page"]} note="the array is computed here from the gains the engine runs gave" />
          {rga ? (
            <Table withTableBorder fz="xs" mt={4} w="auto">
              <Table.Thead><Table.Tr><Table.Th>pairing</Table.Th><Table.Th>relative gain</Table.Th><Table.Th>reading</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                <Table.Tr data-pairing="natural"><Table.Td>T with the jacket, x with the feed rate</Table.Td><Table.Td><b>{fmt(rga.diag, 3)}</b></Table.Td><Table.Td>{READING[verdict(rga.diag)]}</Table.Td></Table.Tr>
                <Table.Tr data-pairing="swapped"><Table.Td>T with the feed rate, x with the jacket</Table.Td><Table.Td><b>{fmt(rga.swapped, 3)}</b></Table.Td><Table.Td>{READING[verdict(rga.swapped)]}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          ) : <Text size="sm" c="dimmed">waiting for the three runs above</Text>}
        </Box>

        {step(5)}
        <RunBox name="natural" title="Run the pairing the array recommends" run={natural}
          active={!!want.natural && !!stateOf(natural)} disabled={!K || anyBusy} onRun={ask("natural")}
          note="Level on the outflow, temperature on the jacket, composition on the feed rate, from the vessel's own start (340 K, mole fraction 0.5)." />
        <RunBox name="swapped" title="Run the swapped pairing" run={swapped}
          active={!!want.swapped && !!stateOf(swapped)} disabled={!K || anyBusy} onRun={ask("swapped")}
          note="Level on the outflow, temperature on the feed rate, composition on the jacket. The same recipe, the same set points." />

        {step(6)}
        <RunBox name="fixedThroughput" title="Fix the feed and hold the composition" run={fixed}
          active={!!want.fixedThroughput && !!stateOf(fixed)} disabled={!K || anyBusy} onRun={ask("fixedThroughput")}
          note="The feed stays at its starting rate. Level on the outflow, composition on the jacket; the temperature is left without a loop and settles where it settles." />

        <LessonQuiz title="Check your understanding" questions={LOOP_PLACEMENT_QUIZ} lesson={LOOP_PLACEMENT_STEPS} />
        <LessonLimits limits={LOOP_PLACEMENT_LIMITS} />
        <LessonReferences tool="loop-placement" />
      </Stack>
    </Box>
  );
}

const READING: { [v in ReturnType<typeof verdict>]: string } = {
  good: "positive and near one: the loops hardly interact",
  interacting: "positive but above one: works, with the other loop making this one weaker",
  weak: "positive but below one half: the other valve does most of the work",
  wrong: "negative: closing the other loop reverses this loop's gain. Do not use it",
};
