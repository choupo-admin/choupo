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
  Controller knobs -- the Control Room's sibling to variableKnobs.ts.

  collectControllerKnobs walks the flowsheet's `controllers (...)` list, finds
  the FIRST PID, and lifts its tunable scalars (Kp, Ki, Kd, setpoint) into a
  knob object the tuning rail drives.  The dict the student edits says
  `Kp; Ki; Kd;` -- those ARE the sliders (no units crutch on the hot path); the
  textbook interacting-form twin Kc / tauI / tauD is DERIVED from them
  (identity below) and printed beside the sliders, never the thing turned.

      Engine PID = ideal/parallel:  u = Kp*e + Ki*Integral(e) + Kd*de/dt
                                       (derivative-on-PV, see PIDController.cpp)

      Interacting-form equivalent (the textbook lens):
          Kc  = Kp
          tauI = Kp / Ki        (Ki -> 0  =>  tauI -> infinity, no integral)
          tauD = Kd / Kp        (Kp -> 0  =>  tauD undefined)

  applyTuning patches the in-memory flowsheet JSON via the indexed
  setScalarAtPath grammar the sweep driver uses (`controllers[i].gains.Kp`,
  `controllers[i].setpoint`) -- the SAME mutate-clone-rerun path WhatIfTab uses
  for operation scalars, but the WHOLE case runs (controllers kept in the loop).

  It also lifts the Schedule controller's step train (the FeedDist disturbance
  schedule) so the chart can draw the disturbance markers from the dict, never
  hard-coded.
\*---------------------------------------------------------------------------*/

import type { JsonValue } from "../dict/index.js";

/** The tunable scalars of one PID controller + its dict index. */
export interface ControllerKnobs {
  /** Index into the `controllers (...)` list (the path stem). */
  index: number;
  /** The controller's `name` (e.g. "TC1"). */
  name: string;
  kp: number;
  ki: number;
  kd: number;
  setpoint: number;
  /** Output clamp [min, max] if declared (the MV saturation the student SEES). */
  outMin?: number;
  outMax?: number;
  /** The `unit.cv` it measures and the `unit.mv` it drives (for the chart). */
  measure?: { unit: string; cv: string };
  actuate?: { unit: string; mv: string };
  /** Indexed setScalarAtPath targets for each tunable. */
  targetPaths: {
    kp: string;
    ki: string;
    kd: string;
    setpoint: string;
  };
}

/** One step of a Schedule controller's disturbance train. */
export interface ScheduleStep {
  time: number;
  value: number;
}
/** A Schedule controller lifted for the disturbance markers. */
export interface ScheduleKnobs {
  index: number;
  name: string;
  actuate?: { unit: string; mv: string };
  schedule: ScheduleStep[];
}

/* ----------------------------- the SIGNAL layer --------------------------- */

/** The forcing-function vocabulary (mirrors src/control/signal/Signals.{H,cpp}).
 *  `sinusoidal` is the dict alias the engine accepts for `sine`. */
export type SignalType = "step" | "staircase" | "ramp" | "pulse" | "sine";

/** Which numeric parameters each signal type reads from its `signal {}` block.
 *  These ARE the sliders -- one per knob, in the engine's own key spelling.
 *  (staircase is the schedule list, edited as steps, not scalar sliders.)   */
export const SIGNAL_PARAMS: { [K in SignalType]: readonly string[] } = {
  step: ["mean", "step", "tStep"],
  ramp: ["mean", "slope", "tStart", "tEnd"],
  pulse: ["mean", "amplitude", "tStart", "width"],
  sine: ["mean", "amplitude", "period", "phase", "tStart"],
  staircase: [],
};

/** The disturbance/forcing controller (a Signal, or a legacy Schedule read as a
 *  staircase signal).  Carries the signal TYPE, its current scalar params, the
 *  indexed setScalarAtPath targets per param, and -- for a Schedule -- the step
 *  train (so the markers + the staircase->Signal conversion both have it). */
export interface SignalKnobs {
  index: number;
  name: string;
  /** "Signal" (a `signal {}` block) or "Schedule" (a legacy staircase). */
  kind: "Signal" | "Schedule";
  /** The forcing shape.  A Schedule reads as "staircase". */
  type: SignalType;
  actuate?: { unit: string; mv: string };
  /** Current numeric value of each scalar param the type uses. */
  params: { [key: string]: number };
  /** Indexed setScalarAtPath target for each scalar param (Signal kind only). */
  targetPaths: { [key: string]: string };
  /** The staircase step train (Schedule kind, or a `signal{ type staircase }`). */
  schedule?: ScheduleStep[];
}

