/*---------------------------------------------------------------------------*\
  Drill-in result slicing: a parent run's RunResult cut down to a sub-case
  scope ("SECTOR.x" -> "x"), so double-clicking into a sector/unit opens a tab
  that is already run.  Covers prefix stripping (dot AND slash separators),
  boundary-stream passthrough, kpi renaming, scope filtering of advisories /
  model boundaries, and the honest "[inherit]" log note.
\*---------------------------------------------------------------------------*/
import { describe, it, expect } from "vitest";

import {
  inheritedNote,
  localStreamNames,
  sliceHasContent,
  sliceRunResult,
  stripScope,
  withFrozenBoundaryFeeds,
} from "../src/case/resultSlice.js";
import type { RunResult, StreamResult } from "../src/adapters/SolverAdapter.js";

const stream = (name: string, over: Partial<StreamResult> = {}): StreamResult => ({
  name, role: "intermediate", F: 1, T: 300, P: 101325, composition: {}, ...over,
});

const parent: RunResult = {
  status: "done",
  log: "full parent log\n",
  streams: [
    stream("Feed", { role: "feed" }),
    stream("SECTOR.Mixer.MixedFeed"),
    stream("SECTOR.Recycle"),
    stream("OTHER.Flash.Vapour"),
    stream("Purge", { role: "product" }),
  ],
  convergence: [
    { label: "SECTOR.Fermentor", residuals: [1, 1e-9] },
    { label: "OTHER.Flash", residuals: [2, 1e-8] },
  ],
  kpis: {
    "SECTOR.Fermentor": { X: 0.9 },
    "OTHER.Flash": { Q: 5 },
  },
  profiles: [
    { unit: "SECTOR.Fermentor", xAxis: "z", columns: { T: [300, 310] } },
    { unit: "OTHER.Flash", xAxis: "stage", columns: { T: [350] } },
  ],
  utilityAllocation: [
    { unit: "SECTOR.Fermentor", port: "", tier: "cooling", utility: "coolingWater",
      duty_kW: 10, T: 310, kg_s: 1, MW: 0.01, eur_h: 0.1, allocated: true },
    { unit: "OTHER.Flash", port: "", tier: "heating", utility: "steamLP",
      duty_kW: 20, T: 400, kg_s: 1, MW: 0.02, eur_h: 0.2, allocated: true },
  ],
  advisories: [
    { category: "init", severity: "info", locus: "tear 'SECTOR.Recycle'",
      message: "auto-seeded tear 'SECTOR.Recycle' from the feed aggregate" },
    { category: "thermo", severity: "warning", locus: "NRTL",
      message: "2 binary pair(s) defaulted to ideal" },
  ],
  modelBoundaries: [
    { stream: "SECTOR.Mixer.MixedFeed", producer: "SECTOR.Mixer",
      consumer: "SECTOR.Fermentor", refused: false, dH_kJ_per_mol: 0.1 },
    { stream: "OTHER.Flash.Vapour", producer: "OTHER.Flash",
      consumer: "OTHER.Cond", refused: true, reason: "speciation flip" },
  ],
  componentMolarMass: { water: 18.015 },
};

describe("stripScope", () => {
  it("strips a dot-separated prefix", () => {
    expect(stripScope("SECTOR.Mixer.MixedFeed", "SECTOR")).toBe("Mixer.MixedFeed");
  });
  it("accepts slash separators in the name and in the prefix", () => {
    expect(stripScope("SECTOR/Mixer/Out", "SECTOR")).toBe("Mixer/Out");
    expect(stripScope("SECTOR.Mixer.Out", "SECTOR.Mixer")).toBe("Out");
    expect(stripScope("SECTOR/Mixer/Out", "SECTOR/Mixer")).toBe("Out");
    expect(stripScope("SECTOR.Mixer.Out", "SECTOR/Mixer")).toBe("Out");
  });
  it("returns '' for the scope itself and null outside it", () => {
    expect(stripScope("SECTOR", "SECTOR")).toBe("");
    expect(stripScope("OTHER.Flash", "SECTOR")).toBeNull();
    expect(stripScope("SECTORISH.x", "SECTOR")).toBeNull(); // no partial-word match
  });
});

