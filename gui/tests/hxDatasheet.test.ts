/*---------------------------------------------------------------------------*\
  The Kern-designed exchanger datasheet (2026-10-07, DEV.md 4c C51).

  Vítor, on the green-ammonia FEHE pop-out: "O design continua uma merda!"
  The datasheet drew its schematic and its tables from the UNIT's KPIs and
  `geometry {}`, which a design on the SIZER's sheet does not fill -- so a
  944-tube, four-shell design read "tube count not declared" and "0 baffles",
  and the five `phaseChanger` coolers were never offered a datasheet at all.

  THESE TESTS RUN ON THE ENGINE'S REAL SHEETS, generated from this tree's
  binary by the witness setup (`witnessOutputs.ts`), never on a transcription:
  the point is that the page draws what the run wrote.  Expected strings are
  formed from the parsed sheet, not typed, so a moved design number moves
  the expectation with it -- what is held is that the page SHOWS the design,
  not which design it is.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { parseDesignSheet } from "../src/case/designSheet.js";
import {
  basisClauses, findKernDesign, fmt, inUnit, kernDesignOf, kernView,
} from "../src/case/hxDatasheet.js";
import { datasheetOdsRows, heatExchangerDatasheetHtml }
  from "../src/ui/HeatExchangerDatasheet.js";
import type { UnitSpec } from "../src/case/types.js";
import { witnessOutput } from "./witnessRead.js";

const CASE = "tutorials/plant/greenAmmoniaIndustrialN2";
const sheetText = (unit: string) => witnessOutput(CASE, `design/${unit}/shellTubeHX`);
const files = (unit: string) => ({ [`design/${unit}/shellTubeHX`]: sheetText(unit) });

const FEHE: UnitSpec = {
  name: "FEHE", type: "heatExchanger",
  inputs: ["HotEffluent", "Mixed"], outputs: ["CooledEffluent", "PreheatedFeed"],
  operation: { area: "2000 m2", U: "550 W/m2/K" },
} as unknown as UnitSpec;
const COOLER = (name: string): UnitSpec => ({
  name, type: "phaseChanger", inputs: ["in"], outputs: ["out"], operation: {},
} as unknown as UnitSpec);

describe("the engine's Kern sheet is READABLE and carries its design", () => {
  it("parses whole -- the GUI unit table knows m2.K/W and W/m/K", () => {
    //  C48 added both words to src/core/Units.cpp and not to the GUI's
    //  mirror, so the whole sheet was refused and the datasheet said the
    //  run wrote a sheet "this reader could not parse".
    for (const u of ["FEHE", "WaterCooler", "Chiller"]) {
      const s = parseDesignSheet(sheetText(u));
      expect(s, u).not.toBeNull();
      expect(s!.sizing.find((v) => v.key === "R_foul_tube")?.unit).toBe("m2.K/W");
      expect(s!.sizing.find((v) => v.key === "wallK")?.unit).toBe("W/m/K");
    }
  });

  it("reads the engine's `exchanger {}` block: who is in the tubes, and who chose each key", () => {
    const d = findKernDesign(files("FEHE"), "FEHE")!;
    expect(d).not.toBeNull();
    expect(d.x.tube.role).toBe("hot");
    expect(d.x.tube.inlet).toBe("HotEffluent");
    expect(d.x.shell.role).toBe("cold");
    expect(d.x.declared).toContain("tubeOD");
    expect(d.x.declared).toContain("shellsInSeries");
    expect(d.x.fromUnit).toEqual(["A_rated", "U_rated"]);
    expect(d.x.fromRecord).toContain("wallK");
    const v = kernView(d);
    expect(v.who("nTubes")).toBe("choupo");
    expect(v.who("tubeOD")).toBe("declared");
    expect(v.who("A_rated")).toBe("unit");
    expect(v.who("wallK")).toBe("record");
  });

  it("an area-only sheet is NOT a design, and keeps the old page", () => {
    const areaOnly = sheetText("FEHE").replace(/\nexchanger\n\{[\s\S]*?\n\}\n/, "\n");
    expect(areaOnly).not.toContain("tubePattern");          // the edit landed
    expect(kernDesignOf(parseDesignSheet(areaOnly))).toBeNull();
  });
});

describe("the datasheet DRAWS the design the sheet carries", () => {
  it("FEHE: bundle, four shells, shell ID, U, rated beside designed", () => {
    const s = parseDesignSheet(sheetText("FEHE"))!;
    const val = (k: string) => s.sizing.find((x) => x.key === k)!.value;
    const html = heatExchangerDatasheetHtml(FEHE, { U: 550, area: 2000 }, [], files("FEHE"))!;
    expect(html).toContain("SPECIFICATION SHEET");
    expect(html).toContain(`${val("nTubes")} tubes = ${val("tubesPerPass")} per pass`);
    expect(html).toContain(`${val("shellsInSeries")} identical shells in counter-current series`);
    expect(html).toContain(`${fmt(val("shellID") * 1000, 0)} mm`);    // m on the sheet -> mm
    expect(html).toContain(`${fmt(val("U"), 1)} W/(m²·K)`);
    expect(html).toContain(`${fmt(val("A_rated"), 1)} m²`);
    expect(html).toContain("from the unit");
    expect(html).toContain("HotEffluent");
    expect(html).toContain("Gnielinski");
    //  every validity warning on the sheet is shown
    const warnings = basisClauses(s.basis).filter((c) => c.warning);
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) expect(html).toContain(w.text.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    //  and the old page's blanks are gone
    expect(html).not.toContain("tube count not declared");
    expect(html).not.toContain("0 baffles");
    expect(html).not.toContain("RATING RESULT");
  });

  it("WaterCooler: a phaseChanger with no U still gets its sheet, and the condensing basis is shown", () => {
    const html = heatExchangerDatasheetHtml(COOLER("WaterCooler"), {}, [], files("WaterCooler"));
    expect(html).not.toBeNull();
    expect(html!).toContain("Condensing duty");
    expect(html!).toContain("OVER-SIZES");
    expect(html!).toContain("coolingWater supply");
    expect(html!).toContain("from a record");          // the utility's supply/return
    //  without a sheet, a unit with no U still gets nothing -- the old rule
    expect(heatExchangerDatasheetHtml(COOLER("WaterCooler"), {}, [], undefined)).toBeNull();
  });

  it("Chiller: a DECLARED utility film is said, and no pressure drop is invented for it", () => {
    const html = heatExchangerDatasheetHtml(COOLER("Chiller"), {}, [], files("Chiller"))!;
    expect(html).toContain("boils on the shell side");
    expect(html).toContain("declared coefficient (author-set)");
    expect(html).toContain("not computed — a declared film has no flow model");
    expect(html).toContain("Partial condenser against refrigerationNH3");
  });

  it("the .ods carries the same provenance words the page prints", () => {
    const d = findKernDesign(files("FEHE"), "FEHE");
    const rows = datasheetOdsRows({}, d!.sheet, d);
    const src = (k: string) => rows.find((r) => r[0] === k)?.[3];
    expect(src("nTubes")).toBe("sized by Choupo (design/)");
    expect(src("tubeOD")).toBe("declared (design/)");
    expect(src("A_rated")).toBe("from the unit (design/)");
    expect(src("wallK")).toBe("from a record (design/)");
  });
});

describe("helpers", () => {
  it("converts only within one family the unit table knows", () => {
    expect(inUnit({ key: "x", value: 0.0254, unit: "m" }, "mm")).toBeCloseTo(25.4, 10);
    expect(inUnit({ key: "x", value: 12, unit: "kPa" }, "bar")).toBeCloseTo(0.12, 12);
    expect(inUnit({ key: "x", value: 5, unit: "kW" }, "mm")).toBeUndefined();
    expect(inUnit({ key: "x", value: 5, unit: "furlong" }, "m")).toBeUndefined();
  });

  it("splits the basis at the engine's clause separator, never inside a parenthesis", () => {
    const c = basisClauses("A (x; y) B; WARNING: z; C");
    expect(c.map((k) => k.text)).toEqual(["A (x; y) B", "z", "C"]);
    expect(c.map((k) => k.warning)).toEqual([false, true, false]);
  });
});
