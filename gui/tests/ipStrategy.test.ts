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
  ipStrategy -- the IP-as-strategy EduTool (DEV.md 4c C140), held to what it
  claims about itself:

    * every article the prose cites as "EPC Art. N", "EPC Rule N", "CPI Art.
      N", "TRIPS Art. N" or "35 USC N" is among the articles its source row
      says were READ -- a citation added to the prose without being read
      fails here;
    * every source has a public https link and says what was read in it;
    * the calendar arithmetic of the deadline calculator, including the
      month-end clamp, and the periods it uses against the formula;
    * the exercise: three inventions (process, product, method), every
      choice with the rival's move and its consequence, the company
      fictitious;
    * the rendered page says it is not legal advice, draws every step and
      every source, prints no NaN or "undefined", and does not carry the
      details the research could not verify (the amount of Whittle's fee and
      who declined to pay it).

  WHAT THIS CANNOT PROVE, said plainly: that a cited article SAYS what the
  sentence citing it says.  That was read by a person, on the date the
  sources table states, and is the author's responsibility.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  DEADLINES, EXERCISE, EXERCISE_COMPANY, IP_CHOICES, IP_LIMITS, IP_QUIZ,
  IP_SOURCES, IP_STEPS, MEMBRANE_RECORDS, addMonths,
} from "../src/ui/methods/ipStrategyLesson.js";
import { IpStrategyTool } from "../src/ui/methods/IpStrategyTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const prose = [
  ...IP_STEPS.flatMap((s) => [s.body, s.note ?? "", ...(s.where ?? []).map((w) => w.means)]),
  ...IP_QUIZ.flatMap((q) => [q.q, q.feedback, ...q.options]),
  ...EXERCISE.flatMap((e) => [e.facts, e.why,
    ...IP_CHOICES.flatMap((c) => [e.outcomes[c].rival, e.outcomes[c].result])]),
  ...IP_LIMITS.map((l) => l.body),
].join("\n");

const sourceRead = (short: string): string => {
  const s = IP_SOURCES.find((x) => x.short === short);
  expect(s, `no source "${short}"`).toBeTruthy();
  return s!.read;
};

/** The article numbers a source row says were read, e.g. "Arts. 52, 54" or
 *  "Rules 36, 159" -> {"52", "54"} / {"36", "159"}. */
function numbersAfter(read: string, word: RegExp): Set<string> {
  const out = new Set<string>();
  for (const m of read.matchAll(word)) {
    const tail = read.slice(m.index! + m[0].length).split(";")[0]!;
    for (const n of tail.matchAll(/(\d+)/g)) out.add(n[1]!);
  }
  return out;
}

describe("ip-strategy: the registry entry", () => {
  it("is live on the design & economics shelf, as notes, with its origins", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "ip-strategy");
    expect(t).toBeTruthy();
    expect(t!.status).toBe("live");
    expect(t!.kind).toBe("notes");
    expect(t!.discipline).toBe("Process design & economics");
    expect(t!.origins).toEqual(["page", "reference", "assumption"]);
    expect(t!.teaches).toMatch(/Not legal advice/);
  });
});

