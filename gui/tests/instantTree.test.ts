/*  C482 part 1: a time-integrated run's instant directories in the Case tree.
 *  Real defect each test would catch: the first run of nox03 in the browser
 *  showed only the case files and 0/, because the worker threw the instant
 *  directories away with MEMFS.  */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  TREE_MAX_INSTANTS, pickInstants, mergeInstantTree, instantAccount, isInstantName,
} from "../src/case/instantTree";
import { buildTree, squash, sortedChildren, kindOf, isRunOutput } from "../src/ui/caseTree";

const worker = readFileSync(resolve(__dirname, "..", "public/workers/solverWorker.js"), "utf8");

describe("instant directories: order", () => {
  it("the tree orders instants by TIME, numerically", () => {
    const names = ["10", "2", "0.001", "0.000001", "100", "1e-06"];
    const files = names.map((n) => `${n}/internalStates/tank`);
    const t = squash(buildTree(files));
    const order = sortedChildren(t).map((n) => n.label.split("/")[0]!);
    expect(order.map(parseFloat)).toEqual([...names.map(parseFloat)].sort((a, b) => a - b));
    expect(order.indexOf("1e-06")).toBeLessThan(order.indexOf("0.001"));
    expect(order.indexOf("2")).toBeLessThan(order.indexOf("10"));
  });
  it("0/ stays the authored state; instants and trajectory.csv are run output", () => {
    expect(kindOf("0")).toBe("state0");
    expect(kindOf("0.5")).toBe("output");
    expect(kindOf("1e-06")).toBe("output");
    expect(kindOf("trajectory.csv")).toBe("output");
    expect(isRunOutput("trajectory.csv")).toBe(true);
    expect(isInstantName("0")).toBe(false);
  });
});

describe("instant directories: the cap", () => {
  const dirs = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
  it("keeps everything at or under the cap", () => {
    expect(pickInstants(dirs(92))).toEqual(dirs(92));
    expect(pickInstants(dirs(TREE_MAX_INSTANTS))).toHaveLength(TREE_MAX_INSTANTS);
  });
  it("over the cap: exactly the cap, first and last kept, increasing, evenly spread", () => {
    const d = dirs(1043);
    const p = pickInstants(d);
    expect(p).toHaveLength(TREE_MAX_INSTANTS);
    expect(p[0]).toBe("1");
    expect(p[p.length - 1]).toBe("1043");
    const idx = p.map((x) => d.indexOf(x));
    for (let k = 1; k < idx.length; k++) expect(idx[k]!).toBeGreaterThan(idx[k - 1]!);
    const gaps = idx.slice(1).map((v, k) => v - idx[k]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });
  it("the worker's mirrored pickInstants gives the same answers", () => {
    const m = worker.match(/const pickInstants = \(dirs, max\) => \{[\s\S]*?\n              \};/);
    expect(m).not.toBeNull();
    const fn = new Function(m![0] + "; return pickInstants;")() as (d: string[], n: number) => string[];
    for (const n of [1, 5, 200, 201, 400, 1043, 5000]) {
      expect(fn(dirs(n), TREE_MAX_INSTANTS)).toEqual(pickInstants(dirs(n)));
    }
    expect(worker).toMatch(new RegExp(`TREE_MAX_INSTANTS = ${TREE_MAX_INSTANTS};`));
  });
  it("says how many were written and shown", () => {
    expect(instantAccount({ written: 1043, shown: 200 })).toMatch(/200 of 1043/);
    expect(instantAccount({ written: 92, shown: 92 })).toMatch(/92 instants written, all shown/);
    expect(instantAccount(undefined)).toBe("");
  });
});

describe("instant directories: the merge is display-only and read-only", () => {
  const authored = { "system/controlDict": "a", "0/tank": "start" };
  const tree = { files: {
    "0.5/internalStates/tank": "x", "trajectory.csv": "t,y", "0/tank": "EVIL", "stray": "no",
  } };
  it("adds instants and trajectory.csv, never replaces 0/ or authored files, ignores strays", () => {
    const m = mergeInstantTree(authored, [{ "converged/s": "c" }], tree);
    expect(m["0.5/internalStates/tank"]).toBe("x");
    expect(m["trajectory.csv"]).toBe("t,y");
    expect(m["0/tank"]).toBe("start");
    expect(m["converged/s"]).toBe("c");
    expect("stray" in m).toBe(false);
  });
  it("does not mutate the authored map (caseFiles stays what the student wrote)", () => {
    const before = JSON.stringify(authored);
    mergeInstantTree(authored, [], tree);
    expect(JSON.stringify(authored)).toBe(before);
  });
  it("the wiring: own channel, never folded into convergedFiles, merged in the workspace", () => {
    const adapter = readFileSync(resolve(__dirname, "..", "src/adapters/WasmAdapter.ts"), "utf8");
    const ws = readFileSync(resolve(__dirname, "..", "src/ui/CaseWorkspace.tsx"), "utf8");
    expect(worker).toContain('type: "instantTreeFiles"');
    expect(adapter).toContain('msg.type === "instantTreeFiles"');
    expect(ws).toContain("runResult?.instantTree");
    expect(ws).toContain("mergeInstantTree(");
    expect(worker).not.toMatch(/outputs\.converged\[[^\]]*\]\s*=[^;]*instant/i);
  });
});
