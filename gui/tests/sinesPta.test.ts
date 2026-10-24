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
      the capital growth, "seven" statements, "more than twice") against
      the data it is computed from;
    * every quotation in its original language against the research record,
      verbatim, so a quotation nobody read back cannot reach the page;
    * every source short name the page cites against the record's §1;
    * the page renders, with no NaN, no "undefined";
    * a small DENYLIST of words the scope ruling excludes.

  WHAT THE DENYLIST CANNOT PROVE, said plainly: it catches the obvious
  categories (a minister, a government, an honorific before a name, an
  allegation word) in the rendered page and the registry line.  It cannot
  tell that a sentence attributes a motive, that a capitalised word is a
  person's name, or that a quotation is used out of its context -- those are
  read by a person, and the record says what was read.  It deliberately
  lists NO person's name: a test that named the people it excludes would
  put them in the tree.
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
  APPRAISAL_INPUTS, CAPEX_HISTORY, DEFAULT_APPRAISAL, LOSS_METRICS, OFFTAKE,
  PUBLISHED_SPREADS, SOURCES, TIMELINE, TORNADO_RANGES, appraise,
  breakEvenSpread, merchantShareAt, npvCurve, npvSlopeInSpread, tornadoFigure,
  type Appraisal,
} from "../src/ui/methods/sinesPta.js";
import {
  SINES_CHECKLIST, SINES_LIMITS, SINES_MARKET_QUOTES, SINES_STEPS,
  SINES_WARNINGS,
} from "../src/ui/methods/sinesPtaLesson.js";
import { SinesPtaTool } from "../src/ui/methods/SinesPtaTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const RECORD = tree("docs/design/the-sines-pta-plant-a-negative-case.md");
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
    expect(st("captive")).toBe("documented");
    expect(st("capex")).toBe("documented");
    expect(st("spread")).toBe("published");
    for (const k of ["utilisation", "conversionCost", "merchantDiscount",
      "fixedCost", "usdPerEur", "discountRate", "life"] as const)
      expect(st(k)).toBe("synthetic");
    expect(DEFAULT_APPRAISAL.capacity).toBe(OFFTAKE.capacity);
    expect(DEFAULT_APPRAISAL.captive).toBe(OFFTAKE.contract);
    //  the record's §10 table lists each SYNTHETIC input as such
    const sec10 = RECORD.split("## 10.")[1]!.split("## 11.")[0]!;
    for (const w of ["Conversion cost", "Merchant discount", "Fixed costs",
      "Exchange rate", "Discount rate", "Utilisation"])
      expect(sec10).toMatch(new RegExp(`\\| ${w}[^\\n]*SYNTHETIC`));
  });
});

describe("what the prose computes is computed from the data", () => {
  it("the merchant shares of step 4", () => {
    expect(merchantShareAt(700, 450)).toBeCloseTo(0.357, 3);
    expect(merchantShareAt(700, 470)).toBeCloseTo(0.329, 3);
    const d = SINES_STEPS.find((s) => s.n === 4)!.derivation!.map((x) => x.eq).join(" ");
    expect(d).toContain("0.357");
    expect(d).toContain("0.329");
    expect(OFFTAKE.ptaPerPet * OFFTAKE.petCapacity).toBeCloseTo(476, 9);
    expect(stepBody(4)).toContain("0.85 × 560 = 476");
  });

  it("the capital cost of step 3: seven statements, +28 %, 510 to 660 EUR per t/yr", () => {
    expect(CAPEX_HISTORY.length).toBe(7);
    expect(stepBody(3)).toContain("stated seven times");
    const lo = Math.min(...CAPEX_HISTORY.map((c) => c.value));
    const hi = Math.max(...CAPEX_HISTORY.map((c) => c.value));
    expect([lo, hi]).toEqual([360, 462.056]);
    expect(Math.round(100 * (hi / lo - 1))).toBe(28);
    expect(stepBody(3)).toContain("+28 %");
    expect(Math.round(lo / 0.7 / 10) * 10).toBe(510);
    expect(Math.round(hi / 0.7 / 10) * 10).toBe(660);
  });

  it("step 7's 'more than twice the Asian one in every year from 2014 to 2017'", () => {
    const yearly = PUBLISHED_SPREADS.filter((r) => r.west !== null);
    expect(yearly.map((r) => r.year)).toEqual(["2014", "2015", "2016", "2017"]);
    for (const r of yearly) expect(r.west!).toBeGreaterThan(2 * r.asia);
    expect(stepBody(7)).toContain("more than twice the Asian one");
  });

  it("the spreads and the loss figures the page states are in the record", () => {
    for (const r of PUBLISHED_SPREADS) {
      if (r.west === null) expect(RECORD).toContain(`average industry margin of Asia is ${r.asia}$/t`);
      else expect(RECORD).toContain(`| ${r.year} | ${r.asia} | ${r.west} |`);
    }
    for (const v of ["EUR 381 M", "EUR 520 M", "EUR 351 M", "EUR 211 M",
      "≈ EUR 900 M", "≥ EUR 400 M", "−EUR 131.4 M", "EUR 28 M", "EUR 100 000"])
      expect(RECORD).toContain(v);
    expect(LOSS_METRICS.length).toBe(9);
    expect(stepBody(10)).toContain("nine figures");
    expect(stepBody(10)).toContain("must not be added");
  });
});

