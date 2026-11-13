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
  operatorPanels -- the operator-panels EduTool held to the engine and to
  the shipped case.

  * the panelDict the page writes for the worked panel parses, with the app's
    own dict reader, to the SAME elements and messages as the shipped
    edbatch01 panelDict (the grammar the engine accepted when S1 landed);
  * the case the page hands the engine is the witness, with the disturbance
    written into the declared slot and the page's panel in place;
  * the page's reader of the result (adapters/panelPayload, through the
    adapter's own extractStructured) carries the ENGINE's panel block of a
    real native run of the witness unchanged -- every fact, every interval --
    and derives none;
  * the stale-answer guard refuses an answer to another panel or another
    disturbance;
  * the page renders its lesson before any run.

  The engine's native runs of the page's other panels (the naive, growth and
  exercise panels on every disturbance) are recorded in
  docs/design/operator-panels-good-practice.md, section 3; no engine runs in
  node here except the witness the setup runs.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { parse } from "../src/dict/parser.js";
import { toJson } from "../src/dict/json.js";
import { extractStructured } from "../src/adapters/WasmAdapter.js";
import { shapePanel } from "../src/adapters/panelPayload.js";
import type { CaseFiles } from "../src/case/types.js";
import { filesToCaseFiles, tutorialByName } from "../src/cases/tutorials.js";
import {
  DEFECTS, PANEL_CASE_NAME, PANEL_VARIANTS, PANEL_WITNESS, alarmOnsets, answerMatches,
  basePanel, defectPanel, growthStages, inAlarmAt, maxOnsetsInWindow, naivePanel,
  panelCaseFiles, panelDictText, variantById, type PanelSpec,
} from "../src/case/operatorPanels.js";
import { OperatorPanelsTool } from "../src/ui/methods/OperatorPanelsTool.js";
import { PANEL_LIMITS, PANEL_STEPS } from "../src/ui/methods/operatorPanelsLesson.js";
import { REPO } from "./witnessOutputs.js";
import { witnessOutput } from "./witnessRead.js";

const WITNESS = "tutorials/batch/electrodialysis/edbatch01_constant_current";
const read = (text: string) => toJson(parse(text, { sourceName: "panelDict" }));

