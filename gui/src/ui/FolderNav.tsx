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
  FolderNav -- a small folder navigator shared by "New Case" and "Open Local
  Case".  It opens at the workspace but lets you browse anywhere in your tree
  (the bridge fences reads/writes to $HOME / project / workspace).

  - useFolderNav(opened): drives the current folder (browse via the bridge).
  - <FolderRows>: renders the parent-up row + sub-folders (cases flagged).
    In "open" mode a case row is selectable/openable; in "new" mode cases are
    shown greyed (you create INSIDE the current folder, not inside a case).
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
import { Box, Group, Menu, ScrollArea, Stack, Text } from "@mantine/core";
import { IconArrowUp, IconFolder, IconFileText, IconHome, IconBox, IconFolderCog, IconCheck } from "@tabler/icons-react";

import { browse, type BrowseResult } from "../cases/workspace.js";

export function useFolderNav(opened: boolean) {
  const [cur, setCur] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const go = useCallback((dir?: string) => {
    setLoading(true); setError(null);
    browse(dir)
      .then(setCur)
      .catch((e) => { setCur(null); setError((e as Error).message); })
      .finally(() => setLoading(false));
  }, []);

  // Start at the workspace each time the dialog opens.
  useEffect(() => { if (opened) go(undefined); }, [opened, go]);

  return { cur, error, loading, go };
}

export function Breadcrumb({ cur, go, onSetWorkspace }: {
  cur: BrowseResult | null;
  go: (dir?: string) => void;
  onSetWorkspace?: (dir: string) => void;
}) {
  if (!cur) return null;
  const atWorkspace = cur.dir === cur.workspace;
  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Text size="xs" ff="monospace" c="accent.4" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        📂 {cur.dir}
      </Text>
      <Group gap={4} wrap="nowrap">
        {/* The Workspace chip is a small menu: jump to it, or make the folder
            you're browsing the new workspace. */}
        <Menu shadow="md" width={250} position="bottom-end" withArrow>
          <Menu.Target>
            <Box style={{ display: "inline-flex", cursor: "pointer" }}>
              <Jump icon={<IconBox size={13} />} label="Workspace ▾" />
            </Box>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Workspace</Menu.Label>
            <Menu.Item leftSection={<IconBox size={14} />} onClick={() => go(cur.workspace)}>
              Go to workspace
            </Menu.Item>
            <Menu.Item
              leftSection={atWorkspace ? <IconCheck size={14} /> : <IconFolderCog size={14} />}
              disabled={atWorkspace || !onSetWorkspace}
              onClick={() => onSetWorkspace?.(cur.dir)}
            >
              {atWorkspace ? "This IS the workspace" : "Set this folder as workspace"}
            </Menu.Item>
            <Menu.Label c="dimmed" fz={10} style={{ whiteSpace: "normal", lineHeight: 1.3 }}>
              {cur.workspace}
            </Menu.Label>
          </Menu.Dropdown>
        </Menu>
        <Jump icon={<IconHome size={13} />} label="Home" onClick={() => go(cur.home)} />
      </Group>
    </Group>
  );
}

function Jump({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <Group gap={3} px={6} py={2} onClick={onClick}
      style={{ cursor: "pointer", borderRadius: 4, border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
      <Box style={{ color: "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-4))" }}>{icon}</Box>
      <Text size="xs">{label}</Text>
    </Group>
  );
}

export function FolderRows({
  cur, go, mode, selectedCaseDir, onSelectCase, onOpenCase,
}: {
  cur: BrowseResult | null;
  go: (dir?: string) => void;
  mode: "new" | "open";
  selectedCaseDir?: string | null;
  onSelectCase?: (dir: string) => void;
  onOpenCase?: (dir: string) => void;
}) {
  if (!cur) return null;
  const sep = cur.dir.includes("\\") ? "\\" : "/";
  const childDir = (name: string) => `${cur.dir}${cur.dir.endsWith(sep) ? "" : sep}${name}`;

  return (
    <Box style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))", borderRadius: 4, backgroundColor: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))" }}>
      <ScrollArea.Autosize mah={340} type="auto">
        <Stack gap={0} p="xs">
          {cur.parent && (
            <Row icon={<IconArrowUp size={14} />} label=".." mono onClick={() => go(cur.parent!)} />
          )}
          {cur.entries.length === 0 && (
            <Text size="xs" c="dimmed" px={8} py={6}>(empty folder)</Text>
          )}
          {cur.entries.map((e) => {
            const dir = childDir(e.name);
            if (e.isCase) {
              const selectable = mode === "open";
              return (
                <Row key={e.name} mono
                  icon={<IconFileText size={14} />}
                  label={`${e.name}.cho`}
                  rightLabel={e.description}
                  dim={!selectable}
                  selected={selectable && selectedCaseDir === dir}
                  onClick={selectable ? () => onSelectCase?.(dir) : undefined}
                  onDoubleClick={selectable ? () => onOpenCase?.(dir) : undefined}
                />
              );
            }
            return (
              <Row key={e.name} mono
                icon={<IconFolder size={14} />}
                label={`${e.name}/`}
                onClick={() => go(dir)} />
            );
          })}
        </Stack>
      </ScrollArea.Autosize>
    </Box>
  );
}

function Row({
  icon, label, rightLabel, mono, dim, selected, onClick, onDoubleClick,
}: {
  icon: React.ReactNode;
  label: string;
  rightLabel?: string;
  mono?: boolean;
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  const interactive = !!(onClick || onDoubleClick);
  return (
    <Group gap={6} wrap="nowrap" px={8} py={4}
      onClick={onClick} onDoubleClick={onDoubleClick}
      style={{
        cursor: interactive ? "pointer" : "default",
        userSelect: "none", borderRadius: 3,
        backgroundColor: selected ? "light-dark(var(--mantine-color-accent-2), var(--mantine-color-accent-9))" : "transparent",
      }}
      onMouseEnter={(e) => { if (interactive && !selected) (e.currentTarget as HTMLElement).style.backgroundColor = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))"; }}
      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}>
      <Box style={{ color: dim ? "light-dark(var(--mantine-color-gray-5), var(--mantine-color-dark-3))" : "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-4))" }}>{icon}</Box>
      <Text size="xs" ff={mono ? "monospace" : undefined} c={dim ? "dimmed" : undefined}>{label}</Text>
      {rightLabel && (
        <Text size="xs" c="dimmed" ml="sm" lineClamp={1} style={{ flex: 1 }}>— {rightLabel}</Text>
      )}
    </Group>
  );
}
