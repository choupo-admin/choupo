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
  THE 2D DRAWING SET OF A REVERSE-OSMOSIS HALL and the schematic of one train,
  built from the case's REAL run output (DEV.md 4c C199 phase B).  What each
  test recomputes is named in its title.  Nothing here is a transcription: the
  42 sheets and the structured result are generated from this tree's engine
  (tests/witnessOutputs.ts).
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { parseDesignSheet } from "../src/case/designSheet.js";
import {
  PROVENANCE_INK, PROVENANCE_WORD, hasSchematic, trainRoles, trainSchematicSvg,
} from "../src/case/equipmentSchematic.js";
import { allSheets, bankReads, hallSet, trainIndices, trainSheets } from "../src/case/hallSet.js";
import { headersOf, readBank, readHeader, vesselsInRack } from "../src/case/membraneBank.js";
import { rackElevationSvg, rackSectionSvg, hallPlanSvg } from "../src/case/roHallDrawings.js";
import { sheetItemId } from "../src/case/withBanks.js";
import { loadHall } from "./hallFixture.js";

const num = (re: RegExp, s: string): number[] => [...s.matchAll(re)].map((m) => Number(m[1]));
const count = (s: string, needle: string): number => s.split(needle).length - 1;

/** Every dimension group of an SVG: its id, provenance, and whether BOTH
 *  channels are present (the ink of the provenance and its word). */
function dimGroups(svg: string): { id: string; who: keyof typeof PROVENANCE_INK; inkOk: boolean; wordOk: boolean }[] {
  const out: ReturnType<typeof dimGroups> = [];
  for (const m of svg.matchAll(/<g data-dim="([^"]+)" data-who="(\w+)" stroke="(#[0-9a-f]{6})"[^>]*>([\s\S]*?)<\/g>/g)) {
    const who = m[2] as keyof typeof PROVENANCE_INK;
    out.push({ id: m[1]!, who, inkOk: m[3] === PROVENANCE_INK[who],
      wordOk: m[4]!.includes(`(${PROVENANCE_WORD[who]})`) });
  }
  return out;
}

const hall = () => loadHall();
const set = (want = {}) => hallSet(hall().designFiles, hall().attached, hall().building, want)!;

describe("the run's sheets resolve into six trains", () => {
  it("42 train sheets, six trains, seven roles in each", () => {
    const sheets = allSheets(hall().designFiles);
    expect(trainIndices(sheets)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let k = 1; k <= 6; k++) {
      const mine = trainSheets(sheets, k);
      expect(mine).toHaveLength(7);
      const { roles, unresolved } = trainRoles(mine);
      expect(unresolved, `train ${k}`).toEqual([]);
      //  the roles are found by their streams, and agree with the case's wiring
      expect(roles.ro1!.unit).toBe("RO1");
      expect(roles.ro2a!.unit).toBe("RO2a");
      expect(roles.ro2b!.unit).toBe("RO2b");
      expect(roles.px!.unit).toBe("PX");
      expect(roles.booster!.unit).toBe("Booster");
      expect(roles.pass2Pump!.unit).toBe("Pass2Pump");
      expect(roles.hpPump!.unit).toBe("HPpump");
    }
  });
});

describe("the train schematic", () => {
  const train = () => trainSchematicSvg(trainSheets(allSheets(hall().designFiles), 1));

  it("letters the counts the train's own sheets carry", () => {
    const d = train();
    expect(d.unresolved).toEqual([]);
    for (const w of ["233 vessels x 7 elements", "54 vessels x 7 elements", "18 vessels x 7 elements",
                     "6 devices", "RO1 (first pass)", "RO2a (2nd pass)", "RO2b (2nd pass)"])
      expect(d.svg, w).toContain(w);
    //  racks: 5 / 2 / 1 of 4 tiers x 12 / 3 tiers x 6? -- read from the sheets themselves
    const sheets = trainSheets(allSheets(hall().designFiles), 1);
    for (const s of sheets.filter((x) => x.equipment === "membraneBank")) {
      const b = readBank(s);
      if (!b.ok) throw new Error("bank");
      expect(d.svg, s.unit).toContain(`${b.bank.racks} rack(s) of ${b.bank.tiers} tiers x ${b.bank.vesselsPerTier}`);
    }
  });

  it("flows per train are the unit's plant streams divided by the declared trains", () => {
    const d = train();
    const ro1 = parseDesignSheet(hall().designFiles["design/RO1/train1"]!)!;
    const mdot = ro1.inlets[0]!.mdot!;
    const perTrain = Number((mdot * 3.6 / 6).toPrecision(4));
    expect(d.svg).toContain(`feed ${perTrain} t/h per train`);
  });

  it("every number carries its provenance in ink AND word", () => {
    const d = train();
    for (const who of ["choupo", "declared", "unit"] as const) {
      expect(d.svg).toContain(`(${PROVENANCE_WORD[who]})`);
      expect(d.svg).toContain(PROVENANCE_INK[who]);
    }
  });

  it("a train whose roles do not resolve draws a labelled box naming them", () => {
    const only = trainSheets(allSheets(hall().designFiles), 1).filter((s) => s.equipment === "pressureExchanger");
    const d = trainSchematicSvg(only);
    expect(d.unresolved.length).toBeGreaterThan(0);
    expect(d.svg).toContain("not drawn");
    expect(d.svg).toContain("first-pass banks");
  });

  it("is dispatched on the sheet's equipment word", () => {
    expect(hasSchematic("membraneBank")).toBe(true);
    expect(hasSchematic("vessel")).toBe(false);
  });
});

