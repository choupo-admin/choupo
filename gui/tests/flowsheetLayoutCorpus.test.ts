/*---------------------------------------------------------------------------*\
  THE AUTOMATIC LAYOUT, MEASURED OVER THE WHOLE CORPUS (DEV.md 4c C59).

  Every tutorial flowsheet the canvas can draw -- each case's root view and
  every sector view below it -- is laid out twice: by the previous layout
  (tests/layoutLegacy.ts, frozen at 14077fb31) and by the current one
  (case/flowsheetLayout.ts via flowsheetToGraph), and both drawings are
  measured with the SAME yardstick (case/layoutMetrics.ts) on the same boxes.

  What it pins:
    - on every view with NO curated `.cho` layout (the ones the automatic
      layout actually draws), the new drawing is not worse than the old one
      by the defect score (overlaps, wires through boxes, crossings), and it
      has no overlapping boxes at all;
    - the corpus totals improve.
  What it REPORTS and does not pin: the views that ship a curated `.cho`
  layout, with that layout's own score beside the automatic one's -- which
  of them is worse is Vítor's call, not this test's (C55: the 45 curated
  layouts travel with their cases).

  Set C59_LAYOUT_REPORT=1 to print the per-view table.
\*---------------------------------------------------------------------------*/

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph, type FlowsheetGraph } from "../src/case/toGraph.js";
import { layoutScore, measureLayout, type LayoutMetrics } from "../src/case/layoutMetrics.js";
import type { XY } from "../src/case/flowsheetLayout.js";
import { resolveArrangement } from "../src/case/stubDocking.js";
import { layoutFromChoText } from "../src/state/layout.js";
import { legacyPositions } from "./layoutLegacy.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");
const CATEGORIES = ["steady", "unsteady", "ctrl", "batch", "props", "plant"];

/** Every folder carrying a flowsheetDict, with the files toGraph reads,
 *  keyed relative to that folder (as the canvas receives them). */
interface View { id: string; dir: string; flowsheet: JsonDict; raw: { [rel: string]: string }; cho?: string }

function filesUnder(dir: string, base: string, out: { [rel: string]: string }): void {
  for (const nm of readdirSync(dir)) {
    const p = join(dir, nm);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (/^(converged|design|reports|iterations|constant|docs|ai|\d.*)$/.test(nm) && nm !== "0") continue;
      filesUnder(p, base, out);
    } else if (nm === "flowsheetDict" || nm === "solverDict" || nm.endsWith(".cho")) {
      out[relative(base, p)] = readFileSync(p, "utf8");
    }
  }
}

function flowsheetPath(dir: string): string | undefined {
  for (const p of [join(dir, "system", "flowsheetDict"), join(dir, "flowsheetDict")])
    if (existsSync(p)) return p;
  return undefined;
}

function collectViews(): View[] {
  const views: View[] = [];
  const visit = (dir: string) => {
    const fp = flowsheetPath(dir);
    if (fp) {
      let fs: JsonDict | undefined;
      try { fs = toJson(parse(readFileSync(fp, "utf8"), { sourceName: fp })) as JsonDict; }
      catch { fs = undefined; }
      // A leaf (one unit in its own folder) is not a flowsheet a reader
      // arranges; only flat lists and composites are measured.
      if (fs && fs["type"] === undefined && (fs["units"] !== undefined || fs["sectors"] !== undefined)) {
        const raw: { [rel: string]: string } = {};
        filesUnder(dir, dir, raw);
        const marker = readdirSync(dir).find((n) => n.endsWith(".cho"));
        views.push({
          id: relative(TUTORIALS, dir), dir, flowsheet: fs, raw,
          cho: marker ? readFileSync(join(dir, marker), "utf8") : undefined,
        });
      }
    }
    for (const nm of readdirSync(dir)) {
      if (/^(system|constant|0|converged|design|reports|iterations|docs|ai|curation)$/.test(nm)) continue;
      const p = join(dir, nm);
      try { if (statSync(p).isDirectory()) visit(p); } catch { /* skip */ }
    }
  };
  for (const c of CATEGORIES) {
    const root = join(TUTORIALS, c);
    if (existsSync(root)) visit(root);
  }
  return views;
}

