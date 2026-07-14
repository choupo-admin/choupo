// Focused audit-transport tests (design forum #79-5): the typed origin is the
// policy axis, orthogonal to the resolution tier; promotedDespite carries its
// justification to the UI; legacy results without `origin` still classify.
import { describe, it, expect } from "vitest";
import type { PairResolution } from "../src/adapters/SolverAdapter";
import { badgeForTest } from "../src/ui/PairCoverageMatrix";

function pr(over: Partial<PairResolution>): PairResolution {
  return {
    model: "NRTL", i: "a", j: "b", status: "standard",
    source: "data/standards/binaryPairs/NRTL/a-b.dat", provSource: "",
    ...over,
  };
}

describe("pair audit badges (origin orthogonal to tier)", () => {
  it("standard literature stays green", () => {
    const b = badgeForTest(pr({ origin: "literature" }));
    expect(b.flag).toBe("ok");
  });
  it("standard assumed is NOT green", () => {
    const b = badgeForTest(pr({ origin: "assumed" }));
    expect(b.flag).toBe("soft");
    expect(b.label).toBe("assumed");
  });
  it("standard predictive is danger", () => {
    const b = badgeForTest(pr({ origin: "predictive" }));
    expect(b.flag).toBe("danger");
  });
  it("case-local regressed is green", () => {
    const b = badgeForTest(pr({ status: "perNode", origin: "regressed" }));
    expect(b.flag).toBe("ok");
  });
  it("placeholder is danger at any tier", () => {
    expect(badgeForTest(pr({ origin: "placeholder" })).flag).toBe("danger");
    expect(badgeForTest(pr({ status: "perNode", origin: "placeholder" })).flag).toBe("danger");
  });
  it("promotedDespite reaches the consumer with its justification", () => {
    const p = pr({ origin: "regressed",
      promotedDespite: { identifiable: 0, reason: 'accepted: "demo"', by: "vitor", date: "2026-07-10" } });
    expect(p.promotedDespite!.reason).toContain("demo");
    const b = badgeForTest(p);
    expect(b.flag).not.toBe("ok");   // an override never reads as clean
    const local = badgeForTest(pr({ status: "perNode", origin: "regressed",
      promotedDespite: { identifiable: 0, reason: "r", by: "v", date: "d" } }));
    expect(local.flag).not.toBe("ok");   // at ANY tier
  });
  it("legacy result without origin falls back to provSource", () => {
    const b = badgeForTest(pr({ status: "perNode", provSource: "fitted" }));
    expect(b.flag).toBe("ok");
    expect(b.label).toBe("fitted");
  });
});
