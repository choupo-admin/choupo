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
  The main temperature page after the 2026-08-29 rearchitecture: ONE page,
  ONE mental model -- a temperature reading is the end of a measurement
  chain.  These tests pin the ARCHITECTURE the owner ruled, so a future edit
  that quietly reintroduces the old everything-at-once page fails by name:
  the spine (state to reported value), the three-way distinction (T, K, T90),
  the instrument table (want / observe / bridge), the interrogation, and the
  ABSENCES -- no ladder, no Chang, no Newton-iteration analogy.  The moved
  material has pages and tests of its own (thermometerTrustTool,
  propertyTrustTool).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { readFileSync } from "node:fs";

import {
  C2_UM_K, CHAIN, INSTRUMENTS, INTERROGATION,
  T_HOT_C, T_HOT_K, T_SILVER_K, T_SUBJECT_K,
  emissivityBand_K, emissivitySensitivity,
} from "../src/ui/methods/WhatIsTemperatureTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/WhatIsTemperatureTool.tsx", import.meta.url),
  "utf-8");

/** The source with every run of whitespace collapsed, so a prose assertion is
 *  not really an assertion about where the formatter put the line breaks. */
const prose = (src: string): string => src.replace(/\s+/g, " ");

describe("the registry entry", () => {
  it("is live, is of the notes kind, and teaches the chain", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "what-is-temperature");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.teaches).toContain("MEASUREMENT CHAIN");
  });
});

describe("the spine: one chain, in order", () => {
  it("runs from the physical state to a reported value with uncertainty", () => {
    expect(CHAIN[0]).toBe("PHYSICAL STATE");
    expect(CHAIN.at(-1)).toContain("uncertainty");
    expect(CHAIN).toHaveLength(8);
  });

  it("puts T second and the model just before the number", () => {
    //  The ORDER is the lesson: everything between T and the reported value
    //  is machinery, and the model/calibration sits immediately behind the
    //  displayed number -- which is why the number is not the thing.
    expect(CHAIN[1]).toContain("thermodynamic temperature");
    expect(CHAIN.at(-3)).toContain("model");
  });
});

describe("the instrument table: want / observe / bridge", () => {
  it("carries the three plant instruments", () => {
    expect(INSTRUMENTS.map((i) => i.name))
      .toEqual(["Pt100", "thermocouple", "pyrometer"]);
  });

  it("every instrument WANTS temperature and OBSERVES something else", () => {
    //  The page's central claim, held as data: no instrument observes the
    //  measurand.  An entry whose observable said "temperature" would be the
    //  page contradicting its own thesis.
    for (const i of INSTRUMENTS) {
      expect(i.want).toBe("temperature");
      expect(i.observe).not.toContain("temperature");
      expect(i.bridge.length, `${i.name} has no bridge`).toBeGreaterThan(20);
    }
  });

  it("names the three bridges the instruments actually use", () => {
    const all = INSTRUMENTS.map((i) => i.bridge).join(" ");
    expect(all).toContain("R(T) calibration");
    expect(all).toContain("Seebeck");
    expect(all).toContain("Planck");
  });
});

describe("the interrogation the page installs", () => {
  it("asks the seven questions, ending on the doubted assumption", () => {
    expect(INTERROGATION).toHaveLength(7);
    expect(INTERROGATION[0]).toContain("What exactly was measured");
    expect(INTERROGATION.at(-1)).toContain("doubt first");
    const all = INTERROGATION.join(" ").toLowerCase();
    for (const k of ["instrument", "scale", "calibration", "model",
      "uncertainty"]) {
      expect(all, `the interrogation lost "${k}"`).toContain(k);
    }
  });
});

describe("the pedagogical order the owner ruled", () => {
  it("thermal equilibrium comes before the entropy derivative", () => {
    //  Starting from (dS/dU) explains a hard thing through a harder one.
    //  The intuition (two systems touch) must land first, the formal
    //  definition boxed after it.
    const iTouch = SRC.indexOf("Two systems touch");
    const iDef = SRC.indexOf("(∂S / ∂U)");
    expect(iTouch, "the equilibrium intuition is missing").toBeGreaterThan(0);
    expect(iDef, "the thermodynamic definition is missing").toBeGreaterThan(0);
    expect(iTouch).toBeLessThan(iDef);
  });

  it("defines the quantity before the unit", () => {
    const iDef = SRC.indexOf("(∂S / ∂U)");
    const iK = SRC.indexOf("1.380649");
    expect(iDef).toBeLessThan(iK);
  });

  it("boxes the formal definition and labels it as such", () => {
    expect(prose(SRC)).toContain("thermodynamic definition");
  });

  it("keeps the three names apart, visually and by name", () => {
    //  QUANTITY vs UNIT vs PRACTICAL SCALE is the page's sharpest
    //  distinction, ruled to be central and visual.
    for (const k of ["quantity", "unit", "practical scale"]) {
      expect(prose(SRC).toLowerCase()).toContain(k);
    }
    expect(SRC).toContain("T₉₀");
  });

  it("never calls a temperature a conversion factor", () => {
    expect(SRC).not.toContain("conversion factor between energy and degrees");
  });

  it("ends on the mental model, in its own words", () => {
    expect(prose(SRC)).toContain(
      "A temperature reading is the end of a measurement chain");
    expect(prose(SRC)).toContain("Never confuse the number with the thing");
  });

  it("says decimal places are not uncertainty, with the serious form shown", () => {
    expect(prose(SRC)).toContain("Decimal places are not uncertainty");
    expect(prose(SRC)).toContain("U = 0.015 K (k = 2)");
  });
});

