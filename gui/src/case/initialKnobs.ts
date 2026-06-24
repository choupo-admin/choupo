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
  Initial-condition knobs -- the Control Room's sibling to controllerKnobs.ts.

  collectInitialKnobs walks the flowsheet's `units (...)` list, finds the FIRST
  dynamic-holdup unit (a dynamicCSTR), and lifts its `initial{}` block (T0, the
  vessel volume V0, and the seed composition) into a knob object the Control
  Room's "Initial conditions" rail drives.  The dict the student edits says
  `initial { T; V; molarComposition {...}; }` -- those ARE the sliders.

  applyInitial patches the in-memory flowsheet JSON via the indexed
  setScalarAtPath grammar (`units[i].initial.T`, `units[i].initial.V`,
  `units[i].initial.molarComposition.<comp>`) -- the SAME mutate-clone-rerun
  path applyTuning uses for the controller gains, so a gain change and a start
  change compose in one run (buildFiles layers both).  PURE: the input is never
  mutated (clone, edit, run).

  WHY: the SAME attractor, a different transient.  Overlaying a cold start vs a
  near-steady start SHOWS initial-condition sensitivity -- the thing a black-box
  tool hides.  Nothing writes back to disk (the honesty banner is unchanged).
\*---------------------------------------------------------------------------*/

import type { JsonValue } from "../dict/index.js";
import { scalarToSI } from "../dict/scalarSI.js";
// The set of dynamic-holdup unit types that carry an `initial{}` block.  Shared
// with toGraph's edge synthesis so the two agree on which units are dynamic.
import { DYNAMIC_HOLDUP_TYPES } from "./dutyTypes.js";

/** One dynamic unit's initial-condition scalars + its dict index. */
export interface InitialKnobs {
  /** Index into the `units (...)` list (the path stem). */
  index: number;
  /** The unit's `name` (e.g. "reactor"). */
  name: string;
  /** Initial holdup temperature [K] (SI-canonical). */
  t0: number;
  /** Initial vessel volume [m^3], when declared. */
  v0?: number;
  /** Initial total moles [kmol], when declared. */
  totalMoles?: number;
  /** Seed composition (mole fractions), component -> fraction. */
  composition: { [component: string]: number };
  /** Indexed setScalarAtPath targets for each tunable. */
  targetPaths: {
    t0: string;
    v0: string;
    totalMoles: string;
    /** `units[i].initial.molarComposition` (per-component path = `<this>.<comp>`). */
    composition: string;
  };
}

/* --------------------------- the collector -------------------------------- */

function isObj(v: JsonValue | undefined): v is { [k: string]: JsonValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walk a flowsheet's `units (...)` list and lift the FIRST dynamic-holdup
 * unit's `initial{}` block.  Returns null when there is no such unit / block
 * (so the rail group can gate on it).
 */
export function collectInitialKnobs(
  flowsheetJson: JsonValue | undefined,
): InitialKnobs | null {
  if (!isObj(flowsheetJson)) return null;
  const list = flowsheetJson["units"];
  if (!Array.isArray(list)) return null;

  for (let index = 0; index < list.length; index++) {
    const raw = list[index];
    if (!isObj(raw)) continue;
    const type = typeof raw["type"] === "string" ? (raw["type"] as string) : "";
    if (!DYNAMIC_HOLDUP_TYPES.has(type)) continue;
    const initial = raw["initial"];
    if (!isObj(initial)) continue;

    const name = typeof raw["name"] === "string" ? (raw["name"] as string) : `unit${index}`;
    const t0raw = scalarToSI(initial["T"]);
    const t0 = Number.isFinite(t0raw) ? t0raw : 0;
    const v0raw = scalarToSI(initial["V"]);
    const v0 = Number.isFinite(v0raw) ? v0raw : undefined;
    const tmRaw = scalarToSI(initial["totalMoles"]);
    const totalMoles = Number.isFinite(tmRaw) ? tmRaw : undefined;

    const composition: { [k: string]: number } = {};
    const comp = initial["molarComposition"] ?? initial["composition"];
    if (isObj(comp)) {
      for (const [k, v] of Object.entries(comp)) {
        const n = scalarToSI(v);
        if (Number.isFinite(n)) composition[k] = n;
      }
    }

    return {
      index,
      name,
      t0,
      v0,
      totalMoles,
      composition,
      targetPaths: {
        t0: `units[${index}].initial.T`,
        v0: `units[${index}].initial.V`,
        totalMoles: `units[${index}].initial.totalMoles`,
        composition: `units[${index}].initial.molarComposition`,
      },
    };
  }
  return null;
}

/* ----------------------------- applyInitial ------------------------------- */

/** A subset of the initial scalars to patch (undefined => leave as authored).
 *  `composition` is the FULL replacement map for the seed composition. */
export interface InitialPatch {
  t0?: number;
  v0?: number;
  totalMoles?: number;
  composition?: { [component: string]: number };
}

/**
 * Return a NEW flowsheet JSON with the dynamic unit's initial{} scalars
 * replaced.  Pure -- the input is not mutated (the WhatIf pattern: clone,
 * edit, run).  Uses the unit index from `knobs` so the path always matches the
 * authored list.  T0 is written as a raw SI number (the engine's unit parser
 * accepts a bare number as canonical SI), so the round-trip stays glass-box.
 */
export function applyInitial(
  flowsheetJson: JsonValue,
  knobs: InitialKnobs,
  patch: InitialPatch,
): JsonValue {
  if (!isObj(flowsheetJson)) return flowsheetJson;
  const list = flowsheetJson["units"];
  if (!Array.isArray(list)) return flowsheetJson;

  const nextList = list.map((raw, i) => {
    if (i !== knobs.index || !isObj(raw)) return raw;
    const initial = isObj(raw["initial"]) ? { ...(raw["initial"] as { [k: string]: JsonValue }) } : {};
    if (patch.t0 !== undefined) initial["T"] = patch.t0;
    if (patch.v0 !== undefined) initial["V"] = patch.v0;
    if (patch.totalMoles !== undefined) initial["totalMoles"] = patch.totalMoles;
    if (patch.composition !== undefined) {
      const comp: { [k: string]: JsonValue } = {};
      for (const [k, v] of Object.entries(patch.composition)) comp[k] = v;
      // Write under whichever key the unit already used (molarComposition by
      // convention); default to molarComposition for a freshly-seeded block.
      const key = isObj(initial["composition"]) && !isObj(initial["molarComposition"])
        ? "composition" : "molarComposition";
      initial[key] = comp;
    }
    return { ...raw, initial };
  });

  return { ...flowsheetJson, units: nextList };
}
