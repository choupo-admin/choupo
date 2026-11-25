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
  transferUnit.test.ts -- the `transfer-unit` EduTool (DEV.md 4c C222).

  What it holds, and what it cannot.
    * Colburn's closed form against the NUMERICAL INTEGRAL of dy/(y - y*), the
      definition, so the page cannot teach against its own algebra;
    * the true pole (A = R) and the finite value at A = 1;
    * HETP = H_OG ln(lambda)/(lambda - 1) against the Kremser count (the
      derivation on the page) AND against the engine's own source line;
    * the engine half: the published bed's Z = HETP x N_t equals the packing
      height the case declares (read from the golden and the dict, not typed);
    * the citations: each cited file:line holds the text the page says it does.
  It cannot tell whether a cited line MEANS what the prose says; a reader does.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  TRANSFER_UNIT_LIMITS, TRANSFER_UNIT_QUIZ, TRANSFER_UNIT_STEPS,
} from "../src/ui/methods/transferUnitLesson.js";
import {
  colburnNOG, hetpFromHog, hetpOverHog, impliedLambda, kremserStages,
  minimumAbsorptionFactor, nogByQuadrature, summariseBed,
} from "../src/ui/methods/transferUnitMath.js";
import { publishedBed } from "../src/ui/methods/TransferUnitTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const lineOf = (rel: string, n: number): string => read(rel).split("\n")[n - 1] ?? "";

describe("Colburn's equation", () => {
  it("equals the numerical integral of the definition", () => {
    for (const [R, A] of [[0.9, 1.5], [0.95, 1.2], [0.99, 2], [0.5, 0.8], [0.8, 3]] as const) {
      const closed = colburnNOG(R, A)!;
      expect(closed).toBeCloseTo(nogByQuadrature(R, A), 3);
    }
  });
  it("is R/(1-R) at A = 1: finite, and 99 at 99 % recovery", () => {
    expect(colburnNOG(0.99, 1)!).toBeCloseTo(99, 9);
    expect(nogByQuadrature(0.99, 1)).toBeCloseTo(99, 3);
  });
  it("blows up at A = R, not at A = 1, and has no answer below it", () => {
    const R = 0.99;
    expect(minimumAbsorptionFactor(R)).toBe(R);
    //  logarithmic divergence: each factor 1e6 closer adds about 1/(1-R)... a lot
    expect(colburnNOG(R, R + 1e-6)!).toBeGreaterThan(9 * colburnNOG(R, 1)!);
    expect(colburnNOG(R, R + 1e-12)!).toBeGreaterThan(colburnNOG(R, R + 1e-6)!);
    expect(colburnNOG(R, R - 1e-3)).toBeNull();
    expect(colburnNOG(R, 1)!).toBeLessThan(100);
  });
});

describe("HETP and the transfer unit", () => {
  it("Z = N_OG H_OG = N_t HETP for two straight lines", () => {
    for (const [R, A] of [[0.9, 1.5], [0.95, 1.2], [0.99, 2], [0.8, 0.9]] as const) {
      const H = 0.7;
      const Z = colburnNOG(R, A)! * H;
      expect(Z / kremserStages(R, A)!).toBeCloseTo(hetpFromHog(H, 1 / A), 9);
    }
  });
  it("is 1 at lambda = 1, below 1 above it and above 1 below it", () => {
    expect(hetpOverHog(1)).toBe(1);
    expect(hetpOverHog(2)).toBeLessThan(1);
    expect(hetpOverHog(0.5)).toBeGreaterThan(1);
  });
  it("impliedLambda inverts it", () => {
    for (const lam of [0.4, 1.3, 2.5, 8]) {
      expect(impliedLambda(hetpOverHog(lam))!).toBeCloseTo(lam, 6);
    }
  });
  it("is the relation the engine writes", () => {
    expect(lineOf("src/unitOperations/distillation/PackingRBF.cpp", 138)).toContain("r.HETP");
    expect(lineOf("src/unitOperations/distillation/PackingRBF.cpp", 139)).toContain("std::log(lam) / (lam - 1.0)");
    expect(lineOf("src/unitOperations/distillation/PackingDelft.cpp", 132)).toContain("std::log(s.lambda) / (s.lambda - 1.0)");
  });
});

describe("the cited engine lines say what the page says", () => {
  it("the rate-based bed publishes H_OG and lambda = m v / l", () => {
    expect(lineOf("src/unitOperations/distillation/RateBasedSegment.cpp", 957)).toContain('columns["HOG"]');
    expect(lineOf("src/unitOperations/distillation/RateBasedSegment.cpp", 482)).toContain("st.lambda = c.m * vm / lm");
    expect(lineOf("src/unitOperations/distillation/PackingRBF.cpp", 136)).toContain("r.HOG = r.HG + s.lambda * r.HL");
  });
  it("the Theory Guide has the packed-bed label the registry points to", () => {
    expect(read("docs/theoryGuide.tex")).toContain("\\label{sec:packed-bed}");
  });
});

