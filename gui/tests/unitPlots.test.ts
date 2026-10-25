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

/*  THE PLOTS PAGE NAVIGATES BY UNIT (DEV.md 4c C156).  The units tree is a
    pure function of what the result publishes (case/unitPlots.ts); these arms
    hold its rule -- flat vs sectored, the plant-level units a sectored plant
    does not stamp, greyed units, the global convergence rows that name no
    unit, a unit the result does not carry -- and hold the workspace to
    DRAWING it: the sector comes from the engine's stamp, the focus from
    `setViewUnit`, the theory from the flowsheet's own destination function.
    The two fixtures transcribe the shapes MEASURED on native runs of
    ammonia02_full_plant and greenAmmonia03_basicDesign. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  declaredMemberNames, unitPlotTree, unitSelection, type UnitTreeEntry,
} from "../src/case/unitPlots.js";

const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

const units = (t: UnitTreeEntry[]) =>
  t.flatMap((e) => (e.kind === "unit" ? [e.node] : []));
const sectors = (t: UnitTreeEntry[]) =>
  t.flatMap((e) => (e.kind === "sector" ? [e.group] : []));

describe("unitPlotTree: a FLAT case lists its units directly", () => {
  const tree = unitPlotTree({
    kpis: { makeupComp: {}, converter: { T_out: 700 }, separator: {}, FEHE: {}, economics: { NPV: 1 } },
    profiles: [{ unit: "FEHE" }],
    convergence: [
      { label: "converter" },
      { label: "Mass balance (global)" },
      { label: "Energy balance (global)" },
    ],
    declaredMembers: ["makeupComp", "FEHE", "converter", "separator", "neverRan"],
  });

  it("puts every carried unit at the top level, in declared order, under no sector", () => {
    expect(sectors(tree)).toEqual([]);
    expect(units(tree).map((n) => n.unit)).toEqual(["makeupComp", "FEHE", "converter", "separator"]);
  });
  it("lists only units the result carries -- a declared unit with no kpis entry is not listed", () => {
    expect(units(tree).find((n) => n.unit === "neverRan")).toBeUndefined();
  });
  it("never lists a pass's own KPI block as a unit", () => {
    expect(units(tree).find((n) => n.unit === "economics")).toBeUndefined();
  });
  it("files each plot under the unit the engine keyed it by, and the global rows under none", () => {
    expect(units(tree).find((n) => n.unit === "converter")!.plots.map((p) => p.key))
      .toEqual(["convergence"]);
    expect(units(tree).find((n) => n.unit === "FEHE")!.plots.map((p) => p.key))
      .toEqual(["profile"]);
    expect(units(tree).flatMap((n) => n.plots).length).toBe(2);
  });
  it("a unit with nothing published is listed with an empty plot list (drawn greyed)", () => {
    const m = units(tree).find((n) => n.unit === "makeupComp")!;
    expect(m.plots).toEqual([]);
    expect(unitSelection(m)).toBeNull();
  });
});

describe("unitPlotTree: a SECTORED case keeps the sector level, from the engine's stamp", () => {
  //  The engine stamps the CONVERTER's units and NONE of the plant-level
  //  folder units.  One unit name carries a dot of its own: splitting on the
  //  last dot would file it under "CONVERTER.Bed" -- the stamp says CONVERTER.
  const tree = unitPlotTree({
    unitSectors: {
      "CONVERTER.Bed.1": "CONVERTER",
      "CONVERTER.InterbedCooler1": "CONVERTER",
    },
    kpis: { "N2Boost": {}, "CONVERTER.Bed.1": {}, "CONVERTER.InterbedCooler1": {}, FEHE: {}, economics: {} },
    profiles: [{ unit: "CONVERTER.Bed.1" }, { unit: "FEHE" }],
    convergence: [{ label: "CONVERTER.Bed.1" }, { label: "N2Boost" }],
    declaredMembers: ["N2Boost", "CONVERTER", "FEHE"],
  });

  it("keeps the declared order, a sector heading where the sector is declared", () => {
    expect(tree.map((e) => (e.kind === "unit" ? e.node.unit : `[${e.group.sector}]`)))
      .toEqual(["N2Boost", "[CONVERTER]", "FEHE"]);
  });
  it("lists the plant's own unstamped units directly -- FEHE's profile is reachable", () => {
    expect(units(tree).find((n) => n.unit === "FEHE")!.plots.map((p) => p.key)).toEqual(["profile"]);
  });
  it("groups the stamped units by the stamp, in the engine's order", () => {
    expect(sectors(tree)[0]!.units.map((n) => n.unit))
      .toEqual(["CONVERTER.Bed.1", "CONVERTER.InterbedCooler1"]);
  });
  it("labels a unit by its leaf under the heading, but keys it by the qualified name", () => {
    const bed = sectors(tree)[0]!.units[0]!;
    expect(bed.label).toBe("Bed.1");
    expect(bed.unit).toBe("CONVERTER.Bed.1");
  });
  it("orders a unit's plots profile then convergence", () => {
    expect(sectors(tree)[0]!.units[0]!.plots.map((p) => p.key)).toEqual(["profile", "convergence"]);
  });
  it("greys a unit with nothing published", () => {
    expect(sectors(tree)[0]!.units[1]!.plots).toEqual([]);
  });
  it("a stamped sector the declaration does not name still gets its heading", () => {
    const t = unitPlotTree({ unitSectors: { "A.x": "A" }, declaredMembers: [] });
    expect(t).toEqual([{ kind: "sector", group: { sector: "A", units: [{ unit: "A.x", label: "x", plots: [] }] } }]);
  });
});

describe("unitSelection: a click opens the plot FOCUSED on that unit", () => {
  const node = { unit: "C1", label: "C1", plots: [
    { key: "profile" as const, label: "Profile" },
    { key: "convergence" as const, label: "Convergence" },
  ] };
  it("a unit row opens its first published plot", () => {
    expect(unitSelection(node)).toEqual({ view: "profile", unit: "C1" });
  });
  it("a leaf opens its own plot", () => {
    expect(unitSelection(node, "convergence")).toEqual({ view: "convergence", unit: "C1" });
  });
});

describe("declaredMemberNames reads inline blocks, folder units and sectors alike", () => {
  it("reads every form, in order", () => {
    expect(declaredMemberNames({ units: [{ name: "A", type: "mixer" }, "B"], sectors: ["S"] }))
      .toEqual(["A", "B", "S"]);
    expect(declaredMemberNames(undefined)).toEqual([]);
  });
});

describe("the workspace draws the tree and computes nothing of its own", () => {
  const w = src("ui/PlotsWorkspace.tsx");
  it("builds the tree through case/unitPlots.ts from the engine's unitSectors stamp", () => {
    expect(w).toMatch(/unitPlotTree\(/);
    expect(w).toMatch(/result\.unitSectors/);
  });
  it("never recovers a sector by splitting a unit name", () => {
    expect(w).not.toMatch(/\.split\(\s*["']\.["']\s*\)/);
    expect(w).not.toMatch(/lastIndexOf\(\s*["']\.["']\s*\)/);
    expect(src("case/unitPlots.ts")).not.toMatch(/\.split\(\s*["']\.["']\s*\)/);
  });
  it("focuses the plot on the unit through setViewUnit, and both focusable plots read it", () => {
    expect(w).toMatch(/setViewUnit\(sel\.unit\)/);
    expect(w).toMatch(/<ProfilePlot profiles=\{result\.profiles\}\s*\{\.\.\.\(viewUnit !== undefined \? \{ unit: viewUnit \}/);
    expect(w).toMatch(/<ConvergencePlot curves=\{result\.convergence\}\s*\{\.\.\.\(viewUnit !== undefined \? \{ unit: viewUnit \}/);
  });
  it("opens a unit's theory through the flowsheet's own destination function", () => {
    expect(w).toMatch(/tabHelp\(\{\s*kind: "case", selectedUnitType: unitTypeOf\(unit\)/);
    expect(w).toMatch(/selectedUnitTypeIn\(/);
    expect(w).not.toMatch(/help-index\.json/);
  });
  it("a new run still clears the unit focus and lands as before", () => {
    expect(w).toMatch(/A NEW RUN CLEARS THE UNIT FOCUS[\s\S]*setViewUnit\(undefined\)/);
    expect(w).toMatch(/else if \(\(result\.profiles\?\.length \?\? 0\) > 0\) setView\("profile"\)/);
  });
  it("a focused convergence plot keeps the unit's own curve and the global ones only", () => {
    const c = src("ui/plotting/ConvergencePlot.tsx");
    expect(c).toMatch(/allCurves\.filter\(\(c\) => c\.label === unit \|\| isGlobal\(c\.label\)\)/);
  });
});
