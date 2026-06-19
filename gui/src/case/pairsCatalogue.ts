/*---------------------------------------------------------------------------*\
  Binary-pair catalogue manifest — a build-time list of WHICH activity-model
  binary pairs the frozen catalogue ships, so the Property Explorer can tell the
  student whether a chosen pair is curated (→ azeotropy/non-ideality) or absent
  (→ the engine defaults that pair to ideal).

  Mirrors catalogue.ts: Vite's import.meta.glob inlines each
  data/standards/binaryPairs/{NRTL,Wilson}/*.dat as raw text, parsed only to
  HARVEST the two component names + the model — NO physics, no parameters.  The
  engine still reads the real .dat; this is for the UI note only.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";

export interface PairEntry { model: string; a: string; b: string; }

const NRTL_RAW = import.meta.glob("../../../data/standards/binaryPairs/NRTL/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const WILSON_RAW = import.meta.glob("../../../data/standards/binaryPairs/Wilson/*.dat", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

function harvest(raw: Record<string, string>, model: string): PairEntry[] {
  const out: PairEntry[] = [];
  for (const body of Object.values(raw)) {
    try {
      const j = toJson(parse(body));
      const comps = j.components;
      if (Array.isArray(comps) && comps.length === 2)
        out.push({ model, a: String(comps[0]), b: String(comps[1]) });
    } catch { /* skip unparseable */ }
  }
  return out;
}

export const PAIRS: PairEntry[] = [
  ...harvest(NRTL_RAW, "NRTL"),
  ...harvest(WILSON_RAW, "Wilson"),
];

/** Is there a curated pair for {a,b} under this activity model? (order-free) */
export function hasPair(model: string, a: string, b: string): boolean {
  return PAIRS.some((p) => p.model === model
    && ((p.a === a && p.b === b) || (p.a === b && p.b === a)));
}
