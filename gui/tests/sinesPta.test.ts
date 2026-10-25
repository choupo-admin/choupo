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
  The Sines PTA EduTool (C143), held to its record and to closed forms.

  WHAT THIS HOLDS:
    * the appraisal arithmetic against closed forms it can be checked by
      hand (an annuity, a zero discount rate, the straight line in the
      spread, the break-even that zeroes it);
    * every number the PROSE states that is computed (the merchant shares,
      "seven" statements, "more than twice", "ten figures") against the data
      it is computed from;
    * every number the page TABULATES carries one of the four statuses
      (documented / attributed conclusion / own calculation / assumption),
      and the rendered page shows the word beside it;
    * the teaching-scenario notice sits INSIDE the results box, beside the
      NPV and the break-even, not only in the limits at the end;
    * every quotation in its original language against the research record,
      verbatim, so a quotation nobody read back cannot reach the page;
    * every source short name the page cites against the record's §1, and
      every source with a public https link (never a path into this tree);
    * the page renders, with no NaN, no "undefined";
    * a DENYLIST of the wording the review removed, and a small one of the
      words the scope excludes.

  WHAT THE DENYLISTS CANNOT PROVE, said plainly: they catch phrases, in the
  rendered page and the registry line.  They cannot tell that a sentence
  presumes a link between a warning and a decision, or that a quotation is
  used out of its context -- those are read by a person, and the record says
  what was read next to each passage.  The scope denylist deliberately lists
  NO person's name: a test that named the people it excludes would put them
  in the tree.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/plotting/plotly.js", () => ({
  Plot: () => null,
  PLOT_COLORS: {
    background: "#1f1f1f", grid: "#3b3b3b", axis: "#828282", text: "#c9c9c9",
    accent: "#26c6da", accent2: "#80deea", warm: "#ffb74d", warm2: "#ff8a65",
    series: ["#26c6da", "#ffb74d"],
  },
  PLOT_CONFIG: {},
  darkLayout: { font: {}, xaxis: {}, yaxis: {}, legend: {}, margin: {} },
}));

import {
  APPRAISAL_INPUTS, CAPEX_HISTORY, DEFAULT_APPRAISAL, IVL_REPORT_URLS,
  LOSS_METRICS, OFFTAKE, PUBLISHED_SPREADS, SCENARIO_NOTICE, SOURCES,
  STATUS_WORD, TIMELINE, TORNADO_RANGES, appraise, breakEvenSpread,
  merchantShareAt, npvCurve, npvSlopeInSpread, offtakeRows, tornadoFigure,
  type Appraisal, type Status,
} from "../src/ui/methods/sinesPta.js";
import {
  SINES_CHECKLIST, SINES_INSTITUTIONAL_NOTE, SINES_LIMITS, SINES_MARKET_QUOTES,
  SINES_PURPOSE, SINES_RISKS, SINES_SCOPE, SINES_STEPS, SINES_TITLE,
  type Quote,
} from "../src/ui/methods/sinesPtaLesson.js";
import { SinesPtaTool } from "../src/ui/methods/SinesPtaTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const RECORD = tree("docs/design/the-sines-pta-plant-appraisal-and-project-risk.md");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const stepBody = (n: number): string =>
  prose(SINES_STEPS.find((s) => s.n === n)!.body);

/** The simple case every closed form below is written for. */
const SIMPLE: Appraisal = {
  ...DEFAULT_APPRAISAL,
  constructionYears: 1, delayYears: 0, firstYearUtilisation: 0.9,
  utilisation: 0.9, captiveStopsAfter: 0, life: 15, discountRate: 0.08,
};

