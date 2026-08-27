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

  it("carries no bookkeeping about its own editing history", () => {
    //  THE RULE THIS PINS, and it was learned the hard way: the page is for
    //  a student, and a paragraph explaining what the page USED to say
    //  obscures the thing being taught.  Provenance about the KNOWLEDGE
    //  stays (a value not read back against its source is something a reader
    //  must be told); an audit trail about this repository's own process
    //  does not -- it belongs in the commit message.
    for (const meta of ["used to end", "has now been read",
      "quotes nothing from it", "this repository has not read it back"]) {
      expect(SRC, `self-referential bookkeeping is back: "${meta}"`)
        .not.toContain(meta);
    }
  });

  it("does not claim the fixed-point values are unquoted while quoting them", () => {
    //  Section 5 used to say "the defining fixed-point VALUES are not quoted
    //  here" -- true until 6b listed all eight of them, after which the page
    //  contradicted itself in the one register it cannot afford to.
    expect(SRC).not.toContain("VALUES are not quoted here");
    expect(SRC).toContain("listed in §8");
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
    for (const p of ["Circle 1 is §5", "Circle 2 is the glycerol rung",
      "Circle 3 is §6", "Circle 4 is every solver"]) {
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


// ---------------------------------------------------------------------------
//  THE PHYSICS THE PAGE MUST NOT GET WRONG.
//
//  An external review found several claims stronger than the physics allows,
//  in a page whose whole subject is claims stronger than the evidence allows.
//  Each of these pins a correction, because prose is the part of a tool that
//  rots with nothing failing.
// ---------------------------------------------------------------------------


/** The source with every run of whitespace collapsed.  A prose assertion made
 *  against raw source is really an assertion about where the formatter put the
 *  line breaks: re-wrap a paragraph and the test fails while the page is
 *  unchanged, which trains a reader to "fix" the test.  Collapse first. */
const prose = (src: string): string => src.replace(/\s+/g, " ");

const SPRT_LO_K = 13.8033;   //  ITS-90: triple point of equilibrium hydrogen
const SPRT_HI_K = 1234.93;   //  ITS-90: freezing point of silver

describe("temperature, the kelvin, and T90 are three different things", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/WhatIsTemperatureTool.tsx", import.meta.url),
    "utf-8");

  it("defines the quantity by the entropy derivative before any unit", () => {
    //  The page used to open on the 2019 redefinition and conclude that "a
    //  temperature is a conversion factor between energy and degrees, and
    //  nothing else".  That is the UNIT's definition mistaken for the
    //  QUANTITY's, and it left the page with no definition of temperature at
    //  all -- philosophy standing where the physics should be.
    const iDef = SRC.indexOf("(∂S / ∂U)");
    const iK = SRC.indexOf("1.380649");
    expect(iDef, "the thermodynamic definition is missing").toBeGreaterThan(0);
    expect(iDef, "the unit is defined before the quantity").toBeLessThan(iK);
  });

  it("never calls a temperature a conversion factor", () => {
    //  k_B is the conversion factor; it appears as k_B*T.  Saying the
    //  temperature is one gets the relation backwards.
    expect(SRC).not.toContain("conversion factor between energy and degrees");
    expect(prose(SRC)).toContain("k<sub>B</sub> is the conversion factor");
  });

  it("keeps the three names apart, by name", () => {
    expect(prose(SRC)).toContain("the quantity <em>T</em>");
    expect(SRC).toContain("T₉₀");
  });
});

describe("the platinum resistance thermometer's real range", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/WhatIsTemperatureTool.tsx", import.meta.url),
    "utf-8");

  it("does not put the coldest rung outside the instrument that covers it", () => {
    //  THE WORST ERROR THIS PAGE HAS CARRIED.  A closing section claimed that
    //  "at 20 K and at 1881 K you are outside the platinum resistor -- on
    //  both sides".  The SPRT runs from 13.8033 K, so 20 K is INSIDE it, and
    //  the page's own instrument list said so four sections earlier.  It
    //  contradicted itself in the register it can least afford.
    const coldest = Math.min(...LADDER.map((r) => r.T));
    expect(coldest).toBeGreaterThan(SPRT_LO_K);
    expect(prose(SRC)).not.toContain("outside the platinum resistor");
    expect(prose(SRC)).toContain("The cold end does not escape at all");
  });

  it("states the instrument bounds as numbers, so a claim can be checked", () => {
    expect(SRC).toContain(String(SPRT_LO_K));
    expect(SRC).toContain(String(SPRT_HI_K));
  });

  it("says the instrument ranges overlap rather than abut", () => {
    //  "Four instruments, each handed over where the previous runs out" is
    //  tidier than ITS-90 is: the gas thermometer reaches 24.5561 K while the
    //  SPRT starts at 13.8033 K.  The overlap is the design, not a detail.
    expect(prose(SRC)).toContain("overlap");
    expect(SRC).toContain("24.5561");
  });

  it("puts 500 K where it actually falls among the fixed points", () => {
    //  It sits just BELOW the tin point, with indium below it -- not
    //  "between the triple point of water and the freezing point of zinc",
    //  which skips the two fixed points nearest to it.
    expect(prose(SRC))
      .not.toContain("between the triple point of water and the freezing");
    const sn = ITS90_ABOVE_WATER.find((f) => f.what.startsWith("tin"))!;
    expect(sn.T).toBeGreaterThan(500);
    expect(prose(SRC)).toContain("just below the");
  });
});

