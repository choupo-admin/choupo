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
  F1 ON A KEY (DEV.md 4c C154).  A click on a line SELECTS it (marked like
  the active row of a table), and F1 then answers for the KEY on that line --
  its meaning, its unit, the model it feeds -- from the schema that documents
  it (case/keyHelp.ts), in a card at the foot of the viewer with a door to
  the theory; a key no schema documents is answered for its block, with that
  scope said.  With no line selected, F1 keeps the workspace's own answer.
  The Outline names the propsDict's studies, operations, views and references
  under their lists, so a reader jumps to `N350` rather than to `operations`.

  WHEN it switches is decided by `fitsRow` -- the project's ONE fit rule
  (methods/methodsChrome.tsx) -- against the width this layout's own columns
  need (CASE_PANES_ONE_ROW_PX below).  It is NOT decided by the pointer: a
  tablet has room for these three columns twice over and a coarse pointer does
  not take a column away.
\*---------------------------------------------------------------------------*/

import { ThermoView } from "./ThermoView.js";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";
import { ActionIcon, Anchor, Box, Group, ScrollArea, SegmentedControl, Stack, Text } from "@mantine/core";
import { IconHelp, IconX } from "@tabler/icons-react";
import { keyHelp, type KeyHelp } from "../case/keyHelp.js";
import { locatePropsBlocks } from "../case/propsDictLocate.js";
import { openGuide } from "../help/guideLinks.js";
import { FileTree } from "./FileTree.js";

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
  /** a named entry of a list (an operation, a view ...), drawn under it */
  child?: boolean;
}

/** The propsDict's outline: each top-level key, and under `studies`,
 *  `operations`, `views` and `references` the NAME of every entry with its
 *  line (case/propsDictLocate.ts -- the tokenizer, never a regex over text). */
