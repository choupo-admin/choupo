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
  activeSetQpMath — the transcription pinned against the ENGINE'S OWN anchor,
  and the two working-set events pinned as events rather than as an answer.

  WHAT IS WORTH PINNING HERE.

  (a) THE ENGINE'S ANCHOR.  `verifyActiveSetQP` asserts d = (0, 1) with
      multipliers (1, 0, 0) to 1e-9 before every constrained optimisation
      Choupo runs, and throws with "ActiveSetQP is BROKEN" if it cannot.  The
      transcription must reproduce that, and the arm below states the numbers
      literally rather than comparing the code against itself.

  (b) THE EVENTS, which are the page's subject.  An answer can be right while
      the path to it is nonsense, and the path is the only thing the page
      draws.  So the arms require an ADD to happen where a step runs into a
      constraint, and a DROP to happen where a multiplier is negative -- and
      the DROP arm uses the warm start, because the cold start never produces
      one and an event that no test can reach is an event no test covers.

  (c) THE KKT CONDITIONS AT THE ANSWER, checked independently of the route.
      Primal feasibility, dual feasibility and complementary slackness, on
      several problems including ones the knobs can reach.  A solver that
      satisfies its own definition is right whatever path it took.

  (d) THE READER of the engine's written reconciliation.  It parses the dict
      the engine WROTE, so the arm feeds it a real `converged/feed` fragment,
      not a hand-made object.

  NOT CHECKED, said plainly: the SQP outer loop, any problem with more than
  two variables (the pictures are two-dimensional and so is the coverage
  here), and whether the engine's own QP agrees with this transcription on
  anything except the hand-worked anchor -- it publishes no working-set
  sequence, which is exactly why the sequence is recomputed.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  ALKALINITY_SIGMA_DEFAULT_PCT, FEAS_TOL, HAND_WORKED, HAND_WORKED_ANSWER,
  QP_FEED_FILE, QP_STREAM_FILE, QP_WITNESS,
  activeSetQP, alkalinitySigmaOverride, analysisLines, gaussSolve, objective,
  readReconciliation, rowValue,
  type QPProblem,
} from "../src/ui/methods/activeSetQpMath.js";
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { parse } from "../src/dict/parser.js";
import { toJson } from "../src/dict/json.js";

const asJson = (t: string) =>
  toJson(parse(t, { sourceName: "test" })) as { [k: string]: unknown };

describe("the dense solve", () => {
  it("solves a system whose answer is obvious", () => {
    const x = gaussSolve([[2, 0], [0, 4]], [6, 8]);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(3, 12);
    expect(x![1]).toBeCloseTo(2, 12);
  });

  it("pivots rather than dividing by a zero on the diagonal", () => {
    const x = gaussSolve([[0, 1], [1, 0]], [2, 3]);
    expect(x![0]).toBeCloseTo(3, 12);
    expect(x![1]).toBeCloseTo(2, 12);
  });

  it("returns null on a singular matrix instead of nonsense", () => {
    //  Where the engine throws an LICQ diagnostic, this returns null so the
    //  page can report it as the RESULT it is.
    expect(gaussSolve([[1, 2], [2, 4]], [1, 2])).toBeNull();
  });
});

