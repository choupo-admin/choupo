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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  designSheetTree, reportSections, sectionDomId, type ReportFacts,
} from "../src/case/reportSections.js";

const NONE: ReportFacts =
  { equipment: false, sheets: false, columns: false, exchangers: false, economics: false };
const ALL: ReportFacts =
  { equipment: true, sheets: true, columns: true, exchangers: true, economics: true };

describe("reportSections: which reports exist, decided once", () => {
  it("a bare converged run has exactly the three unconditional sections, in "
     + "page order", () => {
    expect(reportSections(NONE).map((s) => s.id)).toEqual(["utilities", "mass", "energy"]);
  });

  it("every earned section appears when earned, in page order", () => {
    expect(reportSections(ALL).map((s) => s.id)).toEqual([
      "equipment", "sheets", "utilities", "mass", "energy",
      "columns", "exchangers", "economics",
    ]);
  });

  it("each earned section is gated by ITS OWN fact and no other", () => {
    for (const k of Object.keys(ALL) as (keyof ReportFacts)[]) {
      const only = { ...NONE, [k]: true };
      const ids = reportSections(only).map((s) => s.id);
      expect(ids, `fact ${k}`).toContain(k);
      for (const other of Object.keys(ALL) as (keyof ReportFacts)[])
        if (other !== k) expect(ids, `fact ${k} must not earn ${other}`).not.toContain(other);
    }
  });

  it("NO SECTION IS AN APOLOGY: a case that earned nothing lists no earned "
     + "section", () => {
    //  224 of 233 steady tutorials declare no sizing block; the rail must
    //  not list an equipment entry that scrolls to an explanation of its
    //  own absence.
    const ids = reportSections(NONE).map((s) => s.id);
    for (const earned of ["equipment", "sheets", "columns", "exchangers", "economics"])
      expect(ids).not.toContain(earned);
  });

  it("titles are unique, and DOM ids are one function of the id", () => {
    const secs = reportSections(ALL);
    expect(new Set(secs.map((s) => s.title)).size).toBe(secs.length);
    expect(sectionDomId("mass")).toBe("report-mass");
  });
});

describe("designSheetTree: the engine's design/ paths, view name stripped", () => {
  it("keeps sector / unit / item exactly as the engine wrote them", () => {
    //  The shape the 2026-09-04 slice writes on a sectored case and on a
    //  flat one, and a column's five items under one unit.
    const { files, keyOf } = designSheetTree({
      "design/DRYING/SD/sprayDryer": "…",
      "design/CONCENTRATION/Evap1/evaporator": "…",
      "design/Column/shell": "…",
      "design/Column/trays": "…",
      "converged/Feed": "not a sheet",
      "design/": "",
    });
    expect(files).toEqual([
      "CONCENTRATION/Evap1/evaporator", "Column/shell", "Column/trays",
      "DRYING/SD/sprayDryer",
    ]);
    expect(keyOf.get("DRYING/SD/sprayDryer")).toBe("design/DRYING/SD/sprayDryer");
    expect(keyOf.has("Feed")).toBe(false);
  });

  it("no design files at all is an empty tree, not an error", () => {
    expect(designSheetTree(undefined).files).toEqual([]);
    expect(designSheetTree({}).files).toEqual([]);
  });
});

/*  ---- SOURCE ARMS ----------------------------------------------------------
 *  Two things this slice exists to make structural: the rail and the page
 *  read ONE list; and there is ONE tree renderer.  */
describe("one list, one tree", () => {
  const code = (f: string): string =>
    readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("ReportsWorkspace renders and lists from `sections` and nothing else "
     + "decides", () => {
    const s = code("src/ui/ReportsWorkspace.tsx");
    expect(s).toContain("reportSections(");
    //  Both consumers iterate the same array.
    expect((s.match(/sections\.map\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    //  And no section is gated inline any more: the old `econ && (` and
    //  `hxUnits.length > 0 && (` guards are gone from the JSX.
    expect(s).not.toMatch(/\{econ && \(/);
    expect(s).not.toMatch(/\{hxUnits\.length > 0 && \(/);
    expect(s).not.toMatch(/\{columnUnits\.length > 0 && \(/);
  });

  it("there is ONE FileTree, in its own file, and both workspaces import it", () => {
    expect(code("src/ui/FileTree.tsx")).toContain("export function FileTree(");
    for (const f of ["src/ui/CaseWorkspace.tsx", "src/ui/ReportsWorkspace.tsx"]) {
      const s = code(f);
      expect(s, f).toContain('from "./FileTree.js"');
      expect(s, f).not.toContain("function FileTree(");
    }
  });
});
