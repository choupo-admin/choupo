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

  THE WINDOW IS THE READER'S (DEV.md 4c C91; Vítor: "the window is fixed;
  good practice is an option to show it or not and adjust it").  The 3D view
  FILLS the window: the legend is a section folded by default, and the
  tables are a BOTTOM PANEL under the view on the one panel contract
  (ui/panelContract.tsx LAYOUT_TABLES_PANEL) -- folded by default to a strip
  that says what it holds, its height dragged at the view's lower edge (or
  with the arrow keys) and remembered; inside it each table is a section
  the reader folds.  The view's own toolbar carries Full screen.  The pipe
  register is NOT docked beside the view on a wide screen: the contract has
  no right edge, and a second docking rule for one tab would be a second
  home for "where a panel goes".

  THE BUILDING IS DRAWN HERE TOO, AND HAS A VIEW OF ITS OWN (DEV.md 4c
  C100).  The plot plan draws the case's GMP building exactly as Reports
  does -- its shell as glass, the rooms, flows and indoor equipment inside,
  the Rooms / Personnel / Material / Waste toggles on the toolbar -- through
  the ONE overlay (`useBuildingOverlay`).  `&view=building` on the same
  address draws the GMP section itself (`GmpBuildingSection`: the cutaway,
  the plan per floor, the room schedule and the findings) full-window, from
  the SAME stash: the building already travels in it.  A stash with no
  building refuses that view as expired rather than drawing the plot plan
  under an address that names the building.

  Lazily loaded by AppShell, and PlantLayout3D imports three.js only when it
  first draws, so neither this route nor the main shell pulls three.js into
  the index chunk.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Group, Text, Title } from "@mantine/core";
import { IconClockExclamation } from "@tabler/icons-react";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import {
  layoutKeyOf, layoutTabStaleness, layoutTabTitle, layoutViewOf, readLayoutStash,
  stashDrawsView, type LayoutPopOutStash,
} from "../case/layoutPopOut.js";
import { layoutScene, type LayoutScene } from "../case/plantLayout.js";
import { LAYOUT_TABLES_SCENT } from "../case/layoutPanels.js";
import { PANELS } from "../state/prefs.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { useCollapsedFlag } from "./methods/methodsChrome.js";
import {
  LAYOUT_TABLES_PANEL, PanelCollapseButton, panelBoxProps, PanelReopenStrip, PanelResizeHandle,
  usePanel,
} from "./panelContract.js";
import { ExportLayoutButton } from "./ExportLayoutButton.js";
import { GmpBuildingSection, useBuildingOverlay } from "./GmpBuildingSection.js";
import { PlantLayout3D } from "./plotting/PlantLayout3D.js";
import { LayoutSectionBox, PlantLayoutLegend, PlantLayoutTables } from "./PlantLayoutTables.js";

/** The plot plan, with the building's interior drawn into it: the same
 *  overlay the Reports view uses (DEV.md 4c C100). */
function PlotPlanView({ stash, scene }: { stash: LayoutPopOutStash; scene: LayoutScene }) {
  const overlay = useBuildingOverlay(stash.building, scene);
  return <PlantLayout3D scene={overlay.shown} height="fill" extend={overlay.extend}
    toolbarExtra={overlay.toggles} />;
}

function readNow(key: string | null) {
  if (!key) return null;
  try { return readLayoutStash(window.localStorage, key); } catch { return null; }
}

export function LayoutPopOutTab() {
  const key = useMemo(
    () => (typeof window === "undefined" ? null : layoutKeyOf(window.location.search)), []);
  const view = useMemo(
    () => (typeof window === "undefined" ? "plot" : layoutViewOf(window.location.search)), []);
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
  const title = stash ? layoutTabTitle(stash, view) : null;
  useEffect(() => { if (title) document.title = title; }, [title]);
  //  The tables panel: folded by default (the registry's own default), so
  //  the view fills the window; its height is the reader's.
  const fold = useCollapsedFlag(PANELS.layoutTables.collapsedKey!,
                                PANELS.layoutTables.defaultCollapsed);
  const tables = usePanel(LAYOUT_TABLES_PANEL, { collapsedControl: fold });
  const reduceMotion = useMemo(() => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch { return false; }
  }, []);

  if (!stash || !scene) return <ExpiredTabPanel kind="layout" />;
  if (!stashDrawsView(stash, view)) return <ExpiredTabPanel kind="building" />;
  const stale = layoutTabStaleness(stash);
  const building = view === "building" ? stash.building : undefined;

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
              {building
                ? "Opened from Reports → Plant layout (3D) → GMP interior; it redraws when that case is run again."
                : stash.source === "bench"
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
              , so the {building ? "building" : "plot plan"} below is the answer to the case as it WAS.  Run the case
              again in the parent tab and this tab redraws.
            </Text>
          </Alert>
        )}
        {!building && (
          <LayoutSectionBox id="legend">
            <Box mt={4}><PlantLayoutLegend pipes={(stash.layout.pipes?.length ?? 0) > 0} /></Box>
          </LayoutSectionBox>
        )}
      </Box>
      {building ? (
        //  The GMP section itself, scrolled in the window; its cutaway is
        //  given most of the window's height.
        <Box className={stale.stale ? "choupo-stale-body" : undefined}
          style={{ flex: 1, minHeight: 0, overflow: "auto" }} px="md" pb="md" data-gmp-building-tab>
          <GmpBuildingSection building={building} scene={scene} items={stash.layout.items}
            caseName={stash.caseName}
            viewHeight={Math.max(420, Math.round(window.innerHeight * 0.62))} />
        </Box>
      ) : (
      <Box className={stale.stale ? "choupo-stale-body" : undefined}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Box style={{ flex: "1 1 auto", minHeight: 240 }}>
          <PlotPlanView stash={stash} scene={scene} />
        </Box>
        <PanelResizeHandle panel={tables} />
        {tables.collapsed
          ? <PanelReopenStrip panel={tables} scent={LAYOUT_TABLES_SCENT} />
          : (
            <Box {...panelBoxProps(tables, reduceMotion)}>
              <Box style={{ height: "100%", overflow: "auto" }} px="md" pb="md"
                data-layout-tables>
                <Group justify="space-between" align="center" pt={4}
                  style={{ position: "sticky", top: 0, zIndex: 1,
                           background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" }}>
                  <Text size="xs" c="dimmed">{LAYOUT_TABLES_SCENT}</Text>
                  <PanelCollapseButton panel={tables} />
                </Group>
                <PlantLayoutTables layout={stash.layout} sectioned />
              </Box>
            </Box>
          )}
      </Box>
      )}
    </Box>
  );
}
