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
  EduToolsHome -- what the EduTools workspace shows when no tool is open
  (DEV.md 4c C251).

  It used to open straight on one tool (McCabe-Thiele), and its guided-sequence
  bar was unexplained.  The home answers the student's first question in order:
  what is an EduTool, where do I start (the guided sequences, each with the
  reason for every step), and what else is on the shelves.  It reads the
  registry only (METHOD_PATHS, METHOD_DISCIPLINES, METHOD_TOOLS) and is not a
  panel or a menu: it is the body of the workspace until a tool is chosen.
\*---------------------------------------------------------------------------*/

import { Box, Button, Card, Group, SimpleGrid, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { openEduToolsFind } from "./EduToolsFind.js";
import { useCoarsePointer } from "./methodsChrome.js";
import {
  METHOD_DISCIPLINES, METHOD_PATHS, METHOD_TOOLS, openToolFromHome,
  startGuidedSequence,
} from "./registry.js";

const labelOf = (id: string): string =>
  METHOD_TOOLS.find((m) => m.id === id)?.label ?? id;

export function EduToolsHome(): JSX.Element {
  const coarse = useCoarsePointer();
  return (
    <Box data-method-home="" style={{ flex: 1, minHeight: 0, minWidth: 0,
      overflowY: "auto", padding: "12px 16px 24px" }}>
      <Stack gap="lg" maw={1200} mx="auto">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Box style={{ flex: "1 1 320px", minWidth: 0 }}>
            <Text fw={600} size="lg">EduTools</Text>
            <Text size="sm" c="dimmed">
              An EduTool is a method built in front of the student, step by
              step, and run on the same engine as the cases.  Start with a
              guided sequence, or pick any tool from the shelves below.
            </Text>
          </Box>
          <Button variant="default" size={coarse ? "sm" : "xs"}
            leftSection={<IconSearch size={14} />} onClick={openEduToolsFind}
            aria-label="find in EduTools: every tool and chapter">
            Find
          </Button>
        </Group>

        <Box component="section" data-method-home-sequences="">
          <Text fw={600} mb={6}>Guided sequences</Text>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {METHOD_PATHS.map((p) => (
              <Card key={p.id} withBorder padding="md" data-method-sequence={p.id}>
                <Stack gap="xs" h="100%" justify="space-between">
                  <Box>
                    <Text fw={600}>{p.title}</Text>
                    <Text size="sm" c="dimmed" mb="xs">{p.intro}</Text>
                    <Box component="ol" m={0} pl={20} style={{ fontSize: 13 }}>
                      {p.steps.map((s) => (
                        <li key={s.tool} style={{ marginBottom: 4 }}>
                          <Text span fw={600} size="sm">{labelOf(s.tool)}</Text>
                          <Text span size="xs" c="dimmed">: {s.why}</Text>
                        </li>
                      ))}
                    </Box>
                  </Box>
                  <Button size={coarse ? "sm" : "xs"} onClick={() => startGuidedSequence(p.id)}>
                    Start
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Box>

        <Box component="section" data-method-home-shelves="">
          <Text fw={600} mb={6}>All tools, by discipline</Text>
          <Stack gap="md">
            {METHOD_DISCIPLINES.map((d) => {
              const tools = METHOD_TOOLS.filter((m) => m.discipline === d && m.status === "live");
              if (tools.length === 0) return null;
              return (
                <Box key={d} data-method-shelf={d}>
                  <Text size="sm" fw={600} c="dimmed" mb={4}>{d}</Text>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
                    {tools.map((m) => (
                      <UnstyledButton key={m.id} data-method-home-tool={m.id}
                        onClick={() => openToolFromHome(m.id)}
                        style={{ padding: coarse ? "10px 12px" : "6px 10px",
                          borderRadius: 4, textAlign: "left", minWidth: 0,
                          border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
                        <Text size="sm" fw={600}>{m.label}</Text>
                        <Text size="xs" c="dimmed">{m.blurb}</Text>
                      </UnstyledButton>
                    ))}
                  </SimpleGrid>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
