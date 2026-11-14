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

// The molality display basis for aqueous speciation (ruled 2026-08-08):
// equilibrium constants are activity-based; molality is the composition
// scale underlying the molal standard state and the electrolyte activity
// models.  Flows stay the canonical closure representation; normalized
// species fractions are banned.  The denominator comes from the DECLARED
// aqueous solvent -- never a GUI-side hard-coded "water".

import { describe, expect, it } from "vitest";

import {
  aqueousMolalityBasis,
  declaredAqueousSolvent,
  molality,
} from "../src/case/speciationMolality.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";
import type { JsonDict } from "../src/dict/index.js";

const stream: StreamResult = {
  name: "liquid", role: "product",
  F: 0.02, T: 313.15, P: 101325,
  composition: { water: 0.9, benzene: 0.05, ethanol: 0.04, CaCO3: 0.01 },
  organicLiquid: { benzene: 0.0008, water: 0.0001 },
  solids: { CaCO3: 0.005 },   // kg/s
  speciation: {
    network: "carbonate", basis: "stoichiometric", pH: 6.1,
    flows: { Ca: 1e-5, HCO3: 2e-5 },
  },
};
const MW = { water: 18.0, CaCO3: 100.0 };

describe("declaredAqueousSolvent", () => {
  it("reads the case's declaration, never assuming the name", () => {
    const tp = { equilibrium: { aqueous: { solvent: "methanol" } } } as unknown as JsonDict;
    expect(declaredAqueousSolvent(tp)).toBe("methanol");
  });
  it("quotes the ENGINE's default (water) when nothing is declared", () => {
    expect(declaredAqueousSolvent(undefined)).toBe("water");
    expect(declaredAqueousSolvent({} as JsonDict)).toBe("water");
  });
});

describe("aqueousMolalityBasis", () => {
  it("builds the denominator from the AQUEOUS share of the declared solvent", () => {
    const b = aqueousMolalityBasis(stream, "water", MW);
    //  overall water 0.02*0.9 = 0.018 kmol/s, minus 0.0001 in the organic
    //  phase; no solid water.  kg/s = 0.0179 * 18.
    expect(b.unavailable).toBeUndefined();
    expect(b.kgPerS).toBeCloseTo((0.018 - 0.0001) * 18.0, 12);
    //  molality: kmol/s over kg/s, x1000 = mol/kg.
    expect(molality(1e-5, b)).toBeCloseTo((1e-5 / b.kgPerS!) * 1000, 12);
  });
  it("refuses WITH THE REASON when the solvent has no molar mass", () => {
    const b = aqueousMolalityBasis(stream, "water", {});
    expect(b.unavailable).toContain("water");
    expect(b.unavailable).toContain("flows instead");
  });
  it("refuses when the aqueous phase holds none of the declared solvent", () => {
    const dry: StreamResult = { ...stream, composition: { benzene: 1 }, organicLiquid: undefined, solids: undefined };
    const b = aqueousMolalityBasis(dry, "water", MW);
    expect(b.unavailable).toContain("water");
  });
});
