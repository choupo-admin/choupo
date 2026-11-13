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
  homeFilter -- which tools (and which chapters) the EduTools home keeps for a
  query (DEV.md 4c C251).  Pure: it takes the hits of the ONE Find index
  (`searchEduTools`, eduToolsIndex.ts) and groups them by tool, so the home's
  field and the Find dialog share a matcher.  An empty query keeps every tool.
\*---------------------------------------------------------------------------*/

import type { EduHit } from "./eduToolsIndex.js";
import type { MethodToolId } from "./registry.js";

export interface HomeMatch {
  /** Tool ids kept, or null when the query is empty (keep everything). */
  tools: Set<MethodToolId> | null;
  /** For a tool matched only inside a lesson: the best chapter. */
  chapter: Map<MethodToolId, { title: string; key: string | null }>;
}

/** Hits come best-first; a tool's reason is its best chapter hit, if any. */
export function groupHits(hits: readonly EduHit[], query: string): HomeMatch {
  if (query.trim() === "") return { tools: null, chapter: new Map() };
  const tools = new Set<MethodToolId>();
  const chapter = new Map<MethodToolId, { title: string; key: string | null }>();
  for (const h of hits) {
    tools.add(h.doc.tool);
    if (h.doc.chapter && !chapter.has(h.doc.tool)) {
      chapter.set(h.doc.tool, { title: h.doc.chapter, key: h.doc.chapterKey });
    }
  }
  // A tool whose own row matched needs no chapter reason.
  for (const h of hits) if (h.doc.kind === "tool") chapter.delete(h.doc.tool);
  return { tools, chapter };
}
