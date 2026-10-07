//  C50 (2026-10-07): drilled into the green-ammonia Converter, the feed showed
//  the converged 151 bar and RAN at the plant's 8 bar recycle seed, because
//  the root 0/ projected into the drilled sub-case counted as the sub-case's
//  own state and so beat the drill's converged feed.
import { describe, expect, it } from "vitest";
import { tutorialByName } from "../src/cases/tutorials.js";
import { applyDrillFeeds } from "../src/case/drillSeed.js";
import { zeroStateText } from "../src/case/toGraph.js";

const CONV = "plant/greenAmmoniaIndustrialN2/Converter";
const converged = { F: 30.0, T: 651.06, P: 15092690,
                    molarComposition: { N2: 0.2, H2: 0.6, NH3: 0.15, Ar: 0.05 } };

function zeroOf(files: { rawFiles?: Record<string, string>; extraFiles?: Record<string, string> }, nm: string) {
  return zeroStateText({ ...(files.rawFiles ?? {}), ...(files.extraFiles ?? {}) }, nm);
}

describe("a drilled unit starts from the drill's state, not the parent's seed", () => {
  const t = tutorialByName(CONV);

  it("the registry remembers which 0/ files it projected from the root", () => {
    expect(t).toBeDefined();
    expect(t!.projectedZero).toContain("0/Feed");
    // and the projection IS the plant's seed: 8 bar
    expect(zeroOf(t!.files, "Feed")).toMatch(/P\s+800000 Pa/);
  });

  it("the converged feed replaces the projected seed", () => {
    const out = applyDrillFeeds(t!.files, { Feed: converged }, new Set(t!.projectedZero));
    const text = zeroOf(out, "Feed")!;
    expect(text).not.toMatch(/800000 Pa/);
    expect(text).toMatch(/15092690|1\.509269e\+?0?7|150\.9269 bar/);
    expect(out.rawFiles?.["0/Feed"]).toBeUndefined();
  });

  it("an AUTHORED 0/ still wins over the drill", () => {
    const authored = { ...t!.files, extraFiles: { ...(t!.files.extraFiles ?? {}), "0/Feed": "P 1 bar;" } };
    const out = applyDrillFeeds(authored, { Feed: converged }, new Set<string>());
    expect(zeroOf(out, "Feed")).toBe("P 1 bar;");
  });
});
