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
  gasLine -- "How far can a gas line go?" (C506), held to the engine.

  THE CLAIM HELD: the page's arithmetic (gasLine.ts) at the inputs of
  tutorials/steady/hydraulics/pipe09_isothermal_gas_line equals that case's
  golden `expected` (the recorded engine run, read from the file here):
  P_out exact and by the mean-density shortcut, L_max, P_choke, the two
  isothermal Mach numbers, f, Re, G and the shortcut's error.  The page's
  fixed inputs are read from the case's own dictionaries.  Two independent
  evidences stand beside it:

    * the README's hand-run table (bin/curate/gasline_reference.py, which
      codes its own Churchill and a bisection) is reproduced row by row;
    * two flows other than the case's, run by hand with that script
          gasline_reference.py 300 800000 <mdot> 0.05 <L> 4.6e-5 0.028013 1.78433840676e-05
      (90 kmol/h at 60 m, 20 kmol/h at 2500 m), pin the flow dependence of
      f (Churchill at a different Re), P_out and L_max;
    * a fourth-order Runge-Kutta integration of the differential equation
      equals the closed form: the inversion the page draws is not assumed.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { REPO } from "./witnessOutputs.js";
import {
  ADVISORY_DROP, PIPE09, PIPE09_FLOW_KMOLH, PIPE09_L_M, adiabaticMachAtChoke, churchill,
  dPdx, errorCurve, gasLine, gasState, lengthAtDrop, machAt, profile, rk4Outlet,
} from "../src/ui/methods/gasLine.js";
import {
  FLOW_KNOB, GAMMA_ASSUMED, GasLineTool, LENGTH_KNOB, TABLE_L,
} from "../src/ui/methods/GasLineTool.js";
import { GAS_LIMITS, GAS_QUIZ, GAS_STEPS } from "../src/ui/methods/gasLineLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const CASE = "tutorials/steady/hydraulics/pipe09_isothermal_gas_line";
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");

/** One `kpi P1 <key> <value>` row of the golden. */
function golden(key: string): number {
  const m = new RegExp(`^kpi\\s+P1\\s+${key}\\s+(\\S+)`, "m").exec(read(`${CASE}/expected`));
  if (!m) throw new Error(`no golden row ${key}`);
  return Number(m[1]);
}
/** The relative distance of a value from a golden row. */
const rel = (v: number, g: number): number => Math.abs(v / g - 1);

describe("the page's fixed inputs are the case's own", () => {
  const fs = read(`${CASE}/system/flowsheetDict`);
  it("D, L and the roughness are those of the flowsheetDict", () => {
    expect(Number(/\bD\s+([0-9.]+)\s+m;/.exec(fs)![1])).toBe(PIPE09.D);
    expect(Number(/\bL\s+([0-9.]+)\s+m;/.exec(fs)![1])).toBe(PIPE09_L_M);
    expect(Number(/roughness\s+([0-9.e-]+)\s+m;/.exec(fs)![1])).toBe(PIPE09.eps);
    expect(/model\s+Churchill;/.test(fs)).toBe(true);
  });
  it("P, T and the flow are those of 0/feed; the molar mass is nitrogen's", () => {
    const feed = read(`${CASE}/0/feed`);
    const num = (re: RegExp): number => Number(re.exec(feed)![1]);
    expect(num(/\bT\s+([0-9.]+)\s*K?;/)).toBe(PIPE09.T);
    expect(num(/\bP\s+([0-9.]+)\s*Pa;/)).toBe(PIPE09.P1);
    expect(num(/\bN2\s+([0-9.]+)\s*kmol\/h;/)).toBe(PIPE09_FLOW_KMOLH);
    const n2 = read("data/standards/components/N2.dat");
    expect(Number(/^MW\s+([0-9.]+);/m.exec(n2)![1])).toBe(PIPE09.MW);
  });
  it("the viscosity and Z are the golden's rows", () => {
    expect(PIPE09.mu).toBe(golden("viscosity"));
    expect(PIPE09.Z).toBe(golden("compressibilityZ"));
  });
});

