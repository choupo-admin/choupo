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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  HUNTER_NASH_LIMITS, HUNTER_NASH_STEPS,
} from "../src/ui/methods/hunterNashLesson.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/TieTriangleTool.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

describe("the extraction lesson", () => {
  it("has five steps, numbered without a gap", () => {
    expect(HUNTER_NASH_STEPS).toHaveLength(5);
    expect(HUNTER_NASH_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("explains why the diagram grows a dimension", () => {
    //  Two components need one number; three need two, so the plane becomes
    //  a triangle.  Without that the reader meets a new picture with no
    //  reason for it.
    expect(prose(HUNTER_NASH_STEPS[0]!.body))
      .toContain("a composition needs two numbers");
    expect(prose(HUNTER_NASH_STEPS[0]!.note!)).toContain("outgrown");
  });

  it("keeps the lever rule as the thing it already is", () => {
    const s2 = HUNTER_NASH_STEPS.find((s) => s.n === 2)!;
    expect(s2.formula).toContain("M = F + S");
    expect(s2.formula).toContain("FM / MS = S / F");
    expect(prose(s2.body)).toContain("lever rule");
  });

  it("says tie lines are NOT parallel and shrink at the plait point", () => {
    //  The habit carried over from VLE is the mistake here.
    const s3 = HUNTER_NASH_STEPS.find((s) => s.n === 3)!;
    expect(prose(s3.body)).toContain("SHRINK TO A POINT");
    expect(prose(s3.body)).toContain("plait point");
  });

  it("gives the difference point its formula AND its reassurance", () => {
    //  Delta outside the triangle is where students lose their footing, and
    //  a page that printed the formula without saying why that is correct
    //  would leave the alarm in place.
    const s4 = HUNTER_NASH_STEPS.find((s) => s.n === 4)!;
    expect(s4.formula).toContain("Δ = F − E₁ = R_N − S");
    expect(prose(s4.note!)).toContain("OUTSIDE THE TRIANGLE");
    expect(prose(s4.note!)).toContain("DIFFERENCE of flows, not a mixture");
  });

  it("closes by naming the alternation the reader already knows", () => {
    expect(prose(HUNTER_NASH_STEPS[4]!.body))
      .toContain("McCabe staircase, on a triangle");
  });
});

describe("the limits keep the claims this tool can actually make", () => {
  it("carries all four", () => {
    const ids = HUNTER_NASH_LIMITS.map((l) => l.id);
    for (const id of ["ternary", "no-binodal", "engine-stages", "isothermal"])
      expect(ids, `limit ${id} went missing`).toContain(id);
  });

  it("refuses to draw a binodal nothing publishes", () => {
    //  Drawing a smooth curve through published tie-line ends would be the
    //  VIEW inventing the boundary of the two-phase region -- a physical
    //  claim dressed as a drawing decision.
    const l = HUNTER_NASH_LIMITS.find((x) => x.id === "no-binodal")!;
    expect(l.body).toContain("inventing the boundary");
    expect(prose(l.body)).toContain("plait point and the spinodal are absent");
  });

  it("says the staircase walks the ENGINE's stages, not a graphical count", () => {
    //  A smaller claim than a textbook construction makes, and the one that
    //  is true here: no engine surface returns the tie line through an
    //  arbitrary composition.
    const l = HUNTER_NASH_LIMITS.find((x) => x.id === "engine-stages")!;
    expect(prose(l.body)).toContain("smaller claim");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    //  Comments are not code: the header used to describe the chrome it no
    //  longer uses, which briefly made the gate call this a panel.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE renderer, used by BOTH branches", () => {
    //  The Rayleigh tool shipped with the explanation only in the branch that
    //  had a diagram, so it vanished exactly when there was nothing to
    //  explain.  This shape avoids that, and the test pins it.
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    const guard = SRC.indexOf("if (!cons) {");
    expect(SRC.indexOf("const lessonStep = "),
      "the renderer is defined inside a branch").toBeLessThan(guard);
    const empty = SRC.slice(guard, SRC.lastIndexOf("  return ("));
    expect(empty, "the empty state shows no lesson")
      .toContain("[1, 2, 3, 4, 5].map(lessonStep)");
    expect(empty).toContain("{lessonLimits}");
  });
});
