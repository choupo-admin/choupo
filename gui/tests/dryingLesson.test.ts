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
  The batch-drying lesson.  The claims that CAN be checked are checked rather
  than quoted:

    * the falling-rate law the page prints is read back out of BatchDryer.cpp,
      so a page teaching a law the engine does not run fails here;
    * the tail-time expression in the consequences step is recomputed as the
      inverse of the exponential the previous step prints, so a typo in either
      separates them;
    * the strict inequality the page describes at X_c is asserted against the
      tool's own classifier.

  The honesty half is pinned as prose, because that is what it is: the page
  must go on saying that X_c is DECLARED and that the solid's temperature is
  NOT integrated.  Both are the kind of sentence a later edit removes for
  reading smoothly, and both are the reason the page is trustworthy.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DRYING_LIMITS, DRYING_STEPS } from "../src/ui/methods/dryingLesson.js";
import { classifyPeriods } from "../src/ui/methods/DryingCurveTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/DryingCurveTool.tsx", import.meta.url), "utf-8");
const ENGINE = readFileSync(
  new URL("../../src/unitOperations/batch/BatchDryer.cpp", import.meta.url),
  "utf-8");

const prose = (s: string): string => s.replace(/\s+/g, " ");
const step = (n: number) => DRYING_STEPS.find((s) => s.n === n)!;

