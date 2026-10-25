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

import type { PointTableDecl } from "./opPointTable.js";

export interface OperationField {
  key: string;
  title: string;
  description?: string;
  type: "number" | "string";
  integer?: boolean;  // true when the JSON Schema type was "integer"
  unit?: string;
  //  A temperature DIFFERENCE (an approach, a superheat, a subcooling) is
  //  declared `"unit": "K", "quantity": "temperatureDifference"` in its
  //  schema.  It converts by the scale and never by the offset: 5 K is a
  //  5 degC difference, and reading it as an absolute temperature printed
  //  -268 degC (C49, 2026-10-07).  Absent = an absolute value.
  quantity?: "temperatureDifference";
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
  quantity?: string;
  default?: number | string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
}

interface RawSchema {
  title?: string;
  description?: string;
  "x-choupo"?: unknown;
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

/** An operation type's schema as written (its `properties` nested as the
 *  JSON states them), or null -- what the Case tab's key help walks
 *  (case/keyHelp.ts, DEV.md 4c C154). */
export function rawOperationSchema(opType: string): unknown {
  return RAW[opType] ?? null;
}

/** An operation type's own description (its schema's), or undefined where no
 *  schema describes it -- what the review screen says an operation DID, so the
 *  sentence has one home: the schema beside the grammar it documents. */
export function operationDescription(opType: string): string | undefined {
  const d = RAW[opType]?.description;
  return typeof d === "string" && d.trim() ? d : undefined;
}

/* ---- THE CALCULATION-MAP DECLARATION of a props op (DEV.md 4c C151) -------

   A props op's schema carries, beside its grammar, ONE block that says where
   the op sits in a case's calculation map: its DISCIPLINE (the tree's shelf),
   its ACTIVITY (evaluate / scan / fit / estimate / compare / curate), whether
   it reads the case's thermo package, which of its keys name a MODEL, which
   name the DATA it reads, and which name a RECORD it writes.  The map and the
   tree are DERIVED from this and from the propsDict; nothing here is a second
   list of op types -- the schema file IS the op's entry (case/propsMap.ts).

   The block is `"x-choupo"`, an annotation keyword a JSON-Schema validator
   ignores, so the grammar the schema states is unchanged.  A key path is
   dotted (`transportParameters.activity`), `[]` walks a list of dicts
   (`evidence[].dataset`), and "" means "always" (a record the op reads by
   construction, e.g. constant/reactions). */

export const PROPS_DISCIPLINES = [
  "Thermodynamics", "Transport", "Kinetics", "Separation", "Data", "Safety",
] as const;
export type PropsDiscipline = typeof PROPS_DISCIPLINES[number];

export const PROPS_ACTIVITIES = [
  "evaluate", "scan", "fit", "estimate", "compare", "curate",
] as const;
export type PropsActivity = typeof PROPS_ACTIVITIES[number];

/** A key of the op that names a model, or a model the op IS (`fixed`). */
export interface OpModelSlot { key?: string; fixed?: string; role: string; default?: string }
/** What a data key holds: measured data, another source's numbers, an
 *  equipment/substance RECORD, numbers written in the propsDict itself, or (for
 *  `writes`) a record the op proposes. */
export type OpDataKind = "experiment" | "reference" | "record" | "inline" | "proposal";
export interface OpDataSlot {
  key: string; kind: OpDataKind; label: string;
  /** where a record named by the key lives in the case, `{}` = its name */
  file?: string;
  /** the value the engine takes when the key is absent */
  default?: string;
  /** what inline numbers ARE when they are not measurements: `reference`
   *  for published values written into the propsDict to compare against */
  flow?: "measured" | "reference";
}
export interface OpMapMeta {
  discipline: PropsDiscipline;
  activity: PropsActivity;
  disciplineBy?: { key: string; map: Record<string, PropsDiscipline> };
  activityBy?: { key: string; map?: Record<string, PropsActivity>; present?: PropsActivity };
  package?: boolean;
  packageUnless?: { key: string; in: string[] };
  models?: OpModelSlot[];
  data?: OpDataSlot[];
  writes?: OpDataSlot[];
  /** How the op's per-point numbers tabulate (case/opPointTable.ts, DEV.md
   *  4c C154): its keys with `{p}` / `{ion}` slots and their labels. */
  pointTable?: PointTableDecl;
}

/** The map declaration of an op type, or null where its schema carries none
 *  (a flowsheet unit, or a props op nobody has declared -- which a test
 *  refuses for every REGISTERED props op). */
export function operationMapMeta(opType: string): OpMapMeta | null {
  const x = RAW[opType]?.["x-choupo"];
  if (!x || typeof x !== "object") return null;
  const m = x as OpMapMeta;
  if (!(PROPS_DISCIPLINES as readonly string[]).includes(m.discipline)) return null;
  if (!(PROPS_ACTIVITIES as readonly string[]).includes(m.activity)) return null;
  return m;
}

/** Every op type whose schema declares a map block. */
export function mappedOperationTypes(): string[] {
  return Object.keys(RAW).filter((t) => operationMapMeta(t) !== null).sort();
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
  //  A declared word the panel dispatches on refuses a word it does not
  //  know, and a difference is only a difference OF something it converts.
  if (p.quantity !== undefined
      && (p.quantity !== "temperatureDifference" || p.unit !== "K"))
    throw new Error(`operation schema field '${key}': quantity '${p.quantity}'`
      + ` with unit '${p.unit ?? ""}' -- the only declared quantity is`
      + ` 'temperatureDifference', on a field whose unit is 'K'`);
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
    ...(p.quantity === "temperatureDifference"
      ? { quantity: "temperatureDifference" as const } : {}),
    min,
    strictMin,
    max,
    strictMax,
    default: p.default,
    required,
  };
}
