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
  layoutExercise -- the WITNESS, the KNOBS and the OVERRIDES behind the plant
  layout EduTool (DEV.md 4c C75, slice 2), kept React-free so
  tests/plantLayoutLesson.test.ts can apply every override to the real
  witness and read it back.

  ZERO LAYOUT HERE.  The page moves DECLARED numbers in the witness's own
  system/layoutDict -- a position, the wind's bearing, the word that says how
  a separation is measured -- and the engine re-reads the file, checks it and
  publishes what it found.  Nothing in this file computes a distance, a
  bearing or a finding: the page draws the engine's `layout {}` block and
  prints its `[layout]` lines verbatim (gui-credo, THE ENGINE DECIDES, THE
  GUI DRAWS).

  WHY AN OCCURRENCE IS COMPUTED, NOT TYPED.  The layoutDict declares `x`,
  `y` once per placed item, so the scalar override needs an occurrence index
  to say WHICH `x`.  Typing "7" for the let-down drum would be a second home
  for the order of the file's entries, and it would go quietly wrong the day
  somebody adds an item above it -- the knob would then move another item,
  and the page would still run.  So the index is FOUND, from the entry's own
  `item "<id>"` / `nonProcess "<id>"` line, using the same pattern methodRun's
  scalar override matches; an entry that is absent throws, by name.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import { engineText } from "./runLog.js";

/** The witness: the ammonia synthesis loop with a declared plot plan. */
export const LAYOUT_WITNESS = "plant/ammonia02_full_plant";
export const LAYOUT_DICT = "system/layoutDict";

/** The two items the exercise moves: the let-down drum (the pair that is too
 *  close) and the control room (the plot plan's ignition source). */
export const DRUM = "letdown";
export const ROOM = "controlRoom";

/** What the reader can turn.  Every field is a number or word that the
 *  witness's layoutDict DECLARES; the shipped values are the file's own
 *  (held to it by the test). */
export interface LayoutKnobs {
  drumX: number;      // [m] the let-down drum's plan centre
  drumY: number;      // [m]
  roomX: number;      // [m] the control room's plan centre
  roomY: number;      // [m]
  windFrom: number;   // [deg] true bearing the prevailing wind blows FROM
  measure: "edgeToEdge" | "centreToCentre";
}

/** The witness as shipped. */
export const SHIPPED: LayoutKnobs = {
  drumX: 59.5, drumY: -6, roomX: -30, roomY: -40, windFrom: 225,
  measure: "edgeToEdge",
};

/** One move the guided exercise asks for, by name.  The `expect` sentence is
 *  what the reader should see the engine say; the test holds each one to the
 *  witness's own geometry, and the page shows the engine's actual answer
 *  beside it, so a sentence that stopped being true would be visible. */
export interface LayoutPreset {
  id: string;
  label: string;
  knobs: LayoutKnobs;
  expect: string;
}

export const PRESETS: readonly LayoutPreset[] = [
  { id: "shipped", label: "1 · as shipped", knobs: SHIPPED,
    expect: "one separation finding: the let-down drum 1.886 m from the "
      + "separator, edge to edge, against the 4 m the case declares between "
      + "two vessels.  Announced; the run finishes." },
  { id: "drum-moved", label: "2 · drum to x = 62 m", knobs: { ...SHIPPED, drumX: 62 },
    expect: "no finding: the clear distance is now about 4.4 m." },
  { id: "drum-overlap", label: "3 · drum into the separator", knobs: { ...SHIPPED, drumX: 57.5 },
    expect: "a REFUSAL: the two footprints interpenetrate, and the run stops "
      + "with exit 2 and no layout to draw." },
  { id: "centre", label: "4 · measure centre to centre",
    knobs: { ...SHIPPED, measure: "centreToCentre" },
    expect: "the same pair, now 3.5 m apart centre to centre, still short of "
      + "the same 4 m -- a different rule under the same number." },
  { id: "wind-ne", label: "5 · wind from the north-east", knobs: { ...SHIPPED, windFrom: 45 },
    expect: "the control room, not moved, now lies downwind of both "
      + "compressors." },
  { id: "room-downwind", label: "6 · control room north-east",
    knobs: { ...SHIPPED, roomX: 80, roomY: 20 },
    expect: "the control room downwind of the separator and the let-down "
      + "drum, and closer than 30 m to four process items." },
  { id: "room-zone", label: "7 · control room by the compressors",
    knobs: { ...SHIPPED, roomX: 6, roomY: -20 },
    expect: "the control room inside the make-up compressor's zone 2 "
      + "envelope, and closer than 30 m to four process items." },
];

