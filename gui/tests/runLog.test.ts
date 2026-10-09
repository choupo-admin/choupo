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
  runLog -- "How to read a run's log" (DEV.md 4c C54), every claim it makes
  held to the tree.

  1. EVERY CITATION LANDS ON ITS STATEMENT, and no source file of the page
     types a bare file:line (the C53 rule, same check).
  2. THE CLASSIFIER READS MARKERS AND NOTHING ELSE: its rules on small
     synthetic logs (a block, a rule line, a continuation, the browser's
     prefixes) -- the only text written by hand in this file.
  3. THE WITNESSES DO WHAT THE PAGE SAYS, IN THE ENGINE.  Each run is built
     the way the page builds it, serialised into the EXACT file map the
     browser worker receives, and run with this tree's native choupoSolve:
     it must exit with its code, print every marker it is on the page to
     show, and the advisory / divergence / refusal / not-converged lines the
     page draws must be the ones it prints.  Across all witnesses every
     engine marker the classifier knows must be printed at least once -- a
     marker no witness prints is a claim nobody holds.
  4. THE VERBOSITY TABLE IS MEASURED: flash01 run at 0..4, each level's
     first markers absent below it and present at it.
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
  CITES, KIND_ORDER, KINDS, MARKERS, RUNS, VERBOSITY, blockLines, classifyLog,
  exitCodeOf, kindCounts, refusalOf, stripResultBlock, witnessRaw,
  type LogLine, type RunWitness, type Verbosity,
} from "../src/ui/methods/runLog.js";
import { RUN_LOG_LIMITS, RUN_LOG_STEPS } from "../src/ui/methods/runLogLesson.js";
import { WEGSTEIN_STEPS } from "../src/ui/methods/wegsteinLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { filesToCaseFiles } from "../src/cases/tutorials.js";
import { serialiseCase } from "../src/adapters/WasmAdapter.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- 1. Citations ---------------------------------------------------------------

