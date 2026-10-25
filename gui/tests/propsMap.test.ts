/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  A PROPS CASE DRAWN AS ITS CALCULATION (DEV.md 4c C151).

  Held, on the cases' OWN propsDicts and files (no run needed: the map is a
  reading of the declaration): (1) every REGISTERED props op type declares its
  discipline and activity in its schema -- the test fails the day an op is
  registered without one; (2) the map NanoFiltran draws: three studies, the 22
  pore ops as three blocks, DSPM-DE and its choices as one model block, the
  data each part reads; (3) isotherm02, polarisation01 and estimate_acetone;
  (4) every block kind's F1 lands where the kind says -- a model on its
  theory, an op on its guide section, a view on its figure, data on its file;
  (5) the tree puts each op under its shelf.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse, toJson, type JsonDict } from "../src/dict/index.js";
import {
  operationMapMeta, mappedOperationTypes, PROPS_DISCIPLINES, PROPS_ACTIVITIES,
} from "../src/case/operationSchemas.js";
import { derivePropsMap, propsTree, type MapBlock } from "../src/case/propsMap.js";
import { locatePropsBlocks } from "../src/case/propsDictLocate.js";
import { REPO } from "./witnessOutputs.js";

const NF = "tutorials/props/membrane/nanofiltran_geraldesAlves2008";
const ISO = "tutorials/props/adsorption/isotherm02_fit_jaschik";
const POL = "tutorials/props/membrane/polarisation01_geraldes_afonso_table1";
const EST = "tutorials/props/estimate/estimate_acetone";

/** The case's own files, as the GUI's case loader would hand them: every
 *  authored file under system/ and constant/ (run outputs excluded). */
function caseOf(dir: string) {
  const root = join(REPO, dir);
  const raw: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== "postProcessing") walk(p); }
      else raw[relative(root, p)] = readFileSync(p, "utf-8");
    }
  };
  walk(join(root, "system"));
  walk(join(root, "constant"));
  const propsDict = toJson(parse(raw["system/propsDict"]!));
  const thermo = toJson(parse(raw["constant/thermoPhysPropDict"]!));
  return { raw, propsDict, thermo };
}

function mapOf(dir: string, expanded?: Set<string>) {
  const c = caseOf(dir);
  return { ...c, map: derivePropsMap({ propsDict: c.propsDict, thermo: c.thermo, rawFiles: c.raw, expanded }) };
}

const byKind = (bs: MapBlock[], k: MapBlock["kind"]) => bs.filter((b) => b.kind === k);

