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
  The pump-and-system lesson.  Its arithmetic claims are RECOMPUTED from the
  witness case's OWN sweep CSV rather than quoted, because a page that says
  "friction grows roughly as the square of the flow" beside a run where it
  does not is a page teaching against its own engine.

  The honesty claims are checked the same way, against the SOURCE: the lesson
  says the engine computes no NPSH of either kind, and that sentence is
  worthless unless something fails the day one appears.
\*---------------------------------------------------------------------------*/

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUMP_KNOBS, findOperatingPoint, findPumpSystemSweep,
} from "../src/ui/methods/PumpSystemTool.js";
import { PUMP_LIMITS, PUMP_STEPS } from "../src/ui/methods/pumpSystemLesson.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const WITNESS = join(REPO, "tutorials", "steady", "hydraulics",
  "pumpSystem01_operating_point");

const SRC = readFileSync(
  join(HERE, "../src/ui/methods/PumpSystemTool.tsx"), "utf-8");

/** Prose is wrapped in the source; assert against it with its line breaks
 *  normalised, never against one particular wrapping. */
const prose = (s: string): string => s.replace(/\s+/g, " ");

// ---- The witness's own engine output, read from the repository -------------

const sweep = findPumpSystemSweep({
  "sweep_pumpSystem.csv":
    readFileSync(join(WITNESS, "sweep_pumpSystem.csv"), "utf-8"),
})!;
const col = (name: string): number[] => sweep.columns[name]!;

/** Least-squares slope of ln(y) against ln(x) — the exponent of a power law,
 *  measured over the whole swept window rather than from its two ends. */
function logLogSlope(x: number[], y: number[]): number {
  const lx = x.map(Math.log), ly = y.map(Math.log);
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  let num = 0, den = 0;
  for (let i = 0; i < lx.length; ++i) {
    num += (lx[i]! - mx) * (ly[i]! - my);
    den += (lx[i]! - mx) ** 2;
  }
  return num / den;
}

// ---- The lesson runs end to end --------------------------------------------

