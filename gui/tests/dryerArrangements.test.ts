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
  The "Co-current, counter-current, cross-flow" section of the dryer-selection
  page (DEV.md 4c C465, Vitor 2026-11-21).  What is held:

    (a) the three drawings: where the arrows point is read from THEIR
        COORDINATES (data-dx), so a picture that drew the gas the wrong way
        fails, whatever its caption says; and the gas is hot (red) at its inlet
        end and used up (grey) at its outlet end;
    (b) the engine's own run of the three witness cases (witnessOutputs.ts,
        generated with this tree's binary): the profile starts at the solid
        inlet moisture and ends at the outlet KPI, the gas humidity rises along
        a co-current dryer and falls along a counter-current one, and the
        outlet moistures order counter-current < cross-flow < co-current, which
        is what steps 5, 7 and the quiz say;
    (c) each unit of the page's table is the arrangement it claims: the case's
        `flow` word;
    (d) every engine file:line the lesson cites is a CLAIMS key, held to the
        line, so repoint_lesson_citations keeps it and
        check_lesson_prose_citations is satisfied;
    (e) the rendered section: three cards each with its case button, the pages
        the use table prints, the quiz still at its cap of seven.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { extractStructured } from "../src/adapters/WasmAdapter.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import type { CaseFiles } from "../src/case/types.js";
import { ArrangementDrawing, GAS_COLOR, VAPOUR_COLOR } from "../src/ui/methods/dryerDrawings.js";
import {
  ARRANGEMENT_CASES, ARRANGEMENT_IDS, ARRANGEMENT_USES, outletOfUnit, profileOfUnit,
  type ArrangementId,
} from "../src/ui/methods/dryerArrangements.js";
import { DRYER_SELECTION_QUIZ, DRYER_SELECTION_STEPS } from "../src/ui/methods/dryerSelectionLesson.js";
import { DryerSelectionTool } from "../src/ui/methods/DryerSelectionTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, ROOT), "utf8");
const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };

const drawing = (id: ArrangementId): string =>
  renderToStaticMarkup(createElement(ArrangementDrawing, { id, label: id }));

interface Arrow { flow: string; dx: number; dy: number; x1: number; color: string }

/** Every arrow of a drawing, read from its own coordinates. */
function arrows(html: string): Arrow[] {
  const out: Arrow[] = [];
  const re = /<g data-flow="(gas|solid)" data-dx="(-?[\d.]+)" data-dy="(-?[\d.]+)"><line x1="(-?[\d.]+)"[^>]*stroke="(#[0-9a-fA-F]+)"/g;
  for (const m of html.matchAll(re))
    out.push({ flow: m[1]!, dx: Number(m[2]), dy: Number(m[3]), x1: Number(m[4]), color: m[5]! });
  return out;
}

describe("(a) the three drawings say which way the gas goes, in their own coordinates", () => {
  const solid = (id: ArrangementId) => arrows(drawing(id)).filter((a) => a.flow === "solid");
  const gas = (id: ArrangementId) => arrows(drawing(id)).filter((a) => a.flow === "gas");
  // the arrows INSIDE the duct, along it: 38 long, where the in and out stubs are 30 long
  const along = (id: ArrangementId) => gas(id).filter((a) => Math.abs(a.dx) === 38 && a.dy === 0);

  it("the solid goes left to right in all three", () => {
    for (const id of ARRANGEMENT_IDS) {
      expect(solid(id).length, id).toBe(2);
      for (const a of solid(id)) expect(a.dx, id).toBeGreaterThan(0);
    }
  });
  it("co-current: the gas goes the same way as the solid", () => {
    expect(along("cocurrent").length).toBe(3);
    for (const a of along("cocurrent")) expect(a.dx).toBeGreaterThan(0);
  });
  it("counter-current: the gas goes the opposite way to the solid", () => {
    expect(along("countercurrent").length).toBe(3);
    for (const a of along("countercurrent")) expect(a.dx).toBeLessThan(0);
  });
  it("cross-flow: the gas arrows are vertical, and cross the bed in every element", () => {
    const g = gas("crossflow");
    expect(g.length).toBe(10);
    for (const a of g) { expect(a.dx).toBe(0); expect(a.dy).toBeLessThan(0); }
  });
  it("the gas is hot (red) at its inlet end and used up (grey) at its outlet end", () => {
    const co = along("cocurrent").sort((a, b) => a.x1 - b.x1);
    expect(co[0]!.color).toBe(GAS_COLOR);
    expect(co[co.length - 1]!.color).toBe(VAPOUR_COLOR);
    const counter = along("countercurrent").sort((a, b) => a.x1 - b.x1);
    expect(counter[counter.length - 1]!.color).toBe(GAS_COLOR);   // the fresh gas is at the RIGHT, the solid's exit
    expect(counter[0]!.color).toBe(VAPOUR_COLOR);
  });
  it("each is an inline SVG of primitives with no image and no link, and names its arrangement", () => {
    for (const id of ARRANGEMENT_IDS) {
      const html = drawing(id);
      expect(html).toContain(`data-arrangement="${id}"`);
      expect(html).not.toMatch(/<image|href=|xlink/);
    }
  });
});

