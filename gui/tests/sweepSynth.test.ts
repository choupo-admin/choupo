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

// The focus-tab playground's sweep synthesizer: the outerDict it emits must
// (a) match the SweepDriver grammar (flash06_sweep_T is the reference),
// (b) round-trip exactly through the dict serializer + parser (so the WASM
//     adapter ships the same dict the "copy outerDict" button shows), and
// (c) synthesise honest responses (unit KPIs first, outlet-stream fields as
//     the fallback, dotted names skipped -- SweepDriver splits at the FIRST
//     dot and cannot address them).

import { describe, expect, it } from "vitest";

import { dictEquals, fromJson, parse, serialize, toJson } from "../src/dict/index.js";
import {
  numericOperationKeys,
  operationOverrides,
  overrideDictText,
  sweepCsvName,
  sweepOuterDictText,
  sweepResponses,
  synthesizeSweepOuterDict,
  type SweepSpec,
} from "../src/case/sweepSynth.js";

const spec: SweepSpec = {
  key: "T",
  from: 360,
  to: 385,
  nPoints: 26,
  responses: ["flash01.V_over_F", "flash01.Q_kW"],
};

describe("sweep outerDict synthesis", () => {
  it("matches the flash06_sweep_T grammar (type/parameter/responses/report)", () => {
    const d = synthesizeSweepOuterDict(spec);
    expect(d.type).toBe("sweep");
    const p = d.parameter as Record<string, unknown>;
    expect(p.target).toBe("units[0].operation.T");
    expect(p.range).toEqual([360, 385]);
    expect(p.nPoints).toBe(26);
    expect(d.responses).toEqual(["flash01.V_over_F", "flash01.Q_kW"]);
    const r = d.report as Record<string, unknown>;
    expect(r.format).toBe("csv");
    expect(r.file).toBe("sweep_T.csv");
    expect(sweepCsvName("T")).toBe("sweep_T.csv");
  });

  it("emits the exact dict text the engine reads (key lines present)", () => {
    const text = sweepOuterDictText(spec);
    expect(text).toContain("type    sweep;");
    expect(text).toContain("target    units[0].operation.T;");
    expect(text).toContain("range    ( 360 385 );");
    expect(text).toContain("nPoints    26;");
    expect(text).toContain("responses    ( flash01.V_over_F flash01.Q_kW );");
    expect(text).toContain("file    sweep_T.csv;");
  });

  it("round-trips through the serializer + parser (AST-exact)", () => {
    const ast = fromJson(synthesizeSweepOuterDict(spec), "outerDict");
    const round = parse(serialize(ast));
    expect(dictEquals(round, ast)).toBe(true);
    // And the JSON view survives too (what CaseFiles carries).
    expect(toJson(round)).toEqual(synthesizeSweepOuterDict(spec));
  });

  it("an empty responses list still serializes to the legal `( );` form", () => {
    const d = synthesizeSweepOuterDict({ ...spec, responses: [] });
    const text = serialize(fromJson(d, "outerDict"));
    expect(text).toContain("responses    ( );");
    // SweepDriver accepts an empty `( );` (parsed as an empty word list).
    const round = parse(text);
    expect(toJson(round).responses).toEqual([]);
  });
});

describe("sweep responses synthesis", () => {
  it("prefers the unit's numeric KPIs, prefixed unitName., sorted", () => {
    const r = sweepResponses("flash01",
      { V_over_F: 0.4, Q_kW: -12.3, F_alpha: 0.01 }, ["liq", "vap"]);
    expect(r).toEqual(["flash01.F_alpha", "flash01.Q_kW", "flash01.V_over_F"]);
  });

  it("drops the raw-watts Q when its Q_kW twin is present (same number)", () => {
    const r = sweepResponses("flash01", { Q: -12300, Q_kW: -12.3 }, []);
    expect(r).toEqual(["flash01.Q_kW"]);
  });

  it("falls back to outlet-stream F and T when no KPIs are known", () => {
    expect(sweepResponses("flash01", null, ["liq", "vap"]))
      .toEqual(["liq.F", "liq.T", "vap.F", "vap.T"]);
    expect(sweepResponses("flash01", {}, ["liq"]))
      .toEqual(["liq.F", "liq.T"]);
  });

  it("skips dotted names (SweepDriver splits responses at the FIRST dot)", () => {
    // Dotted unit name -> KPIs unaddressable -> stream fallback.
    expect(sweepResponses("plant.flash", { V_over_F: 0.4 }, ["liq"]))
      .toEqual(["liq.F", "liq.T"]);
    // Dotted stream names skipped; may legally end up empty.
    expect(sweepResponses("plant.flash", null, ["SEC.liq"])).toEqual([]);
  });

  it("ignores non-finite KPI values", () => {
    const r = sweepResponses("u", { good: 1, bad: NaN }, []);
    expect(r).toEqual(["u.good"]);
  });
});

describe("operation overrides (editable scalars)", () => {
  it("lists numeric keys of the operation block as sweepable", () => {
    expect(numericOperationKeys({ T: 370, P: 101325, mode: "auto", n: NaN }))
      .toEqual(["T", "P"]);
    expect(numericOperationKeys(undefined)).toEqual([]);
  });

  it("diffs current vs pristine, scalars only", () => {
    const o = operationOverrides(
      { T: 375, P: 101325, mode: "fast", lst: [1, 2] },
      { T: 370, P: 101325, mode: "auto", lst: [1, 2] },
    );
    expect(o).toEqual([
      { key: "T", from: 370, to: 375 },
      { key: "mode", from: "auto", to: "fast" },
    ]);
    expect(operationOverrides({ T: 370 }, { T: 370 })).toEqual([]);
  });

  it("emits the override as the operation{} lines a student would write", () => {
    const text = overrideDictText([
      { key: "T", from: 370, to: 375 },
      { key: "mode", from: "auto", to: "fast" },
    ]);
    expect(text).toContain("operation");
    expect(text).toContain("T    375;");
    expect(text).toContain("mode    fast;");
    // Round-trips through the parser like any dict fragment.
    const round = toJson(parse(text));
    expect(round).toEqual({ operation: { T: 375, mode: "fast" } });
  });
});
