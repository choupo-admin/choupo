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

import { describe, expect, it } from "vitest";

import { dossierCorpusSize, dossiersFor, readDossier } from "../src/case/dossier.js";

describe("dossiersFor — the corpus's own curation records", () => {
  it("finds the dossiers the corpus actually ships", () => {
    //  The GUI used to state, in prose, that no dossier was attached to any
    //  component — code that had never looked.  This arm is the measurement.
    expect(dossierCorpusSize()).toBeGreaterThan(0);
    const eth = dossiersFor("ethanol");
    expect(eth.length).toBeGreaterThan(0);
    for (const d of eth) {
      expect(d.component).toBe("ethanol");
      //  EVERY ENTRY NAMES ITS CASE.  Without it the row reads as a property
      //  of the catalogue record rather than of one curation run.
      expect(d.caseName).not.toBe("");
      expect(/^(tutorials|data\/curation)\//.test(d.casePath)).toBe(true);
    }
  });

  it("carries the held-out verdict and the band declared before the fit", () => {
    const v = dossiersFor("ethanol").find((d) => d.property === "binaryVLE.T_bubble"
                                              && d.verdict === "validated");
    expect(v).toBeDefined();
    expect(v!.acceptanceMaxAADPct).not.toBeNull();
    expect(v!.aadHeldOutPct).not.toBeNull();
    //  The verdict must FOLLOW from the two numbers beside it: a panel showing
    //  `validated` next to an AAD above its own band would be drawing a claim
    //  the arithmetic contradicts.
    expect(v!.aadHeldOutPct!).toBeLessThanOrEqual(v!.acceptanceMaxAADPct!);
    expect(v!.acceptanceOrigin).not.toBe("");
    expect(v!.partitionFingerprint).not.toBe("");
    expect(v!.datasets.some((d) => d.role === "validation")).toBe(true);
  });

  it("the corpus's own two-verdict dossier survives the round trip", () => {
    //  curate01 curates vapourPressure TWICE with opposite verdicts.  Keyed by
    //  the property name the second would replace the first, and the half that
    //  disappears is `validationRefused` — the one a reader most needs to see.
    //  Narrowed to curate01, the case this test names: the pair-curation
    //  cases (data/curation/pairs/triethyleneGlycol-water, .../ethyleneGlycol-water, ...) carry their own water dossiers.
    const w = dossiersFor("water").filter((d) =>
      d.caseName === "curate01_water_evidence_partition");
    expect(w.map((d) => d.verdict).sort())
      .toEqual(["validated", "validationRefused"]);
  });

  it("the generated pair cases under data/curation are found, by their real path", () => {
    const w = dossiersFor("water").filter((d) =>
      d.casePath === "data/curation/pairs/triethyleneGlycol-water"
      || d.casePath === "data/curation/pairs/ethyleneGlycol-water");
    expect(new Set(w.map((d) => d.casePath)).size).toBe(2);
    for (const d of w) expect(d.caseName).toMatch(/water$/);
  });

  it("a component nobody curated comes back empty, and that is a looked-at answer", () => {
    expect(dossiersFor("no-such-component-anywhere")).toEqual([]);
  });

  it("an entry counts when it names its property AND declares a verdict", () => {
    const ds = readDossier(
      "component x;\n" +
      "reviewStatus unreviewed;\n" +
      "notes { author someone; }\n" +
      "properties\n(\n" +
      "{ property a; verdict validated; }\n" +
      "{ verdict validated; }\n" +
      "{ property c; }\n" +
      ");\n",
      "tutorials/fake/case");
    expect(ds.map((d) => d.property)).toEqual(["a"]);
  });

  it("two entries sharing a property name are BOTH kept", () => {
    const ds = readDossier(
      "component x;\nproperties\n(\n" +
      "{ property vapourPressure; verdict validated; }\n" +
      "{ property vapourPressure; verdict validationRefused; }\n" +
      ");\n",
      "tutorials/fake/case");
    expect(ds.map((d) => d.verdict)).toEqual(["validated", "validationRefused"]);
  });

  it("an unknown verdict word is not admitted", () => {
    //  The union mirrors CurationDossier::verdictOf exactly.  A file carrying a
    //  sixth word would be a classification the engine never made, and drawing
    //  it would invent one.
    const ds = readDossier(
      "component x;\nproperties ( { property p; verdict excellent; } );\n",
      "tutorials/fake/case");
    expect(ds).toEqual([]);
  });

  it("a body that does not parse, or names no component, yields nothing", () => {
    expect(readDossier("", "c")).toEqual([]);
    expect(readDossier("properties ( { property p; verdict validated; } );\n", "c")).toEqual([]);
  });
});
