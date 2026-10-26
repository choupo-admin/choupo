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
  PropsTree -- THE CASE TREE OF A PROPS CASE, the pipeline browser
  (DEV.md 4c C151).

  Vitor, 2026-10-25: "nao ha nenhuma tree para nos guiarmos?  Fica tudo ao
  molho?  E baralhas termodinamica, cinetica quimica, transporte em
  membranas?"  ONE tree of the case (case/propsMap.ts `caseTree`): Data,
  Models, Operations by discipline -- the shelf is each op TYPE's own
  declaration in its schema -- each op with its views as children, the
  records produced, and the reader's own plots.  A node's id is the
  calculation map's member id, so a selection here is a selection there.

  DEV.md 4c C172 slice 3: in the WORKFLOW this tree is EMBEDDED under the
  outline of studies and steps (ui/WorkflowOutline.tsx) -- the steps are the
  operations, so the tree it is handed carries none -- and its top-level
  folders start folded so the steps stay on the first screen.  Its tags are
  words in 11 px text, not 9 px badges (the credo's legibility ruling, C168).
\*---------------------------------------------------------------------------*/

import { useState, type ReactNode } from "react";
import { ActionIcon, Box, Group, ScrollArea, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconPlus, IconX } from "@tabler/icons-react";

import type { CaseTreeNode } from "../case/propsMap.js";

export const ACTIVITY_COLOUR: Record<string, string> = {
  evaluate: "blue", scan: "indigo", fit: "grape", estimate: "orange", compare: "teal", curate: "yellow",
};

function tagColour(t: string): string {
  const first = t.split(" · ")[0] ?? "";
  return ACTIVITY_COLOUR[first] ?? (t.includes("validated") && !t.includes("not") ? "teal" : "gray");
}

/** Folders open by default when small: a case of three ops opens flat, a
 *  type of twenty-two folds until asked. */
const OPEN_BY_DEFAULT = 8;

export function PropsTree({ tree, selected, onSelect, onNewPlot, onRemovePlot, embedded, foldTopLevel }: {
  tree: CaseTreeNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNewPlot?: () => void;
  onRemovePlot?: (id: string) => void;
  /** drawn inside another pane's scroll (the Workflow outline): no scroll
   *  area and no Overview entry of its own */
  embedded?: boolean;
  /** the top-level folders start folded */
  foldTopLevel?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (n: CaseTreeNode, depth: number) =>
    open[n.id] ?? (depth === 0 ? !foldTopLevel : n.children.length <= OPEN_BY_DEFAULT);

  const render = (n: CaseTreeNode, depth: number): ReactNode => {
    const hasKids = n.children.length > 0;
    const opened = hasKids && isOpen(n, depth);
    const isSel = selected === n.id;
    return (
      <Box key={n.id}>
        <Group gap={2} wrap="nowrap" style={{
          paddingLeft: 2 + depth * 12, borderRadius: 3,
          background: isSel ? "light-dark(var(--mantine-color-yellow-1), rgba(250,204,21,0.18))" : undefined,
        }}>
          <Box style={{ width: 14, flex: "0 0 14px", cursor: hasKids ? "pointer" : undefined }}
            onClick={() => hasKids && setOpen((o) => ({ ...o, [n.id]: !opened }))}>
            {hasKids && (opened ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />)}
          </Box>
          <UnstyledButton data-tree-node={n.id} onClick={() => onSelect(n.id)}
            title={n.detail ? `${n.label} -- ${n.detail}` : n.label}
            style={{ display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 6, padding: "2px 4px" }}>
            <Text size="xs" truncate style={{ flex: 1, minWidth: 0 }}
              ff={n.folder && depth === 0 ? undefined : "monospace"}
              fw={n.folder ? 700 : 400} tt={depth === 0 ? "uppercase" : undefined}
              c={depth === 0 ? "dimmed" : undefined}>
              {n.label}
            </Text>
            {n.tag && (
              <Text span size="11px" c={`${tagColour(n.tag)}.8`} style={{ flex: "0 0 auto" }}>
                {n.tag}
              </Text>
            )}
          </UnstyledButton>
          {n.id === "folder:myplots" && onNewPlot && (
            <Tooltip label="New plot: draw any CSV the run wrote" withArrow>
              <ActionIcon size={18} variant="subtle" aria-label="new plot" onClick={onNewPlot}>
                <IconPlus size={13} />
              </ActionIcon>
            </Tooltip>
          )}
          {n.id.startsWith("myplot:") && onRemovePlot && (
            <ActionIcon size={16} variant="subtle" color="gray" aria-label="remove plot"
              onClick={() => onRemovePlot(n.id)}>
              <IconX size={11} />
            </ActionIcon>
          )}
        </Group>
        {opened && n.children.map((c) => render(c, depth + 1))}
        {n.id === "folder:myplots" && n.children.length === 0 && (
          <Text size="11px" c="dimmed" pl={30} pb={2}>none yet -- + draws a CSV the run wrote</Text>
        )}
      </Box>
    );
  };

  if (embedded)
    return <Box data-review="tree">{tree.map((n) => render(n, 0))}</Box>;
  return (
    <ScrollArea h="100%" type="auto" data-review="tree">
      <Box p={6}>
        <UnstyledButton onClick={() => onSelect("")} data-tree-node="root"
          style={{ display: "block", width: "100%", padding: "2px 6px", borderRadius: 3, marginBottom: 4,
            background: !selected ? "light-dark(var(--mantine-color-yellow-1), rgba(250,204,21,0.18))" : undefined }}>
          <Text size="xs" fw={700}>Overview</Text>
          <Text size="11px" c="dimmed">what the run did, every figure</Text>
        </UnstyledButton>
        {tree.map((n) => render(n, 0))}
      </Box>
    </ScrollArea>
  );
}
