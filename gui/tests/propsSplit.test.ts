/*---------------------------------------------------------------------------*\
  propsSplit -- the map / details split of a props case's Results (DEV.md 4c
  C153).  Vitor: "o painel que fica por baixo nao e ajustavel".  The map is a
  TOP panel of the panel contract, its height a reader preference, folding it
  "figures full height", and a selection made while the details pane is too
  short opens it -- render-only, never shrinking a pane the reader made
  large.  Pure helpers, plus a source arm on the screen that uses them.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import {
  autoMapPx, detailsUsablePx, DETAILS_FLOOR_PX, DETAILS_USABLE_PX, MAP_LEGEND_PX, openDetailsCap,
} from "../src/ui/propsSplit.js";
import { PROPS_MAP_PANEL, shownTopPanelPx } from "../src/ui/panelContract.js";
import { PANELS } from "../src/state/prefs.js";

const spec = PROPS_MAP_PANEL.prefs.size;

describe("the map's height before the reader drags it is C151's", () => {
  it("the computed map height plus its legend, bounded as C151 bounded it", () => {
    expect(autoMapPx(0, false)).toBe(300 + MAP_LEGEND_PX);         // floor
    expect(autoMapPx(500, false)).toBe(90 + 310 + MAP_LEGEND_PX);  // 90 + 0.62 x 500
    expect(autoMapPx(5000, false)).toBe(560 + MAP_LEGEND_PX);      // ceiling
    expect(autoMapPx(5000, true)).toBe(340 + MAP_LEGEND_PX);       // a phone
  });

  it("is inside the panel's own range, so the contract never clamps it", () => {
    for (const h of [0, 400, 5000])
      for (const n of [false, true]) {
        expect(autoMapPx(h, n)).toBeGreaterThanOrEqual(spec.min);
        expect(autoMapPx(h, n)).toBeLessThanOrEqual(spec.max);
      }
  });
});

describe("the panel is the contract's, with its own keys", () => {
  it("a top panel registered under propsMap, with a size and a fold", () => {
    expect(PROPS_MAP_PANEL.edge).toBe("top");
    expect(PROPS_MAP_PANEL.prefs).toBe(PANELS.propsMap);
    expect(PANELS.propsMap.sizeKey).toBeTruthy();
    expect(PANELS.propsMap.collapsedKey).toBeTruthy();
  });

  it("dragged to its maximum, the map still leaves the details' header row", () => {
    const host = 700;
    expect(host - shownTopPanelPx(spec.max, 0, host, DETAILS_FLOOR_PX, spec)).toBe(DETAILS_FLOOR_PX);
  });
});

describe("a selection opens a details pane too short to show it", () => {
  it("a pane dragged down to its header row is opened to a usable height", () => {
    const host = 800;
    const shown = host - DETAILS_FLOOR_PX;
    const cap = openDetailsCap(host, shown, spec);
    expect(cap).toBe(host - DETAILS_USABLE_PX);
    expect(host - cap!).toBe(DETAILS_USABLE_PX);
  });

  it("NEVER shrinks a pane the reader made large: no cap once it is usable", () => {
    expect(openDetailsCap(800, 800 - DETAILS_USABLE_PX, spec)).toBeNull();
    expect(openDetailsCap(800, 300, spec)).toBeNull();
  });

  it("never draws the map below its own minimum", () => {
    const cap = openDetailsCap(320, 320 - DETAILS_FLOOR_PX, spec);
    expect(cap).toBe(spec.min);
  });

  it("on a short screen the usable height is half the split, so the map is not pushed out", () => {
    expect(detailsUsablePx(400)).toBe(200);
    expect(detailsUsablePx(2000)).toBe(DETAILS_USABLE_PX);
  });

  it("an unmeasured split (no layout yet) asks for nothing", () => {
    expect(openDetailsCap(0, 0, spec)).toBeNull();
    expect(openDetailsCap(Number.NaN, 400, spec)).toBeNull();
  });

  it("a map already at its minimum is left alone", () => {
    expect(openDetailsCap(300, spec.min, spec)).toBeNull();
  });
});

describe("the screen uses the split, and the affordance writes no preference", () => {
  const src = readFileSync(resolve(__dirname, "../src/ui/ReviewScreen.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("the map is the contract's panel, with NO seam to drag (DEV.md 4c C172), and 'figures full height' is its fold", () => {
    expect(src).toContain("usePanel(PROPS_MAP_PANEL");
    expect(src).not.toContain("<PanelResizeHandle");
    expect(src).not.toContain("savePanelSize");
    expect(src).not.toContain("loadPanelSize");
    expect(src).toMatch(/data-review="figures-full-height"[\s\S]{0,200}onClick=\{mapPanel\.toggle\}/);
  });

  it("the cap is render-only: the effect that opens the pane never saves a size", () => {
    const eff = src.slice(src.indexOf("const lastSelected"), src.indexOf("const selLink"));
    expect(eff).toContain("openDetailsCap(");
    expect(eff).toContain("setMapCap(");
    expect(eff).not.toContain("savePanelSize");
  });

  it("no second copy of C151's map-height rule", () => {
    expect(src).not.toMatch(/90 \+ map\.height/);
  });
});
