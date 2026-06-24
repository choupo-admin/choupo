import { describe, expect, it } from "vitest";

import {
  classifyDamping,
  controlMetrics,
  disturbanceWindows,
} from "../src/case/controlMetrics.js";

describe("controlMetrics — IAE / ISE on a known error series", () => {
  it("IAE = ∫|e|dt by trapezoid (constant error 2 over t=0..10 => 20)", () => {
    // PV held 2 below SP=10 => |e| = 2 everywhere; ∫2 dt over [0,10] = 20.
    const t = [0, 2, 4, 6, 8, 10];
    const pv = t.map(() => 8); // e = 8 - 10 = -2
    const m = controlMetrics(t, pv, { reference: 10, bandHalf: 0.5 });
    expect(m.iae).toBeCloseTo(20, 9);
    expect(m.ise).toBeCloseTo(40, 9); // ∫ 4 dt over 10
    expect(m.steadyStateOffset).toBeCloseTo(2, 9); // SP - PV(end) = 10 - 8
  });

  it("a ramp error integrates by trapezoid (e from 0 to 10 over t 0..10 => 50)", () => {
    const t = [0, 5, 10];
    const pv = [0, 5, 10]; // SP = 0 => e = pv; |e| ramps 0..10
    const m = controlMetrics(t, pv, { reference: 0, bandHalf: 0.1 });
    expect(m.iae).toBeCloseTo(50, 9); // area of triangle 10*10/2
  });
});

describe("controlMetrics — overshoot + settling on a step response", () => {
  // A step from PV_before=0 to SP=10 that peaks at 12 (20% overshoot) then
  // settles back to 10.
  const t = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const pv = [0, 6, 10, 12, 11, 10.1, 10, 10, 10];

  it("overshoot% = (PV_peak - SP)/(SP - PV_before)*100 = (12-10)/10*100 = 20", () => {
    const m = controlMetrics(t, pv, { reference: 10, bandHalf: 0.2 }); // ±2%
    expect(m.overshootPct).toBeCloseTo(20, 6);
  });

  it("settling time is the last exit of the ±band when the PV ends inside", () => {
    // band ±0.2 around 10: PV is outside at t=3 (12) and t=4 (11); at t=5
    // (10.1) it is INSIDE (|0.1| <= 0.2) and stays in.  Last exit => t=4.
    const m = controlMetrics(t, pv, { reference: 10, bandHalf: 0.2 });
    expect(m.settlingTime).toBeCloseTo(4, 6);
  });

  it("settling time is null (honest gap) when the PV never settles inside", () => {
    // A trace that ends outside the band: never settled.
    const tt = [0, 1, 2, 3];
    const yy = [0, 5, 8, 8.5]; // ends 1.5 below SP=10, band ±0.2
    const m = controlMetrics(tt, yy, { reference: 10, bandHalf: 0.2 });
    expect(m.settlingTime).toBeNull();
  });

  it("overshoot is null when there is no commanded step (SP == PV_before)", () => {
    const flat = controlMetrics([0, 1, 2], [10, 10, 10], { reference: 10, bandHalf: 0.2 });
    expect(flat.overshootPct).toBeNull();
  });
});

describe("controlMetrics — damping verdict from the peak envelope", () => {
  it("a monotone approach with no overshoot is over/critically-damped", () => {
    const t = [0, 1, 2, 3, 4, 5];
    const pv = [0, 4, 7, 9, 9.9, 10]; // climbs to SP, never overshoots
    const m = controlMetrics(t, pv, { reference: 10, bandHalf: 0.2 });
    expect(["over-damped", "critically-damped"]).toContain(m.dampingVerdict);
  });

  it("a decaying ring is under-damped (decay ratio < 1)", () => {
    // Overshoot peaks +4, -2, +1 around SP=10 -> decaying.
    const t = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const pv = [10, 14, 10, 8, 10, 11, 10, 10, 10];
    const m = controlMetrics(t, pv, { reference: 10, bandHalf: 0.2 });
    expect(m.dampingVerdict).toBe("under-damped");
    expect(m.decayRatio).not.toBeNull();
    expect(m.decayRatio!).toBeLessThan(1);
  });

  it("classifyDamping flags sustained oscillation at decay ratio ~ 1", () => {
    expect(classifyDamping([4, 4], 1.0, 40)).toBe("sustained-oscillation");
  });

  it("classifyDamping flags an unstable (growing) envelope", () => {
    expect(classifyDamping([2, 4], 2.0, 40)).toBe("unstable");
  });
});

describe("controlMetrics — windowed integration (Track vs Reject)", () => {
  it("integrates only inside the window", () => {
    const t = [0, 1, 2, 3, 4];
    const pv = [10, 10, 8, 8, 10]; // error -2 only over t in [2,4]
    // Window [2,4]: |e|=2 over a 2 s span (with the 10 at t=4) -> trapezoid.
    const m = controlMetrics(t, pv, { reference: 10, bandHalf: 0.1, window: [2, 4] });
    // samples in window: t=2 (e=-2), t=3 (e=-2), t=4 (e=0) -> IAE = 2*1 + 1*1 = 3
    expect(m.iae).toBeCloseTo(3, 6);
    expect(m.n).toBe(3);
  });

  it("preValue anchors overshoot for a disturbance (reject) window", () => {
    // Reject: PV sits at SP=350 then dips to 347 then recovers; the "before"
    // for the excursion is the pre-disturbance PV (350 == SP) -> step 0 -> null.
    const t = [700, 720, 740, 760];
    const pv = [350, 347, 349, 350];
    const m = controlMetrics(t, pv, { reference: 350, bandHalf: 7, window: [700, 760], preValue: 350 });
    expect(m.overshootPct).toBeNull(); // no commanded step in a rejection window
    expect(m.peak).toBeCloseTo(3, 6);  // max |e| excursion = 3
  });
});

describe("disturbanceWindows — the schedule -> Track/Reject windows", () => {
  it("each step opens a window to the next; the last runs to tEnd", () => {
    const w = disturbanceWindows(
      [{ time: 0, value: 320 }, { time: 700, value: 305 }, { time: 1300, value: 335 }],
      2000,
    );
    expect(w).toEqual([
      { t0: 0, t1: 700, value: 320 },
      { t0: 700, t1: 1300, value: 305 },
      { t0: 1300, t1: 2000, value: 335 },
    ]);
  });
});
