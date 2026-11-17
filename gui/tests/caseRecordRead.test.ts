// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
//  A case that only PINS the catalogue's records (C413) still gets its numbers in the
//  app: the tools read them through src/case/caseRecordRead.ts, which falls back to
//  the bundled catalogue.  Opened here through the app's own loader.
import { describe, expect, it } from "vitest";

import { tutorialByName } from "../src/cases/tutorials.js";
import { caseMolarMass } from "../src/case/caseMolarMass.js";
import {
  caseComponentRecord, caseComponentScalar, pinnedComponentNames,
} from "../src/case/caseRecordRead.js";
import { LETDOWN_PROPS, LETDOWN_WITNESS } from "../src/ui/methods/letdown.js";
import { RELIEF_WITNESS_FIRE, FIRE_COMPONENT, recordScalar } from "../src/ui/methods/overpressure.js";

describe("a case that references the catalogue", () => {
  it("carries no local copy of NH3 and still resolves Pc, MW, Vliq, HvapTb", () => {
    for (const name of [LETDOWN_WITNESS, LETDOWN_PROPS]) {
      const raw = tutorialByName(name)!.files.rawFiles!;
      expect(raw["constant/components/NH3.dat"], `${name} would no longer reference`).toBeUndefined();
      expect(pinnedComponentNames(raw)).toContain("NH3");
      for (const k of ["Pc", "MW", "Vliq", "HvapTb"])
        expect(Number.isFinite(caseComponentScalar(raw, "NH3", k)), `${name} ${k}`).toBe(true);
      expect(caseComponentScalar(raw, "NH3", "MW")).toBeCloseTo(17.03, 1);
    }
  });
  it("the overpressure witness resolves the fire fluid's MW and Vliq", () => {
    const raw = tutorialByName(RELIEF_WITNESS_FIRE)!.files.rawFiles!;
    expect(recordScalar(raw, FIRE_COMPONENT, "MW")).toBe(58.08);
    expect(Number.isFinite(recordScalar(raw, FIRE_COMPONENT, "Vliq"))).toBe(true);
  });
  it("the display's molar-mass map holds the pinned components", () => {
    const mw = caseMolarMass(tutorialByName(LETDOWN_WITNESS)!.files.rawFiles);
    expect(mw["NH3"]).toBeCloseTo(17.03, 1);
  });
  it("a local record wins and a sealed case never falls back", () => {
    expect(caseComponentRecord({ "constant/components/NH3.dat": "MW 1;" }, "NH3")).toBe("MW 1;");
    expect(caseComponentRecord({ "constant/propertyManifest": "sealed true;" }, "NH3")).toBeUndefined();
    expect(caseComponentRecord({}, "NH3")).toContain("NH3");
  });
});