describe("the section through a rack bay", () => {
  it("draws every vessel of the rack, in the published proportions", () => {
    const hs = set();
    const b = bankReads(allSheets(hall().designFiles)).get(hs.pick.bankId)!;
    if (!b.ok) throw new Error("bank");
    const d = hs.section!;
    expect(count(d.svg, 'data-vessel="1"')).toBe(vesselsInRack(b.bank, 0));
    //  recompute: pitch / outside diameter and tier pitch / outside diameter from pixels
    const cx = num(/data-vessel="1" cx="([\d.]+)"/g, d.svg), cy = num(/data-vessel="1" cx="[\d.]+" cy="([\d.]+)"/g, d.svg);
    const r = num(/data-vessel="1" cx="[\d.]+" cy="[\d.]+" r="([\d.]+)"/g, d.svg)[0]!;
    expect((cx[1]! - cx[0]!) / (2 * r)).toBeCloseTo(b.bank.pitch / b.bank.vesselOutsideDiameter, 6);
    const rows = [...new Set(cy.map((v) => v.toFixed(3)))].map(Number).sort((a, c) => c - a);
    expect(rows).toHaveLength(b.bank.tiers);
    expect((rows[0]! - rows[1]!) / (2 * r)).toBeCloseTo(b.bank.tierPitch / b.bank.vesselOutsideDiameter, 4);
  });

  it("the last, partial rack holds the vessels the sheet says", () => {
    const hs = set({ rack: 4 });
    expect(count(hs.section!.svg, 'data-vessel="1"')).toBe(41);
  });

  it("the roof is the declared room height, the headroom computed from it, in two channels", () => {
    const d = set().section!;
    const head = d.dims.find((x) => x.id === "headroom")!;
    expect(head.who).toBe("choupo");
    const b = bankReads(allSheets(hall().designFiles)).get("RO1/train1")!;
    if (!b.ok) throw new Error("bank");
    const room = hall().building.rooms.find((r) => r.name === "ro1Hall")!;
    const want = room.z + room.height - 0 - b.bank.rackHeight;     // the bank stands on the floor (z = 0)
    expect(head.label).toContain(`headroom ${Number(want.toPrecision(3))} m`);
    expect(d.svg).toContain("roof of ro1Hall");
  });

  it("without a room the roof is not drawn and the note says why", () => {
    const b = bankReads(allSheets(hall().designFiles)).get("RO1/train1")!;
    const d = rackSectionSvg(b, 0);
    expect(d.svg).not.toContain("roof of");
    expect(d.notes.map((n) => n.text).join(" ")).toContain("roof is not drawn");
  });
});

