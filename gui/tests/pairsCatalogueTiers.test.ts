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
  pairsCatalogue -- the three tiers of binary-pair records (DEV.md 4c C117).

  A record's TIER is part of its identity: the standards NRTL methanol-water
  record and the copy curate04 mirrors into its own constant/parameters/ are
  two entries of one model, labelled apart, never merged.  `hasPair()` keeps
  its meaning (curated = standards) so every reader of the Explorer note is
  unchanged.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  PAIRS, casePairs, hasPair, localPairs, pairProvenanceLabel, pairRecordsFor, readPairRecord,
} from "../src/case/pairsCatalogue.js";

describe("the standards tier", () => {
  it("ships the regressed NRTL methanol-water pair with its parameters and provenance", () => {
    const recs = pairRecordsFor("water", "methanol").filter((p) => p.tier === "standards");
    const nrtl = recs.find((p) => p.model === "NRTL");
    expect(nrtl).toBeDefined();
    expect(nrtl!.stem).toBe("methanol-water");
    expect(nrtl!.file).toBe("data/standards/parameters/NRTL/methanol-water.dat");
    //  the block the Evidence view inlines: i/j and the NRTL coefficients
    expect(nrtl!.parameters.i).toBe("methanol");
    expect(nrtl!.parameters.j).toBe("water");
    for (const k of ["a_ij", "b_ij", "a_ji", "b_ji", "alpha"])
      expect(typeof nrtl!.parameters[k], k).toBe("number");
    expect(nrtl!.provenance.origin).toBe("fitted");
    expect(nrtl!.provenance.fittedInCase).toBe("tutorials/props/curation/curate04_nrtl_methanol_water");
    expect(pairProvenanceLabel(nrtl!)).toMatch(/^standards · fitted/);
    //  hasPair keeps its curated meaning
    expect(hasPair("NRTL", "methanol", "water")).toBe(true);
    expect(hasPair("NRTL", "water", "methanol")).toBe(true);
    //  MEASURED on the day: no standards UNIQUAC or Wilson record covers the pair
    expect(hasPair("UNIQUAC", "methanol", "water")).toBe(false);
    expect(PAIRS.every((p) => p.tier === "standards")).toBe(true);
  });
});

describe("the case and local tiers are DISTINCT entries", () => {
  const nrtlStd = PAIRS.find((p) => p.model === "NRTL" && p.stem === "methanol-water")!;
  const caseCopy = `recordType binaryInteractionParameters;
components ( methanol water );
model NRTL;
parameters { i methanol; j water; a_ij 0; b_ij 165.00630266; a_ji 0; b_ji 41.76488968; alpha 0.3; }
provenance { origin fitted; reviewStatus interim; fittedInCase "tutorials/props/curation/curate04_nrtl_methanol_water"; }
`;
  it("the open case's mirrored record is a second NRTL entry, labelled as the case's", () => {
    const rawFiles = { "constant/parameters/NRTL/methanol-water.dat": caseCopy,
                       "constant/parameters/UNIFAC/groups.dat": "recordType unifacGroups; groups ( );" };
    const recs = pairRecordsFor("methanol", "water", rawFiles);
    const nrtls = recs.filter((p) => p.model === "NRTL");
    expect(nrtls.map((p) => p.tier)).toEqual(["standards", "case"]);
    expect(nrtls[1]!.parameters.b_ij).toBe(nrtlStd.parameters.b_ij);
    expect(pairProvenanceLabel(nrtls[1]!)).toMatch(/^open case · fitted · interim · fitted in curate04/);
    //  a UNIFAC groups file names no two components and is not a pair record
    expect(casePairs(rawFiles).length).toBe(1);
    //  without a case, the case tier is empty
    expect(casePairs(undefined)).toEqual([]);
    expect(hasPair("NRTL", "methanol", "water")).toBe(true);   // unchanged by the case
  });
  it("the local tier is a list, possibly empty, with the model read off the folder when the record omits it", () => {
    expect(Array.isArray(localPairs())).toBe(true);
    const p = readPairRecord("components ( a b ); parameters { i a; j b; a_ij 1; }",
                             { file: "data/local/parameters/Wilson/a-b.dat", tier: "local", modelHint: "Wilson" })!;
    expect(p.model).toBe("Wilson");
    expect(p.tier).toBe("local");
    expect(pairProvenanceLabel(p)).toBe("data/local");
    expect(readPairRecord("components ( a b c );", { file: "x.dat", tier: "local", modelHint: "NRTL" })).toBeNull();
  });
});
