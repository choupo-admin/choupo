import { describe, expect, it } from "vitest";

import { caseComponentFiles, caseComponents, mergeCatalogue } from "../src/case/catalogue.js";

const PENTA_ROOT = "name pentadiene;\nformula C5H8;\nTc 490;\nvaporPressure { model AmbroseWalton; }\n";
const PENTA_SECTOR = "name pentadiene;\nformula C5H8;\nTc 491;\nvaporPressure { model AmbroseWalton; }\n";
const FOO_SECTOR = "name foo;\nformula CX;\nTc 400;\nvaporPressure { model AmbroseWalton; }\n";
const LOCAL_WATER = "name water;\nformula H2O;\nTc 647;\nvaporPressure { model AmbroseWalton; }\n";

describe("caseComponents — whole-case-tree, separate list", () => {
  it("empty / no rawFiles -> []", () => {
    expect(caseComponents(undefined)).toEqual([]);
    expect(caseComponents({})).toEqual([]);
  });

  it("picks up components ANYWHERE in the tree (root + nested sectors)", () => {
    const list = caseComponents({
      "constant/components/pentadiene.dat": PENTA_ROOT,
      "sectorA/constant/components/foo.dat": FOO_SECTOR,
      "system/controlDict": "application choupoProps;",
    });
    expect(list.map((m) => m.name).sort()).toEqual(["foo", "pentadiene"]);
    expect(list.every((m) => m.origin === "local")).toBe(true);
  });

  it("dedups a name declared at several depths — shallowest (most shared) wins", () => {
    const list = caseComponents({
      "sectorA/constant/components/pentadiene.dat": PENTA_SECTOR, // Tc 491, depth 4
      "constant/components/pentadiene.dat": PENTA_ROOT,           // Tc 490, depth 3 -> wins
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.tc).toBe(490);
  });

  it("a same-name as a standard component is tagged 'local-shadow'", () => {
    const list = caseComponents({ "constant/components/water.dat": LOCAL_WATER });
    expect(list[0]!.name).toBe("water");
    expect(list[0]!.origin).toBe("local-shadow");
  });

  it("caseComponentFiles flattens every tree component to the case root", () => {
    const files = caseComponentFiles({
      "sectorA/constant/components/foo.dat": FOO_SECTOR,
      "constant/components/pentadiene.dat": PENTA_ROOT,
    });
    expect(Object.keys(files).sort()).toEqual([
      "constant/components/foo.dat",
      "constant/components/pentadiene.dat",
    ]);
    expect(files["constant/components/foo.dat"]).toBe(FOO_SECTOR);
  });

  it("mergeCatalogue (lookup pool) still resolves a tree component by name", () => {
    const merged = mergeCatalogue({ "sectorA/constant/components/foo.dat": FOO_SECTOR });
    expect(merged.some((m) => m.name === "foo")).toBe(true);
  });
});