export interface ControllerLayer {
  /** The first PID controller, or null when none is present (gate the workspace). */
  pid: ControllerKnobs | null;
  /** Every Schedule controller (disturbance trains) for the chart markers. */
  schedules: ScheduleKnobs[];
  /** The disturbance/forcing controller (Signal or legacy Schedule), or null. */
  signal: SignalKnobs | null;
}

/** Sensible default value of a signal param when switching TO a type that the
 *  current block does not yet carry (so the rewritten block is runnable).  Seeds
 *  bias toward the inlet-T disturbance the ctrl tutorials force (mean ~320 K). */
export function defaultSignalParam(type: SignalType, key: string, mean: number): number {
  switch (key) {
    case "mean":      return mean;
    case "amplitude": return 15;
    case "step":      return -15;          // a 15 K cold step (deviation)
    case "tStep":     return 700;
    case "tStart":    return type === "sine" ? 0 : 700;
    case "tEnd":      return 0;            // 0 => "no saturation" (omit on write)
    case "slope":     return -0.02;        // K/s -- a slow cooling ramp
    case "width":     return 300;          // s
    case "period":    return 600;          // s
    case "phase":     return 0;            // rad
    default:          return 0;
  }
}

/* ----------------------------- the identity ------------------------------- */

/** Interacting-form twin of an ideal/parallel PID.  tauI = Kp/Ki (infinity at
 *  Ki=0); tauD = Kd/Kp (undefined at Kp=0).  Pure: the printed textbook lens. */
export function parallelToInteracting(
  kp: number, ki: number, kd: number,
): { kc: number; tauI: number; tauD: number } {
  return {
    kc: kp,
    tauI: ki === 0 ? Infinity : kp / ki,
    tauD: kp === 0 ? 0 : kd / kp,
  };
}

/** The inverse: load a textbook Kc / tauI / tauD (e.g. a Ziegler-Nichols row)
 *  back into the engine's parallel Kp / Ki / Kd.  Ki = Kc/tauI (0 when tauI is
 *  infinite); Kd = Kc*tauD. */
export function interactingToParallel(
  kc: number, tauI: number, tauD: number,
): { kp: number; ki: number; kd: number } {
  return {
    kp: kc,
    ki: !Number.isFinite(tauI) || tauI === 0 ? 0 : kc / tauI,
    kd: kc * tauD,
  };
}

/* --------------------------- the collector -------------------------------- */

function isObj(v: JsonValue | undefined): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Read a scalar that may be a bare number or a "<number> [unit]" string. */
function asNumber(v: JsonValue | undefined): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function portOf(v: JsonValue | undefined, keys: [string, string]): { unit: string; cv: string } | undefined {
  if (!isObj(v)) return undefined;
  const unit = v["unit"];
  const ch = v[keys[1]];
  if (typeof unit === "string" && typeof ch === "string") return { unit, cv: ch };
  return undefined;
}

/** Normalise the engine's signal-type spelling (`sinusoidal` -> `sine`). */
export function normaliseSignalType(t: string): SignalType {
  const s = t.trim().toLowerCase();
  if (s === "sinusoidal" || s === "sine") return "sine";
  if (s === "step" || s === "staircase" || s === "ramp" || s === "pulse") return s;
  return "step";
}

/** Read a Schedule controller's step train (shared by the schedule + signal lift). */
function readSchedule(raw: { [k: string]: JsonValue }): ScheduleStep[] {
  const sched = raw["schedule"];
  const steps: ScheduleStep[] = [];
  if (Array.isArray(sched)) {
    for (const s of sched) {
      if (!isObj(s)) continue;
      const time = asNumber(s["time"]);
      const value = asNumber(s["value"]);
      if (time !== undefined && value !== undefined) steps.push({ time, value });
    }
  }
  return steps;
}

