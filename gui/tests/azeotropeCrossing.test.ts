// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vítor Geraldes
import { describe, expect, it } from "vitest";
import { azeotropeCrossings } from "../src/case/azeotropeCrossing";

describe("azeotropeCrossings", () => {
  it("reports ONE azeotrope for a curve that hugs the diagonal on seven points", () => {
    // y - x falls through zero once, near x = 0.894, staying within 0.01 of
    // the diagonal from x = 0.85 to 0.95 (the ethanol/water shape).
    const rows = [0.5, 0.7, 0.8, 0.85, 0.87, 0.88, 0.90, 0.92, 0.93, 0.95, 1.0]
      .map((x) => ({ x, y: x + 0.08 * (0.894 - x) * (x < 1 ? 1 : 0), T: 351 + (1 - x) }));
    rows[rows.length - 1]!.y = 1;
    const az = azeotropeCrossings(rows);
    expect(az).toHaveLength(1);
    expect(az[0]!.x).toBeCloseTo(0.894, 3);
  });
  it("reports none for a curve that stays above the diagonal, and never a pure end", () => {
    const rows = [0, 0.25, 0.5, 0.75, 1].map((x) => ({ x, y: x + 0.3 * x * (1 - x), T: 350 }));
    expect(azeotropeCrossings(rows)).toHaveLength(0);
  });
  it("finds a crossing a coarse grid brackets without sampling", () => {
    const rows = [{ x: 0.4, y: 0.5, T: 340 }, { x: 0.8, y: 0.7, T: 344 }];
    const az = azeotropeCrossings(rows);
    expect(az).toHaveLength(1);
    expect(az[0]!.x).toBeCloseTo(0.6, 12);
    expect(az[0]!.T).toBeCloseTo(342, 12);
  });
});