describe("the engine's own anchor", () => {
  it("reproduces the hand-worked solution the engine asserts to 1e-9", () => {
    const t = activeSetQP(HAND_WORKED);
    expect(t.converged).toBe(true);
    expect(t.reason).toBe("KKT satisfied");
    //  Literal, not a comparison against the code's own output.
    expect(t.d[0]).toBeCloseTo(0, 9);
    expect(t.d[1]).toBeCloseTo(1, 9);
    expect(t.lambdaIneq[0]).toBeCloseTo(1, 9);
    expect(t.lambdaIneq[1]).toBeCloseTo(0, 9);
    expect(t.lambdaIneq[2]).toBeCloseTo(0, 9);
    //  ... and the constants the page prints beside it say the same thing.
    expect([...HAND_WORKED_ANSWER.d]).toEqual([0, 1]);
    expect([...HAND_WORKED_ANSWER.lambdaIneq]).toEqual([1, 0, 0]);
  });

  it("ends with row 0 in the working set and the two bounds out of it", () => {
    const t = activeSetQP(HAND_WORKED);
    expect(t.active).toEqual([true, false, false]);
    //  The vertex is DEGENERATE: d1 = 0 sits exactly on its own bound while
    //  that bound's multiplier is zero.  Worth pinning, because a solver that
    //  quietly added row 1 as well would still print the right answer.
    expect(rowValue(HAND_WORKED.Aineq[1]!, HAND_WORKED.bineq[1] ?? 0, t.d))
      .toBeCloseTo(0, 12);
  });

  it("the objective really is lower there than at any feasible neighbour", () => {
    const t = activeSetQP(HAND_WORKED);
    const f = objective(HAND_WORKED, t.d);
    for (const [dx, dy] of
      [[0.05, 0], [0, 0.05], [0, -0.05], [0.03, -0.03]] as const) {
      const p = [(t.d[0] ?? 0) + dx, (t.d[1] ?? 0) + dy];
      const feasible = HAND_WORKED.Aineq.every((a, k) =>
        rowValue(a, HAND_WORKED.bineq[k] ?? 0, p) <= FEAS_TOL);
      if (feasible) expect(objective(HAND_WORKED, p)).toBeGreaterThan(f - 1e-12);
    }
  });
});

describe("the two working-set events, which are what the page draws", () => {
  it("a COLD start ADDs the constraint the first step runs into", () => {
    const t = activeSetQP(HAND_WORKED);
    const add = t.steps.find((s) => s.action === "add");
    expect(add, "no constraint was ever added").toBeTruthy();
    expect(add!.row).toBe(0);                       // the budget line
    //  It stopped SHORT of a full step, at the fraction where that row is
    //  exactly satisfied.
    expect(add!.alpha).toBeGreaterThan(0);
    expect(add!.alpha).toBeLessThan(1);
    expect(rowValue(HAND_WORKED.Aineq[0]!, HAND_WORKED.bineq[0] ?? 0,
      add!.xNext)).toBeCloseTo(0, 10);
  });

  it("a WARM start on both bounds DROPs them, most negative first", () => {
    //  At the origin both bounds are tight and both multipliers come out
    //  negative: -1 on d1 >= 0 and -2 on d2 >= 0, since the objective wants
    //  to increase both.  The method must release the -2 first.
    const t = activeSetQP(HAND_WORKED, [false, true, true]);
    const drops = t.steps.filter((s) => s.action === "drop");
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0]!.row).toBe(2);                  // d2 >= 0, multiplier -2
    expect(Math.min(...drops[0]!.lambda)).toBeLessThan(0);
    //  ... and it still arrives at the same answer, which is the point of a
    //  warm start being allowed to be wrong.
    expect(t.converged).toBe(true);
    expect(t.d[0]).toBeCloseTo(0, 9);
    expect(t.d[1]).toBeCloseTo(1, 9);
  });

  it("the objective never rises along the path", () => {
    for (const warm of [undefined, [false, true, true]]) {
      const t = activeSetQP(HAND_WORKED, warm);
      let prev = Number.POSITIVE_INFINITY;
      for (const s of t.steps) {
        expect(s.f).toBeLessThanOrEqual(prev + 1e-12);
        prev = s.f;
      }
    }
  });

  it("every point on the path is feasible, including the intermediate ones", () => {
    const t = activeSetQP(HAND_WORKED);
    for (const s of t.steps)
      HAND_WORKED.Aineq.forEach((a, k) => {
        expect(rowValue(a, HAND_WORKED.bineq[k] ?? 0, s.xNext),
          `row ${k} violated at iteration ${s.it}`)
          .toBeLessThanOrEqual(1e-9);
      });
  });

  it("a problem whose unconstrained minimum is feasible stops at once", () => {
    //  Nothing binds, so the working set stays empty and the first full step
    //  IS the answer -- the degenerate case a reader reaches by dragging the
    //  minimum inside the region.
    const qp: QPProblem = { ...HAND_WORKED, g: [-0.2, -0.3] };
    const t = activeSetQP(qp);
    expect(t.converged).toBe(true);
    expect(t.active).toEqual([false, false, false]);
    expect(t.d[0]).toBeCloseTo(0.2, 9);
    expect(t.d[1]).toBeCloseTo(0.3, 9);
    expect(t.steps.some((s) => s.action === "add")).toBe(false);
  });
});

