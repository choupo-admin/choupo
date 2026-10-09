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
  caseAssembly -- "How dictionaries assemble a case" (DEV.md 4c C53), every
  claim it makes held to the tree.

  1. THE FILE TABLE IS THE REAL CASE.  Every file the browser bundle carries
     for flash01 has exactly one entry, every entry names a bundled file, and
     every keyword an entry says the file declares is declared in its text.
  2. EVERY CITATION LANDS ON ITS STATEMENT.  Each `Cite` opens its file and
     the claimed string must be ON the cited line.  And no source file of the
     page carries a bare `file:line` -- prose reaches a line only through a
     `Cite`, so nothing cited escapes this check.
  3. THE BREAKS DO WHAT THEY SAY, IN THE ENGINE.  Each damaged copy is built
     the way the page builds it, serialised into the EXACT file map the
     browser worker receives (`serialiseCase`), written to a temporary folder
     and run with this tree's native choupoSolve: it must exit 2 with the
     refusal the page promises.  The intact copy must converge, and its log
     must carry every narration line the page reads, in the page's order.
     No native binary is a FAILURE naming `make all`, never a skip.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ASSEMBLY, BREAKS, CASE_ASSEMBLY_WITNESS, CITES, FILE_ROLES, FOLDERS,
  NARRATION, applyBreak, breakDiff, declaresKeyword, narrationOf, refusalOf,
  writtenFiles,
} from "../src/ui/methods/caseAssembly.js";
import {
  CASE_ASSEMBLY_LIMITS, CASE_ASSEMBLY_STEPS,
} from "../src/ui/methods/caseAssemblyLesson.js";
import { TEAR_STEPS } from "../src/ui/methods/tearLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { filesToCaseFiles, tutorialByName } from "../src/cases/tutorials.js";
import { serialiseCase } from "../src/adapters/WasmAdapter.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const raw = (): { [rel: string]: string } => {
  const t = tutorialByName(CASE_ASSEMBLY_WITNESS);
  expect(t?.files.rawFiles, `${CASE_ASSEMBLY_WITNESS} is not bundled`)
    .toBeTruthy();
  return t!.files.rawFiles!;
};

// ---- 1. The file table is the real case ------------------------------------

describe("the file table is the real flash01", () => {
  it("has exactly one entry per bundled file, and no entry for a file that is not", () => {
    const bundled = Object.keys(raw()).sort();
    const tabled = FILE_ROLES.map((r) => r.path).sort();
    expect(new Set(tabled).size, "a file listed twice").toBe(tabled.length);
    expect(tabled).toEqual(bundled);
  });

  it("files each entry under the folder its path begins with", () => {
    for (const r of FILE_ROLES) {
      const top = r.path.includes("/") ? r.path.split("/")[0] : "root";
      expect(r.folder, r.path).toBe(top);
    }
    expect(FOLDERS.map((f) => f.dir)).toEqual(["system", "constant", "0"]);
  });

  it("every keyword an entry says the file declares IS declared there", () => {
    for (const r of FILE_ROLES) {
      const text = raw()[r.path]!;
      for (const k of r.declares)
        expect(declaresKeyword(text, k),
          `${r.path} is said to declare '${k}', and its text does not`)
          .toBe(true);
    }
  });

  it("the keyword test reads code, not comments", () => {
    expect(declaresKeyword("// units ( );\nT 1 K;", "units")).toBe(false);
    expect(declaresKeyword("/* precision { } */\nT 1 K;", "precision")).toBe(false);
    expect(declaresKeyword("operation   { T 370.0 K; }", "T")).toBe(true);
    expect(declaresKeyword("outputs     ( liquid  vapor );", "outputs")).toBe(true);
  });

  it("the marker is empty, and the feed is the four numbers the lesson counts", () => {
    expect(raw()["flash01_benzene_toluene.cho"]).toBe("");
    const feed = raw()["0/feed"]!;
    expect(feed).toMatch(/benzene\s+40 kmol\/h;/);
    expect(feed).toMatch(/toluene\s+60 kmol\/h;/);
    expect(feed).toMatch(/^T\s+370 K;/m);
    expect(feed).toMatch(/^P\s+100000 Pa;/m);
    expect(declaresKeyword(feed, "vaporFraction")).toBe(false);
    expect(declaresKeyword(feed, "phase")).toBe(false);
  });
});

