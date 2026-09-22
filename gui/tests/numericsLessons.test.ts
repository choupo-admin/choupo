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
  The three FLOWSHEETING & NUMERICS lessons, audited together: tear streams,
  Wegstein, and the active-set QP.

  THREE THINGS ARE CHECKED, and the third is the one that earns its keep.

  1. SHAPE.  Steps numbered without gaps, every step with a title and a body
     worth reading, and every symbol a formula or a derivation uses glossed in
     that step or an earlier one.  `bin/curate/check_lesson_symbols.py` owns
     that rule corpus-wide; this arm makes it fail where the author is
     working rather than only in the suite.

  2. THE CLAIMS ABOUT THE ENGINE, which these three pages make constantly:
     that Choupo will not choose a tear, that the recycle clamp defaults are
     not the class defaults, that the engine asserts a hand-worked QP before
     every constrained optimisation.  Each is required to be SAID, in the
     lesson, in words, so a reader meets it rather than having to infer it.

  3. THE CITATION AUDIT (the rule of 2026-08-28/29).  Every `file:line` these
     nine modules write into the engine must resolve to a real file with that
     line in it, and the load-bearing ones must land on the STATEMENT they are
     cited for.  A missing citation is visible and a WRONG one is not, which
     is why the anchor table below names what must be on the line and not
     merely that the file is long enough.

  WHAT IS NOT CHECKED HERE: the arithmetic of each page, which is pinned
  beside the module that computes it (wegsteinMath.test.ts, tearMath.test.ts,
  activeSetQpMath.test.ts), and whether any definition is any GOOD -- the same
  blind spot the corpus-wide gate states about itself.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TEAR_LIMITS, TEAR_STEPS } from "../src/ui/methods/tearLesson.js";
import {
  WEGSTEIN_LIMITS, WEGSTEIN_STEPS,
} from "../src/ui/methods/wegsteinLesson.js";
import { QP_LIMITS, QP_STEPS } from "../src/ui/methods/activeSetQpLesson.js";
import {
  RECYCLE_QMAX_DEFAULT, RECYCLE_QMIN_DEFAULT,
} from "../src/ui/methods/wegsteinMath.js";
import { METHOD_DISCIPLINES, METHOD_TOOLS }
  from "../src/ui/methods/registry.js";
import type { LessonLimit, LessonStep } from "../src/ui/methods/lessonStep.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");

const MODULES = [
  "gui/src/ui/methods/tearMath.ts",
  "gui/src/ui/methods/tearLesson.ts",
  "gui/src/ui/methods/TearStreamsTool.tsx",
  "gui/src/ui/methods/wegsteinMath.ts",
  "gui/src/ui/methods/wegsteinLesson.ts",
  "gui/src/ui/methods/WegsteinTool.tsx",
  "gui/src/ui/methods/activeSetQpMath.ts",
  "gui/src/ui/methods/activeSetQpLesson.ts",
  "gui/src/ui/methods/ActiveSetQpTool.tsx",
];

const PAGES: [string, readonly LessonStep[], readonly LessonLimit[]][] = [
  ["tear streams", TEAR_STEPS, TEAR_LIMITS],
  ["Wegstein", WEGSTEIN_STEPS, WEGSTEIN_LIMITS],
  ["active-set QP", QP_STEPS, QP_LIMITS],
];


const allText = (s: LessonStep): string =>
  [s.title, s.body, s.formula ?? "", s.note ?? "",
    ...(s.where ?? []).map((g) => `${g.sym} ${g.means} ${g.unit ?? ""}`),
    ...(s.derivation ?? []).flatMap((d) => [d.step, d.eq ?? ""])].join("\n");

const pageText = (steps: readonly LessonStep[],
  limits: readonly LessonLimit[]): string =>
  [...steps.map(allText), ...limits.map((l) => `${l.title}\n${l.body}`)]
    .join("\n");

// ---- 1. SHAPE ---------------------------------------------------------------

