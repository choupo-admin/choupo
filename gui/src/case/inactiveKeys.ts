/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  inactiveKeys -- THE KEYS A CASE DECLARES AND THE RUN DID NOT USE, MARKED
  INACTIVE IN THE CASE TAB (DEV.md 4c C154).

  The engine audits each operation's dictionary after the run and says, in
  one `[dict]` block of the log, which keys were "written and never read --
  they had NO effect on this run" (src/core/DictAudit.cpp `report`).  This
  module reads those lines back and finds, in the propsDict text, the line
  that declares each such key inside the operation named, so the Case tab
  can mark it.  It decides nothing itself: a key is inactive only because
  the engine said it was never read.

  Record values are a second source (the engine's structured fact): a value
  the engine reads from a RECORD on disk (a membrane record's `A_w` in a bench
  that imposes the flux) is not in the operation's dictionary, so the audit
  cannot see it; the op publishes it as `inactiveProperties` in its
  `operationResults` entry, and `inactiveRecordLines` marks the key's line in
  that record's file.
  Pure: no React, no store.
\*---------------------------------------------------------------------------*/

import { keyAtLine } from "./keyHelp.js";
import { locatePropsBlocks } from "./propsDictLocate.js";

export interface UnreadKey {
  /** the operation the engine named */
  operation: string;
  /** the blocks inside it, outermost first (`[]` when the key is directly in it) */
  blocks: string[];
  key: string;
}

const HEAD = /^\[dict\]\s+(\d+) key\(s\) written and never read/;
const ROW = /^\[dict\]\s{3}(propsDict operations\[\d+\] '([^']*)'(?: ([^:]*))?): `([^`]+)`/;

/** The unread keys of the operations of a propsDict, from the run's log. */
export function unreadKeysFromLog(log: string): UnreadKey[] {
  const out: UnreadKey[] = [];
  let inBlock = false;
  for (const raw of log.split("\n")) {
    const line = raw.trimEnd();
    if (HEAD.test(line)) { inBlock = true; continue; }
    if (!inBlock) continue;
    //  the block ends at the engine's footer ("the run CONTINUES ..."), or at any line that is not its own
    if (!line.startsWith("[dict]   ")) { inBlock = false; continue; }
    const m = ROW.exec(line);
    if (m) out.push({ operation: m[2]!, blocks: (m[3] ?? "").split(" ").filter((s) => s !== ""), key: m[4]! });
  }
  return out;
}

/** The 1-based lines of `propsDictText` that declare a key the run did not
 *  read, mapped to the engine's own words for it. */
export function inactiveLines(propsDictText: string, unread: readonly UnreadKey[]): Map<number, string> {
  const marks = new Map<number, string>();
  if (unread.length === 0) return marks;
  const ops = locatePropsBlocks(propsDictText).operations;
  const lines = propsDictText.split("\n").length;
  for (const u of unread) {
    const span = ops.get(u.operation);
    if (!span) continue;
    const want = u.blocks.join(" ");
    for (let l = span.line; l <= Math.min(span.endLine, lines); l++) {
      const at = keyAtLine(propsDictText, l);
      if (at.key !== u.key) continue;
      const chain = at.chain.filter((c) => c !== "[]" && c !== "operations").join(" ");
      if (chain === want) marks.set(l, `\`${u.key}\` is declared but the run never read it (the engine's own report): it had no effect on this run`);
    }
  }
  return marks;
}

/** The 1-based lines of a RECORD file (`membrane <name>`: a file whose path
 *  ends `<name>.dat`) that declare a property the engine reported inactive,
 *  mapped to the engine's own reason.  `source` is the engine's `membrane
 *  <name>`; only a top-level `key value;` line of that file is marked. */
export function inactiveRecordLines(
  filePath: string,
  text: string,
  facts: readonly { source: string; key: string; reason: string }[],
): Map<number, string> {
  const marks = new Map<number, string>();
  const lines = text.split("\n");
  for (const f of facts) {
    const name = f.source.split(/\s+/).pop() ?? "";
    if (name === "" || !filePath.endsWith(`/${name}.dat`) && filePath !== `${name}.dat`) continue;
    const re = new RegExp(`^\\s*${f.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`);
    lines.forEach((ln, i) => { if (re.test(ln)) marks.set(i + 1, `\`${f.key}\` is read from the record and not used in this run: ${f.reason}`); });
  }
  return marks;
}
