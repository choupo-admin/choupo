/*---------------------------------------------------------------------------*\
  Binary-pair catalogue manifest — a build-time list of WHICH activity-model
  binary pairs the frozen catalogue ships, so the Property Explorer can tell the
  student whether a chosen pair is curated (→ azeotropy/non-ideality) or absent
  (→ the engine REFUSES that model for this selection, and has since the
  problem-divergence ruling of 2026-08-11; it runs the pair as ideal only where
  an authored case AUTHORISES the substitution, which the Explorer's
  synthesized case never does).

  Mirrors catalogue.ts: Vite's import.meta.glob inlines each
  data/standards/parameters/{NRTL,Wilson,UNIQUAC}/*.dat as raw text, parsed only to
  HARVEST the two component names + the model — NO physics, no parameters.  The
  engine still reads the real .dat; this is for the UI note only.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";

export interface PairEntry {
  model: string;
  a: string;
  b: string;
  /** The record's own `provenance { origin ...; }` word, "" when it declares
   *  none.  A CURATED pair and a pair whose coefficients ARE the ideality
   *  assumption are different claims, and the Explorer drew a green tick on
   *  both: data/standards/parameters/NRTL/benzene-toluene.dat says
   *  `origin assumed;` beside four null energies, so the student read
   *  "curated non-ideal pair" and saw two lines flat at exactly 1.000. */
  origin: string;
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

function harvest(raw: Record<string, string>, model: string): PairEntry[] {
  const out: PairEntry[] = [];
  for (const body of Object.values(raw)) {
    try {
      const j = toJson(parse(body));
      const comps = j.components;
      const prov = j.provenance as { origin?: unknown } | undefined;
      if (Array.isArray(comps) && comps.length === 2)
        out.push({
          model, a: String(comps[0]), b: String(comps[1]),
          origin: typeof prov?.origin === "string" ? prov.origin : "",
        });
    } catch { /* skip unparseable */ }
  }
  return out;
}

export const PAIRS: PairEntry[] = [
  ...harvest(NRTL_RAW, "NRTL"),
  ...harvest(WILSON_RAW, "Wilson"),
  ...harvest(UNIQUAC_RAW, "UNIQUAC"),
];

/** The catalogue's record for {a,b} under this activity model, or undefined.
 *  Order-free: a pair record names its components in one order and a student
 *  selects them in either. */
export function pairEntry(model: string, a: string, b: string): PairEntry | undefined {
  return PAIRS.find((p) => p.model === model
    && ((p.a === a && p.b === b) || (p.a === b && p.b === a)));
}

/** Is there a curated pair for {a,b} under this activity model? (order-free) */
export function hasPair(model: string, a: string, b: string): boolean {
  return pairEntry(model, a, b) !== undefined;
}
