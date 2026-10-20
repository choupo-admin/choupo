/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * DEV.md 4c C115 -- the unit being solved pulses on a slow run.
 *
 * The banner lines below are copied VERBATIM from native choupoSolve runs of
 * corpus cases (2026-10-20): a flat recycle plant (hda), a sectored plant whose
 * sectors hold inline units (lithiumBrinePlant), the flagship (sectors holding
 * dignified unit FOLDERS, plus MAIN), and a single slow column
 * (column05_reactive_methylacetate, 174 s natively).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { parse, toJson, type JsonDict } from "../src/dict/index.js";
import {
  endsUnitPhase, parseUnitBanner, parseUnitBanners,
} from "../src/case/unitBanner.js";
import {
  IDLE_RUN_PROGRESS, progressOnChunk, solvingHaloView, solvingSeconds,
  solvingTargetOf, solvingTargets, watchSolving,
} from "../src/case/runProgress.js";

const REPO = resolve(__dirname, "../..");

// ---- verbatim corpus log lines -------------------------------------------
const RULE = ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>";
const HDA_MIXER = ">>>  Unit [0]:  Mixer   (type = mixer)";
const HDA_COLUMN = ">>>  Unit [4]:  Column   (type = shortcutColumn)";
const LI_SETTLER = ">>>  Unit [2]:  EXTRACTION.settler01   (type = isothermalFlash)";
const CPT_EVAP1 = ">>>  Unit [1]:  CONCENTRATION.Evap1   (type = evaporator)";
const CPT_SPLIT = ">>>  Unit [0]:  MAIN.JuiceSplitter   (type = splitter)";
const COL05 = ">>>  Unit [0]:  rdColumn   (type = distillationColumn)";
const COL05_INPUTS = ">>>  Inputs: feed  acidFeed    →  distillate  bottoms  ";
const THERMO = ">>>  thermo: inherited (global package)";
const SUMMARY = "================  Flowsheet summary  ================";
const RECYCLE = "Recycle outer loop (Newton over 2 tear stream(s), 10 variables):";

describe("unitBanner -- the ONE reader of the engine's per-unit banner", () => {
  it("parses every corpus banner shape", () => {
    expect(parseUnitBanner(HDA_MIXER)).toEqual({ unitIndex: 0, qualifiedName: "Mixer", type: "mixer" });
    expect(parseUnitBanner(HDA_COLUMN)).toEqual({ unitIndex: 4, qualifiedName: "Column", type: "shortcutColumn" });
    expect(parseUnitBanner(LI_SETTLER)).toEqual(
      { unitIndex: 2, qualifiedName: "EXTRACTION.settler01", type: "isothermalFlash" });
    expect(parseUnitBanner(CPT_EVAP1)?.qualifiedName).toBe("CONCENTRATION.Evap1");
    expect(parseUnitBanner(CPT_SPLIT)?.qualifiedName).toBe("MAIN.JuiceSplitter");
    expect(parseUnitBanner(COL05)?.type).toBe("distillationColumn");
  });

  it("refuses the lines around a banner that are not one", () => {
    for (const l of [RULE, COL05_INPUTS, THERMO, SUMMARY, "", "[stderr] " + HDA_MIXER,
                     "    >>>  Unit [0]:  Mixer   (type = mixer)"])
      expect(parseUnitBanner(l)).toBeNull();
  });

  it("parseUnitBanners keeps log order and 1-based lines (the Log jump list)", () => {
    const log = ["head", RULE, CPT_SPLIT, THERMO, RULE, CPT_EVAP1, SUMMARY].join("\n");
    const b = parseUnitBanners(log);
    expect(b.map((x) => [x.qualifiedName, x.line])).toEqual(
      [["MAIN.JuiceSplitter", 3], ["CONCENTRATION.Evap1", 6]]);
    expect(parseUnitBanners("")).toEqual([]);
  });

  it("the unit-phase end lines are the summary and the recycle header", () => {
    expect(endsUnitPhase(SUMMARY)).toBe(true);
    expect(endsUnitPhase(RECYCLE)).toBe(true);
    expect(endsUnitPhase("----- Final pass with full unit logging -----")).toBe(false);
    expect(endsUnitPhase(HDA_MIXER)).toBe(false);
  });
});

