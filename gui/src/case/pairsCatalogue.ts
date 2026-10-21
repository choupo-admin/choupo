/*---------------------------------------------------------------------------*\
  Binary-pair catalogue manifest — a build-time list of WHICH activity-model
  binary pairs the frozen catalogue ships, so the Property Explorer can tell the
  student whether a chosen pair is curated (→ azeotropy/non-ideality) or absent
  (→ the engine defaults that pair to ideal).

  Mirrors catalogue.ts: Vite's import.meta.glob inlines each
  data/standards/parameters/{NRTL,Wilson,UNIQUAC}/*.dat as raw text, parsed to
  HARVEST the two component names, the model, the record's `parameters {}`
  block and its provenance words — NO physics.  The engine still reads the
  real .dat; `hasPair()` is for the UI note only.

  THREE TIERS SINCE 2026-10-20 (DEV.md 4c C117).  The Evidence view of the
  Explorer needs EVERY parameter record for a pair as a CANDIDATE MODEL, and a
  record's tier is part of its identity: the standards NRTL record for
  methanol-water and the copy a curation case mirrors into its own
  `constant/parameters/` are the same numbers in two places, and a student's
  own refit in `data/local/parameters/` is a third record of the same model.
  They are DISTINCT entries, each labelled by tier and provenance, never
  merged — "which NRTL?" is exactly the question the view exists to answer.
  `PAIRS` and `hasPair()` keep their meaning (the STANDARDS tier only: "is a
  curated pair shipped") so every reader of the note is unchanged.

  The `parameters {}` block is carried VERBATIM (scalars and words), because
  the Evidence view inlines it into a synthesised thermoPhysPropDict
  (`binaryParameters { a-b { ... } }`, the grammar every corpus case uses) —
  so a private record works on the hosted site with no file path, and the
  engine prices the pair exactly as the record wrote it.
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";
import localPairsRaw from "virtual:local-pair-parameters";

export type PairTier = "standards" | "local" | "case";

export interface PairProvenance {
  /** `provenance.origin`: `literature`, `fitted`, ... ("" when undeclared) */
  origin: string;
  reviewStatus: string;
  /** the case a Choupo-regressed pair names (`fittedInCase`), else "" */
  fittedInCase: string;
  /** `citation` or `source`, whichever the record carries */
  citation: string;
}

export interface PairEntry {
  model: string;
  a: string;
  b: string;
  tier: PairTier;
  /** the record's path as its tier spells it */
  file: string;
  /** the filename stem (`methanol-water`) */
  stem: string;
  /** the record's `parameters {}` block: scalars and words, verbatim */
  parameters: JsonDict;
  provenance: PairProvenance;
}