describe("ip-strategy: every cited article was read", () => {
  it("EPC articles and rules", () => {
    const read = sourceRead("EPC");
    const arts = numbersAfter(read, /Arts\./g);
    const rules = numbersAfter(read, /Rules/g);
    for (const m of prose.matchAll(/EPC Art\. (\d+)/g))
      expect(arts.has(m[1]!), `EPC Art. ${m[1]} is cited but not in the EPC row`).toBe(true);
    for (const m of prose.matchAll(/EPC Rule (\d+)/g))
      expect(rules.has(m[1]!), `EPC Rule ${m[1]} is cited but not in the EPC row`).toBe(true);
  });
  it("CPI, TRIPS and 35 USC", () => {
    const cpi = numbersAfter(sourceRead("CPI"), /Arts\./g);
    for (const m of prose.matchAll(/CPI Art\. (\d+)/g))
      expect(cpi.has(m[1]!), `CPI Art. ${m[1]} is cited but not read`).toBe(true);
    const trips = numbersAfter(sourceRead("TRIPS"), /Arts\./g);
    for (const m of prose.matchAll(/TRIPS Art\. (\d+)/g))
      expect(trips.has(m[1]!), `TRIPS Art. ${m[1]} is cited but not read`).toBe(true);
    const usc = sourceRead("35 USC");
    for (const m of prose.matchAll(/35 USC (\d+)/g))
      expect(usc, `35 USC ${m[1]} is cited but not read`).toContain(m[1]!);
  });
  it("every source has a public link and says what was read", () => {
    expect(IP_SOURCES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(IP_SOURCES.map((s) => s.short)).size).toBe(IP_SOURCES.length);
    for (const s of IP_SOURCES) {
      expect(s.url, s.short).toMatch(/^https:\/\//);
      expect(s.read.trim().length, s.short).toBeGreaterThan(5);
      expect(s.cite.trim().length, s.short).toBeGreaterThan(10);
    }
  });
});

describe("ip-strategy: the deadline calculator", () => {
  it("adds calendar months, clamping the day at a month's end", () => {
    expect(addMonths("2026-01-15", 12)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", 18)).toBe("2027-07-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-01-15", 240)).toBe("2046-01-15");
    expect(addMonths("15/01/2026", 12)).toBeNull();
    expect(addMonths("2026-13-01", 1)).toBeNull();
  });
  it("uses the periods the formula and the cited articles state", () => {
    const months = Object.fromEntries(DEADLINES.map((d) => [d.id, d.months]));
    expect(months).toEqual({ prio: 12, pub: 18, pct: 30, ep: 31, exp: 240 });
    const f = IP_STEPS.find((s) => s.n === 6)!.formula!;
    for (const k of ["12", "18", "30", "20"]) expect(f).toContain(`${k}\\ \\text{`);
  });
});

describe("ip-strategy: the exercise", () => {
  it("has a process, a product and a method, each choice with its consequence", () => {
    expect(EXERCISE.map((e) => e.id)).toEqual(["process", "product", "method"]);
    expect(EXERCISE_COMPANY).toMatch(/fictitious/);
    for (const e of EXERCISE) {
      expect(IP_CHOICES).toContain(e.defended);
      for (const c of IP_CHOICES) {
        expect(e.outcomes[c].rival.length, `${e.id}/${c}`).toBeGreaterThan(30);
        expect(e.outcomes[c].result.length, `${e.id}/${c}`).toBeGreaterThan(30);
      }
    }
  });
});

describe("ip-strategy: the rendered page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(IpStrategyTool)));
  const text = html.replace(/<[^>]+>/g, " ");
  it("says it is not legal advice, at the top", () => {
    expect(html).toContain("data-not-legal-advice");
    expect(text.indexOf("not legal advice")).toBeLessThan(text.indexOf(IP_STEPS[0]!.title));
  });
  it("draws every step, every source and the exercise", () => {
    for (const s of IP_STEPS) expect(html, `step ${s.n}`).toContain(s.title.replace(/'/g, "&#x27;"));
    for (const s of IP_SOURCES) expect(html, s.short).toContain(s.url.replace(/&/g, "&amp;"));
    for (const e of EXERCISE) expect(html).toContain(`data-exercise-invention="${e.id}"`);
  });
  it("prints no NaN or undefined, and none of the unverified details", () => {
    expect(text).not.toMatch(/\bNaN\b|\bundefined\b/);
    expect(text).not.toMatch(/£\s?5|Air Ministry/);
  });
});

/*  THE REVERSE-OSMOSIS CASE STUDY (C140, fourth addendum).  Every citation
 *  the case makes is held to a source row that says it was read, every page
 *  of a reported opinion to the span that row says was read, and every
 *  number of the table to the place its row names -- and the numbers the
 *  prose repeats must be the table's.  What this cannot prove: that a page
 *  of an opinion SAYS what the sentence citing it says.  That was read by a
 *  person on 2026-10-26 and is the author's responsibility. */
describe("ip-strategy: the reverse-osmosis case study", () => {
  const caseSteps = IP_STEPS.filter((s) => s.n >= 19 && s.n <= 21);
  const caseProse = [
    ...caseSteps.map((s) => s.body),
    ...IP_QUIZ.filter((q) => q.steps.some((n) => n >= 19)).flatMap((q) => [q.q, q.feedback]),
  ].join("\n");
  const step = (n: number): string => IP_STEPS.find((s) => s.n === n)!.body;

  it("is three steps, 19 to 21, and the quiz asks about it", () => {
    expect(caseSteps.map((s) => s.n)).toEqual([19, 20, 21]);
    expect(IP_QUIZ.find((q) => q.id === "cadotte-title")!.steps).toEqual([20, 21]);
  });

  it("cites every reported opinion at a page inside the span its source row read", () => {
    const pins = [...caseProse.matchAll(/(\d+) (F\.[23]d) at ([0-9][0-9, -]*)/g)];
    expect(pins.length).toBeGreaterThanOrEqual(25);
    for (const m of pins) {
      const row = IP_SOURCES.find((s) => s.short.startsWith(`${m[1]} ${m[2]} `));
      expect(row, `${m[1]} ${m[2]} is cited but has no source row`).toBeTruthy();
      const span = /pp\. (\d+)-(\d+)/.exec(row!.read);
      expect(span, `${row!.short} does not say which pages were read`).toBeTruthy();
      const [lo, hi] = [Number(span![1]), Number(span![2])];
      for (const part of m[3]!.split(",").map((p) => p.trim()).filter(Boolean)) {
        const [first, second] = part.split("-");
        const pages = [Number(first)];
        //  "1553-54" is shorthand for 1553 to 1554.
        if (second) pages.push(Number(first!.slice(0, first!.length - second.length) + second));
        for (const page of pages)
          expect(page >= lo && page <= hi,
            `${m[0]}: page ${page} is outside ${row!.short}'s pp. ${lo}-${hi}`).toBe(true);
      }
    }
  });

  it("cites every patent, the retrospective and the European filing by a source row", () => {
    const shorts = new Set(IP_SOURCES.map((s) => s.short));
    for (const m of caseProse.matchAll(/US (\d,\d{3},\d{3})/g))
      expect(shorts.has(`US ${m[1]}`), `US ${m[1]} is cited but has no source row`).toBe(true);
    for (const [inProse, short] of [["(Cadotte, 1985)", "Cadotte 1985"],
      ["(Elsevier, 2022)", "Elsevier 2022"], ["EP 0 015 149", "EP 0 015 149"],
      ["US 3,133,132", "US 3,133,132"], ["US 3,133,137", "US 3,133,137"],
      ["US 4,277,344", "US 4,277,344"], ["939 F.2d", "939 F.2d 1568"],
      ["982 F.2d", "982 F.2d 1546"], ["67 F.3d", "67 F.3d 931"]] as const) {
      expect(caseProse, `${inProse} is never cited`).toContain(inProse);
      expect(shorts.has(short), `no source row "${short}"`).toBe(true);
    }
  });

  it("holds each table row to a source row and the place it names", () => {
    expect(MEMBRANE_RECORDS.length).toBe(6);
    for (const r of MEMBRANE_RECORDS) {
      const row = IP_SOURCES.find((s) => s.short === r.source);
      expect(row, `${r.id}: no source "${r.source}"`).toBeTruthy();
      const at = /^at (\d+)$/.exec(r.where);
      if (at) {
        const span = /pp\. (\d+)-(\d+)/.exec(row!.read)!;
        expect(Number(at[1])).toBeGreaterThanOrEqual(Number(span[1]));
        expect(Number(at[1])).toBeLessThanOrEqual(Number(span[2]));
      } else {
        expect(row!.read, `${r.id}: "${r.where}" is not among what ${r.source} says was read`)
          .toContain(r.where);
      }
    }
  });

  it("pins the stated numbers, and the prose repeats the table's", () => {
    const rec = Object.fromEntries(MEMBRANE_RECORDS.map((r) => [r.id, r]));
    //  US 3,133,132 col. 2 and Table I (1,500 psig; 5.25 % and 3.5 % NaCl).
    expect(rec["ls-col2"]!.feed).toBe("5.25 % sodium chloride");
    expect(rec["ls-col2"]!.salt).toContain("500 ppm");
    expect(rec["ls-col2"]!.flux).toContain("8 gal");
    expect(rec["ls-table1"]!.salt).toBe("0.043 to 0.42 % salt in the product water");
    expect(rec["ls-table1"]!.flux).toBe("2.0 to 20 gal/ft²·day");
    for (const id of ["ls-col2", "ls-table1"]) expect(rec[id]!.pressure).toBe("1,500 psig");
    //  982 F.2d at 1549: the notebook results.
    expect(rec["mri-1977"]!.flux).toBe("12.7 and 9.5 gfd");
    expect(rec["mri-1977"]!.salt).toBe("95.0 and 88.5 % rejection");
    expect(rec["mri-1977"]!.pressure).toBe("1,500 psi");
    expect(rec["filmtec-1978"]!.flux).toBe("13.1 and 11.0 gfd");
    expect(rec["filmtec-1978"]!.salt).toBe("98.0 % rejection");
    //  US 4,277,344 cols. 11 and 17.
    expect(rec["us344-col11"]!.salt).toBe("at least 99.3 % rejection");
    expect(rec["us344-col11"]!.flux).toBe("more than 1,200 l/m²·d");
    expect(rec["us344-ex1"]!.salt).toBe("99.5 % rejection");
    expect(rec["us344-ex1"]!.flux).toBe("35.4 gfd (1,444 l/m²·d)");
    expect(rec["us344-ex1"]!.pressure).toBe("1,000 psi (68.0 atm)");
    //  The prose says the same numbers, not a second set.
    expect(step(19)).toContain("5.25 % sodium chloride solution to about 500 parts per");
    expect(step(19)).toContain("at least 99.3");
    expect(step(19)).toContain("99.5 % at 35.4 gfd at 1,000 psi");
    expect(step(20)).toContain("gave 12.7 and 9.5 gfd at 95.0 and 88.5 % rejection");
    expect(step(20)).toContain("obtained 13.1 and 11.0 gfd at 98.0 %");
  });

  it("pins the dates and what each court decided", () => {
    expect(step(19)).toContain("On 29 November 1960");
    expect(step(19)).toContain("12 May 1964");
    expect(step(19)).toContain("filed on 20 March 1962");
    expect(step(20)).toContain("On 17 November 1977");
    expect(step(20)).toContain("left MRI on 31 December 1977");
    expect(step(20)).toContain("on 23 February 1978");
    expect(step(20)).toContain("applied for the patent on 22 February 1979");
    expect(step(20)).toMatch(/Federal Circuit vacated the injunction/);
    expect(step(20)).toMatch(/reversed on title alone and vacated the holdings of validity and infringement/);
    expect(step(20)).toMatch(/not a sham/);
    expect(step(20)).toMatch(/restitution was refused/);
    //  The European filing claimed the US date one day inside the priority
    //  year -- the calculator of step 6 says where that year ends.
    expect(addMonths("1979-02-22", 12)).toBe("1980-02-22");
    expect(step(20)).toContain("21 February 1980");
    expect(sourceRead("EP 0 015 149")).toContain("priority 22.02.1979 US 14164");
  });

  it("states no ratio between the two membranes, and says why", () => {
    const all = [caseProse, ...MEMBRANE_RECORDS.flatMap((r) => Object.values(r))].join("\n");
    expect(all).not.toMatch(/\b(5|five)\s?(x|×|times|-fold)|fivefold|\bfactor of\b/i);
    expect(IP_LIMITS.find((l) => l.id === "membrane-numbers")!.body)
      .toMatch(/computes no ratio/);
  });

  it("draws the table, every row", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null,
      createElement(IpStrategyTool)));
    for (const r of MEMBRANE_RECORDS) expect(html).toContain(`data-membrane-record="${r.id}"`);
    expect(html).toContain("Case study: the reverse-osmosis membrane");
  });
});
