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
  The reactor-sizing lesson.  What is pinned here is the ARGUMENT: that the
  page still says area is volume, that the CSTR rectangle is justified by the
  tank being all one point, that the surprising direction (a falling curve,
  where the stirred tank wins) is stated AND is marked as described rather
  than demonstrated, and that the caveats the tool can honestly make are all
  still on the page.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LEVENSPIEL_LIMITS, LEVENSPIEL_STEPS,
} from "../src/ui/methods/levenspielLesson.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/LevenspielTool.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

const step = (n: number) => LEVENSPIEL_STEPS.find((s) => s.n === n)!;

describe("the reactor-sizing lesson", () => {
  it("has five steps, numbered without a gap", () => {
    expect(LEVENSPIEL_STEPS).toHaveLength(5);
    expect(LEVENSPIEL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("every step carries a formula, and every formula is about 1/(−r_A)", () => {
    //  The page is a geometric argument; a step with no expression is a step
    //  the reader has to take on trust.
    for (const s of LEVENSPIEL_STEPS) {
      expect(s.formula, `step ${s.n} has no formula`).toBeTruthy();
      expect(s.formula!, `step ${s.n} names something else`)
        .toContain("(−r_A)");
    }
  });

  it("builds on the one idea: the area under the curve IS the volume", () => {
    const s1 = step(1);
    expect(prose(s1.body)).toContain("AREA IS VOLUME");
    //  Both design equations, printed side by side — the integral and the
    //  product — because the whole page is the difference between them.
    expect(prose(s1.formula!)).toContain("V = F_A0 ∫₀^X dX/(−r_A)");
    expect(prose(s1.formula!)).toContain("V = F_A0 · X/(−r_A)|exit");
    //  And the condition the construction needs to mean anything at all.
    expect(prose(s1.note!)).toContain("function of X alone");
    expect(prose(s1.note!)).toContain("isothermal");
  });

  it("justifies the rectangle by the tank being all one point", () => {
    //  Not "the CSTR equation happens to be a product" — the reason, which is
    //  that a perfectly mixed vessel has no gradient to integrate over.
    const s2 = step(2);
    expect(prose(s2.body)).toContain("OUTLET composition everywhere");
    expect(prose(s2.body)).toContain("converted at the exit rate");
    expect(prose(s2.formula!))
      .toContain("V_CSTR = F_A0 · X_exit / (−r_A)|exit");
    expect(prose(s2.note!)).toContain("Nothing was approximated");
    expect(prose(s2.note!)).toContain("exact mole balance of an ideal CSTR");
  });

  it("states the ordinary result AS a consequence of the shape", () => {
    const s3 = step(3);
    expect(prose(s3.body)).toContain("1/(−r_A) RISES with X");
    expect(prose(s3.body)).toContain("contains the entire area");
    expect(prose(s3.formula!)).toContain("V_PFR ≤ V_CSTR");
    //  Tanks in series and the PFR limit fall straight out of the same
    //  picture; a page that stopped at one tank would leave that unexplained.
    expect(prose(s3.note!)).toContain("staircase of rectangles");
    expect(prose(s3.note!))
      .toContain("An infinite chain of stirred tanks is a plug-flow reactor");
  });

  it("carries the surprising direction, with its mechanism", () => {
    //  The result students remember wrongly.  It must be stated as a
    //  consequence of the curve falling, not as a fact about autocatalysis.
    const s4 = step(4);
    expect(prose(s4.body)).toContain("Any rate that IMPROVES with conversion");
    expect(prose(s4.body)).toContain("autocatalysis");
    expect(prose(s4.body)).toContain("the rectangle sits UNDER the");
    expect(prose(s4.body)).toContain("the stirred tank is the smaller reactor");
    //  And the consequence at X = 0 with no uncatalysed path, which is why a
    //  tank (or a recycle) is not merely cheaper but necessary.
    expect(prose(s4.body)).toContain("a plug-flow reactor cannot start");
    expect(prose(s4.formula!)).toContain("1/(−r_A) unbounded there");
  });

  it("says the falling case is DESCRIBED, not demonstrated below", () => {
    //  The shipped twins are pseudo-first-order: both curves rise.  A page
    //  claiming the plot shows autocatalysis would be claiming a result the
    //  witnesses cannot produce.
    const note = prose(step(4).note!);
    expect(note).toContain("NEITHER witness below is autocatalytic");
    expect(note).toContain("described here, not demonstrated");
    //  What the engine CAN express is stated instead of implied.
    expect(note).toContain("declares its own `order`");
  });

  it("closes on the series arrangement, and locates the cut exactly", () => {
    const s5 = step(5);
    expect(prose(s5.body)).toContain("MINIMUM of 1/(−r_A)");
    expect(prose(s5.body)).toContain("followed by a PFR that takes the rest");
    //  The optimum is where the curve is flat — a derivative, not a rule of
    //  thumb, and the note does the derivative rather than asserting it.
    expect(prose(s5.formula!)).toContain("X* at the curve's MINIMUM");
    expect(prose(s5.note!)).toContain("the two ordinate terms cancel");
    expect(prose(s5.note!)).toContain("where the curve is FLAT");
    //  The degenerate case, so the rule does not read as new physics for the
    //  ordinary curve the reader has just been shown.
    expect(prose(s5.body)).toContain("the minimum sits at X = 0");
  });
});

describe("the honest half", () => {
  it("keeps every limit", () => {
    const ids = LEVENSPIEL_LIMITS.map((l) => l.id);
    for (const id of ["single-reaction", "isothermal", "constant-density",
      "bulk-rate", "not-validation"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(LEVENSPIEL_LIMITS).toHaveLength(5);
  });

  it("says selectivity is not on this plot", () => {
    const l = LEVENSPIEL_LIMITS.find((x) => x.id === "single-reaction")!;
    expect(prose(l.title)).toContain("selectivity is not on this plot");
    expect(prose(l.body)).toContain("product distribution");
  });

  it("names the assumptions the two units actually make", () => {
    //  Read off PFR.H / CSTR.cpp, not guessed: isothermal at the feed T, and
    //  a volumetric flow held at its inlet value.
    const iso = LEVENSPIEL_LIMITS.find((x) => x.id === "isothermal")!;
    expect(prose(iso.body)).toContain("isothermal at the feed temperature");
    expect(prose(iso.body)).toContain("adiabatic");
    const rho = LEVENSPIEL_LIMITS.find((x) => x.id === "constant-density")!;
    expect(prose(rho.body)).toContain("Q = F_in · v_mol(feed)");
    expect(prose(rho.body)).toContain("pressure drop");
  });

  it("declares the bulk-rate / effectiveness-factor gap and its direction", () => {
    const l = LEVENSPIEL_LIMITS.find((x) => x.id === "bulk-rate")!;
    expect(prose(l.body)).toContain("effectiveness factor is taken as one");
    //  Which way the error goes is the part a reader can act on.
    expect(prose(l.body)).toContain("UNDERSTATES the volume");
    expect(prose(l.body)).toContain("Catalyst decay");
  });

  it("refuses to read the area/V_R agreement as validation", () => {
    const l = LEVENSPIEL_LIMITS.find((x) => x.id === "not-validation")!;
    expect(prose(l.body)).toContain("trapezoid-versus-RK4 truncation");
    expect(prose(l.body)).toContain("not evidence that the kinetics are right");
    //  And the witnesses' own file says its numbers are illustrative.
    expect(prose(l.body)).toContain("illustrative");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    //  Comments are not code: the header describes the tool, and a mention
    //  there must not be read as the chrome still being used.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE renderer, hoisted above BOTH branches", () => {
    //  A tool that hides its explanation when the engine produced nothing is
    //  exactly backwards, and a second copy of the renderer is how that
    //  creeps back in.
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    const guard = SRC.indexOf("if (pfrView === null && cstrView === null) {");
    expect(guard).toBeGreaterThan(0);
    expect(SRC.indexOf("const lessonStep = "),
      "the renderer is defined inside a branch").toBeLessThan(guard);
    const empty = SRC.slice(guard, SRC.lastIndexOf("  return ("));
    expect(empty, "the empty state shows no lesson")
      .toContain("[1, 2, 3, 4, 5].map(lessonStep)");
    expect(empty, "the empty state drops the limits").toContain("{lessonLimits}");
  });

  it("puts the definitions before the plot and the consequences after", () => {
    //  The RENDER site, never an import at the top of the file.
    const plot = SRC.indexOf("<LevenspielSvg");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the plot`)
        .toBeLessThan(plot);
    for (const n of [4, 5])
      expect(SRC.lastIndexOf(`{lessonStep(${n})}`),
        `step ${n} is before the plot`).toBeGreaterThan(plot);
    expect(SRC.lastIndexOf("{lessonLimits}")).toBeGreaterThan(plot);
  });

  it("still prints each engine's refusal verbatim", () => {
    //  A refusal is a teaching surface and must never be paraphrased away by
    //  a layout change — and there are TWO engines running here.
    expect(SRC).toContain("{pfrRun.err}");
    expect(SRC).toContain("{cstrRun.err}");
    expect(SRC).toContain(
      'title="The PFR run refused or failed — the engine\'s message, verbatim"');
    expect(SRC).toContain(
      'title="The CSTR run refused or failed — the engine\'s message, verbatim"');
  });

  it("keeps the view-geometry provenance and the exclusion report", () => {
    //  What this file computes, it declares; and points dropped from the
    //  1/(−r) view are reported rather than silently removed.
    expect(prose(SRC)).toContain("Nothing here re-derives kinetics");
    expect(prose(SRC)).toContain("never silently dropped");
    //  The two comparisons that must not be conflated: absolute volume when
    //  F_lim,in is derivable, F_A0-normalized units when it is not.
    expect(SRC).toContain("F_A0-normalized");
    expect(prose(SRC)).toContain("same-X punchline is classroom-only");
  });
});
