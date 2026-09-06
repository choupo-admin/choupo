/*  A STALE RESULT IS VISIBLE -- the comparison, pinned.
 *
 *  On 2026-09-06 Vítor ran a case in the delivered app and asked what the
 *  screen does once a knob moves.  It did nothing: the previous solve went on
 *  being drawn at full strength beside an unchanged Run control.  DECIDED:
 *  the result surfaces DIM and the Run control carries the count of pending
 *  edits -- an annotated stale number is still read as a number.
 *
 *  What these pin is the DECISION, and just as importantly its LIMITS: it is
 *  a fingerprint of the declared case stamped on the result, not a dependency
 *  analysis, so it dims everything or nothing, and it says NOTHING when there
 *  is no result or no stamp.  A test that asserted a per-value staleness
 *  claim would be pinning a graph this project does not have.
 *
 *  Two source arms ride along: the one home of "which workspaces draw a run"
 *  must have exactly one home (store.ts used to carry its own copy of the
 *  list), and the two dimming classes must be defined in the stylesheet --
 *  a class no rule matches dims nothing while every test still passes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { CaseFiles } from "../src/case/types";
import type { ScratchEdits } from "../src/case/scratch";
import { applyScratch } from "../src/case/scratch";
import { fingerprintCase, runInputsOf, stalenessOf } from "../src/case/staleness";
import { RESULT_WORKSPACES } from "../src/ui/workspaces";

const base: CaseFiles = {
  flowsheet: { units: [{ name: "F1", type: "flash", operation: { T: "350 K", P: "1 bar" } }] },
  thermoPackage: { components: ["benzene", "toluene"] },
  controlDict: { application: "choupoSolve", verbosity: 3 },
  extraFiles: { "0/feed": "T 300 K;\nP 1 bar;\n" },
  rawFiles: { "system/flowsheetDict": "// a comment nobody solves with\nunits ( ... );\n" },
};

const inputsOf = (files: CaseFiles, edits: ScratchEdits = {}) =>
  runInputsOf(applyScratch(files, edits), edits);

describe("staleness: the fingerprint", () => {
  it("is stable under key order -- two structurally equal cases fingerprint the same", () => {
    const reordered: CaseFiles = {
      controlDict: { verbosity: 3, application: "choupoSolve" },
      thermoPackage: base.thermoPackage,
      flowsheet: base.flowsheet,
      extraFiles: base.extraFiles,
      rawFiles: base.rawFiles,
    };
    expect(fingerprintCase(reordered)).toBe(fingerprintCase(base));
  });

  it("IGNORES rawFiles -- a comment is not physics", () => {
    const commented = { ...base, rawFiles: { "system/flowsheetDict": "// a different comment\n" } };
    expect(fingerprintCase(commented)).toBe(fingerprintCase(base));
  });

  it("IGNORES the .cho marker -- the canvas auto-saves a layout on every drag", () => {
    //  On a LOCAL case the bridge watches the folder, so the layout write comes
    //  straight back into the store as new caseFiles.  Hashing it would dim a
    //  current result because somebody moved a box.
    const moved = { ...base,
      extraFiles: { ...base.extraFiles, "flash01.cho": "layout { nodes ( ... ); }\n" } };
    const movedAgain = { ...base,
      extraFiles: { ...base.extraFiles, "flash01.cho": "layout { nodes ( elsewhere ); }\n" } };
    expect(fingerprintCase(moved)).toBe(fingerprintCase(base));
    expect(fingerprintCase(movedAgain)).toBe(fingerprintCase(moved));
  });

  it("moves when a solved input moves -- a dict scalar, and a 0/ state file", () => {
    const hotter = { ...base, flowsheet: { units: [{ name: "F1", type: "flash", operation: { T: "360 K", P: "1 bar" } }] } };
    expect(fingerprintCase(hotter)).not.toBe(fingerprintCase(base));
    const refed = { ...base, extraFiles: { "0/feed": "T 305 K;\nP 1 bar;\n" } };
    expect(fingerprintCase(refed)).not.toBe(fingerprintCase(base));
  });
});

describe("staleness: the verdict", () => {
  it("says NOTHING with no result, and nothing with an unstamped result", () => {
    const now = inputsOf(base);
    expect(stalenessOf(now, null, true)).toEqual({ stale: false, pendingEdits: 0 });
    expect(stalenessOf(now, inputsOf(base), false)).toEqual({ stale: false, pendingEdits: 0 });
  });

  it("is NOT stale when the drawn result answers exactly what is declared", () => {
    expect(stalenessOf(inputsOf(base), inputsOf(base), true))
      .toEqual({ stale: false, pendingEdits: 0 });
  });

  it("counts the scratch knobs moved since the run", () => {
    const ran = inputsOf(base);
    const edits: ScratchEdits = {
      "units[0].operation.T": { value: 355, from: 350, unit: "K", label: "F1.T" },
      "units[0].operation.P": { value: 2, from: 1, unit: "bar", label: "F1.P" },
    };
    const now = inputsOf(base, edits);
    expect(stalenessOf(now, ran, true)).toEqual({ stale: true, pendingEdits: 2 });
  });

  it("counts a knob RETURNED to a third value as one pending edit, not two", () => {
    const first: ScratchEdits = { "units[0].operation.T": { value: 355, from: 350, unit: "K", label: "F1.T" } };
    const then: ScratchEdits = { "units[0].operation.T": { value: 360, from: 350, unit: "K", label: "F1.T" } };
    expect(stalenessOf(inputsOf(base, then), inputsOf(base, first), true))
      .toEqual({ stale: true, pendingEdits: 1 });
  });

  it("is not stale when the overlay is put BACK exactly as it was run", () => {
    const edits: ScratchEdits = { "units[0].operation.T": { value: 355, from: 350, unit: "K", label: "F1.T" } };
    const ran = inputsOf(base, edits);
    //  same knob, same value, a different label/from: the SOLVER saw the same
    //  case, so the drawn answer is still the answer.
    const relabelled: ScratchEdits = { "units[0].operation.T": { value: 355, from: 351, unit: "K", label: "flash.T" } };
    expect(stalenessOf(inputsOf(base, relabelled), ran, true).stale).toBe(false);
  });

  it("STALE WITH ZERO PENDING EDITS is a real state: the files changed under an unmoved overlay", () => {
    const edits: ScratchEdits = { "units[0].operation.T": { value: 355, from: 350, unit: "K", label: "F1.T" } };
    const ran = inputsOf(base, edits);
    const rewritten = { ...base, thermoPackage: { components: ["benzene", "toluene", "xylene"] } };
    const v = stalenessOf(inputsOf(rewritten, edits), ran, true);
    //  the control must then say the result is stale WITHOUT claiming a count
    //  it does not have -- an edit count is a count of knobs, not of numbers.
    expect(v).toEqual({ stale: true, pendingEdits: 0 });
  });
});

describe("staleness: one home, and a class that actually dims", () => {
  it("RESULT_WORKSPACES is the only copy of the list -- store.ts reads it", () => {
    const store = readFileSync(resolve(__dirname, "../src/state/store.ts"), "utf8");
    expect(store).toContain("RESULT_WORKSPACES");
    //  the literal list must not have come back beside the import
    expect(store).not.toMatch(/\["plots",\s*"reports",\s*"streams"/);
    expect(RESULT_WORKSPACES).toContain("streams");
    //  the flowsheet is deliberately absent: it draws the declaration too
    expect(RESULT_WORKSPACES as readonly string[]).not.toContain("flowsheet");
  });

  it("both dimming classes are defined in the stylesheet", () => {
    const css = readFileSync(resolve(__dirname, "../src/theme-overrides.css"), "utf8");
    expect(css).toMatch(/\.choupo-stale-canvas\s+\.react-flow__edge\s*\{[^}]*opacity/);
    expect(css).toMatch(/\.choupo-stale-body\s*\{[^}]*opacity/);
  });

  it("the run STAMPS what it was given, and the canvas and shell both ask the one hook", () => {
    const topBar = readFileSync(resolve(__dirname, "../src/ui/TopBar.tsx"), "utf8");
    //  the subject is the TINKERED case, never filesForRun -- the display
    //  preset and a drilled sector's frozen boundary state are added by the
    //  run, not declared by the student.
    expect(topBar).toContain("finishRun(result, runInputsOf(tinkered, scratchEdits))");
    for (const f of ["../src/ui/FlowCanvas.tsx", "../src/ui/AppShell.tsx"])
      expect(readFileSync(resolve(__dirname, f), "utf8")).toContain("useStaleResult()");
  });
});
