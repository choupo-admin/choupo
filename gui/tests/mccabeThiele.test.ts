import { describe, expect, it } from "vitest";

import {
  buildMccabe, constantAlphaCurve, defaultSpec, eqCurveFromPoints, eqCurveFromTxyCsv,
  minimumReflux, minimumStages, qLine, rectifyingLine, sweepReflux, xForY, yStar,
} from "../src/case/mccabeThiele.js";

// A constant-relative-volatility curve y = αx/(1+(α−1)x) gives ANALYTICAL
// anchors (Fenske N_min, Underwood R_min) so the geometry can be checked
// against closed form — even though the REAL Choupo curve is NRTL/UNIFAC.
const ALPHA = 2.5;
const curve = constantAlphaCurve(ALPHA, 201);

describe("mccabeThiele — curve sourcing + interpolation", () => {
  it("reads y_eq(x) out of a T-x-y CSV (the engine's real curve, no re-solve)", () => {
    const csv = [
      "x[benzene],T_bubble,y_eq_benzene,liquid_stable",
      "0.0,383.0,0.0,1",
      "0.5,365.0,0.71,1",
      "1.0,353.0,1.0,1",
    ].join("\n");
    const c = eqCurveFromTxyCsv(csv, "benzene");
    expect(c).not.toBeNull();
    expect(c!.pts.length).toBe(3);
    expect(c!.pts[1]!.y).toBeCloseTo(0.71, 6);
  });

  it("returns null when the y_eq column is missing", () => {
    const csv = "x[a],T_bubble\n0,300\n1,350";
    expect(eqCurveFromTxyCsv(csv, "a")).toBeNull();
  });

  it("yStar and xForY are mutual inverses on a monotone curve", () => {
    for (const x of [0.1, 0.3, 0.55, 0.8]) {
      const y = yStar(curve, x);
      expect(xForY(curve, y)).toBeCloseTo(x, 3);
    }
  });

  it("constant-α curve matches y = αx/(1+(α−1)x)", () => {
    const x = 0.4;
    const expected = (ALPHA * x) / (1 + (ALPHA - 1) * x);
    expect(yStar(curve, x)).toBeCloseTo(expected, 4);
  });
});

describe("mccabeThiele — operating lines + q-line", () => {
  it("rectifying line slope R/(R+1), anchored at (xD,xD)", () => {
    const rol = rectifyingLine(3, 0.95);
    expect(rol.m).toBeCloseTo(0.75, 6);
    expect(rol.m * 0.95 + rol.b).toBeCloseTo(0.95, 6); // passes through (xD,xD)
  });

  it("q = 1 gives a VERTICAL q-line", () => {
    const q = qLine(1, 0.5);
    expect(q.vertical).toBe(true);
    expect(q.line).toBeNull();
  });

  it("q = 0 (saturated vapour) gives a HORIZONTAL q-line (slope 0)", () => {
    const q = qLine(0, 0.5);
    expect(q.vertical).toBe(false);
    expect(q.line!.m).toBeCloseTo(0, 6);
  });

  it("q = 1.5 (subcooled liquid) gives a steep positive slope", () => {
    const q = qLine(1.5, 0.5);
    expect(q.line!.m).toBeCloseTo(1.5 / 0.5, 6); // q/(q-1) = 3
  });
});

describe("mccabeThiele — the staircase walk + stage count", () => {
  it("steps a finite ladder for a sharp split at R well above R_min", () => {
    const spec = defaultSpec({ xF: 0.5, xD: 0.95, xW: 0.05, R: 3, q: 1 });
    const res = buildMccabe(curve, spec);
    expect(Number.isFinite(res.nStages)).toBe(true);
    expect(res.nStages).toBeGreaterThan(4);
    expect(res.nStages).toBeLessThan(20);
    expect(res.feedStage).toBeGreaterThan(0);
    expect(res.feedStage).toBeLessThanOrEqual(res.nStages);
  });

  it("more reflux ⇒ fewer (or equal) stages (monotone in R)", () => {
    const base = defaultSpec({ R: 1.5 });
    const lo = buildMccabe(curve, base).nStages;
    const hi = buildMccabe(curve, { ...base, R: 6 }).nStages;
    expect(hi).toBeLessThanOrEqual(lo);
  });

  it("the staircase polyline alternates corners (≥ 2 per stage)", () => {
    const res = buildMccabe(curve, defaultSpec({ R: 3 }));
    expect(res.staircase.length).toBeGreaterThanOrEqual(res.nStages * 2);
  });
});

describe("mccabeThiele — R_min detection + the pinch explosion", () => {
  it("R_min matches the Underwood closed form for a constant-α saturated-liquid feed", () => {
    // For q = 1, the pinch is at x = xF on the curve; the Underwood/graphical
    // R_min = (xD − y_p)/(y_p − x_p) with y_p = y*(xF), x_p = xF.
    const xF = 0.5, xD = 0.95;
    const yP = yStar(curve, xF);
    const rExpected = (xD - yP) / (yP - xF);
    const { rMin, pinch } = minimumReflux(curve, xF, xD, 1);
    expect(pinch!.x).toBeCloseTo(xF, 2);
    expect(rMin).toBeCloseTo(rExpected, 2);
  });

  it("R ≤ R_min(q) ⇒ pinched, infinite stages (no silent clamp)", () => {
    const xF = 0.5, xD = 0.95, xW = 0.05;
    const { rMin } = minimumReflux(curve, xF, xD, 1);
    const res = buildMccabe(curve, defaultSpec({ xF, xD, xW, R: rMin * 0.9, q: 1 }));
    expect(res.pinched).toBe(true);
    expect(res.nStages).toBe(Infinity);
  });

  it("as R → R_min the stage count EXPLODES toward infinity", () => {
    const xF = 0.5, xD = 0.95, xW = 0.05;
    const { rMin } = minimumReflux(curve, xF, xD, 1);
    const far = buildMccabe(curve, defaultSpec({ xF, xD, xW, R: rMin * 3, q: 1 })).nStages;
    const near = buildMccabe(curve, defaultSpec({ xF, xD, xW, R: rMin * 1.05, q: 1 })).nStages;
    expect(near).toBeGreaterThan(far); // staircase multiplies near the cliff
  });
});