describe("(c) each case's unit is the arrangement the page says", () => {
  const flowWord: Record<ArrangementId, string> = {
    cocurrent: "cocurrent", countercurrent: "countercurrent", crossflow: "crossflow",
  };
  it.each(ARRANGEMENT_IDS)("%s: the bundled case exists and the unit declares that flow", (id) => {
    const c = ARRANGEMENT_CASES[id];
    const entry = tutorialByName(c.witness);
    expect(entry?.files.rawFiles, c.witness).toBeDefined();
    const text = entry!.files.rawFiles!["system/flowsheetDict"]!;
    const at = text.indexOf(`name        ${c.unit};`);
    expect(at, `${c.unit} in ${c.witness}`).toBeGreaterThan(0);
    const next = text.indexOf("name ", at + 10);
    const block = text.slice(at, next > 0 ? next : undefined);
    expect(block).toMatch(new RegExp(`flow\\s+${flowWord[id]};`));
  });
});

describe("(b) the engine's own run of the three cases, as this tree's binary wrote it", () => {
  const run = (id: ArrangementId) => {
    const c = ARRANGEMENT_CASES[id];
    const r = extractStructured(witnessOutput(`tutorials/${c.witness}`, "log.choupoSolve"), emptyCase);
    return { c, p: profileOfUnit(r.profiles, c.unit), o: outletOfUnit(r.kpis, c.unit), k: r.kpis[c.unit]! };
  };

  it.each(ARRANGEMENT_IDS)("%s: the profile runs from the solid inlet to its outlet, in the KPIs' own numbers", (id) => {
    const { p, o, k } = run(id);
    expect(p, "profile").not.toBeNull();
    expect(o, "outlet").not.toBeNull();
    expect(p!.xi[0]).toBeCloseTo(0, 12);
    expect(p!.xi[p!.xi.length - 1]).toBeCloseTo(1, 12);
    for (let i = 1; i < p!.xi.length; i++) expect(p!.xi[i]!).toBeGreaterThan(p!.xi[i - 1]!);
    expect(p!.X[0]).toBeCloseTo(k["X_initial"]!, 9);
    expect(p!.X[p!.X.length - 1]).toBeCloseTo(o!.X, 9);
    // the solid only dries
    for (let i = 1; i < p!.X.length; i++) expect(p!.X[i]!).toBeLessThanOrEqual(p!.X[i - 1]! + 1e-12);
  });

  it("co-current: the gas starts at the fed humidity and grows more humid along the solid", () => {
    const { p, o, k } = run("cocurrent");
    expect(p!.Y[0]).toBeCloseTo(k["Y_air_in"]!, 9);
    expect(p!.Y[p!.Y.length - 1]).toBeCloseTo(o!.Y, 9);
    for (let i = 1; i < p!.Y.length; i++) expect(p!.Y[i]!).toBeGreaterThanOrEqual(p!.Y[i - 1]! - 1e-12);
  });
  it("counter-current: the gas is the exhaust at the solid inlet and the fed gas at the solid outlet", () => {
    const { p, o, k } = run("countercurrent");
    expect(p!.Y[0]).toBeCloseTo(o!.Y, 9);
    expect(p!.Y[p!.Y.length - 1]).toBeCloseTo(k["Y_air_in"]!, 9);
    for (let i = 1; i < p!.Y.length; i++) expect(p!.Y[i]!).toBeLessThanOrEqual(p!.Y[i - 1]! + 1e-12);
    // the driest solid meets the hottest gas: the gas at the solid outlet is hotter than at its inlet
    expect(p!.T[p!.T.length - 1]!).toBeGreaterThan(p!.T[0]!);
  });
  it("co-current: the gas cools along the solid, so the driest solid meets the coolest gas", () => {
    const { p } = run("cocurrent");
    expect(p!.T[p!.T.length - 1]!).toBeLessThan(p!.T[0]!);
  });

  it("the outlets order as steps 5 and 7 and the quiz say: counter-current < cross-flow < co-current in X", () => {
    const X = (id: ArrangementId) => run(id).o!.X;
    expect(X("countercurrent")).toBeLessThan(X("crossflow"));
    expect(X("crossflow")).toBeLessThan(X("cocurrent"));
  });
  it("the gas leaves most humid from counter-current and coolest from it: the same trade from the other end", () => {
    const o = (id: ArrangementId) => run(id).o!;
    expect(o("countercurrent").Y).toBeGreaterThan(o("cocurrent").Y);
    expect(o("countercurrent").Tair).toBeLessThan(o("cocurrent").Tair);
  });
  it("the critical moisture is crossed furthest along the dryer in cross-flow", () => {
    const x = (id: ArrangementId) => run(id).o!.xiCrit!;
    expect(x("crossflow")).toBeGreaterThan(x("countercurrent"));
    expect(x("countercurrent")).toBeGreaterThan(x("cocurrent"));
  });
  it("the solid leaves at nearly one temperature in all three (the step 6 note's claim)", () => {
    const T = ARRANGEMENT_IDS.map((id) => run(id).k["T_solid_out"]!);
    expect(Math.max(...T) - Math.min(...T)).toBeLessThan(1.0);
  });
});

