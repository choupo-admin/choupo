/*---------------------------------------------------------------------------*\
  UNIFAC group decompositions — the molecular-structure table the Property
  Explorer injects into a synthesized `activityModel { model UNIFAC; groups }`
  block so the PREDICTIVE activity model can estimate γ without any fitted
  binary pairs (Vítor's directive: a missing pair → estimate by groups, else
  ideal).

  This is structural DATA, not physics: each entry is a compound's standard
  UNIFAC (original) subgroup decomposition (Fredenslund/Hansen tables) — the
  same assignment a textbook gives.  The engine still computes every γ from
  data/standards/unifac/{groups,interactions}.dat; this map only says which
  subgroups each molecule is made of.  A compound NOT in this map is simply
  omitted from the groups block, and UNIFAC then treats it as ideal (γ=1) for
  that component — the graceful fallback, never a crash.

  Coverage is bounded by the bundled subgroup/interaction set (CH2 · ACH · OH ·
  H2O main groups): alkanes, aromatics (unsubstituted ring carbons), alcohols
  and water.  Extend here as data/standards/unifac/ grows.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";

export interface UnifacGroup { group: string; count: number; }

/** name -> standard UNIFAC subgroup decomposition. Only compounds whose groups
 *  are all covered by data/standards/unifac/groups.dat are listed. */
export const UNIFAC_GROUPS: Record<string, UnifacGroup[]> = {
  water:   [{ group: "H2O", count: 1 }],
  ethanol: [{ group: "CH3", count: 1 }, { group: "CH2", count: 1 }, { group: "OH", count: 1 }],
  nButanol: [{ group: "CH3", count: 1 }, { group: "CH2", count: 3 }, { group: "OH", count: 1 }],
  nHexane: [{ group: "CH3", count: 2 }, { group: "CH2", count: 4 }],
  benzene: [{ group: "ACH", count: 6 }],
  // Alkanes/cycloalkanes — only the CH2 main group, whose interactions with
  // H2O/OH/ACH are all present in interactions.dat, so these are FULLY backed
  // (genuinely non-ideal with water/alcohols/aromatics, not a silent ideal).
  C4H10:      [{ group: "CH3", count: 2 }, { group: "CH2", count: 2 }],
  nPentane:   [{ group: "CH3", count: 2 }, { group: "CH2", count: 3 }],
  isopentane: [{ group: "CH3", count: 3 }, { group: "CH2", count: 1 }, { group: "CH", count: 1 }],
  nHeptane:   [{ group: "CH3", count: 2 }, { group: "CH2", count: 5 }],
  C8H18:      [{ group: "CH3", count: 2 }, { group: "CH2", count: 6 }],
  cyclohexane:[{ group: "CH2", count: 6 }],
};

/** Parse a case-local component .dat's optional `unifac { groups ( {group;count;} ) }`
 *  block. Returns null if absent/malformed — NEVER throws. Authoring stays on
 *  disk (file-first credo); this just lets the Explorer read what the student wrote. */
export function unifacGroupsFromDat(body: string): UnifacGroup[] | null {
  let j: Record<string, unknown>;
  try { j = toJson(parse(body)) as Record<string, unknown>; } catch { return null; }
  const u = j.unifac as { groups?: unknown } | undefined;
  if (!u || typeof u !== "object") return null;
  const groups = u.groups;
  if (!Array.isArray(groups)) return null;
  const out: UnifacGroup[] = [];
  for (const g of groups) {
    if (g && typeof g === "object"
        && typeof (g as UnifacGroup).group === "string"
        && typeof (g as UnifacGroup).count === "number")
      out.push({ group: (g as UnifacGroup).group, count: (g as UnifacGroup).count });
  }
  return out.length ? out : null;
}

/** name -> UNIFAC groups, harvested from the open case's case-local
 *  constant/components/*.dat (those that declare a `unifac {}` block). */
export function buildLocalUnifac(rawFiles?: { [relPath: string]: string }): Record<string, UnifacGroup[]> {
  const out: Record<string, UnifacGroup[]> = {};
  if (!rawFiles) return out;
  for (const [path, body] of Object.entries(rawFiles)) {
    if (!/(^|\/)constant\/components\/[^/]+\.dat$/.test(path)) continue;
    let j: Record<string, unknown>;
    try { j = toJson(parse(body)) as Record<string, unknown>; } catch { continue; }
    const name = typeof j.name === "string" ? j.name : "";
    if (!name) continue;
    const g = unifacGroupsFromDat(body);
    if (g) out[name] = g;
  }
  return out;
}

/** Does this compound have a UNIFAC decomposition? Case-local declarations
 *  (`local`) are consulted first, the bundled standard map as fallback. */
export function hasUnifacGroups(name: string, local: Record<string, UnifacGroup[]> = {}): boolean {
  return Object.prototype.hasOwnProperty.call(local, name)
      || Object.prototype.hasOwnProperty.call(UNIFAC_GROUPS, name);
}

/** Groups for a set of components (only those with a decomposition), as the
 *  JSON the dict serializer turns into `groups { <comp> ( {group;count;} ) }`.
 *  Case-local declarations override the bundled standard map. */
export function unifacGroupsBlock(
  names: string[],
  local: Record<string, UnifacGroup[]> = {},
): Record<string, { group: string; count: number }[]> {
  const out: Record<string, { group: string; count: number }[]> = {};
  for (const n of names) {
    const g = local[n] ?? UNIFAC_GROUPS[n];
    if (g) out[n] = g.map((x) => ({ group: x.group, count: x.count }));
  }
  return out;
}
