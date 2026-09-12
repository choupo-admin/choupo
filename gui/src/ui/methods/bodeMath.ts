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
  bodeMath — TWO PLANES, AND THE WHOLE POINT OF THIS FILE IS THAT THEY ARE
  NOT THE SAME KIND OF ANSWER.

  PLANE A, THE MEASURED ONE, IS THE ENGINE'S.  Choupo has no transfer
  function anywhere in it; what it has is a tank and a time integrator.  A
  case declares a SINUSOIDAL drive on an inlet
  (src/control/signal/Signals.H:124 — `mean + amplitude*sin(2*pi*(t-tStart)/
  period + phase)`), the dynamic binary integrates the plant, and
  `frequencyResponse {}` least-squares fits `a + b sin(wt) + c cos(wt)` to the
  outlet after the start-up transient is discarded
  (src/applications/choupoCtrl/main.cpp:1540-1572): amplitude
  `hypot(b, c)` at src/applications/choupoCtrl/main.cpp:1553, phase
  `atan2(c, b)` at src/applications/choupoCtrl/main.cpp:1555, and the share of
  the output variance the single sinusoid does NOT explain at
  src/applications/choupoCtrl/main.cpp:1572.  One run is
  ONE POINT of a Bode diagram, measured.  Everything this module contributes
  to that plane is the EXPERIMENT DESIGN — which frequencies to ask for, and
  what time step and run length each one needs — plus arithmetic on the
  engine's own published numbers.  It evaluates no physics for plane A.

  PLANE B, THE CONSTRUCTED ONE, IS CLASSICAL CONTROL ARITHMETIC AND THE
  ENGINE DOES NOT COMPUTE IT.  |G(iw)| and arg G(iw) for a lag, an
  integrator, a dead time and a PID controller; the two crossover
  frequencies; the gain and phase margins.  Nothing in src/ evaluates any of
  it — searched 2026-09-12 for bode / nyquist / transfer function / gain
  margin / phase margin / amplitude ratio across src/**, and EVERY hit is a
  COMMENT about the measurement above: src/control/signal/Signal.H:42 ("one
  point of a Bode plot") and :94, src/applications/choupoCtrl/main.cpp:625,
  and src/outerDriver/SweepDriver.H:85 (the linked-target mirror the Bode
  sweep case needs).  Not one of them computes anything.

  WHY PLANE B IS ALLOWED TO LIVE IN TYPESCRIPT AT ALL, since the standing
  rule is zero physics in TS (gui-credo §9).  The authorisation is the one
  EpsilonNtuTool already carries and states in its own header: a tool may own
  METHOD GEOMETRY — the textbook closed forms of the construction — when the
  ENGINE'S OWN ANSWER IS THE JUDGE.  Here the judge exists for exactly one
  element, the first-order lag, and it judges on screen: the measured points
  of plane A are laid on the constructed curve of plane B at K = 1, no dead
  time, controller off, and they agree or the page is wrong.  For the
  integrator, the dead time and the PID there is NO engine judge in this
  tree, and the page says so in those words rather than letting a reader
  assume the same standing for all four.  A gap that is named is strictly
  better than a claim nobody can check.

  WHAT IS DELIBERATELY NOT HERE: any fit, any identification, any tuning
  rule.  The engine already identifies an FOPDT model from a step response
  and publishes K, tau and theta with the residual beside them
  (src/propertyOps/ReactionCurve.H:42-48, headline at :221), and it already
  turns them into controller settings by three cited published rules
  (src/propertyOps/ReactionCurve.H:137).  A second implementation of either
  in the browser would be the
  arity sin with a plot on top.  The knobs on this page are the READER's
  three numbers to type in; where they should come from is that op.
\*---------------------------------------------------------------------------*/

import type { ScalarOverride } from "../../case/methodRun.js";

// ---- Complex response, in the only form a Bode diagram needs ---------------

/** One frequency's answer: how much bigger the output swing is, and how far
 *  behind it runs.  `phaseRad` is NEGATIVE for a lag, which is the sign
 *  convention the engine's own fit publishes (`out_phase_rad` at
 *  src/applications/choupoCtrl/main.cpp:1567 is the lag of the outlet behind the drive). */
export interface Response {
  mag: number;
  phaseRad: number;
}

