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
  The flash operating line: the geometry, the witness, and the placement.

  The GEOMETRY tests are identities, not captured numbers.  An operating line
  that passed through (z,z) by coincidence at one setting would satisfy a
  golden and still be wrong everywhere else; the pivot and the slope are
  claims about EVERY (z, psi), so they are checked as such.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  eqCurveFromTxyCsv, flashAtVF, leverSegments, operatingLine,
  operatingLineAt,
} from "../src/case/binaryFlash.js";
import { applyScalarOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import {
  ENGINE_CHECK, FLASH_CSV, FLASH_LIMITS, FLASH_STEPS, FLASH_WITNESS,
} from "../src/ui/methods/FlashOperatingLineTool.js";

const PROPS = "system/propsDict";

describe("the operating line, as an identity", () => {
  it("passes through the feed on the diagonal, for every z and psi", () => {
    //  y = -((1-psi)/psi) x + z/psi  ==>  y(z) = z, always.  This is the
    //  whole pedagogical point: the line PIVOTS about the feed.
    for (const z of [0.05, 0.2, 0.4, 0.63, 0.95])
      for (const psi of [0.01, 0.1, 0.3, 0.5, 0.9, 1])
        expect(operatingLineAt(z, psi, z), `z=${z} psi=${psi}`)
          .toBeCloseTo(z, 12);
  });

  it("has slope exactly -L/V", () => {
    for (const psi of [0.1, 0.25, 0.5, 0.75, 1]) {
      const L = operatingLine(0.4, psi);
      expect(L.vertical).toBe(false);
      if (!L.vertical) expect(L.m).toBeCloseTo(-(1 - psi) / psi, 12);
    }
  });

  it("is VERTICAL at the bubble point and HORIZONTAL at the dew point", () => {
    //  psi -> 0: nothing has boiled, x = z, and y is not a function of x at
    //  all.  Returning an infinite slope would be silently dropped by a
    //  plotter, so the vertical branch is a separate, named case.
    const bub = operatingLine(0.4, 0);
    expect(bub.vertical).toBe(true);
    if (bub.vertical) expect(bub.x).toBeCloseTo(0.4, 12);
    expect(Number.isNaN(operatingLineAt(0.4, 0, 0.7))).toBe(true);

    const dew = operatingLine(0.4, 1);
    expect(dew.vertical).toBe(false);
    if (!dew.vertical) { expect(dew.m).toBeCloseTo(0, 12); expect(dew.b).toBeCloseTo(0.4, 12); }
  });

  it("puts the engine's own flash answer ON the line", () => {
    //  The solved (x, y) must satisfy the balance the line expresses -- that
    //  is what makes the intersection the answer rather than a coincidence.
    const csv = tutorialByName(FLASH_WITNESS)!.files.rawFiles?.[FLASH_CSV];
    const curve = eqCurveFromTxyCsv(csv ?? readFileSync(
      new URL("../../tutorials/props/molecular/flash01_operating_line/txy.csv",
        import.meta.url), "utf-8"))!;
    expect(curve).toBeTruthy();
    for (const psi of [0.15, 0.3, 0.55, 0.8]) {
      const sol = flashAtVF(curve, 0.4, psi);
      expect(sol.regime).toBe("two-phase");
      expect(operatingLineAt(0.4, psi, sol.xLiq)).toBeCloseTo(sol.yVap, 6);
      //  and the lever rule is the same statement read as a length
      expect(leverSegments(sol).vfFromArms).toBeCloseTo(psi, 6);
    }
  });
});

describe("the witness that publishes the curve", () => {
  it("is bundled, with the dict the pressure knob rewrites", () => {
    const t = tutorialByName(FLASH_WITNESS);
    expect(t, `${FLASH_WITNESS} is not bundled — the page would draw nothing`)
      .toBeTruthy();
    expect(Object.keys(t!.files.rawFiles ?? {})).toContain(PROPS);
  });

  it("scans x and publishes the trio the reader needs", () => {
    const props = tutorialByName(FLASH_WITNESS)!.files.rawFiles![PROPS]!;
    expect(props).toContain("propertyScan1D");
    expect(props).toContain("T_bubble");
    expect(props).toContain("y_eq_benzene");
    expect(props).toContain(FLASH_CSV);
  });

  it("the pressure knob rewrites a key that is REACHABLE", () => {
    //  The lesson already paid for once, on the temperature tool: a scalar
    //  override anchors on the key at the start of a line, so a state block
    //  written on ONE line cannot be reached and the knob fails silently on
    //  every drag.  This asserts P is on its own line by exercising the real
    //  override, not by reading the formatting.
    const props = tutorialByName(FLASH_WITNESS)!.files.rawFiles![PROPS]!;
    const out = applyScalarOverride(props,
      { file: PROPS, key: "P", value: 2, occurrence: 1, unit: "bar" });
    expect(out).not.toBe(props);
    expect(out).toMatch(/^[ \t]*P[ \t]+2[ \t]*bar[ \t]*;/m);
  });

  it("REFUSES a value written in the wrong unit", () => {
    const props = tutorialByName(FLASH_WITNESS)!.files.rawFiles![PROPS]!;
    //  The substitution keeps the declared unit and replaces only the
    //  number, so passing pascals into a `bar` slot would write 200000 bar
    //  and run happily -- wrong by five orders of magnitude with nothing on
    //  screen to show it.  This tool's very first test produced exactly that
    //  (`P 200000 atm`), which is why the guard exists.
    expect(() => applyScalarOverride(props,
      { file: PROPS, key: "P", value: 2e5, occurrence: 1, unit: "Pa" }))
      .toThrow(/declares 'bar'/);
  });
});

describe("the lesson and its placement", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/FlashOperatingLineTool.tsx", import.meta.url),
    "utf-8").replace(/\s+/g, " ");

  it("comes FIRST among the constructions", () => {
    //  THE POINT OF THE WHOLE SLICE.  A student who meets McCabe-Thiele
    //  before a single flash meets the staircase before the step.
    const ids = METHOD_TOOLS.filter((m) => m.kind === "construction")
      .map((m) => m.id);
    expect(ids[0]).toBe("flash-operating-line");
    expect(ids.indexOf("flash-operating-line"))
      .toBeLessThan(ids.indexOf("mccabe"));
  });

  it("is live and mounted", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "flash-operating-line")!;
    expect(e).toBeTruthy();
    expect(e.status).toBe("live");
    const ws = readFileSync(
      new URL("../src/ui/MethodsWorkspace.tsx", import.meta.url), "utf-8");
    expect(ws, "registered but never rendered")
      .toContain('tool === "flash-operating-line"');
  });

  it("runs four steps, numbered without a gap", () => {
    expect(FLASH_STEPS).toHaveLength(4);
    expect(FLASH_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });

  it("states the pivot and the slope where the student can see them", () => {
    const s3 = FLASH_STEPS.find((s) => s.n === 3)!;
    expect(s3.formula).toContain("(z, z)");
    expect(s3.formula).toContain("−L/V");
    expect(s3.note).toContain("VERTICAL");
    expect(s3.note).toContain("HORIZONTAL");
  });

  it("names the binary limit rather than letting it be generalised", () => {
    //  The construction is a LINE only for two components; with three there
    //  is no x-y plane to draw it in and Rachford-Rice stops being a picture.
    //  A page that stayed silent would invite exactly the wrong inference.
    const b = FLASH_LIMITS.find((l) => l.id === "binary")!;
    expect(b.title).toContain("BINARY ONLY");
    expect(b.body).toContain("Rachford-Rice");
  });

  it("carries an independent check against the engine's own flash", () => {
    //  The construction must be answerable to a solver that did not use it.
    expect(ENGINE_CHECK.VF).toBeCloseTo(0.30398357314, 10);
    expect(SRC).toContain("flash01_benzene_toluene");
    expect(SRC).toContain("property of the DRAWING");
  });

  it("says which knobs re-run the engine and which are geometry", () => {
    //  Two of the three are pure redraws because a binary flash at frozen P
    //  has a frozen curve.  Saying so is the difference between a tool a
    //  student trusts and one they cannot account for.
    expect(SRC).toContain("only one that re-runs the engine");
  });
});