describe("the lesson is complete and numbered", () => {
  it("has five steps, numbered without a gap", () => {
    expect(DRYING_STEPS).toHaveLength(5);
    expect(DRYING_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives every step a title and a body", () => {
    for (const s of DRYING_STEPS) {
      expect(s.title.length, `step ${s.n} has no title`).toBeGreaterThan(0);
      expect(s.body.length, `step ${s.n} has no body`).toBeGreaterThan(120);
    }
  });

  it("carries a formula on every step that makes a quantitative claim", () => {
    //  All five do: the dry-basis definition, the wet bulb + constant flux,
    //  the constant-rate leg, the falling-rate law, and the tail time.
    for (const n of [1, 2, 3, 4, 5])
      expect(step(n).formula, `step ${n} lost its formula`).toBeTruthy();
  });
});

describe("the two regimes, and what controls each", () => {
  it("step 1 says the control changes hands, and defines X on the DRY basis", () => {
    const s = step(1);
    expect(prose(s.body)).toContain("the rate is set by the AIR");
    expect(prose(s.body)).toContain("the rate is set by the SOLID");
    expect(s.formula).toContain("X = m_moisture / m_drySolid");
  });

  it("step 2 puts the surface at the WET BULB and draws the safety consequence", () => {
    const s = step(2);
    expect(prose(s.body)).toContain("WET-BULB");
    //  The pedagogical point: cool while it dries, hence safe for a
    //  heat-sensitive product.  A page that gave the wet bulb as a number
    //  without this would have taught nothing.
    expect(prose(s.body)).toContain("heat-sensitive");
    expect(prose(s.body)).toMatch(/cool/);
    expect(s.formula).toContain("R_c = k_Y");
    expect(s.formula).toContain("Y_sat(T_wb)");
  });

  it("step 2 declares the two hypotheses it runs on, rather than implying a correlation", () => {
    //  Lewis = 1 is what makes the heat and mass statements the same one, and
    //  k_Y is DECLARED equipment data -- there is no Nusselt or Sherwood
    //  correlation anywhere in this unit, so the page must not suggest one.
    const note = prose(step(2).note!);
    expect(note).toContain("Lewis = 1");
    expect(note).toContain("DECLARED sample and equipment data");
    expect(note).toContain("not a correlation");
  });

  it("step 4 hands control to the solid and says the surface warms", () => {
    const s = step(4);
    expect(prose(s.body)).toContain("travel from inside the solid");
    expect(prose(s.body)).toContain("DRY-BULB");
  });
});

describe("the honesty half — what is DECLARED versus what is COMPUTED", () => {
  it("step 3 says plainly that X_c is an input, not a prediction", () => {
    const s = step(3);
    const note = prose(s.note!);
    expect(note).toContain("X_c IS AN INPUT");
    expect(note).toContain("operation.criticalMoisture");
    //  And the corollary a student needs: reading the corner off the plot
    //  recovers the declaration, so it is not evidence of anything.
    expect(note).toContain("recovers what was");
    //  Still true of the material: X_c moves with the drying conditions.
    expect(prose(s.body)).toContain("not a pure");
  });

  it("step 4 marks the falling-rate law a CHOICE and the warm-up NOT computed", () => {
    const note = prose(step(4).note!);
    expect(note).toContain("MODELLING CHOICE");
    expect(note).toContain("no internal diffusion coefficient");
    expect(note).toContain("ONE falling-rate period");
    //  The sharpest one: the page describes a warm-up the model does not
    //  integrate, and must say so in the same breath.
    expect(note).toContain("NOT computed");
    expect(note).toContain("temperature is not integrated");
    expect(note).toContain("cannot tell you how hot it gets");
  });

  it("step 5 keeps X_eq a RESULT and does not claim it was declared", () => {
    expect(prose(step(5).note!)).toContain("X_eq here is a RESULT");
    expect(prose(step(5).note!)).toContain("GAB isotherm");
  });
});

describe("the design consequences, which are the point of the page", () => {
  it("states the time/water split and the sizing error it causes", () => {
    const body = prose(step(5).body);
    expect(body).toContain("most of the WATER");
    expect(body).toContain("most of the TIME");
    expect(body).toContain("falling-rate");
    //  Named as an UNDER-estimate, and with the mechanism (pricing the whole
    //  job at the fastest rate it ever achieves).
    expect(body).toContain("underestimate");
    expect(body).toContain("fastest rate it ever achieves");
  });

  it("states the equilibrium floor and what actually moves it", () => {
    const body = prose(step(5).body);
    expect(body).toContain("X_eq is a FLOOR");
    expect(body).toContain("no amount of extra time");
    expect(body).toContain("drier or hotter air, not a longer run");
  });
});

describe("the printed arithmetic is the arithmetic the engine runs", () => {
  it("prints the falling-rate law BatchDryer.cpp evaluates", () => {
    //  The engine's one expression, read back out of the source: a page
    //  printing a different law would be teaching against its own solver.
    expect(ENGINE).toContain("R_c_ * (X - X_eq_) / (X_c_ - X_eq_)");
    const f = step(4).formula!.replace(/\s+/g, "");
    expect(f).toContain("R=R_c·(X−X_eq)/(X_c−X_eq)");
  });

  it("prints the strict inequality the classifier uses", () => {
    //  BatchDryer::flux_ is `if (X > X_c_) return R_c_;`, so a sample sitting
    //  exactly ON X_c is already falling-rate.  The page's caption says so;
    //  this asserts the tool's classifier agrees.
    expect(ENGINE).toContain("if (X > X_c_) return R_c_;");
    expect(classifyPeriods([0.2, 0.12, 0.05], 0.12))
      .toEqual(["constant", "falling", "falling"]);
  });

  it("the tail-time expression is the inverse of the exponential above it", () => {
    //  Recomputed rather than eyeballed: step 4 prints the forward form and
    //  step 5 prints its inverse, and a typo in either would separate them.
    expect(step(4).formula).toContain("exp(−(t − t_c)/τ)");
    expect(step(5).formula).toContain("τ · ln( (X_c − X_eq) / (X − X_eq) )");
    const tc = 1027.7, tau = 595.0, Xc = 0.12, Xeq = 0.0158;
    for (const t of [1100, 1500, 2000, 3000]) {
      const X = Xeq + (Xc - Xeq) * Math.exp(-(t - tc) / tau);
      expect(tc + tau * Math.log((Xc - Xeq) / (X - Xeq))).toBeCloseTo(t, 6);
    }
  });

  it("the tail really is unbounded, which is what makes X_eq a floor", () => {
    //  The claim "no amount of extra time gets you below X_eq" is checked on
    //  the printed expression itself: the time to reach X diverges as X
    //  approaches X_eq from above.
    const tc = 1027.7, tau = 595.0, Xc = 0.12, Xeq = 0.0158;
    const t = (X: number) => tc + tau * Math.log((Xc - Xeq) / (X - Xeq));
    expect(t(Xeq + 1e-3)).toBeGreaterThan(t(Xeq + 1e-2));
    expect(t(Xeq + 1e-12)).toBeGreaterThan(t(Xeq + 1e-3));
    expect(Number.isFinite(t(Xeq))).toBe(false);
  });

  it("the constant-rate leg is the engine's own hand check", () => {
    //  t_c = m_s (X_0 - X_c)/(R_c A) is the expression BatchDryer announces as
    //  its hand check at initialise.
    expect(step(3).formula).toContain("m_s · (X_0 − X_c) / (R_c · A)");
    expect(ENGINE).toContain("m_solid_ * (X_0_ - X_c_) / (R_c_ * area_)");
  });

  it("tau is the engine's tau", () => {
    expect(step(4).formula).toContain("τ = m_s (X_c − X_eq)/(R_c A)");
    expect(ENGINE).toContain("m_solid_ * (X_c_ - X_eq_) / (R_c_ * area_)");
  });
});

describe("every limit survives, and each says something specific", () => {
  it("keeps all seven ids", () => {
    const ids = DRYING_LIMITS.map((l) => l.id);
    for (const id of [
      "declared-critical-moisture", "falling-rate-law", "solid-temperature",
      "constant-air", "no-spatial-resolution",
      "declared-transfer-coefficient", "energy-from-outside",
    ]) expect(ids, `limit ${id} went missing`).toContain(id);
    expect(DRYING_LIMITS).toHaveLength(7);
  });

  const limit = (id: string) => DRYING_LIMITS.find((l) => l.id === id)!;

  it("names the absences that were actually checked in the source", () => {
    //  Each of these was read off BatchDryer.{H,cpp} before being asserted:
    //  no diffusion or case-hardening mechanism, no integrated solid T, a
    //  constant declared air, a single lumped inventory, a declared k_Y, and
    //  a latent load published rather than ledgered.
    expect(prose(limit("falling-rate-law").body)).toContain("case hardening");
    expect(prose(limit("falling-rate-law").body))
      .toContain("no second falling-rate period");
    expect(prose(limit("solid-temperature").body))
      .toContain("cannot tell you the product temperature");
    expect(prose(limit("constant-air").body)).toContain("does not humidify");
    expect(prose(limit("no-spatial-resolution").body)).toContain("shrinkage");
    expect(prose(limit("no-spatial-resolution").body)).toContain("bed depth");
    expect(prose(limit("declared-transfer-coefficient").body))
      .toContain("Sherwood");
    expect(prose(limit("energy-from-outside").body)).toContain("UNAVAILABLE");
  });

  it("the engine really does refuse to price the drying heat", () => {
    //  The energy limit is a claim about the engine, so it is checked there.
    expect(ENGINE).toContain("outside the campaign boundary");
    expect(ENGINE).toContain("latentDuty_kW");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls, is centred, and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    expect(SRC).not.toContain("MethodSetupRail");
  });

  it("renders the definitions before the plot and the consequences after", () => {
    //  Matched at the RENDER site (`<XversusTSvg`), never at a definition or
    //  an import: an index taken anywhere else would compare the steps
    //  against a line thousands of characters from where the plot appears.
    const plot = SRC.indexOf("<XversusTSvg t={view.t}");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3, 4])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the plot`)
        .toBeLessThan(plot);
    expect(SRC.indexOf("{lessonStep(5)}"),
      "the consequences step is before the plot").toBeGreaterThan(plot);
    //  lastIndexOf, deliberately: the limits are rendered on BOTH returns,
    //  and the earlier occurrence is the no-data branch's.  It is the one in
    //  the branch that HAS a plot that has to sit after it.
    expect(SRC.lastIndexOf("{lessonLimits}"),
      "the limits are before the plot").toBeGreaterThan(plot);
  });

  it("puts the knobs in a two-column grid beside the plot", () => {
    expect(SRC).toContain('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    const grid = SRC.indexOf('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    const plot = SRC.indexOf("<XversusTSvg t={view.t}");
    expect(grid).toBeLessThan(plot);
    expect(SRC).toContain("<Stack gap={8}>{controls}</Stack>");
  });

  it("renders the lesson from ONE hoisted renderer, on BOTH returns", () => {
    //  One definition, and the no-data branch renders every step from it --
    //  so the explanation cannot vanish exactly when there is nothing to
    //  explain.  Two `const lessonStep` would be a second copy of the prose
    //  renderer, which is the shape this file exists to avoid.
    expect(SRC.match(/const lessonStep = /g)).toHaveLength(1);
    const empty = SRC.indexOf("[1, 2, 3, 4, 5].map(lessonStep)");
    expect(empty).toBeGreaterThan(0);
    expect(empty).toBeLessThan(SRC.indexOf("{lessonStep(1)}"));
  });

  it("keeps the equations in a bordered monospace box", () => {
    expect(SRC).toContain('ff="monospace"');
    expect(SRC).toContain('borderLeft: "3px solid var(--mantine-color-default-border)"');
  });

  it("still prints the engine's refusal verbatim", () => {
    //  A refusal is a teaching surface and must never be paraphrased away by
    //  a layout change.
    expect(SRC).toContain("{err}");
    expect(SRC).toContain(
      'title="The run refused or failed — the engine\'s message, verbatim"');
  });

  it("keeps the honesty chips and the absent-t_critical sentence", () => {
    //  Each of these carries a claim about provenance that the layout must
    //  not drop: the declared X_c, the GAB result, the air-owned latent duty,
    //  the engine's own falling-rate sentence, and the reasoned absence of a
    //  break time.
    expect(SRC).toContain("(declared input)");
    expect(SRC).toContain("(GAB result)");
    expect(SRC).toContain("falling-rate law: a MODELLING CHOICE");
    expect(SRC).toContain("t_critical NOT PUBLISHED");
    expect(SRC).toContain("Engine, verbatim:");
  });
});
