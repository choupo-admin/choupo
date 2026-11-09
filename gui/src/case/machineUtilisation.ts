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
  machineUtilisation -- the PER-MACHINE UTILISATION TABLE of a batch plant
  (DEV.md 4c C195 item 1, C210; the `ratedMachine` sizer, RatedMachineSize.cpp).

  THE ENGINE DECIDES, THE GUI DRAWS.  A tablet-plant machine is a sized item
  of kind `ratedMachine` whose sheet publishes (as `result.equipment[].values`)
  the load, the declared rating, `utilisation` (load over the capacity of the
  machines installed), `utilisation_plan` (the batch plan's own stage
  utilisation), `machinesInstalled`, and the lot time against the shift.  The
  engine REFUSES a run whose utilisation exceeds 1 (the run does not
  complete, so no result can carry such a row) and ANNOUNCES one above its
  threshold (0.85 unless the case declares `announceAbove`) as an advisory
  with the locus `ratedMachine '<unit>'`.  This module reads those, sorts
  the least capacity margin (highest utilisation) first, and divides nothing: a utilisation is never
  recomputed here.

  WHAT THE SHEET DOES NOT PUBLISH, and is therefore inferred from WHICH keys
  it publishes (never from a unit's name): the `kind` word (the sizer writes
  it into the basis sentence only) -- `V_working_capacity` is a batchVolume
  machine, `stations` a tabletPress, `packsPerMinute` a packagingLine,
  otherwise a massRate.  A `ratedMachine` sheet with no `utilisation_plan` is
  the pump kind (volumeRate), read from no plan, and is not a row.
\*---------------------------------------------------------------------------*/

import type { Advisory, EquipmentItem } from "../adapters/SolverAdapter.js";

export type MachineKind = "batchVolume" | "massRate" | "tabletPress" | "packagingLine";

export interface Quantity { value: number; unit: string; }

export interface MachineRow {
  unit: string;
  sector: string;
  kind: MachineKind;
  /** Machines installed (published). */
  installed: number;
  /** The declared rating of ONE machine, as the sizer published its parts. */
  rating: string;
  /** The lot's load on the machine, in the unit it is rated in. */
  load: Quantity | null;
  /** The capacity the sizer published: the working volume of the installed
   *  machines (batchVolume) or the nameplate of ONE machine (the others). */
  capacity: Quantity | null;
  /** The engine's own `utilisation`. */
  utilisation: number;
  /** The batch plan's stage utilisation (`utilisation_plan`). */
  utilisationPlan: number | null;
  /** Hours a lot occupies the machine against the shift length (published). */
  lotHours: number | null;
  shiftHours: number | null;
  /** The engine's announcement for this unit (its message), or null. */
  announced: string | null;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: { [k: string]: number }, k: string): number | null =>
  finite(v[k]) ? v[k]! : null;

/** Is this sheet a plan-scheduled tablet-plant machine? */
export function isPlanMachine(it: EquipmentItem): boolean {
  return it.type === "ratedMachine" && finite(it.values["utilisation"])
    && finite(it.values["utilisation_plan"]);
}

export function machineKind(v: { [k: string]: number }): MachineKind {
  if (finite(v["V_working_capacity"])) return "batchVolume";
  if (finite(v["stations"])) return "tabletPress";
  if (finite(v["packsPerMinute"])) return "packagingLine";
  return "massRate";
}

const g = (x: number): string => String(Number(x.toPrecision(6)));

function ratingText(kind: MachineKind, v: { [k: string]: number }): string {
  const cap = num(v, "capacity_machine");
  switch (kind) {
    case "batchVolume": {
      const vn = num(v, "V_nominal"), mf = num(v, "maxFill");
      return vn === null ? "—" : `${g(vn)} m³ nominal${mf === null ? "" : `, fill up to ${g(mf)}`}`;
    }
    case "massRate": return cap === null ? "—" : `${g(cap)} kg/h`;
    case "tabletPress": {
      const st = num(v, "stations"), rpm = num(v, "turretSpeed");
      return cap === null ? "—"
        : `${g(cap)} tablets/h (${st === null ? "?" : g(st)} stations${rpm === null ? "" : `, ${g(rpm)} rpm`})`;
    }
    case "packagingLine": {
      const ppm = num(v, "packsPerMinute");
      return cap === null ? "—" : `${g(cap)} packs/h${ppm === null ? "" : ` (${g(ppm)} packs/min)`}`;
    }
  }
}

/** The machines of a batch plant, the least capacity margin (highest
 *  published utilisation) first -- not the plan's limiting stage, which is
 *  the stage that sets a train's T_L (C264).  Empty when the result carries no plan machine --
 *  and then nothing is drawn. */
export function machineUtilisation(
  equipment: readonly EquipmentItem[] | undefined,
  advisories: readonly Advisory[] | undefined,
): MachineRow[] {
  const rows: MachineRow[] = [];
  for (const it of equipment ?? []) {
    if (!isPlanMachine(it)) continue;
    const v = it.values;
    const kind = machineKind(v);
    const adv = (advisories ?? []).find((a) => a.locus === `ratedMachine '${it.unit}'`
      && a.message.startsWith("utilisation"));
    let load: Quantity | null = null, capacity: Quantity | null = null;
    if (kind === "batchVolume") {
      const l = num(v, "V_working_required"), c = num(v, "V_working_capacity");
      load = l === null ? null : { value: l, unit: "m³" };
      capacity = c === null ? null : { value: c, unit: "m³" };
    } else {
      const u = kind === "massRate" ? "kg/h" : kind === "tabletPress" ? "tablets/h" : "packs/h";
      const l = num(v, "load"), c = num(v, "capacity_machine");
      load = l === null ? null : { value: l, unit: u };
      capacity = c === null ? null : { value: c, unit: `${u} per machine` };
    }
    rows.push({
      unit: it.unit, sector: it.sector ?? "", kind,
      installed: num(v, "machinesInstalled") ?? 1,
      rating: ratingText(kind, v),
      load, capacity,
      utilisation: v["utilisation"]!,
      utilisationPlan: num(v, "utilisation_plan"),
      lotHours: num(v, "lotTime_forShift"), shiftHours: num(v, "shiftLength"),
      announced: adv ? adv.message : null,
    });
  }
  return rows.sort((a, b) => b.utilisation - a.utilisation || a.unit.localeCompare(b.unit));
}
