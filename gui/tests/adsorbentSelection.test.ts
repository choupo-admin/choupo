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
  adsorbentSelection.test -- the `adsorbent-selection` EduTool (DEV.md 4c
  C459): the data, its citations, the catalogue it reads, the lesson and the
  page.

  WHAT IT HOLDS
    * every value the page prints came from a cited page: every Cite names a
      known source, a page and what is on it, and its PDF page follows the
      offset of that source (Perry 1445 + N, Ruthven 1984 N + 20, Wankat
      N + 31, Ruthven-Farooq-Knaebel (N + 28) / 2);
    * the transcribed numbers are PINNED to what the page was read as
      (Perry Tables 16-3 and 16-5, Wankat Table 17-1, Ruthven Tables 2.6 and
      2.7, Ruthven-Farooq-Knaebel Tables 2.3 and 2.4), so an edit of one is a
      deliberate act that must name its page again;
    * the matrix is consistent and the count is computed from it;
    * Eq. (17-25) reproduces Wankat's worked 25 and 1.25 deg C;
    * the catalogue it reads is the whole folder: every `kind adsorbent`
      record of data/standards/assets/ has a row, every pair record is
      listed, every case the page offers exists and the cases the page says
      use an adsorbent are the cases that do;
    * the engine lines the lesson cites say what it claims;
    * the rendered page shows every row, every sentence, every record and no
      NaN, and says in words that it is not a market share.

  WHAT IT CANNOT PROVE: that a PDF page still says what was read on
  2026-11-21 -- the evidence string of the reference says where to look.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  ADSORBENT_IDS, ADSORBENTS, CASES_USING, GENERIC_HEAT, KCAL_TO_KJ, MATRIX,
  SEPARATIONS, SOURCES, kcalToKj, maxTemperatureRise, namedCount,
  parseAdsorbentRecord, parsePairRecord, type Cite,
} from "../src/ui/methods/adsorbentSelectionData.js";
import { catalogueAdsorbents } from "../src/ui/methods/adsorbentCatalogue.js";
import {
  ADS_SEL_LIMITS, ADS_SEL_QUIZ, ADS_SEL_STEPS,
} from "../src/ui/methods/adsorbentSelectionLesson.js";
import { AdsorbentSelectionTool } from "../src/ui/methods/AdsorbentSelectionTool.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const ROOT = new URL("../../", import.meta.url);
const tree = (rel: string): string => readFileSync(new URL(rel, ROOT), "utf-8");
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Every Cite in the data, wherever it sits. */
function allCites(): Cite[] {
  const out: Cite[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.src === "string" && typeof o.pdfPage === "number") out.push(o as unknown as Cite);
      Object.values(o).forEach(walk);
    }
  };
  walk(ADSORBENTS); walk(MATRIX); walk(SEPARATIONS); walk(GENERIC_HEAT);
  return out;
}

describe("adsorbent-selection: every value has a page", () => {
  it("names a known source, a page and what is on it", () => {
    const cites = allCites();
    expect(cites.length).toBeGreaterThan(60);
    for (const c of cites) {
      expect(Object.keys(SOURCES), JSON.stringify(c)).toContain(c.src);
      expect(c.page.length, JSON.stringify(c)).toBeGreaterThan(0);
      expect(c.what.length, JSON.stringify(c)).toBeGreaterThan(5);
    }
  });
  it("gives the PDF page its source's offset", () => {
    for (const c of allCites()) {
      if (c.src === "perry") {
        const m = /^16-(\d+)$/.exec(c.page);
        expect(m, c.page).not.toBeNull();
        expect(c.pdfPage, c.page).toBe(1445 + Number(m![1]));
      } else if (c.src === "ruthven84") {
        expect(c.pdfPage).toBe(Number(c.page) + 20);
      } else if (c.src === "wankat") {
        expect(c.pdfPage).toBe(Number(c.page) + 31);
      } else {
        expect(c.pdfPage).toBe(Math.floor((Number(c.page) + 28) / 2));
      }
    }
  });
  it("every value of every adsorbent row is cited or stated absent", () => {
    for (const a of ADSORBENTS) {
      expect(a.poreNm.cite.what, a.id).toBeTruthy();
      expect(a.polarity.cite.what, a.id).toBeTruthy();
      expect(a.bulkDensity.length, a.id).toBeGreaterThan(0);
      expect(a.regeneration.length, a.id).toBeGreaterThan(0);
      for (const h of a.heats) expect(h.cite.what, `${a.id} ${h.sorbate}`).toBeTruthy();
    }
  });
});

