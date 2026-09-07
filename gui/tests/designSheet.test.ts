/*---------------------------------------------------------------------------*\
  The GUI reads back the specification sheet the RUN wrote (2026-09-07).

  `SizingPass` publishes `design/<SECTOR>/<unit>/<equipmentTag>` and the
  printable heat-exchanger datasheet used to ignore it, rebuilding its design
  numbers from the rating unit's KPIs and the case's authored geometry.  Two
  sheets for one exchanger, on two input paths -- and on
  `ammonia02_full_plant` today they disagree: the run's own JSON gives FEHE
  `area 1500 m2` / `LMTD 145.856 K` while the sheet it wrote gives
  `A 1458.563 m2` / `LMTD 150 K`, and waterCooler `area 4000 m2` against
  `A 1359.309 m2`.  The sheet's number is the one the COST was computed from.

  THE FIXTURES BELOW ARE TRANSCRIPTIONS of sheets the engine really writes --
  `tutorials/steady/flowsheets/process02_with_design/design/heater/shellTubeHX`
  and `.../ChemicalPlantTutorial/design/FERMENTATION/Fermentor/stirredTank` --
  because `design/` is a run output and gitignored (`check_design_sheet` arm
  (g) enforces that in both directions), so no committed file can be read here.
  A transcription drifts from its original in silence, so `check_design_sheet`
  arm (k) RUNS both witnesses and holds these fixtures to what they wrote.
  That is the `check_estimate_visible` precedent, for the same reason.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { findDesignSheet, lookupDesignSheet, parseDesignSheet }
  from "../src/case/designSheet.js";
import { datasheetOdsRows, heatExchangerDatasheetHtml }
  from "../src/ui/HeatExchangerDatasheet.js";
import type { UnitSpec } from "../src/case/types.js";

//  FLAT: no sector level, bare unit name.
const FLAT_HX = `/*--------------------------------*- Choupo -*-------------------------------*\\
  EQUIPMENT SPECIFICATION SHEET -- WRITTEN BY THE RUN.
\\*---------------------------------------------------------------------------*/

recordType  designSheet;

unit        "heater";
equipment   shellTubeHX;
material    SS304;
basis       "A = Q/(U*LMTD) with U and LMTD author-set";

inlets
{
    port0
    {
        global      "reactorOut";
        bc          interior;
        T           350 K;
        P           101325 Pa;
        F           0.00027777778 kmol/s;
        mdot        0.014739028 kg/s;
        vapourFraction 0;
    }
}

outlets
{
    port0
    {
        global      "hotStream";
        bc          interior;
        T           361.87991 K;
        P           101325 Pa;
        F           0.00027777778 kmol/s;
        mdot        0.014739028 kg/s;
        vapourFraction 0.0002220006;
    }
}

sizing
{
    A                     0.066666667 m2;
    LMTD                  10 K;
    Q_kW                  0.4 kW;
    U                     600 W/m2/K;
    pressureDesign        2 bar;
    weight                2.0382166 kg;
}
`;

//  FRACTAL: a STAMPED sector and a qualified unit name, plus the bracket
//  dimension form `[0 0 0 0 0]` a dimensionless value is written in.
//
//  ITS PORT BLOCKS WERE MISSING UNTIL 2026-09-07.  They were left out when
//  nothing read a port back, and `check_design_sheet` arm (l) said so in its
//  own words.  The column schematic reads them -- it colours each nozzle by
//  the temperature the run wrote -- so the arm holds them now and the
//  transcription had to become a full one.
const SECTORED_TANK = `recordType  designSheet;

unit        "FERMENTATION.Fermentor";
sector      FERMENTATION;
equipment   stirredTank;
material    SS316;
basis       "V_R = declared operation.V_R (pass-through); D and H from L_over_D; t_wall ASME thin-wall";

inlets
{
    port0
    {
        global      "FERMENTATION.Mixed";
        bc          interior;
        T           314.9494 K;
        P           100000 Pa;
        F           0.074074826 kmol/s;
        mdot        1.9682212 kg/s;
        vapourFraction 0;
    }
}

outlets
{
    port0
    {
        global      "FERMENTATION.Out";
        bc          interior;
        T           310 K;
        P           100000 Pa;
        F           0.079011624 kmol/s;
        mdot        1.9682245 kg/s;
        vapourFraction 0;
    }
}

