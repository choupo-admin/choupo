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
  WorkflowHome -- A PROPERTIES CASE'S HOME (DEV.md 4c C172 slice 3b): the
  OUTLINE on the left (the case's ONE navigation, collapsible: C168 ruling
  (a), the panel contract's left rail and its `[`), and the WORKFLOW DIAGRAM
  filling the rest, as the flowsheet fills a process case's window.  The two
  share one selection (the store's, per case): a step clicked in either is
  the step the other shows and the card describes.
\*---------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { Box, Button, Group, Text } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";

import { WorkflowOutline } from "./WorkflowOutline.js";
import { WorkflowDiagram } from "./WorkflowDiagram.js";
import {
  PanelCollapseButton, PanelReopenStrip, PanelResizeHandle, WORKFLOW_OUTLINE_PANEL,
  panelBoxProps, usePanel, usePanelShortcut,
} from "./panelContract.js";
import { useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import type { WorkflowModel } from "./useWorkflowModel.js";

export function WorkflowHome({ model }: { model: WorkflowModel }) {
  const narrow = useMediaQuery("(max-width: 900px)") ?? false;
  const [outlineOpen, setOutlineOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const host = useMeasuredBoxWidth<HTMLDivElement>();
  const panel = usePanel(WORKFLOW_OUTLINE_PANEL, { availablePx: host.width });
  usePanelShortcut(panel);
  const box = panelBoxProps(panel, !!reduceMotion);
  //  the drawing re-fits on a window resize; folding or dragging the outline
  //  changes its width without one, so say so once the width has settled
  useEffect(() => {
    const id = window.setTimeout(() => window.dispatchEvent(new Event("resize")), reduceMotion ? 0 : 260);
    return () => window.clearTimeout(id);
  }, [panel.collapsed, panel.size, reduceMotion]);

  const outline = (
    <WorkflowOutline outline={model.outline} rows={model.rows} selected={model.selected} tree={model.tree}
      onSelect={(id) => { model.select(id); setOutlineOpen(false); }} />
  );

  if (narrow) {
    return (
      <Box data-review="screen" data-workflow-home="" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <Group px="md" py={4} gap={4} wrap="nowrap" style={{ flex: "0 0 auto" }}>
          <Button size="compact-sm" variant="default" aria-expanded={outlineOpen} onClick={() => setOutlineOpen(!outlineOpen)}>
            {outlineOpen ? "Hide the outline" : "Outline"}
          </Button>
        </Group>
        {outlineOpen && (
          <Box mx="md" mb={6} style={{ height: 320, flex: "0 0 auto", border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            borderRadius: 6 }}>{outline}</Box>
        )}
        <Box style={{ flex: 1, minHeight: 0, position: "relative" }}><WorkflowDiagram model={model} /></Box>
      </Box>
    );
  }
  return (
    <Box data-review="screen" data-workflow-home="" ref={host.ref}
      style={{ position: "absolute", inset: 0, display: "flex", minWidth: 0 }}>
      {panel.collapsed && <PanelReopenStrip panel={panel} scent="OUTLINE" />}
      <Box data-workflow-outline-pane="" data-panel={box["data-panel"]}
        style={{ ...box.style, minHeight: 0, display: "flex", flexDirection: "column",
          borderRight: panel.collapsed ? "none"
            : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))" }}>
        <Group justify="space-between" wrap="nowrap" gap={4} px={6} pt={4} style={{ flex: "0 0 auto" }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>Outline</Text>
          <PanelCollapseButton panel={panel} />
        </Group>
        <Box style={{ flex: 1, minHeight: 0 }}>{outline}</Box>
      </Box>
      <PanelResizeHandle panel={panel} />
      <Box style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative" }}>
        <WorkflowDiagram model={model} />
      </Box>
    </Box>
  );
}
