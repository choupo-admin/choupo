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
  linearAlgebraLesson.test -- the "Linear algebra without the pain" page held
  to the tree (DEV.md 4c C463).

    (a) every number the prose prints is recomputed HERE by a route the page
        does not use (a closed form, an inline loop), never copied from the
        page's own output;
    (b) every file:line the lesson cites lands on the text it claims, through
        the CLAIMS table below (the managed shape repoint_lesson_citations
        keeps current);
    (c) the page renders, with its seven figures' frames, its glossary and its
        quiz, and every step carries a glossed formula.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CG3_STEPS, CG_STEPS, LA_GLOSSARY, LA_INTRO_DIAGRAMS, LA_STEP_DIAGRAMS, LA_LIMITS, LA_QUIZ, LA_STEPS, PIVOT_BAD, PIVOT_GOOD,
  SD_KAPPA, SD_START, SD_STEPS, SD_THETA, STRUCT_BLOCK, STRUCT_DENSE, STRUCT_N, STRUCT_NV,
  W1000, WOBBLE_COND, WOBBLE_T,
} from "../src/ui/methods/linearAlgebraLesson.js";
import { A_ALL_POSITIVE, A_NEGATIVE_ENTRIES, bowlTests, rise, EX_A, bowlOf, eigSym, fanMatrix, luFactor, symPivots } from "../src/ui/methods/linearAlgebraMath.js";
import { LA_DIAGRAM_VIEWS } from "../src/ui/methods/LinearAlgebraDiagrams.js";
import { LinearAlgebraTool } from "../src/ui/methods/LinearAlgebraTool.js";

const ROOT = new URL("../../", import.meta.url);
const tree = (rel: string): string => readFileSync(new URL(rel, ROOT), "utf-8");

const prose = [
  ...LA_STEPS.flatMap((s) => [s.title, s.body, s.note ?? "", ...(s.derivation ?? []).map((d) => d.step)]),
  ...LA_LIMITS.flatMap((l) => [l.title, l.body]),
].join("\n");

