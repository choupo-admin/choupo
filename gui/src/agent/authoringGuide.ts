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
  authoringGuide -- the case-authoring knowledge (docs/ai), bundled ONCE into
  the app (option (a): knowledge in the tool, not per-case).  Concatenated in
  the llmctx reading order.  Used by the clipboard bridge to ship the agent its
  knowledge inside the copied context, so a student's OWN claude.ai is "born
  taught" -- no install, any OS, no backend.
\*---------------------------------------------------------------------------*/

// Eager raw-string glob over docs/ai (one copy in the bundle, ~97 KB).
const DOCS = import.meta.glob("../../../docs/ai/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Fixed reading order (matches bin/llmctx).
const ORDER = [
  "overview", "dict-syntax", "case-layout", "thermo",
  "unit-ops", "components", "patterns", "pitfalls", "consistency",
];

export function authoringGuide(): string {
  let out = "";
  for (const name of ORDER) {
    const key = Object.keys(DOCS).find((k) => k.endsWith(`/${name}.md`));
    if (key) out += `\n<!-- docs/ai/${name}.md -->\n${DOCS[key]}\n`;
  }
  return out;
}
