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
    expect(body).toContain("A stirred tank does not CREATE product either");
    expect(body).toContain("SUSTAIN a seed");
    expect(body).toContain("k·C_A0·τ > 1");
  });
});
