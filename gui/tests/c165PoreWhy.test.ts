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

/*---------------------------------------------------------------------------*\
  c165PoreWhy -- WHY THE PORE HELD AN ION BACK, ON SCREEN (DEV.md 4c C165).

  The engine publishes each ion's partition factors at both faces, the three
  potential steps and the pore's numerics; the GUI draws them through the
  poreTransport schema's point tables and computes nothing.  Checked here:
    (1) the further tables: per-op keys (no {p}) repeat on each point's row,
        and a table with no perIon is one row per point with no ion column;
    (2) F1 on a DSPM-DE activity word lands on the partition equation, not
        on Raoult's chapter -- and the bare word elsewhere still does;
    (3) J_v's F1 says what a higher J_v does AND that the rejection is not
        monotone in a mixture.
  Whether the published numbers are RIGHT is the engine gate's
  (bin/curate/check_pore_partition.py), not this file's.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse, toJson } from "../src/dict/index.js";
import { pointTable } from "../src/case/opPointTable.js";
import { operationMapMeta } from "../src/case/operationSchemas.js";
import { buildFine } from "../src/case/propsMap.js";
import { propsModelTheoryLink } from "../src/case/modelDocs.js";
import { keyHelp } from "../src/case/keyHelp.js";
import type { OperationResult } from "../src/adapters/SolverAdapter.js";
import { REPO } from "./witnessOutputs.js";

const NF = join(REPO, "tutorials/props/membrane/nanofiltran_geraldesAlves2008");

describe("(1) the further point tables", () => {
  const meta = operationMapMeta("poreTransport")!;
  const r: OperationResult = { name: "x", type: "poreTransport", diagnostics: {
    Jv_p1: 1e-6, Jv_p2: 5e-6,
    lambda_Na: 0.46, PhiS_Na: 0.2916, lambda_Cl: 0.3025, PhiS_Cl: 0.4865,
    partitionFeed_Na_p1: 1.51, partitionFeed_Cl_p1: 0.0189,
    partitionFeed_Na_p2: 1.62, partitionFeed_Cl_p2: 0.0177,
    psiDonnanFeed_V_p1: -0.0586, psiDonnanFeed_V_p2: -0.0587, poreTolerance: 1e-12,
    poreResidual_p1: 6e-14,
  }, units: { lambda_Na: "-", psiDonnanFeed_V_p1: "V" } };
  it("the type declares two of them after the first", () => {
    expect(meta.pointTables?.length).toBe(2);
  });
  it("partition: one row per (point, ion); a per-op number repeats on every point", () => {
    const t = pointTable(meta.pointTables![0], r)!;
    expect(t.perIon).toBe(true);
    expect(t.rows.map((x) => `${x.point}${x.ion}`)).toEqual(["1Na", "1Cl", "2Na", "2Cl"]);
    const lam = t.columns.findIndex((c) => c.label === "lambda");
    expect(t.rows[0]!.cells[lam]).toBe(0.46);
    expect(t.rows[2]!.cells[lam]).toBe(0.46);
    const kf = t.columns.findIndex((c) => c.label === "c_pore(0)/c_wall");
    expect(t.rows[3]!.cells[kf]).toBe(0.0177);
  });
  it("potentials and numerics: one row per point, no ion column, nothing computed", () => {
    const t = pointTable(meta.pointTables![1], r)!;
    expect(t.perIon).toBe(false);
    expect(t.rows.map((x) => x.point)).toEqual([1, 2]);
    const jump = t.columns.findIndex((c) => c.label === "feed Donnan jump");
    expect(t.columns[jump]!.unit).toBe("V");
    expect(t.rows[1]!.cells[jump]).toBe(-0.0587);
    const tol = t.columns.findIndex((c) => c.label === "tolerance");
    expect(t.rows.map((x) => x.cells[tol])).toEqual([1e-12, 1e-12]);
    const res = t.columns.findIndex((c) => c.label === "||F||");
    expect(t.rows[1]!.cells[res]).toBeNull();          // not published: empty, never guessed
  });
});

describe("(2) F1 on a DSPM-DE activity word", () => {
  const raw: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== "postProcessing") walk(p); }
      else raw[relative(NF, p)] = readFileSync(p, "utf-8");
    }
  };
  walk(join(NF, "system"));
  walk(join(NF, "constant"));
  const propsDict = toJson(parse(raw["system/propsDict"]!));
  const thermo = toJson(parse(raw["constant/thermoPhysPropDict"]!));
  const { nodes } = buildFine({ propsDict, thermo, rawFiles: raw });
  const urlOf = (id: string) => {
    const t = nodes.get(id)?.member.target;
    return t && t.kind === "guide" ? t.url : "";
  };
  it("`ideal` inside poreTransport opens the partition equation", () => {
    expect(urlOf("model:activity:ideal")).toMatch(/nameddest=eq%3Adspmde-partition/);
  });
  it("`bulkOverPoreDavies` too: the ratio it chooses enters the partition", () => {
    expect(urlOf("model:activity:bulkOverPoreDavies")).toMatch(/nameddest=eq%3Adspmde-partition/);
  });
  it("the bare word `ideal` (a package's activity slot) still opens Raoult's chapter", () => {
    expect(propsModelTheoryLink("ideal")).toMatch(/nameddest=ch%3Aideal-mixing/);
  });
});

describe("(3) J_v's F1", () => {
  it("names the Peclet number and warns that the rejection is not monotone in a mixture", () => {
    const pd = readFileSync(join(NF, "system/propsDict"), "utf-8");
    const line = pd.split("\n").findIndex((l) => /^\s*J_v\s+\(\s*1e-6/.test(l)) + 1;
    const h = keyHelp("system/propsDict", pd, line, { propsDict: toJson(parse(pd)) });
    expect(h.key).toBe("J_v");
    expect(h.description).toMatch(/Peclet number/);
    expect(h.description).toMatch(/not\s+monotone/);
    expect(h.description).not.toMatch(/rejection rises/i);
  });
});
