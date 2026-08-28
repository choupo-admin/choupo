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
  The batch rectifier's staircase.

  THE CENTRAL TEST IS NOT A GOLDEN.  The engine computed the distillate FROM
  the pot through the trays; this construction walks back down and must land
  on the pot again.  Checked against the engine's OWN trajectory, at every
  instant of it -- so the drawing is answerable to the solver rather than to a
  number someone recorded once.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  batchRectifierStaircase, constantAlphaCurve, eqCurveFromTxyCsv, rectifyingLine,
  yStar,
} from "../src/case/mccabeThiele.js";

const TXY = readFileSync(new URL(
  "../../tutorials/props/molecular/flash01_operating_line/txy.csv",
  import.meta.url), "utf-8");
const TRAJ = readFileSync(new URL(
  "../../tutorials/batch/still/still04_rectifier_benzene_toluene/trajectory.csv",
  import.meta.url), "utf-8");

const curve = eqCurveFromTxyCsv(TXY, "benzene")!;

/** The engine's own run: pot composition, distillate and reflux per instant. */
function trajectory(): { xW: number; xD: number; R: number }[] {
  const lines = TRAJ.trim().split(/\r?\n/);
  const head = lines[0]!.split(",").map((s) => s.trim());
  const col = (n: string) => head.indexOf(n);
  const out: { xW: number; xD: number; R: number }[] = [];
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const nb = Number(c[col("still.n_benzene")]);
    const nt = Number(c[col("still.n_toluene")]);
    if (!(nb + nt > 0)) continue;
    out.push({
      xW: nb / (nb + nt),
      xD: Number(c[col("still.xD_benzene")]),
      R: Number(c[col("still.R")]),
    });
  }
  return out;
}

describe("the curve and the run are both there", () => {
  it("reads the equilibrium curve", () => {
    expect(curve).toBeTruthy();
    expect(curve.pts.length).toBeGreaterThan(20);
  });
  it("reads the engine's rectifier trajectory", () => {
    const t = trajectory();
    expect(t.length).toBeGreaterThan(10);
    //  constant-reflux policy: R is held, x_D falls with the pot
    expect(t[0]!.R).toBeCloseTo(3, 6);
    expect(t.at(-1)!.xW).toBeLessThan(t[0]!.xW);
    expect(t.at(-1)!.xD).toBeLessThan(t[0]!.xD);
  });
});

