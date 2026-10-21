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
  The Explorer's phase-split lens (DEV.md 4c C118, stage 2): the case it
  builds and the reading of the engine's answer.

  WHAT IS HELD.  (1) The plan: ONE `phaseSplitScan` op, the composition sent
  AS TYPED (the engine normalises and says so), the held axis in `state` and
  the swept one only in `vary`, the synthesised package -- gammaPhi without a
  crystal, the C3 `phases ( )` declaration with one -- and the open case's
  `constant/` tree verbatim with NO structured thermoPhysPropDict over it.
  (2) The reading, against the REAL witness: `phaseSplit01_freeze_water_
  ethanol` is run by this checkout's engine (tests/witnessOutputs.ts), its
  stdout's result block goes through the adapter's own extraction, and every
  amount the lens would draw is held to the CSV cell of the SAME run -- so a
  shaping that dropped, renamed or zero-filled a phase is caught by the
  engine's own second channel, not by a transcription.  (3) The gap rule: a
  refused point is null in every series, an absent phase is 0.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { extractStructured, serialiseCase } from "../src/adapters/WasmAdapter.js";
import { parse, toJson } from "../src/dict/index.js";
import {
  EXPLORER_GUIDE_PHASE_SPLIT, PHASE_SPLIT_OUTPUT, announcements, caseRouteApplies, crystalDataOf,
  eventSentence, phaseAmountSeries, phaseCompositionSeries, phaseSplitPlan, phasesEverPresent,
  phSeries, refusedPoints, scanConsoleNotes, shapePhaseSplitScans, synthThermo,
  type PhaseSplitSpec,
} from "../src/case/phaseSplitScan.js";
import { witnessOutput } from "./witnessRead.js";

const WITNESS = "tutorials/props/thermo/phaseSplit01_freeze_water_ethanol";
const witnessFile = (rel: string) =>
  readFileSync(new URL(`../../${WITNESS}/${rel}`, import.meta.url), "utf-8");

const base: PhaseSplitSpec = {
  components: ["water", "ethanol"],
  amounts: { water: 9, ethanol: 1 },
  variable: "T", held: 101325, from: 273.15, to: 253.15, n: 21,
  phaseSet: "VL",
  thermo: { source: "synth", activityModel: "NRTL", solids: [] },
};

/** The one op of a plan, as the engine will read it (serialised and parsed
 *  back -- the dict round trip the worker performs). */
function opOf(spec: PhaseSplitSpec) {
  const files = phaseSplitPlan(spec).files!;
  const props = toJson(parse(serialiseCase(files)["system/propsDict"]!));
  return (props.operations as Record<string, unknown>[])[0]!;
}