describe("the KKT conditions hold at the answer, whatever route was taken", () => {
  const problems: QPProblem[] = [
    HAND_WORKED,
    { ...HAND_WORKED, g: [-3, -0.2] },                       // pushes on d1+d2
    { ...HAND_WORKED, g: [0.5, -2] },                        // pushes on d1>=0
    { ...HAND_WORKED, bineq: [-0.3, 0, 0] },                 // a tight budget
    { ...HAND_WORKED, g: [-3, -3], bineq: [-2.5, 0, 0] },
  ];

  for (const [i, qp] of problems.entries()) {
    it(`problem ${i}: primal feasible, dual feasible, complementary`, () => {
      const t = activeSetQP(qp);
      expect(t.converged, `problem ${i} did not converge`).toBe(true);
      //  Primal feasibility.
      qp.Aineq.forEach((a, k) =>
        expect(rowValue(a, qp.bineq[k] ?? 0, t.d)).toBeLessThanOrEqual(1e-9));
      //  Dual feasibility: no negative multiplier survives.
      for (const l of t.lambdaIneq) expect(l).toBeGreaterThanOrEqual(-1e-9);
      //  Complementary slackness: a slack row has a zero multiplier.
      qp.Aineq.forEach((a, k) => {
        const c = rowValue(a, qp.bineq[k] ?? 0, t.d);
        if (c < -1e-7) expect(t.lambdaIneq[k] ?? 0).toBeCloseTo(0, 9);
      });
      //  Stationarity: B d + g + sum lambda_k a_k = 0.
      for (let r = 0; r < 2; ++r) {
        let s = qp.g[r] ?? 0;
        for (let c = 0; c < 2; ++c) s += (qp.B[r]?.[c] ?? 0) * (t.d[c] ?? 0);
        qp.Aineq.forEach((a, k) =>
          { s += (t.lambdaIneq[k] ?? 0) * (a[r] ?? 0); });
        expect(s, `stationarity row ${r} of problem ${i}`).toBeCloseTo(0, 8);
      }
    });
  }
});

