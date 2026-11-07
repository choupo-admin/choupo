/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
/*  THE PLOT PLAN'S TOUR, CAMERAS, COLOUR, CARDS AND FACTS (DEV.md 4c C229).

    Pure logic only (the three.js layer has no test here, by the repository's
    rule that the view draws and decides nothing): a tour whose every sentence
    carries the result field it was read from, a colour scale read from
    published values with a neutral for a missing one, free cameras that stay
    in their box, and cards that print no row the result does not carry. */

import { describe, expect, it } from "vitest";

import { aheadOf, EYE_HEIGHT, freeBounds, freeLooking, fromMini, gotoList, keyAction,
         look, minimapOf, NO_KEYS, stepFree, toMini } from "../src/case/layoutCamera.js";
import { itemCard, notModelled, pipeCard } from "../src/case/layoutCards.js";
import { availableModes, colourPipes, niceRange, NEUTRAL_COLOUR, rampColour }
  from "../src/case/layoutColour.js";
import { headlineSizing, layoutFactsOf, money, sig } from "../src/case/layoutFacts.js";
import { layoutScene } from "../src/case/plantLayout.js";
import { MAX_STEPS, tourOf } from "../src/case/layoutTour.js";
import type { RunResult } from "../src/adapters/SolverAdapter.js";
import { PIPED } from "./plantLayoutFixture.js";

const scene = layoutScene(PIPED)!;

const RESULT = {
  converged: true,
  streams: [
    { name: "rawLiquid", role: "intermediate", F: 1, T: 250, P: 2e7, vf: 0, F_mass: 16.98,
      composition: { N2: 0.1, H2: 0.3, NH3: 0.6 } },
    { name: "unreactedGas", role: "intermediate", F: 5, T: 250, P: 2e7, vf: 1, F_mass: 87.9,
      composition: { N2: 0.25, H2: 0.75 } },
    { name: "letdownGas", role: "product", F: 0.1, T: 250, P: 2e6, vf: 1, F_mass: 0.13,
      composition: { NH3: 0.2, H2: 0.8 } },
  ],
  equipment: [
    { unit: "converter", item: "converter", type: "vessel", material: "carbonSteel", tagNo: "V-101",
      values: { D: 2.1 }, cost: { purchased: 1e5, bareModule: 4e5, totalModule: 4.7e5, currency: "EUR" } },
    { unit: "separator", item: "separator", type: "vessel", material: "carbonSteel", values: {} },
  ],
  economics: { currency: "EUR", FCI: 1, WC: 1, TCI: 12.5e6, COM_d: 1, revenue: 1, depreciation: 1,
    NPV: -3e6, IRR: null, irrAmbiguous: false, discountedPayback: null, simplePayback: 8.4,
    discountRate: 0.1, taxRate: 0.2, projectLife: 20, estimateClass: 4, accLo: -20, accHi: 30,
    cashFlow: [] },
  layout: { ...PIPED, summary: { placed: 5, unplaced: 0, internal: 0, findings: 3, pipes: 4,
                                  notRouted: 1, pipeLength: 70.1 } },
} as unknown as RunResult;

const facts = layoutFactsOf(RESULT)!;

describe("layoutFactsOf", () => {
  it("keeps only what the result published", () => {
    expect(facts.components).toEqual(["N2", "H2", "NH3"]);
    expect(facts.streams["unreactedGas"]!.composition!["H2"]).toBe(0.75);
    expect(facts.items["converter"]!.tagNo).toBe("V-101");
    expect(facts.items["converter"]!.cost!.totalModule).toBe(4.7e5);
    expect(facts.items["separator"]!.cost).toBeUndefined();
    expect(facts.sized).toBe(true);
  });
  it("states the headline with the source key of each number", () => {
    const k = Object.fromEntries(facts.kpis.map((x) => [x.source, x.value]));
    expect(k["converged"]).toBe("yes");
    expect(k["economics.TCI"]).toBe("12.5 MEUR");
    expect(k["economics.simplePayback"]).toBe("8.4 y");
    expect("economics.IRR" in k).toBe(false);          // null IRR: no line
    expect(k["layout.summary.pipes"]).toBe("4 (70.1 m)");
  });
  it("returns nothing for a result that carries nothing", () => {
    expect(layoutFactsOf(null)).toBeNull();
    expect(layoutFactsOf({ streams: [] } as unknown as RunResult)).toBeNull();
  });
  it("formats numbers compactly", () => {
    expect(sig(1234.5678)).toBe("1235");
    expect(money(2.5e3, "EUR")).toBe("2.5 kEUR");
    expect(headlineSizing([{ key: "x", value: 1, unit: "" }, { key: "L", value: 9, unit: "m" },
                           { key: "D", value: 2, unit: "m" }], 2).map((s) => s.key)).toEqual(["D", "L"]);
  });
});

