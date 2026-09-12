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
  bodeMath — the constructed plane, pinned, and the measured plane's
  EXPERIMENT DESIGN pinned against the witness case itself.

  WHAT IS WORTH PINNING HERE, and it is not "the formulas are the formulas".
  Three things can go wrong and none of them is visible on a screenshot:

  (a) The closed forms could be transcribed wrongly.  Checked against values
      that can be worked out on paper — 1/sqrt(2) at the corner, exactly 1 for
      a dead time at every frequency, an exact sqrt(3) gain crossover — rather
      than against the code's own output.

  (b) The margin reader could return a number that is not a crossing.  Every
      margin arm asserts the DEFINITION at the frequency returned: |L| = 1 at
      the gain crossover, arg L = -180 deg at the phase crossover.  A root
      finder that satisfies its own definition to 1e-9 is right whatever
      route it took, and a bug that returns the WRONG root (a dead time
      crosses -180 deg again and again) shows up as a first-crossing arm.

  (c) THE WITNESS COULD MOVE UNDER THE TOOL.  bodeMath hard-codes four
      numbers the case declares — the tank's holdup, its volume, the feed and
      the drive amplitude — because the amplitude RATIO is the fitted outlet
      amplitude divided by the declared drive, and the tau knob scales the
      declared holdup.  A copy of a declaration that can drift silently is
      this project's standing defect, so the arms below read the case files
      out of the bundled corpus and refuse if they no longer say so.  They
      also apply the real overrides through the real `applyScalarOverride`,
      which throws on a key that has moved or become ambiguous.

  NOT CHECKED, said plainly: whether a Bode diagram is the right thing to
  draw, and whether the constructed curves for the integrator, the dead time
  and the PID are true of anything Choupo simulates.  They are not checked
  against the engine because the engine does not compute them — that gap is
  the subject of BODE_LIMITS, not of a test.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  BODE_WITNESS, DISCARD_TAUS, FIT_CYCLES, SAMPLING_PHASE_BIAS_RAD,
  STEPS_PER_PERIOD, WITNESS_DRIVE_AMPLITUDE_KMOL_S, WITNESS_FEED_KMOL_S,
  WITNESS_HOLDUP_KMOL, WITNESS_TAU_S, WITNESS_VOLUME_M3,
  bodeOverrides, bodeSweepGrid, combine, controllerResponse, dB,
  deadTimeResponse, firstOrderLagResponse, gainResponse, integratorResponse,
  loopWindow, margins, openLoopResponse, parallelGains, processResponse,
  readMeasuredPoint, toDeg,
  type LoopSpec,
} from "../src/ui/methods/bodeMath.js";
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";

const OFF = { mode: "off" as const, Kc: 1, tauIS: 0, tauDS: 0 };