describe("reading the reconciliation the engine wrote", () => {
  //  A fragment of a real `converged/feed`, shortened but structurally
  //  identical: engine output, not a hand-made object.
  const FEED = `
calculated
{
    analysisReconciliation
    {
        method                 weightedLeastSquares;
        objective              0.1883425231;
        workingSetChanges      1;
        maximumCorrectionSigma 3;
        chargeImbalanceBefore  0.7813442487 percent;
        chargeImbalanceAfter   0 percent;

        constraints
        {
            electroneutrality
            {
                meaning    "Sum z_i n_i = 0";
                multiplier 0.3822128484;
                binding    true;
            }
        }

        adjustments
        {
            Cl
            {
                species         Cl;
                reportedValue   7.05158942826e-07 kmol/h;
                adjustedValue   7.10665659721e-07 kmol/h;
                uncertaintyPct  5;
                correctionSigma 0.156183707279;
                constraintResponsible electroneutrality;
                atNonNegativityBound  false;
                causedBy { electroneutrality 0.156183707279; }
            }
        }
    }
}
`;

  it("finds the block, the laws and the rows", () => {
    const r = readReconciliation({ [QP_STREAM_FILE]: FEED }, asJson);
    expect(r).toBeTruthy();
    expect(r!.method).toBe("weightedLeastSquares");
    expect(r!.objective).toBeCloseTo(0.1883425231, 9);
    expect(r!.workingSetChanges).toBe(1);
    expect(r!.maxCorrectionSigma).toBe(3);
    expect(r!.laws).toHaveLength(1);
    expect(r!.laws[0]!.multiplier).toBeCloseTo(0.3822128484, 9);
    expect(r!.laws[0]!.binding).toBe(true);
    expect(r!.rows).toHaveLength(1);
  });

  it("keeps the unit off the numbers rather than reading '7.05e-07 kmol/h' as NaN", () => {
    const r = readReconciliation({ [QP_STREAM_FILE]: FEED }, asJson)!;
    expect(r.rows[0]!.reported).toBeCloseTo(7.05158942826e-7, 18);
    expect(r.rows[0]!.adjusted).toBeCloseTo(7.10665659721e-7, 18);
  });

  it("THE ATTRIBUTION SUMS TO THE CORRECTION, which the engine asserts too", () => {
    const r = readReconciliation({ [QP_STREAM_FILE]: FEED }, asJson)!;
    const row = r.rows[0]!;
    const sum = row.causedBy.reduce((a, c) => a + c.deltaSigma, 0);
    expect(sum).toBeCloseTo(row.correctionSigma, 12);
  });

  it("an absent block is null, never an empty reconciliation", () => {
    //  "the case did not reconcile" and "it reconciled and moved nothing" are
    //  different facts, and the page says different things about them.
    expect(readReconciliation(undefined, asJson)).toBeNull();
    expect(readReconciliation({ [QP_STREAM_FILE]: "T 300 K;\n" }, asJson))
      .toBeNull();
  });

  it("lifts the engine's own console sentences and nothing else", () => {
    const log = [
      "[state] seeded 1 stream(s)",
      "[analysis] stream 'feed': constrained WEIGHTED LEAST SQUARES over 4"
      + " measured quantities, 2 enforced law(s) + non-negativity",
      "    [analysis]     Cl: reported 1.26929 -> adjusted 1.27920 mmol/L",
      "Property package: INLINE",
    ].join("\n");
    const lines = analysisLines(log);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Cl: reported");
    expect(analysisLines(null)).toEqual([]);
  });
});

describe("the engine plane's knob lands on the shipped case", () => {
  const files = tutorialByName(QP_WITNESS)?.files.rawFiles;

  it("the witness is bundled and declares weighted least squares", () => {
    expect(files, `${QP_WITNESS} is not bundled`).toBeTruthy();
    expect(files![QP_FEED_FILE]).toMatch(/method\s+weightedLeastSquares;/);
    expect(files![QP_FEED_FILE])
      .toMatch(/enforce\s*\(\s*electroneutrality\s+elementalConservation\s*\)/);
  });

  it("the knob writes the ALKALINITY row's uncertainty, in per cent", () => {
    const body = files![QP_FEED_FILE]!;
    const out = applyScalarOverride(body,
      alkalinitySigmaOverride(12) [0] as never);
    expect(out).not.toBe(body);
    expect(out).toMatch(/^\s*uncertainty\s+12\s+percent;/m);
    //  Exactly one line moved, and the SECOND line-anchored uncertainty (the
    //  total-hardness row) is untouched -- an occurrence that silently slid
    //  by one would turn a different knob than the label says.
    const before = body.split("\n"), after = out.split("\n");
    const moved = before.filter((l, i) => l !== after[i]);
    expect(moved).toHaveLength(1);
    expect(out).toMatch(/^\s*uncertainty\s+3\s+percent;/m);
  });

  it("the declared unit is CHECKED: a bare fraction refuses", () => {
    const body = files![QP_FEED_FILE]!;
    //  0.05 written as bare SI into a slot that says `percent` would be a
    //  plausible number and wrong by two orders of magnitude.
    expect(() => applyScalarOverride(body, {
      file: QP_FEED_FILE, key: "uncertainty", value: 0.05, unit: "",
      occurrence: 1,
    })).toThrow(/percent/);
  });

  it("the default the page opens on is the value the case declares", () => {
    expect(files![QP_FEED_FILE])
      .toMatch(new RegExp(`^\\s*uncertainty\\s+${ALKALINITY_SIGMA_DEFAULT_PCT}`
        + "\\s+percent;", "m"));
  });

  it("methodCase assembles the case with the knob applied", () => {
    expect(methodCase(QP_WITNESS, alkalinitySigmaOverride(8))).toBeTruthy();
  });
});
