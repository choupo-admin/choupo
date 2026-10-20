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
  gmpLayoutExercise -- the HOST, the TEACHING BUILDING and the MOVES behind
  the GMP interior EduTool (DEV.md 4c C101), kept React-free so
  tests/gmpLayoutLesson.test.ts can build every move's case exactly as the
  page does and run it through the NATIVE engine.

  NO NEW CASE (DEV.md, the standing rule of 2026-10-17: no new tutorial case
  for an EduTool; a probe lives in a temporary COPY of an existing case).
  The bench is that copy: the bundled tutorial `sprayDryer07_design`, which
  sizes one spray dryer, with the teaching building written in as its
  system/layoutDict -- the file `gmpTeachingBuilding.layoutDict` beside this
  one, a plain dictionary a student can read on the page and run at home.
  The tutorial itself is never changed.

  ZERO RULES HERE.  A move is a list of EDITS to the declared text -- a
  grade, a pressure, a regime, a door's type, a path -- and the engine
  re-reads the file, checks it, and publishes what it found.  Nothing in
  this file computes a pressure difference, a gowning state or a finding:
  the page draws the engine's `building {}` block and prints its
  `[building]` lines verbatim (gui-credo, THE ENGINE DECIDES, THE GUI
  DRAWS).  Each move carries the finding ids the engine gives for it, held
  by the test to a native run of the very files the page sends, so the
  sentence beside the engine's live answer cannot drift from it.

  AN EDIT IS EXACT TEXT, AND IT MUST LAND EXACTLY ONCE.  `from` is a piece
  of the declaration as written; scoped to a ROOM it is looked for only
  inside that room's own `{ room <name>; ... }` entry (braces matched, so a
  nested `atex {}` stays inside it).  Absent, or present twice, it THROWS by
  name -- a silent no-op edit would run the engine on the wrong question,
  which is the methodRun rule restated for a whole declaration.
\*---------------------------------------------------------------------------*/

import TEACHING_RAW from "./gmpTeachingBuilding.layoutDict?raw";

import type { CaseFiles } from "../../case/types.js";
import { filesToCaseFiles, tutorialByName } from "../../cases/tutorials.js";
import { engineText } from "./runLog.js";

/** The host: one sized spray dryer, so the plot plan has an item to place. */
export const GMP_HOST = "steady/drying/sprayDryer07_design";
export const GMP_LAYOUT_DICT = "system/layoutDict";
/** Where the teaching file lives in the tree (named on the page). */
export const GMP_TEACHING_FILE = "gui/src/ui/methods/gmpTeachingBuilding.layoutDict";
/** The real witness the page sends the reader to at the end. */
export const GMP_WITNESS = "batch/plant/apalutamide01_tablets";

/** The teaching building's layoutDict, as committed. */
export const TEACHING_LAYOUT: string = TEACHING_RAW;

/** One change to the declared text. */
export interface LayoutEdit {
  /** Look for `from` only inside this room's own entry. */
  room?: string;
  from: string;
  to: string;
}

/** The text of room `name`'s entry: from its opening brace to the matching
 *  closing one.  Returns [start, end) offsets.  Throws when absent. */
export function roomSpan(text: string, name: string): [number, number] {
  const head = new RegExp(`\\{[ \\t]*room[ \\t]+${name}[ \\t]*;`).exec(text);
  if (!head) throw new Error(`teaching building: no room \`${name}\``);
  let depth = 0;
  for (let i = head.index; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return [head.index, i + 1];
  }
  throw new Error(`teaching building: room \`${name}\` has no closing brace`);
}

/** Apply one edit; throws unless `from` occurs exactly once in its scope. */
export function applyEdit(text: string, e: LayoutEdit): string {
  const [a, b] = e.room ? roomSpan(text, e.room) : [0, text.length];
  const scope = text.slice(a, b);
  const first = scope.indexOf(e.from);
  const where = e.room ? `room \`${e.room}\`` : "the teaching building";
  if (first < 0) throw new Error(`edit: \`${e.from}\` not found in ${where}`);
  if (scope.indexOf(e.from, first + 1) >= 0)
    throw new Error(`edit: \`${e.from}\` occurs more than once in ${where}`);
  return text.slice(0, a + first) + e.to + text.slice(a + first + e.from.length);
}