// ---- 2. Every citation lands on its statement ------------------------------

describe("every file:line the page cites lands on what it claims", () => {
  it("found citations at all -- an empty audit is not a passing audit", () => {
    expect(Object.keys(CITES).length).toBeGreaterThan(40);
  });

  for (const [name, c] of Object.entries(CITES)) {
    it(`${name}: ${c.file}:${c.line}`, () => {
      const path = join(REPO, c.file);
      expect(existsSync(path), `${c.file} does not exist`).toBe(true);
      const lines = readFileSync(path, "utf-8").split("\n");
      expect(c.line, `${c.file} has ${lines.length} lines`)
        .toBeLessThanOrEqual(lines.length);
      expect(lines[c.line - 1] ?? "",
        `${c.file}:${c.line} does not carry ${JSON.stringify(c.contains)}`)
        .toContain(c.contains);
    });
  }

  it("no source file of the page types a bare file:line", () => {
    for (const rel of ["src/ui/methods/caseAssembly.ts",
      "src/ui/methods/caseAssemblyLesson.ts",
      "src/ui/methods/CaseAssemblyTool.tsx"]) {
      const src = readFileSync(join(REPO, "gui", rel), "utf-8");
      const bare = src.match(
        /[A-Za-z0-9_]+\.(?:cpp|H|ts|tsx|py)\s*:\s*\d+|bin\/runCase:\d+/g) ?? [];
      expect(bare, `${rel} cites a line no test holds: ${bare.join(", ")}`)
        .toEqual([]);
    }
  });

  it("the engine never opens the .cho marker (the page says so)", () => {
    const grep = spawnSync("grep", ["-rln", '".cho"', join(REPO, "src")],
      { encoding: "utf-8" });
    expect(grep.stdout.trim(), "an engine source names \".cho\"").toBe("");
  });
});

// ---- The lesson and its links ----------------------------------------------

describe("the lesson", () => {
  it("is live in the registry, on the How Choupo works shelf", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "case-assembly");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("How Choupo works");
    expect(t?.kind).toBe("notes");
  });

  it("numbers its steps 1..6 and keeps its limits apart", () => {
    expect(CASE_ASSEMBLY_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(CASE_ASSEMBLY_LIMITS.map((l) => l.id)).size)
      .toBe(CASE_ASSEMBLY_LIMITS.length);
  });

  it("leads to a step that exists, on a tool that is live", () => {
    for (const s of CASE_ASSEMBLY_STEPS) {
      if (!s.leadsTo) continue;
      expect(METHOD_TOOLS.find((m) => m.id === s.leadsTo!.tool)?.status)
        .toBe("live");
      expect(TEAR_STEPS.map((t) => t.title)).toContain(s.leadsTo.stepTitle);
    }
  });

  it("the unit arithmetic of step 2 is the engine's", () => {
    //  1 bar = 1e5 Pa and 1 kmol/h = 1/3600 kmol/s (src/core/Units.H), and
    //  the feed's 40 kmol/h of benzene is quoted as 0.0111 kmol/s.
    expect((40 / 3600).toFixed(4)).toBe("0.0111");
    const s2 = JSON.stringify(CASE_ASSEMBLY_STEPS[1]);
    expect(s2).toContain("0.0111");
    const units = readFileSync(join(REPO, "src/core/Units.H"), "utf-8");
    expect(units).toMatch(/bar_to_Pa\s*=\s*1\.0e5;/);
    expect(units).toMatch(/kmol_per_h_to_kmol_per_s\s*=\s*1\.0 \/ 3600\.0;/);
  });

  it("the assembly moves name only files the case has", () => {
    for (const m of ASSEMBLY)
      if (m.reads) expect(Object.keys(raw())).toContain(m.reads);
    for (const n of NARRATION)
      if (n.answers) expect(Object.keys(raw())).toContain(n.answers);
  });
});

// ---- 3. The breaks, in the engine ------------------------------------------

