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
    This file is part of CHOUPO.

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
  THE SIGN OF A SINGLE HEAT DUTY BEFORE ANY RUN: WHAT THE DECLARATION SAYS,
  OR NOTHING (DEV.md 4c C59, the stub follow-up, 2026-10-11).

  A duty stub drawn before a run used to read "heating" for every unit type
  not on a short cooler list -- so the green-ammonia plant's EffluentCooler,
  WaterCooler and Chiller (each a `phaseChanger` with an `outletT` well below
  its inlet) all wore the heating icon.  A sign the canvas does not know is a
  sign it must not draw.  The rule, in order:

    1. a declared `Q` -> its sign (the declaration IS the duty);
    2. a type whose duty is cooling by construction (dutyTypes.ts
       COOLING_DUTY_TYPES) -> cooling;
    3. a `phaseChanger` declaring `outletT`, whose every inlet temperature is
       DECLARED -> the sign of (outletT - inlet T).  An inlet temperature is
       declared when the inlet is a plant feed (its `0/` file is the author's
       declaration) or when its producer declares the temperature of what it
       makes (a phaseChanger's `outletT`, a flash's `T`, an isothermal Gibbs
       reactor's `T`).  NEVER from the `0/` file of a PRODUCED stream: that is
       a seed (choupo-init0's estimate), and a seed is not an answer;
    4. anything else -> "unknown", drawn as a neutral "duty" until the run
       publishes the sign (dutyUtility.ts `dutyStubFromRun`).

  A flash is deliberately not in rule 3: at its own temperature it may still
  vaporise or condense, so (T_out - T_in) does not fix the sign of its duty.
  Neither is a reactor: its heat of reaction does.
\*---------------------------------------------------------------------------*/

import type { JsonDict } from "../dict/index.js";
import { scalarToSI } from "../dict/scalarSI.js";
import type { StreamSpec, UnitSpec } from "./types.js";
import { COOLING_DUTY_TYPES } from "./dutyTypes.js";

export type DutyTier = "heating" | "cooling" | "unknown";

/** The stroke of a single-duty stub and its wire: heat orange, cold cyan,
 *  and a neutral grey while the sign is not known. */
export const DUTY_TIER_COLOUR: { [t in DutyTier]: string } = {
  heating: "#e8590c",
  cooling: "#22b8cf",
  unknown: "#868e96",
};

export interface DutySignContext {
  /** stream -> the unit that produces it (absent: a plant feed). */
  producers: Map<string, string>;
  unitsByName: Map<string, UnitSpec>;
  /** The streams' authored state (`0/`). */
  streams: { [name: string]: StreamSpec };
  /** A unit's `operation` block.  In a composite view a unit in its own
   *  folder carries an empty one, and its declaration is in
   *  `<unit>/system/flowsheetDict`; toGraph reads it there. */
  operationOf?: (u: UnitSpec) => JsonDict;
}

const opOf = (u: UnitSpec, ctx?: DutySignContext): JsonDict =>
  (ctx?.operationOf ? ctx.operationOf(u) : u.operation) ?? {};

/** The temperature a unit's DECLARATION fixes for every stream it makes, or
 *  NaN when the declaration does not fix one. */
export function declaredOutletT(u: UnitSpec, ctx?: DutySignContext): number {
  const op = opOf(u, ctx);
  if (u.type === "phaseChanger") return scalarToSI(op["outletT"]);
  if (u.type === "isothermalFlash" || u.type === "flash") return scalarToSI(op["T"]);
  if (u.type === "gibbsReactor") {
    const mode = op["mode"];
    if (mode === undefined || mode === "isothermal") return scalarToSI(op["T"]);
  }
  return NaN;
}

/** A stream's temperature as DECLARED -- never a seed (see rule 3). */
export function declaredStreamT(stream: string, ctx: DutySignContext): number {
  const prod = ctx.producers.get(stream);
  if (prod !== undefined) {
    const pu = ctx.unitsByName.get(prod);
    return pu ? declaredOutletT(pu, ctx) : NaN;
  }
  // A feed with no `0/` file is drawn at an AMBIENT placeholder with no flow
  // and no composition: that is not a declaration either.
  const st = ctx.streams[stream];
  if (!st || (!(st.F > 0) && Object.keys(st.composition ?? {}).length === 0)) return NaN;
  const t = st.T;
  return typeof t === "number" && Number.isFinite(t) && t > 0 ? t : NaN;
}

/** The pre-run sign of a unit's single heat duty (the rule above). */
export function preRunDutyTier(u: UnitSpec, ctx: DutySignContext): DutyTier {
  const op = opOf(u, ctx);
  if (op["Q"] !== undefined) {
    const q = scalarToSI(op["Q"]);
    if (Number.isFinite(q)) return q > 0 ? "heating" : q < 0 ? "cooling" : "unknown";
  }
  if (COOLING_DUTY_TYPES.has(u.type)) return "cooling";
  if (u.type === "phaseChanger") {
    const tOut = scalarToSI(op["outletT"]);
    if (!Number.isFinite(tOut)) return "unknown";
    const ins = Array.isArray(u.in) ? u.in : [u.in];
    const tIns = ins.filter((s) => typeof s === "string" && s.length > 0)
                    .map((s) => declaredStreamT(s, ctx));
    if (tIns.length === 0 || tIns.some((t) => !Number.isFinite(t))) return "unknown";
    if (tIns.every((t) => tOut < t)) return "cooling";
    if (tIns.every((t) => tOut > t)) return "heating";
  }
  return "unknown";
}