function curatedPositions(graph: FlowsheetGraph, cho: string): Map<string, XY> | null {
  const saved = layoutFromChoText(cho);
  if (Object.keys(saved.nodes).length === 0) return null;
  const nb = new Map<string, string[]>();
  for (const e of graph.edges) {
    nb.set(e.source, [...(nb.get(e.source) ?? []), e.target]);
    nb.set(e.target, [...(nb.get(e.target) ?? []), e.source]);
  }
  // The SAME resolution the canvas draws (case/stubDocking.ts): saved units
  // and terminals exactly, every stub docked on its unit.
  return resolveArrangement(
    graph.nodes.map((n) => n.id), new Map(graph.nodes.map((n) => [n.id, n.position])), saved,
    (id) => { const s = graph.sizes.get(id) ?? { width: 190, height: 84 }; return { w: s.width, h: s.height }; },
    (id) => nb.get(id) ?? [],
  );
}

interface Row { id: string; old: LayoutMetrics; neu: LayoutMetrics; curated?: LayoutMetrics; nUnits: number }

const VIEWS = collectViews();
const ROWS: Row[] = VIEWS.map((v) => {
  const g = flowsheetToGraph(v.flowsheet, v.raw);
  const old = measureLayout(g, legacyPositions(g), false);
  const neu = measureLayout(g);
  const cp = v.cho ? curatedPositions(g, v.cho) : null;
  return { id: v.id, old, neu, nUnits: g.view.units.length,
           ...(cp ? { curated: measureLayout(g, cp, false) } : {}) };
});

const fmt = (m: LayoutMetrics) =>
  `x${m.crossings} thru${m.throughNodes} ovl${m.overlaps} bends${m.bends} len${m.length}`;
const sum = (rows: Row[], k: "old" | "neu", f: keyof LayoutMetrics) =>
  rows.reduce((a, r) => a + r[k][f], 0);

// Views where the new drawing scores worse than the old, each with the
// reason it is accepted.  Empty is the goal; an entry needs a sentence.
const ACCEPTED_REGRESSIONS: { [id: string]: string } = {};

describe("automatic flowsheet layout over the corpus (C59)", () => {
  const auto = ROWS.filter((r) => !r.curated);

  it("finds the corpus", () => {
    expect(ROWS.length).toBeGreaterThan(200);
    expect(auto.length).toBeGreaterThan(150);
  });

  it("prints the before/after totals and the worst views", () => {
    const tot = (k: "old" | "neu") =>
      `crossings ${sum(auto, k, "crossings")}, through boxes ${sum(auto, k, "throughNodes")}, `
      + `overlaps ${sum(auto, k, "overlaps")}, bends ${sum(auto, k, "bends")}, length ${sum(auto, k, "length")}`;
    const lines = [
      `[C59 layout] ${auto.length} automatic views (+ ${ROWS.length - auto.length} with a curated .cho)`,
      `  old: ${tot("old")}`,
      `  new: ${tot("neu")}`,
      "  worst new (score):",
      ...[...auto].sort((a, b) => layoutScore(b.neu) - layoutScore(a.neu)).slice(0, 8)
        .map((r) => `    ${r.id}: ${fmt(r.neu)}  (old ${fmt(r.old)})`),
      "  curated .cho layouts scoring WORSE than the new automatic one:",
      ...ROWS.filter((r) => r.curated && layoutScore(r.curated) > layoutScore(r.neu))
        .map((r) => `    ${r.id}: curated ${fmt(r.curated!)} | auto ${fmt(r.neu)}`),
    ];
    if (process.env.C59_LAYOUT_REPORT)
      for (const r of ROWS)
        lines.push(`  ${r.id}: old ${fmt(r.old)} | new ${fmt(r.neu)}${r.curated ? ` | curated ${fmt(r.curated)}` : ""}`);
    console.log(lines.join("\n"));
    expect(lines.length).toBeGreaterThan(3);
  });

  it("draws no overlapping boxes on any automatic view", () => {
    const bad = auto.filter((r) => r.neu.overlaps > 0).map((r) => `${r.id}: ${fmt(r.neu)}`);
    expect(bad).toEqual([]);
  });

  it("is not worse than the previous layout on any automatic view", () => {
    const worse = auto
      .filter((r) => layoutScore(r.neu) > layoutScore(r.old) && !(r.id in ACCEPTED_REGRESSIONS))
      .map((r) => `${r.id}: new ${fmt(r.neu)} | old ${fmt(r.old)}`);
    expect(worse).toEqual([]);
  });

  it("improves the corpus totals", () => {
    const score = (k: "old" | "neu") => auto.reduce((a, r) => a + layoutScore(r[k]), 0);
    expect(score("neu")).toBeLessThan(score("old"));
    expect(sum(auto, "neu", "crossings")).toBeLessThan(sum(auto, "old", "crossings"));
  });
});