describe("the appraisal against closed forms", () => {
  it("one construction year, constant years: NPV is an annuity", () => {
    const a = SIMPLE, i = a.discountRate, N = a.life;
    const P = a.capacity * a.utilisation;
    const Vm = P - Math.min(a.captive, P);
    const CF = 1e-3 * (P * (a.spread - a.conversionCost) - Vm * a.merchantDiscount)
      / a.usdPerEur - a.fixedCost;
    const annuity = (1 - Math.pow(1 + i, -N)) / i;
    const npv = -a.capex / (1 + i) + CF * annuity / (1 + i);
    expect(appraise(a).npv).toBeCloseTo(npv, 9);
    //  and the year rows carry that cash flow
    expect(appraise(a).years[0]!.cashFlow).toBeCloseTo(CF, 12);
  });

  it("the break-even spread zeroes the NPV, and equals its closed form", () => {
    const a = SIMPLE, i = a.discountRate, N = a.life;
    const P = a.capacity * a.utilisation;
    const Vm = P - Math.min(a.captive, P);
    const annuity = (1 - Math.pow(1 + i, -N)) / i;
    const cfStar = a.capex / annuity;                     // NPV = 0
    const sStar = a.conversionCost
      + (a.usdPerEur * 1e3 * (cfStar + a.fixedCost) + Vm * a.merchantDiscount) / P;
    expect(breakEvenSpread(a)).toBeCloseTo(sStar, 9);
    expect(appraise({ ...a, spread: breakEvenSpread(a) }).npv).toBeCloseTo(0, 9);
    //  on the default inputs too (ramp, two construction years)
    const d = DEFAULT_APPRAISAL;
    expect(appraise({ ...d, spread: breakEvenSpread(d) }).npv).toBeCloseTo(0, 9);
  });

  it("at a zero discount rate NPV is the plain sum", () => {
    const a = { ...DEFAULT_APPRAISAL, discountRate: 0 };
    const r = appraise(a);
    const sum = r.years.reduce((s, y) => s + y.cashFlow, 0);
    expect(r.npv).toBeCloseTo(sum - a.capex, 9);
  });

  it("NPV is a straight line in the spread, of the slope it reports", () => {
    const a = DEFAULT_APPRAISAL, b = npvSlopeInSpread(a);
    const n0 = appraise({ ...a, spread: 50 }).npv;
    const n1 = appraise({ ...a, spread: 250 }).npv;
    expect(n1 - n0).toBeCloseTo(200 * b, 9);
    const c = npvCurve(a, 0, 300, 31);
    expect(c.s.length).toBe(31);
    expect(c.npv[30]! - c.npv[0]!).toBeCloseTo(300 * b, 9);
  });

  it("a delay discounts every operating year by one more period", () => {
    const a = SIMPLE;
    const late = appraise({ ...a, delayYears: 1 });
    expect(late.pvOperating).toBeCloseTo(appraise(a).pvOperating / (1 + a.discountRate), 9);
    expect(late.pvCapex).toBeCloseTo(appraise(a).pvCapex, 12);
  });

  it("after the captive customer stops, every tonne is merchant", () => {
    const r = appraise({ ...DEFAULT_APPRAISAL, captiveStopsAfter: 2 });
    expect(r.years[1]!.captiveVolume).toBeCloseTo(450, 12);
    expect(r.years[2]!.captiveVolume).toBe(0);
    expect(r.years[2]!.merchantVolume).toBeCloseTo(r.years[2]!.production, 12);
    expect(r.npv).toBeLessThan(appraise(DEFAULT_APPRAISAL).npv);
  });

  it("the tornado is the appraisal moved one input at a time, largest swing first", () => {
    const fig = tornadoFigure(DEFAULT_APPRAISAL);
    expect(fig.baseNPV).toBeCloseTo(appraise(DEFAULT_APPRAISAL).npv * 1e6, 3);
    expect(fig.bars.length).toBe(TORNADO_RANGES.length);
    for (let k = 1; k < fig.bars.length; k++)
      expect(fig.bars[k - 1]!.swing).toBeGreaterThanOrEqual(fig.bars[k]!.swing);
    const sp = fig.bars.find((b) => b.input === "spread S")!;
    expect(sp.npvLow).toBeCloseTo(appraise({ ...DEFAULT_APPRAISAL, spread: 87 }).npv * 1e6, 3);
    expect(sp.npvHigh).toBeCloseTo(appraise({ ...DEFAULT_APPRAISAL, spread: 231 }).npv * 1e6, 3);
    expect(fig.caveat).toContain("NOT an uncertainty analysis");
  });

  it("every input has a status and a basis; the documented defaults are the record's", () => {
    for (const inp of APPRAISAL_INPUTS) {
      expect(inp.basis.length).toBeGreaterThan(10);
      expect(DEFAULT_APPRAISAL[inp.key]).toBeGreaterThanOrEqual(inp.min);
      expect(DEFAULT_APPRAISAL[inp.key]).toBeLessThanOrEqual(inp.max);
    }
    const st = (k: keyof Appraisal) => APPRAISAL_INPUTS.find((x) => x.key === k)!.status;
    expect(st("capacity")).toBe("documented");
    expect(st("capex")).toBe("documented");
    //  the offtake volume is a MAXIMUM, so buying it is an assumption; and no
    //  spread available at the decision was found, so the spread is one too
    for (const k of ["captive", "spread", "utilisation", "conversionCost",
      "merchantDiscount", "fixedCost", "usdPerEur", "discountRate", "life",
      "delayYears", "captiveStopsAfter"] as const)
      expect(st(k)).toBe("assumption");
    expect(APPRAISAL_INPUTS.filter((x) => x.status === "documented").length).toBe(2);
    expect(DEFAULT_APPRAISAL.capacity).toBe(OFFTAKE.capacity);
    expect(DEFAULT_APPRAISAL.captive).toBe(OFFTAKE.contract);
    //  the capital default is the November 2008 investment of the table
    expect(CAPEX_HISTORY.find((c) => c.when === "Nov 2008")!.value).toBe(DEFAULT_APPRAISAL.capex);
    //  the published spreads are never the default: they are later information
    for (const r of PUBLISHED_SPREADS) {
      expect(DEFAULT_APPRAISAL.spread).not.toBe(r.asia);
      expect(DEFAULT_APPRAISAL.spread).not.toBe(r.west);
    }
    //  the record's §10 table lists each ASSUMPTION as such
    const sec10 = RECORD.split("## 10.")[1]!.split("## 11.")[0]!;
    for (const w of ["Conversion cost", "Merchant discount", "Fixed costs",
      "Exchange rate", "Discount rate", "Utilisation", "Spread",
      "Captive volume"])
      expect(sec10).toMatch(new RegExp(`\\| ${w}[^\\n]*ASSUMPTION`));
  });
});