describe("the page equals the engine's recorded run of pipe09 (golden)", () => {
  const line = gasLine(PIPE09, PIPE09_FLOW_KMOLH, PIPE09_L_M);
  const checks: [string, number, string][] = [
    ["P_out exact", line.P2, "P_out"],
    ["P_out mean density", line.P2mean, "P_out_meanDensity"],
    ["delta P", line.dP, "deltaP"],
    ["delta P mean density", line.dPmean, "deltaP_meanDensity"],
    ["L_max", line.Lmax, "L_max"],
    ["P_choke", line.Pch, "P_choke"],
    ["Ma_T in", line.M1, "machIsothermal_in"],
    ["Ma_T out", line.M2, "machIsothermal_out"],
    ["f", line.f, "frictionFactor"],
    ["Re", line.Re, "reynolds"],
    ["G", line.G, "massFlux"],
    ["shortcut error in P_out", line.errP2, "meanDensityError_P_out"],
  ];
  for (const [name, v, key] of checks)
    it(`${name} equals the golden ${key} to 1e-7`, () => {
      expect(rel(v, golden(key)), `${name}: page ${v} golden ${golden(key)}`).toBeLessThan(1e-7);
    });
  it("the verdict is ok and the pressure drop is the golden's 31.7 % of P_in", () => {
    expect(line.verdict).toBe("ok");
    expect(100 * line.dropFrac).toBeCloseTo(31.7, 1);
  });
  it("c is the engine's P_in / density", () => {
    expect(rel(line.c, PIPE09.P1 / golden("density"))).toBeLessThan(1e-8);
  });
});

describe("the page reproduces the README's hand-run table", () => {
  const readme = read(`${CASE}/README.md`);
  const rows = [...readme.matchAll(/^\|\s*(\d+)(?: \(this case\))?\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*(-?[0-9.]+) %\s*\|\s*([0-9.]+) %\s*\|$/gm)]
    .map((m) => ({ L: Number(m[1]), P2: Number(m[2]), P2m: Number(m[3]), eDP: Number(m[4]), drop: Number(m[5]) }));
  it("the README table has the page's six lengths", () => {
    expect(rows.map((r) => r.L)).toEqual([...TABLE_L]);
  });
  for (const r of rows)
    it(`L = ${r.L} m: P2 exact, P2 shortcut, dP error and drop agree to the printed digits`, () => {
      const g = gasLine(PIPE09, PIPE09_FLOW_KMOLH, r.L);
      expect(g.verdict).toBe("ok");
      expect(Math.abs(g.P2 * 1e-5 - r.P2)).toBeLessThan(5.01e-5);
      expect(Math.abs(g.P2mean * 1e-5 - r.P2m)).toBeLessThan(5.01e-5);
      expect(Math.abs(100 * g.errDP - r.eDP)).toBeLessThan(0.0051);
      expect(Math.abs(100 * g.dropFrac - r.drop)).toBeLessThan(0.0501);
    });
});

describe("flows other than the case's, against the independent hand script", () => {
  it("90 kmol/h, 60 m", () => {
    const g = gasLine(PIPE09, 90, 60);
    expect(rel(g.f, 0.0196504047803)).toBeLessThan(1e-9);
    expect(rel(g.Re, 999453.333279)).toBeLessThan(1e-9);
    expect(rel(g.G, 356.672593667)).toBeLessThan(1e-9);
    expect(rel(g.P2, 605457.660172)).toBeLessThan(1e-9);
    expect(rel(g.P2mean, 610648.256267)).toBeLessThan(1e-9);
    expect(rel(g.Pch, 106430.87905)).toBeLessThan(1e-9);
    expect(rel(g.Lmax, 130.95220654)).toBeLessThan(1e-8);
  });
  it("20 kmol/h, 2500 m", () => {
    const g = gasLine(PIPE09, 20, 2500);
    expect(rel(g.f, 0.0207338143017)).toBeLessThan(1e-9);
    expect(rel(g.P2, 242395.622961)).toBeLessThan(1e-9);
    expect(rel(g.P2mean, 245135.662597)).toBeLessThan(1e-9);
    expect(rel(g.Lmax, 2739.66154814)).toBeLessThan(1e-8);
  });
  it("f changes with the flow: Re does", () => {
    expect(gasState(PIPE09, 90).f).toBeLessThan(gasState(PIPE09, 45).f);
    expect(gasState(PIPE09, 20).f).toBeGreaterThan(gasState(PIPE09, 45).f);
  });
  it("Churchill reduces to 64/Re at low Re (the engine's own verify anchor)", () => {
    expect(churchill(100, 0)).toBeCloseTo(0.64, 10);
  });
});

