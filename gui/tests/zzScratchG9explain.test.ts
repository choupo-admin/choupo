import { it } from "vitest";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import { measureLayout } from "../src/case/layoutMetrics.js";
import { collectViews } from "./flowsheetCorpusViews.js";

it("explain", () => {
  const want = (process.env.G9_VIEWS ?? "").split(",");
  for (const v of collectViews()) {
    if (!want.includes(v.id)) continue;
    const g = flowsheetToGraph(v.flowsheet, v.raw);
    const ex: string[] = [];
    const m = measureLayout(g, undefined, true, ex);
    console.log("=== " + v.id, JSON.stringify(m));
    console.log(ex.join("\n"));
  }
});
