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
  dynamicInstants -- parse the OpenFOAM-style real-time TIME DIRECTORIES the
  time-integrated binaries (choupoBatch / choupoCtrl / choupoSemiContinuous)
  write at the case root, every writeInterval, by default (task #186,
  2026-09-30; `solutionControl { write false; }` turns them off).

  A time directory `<t>/` has EXACTLY the layout of `0/` -- the ratified state
  layout the steady path uses:

    <t>/<stream>                  ONE file per stream, the canonical stream
                                  grammar (componentMolarFlows + T + P)
    <t>/internalStates/<unit>     ONE file per vessel, `recordType
                                  internalState;` with a `holdup {}` block
                                  (T, P, V, holdupMolar{} or totalMoles +
                                  molarComposition{}, extras{})

  The worker harvests these files verbatim from MEMFS (keyed by their path
  relative to the case root, e.g. "500/internalStates/reactor", "500/feed");
  this module parses them into a time-ordered structure the TimeScrubber and
  the canvas overlay render.  A stream file is read by the SAME function the
  canvas reads a `0/<stream>` with (`streamStateSpec`), so a stream at t and a
  stream at 0 cannot be two readings of one grammar.  The retired shape
  (`<t>/internalState`, `<t>/streamFaces`) is NOT read -- there is no dual
  reader, exactly as in the engine.

  Self-contained + pure: no I/O, no state.  Returns null when nothing parses
  (a steady run, or a run with `write false;`) so callers can gate the
  scrubber on truthiness.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";
import type { JsonDict, JsonValue } from "../dict/index.js";
import { scalarToSI } from "../dict/scalarSI.js";
import { streamStateSpec } from "./toGraph.js";

/** One vessel's holdup state at one instant. */
export interface InstantUnit {
  name: string;
  /** The equipment word the record declares. */
  type: string;
  /** Holdup temperature [K]. */
  T: number;
  /** Holdup pressure [Pa]. */
  P: number;
  /** Vessel volume [m^3], when the record carries one. */
  V?: number;
  /** Mole inventory n_i [kmol] keyed by component name, in record order. */
  holdupMolar: { [component: string]: number };
  /** Per-unit extras (conversion, supersaturation, T_jacket, ...). */
  extras?: { [key: string]: number };
  /** What the record says it does NOT carry (not a restart point), if any. */
  notRestored?: string;
}

/** One stream's state at one instant -- its own file, named by the stream. */
export interface InstantStream {
  name: string;
  /** Total molar flow [kmol/s]. */
  F: number;
  T: number;
  P: number;
  /** Per-component molar flows [kmol/s]. */
  molarFlows: { [component: string]: number };
}

/** The state of the whole flowsheet at one written physical time. */
export interface DynamicInstant {
  /** Physical time [s]. */
  t: number;
  /** The directory name as written ("0", "50", "500", ...). */
  dir: string;
  units: InstantUnit[];
  streams: InstantStream[];
}

/** Every written instant, time-ordered, plus the component list (union over
 *  all instants, first-seen order) for stable table columns. */
export interface DynamicInstants {
  application: string;        // "batch" | "ctrl"  (the ctrl word also covers choupoSemiContinuous: same driver, same layout)
  components: string[];
  instants: DynamicInstant[];
}

const HOLDUP_ROOT = "internalStates";

