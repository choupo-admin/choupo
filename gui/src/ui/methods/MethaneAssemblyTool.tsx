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
  MethaneAssemblyTool -- the EduTool `methane-assembly`, "Assemble methane
  combustion".

  The student's task, in one sentence: "Start from the hydrogen and oxygen core
  in the reaction library, add the carbon chain one rung at a time, and say,
  after each rung, what the engine predicts for the ignition delay a shock tube
  measured, and which reactions decide it."

  NO RUN STARTS ON OPENING.  The ladder runs when its button is pressed (six
  shipped cases, one after another, the engine's batch binary in the browser),
  and the sensitivity when its own button is pressed (the assembled case with
  one integration per reaction).  Every number on the ladder and in the
  sensitivity is read from what the engine wrote; the comparison with the
  measurement is a recorded table (the review's scans, a reference), drawn and
  summarised here by the page.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SimpleGrid, Stack, Table, Text, Title,
} from "@mantine/core";

import { tutorialByName } from "../../cases/tutorials.js";
import {
  CHAIN, PETERSEN, POINTS, SENSITIVITY_WITNESS, STAGES, VESSEL, addedBy, column, finalAmounts, finalT,
  ratioStats, sensitivityRows, shippedPoint, tauOfLog, METHANE_BINARY, type ModelKey, type Stage,
} from "../../case/methaneAssembly.js";
import { useWitnessSweep } from "../../case/methaneAssemblyRun.js";
import { useMethodRun } from "../../case/methodRun.js";
import { Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { METHANE_LIMITS, METHANE_STEPS, METHANE_TASK } from "./methaneAssemblyLesson.js";

type XY = readonly [number, number];
const COLORS = ["#2a78d6", "#d4572a", "#1baf7a", "#8e44ad", "#c2a100", "#6b6b6b"];
const step = lessonStepper(METHANE_STEPS);

/** The start every case shares, read from the first case's own 0/ file. */
function startOf(): { T: string; P: string; mix: string } | null {
  const t = tutorialByName(STAGES[0]!.witness)?.files.rawFiles?.[`0/internalStates/${VESSEL}`];
  if (!t) return null;
  const g = (re: RegExp) => re.exec(t)?.[1] ?? "?";
  const frac = (sp: string) => Number(new RegExp(`\\b${sp}\\s+([0-9.eE+-]+);`).exec(t)?.[1] ?? "0");
  return {
    T: g(/\bT\s+([0-9.eE+-]+)\s*K;/), P: g(/\bP\s+([0-9.eE+-]+)\s*atm;/),
    mix: `CH4 ${fmt(frac("CH4"), 3)}, O2 ${fmt(frac("O2"), 3)}, N2 ${fmt(frac("N2"), 3)} (mole fractions)`,
  };
}

function RunNote({ busy, done, total, errs }: { busy: boolean; done: number; total: number; errs: (string | null)[] }) {
  const err = errs.find((e) => e);
  return (
    <>
      {busy && <Group gap={6}><Loader size="xs" /><Text size="xs">{done} of {total} cases done…</Text></Group>}
      {err && <Alert color="red" variant="light" title="the engine did not finish"><Text size="sm">{err}</Text></Alert>}
    </>
  );
}

// ---------------------------------------------------------------------------------
//  The ladder: the reactions a rung adds, and what the engine says after it ran
// ---------------------------------------------------------------------------------

function AddedReactions({ id }: { id: Stage["id"] }): JSX.Element {
  const rows = addedBy(id);
  return (
    <Wide>
      <Table withTableBorder fz="xs" style={{ width: "auto" }}>
        <Table.Thead><Table.Tr>
          <Table.Th>label</Table.Th><Table.Th>reaction</Table.Th><Table.Th>journal page</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.record}>
              <Table.Td ff="monospace">{r.label}</Table.Td>
              <Table.Td ff="monospace">{r.equation}</Table.Td>
              <Table.Td ff="monospace">{r.page}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Wide>
  );
}

function RungPanel({ stage, run }: { stage: Stage; run: import("../../adapters/SolverAdapter.js").RunResult | null }): JSX.Element {
  const traj = run?.trajectory ?? null;
  const tau = run ? tauOfLog(run.log) : null;
  const Tend = traj ? finalT(traj) : null;
  const plots = useMemo(() => {
    if (!traj) return null;
    const T = column(traj, "T");
    const tT: XY[] = T ? traj.t.map((t, i): XY => [t * 1e6, T[i]!]) : [];
    const sp = stage.watch.map((s, k) => {
      const c = column(traj, s);
      return c ? { name: s, color: COLORS[k % COLORS.length]!, line: traj.t.map((t, i): XY => [t * 1e6, c[i]! * 1e6]) } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    return { tT, sp };
  }, [traj, stage]);
  return (
    <Panel title={`rung: ${stage.title}`} origin={["engine", "reference"]}
      originNote={`the reactions are library records (a reference: the journal page of each is printed); the runs are the shipped case ${stage.witness}`}>
      <Text size="sm">
        The case lists the sets {stage.sets.join(", ")}.  This rung adds {addedBy(stage.id).length} reactions:
      </Text>
      <AddedReactions id={stage.id} />
      {!run && <Text size="sm" c="dimmed">Run the ladder (the button above) to see what the engine says after this rung.</Text>}
      {run && plots && (
        <>
          <Group gap="lg">
            <Badge size="lg" variant="light" tt="none">
              ignition delay {tau !== null ? `${fmt(tau * 1e6, 3)} µs` : "none: the temperature never rose by 200 K"}
            </Badge>
            <Badge size="lg" variant="light" color="gray" tt="none">
              final temperature {Tend !== null ? `${fmt(Tend, 5)} K` : "—"}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            <XYPlot tight ariaLabel={`temperature against time, ${stage.title}`} xLabel="t [µs]" yLabel="T [K]"
              series={[{ name: "gas temperature", color: COLORS[1]!, line: plots.tT }]} />
            <XYPlot ariaLabel={`amounts against time, ${stage.title}`} xLabel="t [µs]" yLabel="amount [mmol]"
              series={plots.sp} />
          </SimpleGrid>
        </>
      )}
    </Panel>
  );
}

function RungSummary({ runs }: { runs: ReturnType<typeof useWitnessSweep> }): JSX.Element | null {
  if (runs.done === 0) return null;
  return (
    <Panel title="the ladder, rung by rung" origin="engine"
      originNote="each row is one shipped case run by the engine in this browser">
      <Wide>
        <Table withTableBorder fz="xs" style={{ width: "auto" }}>
          <Table.Thead><Table.Tr>
            <Table.Th>rung</Table.Th><Table.Th>reactions</Table.Th><Table.Th>ignition delay [µs]</Table.Th>
            <Table.Th>final T [K]</Table.Th><Table.Th>CO left [mmol]</Table.Th><Table.Th>CO2 made [mmol]</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {STAGES.map((s, i) => {
              const r = runs.results[i];
              if (!r) return null;
              const fin = r.trajectory ? finalAmounts(r.trajectory) : {};
              const tau = tauOfLog(r.log);
              const n = STAGES.slice(0, i + 1).reduce((a, x) => a + addedBy(x.id).length, 0);
              return (
                <Table.Tr key={s.id}>
                  <Table.Td>{s.title}</Table.Td>
                  <Table.Td ff="monospace">{n}</Table.Td>
                  <Table.Td ff="monospace">{tau !== null ? fmt(tau * 1e6, 3) : "none"}</Table.Td>
                  <Table.Td ff="monospace">{r.trajectory ? fmt(finalT(r.trajectory) ?? NaN, 5) : "—"}</Table.Td>
                  <Table.Td ff="monospace">{fmt((fin["CO"] ?? 0) * 1e6, 3)}</Table.Td>
                  <Table.Td ff="monospace">{fmt((fin["CO2"] ?? 0) * 1e6, 3)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Wide>
      <Text size="sm">
        The shock tube measured {PETERSEN.measured_us} µs at this point (Petersen, Davidson and Hanson 1999,
        Table 2, page 86).
      </Text>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  The sensitivity
// ---------------------------------------------------------------------------------

function SensitivityPanel(): JSX.Element {
  const [ran, setRan] = useState(false);
  const run = useMethodRun(ran ? SENSITIVITY_WITNESS : null, [], ran ? "sens" : "off", METHANE_BINARY);
  const rows = sensitivityRows(run.result?.kpis?.[VESSEL]).slice(0, 8);
  const tau = run.result ? tauOfLog(run.result.log) : null;
  const smax = Math.max(1e-9, ...rows.map((r) => Math.abs(r.S)));
  return (
    <Panel title="which reactions govern the delay" origin="engine"
      originNote="the shipped case methane07_sensitivity: the assembled set, one integration per reaction, the coefficients the engine pinned">
      <Group gap="md">
        <Button size="xs" onClick={() => setRan(true)} disabled={ran && run.busy}>
          {ran ? "run again" : "run the sensitivity (one integration per reaction)"}
        </Button>
        {run.busy && <Group gap={6}><Loader size="xs" /><Text size="xs">integrating the vessel once per reaction…</Text></Group>}
      </Group>
      <Text size="xs" c="dimmed">
        One integration per reaction at a tight tolerance: this takes minutes, longer in the browser than
        natively, and the page shows its progress only when the engine returns.
      </Text>
      {run.err && <Alert color="red" variant="light" title="the engine did not finish"><Text size="sm">{run.err}</Text></Alert>}
      {rows.length > 0 && (
        <>
          <Text size="sm">
            Base ignition delay {tau !== null ? `${fmt(tau * 1e6, 3)} µs` : "—"}.  The eight reactions with the
            largest coefficient, of every reaction in the case; the bar is the size, the colour the sign
            (blue: a faster reaction brings the ignition forward).
          </Text>
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Thead><Table.Tr>
                <Table.Th>label</Table.Th><Table.Th>reaction</Table.Th><Table.Th>added in</Table.Th>
                <Table.Th>S</Table.Th><Table.Th style={{ minWidth: 160 }}> </Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>
                {rows.map((r) => (
                  <Table.Tr key={r.label}>
                    <Table.Td ff="monospace">{r.label}</Table.Td>
                    <Table.Td ff="monospace">{r.equation}</Table.Td>
                    <Table.Td>{CHAIN.find((c) => c.id === r.stage)?.label ?? "the core"}</Table.Td>
                    <Table.Td ff="monospace">{fmt(r.S, 3)}</Table.Td>
                    <Table.Td>
                      <Box style={{
                        height: 10, width: `${Math.max(2, (Math.abs(r.S) / smax) * 100)}%`,
                        background: r.S < 0 ? COLORS[0] : COLORS[1], borderRadius: 2,
                      }} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  The comparison with the measurement
// ---------------------------------------------------------------------------------

const MODELS: readonly { key: ModelKey; label: string }[] = [
  { key: "assembled_us", label: "assembled set" },
  { key: "c1Chain_us", label: "C1 chain only" },
  { key: "millerBowmanFull_us", label: "whole Appendix A" },
  { key: "aramco_us", label: "AramcoMech 1.3" },
];

function ComparisonPanel(): JSX.Element {
  const shipped = shippedPoint();
  const lo = Math.min(...POINTS.map((p) => p.measured_us)) * 0.6;
  const hi = Math.max(...POINTS.flatMap((p) => [p.measured_us, p.assembled_us, p.millerBowmanFull_us])) * 1.5;
  const series = [
    ...MODELS.map((m, k) => ({
      name: m.label, color: COLORS[k]!,
      points: POINTS.map((p): XY => [p.measured_us, p[m.key]]),
    })),
    { name: "model = measurement", color: COLORS[5]!, dash: "6 4", line: [[lo, lo], [hi, hi]] as XY[] },
  ];
  return (
    <Panel title="against the shock tube and against the whole appendix" origin="reference"
      originNote="recorded scans: every point run by the engine under each model, docs/reviews/2026-11-22-methane-lesson/ (the measured delays are Table 2 of the paper); not run in this browser">
      <Text size="sm">
        {POINTS.length} points of the two nitrogen mixtures of the shock-tube paper, at pressures from{" "}
        {fmt(Math.min(...POINTS.map((p) => p.P_atm)), 3)} to {fmt(Math.max(...POINTS.map((p) => p.P_atm)), 3)}{" "}
        atmospheres, run under each model with the vessel of the cases above.  The cases of the ladder are
        the point {PETERSEN.P_atm} atm, {PETERSEN.T_K} K{shipped ? ` (measured ${shipped.measured_us} µs)` : ""}.
      </Text>
      <XYPlot xlog ylog ariaLabel="model ignition delay against measured ignition delay"
        xLabel="measured delay [µs]" yLabel="model delay [µs]" series={series} />
      <Wide>
        <Table withTableBorder fz="xs" style={{ width: "auto" }}>
          <Table.Thead><Table.Tr>
            <Table.Th>model</Table.Th><Table.Th>against the measured delays: mean ratio</Table.Th>
            <Table.Th>scatter</Table.Th><Table.Th>lowest, highest</Table.Th>
            <Table.Th>against the whole appendix: mean ratio</Table.Th><Table.Th>scatter</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {MODELS.map((m) => {
              const a = ratioStats(POINTS, m.key, "measured_us");
              const b = m.key === "millerBowmanFull_us" ? null : ratioStats(POINTS, m.key, "millerBowmanFull_us");
              return (
                <Table.Tr key={m.key}>
                  <Table.Td>{m.label}</Table.Td>
                  <Table.Td ff="monospace">{fmt(a.mean, 3)}</Table.Td>
                  <Table.Td ff="monospace">×{fmt(a.scatter, 3)}</Table.Td>
                  <Table.Td ff="monospace">{fmt(a.lo, 2)}, {fmt(a.hi, 3)}</Table.Td>
                  <Table.Td ff="monospace">{b ? fmt(b.mean, 3) : "—"}</Table.Td>
                  <Table.Td ff="monospace">{b ? `×${fmt(b.scatter, 3)}` : "—"}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Wide>
      <Wide>
        <Table withTableBorder fz="xs" style={{ width: "auto" }}>
          <Table.Thead><Table.Tr>
            <Table.Th>mixture</Table.Th><Table.Th>P [atm]</Table.Th><Table.Th>T [K]</Table.Th>
            <Table.Th>measured [µs]</Table.Th>
            {MODELS.map((m) => <Table.Th key={m.key}>{m.label} [µs]</Table.Th>)}
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {POINTS.map((p) => (
              <Table.Tr key={`${p.mixture}-${p.P_atm}-${p.T_K}`}>
                <Table.Td>{p.mixture}</Table.Td>
                <Table.Td ff="monospace">{p.P_atm}</Table.Td>
                <Table.Td ff="monospace">{p.T_K}</Table.Td>
                <Table.Td ff="monospace">{p.measured_us}</Table.Td>
                {MODELS.map((m) => <Table.Td key={m.key} ff="monospace">{fmt(p[m.key], 3)}</Table.Td>)}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Wide>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  The page
// ---------------------------------------------------------------------------------

export function MethaneAssemblyTool(): JSX.Element {
  const start = startOf();
  const [armed, setArmed] = useState(false);
  const witnesses = useMemo(() => (armed ? STAGES.map((s) => s.witness) : null), [armed]);
  const runs = useWitnessSweep(witnesses, armed ? "ladder" : "off");
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>Assemble methane combustion</Title>
          <Text size="md" mt={6}>{METHANE_TASK}</Text>
          <Text size="sm" c="dimmed" mt={6}>
            You assemble the mechanism from the reaction library in six rungs, run each as a shipped case, and
            read the ignition delay the engine prints against a shock-tube measurement.  Nothing runs until you
            press a button.
          </Text>
        </Box>

        <Panel title="the start every case shares" origin={["reference", "assumption"]}
          originNote="Petersen, Davidson and Hanson 1999, Table 1 (mixture 2) and Table 2, page 86; the vessel is the case's declared holdup">
          <Text size="sm">
            {start ? `${start.mix}, ${start.T} K, ${start.P} atm` : "the start of the cases"}; a closed, adiabatic,
            constant-volume vessel of one litre.  The shock tube measured {PETERSEN.measured_us} µs.
          </Text>
        </Panel>

        {step(1)}

        <Panel title="run the ladder" origin="engine"
          originNote="six shipped cases of tutorials/batch/combustion, run one after another by the engine's batch binary in this browser">
          <Group gap="md">
            <Button size="xs" onClick={() => setArmed(true)} disabled={armed && runs.busy}>
              {armed ? "run the ladder again" : "run the six rungs"}
            </Button>
            <RunNote busy={runs.busy} done={runs.done} total={STAGES.length} errs={runs.errs} />
          </Group>
        </Panel>

        {step(2)}
        <RungPanel stage={STAGES[0]!} run={runs.results[0] ?? null} />
        {step(3)}
        <RungPanel stage={STAGES[1]!} run={runs.results[1] ?? null} />
        {step(4)}
        <RungPanel stage={STAGES[2]!} run={runs.results[2] ?? null} />
        {step(5)}
        <RungPanel stage={STAGES[3]!} run={runs.results[3] ?? null} />
        <RungPanel stage={STAGES[4]!} run={runs.results[4] ?? null} />
        {step(6)}
        <RungPanel stage={STAGES[5]!} run={runs.results[5] ?? null} />
        <RungSummary runs={runs} />
        {step(7)}
        <SensitivityPanel />
        {step(8)}
        <ComparisonPanel />

        <LessonLimits limits={METHANE_LIMITS} />
        <LessonReferences tool="methane-assembly" />
      </Stack>
    </Box>
  );
}