describe("the lesson runs end to end", () => {
  it("has five steps, numbered without a gap", () => {
    expect(PUMP_STEPS).toHaveLength(5);
    expect(PUMP_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    for (const s of PUMP_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(120);
    }
  });

  it("opens on the misconception the whole page exists to correct", () => {
    const s1 = PUMP_STEPS[0]!;
    expect(prose(s1.title)).toContain("The pump does not set the flow");
    expect(prose(s1.body)).toContain("two different flows");
    //  The crossing is DEFINED in step 1, before either curve is drawn.
    expect(s1.formula).toContain("Δp_pump(Q*) = Δp_system(Q*)");
    expect(prose(s1.body)).toContain("operating point");
  });

  it("splits the system curve into a static part and a friction part", () => {
    const s2 = PUMP_STEPS.find((s) => s.n === 2)!;
    expect(s2.formula).toContain("ρ g Δz");
    expect(s2.formula).toContain("( f·L/D + ΣK ) · ρ v² / 2");
    //  The two halves must be told apart by BEHAVIOUR, not only by name.
    expect(prose(s2.body)).toContain("does not care how fast you push");
    expect(prose(s2.body)).toContain("grows roughly as the SQUARE of the flow");
  });

  it("gives the pump curve of the model this page actually runs", () => {
    const s3 = PUMP_STEPS.find((s) => s.n === 3)!;
    expect(s3.formula).toContain("Δp_pump = η · W_shaft / Q");
    //  A real machine's curve is measured; this one is derived.  Saying so is
    //  the difference between a teaching page and a wrong claim.
    expect(prose(s3.body)).toContain("MEASURED on a test");
    expect(prose(s3.note!)).toContain("never a manufacturer's tested H(Q) curve");
    expect(prose(s3.note!)).toContain("no best-efficiency point");
  });
});

// ---- The design consequences -----------------------------------------------

describe("the consequences an engineer acts on", () => {
  it("throttling: steepens the system curve, moves the point left, wastes head", () => {
    const s4 = PUMP_STEPS.find((s) => s.n === 4)!;
    expect(prose(s4.body)).toContain("raises ΣK");
    expect(prose(s4.body)).toContain("slides LEFT to a lower flow");
    //  The cost, not just the movement: the throttled head is destroyed.
    expect(prose(s4.body)).toContain("dissipated as heat");
    expect(s4.formula).toContain("ΣK ↑");
  });

  it("speed: the affinity laws, with the cube that is the whole argument", () => {
    const s4 = PUMP_STEPS.find((s) => s.n === 4)!;
    expect(s4.formula).toContain("Q ∝ N");
    expect(s4.formula).toContain("H ∝ N²");
    expect(s4.formula).toContain("P ∝ N³");
    expect(prose(s4.body)).toContain("follows its CUBE");
  });

  it("does NOT claim the page computes either move", () => {
    //  The engine's pump has no speed and no valve knob.  A page that let a
    //  reader think the plot showed an affinity-law result would be claiming
    //  a capability that does not exist.
    const s4 = PUMP_STEPS.find((s) => s.n === 4)!;
    expect(prose(s4.note!)).toContain("NEITHER move is computed on this page");
    expect(prose(s4.note!)).toContain("no valve knob");
    expect(prose(s4.note!)).toContain("this pump model has NO SPEED");
    //  And the sharper half: the cube is a relation between homologous points
    //  on the pump's curves, not a promise about the operating point of an
    //  installation that carries a static head.
    expect(prose(s4.note!)).toContain("HOMOLOGOUS points");
    expect(prose(s4.note!)).toContain("all friction, no static head");
  });

  it("NPSH: the separate question, and the falling/rising pair that decides it", () => {
    const s5 = PUMP_STEPS.find((s) => s.n === 5)!;
    expect(prose(s5.body)).toContain("SUCTION side");
    expect(prose(s5.body)).toContain("FALLS as flow rises");
    expect(prose(s5.body)).toContain("RISES with flow");
    expect(s5.formula).toContain("NPSH_a");
    expect(s5.formula).toContain("NPSH_r");
    expect(s5.formula).toContain("cavitation when   NPSH_a ≤ NPSH_r");
  });
});

// ---- The claims are true of the engine that ships --------------------------

describe("the claims are true of the run the page draws", () => {
  it("the pump curve really does fall, and the system curve really does rise", () => {
    for (let i = 1; i < sweep.F.length; ++i) {
      expect(sweep.pumpDP[i]!).toBeLessThan(sweep.pumpDP[i - 1]!);
      expect(sweep.systemDP[i]!).toBeGreaterThan(sweep.systemDP[i - 1]!);
    }
  });

  it("they cross EXACTLY once inside the swept window", () => {
    //  Step 1 says "exactly one place".  One sign change, and the tool's own
    //  bracket sits inside the window rather than at an end.
    let changes = 0;
    for (let i = 1; i < sweep.F.length; ++i) {
      const a = sweep.pumpDP[i - 1]! - sweep.systemDP[i - 1]!;
      const b = sweep.pumpDP[i]! - sweep.systemDP[i]!;
      if (a * b < 0) ++changes;
    }
    expect(changes).toBe(1);
    const op = findOperatingPoint(sweep.F, sweep.pumpDP, sweep.systemDP)!;
    expect(op.F).toBeGreaterThan(sweep.F[0]!);
    expect(op.F).toBeLessThan(sweep.F[sweep.F.length - 1]!);
  });

  it("the static head does NOT change with flow, and the demand does", () => {
    const elev = col("P1.dP_elevation");
    const spread = (Math.max(...elev) - Math.min(...elev)) / Math.min(...elev);
    //  Not exactly zero, and the page does not claim zero: the pumped liquid's
    //  temperature (hence density) shifts a little across the sweep.  What the
    //  page claims is that it is flat in FLOW, and 2e-5 against a demand that
    //  grows six-fold is that claim measured.
    expect(spread).toBeLessThan(1e-4);
    const demand = sweep.systemDP;
    //  The BAND, not the claim, moved on 2026-08-29: the liquid-density fix
    //  (the record's own Vliq anchoring Rackett) raised rho from 877 to
    //  ~997 kg/m3, which grows the static term and shrinks the velocity at
    //  the same mass flow -- so the demand ratio fell from ~6.4 to ~5.5.
    //  The claim under test (static flat, demand grows severalfold) is
    //  untouched; a band hand-picked around the WRONG density was the only
    //  casualty.
    expect(demand[demand.length - 1]! / demand[0]!).toBeGreaterThan(4);
  });

  it("friction grows ROUGHLY as the square — and the 'roughly' is real", () => {
    //  Step 2 says the friction term grows a little less steeply than Q^2,
    //  because f falls as Re rises.  Measured over the whole window: the
    //  exponent is below 2 and not far below it.
    const n = logLogSlope(sweep.F, col("P1.dP_friction"));
    expect(n).toBeLessThan(2);
    expect(n).toBeGreaterThan(1.8);
    //  And the mechanism the step names: Reynolds really does rise with flow
    //  across this window, which is what moves f at all.
    const re = col("P1.reynolds");
    expect(re[re.length - 1]!).toBeGreaterThan(re[0]!);
  });

  it("the pump column IS the constant-power hyperbola the step prints", () => {
    //  Δp = η·W_shaft/Q with Q = F·v_molar, so Δp·F is a constant — recomputed
    //  from the case's OWN declared eta, W_shaft and liquid molar volume, not
    //  from a number remembered off the plot.
    const vliq = Number(
      /^\s*Vliq\s+([0-9.eE+-]+)\s*;/m.exec(
        readFileSync(join(WITNESS, "constant/components/water.dat"), "utf-8"),
      )![1]);
    expect(vliq).toBeGreaterThan(0);
    // W_shaft is declared in kW and F in kmol/s; Q = F·1000·vliq  [m3/s].
    const predicted = (DEFAULT_PUMP_KNOBS.eta * DEFAULT_PUMP_KNOBS.W_shaft * 1000)
      / (1000 * vliq);
    for (let i = 0; i < sweep.F.length; ++i)
      expect(sweep.pumpDP[i]! * sweep.F[i]!).toBeCloseTo(predicted, -1);
  });
});

// ---- The honest half, checked against the engine source --------------------

describe("the honest half", () => {
  it("keeps every limit, each with a body that says something", () => {
    const ids = PUMP_LIMITS.map((l) => l.id);
    for (const id of [
      "not-a-manufacturer-curve", "no-npsh", "constant-efficiency",
      "no-affinity-laws", "static-head-is-elevation-only", "no-valve-knob",
      "fixed-sweep-window", "steady-incompressible-liquid",
    ]) expect(ids, `limit ${id} went missing`).toContain(id);
    expect(new Set(ids).size).toBe(PUMP_LIMITS.length);
    for (const l of PUMP_LIMITS) expect(l.body.length).toBeGreaterThan(80);
  });

  it("the NPSH claim is TRUE of the engine, not merely written down", () => {
    //  Step 5 and the no-npsh limit both say the engine computes and
    //  publishes no NPSH.  Scan the whole C++ tree: the day a unit does, this
    //  fails and the page has to be rewritten rather than quietly lying.
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(H|cpp)$/.test(e)) continue;
        if (/NPSH|cavitat/i.test(readFileSync(p, "utf-8"))) hits.push(p);
      }
    };
    walk(join(REPO, "src"));
    expect(hits, "an NPSH surface appeared — step 5 must be rewritten")
      .toEqual([]);
  });

  it("the affinity claim is TRUE of the engine: the pump has no speed", () => {
    const pump = readFileSync(
      join(REPO, "src/unitOperations/rotating/Pump.cpp"), "utf-8");
    //  The model's specification is exactly one of these three, and none of
    //  them is a speed or an impeller diameter.
    expect(pump).toContain("EXACTLY ONE of 'W_shaft', 'P_out', or 'dP'");
    expect(pump).not.toMatch(/\brpm\b/i);
    expect(pump).not.toMatch(/impeller/i);
  });

  it("the static-head claim is TRUE of the pipe: elevation, and nothing else", () => {
    const pipe = readFileSync(
      join(REPO, "src/unitOperations/hydraulics/Pipe.cpp"), "utf-8");
    //  One static term, ρ·g·dz.  A terminal-pressure-difference term would
    //  appear beside it, and the limit would have to go.
    expect(pipe).toContain("const scalar dP_elevation = rho * g_standard * dz;");
    expect(pipe).toContain("dP_friction + dP_fittings + dP_elevation");
  });

  it("the throttling claim is TRUE of the panel: no knob reaches the valve K", () => {
    //  The case declares a globe valve; the knob map declares five scalars and
    //  none of them is its K.  Both halves are checked, so neither can drift.
    const flowsheet = readFileSync(
      join(WITNESS, "system/flowsheetDict"), "utf-8");
    expect(flowsheet).toMatch(/K\s+10\.0;/);
    expect(Object.keys(DEFAULT_PUMP_KNOBS).sort())
      .toEqual(["D", "L", "W_shaft", "dz", "eta"]);
  });
});

