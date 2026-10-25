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
  AN EXTERNAL REVIEWER'S WALK THROUGH NANOFILTRAN (DEV.md 4c C154).

  Held on the case's OWN files (no run needed except where a result is the
  subject, and then a result shaped as the engine publishes it):
    (1) the studies the propsDict declares, and the GUI's purpose vocabulary
        held to the ENGINE's list (Views.cpp studyPurposes());
    (2) About: the case story is not the banner, and the README parses;
    (3) the strip keeps the run status apart from the evidence, and an op
        type that fits nothing says "not applicable" rather than an empty cell;
    (4) F1 on a key: poreRadius, A_w, an op's J_v; a key no schema documents
        answers for its block, saying so;
    (5) the per-point table reads only published keys and units;
    (6) the map's block states: run / failed / not run / stale, stale
        attributed only when every changed part is one a block reads;
    (7) the exported CSV describes itself;
    (8) the log navigator finds operations, and announcements group.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parse, toJson, type JsonDict } from "../src/dict/index.js";
import { declaredStudies, dictStory, STUDY_PURPOSES, studyOfOp } from "../src/case/propsStudies.js";
import { parseLesson } from "../src/case/lesson.js";
import { verdictRows } from "../src/case/reviewScreen.js";
import { keyAtLine, keyHelp } from "../src/case/keyHelp.js";
import { pointTable } from "../src/case/opPointTable.js";
import { operationMapMeta } from "../src/case/operationSchemas.js";
import { derivePropsMap } from "../src/case/propsMap.js";
import { mapStates } from "../src/case/propsMapState.js";
import { casePartsOf, changedParts, runInputsOf } from "../src/case/staleness.js";
import { groupAnnouncements, parseOperationBanners } from "../src/case/unitBanner.js";
import type { OperationResult, RunResult } from "../src/adapters/SolverAdapter.js";
import { csvHeader, type PostPlot } from "../src/case/postProcessing.js";
import type { CaseFiles } from "../src/case/types.js";
import { REPO } from "./witnessOutputs.js";

const NF = join(REPO, "tutorials/props/membrane/nanofiltran_geraldesAlves2008");

function files() {
  const raw: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== "postProcessing") walk(p); }
      else raw[relative(NF, p)] = readFileSync(p, "utf-8");
    }
  };
  walk(join(NF, "system"));
  walk(join(NF, "constant"));
  const propsDict = toJson(parse(raw["system/propsDict"]!));
  const thermo = toJson(parse(raw["constant/thermoPhysPropDict"]!));
  return { raw, propsDict, thermo };
}
const C = files();
const ops = C.propsDict["operations"] as JsonDict[];
const lineOf = (text: string, re: RegExp) => text.split("\n").findIndex((l) => re.test(l)) + 1;

