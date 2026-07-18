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
  dynamicInstants -- parse the OpenFOAM-style real-time INSTANT directories the
  dynamic binaries (choupoBatch / choupoCtrl) write at the case root when
  `controlDict.solutionControl { write true; }` is on.

  Each written physical time `t` (s) is a directory `<t>/` carrying:

    <t>/internalState   the HOLDUP truth, a Choupo dict:
                          time, application, units { "<name>" { type T P [V]
                          holdupMolar{ <comp> ... } [extras{ <k> ... }] } }
    <t>/streamFaces     (continuous units only) the instantaneous outlet faces:
                          time, faces { "<name>.out" { T P vf molarFlows{...} } }

  The worker harvests these files verbatim from MEMFS (keyed by their path
  relative to the case root, e.g. "500/internalState"); this module parses
  them into a time-ordered structure the TimeScrubber renders.  We reuse the
  engine's OWN dict tokenizer (`parse` + `toJson`) so the parse matches the C++
  reader byte-for-byte -- never JSON, never a regex over the body.

  Self-contained + pure: no I/O, no state.  Returns null when nothing parses
  (a steady run, an older binary, a solutionControl-off case) so callers can
  gate the scrubber on truthiness.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";
import type { JsonDict, JsonValue } from "../dict/index.js";

/** One unit's holdup state at one instant. */
export interface InstantUnit {
  name: string;
  type: string;
  /** Holdup temperature [K]. */
  T: number;
  /** Holdup pressure [Pa]. */
  P: number;
  /** Vessel volume [m^3], when the unit exposes one (batch reactors). */
  V?: number;
  /** Mole inventory n_i [kmol] keyed by component name, in dict order. */
  holdupMolar: { [component: string]: number };
  /** Per-unit extras (conversion, supersaturation, ...) when present. */
  extras?: { [key: string]: number };
  /** Instantaneous outlet face (continuous units only): F_i [kmol/s]. */
  outletMolarFlows?: { [component: string]: number };
  /** Outlet temperature [K] (continuous units only). */
  outletT?: number;
  /** Outlet vapour fraction [-] (continuous units only) -- drives the edge
   *  phase colour at the scrubbed time. */
  outletVf?: number;
  /** Instantaneous INLET face (continuous units only): F_i [kmol/s].  Present
   *  only once the engine writes a `<name>.feed` stream; absent on older runs,
   *  in which case the GUI falls back to the nominal inlet{} from the dict. */
  inletMolarFlows?: { [component: string]: number };
  /** Inlet temperature [K] -- the disturbance a controller drives. */
  inletT?: number;
}

/** The state of the whole flowsheet at one written physical time. */
export interface DynamicInstant {
  /** Physical time [s]. */
  t: number;
  /** The directory name as written ("0", "50", "500", ...). */
  dir: string;
  units: InstantUnit[];
}

/** Every written instant, time-ordered, plus the component list (union over
 *  all instants, first-seen order) for stable table columns. */
export interface DynamicInstants {
  application: string;        // "batch" | "ctrl"
  components: string[];
  instants: DynamicInstant[];
}

