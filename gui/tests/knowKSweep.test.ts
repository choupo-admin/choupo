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
  knowKSweep.test -- the `how-do-we-know-k` page's whole pipeline, end to end,
  on the NATIVE engine instead of the browser's: for every condition of every
  panel, the same override set the page writes (case/knowK.ts), the same pilot
  loop (adaptWindow) and the same fits, and the recovered constants held to
  the k the engine announced.

  WHY IT EXISTS.  knowK.test.ts holds the page's numbers at the cases'
  defaults, the only run outputs the global setup produces.  The page runs
  forty-odd other conditions, and nothing else would notice a window that
  never settles, a knob that rewrites the wrong number or a fit that drifts
  at 1400 K.  The browser path (`useDecaySweep`) calls the same functions in
  the same order; what differs is the carrier of the engine (WASM there, the
  native binary here), which the rest of the corpus already holds equal.

  The test refuses by name, like every witness reader, when this tree has no
  native build.
\*---------------------------------------------------------------------------*/

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import type { TrajectoryData } from "../src/adapters/SolverAdapter.js";
import {
  ARR_XH2, BREAK_XH2, BREAK_XOH, CELL_PRESSURE, FALLOFF_P_BAR, FALLOFF_T, FALLOFF_XH2O2,
  PILOT_MAX, R_GAS, ROP_TIME, RXN_FALLOFF, RXN_OH_H2,
  SEED_XOH, SERIES_XH2, T_STOPS, adaptWindow, announcedLaws, arrheniusFit, concMolCm3,
  effectiveEa, engineBimolecularK, engineFalloff, experimentOverrides, fitDecay, linearFit,
  recordExponents, ropOf, signalOf, witnessOf, type Experiment,
} from "../src/case/knowK.js";
import { FIRST_WINDOW } from "../src/case/knowKRun.js";
import { methodCase } from "../src/case/methodRun.js";
import { REPO } from "./witnessOutputs.js";
import { witnessOutput } from "./witnessRead.js";

interface Run { traj: TrajectoryData; log: string; rop: string; window: number; trials: number; good: boolean }

function parseTrajectory(csv: string): TrajectoryData {
  const lines = csv.trim().split("\n");
  const head = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(",").map(Number));
  const vars: { [k: string]: number[] } = {};
  head.slice(1).forEach((h, j) => { vars[h] = rows.map((r) => r[j + 1]!); });
  return { t: rows.map((r) => r[0]!), vars };
}

