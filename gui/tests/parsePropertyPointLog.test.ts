import { describe, expect, it } from "vitest";
import { parsePropertyPointReferences } from "../src/ui/parsePropertyPointLog.js";

// The log-scraping parser was retired (strategy P4b): property-point VALUES
// now travel through the machine block (each op's engine diagnostics).  What
// remains here is the DICT side: the per-op reference{} blocks.
describe("parsePropertyPointReferences", () => {
  it("reads per-op reference blocks from the propsDict", () => {
    const refs = parsePropertyPointReferences({
      operations: [
        { name: "N2_298K_1bar", type: "propertyPoint",
          reference: { Cp_ig: 29.12, source: "NIST WebBook" } },
      ],
    });
    expect(refs.get("N2_298K_1bar")?.values["Cp_ig"]).toBe(29.12);
  });
});