describe("what the prose computes is computed from the data", () => {
  it("the merchant shares of step 4, and why the calculator shows another", () => {
    expect(merchantShareAt(700, 450)).toBeCloseTo(0.357, 3);
    expect(merchantShareAt(700, 470)).toBeCloseTo(0.329, 3);
    expect(merchantShareAt(630, 450)).toBeCloseTo(0.286, 3);
    expect(appraise(DEFAULT_APPRAISAL).merchantShare).toBeCloseTo(0.286, 3);
    expect(DEFAULT_APPRAISAL.capacity * DEFAULT_APPRAISAL.utilisation).toBeCloseTo(630, 9);
    const d = SINES_STEPS.find((s) => s.n === 4)!.derivation!;
    const eqs = d.map((x) => x.eq).join(" ");
    for (const v of ["0.357", "0.329", "0.286", "630"]) expect(eqs).toContain(v);
    expect(d.map((x) => x.step).join(" ")).toContain("630 kt");
    expect(OFFTAKE.ptaPerPet * OFFTAKE.petCapacity).toBeCloseTo(476, 9);
    expect(stepBody(4)).toContain("0.85 × 560 = 476");
    expect(stepBody(4)).toContain("35.7 %");
    expect(stepBody(4)).toContain("MAXIMUM, not a guaranteed purchase");
    expect(stepBody(4)).toContain("not the whole commercial risk");
  });

  it("the capital cost of step 3: seven statements, kept with their perimeters, no ratio", () => {
    expect(CAPEX_HISTORY.length).toBe(7);
    expect(stepBody(3)).toContain("stated seven times");
    const lo = Math.min(...CAPEX_HISTORY.map((c) => c.value));
    const hi = Math.max(...CAPEX_HISTORY.map((c) => c.value));
    expect([lo, hi]).toEqual([360, 462.056]);
    expect(stepBody(3)).toContain("draws no ratio");
    for (const c of CAPEX_HISTORY) expect(c.perimeter.length).toBeGreaterThan(10);
    //  the conclusion is attributed to the inquiry report
    expect(stepBody(3)).toContain("is the inquiry report's");
  });

  it("step 7's 'more than twice the Asian one in every year from 2014 to 2017'", () => {
    const yearly = PUBLISHED_SPREADS.filter((r) => r.west !== null);
    expect(yearly.map((r) => r.year)).toEqual(["2014", "2015", "2016", "2017"]);
    for (const r of yearly) expect(r.west!).toBeGreaterThan(2 * r.asia);
    expect(stepBody(7)).toContain("more than twice the Asian one");
    expect(stepBody(7)).toContain("not the Sines plant's realised spread");
  });

  it("the spreads and the loss figures the page states are in the record", () => {
    for (const r of PUBLISHED_SPREADS) {
      if (r.west === null) expect(RECORD).toContain(`average industry margin of Asia is ${r.asia}$/t`);
      else expect(RECORD).toContain(`| ${r.year} | ${r.asia} | ${r.west} |`);
    }
    for (const v of ["EUR 381 M", "EUR 520 M", "EUR 351 M", "EUR 211 M",
      "≈ EUR 900 M", "≥ EUR 400 M", "−EUR 131.4 M", "EUR 28 M", "EUR 42.5 M",
      "EUR 100 000", "43.061"])
      expect(RECORD).toContain(v);
    expect(LOSS_METRICS.length).toBe(10);
    expect(stepBody(10)).toContain("ten figures");
    expect(stepBody(10)).toContain("must not be added");
    expect(LOSS_METRICS.find((m) => m.value === "at least EUR 400 M")!.status).toBe("attributed");
  });
});

