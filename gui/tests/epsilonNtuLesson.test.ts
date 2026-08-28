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
  The effectiveness-NTU lesson.  Every arithmetic claim the page makes is
  RECOMPUTED here from the tool's own `epsilonNtu` -- the closed forms it
  draws and the engine transcribes -- rather than quoted.  A page that named
  a ceiling its own curves do not have, or a number its own plot does not
  show, would be teaching against its own code, and this file is what makes
  that fail rather than ship.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ENTU_LIMITS, ENTU_STEPS } from "../src/ui/methods/epsilonNtuLesson.js";
import { epsilonNtu } from "../src/ui/methods/EpsilonNtuTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/EpsilonNtuTool.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");
const step = (n: number) => ENTU_STEPS.find((s) => s.n === n)!;

describe("the lesson runs end to end", () => {
  it("has five steps, numbered without a gap", () => {
    expect(ENTU_STEPS).toHaveLength(5);
    expect(ENTU_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("opens on the question LMTD cannot answer", () => {
    //  The whole reason the method exists: the log-mean route needs all four
    //  terminal temperatures, and a design problem has only the two inlets.
    //  A page that opened with the definition of epsilon would have skipped
    //  the only motivation a student needs.
    const s1 = step(1);
    expect(prose(s1.body)).toContain("all FOUR terminal temperatures");
    expect(prose(s1.body)).toContain("the two INLETS and a piece of hardware");
    expect(s1.formula).toContain("Q = U·A·ΔT_lm");
    expect(s1.formula).toContain("Q = ε·C_min·(T_h,in − T_c,in)");
    //  And it says which route the engine actually takes, which is checkable
    //  in HeatExchanger.cpp: eps-NTU first, LMTD afterwards as a cross-check.
    expect(prose(s1.note!)).toContain("only then computes the LMTD");
  });

  it("derives Q_max and says why it is C_min and not C_max", () => {
    const s2 = step(2);
    expect(s2.formula).toContain("C_min = min(C_hot, C_cold)");
    expect(s2.formula).toContain("Q_max = C_min · (T_h,in − T_c,in)");
    //  The REASON, not just the rule: giving the full swing to the larger-C
    //  stream drives the smaller-C one past its partner's inlet.
    expect(prose(s2.body)).toContain("past the OTHER stream's inlet temperature");
    expect(prose(s2.body)).toContain("straight past its partner's inlet");
  });

  it("defines the two dimensionless numbers, and refuses to call ε an efficiency", () => {
    const s3 = step(3);
    expect(s3.formula).toContain("ε = Q / Q_max");
    expect(s3.formula).toContain("NTU = U·A / C_min");
    expect(prose(s3.note!)).toContain("not a thermodynamic efficiency");
    expect(prose(s3.note!)).toContain("FIRST-LAW maximum");
  });

  it("gives C_r its own step and both bracketing limits", () => {
    const s4 = step(4);
    expect(s4.formula).toContain("C_r = C_min / C_max");
    expect(s4.formula).toContain("ε = 1 − exp(−NTU)");
    expect(s4.formula).toContain("ε = NTU / (1 + NTU)");
    //  C_r = 0 is where the arrangement stops mattering; C_r = 1 is where it
    //  matters most.  Both halves, or the chart stays unreadable.
    expect(prose(s4.note!)).toContain("all three arrangements collapse onto ONE curve");
    expect(prose(s4.note!)).toContain("the hardest case");
  });
});

describe("the arithmetic the page prints is the arithmetic the code evaluates", () => {
  it("C_r = 0 really does collapse all three arrangements onto 1 − exp(−NTU)", () => {
    //  Step 4's first limit, recomputed from the tool's own closed forms.
    for (const NTU of [0.5, 1, 3, 6]) {
      const limit = 1 - Math.exp(-NTU);
      for (const cfg of ["counter", "co", "shell2pass"] as const)
        expect(epsilonNtu(cfg, NTU, 0), `${cfg} at NTU ${NTU}`)
          .toBeCloseTo(limit, 12);
    }
  });

  it("C_r = 1 counter-current really is NTU/(1+NTU)", () => {
    for (const NTU of [1, 3, 6, 50])
      expect(epsilonNtu("counter", NTU, 1)).toBeCloseTo(NTU / (1 + NTU), 12);
  });

  it("Q_max IS the infinite-area counterflow duty — and only counterflow reaches it", () => {
    //  Step 2's note.  Counter-current climbs to eps = 1 at every C_r; the
    //  other two do not, which is the whole content of the sentence.
    for (const Cr of [0, 0.25, 0.5, 0.75, 1])
      expect(epsilonNtu("counter", 1e6, Cr), `counter at C_r ${Cr}`)
        .toBeCloseTo(1, 5);
    expect(epsilonNtu("co", 1e6, 0.5)).toBeLessThan(0.9);
    expect(epsilonNtu("shell2pass", 1e6, 0.5)).toBeLessThan(0.9);
  });

  it("the co-current ceiling is 1/(1+C_r), so C_r = 1 really does stop at 0.5", () => {
    //  Step 4's note names 0.5 and step 5 names 0.667.  Both are recomputed
    //  from epsilonNtu at an NTU large enough that more area buys nothing.
    expect(epsilonNtu("co", 1e9, 1)).toBeCloseTo(0.5, 9);
    expect(prose(step(4).note!)).toContain("1/(1 + C_r) = 0.5");
    expect(epsilonNtu("co", 1e9, 0.5).toFixed(3)).toBe("0.667");
    expect(prose(step(5).body)).toContain("its ceiling is 1/(1 + C_r) = 0.667");
    //  And the claim that eps = 0.7 at C_r = 0.5 is UNREACHABLE co-current —
    //  the point of naming a ceiling at all.
    expect(epsilonNtu("co", 1e9, 0.5)).toBeLessThan(0.7);
  });

  it("the flattening numbers in step 5 are the tool's own curve", () => {
    //  "At C_r = 0.5 the first three NTU buy 0.87; the next three buy 0.10
    //  more."  Quoted nowhere: recomputed, at the same rounding the prose
    //  prints, so a changed closed form moves the sentence or fails here.
    const e3 = epsilonNtu("counter", 3, 0.5);
    const e6 = epsilonNtu("counter", 6, 0.5);
    expect(e3.toFixed(2)).toBe("0.87");
    expect((e6 - e3).toFixed(2)).toBe("0.10");
    const s5 = prose(step(5).body);
    expect(s5).toContain("first three NTU buy an effectiveness of 0.87");
    expect(s5).toContain("buy 0.10 more");
    //  The SHAPE claim behind the numbers: each extra NTU buys less than the
    //  one before it, over the whole plotted range.
    let prevGain = Infinity;
    for (let n = 1; n <= 6; ++n) {
      const gain = epsilonNtu("counter", n, 0.5) - epsilonNtu("counter", n - 1, 0.5);
      expect(gain, `NTU ${n - 1}->${n} must buy less than the step before`)
        .toBeLessThan(prevGain);
      prevGain = gain;
    }
  });
});

describe("the design consequence, and the honest half", () => {
  it("says the trade-off is decided by prices, not by this plot", () => {
    //  A page that stopped at "beyond the bend you buy little" would invite
    //  a threshold read as a rule.  The cost side is not on the chart and
    //  the page must say so.
    const s5 = step(5);
    expect(prose(s5.body)).toContain("paying area for duty that is no longer there");
    expect(prose(s5.note!)).toContain("depends on prices");
    expect(prose(s5.note!)).toContain("pumping power");
  });

  it("keeps every limit, each naming something the code really omits", () => {
    const ids = ENTU_LIMITS.map((l) => l.id);
    for (const id of ["sensible-only", "constant-U", "no-fouling",
      "no-pressure-drop", "arrangements"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(ENTU_LIMITS).toHaveLength(5);
  });

  it("does not let the C_r = 0 curve be mistaken for a phase change the unit models", () => {
    //  HeatExchanger.cpp changes T only -- F, z, P and vf pass through, and
    //  c_p is read from the declared phase.  So the chart's C_r = 0 line is
    //  reachable on the plot and NOT by boiling a stream in this unit.
    const l = ENTU_LIMITS.find((x) => x.id === "sensible-only")!;
    expect(prose(l.body)).toContain("is not something this unit solves");
    expect(prose(l.body)).toContain("starving one side's flow");
    //  And the caption under the chart says the same thing where the curve
    //  is actually drawn.
    expect(prose(SRC)).toContain("models sensible heat only");
  });

  it("names the fouling, pressure-drop and arrangement gaps concretely", () => {
    const byId = Object.fromEntries(ENTU_LIMITS.map((l) => [l.id, l]));
    expect(prose(byId["no-fouling"]!.body)).toContain("no fouling term");
    //  The dP is COMPUTED in geometry mode and never applied -- reported is
    //  not the same as charged, and the difference is the honest part.
    expect(prose(byId["no-pressure-drop"]!.body))
      .toContain("reported and not applied");
    //  The unit reads `flow` as a word and defaults everything it does not
    //  recognise to counter-current, silently.
    expect(prose(byId["arrangements"]!.body))
      .toContain("silently counter-current rather than refused");
    expect(prose(byId["arrangements"]!.body)).toContain("Crossflow");
    //  One U for the whole area, while each c_p IS taken at a mean T -- the
    //  asymmetry is real and is stated rather than smoothed over.
    expect(prose(byId["constant-U"]!.body)).toContain("used unchanged along the entire area");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  //  Comments are not code: the header describes the page, so the panel test
  //  reads the stripped source (the hunterNash precedent).
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  it("scrolls, is centred, and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE page, so the empty state carries the lesson too", () => {
    //  Not a second scrolling root and not an early return: the no-data
    //  branch is a cell INSIDE the same page, between the definitions and
    //  the consequence.
    expect((SRC.match(/overflowY: "auto"/g) ?? []).length).toBe(1);
    const empty = SRC.indexOf("No exchanger point in this run");
    expect(empty).toBeGreaterThan(0);
    expect(SRC.indexOf("{lessonStep(1)}")).toBeLessThan(empty);
    expect(SRC.indexOf("{lessonStep(5)}")).toBeGreaterThan(empty);
    expect(SRC.indexOf("{lessonLimits}")).toBeGreaterThan(empty);
  });

  it("has ONE hoisted lesson renderer", () => {
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    expect((SRC.match(/const lessonLimits = /g) ?? []).length).toBe(1);
  });

  it("renders the definitions before the chart and the consequence after", () => {
    //  The RENDER SITE, not an import: <SolvedView is where the epsilon-NTU
    //  families and the engine's point are actually drawn.
    const plot = SRC.indexOf("<SolvedView");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3, 4])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is not before the chart`)
        .toBeLessThan(plot);
    expect(SRC.indexOf("{lessonStep(5)}"), "the consequence is not after the chart")
      .toBeGreaterThan(plot);
    expect(SRC.indexOf("{lessonLimits}"), "the limits are not after the chart")
      .toBeGreaterThan(plot);
  });

  it("puts the knobs in a two-column grid beside the chart", () => {
    expect(SRC).toContain('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    expect(SRC).toContain("<Stack gap={8}>{controls}</Stack>");
  });

  it("sets the equations in a bordered monospace box", () => {
    expect(SRC).toContain('ff="monospace"');
    expect(SRC).toMatch(/border: "1px solid var\(--mantine-color-default-border\)"/);
  });

  it("still prints the engine's refusal verbatim, and keeps the no-match finding", () => {
    //  A refusal is a teaching surface and must never be paraphrased away by
    //  a layout change; nor may the cross-check finding be dropped.
    expect(SRC).toContain("{err}");
    expect(SRC).toContain('title="The engine refused this run"');
    expect(SRC).toContain("no configuration matches — a finding");
    expect(SRC).toContain("The engine&apos;s point never moves");
  });

  it("renders the limits from the data, not from a second copy in the tool", () => {
    expect(SRC).toContain("ENTU_LIMITS.map");
    expect(SRC).toContain("ENTU_STEPS.find");
  });
});
