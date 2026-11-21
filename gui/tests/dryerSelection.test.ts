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
  dryerSelection.test -- the "Which dryer for which product" page (DEV.md 4c
  C460), held to its own data and to the files it names.

  WHAT THIS PROVES.  (a) every rule, row and reason carries a source the page
  can show, and every source names a page; (b) the tree is TOTAL (every
  combination of answers fires a rule) and never recommends a type the book
  says cannot take that feed form, nor a batch dryer for a continuous
  question, nor a continuous one for a batch question; (c) every number and
  threshold the lesson's steps print is the number the data holds, and the
  energy arithmetic is the arithmetic; (d) a cell the books do not give is
  null and renders "not cited"; (e) the four cases the page opens exist as
  tutorials and use the unit the page says they use; (f) the seven drawings
  are constructed from primitives, with no embedded image and no link; (g)
  the tool renders; (h) every cell of the habitual tables (Mujumdar 1.1, 1.5,
  1.6; van 't Land 3.1, 3.2; Towler 10.7; Perry 12-46) is pinned against a
  second, independent transcription written in this file; and the corrections
  of the expert review (2026-11-21) are held: the rotary shell's feed end is
  the higher, the co-current note is attached only where it means something,
  the sublimation sentence is not repeated, the 75 degC branch needs both of
  its conditions.

  WHAT IT CANNOT PROVE: that a source says what the data says it says.  That is
  a reading of the page, recorded in lessonReferences.json, and the figures
  of Tables 1.1, 1.2 and 1.4 and of the two trees were read from images of the
  pages.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { tutorialByName } from "../src/cases/tutorials.js";
import {
  COLD_COLOR, DryerDrawing, FEED_COLOR, GAS_COLOR, ROTARY_CENTRE, ROTARY_HOPPER_BOTTOM_Y,
  ROTARY_PRODUCT_TOP_Y, ROTARY_SHELL, ROTARY_TILT_DEG, rotaryEnds,
} from "../src/ui/methods/dryerDrawings.js";
import {
  DRUM_BOOKS, G_PER_M2S_TO_KG_PER_M2H, MUJ_MINIMUM_INFO, MUJ_T11_COLUMNS, MUJ_T11_ROWS, MUJ_T15_ROWS,
  MUJ_T16_ROWS, TOW_FEED_KEY, TOW_T107_ROWS, VTL_T31_LEFT, VTL_T31_RIGHT, VTL_T32_LEFT, VTL_T32_RIGHT,
  mujumdarDrumEfficiency, perryDrumEvapKgPerM2h,
} from "../src/ui/methods/dryerTables.js";
import {
  DEFAULT_INPUTS, DRYERS, DRYER_IDS, FEED_LABEL, FREEZE_COST_NOTE, HEAT_LABEL, LATENT_HEAT_KJ_PER_KG,
  MODE_LABEL, RULES, SCALE_LABEL, SIZE_LABEL, SOURCES, SUBLIMATION_HEAT_KJ_PER_KG, SUBLIMATION_NOTE,
  comparisonRows, dutyKW, efficiency, energyBills, recommend, scaleWarnings, waterEvaporated,
  type DryerId, type FeedForm, type Heat, type Inputs, type Mode, type Scale, type Size,
} from "../src/ui/methods/dryerSelection.js";
import {
  DRYER_SELECTION_LIMITS, DRYER_SELECTION_QUIZ, DRYER_SELECTION_STEPS,
} from "../src/ui/methods/dryerSelectionLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { DryerSelectionTool } from "../src/ui/methods/DryerSelectionTool.js";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, ROOT), "utf8");

const FEEDS = Object.keys(FEED_LABEL) as FeedForm[];
const HEATS = Object.keys(HEAT_LABEL) as Heat[];
const SCALES = Object.keys(SCALE_LABEL) as Scale[];
const MODES = Object.keys(MODE_LABEL) as Mode[];
const SIZES = Object.keys(SIZE_LABEL) as Size[];

function everyInput(): Inputs[] {
  const out: Inputs[] = [];
  for (const feed of FEEDS) for (const heat of HEATS) for (const scale of SCALES)
    for (const mode of MODES) for (const size of SIZES) for (const fragile of [false, true])
      out.push({ feed, heat, scale, mode, size, fragile });
  return out;
}

const stepText = (n: number): string => {
  const s = DRYER_SELECTION_STEPS.find((x) => x.n === n)!;
  return `${s.body} ${s.note ?? ""}`;
};
const grouped = (v: number): string => v.toLocaleString("en-US");

describe("(a) every claim carries a source with a page", () => {
  it("every source names a page or a table", () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.where, s.id).toMatch(/p\. \d|pp\. \d|Table|Figure/);
      expect(s.id).toBe(Object.keys(SOURCES).find((k) => k === s.id));
    }
  });
  it("every source id used by a type, a rule or a warning is in SOURCES", () => {
    const used = new Set<string>();
    for (const id of DRYER_IDS) {
      const d = DRYERS[id];
      for (const c of [d.heat, d.mode, d.products, d.residence, d.energy, d.capacity])
        c?.src.forEach((s) => used.add(s));
      d.ideaSrc.forEach((s) => used.add(s));
      for (const f of Object.values(d.feed)) f.src.forEach((s) => used.add(s));
    }
    for (const i of everyInput()) {
      const r = recommend(i);
      r.reasons.forEach((x) => { expect(x.src.length).toBeGreaterThan(0); x.src.forEach((s) => used.add(s)); });
      r.warnings.forEach((x) => { expect(x.src.length).toBeGreaterThan(0); x.src.forEach((s) => used.add(s)); });
    }
    for (const s of used) expect(SOURCES[s as keyof typeof SOURCES], s).toBeDefined();
  });
  it("the four books each carry a reference with a recorded verification", () => {
    const refs = JSON.parse(read("gui/src/ui/methods/lessonReferences.json")).lessons["dryer-selection"]
      .references as { text: string; verified: { method: string } }[];
    expect(refs.length).toBe(4);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Mujumdar/);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Perry/);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Land/);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Towler/);
    for (const r of refs) expect(r.verified.method).toBe("pdf");
  });
});

