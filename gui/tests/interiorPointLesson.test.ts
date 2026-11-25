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
  interiorPointLesson -- "How does an interior-point method find the minimum?",
  held to what it claims about itself:

    * every file:line the page names is read back against the tree, every case
      and Theory Guide label exists;
    * the numbers the prose and the quiz print are the numbers of the recorded
      run (gui/src/case/interiorPointRecorded.json), and the recorded run is
      internally consistent (the path has one point per row, the page's level
      curves pass through the engine's own optimum, the multipliers are minus
      the element potentials);
    * the page says it is recorded, is registered with a live Theory Guide
      destination, draws its references and prints no NaN and no "undefined".

  WHAT THIS CANNOT PROVE: that the recorded runs would be reproduced on another
  platform to the last digit (the trace's digits depend on the maths library),
  nor that a picture teaches; the second is read by a person.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CITATIONS, GIBBS, HS116, HS21, HS6, HS7, IP_ASKS, IP_CASES, IP_LABELS, IP_LIMITS, IPM_QUIZ, IPM_STEPS,
  PROVENANCE, R1_ROWS, WB2000, attemptRows, corner, iterates, lastPush, muLadder, r1Summary, wallDistances,
} from "../src/ui/methods/interiorPointLesson.js";
import { InteriorPointTool } from "../src/ui/methods/InteriorPointTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const ROOT = new URL("../../", import.meta.url);
const text = (rel: string): string => readFileSync(new URL(rel, ROOT), "utf-8");
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

describe("interior-point: what the page says about Choupo is true", () => {
  it("every file:line it names is in the tree and says what it is cited for", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(12);
    for (const c of CITATIONS) {
      const at = text(c.file).split("\n")[c.line - 1] ?? "";
      expect(at, `${c.file}:${c.line} should contain "${c.contains}"`).toContain(c.contains);
    }
  });
  it("every case and Theory Guide label it names exists", () => {
    for (const d of IP_CASES) expect(existsSync(new URL(`${d}/system/controlDict`, ROOT)), d).toBe(true);
    const tex = text("docs/theoryGuide.tex");
    for (const l of IP_LABELS) expect(tex, l).toContain(`\\label{${l}}`);
  });
  it("the recorded run names its script and the script exists", () => {
    expect(PROVENANCE.script).toBe("bin/curate/interior_point_edutool_table.py");
    expect(existsSync(new URL(PROVENANCE.script, ROOT))).toBe(true);
  });
  it("every `File.cpp:line` written in the page's prose is covered by a claim that holds", () => {
    const all = [text("gui/src/ui/methods/interiorPointLesson.ts"), text("gui/src/ui/methods/InteriorPointTool.tsx")].join("\n");
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const FILES: Record<string, string> = {
      "IPTrace.H": "src/solver/ip/IPTrace.H",
      "IPParameters.H": "src/solver/ip/IPParameters.H",
      "BarrierUpdate.cpp": "src/solver/ip/BarrierUpdate.cpp",
      "Globalization.cpp": "src/solver/ip/Globalization.cpp",
      "DenseLDLT.cpp": "src/solver/ip/DenseLDLT.cpp",
      "InertiaCorrection.cpp": "src/solver/ip/InertiaCorrection.cpp",
      "InteriorPointGibbs.cpp": "src/unitOperations/reactor/gibbsMethod/InteriorPointGibbs.cpp",
    };
    const CLAIMS: Record<string, string> = {
      "IPTrace.H:40": "phi_mu   barrier objective",
      "IPParameters.H:68-69": "scalar gammaTheta",
      "BarrierUpdate.cpp:47": "std::pow(mu, p_.thetaMu)",
      "Globalization.cpp:63": "corners_.emplace_back((1.0 - p_.gammaTheta) * theta",
      "DenseLDLT.cpp:73": "Inertia DenseLDLT::factor",
      "InertiaCorrection.cpp:88": "if (r.inertia != wanted)",
      "InertiaCorrection.cpp:129-142": "const bool noneBefore = dwLast_ == 0.0;",
      "InteriorPointGibbs.cpp:99": "bool isGuardOnly(std::size_t i) const override",
      "InteriorPointGibbs.cpp:303": "piIP[j] = -lambda[j];",
      "InteriorPointGibbs.cpp:512": "lookupWordOrDefault(\"barrier\", \"condensedPhases\")",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = text(FILES[file]!).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const at = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      expect(at, c).toContain(want);
    }
  });
  it("the gamma of the filter corner is the engine's", () => {
    expect(text("src/solver/ip/IPParameters.H")).toMatch(/gammaTheta\s*=\s*1\.0e-5/);
    expect(text("src/solver/ip/IPParameters.H")).toMatch(/gammaPhi\s*=\s*1\.0e-5/);
  });
});

