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
