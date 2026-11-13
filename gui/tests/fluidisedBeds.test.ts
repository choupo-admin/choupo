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
  fluidisedBeds.test — the `fluidised-beds` EduTool: its arithmetic
  (gui/src/case/fluidisedBeds.ts), its lesson and its page.

  The minimum fluidisation velocity is held to a hand calculation written out
  below; Ergun at the root to the weight line; the terminal velocity to its
  own drag balance in all three regimes; the Geldart classification to four
  points chosen by hand; the pressure-drop line to the force balance on the
  particles; and the three statements of the exercise to the scalings the
  page claims for them.  The engine claims the lesson makes are checked
  against the engine's source by SEARCHED FRAGMENTS, never by line numbers.
  No engine runs here: the page calls none.
\*---------------------------------------------------------------------------*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  G, WEN_YU, archimedes, bedPressureDrop, bubbleBed, cutDiameter, dragCoefficient, dragRegime,
  elutriationTable, ergunGradient, geldartBoundaryD, geldartGroup, idealGasDensity, inputRefusal,
  minimumFluidisation, moriWenOutside, regimeMap, terminalVelocity, weightGradient,
  type BubbleInput, type Gas, type Particle,
} from "../src/case/fluidisedBeds.js";
import { FluidisedBedsTool, parseClasses } from "../src/ui/methods/FluidisedBedsTool.js";
import { FLUID_LIMITS, FLUID_STEPS } from "../src/ui/methods/fluidisedBedsLesson.js";
import { BREAKTHROUGH_STEPS } from "../src/ui/methods/breakthroughLesson.js";
import { LEVENSPIEL_STEPS } from "../src/ui/methods/levenspielLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const gas: Gas = { rhoG: 1.2, mu: 1.8e-5 };
const sand: Particle = { d: 200e-6, rhoP: 2600 };
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const read = (p: string): string => readFileSync(join(SRC, p), "utf-8");

describe("minimum fluidisation", () => {
  it("matches a hand calculation for one bed", () => {
    //  d = 200 µm, rho_p = 2600, rho_g = 1.2, mu = 1.8e-5, eps_mf = 0.42, g = 9.80665:
    //    a = 150 (0.58)^2 1.8e-5 / (0.42^3 (2e-4)^2)  = 306486.88   Pa s/m2
    //    b = 1.75 (0.58) 1.2 / (0.42^3 2e-4)         =  82199.546   Pa s2/m3
    //    W = 0.58 (2598.8) 9.80665                   =  14781.603   Pa/m
    //    u = (-a + sqrt(a^2 + 4 b W)) / (2 b)        =  0.0476209   m/s
    const mf = minimumFluidisation(sand, gas, 0.42);
    const t = ergunGradient(1, sand.d, 0.42, gas);
    expect(t.viscous).toBeCloseTo(306486.88, 1);
    expect(t.inertial).toBeCloseTo(82199.546, 2);
    expect(mf.weight).toBeCloseTo(14781.603, 2);
    expect(mf.u).toBeCloseTo(0.0476209434, 9);
    expect(rel(mf.u, mf.uClosed)).toBeLessThan(1e-12);
    expect(mf.re).toBeCloseTo(0.634946, 5);
  });

  it("puts Ergun on the weight line at the root, to 1e-9", () => {
    for (const [p, eps] of [[sand, 0.42], [{ d: 70e-6, rhoP: 1500 }, 0.45], [{ d: 3e-3, rhoP: 1200 }, 0.4]] as const) {
      const mf = minimumFluidisation(p, gas, eps);
      expect(rel(ergunGradient(mf.u, p.d, eps, gas).total, weightGradient(eps, p, gas))).toBeLessThan(1e-9);
      // the bracket held the root
      expect(mf.u).toBeGreaterThan(mf.bracket[0]);
      expect(mf.u).toBeLessThan(mf.bracket[1]);
    }
  });

  it("carries Wen and Yu's correlation, and its C2 is Ergun at eps = 0.415", () => {
    const wy = minimumFluidisation(sand, gas, 0.42).wenYu;
    const Ar = archimedes(sand, gas);
    expect(Ar).toBeCloseTo(755.12658, 4);
    expect(wy.u).toBeCloseTo(0.0340537862, 9);   // (sqrt(33.7^2 + 0.0408 Ar) - 33.7) mu / (rho_g d)
    expect(Math.cbrt(1.75 * WEN_YU.C2)).toBeCloseTo(0.41486, 5);
    // Ergun at that voidage has the same C2 and a different C1: the fit absorbed a shape
    const e = Math.cbrt(1.75 * WEN_YU.C2);
    expect((150 * (1 - e)) / 3.5).not.toBeCloseTo(WEN_YU.C1, 0);
  });

  it("the pressure drop line is the force balance on the particles", () => {
    //  above u_mf: Delta P A = particle weight less buoyancy = m_p g (1 - rho_g/rho_p),
    //  with m_p = (1 - eps) L A rho_p
    const eps = 0.42, L = 1.3, A = 0.7;
    const mf = minimumFluidisation(sand, gas, eps);
    const mp = (1 - eps) * L * A * sand.rhoP;
    for (const m of [1.0001, 2, 10]) {
      const dp = bedPressureDrop(m * mf.u, sand, gas, eps, L, mf.u);
      expect(rel(dp * A, mp * G * (1 - gas.rhoG / sand.rhoP))).toBeLessThan(1e-12);
    }
    // below u_mf it is Ergun, and it meets the weight line continuously at u_mf
    expect(rel(bedPressureDrop(mf.u, sand, gas, eps, L, mf.u), L * mf.weight)).toBeLessThan(1e-9);
    expect(bedPressureDrop(0.5 * mf.u, sand, gas, eps, L, mf.u)).toBeLessThan(L * mf.weight);
  });

  it("refuses a particle lighter than the gas, or an impossible voidage, by name", () => {
    expect(inputRefusal({ d: 1e-4, rhoP: 1 }, gas, 0.4)).toMatch(/denser than the gas/);
    expect(inputRefusal(sand, gas, 1)).toMatch(/voidage/);
    expect(inputRefusal(sand, gas, 0.4)).toBeNull();
    expect(idealGasDensity(28.96, 293.15, 101325)).toBeCloseTo(1.20390, 4);
  });
});

