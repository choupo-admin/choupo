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
  columnControlRecords — the READER for data/standards/heuristics/.

  ZERO HEURISTICS IN TYPESCRIPT.  This file contains no rule of thumb, no
  threshold, no preference and no wiring diagram: it PARSES records and refuses
  malformed ones.  Every sentence the column-control tool renders comes off a
  `.dat` in the catalogue, exactly as every curve in the sibling tools comes off
  an engine run.  The rule is the standing "zero physics in TS" one applied to
  guidance, and it exists for the same reason: a claim hard-coded in a component
  has no author, no validity domain and no way to be checked.

  WHY A REFUSAL LIST RATHER THAN A THROW.  A record this reader cannot use is
  NAMED on screen, not dropped.  Throwing at module scope would blank the tool
  and hide the defect; dropping silently would leave the tool looking complete
  while a claim it was meant to show had vanished.  Both are the failure this
  project has paid for repeatedly, so the third option is the one taken: the
  tool renders what it could read AND what it could not, with the reason.

  THE ONE RULE THAT REFUSES ENTRY, in the ruling's own words: an UNCITED
  heuristic is refused.  A record declaring `authority primaryLiterature` with
  no author and no publication does not render — inventing a citation converts
  unsourced into falsely sourced, and a record with a missing one must be
  visibly missing rather than quietly present.

  THE SECOND AUTHORITY IS NOT A LOOPHOLE.  `authority choupoDesignGuide` marks a
  claim quoted from Choupo's own signed guide, and the tool renders it
  DIFFERENTLY from a cited one.  A guide is signed; a record is cited — and a
  reader must be able to see which of the two they are looking at.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../../dict/index.js";
import type { JsonValue } from "../../dict/json.js";

// ---- The record shapes ------------------------------------------------------

/** How well the citation itself is known.  Machine-visible, so a reader never
 *  has to trust the font: `checkedCopy` was read in the source, and
 *  `searchIndexQuotation` was returned by a literature search over the
 *  publisher's or author's copy WITHOUT the document being opened.
 *  `generalKnowledge` is in the vocabulary so the state can be declared rather
 *  than hidden; no shipped record uses it, and the tool marks one loudly. */
export type Verification =
  | "checkedCopy" | "searchIndexQuotation" | "generalKnowledge";

export interface HeuristicSource {
  author: string;
  year: number | null;
  title: string;
  publication: string;
  /** Where in the source the claim sits — a page when one can honestly be
   *  given, and otherwise a statement of what could NOT be located. */
  locus: string;
  verification: Verification;
  verificationNote: string;
}

export type Authority = "primaryLiterature" | "choupoDesignGuide";
export type Stance = "favours" | "warnsAgainst" | "conditional" | "neutral";

export interface HeuristicStance {
  structure: string;
  stance: Stance;
}

export interface Heuristic {
  /** The record's file stem — its identity on disk. */
  file: string;
  name: string;
  claim: string;
  validity: string;
  notCovered: string;
  authority: Authority;
  source: HeuristicSource;
  stances: HeuristicStance[];
  topics: string[];
  /** Other records this one disagrees with.  Displayed, never resolved. */
  conflictsWith: string[];
}

export interface ControlLoop {
  controlled: string;
  measuredAt: string;
  manipulates: string;
  kind: "inventory" | "quality" | "fixedFlow";
  /** A ratio loop's other member (the (L/D)(V/B) scheme). */
  ratioWith?: string;
}

export interface ControlStructure {
  name: string;
  label: string;
  summary: string;
  freeForComposition: string[];
  loops: ControlLoop[];
}

export interface HeuristicsCatalogue {
  structures: ControlStructure[];
  heuristics: Heuristic[];
  /** The measurement points and valves the structure catalogue declares — the
   *  drawing may place nothing the record did not name. */
  measurementPoints: string[];
  valves: string[];
  /** Every record that could not be used, with the reason.  Rendered. */
  refusals: string[];
}

// ---- Reading the catalogue --------------------------------------------------
// Vite inlines each .dat as a raw string at build time — the identical mechanism
// case/catalogue.ts uses to reach data/standards/components at the ../../../
// depth (one more level up from ui/methods/).

const RAW = import.meta.glob("../../../../data/standards/heuristics/*.dat", {
  query: "?raw",
  import: "default",
  eager: true,
}) as { [path: string]: string };

const stem = (path: string): string =>
  path.split("/").pop()!.replace(/\.dat$/, "");

const asString = (v: JsonValue | undefined): string =>
  typeof v === "string" ? v : "";

const asWordList = (v: JsonValue | undefined): string[] =>
  Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : [];

const asDictList = (v: JsonValue | undefined): { [k: string]: JsonValue }[] =>
  Array.isArray(v)
    ? v.filter((e): e is { [k: string]: JsonValue } =>
      typeof e === "object" && e !== null && !Array.isArray(e))
    : [];

const VERIFICATIONS: Verification[] =
  ["checkedCopy", "searchIndexQuotation", "generalKnowledge"];
