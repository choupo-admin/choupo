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

// The C6 card of the drying page, "Where is the product hot?" (C512): the
// reading helper, and that the witness it runs is bundled and declares the
// opt-in word the engine needs.  No DOM, no engine run.

import { describe, expect, it } from "vitest";

import { tutorialByName } from "../src/cases/tutorials.js";
import { HOT_WITNESS, firstTimeAbove } from "../src/ui/methods/DryingCards.js";

describe("firstTimeAbove", () => {
  it("interpolates the crossing between the two bracketing samples", () => {
    expect(firstTimeAbove([0, 10, 20], [300, 300, 310], 305)).toBeCloseTo(15, 12);
  });
  it("is null when the series never rises above the level", () => {
    expect(firstTimeAbove([0, 10, 20], [300, 300, 300], 301)).toBeNull();
  });
  it("is null on a series that starts above the level (no crossing to read)", () => {
    expect(firstTimeAbove([0, 10], [310, 320], 305)).toBeNull();
  });
});

describe("the witness of the hot-product card", () => {
  const entry = tutorialByName(HOT_WITNESS);
  it("is in the bundled corpus", () => {
    expect(entry).toBeDefined();
  });
  it("declares solidTemperature integrated, the word the engine reads", () => {
    const raw = entry!.files.rawFiles!["system/flowsheetDict"]!;
    expect(raw).toMatch(/^\s*solidTemperature\s+integrated\s*;/m);
  });
});
