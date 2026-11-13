/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  EquilibriumOrRateBasedTool -- the EduTool `equilibrium-or-rate-based`,
  "Equilibrium stages or a rate-based model?".

  The student's task, in one sentence: "I have to design or rate a column:
  is an equilibrium-stage model with one efficiency enough, or do I need a
  rate-based model, and how wrong can the simple one be?"  The page answers
  with two demonstrations the engine runs (the efficiency against a trace
  specification; one tray, three correlations and a measurement), a block of
  findings read in published comparisons, and a decision table in which
  every row names its origin.

  NO RUN STARTS ON OPENING.  Every run is behind a button, and every stop
  (seven efficiencies on two columns, 33 heights at each efficiency, three
  efficiency witnesses) was run natively before the page shipped; the design
  record docs/design/equilibrium-or-rate-based.md holds the table.

  WHERE EVERY NUMBER COMES FROM.  The impurities are the toluene mole
  fraction of the distillate stream the engine publishes; the efficiency
  curves are the sweep CSV each witness's outerDict writes.  The page divides
  two impurities, picks the smallest height on the grid that meets a target,
  and draws the measured points the tree carries.  The plot, the panel and
  the table wrapper are the isotherm page's, imported, not redrawn.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Slider, Stack, Table, Text, Title,
} from "@mantine/core";

import { useMethodRunSweep } from "../../case/methodRun.js";
import {
  ASSUMED_EFFICIENCY, COMPARE_FS, EFFICIENCY_STOPS, EFFICIENCY_WITNESSES, MURPHREE_WITNESS,
  SPECS, SWEEP_CSV, TRAY_STOPS, YANAGI_14_34KPA, atFs, distillateToluene, murphreeOverrides,
  parseEfficiencySweep, smallestMeeting, type SpecId,
} from "../../case/equilibriumOrRateBased.js";
import { Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, LessonReferences, TexText, lessonStepper } from "./lessonStep.js";
import { openMethodToolAt } from "./registry.js";
import {
  DECISION_ROWS, EQ_RB_COSTS, EQ_RB_ENGINE_SCOPE, EQ_RB_LIMITS, EQ_RB_OPENING, EQ_RB_STEPS,
  EQ_RB_TASK, REFERENCE_FINDINGS,
} from "./equilibriumOrRateBasedLesson.js";

type XY = readonly [number, number];
const step = lessonStepper(EQ_RB_STEPS);
const MEASURED = "#444444";

/** A mole fraction in the unit a reader would quote it in. */
export function asImpurity(x: number): string {
  return x >= 1e-3 ? `${fmt(100 * x, 3)} %` : `${fmt(1e6 * x, 3)} ppm`;
}

/** The targets the tray count can be asked for (the page's own choice). */
const TARGETS: readonly { label: string; value: number }[] = [
  { label: "100 ppm", value: 1e-4 },
  { label: "10 ppm", value: 1e-5 },
  { label: "1 ppm", value: 1e-6 },
];

// ---- Demonstration 1 --------------------------------------------------------