const STANCES: Stance[] = ["favours", "warnsAgainst", "conditional", "neutral"];
const LOOP_KINDS = ["inventory", "quality", "fixedFlow"] as const;

/** Read one `recordType controlHeuristic` record.  Returns the heuristic, or a
 *  refusal string naming the file and what is missing. */
function readHeuristic(
  file: string, j: { [k: string]: JsonValue },
): Heuristic | string {
  const name = asString(j["name"]) || file;
  const claim = asString(j["claim"]);
  if (!claim)
    return `${file}: no \`claim\` — a heuristic that cannot be stated in one `
      + "sentence is a chapter, not a rule.";

  const authorityWord = asString(j["authority"]);
  if (authorityWord !== "primaryLiterature"
    && authorityWord !== "choupoDesignGuide")
    return `${file}: \`authority\` is '${authorityWord || "absent"}' — it must `
      + "be primaryLiterature (cited) or choupoDesignGuide (Choupo's own "
      + "signed statement).";
  const authority: Authority = authorityWord;

  const s = (typeof j["source"] === "object" && j["source"] !== null
    && !Array.isArray(j["source"]))
    ? j["source"] as { [k: string]: JsonValue }
    : null;
  if (!s) return `${file}: no \`source {}\` block.`;

  const author = asString(s["author"]);
  const publication = asString(s["publication"]);
  //  THE RULE THAT REFUSES ENTRY.  An uncited claim rendered beside a computed
  //  number reads as institutional fact; a missing citation must therefore be
  //  visibly missing, never quietly absent.
  if (authority === "primaryLiterature" && (!author || !publication))
    return `${file}: \`authority primaryLiterature\` with no `
      + `${!author ? "author" : "publication"} — an uncited heuristic is `
      + "refused entry.";

  const verificationWord = asString(s["verification"]) as Verification;
  if (!VERIFICATIONS.includes(verificationWord))
    return `${file}: \`source.verification\` is `
      + `'${verificationWord || "absent"}' — it must be one of `
      + `${VERIFICATIONS.join(" / ")}, because how well a citation is known is `
      + "not something a reader should have to guess.";

  const stances: HeuristicStance[] = [];
  for (const e of asDictList(j["stances"])) {
    const structure = asString(e["structure"]);
    const stance = asString(e["stance"]) as Stance;
    if (!structure || !STANCES.includes(stance))
      return `${file}: a \`stances\` entry names structure `
        + `'${structure || "?"}' with stance '${stance || "?"}' — both are `
        + "required and the stance must be one of " + STANCES.join(" / ") + ".";
    stances.push({ structure, stance });
  }
  const topics = asWordList(j["topics"]);
  if (stances.length === 0 && topics.length === 0)
    return `${file}: neither \`stances\` nor \`topics\` — a claim that speaks `
      + "to no structure and no question renders nowhere.";

  return {
    file, name, claim,
    validity: asString(j["validity"]),
    notCovered: asString(j["notCovered"]),
    authority,
    source: {
      author, publication,
      year: typeof s["year"] === "number" ? s["year"] : null,
      title: asString(s["title"]),
      locus: asString(s["locus"]),
      verification: verificationWord,
      verificationNote: asString(s["verificationNote"]),
    },
    stances, topics,
    conflictsWith: asWordList(j["conflictsWith"]),
  };
}

/** Read the `recordType controlStructureCatalogue` file.  Returns the
 *  structures plus the declared drawing vocabulary, or a refusal. */
function readStructures(
  file: string, j: { [k: string]: JsonValue },
): { structures: ControlStructure[]; points: string[]; valves: string[] } | string {
  const points = asWordList(j["measurementPoints"]);
  const valves = asWordList(j["valves"]);
  if (points.length === 0 || valves.length === 0)
    return `${file}: the structure catalogue must declare both `
      + "`measurementPoints` and `valves` — a loop may only name something the "
      + "record itself introduced, so a signal line is never drawn to nowhere.";

  const structures: ControlStructure[] = [];
  for (const e of asDictList(j["structures"])) {
    const name = asString(e["name"]);
    if (!name) return `${file}: a structure with no \`name\`.`;
    const loops: ControlLoop[] = [];
    for (const l of asDictList(e["loops"])) {
      const controlled = asString(l["controlled"]);
      const measuredAt = asString(l["measuredAt"]);
      const manipulates = asString(l["manipulates"]);
      const kind = asString(l["kind"]) as ControlLoop["kind"];
      if (!controlled || !LOOP_KINDS.includes(kind))
        return `${file}: structure ${name} has a loop with no \`controlled\` `
          + `or an unknown \`kind\` ('${kind || "absent"}').`;
      if (!points.includes(measuredAt))
        return `${file}: structure ${name} measures '${controlled}' at `
          + `'${measuredAt}', which is not in \`measurementPoints\`.`;
      if (!valves.includes(manipulates))
        return `${file}: structure ${name} drives '${manipulates}', which is `
          + "not in `valves`.";
      const ratioWith = asString(l["ratioWith"]);
      loops.push(ratioWith
        ? { controlled, measuredAt, manipulates, kind, ratioWith }
        : { controlled, measuredAt, manipulates, kind });
    }
    if (loops.length === 0)
      return `${file}: structure ${name} declares no loops.`;
    structures.push({
      name,
      label: asString(e["label"]) || name,
      summary: asString(e["summary"]),
      freeForComposition: asWordList(e["freeForComposition"]),
      loops,
    });
  }
  if (structures.length === 0)
    return `${file}: no \`structures\` — the catalogue is empty.`;
  return { structures, points, valves };
}