describe("(b) the tree is total and consistent with the feed-form tables", () => {
  const all = everyInput();
  it("every combination of answers fires a rule", () => {
    expect(all.length).toBe(4 * 3 * 3 * 2 * 3 * 2);
    for (const i of all) expect(() => recommend(i)).not.toThrow();
  });
  it("every rule fires for at least one combination (no dead rule)", () => {
    const fired = new Set(all.map((i) => recommend(i).rule.id));
    for (const r of RULES) expect(fired.has(r.id), r.id).toBe(true);
  });
  it("never recommends a type the book says cannot take the feed form", () => {
    for (const i of all) {
      const r = recommend(i);
      if (i.feed === "sheet") { expect(r.picks).toEqual([]); continue; }
      for (const id of r.picks)
        expect(DRYERS[id].feed[i.feed].fit, `${id} for ${i.feed}`).not.toBe("no");
    }
  });
  it("a conditional fit is named in the reasons of the pick", () => {
    // the spray dryer for a paste: the pumpability condition is said
    const r = recommend({ ...DEFAULT_INPUTS, feed: "paste" });
    expect(r.picks).toContain("spray");
    expect(r.reasons.map((x) => x.text).join(" ")).toMatch(/pumped/);
  });
  it("a batch question never gets a continuous-only type, nor the reverse", () => {
    const continuousOnly: DryerId[] = ["spray", "rotary", "belt", "drum"];
    for (const i of all) {
      const r = recommend(i);
      if (i.mode === "batch") for (const id of r.picks)
        expect(continuousOnly, `${id} in a batch answer`).not.toContain(id);
      if (i.mode === "continuous" && i.feed !== "sheet") for (const id of r.picks)
        expect(id, "a tray is a batch type").not.toBe("tray");
    }
  });
  it("a product limit of 30 degC is answered only by vacuum, freeze or drum types", () => {
    for (const i of all.filter((x) => x.heat === "low" && x.feed !== "sheet"))
      for (const id of recommend(i).picks) expect(["tray", "freeze", "drum"]).toContain(id);
  });
  it("the cases the books name come out: liquid -> spray, coarse -> belt, 0.1 mm+ -> fluid bed", () => {
    expect(recommend({ ...DEFAULT_INPUTS, feed: "solution" }).picks[0]).toBe("spray");
    expect(recommend({ ...DEFAULT_INPUTS, feed: "granular", size: "coarse" }).picks[0]).toBe("belt");
    expect(recommend({ ...DEFAULT_INPUTS, feed: "granular", size: "medium" }).picks[0]).toBe("fluidBed");
    // a fine powder in a continuous dryer: NOT the direct rotary (entrainment of fines, Mujumdar
    // p. 152); the answer is outside the seven, an indirect rotary or a disk dryer
    const fine = recommend({ ...DEFAULT_INPUTS, feed: "granular", size: "fine" });
    expect(fine.rule.id).toBe("gran-cont-fine");
    expect(fine.picks).toEqual([]);
    expect(fine.outside).toMatch(/indirect-heat rotary/);
    expect(fine.outside).toMatch(/disk dryer/);
    expect(recommend({ ...DEFAULT_INPUTS, feed: "granular", mode: "batch", scale: "small" }).picks[0])
      .toBe("fluidBed");
    expect(recommend({ ...DEFAULT_INPUTS, feed: "granular", heat: "low", mode: "batch", scale: "small" }).picks[0])
      .toBe("tray");
  });
  it("a book disagreement is said, not hidden (the tray for a fine powder)", () => {
    const r = recommend({ ...DEFAULT_INPUTS, feed: "granular", mode: "batch", size: "fine" });
    expect(r.picks).toEqual(["tray"]);
    expect(r.reasons.map((x) => x.text).join(" ")).toMatch(/books disagree/);
  });
  it("a fine powder, continuous: Perry's fluidised bed 'if not too dusty' is said as a disagreement", () => {
    const r = recommend({ ...DEFAULT_INPUTS, feed: "granular", mode: "continuous", size: "fine" });
    const t = r.reasons.map((x) => x.text).join(" ");
    expect(t).toMatch(/BOOKS DISAGREE/);
    expect(t).toMatch(/if not too dusty/);
    expect(t).toMatch(/100 mesh \(150 micrometres\)/);
    expect(t).toMatch(/entrain/);
    expect(r.reasons.flatMap((x) => x.src)).toEqual(expect.arrayContaining(["muj-rotary", "perry-t12-11", "vtl-cont-tree"]));
  });
  it("the co-current note is attached only to spray and rotary picks (and its siblings to bed and belt)", () => {
    const cocurrent = /run the spray or rotary dryer co-current/;
    const mixed = /well-mixed continuous fluidised bed has one temperature/;
    const belt = /blows the gas through the bed/;
    for (const i of everyInput()) {
      const r = recommend(i);
      const t = r.reasons.map((x) => x.text).join(" ");
      const wantCo = i.heat === "medium" && (r.picks.includes("spray") || r.picks.includes("rotary"));
      expect(cocurrent.test(t), JSON.stringify(i)).toBe(wantCo);
      // the well-mixed note is about the CONTINUOUS bed; a batch bed does not carry it
      expect(mixed.test(t), JSON.stringify(i)).toBe(
        i.heat === "medium" && i.mode === "continuous" && r.picks.includes("fluidBed"));
      expect(belt.test(t), JSON.stringify(i)).toBe(i.heat === "medium" && r.picks.includes("belt"));
    }
  });
  it("the vacuum drum at 30 degC is a possibility to check, not a rule of the books", () => {
    for (const f of ["solution", "paste"] as const) {
      const r = recommend({ ...DEFAULT_INPUTS, feed: f, heat: "low", mode: "continuous" });
      expect(r.picks).toContain("drum");
      const t = r.reasons.map((x) => x.text).join(" ");
      expect(t).toMatch(/possibility to check|a possibility to check, not a rule/);
      expect(t).toMatch(/do not give a limit of 30 degC|none of the books ties a product limit of 30 degC/);
      expect(r.reasons.flatMap((x) => x.src)).toContain("vtl-drum-vac");
    }
  });
  it("freeze drying: the sublimation sentence of Chapter 1 is NOT repeated, and is corrected", () => {
    expect(FREEZE_COST_NOTE.text).not.toMatch(/several times lower|severalfold|lower than the heat/);
    expect(SUBLIMATION_HEAT_KJ_PER_KG).toBe(2840);
    expect(LATENT_HEAT_KJ_PER_KG).toBe(2257);
    expect(SUBLIMATION_HEAT_KJ_PER_KG).toBeGreaterThan(LATENT_HEAT_KJ_PER_KG);
    expect(SUBLIMATION_NOTE.text).toContain("2840");
    expect(SUBLIMATION_NOTE.text).toContain("2257");
    expect(SUBLIMATION_NOTE.text).toMatch(/p\. 22/);
    expect(SUBLIMATION_NOTE.text).toMatch(/p\. 259/);
    expect(SOURCES["muj-freeze-heat"].where).toMatch(/p\. 259/);
    for (const i of [{ ...DEFAULT_INPUTS, feed: "solution" as const, heat: "low" as const, mode: "batch" as const },
      { ...DEFAULT_INPUTS, feed: "solution" as const, heat: "low" as const, mode: "continuous" as const }]) {
      const t = recommend(i).reasons.map((x) => x.text).join(" ");
      expect(t).not.toMatch(/several times lower/);
      expect(t).toContain("2840");
    }
  });
  it("scale warnings follow Perry's thresholds", () => {
    const small = scaleWarnings({ ...DEFAULT_INPUTS, scale: "small", mode: "continuous" });
    expect(small.map((x) => x.text).join(" ")).toMatch(/50 kg\/h/);
    const large = scaleWarnings({ ...DEFAULT_INPUTS, scale: "large", mode: "batch" });
    expect(large.map((x) => x.text).join(" ")).toMatch(/1 t\/h/);
    expect(scaleWarnings({ ...DEFAULT_INPUTS, scale: "large", mode: "continuous" })).toEqual([]);
    expect(scaleWarnings({ ...DEFAULT_INPUTS, scale: "small", mode: "batch" })).toEqual([]);
    expect(scaleWarnings({ ...DEFAULT_INPUTS, scale: "medium" }).length).toBe(1);
  });
});

