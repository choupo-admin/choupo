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
  AST <-> JSON round-trip tests.
  For every tutorial dict file:
      ast1 := parse(text)
      json := toJson(ast1)
      ast2 := fromJson(json)
  Compare ast1 and ast2 structurally (the one lossy edge case -- empty
  lists losing their scalar/word discriminator -- is acceptable because
  C++ collapses empty lists to empty scalarList anyway, which is what
  fromJson reconstructs).
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  dictEquals,
  fromJson,
  parse,
  toJson,
} from "../src/dict/index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const DICT_BASENAMES = new Set([
  "controlDict",
  "flowsheetDict",
  "solverDict",
  "thermoPackage",
  "reactions",
]);

const files = walk(TUTORIALS).filter((f) =>
  DICT_BASENAMES.has(f.split("/").pop()!),
);

describe("AST <-> JSON round-trip on tutorials/", () => {
  for (const file of files) {
    const rel = relative(TUTORIALS, file);
    it(`JSON round-trips ${rel}`, () => {
      const ast1 = parse(readFileSync(file, "utf-8"), { sourceName: rel });
      const json = toJson(ast1);
      const ast2 = fromJson(json);
      expect(dictEquals(ast1, ast2)).toBe(true);
    });
  }

  it("JSON output is JSON.stringify-able", () => {
    const ast = parse(readFileSync(files[0]!, "utf-8"));
    expect(() => JSON.stringify(toJson(ast))).not.toThrow();
  });
});

describe("AST <-> JSON unit cases", () => {
  it("preserves explicit dimensions across JSON", () => {
    const ast = parse("Dax [0 2 -1 0 0] 0.00012;");
    const json = toJson(ast);
    expect(json).toEqual({ Dax: "[0 2 -1 0 0] 0.00012" });
    expect(dictEquals(ast, fromJson(json))).toBe(true);
  });

  it("encodes scalar/word/lists into idiomatic JSON", () => {
    const ast = parse(`
      a 1;
      b foo;
      c ( 1 2 3 );
      d ( x y z );
      e { k 9; }
      f ( { i a; } { i b; } );
    `);
    const j = toJson(ast);
    expect(j).toEqual({
      a: 1,
      b: "foo",
      c: [1, 2, 3],
      d: ["x", "y", "z"],
      e: { k: 9 },
      f: [{ i: "a" }, { i: "b" }],
    });
  });

  it("fromJson rejects mixed-type arrays", () => {
    expect(() => fromJson({ x: [1, "a"] as never })).toThrow(/Heterogeneous/);
  });
});
