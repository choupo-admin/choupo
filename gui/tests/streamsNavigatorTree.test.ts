/*---------------------------------------------------------------------------*\
  streamsNavigatorTree -- the Streams workspace's Detail navigator on a
  SECTORED case (DEV.md 4c C110 G6).

  On tutorials/plant/lithiumBrinePlant the navigator said "No flowsheet
  loaded." over a loaded, solved plant: the walk looked for each sector only
  at `<name>/`, and this plant keeps its sectors under `sectors/<name>/` and
  its units under `<sector>/unitOperations/<unit>/`, each unit naming what
  it produces in `outputs ( ... )` rather than a legacy `boundary {}`.  The
  plant itself declares no `boundary` either: its feeds and products are the
  named edges with no producer / no consumer.

  The cases are read from the tree (git ls-files), handed through the same
  `filesToCaseFiles` the app uses.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { filesToCaseFiles } from "../src/cases/tutorials.js";
import { buildTree, type TreeNode } from "../src/ui/streamsNavigatorTree.js";

const REPO = join(__dirname, "..", "..");

function caseOf(rel: string) {
  const listed = execFileSync("git", ["ls-files", rel], { cwd: REPO, encoding: "utf8" })
    .split("\n").filter(Boolean);
  const raw: { [p: string]: string } = {};
  for (const p of listed) raw[p.slice(rel.length + 1)] = readFileSync(join(REPO, p), "utf8");
  return filesToCaseFiles(rel.split("/").pop()!, raw);
}

/** The tree as "A > B > leaf=qname" lines, for a readable comparison. */
function lines(nodes: TreeNode[], path: string[] = []): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind === "group") out.push(...lines(n.children, [...path, n.label]));
    else out.push(`${[...path, n.label].join(" > ")} = ${n.qname} (${n.role})`);
  }
  return out;
}

describe("Streams navigator: a plant whose sectors live under sectors/", () => {
  const tree = buildTree(caseOf("tutorials/plant/lithiumBrinePlant"));
  const got = lines(tree);

  it("is not empty (it used to draw 'No flowsheet loaded.')", () => {
    expect(tree.length).toBeGreaterThan(0);
  });

  it("draws every sector, in the declared order, between the plant's feeds and products", () => {
    expect(tree.map((n) => n.label)).toEqual([
      "Feeds (plant)", "BRINE", "EXTRACTION", "CARBONATION", "HOTAIR", "FINISHING",
      "Products (plant)"]);
  });

  it("reads each unit's own folder under sectors/<S>/unitOperations/ and its outputs list", () => {
    expect(got).toContain("BRINE > crystNaCl > halite = BRINE.crystNaCl.halite (internal)");
    expect(got).toContain("BRINE > crystNaCl > liquor = BRINE.crystNaCl.liquor (internal)");
  });

  it("reads the plant's feeds and products off its named edges (no boundary block)", () => {
    const of = (label: string) => (tree.find((n) => n.label === label) as
      { children: TreeNode[] }).children.map((c) => c.label).sort();
    expect(of("Feeds (plant)")).toEqual(["carbLiquor", "fuelAir", "organic", "salarBrine"]);
    expect(of("Products (plant)"))
      .toEqual(["cleanAir", "fines", "halite", "loadedOrganic", "product", "raffinate"]);
  });
});

describe("Streams navigator: the layouts that already worked still do", () => {
  it("a sectored plant with top-level sector folders and legacy boundary blocks", () => {
    const got = lines(buildTree(caseOf("tutorials/plant/ChemicalPlantTutorial")));
    expect(got).toContain("CONCENTRATION > Evap1 > Juice1 = CONCENTRATION.Evap1.Juice1 (internal)");
  });

  it("a flat case: its units and its feeds", () => {
    const tree = buildTree(caseOf("tutorials/steady/flash/flash01_benzene_toluene"));
    expect(tree.map((n) => n.label)).toEqual(["Feeds", "Units"]);
  });
});
