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
  The column-control lesson.  Two things are pinned here that a prose test
  usually is not:

  (1) THE ARITHMETIC IS RECOMPUTED, not quoted.  The degrees-of-freedom count
      the page prints is parsed back out of its own monospace block and the
      subtraction redone, so a page claiming five minus three is three would
      fail rather than teach.

  (2) THE TABLE IS CHECKED AGAINST THE CATALOGUE THAT DRAWS IT.  The naming
      convention printed in step 2 says which valve holds which level in each
      structure; the drawing is generated from
      data/standards/heuristics/columnControlStructures.dat.  Two homes for one
      fact, so the second is derived from the first here — a lesson teaching a
      wiring the tool does not draw is exactly the drift this arm exists for.

  And one thing this file deliberately does NOT do: it never asserts that a
  structure is good or bad.  The tool is of the SELECTION kind, and a test that
  pinned a preference would be pinning a claim with no author.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  COLUMN_CONTROL_LIMITS, COLUMN_CONTROL_STEPS,
} from "../src/ui/methods/columnControlLesson.js";
import { readHeuristicsCatalogue } from "../src/ui/methods/columnControlRecords.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/ColumnControlTool.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

/** Everything the reader can read on the page, whitespace-normalised. */
const ALL = prose(COLUMN_CONTROL_STEPS
  .map((s) => [s.title, s.body, s.formula ?? "", s.note ?? ""].join(" "))
  .join(" ")
  + " " + COLUMN_CONTROL_LIMITS.map((l) => l.title + " " + l.body).join(" "));

const step = (n: number) => COLUMN_CONTROL_STEPS.find((s) => s.n === n)!;

