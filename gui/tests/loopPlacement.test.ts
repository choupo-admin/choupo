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
  loopPlacement -- "Where to put a control loop" (DEV.md 4c C204).

  Three arms.  (1) THE ARITHMETIC: the 2x2 array against a closed form of
  the textbook (Seborg et al. Example 18.3, lambda = x), the two routes to the
  array held equal, the valve count, the PI recipe's sign.  (2) THE EDIT: the
  case builder is a pure function of text and refuses what it cannot find.
  (3) THE ENGINE: the very same edit is run through THIS checkout's native
  choupoCtrl, and every number the page quotes (the sign of the gains, the
  array, the swapped pairing's failure, the overflow refusal, the fixed-feed
  outcome) is read off those runs.  The array is computed from engine runs,
  never typed.  It refuses by name when there is no native build.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildLoopCase, WIRINGS, type Wiring } from "../src/ui/methods/loopPlacementCase.js";
import {
  LOOP_PLACEMENT_LIMITS, LOOP_PLACEMENT_QUIZ, LOOP_PLACEMENT_STEPS,
} from "../src/ui/methods/loopPlacementLesson.js";
import * as M from "../src/ui/methods/loopPlacementMath.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { REPO } from "./witnessOutputs.js";

const WITNESS_DIR = join(REPO, "tutorials", M.LOOP_WITNESS);
const RAW_FILES = ["system/flowsheetDict", "system/controlDict", "0/feed"];
const raw = (): { [k: string]: string } =>
  Object.fromEntries(RAW_FILES.map((f) => [f, readFileSync(join(WITNESS_DIR, f), "utf-8")]));

// ---- (1) the arithmetic ------------------------------------------------------

describe("the relative gain array", () => {
  it("equals Seborg's Example 18.3 closed form, lambda = x, at w = 4 and x = 0.4", () => {
    //  K11 = 1, K12 = 1, K21 = (1-x)/w, K22 = -x/w (Eqs. 18-44a to d).
    const w = 4, x = 0.4;
    const K = { K11: 1, K12: 1, K21: (1 - x) / w, K22: -x / w };
    expect(M.lambda11(K)).toBeCloseTo(x, 14);
    expect(M.rga2(K).swapped).toBeCloseTo(1 - x, 14);
    expect(M.recommendedPairing(K)).toBe("swapped");
    expect(M.recommendedPairing({ ...K, K21: (1 - 0.9) / w, K22: -0.9 / w })).toBe("diagonal");
  });

  it("the two routes agree, and every row and column sums to one", () => {
    const K = { K11: 0.57, K12: -15600, K21: 0.0071, K22: -414 };
    const L = M.rgaSchur(K);
    const r = M.rga2(K);
    expect(L[0]![0]).toBeCloseTo(r.diag, 12);
    expect(L[0]![1]).toBeCloseTo(r.swapped, 12);
    expect(L[0]![0] + L[0]![1]).toBeCloseTo(1, 12);
    expect(L[0]![0] + L[1]![0]).toBeCloseTo(1, 12);
  });

  it("reads a relative gain by Bristol's recommendation", () => {
    expect(M.verdict(1)).toBe("good");
    expect(M.verdict(1.9)).toBe("interacting");
    expect(M.verdict(0.3)).toBe("weak");
    expect(M.verdict(-0.9)).toBe("wrong");
    expect(M.verdict(0)).toBe("wrong");
  });
});

describe("the valve count", () => {
  it("counts independent lines, not valves", () => {
    expect(M.countDof(["feed", "out", "jacket"], ["level", "T", "x"]))
      .toEqual({ valves: 3, held: 3, spare: 0 });
    //  A second valve in series on the feed line is not a fourth degree of freedom.
    expect(M.countDof(["feed", "feed2", "out", "jacket"], ["level", "T", "x"]).valves).toBe(3);
    expect(M.countDof(["feed", "out", "jacket"], ["level", "T", "x", "Fout"]).spare).toBe(-1);
  });
});