/** Series connection: magnitudes multiply, phases add.  That IS the reason a
 *  Bode diagram uses a logarithmic magnitude axis — multiplication becomes
 *  addition and a loop is drawn by stacking its blocks. */
export function combine(...parts: readonly Response[]): Response {
  let mag = 1, phaseRad = 0;
  for (const p of parts) { mag *= p.mag; phaseRad += p.phaseRad; }
  return { mag, phaseRad };
}

export const UNITY: Response = { mag: 1, phaseRad: 0 };

/** 20 log10 — the decibel, defined here once so no caller writes it twice. */
export const dB = (mag: number): number => 20 * Math.log10(mag);
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

// ---- The four elements (plane B: method geometry, no engine judge except
//      for the first-order lag) ---------------------------------------------

/** A pure gain: every frequency multiplied by the same number, nothing
 *  delayed.  A flat magnitude line and zero phase — the only element that
 *  moves the magnitude curve without touching the phase curve, which is what
 *  makes it the knob a margin is bought with. */
export function gainResponse(K: number): Response {
  return { mag: Math.abs(K), phaseRad: K < 0 ? -Math.PI : 0 };
}

/** First-order lag, 1/(tau s + 1).
 *
 *  THIS IS THE ONE ELEMENT THE ENGINE JUDGES.  It is the tracer dynamics of
 *  a constant-volume stirred tank: the engine integrates
 *  `dn_i/dt = F_in z_in_i - F_out (n_i/Sum n)` with `F_out = F_in`
 *  (src/unitOperations/dynamic/DynamicCSTR.cpp:556-559), whose single time
 *  constant is the residence time `nTot / F_in` the same unit computes at
 *  :377.  Put a sinusoid in and the closed forms below come out; the
 *  measured plane checks them. */
export function firstOrderLagResponse(tauS: number, omegaRadS: number): Response {
  const wt = omegaRadS * tauS;
  return { mag: 1 / Math.sqrt(1 + wt * wt), phaseRad: -Math.atan(wt) };
}

/** Integrator, 1/s: a level with no self-regulation, and the -1 slope with a
 *  flat -90 deg that a student must recognise instantly. */
export function integratorResponse(omegaRadS: number): Response {
  return { mag: 1 / omegaRadS, phaseRad: -Math.PI / 2 };
}

/** Dead time, exp(-theta s): magnitude EXACTLY one at every frequency, phase
 *  falling without bound.  The element that costs nothing to see and
 *  everything to control.
 *
 *  NOT IN THE ENGINE: no unit operation anywhere in src/ models a transport
 *  delay.  The one delay this tree contains is a numerical artefact of the
 *  dynamic driver — one driver step between a routed outlet and the inlet
 *  that reads it, announced as such
 *  (src/unitOperations/dynamic/DynamicUnitOperation.H:143-146) — and it is
 *  not a declarable dead time. */
export function deadTimeResponse(thetaS: number, omegaRadS: number): Response {
  return { mag: 1, phaseRad: -omegaRadS * thetaS };
}

export type ControllerMode = "off" | "P" | "PI" | "PID";

/** The controller in the TEXTBOOK form — Kc(1 + 1/(tau_I s) + tau_D s).
 *
 *  Choupo's PID is written in the PARALLEL form, u = u_bias + Kp e + Ki I -
 *  Kd dPV/dt (src/control/PIDController.cpp:123-127), and the engine states
 *  the conversion between the two in its own refusal message when a case
 *  declares the textbook spelling: "Kp = Kc; Ki = Kc/tauI; Kd = Kc*tauD"
 *  (src/control/PIDController.cpp:75).  The knobs here are the textbook
 *  three because that is what a tuning rule publishes; `parallelGains` below
 *  converts them with the engine's own arithmetic so a reader can carry the
 *  answer straight into a dict.
 *
 *  WHAT THE ENGINE'S PID IS NOT: this frequency response is of the IDEAL
 *  derivative term, and the running controller differentiates the MEASURED
 *  PV over one time step (src/control/PIDController.cpp:115-120, derivative
 *  on PV), which is a different
 *  object at high frequency and has no set-point response at all.  The page
 *  says so; this function does not pretend otherwise. */