describe("the column-control lesson", () => {
  it("has five steps, numbered without a gap", () => {
    expect(COLUMN_CONTROL_STEPS).toHaveLength(5);
    expect(COLUMN_CONTROL_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("opens on the count, because the count is what makes it tractable", () => {
    //  Without the degrees-of-freedom arithmetic a reader meets a list of
    //  acronyms with no reason for the list to be that length.
    const s1 = step(1);
    expect(prose(s1.body)).toContain("five manipulable flows");
    expect(prose(s1.body)).toContain("empties or floods");
  });

  it("prints the count as arithmetic, and the arithmetic is right", () => {
    //  RECOMPUTED from the page's own block rather than agreed with: the
    //  numbers are parsed back out and the subtraction redone.
    const f = step(1).formula!;
    const valves = Number(/valves[^\n]*?(\d+)\s/.exec(f)![1]);
    const held = Number(/inventories[^\n]*?−(\d+)\s/.exec(f)![1]);
    const left = Number(/left for composition\s+(\d+)/.exec(f)![1]);
    expect(valves).toBe(5);
    expect(held).toBe(3);
    expect(valves - held).toBe(left);
    expect(left).toBe(2);
    //  And the five are named, so the count is checkable rather than asserted.
    for (const v of ["condenser duty", "D", "L", "V", "B"])
      expect(f, `the ${v} valve is not named`).toContain(v);
  });

  it("names the three inventories that are not optional", () => {
    const s1 = step(1);
    const all = prose(s1.body + " " + s1.formula! + " " + s1.note!);
    for (const inv of ["pressure", "drum level", "sump level"])
      expect(all.toLowerCase(), `${inv} is not named`).toContain(inv);
  });
});

describe("the naming convention agrees with the catalogue that draws it", () => {
  const cat = readHeuristicsCatalogue();

  /** The letter each valve name is written as in the lesson's table. */
  const LETTER: { [valve: string]: string } = {
    reflux: "L", boilup: "V", distillate: "D", bottoms: "B",
  };
  /** The row heading each catalogue structure is written under. */
  const ROW: { [name: string]: string } = {
    LV: "LV", LB: "LB", DV: "DV", DB: "DB", ratioLDVB: "(L/D)(V/B)",
  };

  /** The step-2 table, parsed back into rows. */
  const rows = new Map<string, string[]>();
  for (const line of step(2).formula!.split("\n").slice(1)) {
    const cells = line.trim().split(/\s{2,}/);
    if (cells.length === 4) rows.set(cells[0]!, cells);
  }

  it("parsed a row for every structure the table claims to list", () => {
    expect(rows.size).toBe(5);
  });

  it("every structure in the catalogue is named on the page", () => {
    //  DERIVED from the catalogue, so a structure added to the records and not
    //  to the lesson fails here rather than going unmentioned on a page that
    //  looks complete.  The label's own leading token is the name the reader
    //  sees on the selector.
    for (const s of cat.structures) {
      const head = s.label.split(" --")[0]!.trim();
      expect(ALL.toLowerCase(), `${s.name} is not mentioned in the lesson`)
        .toContain(head.toLowerCase());
    }
  });

  it("each row's wiring is the wiring the drawing is generated from", () => {
    for (const s of cat.structures) {
      const rowName = ROW[s.name];
      if (!rowName) continue;              // not tabulated; covered above
      const cells = rows.get(rowName);
      expect(cells, `no table row for ${s.name}`).toBeTruthy();
      const [, free, drum, sump] = cells!;

      const freeLetters = s.freeForComposition
        .map((v) => LETTER[v]!).sort().join(",");
      expect(free!.replace(/as ratios/, "").split(/\s*,\s*/)
        .map((t) => t.trim()).filter(Boolean).sort()
        .join(","), `${s.name}: free pair`).toBe(freeLetters);

      const by = (c: string) =>
        LETTER[s.loops.find((l) => l.controlled === c)!.manipulates]!;
      expect(drum, `${s.name}: drum level`).toBe(by("condenserLevel"));
      expect(sump, `${s.name}: sump level`).toBe(by("reboilerLevel"));
    }
  });
});

describe("it teaches a CHOICE, and never an answer", () => {
  it("says outright that there is no correct structure to arrive at", () => {
    expect(prose(step(5).body)).toContain("no correct structure");
    //  And the reason, which is the transferable half: a single confident
    //  recommendation is a rule the reader will misapply.
    expect(prose(step(5).body)).toContain("misapply");
  });

  it("gives the reader what the choice DEPENDS on, not a verdict", () => {
    const s5 = prose(step(5).body).toLowerCase();
    for (const dependency of ["tight specification", "reflux", "throughput"])
      expect(s5, `the choice's dependence on ${dependency} is missing`)
        .toContain(dependency);
  });

  it("offers single-ended control as a real option, with its cost", () => {
    //  The option a course rarely puts on the list, and the one a working
    //  engineer meets first.  Both halves must be there: it removes the
    //  interaction AND it costs energy.
    const s5 = prose(step(5).body);
    expect(s5).toContain("Single-ended LV");
    expect(s5).toContain("let the other float");
    expect(s5).toContain("costs energy");
  });

  it("names interaction as the difficulty, in both directions", () => {
    const s3 = prose(step(3).body);
    expect(s3).toContain("each loop");
    expect(s3.toLowerCase()).toContain("disturbance on the other");
    //  A pairing can look fine on a steady balance and still be hard to run.
    expect(s3).toContain("steady-state balance");
  });

  it("carries the pairing notation as a monospace block of its own", () => {
    const f = step(3).formula!;
    expect(f).toContain("T_top ← L");
    expect(f).toContain("T_top ← D");
    expect(f).toContain("T_bot ← V");
    expect(f).toContain("T_bot ← B");
  });

  it("never tells the reader which structure to use", () => {
    for (const banned of [
      "you should use", "the best structure", "the correct structure",
      "we recommend", "the right structure is",
    ])
      expect(ALL.toLowerCase(), `the page recommends: "${banned}"`)
        .not.toContain(banned);
  });
});

describe("the honest half — what the tool cannot do is said, not implied", () => {
  it("states that no relative gain is computed anywhere", () => {
    expect(ALL).toContain("no gain matrix");
    const l = COLUMN_CONTROL_LIMITS.find((x) => x.id === "no-relative-gain")!;
    expect(prose(l.body)).toContain("citation as a computation");
  });

  it("states that nothing here is a transient", () => {
    const l = COLUMN_CONTROL_LIMITS.find((x) => x.id === "no-dynamics")!;
    expect(prose(l.body)).toContain("accumulation term");
    expect(prose(l.body)).toContain("no response curve");
    //  And the STEPS make no claim about a response, since the tool solves no
    //  transient.  Scoped to the steps on purpose: the limits above have to be
    //  able to say "no settling time", and a banned-word list that could not
    //  tell a denial from a claim would forbid the honest sentence.
    const steps = prose(COLUMN_CONTROL_STEPS
      .map((s) => [s.title, s.body, s.formula ?? "", s.note ?? ""].join(" "))
      .join(" ")).toLowerCase();
    for (const banned of ["settling time", "overshoot", "rise time",
      "responds in", "seconds"])
      expect(steps, `a dynamic claim slipped into the steps: "${banned}"`)
        .not.toContain(banned);
  });

  it("keeps the temperature-for-composition substitution conditional", () => {
    const l = COLUMN_CONTROL_LIMITS
      .find((x) => x.id === "temperature-for-composition")!;
    expect(prose(l.body)).toContain("binary at fixed pressure");
    expect(prose(l.body)).toContain("share a bubble point");
    //  Step 4 names the sign trap, which is the half a ruler cannot see.
    expect(prose(step(4).note!)).toContain("changes sign");
    expect(prose(step(4).note!)).toContain("nearly deaf to the handle");
  });

  it("says the two tray criteria disagree and calls that the lesson", () => {
    const s4 = prose(step(4).body);
    expect(s4).toContain("DIFFERENT trays");
    expect(s4).toContain("rather than a defect");
    //  Both criteria, and the price of each: one solve against two.
    expect(step(4).formula!).toContain("one solve");
    expect(step(4).formula!).toContain("two solves");
    expect(prose(step(4).formula!)).toContain("u must be NAMED");
  });

  it("keeps every limit, by id", () => {
    const ids = COLUMN_CONTROL_LIMITS.map((l) => l.id);
    for (const id of ["no-dynamics", "no-relative-gain", "no-recommendation",
      "temperature-for-composition", "two-product-column",
      "structures-from-the-catalogue"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(new Set(ids).size, "duplicate limit id").toBe(ids.length);
    for (const l of COLUMN_CONTROL_LIMITS)
      expect(l.body.length, `${l.id} has no body`).toBeGreaterThan(60);
  });

  it("says the count is for a two-product column and not for every column", () => {
    const l = COLUMN_CONTROL_LIMITS.find((x) => x.id === "two-product-column")!;
    expect(prose(l.title + " " + l.body)).toContain("total condenser");
    expect(prose(l.body)).toContain("side draw");
    expect(prose(l.body)).toContain("changes the count");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  //  Comments are not code: a header describing chrome the file no longer uses
  //  would otherwise read as the chrome itself.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  it("scrolls, is centred, and is no longer a panel", () => {
    expect(code).toContain('overflowY: "auto"');
    expect(code).toContain("maxWidth: 940");
    expect(code).not.toContain("MethodSetupRail");
  });

  it("has ONE renderer, used by BOTH branches", () => {
    //  The no-structure branch is a real return, and a lesson defined inside
    //  the other one would vanish exactly when the catalogue could not be
    //  read — which is when a reader most needs to be told what they are
    //  looking at.
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
    const guard = SRC.indexOf("if (!structure) {");
    expect(guard).toBeGreaterThan(0);
    expect(SRC.indexOf("const lessonStep = "),
      "the renderer is defined inside a branch").toBeLessThan(guard);
    const empty = SRC.slice(guard, SRC.indexOf("const rules = "));
    expect(empty, "the empty state shows no lesson")
      .toContain("[1, 2, 3].map(lessonStep)");
    expect(empty).toContain("[4, 5].map(lessonStep)");
    expect(empty).toContain("{lessonLimits}");
    expect(empty).toContain('overflowY: "auto"');
  });

  it("puts the definitions before the interactive and the rest after", () => {
    //  The RENDER site, never an import: the drawing is <ColumnSection ...>,
    //  and the component's own definition sits hundreds of lines above it.
    const drawing = SRC.indexOf("<ColumnSection");
    expect(drawing).toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the drawing`)
        .toBeLessThan(drawing);
    for (const n of [4, 5])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is before the drawing`)
        .toBeGreaterThan(drawing);
    expect(SRC.lastIndexOf("{lessonLimits}"),
      "the limits are not last").toBeGreaterThan(SRC.indexOf("{lessonStep(5)}"));
  });

  it("renders a formula as a bordered monospace block", () => {
    //  This used to slice 1200 characters after `const lessonStep = ` in THIS
    //  tool and read the drawing out of them.  The drawing now lives in ONE
    //  place -- methods/lessonStep.tsx, which replaced seventeen private
    //  copies that had already drifted into seven variants -- so the claim
    //  splits in two: the tool must USE the shared renderer, and the shared
    //  renderer must still draw a bordered monospace block.
    expect(SRC).toContain("lessonStepper(COLUMN_CONTROL_STEPS)");
    const body = readFileSync(
      resolve(__dirname, "../src/ui/methods/lessonStep.tsx"), "utf8");
    expect(body).toContain("step.formula");
    expect(body).toContain('ff="monospace"');
    expect(body).toContain("borderLeft");
    //  Both monospace surfaces survive: the lesson's block and the engine's
    //  verbatim refusal.
    expect((SRC.match(/ff="monospace"/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
  });

  it("keeps the engine's refusal verbatim and the unread-record alert", () => {
    //  A refusal is a teaching surface and must never be paraphrased away by
    //  a layout change; a record the reader could not use is NAMED, never
    //  dropped.
    expect(SRC).toContain("{engineErr}");
    expect(SRC).toContain("The run refused or failed — the engine's message, verbatim");
    expect(SRC).toContain("catalogue.refusals.map");
  });

  it("still says on its own face what it computes and what it does not", () => {
    expect(prose(SRC)).toContain("It computes no relative gain");
    expect(prose(SRC)).toContain("the engine has no dynamic column");
  });
});