describe("the elevation of one rack, with its three headers", () => {
  it("draws every tier, a feed/brine/permeate connection for each, and the three headers", () => {
    const hs = set();
    const b = bankReads(allSheets(hall().designFiles)).get(hs.pick.bankId)!;
    if (!b.ok) throw new Error("bank");
    const e = hs.elevation!;
    expect(count(e.svg, "data-tier=")).toBe(b.bank.tiers);
    for (const k of ["feed", "brine", "permeate"]) {
      expect(count(e.svg, `data-header="${k}"`), k).toBe(1);
      //  one branch per tier in the side view + one per vessel of the top tier in the plan view
      expect(count(e.svg, `data-branch="${k}"`), k).toBeGreaterThanOrEqual(b.bank.tiers);
    }
    //  the top view shows every vessel of the top tier
    expect(count(e.svg, 'data-vessel-top="1"')).toBe(b.bank.vesselsPerTier);
  });

  it("vessel length / outside diameter in pixels is the sheet's ratio", () => {
    const e = set().elevation!;
    const b = bankReads(allSheets(hall().designFiles)).get("RO1/train1")!;
    if (!b.ok) throw new Error("bank");
    const m = /data-tier="0" x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/.exec(e.svg)!;
    expect(Number(m[1]) / Number(m[2])).toBeCloseTo(b.bank.vesselLength / b.bank.vesselOutsideDiameter, 6);
  });

  it("a bank given NO header sheet draws its three headers dashed and says they are not sized", () => {
    const b = bankReads(allSheets(hall().designFiles)).get("RO1/train1")!;
    const e = rackElevationSvg(b, 0);
    for (const k of ["feed", "brine", "permeate"]) {
      const c = new RegExp(`<circle data-header="${k}" data-sized="0"[^>]*stroke-dasharray`).exec(e.svg);
      expect(c, k).not.toBeNull();
    }
    expect(e.notes.map((n) => n.text).join(" ")).toContain("NOT SIZED");
    expect(e.svg).not.toContain("data-required");
  });

  it("the legacy single bore on the bank sheet still sizes all three headers (no header sheets)", () => {
    const text = hall().designFiles["design/RO1/train1"]!
      .replace("    pitch ", "    headerNominalDiameter 0.4 m;\n    pitch ");
    const b = readBank(parseDesignSheet(text));
    if (!b.ok) throw new Error("bank");
    expect(b.bank.headerNominalDiameter).toBe(0.4);
    const e = rackElevationSvg(b, 0);
    const r = Number(/data-header="feed" data-sized="1" data-diameter="0.4" cx="[\d.]+" cy="[\d.]+" r="([\d.]+)"/.exec(e.svg)![1]);
    const sc = (Number(/data-tier="0" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(e.svg)![1]) / b.bank.vesselLength);
    expect(r / sc).toBeCloseTo(0.2, 6);                       // radius 0.2 m at the drawing's scale
  });

  it("the element length printed is the SHEET's, not a constant", () => {
    const text = hall().designFiles["design/RO1/train1"]!.replace("elementLength         1.016 m", "elementLength         1.2 m");
    const b = readBank(parseDesignSheet(text));
    if (!b.ok) throw new Error("bank");
    expect(rackElevationSvg(b, 0).svg).toContain("x 1.2 m element");
  });
});

describe("the plan of the hall", () => {
  it("draws the four rooms, 48 racks, 18 loading clearances, 24 boxes and the cut line", () => {
    const p = set().plan!;
    expect(count(p.svg, "data-room=")).toBe(4);
    expect(count(p.svg, "data-rack=")).toBe(6 * (5 + 2 + 1));
    expect(count(p.svg, "data-clearance=")).toBe(18);
    expect(count(p.svg, "data-item=")).toBe(6 * 3 + 6);       // 18 pumps and 6 exchanger arrays
    expect(count(p.svg, 'data-cut="A"')).toBe(1);
  });

  it("the racks keep the published proportions (rack length / rack width in pixels)", () => {
    const p = set().plan!;
    const b = bankReads(allSheets(hall().designFiles)).get("RO1/train1")!;
    if (!b.ok) throw new Error("bank");
    const m = /data-rack="RO1\/train1#0" x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/.exec(p.svg)!;
    expect(Number(m[1]) / Number(m[2])).toBeCloseTo(b.bank.rackLength / b.bank.rackWidth, 6);
    const c = /data-clearance="RO1\/train1" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(p.svg)!;
    expect(Number(c[1]) / Number(m[1])).toBeCloseTo(b.bank.loadingClearance / b.bank.rackLength, 6);
  });

  it("the room outlines are the declared building's rooms", () => {
    const p = set().plan!;
    for (const r of hall().building.rooms) expect(p.svg).toContain(`data-room="${r.name}"`);
  });

  it("a bank whose sheet cannot be read is drawn as a labelled dashed box, not as racks", () => {
    const banks = bankReads(allSheets(hall().designFiles));
    banks.set("RO1/train1", { ok: false, missing: ["pitch"] });
    const p = hallPlanSvg({ items: hall().attached.items, building: hall().building, banks })!;
    expect(p.svg).toContain("RO1/train1 (bank not read)");
    expect(count(p.svg, "data-rack=")).toBe(6 * 8 - 5);
  });
});

