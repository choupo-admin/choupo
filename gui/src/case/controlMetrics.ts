/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  Control metrics -- pure-TS read-offs of a closed-loop PV trajectory against
  its setpoint.  ZERO physics: every number is a reduction over the sampled
  (t, PV) the choupoCtrl run already produced, so the engine stays frozen and
  the maths is glass-box + unit-tested.

  The window is selectable (Track vs Reject): the caller passes [t0, t1] and the
  trajectory is sliced to it before reducing.  A reference value (the setpoint,
  or for a disturbance window the pre-disturbance steady PV) anchors overshoot,
  offset and the settling band.

  Honest gaps: settlingTime returns null ("not settled") rather than a
  fabricated number when the PV never enters AND stays inside the band; a flat
  trace yields a defined "critically/over-damped" verdict, never a divide-by-0.
\*---------------------------------------------------------------------------*/

export type DampingVerdict =
  | "over-damped"
  | "critically-damped"
  | "under-damped"
  | "sustained-oscillation"
  | "unstable";

export interface ControlMetrics {
  /** Reference (setpoint) the metrics are measured against. */
  reference: number;
  /** PV at the window start (the step's "before"). */
  pvStart: number;
  /** PV at the window end (the settled value). */
  pvEnd: number;
  /** Peak |PV - reference| excursion within the window. */
  peak: number;
  /** Peak overshoot %, (PV_peak - ref) / (ref - PV_start) * 100; null when the
   *  step size (ref - PV_start) is ~0 (no commanded change -> overshoot undefined). */
  overshootPct: number | null;
  /** Time to first cross 10%->90% of the step (s); null if no clear step. */
  riseTime: number | null;
  /** Last time the PV exits the ±band, i.e. settling time within the window
   *  (s, relative to window start); null when never settled inside it. */
  settlingTime: number | null;
  /** Steady-state offset = reference - PV_end. */
  steadyStateOffset: number;
  /** Integral of |error| over the window (trapezoid). */
  iae: number;
  /** Integral of error^2 over the window (trapezoid). */
  ise: number;
  /** Decay ratio of successive overshoot peaks (2nd/1st); null with <2 peaks. */
  decayRatio: number | null;
  /** Oscillation period from the peak spacing (s); null with <2 peaks. */
  period: number | null;
  /** The visceral label. */
  dampingVerdict: DampingVerdict;
  /** Number of samples actually used (window slice). */
  n: number;
}

export interface MetricsOptions {
  /** The setpoint to measure against (the PID `setpoint`). */
  reference: number;
  /** Half-width of the settling band in PV units (e.g. 0.02*ref for ±2%). */
  bandHalf: number;
  /** Window [t0, t1] (s) to integrate over.  Undefined => whole trajectory. */
  window?: [number, number];
  /** Override the "before" reference for overshoot/offset (a disturbance
   *  window measures excursion from the pre-disturbance PV, not pvStart of the
   *  whole run).  Defaults to PV at the window start. */
  preValue?: number;
}

interface Series {
  t: number[];
  y: number[];
}

/** Slice a (t,y) series to the inclusive window [t0,t1]. */
function sliceWindow(t: number[], y: number[], window?: [number, number]): Series {
  if (!window) return { t: [...t], y: [...y] };
  const [t0, t1] = window;
  const st: number[] = [];
  const sy: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const ti = t[i]!;
    if (ti >= t0 - 1e-9 && ti <= t1 + 1e-9) { st.push(ti); sy.push(y[i]!); }
  }
  return { t: st, y: sy };
}

/** Trapezoid integral of f(t) over the sampled series. */
function trapz(t: number[], f: number[]): number {
  let acc = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i]! - t[i - 1]!;
    acc += 0.5 * (f[i]! + f[i - 1]!) * dt;
  }
  return acc;
}

/** Interior local extrema of |error| (turning points of the error signal),
 *  returned as { t, err } where err = y - reference (signed). */
function errorPeaks(t: number[], y: number[], reference: number): { t: number; err: number }[] {
  const peaks: { t: number; err: number }[] = [];
  for (let i = 1; i < y.length - 1; i++) {
    const e0 = y[i - 1]! - reference;
    const e1 = y[i]! - reference;
    const e2 = y[i + 1]! - reference;
    // A turning point of the error: slope changes sign (a local max or min).
    if ((e1 - e0) * (e2 - e1) < 0) peaks.push({ t: t[i]!, err: e1 });
  }
  return peaks;
}

/**
 * Compute the closed-loop control metrics of a PV trajectory.
 */