export interface ControllerSpec {
  mode: ControllerMode;
  Kc: number;
  tauIS: number;
  tauDS: number;
}

export function controllerResponse(c: ControllerSpec, omegaRadS: number): Response {
  if (c.mode === "off") return UNITY;
  if (c.mode === "P") return gainResponse(c.Kc);
  //  Kc (1 + j (w tau_D - 1/(w tau_I))) — the integral term is the negative
  //  imaginary part, the derivative the positive one, and the bracket is
  //  REAL (phase zero) exactly where they cancel.
  const im = (c.mode === "PID" ? omegaRadS * c.tauDS : 0)
    - (c.tauIS > 0 ? 1 / (omegaRadS * c.tauIS) : 0);
  return {
    mag: Math.abs(c.Kc) * Math.sqrt(1 + im * im),
    phaseRad: Math.atan(im) + (c.Kc < 0 ? -Math.PI : 0),
  };
}

/** The textbook three as the three the dict declares, by the engine's own
 *  conversion (src/control/PIDController.cpp:75).  Ki and Kd are zero where the mode does
 *  not carry that term — an absent term, not a term set to nothing. */
export function parallelGains(c: ControllerSpec): { Kp: number; Ki: number; Kd: number } {
  const hasI = c.mode === "PI" || c.mode === "PID";
  const hasD = c.mode === "PID";
  return {
    Kp: c.mode === "off" ? 0 : c.Kc,
    Ki: hasI && c.tauIS > 0 ? c.Kc / c.tauIS : 0,
    Kd: hasD ? c.Kc * c.tauDS : 0,
  };
}

// ---- The process, and the open loop ----------------------------------------

export interface ProcessSpec {
  /** Steady-state gain: how far the output finally moves per unit of input. */
  K: number;
  /** The lag's time constant [s]. */
  tauS: number;
  /** Dead time [s]; 0 means none. */
  thetaS: number;
  /** Add a 1/s integrator in series (a level, a batch temperature ramp). */
  integrating: boolean;
}

export function processResponse(p: ProcessSpec, omegaRadS: number): Response {
  const parts: Response[] = [
    gainResponse(p.K),
    firstOrderLagResponse(p.tauS, omegaRadS),
  ];
  if (p.integrating) parts.push(integratorResponse(omegaRadS));
  if (p.thetaS > 0) parts.push(deadTimeResponse(p.thetaS, omegaRadS));
  return combine(...parts);
}

export interface LoopSpec {
  process: ProcessSpec;
  controller: ControllerSpec;
}

/** The OPEN loop: what a signal meets going once round the ring with the
 *  feedback connection cut.  Every stability statement on the page is about
 *  THIS object, which is why the page names it before it draws it. */
export function openLoopResponse(spec: LoopSpec, omegaRadS: number): Response {
  return combine(
    controllerResponse(spec.controller, omegaRadS),
    processResponse(spec.process, omegaRadS),
  );
}

// ---- The two crossovers, and the two margins -------------------------------

/** A crossing that may not exist, and says so rather than returning a number.
 *  A loop whose magnitude never reaches 1, or whose phase never reaches
 *  -180 deg inside the window drawn, has NO such frequency — reporting one
 *  anyway is the shape of error this project keeps paying for. */
export interface Crossover {
  found: boolean;
  omegaRadS: number;
}

const NOT_FOUND: Crossover = { found: false, omegaRadS: NaN };

/** First sign change of `f` on a logarithmic grid, then bisected.
 *
 *  A SCAN AND NOT A ROOT SOLVE FROM ONE GUESS, deliberately: with a dead time
 *  the phase falls without bound and crosses -180 deg again and again, and
 *  the margin is read at the FIRST crossing.  A Newton from a guess would
 *  return whichever one it fell into. */
function firstCrossing(
  f: (w: number) => number, wLo: number, wHi: number, samples = 2000,
): Crossover {
  let wPrev = wLo, fPrev = f(wLo);
  if (fPrev === 0) return { found: true, omegaRadS: wLo };
  const ratio = Math.pow(wHi / wLo, 1 / samples);
  for (let i = 1; i <= samples; ++i) {
    const w = wLo * Math.pow(ratio, i);
    const fw = f(w);
    if (fw === 0) return { found: true, omegaRadS: w };
    if ((fw > 0) !== (fPrev > 0)) {
      let a = wPrev, b = w, fa = fPrev;
      for (let k = 0; k < 80; ++k) {
        const m = Math.sqrt(a * b);            // bisection in log w
        const fm = f(m);
        if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else { b = m; }
      }
      return { found: true, omegaRadS: Math.sqrt(a * b) };
    }
    wPrev = w; fPrev = fw;
  }
  return NOT_FOUND;
}

