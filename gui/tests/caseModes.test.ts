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
  ONE CASE, TWO MODES, AS THE GUI READS THEM (DEV.md 4c C151/C152).

  On a fixture in the grammar of membrane24_fit_then_simulate and on the
  case itself, ctrl17 and the whole manifest (C152): the mode
  rule (both dicts -> both modes, the default from `application`); the bridge
  dataset -> fitParameters -> RECORD -> the unit whose membrane names it, on
  the calculation map; the unit's way back to the fit, read off the record's
  own fit {} block; and the stale-fit refusal read off the log.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO } from "./witnessOutputs.js";
import { parse, toJson } from "../src/dict/index.js";
import {
  caseModesOf, recordFit, staleFitRefusal, unitsReadingRecord, writtenRecords,
} from "../src/case/caseModes.js";
import { caseTree, derivePropsMap } from "../src/case/propsMap.js";
import { PROPS_DISCIPLINES } from "../src/case/operationSchemas.js";

const M24 = "tutorials/steady/membranes/membrane24_fit_then_simulate";
const C17 = "tutorials/ctrl/ctrl17_step_reaction_curve";

const PROPS = `operations
(
    {
        name      fit_NF270;
        type      fitParameters;
        parameters ( { path poreModel.poreRadius; initial 6e-10; } );
        evidence
        (
            { dataset "constant/experimental/fdl2021_NaCl.dat"; role fit; }
            { dataset "constant/experimental/fdl2021_MgSO4.dat"; role validation; }
        );
        residual
        {
            kind membrane; model DSPM-DE; membrane NF270_dspmde;
            transportParameters { hindrance DechadilokDeen2006; activity ideal; }
        }
        output { record "constant/assets/NF270_FdL2021.dat"; }
    }
);`;
const FLOWSHEET = `units
(
    { name Stage; type spiralWoundModule; in feed; outputs ( concentrate permeate );
      operation { module Generic-8040; membrane NF270_FdL2021; transport DSPM-DE; } }
);`;
const RECORD = `name NF270_FdL2021;
poreModel { poreRadius 6.7476e-10; }
fit { origin fitted; operation fit_NF270; fittedInCase membrane24_fit_then_simulate; verdict validated; }`;

const props = toJson(parse(PROPS));
const flowsheet = toJson(parse(FLOWSHEET));
const raw: Record<string, string> = {
  "system/propsDict": PROPS,
  "system/flowsheetDict": FLOWSHEET,
  "constant/assets/NF270_FdL2021.dat": RECORD,
  "constant/assets/NF270_dspmde.dat": "name NF270_dspmde;",
  "constant/experimental/fdl2021_NaCl.dat": "",
  "constant/experimental/fdl2021_MgSO4.dat": "",
};

describe("the modes of a case", () => {
  it("both dicts -> both modes; the default follows the application", () => {
    expect(caseModesOf({ propsDict: props, flowsheet, controlDict: { application: "choupoSolve" } }))
      .toEqual({ modes: ["process", "props"], defaultMode: "process" });
    expect(caseModesOf({ propsDict: props, flowsheet, controlDict: { application: "choupoProps" } })!
      .defaultMode).toBe("props");
  });
  it("one dict -> no switch", () => {
    expect(caseModesOf({ propsDict: props, flowsheet: null })).toBeNull();
    expect(caseModesOf({ propsDict: null, flowsheet })).toBeNull();
  });
});

describe("the bridge: a fit writes a record a unit reads", () => {
  it("names the record, the unit and the fit that wrote it", () => {
    expect(writtenRecords(props)).toEqual(
      [{ op: "fit_NF270", path: "constant/assets/NF270_FdL2021.dat", name: "NF270_FdL2021" }]);
    expect(unitsReadingRecord(flowsheet, "NF270_FdL2021")).toEqual(["Stage"]);
    expect(recordFit(raw, "NF270_FdL2021")).toMatchObject(
      { operation: "fit_NF270", verdict: "validated", fittedInCase: "membrane24_fit_then_simulate" });
    expect(recordFit(raw, "NF270_dspmde")).toBeNull();     // a hand-written record names no fit
  });

  it("the map draws dataset -> fit -> record -> unit, and the unit's F1 switches to Process", () => {
    const map = derivePropsMap({ propsDict: props, flowsheet, rawFiles: raw });
    const has = (from: string, to: string) =>
      map.links.some((l) => l.from === from && l.to === to);
    expect(has("file:constant/experimental/fdl2021_NaCl.dat", "op:fit_NF270")).toBe(true);
    expect(has("record:NF270_dspmde", "op:fit_NF270")).toBe(true);           // the base record
    expect(has("op:fit_NF270", "record:NF270_FdL2021")).toBe(true);          // the record written
    expect(has("record:NF270_FdL2021", "unit:Stage")).toBe(true);           // read by the unit
    const unit = map.nodes.find((n) => n.id === "unit:Stage")!;
    expect(unit.kind).toBe("unit");
    expect(unit.member.target).toMatchObject({ kind: "process", unit: "Stage" });
    const op = map.blocks.find((b) => b.kind === "operation")!;
    expect(op.discipline).toBe("Separation");
    expect(map.nodes.find((n) => n.id === "model:model fitted:DSPM-DE")).toBeDefined();
    const tree = caseTree(map, props, PROPS_DISCIPLINES);
    expect(tree.find((n) => n.label === "Process units")!.children.map((c) => c.id)).toEqual(["unit:Stage"]);
    expect(tree.find((n) => n.label === "Records produced")!.children.map((c) => c.id))
      .toEqual(["record:NF270_FdL2021"]);
  });
});

