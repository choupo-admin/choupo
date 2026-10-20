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

  SEARCH OVER EVERY TUTORIAL (DEV.md 4c C113, Vítor, 2026-10-20).  A field
  sits at the top, always visible, and searches ALL tutorials whatever folder
  is open -- name, shortName, description, category, sub-class and README,
  case- and accent-insensitive, several words in any order
  (cases/tutorialSearch.ts ranks, search/textSearch.ts matches).  While it
  holds a query the results REPLACE the folder list; clearing it gives the
  browser back exactly as it was (the folder and the selection are not
  touched by searching).  A click on a result opens THAT result; Enter in the
  field opens the HIGHLIGHTED result or nothing -- never the browser's
  selection, which on opening is the case already on screen.

  THE DOUBLE-CLICK OPENED THE PREVIOUS SELECTION, and that is fixed here too.
  The row's handler did `setSelected(t.name); openSelected();` -- but
  `openSelected` reads the selection of the render it was created in, and a
  React state update is not visible inside the handler that made it, so a
  double-click could open whatever had been selected before.  A row now
  opens BY ITS OWN NAME (`openByName`), never through the selection.
\*---------------------------------------------------------------------------*/

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowUp,
  IconFile,
  IconFolder,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import {
  searchEnterTarget,
  searchTutorials,
  type TutorialHit,
} from "../cases/tutorialSearch.js";
import { excerptAround, parseQuery } from "../search/textSearch.js";