describe("sliceRunResult: streams", () => {
  it("strips the prefix off scoped streams and drops non-matching ones", () => {
    const r = sliceRunResult(parent, "SECTOR");
    expect(r.streams.map((s) => s.name)).toEqual(["Mixer.MixedFeed", "Recycle"]);
  });

  it("accepts '/'-separated parent stream names", () => {
    const p: RunResult = { ...parent, streams: [stream("SECTOR/Mixer/Out")] };
    const r = sliceRunResult(p, "SECTOR");
    expect(r.streams.map((s) => s.name)).toEqual(["Mixer/Out"]);
  });

  it("passes boundary streams through unprefixed when the sub-case dicts name them", () => {
    const r = sliceRunResult(parent, "SECTOR", { localStreamNames: ["Feed", "Must"] });
    expect(r.streams.map((s) => s.name)).toEqual(["Feed", "Mixer.MixedFeed", "Recycle"]);
    // the passthrough carries the parent's converged conditions verbatim
    expect(r.streams[0]!.role).toBe("feed");
    // "Purge" is unprefixed in the parent but NOT a sub-case name -> dropped
    expect(r.streams.find((s) => s.name === "Purge")).toBeUndefined();
  });

  it("prefers the scope's own stream over a colliding passthrough name", () => {
    const p: RunResult = {
      ...parent,
      streams: [stream("Vapour", { T: 999 }), stream("SECTOR.Vapour", { T: 355 })],
    };
    const r = sliceRunResult(p, "SECTOR", { localStreamNames: ["Vapour"] });
    expect(r.streams).toHaveLength(1);
    expect(r.streams[0]!.T).toBe(355); // the stripped (in-scope) one wins
  });
});

describe("sliceRunResult: kpis / convergence / profiles / utilities", () => {
  it("renames kpi keys '<prefix>.unit' -> 'unit' and drops the rest", () => {
    const r = sliceRunResult(parent, "SECTOR");
    expect(r.kpis).toEqual({ Fermentor: { X: 0.9 } });
  });

  it("maps an exact-scope key to the leaf unit name (unit-level drill)", () => {
    const p: RunResult = {
      ...parent,
      streams: [stream("Splitter.ToConcentration")],
      kpis: { Splitter: { split: 0.67 } },
      convergence: [{ label: "Splitter", residuals: [1e-12] }],
    };
    const r = sliceRunResult(p, "Splitter", { leafUnitName: "unit" });
    expect(r.kpis).toEqual({ unit: { split: 0.67 } });
    expect(r.convergence).toEqual([{ label: "unit", residuals: [1e-12] }]);
    expect(r.streams.map((s) => s.name)).toEqual(["ToConcentration"]);
  });

  it("slices convergence, profiles and utilityAllocation by the same rule", () => {
    const r = sliceRunResult(parent, "SECTOR");
    expect(r.convergence).toEqual([{ label: "Fermentor", residuals: [1, 1e-9] }]);
    expect(r.profiles).toEqual([{ unit: "Fermentor", xAxis: "z", columns: { T: [300, 310] } }]);
    expect(r.utilityAllocation).toHaveLength(1);
    expect(r.utilityAllocation![0]!.unit).toBe("Fermentor");
  });
});

describe("sliceRunResult: advisories + model boundaries", () => {
  it("keeps advisories that mention the scope, stripped to local names", () => {
    const r = sliceRunResult(parent, "SECTOR");
    expect(r.advisories).toHaveLength(1);
    expect(r.advisories![0]!.locus).toBe("tear 'Recycle'");
    expect(r.advisories![0]!.message).toContain("tear 'Recycle'");
  });

  it("drops scope-free advisories (they belong to the parent pass)", () => {
    const r = sliceRunResult(parent, "OTHER");
    expect((r.advisories ?? []).find((a) => a.locus === "NRTL")).toBeUndefined();
  });

  it("keeps model boundaries inside the scope, renamed; drops the rest", () => {
    const r = sliceRunResult(parent, "SECTOR");
    expect(r.modelBoundaries).toEqual([{
      stream: "Mixer.MixedFeed", producer: "Mixer", consumer: "Fermentor",
      refused: false, dH_kJ_per_mol: 0.1,
    }]);
  });
});

