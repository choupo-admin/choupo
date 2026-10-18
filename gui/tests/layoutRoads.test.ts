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

/*  THE ROADS AND THE LAYOUT'S PANELS (DEV.md 4c C90, C91), held without a
    browser:
      * the scene carries the engine's road centre lines into three.js
        coordinates and its lengths unmeasured; a road end on another road is
        not free (its markings stop there); a road no gate reaches is said;
        the gate's barrier crosses the road at the point the engine published,
        its post on the guardhouse's side; the rack's portals give way to a
        road the engine says passes under the rack, standing either side of it;
      * the road table quotes the engine's totals and the case's headroom,
        access distance and reasons;
      * the exported page carries the Roads section, each table as a
        collapsible section keyed in the registry, a Full screen button and
        the view's drag handle;
      * the panels' pure rules: the sections and their defaults, the fullscreen
        mode, the clamped and the filling view height. */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { buildLayoutExport, EXPORT_IDS } from "../src/case/layoutExport.js";
import {
  clampViewHeight, fillHeight, fullscreenMode, LAYOUT_SECTIONS, VIEW_BOTTOM_CLEAR_PX, VIEW_MIN_PX,
} from "../src/case/layoutPanels.js";
import { roadSummary } from "../src/case/layoutTables.js";
import { layoutScene, rackPortals, RACK_PORTAL_SPACING } from "../src/case/plantLayout.js";
import { LAYOUT_SECTION_KEYS, PANELS } from "../src/state/prefs.js";
import { PIPED } from "./plantLayoutFixture.js";

/** The fixture with a site: a gate west of an entrance road, a ring of two
 *  roads meeting it, one crossing under the rack, and an island road. */
const ROADED: PlantLayout = {
  ...PIPED,
  items: [...PIPED.items,
    { id: "gate", nonProcess: true, kind: "gate", sector: "", shape: "box", orientation: "alongX",
      footprintFrom: "declared", x: -19, y: -63, z: 0, dx: 4, dy: 3, dz: 3,
      source: "author-set", reason: "the entrance" }],
  plot: { margin: 5, marginDeclared: true, marginReason: "fence", xMin: -20, xMax: 120,
    yMin: -70, yMax: 25, plotArea: 13300, footprintArea: 600, footprintShare: 0.045,
    stackedPairs: 0, declaredAreasUnion: 0, declaredAreasOverlap: 0, rule: "r", sectors: [] },
  roadNetwork: { headroom: 5, accessDistance: 15, noTraffic: [1], entrances: ["gate"], roads: 3,
    components: 2, length: 154, pavedArea: 905.5, source: "s", reason: "r",
    accessSource: "author-set", accessReason: "hose reach" },
  roads: [
    { road: "entrance", width: 7, length: 44, component: 0, fromEntrance: true, reason: "in",
      centreline: [[-12, -66], [-12, -22]] },
    { road: "main", width: 6, length: 100, component: 0, fromEntrance: true, reason: "ring",
      centreline: [[-12, -22], [28, -22], [28, 16]] },
    { road: "island", width: 4, length: 10, component: 1, fromEntrance: false, reason: "lost",
      centreline: [[100, 0], [110, 0]] },
  ],
  rackCrossings: [{ road: "main", xMin: 25, xMax: 31, yMin: -4.94, yMax: -1.34, clearance: 6 }],
  access: [{ item: "gate", road: "entrance", distance: 1.5, roadX: -12, roadY: -63 },
           { item: "converter", road: "main", distance: 7.9, roadX: 28, roadY: -6 }],
  findings: [...PIPED.findings,
    { id: "roadDisconnected:island:", kind: "roadDisconnected", a: "island", b: "", value: 0,
      limit: 0, message: "road `island` is not connected" }],
};

