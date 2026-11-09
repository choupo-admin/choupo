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
  PathBar -- the GUIDED SEQUENCE bar (DEV.md 4c C221, renamed C251).

  Drawn only while a guided sequence is being walked (it is started from the
  EduTools home; see EduToolsHome).  One compact row ABOVE the tool: the
  sequence's title and "step k of n", Previous / Next, "Leave the sequence"
  (which returns to the home), and the sentence saying what the current step
  adds as a full line beneath.  It is NOT a panel and NOT a menu level: the
  same tools, in a reading order, driven through the existing
  `setActiveMethodTool` so the address and the chooser follow.  The sequence
  is in the address as `&path=<id>` (an address, kept as is: a link carries
  it).

  The word "Path" is not shown to the student (the credo's vocabulary table):
  the registry ids (`path`, METHOD_PATHS) are addresses and stay.

  The control reads nothing but the registry; the pointer decides target size
  only (methodsChrome's coarse rule) and the row wraps instead of scrolling
  sideways at phone width.
\*---------------------------------------------------------------------------*/

import { Box, Button, Text } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCoarsePointer } from "./methodsChrome.js";
import {
  METHOD_TOOLS, goToEduToolsHome, pathById, setActiveMethodTool,
  useActiveMethodTool, useActivePath,
} from "./registry.js";

export function PathBar(): JSX.Element | null {
  const coarse = useCoarsePointer();
  const tool = useActiveMethodTool();
  const pathId = useActivePath();
  const path = pathById(pathId);
  if (!path || !tool) return null;
  const idx = path.steps.findIndex((s) => s.tool === tool);
  const labelOf = (id: string): string =>
    METHOD_TOOLS.find((m) => m.id === id)?.label ?? id;
  const go = (i: number): void => {
    const s = path.steps[i];
    if (s) setActiveMethodTool(s.tool);
  };
  const size = coarse ? "sm" : "xs";
  return (
    <Box data-method-paths style={{
      flexShrink: 0, display: "flex", flexWrap: "wrap", alignItems: "center",
      gap: "4px 8px", padding: "4px 12px", minWidth: 0,
      borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
    }}>
      <Text size="xs" fw={600} data-sequence-status=""
        style={{ minWidth: 0, flex: "1 1 auto" }}>
        {idx >= 0
          ? `Guided sequence: ${path.title} · step ${idx + 1} of ${path.steps.length}`
          : `Guided sequence: ${path.title} · this page is not one of its ${path.steps.length} steps`}
      </Text>
      <Button size={size} variant="default" disabled={idx <= 0}
        leftSection={<IconChevronLeft size={14} />}
        onClick={() => go(idx - 1)}>
        Previous
      </Button>
      <Button size={size} variant="filled"
        disabled={idx >= path.steps.length - 1}
        rightSection={<IconChevronRight size={14} />}
        onClick={() => go(idx < 0 ? 0 : idx + 1)}>
        Next
      </Button>
      <Button size={size} variant="subtle" color="gray" onClick={goToEduToolsHome}>
        Leave the sequence
      </Button>
      <Text size="xs" c="dimmed" data-sequence-why=""
        style={{ flexBasis: "100%", minWidth: 0 }}>
        {idx >= 0
          ? `${labelOf(path.steps[idx]!.tool)}: ${path.steps[idx]!.why}`
          : `${path.intro} Next starts the sequence.`}
      </Text>
    </Box>
  );
}
