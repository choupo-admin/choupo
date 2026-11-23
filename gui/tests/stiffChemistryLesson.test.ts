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
  stiffChemistryLesson -- "Why is chemistry stiff, and how do solvers go fast?",
  held to what it claims about itself:

    * every file:line the page names is read back against the tree, every case
      and Theory Guide label exists;
    * the page's arithmetic is the arithmetic (RK4's limit 2.785, the Hermite
      defect scale) and the numbers it types equal the recorded documents;
    * the recorded counts agree with each other (steps against tolerance);
    * the page says it is recorded, marks the number it quotes from outside
      the tree, and its dense-output status equals the source (the key
      `denseOutput` is in the engine iff DENSE_OUTPUT_LANDED);
    * it is registered with a live Theory Guide destination, draws its
      references, and prints no NaN and no "undefined".

  WHAT THIS CANNOT PROVE: that the recorded runs would be reproduced on another
  machine to the last digit; the instruction counts are exact, the seconds
  are not.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  CITATIONS, COUNT_ROWS, DENSE_OUTPUT_LANDED, IGNITION_ROWS, JACOBIAN_ROWS, JOURNEY_ROWS,
  DENSE_ROWS, VESSEL_ACCURACY_NOTE, VESSEL_ROWS, SC_CASES, SC_LABELS, SC_LIMITS, SC_STEPS,
  calc, hermiteDefect, implicitEulerAmplification, rk4Amplification, rk4StabilityLimit,
} from "../src/ui/methods/stiffChemistryLesson.js";
import { StiffChemistryTool } from "../src/ui/methods/StiffChemistryTool.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const ROOT = new URL("../../", import.meta.url);
const text = (rel: string): string => readFileSync(new URL(rel, ROOT), "utf-8");
const lines = (rel: string): string[] => text(rel).split("\n");
const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

describe("stiff-chemistry: the arithmetic of the page", () => {
  it("RK4 is stable up to 2.785 and not beyond", () => {
    const L = rk4StabilityLimit();
    expect(L).toBeCloseTo(2.7853, 3);
    expect(Math.abs(rk4Amplification(-(L - 0.01)))).toBeLessThan(1);
    expect(Math.abs(rk4Amplification(-(L + 0.01)))).toBeGreaterThan(1);
  });
  it("an implicit Euler step damps every decaying mode", () => {
    for (const z of [1e-3, 1, 1e3, 1e9]) {
      const a = Math.abs(implicitEulerAmplification(-z));
      expect(a).toBeLessThan(1);
    }
  });
  it("the Hermite defect scale reproduces the written 1.6e-4 for 1e4 /s and 5e-5 s", () => {
    expect(hermiteDefect(1e4 * 5e-5)).toBeCloseTo(1.6e-4, 5);
  });
  it("the calculator at the radical corner says RK4 blows up and needs millions of steps", () => {
    const r = calc(1e9, 1e-8, 3e-3);
    expect(r.rk4Stable).toBe(false);
    expect(r.rk4Steps).toBeGreaterThan(1e6);
    expect(calc(1e3, 1e-6, 3e-3).rk4Stable).toBe(true);
  });
});

