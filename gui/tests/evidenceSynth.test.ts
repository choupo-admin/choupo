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
  evidenceSynth -- the Evidence view's candidates, run plan and reading
  (DEV.md 4c C117).  The pure half of the view: what is sent to the engine
  and what is done with its answer.  Three claims:

    1. the candidate list for methanol + water is what the tree holds TODAY
       (measured, not assumed): the standards NRTL record, UNIFAC, ideal --
       and the curate04 copy becomes a DISTINCT second NRTL when the case is
       open;
    2. the plan asks the engine AT the measured x (a `points` list in the
       dataset's own order, at the dataset's own pressure), one op per
       isobar, with the candidate's parameters INLINE;
    3. the reading subtracts and averages, and does nothing else.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { CATALOGUE } from "../src/case/catalogue.js";
import { evidenceForPair, type EvidenceDataset } from "../src/case/evidence.js";
import {
  evidenceCandidates, evidenceResults, evidenceRunPlan,
} from "../src/case/evidenceSynth.js";
import { PAIRS } from "../src/case/pairsCatalogue.js";

const PAIR: [string, string] = ["methanol", "water"];
const JCT = "10.1016/j.jct.2009.11.020";
const JE = "10.1021/je200341c";

function sets(): EvidenceDataset[] { return evidenceForPair(...PAIR); }