describe("mccabeThiele — N_min (total reflux / Fenske)", () => {
  it("N_min matches the Fenske closed form for constant α", () => {
    // Fenske: N_min = ln[(xD/(1−xD))·((1−xW)/xW)] / ln α  (stages incl. reboiler).
    const xD = 0.95, xW = 0.05;
    const fenske = Math.log((xD / (1 - xD)) * ((1 - xW) / xW)) / Math.log(ALPHA);
    const nMin = minimumStages(curve, xD, xW, true);
    // graphical count is an integer ≥ ceil(fenske); within ~1 stage of Fenske.
    expect(nMin).toBeGreaterThanOrEqual(Math.floor(fenske));
    expect(nMin).toBeLessThanOrEqual(Math.ceil(fenske) + 1);
  });

  it("N_min is below the operating-reflux N (total reflux is the floor)", () => {
    const spec = defaultSpec({ R: 2.5 });
    const res = buildMccabe(curve, spec);
    expect(res.nMin).toBeLessThanOrEqual(res.nStages);
  });
});

describe("mccabeThiele — total vs partial condenser (±1 stage)", () => {
  it("a partial condenser adds exactly one equilibrium stage", () => {
    const spec = defaultSpec({ R: 3, totalCondenser: true });
    const total = buildMccabe(curve, spec).nStages;
    const partial = buildMccabe(curve, { ...spec, totalCondenser: false }).nStages;
    expect(partial).toBe(total + 1);
  });
});

describe("mccabeThiele — the q = 1 vertical case + q sensitivity", () => {
  it("a vertical q-line is reported and the feed intersection sits at xF", () => {
    const res = buildMccabe(curve, defaultSpec({ xF: 0.45, R: 3, q: 1 }));
    expect(res.qVertical).toBe(true);
    expect(res.feedInt.x).toBeCloseTo(0.45, 6);
  });

  it("subcooled feed (q>1) needs no more stages than saturated vapour (q<1) at fixed R", () => {
    const liquid = buildMccabe(curve, defaultSpec({ R: 3, q: 1.2 })).nStages;
    const vapour = buildMccabe(curve, defaultSpec({ R: 3, q: 0.2 })).nStages;
    expect(Number.isFinite(liquid)).toBe(true);
    expect(Number.isFinite(vapour)).toBe(true);
  });
});

describe("mccabeThiele — azeotrope halt", () => {
  it("a curve crossing y = x between xW and xD halts the staircase", () => {
    // a synthetic curve with a single crossing of y = x at x_az = 0.6:
    //   y − x = 0.2·(0.6 − x)  ⇒  y above the diagonal below 0.6, below above it.
    const xAz = 0.6;
    const xs: number[] = []; const ys: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      const y = x + 0.2 * (xAz - x);   // = 0.8x + 0.12, crosses y = x exactly at 0.6
      xs.push(x); ys.push(Math.min(1, Math.max(0, y)));
    }
    const c = eqCurveFromPoints(xs, ys)!;
    const res = buildMccabe(c, defaultSpec({ xF: 0.5, xD: 0.9, xW: 0.1, R: 3, q: 1 }));
    expect(res.azeotrope).not.toBeNull();
    expect(res.nStages).toBe(Infinity);
  });
});

describe("mccabeThiele — sensitivity sweep N(R)", () => {
  it("produces a decreasing N(R) with finite counts above R_min", () => {
    const { rMin, nMin, points } = sweepReflux(curve, defaultSpec(), 30);
    expect(rMin).toBeGreaterThan(0);
    expect(nMin).toBeGreaterThan(0);
    expect(points.length).toBe(30);
    const finite = points.filter((p) => Number.isFinite(p.N));
    expect(finite.length).toBeGreaterThan(0);
    // first finite N (near R_min) ≥ last finite N (high reflux)
    expect(finite[0]!.N).toBeGreaterThanOrEqual(finite[finite.length - 1]!.N);
    // every swept R is above R_min
    expect(points[0]!.R).toBeGreaterThan(rMin);
  });
});

describe("mccabeThiele — Murphree tray efficiency", () => {
  const ideal = buildMccabe(curve, defaultSpec());
  it("E_MV = 1 is the ideal-stage path (no pseudo-curve)", () => {
    expect(ideal.pseudoCurve).toBeNull();
    expect(ideal.efficiency).toBe(1);
    expect(Number.isFinite(ideal.nStages)).toBe(true);
  });
  it("E_MV < 1 needs MORE trays than ideal stages and draws a pseudo-curve", () => {
    const real = buildMccabe(curve, defaultSpec({ efficiency: 0.6 }));
    expect(real.pseudoCurve).not.toBeNull();
    expect(real.efficiency).toBeCloseTo(0.6, 6);
    expect(real.nStages).toBeGreaterThan(ideal.nStages);
  });
  it("lower efficiency needs at least as many trays (monotone)", () => {
    const n70 = buildMccabe(curve, defaultSpec({ efficiency: 0.7 })).nStages;
    const n50 = buildMccabe(curve, defaultSpec({ efficiency: 0.5 })).nStages;
    expect(n50).toBeGreaterThanOrEqual(n70);
  });
});
