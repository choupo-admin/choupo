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
  Round-trip tests: for every dict file in ../tutorials/,
      ast1 := parse(text)
      ast2 := parse(serialize(ast1))
  assert structural equality of ast1 and ast2.

  This is the right invariant: comment whitespace and "1.0" cosmetics may
  differ across the round-trip, but the *meaning* must be preserved
  exactly.
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { dictEquals, parse, serialize } from "../src/dict/index.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const DICT_BASENAMES = new Set([
  "controlDict",
  "flowsheetDict",
  "solverDict",
  "thermoPackage",
  "propertyPackage",
  "reactions",
]);

function discoverDictFiles(): string[] {
  return walk(TUTORIALS).filter((f) => {
    const base = f.split("/").pop()!;
    return DICT_BASENAMES.has(base);
  });
}

describe("dict round-trip on tutorials/", () => {
  const files = discoverDictFiles();

  it("discovers at least one tutorial dict file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = relative(TUTORIALS, file);
    it(`round-trips ${rel}`, () => {
      const text = readFileSync(file, "utf-8");
      const ast1 = parse(text, { sourceName: rel });
      const text2 = serialize(ast1);
      const ast2 = parse(text2, { sourceName: `${rel}.reserialised` });
      expect(dictEquals(ast1, ast2)).toBe(true);
    });
  }
});