describe("every quotation is the record's, verbatim", () => {
  const sec11 = RECORD.split("## 11.")[1] ?? "";
  const originals = [
    ...SINES_WARNINGS.flatMap((w) => w.quotes.map((q) => q.original)),
    ...SINES_MARKET_QUOTES.map((q) => q.original),
  ];
  it("the record carries a quotation section", () => {
    expect(sec11.length).toBeGreaterThan(1000);
  });
  it.each(originals)("%s", (o) => {
    expect(prose(sec11)).toContain(prose(o));
  });
  it("every non-English quotation has its translation", () => {
    for (const w of SINES_WARNINGS) for (const q of w.quotes)
      expect(q.english.length).toBeGreaterThan(10);
  });
  it("every quotation in a step body is in the record too", () => {
    const bodies = SINES_STEPS.map((s) => s.body).join(" ");
    const quoted = [...bodies.matchAll(/"([^"]{12,})"/g)].map((m) => m[1]!);
    expect(quoted.length).toBeGreaterThan(8);
    for (const q of quoted) expect(prose(RECORD)).toContain(prose(q));
  });
});

describe("every source the page cites is defined", () => {
  const shorts = SOURCES.map((s) => s.short);
  const known = (src: string) => /CPI-2019|EY-final|LSB-2012|LSB-2014|IVL-AR20\d\d|IVL-SET-2025|EC-2007|USITC-4604/.test(src);
  it("in the data tables and the lesson", () => {
    const cited = [
      ...CAPEX_HISTORY.map((c) => c.source), ...PUBLISHED_SPREADS.map((c) => c.source),
      ...LOSS_METRICS.map((c) => c.source), ...TIMELINE.map((c) => c.source),
      ...SINES_WARNINGS.flatMap((w) => w.quotes.map((q) => q.source)),
      ...SINES_MARKET_QUOTES.map((q) => q.source),
    ];
    for (const c of cited) expect(known(c), c).toBe(true);
    for (const s of ["CPI-2019", "EY-final", "LSB-2012", "LSB-2014", "IVL-SET-2025",
      "EC-2007", "USITC-4604"]) {
      expect(shorts).toContain(s);
      expect(RECORD).toContain(`| ${s} |`);
    }
  });
});

describe("the page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(SinesPtaTool)));

  it("renders every step, the tables and the limits, with no NaN", () => {
    for (const s of SINES_STEPS) expect(html).toContain(s.title.replace(/'/g, "&#x27;"));
    expect(html).toContain("These figures overlap.");
    expect(html).toContain("break-even spread s*");
    for (const l of SINES_LIMITS) expect(html).toContain(l.title);
    for (const c of SINES_CHECKLIST.slice(0, 3)) expect(html).toContain(c.slice(0, 30));
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("labels the synthetic inputs as synthetic", () => {
    const n = (html.match(/synthetic teaching value/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(
      APPRAISAL_INPUTS.filter((x) => x.status === "synthetic").length);
    expect(html).toContain("not a reconstruction");
  });

  //  The scope ruling: institutions only, no politics.  See the header for
  //  what this denylist cannot prove.
  const DENY = [
    /\bminist(er|ers|ry|ro|ros|ério)\b/i, /\bprime minister\b/i,
    /\bprimeiro.ministro\b/i, /\bgovern(ment|o)\b/i, /\bcorrup/i,
    /\bbrib/i, /\bfraud/i, /\bnational interest\b/i, /\binteresse nacional\b/i,
    /\bConselho de Ministros\b/, /\b(Sr|Sra|Dr|Dra|Prof|Mr|Mrs|Ms)\.\s/,
    /\bdeputad[oa]s?\b/i, /\b(PSD|CDS-PP|PCP)\b/,
  ];
  const registryLine = (() => {
    const t = METHOD_TOOLS.find((m) => m.id === "sines-pta")!;
    return `${t.label} ${t.teaches}`;
  })();
  it.each(DENY.map((r) => [String(r), r] as const))("names nothing excluded: %s", (_n, r) => {
    expect(html).not.toMatch(r);
    expect(registryLine).not.toMatch(r);
  });
});

describe("the registry", () => {
  it("is live on the design & economics shelf, with its dispatch", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "sines-pta");
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("notes");
    expect(t?.discipline).toBe("Process design & economics");
    expect(t?.theory).toBe("ch:economics");
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "sines-pta" ? <SinesPtaTool />');
    expect(tree("docs/theoryGuide.tex")).toContain("\\label{ch:economics}");
  });
});