describe("the three lessons' shape", () => {
  for (const [name, steps, limits] of PAGES) {
    it(`${name}: steps run 1..n with no gaps and no repeats`, () => {
      expect(steps.map((s) => s.n))
        .toEqual(steps.map((_, i) => i + 1));
      expect(steps.length).toBeGreaterThanOrEqual(5);
    });

    it(`${name}: every step has a title and a body a reader can use`, () => {
      for (const s of steps) {
        expect(s.title.trim().length, `step ${s.n} needs a title`)
          .toBeGreaterThan(10);
        expect(s.body.trim().length, `step ${s.n} needs a body`)
          .toBeGreaterThan(80);
      }
    });

    it(`${name}: names what it does NOT show`, () => {
      expect(limits.length).toBeGreaterThanOrEqual(4);
      for (const l of limits) {
        expect(l.title.trim().length).toBeGreaterThan(10);
        expect(l.body.trim().length).toBeGreaterThan(80);
      }
      expect(new Set(limits.map((l) => l.id)).size).toBe(limits.length);
    });

    it(`${name}: gives every equation a \`where\` list to be checked against`, () => {
      //  THE SYMBOL-BY-SYMBOL RULE HAS ONE HOME, and it is
      //  bin/curate/check_lesson_symbols.py.  This arm used to reimplement
      //  it against the monospace formula text, with its own stop-list of
      //  English words and its own guess that a token longer than two
      //  letters was prose.  The equations are LaTeX since 2026-09-22 and
      //  the notation now declares what each token is, so the gate reads
      //  them exactly; a weaker second parser here would be a second home
      //  for the rule.  The structural half stays, because this file can
      //  hold it honestly.
      for (const s of steps) {
        if (!s.formula && !(s.derivation ?? []).some((d) => d.eq)) continue;
        expect(s.where?.length ?? 0,
          `${name} step ${s.n} has an equation and no gloss`)
          .toBeGreaterThan(0);
      }
    });
  }
});

// ---- 2. THE CLAIMS ABOUT THE ENGINE ----------------------------------------

describe("each page SAYS the engine fact it rests on", () => {
  const tear = pageText(TEAR_STEPS, TEAR_LIMITS);
  const weg = pageText(WEGSTEIN_STEPS, WEGSTEIN_LIMITS);
  const qp = pageText(QP_STEPS, QP_LIMITS);

  it("tear: the engine DETECTS the cycle and refuses to CHOOSE the cut", () => {
    //  The whole page exists because of that division of labour, so it must
    //  be in the prose and not only in a module header a student never opens.
    expect(tear).toMatch(/will not choose|refuses to choose|declines that|deliberately deferred/i);
    expect(tear).toMatch(/tearSelection auto/);
    //  ... and it must name the refusals it claims the engine gives.
    for (const w of ["MISSING TEAR", "INVALID ORDER", "FORWARD TEAR",
      "OFF-CYCLE TEAR", "INLET TEAR", "UNKNOWN TEAR", "UNCONSUMED TEAR"])
      expect(tear, `the page names the seven refusals but omits ${w}`)
        .toContain(w);
  });

  it("tear: DECLARED ORDER, not a topological sort, is stated up front", () => {
    expect(TEAR_STEPS[0]!.body + (TEAR_STEPS[0]!.note ?? ""))
      .toMatch(/DECLARED ORDER/);
    expect(tear).toMatch(/does not topologically sort|never topologically/i);
  });

  it("Wegstein: the two clamp defaults are DIFFERENT and the page says so", () => {
    //  The Wegstein class defaults to [-5, 0] and the recycle loop constructs
    //  it with [-1, 0].  A page that quoted only the class pair would be
    //  describing a clamp no flowsheet gets.
    expect(RECYCLE_QMIN_DEFAULT).toBe(-1);
    expect(RECYCLE_QMAX_DEFAULT).toBe(0);
    expect(weg).toMatch(/q_min = -1/);
    expect(weg).toMatch(/\[-5, 0\]/);
    expect(weg).toMatch(/RECYCLE loop constructs|recycle loop constructs/);
  });

  it("Wegstein: the answer to the question is in the prose, not implied", () => {
    //  "It never compares them" -- the component-wise claim, and its reason.
    expect(weg).toMatch(/never compares them/i);
    expect(weg).toMatch(/dimensionless/);
    expect(weg).toMatch(/component-wise|SEPARATELY on every entry/i);
  });

  it("Wegstein: the STOPPING TEST is named as a different question", () => {
    const step8 = WEGSTEIN_STEPS.find((s) => s.n === 8);
    expect(step8, "the page must carry the stopping-test step").toBeTruthy();
    expect(allText(step8!)).toMatch(/no scaling|unscaled|without scaling/i);
    expect(allText(step8!)).toMatch(/latent under-convergence/);
  });

  it("Wegstein: the page admits the engine publishes no q", () => {
    expect(weg).toMatch(/lastQ/);
    expect(weg).toMatch(/nothing (in the recycle loop )?prints it/i);
    expect(weg).toMatch(/toy/i);
  });

  it("QP: the engine's own self-check is named as the anchor", () => {
    expect(qp).toMatch(/1e-9|1 in 10\^9/);
    expect(qp).toMatch(/self-check|asserts/i);
    expect(qp).toMatch(/Nocedal/);
    expect(qp).toMatch(/Algorithm 16\.3/);
  });

  it("QP: the multiplier is taught as a PRICE, in sigma", () => {
    expect(qp).toMatch(/price/i);
    expect(qp).toMatch(/standard deviation/i);
    //  ... and the identity is called an identity, not an attributed share.
    expect(qp).toMatch(/identity, not (an attribution|a share)/i);
  });

  it("QP: the one-way arrow of the reconciliation is stated", () => {
    expect(qp).toMatch(/analysis to reconciliation to equilibrium|one way/i);
    //  The limits block's own title is "Nothing in the reconciliation panel
    //  is a chemistry result"; what is required is that the claim is MADE,
    //  in those words, somewhere a reader meets.
    expect(qp).toMatch(/chemistry result/i);
  });
});

