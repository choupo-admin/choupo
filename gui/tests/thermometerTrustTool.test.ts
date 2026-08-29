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
  The deep dive split out of "What is a temperature?" on 2026-08-29.  Most of
  these pins moved here WITH the material they pin: the gas-thermometer
  witness and its knob, the Z-scan reader, ITS-90's fixed points, the
  platinum question, and Chang's four circles.  New here, and load-bearing:
  the Newton-iteration analogy stays DELETED (ruled, not trimmed), and the
  page must keep pointing its circle-mappings at the pages where the numbers
  now live.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { applyScalarOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { readFileSync } from "node:fs";

import {
  CHANG_CIRCLES, CHANG_CITATION, ITS90_ABOVE_WATER, ITS90_TOP_K,
  T_PT_MELT_C, T_PT_MELT_K, TEMPERATURE_WITNESS,
  readZScan, worstDeparturePct,
} from "../src/ui/methods/ThermometerTrustTool.js";
import { T_HOT_K, T_SILVER_K, T_SUBJECT_K }
  from "../src/ui/methods/WhatIsTemperatureTool.js";

const PROPS = "system/propsDict";

const SRC = readFileSync(
  new URL("../src/ui/methods/ThermometerTrustTool.tsx", import.meta.url),
  "utf-8");

const prose = (src: string): string => src.replace(/\s+/g, " ");

const SPRT_LO_K = 13.8033;   //  ITS-90: triple point of equilibrium hydrogen
const SPRT_HI_K = 1234.93;   //  ITS-90: freezing point of silver

describe("the registry entry", () => {
  it("is live, is of the notes kind, and names its three tests", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "thermometer-trust");
    expect(e, "the deep dive left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    for (const k of ["comparability", "convergence"]) {
      expect(e!.teaches.toLowerCase()).toContain(k);
    }
  });
});

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
    expect(props).toContain("gasThermometer.csv");
    expect(props).toContain("Z");
  });

  it("scans at the temperature the main page is about", () => {
    //  The two pages must be talking about the same state: the deep dive's
    //  plot annotates itself with the main page's subject temperature.
    const props = tutorialByName(TEMPERATURE_WITNESS)!.files.rawFiles![PROPS]!;
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
    expect(readZScan("a,b\n1,2\n")).toHaveLength(0);
    expect(readZScan("")).toHaveLength(0);
  });

  it("measures the worst departure from ideality, in per cent", () => {
    expect(worstDeparturePct(readZScan(csv))).toBeCloseTo(2.44, 2);
  });

  it("has no departure to report when there are no rows", () => {
    expect(worstDeparturePct([])).toBeNull();
  });
});

describe("ITS-90's own ladder, and where it ends", () => {
  it("the points are sorted and stop at copper", () => {
    const T = ITS90_ABOVE_WATER.map((f) => f.T);
    expect([...T].sort((a, b) => a - b)).toEqual(T);
    expect(Math.max(...T)).toBeCloseTo(ITS90_TOP_K, 6);
    expect(ITS90_ABOVE_WATER.at(-1)!.what).toContain("copper");
  });

  it("every point is above the triple point of water", () => {
    for (const f of ITS90_ABOVE_WATER) expect(f.T).toBeGreaterThan(273.16);
  });

  it("agrees with the main page about the silver point", () => {
    //  T_SILVER_K on the main page and the silver row here are the SAME
    //  physical claim in two files; this is the one test that may hold both,
    //  so they cannot drift apart silently.
    const ag = ITS90_ABOVE_WATER.find((f) => f.what.startsWith("silver"))!;
    expect(ag.T).toBeCloseTo(T_SILVER_K, 6);
  });

  it("puts platinum outside the scale's defining points, by a long way", () => {
    expect(T_PT_MELT_K).toBeCloseTo(T_PT_MELT_C + 273.15, 9);
    expect(T_PT_MELT_K).toBeGreaterThan(ITS90_TOP_K);
    expect(T_PT_MELT_K - ITS90_TOP_K).toBeGreaterThan(500);
  });

  it("the silver point sits below both temperatures the pages argue about", () => {
    const ag = ITS90_ABOVE_WATER.find((f) => f.what.startsWith("silver"))!;
    expect(ag.T).toBeLessThan(T_HOT_K);
    expect(ag.T).toBeLessThan(T_PT_MELT_K);
  });

  it("does not call gallium a freezing point while its own table says melting", () => {
    expect(ITS90_ABOVE_WATER[0]!.what).toContain("melting");
    expect(prose(SRC)).toContain("melting and freezing points of metals");
  });
});

describe("the platinum resistance thermometer's real range", () => {
  it("keeps the cold end inside the instrument that covers it", () => {
    //  The worst error the old page carried: claiming 20 K escapes the SPRT
    //  when the SPRT runs from 13.8033 K.
    expect(prose(SRC)).not.toContain("outside the platinum resistor");
    expect(prose(SRC)).toContain("The cold end does not escape at all");
  });

  it("states the instrument bounds as numbers, so a claim can be checked", () => {
    expect(SRC).toContain(String(SPRT_LO_K));
    expect(SRC).toContain(String(SPRT_HI_K));
  });

  it("says the instrument ranges overlap rather than abut", () => {
    expect(prose(SRC)).toContain("overlap");
    expect(SRC).toContain("24.5561");
  });
});

describe("platinum's last digit, held to the evidence", () => {
  it("does not declare it decorative, and asks for the budget instead", () => {
    expect(prose(SRC)).not.toContain("is decoration");
    expect(prose(SRC)).toContain("budget");
  });

  it("marks the fixed-point values as declared, with their citation", () => {
    expect(prose(SRC)).toContain("Declared, not computed");
    expect(SRC).toContain("Preston-Thomas");
  });
});

describe("Chang's four circles, each with its way out", () => {
  it("carries all four", () => {
    expect(CHANG_CIRCLES).toHaveLength(4);
    expect(CHANG_CIRCLES.map((c) => c.ch)).toEqual([1, 2, 3, 4]);
    for (const c of CHANG_CIRCLES) {
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
    expect(SRC.match(/Oxford University Press/g) ?? []).toHaveLength(1);
  });

  it("says the compression is severe and points at the book", () => {
    expect(SRC).toContain("Read the book.");
  });

  it("maps its circles onto the pages where the numbers now live", () => {
    //  The circles earn their place by being about THIS simulator: the water
    //  and glycerol evidence lives on the property-trust page and the
    //  mapping must send the reader there, not claim the numbers are here.
    expect(prose(SRC)).toContain("When a property database lies to you");
    expect(prose(SRC)).toContain("0.70 K");
    expect(prose(SRC)).toContain("factor-of-19");
  });
});

describe("what the ruling deleted stays deleted", () => {
  it("carries no Newton-iteration analogy", () => {
    //  Ruled out, not trimmed: a numerical initial guess and Chang's
    //  epistemic iteration are not the same thing.  "epistemic iteration"
    //  itself STAYS (it is Chang's term, quoted as his); what must never
    //  return is the equation of the two.
    expect(SRC).not.toContain("Newton iteration");
    expect(SRC).not.toContain("Circle 4 is every solver");
  });
});
