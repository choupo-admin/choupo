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
  PathBar -- the PEDAGOGICAL PATH control (DEV.md 4c C221).

  One compact row ABOVE the tool chooser: a Select of the paths in
  METHOD_PATHS (the one home, registry.ts) and, once one is chosen, its steps
  as a numbered strip with the current step marked, Previous / Next, and the
  sentence saying what the current step adds.  It is NOT a panel and NOT a menu
  level: the same tools, in a reading order, driven through the existing
  `setActiveMethodTool` so the address and the chooser follow.  The path is in
  the address as `&path=<id>` (a link carries it).

  The control reads nothing but the registry; the pointer decides target size
  only (methodsChrome's coarse rule) and the strip wraps instead of scrolling
  sideways at phone width.
\*---------------------------------------------------------------------------*/

import { ActionIcon, Box, Button, Group, Select, Text } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCoarsePointer } from "./methodsChrome.js";
import {
  METHOD_PATHS, METHOD_TOOLS, pathById, setActiveMethodTool, setActivePath,
  useActiveMethodTool, useActivePath,
} from "./registry.js";

export function PathBar(): JSX.Element {
  const coarse = useCoarsePointer();
  const tool = useActiveMethodTool();
  const pathId = useActivePath();
  const path = pathById(pathId);
  const idx = path ? path.steps.findIndex((s) => s.tool === tool) : -1;
  const labelOf = (id: string): string =>
    METHOD_TOOLS.find((m) => m.id === id)?.label ?? id;
  const go = (i: number): void => {
    const s = path?.steps[i];
    if (s) setActiveMethodTool(s.tool);
  };
  const size = coarse ? "sm" : "xs";
  return (
    <Box data-method-paths style={{
      flexShrink: 0, display: "flex", flexWrap: "wrap", alignItems: "center",
      gap: "4px 8px", padding: "4px 12px", minWidth: 0,
      borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
    }}>
      <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
        Path
      </Text>
      <Select
        size={size}
        aria-label="choose a pedagogical path through the EduTools"
        placeholder="None: pick a path to walk"
        data={METHOD_PATHS.map((p) => ({ value: p.id, label: p.title }))}
        value={pathId}
        onChange={(v) => setActivePath(v)}
        clearable
        comboboxProps={{ withinPortal: true }}
        style={{ flex: "0 1 220px", minWidth: 0 }}
      />
      {path && (
        <>
          <ActionIcon size={coarse ? "lg" : "md"} variant="default"
            aria-label="previous step" disabled={idx <= 0}
            onClick={() => go(idx - 1)}>
            <IconChevronLeft size={14} />
          </ActionIcon>
          <Group gap={4} wrap="wrap" role="list" aria-label={`${path.title} steps`}>
            {path.steps.map((s, i) => (
              <Button key={s.tool} role="listitem" size={size}
                variant={i === idx ? "filled" : "light"}
                px={coarse ? 12 : 8} aria-current={i === idx ? "step" : undefined}
                title={labelOf(s.tool)}
                onClick={() => go(i)}>
                {i + 1}
              </Button>
            ))}
          </Group>
          <ActionIcon size={coarse ? "lg" : "md"} variant="default"
            aria-label="next step" disabled={idx >= path.steps.length - 1}
            onClick={() => go(idx + 1)}>
            <IconChevronRight size={14} />
          </ActionIcon>
          <Text size="xs" c="dimmed" style={{ flexBasis: "100%", minWidth: 0 }}>
            {idx >= 0
              ? `Step ${idx + 1} of ${path.steps.length}, ${labelOf(path.steps[idx]!.tool)}: ${path.steps[idx]!.why}`
              : `${path.intro} This page is not one of its ${path.steps.length} steps; Next starts the path.`}
          </Text>
        </>
      )}
    </Box>
  );
}
