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
  BodeTool — the frequency-response lesson, on TWO planes that the page never
  lets blur into one.

  PLANE A, MEASURED.  The engine runs.  `ctrl19_freq_response_cstr` is a
  stirred tank with a sinusoidal tracer substitution on its feed and a
  `frequencyResponse {}` block that least-squares fits a + b sin(wt) +
  c cos(wt) to the outlet; one run is one point.  This page sweeps the drive
  frequency with `useEngineSeries` — seven witness runs of choupoCtrl in the
  browser, each with its own time step and run length — and plots what the
  engine published.  The reader's tau knob scales the tank's authored holdup,
  so the MEASURED points slide along the frequency axis exactly as the theory
  says they must.

  PLANE B, CONSTRUCTED.  Below a banner that says so in those words, the
  classical arithmetic: the four elements, the open loop, the two crossovers
  and the two margins.  Nothing in src/ computes any of it (bodeMath.ts's
  header carries the search and its date).  The authorisation to draw it at
  all is EpsilonNtuTool's, restated there: method geometry a tool may own
  where the engine's own answer is the judge — and the judge exists here for
  exactly one element, which is why the measured points are laid on the
  constructed first-order curve and the page prints the largest disagreement
  as a number instead of asserting agreement.

  WHY THE TWO PLOTS ARE INLINE SVG and not the plotting kit: plotly cannot
  load in the node test environment, and `bodeMath` must stay importable by
  the tests that pin it (the EpsilonNtuTool / HeatExchangerDatasheet
  precedent).  Both drawings are aspect-fitted viewBoxes, so they widen with
  the panel rather than needing a resize hook.

  THE PAGE IS A SCROLLING LESSON, not an instrument panel: the derivation
  comes before the construction, the knobs sit in the left column of a grid
  beside each drawing, and the limits come last.  The prose is DATA
  (bodeLesson.ts) so its arithmetic can be recomputed against this file's own
  maths in the tests.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { BODE_LIMITS, BODE_STEPS } from "./bodeLesson.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { useEngineSeries } from "../../case/engineSeries.js";
import {
  BODE_WITNESS, FIT_CYCLES, SAMPLING_PHASE_BIAS_RAD, STEPS_PER_PERIOD,
  WITNESS_DRIVE_AMPLITUDE_KMOL_S, WITNESS_TAU_S,
  bodeOverrides, bodeSweepGrid, combine, controllerResponse, dB,
  deadTimeResponse, firstOrderLagResponse, gainResponse, integratorResponse,
  loopWindow, margins, openLoopResponse, parallelGains,
  readMeasuredPoint, toDeg,
  type ControllerMode, type LoopSpec, type MeasuredPoint, type Response,
} from "./bodeMath.js";

// ---- Drawing constants ------------------------------------------------------

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const MEASURED = "#26c6da";
const CONSTRUCTED = "#ffb74d";
const MARK = "#ce93d8";
const ELEMENT = "#9e9e9e";

const VW = 760;                 // viewBox width
const PANEL_H = 190;            // one panel (magnitude or phase)
const X0 = 62, X1 = VW - 14;

const fmt = (v: number, d = 3): string =>
  Number.isFinite(v) ? v.toFixed(d) : "—";
const fmtExp = (v: number, d = 3): string =>
  Number.isFinite(v) ? v.toExponential(d) : "—";

/** Decade grid lines inside [wLo, wHi], as powers of ten. */
function decades(wLo: number, wHi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(wLo)); e <= Math.floor(Math.log10(wHi)); ++e)
    out.push(Math.pow(10, e));
  return out;
}

interface Axes {
  x: (w: number) => number;
  yMag: (db: number) => number;
  yPhase: (deg: number) => number;
  magTicks: number[];
  phaseTicks: number[];
  magTop: number;
  magBot: number;
  phaseTop: number;
  phaseBot: number;
}

