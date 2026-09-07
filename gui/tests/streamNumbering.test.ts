/*---------------------------------------------------------------------------*\
  Stream-numbering coverage for a fractal multi-sector plant.

  Vitor reported "muitas correntes nao tem numero!" on the ChemicalPlantTutorial
  flowsheet: ~58% of streams (every unit->unit pipe INSIDE a sector) showed no
  PFD badge.  Root cause: globalStreamNumbering read the sub-flowsheet under the
  wrong rawFiles key (`<child>/system/flowsheetDict`) so the walk never descended
  into a sector and never registered its internal connections.  This test pins
  the invariant: EVERY flattened result-stream name of the plant resolves to a
  number at the root view (0 are left unnumbered), and aliased boundary streams
  keep a single shared number (the absolute-numbering invariant).
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { globalStreamNumbering } from "../src/case/streamNumbering.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const PLANT = join(HERE, "..", "..", "tutorials", "plant", "ChemicalPlantTutorial");

function walkFiles(dir: string, base: string, out: Record<string, string>): void {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkFiles(p, base, out);
    else out[relative(base, p)] = readFileSync(p, "utf8");
  }
}

//  Qualified stream ENDPOINTS of the plant, in the dotted form the canvas and
//  the pop-outs hand the resolver.  This list is NOT what choupoSolve emits as
//  stream identities -- a comment here used to say it was, and it had gone
//  false: the engine's identity for the crystalliser's magma is
//  `CONCENTRATION.Magma`, not `CONCENTRATION.Cryst.Magma`.  Both resolve, and
//  both must: the unit-qualified form is a real endpoint of the sector's own
//  edge.  The identities the RESULT carries are pinned separately below.
const RESULT_STREAMS = [
  "CONCENTRATION.Cryst.Magma", "CONCENTRATION.Evap1.Cond1",
  "CONCENTRATION.Evap1.Juice1", "CONCENTRATION.Evap1.Vap1",
  "CONCENTRATION.Evap2.Cond2", "CONCENTRATION.Evap2.Syrup",
  "CONCENTRATION.Evap2.Vap2", "DRYING.BD.DryPowder", "DRYING.BD.Vapour",
  "DRYING.CY.Dust", "DRYING.CY.ExhaustClean", "DRYING.SD.Exhaust",
  "DRYING.SD.WetPowder", "DryerVapour", "DryingAir", "EthanolVapour",
  "EvapCondensate1", "EvapCondensate2", "EvapVapour",
  "FERMENTATION.Fermentor.Out", "FERMENTATION.Flash.Liquid",
  "FERMENTATION.Flash.Vapour", "FERMENTATION.Mixer.Mixed",
  "FERMENTATION.Recycle", "FERMENTATION.Splitter.Purge",
  "MAIN.JuiceSplitter.ToConcentration", "MAIN.JuiceSplitter.ToFermentation",
  "PlantSteam", "Powder", "Purge", "RawJuice", "RecoveredDust", "Stack",
];


//  The 25 stream IDENTITIES of the flagship plant, as published by
//  `choupoSolve --manifest tutorials/plant/ChemicalPlantTutorial` (measured
//  2026-09-07).  One per pipe: the plant's own inlets under the names the
//  boundary declares, everything else under its qualified identity.
const MANIFEST_IDENTITIES = [
  "BdAir", "CONCENTRATION.Cond1", "CONCENTRATION.Cond2",
  "CONCENTRATION.Juice1", "CONCENTRATION.Magma", "CONCENTRATION.Syrup",
  "CONCENTRATION.Vap1", "CONCENTRATION.Vap2", "DRYING.DryPowder",
  "DRYING.Dust", "DRYING.Exhaust", "DRYING.ExhaustClean", "DRYING.Vapour",
  "DRYING.WetPowder", "DryingAir", "FERMENTATION.Liquid",
  "FERMENTATION.Mixed", "FERMENTATION.Out", "FERMENTATION.Purge",
  "FERMENTATION.Recycle", "FERMENTATION.Vapour", "MAIN.ToConcentration",
  "MAIN.ToFermentation", "PlantSteam", "RawJuice",
];

describe("fractal plant stream numbering (ChemicalPlantTutorial)", () => {
  it("numbers every stream in the view -- no interior pipe left unnumbered", () => {
    const raw: Record<string, string> = {};
    walkFiles(PLANT, PLANT, raw);
    const rootText = raw["system/flowsheetDict"];
    expect(rootText).toBeDefined();
    const rootFs = toJson(
      parse(rootText!, { sourceName: "root" }),
    ) as JsonDict;
    const resolve = globalStreamNumbering(rootFs, raw);

    const missing = RESULT_STREAMS.filter((s) => resolve("", s) === undefined);
    expect(missing).toEqual([]);                       // 0 unnumbered

    // The interior unit->unit pipes (the ones that were missing) now resolve...
    expect(resolve("", "CONCENTRATION.Evap1.Juice1")).toBeGreaterThan(0);
    expect(resolve("", "FERMENTATION.Recycle")).toBeGreaterThan(0);
    expect(resolve("", "DRYING.SD.WetPowder")).toBeGreaterThan(0);

    // ...and an aliased stream (sector outlet renamed at the plant boundary) keeps
    // ONE number across both names -- the absolute-numbering invariant.
    expect(resolve("", "CONCENTRATION.Evap2.Vap2"))
      .toBe(resolve("", "EvapVapour"));
  });

  //  THE ROWS THE STREAMS TABLE ACTUALLY DRAWS.  Since 2026-09-07 the table
  //  draws one row per PHYSICAL stream, under the qualified identity, and the
  //  identities are exactly the keys of the engine's canonical manifest
  //  (`choupoSolve --manifest`, which is also what decides where each state
  //  file goes -- so the table and the `0/` tree agree by construction).
  //  Vitor's symptom was rows with no number: they were the BARE sector
  //  labels (`Cond1`, `Magma`), which appear in no view's connection list and
  //  so belong to no numbering class.  Those rows are gone; what is left must
  //  be numbered to the last one.
  it("every row the Streams table draws carries a number", () => {
    const raw: Record<string, string> = {};
    walkFiles(PLANT, PLANT, raw);
    const rootFs = toJson(
      parse(raw["system/flowsheetDict"]!, { sourceName: "root" }),
    ) as JsonDict;
    const resolve = globalStreamNumbering(rootFs, raw);

    const missing = MANIFEST_IDENTITIES.filter((s) => resolve("", s) === undefined);
    expect(missing).toEqual([]);
    expect(MANIFEST_IDENTITIES).toHaveLength(25);
  });
});