describe("colour by a published quantity", () => {
  it("paints temperature from the pipe's published T and leaves a pipe without one neutral", () => {
    const c = colourPipes(scene.pipes, { kind: "T" }, facts);
    const flashing = scene.pipes.findIndex((p) => p.stream === "flashing");
    expect(c.colours[flashing]).toBe(NEUTRAL_COLOUR);
    expect(c.neutral[flashing]).toBe(true);
    expect(c.legend.notes.join(" ")).toMatch(/1 pipe grey/);
    expect(c.legend.unit).toBe("K");
    // every other pipe is at 250 K: a degenerate range is widened, never divided by zero
    expect(Number.isFinite(c.legend.lo)).toBe(true);
    expect(c.legend.hi!).toBeGreaterThan(c.legend.lo!);
  });
  it("shows the pressure in bar and orders the colours by pressure", () => {
    const c = colourPipes(scene.pipes, { kind: "P" }, facts);
    const hp = scene.pipes.findIndex((p) => p.stream === "rawLiquid");
    const lp = scene.pipes.findIndex((p) => p.stream === "letdownGas");
    expect(c.legend.unit).toBe("bar");
    expect(c.colours[hp]).toBe(rampColour(1));
    expect(c.colours[lp]).not.toBe(c.colours[hp]);
  });
  it("reads a component's mole fraction from the stream table: absent component 0, no composition grey", () => {
    const c = colourPipes(scene.pipes, { kind: "x", component: "NH3" }, facts);
    const idx = (n: string) => scene.pipes.findIndex((p) => p.stream === n);
    expect(c.colours[idx("rawLiquid")]).toBe(rampColour(1));           // 0.6, the maximum
    expect(c.colours[idx("unreactedGas")]).toBe(rampColour(0));        // no NH3: zero, not grey
    expect(c.neutral[idx("flashing")]).toBe(true);                     // no stream published: grey
    expect(c.legend.title).toMatch(/NH3/);
    expect(c.legend.unit).toBe("mol/mol");
  });
  it("offers composition only with a stream table, T and P from the pipes alone", () => {
    expect(availableModes(scene.pipes, null)).toEqual({ phase: true, T: true, P: true, x: false });
    expect(availableModes(scene.pipes, facts).x).toBe(true);
  });
  it("phase colouring keeps the legend of the phases present", () => {
    const c = colourPipes(scene.pipes, { kind: "phase" });
    expect(c.legend.kind).toBe("category");
    expect(c.legend.entries.length).toBe(3);   // liquid, vapour, two-phase
  });
  it("rounds a range outward to a round number", () => {
    expect(niceRange(0, 0.63)).toEqual([0, 0.8]);
    const [lo, hi] = niceRange(253.15, 424.57);
    expect(lo).toBeLessThanOrEqual(253.15);
    expect(hi).toBeGreaterThanOrEqual(424.57);
  });
});

describe("the generated tour", () => {
  const tour = tourOf(scene, RESULT.layout, facts);
  it("opens with the engine's counts and closes with its checks", () => {
    expect(tour[0]!.id).toBe("overview");
    expect(tour[0]!.lines[0]!.text).toMatch(/placed 5 items and routed 4 pipes, 70.1 m/);
    expect(tour[tour.length - 1]!.id).toBe("close");
  });
  it("follows the sectors in the order they first appear", () => {
    const titles = tour.map((s) => s.title);
    // PIPED has items in sector "" (makeupComp) and LOOP: two stops of one named sector
    expect(titles.length).toBeGreaterThan(2);
    expect(tour.length).toBeLessThanOrEqual(MAX_STEPS + 2);
  });
  it("gives every sentence the result field it came from", () => {
    for (const s of tour) for (const l of s.lines) {
      expect(l.source.length).toBeGreaterThan(0);
      expect(l.text.length).toBeGreaterThan(0);
    }
  });
  it("says what the engine did not size, and prices the sized ones from the sheet", () => {
    const all = tour.flatMap((s) => s.lines.map((l) => l.text)).join("\n");
    expect(all).toMatch(/not sized by the engine: .*makeupComp/);
    expect(all).toMatch(/converter \(V-101\).*installed cost 470 kEUR/);
  });
  it("invents nothing when the result carries nothing", () => {
    const bare = tourOf(scene);
    const text = bare.flatMap((s) => s.lines.map((l) => l.text)).join("\n");
    expect(text).not.toMatch(/installed cost|not sized/);
    expect(bare.length).toBeGreaterThan(1);
  });
  it("frames each step on the items it names", () => {
    const step = tour.find((s) => s.itemIds.includes("converter"))!;
    const conv = scene.solids.find((s) => s.id === "converter")!;
    expect(step.focus.min[0]).toBeLessThanOrEqual(conv.center[0] - conv.size[0] / 2 + 1e-9);
    expect(step.focus.max[1]).toBeGreaterThanOrEqual(conv.center[1] + conv.size[1] / 2 - 1e-9);
  });
});