describe("the water rung says what it actually found", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/WhatIsTemperatureTool.tsx", import.meta.url),
    "utf-8");

  //  The record: log10(P/bar) = A - B/(T + C).  Recomputed here rather than
  //  quoted, so the page's arithmetic is checked and not merely repeated.
  const A = 5.40221, B = 1838.675, C = -31.737;
  const P = (T: number): number => 10 ** (A - B / (T + C)) * 1e5;

  it("confirms the record disagrees with ITSELF, not with nature", () => {
    let lo = 350, hi = 400;
    for (let i = 0; i < 200; ++i) {
      const m = (lo + hi) / 2;
      if (P(m) < 101325) lo = m; else hi = m;
    }
    const tbFromAntoine = (lo + hi) / 2;
    //  The record declares Tb = 373.15 K a few lines above these
    //  coefficients.  They imply 372.45 K.
    expect(tbFromAntoine).toBeCloseTo(372.45, 1);
    expect(373.15 - tbFromAntoine).toBeCloseTo(0.70, 1);
  });

  it("shows the 0.15 K extrapolation is NOT the cause", () => {
    //  Inside the declared window, at 373.00 K, the correlation is already
    //  2.0 % high.  The extrapolation is worth about half a per cent of the
    //  two and a half -- so blaming it, as the page used to, misattributes a
    //  data defect to an epistemological one.
    expect(P(373.0) / 101325 - 1).toBeCloseTo(0.0201, 3);
    expect((P(373.15) - P(373.0)) / 101325).toBeCloseTo(0.0056, 3);
  });

  it("no longer claims water disobeys its boiling point", () => {
    expect(prose(SRC)).not.toContain("Water refuses to boil at the boiling point");
    expect(prose(SRC)).not.toContain("not as fixed as the schoolroom says");
    expect(SRC).toContain("its own water record");
    expect(SRC).toContain("0.70 K");
  });
});

describe("claims kept inside what the evidence supports", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/WhatIsTemperatureTool.tsx", import.meta.url),
    "utf-8");

  it("frames the engineer's range as scope, not as physics", () => {
    expect(prose(SRC)).toContain("engineering scope, not a boundary of");
    //  There is no temperature at which plasma begins, and the nuclear-physics
    //  line was a category error beside it.
    expect(prose(SRC)).not.toContain("above it is plasma");
    expect(prose(SRC)).not.toContain("not doing nuclear physics");
  });

  it("does not put a physical wall at 600 K", () => {
    //  Anthracene boils near 613 K and p-terphenyl above 660 K.  The true
    //  claim is that a normal boiling point becomes progressively less useful,
    //  not that organics stop having one.
    expect(prose(SRC)).not.toContain("an ordinary organic cracks before it");
    expect(prose(SRC)).toContain("progressively less useful");
  });

  it("does not call gallium a freezing point while its own table says melting", () => {
    expect(ITS90_ABOVE_WATER[0]!.what).toContain("melting");
    expect(prose(SRC)).toContain("melting and freezing points of metals");
  });

  it("states the pyrometer band as conditional on its own assumptions", () => {
    //  16 K is what a 10 % emissivity error costs AT 0.65 um under Wien.  It
    //  is not a floor on pyrometry, and "at best" said it was.
    expect(SRC).not.toContain("at best,");
    expect(prose(SRC)).toContain("this geometry alone");
    //  And the +/-0.05 emissivity figure had no source.
    expect(prose(SRC)).not.toContain("better than about ±0.05");
  });

  it("does not declare platinum's last digit decorative", () => {
    //  The page admits it has read no uncertainty for platinum from a primary
    //  source.  Concluding from that that the digit is decoration is an
    //  unsourced claim inside the section that condemns them.
    expect(prose(SRC)).not.toContain("is decoration");
    expect(prose(SRC)).toContain("a digit is not an uncertainty");
  });

  it("makes the closing thesis about the MEASUREMENT, not about temperature", () => {
    //  One word. "A temperature is a position inside a system" is a
    //  contestable ontological claim that also contradicts §1; "a reported
    //  temperature MEASUREMENT is" is a metrological observation that is
    //  simply true.
    expect(prose(SRC)).toContain("A reported temperature measurement is not a fact");
    expect(prose(SRC)).not.toContain("A temperature is not a fact you read off");
  });

  it("opens by asking for the uncertainty, not for the meaning of a digit", () => {
    expect(prose(SRC)).toContain("decimal places are not uncertainty");
    expect(prose(SRC)).toContain("U = 0.015 K (k = 2)");
  });
});
