/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * The PFD silhouette a unit operation is drawn with.
 *
 * COVERAGE against the engine's 51 registered types is NOT tested here: that
 * is check_unit_families' job, because it reads
 * src/unitOperations/UnitOperation.cpp and a vitest suite that walked C++
 * would be a second home for the same question.  These hold the module's own
 * contract -- that every family is drawable, that an unknown type refuses
 * rather than guesses, and that aliases agree with what they alias.
 */
import { describe, it, expect } from "vitest";
import {
  FAMILIES, familySpec, familyOf, coveredTypes, UNIT_FAMILY,
  type UnitFamily,
} from "../src/case/unitFamily";

describe("every family can actually be drawn", () => {
  it("each has a non-empty path on the 48x48 box and a word", () => {
    for (const f of FAMILIES) {
      expect(f.path.length).toBeGreaterThan(0);
      expect(f.label.length).toBeGreaterThan(0);
      //  An SVG path that does not start with a move is not a path.
      expect(f.path.trimStart().startsWith("M")).toBe(true);
    }
  });

  it("is listed once and resolves", () => {
    const names = FAMILIES.map((f) => f.family);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(familySpec(n).family).toBe(n);
  });

  it("every family a TYPE is assigned to has a spec", () => {
    const drawn = new Set(FAMILIES.map((f) => f.family));
    for (const [type, fam] of Object.entries(UNIT_FAMILY)) {
      expect(drawn.has(fam), `${type} -> ${fam}`).toBe(true);
    }
  });

  it("an unknown family THROWS rather than drawing something", () => {
    expect(() => familySpec("vesselish" as UnitFamily)).toThrow(/no silhouette/);
  });
});

describe("an unknown type gets NO shape, and that is the answer", () => {
  it("returns null so the caller draws the labelled box", () => {
    expect(familyOf("someUnitNobodyWrote")).toBeNull();
    expect(familyOf(undefined)).toBeNull();
    expect(familyOf("")).toBeNull();
  });

  it("never falls back to a family -- a wrong silhouette is a wrong claim", () => {
    //  The whole defect this module replaces was a fallback: 27 of 51 types
    //  drew the generic sliders glyph because `default:` supplied one.
    for (const t of ["", "nope", "distillationColumnX", "Flash"]) {
      const f = familyOf(t);
      expect(f === null || f in Object.fromEntries(
        FAMILIES.map((x) => [x.family, true]))).toBe(true);
    }
    expect(familyOf("Flash")).toBeNull();   // case matters; the engine's word is `flash`
  });
});

describe("aliases agree with what they alias", () => {
  //  The gate reads the registry as a flat list and says so; this is where
  //  the alias structure is actually held.  Each pair constructs the SAME
  //  C++ class (UnitOperation.cpp), so a reader meeting either word must
  //  meet the same picture.
  const ALIASES: [string, string][] = [
    ["column", "distillationColumn"],
    ["FUG", "shortcutColumn"],
    ["extract", "extractor"],
    ["MHeatX", "multiStreamHX"],
    ["REquil", "equilibriumReactor"],
    ["boiler", "phaseChanger"],
    ["condenser", "phaseChanger"],
  ];

  for (const [alias, target] of ALIASES) {
    it(`${alias} draws as ${target}`, () => {
      expect(familyOf(alias)).toBe(familyOf(target));
      expect(familyOf(alias)).not.toBeNull();
    });
  }
});

describe("what is deliberately NOT equipment", () => {
  it("a saturation solve and a work sink are not vessels", () => {
    //  bubbleT and dewT are Newton-1D solves on a saturation condition;
    //  electricLoad is a stream-less shaft-work sink.  Giving them a vessel
    //  would be the wrong picture the 2026-09-07 ruling forbids.
    for (const t of ["bubbleT", "dewT", "electricLoad"]) {
      expect(familyOf(t)).toBe("calculator");
    }
  });

  it("gasSolidSplitter is a junction, not a cyclone", () => {
    //  It is an IDEAL spec'd split whose PSD passes unchanged; a cyclone
    //  silhouette would claim a separation mechanism it does not model.
    expect(familyOf("gasSolidSplitter")).toBe("junction");
    expect(familyOf("cyclone")).toBe("solidsSeparator");
  });
});

describe("the table's own shape", () => {
  it("covers every type exactly once and reports them sorted", () => {
    const t = coveredTypes();
    expect(new Set(t).size).toBe(t.length);
    expect([...t].sort()).toEqual(t);
  });

  it("no family is defined and then used by nothing", () => {
    const used = new Set(Object.values(UNIT_FAMILY));
    for (const f of FAMILIES) {
      expect(used.has(f.family), `${f.family} is drawn but assigned to no type`)
        .toBe(true);
    }
  });
});