describe("(c) the lesson prints the data's numbers", () => {
  it("step 5 prints each energy range of Table 1.4 as the data holds it", () => {
    const t = stepText(5);
    for (const id of ["spray", "rotary", "fluidBed", "belt", "drum"] as DryerId[]) {
      const e = DRYERS[id].energy!;
      expect(t, id).toContain(`${grouped(e.value[0])} to ${grouped(e.value[1])}`);
    }
  });
  it("step 3 prints each residence time of Table 1.2 (and van 't Land's freeze figure)", () => {
    const t = stepText(3);
    for (const id of DRYER_IDS) {
      const r = DRYERS[id].residence;
      if (!r) continue;
      const m = r.value.match(/^(\d+)-(\d+) (s|min|h)/)!;
      expect(t, id).toContain(`${m[1]} to ${m[2]} ${m[3]}`);
    }
  });
  it("step 4 prints Perry's two thresholds and the other two books' 100 kg/h", () => {
    const t = stepText(4);
    expect(t).toContain("50 kg/h");
    expect(t).toContain("1 t/h");
    expect(t).toContain("100 kg/h");
    expect(SCALE_LABEL.small).toContain("50 kg/h");
    expect(SCALE_LABEL.large).toContain("1 t/h");
  });
  it("the worked example of step 5 is the arithmetic", () => {
    const t = stepText(5);
    expect(LATENT_HEAT_KJ_PER_KG).toBe(2257);
    expect(t).toContain("2257 kJ");
    const spray = energyBills(1000).find((b) => b.id === "spray")!;
    expect(Math.round(spray.lowKW)).toBe(1250);
    expect(Math.round(spray.highKW)).toBe(3194);
    expect(t).toContain("1,250 to 3,194 kW");
    expect(efficiency(4500)).toBeCloseTo(0.5016, 4);
    expect(efficiency(11500)).toBeCloseTo(0.1963, 4);
    expect(dutyKW(3600, 5000)).toBeCloseTo(5000, 9);
    expect(waterEvaporated(1000, 1.5, 0.05)).toBeCloseTo(1450, 9);
    expect(waterEvaporated(1000, 0.05, 0.5)).toBe(0);
  });
  it("the energy bill covers exactly the types the book prices", () => {
    expect(energyBills(1000).map((b) => b.id).sort())
      .toEqual(["belt", "drum", "fluidBed", "rotary", "spray"]);
    for (const b of energyBills(1000)) expect(b.highKW).toBeGreaterThan(b.lowKW);
  });
  it("the formula parses and every symbol of it is glossed", () => {
    const s = DRYER_SELECTION_STEPS.find((x) => x.formula)!;
    expect(texParses(s.formula!)).toBe(true);
    for (const w of s.where!) {
      expect(texParses(w.sym), w.sym).toBe(true);
      expect(s.formula!, w.sym).toContain(w.sym.replace(/\\\\/g, "\\"));
    }
    expect(s.where!.length).toBe(8);
  });
  it("the steps are numbered 1..12 in order, and the limits and the quiz exist", () => {
    expect(DRYER_SELECTION_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(DRYER_SELECTION_LIMITS.length).toBeGreaterThanOrEqual(5);
    expect(DRYER_SELECTION_QUIZ.length).toBeGreaterThanOrEqual(7);
  });
  it("step 3 states BOTH conditions of van 't Land's 75 degC branch, and that his tree is for a particulate solid", () => {
    const t = stepText(3);
    expect(t).toMatch(/75 degC or more\s+AND a particle-size increase is required/);
    expect(t).toContain("re-slurrying additives");
    expect(t).toMatch(/particulate solid/);
    expect(t).toMatch(/liquid feed is outside that tree/);
    expect(t).not.toMatch(/at 75 degC or more his continuous tree opens the spray-dryer branch/);
    expect(read("gui/src/ui/methods/dryerSelection.ts")).toMatch(/particle size\s+increase required/);
  });
  it("step 3 corrects Mujumdar's sublimation sentence with both pages and both numbers", () => {
    const t = stepText(3);
    expect(t).toMatch(/severalfold lower/);
    expect(t).toContain("2840");
    expect(t).toContain("2257");
    expect(t).toMatch(/p\.259/);
    expect(t).toMatch(/wrong by the book's\s+own Chapter 11/);
  });
  it("step 6 prints the numbers of the habitual tables the data holds", () => {
    const t = stepText(6);
    expect(MUJ_T11_COLUMNS.length).toBe(11);
    expect(t).toContain("eleven feed forms");
    expect(t).toContain("0.15 to 1.0 kg/(h m2)");
    expect(t).toContain("1.5 to 35 kg/(h m3)");
    const [lo, hi] = perryDrumEvapKgPerM2h();
    expect(Math.round(lo)).toBe(25);
    expect(Math.round(hi)).toBe(40);
    expect(t).toContain("25 to 40 kg/(m2 h)");
    expect(t).toContain("7 to 11 g/(m2 s)");
    expect(t).toContain("6 to 20");
    expect(t).toContain("0.4 to 0.7");
    expect(t).toContain("0.35 to 0.71");
    const [e0, e1] = mujumdarDrumEfficiency();
    expect(e0).toBeCloseTo(0.3472, 4);
    expect(e1).toBeCloseTo(0.7053, 4);
    expect(G_PER_M2S_TO_KG_PER_M2H).toBe(3.6);
  });
  it("steps 1 to 8 name no page of the engine's source (nothing to drift); steps 9 to 12 do, held by dryerArrangements.test.ts", () => {
    const all = DRYER_SELECTION_STEPS.filter((s) => s.n <= 8).map((s) => s.body + (s.note ?? "")).join(" ");
    expect(all).not.toMatch(/\.(cpp|H):\d+/);
  });
});

describe("(d) a cell the books do not give is not cited", () => {
  it("the blanks are exactly the ones Table 1.4 and the text leave blank", () => {
    expect(DRYERS.tray.energy).toBeNull();
    expect(DRYERS.freeze.energy).toBeNull();
    expect(DRYERS.fluidBed.capacity).toBeNull();
    // Towler's Table 10.7 fills the two capacity cells the other books left blank
    expect(DRYERS.tray.capacity!.value).toBe(
      "0.15-1.0 kg water/h per m2 of heat-transfer area (shelf, cabinet or compartment type)");
    expect(DRYERS.tray.capacity!.src).toEqual(["tow-t10.7"]);
    expect(DRYERS.belt.capacity!.value).toBe(
      "1.5-35 kg water/h per m3 of dryer volume (tunnel, belt or screen type)");
    expect(DRYERS.belt.capacity!.src).toEqual(["tow-t10.7"]);
    const rows = comparisonRows();
    expect(rows.length).toBe(7);
    expect(rows.find((r) => r.id === "tray")!.energy).toBeNull();
    expect(rows.find((r) => r.id === "spray")!.energy).toBe("4,500-11,500");
    expect(rows.find((r) => r.id === "drum")!.energy).toBe("3,200-6,500");
  });
  it("the rendered table says 'not cited' where a cell is null", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));
    const blanks = comparisonRows().reduce((n, r) =>
      n + [r.residence, r.energy, r.capacity].filter((c) => c === null).length, 0);
    expect(blanks).toBe(3);
    const table = html.slice(html.indexOf("data-dryer-comparison"));
    expect(table.split("not cited").length - 1).toBeGreaterThanOrEqual(blanks);
  });
});

