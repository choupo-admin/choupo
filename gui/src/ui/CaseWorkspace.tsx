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
  CaseWorkspace -- the Case top-menu workspace (Fase B).

  Three-column layout, NO canvas (the case-file viewer is what the
  student is here to read; the canvas is one keystroke away via Esc):

    left   ~240 px  File tree.  Every raw dict file in the case
                    (system/, constant/, sector sub-trees), grouped by
                    top-level folder; clicking selects.
    centre 1fr      Syntax-highlighted viewer.  Each line is a <div>
                    with an id ("ln-<N>") so the outline can jump.
    right  ~220 px  Outline.  The top-level keys of the active dict,
                    extracted from the parsed AST; clicking scrolls
                    the viewer to that key's line.

  Why the three columns: navigating dicts has TWO dimensions --
  WHICH FILE (left), and WHERE IN THE FILE (right).  The previous
  Case tab collapsed those into a single file list + one big viewer
  with no inline jump --- you could open a file but had to scroll
  blindly.

  ONE PANEL AT A TIME WHEN THE THREE COLUMNS DO NOT FIT (2026-08-17,
  docs/design/modes-and-views-in-the-top-row.md §4b).  240 + 220 px of fixed
  side columns do not fit a 390 px screen: FILES and OUTLINE sat side by side
  at roughly 195 px each with the viewer -- the thing the workspace exists to
  show -- squeezed to nothing.  That is not a layout, it is three unusable
  panes.  When the three columns cannot have their widths, they become three
  PANES with one chooser above them, full width, one at a time.

  Two rules the chooser has to obey, and both were paid for by thinking about
  what a tap does:
    * choosing a file SWITCHES to the viewer.  On the desk the click changes
      the middle column in place; on a phone the file list would stay on
      screen and nothing visible would happen.
    * an outline jump switches too, and scrolls AFTER the switch -- the
      viewer is not mounted while the outline is showing, so the
      getElementById the desk path relies on would find nothing.
  WHEN it switches is decided by `fitsRow` -- the project's ONE fit rule
  (methods/methodsChrome.tsx) -- against the width this layout's own columns
  need (CASE_PANES_ONE_ROW_PX below).  It is NOT decided by the pointer: a
  tablet has room for these three columns twice over and a coarse pointer does
  not take a column away.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";
import { ActionIcon, Badge, Box, Group, ScrollArea, SegmentedControl, Stack, Text, Tooltip } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconSitemap } from "@tabler/icons-react";
import { buildTree, nodeKind, squash, sortedChildren, type TreeNode } from "./caseTree";

import { lessonOutline } from "../case/lesson.js";
import { parse, type DictEntry } from "../dict/index.js";
import { useStore } from "../state/store.js";
import { Lesson } from "./Lesson.js";
import { useFitsOneRow } from "./methods/methodsChrome.js";

