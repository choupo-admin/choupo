import { it } from "vitest";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import { collectViews } from "./flowsheetCorpusViews.js";

it("cols", () => {
  (globalThis as { __G9?: boolean }).__G9 = !!process.env.G9_DEBUG;
  const want = (process.env.G9_VIEWS ?? "batch/plant/apalutamide01_tablets").split(",");
  for (const v of collectViews()) {
    if (!want.includes(v.id)) continue;
    const g = flowsheetToGraph(v.flowsheet, v.raw);
    const cols = new Map<number, string[]>();
    for (const n of g.nodes) {
      if (n.id.startsWith("stub") || n.type === "utilityStub") continue;
      const s = g.sizes.get(n.id)!;
      const cx = Math.round(n.position.x + s.width / 2);
      cols.set(cx, [...(cols.get(cx) ?? []), `${n.id}@${n.position.y}`]);
    }
    console.log("=== " + v.id);
    for (const [cx, ids] of [...cols].sort((a, b) => a[0] - b[0])) console.log(cx, ids.join("  "));
    for (const e of g.edges) if ((e.data as { kind?: string; backEdge?: boolean })?.kind === "tear" || (e.data as { backEdge?: boolean })?.backEdge) console.log("BACK", e.id);
  }
});
