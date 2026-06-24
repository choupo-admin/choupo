// Tests for the binary-flash geometry module (case/binaryFlash.ts) — the
// graphical flash construction in the operating-line family.  PURE TS: no WASM.
//
// The fixture is a constant-relative-volatility curve y* = αx/(1+(α−1)x), whose
// inverse is exact, so we can check the lever-rule V/F against an INDEPENDENT
// Rachford-Rice solution (the K-value form), the bubble/dew limits (V/F→0/1),
// single-phase detection, and the lever-rule identity.

import { describe, expect, it } from "vitest";

import {
  type EqCurve,
  eqCurveFromTxyCsv,
  yStar, bubbleT, interpAt, invertMonotone,
  envelopeAtFeed, leverVF, flashAtT, flashAtVF,
  isSinglePhaseAtT, leverSegments,
} from "../src/case/binaryFlash.js";

// constant relative volatility α — component[0] is the LIGHT (more volatile)
const ALPHA = 2.5;
const yCRV = (x: number) => (ALPHA * x) / (1 + (ALPHA - 1) * x);

// A bubble-T locus that DESCENDS in x (the light component boils lower): a
// simple affine map from x to T so we can also exercise the (T,P) path.  At x=0
// (pure heavy) T=380 K; at x=1 (pure light) T=350 K.
const T_HEAVY = 380, T_LIGHT = 350;
const Tbub = (x: number) => T_HEAVY + (T_LIGHT - T_HEAVY) * x;

function crvCurve(n = 201): EqCurve {
  const x: number[] = [], yEq: number[] = [], Tb: number[] = [];
  for (let i = 0; i < n; i++) {
    const xi = i / (n - 1);
    x.push(xi); yEq.push(yCRV(xi)); Tb.push(Tbub(xi));
  }
  return { x, yEq, Tbub: Tb, comp: "light" };
}

// Independent Rachford-Rice for a binary at a given K (= y*/x relation).  For a
// constant-α curve the K of the light component at a split is α/(1+(α−1)x_liq)
// — but RR is cleaner solved from the K-values at the SOLUTION.  We instead
// verify the lever rule against the mass balance: z = x*(1−ψ) + y*ψ with
// y = y*(x); given x_liq solve ψ — that IS leverVF.  For a fully independent
// check we solve RR over ψ from K1,K2 and confirm the same split.
function rrBinary(z: number, x: number): number {
  // at liquid x the K of light = y*(x)/x, of heavy = (1−y*(x))/(1−x)
  const y = yCRV(x);
  const K1 = y / x, K2 = (1 - y) / (1 - x);
  // Rachford-Rice:  Σ zi(Ki−1)/(1+ψ(Ki−1)) = 0, here for component 1 & 2
  const f = (psi: number) =>
    (z * (K1 - 1)) / (1 + psi * (K1 - 1)) + ((1 - z) * (K2 - 1)) / (1 + psi * (K2 - 1));
  let a = 0, b = 1, fa = f(1e-9);
  let psi = 0.5;
  for (let it = 0; it < 100; it++) {
    psi = 0.5 * (a + b);
    const fm = f(psi);
    if (Math.abs(fm) < 1e-13) break;
    if ((fa < 0) === (fm < 0)) { a = psi; fa = fm; } else b = psi;
  }
  return psi;
}

describe("interpAt / invertMonotone — the curve sampling backbone", () => {
  const c = crvCurve();
  it("yStar matches the closed-form constant-α curve", () => {
    for (const x of [0.1, 0.3, 0.5, 0.73, 0.9])
      expect(yStar(c, x)).toBeCloseTo(yCRV(x), 4);
  });
  it("bubbleT matches the affine locus and is exact at the ends", () => {
    expect(bubbleT(c, 0)).toBeCloseTo(T_HEAVY, 6);
    expect(bubbleT(c, 1)).toBeCloseTo(T_LIGHT, 6);
    expect(bubbleT(c, 0.5)).toBeCloseTo(Tbub(0.5), 4);
  });
  it("interpAt clamps outside the table range", () => {
    expect(interpAt([0, 1], [10, 20], -5)).toBe(10);
    expect(interpAt([0, 1], [10, 20], 5)).toBe(20);
  });
  it("invertMonotone inverts an ASCENDING relation (y*(x))", () => {
    const x = invertMonotone(c.x, c.yEq, 0.6);
    expect(yCRV(x)).toBeCloseTo(0.6, 4);
  });
  it("invertMonotone inverts a DESCENDING relation (T_bubble(x))", () => {
    const x = invertMonotone(c.x, c.Tbub, 365);   // 365 K is between 350 and 380
    expect(Tbub(x)).toBeCloseTo(365, 3);
  });
});