describe("(e) the types the engine models open their case", () => {
  const withCase = DRYER_IDS.filter((id) => DRYERS[id].engine);
  it("four types have a case; drum, belt and freeze have none", () => {
    expect(withCase.sort()).toEqual(["fluidBed", "rotary", "spray", "tray"]);
    for (const id of ["drum", "belt", "freeze"] as DryerId[]) expect(DRYERS[id].engine).toBeNull();
  });
  it.each(withCase.map((id) => [id, DRYERS[id].engine!.name] as const))(
    "%s: %s is a bundled tutorial that uses the unit the lesson names", (id, name) => {
      expect(tutorialByName(name), name).toBeDefined();
      const unit: Record<string, string> = {
        spray: "sprayDryer", rotary: "convectiveDryer", fluidBed: "solidDryer", tray: "batchDryer",
      };
      const flow = read(`tutorials/${name}/system/flowsheetDict`);
      expect(flow, name).toMatch(new RegExp(`type\\s+${unit[id]}\\s*;`));
      expect(stepText(7), unit[id]).toContain(unit[id]);
    });
  it("the rendered page carries one open-case button per modelled type", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));
    for (const id of withCase) expect(html).toContain(`data-engine-case="${DRYERS[id].engine!.name}"`);
  });
});

describe("(f) the drawings are constructed, not copied", () => {
  it("each of the seven renders an inline SVG of primitives with no image and no link", () => {
    for (const id of DRYER_IDS) {
      const html = renderToStaticMarkup(createElement(DryerDrawing, { id, label: DRYERS[id].label }));
      expect(html, id).toContain(`data-dryer-drawing="${id}"`);
      expect(html, id).toMatch(/^<svg /);
      expect(html, id).not.toMatch(/<image|href=|xlink|data:image|<foreignObject/);
      expect((html.match(/<(path|rect|circle|line|polygon)\b/g) ?? []).length, id).toBeGreaterThan(8);
    }
  });
  it("the seven are different drawings", () => {
    const set = new Set(DRYER_IDS.map((id) =>
      renderToStaticMarkup(createElement(DryerDrawing, { id, label: id }))
        .replace(/data-dryer-drawing="\w+"/, "").replace(/aria-label="[^"]*"/, "")));
    expect(set.size).toBe(7);
  });
  it("the drawing source says it is original", () => {
    expect(read("gui/src/ui/methods/dryerDrawings.tsx")).toMatch(/EVERY DRAWING IS ORIGINAL/);
  });
  const svgOf = (id: DryerId): string => renderToStaticMarkup(createElement(DryerDrawing, { id, label: id }));
  it("the rotary shell's FEED end is higher than its DISCHARGE end (the transform is read, not assumed)", () => {
    const html = svgOf("rotary");
    const m = html.match(/data-rotary-shell="" transform="rotate\((-?[\d.]+) ([\d.]+) ([\d.]+)\)"/)!;
    expect(m, "the shell carries a rotate()").not.toBeNull();
    const deg = Number(m[1]), cx = Number(m[2]), cy = Number(m[3]);
    expect(deg).toBe(ROTARY_TILT_DEG);
    expect(deg).toBeGreaterThan(0); // SVG: positive is clockwise, which lowers the right-hand end
    expect(cx).toBe(ROTARY_CENTRE.x);
    expect(cy).toBe(ROTARY_CENTRE.y);
    const a = (deg * Math.PI) / 180;
    const rot = (x: number, y: number): { x: number; y: number } => ({
      x: cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
      y: cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a) });
    const midY = ROTARY_SHELL.y + ROTARY_SHELL.h / 2;
    const feed = rot(ROTARY_SHELL.x, midY), discharge = rot(ROTARY_SHELL.x + ROTARY_SHELL.w, midY);
    expect(feed.y, "feed end is the high one (smaller y)").toBeLessThan(discharge.y);
    expect(feed.x).toBeLessThan(discharge.x);
    expect(rotaryEnds().feedEnd.y).toBeCloseTo(feed.y, 9);
    expect(rotaryEnds().dischargeEnd.y).toBeCloseTo(discharge.y, 9);
    // the hopper outlet is over the feed end and above the discharge end; the product leaves below it
    const hopper = html.match(/<polygon points="([^"]+)"[^>]*data-rotary-feed=""/)!;
    const ys = hopper[1]!.split(" ").map((p) => Number(p.split(",")[1]!));
    expect(Math.max(...ys)).toBe(ROTARY_HOPPER_BOTTOM_Y);
    expect(ROTARY_HOPPER_BOTTOM_Y).toBeLessThan(discharge.y);
    expect(ROTARY_HOPPER_BOTTOM_Y).toBeLessThanOrEqual(feed.y);
    expect(ROTARY_PRODUCT_TOP_Y).toBeGreaterThan(discharge.y);
    // the burner is at the feed end and the cyclone at the exhaust (the discharge end)
    const lab = (t: string): number => Number(html.match(new RegExp(`<text x="([\\d.]+)"[^>]*>${t}</text>`))![1]);
    expect(lab("burner")).toBeLessThan(feed.x);
    expect(lab("cyclone")).toBeGreaterThan(discharge.x);
    expect(html).toContain("hot gas flows");
  });
  it("the co-current gas arrows inside the rotary shell point from the feed end to the discharge end", () => {
    const html = svgOf("rotary");
    const lines = [...html.matchAll(new RegExp(`<line x1="([\\d.]+)" y1="71" x2="([\\d.]+)" y2="71" stroke="${GAS_COLOR}"`, "g"))];
    expect(lines.length).toBe(2);
    for (const l of lines) expect(Number(l[2])).toBeGreaterThan(Number(l[1]));
  });
  it("spray: gas at the roof, the exhaust duct from the cone to a cyclone with a fines outlet", () => {
    const html = svgOf("spray");
    for (const w of ["hot gas", "atomiser", "exhaust gas", "cyclone", "fines", "powder"]) expect(html, w).toContain(`>${w}<`);
  });
  it("fluid bed: an overflow weir and a cyclone", () => {
    const html = svgOf("fluidBed");
    for (const w of ["weir", "cyclone", "fines", "dry product", "plenum"]) expect(html, w).toContain(`>${w}<`);
  });
  it("tray: recirculation duct, fresh air, a small exhaust, heater and fan; the wet trays are in the feed colour", () => {
    const html = svgOf("tray");
    for (const w of ["recirculated air", "fresh air", "small exhaust", "heater", "fan"]) expect(html, w).toContain(`>${w}<`);
    expect((html.match(new RegExp(`<rect [^>]*fill="${FEED_COLOR}"`, "g")) ?? []).length).toBe(5);
  });
  it("belt: the gas passes THROUGH the layer between the two strands, in zones, and never reaches the return strand", () => {
    const html = svgOf("belt");
    for (const w of ["up", "down", "cooler"]) expect(html, w).toContain(`>${w}<`);
    const arrows = [...html.matchAll(new RegExp(`<line x1="([\\d.]+)" y1="([\\d.]+)" x2="([\\d.]+)" y2="([\\d.]+)" stroke="(${GAS_COLOR}|${COLD_COLOR})"`, "g"))];
    expect(arrows.length).toBe(6);
    const topStrand = 60, returnStrand = 84;
    for (const a of arrows) {
      const ys = [Number(a[2]), Number(a[4])];
      expect(Math.min(...ys), "reaches above the layer").toBeLessThan(topStrand);
      expect(Math.max(...ys), "stops before the return strand").toBeLessThan(returnStrand);
      expect(Math.max(...ys), "starts or ends below the carrying strand").toBeGreaterThan(topStrand);
    }
    // one zone goes up, one down: arrows differ in direction
    const up = arrows.filter((a) => Number(a[4]) < Number(a[2])).length;
    expect(up).toBe(4);
    expect(arrows.length - up).toBe(2);
  });
  it("drum: dips into the pan, a knife on the surface, a rotation arrow, a hood", () => {
    const html = svgOf("drum");
    for (const w of ["knife", "steam", "vapour hood", "dry flakes", "wet feed"]) expect(html, w).toContain(`>${w}<`);
    expect(html).toMatch(/<polygon points="[^"]+" fill="var\(--mantine-color-text\)"/); // the arrow head
    expect(html).toMatch(/fill="#2a78d6" opacity="0.3"/); // the pan of feed
  });
  it("freeze: the condenser is a cold surface, not the colour of the feed", () => {
    const html = svgOf("freeze");
    expect(html).toContain(`stroke="${COLD_COLOR}"`);
    // the feed colour is on the 18 vials only
    expect((html.match(new RegExp(`stroke="${FEED_COLOR}"`, "g")) ?? []).length).toBe(18);
  });
  it("the legend names the cold colour and the wet material", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));
    expect(html).toContain("cold surface or cooling air");
    expect(html).toContain("wet feed or wet material");
    expect(COLD_COLOR).not.toBe(FEED_COLOR);
  });
});

