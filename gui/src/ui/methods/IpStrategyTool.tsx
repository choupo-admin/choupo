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
  IpStrategyTool -- "Intellectual property as competitive strategy"
  (commission C140).

  NO ENGINE RUN, AND THAT IS A DECISION: nothing on this page is a process
  calculation.  The two interactives are a calendar calculator (the periods
  of step 6, each cited) and the exercise on a FICTITIOUS company, whose
  outcomes are the page's reasoning on the facts it states.  The prose, the
  exercise and the sources are in ipStrategyLesson.ts, React-free and held
  by tests/ipStrategy.test.ts.

  NOT LEGAL ADVICE, said at the top of the page and again in its limits.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Button, Group, SegmentedControl, Stack, Table,
  Text, TextInput, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  CONTRAST, DEADLINES, DECISION_QUESTIONS, EXERCISE, EXERCISE_COMPANY,
  IP_CHOICES, IP_LIMITS, IP_NOT_ADVICE, IP_QUIZ, IP_SOURCES, IP_STEPS,
  addMonths, type IpChoice,
} from "./ipStrategyLesson.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(IP_STEPS);

/** The first-filing date the calculator starts from: a fixed, fictitious
 *  date, so the page renders the same everywhere. */
export const DEFAULT_FIRST_FILING = "2026-01-15";

const CHOICE_WORD: Record<IpChoice, string> = {
  patent: "Patent", secret: "Keep secret", publish: "Publish",
};

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

