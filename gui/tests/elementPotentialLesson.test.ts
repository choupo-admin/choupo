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
  The element-potential lesson (commission C15): the page's numbers are the
  ENGINE'S, and this file is what makes that sentence true.

    1. Every number the prose quotes (`EP_QUOTED`) is recomputed from the
       witnesses' own `newtonLog` files, written by THIS tree's engine before
       the test runs (witnessOutputs.ts).  The engine moves a printed digit,
       this goes red.
    2. Every `file:line` the lesson cites lands on the statement it claims
       (the numericsLessons ANCHORS precedent) and lies inside the file.
    3. The labels the page draws the log with -- elements, species, atom
       counts -- are the witnesses' own declarations, and the knobs land on
       the slots the witness declares.
    4. The witness's reactors are the problems they say they are: each
       reproduces its source case's golden row for row.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EP_LIMITS, EP_QUOTED, EP_STEPS,
} from "../src/ui/methods/elementPotentialLesson.js";
import {
  EP_LIQUID_WITNESS, EP_LOGS, EP_UNITS, EP_WITNESS, LOG_HEADER, SHIFT_ATOMS,
  bisection, elementPotentialOverrides, newtonRoute, pick, readNewtonLog,
  routeEnd, type LogRecord,
} from "../src/ui/methods/elementPotentialRun.js";
import { applyDictOverride } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CASE = `tutorials/${EP_WITNESS}`;
const LIQ = `tutorials/${EP_LIQUID_WITNESS}`;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf-8");

const logOf = (caseDir: string, file: string): LogRecord[] => {
  const r = readNewtonLog(witnessOutput(caseDir, file));
  if (!r.ok) throw new Error(r.why);
  expect(r.read.skipped).toBe(0);
  return r.read.records;
};

/** A number as the page prints it: the quoted string, compared at ITS OWN
 *  precision -- "0.499" means |x - 0.499| < 0.0005. */
function sameAsPrinted(quoted: string, value: number): boolean {
  const s = quoted.replace("−", "-").replace(/\s/g, "");
  const m = /^(-?\d+(?:\.(\d+))?)(?:e(-?\d+))?$/.exec(s);
  if (!m) throw new Error(`cannot read the quoted number '${quoted}'`);
  const decimals = (m[2] ?? "").length;
  const exp = m[3] ? Number(m[3]) : 0;
  const half = 0.5 * 10 ** (exp - decimals);
  return Math.abs(Number(s) - value) <= half * (1 + 1e-12);
}

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const allText = (): string => prose([
  ...EP_STEPS.flatMap((s) => [s.title, s.body, s.note ?? "",
    ...(s.derivation ?? []).map((d) => d.step)]),
  ...EP_LIMITS.flatMap((l) => [l.title, l.body]),
].join(" "));

describe("the lesson's shape", () => {
  it("has five steps, numbered without a gap, each drawn by the shared renderer", () => {
    expect(EP_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    for (const s of EP_STEPS)
      if (s.formula) expect(s.where?.length ?? 0).toBeGreaterThan(0);
  });

  it("is registered live on the numerics shelf and links, not copies, the Claus page", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "element-potential");
    expect(t?.status).toBe("live");
    expect(t?.theory).toBe("ch:gibbs-reactor");
    expect(prose(EP_STEPS[0]!.body)).toContain("The allotrope nobody declared");
    expect(METHOD_TOOLS.some((x) => x.id === "claus-gibbs")).toBe(true);
  });

  it("says the phases are searched, not added to the Newton", () => {
    //  ElementPotential.H said "the larger M+2 two-phase system is solved"
    //  until 2026-09-27; the code bisects the liquid amount.  The page says
    //  what the code does.
    expect(prose(EP_STEPS[3]!.body)).toContain("Neither a liquid nor a solid "
      + "makes the Newton bigger");
    expect(allText()).not.toMatch(/M\s*\+\s*2/);
  });
});