sizing
{
    D                     1.3655681 m;
    H                     3.4139203 m;
    L_over_D              [0 0 0 0 0] 2.5;
    V_R                   5 m3;
    pressureDesign        2 bar;
    t_wall                0.0039904033 m;
    weight                467.54499 kg;
}
`;

//  SYNTHETIC, and said so: neither witness the gate runs produces an `assumed`
//  list, so this one line is copied from
//  `ammonia02_full_plant/design/separator/vessel` and is NOT gate-held.  It
//  exercises the list form only, never the writer's grammar around it.
const WITH_ASSUMED = SECTORED_TANK + `\nassumed          ( corrosionAllow jointEfficiency );\n`;

describe("parseDesignSheet: the engine's sheet, read with the real dict parser", () => {
  it("reads the header, and every sizing value with the unit the SIZER declared", () => {
    const s = parseDesignSheet(FLAT_HX)!;
    expect(s).not.toBeNull();
    expect(s.unit).toBe("heater");
    expect(s.sector).toBe("");            // flat stays flat: empty is not "root"
    expect(s.equipment).toBe("shellTubeHX");
    expect(s.material).toBe("SS304");
    expect(s.basis).toBe("A = Q/(U*LMTD) with U and LMTD author-set");
    expect(s.assumed).toEqual([]);
    const by = Object.fromEntries(s.sizing.map((v) => [v.key, v]));
    expect(by["A"]).toEqual({ key: "A", value: 0.066666667, unit: "m2" });
    expect(by["U"]).toEqual({ key: "U", value: 600, unit: "W/m2/K" });
    expect(by["pressureDesign"]!.unit).toBe("bar");     // NOT canonical SI
    expect(by["Q_kW"]!.unit).toBe("kW");                //   -- which is why
    expect(by["LMTD"]!.unit).toBe("K");                 //   each is written down
  });

  it("reads the stamped sector and the bracket form of a dimensionless value", () => {
    const s = parseDesignSheet(SECTORED_TANK)!;
    expect(s.sector).toBe("FERMENTATION");
    expect(s.unit).toBe("FERMENTATION.Fermentor");
    const by = Object.fromEntries(s.sizing.map((v) => [v.key, v]));
    //  `[0 0 0 0 0] 2.5` is the grammar's dimension form, written ON PURPOSE
    //  so a declared ratio cannot be confused with a forgotten unit.
    expect(by["L_over_D"]).toEqual({ key: "L_over_D", value: 2.5, unit: "-" });
    expect(by["V_R"]).toEqual({ key: "V_R", value: 5, unit: "m3" });
  });

  it("reads the assumed list -- the keys, not a second copy of their values", () => {
    expect(parseDesignSheet(WITH_ASSUMED)!.assumed)
      .toEqual(["corrosionAllow", "jointEfficiency"]);
  });

  it("refuses anything that does not identify ITSELF as a design sheet", () => {
    expect(parseDesignSheet("recordType  internalState;\nunit \"heater\";\n")).toBeNull();
    expect(parseDesignSheet("unit \"heater\";\nequipment shellTubeHX;\n")).toBeNull();
    expect(parseDesignSheet("{{{ not a dict")).toBeNull();
  });
});

//  A UNIT THAT REALISES SEVERAL ITEMS (2026-09-07).  A distillation column is a
//  shell, a tray stack, a condenser, a reboiler and a reflux drum -- so TWO of
//  its sheets are `shellTubeHX` and (unit, equipment) stops identifying one.
//  Trimmed to the header, which is all these two tests read.
const COLUMN_CONDENSER = `recordType  designSheet;

unit        "column09";
equipment   shellTubeHX;
item        condenser;
material    carbonSteel;
basis       "A = Q/(U*LMTD) with U and LMTD author-set";