describe("the terminal velocity", () => {
  it("satisfies the drag balance to 1e-9 in each regime", () => {
    const cases: [Particle, string][] = [
      [{ d: 10e-6, rhoP: 2600 }, "Stokes"],
      [sand, "intermediate"],
      [{ d: 5e-3, rhoP: 2600 }, "Newton"],
    ];
    for (const [p, regime] of cases) {
      const t = terminalVelocity(p, gas);
      expect(t.regime).toBe(regime);
      expect(t.balanceResidual).toBeLessThan(1e-9);
      // the same balance, written without u
      expect(rel(dragCoefficient(t.Re) * t.Re * t.Re, (4 / 3) * archimedes(p, gas))).toBeLessThan(1e-9);
    }
  });

  it("tends to Stokes' law for a small particle and is slower than it otherwise", () => {
    const small = terminalVelocity({ d: 5e-6, rhoP: 2600 }, gas);
    expect(rel(small.u, small.uStokes)).toBeLessThan(1e-2);
    const big = terminalVelocity(sand, gas);
    expect(big.u).toBeLessThan(big.uStokes);
  });

  it("uses the drag law with the engine's switch at Re = 1000", () => {
    expect(dragCoefficient(1000)).toBe(0.44);
    expect(dragCoefficient(1)).toBeCloseTo(24 * 1.15, 12);
    expect(dragRegime(0.1)).toBe("Stokes");
    expect(dragRegime(3e5)).toBe("beyond Newton");
  });
});