describe("the four elements", () => {
  it("a first-order lag is 1/sqrt(2) and -45 deg at its corner", () => {
    const tau = 240;
    const r = firstOrderLagResponse(tau, 1 / tau);       // w*tau = 1 exactly
    expect(r.mag).toBeCloseTo(Math.SQRT1_2, 12);
    expect(toDeg(r.phaseRad)).toBeCloseTo(-45, 10);
    expect(dB(r.mag)).toBeCloseTo(-3.0103, 4);
  });

  it("a lag depends on w and tau only through their product", () => {
    for (const [tau, w] of [[10, 0.3], [1000, 0.003], [7, 3 / 7]] as const) {
      const r = firstOrderLagResponse(tau, w);
      const ref = firstOrderLagResponse(1, w * tau);
      expect(r.mag).toBeCloseTo(ref.mag, 12);
      expect(r.phaseRad).toBeCloseTo(ref.phaseRad, 12);
    }
  });

  it("a lag can never amplify, and tends to -90 deg", () => {
    for (const wt of [0, 0.1, 1, 10, 1e4, 1e9]) {
      expect(firstOrderLagResponse(1, wt).mag).toBeLessThanOrEqual(1);
    }
    expect(toDeg(firstOrderLagResponse(1, 1e9).phaseRad)).toBeCloseTo(-90, 6);
  });

  it("a gain is flat and contributes no phase at all", () => {
    for (const w of [1e-4, 1, 1e4]) {
      const r = gainResponse(3.5);
      expect(r.mag).toBe(3.5);
      expect(r.phaseRad).toBe(0);
      //  the frequency is not even read — that IS the property
      expect(gainResponse(3.5).mag).toBe(r.mag * (w > 0 ? 1 : 1));
    }
  });

  it("an integrator is 1/w with a flat -90 deg", () => {
    for (const w of [1e-3, 1, 1e3]) {
      const r = integratorResponse(w);
      expect(r.mag).toBeCloseTo(1 / w, 12);
      expect(toDeg(r.phaseRad)).toBeCloseTo(-90, 12);
    }
  });

  it("a dead time has magnitude EXACTLY one and unbounded phase", () => {
    const theta = 12;
    for (const w of [1e-6, 1, 1e6]) {
      expect(deadTimeResponse(theta, w).mag).toBe(1);
      expect(deadTimeResponse(theta, w).phaseRad).toBeCloseTo(-w * theta, 9);
    }
    //  It passes -180 deg and keeps going — the property that makes it the
    //  element a loop cannot be tuned out of.
    expect(toDeg(deadTimeResponse(theta, Math.PI / theta).phaseRad))
      .toBeCloseTo(-180, 9);
    expect(toDeg(deadTimeResponse(theta, 3 * Math.PI / theta).phaseRad))
      .toBeCloseTo(-540, 9);
  });

  it("blocks in series multiply magnitudes and add phases", () => {
    const a = firstOrderLagResponse(10, 0.3);
    const b = deadTimeResponse(4, 0.3);
    const c = gainResponse(2);
    const t = combine(a, b, c);
    expect(t.mag).toBeCloseTo(a.mag * b.mag * c.mag, 12);
    expect(t.phaseRad).toBeCloseTo(a.phaseRad + b.phaseRad + c.phaseRad, 12);
  });
});

describe("the controller", () => {
  it("P is a pure gain; `off` is the identity", () => {
    expect(controllerResponse({ mode: "P", Kc: 4, tauIS: 9, tauDS: 9 }, 1))
      .toEqual({ mag: 4, phaseRad: 0 });
    expect(controllerResponse(OFF, 123)).toEqual({ mag: 1, phaseRad: 0 });
  });

  it("PI contributes -90 deg far below 1/tau_I and nothing far above", () => {
    const c = { mode: "PI" as const, Kc: 2, tauIS: 100, tauDS: 0 };
    expect(toDeg(controllerResponse(c, 1e-9).phaseRad)).toBeCloseTo(-90, 3);
    expect(toDeg(controllerResponse(c, 1e9).phaseRad)).toBeCloseTo(0, 3);
    //  at w = 1/tau_I the two are equal: magnitude Kc*sqrt(2), phase -45 deg
    const at = controllerResponse(c, 1 / c.tauIS);
    expect(at.mag).toBeCloseTo(2 * Math.SQRT2, 12);
    expect(toDeg(at.phaseRad)).toBeCloseTo(-45, 10);
  });

  it("a PID is a PURE GAIN where its two terms cancel, at w = 1/sqrt(tI·tD)",
    () => {
      const c = { mode: "PID" as const, Kc: 3, tauIS: 400, tauDS: 25 };
      const w = 1 / Math.sqrt(c.tauIS * c.tauDS);
      const r = controllerResponse(c, w);
      expect(r.phaseRad).toBeCloseTo(0, 12);
      expect(r.mag).toBeCloseTo(3, 12);
      //  and it leans the two ways either side of that frequency
      expect(controllerResponse(c, w / 10).phaseRad).toBeLessThan(0);
      expect(controllerResponse(c, w * 10).phaseRad).toBeGreaterThan(0);
      expect(toDeg(controllerResponse(c, 1e9).phaseRad)).toBeCloseTo(90, 3);
    });

  it("converts to the parallel gains by the engine's own arithmetic", () => {
    //  src/control/PIDController.cpp:75 — "Kp = Kc; Ki = Kc/tauI; Kd = Kc*tauD"
    const c = { mode: "PID" as const, Kc: 5, tauIS: 20, tauDS: 4 };
    expect(parallelGains(c)).toEqual({ Kp: 5, Ki: 5 / 20, Kd: 5 * 4 });
    //  A term the mode does not carry is ABSENT, not set to something.
    expect(parallelGains({ ...c, mode: "PI" })).toEqual(
      { Kp: 5, Ki: 5 / 20, Kd: 0 });
    expect(parallelGains({ ...c, mode: "P" })).toEqual(
      { Kp: 5, Ki: 0, Kd: 0 });
    expect(parallelGains({ ...c, mode: "off" })).toEqual(
      { Kp: 0, Ki: 0, Kd: 0 });
  });
});

