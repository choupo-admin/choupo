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
  Physics held by recomputation (approach to equilibrium, limit
  "two-runs-not-one"): the duty of a DECLARED approach is
  Q = H_out(T_physical, x_shifted) - H_in.  The unshifted run's duty prices
  the unshifted composition, so reading "everything else" from it is wrong.

  The recomputation: an exothermic A <=> B in an ideal gas, constant heat
  capacities, isothermal at T with the feed at T.  The shifted equilibrium
  (Kp at T - dT, the exothermic direction) converts MORE than the true one;
  the duty at the physical T is xi_shifted * dH, not xi_true * dH.  The
  engine's pricing of the outlet at T with the shifted composition is read
  back from the cited source lines.
\*---------------------------------------------------------------------------*/

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APPROACH_LIMITS } from "../src/ui/methods/approachToEquilibriumLesson.js";
import { resolveCite } from "./support/engineCite.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const R = 8.314;
const dH = -50000;            // J/mol, A -> B, constant (equal heat capacities)
const dS = -100;              // J/(mol K)
const Kp = (T: number): number => Math.exp(-(dH - T * dS) / (R * T));
const conversion = (T: number): number => Kp(T) / (1 + Kp(T));   // A <=> B, 1 mol A fed

describe("the duty of a declared approach", () => {
  const T = 500, dT = 30;
  const xiTrue = conversion(T);
  const xiShift = conversion(T - dT);        // exothermic: Kp evaluated at T - dT

  it("the shifted equilibrium converts more, as the engine's direction rule says", () => {
    expect(xiShift).toBeGreaterThan(xiTrue);
  });

  it("Q = H_out(T, x_shifted) - H_in is xi_shifted*dH, and differs from the unshifted run's duty", () => {
    // equal heat capacities: sensible terms cancel, so H_out - H_in = xi * dH at T.
    const qDeclared = xiShift * dH;
    const qUnshiftedRun = xiTrue * dH;
    expect(qDeclared).toBeLessThan(qUnshiftedRun);          // more heat removed
    expect(Math.abs(qDeclared / qUnshiftedRun - 1)).toBeGreaterThan(0.05);
  });
});

describe("the page names what is carried and what is recomputed", () => {
  const body = prose(APPROACH_LIMITS.find((l) => l.id === "two-runs-not-one")!.body);
  it("no longer sends the duty to the unshifted run", () => {
    expect(body).not.toContain("everything else from the unshifted one");
    expect(body).toContain("Q = H_out(T, shifted composition) − H_in");
    expect(body).toContain("recompute the enthalpy and the duty");
  });
  it("cites, by symbol, where the engine prices the outlet at T with the shifted composition", () => {
    // Held by symbol (C415), never by line number: the line-indexed form
    // (an array indexed by line) broke three times on 2026-11-28 (+17, +14/+37, +20).
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const holds = (file: string, contains: string) =>
      resolveCite(root, { file, symbol: file.includes("Gibbs") ? "GibbsReactor::solve" : "EquilibriumReactor::solve", contains });
    const EQ = "src/unitOperations/reactor/EquilibriumReactor.cpp";
    const GB = "src/unitOperations/reactor/GibbsReactor.cpp";
    for (const frag of ["outletState(", "T, P, zout", "priceState(T, P, zout",
                        "Q_W = (H_out - H_in)", "out.T = T", "out.z = zout"]) {
      expect(() => holds(EQ, frag), frag).not.toThrow();
    }
    expect(() => holds(GB, "s.T, s.P, s.z")).not.toThrow();
    expect(() => holds(GB, "kpis_[\"Q_kW\"] = H_out_kW - H_in_kW")).not.toThrow();
    expect(body).toContain("`EquilibriumReactor::solve`");
    expect(body).toContain("`GibbsReactor::solve`");
  });
});