describe("Geldart's groups (the page's approximation)", () => {
  it("classifies four hand-picked powders", () => {
    expect(geldartGroup(10, 1.5)).toBe("C");      // 1.5 x 100 = 150 < 1600
    expect(geldartGroup(70, 1.5)).toBe("A");      // 7350 > 1600; 105 < 225
    expect(geldartGroup(300, 2.6)).toBe("B");     // 780 > 225; 234000 < 1e6
    expect(geldartGroup(2000, 1.2)).toBe("D");    // 4.8e6 > 1e6
  });
  it("draws each boundary where the classification changes", () => {
    for (const r of [0.2, 1, 5]) {
      const ab = geldartBoundaryD("AB", r);
      expect(geldartGroup(ab * 0.999, r)).toBe("A");
      expect(geldartGroup(ab * 1.001, r)).toBe("B");
      const bd = geldartBoundaryD("BD", r);
      expect(geldartGroup(bd * 0.999, r)).toBe("B");
      expect(geldartGroup(bd * 1.001, r)).toBe("D");
    }
  });
});

describe("the regime map", () => {
  it("orders the onsets and places the operating velocity", () => {
    const m = regimeMap(sand, gas, 0.42, 0, 0.2);
    expect(m.umb).toBe(m.umf);                    // group B bubbles at u_mf
    expect(m.umf).toBeLessThan(m.uc);
    expect(m.uc).toBeLessThan(m.use);
    expect(m.at).toBe("bubbling");
    expect(m.ratio).toBeCloseTo(0.2 / m.umf, 12);
    const fcc = regimeMap({ d: 70e-6, rhoP: 1500 }, gas, 0.45, 0.15, 0.005);
    expect(fcc.umb).toBeGreaterThan(fcc.umf);     // a group A window without bubbles
    expect(fcc.at).toBe("particulate (no bubbles)");
  });
});

describe("bubbles, expansion and bypass", () => {
  const umf = minimumFluidisation(sand, gas, 0.42).u;
  const b: BubbleInput = { u: 0.3, umf, epsMf: 0.42, Lmf: 1, Dt: 1, orificesPerM2: 1000, Dg: 2e-5, d: sand.d };

  it("conserves the particles: H (1 - delta) = L_mf, and the fixed point closed", () => {
    for (const growth of [true, false]) {
      const r = bubbleBed(b, growth)!;
      expect(rel(r.H * (1 - r.deltaMean), b.Lmf)).toBeLessThan(1e-12);
      expect(r.expansion).toBeGreaterThan(1);
      expect(r.bubbleGasFraction).toBeCloseTo((0.3 - umf) / 0.3, 12);
    }
  });

  it("lets more gas bypass when the bubbles grow than when they are frozen", () => {
    const g = bubbleBed(b, true)!, f = bubbleBed(b, false)!;
    expect(g.profile[g.profile.length - 1]!.db).toBeGreaterThan(g.profile[0]!.db);
    expect(g.bypass).toBeGreaterThan(f.bypass);
    expect(g.bypass).toBeLessThanOrEqual(g.bubbleGasFraction);
  });

  it("has no bubbles at or below u_mf, and flags Mori-Wen's range rather than clipping", () => {
    expect(bubbleBed({ ...b, u: umf }, true)).toBeNull();
    expect(moriWenOutside(b)).toEqual([]);
    expect(moriWenOutside({ ...b, Dt: 5 }).join(" ")).toMatch(/bed diameter/);
  });
});

describe("elutriation", () => {
  it("carries out exactly the classes whose u_t is below u, cut at u_t = u", () => {
    const u = 0.3;
    const dc = cutDiameter(2600, gas, u);
    expect(rel(terminalVelocity({ d: dc, rhoP: 2600 }, gas).u, u)).toBeLessThan(1e-9);
    const t = elutriationTable([{ d_um: dc * 1e6 * 0.9, massPct: 30 }, { d_um: dc * 1e6 * 1.1, massPct: 70 }], 2600, gas, u);
    expect(t.rows.map((r) => r.leaves)).toEqual([true, false]);
    expect(t.leavingPct).toBe(30);
  });
  it("refuses a line it cannot read, by its number", () => {
    expect(parseClasses("20 5\nabc").refused).toMatch(/line 2/);
    expect(parseClasses("20 5\n40 10").classes).toHaveLength(2);
  });
});