describe("the staircase lands on the pot the engine solved", () => {
  //  still04 declares 3 ideal stages ABOVE the pot.
  const TRAYS = 3;

  it("closes to better than 0.001 at EVERY instant of the run", () => {
    let worst = 0;
    for (const p of trajectory()) {
      const s = batchRectifierStaircase(curve, p.xD, p.R, TRAYS);
      worst = Math.max(worst, Math.abs(s.xBottom - p.xW));
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it("and the step count is the one that closes, not a neighbour", () => {
    //  THE CONVENTION, PINNED.  The pot is itself an equilibrium stage, so
    //  the walk takes trays + 1 steps.  Taking trays, or trays + 2, misses by
    //  more than a tenth of a mole fraction -- so this is settled by
    //  measurement and cannot drift back to an assumption.
    const p = trajectory()[0]!;
    const err = (n: number) =>
      Math.abs(batchRectifierStaircase(curve, p.xD, p.R, n).xBottom - p.xW);
    expect(err(TRAYS)).toBeLessThan(1e-3);
    expect(err(TRAYS - 1)).toBeGreaterThan(0.1);
    expect(err(TRAYS + 1)).toBeGreaterThan(0.05);
  });
});

describe("the geometry is the construction, not an approximation of it", () => {
  const c = constantAlphaCurve(2.5);

  it("starts on the diagonal at the distillate", () => {
    const s = batchRectifierStaircase(c, 0.9, 2, 3);
    expect(s.corners[0]!.x).toBeCloseTo(0.9, 12);
    expect(s.corners[0]!.y).toBeCloseTo(0.9, 12);
  });

  it("every horizontal foot sits ON the equilibrium curve", () => {
    const s = batchRectifierStaircase(c, 0.9, 2, 4);
    for (const st of s.steps) expect(yStar(c, st.x)).toBeCloseTo(st.y, 6);
  });

  it("every vertical top sits ON the operating line", () => {
    const R = 2, xD = 0.9;
    const line = rectifyingLine(R, xD);
    const s = batchRectifierStaircase(c, xD, R, 4);
    //  corners alternate curve, line, curve, line...  Index 2, 4, ... are the
    //  tops of the verticals.
    for (let i = 2; i < s.corners.length; i += 2) {
      const p = s.corners[i]!;
      expect(line.m * p.x + line.b).toBeCloseTo(p.y, 9);
    }
  });

  it("descends: each stage is leaner than the one above it", () => {
    const s = batchRectifierStaircase(c, 0.95, 3, 6);
    for (let i = 1; i < s.steps.length; ++i)
      expect(s.steps[i]!.x).toBeLessThan(s.steps[i - 1]!.x);
  });

  it("a still with NO trays reduces to the single pot step", () => {
    //  Not "draws nothing": a simple Rayleigh still separates by one
    //  equilibrium step, and the construction must say so.
    const s = batchRectifierStaircase(c, 0.9, 2, 0);
    expect(s.steps).toHaveLength(1);
    expect(yStar(c, s.xBottom)).toBeCloseTo(0.9, 6);
  });

  it("stops at a pinch instead of emitting steps of zero height", () => {
    //  At low reflux the operating line meets the curve; an unguarded walk
    //  would loop for ever taking infinitesimal steps.
    const s = batchRectifierStaircase(c, 0.95, 0.05, 50);
    expect(s.ranOut).toBe(true);
    expect(s.steps.length).toBeLessThan(50);
  });
});

describe("the drawing is answerable to the run behind it", () => {
  it("labels the last step as the pot, and only the last", () => {
    //  The plot marks the bottom step differently and calls it "pot", which
    //  is the claim that the walk takes trays + 1 steps.  If the geometry
    //  ever went back to trays steps, that label would be on a tray.
    const src = readFileSync(
      new URL("../src/ui/methods/BatchStaircasePlot.tsx", import.meta.url),
      "utf-8");
    expect(src).toContain('i === s.steps.length - 1 ? "pot" : i + 1');
    //  and the caption states the arithmetic rather than asserting it
    expect(src).toContain("{trays + 1} equilibrium steps");
  });

  it("prints the closure instead of hiding it", () => {
    //  A construction that landed somewhere else and said nothing would be
    //  a drawing nobody could check.  The caption carries both numbers and
    //  the gap, and says plainly when the gap is larger than usual.
    const src = readFileSync(
      new URL("../src/ui/methods/BatchStaircasePlot.tsx", import.meta.url),
      "utf-8");
    expect(src).toContain("at.xPot.toFixed(4)");
    expect(src).toContain("s.xBottom.toFixed(4)");
    expect(src).toContain("a finding rather");
  });

  it("computes no physics of its own", () => {
    //  Zero physics in TypeScript: the plot may only draw what the engine and
    //  the geometry module hand it.
    const src = readFileSync(
      new URL("../src/ui/methods/BatchStaircasePlot.tsx", import.meta.url),
      "utf-8");
    for (const banned of ["Math.exp", "Math.log", "antoine", "Psat", "alpha ="])
      expect(src, `the plot computes ${banned}`).not.toContain(banned);
  });
});

describe("the Rayleigh page teaches even when the engine produced nothing", () => {
  const SRC = readFileSync(
    new URL("../src/ui/methods/RayleighTool.tsx", import.meta.url), "utf-8");

  it("renders the lesson in the no-data branch too", () => {
    //  THE DEFECT THIS PINS, found by opening the page: the empty state
    //  returned the knobs and an apology and nothing else, so the
    //  explanation vanished exactly when there was no diagram to explain.
    //  A reader whose browser cannot run the engine must still be able to
    //  learn the method.
    const early = SRC.indexOf("No drawable pot yet");
    const main = SRC.indexOf("Drag the clock and watch the stages slide");
    expect(early).toBeGreaterThan(0);
    expect(main).toBeGreaterThan(early);
    const emptyBranch = SRC.slice(early, main);
    for (const n of [1, 2, 3, 4])
      expect(emptyBranch, `step ${n} is missing from the empty state`)
        .toContain(`{lessonStep(${n})}`);
    expect(emptyBranch).toContain("RAYLEIGH_LIMITS.map");
  });

  it("has ONE renderer for the steps, not one per branch", () => {
    //  Two copies would be two homes for one page, and they would drift.
    expect((SRC.match(/const lessonStep = /g) ?? []).length).toBe(1);
  });

  it("scrolls, and the rail is gone from both branches", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).not.toContain("MethodSetupRail");
  });
});