const XY_PATTERN = (key: string): RegExp =>
  new RegExp("^[ \\t]*" + key + "[ \\t]+[-+0-9.eE]+[ \\t]*[A-Za-z/%0-9.^-]*[ \\t]*;", "gm");

/** Which `key` line (1-based, in file order) belongs to entry `id`.  The
 *  entry is found by its own `item "<id>"` or `nonProcess "<id>"` line, and
 *  the answer is the first `key` line after it.  Throws when the entry is
 *  absent or carries no such line before the next entry. */
export function entryOccurrence(text: string, id: string, key: string): number {
  const head = new RegExp(`^[ \\t]*(?:item|nonProcess)[ \\t]+"${id}"[ \\t]*;`, "m")
    .exec(text);
  if (!head) throw new Error(`layoutDict: no entry "${id}"`);
  const all = [...text.matchAll(XY_PATTERN(key))];
  const k = all.findIndex((m) => (m.index ?? -1) > head.index);
  if (k < 0) throw new Error(`layoutDict: entry "${id}" declares no \`${key}\``);
  const next = /^[ \t]*(?:item|nonProcess)[ \t]+"/m.exec(text.slice(head.index + head[0].length));
  if (next && all[k]!.index! > head.index + head[0].length + next.index)
    throw new Error(`layoutDict: entry "${id}" declares no \`${key}\` of its own`);
  return k + 1;
}

/** The witness's layoutDict text, as bundled. */
export function witnessLayoutText(): string {
  const t = tutorialByName(LAYOUT_WITNESS)?.files.rawFiles?.[LAYOUT_DICT];
  if (t === undefined) throw new Error(`${LAYOUT_WITNESS}: no ${LAYOUT_DICT} in the bundle`);
  return t;
}

/** The overrides that put the knobs into the witness's layoutDict.  Only the
 *  numbers and the one word move; the units stay the file's (`m`, `deg`). */
export function layoutOverrides(k: LayoutKnobs, text = witnessLayoutText()): DictOverride[] {
  const at = (id: string, key: string, value: number): DictOverride => ({
    file: LAYOUT_DICT, key, value, unit: "m", occurrence: entryOccurrence(text, id, key),
  });
  return [
    at(DRUM, "x", k.drumX), at(DRUM, "y", k.drumY),
    at(ROOM, "x", k.roomX), at(ROOM, "y", k.roomY),
    { file: LAYOUT_DICT, key: "from", value: k.windFrom, unit: "deg" },
    { file: LAYOUT_DICT, key: "measure", word: k.measure },
  ];
}

/** The `[layout]` lines of a run's log and its refusal, verbatim: what the
 *  engine said about the layout, in its own words.  The engine writes its
 *  announcements to stderr, which the browser worker marks `[stderr] `; the
 *  mark is the worker's, not the engine's, so it is removed before the
 *  match -- with it kept, every announcement was dropped in the browser and
 *  only the refusal (matched anywhere in the line) reached the page. */
export function layoutLines(log: string | null): string[] {
  if (!log) return [];
  return log.split("\n").map((l) => engineText(l.trimEnd()))
    .filter((l) => l.startsWith("[layout] ") || l.includes("layoutDict: "))
    //  The verbosity-2 summary is a count, not a finding.
    .filter((l) => !l.startsWith("[layout] system/layoutDict:"));
}