describe("the roads in the scene (C90)", () => {
  const scene = layoutScene(ROADED)!;
  it("carries each centre line at grade in three.js coordinates, and the engine's length", () => {
    expect(scene.roads.map((r) => r.road)).toEqual(["entrance", "main", "island"]);
    const main = scene.roads[1]!;
    expect(main.points).toEqual([[-12, 0, 22], [28, 0, 22], [28, 0, -16]]);
    expect(main.length).toBe(100);
  });

  it("an end on another road is not free; an end on no road is", () => {
    const [entrance, main, island] = scene.roads;
    expect([entrance!.freeStart, entrance!.freeEnd]).toEqual([true, false]);
    expect([main!.freeStart, main!.freeEnd]).toEqual([false, true]);
    expect([island!.freeStart, island!.freeEnd]).toEqual([true, true]);
  });

  it("a road no gate reaches is said, in its flag and its tooltip with the finding", () => {
    const island = scene.roads[2]!;
    expect(island.disconnected).toBe(true);
    expect(island.tooltip.join(" ")).toMatch(/no gate reaches it/);
    expect(island.tooltip.join(" ")).toMatch(/FINDING: road `island` is not connected/);
  });

  it("the gate's barrier crosses its road at the published point, post on the guardhouse side", () => {
    expect(scene.barriers).toHaveLength(1);
    const b = scene.barriers[0]!;
    //  The guardhouse stands WEST (x -19) of the road at x -12: the post is
    //  west of the centre line, the arm reaches the far half.
    expect(b.post[0]).toBeCloseTo(-12 - 3.5 - 0.4, 9);
    expect(b.end[0]).toBeCloseTo(-12 + 3.5 - 0.4, 9);
    expect(b.post[2]).toBeCloseTo(63, 9);
    expect(b.end[2]).toBeCloseTo(63, 9);
  });

  it("the gate's tooltip carries its reason, its source and its nearest road", () => {
    const g = scene.solids.find((s) => s.id === "gate")!;
    const t = g.tooltip.join(" | ");
    expect(t).toMatch(/why: the entrance/);
    expect(t).toMatch(/source: author-set/);
    expect(t).toMatch(/nearest road a gate reaches: entrance, 1\.50 m/);
  });

  it("the camera frames the roads too, so the gate is in the first view", () => {
    expect(scene.fitMin[2]).toBeLessThanOrEqual(-16 - 3);
    expect(scene.fitMax[2]).toBeGreaterThanOrEqual(66 + 3.5);
  });

  it("no roads declared: none drawn, no barrier, the rack's portals at their spacing", () => {
    const plain = layoutScene(PIPED)!;
    expect(plain.roads).toEqual([]);
    expect(plain.barriers).toEqual([]);
    expect(plain.rack!.portals[1]! - plain.rack!.portals[0]!).toBeCloseTo(RACK_PORTAL_SPACING, 9);
  });
});

describe("the rack's portals give way to a road under the rack (drawing)", () => {
  it("no portal inside the crossing, one either side of it", () => {
    const p = rackPortals(-3, 67, [{ xMin: 25, xMax: 31 }]);
    expect(p.some((x) => x > 25 - 0.6 + 1e-9 && x < 31 + 0.6 - 1e-9)).toBe(false);
    expect(p).toContain(24.4);
    expect(p).toContain(31.6);
    expect(p[0]).toBe(-3);
    expect(p[p.length - 1]).toBe(67);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
  });
});

describe("the road table (C90)", () => {
  it("quotes the engine's totals and the case's own declarations", () => {
    const v = roadSummary(ROADED)!;
    expect(v.headline).toMatch(/^3 roads, 154 m of centre line, 906 m² paved/);
    expect(v.headline).toMatch(/2 connected networks, reached from gate/);
    expect(v.notes.join(" ")).toMatch(/Headroom 5\.0 m and access within 15\.0 m.*hose reach/);
    expect(v.notes.join(" ")).toMatch(/Closed to traffic: zone 1/);
    expect(v.notes.join(" ")).toMatch(/1 crossing under the pipe rack.*main at x 25\.0 to 31\.0 m/);
    expect(v.rows.map((r) => r.reached)).toEqual(["yes", "yes", "NO gate reaches it"]);
  });
  it("no roads, no table", () => {
    expect(roadSummary(PIPED)).toBeNull();
  });
});

