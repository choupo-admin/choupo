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
  The Front-End Loading EduTool (C58), held to the tree.

  THE AACE TABLE HAS ONE HOME, src/postProcessing/EstimateClass.H, and this
  page carries a transcription because a browser cannot include a C++
  header.  The first block parses the header and requires every field of
  every class to agree -- the move bin/curate/check_estimate_class.py makes
  for the prose copy in docs/design-heuristics.md.  Without it this would be
  a third home held by nothing, which is how the table came to disagree with
  itself once already.

  The rest holds what the page QUOTES: the overlap and the separating ratios
  it states in prose (computed from the parsed header, never typed), the two
  reactor volumes (to the ammonia ladder's goldens), the deliverable matrix
  and the stage table (to the research record), and every case and EduTool
  the stage map names (to the tree and the registry).
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AACE_CLASSES, DELIVERABLE_ROWS, FEL_NUMBERINGS, FEL_STAGES, bandOf,
  bestEqualsWorst, decide, firstSeparatingClass, separatingRatio,
} from "../src/ui/methods/frontEndLoading.js";
import { FEL_LIMITS, FEL_STEPS } from "../src/ui/methods/frontEndLoadingLesson.js";
import { DEFAULT_A, DEFAULT_B } from "../src/ui/methods/FrontEndLoadingTool.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import {
  METHOD_DISCIPLINES, METHOD_TOOLS,
} from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const inTree = (rel: string): boolean =>
  existsSync(new URL(`../../${rel}`, import.meta.url));

const HEADER = tree("src/postProcessing/EstimateClass.H");
const RECORD = tree("docs/design/how-a-process-design-is-staged.md");
const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const step = (n: number): string => prose(FEL_STEPS.find((s) => s.n === n)!.body);

/** The header's rows: {cls, maturity lo/hi, L narrow/wide, H narrow/wide,
 *  "endUsage", "methodology"}. */
function headerRows() {
  const num = String.raw`\s*([-+]?[\d.]+)\s*,`;
  const re = new RegExp(String.raw`\{\s*(\d)\s*,` + num.repeat(6)
    + String.raw`\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\}`, "g");
  return [...HEADER.matchAll(re)].map((m) => ({
    cls: Number(m[1]),
    maturityLo: Number(m[2]), maturityHi: Number(m[3]),
    accLoNarrow: Number(m[4]), accLoWide: Number(m[5]),
    accHiNarrow: Number(m[6]), accHiWide: Number(m[7]),
    endUsage: m[8], methodology: m[9],
  }));
}