describe("every registered props op declares where it sits", () => {
  const src = readFileSync(join(REPO, "src/propertyOps/PropertyOperation.cpp"), "utf-8");
  const registered = [...src.matchAll(/reg\(\s*"([A-Za-z0-9]+)"/g)].map((m) => m[1]!);

  it("reads the registry (a harvest of nothing is blindness, not agreement)", () => {
    expect(registered.length).toBeGreaterThan(40);
  });

  it("each has a discipline and an activity from the closed vocabularies", () => {
    const missing = registered.filter((t) => operationMapMeta(t) === null);
    expect(missing, "props op types whose schema declares no x-choupo map block").toEqual([]);
    for (const t of registered) {
      const m = operationMapMeta(t)!;
      expect(PROPS_DISCIPLINES).toContain(m.discipline);
      expect(PROPS_ACTIVITIES).toContain(m.activity);
    }
  });

  it("no flowsheet unit carries a props map block", () => {
    expect(mappedOperationTypes().sort()).toEqual([...new Set(registered)].sort());
  });
});

describe("locatePropsBlocks", () => {
  it("finds every op and view of NanoFiltran at its own lines, never inside a comment", () => {
    const c = caseOf(NF);
    const idx = locatePropsBlocks(c.raw["system/propsDict"]);
    expect(idx.operations.size).toBe((c.propsDict["operations"] as unknown[]).length);
    expect(idx.views.size).toBe((c.propsDict["views"] as unknown[]).length);
    const lines = c.raw["system/propsDict"]!.split("\n");
    const n350 = idx.operations.get("N350")!;
    const body = lines.slice(n350.line - 1, n350.endLine).join("\n");
    expect(body).toMatch(/name\s+N350;/);
    expect(body.trim().startsWith("{")).toBe(true);
    expect(body.trim().endsWith("}")).toBe(true);
    expect(idx.references.get("bmFig3")).toBeDefined();
  });
});

describe("NanoFiltran: three studies, thirteen blocks", () => {
  const { map } = mapOf(NF);

  it("draws one framed study per part of the paper", () => {
    const framed = map.bands.filter((b) => b.framed);
    expect(framed).toHaveLength(3);
    expect(map.blocks.length).toBeLessThanOrEqual(15);
  });

  it("the 22 pore ops are three blocks, one per study", () => {
    const ops = byKind(map.blocks, "operation");
    expect(ops).toHaveLength(3);
    expect(ops.map((b) => b.members.length).sort((a, b) => a - b)).toEqual([6, 6, 10]);
    expect(ops.every((b) => b.role === "poreTransport" && b.activity === "evaluate"
      && b.discipline === "Separation")).toBe(true);
  });

  it("DSPM-DE and every declared choice inside it is ONE model block", () => {
    const models = byKind(map.blocks, "model");
    expect(models).toHaveLength(1);
    const tokens = models[0]!.members.map((m) => m.label);
    expect(models[0]!.title).toBe("DSPM-DE");
    for (const t of ["DSPM-DE", "ideal", "bulkOverPoreDavies", "DechadilokDeen2006",
                     "finiteDifference", "StirredCell", "GeraldesAfonso2006", "electroneutral"])
      expect(tokens).toContain(t);
    //  the case's thermo package is ideal and no pore op reads it
    expect(map.blocks.some((b) => b.title === "thermo package")).toBe(false);
  });

  it("the data: membrane records, Bowen & Mohammad's measurements, the reference tables", () => {
    const data = byKind(map.blocks, "data").flatMap((b) => b.members.map((m) => m.label));
    for (const n of ["NanoFiltranExample", "CA30_BowenMohammad", "bmFig3", "nfTable2", "nfFig4"])
      expect(data).toContain(n);
    const measured = map.blocks.find((b) => b.members.some((m) => m.id === "ref:bmFig3"))!;
    expect(measured.role).toBe("measured data");
  });

  it("every declared view is drawn, and wired from the ops it draws", () => {
    const views = byKind(map.blocks, "view").flatMap((b) => b.members.map((m) => m.label));
    expect(views).toHaveLength(12);
    const fig3 = map.blockOf.get("view:view-declared-fig3_dye4")!;
    const dyeOps = map.blockOf.get("op:dye4_p1")!;
    expect(map.edges.some((e) => e.from === dyeOps && e.to === fig3 && e.flow === "result")).toBe(true);
    const bm = map.blockOf.get("ref:bmFig3")!;
    expect(map.edges.some((e) => e.from === bm && e.to === fig3 && e.flow === "measured")).toBe(true);
  });

  it("an expanded op block is drawn op by op", () => {
    const g = map.blocks.find((b) => b.kind === "operation" && b.members.length === 10)!.group;
    const ex = mapOf(NF, new Set([g])).map;
    expect(byKind(ex.blocks, "operation")).toHaveLength(12);
  });
});

describe("isotherm02, polarisation01, estimate_acetone", () => {
  it("isotherm02: four fits, one block, their data and the Langmuir model", () => {
    const { map } = mapOf(ISO);
    expect(map.bands.filter((b) => b.framed)).toHaveLength(0);
    const ops = byKind(map.blocks, "operation");
    expect(ops).toHaveLength(1);
    expect(ops[0]!.members).toHaveLength(4);
    expect(ops[0]!.discipline).toBe("Separation");
    expect(ops[0]!.activity).toBe("fit");
    const data = map.blocks.filter((b) => b.kind === "data");
    const roles = data.map((b) => b.role).sort();
    expect(roles).toEqual(["inline data", "measured data", "records"]);
    const file = data.find((b) => b.role === "measured data")!.members[0]!;
    expect(file.target).toMatchObject({ kind: "case", path: "constant/experimental/co2_13x_jaschik2020.dat" });
    const record = data.find((b) => b.role === "records")!.members[0]!;
    expect(record.target).toMatchObject({ kind: "case", path: "constant/assets/zeolite13X.dat" });
    const model = byKind(map.blocks, "model");
    expect(model).toHaveLength(1);
    expect(model[0]!.members.map((m) => m.label)).toEqual(["langmuir", "LevenbergMarquardt"]);
    //  proposals written by the two ops that declare one
    const out = map.blocks.find((b) => b.role === "records written")!;
    expect(out.members).toHaveLength(2);
  });

  it("polarisation01: the measured rows, the multi-ionic model, one op, four views", () => {
    const { map } = mapOf(POL);
    const data = byKind(map.blocks, "data");
    expect(data).toHaveLength(1);
    expect(data[0]!.members[0]!.target).toMatchObject(
      { kind: "case", path: "constant/experimental/bowen1998_table1.dat" });
    const model = byKind(map.blocks, "model")[0]!;
    expect(model.title).toBe("GeraldesAfonso2007");
    expect(model.members.map((m) => m.label)).toEqual(
      ["GeraldesAfonso2007", "StirredCell", "GeraldesAfonso2006", "electroneutral"]);
    expect(byKind(map.blocks, "view")[0]!.members).toHaveLength(4);
  });

  it("estimate_acetone: Joback by default, the reference values inline, a proposal written", () => {
    const { map } = mapOf(EST);
    const op = byKind(map.blocks, "operation")[0]!;
    expect(op.activity).toBe("estimate");
    expect(op.discipline).toBe("Thermodynamics");
    const model = byKind(map.blocks, "model")[0]!;
    expect(model.title).toBe("Joback");
    expect(model.members[0]!.target).toMatchObject({ kind: "guide" });
    expect((model.members[0]!.target as { url: string }).url).toContain("joback");
    expect(map.blocks.some((b) => b.role === "inline data")).toBe(true);
    expect(map.blocks.some((b) => b.role === "records written")).toBe(true);
  });
});

describe("F1 on each block kind", () => {
  const { map } = mapOf(NF);
  const member = (id: string) => map.blocks.flatMap((b) => b.members).find((m) => m.id === id)!;

  it("a model opens the theory section deriving it", () => {
    const t = member("model:transport law:DSPM-DE").target;
    expect(t.kind).toBe("guide");
    expect((t as { url: string }).url).toMatch(/theoryGuide.*dspmde/);
    const h = member("model:hindrance:DechadilokDeen2006").target as { url: string };
    expect(h.url).toContain("dspmde-H");
  });

  it("an op opens its operation's section", () => {
    const t = member("op:N350").target as { kind: string; url: string };
    expect(t.kind).toBe("guide");
    expect(t.url).toContain("dspmde");
    expect(member("op:N350").source).toMatchObject({ kind: "case", path: "system/propsDict" });
  });

  it("a view scrolls Results to its figure", () => {
    expect(member("view:view-declared-gridStudy_Na").target)
      .toEqual({ kind: "view", domId: "view-declared-gridStudy_Na", label: expect.any(String) });
  });

  it("data opens its file in Case", () => {
    expect(member("ref:bmFig3").target).toMatchObject(
      { kind: "case", path: "constant/experimental/geraldes_alves2008_fig3.csv" });
    expect(member("record:CA30_BowenMohammad").target).toMatchObject(
      { kind: "case", path: "constant/assets/CA30_BowenMohammad.dat" });
  });
});

describe("the tree by discipline", () => {
  it("files every op of NanoFiltran under Separation, its activity as a tag", () => {
    const { propsDict } = caseOf(NF);
    const tree = propsTree(propsDict as JsonDict, PROPS_DISCIPLINES);
    expect(tree.map((d) => d.discipline)).toEqual(["Separation"]);
    expect(tree[0]!.types[0]!.ops).toHaveLength(22);
    expect(tree[0]!.types[0]!.activity).toBe("evaluate");
  });

  it("files isotherm02's fits under Separation and an estimate under Thermodynamics", () => {
    expect(propsTree(caseOf(ISO).propsDict, PROPS_DISCIPLINES)[0]!.discipline).toBe("Separation");
    expect(propsTree(caseOf(EST).propsDict, PROPS_DISCIPLINES)[0]!.discipline).toBe("Thermodynamics");
  });
});
