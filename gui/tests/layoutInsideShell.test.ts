// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
/*  THE STREAMS INSIDE A PLACED SHELL ARE SAID IN THE PIPE REGISTER (2026-11-25).

    The engine lists a stream whose two ends are units inside the same placed
    shell (a converter's catalyst beds) in `layout.insideShell`: no pipe, and
    no reason to be "not routed".  The register used to ignore the list, so
    four of the reference plant's streams appeared nowhere.  Held: the adapter
    carries the list, the register says it in ONE line per shell with the
    sector prefix dropped from the stream names, a result with none adds no
    line, and a layout with only such streams still has a register.  The
    fixture is the converter's four streams of greenAmmoniaPEQ_baseCase (a run
    of 2026-11-25). */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import { pipeRegister } from "../src/case/layoutTables.js";
import { LAYOUT } from "./plantLayoutFixture.js";

const INSIDE = [
  { stream: "CONVERTER.Bed1Out",  item: "CONVERTER/shell", fromUnit: "CONVERTER.Bed1", toUnit: "CONVERTER.HX12" },
  { stream: "CONVERTER.Bed2Feed", item: "CONVERTER/shell", fromUnit: "CONVERTER.HX12", toUnit: "CONVERTER.Bed2" },
  { stream: "CONVERTER.Bed2Out",  item: "CONVERTER/shell", fromUnit: "CONVERTER.Bed2", toUnit: "CONVERTER.HX23" },
  { stream: "CONVERTER.Bed3Feed", item: "CONVERTER/shell", fromUnit: "CONVERTER.HX23", toUnit: "CONVERTER.Bed3" },
];
const WITH: PlantLayout = { ...LAYOUT, pipes: [], notRouted: [], insideShell: INSIDE };

describe("streams inside a placed shell (layout.insideShell)", () => {
  it("the adapter carries the list, and omits it when the engine wrote none", () => {
    const log = (l: unknown) => `${BEGIN_MARK}\n${JSON.stringify({ streams: {}, layout: l })}\n${END_MARK}\n`;
    const out = extractStructured(log(WITH), { thermoPackage: {}, controlDict: {} });
    expect(out.layout!.insideShell!.map((n) => n.stream))
      .toEqual(INSIDE.map((n) => n.stream));
    expect(out.layout!.insideShell![0]!.item).toBe("CONVERTER/shell");
    const none = extractStructured(log({ ...LAYOUT, insideShell: [] }),
                                   { thermoPackage: {}, controlDict: {} });
    expect(none.layout!.insideShell).toBeUndefined();
  });

  it("the register says them in ONE line, names without the sector prefix", () => {
    const reg = pipeRegister(WITH)!;
    expect(reg).not.toBeNull();
    expect(reg.insideShell).toHaveLength(1);
    expect(reg.insideShell[0]!.item).toBe("CONVERTER/shell");
    expect(reg.insideShell[0]!.line).toBe(
      "Inside the shell CONVERTER/shell (no pipe: both ends are units it holds):"
      + " Bed1Out, Bed2Feed, Bed2Out, Bed3Feed");
    //  they are no missing pipe
    expect(reg.notRouted).toEqual([]);
  });

  it("a layout with none adds no line", () => {
    const reg = pipeRegister({ ...LAYOUT, notRouted: [{ stream: "s", reason: "r" }] })!;
    expect(reg.insideShell).toEqual([]);
  });
});