/** Parse the whole heuristics home ONCE.  Pure over the bundled raw text, so
 *  the node test runner reads exactly what the browser does. */
export function readHeuristicsCatalogue(
  raw: { [path: string]: string } = RAW,
): HeuristicsCatalogue {
  const structures: ControlStructure[] = [];
  const heuristics: Heuristic[] = [];
  const refusals: string[] = [];
  let measurementPoints: string[] = [];
  let valves: string[] = [];

  for (const path of Object.keys(raw).sort()) {
    const file = stem(path);
    let j: { [k: string]: JsonValue };
    try {
      j = toJson(parse(raw[path]!)) as { [k: string]: JsonValue };
    } catch (e) {
      refusals.push(`${file}: does not parse as a Choupo dict `
        + `(${e instanceof Error ? e.message : String(e)}).`);
      continue;
    }
    const recordType = asString(j["recordType"]);
    if (recordType === "controlHeuristic") {
      const r = readHeuristic(file, j);
      if (typeof r === "string") refusals.push(r); else heuristics.push(r);
    } else if (recordType === "controlStructureCatalogue") {
      const r = readStructures(file, j);
      if (typeof r === "string") { refusals.push(r); continue; }
      structures.push(...r.structures);
      measurementPoints = r.points;
      valves = r.valves;
    } else {
      refusals.push(`${file}: unknown \`recordType\` `
        + `'${recordType || "absent"}' — this reader knows controlHeuristic `
        + "and controlStructureCatalogue.");
    }
  }

  //  A stance naming a structure that does not exist would render as a claim
  //  about nothing; a conflict naming a record that does not exist would show
  //  a disagreement with an absence.  Both are refused AFTER everything is
  //  read, because the order of the files must not decide the answer.
  const known = new Set(structures.map((s) => s.name));
  const byName = new Set(heuristics.map((h) => h.name));
  const kept: Heuristic[] = [];
  for (const h of heuristics) {
    const badStance = h.stances.find((s) => !known.has(s.structure));
    if (badStance) {
      refusals.push(`${h.file}: takes a stance on structure `
        + `'${badStance.structure}', which the structure catalogue does not `
        + "declare.");
      continue;
    }
    const badConflict = h.conflictsWith.find((c) => !byName.has(c));
    if (badConflict) {
      refusals.push(`${h.file}: declares a conflict with '${badConflict}', `
        + "which is not a record here — a disagreement with an absence.");
      continue;
    }
    kept.push(h);
  }

  return {
    structures, heuristics: kept, measurementPoints, valves,
    refusals: refusals.sort(),
  };
}

// ---- Selection helpers (pure, so the tests can reach them) ------------------

/** The heuristics that speak to one structure, by name.  A record with no
 *  stance on it is NOT included: silence is not a neutral opinion, and padding
 *  a structure's card with rules that never mentioned it would be the tool
 *  inventing relevance. */
export function heuristicsForStructure(
  cat: HeuristicsCatalogue, structure: string,
): Heuristic[] {
  return cat.heuristics.filter(
    (h) => h.stances.some((s) => s.structure === structure));
}

/** The heuristics that speak to one topic (traySelection, sensorPlacement,
 *  inventory, interaction). */
export function heuristicsForTopic(
  cat: HeuristicsCatalogue, topic: string,
): Heuristic[] {
  return cat.heuristics.filter((h) => h.topics.includes(topic));
}

/** The stance a record takes on one structure, or null when it takes none. */
export function stanceOn(h: Heuristic, structure: string): Stance | null {
  return h.stances.find((s) => s.structure === structure)?.stance ?? null;
}

/** The DISAGREEMENTS visible from one structure's card: pairs of records that
 *  both speak to it and name each other in `conflictsWith`.  Each pair is
 *  returned once, in catalogue order — the tool shows both sides and resolves
 *  neither. */
export function conflictPairs(
  cat: HeuristicsCatalogue, structure: string,
): [Heuristic, Heuristic][] {
  const here = heuristicsForStructure(cat, structure);
  const out: [Heuristic, Heuristic][] = [];
  for (let i = 0; i < here.length; ++i) {
    for (let k = i + 1; k < here.length; ++k) {
      const a = here[i]!, b = here[k]!;
      if (a.conflictsWith.includes(b.name) || b.conflictsWith.includes(a.name))
        out.push([a, b]);
    }
  }
  return out;
}
