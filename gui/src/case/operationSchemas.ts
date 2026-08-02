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
  Operation schema registry.

  Each unit-op type can ship a JSON schema for its `operation` block
  under gui/schemas/operations/<type>.schema.json.  We import them
  eagerly (cheap -- they are small) and expose a flat typed view that
  the Property panel consumes to render labelled, ranged, unit-tagged
  inputs.  Schemas we do not yet have just degrade to the generic
  "infer-from-value" form -- no GUI regression.
\*---------------------------------------------------------------------------*/


export interface OperationField {
  key: string;
  title: string;
  description?: string;
  type: "number" | "string";
  integer?: boolean;  // true when the JSON Schema type was "integer"
  unit?: string;
  min?: number;       // numeric minimum (inclusive or exclusive — see strictMin)
  strictMin?: boolean;
  max?: number;
  strictMax?: boolean;
  default?: number | string;
  required: boolean;
}

export interface OperationSchema {
  title: string;
  description?: string;
  fields: OperationField[];
}

interface RawProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  unit?: string;
  default?: number | string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
}

interface RawSchema {
  title?: string;
  description?: string;
  properties?: { [k: string]: RawProperty };
  required?: string[];
}

//  EVERY schema file in gui/schemas/operations/ is imported, by glob --
//  never a hand list.  The registry used to enumerate 20 imports (the files
//  that existed when it was written), so the 56 schemas added later never
//  reached the Property panel: adding a schema file and adding it HERE were
//  two acts and only one got done -- the same failure the llmctx reading
//  list had, one stack over.  The glob makes a new schema reach the panel by
//  existing, and tests/operationSchemas.test.ts holds this against the
//  directory.
const GLOB = import.meta.glob("../../schemas/operations/*.schema.json", {
  eager: true,
}) as { [path: string]: RawSchema | { default: RawSchema } };

const RAW: { [unitType: string]: RawSchema } = {};
for (const [path, mod] of Object.entries(GLOB)) {
  const name = /\/([A-Za-z0-9_]+)\.schema\.json$/.exec(path)?.[1];
  if (!name) continue;
  RAW[name] = (mod as { default?: RawSchema }).default ?? (mod as RawSchema);
}

export function operationSchemaFor(unitType: string): OperationSchema | null {
  const raw = RAW[unitType];
  if (!raw || !raw.properties) return null;
  const required = new Set(raw.required ?? []);
  //  Only SCALAR properties become panel rows.  A structured block
  //  (geometry {}, hydraulics {}, a feeds list) is real grammar the schema
  //  documents for the generated reference, but a flat row cannot honestly
  //  render or edit it -- forcing it through the string branch printed
  //  "[object Object]" where a dict block sits.  Skipped here, the panel
  //  shows the scalars it can own and stays silent about the rest, the same
  //  degradation an unschema'd op already gets.
  const scalar = (p: RawProperty) => {
    const t = Array.isArray(p.type) ? p.type[0] : p.type;
    return t === undefined || t === "number" || t === "integer"
      || t === "string" || t === "boolean";
  };
  const fields: OperationField[] = Object.entries(raw.properties)
    .filter(([, p]) => scalar(p))
    .map(([key, p]) => parseField(key, p, required.has(key)));
  return {
    title: raw.title ?? unitType,
    description: raw.description,
    fields,
  };
}

function parseField(key: string,
  p: RawProperty,
  required: boolean,
): OperationField {
  const t = Array.isArray(p.type) ? p.type[0] : p.type;
  const type = t === "number" || t === "integer" ? "number" : "string";
  const integer = t === "integer";

  // JSON Schema Draft 2020-12 uses numeric exclusiveMinimum / Maximum.
  // Old-style boolean is also accepted for compatibility.
  let min: number | undefined;
  let strictMin = false;
  if (typeof p.exclusiveMinimum === "number") {
    min = p.exclusiveMinimum;
    strictMin = true;
  } else if (p.exclusiveMinimum === true && typeof p.minimum === "number") {
    min = p.minimum;
    strictMin = true;
  } else if (typeof p.minimum === "number") {
    min = p.minimum;
  }

  let max: number | undefined;
  let strictMax = false;
  if (typeof p.exclusiveMaximum === "number") {
    max = p.exclusiveMaximum;
    strictMax = true;
  } else if (p.exclusiveMaximum === true && typeof p.maximum === "number") {
    max = p.maximum;
    strictMax = true;
  } else if (typeof p.maximum === "number") {
    max = p.maximum;
  }

  return {
    key,
    title: p.title ?? key,
    description: p.description,
    type,
    integer,
    unit: p.unit,
    min,
    strictMin,
    max,
    strictMax,
    default: p.default,
    required,
  };
}
