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
  IP_SOURCES, IP_STEPS, addMonths,
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
