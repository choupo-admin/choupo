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

/*  THE COLUMN PROFILE IS READ FROM ITS OWN SERIES (rehearsal 2026-11-13: 26
    traces of four kinds on one axis labelled "mole fraction").  These arms
    hold the grouping (no group mixes kinds), the opening rule of a staged
    column (T, liquid fractions, reaction extent; the rest one chip away, none
    removed), the liquid-share rule and the panel layout.  The fixture is the
    series set the reactive full MESH publishes (DistillationColumn.cpp). */

import { describe, expect, it } from "vitest";
import {
  groupProfileSeries, initiallyDrawn, panelDomains, LIQUID_SHARE_MIN,
} from "../src/case/profileSeries.js";

const N = 5;
const ramp = (a: number, b: number) =>
  Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));
const reactiveColumn = {
  stage: ramp(1, N),
  T: ramp(320, 400),
  x_methanol: ramp(0.2, 0.01),
  x_isoButene: ramp(0.3, 0.0),
  x_mtbe: ramp(0.0, 0.9),
  x_traceStuff: ramp(0.001, 0.0005),
  y_methanol: ramp(0.3, 0.02),
  y_mtbe: ramp(0.0, 0.8),
  gamma_methanol: ramp(1.1, 3.2),
  lnKa: ramp(3, 1),
  extent_kmol_h: ramp(0, 190),
};

describe("groupProfileSeries", () => {
  const groups = groupProfileSeries(reactiveColumn, "stage");
  const ids = groups.map((g) => g.id);

  it("puts every series in exactly one group and drops none", () => {
    const all = groups.flatMap((g) => g.keys).sort();
    expect(all).toEqual(Object.keys(reactiveColumn).filter((k) => k !== "stage").sort());
  });

  it("never mixes kinds: one group per prefix, extent alone", () => {
    expect(ids).toEqual([
      "temperature", "liquid", "vapour", "activityCoefficient", "lnKa", "extent",
    ]);
    for (const g of groups) {
      const prefixes = new Set(g.keys.map((k) => k.split("_")[0]));
      expect(prefixes.size).toBe(1);
    }
  });

  it("opens a staged column on T, the liquid fractions and the extent only", () => {
    expect(groups.filter((g) => g.defaultOn).map((g) => g.id))
      .toEqual(["temperature", "liquid", "extent"]);
  });

  it("draws the extent as bars on its own axis, with a title that says the unit", () => {
    const ext = groups.find((g) => g.id === "extent")!;
    expect(ext.kind).toBe("bar");
    expect(ext.title).toBe("Reaction extent (kmol/h)");
    expect(groups.find((g) => g.id === "liquid")!.title).toMatch(/^Liquid mole fraction/);
  });

  it("opens a non-reactive column with no extent group", () => {
    const { gamma_methanol: _g, lnKa: _l, extent_kmol_h: _e, ...plain } = reactiveColumn;
    const g = groupProfileSeries(plain, "stage");
    expect(g.map((x) => x.id)).toEqual(["temperature", "liquid", "vapour"]);
    expect(g.filter((x) => x.defaultOn).map((x) => x.id)).toEqual(["temperature", "liquid"]);
  });

  it("opens every group of a profile that is not a staged column", () => {
    const pfr = { z: ramp(0, 1), F_A: ramp(1, 0.2), F_B: ramp(0, 0.8), T: ramp(300, 340), X: ramp(0, 0.8) };
    const g = groupProfileSeries(pfr, "z");
    expect(g.map((x) => x.id)).toEqual(["temperature", "molarFlow", "conversion"]);
    expect(g.every((x) => x.defaultOn)).toBe(true);
    expect(g.find((x) => x.id === "conversion")!.range).toEqual([0, 1]);
  });

  it("gives a series no rule knows its own group, titled by its own name", () => {
    const g = groupProfileSeries({ stage: [1, 2], T: [300, 310], dP_Pa: [5, 6] }, "stage");
    expect(g.find((x) => x.id === "other:dP_Pa")!.title).toBe("dP_Pa");
  });

  it("labels a series without its prefix (the hover keeps the engine's name)", () => {
    expect(groups.find((g) => g.id === "liquid")!.label("x_mtbe")).toBe("mtbe");
  });
});

describe("initiallyDrawn", () => {
  const groups = groupProfileSeries(reactiveColumn, "stage");
  it("turns off a liquid component that stays below the share everywhere", () => {
    const d = initiallyDrawn(groups.find((g) => g.id === "liquid")!, reactiveColumn);
    expect(Math.max(...reactiveColumn.x_traceStuff)).toBeLessThan(LIQUID_SHARE_MIN);
    expect(d.has("x_traceStuff")).toBe(false);
    expect(d.has("x_mtbe") && d.has("x_methanol") && d.has("x_isoButene")).toBe(true);
  });
  it("draws every series of the other groups", () => {
    const g = groups.find((x) => x.id === "vapour")!;
    expect([...initiallyDrawn(g, reactiveColumn)].sort()).toEqual([...g.keys].sort());
  });
  it("draws something even when every component is small", () => {
    const cols = { stage: [1, 2], x_a: [0.001, 0.002], y_a: [0.1, 0.2], T: [1, 2] };
    const g = groupProfileSeries(cols, "stage").find((x) => x.id === "liquid")!;
    expect(initiallyDrawn(g, cols).size).toBe(1);
  });
});

describe("panelDomains", () => {
  it("stacks proportional panels from the top without overlap", () => {
    const d = panelDomains([1, 2, 1], 0.05);
    expect(d[0]![1]).toBe(1);
    expect(d[2]![0]).toBeCloseTo(0, 9);
    expect(d[1]![1]).toBeLessThan(d[0]![0]);
    expect(d[2]![1]).toBeLessThan(d[1]![0]);
    expect((d[1]![1] - d[1]![0]) / (d[0]![1] - d[0]![0])).toBeCloseTo(2, 9);
  });
  it("is empty for no panel", () => { expect(panelDomains([])).toEqual([]); });
});
