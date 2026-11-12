/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  databaseToParametersLesson -- "From a database to binary parameters"
  (DEV.md 4c C334), held to what it says about Choupo:

    * every file:line the page names is in the tree and says what it is
      cited for, and every one written in a step is in that list;
    * the curated record is QUOTED: each line read back at its number;
    * the catalogue COUNTS are recounted with git at the commit the page
      names, by the rules written beside them, so they stay checkable after
      the catalogue grows;
    * the C277 text budget; the map links only to pages that are live;
    * the page renders before any file is loaded, reads the synthetic file's
      blocks the way the extractor does, ranks catalogue candidates by
      formula without choosing, and draws a fit result -- grade, cap,
      parity figure -- from the engine's parity tables.

  WHAT THIS CANNOT PROVE: that the in-browser run finishes (that needs the
  WASM build; the native run of the same case is in
  databaseToParametersFit.test.ts), or that a sentence about the pipeline
  is the whole truth about it.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { readThermoML } from "../src/case/thermomlReader.js";
import {
  CATALOGUE_COMMIT, CITATIONS, COUNTS, DP_LIMITS, DP_STEPS, MAP, RECORD_LINES,
} from "../src/ui/methods/databaseToParametersLesson.js";
import {
  DatabaseToParametersTool, FitResult, blockRows, candidatesFor, fitOutcome, sameFormula,
} from "../src/ui/methods/DatabaseToParametersTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const lines = (rel: string): string[] => readFileSync(REPO + rel, "utf-8").split("\n");
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const html = (el: JSX.Element): string =>
  renderToStaticMarkup(createElement(MantineProvider, null, el));

describe("database-to-parameters: every claim about Choupo has a line", () => {
  it("each citation is in the tree and says what it is cited for", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(15);
    for (const c of CITATIONS) {
      const at = lines(c.file)[c.line - 1] ?? "";
      expect(at, `${c.file}:${c.line} should contain "${c.contains}"`).toContain(c.contains);
    }
  });
  it("every file:line written in a step or a limit is among them", () => {
    const cited = new Set(CITATIONS.map((c) => `${c.file}:${c.line}`));
    const prose = [...DP_STEPS.flatMap((s) => [s.body, s.note ?? ""]), ...DP_LIMITS.map((l) => l.body)].join("\n");
    //  "file:N, :M" -- the bare ":M" continues the file named before it.
    let n = 0;
    for (const m of prose.matchAll(/([\w./-]+?(?:\.H|\.cpp|\.md|\.dat|\.py|choupo-thermoml|DEV\.md)):(\d+)((?:,\s*:\d+)*)/g)) {
      const refs = [m[2]!, ...[...(m[3] ?? "").matchAll(/:(\d+)/g)].map((x) => x[1]!)];
      for (const r of refs) {
        n++;
        expect(cited.has(`${m[1]}:${r}`), `${m[1]}:${r} is on the page but not in CITATIONS`).toBe(true);
      }
    }
    expect(n).toBeGreaterThanOrEqual(15);
  });
});

describe("database-to-parameters: the record is quoted, not paraphrased", () => {
  it("each line is the file's line at that number", () => {
    for (const r of RECORD_LINES)
      expect(lines(r.file)[r.line - 1]?.trim(), `${r.file}:${r.line}`).toBe(r.text);
  });
});

