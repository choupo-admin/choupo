/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * Which transient edits are IN FORCE on one unit.
 *
 * The witness is the first tutorial, where Vítor found it: `adiabaticFlash01`
 * declares `P 1.01325 bar`, he tinkered it to 1.5, the outlet streams came
 * back at 1.5 bar, and the node went on drawing 1.01.
 */
import { describe, it, expect } from "vitest";
import { operationScratch } from "../src/case/scratch";
import type { ScratchEdits } from "../src/case/scratch";

const FS = {
  units: [
    { name: "feedPump", type: "pump", operation: { dP: 2 } },
    { name: "flashAdiab", type: "adiabaticFlash", operation: { P: 101325 } },
  ],
} as never;

const EDITS: ScratchEdits = {
  "units[1].operation.P": { value: 1.5, from: 1.01325, unit: "bar", label: "P" },
};

describe("the edit the node must draw", () => {
  it("finds the unit BY NAME and returns its field", () => {
    const got = operationScratch(FS, "flashAdiab", EDITS);
    expect(Object.keys(got)).toEqual(["P"]);
    expect(got["P"]!.value).toBe(1.5);
    expect(got["P"]!.from).toBe(1.01325);
  });

  it("gives a unit NOTHING that belongs to its neighbour", () => {
    //  The index in the path is the neighbour's; a name-keyed lookup that
    //  ignored it would paint the wrong box amber, which is worse than no
    //  mark at all.
    expect(operationScratch(FS, "feedPump", EDITS)).toEqual({});
  });

  it("is empty when nothing was tinkered", () => {
    expect(operationScratch(FS, "flashAdiab", {})).toEqual({});
  });
});

describe("what it refuses to guess", () => {
  it("a unit the flowsheet does not carry gets NOTHING", () => {
    //  THIS FIXTURE WAS REWRITTEN BECAUSE A SABOTAGE SURVIVED.  The first
    //  version asked for an unknown unit while the only edit sat on
    //  `units[1]`, so a fallback to index 0 found nothing and the test
    //  passed by luck.  The edit is on `units[0]` here, which is exactly
    //  where a not-found fallback would land -- and landing there would
    //  paint the WRONG box amber, which is worse than no mark at all.
    const onFirst: ScratchEdits = {
      "units[0].operation.dP": { value: 3, from: 2, unit: "bar", label: "dP" },
    };
    expect(operationScratch(FS, "nobody", onFirst)).toEqual({});
    expect(operationScratch(FS, "feedPump", onFirst)["dP"]!.value).toBe(3);
  });

  it("a missing or malformed flowsheet gets NOTHING", () => {
    expect(operationScratch(undefined, "flashAdiab", EDITS)).toEqual({});
    expect(operationScratch({} as never, "flashAdiab", EDITS)).toEqual({});
    expect(operationScratch({ units: "no" } as never, "flashAdiab", EDITS)).toEqual({});
  });

  it("a STREAM edit is not an operation edit", () => {
    //  `streams.<name>.<field>` is the other path shape the overlay carries.
    //  It belongs to a stream card, never to a unit's parameter lines.
    const streamEdit: ScratchEdits = {
      "streams.feed.T": { value: 400, from: 380, unit: "K", label: "feed.T" },
    };
    expect(operationScratch(FS, "flashAdiab", streamEdit)).toEqual({});
  });

  it("a NESTED operation path is not a field the node draws", () => {
    //  The node draws scalar parameter lines; `operation.kinetics.A` is not
    //  one of them, and marking a line that is not shown would be a mark
    //  about nothing.
    const nested: ScratchEdits = {
      "units[1].operation.kinetics.A": { value: 2, from: 1, label: "A" },
    };
    expect(operationScratch(FS, "flashAdiab", nested)).toEqual({});
  });
});
