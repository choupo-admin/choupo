/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  wegsteinMath — the transcription pinned, and the claim the page is BUILT on
  pinned twice.

  WHAT IS WORTH PINNING HERE, and it is not "the formula is the formula".

  (a) THE TRANSCRIPTION.  `wegsteinStep` claims to be `Wegstein::step`
      (src/solver/Wegstein.cpp:49-92) and it is checked against values that
      can be worked out on paper — a slope of 0.9 gives exactly q = -9, a
      first call has no history and returns direct substitution, and both
      degeneracy guards are fired with their own epsilons rather than near
      them.

  (b) THE INVARIANCE, which is the page's central claim.  Re-express either
      variable affinely and every secant slope, every coefficient and the
      whole trajectory must be unchanged to the last bit.  An arm that only
      checked "approximately" would pass a transcription that had quietly
      started dividing by a scale, so these compare EXACTLY where exactness
      is what is being claimed and to 1e-12 where floating point re-associates.

  (c) THE PRICE.  Newton on a linear map lands in one step at any coupling,
      and Wegstein's sweep count must RISE with the coupling.  Both are
      measured rather than asserted, because "n scalar secants are blind to
      coupling" is the sentence the whole page turns on and a page that
      claims it should be able to show it.

  (d) THE WITNESS COULD MOVE UNDER THE TOOL.  `recycleOverrides` writes three
      keys into a shipped tutorial's solverDict; the arms below apply them
      through the REAL `applyScalarOverride` / `applyWordOverride`, which
      throw on a key that has moved or become ambiguous, and read the case
      out of the bundled corpus.

  NOT CHECKED, said plainly: that the toy resembles any plant, that its
  iteration counts predict a real recycle's, and that the engine's own
  Wegstein branch converges in any particular number of sweeps.  The engine
  answers the last one itself, on the page, every time a knob moves.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  DISPLAY_UNITS, EPS_S, EPS_X, RECYCLE_QMAX_DEFAULT, RECYCLE_QMIN_DEFAULT,
  TOY_DEFAULTS, TOY_F_STAR, TOY_T_STAR, WEGSTEIN_WITNESS, WITNESS_SOLVER_DICT,
  driveDirect, driveNewton, driveWegstein, normL2, recycleOverrides,
  recycleResidual, toyEigenvalues, toyG, toySpectralRadius, wegsteinStep,
  type DisplayUnits, type ToyMap,
} from "../src/ui/methods/wegsteinMath.js";
import {
  applyScalarOverride, applyWordOverride, methodCase,
} from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";

const OPTS = { tol: 1e-10, maxIter: 60 };