describe("every number the prose quotes is the engine's own", () => {
  const shift = logOf(CASE, EP_LOGS.shift);
  const coking = logOf(CASE, EP_LOGS.coking);
  const ammonia = logOf(CASE, EP_LOGS.ammonia);
  const liquid = logOf(LIQ, EP_LOGS.liquid);
  const Q = EP_QUOTED;

  it("reads a log the engine wrote, with the engine's header", () => {
    const raw = witnessOutput(CASE, EP_LOGS.shift);
    expect(raw.split("\n")[0]).toBe(LOG_HEADER);
    expect(readNewtonLog("a,b\n1,2").ok).toBe(false);
  });

  it("the shift Newton: its seed, its first cut step, its |F| and its end", () => {
    const rows = newtonRoute(shift, "leastSquaresSeed",
      EP_UNITS.shift.elements, EP_UNITS.shift.species);
    const end = routeEnd(shift, "leastSquaresSeed")!;
    expect(end.converged).toBe(true);
    expect(end.iteration).toBe(Q.shiftIterations);
    expect(sameAsPrinted(Q.shiftSeedLnnCO, rows[0]!.lnn[0]!)).toBe(true);
    expect(sameAsPrinted(Q.shiftSeedNormF, rows[0]!.normF!)).toBe(true);
    expect(rows[0]!.alpha).toBe(1 / 64);
    expect(Q.shiftFirstAlpha).toBe("1/64");
    //  From iteration 1 on, every full step is accepted.
    for (const r of rows.slice(1)) if (r.alpha !== null) expect(r.alpha).toBe(1);
    expect(Q.shiftNormF.length).toBe(rows.length - 1);
    Q.shiftNormF.forEach((q, k) =>
      expect(sameAsPrinted(q, rows[k + 1]!.normF!), `|F| at iteration ${k + 1}`)
        .toBe(true));
    //  ln N does not move: the shift neither makes nor destroys moles.
    for (const r of rows) if (r.dlnN !== null) expect(Math.abs(r.dlnN)).toBeLessThan(1e-8);
  });

  it("the element potentials at the answer, and the hand check of step 3", () => {
    const it = routeEnd(shift, "leastSquaresSeed")!.iteration;
    const pi = EP_UNITS.shift.elements.map((e) => pick(shift, "leastSquaresSeed", it, `pi_${e}`)!);
    expect(sameAsPrinted(Q.shiftPiC, pi[0]!)).toBe(true);
    expect(sameAsPrinted(Q.shiftPiH, pi[1]!)).toBe(true);
    expect(sameAsPrinted(Q.shiftPiO, pi[2]!)).toBe(true);
    const lnN = pick(shift, "leastSquaresSeed", it, "lnN")!;
    expect(sameAsPrinted(Q.shiftLnN, lnN)).toBe(true);
    const lnP = pick(shift, "standardState", 0, "lnP")!;
    const g: { [sp: string]: number } = {};
    for (const sp of EP_UNITS.shift.species) {
      g[sp] = pick(shift, "standardState", 0, `gRT_${sp}`)!;
      expect(sameAsPrinted(Q.shiftGRT[sp as keyof typeof Q.shiftGRT], g[sp]!)).toBe(true);
      const lnY = pick(shift, "leastSquaresSeed", it, `lnn_${sp}`)! - lnN;
      expect(sameAsPrinted(Q.shiftLnY[sp as keyof typeof Q.shiftLnY], lnY)).toBe(true);
      //  THE CLAIM OF STEP 3: mu/RT = sum_k pi_k A_ki, on the published numbers.
      const sum = SHIFT_ATOMS[sp]!.reduce((s, a, k) => s + a * pi[k]!, 0);
      expect(Math.abs(g[sp]! + lnP + lnY - sum)).toBeLessThan(1e-9);
    }
    //  ln K of CO + H2O -> CO2 + H2, and the outlet ratio beside it.
    const lnK = -(g.CO2! + g.H2! - g.CO! - g.water!);
    expect(sameAsPrinted(Q.shiftLnK, lnK)).toBe(true);
    const lny = (sp: string) => pick(shift, "leastSquaresSeed", it, `lnn_${sp}`)! - lnN;
    const ratio = Math.exp(lny("CO2") + lny("H2") - lny("CO") - lny("water"));
    expect(sameAsPrinted(Q.shiftK, Math.exp(lnK))).toBe(true);
    expect(sameAsPrinted(Q.shiftK, ratio)).toBe(true);
  });

  it("the liquid: the test on the gas answer and the search on L", () => {
    expect(sameAsPrinted(Q.liquidYP, pick(liquid, "liquidTest", 0, "yP_water")!)).toBe(true);
    expect(sameAsPrinted(Q.liquidPsat, pick(liquid, "liquidTest", 0, "Psat_water")!)).toBe(true);
    const L = bisection(liquid, "liquidBisection", "L", "r");
    expect(L.length).toBe(Q.liquidSolves);
    expect(sameAsPrinted(Q.liquidL, L[L.length - 1]!.x)).toBe(true);
  });

  it("the solid: pi_C - g_C/RT is the activity the engine tested, then the search", () => {
    const it = routeEnd(coking, "leastSquaresSeed")!.iteration;
    const piC = pick(coking, "leastSquaresSeed", it, "pi_C")!;
    const gC = pick(coking, "solidTest", 0, "gRT_graphite")!;
    const lnA = pick(coking, "solidTest", 0, "lnActivity_graphite")!;
    expect(Math.abs(piC - gC - lnA)).toBeLessThan(1e-9);
    expect(sameAsPrinted(Q.cokingPiC, piC)).toBe(true);
    expect(sameAsPrinted(Q.cokingGRT, gC)).toBe(true);
    expect(sameAsPrinted(Q.cokingLnA, lnA)).toBe(true);
    expect(sameAsPrinted(Q.cokingA, Math.exp(lnA))).toBe(true);
    const S = bisection(coking, "solidBisection", "n_graphite", "lnActivity_graphite");
    expect(S.length).toBe(Q.cokingSolves);
    expect(sameAsPrinted(Q.cokingNs, S[S.length - 1]!.x)).toBe(true);
    expect(Math.abs(S[S.length - 1]!.r)).toBeLessThan(1e-10);
  });

  it("the ammonia feed: the seed stops at iteration 0, the primal re-seed answers", () => {
    const first = routeEnd(ammonia, "leastSquaresSeed")!;
    expect(first).toEqual({ iteration: 0, converged: false });
    //  No step was taken from the seed: the Newton stopped before stepping.
    expect(pick(ammonia, "leastSquaresSeed", 0, "alpha")).toBeNull();
    const lnnW = pick(ammonia, "leastSquaresSeed", 0, "lnn_water")!;
    const lnnN2 = pick(ammonia, "leastSquaresSeed", 0, "lnn_N2")!;
    expect(sameAsPrinted(Q.ammoniaSeedLnnWater, lnnW)).toBe(true);
    expect(sameAsPrinted(Q.ammoniaSeedLnnN2, lnnN2)).toBe(true);
    const sci = (s: string) => s.replace(" × 10", "e").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g,
      (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".includes(c) ? String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)) : "-");
    expect(sameAsPrinted(sci(Q.ammoniaSeedNWater), Math.exp(lnnW))).toBe(true);
    expect(sameAsPrinted(sci(Q.ammoniaSeedNN2), Math.exp(lnnN2))).toBe(true);
    expect(sameAsPrinted(Q.ammoniaSeedNormF, pick(ammonia, "leastSquaresSeed", 0, "normF")!)).toBe(true);
    expect(routeEnd(ammonia, "primalSeed")).toEqual(
      { iteration: Q.ammoniaPrimalIterations, converged: true });
    expect(routeEnd(ammonia, "primalReseed")).toEqual(
      { iteration: Q.ammoniaReseedIterations, converged: true });
    expect(sameAsPrinted(Q.ammoniaReseedNormF, pick(ammonia, "primalReseed", 0, "normF")!)).toBe(true);
    //  The re-seed Newton starts exactly where the primal left off.
    for (const q of ["pi_N", "pi_H", "pi_O", "lnN"])
      expect(pick(ammonia, "primalReseed", 0, q)).toBe(pick(ammonia, "primalSeed",
        Q.ammoniaPrimalIterations, q));
  });
});

// ---- citations ----------------------------------------------------------------

/** Every `File.ext:NNN(–MMM)` the lesson cites; a bare `:NNN` inherits the
 *  file named before it ("NewtonND.cpp:477 ... (:479)"). */
function citations(): { file: string; lo: number; hi: number }[] {
  const src = readFileSync(join(ROOT, "gui/src/ui/methods/elementPotentialLesson.ts"), "utf-8");
  const out: { file: string; lo: number; hi: number }[] = [];
  let last = "";
  for (const m of src.matchAll(/([A-Za-z]+\.(?:H|cpp))?:(\d+)(?:–(\d+))?/g)) {
    if (m[1]) last = m[1];
    else if (m.index! > 0 && /[\w.]/.test(src[m.index! - 1]!)) continue;
    if (!last) continue;
    out.push({ file: last, lo: Number(m[2]), hi: Number(m[3] ?? m[2]) });
  }
  return out;
}

function resolve(file: string): string {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith("/" + file)) hits.push(p);
    }
  };
  walk(join(ROOT, "src"));
  if (hits.length !== 1) throw new Error(`${file} resolves to ${hits.length} files`);
  return hits[0]!;
}