describe("the readers refuse a profile they cannot read", () => {
  const ok = { unit: "u", xAxis: "position", columns: {
    position: [0, 1], X_kg_kg: [0.2, 0.1], Y_kg_kg: [0.01, 0.02], T_gas_K: [400, 350] } };
  it("takes a complete one", () => expect(profileOfUnit([ok], "u")).not.toBeNull());
  it("refuses a missing unit, a missing column and columns of different lengths", () => {
    expect(profileOfUnit([ok], "v")).toBeNull();
    expect(profileOfUnit(undefined, "u")).toBeNull();
    const noT = { ...ok, columns: { ...ok.columns, T_gas_K: undefined as unknown as number[] } };
    expect(profileOfUnit([noT], "u")).toBeNull();
    expect(profileOfUnit([{ ...ok, columns: { ...ok.columns, Y_kg_kg: [0.01] } }], "u")).toBeNull();
  });
  it("outlet: refuses a KPI map without the three numbers", () => {
    expect(outletOfUnit({ u: { X_final: 0.1, Y_air_out: 0.02, T_air_out: 350 } }, "u")).not.toBeNull();
    expect(outletOfUnit({ u: { X_final: 0.1, Y_air_out: 0.02 } }, "u")).toBeNull();
    expect(outletOfUnit({}, "u")).toBeNull();
  });
});