describe("the transcription of Wegstein::step", () => {
  it("the first call has no history and IS direct substitution", () => {
    const v = wegsteinStep([1, 2], [3, 4], null, -5, 0);
    expect(v.map((e) => e.q)).toEqual([0, 0]);
    expect(v.map((e) => e.next)).toEqual([3, 4]);
    expect(v.map((e) => e.why)).toEqual(["no history", "no history"]);
  });

  it("a slope of 0.9 gives q = -9 exactly, before any clamp", () => {
    //  g(x) = 0.9 x + 0.5 -- the Theory Guide's own worked example.
    const g = (x: number) => 0.9 * x + 0.5;
    const v = wegsteinStep([2], [g(2)], { x: [1], gx: [g(1)] }, -20, 0);
    expect(v[0]!.s).toBeCloseTo(0.9, 14);
    expect(v[0]!.qRaw).toBeCloseTo(-9, 12);
    expect(v[0]!.q).toBeCloseTo(-9, 12);
    expect(v[0]!.why).toBe("secant");
    //  x_next = q x + (1-q) g(x) = -9*2 + 10*2.3 = 5, the fixed point, in one
    //  step -- which is the "miracle case" a linear g gives.
    expect(v[0]!.next).toBeCloseTo(5, 10);
  });

  it("the clamp binds and SAYS it bound", () => {
    const g = (x: number) => 0.9 * x + 0.5;
    const v = wegsteinStep([2], [g(2)], { x: [1], gx: [g(1)] },
      RECYCLE_QMIN_DEFAULT, RECYCLE_QMAX_DEFAULT);
    expect(v[0]!.qRaw).toBeCloseTo(-9, 12);
    expect(v[0]!.q).toBe(-1);
    expect(v[0]!.why).toBe("clamped");
    //  q = -1 is the 50/50 over-relaxation: x_next = -x + 2 g(x).
    expect(v[0]!.next).toBeCloseTo(-2 + 2 * g(2), 12);
  });

  it("a variable that did not move keeps q = 0 instead of dividing by zero", () => {
    const v = wegsteinStep([1], [7], { x: [1 - EPS_X / 2], gx: [3] }, -5, 0);
    expect(v[0]!.s).toBeNull();
    expect(v[0]!.q).toBe(0);
    expect(v[0]!.why).toBe("did not move");
    expect(v[0]!.next).toBe(7);
  });

  it("a slope of one is named, not extrapolated to infinity", () => {
    //  g(x) = x + c is a pure translation: the secant line is parallel to the
    //  diagonal and meets it nowhere, so q = s/(s-1) would be enormous.
    const s = 1 + EPS_S / 2;
    const v = wegsteinStep([2], [2 * s], { x: [1], gx: [s] }, -5, 0);
    expect(v[0]!.s).toBeCloseTo(s, 12);
    expect(v[0]!.qRaw).toBeNull();
    expect(v[0]!.q).toBe(0);
    expect(v[0]!.why).toBe("slope ~ 1");
  });

  it("a positive raw q is clamped away by q_max = 0 (the wrong direction)", () => {
    //  s = 1.5 > 1: not a contraction, q = 3 -- a step AWAY from the image.
    const g = (x: number) => 1.5 * x;
    const v = wegsteinStep([2], [g(2)], { x: [1], gx: [g(1)] }, -5, 0);
    expect(v[0]!.qRaw).toBeCloseTo(3, 12);
    expect(v[0]!.q).toBe(0);
    expect(v[0]!.next).toBe(g(2));      // falls back to direct substitution
  });

  it("each variable is accelerated by its OWN history and no other", () => {
    //  Two variables whose magnitudes differ by six orders and whose slopes
    //  differ; neither coefficient may depend on the other's numbers.
    const both = wegsteinStep(
      [2e-4, 364], [1.8e-4, 350.8],
      { x: [1e-4, 320], gx: [1.1e-4, 318] }, -5, 0);
    const alone0 = wegsteinStep([2e-4], [1.8e-4], { x: [1e-4], gx: [1.1e-4] },
      -5, 0);
    const alone1 = wegsteinStep([364], [350.8], { x: [320], gx: [318] }, -5, 0);
    expect(both[0]!.q).toBe(alone0[0]!.q);
    expect(both[1]!.q).toBe(alone1[0]!.q);
    expect(both[0]!.next).toBe(alone0[0]!.next);
    expect(both[1]!.next).toBe(alone1[0]!.next);
  });
});

