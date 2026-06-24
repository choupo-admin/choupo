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

export interface ControllerLayer {
  /** The first PID controller, or null when none is present (gate the workspace). */
  pid: ControllerKnobs | null;
  /** Every Schedule controller (disturbance trains) for the chart markers. */
  schedules: ScheduleKnobs[];
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

/**
 * Walk a flowsheet's `controllers (...)` list and lift the PID + Schedule
 * controllers.  Returns { pid: null } when there is no PID (the workspace gate).
 */
export function collectControllerKnobs(
  flowsheetJson: JsonValue | undefined,
): ControllerLayer {
  if (!isObj(flowsheetJson)) return { pid: null, schedules: [] };
  const list = flowsheetJson["controllers"];
  if (!Array.isArray(list)) return { pid: null, schedules: [] };

  let pid: ControllerKnobs | null = null;
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
      const actuateRaw = portOf(raw["actuator"], ["unit", "mv"]);
      schedules.push({
        index, name,
        actuate: actuateRaw ? { unit: actuateRaw.unit, mv: actuateRaw.cv } : undefined,
        schedule: steps,
      });
    }
  });

  return { pid, schedules };
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