describe("database-to-parameters: the counts, recounted at the commit the page names", () => {
  //  One `git cat-file --batch` over every record of the three models at
  //  CATALOGUE_COMMIT.  The rules are the ones COUNTS states.
  const ls = spawnSync("git", ["-C", REPO, "ls-tree", "-r", "--name-only", CATALOGUE_COMMIT,
    "data/standards/parameters/NRTL", "data/standards/parameters/UNIQUAC",
    "data/standards/parameters/Wilson"], { encoding: "utf-8" });
  const paths = ls.stdout.split("\n").filter((p) => p.endsWith(".dat"));
  const cat = spawnSync("git", ["-C", REPO, "cat-file", "--batch"], {
    input: paths.map((p) => `${CATALOGUE_COMMIT}:${p}`).join("\n") + "\n",
    maxBuffer: 1 << 28,
  });
  const bodies = new Map<string, string>();
  {
    //  "<sha> blob <bytes>\n<content>\n" per object, sizes in BYTES.
    const out: Buffer = cat.stdout as Buffer;
    let i = 0;
    for (const p of paths) {
      const nl = out.indexOf(0x0a, i);
      const size = Number(out.subarray(i, nl).toString("utf-8").split(" ")[2]);
      bodies.set(p, out.subarray(nl + 1, nl + 1 + size).toString("utf-8"));
      i = nl + 1 + size + 1;
    }
  }
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("the git object store answered for every record", () => {
    expect(ls.status).toBe(0);
    expect(bodies.size).toBe(paths.length);
  });
  it("NRTL, UNIQUAC and Wilson totals", () => {
    const n = (m: string) => paths.filter((p) => p.includes(`/parameters/${m}/`)).length;
    expect(n("NRTL")).toBe(COUNTS.nrtl);
    expect(n("UNIQUAC")).toBe(COUNTS.uniquac);
    expect(n("Wilson")).toBe(COUNTS.wilson);
  });
  it("one article, nothing held out, severe, capped, reviewed by a person", () => {
    let one = 0, heldNone = 0, severe = 0, capped = 0, person = 0;
    for (const [p, raw] of bodies) {
      if (!p.includes("/parameters/NRTL/")) continue;
      const b = strip(raw);
      const dois = new Set([...b.matchAll(/\bdoi\s+"([^"]+)"/g)].map((m) => m[1]));
      if (dois.size === 1) one++;
      if (/\bheldOut\s+none\s*;/.test(b)) heldNone++;
      if (/\bfitGrade\s+severe\s*;/.test(b)) severe++;
      if (/\bfitGradeCap\s*\(/.test(b)) capped++;
      if (/\bhumanReviewed\s+true\s*;/.test(b) || /\breview\s*\{[^}]*\bby\s+human\b/.test(b)) person++;
    }
    expect({ one, heldNone, severe, capped, person }).toEqual({
      one: COUNTS.oneArticle, heldNone: COUNTS.heldOutNone, severe: COUNTS.severe,
      capped: COUNTS.capped, person: COUNTS.reviewedByPerson,
    });
  });
});

describe("database-to-parameters: the text budget and the map", () => {
  it("each step keeps at most 60 words before its equation and 40 after", () => {
    for (const s of DP_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(60);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(40);
    }
  });
  it("links only to live pages, and names the pages that are not live", () => {
    const live = new Set(METHOD_TOOLS.filter((t) => t.status === "live").map((t) => t.id as string));
    for (const m of MAP) {
      if (m.tool) expect(live.has(m.tool), `${m.id} links to ${m.tool}`).toBe(true);
      if (!m.live && m.toolName) expect(m.tool, m.id).toBeUndefined();
    }
    expect(MAP.map((m) => m.id)).toEqual(["tx", "px", "lle", "sle", "henry", "salt"]);
  });
});

describe("database-to-parameters: the page", () => {
  it("renders the loader, the eight steps, the record, the counts and the map before any file", () => {
    const h = html(createElement(DatabaseToParametersTool));
    expect(h).toContain("data-loader");
    for (const s of DP_STEPS) expect(h, s.title).toContain(s.title);
    for (const r of RECORD_LINES) expect(h).toContain(`data-record-line="${r.line}"`);
    expect(h).toContain(`${COUNTS.oneArticle} of the ${COUNTS.nrtl} NRTL pairs`);
    for (const m of MAP) expect(h).toContain(`data-map-row="${m.id}"`);
    expect(h).toContain(CATALOGUE_COMMIT);
    expect(h).not.toMatch(/NaN|undefined/);
  });

  it("reads the synthetic shapes file's blocks the way the extractor does", () => {
    const f = readThermoML(readFileSync(fileURLToPath(new URL("./thermomlShapes.synthetic.xml", import.meta.url)), "utf-8"));
    const rows = blockRows(f);
    expect(rows.map((r) => r.status)).toEqual([
      "usable", "setAside", "usable", "refused", "refused", "refused", "refused",
      "refused", "refused", "refused", "refused", "setAside"]);
    expect(rows[1]!.why).toContain("no stated uncertainty on every point");
    expect(rows[11]!.why).toContain("only 4 interior point(s)");
    expect(rows[4]!.why).toContain("REPORTS y BUT NO x");
  });

  it("ranks catalogue components with the file's formula first, and chooses none", () => {
    expect(sameFormula("C2H6O", "CH3CH2OH".replace(/CH3CH2OH/, "C2H6O"))).toBe(true);
    expect(sameFormula("C2H6O", "H6C2O")).toBe(true);
    expect(sameFormula("C2H6O", "C3H8O")).toBe(false);
    const c = candidatesFor({ orgNum: "1", name: "x", formula: "C2H6O", inchi: "", inchikey: "", cas: "" });
    const top = c.filter((x) => x.match).map((x) => x.value);
    expect(top).toContain("ethanol");
    expect(top.length).toBeGreaterThanOrEqual(2);   // a formula is not an identity
    expect(c.every((x, k) => k === 0 || !x.match || c[k - 1]!.match)).toBe(true);
  });

  it("draws a fit result from two parity tables: discards, grade, cap, figure", () => {
    const head = "x_1,P_Pa,T_exp,T_model,residual\n";
    const a = head + ["0.1,101325,350,350.2,0.2", "0.3,101325,346,349.5,3.5", "0.5,101325,343,342.6,-0.4"].join("\n");
    const b = head + ["0.1,101325,350,350.1,0.1", "0.5,101325,343,342.7,-0.3"].join("\n");
    const o = fitOutcome("T_bubble", a, b, { "fit.0.value": 120.5, "fit.1.value": -40.25 }, 2);
    expect(o.discardRows).toEqual([2]);
    expect(o.maxErr).toBeCloseTo(0.3, 12);
    expect(o.grade).toBe("clean");
    expect(o.capped).toEqual({ grade: "warning", caps: ["singleLaboratory"] });
    const h = html(createElement(FitResult, { o, names: ["acetone", "methanol"] }));
    expect(h).toContain("data-parity-figure");
    expect((h.match(/data-parity-point="kept"/g) ?? []).length).toBe(2);
    expect((h.match(/data-parity-point="discarded"/g) ?? []).length).toBe(1);
    expect(h).toContain('data-grade="clean"');
    expect(h).toContain('data-capped="warning"');
    expect(h).toContain("120.5");
    expect(h).not.toMatch(/NaN|undefined/);
  });
});