describe("the panelDict the page writes", () => {
  it("parses to the shipped edbatch01 panel, element for element", () => {
    const shipped = read(readFileSync(join(REPO, WITNESS, "system/panelDict"), "utf-8"));
    const mine = read(panelDictText(basePanel()));
    expect(mine["elements"]).toEqual(shipped["elements"]);
    expect(mine["messages"]).toEqual(shipped["messages"]);
    expect(mine["grid"]).toEqual(shipped["grid"]);
  });

  it("writes every lesson panel in a form the reader accepts, names unique, places inside the grid and not overlapping", () => {
    const all: PanelSpec[] = [basePanel(), basePanel(0.5), naivePanel(), defectPanel(),
      ...growthStages().map((g) => g.panel)];
    for (const p of all) {
      const j = read(panelDictText(p));
      expect(Array.isArray(j["elements"])).toBe(true);
      const names = p.elements.map((e) => e.name);
      expect(new Set(names).size).toBe(names.length);
      const held = new Set<string>();
      for (const e of p.elements) {
        expect(e.place.column + e.place.width - 1).toBeLessThanOrEqual(12);
        expect(e.place.row + e.place.height - 1).toBeLessThanOrEqual(p.rows);
        for (let c = e.place.column; c < e.place.column + e.place.width; c++)
          for (let r = e.place.row; r < e.place.row + e.place.height; r++) {
            const k = `${c},${r}`;
            expect(held.has(k), `${p.title}: ${e.name} overlaps at ${k}`).toBe(false);
            held.add(k);
          }
        //  the engine refuses an alarm without a limit or an action, and a
        //  limit without a source or a reason (check_panel arm c)
        if (e.alarm) { expect(e.limit).toBeDefined(); expect(e.alarm.action.length).toBeGreaterThan(0); }
        if (e.limit) { expect(e.limit.source.length).toBeGreaterThan(0); expect(e.limit.reason.length).toBeGreaterThan(0); }
        expect(e.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("the limit knob of step 5 moves only the lamp's high limit", () => {
    const a = read(panelDictText(basePanel(1))), b = read(panelDictText(basePanel(2.25)));
    const els = (j: typeof a) => j["elements"] as { [k: string]: unknown }[];
    expect(els(b).find((e) => e["name"] === "overLimiting")!["limit"]).toMatchObject({ high: 2.25 });
    expect(els(a).filter((e) => e["name"] !== "overLimiting")).toEqual(els(b).filter((e) => e["name"] !== "overLimiting"));
  });
});

describe("the case the page hands the engine", () => {
  const raw = tutorialByName(PANEL_WITNESS)!.files.rawFiles!;

  it("is the bundled witness with the page's panel in place", () => {
    const files = panelCaseFiles(raw, variantById("base"), defectPanel());
    expect(files["system/panelDict"]).toBe(panelDictText(defectPanel()));
    expect(files["system/flowsheetDict"]).toBe(raw["system/flowsheetDict"]);
    expect(files[`${PANEL_CASE_NAME}.cho`]).toBe("");
    const cf = filesToCaseFiles(PANEL_CASE_NAME, files);
    expect(cf.controlDict["application"]).toBe("choupoBatch");
  });

  it("writes each disturbance into its declared slot and nowhere else", () => {
    const hi = panelCaseFiles(raw, variantById("highCurrent"), basePanel());
    expect(hi["system/flowsheetDict"]).toMatch(/current\s+4\.5;/);
    const lo = panelCaseFiles(raw, variantById("lowEfficiency"), basePanel());
    expect(lo["system/flowsheetDict"]).toMatch(/xi\s+0\.6;/);
    const rich = panelCaseFiles(raw, variantById("richDiluate"), basePanel());
    expect(rich["system/flowsheetDict"]).toBe(raw["system/flowsheetDict"]);
    expect(rich["0/internalStates/rig"]).toMatch(/totalMoles\s+0\.2795418672;/);
    // the concentrate block keeps its own declaration (second occurrence)
    expect(rich["0/internalStates/rig"]).toMatch(/totalMoles\s+0\.2825418672;/);
  });
});

/** Parse the witness's trajectory.csv the way the adapter would hand it over. */
function trajectory(csv: string): { t: number[]; vars: { [k: string]: number[] } } {
  const [head, ...rows] = csv.trim().split("\n");
  const cols = head!.split(",");
  const vals = rows.map((r) => r.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  cols.slice(1).forEach((c, j) => { vars[c] = vals.map((r) => r[j + 1]!); });
  return { t: vals.map((r) => r[0]!), vars };
}

describe("the engine's own panel block, read by the page", () => {
  const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };

  it("is carried unchanged: every element number, interval and fact the engine wrote", () => {
    const log = witnessOutput(WITNESS, "log.choupoBatch");
    const report = extractStructured(log, emptyCase).panel;
    expect(report).toBeDefined();
    const begin = log.lastIndexOf("<<<Choupo:result-begin>>>"), end = log.lastIndexOf("<<<Choupo:result-end>>>");
    const raw = JSON.parse(log.slice(begin + "<<<Choupo:result-begin>>>".length, end))["panel"];
    expect(shapePanel(raw)).toEqual(report);
    for (const r of raw["elements"] as { [k: string]: unknown }[]) {
      const e = report!.elements.find((x) => x.id === r["id"])!;
      for (const k of ["min", "max", "violated", "closestApproachFraction", "limitHigh", "rangeMin", "rangeMax"])
        if (typeof r[k] === "number") expect((e as unknown as { [k: string]: unknown })[k]).toBe(r[k]);
      if (r["intervals"]) expect(e.intervals).toEqual(r["intervals"]);
      expect(e.column).toBe(r["column"]);
    }
    expect(report!.facts.map((f) => f.id)).toEqual((raw["facts"] as { id: string }[]).map((f) => f.id));
    expect(report!.summary?.alarmsMax).toBe(raw["summary"][0]["alarmsMax"]);
  });

  it("is the answer to the worked panel on the designed run, and the lamp reads the engine's interval", () => {
    const report = extractStructured(witnessOutput(WITNESS, "log.choupoBatch"), emptyCase).panel!;
    const traj = trajectory(witnessOutput(WITNESS, "trajectory.csv"));
    expect(answerMatches(report, traj, basePanel(), variantById("base"))).toBe(true);
    const lamp = report.elements.find((e) => e.name === "overLimiting")!;
    // the page asks the engine's interval; it does not compare i/i_lim with 1
    const [t0] = lamp.intervals![0]!;
    expect(inAlarmAt(lamp, t0)).toBe(true);
    expect(inAlarmAt(lamp, t0 - 50)).toBe(false);
    expect(inAlarmAt(report.elements.find((e) => e.name === "voltage")!, t0)).toBeUndefined();
    // the onsets are the starts of the engine's intervals, nothing else
    expect(alarmOnsets(report).map((o) => o.t)).toEqual(
      report.elements.flatMap((e) => (e.intervals ?? []).map(([a]) => a)).sort((a, b) => a - b));
  });

  it("refuses an answer that belongs to another panel or another disturbance (stale guard)", () => {
    const report = extractStructured(witnessOutput(WITNESS, "log.choupoBatch"), emptyCase).panel!;
    const traj = trajectory(witnessOutput(WITNESS, "trajectory.csv"));
    expect(answerMatches(report, traj, basePanel(0.5), variantById("base"))).toBe(false);
    expect(answerMatches(report, traj, defectPanel(), variantById("base"))).toBe(false);
    for (const v of PANEL_VARIANTS.filter((x) => x.id !== "base"))
      expect(answerMatches(report, traj, basePanel(), v), v.id).toBe(false);
    expect(answerMatches(undefined, traj, basePanel(), variantById("base"))).toBe(false);
  });
});

describe("the page's own arithmetic", () => {
  it("counts onsets inside a window", () => {
    expect(maxOnsetsInWindow([{ t: 0 }, { t: 100 }, { t: 700 }, { t: 750 }, { t: 800 }], 600)).toBe(3);
    expect(maxOnsetsInWindow([], 600)).toBe(0);
  });
  it("every planted defect names an element of the exercise panel", () => {
    const names = new Set(defectPanel().elements.map((e) => e.name));
    for (const d of DEFECTS) for (const n of d.where.split(" + ")) expect(names.has(n), d.id).toBe(true);
  });
});

describe("the page", () => {
  it("renders its lesson and limits before any run", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(OperatorPanelsTool)));
    expect(html).toContain("Operator panels and alarms");
    const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
    for (const s of PANEL_STEPS) expect(html).toContain(esc(s.title.slice(0, 24)));
    for (const l of PANEL_LIMITS) expect(html).toContain(esc(l.title.slice(0, 24)));
  });
});