describe("lever-rule V/F vs an independent Rachford-Rice", () => {
  const c = crvCurve();
  it("matches RR across a range of FEASIBLE liquid splits for a fixed feed", () => {
    const z = 0.5;
    // a feasible two-phase liquid is leaner than z but no leaner than the dew
    // liquid (x_dew = y*⁻¹(z)); below that V/F would exceed 1 (unphysical).
    const xDew = invertMonotone(c.x, c.yEq, z);
    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = xDew + frac * (z - xDew);   // strictly inside (x_dew, z)
      const vfLever = leverVF(c, z, x);
      const vfRR = rrBinary(z, x);
      expect(vfLever).toBeGreaterThan(0);
      expect(vfLever).toBeLessThan(1);
      // 3 dp: leverVF reads the PIECEWISE-LINEAR y*(x) (201 pts), rrBinary the
      // exact closed form — the residual IS the interpolation error, and that it
      // is < 1e-3 confirms the lever rule reproduces Rachford-Rice.
      expect(vfLever).toBeCloseTo(vfRR, 3);
    }
  });
});

describe("flashAtT — the (T,P) spec, V/F as a RESULT", () => {
  const c = crvCurve();
  const z = 0.5;
  const { Tbubble, Tdew } = envelopeAtFeed(c, z);

  it("the feed envelope brackets the flash window (bubble < dew in T-order? light descends)", () => {
    // light component descends in T, so the feed bubble point (boiling locus at z)
    // is BELOW the feed dew point.
    expect(Tbubble).toBeCloseTo(Tbub(z), 4);
    expect(Math.min(Tbubble, Tdew)).toBeLessThan(Math.max(Tbubble, Tdew));
  });

  it("at the bubble point V/F → 0 (all liquid, x = z)", () => {
    const lo = Math.min(Tbubble, Tdew);
    const sol = flashAtT(c, z, lo);
    expect(sol.VF).toBeCloseTo(0, 6);
    expect(sol.xLiq).toBeCloseTo(z, 6);
    expect(sol.regime).toBe("all-liquid");
  });

  it("at the dew point V/F → 1 (all vapour, y = z)", () => {
    const hi = Math.max(Tbubble, Tdew);
    const sol = flashAtT(c, z, hi);
    expect(sol.VF).toBeCloseTo(1, 6);
    expect(sol.yVap).toBeCloseTo(z, 6);
    expect(sol.regime).toBe("all-vapour");
  });

  it("a mid-window temperature gives a genuine two-phase split with 0<V/F<1", () => {
    const Tmid = 0.5 * (Tbubble + Tdew);
    const sol = flashAtT(c, z, Tmid);
    expect(sol.regime).toBe("two-phase");
    expect(sol.VF).toBeGreaterThan(0);
    expect(sol.VF).toBeLessThan(1);
    // x_liq < z < y_vap (the feed lies inside the tie-line chord)
    expect(sol.xLiq).toBeLessThan(z);
    expect(sol.yVap).toBeGreaterThan(z);
    // and the lever rule reproduces V/F from the geometry
    expect(leverVF(c, z, sol.xLiq)).toBeCloseTo(sol.VF, 6);
  });

  it("turning T monotonically increases V/F from 0 to 1 across the window", () => {
    const lo = Math.min(Tbubble, Tdew), hi = Math.max(Tbubble, Tdew);
    let prev = -1;
    for (let k = 0; k <= 10; k++) {
      const T = lo + (hi - lo) * (k / 10);
      const vf = flashAtT(c, z, T).VF;
      expect(vf).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = vf;
    }
  });
});

