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
  The absorption lesson.  The arithmetic claims are RECOMPUTED here, not
  quoted: a step that asserted "A < 1 pinches" while the closed form said
  otherwise would be a page teaching against its own engine.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { KREMSER_LIMITS, KREMSER_STEPS } from "../src/ui/methods/kremserLesson.js";
import { kremserRecovery } from "../src/ui/methods/KremserTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/KremserTool.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

describe("the lesson runs end to end", () => {
  it("has four steps, numbered without a gap", () => {
    expect(KREMSER_STEPS).toHaveLength(4);
    expect(KREMSER_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });

  it("ties the construction back to the two before it", () => {
    //  Flash -> McCabe -> Kremser is the same idea three times, and the
    //  ordering of the EduTools list only pays off if each page says so.
    expect(prose(KREMSER_STEPS[0]!.body)).toContain("McCabe staircase again");
  });

  it("explains why absorption is written in mole RATIOS", () => {
    const s1 = KREMSER_STEPS[0]!;
    expect(s1.formula).toContain("Y = y/(1−y)");
    expect(prose(s1.note!)).toContain("straight even when the total flows");
  });

  it("defines the absorption factor and says which way it decides", () => {
    const s2 = KREMSER_STEPS.find((s) => s.n === 2)!;
    expect(s2.formula).toContain("A = L / (K · V)");
    expect(prose(s2.note!)).toContain("A > 1");
    expect(prose(s2.note!)).toContain("A < 1");
    //  The design consequence, not just the inequality: below one, a taller
    //  column does not fix it.
    expect(prose(s2.note!)).toContain("not a taller column");
  });
});

describe("the claims are true of the closed form the tool ships", () => {
  it("A < 1 really does pinch: recovery saturates below 1", () => {
    //  The lesson says more stages stop buying recovery when A < 1.  Checked
    //  against kremserRecovery itself, so the page cannot teach against its
    //  own engine.
    //  The SHARP form of the claim, rather than an arbitrary delta: for
    //  A < 1 the closed form tends to A itself as N grows, so the recovery is
    //  capped by the absorption factor no matter how tall the column gets.
    //  (The first version of this test compared two stage counts against a
    //  hand-picked tolerance and failed on a page that was correct.)
    const A = 0.6;
    expect(kremserRecovery(A, 200)).toBeCloseTo(A, 6);
    expect(kremserRecovery(A, 40)).toBeLessThan(A + 1e-9);
    expect(kremserRecovery(A, 40) - kremserRecovery(A, 10)).toBeLessThan(0.01);
  });

  it("A > 1 really does keep buying: recovery approaches 1", () => {
    expect(kremserRecovery(1.4, 5)).toBeGreaterThan(kremserRecovery(1.4, 3));
    expect(kremserRecovery(1.4, 40)).toBeGreaterThan(0.999);
  });

  it("A = 1 is a removable singularity, and the branches meet there", () => {
    //  The step calls it removable rather than special physics.  Approaching
    //  from either side must converge on N/(N+1).
    const N = 7;
    expect(kremserRecovery(1, N)).toBeCloseTo(N / (N + 1), 12);
    expect(kremserRecovery(1 - 1e-6, N)).toBeCloseTo(N / (N + 1), 5);
    expect(kremserRecovery(1 + 1e-6, N)).toBeCloseTo(N / (N + 1), 5);
  });

  it("the formula the page prints is the formula the code evaluates", () => {
    //  Recomputed independently from the printed expression, so a typo in
    //  either would separate them.
    const s3 = KREMSER_STEPS.find((s) => s.n === 3)!;
    expect(s3.formula).toContain("(A^(N+1) − A) / (A^(N+1) − 1)");
    expect(s3.formula).toContain("N / (N + 1)");
    for (const [A, N] of [[0.8, 4], [1.4, 6], [2.5, 3]] as const) {
      const p = Math.pow(A, N + 1);
      expect(kremserRecovery(A, N)).toBeCloseTo((p - A) / (p - 1), 12);
    }
  });
});

describe("the honest half", () => {
  it("names the mechanism behind the deviation, not just its size", () => {
    //  Exothermic absorption warms the liquid, K rises, A falls.  A page that
    //  showed the gap without the mechanism would leave the reader thinking
    //  the engine or the formula was simply inaccurate.
    const s4 = KREMSER_STEPS.find((s) => s.n === 4)!;
    expect(prose(s4.body)).toContain("K rises with temperature, and A falls");
    expect(prose(s4.note!)).toContain("fewer conditions than the column obeys");
  });

  it("keeps every limit, including the two the formula depends on", () => {
    const ids = KREMSER_LIMITS.map((l) => l.id);
    for (const id of ["straight-equilibrium", "isothermal", "dilute",
      "ideal-stages"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(KREMSER_LIMITS.find((l) => l.id === "straight-equilibrium")!.body)
      .toContain("geometric series");
    //  Stages are not height: a packed column needs an HTU or HETP.
    expect(KREMSER_LIMITS.find((l) => l.id === "ideal-stages")!.body)
      .toMatch(/HTU|HETP/);
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).not.toContain("MethodSetupRail");
  });

  it("renders the definitions before the plot and the caveat after", () => {
    //  The RENDER site, not the lazy import at the top of the file -- which
    //  is what the first version matched, so it compared the steps against a
    //  line 15 000 characters above where the plot actually appears.
    const plot = SRC.indexOf("<KremserFanPlot");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(SRC.indexOf(`{step(${n})}`), `step ${n} is after the plot`)
        .toBeLessThan(plot);
    expect(SRC.indexOf("{step(4)}"), "the caveat step is before the plot")
      .toBeGreaterThan(plot);
  });

  it("still prints the engine's refusal verbatim", () => {
    //  A refusal is a teaching surface and must never be paraphrased away by
    //  a layout change.
    expect(SRC).toContain("{classroom.err}");
    expect(SRC).toContain('title="choupoSolve (WASM)"');
  });
});