describe("the plan: one phaseSplitScan op", () => {
  it("sends the feed as typed, the held axis in state, the swept one in vary", () => {
    const op = opOf(base) as Record<string, any>;
    expect(op.type).toBe("phaseSplitScan");
    expect(op.state.P).toBe(101325);
    expect(op.state.T).toBeUndefined();
    expect(op.state.composition).toEqual({ water: 9, ethanol: 1 });   // NOT normalised here
    expect(op.vary).toEqual({ variable: "T", from: 273.15, to: 253.15, n: 21 });
    expect(op.output.file).toBe(PHASE_SPLIT_OUTPUT);
    expect(op.phaseSet).toBe("VL");
    const opP = opOf({ ...base, variable: "P", held: 298.15, from: 1e5, to: 1e3 }) as Record<string, any>;
    expect(opP.state.T).toBe(298.15);
    expect(opP.state.P).toBeUndefined();
    expect(opP.vary.variable).toBe("P");
  });

  it("writes every component of the set, zeros included, and lets the engine refuse an empty feed", () => {
    const op = opOf({ ...base, amounts: {} }) as Record<string, any>;
    expect(op.state.composition).toEqual({ water: 0, ethanol: 0 });
  });

  it("asks nothing for an empty set, and says why", () => {
    const p = phaseSplitPlan({ ...base, components: [] });
    expect(p.files).toBeUndefined();
    expect(p.nothingToAsk).toMatch(/at least one component/);
  });

  it("without a crystal: one liquid under the chosen model and an ideal-gas vapour", () => {
    const t = synthThermo(["water", "ethanol"], "UNIFAC", []) as Record<string, any>;
    expect(t.equilibrium.formulation).toBe("gammaPhi");
    expect(t.equilibrium.liquid.activityModel).toEqual({ model: "UNIFAC" });
    expect(t.equilibrium.vapour).toEqual({ fugacityModel: "idealGas" });
    expect(t.equilibrium.phases).toBeUndefined();
  });

  it("a phase set that can split the liquid declares TWO liquids on one model", () => {
    //  Measured natively 2026-10-21: over ONE declared liquid the flash
    //  refuses every point by name ("LL flash needs >= 2 liquid phases").
    for (const ps of ["LL", "VLLE", "auto"] as const) {
      const t = synthThermo(["water", "nButanol"], "UNIFAC", [], ps) as Record<string, any>;
      expect(t.equilibrium.formulation).toBe("gammaGamma");
      expect(t.equilibrium.liquidPhases.map((p: Record<string, any>) => p.activityModel))
        .toEqual([{ model: "UNIFAC" }, { model: "UNIFAC" }]);
      expect(t.equilibrium.vapour).toEqual({ fugacityModel: "idealGas" });
    }
  });

  it("with a crystal: the witness's own C3 declaration, and no phase-set word", () => {
    //  Held to the stage-1 witness's thermoPhysPropDict, read from the tree:
    //  the shape the lens builds is the shape the engine was proven on.
    const witness = toJson(parse(witnessFile("constant/thermoPhysPropDict"))) as Record<string, any>;
    const t = synthThermo(["water", "ethanol"], "NRTL", ["water"]) as Record<string, any>;
    expect(t.equilibrium.formulation).toBe(witness.equilibrium.formulation);
    expect(t.equilibrium.liquid.activityModel).toEqual(witness.equilibrium.liquid.activityModel);
    const types = (ps: Record<string, any>[]) => ps.map((p) => [p.type, p.component ?? null, p.mode ?? null]);
    expect(types(t.equilibrium.phases)).toEqual(types(witness.equilibrium.phases));
    const op = opOf({ ...base, thermo: { source: "synth", activityModel: "NRTL", solids: ["water"] } }) as Record<string, any>;
    expect(op.phaseSet).toBeUndefined();
  });

  it("reads a crystal's data off the record, and names what a record lacks", () => {
    const w = crystalDataOf("water");
    expect(w.Hfus).toBe(6008);
    expect(w.tripleT).toBe(273.16);
    expect(w.missing).toEqual([]);
    const s = crystalDataOf("sucrose");
    expect(s.Hfus).toBeNull();
    expect(s.missing.join(" ")).toMatch(/enthalpy of fusion/);
  });

  it("the open case's route sends its constant/ verbatim and NO second thermoPhysPropDict", () => {
    const caseRaw = {
      "constant/thermoPhysPropDict": witnessFile("constant/thermoPhysPropDict"),
      "constant/components/water.dat": "name water;",
      "system/controlDict": "application choupoSolve;",
    };
    expect(caseRouteApplies(["water", "ethanol"], caseRaw)).toBe(true);
    expect(caseRouteApplies(["water", "benzene"], caseRaw)).toBe(false);
    const files = phaseSplitPlan({ ...base, thermo: { source: "case" }, caseRaw }).files!;
    expect(files.thermoPackage).toEqual({});
    expect(Object.keys(files.extraFiles!).sort())
      .toEqual(["constant/components/water.dat", "constant/thermoPhysPropDict"]);
    const ser = serialiseCase(files);
    expect(ser["constant/thermoPhysPropDict"]).toBe(caseRaw["constant/thermoPhysPropDict"]);
    expect(ser["system/controlDict"]).toMatch(/choupoProps/);
  });

  it("EXPLORER_GUIDE_PHASE_SPLIT is a \\label of docs/explorerGuide.tex", () => {
    const tex = readFileSync(new URL("../../docs/explorerGuide.tex", import.meta.url), "utf-8");
    expect(tex).toContain(`\\label{${EXPLORER_GUIDE_PHASE_SPLIT}}`);
  });
});

