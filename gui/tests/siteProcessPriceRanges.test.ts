import { describe, expect, it } from "vitest";

import { FACTOR_RANGES, rangeLabel, type FactorId } from "../src/ui/methods/siteProcessPriceRanges.js";

describe("C212: the cited range beside each factor of the site/process/price page", () => {
  it("a factor with no source-stated range says so, and no range is invented", () => {
    for (const id of Object.keys(FACTOR_RANGES) as FactorId[]) {
      const r = FACTOR_RANGES[id];
      if (r === null) expect(rangeLabel(id)).toBe("range not cited");
      else {
        // a range that exists names its source and is ordered
        expect(r.source.length).toBeGreaterThan(0);
        expect(r.low).toBeLessThanOrEqual(r.high);
        expect(rangeLabel(id)).toContain(r.source);
      }
    }
  });
});
