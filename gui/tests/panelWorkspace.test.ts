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
  panelWorkspace -- the Panel workspace (DEV.md 4c C371, slice S2) held to the
  engine's own run of the shipped witness, edbatch01_constant_current.

  * the mapping from the `panel` block and the trajectory to each widget:
    limits, range, the value at the cursor, the words, the engine's state at
    an instant (inside and outside its alarm interval), "not published";
  * the count of alarms at an instant is a count of the engine's published
    intervals, and an element with no alarm is never counted nor coloured;
  * the pop-out's stash: written, read, followed, refused when corrupt;
  * the lineup: the Panel entry appears only where the case declares a panel;
  * the board renders the engine's facts verbatim and offers NO editing
    affordance (the only input is the time cursor).
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { extractStructured } from "../src/adapters/WasmAdapter.js";
import type { PanelReport } from "../src/adapters/panelPayload.js";
import type { RunResult } from "../src/adapters/SolverAdapter.js";
import { alarmCountAt, drawingRange, widgetsAt } from "../src/case/panelView.js";
import {
  casePanelStash, followedPanelStash, panelColumns, panelKeyOf, panelTabKey, panelTabUrl,
  readPanelStash, refreshPanelStash, writePanelStash,
} from "../src/case/panelPopOut.js";
import type { CaseFiles } from "../src/case/types.js";
import { PanelBoard } from "../src/ui/PanelWorkspace.js";
import { visibleWorkspacesFor, type WorkspaceContext } from "../src/ui/workspaces.js";
import { witnessOutput } from "./witnessRead.js";

const WITNESS = "tutorials/batch/electrodialysis/edbatch01_constant_current";
const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };

