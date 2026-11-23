/*---------------------------------------------------------------------------*\
    Copyright (C) 2026 Vítor Geraldes -- GPL-3.0-or-later (see NOTICE)
\*---------------------------------------------------------------------------*/
import type { EquipmentItem } from "../adapters/SolverAdapter.js";

/** A bank of identical parallel items (the H2 buffer's ten pressure vessels) is
 *  ONE row "vessel x 10" with the bank's capital; the size shown is each one's.
 *  Presentation only: the engine still lists, tags and costs every vessel, and
 *  every number here is read from the rows collapsed.  Rows collapse only when
 *  they sit on one unit and agree in type, material, size and cost. */
export function collapseBanks(rows: EquipmentItem[]):
  { it: EquipmentItem; n: number; tagRange?: string; total: number }[] {
  const out: { it: EquipmentItem; n: number; tagRange?: string; total: number }[] = [];
  const same = (a: EquipmentItem, b: EquipmentItem) =>
    a.unit === b.unit && a.type === b.type && a.material === b.material
    && (a.values["nVessels"] ?? 0) > 1 && a.values["nVessels"] === b.values["nVessels"]
    && a.values["V_R"] === b.values["V_R"]
    && (a.cost?.totalModule ?? 0) === (b.cost?.totalModule ?? 0);
  const sorted = [...rows].sort((a, b) => (a.tagNo ?? "").localeCompare(b.tagNo ?? ""));
  const used = new Set<EquipmentItem>();
  for (const it of rows) {
    if (used.has(it)) continue;
    const bank = (it.values["nVessels"] ?? 0) > 1 ? sorted.filter((o) => !used.has(o) && same(it, o)) : [it];
    bank.forEach((o) => used.add(o));
    used.add(it);
    const tags = bank.map((o) => o.tagNo).filter((t): t is string => !!t);
    const tagRange = bank.length > 1 && tags.length > 1
      ? `${tags[0]!}\u2013${tags[tags.length - 1]!.slice(-1)}` : undefined;
    out.push({ it: bank[0]!, n: bank.length, tagRange,
      total: bank.reduce((s, o) => s + (o.cost?.totalModule ?? 0), 0) });
  }
  return out;
}
