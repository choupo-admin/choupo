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
  T_SUBJECT_K, TEMPERATURE_WITNESS, readZScan, worstDeparturePct,
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
