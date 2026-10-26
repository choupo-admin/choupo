/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  THE TWO GUI DEFECTS OF THE C157 ROUND TRIP (DEV.md 4c C157).

  (1) A record a props run writes INTO the case is carried back into it:
      the paths come off the op schemas (`x-choupo.writes`, kind record),
      the adapter tells the worker exactly those, and the carried record
      reaches the next run's files and the next download -- on
      membrane24_fit_then_simulate, through the real zip round trip.
  (2) The run control follows the MODE on screen: Properties & data runs
      choupoProps, Process the flowsheet binary, by bin/runCase's rule.
\*---------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { REPO } from "./witnessOutputs.js";
import { parse, toJson } from "../src/dict/index.js";
import {
  carryCaseWrites, caseWriteLogLines, declaredCaseWrites, isCasePath,
} from "../src/case/caseWrites.js";
import { binaryForMode } from "../src/case/caseModes.js";
import { buildCaseZip } from "../src/case/saveCase.js";
import { openedCaseFromZip } from "../src/cases/loadCase.js";
import { serialiseCase, WasmAdapter } from "../src/adapters/WasmAdapter.js";
import type { RunResult } from "../src/adapters/SolverAdapter.js";

const M24 = "tutorials/steady/membranes/membrane24_fit_then_simulate";
const RECORD = "constant/assets/NF270_FdL2021.dat";

/** membrane24 as a downloaded zip holds it: every authored file. */
function m24Files(): Record<string, string> {
  const root = join(REPO, M24);
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (!/^(log\.|expected)/.test(n)) out[relative(root, p)] = readFileSync(p, "utf8");
    }
  };
  walk(root);
  return out;
}
function m24Opened() {
  const files: Record<string, Uint8Array> = {};
  for (const [p, t] of Object.entries(m24Files())) files[`membrane24_fit_then_simulate/${p}`] = strToU8(t);
  return openedCaseFromZip(zipSync(files), "membrane24_fit_then_simulate.zip");
}

describe("(1) the files a props run writes into the case", () => {
  it("are read off the op schemas: membrane24's fit writes its record", () => {
    const opened = m24Opened();
    expect(declaredCaseWrites(opened.files.propsDict)).toEqual([
      { op: expect.any(String), key: "output.record", path: RECORD },
    ]);
  });

  it("a proposal is not a case write, and nothing outside the case is carried", () => {
    const pd = toJson(parse(`operations (
      { name est; type estimateComponent; component x; output { proposal auto; } }
      { name f1; type fitParameters; output { record "../escape.dat"; } }
      { name f2; type fitParameters; output { record "/abs/x.dat"; } }
      { name f3; type fitParameters; output { record "constant/assets/A.dat"; } }
    );`));
    expect(declaredCaseWrites(pd).map((w) => w.path)).toEqual(["constant/assets/A.dat"]);
    expect(isCasePath("constant/assets/A.dat")).toBe(true);
    for (const bad of ["", "/x", "a/../b", "./a", "a//b", "a\\b"]) expect(isCasePath(bad)).toBe(false);
  });

  it("the carried record reaches the next run's files and the next download", () => {
    const opened = m24Opened();
    const declared = declaredCaseWrites(opened.files.propsDict);
    const refit = opened.raw[RECORD]!.replace(/poreRadius\s+[^;]+;/, "poreRadius 7.0e-10;");
    expect(refit).not.toBe(opened.raw[RECORD]);
    const { files, notes } = carryCaseWrites(opened.files, declared,
      { [RECORD]: refit, "constant/assets/undeclared.dat": "x" });
    expect(notes.map((n) => n.change)).toEqual(["updated"]);
    expect(caseWriteLogLines(notes)[0]).toMatch(/NF270_FdL2021\.dat: written by operation .* UPDATED in the open case/);
    //  the next run: the worker's file map
    expect(serialiseCase(files)[RECORD]).toBe(refit);
    expect(serialiseCase(files)["constant/assets/undeclared.dat"]).toBeUndefined();
    //  the next download, opened back
    const zip = buildCaseZip(files, "membrane24_fit_then_simulate")!;
    const back = openedCaseFromZip(zip.bytes, zip.fileName);
    expect(back.raw[RECORD]).toBe(refit);
    //  the original case is untouched (the carry is a new CaseFiles)
    expect(opened.files.extraFiles?.[RECORD]).toBe(opened.raw[RECORD]);
  });

  it("a run that wrote nothing changes nothing; a new record is ADDED", () => {
    const opened = m24Opened();
    const declared = declaredCaseWrites(opened.files.propsDict);
    expect(carryCaseWrites(opened.files, declared, undefined).files).toBe(opened.files);
    const same = carryCaseWrites(opened.files, declared, { [RECORD]: opened.raw[RECORD]! });
    expect(same.files).toBe(opened.files);
    expect(same.notes[0]!.change).toBe("unchanged");
    const extra = { ...opened.files.extraFiles };
    const rawNo = { ...opened.files.rawFiles };
    delete extra[RECORD]; delete rawNo[RECORD];
    const fresh = carryCaseWrites({ ...opened.files, extraFiles: extra, rawFiles: rawNo }, declared,
      { [RECORD]: "name NF270_FdL2021;" });
    expect(fresh.notes[0]!.change).toBe("new");
    expect(fresh.files.rawFiles?.[RECORD]).toBe("name NF270_FdL2021;");
  });
});