// ---- the registry ----------------------------------------------------------

describe("the three tools are registered and shelved", () => {
  const ids = ["tear-streams", "wegstein", "active-set-qp"];

  it("each is live, a construction, on the numerics shelf", () => {
    for (const id of ids) {
      const t = METHOD_TOOLS.find((x) => x.id === id);
      expect(t, `no registry entry for '${id}'`).toBeTruthy();
      expect(t!.status).toBe("live");
      expect(t!.kind).toBe("construction");
      expect(t!.discipline).toBe("Flowsheeting & numerics");
      expect(t!.teaches.length).toBeGreaterThan(80);
      expect(t!.theory, `${id} must name a Theory Guide destination`)
        .toBeTruthy();
    }
  });

  it("the new shelf is on the one ordered list and holds exactly these", () => {
    expect(METHOD_DISCIPLINES).toContain("Flowsheeting & numerics");
    const shelf = METHOD_TOOLS
      .filter((t) => t.discipline === "Flowsheeting & numerics")
      .map((t) => t.id).sort();
    expect(shelf).toEqual([...ids].sort());
  });

  it("each names a REAL label in the Theory Guide", () => {
    //  A destination the guide does not define opens the PDF at page 1 with
    //  no error -- the failure methodTheoryAnchors.test.ts exists to make
    //  loud.  Repeated here so these three fail beside their own author.
    const guide = readFileSync(join(ROOT, "docs/theoryGuide.tex"), "utf-8");
    for (const id of ids) {
      const dest = METHOD_TOOLS.find((t) => t.id === id)!.theory!;
      expect(guide, `${id} points at \\label{${dest}}, which the guide does `
        + "not define").toContain(`\\label{${dest}}`);
    }
  });

  it("each is MOUNTED in the workspace, not only registered", () => {
    const ws = readFileSync(
      join(ROOT, "gui/src/ui/MethodsWorkspace.tsx"), "utf-8");
    for (const id of ids)
      expect(ws, `'${id}' is registered but the workspace draws nothing for it`)
        .toContain(`tool === "${id}"`);
  });
});

// ---- 3. THE CITATION AUDIT --------------------------------------------------

/** Every `some/path.ext:line` or `:lo-hi` written in the nine modules. */
function citations(): { where: string; path: string; lo: number; hi: number }[] {
  const out: { where: string; path: string; lo: number; hi: number }[] = [];
  for (const mod of MODULES) {
    const src = readFileSync(join(ROOT, mod), "utf-8");
    for (const m of src.matchAll(
      /([A-Za-z0-9_][A-Za-z0-9_/.]*\.(?:H|cpp|ts|tsx)):(\d+)(?:-(\d+))?/g)) {
      out.push({
        where: mod, path: m[1]!,
        lo: Number(m[2]), hi: Number(m[3] ?? m[2]),
      });
    }
  }
  return out;
}

/** Resolve a cited path: exact from the repository root, else the unique file
 *  under src/ whose path ENDS with it.  Ambiguity is a failure, not a guess. */
function resolveCited(path: string): string | null {
  const direct = join(ROOT, path);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith("/" + path)) hits.push(p);
    }
  };
  walk(join(ROOT, "src"));
  return hits.length === 1 ? hits[0]! : null;
}