describe("the open loop and its two margins", () => {
  /** K/(tau s + 1) with no controller: |L| = K/sqrt(1+(w tau)^2). */
  const plain = (K: number, tauS: number, thetaS = 0): LoopSpec => ({
    process: { K, tauS, thetaS, integrating: false },
    controller: OFF,
  });

  it("finds the EXACT gain crossover of a lag with gain 2", () => {
    //  2/sqrt(1+w^2) = 1  <=>  w = sqrt(3), and the phase there is
    //  -arctan(sqrt(3)) = -60 deg, so the phase margin is exactly 120 deg.
    const spec = plain(2, 1);
    const { wLo, wHi } = loopWindow(spec);
    const m = margins(spec, wLo, wHi);
    expect(m.gain.found).toBe(true);
    expect(m.gain.omegaRadS).toBeCloseTo(Math.sqrt(3), 9);
    expect(m.phaseMarginDeg).toBeCloseTo(120, 7);
  });

  it("reports NO margin where the curve never crosses, instead of a number",
    () => {
      //  A single lag can never reach -180 deg: there is no gain margin, and
      //  saying so is the point.  (The first-order lag is exactly why a
      //  simple loop cannot be destabilised by gain alone.)
      const spec = plain(2, 1);
      const { wLo, wHi } = loopWindow(spec);
      const m = margins(spec, wLo, wHi);
      expect(m.phase.found).toBe(false);
      expect(Number.isNaN(m.gainMargin)).toBe(true);
      expect(Number.isNaN(m.gainMarginDb)).toBe(true);
      expect(m.stable).toBe(false);          // not "unstable" — not READABLE
    });

  it("every crossover it reports satisfies the definition of one", () => {
    const specs: LoopSpec[] = [
      { process: { K: 2, tauS: 240, thetaS: 30, integrating: false },
        controller: { mode: "PI", Kc: 1.5, tauIS: 240, tauDS: 0 } },
      { process: { K: 1, tauS: 60, thetaS: 5, integrating: false },
        controller: { mode: "PID", Kc: 4, tauIS: 120, tauDS: 20 } },
      { process: { K: 0.5, tauS: 10, thetaS: 2, integrating: true },
        controller: { mode: "P", Kc: 3, tauIS: 0, tauDS: 0 } },
    ];
    for (const spec of specs) {
      const { wLo, wHi } = loopWindow(spec);
      const m = margins(spec, wLo, wHi);
      if (m.gain.found) {
        expect(openLoopResponse(spec, m.gain.omegaRadS).mag)
          .toBeCloseTo(1, 9);
        expect(m.phaseMarginDeg).toBeCloseTo(
          180 + toDeg(openLoopResponse(spec, m.gain.omegaRadS).phaseRad), 9);
      }
      if (m.phase.found) {
        expect(toDeg(openLoopResponse(spec, m.phase.omegaRadS).phaseRad))
          .toBeCloseTo(-180, 7);
        expect(m.gainMargin).toBeCloseTo(
          1 / openLoopResponse(spec, m.phase.omegaRadS).mag, 9);
      }
    }
  });

  it("takes the FIRST -180 deg crossing, not whichever one it lands on", () => {
    //  A dead time crosses -180 deg at w = pi/theta, again at 3 pi/theta, and
    //  so on.  With a negligible lag beside it the first crossing is
    //  pi/theta, and reading a later one would report a margin from the
    //  wrong frequency entirely.
    const theta = 10;
    const spec: LoopSpec = {
      process: { K: 1, tauS: 1e-9, thetaS: theta, integrating: false },
      controller: OFF,
    };
    const m = margins(spec, 1e-3 / theta, 1e3 / theta);
    expect(m.phase.found).toBe(true);
    expect(m.phase.omegaRadS).toBeCloseTo(Math.PI / theta, 6);
  });

  it("raising the gain spends the gain margin and nothing else", () => {
    const base: LoopSpec = {
      process: { K: 1, tauS: 100, thetaS: 20, integrating: false },
      controller: OFF,
    };
    const { wLo, wHi } = loopWindow(base);
    const a = margins(base, wLo, wHi);
    const hotter = { ...base, process: { ...base.process, K: 2 } };
    const b = margins(hotter, wLo, wHi);
    //  The phase curve did not move, so the PHASE crossover is identical …
    expect(b.phase.omegaRadS).toBeCloseTo(a.phase.omegaRadS, 9);
    //  … and the gain margin has halved, exactly.
    expect(b.gainMargin).toBeCloseTo(a.gainMargin / 2, 9);
  });

  it("a dead time moves the phase crossover and leaves |L| alone", () => {
    const base: LoopSpec = {
      process: { K: 3, tauS: 50, thetaS: 10, integrating: false },
      controller: OFF,
    };
    const slower = { ...base, process: { ...base.process, thetaS: 40 } };
    for (const w of [1e-3, 1e-2, 1e-1]) {
      expect(openLoopResponse(slower, w).mag)
        .toBeCloseTo(openLoopResponse(base, w).mag, 12);
    }
    const { wLo, wHi } = loopWindow(base);
    expect(margins(slower, wLo, wHi).phase.omegaRadS)
      .toBeLessThan(margins(base, wLo, wHi).phase.omegaRadS);
  });

  it("processResponse is the product of the blocks it declares", () => {
    const p = { K: 2, tauS: 30, thetaS: 7, integrating: true };
    const w = 0.05;
    const byHand = combine(gainResponse(p.K), firstOrderLagResponse(p.tauS, w),
      integratorResponse(w), deadTimeResponse(p.thetaS, w));
    const r = processResponse(p, w);
    expect(r.mag).toBeCloseTo(byHand.mag, 12);
    expect(r.phaseRad).toBeCloseTo(byHand.phaseRad, 12);
  });
});

