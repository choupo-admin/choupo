/*---------------------------------------------------------------------------*\
  Focused parser tests for tricky cases that the round-trip suite alone
  would not pinpoint:
    - FoamFile header skip
    - Comments (line + block)
    - Mixed sign/exponent numbers
    - Word characters (CAS-style "71-43-2", paths)
    - Empty list ();
    - Dict-list with multiple sub-dicts
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { parse } from "../src/dict/index.js";

describe("tokenizer / parser corner cases", () => {
  it("parses scalar entry", () => {
    const d = parse("verbosity 3;");
    expect(d.get("verbosity")).toEqual({ kind: "scalar", value: 3 });
  });

  it("parses word entry", () => {
    const d = parse("model NRTL;");
    expect(d.get("model")).toEqual({ kind: "word", value: "NRTL" });
  });

  it("parses negative and exponent numbers", () => {
    const d = parse("a -0.8009;  b 1.0e8;  c -7.0E+4;");
    expect(d.get("a")).toEqual({ kind: "scalar", value: -0.8009 });
    expect(d.get("b")).toEqual({ kind: "scalar", value: 1.0e8 });
    expect(d.get("c")).toEqual({ kind: "scalar", value: -7.0e4 });
  });

  it("parses and preserves an explicit dimension set", () => {
    const d = parse("Dax [0 2 -1 0 0] 0.00012;");
    expect(d.get("Dax")).toEqual({
      kind: "scalar",
      value: 0.00012,
      dimensions: [0, 2, -1, 0, 0],
    });
  });

  it("rejects malformed explicit dimensions", () => {
    expect(() => parse("Dax [0 2 -1 0] 0.1;")).toThrow(/must be \[M L T Theta N\]/);
  });

  it("treats CAS-style 71-43-2 as a word, not a number", () => {
    const d = parse("cas 71-43-2;");
    expect(d.get("cas")).toEqual({ kind: "word", value: "71-43-2" });
  });

  it("parses sub-dict (no trailing semicolon)", () => {
    const d = parse("composition { benzene 0.4;  toluene 0.6; }");
    const c = d.get("composition");
    expect(c?.kind).toBe("dict");
    if (c?.kind !== "dict") throw new Error("unreachable");
    expect(c.value.get("benzene")).toEqual({ kind: "scalar", value: 0.4 });
    expect(c.value.get("toluene")).toEqual({ kind: "scalar", value: 0.6 });
  });

  it("parses scalar list", () => {
    const d = parse("xs ( 0.1  0.2  0.3 );");
    expect(d.get("xs")).toEqual({
      kind: "scalarList",
      value: [0.1, 0.2, 0.3],
    });
  });

  it("parses word list", () => {
    const d = parse("components ( benzene  toluene );");
    expect(d.get("components")).toEqual({
      kind: "wordList",
      value: ["benzene", "toluene"],
    });
  });

  it("parses dict list", () => {
    const d = parse(
      "pairs ( { i a; j b; } { i c; j d; } );",
    );
    const v = d.get("pairs");
    expect(v?.kind).toBe("dictList");
    if (v?.kind !== "dictList") throw new Error("unreachable");
    expect(v.value).toHaveLength(2);
    expect(v.value[0]!.get("i")).toEqual({ kind: "word", value: "a" });
    expect(v.value[1]!.get("j")).toEqual({ kind: "word", value: "d" });
  });

  it("accepts empty list as empty scalar list", () => {
    const d = parse("outputs ( );");
    expect(d.get("outputs")).toEqual({ kind: "scalarList", value: [] });
  });

  it("skips C-style and // comments", () => {
    const d = parse(`
      // top-level comment
      x 1; /* inline */ y 2;
      /* multi
         line */ z 3;
    `);
    expect(d.get("x")).toEqual({ kind: "scalar", value: 1 });
    expect(d.get("y")).toEqual({ kind: "scalar", value: 2 });
    expect(d.get("z")).toEqual({ kind: "scalar", value: 3 });
  });

  it("skips optional FoamFile header", () => {
    const d = parse(`
      FoamFile { version 2.0; format ascii; class dictionary; object x; }
      x 7;
    `);
    expect(d.get("x")).toEqual({ kind: "scalar", value: 7 });
  });

  it("preserves entry order", () => {
    const d = parse("a 1;  b 2;  c 3;");
    expect(d.keys()).toEqual(["a", "b", "c"]);
  });

  it("rejects missing semicolon after scalar", () => {
    expect(() => parse("x 1")).toThrow(/expected ';'/);
  });

  it("rejects unmatched closing brace", () => {
    expect(() => parse("}")).toThrow(/unmatched '\}'/);
  });
});