import { useMeasuredBoxWidth } from "./methods/methodsChrome.js";
import {
  CASE_FILES_PANEL, PanelCollapseButton, PanelReopenStrip, PanelResizeHandle,
  panelBoxProps, usePanel, usePanelShortcut,
} from "./panelContract.js";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Highlight a line of NON-comment dict code: leading keyword + numbers.
function hlCode(s: string): string {
  if (!s) return "";
  let out = esc(s);
  out = out.replace(
    /(^|[\s(])(-?\d[\d.eE+-]*)/g,
    (_m, p: string, n: string) => `${p}<span class="hl-n">${n}</span>`,
  );
  out = out.replace(
    /^(\s*)([A-Za-z_]\w*)/,
    (_m, sp: string, kw: string) => `${sp}<span class="hl-k">${kw}</span>`,
  );
  return out;
}

// Render one already-split line, tracking whether we are mid-block-comment.
// Returns { html, inBlock }.
function highlightLine(line: string, inBlock: boolean): { html: string; inBlock: boolean } {
  if (inBlock) {
    const end = line.indexOf("*/");
    if (end >= 0) {
      return {
        html:
          `<span class="hl-c">${esc(line.slice(0, end + 2))}</span>` +
          hlCode(line.slice(end + 2)),
        inBlock: false,
      };
    }
    return { html: `<span class="hl-c">${esc(line)}</span>`, inBlock: true };
  }
  const b = line.indexOf("/*");
  const l = line.indexOf("//");
  if (l >= 0 && (b < 0 || l < b)) {
    return {
      html:
        hlCode(line.slice(0, l)) + `<span class="hl-c">${esc(line.slice(l))}</span>`,
      inBlock: false,
    };
  }
  if (b >= 0) {
    const after = line.slice(b);
    const end = after.indexOf("*/");
    if (end >= 0) {
      return {
        html:
          hlCode(line.slice(0, b)) +
          `<span class="hl-c">${esc(after.slice(0, end + 2))}</span>` +
          hlCode(after.slice(end + 2)),
        inBlock: false,
      };
    }
    return {
      html: hlCode(line.slice(0, b)) + `<span class="hl-c">${esc(after)}</span>`,
      inBlock: true,
    };
  }
  return { html: hlCode(line), inBlock: false };
}

// File ordering: system/ then constant/ then sector folders, with
// flowsheetDict / propsDict naturally first inside their folder.
function orderFiles(paths: string[]): string[] {
  const rank = (p: string) => {
    // The lesson first: a tutorial's README.md is what the student reads
    // before the dicts (it ranked LAST, after 0/, until 2026-09-02).
    if (/^README\.md$/i.test(p)) return -1;
    if (p.startsWith("system/")) return 0;
    if (p.startsWith("constant/")) return 1;
    return 2;
  };
  return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// Parse a dict text and return its top-level keys, paired with the
// 1-based line number where the key first appears in the raw text.
// Used by the right-hand outline.
interface OutlineKey {
  key: string;
  line: number;
}

function parseOutline(text: string): OutlineKey[] {
  let entries: DictEntry[];
  try {
    const ast = parse(text);
    entries = ast.entries;
  } catch {
    return [];
  }
  // Find the first line where each top-level key appears as
  // `^\s*<key>\b` (skip strings inside values).  Approximation but
  // good enough for Choupo dicts which always start an entry
  // at the line head.
  const lines = text.split("\n");
  const out: OutlineKey[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.key)) continue;
    const re = new RegExp(`^\\s*${e.key.replace(/[.*+?^${}()|[\\]/g, "\\$&")}\\b`);
    let lineNo = -1;
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i] ?? "")) { lineNo = i + 1; break; }
    }
    if (lineNo > 0) {
      out.push({ key: e.key, line: lineNo });
      seen.add(e.key);
    }
  }
  return out;
}

// ---- The three panes, and the width they need -------------------------------

/** The outline column of the wide layout, declared once and used by both the
 *  layout and the threshold below, so the question "do the three columns fit?"
 *  can never be asked against a number the layout no longer uses.
 *
 *  THE FILES COLUMN IS NO LONGER A CONSTANT (2026-08-18).  It became a panel
 *  the reader drags (ui/panelContract.tsx), so the threshold reads what that
 *  panel can be narrowed TO — its declared minimum — rather than a fixed width
 *  that would now be a second, stale copy of a number the layout stopped
 *  using.  The threshold therefore moved with it, from 940 px to
 *  200 + 480 + 220 = 900 px, which is the honest question: the three columns
 *  fit as soon as the file list can be squeezed to its floor. */
const OUTLINE_COL_PX = 220;

/** The narrowest the code VIEWER may be and still be a viewer.  This one is a
 *  declared judgement, not a measurement, and it is the only such number in
 *  this file: at the 12 px monospace the viewer renders, 480 px is about 68
 *  characters, which is a typical dict line (`componentMolarFlows ( 0.5 0.5
 *  );`) without a horizontal scroll.  Below that the middle column stops being
 *  a place to read a file and becomes a place to scroll one. */
const VIEWER_MIN_PX = 480;

/** What the wide, three-column layout needs.  Two measured-from-the-layout
 *  terms plus the declared viewer minimum. */