describe("the drawn window", () => {
  it("contains both crossovers of the page's own default loop", () => {
    const spec: LoopSpec = {
      process: { K: 2, tauS: 240, thetaS: 30, integrating: false },
      controller: { mode: "PI", Kc: 1.5, tauIS: 240, tauDS: 0 },
    };
    const { wLo, wHi } = loopWindow(spec);
    const m = margins(spec, wLo, wHi);
    expect(m.gain.found && m.phase.found).toBe(true);
    for (const w of [m.gain.omegaRadS, m.phase.omegaRadS]) {
      expect(w).toBeGreaterThan(wLo);
      expect(w).toBeLessThan(wHi);
    }
  });

  it("never spans more than six decades", () => {
    const spec: LoopSpec = {
      process: { K: 1, tauS: 1200, thetaS: 0.5, integrating: false },
      controller: { mode: "PID", Kc: 1, tauIS: 2000, tauDS: 1 },
    };
    const { wLo, wHi } = loopWindow(spec);
    expect(Math.log10(wHi / wLo)).toBeLessThanOrEqual(6 + 1e-9);
  });
});

describe("the measured plane — the experiment asked of the engine", () => {
  it("spaces the grid logarithmically between the two w*tau ends", () => {
    const g = bodeSweepGrid(240, 7, 0.1, 10);
    expect(g).toHaveLength(7);
    expect(g[0]!.wtau).toBeCloseTo(0.1, 12);
    expect(g[6]!.wtau).toBeCloseTo(10, 12);
    for (let i = 1; i < g.length; ++i) {
      expect(g[i]!.wtau / g[i - 1]!.wtau)
        .toBeCloseTo(g[1]!.wtau / g[0]!.wtau, 9);
    }
    //  w = w*tau / tau, and f = w/2pi — the only two conversions here.
    for (const p of g) {
      expect(p.omegaRadS).toBeCloseTo(p.wtau / 240, 12);
      expect(p.frequencyHz).toBeCloseTo(p.omegaRadS / (2 * Math.PI), 15);
      expect(p.periodS).toBeCloseTo(1 / p.frequencyHz, 6);
    }
  });

  it("gives every point a clock that makes the sampling bias one number", () => {
    for (const tau of [60, 240, 900]) {
      for (const p of bodeSweepGrid(tau, 9, 0.05, 20)) {
        //  dt = period / N, so w*dt/2 = pi/N at EVERY frequency.  This is the
        //  claim the page prints; if it stops holding the page lies.
        expect(p.deltaTS).toBeCloseTo(p.periodS / STEPS_PER_PERIOD, 12);
        expect(-p.omegaRadS * p.deltaTS / 2)
          .toBeCloseTo(SAMPLING_PHASE_BIAS_RAD, 12);
      }
    }
  });

  it("discards enough whole cycles to cover eight time constants", () => {
    for (const tau of [60, 240, 900]) {
      for (const p of bodeSweepGrid(tau, 9, 0.05, 20)) {
        expect(p.discardCycles).toBeGreaterThanOrEqual(1);
        expect(p.discardCycles * p.periodS)
          .toBeGreaterThanOrEqual(Math.min(DISCARD_TAUS * tau, p.periodS) - 1e-9);
        //  and the run must reach past the end of the fit window
        expect(p.endTimeS).toBeGreaterThan(
          (p.discardCycles + p.fitCycles) * p.periodS);
        expect(p.fitCycles).toBe(FIT_CYCLES);
      }
    }
  });

  it("keeps every point affordable — no run is tens of thousands of steps",
    () => {
      //  Seven engine runs happen while the reader watches.  The witness
      //  case, authored for ONE frequency on a fixed 1 s grid, costs 13 873
      //  steps; the design here must not be worse than that per point.
      for (const p of bodeSweepGrid(240, 7, 0.1, 10)) {
        expect(p.steps).toBeLessThan(20000);
      }
    });
});