describe("the arithmetic", () => {
  const F = PIPE09_FLOW_KMOLH;
  it("a fourth-order Runge-Kutta integration of the differential form equals the closed form", () => {
    const s = gasState(PIPE09, F);
    for (const L of [100, 300, 540]) {
      const g = gasLine(PIPE09, F, L);
      expect(rel(rk4Outlet(PIPE09, F, L, 4000), g.P2)).toBeLessThan(1e-9);
    }
    expect(dPdx(PIPE09, s, PIPE09.P1)).toBeLessThan(0);
  });
  it("the profile starts at P1, falls, steepens, and the exact curve lies below the shortcut", () => {
    const pr = profile(PIPE09, F, 300, 100);
    expect(pr.exact[0]).toBe(PIPE09.P1);
    for (let i = 1; i < pr.exact.length; i++) {
      expect(pr.exact[i]!).toBeLessThan(pr.exact[i - 1]!);
      expect(pr.mean[i]!).toBeGreaterThan(pr.exact[i]!);
    }
    const slope = (i: number): number => (pr.exact[i]! - pr.exact[i + 1]!) / (pr.x[i + 1]! - pr.x[i]!);
    expect(slope(98)).toBeGreaterThan(slope(0));
    expect(rel(pr.exact[100]!, golden("P_out"))).toBeLessThan(1e-7);
  });
  it("the Mach number is P_choke / P and is 1 at the end of the longest line", () => {
    const s = gasState(PIPE09, F);
    expect(machAt(s, PIPE09.P1)).toBeCloseTo(s.M1, 14);
    const g = gasLine(PIPE09, F, s.Lmax * (1 - 1e-9));
    expect(g.M2).toBeGreaterThan(0.99);
    expect(g.M2).toBeLessThan(1.0000001);
    expect(adiabaticMachAtChoke(GAMMA_ASSUMED)).toBeCloseTo(0.845154, 6);
  });
  it("a line past L_max is choked, as the engine stops it; the inlet limit is flagged", () => {
    expect(gasLine(PIPE09, F, 600).verdict).toBe("choked");
    expect(gasLine(PIPE09, F, 549.1).verdict).toBe("ok");
    expect(gasLine(PIPE09, F, 549.2).verdict).toBe("choked");
    expect(gasLine(PIPE09, 700, 10).verdict).toBe("inletChoked");
    expect(gasLine(PIPE09, 676, 1).verdict).not.toBe("inletChoked");
    expect(lengthAtDrop(PIPE09, 700, 0.4)).toBeNull();
  });
  it("the inlet-choking flow of the slider's declared domain is 676.49 kmol/h", () => {
    expect(gasState(PIPE09, 676.49).inletChoked).toBe(false);
    expect(gasState(PIPE09, 676.5).inletChoked).toBe(true);
    expect(FLOW_KNOB.max).toBeLessThan(676);
  });
  it("the 40 % flag begins at the length where the exact drop is 40 % of P_in", () => {
    const L40 = lengthAtDrop(PIPE09, PIPE09_FLOW_KMOLH, ADVISORY_DROP)!;
    expect(L40).toBeGreaterThan(PIPE09_L_M);
    expect(L40).toBeLessThan(gasState(PIPE09, F).Lmax);
    expect(gasLine(PIPE09, F, L40).dropFrac).toBeCloseTo(0.4, 9);
  });
  it("the shortcut's error grows with the length, and the drop-error is the one the engine prints", () => {
    const e = errorCurve(PIPE09, F, 0.98, 60);
    for (let i = 1; i < e.L.length; i++) expect(e.errP2[i]!).toBeGreaterThan(e.errP2[i - 1]!);
    const g = gasLine(PIPE09, F, 548);
    expect(100 * g.errDP).toBeCloseTo(-8.23, 2);
  });
});

/** The engine lines this page cites, and what each must say. */
const SRC = "src/unitOperations/hydraulics/Pipe.cpp";
const FRC = "src/unitOperations/hydraulics/friction/FrictionFactorCorrelation.cpp";
const CLAIMS: Record<string, [string, number, number | undefined, string | RegExp]> = {
  "Pipe.cpp:835-836": [SRC, 835, 836, /fabs\(dz\) > 0\.0[\s\S]*gas line REFUSED -- dz/],
  "Pipe.cpp:839-840": [SRC, 839, 840, /hasTransport\(\)[\s\S]*gas line REFUSED -- the inlet is all vapour and the property dictionary has no gas viscosity/],
  "Pipe.cpp:857": [SRC, 857, undefined, "const scalar c    = Pin / rho1;"],
  "Pipe.cpp:859": [SRC, 859, undefined, "const scalar Re   = G * D / mu;"],
  "Pipe.cpp:884": [SRC, 884, undefined, "const scalar Pch   = G * std::sqrt(c);"],
  "Pipe.cpp:886-888": [SRC, 886, 888, /if \(M1 >= 1\.0\)[\s\S]*the inlet is at or beyond the isothermal sonic limit/],
  "Pipe.cpp:891-892": [SRC, 891, 892, /KfricMax = \(Pin \* Pin - Pch \* Pch\) \/ cG2 - 2\.0 \* std::log\(Pin \/ Pch\)[\s\S]*Lmax = \(KfricMax - sumK\) \* D \/ f/],
  "Pipe.cpp:893-894": [SRC, 893, 894, /if \(Kfric >= KfricMax\)[\s\S]*the line is choked/],
  "Pipe.cpp:893-897": [SRC, 893, 897, /the line is choked[\s\S]*shorten the line, enlarge D or lower the flow/],
  "Pipe.cpp:904": [SRC, 904, undefined, "P2mean = std::sqrt(Pin * Pin - cG2 * Kfric)"],
  "Pipe.cpp:925": [SRC, 925, undefined, "meanErr = (P2mean - P2) / P2"],
  "Pipe.cpp:927": [SRC, 927, undefined, "A flag level, not a derived bound"],
  "Pipe.cpp:928": [SRC, 928, undefined, "if (dropFrac > 0.4)"],
  "Pipe.cpp:928-932": [SRC, 928, 932, /dropFrac > 0\.4[\s\S]*the pressure falls by[\s\S]*the isothermal assumption is/],
  "Pipe.cpp:942": [SRC, 942, undefined, "adiabatic and Joule-Thomson effects are not modelled; Z held at its inlet value"],
  "FrictionFactorCorrelation.cpp:288-290": [FRC, 288, 290, /a_inner = std::pow\(7\.0 \/ c\.Re, 0\.9\) \+ 0\.27 \* c\.relRough[\s\S]*-2\.457[\s\S]*37530\.0/],
  "FrictionFactorCorrelation.cpp:315-317": [FRC, 315, 317, /std::pow\(8\.0 \/ c\.Re, 12\.0\)[\s\S]*A \+ B, 1\.5[\s\S]*r\.f = 8\.0 \* std::pow\(term, 1\.0 \/ 12\.0\)/],
  "Constants.H:47": ["src/core/Constants.H", 47, undefined, "R       = 8.314462618"],
};