describe("EVERY DIMENSION LINE CARRIES ITS PROVENANCE IN TWO CHANNELS", () => {
  it("in the plan, the section, the elevation: the ink of the provenance and its word", () => {
    const hs = set();
    for (const [name, d] of [["plan", hs.plan], ["section", hs.section], ["elevation", hs.elevation]] as const) {
      const groups = dimGroups(d!.svg);
      expect(groups.length, name).toBe(d!.dims.length);
      expect(groups.length, name).toBeGreaterThanOrEqual(3);
      for (const g of groups) {
        expect(g.inkOk, `${name} ${g.id} ink`).toBe(true);
        expect(g.wordOk, `${name} ${g.id} word`).toBe(true);
      }
    }
  });

  it("the case's declared numbers read 'declared', the computed ones 'Choupo'", () => {
    const e = set().elevation!.dims;
    expect(e.find((x) => x.id === "endMargin")!.who).toBe("declared");
    expect(e.find((x) => x.id === "vesselLength")!.who).toBe("choupo");
    const s = set().section!.dims;
    expect(s.find((x) => x.id === "pitch")!.who).toBe("declared");
    expect(s.find((x) => x.id === "rackWidth")!.who).toBe("choupo");
  });
});

describe("a missing key draws a labelled box and names it", () => {
  it("section and elevation of a bank lacking `pitch`", () => {
    const text = hall().designFiles["design/RO1/train1"]!.replace(/^\s*pitch\s.*$/m, "");
    const b = readBank(parseDesignSheet(text));
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.missing).toEqual(["pitch"]);
    for (const d of [rackSectionSvg(b), rackElevationSvg(b)]) {
      expect(d.svg).toContain('data-missing="true"');
      expect(d.svg).toContain("pitch");
      expect(d.dims).toEqual([]);
    }
  });

  it("a wrongly-united key is missing, not converted", () => {
    const text = hall().designFiles["design/RO1/train1"]!.replace("pitch                 0.4 m", "pitch                 0.4 mm");
    const b = readBank(parseDesignSheet(text));
    expect(b.ok).toBe(false);
  });
});

describe("hallSet picks", () => {
  it("falls back to the first train/bank/rack for a pick the run does not have", () => {
    const hs = hallSet(hall().designFiles, hall().attached, hall().building,
      { train: 99, bankId: "nope", rack: 99 })!;
    expect(hs.pick.train).toBe(1);
    expect(hs.pick.bankId).toBe(hs.bankIds[0]);
    expect(hs.pick.rack).toBe(hs.racks - 1);
  });

  it("the picked train's banks are RO1, RO2a, RO2b of that train", () => {
    const hs = set({ train: 3 });
    expect(hs.bankIds.sort()).toEqual(["RO1/train3", "RO2a/train3", "RO2b/train3"]);
    expect(hs.pick.bankId).toBeDefined();
    expect(sheetItemId(parseDesignSheet(hall().designFiles["design/RO2b/train3"]!)!)).toBe("RO2b/train3");
  });
});


/*  ====================================================================  */
/*  The headers, each at ITS OWN sheet's size (C199, the header sizer)      */
/*  ====================================================================  */

