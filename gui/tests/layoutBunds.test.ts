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

/*  SECONDARY CONTAINMENT IN THE VIEW (DEV.md 4c C134): bunds and impounding
    areas, as the scene and the tables carry them.  The two records below are
    TRANSCRIBED from the engine's run of `tutorials/plant/
    greenAmmoniaPEQ_baseCase` (its `layout.bunds`); the view must carry the
    engine's numbers unmeasured and work out only what is drawing:
      * the adapter passes the block through and keeps its absence;
      * the wall runs on the engine's outline at the engine's height, the pit
        at its published plan box and depth; nothing is computed;
      * a SHORT containment is flagged and labelled in WORDS (never colour
        alone), an adequate one is not;
      * the table quotes the engine's volumes and verdict, the case's rule;
      * the Design Guide section the table links to exists. */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { bundSummary, DESIGN_GUIDE_CONTAINMENT } from "../src/case/layoutTables.js";
import { bundsOf, layoutScene, toThree } from "../src/case/plantLayout.js";
import { LAYOUT } from "./plantLayoutFixture.js";

const here = dirname(fileURLToPath(import.meta.url));

const TANK_FARM = {
  id: "bund:tankFarm", bund: "tankFarm", containment: "bund", verdict: "adequate",
  regionFrom: "rectangle", area: 7480, wallHeight: 4, grossVolume: 29920,
  displacedVolume: 9248, netVolume: 20672, requiredVolume: 20435.3628498,
  largestHeld: 17897.6025908, totalHeld: 35795.2051815, basis: "vesselVolume",
  governing: "largest", drain: "closedValve",
  items: ["NH3Storage/tank1", "NH3Storage/tank2"],
  outline: [[103, -69], [213, -69], [213, -1], [103, -1]],
  held: [["NH3Storage/tank1", 17897.6025908, 4624], ["NH3Storage/tank2", 17897.6025908, 4624]],
  terms: [[1.1, "largest", 19687.3628498]],
  allowances: [["rain", "depth", 0.1, 748, "a design storm falling on the bund floor"]],
  ruleSource: "author-set assumption for this exercise", ruleReason: "the largest tank fails",
  source: "author-set assumption for this exercise; not a civil design",
  reason: "the two refrigerated ammonia tanks share one bund",
};

const LOOP_KERB = {
  id: "bund:loopKerb", bund: "loopKerb", containment: "impounding", verdict: "adequate",
  regionFrom: "rectangle", area: 192, wallHeight: 0.2, grossVolume: 18, displacedVolume: 0,
  netVolume: 18, requiredVolume: 16.7600747356, largestHeld: 6.56007473562,
  totalHeld: 12.9626040993, basis: "heldLiquid", governing: "largest", drain: "sumpPump",
  pitX: 70, pitY: 24, pitLength: 4, pitWidth: 3, pitDepth: 1.5,
  items: ["Separator", "LetdownHP", "StorageFlash"],
  outline: [[58, 10], [82, 10], [82, 18], [58, 18]],
  held: [["Separator", 6.29056600474, 0], ["LetdownHP", 0.111963358958, 0],
         ["StorageFlash", 6.56007473562, 0]],
  terms: [[1, "largest", 6.56007473562]],
  allowances: [["rain", "depth", 0.05, 10.2, "a design storm on the slab and the open pit"]],
  ruleSource: "author-set", ruleReason: "the largest holdup", source: "author-set",
  reason: "a kerbed slab sloped to a remote pit",
};

const RULE = "a bund holds its area x its wall height less the volume each enclosed footprint"
  + " occupies below the wall's top";

function run(payload: object) {
  const log = `${BEGIN_MARK}\n${JSON.stringify({ streams: {}, ...payload })}\n${END_MARK}\n`;
  return extractStructured(log, { thermoPackage: {}, controlDict: {} });
}

function adapted(bunds: object[]): PlantLayout {
  return run({ layout: { ...LAYOUT, bunds, bundRule: RULE } }).layout!;
}