function propsOutline(text: string): OutlineKey[] {
  const top = parseOutline(text);
  const idx = locatePropsBlocks(text);
  const out: OutlineKey[] = [];
  for (const o of top) {
    out.push(o);
    const list = (idx as Record<string, Map<string, { line: number }> | undefined>)[o.key];
    if (list) for (const [name, l] of list) out.push({ key: name, line: l.line, child: true });
  }
  return out;
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

/** The case's thermophysical system: where its readiness is shown. */
const THERMO_DICT = "constant/thermoPhysPropDict";

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
  //  What happens inside each unit rides `convergedFiles` since 2026-09-06:
  //  a state directory is a RESTARTABLE SNAPSHOT, so
  //  `converged/internalStates/<SECTOR>/<unit>` (one file per unit) is part
  //  of the same view as the streams and arrives on the same channel.
  const raw = useMemo(
    () => ({ ...(caseFiles.rawFiles ?? {}), ...(convergedOut ?? {}), ...(designOut ?? {}) }),
    [caseFiles.rawFiles, convergedOut, designOut]);
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
  const outline = useMemo<OutlineKey[]>(() => {
    if (!active) return [];
    if (!isLesson && /(^|\/)system\/propsDict$/.test(active)) return propsOutline(activeText);
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

  /* A BLOCK ASKED FOR FROM ELSEWHERE (DEV.md 4c C151): the props review
   * screen and its calculation map send an operation, a view or a dataset
   * here with the lines that declare it.  The file is opened, the lines are
   * MARKED (a band down the gutter and a tint, so the block reads as one
   * thing) and scrolled to; the mark stays until another file is chosen. */
  const caseFocus = useStore((s) => s.caseFocus);
  const [mark, setMark] = useState<{ path: string; line: number; endLine: number } | null>(null);
  useEffect(() => {
    if (!caseFocus || raw[caseFocus.path] === undefined) return;
    setActivePath(caseFocus.path);
    setPane("contents");
    const line = caseFocus.line ?? 1;
    setMark(caseFocus.line ? { path: caseFocus.path, line, endLine: caseFocus.endLine ?? line } : null);
    //  two frames: the first paints the file, the second has its line divs
    requestAnimationFrame(() => requestAnimationFrame(() =>
      document.getElementById(`ln-${line}`)?.scrollIntoView({ block: "start", behavior: "auto" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseFocus?.seq]);
  const marked = (i: number) => !!mark && mark.path === active && i + 1 >= mark.line && i + 1 <= mark.endLine;

  /* THE SELECTED LINE and F1's answer for its key (DEV.md 4c C154). */
  const [activeLine, setActiveLine] = useState<{ path: string; line: number } | null>(null);
  const [help, setHelp] = useState<KeyHelp | null>(null);
  const propsDict = caseFiles.propsDict;
  const flowsheet = caseFiles.flowsheet;
  useEffect(() => { setHelp(null); }, [active]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "F1" || !activeLine || activeLine.path !== active || isLesson) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setHelp(keyHelp(activeLine.path, activeText, activeLine.line, { propsDict, flowsheet }));
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [activeLine, active, activeText, isLesson, propsDict, flowsheet]);

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
    setMark(null);
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
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="accent" ff="monospace">{active}</Text>
                  {!isLesson && (
                    <Text size="10px" c="dimmed">
                      {activeLine?.path === active ? `line ${activeLine.line} selected -- F1 for its key` : "click a line, then F1 for what its key means"}
                    </Text>
                  )}
                </Group>
              </Box>
              {/* THE THERMO'S READINESS, WHERE THE THERMO IS DECLARED (DEV.md
                  4c C172 item 5).  A process case's "Props" view existed only
                  to show this table (no propsDict, nothing to run there); it
                  left the menu, and its one piece of content moved here, to
                  the file it qualifies.  A properties case shows the same
                  table in its Workflow, under the thermo package. */}
              {active === THERMO_DICT && !caseFiles.propsDict && (
                <details open data-case-readiness=""
                  style={{ margin: "10px 14px 0 14px", border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
                    borderRadius: 6, padding: "4px 8px" }}>
                  <summary style={{ cursor: "pointer" }}>
                    <Text span size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
                      Is this thermo ready?
                    </Text>
                    <Text span size="xs" c="dimmed"> -- each component's data and each phase's model, read from this file</Text>
                  </summary>
                  <Box style={{ position: "relative", height: "55vh", minHeight: 360 }}><ThermoView /></Box>
                </details>
              )}
              <Box style={{ padding: "10px 14px" }}>
                {isLesson && <Lesson md={activeText} />}
                {!isLesson && lines.map((html, i) => (
                  <div
                    key={i}
                    id={`ln-${i + 1}`}
                    className={`cw-line${activeLine?.path === active && activeLine.line === i + 1 ? " cw-active" : ""}`}
                    data-line={i + 1}
                    onClick={() => setActiveLine({ path: active, line: i + 1 })}
                    title="Click to select this line, then F1 for what its key means"
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                      minHeight: "1.55em",
                      ...(marked(i) ? {
                        background: "light-dark(var(--mantine-color-yellow-1), rgba(250, 204, 21, 0.12))",
                        boxShadow: "inset 3px 0 0 var(--mantine-color-yellow-6)",
                      } : {}),
                    }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ))}
              </Box>
              {help && help.file === active && (
                <Box data-key-help={help.scope} style={{
                  position: "sticky", bottom: 0, zIndex: 2, margin: "0 10px 10px 10px",
                  border: "1px solid light-dark(var(--mantine-color-cyan-4), var(--mantine-color-cyan-8))",
                  borderRadius: 6, padding: "8px 12px",
                  background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}>
                  <Group justify="space-between" wrap="nowrap" gap={6}>
                    <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                      <IconHelp size={14} color="var(--mantine-color-cyan-6)" />
                      <Text size="sm" fw={700} ff="monospace">{help.subject}</Text>
                      <Text size="sm" fw={600}>{help.title !== help.subject ? help.title : ""}</Text>
                      {help.unit && <Text size="xs" c="dimmed">unit: <b>{help.unit}</b></Text>}
                      <Text size="10px" c="dimmed" tt="uppercase">
                        {help.scope === "key" ? `line ${help.line}` : help.scope === "block" ? "help of the block (no schema documents this key)" : "no schema for this file"}
                      </Text>
                    </Group>
                    <ActionIcon size="sm" variant="subtle" color="gray" aria-label="close" onClick={() => setHelp(null)}>
                      <IconX size={13} />
                    </ActionIcon>
                  </Group>
                  {help.description && <Text size="xs" mt={4} style={{ whiteSpace: "pre-wrap" }}>{help.description}</Text>}
                  <Group gap="md" mt={4}>
                    {help.guide && (
                      <Anchor component="button" type="button" size="xs" onClick={() => openGuide(help.guide!.url)}>
                        Open {help.guide.label}
                      </Anchor>
                    )}
                    <Text size="10px" c="dimmed">from {help.source}</Text>
                  </Group>
                </Box>
              )}
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
                <Text size="xs" c={o.child ? "dimmed" : "var(--mantine-color-text)"} ff="monospace"
                  pl={o.child ? 10 : 0} data-outline-child={o.child ? "" : undefined}>
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
