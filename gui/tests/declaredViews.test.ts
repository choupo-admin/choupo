/*  C271: a flowsheet case's declared views reach the GUI in declaration order
 *  (the block the engine writes, types policed by shapePostProcessing), and
 *  the run strip counts them; a case that declares none shows none. */
import { describe, expect, it } from "vitest";
import type { RunResult } from "../src/adapters/SolverAdapter.js";
import { declaredViewsOf, shapePostProcessing } from "../src/case/postProcessing.js";
import { runSummary } from "../src/case/runSummary.js";

const plot = (name: string) => ({
  name, op: "", origin: "declared", type: "parity", kind: "plot", title: name,
  note: "read it right", file: `postProcessing/case/${name}.csv`,
  xAxis: { label: "measured", unit: "%", scale: "log" }, yAxis: { label: "Choupo", unit: "%", scale: "log" },
  series: [{ name: "s", label: "s", role: "computed", style: "markers", group: "", source: "pairs",
    x: { unit: "%" }, y: { unit: "%" }, yError: false, points: 2 }],
});
const table = (name: string) => ({
  name, op: "", origin: "declared", type: "table", kind: "table", shape: "rows", title: name, note: "",
  file: `postProcessing/case/${name}.csv`,
  columns: [{ name: "a", label: "a", unit: "%" }], rows: [{ name: "r", label: "r", role: "computed", source: "x", relative: false, unit: "" }],
});

describe("a flowsheet case's declared views (C271)", () => {
  const block = shapePostProcessing({ source: "system/postDict views", directory: "postProcessing",
    references: [{ name: "k", file: "constant/reference/k.csv", role: "experiment", citation: "c" }],
    defaults: [], items: [plot("parity_products"), table("table_measured"), plot("profile")] });

  it("keeps the declaration order and each view's note", () => {
    const items = declaredViewsOf(block);
    expect(items.map((i) => i.name)).toEqual(["parity_products", "table_measured", "profile"]);
    expect(items[0]!.note).toBe("read it right");
  });
  it("the run summary counts the declared views, and none where there are none", () => {
    const r = { status: "done", log: "", convergence: [], streams: [], postProcessing: block } as unknown as RunResult;
    expect(runSummary(r).declaredViews).toBe(3);
    expect(runSummary({ ...r, postProcessing: undefined } as RunResult).declaredViews).toBe(0);
    expect(declaredViewsOf(undefined)).toEqual([]);
  });
});
