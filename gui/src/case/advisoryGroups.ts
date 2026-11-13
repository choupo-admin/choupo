/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * advisoryGroups -- the Streams view's advisory band groups the engine's
 * advisories of one KIND into one line with a count (rehearsal 2026-11-13:
 * the reactive column opened on 35 lines of the same provenance notice).
 *
 * THE KEY is what the engine publishes on every advisory record -- its
 * `category` (and `severity`, so a warning is never folded into a group of
 * notices) -- and never a reading of the sentence.  The texts are the
 * engine's, verbatim, listed behind the group's disclosure; nothing is
 * dropped and nothing is reworded.  Groups keep the order of their first
 * appearance.
 */

import type { Advisory } from "../adapters/SolverAdapter.js";

export interface AdvisoryGroup {
  category: string;
  severity: string;
  items: Advisory[];
}

/** The loci shown on a group's line before "..." (a published field, not a
 *  parse of the message). */
export const GROUP_LOCI_SHOWN = 3;

export function groupAdvisories(advisories: readonly Advisory[]): AdvisoryGroup[] {
  const out: AdvisoryGroup[] = [];
  const at = new Map<string, AdvisoryGroup>();
  for (const a of advisories) {
    const key = `${a.category}\u0000${a.severity}`;
    let g = at.get(key);
    if (!g) {
      g = { category: a.category, severity: a.severity, items: [] };
      at.set(key, g);
      out.push(g);
    }
    g.items.push(a);
  }
  return out;
}

/** The distinct loci of a group, in order, for its one line. */
export function groupLoci(g: AdvisoryGroup): string[] {
  const seen = new Set<string>();
  const loci: string[] = [];
  for (const a of g.items) {
    if (a.locus && !seen.has(a.locus)) { seen.add(a.locus); loci.push(a.locus); }
  }
  return loci;
}
