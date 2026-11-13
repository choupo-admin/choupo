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
  databaseToParametersFit -- the case the page hands the engine (DEV.md 4c
  C334), held three ways:

    * its rule is the pipeline's: the outlier limit, the grade limits, the
      minimum interior points and the pressure ceiling are read back from
      bin/curate/pairs_c283.py, pairs_px.py and bin/choupo-curate, so a
      change there fails here instead of leaving the page teaching the old
      number;
    * the grade, the outliers and the C300 cap are the pipeline's
      functions' answers on the same inputs (pairs_c283.grade_of /
      cap_grade, run through python3);
    * the case RUNS: the NATIVE choupoProps of this tree fits it, stage A
      then stage B, from the SYNTHETIC fixture
      tutorials/props/curation/fixtures/thermoml/binary-bubble-fixture.xml
      (invented numbers).  The browser runs the same C++ built to WASM; that
      build is not made here, so the page's in-browser run is NOT tested by
      this file.  With no native build this arm is SKIPPED, never passed.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  interiorIndices, readThermoML, selectBlock, isRefusal, type BubblePRecord, type BubbleTRecord,
} from "../src/case/thermomlReader.js";
import {
  FIT_RULE, capOf, gradeOf, maxErrorOf, outliersOf, pairFitCaseFiles, readParity,
  temperaturesOf, type PairFitInput,
} from "../src/ui/methods/databaseToParametersFit.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");
const FIXTURE = "tutorials/props/curation/fixtures/thermoml/binary-bubble-fixture.xml";

function nativeProps(): string | null {
  const b = join(REPO, "build");
  if (!existsSync(b)) return null;
  for (const d of readdirSync(b)) {
    const p = join(b, d, "choupoProps");
    if (!d.endsWith("Debug") && existsSync(p)) return p;
  }
  return null;
}

describe("the rule is the pipeline's, read back from its own source", () => {
  it("outlier, grade, interior and pressure numbers", () => {
    const c283 = read("bin/curate/pairs_c283.py").split("\n");
    const px = read("bin/curate/pairs_px.py").split("\n");
    const cur = read("bin/choupo-curate").split("\n");
    expect(c283[72]).toBe(`OUTLIER_K = ${FIT_RULE.outlierK.toFixed(1)}          # C283 amended: three times the band, in temperature 3 K`);
    expect(c283[91]).toBe(`GRADE_K = (${FIT_RULE.gradeK.map((v) => v.toFixed(1)).join(", ")})`);
    expect(c283[92]).toBe(`GRADE_PCT = (${FIT_RULE.gradePct.map((v) => v.toFixed(1)).join(", ")})`);
    expect(px[69]).toContain(`OUTLIER_PCT = ${FIT_RULE.outlierPct.toFixed(1)}`);
    //  pairs_px.py no longer carries the numbers: its GRADE_PCT IS pairs_c283's (one home), checked at c283[92] above.
    expect(px[72]).toContain("GRADE_PCT = pc.GRADE_PCT");
    expect(cur[110]).toBe(`MIN_INTERIOR = ${FIT_RULE.minInterior}`);
    expect(c283[376]).toContain(`def candidates(pmax=${FIT_RULE.pMaxKPa.toFixed(1)})`);
  });

  it("grade and cap agree with pairs_c283.grade_of and cap_grade", () => {
    const xs = [0, 0.5, 1, 1.0000001, 1.5, 2, 2.5, 4, 4.03, 5.4];
    const code = [
      "import importlib.util,json,sys,pathlib",
      "p=pathlib.Path(sys.argv[1])/'bin'/'curate'/'pairs_c283.py'",
      "sys.path.insert(0,str(p.parent))",
      "s=importlib.util.spec_from_file_location('pc',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "xs=json.loads(sys.argv[2])",
      "print(json.dumps({'g':[m.grade_of(x) for x in xs],'cap':[m.cap_grade(g,t,l) for g,t,l in [('clean',1,1),('clean',3,1),('clean',1,3),('clean',2,2),('severe',1,1)]]}))",
    ].join("\n");
    const r = spawnSync("python3", ["-c", code, REPO, JSON.stringify(xs)], { encoding: "utf-8", cwd: REPO });
    expect(r.status, r.stderr).toBe(0);
    const py = JSON.parse(r.stdout.trim().split("\n").pop()!) as { g: string[]; cap: [string, string[]][] };
    expect(xs.map((x) => gradeOf(x, "T_bubble"))).toEqual(py.g);
    const ours = [["clean", 1, 1], ["clean", 3, 1], ["clean", 1, 3], ["clean", 2, 2], ["severe", 1, 1]] as const;
    ours.forEach(([g, t, l], k) => {
      const c = capOf(g, t, l);
      expect([c.grade, c.caps]).toEqual(py.cap[k]);
    });
  });

  it("stage A's outliers: beyond the limit, a NaN model, and a majority discards a P-x block whole", () => {
    const rows = [0.5, -3.2, 2.99, NaN].map((r, k) => ({ x: k / 4, measured: 0, model: 0, residual: r }));
    expect(outliersOf(rows, "T_bubble")).toEqual({ rows: [2, 4], whole: false });
    const pr = [0.1, 0.25, -0.3, 0.05].map((r, k) => ({ x: k / 4, measured: 0, model: 0, residual: r }));
    expect(outliersOf(pr, "P_bubble")).toEqual({ rows: [2, 3], whole: false });
    const pw = [0.1, 0.25, -0.3, 0.21].map((r, k) => ({ x: k / 4, measured: 0, model: 0, residual: r }));
    expect(outliersOf(pw, "P_bubble")).toEqual({ rows: [1, 2, 3, 4], whole: true });
  });
});

