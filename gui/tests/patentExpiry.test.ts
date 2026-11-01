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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  patentExpiry.test -- "Patent expiry and generic entry" (commission C195).

  Every number the page shows is RECOMPUTED here from the declared curves by
  plain arithmetic written out in the test (no call to the function under
  test for an expected value), and the page's defaults are held to the case
  they claim to reproduce: apalutamide01_tablets, read from disk.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  PATENT_SOURCES, addMonthsIso, curveOf, defaultCurves, defaultInputs,
  originatorVolume, pasteBlock, readCurve, readStep, runModel, scenarios,
} from "../src/ui/methods/patentExpiryMath.js";
import { PATENT_LIMITS, PATENT_STEPS } from "../src/ui/methods/patentExpiryLesson.js";
import { PatentExpiryTool } from "../src/ui/methods/PatentExpiryTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const REPO = new URL("../../", import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, REPO), "utf-8");
const CASE = "tutorials/batch/plant/apalutamide01_tablets/";

const at = <T,>(a: readonly T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
};
const near = (a: number | undefined, b: number | undefined, rel = 1e-12) =>
  expect(Math.abs((a ?? NaN) - (b ?? NaN))).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b ?? NaN)));

describe("the curves: stated points are the studies', the rest say assumed", () => {
  const curves = defaultCurves();
  const pts = (id: string) => curves.find((c) => c.id === id)!.points;

  it("FDA 2019 p. 2: cuts of 39, 54, 79 and more than 95 % at 1, 2, 4 and 6+ producers", () => {
    const p = pts("priceByCompetitors");
    const stated = Object.fromEntries(p.filter((q) => q.origin === "stated").map((q) => [q.x, q.y]));
    expect(Object.keys(stated).sort()).toEqual(["1", "2", "4", "6"]);
    near(stated[1], 1 - 0.39); near(stated[2], 1 - 0.54);
    near(stated[4], 1 - 0.79); near(stated[6], 1 - 0.95);
  });
  it("3 and 5 producers are the straight line between their stated neighbours, and say assumed", () => {
    const p = pts("priceByCompetitors");
    const at = (x: number) => p.find((q) => q.x === x)!;
    expect(at(3).origin).toBe("assumed"); expect(at(5).origin).toBe("assumed");
    near(at(3).y, (at(2).y + at(4).y) / 2); near(at(5).y, (at(4).y + at(6).y) / 2);
  });
  it("EC 2009: 25 % below at entry, 40 % below after two years; 30 % and 45 % generic volume at the end of years 1 and 2", () => {
    const t = pts("priceByTime"), g = pts("genericShare");
    near(t.find((q) => q.x === 0)!.y, 0.75); near(t.find((q) => q.x === 2)!.y, 0.60);
    near(g.find((q) => q.x === 1)!.y, 0.30); near(g.find((q) => q.x === 2)!.y, 0.45);
    for (const q of [...t, ...g].filter((q) => q.origin === "stated"))
      expect([0.75, 0.6, 0.3, 0.45]).toContain(q.y);
  });
  it("no curve point without a reason, and the unsourced curves carry no stated point", () => {
    for (const c of curves) for (const q of c.points) expect(q.note.length, `${c.id}:${q.x}`).toBeGreaterThan(10);
    for (const id of ["rivals", "newcomerShare"])
      for (const q of pts(id)) expect(q.origin, id).toBe("assumed");
    for (const id of ["rivals", "newcomerShare"]) expect(curves.find((c) => c.id === id)!.source).toBe("none");
  });
  it("readCurve is piecewise linear and held; readStep is a step", () => {
    const p = pts("priceByCompetitors");
    near(readCurve(p, 2.5), (0.46 + 0.335) / 2); near(readCurve(p, 0), 0.61); near(readCurve(p, 10), 0.05);
    const r = pts("rivals");
    expect(readStep(r, 1)).toBe(1); expect(readStep(r, 2)).toBe(2);
    expect(readStep(r, 3)).toBe(3); expect(readStep(r, 9)).toBe(3);
  });
});

