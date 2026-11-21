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
  faultSignals -- the four TIME SIGNATURES a fault leaves in a signal (a
  step, a drift, an oscillation, plain noise), a generator for each, and the
  small classifier that tells them apart (DEV.md 4c C464, the `fault-
  diagnosis` EduTool).

  The classifier is deliberately the simplest one that works, and the page
  shows its three numbers: how much of the signal's variance a straight line
  explains, how much a single step explains, and how strongly what is left
  repeats itself (its autocorrelation peak, and the period of that peak).
  Pure TypeScript; tests/faultDiagnosis.test.ts holds its accuracy on seeded
  signals and pins the three numbers on named examples.
\*---------------------------------------------------------------------------*/

import { gaussian, linearFit, mean, mulberry32 } from "./faultDiagnosisMath.js";

export type Signature = "noise" | "step" | "drift" | "oscillation";

export interface SignalOptions {
  n: number;
  dt: number;        // sample interval, any unit
  seed: number;
  noise: number;     // standard deviation of the noise
  size?: number;     // step height, or the drift's total change over the record
  at?: number;       // fraction of the record at which a step happens
  amp?: number;      // oscillation amplitude
  period?: number;   // oscillation period, in the unit of dt
}

export function makeSignal(kind: Signature, o: SignalOptions): number[] {
  const rng = mulberry32(o.seed);
  const y: number[] = [];
  for (let k = 0; k < o.n; k++) {
    let v = 0;
    if (kind === "step") v = k >= Math.floor((o.at ?? 0.5) * o.n) ? (o.size ?? 0) : 0;
    if (kind === "drift") v = ((o.size ?? 0) * k) / (o.n - 1);
    if (kind === "oscillation") v = (o.amp ?? 0) * Math.sin((2 * Math.PI * k * o.dt) / (o.period ?? 1));
    y.push(v + o.noise * gaussian(rng));
  }
  return y;
}

export interface SignatureReport {
  kind: Signature;
  /** share of the variance a straight line explains */
  r2Line: number;
  /** share of the variance one step (two levels) explains */
  r2Step: number;
  /** where the best step falls, as a sample index */
  stepAt: number;
  /** the strongest autocorrelation of what the best model leaves */
  peak: number;
  /** the lag of that peak in samples times dt: the period */
  period: number;
}

/** Sum of squares about the mean. */
const sst = (y: readonly number[]): number => {
  const m = mean(y);
  return y.reduce((s, v) => s + (v - m) ** 2, 0);
};

/** The best single step: the split with the least within-group sum of squares. */
function bestStep(y: readonly number[]): { at: number; sse: number; resid: number[] } {
  const n = y.length;
  let best = { at: Math.floor(n / 2), sse: Infinity };
  const lo = Math.max(3, Math.floor(0.05 * n));
  for (let k = lo; k <= n - lo; k++) {
    const a = y.slice(0, k);
    const b = y.slice(k);
    const sse = sst(a) + sst(b);
    if (sse < best.sse) best = { at: k, sse };
  }
  const ma = mean(y.slice(0, best.at));
  const mb = mean(y.slice(best.at));
  return { ...best, resid: y.map((v, i) => v - (i < best.at ? ma : mb)) };
}

/** Autocorrelation of a zero-mean-ish series at lags 1..n/2: the first peak
 *  after the first zero crossing (what a repeating shape does and noise,
 *  a step or a drift does not). */
function acfPeak(r: readonly number[]): { peak: number; lag: number } {
  const n = r.length;
  const m = mean(r);
  const d = r.map((v) => v - m);
  const c0 = d.reduce((s, v) => s + v * v, 0);
  const acf: number[] = [1];
  for (let L = 1; L <= Math.floor(n / 2); L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += d[i]! * d[i + L]!;
    acf.push(s / c0);
  }
  let k = 1;
  while (k < acf.length && acf[k]! > 0) k++;
  let peak = 0;
  let lag = 0;
  for (let L = k; L < acf.length - 1; L++) {
    if (acf[L]! > acf[L - 1]! && acf[L]! >= acf[L + 1]! && acf[L]! > peak) { peak = acf[L]!; lag = L; break; }
  }
  return { peak, lag };
}

export function classifySignature(y: readonly number[], dt: number): SignatureReport {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const total = sst(y);
  const line = linearFit(x, y);
  const lineResid = y.map((v, i) => v - line.a - line.b * i);
  const sseLine = lineResid.reduce((s, v) => s + v * v, 0);
  const step = bestStep(y);
  const r2Line = 1 - sseLine / total;
  const r2Step = 1 - step.sse / total;
  const resid = r2Step > r2Line ? step.resid : lineResid;
  const { peak, lag } = acfPeak(resid);
  const cycles = lag > 0 ? n / lag : 0;
  let kind: Signature = "noise";
  if (peak > 0.45 && cycles >= 2.5) kind = "oscillation";
  else if (Math.max(r2Line, r2Step) > 0.35) kind = r2Step > r2Line ? "step" : "drift";
  return { kind, r2Line, r2Step, stepAt: step.at, peak, period: lag * dt };
}
