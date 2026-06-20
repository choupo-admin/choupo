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
  Variable knobs -- read the case's `variables {}` block as the named, units-
  carrying knobs the What-if / sweep surfaces drive.

  The engine already resolves `$ref`s against `variables {}` (Dictionary.cpp);
  a swept/what-if knob is therefore ALWAYS a named variable, never a raw
  `units[0].operation.<key>` dotted path.  This collector lifts the block into
  { name, value, unit, usedBy[] }, where `usedBy` is the reverse index of every
  `$name` reference site (so the GUI can say "drives flashDrum.P").

  Units survive because the block crosses the JSON bridge as "<number> <unit>"
  strings, which parseScalarString reads back -- see dict/json.ts.
\*---------------------------------------------------------------------------*/

import { parseScalarString, type JsonValue } from "../dict/index.js";

export interface VariableKnob {
  /** The declared name, e.g. "press". */
  name: string;
  /** The value AS WRITTEN (not SI), e.g. 1.0 for "1.0 bar". */
  value: number;
  /** The unit suffix, if the declaration carried one ("bar", "kmol/h", ...). */
  unit?: string;
  /** Dotted paths of every `$name` reference site, e.g. "units[0].operation.P". */
  usedBy: string[];
}

/**
 * Collect the named knobs of a flowsheet's `variables {}` block.
 *
 * `flowsheetJson` is the parsed JsonDict of system/flowsheetDict (the dict that
 * owns the `variables {}` header and the units/streams that reference it).
 * Entries that are not numeric scalars (bare number or "<number> [unit]") are
 * skipped.  Returns [] when there is no `variables {}` block.
 */
export function collectVariableKnobs(
  flowsheetJson: JsonValue | undefined,
): VariableKnob[] {
  if (!isPlainObject(flowsheetJson)) return [];
  const vars = flowsheetJson["variables"];
  if (!isPlainObject(vars)) return [];

  const knobs: VariableKnob[] = [];
  for (const [name, raw] of Object.entries(vars)) {
    let value: number | undefined;
    let unit: string | undefined;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      value = raw;
    } else if (typeof raw === "string") {
      const p = parseScalarString(raw);
      if (p) {
        value = p.value;
        unit = p.unit;
      }
    }
    if (value === undefined) continue; // not a numeric knob (e.g. a word)
    knobs.push({ name, value, unit, usedBy: findRefs(flowsheetJson, name) });
  }
  return knobs;
}

/** Every dotted path where the string `$name` appears as a reference. */
export function findRefs(root: JsonValue | undefined, name: string): string[] {
  const target = `$${name}`;
  const out: string[] = [];
  const walk = (node: JsonValue, path: string): void => {
    if (typeof node === "string") {
      if (node === target && path && !path.startsWith("variables")) out.push(path);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };
  if (root !== undefined) walk(root, "");
  return out;
}

function isPlainObject(
  v: JsonValue | undefined,
): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