describe("sliceRunResult: synthesized run shape", () => {
  it("is a finished run with the one-line inherited note as its log", () => {
    const r = sliceRunResult(parent, "SECTOR");
    expect(r.status).toBe("done");
    expect(r.log).toBe(inheritedNote("SECTOR"));
    expect(r.log).toContain("inherited from the parent run");
    expect(r.log).toContain("re-run to recompute");
    expect(r.componentMolarMass).toEqual({ water: 18.015 });
  });

  it("does not mutate the parent result", () => {
    const before = JSON.stringify(parent);
    sliceRunResult(parent, "SECTOR", { localStreamNames: ["Feed"] });
    expect(JSON.stringify(parent)).toBe(before);
  });

  it("sliceHasContent gates an empty slice (nothing in scope)", () => {
    expect(sliceHasContent(sliceRunResult(parent, "NOWHERE"))).toBe(false);
    expect(sliceHasContent(sliceRunResult(parent, "SECTOR"))).toBe(true);
  });

  it("pulls a boundary inlet fed by an internal parent stream (via connections)", () => {
    // EXTRACTION's `liquor` inlet is fed by the parent's `BRINE.liquor`: the
    // feed name is flattened+prefixed, so it is neither prefix-stripped into
    // scope nor matched unprefixed -- boundaryFeeds resolves it, keeping the
    // parent's last converged values.  A plant-source inlet (`organic`) still
    // passes through unprefixed.
    const p: RunResult = {
      ...parent,
      streams: [
        stream("organic", { role: "feed", T: 298 }),
        stream("BRINE.liquor", { T: 305, F: 42 }),
        // a sector outlet that is INTERNAL in the parent (feeds nothing at the
        // plant boundary): role "intermediate", prefix-strips to "raffinate".
        stream("EXTRACTION.raffinate", { T: 297, role: "intermediate" }),
      ],
    };
    const sliced = sliceRunResult(p, "EXTRACTION", {
      localStreamNames: ["liquor", "organic", "raffinate"],
      boundaryFeeds: { liquor: "BRINE.liquor", organic: "organic" },
      boundaryOutlets: ["raffinate"],
    });
    const liquor = sliced.streams.find((s) => s.name === "liquor");
    expect(liquor).toBeDefined();
    expect(liquor!.T).toBe(305);
    expect(liquor!.F).toBe(42);
    expect(sliced.streams.find((s) => s.name === "organic")?.T).toBe(298);
    // Boundary re-roling: inlets -> feed, outlets -> product, so the drilled
    // sub-case's plant-boundary balance counts both sides.
    expect(liquor!.role).toBe("feed");
    expect(sliced.streams.find((s) => s.name === "raffinate")?.role).toBe("product");
  });
});

describe("localStreamNames", () => {
  it("collects names from streams{}, boundary, tears, units and connections", () => {
    const names = localStreamNames({
      children: ["Mixer", "Fermentor"],
      boundary: { inlets: ["Must"], outlets: ["EthanolVapour", "Purge"] },
      tearStreams: ["Recycle"],
      streams: { Must: { F: 1 }, Recycle: { F: 0.5 } },
      connections: [
        { from: "Must", to: "Mixer/In" },
        { from: "Mixer/MixedFeed", to: "Fermentor/Feed" },
      ],
      units: [{ name: "u", in: "a", outputs: ["b", "c"] }],
    });
    for (const n of ["Must", "EthanolVapour", "Purge", "Recycle",
                     "Mixer/MixedFeed", "a", "b", "c"]) {
      expect(names).toContain(n);
    }
  });

  it("is empty for a missing flowsheet", () => {
    expect(localStreamNames(undefined)).toEqual([]);
  });
});

describe("withFrozenBoundaryFeeds", () => {
  const run: RunResult = {
    status: "done", log: "", streams: [
      stream("liquor", { role: "feed", F: 42, T: 305, P: 1e5, composition: { water: 0.9 } }),
      stream("organic", { role: "feed", F: 40, T: 298 }),
    ],
    convergence: [], kpis: {}, profiles: [], utilityAllocation: [], advisories: [],
  } as unknown as RunResult;

  it("injects boundary inlets as feeds from the run (own def wins)", () => {
    const fs = {
      boundary: { inlets: ["liquor", "organic"], outlets: ["raff"] },
      streams: { organic: { F: 99 } }, // authored -> wins
    };
    const out = withFrozenBoundaryFeeds(fs, run);
    const outStreams = out["streams"] as Record<string, Record<string, unknown> | undefined>;
    // liquor pulled from the run
    expect(outStreams["liquor"]?.["T"]).toBe(305);
    // organic kept its authored def
    expect(outStreams["organic"]?.["F"]).toBe(99);
  });

  it("is a no-op without a run or a boundary", () => {
    const fs = { streams: {}, units: [] };
    expect(withFrozenBoundaryFeeds(fs, null)).toBe(fs);
    expect(withFrozenBoundaryFeeds(fs, run)).toBe(fs); // no boundary
  });
});