describe("progressOnChunk -- the run-progress reducer", () => {
  it("a banner makes its unit current at the chunk's time", () => {
    const p = progressOnChunk(IDLE_RUN_PROGRESS, RULE + "\n" + COL05 + "\n", 1000);
    expect(p.unit).toBe("rdColumn");
    expect(p.type).toBe("distillationColumn");
    expect(p.since).toBe(1000);
    expect(p.visit).toBe(1);
  });

  it("the next banner MOVES it; lines in between change nothing", () => {
    let p = progressOnChunk(IDLE_RUN_PROGRESS, HDA_MIXER + "\n", 0);
    const same = progressOnChunk(p, THERMO + "\n", 500);
    expect(same).toBe(p);                         // same object: no re-render
    p = progressOnChunk(p, HDA_COLUMN + "\n", 700);
    expect([p.unit, p.since, p.visit]).toEqual(["Column", 700, 2]);
  });

  it("a recycle revisiting the SAME unit restarts its clock (a new visit)", () => {
    let p = progressOnChunk(IDLE_RUN_PROGRESS, HDA_MIXER + "\n", 0);
    p = progressOnChunk(p, HDA_MIXER + "\n", 4000);
    expect([p.unit, p.since, p.visit]).toEqual(["Mixer", 4000, 2]);
  });

  it("the summary and the quiet recycle header leave no unit in progress", () => {
    let p = progressOnChunk(IDLE_RUN_PROGRESS, HDA_COLUMN + "\n", 0);
    p = progressOnChunk(p, SUMMARY + "\n", 10);
    expect([p.unit, p.since]).toEqual([null, null]);
    p = progressOnChunk(p, CPT_EVAP1 + "\n", 20);
    p = progressOnChunk(p, RECYCLE + "\n", 30);
    expect(p.unit).toBeNull();
  });

  it("a banner split across chunks is read once its newline arrives", () => {
    let p = progressOnChunk(IDLE_RUN_PROGRESS, ">>>  Unit [1]:  CONCENT", 0);
    expect(p.unit).toBeNull();
    p = progressOnChunk(p, "RATION.Evap1   (type = evaporator)\n", 50);
    expect([p.unit, p.since]).toEqual(["CONCENTRATION.Evap1", 50]);
    expect(p.carry).toBe("");
  });

  it("a log with no banners (batch / ctrl / props) never names a unit", () => {
    const batchish = "Time-integrated flowsheet\n[campaign] mass balance ...\n t = 10 s\n";
    expect(progressOnChunk(IDLE_RUN_PROGRESS, batchish, 0)).toEqual(IDLE_RUN_PROGRESS);
  });
});

describe("the store: started, fed, ended, failed, cancelled, reset", () => {
  //  The store's import graph reads the whole tutorial corpus at module load
  //  (see the note in focusBoot.test.ts).  None of it is under test here --
  //  only the run actions -- so the two corpus modules are stubbed with the
  //  exports the store reaches, and the store itself is the real one.
  it("clears on start / finish / fail / reset and follows appendLog", async () => {
    vi.resetModules();
    vi.doMock("../src/cases/tutorials.js", () => ({
      canonicalCaseName: (n: string) => n,
      tutorialByName: () => undefined,
      filesToCaseFiles: () => { throw new Error("not used"); },
    }));
    vi.doMock("../src/cases/workspace.js", () => ({
      readCaseAt: () => { throw new Error("not used"); },
    }));
    const { useStore } = await import("../src/state/store.js");
    const st = () => useStore.getState();
    st().startRun();
    expect(st().runProgress.unit).toBeNull();
    st().appendLog(COL05 + "\n");
    expect(st().runProgress.unit).toBe("rdColumn");
    st().failRun();
    expect(st().runProgress).toEqual(IDLE_RUN_PROGRESS);
    st().startRun();
    st().appendLog(HDA_MIXER + "\n");
    // a cancel settles the adapter as an "error" RESULT, through finishRun
    st().finishRun({ status: "error", log: "", streams: [], convergence: [] });
    expect(st().runProgress.unit).toBeNull();
    st().startRun();
    st().appendLog(HDA_MIXER + "\n");
    st().resetRun();
    expect(st().runProgress.unit).toBeNull();
  });
});

describe("the 1 s threshold", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  it("solvingSeconds is null under one second, whole seconds after", () => {
    expect(solvingSeconds(null, 5000)).toBeNull();
    expect(solvingSeconds(0, 999)).toBeNull();
    expect(solvingSeconds(0, 1000)).toBe(1);
    expect(solvingSeconds(0, 3750)).toBe(3);
  });

  it("watchSolving ticks nothing before 1 s, then once a second", () => {
    const ticks: number[] = [];
    const stop = watchSolving(0, (now) => ticks.push(now));
    vi.advanceTimersByTime(999);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([1000]);
    vi.advanceTimersByTime(2000);
    expect(ticks).toEqual([1000, 2000, 3000]);
    stop();
    vi.advanceTimersByTime(5000);
    expect(ticks).toHaveLength(3);
  });

  it("a unit that finishes under a second schedules nothing visible", () => {
    const ticks: number[] = [];
    const stop = watchSolving(0, (now) => ticks.push(now));
    vi.advanceTimersByTime(400);
    stop();                                 // the next banner arrived
    vi.advanceTimersByTime(5000);
    expect(ticks).toEqual([]);
    expect(watchSolving(null, () => ticks.push(1))).toBeTypeOf("function");
    vi.advanceTimersByTime(5000);
    expect(ticks).toEqual([]);
  });
});