describe("the PI recipe", () => {
  it("gives Kp K = 0.5, the sign of the gain, and Ki = Kp / 300 s", () => {
    for (const K of [0.57, -414, -15600, 0.0071]) {
      const g = M.piFromGain(K);
      expect(g.Kp * K).toBeCloseTo(M.LOOP_GAIN, 12);
      expect(Math.sign(g.Kp)).toBe(Math.sign(K));
      expect(g.Ki).toBeCloseTo(g.Kp / M.TAU_I_S, 15);
    }
    expect(M.piFromGain(2, 3).Kp).toBeCloseTo(0.75, 12);
  });
});

// ---- (2) the edit ------------------------------------------------------------

describe("the case builder", () => {
  const K = { K11: 0.57, K12: -15600, K21: 0.0071, K22: -414 };
  const before = raw();

  it("keeps the shipped level loop's text and puts the new loops after it", () => {
    const out = buildLoopCase(before, { kind: "closed", loops: WIRINGS.natural, K });
    const fs = out["system/flowsheetDict"]!;
    const shipped = /\n    \{\n        name         LC1;[\s\S]*?\n    \}\n/.exec(before["system/flowsheetDict"]!)![0];
    expect(fs).toContain(shipped);
    expect(fs).toMatch(/cv x_2Butanol; \}\n\s+actuator\s+\{ unit reactor;  mv F_in; \}/);
    expect(fs).toMatch(/cv T; \}\n\s+actuator\s+\{ unit reactor;  mv T_jacket; \}/);
    expect(fs).not.toContain("FeedStep");
    expect(out["system/controlDict"]).toMatch(/endTime\s+20000;/);
  });

  it("the swapped wiring crosses the two actuators", () => {
    const fs = buildLoopCase(before, { kind: "closed", loops: WIRINGS.swapped, K })["system/flowsheetDict"]!;
    expect(fs).toMatch(/cv T; \}\n\s+actuator\s+\{ unit reactor;  mv F_in; \}/);
    expect(fs).toMatch(/cv x_2Butanol; \}\n\s+actuator\s+\{ unit reactor;  mv T_jacket; \}/);
  });

  it("the no-level wiring has no LC1; the open one has only LC1", () => {
    //  The dictionary's header comment names LC1, so look at the controllers list.
    const list = (t: string): string => t.slice(t.indexOf("\ncontrollers\n("));
    expect(list(buildLoopCase(before, { kind: "closed", loops: WIRINGS.noLevel, K })["system/flowsheetDict"]!)).not.toContain("LC1");
    const open = buildLoopCase(before, { kind: "open", Tj: 347, F: 1.02e-3 });
    expect(list(open["system/flowsheetDict"]!)).toContain("LC1");
    expect(list(open["system/flowsheetDict"]!)).not.toContain("TC1");
    expect(open["system/flowsheetDict"]).toMatch(/T_jacket\s+347 K;/);
    expect(open["0/feed"]).toMatch(/2Methyl1Propanol\s+0.00102 kmol\/s;/);
    expect(open["system/controlDict"]).toMatch(/endTime\s+30000;/);
  });

  it("does not modify its input, and refuses a witness without a controllers list", () => {
    expect(before["system/flowsheetDict"]).toContain("FeedStep");
    const bad = { ...before, "system/flowsheetDict": "units\n(\n);\n" };
    expect(() => buildLoopCase(bad, { kind: "open", Tj: 345, F: 1e-3 })).toThrow(/controllers/);
  });
});

// ---- (3) the engine ----------------------------------------------------------

interface Outcome { status: number | null; state: M.LoopState | null; refusal: string | null }

