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
  CaseSwitcher -- the case name in the top bar, as a quick-switch among VARIANTS.

  For a local case it is a dropdown listing the sibling cases (the other case
  folders in the same parent -- where variants are kept together): pick one to
  switch, or "Duplicate case as..." to make a new variant.  For a bundled
  tutorial or a clipboard case it is just the static name.
\*---------------------------------------------------------------------------*/

import { useState } from "react";
import { Group, Menu, Text } from "@mantine/core";
import { IconChevronDown, IconCheck, IconCopy, IconFileText } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import { useStore } from "../state/store.js";
import { readCaseAt, siblingCases } from "../cases/workspace.js";
import { localCaseDir, caseDisplayName } from "../case/caseName.js";
import { DuplicateCaseModal } from "./DuplicateCaseModal.js";

export function CaseSwitcher() {
  const tutorialName = useStore((s) => s.tutorialName);
  const loadLocalCase = useStore((s) => s.loadLocalCase);
  const dir = localCaseDir(tutorialName);
  const name = caseDisplayName(tutorialName);

  const [opened, setOpened] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [siblings, setSiblings] = useState<{ name: string; dir: string; description: string }[] | null>(null);

  // Blank boot: no case open.
  if (!tutorialName) {
    return <Text size="xs" ff="monospace" c="dimmed">No case open</Text>;
  }

  // A non-local case (tutorial / clipboard) has no sibling folders -> static.
  if (!dir) {
    return <Text size="xs" ff="monospace" c="dimmed">{name}</Text>;
  }

  const refresh = () => {
    setSiblings(null);
    siblingCases(dir).then(setSiblings).catch(() => setSiblings([]));
  };

  const switchTo = (target: string) => {
    if (target === dir) return;
    readCaseAt(target)
      .then(({ caseFiles }) => loadLocalCase(target, caseFiles))
      .catch((e) => notifications.show({ title: "Could not switch case", message: (e as Error).message, color: "red" }));
  };

  return (
    <>
      <Menu shadow="md" width={280} position="bottom-start" opened={opened}
        onChange={(o) => { setOpened(o); if (o) refresh(); }}>
        <Menu.Target>
          <Group gap={3} wrap="nowrap" style={{ cursor: "pointer" }} title="Switch variant / duplicate">
            <Text size="xs" ff="monospace" c="dimmed">{name}</Text>
            <IconChevronDown size={12} color="light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-2))" />
          </Group>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Variants in this folder</Menu.Label>
          {siblings === null && <Menu.Item disabled>listing…</Menu.Item>}
          {siblings !== null && siblings.length === 0 && <Menu.Item disabled>(none)</Menu.Item>}
          {siblings?.map((s) => {
            const isCurrent = s.dir === dir;
            return (
              <Menu.Item key={s.dir}
                leftSection={isCurrent ? <IconCheck size={14} /> : <IconFileText size={14} />}
                onClick={() => switchTo(s.dir)}
                style={{ fontWeight: isCurrent ? 600 : 400 }}>
                <Group justify="space-between" gap={6} wrap="nowrap">
                  <Text size="sm" ff="monospace">{s.name}</Text>
                  {s.description && <Text size="xs" c="dimmed" lineClamp={1} maw={120}>{s.description}</Text>}
                </Group>
              </Menu.Item>
            );
          })}
          <Menu.Divider />
          <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => setDupOpen(true)}>
            Duplicate case as…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <DuplicateCaseModal opened={dupOpen} onClose={() => setDupOpen(false)} />
    </>
  );
}
