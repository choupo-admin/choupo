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

//  C50 (2026-10-07): drilled into the green-ammonia Converter, the feed showed
//  the converged 151 bar and RAN at the plant's 8 bar recycle seed, because
//  the root 0/ projected into the drilled sub-case counted as the sub-case's
//  own state and so beat the drill's converged feed.
import { describe, expect, it } from "vitest";
import { tutorialByName } from "../src/cases/tutorials.js";
import { applyDrillFeeds } from "../src/case/drillSeed.js";
import { zeroStateText } from "../src/case/toGraph.js";

const CONV = "plant/greenAmmoniaPEQ_baseCase/Converter";
const converged = { F: 30.0, T: 651.06, P: 15092690,
                    molarComposition: { N2: 0.2, H2: 0.6, NH3: 0.15, Ar: 0.05 } };

function zeroOf(files: { rawFiles?: Record<string, string>; extraFiles?: Record<string, string> }, nm: string) {
  return zeroStateText({ ...(files.rawFiles ?? {}), ...(files.extraFiles ?? {}) }, nm);
}

describe("a drilled unit starts from the drill's state, not the parent's seed", () => {
  const t = tutorialByName(CONV);

  it("the registry remembers which 0/ files it projected from the root", () => {
    expect(t).toBeDefined();
    expect(t!.projectedZero).toContain("0/Feed");
    // and the projection IS the plant's seed: 8 bar
    expect(zeroOf(t!.files, "Feed")).toMatch(/P\s+800000 Pa/);
  });

  it("the converged feed replaces the projected seed", () => {
    const out = applyDrillFeeds(t!.files, { Feed: converged }, new Set(t!.projectedZero));
    const text = zeroOf(out, "Feed")!;
    expect(text).not.toMatch(/800000 Pa/);
    expect(text).toMatch(/15092690|1\.509269e\+?0?7|150\.9269 bar/);
    expect(out.rawFiles?.["0/Feed"]).toBeUndefined();
  });

  it("an AUTHORED 0/ still wins over the drill", () => {
    const authored = { ...t!.files, extraFiles: { ...(t!.files.extraFiles ?? {}), "0/Feed": "P 1 bar;" } };
    const out = applyDrillFeeds(authored, { Feed: converged }, new Set<string>());
    expect(zeroOf(out, "Feed")).toBe("P 1 bar;");
  });
});