describe("the defaults are the apalutamide01_tablets business case", () => {
  const inp = defaultInputs();
  it("the volume, price, mass, production, life and rate are the case's", () => {
    const post = read(`${CASE}system/postDict`);
    expect(post).toMatch(/projectLife\s+10;/);
    expect(post).toMatch(/discountRate\s+0\.10;/);
    expect(post).toMatch(/perYear\s+10156 kg;/);
    expect(post).toMatch(/14\.0 million at 0\.72546 g/);
    expect(inp.projectLife).toBe(10); near(inp.discountRate, 0.10);
    const kg = (inp.capacityMTablets * 1e6 * inp.tabletMassG) / 1000;
    expect(Math.abs(kg - 10156)).toBeLessThan(1);
    const eco = read(`${CASE}constant/economics`);
    expect(eco).toMatch(/price\s+5513\.8;/);
    near(4.0 / (inp.tabletMassG / 1000), 5513.8, 1e-4);
    expect(eco).toContain("0.72546 g a tablet");
  });
  it("the originator's sales and price are the dossier's arithmetic", () => {
    const dossier = read("docs/design/apalutamide-design-basis-dossier.md");
    expect(dossier).toContain("2 121 M USD");
    near(2121 * 0.533 * 0.92, 1039, 2e-3);          // 1 039 M EUR
    expect(dossier).toContain("19.13");
    expect(dossier).toContain("3 Dec 2035");
    expect(inp.loeDate).toBe("2035-12-03");
    near(originatorVolume(inp), 1039e6 / 19.13);
  });
  it("section 3.6 of the dossier says the European counterparts are not verified", () => {
    const d = read("docs/design/apalutamide-design-basis-dossier.md");
    const i = d.indexOf("### 3.6");
    expect(d.slice(i, i + 2500)).toMatch(/not verified/i);
  });
});

