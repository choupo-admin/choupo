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
  DryerSelectionTool -- "Which dryer for which product" (DEV.md 4c C460).

  THE TASK, in one sentence: I have a wet product; which of the common dryer
  types should I look at first, and why?  So the page opens on the seven types
  as pictures (each drawn for this page, dryerDrawings.tsx), asks the four
  questions of the tree in the order the owner named (feed form, heat
  sensitivity, scale, batch or continuous), and answers with one or two types
  and the sentence and the page of the book behind each.  Below it, the
  comparison table the three books support, with "not cited" where they are
  silent, and a small energy bench (page arithmetic on the cited table).  The
  types the engine models open their tutorial case in a new tab.

  NOTHING ON THIS PAGE IS RUN BY THE ENGINE; every fact is a book's at a page
  (dryerSelection.ts), and the page says which is which.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Badge, Box, Button, Group, NativeSelect, NumberInput, SimpleGrid, Stack, Switch, Table, Text, Title,
} from "@mantine/core";

import { caseTabSearch, openAppTab } from "../openInTab.js";
import { DrawingLegend, DryerDrawing } from "./dryerDrawings.js";
import {
  DEFAULT_INPUTS, DRYER_IDS, DRYERS, FEED_LABEL, HEAT_LABEL, LATENT_HEAT_KJ_PER_KG, MODE_LABEL,
  SCALE_LABEL, SIZE_LABEL, citeOf, comparisonRows, energyBills, recommend, waterEvaporated,
  type DryerId, type FeedForm, type Heat, type Inputs, type Mode, type Scale, type Size,
} from "./dryerSelection.js";
import { DRYER_SELECTION_LIMITS, DRYER_SELECTION_QUIZ, DRYER_SELECTION_STEPS } from "./dryerSelectionLesson.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";

const fx = (v: number, d: number): string => (Number.isFinite(v) ? v.toFixed(d) : "—");
const NOT_CITED = "not cited";

function Cell({ v }: { v: string | null }): JSX.Element {
  return v === null
    ? <Text size="xs" c="dimmed" fs="italic">{NOT_CITED}</Text>
    : <Text size="xs">{v}</Text>;
}

function OpenCase({ id }: { id: DryerId }): JSX.Element {
  const e = DRYERS[id].engine;
  if (!e) {
    return <Text size="xs" c="dimmed">The engine has no model of this type.</Text>;
  }
  return (
    <Stack gap={2} data-engine-case={e.name}>
      <Button size="compact-xs" variant="light" w="fit-content"
        onClick={() => openAppTab(caseTabSearch(e.name))}>
        Open the case {e.name}
      </Button>
      <Text size="xs" c="dimmed">{e.note}.</Text>
    </Stack>
  );
}

function TypeCards(): JSX.Element {
  return (
    <Box>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {DRYER_IDS.map((id) => {
          const d = DRYERS[id];
          return (
            <Box key={id} px="sm" py={8} data-dryer-card={id}
              style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
              <Text fw={600} size="sm">{d.label}</Text>
              <DryerDrawing id={id} label={d.label} />
              <Text size="xs" mt={4}>{d.idea}</Text>
              <Text size="xs" c="dimmed" mt={4}>Read in: {citeOf(d.ideaSrc)}.</Text>
              <Box mt={6}><OpenCase id={id} /></Box>
            </Box>
          );
        })}
      </SimpleGrid>
      <Box mt="sm"><DrawingLegend /></Box>
    </Box>
  );
}

const FIT_COLOR = { yes: "teal", conditional: "yellow", no: "gray" } as const;

