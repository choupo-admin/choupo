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
  STALENESS -- does the drawn result still belong to the case in front of me?

  WHY IT EXISTS.  On 2026-09-06 Vítor opened the delivered app, ran a case,
  and asked what happens to the numbers on screen once he moves a knob.  The
  answer was: nothing.  The flowsheet went on drawing the previous solve, at
  full strength, beside a Run control that looked exactly as it had before --
  and a result that looks current IS read as current.  DECIDED: the result
  surfaces DIM, and the Run control carries the count of pending edits.  In a
  teaching tool an annotated stale number is still read as a number; dimming
  forces the eye to stop.

  WHAT THIS IS, AND -- said plainly -- WHAT IT IS NOT.  It is a FINGERPRINT of
  the declared case, stamped on the result when a run completes and compared
  with the fingerprint of what is declared now.  It is NOT a dependency
  analysis: it cannot tell which numbers a given edit actually invalidates, so
  it dims ALL of them or NONE of them.  Changing a reflux ratio and changing a
  costing coefficient are the same event to it.  That is the honest reading --
  a per-value staleness claim would be a claim about a dependency graph this
  project does not have, and inventing one is worse than dimming a number that
  happened to survive the edit.

  WHAT IT COVERS.  Everything the solver is handed: the parsed dicts, the
  case-local files, and the transient scratch overlay applied on top.  Two
  things are excluded because they are NOT physics, and both would otherwise
  raise a false alarm on an ordinary session:
    * `rawFiles` -- the same content again as text, comments included.  A
      comment is not physics; hashing it would make every re-read of an
      unchanged file look like an edit.
    * the `.cho` MARKER, which is the GUI's home for the saved canvas layout.
      The canvas auto-saves it on every node drag, and on a local case the
      bridge watcher then swaps the refreshed files back into the store -- so
      hashing it would dim a perfectly current result because somebody moved
      a box.

  WHAT IT DOES NOT COVER, deliberately: the two things the RUN adds on its
  way to the solver -- the display preset spliced into controlDict, and a
  drilled sector's boundary state frozen from the previous run.  Neither is a
  declaration a student made; folding them in would make a unit change read as
  a stale result, and a warning that fires on nothing is a warning nobody
  reads.  The stamp is therefore taken from the same object this module
  fingerprints later: the case with the scratch overlay applied, and nothing
  else.

  ABSENCE MEANS NO CLAIM.  With no result, or with a result nobody stamped
  (a drilled-in tab inherits its parent's), the answer is "not stale" -- this
  module never manufactures a verdict it has no evidence for.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { ScratchEdits } from "./scratch.js";

/** What a run was given, reduced to what a later comparison needs. */
export interface RunInputs {
  /** Fingerprint of the case AS RUN (dicts + case-local files + the scratch
   *  overlay already applied). */
  fingerprint: string;
  /** The scratch overlay as run, path -> serialised value.  Kept beside the
   *  fingerprint for ONE purpose: counting the knobs a student has moved
   *  since.  It is a count of EDITS (inputs), never a claim about which
   *  outputs they touched. */
  edits: { [path: string]: string };
}

export interface Staleness {
  /** The drawn result does not belong to what is declared now. */
  stale: boolean;
  /** How many scratch knobs differ from the ones the run was given.  0 with
   *  `stale` true is a real state: the case FILES changed under an unmoved
   *  overlay, and the control then says the result is stale without claiming
   *  a count it does not have. */
  pendingEdits: number;
}

/** Stable stringify: object keys in sorted order, so two structurally equal
 *  cases fingerprint the same however their parsers happened to order them. */
function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

/** FNV-1a, 32 bit, as 8 hex digits.  A fingerprint here answers exactly one
 *  question -- "is this the same input?" -- and a collision costs a result
 *  that stays bright when it should have dimmed; it is not a security claim
 *  and does not need to be a cryptographic hash. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Fingerprint a case exactly as the solver receives it, minus the two
 *  non-physical carriers named in the header. */
export function fingerprintCase(files: CaseFiles): string {
  const { rawFiles: _ignored, extraFiles, ...solved } = files;
  const physical = extraFiles
    ? Object.fromEntries(Object.entries(extraFiles).filter(([rel]) => !rel.endsWith(".cho")))
    : undefined;
  return fnv1a(stable(physical && Object.keys(physical).length ? {...solved, extraFiles: physical } : solved));
}

/** The stamp to keep beside a result.  `applied` must be the case the solver
 *  was actually handed (the scratch overlay already applied), and `edits` the
 *  overlay that produced it. */
export function runInputsOf(applied: CaseFiles, edits: ScratchEdits): RunInputs {
  const flat: { [path: string]: string } = {};
  for (const [path, e] of Object.entries(edits)) flat[path] = `${e.value}${e.unit ? ` ${e.unit}` : ""}`;
  return { fingerprint: fingerprintCase(applied), edits: flat };
}

/** Compare what is declared now against what the drawn result was given.
 *  `hasResult` is passed rather than inferred so this stays free of the
 *  store's shape. */
export function stalenessOf(current: RunInputs,
                            ran: RunInputs | null | undefined,
                            hasResult: boolean): Staleness {
  if (!hasResult || !ran) return { stale: false, pendingEdits: 0 };
  if (current.fingerprint === ran.fingerprint) return { stale: false, pendingEdits: 0 };
  let pendingEdits = 0;
  for (const k of new Set([...Object.keys(current.edits), ...Object.keys(ran.edits)]))
    if (current.edits[k] !== ran.edits[k]) pendingEdits++;
  return { stale: true, pendingEdits };
}
