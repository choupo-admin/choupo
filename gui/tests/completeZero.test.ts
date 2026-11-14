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

/*  COMPLETE 0/ -- the browser's bin/choupo-init0 (DEV.md 4c C200 phase B').
 *
 *  Pure arms: the detection of the engine's own refusal, the harvest of the
 *  files -init0 wrote (new paths only, never an overwrite, generated marks),
 *  the announcement lines, the cheap hint.  Source arms: the refusal text the
 *  detector matches is STILL the engine's, the C++ entry and the link flags
 *  export `run_case_init0`, the worker has the branch, and every UI door
 *  (menu, run refusal, clipboard bridge) is wired -- a test that only
 *  exercised the pure functions would pass with the wiring missing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMPLETENESS_MARK, harvestInit0, init0Announcements, isGeneratedZero,
  parseIncomplete0, probablyMissingZero,
} from "../src/case/completeZero";
import type { CaseFiles } from "../src/case/types";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", rel), "utf8");

//  The message Flowsheet.cpp:2451-2469 throws, as the browser log shows it.
const REFUSAL = [
  "[stderr] ERROR: Flowsheet: 0/ COMPLETENESS violated BEFORE the solve (graph stream IDs != 0/ state files):",
  "  MISSING  0/V1  (graph stream, no state file)",
  "  MISSING  0/SEP/L  (graph stream, no state file)",
  "  ORPHAN   0/stale  (state file, no graph stream)",
  "An invalid 0/ must never contaminate the seeds -- fix the state tree (bin/choupo-init0 materialises missing files; ...",
].join("\n");

const base = (): CaseFiles => ({
  controlDict: {}, thermoPackage: {},
  flowsheet: { connections: { A: { from: "u1", to: "u2" }, B: { from: "u2", to: "u3" } },
               boundary: { inlets: ["feed"] } },
  extraFiles: { "0/feed": "T 300;" },
  rawFiles: { "0/feed": "T 300;" },
});

describe("parseIncomplete0", () => {
  it("reads the MISSING lines of the engine's refusal", () => {
    const r = parseIncomplete0(REFUSAL)!;
    expect(r.missing).toEqual(["V1", "SEP/L"]);
    expect(r.other).toEqual(["ORPHAN   0/stale  (state file, no graph stream)"]);
  });
  it("says nothing for a log without the refusal, or with only an orphan", () => {
    expect(parseIncomplete0("converged in 4 iterations")).toBeNull();
    expect(parseIncomplete0(`${COMPLETENESS_MARK}\n  ORPHAN   0/x  (state file, no graph stream)`)).toBeNull();
  });
});

describe("harvestInit0", () => {
  it("adds new 0/ files to both copies and names them", () => {
    const h = harvestInit0(base(), { "0/A": "a", "0/internalStates/S/col": "c" });
    expect(h.generated).toEqual(["0/A", "0/internalStates/S/col"]);
    expect(h.next.extraFiles!["0/A"]).toBe("a");
    expect(h.next.rawFiles!["0/A"]).toBe("a");
  });
  it("never overwrites a file the case already has", () => {
    const h = harvestInit0(base(), { "0/feed": "CLOBBER", "0/A": "a" });
    expect(h.kept).toEqual(["0/feed"]);
    expect(h.generated).toEqual(["0/A"]);
    expect(h.next.extraFiles!["0/feed"]).toBe("T 300;");
    expect(h.next.rawFiles!["0/feed"]).toBe("T 300;");
  });
  it("ignores anything outside 0/ and returns the same case when nothing is new", () => {
    const c = base();
    const h = harvestInit0(c, { "system/controlDict": "x", "converged/A": "y" });
    expect(h.generated).toEqual([]);
    expect(h.next).toBe(c);
  });
});

describe("generated marks", () => {
  it("hold while the file is what -init0 wrote, and drop on edit or on another case", () => {
    const gen = { "0/A": "a" };
    expect(isGeneratedZero("0/A", { "0/A": "a" }, gen)).toBe(true);
    expect(isGeneratedZero("0/A", { "0/A": "edited" }, gen)).toBe(false);
    expect(isGeneratedZero("0/A", {}, gen)).toBe(false);
    expect(isGeneratedZero("0/B", { "0/B": "b" }, gen)).toBe(false);
  });
});

describe("init0Announcements", () => {
  it("returns the engine's [init0] lines verbatim, in order", () => {
    const log = ["noise", "[stderr] [init0] note", "  [init0] wrote     0/A  (internal estimate)",
                 "", "[init0] 0/ materialised: 2 stream(s)"].join("\n");
    expect(init0Announcements(log)).toEqual([
      "[init0] note", "  [init0] wrote     0/A  (internal estimate)", "[init0] 0/ materialised: 2 stream(s)"]);
  });
});

describe("probablyMissingZero", () => {
  it("lists named edges with no 0/ file; the authored inlet is present", () => {
    expect(probablyMissingZero(base())).toEqual(["A", "B"]);
    const c = base();
    c.rawFiles!["0/S/A"] = "x";                // sector-owned file counts (unique match)
    expect(probablyMissingZero(c)).toEqual(["B"]);
  });
});

describe("the wiring (source arms)", () => {
  it("the detector's words are still the engine's", () => {
    const fl = read("src/unitOperations/flowsheet/Flowsheet.cpp");
    //  (the literal is split across two C++ string pieces after "BEFORE the ")
    expect(fl).toContain(`"Flowsheet: ${COMPLETENESS_MARK} BEFORE the "`);
    expect(fl).toContain(`"  MISSING  0/" + m + "  (graph stream, no state file)\\n"`);
  });
  it("the engine prints the [init0] lines the dialog shows", () => {
    expect(read("src/unitOperations/flowsheet/Flowsheet.cpp")).toContain('"  [init0] wrote     "');
  });
  it("choupoSolve's wasm entry and link flags export run_case_init0", () => {
    const e = read("src/applications/choupoSolve/wasmEntry.cpp");
    expect(e).toMatch(/int run_case_init0\(const char\* caseDir\)/);
    expect(e).toContain('"-init0"');
    expect(read("make/wasm.mk")).toContain("'_run_case_init0'");
  });
  it("the worker runs it and returns only files the run was not handed", () => {
    const w = read("gui/public/workers/solverWorker.js");
    expect(w).toContain('"run_case_init0"');
    expect(w).toContain('type: "init0Files"');
    expect(w).toContain("hasOwnProperty.call(msg.files, rel)");
  });
  it("the three doors are wired to the one dialog", () => {
    expect(read("gui/src/ui/MenuBar.tsx")).toContain("Complete 0/ (materialise missing streams)");
    expect(read("gui/src/ui/MenuBar.tsx")).toContain('"choupo:complete-zero"');
    expect(read("gui/src/ui/TopBar.tsx")).toContain("parseIncomplete0(result.log)");
    expect(read("gui/src/ui/TopBar.tsx")).toContain("<CompleteZeroDialog />");
    expect(read("gui/src/ui/ClipboardBridge.tsx")).toContain("probablyMissingZero(next)");
  });
});