describe("interior-point: the recorded runs agree with each other and with the prose", () => {
  it("the path has one point per row and the iterates are the start then the path", () => {
    for (const run of [HS21, WB2000, HS6, HS7]) {
      expect(run.path.length).toBe(run.rows.length);
      expect(run.rows.map((r) => r.it)).toEqual(run.rows.map((_, i) => i));
      for (const r of run.rows) expect(["phi", "theta", "resto"]).toContain(r.type);
    }
    expect(iterates(HS21).length).toBe(HS21.rows.length + 1);
  });
  it("the level curves of the page pass through the engine's own optimum", () => {
    const x = HS21.x!;
    const f = 0.01 * x[0]! ** 2 + x[1]! ** 2 - 100;
    expect(Math.abs(f - (HS21.fStar ?? NaN))).toBeLessThan(1e-6);
    expect(Math.abs(x[0]! - (HS21.activeBound?.at ?? NaN))).toBeLessThan(1e-6);
  });
  it("the cushion sentences of step 1 and the quiz are the recorded numbers", () => {
    const d = wallDistances(HS21);
    expect(d[0]).toBeCloseTo(0.02, 6);                       // "about 0.02 at the start"
    expect(d[d.length - 1]!).toBeGreaterThan(5e-8);          // "about 6e-8 at the end"
    expect(d[d.length - 1]!).toBeLessThan(7e-8);
    expect(lastPush(HS21)).toBeGreaterThan(0.038);           // "about 0.04"
    expect(lastPush(HS21)).toBeLessThan(0.042);
    expect(HS21.activeBound?.z).toBeCloseTo(0.04, 6);
    expect(muLadder(HS21)[0]).toBeCloseTo(0.1, 12);          // "starts at 0.1"
    expect(muLadder(HS21).every((m, i, a) => i === 0 || m < a[i - 1]!)).toBe(true);
  });
  it("the filter sentences: iteration 8 of WB2000 took 21 trials, left by restoration, and the rule-breaking then fell", () => {
    const r = WB2000.rows;
    expect(r[8]!.ls).toBe(21);
    expect(r[8]!.type).toBe("resto");
    expect(r[8]!.theta).toBeGreaterThan(0.99);
    expect(r[9]!.theta).toBeCloseTo(0.381, 2);
    expect(r[10]!.theta).toBeLessThan(1e-4);
    expect(WB2000.restorations).toBe(1);
  });
  it("a filter corner is the iterate a hair toward better", () => {
    const [ct, cp] = corner(8, 5);
    expect(ct).toBeCloseTo(8 * (1 - 1e-5), 12);
    expect(cp).toBeCloseTo(5 - 8e-5, 12);
  });
  it("HS6: the first try counted (1,2,0) where (2,1,0) was wanted, and the stiffness ladder is 0, 1e-4, 1e-2, then 1", () => {
    const a = attemptRows(HS6)[0]!;
    expect(a.attempts.map((e) => e.dw)).toEqual([0, 1e-4, 1e-2]);
    expect(a.attempts[0]!.got).toEqual([1, 2, 0]);
    expect(a.attempts[0]!.wanted).toEqual([2, 1, 0]);
    expect(a.settled).toBe(1);
    expect(HS6.inertiaCorrections).toBe(2);
  });
  it("HS7 needs stiffness many times, up to a very large value", () => {
    expect(HS7.inertiaCorrections).toBeGreaterThanOrEqual(10);
    expect(Math.max(...HS7.rows.map((r) => r.dw))).toBeGreaterThan(1e6);
  });
  it("HS116: the run ends below the collection's value by the gap the Theory Guide gives", () => {
    expect(HS116.published).toBe(97.5884089805);
    expect(Math.abs(HS116.f - 97.5875096)).toBeLessThan(1e-6);
    expect(HS116.published - HS116.f).toBeGreaterThan(8e-4);
    expect(HS116.published - HS116.f).toBeLessThan(1e-3);
    const tex = text("docs/theoryGuide.tex");
    expect(tex).toContain("97.5875096");
    expect(tex).toContain("97.5884090");
    expect(text("test/interior_point_hs.cpp")).toContain("97.5884089805");
  });
  it("the Gibbs run: mu falls, and the multipliers are minus the element potentials", () => {
    const mu = GIBBS.iterations.map((r) => r["mu"] as number);
    expect(mu.length).toBeGreaterThan(3);
    expect(mu[0]).toBeCloseTo(0.1, 12);
    for (let i = 1; i < mu.length; i += 1) expect(mu[i]!).toBeLessThanOrEqual(mu[i - 1]!);
    for (const e of ["C", "H", "O"]) {
      const l = GIBBS.bridge[`lambda_${e}`] as number, p = GIBBS.bridge[`pi_${e}`] as number;
      expect(Math.abs(l + p), e).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(p)));
    }
  });
  it("review R1: the default's finishing correction is small except in three named solves, and the every-amount one is up to nine orders larger", () => {
    expect(R1_ROWS.length).toBeGreaterThan(10);
    const def = r1Summary("condensedPhases"), all = r1Summary("everyAmount");
    expect(def.above.sort()).toEqual([
      "gibbs06_thermal_nox.burner", "gibbs14 @ 0.8336 bar (liquid absent, one outlet)", "gibbs14 @ 0.84 bar (liquid present, two outlets)",
    ]);
    expect(def.within).toBe(def.n - 3);
    expect(all.max).toBeGreaterThan(1e8);
    expect(all.within).toBeLessThan(all.n / 2);
    // the page's sentence names one reactor the gate exempts and two solves at the phase boundary
    expect(R1_ROWS.find((r) => r.case === "gibbs06_thermal_nox.burner")?.polish).toBeGreaterThan(1e-6);
    expect(text("bin/curate/check_gibbs_interior_point.py")).toContain('not got.get("ip_rescuedByPolish")');
  });
});