describe("the model against hand arithmetic", () => {
  const inp = defaultInputs();
  const s = runModel(inp);
  const V0 = 1039e6 / 19.13;
  // years 1..3 worked by hand: G = 0, .30, .45, .55 ; rivals 1, 2, 3 ; w = 1/n
  it("year 1: g = (0 + .30)/2, n = 2, w = 1/2, ratio .46", () => {
    const r = at(s.rows, 0);
    expect(r.k).toBe(1); expect(r.n).toBe(2);
    near(r.genericShare, 0.15); near(r.newcomerShare, 0.5);
    near(r.soldTablets, V0 * 0.15 * 0.5);
    near(r.price, 19.13 * 0.46);
    near(r.revenueMEUR, (V0 * 0.15 * 0.5 * 19.13 * 0.46) / 1e6);
    near(r.soldKg, (V0 * 0.15 * 0.5 * 0.72546) / 1000);
    near(r.pricePerKg, (19.13 * 0.46) / 0.00072546);
  });
  it("year 2: g = (.30 + .45)/2, n = 3, w = 1/3, ratio .335", () => {
    const r = at(s.rows, 1);
    near(r.genericShare, 0.375); expect(r.n).toBe(3);
    near(r.soldTablets, V0 * 0.375 / 3); near(r.price, 19.13 * 0.335);
  });
  it("year 3: g = (.45 + .55)/2, n = 4, w = 1/4, ratio .21; the price is flat from here", () => {
    const r = at(s.rows, 2);
    near(r.genericShare, 0.5); expect(r.n).toBe(4);
    near(r.soldTablets, V0 * 0.5 / 4); near(r.price, 19.13 * 0.21);
    for (const q of s.rows.slice(2)) near(q.price, 19.13 * 0.21);
  });
  it("the plateau: g = .75 from year 7 on (G(6) = .75 held)", () => {
    near(at(s.rows, 6).genericShare, 0.75); near(at(s.rows, 9).genericShare, 0.75);
    near(at(s.rows, 9).soldTablets, V0 * 0.75 / 4);
  });
  it("totals, the present value and p* by an independent sum", () => {
    const g = [0.15, 0.375, 0.5, 0.59, 0.665, 0.725, 0.75, 0.75, 0.75, 0.75];
    const n = [2, 3, 4, 4, 4, 4, 4, 4, 4, 4];
    const ratio = [0.46, 0.335, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21];
    let tab = 0, rev = 0, pv = 0, dT = 0;
    g.forEach((gj, i) => {
      const N = V0 * gj / at(n, i);
      const p = 19.13 * at(ratio, i);
      const d = Math.pow(1.1, -(i + 1));
      tab += N; rev += N * p / 1e6; pv += N * p * d / 1e6; dT += N * d;
    });
    near(s.meanTablets, tab / 10); near(s.totalRevenueMEUR, rev); near(s.pvRevenueMEUR, pv);
    near(s.meanPrice, (rev * 1e6) / tab);
    near(s.pasteTabletPrice, (pv * 1e6) / dT);
    near(s.pastePricePerKg, ((pv * 1e6) / dT) / 0.00072546);
    // the defining identity of the pasted price
    near(s.pasteTabletPrice * s.rows.reduce((a, r) => a + r.soldTablets * r.discount, 0), s.pvRevenueMEUR * 1e6);
  });
  it("rampUp is sold / Q, inside [0, 1] as the engine requires, and Q in kg is 10156", () => {
    s.rampUp.forEach((u, i) => { near(u, at(s.rows, i).soldTablets / 14e6); expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1); });
    expect(s.rampUp.length).toBeLessThanOrEqual(inp.projectLife);
    near(s.designKgPerYear, 14e6 * 0.72546 / 1000);
  });
  it("a plant smaller than the demand sells Q and says so", () => {
    const small = runModel({ ...inp, capacityMTablets: 5 });
    for (const r of small.rows) { expect(r.soldTablets).toBeLessThanOrEqual(5e6 + 1e-6); }
    expect(at(small.rows, 9).capped).toBe(true); near(at(small.rows, 9).soldTablets, 5e6);
    expect(at(small.rows, 0).capped).toBe(false);
  });
  it("by time: year 1 ratio = (.75 + .675)/2, year 3 = (.60 + .60)/2", () => {
    const t = runModel({ ...inp, priceMode: "byTime" });
    near(at(t.rows, 0).priceRatio, (0.75 + 0.675) / 2);
    near(at(t.rows, 0).price, 19.13 * 0.7125);
    near(at(t.rows, 2).priceRatio, 0.60);
  });
  it("the depth factor scales every price and so the revenue, and no volume", () => {
    const sc = scenarios(inp, 0.5);
    const dp = sc.find((x) => x.id === "deeper")!;
    near(dp.summary.pvRevenueMEUR, 0.5 * s.pvRevenueMEUR);
    near(dp.pvChangePct, -50, 1e-9);
    near(dp.summary.meanTablets, s.meanTablets);
  });
  it("late by d years starts in market year 1 + d and is compared at the first entry", () => {
    const sc = scenarios(inp, 0.5);
    for (const [id, d] of [["late1", 1], ["late2", 2]] as const) {
      const x = sc.find((q) => q.id === id)!;
      expect(at(x.summary.rows, 0).k).toBe(1 + d);
      // by hand: market year 1 + d, g = (G(d) + G(d+1))/2
      const G = [0, 0.30, 0.45, 0.55, 0.63, 0.70, 0.75];
      near(at(x.summary.rows, 0).genericShare, (at(G, d) + at(G, d + 1)) / 2);
      near(x.summary.pvAtFirstEntryMEUR, x.summary.pvRevenueMEUR / Math.pow(1.1, d));
      near(x.pvChangePct, (100 * (x.summary.pvAtFirstEntryMEUR - s.pvAtFirstEntryMEUR)) / s.pvAtFirstEntryMEUR);
    }
    // lateness costs money on the common date, and more of it the later
    const l1 = sc.find((q) => q.id === "late1")!, l2 = sc.find((q) => q.id === "late2")!;
    expect(l1.pvChangePct).toBeLessThan(0); expect(l2.pvChangePct).toBeLessThan(l1.pvChangePct);
  });
  it("the base scenario IS the declared model", () => {
    const sc = scenarios(inp, 0.5)[0]!;
    near(sc.summary.pvRevenueMEUR, s.pvRevenueMEUR); near(sc.pvChangePct, 0);
  });
  it("the paste block carries the rampUp list and the price the model computed", () => {
    const b = pasteBlock(inp, s);
    expect(b).toContain(`rampUp ( ${s.rampUp.map((x) => x.toFixed(4)).join(" ")} );`);
    expect(b).toContain(`perYear  ${s.designKgPerYear.toFixed(0)} kg;`);
    expect(b).toContain(`price    ${s.pastePricePerKg.toFixed(1)};`);
  });
  it("editing a curve moves the result: a deeper 4-producer price lowers revenue", () => {
    const c = defaultCurves();
    c.find((x) => x.id === "priceByCompetitors")!.points.find((p) => p.x === 4)!.y = 0.10;
    const m = runModel({ ...inp, curves: c });
    near(at(m.rows, 3).price, 1.913);
    expect(m.pvRevenueMEUR).toBeLessThan(s.pvRevenueMEUR);
    expect(curveOf({ ...inp, curves: c }, "priceByCompetitors").points.length).toBe(6);
  });
});

