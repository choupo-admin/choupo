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
  The McCabe-Thiele lesson.  Prose is the part of a tool that rots with
  nothing failing, so the argument is held as data and asserted to still run
  end to end.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MCCABE_LIMITS, MCCABE_STEPS } from "../src/ui/methods/mccabeLesson.js";

const WS = readFileSync(
  new URL("../src/ui/MethodsWorkspace.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

describe("the lesson runs end to end", () => {
  it("has five steps, numbered without a gap", () => {
    expect(MCCABE_STEPS).toHaveLength(5);
    expect(MCCABE_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("opens by tying the staircase back to the flash", () => {
    //  THE REASON THE FLASH TOOL COMES FIRST.  A student who meets the
    //  staircase cold learns a drawing procedure; one who has drawn a single
    //  flash learns that the staircase is that step repeated.  If this link
    //  is cut, the ordering of the whole EduTools list loses its point.
    const s1 = MCCABE_STEPS[0]!;
    expect(prose(s1.body)).toContain("A flash is one equilibrium stage");
    expect(prose(s1.note!)).toContain("Horizontal to the curve");
    expect(prose(s1.note!)).toContain("Vertical to the line");
  });

  it("carries the three lines a column actually has", () => {
    const f = MCCABE_STEPS.filter((s) => s.formula).map((s) => s.formula!);
    const all = f.join("\n");
    //  rectifying, stripping, q-line -- and the slope of the first is what
    //  the reflux knob turns, so R must appear in it.
    expect(all).toContain("R/(R+1)");
    expect(all).toContain("x_D/(R+1)");
    expect(all).toContain("q/(q−1)");
    expect(all).toContain("z_F/(q−1)");
  });

  it("says the straight lines are an assumption, in both places", () => {
    //  Constant molal overflow is what makes the operating lines straight.
    //  A page that draws them straight and never says why has taught a
    //  procedure and hidden its condition.
    const s2 = MCCABE_STEPS.find((s) => s.n === 2)!;
    expect(prose(s2.note!)).toContain("STRAIGHT, and that is an assumption");
    const cmo = MCCABE_LIMITS.find((l) => l.id === "cmo")!;
    expect(cmo.body).toContain("Constant molal overflow");
  });

  it("brackets the design between the two limits, and names the working range", () => {
    //  Total reflux and minimum reflux are both unbuildable, and that is what
    //  makes them useful.  A step that gave the limits without the range
    //  between them would be algebra with no decision in it.
    const s4 = MCCABE_STEPS.find((s) => s.n === 4)!;
    expect(s4.body).toContain("TOTAL REFLUX");
    expect(s4.body).toContain("MINIMUM REFLUX");
    expect(prose(s4.note!)).toContain("1.1 to 1.5");
  });

  it("explains the azeotrope as physics, not as a failure to converge", () => {
    const s5 = MCCABE_STEPS.find((s) => s.n === 5)!;
    expect(s5.body).toContain("AZEOTROPE");
    expect(prose(s5.body)).toContain("not a numerical problem");
  });

  it("keeps the ideal-stage and binary limits", () => {
    const ids = MCCABE_LIMITS.map((l) => l.id);
    for (const id of ["cmo", "ideal-stages", "binary", "one-pressure"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    //  A step is not a tray, and the gap is a factor a designer must apply.
    expect(MCCABE_LIMITS.find((l) => l.id === "ideal-stages")!.body)
      .toContain("efficiency");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls, and no longer pins the plot into a fixed rail", () => {
    const i = WS.indexOf("function McCabeTool(");
    const j = WS.indexOf("// ---- Psychrometric chart ---");
    expect(i).toBeGreaterThan(0);
    const fn = WS.slice(i, j);
    expect(fn).toContain('overflowY: "auto"');
    expect(fn, "still built as a MethodSetupRail panel")
      .not.toContain("MethodSetupRail");
  });

  it("renders the definitions before the diagram and the limits after", () => {
    //  The interactive is EARNED by the paragraphs above it.  Read the render
    //  order, not where the constant is declared: the import sits at the top
    //  of the file and a declaration-order test would pass whatever the page
    //  looked like.
    const i = WS.indexOf("function McCabeTool(");
    const fn = WS.slice(i, WS.indexOf("// ---- Psychrometric chart ---"));
    const plot = fn.indexOf("{plotPane}");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(fn.indexOf(`{step(${n})}`), `step ${n} renders after the diagram`)
        .toBeLessThan(plot);
    for (const n of [4, 5])
      expect(fn.indexOf(`{step(${n})}`), `step ${n} renders before the diagram`)
        .toBeGreaterThan(plot);
  });

  it("did not leak the lesson into its neighbour", () => {
    //  A whole-file replace put this lesson inside PsychroTool on the first
    //  attempt, because both functions end with the same eight lines.  The
    //  distillation steps must appear exactly once.
    //  Counted inside the FUNCTION, not the file: the import line names the
    //  constant too, and counting that made the first version of this test
    //  fail on a page that was correct.
    const i = WS.indexOf("function McCabeTool(");
    const fn = WS.slice(i, WS.indexOf("// ---- Psychrometric chart ---"));
    expect((fn.match(/MCCABE_STEPS/g) ?? []).length).toBe(1);
    const p = WS.indexOf("function PsychroTool(");
    expect(WS.slice(p)).not.toContain("MCCABE_");
  });
});