describe("adsorbent-selection: the transcribed numbers are pinned to their pages", () => {
  const by = (id: string) => ADSORBENTS.find((a) => a.id === id)!;
  it("eight adsorbents, in the order of the scope", () => {
    expect(ADSORBENTS.map((a) => a.id)).toEqual([...ADSORBENT_IDS]);
    expect(ADSORBENT_IDS).toHaveLength(8);
  });
  it("Perry Table 16-5: average pore diameter, nm", () => {
    expect(by("zeolite3A").poreNm.value.range).toEqual([0.3, 0.3]);
    expect(by("zeolite4A").poreNm.value.range).toEqual([0.4, 0.4]);
    expect(by("zeolite5A").poreNm.value.range).toEqual([0.5, 0.5]);
    expect(by("zeolite13X").poreNm.value.range).toEqual([1.0, 1.0]);
    expect(by("silicaGel").poreNm.value.range).toEqual([2, 5]);
    expect(by("activatedAlumina").poreNm.value.range).toEqual([4, 14]);
    expect(by("carbonMolecularSieve").poreNm.value.range).toEqual([0.3, 0.6]);
    expect(by("activatedCarbon").poreNm.value.range).toEqual([1, 4]);
  });
  it("Perry Table 16-3: carbons are hydrophobic, the rest hydrophilic", () => {
    for (const a of ADSORBENTS) {
      const want = a.id === "activatedCarbon" || a.id === "carbonMolecularSieve" ? "hydrophobic" : "hydrophilic";
      expect(a.polarity.value, a.id).toBe(want);
    }
  });
  it("Perry Table 16-5 and Wankat Table 17-1: bulk densities, kg/m3", () => {
    const perry = (id: string) => by(id).bulkDensity.find((b) => b.cite.src === "perry")!.value.range;
    const wankat = (id: string) => by(id).bulkDensity.find((b) => b.cite.src === "wankat")!.value.range;
    expect(perry("zeolite3A")).toEqual([620, 680]);
    expect(perry("zeolite4A")).toEqual([610, 670]);
    expect(perry("zeolite5A")).toEqual([600, 660]);
    expect(perry("zeolite13X")).toEqual([580, 640]);
    expect(perry("silicaGel")).toEqual([700, 820]);
    expect(perry("activatedAlumina")).toEqual([850, 850]);
    expect(perry("carbonMolecularSieve")).toEqual([500, 700]);
    expect(perry("activatedCarbon")).toEqual([400, 600]);
    expect(wankat("zeolite3A")).toEqual([670, 740]);
    expect(wankat("zeolite4A")).toEqual([660, 720]);
    expect(wankat("zeolite5A")).toEqual([670, 720]);
    expect(wankat("zeolite13X")).toEqual([610, 710]);
  });
  it("Wankat Table 17-1: reactivation temperature, deg C", () => {
    const t = (id: string) => by(id).reactivationC?.value.range;
    expect(t("activatedCarbon")).toEqual([100, 140]);
    for (const z of ["zeolite3A", "zeolite4A", "zeolite5A", "zeolite13X"]) expect(t(z), z).toEqual([200, 350]);
    expect(t("silicaGel")).toEqual([120, 280]);
    expect(t("activatedAlumina")).toEqual([150, 315]);
    expect(t("carbonMolecularSieve")).toBeUndefined();
  });
  it("the printed heats of adsorption, kcal/mol", () => {
    const h = (id: string) => Object.fromEntries(by(id).heats.map((x) => [x.sorbate, x.kcalPerMol]));
    expect(h("zeolite4A")).toEqual({ O2: 3.2, N2: 4.35 });
    expect(h("zeolite5A")).toEqual({ O2: 3.3, N2: 5.0, Ar: 3.36, NH3: 25.0 });
    expect(h("zeolite13X")).toEqual({ N2: 5.0, CO2: 10.0, H2O: 18.5, NH3: 16.0 });
    expect(h("carbonMolecularSieve")).toEqual({ O2: 3.8, N2: 3.8, Ar: 4.0 });
    for (const id of ["activatedCarbon", "zeolite3A", "silicaGel", "activatedAlumina"])
      expect(by(id).heats, id).toEqual([]);
    expect(GENERIC_HEAT.value).toEqual({ lowKjPerKg: 1000, highKjPerKg: 4000, avgKjPerKg: 2500 });
  });
});

