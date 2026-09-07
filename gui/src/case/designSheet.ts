/*---------------------------------------------------------------------------*\
  designSheet -- READ BACK the equipment specification sheet the RUN wrote.

  `SizingPass` publishes one Choupo dictionary per physical item at
  `design/<SECTOR>/<unit>/<equipmentTag>`, and since 2026-09-05 it arrives in
  the browser on its own `RunResult.designFiles` channel.  Nothing in the GUI
  read one back.  So ONE exchanger had TWO specification sheets on TWO input
  paths: the engine's, and the printable datasheet's, which built its design
  numbers from the rating unit's KPIs and the case's authored `geometry {}`.

  They can disagree BY CONSTRUCTION, and on the corpus they do -- the rating's
  area is the author's `operation.area`, while the sizer's `A` is Q/(U*LMTD)
  with a DIFFERENT author-set U and LMTD from `postDict`'s `designRules {}`.
  `src/core/PortRoles.H` names this shape in its own header: a second
  implementation of one question, agreeing today, drifting the first time.

  This module is the ONE reader.  It parses with the GUI's real dict parser,
  not a regex -- `check_design_sheet` states in its own blind-spot list that
  the day anything reads a sheet back, that reader is the check.  (It is still
  not the ENGINE's parser: `Dictionary::fromFile` has never read one either.)
\*---------------------------------------------------------------------------*/
import { parse, toJson } from "../dict/index.js";

/** One sizing entry, with the unit the SIZER declared where it computed the
 *  value.  The unit is read off the sheet and never supplied here: that is the
 *  whole point of `EquipmentSizing::set(key, value, unit)` being the one door,
 *  and it is why a new sizing key needs no change in this file. */
export interface DesignValue { key: string; value: number; unit: string; }

/** ONE PORT of the sheet's `inlets {}` / `outlets {}` block.
 *
 *  THE SHEET HAS ALWAYS CARRIED THESE AND NOTHING READ THEM until the column
 *  schematic did (2026-09-07): a drawing that colours a nozzle by whether it
 *  is the hot or the cold end needs the temperature the run wrote, and taking
 *  it from `runResult.streams` instead would be a SECOND route to a fact this
 *  file already has -- the exact shape this module exists to end.
 *
 *  `global` is the stream as the FLOWSHEET names it.  The mass flow is the
 *  engine's `StreamMass::F_massTotal` (fluid PLUS crystals), never
 *  `F * Sigma z_i MW_i`; that distinction is why the writer takes a thermo
 *  package at all, and re-deriving it here would throw it away. */
export interface DesignPort {
  /** Index within its block, as the sheet names it (`port0`, `port1`, ...). */
  key: string;
  /** The stream name the flowsheet uses, or "" when the sheet names none. */
  global: string;
  /** The port role word the engine wrote (`fixedValue`, `computed`,
   *  `interior`) -- passed through, never interpreted here. */
  bc: string;
  T?: number;      // K
  P?: number;      // Pa
  F?: number;      // kmol/s
  mdot?: number;   // kg/s
  vapourFraction?: number;
}

export interface DesignSheet {
  /** The unit as the ENGINE names it -- qualified (`CONCENTRATION.Evap2`) on
   *  a fractal case, bare on a flat one. */
  unit: string;
  /** The sector the flatten seam STAMPED, empty on a flat case.  Read, never
   *  recovered by splitting `unit` on a dot. */
  sector: string;
  equipment: string;
  /** WHICH PHYSICAL ITEM of its unit this sheet is -- `shell`, `trays`,
   *  `condenser`, `reboiler`, `refluxDrum`.  EMPTY where the unit realises a
   *  single item, which is every unit but a distillation column today, and
   *  which is why `equipment` alone identified a sheet until 2026-09-07. */
  item: string;
  material: string;
  /** The design argument the sizer stated, or `(not stated)` -- which the
   *  engine writes literally, and which this reader passes through unchanged
   *  so a forgotten basis stays visible rather than being defaulted away. */
  basis: string;
  sizing: DesignValue[];
  /** Inputs the sizer was not given and supplied itself.  Written by the
   *  engine ONLY when a default was actually taken, so an EMPTY list is the
   *  positive statement "this sizer assumed nothing". */
  assumed: string[];
  /** THE PORTS ARE THE UNIT'S, NOT THIS ITEM'S, and the sheet says so in its
   *  own comment: a column realises five items and the flowsheet wires only
   *  the unit, so every one of its five sheets carries the SAME three ports.
   *  A reader that presented them as this item's nozzles would be drawing a
   *  connection the engine does not model. */
  inlets: DesignPort[];
  outlets: DesignPort[];
}

