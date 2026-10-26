/*---------------------------------------------------------------------------*\
  resultsFirst -- DEV.md 4c C168 slice 1, "results first, nothing invented".

  Four rules, each pinned without a DOM:
    1. a props case's map folds after a SUCCESSFUL run, per run, and the
       reader's stored fold decides alone before any run (ui/propsSplit.ts);
    2. an operation that feeds no figure and declares no point table is
       answered by its numbers inline, each with the unit the ENGINE
       published -- "[-]" for a pure number, "unit not published" for none,
       never a blank that reads as dimensionless (case/reviewScreen.ts,
       drawn by ui/PropsDetails.tsx);
    3. the flowsheet's run summary is READ off the result, never computed:
       an absent block stays absent (case/runSummary.ts);
    4. before a run, a phase is drawn only where the 0/ file declares one --
       the `phase` word read as the engine reads it, or a vaporFraction
       (case/toGraph.ts streamStateSpec).
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import type { OperationResult, RunResult, StreamResult } from "../src/adapters/SolverAdapter.js";
import { parse, toJson } from "../src/dict/index.js";
import { derivePropsMap } from "../src/case/propsMap.js";
import { numbersOnlyOps, unitCell } from "../src/case/reviewScreen.js";
import { runSummary, runSummarySentence } from "../src/case/runSummary.js";
import { streamStateSpec } from "../src/case/toGraph.js";
import { mapFolded } from "../src/ui/propsSplit.js";
import { REPO } from "./witnessOutputs.js";

describe("1. the map folds after a successful run, for that run only", () => {
  it("before a run the stored preference decides alone", () => {
    expect(mapFolded({ ran: false, openedAfterRun: false, stored: false })).toBe(false);
    expect(mapFolded({ ran: false, openedAfterRun: false, stored: true })).toBe(true);
  });
  it("after a run the map is folded, whatever is stored, until the reader opens it", () => {
    expect(mapFolded({ ran: true, openedAfterRun: false, stored: false })).toBe(true);
    expect(mapFolded({ ran: true, openedAfterRun: false, stored: true })).toBe(true);
    expect(mapFolded({ ran: true, openedAfterRun: true, stored: true })).toBe(false);
  });
});

/** pcsaft01's own files, as the case loader hands them. */
function pcsaftMap() {
  const root = join(REPO, "tutorials/props/molecular/pcsaft01_pure_nhexane");
  const raw: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else raw[relative(root, p)] = readFileSync(p, "utf-8");
    }
  };
  walk(join(root, "system"));
  walk(join(root, "constant"));
  const propsDict = toJson(parse(raw["system/propsDict"]!));
  const thermo = toJson(parse(raw["constant/thermoPhysPropDict"]!));
  return derivePropsMap({ propsDict, thermo, rawFiles: raw });
}

describe("2. an operation answered only by its numbers is drawn inline, with units", () => {
  //  The shape the engine publishes for pcsaft01 (choupoProps, C168): the
  //  numbers, the declared properties as the headline, a unit for each.
  const pcsaft: OperationResult = {
    name: "liquid_298K_1bar", type: "propertyPoint",
    diagnostics: { Z: 0.942529553543, v_molar_liq: 0.000132650664833, T: 298.15 },
    headline: ["Z", "molarVolume"],
    units: { Z: "-", v_molar_liq: "m3/mol", T: "K" },
  };
  it("pcsaft01's propertyPoint feeds no figure, so its numbers are the Overview's results", () => {
    expect(numbersOnlyOps(pcsaftMap(), [pcsaft]).map((r) => r.name)).toEqual(["liquid_298K_1bar"]);
  });
  it("an op that published no number, or whose type tabulates its numbers, is not listed", () => {
    const map = pcsaftMap();
    expect(numbersOnlyOps(map, [{ ...pcsaft, diagnostics: {} }])).toEqual([]);
    expect(numbersOnlyOps(map, [{ ...pcsaft, type: "poreTransport" }])).toEqual([]);
  });
  it("a unit is the engine's: [-] for a pure number, said missing when none is published", () => {
    expect(unitCell(pcsaft, "v_molar_liq")).toEqual({ text: "m3/mol", published: true });
    expect(unitCell(pcsaft, "Z")).toEqual({ text: "[-]", published: true });
    expect(unitCell({ ...pcsaft, units: undefined }, "Z")).toEqual({ text: "unit not published", published: false });
  });
});