/** Lift the `signal {}` block of a `type Signal` controller into a SignalKnobs. */
function liftSignal(raw: { [k: string]: JsonValue }, index: number, name: string): SignalKnobs | null {
  const sig = raw["signal"];
  if (!isObj(sig)) return null;
  const type = typeof sig["type"] === "string" ? normaliseSignalType(sig["type"] as string) : "step";
  const params: { [key: string]: number } = {};
  const targetPaths: { [key: string]: string } = {};
  for (const key of SIGNAL_PARAMS[type]) {
    const v = asNumber(sig[key]);
    // `frequency` is the period twin; surface period either way.
    if (v !== undefined) params[key] = v;
    targetPaths[key] = `controllers[${index}].signal.${key}`;
  }
  // A sine authored with `frequency` instead of `period`: derive the period.
  if (type === "sine" && params["period"] === undefined) {
    const f = asNumber(sig["frequency"]);
    if (f !== undefined && f > 0) {
      params["period"] = 1 / f;
      targetPaths["period"] = `controllers[${index}].signal.period`;
    }
  }
  const actuate = portOf(raw["actuator"], ["unit", "mv"]);
  return {
    index, name, kind: "Signal", type,
    actuate: actuate ? { unit: actuate.unit, mv: actuate.cv } : undefined,
    params, targetPaths,
    schedule: type === "staircase" ? readSchedule(sig) : undefined,
  };
}

/**
 * Walk a flowsheet's `controllers (...)` list and lift the PID + Schedule
 * controllers.  Returns { pid: null } when there is no PID (the workspace gate).
 */
export function collectControllerKnobs(
  flowsheetJson: JsonValue | undefined,
): ControllerLayer {
  if (!isObj(flowsheetJson)) return { pid: null, schedules: [], signal: null };
  const list = flowsheetJson["controllers"];
  if (!Array.isArray(list)) return { pid: null, schedules: [], signal: null };

  let pid: ControllerKnobs | null = null;
  let signal: SignalKnobs | null = null;
  const schedules: ScheduleKnobs[] = [];

  list.forEach((raw, index) => {
    if (!isObj(raw)) return;
    const type = typeof raw["type"] === "string" ? (raw["type"] as string) : "";
    const name = typeof raw["name"] === "string" ? (raw["name"] as string) : `controller${index}`;

    if (type === "PID" && pid === null) {
      const gains = raw["gains"];
      const kp = (isObj(gains) ? asNumber(gains["Kp"]) : undefined) ?? 0;
      const ki = (isObj(gains) ? asNumber(gains["Ki"]) : undefined) ?? 0;
      const kd = (isObj(gains) ? asNumber(gains["Kd"]) : undefined) ?? 0;
      const setpoint = asNumber(raw["setpoint"]) ?? 0;
      const out = raw["output"];
      const outMin = isObj(out) ? asNumber(out["min"]) : undefined;
      const outMax = isObj(out) ? asNumber(out["max"]) : undefined;
      const measure = portOf(raw["measurement"], ["unit", "cv"]);
      const actuateRaw = portOf(raw["actuator"], ["unit", "mv"]);
      pid = {
        index,
        name,
        kp, ki, kd, setpoint,
        outMin, outMax,
        measure,
        actuate: actuateRaw ? { unit: actuateRaw.unit, mv: actuateRaw.cv } : undefined,
        targetPaths: {
          kp: `controllers[${index}].gains.Kp`,
          ki: `controllers[${index}].gains.Ki`,
          kd: `controllers[${index}].gains.Kd`,
          setpoint: `controllers[${index}].setpoint`,
        },
      };
    } else if (type === "Schedule") {
      const steps = readSchedule(raw);
      const actuateRaw = portOf(raw["actuator"], ["unit", "mv"]);
      const actuate = actuateRaw ? { unit: actuateRaw.unit, mv: actuateRaw.cv } : undefined;
      schedules.push({ index, name, actuate, schedule: steps });
      // The FIRST Schedule is also the disturbance source (a staircase signal):
      // the picker offers to convert it to a Signal, keeping the train as the
      // staircase fallback.  Its scalar `mean` is the first step's value.
      if (signal === null) {
        signal = {
          index, name, kind: "Schedule", type: "staircase", actuate,
          params: { mean: steps[0]?.value ?? 0 },
          targetPaths: {},
          schedule: steps,
        };
      }
    } else if (type === "Signal" && signal === null) {
      signal = liftSignal(raw, index, name);
    }
  });

  return { pid, schedules, signal };
}

/* ----------------------------- applyTuning -------------------------------- */

/** A subset of the four tunables to patch (undefined => leave as authored). */
export interface TuningPatch {
  kp?: number;
  ki?: number;
  kd?: number;
  setpoint?: number;
}

