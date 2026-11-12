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
  dataSourcesLesson -- "Where to find property data" (DEV.md 4c C322), held
  to what it claims about itself:

    * every source on the map says what its own page grants, which page was
      read and on what date, and links to it;
    * every source sits in one of the project's licence classes, and every
      class row names the line where Choupo's policy writes it;
    * the worked example quotes its record EXACTLY: each line is read back
      from the file at the line number the page prints, and the NIST URLs
      from the case that declares them;
    * every file:line the page names exists and says what it is cited for;
    * the band arithmetic reproduces the record's own `maxAAD`;
    * the exercise uses every decision and gives a reason for each case;
    * the steps keep the C277 text budget (check_doctrine holds the names);
    * the rendered page draws every source, every record line, the forward
      page by name, and prints no NaN or "undefined".

  WHAT THIS CANNOT PROVE: that a source's page still says, today, what it
  said on the date the row records.  That was read by a person (or a
  fetch) on that date; re-reading it is the evidence string's to start.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  BAND_TMEAN_K, BAND_U_K, CITATIONS, DS_CHOICES, DS_EXERCISE, DS_LIMITS,
  DS_STEPS, DS_WALK, EXAMPLE_DATASETS, EXAMPLE_RECORD, EXAMPLE_URLS, EXCLUDED,
  LICENCE_CLASSES, PICKER, RECORD_LINES, SOURCES, bandPct, roundUp2,
} from "../src/ui/methods/dataSourcesLesson.js";
import { DataSourcesTool, NEXT_PAGE_NAME } from "../src/ui/methods/DataSourcesTool.js";

const ROOT = new URL("../../", import.meta.url);
const lines = (rel: string): string[] =>
  readFileSync(new URL(rel, ROOT), "utf-8").split("\n");
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