describe("(1) the adapter tells the worker the declared paths, and returns what it read", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function fakeWorker(reply: (msg: Record<string, unknown>) => unknown[]) {
    const posted: Record<string, unknown>[] = [];
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      postMessage(m: Record<string, unknown>) {
        posted.push(m);
        queueMicrotask(() => { for (const d of reply(m)) this.onmessage?.({ data: d }); });
      }
      terminate() { /* nothing */ }
    }
    vi.stubGlobal("Worker", FakeWorker);
    return posted;
  }

  it("a props run asks for membrane24's record and carries the reply on the result", async () => {
    const posted = fakeWorker(() => [
      { type: "caseWrites", files: { [RECORD]: "name NF270_FdL2021; // refit" } },
      { type: "done", rc: 0 },
    ]);
    const opened = m24Opened();
    const r = await new WasmAdapter().run(opened.files, () => {}, undefined, "choupoProps");
    expect(posted[0]!["binary"]).toBe("choupoProps");
    expect(posted[0]!["caseWrites"]).toEqual([RECORD]);
    expect(r.caseWrites).toEqual({ [RECORD]: "name NF270_FdL2021; // refit" });
  });

  it("a Process run of the same case asks for nothing", async () => {
    const posted = fakeWorker(() => [{ type: "done", rc: 0 }]);
    const r = await new WasmAdapter().run(m24Opened().files, () => {}, undefined, "choupoSolve");
    expect(posted[0]!["caseWrites"]).toEqual([]);
    expect(r.caseWrites).toBeUndefined();
  });

  it("the worker reads exactly those paths back and sends only what the run changed", () => {
    const src = readFileSync(join(REPO, "gui/public/workers/solverWorker.js"), "utf8");
    expect(src).toMatch(/for \(const rel of msg\.caseWrites\)/);
    expect(src).toMatch(/if \(msg\.files\[rel\] !== body\) written\[rel\] = body;/);
    expect(src).toMatch(/type: "caseWrites", files: written/);
  });
});

describe("(2) the run control follows the mode on screen", () => {
  it("bin/runCase's rule: props -> choupoProps; process -> the application, choupoSolve for a props default", () => {
    expect(binaryForMode("props", "choupoSolve")).toBe("choupoProps");
    expect(binaryForMode("process", "choupoSolve")).toBe("choupoSolve");
    expect(binaryForMode("process", "choupoProps")).toBe("choupoSolve");
    expect(binaryForMode("process", "choupoSemiContinuous")).toBe("choupoSemiContinuous");
    expect(binaryForMode("process", undefined)).toBe("choupoSolve");
    const rc = readFileSync(join(REPO, "bin/runCase"), "utf8");
    expect(rc).toMatch(/WANT=choupoProps/);
    expect(rc).toMatch(/if \[ "\$APP" = choupoProps \]; then WANT=choupoSolve; else WANT="\$APP"; fi/);
  });

  it("the TopBar's run -- every door's run -- hands the adapter the mode's binary", () => {
    const tb = readFileSync(join(REPO, "gui/src/ui/TopBar.tsx"), "utf8");
    expect(tb).toMatch(/binaryForMode\(caseMode\.mode, caseFiles\.controlDict\["application"\]\)/);
    expect(tb).toMatch(/ctl\.signal,\s*binary,\s*\)/);
    expect(tb).toMatch(/carryRunWrites\(result\)/);
    //  ONE door since DEV.md 4c C172: the props screen has no run of its own
    //  (nor a local per-sector one); the toolbar's Run dispatches the shared
    //  event the TopBar orchestrates, and it follows the mode on screen.
    const pv = readFileSync(join(REPO, "gui/src/ui/PropsView.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(pv).not.toMatch(/runPropsLocal|new CustomEvent\("choupo:run"\)|adapter\.run\(/);
    const rb = readFileSync(join(REPO, "gui/src/ui/RunButton.tsx"), "utf8");
    expect(rb).toMatch(/new CustomEvent\(running \? "choupo:stop" : "choupo:run"\)/);
    expect(rb).toMatch(/binaryForMode\("process", application\)/);
  });
});

describe("the store carries the write and keeps the two modes' results apart", () => {
  it("carryRunWrites updates the open case and logs it; finishPropsRun leaves the Process result", async () => {
    const { useStore } = await import("../src/state/store.js");
    const opened = m24Opened();
    const st = useStore.getState();
    st.applyCaseFiles(opened.files);
    const processRun = { status: "done", log: "", streams: [], convergence: [] } as RunResult;
    st.finishRun(processRun);
    st.startRun();
    const refit = opened.raw[RECORD]!.replace(/poreRadius\s+[^;]+;/, "poreRadius 7.1e-10;");
    const propsRun: RunResult = { status: "done", log: "", streams: [], convergence: [],
                       caseWrites: { [RECORD]: refit } };
    const notes = useStore.getState().carryRunWrites(propsRun);
    useStore.getState().finishPropsRun(propsRun);
    const s = useStore.getState();
    expect(notes.map((n) => n.change)).toEqual(["updated"]);
    expect(s.caseFiles.extraFiles?.[RECORD]).toBe(refit);
    expect(s.caseFiles.rawFiles?.[RECORD]).toBe(refit);
    expect(s.runLog).toMatch(/\[case\] constant\/assets\/NF270_FdL2021\.dat: .* UPDATED in the open case/);
    expect(s.runResult).toBe(processRun);
    expect(s.propsRunResult).toBe(propsRun);
    expect(s.runStatus).toBe("done");
  });
});
