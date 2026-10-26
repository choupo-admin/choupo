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
  Closures by construction (DEV.md 4c C174).  The engine publishes, per unit,
  the terms it computed AS THE REMAINDER of the unit's own balance and whether
  a second route verified them; the GUI draws that word and computes nothing.
  These pins hold the three things that keep it so: the grouping is a filter
  of the engine's records and nothing else, an absence draws nothing, and the
  Streams band reads the module rather than inventing a gap of its own.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ClosureByConstruction } from "../src/adapters/SolverAdapter.js";
import {
  closureLine,
  closureWordOf,
  closureWords,
} from "../src/case/closureByConstruction.js";

//  The shape the engine emits (src/result/ResultEmitter.cpp), two records as
//  column01 (CMO) and column06 (full MESH) publish them, and a membrane's.
const cmo: ClosureByConstruction = {
  unit: "column01", balance: "energy", variable: "Q_reboiler_kW",
  status: "notVerified", rule: "Q_reboiler = dH(streams) - Q_condenser",
  blindTo: "the split between the condenser and the reboiler duties",
  check: "the reboiler's own envelope", checkValue: 1372.4, gap: -93.16,
  tolerance: 1.3e-5, mustAgree: false, units: "kW",
  note: "CMO solves no stage energy balance",
};
const mesh: ClosureByConstruction = {
  ...cmo, unit: "column06", status: "verified", gap: 9e-12,
  mustAgree: true, note: undefined,
};
const membrane: ClosureByConstruction = {
  unit: "NF", balance: "material",
  variable: "water in the retentate and the permeate", status: "verified",
  rule: "c_water = (rho - SUM c_s MW_s) / MW_water",
  blindTo: "a solute lost or created along the channel",
  check: "every solute balanced on its own", gap: 0, tolerance: 1e-9,
  mustAgree: true, units: "relative",
};

describe("closureWords filters the engine's records and invents none", () => {
  it("an absent block draws nothing", () => {
    const w = closureWords(undefined, "energy");
    expect(w.records).toHaveLength(0);
    expect(w.summary).toBe("");
  });

  it("groups by balance and counts the engine's own word", () => {
    const all = [cmo, mesh, membrane];
    const e = closureWords(all, "energy");
    expect(e.records.map((c) => c.unit)).toEqual(["column01", "column06"]);
    expect(e.notVerified.map((c) => c.unit)).toEqual(["column01"]);
    expect(e.summary).toBe(
      "2 closures by construction · 1 NOT verified · 1 verified by a second route");
    const m = closureWords(all, "material");
    expect(m.summary).toBe("1 closure by construction · 1 verified by a second route");
    expect(closureWords(all, "element").summary).toBe("");
  });

  it("never re-judges a record from its gap", () => {
    //  A record the engine called verified stays verified whatever number it
    //  carries: the tolerance is the engine's, and so is the verdict.
    const odd = { ...mesh, gap: 50 };
    expect(closureWords([odd], "energy").notVerified).toHaveLength(0);
    expect(closureWordOf([odd], "column06", "Q_reboiler_kW")).toBe("verified");
    expect(closureWordOf([cmo], "column01", "Q_reboiler_kW")).toBe("notVerified");
    expect(closureWordOf([cmo], "column01", "Q_condenser_kW")).toBeUndefined();
  });

  it("words a record in the engine's own sentences", () => {
    expect(closureLine(cmo)).toContain("NOT verified — CMO solves no stage energy balance");
    expect(closureLine(mesh)).toContain("Verified by a second route: the reboiler's own envelope");
  });
});

describe("the Streams band draws the word and computes no gap", () => {
  const s = readFileSync(new URL("../src/ui/StreamsSummary.tsx", import.meta.url), "utf-8");
  it("reads the module", () => {
    expect(s).toContain('closureWords(result.closuresByConstruction, "energy")');
    expect(s).toContain('closureWords(result.closuresByConstruction, "material")');
    expect(s).toContain('closureWordOf(result.closuresByConstruction, d.unit, "Q_reboiler_kW")');
  });
  it("a not-verified closure by construction withholds the green check", () => {
    expect(s).toMatch(/energyOk = [\s\S]*?ecw\.notVerified\.length === 0;/);
  });
  it("never touches a record's gap or tolerance", () => {
    expect(s).not.toMatch(/\.gap\b/);
    expect(s).not.toMatch(/\.tolerance\b/);
  });
});
