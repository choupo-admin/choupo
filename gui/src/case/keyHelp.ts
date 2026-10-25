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
  keyHelp -- WHAT A KEY OF A CASE FILE MEANS, FOR F1 IN THE CASE TAB
  (DEV.md 4c C154).

  An external reviewer opened a membrane record, clicked the line
  `poreRadius 4.0e-10; // m`, pressed F1 and landed on the User Guide's
  generic chapter on the GUI: the Case tab's F1 knew the TAB, never the KEY.
  This module answers for the key: its meaning, its unit and the model it
  feeds, read from the ONE place that already documents the grammar -- an
  operation's or a unit's schema (gui/schemas/operations/), a record's schema
  (gui/schemas/records/, matched by the record's own `kind` word), the
  controlDict's schema -- and NEVER from a guess.  Where no schema documents
  the key, the answer is the help of the BLOCK that holds it, with its scope
  said ("no schema documents `x`; this is the help of the block ..."), and
  where nothing documents the block either, it says that.

  THE KEY IS FOUND WITH THE DICT'S OWN TOKENIZER (comments and strings
  handled as the parser handles them): the first key that starts a statement
  on the line, and the chain of blocks around it (`operations [] membrane`,
  `poreModel poreRadius`).  A line holding no key (a comment, a brace) is
  answered for its enclosing block.  Pure: no React, no store.
\*---------------------------------------------------------------------------*/

import { Tokenizer, type Token } from "../dict/tokenizer.js";
import type { JsonDict } from "../dict/index.js";
import { rawOperationSchema } from "./operationSchemas.js";
import { locatePropsBlocks } from "./propsDictLocate.js";
import { propsModelTheoryLink, propsOpHelpLink, theoryLink } from "./modelDocs.js";
import controlDictSchema from "../../schemas/controlDict.schema.json";

const RECORD_GLOB = import.meta.glob("../../schemas/records/*.schema.json", { eager: true }) as
  { [path: string]: unknown };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

export interface KeyAt {
  /** the key that starts a statement on the line; null = the line holds none */
  key: string | null;
  /** the blocks around it, outermost first; `[]` is an entry of a list */
  chain: string[];
}

/** The key on `line` (1-based) and the blocks around it. */
export function keyAtLine(text: string, line: number): KeyAt {
  const toks: Token[] = [];
  try {
    const tk = new Tokenizer(text, "case file");
    for (;;) { const t = tk.next(); if (t.kind === "end") break; toks.push(t); }
  } catch { return { key: null, chain: [] }; }
  const stack: { name: string; paren: boolean }[] = [];
  let atStart = true;
  let pending: string | null = null;
  let chainAtLine: string[] | null = null;
  for (let i = 0; i < toks.length; ++i) {
    const t = toks[i]!;
    if (t.line > line) break;
    const names = () => stack.map((f) => f.name).filter((n) => n !== "");
    if (t.line === line && chainAtLine === null) chainAtLine = names();
    const inParen = stack.length > 0 && stack[stack.length - 1]!.paren;
    if (t.kind === "word" && atStart && !inParen) {
      if (t.line === line) return { key: t.text, chain: names() };
      pending = t.text; atStart = false; continue;
    }
    if (t.kind === "lbrace") { stack.push({ name: inParen ? "[]" : pending ?? "", paren: false }); atStart = true; pending = null; continue; }
    if (t.kind === "lparen") { stack.push({ name: atStart ? "" : pending ?? "", paren: true }); pending = null; continue; }
    if (t.kind === "rbrace" || t.kind === "rparen") { stack.pop(); atStart = !(stack.length && stack[stack.length - 1]!.paren); pending = null; continue; }
    if (t.kind === "semi") { atStart = true; pending = null; continue; }
    atStart = false;
  }
  return { key: null, chain: chainAtLine ?? stack.map((f) => f.name).filter((n) => n !== "") };
}

export interface KeyHelp {
  file: string;
  line: number;
  key: string | null;
  chain: string[];
  /** what the answer is about: the key itself, its block, or only the file */
  scope: "key" | "block" | "file";
  /** the key or block the answer describes, as a reader names it */
  subject: string;
  title: string;
  description: string;
  unit: string;
  /** where the answer came from */
  source: string;
  /** the theory or reference section to open */
  guide?: { url: string; label: string };
}

const props = (n: Node): Node => (n && typeof n === "object" ? (n.properties ?? n.items?.properties ?? null) : null);

/** Walk a schema node by segments; returns the deepest node reached and how
 *  many segments it consumed. */
function walk(root: Node, segs: string[]): { node: Node; used: number } {
  let node = root;
  let used = 0;
  for (const s of segs) {
    const p = props(node);
    if (!p || !(s in p)) break;
    node = p[s]; used++;
  }
  return { node, used };
}