describe("3. the run summary is read off the result, never computed", () => {
  const stream = (name: string, role: StreamResult["role"], extra: Partial<StreamResult> = {}): StreamResult =>
    ({ name, role, F: 1, T: 300, P: 1e5, composition: {}, ...extra }) as StreamResult;
  const r: RunResult = {
    status: "done", log: "", convergence: [], converged: true,
    streams: [stream("makeup", "feed"), stream("ammonia", "product"),
              stream("cwReturn", "product", { utilityCircuit: "cw" } as Partial<StreamResult>)],
    recycleLoops: [{ tear: "recycle", units: [], streams: [] }, { tear: "hotEffluent", units: [], streams: [] }],
    globalMassBoundary: { declared: true, n_circuits: 1, total_in_kg_per_h: 10, total_out_kg_per_h: 10,
      total_closure_pct: 99.99998, process_in_kg_per_h: 1, process_out_kg_per_h: 1,
      process_closure_pct: 99.9975456765, utility_excluded_kg_per_h: 9, utility_fraction_pct: 99.2 },
    globalEnergyBoundary: { H_feeds_kW: 0, Q_boundary_kW: 0, H_products_kW: 0, residual_kW: -1.376,
      residual_pct: -0.0021, residual_pct_available: true } as RunResult["globalEnergyBoundary"],
    advisories: [{ category: "bound", severity: "info", locus: "x", message: "m" }],
  };
  it("takes each number from its block, the process scope where circuits are declared", () => {
    const s = runSummary(r);
    expect(s.converged).toBe(true);
    expect(s.recycleLoops).toBe(2);
    expect(s.mass).toEqual({ pct: 99.9975456765, scope: "process", utilityExcludedPct: 99.2 });
    expect(s.energy).toEqual({ residualKW: -1.376, pct: -0.0021 });
    expect(s.advisories).toBe(1);
    expect(s.products.map((p) => p.name)).toEqual(["ammonia"]);   // the utility return is set aside
  });
  it("an absent block stays absent, and a percentage with no scale is none", () => {
    const bare: RunResult = { status: "done", log: "", convergence: [], streams: [] };
    const s = runSummary(bare);
    expect(s.converged).toBeNull();
    expect(s.mass).toBeNull();
    expect(s.energy).toBeNull();
    const noScale = runSummary({ ...r, globalEnergyBoundary: { ...r.globalEnergyBoundary!,
      residual_pct: null, residual_pct_available: false } });
    expect(noScale.energy).toEqual({ residualKW: -1.376, pct: null });
  });
  it("the status sentence says which state the run is in", () => {
    expect(runSummarySentence(null, "idle")).toBe("Not run yet.");
    expect(runSummarySentence(runSummary(r), "done")).toMatch(/^Run complete: converged; 1 advisory\.$/);
    expect(runSummarySentence(null, "error")).toMatch(/^Run failed/);
  });
});

describe("4. before a run, a phase is drawn only where 0/ declares one", () => {
  const flows = "componentMolarFlows { H2 0.75 kmol/s; N2 0.25 kmol/s; }\nT 300 K;\nP 25 bar;\n";
  it("no declaration: no phase (the run resolves it)", () => {
    const s = streamStateSpec(flows)!;
    expect(s.phaseDeclared).toBeUndefined();
    expect(s.vf).toBeUndefined();
  });
  it("`phase gas;` is read as the engine reads it (StreamStateIO.cpp: vf = 1)", () => {
    for (const w of ["gas", "vapor", "vapour"])
      expect(streamStateSpec(flows + `phase ${w};\n`)).toMatchObject({ phaseDeclared: true, vf: 1 });
    expect(streamStateSpec(flows + "phase liquid;\n")).toMatchObject({ phaseDeclared: true, vf: 0 });
  });
  it("a declared vaporFraction is a declaration", () => {
    expect(streamStateSpec(flows + "vaporFraction 1;\n")).toMatchObject({ phaseDeclared: true, vf: 1 });
  });
});