describe("the halo view: motion and label", () => {
  const own = { node: "rdColumn", inSector: false };
  const box = { node: "CONCENTRATION", inSector: true };
  it("pulses, or stands still under prefers-reduced-motion", () => {
    expect(solvingHaloView(3, "rdColumn", own, false)).toEqual(
      { motion: "pulse", label: "solving · 3 s" });
    expect(solvingHaloView(3, "rdColumn", own, true)?.motion).toBe("static");
  });
  it("a folded sector names the unit inside it as printed", () => {
    expect(solvingHaloView(2, "CONCENTRATION.Evap1", box, false)?.label)
      .toBe("solving CONCENTRATION.Evap1 · 2 s");
  });
  it("draws nothing under the threshold or with no unit", () => {
    expect(solvingHaloView(null, "rdColumn", own, false)).toBeNull();
    expect(solvingHaloView(4, null, null, false)).toBeNull();
  });
});

// ---- the canvas target, on the real sectored cases ------------------------
function caseOnDisk(rel: string): { flowsheet: JsonDict; rawFiles: Record<string, string> } {
  const root = join(REPO, "tutorials", rel);
  const rawFiles: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/flowsheetDict$/.test(e)) rawFiles[relative(root, p)] = readFileSync(p, "utf8");
    }
  };
  walk(root);
  const flowsheet = toJson(parse(rawFiles["system/flowsheetDict"]!, { sourceName: "flowsheetDict" })) as JsonDict;
  return { flowsheet, rawFiles };
}

describe("solvingTargets -- banner name -> the canvas node it is drawn in", () => {
  it("flagship: unit FOLDERS inside sectors pulse their folded sector box", () => {
    const { flowsheet, rawFiles } = caseOnDisk("plant/ChemicalPlantTutorial");
    const t = solvingTargets(flowsheet, rawFiles);
    // every banner the native run printed, mapped by the declaration
    for (const [q, sector] of [
      ["MAIN.JuiceSplitter", "MAIN"], ["CONCENTRATION.Evap1", "CONCENTRATION"],
      ["CONCENTRATION.Evap2", "CONCENTRATION"], ["CONCENTRATION.Cryst", "CONCENTRATION"],
      ["DRYING.SD", "DRYING"], ["DRYING.BD", "DRYING"], ["DRYING.CY", "DRYING"],
      ["FERMENTATION.Mixer", "FERMENTATION"], ["FERMENTATION.Fermentor", "FERMENTATION"],
      ["FERMENTATION.Flash", "FERMENTATION"], ["FERMENTATION.Splitter", "FERMENTATION"],
    ] as const)
      expect(solvingTargetOf(q, t)).toEqual({ node: sector, inSector: true });
    expect(solvingTargets(flowsheet, rawFiles)).toBe(t);       // memoised
  });

  it("lithium plant: INLINE units inside sectors pulse their sector box", () => {
    const { flowsheet, rawFiles } = caseOnDisk("plant/lithiumBrinePlant");
    const t = solvingTargets(flowsheet, rawFiles);
    expect(solvingTargetOf("EXTRACTION.settler01", t)).toEqual({ node: "EXTRACTION", inSector: true });
    expect(solvingTargetOf("FINISHING.recoverer", t)).toEqual({ node: "FINISHING", inSector: true });
  });

  it("a flat case is drawn unit by unit: the banner name IS the node", () => {
    const { flowsheet, rawFiles } = caseOnDisk("plant/hda");
    const t = solvingTargets(flowsheet, rawFiles);
    expect(t.size).toBe(0);
    expect(solvingTargetOf("Column", t)).toEqual({ node: "Column", inSector: false });
  });

  it("never splits a name: an undeclared dotted name maps to no sector", () => {
    const { flowsheet, rawFiles } = caseOnDisk("plant/ChemicalPlantTutorial");
    const t = solvingTargets(flowsheet, rawFiles);
    expect(solvingTargetOf("DRYING.NotAUnit", t)).toEqual({ node: "DRYING.NotAUnit", inSector: false });
  });
});