function trajectory(csv: string): { t: number[]; vars: { [k: string]: number[] } } {
  const [head, ...rows] = csv.trim().split("\n");
  const cols = head!.split(",");
  const vals = rows.map((r) => r.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  cols.slice(1).forEach((c, j) => { vars[c] = vals.map((r) => r[j + 1]!); });
  return { t: vals.map((r) => r[0]!), vars };
}

const report = (): PanelReport => extractStructured(witnessOutput(WITNESS, "log.choupoBatch"), emptyCase).panel!;
const traj = () => trajectory(witnessOutput(WITNESS, "trajectory.csv"));
const at = (t: number) => traj().t.indexOf(t);

describe("the panel at an instant: the mapping from the engine's block", () => {
  it("carries the limits, range, words and declared text of each element, verbatim", () => {
    const w = widgetsAt(report(), traj(), 0);
    const lamp = w.find((x) => x.name === "overLimiting")!;
    expect(lamp.kind).toBe("lamp");
    expect(lamp.column).toBe("rig.i_over_ilim");
    expect(lamp.range).toEqual([0, 2.5]);
    expect(lamp.limitHigh).toBe(1);
    expect(lamp.words).toEqual({ normal: "BELOW LIMITING", alarm: "OVER LIMITING" });
    expect(lamp.limitSource).toContain("film model");
    expect(lamp.action).toContain("lower the current");
    const temp = w.find((x) => x.name === "temperature")!;
    expect(temp.range).toEqual([273.15, 333.15]);
    expect(temp.limitHigh).toBe(313.15);
    expect(w.find((x) => x.name === "demineralisation")!.referenceColumn).toBe("rig.deminIdeal");
  });

  it("takes the value from the trajectory at the cursor's instant", () => {
    const tr = traj();
    const i = at(1000);
    const volt = widgetsAt(report(), tr, i).find((x) => x.name === "voltage")!;
    expect(volt.value).toBe(tr.vars["rig.U_V"]![i]);
    expect(volt.series).toBe(tr.vars["rig.U_V"]);
  });

  it("is in alarm exactly inside the engine's interval, and not before it", () => {
    const r = report();
    const lampEl = r.elements.find((e) => e.name === "overLimiting")!;
    const [t0, t1] = lampEl.intervals![0]!;
    const state = (t: number) => widgetsAt(r, traj(), at(t)).find((x) => x.name === "overLimiting")!.state;
    expect(state(t0)).toBe("alarm");
    expect(state(t1)).toBe("alarm");
    expect(state(t0 - 50)).toBe("normal");
  });

  it("counts the engine's published intervals at the cursor, and nothing the engine did not publish", () => {
    const r = report();
    const t0 = r.elements.find((e) => e.name === "overLimiting")!.intervals![0]![0];
    const before = alarmCountAt(widgetsAt(r, traj(), at(t0 - 50)));
    const during = alarmCountAt(widgetsAt(r, traj(), at(t0)));
    expect(before.active).toBe(0);
    expect(during.active).toBe(1);
    // three elements declare an alarm (overLimiting, currentDensity, temperature)
    expect(during.declared).toBe(3);
    expect(r.summary!.alarmsMax).toBe(1);
  });

  it("never colours or counts an element that declares no alarm", () => {
    const r = report();
    const w = widgetsAt(r, traj(), 0);
    const noAlarm = w.filter((x) => x.state === "noAlarm").map((x) => x.name).sort();
    expect(noAlarm).toEqual(["demineralisation", "diluate", "voltage"]);
    // a limit without an alarm: the engine publishes no state, so none is drawn
    const stripped: PanelReport = { ...r, elements: r.elements.map((e) =>
      e.name === "overLimiting" ? { ...e, intervals: undefined, alarmOn: undefined } : e) };
    const lamp = widgetsAt(stripped, traj(), at(2000)).find((x) => x.name === "overLimiting")!;
    expect(lamp.state).toBe("noAlarm");
    expect(lamp.limitHigh).toBe(1);
  });

  it("draws 'not published', never a zero, for a column the run does not carry", () => {
    const r = report();
    const ghost: PanelReport = { ...r, elements: [{ ...r.elements[0]!, published: false, column: "rig.nothing" }] };
    const w = widgetsAt(ghost, traj(), 3)[0]!;
    expect(w.state).toBe("notPublished");
    expect(w.value).toBeUndefined();
    const missing: PanelReport = { ...r, elements: [{ ...r.elements[0]!, published: true, column: "rig.nothing" }] };
    expect(widgetsAt(missing, traj(), 3)[0]!.state).toBe("notPublished");
  });

  it("uses the engine's range, or its published run span for a scale", () => {
    const w = widgetsAt(report(), traj(), 0);
    expect(drawingRange(w.find((x) => x.name === "voltage")!)).toEqual([0, 10]);
    const noRange = { ...w[0]!, range: undefined, runSpan: [5, 5] as [number, number] };
    expect(drawingRange(noRange)).toEqual([4, 6]);
  });

  it("keeps the cursor inside the run", () => {
    const tr = traj();
    expect(widgetsAt(report(), tr, 9999)[0]!.value).toBe(tr.vars["rig.kappa_dil_S_per_m"]![tr.t.length - 1]);
    expect(widgetsAt(report(), tr, -3)[0]!.value).toBe(tr.vars["rig.kappa_dil_S_per_m"]![0]);
  });
});

describe("the pop-out stash", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
  };
  const view = () => ({
    tutorialName: "batch/electrodialysis/edbatch01_constant_current",
    runResult: { status: "done", log: "", streams: [], convergence: [], panel: report(), trajectory: traj() } as RunResult,
    runInputs: null, caseFiles: emptyCase, scratchEdits: {},
  });

  it("carries only the columns the panel reads, and round-trips", () => {
    const s = casePanelStash(view())!;
    expect(Object.keys(s.trajectory.vars).sort()).toEqual(panelColumns(report()).sort());
    expect(Object.keys(s.trajectory.vars).length).toBeLessThan(Object.keys(traj().vars).length);
    const st = store();
    const key = writePanelStash(st, s);
    expect(key).toBe(panelTabKey(s.caseName));
    expect(readPanelStash(st, key)).toEqual(s);
    expect(panelKeyOf(panelTabUrl("/app/", key).split("?")[1]!.replace(/^/, "?"))).toBe(key);
  });

  it("is refused when absent, corrupt, of another version or empty", () => {
    const st = store();
    expect(readPanelStash(st, "x")).toBeNull();
    st.setItem("x", "{not json");
    expect(readPanelStash(st, "x")).toBeNull();
    st.setItem("x", JSON.stringify({ v: 2 }));
    expect(readPanelStash(st, "x")).toBeNull();
    const s = casePanelStash(view())!;
    st.setItem("x", JSON.stringify({ ...s, trajectory: { t: [], vars: {} } }));
    expect(readPanelStash(st, "x")).toBeNull();
  });

  it("exists only for a finished run that published a panel and a trajectory", () => {
    expect(casePanelStash({ ...view(), tutorialName: "" })).toBeNull();
    expect(casePanelStash({ ...view(), runResult: null })).toBeNull();
    const v = view();
    expect(casePanelStash({ ...v, runResult: { ...v.runResult!, status: "error" } })).toBeNull();
    expect(casePanelStash({ ...v, runResult: { ...v.runResult!, panel: undefined } })).toBeNull();
  });

  it("is refreshed only where a tab was ever opened, and follows the parent", () => {
    const st = store();
    const s = casePanelStash(view())!;
    expect(refreshPanelStash(st, s)).toBe(false);
    writePanelStash(st, s);
    expect(refreshPanelStash(st, s)).toBe(false);
    const prev = readPanelStash(st, panelTabKey(s.caseName));
    const failed = followedPanelStash({ ...view(), runResult: null }, prev)!;
    expect(failed.panel).toEqual(s.panel);
    expect(followedPanelStash({ ...view(), tutorialName: "other" }, prev)).toBeNull();
  });
});