describe("the breaks edit a copy, and only files that travel verbatim", () => {
  for (const b of BREAKS) {
    it(`${b.id}: changes ${b.edit.file} in the copy and nothing else`, () => {
      const before = raw();
      const snapshot = JSON.stringify(before);
      const after = applyBreak(before, b);
      expect(JSON.stringify(before), "the bundled files were modified")
        .toBe(snapshot);
      const changed = Object.keys({ ...before, ...after })
        .filter((k) => before[k] !== after[k]);
      expect(changed).toEqual([b.edit.file]);
      const sent = serialiseCase(filesToCaseFiles(CASE_ASSEMBLY_WITNESS, after));
      //  What the engine receives for that file is the edited text itself:
      //  the app's parser did not rewrite it on the way.
      expect(sent[b.edit.file]).toBe(after[b.edit.file]);
      const d = breakDiff(b);
      expect(d.file).toBe(b.edit.file);
      expect(d.removed.length + d.added.length).toBeGreaterThan(0);
    });
  }

  it("refuses an edit that would silently change nothing", () => {
    const bad = { ...BREAKS[1]!, edit: { kind: "replace" as const,
      file: "constant/thermoPhysPropDict", find: "no such text", replace: "x" } };
    expect(() => applyBreak(raw(), bad)).toThrow(/occurs 0 times/);
  });
});

describe("refusalOf reads the refusal out of either kind of log", () => {
  const native = "[unmarked] a warning\n\nERROR: first line\n  MISSING  0/feed  (x)\nAn invalid 0/ ...\n";
  it("reads a native stderr", () => {
    expect(refusalOf(native)).toBe("ERROR: first line\n  MISSING  0/feed  (x)\nAn invalid 0/ ...");
  });
  it("reads the browser worker's prefixed log, stopping at the first stdout line", () => {
    const browser = "Application: choupoSolve\n"
      + native.split("\n").map((l) => `[stderr] ${l}`).join("\n")
      + "\n[worker] done";
    expect(refusalOf(browser)).toBe("ERROR: first line\n  MISSING  0/feed  (x)\nAn invalid 0/ ...");
  });
  it("is null when nothing was refused", () => {
    expect(refusalOf("Application: choupoSolve\nall fine")).toBeNull();
    expect(refusalOf(null)).toBeNull();
  });
});

describe("writtenFiles groups what a run handed back", () => {
  it("by top folder, sorted", () => {
    expect(writtenFiles({
      convergedFiles: { "converged/vapor": "", "converged/feed": "" },
      csvFiles: { "reports/streams/streamTable.csv": "" },
    })).toEqual([
      { folder: "converged", files: ["converged/feed", "converged/vapor"] },
      { folder: "reports", files: ["reports/streams/streamTable.csv"] },
    ]);
  });
});

describe("the engine refuses each damaged copy as the page says (native run)", () => {
  const bin = join(REPO, "choupoSolve");

  const run = (files: { [rel: string]: string }) => {
    expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the `
      + "repository root; this test runs the native engine and must not "
      + "skip").toBe(true);
    const dir = mkdtempSync(join(tmpdir(), "choupo-c53-"));
    try {
      for (const [rel, body] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, rel)), { recursive: true });
        writeFileSync(join(dir, rel), body);
      }
      const r = spawnSync(bin, [dir],
        { cwd: REPO, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
      return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("the intact copy converges, and narrates every move the page reads, in order", () => {
    const r = run(serialiseCase(filesToCaseFiles(CASE_ASSEMBLY_WITNESS, raw())));
    expect(r.status, r.err).toBe(0);
    const got = narrationOf(r.out).map((n) => n.mark.id);
    expect(got).toEqual(NARRATION.map((n) => n.id));
  });

  for (const b of BREAKS) {
    it(`${b.id}: exit 2, and the refusal contains "${b.expect}"`, () => {
      const r = run(serialiseCase(
        filesToCaseFiles(CASE_ASSEMBLY_WITNESS, applyBreak(raw(), b))));
      expect(r.status, `${b.id} exited ${r.status}:\n${r.err}`).toBe(2);
      const refusal = refusalOf(r.err);
      expect(refusal, r.err).toBeTruthy();
      expect(refusal!).toContain(b.expect);
    });
  }
});
