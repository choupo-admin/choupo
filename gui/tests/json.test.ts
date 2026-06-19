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