describe("the AACE transcription is the engine's one home, field by field", () => {
  it("parses five classes out of EstimateClass.H", () => {
    //  A parse that finds nothing must fail, not compare an empty list.
    expect(headerRows().map((r) => r.cls)).toEqual([5, 4, 3, 2, 1]);
  });

  it("every field of every class agrees", () => {
    expect(AACE_CLASSES.map((r) => ({ ...r }))).toEqual(headerRows());
  });

  it("the line ranges the module cites are where the table is", () => {
    const lines = HEADER.split("\n");
    //  frontEndLoading.ts cites EstimateClass.H:98-114 for the rows.
    expect(lines[97]).toMatch(/static const std::vector<Row> t = \{/);
    expect(lines[98]).toMatch(/^\s*\{5,/);
    expect(lines[113]).toMatch(/^\s*\};/);
    //  The lesson cites :45-52 for the announced pessimistic-corner default.
    const cited = lines.slice(44, 52).join(" ");
    expect(cited).toContain("PESSIMISTIC CORNER");
    expect(cited).toContain("ANNOUNCES");
  });
});

describe("what the lesson says about the table is computed from it", () => {
  it("the overlap is exact: 5's best is 3's worst, 4's best is 2's worst", () => {
    expect(bestEqualsWorst()).toEqual([[5, 3], [4, 2]]);
    expect(step(4)).toContain("Class 5 at its optimistic end is the same band "
      + "as Class 3 at its pessimistic end");
    expect(step(4)).toContain("Class 4 at its best is Class 2 at its worst");
  });

  it("the two separating ratios step 6 quotes are the table's", () => {
    const c4 = AACE_CLASSES.find((r) => r.cls === 4)!;
    const c3 = AACE_CLASSES.find((r) => r.cls === 3)!;
    expect(separatingRatio(c4, "pessimistic")).toBeCloseTo(1.5 / 0.7, 12);
    expect(separatingRatio(c3, "optimistic")).toBeCloseTo(1.1 / 0.9, 12);
    expect(step(6)).toContain("1.5/0.7");
    expect(step(6)).toContain("more than twice A");
    expect(1.5 / 0.7).toBeGreaterThan(2);
    expect(step(6)).toContain("1.1/0.9");
  });

  it("step 3's Class 4 fractions are the table's", () => {
    const g = FEL_STEPS.find((s) => s.n === 3)!.where!;
    expect(g.find((x) => x.sym === "L")!.means).toContain("-0.15 and -0.30");
    expect(g.find((x) => x.sym === "H")!.means).toContain("+0.20 and +0.50");
    const c4 = AACE_CLASSES.find((r) => r.cls === 4)!;
    expect([c4.accLoNarrow, c4.accLoWide, c4.accHiNarrow, c4.accHiWide])
      .toEqual([-15, -30, 20, 50]);
  });
});

describe("the arithmetic", () => {
  it("draws C(1+L), C(1+H), and the multiplier widens the high side only", () => {
    const c4 = AACE_CLASSES.find((r) => r.cls === 4)!;
    expect(bandOf(100, c4, "pessimistic")).toEqual({ lo: 70, hi: 150 });
    expect(bandOf(100, c4, "optimistic")).toEqual({ lo: 85, hi: 120 });
    expect(bandOf(100, c4, "pessimistic", 2)).toEqual({ lo: 70, hi: 200 });
  });

  it("the default options separate at Class 3 optimistic and Class 1 pessimistic", () => {
    //  The page's own pedagogy: the corner moves the answer by two classes.
    expect(firstSeparatingClass(DEFAULT_A, DEFAULT_B, "optimistic")).toBe(3);
    expect(firstSeparatingClass(DEFAULT_A, DEFAULT_B, "pessimistic")).toBe(1);
  });

  it("once separated, every better-defined class keeps them separated", () => {
    for (const corner of ["optimistic", "pessimistic"] as const)
      for (const m of [1, 2, 3] as const)
        for (const ratio of [1.05, 1.2, 1.5, 2, 3, 5]) {
          const v = decide(100, 100 * ratio, corner, m).map((x) => x.separated);
          const i = v.indexOf(true);
          if (i >= 0) expect(v.slice(i).every(Boolean)).toBe(true);
        }
  });

  it("equal options are never separated, and the order of A and B does not matter", () => {
    expect(firstSeparatingClass(100, 100, "optimistic")).toBeNull();
    expect(firstSeparatingClass(140, 100, "optimistic"))
      .toBe(firstSeparatingClass(100, 140, "optimistic"));
  });
});

describe("the lesson", () => {
  it("every equation and glossed symbol parses", () => {
    const formulas = FEL_STEPS.filter((s) => s.formula);
    expect(formulas.length).toBeGreaterThanOrEqual(2);
    for (const s of formulas) {
      expect(texParses(s.formula!), `step ${s.n}`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), g.sym).toBe(true);
    }
    expect(FEL_LIMITS.length).toBeGreaterThan(0);
  });

  it("every quotation it attributes is in the research record", () => {
    const rec = prose(RECORD.replace(/\*/g, ""));
    const quotes = FEL_STEPS.flatMap((s) =>
      [...s.body.matchAll(/"([^"]{12,})"/g)].map((m) => prose(m[1]!)));
    expect(quotes.length).toBeGreaterThanOrEqual(6);
    for (const q of quotes) expect(rec, q).toContain(q);
  });

  it("the two reactor volumes step 7 quotes are the ladder's goldens", () => {
    const golden = (c: string, re: RegExp): number => {
      const m = tree(`tutorials/plant/${c}/expected`).match(re);
      expect(m, c).not.toBeNull();
      return Number(m![1]);
    };
    const vC = golden("ammoniaStaged03_approach",
      /^equipment\s+converter\s+values\.V_R\s+(\S+)/m);
    const vD = golden("ammoniaStaged04_kinetic",
      /^kpi\s+converter\s+V_R\s+(\S+)/m);
    expect(step(7)).toContain(`${vC.toFixed(2)} m³`);
    expect(step(7)).toContain(`${vD.toFixed(2)} m³`);
    //  ... and stage D's volume is solved to the 5 K approach the step names.
    expect(tree("tutorials/plant/ammoniaStaged04_kinetic/system/outerDict"))
      .toMatch(/path converter\.approach_K;\s+value 5\.0;/);
    expect(tree("tutorials/plant/ammoniaStaged03_approach/system/postDict"))
      .toMatch(/^\s*spaceVelocity\s/m);
  });
});

describe("the stages are the research record's", () => {
  it("the deliverable rows are AACE Figure 4 as the record transcribes it", () => {
    for (const d of DELIVERABLE_ROWS) {
      const key = d.name.replace(/ \(.*\)$/, "").toLowerCase()
        .split(" ").slice(0, 2).join(" ");
      const line = RECORD.split("\n").find((l) => l.startsWith("| ")
        && l.replace(/\*/g, "").toLowerCase().includes(key)
        && /\|\s*(—|S|S\/P|P|P\/C|C)\s*\|/.test(l));
      expect(line, d.name).toBeTruthy();
      const cells = line!.split("|").slice(2, 7).map((c) => c.replace(/\*/g, "").trim());
      expect(cells, d.name).toEqual([...d.byClass]);
    }
  });

  it("each stage's decision and class are the §2.3 table's", () => {
    const table = RECORD.slice(RECORD.indexOf("### 2.3"), RECORD.indexOf("### 2.4"));
    const rows = table.split("\n").filter((l) => l.startsWith("| ")
      && !l.startsWith("| Stage") && !l.startsWith("|---"));
    expect(rows.length).toBe(FEL_STAGES.length);
    FEL_STAGES.forEach((s, i) => {
      const cells = rows[i]!.split("|").map((c) => c.trim());
      expect(cells[2], s.id).toBe(s.aace);
      expect(prose(cells[3]!.replace(/\*/g, ""))).toBe(prose(s.decides));
    });
  });

  it("the five-phase numbering is the one the record reports", () => {
    for (const st of FEL_NUMBERINGS[0]!.stages) {
      const name = st.name.replace(/ \(.*\)$/, "");
      expect(prose(RECORD)).toContain(`${st.label} ${name}`);
    }
    //  Both numberings put FEED at FEL 3 -- the page's anchor.
    for (const nb of FEL_NUMBERINGS)
      expect(nb.stages.find((s) => /^FEL.3$/.test(s.label))!.name)
        .toMatch(/FEED|basic engineering/i);
  });

  it("every case the stage map names exists, and every EduTool is live", () => {
    for (const s of FEL_STAGES) {
      for (const c of s.choupoCases)
        expect(inTree(`tutorials/${c}/system/controlDict`), c).toBe(true);
      for (const id of s.choupoTools)
        expect(METHOD_TOOLS.find((m) => m.id === id)?.status, id).toBe("live");
    }
  });

  it("the claims about the cases hold", () => {
    //  Screening stages carry no cost: no postDict.
    expect(inTree("tutorials/plant/ammoniaStaged01_yield/system/postDict")).toBe(false);
    expect(inTree("tutorials/plant/ammoniaStaged02_equilibrium/system/postDict")).toBe(false);
    //  The base case declares Class 4, designs six exchangers by Kern, and
    //  its converter is a Gibbs reactor 5 K short of equilibrium.
    const pd = tree("tutorials/plant/greenAmmoniaIndustrialN2/system/postDict");
    expect(pd).toMatch(/^\s*estimateClass\s+4;/m);
    expect([...pd.matchAll(/design\s*\{\s*method Kern;/g)].length).toBe(6);
    const conv = tree("tutorials/plant/greenAmmoniaIndustrialN2/Converter/system/flowsheetDict");
    expect(conv).toMatch(/^type\s+gibbsReactor;/m);
    expect(conv).toMatch(/temperatureApproach 5;/);
  });
});

describe("the registry", () => {
  it("is live on its own shelf, placed before the numerics", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "front-end-loading");
    expect(t?.status).toBe("live");
    expect(t?.discipline).toBe("Process design & economics");
    const d = [...METHOD_DISCIPLINES];
    expect(d.indexOf("Process design & economics"))
      .toBe(d.indexOf("Flowsheeting & numerics") - 1);
    expect(`${t!.label} ${t!.teaches}`).toContain("Front-End Loading");
    expect(t!.teaches).toContain("FEED");
  });
});