function asNum(v: JsonValue | undefined): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** A "<comp> <number>;" sub-dict -> a numeric map, dropping non-finite cells. */
function numericMap(j: JsonValue | undefined): { [k: string]: number } {
  const out: { [k: string]: number } = {};
  if (!j || typeof j !== "object" || Array.isArray(j)) return out;
  for (const [k, v] of Object.entries(j as JsonDict)) {
    const n = asNum(v);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** Parse one `<t>/internalState` dict text into a DynamicInstant (sans
 *  outlet faces).  Returns null when the text is not a recognisable instant. */
function parseInternalState(dir: string, text: string): DynamicInstant | null {
  let json: JsonDict;
  try {
    json = toJson(parse(text));
  } catch {
    return null;
  }
  const unitsBlock = json["units"];
  if (!unitsBlock || typeof unitsBlock !== "object" || Array.isArray(unitsBlock)) {
    return null;
  }
  // The `time` field is the SI-canonical truth; fall back to the dir name.
  const t = asNum(json["time"]) ?? parseFloat(dir);
  if (!Number.isFinite(t)) return null;

  const units: InstantUnit[] = [];
  for (const [name, u] of Object.entries(unitsBlock as JsonDict)) {
    if (!u || typeof u !== "object" || Array.isArray(u)) continue;
    const ud = u as JsonDict;
    const T = asNum(ud["T"]);
    const P = asNum(ud["P"]);
    if (T === undefined || P === undefined) continue;
    const unit: InstantUnit = {
      name,
      type: typeof ud["type"] === "string" ? (ud["type"] as string) : "?",
      T,
      P,
      holdupMolar: numericMap(ud["holdupMolar"]),
    };
    const V = asNum(ud["V"]);
    if (V !== undefined) unit.V = V;
    const extras = numericMap(ud["extras"]);
    if (Object.keys(extras).length > 0) unit.extras = extras;
    units.push(unit);
  }
  if (units.length === 0) return null;
  return { t, dir, units };
}

/** Overlay the `<t>/streamFaces` outlet faces onto an already-parsed instant.
 *  Stream "name.out" maps back to unit "name". */
function applyStreams(instant: DynamicInstant, text: string): void {
  let json: JsonDict;
  try {
    json = toJson(parse(text));
  } catch {
    return;
  }
  const streamsBlock = json["faces"];
  if (!streamsBlock || typeof streamsBlock !== "object" || Array.isArray(streamsBlock)) {
    return;
  }
  for (const [sname, s] of Object.entries(streamsBlock as JsonDict)) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const sd = s as JsonDict;
    // A unit's faces are written as "<name>.out" (outlet) and -- once the
    // engine inlet-face slice lands -- "<name>.feed" (inlet, the driven
    // disturbance).  Both map back to the owning unit; parse symmetrically.
    const isFeed = sname.endsWith(".feed");
    const unitName = isFeed
      ? sname.slice(0, -5)
      : sname.endsWith(".out") ? sname.slice(0, -4) : sname;
    const unit = instant.units.find((u) => u.name === unitName);
    if (!unit) continue;
    const flows = numericMap(sd["molarFlows"]);
    const faceT = asNum(sd["T"]);
    if (isFeed) {
      if (Object.keys(flows).length > 0) unit.inletMolarFlows = flows;
      if (faceT !== undefined) unit.inletT = faceT;
    } else {
      if (Object.keys(flows).length > 0) unit.outletMolarFlows = flows;
      if (faceT !== undefined) unit.outletT = faceT;
      const vf = asNum(sd["vf"]);
      if (vf !== undefined) unit.outletVf = vf;
    }
  }
}

/**
 * Parse the harvested instant files into a time-ordered DynamicInstants.
 *
 * `files` keys are paths relative to the case root, exactly as the worker
 * harvested them from MEMFS:
 *     { "0/internalState": "...", "0/streamFaces": "...", "50/internalState": "...", ... }
 *
 * Files that are not `<t>/internalState` or `<t>/streamFaces` are ignored, so the
 * same generic file bag can be passed in safely.  Returns null when no
 * instant parses (steady run / solutionControl off).
 */
export function parseDynamicInstants(
  files: { [relPath: string]: string },
): DynamicInstants | null {
  // First pass: parse every internalState into an instant, keyed by dir.
  const byDir = new Map<string, DynamicInstant>();
  for (const [rel, text] of Object.entries(files)) {
    const m = /^(.+)\/internalState$/.exec(rel);
    if (!m) continue;
    const dir = m[1]!;
    // An instant dir is a single numeric segment at the case root (e.g.
    // "500"), never "constant/x" or "system/y" -- reject nested paths.
    if (dir.includes("/")) continue;
    const inst = parseInternalState(dir, text);
    if (inst) byDir.set(dir, inst);
  }
  if (byDir.size === 0) return null;

  // Second pass: overlay the outlet faces where a streamFaces file exists.
  for (const [rel, text] of Object.entries(files)) {
    const m = /^(.+)\/streamFaces$/.exec(rel);
    if (!m) continue;
    const dir = m[1]!;
    if (dir.includes("/")) continue;
    const inst = byDir.get(dir);
    if (inst) applyStreams(inst, text);
  }

  // Time-order the instants (numeric, not lexical -- "100" sorts after "50").
  const instants = [...byDir.values()].sort((a, b) => a.t - b.t);

  // Application: infer from the unit types (batchReactor/batchStill -> batch),
  // robust to header-text drift.
  const firstTypes = instants[0]?.units.map((u) => u.type) ?? [];
  const application = firstTypes.some((tp) => tp.startsWith("batch"))
    ? "batch"
    : "ctrl";

  // Component union, first-seen order (stable table columns).
  const seen = new Set<string>();
  const components: string[] = [];
  for (const inst of instants) {
    for (const u of inst.units) {
      for (const c of Object.keys(u.holdupMolar)) {
        if (!seen.has(c)) { seen.add(c); components.push(c); }
      }
    }
  }

  return { application, components, instants };
}