describe("every number the page tabulates says what it is", () => {
  const STATUSES = Object.keys(STATUS_WORD) as Status[];
  const rows: { source: string; status: Status }[] = [
    ...CAPEX_HISTORY, ...PUBLISHED_SPREADS, ...LOSS_METRICS, ...TIMELINE,
    ...offtakeRows(),
  ];
  it("every row has one of the four statuses", () => {
    for (const r of rows) expect(STATUSES, r.source).toContain(r.status);
    for (const inp of APPRAISAL_INPUTS) expect(STATUSES).toContain(inp.status);
  });
  it("an own calculation cites this page, and a documented row cites a document", () => {
    for (const r of rows) {
      if (r.status === "calculation") expect(r.source).toContain("this page");
      else expect(r.source).toMatch(/CPI-2019|EY-final|LSB-201[24]|IVL-|EC-2007|USITC-4604/);
    }
  });
});

describe("every quotation is the record's, verbatim", () => {
  const sec11 = RECORD.split("## 11.")[1] ?? "";
  const cardQuotes: Quote[] = SINES_RISKS.flatMap((c) => [
    ...c.identified.quotes, ...(c.condition?.quotes ?? []), ...c.decision.quotes]);
  const originals = [
    ...cardQuotes.map((q) => q.original),
    ...SINES_MARKET_QUOTES.map((q) => q.original),
  ];
  it("the record carries a quotation section", () => {
    expect(sec11.length).toBeGreaterThan(1000);
  });
  it.each(originals)("%s", (o) => {
    expect(prose(sec11)).toContain(prose(o));
  });
  it("every non-English quotation has its translation", () => {
    for (const q of cardQuotes) expect(q.english.length).toBeGreaterThan(10);
  });
  it("every quotation in a step body or a card is in the record too", () => {
    const texts = [
      ...SINES_STEPS.map((s) => s.body),
      ...SINES_RISKS.flatMap((c) => [c.identified.note, c.condition?.note ?? "",
        c.decision.note, c.later]),
    ].join(" ");
    const quoted = [...texts.matchAll(/"([^"]{12,})"/g)].map((m) => m[1]!);
    expect(quoted.length).toBeGreaterThan(12);
    for (const q of quoted) expect(prose(RECORD)).toContain(prose(q));
  });
});

