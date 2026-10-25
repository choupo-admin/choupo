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
  propsDictLocate -- WHERE IN system/propsDict A NAMED BLOCK IS WRITTEN
  (DEV.md 4c C151).

  Every operation, view and reference a props case declares is one `{ name
  <word>; ... }` entry of a top-level list (`operations`, `views`,
  `references`).  The review screen and the calculation map link each of them
  to its block in the Case tab, so a reader goes from a verdict or a figure to
  the lines that produced it in one click.  This module finds those lines with
  the dict's own TOKENIZER (comments and strings handled exactly as the parser
  handles them), so a `name` inside a comment or a quoted citation is never
  mistaken for the entry's own.

  It answers line numbers only: the 1-based line of the entry's `{` and the
  line of its closing `}`.  A name the file does not declare has no entry, and
  a file the tokenizer cannot read yields an empty index -- the link is then
  simply not offered, never pointed at a guess.
\*---------------------------------------------------------------------------*/

import { Tokenizer, type Token } from "../dict/tokenizer.js";

export type PropsListName = "operations" | "views" | "references";
export interface BlockLines { line: number; endLine: number }
export type PropsBlockIndex = Record<PropsListName, Map<string, BlockLines>>;

const LISTS: readonly PropsListName[] = ["operations", "views", "references"];

const opens = (t: Token) => t.kind === "lbrace" || t.kind === "lparen";
const closes = (t: Token) => t.kind === "rbrace" || t.kind === "rparen";

/** The line span of every named entry of the propsDict's three lists. */
export function locatePropsBlocks(text: string | undefined): PropsBlockIndex {
  const out: PropsBlockIndex = {
    operations: new Map(), views: new Map(), references: new Map(),
  };
  if (!text) return out;
  const toks: Token[] = [];
  try {
    const tk = new Tokenizer(text, "propsDict");
    for (;;) {
      const t = tk.next();
      if (t.kind === "end") break;
      toks.push(t);
    }
  } catch {
    return out;
  }
  //  `depth` counts both kinds of bracket: a top-level key sits at depth 0.
  let depth = 0;
  for (let i = 0; i < toks.length; ++i) {
    const t = toks[i]!;
    if (opens(t)) { ++depth; continue; }
    if (closes(t)) { --depth; continue; }
    if (depth !== 0 || t.kind !== "word") continue;
    const list = LISTS.find((l) => l === t.text);
    if (!list || toks[i + 1]?.kind !== "lparen") continue;
    //  Walk the list: each `{` at the list's own depth opens one entry.
    let j = i + 2;
    let d = 1;
    while (j < toks.length && d > 0) {
      const u = toks[j]!;
      if (u.kind === "lbrace" && d === 1) {
        const start = u.line;
        let e = 1;
        let k = j + 1;
        let name = "";
        for (; k < toks.length && e > 0; ++k) {
          const v = toks[k]!;
          if (opens(v)) ++e;
          else if (closes(v)) --e;
          else if (e === 1 && !name && v.kind === "word" && v.text === "name"
                   && toks[k + 1]?.kind === "word" && toks[k + 2]?.kind === "semi")
            name = toks[k + 1]!.text;
        }
        const end = toks[k - 1]?.line ?? start;
        if (name && !out[list].has(name)) out[list].set(name, { line: start, endLine: end });
        j = k;
        continue;
      }
      if (opens(u)) ++d;
      else if (closes(u)) --d;
      ++j;
    }
    //  j sits one past the list's `)`, which closed it: depth is 0 again.
    i = j - 1;
  }
  return out;
}
