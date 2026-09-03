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
      expect(d.casePath.startsWith("tutorials/")).toBe(true);
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
    const w = dossiersFor("water");
    expect(w.map((d) => d.verdict).sort())
      .toEqual(["validated", "validationRefused"]);
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