describe("the engine lines the page cites say what the page claims", () => {
  it("every cited line is covered, and every claim is cited", () => {
    const text = [
      "src/ui/methods/gasLineLesson.ts", "src/ui/methods/GasLineTool.tsx", "src/ui/methods/gasLine.ts",
    ].map((f) => readFileSync(join(REPO, "gui", f), "utf-8")).join("\n");
    const cited = new Set([...text.matchAll(/(?:Pipe|FrictionFactorCorrelation|Constants)\.(?:cpp|H):\d+(?:-\d+)?/g)].map((m) => m[0]));
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const c of Object.keys(CLAIMS)) expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
  });
  for (const [c, [rel2, a, b, want]] of Object.entries(CLAIMS))
    it(`${c} says what the page claims for it`, () => {
      const src = readFileSync(join(REPO, rel2), "utf-8").split("\n");
      const t = src.slice(a - 1, b ?? a).join("\n");
      if (typeof want === "string") expect(t).toContain(want);
      else expect(t).toMatch(want);
    });
});

describe("the page", () => {
  const html = (c: () => JSX.Element): string =>
    renderToStaticMarkup(createElement(MantineProvider, null, createElement(c)));

  it("is registered on the pump-and-pipe shelf, live, with its theory anchor", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "gas-line")!;
    expect(t.label).toBe("How far can a gas line go?");
    expect(t.discipline).toBe(METHOD_TOOLS.find((x) => x.id === "pump-system")!.discipline);
    expect(t.status).toBe("live");
    expect(t.theory).toBe("sec:pipe-gasline");
    expect(read("docs/theoryGuide.tex")).toContain("\\label{sec:pipe-gasline}");
  });
  it("renders its three steps and cards, the quiz and the limits, at the case's own numbers", () => {
    const h = html(GasLineTool);
    expect(h).toContain("How far can a gas line go?");
    for (const k of ["controls", "profile", "shortcut", "choking"]) expect(h).toContain(`data-card="${k}"`);
    for (const s of GAS_STEPS) expect(h).toContain(s.title);
    expect(GAS_STEPS.length).toBe(3);
    expect(GAS_LIMITS.length).toBeGreaterThanOrEqual(5);
    expect(GAS_QUIZ.length).toBeGreaterThanOrEqual(5);
    const g4 = (v: number): string => String(Number(v.toPrecision(4)));
    expect(h).toMatch(new RegExp(`data-readout="Pout"[^>]*>[\\s\\S]*?${g4(golden("P_out") * 1e-5)}`));
    expect(h).toMatch(new RegExp(`data-readout="Lmax"[^>]*>[\\s\\S]*?${g4(golden("L_max"))}`));
    expect(h).toMatch(new RegExp(`data-readout="Pchoke"[^>]*>[\\s\\S]*?${g4(golden("P_choke") * 1e-5)}`));
    expect(h).toContain("the engine&#x27;s own flag level, not a bound derived from the equations");
    expect(h).toContain("40 % of the inlet pressure");
  });
  it("the slider defaults are the case's flow and length", () => {
    expect(FLOW_KNOB.def).toBe(PIPE09_FLOW_KMOLH);
    expect(LENGTH_KNOB.def).toBe(PIPE09_L_M);
  });
});