/** GAIN crossover: where the open loop's magnitude passes through 1 (0 dB).
 *  The phase margin is read here. */
export function gainCrossover(spec: LoopSpec, wLo: number, wHi: number): Crossover {
  return firstCrossing((w) => Math.log(openLoopResponse(spec, w).mag), wLo, wHi);
}

/** PHASE crossover: where the open loop's phase passes through -180 deg.
 *  The gain margin is read here. */
export function phaseCrossover(spec: LoopSpec, wLo: number, wHi: number): Crossover {
  return firstCrossing(
    (w) => openLoopResponse(spec, w).phaseRad + Math.PI, wLo, wHi);
}

export interface Margins {
  gain: Crossover;
  phase: Crossover;
  /** 180 deg + the open-loop phase at the gain crossover [deg]. */
  phaseMarginDeg: number;
  /** 1 / |L| at the phase crossover [-] and its decibels. */
  gainMargin: number;
  gainMarginDb: number;
  /** Both margins positive, with both crossovers inside the window.  Read the
   *  header of `stabilityVerdict` before using this for anything. */
  stable: boolean;
}

export function margins(spec: LoopSpec, wLo: number, wHi: number): Margins {
  const g = gainCrossover(spec, wLo, wHi);
  const p = phaseCrossover(spec, wLo, wHi);
  const phaseMarginDeg = g.found
    ? 180 + toDeg(openLoopResponse(spec, g.omegaRadS).phaseRad) : NaN;
  const gm = p.found ? 1 / openLoopResponse(spec, p.omegaRadS).mag : NaN;
  return {
    gain: g,
    phase: p,
    phaseMarginDeg,
    gainMargin: gm,
    gainMarginDb: p.found ? dB(gm) : NaN,
    stable: g.found && p.found && phaseMarginDeg > 0 && gm > 1,
  };
}

/** The frequency window to DRAW a loop over.
 *
 *  Derived from the loop's own characteristic times rather than fixed,
 *  because a reader who doubles a time constant must not have to hunt for the
 *  curve afterwards — and because both crossovers have to be INSIDE the
 *  window or the margins are reported as absent (which is correct, and also
 *  useless as a default).  Two decades below the slowest corner, two above
 *  the fastest, capped at six decades so the drawing stays readable. */
export function loopWindow(spec: LoopSpec): { wLo: number; wHi: number } {
  const times: number[] = [spec.process.tauS];
  if (spec.process.thetaS > 0) times.push(spec.process.thetaS);
  if (spec.controller.mode !== "off" && spec.controller.mode !== "P") {
    if (spec.controller.tauIS > 0) times.push(spec.controller.tauIS);
    if (spec.controller.mode === "PID" && spec.controller.tauDS > 0)
      times.push(spec.controller.tauDS);
  }
  const positive = times.filter((t) => t > 0);
  const tMax = Math.max(...positive, 1e-9);
  const tMin = Math.min(...positive, tMax);
  let wLo = 0.01 / tMax;
  let wHi = 100 / tMin;
  const decades = Math.log10(wHi / wLo);
  if (decades > 6) {
    //  Trim from the quiet end: the low-frequency side of a loop with
    //  integral action is a straight line and carries no reading.
    wLo = wHi / 1e6;
  }
  return { wLo, wHi };
}

// ---- The measured plane: the experiment the engine is asked to run ---------

/** The witness case this tool sweeps, and the four numbers it declares that
 *  this module reads back.  They are NOT constants of physics — they are that
 *  case's declarations, and `tests/bodeMath.test.ts` asserts the case files
 *  still say so, because a copy of a declaration that can drift silently is
 *  exactly the defect this project spends its gates on. */
export const BODE_WITNESS = "ctrl/ctrl19_freq_response_cstr";

