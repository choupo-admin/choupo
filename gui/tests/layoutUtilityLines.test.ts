/*---------------------------------------------------------------------------*\
  Copyright (C) 2026 Vítor Geraldes.  Licence: GPL-3.0-or-later (see AUTHORS).

  UTILITY LINES on the plot plan (DEV.md 4c C268, slice 2).  The engine routes
  and measures them; the GUI draws, tabulates and exports what it published:
    * the scene carries one tube per line, in the colour of its SERVICE family,
      with the engine's length and the service in WORDS in the tooltip (colour
      is one channel of two), and the rack gains the tiers the lines use;
    * the register lists every line with its flow where the engine published
      one and says UNSIZED where it did not size it;
    * the exported page carries the same table;
    * a layout with no utility line draws and lists none (no earlier result
      moves).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import type { LayoutUtilityLine, PlantLayout } from "../src/adapters/SolverAdapter.js";
import { buildLayoutExport } from "../src/case/layoutExport.js";
import { utilityRegister } from "../src/case/layoutTables.js";
import {
  layoutScene, UTILITY_COLOURS, UTILITY_FALLBACK_COLOUR, utilityColour, utilityWord,
} from "../src/case/plantLayout.js";
import { PIPED } from "./plantLayoutFixture.js";

const line = (over: Partial<LayoutUtilityLine>): LayoutUtilityLine => ({
  id: "utility:CW-a-supply", name: "CW-a-supply", service: "coolingWaterSupply",
  family: "coolingWater", fromKind: "item", from: "tower", toKind: "item", to: "cooler",
  lane: 12, tier: 2, length: 42.5, sizeState: "unsized",
  sizeNote: "UNSIZED: the layout sizes no pipe", reason: "the cooler's water",
  route: [[0, 0, 9], [0, 0, 12], [10, 0, 12], [10, 0, 2]],
  ...over,
});

const WITH: PlantLayout = {
  ...PIPED,
  utilityLines: [
    line({ utilityFlow: 47.26, carries: "N2Cooler / coolingWater" }),
    line({ id: "utility:NH3-supply", name: "NH3-supply", service: "refrigerantSupply",
           family: "refrigerant", lane: 13 }),
    line({ id: "utility:Flare-V", name: "Flare-V", service: "flareHeader", family: "flare",
           lane: 14 }),
  ],
};

describe("utility lines in the scene", () => {
  it("one tube per line, in its family's colour, with the service in words", () => {
    const sc = layoutScene(WITH)!;
    expect(sc.utilityLines).toHaveLength(3);
    expect(sc.utilityLines.map((u) => u.colour)).toEqual([
      UTILITY_COLOURS.coolingWater, UTILITY_COLOURS.refrigerant, UTILITY_COLOURS.flare]);
    const tip = sc.utilityLines[0]!.tooltip.join("\n");
    expect(tip).toContain("cooling water, supply");
    expect(tip).toContain("42.5 m");
    expect(tip).toContain("unsized");
    expect(tip).toContain("47.26 kg/s");
    //  the engine's length is carried, never re-measured
    expect(sc.utilityLines[0]!.length).toBe(42.5);
  });

  it("the three families are three distinct colours, and an unknown one is grey", () => {
    const cs = new Set(Object.values(UTILITY_COLOURS));
    expect(cs.size).toBe(3);
    expect(utilityColour("steam")).toBe(UTILITY_FALLBACK_COLOUR);
    expect(utilityWord("coolingWaterReturn")).toBe("cooling water, return");
  });

  it("the rack gains the tiers the lines use", () => {
    const sc = layoutScene(WITH)!;
    const lanes = [...(PIPED.pipes ?? []).map((p) => p.lane), 12, 13, 14];
    const per = PIPED.pipeRack!.lanesPerTier;
    expect(sc.rack!.tiers).toHaveLength(Math.floor(Math.max(...lanes) / per) + 1);
  });

  it("a layout with no utility line has none", () => {
    expect(layoutScene(PIPED)!.utilityLines).toEqual([]);
    expect(utilityRegister(PIPED)).toBeNull();
  });
});

describe("the utility register", () => {
  it("lists every line, flow where published, UNSIZED, and the total length", () => {
    const reg = utilityRegister(WITH)!;
    expect(reg.rows).toHaveLength(3);
    expect(reg.rows[0]!.flow).toBe("47.26");
    expect(reg.rows[1]!.flow).toBe("");
    expect(reg.rows.every((r) => r.size === "unsized")).toBe(true);
    expect(reg.rows[0]!.tier).toBe("3");
    expect(reg.total.length).toBe("127.5");
    expect(reg.families.map((f) => f.word)).toEqual(["cooling water", "refrigerant", "flare header"]);
  });

  it("the exported page carries the same table", () => {
    const { html } = buildLayoutExport({
      source: "case", caseName: "plant/x", layout: WITH, ran: null, version: null,
      date: "2026-11-13T00:00:00.000Z",
      viewer: { script: "/* viewer */", threeVersion: "0.170.0", threeLicence: "MIT" },
    });
    expect(html).toContain("Utility lines: declared by the case");
    expect(html).toContain("CW-a-supply");
    expect(html).toContain("cooling water, supply");
  });
});