describe("every number the prose prints is recomputed by another route", () => {
  it("work counts: (n^3 - n)/3 to factor and n^2 to solve, n = 1000", () => {
    const n = 1000;
    expect(W1000.factor).toBe((n ** 3 - n) / 3);
    expect(W1000.solve).toBe(n ** 2);
    expect(prose).toContain("3.3e8 against 1.0e6");
    expect(prose).toContain(`a factor of ${Math.round(((n ** 3 - n) / 3) / n ** 2)}`);
  });
  it("the pivot example: the unswapped run loses x1, the swapped one keeps it", () => {
    expect(PIVOT_BAD.x1).toBe(0);
    expect(PIVOT_GOOD.x1).toBe(1);
    expect(prose).toContain("1/\u03b5 = ten million");
    expect(prose).toContain("6 significant digits");
    expect(prose).toContain("1e-7");
  });
  it("the condition number of the wobbly table, from the singular-value identities", () => {
    // sigma_max * sigma_min = |det A| = t;  sigma_max^2 + sigma_min^2 = ||A||_F^2
    const t = WOBBLE_T;
    const S = 1 + 1 + 1 + (1 + t) ** 2;
    const smax2 = (S + Math.sqrt(S * S - 4 * t * t)) / 2;
    const kappa = smax2 / t;
    expect(Math.abs(WOBBLE_COND / kappa - 1)).toBeLessThan(1e-6);
    expect(prose).toContain(`about ${Math.round(kappa)}:`);
    expect(prose).toContain("t = 0.001");
  });
  it("the structured work, from the closed form of the block-Thomas loops", () => {
    const N = STRUCT_N, nv = STRUCT_NV, n = N * nv;
    const block = N * ((nv ** 3 - nv) / 3 + nv ** 2) + (N - 1) * (3 * nv ** 3 + 2 * nv ** 2);
    const dense = (n ** 3 - n) / 3 + n ** 2;
    expect(STRUCT_BLOCK).toBe(block);
    expect(STRUCT_DENSE).toBe(dense);
    expect(prose).toContain(`${N} trays of ${nv}`);
    expect(prose).toContain(`about ${Math.round(dense / block)} times fewer`);
    expect(prose).toContain(`${block.toExponential(1).replace("e+", "e")} operations against ${dense.toExponential(1).replace("e+", "e")}`);
  });
  it("steepest descent needs many steps, conjugate gradient needs n: an inline re-run", () => {
    const A = bowlOf(SD_KAPPA, SD_THETA);
    let x = [...SD_START];
    let k = 0;
    for (; k < 5000; k++) {
      const r = [-(A[0]![0]! * x[0]! + A[0]![1]! * x[1]!), -(A[1]![0]! * x[0]! + A[1]![1]! * x[1]!)];
      if (Math.hypot(r[0]!, r[1]!) < 1e-8) break;
      const Ar = [A[0]![0]! * r[0]! + A[0]![1]! * r[1]!, A[1]![0]! * r[0]! + A[1]![1]! * r[1]!];
      const al = (r[0]! ** 2 + r[1]! ** 2) / (r[0]! * Ar[0]! + r[1]! * Ar[1]!);
      x = [x[0]! + al * r[0]!, x[1]! + al * r[1]!];
    }
    expect(SD_STEPS).toBe(k);
    expect(SD_STEPS).toBeGreaterThan(40);
    expect(CG_STEPS).toBe(2);
    expect(CG3_STEPS).toBe(3);
    expect(prose).toContain(`needs ${k} steps`);
    expect(prose).toContain(`Here it takes ${CG_STEPS} on the 2x2 and ${CG3_STEPS} on a 3x3`);
    expect(prose).toContain(`condition number ${SD_KAPPA}`);
  });
  it("the quiz's many-variable question: one downward parabola among six is indefinite, and a pivot fails", () => {
    // find, by scanning the coupling, a 6x6 table with exactly one negative eigenvalue
    let found: number | null = null;
    for (let c = 0; c <= 6 && found === null; c += 0.01)
      if (eigSym(fanMatrix(6, c)).values.filter((l) => l < -1e-9).length === 1) found = c;
    expect(found).not.toBeNull();
    const A = fanMatrix(6, found!);
    expect(eigSym(A).values.filter((l) => l > 1e-9).length).toBe(5);
    expect(symPivots(A).some((d) => !(d > 1e-9))).toBe(true);
    const q = LA_QUIZ.find((x) => x.id === "bowl")!;
    expect(q.options[q.correct]).toContain("saddle");
  });
  it("step 7's coupling threshold: the 3x3 determinant is 24 - 6 c^2, so the smallest curvature is zero at c = 2", () => {
    const det3 = (c: number): number => {
      const m = fanMatrix(3, c);
      return m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!)
        - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!)
        + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
    };
    for (const c of [0, 1, 2, 2.5]) expect(det3(c)).toBeCloseTo(24 - 6 * c * c, 12);
    expect(Math.abs(eigSym(fanMatrix(3, 2)).values[0]!)).toBeLessThan(1e-9);
    expect(eigSym(fanMatrix(3, 1.9)).values[0]!).toBeGreaterThan(0);
    expect(eigSym(fanMatrix(3, 2.1)).values[0]!).toBeLessThan(0);
    expect(prose).toContain("24 - 6c\u00b2");
    expect(prose).toContain("at c = 2");
  });
  it("the name: the history says only what the checked sources say, and says what is NOT documented", () => {
    expect(prose).toContain("Section V, Art. 153");
    expect(prose).toContain("(1801)");
    expect(prose).toContain("perhaps used 'form' in this sense in a paper read in 1775");
    expect(prose).toContain("Salmon (1859)");
    expect(prose).toContain("is not documented");
    expect(prose).toContain("Sylvester's law of inertia (1852)");
    expect(prose).not.toMatch(/coined/);
    // no first use of 'definite' is asserted
    expect(prose).not.toMatch(/'definite'[^.]*(coined|introduced|first used by)/);
    for (const w of ["positive definite", "indefinite", "semi-definite", "never changes", "undecided"])
      expect(prose.toLowerCase()).toContain(w);
  });
  it("the web references behind the history are recorded, dated, with method web", () => {
    const refs = JSON.parse(tree("gui/src/ui/methods/lessonReferences.json")) as
      { lessons: Record<string, { references: { text: string; url?: string; verified: { method: string; date: string } }[] }> };
    const mine = refs.lessons["linear-algebra-without-pain"]!.references.filter((r) => r.verified.method === "web");
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const r of mine) { expect(r.verified.date).toBe("2026-11-21"); expect(r.url).toMatch(/^https:\/\//); }
    expect(mine.some((r) => r.url === "https://mathshistory.st-andrews.ac.uk/Miller/mathword/q/")).toBe(true);
    expect(mine.some((r) => r.url === "https://mathshistory.st-andrews.ac.uk/Miller/mathword/d/")).toBe(true);
  });
  it("step 6's first picture: the entries do not decide, the number x'Ax does (values computed, not typed)", () => {
    // A1: every entry positive; the direction (1, -1) gives 1 - 2 - 2 + 1 = -2
    expect(A_ALL_POSITIVE.flat().every((v) => v > 0)).toBe(true);
    const q = (A: number[][], x: number[]): number =>
      x[0]! * (A[0]![0]! * x[0]! + A[0]![1]! * x[1]!) + x[1]! * (A[1]![0]! * x[0]! + A[1]![1]! * x[1]!);
    expect(rise(A_ALL_POSITIVE, [1, -1])).toBe(q(A_ALL_POSITIVE, [1, -1]));
    expect(rise(A_ALL_POSITIVE, [1, -1])).toBe(-2);
    expect(bowlTests(1, 2, 1).pdByEigen).toBe(false);
    const dirs = Array.from({ length: 360 }, (_, i) => [Math.cos((i * Math.PI) / 180), Math.sin((i * Math.PI) / 180)]);
    expect(dirs.some((d) => rise(A_ALL_POSITIVE, d) < 0)).toBe(true);
    // A2: negative entries, yet positive in every direction: 2x^2 - 2xy + 2y^2 = x^2 + y^2 + (x - y)^2
    expect(A_NEGATIVE_ENTRIES.flat().some((v) => v < 0)).toBe(true);
    expect(dirs.every((d) => rise(A_NEGATIVE_ENTRIES, d) > 0)).toBe(true);
    for (const d of dirs) expect(rise(A_NEGATIVE_ENTRIES, d)).toBeCloseTo(d[0]! ** 2 + d[1]! ** 2 + (d[0]! - d[1]!) ** 2, 12);
    expect(rise(A_NEGATIVE_ENTRIES, [1, -1])).toBe(6);
    expect(bowlTests(2, -1, 2).pdByEigen).toBe(true);
    expect(prose).toContain("NUMBER, not about the entries");
  });
  it("the quiz's reuse question: n^2 against n^3/3 holds at every size", () => {
    for (const n of [10, 100, 1000]) expect(n ** 2).toBeLessThan(n ** 3 / 3);
  });
});

