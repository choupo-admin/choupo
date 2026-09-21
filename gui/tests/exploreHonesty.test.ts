/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/


/*---------------------------------------------------------------------------*\
  What the curated-pair catalogue means for a selection: the DEFAULT model, the
  footer note, and the refusal warning.

  Measured against the real catalogue where the real catalogue can show it
  (benzene-toluene IS `origin assumed`, nHexane pairs with neither), and
  against an injected lookup where it cannot -- so the rules are pinned without
  a record being invented in data/standards/.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  allPairs, defaultActivityFor, failureHeadline, isFittedPairModel,
  missingPairs, modelRefusalWarning, pairCoverage, pairNoteText,
  type PairLookup,
} from "../src/case/exploreHonesty.js";
import { PAIRS, pairEntry } from "../src/case/pairsCatalogue.js";

const ALL_UNIFAC = () => true;
const NO_UNIFAC = () => false;

/** A catalogue with exactly the records a test names. */
const lookupOf = (recs: { model: string; a: string; b: string; origin: string }[]): PairLookup =>
  (model, a, b) => recs.find((r) => r.model === model
    && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));

describe("every pair of the selection, not just the ones somebody typed out", () => {
  it("enumerates n(n-1)/2 pairs at any n", () => {
    expect(allPairs(["a"])).toEqual([]);
    expect(allPairs(["a", "b"])).toEqual([["a", "b"]]);
    expect(allPairs(["a", "b", "c"]))
      .toEqual([["a", "b"], ["a", "c"], ["b", "c"]]);
    expect(allPairs(["a", "b", "c", "d"]).length).toBe(6);
  });

  it("notes a FOUR-component selection at all", () => {
    //  the old enumeration was `if (n===2) ... else if (n===3) ...`, so a
    //  fourth component produced no note whatsoever.
    const note = pairNoteText("NRTL", ["benzene", "toluene", "nHexane", "acetone"]);
    expect(note).toBeTruthy();
    expect(note!.split("·").length).toBe(6);
  });
});

describe("the catalogue's own records, read as claims", () => {
  it("benzene-toluene is present and declares itself an ASSUMPTION", () => {
    //  If this ever fails because the record was re-fitted, D9 is CURED at
    //  the source and this suite should be told so -- not silenced.
    const rec = pairEntry("NRTL", "benzene", "toluene");
    expect(rec, "data/standards/parameters/NRTL/benzene-toluene.dat").toBeTruthy();
    expect(rec!.origin).toBe("assumed");
  });

  it("an `assumed` record is PRESENT but is NOT curated non-ideality", () => {
    const [cov] = pairCoverage("NRTL", ["benzene", "toluene"]);
    expect(cov!.status).toBe("assumed");
    //  present => the engine runs it => it is not a "missing pair"
    expect(missingPairs("NRTL", ["benzene", "toluene"])).toEqual([]);
  });

  it("draws NO green tick on the ideality assumption", () => {
    //  THE DEFECT: "benzene-toluene: NRTL ✓" over two lines flat at 1.000.
    const note = pairNoteText("NRTL", ["benzene", "toluene"])!;
    expect(note).not.toContain("✓");
    expect(note).toContain("assumed");
    expect(note).toMatch(/ideality/i);
  });

  it("still draws the tick on a record that claims measurement", () => {
    const rec = pairEntry("NRTL", "ethanol", "water");
    expect(rec!.origin).toBe("literature");
    expect(pairNoteText("NRTL", ["ethanol", "water"])!).toContain("✓");
  });

  it("every shipped pair record parses an origin (or honestly reports none)", () => {
    for (const p of PAIRS) expect(typeof p.origin).toBe("string");
    expect(PAIRS.filter((p) => p.origin === "assumed").length).toBeGreaterThan(0);
  });
});

describe("the footer says what the engine will DO, not what it used to do", () => {
  it("an absent pair is a REFUSAL, never 'absent -> ideal'", () => {
    const note = pairNoteText("NRTL", ["benzene", "nHexane"])!;
    expect(note).toContain("REFUSES");
    expect(note).not.toMatch(/absent\s*(->|→)\s*ideal/i);
  });

  it("the warning names the pairs the engine will name, and the way out", () => {
    const w = modelRefusalWarning("NRTL", ["benzene", "toluene", "nHexane"], ALL_UNIFAC)!;
    expect(w).toContain("benzene–nHexane");
    expect(w).toContain("toluene–nHexane");
    //  ...and NOT the pair that IS in the catalogue
    expect(w).not.toContain("benzene–toluene");
    expect(w).toContain("REFUSES");
    expect(w).toContain("UNIFAC");
    //  the old sentence claimed a picture would be drawn ideally
    expect(w).not.toMatch(/assumes IDEAL mixing/i);
  });

  it("does not offer UNIFAC as the way out where UNIFAC cannot run either", () => {
    const w = modelRefusalWarning("NRTL", ["benzene", "nHexane"], NO_UNIFAC)!;
    expect(w).toMatch(/No predictive fallback/);
  });

  it("is silent when every pair is covered, and for the pairless models", () => {
    expect(modelRefusalWarning("NRTL", ["ethanol", "water"], ALL_UNIFAC)).toBeNull();
    expect(modelRefusalWarning("UNIFAC", ["benzene", "nHexane"], ALL_UNIFAC)).toBeNull();
    expect(modelRefusalWarning("ideal", ["benzene", "nHexane"], ALL_UNIFAC)).toBeNull();
    expect(pairNoteText("UNIFAC", ["benzene", "nHexane"])).toBeNull();
    expect(isFittedPairModel("UNIQUAC")).toBe(true);
    expect(isFittedPairModel("ideal")).toBe(false);
  });
});

