import { describe, expect, it } from "vitest";

import { caseComponentFiles, caseComponents } from "../src/case/catalogue.js";

describe("caseComponents — stem-keyed, proposals excluded", () => {
  it("skips un-promoted <name>.estimate-DATE.dat proposals (not usable as a component)", () => {
    const raw = {
      "constant/components/pentadiene.estimate-2026-06-06.dat":
        "name pentadiene;\nTc 490;\nvaporPressure { model AmbroseWalton; }\n",
    };
    expect(caseComponents(raw)).toEqual([]);
    expect(caseComponentFiles(raw)).toEqual({});
  });

  it("keys by the FILENAME STEM (the engine's key), not the in-file name field", () => {
    // file is foo.dat though the body says name=bar — the engine resolves 'foo'
    const list = caseComponents({
      "constant/components/foo.dat": "name bar;\nTc 400;\nvaporPressure { model AmbroseWalton; }\n",
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("foo");
  });
});
