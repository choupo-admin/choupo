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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

//  The first law over the plant boundary is the ENGINE's (its energyBalance
//  report stamps `globalEnergyBoundary` on the result).  These arms pin that
//  the GUI DRAWS that block and computes no balance of its own -- the
//  2026-09-05 defect was exactly a GUI-side sum (utility-allocated duties)
//  that missed every cooling duty no utility served and showed 372.5 kW where
//  the engine's ledger closes at 34.4 kW.  Text arms, like caseTree.test.ts:
//  the surfaces are React components and the claim is about their SOURCE.
const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

describe("the GUI draws the engine's globalEnergyBoundary and computes none of its own", () => {
  for (const rel of ["ui/ReportsWorkspace.tsx", "ui/StreamsSummary.tsx", "ui/PlotsWorkspace.tsx"]) {
    it(`${rel} reads globalEnergyBoundary`, () => {
      expect(src(rel)).toMatch(/globalEnergyBoundary/);
    });
    it(`${rel} does not sum duties itself (no unitEnergy / energyBalance call)`, () => {
      expect(src(rel)).not.toMatch(/\bunitEnergy\(/);
      expect(src(rel)).not.toMatch(/\benergyBalance\(/);
    });
  }
  it("balances.ts carries no first-law helper any more", () => {
    const b = src("case/balances.ts");
    expect(b).not.toMatch(/export function energyBalance/);
    expect(b).not.toMatch(/export function unitEnergy/);
  });
  it("the adapter passes the block through under the engine's name", () => {
    const w = src("adapters/WasmAdapter.ts");
    expect(w).toMatch(/globalEnergyBoundary\?: GlobalEnergyBoundary/);
    expect(w).toMatch(/result\.globalEnergyBoundary = globalEnergyBoundary/);
    expect(src("adapters/SolverAdapter.ts")).toMatch(/export interface GlobalEnergyBoundary/);
  });
  it("an absent block is SAID, not replaced by a computation", () => {
    expect(src("ui/ReportsWorkspace.tsx")).toMatch(/did not run/);
    expect(src("ui/StreamsSummary.tsx")).toMatch(/did not run/);
  });
});
