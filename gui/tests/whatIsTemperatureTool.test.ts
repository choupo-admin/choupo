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
import {
  C2_UM_K, LADDER, LADDER_WITNESS, T_HOT_C, T_HOT_K, T_SUBJECT_K,
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
