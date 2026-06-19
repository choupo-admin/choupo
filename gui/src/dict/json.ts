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
  Choupo GUI -- generic AST <-> plain-JSON bridge

  The dict AST is faithful but discriminated.  For UI binding and schema
  validation we want plain JS values that mirror the JSON Schemas in
  gui/schemas/.  Mapping:

      scalar       ->  number
      word         ->  string
      scalarList   ->  number[]
      wordList     ->  string[]
      dictList     ->  object[]
      dict         ->  object   (keys ordered by insertion)

  Lossy for empty lists (cannot distinguish empty scalarList from empty
  wordList in JSON).  fromJson defaults empty arrays to scalarList; if
  the schema demands wordList the caller can up-cast.
\*---------------------------------------------------------------------------*/

import { Dict, type DictValue } from "./types.js";
import { affineToK, lookupUnit } from "./units.js";

export type JsonValue =
  | number
  | string
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type JsonDict = { [k: string]: JsonValue };

export function toJson(dict: Dict): JsonDict {
  const out: JsonDict = {};
  for (const { key, value } of dict.entries) {
    out[key] = valueToJson(value);
  }
  return out;
}

export function valueToJson(v: DictValue): JsonValue {
  switch (v.kind) {
    // A scalar that arrived with a named-unit suffix crosses the JSON
    // boundary as the documented "<number> <unit>" string (fromJson below
    // parses it back) -- otherwise the unit is STRIPPED and the worker
    // re-serializes a bare SI number, which the engine's units-mandatory
    // readers rightly refuse (and which silently changed magnitude for
    // non-1-factor units like mol/kg).  Plain scalars stay numbers.
    case "scalar":
      return v.unit !== undefined && v.originalValue !== undefined
        ? `${v.originalValue} ${v.unit}`
        : v.value;
    case "word":       return v.value;
    case "scalarList": return [...v.value];
    case "wordList":   return [...v.value];
    case "dictList":   return v.value.map(toJson);
    case "dict":       return toJson(v.value);
    // Live references propagate the *name* upward as a $-prefixed
    // string.  The C++ engine resolves these against the case's
    // `variables {... }` block; in the GUI's JSON view we keep the
    // marker so the Property panel can display "$A" verbatim.
    case "reference":  return `$${v.name}`;
  }
}

export function fromJson(json: JsonDict, name = ""): Dict {
  const d = new Dict(name);
  for (const [key, value] of Object.entries(json)) {
    d.set(key, valueFromJson(value, key));
  }
  return d;
}

export function valueFromJson(j: JsonValue, hint = ""): DictValue {
  if (typeof j === "number") return { kind: "scalar", value: j };
  if (typeof j === "string") {
    // Detect $var references on the JSON side too, so AST -> JSON ->
    // AST round-trips preserve the reference flavour.
    if (j.length > 1 && j.startsWith("$") && /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(j)) {
      return { kind: "reference", name: j.slice(1) };
    }
    // "<number> <known-unit>" strings carry a unit suffix across the
    // JSON bridge (e.g. exploreSynth's `totals { Ca 0.0021 mol/kg; }`):
    // build the scalar-with-unit exactly as the dict parser would, so
    // the serializer emits `Ca 0.0021 mol/kg;` instead of a quoted word.
    const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+(\S+)$/.exec(j);
    if (m) {
      const spec = lookupUnit(m[2]!);
      if (spec) {
        const original = Number(m[1]);
        return {
          kind: "scalar",
          value: spec.affine ? affineToK(original, m[2]!) : original * spec.factor,
          unit: m[2]!,
          originalValue: original,
        };
      }
    }
    return { kind: "word", value: j };
  }
  if (typeof j === "boolean") return { kind: "word", value: j ? "true" : "false" };
  if (j === null) {
    throw new Error(`Cannot encode null in dict (key '${hint}')`);
  }
  if (Array.isArray(j)) {
    if (j.length === 0) return { kind: "scalarList", value: [] };
    const first = j[0]!;
    if (typeof first === "number") {
      if (!j.every((x) => typeof x === "number")) {
        throw new Error(`Heterogeneous list at '${hint}' (expected all numbers)`);
      }
      return { kind: "scalarList", value: j as number[] };
    }
    if (typeof first === "string") {
      if (!j.every((x) => typeof x === "string")) {
        throw new Error(`Heterogeneous list at '${hint}' (expected all strings)`);
      }
      return { kind: "wordList", value: j as string[] };
    }
    if (typeof first === "object" && !Array.isArray(first) && first !== null) {
      if (!j.every((x) => typeof x === "object" && x !== null && !Array.isArray(x))) {
        throw new Error(`Heterogeneous list at '${hint}' (expected all objects)`);
      }
      return {
        kind: "dictList",
        value: (j as JsonDict[]).map((o, i) => fromJson(o, `${hint}[${i}]`)),
      };
    }
    throw new Error(`Unsupported list element kind at '${hint}'`);
  }
  if (typeof j === "object") {
    return { kind: "dict", value: fromJson(j, hint) };
  }
  throw new Error(`Unsupported JSON value at '${hint}'`);
}
