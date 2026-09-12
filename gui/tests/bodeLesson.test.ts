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
  bodeLesson — the page's ARITHMETIC recomputed, and its CITATIONS verified
  mechanically.

  THE CITATION ARM IS THE POINT OF THIS FILE.  The EduTools rule settled in
  the 2026-08-28/29 glossing slice (docs/design/what-a-citation-requirement-
  found.md) is that every symbol a lesson defines carries a file:line into the
  engine, "and the parent verifies them mechanically".  That verification was
  done by a human reading reports.  Here it is a test, for one reason: this
  page's whole claim is that half of it IS the engine and half of it is NOT,
  and a reader can only check the first half through the citations.  A WRONG
  citation is worse than none — it is a claim that looks checked.

  What the arm can and cannot buy, stated because a check implying more than
  it has is worse than one reporting less.  It resolves every `path:line` (or
  `path:lo-hi`) written anywhere in the three bode modules, refuses one whose
  file does not exist or whose line number is past the end of it, and then
  checks a TABLE of the load-bearing ones against the TEXT that must be on
  that line.  It cannot tell whether the cited line MEANS what the prose says
  it means; that is a reading, and only a reader can do it.

  The arithmetic arms recompute every number the prose quotes from
  `bodeMath`, so a page cannot teach against its own code — the epsilonNtu /
  bjerrum precedent.
\*---------------------------------------------------------------------------*/

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BODE_LIMITS, BODE_STEPS } from "../src/ui/methods/bodeLesson.js";
import {
  SAMPLING_PHASE_BIAS_RAD, STEPS_PER_PERIOD, controllerResponse, dB,
  firstOrderLagResponse, toDeg,
} from "../src/ui/methods/bodeMath.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");
const MODULES = [
  "gui/src/ui/methods/bodeMath.ts",
  "gui/src/ui/methods/bodeLesson.ts",
  "gui/src/ui/methods/BodeTool.tsx",
];

// ---- the lesson's shape ----------------------------------------------------

