/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

// The "day of a tray dryer" card of the drying page (C508 reopened): the cycle
// arithmetic, the point it makes (halving the drying time does not double the
// output), and that the page mounts the card.  No engine run: the drying time is
// the engine's, read at run time by the card; here it is a number we hand in.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DAY_KNOBS, trayDay } from "../src/ui/methods/DryingCards.js";
import { tutorialByName } from "../src/cases/tutorials.js";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, ROOT), "utf8");

describe("trayDay: the cycle arithmetic", () => {
  it("cycle = load + dry + unload + clean; batches per day = 24 / cycle", () => {
    const d = trayDay(4, 0.5, 0.5, 1, 2);
    expect(d.cycleH).toBeCloseTo(6, 12);
    expect(d.batchesPerDay).toBeCloseTo(4, 12);
    expect(d.kgPerDay).toBeCloseTo(8, 12);
    expect(d.notDryingShare).toBeCloseTo(2 / 6, 12);
  });
  it("halving the drying time does not double the output while the handling time is not zero", () => {
    const base = trayDay(4, 0.5, 0.5, 1, 2);
    const half = trayDay(2, 0.5, 0.5, 1, 2);
    const gain = half.batchesPerDay / base.batchesPerDay;
    expect(gain).toBeCloseTo(6 / 4, 12);
    expect(gain).toBeLessThan(2);
    const zero = trayDay(0, 0.5, 0.5, 1, 2);
    // the ceiling the handling sets: 24 / (load + unload + clean)
    expect(zero.batchesPerDay).toBeCloseTo(24 / 2, 12);
    expect(zero.kgPerDay).toBeCloseTo(24, 12);
  });
  it("with no handling time the output IS inversely proportional to the drying time", () => {
    const a = trayDay(4, 0, 0, 0, 2), b = trayDay(2, 0, 0, 0, 2);
    expect(b.batchesPerDay / a.batchesPerDay).toBeCloseTo(2, 12);
    expect(a.notDryingShare).toBe(0);
  });
  it("an unknown batch mass gives no kg per day, and the batches are still counted", () => {
    const d = trayDay(4, 0.5, 0.5, 1, null);
    expect(d.kgPerDay).toBeNull();
    expect(d.batchesPerDay).toBeCloseTo(4, 12);
  });
  it("the three handling times are declared with their defaults and each says it is the reader's assumption", () => {
    for (const k of [DAY_KNOBS.load, DAY_KNOBS.unload, DAY_KNOBS.clean]) {
      expect(k.why).toMatch(/your assumption/);
      expect(k.def).toBeGreaterThanOrEqual(k.min);
      expect(k.def).toBeLessThanOrEqual(k.max);
    }
  });
});

describe("the card is on the page and its witness is the engine's tray", () => {
  it("the drying page mounts TrayDayCard, after the last-percent card, and the hot-product card follows step 4", () => {
    const t = read("gui/src/ui/methods/DryingCurveTool.tsx");
    const i = t.indexOf("<LastPercentCard"), j = t.indexOf("<TrayDayCard"), k = t.indexOf("<HotProductCard");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(i);   // the hot-product card follows step 4, in "see"
  });
  it("runs dryer01_sucrose_tray, a bundled case that charges 2.0 kg of dry sucrose over 0.5 m2 (the batch mass is read from its kpis)", () => {
    const src = read("gui/src/ui/methods/DryingCards.tsx");
    expect(src).toContain('"batch/drying/dryer01_sucrose_tray", sets, "tray-day"');
    expect(src).toContain('["campaign"]?.["mass_kg_initial"]');
    expect(tutorialByName("batch/drying/dryer01_sucrose_tray")).toBeDefined();
    expect(read("tutorials/batch/drying/dryer01_sucrose_tray/system/flowsheetDict")).toMatch(/type\s+batchDryer\s*;/);
  });
  it("the Theory Guide section the card cites exists and carries the cycle equation", () => {
    const th = read("docs/theoryGuide.tex");
    expect(th).toContain("\\label{sec:drying-tray-day}");
    expect(th).toMatch(/t_\\mathrm\{cycle\}=t_\\mathrm\{load\}\+t_\\mathrm\{dry\}/);
    expect(read("docs/eduToolsGuide.tex")).toContain("Section~\\ref{sec:drying-tray-day}");
  });
});
