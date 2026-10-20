/*---------------------------------------------------------------------------*\
  Why engineering correlations are simple (DEV.md 4c C119), held to the tree.

  What it holds, block by block:
    * the shelf, the kind and the dispatch;
    * the witness: the two CSV names the page reads are the ones the case
      declares, and the grid is 20 points per decade, so a decade starting on
      a grid point holds 21 of them;
    * page 1: the rank, the count and the groups of both problems on their
      default cores, the refusals (a core of the wrong size, a core whose
      columns are dependent), and that a temperature adds a dimension and no
      group while g adds one;
    * pages 3 and 5 against the engine's own sweep: the laminar local slope
      is -1, the smooth curve's slope is near -1/4 at Re = 1e4 and drifts
      toward zero, every rough curve's slope goes to zero; the Churchill-Usagi
      blend at n = 12 of the two published asymptotes reproduces the engine's
      Churchill f at every grid point to round-off; a one-decade power law
      fits Colebrook within about one percent and its exponent drifts;
      Dittus-Boelter's gap to Gnielinski opens fastest below 1e4;
    * page 4: Haken's reduced equation tracks the full pair at a large scale
      ratio and not at a small one, and the roots turn complex below 8;
    * the lesson text: nothing quoted, every equation parses, and every
      file:line it cites lands on the statement it claims.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { SIMPLICITY_LIMITS, SIMPLICITY_STEPS } from "../src/ui/methods/correlationSimplicityLesson.js";
import {
  PROBLEMS, blend, curveOf, dimsOf, fitDecade, hakenEigenvalues, hakenRun, keysOf, localSlope,
  parseSweepCsv, piGroups, type DimProblem,
} from "../src/ui/methods/correlationSimplicityMath.js";
import { witnessOutput } from "./witnessRead.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tree = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");
const CASE = "tutorials/props/hydraulics/moody02_correlation_sweeps";
const TOOL = "gui/src/ui/methods/CorrelationSimplicityTool.tsx";

// ---- the registry ------------------------------------------------------------------

describe("correlation-simplicity: the shelf, the kind and the dispatch", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "correlation-simplicity");
  it("is a live construction on the Hydraulics & control shelf", () => {
    expect(t?.status).toBe("live");
    expect(t?.kind).toBe("construction");
    expect(t?.discipline).toBe("Hydraulics & control");
    expect(t?.label).toBe("Why engineering correlations are simple");
  });
  it("the workspace renders it", () => {
    expect(tree("gui/src/ui/MethodsWorkspace.tsx"))
      .toContain('tool === "correlation-simplicity" ? <CorrelationSimplicityTool />');
  });
  it("the page runs the witness with choupoProps and reads the CSVs the case declares", () => {
    const src = tree(TOOL);
    expect(src).toContain('SIMPLICITY_WITNESS = "props/hydraulics/moody02_correlation_sweeps"');
    expect(src).toContain('"choupoProps"');
    const props = tree(`${CASE}/system/propsDict`);
    expect(tree(`${CASE}/system/controlDict`)).toMatch(/^application\s+choupoProps;/m);
    for (const f of ["moodySweep.csv", "nusseltSweep.csv"]) {
      expect(props).toMatch(new RegExp(`^\\s*file\\s+${f.replace(".", "\\.")};`, "m"));
      expect(src).toContain(`"${f}"`);
    }
  });
  it("no correlation is re-typed on the page", () => {
    for (const rel of [TOOL, "gui/src/ui/methods/correlationSimplicityMath.ts"]) {
      const code = tree(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const c of ["0.316", "2.51", "3.7", "37530", "2.457", "0.023", "1.64", "0.79", "12.7"])
        expect(code, `${rel} carries ${c}`).not.toContain(c);
    }
  });
});

// ---- the witness's grid ---------------------------------------------------------------

const moody = parseSweepCsv(witnessOutput(CASE, "moodySweep.csv"));
const nusselt = parseSweepCsv(witnessOutput(CASE, "nusseltSweep.csv"));

describe("correlation-simplicity: the witness's sweeps", () => {
  it("carry every correlation, both asymptotes and the declared axes", () => {
    for (const c of ["relRough", "Re", "regime", "f_Blasius", "f_Churchill", "f_Colebrook",
      "f_Haaland", "fL_Churchill", "fT_Churchill"])
      expect(moody.cols, c).toContain(c);
    for (const c of ["Pr", "Re", "Nu_DittusBoelter", "Nu_Gnielinski", "Nu_Kern"])
      expect(nusselt.cols, c).toContain(c);
    expect(keysOf(moody, "relRough")).toEqual([0, 1e-5, 1e-4, 1e-3, 1e-2, 5e-2]);
    expect(keysOf(nusselt, "Pr").map((p) => Number(p.toPrecision(12)))).toEqual([0.7, 7, 70]);
    expect(moody.rows.length).toBe(6 * 121);
    expect(nusselt.rows.length).toBe(3 * 81);
  });
  it("is 20 points per decade, so a decade on a grid point holds 21", () => {
    const c = curveOf(moody, "relRough", 0, "f_Colebrook");
    for (let i = 1; i < c.Re.length; i++)
      expect(Math.log10(c.Re[i]! / c.Re[i - 1]!)).toBeCloseTo(0.05, 12);
    expect(fitDecade(c.Re, c.y, 1e4).n).toBe(21);
  });
});

// ---- page 1: dimensional analysis ------------------------------------------------------

const pick = (p: DimProblem, ids: readonly string[]) => p.candidates.filter((v) => ids.includes(v.id));
const expsById = (vars: { id: string }[], exps: number[]) =>
  Object.fromEntries(vars.map((v, i) => [v.id, exps[i]]).filter(([, e]) => e !== 0));

describe("correlation-simplicity: page 1, the Pi theorem by exact elimination", () => {
  it("the pipe: six variables, rank three, three groups -- f, 1/Re, eps/D", () => {
    const P = PROBLEMS.friction;
    const vars = pick(P, P.relevant);
    const r = piGroups(vars, P.defaultCore);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(vars.length).toBe(6);
    expect(r.rank).toBe(3);
    expect(r.groups.length).toBe(3);
    const g = Object.fromEntries(r.groups.map((x) => [x.head, expsById(r.vars, x.exps)]));
    expect(g.dpdL).toEqual({ dpdL: 1, rho: -1, u: -2, D: 1 });
    expect(g.mu).toEqual({ mu: 1, rho: -1, u: -1, D: -1 });
    expect(g.eps).toEqual({ eps: 1, D: -1 });
    for (const x of r.groups) expect(dimsOf(r.vars, x.exps)).toEqual([0, 0, 0, 0]);
  });
  it("the basis is not unique: mu u D gives f Re, rho mu D gives f Re^2", () => {
    const P = PROBLEMS.friction;
    const vars = pick(P, P.relevant);
    const a = piGroups(vars, ["mu", "u", "D"]);
    const b = piGroups(vars, ["rho", "mu", "D"]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(expsById(a.vars, a.groups.find((x) => x.head === "dpdL")!.exps))
      .toEqual({ dpdL: 1, mu: -1, u: -1, D: 2 });
    expect(expsById(b.vars, b.groups.find((x) => x.head === "dpdL")!.exps))
      .toEqual({ dpdL: 1, rho: 1, mu: -2, D: 3 });
  });
  it("a temperature adds a dimension and no group; g adds one group", () => {
    const P = PROBLEMS.friction;
    const withT = piGroups(pick(P, [...P.relevant, "T"]), [...P.defaultCore, "T"]);
    expect(withT.ok && withT.rank === 4 && withT.groups.length === 3).toBe(true);
    const withG = piGroups(pick(P, [...P.relevant, "g"]), P.defaultCore);
    expect(withG.ok && withG.groups.length === 4).toBe(true);
  });
  it("convection: seven variables, rank four, Nu Re Pr; the Peclet and Stanton swaps", () => {
    const P = PROBLEMS.convection;
    const vars = pick(P, P.relevant);
    const r = piGroups(vars, P.defaultCore);
    expect(r.ok && r.rank === 4 && r.groups.length === 3).toBe(true);
    if (!r.ok) return;
    const g = Object.fromEntries(r.groups.map((x) => [x.head, expsById(r.vars, x.exps)]));
    expect(g.h).toEqual({ h: 1, k: -1, D: 1 });
    expect(g.cp).toEqual({ k: -1, mu: 1, cp: 1 });
    expect(g.u).toEqual({ rho: 1, mu: -1, u: 1, D: 1 });
    const pe = piGroups(vars, ["k", "rho", "u", "D"]);
    expect(pe.ok).toBe(true);
    if (pe.ok) expect(expsById(pe.vars, pe.groups.find((x) => x.head === "cp")!.exps))
      .toEqual({ k: -1, rho: 1, cp: 1, u: 1, D: 1 });
    const st = piGroups(vars, ["rho", "cp", "u", "k"]);
    expect(st.ok).toBe(true);
    if (st.ok) expect(expsById(st.vars, st.groups.find((x) => x.head === "h")!.exps))
      .toEqual({ h: 1, rho: -1, cp: -1, u: -1 });
  });
  it("refuses a core of the wrong size, and a core whose columns are dependent", () => {
    const P = PROBLEMS.convection;
    const vars = pick(P, P.relevant);
    const small = piGroups(vars, ["k", "rho", "D"]);
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.reason).toMatch(/exactly rank = 4/);
    const dep = piGroups(vars, ["k", "mu", "cp", "D"]);
    expect(dep.ok).toBe(false);
    if (!dep.ok) expect(dep.reason).toMatch(/not independent/);
  });
});

// ---- pages 3 and 5, against the engine's sweep --------------------------------------------

const colebrook = (e: number) => curveOf(moody, "relRough", e, "f_Colebrook", "in_Colebrook");
const slopes = (e: number) => {
  const c = colebrook(e);
  return { c, s: localSlope(c.Re, c.y, (i) => c.regime[i] !== c.regime[i - 1]) };
};
const at = (c: { Re: number[] }, s: number[], Re: number) =>
  s[c.Re.findIndex((r) => Math.abs(Math.log10(r / Re)) < 1e-9)]!;

describe("correlation-simplicity: page 3, the asymptotes in the engine's own curves", () => {
  it("the laminar slope is -1 on every roughness", () => {
    for (const e of keysOf(moody, "relRough")) {
      const { c, s } = slopes(e);
      c.regime.forEach((g, i) => { if (g === "laminar") expect(s[i]).toBeCloseTo(-1, 10); });
    }
  });
  it("the smooth slope is near -1/4 at 1e4 and drifts steadily toward zero", () => {
    const { c, s } = slopes(0);
    const seq = [1e4, 1e5, 1e6, 1e7].map((Re) => at(c, s, Re));
    expect(Math.abs(seq[0]! + 0.25)).toBeLessThan(0.02);
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!);
    expect(seq.at(-1)!).toBeLessThan(-0.1);
  });
  it("every rough curve goes flat: complete similarity in Re", () => {
    for (const e of [1e-3, 1e-2, 5e-2]) {
      const { s } = slopes(e);
      expect(Math.abs(s.at(-1)!), `eps/D ${e}`).toBeLessThan(1e-3);
    }
  });
});

describe("correlation-simplicity: page 5, correlations in practice", () => {
  it("the blend at n = 12 of the two published asymptotes reproduces Churchill's f", () => {
    for (const e of keysOf(moody, "relRough")) {
      const f = curveOf(moody, "relRough", e, "f_Churchill");
      const fL = curveOf(moody, "relRough", e, "fL_Churchill");
      const fT = curveOf(moody, "relRough", e, "fT_Churchill");
      f.y.forEach((y, i) => expect(Math.abs(blend(fL.y[i]!, fT.y[i]!, 12) / y - 1)).toBeLessThan(1e-12));
      //  fL is the exact laminar law, the engine's own 64/Re.
      fL.Re.forEach((Re, i) => expect(fL.y[i]! * Re).toBeCloseTo(64, 10));
    }
  });
  it("a one-decade power law fits Colebrook to about one percent, and its exponent drifts", () => {
    const c = colebrook(0);
    const fits = [1e4, 1e5, 1e6, 1e7].map((a) => fitDecade(c.Re, c.y, a));
    for (const f of fits) { expect(f.n).toBe(21); expect(f.maxRelErr).toBeLessThan(0.012); }
    for (let i = 1; i < fits.length; i++) expect(fits[i]!.m).toBeGreaterThan(fits[i - 1]!.m + 0.01);
  });
  it("Dittus-Boelter leaves its window below 1e4, where its gap to Gnielinski opens fastest", () => {
    const db = curveOf(nusselt, "Pr", keysOf(nusselt, "Pr")[1]!, "Nu_DittusBoelter", "in_DittusBoelter");
    const gn = curveOf(nusselt, "Pr", keysOf(nusselt, "Pr")[1]!, "Nu_Gnielinski", "in_Gnielinski");
    const gap = db.y.map((y, i) => Math.abs(y / gn.y[i]! - 1));
    db.Re.forEach((Re, i) => expect(db.inWindow[i], `Re ${Re}`).toBe(Re >= 1e4));
    const near = gap[db.Re.findIndex((r) => r >= 1e4)]!;
    expect(near).toBeLessThan(0.05);
    expect(gap[0]!).toBeGreaterThan(0.5);
  });
});

// ---- page 4: Haken ----------------------------------------------------------------------

describe("correlation-simplicity: page 4, master and slave", () => {
  it("the reduction is accurate in proportion to the separation of scales", () => {
    const err = (r: number) => hakenRun(1, r, 8, 0.02 * Math.sqrt(r)).maxRelErr;
    expect(err(1000)).toBeLessThan(0.01);
    expect(err(1)).toBeGreaterThan(0.1);
    expect(err(10)).toBeGreaterThan(err(100));
  });
  it("the roots turn complex below gamma = 8 eps, and approach -2 eps and -gamma above", () => {
    expect(hakenEigenvalues(1, 7.9).im[0]).toBeGreaterThan(0);
    expect(hakenEigenvalues(1, 8.1).im[0]).toBe(0);
    const ev = hakenEigenvalues(1, 1000);
    expect(ev.re[0]).toBeCloseTo(-2, 1);
    expect(ev.re[1]! / -1000).toBeCloseTo(1, 1);
  });
  it("both systems end on the shared fixed point", () => {
    const r = hakenRun(1, 100, 20, 0.02 * Math.sqrt(100));
    expect(r.x.at(-1)! / r.xStar).toBeCloseTo(1, 6);
    expect(r.xReduced.at(-1)! / r.xStar).toBeCloseTo(1, 6);
    expect(r.y.at(-1)!).toBeCloseTo(1, 6);
  });
});

// ---- the lesson text -----------------------------------------------------------------------

describe("correlation-simplicity: the lesson text", () => {
  const all = SIMPLICITY_STEPS.map((s) => [s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)].join(" ")).join(" ");
  it("has fourteen steps on five pages, and the page draws every one of them", () => {
    expect(SIMPLICITY_STEPS.map((s) => s.n)).toEqual([...Array(14)].map((_, i) => i + 1));
    const src = tree(TOOL);
    for (const s of SIMPLICITY_STEPS) expect(src, `step ${s.n}`).toContain(`{step(${s.n})}`);
  });
  it("quotes nothing", () => {
    expect(all).not.toMatch(/["“”]/);
    for (const l of SIMPLICITY_LIMITS) expect(`${l.title} ${l.body}`).not.toMatch(/["“”]/);
  });
  it("every equation parses", () => {
    for (const s of SIMPLICITY_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const d of s.derivation ?? []) if (d.eq) expect(texParses(d.eq), `step ${s.n} derivation`).toBe(true);
      for (const g of s.where ?? []) expect(texParses(g.sym), `step ${s.n} ${g.sym}`).toBe(true);
    }
  });
  it("every file:line it cites lands on what it claims", () => {
    const FILES: Record<string, string> = {
      "FrictionFactorCorrelation.cpp": "src/unitOperations/hydraulics/friction/FrictionFactorCorrelation.cpp",
      "DittusBoelter.H": "src/unitOperations/heatTransfer/htc/DittusBoelter.H",
    };
    const cited = new Set([...all.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)(?:-(\d+))?/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string | RegExp> = {
      "FrictionFactorCorrelation.cpp:47": "scalar laminar(scalar Re) { return 64.0 / Re; }",
      "FrictionFactorCorrelation.cpp:52-53": /Re_LAM = 2300\.0;\s*constexpr scalar Re_TURB = 4000\.0;/,
      "FrictionFactorCorrelation.cpp:92": "r.f = 0.316 * std::pow(c.Re, -0.25);",
      "FrictionFactorCorrelation.cpp:173": "-2.0 * std::log10(c.relRough / 3.7 + 2.51 * x / c.Re);",
      "FrictionFactorCorrelation.cpp:200": "const scalar inv = -2.0 * std::log10(0.01 / 3.7);",
      "FrictionFactorCorrelation.cpp:288-290":
        /a_inner = std::pow\(7\.0 \/ c\.Re, 0\.9\) \+ 0\.27 \* c\.relRough;[\s\S]*A = std::pow\(-2\.457 \* std::log\(a_inner\), 16\.0\);[\s\S]*B = std::pow\(37530\.0 \/ c\.Re, 16\.0\);/,
      "FrictionFactorCorrelation.cpp:315-317":
        /term = std::pow\(8\.0 \/ c\.Re, 12\.0\)[\s\S]*1\.0 \/ std::pow\(A \+ B, 1\.5\);[\s\S]*r\.f = 8\.0 \* std::pow\(term, 1\.0 \/ 12\.0\);/,
      "FrictionFactorCorrelation.cpp:356-359":
        /a\.fLaminar   = laminar\(c\.Re\);[\s\S]*a\.fTurbulent = 8\.0 \* std::pow\(A \+ B, -1\.0 \/ 8\.0\);/,
      "DittusBoelter.H:63": "r.Nu = 0.023 * std::pow(r.Re, 0.8) * std::pow(r.Pr, n);",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, lines] = c.split(":") as [string, string];
      const src = tree(FILES[file]!).split("\n");
      const [a, b] = lines.split("-").map(Number);
      const text = b === undefined ? (src[a! - 1] ?? "") : src.slice(a! - 1, b).join("\n");
      if (typeof want === "string") expect(text, c).toContain(want);
      else expect(text, c).toMatch(want);
    }
  });
});