describe("the Bode lesson's shape", () => {
  it("runs 1..8 with no gaps and no repeats", () => {
    expect(BODE_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("gives every step a title and a body a reader can use", () => {
    for (const s of BODE_STEPS) {
      expect(s.title.trim().length, `step ${s.n} needs a title`)
        .toBeGreaterThan(10);
      expect(s.body.trim().length, `step ${s.n} needs a body`)
        .toBeGreaterThan(80);
    }
  });

  it("glosses every symbol that any step's formula or derivation uses", () => {
    //  The python gate (bin/curate/check_lesson_symbols.py) owns this rule
    //  corpus-wide; this arm is the same claim for this page, so a missing
    //  gloss fails where the author is working rather than only in the suite.
    const glossed = new Set<string>();
    for (const s of BODE_STEPS) {
      for (const g of s.where ?? []) {
        glossed.add(g.sym);
        for (const part of g.sym.split(/\s*\/\s*|,\s+/)) glossed.add(part.trim());
      }
      const text = [s.formula ?? "", ...(s.derivation ?? []).map((d) => d.eq ?? "")]
        .join("\n");
      //  Greek letters and anything with an underscore are symbols; a bare
      //  Latin word is prose.  Chemical formulas cannot occur on this page.
      for (const tok of text.match(/[A-Za-zα-ωΑ-Ω][A-Za-z0-9_α-ωΑ-Ω]*/g) ?? []) {
        if (!/[_α-ωΑ-Ω]/.test(tok) && tok.length > 2) continue;    // prose
        if (["in", "10", "at", "dt", "dx", "e"].includes(tok)) continue;
        if (/^(sin|cos|exp|ln|log|arctan|dec|out|and|s|t|i|u|y|w)$/.test(tok))
          continue;
        expect(glossed, `"${tok}" appears in a formula and is glossed nowhere`)
          .toContain(tok);
      }
    }
  });
});

// ---- the arithmetic the prose quotes ---------------------------------------

const stepText = (n: number): string => {
  const s = BODE_STEPS.find((x) => x.n === n)!;
  return [s.title, s.body, s.formula ?? "", s.note ?? "",
    ...(s.where ?? []).map((g) => `${g.sym} ${g.means} ${g.unit ?? ""}`),
    ...(s.derivation ?? []).flatMap((d) => [d.step, d.eq ?? ""])].join("\n");
};

describe("every number the page quotes is recomputed here", () => {
  it("the two decibel landmarks", () => {
    expect(dB(Math.SQRT1_2).toFixed(4)).toBe("-3.0103");
    expect(dB(0.5).toFixed(4)).toBe("-6.0206");
    expect(stepText(2)).toContain("−3.0103");
    expect(stepText(2)).toContain("−6.0206");
    expect(dB(1)).toBe(0);
    //  0.70711 is the rounding the page shows beside the log; it must be the
    //  rounding of the real thing.
    expect(Math.SQRT1_2.toFixed(5)).toBe("0.70711");
  });

  it("the corner: 1/sqrt(2), -45 deg, -3.0103 dB at w*tau = 1", () => {
    const r = firstOrderLagResponse(1, 1);
    expect(r.mag).toBeCloseTo(Math.SQRT1_2, 15);
    expect(toDeg(r.phaseRad)).toBeCloseTo(-45, 12);
    expect(dB(r.mag).toFixed(4)).toBe("-3.0103");
    const t = stepText(4);
    expect(t).toContain("−45°");
    expect(t).toContain("−3.0103 dB");
    expect(t).toContain("−20 dB/decade");
    expect(t).toContain("−90°");
  });

  it("the 240 s tank corners at 4.167e-3 rad/s, as step 4 says", () => {
    expect((1 / 240).toExponential(3)).toBe("4.167e-3");
    expect(stepText(4)).toContain("4.167e-3");
  });

  it("the 0.707 measurement recipe is the corner read backwards", () => {
    expect(firstOrderLagResponse(1, 1).mag.toFixed(3)).toBe("0.707");
    expect(stepText(4)).toContain("0.707");
  });

  it("the sampling bias the limits quote is the design's own number", () => {
    expect(SAMPLING_PHASE_BIAS_RAD).toBeCloseTo(-Math.PI / STEPS_PER_PERIOD, 15);
    expect(Math.abs(SAMPLING_PHASE_BIAS_RAD).toExponential(4))
      .toBe("3.1416e-3");
    expect(Math.abs(toDeg(SAMPLING_PHASE_BIAS_RAD)).toFixed(2)).toBe("0.18");
    const lim = BODE_LIMITS.find((l) => l.id === "measured-bias")!.body;
    expect(lim).toContain("3.1416e-3");
    expect(lim).toContain("0.18");
    expect(lim).toContain(String(STEPS_PER_PERIOD));
  });

  it("the PID's cancellation frequency claim holds at 1/sqrt(tI·tD)", () => {
    expect(stepText(6)).toContain("1/√(τ_I·τ_D)");
    const c = { mode: "PID" as const, Kc: 2, tauIS: 300, tauDS: 12 };
    const r = controllerResponse(c, 1 / Math.sqrt(c.tauIS * c.tauDS));
    expect(r.phaseRad).toBeCloseTo(0, 14);
    expect(r.mag).toBeCloseTo(c.Kc, 14);
  });

  it("the '8 time constants leaves 3.4e-4' claim is arithmetic", () => {
    expect(Math.exp(-8).toExponential(1)).toBe("3.4e-4");
  });

  it("step 5's dead-time claim: magnitude exactly one, phase unbounded", () => {
    const t = stepText(5);
    expect(t).toContain("EXACTLY one");
    expect(t).toContain("−ω·θ");
    //  and the page must say Choupo has no such unit, because it has none
    expect(t).toContain("NO unit operation that models a transport delay");
  });
});

// ---- the honesty the page is built on --------------------------------------

describe("the page states which half Choupo computes", () => {
  it("names the absence of a frequency domain in the engine, up front", () => {
    const l = BODE_LIMITS.find((x) => x.id === "no-frequency-domain");
    expect(l, "the first limit must be the engine's absence").toBeTruthy();
    expect(l!.body).toContain("gain margin");
    expect(l!.body).toContain("phase margin");
    expect(l!.body).toContain("MEASURES");
  });

  it("says which single element the engine judges, and which it does not", () => {
    const l = BODE_LIMITS.find((x) => x.id === "one-judged-element")!;
    for (const w of ["integrator", "dead time", "PID"])
      expect(l.body).toContain(w);
    expect(l.body).toContain("NO engine answer");
  });

  it("declares the Theory Guide gap rather than leaving it to be found", () => {
    const l = BODE_LIMITS.find((x) => x.id === "theory-guide-gap")!;
    expect(l.body).toContain("ch:pid");
    //  The registry's anchor and the limit's claim must be the same anchor,
    //  or the page explains a link it does not have.
    const tool = METHOD_TOOLS.find((t) => t.id === "bode")!;
    expect(tool.theory).toBe("ch:pid");
  });

  it("points a reader at the engine op the three numbers should come from",
    () => {
      const l = BODE_LIMITS.find((x) => x.id === "no-closed-loop-run")!;
      expect(l.body).toContain("reactionCurve");
    });

  it("is registered live, on the control shelf, as a construction", () => {
    const tool = METHOD_TOOLS.find((t) => t.id === "bode");
    expect(tool, "no registry entry for the bode tool").toBeTruthy();
    expect(tool!.status).toBe("live");
    expect(tool!.discipline).toBe("Hydraulics & control");
    expect(tool!.kind).toBe("construction");
    expect(tool!.label).toContain("Bode");
  });
});

// ---- THE CITATION AUDIT -----------------------------------------------------

/** Every `some/path.ext:line` or `:lo-hi` written in the three modules. */
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

describe("every file:line this page cites into the engine resolves", () => {
  const cites = citations();

  it("found citations at all — an empty audit is not a passing audit", () => {
    expect(cites.length).toBeGreaterThan(12);
    //  and they must reach the ENGINE, not only this tool's own files
    expect(cites.some((c) => c.path.startsWith("src/"))).toBe(true);
  });

  it("resolves each one to a real file with that line in it", () => {
    for (const c of cites) {
      const file = resolveCited(c.path);
      expect(file, `${c.where} cites ${c.path}, which resolves to no single `
        + "file in this tree").toBeTruthy();
      const lines = readFileSync(file!, "utf-8").split("\n");
      expect(c.lo, `${c.where} cites ${c.path}:${c.lo} — line numbers start at 1`)
        .toBeGreaterThan(0);
      expect(c.hi, `${c.where} cites ${c.path}:${c.lo}-${c.hi}, but that file `
        + `has only ${lines.length} lines`).toBeLessThanOrEqual(lines.length);
      expect(c.hi).toBeGreaterThanOrEqual(c.lo);
    }
  });

  /** The load-bearing ones, checked against what must be ON that line.  A
   *  citation that lands on a blank line or on the wrong statement passes the
   *  arm above and fails here, which is the difference between "the file is
   *  long enough" and "the claim is where I said it is". */
  const ANCHORS: [string, number, string][] = [
    // the measurement: the sin/cos fit and what it publishes
    ["src/applications/choupoCtrl/main.cpp", 1553, "std::hypot(abc[1], abc[2])"],
    ["src/applications/choupoCtrl/main.cpp", 1555, "std::atan2(abc[2], abc[1])"],
    ["src/applications/choupoCtrl/main.cpp", 1567, "out_phase_rad"],
    ["src/applications/choupoCtrl/main.cpp", 1572, "fit_residual_rel"],
    // the drive
    ["src/control/signal/Signals.H", 124, "amplitude*sin"],
    // "one point of a Bode plot" — the engine's own words for what it measures
    ["src/control/signal/Signal.H", 42, "one point of a Bode plot"],
    // the tank whose lag the page derives
    ["src/unitOperations/dynamic/DynamicCSTR.cpp", 556, "dn_i/dt"],
    ["src/unitOperations/dynamic/DynamicCSTR.cpp", 559, "F_out = F_in"],
    ["src/unitOperations/dynamic/DynamicCSTR.cpp", 377, "nTot / F_in_"],
    // the controller, and the form conversion the page uses
    ["src/control/PIDController.cpp", 75, "Kp = Kc; Ki = Kc/tauI; Kd = Kc*tauD"],
    ["src/control/PIDController.cpp", 123, "u_unclamped"],
    ["src/control/PIDController.cpp", 127, "Kd_ * dPVdt"],
    ["src/control/PIDController.cpp", 135, "u_min_"],
    // where K, tau and theta should come from
    ["src/propertyOps/ReactionCurve.H", 221, "theta_s"],
    ["src/propertyOps/ReactionCurve.H", 137, "Kc, Ti, Td"],
    // the one delay this tree has, and it is not a dead time
    ["src/unitOperations/dynamic/DynamicUnitOperation.H", 143, "integrates"],
  ];

  it("lands each load-bearing citation on the statement it claims", () => {
    const all = citations();
    for (const [path, line, needle] of ANCHORS) {
      const file = resolveCited(path);
      expect(file, `${path} is not in this tree`).toBeTruthy();
      const text = readFileSync(file!, "utf-8").split("\n")[line - 1] ?? "";
      expect(text, `${path}:${line} should carry ${JSON.stringify(needle)} — `
        + "the page cites it for exactly that").toContain(needle);
      //  and the page must actually cite it, or this table has outlived the
      //  prose it was written for
      expect(all.some((c) => path.endsWith(c.path) && c.lo <= line && line <= c.hi),
        `${path}:${line} is anchored here but no bode module cites it`)
        .toBe(true);
    }
  });
});