describe("every file:line the lesson cites lands on what it claims", () => {
  const CLAIMS: Record<string, [string, number, number | undefined, string | RegExp]> = {
    "NewtonND.cpp:672": ["src/solver/NewtonND.cpp", 672, undefined, "minusFx[i] = -Fx[i]"],
    "NewtonND.cpp:771": ["src/solver/NewtonND.cpp", 771, undefined, "dx = gaussSolve(J, minusFx)"],
    "NewtonND.cpp:461": ["src/solver/NewtonND.cpp", 461, undefined, "luFactor(A, piv);"],
    "NewtonND.cpp:756": ["src/solver/NewtonND.cpp", 756, undefined, "dx = blockThomasSolve(colored.bands, minusFx)"],
    "Rosenbrock23.cpp:733": ["src/solver/ODE/Rosenbrock23.cpp", 733, undefined, "luFactor(W, piv)"],
    "Rosenbrock23.cpp:818": ["src/solver/ODE/Rosenbrock23.cpp", 818, undefined, "luSolve(W, piv, r)"],
    "LU.cpp:110-111": ["src/solver/LU.cpp", 110, 111, /const scalar factor = A\[i\]\[k\] \/ A\[k\]\[k\];\s*A\[i\]\[k\] = factor;/],
    "LU.cpp:71": ["src/solver/LU.cpp", 71, undefined, "Partial pivot: largest |entry| in column k"],
    "LU.cpp:103": ["src/solver/LU.cpp", 103, undefined, "std::swap(A[k], A[pivot])"],
    "LU.cpp:99": ["src/solver/LU.cpp", 99, undefined, "luFactor: matrix is singular at row"],
    "BlockTridiagonal.H:46": ["src/solver/BlockTridiagonal.H", 46, undefined, "factors it in O(N nv^3) where dense Gauss is O((N nv)^3)"],
    "BlockTridiagonal.H:49-51": ["src/solver/BlockTridiagonal.H", 49, 51, /Partial pivoting is applied INSIDE each pivot block[\s\S]*no pivoting ACROSS blocks/],
    "ActiveSetQP.H:39": ["src/solver/ActiveSetQP.H", 39, undefined, "with B symmetric positive definite"],
    "SQP.cpp:257": ["src/solver/SQP.cpp", 257, undefined, "B[i][i] = 1.0;   // B0 = I"],
    "SQP.cpp:627": ["src/solver/SQP.cpp", 627, undefined, "BFGS skipped"],
    "StabilityTest.H:39-43": ["src/solver/StabilityTest.H", 39, 43, /Is there another composition y at which the chemical potential[\s\S]*lies strictly below the tangent plane[\s\S]*If yes \(TPD < 0\)/],
    "StabilityTest.cpp:65-69": ["src/solver/StabilityTest.cpp", 65, 69, /scalar tm = 1\.0;[\s\S]*tm \+= Yi \* \(std::log\(Yi\) \+ lnGamma\[i\] - h\[i\] - 1\.0\)/],
  };
  const all = `${prose}\n${readFileSync(new URL("../src/ui/methods/linearAlgebraLesson.ts", import.meta.url), "utf-8")}`;
  const cited = new Set([...all.matchAll(/\b((?:NewtonND|Rosenbrock23|LU|SQP|StabilityTest)\.cpp|(?:BlockTridiagonal|ActiveSetQP|StabilityTest)\.H):(\d+)(?:-(\d+))?/g)]
    .map((m) => `${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ""}`));
  it("no citation is left without a claim, and no claim is left without a citation", () => {
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const c of Object.keys(CLAIMS)) expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
  });
  it.each(Object.entries(CLAIMS))("%s", (_c, [rel, a, b, want]) => {
    const text = tree(rel).split("\n").slice(a - 1, b ?? a).join("\n");
    if (typeof want === "string") expect(text).toContain(want);
    else expect(text).toMatch(want);
  });
});

