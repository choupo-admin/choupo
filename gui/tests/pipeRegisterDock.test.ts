/* C91: the docked pipe register's rows: the engine's pipes joined to the
   line sheets (C207), numbers kept as numbers, sortable by the shared
   SortableTable's sortRows, and selectable by the id the 3D view selects by. */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { dockedPipeRows } from "../src/case/pipeRegisterRows.js";
import { layoutScene, pipeId } from "../src/case/plantLayout.js";
import { sortRows } from "../src/ui/SortableTable.js";
import { PIPED } from "./plantLayoutFixture.js";

const SIZED = (stream: string, nps: number, v: number, drop: number) => ({
  id: `line:${stream}`, stream, from: "a", to: "b", service: "process",
  sizeState: "sized", length: 1, lineNps: nps, lineVelocity: v, lineDrop: drop,
});
const WITH_LINES: PlantLayout = {
  ...PIPED,
  lines: [SIZED("rawLiquid", 4, 1.5, 38000), SIZED("letdownGas", 2.5, 9.25, -1200),
          { id: "line:flashing", stream: "flashing", from: "a", to: "b", service: "process",
            sizeState: "notSized", length: 10, reason: "no flow" }],
};

describe("the docked pipe register (DEV.md 4c C91)", () => {
  it("has one row per pipe, with the id the 3D view selects by", () => {
    const rows = dockedPipeRows(WITH_LINES);
    expect(rows.map((r) => r.id)).toEqual(WITH_LINES.pipes!.map(pipeId));
    const scene = layoutScene(WITH_LINES);
    for (const r of rows) expect(scene!.pipes.some((p) => p.id === r.id)).toBe(true);
  });

  it("takes size, velocity and drop from the line sheet, in kPa, and nothing else", () => {
    const [raw, gas, unr, flash] = dockedPipeRows(WITH_LINES);
    expect(raw).toMatchObject({ nps: 4, velocity: 1.5, dropKPa: 38, sized: true });
    expect(gas).toMatchObject({ nps: 2.5, dropKPa: -1.2 });
    expect(unr).toMatchObject({ nps: null, velocity: null, dropKPa: null, sized: false });
    expect(flash).toMatchObject({ nps: null, sized: false });
  });

  it("shows no size where the case declares no lineDesign", () => {
    expect(dockedPipeRows(PIPED).every((r) => r.nps === null && r.dropKPa === null)).toBe(true);
  });

  it("sorts numerically with blanks last in both directions", () => {
    const rows = dockedPipeRows(WITH_LINES);
    const asc = sortRows(rows, (r) => r.velocity, "asc").map((r) => r.tag);
    const desc = sortRows(rows, (r) => r.velocity, "desc").map((r) => r.tag);
    expect(asc.slice(0, 2)).toEqual(["rawLiquid", "letdownGas"]);
    expect(desc.slice(0, 2)).toEqual(["letdownGas", "rawLiquid"]);
    expect(asc.slice(2).sort()).toEqual(["flashing", "unreactedGas"]);
    expect(desc.slice(2).sort()).toEqual(["flashing", "unreactedGas"]);
  });
});