describe("what the page deliberately no longer carries", () => {
  it("no boiling-point ladder, no Chang, no ITS-90 fixed-point table", () => {
    //  Moved, not lost: the ladder teaches property-data trust
    //  (propertyTrustTool) and Chang belongs to the deep dive
    //  (thermometerTrustTool).  Reappearing here means the page is growing
    //  back into the three-essays shape the ruling dismantled.
    expect(SRC).not.toContain("rung_glycerol");
    //  The "where to go deeper" pointer may NAME Chang's book; what must not
    //  return is the material itself.
    expect(SRC).not.toContain("nomic measurement");
    expect(SRC).not.toContain("coherentist");
    expect(SRC).not.toContain("Preston-Thomas");
  });

  it("no Newton-iteration analogy, anywhere, ever", () => {
    //  Deleted by ruling: a numerical initial guess and Chang's epistemic
    //  iteration are not the same thing, and an elegant analogy that can
    //  install a wrong association is worse than none.
    expect(SRC).not.toContain("Newton iteration");
    expect(SRC).not.toContain("epistemic iteration");
  });

  it("points the reader at both split-out pages", () => {
    expect(prose(SRC)).toContain("How do we know a thermometer is right?");
    expect(prose(SRC)).toContain("When a property database lies to you");
  });
});

describe("the worked example: what an assumed emissivity costs", () => {
  it("puts the subject reading above the silver point", () => {
    //  The example turns on this: 1608.1 degC is past where any contact
    //  instrument goes, so the bridge is Planck plus an assumed emissivity.
    expect(T_HOT_K).toBeGreaterThan(T_SILVER_K);
    expect(T_HOT_K).toBeCloseTo(T_HOT_C + 273.15, 9);
  });

  it("carries the second radiation constant, not a rounded memory of it", () => {
    expect(C2_UM_K).toBeCloseTo(14387.769, 0);
  });

  it("computes the sensitivity from Wien, recomputed here independently", () => {
    expect(emissivitySensitivity(0.65, T_HOT_K))
      .toBeCloseTo((0.65 * 1881.25) / 14388, 9);
    expect(emissivitySensitivity(0.65, T_HOT_K)).toBeCloseTo(0.085, 3);
  });

  it("grows with wavelength and with temperature, which is the lesson", () => {
    const short = emissivitySensitivity(0.65, T_HOT_K);
    expect(emissivitySensitivity(5.0, T_HOT_K)).toBeGreaterThan(short);
    expect(emissivitySensitivity(0.65, 2 * T_HOT_K)).toBeGreaterThan(short);
  });

  it("turns a 10 % emissivity error into the band the page prints", () => {
    const band = emissivityBand_K(0.65, T_HOT_K, 0.10);
    expect(band).toBeCloseTo(16, 0);
    expect(band).toBeCloseTo(
      emissivitySensitivity(0.65, T_HOT_K) * 0.10 * T_HOT_K, 9);
    expect(emissivityBand_K(0.65, T_HOT_K, 0)).toBe(0);
  });

  it("states the band as conditional on its own assumptions", () => {
    expect(prose(SRC)).toContain("worked example, not a verdict");
    expect(prose(SRC)).toContain("not an engine run");
  });
});

describe("claims kept inside what the evidence supports", () => {
  it("subject temperature is declared arbitrary, digits are the point", () => {
    expect(T_SUBJECT_K).toBeCloseTo(500.012, 6);
    expect(prose(SRC)).toContain("is arbitrary");
    expect(prose(SRC)).toContain("three digits after the point");
  });

  it("marks its one illustrative uncertainty AS invented", () => {
    //  This test used to assert the page contains the sentence "No
    //  uncertainty is invented anywhere here" and the phrase "ask for the
    //  budget" -- and BOTH were satisfied by that one disclaimer quoting
    //  itself: "ask for the budget" appeared nowhere else in the file, and
    //  the page printed U = 0.015 K (k = 2) in bold four paragraphs above.
    //  A claim a page makes about itself is exactly what a test must not
    //  take the page's word for.  Corrected 2026-08-31: the figure is
    //  marked invented AT THE POINT OF USE, and the bullet claims only what
    //  is true.
    expect(prose(SRC)).toContain("that ± is INVENTED here");
    expect(prose(SRC)).toContain("No uncertainty is quoted here as if it had"
      + " been measured");
    expect(prose(SRC), "the self-satisfying absolute is back")
      .not.toContain("No uncertainty is invented anywhere here");
    //  and the illustrative value is still SHOWN -- a student needs the form
    expect(SRC).toContain("U = 0.015 K (k = 2)");
  });

  it("gives the T90 - T difference as an order of magnitude, never a value", () => {
    expect(prose(SRC)).toContain("of order ten millikelvin");
    expect(prose(SRC)).toContain("not read back against its source");
  });

  it("carries no bookkeeping about its own editing history in the prose", () => {
    for (const meta of ["used to end", "has now been read",
      "quotes nothing from it", "this repository has not read it back"]) {
      expect(SRC, `self-referential bookkeeping is back: "${meta}"`)
        .not.toContain(meta);
    }
  });
});
