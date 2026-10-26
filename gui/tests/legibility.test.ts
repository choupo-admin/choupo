/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
// The one minimum text size and what a zoomed drawing does with a label that
// would fall below it (DEV.md 4c C168 slice 2, ruling (c)).
import { describe, expect, it } from "vitest";

import {
  GROW_MAX, MIN_TEXT_PX, drawingLegibility, grownFontPx, legibilityOf, legibleZoom,
} from "../src/case/legibility.js";

describe("legibility", () => {
  it("is ONE number, 11 CSS px", () => {
    expect(MIN_TEXT_PX).toBe(11);
  });

  it("shows a label rendered at or above the minimum", () => {
    expect(legibilityOf(11, 1, false)).toBe("show");
    expect(legibilityOf(10, 1.1, false)).toBe("show");
    expect(legibilityOf(16, 0.7, false)).toBe("show");
  });

  it("hides a secondary label that would render below it -- never draws it illegibly", () => {
    expect(legibilityOf(10, 1, false)).toBe("hide");
    expect(legibilityOf(12, 0.52, false)).toBe("hide");   // the C172 map, 4.7-6 px
  });

  it("grows a primary label to the minimum, up to GROW_MAX times its size", () => {
    expect(legibilityOf(16, 0.5, true)).toBe("grow");
    expect(grownFontPx(0.5) * 0.5).toBeCloseTo(MIN_TEXT_PX);
    //  past GROW_MAX the names would overlap: hidden like the rest
    const z = MIN_TEXT_PX / (16 * GROW_MAX) * 0.9;
    expect(legibilityOf(16, z, true)).toBe("hide");
  });

  it("the zoom at which a label is shown as declared", () => {
    expect(legibleZoom(11)).toBe(1);
    expect(legibilityOf(10, legibleZoom(10), false)).toBe("show");
  });

  it("a drawing is an overview when any label was grown or hidden", () => {
    expect(drawingLegibility(["show", "show"])).toBe("full");
    expect(drawingLegibility(["show", "grow"])).toBe("overview");
    expect(drawingLegibility(["hide"])).toBe("overview");
    expect(drawingLegibility([])).toBe("full");
  });

  it("text rendered at 200 % browser zoom is the same CSS size -- twice the device pixels", () => {
    //  the floor is in CSS px; browser zoom multiplies CSS px into device px,
    //  so a label held at 11 CSS px is 22 device px at 200 % (WCAG 1.4.4)
    expect(legibilityOf(MIN_TEXT_PX, 1, false)).toBe("show");
  });
});