//  [file, line, the statement that line must carry]
const ANCHORS: readonly [string, number, string][] = [
  ["GibbsMethod.cpp", 51, "clampArg"],
  ["GibbsMethod.cpp", 76, "auto residual"],
  ["GibbsMethod.cpp", 84, "std::exp(clampArg(arg))"],
  ["GibbsMethod.cpp", 94, "r[M] = Ntot - std::exp(ln_N)"],
  ["GibbsMethod.cpp", 100, "sVector x0(M + 1"],
  ["GibbsMethod.cpp", 122, "gaussSolve(AAt, Arhs)"],
  ["GibbsMethod.cpp", 128, "ndo.tolerance = 1.0e-8"],
  ["GibbsMethod.cpp", 129, "ndo.maxIter   = 80"],
  ["GibbsMethod.cpp", 66, "Effective standard-state Gibbs = g_over_RT PLUS the fugacity correction"],
  ["GibbsMethod.cpp", 234, "gibbsPrimalSeed(A, b, gTilde, N0)"],
  ["GibbsMethod.cpp", 313, "NO clamp"],
  ["GibbsMethod.cpp", 409, "GibbsPrimalSeed gibbsPrimalSeed("],
  ["GibbsMethod.cpp", 519, "scalar lambda = (big > 2.0)"],
  ["NewtonND.cpp", 477, "fdJacobian(F, x, Fx"],
  ["NewtonND.cpp", 479, "gaussSolve(J, minusFx)"],
  ["NewtonND.cpp", 482, "Singular Jacobian"],
  ["NewtonND.cpp", 491, "Backtracking line search"],
  ["NewtonND.cpp", 512, "if (normFNew < normF) break"],
  ["ElementPotential.cpp", 63, "if (y_i * P > Psat)"],
  ["ElementPotential.cpp", 71, "if (nSuper > 1) return eq"],
  ["ElementPotential.cpp", 79, "const scalar sat_y = PsatC / P"],
  ["ElementPotential.cpp", 110, "L = 0.5 * (Llo + Lhi)"],
  ["GibbsSolidPhase.cpp", 105, "scalar a = -g_over_RT"],
  ["GibbsSolidPhase.cpp", 231, "v.lnActivityWithout > pureSolidPhase::kLnActivityAppears"],
  ["GibbsSolidPhase.cpp", 259, "const scalar lim = p.b[k] / p.A[k][c]"],
  ["GibbsSolidPhase.cpp", 310, "if (rn > 0.0) lo = n; else hi = n;"],
  ["GibbsReactor.cpp", 676, "kpis_[\"lambda_\" + elems[j]]"],
];

