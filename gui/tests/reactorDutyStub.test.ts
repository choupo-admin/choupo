/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * A reactor's duty is a duty (DEV.md 4c C52).
 *
 * Vítor, on the green-ammonia converter: "o reator gibbs não devia ter
 * utilidade de calor?!!!"  The engine's utility allocation dropped every
 * reactor's `Q_kW`, and the canvas, which drew stubs only for a fixed list of
 * heater-like types, drew none either.  The engine half now publishes one
 * allocation row per duty; this file pins the canvas half:
 *
 *   - a reactor gets a duty stub before a run (the type is all there is);
 *   - after a run the ENGINE decides: no row -> the stub is idle (an
 *     adiabatic reactor), a row -> its sign, never the pre-run guess;
 *   - the utility the case declares is the unit-level `utility <name>;` the
 *     engine reads, not an `operation.utility` no engine reader ever read.
 */
import { describe, expect, it } from "vitest";

import { flowsheetToGraph } from "../src/case/toGraph.js";
import { dutyStubFromRun } from "../src/case/dutyUtility.js";
import type { DutyRowFacts } from "../src/case/dutyUtility.js";
import type { JsonDict } from "../src/dict/index.js";

const reactorCase = (extra: JsonDict = {}): JsonDict => ({
  units: [
    { name: "conv", type: "gibbsReactor", in: "feed", outputs: ["out"],
      operation: { T: 733.15, P: 1.5e7 }, ...extra },
  ],
});

describe("a reactor carries a duty stub", () => {
  it("gibbsReactor gets one, docked by an energy edge", () => {
    const g = flowsheetToGraph(reactorCase());
    const stub = g.nodes.find((n) => n.id === "duty:conv:Q");
    expect(stub, "a gibbsReactor must synthesize a duty stub").toBeDefined();
    expect(g.edges.some((e) => e.source === "duty:conv:Q")).toBe(true);
  });

  it("the stub shows the DECLARED unit-level utility before a run", () => {
    const g = flowsheetToGraph(reactorCase({ utility: "steamGenerationHP" }));
    const d = g.nodes.find((n) => n.id === "duty:conv:Q")!.data as
      { utilityName?: string };
    expect(d.utilityName).toBe("steamGenerationHP");
  });

  it("an `operation.utility` is NOT read as a declaration (no engine reads it)", () => {
    const g = flowsheetToGraph({
      units: [{ name: "conv", type: "gibbsReactor", in: "feed", outputs: ["out"],
                operation: { T: 733.15, utility: "steamHP" } }],
    });
    const d = g.nodes.find((n) => n.id === "duty:conv:Q")!.data as
      { utilityName?: string };
    expect(d.utilityName).toBeUndefined();
  });
});

describe("after a run the engine decides the stub", () => {
  const row: DutyRowFacts = { unit: "conv", port: "", tier: "cooling",
    utility: "steamGenerationHP", allocated: true, carried: false };

  it("before a run nothing is decided", () => {
    const s = dutyStubFromRun(undefined, "conv", "", false, "heating");
    expect(s.idle).toBe(false);
    expect(s.tier).toBe("heating");
  });

  it("a row gives the SIGN, overriding the pre-run guess", () => {
    const s = dutyStubFromRun([row], "conv", "", true, "heating");
    expect(s.idle).toBe(false);
    expect(s.tier).toBe("cooling");
    expect(s.row?.utility).toBe("steamGenerationHP");
  });

  it("no row for a unit that RAN means no duty: the stub is idle", () => {
    const s = dutyStubFromRun([row], "adiabaticPfr", "", true, "heating");
    expect(s.idle).toBe(true);
  });

  it("a row on another PORT is not this stub's row", () => {
    const s = dutyStubFromRun([{ ...row, port: "reboiler" }], "conv", "", true,
                              "heating");
    expect(s.idle).toBe(true);
  });
});