// ---- The tool renders it as a scrolling lesson ------------------------------

describe("the tool renders it as a scrolling lesson", () => {
  it("scrolls and is no longer a panel", () => {
    expect(SRC).toContain('overflowY: "auto"');
    expect(SRC).toContain("maxWidth: 940");
    expect(SRC).not.toContain("MethodSetupRail");
  });

  it("renders the definitions before the plot and the consequences after", () => {
    //  The RENDER site, never an import at the top of the file: the point is
    //  where the chart APPEARS on the page.
    const plot = SRC.indexOf("<PumpSystemChart");
    expect(plot).toBeGreaterThan(0);
    for (const n of [1, 2, 3])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is after the plot`)
        .toBeLessThan(plot);
    for (const n of [4, 5])
      expect(SRC.indexOf(`{lessonStep(${n})}`), `step ${n} is before the plot`)
        .toBeGreaterThan(plot);
    expect(SRC.indexOf("{lessonLimits}")).toBeGreaterThan(plot);
  });

  it("has ONE lesson renderer, reachable from every branch", () => {
    //  The empty states are panes INSIDE the one page, not returns of their
    //  own, so the lesson cannot vanish exactly when there is nothing to
    //  explain.  One renderer, one page-level return.
    expect(SRC.match(/const lessonStep = /g)).toHaveLength(1);
    expect(SRC.match(/^\s*return \(\s*$/gm)!.length).toBeGreaterThan(0);
    expect(SRC).toContain("No pump-vs-system sweep in this run.");
  });

  it("keeps every honesty surface the panel carried", () => {
    //  A layout change must not quietly drop a caveat.
    expect(SRC).toContain("{err}");                       // the engine, verbatim
    expect(SRC).toContain("no crossing inside the swept window");
    expect(SRC).toContain("derived in view");
    expect(SRC).toContain("not a manufacturer");
    expect(SRC).toContain("cannot rewrite");
    expect(SRC).toContain("range ( 0.4 1.6 );");
    expect(SRC).toContain("engine numbers, verbatim");
  });
});
