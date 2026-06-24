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
  Help-topics pop-out: open a SEPARATE browser tab listing every indexed help
  topic (unit operations, workspaces, algorithms/solvers) as a deep link into
  the theory/user/props guides.  Each link targets the PDF named destination
  (`<guide>.pdf#nameddest=<anchor>`) so the student lands on the exact section
  that derives that topic.

  This is a VIEWER, not an editor surface (GUI credo): it only renders the
  tracked `docs/help-index.json` as a clickable table of contents and opens the
  guide.  Same Blob+anchor technique as the file / streams pop-outs, so it
  bypasses the popup blocker.
\*---------------------------------------------------------------------------*/

import { HELP_TOPICS, helpUrl, type HelpTopic } from "../help/helpMap.js";
import { popoutColors, openHtmlInNewTab } from "./filePopOut.js";

const GUIDE_LABEL: Record<string, string> = {
  theory: "Theory Guide",
  user: "User Guide",
  props: "Props Guide",
  developer: "Developer Guide",
};

/** Render the indexed help topics as a deep-linking table of contents in a
 *  new tab.  `baseUrl` is `import.meta.env.BASE_URL` (so links work at "/" in
 *  dev and under a deployed base like "/app"). */
export function popOutHelpTopics(baseUrl: string): void {
  const C = popoutColors();

  // Group the flat topic list by its bucket, preserving insertion order.
  const groups: Record<string, HelpTopic[]> = {};
  for (const t of HELP_TOPICS) (groups[t.group] ??= []).push(t);

  const sections = Object.entries(groups)
    .map(([group, topics]) => {
      const rows = topics
        .map((t) => {
          const href = helpUrl(t, baseUrl);
          const title = escText(t.title ?? t.id);
          const guide = GUIDE_LABEL[t.guide] ?? t.guide;
          return `<li><a href="${escAttr(href)}" target="_blank" rel="noopener">${title}</a>` +
            `<span class="guide">${escText(guide)}</span></li>`;
        })
        .join("");
      return `<h3>${escText(group)}</h3><ul>${rows}</ul>`;
    })
    .join("");

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<title>Choupo — Help topics</title>
<style>
  body { margin: 0; background: ${C.bg}; color: ${C.text};
         font-family: system-ui, sans-serif; }
  h2 { margin: 16px 24px 2px; font-size: 16px; font-weight: 500;
       color: ${C.accent}; }
  p.hint { margin: 0 24px 16px; font-size: 12px; color: ${C.dim}; }
  h3 { margin: 18px 24px 6px; font-size: 13px; font-weight: 600;
       color: ${C.textStrong}; text-transform: uppercase; letter-spacing: .04em; }
  ul { margin: 0 24px 8px; padding: 0; list-style: none; }
  li { display: flex; align-items: baseline; justify-content: space-between;
       gap: 12px; padding: 4px 10px; border-radius: 4px; }
  li:nth-child(odd) { background: ${C.panel}; }
  a { color: ${C.blue}; text-decoration: none; font-size: 13px; }
  a:hover { text-decoration: underline; }
  span.guide { color: ${C.dim}; font-size: 11px; white-space: nowrap; }
</style>
</head><body>
<h2>Choupo help topics</h2>
<p class="hint">Each topic links to the section of the glass-box guide that
derives it.  The guide opens in a new tab at that named destination.</p>
${sections}
</body></html>`;
  openHtmlInNewTab(html);
}

function escText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}
function escAttr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
