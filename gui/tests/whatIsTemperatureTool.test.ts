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
  What the `notes` tool needs in order not to be a page that looks finished and
  shows nothing.

  It was shipped with none of this, and the gap was found the way gaps are:
  the owner opened the site and the tool was not there (a cancelled publish),
  and checking THAT turned up the question nobody had asked -- is the witness
  in the browser bundle at all, and does the one knob hit the key it claims?
  A tool whose case is missing renders an empty plot with no error.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { applyScalarOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { readFileSync } from "node:fs";

import {
  C2_UM_K, CHANG_CIRCLES, CHANG_CITATION, ITS90_ABOVE_WATER, ITS90_TOP_K,
  LADDER, LADDER_WITNESS,
  T_HOT_C, T_HOT_K, T_PT_MELT_C, T_PT_MELT_K, T_SUBJECT_K,
  TEMPERATURE_WITNESS, emissivityBand_K, emissivitySensitivity, readLadder,
  readZScan, rungDeparturePct, worstDeparturePct,
} from "../src/ui/methods/WhatIsTemperatureTool.js";

const PROPS = "system/propsDict";

describe("the witness reaches the browser", () => {
  it("is in the bundled corpus, with the dict the knob rewrites", () => {
    const t = tutorialByName(TEMPERATURE_WITNESS);
    expect(t, `${TEMPERATURE_WITNESS} is not bundled — the tool would draw `
      + "an empty plot and report no error").toBeTruthy();
    expect(Object.keys(t!.files.rawFiles ?? {})).toContain(PROPS);
  });

  it("runs choupoProps on a propertyScan1D that writes the CSV the tool reads", () => {
    const props = tutorialByName(TEMPERATURE_WITNESS)!.files.rawFiles![PROPS]!;
    expect(props).toContain("propertyScan1D");
    //  The tool reads this exact filename back out of the run.  Rename it in
    //  the case and the page goes blank in silence.
    expect(props).toContain("gasThermometer.csv");
    expect(props).toContain("Z");
  });

  it("scans at the temperature the page is about", () => {
    const props = tutorialByName(TEMPERATURE_WITNESS)!.files.rawFiles![PROPS]!;
    //  The prose and the run must be talking about the same state; a page
    //  arguing about 500.012 K over a scan at some other temperature would be
    //  wrong in the one way a reader cannot see.
    expect(props).toContain(`${T_SUBJECT_K} K`);
  });

  it("the pressure knob rewrites a key that is there, exactly once", () => {
    const props = tutorialByName(TEMPERATURE_WITNESS)!.files.rawFiles![PROPS]!;
    const out = applyScalarOverride(props,
      { file: PROPS, key: "to", value: 2e7, occurrence: 1 });
    expect(out).not.toBe(props);
    expect(out).toMatch(/^[ \t]*to[ \t]+20000000[ \t]*Pa[ \t]*;/m);
  });
});

describe("the readings, over the engine's own CSV", () => {
  const csv = "P,Z,v_molar\n1.0e+03,1.0000047,4.157\n5.0e+06,1.0244,0.000851\n";

  it("reads the two columns it needs and ignores the rest", () => {
    const rows = readZScan(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.P).toBeCloseTo(1000, 6);
    expect(rows[1]!.Z).toBeCloseTo(1.0244, 6);
  });

  it("returns nothing for a header it does not recognise", () => {
    //  Empty, never a guess: a positional read of a drifted header would
    //  plot some other column under this page's argument.
    expect(readZScan("a,b\n1,2\n")).toHaveLength(0);
    expect(readZScan("")).toHaveLength(0);
  });

  it("measures the worst departure from ideality, in per cent", () => {
    //  The page's headline number, derived from the engine's rows and never
    //  from a formula in the page.
    expect(worstDeparturePct(readZScan(csv))).toBeCloseTo(2.44, 2);
  });

  it("has no departure to report when there are no rows", () => {
    expect(worstDeparturePct([])).toBeNull();
  });
});

describe("the registry entry", () => {
  it("is live, is of the notes kind, and is mounted", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "what-is-temperature");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
  });
});


