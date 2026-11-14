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
  Physics held by recomputation (Levenspiel, step 4): a stirred tank with
  r = k C_A C_P and NO product in the feed or the initial charge.  Mixing does
  not create product: C_P = 0 is always a steady state.  A reacting steady
  state C_P* = C_A0 - 1/(k tau) exists beside it only when k C_A0 tau > 1, and
  is reached only from a seed.  Constant density, A -> P, C_A + C_P = C_A0.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { LEVENSPIEL_STEPS } from "../src/ui/methods/levenspielLesson.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

/** RK4 for dC_P/dt = -C_P/tau + k (C_A0 - C_P) C_P, to t = tEnd. */
function integrate(CP0: number, k: number, CA0: number, tau: number, tEnd: number): number {
  const f = (c: number): number => -c / tau + k * (CA0 - c) * c;
  const h = tau / 200;
  let c = CP0;
  for (let t = 0; t < tEnd; t += h) {
    const a = f(c), b = f(c + 0.5 * h * a), d = f(c + 0.5 * h * b), e = f(c + h * d);
    c += (h / 6) * (a + 2 * b + 2 * d + e);
  }
  return c;
}

describe("autocatalytic CSTR: existence of a steady state versus start-up", () => {
  const CA0 = 2, tau = 10;
  it("from no product, none ever appears (washout is a steady state), even if k C_A0 tau > 1", () => {
    const k = 1.0;                                   // k C_A0 tau = 20 > 1
    expect(k * CA0 * tau).toBeGreaterThan(1);
    expect(integrate(0, k, CA0, tau, 50 * tau)).toBe(0);
  });
  it("from a small seed it reaches C_P* = C_A0 - 1/(k tau) when k C_A0 tau > 1", () => {
    const k = 1.0;
    const CPstar = CA0 - 1 / (k * tau);
    expect(integrate(1e-6, k, CA0, tau, 100 * tau)).toBeCloseTo(CPstar, 6);
  });
  it("the same seed washes out when k C_A0 tau < 1", () => {
    const k = 0.04;                                  // k C_A0 tau = 0.8
    expect(k * CA0 * tau).toBeLessThan(1);
    expect(integrate(0.5, k, CA0, tau, 100 * tau)).toBeLessThan(1e-9);
  });
});

describe("the page says it", () => {
  const body = prose(LEVENSPIEL_STEPS.find((s) => s.n === 4)!.body);
  it("no longer says the tank provides a seed by construction", () => {
    expect(body).not.toContain("which a stirred tank provides by construction");
    expect(body).toContain("A stirred tank does not create product either");
    expect(body).toContain("sustain a seed");
    expect(body).toContain("k·C_A0·τ > 1");
  });
});
