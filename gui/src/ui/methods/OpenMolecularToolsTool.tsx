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
  OpenMolecularToolsTool -- "From molecules to properties: the open tools".

  A NOTES page, modelled on DataSourcesTool (where to find property data): no
  engine run, no slider.  The task it serves, in one sentence: a student who
  knows only process simulation leaves knowing which open program answers
  which question about a molecule or a mixture, how to run a first example in
  a browser without installing anything, and one thesis idea per tool.  So the
  page opens on the question, then the chain from a structure to a Choupo
  record, then one card per program grouped by the question it answers.

  Every fact is in openMolecularToolsLesson.ts, with the document each
  licence was read from; this file only draws.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Anchor, Badge, Box, Code, Group, SegmentedControl, Stack, Text, Title,
} from "@mantine/core";

import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import {
  OT_CARDS, OT_CHAIN, OT_GROUPS, OT_LIMITS, OT_QUIZ, OT_STEPS,
  type OtCard, type OtGroup,
} from "./openMolecularToolsLesson.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(OT_STEPS);

function Questions(): JSX.Element {
  return (
    <Box>
      <Title order={5}>Which question do you have?</Title>
      <Stack gap={6} mt={6}>
        {OT_GROUPS.map((g) => (
          <Box key={g.id} px="sm" py={8} data-ot-group={g.id}
            style={{ border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 4 }}>
            <Text size="sm" fw={600}>{g.question}</Text>
            <Text size="xs" c="dimmed">{g.answer}</Text>
            <Text size="xs" mt={2}>
              Cards: {OT_CARDS.filter((c) => c.group === g.id).map((c) => c.name).join(", ")}
            </Text>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function Chain(): JSX.Element {
  return (
    <Box data-ot-chain="">
      <Group gap={6} align="stretch" wrap="wrap">
        {OT_CHAIN.map((c, i) => (
          <Group key={c.id} gap={6} wrap="nowrap" align="stretch">
            <Box px="sm" py={6} data-ot-chain-box={c.id}
              style={{ border: "1px solid var(--mantine-color-default-border)",
                borderRadius: 4, minWidth: 130 }}>
              <Text size="xs" fw={600}>{c.tool}</Text>
              <Text size="xs" c="dimmed">{c.hands}</Text>
            </Box>
            {i < OT_CHAIN.length - 1 && <Text size="lg" c="dimmed" style={{ alignSelf: "center" }}>→</Text>}
          </Group>
        ))}
      </Group>
    </Box>
  );
}

function CodeBlock({ card }: { card: OtCard }): JSX.Element {
  const c = card.code;
  return (
    <Box data-ot-code={card.id}>
      <Group gap={6}>
        <Text size="xs" fw={600}>Install</Text>
        <Code>{c.install}</Code>
        <Badge size="xs" variant="light" color={c.status === "ran" ? "teal" : "orange"}>
          {c.status === "ran" ? "ran 2026-11-22" : "not run"}
        </Badge>
      </Group>
      {c.lines.length > 0 && (
        <Box component="pre" mt={4} px="sm" py={6} data-pan-x=""
          style={{ overflowX: "auto", fontSize: 12, margin: 0,
            border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
          {c.lines.join("\n")}
        </Box>
      )}
      <Text size="xs" c="dimmed" mt={4}>{c.evidence}</Text>
    </Box>
  );
}

function Card({ card }: { card: OtCard }): JSX.Element {
  return (
    <Box px="sm" py={10} data-ot-card={card.id}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Group gap={6}>
        <Text size="sm" fw={700}>{card.name}</Text>
        <Badge size="sm" variant="light">{card.licence}</Badge>
      </Group>
      <Text size="xs" mt={4}><b>Computes:</b> {card.computes}</Text>
      <Text size="xs" mt={2}><b>Licence, as read:</b> {card.licenceHow}.</Text>
      <Text size="xs" mt={2}>
        <b>Official page:</b>{" "}
        <Anchor href={card.url} target="_blank" rel="noopener noreferrer" size="xs"
          style={{ overflowWrap: "anywhere" }}>{card.url}</Anchor>
      </Text>
      <Text size="xs" mt={2}><b>Try it with no installation:</b> {card.noInstall}</Text>
      <Box mt={6}><CodeBlock card={card} /></Box>
      <Text size="xs" mt={6}><b>Where it meets Choupo:</b> {card.meets}</Text>
      <Box mt={6} px="sm" py={4}
        style={{ borderLeft: "3px solid var(--mantine-color-default-border)" }}
        data-ot-thesis={card.id}>
        <Text size="xs"><b>Thesis idea:</b> {card.thesis}</Text>
      </Box>
    </Box>
  );
}

function Cards(): JSX.Element {
  const [group, setGroup] = useState<OtGroup | "all">("all");
  const shown = useMemo(
    () => OT_CARDS.filter((c) => group === "all" || c.group === group), [group]);
  return (
    <Box>
      <Title order={5}>The cards</Title>
      <OriginMark of="reference"
        note="each licence and description as the project's own file or site states it, on 2026-11-22; each example marked ran or not run" />
      <Box data-pan-x="" style={{ overflowX: "auto" }} mt={6}>
        <SegmentedControl size="xs" value={group}
          onChange={(v) => setGroup(v as OtGroup | "all")}
          data={[{ value: "all", label: "all" },
            ...OT_GROUPS.map((g) => ({ value: g.id, label: g.id }))]} />
      </Box>
      <Stack gap="sm" mt="sm">
        {shown.map((c) => <Card key={c.id} card={c} />)}
      </Stack>
    </Box>
  );
}

export function OpenMolecularToolsTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>From molecules to properties: the open tools</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Which open program answers which question about a molecule or a
            mixture, how to run a first example in a browser, and where each
            one meets Choupo, so you can find a thesis topic.
          </Text>
        </Box>

        {step(1)}
        <Questions />

        {step(2)}
        <Chain />

        {step(3)}
        {step(4)}
        <Cards />

        {step(5)}

        <LessonQuiz title="Check your understanding" questions={OT_QUIZ} lesson={OT_STEPS} />

        <LessonLimits limits={OT_LIMITS} />

        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("property-data-sources")}>
            Where to find property data
          </Anchor>{" "}(measured data and what its licence allows),{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("cosmo-sac-theory")}>
            COSMO-SAC, derived
          </Anchor>{" "}(what the charge surface becomes) and{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("property-origins")}>
            Where do properties come from?
          </Anchor>.
        </Text>

        <LessonReferences tool="open-molecular-tools" />
      </Stack>
    </Box>
  );
}

export default OpenMolecularToolsTool;
