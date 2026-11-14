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
  Physics held by recomputation (data reconciliation, step 8): the multipliers
  are lambda = (A C A^T)^-1 r, so balances that share a meter are coupled
  through the off-diagonal terms of A C A^T and r_k = 0 does NOT give
  lambda_k = 0.  Counterexample: two balances, three meters in a line,
  r_1 = 0, r_2 != 0, lambda_1 != 0.  Also checks that x_hat = m - C A^T lambda
  closes both balances, and that all multipliers vanish when all residuals do.

  Balance 1: x1 - x2 = 0.  Balance 2: x2 - x3 = 0.  Unit sigmas; meter 2 is
  shared.  A C A^T = [[2, -1], [-1, 2]].
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { DR_STEPS } from "../src/ui/methods/dataReconciliationLesson.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

function solve(m1: number, m2: number, m3: number) {
  const r1 = m1 - m2, r2 = m2 - m3;
  const M11 = 2, M12 = -1, M22 = 2;                  // A C A^T for unit sigmas
  const det = M11 * M22 - M12 * M12;
  const l1 = (M22 * r1 - M12 * r2) / det;
  const l2 = (-M12 * r1 + M11 * r2) / det;
  // x_hat = m - C A^T lambda; A^T lambda = (l1, -l1 + l2, -l2)
  const x1 = m1 - l1, x2 = m2 - (-l1 + l2), x3 = m3 - (-l2);
  return { r1, r2, M12, l1, l2, x1, x2, x3 };
}

describe("multipliers of coupled balances", () => {
  it("balance 1 closes at the readings (r_1 = 0) yet its multiplier is not zero", () => {
    const s = solve(1, 1, 0);
    expect(s.r1).toBe(0);
    expect(s.r2).toBe(1);
    expect(s.M12).toBe(-1);                          // the off-diagonal coupling
    expect(s.l1).toBeCloseTo(1 / 3, 12);
    expect(s.l2).toBeCloseTo(2 / 3, 12);
  });
  it("the reconciled flows close BOTH balances", () => {
    const s = solve(1, 1, 0);
    expect(s.x1 - s.x2).toBeCloseTo(0, 12);
    expect(s.x2 - s.x3).toBeCloseTo(0, 12);
  });
  it("all multipliers vanish when every residual does", () => {
    const s = solve(2, 2, 2);
    expect(s.l1).toBeCloseTo(0, 14);
    expect(s.l2).toBeCloseTo(0, 14);
  });
});

describe("the page", () => {
  const body = prose(DR_STEPS.find((s) => s.n === 8)!.body);
  it("no longer says a balance that closed would get zero", () => {
    expect(body).not.toContain("fixed by the balance's own residual");
    expect(body).not.toContain("would get zero");
    expect(body).toContain("off-diagonal terms of A C Aᵀ");
    expect(body).toContain("vanish only when every residual does");
    expect(body).toContain("splits exactly into one part per balance");
  });
});