describe("(d) the lesson's engine citations are held to the line", () => {
  const lessonText = DRYER_SELECTION_STEPS.flatMap((s) => [s.body, s.note ?? ""]).join("\n");
  const cited = new Set([...lessonText.matchAll(/(ConvectiveDryer\.(?:cpp|H)):(\d+)/g)].map((m) => m[0]));
  const CLAIMS: Record<string, string> = {
    "ConvectiveDryer.H:51": "S dX/dxi = - R A",
    "ConvectiveDryer.H:55": "Y = Y_in + S (X_in - X)/G; counter-current Y = Y_out - S (X_in - X)/G)",
    "ConvectiveDryer.H:85": "dX/dxi = - Wdot(X)/S,   Y_2 - Y_1 = Wdot(X)/G",
    "ConvectiveDryer.H:86": "drivingForce logMean:  G ln[(Y*-Y_1)/(Y*-Y_2)] = k_Y A f(Phi)",
    "ConvectiveDryer.cpp:477": "return logMean ? G * (Ystar - Y_in) * (1.0 - std::exp(-ntu))",
    "ConvectiveDryer.cpp:575": "scalar lo = Xeq_in, hi = X_in;",
  };
  const FILES: Record<string, string> = {
    "ConvectiveDryer.H": "src/unitOperations/heatTransfer/ConvectiveDryer.H",
    "ConvectiveDryer.cpp": "src/unitOperations/heatTransfer/ConvectiveDryer.cpp",
  };
  it("every cited line is a claim, and every claim is cited", () => {
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const c of Object.keys(CLAIMS)) expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
  });
  it("each cited line says what the lesson claims", () => {
    for (const [c, want] of Object.entries(CLAIMS)) {
      const [file, line] = c.split(":");
      expect(read(FILES[file!]!).split("\n")[Number(line) - 1], c).toContain(want);
    }
  });
});

describe("(e) the rendered section and the lesson around it", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));

  it("has its heading, its three cards and one open-case button per case", () => {
    expect(html).toContain("Co-current, counter-current, cross-flow");
    for (const id of ARRANGEMENT_IDS) {
      expect(html).toContain(`data-arrangement-card="${id}"`);
      expect(html).toContain(`data-engine-case="${ARRANGEMENT_CASES[id].witness}"`);
      expect(html).toContain(`Open the case ${ARRANGEMENT_CASES[id].witness.split("/").pop()}`);
    }
  });
  it("draws the figure and the outlet table from a run, and says so while none has arrived", () => {
    expect(html).toContain("data-arrangement-runs");
    expect(html).toContain("data-arrangement-pending");     // a static render runs no engine
    for (const id of ARRANGEMENT_IDS) expect(html).toContain(`data-outlet-row="${id}"`);
    // not one number of the outlet table is in the page's source: a static render shows dashes
    const row = html.match(/data-outlet-row="cocurrent".*?<\/tr>/)![0];
    expect(row).not.toMatch(/\d\.\d/);
  });
  it("the use table prints the pages each book says it at", () => {
    expect(ARRANGEMENT_USES.map((u) => u.id)).toEqual([...ARRANGEMENT_IDS]);
    for (const u of ARRANGEMENT_USES) {
      expect(html).toContain(`data-use-row="${u.id}"`);
      expect(u.src, u.id).toMatch(/p\. 12-36|p\. 42/);
    }
    const t = ARRANGEMENT_USES.map((u) => u.why).join(" ");
    expect(t).toContain("very suitable for drying heat-sensitive materials");
    expect(t).toContain("unsuitable for thermally sensitive solids");
    expect(ARRANGEMENT_USES.find((u) => u.id === "crossflow")!.src).toContain("3.6.2.3.1, p. 65");
  });
  it("steps 5 to 8 exist, the quiz stays at its cap of seven, and its new questions point at them", () => {
    expect(DRYER_SELECTION_STEPS.map((s) => s.n).slice(4, 8)).toEqual([5, 6, 7, 8]);
    expect(DRYER_SELECTION_QUIZ.length).toBeLessThanOrEqual(7);
    const ids = DRYER_SELECTION_QUIZ.map((q) => q.id);
    expect(ids).toContain("which-end");
    expect(ids).toContain("pick-arrangement");
    for (const q of DRYER_SELECTION_QUIZ) for (const n of q.steps)
      expect(DRYER_SELECTION_STEPS.some((s) => s.n === n), `${q.id} step ${n}`).toBe(true);
  });
  it("the page is registered as running the engine", () => {
    const e = METHOD_TOOLS.find((t) => t.id === "dryer-selection")!;
    expect([...e.origins!].sort()).toEqual(["assumption", "engine", "page", "reference"]);
  });
});
