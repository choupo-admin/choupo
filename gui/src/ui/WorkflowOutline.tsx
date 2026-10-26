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
  WorkflowOutline -- THE LEFT PANE OF THE WORKFLOW: THE CASE'S STUDIES AND
  THEIR NUMBERED STEPS (DEV.md 4c C172 slice 3; docs/design/one-app-two-
  homes.md item 3).

  The ONE navigation of a properties case (the credo's ruling (a), C168: a
  left pane is allowed when it is the case's one primary navigation): the
  overview, then each study with its steps in the order the run takes them
  (case/workflowSteps.ts), each step with what the run said of it in a WORD
  and a glyph, never in colour alone -- then, folded, the case's data,
  models and records, the same tree the calculation map's ids select
  (PropsTree, embedded).  A list, never a canvas: nothing here edits the
  case.  Text is never drawn below 12 px here (the credo's legibility
  ruling, C168 (c)); badges are 11 px.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";
import { Box, Group, ScrollArea, Text, UnstyledButton } from "@mantine/core";

import type { CaseTreeNode } from "../case/propsMap.js";
import { purposeWords } from "../case/propsStudies.js";
import { RUN_STATE_WORD, type RunState, type VerdictRow } from "../case/reviewScreen.js";
import { stepLabel, type WorkflowStudy } from "../case/workflowSteps.js";
import { PropsTree } from "./PropsTree.js";

const SELECTED_BG = "light-dark(var(--mantine-color-yellow-1), rgba(250,204,21,0.18))";

/** The state of a step, as a glyph AND a word (no meaning in colour alone). */
const STATE_GLYPH: Record<RunState, string> = { done: "✓", failed: "✗", noResult: "!", notRun: "" };

/** A step's state over its runs: failed if any failed, no result if any
 *  published none, done when all ran. */
export function stepState(rows: readonly VerdictRow[], ops: readonly string[]): RunState {
  const mine = rows.filter((r) => ops.includes(r.name));
  if (mine.length === 0 || mine.every((r) => r.runState === "notRun")) return "notRun";
  if (mine.some((r) => r.runState === "failed")) return "failed";
  if (mine.some((r) => r.runState === "noResult")) return "noResult";
  return "done";
}

function Row({ id, selected, onSelect, indent, children, title, attrs }: {
  id: string; selected: string; onSelect: (id: string) => void; indent: number;
  children: ReactNode; title?: string; attrs?: Record<string, string>;
}) {
  return (
    <UnstyledButton onClick={() => onSelect(id)} title={title} aria-current={selected === id ? "true" : undefined}
      {...attrs}
      style={{ display: "block", width: "100%", padding: `3px 6px 3px ${6 + indent}px`, borderRadius: 3,
        background: selected === id ? SELECTED_BG : undefined }}>
      {children}
    </UnstyledButton>
  );
}

export function WorkflowOutline({ outline, rows, selected, onSelect, tree, onNewPlot, onRemovePlot }: {
  outline: WorkflowStudy[];
  rows: VerdictRow[];
  selected: string;
  onSelect: (id: string) => void;
  /** the case's data, models and records (the map's tree, without its
   *  operations: the steps above ARE the operations) */
  tree: CaseTreeNode[];
  onNewPlot?: () => void;
  onRemovePlot?: (id: string) => void;
}) {
  return (
    <ScrollArea h="100%" type="auto" data-workflow-outline="">
      <Box p={6} component="nav" aria-label="Workflow outline">
        <Row id="" selected={selected} onSelect={onSelect} indent={0} attrs={{ "data-tree-node": "root" }}>
          <Text size="sm" fw={700}>Overview</Text>
          <Text size="xs" c="dimmed">the whole workflow: what it asks, what it found</Text>
        </Row>
        {outline.map((st) => (
          <Box key={st.id} mt={8} data-outline-study={st.name}>
            {st.declared || outline.length > 1 ? (
              <Row id={st.id} selected={selected} onSelect={onSelect} indent={0}
                title={st.summary || st.title}>
                <Group gap={6} wrap="nowrap" align="flex-start">
                  {st.letter && <Text size="sm" fw={700} ff="monospace" style={{ flex: "0 0 auto" }}>{st.letter}</Text>}
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={700} lineClamp={2}>{st.title.replace(/^[A-Z]\s+--\s+/, "")}</Text>
                    {st.purpose && <Text size="xs" c="dimmed" lineClamp={1}>{purposeWords(st.purpose).label}</Text>}
                  </Box>
                </Group>
              </Row>
            ) : (
              <Text size="xs" c="dimmed" tt="uppercase" fw={700} px={6} style={{ letterSpacing: 0.5 }}>
                Steps, in the order the run takes them
              </Text>
            )}
            {st.steps.map((s) => {
              const state = stepState(rows, s.ops);
              const verdicts = [...new Set(rows.filter((r) => s.ops.includes(r.name) && r.verdict).map((r) => r.verdict))];
              return (
                <Row key={s.id} id={s.id} selected={selected} onSelect={onSelect} indent={st.letter ? 14 : 4}
                  attrs={{ "data-step": s.id, "data-step-number": s.number }}
                  title={`Step ${s.number}: ${s.ops.join(", ")} (${s.type}) -- operations[${s.position}] in system/propsDict`}>
                  <Group gap={6} wrap="nowrap" align="baseline">
                    <Text size="sm" fw={700} ff="monospace" style={{ flex: "0 0 auto", minWidth: 28 }}>{s.number}</Text>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" ff="monospace" truncate>{stepLabel(s)}</Text>
                      <Text size="xs" c="dimmed" truncate>
                        {s.type}{s.ops.length > 1 ? ` · ${s.ops.length} runs` : ""}
                        {state !== "notRun" ? ` · ${STATE_GLYPH[state]} ${RUN_STATE_WORD[state]}` : ""}
                        {verdicts.length ? ` · ${verdicts.join(", ")}` : ""}
                      </Text>
                    </Box>
                  </Group>
                </Row>
              );
            })}
          </Box>
        ))}
        <Box mt="md" pt={6} style={{ borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))" }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} px={6} mb={2} style={{ letterSpacing: 0.5 }}>
            What the steps read and write
          </Text>
          <PropsTree tree={tree} selected={selected || null} onSelect={onSelect} embedded foldTopLevel
            onNewPlot={onNewPlot} onRemovePlot={onRemovePlot} />
        </Box>
      </Box>
    </ScrollArea>
  );
}
