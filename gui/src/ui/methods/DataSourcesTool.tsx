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
  DataSourcesTool -- "Where to find property data" (DEV.md 4c C322).

  A NOTES page: no engine run, no slider.  The task it serves, in one
  sentence: a student who needs a datum for a project finds where to look,
  and decides whether the value may go into a public repository.  So the
  page opens on the question that picks a source, then the map, then the
  rule that decides, then a real record, then the student's own decision.

  Every fact is in dataSourcesLesson.ts, with the page and the date each
  licence was read; this file only draws.  The `<LessonReferences>` block
  and the registry entry arrive with the mount patch (docs/design/
  where-to-find-property-data.md), because the tool id does not exist until
  registry.ts carries it.
\*---------------------------------------------------------------------------*/

import { useState } from "react";

import {
  Anchor, Badge, Box, Button, Group, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import {
  BAND_TMEAN_K, BAND_U_K, DS_CHOICES, DS_CHOICE_WORD, DS_EXERCISE, DS_LIMITS,
  DS_STEPS, DS_WALK, EXAMPLE_DATASETS, EXAMPLE_RECORD, EXAMPLE_URLS, EXCLUDED,
  LICENCE_CLASSES, PICKER, RECORD_LINES, SOURCES, bandPct, roundUp2,
  type DsChoice, type LicenceClass,
} from "./dataSourcesLesson.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(DS_STEPS);

/** The name of the page this one leads to.  It does not exist yet, so it is
 *  named and not linked; the mount patch's path lists it once it lands. */
export const NEXT_PAGE_NAME = "From a database to binary parameters";

const CLASS_WORD: Record<LicenceClass, string> = {
  "public-domain": "public domain",
  open: "open licence",
  aggregator: "aggregator, no grant",
  noncommercial: "NonCommercial",
  "no-grant": "no grant",
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

function Picker(): JSX.Element {
  return (
    <PanTable>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>property</Table.Th>
          <Table.Th>system</Table.Th>
          <Table.Th>conditions</Table.Th>
          <Table.Th>look first</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {PICKER.map((r) => (
          <Table.Tr key={r.id} data-picker-row={r.id}>
            <Table.Td>{r.property}</Table.Td>
            <Table.Td>{r.system}</Table.Td>
            <Table.Td>{r.conditions}</Table.Td>
            <Table.Td>{r.lookFirst}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </PanTable>
  );
}

function SourceMap(): JSX.Element {
  return (
    <Box>
      <Title order={5}>The map of free sources</Title>
      <OriginMark of="reference"
        note="each licence as the source's own page states it, on the date shown" />
      <Stack gap="xs" mt={6}>
        {SOURCES.map((s) => (
          <Box key={s.id} px="sm" py={8} data-source={s.id}
            style={{ border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 4 }}>
            <Group gap={6}>
              <Text size="sm" fw={600}>{s.name}</Text>
              <Badge size="sm" variant="light">{CLASS_WORD[s.cls]}</Badge>
            </Group>
            <Text size="xs" mt={4}><b>Holds:</b> {s.holds}</Text>
            <Text size="xs"><b>Access:</b> {s.access}</Text>
            <Text size="xs"><b>Cite:</b> {s.cite}</Text>
            <Text size="xs"><b>Its licence:</b> {s.licence}</Text>
            <Text size="xs"><b>What Choupo's policy allows:</b> {s.allows}</Text>
            <Text size="xs" c="dimmed">Read {s.date}: {s.read}.</Text>
            <Anchor href={s.url} target="_blank" rel="noopener noreferrer"
              size="xs" style={{ overflowWrap: "anywhere" }}>
              open the source
            </Anchor>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function Excluded(): JSX.Element {
  return (
    <Box>
      <Title order={5}>What cannot go into a public project</Title>
      <PanTable>
        <Table.Tbody>
          {EXCLUDED.map((e) => (
            <Table.Tr key={e.id} data-excluded={e.id}>
              <Table.Td style={{ verticalAlign: "top" }}><b>{e.what}</b></Table.Td>
              <Table.Td>
                <Text size="xs">{e.example}</Text>
                <Text size="xs" c="dimmed">{e.why}</Text>
                {e.url && (
                  <Text size="xs" c="dimmed">
                    Read {e.date}: {e.read}.{" "}
                    <Anchor href={e.url} target="_blank" rel="noopener noreferrer"
                      size="xs">open the source</Anchor>
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

function LicenceTable(): JSX.Element {
  return (
    <Box>
      <Title order={5}>Four permissions, five classes</Title>
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>class</Table.Th>
            <Table.Th>read</Table.Th>
            <Table.Th>cite</Table.Th>
            <Table.Th>copy a value into a public record</Table.Th>
            <Table.Th>redistribute the table</Table.Th>
            <Table.Th>rule</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {LICENCE_CLASSES.map((c) => (
            <Table.Tr key={c.cls} data-licence-class={c.cls}>
              <Table.Td>
                <b>{c.name}</b>
                <Text size="xs" c="dimmed">e.g. {c.examples}</Text>
              </Table.Td>
              <Table.Td>{c.read}</Table.Td>
              <Table.Td>{c.cite}</Table.Td>
              <Table.Td>{c.copyValues}</Table.Td>
              <Table.Td>{c.redistribute}</Table.Td>
              <Table.Td><Text size="xs" ff="monospace">{c.rule}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

function Band(): JSX.Element {
  const raw = bandPct(BAND_U_K, BAND_TMEAN_K);
  return (
    <Box px="sm" py={6} style={{ borderLeft: "3px solid var(--mantine-color-default-border)" }}
      data-band="">
      <OriginMark of="page" note="the record's own rule, redone with its own two numbers" />
      <Text size="sm" mt={4}>
        The example's band: 100 × {BAND_U_K} K / {BAND_TMEAN_K} K
        = {raw.toFixed(4)} %, rounded up to two significant figures
        = <b>{roundUp2(raw).toFixed(3)} %</b>.  Its held-out deviation
        is 0.064 %, inside the band, so the verdict is <i>validated</i>.
      </Text>
    </Box>
  );
}

function RecordQuote(): JSX.Element {
  return (
    <Box>
      <Title order={5}>The record, quoted</Title>
      <OriginMark of="reference"
        note={`quoted from ${EXAMPLE_RECORD}; the line number is its line in the file`} />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>line</Table.Th>
            <Table.Th>the file says</Table.Th>
            <Table.Th>what it tells you</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {RECORD_LINES.map((r) => (
            <Table.Tr key={r.line} data-record-line={r.line}>
              <Table.Td>{r.line}</Table.Td>
              <Table.Td>
                <Text size="xs" ff="monospace" style={{ overflowWrap: "anywhere" }}>
                  {r.text}
                </Text>
              </Table.Td>
              <Table.Td>{r.means}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        Where each article file is served, as the case that regenerates the
        points declares it ({EXAMPLE_DATASETS}
        {EXAMPLE_URLS.map((u, i) => `${i === 0 ? ", lines " : " and "}${u.line}`).join("")}):{" "}
        {EXAMPLE_URLS.map((u, i) => (
          <span key={u.url}>
            {i > 0 && " and "}
            <Anchor href={u.url} target="_blank" rel="noopener noreferrer" size="xs">
              {u.url}
            </Anchor>
          </span>
        ))}.
      </Text>
    </Box>
  );
}

function Exercise(): JSX.Element {
  const [picks, setPicks] = useState<Partial<Record<string, DsChoice>>>({});
  const [shown, setShown] = useState(false);
  const all = DS_EXERCISE.every((e) => picks[e.id] !== undefined);
  return (
    <Box>
      <Title order={5}>Exercise: may it go into a public repository?</Title>
      <OriginMark of="assumption"
        note="invented situations built on the real sources of the map" />
      <Text size="sm" mt={4}>
        You need these six data for a design project whose files will be
        public.  Decide for each one, then check.
      </Text>
      <Stack gap="sm" mt="sm">
        {DS_EXERCISE.map((e) => (
          <Box key={e.id} px="sm" py={8} data-exercise-case={e.id}
            style={{ border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 4 }}>
            <Text size="sm">{e.datum}</Text>
            <SegmentedControl mt={6} size="xs"
              value={picks[e.id] ?? ""}
              onChange={(v) => { setPicks({ ...picks, [e.id]: v as DsChoice }); setShown(false); }}
              data={DS_CHOICES.map((c) => ({ value: c, label: DS_CHOICE_WORD[c] }))} />
            {shown && picks[e.id] && (
              <Text size="sm" mt={6} data-exercise-answer={e.id}
                c={picks[e.id] === e.answer ? undefined : "orange"}>
                <b>{picks[e.id] === e.answer ? "Yes" : `Not quite — ${DS_CHOICE_WORD[e.answer]}`}:</b>{" "}
                {e.why}
              </Text>
            )}
          </Box>
        ))}
      </Stack>
      <Button mt="sm" size="xs" disabled={!all} onClick={() => setShown(true)}>
        Check my answers
      </Button>
      {!all && <Text size="xs" c="dimmed" mt={4}>Decide all six first.</Text>}
      <Text size="sm" mt="md" fw={600}>Then, for a datum of your own project:</Text>
      <Box component="ol" mt={4} pl={20} data-walk="">
        {DS_WALK.map((w, i) => <li key={i}><Text size="sm">{w}</Text></li>)}
      </Box>
    </Box>
  );
}

export function DataSourcesTool(): JSX.Element {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Where to find property data</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You need a number for your project: where do you find it, and may
            it go into a public repository?
          </Text>
        </Box>

        {step(1)}
        <Picker />

        {step(2)}
        <SourceMap />
        <Excluded />

        {step(3)}
        <LicenceTable />

        {step(4)}
        {step(5)}
        {step(6)}

        {step(7)}
        <RecordQuote />
        <Band />

        <Exercise />

        <LessonLimits limits={DS_LIMITS} />

        <Text size="sm">
          Before:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("property-origins")}>
            Where do properties come from?
          </Anchor>{" "}(how an estimate is made).  Next:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("property-trust")}>
            When a property database lies to you
          </Anchor>{" "}(testing a record before you believe it), and later{" "}
          <i>{NEXT_PAGE_NAME}</i>{" "}(not yet written).
        </Text>
      </Stack>
    </Box>
  );
}

export default DataSourcesTool;