describe("every source the page cites is defined, with a public link", () => {
  const shorts = SOURCES.map((s) => s.short);
  const known = (src: string) => /CPI-2019|EY-final|LSB-2012|LSB-2014|IVL-AR20\d\d|IVL-SET-2025|EC-2007|USITC-4604|this page/.test(src);
  it("in the data tables and the lesson", () => {
    const cited = [
      ...CAPEX_HISTORY.map((c) => c.source), ...PUBLISHED_SPREADS.map((c) => c.source),
      ...LOSS_METRICS.map((c) => c.source), ...TIMELINE.map((c) => c.source),
      ...SINES_RISKS.flatMap((c) => [...c.identified.quotes, ...(c.condition?.quotes ?? []),
        ...c.decision.quotes].map((q) => q.source)),
      ...SINES_MARKET_QUOTES.map((q) => q.source),
    ];
    for (const c of cited) expect(known(c), c).toBe(true);
    for (const s of ["CPI-2019", "EY-final", "LSB-2012", "LSB-2014", "IVL-SET-2025",
      "EC-2007", "USITC-4604"]) {
      expect(shorts).toContain(s);
      expect(RECORD).toContain(`| ${s} |`);
    }
  });
  it("every source says what it is and links a public https document", () => {
    for (const s of SOURCES) {
      expect(s.nature.length, s.short).toBeGreaterThan(20);
      expect(s.url, s.short).toMatch(/^https:\/\//);
      expect(s.url).not.toMatch(/docs\/design|github|choupo/i);
      expect(RECORD).toContain(s.url);
    }
    for (const [k, u] of Object.entries(IVL_REPORT_URLS)) {
      expect(u, k).toMatch(/^https:\/\//);
      expect(RECORD).toContain(u);
    }
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(SinesPtaTool)));
  const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

  it("renders every step, the tables and the limits, with no NaN", () => {
    expect(text).toContain(SINES_TITLE);
    for (const s of SINES_STEPS) expect(text).toContain(s.title);
    expect(html).toContain("These figures overlap.");
    expect(html).toContain("break-even spread s*");
    for (const l of SINES_LIMITS) expect(text).toContain(l.title);
    for (const c of SINES_CHECKLIST.slice(0, 3)) expect(text).toContain(c.slice(0, 30));
    for (const c of SINES_RISKS) expect(text).toContain(c.title);
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("states its purpose, its scope and the institutional note", () => {
    expect(text).toContain(prose(SINES_PURPOSE));
    expect(text).toContain(prose(SINES_SCOPE));
    expect(text).toContain(prose(SINES_INSTITUTIONAL_NOTE));
  });

  it("puts the teaching-scenario notice beside the results, not only at the end", () => {
    const start = html.indexOf('data-testid="sines-results"');
    expect(start).toBeGreaterThan(0);
    const box = html.slice(start, html.indexOf("The inputs", start));
    expect(box).toContain('data-testid="scenario-notice"');
    expect(box.replace(/<[^>]+>/g, "")).toContain(
      "Illustrative teaching scenario — not an estimate of the historical project");
    expect(SCENARIO_NOTICE).toContain("Results depend on the assumptions selected below.");
    //  the notice comes BEFORE the numbers it qualifies, inside the same box
    expect(box.indexOf("scenario-notice")).toBeLessThan(box.indexOf("NPV ="));
    expect(box).toContain("break-even spread s*");
    expect(box).toContain('data-status="calculation"');
    //  and the inputs it refers to are BELOW it
    expect(html.indexOf("The inputs")).toBeGreaterThan(start);
    expect(html.indexOf(APPRAISAL_INPUTS[0]!.label)).toBeGreaterThan(start);
  });

  it("shows the status word beside every tabulated number and every input", () => {
    const tagged = (html.match(/data-status="/g) ?? []).length;
    const rows = CAPEX_HISTORY.length + PUBLISHED_SPREADS.length
      + LOSS_METRICS.length + TIMELINE.length + offtakeRows().length
      + APPRAISAL_INPUTS.length;
    expect(tagged).toBeGreaterThanOrEqual(rows);
    for (const w of Object.values(STATUS_WORD)) expect(text).toContain(w);
    const assumed = (html.match(/data-status="assumption"/g) ?? []).length;
    expect(assumed).toBeGreaterThanOrEqual(
      APPRAISAL_INPUTS.filter((x) => x.status === "assumption").length);
  });

  it("separates the decision from what came later", () => {
    for (const w of ["the decision, 2006-2008", "construction and financing, 2009-2011",
      "operation, restructuring and sale, 2012-2017", "after the sale, 2018-2025"])
      expect(text).toContain(w);
    expect(text).toContain("Later information, all of it");
  });

  //  THE WORDING THE REVIEW REMOVED (2026-10-24).  A phrase here is one the
  //  page must not carry again: a claim the documents do not support (that no
  //  analysis was made), a tone of censure, or a generalisation the review
  //  corrected.  Held over the rendered page AND the registry line.
  const REMOVED = [
    /negative case/i, /should have (made|done)/i, /catches it/i, /hindsight/i,
    /not paid a PTA price/i, /never on a product price/i, /what not to do/i,
    /in which it was not done/i, /\+28 ?%/, /synthetic teaching value/i,
    /not from a related party's promise/i, /pulls it toward/i,
    /would each raise/i, /whole risk of a European merchant plant/i,
    /ranks behind other creditors/i,
  ];
  //  The scope: no persons, no political finding; and nothing that hands
  //  responsibility for the content to a tool.
  const DENY = [
    /\bminist(er|ers|ry|ro|ros|ério)\b/i, /\bprime minister\b/i,
    /\bprimeiro.ministro\b/i, /\bgovern(ment|o)\b/i, /\bcorrup/i,
    /\bbrib/i, /\bfraud/i, /\bnational interest\b/i, /\binteresse nacional\b/i,
    /\bConselho de Ministros\b/, /\b(Sr|Sra|Dr|Dra|Prof|Mr|Mrs|Ms)\.\s/,
    /\bdeputad[oa]s?\b/i, /\b(PSD|CDS-PP|PCP)\b/,
    /\b(AI|artificial intelligence|Claude|language model)\b/,
  ];
  const registryLine = (() => {
    const t = METHOD_TOOLS.find((m) => m.id === "sines-pta")!;
    return `${t.label} ${t.teaches}`;
  })();
  it.each([...REMOVED, ...DENY].map((r) => [String(r), r] as const))(
    "carries none of: %s", (_n, r) => {
      expect(text).not.toMatch(r);
      expect(registryLine).not.toMatch(r);
    });
});

describe("the registry", () => {
  it("is live on the design & economics shelf, with its dispatch", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "sines-pta");
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("notes");
    expect(t?.label).toBe(SINES_TITLE);
    expect(t?.discipline).toBe("Process design & economics");
    expect(t?.theory).toBe("ch:economics");
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "sines-pta" ? <SinesPtaTool />');
    expect(tree("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
  });
});
