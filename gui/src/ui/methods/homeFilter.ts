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