export function controlMetrics(
  t: number[],
  pv: number[],
  opts: MetricsOptions,
): ControlMetrics {
  const { reference, bandHalf } = opts;
  const { t: tw, y: yw } = sliceWindow(t, pv, opts.window);
  const n = tw.length;

  if (n === 0) {
    return {
      reference, pvStart: NaN, pvEnd: NaN, peak: 0, overshootPct: null,
      riseTime: null, settlingTime: null, steadyStateOffset: NaN,
      iae: 0, ise: 0, decayRatio: null, period: null,
      dampingVerdict: "critically-damped", n: 0,
    };
  }

  const pvStart = yw[0]!;
  const pvEnd = yw[n - 1]!;
  const pre = opts.preValue ?? pvStart;
  const t0 = tw[0]!;

  // Errors + integrals.
  const err = yw.map((v) => v - reference);
  const absErr = err.map(Math.abs);
  const sqErr = err.map((e) => e * e);
  const iae = trapz(tw, absErr);
  const ise = trapz(tw, sqErr);

  // Peak excursion from the reference (the largest |error| over the window).
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(err[i]!);
    if (d > peak) peak = d;
  }

  // Overshoot: how far the PV passes the reference IN THE STEP DIRECTION,
  // relative to the commanded step (ref - pre).  We track the extreme PV in the
  // step's direction (not the global max-|error|, which a step's initial error
  // would dominate).  Undefined when the step is ~0 (no command -> a rejection
  // window measures excursion via preValue instead).
  const step = reference - pre;
  let overshootPct: number | null;
  if (Math.abs(step) < 1e-9) {
    overshootPct = null;
  } else {
    const dir = Math.sign(step);
    // The furthest PV reaches in the step direction.
    let extreme = pre;
    for (let i = 0; i < n; i++) {
      if (dir * yw[i]! > dir * extreme) extreme = yw[i]!;
    }
    // Overshoot is how far `extreme` passes `reference`, as a fraction of step.
    overshootPct = Math.max(0, (dir * (extreme - reference)) / Math.abs(step)) * 100;
  }

  // Rise time: 10% -> 90% of the step, only meaningful with a real step.
  let riseTime: number | null = null;
  if (Math.abs(step) >= 1e-9) {
    const y10 = pre + 0.1 * step;
    const y90 = pre + 0.9 * step;
    const cross = (target: number): number | null => {
      for (let i = 1; i < n; i++) {
        const a = yw[i - 1]!, b = yw[i]!;
        if ((a - target) * (b - target) <= 0 && a !== b) {
          const frac = (target - a) / (b - a);
          return tw[i - 1]! + frac * (tw[i]! - tw[i - 1]!);
        }
      }
      return null;
    };
    const c10 = cross(y10);
    const c90 = cross(y90);
    if (c10 !== null && c90 !== null && c90 >= c10) riseTime = c90 - c10;
  }

  // Settling time: last instant the PV is OUTSIDE the band; null when it never
  // enters and stays (honest "not settled").
  let lastExit: number | null = null;
  let everInside = false;
  for (let i = 0; i < n; i++) {
    if (Math.abs(err[i]!) <= bandHalf) everInside = true;
    else lastExit = tw[i]!;
  }
  // Settled iff it ends inside the band; the time is the last exit (rel. start).
  const endsInside = Math.abs(err[n - 1]!) <= bandHalf;
  const settlingTime = endsInside && everInside
    ? (lastExit === null ? 0 : lastExit - t0)
    : null;

  // Peaks -> decay ratio + period + damping verdict.
  const peaks = errorPeaks(tw, yw, reference);
  // Keep only the same-sign overshoot peaks (the ones that ring on one side)
  // for a stable decay-ratio reading; otherwise use successive |err| maxima.
  const absPeaks = peaks.map((p) => ({ t: p.t, a: Math.abs(p.err) }))
    .filter((p) => p.a > bandHalf * 0.25); // ignore numerical jitter near band
  let decayRatio: number | null = null;
  let period: number | null = null;
  if (absPeaks.length >= 2) {
    decayRatio = absPeaks[1]!.a / (absPeaks[0]!.a || 1);
    period = absPeaks[1]!.t - absPeaks[0]!.t;
  }

  const dampingVerdict = classifyDamping(absPeaks.map((p) => p.a), decayRatio, overshootPct);

  return {
    reference, pvStart, pvEnd, peak, overshootPct, riseTime, settlingTime,
    steadyStateOffset: reference - pvEnd,
    iae, ise, decayRatio, period, dampingVerdict, n,
  };
}

/** Damping verdict from the overshoot-peak envelope.
 *  - no peaks (monotone approach)          -> over / critically damped
 *  - decaying peaks                        -> under-damped
 *  - roughly constant peaks (decay ~ 1)    -> sustained-oscillation
 *  - growing peaks (decay > 1)             -> unstable */
export function classifyDamping(
  peakAmps: number[],
  decayRatio: number | null,
  overshootPct: number | null,
): DampingVerdict {
  if (peakAmps.length === 0) {
    // No ringing.  A tiny overshoot is still "under" if it overshot at all.
    return overshootPct !== null && overshootPct > 2 ? "under-damped" : "over-damped";
  }
  if (peakAmps.length === 1) {
    return overshootPct !== null && overshootPct < 1 ? "critically-damped" : "under-damped";
  }
  if (decayRatio === null) return "under-damped";
  if (decayRatio > 1.15) return "unstable";
  if (decayRatio > 0.85) return "sustained-oscillation";
  return "under-damped";
}

/** Format a metric verdict to a colour key the strip uses. */
export function dampingColor(v: DampingVerdict): string {
  switch (v) {
    case "over-damped":
    case "critically-damped": return "green";
    case "under-damped": return "yellow";
    case "sustained-oscillation": return "orange";
    case "unstable": return "red";
  }
}

/**
 * The disturbance windows of a Schedule step train: each step at t_k opens a
 * rejection window [t_k, t_{k+1}] (last step runs to tEnd).  The first step at
 * t=0 is the nominal startup (the Track window), the rest are Reject windows.
 */
export function disturbanceWindows(
  steps: { time: number; value: number }[],
  tEnd: number,
): { t0: number; t1: number; value: number }[] {
  const sorted = [...steps].sort((a, b) => a.time - b.time);
  const out: { t0: number; t1: number; value: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const t0 = sorted[i]!.time;
    const t1 = i + 1 < sorted.length ? sorted[i + 1]!.time : tEnd;
    out.push({ t0, t1, value: sorted[i]!.value });
  }
  return out;
}
