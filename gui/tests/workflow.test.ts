/*---------------------------------------------------------------------------*\
  THE WORKFLOW (DEV.md 4c C172 slice 3; docs/design/one-app-two-homes.md
  item 3): a properties case's home -- the outline of its studies and their
  numbered steps, the inspector of a step, the calculation map behind
  View > Calculation map -- and the ONE home of what a step reads and writes,
  the engine's file-traffic table (gui/schemas/propsFileTraffic.json,
  generated from `choupoProps --file-traffic`; bin/curate/check_props_order.py
  arm (c) holds it to the engine).

    (1) the steps are the declared operations in DECLARED order, numbered
        within each study (A.1, B.2), the implicit study numbered 1, 2, 3; a
        SET OF RUNS -- consecutive operations of one type a declared view
        draws together -- is ONE step (NanoFiltran: the five feed points of
        each dye, the six node counts of the grid study);
    (2) what a step reads and writes is resolved on its own dict through the
        engine's table, defaults included, with the process run named where
        the step declares it (ctrl17); the schemas keep no copy of the writes;
    (3) the fingerprints a written record states are read off its text;
    (4) the map is closed by default and View > Calculation map is its door.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { declaredRunSets, stepLabel, stepOfOp, workflowOutline } from "../src/case/workflowSteps.js";
import {
  opFiles, recordWriteSlots, trafficOf, trafficTypes, writtenFingerprints,
} from "../src/case/fileTraffic.js";
import { declaredCaseWrites } from "../src/case/caseWrites.js";
import { useStore } from "../src/state/store.js";
import { REPO } from "./witnessOutputs.js";

const propsDictOf = (rel: string): JsonDict =>
  toJson(parse(readFileSync(join(REPO, "tutorials", rel, "system/propsDict"), "utf8")));

const NF = "props/membrane/nanofiltran_geraldesAlves2008";

describe("(1) the outline: studies and their numbered steps", () => {
  it("NanoFiltran: three studies lettered by position, the sets of runs one step each", () => {
    const o = workflowOutline(propsDictOf(NF));
    expect(o.map((s) => s.letter)).toEqual(["A", "B", "C"]);
    expect(o.map((s) => s.id)).toEqual(["study:A", "study:B", "study:C"]);
    expect(o[0]!.steps.map((s) => s.number)).toEqual(["A.1", "A.2", "A.3", "A.4", "A.5", "A.6"]);
    expect(o[0]!.steps.every((s) => s.ops.length === 1)).toBe(true);
    expect(o[1]!.steps.map((s) => [s.number, s.ops])).toEqual([
      ["B.1", ["dye4_p1", "dye4_p2", "dye4_p3", "dye4_p4", "dye4_p5"]],
      ["B.2", ["dye37_p1", "dye37_p2", "dye37_p3", "dye37_p4", "dye37_p5"]],
    ]);
    expect(o[2]!.steps.map((s) => [s.number, s.ops.length])).toEqual([["C.1", 6]]);
    //  a step's id is its first operation's map id, and any run finds it
    expect(o[1]!.steps[0]!.id).toBe("op:dye4_p1");
    expect(stepOfOp(o, "dye4_p3")?.step.number).toBe("B.1");
    expect(stepLabel(o[2]!.steps[0]!)).toBe("N10 … N350");
  });

  it("the grouping is the case's own declaration: a view's `ops ( ... )` series", () => {
    const sets = declaredRunSets(propsDictOf(NF));
    expect(sets.some((s) => s.join() === "N10,N20,N50,N100,N200,N350")).toBe(true);
    //  with no view drawing them together, the same operations are six steps
    const pd = propsDictOf(NF);
    delete pd["views"];
    expect(workflowOutline(pd)[2]!.steps.map((s) => s.number)).toEqual(["C.1", "C.2", "C.3", "C.4", "C.5", "C.6"]);
  });

  it("a set of runs needs CONSECUTIVE operations of ONE type", () => {
    const pd: JsonDict = {
      operations: [
        { name: "a1", type: "propertyScan1D" }, { name: "b", type: "speciate" },
        { name: "a2", type: "propertyScan1D" }, { name: "a3", type: "propertyScan1D" },
      ],
      views: [{ name: "v", series: [{ name: "s", ops: ["a1", "a2", "a3"] }] }],
    };
    expect(workflowOutline(pd)[0]!.steps.map((s) => s.ops)).toEqual([["a1"], ["b"], ["a2", "a3"]]);
  });

  it("a case with no declared study is ONE implicit study numbered 1, 2, 3; unclaimed operations follow the studies", () => {
    const flat = workflowOutline(propsDictOf("props/curation/curate02_vle_heldout_ethanol_water"));
    expect(flat.map((s) => [s.id, s.letter, s.declared])).toEqual([["study:", "", false]]);
    expect(flat[0]!.steps.map((s) => s.number)).toEqual(["1"]);
    const pd: JsonDict = {
      studies: [{ name: "X", title: "X", purpose: "demonstration", ops: ["b"] }],
      operations: [{ name: "a", type: "speciate" }, { name: "b", type: "speciate" }],
    };
    const o = workflowOutline(pd);
    expect(o.map((s) => [s.id, s.letter])).toEqual([["study:X", "A"], ["study:-", "B"]]);
    expect(o[1]!.steps.map((s) => [s.number, s.ops[0], s.position])).toEqual([["B.1", "a", 0]]);
  });
});

describe("(2) what a step reads and writes: the engine's table, one home", () => {
  it("the published table carries every type the op schemas declare a map for, and no schema keeps a copy of the writes", () => {
    const types = trafficTypes();
    expect(types).toContain("fitParameters");
    const dir = join(REPO, "gui/schemas/operations");
    for (const f of readdirSync(dir)) {
      const x = JSON.parse(readFileSync(join(dir, f), "utf8"))["x-choupo"];
      expect(x?.writes, `${f} keeps its own x-choupo.writes`).toBeUndefined();
    }
  });

  it("a fit writes its record into the case and its proposal through the engine's keys", () => {
    expect(recordWriteSlots("fitParameters").map((s) => [s.key, s.kind]))
      .toEqual([["output.proposal", "proposal"], ["output.record", "record"]]);
    expect(recordWriteSlots("ppr78Kij").map((s) => s.key)).toEqual(["output.record"]);
    //  and the worker's read-back of the case's records reads the same
    const m24 = propsDictOf("steady/membranes/membrane24_fit_then_simulate");
    expect(declaredCaseWrites(m24).map((w) => w.path)).toEqual(["constant/assets/NF270_FdL2021.dat"]);
  });

  it("ctrl17: the trajectory is a read the process run writes, and the engine's default fills an absent key", () => {
    const pd = propsDictOf("ctrl/ctrl17_step_reaction_curve");
    const op = (pd["operations"] as JsonDict[])[0]!;
    const reads = opFiles(op, "reactionCurve").filter((f) => f.dir === "read");
    expect(reads).toEqual([{ dir: "read", key: "trajectory", kind: "file", value: "trajectory.csv",
      defaulted: false, byProcess: true }]);
    const bare = opFiles({ name: "x", type: "reactionCurve" }, "reactionCurve").filter((f) => f.dir === "read");
    expect(bare[0]).toMatchObject({ value: "trajectory.csv", defaulted: true, byProcess: false });
    //  a by-construction read (key "") is the engine's own default path
    expect(opFiles({ name: "r", type: "rateLawBench" }, "rateLawBench")[0])
      .toMatchObject({ dir: "read", key: "", value: "constant/reactions" });
    expect(trafficOf("noSuchOperation")).toBeNull();
  });
});

describe("(3) the fingerprints a written record states", () => {
  it("every `fingerprint` and `*Sha256` key, with its path; none from a text that says none", () => {
    const text = `name X;\nfit\n{\n    fitBlockSha256 "abc";\n    recordSha256 "def";\n}\n`
      + `provenance\n{\n    evidence\n    {\n        fingerprint "697a";\n    }\n}\n`;
    expect(writtenFingerprints(text)).toEqual([
      { key: "fit.fitBlockSha256", value: "abc" }, { key: "fit.recordSha256", value: "def" },
      { key: "provenance.evidence.fingerprint", value: "697a" },
    ]);
    expect(writtenFingerprints("name X;\n")).toEqual([]);
    expect(writtenFingerprints(undefined)).toEqual([]);
  });
});

describe("(4) the calculation map is behind View > Calculation map, closed by default", () => {
  it("the store opens on the steps, never on the map", () => {
    expect(useStore.getState().propsMapOpen).toBe(false);
    useStore.getState().setPropsMapOpen(true);
    expect(useStore.getState().propsMapOpen).toBe(true);
    useStore.getState().setPropsMapOpen(false);
  });

  it("the View menu is its door, offered only while the Workflow is on screen", () => {
    const src = readFileSync(join(REPO, "gui/src/ui/MenuBar.tsx"), "utf8");
    expect(src).toMatch(/workflowOnScreen && !shape\.collapsed && \(\s*<TopMenu label="View"/);
    expect(src).toMatch(/Calculation map\s*<\/Menu\.Item>/);
    expect(src).toContain("setPropsMapOpen(!propsMapOpen)");
  });
});
