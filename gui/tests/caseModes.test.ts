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

  On a fixture in the grammar of membrane24_fit_then_simulate (C152): the mode
  rule (both dicts -> both modes, the default from `application`); the bridge
  dataset -> fitParameters -> RECORD -> the unit whose membrane names it, on
  the calculation map; the unit's way back to the fit, read off the record's
  own fit {} block; and the stale-fit refusal read off the log.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { parse, toJson } from "../src/dict/index.js";
import {
  caseModesOf, recordFit, staleFitRefusal, unitsReadingRecord, writtenRecords,
} from "../src/case/caseModes.js";
import { caseTree, derivePropsMap } from "../src/case/propsMap.js";
import { PROPS_DISCIPLINES } from "../src/case/operationSchemas.js";

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

describe("a stale fit refused in Process mode", () => {
  it("is found in the log, and nothing else is", () => {
    const log = "running...\nERROR: membrane 'NF270_FdL2021' is a STALE FIT: it was fitted by Properties-mode ...\n";
    expect(staleFitRefusal(log)).toContain("STALE FIT");
    expect(staleFitRefusal("all fine\n")).toBeNull();
    expect(staleFitRefusal(undefined)).toBeNull();
  });
});