export function applyEdits(text: string, edits: readonly LayoutEdit[]): string {
  return edits.reduce(applyEdit, text);
}

/** The host's files with the (edited) teaching building as its layoutDict. */
export function gmpCaseRaw(edits: readonly LayoutEdit[]): { [rel: string]: string } {
  const entry = tutorialByName(GMP_HOST);
  if (!entry?.files.rawFiles)
    throw new Error(`GMP EduTool host '${GMP_HOST}' is not in the bundled corpus`);
  if (entry.files.rawFiles[GMP_LAYOUT_DICT] !== undefined)
    throw new Error(`GMP EduTool host '${GMP_HOST}' already declares a layoutDict;`
      + " the teaching building would replace it");
  return { ...entry.files.rawFiles,
    [GMP_LAYOUT_DICT]: applyEdits(TEACHING_LAYOUT, edits) };
}

export function gmpCase(edits: readonly LayoutEdit[]): CaseFiles {
  return filesToCaseFiles(GMP_HOST, gmpCaseRaw(edits));
}

/** One guided move of one part.  `findings` is the engine's finding ids for
 *  it (empty: the building raises none); `refusal`, when set, is a piece of
 *  the message the engine REFUSES the building with, and then no finding is
 *  published at all.  Both are held to a native run by the test. */
export interface GmpMove {
  id: string;
  label: string;
  edits: readonly LayoutEdit[];
  expect: string;
  findings: readonly string[];
  refusal?: string;
}

/** The part of the lesson an exercise box belongs to. */
export type GmpPart =
  | "grades" | "cascade" | "airlocks" | "gowning" | "containment" | "flows"
  | "atex" | "escape";

/** The building as designed: every part's exercise starts here. */
export const AS_DESIGNED: GmpMove = {
  id: "as-designed", label: "as designed", edits: [],
  expect: "no finding: every rule holds on the building as declared.",
  findings: [],
};

/** A number the reader may type (parts 2 and 7), and the edit it makes. */
export interface GmpKnob {
  label: string;
  unit: string;
  shipped: number;
  min: number; max: number; step: number;
  edit: (v: number) => LayoutEdit;
}

export const KNOBS: { readonly [P in GmpPart]?: GmpKnob } = {
  cascade: {
    label: "coating room pressure, to outside", unit: "Pa", shipped: 25,
    min: -20, max: 60, step: 1,
    edit: (v) => ({ room: "coating", from: "pressure 25 Pa;", to: `pressure ${v} Pa;` }),
  },
  atex: {
    label: "declared ATEX separation", unit: "m", shipped: 6,
    min: 0, max: 20, step: 0.5,
    edit: (v) => ({ from: "atexSeparation { distance 6 m;",
                    to: `atexSeparation { distance ${v} m;` }),
  },
};