describe("the witness case still declares what bodeMath copies from it", () => {
  const entry = tutorialByName(BODE_WITNESS);
  const raw = entry?.files.rawFiles ?? {};

  it("is in the bundled corpus at all", () => {
    expect(entry, `${BODE_WITNESS} is not bundled — the tool cannot run`)
      .toBeTruthy();
  });

  it("declares the holdup, the volume and the feed bodeMath reads back", () => {
    const state = raw["0/internalState"] ?? "";
    expect(state).toMatch(
      new RegExp(`compA\\s+${WITNESS_HOLDUP_KMOL.compA}\\s*;`));
    expect(state).toMatch(
      new RegExp(`compB\\s+${WITNESS_HOLDUP_KMOL.compB}\\s*;`));
    expect(state).toMatch(new RegExp(`V\\s+${WITNESS_VOLUME_M3}\\s*;`));
    const faces = raw["0/streamFaces"] ?? "";
    expect(faces).toMatch(/compA\s+4\.6e-0?5\s*;/);
    expect(faces).toMatch(/compB\s+4\.0?e-0?6\s*;/);
    expect(WITNESS_FEED_KMOL_S.compA + WITNESS_FEED_KMOL_S.compB)
      .toBeCloseTo(5.0e-5, 15);
  });

  it("gives the 240 s residence time the tool's default tau is", () => {
    expect(WITNESS_TAU_S).toBeCloseTo(240, 9);
  });

  it("declares the drive amplitude the amplitude RATIO is divided by", () => {
    const fs = raw["system/flowsheetDict"] ?? "";
    //  Two sinusoids: the tracer at +amplitude and the carrier MIRRORING it
    //  at -amplitude, so the total flow — and therefore tau — cannot move.
    //  Compared as NUMBERS, not as text: the dict writes 2.0e-6 and the
    //  constant is 2e-6, and a test that pinned the spelling would fail on a
    //  reformat while missing a changed value.
    const declared = [...fs.matchAll(/^\s*amplitude\s+(-?[\d.eE+-]+)\s*;/gm)]
      .map((m) => Number(m[1]));
    expect(declared).toHaveLength(2);
    expect(declared[0]).toBeCloseTo(WITNESS_DRIVE_AMPLITUDE_KMOL_S, 15);
    expect(declared[1]).toBeCloseTo(-WITNESS_DRIVE_AMPLITUDE_KMOL_S, 15);
  });

  it("declares a frequencyResponse block that READS the drive's frequency",
    () => {
      //  If the block carried its own `frequency`, the sweep would have to
      //  write the same number in two homes and they could disagree.
      const cd = raw["system/controlDict"] ?? "";
      expect(cd).toMatch(/frequencyResponse/);
      expect(cd).toMatch(/reference\s+TracerSine\s*;/);
      expect(cd).not.toMatch(/^\s*frequency\s+[-\d.]/m);
    });
});

