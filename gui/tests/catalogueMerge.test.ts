import { describe, expect, it } from "vitest";

import { CATALOGUE, mergeCatalogue, metaByName, searchCatalogue } from "../src/case/catalogue.js";

// A minimal case-local component body (name + Tc + a vapourPressure block ->
// vleAble) the merge should pick up from caseFiles.rawFiles.
const PENTADIENE = "name pentadiene;\nformula C5H8;\nTc 490;\nPc 38.9;\nvaporPressure { model AmbroseWalton; }\n";
const LOCAL_WATER = "name water;\nformula H2O;\nTc 647;\nvaporPressure { model AmbroseWalton; }\n";

describe("mergeCatalogue — case-local components in the Explorer", () => {
  it("every standard entry is tagged origin 'standard'", () => {
    expect(CATALOGUE.every((m) => m.origin === "standard")).toBe(true);
  });

  it("no rawFiles -> the SAME CATALOGUE reference (no-case path unchanged)", () => {
    expect(mergeCatalogue(undefined)).toBe(CATALOGUE);
    expect(mergeCatalogue({})).toBe(CATALOGUE);
    // rawFiles with nothing under constant/components/ also no-ops
    expect(mergeCatalogue({ "system/controlDict": "application choupoProps;" })).toBe(CATALOGUE);
  });

  it("appends a new case-local component as origin 'local'", () => {
    const merged = mergeCatalogue({ "constant/components/pentadiene.dat": PENTADIENE });
    const p = metaByName("pentadiene", merged);
    expect(p).toBeDefined();
    expect(p!.origin).toBe("local");
    expect(p!.vleAble).toBe(true);
    expect(p!.tc).toBe(490);
    // CATALOGUE itself is never mutated
    expect(metaByName("pentadiene")).toBeUndefined();
    expect(merged.length).toBe(CATALOGUE.length + 1);
  });

  it("a same-named case-local file shadows the standard ('local-shadow')", () => {
    const merged = mergeCatalogue({ "constant/components/water.dat": LOCAL_WATER });
    const w = metaByName("water", merged);
    expect(w).toBeDefined();
    expect(w!.origin).toBe("local-shadow");
    // no new row — it replaced the standard water in place
    expect(merged.length).toBe(CATALOGUE.length);
  });

  it("search can run over the merged pool", () => {
    const merged = mergeCatalogue({ "constant/components/pentadiene.dat": PENTADIENE });
    expect(searchCatalogue("penta", merged).some((m) => m.name === "pentadiene")).toBe(true);
    // default pool (standard) still does not see it
    expect(searchCatalogue("penta").some((m) => m.name === "pentadiene")).toBe(false);
  });
});