describe("the exercise's claims, checked numerically", () => {
  const umf = (d: number, g: Gas = gas): number => minimumFluidisation({ d, rhoP: 2600 }, g, 0.42).u;
  it("doubling d multiplies u_mf by about 4 when fine and about sqrt(2) when coarse, never by 1/2", () => {
    expect(umf(120e-6) / umf(60e-6)).toBeGreaterThan(3.9);
    expect(umf(120e-6) / umf(60e-6)).toBeLessThan(4);
    const coarse = umf(20e-3) / umf(10e-3);
    expect(coarse).toBeGreaterThan(Math.SQRT2);
    expect(coarse).toBeLessThan(1.45);
  });
  it("the pressure drop does not change above u_mf", () => {
    const u0 = umf(sand.d);
    const a = bedPressureDrop(1.01 * u0, sand, gas, 0.42, 1, u0), z = bedPressureDrop(4 * u0, sand, gas, 0.42, 1, u0);
    expect(a).toBe(z);
  });
  it("ten times the gas density barely moves a fine powder's u_mf and cuts a coarse one's", () => {
    const g10: Gas = { rhoG: 12, mu: gas.mu };
    expect(umf(60e-6, g10) / umf(60e-6)).toBeGreaterThan(0.98);
    expect(umf(5e-3, g10) / umf(5e-3)).toBeLessThan(0.4);
  });
});

describe("the lesson", () => {
  it("has six steps numbered without a gap, and names its limits", () => {
    expect(FLUID_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FLUID_LIMITS.map((l) => l.id)).toContain("no-engine");
  });

  it("points at steps that exist on live tools", () => {
    const stepsOf: Record<string, readonly { title: string }[]> = {
      breakthrough: BREAKTHROUGH_STEPS, levenspiel: LEVENSPIEL_STEPS,
    };
    const ptrs = FLUID_STEPS.filter((s) => s.leadsTo);
    expect(ptrs.length).toBe(2);
    for (const s of ptrs) {
      const lt = s.leadsTo!;
      const tool = METHOD_TOOLS.find((t) => t.id === lt.tool);
      expect(tool?.status).toBe("live");
      expect(tool?.label).toContain(lt.toolLabel);
      expect((stepsOf[lt.tool] ?? []).some((st) => st.title.startsWith(lt.stepTitle))).toBe(true);
    }
  });

  it("says what the engine has, and the engine's source agrees (searched fragments)", () => {
    const pfr = read("unitOperations/reactor/PFR.cpp");
    expect(pfr).toContain("150.0 * (1.0 - e) * (1.0 - e) * mu / (e * e * e * h.dp * h.dp)");
    expect(pfr).toContain("1.75 * (1.0 - e) * rho / (e * e * e * h.dp)");
    const pc = read("unitOperations/hydraulics/PneumaticConveyor.cpp");
    expect(pc).toContain("24.0 / Re * (1.0 + 0.15 * std::pow(Re, 0.687))");
    expect(pc).toContain("if (Re < 1000.0)");
    expect(pc).toContain("return 0.44;");
    expect(read("unitOperations/separation/Cyclone.cpp").length).toBeGreaterThan(0);
  });

  it("says the engine has no fluidised bed, and the engine's source agrees", () => {
    //  No source file computes a minimum fluidisation velocity or a bubble
    //  fraction; the only mention of fluidisation in src/ is PSA's statement
    //  that it has none.
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(H|cpp)$/.test(n) && /fluidi[sz]/i.test(readFileSync(p, "utf-8"))) hits.push(p.slice(SRC.length));
      }
    };
    walk(SRC);
    expect(hits).toEqual(["unitOperations/separation/PSA.cpp"]);
    expect(read("unitOperations/separation/PSA.cpp")).toContain("no Ergun dP, velocity, fluidisation");
    expect(FLUID_LIMITS.find((l) => l.id === "no-engine")!.body).toContain("no fluidised-bed model");
  });
});

describe("the page", () => {
  it("renders every step, the engine statement and the exercise", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(FluidisedBedsTool)));
    expect(html).toContain("Choupo&#x27;s engine has no fluidised-bed model");
    for (const s of FLUID_STEPS) expect(html).toContain(s.title.slice(0, 20));
    expect(html).toContain("three statements to refute");
    expect(html).toContain("group B");
  });
});