/* ---- the real cases (C152 on main) ------------------------------------- */

function caseFiles(dir: string) {
  const root = join(REPO, dir);
  const raw: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else raw[relative(root, p)] = readFileSync(p, "utf-8");
    }
  };
  walk(join(root, "system"));
  walk(join(root, "constant"));
  const dict = (rel: string) => (raw[rel] !== undefined ? toJson(parse(raw[rel]!)) : null);
  return { raw, propsDict: dict("system/propsDict"), flowsheet: dict("system/flowsheetDict"),
           controlDict: dict("system/controlDict") };
}

describe("the GUI's mode rule IS the manifest's (generated/caseManifest.json)", () => {
  const manifest = JSON.parse(readFileSync(join(REPO, "generated/caseManifest.json"), "utf-8")) as
    { cases: Record<string, { modes?: string[]; defaultMode?: string }> };
  const entries = Object.entries(manifest.cases);

  it("reads the manifest (a harvest of nothing is blindness)", () => {
    expect(entries.length).toBeGreaterThan(300);
    expect(entries.filter(([, e]) => e.modes).length).toBeGreaterThanOrEqual(2);
  });

  it("every case: two modes exactly where the manifest says, with its default", () => {
    const disagree: string[] = [];
    for (const [dir, e] of entries) {
      const sys = join(REPO, dir, "system");
      if (!existsSync(sys)) continue;
      const has = (f: string) => existsSync(join(sys, f));
      const ctrl = has("controlDict") ? readFileSync(join(sys, "controlDict"), "utf-8") : "";
      const app = /^\s*application\s+(\w+)/m.exec(ctrl.replace(/\/\/[^\n]*/g, ""))?.[1];
      const got = caseModesOf({
        propsDict: has("propsDict") ? {} : null,
        flowsheet: has("flowsheetDict") ? {} : null,
        controlDict: app ? { application: app } : null,
      });
      const want = e.modes ? { modes: e.modes, defaultMode: e.defaultMode } : null;
      if (JSON.stringify(got) !== JSON.stringify(want)) disagree.push(dir);
    }
    expect(disagree).toEqual([]);
  });
});

describe("membrane24_fit_then_simulate: the fit, the record it wrote, the stage that reads it", () => {
  const c = caseFiles(M24);
  it("two modes, Process by default", () => {
    expect(caseModesOf(c)).toEqual({ modes: ["process", "props"], defaultMode: "process" });
  });
  it("the record names the fit that wrote it", () => {
    const [w] = writtenRecords(c.propsDict);
    expect(w).toBeDefined();
    expect(unitsReadingRecord(c.flowsheet, w!.name)).toEqual(["Stage"]);
    expect(recordFit(c.raw, w!.name)).toMatchObject({ operation: w!.op, verdict: "validated" });
  });
  it("the map: the four datasets -> the fit -> the record -> Stage", () => {
    const map = derivePropsMap({ propsDict: c.propsDict, flowsheet: c.flowsheet, rawFiles: c.raw });
    const [w] = writtenRecords(c.propsDict);
    const has = (from: string, to: string) => map.links.some((l) => l.from === from && l.to === to);
    for (const ds of ["NaCl", "MgCl2", "Na2SO4", "MgSO4"])
      expect(has(`file:constant/experimental/fdl2021_${ds}.dat`, `op:${w!.op}`)).toBe(true);
    expect(has(`op:${w!.op}`, `record:${w!.name}`)).toBe(true);
    expect(has(`record:${w!.name}`, "unit:Stage")).toBe(true);
    const rec = map.nodes.find((n) => n.id === `record:${w!.name}`)!;
    expect(rec.member.target).toMatchObject({ kind: "case", path: w!.path });
    expect(map.blocks.length).toBeLessThanOrEqual(15);
  });
});

describe("ctrl17: a two-mode case whose props ops read a Process run's output", () => {
  it("two modes, Process by default; no record bridge", () => {
    const c = caseFiles(C17);
    expect(caseModesOf(c)!.defaultMode).toBe("process");
    expect(writtenRecords(c.propsDict)).toEqual([]);
  });
});

describe("a stale fit refused in Process mode", () => {
  it("is found in the log, and nothing else is", () => {
    const log = "running...\nERROR: membrane 'NF270_FdL2021' is a STALE FIT: it was fitted by Properties-mode ...\n";
    expect(staleFitRefusal(log)).toContain("STALE FIT");
    expect(staleFitRefusal("all fine\n")).toBeNull();
    expect(staleFitRefusal(undefined)).toBeNull();
  });
});