/**
 * Return a NEW flowsheet JSON with the PID's gains/setpoint replaced.  Pure --
 * the input is not mutated (the WhatIf pattern: clone, edit, run).  Uses the
 * controller index from `knobs` so the path always matches the authored list.
 */
export function applyTuning(
  flowsheetJson: JsonValue,
  knobs: ControllerKnobs,
  patch: TuningPatch,
): JsonValue {
  if (!isObj(flowsheetJson)) return flowsheetJson;
  const list = flowsheetJson["controllers"];
  if (!Array.isArray(list)) return flowsheetJson;

  const nextList = list.map((raw, i) => {
    if (i !== knobs.index || !isObj(raw)) return raw;
    const gains = isObj(raw["gains"]) ? { ...(raw["gains"] as { [k: string]: JsonValue }) } : {};
    if (patch.kp !== undefined) gains["Kp"] = patch.kp;
    if (patch.ki !== undefined) gains["Ki"] = patch.ki;
    if (patch.kd !== undefined) gains["Kd"] = patch.kd;
    const next: { [k: string]: JsonValue } = { ...raw, gains };
    if (patch.setpoint !== undefined) next["setpoint"] = patch.setpoint;
    return next;
  });

  return { ...flowsheetJson, controllers: nextList };
}

/* ----------------------------- applySignal -------------------------------- */

/** The engine's dict spelling for a signal type (`sine` -> `sinusoidal`, the
 *  spelling the tutorials author). */
function engineSignalType(t: SignalType): string {
  return t === "sine" ? "sinusoidal" : t;
}

/** Rebuild a `signal {}` sub-dict for a chosen type from a param bag.  Only the
 *  keys the type uses are written (the engine rejects extras / over-spec, e.g.
 *  sine wants `period` XOR `frequency`); a zero `tEnd` (== "no saturation") is
 *  omitted so the ramp default holds. */
function buildSignalBlock(
  type: SignalType, params: { [k: string]: number }, mean: number,
): { [k: string]: JsonValue } {
  const block: { [k: string]: JsonValue } = { type: engineSignalType(type) };
  for (const key of SIGNAL_PARAMS[type]) {
    const v = params[key] ?? defaultSignalParam(type, key, mean);
    if (key === "tEnd" && (!Number.isFinite(v) || v <= 0)) continue; // omit "no end"
    block[key] = v;
  }
  return block;
}

/**
 * Return a NEW flowsheet JSON with the disturbance controller's `signal {}`
 * block patched (scalar param changes within the SAME type).  Pure clone-edit.
 * For a legacy Schedule (kind "Schedule"), this is a no-op on its block unless
 * the type has been converted -- use applySignalType for that.
 */
export function applySignal(
  flowsheetJson: JsonValue,
  knobs: SignalKnobs,
  patch: { [key: string]: number },
): JsonValue {
  if (!isObj(flowsheetJson)) return flowsheetJson;
  const list = flowsheetJson["controllers"];
  if (!Array.isArray(list)) return flowsheetJson;

  const nextList = list.map((raw, i) => {
    if (i !== knobs.index || !isObj(raw)) return raw;
    const sig = isObj(raw["signal"]) ? { ...(raw["signal"] as { [k: string]: JsonValue }) } : {};
    for (const [k, v] of Object.entries(patch)) {
      if (SIGNAL_PARAMS[knobs.type].includes(k)) sig[k] = v;
    }
    // A sine patched on `period` must drop any authored `frequency` twin (the
    // engine cross-rejects both).
    if (knobs.type === "sine" && patch["period"] !== undefined && "frequency" in sig) {
      delete sig["frequency"];
    }
    return { ...raw, signal: sig };
  });

  return { ...flowsheetJson, controllers: nextList };
}

/**
 * Return a NEW flowsheet JSON with the disturbance controller REWRITTEN as a
 * `type Signal` with the chosen forcing TYPE and a fresh `signal {}` block.
 * Converting a legacy `type Schedule` keeps its actuator + name (its staircase
 * train is preserved when staying staircase, else replaced).  Pure clone-edit.
 */