/** tutorials/ctrl/ctrl19_freq_response_cstr/0/internalState — the tank's
 *  authored holdup [kmol].  Total 0.012 kmol. */
export const WITNESS_HOLDUP_KMOL = { compA: 0.01104, compB: 0.00096 } as const;

/** .../0/streamFaces — the authored feed [kmol/s].  Total 5.0e-5 kmol/s, so
 *  the residence time is 0.012 / 5.0e-5 = 240 s. */
export const WITNESS_FEED_KMOL_S = { compA: 4.6e-5, compB: 4.0e-6 } as const;

/** .../0/internalState — the tank's authored volume [m3]. */
export const WITNESS_VOLUME_M3 = 0.001;

/** .../system/flowsheetDict — the tracer drive's amplitude [kmol/s].  The
 *  amplitude RATIO the diagram plots is the engine's fitted outlet amplitude
 *  divided by this. */
export const WITNESS_DRIVE_AMPLITUDE_KMOL_S = 2.0e-6;

/** The residence time the witness is authored at [s]: total holdup over total
 *  feed, which is the constant the tank's own ODE carries
 *  (src/unitOperations/dynamic/DynamicCSTR.cpp:377). */
export const WITNESS_TAU_S =
  (WITNESS_HOLDUP_KMOL.compA + WITNESS_HOLDUP_KMOL.compB)
  / (WITNESS_FEED_KMOL_S.compA + WITNESS_FEED_KMOL_S.compB);

/** Accepted states per drive period.  It fixes the time step, and through it
 *  the ONE systematic error of the measurement: reading the state on a grid
 *  of step dt lags the continuous answer by half a step, so the fitted phase
 *  carries a bias of exactly -w dt/2 = -pi/STEPS_PER_PERIOD radians — the
 *  SAME at every frequency, because dt is set from the period.  The witness
 *  case's own header names this bias for its single frequency; here it
 *  becomes a constant of the experiment, printed on the page rather than
 *  corrected away. */
export const STEPS_PER_PERIOD = 1000;

/** The phase the MEASUREMENT ITSELF contributes [rad], negative. */
export const SAMPLING_PHASE_BIAS_RAD = -Math.PI / STEPS_PER_PERIOD;

/** Cycles fitted after the transient is discarded.  Two is enough for a
 *  three-parameter sin/cos fit and keeps the run short; the engine publishes
 *  the unexplained variance, so a window that is too short is visible rather
 *  than assumed away. */
export const FIT_CYCLES = 2;

/** How many time constants of start-up to throw away before fitting.  The
 *  free response decays as exp(-t/tau), so eight of them leave 3.4e-4 of it —
 *  below the residual the fit reports at every point of the default grid. */
export const DISCARD_TAUS = 8;

/** One point of the sweep: a frequency, and the run that measures it. */
export interface SweepPoint {
  /** The dimensionless frequency w*tau this point sits at. */
  wtau: number;
  omegaRadS: number;
  frequencyHz: number;
  periodS: number;
  /** Cycles discarded before the fit window opens. */
  discardCycles: number;
  fitCycles: number;
  deltaTS: number;
  endTimeS: number;
  /** Accepted time steps this point costs — the honest price of the point. */
  steps: number;
}

/** The experiment design: N points logarithmically spaced in w*tau, each with
 *  the time step and the run length IT needs.
 *
 *  WHY EACH POINT GETS ITS OWN CLOCK.  A single dt and a single endTime for
 *  the whole sweep must serve the slowest point, and then the fastest point
 *  is integrated for tens of thousands of steps it does not need — the
 *  witness case, authored for ONE frequency, runs 13 873 steps.  Scaling both
 *  with the period makes every point cost about the same and makes the
 *  sampling bias the same at every point, which is what lets the page state
 *  it as one number.  Nothing here is a physical choice: it is how finely and
 *  for how long the engine is asked to integrate. */