describe("the diagrams (Vitor: very visual)", () => {
  it("every step references at least one diagram, and every reference is drawn", () => {
    for (const s of LA_STEPS) {
      const ids = LA_STEP_DIAGRAMS[s.n] ?? [];
      expect(ids.length, `step ${s.n} has no diagram`).toBeGreaterThanOrEqual(1);
      for (const id of ids) expect(LA_DIAGRAM_VIEWS[id], `${id} not drawn`).toBeDefined();
    }
    const used = new Set([...Object.values(LA_STEP_DIAGRAMS).flat(), ...LA_INTRO_DIAGRAMS]);
    for (const id of Object.keys(LA_DIAGRAM_VIEWS)) expect(used.has(id), `${id} is drawn but unused`).toBe(true);
  });
  it("the rendered page carries every diagram", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(LinearAlgebraTool)));
    for (const id of Object.keys(LA_DIAGRAM_VIEWS)) expect(html).toContain(`data-diagram="${id}"`);
  });
  it("the required sketches are all there", () => {
    for (const id of ["elimination", "costBlocks", "digits", "nearParallel", "band", "shapes", "zigzag", "map"])
      expect(LA_DIAGRAM_VIEWS[id], id).toBeDefined();
  });
  it("the elimination sketch's L is the receipt the page prints in step 2", () => {
    expect(luFactor(EX_A, false).L).toEqual([[1, 0, 0], [2, 1, 0], [4, 3, 1]]);
  });
});

describe("the page", () => {
  it("every step with a formula glosses its symbols and the glossary is unique", () => {
    expect(LA_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const s of LA_STEPS) {
      if (s.formula) expect(s.where?.length ?? 0, `step ${s.n}`).toBeGreaterThan(0);
    }
    expect(new Set(LA_GLOSSARY.map((g) => g.sym)).size).toBe(LA_GLOSSARY.length);
  });
  it("renders nine figures, the glossary, the quiz and the limits", () => {
    const html = renderToStaticMarkup(createElement(MantineProvider, null, createElement(LinearAlgebraTool)));
    for (let i = 1; i <= 9; i++) expect(html).toContain(`Figure ${i}.`);
    expect(html).toContain('data-testid="la-glossary"');
    expect(html).toContain("data-lesson-quiz");
    for (const l of LA_LIMITS) expect(html).toContain(l.title.replace(/'/g, "&#x27;"));
  });
  it("it names its inspiration by title and takes no number from it", () => {
    expect(prose).toContain("Agonizing Pain");
    expect(prose).toContain("no number on this page is taken from it");
  });
});
