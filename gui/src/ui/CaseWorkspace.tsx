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
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import { parse, type DictEntry } from "../dict/index.js";
import { useStore } from "../state/store.js";

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

// ---- Component -------------------------------------------------------------

export function CaseWorkspace() {
  const caseFiles = useStore((s) => s.caseFiles);
  const raw = caseFiles.rawFiles ?? {};
  const files = useMemo(() => orderFiles(Object.keys(raw)), [raw]);
  const [activePath, setActivePath] = useState<string | null>(null);

  // Default: flowsheetDict / propsDict, else first file.
  const active =
    activePath && raw[activePath] !== undefined
      ? activePath
    : files.find((f) => /flowsheetDict|propsDict$/.test(f)) ?? files[0] ?? null;

  const activeText = active ? raw[active] ?? "" : "";
  const outline = useMemo(() => (active ? parseOutline(activeText) : []), [active, activeText]);

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

  const jumpTo = (line: number) => {
    const el = document.getElementById(`ln-${line}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  if (files.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">No case files to show.</Text>
      </Stack>
    );
  }

  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 220px",
        gridTemplateRows: "1fr",
        height: "100%",
        minHeight: 0,
      }}
    >
      <style>{`
.hl-c { color: #6b7785; font-style: italic; }
.hl-n { color: #e8a661; }
.hl-k { color: #4dd0c0; }
.cw-line { white-space: pre; }
.cw-line.cw-active { background: rgba(38, 198, 218, 0.10); }
      `}</style>

      {/* File tree */}
      <Box
        style={{
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
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
          <FileTree
            files={files}
            active={active}
            onSelect={setActivePath}
          />
        </ScrollArea>
      </Box>

      {/* Viewer */}
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
                {lines.map((html, i) => (
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

      {/* Outline */}
      <Box
        style={{
          borderLeft: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
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
    </Box>
  );
}

// ---- File tree -------------------------------------------------------------

function FileTree({
  files, active, onSelect,
}: {
  files: string[];
  active: string | null;
  onSelect: (path: string) => void;
}) {
  // Group by top-level folder so the tree stays compact for fractal cases.
  const grouped = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const f of files) {
      if (f.endsWith(".cho")) continue;
      const top = f.includes("/") ? f.slice(0, f.indexOf("/")) : "(root)";
      const list = g.get(top) ?? [];
      list.push(f);
      g.set(top, list);
    }
    return g;
  }, [files]);

  const sortedTops = Array.from(grouped.keys()).sort((a, b) => {
    // system/ → constant/ → everything else alphabetical
    const rank = (k: string) => (k === "system" ? 0 : k === "constant" ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  // Per-group collapse state.  All expanded by default; clicking the
  // chevron of a sector folder collapses its files away so the student
  // can focus on system/ + constant/ without scrolling around DRYING's
  // half-dozen sub-folders.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  return (
    <Stack gap={0} p="xs">
      <Text size="xs" c="dimmed" tt="uppercase" mb={6}
        style={{ letterSpacing: 0.5, fontWeight: 600 }}>
        Files
      </Text>
      {sortedTops.map((top) => {
        const isCollapsed = collapsed.has(top);
        return (
          <Stack key={top} gap={0} mb={4}>
            <Group
              gap={4}
              wrap="nowrap"
              style={{ cursor: "pointer", padding: "4px 4px 2px" }}
              onClick={() => toggle(top)}
            >
              <ActionIcon
                variant="transparent"
                size="xs"
                c="dimmed"
                onClick={(e) => { e.stopPropagation(); toggle(top); }}
              >
                {isCollapsed
                  ? <IconChevronRight size={12} />
                  : <IconChevronDown size={12} />}
              </ActionIcon>
              <Text
                size="xs"
                c={top === "system" || top === "constant" ? "yellow" : "accent"}
                fw={600}
                ff="monospace"
              >
                {top}/
              </Text>
            </Group>
            {!isCollapsed && grouped.get(top)!.map((f) => {
              const leaf = top === "(root)" ? f : f.slice(top.length + 1);
              const isActive = f === active;
              return (
                <Group
                  key={f}
                  gap={6}
                  wrap="nowrap"
                  style={{
                    cursor: "pointer",
                    padding: "2px 8px 2px 26px",
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
            })}
          </Stack>
        );
      })}
    </Stack>
  );
}
