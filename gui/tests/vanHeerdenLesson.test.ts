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
  The ignition/extinction lesson is the one place in the EduTools corpus where
  the prose carries a SAFETY claim, so it is the one where prose rotting
  silently costs the most.  These cases pin what the page has to go on saying:
  the slope criterion in the form a reader can apply, the hysteresis that makes
  a runaway asymmetric with a shutdown, and every limit that keeps the diagram
  from reading as a sufficient safety argument.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  VAN_HEERDEN_LIMITS, VAN_HEERDEN_STEPS,
} from "../src/ui/methods/vanHeerdenLesson.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/VanHeerdenTool.tsx", import.meta.url), "utf-8");

/** Line breaks and run-on spacing are LAYOUT; asserting through them would
 *  make a re-wrap look like a changed claim. */
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();

const step = (n: number) => VAN_HEERDEN_STEPS.find((s) => s.n === n)!;

describe("the ignition / extinction lesson", () => {
  it("has five steps, numbered without a gap", () => {
    expect(VAN_HEERDEN_STEPS).toHaveLength(5);
    expect(VAN_HEERDEN_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives every step a formula — this construction is algebra, not a mood", () => {
    for (const s of VAN_HEERDEN_STEPS)
      expect(s.formula, `step ${s.n} lost its formula`).toBeTruthy();
  });

  it("derives the two curves from the ONE residual the engine solves", () => {
    //  G and R are a SPLIT of phi, not a second model beside it; a page that
    //  drew them without saying so would be presenting a parallel
    //  calculation as if it were the engine's own.
    const s1 = step(1);
    expect(prose(s1.formula!)).toContain("phi(T) = H_out(T) − H_in − Q_ext(T) = 0");
    expect(prose(s1.formula!)).toContain("phi(T) = R(T) − G(T)");
    expect(prose(s1.note!)).toContain("IDENTITY");
    expect(prose(s1.note!)).toContain("R − G reproduces phi exactly");
  });

  it("names the sigmoid and the line, and refuses to call R exactly straight", () => {
    //  The witness's own header calls the removal a straight line, and in the
    //  textbook idealisation it is.  What Choupo publishes is the exact
    //  enthalpy difference, so the drawn curve bends where cp and the outlet
    //  composition vary — the step says which of the two the reader is
    //  looking at.
    const s2 = step(2);
    expect(prose(s2.body)).toContain("STRAIGHT LINE in T");
    expect(prose(s2.body)).toContain("cut a sigmoid once, twice or three times");
    expect(prose(s2.formula!)).toContain("R(T) = F·c_p·(T − T_in) + UA·(T − T_coolant)");
    expect(prose(s2.note!)).toContain("not straight by construction");
  });

  it("STATES THE STABILITY CRITERION as a slope comparison", () => {
    //  The load-bearing sentence of the whole page: a steady state is stable
    //  when the removal line is steeper than the generation curve there.
    const s3 = step(3);
    expect(prose(s3.formula!)).toContain("d(Q_rem)/dT > d(Q_gen)/dT");
    expect(prose(s3.formula!)).toContain("dR/dT > dG/dT");
    expect(prose(s3.body)).toContain("REMOVAL LINE IS STEEPER");
    expect(prose(s3.note!)).toContain("MIDDLE one fails this test");
    //  And the distinction the criterion exists to draw.
    expect(prose(s3.note!))
      .toContain("\"The solver converged\" and \"the plant can run there\" are different claims");
  });

  it("makes ignition and extinction a TANGENCY, and says the jump is one-way", () => {
    //  Two roots merging is why the state disappears rather than merely
    //  becoming unstable, and the asymmetry is the safety lesson: the
    //  setting that ignites is not the setting that extinguishes.
    const s4 = step(4);
    expect(prose(s4.formula!)).toContain("dG/dT = dR/dT");
    expect(prose(s4.formula!)).toContain("the two roots merge");
    expect(prose(s4.body)).toContain("TANGENT");
    expect(prose(s4.note!)).toContain("HYSTERESIS");
    expect(prose(s4.note!))
      .toContain("why a runaway is not the mirror image of a shutdown");
    expect(prose(s4.note!)).toContain("back the parameter off");
  });

  it("hands the operator the removal line's slope and intercept", () => {
    //  The handles are the point of step 5: coolant temperature slides the
    //  line, UA and flow tilt it.
    const s5 = step(5);
    expect(prose(s5.formula!))
      .toContain("R(T) = (F·c_p + UA)·T − (F·c_p·T_in + UA·T_coolant)");
    expect(prose(s5.body)).toContain("Coolant temperature enters the INTERCEPT");
    expect(prose(s5.body)).toContain("UA and the total flow enter the SLOPE");
  });

  it("says the witness is ADIABATIC rather than implying a coolant knob", () => {
    //  cstr05_multiplicity declares `thermalMode adiabatic;` and no UA or
    //  T_coolant key, so no knob on this page can move a coolant.  The
    //  jacketed twin is named instead of the gap being left silent.
    const s5 = step(5);
    expect(prose(s5.note!)).toContain("witness is ADIABATIC");
    expect(prose(s5.note!))
      .toContain("tutorials/steady/reactors/cstr06_jacketed");
    //  Measured on the shipped witness: doubling a feed flow steepens R AND
    //  lifts G's plateau, so neither curve alone predicts the root count.
    expect(prose(s5.note!))
      .toContain("cannot be read off either curve alone");
  });
});

describe("the limits keep this from reading as a safety argument", () => {
  it("carries all seven", () => {
    const ids = VAN_HEERDEN_LIMITS.map((l) => l.id);
    for (const id of [
      "steady-state-only", "static-criterion", "ordering-not-analysis",
      "lumped-cstr", "one-reaction-here", "not-a-safety-analysis",
      "property-windows",
    ]) expect(ids, `limit ${id} went missing`).toContain(id);
    expect(ids).toHaveLength(7);
  });

  const limit = (id: string) => VAN_HEERDEN_LIMITS.find((l) => l.id === id)!;

  it("says plainly that the diagram is not a hazard assessment", () => {
    //  The one claim this page must never make by omission.
    const l = limit("not-a-safety-analysis");
    expect(prose(l.body)).toContain("Loss of coolant");
    expect(prose(l.body)).toContain("It is not an answer to any of them");
  });

  it("keeps the slope test NECESSARY rather than sufficient", () => {
    //  Passing dR/dT > dG/dT does not prove dynamic stability; an oscillation
    //  is available to a state that passes it.
    const l = limit("static-criterion");
    expect(prose(l.body)).toContain("rules a steady state OUT when it fails");
    expect(prose(l.body)).toContain("sustained oscillation");
  });

  it("admits the unstable flag is ORDERING, matching what the tool does", () => {
    //  classifySteadyStates sorts by T and flags index 1 of exactly three.
    //  It evaluates no slope, and the limit must not imply it does.
    const l = limit("ordering-not-analysis");
    expect(prose(l.body)).toContain("evaluates dG/dT and dR/dT nowhere");
    expect(prose(l.body)).toContain("no stability claim at all");
    expect(SRC).toContain("unstable: three && i === 1");
  });

  it("sends the transient to the unit that actually integrates one", () => {
    const l = limit("steady-state-only");
    expect(prose(l.body)).toContain("no thermal inertia");
    expect(prose(l.body)).toContain("dynamicCSTR");
  });

  it("does not claim to replay the engine's extrapolation advisories", () => {
    //  The page renders run.err verbatim and nothing else; the advisories
    //  live in the run's own output, and saying so beats implying they are
    //  here.
    const l = limit("property-windows");
    expect(prose(l.body)).toContain("this page does not repeat them");
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code, "the page grew an advisory surface — update the limit")
      .not.toContain("advisor");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls, and is no longer a docked panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    //  Comments are not code: only what runs decides whether this is a panel.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("gives the inline SVG an explicit height", () => {
    //  In a scrolling column there is no flex parent to stretch against, and
    //  an svg at height 100 % of an auto-height box collapses to nothing.
    expect(SRC).toContain("height: 460");
  });

  it("has ONE renderer, used by BOTH branches", () => {
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    const guard = SRC.indexOf("if (view === null) {");
    expect(guard).toBeGreaterThan(0);
    expect(SRC.indexOf("const lessonStep = "),
      "the renderer is defined inside a branch").toBeLessThan(guard);
    const empty = SRC.slice(guard, SRC.indexOf("const chips = ("));
    expect(empty, "the empty state shows no lesson")
      .toContain("[1, 2, 3, 4, 5].map(lessonStep)");
    expect(empty, "the empty state drops the limits").toContain("{lessonLimits}");
  });

  it("puts the definitions BEFORE the plot and the consequences AFTER", () => {
    //  Anchored on the RENDER SITE of the chart, not on an import: what
    //  matters is where the picture is drawn relative to the argument.
    const main = SRC.lastIndexOf("{lessonHead}");
    const at = (needle: string) => {
      const i = SRC.indexOf(needle, main);
      expect(i, `${needle} is missing from the page`).toBeGreaterThan(0);
      return i;
    };
    const plot = at("<VanHeerdenSvg");
    expect(at("{lessonStep(1)}")).toBeLessThan(plot);
    expect(at("{lessonStep(2)}")).toBeLessThan(plot);
    expect(at("{lessonStep(3)}")).toBeLessThan(plot);
    expect(at("{lessonStep(4)}")).toBeGreaterThan(plot);
    expect(at("{lessonStep(5)}")).toBeGreaterThan(plot);
    expect(at("{lessonLimits}")).toBeGreaterThan(at("{lessonStep(5)}"));
    //  The steps run in order, 1..5, down the page.
    expect(at("{lessonStep(1)}")).toBeLessThan(at("{lessonStep(2)}"));
    expect(at("{lessonStep(2)}")).toBeLessThan(at("{lessonStep(3)}"));
    expect(at("{lessonStep(4)}")).toBeLessThan(at("{lessonStep(5)}"));
  });

  it("keeps the knobs in a two-column grid beside the plot", () => {
    expect(SRC).toContain('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    expect(SRC).toContain("<Stack gap={8}>{controls}</Stack>");
  });

  it("keeps the engine's refusal verbatim", () => {
    //  A refusal is a teaching surface; paraphrasing one is the failure this
    //  block exists against.
    expect(SRC).toContain(
      "The run refused or failed — the engine's message, verbatim");
    expect(SRC).toContain("{run.err}");
    const main = SRC.lastIndexOf("{lessonHead}");
    expect(SRC.indexOf("{alerts}", main)).toBeGreaterThan(0);
  });
});