function FeedFitTable(): JSX.Element {
  const forms = ["solution", "paste", "granular"] as const;
  return (
    <Box data-feed-fit="">
      <OriginMark of={["reference"]}
        note="Mujumdar Table 1.1 and Perry Table 12-11, read at their pages" />
      <Table withTableBorder withColumnBorders fz="xs" mt={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            {forms.map((f) => <Table.Th key={f}>{FEED_LABEL[f]}</Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {DRYER_IDS.map((id) => (
            <Table.Tr key={id}>
              <Table.Td>{DRYERS[id].label}</Table.Td>
              {forms.map((f) => {
                const x = DRYERS[id].feed[f];
                return (
                  <Table.Td key={f}>
                    <Badge size="xs" variant="light" color={FIT_COLOR[x.fit]}>
                      {x.fit === "conditional" ? "if" : x.fit}
                    </Badge>
                    <Text size="xs" mt={2}>{x.why}.</Text>
                    <Text size="xs" c="dimmed">{citeOf(x.src)}</Text>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function Select<T extends string>({ label, value, onChange, labels }: {
  label: string; value: T; onChange: (v: T) => void; labels: Readonly<Record<T, string>>;
}): JSX.Element {
  return (
    <NativeSelect label={label} value={value} size="xs" style={{ minWidth: 230 }}
      data={(Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k] }))}
      onChange={(e) => onChange(e.currentTarget.value as T)} />
  );
}

function Tree(): JSX.Element {
  const [inp, setInp] = useState<Inputs>(DEFAULT_INPUTS);
  const set = (p: Partial<Inputs>): void => setInp({ ...inp, ...p });
  const res = useMemo(() => recommend(inp), [inp]);
  return (
    <Box data-dryer-tree="" px="sm" py={8}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Title order={5}>Ask the tree</Title>
      <OriginMark of={["assumption", "reference"]}
        note="your answers are the input; every rule is a book's, at the page shown" />
      <Group gap="md" align="flex-end" mt={6}>
        <Select<FeedForm> label="1. Feed form" value={inp.feed} labels={FEED_LABEL}
          onChange={(feed) => set({ feed })} />
        <Select<Heat> label="2. Heat sensitivity" value={inp.heat} labels={HEAT_LABEL}
          onChange={(heat) => set({ heat })} />
        <Select<Scale> label="3. Scale" value={inp.scale} labels={SCALE_LABEL}
          onChange={(scale) => set({ scale })} />
        <Select<Mode> label="4. Mode" value={inp.mode} labels={MODE_LABEL}
          onChange={(mode) => set({ mode })} />
      </Group>
      {inp.feed === "granular" && (
        <Group gap="md" align="flex-end" mt={6}>
          <Select<Size> label="Particle size" value={inp.size} labels={SIZE_LABEL}
            onChange={(size) => set({ size })} />
          <Switch size="xs" label="The particles are fragile (they break if stirred)"
            checked={inp.fragile} onChange={(e) => set({ fragile: e.currentTarget.checked })} />
        </Group>
      )}

      <Box mt="sm" data-dryer-result={res.rule.id}>
        <Text size="xs" c="dimmed">Rule that fired: {res.rule.label}</Text>
        {res.picks.length === 0 ? (
          <Text size="sm" fw={600} mt={4}>
            None of the seven is the plain answer.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: res.picks.length }} spacing="md" mt={6}>
            {res.picks.map((id, k) => (
              <Box key={id} data-dryer-pick={id}>
                <Badge size="sm" color={k === 0 ? "teal" : "gray"} variant="light">
                  {k === 0 ? "first" : "second"}
                </Badge>
                <Text fw={600} size="sm">{DRYERS[id].label}</Text>
                <DryerDrawing id={id} label={DRYERS[id].label} />
              </Box>
            ))}
          </SimpleGrid>
        )}
        {res.outside && (
          <Text size="sm" mt={6} data-dryer-outside="">
            Outside the seven: <strong>{res.outside}</strong>.
          </Text>
        )}
        <Stack gap={4} mt={6}>
          {res.reasons.map((r, i) => (
            <Box key={i}>
              <Text size="sm">{r.text}</Text>
              <Text size="xs" c="dimmed">{citeOf(r.src)}</Text>
            </Box>
          ))}
          {res.warnings.map((r, i) => (
            <Box key={`w${i}`} data-dryer-warning="">
              <Text size="sm" c="orange">{r.text}</Text>
              <Text size="xs" c="dimmed">{citeOf(r.src)}</Text>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function ComparisonTable(): JSX.Element {
  const rows = useMemo(comparisonRows, []);
  return (
    <Box data-dryer-comparison="">
      <OriginMark of={["reference"]}
        note="Mujumdar Tables 1.2 and 1.4; van 't Land and Perry for the cells those tables lack" />
      <Box style={{ overflowX: "auto" }} mt={4}>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th><Table.Th>Heat</Table.Th><Table.Th>Mode</Table.Th>
              <Table.Th>Residence time</Table.Th>
              <Table.Th>Energy, kJ per kg of water</Table.Th>
              <Table.Th>Capacity, as the book gives it</Table.Th>
              <Table.Th>Typical products</Table.Th>
              <Table.Th>Read in</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id} data-comparison-row={r.id}>
                <Table.Td>{r.label}</Table.Td>
                <Table.Td><Cell v={r.heat} /></Table.Td>
                <Table.Td><Cell v={r.mode} /></Table.Td>
                <Table.Td><Cell v={r.residence} /></Table.Td>
                <Table.Td><Cell v={r.energy} /></Table.Td>
                <Table.Td><Cell v={r.capacity} /></Table.Td>
                <Table.Td><Cell v={r.products} /></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{citeOf(r.src)}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}

function EnergyBench(): JSX.Element {
  const [ms, setMs] = useState<number | string>(1000);
  const [x0, setX0] = useState<number | string>(1.5);
  const [xf, setXf] = useState<number | string>(0.05);
  const msN = Number(ms), x0N = Number(x0), xfN = Number(xf);
  const mw = waterEvaporated(msN, x0N, xfN);
  const bills = energyBills(mw);
  return (
    <Box data-dryer-energy="" px="sm" py={8}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Title order={5}>The energy bill of a duty</Title>
      <OriginMark of={["page", "reference", "assumption"]}
        note="your three numbers are the input; the ranges are Mujumdar Table 1.4; the arithmetic is the page's" />
      <Group gap="md" mt={6}>
        <NumberInput label="Dry solid, kg/h" value={ms} onChange={setMs} min={0} w={130} size="xs" />
        <NumberInput label="Feed moisture, kg/kg dry" value={x0} onChange={setX0} min={0} step={0.1}
          decimalScale={3} w={160} size="xs" />
        <NumberInput label="Product moisture, kg/kg dry" value={xf} onChange={setXf} min={0}
          step={0.01} decimalScale={3} w={170} size="xs" />
      </Group>
      <Text size="sm" mt={6}>
        Water to evaporate: <strong>{fx(mw, 1)} kg/h</strong>.  Heat of vaporisation used:{" "}
        {LATENT_HEAT_KJ_PER_KG} kJ/kg (Perry p.12-71).
      </Text>
      <Table withTableBorder withColumnBorders fz="xs" mt={6}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Type</Table.Th><Table.Th>Heat duty, kW</Table.Th>
            <Table.Th>Share of the energy that is latent heat</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {bills.map((b) => (
            <Table.Tr key={b.id}>
              <Table.Td>{b.label}</Table.Td>
              <Table.Td>{fx(b.lowKW, 0)} to {fx(b.highKW, 0)}</Table.Td>
              <Table.Td>{fx(100 * b.effLow, 0)} % to {fx(100 * b.effHigh, 0)} %</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td>Batch tray dryer, freeze dryer</Table.Td>
            <Table.Td colSpan={2}><Cell v={null} /></Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Box>
  );
}

export function DryerSelectionTool(): JSX.Element {
  const step = lessonStepper(DRYER_SELECTION_STEPS);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Which dryer for which product</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The seven types that do most of the drying, drawn as schematics, and the rules that
            choose between them from the form of the feed, its sensitivity to heat, the scale
            and the mode, each read from Mujumdar's Handbook of Industrial Drying, Perry's
            Handbook and van 't Land's Drying in the Process Industry, at its page.  A shortlist
            to take to a drying test, not a design.
          </Text>
        </Box>

        <TypeCards />
        {step(1)}
        {step(2)}
        <FeedFitTable />
        {step(3)}
        {step(4)}
        <Tree />
        {step(5)}
        <EnergyBench />
        <Title order={5}>The seven side by side</Title>
        <ComparisonTable />
        {step(6)}
        {step(7)}

        <LessonQuiz title="Check your understanding" questions={DRYER_SELECTION_QUIZ}
          lesson={DRYER_SELECTION_STEPS} />
        <LessonLimits limits={DRYER_SELECTION_LIMITS} title="What this does not show" />
        <LessonReferences tool="dryer-selection" />
      </Stack>
    </Box>
  );
}
