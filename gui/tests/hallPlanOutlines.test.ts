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
import { describe, expect, it } from "vitest";

import type { LayoutItem } from "../src/adapters/SolverAdapter.js";
import { hallPlanSvg } from "../src/case/roHallDrawings.js";

const box = (id: string, x: number, extra: Partial<LayoutItem> = {}): LayoutItem => ({
  id, nonProcess: false, kind: "pump", sector: "", shape: "box", orientation: "alongX",
  footprintFrom: "declared", x, y: 0, z: 0, dx: 4, dy: 3, dz: 2, ...extra,
});
const outline = (k: number): LayoutItem => box(`train#${k}@hall`, 19 * (k - 1), {
  kind: "typicalOutline", nonProcess: true, dx: 16, dy: 12, typical: "train", trainIndex: k });

const items = [1, 2, 3].map((k) =>
  box(`P/train${k}`, 19 * (k - 1), k === 1 ? { typical: "train", trainIndex: 1 }
    : { typical: "train", trainIndex: k, repeatOf: "P/train1" }));
const building = { rooms: [{ name: "hall", xMin: -5, xMax: 50, yMin: -8, yMax: 8,
  equipment: items.map((i) => i.id) }] } as never;

describe("C272: the repeated trains are drawn as outlines beside the one detailed train", () => {
  it("with typicalOutlines, train 1 is drawn in full and trains 2..N as labelled dashed outlines", () => {
    const d = hallPlanSvg({ items, building, banks: new Map(), outlines: [outline(2), outline(3)] })!;
    expect(d.svg).toContain('data-item="P/train1"');
    expect(d.svg).not.toContain('data-item="P/train2"');
    expect(d.svg.split("data-outline=").length - 1).toBe(2);
    expect(d.svg).toContain("typical of train 1 (train 2)");
    expect(d.notes.some((n) => n.text.includes("typical of train 1"))).toBe(true);
  });

  it("without outlines (an older result) every item is drawn as before", () => {
    const d = hallPlanSvg({ items, building, banks: new Map() })!;
    for (const k of [1, 2, 3]) expect(d.svg).toContain(`data-item="P/train${k}"`);
    expect(d.svg).not.toContain("data-outline=");
  });
});