describe("the headers are drawn at the size their pipeHeader sheets state", () => {
  const sheets = () => allSheets(hall().designFiles);
  const bank = (unit = "RO1", k = 1) => {
    const r = bankReads(sheets()).get(`${unit}/train${k}`)!;
    if (!r.ok) throw new Error("bank");
    return r;
  };
  const headerSheet = (unit: string, k: number, role: string) =>
    parseDesignSheet(hall().designFiles[`design/${unit}/train${k}.${role}`]!)!;
  const val = (sh: ReturnType<typeof headerSheet>, key: string) => sh.sizing.find((v) => v.key === key)!.value;
  const circle = (svg: string, role: string) => {
    const m = new RegExp(`<circle data-header="${role}" data-sized="(\\d)"(?: data-diameter="([\\d.]+)")? cx="([\\d.]+)" cy="([\\d.]+)" r="([\\d.]+)" ([^>]*)/>`).exec(svg)!;
    return { sized: m[1] === "1", diameter: m[2] === undefined ? undefined : Number(m[2]), r: Number(m[5]), attrs: m[6]! };
  };
  const scale = (svg: string, b: ReturnType<typeof bank>) =>      // pixels per metre, from the vessel length
    Number(/data-tier="0" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(svg)![1]) / b.bank.vesselLength;

  it("the sheets are the engine's: one per header per train, keyed on the bank unit and the train", () => {
    const hs = sheets().filter((x) => x.equipment === "pipeHeader");
    expect(hs).toHaveLength(3 * 3 * 6);
    for (const h of hs) {
      expect(["RO1", "RO2a", "RO2b"]).toContain(h.unit);
      expect(h.item).toMatch(/^train[1-6]\.(feed|brine|permeate)$/);
      expect(Math.round(val(h, "trainIndex"))).toBe(Number(/^train(\d)/.exec(h.item)![1]));
    }
  });

  it("each header circle has its own sheet's nominal bore as its diameter, to scale against the vessel", () => {
    const hsPick = set();
    const b = bank();
    const e = hsPick.elevation!;
    const s = scale(e.svg, b);
    const vesselR = Number(/data-tier="0"[^>]*rx="([\d.]+)"/.exec(e.svg)![1]);
    expect(vesselR / s).toBeCloseTo(b.bank.vesselOutsideDiameter / 2, 6);
    for (const role of ["feed", "brine", "permeate"]) {
      const sh = headerSheet("RO1", 1, role);
      const D = val(sh, "headerNominalDiameter");
      const c = circle(e.svg, role);
      expect(c.sized, role).toBe(true);
      expect(c.diameter, role).toBe(D);
      //  the true ratio header / vessel, recomputed from the circle radii in pixels
      expect(c.r / vesselR, role).toBeCloseTo((D / 2) / (b.bank.vesselOutsideDiameter / 2), 6);
      expect(c.r / s * 2, role).toBeCloseTo(D, 6);
      expect(c.attrs, role).not.toContain("stroke-dasharray");
    }
  });

  it("feed and brine are drawn at DIFFERENT bores (each its own sheet's), the larger flow the larger bore", () => {
    const e = set().elevation!;
    const f = headerSheet("RO1", 1, "feed"), br = headerSheet("RO1", 1, "brine");
    expect(circle(e.svg, "feed").diameter).toBe(val(f, "headerNominalDiameter"));
    expect(circle(e.svg, "brine").diameter).toBe(val(br, "headerNominalDiameter"));
    expect(val(f, "headerNominalDiameter")).toBeGreaterThan(val(br, "headerNominalDiameter"));
    expect(val(f, "flow")).toBeGreaterThan(val(br, "flow"));
  });

  it("the sheet numbers the drawing prints satisfy the sizer's own rule, recomputed by hand", () => {
    for (const role of ["feed", "brine", "permeate"]) {
      const sh = headerSheet("RO1", 1, role);
      const Q = val(sh, "flow") / 3600, vmax = val(sh, "velocityMax"), vmin = val(sh, "velocityMin");
      const Dreq = Math.sqrt(4 * Q / (Math.PI * vmax));
      expect(val(sh, "requiredInsideDiameter"), role).toBeCloseTo(Dreq, 3);
      const D = val(sh, "headerNominalDiameter");
      expect(D, role).toBeGreaterThanOrEqual(Dreq);
      const v = 4 * Q / (Math.PI * D * D);
      expect(v, role).toBeCloseTo(val(sh, "velocity"), 3);
      expect(v, role).toBeGreaterThanOrEqual(vmin);
      expect(v, role).toBeLessThanOrEqual(vmax);
    }
  });

  it("each header carries a nominal-bore dimension (declared) and a required-bore dimension (Choupo), in two channels", () => {
    const e = set().elevation!;
    const groups = dimGroups(e.svg);
    for (const role of ["feed", "brine", "permeate"]) {
      const sh = headerSheet("RO1", 1, role);
      const nom = e.dims.find((d) => d.id === `header.${role}.nominal`)!;
      const req = e.dims.find((d) => d.id === `header.${role}.required`)!;
      expect(nom.who).toBe("declared");
      expect(req.who).toBe("choupo");
      expect(nom.label).toContain(`${role} nominal bore ${Number(val(sh, "headerNominalDiameter").toPrecision(3))} m`);
      expect(req.label).toContain(`${role} required bore ${Number(val(sh, "requiredInsideDiameter").toPrecision(3))} m, computed`);
      for (const id of [nom.id, req.id]) {
        const g = groups.find((x) => x.id === id)!;
        expect(g.inkOk, id).toBe(true);
        expect(g.wordOk, id).toBe(true);
      }
    }
    //  the note names the velocity and the pressure drop per metre, from the sheet
    const text = e.notes.map((n) => n.text).join(" ");
    const sh = headerSheet("RO1", 1, "feed");
    expect(text).toContain(`${Number(val(sh, "velocity").toPrecision(3))} m/s`);
    expect(text).toContain(`${Number(val(sh, "pressureDropPerMetre").toPrecision(3))} Pa/m`);
    expect(e.svg).toContain(`v ${Number(val(sh, "velocity").toPrecision(3))} m/s, ${Number(val(sh, "pressureDropPerMetre").toPrecision(3))} Pa/m`);
    expect(e.svg).toContain(`feed header, ${Number(val(sh, "flow").toPrecision(3))} m3/h per train`);
    expect(text).not.toContain("NOT SIZED");
  });

  it("a header drawn for train 2 reads train 2's sheet, not train 1's", () => {
    const hs = set({ train: 2, bankId: "RO2a/train2" });
    const sh = headerSheet("RO2a", 2, "brine");
    expect(circle(hs.elevation!.svg, "brine").diameter).toBe(val(sh, "headerNominalDiameter"));
    const b = bank("RO2a", 2);
    const h = headersOf(sheets(), b.bank);
    expect(Object.keys(h).sort()).toEqual(["brine", "feed", "permeate"]);
    expect(h.brine!.diameter).toBe(val(sh, "headerNominalDiameter"));
  });

  it("with ONE header sheet REMOVED that header is dashed and unsized, the others stay solid", () => {
    const keep = sheets().filter((x) => !(x.equipment === "pipeHeader" && x.unit === "RO1" && x.item === "train1.brine"));
    const b = bank();
    const e = rackElevationSvg(b, 0, headersOf(keep, b.bank));
    expect(circle(e.svg, "brine").sized).toBe(false);
    expect(circle(e.svg, "brine").diameter).toBeUndefined();
    expect(circle(e.svg, "brine").attrs).toContain("stroke-dasharray");
    expect(e.svg).toContain("brine (not sized)");
    for (const role of ["feed", "permeate"]) {
      expect(circle(e.svg, role).sized, role).toBe(true);
      expect(circle(e.svg, role).attrs, role).not.toContain("stroke-dasharray");
    }
    expect(e.dims.some((d) => d.id === "header.brine.nominal")).toBe(false);
    expect(e.dims.some((d) => d.id === "header.feed.nominal")).toBe(true);
    expect(e.notes.map((n) => n.text).join(" ")).toContain("NOT SIZED");
  });

  it("with ALL header sheets removed the whole rack falls back to the dashed marks", () => {
    const keep = sheets().filter((x) => x.equipment !== "pipeHeader");
    const b = bank();
    expect(headersOf(keep, b.bank)).toEqual({});
    const e = rackElevationSvg(b, 0, headersOf(keep, b.bank));
    for (const role of ["feed", "brine", "permeate"]) expect(circle(e.svg, role).sized, role).toBe(false);
    expect(e.dims.filter((d) => d.id.startsWith("header."))).toEqual([]);
  });

  it("a header sheet missing a key (no velocity) is not read, and that header falls back", () => {
    const text = hall().designFiles["design/RO1/train1.feed"]!.replace(/^\s*velocity\s.*$/m, "");
    expect(readHeader(parseDesignSheet(text))).toBeNull();
    expect(readHeader(headerSheet("RO1", 1, "feed"))).not.toBeNull();
  });

  it("the train schematic's bank rows list the header bores, from the sheets", () => {
    const hs = set();
    const f = (role: string) => Number(val(headerSheet("RO1", 1, role), "headerNominalDiameter").toPrecision(3));
    expect(hs.train.svg).toContain(`headers Ø ${f("feed")} / ${f("brine")} / ${f("permeate")} m (declared)`);
    //  without the header sheets the row is absent
    const bare = trainSchematicSvg(trainSheets(sheets(), 1), sheets().filter((x) => x.equipment !== "pipeHeader"));
    expect(bare.svg).not.toContain("headers Ø");
  });
});
