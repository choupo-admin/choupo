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
/* C479: a bank of identical parallel vessels is ONE row of the equipment table
   (presentation only); the number of items and the capital are the rows'. */
import { describe, expect, it } from "vitest";
import { collapseBanks } from "../src/case/equipmentBanks.js";
import type { EquipmentItem } from "../src/adapters/SolverAdapter.js";

const vessel = (k: number, tagNo: string): EquipmentItem => ({
  unit: "H2Buffer", item: `H2Buffer/vessel${k}`, tag: `vessel${k}`, tagNo,
  type: "vessel", material: "carbonSteel",
  values: { V_R: 362.3, nVessels: 3 },
  cost: { totalModule: 100 } as EquipmentItem["cost"],
});

describe("collapseBanks", () => {
  it("collapses identical parallel vessels into one row with the bank's capital", () => {
    const rows = [vessel(1, "V-105A"), vessel(2, "V-105B"), vessel(3, "V-105C"),
      { unit: "FEHE", item: "FEHE", type: "shellTubeHX", material: "SS316", values: { A: 1 } } as EquipmentItem];
    const out = collapseBanks(rows);
    expect(out.length).toBe(2);
    expect(out[0]!.n).toBe(3);
    expect(out[0]!.tagRange).toBe("V-105A–C");
    expect(out[0]!.total).toBe(300);
    expect(out[1]!.n).toBe(1);
  });
  it("leaves rows that differ alone", () => {
    const a = vessel(1, "V-105A"); const b = vessel(2, "V-105B");
    b.values = { ...b.values, V_R: 400 };
    expect(collapseBanks([a, b]).map((x) => x.n)).toEqual([1, 1]);
  });
});