describe("adsorbent-selection: the matrix and the count", () => {
  it("names only known adsorbents and separations, each cell once", () => {
    const seen = new Set<string>();
    for (const c of MATRIX) {
      expect(ADSORBENT_IDS, c.ads).toContain(c.ads);
      expect(SEPARATIONS.map((s) => s.id), c.sep).toContain(c.sep);
      const k = `${c.sep}:${c.ads}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
      expect(c.why.length, k).toBeGreaterThan(20);
    }
  });
  it("every separation has a cell and a note, and four of five have a dominant adsorbent", () => {
    for (const s of SEPARATIONS) {
      expect(MATRIX.filter((c) => c.sep === s.id).length, s.id).toBeGreaterThan(0);
      expect(s.notes.length, s.id).toBeGreaterThan(0);
    }
    const dominant = SEPARATIONS.filter((s) => MATRIX.some((c) => c.sep === s.id && c.role === "dominant"));
    expect(dominant.map((s) => s.id)).toEqual(["drying", "airSeparation", "vocRecovery", "waterTreatment"]);
    //  Hydrogen PSA is a layered bed: no cell is dominant and the page says so.
    expect(MATRIX.filter((c) => c.sep === "h2Psa").every((c) => c.role !== "dominant")).toBe(true);
  });
  it("the count is read from the matrix, and is a count of separations", () => {
    const n = Object.fromEntries(namedCount().map((r) => [r.id, r.count]));
    expect(n).toEqual({
      activatedCarbon: 3, activatedAlumina: 3, zeolite4A: 2, carbonMolecularSieve: 2,
      silicaGel: 1, zeolite3A: 1, zeolite5A: 1, zeolite13X: 1,
    });
    for (const r of namedCount()) expect(r.count).toBeLessThanOrEqual(SEPARATIONS.length);
  });
  it("sorts the count, largest first", () => {
    const c = namedCount().map((r) => r.count);
    expect([...c].sort((a, b) => b - a)).toEqual(c);
  });
});

describe("adsorbent-selection: the page arithmetic", () => {
  it("reproduces Wankat's worked 25 and 1.25 deg C (Eq. 17-25)", () => {
    expect(maxTemperatureRise(0.01, 2500, 1.0)).toBeCloseTo(25, 10);
    expect(maxTemperatureRise(0.0005, 2500, 1.0)).toBeCloseTo(1.25, 10);
  });
  it("is linear in y and in the heat, and refuses a non-positive Cp", () => {
    expect(maxTemperatureRise(0.02, 2500, 1)).toBeCloseTo(2 * maxTemperatureRise(0.01, 2500, 1), 10);
    expect(maxTemperatureRise(0.01, 4000, 1)).toBeCloseTo(1.6 * maxTemperatureRise(0.01, 2500, 1), 10);
    expect(() => maxTemperatureRise(0.01, 2500, 0)).toThrow();
  });
  it("converts kcal to kJ at 4.184", () => {
    expect(KCAL_TO_KJ).toBe(4.184);
    expect(kcalToKj(5.0)).toBeCloseTo(20.92, 10);
    expect(kcalToKj(18.5)).toBeCloseTo(77.404, 10);
  });
});

describe("adsorbent-selection: the catalogue it reads is the whole folder", () => {
  const dir = "data/standards/assets/";
  const files = readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith(".dat"));
  const onDisk = files.map((f) => parseAdsorbentRecord(tree(dir + f))).filter((x) => x !== null);
  const cat = catalogueAdsorbents();

  it("lists every `kind adsorbent` record, and no other", () => {
    expect(onDisk.length).toBeGreaterThanOrEqual(3);
    expect(cat.map((c) => c.identity.name)).toEqual(onDisk.map((o) => o!.name).sort());
  });
  it("every record has a literature row, and every literature row that names a record names a real one", () => {
    for (const c of cat) {
      expect(ADSORBENTS.some((a) => a.catalogue === c.identity.name),
        `record ${c.identity.name} has no row in the data`).toBe(true);
    }
    for (const a of ADSORBENTS.filter((x) => x.catalogue !== null))
      expect(cat.map((c) => c.identity.name), a.id).toContain(a.catalogue);
  });
  it("every pair record of the adsorption tree is listed under its adsorbent", () => {
    const base = "data/standards/parameters/adsorption/equilibria/";
    for (const c of cat) {
      const names = readdirSync(new URL(base + c.identity.name + "/", ROOT)).filter((f) => f.endsWith(".dat"));
      expect(c.pairs.map((p) => p.pair.adsorbate).sort(), c.identity.name)
        .toEqual(names.map((f) => f.replace(/\.dat$/, "")).sort());
      for (const p of c.pairs) {
        expect(p.pair.dHads, `${c.identity.name} ${p.pair.adsorbate}`).toBeLessThan(0);
        expect(p.pair.quality).toBe("teachingOnly");
      }
    }
  });
  it("the cases offered exist, and are the cases that name the adsorbent", () => {
    const uses = new Map<string, Set<string>>();
    const scan = (d: string, rel: string): void => {
      for (const f of readdirSync(new URL(d, ROOT))) {
        const p = d + f;
        if (statSync(new URL(p, ROOT)).isDirectory()) {
          if (f === "system") {
            for (const dict of ["flowsheetDict", "propsDict"]) {
              let t = "";
              try { t = tree(`${p}/${dict}`); } catch { continue; }
              for (const m of t.matchAll(/^\s*adsorbent\s+"?([A-Za-z0-9_]+)"?\s*;/gm)) {
                if (!uses.has(m[1]!)) uses.set(m[1]!, new Set());
                uses.get(m[1]!)!.add(rel);
              }
            }
          } else if (f !== "0" && f !== "expected" && f !== "constant") scan(p + "/", `${rel}/${f}`.replace(/^\//, ""));
        }
      }
    };
    scan("tutorials/", "");
    for (const c of cat) {
      const declared = CASES_USING[c.identity.name];
      expect(declared, `CASES_USING has no entry for ${c.identity.name}`).toBeDefined();
      for (const k of declared!) {
        expect(tree(`tutorials/${k.id}/system/controlDict`), k.id).toContain("application");
        expect(uses.get(c.identity.name)?.has(k.id), `${k.id} does not name ${c.identity.name}`).toBe(true);
      }
      //  An adsorbent the page says no case uses must have none.
      if (declared!.length === 0)
        expect(uses.get(c.identity.name)?.size ?? 0, `${c.identity.name} is used after all`).toBe(0);
    }
  });
  it("sets the record's bulk density beside what the books print", () => {
    const rho = Object.fromEntries(cat.map((c) => [c.identity.name, c.identity.rhoBulk]));
    expect(rho).toEqual({ activatedCarbon: 480, zeolite13X: 640, zeolite5A: 700 });
    const inside = (id: string, src: string): boolean => {
      const a = ADSORBENTS.find((x) => x.id === id)!;
      const b = a.bulkDensity.find((x) => x.cite.src === src)!;
      return rho[id]! >= b.value.range[0] && rho[id]! <= b.value.range[1];
    };
    //  5A: outside Perry, inside Wankat -- the two books differ and so the page shows both.
    expect(inside("zeolite5A", "perry")).toBe(false);
    expect(inside("zeolite5A", "wankat")).toBe(true);
    expect(inside("zeolite13X", "perry")).toBe(true);
    expect(inside("zeolite13X", "wankat")).toBe(true);
    expect(inside("activatedCarbon", "perry")).toBe(true);
    expect(inside("activatedCarbon", "wankat")).toBe(false);
  });
  it("sets the record's heat of adsorption beside the book's for the pairs both have", () => {
    const heat = (name: string, gas: string): number =>
      cat.find((c) => c.identity.name === name)!.pairs.find((p) => p.pair.adsorbate === gas)!.pair.dHads! / 1000;
    const book = (id: string, gas: string): number =>
      -kcalToKj(ADSORBENTS.find((a) => a.id === id)!.heats.find((h) => h.sorbate === gas)!.kcalPerMol);
    expect(heat("zeolite5A", "N2")).toBe(-16);
    expect(book("zeolite5A", "N2")).toBeCloseTo(-20.92, 6);
    expect(heat("zeolite13X", "N2")).toBe(-18);
    expect(book("zeolite13X", "N2")).toBeCloseTo(-20.92, 6);
    expect(heat("zeolite13X", "CO2")).toBe(-45);
    expect(book("zeolite13X", "CO2")).toBeCloseTo(-41.84, 6);
  });
  it("parses a record and a pair record and refuses anything else", () => {
    expect(parseAdsorbentRecord("kind membrane;\nname NF;")).toBeNull();
    expect(parsePairRecord("recordType other;")).toBeNull();
  });
});

describe("adsorbent-selection: the lesson", () => {
  it("every equation parses", () => {
    for (const s of ADS_SEL_STEPS) {
      if (s.formula) expect(texParses(s.formula), s.title).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), w.sym).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), d.eq).toBe(true);
    }
  });
  it("keeps the C277 text budget: 60 words before the equation, 40 after", () => {
    for (const s of ADS_SEL_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(60);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(40);
    }
  });
  it("cites the engine at lines that say what the lesson claims", () => {
    const all = ADS_SEL_LIMITS.map((l) => l.body).concat(ADS_SEL_STEPS.flatMap((s) => [s.body, s.note ?? ""])).join("\n");
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string> = {
      "Adsorbent.cpp:42": "rho_bulk_ = a->lookupScalarOrDefault(\"rho_bulk\", 0.0);",
      "IsothermModel.cpp:140": "dH_ads_ = p->lookupScalar(\"dH_ads\");",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    const files: Record<string, string> = {
      "Adsorbent.cpp": "src/thermo/adsorbent/Adsorbent.cpp",
      "IsothermModel.cpp": "src/thermo/adsorbent/IsothermModel.cpp",
    };
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, line] = c.split(":");
      expect(tree(files[file!]!).split("\n")[Number(line) - 1], c).toContain(want);
    }
  });
  it("says in words that the count is not a market share", () => {
    const five = ADS_SEL_STEPS.find((s) => s.n === 5)!;
    expect(five.body).toContain("None of the four books gives them");
    expect(ADS_SEL_LIMITS.find((l) => l.id === "reading-not-ranking")!.body).toContain("Nothing here is a market share");
  });
  it("has a quiz whose steps exist (the shape is held in lessonQuiz.test.ts)", () => {
    expect(ADS_SEL_QUIZ.length).toBeGreaterThanOrEqual(5);
    for (const q of ADS_SEL_QUIZ) for (const n of q.steps)
      expect(ADS_SEL_STEPS.some((s) => s.n === n), `${q.id} step ${n}`).toBe(true);
  });
});

describe("adsorbent-selection: the registry", () => {
  const entry = METHOD_TOOLS.find((t) => t.id === "adsorbent-selection")!;
  it("is a live selection tool on the separations shelf, with no engine origin", () => {
    expect(entry.kind).toBe("selection");
    expect(entry.status).toBe("live");
    expect(entry.discipline).toBe("Separations & phase equilibria");
    expect([...entry.origins!].sort()).toEqual(["assumption", "page", "reference"]);
  });
  it("names a Theory Guide label that exists", () => {
    expect(entry.theory).toBe("sec:adsorbent-selection");
    expect(tree("docs/theoryGuide.tex")).toContain("\\label{sec:adsorbent-selection}");
  });
});

describe("adsorbent-selection: the rendered page", () => {
  const html = renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(AdsorbentSelectionTool)));
  it("draws the eight rows, their details and every step", () => {
    for (const a of ADSORBENTS) {
      expect(html, a.id).toContain(`data-adsorbent="${a.id}"`);
      expect(html, a.id).toContain(`data-detail="${a.id}"`);
    }
    for (const s of ADS_SEL_STEPS) expect(html, `step ${s.n}`).toContain(s.title.replace(/&/g, "&amp;"));
  });
  it("draws every matrix cell, every sentence and every note with its page", () => {
    for (const s of SEPARATIONS) {
      expect(html, s.id).toContain(`data-sep-row="${s.id}"`);
      expect(html, s.id).toContain(`data-sep-block="${s.id}"`);
      s.notes.forEach((_, i) => expect(html).toContain(`data-note="${s.id}:${i}"`));
    }
    for (const c of MATRIX) {
      expect(html, `${c.sep}:${c.ads}`).toContain(`data-cell="${c.sep}:${c.ads}"`);
      expect(html, `${c.sep}:${c.ads}`).toContain(`data-why="${c.sep}:${c.ads}"`);
    }
    expect(html).toContain("data-cite=\"perry:16-42\"");
    expect(html).toContain("data-cite=\"wankat:614\"");
    expect(html).toContain("data-cite=\"ruthvenPSA:32\"");
    expect(html).toContain("data-cite=\"ruthven84:41\"");
  });
  it("says what the folder does not print instead of filling the cell", () => {
    expect(html).toContain("not in the cited sources");
    expect(html).toContain("not tonnes, sales or market share");
  });
  it("opens every catalogue record and states that activated carbon has no case", () => {
    for (const c of catalogueAdsorbents()) {
      expect(html, c.identity.name).toContain(`data-record="${c.identity.name}"`);
      expect(html, c.identity.name).toContain(`data-record-raw="${c.identity.name}"`);
      for (const p of c.pairs) expect(html).toContain(`data-pair="${c.identity.name}:${p.pair.adsorbate}"`);
    }
    expect(html).toContain('data-no-case="activatedCarbon"');
    expect(html).toContain("open the case psa01_h2_psa");
  });
  it("draws the temperature rise at the source's worked example", () => {
    expect(html).toContain("25.0 K");
  });
  it("prints no NaN and no undefined", () => {
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
