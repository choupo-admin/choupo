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
  OpenTutorialModal --- the "File / Open Case..." dialog.

  Single-folder navigator (Finder column view, one column at a time):

      Breadcrumb : tutorials / steady / Membranes (NF / RO)
      ───────────────────────────────────────────────────────
      ↑..                                   (only when not at root)
      📄 membrane01_RO_NaCl_seawater.cho  — Canonical seawater RO...
      📄 membrane02_NF_sugar.cho          — Loose NF on glucose...
      ...

  Three navigation levels:
    * root        -> the category folders (steady / batch / ...).
    * a category  -> its SUB-CLASS folders (Flash, Distillation, Reactors,
                     Membranes, ...) when the category is sub-classed; else a
                     flat list of cases (ctrl / plant: too few to sub-class).
    * a sub-class -> the cases in that sub-class.
  Sub-classes are a GUI-only grouping derived from the leaf name; they move no
  files and change no identifier (see cases/tutorials.ts).

  Interaction model (settled with Vítor 2026-05-19, sub-classes 2026-06-03):
    * Click a folder row to ENTER it; click `..` to go up one level.
    * Click a.cho leaf to select it; double-click opens immediately.
    * The footer shows the selection's description; [Open] activates when a
      case is selected.  Enter opens; Esc closes.

  Browse-local-folder was deliberately removed (2026-05-19): the GUI is a
  runner, not an editor; cases are authored as dicts on disk.
\*---------------------------------------------------------------------------*/

import {
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconArrowUp,
  IconFile,
  IconFolder,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import {
  TUTORIALS,
  TUTORIALS_BY_CATEGORY,
  subclassGroupsFor,
  type Category,
  type SubclassGroup,
  type TutorialEntry,
} from "../cases/tutorials.js";

// Note (2026-05-19): all bundled cases are LOADABLE into the GUI canvas --- the
// dict files are bundled by Vite and the AST parser works on any of them.
// RUNNING is a separate concern; `unsupportedReason` tells the TopBar the WASM
// solver cannot execute a particular case.  The modal treats every visible case
// as openable.

// Where we are in the tree.  cat "" is the tutorials/ root; sub null is the
// category level (sub-class folders, or a flat case list); sub set is inside a
// sub-class (its cases).
type Cwd = { cat: Category | ""; sub: string | null };

export interface OpenTutorialModalProps {
  opened: boolean;
  onClose: () => void;
  currentName: string;
  onSelect: (name: string) => void;
}

export function OpenTutorialModal(props: OpenTutorialModalProps) {
  const { opened, onClose, currentName, onSelect } = props;

  // Land on the open case's category AND sub-class, so re-opening the dialog
  // shows where you already are.
  const initialCwd: Cwd = useMemo(() => {
    const entry = TUTORIALS.find((e) => e.name === currentName);
    if (entry) return { cat: entry.category, sub: entry.subclass || null };
    for (const g of TUTORIALS_BY_CATEGORY) {
      if (currentName.startsWith(`${g.category}/`)) return { cat: g.category, sub: null };
    }
    return { cat: "", sub: null };
  }, [currentName]);

  const [cwd, setCwd] = useState<Cwd>(initialCwd);
  const [selected, setSelected] = useState<string | null>(currentName);

  // Reset when the modal re-opens.
  useEffect(() => {
    if (opened) {
      setCwd(initialCwd);
      setSelected(currentName);
    }
  }, [opened, initialCwd, currentName]);

  const breadcrumb =
    cwd.cat === ""
      ? "tutorials/"
    : cwd.sub
        ? `tutorials / ${cwd.cat} / ${cwd.sub}/`
      : `tutorials / ${cwd.cat}/`;

  const selectedEntry: TutorialEntry | undefined = useMemo(
    () => (selected ? TUTORIALS.find((e) => e.name === selected) : undefined),
    [selected],
  );

  const canOpen =
    !!selectedEntry && cwd.cat !== "" && selectedEntry.category === cwd.cat;

  const openSelected = () => {
    if (canOpen && selectedEntry) {
      onSelect(selectedEntry.name);
      onClose();
    }
  };

  // The rows for the current view.
  const groups = cwd.cat !== "" && cwd.sub === null ? subclassGroupsFor(cwd.cat) : null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={700} size="sm" ff="monospace">
          Open Case
        </Text>
      }
      size="lg"
      centered
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          openSelected();
        }
      }}
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Browse the bundled tutorials. Click a folder to enter, or
          click <code>..</code> to go up. Each case is a folder; the
          <code>.cho</code> file inside is the entry point.
        </Text>

        {/* Breadcrumb */}
        <Text size="xs" ff="monospace" c="accent" px={4}>
          📂 {breadcrumb}
        </Text>

        <Box
          style={{
            border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            borderRadius: 4,
            backgroundColor: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
          }}
        >
          <ScrollArea.Autosize mah={420} type="auto">
            <Stack gap={0} p="xs">
              {/* `..` up one level */}
              {cwd.cat !== "" && (
                <NavRow
                  label={
                    cwd.sub
                      ? `.. (up to ${cwd.cat}/)`
                    : ".. (up to tutorials/)"
                  }
                  icon={<IconArrowUp size={14} />}
                  onClick={() => {
                    setCwd(cwd.sub ? { cat: cwd.cat, sub: null } : { cat: "", sub: null });
                    setSelected(null);
                  }}
                />
              )}

              {cwd.cat === ""
                ? renderRoot(setCwd)
              : groups
                  ? renderSubclasses(cwd.cat, groups, setCwd)
                : renderCases(currentCases(cwd), selected, setSelected, openSelected)}
            </Stack>
          </ScrollArea.Autosize>
        </Box>

        {/* Footer */}
        <Group justify="space-between" align="flex-end">
          <Box maw={420}>
            {selectedEntry ? (
              <>
                <Text size="xs" c="dimmed" ff="monospace">
                  {selectedEntry.name}
                </Text>
                {selectedEntry.description && (
                  <Text size="sm" c="var(--mantine-color-text)" mt={2}>
                    {selectedEntry.description}
                  </Text>
                )}
              </>
            ) : (
              <Text size="xs" c="dimmed">
                {cwd.cat === ""
                  ? "Click a folder to enter it."
                : groups
                    ? "Click a sub-class to see its cases."
                  : "Select a case to see its description."}
              </Text>
            )}
          </Box>
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={openSelected}
              disabled={!canOpen}
              styles={{
                root: {
                  backgroundColor: canOpen
                    ? "var(--mantine-color-accent-6)"
                  : undefined,
                },
              }}
            >
              Open
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------- view helpers ----------------------------------------------

