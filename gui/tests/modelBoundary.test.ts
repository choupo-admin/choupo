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
  Model-boundary <-> edge stream-name matching.  The audit names streams in
  the flattened "sector.stream" form while the canvas edge label may carry
  the bare authored form (or vice versa) -- the badge / selection-card row
  must resolve both, and never leaf-match two DIFFERENT namespaced streams.
\*---------------------------------------------------------------------------*/
import { describe, it, expect } from "vitest";

import { boundaryForStream, boundaryStreamMatches } from "../src/case/modelBoundary.js";

const boundaries = [
  { stream: "cryst2.finalLiquor", refused: false },
  { stream: "feedMix", refused: true },
];

describe("boundaryStreamMatches / boundaryForStream", () => {
  it("matches on the exact name", () => {
    expect(boundaryStreamMatches("feedMix", "feedMix")).toBe(true);
    expect(boundaryForStream(boundaries, "feedMix")).toBe(boundaries[1]);
    expect(boundaryForStream(boundaries, "cryst2.finalLiquor")).toBe(boundaries[0]);
  });

  it("matches a namespaced entry against the bare edge name (and vice versa)", () => {
    // entry "cryst2.finalLiquor" -> edge label "finalLiquor"
    expect(boundaryStreamMatches("cryst2.finalLiquor", "finalLiquor")).toBe(true);
    expect(boundaryForStream(boundaries, "finalLiquor")).toBe(boundaries[0]);
    // bare entry -> namespaced edge label (dot OR slash separator)
    expect(boundaryStreamMatches("feedMix", "sectorA.feedMix")).toBe(true);
    expect(boundaryStreamMatches("feedMix", "sectorA/feedMix")).toBe(true);
  });

  it("does not match unrelated names (no leaf-vs-leaf overreach)", () => {
    expect(boundaryStreamMatches("cryst2.finalLiquor", "liquor")).toBe(false);
    // two DIFFERENT namespaced streams sharing a leaf must NOT match
    expect(boundaryStreamMatches("cryst1.out", "cryst2.out")).toBe(false);
    expect(boundaryForStream(boundaries, "vapourOut")).toBeUndefined();
    expect(boundaryForStream(undefined, "feedMix")).toBeUndefined();
  });
});