function runNative(w: Wiring): Outcome {
  const bin = join(REPO, "choupoCtrl");
  expect(existsSync(bin), `${bin} is absent -- run \`make all\` at the repository root; `
    + "this test runs the native engine and must not skip").toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "choupo-c204-"));
  try {
    cpSync(WITNESS_DIR, dir, { recursive: true });
    const out = buildLoopCase(raw(), w);
    for (const f of RAW_FILES) writeFileSync(join(dir, f), out[f]!);
    if (out["system/postDict"] === undefined) rmSync(join(dir, "system/postDict"), { force: true });
    const r = spawnSync(bin, [dir], { cwd: REPO, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
    const m = /<<<Choupo:result-begin>>>\s*\n([\s\S]*?)\n<<<Choupo:result-end>>>/.exec(r.stdout ?? "");
    if (!m) {
      const line = `${r.stdout ?? ""}\n${r.stderr ?? ""}`.split("\n").find((l) => l.startsWith("ERROR")) ?? null;
      return { status: r.status, state: null, refusal: line };
    }
    return { status: r.status, state: M.stateFromKpis(JSON.parse(m[1]!).kpis), refusal: null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function measure(dTj: number, dF: number): M.Gain2 {
  const b = runNative({ kind: "open", Tj: M.BASE_TJ_K, F: M.BASE_F_KMOL_S }).state!;
  const a = runNative({ kind: "open", Tj: M.BASE_TJ_K + dTj, F: M.BASE_F_KMOL_S }).state!;
  const c = runNative({ kind: "open", Tj: M.BASE_TJ_K, F: M.BASE_F_KMOL_S + dF }).state!;
  return M.gainsFromRuns(b, a, c, dTj, dF);
}

describe("the engine half, run natively", () => {
  const K = measure(M.STEP_TJ_K, M.STEP_F_KMOL_S);
  const rga = M.rga2(K);

  it("the base run holds the level and the gains have the signs the page uses", () => {
    expect(runNative({ kind: "open", Tj: M.BASE_TJ_K, F: M.BASE_F_KMOL_S }).state!.level).toBeCloseTo(0.5, 4);
    expect(K.K11).toBeGreaterThan(0);   // a hotter jacket heats the vessel
    expect(K.K21).toBeGreaterThan(0);   // and converts more
    expect(K.K12).toBeLessThan(0);      // more cold feed cools it
    expect(K.K22).toBeLessThan(0);      // and shortens the residence time
  });

  it("the array: about 1.9 for the natural pairing, about -0.9 for the swap", () => {
    expect(rga.diag.toFixed(1)).toBe("1.9");
    expect(rga.swapped.toFixed(1)).toBe("-0.9");
    expect(M.recommendedPairing(K)).toBe("diagonal");
    expect(M.verdict(rga.swapped)).toBe("wrong");
    //  the page's prose quotes 1.9 and the sign
    expect(LOOP_PLACEMENT_QUIZ.find((q) => q.id === "closed-gain")!.q).toContain("about 1.9");
  });

  it("the relative gain moves with the step by the amounts the limits state", () => {
    const up = M.rga2(measure(5 * M.STEP_TJ_K, 5 * M.STEP_F_KMOL_S));
    const down = M.rga2(measure(-5 * M.STEP_TJ_K, -5 * M.STEP_F_KMOL_S));
    const lim = LOOP_PLACEMENT_LIMITS.find((l) => l.id === "one-point")!.body;
    expect(up.diag.toFixed(1)).toBe("2.0");
    expect(down.diag.toFixed(1)).toBe("1.8");
    expect(lim).toContain("1.9 to about 2.0");
    expect(lim).toContain("about 1.8");
    expect(up.swapped).toBeLessThan(0);
    expect(down.swapped).toBeLessThan(0);
  });

  it("the natural wiring reaches both set points and the feed rate moves to do it", () => {
    const o = runNative({ kind: "closed", loops: WIRINGS.natural, K });
    expect(o.status).toBe(0);
    expect(Math.abs(o.state!.T - M.SP_T_K)).toBeLessThan(0.01);
    expect(Math.abs(o.state!.x - M.SP_X)).toBeLessThan(0.001);
    expect(o.state!.level).toBeCloseTo(0.5, 3);
    expect(o.state!.F / M.BASE_F_KMOL_S).toBeGreaterThan(1.1);
    expect(o.state!.F / M.BASE_F_KMOL_S).toBeLessThan(1.2);
  });

  it("the swapped wiring fails: the feed sits on its lower limit and T misses by tens of kelvin", () => {
    for (const scale of [1, 0.5, 2]) {
      const o = runNative({ kind: "closed", loops: WIRINGS.swapped, K, scale });
      expect(o.status, `scale ${scale}`).toBe(0);
      expect(o.state!.F, `scale ${scale}`).toBeCloseTo(2e-4, 10);
      expect(Math.abs(o.state!.T - M.SP_T_K), `scale ${scale}`).toBeGreaterThan(10);
    }
  });

  it("without the level loop the engine refuses with an overflow", () => {
    const o = runNative({ kind: "closed", loops: WIRINGS.noLevel, K });
    expect(o.status).not.toBe(0);
    expect(o.state).toBeNull();
    expect(o.refusal).toMatch(/the vessel OVERFLOWED at t = \d+ s/);
  });

  it("with the feed fixed, the composition is held and the temperature floats", () => {
    const o = runNative({ kind: "closed", loops: WIRINGS.fixedThroughput, K });
    expect(o.status).toBe(0);
    expect(Math.abs(o.state!.x - M.SP_X)).toBeLessThan(0.002);
    expect(o.state!.F).toBeCloseTo(M.BASE_F_KMOL_S, 12);
    expect(Math.abs(o.state!.T - M.SP_T_K)).toBeGreaterThan(1);
    expect(Math.abs(o.state!.T - M.SP_T_K)).toBeLessThan(6);
  });
}, 600_000);

// ---- the lesson --------------------------------------------------------------

const words = (s: string): number => s.trim().split(/\s+/).length;

describe("the lesson", () => {
  it("runs 1..6 with a title and a body", () => {
    expect(LOOP_PLACEMENT_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const s of LOOP_PLACEMENT_STEPS) expect(s.body.length, `step ${s.n}`).toBeGreaterThan(80);
  });

  it("keeps the C277 text budget: 60 words before the equation, 40 after", () => {
    for (const s of LOOP_PLACEMENT_STEPS) {
      expect(words(s.body), `step ${s.n} body`).toBeLessThanOrEqual(60);
      if (s.note) expect(words(s.note), `step ${s.n} note`).toBeLessThanOrEqual(40);
    }
  });

  it("has four quiz questions whose steps exist", () => {
    expect(LOOP_PLACEMENT_QUIZ.length).toBe(4);
    for (const q of LOOP_PLACEMENT_QUIZ) for (const n of q.steps)
      expect(LOOP_PLACEMENT_STEPS.some((s) => s.n === n), `${q.id} step ${n}`).toBe(true);
  });

  it("cites the engine at lines that say what the lesson claims", () => {
    const prose = LOOP_PLACEMENT_LIMITS.map((l) => l.body)
      .concat(LOOP_PLACEMENT_STEPS.flatMap((s) => [s.body, s.note ?? "",
        ...(s.derivation ?? []).map((d) => d.step)])).join("\n");
    const cited = new Set([...prose.matchAll(/([A-Za-z]+\.(?:cpp|H)):(\d+)/g)].map((m) => m[0]));
    const CLAIMS: Record<string, string> = {
      "DynamicCSTR.cpp:1412": "std::vector<std::string> v = { \"T_jacket\", \"T_in\", \"F_in\" };",
      "DynamicCSTR.cpp:549": "the level INTEGRATES -- no self-regulation.",
      "DynamicCSTR.cpp:1400": "if (key.rfind(\"x_\", 0) == 0)",
      "DynamicCSTR.cpp:1296": "if (key == \"F_in\")",
      "VariableVolumeHoldup.cpp:141": "the vessel OVERFLOWED at t = ",
      "PIDController.cpp:125": "+ Kp_ * e",
      "PIDController.cpp:131": "Conditional integration (anti-windup)",
    };
    const files: Record<string, string> = {
      "DynamicCSTR.cpp": "src/unitOperations/dynamic/DynamicCSTR.cpp",
      "VariableVolumeHoldup.cpp": "src/unitOperations/dynamic/VariableVolumeHoldup.cpp",
      "PIDController.cpp": "src/control/PIDController.cpp",
    };
    for (const c of cited) expect(CLAIMS[c], `uncovered citation ${c}`).toBeDefined();
    for (const [c, want] of Object.entries(CLAIMS)) {
      expect(cited.has(c), `claim ${c} is no longer cited`).toBe(true);
      const [file, line] = c.split(":");
      const text = readFileSync(join(REPO, files[file!]!), "utf-8").split("\n");
      expect(text[Number(line) - 1], c).toContain(want);
    }
  });

  it("is registered live on the control shelf, anchored on the dynamic reactor chapter", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "loop-placement")!;
    expect(t.status).toBe("live");
    expect(t.discipline).toBe("Hydraulics & control");
    expect(t.theory).toBe("ch:dyn-cstr");
    expect(LOOP_PLACEMENT_LIMITS.find((l) => l.id === "middle-step-is-judgement")!.body)
      .toContain("carries no section on pairing");
  });
});
