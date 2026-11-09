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
  Prompts pop-out (DEV.md 4c C252): Help > "Prompts for your AI assistant...".
  Opens the student prompt (one, C257) in a SEPARATE browser tab, each with a copy
  button.  The text is NOT written here: it is `help/prompts.generated.ts`,
  which bin/curate/prompts_home.py generates from docs/ai/prompts.md -- the one
  home that the landing and /llm/prompts.md also derive from.  A viewer, not an
  editor (GUI credo): same Blob+anchor technique as the help-topics pop-out, so
  it needs no new panel and no popup-blocker exemption.
\*---------------------------------------------------------------------------*/

import { PROMPTS } from "../help/prompts.generated.js";
import { popoutColors, openHtmlInNewTab } from "./filePopOut.js";

function escText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/** `code` spans of the source markdown, after escaping. */
function inline(s: string): string {
  return escText(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** The pop-out's document, as a string (exported for the test). */
export function promptsHtml(): string {
  const C = popoutColors();
  const intro = PROMPTS.intro.map((l) => `<p class="note">${inline(l)}</p>`).join("");
  const cards = PROMPTS.sections.map((s) =>
    `<h3>${inline(s.heading)}</h3>` +
    `<pre id="prompt">${escText(s.prompt)}</pre>` +
    `<button type="button" data-copy="prompt">Copy the prompt for your AI</button>` +
    s.notes.map((n) => `<p class="note">${inline(n)}</p>`).join("")).join("");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — Prompts for your AI assistant</title>
<style>
  body { margin: 0; padding: 0 24px 32px; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif; max-width: 900px; }
  h2 { margin: 16px 0 4px; font-size: 16px; font-weight: 500; color: ${C.accent}; }
  h3 { margin: 22px 0 6px; font-size: 14px; color: ${C.textStrong}; }
  p.note { margin: 6px 0; font-size: 13px; color: ${C.dim}; }
  pre { margin: 0 0 8px; padding: 12px 16px; background: ${C.panel}; color: ${C.textStrong};
        border-radius: 4px; font: 13px/1.5 'JetBrains Mono', Consolas, monospace;
        white-space: pre-wrap; overflow-wrap: anywhere; }
  button { font-size: 12px; padding: 4px 10px; cursor: pointer; }
  code { font-family: 'JetBrains Mono', Consolas, monospace; }
</style>
</head><body>
<h2>${escText(PROMPTS.title)}</h2>
${intro}
${cards}
<script>
  document.querySelectorAll("button[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.getElementById(b.getAttribute("data-copy"));
      if (el && navigator.clipboard) navigator.clipboard.writeText(el.textContent);
    });
  });
</script>
</body></html>`;
}

export function popOutPrompts(): void {
  openHtmlInNewTab(promptsHtml());
}