export function applySignalType(
  flowsheetJson: JsonValue,
  knobs: SignalKnobs,
  nextType: SignalType,
  params: { [key: string]: number },
): JsonValue {
  if (!isObj(flowsheetJson)) return flowsheetJson;
  const list = flowsheetJson["controllers"];
  if (!Array.isArray(list)) return flowsheetJson;
  const mean = params["mean"] ?? knobs.params["mean"] ?? 0;

  const nextList = list.map((raw, i) => {
    if (i !== knobs.index || !isObj(raw)) return raw;
    const next: { [k: string]: JsonValue } = { ...raw, type: "Signal" };
    if (nextType === "staircase") {
      // Keep the staircase as a `signal { type staircase; schedule (...); }`.
      const schedule = (knobs.schedule ?? []).map((s) => ({ time: s.time, value: s.value }));
      next["signal"] = { type: "staircase", schedule: schedule as unknown as JsonValue };
      delete next["schedule"]; // a converted Schedule no longer carries a top-level train
    } else {
      next["signal"] = buildSignalBlock(nextType, params, mean);
      delete next["schedule"];
    }
    return next;
  });

  return { ...flowsheetJson, controllers: nextList };
}

/* ------------------------- the forced-response (Bode) --------------------- */

/** One Bode point read off a forced sinusoidal response: the output amplitude,
 *  the amplitude ratio in dB (20·log10(A_out/A_in)), and the phase lag. */
export interface BodePoint {
  /** Input (forcing) amplitude A_in. */
  aIn: number;
  /** Output (PV) amplitude A_out, half the steady peak-to-peak. */
  aOut: number;
  /** Amplitude ratio A_out / A_in (linear). */
  ratio: number;
  /** Amplitude ratio in decibels: 20·log10(ratio). */
  ratioDb: number;
  /** Forcing angular frequency omega = 2π/period [rad/s]. */
  omega: number;
  /** Phase lag of the PV behind the input [degrees], in [-180, 180]. */
  phaseLagDeg: number;
}

/**
 * Read ONE point of the closed loop's frequency response from a forced
 * sinusoidal PV trace.  A_out is half the peak-to-peak of the PV over the LAST
 * full period (the settled cycle, after the startup transient).  The phase lag
 * is the time offset between the input sine's peak and the PV's peak in that
 * window, wrapped to (-180, 180] degrees.  Pure -- no plotting.
 *
 *   aIn      forcing amplitude (the sine's `amplitude` param)
 *   period   forcing period [s]
 *   tStart   forcing onset [s] (the sine's phase origin)
 *   phase    forcing phase [rad]
 */
export function bodePoint(
  t: number[], pv: number[], aIn: number, period: number,
  tStart = 0, phase = 0,
): BodePoint | null {
  if (t.length < 4 || pv.length !== t.length || !(period > 0)) return null;
  const tEnd = t[t.length - 1]!;
  // Settle window = the LAST full period of the trace (skip the transient).
  const wStart = Math.max(tStart, tEnd - period);
  const idx: number[] = [];
  for (let i = 0; i < t.length; i++) if (t[i]! >= wStart - 1e-9) idx.push(i);
  if (idx.length < 3) return null;

  let pvMin = Infinity, pvMax = -Infinity, iMax = idx[0]!;
  for (const i of idx) {
    const y = pv[i]!;
    if (y < pvMin) pvMin = y;
    if (y > pvMax) { pvMax = y; iMax = i; }
  }
  const aOut = (pvMax - pvMin) / 2;
  const omega = (2 * Math.PI) / period;

  // The forcing input value(t) = mean + aIn·sin(2π(t-tStart)/period + phase);
  // its peak is where the sine argument = π/2.  Find that input-peak time
  // nearest the PV peak's window, then phase lag = (t_pvPeak - t_inPeak)·omega.
  const tPvPeak = t[iMax]!;
  // input peak times: arg = π/2 + 2πk  =>  t = tStart + (π/2 - phase)/omega + k·period
  const base = tStart + (Math.PI / 2 - phase) / omega;
  const k = Math.round((tPvPeak - base) / period);
  const tInPeak = base + k * period;
  let lagRad = (tPvPeak - tInPeak) * omega;
  // wrap to (-π, π]; a positive lag means the PV peaks AFTER the input (a lag).
  lagRad = ((lagRad % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  // Convention: report phase LAG as a negative angle (output lags input).
  const phaseLagDeg = (lagRad * 180) / Math.PI;

  const ratio = aIn > 0 ? aOut / aIn : NaN;
  const ratioDb = ratio > 0 ? 20 * Math.log10(ratio) : NaN;
  return { aIn, aOut, ratio, ratioDb, omega, phaseLagDeg };
}