//  parameters/<model>/ is the pairs' home since Migration 2 (2026-07-16).
//  This file globbed the RETIRED data/standards/binaryPairs/ for six weeks
//  after that: hasPair() was permanently false, so the Explorer and the
//  McCabe tool told the student "no curated NRTL pair covers ethanol-water"
//  (the pair exists) and silently switched their model pick to UNIFAC.
//  An empty glob raises no error -- which is exactly how it stayed unseen.
const NRTL_RAW = import.meta.glob("../../../data/standards/parameters/NRTL/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const WILSON_RAW = import.meta.glob("../../../data/standards/parameters/Wilson/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const UNIQUAC_RAW = import.meta.glob("../../../data/standards/parameters/UNIQUAC/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

function str(v: JsonValue | undefined): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Parse one pair record.  `modelHint` is the folder the file sits in; the
 *  record's own `model` word wins when it declares one.  Null when the text
 *  does not parse or names no two components. */
export function readPairRecord(raw: string, where: {
  file: string; tier: PairTier; modelHint: string;
}): PairEntry | null {
  let j: JsonDict;
  try { j = toJson(parse(raw)); } catch { return null; }
  const comps = j.components;
  if (!Array.isArray(comps) || comps.length !== 2) return null;
  const model = str(j.model) || where.modelHint;
  if (!model) return null;
  const parameters: JsonDict = {};
  const pb = j.parameters;
  if (typeof pb === "object" && pb !== null && !Array.isArray(pb)) {
    for (const [k, v] of Object.entries(pb as JsonDict))
      if (typeof v === "number" || typeof v === "string") parameters[k] = v;
  }
  const pv = j.provenance;
  const pd = typeof pv === "object" && pv !== null && !Array.isArray(pv) ? (pv as JsonDict) : null;
  return {
    model, a: String(comps[0]), b: String(comps[1]),
    tier: where.tier, file: where.file,
    stem: where.file.split("/").pop()!.replace(/\.dat$/, ""),
    parameters,
    provenance: {
      origin: pd ? str(pd.origin) : "",
      reviewStatus: pd ? str(pd.reviewStatus) : "",
      fittedInCase: pd ? str(pd.fittedInCase) : "",
      citation: pd ? (str(pd.citation) || str(pd.source)) : "",
    },
  };
}

function harvest(raw: Record<string, string>, model: string): PairEntry[] {
  const out: PairEntry[] = [];
  for (const [path, body] of Object.entries(raw)) {
    const file = path.replace(/^.*?data\/standards\//, "data/standards/");
    const e = readPairRecord(body, { file, tier: "standards", modelHint: model });
    if (e) out.push(e);
  }
  return out;
}

/** The STANDARDS tier -- the curated pairs the catalogue ships. */
export const PAIRS: PairEntry[] = [
  ...harvest(NRTL_RAW, "NRTL"),
  ...harvest(WILSON_RAW, "Wilson"),
  ...harvest(UNIQUAC_RAW, "UNIQUAC"),
];

function samePair(p: PairEntry, a: string, b: string): boolean {
  return (p.a === a && p.b === b) || (p.a === b && p.b === a);
}

/** Is there a CURATED (standards) pair for {a,b} under this activity model?
 *  (order-free).  Unchanged meaning: the private and case tiers do not make
 *  a pair "curated". */
export function hasPair(model: string, a: string, b: string): boolean {
  return PAIRS.some((p) => p.model === model && samePair(p, a, b));
}

let LOCAL_PAIRS: PairEntry[] | null = null;
/** The private tier `data/local/parameters/<MODEL>/*.dat` -- empty on a clean
 *  checkout and on the hosted site. */
export function localPairs(): PairEntry[] {
  if (LOCAL_PAIRS) return LOCAL_PAIRS;
  const out: PairEntry[] = [];
  for (const e of localPairsRaw) {
    const folder = e.file.includes("/") ? e.file.split("/")[0]! : "";
    const p = readPairRecord(e.body, {
      file: `data/local/parameters/${e.file}`, tier: "local", modelHint: folder,
    });
    if (p) out.push(p);
  }
  LOCAL_PAIRS = out;
  return out;
}

const CASE_PAIR_RE = /(?:^|\/)constant\/parameters\/([^/]+)\/[^/]+\.dat$/;
/** The OPEN case's pair records (`constant/parameters/<MODEL>/*.dat`
 *  anywhere in its tree; a UNIFAC `groups.dat` names no two components and
 *  drops out by itself). */
export function casePairs(rawFiles?: { [relPath: string]: string }): PairEntry[] {
  if (!rawFiles) return [];
  const out: PairEntry[] = [];
  for (const [path, body] of Object.entries(rawFiles)) {
    const m = CASE_PAIR_RE.exec(path);
    if (!m) continue;
    const p = readPairRecord(body, { file: path, tier: "case", modelHint: m[1]! });
    if (p) out.push(p);
  }
  return out;
}

/** EVERY parameter record for the pair {a,b}, in every tier, each a distinct
 *  entry: standards first, then the private tier, then the open case. */
export function pairRecordsFor(a: string, b: string,
                               rawFiles?: { [relPath: string]: string }): PairEntry[] {
  return [...PAIRS, ...localPairs(), ...casePairs(rawFiles)]
    .filter((p) => samePair(p, a, b));
}

/** A short, honest label of where a record came from, for a candidate list:
 *  the tier, then the origin word and the review status the record declares. */
export function pairProvenanceLabel(p: PairEntry): string {
  const bits: string[] = [];
  if (p.provenance.origin) bits.push(p.provenance.origin);
  if (p.provenance.reviewStatus) bits.push(p.provenance.reviewStatus);
  if (p.provenance.fittedInCase)
    bits.push(`fitted in ${p.provenance.fittedInCase.split("/").pop()}`);
  const tier = p.tier === "standards" ? "standards" : p.tier === "local" ? "data/local" : "open case";
  return bits.length ? `${tier} · ${bits.join(" · ")}` : tier;
}
