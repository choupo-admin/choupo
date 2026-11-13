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
  THE VESSEL BANKS IN 3D, from the case's REAL run output (DEV.md 4c C199
  phase B).  Held here without WebGL (the geometry description is pure):

    * every `membraneBank` sheet of swro01_campoDalias (18: RO1, RO2a, RO2b of
      six trains) is read by `readBank`, and the arithmetic the sizer states in
      its header is RECOMPUTED by hand from the sheet's own keys -- vessel
      length, rack length and width and height, the bank's envelope;
    * the vessel counts are recomputed (233/54/18 per train, 1830 in the
      plant) and equal the number of instances the model draws;
    * EVERY VESSEL IS INSIDE ITS RACK: its length inside the rack's, its
      centre inside its pitch cell, its bottom above the base and its top
      under the rack height; no two vessels of a row overlap;
    * the drawing's body stays inside the envelope the engine published and the
      scene built from the real layout carries the bank on each item;
    * the keys the reader needs are keys the SIZER publishes (read from
      MembraneBankSize.cpp), so a renamed key fails here, not on screen.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { boundsOf, equipmentDrawing } from "../src/case/equipmentModel.js";
import { parseDesignSheet } from "../src/case/designSheet.js";
import {
  BANK_COUNT_KEYS, BANK_LENGTH_KEYS, bankProblems, readBank, vesselPlaces, vesselsInRack,
  type MembraneBank,
} from "../src/case/membraneBank.js";
import { layoutScene } from "../src/case/plantLayout.js";
import { mergeNonEmpty } from "../src/ui/plotting/layoutRenderer.js";
import { loadHall } from "./hallFixture.js";
import { REPO } from "./witnessOutputs.js";

const banks = (): { id: string; b: MembraneBank }[] => {
  const hall = loadHall();
  const out: { id: string; b: MembraneBank }[] = [];
  for (const [rel, text] of Object.entries(hall.designFiles)) {
    const s = parseDesignSheet(text);
    if (!s || s.equipment !== "membraneBank") continue;
    const r = readBank(s);
    if (!r.ok) throw new Error(`${rel}: ${r.missing.join(", ")}`);
    out.push({ id: `${s.unit}/${s.item}`, b: r.bank });
  }
  return out;
};

describe("the bank sheets of swro01_campoDalias", () => {
  it("are 18, all readable, each self-consistent", () => {
    const all = banks();
    expect(all).toHaveLength(18);
    for (const { id, b } of all) expect(bankProblems(b), id).toEqual([]);
  });

  it("recompute by hand: vessel, rack and envelope from the sheet's own declared numbers", () => {
    for (const { id, b } of banks()) {
      const Lv = b.elementsPerVessel * b.elementLength + b.vesselEndAllowance;
      expect(b.vesselLength, id).toBeCloseTo(Lv, 9);
      expect(b.rackLength, id).toBeCloseTo(Lv + 2 * b.endMargin, 9);
      expect(b.rackWidth, id).toBeCloseTo(b.vesselsPerTier * b.pitch, 9);
      expect(b.rackHeight, id).toBeCloseTo(b.baseHeight + b.tiers * b.tierPitch, 9);
      expect(b.envelopeLength, id).toBeCloseTo(b.rackLength + b.loadingClearance, 9);
      expect(b.envelopeWidth, id).toBeCloseTo(b.racks * b.rackWidth + (b.racks - 1) * b.rackAisle, 9);
      expect(b.racks, id).toBe(Math.ceil(b.vessels / b.vesselsPerRack));
    }
  });

  it("count 233 / 54 / 18 vessels a train and 1830 in the plant", () => {
    const sum = (unit: string) => banks().filter((x) => x.id.startsWith(`${unit}/`))
      .reduce((a, x) => a + x.b.vessels, 0);
    expect(sum("RO1")).toBe(233 * 6);
    expect(sum("RO2a")).toBe(54 * 6);
    expect(sum("RO2b")).toBe(18 * 6);
    expect(banks().reduce((a, x) => a + x.b.vessels, 0)).toBe(1398 + 324 + 108);
  });
});

