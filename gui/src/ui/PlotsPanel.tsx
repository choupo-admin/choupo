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
  Plots tab.  Several views, switched by an inner SegmentedControl so the
  bottom panel does not need extra vertical space for a long tab strip.

  When the run produces a time-series trajectory (choupoBatch /
  choupoCtrl), the "Trajectory" view becomes the default --- that's
  the natural visualisation for dynamic cases.  For steady runs the
  default falls back to "Compositions".

  Each plot is full-width and stretches to the panel height.
\*---------------------------------------------------------------------------*/

import {
  ActionIcon,
  Box,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useStore } from "../state/store.js";
import { popOutCurrentPlot } from "./plotPopOut.js";
import { CompositionPlot } from "./plotting/CompositionPlot.js";
import { ConvergencePlot } from "./plotting/ConvergencePlot.js";
import { ProfilePlot } from "./plotting/ProfilePlot.js";
import { TimeScrubber } from "./plotting/TimeScrubber.js";
import { TrajectoryPlot } from "./plotting/TrajectoryPlot.js";
import { TxyPlot } from "./plotting/TxyPlot.js";

type PlotKey =
  | "scrubber"
  | "trajectory"
  | "composition"
  | "txy"
  | "profile"
  | "convergence";

export function PlotsPanel() {
  const result = useStore((s) => s.runResult);
  const [view, setView] = useState<PlotKey>("composition");

  // When a new run lands, default to the most informative view:
  //   - scrubber if the dynamic run wrote real-time instant dirs (the holdup
  //     state per time -- the richest transient view)
  //   - trajectory if it produced a time-series (dynamic case, no instant dirs)
  //   - composition otherwise
  useEffect(() => {
    if (!result) return;
    if (result.instants) setView("scrubber");
    else if (result.trajectory) setView("trajectory");
    else setView("composition");
  }, [result]);

  if (!result) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">
          No run yet — press Run to generate plots.
        </Text>
      </Stack>
    );
  }

  const activePlot = (
    <>
      {view === "scrubber" && result.instants && (
        <TimeScrubber instants={result.instants} trajectory={result.trajectory} />
      )}
      {view === "trajectory" && result.trajectory && (
        <TrajectoryPlot data={result.trajectory} />
      )}
      {view === "composition" && <CompositionPlot streams={result.streams} />}
      {view === "txy" && result.txy && <TxyPlot txy={result.txy} />}
      {view === "profile" && result.profiles && (
        <ProfilePlot profiles={result.profiles} />
      )}
      {view === "convergence" && <ConvergencePlot curves={result.convergence} />}
    </>
  );

  return (
    <Stack gap={0} h="100%">
      <Group
        justify="space-between"
        wrap="nowrap"
        px="sm"
        py={6}
        style={{ borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}
      >
        <Box style={{ flex: 1 }} />
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as PlotKey)}
          data={[
            {
              label: "Scrubber",
              value: "scrubber",
              disabled: !result.instants,
            },
            {
              label: "Trajectory",
              value: "trajectory",
              disabled: !result.trajectory,
            },
            {
              label: "Compositions",
              value: "composition",
              disabled: result.streams.length === 0,
            },
            { label: "T-x-y", value: "txy", disabled: !result.txy },
            {
              label: "Profile",
              value: "profile",
              disabled: !result.profiles || result.profiles.length === 0,
            },
            {
              label: "Convergence",
              value: "convergence",
              disabled: result.convergence.length === 0,
            },
          ]}
        />
        <Box style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <Tooltip
            label="Open this plot as a high-resolution PNG in a separate browser tab — easy to download or paste into the report"
            withArrow position="left" multiline w={280}
          >
            <ActionIcon size="sm" variant="subtle" color="cyan"
              onClick={() => { void popOutCurrentPlot(`${view}`); }}>
              <IconExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Box>
      </Group>
      <div style={{ flex: 1, minHeight: 0 }}>
        {activePlot}
      </div>
    </Stack>
  );
}
