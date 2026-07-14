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
  Choupo GUI -- dict serializer

  Deterministic formatter: AST → Choupo dict text.

  Conventions
    - 4-space indent (matches the tutorials/ corpus)
    - Sub-dicts on new lines, contents indented
    - Inline scalar / word lists when short; one-element-per-line otherwise
    - Dict-lists always multi-line (each {...} on its own line, indented)
    - Numbers via String(n) -- already the shortest round-trippable form in JS

  Note: re-serialising a parsed dict may differ cosmetically (whitespace,
  comments, "1.0" -> "1") but the AST round-trip is exact.
\*---------------------------------------------------------------------------*/

import type { Dict, DictValue } from "./types.js";

const INDENT = "    ";
const INLINE_LIST_THRESHOLD = 12;

export interface SerializeOptions {
  /** Indent prefix to start with (rare; defaults to ""). */
  baseIndent?: string;
}

export function serialize(dict: Dict, opts: SerializeOptions = {}): string {
  const out: string[] = [];
  emitEntries(dict, opts.baseIndent ?? "", out);
  // Ensure trailing newline.
  const text = out.join("");
  return text.endsWith("\n") ? text : text + "\n";
}

function emitEntries(dict: Dict, indent: string, out: string[]): void {
  for (const { key, value } of dict.entries) {
    emitEntry(key, value, indent, out);
  }
}

function emitEntry(key: string,
  value: DictValue,
  indent: string,
  out: string[],
): void {
  switch (value.kind) {
    case "scalar":
      if (value.dimensions !== undefined) {
        out.push(
          `${indent}${key}    [${value.dimensions.map(fmtNumber).join(" ")}] ${fmtNumber(value.value)};\n`,
        );
      } else if (value.unit !== undefined && value.originalValue !== undefined) {
        out.push(
          `${indent}${key}    ${fmtNumber(value.originalValue)} ${value.unit};\n`,
        );
      } else {
        out.push(`${indent}${key}    ${fmtNumber(value.value)};\n`);
      }
      return;

    case "word":
      out.push(`${indent}${key}    ${fmtWord(value.value)};\n`);
      return;

    case "scalarList":
      emitScalarList(key, value.value, indent, out);
      return;

    case "wordList":
      emitWordList(key, value.value, indent, out);
      return;

    case "dict":
      out.push(`${indent}${key}\n${indent}{\n`);
      emitEntries(value.value, indent + INDENT, out);
      out.push(`${indent}}\n`);
      return;

    case "dictList":
      emitDictList(key, value.value, indent, out);
      return;

    case "reference":
      out.push(`${indent}${key}    $${value.name};\n`);
      return;
  }
}

function emitScalarList(key: string,
  items: number[],
  indent: string,
  out: string[],
): void {
  const inline = items.map(fmtNumber).join(" ");
  if (items.length <= INLINE_LIST_THRESHOLD) {
    out.push(`${indent}${key}    ( ${inline}${items.length ? " " : ""});\n`);
    return;
  }
  out.push(`${indent}${key}\n${indent}(\n`);
  for (const n of items) out.push(`${indent}${INDENT}${fmtNumber(n)}\n`);
  out.push(`${indent});\n`);
}

function emitWordList(key: string,
  items: string[],
  indent: string,
  out: string[],
): void {
  const inline = items.map(fmtWord).join(" ");
  if (items.length <= INLINE_LIST_THRESHOLD) {
    out.push(`${indent}${key}    ( ${inline}${items.length ? " " : ""});\n`);
    return;
  }
  out.push(`${indent}${key}\n${indent}(\n`);
  for (const w of items) out.push(`${indent}${INDENT}${fmtWord(w)}\n`);
  out.push(`${indent});\n`);
}

function emitDictList(key: string,
  items: Dict[],
  indent: string,
  out: string[],
): void {
  if (items.length === 0) {
    out.push(`${indent}${key}    ( );\n`);
    return;
  }
  out.push(`${indent}${key}\n${indent}(\n`);
  const inner = indent + INDENT;
  for (const sub of items) {
    out.push(`${inner}{\n`);
    emitEntries(sub, inner + INDENT, out);
    out.push(`${inner}}\n`);
  }
  out.push(`${indent});\n`);
}

function fmtNumber(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
  return String(n);
}

// Re-emit a word token.  Bare words may contain alnum + _. - + : / [ ]
// (the same set the tokenizer accepts).  Anything else -- spaces,
// punctuation, embedded quotes -- has to be re-quoted so the parser
// can read it back as a single Word.
function fmtWord(s: string): string {
  const bare = /^[A-Za-z0-9_.\-+:/\[\]]+$/;
  if (s !== "" && bare.test(s)) return s;
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
