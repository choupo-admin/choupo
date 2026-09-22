/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * The PFD symbol a unit operation is drawn with.
 *
 * AGREEMENT WITH THE ENGINE is NOT tested here: that is
 * check_unit_families' job, because it reads
 * src/unitOperations/UnitOperation.cpp, and a vitest suite that walked C++
 * would be a second home for the same question.  These hold the module's own
 * contract -- that every class is drawn, that NO TWO CLASSES SHARE A
 * DRAWING, that an unknown type refuses rather than guesses, and that the
 * pairs Vítor caught wearing one symbol no longer do.
 */
import { describe, it, expect } from "vitest";
import {
  SYMBOLS, symbolOf, coveredTypes, drawnClasses, UNIT_CLASS,
} from "../src/case/unitFamily";

describe("every symbol can actually be drawn", () => {
  it("each has a path on the 48x48 box and a word", () => {
    for (const s of SYMBOLS) {
      expect(s.path.trimStart().startsWith("M"), s.cls).toBe(true);
      expect(s.label.length, s.cls).toBeGreaterThan(0);
      expect(s.cls.length).toBeGreaterThan(0);
    }
  });

  it("each class is drawn exactly once", () => {
    const names = drawnClasses();
    expect(new Set(names).size).toBe(names.length);
  });

  it("every class a TYPE maps to has a drawing", () => {
    const drawn = new Set(drawnClasses());
    for (const [type, cls] of Object.entries(UNIT_CLASS)) {
      expect(drawn.has(cls), `${type} -> ${cls}`).toBe(true);
    }
  });

  it("no class is drawn and then used by no type", () => {
    const used = new Set(Object.values(UNIT_CLASS));
    for (const s of SYMBOLS) {
      expect(used.has(s.cls), `${s.cls} is drawn but no type constructs it`)
        .toBe(true);
    }
  });
});