describe("the engineer's ladder", () => {
  it("its witness is bundled too", () => {
    const t = tutorialByName(LADDER_WITNESS);
    expect(t, `${LADDER_WITNESS} is not bundled — the table would be empty and`
      + " say nothing").toBeTruthy();
  });

  it("every rung the page lists is an operation the case declares", () => {
    //  The page reads each rung out of the run BY OPERATION NAME.  Rename one
    //  in the case and that row silently vanishes from the table, which is a
    //  page quietly making a weaker argument than it says it makes.
    const props = tutorialByName(LADDER_WITNESS)!.files.rawFiles!["system/propsDict"]!;
    for (const r of LADDER) {
      expect(props, `rung ${r.op} is not in the case`).toContain(`name        ${r.op};`);
      expect(props, `rung ${r.op} does not ask for its own Psat`)
        .toContain(`Psat_${r.comp}`);
    }
  });

  it("reads a rung out of the diagnostics", () => {
    const rows = readLadder([
      { name: "rung_N2", diagnostics: { Psat_N2: 101302 } },
      { name: "rung_water", diagnostics: { Psat_water: 103926 } },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.psat).toBeCloseTo(101302, 3);
  });

  it("LEAVES OUT a rung the run did not produce", () => {
    //  Never defaulted to one atmosphere: that would paint a missing answer
    //  as a perfect one, which is the worst direction for this table to fail.
    expect(readLadder([{ name: "rung_N2", diagnostics: {} }])).toHaveLength(0);
    expect(readLadder(undefined)).toHaveLength(0);
  });

  it("measures the departure from one atmosphere, signed", () => {
    expect(rungDeparturePct(101325)).toBeCloseTo(0, 9);
    //  Water, the rung the page singles out.
    expect(rungDeparturePct(103926)).toBeCloseTo(2.567, 2);
  });
});


describe("the hot end -- where the tenth of a degree dies", () => {
  it("puts the subject temperature above the silver point", () => {
    //  The whole section turns on this: 1608.1 degC is past where a platinum
    //  resistance thermometer can go, which is WHY the answer becomes
    //  radiation and why the emissivity then decides the number.  If this
    //  ever stopped holding, the section would be arguing about the wrong
    //  instrument.
    const SILVER_POINT_K = 1234.93;   //  ITS-90 defining fixed point
    expect(T_HOT_K).toBeGreaterThan(SILVER_POINT_K);
  });

  it("converts to kelvin the one way there is", () => {
    expect(T_HOT_K).toBeCloseTo(T_HOT_C + 273.15, 9);
    expect(T_HOT_K).toBeCloseTo(1881.25, 6);
  });

  it("carries the second radiation constant, not a rounded memory of it", () => {
    //  c2 = h*c/k = 1.4387769e-2 m.K.  The page prints this constant to the
    //  reader and invites them to redo the arithmetic; a value wrong in the
    //  third digit would make every band on the page wrong by the same
    //  factor, invisibly.
    expect(C2_UM_K).toBeCloseTo(14387.769, 0);
  });

  it("computes the emissivity sensitivity from Wien, as a pure ratio", () => {
    //  dT/T = (lambda*T/c2) * (de/e).  Recomputed here independently of the
    //  implementation, so a transposed factor fails rather than agreeing
    //  with itself.
    expect(emissivitySensitivity(0.65, T_HOT_K))
      .toBeCloseTo((0.65 * 1881.25) / 14388, 9);
    expect(emissivitySensitivity(0.65, T_HOT_K)).toBeCloseTo(0.085, 3);
  });

  it("grows with wavelength and with temperature, which is the lesson", () => {
    //  A short wavelength is LESS sensitive to the emissivity guess -- that
    //  is why pyrometers are built narrow-band and blue.  If this ordering
    //  ever inverted, the page would be teaching the opposite of the truth.
    const short = emissivitySensitivity(0.65, T_HOT_K);
    const long = emissivitySensitivity(5.0, T_HOT_K);
    expect(long).toBeGreaterThan(short);
    expect(emissivitySensitivity(0.65, 2 * T_HOT_K))
      .toBeGreaterThan(short);
  });

  it("turns a 10 % emissivity error into the band the page prints", () => {
    const band = emissivityBand_K(0.65, T_HOT_K, 0.10);
    expect(band).toBeCloseTo(16, 0);
    //  ONE home: the page prints this number twice (as "K on the answer" and
    //  as the "+/-" beside the reading) and both must come from here.  The
    //  first draft hand-wrote 15 beside a computed 16.
    expect(band).toBeCloseTo(
      emissivitySensitivity(0.65, T_HOT_K) * 0.10 * T_HOT_K, 9);
  });

  it("has no band at all when the emissivity is known exactly", () => {
    expect(emissivityBand_K(0.65, T_HOT_K, 0)).toBe(0);
  });
});


describe("where the ladder ends and the metals take over", () => {
  it("climbs past water, which is the whole complaint that produced it", () => {
    //  The table used to stop at water while the page then argued about
    //  1881 K -- a ladder that ends three paragraphs before the question.
    const top = Math.max(...LADDER.map((r) => r.T));
    expect(top).toBeGreaterThan(500);
    expect(LADDER.filter((r) => r.T > 373.15).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the rung that FAILS, and labels it", () => {
    //  Glycerol's vapour pressure is a corresponding-states estimate at
    //  omega = 1.54 and misses its own record's boiling point by a factor of
    //  19.  A table that showed only the rungs that land would teach that a
    //  record can be trusted without being checked, which is the opposite of
    //  this page's argument.
    const g = LADDER.find((r) => r.op === "rung_glycerol");
    expect(g, "the failing rung was quietly dropped").toBeTruthy();
    expect(g!.caveat, "the failing rung carries no explanation").toBeTruthy();
    expect(g!.caveat).toContain("predictive");
  });

  it("the ITS-90 points are sorted and stop at copper", () => {
    const T = ITS90_ABOVE_WATER.map((f) => f.T);
    expect([...T].sort((a, b) => a - b)).toEqual(T);
    expect(Math.max(...T)).toBeCloseTo(ITS90_TOP_K, 6);
    //  Copper is the highest defining fixed point ITS-90 has; everything
    //  above it is extrapolated radiation, which is what section 7 is about
    //  and what makes the platinum answer what it is.
    expect(ITS90_ABOVE_WATER.at(-1)!.what).toContain("copper");
  });

  it("every ITS-90 point is above the triple point of water", () => {
    for (const f of ITS90_ABOVE_WATER) expect(f.T).toBeGreaterThan(273.16);
  });

  it("puts platinum outside the scale's defining points, by a long way", () => {
    expect(T_PT_MELT_K).toBeCloseTo(T_PT_MELT_C + 273.15, 9);
    expect(T_PT_MELT_K).toBeGreaterThan(ITS90_TOP_K);
    //  The gap is the argument: ~680 K of extrapolation above the last
    //  fixed point there is.  If platinum ever became a defining point the
    //  page's answer would change, and this test would say so.
    expect(T_PT_MELT_K - ITS90_TOP_K).toBeGreaterThan(500);
  });

  it("the silver point sits between the two temperatures the page argues about", () => {
    //  Section 7 turns on 1608.1 degC being ABOVE the silver point; this
    //  pins that the silver point is in the list and where it falls.
    const ag = ITS90_ABOVE_WATER.find((f) => f.what.startsWith("silver"))!;
    expect(ag.T).toBeLessThan(T_HOT_K);
    expect(ag.T).toBeLessThan(T_PT_MELT_K);
  });
});


describe("the holistic section, and the claim it had to retire", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/WhatIsTemperatureTool.tsx", import.meta.url),
    "utf-8");

  it("no longer says the book was not read", () => {
    //  THE POINT OF THIS TEST.  The page carried "this repository has not
    //  read it back and quotes nothing from it", which was true when written
    //  and false the day the book was opened.  A claim about what has been
    //  CHECKED is the worst kind to leave standing after it expires -- it
    //  reads as diligence while being wrong.  If anyone ever re-adds that
    //  sentence beside a section that summarises the book, this fails.
    //  The phrase survives EXACTLY ONCE, inside the retraction that quotes
    //  it -- counting is the honest test here, because a `not.toContain`
    //  would be satisfied by punctuation drift and prove nothing.
    const hits = SRC.match(/quotes nothing from it/g) ?? [];
    expect(hits, "the retired claim is loose in the page again")
      .toHaveLength(1);
    expect(SRC).toContain("used to end");
    expect(SRC).toContain("That book has now been read");
  });

  it("carries all four of Chang's circles, each with its way out", () => {
    expect(CHANG_CIRCLES).toHaveLength(4);
    expect(CHANG_CIRCLES.map((c) => c.ch)).toEqual([1, 2, 3, 4]);
    for (const c of CHANG_CIRCLES) {
      //  A circle without its escape leaves the reader with scepticism
      //  instead of a practice, which is the opposite of the book's argument
      //  and of this page's purpose.
      expect(c.circle.length, `circle ${c.ch} has no circularity`)
        .toBeGreaterThan(80);
      expect(c.escape.length, `circle ${c.ch} has no way out`)
        .toBeGreaterThan(60);
    }
  });

  it("names the four escapes the book actually reports", () => {
    const all = CHANG_CIRCLES.map((c) => c.escape).join(" ").toLowerCase();
    for (const key of ["spiral", "comparability", "convergence", "iteration"]) {
      expect(all, `the escape "${key}" went missing`).toContain(key);
    }
  });

  it("cites the book once, in one place, with its publisher and year", () => {
    expect(CHANG_CITATION).toContain("Hasok Chang");
    expect(CHANG_CITATION).toContain("Inventing Temperature");
    expect(CHANG_CITATION).toContain("2004");
    //  One home: the page renders this constant rather than retyping the
    //  citation, so the title cannot drift between two mentions.
    expect(SRC.match(/Oxford University Press/g) ?? []).toHaveLength(1);
  });

  it("ties each circle back to a number this page actually produced", () => {
    //  Section 8 earns its place by being about THIS tool, not about
    //  philosophy in general: the water rung is circle 1, glycerol is
    //  Regnault's comparability, the instrument handover is circle 3, and the
    //  solver's own initial guess is circle 4.  If those links are cut the
    //  section becomes a digression.
    for (const p of ["Circle 1 is §4", "Circle 2 is the glycerol rung",
      "Circle 3 is §5", "Circle 4 is every solver"]) {
      expect(SRC, `the section lost its link: ${p}`).toContain(p);
    }
  });

  it("says the compression is severe and points at the book", () => {
    //  Four chapters and a philosophical synthesis in one screen is a
    //  reading, not a substitute; the page must not let itself be mistaken
    //  for the scholarship it is summarising.
    expect(SRC).toContain("Read the book.");
  });
});
