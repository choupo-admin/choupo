/*---------------------------------------------------------------------------*\
  The TINKERING scratch overlay: transient numeric edits grabbed in the
  Properties box, applied to the case JSON at Run, never written to disk.
  These tests pin the path parsing, the unit-tagged serialisation, and that
  applyScratch clones only the touched spine while leaving disk values intact.
\*---------------------------------------------------------------------------*/
import { describe, it, expect } from "vitest";
import {
  parsePath,
  scratchToJsonValue,
  applyScratch,
  type ScratchEdits,
} from "../src/case/scratch.js";
import type { CaseFiles } from "../src/case/types.js";

describe("parsePath", () => {
  it("splits dotted keys and array indices", () => {
    expect(parsePath("streams.feed.T")).toEqual(["streams", "feed", "T"]);
    expect(parsePath("units[0].operation.refluxRatio"))
      .toEqual(["units", 0, "operation", "refluxRatio"]);
    expect(parsePath("a[2][3].b")).toEqual(["a", 2, 3, "b"]);
  });
});

describe("scratchToJsonValue", () => {
  it("re-attaches the unit (the engine is units-mandatory)", () => {
    expect(scratchToJsonValue({ value: 355, from: 370, unit: "K", label: "feed.T" }))
      .toBe("355 K");
    expect(scratchToJsonValue({ value: 1.2, from: 1, unit: "bar", label: "feed.P" }))
      .toBe("1.2 bar");
  });
  it("leaves a dimensionless knob a bare number", () => {
    expect(scratchToJsonValue({ value: 2.6, from: 2, label: "refluxRatio" }))
      .toBe(2.6);
  });
});

describe("applyScratch", () => {
  const base = (): CaseFiles => ({
    flowsheet: {
      streams: { feed: { F: "100 kmol/h", T: "370 K", P: "1 bar" } },
      units: [
        { name: "col", type: "distillationColumn",
          operation: { refluxRatio: 2.0, nStages: 15 } },
      ],
    },
  } as unknown as CaseFiles);

  // Resolve a dotted/indexed path to its leaf value -- a tiny dynamic walk so
  // the assertions stay readable under strict null checks.
  const at = (files: CaseFiles, path: string): unknown => {
    let cur: unknown = files.flowsheet;
    for (const seg of parsePath(path)) {
      cur = (cur as Record<string | number, unknown>)?.[seg];
    }
    return cur;
  };

  it("overlays a feed scalar as a unit-tagged string, leaving the rest intact", () => {
    const files = base();
    const edits: ScratchEdits = {
      "streams.feed.T": { value: 355, from: 370, unit: "K", label: "feed.T" },
    };
    const out = applyScratch(files, edits);
    expect(at(out, "streams.feed.T")).toBe("355 K");
    expect(at(out, "streams.feed.P")).toBe("1 bar");      // untouched survives
    expect(at(files, "streams.feed.T")).toBe("370 K");    // disk not mutated
  });

  it("overlays an operation scalar by units[idx] path", () => {
    const out = applyScratch(base(), {
      "units[0].operation.refluxRatio": { value: 2.6, from: 2, label: "refluxRatio" },
    });
    expect(at(out, "units[0].operation.refluxRatio")).toBe(2.6);
    expect(at(out, "units[0].operation.nStages")).toBe(15);  // sibling untouched
  });

  it("no edits -> returns the same object (cheap identity)", () => {
    const files = base();
    expect(applyScratch(files, {})).toBe(files);
  });

  it("refuses an out-of-range / non-array index instead of fabricating structure", () => {
    const out = applyScratch(base(), {
      "units[9].operation.refluxRatio": { value: 5, from: 2, label: "x" },
    });
    expect((at(out, "units") as unknown[]).length).toBe(1);  // unchanged
  });
});