describe("the overrides reach the witness", () => {
  it("applies every one of them through the real substituter", () => {
    const raw = tutorialByName(BODE_WITNESS)?.files.rawFiles ?? {};
    const p = bodeSweepGrid(480, 7, 0.1, 10)[3]!;
    for (const o of bodeOverrides(p, 480)) {
      const body = raw[o.file];
      expect(body, `witness has no ${o.file}`).toBeTruthy();
      //  Throws on a key that has moved, or that matches ambiguously.
      const out = applyScalarOverride(body!, o);
      expect(out).not.toBe(body);
      expect(out).toContain(String(o.value));
    }
  });

  it("doubles the holdup for double the time constant", () => {
    const p = bodeSweepGrid(2 * WITNESS_TAU_S, 3, 0.1, 10)[0]!;
    const ov = bodeOverrides(p, 2 * WITNESS_TAU_S);
    const holdA = ov.find((o) => o.file === "0/internalState" && o.key === "compA");
    const holdB = ov.find((o) => o.file === "0/internalState" && o.key === "compB");
    const vol = ov.find((o) => o.file === "0/internalState" && o.key === "V");
    expect(holdA!.value).toBeCloseTo(2 * WITNESS_HOLDUP_KMOL.compA, 12);
    expect(holdB!.value).toBeCloseTo(2 * WITNESS_HOLDUP_KMOL.compB, 12);
    //  The vessel scales with what is in it, or the declared state is one no
    //  tank could hold.
    expect(vol!.value).toBeCloseTo(2 * WITNESS_VOLUME_M3, 12);
  });

  it("writes the ONE frequency into BOTH sinusoids", () => {
    const p = bodeSweepGrid(240, 5, 0.1, 10)[2]!;
    const freqs = bodeOverrides(p, 240)
      .filter((o) => o.key === "frequency");
    expect(freqs).toHaveLength(2);
    expect(freqs[0]!.occurrence).toBe(1);
    expect(freqs[1]!.occurrence).toBe(2);
    for (const f of freqs) expect(f.value).toBe(p.frequencyHz);
    //  A carrier left at the old frequency would break the substitution and
    //  the tank's residence time would oscillate with the experiment.
  });

  it("clones the whole case with the defaults applied", () => {
    const p = bodeSweepGrid(WITNESS_TAU_S, 7, 0.1, 10)[0]!;
    const files = methodCase(BODE_WITNESS, bodeOverrides(p, WITNESS_TAU_S));
    expect(files.flowsheet, "the clone carries no flowsheet").toBeTruthy();
    expect(files.controlDict).toBeTruthy();
    //  The two authored state files must survive the clone, or the tau knob
    //  edits a file the engine never receives.
    expect(Object.keys(files.rawFiles ?? {})).toContain("0/internalState");
  });
});

