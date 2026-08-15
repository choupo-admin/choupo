// epsilonNtuTool -- the ε-NTU closed forms, the configuration matcher and the
// activation predicate.  Every expected value below is derived INLINE with
// Math.exp from the textbook forms (the engine's own equations, HeatExchanger
// .cpp) -- never by calling the module's helper -- so the module is compared
// against an independent transcription, not against itself.
import { describe, expect, it } from "vitest";

import {
  epsilonNtu, hasEpsilonNtuKpis, matchConfiguration, MATCH_TOL,
} from "../src/ui/methods/EpsilonNtuTool.js";

describe("epsilonNtu -- counter-current: eps = (1-e)/(1-Cr*e), e = exp(-NTU(1-Cr))", () => {
  it("pins four hand values", () => {
    // NTU = 1, Cr = 0.5
    let e = Math.exp(-1 * (1 - 0.5));
    expect(epsilonNtu("counter", 1, 0.5)).toBeCloseTo((1 - e) / (1 - 0.5 * e), 15);
    // NTU = 2, Cr = 0.25
    e = Math.exp(-2 * (1 - 0.25));
    expect(epsilonNtu("counter", 2, 0.25)).toBeCloseTo((1 - e) / (1 - 0.25 * e), 15);
    // NTU = 3, Cr = 0 -- the phase-change limit, 1 - exp(-NTU)
    expect(epsilonNtu("counter", 3, 0)).toBeCloseTo(1 - Math.exp(-3), 15);
    // NTU = 2.4, Cr = 0.8
    e = Math.exp(-2.4 * (1 - 0.8));
    expect(epsilonNtu("counter", 2.4, 0.8)).toBeCloseTo((1 - e) / (1 - 0.8 * e), 15);
  });

  it("takes the Cr -> 1 limit NTU/(1+NTU), on the engine's own 1e-9 band", () => {
    // Exactly balanced streams: the limit form, exact.
    expect(epsilonNtu("counter", 2, 1)).toBe(2 / 3);
    expect(epsilonNtu("counter", 3, 1)).toBe(3 / 4);
    // Inside the engine's |1-Cr| < 1e-9 switch: still the limit form.
    expect(epsilonNtu("counter", 3, 1 - 1e-10)).toBe(3 / 4);
    // Just outside the band: the general form, continuous with the limit.
    // Derive from the same float Cr the call receives -- (1 - Cr) is NOT the
    // literal 1e-6 in IEEE doubles, and near Cr = 1 the cancellation magnifies
    // that representation gap far past the formula's own arithmetic.
    const Cr = 1 - 1e-6;
    const e = Math.exp(-3 * (1 - Cr));
    expect(epsilonNtu("counter", 3, Cr)).toBeCloseTo((1 - e) / (1 - Cr * e), 15);
    expect(epsilonNtu("counter", 3, 1 - 1e-6)).toBeCloseTo(3 / 4, 6);
  });
});

describe("epsilonNtu -- co-current: eps = (1-exp(-NTU(1+Cr)))/(1+Cr)", () => {
  it("pins four hand values", () => {
    expect(epsilonNtu("co", 1, 0.5)).toBeCloseTo((1 - Math.exp(-1.5)) / 1.5, 15);
    expect(epsilonNtu("co", 2, 1)).toBeCloseTo((1 - Math.exp(-4)) / 2, 15);
    expect(epsilonNtu("co", 0.5, 0.25)).toBeCloseTo((1 - Math.exp(-0.625)) / 1.25, 15);
    // Cr = 0: collapses to 1 - exp(-NTU)
    expect(epsilonNtu("co", 4, 0)).toBeCloseTo(1 - Math.exp(-4), 15);
  });
});