export const MOVES: { readonly [P in GmpPart]: readonly GmpMove[] } = {
  grades: [
    { id: "compression-C", label: "compression room to grade C",
      edits: [{ room: "compression", from: "grade D;", to: "grade C;" }],
      expect: "raising ONE room's grade asks for everything a cleaner room "
        + "needs: it must now be above the D corridor by the step (cascade), "
        + "every door from it to a D room is a change of grade with no airlock "
        + "(three of them), and the operators, gowned only for D, enter it "
        + "un-gowned.",
      findings: ["cascade:compression:corridor", "cascade:compression:blending",
        "cascade:compression:coating", "gradeChangeWithoutAirlock:blending:compression",
        "gradeChangeWithoutAirlock:compression:coating",
        "gradeChangeWithoutAirlock:compression:corridor",
        "ungownedEntry:operators:compression"] },
    { id: "packaging-D", label: "packaging to grade D",
      edits: [{ room: "packaging", from: "grade CNC;", to: "grade D;" }],
      expect: "packaging is now graded and opens to outside through a plain "
        + "door: a change of grade with no airlock, and a D room held only 5 Pa "
        + "above outside, short of the step.",
      findings: ["cascade:packaging:outside", "gradeChangeWithoutAirlock:packaging:outside"] },
  ],
  cascade: [
    { id: "coating-16", label: "coating at 16 Pa",
      edits: [{ room: "coating", from: "pressure 25 Pa;", to: "pressure 16 Pa;" }],
      expect: "no finding: the coating room is 11 Pa above packaging across "
        + "the cascade airlock (at least the 10 Pa step), and the airlock at "
        + "15 Pa still lies strictly between 5 and 16 Pa.",
      findings: [] },
    { id: "coating-15", label: "coating at 15 Pa",
      edits: [{ room: "coating", from: "pressure 25 Pa;", to: "pressure 15 Pa;" }],
      expect: "the cascade itself holds (exactly 10 Pa above packaging), but "
        + "the exit airlock, also at 15 Pa, is no longer strictly between its "
        + "neighbours: it is not a step any more.",
      findings: ["airlockRegime:exitMAL:cascade"] },
    { id: "coating-12", label: "coating at 12 Pa",
      edits: [{ room: "coating", from: "pressure 25 Pa;", to: "pressure 12 Pa;" }],
      expect: "both rules: the coating room is only 7 Pa above packaging "
        + "across the airlock (short of the step), and the airlock is above "
        + "the room it should step down from.",
      findings: ["cascade:coating:packaging", "airlockRegime:exitMAL:cascade"] },
  ],
  airlocks: [
    { id: "sdIn-bubble", label: "sdIn declared a bubble",
      edits: [{ room: "sdIn", from: "regime sink;", to: "regime bubble;" }],
      expect: "the word changed and the pressures did not: at 5 Pa the "
        + "airlock is no bubble (it would have to stand 10 Pa above both its "
        + "neighbours), and once it is not a sink, the contained suite is "
        + "asked to be below it by the step -- and it is above it.",
      findings: ["airlockRegime:sdIn:bubble", "containmentNotNegative:sprayDrying:sdIn"] },
    { id: "sdIn-cascade", label: "sdIn declared a cascade",
      edits: [{ room: "sdIn", from: "regime sink;", to: "regime cascade;" }],
      expect: "a cascade airlock passes the contained room's air on to the "
        + "dispensary, so the suite is reached through the wrong kind of "
        + "airlock; at 5 Pa it is not between its neighbours either, and the "
        + "suite is not below it.",
      findings: ["airlockRegime:sdIn:cascade", "containmentAccess:sprayDrying:sdIn",
        "containmentNotNegative:sprayDrying:sdIn"] },
  ],
  gowning: [
    { id: "gowning-CNC", label: "gowning room declared CNC",
      edits: [{ room: "gowning", from: "grade D;", to: "grade CNC;" }],
      expect: "the operators now change into garments for CNC, and walk on "
        + "into the D corridor and the D compression room: an un-gowned entry "
        + "into each.",
      findings: ["ungownedEntry:operators:corridor", "ungownedEntry:operators:compression"] },
    { id: "skip-gowning", label: "operators skip the gowning room",
      edits: [{ from: "path ( outside lobby gowning corridor compression );",
                to: "path ( outside lobby corridor compression );" }],
      expect: "the path now steps from the lobby straight into the corridor: "
        + "no door joins them (a flow through a wall), and the operators enter "
        + "both D rooms un-gowned.",
      findings: ["flowBreak:operators:lobby->corridor", "ungownedEntry:operators:corridor",
        "ungownedEntry:operators:compression"] },
  ],
  containment: [
    { id: "dispensing-contained", label: "contain the dispensary",
      edits: [{ room: "dispensing", from: "containment no;", to: "containment yes;" }],
      expect: "declaring the dispensary contained changes what its doors must "
        + "be: it opens directly on the corridor and through a cascade "
        + "airlock, and it is not negative to either.",
      findings: ["containmentAccess:dispensing:MAL", "containmentAccess:dispensing:corridor",
        "containmentNotNegative:dispensing:MAL", "containmentNotNegative:dispensing:corridor"] },
    { id: "suite-door", label: "a door from the suite to the corridor",
      edits: [{ from: "{ between ( sprayDrying sdOut );     type door; }",
                to: "{ between ( sprayDrying sdOut );     type door; }\n"
                  + "        { between ( sprayDrying corridor );  type door; }" }],
      expect: "a contained room opened directly on the corridor.  Its pressure "
        + "happens to be right (10 Pa below), and the door is still announced: "
        + "containment is about the airlock, not only the number.",
      findings: ["containmentAccess:sprayDrying:corridor"] },
  ],
  flows: [
    { id: "rejects-through-train", label: "rejects out through the product train",
      edits: [{ from: "path ( compression corridor wasteAL wasteRoom outside );",
                to: "path ( compression coating exitMAL packaging outside );" }],
      expect: "the waste now passes through three rooms the product passes "
        + "through: waste meets material in each.",
      findings: ["wasteMeetsMaterial:coating:rejects|product",
        "wasteMeetsMaterial:exitMAL:rejects|product",
        "wasteMeetsMaterial:packaging:rejects|product"] },
    { id: "operators-through-blending", label: "operators walk through blending",
      edits: [{ from: "path ( outside lobby gowning corridor compression );",
                to: "path ( outside lobby gowning corridor blending compression );" }],
      expect: "the operators now pass THROUGH the blending room, which the "
        + "product also passes through: the two flows cross there.",
      findings: ["flowCrossing:blending:operators|product"] },
    { id: "product-back", label: "product back through the corridor",
      edits: [{ from: "dispensing sdIn sprayDrying sdOut blending compression",
                to: "dispensing corridor blending compression" }],
      expect: "a route that skips the suite and uses the corridor: legal "
        + "doors, but the operators and the product now share the corridor, "
        + "and the rejects meet the product there too.",
      findings: ["flowCrossing:corridor:operators|product",
        "wasteMeetsMaterial:corridor:rejects|product"] },
  ],
  atex: [
    { id: "atex-8", label: "separation 8 m",
      edits: [{ from: "atexSeparation { distance 6 m;", to: "atexSeparation { distance 8 m;" }],
      expect: "the electrical room above the lobby is about 7.3 m from the "
        + "spray-drying suite (6 m east, 4 m north, 1 m up), now closer than "
        + "the declared separation.",
      findings: ["atexIgnition:sprayDrying:electrical"] },
    { id: "atex-undeclared", label: "no separation declared",
      edits: [{ from: "    atexSeparation { distance 6 m; source \"EduTool teaching building\"; "
                + "reason \"an author-set distance for the exercise, from no standard\"; }\n",
                to: "" }],
      expect: "a building with a hazardous-area room and an ignition room, "
        + "and no separation declared: the isolation is unchecked, and the "
        + "engine says so rather than pass it.",
      findings: ["atexSeparationUndeclared:teaching OSD block:"] },
  ],
  escape: [
    { id: "stair-lift", label: "the stair becomes a lift",
      edits: [{ from: "{ between ( lobby electrical );      type stair; }",
                to: "{ between ( lobby electrical );      type lift; }" }],
      expect: "the electrical room's only way down is now a lift, and a lift "
        + "is not an exit: no escape.",
      findings: ["noEscape:electrical:"] },
    { id: "stair-door", label: "the stair becomes a door",
      edits: [{ from: "{ between ( lobby electrical );      type stair; }",
                to: "{ between ( lobby electrical );      type door; }" }],
      expect: "REFUSED: a door joins two rooms of one floor, and these two are "
        + "on different floors.  A building that cannot exist is refused; a "
        + "building that breaks a rule is announced.",
      findings: [], refusal: "a door joins two rooms of ONE floor" },
  ],
};

/** The `[building]` lines of a run's log and any building refusal,
 *  verbatim: what the engine said, in its own words.  The engine writes its
 *  announcements to the ERROR stream, and the browser worker prefixes every
 *  such line with `[stderr] ` (public/workers/solverWorker.js); a native
 *  run's stderr has no prefix.  The prefix is the worker's, not the
 *  engine's, so it is removed -- otherwise the browser would match nothing
 *  and the page would say there was nothing to announce over a table of
 *  findings. */
export function buildingLines(log: string | null): string[] {
  if (!log) return [];
  return log.split("\n").map((l) => l.trimEnd())
    .map(engineText)
    .filter((l) => l.startsWith("[building] ") || l.includes("layoutDict building: "))
    //  The verbosity-1 summary heads the room table; it is a count, not a
    //  finding.
    .filter((l) => !/^\[building\] .*: \d+ room\(s\) on /.test(l));
}