describe("stiff-chemistry: what the page says about Choupo is true", () => {
  it("every file:line it names is in the tree and says what it is cited for", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(25);
    for (const c of CITATIONS) {
      const at = lines(c.file)[c.line - 1] ?? "";
      expect(at, `${c.file}:${c.line} should contain "${c.contains}"`).toContain(c.contains);
    }
  });
  it("every case it names exists", () => {
    for (const d of SC_CASES) expect(existsSync(new URL(`${d}/system/controlDict`, ROOT)), d).toBe(true);
  });
  it("the two deliberate failures are declared expected failures, and the other cases are not", () => {
    for (const c of ["ignition01_h2o2_rk4", "ignition01_h2o2_eulersi"])
      expect(existsSync(new URL(`tutorials/batch/combustion/${c}/.expect-nonconvergence`, ROOT)), c).toBe(true);
    expect(existsSync(new URL("tutorials/batch/combustion/ignition01_h2o2_seulex/.expect-nonconvergence", ROOT))).toBe(false);
  });
  it("every Theory Guide label it names is defined", () => {
    const tex = text("docs/theoryGuide.tex");
    for (const l of SC_LABELS) expect(tex, l).toContain(`\\label{${l}}`);
  });
  it("T_final 3037 K is the seulex golden, and the integrators registered are the four the page names", () => {
    expect(text("tutorials/batch/combustion/ignition01_h2o2_seulex/expected")).toMatch(/T_final\s+3037\.0/);
    for (const r of IGNITION_ROWS.filter((x) => x.tFinal !== "none")) expect(r.tFinal).toBe("3037 K");
    const reg = text("src/solver/ODE/ODEIntegrator.cpp");
    for (const n of ["RK4", "EulerSI", "Rosenbrock23", "Rodas4", "seulex"])
      expect(reg, n).toContain(`registerType("${n}"`);
  });
  it("the Jacobian is on by default where every law has a derivative, and its audit is in the engine", () => {
    expect(JACOBIAN_ROWS.map((j) => j.id)).toEqual(["fd", "analytic", "openfoam"]);
    expect(text("src/unitOperations/batch/BatchReactor.cpp")).toContain("jacobianAnalytic_ = allAnalytic;");
    expect(existsSync(new URL("bin/curate/check_kinetics_jacobian.py", ROOT))).toBe(true);
  });
  it("the dense-output status on the page equals the source", () => {
    const main = text("src/applications/choupoBatch/main.cpp");
    expect(main.includes("denseOutput"), "DENSE_OUTPUT_LANDED must follow the key in the engine").toBe(DENSE_OUTPUT_LANDED);
  });
  it("the per-vessel table equals the fair-timing record, and the accuracy note carries its atol", () => {
    const d = text("docs/reviews/2026-11-22-fair-timing/README.md");
    for (const r of VESSEL_ROWS) {
      const row = new RegExp(`\\| ${r.integrator} \\| ${r.rtol} \\| [\\d.]+ \\(${r.coupled.replace("x", "x")}\\) \\| [\\d.]+ \\(${r.one}\\) \\| [\\d.]+ \\(${r.two}\\) \\| [\\d.]+ \\(${r.four}\\)`);
      expect(d, r.id).toMatch(row);
    }
    expect(VESSEL_ACCURACY_NOTE).toContain("1e-19");
    expect(SC_LIMITS.some((l) => /Separate steps trade accuracy/.test(l.title))).toBe(true);
    expect(JOURNEY_ROWS[0]!.lesson).toMatch(/quoted from the project log/);
  });
  it("the dense-output numbers are the recorded ones and the moved-rows list is in the tree", () => {
    expect(DENSE_OUTPUT_LANDED).toBe(true);
    expect(DENSE_ROWS.map((r) => [r.id, r.before, r.after])).toEqual([
      ["seulex", "4.0e-2", "6.8e-5"], ["rodas4", "1.9e-4", "6.1e-5"],
      ["rosenbrock23", "level", "level (the step end dominates)"]]);
    expect(existsSync(new URL("docs/reviews/2026-11-22-dense-output/moved_rows.tsv", ROOT))).toBe(true);
    const tex = text("docs/theoryGuide.tex");
    expect(tex).toContain("CONTRO");
    expect(tex).toContain("ntrp23s");
    expect(tex).toContain("denseOutput hermite");
    expect(tex).not.toContain("so the interpolated rows carry no more error than the step that contains them");
  });
});