describe("epsilonNtu -- 1 shell / 2 tube passes:"
  + " eps = 2/{(1+Cr) + root(1+E)/(1-E)}, E = exp(-NTU*root), root = sqrt(1+Cr^2)", () => {
  it("pins four hand values", () => {
    const shell = (NTU: number, Cr: number) => {
      const root = Math.sqrt(1 + Cr * Cr);
      const E = Math.exp(-NTU * root);
      return 2 / ((1 + Cr) + (root * (1 + E)) / (1 - E));
    };
    expect(epsilonNtu("shell2pass", 1, 0.5)).toBeCloseTo(shell(1, 0.5), 15);
    expect(epsilonNtu("shell2pass", 2, 1)).toBeCloseTo(shell(2, 1), 15);
    expect(epsilonNtu("shell2pass", 3, 0.75)).toBeCloseTo(shell(3, 0.75), 15);
    // Cr = 0: root = 1 and the form telescopes to 1 - exp(-NTU) exactly.
    expect(epsilonNtu("shell2pass", 1.5, 0)).toBeCloseTo(1 - Math.exp(-1.5), 15);
  });

  it("collapses onto the other two at Cr = 0 (the phase-change limit)", () => {
    for (const NTU of [0.5, 2, 5]) {
      const limit = 1 - Math.exp(-NTU);
      expect(epsilonNtu("counter", NTU, 0)).toBeCloseTo(limit, 12);
      expect(epsilonNtu("co", NTU, 0)).toBeCloseTo(limit, 12);
      expect(epsilonNtu("shell2pass", NTU, 0)).toBeCloseTo(limit, 12);
    }
  });
});

describe("matchConfiguration -- the engine's point is the judge", () => {
  // A synthetic KPI set built FROM the counter-current closed form, derived
  // inline: the matcher must confirm counter and reject the other two.
  const NTU = 1.8, Cr = 0.6;
  const e = Math.exp(-NTU * (1 - Cr));
  const epsCounter = (1 - e) / (1 - Cr * e);
  const kpis = { NTU, C_r: Cr, effectiveness: epsCounter, LMTD: 12.3, Q_kW: 45.6 };

  it("confirms counter-current to float precision and rejects co / shell", () => {
    const m = matchConfiguration(kpis);
    expect(m).not.toBeNull();
    expect(m!.confirmed).toEqual(["counter"]);
    const byId = Object.fromEntries(m!.checks.map((c) => [c.id, c]));
    expect(Math.abs(byId["counter"]!.dEps)).toBeLessThan(MATCH_TOL);
    expect(byId["co"]!.matches).toBe(false);
    expect(byId["shell2pass"]!.matches).toBe(false);
    // The rejections are real distances, not tolerance noise.
    expect(Math.abs(byId["co"]!.dEps)).toBeGreaterThan(1e-3);
    expect(Math.abs(byId["shell2pass"]!.dEps)).toBeGreaterThan(1e-3);
    // Three checks, always: the deviations are reported for every
    // configuration whether or not one matched.
    expect(m!.checks).toHaveLength(3);
  });

  it("returns null on a KPI row that cannot feed the tool", () => {
    expect(matchConfiguration(undefined)).toBeNull();
    expect(matchConfiguration({ NTU, effectiveness: epsCounter })).toBeNull();
  });
});

describe("hasEpsilonNtuKpis -- the activation predicate", () => {
  it("activates only on the full finite (NTU, effectiveness, C_r) triple", () => {
    expect(hasEpsilonNtuKpis({ NTU: 2, effectiveness: 0.7, C_r: 0.5 })).toBe(true);
    // Extra KPI keys (the exchanger writes fifteen) never block activation.
    expect(hasEpsilonNtuKpis({
      NTU: 2, effectiveness: 0.7, C_r: 0.5, area: 12, U: 500, LMTD: 20,
    })).toBe(true);
  });

  it("stays honest on partial, absent or non-finite rows", () => {
    expect(hasEpsilonNtuKpis(undefined)).toBe(false);
    expect(hasEpsilonNtuKpis({})).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: 2, effectiveness: 0.7 })).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: 2, C_r: 0.5 })).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: NaN, effectiveness: 0.7, C_r: 0.5 })).toBe(false);
    expect(hasEpsilonNtuKpis({ NTU: 2, effectiveness: Infinity, C_r: 0.5 })).toBe(false);
  });
});
