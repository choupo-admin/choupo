// The single-stream pop-out (the Detail view) must expose the SAME phase
// decomposition the Streams workspace and the property panel already draw.
//
// The defect this test pins (found 2026-08-08): the pop-out rendered
// Conditions + overall Composition + aqueous Speciation, and NEVER the
// phases{} decomposition -- so on flash17's liquid stream a student saw the
// ions and the pH but not that 96 % of the benzene sits in an organic
// phase.  The stream-table column even points here ("the per-species
// breakdown is in the Detail view").

import { beforeEach, describe, expect, it, vi } from "vitest";

const opened: string[] = [];

vi.mock("../src/ui/filePopOut.js", () => ({
  openHtmlInNewTab: (html: string) => { opened.push(html); },
  popoutColors: () => ({
    bg: "#111", panel: "#222", text: "#eee", dim: "#999", accent: "#0cf",
    border: "#333", cell: "#2a2a2a", blue: "#48f", orange: "#f80",
    liquidTint: "#123", vapourTint: "#321",
  }),
}));

import { popOutSingleStream } from "../src/ui/streamPopOut.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

const twoLiquids: StreamResult = {
  name: "liquid", role: "product",
  F: 0.0165, T: 313.15, P: 35464,
  composition: { water: 0.914, benzene: 0.0177, ethanol: 0.067, aceticAcid: 0.0016 },
  organicLiquid: { benzene: 2.66e-4, ethanol: 1.08e-5 },
  speciation: {
    network: "aceticAcid", basis: "stoichiometric", pH: 2.891,
    flows: { Acetate: 3.65e-7, H: 3.65e-7, HAc: 2.59e-5 },
  },
};

describe("popOutSingleStream — the phases section", () => {
  beforeEach(() => { opened.length = 0; });

  it("renders aqueous AND organic beside the speciation on a two-liquid stream", () => {
    popOutSingleStream({ name: "liquid", prefs: DEFAULT_PREFS, runStream: twoLiquids });
    expect(opened).toHaveLength(1);
    const html = opened[0]!;
    expect(html).toContain("Phases (molar flow)");
    expect(html).toContain("aqueous");
    expect(html).toContain("organic");
    //  The speciation stays, and its blurb now names WHICH material it
    //  decomposes -- the aqueous phase, not "the composition above" that a
    //  phases section has just been inserted after.
    expect(html).toContain("Speciation");
    expect(html).toContain("AQUEOUS phase above");
  });

  it("draws NO phases section for a single-fluid-phase stream", () => {
    const { organicLiquid: _o, speciation: _s, ...rest } = twoLiquids;
    popOutSingleStream({ name: "liquid", prefs: DEFAULT_PREFS, runStream: rest });
    expect(opened[0]!).not.toContain("Phases (molar flow)");
  });

  it("keeps a solid with no molar mass VISIBLE, in kg/s, with the reason stated", () => {
    //  Never the wrong unit; never a silent disappearance (Vítor,
    //  2026-08-08).  No molarMass is passed, so the conversion must fail --
    //  and the phase must survive it.
    const { organicLiquid: _o, speciation: _s, ...rest } = twoLiquids;
    const s = { ...rest, solids: { CaCO3: 2.0 } };
    popOutSingleStream({ name: "liquid", prefs: DEFAULT_PREFS, runStream: s });
    const html = opened[0]!;
    expect(html).toContain("solid");
    expect(html).toContain("kg/s");
    expect(html).toContain("molar flow unavailable");
    expect(html).toContain("CaCO3");
  });
});