describe("the default model, at every selection size", () => {
  it("D6: THREE organics no longer boot on a model the engine refuses", () => {
    //  Measured natively on the case the Explorer synthesizes:
    //    *** choupoProps fatal error: NRTL: the case declares NRTL, but 2
    //    binary pair(s) have no parameters ...: benzene-nHexane, toluene-nHexane
    //  ...and all three carry UNIFAC groups.  The guard that let this through
    //  was `if (selected.length !== 2) return;`.
    const sel = ["benzene", "toluene", "nHexane"];
    expect(missingPairs("NRTL", sel).length).toBe(2);
    expect(defaultActivityFor("NRTL", sel, ALL_UNIFAC)).toBe("UNIFAC");
  });

  it("still saves the BINARY it always saved", () => {
    expect(defaultActivityFor("NRTL", ["benzene", "nHexane"], ALL_UNIFAC)).toBe("UNIFAC");
  });

  it("leaves a covered selection alone -- a manual pick is respected", () => {
    expect(defaultActivityFor("NRTL", ["ethanol", "water"], ALL_UNIFAC)).toBe("NRTL");
    expect(defaultActivityFor("UNIFAC", ["benzene", "nHexane"], ALL_UNIFAC)).toBe("UNIFAC");
    expect(defaultActivityFor("ideal", ["benzene", "nHexane"], ALL_UNIFAC)).toBe("ideal");
    expect(defaultActivityFor("NRTL", ["benzene"], ALL_UNIFAC)).toBe("NRTL");
  });

  it("does NOT flip away from an `assumed` record", () => {
    //  THE SPLIT: the default asks what the ENGINE WILL DO.  An `assumed`
    //  record exists, so the run is not refused and the model stands; that
    //  the record is an assumption is the NOTE's business, and saying it
    //  twice with two meanings is how the tick got onto an ideal line.
    expect(defaultActivityFor("NRTL", ["benzene", "toluene"], ALL_UNIFAC)).toBe("NRTL");
  });

  it("offers no fallback it cannot deliver", () => {
    expect(defaultActivityFor("NRTL", ["benzene", "nHexane"], NO_UNIFAC)).toBe("NRTL");
  });

  it("reads the record, not the component names", () => {
    //  injected catalogue: the same selection, once covered and once not.
    const covered = lookupOf([{ model: "NRTL", a: "p", b: "q", origin: "literature" }]);
    expect(defaultActivityFor("NRTL", ["p", "q"], ALL_UNIFAC, covered)).toBe("NRTL");
    expect(defaultActivityFor("NRTL", ["p", "q"], ALL_UNIFAC, lookupOf([]))).toBe("UNIFAC");
    //  a record with NO origin word is a record all the same -- present, and
    //  making no claim about being an assumption.
    const bare = lookupOf([{ model: "NRTL", a: "p", b: "q", origin: "" }]);
    expect(pairCoverage("NRTL", ["p", "q"], bare)[0]!.status).toBe("curated");
  });
});

describe("which line of a refusal reaches the student", () => {
  //  The log of the three-organic ternary, natively (audit 2026-09-20).
  const LOG = [
    "[v2 native] equilibrium gammaPhi: liquid activity.NRTL; vapour idealGas.",
    "[unmarked] component 'benzene': no `reviewStatus` declared -- ...",
    "*** choupoProps fatal error: NRTL: the case declares NRTL, but 2 binary"
      + " pair(s) have no parameters and would therefore run as IDEAL:"
      + " benzene-nHexane, toluene-nHexane.",
    "        That is a DIFFERENT MODEL from the one requested.  It is refused"
      + " rather than announced-and-applied, because the problem solved would"
      + " not be the problem posed.",
    "        Four legitimate paths, all of which exist today:",
    "          * add the parameter record(s) under constant/parameters/NRTL/;",
  ].join("\n");

  it("takes the HEADLINE, which is the only line naming the pairs", () => {
    const d = failureHeadline(LOG)!;
    expect(d).toContain("benzene-nHexane");
    expect(d).toContain("toluene-nHexane");
    //  ...and not the explanation, which is what reading backwards returned
    expect(d).not.toContain("DIFFERENT MODEL");
  });

  it("falls back rather than going silent on a log shape it does not know", () => {
    expect(failureHeadline("something went wrong\nrun failed at step 3"))
      .toBe("run failed at step 3");
    expect(failureHeadline("all fine\nnothing to report")).toBeUndefined();
  });
});
