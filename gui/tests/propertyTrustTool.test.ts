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
  "When a property database lies to you" -- the boiling-point ladder, moved
  out of the temperature page on 2026-08-29 to the page whose lesson it
  actually teaches: never trust a thermophysical record merely because it
  exists.  The ladder pins moved here with the material; the water-Antoine
  recomputation stays because it is the page's own arithmetic, checked
  independently of the prose that quotes it.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { readFileSync } from "node:fs";

import {
  LADDER, LADDER_WITNESS, readLadder, rungDeparturePct,
} from "../src/ui/methods/PropertyTrustTool.js";

const SRC = readFileSync(
  new URL("../src/ui/methods/PropertyTrustTool.tsx", import.meta.url),
  "utf-8");

const prose = (src: string): string => src.replace(/\s+/g, " ");

describe("the registry entry", () => {
  it("is live, is of the notes kind, and teaches distrust-then-verify", () => {
    const e = METHOD_TOOLS.find((m) => m.id === "property-trust");
    expect(e, "the tool left the registry").toBeTruthy();
    expect(e!.kind).toBe("notes");
    expect(e!.status).toBe("live");
    expect(e!.teaches).toContain("internal consistency");
  });
});

describe("the engineer's ladder", () => {
  it("its witness is bundled", () => {
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
    expect(rungDeparturePct(103926)).toBeCloseTo(2.567, 2);
  });

  it("climbs the whole engineering range", () => {
    const top = Math.max(...LADDER.map((r) => r.T));
    expect(top).toBeGreaterThan(500);
    expect(LADDER.filter((r) => r.T > 373.15).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the rung that FAILS, and labels it", () => {
    //  A table that showed only the rungs that land would teach that a
    //  record can be trusted without being checked -- the opposite of this
    //  page's one lesson.
    const g = LADDER.find((r) => r.op === "rung_glycerol");
    expect(g, "the failing rung was quietly dropped").toBeTruthy();
    expect(g!.caveat, "the failing rung carries no explanation").toBeTruthy();
    expect(g!.caveat).toContain("predictive");
  });
});

describe("the water rung says what it actually found", () => {
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
    //  two and a half -- so blaming it would misattribute a data defect to
    //  an epistemological one.
    expect(P(373.0) / 101325 - 1).toBeCloseTo(0.0201, 3);
    expect((P(373.15) - P(373.0)) / 101325).toBeCloseTo(0.0056, 3);
  });

  it("blames the record, not nature, in the prose", () => {
    expect(prose(SRC)).not.toContain("Water refuses to boil");
    expect(SRC).toContain("its own water record");
    expect(SRC).toContain("0.70 K");
    expect(prose(SRC)).toContain("familiarity is not");
  });
});

describe("the lesson, stated as the page's one job", () => {
  it("says the habit in one sentence", () => {
    expect(prose(SRC)).toContain(
      "never trust a record merely because it exists");
  });

  it("names the two failure modes apart", () => {
    //  An INCONSISTENCY (water: two homes for one fact, drifted) and an
    //  EXTRAPOLATED ESTIMATE (glycerol: honest provenance, wild number) fail
    //  differently, and a reader who conflates them will fix the wrong one.
    expect(prose(SRC)).toContain("Water is an inconsistency");
    expect(prose(SRC)).toContain("origin predictive");
  });

  it("credits the method: the record cross-examined against itself", () => {
    expect(prose(SRC)).toContain("cross-examined against itself");
    expect(prose(SRC)).toContain("nobody needed to");
  });

  it("points the epistemology at the deep dive rather than carrying it", () => {
    expect(prose(SRC)).toContain("How do we know a thermometer is right?");
    expect(SRC).not.toContain("Inventing Temperature");
  });

  it("does not oversell: no measurement, no worst-records claim", () => {
    expect(prose(SRC)).toContain("Not a measurement");
    expect(prose(SRC)).toContain("internal consistency alone");
  });
});