describe("every file:line the page cites lands on what it claims", () => {
  it("found citations at all -- an empty audit is not a passing audit", () => {
    expect(Object.keys(CITES).length).toBeGreaterThan(60);
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

  it("every marker cites a line that exists in the map", () => {
    for (const m of MARKERS) expect(CITES[m.cite], m.id).toBeTruthy();
  });

  it("no source file of the page types a bare file:line", () => {
    for (const rel of ["src/ui/methods/runLog.ts",
      "src/ui/methods/runLogLesson.ts", "src/ui/methods/RunLogTool.tsx"]) {
      const src = readFileSync(join(REPO, "gui", rel), "utf-8");
      const bare = src.match(
        /[A-Za-z0-9_]+\.(?:cpp|H|ts|tsx|py|js)\s*:\s*\d+|bin\/runCase:\d+/g) ?? [];
      expect(bare, `${rel} cites a line no test holds: ${bare.join(", ")}`)
        .toEqual([]);
    }
  });

  it("each marker is exactly one of startsWith / pattern, and ids are unique", () => {
    const ids = MARKERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MARKERS) {
      expect((m.startsWith === undefined) !== (m.pattern === undefined), m.id)
        .toBe(true);
      //  The page never draws a regex; a pattern says how it reads.
      if (m.pattern) expect(m.looksLike, m.id).toBeTruthy();
    }
  });
});

// ---- 2. The classifier's rules --------------------------------------------------

const kindsOf = (log: string): (string | null)[] =>
  classifyLog(log).map((l) => l.kind);

describe("the classifier reads markers and nothing else", () => {
  it("a line with no marker outside every block is UNCLASSIFIED, not guessed", () => {
    expect(kindsOf("something the table does not know")).toEqual(["unclassified"]);
  });

  it("a region opener gives its kind to the unmarked lines after it, and says so", () => {
    const lines = classifyLog(">>>  Unit [0]:  f   (type = x)\nFeed: F = 1\n");
    expect(lines.map((l) => [l.kind, l.via, l.from])).toEqual([
      ["trace", "marker", null], ["trace", "block", 1]]);
  });

  it("a rule line belongs to the block it introduces; the block ends at its closing rule", () => {
    const rule = "=".repeat(74);
    const lines = classifyLog(
      [rule, "THE PROBLEM SOLVED IS NOT THE PROBLEM POSED", "  - unit c",
        rule, "after the block"].join("\n"));
    expect(lines.map((l) => [l.kind, l.via])).toEqual([
      ["divergence", "rule"], ["divergence", "marker"], ["divergence", "block"],
      ["divergence", "block"], ["unclassified", null]]);
  });

  it("stderr is followed apart: an indented line continues the one above, and after ERROR: everything is the refusal", () => {
    const lines = classifyLog([
      "[stderr] [psat] component 'x': Antoine evaluated",
      "[stderr]      The saturation pressure is extrapolated",
      "[stderr] ",
      "[stderr] ERROR: unknown activity model 'idael'.",
      "[stderr] Registered: a b",
    ].join("\n"));
    expect(lines.map((l) => [l.stream, l.kind, l.via])).toEqual([
      ["err", "advisory", "marker"], ["err", "advisory", "continuation"],
      ["err", null, null], ["err", "refusal", "marker"],
      ["err", "refusal", "continuation"]]);
  });

  it("a rule its opener does not draw stays with what it closes", () => {
    //  process03's topology table closes on a `----` rule and the recycle
    //  loop's header follows it; the loop draws no rule of its own.
    const lines = classifyLog(["================  Flowsheet topology  ================",
      "    feed   F = 1", "-".repeat(54),
      "Recycle outer loop (Newton over 1 tear stream(s), 5 variables):"].join("\n"));
    expect(lines.map((l) => [l.kind, l.via])).toEqual([
      ["streams", "marker"], ["streams", "block"], ["streams", "block"],
      ["convergence", "marker"]]);
  });

  it("a result block runs to its closing `====`, past the `----` under its table header", () => {
    const lines = classifyLog(["=====  Flash Result  =====", "  V/F: 0.3",
      "-".repeat(40), "  benzene 0.4", "=".repeat(40), "after"].join("\n"));
    expect(lines.map((l) => l.kind)).toEqual(["convergence", "convergence",
      "convergence", "convergence", "convergence", "unclassified"]);
  });

  it("a stderr line never continues a stdout block, and an app line is the app's", () => {
    const lines = classifyLog([">>>  Unit [0]:  f", "[stderr] unknown words",
      "[worker] run_case returned rc=0", "Feed: F = 1"].join("\n"));
    expect(lines.map((l) => l.kind))
      .toEqual(["trace", "unclassified", "app", "trace"]);
  });

  it("strips the machine block, as the app's log view does", () => {
    expect(stripResultBlock("a\n<<<Choupo:result-begin>>>\n{}\n<<<Choupo:result-end>>>\nb\n"))
      .toBe("a\nb\n");
  });

  it("reads the exit code off the worker's own line", () => {
    expect(exitCodeOf("x\n[worker] run_case returned rc=2\n")).toBe(2);
    expect(exitCodeOf("no worker here")).toBeNull();
  });

  it("names a colour and a label for every kind", () => {
    expect(KIND_ORDER.slice().sort()).toEqual(Object.keys(KINDS).sort());
  });
});

// ---- The lesson ------------------------------------------------------------------

describe("the lesson", () => {
  it("is live in the registry, on the How Choupo works shelf", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "run-log");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("How Choupo works");
    expect(t?.kind).toBe("notes");
  });

  it("numbers its steps 1..n and keeps its limits apart", () => {
    expect(RUN_LOG_STEPS.map((s) => s.n))
      .toEqual(RUN_LOG_STEPS.map((_, i) => i + 1));
    expect(new Set(RUN_LOG_LIMITS.map((l) => l.id)).size)
      .toBe(RUN_LOG_LIMITS.length);
  });

  it("leads to steps that exist, on live tools", () => {
    const stepsOf: { [tool: string]: readonly { title: string }[] } = {
      wegstein: WEGSTEIN_STEPS,
    };
    const pointers = RUN_LOG_STEPS.filter((s) => s.leadsTo);
    expect(pointers.length).toBeGreaterThan(0);
    for (const s of pointers) {
      const lt = s.leadsTo!;
      expect(METHOD_TOOLS.find((m) => m.id === lt.tool)?.status).toBe("live");
      expect((stepsOf[lt.tool] ?? []).map((t) => t.title)).toContain(lt.stepTitle);
    }
  });

  it("never calls the plant/sector layout 'fractal' (the 2026-10-09 naming ruling)", () => {
    for (const rel of ["src/ui/methods/runLog.ts",
      "src/ui/methods/runLogLesson.ts", "src/ui/methods/RunLogTool.tsx"]) {
      const src = readFileSync(join(REPO, "gui", rel), "utf-8")
        .replace(/never calls the plant\/sector layout 'fractal'/g, "");
      expect(/fractal/i.test(src), rel).toBe(false);
    }
  });
});

