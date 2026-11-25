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
  types should I look at first, and why?  So the page opens on the nine types
  as pictures (each drawn for this page, dryerDrawings.tsx), asks the four
  questions of the tree in the order the owner named (feed form, heat
  sensitivity, scale, batch or continuous), and answers with one or two types
  and the sentence and the page of the book behind each.  Below it, the
  comparison table the three books support, with "not cited" where they are
  silent, and a small energy bench (page arithmetic on the cited table).  The
  types the engine models open their tutorial case in a new tab.  After the
  comparison come the habitual tables, as the books print them (dryerTables.ts):
  Mujumdar's feed-form table with its eleven columns, his ha table and his
  vendor checklist beside van 't Land's two lists, Towler's Table 10.7, and the
  drum dryer in Perry's and Mujumdar's numbers side by side.

  EVERY FACT OF THE SELECTION IS A BOOK'S AT A PAGE (dryerSelection.ts), and
  the page says which is which.  ONE SECTION RUNS THE ENGINE (C465): the
  three flow arrangements of a continuous convective dryer, whose profiles and
  outlets are the in-browser engine's own (DryerArrangements.tsx).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Anchor, Badge, Box, Button, Group, NativeSelect, NumberInput, SimpleGrid, Stack, Switch, Table, Text, Title,
} from "@mantine/core";