describe("the invariance the page is built on", () => {
  const affine = (A: number, B: number) => (v: number) => A * v + B;

  it("the secant slope is unchanged by any affine rescaling of its variable", () => {
    for (const [A, B] of [[3600, 0], [1, -273.15], [1e6, 42]] as const) {
      const f = affine(A, B);
      const plain = wegsteinStep([364], [350.8], { x: [320], gx: [318] },
        -5, 0);
      const scaled = wegsteinStep([f(364)], [f(350.8)],
        { x: [f(320)], gx: [f(318)] }, -5, 0);
      expect(scaled[0]!.s).toBeCloseTo(plain[0]!.s!, 12);
      expect(scaled[0]!.q).toBeCloseTo(plain[0]!.q, 12);
      //  And the UPDATE maps across by the same affine map, so the iterate is
      //  the same state expressed differently -- not a different state.
      expect(scaled[0]!.next).toBeCloseTo(f(plain[0]!.next), 6);
    }
  });

  it("the whole trajectory is identical in all three display unit systems", () => {
    const map: ToyMap = { a: 0.88, b: 0.6, c: 0.08 };
    const runs = DISPLAY_UNITS.map((u: DisplayUnits) =>
      driveWegstein(map, { ...OPTS, qMin: -5, qMax: 0, units: u }));
    const ref = runs[0]!;
    for (const r of runs) {
      expect(r.iterates.length).toBe(ref.iterates.length);
      for (let k = 0; k < r.iterates.length; ++k)
        for (let i = 0; i < 2; ++i)
          //  EXACT: the units never enter the step, so these are the same
          //  floating-point operations in the same order.
          expect(r.iterates[k]!.vars[i]?.q)
            .toBe(ref.iterates[k]!.vars[i]?.q);
    }
  });

  it("the STOPPING NORM is not invariant, which is the other half", () => {
    const map: ToyMap = { a: 0.88, b: 0.6, c: 0.08 };
    const si = driveWegstein(map,
      { ...OPTS, qMin: -5, qMax: 0, units: DISPLAY_UNITS[0]! });
    const hr = driveWegstein(map,
      { ...OPTS, qMin: -5, qMax: 0, units: DISPLAY_UNITS[1]! });
    const k = 2;
    //  Same step, same physical state, and a norm that differs by orders of
    //  magnitude: the flow entry is multiplied by 3600 and the temperature is
    //  not, so the quadrature is a different number.
    expect(si.iterates[k]!.deltaL2Display)
      .toBeCloseTo(si.iterates[k]!.deltaL2, 12);
    expect(hr.iterates[k]!.deltaL2Display)
      .not.toBeCloseTo(hr.iterates[k]!.deltaL2, 6);
  });

  it("normL2 is the plain unscaled Euclidean norm the engine uses", () => {
    expect(normL2([3, 4], [0, 0])).toBeCloseTo(5, 14);
    //  A temperature residual of 1 K swamps a flow residual of 1e-6 kmol/s,
    //  which is the whole of step 8's point.
    expect(normL2([1e-6, 1], [0, 0])).toBeCloseTo(1, 9);
  });
});

describe("the toy map, declared and checked", () => {
  it("the declared fixed point really is one", () => {
    for (const m of [TOY_DEFAULTS, { a: 0.3, b: 0.9, c: 0.2 }] as ToyMap[]) {
      const g = toyG(m, [TOY_F_STAR, TOY_T_STAR]);
      expect(g[0]).toBeCloseTo(TOY_F_STAR, 18);
      expect(g[1]).toBeCloseTo(TOY_T_STAR, 12);
    }
  });

  it("with no coupling the two directions are genuinely independent", () => {
    const m: ToyMap = { a: 0.7, b: 0.4, c: 0 };
    //  Move only the temperature; the flow's image must not budge.
    const base = toyG(m, [TOY_F_STAR, TOY_T_STAR]);
    const moved = toyG(m, [TOY_F_STAR, TOY_T_STAR + 10]);
    expect(moved[0]).toBeCloseTo(base[0], 18);
    expect(moved[1]).not.toBeCloseTo(base[1], 6);
  });

  it("the eigenvalues say when the map stops contracting at all", () => {
    expect(toySpectralRadius({ a: 0.85, b: 0.55, c: 0 })).toBeCloseTo(0.85, 12);
    //  Symmetric 2x2: 0.7 +- sqrt(0.15^2 + c^2).  c = 0.3 puts it over 1.
    const e = toyEigenvalues({ a: 0.85, b: 0.55, c: 0.3 });
    expect(Math.max(e[0], e[1])).toBeCloseTo(0.7 + Math.hypot(0.15, 0.3), 12);
    expect(toySpectralRadius({ a: 0.85, b: 0.55, c: 0.3 })).toBeGreaterThan(1);
  });
});