export function bodeSweepGrid(
  tauS: number, nPoints: number, wtauLo: number, wtauHi: number,
): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (let i = 0; i < nPoints; ++i) {
    const wtau = nPoints === 1 ? wtauLo
      : wtauLo * Math.pow(wtauHi / wtauLo, i / (nPoints - 1));
    const omegaRadS = wtau / tauS;
    const frequencyHz = omegaRadS / (2 * Math.PI);
    const periodS = 1 / frequencyHz;
    const discardCycles = Math.max(1, Math.ceil((DISCARD_TAUS * tauS) / periodS));
    const deltaTS = periodS / STEPS_PER_PERIOD;
    const endTimeS = (discardCycles + FIT_CYCLES + 0.2) * periodS;
    out.push({
      wtau, omegaRadS, frequencyHz, periodS,
      discardCycles, fitCycles: FIT_CYCLES, deltaTS, endTimeS,
      steps: Math.round(endTimeS / deltaTS),
    });
  }
  return out;
}

/** The dict edits that pose ONE point to the engine.
 *
 *  Every one of them replaces the NUMBER of a scalar the witness already
 *  declares — no block is added, nothing is re-nested, and a key that has
 *  moved makes `applyScalarOverride` throw rather than silently miss (see
 *  case/methodRun.ts).  A student can make the same five edits by hand in the
 *  case directory and get the same answer, which is the test this page's
 *  interactivity has to pass (gui-credo §4, wish-filter (b)).
 *
 *  `tauS` moves the plant's time constant by scaling the tank's authored
 *  holdup: tau = nTot/F_in, so twice the inventory at the same feed is twice
 *  the residence time, with the composition and every flow left alone. */
export function bodeOverrides(point: SweepPoint, tauS: number): ScalarOverride[] {
  const holdupScale = tauS / WITNESS_TAU_S;
  return [
    // The drive, and the carrier that mirrors it: ONE frequency, declared
    // twice because the case pins the total flow by substituting one
    // component for the other.  Both must move together or the tank's
    // residence time moves with the frequency.
    { file: "system/flowsheetDict", key: "frequency", value: point.frequencyHz,
      occurrence: 1 },
    { file: "system/flowsheetDict", key: "frequency", value: point.frequencyHz,
      occurrence: 2 },
    { file: "system/controlDict", key: "endTime", value: point.endTimeS },
    { file: "system/controlDict", key: "deltaT", value: point.deltaTS },
    { file: "system/controlDict", key: "discardCycles",
      value: point.discardCycles },
    { file: "system/controlDict", key: "fitCycles", value: point.fitCycles },
    { file: "0/internalState", key: "compA",
      value: WITNESS_HOLDUP_KMOL.compA * holdupScale },
    { file: "0/internalState", key: "compB",
      value: WITNESS_HOLDUP_KMOL.compB * holdupScale },
    //  The vessel scales WITH its inventory, so the declared state stays
    //  self-consistent (same molar density, a bigger tank).  The tracer
    //  dynamics would not notice — no reaction is active in this witness, and
    //  the dilution ODE reads the mole numbers — but leaving V behind would
    //  declare a state no vessel could hold, and a case file a student opens
    //  has to make sense on its own.
    { file: "0/internalState", key: "V",
      value: WITNESS_VOLUME_M3 * holdupScale },
  ];
}

/** What the engine published for one point, read off its KPI row.  Returns
 *  null when the row is not there — a hole, never a zero. */
export interface MeasuredPoint {
  wtau: number;
  omegaRadS: number;
  /** out_amplitude_kmol_s / the declared drive amplitude. */
  amplitudeRatio: number;
  /** out_phase_rad, as published: negative is a lag. */
  phaseRad: number;
  /** fit_residual_rel — the share of the outlet's variance the single
   *  sinusoid does not explain.  The fit's own honesty, never hidden. */
  residual: number;
}

export function readMeasuredPoint(
  kpis: { [unit: string]: { [key: string]: number } } | undefined,
  point: SweepPoint,
): MeasuredPoint | null {
  const row = kpis?.["frequencyResponse"];
  const amp = row?.["out_amplitude_kmol_s"];
  const phi = row?.["out_phase_rad"];
  if (typeof amp !== "number" || typeof phi !== "number") return null;
  if (!Number.isFinite(amp) || !Number.isFinite(phi)) return null;
  return {
    wtau: point.wtau,
    omegaRadS: point.omegaRadS,
    amplitudeRatio: amp / WITNESS_DRIVE_AMPLITUDE_KMOL_S,
    phaseRad: phi,
    residual: row?.["fit_residual_rel"] ?? NaN,
  };
}
