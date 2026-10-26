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
  HOW TO CITE (DEV.md 4c C171 B) -- the GUI's reader of the one citation.

  Three sources, each with its own home, and none of them copied here:
    * CITATION.cff, reached ONLY through ../help/citation.generated.ts
      (written from it by bin/curate/gen_citation.py -- every sentence of the text,
      with @PLACEHOLDERS@);
    * the open case's primary sources, the `citations ( "..." );` list of
      its system/controlDict -- a DECLARED field, never prose comments (the
      word is `citations` because a propsDict's `references` already means
      reference DATASETS: one word, one meaning);
    * the engine version and commit this page runs, the WASM build's
      wasm/version.json stamp (./engineVersion.ts, the status bar's reading).

  The substitution is the engine's (src/core/Citation.cpp compose), the same
  literal replacements in the same order; gui/tests/citation.test.ts holds
  this to a native run's own `citation.text`.  What a user sees in Help,
  in a case's About and in a downloaded case's CITATION.txt is THIS text.

  PURE (vitest runs without a DOM): the Help modal, the About sections and
  the zip all call `citationText`; none of them formats a citation itself.
\*---------------------------------------------------------------------------*/

import { CITATION_TEMPLATE as T } from "../help/citation.generated.js";
import type { JsonDict } from "../dict/index.js";
import type { EngineVersion } from "./engineVersion.js";

/** What a case declares: its citations, or why they cannot be read (the
 *  engine refuses the same list by name when the case runs). */
export interface CaseCitations {
  citations: string[];
  problem?: string;
}

/** The case's `citations` from its controlDict -- absent = none declared. */
export function caseCitations(controlDict: JsonDict | null | undefined): CaseCitations {
  const v = controlDict?.["citations"];
  if (v === undefined || v === null) return { citations: [] };
  if (!Array.isArray(v) || v.some((r) => typeof r !== "string")) {
    return {
      citations: Array.isArray(v) ? v.filter((r): r is string => typeof r === "string") : [],
      problem: "system/controlDict: `citations` must be a list of quoted primary sources, "
        + "one per entry; the engine refuses this case's list when it runs.",
    };
  }
  const cites = v as string[];
  const empty = cites.findIndex((r) => r.trim() === "");
  if (empty >= 0) {
    return {
      citations: cites.filter((r) => r.trim() !== ""),
      problem: `system/controlDict: \`citations\` entry ${empty + 1} is empty; `
        + "the engine refuses it when the case runs.",
    };
  }
  return { citations: cites };
}

/** The one literal replacement the engine makes: every occurrence, left to
 *  right, never re-scanning the inserted text. */
function sub(s: string, key: string, value: string): string {
  return s.split(key).join(value);
}

/** The citation text.  `citations` null = no case open (no case section, and
 *  a footer that names no controlDict); [] = a case that declares none
 *  (said).  `engine` null = this page found no engine version stamp (said,
 *  never guessed). */
export function citationText(citations: readonly string[] | null,
  engine: EngineVersion | null): string {
  const eng = !engine || !engine.version
    ? T.ENGINE_UNKNOWN
    : engine.commit
      ? sub(sub(T.ENGINE_WITH_COMMIT, "@VERSION@", engine.version), "@COMMIT@", engine.commit)
      : sub(T.ENGINE_NO_COMMIT, "@VERSION@", engine.version);
  let casePart: string = T.NO_CASE;
  if (citations && citations.length === 0) casePart = T.CASE_NO_CITATIONS;
  else if (citations) {
    const lines = citations
      .map((c, i) => sub(sub(T.CITATION_LINE, "@N@", String(i + 1)), "@CITATION@", c))
      .join("\n");
    casePart = sub(T.CASE_CITATIONS, "@CITATIONS@", lines);
  }
  return sub(sub(T.DOCUMENT, "@ENGINE@", eng), "@CASE@", casePart);
}

/** The file a downloaded case carries beside its folders. */
export const CITATION_FILE = "CITATION.txt";
