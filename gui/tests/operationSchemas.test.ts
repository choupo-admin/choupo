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
    This file is part of Choupo.  See gui/src/App.tsx for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The schema registry against the directory it claims to serve.

  The registry used to enumerate 20 hand-written imports, so 56 schema files
  added later never reached the Property panel -- adding a file and adding
  its import were two acts, and only one got done.  The glob import ended
  that; THIS test is what keeps it ended: every .schema.json on disk must
  resolve through operationSchemaFor, and a structured block (geometry {},
  hydraulics {}, a feeds list) must be SKIPPED by the flat field view, never
  mis-typed into a text row that renders "[object Object]".
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { operationSchemaFor } from "../src/case/operationSchemas.js";

const SCHEMA_DIR = join(
  dirname(fileURLToPath(import.meta.url)), "..", "schemas", "operations");

const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json"));

describe("operation schema registry", () => {
  it("serves every schema file on disk (no hand list to forget)", () => {
    expect(files.length).toBeGreaterThan(70);
    const missing = files
      .map((f) => f.replace(/\.schema\.json$/, ""))
      .filter((op) => operationSchemaFor(op) === null);
    expect(missing, "schema files the registry does not serve").toEqual([]);
  });

  it("keeps every served field scalar -- structured blocks are skipped", () => {
    for (const f of files) {
      const op = f.replace(/\.schema\.json$/, "");
      const raw = JSON.parse(readFileSync(join(SCHEMA_DIR, f), "utf8")) as {
        properties?: Record<string, { type?: string | string[] }>;
      };
      const nonScalar = new Set(
        Object.entries(raw.properties ?? {})
          .filter(([, p]) => {
            const t = Array.isArray(p.type) ? p.type[0] : p.type;
            return t === "object" || t === "array";
          })
          .map(([k]) => k));
      const schema = operationSchemaFor(op);
      if (!schema) continue;                 // an op with no properties
      for (const field of schema.fields) {
        expect(nonScalar.has(field.key),
          `${op}: structured property '${field.key}' leaked into the flat ` +
          "field view").toBe(false);
        expect(field.type === "number" || field.type === "string",
          `${op}.${field.key}: unexpected field type '${field.type}'`)
          .toBe(true);
      }
    }
  });

  it("still flattens a known scalar contract correctly", () => {
    const pump = operationSchemaFor("pump");
    expect(pump).not.toBeNull();
    const eta = pump!.fields.find((f) => f.key === "eta");
    expect(eta?.type).toBe("number");
    expect(eta?.required).toBe(true);
    expect(eta?.unit).toBe("-");
    //  pipe carries geometry{} + twoPhase{} -- both must be absent from the
    //  flat view while its scalar viscosity survives.
    const pipe = operationSchemaFor("pipe");
    expect(pipe).not.toBeNull();
    expect(pipe!.fields.map((f) => f.key)).toEqual(["viscosity"]);
  });
});