describe("secondary containment (C134)", () => {
  it("the adapter passes the engine's containments through, and keeps absence", () => {
    const lay = adapted([TANK_FARM, LOOP_KERB]);
    expect(lay.bunds).toHaveLength(2);
    const [b, k] = lay.bunds!;
    expect(b!.containment).toBe("bund");
    expect(b!.netVolume).toBe(20672);
    expect(b!.requiredVolume).toBe(20435.3628498);
    expect(b!.pit).toBeUndefined();
    expect(b!.held[0]).toEqual({ item: "NH3Storage/tank1", volume: 17897.6025908, displaced: 4624 });
    expect(b!.allowances[0]!.volume).toBe(748);
    expect(k!.containment).toBe("impounding");
    expect(k!.pit).toEqual({ x: 70, y: 24, length: 4, width: 3, depth: 1.5 });
    expect(lay.bundRule).toBe(RULE);
    const none = run({ layout: LAYOUT }).layout!;
    expect(none.bunds).toBeUndefined();
    expect(layoutScene(none)!.bunds).toEqual([]);
  });

  it("draws the wall on the engine's outline at its height, the pit at its box", () => {
    const lay = adapted([TANK_FARM, LOOP_KERB]);
    const [b, k] = bundsOf(lay);
    expect(b!.runs).toHaveLength(4);
    expect(b!.runs[0]).toEqual([toThree(103, -69, 0), toThree(213, -69, 0)]);
    expect(b!.runs[3]).toEqual([toThree(103, -1, 0), toThree(103, -69, 0)]);
    expect(b!.height).toBe(4);
    expect(b!.pit).toBeNull();
    expect(k!.height).toBe(0.2);
    expect(k!.pit).toEqual({ at: toThree(70, 24, 0), sizeX: 4, sizeZ: 3, depth: 1.5 });
    expect(layoutScene(lay)!.bunds).toHaveLength(2);
  });

  it("a SHORT containment is flagged and said in words; an adequate one is not", () => {
    const short = { ...TANK_FARM, wallHeight: 2, netVolume: 10336, verdict: "inadequate" };
    const [ok] = bundsOf(adapted([TANK_FARM]));
    const [bad] = bundsOf(adapted([short]));
    expect(ok!.flagged).toBe(false);
    expect(ok!.label).toBe("bund tankFarm");
    expect(bad!.flagged).toBe(true);
    expect(bad!.label).toContain("SHORT");
    expect(bad!.tooltip[0]).toContain("inadequate");
    expect(bad!.tooltip[1]).toContain("10336");
  });

  it("the table quotes the engine's volumes and verdict and the case's rule", () => {
    const v = bundSummary(adapted([TANK_FARM, LOOP_KERB]))!;
    expect(v.headline).toContain("2 containments declared");
    expect(v.rows.map((r) => r.bund)).toEqual(["tankFarm", "loopKerb"]);
    expect(v.rows[0]!.holds).toContain("20672.0");
    expect(v.rows[0]!.requires).toBe("20435.4");
    expect(v.rows[0]!.verdict).toBe("adequate");
    expect(v.rows[1]!.holds).toContain("pit 4.0 x 3.0 x 1.50 m");
    expect(v.notes[0]).toContain("110 % of the largest");
    expect(v.notes[0]).toContain("100 mm over the catch area");
    expect(v.notes.at(-1)).toContain(RULE);
    const short = bundSummary(adapted([{ ...TANK_FARM, verdict: "inadequate" }]))!;
    expect(short.rows[0]!.verdict).toBe("SHORT (announced)");
    expect(bundSummary({ ...LAYOUT } as PlantLayout)).toBeNull();
  });

  it("the Design Guide section the table links to exists", () => {
    const tex = readFileSync(resolve(here, "../../docs/designGuide.tex"), "utf8");
    expect(tex).toContain(`\\label{${DESIGN_GUIDE_CONTAINMENT}}`);
  });
});