describe("candidates for methanol + water", () => {
  it("are the pair records of every tier, UNIFAC and ideal -- as the tree stands", () => {
    const ids = evidenceCandidates(PAIR, CATALOGUE).map((c) => c.id);
    expect(ids).toContain("NRTL@standards");
    expect(ids).toContain("UNIFAC");
    expect(ids[ids.length - 1]).toBe("ideal");
    //  MEASURED 2026-10-20: no UNIQUAC or Wilson record for the pair in standards
    expect(ids.some((i) => i.startsWith("UNIQUAC@") || i.startsWith("Wilson@"))).toBe(false);
    //  no COSMO-SAC: the public catalogue installs no sigma profile
    expect(ids).not.toContain("cosmoSAC");
    //  the standards NRTL candidate carries the record's parameters INLINE
    const nrtl = evidenceCandidates(PAIR, CATALOGUE).find((c) => c.id === "NRTL@standards")!;
    const bp = nrtl.activityModel.binaryParameters as Record<string, Record<string, unknown>>;
    expect(nrtl.activityModel.model).toBe("NRTL");
    expect(bp["methanol-water"]!.i).toBe("methanol");
    expect(typeof bp["methanol-water"]!.b_ij).toBe("number");
    expect(nrtl.label).toMatch(/^NRTL \(standards/);
  });

  it("the open case's mirrored record is a SECOND, distinct NRTL candidate", () => {
    const std = PAIRS.find((p) => p.model === "NRTL" && p.stem === "methanol-water")!;
    const copy = `components ( methanol water ); model NRTL;
parameters { i methanol; j water; a_ij 0; b_ij ${std.parameters.b_ij}; a_ji 0; b_ji ${std.parameters.b_ji}; alpha 0.3; }
provenance { origin fitted; reviewStatus interim; fittedInCase "tutorials/props/curation/curate04_nrtl_methanol_water"; }`;
    const ids = evidenceCandidates(PAIR, CATALOGUE, { "constant/parameters/NRTL/methanol-water.dat": copy })
      .map((c) => c.id);
    expect(ids.filter((i) => i.startsWith("NRTL@"))).toEqual(["NRTL@standards", "NRTL@case"]);
  });

  it("two refits of one model in one tier get the stem in their id", () => {
    const rec = (b: number) => `components ( methanol water ); model NRTL;
parameters { i methanol; j water; a_ij 0; b_ij ${b}; a_ji 0; b_ji 1; alpha 0.3; }`;
    const ids = evidenceCandidates(PAIR, CATALOGUE, {
      "constant/parameters/NRTL/methanol-water.dat": rec(100),
      "constant/parameters/NRTL/methanol-water.r2.dat": rec(200),
    }).map((c) => c.id);
    expect(ids).toContain("NRTL@case#methanol-water");
    expect(ids).toContain("NRTL@case#methanol-water.r2");
  });
});

describe("the run plan asks AT the measured conditions", () => {
  const cands = evidenceCandidates(PAIR, CATALOGUE);
  const nrtl = cands.find((c) => c.id === "NRTL@standards")!;

  it("one points op per isobar, the dataset's x in its own order, the curve under it", () => {
    const je = sets().find((d) => d.provenance.doi === JE)!;
    const plan = evidenceRunPlan(PAIR, [je], nrtl);
    expect(plan.xComponent).toBe("methanol");
    expect(plan.partner).toBe("water");
    expect(plan.skipped).toEqual([]);
    const pts = plan.ops.filter((o) => o.kind === "points");
    const curves = plan.ops.filter((o) => o.kind === "curve");
    expect(pts.length).toBe(1);
    expect(curves.length).toBe(1);
    expect(pts[0]!.P).toBeCloseTo(101320, 3);
    expect(pts[0]!.xs).toEqual(je.rows.map((r) => r[0]));
    expect(pts[0]!.xs![0]).toBeCloseTo(0.005, 12);
    //  the synthesised op carries the points list, NOT a grid
    const ops = plan.files.propsDict!.operations as Array<Record<string, unknown>>;
    const vary = ops[0]!.vary as Record<string, unknown>;
    expect(vary.variable).toBe("x[methanol]");
    expect(vary.points).toEqual(pts[0]!.xs);
    expect(vary.from).toBeUndefined();
    const varyC = ops[ops.length - 1]!.vary as Record<string, unknown>;
    expect(varyC.n).toBe(51);
    expect(varyC.points).toBeUndefined();
    //  the candidate's parameters are INLINE in the thermo dict
    const tp = plan.files.thermoPackage as Record<string, unknown>;
    const liquid = (tp.equilibrium as Record<string, Record<string, unknown>>).liquid!;
    expect((liquid.activityModel as Record<string, unknown>).model).toBe("NRTL");
    expect((liquid.activityModel as Record<string, unknown>).binaryParameters).toBeDefined();
    expect(tp.components).toEqual(["methanol", "water"]);
    expect(plan.files.controlDict!.application).toBe("choupoProps");
  });

  it("a six-isobar set becomes six points ops and six curves; two sets share an isobar count", () => {
    const jct = sets().find((d) => d.provenance.doi === JCT)!;
    const je = sets().find((d) => d.provenance.doi === JE)!;
    const plan = evidenceRunPlan(PAIR, [jct, je], nrtl);
    const pts = plan.ops.filter((o) => o.kind === "points");
    const curves = plan.ops.filter((o) => o.kind === "curve");
    expect(pts.length).toBe(7);         // 6 isobars + the held-out's one
    expect(curves.length).toBe(7);      // 101.32 kPa is not among jct's six
    expect(pts.reduce((n, o) => n + o.xs!.length, 0)).toBe(54 + 13);
    expect(curves.map((c) => c.P)).toEqual([...curves.map((c) => c.P)].sort((a, b) => a - b));
  });

  it("re-expresses a dataset measured in the OTHER component's x as 1 - x", () => {
    const je = sets().find((d) => d.provenance.doi === JE)!;
    const flipped: EvidenceDataset = {
      ...je, id: "flipped",
      columns: je.columns.map((c) => (c.name === "x[methanol]" ? { ...c, name: "x[water]" } : c)),
      rows: je.rows.map((r) => [1 - r[0]!, r[1]!, r[2]!]),
    };
    const plan = evidenceRunPlan(PAIR, [je, flipped], nrtl);
    const pts = plan.ops.filter((o) => o.kind === "points");
    expect(plan.xComponent).toBe("methanol");
    expect(pts[1]!.xs![0]).toBeCloseTo(pts[0]!.xs![0]!, 12);
  });

  it("a dataset without a pressure or without T_bubble is skipped with its reason, never invented", () => {
    const je = sets().find((d) => d.provenance.doi === JE)!;
    const noP: EvidenceDataset = { ...je, id: "noP", heldPressurePa: null };
    const noT: EvidenceDataset = { ...je, id: "noT", property: "binaryVLE.P_bubble",
      columns: je.columns.map((c) => (c.name === "T_bubble" ? { ...c, name: "P_bubble" } : c)) };
    const plan = evidenceRunPlan(PAIR, [noP, noT], nrtl);
    expect(plan.ops.filter((o) => o.kind === "points").length).toBe(0);
    expect(plan.skipped.map((s) => s.datasetId)).toEqual(["noP", "noT"]);
    expect(plan.skipped[0]!.reason).toMatch(/declare no pressure/);
    expect(plan.skipped[1]!.reason).toMatch(/no T_bubble column/);
  });
});

describe("the reading subtracts and averages, nothing else", () => {
  it("residual = engine - measurement at each row; AAD = mean |residual|; nan excluded and counted", () => {
    const je = sets().find((d) => d.provenance.doi === JE)!;
    const nrtl = evidenceCandidates(PAIR, CATALOGUE).find((c) => c.id === "NRTL@standards")!;
    const plan = evidenceRunPlan(PAIR, [je], nrtl);
    const op = plan.ops.find((o) => o.kind === "points")!;
    //  a synthetic engine answer: measurement + 0.5 K everywhere, one nan
    const lines = ["x[methanol],T_bubble,y_eq_methanol"];
    op.rows!.forEach((r, k) => {
      const T = k === 3 ? "nan" : String(je.rows[r]![1]! + 0.5);
      lines.push(`${op.xs![k]},${T},${je.rows[r]![2]}`);
    });
    const curve = plan.ops.find((o) => o.kind === "curve")!;
    const res = evidenceResults(plan, [je], {
      [op.file]: lines.join("\n") + "\n",
      [curve.file]: "x[methanol],T_bubble,y_eq_methanol\n0,373,0\n1,338,1\n",
    });
    expect(res.missing).toEqual([]);
    expect(res.curves.length).toBe(1);
    expect(res.curves[0]!.T).toEqual([373, 338]);
    const d = res.byDataset[0]!;
    expect(d.nMeasured).toBe(13);
    expect(d.nUsed).toBe(12);
    expect(d.aadK).toBeCloseTo(0.5, 9);
    expect(d.biasK).toBeCloseTo(0.5, 9);
    expect(d.aadRelPct).toBeGreaterThan(0.1);
    expect(d.aadRelPct).toBeLessThan(0.2);
    expect(d.points[3]!.residualK).toBeNull();
    expect(d.points[0]!.residualK).toBeCloseTo(0.5, 9);
    expect(d.points[0]!.uncertaintyK).toBeCloseTo(0.42, 9);   // the dataset's own U95 of row 0
    expect(d.points[0]!.measuredY).toBeCloseTo(0.024, 9);
  });

  it("an op whose CSV did not come back is named as missing", () => {
    const je = sets().find((d) => d.provenance.doi === JE)!;
    const ideal = evidenceCandidates(PAIR, CATALOGUE).find((c) => c.id === "ideal")!;
    const plan = evidenceRunPlan(PAIR, [je], ideal);
    const res = evidenceResults(plan, [je], undefined);
    expect(res.missing.sort()).toEqual(plan.ops.map((o) => o.name).sort());
    expect(res.byDataset).toEqual([]);
  });
});