describe("single-phase detection — the tie-line collapses", () => {
  const c = crvCurve();
  const z = 0.5;
  const { Tbubble, Tdew } = envelopeAtFeed(c, z);
  const lo = Math.min(Tbubble, Tdew), hi = Math.max(Tbubble, Tdew);

  it("below the bubble point is single-phase (subcooled), with a note", () => {
    expect(isSinglePhaseAtT(c, z, lo - 10)).toBe(true);
    const sol = flashAtT(c, z, lo - 10);
    expect(sol.regime).toBe("all-liquid");
    expect(sol.VF).toBe(0);
    expect(sol.note).toBeTruthy();
  });
  it("above the dew point is single-phase (superheated), with a note", () => {
    expect(isSinglePhaseAtT(c, z, hi + 10)).toBe(true);
    const sol = flashAtT(c, z, hi + 10);
    expect(sol.regime).toBe("all-vapour");
    expect(sol.VF).toBe(1);
    expect(sol.note).toBeTruthy();
  });
  it("inside the window is two-phase (NOT single-phase)", () => {
    expect(isSinglePhaseAtT(c, z, 0.5 * (lo + hi))).toBe(false);
  });
});

describe("flashAtVF — the (V/F,P) spec, T as a RESULT", () => {
  const c = crvCurve();
  const z = 0.5;

  it("V/F = 0 returns the bubble point (x = z, T = Tbubble)", () => {
    const sol = flashAtVF(c, z, 0);
    expect(sol.xLiq).toBeCloseTo(z, 6);
    expect(sol.regime).toBe("all-liquid");
    expect(sol.T).toBeCloseTo(envelopeAtFeed(c, z).Tbubble, 4);
  });
  it("V/F = 1 returns the dew point (y = z, T = Tdew)", () => {
    const sol = flashAtVF(c, z, 1);
    expect(sol.yVap).toBeCloseTo(z, 6);
    expect(sol.regime).toBe("all-vapour");
    expect(sol.T).toBeCloseTo(envelopeAtFeed(c, z).Tdew, 4);
  });
  it("a target V/F is RECOVERED by the solve (round-trip)", () => {
    for (const target of [0.2, 0.4, 0.6, 0.8]) {
      const sol = flashAtVF(c, z, target);
      expect(sol.VF).toBeCloseTo(target, 6);
      // and the lever rule on the solved x reproduces the same V/F
      expect(leverVF(c, z, sol.xLiq)).toBeCloseTo(target, 4);
    }
  });
  it("flashAtT and flashAtVF agree (solve T, feed it back, get the same x)", () => {
    const a = flashAtVF(c, z, 0.35);
    const b = flashAtT(c, z, a.T);
    expect(b.VF).toBeCloseTo(0.35, 4);
    expect(b.xLiq).toBeCloseTo(a.xLiq, 4);
  });
});

describe("leverSegments — the lever rule SEEN as geometry", () => {
  const c = crvCurve();
  const z = 0.5;
  it("the two arms reproduce V/F (V/F = liquidArm / total)", () => {
    const sol = flashAtT(c, z, 0.5 * (envelopeAtFeed(c, z).Tbubble + envelopeAtFeed(c, z).Tdew));
    const seg = leverSegments(sol);
    expect(seg.liquidArm).toBeCloseTo(Math.abs(z - sol.xLiq), 12);
    expect(seg.vapourArm).toBeCloseTo(Math.abs(sol.yVap - z), 12);
    expect(seg.vfFromArms).toBeCloseTo(sol.VF, 6);   // the lever-rule identity
  });
});

describe("eqCurveFromTxyCsv — reuse the engine's T-x-y trio, zero physics", () => {
  it("parses the x[c]/T_bubble/y_eq_c columns and drops non-finite rows", () => {
    const csv = [
      "x[ethanol],T_bubble,y_eq_ethanol,liquid_stable",
      "0.0,373.15,0.0,1",
      "0.5,360.0,0.7,1",
      "1.0,351.4,1.0,1",
      "0.25,nan,nan,0",       // an immiscibility flag — must be dropped
    ].join("\n");
    const curve = eqCurveFromTxyCsv(csv);
    expect(curve).not.toBeNull();
    expect(curve!.comp).toBe("ethanol");
    expect(curve!.x).toEqual([0.0, 0.5, 1.0]);     // sorted, nan row dropped
    expect(curve!.yEq).toEqual([0.0, 0.7, 1.0]);
    expect(yStar(curve!, 0.5)).toBeCloseTo(0.7, 6);
  });
  it("returns null for a non-T-x-y CSV", () => {
    expect(eqCurveFromTxyCsv("T,Psat\n300,1e4\n310,2e4")).toBeNull();
  });
});