describe("the reading, against the witness's own run", () => {
  //  Read lazily, inside each test: a witness that could not be generated
  //  REFUSES by name in the tests that read it, never at collection time
  //  (which would take the plan tests above down with it).
  let cache: ReturnType<typeof load> | null = null;
  function load() {
    const log = witnessOutput(WITNESS, "log.choupoProps");
    const csvText = witnessOutput(WITNESS, "freeze.csv");
    const blocks = extractStructured(log, phaseSplitPlan(base).files!).phaseSplitScans ?? [];
    const lines = csvText.trim().split(/\r?\n/);
    const head = lines[0]!.split(",");
    const rows = lines.slice(1).map((l) => l.split(",").map(Number));
    return { log, blocks, block: blocks[0]!, head, rows, col: (name: string) => head.indexOf(name) };
  }
  const w = () => (cache ??= load());

  it("the adapter carries exactly one block, on T at the held 1 atm", () => {
    const { blocks, block, head, rows } = w();
    expect(blocks).toHaveLength(1);
    expect(block.variable).toBe("T");
    expect(block.held.name).toBe("P");
    expect(block.held.value).toBeCloseTo(101325, 6);
    expect(block.points).toHaveLength(rows.length);
    expect(block.phaseNames).toEqual(head.slice(3, 3 + block.phaseNames.length));
  });

  it("every amount drawn is the CSV cell of the same run, and the bars sum to one", () => {
    const { block, rows, col } = w();
    const { x, series } = phaseAmountSeries(block);
    rows.forEach((r, k) => {
      expect(x[k]).toBeCloseTo(r[col("T")]!, 8);
      let sum = 0;
      for (const s of series) {
        const v = s.y[k]!;
        expect(v).not.toBeNull();
        expect(v).toBeCloseTo(r[col(s.name)]!, 9);
        sum += v;
      }
      expect(sum).toBeCloseTo(1, 9);
    });
  });

  it("ice is ABSENT (0, a fact) above its appearance and present below it", () => {
    const { block } = w();
    const ice = phaseAmountSeries(block).series.find((s) => s.name === "ice")!;
    const first = block.points.findIndex((p) => p.phases.ice !== undefined);
    expect(first).toBeGreaterThan(0);
    expect(ice.y.slice(0, first).every((v) => v === 0)).toBe(true);
    expect(ice.y.slice(first).every((v) => (v ?? 0) > 0)).toBe(true);
  });

  it("the appearance is the engine's interval, drawn between its two grid values", () => {
    const { block } = w();
    expect(block.events).toHaveLength(1);
    const e = block.events[0]!;
    expect(e.phase).toBe("ice");
    expect(e.from).toBeCloseTo(265.15, 8);
    expect(e.to).toBeCloseTo(264.15, 8);
    expect(eventSentence(block, e, (v) => v.toFixed(2)))
      .toBe("ice (solid: water) appeared between T = 265.15 and 264.15");
  });

  it("the liquor's composition is the CSV's where present; ice's is a gap where absent", () => {
    const { block, rows, col } = w();
    const liq = phaseCompositionSeries(block, "L1");
    const eth = liq.series.find((s) => s.component === "ethanol")!;
    rows.forEach((r, k) => expect(eth.y[k]).toBeCloseTo(r[col("x_L1_ethanol")]!, 9));
    const ice = phaseCompositionSeries(block, "ice").series.find((s) => s.component === "water")!;
    expect(ice.y[0]).toBeNull();
    expect(phasesEverPresent(block)).toEqual(["L1", "ice"]);
  });

  it("no pH from a molecular package, no refused point, the announcements carried", () => {
    const { block } = w();
    expect(phSeries(block).has).toBe(false);
    expect(refusedPoints(block)).toEqual([]);
    expect(announcements(block).length).toBeGreaterThan(0);
    expect(block.notModelled.join(" ")).toMatch(/supercooling/);
    expect(block.phaseLabels.L1).toBe("liquor");
  });

  it("the console notes are the engine's own lines (none for a feed that sums to one)", () => {
    const { log } = w();
    expect(scanConsoleNotes(log).filter((l) => /normalised/.test(l))).toEqual([]);
    expect(scanConsoleNotes("  [phaseSplitScan] the feed sums to 10 (moles), normalised to 1.\n"))
      .toEqual(["the feed sums to 10 (moles), normalised to 1."]);
  });
});

describe("the gap rule, on a block with a refused point", () => {
  const block = shapePhaseSplitScans([{
    op: "x", variable: "T", held: { P: 101325 }, feed: { water: 1 },
    phaseNames: ["L1", "ice"], phaseLabels: { L1: "liquid" }, csv: "a.csv",
    points: [
      { T: 274, P: 101325, solved: true, phases: { L1: { amount: 1, x: { water: 1 } } }, observables: { pH: 7 } },
      { T: 273, P: 101325, solved: false, reason: "does not relax its own saturation" },
      { T: 272, P: 101325, solved: true, phases: { ice: { amount: 1, x: { water: 1 } } }, observables: {} },
      { T: "bad", P: 101325, solved: true },
    ],
    events: [{ kind: "appeared", phase: "ice", from: 274, to: 272, index: 2, acrossRefused: true },
             { kind: "disappeared", phase: "L1" }],
    notModelled: ["supercooling"],
  }, "not a block"])[0]!;

  it("drops what cannot be placed, keeps the refusal's words", () => {
    expect(block.points).toHaveLength(3);
    expect(block.events).toHaveLength(1);
    expect(refusedPoints(block)).toEqual([{ at: 273, reason: "does not relax its own saturation" }]);
  });

  it("a refused point is null in every series, an absent phase is 0", () => {
    const { series } = phaseAmountSeries(block);
    expect(series.find((s) => s.name === "L1")!.y).toEqual([1, null, 0]);
    expect(series.find((s) => s.name === "ice")!.y).toEqual([0, null, 1]);
    expect(phSeries(block).y).toEqual([7, null, null]);
    expect(eventSentence(block, block.events[0]!, (v) => String(v)))
      .toBe("ice appeared between T = 274 and 272 (across a refused point)");
  });
});
