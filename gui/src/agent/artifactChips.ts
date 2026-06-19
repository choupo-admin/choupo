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
  artifactChips -- pure logic for the Assistant console's CSV-artifact chips.

  The bridge announces { type:"artifact", rel, size, mtimeMs } on the console
  socket whenever the in-case agent (or anything else) writes a .csv in the
  open case; the console shows a compact chip row ("sweep_results.csv · plot")
  above the terminal.  This module is the testable core: message guards + the
  chip-list reducer (latest first, dedupe by rel, keep the last MAX_CHIPS).
  No persistence -- chips die with the session.
\*---------------------------------------------------------------------------*/

export interface ArtifactChip {
  /** Case-relative path of the CSV (e.g. "sweep_results.csv"). */
  rel: string;
  /** Size in bytes (bridge-reported; display only). */
  size: number;
  /** mtime in ms (bridge-reported; identity of "this version"). */
  mtimeMs: number;
}

/** Chips kept: the last few only -- a console strip, not a file browser. */
export const MAX_CHIPS = 5;

/** Parse a ws message into an ArtifactChip, or null if it is not a
 *  well-formed artifact announcement. */
export function asArtifactMessage(m: unknown): ArtifactChip | null {
  if (typeof m !== "object" || m === null) return null;
  const r = m as Record<string, unknown>;
  if (r.type !== "artifact" || typeof r.rel !== "string" || r.rel.length === 0) return null;
  return {
    rel: r.rel,
    size: typeof r.size === "number" && Number.isFinite(r.size) ? r.size : 0,
    mtimeMs: typeof r.mtimeMs === "number" && Number.isFinite(r.mtimeMs) ? r.mtimeMs : 0,
  };
}

/** Parse a ws message into an artifact-content reply, or null. */
export function asArtifactContent(m: unknown): { rel: string; text: string } | null {
  if (typeof m !== "object" || m === null) return null;
  const r = m as Record<string, unknown>;
  if (r.type !== "artifactContent" || typeof r.rel !== "string" || typeof r.text !== "string") {
    return null;
  }
  return { rel: r.rel, text: r.text };
}

/** Parse a ws message into an artifact-error reply, or null. */
export function asArtifactError(m: unknown): { rel: string; error: string } | null {
  if (typeof m !== "object" || m === null) return null;
  const r = m as Record<string, unknown>;
  if (r.type !== "artifactError" || typeof r.rel !== "string") return null;
  return { rel: r.rel, error: typeof r.error === "string" ? r.error : "unknown error" };
}

/** Add (or refresh) a chip: latest first, deduped by rel, capped at
 *  MAX_CHIPS -- a rewritten CSV moves back to the front with its new mtime. */
export function pushChip(list: ArtifactChip[], chip: ArtifactChip): ArtifactChip[] {
  return [chip, ...list.filter((c) => c.rel !== chip.rel)].slice(0, MAX_CHIPS);
}

/** Dismiss one chip by rel. */
export function dismissChip(list: ArtifactChip[], rel: string): ArtifactChip[] {
  return list.filter((c) => c.rel !== rel);
}