describe("the exported page's sections and controls (C90, C91)", () => {
  const { html } = buildLayoutExport({
    source: "case", caseName: "plant/ammonia02_full_plant", layout: ROADED, ran: null,
    version: null, date: "2026-10-18T12:00:00.000Z",
    viewer: { script: "/* viewer */", threeVersion: "0.170.0", threeLicence: "MIT" },
  });
  it("every section is a <details> keyed in the registry, open as its default says", () => {
    for (const s of LAYOUT_SECTIONS) {
      const m = html.match(new RegExp(`<details class="[^"]*" data-section="${s.id}"`
        + ` data-key="([^"]+)" data-default-collapsed="([01])"( open)?>`));
      expect(m, s.id).not.toBeNull();
      expect(m![1]).toBe(LAYOUT_SECTION_KEYS[s.id]);
      expect(m![2]).toBe(s.defaultCollapsed ? "1" : "0");
      expect(!!m![3]).toBe(!s.defaultCollapsed);
    }
  });
  it("the Roads section carries the engine's headline", () => {
    expect(html).toMatch(/<summary>Roads <span class="dim">· 154 m, 906 m² paved<\/span><\/summary>/);
    expect(html).toContain("3 roads, 154 m of centre line");
  });
  it("a Full screen button and the view's drag handle", () => {
    expect(html).toContain(`id="${EXPORT_IDS.full}"`);
    //  What goes full screen is the stage: the toolbar AND the view, so the
    //  button that leaves full screen is on it.
    const stage = html.slice(html.indexOf(`id="${EXPORT_IDS.stage}"`),
                             html.indexOf(`id="${EXPORT_IDS.resize}"`));
    expect(stage).toContain(`id="${EXPORT_IDS.full}"`);
    expect(stage).toContain(`id="${EXPORT_IDS.view}"`);
    expect(html).toMatch(new RegExp(`id="${EXPORT_IDS.resize}" class="vresize" role="separator"`));
  });
});

describe("the layout panels' rules (C91)", () => {
  it("the legend starts folded, the tables open; every key is the registry's", () => {
    expect(LAYOUT_SECTIONS.map((s) => s.id)).toEqual(
      ["legend", "plot", "roads", "findings", "pipes", "items"]);
    for (const s of LAYOUT_SECTIONS) {
      expect(s.key).toBe(LAYOUT_SECTION_KEYS[s.id]);
      expect(s.defaultCollapsed).toBe(s.id === "legend");
    }
    expect(Object.keys(LAYOUT_SECTION_KEYS).sort())
      .toEqual(LAYOUT_SECTIONS.map((s) => s.id).sort());
  });
  it("the tables panel is folded by default, so the view fills the window", () => {
    expect(PANELS.layoutTables.defaultCollapsed).toBe(true);
    expect(PANELS.layoutTables.collapsedKey).toBeTruthy();
    expect(PANELS.layoutTables.sizeKey).toBeTruthy();
  });
  it("the Fullscreen API where granted, the overlay otherwise -- and never a throw", () => {
    const fn = () => Promise.resolve();
    expect(fullscreenMode({ fullscreenEnabled: true }, { requestFullscreen: fn })).toBe("api");
    expect(fullscreenMode({ fullscreenEnabled: false }, { requestFullscreen: fn })).toBe("overlay");
    expect(fullscreenMode({ fullscreenEnabled: true }, {})).toBe("overlay");
    expect(fullscreenMode(undefined, undefined)).toBe("overlay");
    const hostile = { get fullscreenEnabled(): boolean { throw new Error("blocked"); } };
    expect(fullscreenMode(hostile, { requestFullscreen: fn })).toBe("overlay");
  });
  it("a dragged height is clamped to the window; junk reads as the fallback", () => {
    expect(clampViewHeight(100, 900, 500)).toBe(VIEW_MIN_PX);
    expect(clampViewHeight(5000, 900, 500)).toBe(900 - VIEW_BOTTOM_CLEAR_PX);
    expect(clampViewHeight(600.4, 900, 500)).toBe(600);
    expect(clampViewHeight(NaN, 900, 500)).toBe(500);
    expect(clampViewHeight(600, 100, 500)).toBe(VIEW_MIN_PX);   // a tiny window keeps the floor
  });
  it("the default fills the window below the view's top", () => {
    expect(fillHeight(200, 900)).toBe(900 - 200 - VIEW_BOTTOM_CLEAR_PX);
    expect(fillHeight(850, 900)).toBe(VIEW_MIN_PX);
  });
});