import {
  FIRST_PATH,
  TUTORIALS,
  TUTORIALS_BY_CATEGORY,
  subclassGroupsFor,
  subclassLabel,
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
// sub-class (its cases).  FIRST_PATH is a VIRTUAL folder at the root: the
// `tier tutorial;` cases across every category, read off the tree (one home
// for "start here" -- the same word bin/curate/check_case_tiers reads).
const FIRST_PATH_CWD = "firstPath";

/** The footer's fixed height: one line of name and two of description (see
 *  the footer for why it must not change with the selection). */
const FOOTER_PX = 68;
type Cwd = { cat: Category | "" | typeof FIRST_PATH_CWD; sub: string | null };

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
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  // Reset when the modal re-opens.
  useEffect(() => {
    if (opened) {
      setCwd(initialCwd);
      setSelected(currentName);
      setQuery("");
      setHighlighted(0);
    }
  }, [opened, initialCwd, currentName]);

  // The search: over EVERY tutorial, whatever folder is open.  Searching
  // touches neither `cwd` nor `selected`, so clearing the field gives the
  // browser back exactly as it was.
  const searching = parseQuery(query).length > 0;
  const hits = useMemo(() => searchTutorials(query, TUTORIALS), [query]);
  useEffect(() => { setHighlighted(0); }, [query]);
  const hl = Math.min(highlighted, Math.max(hits.length - 1, 0));
  const highlightedHit = searching ? hits[hl] : undefined;

  // Keep the highlighted result in view while the arrows move it.
  useEffect(() => {
    if (!searching) return;
    document.getElementById(resultRowId(hl))?.scrollIntoView?.({ block: "nearest" });
  }, [hl, searching]);

  /** Open a case BY NAME -- the one route every row, the Enter key and the
   *  Open button take, so none of them can read a stale selection. */
  const openByName = (name: string) => {
    onSelect(name);
    onClose();
  };
  const openHighlighted = () => {
    const name = searchEnterTarget(hits, hl);
    if (name) openByName(name);
  };

  const breadcrumb =
    cwd.cat === ""
      ? "tutorials/"
    : cwd.cat === FIRST_PATH_CWD
      ? "tutorials / (start here: the first path)"
    : cwd.sub
        ? `tutorials / ${cwd.cat} / ${cwd.sub}/`
      : `tutorials / ${cwd.cat}/`;

  const selectedEntry: TutorialEntry | undefined = useMemo(
    () => (selected ? TUTORIALS.find((e) => e.name === selected) : undefined),
    [selected],
  );

  const canOpen =
    !!selectedEntry && cwd.cat !== ""
    && (cwd.cat === FIRST_PATH_CWD || selectedEntry.category === cwd.cat);

  const openSelected = () => {
    if (canOpen && selectedEntry) {
      onSelect(selectedEntry.name);
      onClose();
    }
  };

  // The rows for the current view.
  const groups = cwd.cat !== "" && cwd.cat !== FIRST_PATH_CWD && cwd.sub === null
    ? subclassGroupsFor(cwd.cat) : null;

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
          if (searching) openHighlighted();
          else openSelected();
        }
      }}
    >
      <Stack gap="sm">
        <TextInput
          data-autofocus
          size="sm"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search all tutorials: name, description, README…"
          aria-label="search all tutorials"
          leftSection={<IconSearch size={14} />}
          rightSection={query ? (
            <ActionIcon variant="subtle" color="gray" size="sm"
              aria-label="clear the search" onClick={() => setQuery("")}>
              <IconX size={14} />
            </ActionIcon>
          ) : null}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && searching) {
              e.preventDefault();
              setHighlighted(Math.min(hl + 1, Math.max(hits.length - 1, 0)));
            } else if (e.key === "ArrowUp" && searching) {
              e.preventDefault();
              setHighlighted(Math.max(hl - 1, 0));
            } else if (e.key === "Enter") {
              // The field's Enter opens the HIGHLIGHTED result or nothing --
              // never the browser's selection (see the file header).
              e.preventDefault();
              e.stopPropagation();
              if (searching) openHighlighted();
            }
          }}
        />

        {searching ? (
          <Text size="xs" c="dimmed" px={4} aria-live="polite">
            {hits.length === 0
              ? "No tutorial matches every word."
              : `${hits.length} tutorial${hits.length === 1 ? "" : "s"} match`
                + (hits.length > SEARCH_ROWS_SHOWN
                  ? ` — showing the first ${SEARCH_ROWS_SHOWN}; add a word to narrow`
                  : "")
                + "  ·  ↑↓ to move, Enter to open"}
          </Text>
        ) : (
          <>
            <Text size="xs" c="dimmed">
              Browse the bundled tutorials. Click a folder to enter, or
              click <code>..</code> to go up. Each case is a folder; the
              <code>.cho</code> file inside is the entry point.
            </Text>

            {/* Breadcrumb */}
            <Text size="xs" ff="monospace" c="accent" px={4}>
              📂 {breadcrumb}
            </Text>
          </>
        )}

        <Box
          style={{
            border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            borderRadius: 4,
            backgroundColor: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
          }}
        >
          <ScrollArea.Autosize mah={420} type="auto">
            <Stack gap={0} p="xs" role={searching ? "listbox" : undefined}
              aria-label={searching ? "tutorials matching the search" : undefined}>
              {searching
                ? searchResultRows(hits, query, hl, setHighlighted, openByName)
              : (<>
              {/* `..` up one level */}
              {cwd.cat !== "" && (
                <NavRow
                  label={
                    cwd.sub && cwd.cat !== FIRST_PATH_CWD
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
                  ? renderSubclasses(cwd.cat as Category, groups, setCwd)
                : renderCases(currentCases(cwd), selected, setSelected, openByName)}
              </>)}
            </Stack>
          </ScrollArea.Autosize>
        </Box>

        {/* Footer */}
        <Group justify="space-between" align="flex-end">
          {/* A FIXED HEIGHT, and that is a fix, not a style: the footer used to
              grow when a case was selected (one dimmed line became the name
              plus a wrapped description), the modal grew with it, and a
              modal taller than the window re-centred -- so the SECOND click of
              a double-click landed on the NEXT row and opened the wrong case
              (measured 2026-10-20 in Chromium at 1280x800: double-clicking
              analysis02 opened bubbleT01).  Two lines of description, clamped. */}
          <Box h={FOOTER_PX} style={{ flex: "1 1 220px", minWidth: 0, maxWidth: 420, overflow: "hidden" }}>
            {searching ? (
              highlightedHit ? (
                <>
                  <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                    {highlightedHit.entry.name}
                  </Text>
                  {highlightedHit.entry.description && (
                    <Text size="sm" c="var(--mantine-color-text)" mt={2} lineClamp={2}>
                      {highlightedHit.entry.description}
                    </Text>
                  )}
                </>
              ) : (
                <Text size="xs" c="dimmed">Clear the search to browse the folders.</Text>
              )
            ) : selectedEntry ? (
              <>
                <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                  {selectedEntry.name}
                </Text>
                {selectedEntry.description && (
                  <Text size="sm" c="var(--mantine-color-text)" mt={2} lineClamp={2}>
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
              onClick={() => { if (searching) openHighlighted(); else openSelected(); }}
              disabled={searching ? !highlightedHit : !canOpen}
              styles={{
                root: {
                  backgroundColor: (searching ? !!highlightedHit : canOpen)
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
  if (cwd.cat === FIRST_PATH_CWD) return FIRST_PATH;
  const cat = TUTORIALS_BY_CATEGORY.find((g) => g.category === cwd.cat);
  if (!cat) return [];
  return cwd.sub ? cat.entries.filter((e) => e.subclass === cwd.sub) : cat.entries;
}

function renderRoot(setCwd: (c: Cwd) => void): React.ReactNode {
  const firstPath = FIRST_PATH.length > 0 ? (
    <NavRow
      key={FIRST_PATH_CWD}
      label="start here: the first path"
      icon={<IconFolder size={14} />}
      rightLabel={`${FIRST_PATH.length} tutorials with a lesson`}
      onClick={() => setCwd({ cat: FIRST_PATH_CWD, sub: null })}
    />
  ) : null;
  const categories = TUTORIALS_BY_CATEGORY.map((group) => {
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
  return [firstPath, ...categories];
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

/** The case rows of a folder.  Exported for the test that pins the
 *  double-click: it must open the CLICKED case by its own name. */
export function renderCases(
  entries: TutorialEntry[],
  selected: string | null,
  setSelected: (s: string | null) => void,
  openByName: (name: string) => void,
): JSX.Element[] {
  return entries.map((t) => (
    <CaseRow
      key={t.name}
      entry={t}
      selected={selected === t.name}
      onSelect={() => setSelected(t.name)}
      // By NAME, never through the selection: a state update is not visible
      // inside the handler that made it (see the file header).
      onDoubleSelect={() => openByName(t.name)}
    />
  ));
}

/** How many search results are drawn at once.  A one-letter query can match
 *  most of the corpus; drawing every row (each with its README excerpt)
 *  would make every keystroke cost what it does not need to. */
export const SEARCH_ROWS_SHOWN = 100;

const resultRowId = (i: number) => `open-case-result-${i}`;

/** The search result rows.  Exported for the test that pins "a click opens
 *  THAT result". */
export function searchResultRows(
  hits: readonly TutorialHit[],
  query: string,
  highlighted: number,
  setHighlighted: (i: number) => void,
  openByName: (name: string) => void,
): JSX.Element[] {
  const terms = parseQuery(query);
  return hits.slice(0, SEARCH_ROWS_SHOWN).map((h, i) => (
    <SearchResultRow
      key={h.entry.name}
      id={resultRowId(i)}
      hit={h}
      readmeExcerpt={h.bestField === "readme" && h.entry.readme
        ? excerptAround(h.entry.readme, terms, 60) : null}
      highlighted={i === highlighted}
      onHover={() => setHighlighted(i)}
      onOpen={() => openByName(h.entry.name)}
    />
  ));
}

function SearchResultRow(props: {
  id: string;
  hit: TutorialHit;
  readmeExcerpt: { before: string; hit: string; after: string } | null;
  highlighted: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const { id, hit, readmeExcerpt, highlighted, onHover, onOpen } = props;
  const e = hit.entry;
  const folder = [e.category, subclassLabel(e.subclass)].filter(Boolean).join(" / ");
  return (
    <Box
      id={id}
      role="option"
      aria-selected={highlighted}
      px={8}
      py={5}
      onClick={onOpen}
      // MOVE, not enter: a list that re-renders under a resting pointer must
      // not steal the highlight the arrows just set.
      onMouseMove={(e) => {
        // A real move only: Chromium sends a zero-movement mousemove when the
        // list scrolls or re-renders under a resting pointer.
        if (!highlighted && (e.movementX !== 0 || e.movementY !== 0)) onHover();
      }}
      style={{
        cursor: "pointer",
        userSelect: "none",
        borderRadius: 3,
        backgroundColor: highlighted
          ? "light-dark(var(--mantine-color-accent-1), var(--mantine-color-dark-5))"
        : "transparent",
      }}
    >
      <Group gap={6} wrap="nowrap">
        <Box style={{ color: "light-dark(var(--mantine-color-gray-6), var(--mantine-color-dark-2))", flexShrink: 0 }}>
          <IconFile size={14} />
        </Box>
        <Text size="xs" ff="monospace" fw={600} style={{ overflowWrap: "anywhere" }}>
          {e.shortName}
        </Text>
        {e.unsupportedReason && (
          <Text size="xs" c="yellow.4" style={{ flexShrink: 0 }}>view only</Text>
        )}
      </Group>
      <Text size="xs" c="dimmed" ml={20}>{folder}</Text>
      {e.description && (
        <Text size="xs" ml={20} lineClamp={2}>{e.description}</Text>
      )}
      {readmeExcerpt && (
        <Text size="xs" c="dimmed" ml={20} lineClamp={2}>
          <Badge size="xs" variant="light" color="gray" mr={4}>README</Badge>
          {readmeExcerpt.before}
          <Text span fw={700} c="var(--mantine-color-text)">{readmeExcerpt.hit}</Text>
          {readmeExcerpt.after}
        </Text>
      )}
    </Box>
  );
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