// ---- (h) the habitual tables: each cell pinned against a second transcription ----------

const T11_EXPECTED: Record<string, string[]> = {
  "Convection dryers|Belt conveyer dryer": ["Granule", "Fragile crystal", "Pellet", "Fiber", "Formed solids"],
  "Convection dryers|Flash dryer": ["Centrifuge", "Filter", "Powder", "Granule", "Fiber"],
  "Convection dryers|Fluid bed dryer": ["Solution", "Slurry", "Centrifuge", "Filter", "Powder", "Granule", "Pellet"],
  "Convection dryers|Rotary dryer": ["Centrifuge", "Filter", "Powder", "Granule", "Pellet", "Fiber"],
  "Convection dryers|Spray dryer": ["Solution", "Slurry", "Pastes"],
  "Convection dryers|Tray dryer (batch)": ["Centrifuge", "Filter", "Powder", "Granule", "Fragile crystal", "Pellet", "Fiber", "Formed solids"],
  "Convection dryers|Tray dryer (continuous)": ["Centrifuge", "Filter", "Powder", "Granule", "Fragile crystal", "Pellet", "Fiber"],
  "Conduction dryers|Drum dryer": ["Solution", "Slurry", "Pastes"],
  "Conduction dryers|Steam jacket rotary dryer": ["Centrifuge", "Filter", "Powder", "Granule", "Pellet", "Fiber"],
  "Conduction dryers|Steam tube rotary dryer": ["Centrifuge", "Filter", "Powder", "Granule", "Pellet", "Fiber"],
  "Conduction dryers|Tray dryer (batch)": ["Centrifuge", "Filter", "Powder", "Granule", "Fragile crystal", "Pellet", "Fiber", "Formed solids"],
  "Conduction dryers|Tray dryer (continuous)": ["Centrifuge", "Filter", "Powder", "Granule", "Fragile crystal", "Pellet", "Fiber"],
};