describe("the calendar", () => {
  it("3 Dec 2035 + 7 months (EC 2009's average gap) is 3 Jul 2036", () => {
    expect(addMonthsIso("2035-12-03", 7)).toBe("2036-07-03");
  });
  it("month ends clamp, bad dates read as null", () => {
    expect(addMonthsIso("2036-01-31", 1)).toBe("2036-02-29");
    expect(addMonthsIso("2035-02-30", 1)).toBeNull();
    expect(addMonthsIso("soon", 1)).toBeNull();
  });
});

describe("the rendered page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(PatentExpiryTool)));
  const s = runModel(defaultInputs());

  it("says first that it is not a freedom-to-operate analysis and names the dossier section", () => {
    expect(html).toContain("data-not-fto");
    expect(html).toContain("not a freedom-to-operate analysis");
    expect(html).toContain("section 3.6");
  });
  it("shows a row per operating year and the numbers it computed", () => {
    for (const r of s.rows) expect(html).toContain(`data-year-row="${r.j}"`);
    expect(html).toContain((at(s.rows, 0).soldTablets / 1e6).toFixed(2));
    expect(html).toContain(at(s.rows, 0).price.toFixed(3));
    expect(html).toContain(s.pvRevenueMEUR.toFixed(1));
    expect(html).toContain(s.pasteTabletPrice.toFixed(3));
  });
  it("shows the four scenarios and the paste block", () => {
    for (const id of ["base", "late1", "late2", "deeper"]) expect(html).toContain(`data-scenario="${id}"`);
    expect(html).toContain("data-paste-block");
    expect(html).toContain("rampUp (");
  });
  it("marks every curve point with its origin word, and ships the stated ones with their source", () => {
    const stated = (html.match(/data-point-origin="stated"/g) ?? []).length;
    const assumed = (html.match(/data-point-origin="assumed"/g) ?? []).length;
    expect(stated).toBe(8);                       // FDA 4 + EC price 2 + EC share 2
    expect(assumed).toBe(defaultCurves().flatMap((c) => c.points).length - 8);
    for (const src of PATENT_SOURCES) expect(html).toContain(`data-source="${src.short}"`);
    expect(html).toContain("https://www.fda.gov/media/133509/download");
  });
  it("the sources name what was read and the page", () => {
    const fda = PATENT_SOURCES.find((x) => x.short === "FDA 2019")!;
    expect(fda.read).toContain("p. 2");
    expect(fda.read).toContain("not read");
  });
});

describe("the lesson and the registry", () => {
  it("the registry entry is a live notes page with the three origins and the economics anchor", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "patent-expiry")!;
    expect(t.status).toBe("live"); expect(t.kind).toBe("notes");
    expect(t.discipline).toBe("Process design & economics");
    expect([...t.origins].sort()).toEqual(["assumption", "page", "reference"]);
    expect(t.theory).toBe("ch:economics");
    expect(read("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
  });
  it("the lesson's statements about the case are true of the case", () => {
    const eng = read("src/postProcessing/EconomicsPass.cpp");
    expect(eng).toMatch(/rampUp\[static_cast<std::size_t>\(t - 1\)\] : 1\.0/);
    expect(eng).toContain("design production reached in one operating year");
    const body = PATENT_STEPS.map((x) => x.body).join(" ");
    expect(body).toContain("US 12,303,493 B2");
    expect(body).toContain("3 December 2035");
    expect(read(`${CASE}README.md`)).toContain("3 Dec 2035");
  });
  it("the limits name the freedom-to-operate gap, the sources and the held volume", () => {
    const ids = PATENT_LIMITS.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["not-fto", "curves", "frozen-market", "grammar"]));
    expect(PATENT_LIMITS.map((l) => l.body).join(" ")).toContain("cannot be redistributed");
  });
  it("the Tutorials Guide has the section", () => {
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-patent-expiry}");
    expect(g).toContain("tool=patent-expiry");
  });
});
