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
  C264 -- what a pharmaceutical-engineering student walking donepezil02 in
  the browser needed, and the GUI now draws from the ENGINE:

    * the year's utilities: the economics' own C_UT on the economics' own
      hours, never an hourly total times 8000 h of the GUI's;
    * the plan's BASES (300 kg declared, 305.9 kg of product, the balance's
      rate, 168 equivalent hours, each train's year and its 3840 h) as the
      engine published them, kept in order, a line without a number dropped;
    * the DOSAGE FORM (mg of each ingredient per tablet, per strength);
    * the phase word of a stream with a solid and a fluid: "solid + liquid",
      the engine's two phase names, not "slurry", a regime nobody decided;
    * the two different marks: ▲ least capacity margin (a machine), ◆
      limiting stage (sets T_L).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { shapeBatchPlan } from "../src/adapters/batchPlanPayload.js";
import { annualUtilitiesLine } from "../src/case/annualBasis.js";
import { PHASE_LABEL, classifyPhase } from "../src/ui/plotting/palette.js";
import { REPO } from "./witnessOutputs.js";

const plan = (extra: Record<string, unknown>) => ({
  summary: { id: "batchPlan", product: "packagedTablets", productRate: 206.88,
             productPerYear: 34828, lotRule: "declared", lotSize: 305.85, lotsPerYear: 115,
             production: 35173, equivalentHours: 168.35, streamFactor: 0.0192,
             unplannedUnits: [] },
  trains: [{ id: "train:T", name: "T", limitingStage: "A", availableTime: 3840,
             lotsPerCampaign: 8, changeover: 24, cycleTime: 11, campaigns: 15,
             campaignSpan: 100, campaignDuration: 124, requiredTime: 2079, occupancy: 0.54,
             stages: ["A"] }],
  stages: [{ id: "stage:A", name: "A", train: "T", type: "batch", holds: "x", feeds: "",
             limiting: "yes", dischargeFrom: "", massRate: 1, massPerProduct: 1,
             massPerLot: 300, inPhase: 1, outOfPhase: 1, unitsInstalled: 1,
             chargeTime: 1, processTime: 8, dischargeTime: 1, cleanTime: 1, cycleTime: 11,
             effectiveCycle: 11, utilisation: 1, offset: 0, busyHours: 2000,
             occupancy: 0.52, idleHours: 1840, units: ["u"] }],
  gantt: [], findings: [], ...extra,
});

describe("C264: the year's utilities are the engine's", () => {
  it("draws C_UT on the economics' hours and names where the hours came from", () => {
    const line = annualUtilitiesLine({
      currency: "EUR", operatingHours: 168.349, operatingHoursFrom: "batchPlan",
      utilityBill: 1051.42,
    } as never);
    expect(line).toContain("C_UT = 1,051 €/yr");
    expect(line).toContain("H = 168.35 h/yr");
    expect(line).toContain("batch plan's equivalent flowsheet hours");
    expect(line).not.toContain("8000");
  });
  it("without an economics there is no annual figure, and it says so", () => {
    expect(annualUtilitiesLine(undefined)).toMatch(/No annual figure/);
  });
  it("the Reports source multiplies by no hour count of its own", () => {
    const src = readFileSync(join(REPO, "gui/src/ui/ReportsWorkspace.tsx"), "utf-8");
    expect(src).not.toMatch(/\*\s*8000/);
    expect(src).not.toMatch(/\*\s*8760/);
  });
});

describe("C264: the bases and the dosage form, as published", () => {
  const bp = shapeBatchPlan(plan({
    bases: [
      { id: "basis:lot", amount: 300, unit: "kg of finalBlend", label: "declared lot",
        home: "batchPlan.lotStreamMass", definition: "declared" },
      { id: "basis:lotProduct", amount: 305.85, unit: "kg of packagedTablets",
        label: "the lot's product mass", home: "batchPlan.lotSize", definition: "B = ..." },
      { id: "basis:broken", amount: null, unit: "h", label: "x", home: "y", definition: "z" },
    ],
    dosage: [
      { id: "dosage:packagedTablets", product: "packagedTablets", unitName: "tablet",
        unitMass: 0.00029023, unitsPerLot: 1053826, unitsPerYear: 90629056,
        demandUnitsPerYear: 9e7, unitsPerHourOfBalance: 712812, fluidMassFraction: 0.0063,
        source: "s", reason: "r" },
      { id: "dosage:packagedTablets:donepezilHydrochloride", product: "packagedTablets",
        component: "donepezilHydrochloride", massFraction: 0.0345, perUnit: 9.9998e-6,
        perLot: 10.54, solidFraction: 1 },
      { id: "dosage:packagedTablets:water", product: "packagedTablets", component: "water",
        massFraction: 0.0063, perUnit: 1.835e-6, perLot: 1.93, solidFraction: 0 },
    ],
  }))!;
  it("keeps the engine's lines in order and drops one without a number", () => {
    expect(bp.bases.map((b) => b.key)).toEqual(["lot", "lotProduct"]);
    expect(bp.bases[1]!.home).toBe("batchPlan.lotSize");
  });
  it("groups each ingredient under its product's unit", () => {
    expect(bp.dosage).toHaveLength(1);
    const d = bp.dosage[0]!;
    expect(d.unitName).toBe("tablet");
    expect(d.ingredients.map((x) => x.component)).toEqual(["donepezilHydrochloride", "water"]);
    expect(d.ingredients[0]!.perUnit * 1e6).toBeCloseTo(10, 3);
  });
  it("an older payload with neither block shapes to empty lists", () => {
    const old = shapeBatchPlan(plan({}))!;
    expect(old.bases).toEqual([]);
    expect(old.dosage).toEqual([]);
  });
});

describe("C264: words the student reads", () => {
  it("a stream with a solid and a fluid is 'solid + liquid', never 'slurry'", () => {
    const k = classifyPhase({ F: 1, F_mass: 1, F_solid_mass: 0.99, vf: 0 });
    expect(PHASE_LABEL[k]).toBe("solid + liquid");
    expect(Object.values(PHASE_LABEL)).not.toContain("slurry");
  });
  it("the machine table and the plan use two different marks and two names", () => {
    const mt = readFileSync(join(REPO, "gui/src/ui/MachineUtilisationTable.tsx"), "utf-8");
    const bps = readFileSync(join(REPO, "gui/src/ui/BatchPlanSection.tsx"), "utf-8");
    expect(mt).toContain("least capacity margin");
    expect(mt).toContain("▲");
    expect(mt).not.toMatch(/bottleneck/i);
    expect(bps).toContain("limiting stage (sets T_L)");
    expect(bps).not.toMatch(/bottleneck/i);
  });
});
