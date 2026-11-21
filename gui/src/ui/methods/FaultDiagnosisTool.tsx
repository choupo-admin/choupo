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
  FaultDiagnosisTool -- "How a plant tells you something is wrong" (DEV.md 4c
  C464): fault detection and diagnosis in plain language.

  THE TASK (CLAUDE.md section 10): a student who has never met the subject has
  to leave able to say, of a plant that looks odd, which observation would
  separate the explanations, what to compare it with, and what a given
  disagreement does and does not prove.  The page opens with a true story
  (a dehumidifier), draws ONE ORIGINAL DIAGRAM PER STEP, puts a live figure on
  every method, and ends with generated CHALLENGES where the student sees only
  measurements and names the hidden fault.

  NO ENGINE IS RUN.  Every number is computed in this page, from assumptions
  it declares; the plants are toys and the page says so first.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Box, Button, Checkbox, Group, NumberInput, Radio, Stack, Table, Text, Title,
} from "@mantine/core";

import { TraceChart, type TraceSeries } from "./FaultCharts.js";
import { FaultDiagram } from "./FaultDiagrams.js";
import {
  AlarmFigure, ChartFigure, HumidistatFigure, HumidityFigure, HxFigure, PumpFigure,
  ReconcileFigure, RoomFigure, SensorFigure, SeparateFigure, SignatureFigure, TankFigure,
} from "./FaultFigures.js";
import {
  diagnose, EVIDENCE, FAULT_LABEL, grade, makeChallenge, type Challenge, type FaultKind,
} from "./faultChallenge.js";
import {
  FAULT_DIAGNOSIS_LIMITS, FAULT_DIAGNOSIS_QUIZ, FAULT_DIAGNOSIS_STEPS,
} from "./faultDiagnosisLesson.js";
import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(FAULT_DIAGNOSIS_STEPS);

/** The seeds of the numbered challenges, easy to hard; tests/faultDiagnosis
 *  pins the fault each one hides.  Any other seed can be typed. */
export const CHALLENGE_SEEDS: readonly number[] = [6, 7, 2, 1, 15, 3, 4, 14];

/** A figure: its origin said first (computed here, from the page's own
 *  assumptions), then the figure. */
function Fig({ note, children }: { note: string; children: React.ReactNode }): JSX.Element {
  return (
    <Box mt="xs" mb="md">
      <OriginMark of={["page", "assumption"]} note={note} />
      {children}
    </Box>
  );
}

const NOTE_TOY = "computed in this page from the toy's declared numbers; every size is an assumption";

// ---- the challenges ------------------------------------------------------------

/** One chart per unit: series that share a unit share a chart. */
function ChallengeCharts({ ch }: { ch: Challenge }): JSX.Element {
  const units = [...new Set(ch.series.map((s) => s.unit))];
  return (
    <>
      {units.map((u) => {
        const group = ch.series.filter((s) => s.unit === u);
        const series: TraceSeries[] = group.map((s) => ({ label: s.label, y: s.y, step: s.unit === "0/1" }));
        return (
          <TraceChart key={u} x={group[0]!.t} series={series} xLabel={`time, ${ch.tUnit}`} yLabel={u}
            height={150} id={`challenge-${u}`} ariaLabel={`${group.map((s) => s.label).join(" and ")} (${u})`} />
        );
      })}
    </>
  );
}

