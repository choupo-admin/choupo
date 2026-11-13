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
  Physics held by recomputation (reaction-enthalpy, step 4): ONE example,
  closed by TWO paths, from the witness's own heat-capacity polynomials and
  its golden.  Path 1: reactants cooled to 298.15 K, reaction at 298.15 K,
  products heated to the reactor temperature.  Path 2: the reaction enthalpy
  at the reactor temperature (the golden).  They must agree to the precision
  of the inputs, and the numbers the page prints must be those.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ENTHALPY_STEPS } from "../src/ui/methods/reactionEnthalpyLesson.js";
import { ENTHALPY_WITNESS, NH3_PER_REACTION } from "../src/ui/methods/ReactionEnthalpyTool.js";

const file = (rel: string): string =>
  readFileSync(new URL(`../../tutorials/${ENTHALPY_WITNESS}/${rel}`, import.meta.url), "utf-8");
const GOLDEN = file("expected");
const golden = (key: string): number => {
  const row = GOLDEN.split("\n").find((l) => l.split(/\s+/)[2] === key);
  if (!row) throw new Error(`no golden row ${key}`);
  return Number(row.split(/\s+/)[3]);
};
const cpCoefficients = (name: string): number[] => {
  const m = file(`constant/components/${name}.dat`)
    .match(/idealGasHeatCapacity[\s\S]*?coefficients\s*\(([^)]*)\)/);
  if (!m) throw new Error(`no cp polynomial for ${name}`);
  return (m[1] ?? "").trim().split(/\s+/).map(Number);
};
/** Integral of a + bT + cT^2 + dT^3 from T0 to T1, J/mol. */
const integral = (c: number[], T0: number, T1: number): number =>
  c.reduce((s, ci, i) => s + ci * (T1 ** (i + 1) - T0 ** (i + 1)) / (i + 1), 0);

const T0 = 298.15;
const sensible = (T: number) => {
  const n2 = cpCoefficients("N2"), h2 = cpCoefficients("H2"), nh3 = cpCoefficients("NH3");
  // per mole of NH3: 1/2 N2 + 3/2 H2 -> NH3
  const reactants = (0.5 * integral(n2, T0, T) + 1.5 * integral(h2, T0, T)) / 1000;
  const products = integral(nh3, T0, T) / 1000;
  return { reactants, products };
};
const perNH3 = (T: number) => golden(`haberBosch_T${Math.floor(T)}K_dH_kJ_mol`) / NH3_PER_REACTION;
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

describe("reaction enthalpy, step 4: two paths, one duty", () => {
  it("path 1 (298.15 K datum plus sensible terms) equals path 2 (reaction enthalpy at T)", () => {
    for (const T of [773.15, 700, 500]) {
      const { reactants, products } = sensible(T);
      const path1 = -reactants + perNH3(298.15) + products;
      const path2 = perNH3(T);
      expect(Math.abs(path1 - path2)).toBeLessThan(0.02);   // kJ/mol: the inputs' precision
    }
  });

  it("the numbers the page prints are those", () => {
    const { reactants, products } = sensible(773.15);
    expect(reactants).toBeCloseTo(27.98, 1);
    expect(products).toBeCloseTo(20.48, 1);
    expect(products - reactants).toBeCloseTo(perNH3(773.15) - perNH3(298.15), 1);
    expect(perNH3(773.15) - perNH3(298.15)).toBeCloseTo(-7.50, 2);
    expect(100 * (1 - perNH3(298.15) / perNH3(773.15))).toBeCloseTo(14.0, 1);
    // the adiabatic-rise example: the error of the 298 value at T_in = 400 K
    expect(-perNH3(400)).toBeCloseTo(48.07, 1);
    expect(100 * (1 - perNH3(298.15) / perNH3(400))).toBeCloseTo(4.4, 1);
    const body = prose(ENTHALPY_STEPS.find((s) => s.n === 4)!.body);
    for (const txt of ["27.98", "20.48", "−53.44", "−7.50", "14 %", "48.07", "4 %"]) {
      expect(body).toContain(txt);
    }
  });

  it("no longer claims the 14 % carries to the steam or the adiabatic rise", () => {
    const body = prose(ENTHALPY_STEPS.find((s) => s.n === 4)!.body);
    expect(body).not.toContain("by the same 14 %");
    expect(body).not.toContain("in the same proportion");
  });
});
