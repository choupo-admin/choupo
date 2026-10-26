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
  StepTab -- ONE STEP OF A PROPERTIES CASE, IN ITS OWN TAB (DEV.md 4c C172
  slice 3b; Vitor: "um double click na caixa fazia abrir um tab com tudo
  detalhado!").  The workflow's counterpart of a unit's internals page.

  Everything about the step, on one page: on the left its RESULTS -- the
  figures it feeds, what a fit found (the parameters as symbols with units),
  each run's numbers with their units, its own panel, what ran run by run
  (ReviewScreen's StepResults) -- and on the right what the selection card
  says of it: what it reads (FIT / HELD OUT, the band), the model with its
  options, what it writes with its fingerprints, the verdict with its
  identifiability (ui/workflowCard.tsx).  Nothing new is computed.

  The tab booted the store from the parent's stash (ui/stepTab.ts,
  state/store.ts bootCase); with the stash gone it refuses by name.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo } from "react";
import { Badge, Box, Button, Group, ScrollArea, Text } from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";

import { useStore } from "../state/store.js";
import { stepOfOp } from "../case/workflowSteps.js";
import { RUN_STATE_WORD } from "../case/reviewScreen.js";
import { STATE_GLYPH, stepState } from "../case/workflowDiagram.js";
import { ExpiredTabPanel } from "./ExpiredTabPanel.js";
import { StepResults, VerdictStrip } from "./ReviewScreen.js";
import { usePropsPanels } from "./PropsView.js";
import { useWorkflowModel } from "./useWorkflowModel.js";
import { WorkflowSelection } from "./workflowCard.js";
import { stepIdInSearch } from "./stepTab.js";

export function StepTab() {
  const tutorialName = useStore((s) => s.tutorialName);
  const runResult = useStore((s) => s.runResult) ?? undefined;
  const model = useWorkflowModel(runResult);
  const stepId = useMemo(() => (typeof window === "undefined" ? "" : stepIdInSearch(window.location.search)), []);
  const found = stepOfOp(model.outline, stepId.replace(/^op:/, ""));
  const panels = usePropsPanels(model.result);
  const { select } = model;
  //  the card's half reads the selection: this tab's subject
  useEffect(() => { if (stepId) select(stepId); }, [stepId, select]);
  useEffect(() => {
    if (found) document.title = `${found.step.number} ${found.step.ops[0]} · ${tutorialName.split("/").pop()}`;
  }, [found, tutorialName]);

  if (!tutorialName) return <ExpiredTabPanel kind="step" />;
  if (!found)
    return (
      <Box p="xl"><Text size="sm">This case ({tutorialName}) has no step {stepId}: its propsDict may have changed
        since the tab was opened.  Open the step again from the Workflow.</Text></Box>
    );
  const { study, step } = found;
  const state = stepState(model.rows, step.ops);
  const guide = model.map.nodes.find((n) => n.id === `op:${step.ops[0]}`)?.member.target;
  const strip = (rs: typeof model.rows) => <VerdictStrip rows={rs} ran={model.ran} />;
  return (
    <Box data-step-tab={step.id} style={{ height: "var(--choupo-vh)", display: "flex", flexDirection: "column",
      background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" }}>
      <Group px="md" py={8} gap="md" wrap="wrap" align="center"
        style={{ flex: "0 0 auto", borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
        <Text component="h1" size="lg" fw={700} m={0}>
          Step {step.number}{" "}
          <Text span ff="monospace" fw={700}>{step.ops.length > 1 ? `${step.ops[0]} … ${step.ops[step.ops.length - 1]}` : step.ops[0]}</Text>
        </Text>
        <Badge color="accent" variant="light" style={{ textTransform: "none" }}>{step.type}</Badge>
        {step.ops.length > 1 && <Badge color="gray" variant="light" style={{ textTransform: "none" }}>{step.ops.length} runs</Badge>}
        <Text size="sm" data-step-state={state}>{STATE_GLYPH[state]} {RUN_STATE_WORD[state]}</Text>
        {study.declared && <Text size="sm" c="dimmed" truncate style={{ maxWidth: 420 }} title={study.title}>study {study.letter}: {study.title.replace(/^[A-Z]\s+--\s+/, "")}</Text>}
        <Text size="sm" c="dimmed" ff="monospace">{tutorialName}</Text>
        {guide && guide.kind === "guide" && (
          <Button size="compact-sm" variant="light" leftSection={<IconHelp size={14} />}
            onClick={() => model.activate(guide)}>Theory</Button>
        )}
      </Group>
      <Box style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <ScrollArea style={{ flex: 1, minWidth: 0 }} type="auto">
          <Box px="md" py="sm" style={{ maxWidth: 1400 }} data-step-tab-results="">
            <StepResults study={study} step={step} map={model.map} result={model.result} propsDict={model.propsDict}
              rows={model.rows} strip={strip} linkOf={() => undefined} opLinkOf={() => undefined}
              onSelect={() => {}} onActivate={model.activate} opPanel={panels.opPanel} />
          </Box>
        </ScrollArea>
        <Box style={{ flex: "0 0 360px", minHeight: 0, borderLeft: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))" }}>
          <ScrollArea h="100%" type="auto">
            <Box p="md" data-step-tab-card=""><WorkflowSelection model={model} /></Box>
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  );
}
