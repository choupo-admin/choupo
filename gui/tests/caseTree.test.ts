/*  The Case tree's SHAPE, pinned.
 *
 *  Until 2026-09-05 nothing tested how the Case workspace grouped files, and
 *  the grouping was wrong in a way no test could have said: two levels only,
 *  everything deeper drawn as one row with slashes in it.  These pin the
 *  recursive shape, the squash of single-child chains, the root-leaf rule,
 *  and the collapse KEY being the real path.
 *
 *  Two source arms ride along, on the check_design_sheet precedent: the
 *  worker's harvest must select run-output trees from ONE list and carry no
 *  hard-coded `"/case/converged/"` literal (that literal is why the design
 *  sheets did not reach the browser on the day the engine wrote them), and
 *  the Case workspace must merge the design channel.  A test that only
 *  exercised the pure functions would pass with the wiring missing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTree, INTERIOR_ROOT, isRunOutput, kindOf, nodeKind, rankNode, RUN_OUTPUT_ROOTS, squash, sortedChildren } from "../src/ui/caseTree";

const plant = [
  "ChemicalPlantTutorial.cho",
  "README.md",
  "system/controlDict",
  "system/flowsheetDict",
  "system/postDict",
  "constant/thermoPhysPropDict",
  "constant/components/water.dat",
  "CONCENTRATION/system/flowsheetDict",
  "CONCENTRATION/Evap1/system/flowsheetDict",
  "CONCENTRATION/Evap2/system/flowsheetDict",
  "converged/CONCENTRATION/Magma",
  "design/CONCENTRATION/Evap1/evaporator",
  "design/CONCENTRATION/Evap2/evaporator",
  "design/DRYING/SD/sprayDryer",
];

describe("caseTree: the shape", () => {
  it("is recursive: design/<SECTOR>/<unit>/<tag> is three folders deep, not one row", () => {
    const t = buildTree(plant);
    const design = t.children.get("design")!;
    expect(design).toBeDefined();
    const conc = design.children.get("CONCENTRATION")!;
    expect(conc).toBeDefined();
    const evap2 = conc.children.get("Evap2")!;
    expect(evap2).toBeDefined();
    expect(evap2.leaves).toEqual(["design/CONCENTRATION/Evap2/evaporator"]);
    //  the leaf is the FULL path -- the label is derived at draw time
    expect(evap2.prefix).toBe("design/CONCENTRATION/Evap2");
  });

  it("keeps a slash-less file as a root leaf and skips the .cho marker", () => {
    const t = buildTree(plant);
    expect(t.leaves).toEqual(["README.md"]);
    expect(JSON.stringify(t)).not.toContain(".cho");
  });

  it("squashes a single-child, file-less chain into one label but keeps the REAL prefix", () => {
    //  design/DRYING has one child (SD) and no files of its own -> "DRYING/SD"
    const t = squash(buildTree(plant));
    const design = t.children.get("design")!;
    const labels = Array.from(design.children.keys()).sort();
    expect(labels).toEqual(["CONCENTRATION", "DRYING/SD"]);
    const dryingSd = design.children.get("DRYING/SD")!;
    expect(dryingSd.prefix).toBe("design/DRYING/SD");      // identity is the path
    expect(dryingSd.leaves).toEqual(["design/DRYING/SD/sprayDryer"]);
  });

  it("does NOT squash a folder that has files of its own beside its one sub-folder", () => {
    //  CONCENTRATION/system/flowsheetDict is a file in CONCENTRATION, so the
    //  Evap1/Evap2 children may not be pulled up into it.
    const t = squash(buildTree(plant));
    const conc = t.children.get("CONCENTRATION")!;
    expect(conc.label).toBe("CONCENTRATION");
    expect(Array.from(conc.children.keys()).sort()).toEqual(["Evap1/system", "Evap2/system", "system"]);
  });

  it("never squashes the root, even for a one-folder case", () => {
    const t = squash(buildTree(["system/controlDict"]));
    expect(t.label).toBe("");
    expect(Array.from(t.children.keys())).toEqual(["system"]);
  });

  it("orders by KIND -- declared, sectors, then the VIEWS with 0/ first -- then by name, at every depth", () => {
    const t = squash(buildTree([...plant,
      "0/RawJuice", "DRYING/system/flowsheetDict", "iterations/0001/RawJuice"]));
    //  Alphabetically `converged` would sit between CONCENTRATION and DRYING
    //  (the flagship screenshot: a fifth sector).  By kind it goes last.
    expect(sortedChildren(t).map((n) => n.label))
      .toEqual(["system", "constant", "CONCENTRATION", "DRYING/system",
                "0", "converged/CONCENTRATION", "design", "iterations/0001"]);
    const conc = t.children.get("CONCENTRATION")!;
    expect(sortedChildren(conc).map((n) => n.label)).toEqual(["system", "Evap1/system", "Evap2/system"]);
  });

  it("gives the case's system/ and a sector's system/ DIFFERENT collapse keys", () => {
    const t = buildTree(plant);
    const a = t.children.get("system")!.prefix;
    const b = t.children.get("CONCENTRATION")!.children.get("system")!.prefix;
    expect(a).toBe("system");
    expect(b).toBe("CONCENTRATION/system");
    expect(a).not.toBe(b);
  });
});

describe("caseTree.kindOf: one home for what the RUN writes", () => {
  it("classifies by PATH, so a squashed output label is still an output", () => {
    expect(kindOf("system")).toBe("declared");
    expect(kindOf("CONCENTRATION/system")).toBe("declared");
    expect(kindOf("0")).toBe("state0");
    expect(kindOf("0/FERMENTATION")).toBe("state0");
    expect(kindOf("CONCENTRATION")).toBe("sector");
    expect(kindOf("CONCENTRATION/Cryst")).toBe("sector");
    expect(kindOf("converged")).toBe("output");
    expect(kindOf("converged/CONCENTRATION")).toBe("output");
    expect(kindOf("design/CONCENTRATION/Cryst")).toBe("output");
    expect(kindOf("0.01")).toBe("output");
    expect(kindOf("iterations")).toBe("output");
  });
  it("the unit interiors of a state view are ONE root, internalStates/, and everything under it is interior", () => {
    //  2026-09-06, one-file-per-unit amendment.  A state view holds the stream
    //  files flat under the case's sector folders and, under
    //  `internalStates/`, ONE file per unit -- so the PATH says which is
    //  which, and no geography needs passing in.  The first shape (a
    //  directory per unit BESIDE the stream files, one day old) could not be
    //  classified from the path at all.
    expect(INTERIOR_ROOT).toBe("internalStates");
    expect(kindOf("converged/internalStates")).toBe("interior");
    expect(kindOf("converged/internalStates/CONCENTRATION")).toBe("interior");
    expect(kindOf("converged/internalStates/CONCENTRATION/Cryst")).toBe("interior");
    expect(kindOf("0/internalStates")).toBe("interior");
    expect(kindOf("0/internalStates/column16")).toBe("interior");
    //  A sector folder inside a view keeps the view's own kind: the
    //  flagship's `converged/CONCENTRATION` is where its stream files live.
    expect(kindOf("converged/CONCENTRATION")).toBe("output");
    expect(kindOf("0/CONCENTRATION")).toBe("state0");
    //  Not a root of its own (that was the 2026-09-05 view, retired), so at
    //  the top level the name is just another folder.
    expect(kindOf("internalStates")).toBe("sector");
    expect(RUN_OUTPUT_ROOTS).not.toContain("internalStates");
  });
  it("isRunOutput is decided by the VIEW, not the kind: an interior under converged/ is the run's, under 0/ the student's", () => {
    //  CaseIntro's keep-list reads this.  Keyed on kindOf it would have
    //  listed `converged/internalStates/column01` -- kind "interior" -- as a
    //  file the student authored.
    expect(isRunOutput("converged/internalStates/column01")).toBe(true);
    expect(isRunOutput("converged/CONCENTRATION")).toBe(true);
    expect(isRunOutput("design/CONCENTRATION/Cryst")).toBe(true);
    expect(isRunOutput("0.01")).toBe(true);
    expect(isRunOutput("0/internalStates/column16")).toBe(false);
    expect(isRunOutput("0/CONCENTRATION")).toBe(false);
    expect(isRunOutput("system")).toBe(false);
    expect(isRunOutput("CONCENTRATION")).toBe(false);
  });
  it("the interiors' root sorts AFTER everything else in its view, because the boundary is read first", () => {
    const files = ["system/flowsheetDict", "0/feed", "converged/feed",
                   "converged/internalStates/column01"];
    const t = buildTree(files);
    const conv = t.children.get("converged")!;
    const interior = conv.children.get("internalStates")!;
    expect(nodeKind(interior)).toBe("interior");
    expect(rankNode(interior)).toBeGreaterThan(rankNode(t.children.get("converged")!));
  });
  it("nothing in the tree still names a retired TOP-LEVEL internalStates/ view", () => {
    //  The top-level view existed for one day (2026-09-05 -> 2026-09-06).  A
    //  root that no writer produces is a folder a student is told to look
    //  for and never finds.  The NAME lives on, inside each state view, as
    //  the interiors' own root -- that is INTERIOR_ROOT, not a run-output
    //  root.
    expect(RUN_OUTPUT_ROOTS).not.toContain("internalStates");
    expect(RUN_OUTPUT_ROOTS).not.toContain(INTERIOR_ROOT);
  });
  it("a SQUASHED sector keeps its own kind (DRYING/system is the sector DRYING, not a declared dict)", () => {
    const t = squash(buildTree(["system/controlDict", "DRYING/system/flowsheetDict", "converged/DRYING/Out"]));
    const byLabel = new Map(sortedChildren(t).map((n) => [n.label, nodeKind(n)]));
    expect(byLabel.get("DRYING/system")).toBe("sector");
    expect(byLabel.get("converged/DRYING")).toBe("output");
    expect(byLabel.get("system")).toBe("declared");
  });
  it("the worker harvests a SUBSET of the roots the tree classifies as output", () => {
    const worker = readFileSync(resolve(__dirname, "..", "public/workers/solverWorker.js"), "utf8");
    const m = worker.match(/OUTPUT_ROOTS\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const harvested = m![1]!.split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean);
    for (const r of harvested) expect(RUN_OUTPUT_ROOTS).toContain(r);
  });
  it("CaseIntro reads the one home instead of its own keep-list -- and reads the VIEW, not the kind", () => {
    const intro = readFileSync(resolve(__dirname, "..", "src/ui/CaseIntro.tsx"), "utf8");
    expect(intro).toMatch(/isRunOutput\(/);
    expect(intro).not.toMatch(/kindOf\([^)]*\)\s*!==\s*"output"/);
    expect(intro).not.toMatch(/p\.startsWith\("system\/"\) \|\| p\.startsWith\("constant\/"\)/);
  });
});

describe("caseTree: the wiring the pure functions cannot see", () => {
  const root = resolve(__dirname, "..");
  const worker = readFileSync(resolve(root, "public/workers/solverWorker.js"), "utf8");
  const workspace = readFileSync(resolve(root, "src/ui/CaseWorkspace.tsx"), "utf8");
  const adapter = readFileSync(resolve(root, "src/adapters/WasmAdapter.ts"), "utf8");

  it("the worker selects run-output trees from ONE list, and design/ is in it", () => {
    //  The list, not a fixed literal: a test pinning an exact tuple reads a
    //  ratified addition as a defect, and reads a ratified REMOVAL as one too
    //  (internalStates/ was a root here for exactly one day, 2026-09-05 to
    //  2026-09-06).  Each root the tree classifies as output that the engine
    //  WRITES must be here, or it is written into MEMFS and thrown away with
    //  the worker.
    const m = worker.match(/OUTPUT_ROOTS\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const roots = m![1]!.split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean);
    expect(roots).toContain("converged");
    expect(roots).toContain("design");
  });

  it("a unit interior rides the converged channel: it IS the converged snapshot", () => {
    //  2026-09-06.  A state directory is a RESTARTABLE SNAPSHOT, so the
    //  interiors are part of the state view and not a tree of their own --
    //  the `design/` argument for a separate channel ("no sizing pass" must
    //  not read as "did not solve") does not apply, because an interior only
    //  ever exists where a stream table does.  Nothing anywhere may still
    //  route them onto a channel of their own.
    expect(worker).not.toContain("internalStateFiles");
    expect(adapter).not.toContain("internalStateFiles");
    expect(workspace).not.toContain("internalStateFiles");
    expect(worker).not.toContain('"/case/internalStates/"');
  });

  it("the worker carries no hard-coded converged literal (the defect this replaced)", () => {
    expect(worker).not.toContain('"/case/converged/"');
  });

  it("the worker posts design sheets on their OWN channel, never folded into convergedFiles", () => {
    expect(worker).toContain('type: "designFiles"');
    expect(adapter).toContain('msg.type === "designFiles"');
    expect(adapter).toContain("result.designFiles = designFiles");
  });

  it("the Case workspace merges the design channel for display", () => {
    expect(workspace).toContain("runResult?.designFiles");
  });
});