/** One engine run of the page's witness under the page's overrides. */
function engine(species: "OH" | "H2O2", e: Experiment): { traj: TrajectoryData; log: string; rop: string } {
  const files = methodCase(witnessOf(species), experimentOverrides(e)).rawFiles!;
  const dir = mkdtempSync(join(tmpdir(), "knowk-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    const r = spawnSync(join(REPO, "choupoBatch"), ["."], {
      cwd: dir, encoding: "utf-8", env: { ...process.env, CHOUPO_HOME: REPO }, maxBuffer: 1 << 28,
    });
    if (r.status !== 0) throw new Error(`choupoBatch exited ${r.status}: ${r.stdout.split("\n").filter((l) => /ERROR/.test(l)).join(" | ")}`);
    const rop = ((): string => { try { return readFileSync(join(dir, "rateOfProduction.csv"), "utf-8"); } catch { return ""; } })();
    return { traj: parseTrajectory(readFileSync(join(dir, "trajectory.csv"), "utf-8")), log: r.stdout, rop };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The page's pilot loop (knowKRun.ts), one condition. */
function measure(species: "OH" | "H2O2", e: Omit<Experiment, "endTime">, w0: number): Run {
  let w = w0, trials = 0, last: Run | null = null;
  for (let i = 0; i < PILOT_MAX; i++) {
    trials++;
    const r = engine(species, { ...e, endTime: w });
    const sig = signalOf(r.traj, species)!;
    const a = adaptWindow(w, sig.t, sig.n);
    last = { ...r, window: w, trials, good: a.ok };
    if (a.ok) break;
    w = a.next;
  }
  return last!;
}

describe("how-do-we-know-k: the page's pipeline on the native engine", () => {
  //  A refusal, by name, when this tree has no native build (the same one the witnesses give).
  witnessOutput("tutorials/batch/combustion/kinetics01_oh_decay", "trajectory.csv");
  const rec = readFileSync(join(REPO, "tutorials/batch/combustion/kinetics01_oh_decay/constant/reactions"), "utf-8");
  const base = { P: CELL_PRESSURE, xOH: SEED_XOH, xH2O2: 0 };
  let w = FIRST_WINDOW;

  it("the pilot settles in a few runs from any first window, and the first run's log announces R3", () => {
    const m = measure("OH", { ...base, T: 1000, xH2: 0.01 }, FIRST_WINDOW);
    expect(m.good).toBe(true);
    expect(m.trials).toBeLessThanOrEqual(4);
    w = m.window;
    expect(announcedLaws(m.log).get(RXN_OH_H2)).toBeDefined();
  });

  it("panel 2: the slope of k' against c is the engine's k at every temperature of the cell slider", () => {
    for (const T of T_STOPS) {
      const rs = SERIES_XH2.map((x) => measure("OH", { ...base, T, xH2: x }, w));
      const cs = SERIES_XH2.map((x) => concMolCm3(x, T, CELL_PRESSURE));
      const kps = rs.map((r) => fitDecay(signalOf(r.traj, "OH")!.t, signalOf(r.traj, "OH")!.n)!.kPrime);
      const f = linearFit(cs, kps)!;
      const kEng = engineBimolecularK(rs[0]!.log, rec, RXN_OH_H2, T)!;
      expect(Math.abs(f.slope / kEng - 1), `T = ${T}`).toBeLessThan(0.003);
      //  no loss that does not depend on H2: the intercept is small against the smallest k'
      expect(Math.abs(f.intercept) / kps[0]!, `T = ${T}`).toBeLessThan(0.01);
    }
  });

  it("panel 3: each k' / c is the engine's k, and the line reads Ea + bRT near the middle", () => {
    const ks: number[] = [];
    let first: Run | null = null;
    for (const T of T_STOPS) {
      const r = measure("OH", { ...base, T, xH2: ARR_XH2 }, w);
      first ??= r;
      const d = fitDecay(signalOf(r.traj, "OH")!.t, signalOf(r.traj, "OH")!.n)!;
      const k = d.kPrime / concMolCm3(ARR_XH2, T, CELL_PRESSURE);
      ks.push(k);
      expect(Math.abs(k / engineBimolecularK(r.log, rec, RXN_OH_H2, T)! - 1), `T = ${T}`).toBeLessThan(0.005);
    }
    const f = arrheniusFit(T_STOPS, ks)!;
    const law = announcedLaws(first!.log).get(RXN_OH_H2)!;
    const Tmean = 1 / (T_STOPS.reduce((s, T) => s + 1 / T, 0) / T_STOPS.length);
    const Eeff = effectiveEa(law.Ea, recordExponents(rec, RXN_OH_H2)!.b, Tmean);
    expect(Math.abs(f.EaApp / Eeff - 1)).toBeLessThan(0.05);
    expect(f.EaApp).toBeGreaterThan(law.Ea);
  });

  it("panel 4: k from the H2O2 decay is the record's Troe law at every pressure and temperature, and Lindemann alone is not", () => {
    for (const T of FALLOFF_T) {
      let w2 = 1.0e-3;
      for (const p of FALLOFF_P_BAR) {
        const r = measure("H2O2", { T, P: p * 1e5, xH2: 0, xOH: 0, xH2O2: FALLOFF_XH2O2 }, w2);
        w2 = r.window;
        expect(r.good, `T = ${T}, P = ${p}`).toBe(true);
        const sig = signalOf(r.traj, "H2O2")!;
        const d = fitDecay(sig.t, sig.n)!;
        const law = engineFalloff(r.log, rec, RXN_FALLOFF, T, (p * 1e5) / (R_GAS * T) * 1e-3)!;
        expect(Math.abs(d.kPrime / law.k - 1), `T = ${T}, P = ${p}`).toBeLessThan(0.005);
        if (p === 30 && T === 1000) expect(Math.abs(law.kLindemann / law.k - 1)).toBeGreaterThan(0.5);
      }
    }
  });

  it("panel 5: the recovered k climbs as the excess falls, and the table names the secondary reactions", () => {
    const T = 1000;
    const cH2 = concMolCm3(BREAK_XH2, T, CELL_PRESSURE);
    const rs = BREAK_XOH.map((x) => measure("OH", { ...base, T, xH2: BREAK_XH2, xOH: x }, w));
    const kEng = engineBimolecularK(rs[0]!.log, rec, RXN_OH_H2, T)!;
    const ratio = rs.map((r) => fitDecay(signalOf(r.traj, "OH")!.t, signalOf(r.traj, "OH")!.n)!.kPrime / cH2 / kEng);
    expect(Math.abs(ratio[0]! - 1)).toBeLessThan(0.002);
    for (let i = 4; i < ratio.length; i++) expect(ratio[i]!).toBeGreaterThan(ratio[i - 1]!);
    expect(ratio[ratio.length - 1]!).toBeGreaterThan(1.3);
    const demo = rs[BREAK_XOH.length - 2]!;
    const t = ropOf(demo.rop, "OH", ROP_TIME)!;
    //  the largest OH source in the table is a reaction that is not the one under study
    const sources = t.rows.filter((r) => r.contribution > 0);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]!.reaction).not.toBe(RXN_OH_H2);
    expect(t.rows[0]!.reaction).toBe(RXN_OH_H2);
  });
});