// ---- 3. The witnesses, in the engine --------------------------------------------

interface NativeRun { status: number | null; log: string; lines: LogLine[];
  out: string; err: string }

const bin = join(REPO, "choupoSolve");
const cache = new Map<string, NativeRun>();

/** The run as the browser makes it: the witness's raw files, the verbosity
 *  written in, serialised into the worker's file map -- then run natively.
 *  The log is assembled the way the worker assembles it: stdout as printed,
 *  stderr prefixed, the worker's exit-code line at the end. */
function runNative(run: RunWitness, verbosity: Verbosity): NativeRun {
  const key = `${run.id}@${verbosity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the `
    + "repository root; this test runs the native engine and must not skip")
    .toBe(true);
  const files = serialiseCase(filesToCaseFiles(run.case, witnessRaw(run, verbosity)));
  const dir = mkdtempSync(join(tmpdir(), "choupo-c54-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    const r = spawnSync(bin, [dir],
      { cwd: REPO, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
    const out = r.stdout ?? "", err = r.stderr ?? "";
    const log = stripResultBlock(out).replace(/\n$/, "") + "\n"
      + err.replace(/\n$/, "").split("\n").map((l) => `[stderr] ${l}`).join("\n")
      + `\n[worker] run_case returned rc=${r.status}\n`;
    const res = { status: r.status, log, lines: classifyLog(log), out, err };
    cache.set(key, res);
    return res;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const markersIn = (lines: readonly LogLine[]): Set<string> =>
  new Set(lines.filter((l) => l.via === "marker" && l.marker)
    .map((l) => l.marker!.id));

const textOf = (lines: readonly LogLine[]): string =>
  lines.map((l) => l.text).join("\n");

describe("each witness, run natively as the browser would run it", () => {
  for (const run of RUNS) {
    it(`${run.id} (${run.case}): exit ${run.exit}, and prints ${run.prints.join(", ")}`, () => {
      const r = runNative(run, 3);
      expect(r.status, r.err.slice(-2000)).toBe(run.exit);
      expect(exitCodeOf(r.log)).toBe(run.exit);
      const got = markersIn(r.lines);
      for (const id of run.prints)
        expect(got.has(id), `${run.id} did not print marker '${id}'`).toBe(true);
    });
  }

  it("every engine marker the classifier knows is printed by some witness", () => {
    const seen = new Set<string>();
    for (const run of RUNS) for (const id of markersIn(runNative(run, 3).lines))
      seen.add(id);
    const engine = MARKERS.filter((m) => m.stream !== "app").map((m) => m.id);
    const never = engine.filter((id) => !seen.has(id));
    expect(never, `markers no witness prints: ${never.join(", ")}`).toEqual([]);
  });

  it("most of every log is classified, and what is not is said (measured, not hidden)", () => {
    for (const run of RUNS) {
      const c = kindCounts(runNative(run, 3).lines);
      const total = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
      const un = c.unclassified ?? 0;
      expect(un / total, `${run.id}: ${un} of ${total} lines unclassified`)
        .toBeLessThan(0.1);
    }
  });
});

describe("the three kinds of message, as the page draws them", () => {
  const byId = (id: string): RunWitness => RUNS.find((r) => r.id === id)!;

  it("ADVISORY: flash01's [psat] site line, and the same fact in the caveat block", () => {
    const r = runNative(byId("flash"), 3);
    const site = r.lines.find((l) => l.marker?.id === "psat" && l.via === "marker");
    expect(site?.text).toMatch(/^\[psat\] component 'benzene': Antoine evaluated at T = 370 K, OUTSIDE its declared Trange/);
    const block = textOf(blockLines(r.lines, "caveatsBlock"));
    expect(block).toContain("EXTRAPOLATIONS AND VALIDITY");
    expect(block).toContain("component 'benzene': vapour pressure evaluated at T = 370 K, OUTSIDE its declared Trange");
    //  The [unmarked] lines do not ride the advisory log: never in the block.
    expect(block).not.toContain("reviewStatus");
    expect(r.lines.some((l) => l.marker?.id === "unmarked")).toBe(true);
  });

  it("'none raised' means nothing on the advisory log -- while [unmarked] still prints at its site", () => {
    const r = runNative(byId("quiet"), 3);
    expect(blockLines(r.lines, "caveatsBlock")).toEqual([]);
    const none = textOf(blockLines(r.lines, "caveatsNone"));
    expect(none).toContain("ASSUMPTIONS AND CAVEATS: none raised.");
    expect(none).toContain("([unmarked] records, [override] precedence) stay at their site above");
    expect(r.lines.filter((l) => l.marker?.id === "unmarked").length).toBe(2);
  });

  it("DIVERGENCE: shortcut01 prints the block, above the caveats, naming what was requested and what was solved", () => {
    const r = runNative(byId("divergence"), 3);
    const div = blockLines(r.lines, "divergenceBlock");
    const t = textOf(div);
    expect(t).toContain("THE PROBLEM SOLVED IS NOT THE PROBLEM POSED");
    expect(t).toMatch(/- unit column/);
    expect(t).toMatch(/requested: distillation separation/);
    expect(t).toMatch(/solved: {4}Fenske-Underwood-Gilliland shortcut/);
    expect(t).toMatch(/reason: {4}the case declares `type shortcutColumn;`/);
    const caveat = r.lines.find((l) => l.marker?.id === "caveatsBlock" && l.via === "marker");
    expect(caveat && div.length && div[0]!.n < caveat.n).toBe(true);
    expect(r.status).toBe(0);
  });

  it("REFUSAL: the misspelt model exits 2 with the engine's own words, and no answer follows", () => {
    const r = runNative(byId("refused"), 3);
    const refusal = refusalOf(r.err);
    expect(refusal).toContain("ERROR: unknown activity model 'idael'.  Did you mean 'ideal'?");
    expect(refusal).toContain("Registered:");
    const kinds = new Set(r.lines.map((l) => l.kind));
    expect(kinds.has("refusal")).toBe(true);
    expect(kinds.has("caveats")).toBe(false);
    expect(kinds.has("divergence")).toBe(false);
    expect(r.lines.some((l) => l.marker?.id === "convergedWritten")).toBe(false);
  });

  it("NOT CONVERGED: one recycle iteration exits 1, says so, and writes no converged/", () => {
    const r = runNative(byId("capped"), 3);
    const w = r.lines.find((l) => l.marker?.id === "recycleFailed");
    expect(w?.text).toMatch(/^WARNING: recycle Newton did NOT converge in 1 iterations \(last \|r\|2 = /);
    expect(r.lines.some((l) => l.marker?.id === "convergedWritten")).toBe(false);
    expect(r.lines.some((l) => l.marker?.id === "reportsDir")).toBe(false);
    expect(r.lines.some((l) => l.marker?.id === "summary")).toBe(true);
  });
});

describe("the numbers the lesson quotes are the ones the engine prints", () => {
  const byId = (id: string): RunWitness => RUNS.find((r) => r.id === id)!;

  it("flash01's first Rachford-Rice step (step 3)", () => {
    const t = runNative(byId("flash"), 3).out;
    expect(t).toMatch(/0 {5}0\.50000000 {3}-3\.75806e-02 {3}-1\.87920e-01 {3}-1\.99981e-01/);
    expect(t).toMatch(/1 {5}0\.30001863 {3}7\.81978e-04/);
    expect(t).toMatch(/3 {5}0\.30398357 {3}2\.94959e-13/);
    expect((0.5 - (-3.75806e-2) / (-1.87920e-1)).toFixed(5)).toBe("0.30002");
    expect(JSON.stringify(RUN_LOG_STEPS[2])).toContain("0.30002");
  });

  it("flash13's five numbers (step 4)", () => {
    const t = runNative(byId("verdict"), 3).out;
    expect(t).toContain("raw   |r|1   initial 1.1964e+00  ->  final 8.3135e-13");
    expect(t).toContain("normalized   initial 7.4889e-02  ->  final 5.1947e-14");
    expect(t).toContain("reduction    normFinal/normInitial = 6.9365e-13");
    expect(t).toContain("criterion    absolute tolerance (normalized residual <= tolerance)");
    expect(t).toContain("verdict      CONVERGED after 4 outer iterations");
    expect((5.1947e-14 / 7.4889e-2).toExponential(3)).toBe("6.937e-13");
    const s4 = JSON.stringify(RUN_LOG_STEPS[3]);
    for (const n of ["7.4889", "5.1947", "6.94", "1.1964"]) expect(s4).toContain(n);
  });

  it("the recycle: the units stay quiet until the loop has converged (step 5)", () => {
    const lines = runNative(byId("recycle"), 3).lines;
    const firstUnit = lines.find((l) => l.marker?.id === "unitBanner" && l.via === "marker")!;
    const conv = lines.find((l) => l.marker?.id === "recycleConverged")!;
    const pass = lines.find((l) => l.marker?.id === "finalPass")!;
    expect(conv.text).toMatch(/^Recycle converged in 2 Newton iteration\(s\)/);
    expect(conv.n).toBeLessThan(pass.n);
    expect(pass.n).toBeLessThan(firstUnit.n);
    //  The rule just above the loop belongs to the topology table it closes.
    const loop = lines.find((l) => l.marker?.id === "recycleLoop" && l.via === "marker")!;
    expect(lines[loop.n - 2]!.kind).toBe("streams");
    expect(lines.find((l) => l.marker?.id === "plan")!.text)
      .toBe("[plan] material recycle: tear 'recycle' cuts  mixer01 -> reactor -> separator -> split01 --recycle--> mixer01");
  });
});

// ---- 4. Verbosity, measured -------------------------------------------------------

describe("what each verbosity level adds, measured on flash01", () => {
  const flash = RUNS.find((r) => r.id === "flash")!;

  it("each level's first markers are absent below it and present at it", () => {
    for (const step of VERBOSITY) {
      const here = markersIn(runNative(flash, step.level).lines);
      for (const id of step.first)
        expect(here.has(id), `${id} missing at verbosity ${step.level}`).toBe(true);
      if (step.level > 0) {
        const below = markersIn(runNative(flash, (step.level - 1) as Verbosity).lines);
        for (const id of step.first)
          expect(below.has(id), `${id} already at verbosity ${step.level - 1}`).toBe(false);
      }
    }
  });

  it("the log grows with every level, and level 4 adds a later pass's table", () => {
    const n = VERBOSITY.map((s) => runNative(flash, s.level).out.split("\n").length);
    for (let i = 1; i < n.length; i++) expect(n[i]!).toBeGreaterThan(n[i - 1]!);
    expect(runNative(flash, 4).out).toContain("[outer 1] Rachford-Rice Newton (inner):");
    expect(runNative(flash, 3).out).not.toContain("[outer 1] Rachford-Rice Newton (inner):");
  });

  it("the stderr announcements are the same at every level (on this case)", () => {
    const e0 = runNative(flash, 0).err;
    for (const s of VERBOSITY) expect(runNative(flash, s.level).err).toBe(e0);
    expect(e0).toContain("[psat] component 'benzene'");
  });
});
