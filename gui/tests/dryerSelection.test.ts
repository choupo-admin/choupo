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
  the tool renders.

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
import { DryerDrawing } from "../src/ui/methods/dryerDrawings.js";
import {
  DEFAULT_INPUTS, DRYERS, DRYER_IDS, FEED_LABEL, HEAT_LABEL, LATENT_HEAT_KJ_PER_KG, MODE_LABEL,
  RULES, SCALE_LABEL, SIZE_LABEL, SOURCES, comparisonRows, dutyKW, efficiency, energyBills,
  recommend, scaleWarnings, waterEvaporated,
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
  it("the three books each carry a reference with a recorded verification", () => {
    const refs = JSON.parse(read("gui/src/ui/methods/lessonReferences.json")).lessons["dryer-selection"]
      .references as { text: string; verified: { method: string } }[];
    expect(refs.length).toBe(3);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Mujumdar/);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Perry/);
    expect(refs.map((r) => r.text).join(" ")).toMatch(/Land/);
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
    expect(recommend({ ...DEFAULT_INPUTS, feed: "granular", size: "fine" }).picks[0]).toBe("rotary");
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
  it("the steps are numbered 1..7 in order, and the limits and the quiz exist", () => {
    expect(DRYER_SELECTION_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DRYER_SELECTION_LIMITS.length).toBeGreaterThanOrEqual(4);
    expect(DRYER_SELECTION_QUIZ.length).toBeGreaterThanOrEqual(5);
  });
  it("the lesson names no page of the engine's source (nothing to drift)", () => {
    const all = DRYER_SELECTION_STEPS.map((s) => s.body + (s.note ?? "")).join(" ");
    expect(all).not.toMatch(/\.(cpp|H):\d+/);
  });
});

describe("(d) a cell the books do not give is not cited", () => {
  it("the blanks are exactly the ones Table 1.4 and the text leave blank", () => {
    expect(DRYERS.tray.energy).toBeNull();
    expect(DRYERS.freeze.energy).toBeNull();
    expect(DRYERS.fluidBed.capacity).toBeNull();
    expect(DRYERS.tray.capacity).toBeNull();
    expect(DRYERS.belt.capacity).toBeNull();
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
    expect(blanks).toBe(5);
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
      expect(stepText(6), unit[id]).toContain(unit[id]);
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
});

describe("(g) the tool is registered and renders", () => {
  it("is a live selection tool on the separations shelf, with the drying chapter as theory", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "dryer-selection")!;
    expect(t.status).toBe("live");
    expect(t.kind).toBe("selection");
    expect(t.discipline).toBe("Separations & phase equilibria");
    expect(t.origins).toEqual(["page", "reference", "assumption"]);
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
