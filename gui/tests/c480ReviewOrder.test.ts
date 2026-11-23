// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
// C480: a props case that creates a component (psat01) opens on its figures and tables;
// the 70 vh thermo-readiness panel comes AFTER them in the layout without studies.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ReviewScreen without studies: the answer before the readiness", () => {
  const src = readFileSync(join(__dirname, "../src/ui/ReviewScreen.tsx"), "utf8");
  const start = src.indexOf('data-review="overview">\n        {ran && numbersOnly.length');
  const branch = src.slice(start);
  it("lists figures, then tables, then the readiness block", () => {
    expect(start).toBeGreaterThan(0);
    const fig = branch.indexOf('kind="plot"');
    const tab = branch.indexOf('kind="table"');
    const rdy = branch.indexOf("{readinessBlock}");
    expect(fig).toBeGreaterThan(0);
    expect(tab).toBeGreaterThan(fig);
    expect(rdy).toBeGreaterThan(tab);
  });
});