describe("(h) Mujumdar Table 1.1: twelve rows, ELEVEN feed columns", () => {
  it("the eleven columns, in the printed order, under their printed groups", () => {
    expect(MUJ_T11_COLUMNS.map((c) => c.label)).toEqual([
      "Solution", "Slurry", "Pastes", "Centrifuge", "Filter", "Powder", "Granule", "Fragile crystal",
      "Pellet", "Fiber", "Formed solids"]);
    expect(MUJ_T11_COLUMNS.map((c) => c.group)).toEqual([
      "Liquids", "Liquids", "Liquids", "Cakes", "Cakes", "Free-flowing solids", "Free-flowing solids",
      "Free-flowing solids", "Free-flowing solids", "Free-flowing solids", "Formed solids"]);
  });
  it("every cross of every row is the printed one", () => {
    expect(MUJ_T11_ROWS.length).toBe(12);
    expect(Object.keys(T11_EXPECTED).length).toBe(12);
    for (const r of MUJ_T11_ROWS) {
      const got = r.ticks.map((j) => MUJ_T11_COLUMNS[j]!.label);
      expect(got, `${r.group}|${r.dryer}`).toEqual(T11_EXPECTED[`${r.group}|${r.dryer}`]);
    }
  });
  it("agrees with what the seven types' feed-fit data says: spray and drum take liquids only", () => {
    const ticks = (name: string, group = "Convection dryers"): string[] =>
      T11_EXPECTED[`${group}|${name}`]!;
    expect(ticks("Spray dryer")).toEqual(["Solution", "Slurry", "Pastes"]);
    expect(ticks("Drum dryer", "Conduction dryers")).toEqual(["Solution", "Slurry", "Pastes"]);
    expect(DRYERS.spray.feed.granular.fit).toBe("no");
    expect(DRYERS.drum.feed.granular.fit).toBe("no");
    expect(ticks("Fluid bed dryer")).toContain("Solution");
  });
});

describe("(h) Mujumdar Table 1.5", () => {
  const E: (string | null)[][] = [
    // type, coefficient, flow, dT, ..., tIn
    ["Rotary", "100-200", "Countercurrent", "80-150", "", "200-600"],
    ["Rotary", "100-200", "Cocurrent", "100-180", "", "300-600"],
    ["Flash", "2000-6000", "Parallel flow only", "100-180", "", "400-600"],
    ["Fluid bed", "2000-6000", "", "50-150", "", "100-600"],
    ["Spray", "20-80 (large five)", "Counterflow", "80-90", "", "200-300"],
    ["Spray", "20-80 (large five)", "Cocurrent", "70-170", "", "200-450"],
    ["Tunnel", "200-300", "Counterflow", "30-60", "", "100-200"],
    ["Tunnel", "200-300", "Cocurrent", "50-70", "", "100-200"],
    ["Jet flow", "h = 100-150", "", "30-80", "", "60-150"],
    ["Drum", "100-200", "", "50-80", "", null],
    ["Agitated through rotary with steam tubes, etc.", "60-130 (smaller for sticky solids)", "", "50-100", "", null],
  ];
  it("every printed line: type, ha or U, flow direction, log-mean difference, inlet temperature", () => {
    const got = MUJ_T15_ROWS.flatMap((r) => r.lines.map((l) =>
      [r.type, r.coefficient, l.flow ?? "", l.dT, "", l.tIn]));
    expect(got).toEqual(E);
  });
  it("the convection rows come before the conduction rows, as printed", () => {
    expect(MUJ_T15_ROWS.map((r) => r.group)).toEqual([
      "Convection", "Convection", "Convection", "Convection", "Convection", "Convection",
      "Conduction", "Conduction"]);
  });
});

