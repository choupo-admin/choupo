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
  caseTeaching -- make a downloaded case "born taught" for ANY local AI agent,
  vendor-neutral and offline.

  Written INTO the case (the .zip the student takes to their PC):
    ai/choupo-authoring.md   the authoring RULES (the docs/ai guide) -- LOCAL,
                             so the agent never needs the network to author.
    AGENTS.md                thin brief, the cross-vendor standard (Cursor /
                             Aider / Zed / ...) -- points at ai/.
    CLAUDE.md                the same brief for Claude Code.

  The heavy MANUALS (theory / user PDFs) are NOT bundled (MBs); the brief tells
  the agent to look LOCALLY first (a Choupo repo's docs/) and only then fetch
  them from the site -- so authoring works with the site down / offline.
\*---------------------------------------------------------------------------*/

import { authoringGuide } from "../agent/authoringGuide.js";

/** Where the served manuals live -- the site's own origin at runtime, so it is
 *  right whether served locally, from the tailnet, or from choupo.org. */
function manualsBase(): string {
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    return location.origin;
  }
  return "https://choupo.org";
}

function brief(): string {
  const site = manualsBase();
  return [
    "# Choupo case — authoring brief (for any AI assistant)",
    "",
    "You are helping AUTHOR this Choupo case: plain-text \"dicts\" under `system/`",
    "and `constant/`. Choupo is a glass-box chemical process simulator. The USER",
    "decides; you ENACT via dict edits (and say what you changed).",
    "",
    "## Read this first",
    "The full authoring rules — dict syntax, **MANDATORY units on every scalar**,",
    "the unit-op catalogue, patterns, pitfalls, and the valid component names —",
    "are in **`ai/choupo-authoring.md`**, right here in this case. It is local and",
    "self-sufficient: you can author the whole case from it with NO network.",
    "Do not invent components or unit-op types — use the catalogue there.",
    "",
    "## Running the case",
    "- Run: `runCase <this case>` (or open it in the Choupo GUI and click Run).",
    "- If the case has a `code/` folder (a custom C++ unit op / property method),",
    "  compile it first with `bin/buildCode <case>` (needs the Choupo repo + g++).",
    "",
    "## Deeper manuals (reference — NOT required to author)",
    "The theory + user guides are big PDFs, so they are NOT bundled here. Find them:",
    "  1. LOCALLY first — if a Choupo repo is on this machine, they are at",
    "     `<repo>/docs/theoryGuide.pdf` and `<repo>/docs/userGuide.pdf`",
    "     (run `find / -name theoryGuide.pdf 2>/dev/null` if unsure where).",
    `  2. Otherwise from the site: ${site}/docs/theoryGuide.pdf , ${site}/docs/userGuide.pdf`,
    "  The rules in `ai/choupo-authoring.md` are enough to author; the manuals are",
    "  deeper reading for the human, not needed for you to write the dicts.",
    "",
    "## Source of truth",
    "The dicts on disk ARE the truth. Keep this brief + `ai/` with the case.",
  ].join("\n");
}

/** The teaching files to add to a case (keyed by case-relative path). */
export function caseTeachingFiles(): { [relPath: string]: string } {
  const b = brief();
  return {
    "ai/choupo-authoring.md": authoringGuide(),
    "AGENTS.md": b,
    "CLAUDE.md": b,
  };
}