function fromSchema(base: Omit<KeyHelp, "scope" | "subject" | "title" | "description" | "unit">,
                    root: Node, segs: string[], rootLabel: string): KeyHelp {
  const { node, used } = walk(root, segs);
  const full = used === segs.length && segs.length > 0;
  const subject = full ? segs.join(".") : used > 0 ? segs.slice(0, used).join(".") : rootLabel;
  const title = String(node?.title ?? (used === 0 ? root?.title ?? rootLabel : segs[used - 1]));
  let description = String(node?.description ?? "");
  if (!full) {
    const missing = segs[used] ?? base.key ?? "";
    description = (missing
      ? `No schema documents \`${missing}\` here; this is the help of the ${used > 0 ? `block \`${subject}\`` : rootLabel}`
        + " that holds it.  "
      : "") + description;
  }
  return { ...base, scope: full ? "key" : "block", subject, title, description,
    unit: full ? String(node?.unit ?? "") : "" };
}

function recordSchemaFor(text: string): Node {
  const kind = /^\s*kind\s+([A-Za-z0-9_]+)\s*;/m.exec(text)?.[1];
  if (!kind) return null;
  for (const mod of Object.values(RECORD_GLOB)) {
    const s: Node = (mod as Node)?.default ?? mod;
    if (Array.isArray(s?.["x-choupo"]?.recordKinds) && s["x-choupo"].recordKinds.includes(kind)) return s;
  }
  return null;
}

/** F1's answer for `line` of the case file `file`.  `propsDict` /
 *  `flowsheet` are the parsed dicts (an operation's type is read from the
 *  declaration, never from the text around the line). */
export function keyHelp(file: string, text: string, line: number,
                        dicts: { propsDict?: JsonDict | null; flowsheet?: JsonDict | null } = {}): KeyHelp {
  const at = keyAtLine(text, line);
  const segs = [...at.chain.filter((c) => c !== "[]"), ...(at.key ? [at.key] : [])];
  const base = { file, line, key: at.key, chain: at.chain };

  //  an operation of the propsDict: its type's schema
  if (/(^|\/)system\/propsDict$/.test(file) && at.chain[0] === "operations") {
    const idx = locatePropsBlocks(text);
    let name = "";
    for (const [n, l] of idx.operations) if (line >= l.line && line <= l.endLine) name = n;
    const op = (Array.isArray(dicts.propsDict?.["operations"]) ? dicts.propsDict!["operations"] as Node[] : [])
      .find((o) => o?.name === name);
    const type = typeof op?.type === "string" ? op.type : "";
    const schema = type ? rawOperationSchema(type) : null;
    if (schema) {
      const h = fromSchema({ ...base, source: `the ${type} operation's schema (gui/schemas/operations/${type}.schema.json)`,
        guide: { url: propsOpHelpLink(type), label: `the ${type} operation in the guides` } },
        schema, segs.slice(1), `operation ${name} (${type})`);
      return h;
    }
  }
  //  a unit of the flowsheetDict: its type's schema
  if (/(^|\/)system\/flowsheetDict$/.test(file) && at.chain[0] === "units") {
    const types = [...text.matchAll(/^\s*type\s+([A-Za-z0-9_]+)\s*;/gm)];
    let type = "";
    for (const m of types) if (text.slice(0, m.index).split("\n").length <= line) type = m[1]!;
    const schema = type ? rawOperationSchema(type) : null;
    if (schema)
      return fromSchema({ ...base, source: `the ${type} unit's schema (gui/schemas/operations/${type}.schema.json)`,
        guide: { url: theoryLink(type), label: `the theory of ${type}` } }, schema, segs.slice(1), `unit ${type}`);
  }
  if (/(^|\/)system\/controlDict$/.test(file))
    return fromSchema({ ...base, source: "the controlDict schema (gui/schemas/controlDict.schema.json)" },
      controlDictSchema as Node, segs, "controlDict");
  //  a record: the schema its `kind` names
  const rec = recordSchemaFor(text);
  if (rec) {
    const feeds = rec["x-choupo"]?.feeds as string | undefined;
    const url = feeds ? propsModelTheoryLink(feeds) : null;
    return fromSchema({ ...base, source: `the ${rec.title} grammar (gui/schemas/records/, read by the engine's own reader)`,
      ...(url ? { guide: { url, label: `the theory of ${feeds}` } } : {}) }, rec, segs, String(rec.title ?? "record"));
  }
  return { ...base, scope: "file", subject: file, title: file, unit: "",
    description: `No schema in the GUI documents the keys of ${file}${at.key ? ` (this line's key is \`${at.key}\`)` : ""}.  `
      + "The file's own comments are its documentation; the engine that reads it refuses a key it does not know.",
    source: "none" };
}
