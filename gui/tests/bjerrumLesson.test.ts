/*  The Bjerrum lesson, asserted.  The point of holding prose as data is that
 *  a test can reach it; the point of THIS test is that the page's central
 *  claim -- the pH axis is a result -- is checkable against the case that
 *  produces it, so the page cannot go on saying it after the case stops
 *  doing it.  */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BJERRUM_LIMITS, BJERRUM_STEPS } from "../src/ui/methods/bjerrumLesson.js";
import {
  BJERRUM_SPECIES, BJERRUM_WITNESS, bjerrumOverrides, crossover, readBjerrum,
  type BjerrumPoint,
} from "../src/ui/methods/BjerrumTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const ROOT = resolve(__dirname, "..", "..");
const CASE = resolve(ROOT, "tutorials", BJERRUM_WITNESS);
const src = (rel: string): string =>
  readFileSync(resolve(ROOT, "gui/src/ui/methods", rel), "utf8");
/** Collapse wrapping so an assertion is about the WORDS, not the line breaks. */
const prose = (s: string): string => s.replace(/\s+/g, " ");

describe("the steps", () => {
  it("are six, numbered in order", () => {
    expect(BJERRUM_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("state the two mass-action steps as equilibria, not as arithmetic", () => {
    const f = BJERRUM_STEPS[0]?.formula ?? "";
    expect(f).toContain("CO2(aq)");
    expect(f).toContain("HCO3-");
    expect(f).toContain("CO3--");
    expect(f).toContain("H+");
    expect(f).toContain("K1");
    expect(f).toContain("K2");
  });

  it("says the pH is not an input, and says why", () => {
    const s = BJERRUM_STEPS[1];
    expect(prose(s?.title ?? "")).toMatch(/NOT a knob/i);
    expect(prose(s?.body ?? "")).toMatch(/no pH input/i);
    expect(s?.formula ?? "").toContain("Σ z_i m_i = 0");
  });

  it("names what is in each beaker at the three landmark ratios", () => {
    const f = BJERRUM_STEPS[2]?.formula ?? "";
    expect(f).toContain("NaHCO3");
    expect(f).toContain("Na2CO3");
    expect(prose(f)).toMatch(/dissolved CO2/);
  });

  it("declares the stoichiometric basis and why the analysis check is wrong here", () => {
    const n = prose(BJERRUM_STEPS[2]?.note ?? "");
    expect(n).toContain("totalsBasis stoichiometric");
    expect(n).toMatch(/imbalance IS the titrant/i);
  });

  it("attributes the closure shortfall to the ion pair, not to round-off", () => {
    const s = BJERRUM_STEPS[4];
    expect(prose(s?.body ?? "")).toMatch(/NaHCO3\(aq\)/);
    expect(prose(s?.body ?? "")).toMatch(/not round-off/i);
  });

  it("keeps absent and zero apart", () => {
    const n = prose(BJERRUM_STEPS[4]?.note ?? "");
    expect(n).toMatch(/absent and zero are different claims/i);
  });

  it("separates the two ways the diagram moves", () => {
    const s = BJERRUM_STEPS[5];
    expect(prose(s?.body ?? "")).toMatch(/pK's THEMSELVES move/);
    expect(prose(s?.body ?? "")).toMatch(/do not move at all/);
  });

  it("says plainly that the background knob is not built", () => {
    const n = prose(BJERRUM_STEPS[5]?.note ?? "");
    expect(n).toMatch(/NOT built/);
    expect(n).toMatch(/6\.177/);       // the measured shift, not a guess
    expect(n).toMatch(/0\.289/);
  });
});

describe("the limits", () => {
  it("carry every id, each with a title and a body", () => {
    expect(BJERRUM_LIMITS.map((l) => l.id).sort()).toEqual([
      "complete-only-to-the-reaction-list", "davies-band", "no-gas-phase",
      "no-precipitation", "not-validated", "one-family",
    ]);
    for (const l of BJERRUM_LIMITS) {
      expect(l.title.length).toBeGreaterThan(10);
      expect(l.body.length).toBeGreaterThan(40);
    }
  });

  it("refuses the word validation for what is only self-consistency", () => {
    const l = BJERRUM_LIMITS.find((x) => x.id === "not-validated");
    expect(prose(l?.body ?? "")).toMatch(/INTERNAL consistency check/);
    expect(prose(l?.body ?? "")).toMatch(/not agreement with an experiment/);
  });

  it("says 'no record' is a statement about the reaction list, not nature", () => {
    const l = BJERRUM_LIMITS.find(
      (x) => x.id === "complete-only-to-the-reaction-list");
    expect(prose(l?.body ?? "")).toMatch(/not about nature/);
    expect(prose(l?.body ?? "")).toMatch(/invisible is not the same as absent/);
  });
});

describe("the page reads the engine and computes no physics", () => {
  it("holds no equilibrium constant and no pK anywhere in its source", () => {
    const tool = src("BjerrumTool.tsx");
    //  6.352 and 10.329 are the CONSTANTS.  The page may quote the measured
    //  crossovers in the LESSON prose (they are results), but the component
    //  that draws must not carry a constant it could compute a curve from.
    expect(tool).not.toContain("6.352");
    expect(tool).not.toContain("10.329");
    expect(tool).not.toMatch(/Math\.pow\(10/);
    expect(tool).not.toMatch(/\bpKa?\b\s*=/);
  });

  it("reads the three species out of diagnostics, by key", () => {
    expect(BJERRUM_SPECIES.map((s) => s.key))
      .toEqual(["m_CO2aq", "m_HCO3", "m_CO3"]);
  });

  it("sorts the points by the pH that came out", () => {
    const pts = readBjerrum([
      { diagnostics: { pH: 9, m_CO2aq: 1, m_HCO3: 1, m_CO3: 8 } },
      { diagnostics: { pH: 4, m_CO2aq: 8, m_HCO3: 1, m_CO3: 1 } },
      { diagnostics: { pH: 7, m_CO2aq: 1, m_HCO3: 8, m_CO3: 1 } },
    ]);
    expect(pts.map((p) => p.pH)).toEqual([4, 7, 9]);
  });

  it("reads closure as 1 when no ion pair is reported, and below 1 when one is", () => {
    const none = readBjerrum([{ diagnostics: {
      pH: 7, m_CO2aq: 1, m_HCO3: 1, m_CO3: 1 } }]);
    expect(none[0]?.closure).toBeCloseTo(1, 12);
    const pair = readBjerrum([{ diagnostics: {
      pH: 7, m_CO2aq: 1, m_HCO3: 1, m_CO3: 1, m_NaHCO3aq: 1 } }]);
    expect(pair[0]?.closure).toBeCloseTo(0.75, 12);
  });

  it("skips an operation missing any drawn species rather than inventing one", () => {
    expect(readBjerrum([{ diagnostics: { pH: 7, m_CO2aq: 1, m_HCO3: 1 } }]))
      .toHaveLength(0);
  });

  it("finds a crossover by interpolation and returns null when there is none", () => {
    const pts: BjerrumPoint[] = [
      { pH: 6, f: [0.6, 0.4, 0], closure: 1, gammaCO3: 1, I: 0 },
      { pH: 7, f: [0.4, 0.6, 0], closure: 1, gammaCO3: 1, I: 0 },
    ];
    expect(crossover(pts, 0, 1)).toBeCloseTo(6.5, 9);
    expect(crossover(pts, 1, 2)).toBeNull();
  });
});

describe("the knobs reach the case", () => {
  it("write the two keys the case declares in its variables block", () => {
    const dict = readFileSync(resolve(CASE, "system/propsDict"), "utf8");
    for (const o of bjerrumOverrides({ T: 300, C_T: 2 })) {
      //  The override is line-anchored on `key value unit;`, and both keys
      //  must be UNIQUE in the file -- applyScalarOverride refuses ambiguity,
      //  which is exactly why the case was restructured onto variables.
      const re = new RegExp(`^\\s*${o.key}\\s+[-0-9.eE+]+\\s*` +
        `${o.unit ? o.unit.replace("/", "\\/") : ""}\\s*;`, "gm");
      const hits = dict.match(re) ?? [];
      expect(hits, `${o.key} must appear exactly once`).toHaveLength(1);
    }
  });

  it("declares the unit each slot really carries", () => {
    const dict = readFileSync(resolve(CASE, "system/propsDict"), "utf8");
    expect(dict).toMatch(/^\s*T\s+[0-9.]+\s+K;/m);
    expect(dict).toMatch(/^\s*C_T\s+[0-9.]+\s+mol\/kg;/m);
  });

  it("converts the carbonate knob from mmol/kg to the slot's mol/kg", () => {
    const o = bjerrumOverrides({ T: 298.15, C_T: 1 })
      .find((x) => x.key === "C_T");
    expect(o?.value).toBeCloseTo(0.001, 12);
  });
});

describe("the case still does what the page says it does", () => {
  //  STRIP THE COMMENTS FIRST.  The case header explains the grammar it uses,
  //  so `totalsBasis stoichiometric;` and `pH solve;` both appear in PROSE as
  //  well as in declarations -- counting the raw text reads 45 where the truth
  //  is 44.  This is the same defect check_edutool_form carried on the day it
  //  was written, where the substring "thiele" matched a comment recording
  //  McCabe-Thiele LEAVING the Explorer: a check that reads a file must read
  //  what the PARSER reads.
  const raw = readFileSync(resolve(CASE, "system/propsDict"), "utf8");
  const dict = raw.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

  it("solves the pH at every point rather than declaring one", () => {
    const ops = dict.match(/type speciate;/g) ?? [];
    const solved = dict.match(/pH solve;/g) ?? [];
    expect(ops.length).toBeGreaterThan(20);
    expect(solved).toHaveLength(ops.length);
    expect(dict).not.toMatch(/pH\s+[0-9]/);
  });

  it("declares the stoichiometric basis on every operation", () => {
    const ops = dict.match(/type speciate;/g) ?? [];
    const basis = dict.match(/totalsBasis stoichiometric;/g) ?? [];
    expect(basis).toHaveLength(ops.length);
  });

  it("holds the total carbonate through one variable, read by every point", () => {
    const refs = dict.match(/HCO3 \$C_T;/g) ?? [];
    const ops = dict.match(/type speciate;/g) ?? [];
    expect(refs).toHaveLength(ops.length);
  });
});

describe("the registry", () => {
  it("carries the tool, live, with a theory anchor", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "bjerrum");
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("construction");
    expect(t?.theory).toBe("ch:electrolytes");
    expect(prose(t?.teaches ?? "")).toMatch(/RESULT, not a knob/);
  });

  it("is a scrolling lesson, not an instrument panel", () => {
    const tool = src("BjerrumTool.tsx");
    expect(tool).toContain("overflowY: \"auto\"");
    expect(tool).not.toContain("MethodSetupRail");
  });

  it("puts the definitions before the drawing and the consequences after", () => {
    const tool = src("BjerrumTool.tsx");
    const plot = tool.indexOf("<BjerrumPlot");
    expect(plot).toBeGreaterThan(tool.indexOf("{step(3)}"));
    expect(plot).toBeLessThan(tool.indexOf("{step(4)}"));
  });
});