describe("stiff-chemistry: the recorded counts agree with each other", () => {
  const get = (id: string) => COUNT_ROWS.find((r) => r.id === id)!;
  it("Rodas4's step count grows about as the tolerance to the power -1/4; seulex's barely moves", () => {
    const r = (a: string, b: string) => Number(get(b).accepted) / Number(get(a).accepted);
    expect(r("r4-8", "r4-10")).toBeGreaterThan(3.5);
    expect(r("r4-6", "r4-8")).toBeGreaterThan(2.5);
    expect(r("sx-6", "sx-10")).toBeLessThan(1.5);
  });
  it("a factorisation costs more steps in seulex than in Rodas4 and the Jacobians follow the steps", () => {
    expect(Number(get("sx-8").factors)).toBeGreaterThan(Number(get("sx-8").jacobians));
    expect(Number(get("r4-8").factors)).toBeGreaterThanOrEqual(Number(get("r4-8").accepted));
  });
  it("the page's reading of the table is the table: 25 times worse at the loose step end", () => {
    expect(1.9e-2 / 6.5e-5).toBeGreaterThan(25);
    expect(get("sx-6").stepEnd).toBe("1.9e-2");
    expect(get("r4-6").stepEnd).toBe("6.5e-5");
    expect(get("r4-10").cpu).toBe("1.196 s");
    expect(get("sx-10").cpu).toBe("0.268 s");
    expect(1.196 / 0.268).toBeGreaterThan(4.4);
  });
  it("the Hermite grid defect is the recorded one and an interior 1e5 amplification", () => {
    const d = text("docs/reviews/2026-11-22-densesparse/README.md");
    expect(d).toContain("7.67e-3");
    expect(d).toContain("4.0e-2");
    expect(1e-12 * 1e5).toBeCloseTo(1e-7, 12);
  });
});

describe("stiff-chemistry: the registry and the references", () => {
  const tool = METHOD_TOOLS.find((m) => m.id === "stiff-chemistry");
  it("is a live notes page on the numerics shelf with a real Theory Guide label", () => {
    expect(tool).toBeTruthy();
    expect(tool!.kind).toBe("notes");
    expect(tool!.status).toBe("live");
    expect(tool!.discipline).toBe("Flowsheeting & numerics");
    expect(SC_LABELS).toContain(tool!.theory);
    expect(tool!.origins).toEqual(["engine", "page", "assumption"]);
  });
  it("its blurb is twelve words or fewer", () => {
    expect(words(tool!.blurb)).toBeLessThanOrEqual(12);
  });
  it("its reference list covers the sources the page names", () => {
    const refs = JSON.parse(text("gui/src/ui/methods/lessonReferences.json")).lessons["stiff-chemistry"];
    const t = refs.references.map((r: { text: string }) => r.text).join("\n");
    for (const needle of ["Hairer", "SUNDIALS", "approximate minimum degree", "Miller", "Cantera", "Weller"])
      expect(t, needle).toContain(needle);
    for (const r of refs.references) expect(r.verified.date).toBe("2026-11-22");
  });
  //  Closed programs are NOT named here: bin/curate/check_doctrine.py has the one list and
  //  already scans gui/src and gui/tests.
});

describe("stiff-chemistry: the text budget", () => {
  it("each step keeps at most 70 words in its body and 40 in its note", () => {
    for (const s of SC_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(70);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(40);
    }
    expect(SC_STEPS.length).toBe(8);
    expect(SC_LIMITS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("stiff-chemistry: the rendered page", () => {
  const html = renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(StiffChemistryTool)));
  it("draws every step title, the calculator, the tables and the journey", () => {
    for (const s of SC_STEPS) expect(html, `step ${s.n}`).toContain(s.title);
    expect(html).toContain("data-sc-calculator");
    for (const t of ["ignition", "sparse", "counts", "cost", "split", "timing", "vessels", "dense"])
      expect(html, t).toContain(`data-sc-table="${t}"`);
    for (const j of JOURNEY_ROWS) expect(html, j.id).toContain(`data-sc-journey-row="${j.id}"`);
    for (const j of JACOBIAN_ROWS) expect(html, j.id).toContain(`data-sc-jacobian="${j.id}"`);
  });
  it("says it is recorded and not live, and shows the landed dense output", () => {
    expect(html).toContain("recorded, not live");
    expect(html).toContain("data-sc-vessels");
    expect(html).toContain(`data-sc-dense-status="${DENSE_OUTPUT_LANDED ? "landed" : "pending"}"`);
  });
  it("draws the references and prints no NaN and no undefined", () => {
    expect(html).toContain("data-lesson-references");
    expect(html).not.toMatch(/NaN|undefined/);
  });
});
