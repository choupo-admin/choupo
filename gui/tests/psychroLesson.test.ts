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
  The psychrometric-chart lesson.  Prose is the part of a tool that rots with
  nothing failing, so the argument is held as data and asserted to still run
  end to end.

  Two of these tests are about HONESTY rather than about teaching, and they
  are the ones to keep if anything is ever trimmed: the chart is drawn at ONE
  total pressure, and the wet-bulb and adiabatic-saturation temperatures are
  two different quantities that air-water happens to bring together.  A page
  that quietly dropped either would still read well.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PSYCHRO_LIMITS, PSYCHRO_STEPS } from "../src/ui/methods/psychroLesson.js";

const WS = readFileSync(
  new URL("../src/ui/MethodsWorkspace.tsx", import.meta.url), "utf-8");
const prose = (s: string): string => s.replace(/\s+/g, " ");

//  The tool is the LAST function in the file, so its slice runs to the end.
//  Sliced by index, never matched across the file: this tool and McCabeTool
//  end with the same lines.
const psychroSlice = (): string => {
  const i = WS.indexOf("function PsychroTool(");
  expect(i, "PsychroTool is no longer defined in MethodsWorkspace.tsx")
    .toBeGreaterThan(0);
  return WS.slice(i);
};

describe("the lesson runs end to end", () => {
  it("has five steps, numbered without a gap", () => {
    expect(PSYCHRO_STEPS).toHaveLength(5);
    expect(PSYCHRO_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    for (const s of PSYCHRO_STEPS) {
      expect(s.title.length, `step ${s.n} has no title`).toBeGreaterThan(0);
      expect(s.body.length, `step ${s.n} has no body`).toBeGreaterThan(0);
    }
  });

  it("opens on the axes, and says WHY the basis is the dry gas", () => {
    //  The dry-air basis is the one thing about this chart a student is most
    //  often taught to use and never told the reason for.  It is the reason
    //  every balance on the chart is a subtraction.
    const s1 = PSYCHRO_STEPS[0]!;
    expect(prose(s1.body)).toContain("DRY-BULB");
    expect(prose(s1.body)).toContain("HUMIDITY RATIO Y");
    expect(prose(s1.body)).toContain("mass of DRY carrier gas");
    expect(prose(s1.note!)).toContain(
      "passes through a heater, a dryer or a cooling coil UNCHANGED");
    expect(prose(s1.formula!)).toContain("Y = (M_v / M_c) · p_v / (P − p_v)");
  });

  it("makes the saturation curve a ceiling and RH a ratio of PRESSURES", () => {
    const s2 = PSYCHRO_STEPS.find((s) => s.n === 2)!;
    expect(prose(s2.body)).toContain("SATURATION CURVE");
    expect(prose(s2.body)).toContain("ratio of PRESSURES and not of humidities");
    expect(prose(s2.formula!)).toContain("φ = p_v / P_sat(T)");
    //  RH moves with nothing added or removed -- which is why Y is the
    //  variable a mass balance can be written in and φ is not.
    expect(prose(s2.note!)).toContain("heat the gas at constant Y and φ falls");
    expect(prose(s2.note!)).toContain("DEW POINT");
  });

  it("teaches wet bulb as a BALANCE and as the floor of evaporative cooling", () => {
    const s3 = PSYCHRO_STEPS.find((s) => s.n === 3)!;
    expect(prose(s3.body)).toContain("where the two rates cancel");
    expect(prose(s3.body)).toContain("FLOOR for any adiabatic humidification");
    //  The enthalpy argument is what makes an adiabatic line STRAIGHT.
    expect(prose(s3.body)).toContain("constant-enthalpy lines");
    const f = prose(s3.formula!);
    expect(f).toContain("c_s · (T − T_as) = ( Y_sat(T_as) − Y ) · λ(T_as)");
    expect(f).toContain("c_s = c_p,carrier + Y · c_p,vapour");
    expect(f).toContain("h = c_s · (T − T₀) + Y · λ(T₀)");
  });

  it("keeps the wet-bulb / adiabatic-saturation distinction, and calls Le ≈ 1 a coincidence", () => {
    //  THE HONESTY TEST.  The engine emits the two families SEPARATELY
    //  (`adiabatic:<Tas>` and `wetbulb:<Tas>`, the second scaled by
    //  Le^(2/3)).  A page that let the reader think they are one quantity
    //  would be describing a chart this tool does not draw, and would be
    //  wrong for every pair that is not air-water.
    const s3 = PSYCHRO_STEPS.find((s) => s.n === 3)!;
    const n = prose(s3.note!);
    expect(n).toContain("ARE NOT THE SAME QUANTITY");
    expect(n).toContain("Lewis number Le = α/D_AB");
    expect(n).toContain("coincide when Le ≈ 1");
    expect(n).toContain("not a law");
    expect(n).toContain("SEPARATE families");
    expect(prose(s3.formula!)).toContain("Le^(2/3)");
  });

  it("draws all four processes, with the mixing lever rule named", () => {
    const s4 = PSYCHRO_STEPS.find((s) => s.n === 4)!;
    const b = prose(s4.body);
    for (const move of ["HEATING", "DEHUMIDIFICATION",
      "ADIABATIC HUMIDIFICATION", "MIXING"])
      expect(b, `the ${move} path is missing`).toContain(move);
    //  Each move has a DIRECTION, and the direction is the lesson.
    expect(b).toContain("horizontal to the right");
    expect(b).toContain("horizontal to the left until the saturation curve");
    expect(b).toContain("dew point");
    expect(b).toContain("UP a wet-bulb line");
    expect(b).toContain("straight segment");
    //  The same lever rule as the flash and the extraction triangle.
    expect(prose(s4.note!)).toContain("LEVER RULE");
    expect(prose(s4.note!)).toContain("extraction triangle");
    expect(prose(s4.formula!))
      .toContain("Y_m = (G₁·Y₁ + G₂·Y₂) / (G₁ + G₂)");
  });

  it("says the chart is drawn at ONE pressure, and names the altitude trap", () => {
    //  THE OTHER HONESTY TEST.  P is in the definition of Y and on neither
    //  axis, so a chart read at the wrong pressure is wrong with nothing
    //  looking wrong.
    const s5 = PSYCHRO_STEPS.find((s) => s.n === 5)!;
    const b = prose(s5.body);
    expect(b).toContain("nowhere on the axes");
    expect(b).toContain("Y rises as P falls");
    expect(b).toContain("altitude trap");
    expect(prose(s5.note!)).toContain("redraw the chart at the pressure you actually have");
  });

  it("keeps every limit, by id", () => {
    const ids = PSYCHRO_LIMITS.map((l) => l.id);
    for (const id of ["one-pressure", "ideal-gas", "pure-condensable",
      "wetbulb-needs-transport", "no-enthalpy-lines", "no-process-paths",
      "carrier-is-not-air"])
      expect(ids, `limit ${id} went missing`).toContain(id);
    expect(new Set(ids).size, "a limit id is duplicated").toBe(ids.length);
  });

  it("reports the absences as absences, not as agreement", () => {
    //  A missing wet-bulb family means missing transport data.  Reading it
    //  as "Le = 1, so the two coincide" is absence read as affirmation.
    const wb = PSYCHRO_LIMITS.find((l) => l.id === "wetbulb-needs-transport")!;
    expect(prose(wb.body)).toContain("never that Le = 1");
    //  The engine emits four curve families and no enthalpy scale; the page
    //  must not describe lines the reader cannot trace.
    const en = PSYCHRO_LIMITS.find((l) => l.id === "no-enthalpy-lines")!;
    expect(prose(en.body)).toContain("four families");
    //  Y scales with the carrier's molar mass, and the default carrier is
    //  not air -- a gap in the data, said out loud.
    const air = PSYCHRO_LIMITS.find((l) => l.id === "carrier-is-not-air")!;
    expect(prose(air.body)).toContain("28.013");
    expect(prose(air.body)).toContain("28.96");
  });
});

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls, and no longer pins the chart into a fixed rail", () => {
    const fn = psychroSlice();
    expect(fn).toContain('overflowY: "auto"');
    expect(fn).toContain("maxWidth: 940");
    expect(fn, "still built as a MethodSetupRail panel")
      .not.toContain("MethodSetupRail");
  });

  it("renders the definitions before the chart and the consequences after", () => {
    //  The interactive is EARNED by the paragraphs above it.  Read the RENDER
    //  site, not the import: the import sits at the top of the file and a
    //  declaration-order test would pass whatever the page looked like.
    const fn = psychroSlice();
    const plot = fn.indexOf("{plotPane}");
    expect(plot, "the chart is no longer rendered through {plotPane}")
      .toBeGreaterThan(0);
    //  ONE chart on the page, at that one site.
    expect((fn.match(/<PsychroPlot/g) ?? []).length,
      "the chart is drawn more than once").toBe(1);
    expect(fn.indexOf("<PsychroPlot")).toBeLessThan(plot);
    for (const n of [1, 2, 3])
      expect(fn.indexOf(`{step(${n})}`), `step ${n} renders after the chart`)
        .toBeLessThan(plot);
    for (const n of [4, 5])
      expect(fn.indexOf(`{step(${n})}`), `step ${n} renders before the chart`)
        .toBeGreaterThan(plot);
    //  The limits close the page, after everything else.
    expect(fn.indexOf("PSYCHRO_LIMITS.map"))
      .toBeGreaterThan(fn.indexOf("{step(5)}"));
  });

  it("keeps the alerts and the hand-off the instrument panel had", () => {
    const fn = psychroSlice();
    //  The engine's own refusal, verbatim, and the pair guard.
    expect(fn).toContain("Pick a humid-gas pair");
    expect(fn).toContain("Solver advisory");
    expect(fn).toContain("{alerts}");
    expect(fn).toContain("<HandOffFooter");
  });

  it("did not leak the neighbouring lesson into this one", () => {
    //  A whole-file replace once put the DISTILLATION lesson inside this
    //  tool, because both functions end with the same lines.  The two must
    //  stay disjoint, in both directions.
    const fn = psychroSlice();
    expect(fn, "the McCabe lesson leaked into the psychrometric chart")
      .not.toContain("MCCABE_");
    expect((fn.match(/PSYCHRO_STEPS/g) ?? []).length).toBe(1);
    expect((fn.match(/PSYCHRO_LIMITS/g) ?? []).length).toBe(1);

    const i = WS.indexOf("function McCabeTool(");
    const mccabe = WS.slice(i, WS.indexOf("// ---- Psychrometric chart ---"));
    expect(i).toBeGreaterThan(0);
    expect(mccabe, "the psychrometric lesson leaked into McCabe-Thiele")
      .not.toContain("PSYCHRO_");
    expect((mccabe.match(/MCCABE_STEPS/g) ?? []).length).toBe(1);
  });
});
