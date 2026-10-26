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

/*  DEV.md 4c C172 slice 1 (docs/design/one-app-two-homes.md, items 5 and 6):
 *  the content the engine already publishes, made visible, and the one Run.
 *  Pure functions only; the screens are walked by the acceptance script. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { describe, it, expect } from "vitest";

import type { OperationResult } from "../src/adapters/SolverAdapter.js";
import type { CaseFiles } from "../src/case/types.js";
import type { JsonDict } from "../src/dict/index.js";
import { fitEvidence, fittedParameters, readable, symbolOfTitle } from "../src/case/fitEvidence.js";
import { heldOutStatistic, verdictRows } from "../src/case/reviewScreen.js";
import { declaredProposals, editsBesideRunWrites } from "../src/case/caseWrites.js";
import { buildCaseZip } from "../src/case/saveCase.js";
import { runControl } from "../src/case/runControl.js";

const memOp: JsonDict = {
  name: "fit_NF270", type: "fitParameters",
  parameters: [
    { path: "poreModel.poreRadius", initial: 6e-10 },
    { path: "poreModel.chargeDensity", initial: -20 },
  ],
  evidence: [
    { dataset: "constant/experimental/a.dat", role: "fit" },
    { dataset: "constant/experimental/b.dat", role: "validation" },
  ],
  residual: { kind: "membrane", membrane: "NF270_dspmde" },
  output: { record: "constant/assets/NF270_FdL2021.dat" },
};
//  The numbers membrane24's golden pins (expected.props), with the units the
//  engine publishes for them (FitParameters::diagnosticUnit).
const memResult: OperationResult = {
  name: "fit_NF270", type: "fitParameters",
  diagnostics: { "fit.0.value": 6.7476e-10, "fit.0.ci95": 3.40163093415e-11,
    "fit.1.value": -10.525, "fit.1.ci95": 4.09740785513,
    heldOut_AAD_pct: 0.925797692862, inSample_AAD_pct: 2.66344502745, identifiable: 1 },
  units: { "fit.0.value": "m", "fit.1.value": "mol/m3", heldOut_AAD_pct: "points", inSample_AAD_pct: "points" },
  curation: { verdict: "validated", acceptanceMaxAADPct: "10" },
};

describe("a fit, as a reader judges it (case/fitEvidence.ts)", () => {
  it("marks each dataset FIT or HELD OUT by its declared role", () => {
    expect(fitEvidence(memOp)).toEqual([
      { dataset: "constant/experimental/a.dat", role: "fit" },
      { dataset: "constant/experimental/b.dat", role: "heldOut" },
    ]);
    //  a legacy single dataset: every point fitted
    expect(fitEvidence({ name: "f", residual: { dataset: "x.dat" } })).toEqual([{ dataset: "x.dat", role: "fit" }]);
  });

  it("draws a fitted parameter as a SYMBOL with the engine's unit: r_p = 0.6748 nm", () => {
    const ps = fittedParameters(memOp, memResult);
    expect(ps.map((p) => p.symbol)).toEqual(["r_p", "X_d"]);
    expect(ps[0]!.unit).toBe("m");
    const r = readable(ps[0]!.value, ps[0]!.unit, ps[0]!.ci95);
    expect(r).toEqual({ value: "0.6748", ci: "0.03402", unit: "nm" });
    expect(readable(ps[1]!.value, ps[1]!.unit).unit).toBe("mol/m3");
  });

  it("an NRTL pair's parameter keeps its path's own name, scoped by its pair, and no invented unit", () => {
    const op: JsonDict = { name: "n", type: "fitParameters", parameters: [
      { path: "equilibrium.liquid.activityModel.binaryParameters.ethanol-water.a_ij" }] };
    const r: OperationResult = { name: "n", type: "fitParameters", diagnostics: { "fit.0.value": -0.8 } };
    expect(fittedParameters(op, r)).toEqual([expect.objectContaining({
      symbol: "a_ij", qualifier: "ethanol-water", unit: "" })]);
  });

  it("reads a symbol out of a grammar title only when the last word is one", () => {
    expect(symbolOfTitle("Pore radius r_p")).toBe("r_p");
    expect(symbolOfTitle("A_k / dx")).toBe("A_k / dx");
  });
});

describe("the held-out statistic: two keys, two statistics, ONE reader", () => {
  it("a membrane fit's is in rejection POINTS, as the engine publishes", () => {
    expect(heldOutStatistic(memResult)).toEqual({ key: "heldOut_AAD_pct", value: 0.925797692862, unit: "points", published: true });
  });

  it("a bubble-point fit's is a relative %", () => {
    const r: OperationResult = { name: "b", type: "fitParameters",
      diagnostics: { aad_heldout_pct: 0.0737 }, units: { aad_heldout_pct: "%" } };
    expect(heldOutStatistic(r)).toEqual({ key: "aad_heldout_pct", value: 0.0737, unit: "%", published: true });
  });

  it("the verdict strip carries the held-out statistic AND the identifiability beside the verdict", () => {
    const rows = verdictRows([memOp], [memResult], undefined, "done", null);
    expect(rows[0]!.heldOut?.unit).toBe("points");
    expect(rows[0]!.identifiable).toBe(true);
    expect(rows[0]!.verdict).toBe("validated");
  });

  it("the engine publishes each statistic's unit (no reader infers it from a key)", () => {
    //  ONE home since C172's band-unit slice: the statistic's unit is the
    //  HeldOutStatistic its band is held to (EvidencePartition.cpp), and the
    //  membrane fit's is computed from what its terms are (points / %).
    const src = readFileSync(resolve(__dirname, "../../src/propertyOps/FitParameters.cpp"), "utf8");
    const ep = readFileSync(resolve(__dirname, "../../src/propertyOps/EvidencePartition.cpp"), "utf8");
    expect(ep).toMatch(/return \{ "aad_heldout_pct", "%", "percent",/);
    expect(src).toMatch(/return HeldOutStatistic::relativeAAD\(\)\.unit;/);
    expect(src).toMatch(/key == "heldOut_AAD_pct"\)\s+return memHeldOutUnit_;/);
    expect(src).toMatch(/key == "inSample_AAD_pct"\) return memInSampleUnit_;/);
  });
});

describe("a file the run wrote is the run's, not the reader's edit", () => {
  const propsDict = memOp;
  const base: CaseFiles = { controlDict: {}, flowsheet: null, thermoPackage: null,
    propsDict: { operations: [propsDict] } as JsonDict,
    rawFiles: { "system/propsDict": "x", "constant/assets/NF270_FdL2021.dat": "old" } } as unknown as CaseFiles;

  it("a record the run updated is 'updated by run', and NOT an edit", () => {
    const after = { ...base, rawFiles: { ...base.rawFiles, "constant/assets/NF270_FdL2021.dat": "new" },
      extraFiles: { "constant/assets/NF270_FdL2021.dat": "new" } } as CaseFiles;
    expect(editsBesideRunWrites(after, base)).toEqual({ userEdited: false, runUpdated: ["constant/assets/NF270_FdL2021.dat"] });
  });

  it("an edit beside it is still the reader's", () => {
    const after = { ...base, rawFiles: { ...base.rawFiles, "system/propsDict": "y" } } as CaseFiles;
    expect(editsBesideRunWrites(after, base)).toEqual({ userEdited: true, runUpdated: [] });
  });
});

describe("the promotable record a fit writes: read back, and carried by the download", () => {
  it("a fit's case-relative proposal is declared for read-back", () => {
    const pd = { operations: [{ name: "n", type: "fitParameters", output: { proposal: "ethanol-water.proposal.dat" } }] } as JsonDict;
    expect(declaredProposals(pd).map((w) => w.path)).toEqual(["ethanol-water.proposal.dat"]);
  });

  it("the downloaded case carries it beside the case's own files", () => {
    const files = { rawFiles: { "system/controlDict": "c" } } as unknown as CaseFiles;
    const z = buildCaseZip(files, "props/curation/curate02", { "ethanol-water.proposal.dat": "pair" })!;
    const un = unzipSync(z.bytes);
    expect(strFromU8(un["props_curation_curate02/ethanol-water.proposal.dat"]!)).toBe("pair");
    //  a path escaping the case is never written
    const z2 = buildCaseZip(files, "c", { "../x.dat": "no" })!;
    expect(Object.keys(unzipSync(z2.bytes)).some((k) => k.includes("x.dat"))).toBe(false);
  });
});

describe("ONE Run, saying what it runs", () => {
  it("names the case's home and the binary", () => {
    const wf = runControl({ phase: "idle", haveResult: false, stale: false, pendingEdits: 0,
      subject: "workflow", binary: "choupoProps" });
    expect(wf.label).toBe("Run workflow");
    expect(wf.title).toContain("choupoProps");
    expect(runControl({ phase: "idle", haveResult: false, stale: false, pendingEdits: 0 }).label).toBe("Run flowsheet");
  });

  it("no screen keeps a Run of its own: the canvas and the Workflow dispatch none", () => {
    const strip = (f: string) => readFileSync(resolve(__dirname, "../src/ui", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(strip("FlowCanvas.tsx")).not.toContain('new CustomEvent("choupo:run")');
    expect(strip("PropsView.tsx")).not.toContain('new CustomEvent("choupo:run")');
    expect(strip("CaseIntro.tsx")).not.toContain('new CustomEvent("choupo:run")');
    expect(strip("RunButton.tsx")).toContain('"choupo:run"');
  });
});
