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
  LayoutPopOutTab -- the `?layout=<key>` tab: the plot plan the engine
  published, full-window (DEV.md 4c C78).

  A thin wrapper, on the InternalsView / ExploreMccabeTab precedent: read the
  stash the parent wrote (case/layoutPopOut.ts), title the tab with the case
  and the run's fingerprint, and draw the SAME scene (`layoutScene` +
  `PlantLayout3D`) and the SAME tables (`PlantLayoutTables`) the Reports
  section draws -- nothing is mapped or measured twice.  No stash, or one
  that would draw nothing: the honest expired panel, never another surface.

  It follows its parent: the browser's `storage` event fires in this tab when
  the parent rewrites the stash, and the tab re-reads it.  A STALE run dims
  the drawn body exactly as the parent's result workspaces dim
  (`choupo-stale-body`), and the sentence saying so sits OUTSIDE the dimmed
  box, so the reason is readable while the numbers are not inviting.

  Lazily loaded by AppShell, and PlantLayout3D imports three.js only when it
  first draws, so neither this route nor the main shell pulls three.js into
  the index chunk.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Group, Text, Title } from "@mantine/core";
import { IconClockExclamation } from "@tabler/icons-react";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import {
  layoutKeyOf, layoutTabStaleness, layoutTabTitle, readLayoutStash,
} from "../case/layoutPopOut.js";
import { layoutScene } from "../case/plantLayout.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { ExportLayoutButton } from "./ExportLayoutButton.js";
import { PlantLayout3D } from "./plotting/PlantLayout3D.js";
import { PlantLayoutLegend, PlantLayoutTables } from "./PlantLayoutTables.js";

function readNow(key: string | null) {
  if (!key) return null;
  try { return readLayoutStash(window.localStorage, key); } catch { return null; }
}

export function LayoutPopOutTab() {
  const key = useMemo(
    () => (typeof window === "undefined" ? null : layoutKeyOf(window.location.search)), []);
  const [stash, setStash] = useState(() => readNow(key));

  //  Follow the parent: it rewrites this key when its run or its declared
  //  case moves.  `e.key === null` is a storage clear -- re-read, which then
  //  finds nothing and refuses as expired.
  useEffect(() => {
    if (!key) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) setStash(readNow(key));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  //  The scene is keyed on the BLOCK's text, not on the stash object: a
  //  rewrite that only moves what is declared (the parent's edits) parses a
  //  new but equal block, and rebuilding the three.js scene for it would
  //  throw away the reader's camera on every keystroke in the parent.
  const layoutText = stash ? JSON.stringify(stash.layout) : "";
  const scene = useMemo(
    () => (layoutText ? layoutScene(JSON.parse(layoutText) as PlantLayout) : null),
    [layoutText]);
  const title = stash ? layoutTabTitle(stash) : null;
  useEffect(() => { if (title) document.title = title; }, [title]);

  if (!stash || !scene) return <ExpiredTabPanel kind="layout" />;
  const stale = layoutTabStaleness(stash);

  return (
    <Box
      style={{
        height: "var(--choupo-vh)",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
      }}
    >
      <Box px="md" pt="sm" pb={4} style={{ flex: "0 0 auto" }}>
        <Group justify="space-between" align="baseline" wrap="wrap" gap="xs">
          <Title order={5}>{title}</Title>
          <Group gap="xs" align="baseline" wrap="wrap">
            <Text size="xs" c="dimmed">
              {stash.source === "bench"
                ? "Opened from the EduTools plant-layout bench; it redraws when the bench re-runs."
                : "Opened from Reports → Plant layout (3D); it redraws when that case is run again."}
            </Text>
            {/* Export as page (DEV.md 4c C81): the stash this tab draws, saved
                as one self-contained file; disabled while the run is stale. */}
            <ExportLayoutButton layout={stash.layout} stale={stale} getStash={() => stash} />
          </Group>
        </Group>
        {stale.stale && (
          <Alert color="yellow" variant="light" mt={6} py={6}
            icon={<IconClockExclamation size={16} />}>
            <Text size="xs">
              The case has moved since this run
              {stale.pendingEdits > 0
                ? ` (${stale.pendingEdits} edit${stale.pendingEdits === 1 ? "" : "s"} pending)`
                : ""}
              , so the plot plan below is the answer to the case as it WAS.  Run the case
              again in the parent tab and this tab redraws.
            </Text>
          </Alert>
        )}
        <Box mt={6}><PlantLayoutLegend pipes={(stash.layout.pipes?.length ?? 0) > 0} /></Box>
      </Box>
      <Box className={stale.stale ? "choupo-stale-body" : undefined}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Box style={{ flex: "1 1 62%", minHeight: 240 }}>
          <PlantLayout3D scene={scene} height="fill" />
        </Box>
        <Box px="md" pb="md" style={{ flex: "1 1 38%", minHeight: 0, overflow: "auto" }}>
          <PlantLayoutTables layout={stash.layout} />
        </Box>
      </Box>
    </Box>
  );
}