describe("reading the engine's answer back", () => {
  const p = bodeSweepGrid(240, 7, 0.1, 10)[3]!;

  it("divides the fitted amplitude by the declared drive", () => {
    const m = readMeasuredPoint({
      frequencyResponse: {
        out_amplitude_kmol_s: 1.41421356e-6,
        out_phase_rad: -0.7853982,
        fit_residual_rel: 3.2e-8,
      },
    }, p);
    expect(m!.amplitudeRatio)
      .toBeCloseTo(1.41421356e-6 / WITNESS_DRIVE_AMPLITUDE_KMOL_S, 9);
    expect(m!.phaseRad).toBeCloseTo(-0.7853982, 12);
    expect(m!.residual).toBeCloseTo(3.2e-8, 15);
    expect(m!.omegaRadS).toBe(p.omegaRadS);
  });

  it("returns a HOLE, never a zero, when the row is absent or unusable", () => {
    expect(readMeasuredPoint(undefined, p)).toBeNull();
    expect(readMeasuredPoint({}, p)).toBeNull();
    expect(readMeasuredPoint({ frequencyResponse: {} }, p)).toBeNull();
    expect(readMeasuredPoint(
      { frequencyResponse: { out_amplitude_kmol_s: NaN, out_phase_rad: 0 } },
      p)).toBeNull();
  });
});

describe("the measured points agree with the construction, by arithmetic", () => {
  //  NOT AN ENGINE RUN — vitest does not load the WASM.  What this pins is
  //  that the page's comparison is the RIGHT comparison: an engine answer at
  //  w*tau = 1, with the exact sampling bias the design produces, lands on
  //  the constructed curve to within that bias and no more.  The engine's own
  //  numbers for this case are anchored in its `expected` file, whose
  //  comparison is the same one.
  it("lands within the sampling bias and nothing worse", () => {
    const tau = 240;
    const p = bodeSweepGrid(tau, 3, 1, 1)[0]!;     // w*tau = 1 exactly
    const ref = firstOrderLagResponse(tau, p.omegaRadS);
    const asMeasured = {
      frequencyResponse: {
        out_amplitude_kmol_s: ref.mag * WITNESS_DRIVE_AMPLITUDE_KMOL_S,
        out_phase_rad: ref.phaseRad + SAMPLING_PHASE_BIAS_RAD,
        fit_residual_rel: 1e-14,
      },
    };
    const m = readMeasuredPoint(asMeasured, p)!;
    expect(m.amplitudeRatio).toBeCloseTo(ref.mag, 12);
    expect(Math.abs(m.phaseRad - ref.phaseRad))
      .toBeCloseTo(Math.abs(SAMPLING_PHASE_BIAS_RAD), 12);
    expect(Math.abs(toDeg(m.phaseRad - ref.phaseRad))).toBeLessThan(0.2);
  });
});