describe("the case the engine runs", () => {
  const file = readThermoML(read(FIXTURE));
  const rec = selectBlock(file, "bubbleT") as BubbleTRecord;
  const inp: PairFitInput = {
    rec, names: ["ethanol", "water"], keep: interiorIndices(rec.points),
    citation: { file: "binary-bubble-fixture.xml", block: 0, doi: file.doi, text: "synthetic fixture" },
    source: "synthetic",
  };

  it("is a complete props case with one fitParameters op", () => {
    expect(isRefusal(rec)).toBe(false);
    const f = pairFitCaseFiles(inp, "leastSquares", []);
    expect(Object.keys(f).sort()).toEqual(["constant/experiments/thermoml-block.dat",
      "constant/thermoPhysPropDict", "database-to-parameters.cho", "system/controlDict",
      "system/propsDict"]);
    expect(f["system/propsDict"]).toContain("type        fitParameters;");
    expect(f["system/propsDict"]).toContain("method leastSquares;");
    expect(pairFitCaseFiles(inp, "twoStage", [2, 5])["system/propsDict"]).toContain("discard  ( 2 5 );");
    expect(temperaturesOf(rec, inp.keep)).toBe(7);
  });

  const bin = nativeProps();
  it.skipIf(bin === null)("runs on the native choupoProps: stage A, outliers, stage B, a grade", () => {
    const run = (files: Record<string, string>): { csv: string; log: string; status: number | null } => {
      const dir = mkdtempSync(join(tmpdir(), "c334-"));
      try {
        for (const [rel, text] of Object.entries(files)) {
          mkdirSync(dirname(join(dir, rel)), { recursive: true });
          writeFileSync(join(dir, rel), text);
        }
        const r = spawnSync(bin!, [dir], {
          encoding: "utf-8", env: { ...process.env, CHOUPO_HOME: REPO }, maxBuffer: 1 << 26,
        });
        const p = join(dir, "parity.csv");
        return { csv: existsSync(p) ? readFileSync(p, "utf-8") : "", log: r.stdout + r.stderr, status: r.status };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const a = run(pairFitCaseFiles(inp, "leastSquares", []));
    expect(a.status, a.log.slice(-2000)).toBe(0);
    const rowsA = readParity(a.csv, "T_bubble");
    expect(rowsA.length).toBe(inp.keep.length);
    const out = outliersOf(rowsA, "T_bubble");
    const b = run(pairFitCaseFiles(inp, "twoStage", out.rows));
    expect(b.status, b.log.slice(-2000)).toBe(0);
    const rowsB = readParity(b.csv, "T_bubble");
    expect(rowsB.length).toBe(inp.keep.length - out.rows.length);
    const mx = maxErrorOf(rowsB, "T_bubble");
    expect(Number.isFinite(mx)).toBe(true);
    //  The engine's own number for the same thing, from its result block.
    const m = /"bubble_max_fit":\s*([-0-9.eE+]+)/.exec(b.log);
    expect(m, "the result block carries bubble_max_fit").not.toBeNull();
    expect(Math.abs(Number(m![1]) - mx)).toBeLessThan(1e-3);
    expect(["clean", "warning", "severe", "refused"]).toContain(gradeOf(mx, "T_bubble"));

    //  A bubble-PRESSURE block: the synthetic shapes file's block 2 (invented
    //  numbers), its compounds named ethanol and water for the run only.
    const shapes = readThermoML(readFileSync(fileURLToPath(new URL("./thermomlShapes.synthetic.xml", import.meta.url)), "utf-8"));
    const px = selectBlock(shapes, "bubbleP", 2) as BubblePRecord;
    const pin: PairFitInput = {
      rec: px, names: ["ethanol", "water"], keep: interiorIndices(px.points),
      citation: { file: "thermomlShapes.synthetic.xml", block: 2, doi: shapes.doi, text: "synthetic" },
      source: "synthetic",
    };
    const p = run(pairFitCaseFiles(pin, "leastSquares", []));
    expect(p.status, p.log.slice(-2000)).toBe(0);
    const rowsP = readParity(p.csv, "P_bubble");
    expect(rowsP.length).toBe(pin.keep.length);
    expect(rowsP.every((r) => Number.isFinite(r.residual))).toBe(true);
    expect(temperaturesOf(px, pin.keep)).toBe(1);
  }, 300_000);
});