describe("every file:line these pages cite into the engine resolves", () => {
  const cites = citations();

  it("found citations at all — an empty audit is not a passing audit", () => {
    expect(cites.length).toBeGreaterThan(20);
    expect(cites.some((c) => c.path.startsWith("src/"))).toBe(true);
  });

  it("resolves each one to a real file with that line in it", () => {
    for (const c of cites) {
      const file = resolveCited(c.path);
      expect(file, `${c.where} cites ${c.path}, which resolves to no single `
        + "file in this tree").toBeTruthy();
      const lines = readFileSync(file!, "utf-8").split("\n");
      expect(c.lo, `${c.where} cites ${c.path}:${c.lo} — lines start at 1`)
        .toBeGreaterThan(0);
      expect(c.hi, `${c.where} cites ${c.path}:${c.lo}-${c.hi}, but that file `
        + `has only ${lines.length} lines`).toBeLessThanOrEqual(lines.length);
      expect(c.hi).toBeGreaterThanOrEqual(c.lo);
    }
  });

  /** THE LOAD-BEARING ONES, each with what must be ON that line.  A citation
   *  that lands on a blank line or on the wrong statement passes the arm
   *  above and fails here — the difference between "the file is long enough"
   *  and "the claim is where I said it is". */
  const ANCHORS: [string, number, string][] = [
    // --- Wegstein: the recursion itself
    ["src/solver/Wegstein.cpp", 78, "scalar s = dg / dx;"],
    ["src/solver/Wegstein.cpp", 82, "std::clamp(s / (s - 1.0), qMin_, qMax_)"],
    ["src/solver/Wegstein.cpp", 85, "q * x[i] + (1.0 - q) * gx[i]"],
    ["src/solver/Wegstein.cpp", 64, "epsX"],
    ["src/solver/Wegstein.cpp", 65, "epsS"],
    ["src/solver/Wegstein.cpp", 74, "no movement"],
    ["src/solver/Wegstein.cpp", 80, "degenerate"],
    ["src/solver/Wegstein.H", 73, "qMin = -5.0"],
    ["src/solver/Wegstein.H", 86, "per-component q values"],
    // --- Wegstein: how the flowsheet drives it
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3322, "Wegstein"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3328, "recycleWegsteinQmin"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3329, "recycleWegsteinQmax"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3348, "normL2(gx, x)"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 1995, "v.push_back(s.F)"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 2036, "z /= zsum"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3424, "s.F * (i < s.z.size()"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3467, "latent under-convergence"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 3492, "/ scale[i]"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 2067, "mixes flows and"],
    //  291, not 290: the engine gained a comment line above it and the
    //  anchor was left behind.  The lesson's own citation is the RANGE
    //  288-291 and still covers it; this list holds the ONE line that must
    //  carry the string.  (Drift found 2026-09-16 by an unrelated slice --
    //  a pre-existing red that had nothing to do with it.)
    ["src/applications/choupoSolve/main.cpp", 291, "Mass balance (global)"],
    ["src/streams/ProcessStream.H", 78, "kmol/s"],
    // --- tear streams: the plan contract
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4339, "Flowsheet::validateSequentialPlan"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4429, "MISSING TEAR"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4437, "INVALID ORDER"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4465, "INLET TEAR"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4472, "UNCONSUMED TEAR"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4483, "FORWARD TEAR"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4495, "OFF-CYCLE TEAR"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4552, "[plan] material recycle"],
    ["src/unitOperations/flowsheet/Flowsheet.cpp", 4480, "c <= p->second"],
    // --- the QP
    ["src/solver/ActiveSetQP.cpp", 151, "N&W Algorithm 16.3"],
    ["src/solver/ActiveSetQP.cpp", 270, "N&W eq. 16.41"],
    ["src/solver/ActiveSetQP.cpp", 235, "pnorm < 1.0e-12"],
    ["src/solver/ActiveSetQP.cpp", 143, "feasTol"],
    ["src/solver/ActiveSetQP.cpp", 144, "lamTol"],
    ["src/solver/ActiveSetQP.cpp", 292, "add it to W"],
    ["src/solver/ActiveSetQP.H", 104, "struct QPProblem"],
    ["src/solver/ActiveSetQP.H", 112, "Aineq"],
    ["src/solver/SQP.cpp", 247, "activeSetQP(qp)"],
    ["src/outerDriver/OptimizationDriver.cpp", 484, "verifyActiveSetQP"],
    ["src/streams/AnalysisReconciler.cpp", 165, "solver::activeSetQP(qp)"],
  ];

  it("lands each load-bearing citation on the statement it claims", () => {
    const all = citations();
    for (const [path, line, needle] of ANCHORS) {
      const file = resolveCited(path);
      expect(file, `${path} is not in this tree`).toBeTruthy();
      const text = readFileSync(file!, "utf-8").split("\n")[line - 1] ?? "";
      expect(text, `${path}:${line} should carry ${JSON.stringify(needle)} — `
        + "one of these pages cites it for exactly that").toContain(needle);
      //  ... and a page must actually cite it, or this table has outlived the
      //  prose it was written for.
      expect(all.some((c) => path.endsWith(c.path) && c.lo <= line
        && line <= c.hi),
        `${path}:${line} is anchored here but no numerics module cites it`)
        .toBe(true);
    }
  });
});
