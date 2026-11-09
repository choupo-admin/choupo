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

/*  A HEADER WITH A BRANCH TO EACH ITEM (DEV.md 4c C268), as the GUI reads it.
    The engine publishes a header's main as the stream's own pipe (`header`,
    `branches`) and each branch as a pipe of its own, `pipe:<stream>@<item>`,
    with the stream's state and NO mass flow.  The GUI draws, tabulates and
    cards them as it does every pipe -- these tests hold that it keeps their
    identities apart (two branches of one stream are two rows, two keys), says
    which is a branch, and never shows the main's flow on a branch.  The
    fixture is a transcription of two branches of `ammonia02_full_plant`'s
    `productNH3` header (a run of 2026-11-09), cut to two bullets. */

import { describe, expect, it } from "vitest";

import type { LayoutPipe, PlantLayout } from "../src/adapters/SolverAdapter.js";
import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import { pipeCard } from "../src/case/layoutCards.js";
import { pipeRegister } from "../src/case/layoutTables.js";
import { endName, layoutScene, pipeId } from "../src/case/plantLayout.js";
import { LAYOUT } from "./plantLayoutFixture.js";

const BULLET = { nonProcess: false, kind: "vessel", sector: "", shape: "cylinder",
  orientation: "alongY", footprintFrom: "published", y: -54, z: 0,
  dx: 5.20176099374, dy: 31.2105659624, dz: 5.20176099374 } as const;
const MAIN: LayoutPipe = {
  id: "pipe:productNH3", stream: "productNH3", header: "T201", branches: 2,
  fromKind: "item", from: "letdown", fromUnit: "letdown",
  toKind: "header", to: "T201", toUnit: "T201", routedBy: "rack", lane: 13,
  length: 132.292075528, F_mass: 16.9, T: 250, P: 2e6, vf: 0,
  route: [[59.5, -6, 0], [74.4, -6, 0], [74.4, -37.4, 0], [88, -37.4, 0]],
};
const branch = (n: number, x: number): LayoutPipe => ({
  id: `pipe:productNH3@T201/vessel${n}`, stream: "productNH3", header: "T201",
  branch: `T201/vessel${n}`,
  fromKind: "header", from: "T201", fromUnit: "T201",
  toKind: "item", to: `T201/vessel${n}`, toUnit: "T201", routedBy: "header", lane: -1,
  length: 11.8429936894, T: 250, P: 2e6, vf: 0,
  route: [[x - 3.6, -37.4, 6.2], [x - 3.6, -44.6, 6.2], [x, -44.6, 6.2], [x, -44.6, 5.2]],
});
const HEADERED: PlantLayout = {
  ...LAYOUT,
  items: [...LAYOUT.items,
          { ...BULLET, id: "T201/vessel1", x: 78 }, { ...BULLET, id: "T201/vessel2", x: 88 }],
  pipes: [MAIN, branch(1, 78), branch(2, 88)],
  notRouted: [],
};

describe("a header's branches keep their own identity (DEV.md 4c C268)", () => {
  it("the adapter passes the id and the header words through", () => {
    const log = `${BEGIN_MARK}\n${JSON.stringify({ streams: {}, layout: HEADERED })}\n${END_MARK}\n`;
    const out = extractStructured(log, { thermoPackage: {}, controlDict: {} });
    const ps = out.layout!.pipes!;
    expect(ps.map((p) => p.id)).toEqual(
      ["pipe:productNH3", "pipe:productNH3@T201/vessel1", "pipe:productNH3@T201/vessel2"]);
    expect(ps[0]!.header).toBe("T201");
    expect(ps[0]!.branches).toBe(2);
    expect(ps[1]!.branch).toBe("T201/vessel1");
    expect(ps[1]!.F_mass).toBeUndefined();
  });

  it("the scene keys each pipe on the engine's id; an older result keys on the stream", () => {
    const scene = layoutScene(HEADERED)!;
    expect(scene.pipes.map((p) => p.id)).toEqual(
      ["pipe:productNH3", "pipe:productNH3@T201/vessel1", "pipe:productNH3@T201/vessel2"]);
    expect(scene.pipes[1]!.branch).toBe("T201/vessel1");
    expect(scene.pipes[1]!.massFlow).toBeNull();
    const { id: _drop, ...old } = MAIN;
    void _drop;
    expect(pipeId(old)).toBe("pipe:productNH3");
    expect(endName("header", "T201")).toBe("T201 (header)");
  });

  it("the register lists the main and one row per branch, each keyed apart, no flow on a branch", () => {
    const reg = pipeRegister(HEADERED)!;
    expect(reg.rows.map((r) => r.id)).toEqual(
      ["pipe:productNH3", "pipe:productNH3@T201/vessel1", "pipe:productNH3@T201/vessel2"]);
    expect(reg.rows[0]!.length).toContain("header T201, 2 branches");
    expect(reg.rows[1]!.stream).toBe("productNH3 → T201/vessel1 (branch)");
    expect(reg.rows[1]!.ends).toBe("T201 (header) → T201/vessel1");
    expect(reg.rows[1]!.flow).toBe("");
    expect(reg.total!.label).toBe("3 pipes, in all");
  });

  it("a branch's click card says it is one and shows no mass flow, even with the stream's facts", () => {
    const scene = layoutScene(HEADERED)!;
    const facts = { streams: { productNH3: { T: 250, P: 2e6, vf: 0, F_mass: 16.9 } },
                    components: [], items: {}, sized: false, kpis: [] };
    const card = pipeCard(scene.pipes[1]!, facts as never);
    expect(card.key).toBe("pipe:productNH3@T201/vessel1");
    expect(card.subtitle).toBe("branch of a header");
    expect(card.rows.find((r) => r.label === "Mass flow")).toBeUndefined();
    expect(card.rows.find((r) => r.label === "From")!.value).toBe("header T201");
    const main = pipeCard(scene.pipes[0]!, facts as never);
    expect(main.rows.find((r) => r.label === "Mass flow")).toBeDefined();
  });
});