function makeAxes(
  wLo: number, wHi: number, magTop: number, magBot: number,
  phaseTop: number, phaseBot: number,
): Axes {
  const lx0 = Math.log10(wLo), lx1 = Math.log10(wHi);
  const x = (w: number) => X0 + ((X1 - X0) * (Math.log10(w) - lx0)) / (lx1 - lx0);
  const yMag = (db: number) =>
    14 + (PANEL_H - 42) * (1 - (db - magBot) / (magTop - magBot));
  const yPhase = (deg: number) =>
    14 + (PANEL_H - 42) * (1 - (deg - phaseBot) / (phaseTop - phaseBot));
  const magTicks: number[] = [];
  const stepDb = (magTop - magBot) > 160 ? 40 : 20;
  for (let v = Math.ceil(magBot / stepDb) * stepDb; v <= magTop; v += stepDb)
    magTicks.push(v);
  const phaseTicks: number[] = [];
  for (let v = Math.ceil(phaseBot / 45) * 45; v <= phaseTop; v += 45)
    phaseTicks.push(v);
  return { x, yMag, yPhase, magTicks, phaseTicks, magTop, magBot, phaseTop, phaseBot };
}

/** One panel's frame: decade verticals, value horizontals, axis labels. */
function Frame({ ax, wLo, wHi, kind, label }: {
  ax: Axes; wLo: number; wHi: number;
  kind: "mag" | "phase"; label: string;
}): JSX.Element {
  const ticks = kind === "mag" ? ax.magTicks : ax.phaseTicks;
  const y = kind === "mag" ? ax.yMag : ax.yPhase;
  return (
    <>
      {decades(wLo, wHi).map((w) => (
        <line key={`d${w}`} x1={ax.x(w)} x2={ax.x(w)}
          y1={y(kind === "mag" ? ax.magTop : ax.phaseTop)}
          y2={y(kind === "mag" ? ax.magBot : ax.phaseBot)}
          stroke={GRID} strokeWidth={1} />
      ))}
      {ticks.map((v) => (
        <g key={`t${v}`}>
          <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke={GRID}
            strokeWidth={1} strokeDasharray={v === 0 ? "" : "2 4"} />
          <text x={X0 - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={INK}>
            {v}
          </text>
        </g>
      ))}
      <text x={X0 - 52} y={14} fontSize={9} fill={INK}>{label}</text>
    </>
  );
}

/** A polyline over the drawn window, one point per pixel column. */
function curve(
  ax: Axes, wLo: number, wHi: number,
  value: (w: number) => number, y: (v: number) => number,
  clampLo: number, clampHi: number,
): string {
  const n = 320;
  const pts: string[] = [];
  for (let i = 0; i <= n; ++i) {
    const w = wLo * Math.pow(wHi / wLo, i / n);
    const v = Math.min(clampHi, Math.max(clampLo, value(w)));
    if (!Number.isFinite(v)) continue;
    pts.push(`${ax.x(w).toFixed(2)},${y(v).toFixed(2)}`);
  }
  return pts.join(" ");
}

// ---- Knob descriptors -------------------------------------------------------

const TAU_KNOB: PanelKnob = {
  id: "tau", label: "tank time constant τ = N/F", min: 30, max: 1200, step: 10,
  unit: "s",
  why: "Scales the witness tank's authored holdup, so the residence time N/F "
    + "moves and every flow stays where it was.  The measured points slide "
    + "along the frequency axis; the curve's SHAPE cannot change, because a "
    + "first-order lag depends on ω and τ only through their product.",
};

const LOOP_KNOBS: PanelKnob[] = [
  { id: "K", label: "process gain K", min: 0.1, max: 10, step: 0.1,
    why: "Moves the whole magnitude curve up or down and touches the phase "
      + "curve nowhere.  Watch the gain crossover slide and the phase margin "
      + "change without the phase curve moving at all." },
  { id: "tau", label: "process time constant τ", min: 1, max: 600, step: 1,
    unit: "s",
    why: "The lag's corner.  Sets where the magnitude starts falling at "
      + "−20 dB/decade and where the phase passes −45°." },
  { id: "theta", label: "dead time θ", min: 0, max: 300, step: 1, unit: "s",
    why: "Costs nothing on the magnitude curve and everything on the phase "
      + "curve.  Raise it and watch the phase crossover march to the left "
      + "while the magnitude curve does not move a pixel." },
  { id: "Kc", label: "controller gain K_c", min: 0.1, max: 20, step: 0.1,
    why: "The knob an operator actually turns.  It buys speed by spending "
      + "gain margin." },
  { id: "tauI", label: "integral time τ_I", min: 1, max: 2000, step: 1,
    unit: "s",
    why: "Small τ_I is aggressive integral action: more low-frequency gain, "
      + "and up to 90° of extra lag where it acts." },
  { id: "tauD", label: "derivative time τ_D", min: 0, max: 300, step: 1,
    unit: "s",
    why: "Buys phase back near the crossover — and lifts the magnitude at "
      + "high frequency, which is the same thing as amplifying noise." },
];

type LoopKnobs = { K: number; tau: number; theta: number;
  Kc: number; tauI: number; tauD: number };

const LOOP_DEFAULTS: LoopKnobs = {
  K: 2, tau: 240, theta: 30, Kc: 1.5, tauI: 240, tauD: 0,
};

// ---- The measured plane -----------------------------------------------------

function MeasuredChart({ tauS, measured }: {
  tauS: number; measured: (MeasuredPoint | null)[];
}): JSX.Element {
  //  A FIXED axis is safe HERE and nowhere else on this page: the window is
  //  set in w*tau (0.02 to 50), and a first-order lag's curve is universal in
  //  that product — it can never leave [0, -34] dB or [0, -89] deg over this
  //  span, whatever tau the reader chooses.  The loop chart below has no such
  //  guarantee and measures its own range.
  const wLo = 0.02 / tauS, wHi = 50 / tauS;
  const ax = makeAxes(wLo, wHi, 6, -40, 10, -100);
  const lag = (w: number) => firstOrderLagResponse(tauS, w);
  const shown = measured.filter((m): m is MeasuredPoint => m !== null);
  return (
    <svg viewBox={`0 0 ${VW} ${2 * PANEL_H}`} width="100%"
      preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Measured Bode diagram of the stirred tank">
      <g>
        <Frame ax={ax} wLo={wLo} wHi={wHi} kind="mag" label="magnitude [dB]" />
        <polyline fill="none" stroke={CONSTRUCTED} strokeWidth={1.6}
          points={curve(ax, wLo, wHi, (w) => dB(lag(w).mag), ax.yMag, -40, 6)} />
        {shown.map((m) => (
          <circle key={`m${m.wtau}`} cx={ax.x(m.omegaRadS)}
            cy={ax.yMag(Math.max(-40, dB(m.amplitudeRatio)))} r={3.4}
            fill={MEASURED} />
        ))}
      </g>
      <g transform={`translate(0, ${PANEL_H})`}>
        <Frame ax={ax} wLo={wLo} wHi={wHi} kind="phase" label="phase [°]" />
        <polyline fill="none" stroke={CONSTRUCTED} strokeWidth={1.6}
          points={curve(ax, wLo, wHi, (w) => toDeg(lag(w).phaseRad),
            ax.yPhase, -100, 10)} />
        {shown.map((m) => (
          <circle key={`p${m.wtau}`} cx={ax.x(m.omegaRadS)}
            cy={ax.yPhase(toDeg(m.phaseRad))} r={3.4} fill={MEASURED} />
        ))}
        {decades(wLo, wHi).map((w) => (
          <text key={`lx${w}`} x={ax.x(w)} y={PANEL_H - 16} textAnchor="middle"
            fontSize={9} fill={INK}>{w.toExponential(0)}</text>
        ))}
        <text x={(X0 + X1) / 2} y={PANEL_H - 4} textAnchor="middle" fontSize={9}
          fill={INK}>ω [rad/s]</text>
      </g>
    </svg>
  );
}

// ---- The constructed plane --------------------------------------------------

function LoopChart({ spec, showElements }: {
  spec: LoopSpec; showElements: boolean;
}): JSX.Element {
  const { wLo, wHi } = loopWindow(spec);
  const m = margins(spec, wLo, wHi);
  const L = (w: number) => openLoopResponse(spec, w);

  //  THE AXES FOLLOW THE CURVE, because a fixed axis silently CLAMPS.  A
  //  clamped curve is drawn as a flat line along the edge of the panel, which
  //  is not "off the top" to a reader — it looks like a real plateau, and a
  //  plateau in a magnitude curve means something quite different.  Both
  //  ranges are rounded outwards to whole tick spacings so the gridlines stay
  //  on round numbers, and both always CONTAIN their reading line (0 dB and
  //  −180°) or the margin would have nothing to be measured from.
  const sampled = Array.from({ length: 240 }, (_, i) =>
    L(wLo * Math.pow(wHi / wLo, i / 239)));
  const dbs = sampled.map((r) => dB(r.mag)).filter(Number.isFinite);
  const degs = sampled.map((r) => toDeg(r.phaseRad)).filter(Number.isFinite);
  const roundOut = (v: number, step: number, up: boolean) =>
    step * (up ? Math.ceil(v / step) : Math.floor(v / step));
  const magTop = Math.max(20, roundOut(Math.max(...dbs, 0) + 6, 20, true));
  const magBot = Math.min(-20, roundOut(Math.min(...dbs, 0) - 6, 20, false));
  const phaseTop = Math.min(0, roundOut(Math.max(...degs, -180), 45, true));
  const phaseBot = Math.max(-720,
    Math.min(-225, roundOut(Math.min(...degs, -180) - 10, 45, false)));
  const ax = makeAxes(wLo, wHi, magTop, magBot, phaseTop, phaseBot);

  //  Each element drawn ALONE, as a dashed grey curve, so a reader can see
  //  the loop above it as the SUM of these on the log axes.  The controller's
  //  own gain is shown with the process gain (they are one flat line; drawing
  //  two would suggest they are separable on the diagram, and they are not).
  const elements: { key: string; r: (w: number) => Response }[] = [];
  if (showElements) {
    const flat = combine(gainResponse(spec.process.K),
      spec.controller.mode === "off" ? { mag: 1, phaseRad: 0 }
        : gainResponse(spec.controller.Kc));
    elements.push({ key: "gain", r: () => flat });
    elements.push({ key: "lag", r: (w) => firstOrderLagResponse(spec.process.tauS, w) });
    if (spec.process.integrating)
      elements.push({ key: "int", r: integratorResponse });
    if (spec.process.thetaS > 0)
      elements.push({ key: "dead", r: (w) => deadTimeResponse(spec.process.thetaS, w) });
    if (spec.controller.mode !== "off" && spec.controller.mode !== "P")
      elements.push({ key: "ctrl",
        r: (w) => controllerResponse({ ...spec.controller, Kc: 1 }, w) });
  }

  const markers = (
    <>
      {m.gain.found && (
        <line x1={ax.x(m.gain.omegaRadS)} x2={ax.x(m.gain.omegaRadS)}
          y1={14} y2={PANEL_H - 28} stroke={MARK} strokeWidth={1.2}
          strokeDasharray="4 3" />
      )}
      {m.phase.found && (
        <line x1={ax.x(m.phase.omegaRadS)} x2={ax.x(m.phase.omegaRadS)}
          y1={14} y2={PANEL_H - 28} stroke={MEASURED} strokeWidth={1.2}
          strokeDasharray="1 3" />
      )}
    </>
  );

  return (
    <svg viewBox={`0 0 ${VW} ${2 * PANEL_H}`} width="100%"
      preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="Constructed open-loop Bode diagram with margins">
      <g>
        <Frame ax={ax} wLo={wLo} wHi={wHi} kind="mag" label="|L| [dB]" />
        {elements.map((e) => (
          <polyline key={e.key} fill="none" stroke={ELEMENT} strokeWidth={1}
            strokeDasharray="3 3" opacity={0.85}
            points={curve(ax, wLo, wHi, (w) => dB(e.r(w).mag), ax.yMag,
              magBot, magTop)} />
        ))}
        <polyline fill="none" stroke={CONSTRUCTED} strokeWidth={1.8}
          points={curve(ax, wLo, wHi, (w) => dB(L(w).mag), ax.yMag,
            magBot, magTop)} />
        {markers}
        {m.phase.found && Number.isFinite(m.gainMarginDb) && (
          <line x1={ax.x(m.phase.omegaRadS)} x2={ax.x(m.phase.omegaRadS)}
            y1={ax.yMag(0)} y2={ax.yMag(Math.max(magBot, -m.gainMarginDb))}
            stroke={MEASURED} strokeWidth={3} />
        )}
        <text x={X1} y={14} textAnchor="end" fontSize={9} fill={INK}>
          0 dB is the gain-crossover line
        </text>
      </g>
      <g transform={`translate(0, ${PANEL_H})`}>
        <Frame ax={ax} wLo={wLo} wHi={wHi} kind="phase" label="∠L [°]" />
        <line x1={X0} x2={X1} y1={ax.yPhase(-180)} y2={ax.yPhase(-180)}
          stroke={MEASURED} strokeWidth={1.2} />
        {elements.map((e) => (
          <polyline key={e.key} fill="none" stroke={ELEMENT} strokeWidth={1}
            strokeDasharray="3 3" opacity={0.85}
            points={curve(ax, wLo, wHi, (w) => toDeg(e.r(w).phaseRad),
              ax.yPhase, phaseBot, phaseTop)} />
        ))}
        <polyline fill="none" stroke={CONSTRUCTED} strokeWidth={1.8}
          points={curve(ax, wLo, wHi, (w) => toDeg(L(w).phaseRad),
            ax.yPhase, phaseBot, phaseTop)} />
        {markers}
        {m.gain.found && Number.isFinite(m.phaseMarginDeg) && (
          <line x1={ax.x(m.gain.omegaRadS)} x2={ax.x(m.gain.omegaRadS)}
            y1={ax.yPhase(-180)}
            y2={ax.yPhase(Math.max(phaseBot, -180 + m.phaseMarginDeg))}
            stroke={MARK} strokeWidth={3} />
        )}
        {decades(wLo, wHi).map((w) => (
          <text key={`lx${w}`} x={ax.x(w)} y={PANEL_H - 16} textAnchor="middle"
            fontSize={9} fill={INK}>{w.toExponential(0)}</text>
        ))}
        <text x={(X0 + X1) / 2} y={PANEL_H - 4} textAnchor="middle" fontSize={9}
          fill={INK}>ω [rad/s]</text>
      </g>
    </svg>
  );
}

// ---- The page ---------------------------------------------------------------

export function BodeTool(): JSX.Element {
  const step = lessonStepper(BODE_STEPS);

  // ---- Plane A: the engine sweep -------------------------------------------
  const [tauS, setTauS] = useState(WITNESS_TAU_S);
  const N_POINTS = 7, WTAU_LO = 0.1, WTAU_HI = 10;
  const grid = useMemo(
    () => bodeSweepGrid(tauS, N_POINTS, WTAU_LO, WTAU_HI), [tauS]);
  const points = useMemo(() => grid.map((p) => ({
    label: `ω·τ = ${p.wtau.toFixed(3)}`,
    overrides: bodeOverrides(p, tauS),
  })), [grid, tauS]);
  const series = useEngineSeries(
    BODE_WITNESS, points, `bode:${tauS}:${N_POINTS}`, "choupoCtrl");

  const measured = useMemo(
    () => grid.map((p, i) => readMeasuredPoint(series.results[i]?.kpis, p)),
    [grid, series.results]);

  /** The verification this page rests on: the largest gap between an engine
   *  point and the constructed first-order curve at the same frequency.  It
   *  is PRINTED, never asserted — if the construction were wrong, this is the
   *  number that would say so. */
  const agreement = useMemo(() => {
    let dAr = 0, dPhiDeg = 0, worstResidual = 0, n = 0;
    for (const m of measured) {
      if (!m) continue;
      const ref = firstOrderLagResponse(tauS, m.omegaRadS);
      dAr = Math.max(dAr, Math.abs(m.amplitudeRatio - ref.mag));
      dPhiDeg = Math.max(dPhiDeg, Math.abs(toDeg(m.phaseRad - ref.phaseRad)));
      if (Number.isFinite(m.residual))
        worstResidual = Math.max(worstResidual, m.residual);
      ++n;
    }
    return { dAr, dPhiDeg, worstResidual, n };
  }, [measured, tauS]);

  // ---- Plane B: the drawing board ------------------------------------------
  const [knobs, setKnobs] = useState<LoopKnobs>(LOOP_DEFAULTS);
  const [mode, setMode] = useState<ControllerMode>("PI");
  const [integrating, setIntegrating] = useState(false);
  const [showElements, setShowElements] = useState(true);

  const spec: LoopSpec = useMemo(() => ({
    process: { K: knobs.K, tauS: knobs.tau, thetaS: knobs.theta, integrating },
    controller: { mode, Kc: knobs.Kc, tauIS: knobs.tauI, tauDS: knobs.tauD },
  }), [knobs, mode, integrating]);
  const window_ = useMemo(() => loopWindow(spec), [spec]);
  const m = useMemo(
    () => margins(spec, window_.wLo, window_.wHi), [spec, window_]);
  const gains = useMemo(() => parallelGains(spec.controller), [spec]);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>
            The Bode diagram: will this loop be stable before you switch it on?
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            A control loop can be tested by turning it on and watching, which
            is how you find out that it oscillates — with the plant running.
            The frequency response answers the same question on paper, from
            the open loop alone, and says how much room is left.
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}

        {/* -------------------- PLANE A: MEASURED -------------------- */}
        <Box style={{ borderLeft: `3px solid ${MEASURED}`, paddingLeft: 12 }}>
          <Title order={4}>Measured: the engine sweeps a real tank</Title>
          <Text size="sm" mt={4}>
            Choupo has no transfer function anywhere in it. What it has is a
            tank and a time integrator — so a frequency response here is an
            EXPERIMENT, and this is it, run in your browser. Each point below
            is one complete run of{" "}
            <Text span ff="monospace" size="xs">
              tutorials/ctrl/{BODE_WITNESS}
            </Text>{" "}
            with the drive frequency changed: the tracer feed swings
            sinusoidally, the engine integrates until the start-up transient
            has decayed, and then least-squares fits{" "}
            <Text span ff="monospace" size="xs">a + b·sin(ω·t) + c·cos(ω·t)</Text>{" "}
            to the outlet. The amplitude is{" "}
            <Text span ff="monospace" size="xs">hypot(b, c)</Text> and the
            phase is <Text span ff="monospace" size="xs">atan2(c, b)</Text>{" "}
            (src/applications/choupoCtrl/main.cpp:1553-1555). Seven runs, seven points.
          </Text>
          <Text size="sm" mt={6}>
            The line through them is the first-order closed form derived in
            step 3, at the same τ. It is drawn by this page, not by the
            engine — and the points are how you know it is right.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={8}>
            <KnobSlider knob={TAU_KNOB} value={tauS} showWhy
              onChange={(v) => setTauS(v)} />
            {series.busy && (
              <Group gap={6}>
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  measuring point {Math.min(series.done + 1, N_POINTS)} of{" "}
                  {N_POINTS}
                </Text>
              </Group>
            )}
            <PanelNote>
              Each run writes six declared scalars into the witness dicts and
              nothing else: the drive frequency (twice — the carrier mirrors
              it), the end time, the time step, the cycles discarded and
              fitted, and the tank&apos;s authored holdup for τ. The same five
              edits by hand in the case directory give the same answer.
            </PanelNote>
            <PanelNote>
              Drive amplitude {WITNESS_DRIVE_AMPLITUDE_KMOL_S.toExponential(1)}{" "}
              kmol/s, declared by the case; the amplitude ratio is the
              engine&apos;s fitted outlet amplitude divided by it.
            </PanelNote>
            <PanelNote>
              The same sweep exists as a case with no browser in it:{" "}
              <Text span ff="monospace" size="xs">
                tutorials/ctrl/ctrl20_bode_cstr
              </Text>{" "}
              drives four frequencies from a{" "}
              <Text span ff="monospace" size="xs">system/outerDict</Text> sweep
              and writes the Bode table as a CSV, with the first-order closed
              forms pinned as anchors in its golden. This page differs in one
              respect only: it gives each point its own time step and run
              length instead of one clock for all of them.
            </PanelNote>
          </Stack>
          <Box>
            <MeasuredChart tauS={tauS} measured={measured} />
          </Box>
        </Box>

        {series.failures.length > 0 && (
          <Alert color="orange" variant="light" title="Points the engine refused">
            {series.failures.map((f) => (
              <Text key={f.label} size="xs" ff="monospace">
                {f.label}: {f.message}
              </Text>
            ))}
          </Alert>
        )}

        <Box>
          <Title order={5}>What the comparison says, as numbers</Title>
          {/*  NO RUNS IS NOT PERFECT AGREEMENT.  With nothing measured the
               three worst-case figures are all zero, and printing them would
               report a flawless comparison over an empty set — the exact
               shape of silent falsehood this page exists to avoid.  */}
          {agreement.n === 0 ? (
            <Text size="sm" mt={4}>
              No point has been measured yet, so there is nothing to compare.
              {series.busy
                ? " The engine is running."
                : " If it stays this way, the WASM engine did not load — the "
                  + "curve above is then the construction alone, with nothing "
                  + "checking it."}
            </Text>
          ) : (
            <Text size="sm" mt={4}>
              Measured against constructed, worst of the {agreement.n} point
              {agreement.n === 1 ? "" : "s"} run so far: amplitude ratio differs
              by <b>{fmtExp(agreement.dAr, 2)}</b>, phase by{" "}
              <b>{fmt(agreement.dPhiDeg, 3)}°</b>. The largest share of the
              outlet&apos;s variance the single sinusoid failed to explain —
              the engine&apos;s own{" "}
              <Text span ff="monospace" size="xs">fit_residual_rel</Text> — is{" "}
              <b>{fmtExp(agreement.worstResidual, 2)}</b>.
            </Text>
          )}
          <Text size="sm" mt={6}>
            The phase gap is not noise and it is not the construction being
            wrong: it is the MEASUREMENT&apos;s own lag. The fit reads accepted
            states on a grid of step Δt, which trails the continuous answer by
            half a step, so the fitted phase carries exactly −ω·Δt/2. This
            sweep sets Δt to the drive period over {STEPS_PER_PERIOD}, so that
            bias is the same at every point:{" "}
            −π/{STEPS_PER_PERIOD} = {fmtExp(SAMPLING_PHASE_BIAS_RAD, 3)} rad ={" "}
            {fmt(Math.abs(toDeg(SAMPLING_PHASE_BIAS_RAD)), 3)}°. It is shown,
            not removed.
          </Text>
          <Text size="xs" c="dimmed" mt={6}>
            Run design, per point: {FIT_CYCLES} cycles fitted after enough
            whole cycles to cover eight time constants of start-up
            ({grid.at(0)?.discardCycles ?? 1} at the slowest point,{" "}
            {grid.at(-1)?.discardCycles ?? 1} at the fastest),{" "}
            {STEPS_PER_PERIOD} accepted steps per period.
          </Text>
        </Box>

        {/* -------------------- PLANE B: CONSTRUCTED -------------------- */}
        {step(5)}
        {step(6)}
        {step(7)}

        <Alert color="yellow" variant="light"
          title="Below this line, nothing is computed by Choupo">
          <Text size="sm">
            The drawing that follows is classical control arithmetic evaluated
            in your browser: the four elements, the open loop, both crossover
            frequencies and both margins. Searched across the engine source on
            2026-09-12 — there is no transfer function, no Nyquist plot, no
            gain margin and no phase margin anywhere in it. Only the
            first-order lag above has an engine answer to be checked against,
            and it was checked. The integrator, the dead time and the PID
            curves here have none: Choupo has no unit operation that models a
            transport delay, and the controller&apos;s own frequency response
            is not computed anywhere in the tree.
          </Text>
        </Alert>

        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={8}>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">controller</Text>
            <SegmentedControl size="xs" fullWidth value={mode}
              onChange={(v) => setMode(v as ControllerMode)}
              data={[{ label: "off", value: "off" }, { label: "P", value: "P" },
                { label: "PI", value: "PI" }, { label: "PID", value: "PID" }]} />
            <SegmentedControl size="xs" fullWidth
              value={integrating ? "int" : "self"}
              onChange={(v) => setIntegrating(v === "int")}
              data={[{ label: "self-regulating", value: "self" },
                { label: "+ integrator", value: "int" }]} />
            <SegmentedControl size="xs" fullWidth
              value={showElements ? "on" : "off"}
              onChange={(v) => setShowElements(v === "on")}
              data={[{ label: "loop only", value: "off" },
                { label: "show elements", value: "on" }]} />
            {LOOP_KNOBS.filter((k) =>
              !(k.id === "tauI" && (mode === "off" || mode === "P"))
              && !(k.id === "tauD" && mode !== "PID")
              && !(k.id === "Kc" && mode === "off")).map((k) => (
              <KnobSlider key={k.id} knob={k} showWhy
                value={knobs[k.id as keyof LoopKnobs]}
                onChange={(v) => setKnobs((s) => ({ ...s, [k.id]: v }))} />
            ))}
            <PanelNote>
              In Choupo&apos;s own dict these three become{" "}
              <Text span ff="monospace" size="xs">
                gains {"{"} Kp {fmt(gains.Kp, 4)}; Ki {fmtExp(gains.Ki, 3)};
                Kd {fmt(gains.Kd, 4)}; {"}"}
              </Text>{" "}
              — the engine&apos;s own conversion (src/control/PIDController.cpp:75). Where
              K, τ and θ should come from is the engine&apos;s step-response
              identification, not from these sliders.
            </PanelNote>
          </Stack>
          <Box>
            <LoopChart spec={spec} showElements={showElements} />
          </Box>
        </Box>

        <Box>
          <Title order={5}>The two readings</Title>
          <Group gap={8} mt={6} wrap="wrap">
            <Badge variant="light" color={m.gain.found ? "grape" : "gray"}>
              gain crossover ω_c ={" "}
              {m.gain.found ? `${fmtExp(m.gain.omegaRadS, 3)} rad/s`
                : "none in window"}
            </Badge>
            <Badge variant="light"
              color={Number.isFinite(m.phaseMarginDeg)
                ? (m.phaseMarginDeg > 0 ? "grape" : "red") : "gray"}>
              phase margin ={" "}
              {Number.isFinite(m.phaseMarginDeg)
                ? `${fmt(m.phaseMarginDeg, 1)}°` : "—"}
            </Badge>
            <Badge variant="light" color={m.phase.found ? "cyan" : "gray"}>
              phase crossover ω_u ={" "}
              {m.phase.found ? `${fmtExp(m.phase.omegaRadS, 3)} rad/s`
                : "none in window"}
            </Badge>
            <Badge variant="light"
              color={Number.isFinite(m.gainMargin)
                ? (m.gainMargin > 1 ? "cyan" : "red") : "gray"}>
              gain margin ={" "}
              {Number.isFinite(m.gainMargin)
                ? `${fmt(m.gainMargin, 2)}× (${fmt(m.gainMarginDb, 1)} dB)`
                : "—"}
            </Badge>
          </Group>
          <Text size="sm" mt={8}>
            {!m.gain.found && !m.phase.found
              ? "Neither curve crosses its line inside the window drawn, so "
                + "neither margin exists to be read.  That is the honest "
                + "answer and not a failure: a loop whose magnitude never "
                + "reaches 1 cannot be destabilised by phase alone."
              : !m.phase.found
                ? "The phase never reaches −180° inside the window, so there "
                  + "is no gain margin to read.  A first-order lag with a "
                  + "pure gain is the textbook case: it cannot be made "
                  + "unstable by turning the gain up, which is why a dead "
                  + "time is the knob to reach for next."
                : !m.gain.found
                  ? "The magnitude never reaches 0 dB inside the window, so "
                    + "there is no phase margin to read."
                  : m.stable
                    ? "Both margins are positive: at the frequency where the "
                      + "loop would oscillate, what comes back round is "
                      + "smaller than what left."
                    : "At least one margin has gone negative — at ω_u the "
                      + "signal comes back inverted and no smaller than it "
                      + "left, so the loop grows its own oscillation."}
          </Text>
          <Text size="xs" c="dimmed" mt={6}>
            Read as the Bode form of the Nyquist criterion, which assumes an
            open-loop-stable loop whose phase crosses −180° once. Step 8 says
            where that stops being true.
          </Text>
        </Box>

        {step(8)}

        <LessonLimits limits={BODE_LIMITS} />
      </Stack>
    </Box>
  );
}