function DecisionTable(): JSX.Element {
  return (
    <Box>
      <Title order={5}>The five questions, asked of step 5's two inventions</Title>
      <OriginMark of="assumption"
        note="two example inventions, answered by the page's reasoning" />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>question</Table.Th>
            <Table.Th>points to secret if</Table.Th>
            <Table.Th>points to patent if</Table.Th>
            {CONTRAST.map((c) => <Table.Th key={c.id}>{c.name}</Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {DECISION_QUESTIONS.map((d) => (
            <Table.Tr key={d.id}>
              <Table.Td>{d.q}</Table.Td>
              <Table.Td>{d.secretIf}</Table.Td>
              <Table.Td>{d.patentIf}</Table.Td>
              {CONTRAST.map((c) => <Table.Td key={c.id}>{c.answers[d.id]}</Table.Td>)}
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td colSpan={3}><b>lands on</b></Table.Td>
            {CONTRAST.map((c) => (
              <Table.Td key={c.id}><b>{c.lands === "patent" ? "PATENT" : "SECRET"}</b></Table.Td>
            ))}
          </Table.Tr>
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

function DeadlineCalculator(): JSX.Element {
  const [first, setFirst] = useState(DEFAULT_FIRST_FILING);
  const rows = useMemo(() => DEADLINES.map((d) => ({
    ...d, date: addMonths(first, d.months),
  })), [first]);
  const readable = rows.every((r) => r.date !== null);
  return (
    <Box>
      <Title order={5}>The clock, applied to a date</Title>
      <OriginMark of={["page", "reference", "assumption"]}
        note="your date plus the cited periods, added on this page" />
      <Group mt={6} align="flex-end">
        <TextInput label="Date of the first filing (YYYY-MM-DD)" size="xs"
          value={first} onChange={(e) => setFirst(e.currentTarget.value)}
          style={{ maxWidth: 260 }} />
      </Group>
      {!readable && (
        <Text size="xs" c="red" mt={4}>
          Write the date as YYYY-MM-DD, for example 2026-01-15.
        </Text>
      )}
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>event</Table.Th>
            <Table.Th>period</Table.Th>
            <Table.Th>date</Table.Th>
            <Table.Th>source</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.label}</Table.Td>
              <Table.Td>
                {r.months % 12 === 0 && r.months >= 24
                  ? `${r.months / 12} years` : `${r.months} months`}
                {r.from === "filing" ? " from that filing" : " from the first filing"}
              </Table.Td>
              <Table.Td>{r.date ?? "—"}</Table.Td>
              <Table.Td>{r.cite}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        Calendar arithmetic only: no holidays, extensions, fee periods or
        lost rights are modelled.  Never use it to keep a real deadline.
      </Text>
    </Box>
  );
}

function Exercise(): JSX.Element {
  const [picks, setPicks] = useState<Partial<Record<string, IpChoice>>>({});
  const [played, setPlayed] = useState(false);
  const all = EXERCISE.every((e) => picks[e.id] !== undefined);
  return (
    <Box>
      <Title order={5}>Exercise: three inventions, one rival who reads your filings</Title>
      <OriginMark of="assumption"
        note="a fictitious company; the outcomes are the page's reasoning on the facts stated" />
      <Text size="sm" mt={4}>{EXERCISE_COMPANY}</Text>
      <Text size="sm" mt={4}>
        Decide for each invention: patent it, keep it secret, or publish it.
        Then play one round: the rival moves, having read whatever you
        filed or published and bought whatever you sell.
      </Text>
      <Stack gap="sm" mt="sm">
        {EXERCISE.map((e) => (
          <Box key={e.id} px="sm" py={8} data-exercise-invention={e.id}
            style={{ border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 4 }}>
            <Group gap={6}>
              <Badge size="sm" variant="light">{e.kind}</Badge>
              <Text size="sm" fw={600}>{e.name}</Text>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>{e.facts}</Text>
            <SegmentedControl mt={6} size="xs"
              value={picks[e.id] ?? ""}
              onChange={(v) => { setPicks({ ...picks, [e.id]: v as IpChoice }); setPlayed(false); }}
              data={IP_CHOICES.map((c) => ({ value: c, label: CHOICE_WORD[c] }))} />
            {played && picks[e.id] && (
              <Box mt={8} data-exercise-outcome={e.id}>
                <Text size="sm"><b>Rivalis:</b> {e.outcomes[picks[e.id]!].rival}</Text>
                <Text size="sm" mt={2}><b>For you:</b> {e.outcomes[picks[e.id]!].result}</Text>
                <Text size="sm" mt={2} c="dimmed">
                  <b>One defensible answer — {CHOICE_WORD[e.defended]}:</b> {e.why}
                </Text>
              </Box>
            )}
          </Box>
        ))}
      </Stack>
      <Button mt="sm" size="xs" disabled={!all} onClick={() => setPlayed(true)}>
        Play the rival's round
      </Button>
      {!all && (
        <Text size="xs" c="dimmed" mt={4}>Choose for all three inventions first.</Text>
      )}
    </Box>
  );
}

function Sources(): JSX.Element {
  return (
    <Box>
      <Title order={5}>Sources: what was read in each, and where</Title>
      <OriginMark of="reference"
        note="every legal and historical statement on the page is checked against one of these" />
      <PanTable>
        <Table.Tbody>
          {IP_SOURCES.map((s) => (
            <Table.Tr key={s.short}>
              <Table.Td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                <b>{s.short}</b>
              </Table.Td>
              <Table.Td>
                <Text size="xs">{s.cite}</Text>
                <Text size="xs" c="dimmed">Read: {s.read}.</Text>
                {s.note && <Text size="xs" c="dimmed">Note: {s.note}.</Text>}
                <Anchor href={s.url} target="_blank" rel="noopener noreferrer"
                  size="xs" style={{ overflowWrap: "anywhere" }}>
                  open the source
                </Anchor>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        Every source was read online on 2026-10-26.  Portuguese law is cited
        in its own terms; its quotations are the page's translations.
      </Text>
    </Box>
  );
}

export function IpStrategyTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Intellectual property as competitive strategy</Title>
          <Text size="sm" c="dimmed" mt={4}>
            When to patent and when to keep a secret; how firms use patents,
            publications and secrets against each other, and how they make
            peace; where strategy becomes unlawful; and four cases worked
            through -- a process patent whose recipe does not work, a turbine
            whose blades melt, Whittle's turbojet, and the Wright and Watt
            patents -- ending with an exercise against a rival who reads
            your filings.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Not legal advice"
            data-not-legal-advice="">
            {IP_NOT_ADVICE}
          </Alert>
        </Box>

        <Title order={4}>Patent or secret</Title>
        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}
        {step(5)}
        <DecisionTable />
        {step(6)}
        <DeadlineCalculator />

        <Title order={4}>IP as a weapon, and the counter-moves</Title>
        {step(7)}
        {step(8)}
        {step(9)}
        {step(10)}
        {step(11)}
        {step(12)}
        {step(13)}
        {step(14)}

        <Title order={4}>Worked cases</Title>
        {step(15)}
        {step(16)}
        {step(17)}
        {step(18)}

        <Exercise />

        <LessonQuiz title="Check your understanding" questions={IP_QUIZ}
          lesson={IP_STEPS} />

        <LessonLimits limits={IP_LIMITS} />

        <Sources />

        <Text size="sm">
          Next:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("front-end-loading")}>
            Front-End Loading
          </Anchor>{" "}(the stages at which these decisions are taken) and{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("route-screening")}>
            Screening routes to a product
          </Anchor>{" "}(the paper filters a route must pass, legal among them).
        </Text>
      </Stack>
    </Box>
  );
}