/*  A scalar as `toJson` hands it over.  The dict grammar's named-unit form
 *  crosses as the string "<number> <unit>" and its bracket-dimension form as
 *  "[0 0 0 0 0] <number>"; a raw-SI scalar crosses as a number.  A sheet
 *  writes the bracket form for a dimensionless value ON PURPOSE (2026-09-04):
 *  omitting the unit would be indistinguishable from a forgotten one. */
function splitValue(v: unknown): { value: number; unit: string } | null {
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, unit: "" } : null;
  if (typeof v !== "string") return null;
  const dim = /^\[[-0-9\s]+\]\s*(\S+)$/.exec(v);
  if (dim) {
    const n = Number(dim[1]);
    return Number.isFinite(n) ? { value: n, unit: "-" } : null;
  }
  const m = /^(\S+)(?:\s+(.*\S))?\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? { value: n, unit: (m[2] ?? "").trim() } : null;
}

const word = (j: { [k: string]: unknown }, k: string): string => {
  const v = j[k];
  return typeof v === "string" ? v : "";
};

/** Read one `inlets {}` / `outlets {}` block.  Each `portN {}` sub-dict is a
 *  port; the order is the sheet's own, which is the order the engine wrote the
 *  unit's streams in, and it is preserved rather than sorted.
 *
 *  A key the sheet does not carry stays UNDEFINED -- never zero.  Zero is a
 *  temperature and a flow, and a nozzle drawn from a defaulted 0 K would be
 *  coloured, labelled and wrong. */
function readPorts(block: unknown): DesignPort[] {
  if (!block || typeof block !== "object" || Array.isArray(block)) return [];
  const ports: DesignPort[] = [];
  for (const [key, raw] of Object.entries(block as { [k: string]: unknown })) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const p = raw as { [k: string]: unknown };
    const num = (k: string): number | undefined => {
      const s = splitValue(p[k]);
      return s ? s.value : undefined;
    };
    ports.push({
      key,
      global: word(p, "global"),
      bc: word(p, "bc"),
      T: num("T"),
      P: num("P"),
      F: num("F"),
      mdot: num("mdot"),
      vapourFraction: num("vapourFraction"),
    });
  }
  return ports;
}

/** Parse one `design/.../<equipmentTag>` file.  Returns null for anything that
 *  is not a specification sheet -- the record identifies ITSELF
 *  (`recordType designSheet;`), which is the same rule the interior-state
 *  reader was given on 2026-09-06, and it is what keeps this reader from
 *  drawing some other dictionary that happens to sit under `design/`. */
export function parseDesignSheet(text: string): DesignSheet | null {
  let j: { [k: string]: unknown };
  try {
    j = toJson(parse(text, { sourceName: "designSheet" })) as { [k: string]: unknown };
  } catch {
    return null;   // an unparseable sheet is not a sheet; the caller says so
  }
  if (word(j, "recordType") !== "designSheet") return null;

  const sizing: DesignValue[] = [];
  const sz = j["sizing"];
  if (sz && typeof sz === "object" && !Array.isArray(sz))
    for (const [key, raw] of Object.entries(sz as { [k: string]: unknown })) {
      const s = splitValue(raw);
      if (s) sizing.push({ key, value: s.value, unit: s.unit });
    }

  const asm = j["assumed"];
  const assumed = Array.isArray(asm)
    ? asm.filter((a): a is string => typeof a === "string") : [];

  return {
    unit: word(j, "unit"),
    sector: word(j, "sector"),
    equipment: word(j, "equipment"),
    item: word(j, "item"),
    material: word(j, "material"),
    basis: word(j, "basis"),
    sizing,
    assumed,
    inlets: readPorts(j["inlets"]),
    outlets: readPorts(j["outlets"]),
  };
}

/** What the lookup found.  THREE STATES, NEVER TWO: a sheet, an ABSENCE, or a
 *  sheet that is there and could not be READ.  Collapsing the last two would
 *  report "the sizing pass did not run" about a run that sized the unit and
 *  wrote a file -- which is the 2026-09-06 rule that a check unable to look
 *  must not pass and must not fail either, but REFUSE by name. */