describe("(h) Mujumdar Table 1.6, van 't Land Tables 3.1 and 3.2", () => {
  it("Table 1.6: the thirteen printed lines and every item", () => {
    expect(MUJ_T16_ROWS.map((r) => r.factor)).toEqual([
      "Physical form of feed", "Average throughput", "Expected variation in throughput (turndown ratio)",
      "Fuel choice", "Pre- and postdrying operations (if any)", "For particulate feed products",
      "Inlet-outlet moisture content", "Chemical/biochemical/microbiological activity", "Heat sensitivity",
      "Sorption isotherms (equilibrium moisture content)", "Drying time", "Special requirements",
      "Footprint of drying system"]);
    const items = (f: string): readonly string[] => MUJ_T16_ROWS.find((r) => r.factor === f)!.items;
    expect(items("Physical form of feed")).toEqual([
      "Granular, particulate, sludge, crystalline, liquid, pasty, suspension, solution, continuous sheets, "
        + "planks, odd-shapes (small/large)", "Sticky, lumpy"]);
    expect(items("Average throughput")).toEqual(["kg/h (dry/wet); continuous", "kg per batch (dry/wet)"]);
    expect(items("Fuel choice")).toEqual(["Oil", "Gas", "Electricity"]);
    expect(items("For particulate feed products")).toEqual([
      "Mean particle size", "Size distribution", "Particle density", "Bulk density", "Rehydration properties"]);
    expect(items("Inlet-outlet moisture content")).toEqual(["Dry basis", "Wet basis"]);
    expect(items("Heat sensitivity")).toEqual(["Melting point", "Glass transition temperature"]);
    expect(items("Drying time")).toEqual(["Drying curves", "Effect of process variables"]);
    expect(items("Special requirements")).toEqual([
      "Material of construction", "Corrosion", "Toxicity", "Nonaqueous solution", "Flammability limits",
      "Fire hazard", "Color/texture/aroma requirements (if any)"]);
    expect(items("Footprint of drying system")).toEqual(["Space availability for dryer and ancillaries"]);
    for (const f of ["Expected variation in throughput (turndown ratio)", "Pre- and postdrying operations (if any)",
      "Chemical/biochemical/microbiological activity", "Sorption isotherms (equilibrium moisture content)"])
      expect(items(f), f).toEqual([]);
  });
  it("the minimum quantitative information: fourteen items in the printed order", () => {
    expect(MUJ_MINIMUM_INFO.length).toBe(14);
    expect(MUJ_MINIMUM_INFO[0]).toBe("Dryer throughput; mode of feedstock production (batch/continuous)");
    expect(MUJ_MINIMUM_INFO[7]).toBe("Value of the product");
    expect(MUJ_MINIMUM_INFO[10]).toBe("Turndown ratio, flexibility in capacity requirements");
    expect(MUJ_MINIMUM_INFO[13]).toBe("Space in plant");
  });
  it("van 't Land Table 3.1 (data to assess) and Table 3.2 (criteria for the dried material)", () => {
    expect(VTL_T31_LEFT).toEqual([
      "Production capacity (kg/h)", "Initial moisture content", "Particle-size distribution", "Drying curve",
      "Maximum allowable product temperature", "Explosion characteristics (vapor-air and dust-air)",
      "Toxicological properties"]);
    expect(VTL_T31_RIGHT).toEqual([
      "Experience already gained", "Moisture isotherms", "Solubility of the solid in the liquid",
      "Solution vapor pressure", "Contamination by the drying gas", "Corrosion aspects",
      "Physical data on the relevant materials"]);
    expect(VTL_T32_LEFT).toEqual([
      "Moisture content", "Particle-size distribution", "Bulk density", "Hardness", "Dust content",
      "Flow characteristics", "Color"]);
    expect(VTL_T32_RIGHT).toEqual([
      "Odor, taste", "Appearance", "Dispersibility", "Dissolution or rewetting behavior", "Assay",
      "Caking tendency", "Segregation of originally dissolved components (food)"]);
  });
});

describe("(h) Towler Table 10.7", () => {
  // name | feed | jacketed | heat-sensitive | vacuum | retention | heat transfer | capacity | evaporation | unit
  const E = [
    "Shelf, Cabinet, Compartment|2,3|Yes|Yes|Yes|6.48 h|Radiant and conduction|Limited|0.15-1.0|A",
    "Truck|2,3|No|Yes|No|6.48 h|Convection|Limited|0.15-1.0|A",
    "Kettle, Pan|1,2|Yes|No|Yes|3.12 h|Conduction|Limited|1.5-15|A",
    "Rotary shell|2|Yes|Yes|Yes|4.48 h|Conduction|Limited|0.5-12|A",
    "Rotary internal|2|Yes|Yes|Yes|4.48 h|Conduction|Limited|0.5-12|A",
    "Double cone|2|Yes|Yes|Yes|3.12 h|Conduction|Limited|0.5-12|A",
    "Single drum, Double drum, Twin drum|1|No|Yes|Yes|Very short|Conduction|Medium|5-50|A",
    "Rotary, direct heat|2|No|No|No|Long|Convection|High|3-110|V",
    "Rotary, indirect heat|2|No|No|No|Long|Conduction|Medium|15-200|V",
    "Rotary, steam tube|2|No|Depends on material|No|Long|Conduction|High|15-200|V",
    "Rotary, direct-indirect heat|2|No|No|No|Long|Conduction, convection|High|50-150|V",
    "Louver|2|No|Depends on material|No|Long|Convection|High|5-240|V",
    "Tunnel, belt, screen|2,3|No|Yes|No|Long|Convection|Medium|1.5-35|V",
    "Rotary shelf|2|Yes|Depends on material|No|Medium|Conduction, convection|Medium|0.5-10|S",
    "Trough|2|Yes|Depends on material|Yes|Varies|Conduction|Medium|0.5-15|S",
    "Vibrating|2|Yes|Depends on material|No|Medium|Convection, conduction|Medium|0.5-100|S",
    "Turbo|2|No|Depends on material|No|Medium|Convection|Medium|1-10|S",
    "Spray|1|No|Yes|No|Short|Convection|High|1.5-50|W",
    "Flash|2|No|Yes|No|Short|Convection|High|-|W",
    "Fluid bed|2|No|Yes|No|Short|Convection|Medium|-|W",
  ];
  const UNIT: Record<string, string> = {
    "kg/(h m2) of heat-transfer area": "A", "kg/(h m3) of dryer volume": "V", "kg/(h m2)": "S", "kg/(h m3)": "W" };
  it("every row of the printed table, cell by cell", () => {
    expect(TOW_T107_ROWS.length).toBe(E.length);
    const got = TOW_T107_ROWS.map((r) => [r.types.join(", ").replace("Tunnel, belt, screen", "Tunnel, belt, screen"),
      r.feed.join(","), r.jacketed, r.heatSensitive, r.vacuum, r.retention, r.heatTransfer, r.capacity,
      r.evap ?? "-", UNIT[r.evapUnit]].join("|"));
    expect(got).toEqual(E);
  });
  it("the mode and the generic type of each row, and the key to the three feed conditions", () => {
    expect(TOW_T107_ROWS.map((r) => `${r.mode}/${r.generic}`)).toEqual([
      ...Array(6).fill("Batch/Stationary"), "Continuous/Drum", ...Array(5).fill("Continuous/Rotary"),
      ...Array(5).fill("Continuous/Conveyor"), ...Array(3).fill("Continuous/Suspended particle")]);
    expect(TOW_FEED_KEY.length).toBe(3);
    expect(TOW_FEED_KEY[0]).toMatch(/^Solutions, colloidal suspensions and emulsions/);
    expect(TOW_FEED_KEY[1]).toMatch(/^Free-flowing powders/);
    expect(TOW_FEED_KEY[2]).toBe("Solids incapable of withstanding mechanical handling.");
  });
  it("the two capacity cells the page uses are the printed rows of the cabinet and the tunnel belt", () => {
    const cab = TOW_T107_ROWS.find((r) => r.types.includes("Cabinet"))!;
    const tun = TOW_T107_ROWS.find((r) => r.types.includes("Tunnel"))!;
    expect(`${cab.evap} ${cab.evapUnit}`).toBe("0.15-1.0 kg/(h m2) of heat-transfer area");
    expect(`${tun.evap} ${tun.evapUnit}`).toBe("1.5-35 kg/(h m3) of dryer volume");
    expect(DRYERS.tray.capacity!.value).toContain(cab.evap!);
    expect(DRYERS.belt.capacity!.value).toContain(tun.evap!);
  });
  it("a dash is a null, and prints 'not cited'", () => {
    expect(TOW_T107_ROWS.filter((r) => r.evap === null).map((r) => r.types[0])).toEqual(["Flash", "Fluid bed"]);
  });
});