/** The cases to show when in a flat category (no sub-classes) or a sub-class. */
function currentCases(cwd: Cwd): TutorialEntry[] {
  const cat = TUTORIALS_BY_CATEGORY.find((g) => g.category === cwd.cat);
  if (!cat) return [];
  return cwd.sub ? cat.entries.filter((e) => e.subclass === cwd.sub) : cat.entries;
}

function renderRoot(setCwd: (c: Cwd) => void): React.ReactNode {
  return TUTORIALS_BY_CATEGORY.map((group) => {
    const allUnsupported =
      group.entries.length > 0
      && group.entries.every((e) => !!e.unsupportedReason);
    const subtitle = allUnsupported
      ? `${group.entries.length} cases  ·  view only`
    : `${group.entries.length} case${group.entries.length === 1 ? "" : "s"}`;
    return (
      <NavRow
        key={group.category}
        label={`${group.category}/`}
        icon={<IconFolder size={14} />}
        rightLabel={subtitle}
        onClick={() => setCwd({ cat: group.category, sub: null })}
      />
    );
  });
}

function renderSubclasses(
  cat: Category,
  groups: SubclassGroup[],
  setCwd: (c: Cwd) => void,
): React.ReactNode {
  return groups.map((g) => {
    const n = g.entries.length;
    const allUnsupported = g.entries.every((e) => !!e.unsupportedReason);
    const right = allUnsupported
      ? `${n} cases  ·  view only`
    : `${n} case${n === 1 ? "" : "s"}`;
    return (
      <NavRow
        key={g.slug}
        label={g.label}
        icon={<IconFolder size={14} />}
        rightLabel={right}
        onClick={() => setCwd({ cat, sub: g.slug })}
      />
    );
  });
}

function renderCases(
  entries: TutorialEntry[],
  selected: string | null,
  setSelected: (s: string | null) => void,
  openSelected: () => void,
): React.ReactNode {
  return entries.map((t) => (
    <CaseRow
      key={t.name}
      entry={t}
      selected={selected === t.name}
      onSelect={() => setSelected(t.name)}
      onDoubleSelect={() => {
        setSelected(t.name);
        openSelected();
      }}
    />
  ));
}

// ---------- row components --------------------------------------------

function NavRow(props: {
  label: string;
  icon: React.ReactNode;
  rightLabel?: string;
  onClick: () => void;
}) {
  const { label, icon, rightLabel, onClick } = props;
  return (
    <Group
      gap={6}
      wrap="nowrap"
      px={8}
      py={4}
      onClick={onClick}
      style={{
        cursor: "pointer",
        userSelect: "none",
        borderRadius: 3,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
      }}
    >
      <Box style={{ color: "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-4))" }}>{icon}</Box>
      <Text size="xs" ff="monospace">
        {label}
      </Text>
      {rightLabel && (
        <Text size="xs" c="dimmed" ml="auto" pr={4}>
          {rightLabel}
        </Text>
      )}
    </Group>
  );
}

function CaseRow(props: {
  entry: TutorialEntry;
  selected: boolean;
  onSelect: () => void;
  onDoubleSelect: () => void;
}) {
  const { entry, selected, onSelect, onDoubleSelect } = props;
  const nativeOnly = !!entry.unsupportedReason;
  const marker = `${entry.shortName}.cho`;
  // `nativeOnly` means the WASM solver cannot RUN the case, but the GUI can
  // still load and display it.  We do not grey the row out --- clicking works
  // --- but a small yellow "view only" tag warns that Run will report a
  // binary/MEMFS mismatch.
  return (
    <Group
      gap={6}
      wrap="nowrap"
      px={8}
      py={4}
      onClick={onSelect}
      onDoubleClick={onDoubleSelect}
      style={{
        cursor: "pointer",
        userSelect: "none",
        borderRadius: 3,
        backgroundColor: selected
          ? "light-dark(var(--mantine-color-accent-2), var(--mantine-color-accent-9))"
        : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.backgroundColor =
            "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
      }}
    >
      <Box style={{ color: "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-2))" }}>
        <IconFile size={14} />
      </Box>
      <Text size="xs" ff="monospace">
        {marker}
      </Text>
      {entry.description && (
        <Text size="xs" c="dimmed" ml="sm" lineClamp={1} style={{ flex: 1 }}>
          — {entry.description}
        </Text>
      )}
      {nativeOnly && (
        <Text size="xs" c="yellow.4">
          view only
        </Text>
      )}
    </Group>
  );
}
