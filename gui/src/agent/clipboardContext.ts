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
  clipboardContext -- the "clipboard bridge" between the Choupo GUI and the
  student's OWN claude.ai (their subscription).  No install, any OS, no backend.

  buildClaudeContext(): assembles a paste-ready package -- a preamble (role +
  the rules), the bundled docs/ai authoring guide (knowledge in the tool), the
  open case's files, the user's request, and a strict RETURN FORMAT so the reply
  can be parsed back.  The student pastes it into claude.ai.

  parseClaudeReply() / applyEdits(): take Claude's reply, pull out the edited
  files, validate the dict ones, and update the in-memory case (the GUI reflects
  the change; persist via download -- dicts on disk stay the source of truth).
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "../case/types.js";
import { authoringGuide } from "./authoringGuide.js";
import { parse } from "../dict/parser.js";
import { toJson } from "../dict/json.js";

// Delimiter the agent must use so we can parse edits back (NOT markdown fences
// -- those nest badly inside dict comments).
const FILE_RE = /=== FILE: (.+?) ===\r?\n([\s\S]*?)\r?\n=== END FILE ===/g;

const PREAMBLE = `You are helping AUTHOR a Choupo case (plain-text "dicts").  Choupo is an
educational glass-box chemical-process simulator; the dicts on disk are the
source of truth.  The user DECIDES; you ENACT -- never pick a model for them,
write what they ask, and keep every dimensional value with a UNIT.

Below are the current case's files and the user's request (the full Choupo
authoring guide was set up once in this Project).  When you change a file, return
its COMPLETE new content wrapped EXACTLY like this (one block per changed file,
no markdown fences):

=== FILE: <relative/path/within/the/case> ===
<the full new file content>
=== END FILE ===

Only emit a FILE block for files you actually changed.  Explain briefly above
the blocks WHY (the user must be able to defend the choice).`;

const RETURN_REMINDER = `--- Reply format: for each changed file emit a
"=== FILE: <path> ===" ... "=== END FILE ===" block with the full new content.`;

// ONE-TIME setup: the full Choupo authoring guide (~97 KB).  Paste this ONCE
// into a claude.ai Project (as a knowledge file) or the first message of a
// conversation -- NOT with every request.
export function buildGuideContext(): string {
  return [
    "# Choupo case-authoring guide (HOW THE SIMULATOR WORKS)",
    "You are an authoring agent for the Choupo process simulator.  Keep this as "
    + "ground truth.  In this Project you'll get a case + a request; you edit the "
    + "dicts and reply with the changed files (the format is restated each time).",
    authoringGuide(),
  ].join("\n\n");
}

// PER-REQUEST: just the open case's files + the request + the return format.
// Small (~few KB) -- assumes the guide above was set up once.
export function buildRequestContext(
  caseFiles: CaseFiles,
  caseName: string,
  question: string,
): string {
  const files = caseFiles.rawFiles ?? {};
  let dump = "";
  for (const [rel, body] of Object.entries(files)) {
    if (rel.endsWith(".cho")) continue;
    dump += `\n=== FILE: ${rel} ===\n${body}\n=== END FILE ===\n`;
  }
  return [
    PREAMBLE,
    `# The current case: ${caseName}`,
    dump.trim() || "(no files)",
    "# The user's request",
    question.trim() || "(the user will describe what they want)",
    RETURN_REMINDER,
  ].join("\n\n");
}

export interface ClaudeEdit { path: string; content: string; }

export function parseClaudeReply(text: string): ClaudeEdit[] {
  const out: ClaudeEdit[] = [];
  let m: RegExpExecArray | null;
  FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(text)) !== null) {
    out.push({ path: m[1]!.trim(), content: m[2]! });
  }
  return out;
}

// Map a relative path to the CaseFiles dict field it parses into (else raw).
const DICT_FIELD: Record<string, keyof CaseFiles> = {
  "system/flowsheetDict": "flowsheet",
  "system/propsDict": "propsDict",
  "constant/thermoPackage": "thermoPackage",
  "constant/reactions": "reactions",
  "system/controlDict": "controlDict",
  "system/solverDict": "solverDict",
  "system/outerDict": "outerDict",
  "system/postDict": "postDict",
};

export interface ApplyResult {
  next: CaseFiles;
  changed: string[];
  errors: string[];
}

export function applyEdits(caseFiles: CaseFiles, edits: ClaudeEdit[]): ApplyResult {
  const next: CaseFiles = {
   ...caseFiles,
    rawFiles: {...(caseFiles.rawFiles ?? {}) },
    extraFiles: {...(caseFiles.extraFiles ?? {}) },
  };
  const changed: string[] = [];
  const errors: string[] = [];

  for (const e of edits) {
    const field = DICT_FIELD[e.path];
    if (field) {
      // A known dict file -- validate by parsing before applying.
      try {
        const json = toJson(parse(e.content, { sourceName: e.path }));
        (next as unknown as Record<string, unknown>)[field] = json;
      } catch (err) {
        errors.push(`${e.path}: ${(err as Error).message}`);
        continue;
      }
    } else {
      // Anything else (constant/components, binaryPairs, experiments, ...):
      // keep as a raw passthrough file.
      next.extraFiles![e.path] = e.content;
    }
    next.rawFiles![e.path] = e.content;
    changed.push(e.path);
  }
  return { next, changed, errors };
}