describe("the lineup", () => {
  const BATCH: WorkspaceContext = {
    hasCase: true, showIntro: false, isPropsCase: false, application: "choupoBatch", hasPid: false,
  };
  it("offers Panel only where the case declares a panel (batch, ctrl, semi-continuous)", () => {
    expect(visibleWorkspacesFor(BATCH).map((w) => w.label)).not.toContain("Panel");
    expect(visibleWorkspacesFor({ ...BATCH, hasPanel: true }).map((w) => w.label)).toContain("Panel");
    for (const application of ["choupoCtrl", "choupoSemiContinuous"])
      expect(visibleWorkspacesFor({ ...BATCH, application, hasPanel: true }).map((w) => w.label)).toContain("Panel");
    for (const application of ["choupoSolve", "choupoProps"])
      expect(visibleWorkspacesFor({ ...BATCH, application, hasPanel: true }).map((w) => w.label)).not.toContain("Panel");
  });
});

describe("the board", () => {
  const html = (): string => renderToStaticMarkup(
    createElement(MantineProvider, null,
      createElement(PanelBoard, { report: report(), trajectory: traj(), caseName: "edbatch01" })));

  it("lists the engine's facts and messages as the engine wrote them", () => {
    const h = html();
    for (const f of report().facts) expect(h).toContain(f.explanation.replace(/`/g, "`").replace(/&/g, "&amp;"));
    for (const m of report().messages) expect(h).toContain(m.text);
  });

  it("opens on the last instant, where the over-limiting lamp is in alarm", () => {
    const h = html();
    expect(h).toContain("OVER LIMITING");
    expect(h).toContain("1 of 3 alarms active at this instant");
  });

  it("says what each element is for and what its limit comes from", () => {
    const h = html();
    expect(h).toContain("the diluate is the product");
    expect(h).toContain("the stack record&#x27;s limits { i_max }");
  });

  it("is read-only: the only input is the time cursor", () => {
    const h = html();
    expect(h).not.toMatch(/<textarea|<button|<select|contenteditable/);
    const inputs = h.match(/<input[^>]*>/g) ?? [];
    expect(inputs.length).toBe(1);
    expect(inputs[0]).toContain('type="range"');
    expect(inputs[0]).toContain('aria-label="time cursor"');
  });
});
