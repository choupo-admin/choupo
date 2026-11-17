// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
/*---------------------------------------------------------------------------*\
  The citation-by-symbol mechanism (DEV.md 4c C415), on a SYNTHETIC engine
  file: moving a cited function does not break a citation; renaming it,
  deleting the quoted statement, or moving the statement out of it does.
\*---------------------------------------------------------------------------*/
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { resolveCite } from "./support/engineCite.js";

const root = mkdtempSync(join(tmpdir(), "citeSym-"));
mkdirSync(join(root, "src"), { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const FN = [
  "int Solver::step(int n)",
  "{",
  "    // a brace } in a comment and \"}\" in a string do not count",
  "    if (n > 0) { n -= 1; }",
  "    return flowsheet.solve(n);",
  "}",
];
const OTHER = ["int other()", "{", "    return flowsheet.solve(0);", "}"];
const write = (lines: string[]): void =>
  writeFileSync(join(root, "src/E.cpp"), lines.join("\n") + "\n");
const filler = (k: number): string[] =>
  Array.from({ length: k }, (_, i) => `// filler ${i}`);
const cite = { file: "src/E.cpp", symbol: "Solver::step",
  contains: "flowsheet.solve(n);" };

describe("citation by symbol", () => {
  it("resolves, and derives the line", () => {
    write([...OTHER, ...FN]);
    expect(resolveCite(root, cite).line).toBe(9);
  });
  it("moving the function by 50 lines does not break it", () => {
    write([...filler(50), ...OTHER, ...FN]);
    expect(resolveCite(root, cite).line).toBe(59);
  });
  it("renaming the function breaks it, by name", () => {
    write([...OTHER, ...FN.map((l) => l.replace("Solver::step", "Solver::advance"))]);
    expect(() => resolveCite(root, cite)).toThrow(/Solver::step: no definition/);
  });
  it("deleting the quoted fragment breaks it, by name", () => {
    write([...OTHER, ...FN.filter((l) => !l.includes("flowsheet.solve"))]);
    expect(() => resolveCite(root, cite)).toThrow(/quoted fragment .* is not inside it/);
  });
  it("the fragment surviving only in ANOTHER function breaks it", () => {
    write([...OTHER, ...FN.filter((l) => !l.includes("flowsheet.solve"))]);
    expect(() => resolveCite(root, { ...cite, contains: "flowsheet.solve(0);" }))
      .toThrow(/not inside it/);
  });
  it("a declaration or a call is not a definition", () => {
    write(["int Solver::step(int n);", "void g() { x = Solver::step(1); }"]);
    expect(() => resolveCite(root, cite)).toThrow(/no definition/);
  });
  it("an anchor span holds where no symbol fits", () => {
    write([...filler(5), "// [anchor: seal]", "verify();", "// [/anchor: seal]"]);
    const a = { file: "src/E.cpp", anchor: "seal", contains: "verify();" };
    expect(resolveCite(root, a).line).toBe(7);
    write(["// [anchor: seal]", "// [/anchor: seal]", "verify();"]);
    expect(() => resolveCite(root, a)).toThrow(/not inside it/);
  });
});