describe("(h) the drum dryer in Perry's Table 12-46 and Mujumdar's Table 1.4 and Chapter 9", () => {
  it("the printed numbers", () => {
    expect(DRUM_BOOKS.perry.evapEstimateGPerM2s).toBe(9.3);
    expect([...DRUM_BOOKS.perry.evapRangeGPerM2s]).toEqual([7, 11]);
    expect(DRUM_BOOKS.perry.effEstimate).toBe(0.85);
    expect([...DRUM_BOOKS.perry.effRange]).toEqual([0.4, 0.7]);
    expect([...DRUM_BOOKS.mujumdar14.evapKgPerM2h]).toEqual([6, 20]);
    expect([...DRUM_BOOKS.mujumdar14.energy]).toEqual([3200, 6500]);
    expect([...DRUM_BOOKS.mujumdar9.evapDifficultKgPerM2h]).toEqual([10, 30]);
    expect([...DRUM_BOOKS.mujumdar9.evapEasyKgPerM2h]).toEqual([40, 50]);
    expect([...DRUM_BOOKS.mujumdar9.energy]).toEqual([3000, 3500]);
    // the energy range is the one the comparison table holds
    expect([...DRYERS.drum.energy!.value]).toEqual([...DRUM_BOOKS.mujumdar14.energy]);
    expect(DRYERS.drum.capacity!.value).toContain("6-20");
  });
  it("the conversion, and the verdicts: evaporation differs, efficiency agrees", () => {
    const [lo, hi] = perryDrumEvapKgPerM2h();
    expect(lo).toBeCloseTo(25.2, 9);
    expect(hi).toBeCloseTo(39.6, 9);
    expect(lo).toBeGreaterThan(DRUM_BOOKS.mujumdar14.evapKgPerM2h[1]); // Perry's whole range is above Table 1.4
    const [e0, e1] = mujumdarDrumEfficiency();
    expect(e0).toBeGreaterThan(DRUM_BOOKS.perry.effRange[0] - 0.06);
    expect(e1).toBeLessThan(DRUM_BOOKS.perry.effRange[1] + 0.02);
  });
  it("the page renders the five tables, each with its source, and the drum disagreement", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));
    for (const t of ["muj-1.1", "muj-1.5", "checklist", "tow-10.7", "drum-two-books"])
      expect(html, t).toContain(`data-table="${t}"`);
    expect(html).toContain("data-habitual-tables");
    expect(html).toContain("Table 12-46, p. 12-81");
    expect(html).toContain("Table 10.7, p. 571");
    expect(html).toContain("Table 1.5, p. 27");
    expect(html).toContain("Tables 3.1 and 3.2, p. 22");
    expect(html).toContain("no: they differ");
    expect((html.match(/data-muj11-row=/g) ?? []).length).toBe(12);
    expect((html.match(/data-tow-row=/g) ?? []).length).toBe(20);
    expect((html.match(/data-ha-row=/g) ?? []).length).toBe(8);
    for (const c of MUJ_T11_COLUMNS) expect(html, c.label).toContain(c.label);
    expect(html.indexOf("data-habitual-tables")).toBeGreaterThan(html.indexOf("data-dryer-comparison"));
  });
});

describe("(g) the tool is registered and renders", () => {
  it("is a live selection tool on the separations shelf, with the drying chapter as theory", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "dryer-selection")!;
    expect(t.status).toBe("live");
    expect(t.kind).toBe("selection");
    expect(t.discipline).toBe("Separations & phase equilibria");
    expect(t.origins).toEqual(["engine", "page", "reference", "assumption"]);
    expect(read("docs/theoryGuide.tex")).toContain(`\\label{${t.theory}}`);
  });
  it("is mounted by the workspace", () => {
    expect(read("gui/src/ui/MethodsWorkspace.tsx")).toContain('tool === "dryer-selection"');
  });
  it("renders the seven cards, the tree's default answer, the legend and the bench", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(DryerSelectionTool)));
    for (const id of DRYER_IDS) expect(html).toContain(`data-dryer-card="${id}"`);
    expect(html).toContain("data-dryer-legend");
    expect(html).toContain("data-dryer-energy");
    expect(html).toContain(`data-dryer-result="${recommend(DEFAULT_INPUTS).rule.id}"`);
    expect(html).toContain('data-dryer-pick="spray"');
    for (const s of DRYER_SELECTION_STEPS) expect(html).toContain(`${s.n} · ${s.title}`.replace(/&/g, "&amp;"));
  });
});