describe("EVERY VESSEL OF EVERY BANK IS INSIDE ITS RACK", () => {
  it("length, pitch cell, base height and rack height, and no two overlap", () => {
    for (const { id, b } of banks()) {
      const places = vesselPlaces(b);
      expect(places, id).toHaveLength(b.vessels);
      const R = b.vesselOutsideDiameter / 2;
      for (const p of places) {
        const rackY0 = p.rack * (b.rackWidth + b.rackAisle);
        expect(p.x - b.vesselLength / 2, id).toBeGreaterThanOrEqual(0);
        expect(p.x + b.vesselLength / 2, id).toBeLessThanOrEqual(b.rackLength + 1e-9);
        expect(p.y - R, id).toBeGreaterThanOrEqual(rackY0 - 1e-9);
        expect(p.y + R, id).toBeLessThanOrEqual(rackY0 + b.rackWidth + 1e-9);
        expect(p.z - R, id).toBeGreaterThanOrEqual(b.baseHeight - 1e-9);
        expect(p.z + R, id).toBeLessThanOrEqual(b.rackHeight + 1e-9);
      }
      //  racks hold what the sheet says: full ones and the last
      for (let r = 0; r < b.racks; r++)
        expect(places.filter((p) => p.rack === r), `${id} rack ${r}`).toHaveLength(vesselsInRack(b, r));
      //  no two vessels closer than a diameter (centres in one rack are on a grid)
      const seen = new Set(places.map((p) => `${p.rack}/${p.tier}/${p.col}`));
      expect(seen.size, id).toBe(places.length);
      expect(b.pitch, id).toBeGreaterThanOrEqual(b.vesselOutsideDiameter);
      expect(b.tierPitch, id).toBeGreaterThanOrEqual(b.vesselOutsideDiameter);
    }
  });

  it("the partial last rack of RO1 holds 41 vessels (4 racks of 48 and one of 41)", () => {
    const ro1 = banks().find((x) => x.id === "RO1/train1")!.b;
    expect(ro1.racks).toBe(5);
    expect(vesselsInRack(ro1, 0)).toBe(48);
    expect(vesselsInRack(ro1, 4)).toBe(41);
    expect(4 * 48 + 41).toBe(233);
  });
});

describe("the 3D model of a bank", () => {
  it("draws one instanced part per rack with every vessel, the body inside the published envelope", () => {
    const hall = loadHall();
    const scene = layoutScene(hall.attached);
    expect(scene).not.toBeNull();
    for (const { id, b } of banks()) {
      const s = scene!.solids.find((x) => x.id === id);
      expect(s, id).toBeDefined();
      expect(s!.bank, id).toBeDefined();
      expect(s!.size[0], id).toBeCloseTo(b.envelopeLength, 9);
      expect(s!.size[1], id).toBeCloseTo(b.envelopeHeight, 9);
      expect(s!.size[2], id).toBeCloseTo(b.envelopeWidth, 9);
      const d = equipmentDrawing(s!);
      expect(d.model, id).toBe("membraneBank");
      const inst = d.parts.filter((p) => p.prim === "instances");
      expect(inst, id).toHaveLength(b.racks);
      const n = inst.reduce((a, p) => a + (p.prim === "instances" ? p.centres.length : 0), 0);
      expect(n, id).toBe(b.vessels);
      //  the whole drawing, decoration included, stands inside the envelope
      const [lo, hi] = boundsOf(d.parts);
      for (let k = 0; k < 3; k++) {
        expect(lo[k]!, `${id} lo${k}`).toBeGreaterThanOrEqual(-s!.size[k]! / 2 - 1e-9);
        expect(hi[k]!, `${id} hi${k}`).toBeLessThanOrEqual(s!.size[k]! / 2 + 1e-9);
      }
      //  and the vessels are the body: the instanced parts are not decoration
      expect(inst.every((p) => !p.decoration), id).toBe(true);
    }
  });

  it("a vessel is a cylinder of the published outside diameter and length", () => {
    const hall = loadHall();
    const scene = layoutScene(hall.attached)!;
    const s = scene.solids.find((x) => x.id === "RO1/train1")!;
    const part = equipmentDrawing(s).parts.find((p) => p.prim === "instances")!;
    if (part.prim !== "instances") throw new Error("not instanced");
    expect(part.radius).toBeCloseTo(0.125, 12);          // vesselOutsideDiameter 0.25 m on the sheet
    expect(part.length).toBeCloseTo(7.642, 9);            // vesselLength on the sheet
    expect(part.axis).toBe("x");
  });

  it("a bank whose sheet was not read keeps the engine's box and says why in its tooltip", () => {
    const hall = loadHall();
    const scene = layoutScene(hall.layout)!;                 // no banks attached
    const s = scene.solids.find((x) => x.id === "RO1/train1")!;
    expect(s.bank).toBeUndefined();
    expect(equipmentDrawing(s).model).toBe("plain");
    expect(s.tooltip.join(" ")).toContain("bank geometry not drawn");
  });

  it("an empty merge list is not merged (the 2026-11-02 crash)", () => {
    expect(mergeNonEmpty(() => { throw new Error("must not be called"); }, [])).toBeNull();
  });
});

describe("the keys the reader needs are keys the sizer publishes", () => {
  it("every BANK key is d.set(...) in MembraneBankSize.cpp", () => {
    const src = readFileSync(join(REPO, "src/postProcessing/sizing/MembraneBankSize.cpp"), "utf-8");
    const sizerKeys = new Set([...src.matchAll(/d\.set\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]!));
    for (const k of [...BANK_COUNT_KEYS, ...BANK_LENGTH_KEYS]) expect(sizerKeys.has(k), k).toBe(true);
  });
});