describe("interior-point: the registry and the references", () => {
  const tool = METHOD_TOOLS.find((m) => m.id === "interior-point");
  it("is a live notes page on the numerics shelf with a real Theory Guide label", () => {
    expect(tool).toBeTruthy();
    expect(tool!.kind).toBe("notes");
    expect(tool!.status).toBe("live");
    expect(tool!.discipline).toBe("Flowsheeting & numerics");
    expect(IP_LABELS).toContain(tool!.theory);
    expect(words(tool!.blurb)).toBeLessThanOrEqual(22);
  });
  it("its reference is Wachter and Biegler 2006, verified", () => {
    const refs = JSON.parse(text("gui/src/ui/methods/lessonReferences.json")).lessons["interior-point"];
    expect(refs.references.length).toBe(1);
    expect(refs.references[0].doi).toBe("10.1007/s10107-004-0559-y");
    expect(refs.references[0].verified.method).toBe("crossref");
  });
});

describe("interior-point: the text budget and the plain-language rule", () => {
  it("six steps, each with a question; a body of at most 120 words and a note of at most 60", () => {
    expect(IPM_STEPS.length).toBe(6);
    for (const s of IPM_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(120);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(60);
      expect(IP_ASKS[s.n], `step ${s.n} question`).toMatch(/\?$/);
    }
    expect(IPM_QUIZ.length).toBeGreaterThanOrEqual(4);
    expect(IP_LIMITS.length).toBeGreaterThanOrEqual(3);
  });
  it("the plain word comes before the technical one in the first three bodies", () => {
    expect(IPM_STEPS[0]!.body.indexOf("cushion")).toBeLessThan(IPM_STEPS[0]!.body.indexOf("barrier"));
    expect(IPM_STEPS[1]!.body.indexOf("list")).toBeLessThan(IPM_STEPS[1]!.body.indexOf("filter"));
    expect(IPM_STEPS[1]!.body.indexOf("inside the rules")).toBeLessThan(IPM_STEPS[1]!.body.indexOf("restoration"));
    expect(IPM_STEPS[2]!.body.indexOf("bowl")).toBeLessThan(IPM_STEPS[2]!.body.indexOf("inertia"));
  });
  it("the page has no matrix algebra: no matrix symbol is written out beyond the identity", () => {
    for (const s of IPM_STEPS) expect(s.formula ?? "", `step ${s.n}`).not.toMatch(/\\begin\{[pb]matrix\}|\\mathbf|\\nabla/);
  });
});

describe("interior-point: the rendered page", () => {
  const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(InteriorPointTool)));
  it("draws every step title, every card, every question and the tables", () => {
    for (const s of IPM_STEPS) expect(html, `step ${s.n}`).toContain(s.title);
    for (const c of ["cushion", "filter", "ladder", "gibbs", "mixture", "book"]) expect(html, c).toContain(`data-ip-card="${c}"`);
    for (const n of [1, 2, 3, 4, 5, 6]) expect(html, `ask ${n}`).toContain(`data-ip-ask="${n}"`);
    for (const t of ["cushion", "filter", "ladder", "gibbs-log", "gibbs-bridge", "r1", "hs116"]) expect(html, t).toContain(`data-ip-table="${t}"`);
    expect(html).toContain("data-ip-path");
    expect(html).toContain("data-ip-landscapes");
  });
  it("says it is recorded and not live, and links the algebra page", () => {
    expect(html).toContain("recorded, not live");
    expect(html).toContain("Linear algebra without pain");
  });
  it("draws the references and prints no NaN and no undefined", () => {
    expect(html).toContain("data-lesson-references");
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