describe("every file:line the lesson cites lands on what it claims", () => {
  const cites = citations();

  it("found the citations -- an empty audit is not a passing audit", () => {
    expect(cites.length).toBeGreaterThan(20);
  });

  it("resolves each to a real line of a real file", () => {
    for (const c of cites) {
      const n = readFileSync(resolve(c.file), "utf-8").split("\n").length;
      expect(c.hi, `${c.file}:${c.lo}–${c.hi}`).toBeLessThanOrEqual(n);
      expect(c.lo).toBeLessThanOrEqual(c.hi);
    }
  });

  it("lands each load-bearing citation on its statement, and the page cites it", () => {
    for (const [file, line, needle] of ANCHORS) {
      const text = readFileSync(resolve(file), "utf-8").split("\n")[line - 1] ?? "";
      expect(text, `${file}:${line} should carry ${JSON.stringify(needle)}`)
        .toContain(needle);
      expect(cites.some((c) => c.file === file && c.lo <= line && line <= c.hi),
        `${file}:${line} is anchored here but the lesson does not cite it`).toBe(true);
    }
  });
});

// ---- the witness is what the page says it is ---------------------------------

describe("the witnesses", () => {
  const FS = read(`${CASE}/system/flowsheetDict`);
  const unitBlock = (fs: string, name: string): string => {
    const a = fs.indexOf(`name        ${name};`);
    expect(a, `unit ${name}`).toBeGreaterThan(0);
    const b = fs.indexOf("name        ", a + 10);
    return fs.slice(a, b < 0 ? undefined : b);
  };
  const declared = (block: string) => ({
    elements: block.match(/elements\s*\(([^)]*)\)/)![1]!.trim().split(/\s+/),
    species: [...block.matchAll(/\{\s*name\s+(\w+);\s*atoms\s*\(([^)]*)\)/g)]
      .map((m) => ({ name: m[1]!, atoms: m[2]!.trim().split(/\s+/).map(Number) })),
    log: block.match(/newtonLog\s+(\S+);/)?.[1],
  });

  it("each reactor's labels and log are the ones the dict declares", () => {
    for (const unit of ["shift", "coking", "ammonia"] as const) {
      const d = declared(unitBlock(FS, unit));
      expect(d.elements).toEqual([...EP_UNITS[unit].elements]);
      expect(d.species.map((s) => s.name)).toEqual([...EP_UNITS[unit].species]);
      expect(d.log).toBe(EP_LOGS[unit]);
    }
    const shift = declared(unitBlock(FS, "shift"));
    for (const s of shift.species) expect(s.atoms).toEqual([...SHIFT_ATOMS[s.name]!]);
    const liq = declared(read(`${LIQ}/system/flowsheetDict`));
    expect(liq.elements).toEqual([...EP_UNITS.liquid.elements]);
    expect(liq.species.map((s) => s.name)).toEqual([...EP_UNITS.liquid.species]);
    expect(liq.log).toBe(EP_LOGS.liquid);
  });

  it("the knobs write the shift and ammonia temperatures and nothing else", () => {
    let fs = FS;
    const files: { [f: string]: string } = {
      "0/feedShift": read(`${CASE}/0/feedShift`),
      "0/feedAmmonia": read(`${CASE}/0/feedAmmonia`),
    };
    for (const o of elementPotentialOverrides(650, 950)) {
      if (o.file === "system/flowsheetDict") fs = applyDictOverride(fs, o);
      else files[o.file] = applyDictOverride(files[o.file]!, o);
    }
    expect(unitBlock(fs, "shift")).toMatch(/^\s*T\s+650 K;/m);
    expect(unitBlock(fs, "coking")).toMatch(/^\s*T\s+1000 K;/m);
    expect(unitBlock(fs, "ammonia")).toMatch(/^\s*T\s+950 K;/m);
    expect(files["0/feedShift"]).toMatch(/^T\s+650 K;/m);
    expect(files["0/feedAmmonia"]).toMatch(/^T\s+950 K;/m);
  });

  it("each reactor reproduces its source case's golden, row for row", () => {
    //  The witness re-poses three corpus problems; if one drifted from its
    //  source, the page's "gibbs01's problem" would be a false label.
    const rows = (rel: string, unit: string) => {
      const out: { [k: string]: number } = {};
      for (const l of read(rel).split("\n")) {
        const c = l.trim().split(/\s+/);
        if (c[0] === "kpi" && c[1] === unit) out[c[2]!] = Number(c[3]);
      }
      return out;
    };
    const pairs: [string, string, string][] = [
      ["tutorials/steady/gibbs/gibbs01_water_gas_shift/expected", "wgs", "shift"],
      ["tutorials/steady/gibbs/gibbs11_carbon_deposition/expected", "reformerLow", "coking"],
    ];
    for (const [src, srcUnit, unit] of pairs) {
      const a = rows(src, srcUnit), b = rows(`${CASE}/expected`, unit);
      const keys = Object.keys(a).filter((k) => k.startsWith("y_")
        || k.startsWith("lambda_") || k === "Q_kW" || k.startsWith("n_solid"));
      expect(keys.length).toBeGreaterThan(3);
      for (const k of keys)
        expect(Math.abs(a[k]! - b[k]!), `${unit}.${k} vs ${srcUnit}.${k}`)
          .toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(a[k]!)));
    }
  });
});
