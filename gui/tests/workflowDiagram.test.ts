/*---------------------------------------------------------------------------*\
  THE WORKFLOW DIAGRAM (DEV.md 4c C172 slice 3b; Vitor, 2026-10-26: "Nas
  propriedades aquilo devia de abrir com o 'workflow' tal como a simulacao
  abre com o 'flowsheet'! ... Em qualquer um dos casos o que circula e so
  informacao!").  case/workflowDiagram.ts, pinned on the shipped cases:

    (1) one box per numbered step, studies as frames, order read from
        position (row by row inside a frame, frames in reading order);
    (2) arrows are information: from the data a step reads (FIT / HELD OUT
        where it fits), from the Flowsheet run where the step declares it
        (ctrl17), to what it writes and the views the case declares;
    (3) the boxes say what is inside them without a click;
    (4) the drawing: no two boxes overlap, every arrow joins two drawn
        nodes, and a routed arrow runs in the gaps, never across a step's box;
    (5) a study of independent steps is laid in a grid when that makes the
        whole workflow fit a laptop pane at a larger zoom.
  And the properties Reports' pure half (case/propsReports.ts).
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import type { OperationResult, RunResult } from "../src/adapters/SolverAdapter.js";
import { derivePropsMap } from "../src/case/propsMap.js";
import { workflowOutline } from "../src/case/workflowSteps.js";
import { verdictRows } from "../src/case/reviewScreen.js";
import { balancedGroups, workflowDiagram, type WorkflowDiagram } from "../src/case/workflowDiagram.js";
import { curationCsv, curationRows, resultFileRows, resultsZip, writtenRecordRows } from "../src/case/propsReports.js";
import { REPO } from "./witnessOutputs.js";

function caseOf(dir: string) {
  const root = join(REPO, dir);
  const raw: Record<string, string> = {};
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== "postProcessing") walk(p); }
      else raw[relative(root, p)] = readFileSync(p, "utf-8");
    }
  };
  walk(join(root, "system"));
  walk(join(root, "constant"));
  const propsDict = toJson(parse(raw["system/propsDict"]!));
  const thermo = raw["constant/thermoPhysPropDict"] ? toJson(parse(raw["constant/thermoPhysPropDict"]!)) : null;
  const flowsheet = raw["system/flowsheetDict"] ? toJson(parse(raw["system/flowsheetDict"]!)) : null;
  return { raw, propsDict, thermo, flowsheet };
}

function diagramOf(dir: string, results: OperationResult[] = []) {
  const c = caseOf(dir);
  const map = derivePropsMap({ propsDict: c.propsDict, thermo: c.thermo, rawFiles: c.raw, flowsheet: c.flowsheet });
  const outline = workflowOutline(c.propsDict);
  const ops = (c.propsDict["operations"] ?? []) as JsonDict[];
  const rows = verdictRows(ops, results, undefined, results.length ? "done" : undefined, c.propsDict);
  return { ...c, outline, rows, d: workflowDiagram({ outline, map, propsDict: c.propsDict, rows }) };
}

const NF = "tutorials/props/membrane/nanofiltran_geraldesAlves2008";
const CUR = "tutorials/props/curation/curate02_vle_heldout_ethanol_water";
const C17 = "tutorials/ctrl/ctrl17_step_reaction_curve";
const M24 = "tutorials/steady/membranes/membrane24_fit_then_simulate";

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function drawingHolds(d: WorkflowDiagram) {
  const boxes = [...d.steps, ...d.terminals];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i]!, boxes[j]!), `${boxes[i]!.id} overlaps ${boxes[j]!.id}`).toBe(false);
  const ids = new Set(boxes.map((b) => b.id));
  for (const e of d.edges) {
    expect(ids.has(e.from), e.from).toBe(true);
    expect(ids.has(e.to), e.to).toBe(true);
  }
  //  a routed arrow runs in the gaps: no segment crosses the INSIDE of a
  //  step's box (its own two ends excepted)
  for (const e of d.edges) {
    if (!e.route) continue;
    for (let k = 1; k < e.route.length; k++) {
      const a = e.route[k - 1]!, b = e.route[k]!;
      expect(a.x === b.x || a.y === b.y, `${e.id} is orthogonal`).toBe(true);
      for (const s of d.steps) {
        if (s.id === e.from || s.id === e.to) continue;
        const inside = { x: s.x + 1, y: s.y + 1, w: s.w - 2, h: s.h - 2 };
        const seg = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) || 0.01, h: Math.abs(a.y - b.y) || 0.01 };
        expect(overlap(seg, inside), `${e.id} crosses ${s.id}`).toBe(false);
      }
    }
  }
}

describe("(1)-(4) NanoFiltran: three studies, nine steps, the declared views as products", () => {
  const { d } = diagramOf(NF);
  it("one box per step, a frame per study, numbered as the outline numbers them", () => {
    expect(d.frames.map((f) => f.letter)).toEqual(["A", "B", "C"]);
    expect(d.steps.map((s) => s.number)).toEqual(["A.1", "A.2", "A.3", "A.4", "A.5", "A.6", "B.1", "B.2", "C.1"]);
    expect(d.steps.find((s) => s.number === "B.1")!.runs).toBe(5);
    //  order reads from position: inside a frame, row by row
    const a = d.steps.filter((s) => s.studyId === "study:A");
    for (let i = 1; i < a.length; i++)
      expect(a[i]!.y > a[i - 1]!.y || (a[i]!.y === a[i - 1]!.y && a[i]!.x > a[i - 1]!.x)).toBe(true);
  });
  it("the records feed in on the left, the case's declared figures and tables leave on the right", () => {
    const feeds = d.terminals.filter((t) => t.side === "feed");
    expect(new Set(feeds.map((t) => t.label))).toEqual(new Set(["NanoFiltranExample", "NanoFiltranExampleNoBorn", "CA30_BowenMohammad"]));
    expect(feeds.every((t) => t.detail === "record")).toBe(true);
    const views = d.terminals.filter((t) => t.side === "product" && (t.detail === "figure" || t.detail === "table"));
    expect(views.map((t) => t.label)).toContain("fig3_dye4");
    expect(views.find((t) => t.label === "fig3_dye4_table")!.detail).toBe("table");
    //  codeToCode is fed by all six steps of A: ONE terminal, six arrows
    const c2c = d.terminals.filter((t) => t.label === "codeToCode");
    expect(c2c).toHaveLength(1);
    expect(d.edges.filter((e) => e.to === c2c[0]!.id)).toHaveLength(6);
  });
  it("each box says what is inside it: type, model, what it reads, the views it feeds, its state", () => {
    const b1 = d.steps.find((s) => s.number === "B.1")!;
    const text = b1.lines.map((l) => l.text).join(" | ");
    expect(text).toMatch(/poreTransport · 5 runs/);
    expect(text).toMatch(/model DSPM-DE/);
    expect(text).toMatch(/reads CA30_BowenMohammad/);
    expect(text).toMatch(/feeds 1 figure, 1 table/);
    expect(b1.lines.at(-1)!.text).toMatch(/not run/);
  });
  it("(4) no overlap, every arrow joins drawn nodes, routes stay in the gaps", () => drawingHolds(d));
  it("(5) study A's six independent steps are laid in more than one column", () => {
    const xs = new Set(d.steps.filter((s) => s.studyId === "study:A").map((s) => s.x));
    expect(xs.size).toBeGreaterThan(1);
  });
});

describe("(2) curate02: a fit reads its evidence FIT and HELD OUT, and writes its proposal", () => {
  const { d } = diagramOf(CUR);
  it("the arrows carry the roles", () => {
    expect(d.edges.filter((e) => e.wire === "measured").map((e) => e.label).sort()).toEqual(["FIT", "HELD OUT"]);
    expect(d.terminals.filter((t) => t.side === "product").map((t) => t.label))
      .toEqual(["fit_history.csv", "parity.csv", "ethanol-water.proposal.dat"]);
    const box = d.steps[0]!.lines.map((l) => l.text).join(" | ");
    expect(box).toMatch(/FIT etoh-water-101kPa-fit\.dat/);
    expect(box).toMatch(/HELD OUT etoh-water-101kPa-heldout\.dat/);
    expect(box).toMatch(/by LevenbergMarquardt/);
    expect(box).toMatch(/model gammaPhi · NRTL · idealGas/);
  });
  it("a run adds the state and the verdict, never a box", () => {
    const ran = diagramOf(CUR, [{ name: "nrtl_etoh_water_heldout", type: "fitParameters", diagnostics: { aad_heldout_pct: 0.07 },
      curation: { verdict: "validated" } }]);
    expect(ran.d.steps).toHaveLength(d.steps.length);
    expect(ran.d.terminals).toHaveLength(d.terminals.length);
    expect(ran.d.steps[0]!.lines.at(-1)!.text).toMatch(/✓ done · validated/);
  });
  it("(4)", () => drawingHolds(d));
});

describe("(2) ctrl17: what the process run writes enters from a 'Flowsheet run' terminal", () => {
  const { d } = diagramOf(C17);
  it("one process terminal, an arrow to each step labelled with the file", () => {
    const p = d.terminals.filter((t) => t.side === "process");
    expect(p).toHaveLength(1);
    expect(p[0]!.label).toBe("Flowsheet run");
    expect(d.edges.filter((e) => e.from === p[0]!.id).map((e) => [e.wire, e.label]))
      .toEqual([["process", "trajectory.csv"], ["process", "trajectory.csv"]]);
    expect(d.terminals.filter((t) => t.side === "feed")).toHaveLength(0);
  });
  it("(4)", () => drawingHolds(d));
});

describe("(2) membrane24 (both homes): the record the fit writes is read by the Flowsheet's unit", () => {
  const { d } = diagramOf(M24);
  it("the product says who reads it", () => {
    const rec = d.terminals.find((t) => t.label === "NF270_FdL2021.dat")!;
    expect(rec.side).toBe("product");
    expect(rec.detail).toMatch(/read by the Flowsheet's/);
    expect(d.terminals.filter((t) => /HELD OUT/.test(t.detail))).toHaveLength(2);
  });
  it("(4)", () => drawingHolds(d));
});

describe("the packing's groups keep reading order", () => {
  it("balancedGroups splits in order, the largest group as small as it can be", () => {
    expect(balancedGroups([100, 100, 100, 100], 2)).toEqual([[0, 1], [2, 3]]);
    expect(balancedGroups([300, 50, 50], 2)).toEqual([[0], [1, 2]]);
    expect(balancedGroups([], 2)).toEqual([]);
  });
});

describe("the properties Reports (case/propsReports.ts)", () => {
  const { outline, propsDict, rows: _r } = diagramOf(CUR);
  void _r;
  const results: OperationResult[] = [{ name: "nrtl_etoh_water_heldout", type: "fitParameters",
    diagnostics: { aad_heldout_pct: 0.0736, identifiable: 1 }, units: { aad_heldout_pct: "%" },
    curation: { verdict: "validated", acceptanceMaxAADPct: "0.1", acceptanceUnit: "percent",
      acceptanceOrigin: "declared", partitionFingerprint: "697a886d6caee2ac" } }];
  const ops = (propsDict["operations"] ?? []) as JsonDict[];
  const rows = verdictRows(ops, results, undefined, "done", propsDict);
  const result: RunResult = { status: "done", log: "", streams: [], convergence: [], operationResults: results,
    csvFiles: { "parity.csv": "x,y\n1,2\n3,4\n", "constant/experiments/a.csv": "x\n1\n", "postProcessing/parityView.csv": "a,b\n1,2\n" },
    proposals: { "ethanol-water.proposal.dat": "provenance { evidence { fingerprint \"697a\"; } }\n" } };
  it("one curation row per judged step: verdict, identifiability, band in its unit, held out in its unit", () => {
    const c = curationRows(rows, results, outline);
    expect(c).toEqual([{ step: "1", op: "nrtl_etoh_water_heldout", type: "fitParameters", verdict: "validated",
      identifiable: true, band: "0.1 percent (declared)", heldOut: "0.0736 %", inSample: "",
      fingerprint: "697a886d6caee2ac" }]);
    expect(curationCsv(c).split("\n")[0]).toBe("step,operation,type,verdict,identifiable,band,heldOut,inSample,partitionFingerprint");
  });
  it("the proposal the run wrote, with its writer and its fingerprint", () => {
    const w = writtenRecordRows(result, outline, propsDict);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ path: "ethanol-water.proposal.dat", kind: "proposal", step: "1",
      fingerprints: [{ key: "provenance.evidence.fingerprint", value: "697a" }] });
  });
  it("the files: never the case's own input data; a view's table names its view", () => {
    const f = resultFileRows(result, outline, propsDict);
    expect(f.map((x) => x.path)).toEqual(["parity.csv", "postProcessing/parityView.csv"]);
    expect(f[0]).toMatchObject({ step: "1", rows: 2, columns: 2 });
    expect(f[1]!.view).toBe("parityView");
  });
  it("one zip of everything the run produced, with the verdicts", () => {
    const z = resultsZip("props/curation/curate02_vle_heldout_ethanol_water", result, curationRows(rows, results, outline))!;
    expect(z.fileName).toBe("curate02_vle_heldout_ethanol_water-results.zip");
    const files = unzipSync(z.bytes);
    expect(Object.keys(files).sort()).toEqual([
      "curate02_vle_heldout_ethanol_water-results/curationVerdicts.csv",
      "curate02_vle_heldout_ethanol_water-results/ethanol-water.proposal.dat",
      "curate02_vle_heldout_ethanol_water-results/parity.csv",
      "curate02_vle_heldout_ethanol_water-results/postProcessing/parityView.csv",
    ]);
    expect(strFromU8(files["curate02_vle_heldout_ethanol_water-results/parity.csv"]!)).toBe("x,y\n1,2\n3,4\n");
    expect(resultsZip("x", undefined, [])).toBeNull();
  });
});
