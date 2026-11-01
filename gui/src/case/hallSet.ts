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
  hallSet -- the drawings of "Trains and racks" built from a RUN, pure
  (DEV.md 4c C199 phase B): the train schematic, the plan of the hall, the
  section through a rack bay and the elevation of a rack, for the train, bank
  and rack the reader picked.  The UI component only holds the three pickers
  and puts the strings on the page; everything that decides what is drawn is
  here, so a test can build the whole set from the case's REAL run output.
\*---------------------------------------------------------------------------*/

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import type { GmpBuilding } from "../adapters/buildingPayload.js";
import { parseDesignSheet, type DesignSheet } from "./designSheet.js";
import { isTrainSheet, sizingValue, trainSchematicSvg, type TrainSchematic } from "./equipmentSchematic.js";
import { headersOf, readBank, type BankRead } from "./membraneBank.js";
import {
  hallPlanSvg, rackElevationSvg, rackSectionSvg, roomOf, type Drawing, type RoofInput,
} from "./roHallDrawings.js";
import { sheetItemId } from "./withBanks.js";

/** Every readable sheet of a run, parsed once. */
export function allSheets(designFiles: { [relPath: string]: string } | undefined): DesignSheet[] {
  const out: DesignSheet[] = [];
  for (const [rel, text] of Object.entries(designFiles ?? {})) {
    if (!rel.startsWith("design/")) continue;
    const s = parseDesignSheet(text);
    if (s) out.push(s);
  }
  return out;
}

/** The train indices the run's sheets carry, ascending. */
export function trainIndices(sheets: readonly DesignSheet[]): number[] {
  const ks = new Set<number>();
  for (const s of sheets)
    if (isTrainSheet(s)) {
      const k = sizingValue(s, "trainIndex")?.value;
      if (k !== undefined) ks.add(Math.round(k));
    }
  return [...ks].sort((a, b) => a - b);
}

/** The sheets of ONE train. */
export function trainSheets(sheets: readonly DesignSheet[], k: number): DesignSheet[] {
  return sheets.filter((s) => isTrainSheet(s)
    && Math.round(sizingValue(s, "trainIndex")?.value ?? NaN) === k);
}

/** The banks of a run by item id, read from their sheets. */
export function bankReads(sheets: readonly DesignSheet[]): Map<string, BankRead> {
  const m = new Map<string, BankRead>();
  for (const s of sheets) if (s.equipment === "membraneBank") m.set(sheetItemId(s), readBank(s));
  return m;
}

export interface HallPick { train: number; bankId: string; rack: number }

export interface HallSet {
  trains: number[];
  /** The banks of the picked train (item ids), in the order the sheets arrived. */
  bankIds: string[];
  pick: HallPick;
  /** Racks in the picked bank (1 when its sheet could not be read). */
  racks: number;
  train: TrainSchematic;
  plan: Drawing | null;
  section: Drawing | null;
  elevation: Drawing | null;
}

/** The roof of the room a bank stands in, from the DECLARED building: the
 *  room's floor plus its height, measured from the bank's own base. */
export function roofFor(building: GmpBuilding | undefined, layout: PlantLayout | undefined,
                        itemId: string): RoofInput | undefined {
  const room = roomOf(building, itemId);
  const item = layout?.items.find((i) => i.id === itemId);
  if (!room || !item) return undefined;
  return { name: room.name, roofAboveBase: room.z + room.height - item.z };
}

/** Build the whole set for a pick.  Defaults: the first train, its first bank,
 *  its first rack; a pick that names something the run does not have falls
 *  back to the first, never to nothing. */
export function hallSet(designFiles: { [relPath: string]: string } | undefined,
                        layout: PlantLayout | undefined, building: GmpBuilding | undefined,
                        want?: Partial<HallPick>): HallSet | null {
  const sheets = allSheets(designFiles);
  const trains = trainIndices(sheets);
  const banks = bankReads(sheets);
  if (banks.size === 0) return null;
  const k = want?.train !== undefined && trains.includes(want.train) ? want.train : (trains[0] ?? 0);
  const mine = trains.length > 0 ? trainSheets(sheets, k) : sheets;
  const bankIds = mine.filter((s) => s.equipment === "membraneBank").map(sheetItemId);
  const ids = bankIds.length > 0 ? bankIds : [...banks.keys()];
  const bankId = want?.bankId && ids.includes(want.bankId) ? want.bankId : ids[0]!;
  const read = banks.get(bankId)!;
  const nRacks = read.ok ? read.bank.racks : 1;
  const rack = Math.min(Math.max(0, want?.rack ?? 0), nRacks - 1);
  return {
    trains, bankIds: ids, pick: { train: k, bankId, rack }, racks: nRacks,
    train: trainSchematicSvg(mine, sheets),
    plan: hallPlanSvg({ items: layout?.items ?? [], ...(building ? { building } : {}), banks }),
    section: rackSectionSvg(read, rack, roofFor(building, layout, bankId)),
    elevation: rackElevationSvg(read, rack, read.ok ? headersOf(sheets, read.bank) : undefined),
  };
}
