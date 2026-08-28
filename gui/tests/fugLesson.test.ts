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
  The shortcut-distillation lesson.  What is pinned here is the ARGUMENT, not
  the wording: that the page still names the two derived limits, still says out
  loud that the third step is a FIT and not a derivation, still says where the
  constant-alpha assumption is used, and still renders the definitions before
  the plot and the consequences after it.

  Prose is the part of a tool that rots with nothing failing, which is why the
  steps are data and why this file exists.

  WHITESPACE IS NORMALISED before every prose assertion: the strings are
  concatenated across source lines, so an assertion made against the raw text
  would be testing where the formatter put a line break.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FUG_LIMITS, FUG_STEPS } from "../src/ui/methods/fugLesson.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/FugShortcutTool.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

const step = (n: number) => {
  const st = FUG_STEPS.find((s) => s.n === n);
  if (!st) throw new Error(`step ${n} is missing from FUG_STEPS`);
  return st;
};

describe("the lesson runs end to end", () => {
  it("has five steps, numbered without a gap", () => {
    expect(FUG_STEPS).toHaveLength(5);
    expect(FUG_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("every step carries a title and a body", () => {
    for (const s of FUG_STEPS) {
      expect(s.title.length, `step ${s.n} has no title`).toBeGreaterThan(10);
      expect(s.body.length, `step ${s.n} has no body`).toBeGreaterThan(200);
    }
  });

  it("ties the construction to the McCabe-Thiele staircase the reader drew", () => {
    //  The EduTools order only pays off if each page says what it is the same
    //  as.  FUG answers McCabe's question without the diagram, and its two
    //  limits ARE two McCabe pictures.
    const s1 = prose(step(1).body);
    expect(s1).toContain("McCabe-Thiele");
    expect(s1).toContain("BINARY");
    const n1 = prose(step(1).note!);
    expect(n1).toContain("45°");
    expect(n1).toContain("pinch");
  });

  it("names the two keys and says both recoveries are to the distillate", () => {
    //  ShortcutColumn.cpp reads recoveryLK and recoveryHK as the fraction of
    //  each key's FEED leaving in the DISTILLATE (the witness declares 0.99
    //  and 0.01).  A page that called recoveryHK "to the bottoms" would send
    //  the reader to type 0.99 into a key that wants 0.01.
    const f1 = prose(step(1).formula!);
    expect(f1).toContain("α_i,HK = K_i / K_HK");
    expect(f1).toContain("recoveryLK");
    expect(f1).toContain("recoveryHK");
    expect(f1).toContain("DISTILLATE");
    expect(f1).not.toContain("to the bottoms");
  });
});

describe("Fenske: the minimum-stages limit, and the assumption under it", () => {
  it("prints the Fenske expression", () => {
    const f = prose(step(2).formula!);
    expect(f).toContain("N_min = ln[ (x_LK/x_HK)_D · (x_HK/x_LK)_B ] / ln α_LK,HK");
  });

  it("says it is a LIMIT and not an operating point", () => {
    const b = prose(step(2).body);
    expect(b).toContain("total reflux");
    expect(b).toContain("LIMIT rather than a design");
    //  The design consequence, not just the algebra: at total reflux the
    //  column makes no product, so nobody runs there.
    expect(b).toContain("makes no product");
    expect(b).toContain("horizontal asymptote");
  });

  it("calls constant α an ASSUMPTION, in the same breath as the formula", () => {
    //  The single sentence this project is most likely to be burned by if it
    //  goes missing: α is one frozen number standing in for something that
    //  varies down the column.
    const n = prose(step(2).note!);
    expect(n).toContain("α is CONSTANT here");
    expect(n).toContain("that is an assumption, not a fact");
    expect(n).toContain("feed bubble point".toUpperCase());
    //  And it does not pretend Choupo's frozen α is the textbook α_avg.
    expect(n).toContain("α_avg");
    expect(n).toContain("geometric mean");
  });
});

describe("Underwood: the minimum-reflux limit and the root that is fiddly", () => {
  it("prints both halves — the θ equation and the R_min sum", () => {
    const f = prose(step(3).formula!);
    expect(f).toContain("Σ_i α_i z_i / (α_i − θ) = 1 − q");
    expect(f).toContain("R_min + 1 = Σ_i α_i x_D,i / (α_i − θ)");
  });

  it("says what R_min MEANS, not just how it is computed", () => {
    const b = prose(step(3).body);
    expect(b).toContain("pinch");
    //  The design consequence: below R_min no column of any height works.
    expect(b).toContain("unreachable at any height");
    expect(b).toContain("vertical asymptote");
  });

  it("explains why picking the right root is the fiddly part", () => {
    //  ShortcutColumn.cpp bisects in (1, α_LK) precisely because every α_i is
    //  a pole.  If the page loses this, the reader has no way to know that a
    //  root from another branch looks exactly as plausible.
    const n = prose(step(3).note!);
    expect(n).toContain("asymptote at EVERY component volatility");
    expect(n).toContain("BETWEEN THE TWO KEY VOLATILITIES");
    expect(n).toContain("θ ∈ (α_HK, α_LK)");
    expect(n).toContain("(1, α_LK)");
    expect(n).toContain("bisection");
    //  And the honest consequence of getting it wrong.
    expect(n).toContain("nothing about it looks wrong");
    //  Underwood's own second assumption, stated where it is used.
    expect(n).toContain("constant molar overflow");
  });
});

describe("Gilliland: the honesty point this page exists to make", () => {
  it("says PLAINLY that it is a correlation fitted to data", () => {
    //  The most important sentence on the page.  It must be in the step's own
    //  body, not only in a limits box further down.
    const b = prose(step(4).body);
    expect(b).toContain("FITTED THROUGH A SCATTER");
    //  The attribution the first draft carried (a date and a name) came from
    //  this repository's own theory guide and was never checked against a
    //  primary source, so it is not stated as fact.  What the page CLAIMS is
    //  the kind of thing Gilliland is, and that is what this pins.
    expect(b).toContain("fitted through a scatter".toUpperCase());
    expect(prose(step(4).body)).not.toContain("1940");
    expect(b).toContain(
      "Nothing about it is deduced from a material balance or an equilibrium"
      + " relation");
    expect(prose(step(4).title)).toContain("not a derivation");
  });

  it("prints the two normalised coordinates and the closed form", () => {
    const f = prose(step(4).formula!);
    expect(f).toContain("X = (R − R_min) / (R + 1)");
    expect(f).toContain("Y = (N − N_min) / (N + 1)");
    expect(f).toContain("(1 + 54.4 X) / (11 + 117.2 X)");
    expect(f).toContain("(X − 1) / √X");
  });

  it("separates the two KINDS of claim, and draws the consequence", () => {
    const n = prose(step(4).note!);
    expect(n).toContain("as good as their assumptions");
    expect(n).toContain("as good as a correlation");
    //  The consequence a reader can act on: the disagreement with a rigorous
    //  column is not the same size everywhere, and near total reflux what is
    //  left is Fenske alone.
    expect(n).toContain("not the same size everywhere");
    expect(n).toContain("Fenske alone");
  });
});

describe("what the shortcut buys and what it cannot tell you", () => {
  it("states the purchase — a first size, in seconds, before a column exists", () => {
    const b = prose(step(5).body);
    expect(b).toContain("FIRST SIZE");
    expect(b).toContain("before any column exists");
  });

  it("names each thing it cannot tell you, and why", () => {
    const b = prose(step(5).body);
    //  No profiles: it returns a count, not a column.
    expect(b).toContain("no composition or temperature PROFILES");
    expect(b).toContain("a count, not a column");
    //  The feed stage is empirical, and it is named.
    expect(b).toContain("Kirkbride");
    expect(b).toContain("empirical fit, not a derivation");
    //  Non-ideal: the sharp form of the claim, not a vague "less accurate".
    expect(b).toContain("no azeotrope is representable at all");
    expect(b).toContain("an answer to a system that does not exist");
  });

  it("prints the Kirkbride correlation with its empirical exponent", () => {
    //  ShortcutColumn.cpp raises the bracket to 0.206.  Printing the exponent
    //  is what makes "empirical" checkable rather than a word.
    expect(prose(step(5).formula!)).toContain("^0.206");
  });

  it("does not attribute the shortcut/rigorous gap to a single cause", () => {
    //  Two candidates, unseparated on this system: Gilliland's scatter and
    //  the frozen α.  Claiming one would be an overclaim the measurement
    //  does not support.
    const n = prose(step(5).note!);
    expect(n).toContain("does not attribute it to one cause");
    expect(n).toContain("have not been separated");
    expect(n).toContain("the shortcut designs, the rigorous column verifies");
  });
});

describe("the limits survive", () => {
  it("keeps every limit id", () => {
    const ids = FUG_LIMITS.map((l) => l.id);
    for (const id of [
      "constant-alpha", "constant-molar-overflow", "gilliland-is-a-fit",
      "kirkbride-feed-stage", "stage-count-not-a-design", "equilibrium-stages",
      "no-profiles",
    ])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(new Set(ids).size, "duplicate limit id").toBe(ids.length);
  });

  it("each limit says something, and the sharp ones stay sharp", () => {
    for (const l of FUG_LIMITS)
      expect(l.body.length, `limit ${l.id} is empty`).toBeGreaterThan(80);
    expect(prose(FUG_LIMITS.find((l) => l.id === "constant-alpha")!.body))
      .toContain("no azeotrope is representable at all");
    expect(prose(FUG_LIMITS.find((l) => l.id === "equilibrium-stages")!.body))
      .toContain("Murphree");
    expect(prose(FUG_LIMITS.find((l) => l.id === "gilliland-is-a-fit")!.body))
      .toContain("scatter");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    expect(SRC).not.toContain("MethodSetupRail");
  });

  it("renders the definitions before the plot and the consequences after", () => {
    //  The RENDER site, not the lazy import at the top of the file -- the
    //  plot pane is declared as a lazy module hundreds of lines above where
    //  it actually appears, and matching the declaration would compare the
    //  steps against the wrong line entirely.
    const plot = SRC.indexOf("<StagesVsRefluxPlot");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3, 4])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is not before the plot`)
        .toBeLessThan(plot);
    expect(SRC.indexOf("{lessonStep(5)}"),
      "the consequences step must come after the plot")
      .toBeGreaterThan(plot);
    expect(SRC.indexOf("{lessonLimits}"),
      "the limits must come after the plot")
      .toBeGreaterThan(plot);
  });

  it("renders the lesson from ONE hoisted renderer", () => {
    //  A second copy of the prose in the empty branch would be a second home
    //  for it, and the two would drift.
    expect(SRC.match(/const lessonStep = /g) ?? []).toHaveLength(1);
    expect(SRC.match(/const lessonLimits = /g) ?? []).toHaveLength(1);
    //  ...and the renderer reads the DATA, never an inlined string.
    expect(SRC).toContain("FUG_STEPS.find");
    expect(SRC).toContain("FUG_LIMITS.map");
  });

  it("keeps the lesson on screen when the engine has produced nothing", () => {
    //  The empty state lives INSIDE the same scrolling lesson: step 1 above
    //  it, step 5 and the limits below it.  A tool that hides its explanation
    //  exactly when there is nothing to explain is backwards.
    const empty = SRC.indexOf("No shortcut answer yet");
    expect(empty).toBeGreaterThan(0);
    expect(SRC.indexOf("{lessonStep(1)}")).toBeLessThan(empty);
    expect(SRC.indexOf("{lessonStep(5)}")).toBeGreaterThan(empty);
    expect(SRC.indexOf("{lessonLimits}")).toBeGreaterThan(empty);
    //  ...and there is exactly one scroll container, so there is no second
    //  early-return branch that could omit it.
    expect(SRC.match(/overflowY: "auto"/g) ?? []).toHaveLength(1);
  });

  it("keeps the honesty surfaces the tool already had", () => {
    //  The engine's own declared-approximation record, verbatim, and the
    //  verbatim WASM refusals.  A layout change must never paraphrase a
    //  refusal away.
    expect(SRC).toContain(
      'title="The engine records this run as a declared approximation"');
    expect(SRC).toContain("{d.locus}");
    expect(SRC).toContain("{f.label}: {f.message}");
    expect(SRC).toContain(
      'title="The ladder did not reach the separation"');
    //  The four assumptions still priced against this run's own α.
    //  Normalised: an assertion against the raw text would be testing where
    //  the formatter put a line break, not what the page says.
    const src = prose(SRC);
    expect(src).toContain("frozen at the feed bubble point");
    expect(src).toContain("correlation fitted to data");
    expect(src).toContain("constant molar overflow");
    expect(src).toContain("stage count, not a design");
  });

  it("puts the knobs in a two-column grid beside the plot", () => {
    expect(SRC).toContain('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    const grid = SRC.indexOf('gridTemplateColumns: "minmax(200px, 240px) 1fr"');
    expect(grid).toBeLessThan(SRC.indexOf("<StagesVsRefluxPlot"));
  });
});
