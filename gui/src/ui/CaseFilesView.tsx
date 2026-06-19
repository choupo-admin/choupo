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
  Case tab.  Read-only viewer of the case's dictionary files (system/ +
  constant/), with their ORIGINAL text and comments intact.  This is the
  glass-box made literal: every keyword, K-value and operating parameter
  the solver reads is visible here, alongside the run log and results.

  Per the project's "GUI is a runner, not an editor" stance, this view
  never edits --- cases are authored as text on disk.  Light dict
  syntax highlighting (comments / numbers / leading keyword) keeps
  it readable without any external highlighter dependency.
\*---------------------------------------------------------------------------*/

import { ScrollArea, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";

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

// Line-by-line dict highlighter, tracking /*... */ block comments.
function highlightFoam(text: string): string {
  const lines = text.split("\n");
  let inBlock = false;
  return lines
.map((line) => {
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end >= 0) {
          inBlock = false;
          return (
            `<span class="hl-c">${esc(line.slice(0, end + 2))}</span>` +
            hlCode(line.slice(end + 2))
          );
        }
        return `<span class="hl-c">${esc(line)}</span>`;
      }
      const b = line.indexOf("/*");
      const l = line.indexOf("//");
      if (l >= 0 && (b < 0 || l < b)) {
        return (hlCode(line.slice(0, l)) + `<span class="hl-c">${esc(line.slice(l))}</span>`
        );
      }
      if (b >= 0) {
        const after = line.slice(b);
        const end = after.indexOf("*/");
        if (end >= 0) {
          return (hlCode(line.slice(0, b)) +
            `<span class="hl-c">${esc(after.slice(0, end + 2))}</span>` +
            hlCode(after.slice(end + 2))
          );
        }
        inBlock = true;
        return hlCode(line.slice(0, b)) + `<span class="hl-c">${esc(after)}</span>`;
      }
      return hlCode(line);
    })
.join("\n");
}

// system/ before constant/, controlDict/flowsheetDict naturally first.
function orderFiles(paths: string[]): string[] {
  const rank = (p: string) => (p.startsWith("system/") ? 0 : 1);
  return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function CaseFilesView() {
  const caseFiles = useStore((s) => s.caseFiles);
  const raw = caseFiles.rawFiles ?? {};
  const files = useMemo(() => orderFiles(Object.keys(raw)), [raw]);
  const [selected, setSelected] = useState<string | null>(null);

  // Default selection: flowsheetDict / propsDict, else first file.
  const active =
    selected && raw[selected] !== undefined
      ? selected
    : files.find((f) => /flowsheetDict|propsDict$/.test(f)) ?? files[0] ?? null;

  if (files.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">
          No case files to show.
        </Text>
      </Stack>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <style>{`
.hl-c { color: #6b7785; font-style: italic; }
.hl-n { color: #e8a661; }
.hl-k { color: #4dd0c0; }
      `}</style>
      {/* File list */}
      <ScrollArea
        type="hover"
        style={{
          width: 230,
          flexShrink: 0,
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        }}
      >
        <Stack gap={1} p={6}>
          {files.map((f) => (
            <Text
              key={f}
              size="xs"
              ff="monospace"
              onClick={() => setSelected(f)}
              style={{
                cursor: "pointer",
                padding: "3px 8px",
                borderRadius: 4,
                color:
                  f === active
                    ? "light-dark(var(--mantine-color-accent-7), var(--mantine-color-accent-3))"
                  : "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))",
                background:
                  f === active ? "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))" : "transparent",
              }}
            >
              {f}
            </Text>
          ))}
        </Stack>
      </ScrollArea>
      {/* Viewer */}
      <ScrollArea type="auto" style={{ flex: 1, minWidth: 0 }}>
        <pre
          style={{
            margin: 0,
            padding: "10px 14px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
            background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-9))",
            whiteSpace: "pre",
            minHeight: "100%",
          }}
          dangerouslySetInnerHTML={{
            __html: active ? highlightFoam(raw[active] ?? "") : "",
          }}
        />
      </ScrollArea>
    </div>
  );
}
