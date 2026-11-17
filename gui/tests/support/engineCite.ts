// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
/*---------------------------------------------------------------------------*\
  engineCite -- resolve and hold a lesson's citation of the engine BY SYMBOL.

  DEV.md 4c C415 (1).  A citation is { file, symbol?, anchor?, contains }:

    symbol   `Function` or `Class::method`: the definition (a name followed
             by `(` ... `{` before any `;`) whose brace-matched body is the
             scope.
    anchor   a named marker the engine carries where no symbol fits:
             `// [anchor: name]` ... `// [/anchor: name]` (any comment leader);
             the lines between are the scope.
    neither  the whole file is the scope (a shell script, a header).
    contains a short fragment the lesson relies on: it must appear INSIDE the
             scope.  This is what holds the scientific content; the line
             number is derived (`resolveCite().line`), never written.

  A moved function still resolves.  A renamed one, or one whose quoted
  fragment is gone, does not -- and says which.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface EngineCite {
  readonly file: string;
  readonly symbol?: string;
  readonly anchor?: string;
  readonly contains: string;
}

export interface Resolved {
  /** 1-based line of the fragment (for a click-through); derived. */
  readonly line: number;
  readonly scopeStart: number;
  readonly scopeEnd: number;
}

/** Blank out comments and string/char literals so braces inside them do not
 *  count; keeps every newline so line numbers survive. */
function masked(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " "; i++;
      }
      out += "  "; i += 2;
    } else if (c === "\"" || c === "'") {
      out += c; i++;
      while (i < n && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        out += " "; i++;
      }
      if (i < n && src[i] === c) { out += c; i++; }
    } else { out += c; i++; }
  }
  return out;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 0-based [first, last] line indices of the body of `symbol`'s definition. */
function symbolScope(src: string, symbol: string): [number, number] | null {
  const m = masked(src);
  const re = new RegExp(`(^|[\\s*&])${escapeRe(symbol)}\\s*\\(`, "gm");
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m)) !== null) {
    let i = hit.index + hit[0].length;
    let paren = 1;
    while (i < m.length && paren > 0) {
      if (m[i] === "(") paren++;
      else if (m[i] === ")") paren--;
      i++;
    }
    // skip qualifiers / member-initialisers up to `{` or `;`
    while (i < m.length && m[i] !== "{" && m[i] !== ";") i++;
    if (m[i] !== "{") continue;                 // a declaration or a call
    const open = i;
    let depth = 0;
    for (; i < m.length; i++) {
      if (m[i] === "{") depth++;
      else if (m[i] === "}" && --depth === 0) break;
    }
    const lineOf = (k: number): number => m.slice(0, k).split("\n").length - 1;
    const start = lineOf(hit.index + hit[1]!.length);
    void open;
    return [start, lineOf(i)];
  }
  return null;
}

function anchorScope(lines: string[], name: string): [number, number] | null {
  const a = lines.findIndex((l) => l.includes(`[anchor: ${name}]`));
  const b = lines.findIndex((l) => l.includes(`[/anchor: ${name}]`));
  return a >= 0 && b > a ? [a, b] : null;
}

/** Resolve a citation against the tree rooted at `repo`; throws a message
 *  naming exactly what no longer holds. */
export function resolveCite(repo: string, c: EngineCite): Resolved {
  const path = join(repo, c.file);
  if (!existsSync(path)) throw new Error(`${c.file} does not exist`);
  const src = readFileSync(path, "utf-8");
  const lines = src.split("\n");
  let scope: [number, number] | null = [0, lines.length - 1];
  let what = c.file;
  if (c.anchor !== undefined) {
    scope = anchorScope(lines, c.anchor);
    what = `${c.file} anchor "${c.anchor}"`;
    if (!scope) throw new Error(`${what}: marker pair [anchor: ${c.anchor}] / [/anchor: ${c.anchor}] not found`);
  } else if (c.symbol !== undefined) {
    scope = symbolScope(src, c.symbol);
    what = `${c.file}#${c.symbol}`;
    if (!scope) throw new Error(`${what}: no definition of that symbol in the file`);
  }
  for (let k = scope[0]; k <= scope[1]; k++) {
    if (lines[k]!.includes(c.contains)) {
      return { line: k + 1, scopeStart: scope[0] + 1, scopeEnd: scope[1] + 1 };
    }
  }
  throw new Error(`${what}: the quoted fragment ${JSON.stringify(c.contains)} is not inside it (lines ${scope[0] + 1}-${scope[1] + 1})`);
}

/** How a page names a citation: file#symbol, file (anchor/whole-file scope
 *  shows the anchor); never a line number. */
export const citeLabel = (c: Pick<EngineCite, "file" | "symbol" | "anchor">): string =>
  c.symbol !== undefined ? `${c.file}#${c.symbol}`
    : c.anchor !== undefined ? `${c.file}#[${c.anchor}]` : c.file;