describe("the engine half: the published bed", () => {
  const caseDir = "tutorials/steady/distillation/ratebased01_schulz_0p10bar";
  const expected = read(`${caseDir}/expected`);
  const kpi = (key: string): number => {
    const m = expected.match(new RegExp(`^kpi\\s+column\\s+${key}\\s+([-+0-9.eE]+)`, "m"));
    if (!m) throw new Error(`no KPI ${key} in the golden`);
    return Number(m[1]);
  };
  it("the golden's HETP times its stage count is the declared bed height", () => {
    const dict = read(`${caseDir}/system/flowsheetDict`);
    const h = Number(dict.match(/^\s*height\s+([0-9.]+)\s*m;/m)![1]);
    expect(kpi("HETP") * kpi("theoreticalStages_bed")).toBeCloseTo(h, 3);
  });
  it("summariseBed sums dz/H_OG and takes the HETP from H_OG and lambda", () => {
    const n = 10, dz = 0.22;
    const z = Array.from({ length: n }, (_, k) => (k + 0.5) * dz);
    const HOG = Array.from({ length: n }, () => 0.5);
    const m = Array.from({ length: n }, () => 1.2), V = Array.from({ length: n }, () => 2), L = Array.from({ length: n }, () => 2);
    const s = summariseBed(z, HOG, m, V, L)!;
    expect(s.height).toBeCloseTo(2.2, 12);
    expect(s.NOG).toBeCloseTo(2.2 / 0.5, 12);
    expect(s.lambdaMean).toBeCloseTo(1.2, 12);
    expect(s.hetpFromSegments).toBeCloseTo(hetpFromHog(0.5, 1.2), 12);
  });
  it("publishedBed picks the profile that carries H_OG and the KPIs of its unit", () => {
    const b = publishedBed(
      [{ unit: "other", columns: { z: [1] } },
       { unit: "column", columns: { z: [0.1, 0.2], HOG: [0.4, 0.4], m: [1, 1], V: [1, 1], L: [1, 1] } }],
      { column: { HETP: 0.16, theoreticalStages_bed: 13.7 } });
    expect(b?.unit).toBe("column");
    expect(b?.HETP).toBe(0.16);
    expect(publishedBed([{ unit: "x", columns: { z: [1] } }], {})).toBeNull();
  });
});

describe("the registry, the lesson and the guide", () => {
  const t = METHOD_TOOLS.find((x) => x.id === "transfer-unit")!;
  it("is a live tool with a blurb of at most twelve words and an engine origin", () => {
    expect(t.status).toBe("live");
    expect(t.blurb.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(t.origins).toContain("engine");
    expect(t.theory).toBe("sec:packed-bed");
  });
  it("the lesson has its steps in order, a quiz of four and limits", () => {
    expect(TRANSFER_UNIT_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(TRANSFER_UNIT_QUIZ.length).toBe(4);
    expect(TRANSFER_UNIT_LIMITS.length).toBeGreaterThanOrEqual(3);
  });
  it("the page says 99 at 99 % recovery, and the closed form agrees", () => {
    const body = TRANSFER_UNIT_STEPS.find((s) => s.n === 2)!.body;
    expect(body).toContain("99 at 99 % recovery");
    expect(colburnNOG(0.99, 1)!).toBeCloseTo(99, 9);
  });
  it("the Tutorials Guide has its section", () => {
    const g = read("docs/eduToolsGuide.tex");
    expect(g).toContain("\\label{sec:edu-transfer-unit}");
    expect(g).toContain("tool=transfer-unit");
  });

  it("the lesson's prose citations are claims repoint keeps (check_lesson_prose_citations)", () => {
    const CLAIMS: Record<string, string> = {
      "PackingDelft.cpp:131-132": "r.HETP = (std::abs(s.lambda - 1.0) < 1.0e-9) ? r.HOG",
      "PackingRBF.cpp:136-139": "r.HOG = r.HG + s.lambda * r.HL",
      "PackingRBF.cpp:138-139": "r.HETP = (std::abs(lam - 1.0) < 1.0e-9) ? r.HOG",
    };
    const where: Record<string, string> = {
      "PackingDelft.cpp": "src/unitOperations/distillation/PackingDelft.cpp",
      "PackingRBF.cpp": "src/unitOperations/distillation/PackingRBF.cpp",
    };
    for (const [k, want] of Object.entries(CLAIMS)) {
      const [f = "", r = ""] = k.split(":");
      const [a = 0, b = a] = r.split("-").map(Number);
      const path = where[f] ?? "";
      const text = Array.from({ length: b - a + 1 }, (_, i) => lineOf(path, a + i)).join("\n");
      expect(text, k).toContain(want);
    }
  });
});
