import { describe, expect, it } from "vitest";

import { mergeTernaryCsvs, workerCount } from "../src/case/ternaryParallel.js";

describe("ternary parallel merge", () => {
  it("merges scalar-surface shards (concat rows, one header)", () => {
    const a = "x1,x2,x3,T_bubble\n0.1,0.1,0.8,3.5e2\n";
    const b = "x1,x2,x3,T_bubble\n0.2,0.2,0.6,3.6e2\n";
    const m = mergeTernaryCsvs([a, b]);
    const lines = m.trim().split("\n");
    expect(lines[0]).toBe("x1,x2,x3,T_bubble");
    expect(lines).toHaveLength(3);            // header + 2 data rows
    expect(lines.filter((l) => l === "x1,x2,x3,T_bubble")).toHaveLength(1);
  });

  it("merges phase-map shards and makes tie-line ids unique across shards", () => {
    const hdr = "x1,x2,x3,region,region_id,kind,tieline_id,beta_vapor,beta_alpha,beta_beta";
    const a = `${hdr}\n0.3,0.3,0.4,LL,2,node,-1,0,0.5,0.5\n0.3,0.3,0.4,LL,2,tie,0,0,0,0\n0.4,0.4,0.2,LL,2,tie,0,0,0,0\n`;
    const b = `${hdr}\n0.6,0.2,0.2,LL,2,node,-1,0,0.5,0.5\n0.6,0.2,0.2,LL,2,tie,0,0,0,0\n0.5,0.3,0.2,LL,2,tie,0,0,0,0\n`;
    const m = mergeTernaryCsvs([a, b]);
    const lines = m.trim().split("\n");
    expect(lines[0]).toBe(hdr);
    const tieIds = lines.slice(1).filter((l) => l.includes(",tie,")).map((l) => l.split(",")[6]);
    // shard 0 keeps id 0; shard 1's id 0 is offset to 1000000 — pairs preserved
    expect(new Set(tieIds)).toEqual(new Set(["0", "1000000"]));
    // node rows preserved (2 nodes total)
    expect(lines.filter((l) => l.includes(",node,"))).toHaveLength(2);
  });

  it("workerCount stays in [1, cap] and never exceeds the grid", () => {
    expect(workerCount(2)).toBeGreaterThanOrEqual(1);
    expect(workerCount(2)).toBeLessThanOrEqual(2);
    expect(workerCount(100, 8)).toBeLessThanOrEqual(8);
  });
});