describe("SHAPE IS THE EQUIPMENT, TAG IS THE CALCULATION MODEL", () => {
  it("no two classes share BOTH a path and a tag", () => {
    //  Round two put one bow-tie on a mixer and a splitter.  Two classes are
    //  two operations, and a reader must be able to tell them apart by
    //  looking -- by the shape, or, where the hardware genuinely is the same,
    //  by the tag drawn inside it.
    const seen = new Map<string, string>();
    for (const s of SYMBOLS) {
      const key = s.path.replace(/\s+/g, " ").trim() + "\u0000" + (s.tag ?? "");
      const prior = seen.get(key);
      expect(prior, `${s.cls} draws exactly what ${prior} draws`)
        .toBeUndefined();
      seen.set(key, s.cls);
    }
  });

  it("a SHARED shape carries a non-empty tag on every class that shares it", () => {
    //  The load-bearing half.  A shape used by one class needs no tag; a
    //  shape used by two and tagged on neither is the round-two defect back.
    const byPath = new Map<string, typeof SYMBOLS[number][]>();
    for (const s of SYMBOLS) {
      const k = s.path.replace(/\s+/g, " ").trim();
      byPath.set(k, [...(byPath.get(k) ?? []), s]);
    }
    for (const [, group] of byPath) {
      if (group.length < 2) continue;
      for (const s of group) {
        expect(s.tag, `${s.cls} shares its shape and carries no tag`)
          .toBeTruthy();
      }
    }
  });

  it("the four shared shapes are exactly the ones with no hardware difference", () => {
    //  Stated as a list because it is a JUDGEMENT about equipment, and a
    //  judgement belongs somewhere a reviewer can read it.  RStoic, REquil
    //  and RGibbs are one vessel with three specifications; a flash drum is
    //  one drum whether the spec is T or Q=0; a trayed column is one column
    //  whether it is solved by MESH or by FUG; a packed column is one column
    //  whether it absorbs or strips.
    const tagged = SYMBOLS.filter((s) => s.tag).map((s) => s.cls).sort();
    expect(tagged).toEqual([
      "Absorber", "AdiabaticFlash", "CSTR", "ConversionReactor",
      "DistillationColumn", "DynamicCSTR", "EquilibriumReactor",
      "GibbsReactor", "IsothermalFlash", "ShortcutColumn", "Stripper",
    ]);
  });

  it("real hardware is still drawn, never tagged away", () => {
    //  A CSTR has an agitator and a PFR is a tube.  No tag replaces that.
    expect(symbolOf("pfr")!.tag).toBeUndefined();
    expect(symbolOf("cstr")!.path).not.toBe(symbolOf("pfr")!.path);
  });

  it("a TRANSIENT CSTR is the same equipment, tagged", () => {
    //  Same shell, same agitator, same nozzles.  What differs is that the
    //  holdup is an integrated STATE rather than a parameter -- a SOLUTION
    //  MODE, not hardware, so it is tagged and not redrawn.
    expect(symbolOf("dynamicCSTR")!.path).toBe(symbolOf("cstr")!.path);
    expect(symbolOf("cstr")!.tag).toBe("SS");
    expect(symbolOf("dynamicCSTR")!.tag).toBe("d/dt");
  });

  it("a BATCH vessel is NOT the steady one tagged -- its nozzles differ", () => {
    //  Closed to continuous flow, charged from the top and discharged from
    //  the bottom.  That IS hardware, so it is drawn, not tagged.
    expect(symbolOf("batchReactor")!.path).not.toBe(symbolOf("cstr")!.path);
    expect(symbolOf("batchReactor")!.tag).toBeUndefined();
    expect(symbolOf("batchCrystalliser")!.path)
      .not.toBe(symbolOf("crystalliser")!.path);
  });

  it("the three REGISTRIES all reach a symbol", () => {
    //  The defect Vítor found by opening tutorials/unsteady: the engine has
    //  three registries and the table covered one, so every batch and
    //  dynamic case drew the generic glyph.
    for (const t of ["cstr", "dynamicCSTR", "batchReactor"]) {
      expect(symbolOf(t), t).not.toBeNull();
    }
  });

  it("a whole PLANT lumped into one unit is not drawn as a vessel", () => {
    //  WilliamsOttoPlant's own header: "the Williams-Otto plant as ONE
    //  dynamic unit".  A labelled box beats a wrong picture.
    expect(symbolOf("williamsOttoPlant")!.label).toContain("lumped");
    expect(symbolOf("williamsOttoPlant")!.path)
      .not.toBe(symbolOf("cstr")!.path);
  });

  it("every symbol carries at least one NOZZLE", () => {
    //  A PFD symbol carries its connections; without them it is an icon.
    //  Measured structurally: a path with fewer than two subpaths cannot
    //  have both a body and a stub.  The three NON-equipment drawings are
    //  exempt by name -- a bubble-point calculation has no nozzle to draw.
    const NOT_EQUIPMENT = ["BubblePoint", "DewPoint", "ElectricLoad"];
    for (const s of SYMBOLS) {
      if (NOT_EQUIPMENT.includes(s.cls)) continue;
      const subpaths = (s.path.match(/M/g) ?? []).length;
      expect(subpaths, `${s.cls} has ${subpaths} subpath(s)`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  const MUST_DIFFER: [string, string][] = [
    ["mixer", "splitter"],        // the pair Vítor caught
    ["mixer", "valve"],
    ["splitter", "valve"],
    ["pump", "compressor"],       // one trapezoid for three machines
    ["compressor", "turbine"],
    ["pump", "turbine"],
    ["cstr", "pfr"],              // RCSTR and RPlug are not one drawing
    ["cstr", "gibbsReactor"],   // hardware vs specification: a real difference
    ["pfr", "conversionReactor"],
    ["heater", "heatExchanger"],  // Heater and HeatX are different blocks
    ["heatExchanger", "multiStreamHX"],
    ["evaporator", "coolingTower"],
    ["flash", "storageTank"],     // a drum that splits, a tank that holds
    ["flash", "crystalliser"],
    ["distillationColumn", "absorber"],   // trays are not packing
    ["distillationColumn", "extractor"],
    ["cyclone", "bagFilter"],
    ["cyclone", "gasSolidSplitter"],
    ["psa", "tsaTwinBed"],
    ["psa", "ionExchanger"],
    ["sprayDryer", "solidDryer"],
    ["solidDryer", "evaporativeDryer"],
    ["pipe", "pneumaticConveyor"],
    ["spiralWoundModule", "electrodialysisStack"],
    ["bubbleT", "dewT"],
  ];

  for (const [a, b] of MUST_DIFFER) {
    it(`${a} does not look like ${b}`, () => {
      const sa = symbolOf(a), sb = symbolOf(b);
      expect(sa, a).not.toBeNull();
      expect(sb, b).not.toBeNull();
      expect(sa!.path).not.toBe(sb!.path);
      expect(sa!.cls).not.toBe(sb!.cls);
    });
  }
});

describe("two names for ONE object share one drawing", () => {
  //  These pairs construct the SAME C++ class, so they ARE the same unit
  //  operation under two words.  Drawing them apart would claim a
  //  difference the engine does not have.
  const SAME: [string, string][] = [
    ["flash", "isothermalFlash"],
    ["column", "distillationColumn"],
    ["FUG", "shortcutColumn"],
    ["extract", "extractor"],
    ["MHeatX", "multiStreamHX"],
    ["REquil", "equilibriumReactor"],
    ["boiler", "phaseChanger"],
    ["condenser", "phaseChanger"],
    ["membraneSW", "spiralWoundModule"],
  ];

  for (const [a, b] of SAME) {
    it(`${a} draws as ${b}`, () => {
      expect(symbolOf(a)).not.toBeNull();
      expect(symbolOf(a)).toBe(symbolOf(b));
    });
  }

  it("a SPEC difference is TAGGED, never drawn as invented hardware", () => {
    //  Round two gave the adiabatic flash an insulation jacket it has no
    //  reason to have -- inventing hardware for a specification, which is
    //  the very thing this module says it does not do.  One drum, two tags.
    expect(symbolOf("flash")!.path).toBe(symbolOf("adiabaticFlash")!.path);
    expect(symbolOf("flash")!.tag).toBe("T");
    expect(symbolOf("adiabaticFlash")!.tag).toBe("Q=0");
  });
});

describe("an unknown type gets NO shape, and that is the answer", () => {
  it("returns null so the caller draws the labelled box", () => {
    expect(symbolOf("someUnitNobodyWrote")).toBeNull();
    expect(symbolOf(undefined)).toBeNull();
    expect(symbolOf("")).toBeNull();
  });

  it("case matters -- the engine's word is `flash`, not `Flash`", () => {
    expect(symbolOf("Flash")).toBeNull();
  });
});

describe("what is deliberately NOT equipment", () => {
  it("a saturation solve and a work sink are not vessels", () => {
    expect(symbolOf("bubbleT")!.cls).toBe("BubblePoint");
    expect(symbolOf("dewT")!.cls).toBe("DewPoint");
    expect(symbolOf("electricLoad")!.cls).toBe("ElectricLoad");
    for (const t of ["bubbleT", "dewT", "electricLoad"]) {
      expect(symbolOf(t)!.label).toContain("not equipment");
    }
  });
});

describe("the table's own shape", () => {
  it("covers every type once and reports them sorted", () => {
    const t = coveredTypes();
    expect(new Set(t).size).toBe(t.length);
    expect([...t].sort()).toEqual(t);
  });
});
