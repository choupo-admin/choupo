import { writeFileSync } from "node:fs";
import { getViewportForBounds } from "@xyflow/react";
import { it } from "vitest";
import { flowsheetToGraph } from "../src/case/toGraph.js";
import { measureLayout } from "../src/case/layoutMetrics.js";
import { boundsOf, FLOWSHEET_FIT_PADDING } from "../src/ui/flowsheetViewport.js";
import { collectViews } from "./flowsheetCorpusViews.js";

it("dump", () => {
  const out: Record<string, unknown> = {};
  for (const v of collectViews()) {
    const g = flowsheetToGraph(v.flowsheet, v.raw);
    const m = measureLayout(g);
    const b = boundsOf(g.nodes.map((n) => ({ x: n.position.x, y: n.position.y, ...(g.sizes.get(n.id) ?? { width: 190, height: 84 }) })));
    const z = getViewportForBounds(b, 1280, 653, 0, Infinity, FLOWSHEET_FIT_PADDING).zoom;
    out[v.id] = { ...m, cho: !!v.cho, w: Math.round(b.width), h: Math.round(b.height), zoom: +z.toFixed(4) };
  }
  writeFileSync(process.env.G9_OUT ?? "/tmp/g9.json", JSON.stringify(out, null, 1));
});