describe("the price of n scalar secants", () => {
  it("Newton lands in ONE step on the linear toy, at every coupling", () => {
    for (const c of [0, 0.05, 0.1, 0.2, 0.25]) {
      const t = driveNewton({ a: 0.85, b: 0.55, c }, { ...OPTS, qMin: -5, qMax: 0 });
      expect(t.converged).toBe(true);
      //  Two recorded sweeps: the seed, and the point it landed on (which the
      //  loop records, tests and stops at).
      expect(t.iterates.length, `coupling ${c}`).toBe(2);
    }
  });

  it("Wegstein's sweep count RISES with the coupling it cannot see", () => {
    const counts = [0, 0.1, 0.2, 0.25].map((c) =>
      driveWegstein({ a: 0.85, b: 0.55, c },
        { ...OPTS, qMin: -5, qMax: 0 }).iterates.length);
    expect(counts[0]!).toBeLessThan(counts[3]!);
    //  And every step of the way, never a dip: the blindness is monotone in
    //  the thing being hidden from it.
    for (let i = 1; i < counts.length; ++i)
      expect(counts[i]!, `coupling step ${i}`)
        .toBeGreaterThanOrEqual(counts[i - 1]!);
  });

  it("direct substitution is Wegstein with the clamp collapsed onto zero", () => {
    const m: ToyMap = { a: 0.9, b: 0.6, c: 0.05 };
    const a = driveDirect(m, { ...OPTS, qMin: -5, qMax: 0 });
    const b = driveWegstein(m, { ...OPTS, qMin: 0, qMax: 0 });
    expect(a.iterates.length).toBe(b.iterates.length);
    expect(a.iterates.map((i) => i.errScaled))
      .toEqual(b.iterates.map((i) => i.errScaled));
    //  ... and it is strictly slower than letting the clamp reach.
    const accel = driveWegstein(m, { ...OPTS, qMin: -5, qMax: 0 });
    expect(accel.iterates.length).toBeLessThan(a.iterates.length);
  });
});

describe("the engine plane's overrides land on the shipped case", () => {
  const files = tutorialByName(WEGSTEIN_WITNESS)?.files.rawFiles;

  it("the witness is in the bundled corpus and declares the tear", () => {
    expect(files, `${WEGSTEIN_WITNESS} is not bundled`).toBeTruthy();
    expect(files![WITNESS_SOLVER_DICT]).toMatch(/tearStreams\s*\(\s*recycle\s*\)/);
  });

  it("every override applies through the real applier, or throws", () => {
    const body = files![WITNESS_SOLVER_DICT]!;
    for (const o of recycleOverrides(
      { solver: "Wegstein", tol: 1e-7, maxIter: 40 })) {
      const out = "word" in o ? applyWordOverride(body, o)
        : applyScalarOverride(body, o as never);
      expect(out).not.toBe(body);
    }
  });

  it("the word override really selects the accelerator", () => {
    const body = files![WITNESS_SOLVER_DICT]!;
    const ov = recycleOverrides({ solver: "Wegstein", tol: 1e-5, maxIter: 120 });
    const out = applyWordOverride(body, ov[0] as never);
    expect(out).toMatch(/^recycleSolver\s+Wegstein;/m);
  });

  it("methodCase assembles a runnable case with the overrides in it", () => {
    const cf = methodCase(WEGSTEIN_WITNESS,
      recycleOverrides({ solver: "Wegstein", tol: 1e-6, maxIter: 30 }));
    expect(cf).toBeTruthy();
  });
});

describe("reading the engine's own residual curves", () => {
  it("picks the named curve and leaves the others alone", () => {
    const conv = [
      { label: "Energy balance (global)", residuals: [1, 0.1] },
      { label: "Mass balance (global)", residuals: [2, 0.2, 0.02] },
      { label: "reactor", residuals: [9] },
    ];
    expect(recycleResidual(conv, "mass")).toEqual([2, 0.2, 0.02]);
    expect(recycleResidual(conv, "energy")).toEqual([1, 0.1]);
  });

  it("an absent or empty curve is null, never an empty array", () => {
    //  "the run published no curve" and "the curve was flat" are different
    //  facts and the page says different things about them.
    expect(recycleResidual(undefined, "mass")).toBeNull();
    expect(recycleResidual([{ label: "Mass balance (global)", residuals: [] }],
      "mass")).toBeNull();
  });
});