import { caseTabSearch, openAppTab } from "../openInTab.js";
import { DryerTestsCard } from "./DryerTestsCard.js";
import { DrawingLegend, DryerDrawing } from "./dryerDrawings.js";
import { ArrangementCards, ArrangementRuns, ArrangementUses } from "./DryerArrangements.js";
import {
  AROUND_THE_DRYER, DEFAULT_INPUTS, DRYER_IDS, DRYERS, FEED_LABEL, FIRST_SCREEN, HEAT_LABEL,
  LATENT_HEAT_KJ_PER_KG, MODE_LABEL,
  SCALE_LABEL, SIZE_LABEL, citeOf, comparisonRows, energyBills, recommend, waterEvaporated,
  type DryerId, type FeedForm, type Heat, type Inputs, type Mode, type Scale, type Size,
  type SourceId,
} from "./dryerSelection.js";
import { DRYER_SELECTION_LIMITS, DRYER_SELECTION_QUIZ, DRYER_SELECTION_STEPS } from "./dryerSelectionLesson.js";
import {
  DRUM_BOOKS, MUJ_MINIMUM_INFO, MUJ_T11_COLUMNS, MUJ_T11_ROWS, MUJ_T11_SRC, MUJ_T15_ROWS, MUJ_T15_SRC,
  MUJ_T16_ROWS, MUJ_T16_SRC, TOW_FEED_KEY, TOW_T107_ROWS, TOW_T107_SRC, VTL_T31_LEFT, VTL_T31_RIGHT,
  VTL_T32_LEFT, VTL_T32_RIGHT, VTL_T3_SRC, G_PER_M2S_TO_KG_PER_M2H, mujumdarDrumEfficiency,
  perryDrumEvapKgPerM2h,
} from "./dryerTables.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";
import { openMethodToolAt } from "./registry.js";

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
    const gap = DRYERS[id].engineGap;
    return (
      <Stack gap={2} data-engine-gap={gap ? id : undefined}>
        <Text size="xs" c="dimmed">The engine has no model of this type.</Text>
        {gap ? <Text size="xs" c="dimmed">Nearest in the engine: {gap}.</Text> : null}
      </Stack>
    );
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
          {inp.mode === "continuous" && (
            <Switch size="xs" data-quick=""
              label="A test shows the drying is over in about 10 s (surface moisture only)"
              checked={inp.quick} onChange={(e) => set({ quick: e.currentTarget.checked })} />
          )}
        </Group>
      )}
      <Group gap="md" align="flex-end" mt={6}>
        <Switch size="xs" data-flammable=""
          label="5. The dust or the solvent vapour can burn or explode"
          checked={inp.flammable} onChange={(e) => set({ flammable: e.currentTarget.checked })} />
        {inp.feed !== "solution" && (
          <Switch size="xs" data-sticky=""
            label="6. The feed is sticky or lumpy (it must be mixed back or pre-formed)"
            checked={inp.sticky} onChange={(e) => set({ sticky: e.currentTarget.checked })} />
        )}
      </Group>

      <Box mt="sm" data-dryer-result={res.rule.id}>
        <Text size="xs" c="dimmed">Rule that fired: {res.rule.label}</Text>
        {res.picks.length === 0 ? (
          <Text size="sm" fw={600} mt={4}>
            None of the nine is the plain answer.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: res.picks.length }} spacing="md" mt={6}>
            {res.picks.map((id, k) => (
              <Box key={id} data-dryer-pick={id}>
                <Badge size="sm" color={k === 0 ? "teal" : "gray"} variant="light">
                  {k === 0 ? "first" : k === 1 ? "second" : "also"}
                </Badge>
                <Text fw={600} size="sm">{DRYERS[id].label}</Text>
                <DryerDrawing id={id} label={DRYERS[id].label} />
              </Box>
            ))}
          </SimpleGrid>
        )}
        {res.outside && (
          <Text size="sm" mt={6} data-dryer-outside="">
            Outside the nine: <strong>{res.outside}</strong>.
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
          <Box data-dryer-first-screen="">
            <Text size="sm" fw={600}>{FIRST_SCREEN.text}</Text>
            <Text size="xs" c="dimmed">{citeOf(FIRST_SCREEN.src)}</Text>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

/** What stands before and after the dryer (C508): feed handling, exhaust cleaning, cooling and
 *  collecting the product.  Qualitative, each paragraph with the pages it was read at. */
function AroundCard(): JSX.Element {
  return (
    <Box data-dryer-around="" px="sm" py={8}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Title order={5}>What stands before and after the dryer</Title>
      <OriginMark of={["reference"]}
        note="what a first screen does not size, and the books say must be sized: read at the pages shown" />
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mt={6}>
        {AROUND_THE_DRYER.map((a) => (
          <Box key={a.heading} data-around-item="">
            <Text size="sm" fw={600}>{a.heading}</Text>
            <Text size="xs" mt={2}>{a.text}</Text>
            <Text size="xs" c="dimmed" mt={2}>Read in: {citeOf(a.src)}.</Text>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

function ComparisonTable(): JSX.Element {
  const rows = useMemo(comparisonRows, []);
  return (
    <Box data-dryer-comparison="">
      <OriginMark of={["reference"]}
        note="Mujumdar Tables 1.2 and 1.4; van 't Land, Perry and Towler for the cells those tables lack" />
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

const CROSS = "\u00d7";

function SourceLine({ src }: { src: readonly SourceId[] }): JSX.Element {
  return <Text size="xs" c="dimmed" mt={2}>Read in: {citeOf(src)}.</Text>;
}

/** Mujumdar Table 1.1 as printed: the twelve rows against the eleven feed columns. */
function FeedTicksTable(): JSX.Element {
  const groups: { label: string; n: number }[] = [];
  for (const c of MUJ_T11_COLUMNS) {
    const last = groups[groups.length - 1];
    if (last && last.label === c.group) last.n += 1; else groups.push({ label: c.group, n: 1 });
  }
  return (
    <Box data-table="muj-1.1">
      <Text size="sm" fw={600}>Mujumdar, Table 1.1: dryer selection versus feedstock form</Text>
      <OriginMark of={["reference"]} note="transcribed at p. 21 from an image of the page" />
      <Box style={{ overflowX: "auto" }} mt={4}>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th rowSpan={2}>Dryer</Table.Th>
              {groups.map((g) => <Table.Th key={g.label} colSpan={g.n} ta="center">{g.label}</Table.Th>)}
            </Table.Tr>
            <Table.Tr>
              {MUJ_T11_COLUMNS.map((c) => <Table.Th key={c.label}>{c.label}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {MUJ_T11_ROWS.map((r, k) => (
              <Table.Tr key={k} data-muj11-row={`${r.group}|${r.dryer}`}>
                <Table.Td>{r.dryer} <Text span size="xs" c="dimmed">({r.group.toLowerCase().replace(" dryers", "")})</Text></Table.Td>
                {MUJ_T11_COLUMNS.map((c, j) => (
                  <Table.Td key={c.label} ta="center">{r.ticks.includes(j) ? CROSS : ""}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <SourceLine src={MUJ_T11_SRC} />
    </Box>
  );
}

/** Mujumdar Table 1.5 as printed. */
function HaTable(): JSX.Element {
  return (
    <Box data-table="muj-1.5">
      <Text size="sm" fw={600}>
        Mujumdar, Table 1.5: approximate ha (kcal/(h degC m3)) and the temperature differences
      </Text>
      <OriginMark of={["reference"]}
        note="transcribed at p. 27; ha for the convection dryers, U (kcal/(h degC m2)) for the conduction dryers" />
      <Box style={{ overflowX: "auto" }} mt={4}>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th><Table.Th>ha (convection) or U (conduction)</Table.Th>
              <Table.Th>(t - t_m) log-mean (degC), or t_k - t_m for conduction</Table.Th>
              <Table.Th>Inlet hot air temperature (degC)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {MUJ_T15_ROWS.map((r) => (
              <Table.Tr key={r.type} data-ha-row={r.type}>
                <Table.Td>{r.type} <Text span size="xs" c="dimmed">({r.group.toLowerCase()})</Text></Table.Td>
                <Table.Td>{r.coefficient}</Table.Td>
                <Table.Td>{r.lines.map((l, i) => (
                  <Text key={i} size="xs">{l.flow ? `${l.flow}: ` : ""}{l.dT}</Text>))}</Table.Td>
                <Table.Td>{r.lines.map((l, i) => (
                  <Text key={i} size="xs">{l.tIn ?? "-"}</Text>))}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <SourceLine src={MUJ_T15_SRC} />
    </Box>
  );
}

function ListColumns({ left, right }: { left: readonly string[]; right: readonly string[] }): JSX.Element {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <Stack gap={0}>{left.map((t) => <Text key={t} size="xs">{"\u2022"} {t}</Text>)}</Stack>
      <Stack gap={0}>{right.map((t) => <Text key={t} size="xs">{"\u2022"} {t}</Text>)}</Stack>
    </SimpleGrid>
  );
}

/** "Before you choose": Mujumdar Table 1.6 and his minimum information, van 't Land Tables 3.1 and 3.2. */
function Checklist(): JSX.Element {
  return (
    <Box data-table="checklist" px="sm" py={8}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Title order={5}>Before you choose: what to know about the product</Title>
      <OriginMark of={["reference"]}
        note="Mujumdar Table 1.6 (p. 28) and the minimum information (pp. 27-28); van 't Land Tables 3.1 and 3.2 (p. 22)" />
      <Text size="sm" fw={600} mt={6}>Mujumdar, Table 1.6: typical checklist for the selection of industrial dryers</Text>
      <Table withTableBorder withColumnBorders fz="xs" mt={4} data-checklist-table="muj-1.6">
        <Table.Tbody>
          {MUJ_T16_ROWS.map((r) => (
            <Table.Tr key={r.factor}>
              <Table.Td w="35%">{r.items.length === 0 ? <em>{r.factor}</em> : r.factor}</Table.Td>
              <Table.Td>{r.items.map((it) => <Text key={it} size="xs">{"\u2022"} {it}</Text>)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <SourceLine src={MUJ_T16_SRC} />
      <Text size="sm" fw={600} mt={8}>Mujumdar: the minimum quantitative information to arrive at a dryer</Text>
      <Stack gap={0} mt={2} data-checklist-table="muj-minimum">
        {MUJ_MINIMUM_INFO.map((t) => <Text key={t} size="xs">{"\u2022"} {t}</Text>)}
      </Stack>
      <SourceLine src={MUJ_T16_SRC} />
      <Text size="sm" fw={600} mt={8}>van 't Land, Table 3.1: data to be assessed before attempting dryer selection</Text>
      <Box data-checklist-table="vtl-3.1" mt={2}><ListColumns left={VTL_T31_LEFT} right={VTL_T31_RIGHT} /></Box>
      <Text size="sm" fw={600} mt={8}>van 't Land, Table 3.2: some criteria for judging a dried particulate material</Text>
      <Box data-checklist-table="vtl-3.2" mt={2}><ListColumns left={VTL_T32_LEFT} right={VTL_T32_RIGHT} /></Box>
      <SourceLine src={VTL_T3_SRC} />
    </Box>
  );
}

/** Towler Table 10.7 as printed (printed p. 571). */
function TowlerTable(): JSX.Element {
  return (
    <Box data-table="tow-10.7">
      <Text size="sm" fw={600}>Towler, Table 10.7: dryer selection</Text>
      <OriginMark of={["reference"]}
        note="transcribed at p. 571 from an image of the page; feed-condition arrows read from the image" />
      <Box style={{ overflowX: "auto" }} mt={4}>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Mode</Table.Th><Table.Th>Generic type</Table.Th><Table.Th>Specific dryer types</Table.Th>
              <Table.Th>Feed condition</Table.Th><Table.Th>Jacketed</Table.Th>
              <Table.Th>Suitable for heat-sensitive materials</Table.Th><Table.Th>Suitable for vacuum service</Table.Th>
              <Table.Th>Retention or cycle time</Table.Th><Table.Th>Heat transfer method</Table.Th>
              <Table.Th>Capacity</Table.Th><Table.Th>Typical evaporation capacity</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {TOW_T107_ROWS.map((r) => (
              <Table.Tr key={r.types.join("|")} data-tow-row={r.types.join(" / ")}>
                <Table.Td>{r.mode}</Table.Td><Table.Td>{r.generic}</Table.Td>
                <Table.Td>{r.types.join(", ")}</Table.Td>
                <Table.Td>{r.feed.join(", ")}</Table.Td>
                <Table.Td>{r.jacketed}</Table.Td><Table.Td>{r.heatSensitive}</Table.Td>
                <Table.Td>{r.vacuum}</Table.Td><Table.Td>{r.retention}</Table.Td>
                <Table.Td>{r.heatTransfer}</Table.Td><Table.Td>{r.capacity}</Table.Td>
                <Table.Td>{r.evap === null ? <Cell v={null} /> : `${r.evap} ${r.evapUnit}`}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" mt={4}>Key to the feed conditions:</Text>
      {TOW_FEED_KEY.map((t, i) => <Text key={i} size="xs">{i + 1}. {t}</Text>)}
      <Text size="xs" c="dimmed" mt={2}>
        Retention times are printed as in the library copy ("6.48 h" for a range whose dash is
        printed as a point).
      </Text>
      <SourceLine src={TOW_T107_SRC} />
    </Box>
  );
}

/** The drum dryer in Perry's Table 12-46 and Mujumdar's Table 1.4 and Chapter 9: both shown. */
function DrumTwoBooks(): JSX.Element {
  const [pLo, pHi] = perryDrumEvapKgPerM2h();
  const [eLo, eHi] = mujumdarDrumEfficiency();
  const b = DRUM_BOOKS;
  return (
    <Box data-table="drum-two-books" px="sm" py={8}
      style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 }}>
      <Title order={5}>The drum dryer in two books</Title>
      <OriginMark of={["reference", "page"]}
        note="Perry Table 12-46 (p. 12-81), Mujumdar Table 1.4 (p. 26) and Chapter 9 (p. 206); the conversion factor is the page's" />
      <Table withTableBorder withColumnBorders fz="xs" mt={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Quantity</Table.Th><Table.Th>Perry, Table 12-46</Table.Th>
            <Table.Th>Mujumdar, Table 1.4 and Chapter 9</Table.Th><Table.Th>Agree?</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr data-drum-row="evap">
            <Table.Td>Specific evaporation</Table.Td>
            <Table.Td>
              Typical range {b.perry.evapRangeGPerM2s[0]}-{b.perry.evapRangeGPerM2s[1]} g/(m2 s)
              = {fx(pLo, 1)}-{fx(pHi, 1)} kg/(m2 h) (x {G_PER_M2S_TO_KG_PER_M2H}); "this estimate" {b.perry.evapEstimateGPerM2s} g/(m2 s)
            </Table.Td>
            <Table.Td>
              Table 1.4, drum dryer (for pastes): {b.mujumdar14.evapKgPerM2h[0]}-{b.mujumdar14.evapKgPerM2h[1]} kg/(m2 h);
              Chapter 9: {b.mujumdar9.evapDifficultKgPerM2h[0]}-{b.mujumdar9.evapDifficultKgPerM2h[1]} for materials
              difficult to dry, {b.mujumdar9.evapEasyKgPerM2h[0]}-{b.mujumdar9.evapEasyKgPerM2h[1]} for easy ones
            </Table.Td>
            <Table.Td><Badge size="xs" color="orange" variant="light">no: they differ</Badge></Table.Td>
          </Table.Tr>
          <Table.Tr data-drum-row="eff">
            <Table.Td>Thermal efficiency</Table.Td>
            <Table.Td>Typical range {b.perry.effRange[0]}-{b.perry.effRange[1]}; "this estimate" {b.perry.effEstimate}</Table.Td>
            <Table.Td>
              {fx(eLo, 2)}-{fx(eHi, 2)} implied by {fmtKJ(b.mujumdar14.energy[0])}-{fmtKJ(b.mujumdar14.energy[1])} kJ/kg
              and {LATENT_HEAT_KJ_PER_KG} kJ/kg (Chapter 9: {b.mujumdar9.energy[0]}-{b.mujumdar9.energy[1]} kJ/kg)
            </Table.Td>
            <Table.Td><Badge size="xs" color="teal" variant="light">yes</Badge></Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={4}>
        Perry's range lies above Mujumdar's Table 1.4 and meets his Chapter 9 figure for difficult
        materials only at its top: test the product, as both books advise.
      </Text>
      <SourceLine src={[...b.perry.src, ...b.mujumdar14.src, ...b.mujumdar9.src]} />
    </Box>
  );
}

function HabitualTables(): JSX.Element {
  return (
    <Stack gap="md" data-habitual-tables="">
      <FeedTicksTable />
      <HaTable />
      <TowlerTable />
      <DrumTwoBooks />
    </Stack>
  );
}

const fmtKJ = (v: number): string => v.toLocaleString("en-US");

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
            <Table.Td>Batch tray dryer, freeze dryer, agitated vacuum dryer</Table.Td>
            <Table.Td colSpan={2}><Cell v={null} /></Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Box>
  );
}

/** The four parts of the page, in reading order.  A part is an <h4> (the chapter menu shows it as
 *  a group); its steps are the <h5> chapters under it, numbered in the order a reader meets them.
 *  `key` is the chapter key the intro link opens (chapterSlug of the title). */
export const DRYER_PARTS = [
  { key: "choose-which-dryers-stay-in-the-race", title: "Choose: which dryers stay in the race" },
  { key: "what-to-ask-of-the-product", title: "What to ask of the product" },
  { key: "which-way-the-gas-meets-the-solid", title: "Which way the gas meets the solid" },
  { key: "what-the-sale-does-not-show", title: "What the sale does not show" },
] as const;

export function DryerSelectionTool(): JSX.Element {
  const step = lessonStepper(DRYER_SELECTION_STEPS);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Which dryer for which product</Title>
          <Text size="sm" c="dimmed" mt={4} data-dryer-parts="">
            Four parts, in the order a choice is made:{" "}
            {DRYER_PARTS.map((p, i) => (
              <span key={p.key}>
                {i > 0 ? (i === DRYER_PARTS.length - 1 ? ", and " : ", ") : ""}
                <Anchor component="a" href="#" data-part-link={p.key}
                  onClick={(e: { preventDefault: () => void }) => {
                    e.preventDefault();
                    openMethodToolAt("dryer-selection", p.key);
                  }}>{p.title.toLowerCase()}</Anchor>
              </span>
            ))}
            .  A shortlist to take to a drying test, not a design: every rule is read from
            Mujumdar's Handbook of Industrial Drying, Perry's Handbook, van 't Land's Drying in
            the Process Industry or Towler's Chemical Engineering Design, at its page.
          </Text>
        </Box>

        <Title order={4} data-section="choose">{DRYER_PARTS[0].title}</Title>
        <Text size="sm" fw={600} data-dryer-first-screen-top="">{FIRST_SCREEN.text}</Text>
        <Text size="xs" c="dimmed">{citeOf(FIRST_SCREEN.src)}</Text>
        <Tree />
        {step(1)}
        <FeedFitTable />
        {step(2)}
        {step(3)}
        <TypeCards />
        {step(4)}
        <Title order={5}>The nine side by side</Title>
        <ComparisonTable />

        <Title order={4} data-section="ask">{DRYER_PARTS[1].title}</Title>
        <Checklist />
        <DryerTestsCard />

        <Title order={4} data-section="arrangements">{DRYER_PARTS[2].title}</Title>
        <OriginMark of={["engine"]}
          note="the profiles and outlets below are the engine's own, run in your browser on three tutorial cases" />
        {step(5)}
        <ArrangementCards />
        <Box><DrawingLegend /></Box>
        {step(6)}
        {step(7)}
        <ArrangementRuns />
        {step(8)}
        <ArrangementUses />

        <Title order={4} data-section="sale">{DRYER_PARTS[3].title}</Title>
        <AroundCard />
        {step(9)}
        {step(10)}
        <EnergyBench />
        {step(11)}
        <HabitualTables />
        {step(12)}

        <LessonQuiz title="Check your understanding" questions={DRYER_SELECTION_QUIZ}
          lesson={DRYER_SELECTION_STEPS} />
        <LessonLimits limits={DRYER_SELECTION_LIMITS} title="What this does not show" />
        <LessonReferences tool="dryer-selection" />
      </Stack>
    </Box>
  );
}
