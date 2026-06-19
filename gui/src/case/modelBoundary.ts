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
  Model-boundary <-> stream name matching ("information follows the streams").

  The model-boundary audit names streams in the solver's FLATTENED form
  (e.g. "cryst2.finalLiquor") while a canvas edge label may carry the bare
  authored form ("finalLiquor") -- or vice versa on a fractal case.  These
  pure helpers resolve an audit entry for an edge / selected stream so the
  badge and the selection-card row appear AT the stream the audit names.

  Matching is deliberately narrower than findRunStream's leaf-vs-leaf
  heuristic: exact name first, then the suffix-after-last-separator of the
  NAMESPACED side against the bare side only -- two sectors may both own an
  "out", and a boundary badge on the wrong sector's stream would lie.
\*---------------------------------------------------------------------------*/

/** The part after the last "." or "/" (the whole string when un-namespaced).
 *  Connections may namespace with either separator (toGraph uses "/",
 *  the flattened solver output uses "."). */
function leafOf(s: string): string {
  return s.slice(Math.max(s.lastIndexOf("."), s.lastIndexOf("/")) + 1);
}

/** True when a model-boundary entry's stream name designates this edge /
 *  stream name: exact match, else one side's leaf equals the other side
 *  (bare vs namespaced form of the same stream). */
export function boundaryStreamMatches(entryStream: string, edgeStream: string): boolean {
  if (entryStream === edgeStream) return true;
  return leafOf(entryStream) === edgeStream || entryStream === leafOf(edgeStream);
}

/** Find the model-boundary entry for a stream name (exact matches win over
 *  suffix fallbacks across the whole list).  Generic over the entry shape so
 *  this stays import-light (no adapter dependency). */
export function boundaryForStream<T extends { stream: string }>(
  boundaries: readonly T[] | undefined,
  streamName: string,
): T | undefined {
  if (!boundaries || boundaries.length === 0 || !streamName) return undefined;
  return (
    boundaries.find((b) => b.stream === streamName) ??
    boundaries.find((b) => boundaryStreamMatches(b.stream, streamName))
  );
}