describe("the cameras", () => {
  const b = freeBounds(scene, "walk");
  it("walks on the ground and never leaves the box", () => {
    let s = freeLooking([0, EYE_HEIGHT, 0], [0, EYE_HEIGHT, -10]);          // north
    s = stepFree(s, { ...NO_KEYS, fwd: true }, 1, "walk", b, 3);
    expect(s.pos[2]).toBeCloseTo(-3, 6);
    expect(s.pos[1]).toBe(EYE_HEIGHT);
    for (let i = 0; i < 400; i++) s = stepFree(s, { ...NO_KEYS, left: true, fwd: true }, 1, "walk", b);
    expect(s.pos[0]).toBeGreaterThanOrEqual(b.min[0]);
    expect(s.pos[2]).toBeGreaterThanOrEqual(b.min[2]);
  });
  it("strafes to the right of the heading", () => {
    const s = stepFree(freeLooking([0, EYE_HEIGHT, 0], [0, EYE_HEIGHT, -10]),
      { ...NO_KEYS, right: true }, 1, "walk", b, 3);
    expect(s.pos[0]).toBeCloseTo(3, 6);
  });
  it("flies along the look direction and keeps clear of the ground", () => {
    const d = freeBounds(scene, "drone");
    let s = freeLooking([0, 10, 0], [0, 0, -10]);                            // 45 deg down
    s = stepFree(s, { ...NO_KEYS, fwd: true }, 100, "drone", d, 3);
    expect(s.pos[1]).toBeGreaterThanOrEqual(d.min[1]);
  });
  it("turns the head with a drag and clamps the pitch", () => {
    let s = look(freeLooking([0, 2, 0], [0, 2, -1]), 100, 0);
    expect(s.yaw).toBeGreaterThan(0);
    s = look(s, 0, -1e6);
    expect(s.pitch).toBeLessThan(Math.PI / 2);
    const a = aheadOf(freeLooking([1, 2, 3], [1, 2, -7]), 10);
    expect(a[2]).toBeCloseTo(-7, 6);
  });
  it("maps keys", () => {
    expect(keyAction("KeyW")).toBe("fwd");
    expect(keyAction("ArrowLeft")).toBe("left");
    expect(keyAction("KeyX")).toBeNull();
  });
  it("lists the plant, each sector and each item to go to", () => {
    const g = gotoList(scene);
    expect(g[0]!.kind).toBe("plant");
    expect(g.some((x) => x.id === "sector:LOOP")).toBe(true);
    expect(g.filter((x) => x.kind === "item").length).toBe(scene.solids.length);
  });
  it("maps the minimap both ways", () => {
    const m = minimapOf(scene.fitMin, scene.fitMax, 168, 126);
    const [px, py] = toMini(m, 40, -20);
    const [x, z] = fromMini(m, px, py);
    expect(x).toBeCloseTo(40, 6);
    expect(z).toBeCloseTo(-20, 6);
    // plan north (smaller Z) is up the canvas
    expect(toMini(m, 40, -30)[1]).toBeLessThan(toMini(m, 40, -10)[1]);
  });
});

describe("the click cards: no value, no line", () => {
  it("prints the sheet of a sized item with its cost", () => {
    const c = itemCard(scene.solids.find((s) => s.id === "converter")!, facts);
    expect(c.rows.find((r) => r.label === "Tag")!.value).toBe("V-101");
    expect(c.rows.find((r) => r.label === "Total-module cost")!.value).toBe("470 kEUR");
    expect(c.rows.find((r) => r.label === "Purchased cost")!.value).toBe("100 kEUR");
  });
  it("prints no cost row for an item with no cost, and says an unsized one is not modelled", () => {
    const sep = itemCard(scene.solids.find((s) => s.id === "separator")!, facts);
    expect(sep.rows.some((r) => /cost/.test(r.label))).toBe(false);
    const mk = scene.solids.find((s) => s.id === "makeupComp")!;
    expect(notModelled(mk, facts)).toBe(true);
    expect(itemCard(mk, facts).notes.join(" ")).toMatch(/Not modelled/);
    expect(notModelled(mk, null)).toBe(false);          // no sizing pass known: nothing is claimed
  });
  it("describes a pipe by its published stream and drops what is absent", () => {
    const raw = pipeCard(scene.pipes.find((p) => p.stream === "rawLiquid")!, facts);
    const row = (l: string) => raw.rows.find((r) => r.label === l)?.value;
    expect(row("Temperature")).toBe("250 K (-23.15 °C)");
    expect(row("Pressure")).toBe("200 bar");
    expect(row("Mass flow")).toBe("16.98 kg/s");
    expect(row("Mole fractions")).toBe("NH3 0.6, H2 0.3, N2 0.1");
    const fl = pipeCard(scene.pipes.find((p) => p.stream === "flashing")!, facts);
    expect(fl.rows.some((r) => r.label === "Temperature")).toBe(false);
    expect(fl.rows.some((r) => r.label === "Pressure")).toBe(false);
    expect(fl.rows.some((r) => r.label === "Mass flow")).toBe(false);
  });
});
