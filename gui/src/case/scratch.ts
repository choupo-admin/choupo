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
  The TINKERING scratch overlay.  A student may grab any numeric scalar shown
  in the Properties box and change it directly -- no need to declare a variable
  first (Vítor 2026-06-21: "without it, it's just AI").  The edits are TRANSIENT
  and LOUD: they live here as an in-memory overlay keyed by dict path, never
  written to disk; the case wears a persistent "tinkering -- not saved" badge
  while any edit exists, Run applies the overlay to the case JSON, and Reset
  snaps back to the file (the source of truth).

  This is the SAME no-save transient contract as the What-if clone+override,
  now on the MAIN Properties box instead of hidden in a tab.

  Each edit carries the value back as a unit-tagged string ("355 K", "1.2 bar")
  -- the same shape json.ts uses across the worker bridge -- so the engine's
  units-mandatory readers get their unit.  `from` is the original on-disk value
  (display units), kept so the box can show the "370 -> 355 K" diff.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict, JsonValue } from "../dict/json.js";

/** One tinkered scalar.  `value`/`from` are in DISPLAY units (what the student
 *  typed / saw); `unit` is the display unit suffix the engine will read back
 *  ("K", "bar", "kmol/h", or undefined for a dimensionless knob like a reflux
 *  ratio).  `label` is a short human tag for the badge ("feed.T"). */
export interface ScratchEdit {
  value: number;
  from: number;
  unit?: string;
  label: string;
}

export type ScratchEdits = Record<string, ScratchEdit>;

/** Serialise an edit to the unit-tagged string the dict/worker bridge speaks
 *  (a dimensionless knob stays a bare number). */
export function scratchToJsonValue(e: ScratchEdit): JsonValue {
  return e.unit ? `${e.value} ${e.unit}` : e.value;
}

/** A dotted/indexed dict path the overlay addresses, e.g.
 *    streams.feed.T
 *    units[0].operation.refluxRatio
 *  Returns the parsed segments; array indices become numbers. */
export function parsePath(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const raw of path.split(".")) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(raw);
    if (!m) { out.push(raw); continue; }
    out.push(m[1]!);
    const idx = m[2]!;
    for (const im of idx.matchAll(/\[(\d+)\]/g)) out.push(Number(im[1]));
  }
  return out;
}

/** Immutably set `value` at `path` inside `root`, cloning ONLY the touched
 *  spine (every other branch is shared by reference).  Missing intermediate
 *  containers are created as objects; an array index into a non-array is a
 *  no-op (we never fabricate structure the dict didn't have). */
function setAtPath(root: JsonValue, segs: (string | number)[], value: JsonValue): JsonValue {
  if (segs.length === 0) return value;
  const [head, ...rest] = segs;
  if (typeof head === "number") {
    if (!Array.isArray(root)) return root;            // index into non-array: refuse
    const arr = [...(root as JsonValue[])];
    if (head < 0 || head >= arr.length) return root;  // out of range: refuse
    arr[head] = setAtPath(arr[head]!, rest, value);
    return arr as unknown as JsonValue;
  }
  const key = String(head);
  const obj = { ...((root as JsonDict) ?? {}) } as JsonDict;
  obj[key] = setAtPath((obj[key] as JsonValue) ?? {}, rest, value);
  return obj;
}

/** Apply every scratch edit to a fresh CaseFiles, returning a new object with
 *  only the flowsheet's touched paths cloned.  No edits -> the same object
 *  back (cheap identity), so callers can pass the result straight to the
 *  solver without a needless deep copy. */
export function applyScratch(files: CaseFiles, edits: ScratchEdits): CaseFiles {
  const keys = Object.keys(edits);
  if (keys.length === 0 || !files.flowsheet) return files;
  let flowsheet = files.flowsheet as JsonValue;
  for (const path of keys) {
    flowsheet = setAtPath(flowsheet, parsePath(path), scratchToJsonValue(edits[path]!));
  }
  return { ...files, flowsheet: flowsheet as JsonDict };
}