export interface DesignSheetLookup {
  sheet: DesignSheet | null;
  /** Files under `design/` this reader could not parse at all.  Not
   *  attributed to a unit: a file that will not parse cannot say whose it is,
   *  and the path is not evidence (see below). */
  unreadable: number;
  /** How many sheets of the SAME unit and the SAME equipment kind matched
   *  (2026-09-07).  A distillation column realises TWO shell-and-tube
   *  exchangers -- its condenser and its reboiler -- so (unit, equipment) no
   *  longer identifies a sheet on its own.  More than one match with no `item`
   *  named leaves `sheet` NULL and reports the count: picking whichever came
   *  first would draw the reboiler on a page headed "condenser", and a reader
   *  could not tell.  Zero or one is the ordinary case and reads as before. */
  ambiguous: number;
}

/** The sheet the run wrote for THIS unit and THIS equipment kind.
 *
 *  IDENTITY IS (sector, name), NEVER A NAME SPLIT.  The GUI holds a unit's
 *  LOCAL name; the engine names it qualified once it lives in a sector.  The
 *  sheet carries both -- its own `unit` and its own stamped `sector` -- so the
 *  qualified form is REBUILT from the stamp and compared, which is the
 *  2026-09-06 rule (`FlatUnit.H::topLevelSector`) read from the other end.
 *  Recovering the sector by splitting the last dot would be right on today's
 *  corpus and wrong for the first unit whose name carries a dot for another
 *  reason.
 *
 *  The PATH is not matched at all.  It encodes the same two facts the sheet
 *  states about itself, and a reader that agreed with the directory instead of
 *  the record would be checking the writer's filing rather than its answer. */
export function lookupDesignSheet(
  designFiles: { [relPath: string]: string } | undefined,
  unitName: string,
  equipment: string,
  item?: string,
): DesignSheetLookup {
  let unreadable = 0;
  const matches: DesignSheet[] = [];
  for (const [rel, text] of Object.entries(designFiles ?? {})) {
    if (!rel.startsWith("design/")) continue;
    const sheet = parseDesignSheet(text);
    if (!sheet) { unreadable++; continue; }
    if (sheet.equipment !== equipment) continue;
    if (item !== undefined && sheet.item !== item) continue;
    if (belongsTo(sheet, unitName)) matches.push(sheet);
  }
  //  MORE THAN ONE MATCH IS A REFUSAL, NOT A CHOICE.  This loop used to stop
  //  at the first hit, which was exact while every unit realised one item and
  //  became a silent coin-flip the day a column realised five.  A reader that
  //  drew one of two exchangers under the other one's name would be wrong in a
  //  way nothing on the page could reveal.
  return {
    sheet: matches.length === 1 ? (matches[0] ?? null) : null,
    unreadable,
    ambiguous: matches.length > 1 ? matches.length : 0,
  };
}

/** WHAT THE ITEM IDENTITY IS, in one place: a sheet belongs to `unitName` when
 *  it says so itself, bare or rebuilt from its OWN stamped sector.  Split out
 *  of `lookupDesignSheet` so the two callers -- the one that wants a single
 *  item and the one that wants every item of a unit -- cannot drift into two
 *  answers to the same question. */
function belongsTo(sheet: DesignSheet, unitName: string): boolean {
  return sheet.unit === unitName
    || (sheet.sector !== "" && `${sheet.sector}.${unitName}` === sheet.unit);
}

/** EVERY sheet the run wrote for one unit, in the order the files arrived.
 *
 *  A distillation column realises FIVE physical items and its datasheet draws
 *  the tower from two of them at once -- the `shell` and the `trays` -- so no
 *  lookup keyed on one (unit, equipment) pair can serve it.  This is that
 *  lookup: it says which items exist, and the caller decides what to do with
 *  each, which is what keeps the drawing honest about an item a case did not
 *  ask for (a column with no `refluxDrum {}` block simply has no drum sheet,
 *  and no drum is drawn). */
export function unitDesignSheets(
  designFiles: { [relPath: string]: string } | undefined,
  unitName: string,
): { sheets: DesignSheet[]; unreadable: number } {
  let unreadable = 0;
  const sheets: DesignSheet[] = [];
  for (const [rel, text] of Object.entries(designFiles ?? {})) {
    if (!rel.startsWith("design/")) continue;
    const sheet = parseDesignSheet(text);
    if (!sheet) { unreadable++; continue; }
    if (belongsTo(sheet, unitName)) sheets.push(sheet);
  }
  return { sheets, unreadable };
}

/** The sheet alone, for a caller with nothing to say about an unreadable one. */
export function findDesignSheet(
  designFiles: { [relPath: string]: string } | undefined,
  unitName: string,
  equipment: string,
  item?: string,
): DesignSheet | null {
  return lookupDesignSheet(designFiles, unitName, equipment, item).sheet;
}
