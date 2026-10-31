/*---------------------------------------------------------------------------*\
  unitAcceptance -- the Model tab draws what a unit ACCEPTS from the
  generated gui/schemas/unitAcceptance.json (bin/curate/
  gen_unit_acceptance_docs.py, from both binaries' --describe-units; DEV.md
  4c C188 item 5, slice C), and the raw catalogue text drops the generated
  region rather than show it twice.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";

import { acceptanceOf, acceptanceTypes } from "../src/case/unitAcceptance.js";
import { modelSection } from "../src/case/modelDocs.js";

describe("unit acceptance (generated)", () => {
  it("a declared unit carries the four lists in the generator's words", () => {
    const d = acceptanceOf("batchDiafilter");
    expect(d).not.toBeNull();
    expect(d!.binary).toBe("choupoBatch");
    expect(d!.rule).toBe("aqueousSolventAndNonvolatileSolutes");
    expect(d!.refuses.some((s) => s.startsWith("A component outside what it models"))).toBe(true);
    expect(d!.mayPass[0]).toMatch(/^Nothing/);
    const ed = acceptanceOf("electrodialysisStack");
    expect(ed!.mayPass[0]).toContain("fate diluate | concentrate");
    expect(ed!.needs[0]).toContain("`aqueousActivityModel`");
  });

  it("an undeclared unit has no entry: silence means nothing declared", () => {
    expect(acceptanceOf("mixer")).toBeNull();
    expect(acceptanceTypes()).not.toContain("mixer");
  });

  it("the raw section drops the generated region and its markers", () => {
    const s = modelSection("batchDiafilter") ?? "";
    expect(s).toContain("batchDiafilter");
    expect(s).not.toContain("GENERATED unit-acceptance");
    expect(s).not.toContain("**What `batchDiafilter` accepts**");
  });
});
