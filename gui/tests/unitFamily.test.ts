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

describe("NO TWO CLASSES SHARE A DRAWING -- the defect this replaces", () => {
  it("every path is distinct", () => {
    //  The first version of this module grouped 51 types into 11 families,
    //  and Vítor found `mixer` and `quenchSplit` (a splitter) wearing one
    //  bow-tie within the hour.  Two classes are two operations.
    const seen = new Map<string, string>();
    for (const s of SYMBOLS) {
      const norm = s.path.replace(/\s+/g, " ").trim();
      const prior = seen.get(norm);
      expect(prior, `${s.cls} draws exactly what ${prior} draws`)
        .toBeUndefined();
      seen.set(norm, s.cls);
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
    ["cstr", "gibbsReactor"],
    ["pfr", "conversionReactor"],
    ["gibbsReactor", "equilibriumReactor"],
    ["heater", "heatExchanger"],  // Heater and HeatX are different blocks
    ["heatExchanger", "multiStreamHX"],
    ["evaporator", "coolingTower"],
    ["flash", "storageTank"],     // a drum that splits, a tank that holds
    ["flash", "crystalliser"],
    ["distillationColumn", "absorber"],   // trays are not packing
    ["absorber", "stripper"],
    ["distillationColumn", "shortcutColumn"],
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

  it("a SPEC difference is not drawn, but INSULATION is", () => {
    //  isothermal vs adiabatic is one drum and a different specification --
    //  except that the adiabatic one is insulated, and insulation is
    //  hardware.  Both are separate CLASSES in the engine, so both are
    //  drawn; this pins that the difference drawn is the physical one.
    expect(symbolOf("adiabaticFlash")!.cls).toBe("AdiabaticFlash");
    expect(symbolOf("flash")!.cls).toBe("IsothermalFlash");
    expect(symbolOf("adiabaticFlash")!.path)
      .not.toBe(symbolOf("flash")!.path);
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
