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
  TrainsAndRacks -- the Reports section that answers, for a desalination hall,
  the two questions an engineer brings (DEV.md 4c C199 phase B): HOW IS THE
  PLANT ORGANISED (the train: pump, exchanger array, banks) and HOW IS A RACK
  BUILT (the plan of the hall, the section through a rack bay, the elevation of
  a rack with its headers).

  WHY A REPORTS SECTION AND NOT A TAB OF THE LAYOUT PANE.  The layout pane is
  the 3D plot plan with its tables: one object, one camera.  These are
  DRAWINGS of the plant's equipment, which Reports already holds for the
  column and the exchanger (their datasheets), they need three pickers (train,
  bank, rack) the layout pane has no place for, and they are earned by a
  FACT -- a `membraneBank` sheet exists -- exactly as the column section is.
  The 3D itself stays in the layout section, where every vessel now stands in
  its rack inside the hall.

  Nothing is computed here: `case/hallSet.ts` decides what is drawn from the
  run, this puts the strings on the page, with the notes (and their
  provenance) beside each picture because an SVG has no reflow.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Box, Group, NativeSelect, Stack, Text } from "@mantine/core";

import type { RunResult } from "../adapters/SolverAdapter.js";
import { hallSet } from "../case/hallSet.js";
import { PROVENANCE_INK, PROVENANCE_WORD } from "../case/equipmentSchematic.js";
import type { Drawing } from "../case/roHallDrawings.js";

type Note = Drawing["notes"][number];

function Notes({ notes }: { notes: readonly Note[] }) {
  return (
    <Box component="ul" fz="xs" m={0} pl="md">
      {notes.map((n, i) => (
        <li key={i} style={n.who ? { color: PROVENANCE_INK[n.who] } : undefined}>
          {n.text}{n.who ? <i> ({PROVENANCE_WORD[n.who]})</i> : null}
        </li>
      ))}
    </Box>
  );
}

function Figure({ title, svg, notes }: { title: string; svg: string; notes: readonly Note[] }) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>{title}</Text>
      <Box dangerouslySetInnerHTML={{ __html: svg }} />
      <Notes notes={notes} />
    </Stack>
  );
}

export function TrainsAndRacks({ runResult }: { runResult: RunResult }) {
  const [train, setTrain] = useState<number | undefined>(undefined);
  const [bankId, setBankId] = useState<string | undefined>(undefined);
  const [rack, setRack] = useState<number>(0);
  const set = useMemo(
    () => hallSet(runResult.designFiles, runResult.layout, runResult.building,
      { ...(train !== undefined ? { train } : {}), ...(bankId !== undefined ? { bankId } : {}), rack }),
    [runResult.designFiles, runResult.layout, runResult.building, train, bankId, rack]);
  if (!set) return <Text size="sm" c="dimmed">This run wrote no vessel-bank sheet.</Text>;

  return (
    <Stack gap="lg">
      <Group gap="md" align="flex-end">
        {set.trains.length > 1 && (
          <NativeSelect label="train" size="xs" value={String(set.pick.train)}
            data={set.trains.map((k) => ({ value: String(k), label: `train ${k}` }))}
            onChange={(e) => { setTrain(Number(e.currentTarget.value)); setBankId(undefined); setRack(0); }} />
        )}
        <NativeSelect label="bank" size="xs" value={set.pick.bankId}
          data={set.bankIds.map((b) => ({ value: b, label: b }))}
          onChange={(e) => { setBankId(e.currentTarget.value); setRack(0); }} />
        <NativeSelect label="rack" size="xs" value={String(set.pick.rack)}
          data={Array.from({ length: set.racks }, (_, r) => ({ value: String(r), label: `rack ${r + 1}` }))}
          onChange={(e) => setRack(Number(e.currentTarget.value))} />
      </Group>
      <Figure title="One train" svg={set.train.svg} notes={set.train.notes} />
      {set.plan && <Figure title="Plan of the hall" svg={set.plan.svg} notes={set.plan.notes} />}
      {set.section && <Figure title="Section through a rack bay (A-A)" svg={set.section.svg}
        notes={set.section.notes} />}
      {set.elevation && <Figure title="Elevation of one rack, with its headers" svg={set.elevation.svg}
        notes={set.elevation.notes} />}
    </Stack>
  );
}