function EfficiencySweepBlock(): JSX.Element {
  const [spec, setSpec] = useState<SpecId>("trace");
  const [guess, setGuess] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const sets = useMemo(() => EFFICIENCY_STOPS.map((e) => murphreeOverrides(spec, e)), [spec]);
  const sweep = useMethodRunSweep(started ? MURPHREE_WITNESS : null, sets, `eff-${spec}`, "choupoSolve");
  const xs = sweep.results.map((r) => distillateToluene(r));
  const iAssumed = EFFICIENCY_STOPS.indexOf(ASSUMED_EFFICIENCY);
  const iLower = iAssumed - 1;
  const xA = xs[iAssumed] ?? null, xL = xs[iLower] ?? null;
  const ratio = xA !== null && xL !== null && xA > 0 ? xL / xA : null;
  const line: XY[] = EFFICIENCY_STOPS.flatMap((e, i): XY[] => (xs[i] != null ? [[e, xs[i]!]] : []));

  return (
    <Stack gap="md">
      <Panel title="predict before you calculate" origin="assumption"
        originNote="the two columns are the page's choice; no plant is described">
        <Text size="sm">
          You designed the column with a Murphree efficiency of 0.7, and the real trays give
          0.6.  How much more toluene leaves in the distillate?
        </Text>
        <SegmentedControl size="xs" value={guess ?? ""} onChange={setGuess}
          data={["about 20 % more", "about twice", "about four times"].map((g) => ({ value: g, label: g }))} />
        <SegmentedControl size="xs" value={spec} onChange={(v) => setSpec(v as SpecId)}
          data={(["trace", "bulk"] as const).map((k) => ({ value: k, label: SPECS[k].label }))} />
        <Text size="xs" c="dimmed">{SPECS[spec].what}</Text>
        <Group gap="sm">
          <Button size="xs" disabled={guess === null || started} onClick={() => setStarted(true)}>
            Run the column at seven efficiencies ({EFFICIENCY_STOPS.length} runs)
          </Button>
          {guess === null && <Text size="xs" c="dimmed">Choose a guess first.</Text>}
          {started && <Text size="xs" c="dimmed">Switch the column above to run the other one.</Text>}
        </Group>
      </Panel>

      {started && (
        <Panel title="the reveal: the engine at every efficiency" origin={["engine", "page"]}
          originNote={`${MURPHREE_WITNESS} with nStages, feedStage, refluxRatio, distillateRate and murphreeEfficiency written in; the page reads the distillate's toluene and divides two of them`}>
          {sweep.busy && <Group gap={6}><Loader size="xs" /><Text size="xs">{sweep.done} of {EFFICIENCY_STOPS.length} runs done…</Text></Group>}
          {sweep.errs.some((e) => e) && (
            <Alert color="red" variant="light" title="a run did not finish">
              <Text size="sm">{sweep.errs.find((e) => e)}</Text>
            </Alert>
          )}
          {line.length > 1 && (
            <XYPlot ariaLabel="toluene in the distillate against the Murphree efficiency, logarithmic"
              xLabel="Murphree efficiency E_MV [-]" yLabel="toluene in the distillate [mole fraction]" ylog
              series={[{ name: `${SPECS[spec].label} (engine)`, color: "#2a78d6", line, points: line }]} />
          )}
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Thead><Table.Tr><Table.Th>E_MV</Table.Th><Table.Th>toluene in the distillate</Table.Th>
                <Table.Th>against E_MV = {ASSUMED_EFFICIENCY}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {EFFICIENCY_STOPS.map((e, i) => (
                  <Table.Tr key={e}>
                    <Table.Td ff="monospace">{e.toFixed(1)}</Table.Td>
                    <Table.Td ff="monospace">{xs[i] != null ? asImpurity(xs[i]!)
                      : sweep.errs[i] ? "did not run" : "…"}</Table.Td>
                    <Table.Td ff="monospace">{xs[i] != null && xA ? `× ${fmt(xs[i]! / xA, 3)}` : ""}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          {ratio !== null && (
            <Text size="sm">
              Your guess: <b>{guess}</b>.  The engine: at an efficiency of 0.6 the distillate
              carries <b>{fmt(ratio, 3)} times</b> the toluene it carries at 0.7
              ({asImpurity(xL!)} against {asImpurity(xA!)}).
              {spec === "trace"
                ? "  Now switch to the bulk column: the same 0.1 of efficiency moves it by about a fifth."
                : "  Now switch to the trace column: the same 0.1 of efficiency moves it by about four times."}
            </Text>
          )}
        </Panel>
      )}
    </Stack>
  );
}

function TrayCountBlock(): JSX.Element {
  const [ei, setEi] = useState(EFFICIENCY_STOPS.indexOf(ASSUMED_EFFICIENCY));
  const [target, setTarget] = useState("10 ppm");
  const [requested, setRequested] = useState<number | null>(null);
  const [done, setDone] = useState<Readonly<Record<string, readonly (number | null)[]>>>({});
  const e = EFFICIENCY_STOPS[ei]!;
  const sets = useMemo(() => (requested === null ? []
    : TRAY_STOPS.map((n) => murphreeOverrides("trace", requested, n))), [requested]);
  const sweep = useMethodRunSweep(requested === null ? null : MURPHREE_WITNESS, sets,
    `trays-${requested}`, "choupoSolve");
  //  Keep each efficiency's finished sweep, so the table grows as the student
  //  counts at one efficiency after another.
  useEffect(() => {
    if (requested === null || sweep.busy || sweep.done !== TRAY_STOPS.length) return;
    if (sweep.errs.some((x) => x)) return;
    const values = sweep.results.map((r) => distillateToluene(r));
    setDone((d) => (d[String(requested)] !== undefined ? d : { ...d, [String(requested)]: values }));
  }, [requested, sweep.busy, sweep.done, sweep.errs, sweep.results]);
  const spec = TARGETS.find((t) => t.label === target)!.value;

  return (
    <Panel title="how many trays a target needs, at each efficiency" origin={["engine", "page", "assumption"]}
      originNote="the trace column at every height from 16 to 80 stages (the feed held ten stages above the bottom); the page picks the smallest height on that grid that meets the target, which is the page's choice">
      <Box>
        <Group justify="space-between" gap={6}>
          <Text size="xs" c="dimmed">Murphree efficiency</Text>
          <Text size="xs" ff="monospace">E_MV = {e.toFixed(1)}</Text>
        </Group>
        <Slider size="xs" mt={4} value={ei} min={0} max={EFFICIENCY_STOPS.length - 1} step={1}
          label={null} onChange={setEi} marks={EFFICIENCY_STOPS.map((_, i) => ({ value: i }))} />
      </Box>
      <Group gap="sm" align="center" wrap="wrap">
        <SegmentedControl size="xs" value={target} onChange={setTarget}
          data={TARGETS.map((t) => ({ value: t.label, label: t.label }))} />
        <Button size="xs" variant="light"
          disabled={sweep.busy || done[String(e)] !== undefined}
          onClick={() => setRequested(e)}>
          Count the trays at E_MV = {e.toFixed(1)} ({TRAY_STOPS.length} runs)
        </Button>
      </Group>
      {sweep.busy && <Group gap={6}><Loader size="xs" /><Text size="xs">{sweep.done} of {TRAY_STOPS.length} runs done…</Text></Group>}
      {sweep.errs.some((x) => x) && (
        <Alert color="red" variant="light" title="a run did not finish">
          <Text size="sm">{sweep.errs.find((x) => x)}</Text>
        </Alert>
      )}
      {Object.keys(done).length > 0 && (
        <Wide>
          <Table withTableBorder fz="xs" style={{ width: "auto" }}>
            <Table.Thead><Table.Tr><Table.Th>E_MV</Table.Th>
              <Table.Th>stages for {target} (reboiler counted)</Table.Th><Table.Th>real trays</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {EFFICIENCY_STOPS.filter((x) => done[String(x)] !== undefined).map((x) => {
                const n = smallestMeeting(TRAY_STOPS, done[String(x)]!, spec);
                return (
                  <Table.Tr key={x}>
                    <Table.Td ff="monospace">{x.toFixed(1)}</Table.Td>
                    <Table.Td ff="monospace">{n ?? `more than ${TRAY_STOPS[TRAY_STOPS.length - 1]}`}</Table.Td>
                    <Table.Td ff="monospace">{n !== null ? n - 1 : ""}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Wide>
      )}
      <Text size="sm">
        Count at 1.0, then at 0.7 and 0.4.  The stage count grows about as one over the
        efficiency; the impurity at a fixed height moved by decades.  The grid steps by two
        stages, so each count is good to two.
      </Text>
    </Panel>
  );
}

// ---- Demonstration 2 --------------------------------------------------------

function TrayEfficiencyBlock(): JSX.Element {
  const [guess, setGuess] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const sets = useMemo(() => [[]], []);
  const [w0, w1, w2] = EFFICIENCY_WITNESSES;
  const runs = [
    useMethodRunSweep(started ? w0!.witness : null, sets, "tray-0", "choupoSolve"),
    useMethodRunSweep(started ? w1!.witness : null, sets, "tray-1", "choupoSolve"),
    useMethodRunSweep(started ? w2!.witness : null, sets, "tray-2", "choupoSolve"),
  ];
  const sweeps = runs.map((r) => parseEfficiencySweep(r.results[0]?.csvFiles?.[SWEEP_CSV]));
  const busy = runs.some((r) => r.busy);
  const err = runs.map((r) => r.errs[0]).find((x) => x);
  const at = sweeps.map((s) => (s ? atFs(s, COMPARE_FS) : null));
  const vals = at.flatMap((a) => (a ? [a.overall] : []));
  const spread = vals.length === EFFICIENCY_WITNESSES.length ? Math.max(...vals) - Math.min(...vals) : null;

  return (
    <Stack gap="md">
      <Panel title="predict before you calculate" origin="assumption"
        originNote="the guesses are the page's; the tray and its measurement are a test column's">
        <Text size="sm">
          Three published correlations compute the efficiency of the same sieve tray at an
          F-factor of {COMPARE_FS}.  How far apart are they?
        </Text>
        <SegmentedControl size="xs" value={guess ?? ""} onChange={setGuess}
          data={["within 5 points", "about 10 points", "more than 20 points"].map((g) => ({ value: g, label: g }))} />
        <Group gap="sm">
          <Button size="xs" disabled={guess === null || started} onClick={() => setStarted(true)}>
            Run the three correlations (3 runs, each sweeping 21 loads)
          </Button>
          {guess === null && <Text size="xs" c="dimmed">Choose a guess first.</Text>}
        </Group>
      </Panel>

      {started && (
        <Panel title="the reveal: three engine sweeps beside the measurement" origin={["engine", "reference"]}
          originNote="each line is the sweep CSV its witness's outerDict writes; the points are Yanagi and Sakata's measurements as the tree transcribes them">
          {busy && <Group gap={6}><Loader size="xs" /><Text size="xs">the engine is running…</Text></Group>}
          {err && (
            <Alert color="red" variant="light" title="a run did not finish">
              <Text size="sm">{err}</Text>
            </Alert>
          )}
          {sweeps.some((s) => s) && (
            <XYPlot ariaLabel="overall tray efficiency against the F-factor, three correlations and the measurement"
              xLabel="F-factor F_s [(m/s)(kg/m³)^0.5]" yLabel="overall tray efficiency E_O [-]"
              series={[
                ...EFFICIENCY_WITNESSES.flatMap((w, i) => (sweeps[i] ? [{
                  name: `${w.model} (engine${w.inSample ? ", fitted on data that include this tray" : ""})`,
                  color: w.color,
                  line: sweeps[i]!.fs.map((f, k): XY => [f, sweeps[i]!.overall[k]!]),
                }] : [])),
                { name: "measured, Yanagi and Sakata (1982)", color: MEASURED,
                  points: YANAGI_14_34KPA.map((p): XY => [p.fs, p.overall]) },
              ]} />
          )}
          {spread !== null && (
            <>
              <Wide>
                <Table withTableBorder fz="xs" style={{ width: "auto" }}>
                  <Table.Thead><Table.Tr><Table.Th>at F_s = {COMPARE_FS}</Table.Th><Table.Th>E_O</Table.Th>
                    <Table.Th>mean E_MV</Table.Th><Table.Th>approach to flood</Table.Th><Table.Th>data include this tray</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {EFFICIENCY_WITNESSES.map((w, i) => (
                      <Table.Tr key={w.model}>
                        <Table.Td>{w.model}</Table.Td>
                        <Table.Td ff="monospace">{at[i] ? fmt(at[i]!.overall, 3) : "—"}</Table.Td>
                        <Table.Td ff="monospace">{at[i] ? fmt(at[i]!.murphreeMean, 3) : "—"}</Table.Td>
                        <Table.Td ff="monospace">{at[i] ? fmt(at[i]!.flood, 3) : "—"}</Table.Td>
                        <Table.Td>{w.inSample ? <Badge size="xs" color="orange" tt="none">yes</Badge>
                          : <Badge size="xs" color="gray" tt="none">no</Badge>}</Table.Td>
                      </Table.Tr>
                    ))}
                    <Table.Tr><Table.Td>measured, run 628 at F_s = 1.472</Table.Td>
                      <Table.Td ff="monospace">0.708</Table.Td><Table.Td /><Table.Td /><Table.Td /></Table.Tr>
                  </Table.Tbody>
                </Table>
              </Wide>
              <Text size="sm">
                Your guess: <b>{guess}</b>.  The engine: the three correlations span{" "}
                <b>{fmt(100 * spread, 3)} points</b> at F_s = {COMPARE_FS}.  The measured
                efficiency stays between 63 and 74 % from F_s = 1 to 2: one tray in its normal
                range is fairly summarised by one number, but which number is the uncertain
                part, and demonstration 1 showed what 0.1 of it is worth on a trace
                specification.
              </Text>
            </>
          )}
        </Panel>
      )}
    </Stack>
  );
}

// ---- The page ---------------------------------------------------------------

export function EquilibriumOrRateBasedTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>Equilibrium stages or a rate-based model?</Title>
          <Text size="md" mt={6}>{EQ_RB_OPENING}</Text>
        </Box>

        <Panel title="your task, and what the engine has" origin="page"
          originNote="text: the task, and the engine's scope with the lines it is read at">
          <Text size="sm" fs="italic">&ldquo;{EQ_RB_TASK}&rdquo;</Text>
          <Text size="sm">{EQ_RB_ENGINE_SCOPE}</Text>
        </Panel>

        {step(1)}
        {step(2)}
        <EfficiencySweepBlock />
        <TrayCountBlock />
        {step(3)}
        <TrayEfficiencyBlock />
        {step(4)}

        <Panel title="taken from the references, not from the engine" origin="reference"
          originNote="each card was read in the paper it names, listed under References">
          <Stack gap={8}>
            {REFERENCE_FINDINGS.map((f) => (
              <Box key={f.source} px="sm" py={6}
                style={{ borderLeft: "3px solid var(--mantine-color-default-border)", overflowWrap: "anywhere" }}>
                <Text size="sm" fw={600}>{f.source}</Text>
                <Text size="sm"><Text span c="dimmed" size="xs">what was compared · </Text>{f.setting}</Text>
                <Text size="sm"><Text span c="dimmed" size="xs">what was found · </Text>{f.found}</Text>
                {f.quote && <Text size="sm" fs="italic">&ldquo;{f.quote}&rdquo;</Text>}
              </Box>
            ))}
          </Stack>
        </Panel>

        {step(5)}

        <Panel title="the decision aid" origin={["engine", "reference"]}
          originNote="every row names its origin; a row with neither a demonstration nor a paper behind it was left out">
          <Stack gap={8}>
            {DECISION_ROWS.map((r) => (
              <Box key={r.situation} px="sm" py={6}
                style={{ borderLeft: "3px solid var(--mantine-color-default-border)", overflowWrap: "anywhere" }}>
                <Text size="sm" fw={600}>{r.situation}</Text>
                <Text size="sm"><Text span c="dimmed" size="xs">use · </Text>{r.use}</Text>
                <Text size="sm"><Text span c="dimmed" size="xs">why · </Text>{r.why}</Text>
                <Text size="sm"><Text span c="dimmed" size="xs">origin · </Text>{r.origin}</Text>
              </Box>
            ))}
          </Stack>
        </Panel>

        <Panel title="what each choice costs" origin={["engine", "reference"]}
          originNote="each sentence names its origin">
          <Stack gap={6}>
            {EQ_RB_COSTS.map((c) => (
              <Text key={c.text} size="sm">
                <TexText text={c.text} />{" "}
                <Text span c="dimmed" size="xs">({c.origin})</Text>
              </Text>
            ))}
          </Stack>
        </Panel>

        <LessonLimits limits={EQ_RB_LIMITS} />
        <LessonReferences tool="equilibrium-or-rate-based" />

        <Text size="xs" c="dimmed">
          Before this page in the distillation sequence:{" "}
          <Text span component="a" href="#" c="accent" size="xs"
            onClick={(ev) => { ev.preventDefault(); openMethodToolAt("fug", null); }}>
            the shortcut column
          </Text>
          ; after it:{" "}
          <Text span component="a" href="#" c="accent" size="xs"
            onClick={(ev) => { ev.preventDefault(); openMethodToolAt("plant-cost", null); }}>
            what a plant costs to build
          </Text>.
        </Text>
      </Stack>
    </Box>
  );
}
