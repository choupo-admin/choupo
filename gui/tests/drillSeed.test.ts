/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * What a drilled sub-case is handed from the run it came out of.
 *
 * The witness is the one Vítor drilled into: the flagship's LOOP sector wires
 * `PreheatedFeed { from FEHE/ColdOut; to Converter/Feed; }`, and the
 * converter's own folder declares `boundary { inlets ( Feed ); }`.  The whole
 * question is whether `Feed` finds `PreheatedFeed`.
 */
import { describe, it, expect } from "vitest";
import { buildDrillSeed, memberPorts } from "../src/case/drillSeed";
import type { RunResult } from "../src/adapters/SolverAdapter";

//  The LOOP sector's wiring, cut to what matters here.
const LOOP = {
  units: [
    { name: "FEHE", type: "heatExchanger", outputs: ["ColdOut"] },
    { name: "Converter", type: "gibbsReactor" },
  ],
  connections: {
    PreheatedFeed: { from: "FEHE/ColdOut", to: "Converter/Feed" },
    HotEffluent: { from: "Converter/Out", to: "FEHE/Hot" },
  },
} as never;

//  The converter's OWN folder: it names its ports locally.
const CONVERTER = {
  flowsheet: {
    units: [{ name: "unit", type: "gibbsReactor" }],
    boundary: { inlets: ["Feed"], outlets: ["Out"] },
  },
} as never;

//  A RunResult always carries `convergence`; the first version of this fixture
//  did not, and `sliceRunResult` threw on it.  The fixture was wrong, not the
//  code -- but it is worth the line: a fixture thinner than the real thing
//  tests a function that never runs.
const RUN = {
  status: "done", log: "", convergence: [], kpis: {}, streams: [
    { name: "PreheatedFeed", F: 3.889, T: 679, P: 2.32e7,
      composition: { N2: 0.24, H2: 0.72, NH3: 0.03, Ar: 0.01 }, role: "intermediate" },
    { name: "HotEffluent", F: 3.6, T: 842, P: 2.0e7,
      composition: { N2: 0.2, H2: 0.6, NH3: 0.19, Ar: 0.01 }, role: "intermediate" },
    //  A stream of the SECTOR that the converter does not touch.  It must not
    //  reach the child: a foreign 0/ file ORPHANS and the case refuses.
    { name: "Purge", F: 0.1, T: 300, P: 2.0e7,
      composition: { N2: 0.25, H2: 0.75 }, role: "product" },
  ],
} as unknown as RunResult;

describe("the parent's own connections decide which stream is which port", () => {
  it("maps BOTH ports to the PARENT's stream names", () => {
    //  The outlet needs a map too, not just a name list: the 0/ completeness
    //  contract wants a file per graph stream, and the converter's `Out` is
    //  the sector's `HotEffluent`.  The first version returned only the name
    //  list and the child came out one file short.
    const { boundaryFeeds, boundaryOutlets, ports } = memberPorts(LOOP, "Converter");
    expect(boundaryFeeds).toEqual({ Feed: "PreheatedFeed" });
    expect(boundaryOutlets).toEqual(["Out"]);
    expect(ports).toEqual({ Feed: "PreheatedFeed", Out: "HotEffluent" });
  });

  it("reads the SLASH form only -- a flattened dotted name is not a port", () => {
    //  `Converter.Feed` is the engine's FLATTENED name; reading a port out of
    //  one would be the name-identity crossing this project bans.
    const dotted = { connections: { X: { from: "A/o", to: "Converter.Feed" } } } as never;
    expect(memberPorts(dotted, "Converter").boundaryFeeds).toEqual({});
  });

  it("a member with no connections gets nothing, not a guess", () => {
    expect(memberPorts(LOOP, "Separator"))
      .toEqual({ boundaryFeeds: {}, boundaryOutlets: [], ports: {} });
    expect(memberPorts(undefined, "Converter"))
      .toEqual({ boundaryFeeds: {}, boundaryOutlets: [], ports: {} });
  });
});

describe("the seed the converter is handed", () => {
  const seed = buildDrillSeed(LOOP, CONVERTER, "Converter", RUN)!;

  it("feeds the inlet with the PARENT's converged numbers", () => {
    expect(seed).not.toBeNull();
    expect(seed.feeds["Feed"]).toBeDefined();
    expect(seed.feeds["Feed"]!.T).toBeCloseTo(679, 6);
    expect(seed.feeds["Feed"]!.F).toBeCloseTo(3.889, 6);
    expect(seed.feeds["Feed"]!.molarComposition["H2"]).toBeCloseTo(0.72, 6);
  });

  it("carries ONLY the child's own streams -- a foreign one orphans", () => {
    //  The 0/ completeness contract counts streams: a file for a stream the
    //  child's graph does not declare fails the case outright.
    expect(Object.keys(seed.feeds).sort()).toEqual(["Feed", "Out"]);
    expect(seed.feeds["Purge"]).toBeUndefined();
    expect(seed.feeds["PreheatedFeed"]).toBeUndefined();  // the LOCAL name wins
  });

  it("never freezes the WRONG stream's numbers into the child", () => {
    //  The inlet is 679 K and the outlet 842 K.  Matching by leaf or by
    //  similarity could swap them, and a swapped seed is worse than failing:
    //  the run would converge on a lie.
    expect(seed.feeds["Feed"]!.T).not.toBeCloseTo(842, 3);
    expect(seed.feeds["Out"]!.T).toBeCloseTo(842, 6);
  });
});

describe("a stream the child does not declare never reaches its 0/", () => {
  it("drops a prefix-stripped parent stream the child's graph omits", () => {
    //  THIS FIXTURE EXISTS BECAUSE A SABOTAGE SURVIVED.  Dropping the
    //  `wanted` filter left all nine other assertions green: the slice
    //  already restricts to the scope, so no shipped fixture reached the
    //  guard.  A parent stream named `Converter.Hidden` arrives from the
    //  slice as local `Hidden`, which the converter's dict does not declare
    //  -- and a 0/ file for an undeclared stream ORPHANS and refuses the
    //  case, which is exactly what the guard is for.
    const withHidden = { ...RUN, streams: [...RUN.streams,
      { name: "Converter.Hidden", F: 1, T: 300, P: 1e5,
        composition: { N2: 1 }, role: "intermediate" }] } as unknown as RunResult;
    const seed = buildDrillSeed(LOOP, CONVERTER, "Converter", withHidden)!;
    expect(Object.keys(seed.feeds).sort()).toEqual(["Feed", "Out"]);
    expect(seed.feeds["Hidden"]).toBeUndefined();
  });
});

describe("what it refuses to invent", () => {
  it("no finished run means NO seed -- the child opens as it always did", () => {
    expect(buildDrillSeed(LOOP, CONVERTER, "Converter", null)).toBeNull();
    expect(buildDrillSeed(LOOP, CONVERTER, "Converter",
      { status: "done", log: "", convergence: [], streams: [] } as unknown as RunResult)).toBeNull();
  });

  it("a member the run knows nothing about gets no seed", () => {
    expect(buildDrillSeed(LOOP, CONVERTER, "Separator", RUN)).toBeNull();
  });

  it("a sub-case declaring no streams gets no seed", () => {
    const empty = { flowsheet: { units: [] } } as never;
    expect(buildDrillSeed(LOOP, empty, "Converter", RUN)).toBeNull();
  });
});
