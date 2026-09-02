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
  Lesson -- draws a case's README.md as parsed by case/lesson.ts.

  Plain elements with the workspace's own colours; headings carry
  `id="ln-<line>"` (the README's own line number) so the Case view's outline
  can jump to them exactly as it jumps to a dict key.  A README outside the
  rendering subset is shown as the refusal it raised, in place, naming the
  line -- never as a half-drawn page.
\*---------------------------------------------------------------------------*/

import { Text } from "@mantine/core";
import { useMemo } from "react";

import { parseLesson, type Block, type Inline, type ListItem } from "../case/lesson.js";

const CODE_BG = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))";
const BORDER = "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))";
const INK = "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))";

function Inlines({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((r, i) => {
        switch (r.t) {
          case "code":
            return (
              <code key={i} style={{
                fontFamily: "JetBrains Mono, monospace", fontSize: "0.92em",
                background: CODE_BG, padding: "0 4px", borderRadius: 3,
              }}>{r.s}</code>
            );
          case "bold": return <b key={i}><Inlines runs={r.runs} /></b>;
          case "em":   return <i key={i}>{r.s}</i>;
          default:     return <span key={i}>{r.s}</span>;
        }
      })}
    </>
  );
}

function Items({ items, ordered, start }: { items: ListItem[]; ordered: boolean; start: number }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag start={ordered ? start : undefined} style={{ margin: "4px 0 8px 0", paddingLeft: 24 }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: 4 }}>
          <Inlines runs={it.inlines} />
          {it.children && <Items items={it.children} ordered={false} start={1} />}
        </li>
      ))}
    </Tag>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading": {
      const size = b.level === 1 ? 18 : b.level === 2 ? 15 : 13.5;
      return (
        <div id={`ln-${b.line}`} style={{
          fontWeight: 700, fontSize: size, margin: b.level === 1 ? "0 0 8px 0" : "16px 0 6px 0",
          lineHeight: 1.25,
        }}>
          <Inlines runs={b.inlines} />
        </div>
      );
    }
    case "paragraph":
      return <p style={{ margin: "0 0 8px 0" }}><Inlines runs={b.inlines} /></p>;
    case "list":
      return <Items items={b.items} ordered={b.ordered} start={b.start} />;
    case "code":
      return (
        <pre style={{
          fontFamily: "JetBrains Mono, monospace", fontSize: 12, lineHeight: 1.5,
          background: CODE_BG, border: BORDER, borderRadius: 6, padding: "8px 10px",
          overflowX: "auto", margin: "4px 0 10px 0",
        }}>{b.text}</pre>
      );
    case "table":
      return (
        <div style={{ overflowX: "auto", margin: "4px 0 10px 0" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>{b.header.map((c, i) => (
                <th key={i} style={{ border: BORDER, padding: "3px 8px", textAlign: "left" }}><Inlines runs={c} /></th>
              ))}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => (
                  <td key={j} style={{ border: BORDER, padding: "3px 8px" }}><Inlines runs={c} /></td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Lesson({ md }: { md: string }) {
  const parsed = useMemo<{ blocks: Block[] } | { error: string }>(() => {
    try { return { blocks: parseLesson(md) }; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [md]);
  if ("error" in parsed) {
    return (
      <Text size="sm" c="red" data-lesson-refused="1">
        This lesson cannot be shown: {parsed.error}.  Open README.md in the
        case folder to read it as text.
      </Text>
    );
  }
  return (
    <div data-lesson="1" style={{ fontSize: 13.5, lineHeight: 1.55, color: INK, maxWidth: 720 }}>
      {parsed.blocks.map((b, i) => <BlockView key={i} b={b} />)}
    </div>
  );
}
