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
  Pinch workspace: DRAWS what the engine's `pinchPass` published for the run --
  the composite and grand composite curves and the candidate matches
  (PinchCompositeTool, "Current run"), and the classical GRID DIAGRAM built
  from reports/pinch/population.csv + candidateMatches.csv (streams as lanes,
  the pinch as a vertical line) with a Pareto filter that omits minor streams
  from the drawing -- announced, never silent, numbers unchanged.
  Nothing is computed here (DEV.md 4c C230): this file used to run its own
  Problem Table in the browser, a second home of the engine's pass.  A case
  with no `pinchPass` in its postDict gets the sentence saying what to declare.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Box, Group, NumberInput, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";

import { useStore } from "../state/store.js";
import { pinchFromEngine, PINCH_PASS_EXCERPT } from "../case/pinch.js";
import { PinchGridPlot } from "./plotting/PinchGridPlot.js";
import { pinchUnits, pinchStatusLine } from "../case/pinchUnits.js";
import { PinchCompositeTool } from "./methods/PinchCompositeTool.js";
import { parseExcludedDuties, partialAnalysisHeadline } from "../case/pinchWording.js";

export function PinchView() {
  const runResult = useStore((s) => s.runResult);
  const paretoPct = useStore((s) => s.displayPrefs.pinchParetoPct);
  const setPrefs = useStore((s) => s.setDisplayPrefs);
  const dispPrefs = useStore((s) => s.displayPrefs);
  const [view, setView] = useState<"curves" | "grid">("curves");

  const pinch = useMemo(() => pinchFromEngine(runResult), [runResult]);

  if (!pinch) {
    return (
      <Box p="xl">
        <Text c="dimmed" maw={640}>
          This run carries no pinch analysis.  The pinch is computed by the engine, not by
          the browser: declare the pass in the case&apos;s <code>system/postDict</code>
          {" "}(<code>{PINCH_PASS_EXCERPT}</code>) and run the flowsheet again.
        </Text>
      </Box>
    );
  }

  //  C304 A: a partial population is the FIRST line of the tab, above both
  //  views, never only a chip beside the targets.
  const partialHead = partialAnalysisHeadline(runResult?.kpis?.["pinch"],
    parseExcludedDuties(runResult?.csvFiles?.["reports/pinch/population.csv"]),
    pinchUnits(dispPrefs));

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }} p="sm">
      {partialHead && (
        <Alert color="red" variant="light" p="xs" data-partial-analysis>
          <Text size="sm" fw={600}>{partialHead}</Text>
        </Alert>
      )}
      <Group justify="space-between" align="center">
        <SegmentedControl size="xs" value={view}
          onChange={(v) => setView(v as "curves" | "grid")}
          data={[{ label: "Curves", value: "curves" }, { label: "Grid", value: "grid" }]} />
        {view === "grid" && (
          <Group gap={6} align="center">
            <Tooltip label="minor streams below this % of process duty are omitted from the grid drawing only — targets always count every stream" multiline w={230} withArrow>
              <Text size="xs" c="dimmed" style={{ cursor: "help" }}>cutoff</Text>
            </Tooltip>
            <NumberInput value={paretoPct}
              onChange={(v) => setPrefs({ pinchParetoPct: typeof v === "number" ? Math.max(0, Math.min(50, v)) : 5 })}
              min={0} max={50} step={1} w={80} size="xs" suffix=" %" />
          </Group>
        )}
      </Group>
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {view === "grid" ? <PinchGridPlot pinch={pinch} paretoPct={paretoPct} />
                          : <PinchCompositeTool fixedSource="current" />}
      </Box>
      <Text size="xs" c="dimmed">
        {pinchStatusLine(pinch, pinchUnits(dispPrefs))}
      </Text>
    </Stack>
  );
}