function ChallengeSection(): JSX.Element {
  const [seed, setSeed] = useState<number>(CHALLENGE_SEEDS[0]!);
  const ch = useMemo(() => makeChallenge(seed), [seed]);
  const [tools, setTools] = useState(false);
  const [kind, setKind] = useState<FaultKind | null>(null);
  const [ev, setEv] = useState<FaultKind | null>(null);
  const [checked, setChecked] = useState(false);
  const pick = (s: number): void => { setSeed(s); setKind(null); setEv(null); setChecked(false); setTools(false); };
  const g = grade(ch, kind, ev);
  return (
    <Box data-challenges="" mt="md">
      <Title order={5}>Challenges: you are the diagnostician</Title>
      <Text size="sm" c="dimmed" mt={4}>
        Each challenge is a small plant with a hidden fault, or none, drawn from a seed. You see only what the instruments
        logged. Look, compute what you need, name the fault and the observation that proves it. About one case in eight is
        healthy: crying wolf is also a mistake. The same seed always gives the same case, so you can quote one.
      </Text>
      <Group gap={6} mt="xs" data-challenge-picker="">
        {CHALLENGE_SEEDS.map((s, i) => (
          <Button key={s} size="compact-xs" variant={s === seed ? "filled" : "light"} onClick={() => pick(s)}>{i + 1}</Button>
        ))}
        <NumberInput size="xs" w={110} value={seed} min={1} max={999999} step={1} aria-label="challenge seed"
          onChange={(v) => { if (typeof v === "number" && v >= 1) pick(Math.round(v)); }} />
        <Button size="compact-xs" variant="default" onClick={() => pick(1000 + Math.floor(Math.random() * 998000))}>a new random case</Button>
      </Group>
      <Box mt="sm" data-challenge={ch.seed}>
        <OriginMark of={["page", "assumption"]} note="a generated toy plant: the measurements are noise plus the hidden fault's shape, from the seed" />
        <Text fw={600} size="sm" mt={4}>{ch.title} (seed {ch.seed})</Text>
        <Text size="sm">{ch.story}</Text>
        <ChallengeCharts ch={ch} />
        <Checkbox size="xs" mt={6} checked={tools} onChange={(e) => setTools(e.currentTarget.checked)} data-challenge-tools=""
          label="Compute the residuals and signatures for me (the same checks as the methods above)" />
        {tools && (
          <Box data-challenge-derived="">
            {ch.derived.map((d) => (
              <TraceChart key={d.id} x={d.t} xLabel={`time, ${ch.tUnit}`} yLabel={d.unit} height={140} id={`derived-${d.id}`}
                ariaLabel={d.label} series={[{ label: d.label, y: d.y, dots: d.id === "balance" && ch.plant === "tank" }]} />
            ))}
            {ch.metrics.length > 0 && (
              <Table withTableBorder withColumnBorders fz="xs" mt={6}>
                <Table.Tbody>
                  {ch.metrics.map((m) => (
                    <Table.Tr key={m.id}><Table.Td>{m.label}</Table.Td><Table.Td><b>{m.value.toFixed(2)}</b> {m.unit}</Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Box>
        )}
        <Radio.Group mt="sm" value={kind ?? ""} onChange={(v) => { setKind(v as FaultKind); setChecked(false); }}
          label="What is wrong with this plant?" data-challenge-kind="">
          <Stack gap={4} mt={4}>
            {ch.options.map((k) => <Radio key={k} size="xs" value={k} label={FAULT_LABEL[k]} />)}
          </Stack>
        </Radio.Group>
        <Radio.Group mt="sm" value={ev ?? ""} onChange={(v) => { setEv(v as FaultKind); setChecked(false); }}
          label="Which observation proves it?" data-challenge-evidence="">
          <Stack gap={4} mt={4}>
            {ch.evidence.map((k) => <Radio key={k} size="xs" value={k} label={EVIDENCE[k]} />)}
          </Stack>
        </Radio.Group>
        <Group mt="sm">
          <Button size="xs" disabled={kind === null || ev === null} onClick={() => setChecked(true)}>Check my answer</Button>
        </Group>
        {checked && (
          <Alert mt="xs" variant="light" color={g.kindOk && g.evidenceOk ? "teal" : g.kindOk ? "yellow" : "red"} data-challenge-result=""
            title={g.kindOk ? (g.evidenceOk ? "Right, and for the right reason" : "Right fault, but that is not the proof") : "Not this one"}>
            <Text size="sm">The hidden fault was: <b>{FAULT_LABEL[ch.kind]}</b>.</Text>
            <Text size="sm">What proves it: {EVIDENCE[ch.kind]}</Text>
            <Text size="xs" c="dimmed" mt={4}>The page&apos;s own rule-based diagnoser, reading the same numbers, says: {diagnose(ch).why}.</Text>
          </Alert>
        )}
      </Box>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------------

export function FaultDiagnosisTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Box>
          <Title order={4}>How a plant tells you something is wrong</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Fault detection and diagnosis in plain language: from a dehumidifier that cooled a house, to alarms, residuals,
            redundancy, reconciliation and the shapes a fault leaves in time, ending with cases where you find the fault.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Every plant here is a toy" data-toy-banner="">
            Nothing on this page runs the engine. Each figure is computed in the page from numbers the page declares, and those
            numbers are illustrations chosen to tell a story, not measurements of a real plant. The story in the first steps
            happened in the author&apos;s house and is told, not re-measured.
          </Alert>
          <Box mt="xs">
            <OriginMark of="reference" note="Seborg, Edgar, Mellichamp and Doyle, Process Dynamics and Control, 4th ed. (Wiley, 2017), and Montgomery, Introduction to Statistical Quality Control, 6th ed. (Wiley, 2009): the pages named in each step" />
          </Box>
        </Box>

        {step(1)}<FaultDiagram n={1} />
        <Fig note={NOTE_TOY + " (the room's two heat stores were sized to give the story's dip)"}><RoomFigure /></Fig>

        {step(2)}<FaultDiagram n={2} />
        <Fig note={NOTE_TOY + " (tank, load and pump rate chosen to give 4.5 h and 20 min)"}><SeparateFigure /></Fig>

        {step(3)}<FaultDiagram n={3} />
        <Fig note={NOTE_TOY + "; saturation pressure of water from the Wagner equation of the Choupo water record"}><HumidistatFigure /></Fig>

        {step(4)}<FaultDiagram n={4} />
        <Fig note="absolute humidity computed here from the story's two readings; the readings are the author's"><HumidityFigure /></Fig>

        {step(5)}<FaultDiagram n={5} />

        {step(6)}<FaultDiagram n={6} />
        <Fig note={NOTE_TOY + "; the noise is generated from the seed"}><AlarmFigure /></Fig>

        {step(7)}<FaultDiagram n={7} />
        <Fig note={NOTE_TOY}><TankFigure /></Fig>

        {step(8)}<FaultDiagram n={8} />
        <Fig note={NOTE_TOY + " (epsilon-NTU exchanger with assumed capacity rates)"}><HxFigure /></Fig>

        {step(9)}<FaultDiagram n={9} />
        <Fig note={NOTE_TOY + " (quadratic curves with assumed constants)"}><PumpFigure /></Fig>

        {step(10)}<FaultDiagram n={10} />
        <Fig note={NOTE_TOY}><SensorFigure /></Fig>

        {step(11)}<FaultDiagram n={11} />
        <Fig note="weighted least squares and the two tests computed here; the chi-square law from the incomplete gamma function, checked against exact cases"><ReconcileFigure /></Fig>

        {step(12)}<FaultDiagram n={12} />
        <Fig note="signals generated from the seed; the classifier is a few lines in this page"><SignatureFigure /></Fig>

        {step(13)}<FaultDiagram n={13} />
        <Fig note="the run lengths are 1/p computed here; the noise is generated from the seed"><ChartFigure /></Fig>

        <ChallengeSection />

        <LessonQuiz title="Check your understanding" questions={FAULT_DIAGNOSIS_QUIZ} lesson={FAULT_DIAGNOSIS_STEPS} />
        <LessonLimits limits={FAULT_DIAGNOSIS_LIMITS} />

        <LessonReferences tool="fault-diagnosis" />
      </Stack>
    </Box>
  );
}