describe("data-sources: the map of free sources", () => {
  it("carries the eight sources of the approved scope", () => {
    expect(SOURCES.map((s) => s.id).sort()).toEqual(
      ["chemsep", "codata", "nasa", "pubchem", "sander", "sds", "thermoml", "webbook"]);
  });
  it("every source says what it holds, how to reach it, how to cite it and what its licence allows", () => {
    for (const s of SOURCES) {
      for (const f of ["holds", "access", "cite", "licence", "allows", "read"] as const)
        expect(s[f].trim().length, `${s.id}.${f}`).toBeGreaterThan(10);
      expect(s.date, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("every source links to its own page, over https except where the host refuses TLS", () => {
    //  chemsep.org answered only over plain http on 2026-11-12 (the TLS
    //  handshake failed); every other host is https.
    for (const s of SOURCES) {
      if (s.id === "chemsep") expect(s.url).toMatch(/^http:\/\/www\.chemsep\.org\//);
      else expect(s.url, s.id).toMatch(/^https:\/\//);
    }
  });
  it("every licence class a source names is a row of the policy table", () => {
    const classes = new Set(LICENCE_CLASSES.map((c) => c.cls));
    for (const s of SOURCES) expect(classes.has(s.cls), s.id).toBe(true);
  });
  it("the excluded classes include the NonCommercial one, with its source read", () => {
    const nc = EXCLUDED.find((e) => e.id === "noncommercial");
    expect(nc?.example).toMatch(/non-commercial/);
    expect(nc?.url).toMatch(/^https:\/\//);
    expect(nc?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("PubChem claims no licence it could not read", () => {
    const p = SOURCES.find((s) => s.id === "pubchem")!;
    expect(p.licence).toMatch(/could not be read/);
    expect(DS_LIMITS.some((l) => /PubChem/.test(l.body))).toBe(true);
  });
  it("the picker covers pure, mixture, formation, solubility and identity data", () => {
    expect(PICKER.length).toBeGreaterThanOrEqual(6);
    expect(PICKER.some((r) => r.id === "identity")).toBe(true);
  });
});

describe("data-sources: the policy table", () => {
  it("has the four permissions for every class, and a rule line", () => {
    for (const c of LICENCE_CLASSES) {
      for (const f of ["read", "cite", "copyValues", "redistribute"] as const)
        expect(c[f].trim().length, `${c.cls}.${f}`).toBeGreaterThan(1);
      expect(c.rule, c.cls).toMatch(/:\d+$/);
    }
  });
  it("NonCommercial and no-grant copy no value into a public record", () => {
    expect(LICENCE_CLASSES.find((c) => c.cls === "noncommercial")!.copyValues).toMatch(/^no/);
    expect(LICENCE_CLASSES.find((c) => c.cls === "no-grant")!.copyValues).toMatch(/^no/);
  });
  it("every rule line exists in the tree", () => {
    for (const c of LICENCE_CLASSES) {
      const [file, n] = c.rule.split(":");
      const at = lines(file!)[Number(n) - 1];
      expect(at, c.rule).toBeTruthy();
    }
  });
});

describe("data-sources: every file:line the page names", () => {
  it("is in the tree and says what it is cited for", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(10);
    for (const c of CITATIONS) {
      const at = lines(c.file)[c.line - 1] ?? "";
      expect(at, `${c.file}:${c.line} should contain "${c.contains}"`).toContain(c.contains);
    }
  });
  it("every policy rule the table names is also among the citations", () => {
    const cited = new Set(CITATIONS.map((c) => `${c.file}:${c.line}`));
    for (const c of LICENCE_CLASSES) expect(cited.has(c.rule), c.rule).toBe(true);
  });
  it("every file:line written in a step is among the citations", () => {
    const cited = new Set(CITATIONS.map((c) => `${c.file}:${c.line}`));
    const prose = [...DS_STEPS.flatMap((s) => [s.body, s.note ?? ""]),
      ...SOURCES.map((s) => s.allows)].join("\n");
    const found = [...prose.matchAll(/([\w./-]+\.(?:H|cpp|md|dat|py)):(\d+)/g)];
    expect(found.length).toBeGreaterThanOrEqual(6);
    for (const m of found) {
      const ref = `${m[1]}:${m[2]}`.replace(/\s+/g, "");
      expect(cited.has(ref), `${ref} is written on the page but not in CITATIONS`).toBe(true);
    }
  });
});

describe("data-sources: the worked example is quoted, not paraphrased", () => {
  const rec = lines(EXAMPLE_RECORD);
  it("each quoted line is the file's line at that number", () => {
    for (const r of RECORD_LINES)
      expect(rec[r.line - 1]?.trim(), `${EXAMPLE_RECORD}:${r.line}`).toBe(r.text);
  });
  it("quotes the review status, the DOIs and the verdict", () => {
    const all = RECORD_LINES.map((r) => r.text).join("\n");
    for (const needle of ["autoPromoted", "humanReviewed false", "10.1021/je0601309",
      "10.1021/je301290c", "verdict     validated"])
      expect(all).toContain(needle);
  });
  it("the NIST URLs are the ones the case declares", () => {
    const ds = lines(EXAMPLE_DATASETS);
    for (const u of EXAMPLE_URLS) expect(ds[u.line - 1], `line ${u.line}`).toContain(u.url);
  });
  it("the band arithmetic reproduces the record's maxAAD, and the held-out AAD sits inside it", () => {
    const maxLine = RECORD_LINES.find((r) => r.text.startsWith("maxAAD"))!;
    const recorded = Number(/maxAAD\s+([\d.]+)/.exec(maxLine.text)![1]);
    expect(roundUp2(bandPct(BAND_U_K, BAND_TMEAN_K))).toBeCloseTo(recorded, 9);
    //  The two inputs are the record's own words at line 120.
    const rule = rec[119]!;
    expect(rule).toContain("U95 = 0.3 K");
    expect(rule).toContain("(341.73 K)");
    const aad = Number(/aad_pct\s+([\d.]+)/.exec(
      RECORD_LINES.find((r) => r.text.startsWith("aad_pct"))!.text)![1]);
    expect(aad).toBeLessThan(recorded);
  });
});

describe("data-sources: the exercise", () => {
  it("uses every decision at least once and explains each case", () => {
    for (const c of DS_CHOICES)
      expect(DS_EXERCISE.some((e) => e.answer === c), c).toBe(true);
    for (const e of DS_EXERCISE) expect(e.why.trim().length, e.id).toBeGreaterThan(20);
    expect(DS_WALK.length).toBeGreaterThanOrEqual(5);
  });
  it("the answers follow the classes of the sources they name", () => {
    const cls = (id: string): string | undefined => SOURCES.find((s) => s.id === id)?.cls;
    for (const e of DS_EXERCISE) {
      if (e.answer === "enter") expect(["open", "public-domain"]).toContain(cls(e.source));
      if (e.answer === "primary") expect(cls(e.source)).toBe("aggregator");
    }
  });
});

describe("data-sources: the text budget", () => {
  it("each step keeps at most 60 words before its equation and 40 after", () => {
    for (const s of DS_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(60);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(40);
    }
  });
});

describe("data-sources: the rendered page", () => {
  const html = renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(DataSourcesTool)));
  it("draws every source, every excluded class, every record line and every case", () => {
    for (const s of SOURCES) expect(html, s.id).toContain(`data-source="${s.id}"`);
    for (const e of EXCLUDED) expect(html, e.id).toContain(`data-excluded="${e.id}"`);
    for (const r of RECORD_LINES) expect(html, String(r.line)).toContain(`data-record-line="${r.line}"`);
    for (const e of DS_EXERCISE) expect(html, e.id).toContain(`data-exercise-case="${e.id}"`);
    for (const c of LICENCE_CLASSES) expect(html, c.cls).toContain(`data-licence-class="${c.cls}"`);
  });
  it("draws every step and the band", () => {
    for (const s of DS_STEPS) expect(html, `step ${s.n}`).toContain(s.title);
    expect(html).toContain("0.088 %");
  });
  it("names the page it leads to, without linking a page that does not exist", () => {
    expect(html).toContain(NEXT_PAGE_NAME);
  });
  it("prints no NaN and no undefined", () => {
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