export const CASE_PANES_ONE_ROW_PX =
  CASE_FILES_PANEL.prefs.size.min + VIEWER_MIN_PX + OUTLINE_COL_PX;

/** The three things the desk shows side by side, and the phone shows one at a
 *  time.  ONE home for the pane set: the chooser renders it and the body
 *  switches on it, so a fourth pane could never appear in one and not the
 *  other. */
export type CasePane = "files" | "contents" | "outline";

export const CASE_PANES: { value: CasePane; label: string }[] = [
  { value: "files",    label: "Files"    },
  { value: "contents", label: "Contents" },
  { value: "outline",  label: "Outline"  },
];

// ---- Component -------------------------------------------------------------

export function CaseWorkspace() {
  const caseFiles = useStore((s) => s.caseFiles);
  //  The solved stream state a run wrote (converged/<stream>, harvested from
  //  the worker's MEMFS) is shown BESIDE the authored files, read-only --
  //  merged for display only, never into caseFiles, so the dirty-tracking
  //  that compares caseFiles against its pristine snapshot cannot mistake a
  //  run output for a user edit.  Before the first run the tree is exactly
  //  the authored case, as before.
  const convergedOut = useStore((s) => s.runResult?.convergedFiles);
  //  The equipment specification sheets (design/<SECTOR>/<unit>/<tag>) ride
  //  the same read-only merge, from their own channel.  Same rule: display
  //  only, never into caseFiles.
  const designOut = useStore((s) => s.runResult?.designFiles);
  //  What happens inside each unit (internalStates/<SECTOR>/<unit>/<kind>),
  //  the third run-output tree on the same read-only merge.
  const internalOut = useStore((s) => s.runResult?.internalStateFiles);
  const raw = useMemo(
    () => ({ ...(caseFiles.rawFiles ?? {}), ...(convergedOut ?? {}), ...(designOut ?? {}),
             ...(internalOut ?? {}) }),
    [caseFiles.rawFiles, convergedOut, designOut, internalOut]);
  const files = useMemo(() => orderFiles(Object.keys(raw)), [raw]);
  const [activePath, setActivePath] = useState<string | null>(null);

  // Default: flowsheetDict / propsDict, else first file.
  const active =
    activePath && raw[activePath] !== undefined
      ? activePath
    : files.find((f) => /flowsheetDict|propsDict$/.test(f)) ?? files[0] ?? null;

  const activeText = active ? raw[active] ?? "" : "";
  // A README.md is the case's LESSON: rendered from its markdown subset
  // (case/lesson.ts), never through the dict highlighter, and outlined by
  // its headings rather than by dict keys.
  const isLesson = !!active && /\.md$/i.test(active);
  const outline = useMemo(() => {
    if (!active) return [];
    if (!isLesson) return parseOutline(activeText);
    try { return lessonOutline(activeText).map((h) => ({ key: h.key, line: h.line })); }
    catch { return []; }
  }, [active, isLesson, activeText]);

  // Build the highlighted lines once per file.  Each line becomes a
  // <div id="ln-<N>"> so the outline can scrollIntoView.
  const lines = useMemo(() => {
    if (!active) return [] as string[];
    const src = activeText.split("\n");
    let inBlock = false;
    const out: string[] = [];
    for (const line of src) {
      const r = highlightLine(line, inBlock);
      inBlock = r.inBlock;
      out.push(r.html);
    }
    return out;
  }, [active, activeText]);

  /* ONE PANE AT A TIME when the three columns do not FIT (2026-08-17).  The
   * default is the CONTENTS -- the workspace opens on flowsheetDict/propsDict
   * already, so landing on the file list would put a chooser in front of a
   * choice that has been made.
   *
   * This used to be `useNarrowViewport()`, whose coarse-pointer term gave a
   * 1180 px tablet the phone's one-pane chooser with room for all three
   * columns twice over.  The question is whether the three columns fit, so it
   * is asked as one: two of the three widths are the layout's OWN numbers
   * (the same constants the grid template below is built from -- change a
   * column and the threshold follows), and the third is the viewer's declared
   * minimum, stated as the judgement it is. */
  const narrow = !useFitsOneRow(CASE_PANES_ONE_ROW_PX);
  const [pane, setPane] = useState<CasePane>("contents");

  /* The file list is a PANEL CONTRACT rail (ui/panelContract.tsx) — draggable,
   * foldable, remembered — but ONLY in the wide posture, and that exception is
   * argued rather than assumed.  Narrow shows ONE pane at a time, chosen by the
   * chooser above it: there the file list is not a rail beside a reading
   * column, it IS the column, so folding it would leave the workspace showing
   * nothing and resizing it would mean resizing the window.  The contract's own
   * measured default would reach the same conclusion (it does not fit beside
   * `contentMin`), but a fold the reader can trigger and then find empty is
   * worse than no fold, so the wide branch is the only one that renders it. */
  const railHost = useMeasuredBoxWidth<HTMLDivElement>();
  const rail = usePanel(CASE_FILES_PANEL, { availablePx: railHost.width });
  usePanelShortcut(rail);
  const reduceMotion = useReducedMotion();
  const railBox = panelBoxProps(rail, !!reduceMotion);

  const selectFile = (path: string) => {
    setActivePath(path);
    setPane("contents");    // desk: no-op; phone: the tap has to go somewhere
  };

  const jumpTo = (line: number) => {
    const scroll = () =>
      document.getElementById(`ln-${line}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (narrow && pane !== "contents") {
      // The viewer is not mounted while the outline is showing, so the switch
      // must land before the lookup: two frames, because the first paints the
      // pane and the second has the line divs in the document.
      setPane("contents");
      requestAnimationFrame(() => requestAnimationFrame(scroll));
      return;
    }
    scroll();
  };

  if (files.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">No case files to show.</Text>
      </Stack>
    );
  }

  const highlightCss = (
    <style>{`
.hl-c { color: #6b7785; font-style: italic; }
.hl-n { color: #e8a661; }
.hl-k { color: #4dd0c0; }
.cw-line { white-space: pre; }
.cw-line.cw-active { background: rgba(38, 198, 218, 0.10); }
      `}</style>
  );

  /* The three panes, built ONCE and placed by the posture.  Wide puts them in
   * three grid columns; narrow shows one.  Only the dividing borders differ --
   * a full-width pane has no neighbour to be divided from. */
  const filesTree = (
    <ScrollArea
      type="always"
      scrollbarSize={10}
      style={{ flex: 1, minHeight: 0 }}
      styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
    >
      <FileTree
        files={files}
        active={active}
        onSelect={selectFile}
      />
    </ScrollArea>
  );

  /** NARROW: the file list as the one visible pane — no rail chrome (see the
   *  argued exception above). */
  const filesPane = (
    <Box
      style={{
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
        overflow: "hidden",
        minHeight: 0,
        display: "flex", flexDirection: "column",
      }}
    >
      {filesTree}
    </Box>
  );

  /** WIDE: the same tree as a contract panel. */
  const filesRail = (
    <Box
      data-panel={railBox["data-panel"]}
      style={{
        ...railBox.style,
        borderRight: rail.collapsed
          ? "none"
          : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
        display: "flex", flexDirection: "column",
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap" gap={4}
        px="xs" py={4} style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed" tt="uppercase"
          style={{ letterSpacing: 0.5, fontWeight: 600 }}>
          Files
        </Text>
        <PanelCollapseButton panel={rail} />
      </Group>
      {filesTree}
    </Box>
  );

  const contentsPane = (
      <Box style={{ minWidth: 0, height: "100%", minHeight: 0,
                    background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-9))" }}>
        <ScrollArea type="auto" style={{ height: "100%" }}>
          {active && (
            <>
              <Box
                style={{
                  padding: "8px 14px 4px 14px",
                  borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-7))",
                  background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                <Text size="xs" c="accent" ff="monospace">{active}</Text>
              </Box>
              <Box style={{ padding: "10px 14px" }}>
                {isLesson && <Lesson md={activeText} />}
                {!isLesson && lines.map((html, i) => (
                  <div
                    key={i}
                    id={`ln-${i + 1}`}
                    className="cw-line"
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                      minHeight: "1.55em",
                    }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ))}
              </Box>
            </>
          )}
        </ScrollArea>
      </Box>
  );

  const outlinePane = (
      <Box
        style={{
          borderLeft: narrow ? undefined
            : "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <ScrollArea
          type="always"
          scrollbarSize={10}
          style={{ height: "100%" }}
          styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
        >
          <Stack gap={0} p="xs">
            <Text size="xs" c="dimmed" tt="uppercase" mb={6}
              style={{ letterSpacing: 0.5, fontWeight: 600 }}>
              Outline
            </Text>
            {outline.length === 0 && (
              <Text size="xs" c="dimmed" px="xs">
                No top-level keys.
              </Text>
            )}
            {outline.map((o) => (
              <Group
                key={o.key + ":" + o.line}
                gap={6}
                wrap="nowrap"
                style={{
                  cursor: "pointer",
                  padding: "3px 8px",
                  borderRadius: 2,
                }}
                onClick={() => jumpTo(o.line)}
              >
                <Text size="10px" c="dimmed" ff="monospace" style={{ width: 32 }}>
                  L{o.line}
                </Text>
                <Text size="xs" c="var(--mantine-color-text)" ff="monospace">
                  {o.key}
                </Text>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Box>
  );

  /* NARROW: a chooser over one pane.  The chooser is a real, full-width
   * control in the flow ABOVE the pane -- not an edge gesture and not a
   * fold-away strip -- because a navigation a student cannot see is a
   * navigation that does not exist (the same argument the top row's dropdown
   * rests on).  It is the first thing in the DOM, so it is also the first
   * thing the keyboard and a screen reader reach. */
  if (narrow) {
    return (
      <Box
        style={{
          display: "grid",
          gridTemplateRows: "auto 1fr",
          height: "100%",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {highlightCss}
        <Box
          p={6}
          style={{
            borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
            background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
            minWidth: 0,
          }}
        >
          <SegmentedControl
            fullWidth
            size="xs"
            value={pane}
            onChange={(v) => setPane(v as CasePane)}
            data={CASE_PANES}
            aria-label="Which case panel to show"
          />
        </Box>
        {/* `display: grid` with one 1fr row, so whichever pane is showing
            stretches to the full height -- the side panes size themselves
            from their grid cell on the desk and have no height of their
            own. */}
        <Box style={{ display: "grid", gridTemplateRows: "1fr",
                      minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {pane === "files" ? filesPane
            : pane === "outline" ? outlinePane
            : contentsPane}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={railHost.ref}
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
      }}
    >
      {highlightCss}
      {rail.collapsed && <PanelReopenStrip panel={rail} scent="FILES" />}
      {filesRail}
      <PanelResizeHandle panel={rail} />
      <Box style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {contentsPane}
      </Box>
      <Box style={{ flex: `0 0 ${OUTLINE_COL_PX}px`, minWidth: 0, minHeight: 0 }}>
        {outlinePane}
      </Box>
    </Box>
  );
}

// ---- File tree -------------------------------------------------------------

/*  THE CASE TREE IS A TREE.
 *
 *  It used to group by the FIRST path segment only and draw everything after
 *  it as one row, so `constant/components/water.dat` read as
 *  `components/water.dat` under a `constant/` heading and a sector's
 *  `sectors/BRINE/system/flowsheetDict` as `BRINE/system/flowsheetDict`.  That
 *  was tolerable while a case was two levels deep.  It stopped being tolerable
 *  when the engine started writing `design/<SECTOR>/<unit>/<equipmentTag>`
 *  (2026-09-04): the point of that tree is that a reader navigates to a UNIT
 *  and finds its specification sheet, and a flat row spelling the route out
 *  is not navigation.
 *
 *  So the grouping is recursive on the real path separator and the same code
 *  draws every depth (`./caseTree.ts` builds the shape, and is tested).
 *
 *  COLLAPSE STATE IS KEYED ON THE FULL PREFIX, not the segment: the case's
 *  `system/` and a sector's `system/` are two nodes and fold independently.
 *  Keying on the segment folded both -- name identity, applied to a UI.
 */
function FileTree({
  files, active, onSelect,
}: {
  files: string[];
  active: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => squash(buildTree(files)), [files]);
  const isLesson = (f: string) => /^README\.md$/i.test(f);

  //  All expanded by default, as before.  Keyed on the full prefix.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const renderLeaf = (f: string, depth: number) => {
    const isActive = f === active;
    const leaf = f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f;
    return (
      <Group
        key={f}
        gap={6}
        wrap="nowrap"
        style={{
          cursor: "pointer",
          padding: "2px 8px 2px 0",
          paddingLeft: 26 + depth * 12,
          background: isActive ? "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))" : undefined,
          borderLeft: isActive
            ? "2px solid var(--mantine-color-accent-3)"
            : "2px solid transparent",
        }}
        onClick={() => onSelect(f)}
      >
        <Text
          size="xs"
          ff="monospace"
          c={isActive ? "accent" : "var(--mantine-color-text)"}
          style={{ wordBreak: "break-all" }}
        >
          {leaf}
        </Text>
      </Group>
    );
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isCollapsed = collapsed.has(node.prefix);
    //  Colour, weight and glyph follow the node's KIND (caseTree.kindOf -- the
    //  one home): what the case declares in yellow, its initial state in the
    //  same family, a sector in the case colour with a sitemap glyph (a sector
    //  IS a case), and what the RUN wrote dimmed with a badge, so a student
    //  never edits a file the next run overwrites.  Hue carries less than
    //  weight in a pane this narrow, which is why outputs are also lighter.
    const kind = nodeKind(node);
    const colour = kind === "declared" ? "yellow" : kind === "state0" ? "yellow.3"
                 : kind === "sector" ? "accent" : "dimmed";
    const weight = kind === "output" ? 400 : kind === "state0" ? 500 : 600;
    return (
      <Stack key={node.prefix} gap={0} mb={depth === 0 ? 4 : 0}>
        <Group
          gap={4}
          wrap="nowrap"
          style={{ cursor: "pointer", padding: "4px 4px 2px", paddingLeft: 4 + depth * 12 }}
          onClick={() => toggle(node.prefix)}
        >
          <ActionIcon
            variant="transparent"
            size="xs"
            c="dimmed"
            onClick={(e) => { e.stopPropagation(); toggle(node.prefix); }}
          >
            {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
          </ActionIcon>
          {kind === "sector" && <IconSitemap size={11} style={{ opacity: 0.8, flex: "none" }} />}
          <Text size="xs" c={colour} fw={weight} ff="monospace">
            {node.label}/
          </Text>
          {kind === "output" && depth === 0 && (
            <Tooltip label="Written by the solver on every run and regenerated whole -- edit system/ or 0/ instead." withArrow>
              <Badge size="xs" variant="light" color="gray" style={{ textTransform: "none", cursor: "help" }}>
                run output
              </Badge>
            </Tooltip>
          )}
        </Group>
        {!isCollapsed && (
          <>
            {sortedChildren(node).map((k) => renderNode(k, depth + 1))}
            {node.leaves.map((f) => renderLeaf(f, depth + 1))}
          </>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap={0} p="xs">
      <Text size="xs" c="dimmed" tt="uppercase" mb={6}
        style={{ letterSpacing: 0.5, fontWeight: 600 }}>
        Files
      </Text>
      {/*  The lesson first: a root README.md is what a student reads before
          anything else.  Then the folders, then the other root files.  */}
      {tree.leaves.filter(isLesson).map((f) => renderLeaf(f, 0))}
      {sortedChildren(tree).map((k) => renderNode(k, 0))}
      {tree.leaves.filter((f) => !isLesson(f)).map((f) => renderLeaf(f, 0))}
    </Stack>
  );
}
