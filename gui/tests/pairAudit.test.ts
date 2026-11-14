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

// Focused audit-transport tests (design forum #79-5): the typed origin is the
// policy axis, orthogonal to the resolution tier; promotedDespite carries its
// justification to the UI; legacy results without `origin` still classify.
import { describe, it, expect } from "vitest";
import type { PairResolution } from "../src/adapters/SolverAdapter";
import { badgeForTest } from "../src/ui/PairCoverageMatrix";

function pr(over: Partial<PairResolution>): PairResolution {
  return {
    model: "NRTL", i: "a", j: "b", status: "standard",
    source: "data/standards/binaryPairs/NRTL/a-b.dat", provSource: "",
    ...over,
  };
}

describe("pair audit badges (origin orthogonal to tier)", () => {
  it("standard literature stays green", () => {
    const b = badgeForTest(pr({ origin: "literature" }));
    expect(b.flag).toBe("ok");
  });
  it("standard assumed is NOT green", () => {
    const b = badgeForTest(pr({ origin: "assumed" }));
    expect(b.flag).toBe("soft");
    expect(b.label).toBe("assumed");
  });
  it("standard predictive is danger", () => {
    const b = badgeForTest(pr({ origin: "predictive" }));
    expect(b.flag).toBe("danger");
  });
  it("case-local regressed is green", () => {
    const b = badgeForTest(pr({ status: "perNode", origin: "regressed" }));
    expect(b.flag).toBe("ok");
  });
  it("placeholder is danger at any tier", () => {
    expect(badgeForTest(pr({ origin: "placeholder" })).flag).toBe("danger");
    expect(badgeForTest(pr({ status: "perNode", origin: "placeholder" })).flag).toBe("danger");
  });
  it("promotedDespite reaches the consumer with its justification", () => {
    const p = pr({ origin: "regressed",
      promotedDespite: { identifiable: 0, reason: 'accepted: "demo"', by: "vitor", date: "2026-07-10" } });
    expect(p.promotedDespite!.reason).toContain("demo");
    const b = badgeForTest(p);
    expect(b.flag).not.toBe("ok");   // an override never reads as clean
    const local = badgeForTest(pr({ status: "perNode", origin: "regressed",
      promotedDespite: { identifiable: 0, reason: "r", by: "v", date: "d" } }));
    expect(local.flag).not.toBe("ok");   // at ANY tier
  });
  it("legacy result without origin falls back to provSource", () => {
    const b = badgeForTest(pr({ status: "perNode", provSource: "fitted" }));
    expect(b.flag).toBe("ok");
    expect(b.label).toBe("fitted");
  });
});