function isDict(v: JsonValue | undefined): v is JsonDict {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** A "<key> <number [unit]>;" sub-dict -> an SI numeric map, dropping
 *  non-finite cells. */
function numericMap(j: JsonValue | undefined): { [k: string]: number } {
  const out: { [k: string]: number } = {};
  if (!isDict(j)) return out;
  for (const [k, v] of Object.entries(j)) {
    const n = scalarToSI(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Parse one `<t>/internalStates/<unit>` record.  Null when it is not a
 *  holdup record (a steady unit's profile, a malformed file). */
function parseHoldup(unitName: string, text: string): InstantUnit | null {
  let json: JsonDict;
  try {
    json = toJson(parse(text, { sourceName: "internalStates" })) as JsonDict;
  } catch {
    return null;
  }
  const h = json["holdup"];
  if (!isDict(h)) return null;
  const T = scalarToSI(h["T"]);
  const P = scalarToSI(h["P"]);
  if (!Number.isFinite(T) || !Number.isFinite(P)) return null;
  // The inventory is stated ONCE, in either spelling the engine reads.
  let holdupMolar = numericMap(h["holdupMolar"]);
  if (Object.keys(holdupMolar).length === 0) {
    const n = scalarToSI(h["totalMoles"]);
    const x = numericMap(h["molarComposition"]);
    holdupMolar = {};
    if (Number.isFinite(n)) for (const [c, xi] of Object.entries(x)) holdupMolar[c] = n * xi;
  }
  const unit: InstantUnit = {
    name: typeof json["unit"] === "string" ? (json["unit"] as string) : unitName,
    type: typeof json["equipment"] === "string" ? (json["equipment"] as string) : "?",
    T,
    P,
    holdupMolar,
  };
  const V = scalarToSI(h["V"]);
  if (Number.isFinite(V)) unit.V = V;
  const extras = numericMap(h["extras"]);
  if (Object.keys(extras).length > 0) unit.extras = extras;
  if (typeof h["notRestored"] === "string") unit.notRestored = h["notRestored"] as string;
  return unit;
}

/** Parse one `<t>/<stream>` file through the canvas's own stream reader. */
function parseStream(name: string, text: string): InstantStream | null {
  const spec = streamStateSpec(text);
  if (!spec) return null;
  const molarFlows: { [c: string]: number } = {};
  for (const [c, z] of Object.entries(spec.composition)) molarFlows[c] = z * spec.F;
  return { name, F: spec.F, T: spec.T, P: spec.P, molarFlows };
}

/**
 * Parse the harvested time-directory files into a time-ordered
 * DynamicInstants.
 *
 * `files` keys are paths relative to the case root, exactly as the worker
 * harvested them from MEMFS:
 *     { "50/internalStates/reactor": "...", "50/feed": "...", ... }
 *
 * Only paths whose FIRST segment is a number (a time directory) are read, so
 * the same generic file bag can be passed in safely.  An instant is kept when
 * at least one of its files parses.  Returns null when none does.
 */
export function parseDynamicInstants(
  files: { [relPath: string]: string },
): DynamicInstants | null {
  const byDir = new Map<string, DynamicInstant>();
  const instantOf = (dir: string): DynamicInstant => {
    let inst = byDir.get(dir);
    if (!inst) {
      inst = { t: parseFloat(dir), dir, units: [], streams: [] };
      byDir.set(dir, inst);
    }
    return inst;
  };
  for (const rel of Object.keys(files).sort()) {
    const parts = rel.split("/");
    const dir = parts[0]!;
    if (parts.length < 2 || !/^[0-9]+(\.[0-9]+)?$/.test(dir)) continue;
    const text = files[rel]!;
    if (parts[1] === HOLDUP_ROOT) {
      if (parts.length !== 3) continue;          // a time-integrated case is flat
      const u = parseHoldup(parts[2]!, text);
      if (u) instantOf(dir).units.push(u);
    } else if (parts.length === 2) {
      const s = parseStream(parts[1]!, text);
      if (s) instantOf(dir).streams.push(s);
    }
  }
  if (byDir.size === 0) return null;

  // Time-order the instants (numeric, not lexical -- "100" sorts after "50").
  const instants = [...byDir.values()]
    .filter((i) => Number.isFinite(i.t))
    .sort((a, b) => a.t - b.t);
  if (instants.length === 0) return null;

  // Application: inferred from the equipment words (batch* -> batch).
  const types = instants.flatMap((i) => i.units.map((u) => u.type));
  const application = types.some((tp) => tp.startsWith("batch")) ? "batch" : "ctrl";

  // Component union, first-seen order (stable table columns).
  const seen = new Set<string>();
  const components: string[] = [];
  const see = (c: string) => { if (!seen.has(c)) { seen.add(c); components.push(c); } };
  for (const inst of instants) {
    for (const u of inst.units) Object.keys(u.holdupMolar).forEach(see);
    for (const s of inst.streams) Object.keys(s.molarFlows).forEach(see);
  }

  return { application, components, instants };
}
