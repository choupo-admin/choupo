/*---------------------------------------------------------------------------*\
  Data reconciliation, and how Bayes helps (DEV.md 4c C121), held to the tree.

  What it holds, block by block:
    * the shelf, the kind and the dispatch;
    * the witness: the CSV names the page reads are the ones the case
      declares, the unit is the network's, the drift the page opens on is the
      case's, and the knobs' overrides land on the words and numbers they
      mean (two drifted operations, one exclusion);
    * the plant the page draws is the network the engine reconciled;
    * the readers, on the engine's own outputs: seven streams, four balances,
      a symmetric covariance; every reconciled sigma below its meter's; the
      drifted snapshot flags exactly F3 and the removed one flags nothing;
      the excluded meter's offset test equals its in-service measurement
      test; the prior's pseudo-measurements are tighter than the readings;
    * a header that has drifted is refused, never read by position;
    * the page computes no reconciliation;
    * the lesson text: fifteen steps, all drawn, nothing quoted, every
      equation parses, and every file:line it cites lands on the statement
      it claims.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyDictOverride } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { DR_LIMITS, DR_STEPS } from "../src/ui/methods/dataReconciliationLesson.js";
import {
  DIAGRAM_EDGES, DIAGRAM_NODES, DRIFT_DEFAULT_METER, DRIFT_DEFAULT_SIZE, DR_OPS, DR_UNIT, DR_WITNESS, balancesCsv,
  covarianceCsv, driftOverrides, readBalances, readCovariance, readStreams, streamsCsv,
  type DrOp,
} from "../src/ui/methods/dataReconciliationRun.js";
import {
  BayesPage, GrossPage, PriorPage, WhyPage, opOf,
} from "../src/ui/methods/DataReconciliationTool.js";
import type { MethodRunState } from "../src/case/methodRun.js";
import { witnessOutput } from "./witnessRead.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tree = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");
const CASE = "tutorials/props/reconciliation/reconcile01_recycle_loop";
const TOOL = "gui/src/ui/methods/DataReconciliationTool.tsx";
const RUN = "gui/src/ui/methods/dataReconciliationRun.ts";
const strip = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// ---- the registry ------------------------------------------------------------------

describe("data-reconciliation: the shelf, the kind and the dispatch", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "data-reconciliation");
  it("is a live construction on the Hydraulics & control shelf", () => {
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("construction");
    expect(t?.discipline).toBe("Hydraulics & control");
    expect(t?.label).toBe("Data reconciliation, and how Bayes helps");
  });
  it("the workspace renders it", () => {
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "data-reconciliation" ? <DataReconciliationTool />');
  });
});

// ---- the witness -------------------------------------------------------------------

const props = tree(`${CASE}/system/propsDict`);
const network = strip(tree(`${CASE}/constant/plant/network`));

describe("data-reconciliation: the witness the page runs", () => {
  it("is the choupoProps case the page names", () => {
    expect(`tutorials/${DR_WITNESS}`).toBe(CASE);
    expect(tree(`${CASE}/system/controlDict`)).toMatch(/^application\s+choupoProps;/m);
    expect(tree(TOOL)).toContain('"choupoProps"');
  });
  it("declares every CSV the page reads, for every operation", () => {
    for (const op of Object.keys(DR_OPS) as DrOp[]) {
      expect(props).toMatch(new RegExp(`^\\s*name\\s+${op};`, "m"));
      for (const f of [streamsCsv(op), balancesCsv(op), covarianceCsv(op)])
        expect(props, f).toMatch(new RegExp(`\\s${f.replace(".", "\\.")};`));
    }
  });
  it("reports in the unit the page labels", () => {
    expect(network).toMatch(new RegExp(`^\\s*unit\\s+${DR_UNIT.replace("/", "\\/")}\\s*;`, "m"));
  });
  it("opens on the drift the case declares, and the knobs rewrite exactly it", () => {
    const meters = [...strip(props).matchAll(/^\s*meter\s+(\w+)\s*;/gm)].map((m) => m[1]);
    const sizes = [...strip(props).matchAll(/^\s*size\s+([-0-9.]+)\s+t\/h\s*;/gm)].map((m) => Number(m[1]));
    const excl = [...strip(props).matchAll(/^\s*exclude\s+(\w+)\s*;/gm)].map((m) => m[1]);
    expect(meters).toEqual([DRIFT_DEFAULT_METER, DRIFT_DEFAULT_METER]);
    expect(sizes).toEqual([DRIFT_DEFAULT_SIZE, DRIFT_DEFAULT_SIZE]);
    expect(excl).toEqual([DRIFT_DEFAULT_METER]);
    let t = props;
    for (const o of driftOverrides("F5", -6)) t = applyDictOverride(t, o);
    expect([...strip(t).matchAll(/^\s*meter\s+(\w+)\s*;/gm)].map((m) => m[1])).toEqual(["F5", "F5"]);
    expect([...strip(t).matchAll(/^\s*size\s+([-0-9.]+)\s+t\/h\s*;/gm)].map((m) => Number(m[1])))
      .toEqual([-6, -6]);
    expect([...strip(t).matchAll(/^\s*exclude\s+(\w+)\s*;/gm)].map((m) => m[1])).toEqual(["F5"]);
  });
});

// ---- the plant the page draws ------------------------------------------------------

describe("data-reconciliation: the drawn plant is the reconciled network", () => {
  it("every node and every stream end matches constant/plant/network", () => {
    const nodes = new Map<string, { in: string[]; out: string[] }>();
    for (const m of network.matchAll(/\b(\w+)\s*\{\s*in\s*\(([^)]*)\)\s*;\s*out\s*\(([^)]*)\)\s*;\s*\}/g))
      nodes.set(m[1]!, { in: m[2]!.trim().split(/\s+/), out: m[3]!.trim().split(/\s+/) });
    expect(DIAGRAM_NODES.map((n) => n.id).sort()).toEqual([...nodes.keys()].sort());
    const streams = [...network.matchAll(/\b(F\d+)\s*\{\s*sigma/g)].map((m) => m[1]);
    expect(Object.keys(DIAGRAM_EDGES).sort()).toEqual([...streams].sort());
    for (const [s, [from, to]] of Object.entries(DIAGRAM_EDGES)) {
      const enters = [...nodes].filter(([, n]) => n.in.includes(s)).map(([k]) => k);
      const leaves = [...nodes].filter(([, n]) => n.out.includes(s)).map(([k]) => k);
      expect(to === "out" ? [] : [to], `${s} enters`).toEqual(enters);
      expect(from === "in" ? [] : [from], `${s} leaves`).toEqual(leaves);
    }
  });
});

// ---- the engine's outputs, through the page's readers -------------------------------

const read = <T,>(r: { ok: true; read: T } | { ok: false; why: string }): T => {
  if (!r.ok) throw new Error(r.why);
  return r.read;
};
const streams = (op: DrOp) => read(readStreams(witnessOutput(CASE, streamsCsv(op))));

describe("data-reconciliation: the engine's answer, read by the page", () => {
  const honest = streams("honest");
  const drifted = streams("drifted");
  const without = streams("driftedWithout");
  const prior = streams("yesterday");
  const bal = read(readBalances(witnessOutput(CASE, balancesCsv("honest"))));
  const cov = read(readCovariance(witnessOutput(CASE, covarianceCsv("honest"))));

  it("seven streams, four balances, a symmetric covariance whose diagonal is sigma squared", () => {
    expect(honest.rows.map((r) => r.stream)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7"]);
    expect(honest.balances).toEqual(["mixer", "reactor", "separator", "splitter"]);
    expect(bal.map((b) => b.balance)).toEqual(honest.balances);
    for (let i = 0; i < 7; i++) {
      expect(cov.cell[i]![i]!).toBeCloseTo(honest.rows[i]!.sigmaReconciled ** 2, 9);
      for (let j = 0; j < 7; j++) expect(cov.cell[i]![j]!).toBeCloseTo(cov.cell[j]![i]!, 12);
    }
  });
  it("every balance closes after, and every reconciled sigma is below its meter's", () => {
    for (const b of bal) expect(Math.abs(b.residualAfter)).toBeLessThan(1e-9);
    for (const r of honest.rows) expect(r.sigmaReconciled).toBeLessThan(r.sigma!);
  });
  it("the by-balance parts add up to each adjustment", () => {
    for (const r of honest.rows) {
      const sum = Object.values(r.byBalance).reduce<number>((a, v) => a + (v ?? 0), 0);
      expect(sum).toBeCloseTo(r.adjustmentSigma!, 9);
    }
  });
  it("the drifted snapshot flags exactly F3; removing F3 flags nothing", () => {
    expect(drifted.rows.filter((r) => r.flagged).map((r) => r.stream)).toEqual(["F3"]);
    expect(without.rows.filter((r) => r.flagged).map((r) => r.stream)).toEqual([]);
    const f3 = without.rows.find((r) => r.stream === "F3")!;
    expect(f3.excluded).toBe(true);
    expect(f3.role).toBe("unmeasured");
    expect(f3.adjustment).toBeNull();
    expect(without.balances).toEqual(["mixer", "reactor+separator", "splitter"]);
  });
  it("the excluded meter's offset test is the measurement test it scored in service", () => {
    const off = without.rows.find((r) => r.stream === "F3")!.offsetTest!;
    const z = drifted.rows.find((r) => r.stream === "F3")!.measurementTest!;
    expect(Math.abs(off)).toBeCloseTo(Math.abs(z), 9);
  });
  it("a prior tightens every pseudo-measurement and every reconciled sigma", () => {
    for (const r of prior.rows) {
      expect(r.role).toBe("measuredWithPrior");
      expect(r.combinedSigma!).toBeLessThan(Math.min(r.sigma!, r.priorSigma!));
      const h = honest.rows.find((q) => q.stream === r.stream)!;
      expect(r.sigmaReconciled).toBeLessThan(h.sigmaReconciled);
    }
  });
  it("a header that has drifted is refused, never read by position", () => {
    const csv = witnessOutput(CASE, streamsCsv("honest")).replace("reconciled,sigmaReconciled",
      "sigmaReconciled,reconciled");
    expect(readStreams(csv).ok).toBe(false);
    expect(readBalances("balance,residual\nmixer,1\n").ok).toBe(false);
  });
});

// ---- the four pages render the engine's tables ---------------------------------------

describe("data-reconciliation: every page renders from the engine's own CSVs", () => {
  //  A run state built from the witness's outputs, as the browser worker
  //  hands them over.  The result JSON's diagnostics are not a declared
  //  witness output, so the verdict boxes render their dashes here.
  const csvFiles: { [f: string]: string } = {};
  for (const op of Object.keys(DR_OPS) as DrOp[])
    for (const f of [streamsCsv(op), balancesCsv(op), covarianceCsv(op)])
      csvFiles[f] = witnessOutput(CASE, f);
  const ops = (Object.keys(DR_OPS) as DrOp[])
    .map((name) => ({ name, type: "dataReconciliation", diagnostics: {} }));
  const run = { result: { csvFiles, operationResults: ops }, err: null, busy: false, log: null } as
    unknown as MethodRunState;
  const html = (el: JSX.Element): string =>
    renderToStaticMarkup(createElement(MantineProvider, null, el));
  const honest = opOf(run, "honest", "honest");
  const prior = opOf(run, "yesterday", "yesterday");
  it("reads every operation without a refusal", () => {
    for (const op of Object.keys(DR_OPS) as DrOp[]) expect(opOf(run, op, op).why).toBeNull();
  });
  it("page 1 draws the readings, the truth and the balance residuals", () => {
    const h = html(createElement(WhyPage, { honest }));
    expect(h).toContain("146.4");
    expect(h).toContain("F1 + F7 - F2 = 0");
    expect(h).toContain("A plant read at one instant");
  });
  it("page 2 draws the reconciled flows and the multipliers", () => {
    const h = html(createElement(BayesPage, { honest }));
    expect(h).toContain("99.53");
    expect(h).toContain("by reactor");
  });
  it("page 3 flags F3 and reads F3 back from the balances", () => {
    const h = html(createElement(GrossPage,
      { run, meter: "F3", size: 15, setMeter: () => {}, setSize: () => {} }));
    expect(h).toContain("F3 (flagged)");
    expect(h).toContain("(from the balances)");
    expect(h).toContain("reactor+separator");
  });
  it("page 4 draws the precision table, the covariance and the bell curves", () => {
    const h = html(createElement(PriorPage, { honest, prior }));
    expect(h).toContain("reconciled σ (with prior)");
    expect(h).toContain("polyline");
  });
});

// ---- the page computes no reconciliation --------------------------------------------

describe("data-reconciliation: the page draws, the engine computes", () => {
  it("carries no matrix algebra and no test statistic of its own", () => {
    for (const rel of [TOOL, RUN]) {
      const code = strip(tree(rel));
      for (const c of ["transpose", "inverse(", "luSolve", "chi2Tail", "chi2Upper", "erfc", "Math.pow(1 -", "lgamma"])
        expect(code, `${rel} carries ${c}`).not.toContain(c);
    }
  });
});

// ---- the lesson text -----------------------------------------------------------------

describe("data-reconciliation: the lesson text", () => {
  const all = DR_STEPS.map((s) => [s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" ")).join(" ");
  it("has fifteen steps on four pages, and the page draws every one of them", () => {
    expect(DR_STEPS.map((s) => s.n)).toEqual([...Array(15)].map((_, i) => i + 1));
    const src = tree(TOOL);
    for (const s of DR_STEPS) expect(src, `step ${s.n}`).toContain(`{step(${s.n})}`);
  });
  it("quotes nothing", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of DR_LIMITS) expect(`${l.title} ${l.body}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of DR_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("names its sources by title", () => {
    expect(all).toContain("Data Reconciliation and Gross Error Detection");
    expect(all).toContain("Data Processing and Reconciliation for Chemical Process Operations");
  });
  it("every file:line it cites lands on what it claims", () => {
    const FILES: Record<string, string> = {
      "DataReconciliation.cpp": "src/propertyOps/DataReconciliation.cpp",
      "AnalysisReconciler.cpp": "src/streams/AnalysisReconciler.cpp",
    };
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string> = {
      "DataReconciliation.cpp:524": "f.sStar = 1.0 / std::sqrt(w);",
      "DataReconciliation.cpp:673": "analysis::reconcileWeightedLeastSquares(req);",
      "DataReconciliation.cpp:701": "Sx[i][j] -= V[i][j];",
      "DataReconciliation.cpp:722": "xhat[U[i]] = u;",
      "DataReconciliation.cpp:740": "const scalar chi2Crit = chi2UpperQuantile(nu, alpha);",
      "DataReconciliation.cpp:754": "z[c] = out.rows[c].correction / std::sqrt(V[c][c]);",
      "DataReconciliation.cpp:758": "1.0 - std::pow(1.0 - alpha, 1.0 / static_cast<scalar>(nRedundant))",
      "AnalysisReconciler.cpp:248": "co.multiplierAsWritten = qr.lambdaEq[k] / rowScale[k];",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, line] = c.split(":") as [string, string];
      const src = tree(FILES[file]!).split("\n");
      expect(src[Number(line) - 1] ?? "", c).toContain(want);
    }
  });
});
