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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  C301: the grand composite view says what to read.  Pockets are computed from
  the engine's cascade points (pinch01_four_stream_classic's problemTable.csv).
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { gccPockets } from "../src/case/gccPockets.js";
import { pinchUnits, pinchStatusLine } from "../src/case/pinchUnits.js";
import { GccSvg } from "../src/ui/methods/PinchCompositeTool.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";

// (T*, corrected cascade) of pinch01, top to bottom
const PINCH01 = [
  { T: 413.15, Q: 107.5 }, { T: 408.15, Q: 117.5 }, { T: 383.15, Q: 105 },
  { T: 353.15, Q: 0 }, { T: 323.15, Q: 135 }, { T: 308.15, Q: 52.5 },
  { T: 303.15, Q: 40 },
];

describe("gccPockets", () => {
  it("pinch01: one pocket above the pinch, one below", () => {
    const p = gccPockets(PINCH01);
    expect(p.map((x) => x.side)).toEqual(["above", "below"]);
    const [up, dn] = p as [typeof p[0], typeof p[0]];
    // above: nose 117.5 at 408.15, closed at Q = 107.5; the curve reaches 107.5
    // on the way back at 383.15 + 25 * (2.5 / 12.5) = 388.15
    expect(up.nose).toEqual({ T: 408.15, Q: 117.5 });
    expect(up.closeQ).toBe(107.5);
    expect(up.crossing.T).toBeCloseTo(388.15, 9);
    expect(up.end).toEqual({ T: 413.15, Q: 107.5 });
    // below: nose 135 at 323.15, closed at Q = 40 (the end of the curve);
    // crossing at 353.15 - 30 * 40 / 135
    expect(dn.nose).toEqual({ T: 323.15, Q: 135 });
    expect(dn.closeQ).toBe(40);
    expect(dn.crossing.T).toBeCloseTo(353.15 - 30 * 40 / 135, 9);
    expect(dn.end).toEqual({ T: 303.15, Q: 40 });
    expect(dn.polygon[0]).toEqual(dn.crossing);
    expect(dn.polygon.length).toBe(4);   // crossing, 135, 52.5, 40
  });
  it("a threshold problem (no pinch, zero at the top) has the pocket on one side only", () => {
    const p = gccPockets([
      { T: 500, Q: 0 }, { T: 450, Q: 80 }, { T: 400, Q: 30 }, { T: 350, Q: 60 }, { T: 300, Q: 20 },
    ]);
    // walking down from the zero end: nose 80 (min after it: 30), nose 60 (min 20)
    expect(p.every((x) => x.side === "below")).toBe(true);
    expect(p.length).toBe(2);
    expect(p[0]!.closeQ).toBe(30);
    expect(p[1]!.closeQ).toBe(20);
  });
  it("a curve that never turns back has no pocket", () => {
    expect(gccPockets([{ T: 400, Q: 0 }, { T: 350, Q: 40 }, { T: 300, Q: 90 }])).toEqual([]);
    expect(gccPockets([{ T: 400, Q: 90 }, { T: 350, Q: 40 }, { T: 300, Q: 0 }])).toEqual([]);
    expect(gccPockets([])).toEqual([]);
  });
});

describe("grand composite annotations", () => {
  const u = pinchUnits(DEFAULT_PREFS);
  const gcc = PINCH01.map((p) => ({ T_K: p.T, H_kW: p.Q }));
  const h = renderToStaticMarkup(createElement(GccSvg, { gcc, pinchStars: [353.15], u }));
  it("names the targets, the pinch, the pockets and the regions", () => {
    expect(h).toContain("Q_H,min 108 kW (hot utility)");   // 3 s.f. (C304)
    expect(h).toContain("Q_C,min 40 kW (cold utility)");
    expect(h).toContain("pinch: no heat crosses here");
    expect(h).toContain("T* = 353 K");
    expect(h).toContain("pocket: heat the process exchanges with itself; no utility is placed here");
    expect((h.match(/data-pocket=/g) ?? []).length).toBe(2);
    expect(h).toContain("net heat sink (takes hot utility)");
    expect(h).toContain("net heat source (rejects to cold utility)");
    expect(h).toContain("data-q-zero");
  });
  it("follows the Units menu", () => {
    const m = renderToStaticMarkup(createElement(GccSvg,
      { gcc, pinchStars: [353.15], u: pinchUnits({ temperature: "degC", duty: "MW" }) }));
    expect(m).toContain("Q_H,min 0.107 MW (hot utility)");  // 0.1075 is 0.10749.. in binary
    expect(m).not.toMatch(/\d kW\b/);
  });
  it("the status line follows the significant-figures preference (107.5 -> 108 at 3 s.f.)", () => {
    const s = pinchStatusLine({ streams: [], dTmin: 20, QhMin: 107.5, QcMin: 40, pinchShift: 353.15 }, u);
    expect(s).toContain("targets 108 kW hot / 40 kW cold");
  });
});
