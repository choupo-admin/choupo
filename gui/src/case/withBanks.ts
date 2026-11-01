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
  withBanks -- hand each `membraneBank` item of the layout the vessel geometry
  its OWN design sheet states (DEV.md 4c C199 phase B).

  The engine's `layout {}` block carries an item's ENVELOPE (a box); the
  vessels, tiers and racks inside it are on the sheet, and the sheet is a
  separate channel (`RunResult.designFiles`).  This is the ONE seam that joins
  them, so the 3D scene, the plans, the export and the pop-out all read the
  same attached bank and none of them reads a sheet itself.

  The join is the engine's own item identity, `EquipmentSizing::itemId()` --
  `unit` for a one-item unit, `unit/tag` for an indexed one
  (ResultRecords.H) -- computed from the sheet's `unit` and `item` words, never
  by splitting a layout id.  A bank whose sheet is missing or lacks a key keeps
  no `bank`, and the scene says so in the item's tooltip.
\*---------------------------------------------------------------------------*/

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { parseDesignSheet, type DesignSheet } from "./designSheet.js";
import { readBank, type BankRead } from "./membraneBank.js";

/** The engine's item identity of a sheet (`itemId()`). */
export function sheetItemId(sheet: DesignSheet): string {
  return sheet.item === "" ? sheet.unit : `${sheet.unit}/${sheet.item}`;
}

/** Every `membraneBank` sheet of a run, read, by item id.  An unreadable or
 *  incomplete one is present with `ok: false` and the keys it lacks, so a
 *  caller can say WHY there is no drawing instead of drawing nothing. */
export function banksOf(designFiles: { [relPath: string]: string } | undefined):
  Map<string, BankRead> {
  const out = new Map<string, BankRead>();
  for (const [rel, text] of Object.entries(designFiles ?? {})) {
    if (!rel.startsWith("design/")) continue;
    const sheet = parseDesignSheet(text);
    if (!sheet || sheet.equipment !== "membraneBank") continue;
    out.set(sheetItemId(sheet), readBank(sheet));
  }
  return out;
}

/** The layout with every `membraneBank` item carrying its bank.  Returns the
 *  SAME object when there is nothing to attach (no bank sheet, or no layout),
 *  so a case without banks pays nothing and keeps its identity. */
export function withBanks(layout: PlantLayout | undefined,
                          designFiles: { [relPath: string]: string } | undefined):
  PlantLayout | undefined {
  if (!layout) return layout;
  const banks = banksOf(designFiles);
  if (banks.size === 0) return layout;
  return {
    ...layout,
    items: layout.items.map((it) => {
      const r = it.kind === "membraneBank" ? banks.get(it.id) : undefined;
      return r && r.ok ? { ...it, bank: r.bank } : it;
    }),
  };
}

/** Does the run carry at least one `membraneBank` sheet?  The fact that earns
 *  the Reports section "Trains and racks". */
export function hasBankSheet(designFiles: { [relPath: string]: string } | undefined): boolean {
  return banksOf(designFiles).size > 0;
}