describe("(1) the studies", () => {
  const st = declaredStudies(C.propsDict);
  it("are the paper's three parts, in its order, partitioning the 22 operations", () => {
    expect(st.map((s) => s.name)).toEqual(["A", "B", "C"]);
    expect(st.map((s) => s.ops.length)).toEqual([6, 10, 6]);
    expect(st.map((s) => s.purpose)).toEqual(["codeToCodeVerification", "calibratedComparison", "numericalStudy"]);
    expect(studyOfOp(st).size).toBe(ops.length);
  });
  it("the GUI's purpose words are exactly the engine's accepted list, and none says validated", () => {
    const src = readFileSync(join(REPO, "src/postProcessing/views/Views.cpp"), "utf-8");
    const m = /studyPurposes\(\)\s*\{[\s\S]*?static const std::vector<std::string> p\{([\s\S]*?)\};/.exec(src);
    expect(m, "studyPurposes() not found in Views.cpp -- a harvest of nothing is blindness").toBeTruthy();
    const engine = [...m![1]!.matchAll(/"([A-Za-z]+)"/g)].map((x) => x[1]);
    expect(engine.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(STUDY_PURPOSES)).toEqual(engine);
    for (const w of Object.values(STUDY_PURPOSES)) expect(`${w.label} ${w.sentence}`).not.toMatch(/\bvalidat/i);
  });
});

describe("(2) About this case", () => {
  it("the propsDict's story is its first NON-banner comment", () => {
    const s = dictStory(C.raw["system/propsDict"]);
    expect(s).toMatch(/^nanofiltran_geraldesAlves2008 -- ONE CASE FOR ONE PAPER/);
    expect(s).not.toMatch(/C hemicals/);
  });
  it("the case's README parses in the subset the app renders and says the case imposes J_v", () => {
    const md = readFileSync(join(NF, "README.md"), "utf-8");
    expect(() => parseLesson(md)).not.toThrow();
    expect(md).toMatch(/IMPOSES the permeate flux J_v/);
    for (const s of ["A — Code to code", "B — Experiment", "C — The stiff case"]) expect(md).toContain(s);
    expect(md).toMatch(/READING uncertainty/);
    expect(md).toMatch(/Nothing was fitted by this run/);
  });
});

const result = (names: string[], extra: Partial<RunResult> = {}): RunResult => ({
  status: "done", log: "",
  operationResults: names.map((n) => ({ name: n, type: "poreTransport", diagnostics: { n_points: 1 } })),
  ...extra,
} as unknown as RunResult);

describe("(3) run status apart from the status of the evidence", () => {
  const all = ops.map((o) => String(o["name"]));
  it("a clean run: done, no acceptance test, AAD not applicable for a bench that fits nothing", () => {
    const r = result(all);
    const rows = verdictRows(ops, r.operationResults!, undefined, "done", C.propsDict);
    expect(rows.every((x) => x.runState === "done")).toBe(true);
    expect(rows.every((x) => x.verdict === "")).toBe(true);
    expect(rows.every((x) => !x.aadApplicable && !x.heldOutApplicable)).toBe(true);
    expect(rows.find((x) => x.name === "dye4_p1")!.purpose).toBe("calibratedComparison");
    expect(rows.find((x) => x.name === "N350")!.study).toBe("C");
  });
  it("an op's non-zero rc is a FAILED run state, and a failed run marks the ops it never reached", () => {
    const r = result(all.slice(0, 3));
    (r.operationResults![1] as OperationResult).rc = 2;
    const rows = verdictRows(ops, r.operationResults!, undefined, "error", C.propsDict);
    expect(rows[0]!.runState).toBe("done");
    expect(rows[1]!.runState).toBe("failed");
    expect(rows[1]!.rc).toBe(2);
    expect(rows[5]!.runState).toBe("failed");
    const notRun = verdictRows(ops, [], undefined, undefined, C.propsDict);
    expect(notRun.every((x) => x.runState === "notRun")).toBe(true);
  });
});

describe("(4) F1 on a key", () => {
  const rec = "constant/assets/NanoFiltranExample.dat";
  const text = C.raw[rec]!;
  it("poreRadius: its meaning, its unit, the model it feeds", () => {
    const line = lineOf(text, /^\s*poreRadius\s/);
    expect(keyAtLine(text, line)).toEqual({ key: "poreRadius", chain: ["poreModel"] });
    const h = keyHelp(rec, text, line);
    expect(h.scope).toBe("key");
    expect(h.unit).toBe("m");
    expect(h.description).toMatch(/not a solute's/);
    expect(h.guide?.url).toMatch(/dspmde/);
  });
  it("A_w: required by the grammar and not read where J_v is imposed", () => {
    const h = keyHelp(rec, text, lineOf(text, /^A_w\s/));
    expect(h.scope).toBe("key");
    expect(h.description).toMatch(/IMPOSES the permeate flux|does not read it/);
  });
  it("a comment line answers for its block, and a key no schema documents says so", () => {
    const h = keyHelp(rec, text, 3);
    expect(h.scope).not.toBe("key");
    const fake = "name x;\nkind NF;\nA_w 1 m/s/bar;\nporeModel\n{\n    tortuosity 2;\n}\n";
    const g = keyHelp(rec, fake, 6);
    expect(g.scope).toBe("block");
    expect(g.description).toMatch(/No schema documents `tortuosity`/);
  });
  it("an operation's key in the propsDict is read from that operation's TYPE schema", () => {
    const pd = C.raw["system/propsDict"]!;
    const line = lineOf(pd, /^\s*J_v\s+\(\s*1e-6/);
    const h = keyHelp("system/propsDict", pd, line, { propsDict: C.propsDict });
    expect(h.key).toBe("J_v");
    expect(h.source).toMatch(/poreTransport/);
  });
  it("a file no schema covers says that, never a guess", () => {
    const sp = C.raw["constant/species/Na.dat"]!;
    const h = keyHelp("constant/species/Na.dat", sp, 20);
    expect(h.scope).toBe("file");
    expect(h.description).toMatch(/No schema/);
  });
});

describe("(5) the per-point table", () => {
  it("rows per point and ion, the op's own units, empty where nothing was published", () => {
    const r: OperationResult = { name: "x", type: "poreTransport", diagnostics: {
      Jv_p1: 1e-6, Jv_p2: 5e-6,
      c_bulk_Na_p1: 10, c_wall_Na_p1: 11, c_perm_Na_p1: 3, Robs_Na_p1: 0.7, Rreal_Na_p1: 0.727,
      c_bulk_Cl_p1: 10, c_wall_Cl_p1: 12, c_perm_Cl_p1: 4, Robs_Cl_p1: 0.6, Rreal_Cl_p1: 0.667,
      c_bulk_Na_p2: 10, c_wall_Na_p2: 13, c_perm_Na_p2: 2, Robs_Na_p2: 0.8,
      c_bulk_Cl_p2: 10, c_wall_Cl_p2: 14, c_perm_Cl_p2: 1, Robs_Cl_p2: 0.9, Rreal_Cl_p2: 0.93,
    }, units: { Jv_p1: "m/s", c_bulk_Na_p1: "mol/m3", Robs_Na_p1: "-" } };
    const t = pointTable(operationMapMeta("poreTransport")?.pointTable, r)!;
    expect(t.rows.map((x) => `${x.point}${x.ion}`)).toEqual(["1Na", "1Cl", "2Na", "2Cl"]);
    expect(t.columns[0]).toEqual({ label: "J_v", unit: "m/s" });
    expect(t.columns.find((c) => c.label === "c_bulk")!.unit).toBe("mol/m3");
    expect(t.rows[2]!.cells[0]).toBe(5e-6);
    expect(t.rows[2]!.cells[t.columns.findIndex((c) => c.label === "R_real")]).toBeNull();
  });
});

describe("(6) the map's block states", () => {
  const map = derivePropsMap({ propsDict: C.propsDict, thermo: C.thermo, rawFiles: C.raw });
  const all = ops.map((o) => String(o["name"]));
  const blockOfOp = (op: string) => map.blockOf.get(`op:${op}`)!;
  it("the frames carry the declared studies' titles", () => {
    const labels = map.bands.filter((b) => b.framed).map((b) => b.study);
    expect(labels).toEqual(["A", "B", "C"]);
    expect(map.bands[0]!.label).toMatch(/^A -- Code to code/);
  });
  it("not run before a run; run after a clean one", () => {
    expect(mapStates(map, undefined, null).block.get(blockOfOp("N350"))!.state).toBe("notRun");
    const s = mapStates(map, result(all), { stale: false, changed: [] });
    expect(s.block.get(blockOfOp("N350"))!.state).toBe("run");
    expect(s.caseWide).toBe(false);
  });
  it("failed: an op with rc != 0, and the ops a failed run never reached", () => {
    const r = result(all.filter((n) => n !== "N350"), { status: "error" } as Partial<RunResult>);
    const s = mapStates(map, r, null);
    expect(s.member.get("op:N350")).toBe("failed");
    expect(s.block.get(blockOfOp("N350"))!.state).toBe("failed");
  });
  it("stale is attributed when every changed part is one a block reads, and travels downstream", () => {
    const s = mapStates(map, result(all), { stale: true, changed: ["propsDict.operations.N350"] });
    expect(s.caseWide).toBe(false);
    expect(s.member.get("op:N350")).toBe("stale");
    expect(s.member.get("op:dye4_p1")).toBe("run");
    expect(s.member.get("view:view-declared-gridStudy_Na")).toBe("stale");
    const f = mapStates(map, result(all), { stale: true, changed: ["file:constant/assets/CA30_BowenMohammad.dat"] });
    expect(f.member.get("op:dye4_p1")).toBe("stale");
    expect(f.member.get("op:N350")).toBe("run");
  });
  it("a change no block reads is said ONCE for the map, never guessed per block", () => {
    const s = mapStates(map, result(all), { stale: true, changed: ["file:constant/components/NaCl.dat"] });
    expect(s.caseWide).toBe(true);
    expect([...s.member.values()].includes("stale")).toBe(false);
    expect(mapStates(map, result(all), { stale: true, changed: null }).caseWide).toBe(true);
  });
  it("the case's parts: one per operation, view, reference and file; a changed op is named", () => {
    const cf: CaseFiles = { propsDict: C.propsDict, thermoPackage: C.thermo, controlDict: {},
      extraFiles: { "constant/assets/NanoFiltranExample.dat": C.raw["constant/assets/NanoFiltranExample.dat"]! } };
    const p = casePartsOf(cf);
    expect(Object.keys(p)).toContain("propsDict.operations.N350");
    expect(Object.keys(p)).toContain("propsDict.views.fig3_dye4");
    expect(Object.keys(p)).toContain("file:constant/assets/NanoFiltranExample.dat");
    const ran = runInputsOf(cf, {});
    const ops2 = (C.propsDict["operations"] as JsonDict[]).map((o) => o["name"] === "N350" ? { ...o, T: "299 K" } : o);
    const now = runInputsOf({ ...cf, propsDict: { ...C.propsDict, operations: ops2 } }, {});
    expect(changedParts(now, ran)).toEqual(["propsDict.operations.N350"]);
  });
});

describe("(7) the exported CSV describes itself", () => {
  it("title, note, axes with units, each series with its source, the reference cited", () => {
    const item: PostPlot = { kind: "plot", op: "", origin: "declared", type: "series", name: "fig3_dye4",
      title: "Fig. 3", note: "The error bars are READING uncertainty.", file: "postProcessing/case/fig3_dye4.csv",
      xAxis: { label: "feed chloride", unit: "mol/m3", scale: "linear" },
      yAxis: { label: "R_obs", unit: "-", scale: "linear" },
      series: [{ name: "expNa", label: "Na+ experiment", role: "experiment", style: "markers", group: "Na",
        source: "reference bmFig3 (constant/experimental/geraldes_alves2008_fig3.csv): cCl_molm3, Robs_exp",
        xUnit: "mol/m3", yUnit: "-", yError: true, points: 5 }] };
    const h = csvHeader(item, [{ name: "bmFig3", file: "constant/experimental/geraldes_alves2008_fig3.csv",
      role: "experiment", citation: "Bowen & Mohammad, AIChE J. 44 (1998) 1799" }]);
    expect(h.split("\n").filter(Boolean).every((l) => l.startsWith("#"))).toBe(true);
    expect(h).toMatch(/# note: The error bars are READING uncertainty/);
    expect(h).toMatch(/# x: feed chloride \[mol\/m3\]/);
    expect(h).toMatch(/# series expNa: Na\+ experiment -- experiment; x \[mol\/m3\], y \[dimensionless\]; carries yError/);
    expect(h).toMatch(/# reference bmFig3 .*AIChE J\. 44/);
  });
});

describe("(8) the log navigator on a props log", () => {
  const log = [
    "[unmarked] component 'water': no `reviewStatus` declared",
    "[unmarked] component 'NaCl': no `reviewStatus` declared",
    ">>>  Operation [0]:  example_ideal   (type = poreTransport)",
    "  [DSPM-DE] J_v IMPOSED by the caller (1e-06 m/s): no J_w = A_w (dP - dpi) closure",
    "  [DSPM-DE] J_v IMPOSED by the caller (5e-05 m/s): no J_w = A_w (dP - dpi) closure",
    ">>>  Operation [1]:  N350   (type = poreTransport)",
  ].join("\n");
  it("lists the operations where there is no unit banner", () => {
    expect(parseOperationBanners(log).map((o) => [o.qualifiedName, o.line])).toEqual([["example_ideal", 3], ["N350", 6]]);
  });
  it("groups an announcement repeated with different numbers or names, with its count", () => {
    const g = groupAnnouncements(log);
    expect(g.map((x) => [x.tag, x.count])).toEqual([["unmarked", 2], ["DSPM-DE", 2]]);
  });
  it("on the native log, when one is on disk", () => {
    const p = join(NF, "log.choupoProps");
    if (!existsSync(p)) return;
    const native = readFileSync(p, "utf-8");
    expect(parseOperationBanners(native)).toHaveLength(ops.length);
  });
});
