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
  The pinch lesson.  Two kinds of claim are pinned here and they are pinned
  differently:

    * the ARITHMETIC the page prints is RECOMPUTED from the page's own
      definitions, so a step whose identity does not follow from the lines
      above it fails rather than reading plausibly;
    * the WORDING doctrine of the engine's pinch pass — no superlative, a
      feasible match is a "thermodynamically admissible candidate", a target
      never claims a network — is asserted over the source of both new files
      AND this one.  The banned word is assembled at runtime so that it
      appears in none of the three.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PINCH_LIMITS, PINCH_STEPS } from "../src/ui/methods/pinchLesson.js";

const TOOL_SRC = readFileSync(
  new URL("../src/ui/methods/PinchCompositeTool.tsx", import.meta.url), "utf-8");
const LESSON_SRC = readFileSync(
  new URL("../src/ui/methods/pinchLesson.ts", import.meta.url), "utf-8");
const THIS_SRC = readFileSync(new URL(import.meta.url), "utf-8");

const prose = (s: string): string => s.replace(/\s+/g, " ");
const step = (n: number) => PINCH_STEPS.find((s) => s.n === n)!;
const limit = (id: string) => PINCH_LIMITS.find((l) => l.id === id)!;

describe("the lesson runs end to end", () => {
  it("has five steps, numbered without a gap", () => {
    expect(PINCH_STEPS).toHaveLength(5);
    expect(PINCH_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    for (const s of PINCH_STEPS) {
      expect(s.title.length, `step ${s.n} has no title`).toBeGreaterThan(0);
      expect(s.body.length, `step ${s.n} has no body`).toBeGreaterThan(200);
    }
  });

  it("leads with the one idea: the target precedes the design", () => {
    //  Without this sentence the reader meets composite curves as a drawing
    //  exercise, and the whole method is a drawing exercise from then on.
    const s1 = prose(step(1).body);
    expect(s1).toContain("MINIMUM hot utility");
    expect(s1).toContain("before a single exchanger has been drawn");
    expect(step(1).formula).toContain("CP = Q / |T_target − T_supply|");
  });

  it("says what a composite curve IS: every stream of one kind, merged", () => {
    const s2 = step(2);
    expect(prose(s2.body)).toContain("HOT COMPOSITE CURVE");
    expect(prose(s2.body)).toContain("COLD COMPOSITE");
    //  The merge rule itself, not just the name.
    expect(s2.formula).toContain("CP_total = Σ CP_i");
    //  And the horizontal freedom, which is what makes the slide meaningful.
    expect(prose(s2.note!)).toContain("slid horizontally");
  });

  it("names the overlap as recovery and the overhangs as the targets", () => {
    const s3 = step(3);
    expect(prose(s3.body)).toContain("OVERLAP");
    expect(prose(s3.body)).toContain("hot utility");
    expect(prose(s3.body)).toContain("cold utility");
    expect(s3.formula).toContain("Q_H,min = Σ ΔH_cold − Q_recovery");
    expect(s3.formula).toContain("Q_C,min = Σ ΔH_hot  − Q_recovery");
  });

  it("makes ΔT_min a trade and not a physical constant", () => {
    const s4 = step(4);
    expect(prose(s4.body)).toContain("not a property of the fluids alone");
    //  Both halves of the trade, in the same breath: more recovery AND more
    //  area.  Either half alone is the half-argument students carry away.
    expect(prose(s4.body)).toContain("more recovery, less utility");
    expect(prose(s4.body)).toContain("buys more surface");
    expect(s4.formula).toContain("A = Q / (U · ΔT_lm)");
    //  The pinch splits the plant, and that is why the rules below bite.
    expect(prose(s4.body)).toMatch(/net heat SINK[\s\S]*net heat SOURCE/);
  });

  it("admits that a problem need not have a pinch at all", () => {
    //  The engine's cascade leaves T_pinch at the TOP of the temperature
    //  range when it never dips below zero (PinchPass.cpp: Tpinch =
    //  T.front(), updated only inside `cascade < minCascade`), and this
    //  view's own cascade mirrors that convention.  A page that taught
    //  "there is always a pinch" would send the reader to read a threshold
    //  problem's chip as a physical temperature.
    const n4 = prose(step(4).note!);
    expect(n4).toContain("THRESHOLD");
    expect(n4).toContain("leaves its pinch temperature at the top");
  });
});

describe("THE THREE RULES, and the price of breaking each", () => {
  const s5 = step(5);

  it("states all three, as prohibitions", () => {
    const b = prose(s5.body);
    expect(b).toContain("Do not transfer heat ACROSS the pinch");
    expect(b).toContain("Do not use hot utility BELOW the pinch");
    expect(b).toContain("Do not use cold utility ABOVE the pinch");
  });

  it("says the sentence worth remembering: BOTH utilities rise by Q", () => {
    //  A rule with no price attached is a rule a student forgets.  The
    //  double penalty is the whole content of the pinch design method.
    const b = prose(s5.body);
    expect(b).toContain("BOTH targets rise by Q");
    expect(b).toContain("paid for twice");
    expect(s5.formula).toContain("Q_H = Q_H,min + Q");
    expect(s5.formula).toContain("Q_C = Q_C,min + Q");
  });

  it("explains WHY, on both sides of the pinch, rather than asserting it", () => {
    const b = prose(s5.body);
    expect(b).toContain("has lost Q that it needed");
    expect(b).toContain("has gained Q it did not need");
    //  And that the other two rules are the same rule.
    expect(b).toContain("One rule, three faces");
  });

  it("hands the violation terms back to the engine, by their KPI names", () => {
    expect(s5.note).toContain("violation_heat_below_pinch_kW");
    expect(s5.note).toContain("violation_cool_above_pinch_kW");
    expect(prose(s5.note!)).toContain("does not rewire the flowsheet");
  });
});

describe("the printed arithmetic follows from the printed definitions", () => {
  it("the target identity is the two definitions subtracted", () => {
    //  Step 3 prints Q_H,min and Q_C,min from the overlap, and then an
    //  identity with no ΔT_min in it.  Recomputed here from the definitions
    //  themselves, so a typo in either line separates them.
    expect(step(3).formula)
      .toContain("Q_H,min − Q_C,min = Σ ΔH_cold − Σ ΔH_hot");
    for (const [Hhot, Hcold, Qrec] of
      [[100, 60, 40], [250, 250, 175], [30, 500, 12]] as const) {
      const QH = Hcold - Qrec;
      const QC = Hhot - Qrec;
      expect(QH - QC).toBeCloseTo(Hcold - Hhot, 12);
    }
  });

  it("the identity is independent of the approach, as the note claims", () => {
    //  "changing the approach moves BOTH targets by the same amount".
    //  Recovery falls by δ when the curves are pulled apart; both targets
    //  rise by δ and their difference is untouched.
    expect(prose(step(3).note!)).toContain("moves BOTH targets by the same amount");
    const Hhot = 320, Hcold = 410;
    const before = { QH: Hcold - 200, QC: Hhot - 200 };
    const after = { QH: Hcold - 185, QC: Hhot - 185 };
    expect(after.QH - before.QH).toBeCloseTo(15, 12);
    expect(after.QC - before.QC).toBeCloseTo(15, 12);
    expect(after.QH - after.QC).toBeCloseTo(before.QH - before.QC, 12);
  });

  it("the shifted scale really does put the two curves ΔT_min apart", () => {
    expect(step(4).formula)
      .toContain("T* = T_hot − ΔT_min/2 = T_cold + ΔT_min/2");
    for (const [Tstar, dT] of [[350, 10], [400, 20], [300, 5]] as const) {
      const Thot = Tstar + dT / 2;
      const Tcold = Tstar - dT / 2;
      expect(Thot - Tcold).toBeCloseTo(dT, 12);
    }
  });

  it("a cross-pinch transfer of Q costs exactly Q on each side", () => {
    const QHmin = 107.5, QCmin = 40.0, Q = 12.5;
    expect(QHmin + Q - QHmin).toBeCloseTo(Q, 12);
    expect(QCmin + Q - QCmin).toBeCloseTo(Q, 12);
    //  And the excess over target is the sum of the named terms.
    expect(step(5).formula)
      .toContain("= cross-pinch transfer + heating below + cooling above");
  });
});

describe("the honest half", () => {
  it("keeps every limit", () => {
    const ids = PINCH_LIMITS.map((l) => l.id);
    for (const id of ["targets-not-a-network", "no-ranking", "constant-cp",
      "stream-population", "no-area-or-cost", "utility-levels"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says a target is a target: nothing here achieves it and nothing is designed", () => {
    const l = prose(limit("targets-not-a-network").body);
    expect(l).toContain("not a claim that the flowsheet in front of you reaches them");
    expect(l).toContain("writes no match into the flowsheet");
    expect(l).toContain("changes no topology");
  });

  it("keeps the candidate table exhaustive, unranked and in the engine's words", () => {
    const l = prose(limit("no-ranking").body);
    expect(l).toContain("thermodynamically admissible candidate");
    expect(l).toContain("no row is ranked, preferred or recommended");
    //  A violated CP rule is listed with its away-from-pinch duty, never
    //  dropped — the pass's own wording.
    expect(l).toContain("away-from-pinch duty");
  });

  it("states the engine's own method hypotheses rather than implying rigour", () => {
    expect(prose(limit("constant-cp").body))
      .toContain("CP = |Q| / |T_out − T_in|");
    expect(prose(limit("constant-cp").body)).toContain("latentWidth");
    expect(prose(limit("stream-population").body)).toContain("NET duty");
  });

  it("admits that the capital half of the ΔT_min trade is not computed", () => {
    //  The page argues the trade and the engine measures only one side of
    //  it; saying so is what keeps step 4 from reading like a balance.
    const l = prose(limit("no-area-or-cost").body);
    expect(l).toContain("computed nowhere in it");
    expect(l).toContain("has not been authorised or built");
  });

  it("does not pretend the targets pick a utility", () => {
    expect(prose(limit("utility-levels").body))
      .toContain("this pass does not take");
  });
});

describe("the wording doctrine the pinch pass enforces", () => {
  it("the banned superlative appears in NONE of the three files", () => {
    //  Gate-enforced in the repository (bin/curate/check_pinch_p2.py, and
    //  tests/pinchCompositeTool.test.ts for the tool).  Assembled at runtime
    //  so this test file is not itself a violation.
    const banned = new RegExp("opt" + "imal", "i");
    expect(banned.test(LESSON_SRC), "the lesson uses the banned word").toBe(false);
    expect(banned.test(TOOL_SRC), "the tool uses the banned word").toBe(false);
    expect(banned.test(THIS_SRC), "this test uses the banned word").toBe(false);
    //  The near-synonym goes the same way: the doctrine is about the claim,
    //  not the spelling.
    const near = new RegExp("opt" + "imum", "i");
    expect(near.test(LESSON_SRC)).toBe(false);
    expect(near.test(TOOL_SRC)).toBe(false);
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(TOOL_SRC).toContain('overflowY: "auto"');
    expect(TOOL_SRC).toContain('maxWidth: 940');
    //  Comments are not code: the header describes the chrome, so strip it
    //  before asking whether the rail is still in use.
    const code = TOOL_SRC.replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE renderer for the steps, hoisted above everything that branches", () => {
    //  The Rayleigh tool shipped with its explanation inside the branch that
    //  HAD a diagram, so it vanished exactly when there was nothing to
    //  explain.  One definition, one call site per step.
    expect((TOOL_SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    for (const n of [1, 2, 3, 4, 5])
      expect((TOOL_SRC.match(new RegExp(`\\{lessonStep\\(${n}\\)\\}`, "g")) ?? []).length,
        `step ${n} is rendered from more than one site`).toBe(1);
    expect((TOOL_SRC.match(/\{lessonLimits\}/g) ?? []).length).toBe(1);
  });

  it("renders the definitions before the plot and the consequences after", () => {
    //  The RENDER site, not a definition or an import: what matters is where
    //  the picture appears on the page.
    const plot = TOOL_SRC.indexOf("<CompositeSvg hot=");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(TOOL_SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the plot`)
        .toBeLessThan(plot);
    for (const n of [4, 5])
      expect(TOOL_SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is before the plot`)
        .toBeGreaterThan(plot);
    //  The limits close the page.
    expect(TOOL_SRC.indexOf("{lessonLimits}")).toBeGreaterThan(plot);
  });

  it("puts the knobs in a two-column grid beside the plot", () => {
    expect(TOOL_SRC).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(TOOL_SRC).toContain('gridTemplateColumns: "minmax(220px, 300px) 1fr"');
  });

  it("sets the formulas in a bordered monospace box", () => {
    expect(TOOL_SRC).toContain('ff="monospace"');
    //  The bordered formula box and the step walk now live in ONE
    //  place (methods/lessonStep.tsx), so pinning them in THIS
    //  tool's source pinned a copy that no longer exists.  The
    //  stronger claim, and the one that survives the next change to
    //  how a step is drawn, is that the tool uses the shared
    //  renderer rather than a seventeenth private one.
    expect(TOOL_SRC).toContain("lessonStepper(PINCH_STEPS)");
    expect(TOOL_SRC).not.toContain("PINCH_STEPS.find");
  });

  it("still prints the engine's refusal verbatim", () => {
    //  A refusal is a teaching surface and must never be paraphrased away by
    //  a layout change.
    expect(TOOL_SRC).toContain("{method.err}");
    expect(TOOL_SRC).toContain('title="choupoSolve (WASM)"');
  });

  it("keeps the honesty surfaces the panel carried", () => {
    //  Each of these is a claim about where a number came from; losing one
    //  to a layout change would leave a derived number reading as engine
    //  output.
    expect(TOOL_SRC).toContain("cross-check (derived in view)");
    expect(TOOL_SRC).toContain("engine targets · Q_H,min");
    expect(TOOL_SRC).toContain("thermodynamically admissible candidate");
    //  And the "Current run" empty state, which is the only branch that ever
    //  had one.
    expect(TOOL_SRC).toContain("No pinch targets in this run.");
  });
});