sizing
{
    A                     53.376812 m2;
}
`;

const COLUMN_REBOILER = COLUMN_CONDENSER
  .replace("item        condenser;", "item        reboiler;")
  .replace("53.376812", "94.066529");

describe("a unit that realises several items", () => {
  it("reads the `item` word off the sheet", () => {
    expect(parseDesignSheet(COLUMN_CONDENSER)!.item).toBe("condenser");
    //  EMPTY, not undefined, where the unit realises ONE item -- the absence
    //  is the positive statement, and every sheet written before 2026-09-07
    //  is that case.
    expect(parseDesignSheet(FLAT_HX)!.item).toBe("");
  });

  it("REFUSES when (unit, equipment) matches two sheets", () => {
    const files = {
      "design/column09/condenser": COLUMN_CONDENSER,
      "design/column09/reboiler": COLUMN_REBOILER,
    };
    const got = lookupDesignSheet(files, "column09", "shellTubeHX");
    //  Not the first match: drawing the reboiler on a page headed "condenser"
    //  is wrong in a way nothing on that page could reveal.
    expect(got.sheet).toBeNull();
    expect(got.ambiguous).toBe(2);
    expect(got.unreadable).toBe(0);
  });

  it("resolves once the item is named", () => {
    const files = {
      "design/column09/condenser": COLUMN_CONDENSER,
      "design/column09/reboiler": COLUMN_REBOILER,
    };
    expect(findDesignSheet(files, "column09", "shellTubeHX", "reboiler")!
      .sizing.find((v) => v.key === "A")!.value).toBeCloseTo(94.066529, 6);
    expect(lookupDesignSheet(files, "column09", "shellTubeHX", "condenser")
      .ambiguous).toBe(0);
  });
});

describe("findDesignSheet: identity is (sector, name), never a name split", () => {
  const files = {
    "design/heater/shellTubeHX": FLAT_HX,
    "design/FERMENTATION/Fermentor/stirredTank": SECTORED_TANK,
  };
  it("matches a flat unit by its own name", () => {
    expect(findDesignSheet(files, "heater", "shellTubeHX")!.unit).toBe("heater");
  });
  it("matches a sectored unit by REBUILDING the qualified name from the stamp", () => {
    //  The GUI holds the LOCAL name; the engine names it qualified.  The sheet
    //  states both, so the qualified form is rebuilt from the stamped sector
    //  and compared -- splitting `unit` on its last dot would be right today
    //  and wrong for the first unit whose name carries a dot for another reason.
    expect(findDesignSheet(files, "Fermentor", "stirredTank")!.sector)
      .toBe("FERMENTATION");
  });
  it("never matches on the PATH, which restates what the record already says", () => {
    //  Same content, filed under a directory naming a different unit: the
    //  record wins, because a reader that agreed with the filing instead of
    //  the answer would be checking the writer's bookkeeping.
    expect(findDesignSheet({ "design/SOMEWHERE/else/stirredTank": SECTORED_TANK },
      "Fermentor", "stirredTank")!.unit).toBe("FERMENTATION.Fermentor");
    expect(findDesignSheet({ "design/Fermentor/shellTubeHX": SECTORED_TANK },
      "Fermentor", "shellTubeHX")).toBeNull();   // equipment word decides
  });
  it("returns null for a unit with no sheet, and for no design tree at all", () => {
    expect(findDesignSheet(files, "reactor", "shellTubeHX")).toBeNull();
    expect(findDesignSheet(undefined, "heater", "shellTubeHX")).toBeNull();
  });
  it("counts a sheet it could NOT read apart from one that is not there", () => {
    //  Three states, never two.  An unreadable sheet is a run that DID size
    //  the unit; calling it an absence is the comfortable reading of a broken
    //  file.  This is the shape the engine really produced until 2026-09-07:
    //  `U 600 W/(m2.K);` -- `(` is not a word character, so the tokenizer
    //  hands the parser `W/` and the WHOLE file is refused, by the GUI parser
    //  and by Choupo's own `Dictionary` alike.
    const broken = FLAT_HX.replace("600 W/m2/K;", "600 W/(m2.K);");
    expect(broken).toContain("W/(m2.K)");        // the sabotage really landed
    const r = lookupDesignSheet({ "design/heater/shellTubeHX": broken },
      "heater", "shellTubeHX");
    expect(r.sheet).toBeNull();
    expect(r.unreadable).toBe(1);
    expect(lookupDesignSheet(files, "reactor", "shellTubeHX").unreadable).toBe(0);
  });
});

const HX_UNIT: UnitSpec = {
  name: "heater", type: "heatExchanger",
  inputs: ["cold", "hot"], outputs: ["coldOut", "hotOut"],
  operation: { geometry: { tubeOD: "0.02 m", tubeID: "0.016 m", tubeLength: "4.88 m",
                           tubePitch: "0.025 m", shellID: "0.6 m",
                           baffleSpacing: "0.3 m", passes: 2, nTubes: 146 } },
} as unknown as UnitSpec;

//  A RATING that deliberately disagrees with the sheet, in the shape the
//  corpus really produces: the author declares a DESIGN LMTD in `postDict`
//  that is not the LMTD the rating computed, so the two areas differ.
const RATING: { [k: string]: number } = {
  U: 600, area: 0.1, LMTD: 8.5, Q_kW: 0.4,
  h_inner: 1200, h_outer: 900, Re_tube: 15000, Nu_tube: 90,
  dP_tube_kPa: 12, dP_shell_kPa: 7, nBaffles: 15,
};

describe("the printable datasheet draws design/ and never recomputes it", () => {
  it("prints the SHEET's numbers under a section that says Choupo sized them", () => {
    const html = heatExchangerDatasheetHtml(HX_UNIT, RATING, [],
      { "design/heater/shellTubeHX": FLAT_HX })!;
    expect(html).toContain("SIZED BY CHOUPO");
    expect(html).toContain("A = Q/(U*LMTD) with U and LMTD author-set");  // the basis
    expect(html).toContain("SS304");                                      // the material
    expect(html).toContain("0.0666667 m2");                               // the sheet's A
    expect(html).toContain("2 bar");                                      // its own unit
    //  and the RATING's own answers stay, under their own heading -- a
    //  different question, never presented as the design.
    expect(html).toContain("RATING RESULT");
    expect(html).toContain("8.5 K");     // the rated LMTD, not the sheet's 10 K
    expect(html).toContain("0.10 m²");   // the rated area, not the sheet's A
    //  the authored geometry is labelled as the CASE's input, not as an output
    expect(html).toContain("DECLARED BY THE CASE");
  });

  it("with NO design tree it says the sizing pass did not run, and computes nothing", () => {
    const html = heatExchangerDatasheetHtml(HX_UNIT, RATING, [], undefined)!;
    expect(html).toContain("The sizing pass did not run for this unit");
    expect(html).toContain("system/postDict");      // the remedy names the file
    expect(html).toContain("shellTubeHX");          //   and the type to declare
    //  NOTHING is substituted: no basis, no material, no sized area.
    expect(html).not.toContain("A = Q/(U*LMTD)");
    expect(html).not.toContain("0.0666667");
    //  and the rating half is untouched -- absence of a design is not absence
    //  of a run (the same argument that gave designFiles its own channel).
    expect(html).toContain("RATING RESULT");
    expect(html).toContain("8.5 K");
  });

  it("labels a tube count nobody declared as back-figured, and never as a design", () => {
    const noTubes = { ...HX_UNIT,
      operation: { geometry: { tubeOD: "0.02 m", tubeID: "0.016 m",
                               tubeLength: "4.88 m", passes: 2 } } } as unknown as UnitSpec;
    const html = heatExchangerDatasheetHtml(noTubes, RATING, [], undefined)!;
    expect(html).toContain("back-figured from the rated area");
    //  the declaring case gets no such caveat
    expect(heatExchangerDatasheetHtml(HX_UNIT, RATING, [], undefined)!)
      .not.toContain("back-figured");
  });

  it("still returns null without a rating -- this page draws a rated exchanger", () => {
    expect(heatExchangerDatasheetHtml(HX_UNIT, {}, [], undefined)).toBeNull();
    expect(heatExchangerDatasheetHtml(HX_UNIT, undefined, [], undefined)).toBeNull();
  });
});

describe("the .ods carries the same partition the page draws", () => {
  it("marks every row with where its number came from", () => {
    const rows = datasheetOdsRows(RATING, parseDesignSheet(FLAT_HX));
    const sized = rows.filter((r) => r[3] === "sized by Choupo (design/)");
    const rated = rows.filter((r) => r[3] === "rating result (run KPI)");
    expect(sized.map((r) => r[0])).toContain("A");
    expect(rated.map((r) => r[0])).toContain("area");
    //  A and area are the SAME question answered twice; a spreadsheet that
    //  dropped the source column would be the one surface where they look alike.
    expect(sized.find((r) => r[0] === "A")![1]).toBe(0.066666667);
    expect(rated.find((r) => r[0] === "area")![1]).toBe(0.1);
    expect(rows.length).toBe(sized.length + rated.length);
  });
  it("exports only the rating rows when the sizing pass did not run", () => {
    const rows = datasheetOdsRows(RATING, null);
    expect(rows.every((r) => r[3] === "rating result (run KPI)")).toBe(true);
  });
});
