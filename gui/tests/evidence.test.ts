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
  evidence — the measured datasets the GUI can see (DEV.md 4c C117).

  Vitor's acceptance test for the slice: open the Explorer on methanol + water
  and see the two studies curate04 carries (doi 10.1016/j.jct.2009.11.020 and
  10.1021/je200341c) WITHOUT opening the curation case.  The hosted site has
  `data/local/` EMPTY, so that must come from the TUTORIAL tier -- which is
  what the first arm pins.  Nothing here depends on `data/local/` holding
  anything: the local tier is asserted only to be a list.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  allEvidence, caseEvidence, columnIndex, evidenceCorpusSize, evidenceForPair,
  localEvidence, readEvidence, rowPressurePa, tutorialEvidence, xColumn,
} from "../src/case/evidence.js";

const JCT = "10.1016/j.jct.2009.11.020";
const JE = "10.1021/je200341c";

describe("the tutorial tier carries curate04's two methanol-water studies", () => {
  it("finds both, order-free, from the bundled tutorials alone", () => {
    expect(evidenceCorpusSize()).toBeGreaterThan(0);
    const mw = tutorialEvidence().filter((d) => d.subject.kind === "pair"
      && [...d.subject.components].sort().join("+") === "methanol+water");
    const dois = mw.map((d) => d.provenance.doi);
    expect(dois).toContain(JCT);
    expect(dois).toContain(JE);
    for (const d of mw) {
      expect(d.tier).toBe("tutorial");
      expect(d.casePath.startsWith("tutorials/")).toBe(true);
      expect(d.caseName).not.toBe("");
      expect(d.property).toBe("binaryVLE.T_bubble");
      expect(d.provenance.citation).not.toBe("");
      expect(d.provenance.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(d.nPoints).toBe(d.rows.length);
    }
    //  order-free: the pair is a SET
    const a = evidenceForPair("methanol", "water").map((d) => d.id).sort();
    const b = evidenceForPair("water", "methanol").map((d) => d.id).sort();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(2);
  });

  it("converts every column to canonical SI by its DECLARED unit", () => {
    const je = evidenceForPair("methanol", "water").find((d) => d.provenance.doi === JE)!;
    //  `pressure 101.32 kPa;` -> Pa
    expect(je.heldPressurePa).toBeCloseTo(101320, 3);
    expect(je.heldTemperatureK).toBeNull();
    const x = xColumn(je)!;
    expect(x.component).toBe("methanol");
    const t = columnIndex(je, "T_bubble");
    expect(t).toBeGreaterThanOrEqual(0);
    //  13 interior points, T in K already, x a fraction
    expect(je.nPoints).toBe(13);
    for (const r of je.rows) {
      expect(r[x.index]!).toBeGreaterThan(0);
      expect(r[x.index]!).toBeLessThan(1);
      expect(r[t]!).toBeGreaterThan(330);
      expect(r[t]!).toBeLessThan(375);
    }
    //  the two pure endpoints are SET ASIDE, not in the rows, and counted
    expect(je.pureEndpointsSetAside).toBe(2);
    //  a per-point uncertainty rides with the column it is about, one per row
    const u = je.uncertainties.find((q) => q.column === "T_bubble")!;
    expect(u).toBeDefined();
    expect(u.values.length).toBe(je.nPoints);
    expect(u.level).toBe(95);
    expect(u.kind).toBe("expandedCombined");

    //  the jct set carries its pressure as a COLUMN (six isobars), in kPa
    const jct = evidenceForPair("methanol", "water").find((d) => d.provenance.doi === JCT)!;
    expect(jct.heldPressurePa).toBeNull();
    expect(columnIndex(jct, "Pressure")).toBeGreaterThanOrEqual(0);
    const ps = new Set(jct.rows.map((_, r) => Math.round(rowPressurePa(jct, r)!)));
    expect(ps.size).toBe(6);
    expect(Math.min(...ps)).toBeCloseTo(15190, 0);
    expect(Math.max(...ps)).toBeCloseTo(95300, 0);
    expect(jct.nPoints).toBe(54);
  });
});

describe("the three tiers merge by sha256, nearest tier first", () => {
  it("the open case's copy of a tutorial dataset is ONE dataset, listed as case", () => {
    const je = tutorialEvidence().find((d) => d.provenance.doi === JE)!;
    //  Fake an open case carrying the same file (a student opened curate04).
    const rawFiles = { "constant/experiments/copy-of-je.dat": datText(je) };
    const merged = evidenceForPair("methanol", "water", rawFiles)
      .filter((d) => d.provenance.doi === JE);
    expect(merged.length).toBe(1);
    expect(merged[0]!.tier).toBe("case");
    expect(merged[0]!.alsoIn).toContain("tutorial");
    //  and with no case open the tutorial entry stands alone
    const alone = evidenceForPair("methanol", "water").filter((d) => d.provenance.doi === JE);
    expect(alone[0]!.alsoIn).not.toContain("case");
  });

  it("the local tier is a list, possibly empty -- never a requirement", () => {
    expect(Array.isArray(localEvidence())).toBe(true);
    expect(caseEvidence(undefined)).toEqual([]);
    expect(allEvidence().length).toBeGreaterThanOrEqual(tutorialEvidence().length);
  });
});

describe("readEvidence refuses what it cannot draw", () => {
  const ok = `
property     binaryVLE.T_bubble;
system       ( benzene toluene );
pressure     1.01325 bar;
provenance   { source measured; citation "X"; sha256 "abc"; }
uncertainty  { T_bubble { kind standard; level 68; unit C; values ( 0.5 0.5 ); } }
columns      ( { name x[benzene]; unit -; } { name T_bubble; unit C; } );
data         ( 0.2 95.0  0.8 85.0 );
`;
  it("reads a well-formed set, converting the affine column and its DIFFERENCE uncertainty differently", () => {
    const d = readEvidence(ok, { file: "x/bt.dat", tier: "local" })!;
    expect(d).not.toBeNull();
    expect(d.id).toBe("bt");
    expect(d.heldPressurePa).toBeCloseTo(101325, 0);
    expect(d.rows[0]![1]).toBeCloseTo(368.15, 6);   // 95 degC -> K: shifted
    expect(d.uncertainties[0]!.values[0]).toBeCloseTo(0.5, 12);   // 0.5 degC step -> 0.5 K: not shifted
    expect(d.subject).toEqual({ kind: "pair", components: ["benzene", "toluene"] });
  });
  it("a file with no subject, no grid, or a ragged grid is nothing, not an empty dataset", () => {
    expect(readEvidence(ok.replace("system       ( benzene toluene );", ""), { file: "a.dat", tier: "local" })).toBeNull();
    expect(readEvidence(ok.replace(/data\s+\(.*\);/, ""), { file: "a.dat", tier: "local" })).toBeNull();
    expect(readEvidence(ok.replace("0.8 85.0", "0.8"), { file: "a.dat", tier: "local" })).toBeNull();
    expect(readEvidence("not a dict {{{", { file: "a.dat", tier: "local" })).toBeNull();
  });
  it("a pure-property set names its component", () => {
    const d = readEvidence(ok.replace("system       ( benzene toluene );", "component benzene;"),
                           { file: "a.dat", tier: "local" })!;
    expect(d.subject).toEqual({ kind: "component", component: "benzene" });
  });
});

/** Re-spell a parsed dataset as text, so a test can fake a case carrying it.
 *  Only what the reader needs: subject, pressure, provenance, columns, data. */
function datText(d: ReturnType<typeof tutorialEvidence>[number]): string {
  //  rows are SI already, so the restated columns declare SI units (K, Pa,
  //  the fraction) and the held pressure is restated in Pa
  const colsSI = d.columns.map((c) => `{ name ${c.name}; unit ${c.unit === "-" ? "-" : c.name === "Pressure" ? "Pa" : "K"}; }`).join(" ");
  const grid = d.rows.map((r) => r.join(" ")).join("\n");
  return `property ${d.property};
system ( ${(d.subject as { components: [string, string] }).components.join(" ")} );
${d.heldPressurePa !== null ? `pressure ${d.heldPressurePa} Pa;` : ""}
provenance { source measured; citation "${d.provenance.citation.replace(/"/g, "'")}"; doi "${d.provenance.doi}"; sha256 "${d.provenance.sha256}"; }
columns ( ${colsSI} );
data ( ${grid} );
`;
}
